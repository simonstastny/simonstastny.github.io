#!/usr/bin/env python3
"""Build Czech grepublic's data from an OpenStreetMap extract of Czechia.

Usage:
    python3 scripts/build_data.py SRC.osm.pbf [--work DIR]

SRC is a whole-country extract, e.g.
    https://download.openstreetmap.fr/extracts/europe/czech_republic-latest.osm.pbf
    https://download.geofabrik.de/europe/czech-republic-latest.osm.pbf
Needs osmium-tool and tippecanoe:  brew install osmium-tool tippecanoe

Writes (next to index.html):
    data/cz.pmtiles   map tiles: layer "streets" (named streets with their
                      search-index id, plus unnamed main roads) and layer
                      "munis" (municipality polygons with their index id)
    data/index.json   the search index the page loads:
                      {"names":   [street name, ...],          unique, sorted
                       "okresy":  [district name, ...],
                       "munis":   [[name, okres, x0, y0, x1, y1, px, py], ...],
                       "streets": [[name, muni, x0, y0, x1, y1, px, py, side, rank], ...]}
                      name/okres/muni are indexes into the lists above;
                      x0..y1 is the bounding box, px/py the label point and
                      side 1 = put the zoomed-out name tag up-left (see app.js).

A "street" is all ways with the same name inside one municipality (obec), so
"Nádražní" in Kolín and "Nádražní" in Beroun are two streets.
"""

import argparse
import json
import math
import subprocess
import sys
import tempfile
from array import array
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"

# Road classes drawn even when unnamed (keeps the network continuous).
ROAD_CLASSES = [
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
    "residential", "living_street", "pedestrian", "motorway_link", "trunk_link",
    "primary_link", "secondary_link", "tertiary_link",
]

# Lower rank = more important (drawn wider, labelled first). Same as pragrep.
RANK = {
    "motorway": 0, "trunk": 0, "motorway_link": 1, "trunk_link": 1,
    "primary": 1, "primary_link": 2, "secondary": 2, "secondary_link": 3,
    "tertiary": 3, "tertiary_link": 4,
    "unclassified": 4, "residential": 4, "living_street": 4, "pedestrian": 4,
    "service": 5, "track": 6,
}
DEFAULT_RANK = 6  # footways, paths, steps, cycleways, ...

# First zoom level at which a road of each rank is in the tiles. Keeps the
# country-wide tiles small; matching streets are still shown at every zoom
# as name tags, from the search index.
MINZOOM = {0: 5, 1: 5, 2: 7, 3: 9, 4: 12, 5: 13, 6: 13}
MAXZOOM = 14  # deepest tiles; the map enlarges them beyond this (app.js caps zoom at 16)

# Raster used to find which municipality / district a point lies in.
# 0.0005° ≈ 36 m × 55 m cells; Czechia fits in 12.0–19.0 E, 48.5–51.1 N.
GRID_X0, GRID_Y0, GRID_X1, GRID_Y1 = 12.0, 48.5, 19.0, 51.1


def run(cmd):
    print("+", " ".join(str(c) for c in cmd), file=sys.stderr)
    subprocess.run([str(c) for c in cmd], check=True)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---- 1. OSM extract -> features -------------------------------------------

def extract(src: Path, work: Path) -> Path:
    """Cut the extract down to highways, the country border and district /
    municipality boundaries, then export them as GeoJSON sequence.

    Czech admin levels in OSM: 2 country, 4 region (kraj), 5 district (okres;
    also Prague's "obvod"s), 6 SO ORP and 7 SO POÚ (not used), 8 municipality
    (obec). Prague is not level 8: it is the level-4 region tagged
    border_type=city, and counts as a municipality here. The extract has a
    margin across the border, so the country polygon drops foreign areas."""
    step1 = work / "1-highways-admin.osm.pbf"
    step2 = work / "2-filtered.osm.pbf"
    out = work / "features.geojsonseq"
    run(["osmium", "tags-filter", src, "w/highway", "r/admin_level=2,4,5,8",
         "-o", step1, "--overwrite"])
    # Of the highways keep the named ones and the main road classes.
    run(["osmium", "tags-filter", step1, "w/name", "w/highway=" + ",".join(ROAD_CLASSES),
         "r/admin_level=2,4,5,8", "-o", step2, "--overwrite"])
    config = work / "export-config.json"
    config.write_text(json.dumps({
        "attributes": {"type": False, "id": False},
        "linear_tags": ["highway"],
        "area_tags": ["admin_level"],
        "include_tags": ["highway", "name", "admin_level", "boundary", "border_type", "ISO3166-1"],
    }))
    run(["osmium", "export", step2, "-c", config, "-f", "geojsonseq",
         "-x", "print_record_separator=false", "-o", out, "--overwrite"])
    return out


