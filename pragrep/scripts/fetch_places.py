#!/usr/bin/env python3
"""Download Prague's parts of town and public transport stops from
OpenStreetMap (Overpass API) and write compact GeoJSON files for the page.

Output:
  data/areas.geojson – one feature per part of town, properties
      {"name", "k", "lx", "ly", "bbox"}:
      k = "ku"  katastrální území (boundary=cadastral), polygon
          "mc"  městská část (administrative, admin_level 9), polygon
          "ct"  čtvrť: smaller administrative part (admin_level 10), polygon,
                or a named place point (place=neighbourhood/quarter/suburb)
                whose name no polygon already has
      lx, ly = where the name tag goes (inside the area); bbox = [w, s, e, n].
  data/stops.geojson – one feature per stop *name* (all platforms and stop
      positions with that name merged into a MultiPoint), properties
      {"name", "m", "lx", "ly", "bbox"}; m = modes, e.g. "metro,tram,bus".

Polygons are assembled from the relations by osmium (brew install osmium-tool).

Usage:  python3 scripts/fetch_places.py
"""

import json
import math
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_AREAS = ROOT / "data" / "areas.geojson"
OUT_STOPS = ROOT / "data" / "stops.geojson"

# OSM relation 435514 = Hlavní město Praha. Overpass area id = 3600000000 + relation id.
PRAGUE_AREA = 3600435514

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Area relations with everything osmium needs to build their polygons.
AREAS_QUERY = f"""
[out:xml][timeout:300];
area({PRAGUE_AREA})->.prague;
(
  rel(area.prague)["boundary"="cadastral"]["name"];
  rel(area.prague)["boundary"="administrative"]["admin_level"~"^(9|10)$"]["name"];
)->.r;
.r out body;
.r >;
out skel qt;
"""

PLACES_QUERY = f"""
[out:json][timeout:120];
area({PRAGUE_AREA})->.prague;
node(area.prague)["place"~"^(neighbourhood|quarter|suburb)$"]["name"];
out body;
"""

STOPS_QUERY = f"""
[out:json][timeout:300];
area({PRAGUE_AREA})->.prague;
(
  node(area.prague)["highway"="bus_stop"]["name"];
  node(area.prague)["railway"~"^(tram_stop|station|halt)$"]["name"];
  node(area.prague)["public_transport"~"^(platform|stop_position|station)$"]["name"];
);
out body;
"""

SIMPLIFY = 0.00003  # degrees, about 2–3 m: invisible on the map, much smaller file
DEDUPE = 0.0003     # stop points closer than ~25 m to one already kept are dropped


def fetch(query: str) -> bytes:
    body = urllib.parse.urlencode({"data": query}).encode()
    last_err = None
    for url in ENDPOINTS:
        try:
            print(f"Querying {url} ...", file=sys.stderr)
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "prague-street-map/1.0"})
            with urllib.request.urlopen(req, timeout=400) as resp:
                return resp.read()
        except Exception as e:  # noqa: BLE001 - try the next mirror
            print(f"  failed: {e}", file=sys.stderr)
            last_err = e
    raise SystemExit(f"All Overpass endpoints failed: {last_err}")


# ---- geometry helpers ------------------------------------------------------

def simplify(ring: list, tol: float) -> list:
    """Douglas–Peucker on a closed ring (keeps first/last point)."""
    if len(ring) < 5:
        return ring
    keep = [False] * len(ring)
    keep[0] = keep[-1] = True
    stack = [(0, len(ring) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = ring[a]
        bx, by = ring[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = ring[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / norm if norm else math.hypot(px - ax, py - ay)
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    out = [p for p, k in zip(ring, keep) if k]
    return out if len(out) >= 4 else ring


def ring_area(ring: list) -> float:
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:]))) / 2


def inside(pt, ring) -> bool:
    x, y = pt
    c = False
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            c = not c
    return c


def label_point(polygons: list) -> list:
    """A point well inside the largest polygon: the centroid if it is inside,
    else the middle of the widest stretch of the horizontal line through it."""
    outer = max((p[0] for p in polygons), key=ring_area)
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(outer, outer[1:]):
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    if a:
        cx, cy = cx / (3 * a), cy / (3 * a)
        if inside((cx, cy), outer):
            return [round(cx, 5), round(cy, 5)]
    else:
        cx, cy = outer[0]
    xs = sorted((x0 + (cy - y0) * (x1 - x0) / (y1 - y0))
                for (x0, y0), (x1, y1) in zip(outer, outer[1:]) if (y0 > cy) != (y1 > cy))
    spans = [(xs[i + 1] - xs[i], (xs[i] + xs[i + 1]) / 2) for i in range(0, len(xs) - 1, 2)]
    x = max(spans)[1] if spans else outer[0][0]
    return [round(x, 5), round(cy, 5)]


def bbox(points) -> list:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


# ---- parts of town -----------------------------------------------------------

