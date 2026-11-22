# Czech grepublic

Sister app of [pragrep](../pragrep/) for the whole Czech Republic: a map of
streets and municipalities (obce) with a search box that highlights every
street and municipality whose name matches a string or regex.

## Run

```bash
python3 serve.py
```

Then open http://localhost:8766. Use `serve.py` rather than
`python3 -m http.server`: the map reads `data/cz.pmtiles` in pieces with HTTP
range requests, which Python's built-in server doesn't support (GitHub Pages
does).

## Search

- The query is a JavaScript regular expression, tested against street names
  and municipality names: `^Lhota`, `^Nádražní$`, `^Horní `, `ice$`.
- A **street** is one name inside one municipality, so "Nádražní" in Kolín and
  "Nádražní" in Beroun are two results. Results come in two sections, *Obce*
  (with their district) and *Ulice* (with their municipality); the first 300
  of each are listed.
- Matching municipalities are tinted and outlined on the map and get a name
  tag at every zoom. Matching streets get a name tag beside them when zoomed
  out and are drawn in orange when zoomed in.
- **Ulice | Obojí | Obce** (Streets | Both | Municipalities) under the search
  box chooses what to search; both by default. It's kept in the URL as
  `in=s` or `in=m`.
- **Comparing groups**: **+ Přidat skupinu k porovnání** adds another search
  row (up to 5), each in its own colour (orange, cyan, green, purple, pink):
  its streets, municipality areas and name tags on the map, its counts, and
  its section of the result list. A street or municipality matching several
  groups takes the first group's colour. The URL repeats `q` per group; ☆ saves
  the whole comparison.
- **Jste tu poprvé?** shows the first three rows of suggestions, then
  **+ ukázat více**. In `SUGGESTIONS` (app.js) a comparison is an array of
  patterns, e.g. `["^Horní ", "^Dolní "]`.
- **Diakritika / Match diacritics** and **VELKÁ/malá / Match case**: both off
  by default, so `nadrazni` finds *Nádražní*.
- **Popisky / Labels**, **☆ starred patterns**, **Jste tu poprvé?** suggestions,
  the CS/EN switch, the phone bottom sheet and shareable URLs
  (`#q=...&map=zoom/lat/lng`) work as in pragrep. Starred patterns are kept
  separately from pragrep's.
- Hover a street to see its name and municipality; zoomed in, hovering
  elsewhere shows the municipality.

## Data

Built from OpenStreetMap (© OpenStreetMap contributors, ODbL):

- `data/cz.pmtiles` – map tiles (zoom 5–14; the map zooms to 16 by
  enlarging the deepest tiles). Layer `streets`: named streets (property `i` =
  index into the search index, `n` = name, `r` = road rank) and unnamed main
  roads; minor roads only appear from zoom 12. Layer `munis`: municipality
  polygons (`i`, `n`).
- `data/index.json` – the search index the page loads: unique street names,
  districts, municipalities and streets with bounding boxes and label points.
  Format described in `scripts/build_data.py`.

To rebuild (needs `brew install osmium-tool tippecanoe`; about a minute after the download):

```bash
curl -LO https://download.openstreetmap.fr/extracts/europe/czech_republic-latest.osm.pbf
python3 scripts/build_data.py czech_republic-latest.osm.pbf --work /tmp/cz-work
```

Geofabrik's `czech-republic-latest.osm.pbf` works the same. The extract itself
is not part of the site.