def read_features(path: Path):
    roads, munis, okresy, country = [], [], [], []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.lstrip("\x1e").strip()
            if not line:
                continue
            feat = json.loads(line)
            p, g = feat["properties"], feat["geometry"]
            if "highway" in p and g["type"] == "LineString":
                roads.append((p.get("name"), RANK.get(p["highway"], DEFAULT_RANK), g["coordinates"]))
            elif p.get("boundary") == "administrative" and g["type"] in ("Polygon", "MultiPolygon") and "name" in p:
                polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
                level = p.get("admin_level")
                if level == "8" or (level == "4" and p.get("border_type") == "city"):
                    munis.append((p["name"], polys))  # obec, or Prague
                elif level == "5" and not p["name"].startswith("obvod "):
                    okresy.append((p["name"], polys))  # okres (Prague's obvody left out)
                elif p.get("admin_level") == "2" and p.get("ISO3166-1") == "CZ":
                    country.append((p["name"], polys))
    if not country:
        sys.exit("No Czech country boundary (admin_level=2, ISO3166-1=CZ) in the extract")
    return roads, munis, okresy, country


# ---- 2. point -> area lookup via a raster -----------------------------------

class Raster:
    """Every cell holds 1 + the index of the area covering its centre (0 = none)."""

    def __init__(self, cell: float):
        self.cell = cell
        self.nx = math.ceil((GRID_X1 - GRID_X0) / cell)
        self.ny = math.ceil((GRID_Y1 - GRID_Y0) / cell)
        self.grid = array("H", [0]) * (self.nx * self.ny)

    def fill(self, areas):
        cell, nx, x0, y0 = self.cell, self.nx, GRID_X0, GRID_Y0
        for k, (_, polys) in enumerate(areas, start=1):
            rows = defaultdict(list)  # row -> x where the boundary crosses its centre line
            for poly in polys:
                for ring in poly:  # even-odd over all rings handles holes
                    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
                        if ay == by:
                            continue
                        lo, hi = (ay, by) if ay < by else (by, ay)
                        r0 = math.ceil((lo - y0) / cell - 0.5)
                        r1 = math.ceil((hi - y0) / cell - 0.5) - 1  # centre must be < hi
                        for r in range(max(r0, 0), min(r1, self.ny - 1) + 1):
                            yc = y0 + (r + 0.5) * cell
                            rows[r].append(ax + (yc - ay) * (bx - ax) / (by - ay))
            fillv = array("H", [k])
            for r, xs in rows.items():
                xs.sort()
                base = r * nx
                for xa, xb in zip(xs[::2], xs[1::2]):
                    c0 = max(math.ceil((xa - x0) / cell - 0.5), 0)
                    c1 = min(math.floor((xb - x0) / cell - 0.5), nx - 1)
                    if c1 >= c0:
                        self.grid[base + c0: base + c1 + 1] = fillv * (c1 - c0 + 1)

    def at(self, x: float, y: float) -> int:
        """Index of the area at (x, y), or -1."""
        c = int((x - GRID_X0) / self.cell)
        r = int((y - GRID_Y0) / self.cell)
        if not (0 <= c < self.nx and 0 <= r < self.ny):
            return -1
        return self.grid[r * self.nx + c] - 1

    def inside_point(self, k: int, bbox) -> list:
        """A point surely inside area k: the middle of the longest run of its
        cells on the row through the bbox centre, searching outwards."""
        cell, nx = self.cell, self.nx
        rc = int(((bbox[1] + bbox[3]) / 2 - GRID_Y0) / cell)
        c0 = max(int((bbox[0] - GRID_X0) / cell), 0)
        c1 = min(int((bbox[2] - GRID_X0) / cell), nx - 1)
        span = int((bbox[3] - bbox[1]) / cell) + 2
        for d in range(span):
            for r in (rc - d, rc + d) if d else (rc,):
                if not 0 <= r < self.ny:
                    continue
                best, run_start, best_len = None, None, 0
                for c in range(c0, c1 + 2):
                    if c <= c1 and self.grid[r * nx + c] == k + 1:
                        if run_start is None:
                            run_start = c
                    elif run_start is not None:
                        if c - run_start > best_len:
                            best_len, best = c - run_start, (run_start + c - 1) / 2
                        run_start = None
                if best is not None:
                    return [GRID_X0 + (best + 0.5) * cell, GRID_Y0 + (r + 0.5) * cell]
        return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]