def build_areas() -> list:
    osm_xml = fetch(AREAS_QUERY)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "areas.osm"
        dst = Path(tmp) / "areas.geojson"
        src.write_bytes(osm_xml)
        # Overpass writes relations before their nodes; osmium wants them sorted.
        sorted_src = Path(tmp) / "areas-sorted.osm"
        subprocess.run(["osmium", "sort", str(src), "-o", str(sorted_src), "--overwrite"], check=True)
        subprocess.run(["osmium", "export", str(sorted_src), "-o", str(dst), "-f", "geojson",
                        "--geometry-types=polygon", "-a", "type,id", "--overwrite"],
                       check=True)
        exported = json.loads(dst.read_text(encoding="utf-8"))

    features, names = [], set()
    for f in exported["features"]:
        t = f["properties"]
        if f["properties"].get("@type") != "relation":
            continue
        k = "ku" if t.get("boundary") == "cadastral" else "mc" if t.get("admin_level") == "9" else "ct"
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        polys = [[[[round(x, 5), round(y, 5)] for x, y in simplify(r, SIMPLIFY)] for r in poly] for poly in polys]
        lx, ly = label_point(polys)
        features.append({
            "type": "Feature",
            "properties": {"name": t["name"], "k": k, "lx": lx, "ly": ly,
                           "bbox": bbox([p for poly in polys for p in poly[0]])},
            "geometry": {"type": "MultiPolygon", "coordinates": polys},
        })
        names.add(t["name"].casefold())
    # A busy Overpass server can answer with an empty or cut-off result.
    if sum(f["properties"]["k"] == "ku" for f in features) < 100:
        raise SystemExit(f"Only {len(features)} area polygons came back; Overpass is probably overloaded. Try again later.")

    places = json.loads(fetch(PLACES_QUERY))
    for n in places["elements"]:
        name = n["tags"]["name"]
        if name.casefold() in names:
            continue  # already an area with this name
        names.add(name.casefold())
        x, y = round(n["lon"], 5), round(n["lat"], 5)
        features.append({
            "type": "Feature",
            "properties": {"name": name, "k": "ct", "lx": x, "ly": y, "bbox": [x, y, x, y]},
            "geometry": {"type": "Point", "coordinates": [x, y]},
        })

    order = {"mc": 0, "ku": 1, "ct": 2}
    features.sort(key=lambda f: (order[f["properties"]["k"]], f["properties"]["name"]))
    return features


# ---- stops -------------------------------------------------------------------

def modes(tags: dict) -> set:
    m = set()
    if tags.get("highway") == "bus_stop" or tags.get("bus") == "yes" or tags.get("trolleybus") == "yes":
        m.add("bus")
    if tags.get("railway") == "tram_stop" or tags.get("tram") == "yes":
        m.add("tram")
    # A funicular or metro station is also railway=station: not a train stop.
    if tags.get("funicular") == "yes" or tags.get("station") == "funicular":
        m.add("funicular")
    elif tags.get("subway") == "yes" or tags.get("station") == "subway":
        m.add("metro")
    elif tags.get("train") == "yes" or tags.get("railway") in ("station", "halt"):
        m.add("train")
    if tags.get("ferry") == "yes" or tags.get("amenity") == "ferry_terminal":
        m.add("ferry")
    return m


# A stand of a bus station named after it ("Praha, ÚAN Florenc, 12",
# "…, výstupní") belongs to the station itself.
STAND = re.compile(r",\s*(\d+[a-zA-Z]?|výstupní|nástupní)$")


def stop_name(name: str):
    name = STAND.sub("", name.strip())
    return None if name.isdigit() else name  # a bare number is a stand or platform ref, not a stop


def build_stops() -> list:
    data = json.loads(fetch(STOPS_QUERY))
    by_name = defaultdict(lambda: {"points": [], "modes": set()})
    for n in data["elements"]:
        tags = n.get("tags", {})
        name = stop_name(tags["name"])
        if not name:
            continue
        s = by_name[name]
        s["modes"] |= modes(tags)
        p = [round(n["lon"], 5), round(n["lat"], 5)]
        if all(abs(p[0] - q[0]) > DEDUPE or abs(p[1] - q[1]) > DEDUPE for q in s["points"]):
            s["points"].append(p)

    rank = {"metro": 0, "train": 1, "tram": 2, "funicular": 3, "ferry": 4, "bus": 5}
    features = []
    for name, s in sorted(by_name.items()):
        if not s["modes"]:
            continue  # a named stop_position of nothing we know (e.g. a disused track)
        pts = s["points"]
        # Name tag on the point nearest the middle of all of them.
        mx, my = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        lx, ly = min(pts, key=lambda p: (p[0] - mx) ** 2 + (p[1] - my) ** 2)
        features.append({
            "type": "Feature",
            "properties": {"name": name, "m": ",".join(sorted(s["modes"], key=rank.get)),
                           "lx": lx, "ly": ly, "bbox": bbox(pts)},
            "geometry": {"type": "MultiPoint", "coordinates": pts},
        })
    return features


def write(path: Path, features: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f,
                  ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {path} — {len(features)} features, {path.stat().st_size / 1e3:.0f} kB", file=sys.stderr)


def main() -> None:
    areas = build_areas()
    kinds = defaultdict(int)
    for f in areas:
        kinds[f["properties"]["k"]] += 1
    print(f"Areas: {dict(kinds)}", file=sys.stderr)
    write(OUT_AREAS, areas)
    write(OUT_STOPS, build_stops())


if __name__ == "__main__":
    main()
