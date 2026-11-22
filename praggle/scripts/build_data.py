#!/usr/bin/env python3
"""Download Prague's districts from OpenStreetMap (Overpass API) and write the
game data for Praggle.

Output: data/ku.geojson (the 112 katastrální území) and data/mc.geojson (the
57 městské části). One feature per district, properties:
  name    – its name
  lx, ly  – where its name goes on the map (inside it)
  nb      – indices (in the same file) of the districts it borders

Two districts border each other when their boundaries share at least two OSM
nodes, i.e. a stretch of border; touching at a single corner doesn't count.

Needs osmium to assemble the polygons (brew install osmium-tool).

Usage:  python3 scripts/build_data.py
"""

import json
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Same helpers pragrep uses for its parts of town (simplify, label point, fetch).
sys.path.insert(0, str(ROOT.parent / "pragrep" / "scripts"))
from fetch_places import PRAGUE_AREA, fetch, label_point, simplify  # noqa: E402

SETS = {
    "ku": '["boundary"="cadastral"]["name"]',
    "mc": '["boundary"="administrative"]["admin_level"="9"]["name"]',
}
EXPECTED = {"ku": 112, "mc": 57}  # a busy Overpass server can return less
SIMPLIFY = 0.00003  # degrees, about 2–3 m


def query(tags: str) -> str:
    return f"""
[out:xml][timeout:300];
area({PRAGUE_AREA})->.prague;
rel(area.prague){tags}->.r;
.r out body;
.r >;
out skel qt;
"""


def neighbours(osm_xml: bytes) -> dict:
    """Relation id -> set of bordering relation ids (>= 2 shared nodes)."""
    root = ET.fromstring(osm_xml)
    way_nodes = {w.get("id"): [nd.get("ref") for nd in w.iter("nd")] for w in root.iter("way")}
    node_rels = defaultdict(set)
    for r in root.iter("relation"):
        for m in r.iter("member"):
            if m.get("type") == "way":
                for n in way_nodes.get(m.get("ref"), []):
                    node_rels[n].add(r.get("id"))
    shared = defaultdict(int)
    for rels in node_rels.values():
        for a, b in combinations(sorted(rels), 2):
            shared[(a, b)] += 1
    nb = defaultdict(set)
    for (a, b), c in shared.items():
        if c >= 2:
            nb[a].add(b)
            nb[b].add(a)
    return nb


def polygons(osm_xml: bytes) -> list:
    with tempfile.TemporaryDirectory() as tmp:
        src, srt, dst = (Path(tmp) / n for n in ("a.osm", "a-sorted.osm", "a.geojson"))
        src.write_bytes(osm_xml)
        subprocess.run(["osmium", "sort", str(src), "-o", str(srt), "--overwrite"], check=True)
        subprocess.run(["osmium", "export", str(srt), "-o", str(dst), "-f", "geojson",
                        "--geometry-types=polygon", "-a", "type,id", "--overwrite"], check=True)
        return [f for f in json.loads(dst.read_text(encoding="utf-8"))["features"]
                if f["properties"].get("@type") == "relation"]


def build(key: str) -> list:
    osm_xml = fetch(query(SETS[key]))
    feats = polygons(osm_xml)
    if len(feats) < EXPECTED[key]:
        raise SystemExit(f"{key}: only {len(feats)} of {EXPECTED[key]} districts came back; "
                         "Overpass is probably overloaded. Try again later.")
    nb = neighbours(osm_xml)
    feats.sort(key=lambda f: f["properties"]["name"])
    index = {str(f["properties"]["@id"]): i for i, f in enumerate(feats)}
    out = []
    for f in feats:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        polys = [[[[round(x, 5), round(y, 5)] for x, y in simplify(r, SIMPLIFY)] for r in poly] for poly in polys]
        lx, ly = label_point(polys)
        rid = str(f["properties"]["@id"])
        out.append({
            "type": "Feature",
            "properties": {"name": f["properties"]["name"], "lx": lx, "ly": ly,
                           "nb": sorted(index[n] for n in nb[rid] if n in index)},
            "geometry": {"type": "MultiPolygon", "coordinates": polys},
        })
    lonely = [f["properties"]["name"] for f in out if not f["properties"]["nb"]]
    if lonely:
        raise SystemExit(f"{key}: districts without neighbours: {lonely}")
    return out


def main() -> None:
    for key in SETS:
        feats = build(key)
        path = ROOT / "data" / f"{key}.geojson"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))
        deg = sum(len(x["properties"]["nb"]) for x in feats) / len(feats)
        print(f"Wrote {path} — {len(feats)} districts, {deg:.1f} neighbours on average, "
              f"{path.stat().st_size / 1e3:.0f} kB", file=sys.stderr)


if __name__ == "__main__":
    main()