def bbox_of_polys(polys):
    xs = [x for poly in polys for x, _ in poly[0]]
    ys = [y for poly in polys for _, y in poly[0]]
    return [min(xs), min(ys), max(xs), max(ys)]


# ---- 3. streets ---------------------------------------------------------------

def merge_lines(lines: list) -> list:
    """Join lines that share an endpoint into longer lines (as in pragrep)."""
    lines = [list(l) for l in lines]
    alive = set(range(len(lines)))
    ends = defaultdict(set)
    for i, l in enumerate(lines):
        ends[tuple(l[0])].add(i)
        ends[tuple(l[-1])].add(i)

    def extend_tail(i):
        while True:
            l = lines[i]
            tail = tuple(l[-1])
            if tail == tuple(l[0]):
                return
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
        ends[tuple(lines[i][0])].discard(i)
        ends[tuple(lines[i][-1])].discard(i)
        lines[i].reverse()
        ends[tuple(lines[i][0])].add(i)
        ends[tuple(lines[i][-1])].add(i)
        extend_tail(i)
    return [lines[i] for i in sorted(alive)]


def tag_placement(lines):
    """Label point halfway along the longest line, and which side its tag goes
    (1 = up-left for streets running up-right on screen). Mirrors app.js."""
    def seg(a, b):
        return math.hypot((b[0] - a[0]) * math.cos(math.radians(a[1])), b[1] - a[1])
    best, total = lines[0], -1.0
    for l in lines:
        s = sum(seg(l[i - 1], l[i]) for i in range(1, len(l)))
        if s > total:
            best, total = l, s

    def at(f):
        rest = total * f
        for i in range(1, len(best)):
            d = seg(best[i - 1], best[i])
            if d >= rest:
                t = rest / d if d else 0
                return [best[i - 1][0] + t * (best[i][0] - best[i - 1][0]),
                        best[i - 1][1] + t * (best[i][1] - best[i - 1][1])]
            rest -= d
        return best[-1]
    a, b = at(0.2), at(0.8)
    sx = (b[0] - a[0]) * math.cos(math.radians(a[1]))
    sy = -(b[1] - a[1])
    return at(0.5), 1 if sx * sy < 0 else 0


def r5(v):
    return round(v, 5)


