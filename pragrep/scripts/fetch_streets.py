#!/usr/bin/env python3
"""Download Prague's streets from OpenStreetMap (Overpass API) and write a
compact GeoJSON file for the web page.

Output: data/streets.geojson
  - one feature per street *name* (all OSM ways with that name merged into a
    MultiLineString), properties: {"name": ..., "rank": ...}
  - plus one feature per unnamed road way (properties: {"rank": ...}) so the
    road network has no visual gaps; these are not searchable.

Usage:  python3 scripts/fetch_streets.py
"""

import json
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "streets.geojson"

# OSM relation 435514 = Hlavní město Praha. Overpass area id = 3600000000 + relation id.
PRAGUE_AREA = 3600435514

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Road classes drawn even when unnamed (keeps the network continuous).
ROAD_CLASSES = (
    "motorway|trunk|primary|secondary|tertiary|unclassified|residential|"
    "living_street|pedestrian|motorway_link|trunk_link|primary_link|"
    "secondary_link|tertiary_link"
)

QUERY = f"""
[out:json][timeout:300];
area({PRAGUE_AREA})->.prague;
(
  way(area.prague)["highway"]["name"];
  way(area.prague)["highway"~"^({ROAD_CLASSES})$"][!"name"];
);
out tags geom;
"""

# Lower rank = more important (drawn wider). Used for styling only.
RANK = {
    "motorway": 0, "trunk": 0, "motorway_link": 1, "trunk_link": 1,
    "primary": 1, "primary_link": 2, "secondary": 2, "secondary_link": 3,
    "tertiary": 3, "tertiary_link": 4,
    "unclassified": 4, "residential": 4, "living_street": 4, "pedestrian": 4,
    "service": 5, "track": 6,
}
DEFAULT_RANK = 6  # footways, paths, steps, cycleways, ...


def fetch() -> dict:
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    last_err = None
    for url in ENDPOINTS:
        try:
            print(f"Querying {url} ...", file=sys.stderr)
            req = urllib.request.Request(
                url, data=body, headers={"User-Agent": "prague-street-map/1.0"}
            )
            with urllib.request.urlopen(req, timeout=400) as resp:
                return json.load(resp)
        except Exception as e:  # noqa: BLE001 - try the next mirror
            print(f"  failed: {e}", file=sys.stderr)
            last_err = e
    raise SystemExit(f"All Overpass endpoints failed: {last_err}")


def line(geom) -> list:
    return [[round(p["lon"], 5), round(p["lat"], 5)] for p in geom]


def merge_lines(lines: list) -> list:
    """Join lines that share an endpoint into longer lines.

    OSM splits a street into many short ways; joined lines let the map place
    labels at lower zoom levels (a label must fit along a single line)."""
    lines = [list(l) for l in lines]
    alive = set(range(len(lines)))
    ends = defaultdict(set)  # endpoint -> indices of lines that start/end there
    for i, l in enumerate(lines):
        ends[tuple(l[0])].add(i)
        ends[tuple(l[-1])].add(i)

    def extend_tail(i):
        while True:
            l = lines[i]
            tail = tuple(l[-1])
            if tail == tuple(l[0]):
                return  # closed ring
            others = [j for j in ends[tail] if j != i]
            if not others:
                return
            j = others[0]
            m = lines[j]
            if tuple(m[0]) != tail:
                m.reverse()
            ends[tail].discard(i)
            ends[tail].discard(j)
            ends[tuple(m[-1])].discard(j)
            l.extend(m[1:])
            ends[tuple(l[-1])].add(i)
            alive.discard(j)

    for i in range(len(lines)):
        if i not in alive:
            continue
        extend_tail(i)
        # Extend the other end: reverse, extend tail, done.
        ends[tuple(lines[i][0])].discard(i)
        ends[tuple(lines[i][-1])].discard(i)
        lines[i].reverse()
        ends[tuple(lines[i][0])].add(i)
        ends[tuple(lines[i][-1])].add(i)
        extend_tail(i)
    return [lines[i] for i in sorted(alive)]


def main() -> None:
    data = fetch()
    ways = [e for e in data["elements"] if e["type"] == "way" and "geometry" in e]
    print(f"Got {len(ways)} ways", file=sys.stderr)

    named = defaultdict(lambda: {"lines": [], "rank": DEFAULT_RANK})
    features = []
    for w in ways:
        tags = w.get("tags", {})
        rank = RANK.get(tags.get("highway"), DEFAULT_RANK)
        coords = line(w["geometry"])
        if len(coords) < 2:
            continue
        name = tags.get("name")
        if name:
            s = named[name]
            s["lines"].append(coords)
            s["rank"] = min(s["rank"], rank)
        else:
            features.append({
                "type": "Feature",
                "properties": {"rank": rank},
                "geometry": {"type": "LineString", "coordinates": coords},
            })

    for name, s in sorted(named.items()):
        features.append({
            "type": "Feature",
            "properties": {"name": name, "rank": s["rank"]},
            "geometry": {"type": "MultiLineString", "coordinates": merge_lines(s["lines"])},
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f,
                  ensure_ascii=False, separators=(",", ":"))
    size_mb = OUT.stat().st_size / 1e6
    print(f"Wrote {OUT} — {len(named)} named streets, "
          f"{len(features) - len(named)} unnamed road segments, {size_mb:.1f} MB",
          file=sys.stderr)


if __name__ == "__main__":
    main()