# ---- main -----------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", type=Path, help="Czech Republic .osm.pbf extract")
    ap.add_argument("--work", type=Path, help="folder for intermediate files (default: a temp dir)")
    args = ap.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix="czech-grepublic-"))
    work.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    features = work / "features.geojsonseq"
    if not features.exists():
        features = extract(args.src, work)
    else:
        log(f"Reusing {features}")

    log("Reading features…")
    roads, munis, okresy, country = read_features(features)
    log(f"  {len(roads):,} road ways, {len(munis):,} municipalities, {len(okresy):,} districts (incl. across the border)")

    # Keep only areas inside Czechia: test a point inside each against the country.
    cz_grid = Raster(0.005)
    cz_grid.fill(country)

    def czech(areas, cell):
        grid = Raster(cell)
        grid.fill(areas)
        return [a for k, a in enumerate(areas) if cz_grid.at(*grid.inside_point(k, bbox_of_polys(a[1]))) == 0]
    munis = czech(munis, 0.002)
    okresy = czech(okresy, 0.01)
    log(f"  in Czechia: {len(munis):,} municipalities, {len(okresy):,} districts")
    munis.sort(key=lambda m: m[0])
    okresy.sort(key=lambda o: o[0])

    log("Rasterising boundaries…")
    muni_grid = Raster(0.0005)
    muni_grid.fill(munis)
    okres_grid = Raster(0.002)
    okres_grid.fill(okresy)

    muni_rows = []
    for k, (name, polys) in enumerate(munis):
        bb = bbox_of_polys(polys)
        px, py = muni_grid.inside_point(k, bb)
        muni_rows.append([name, okres_grid.at(px, py), *map(r5, bb), r5(px), r5(py)])

    log("Grouping streets by name and municipality…")
    groups = defaultdict(lambda: {"lines": [], "rank": DEFAULT_RANK})
    unnamed, dropped = [], 0
    for name, rank, coords in roads:
        coords = [[r5(x), r5(y)] for x, y in coords]
        if len(coords) < 2:
            continue
        mx, my = coords[len(coords) // 2]
        m = muni_grid.at(mx, my)
        if m < 0:
            dropped += 1  # outside Czechia (the extract has a margin)
            continue
        if name:
            g = groups[(name, m)]
            g["lines"].append(coords)
            g["rank"] = min(g["rank"], rank)
        else:
            unnamed.append((rank, coords))
    log(f"  {len(groups):,} streets, {len(unnamed):,} unnamed road ways, {dropped:,} ways outside")

    names = sorted({name for name, _ in groups})
    name_idx = {n: i for i, n in enumerate(names)}

    streets_path = work / "streets.geojsonseq"
    munis_path = work / "munis.geojsonseq"
    street_rows = []
    with streets_path.open("w", encoding="utf-8") as f:
        for (name, m), g in sorted(groups.items(), key=lambda kv: (kv[0][0], muni_rows[kv[0][1]][0])):
            lines = merge_lines(g["lines"])
            xs = [x for l in lines for x, _ in l]
            ys = [y for l in lines for _, y in l]
            (px, py), side = tag_placement(lines)
            sid = len(street_rows)
            street_rows.append([name_idx[name], m, min(xs), min(ys), max(xs), max(ys), r5(px), r5(py), side, g["rank"]])
            f.write(json.dumps({
                "type": "Feature", "tippecanoe": {"minzoom": MINZOOM[g["rank"]]},
                "properties": {"i": sid, "n": name, "r": g["rank"]},
                "geometry": {"type": "MultiLineString", "coordinates": lines},
            }, ensure_ascii=False, separators=(",", ":")) + "\n")
        for rank, coords in unnamed:
            f.write(json.dumps({
                "type": "Feature", "tippecanoe": {"minzoom": MINZOOM[rank]},
                "properties": {"r": rank},
                "geometry": {"type": "LineString", "coordinates": coords},
            }, separators=(",", ":")) + "\n")
    with munis_path.open("w", encoding="utf-8") as f:
        for k, (name, polys) in enumerate(munis):
            f.write(json.dumps({
                "type": "Feature", "properties": {"i": k, "n": name},
                "geometry": {"type": "MultiPolygon", "coordinates": [[[[r5(x), r5(y)] for x, y in ring] for ring in poly] for poly in polys]},
            }, ensure_ascii=False, separators=(",", ":")) + "\n")

    log("Building tiles…")
    run(["tippecanoe", "-o", OUT / "cz.pmtiles", "--force", "-Z5", f"-z{MAXZOOM}",
         "-n", "Czech grepublic", "-A", "© OpenStreetMap contributors",
         "-L", f"streets:{streets_path}", "-L", f"munis:{munis_path}",
         "--detect-shared-borders", "--drop-densest-as-needed", "-P"])

    index = {"names": names, "okresy": [o[0] for o in okresy], "munis": muni_rows, "streets": street_rows}
    with (OUT / "index.json").open("w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    for p in (OUT / "cz.pmtiles", OUT / "index.json"):
        log(f"{p.relative_to(ROOT)}: {p.stat().st_size / 1e6:.1f} MB")
    log(f"{len(names):,} unique street names, {len(street_rows):,} streets, "
        f"{len(muni_rows):,} municipalities, {len(okresy):,} districts")


if __name__ == "__main__":
    main()
