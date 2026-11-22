# Prague Streets

A map of Prague's streets only (no buildings, parks, water...) with a search
box that highlights every street, part of town and public transport stop whose
name matches a string or regex.

## Run

```bash
python3 serve.py
```

Then open http://localhost:8765.

## Language

The page is in Czech by default. The **CS / EN** switch next to the logo
changes it to English; the choice is remembered in the browser. All texts live
in the `I18N` table at the top of `app.js` (the Czech ones are also written
into `index.html`, so the page never flashes English first).

## Phones

Below 640 px wide, the panels move into a bottom sheet. Collapsed, it shows
just the search rows and the match line (with **uložit ☆**); tap or swipe the handle up to
expand it to everything (options, results, starred, suggestions), and tap or
swipe down to collapse. Picking a result or "zobrazit vše" collapses the sheet
and zooms the map into the space above it.

## Search

- The query is a JavaScript regular expression: `^Na `, `ova$`, `(ská|cká)$`, `^U [A-Z]`.
- It searches three kinds of names, chosen with **Vše | Ulice | Čtvrti | Zastávky** (All | Streets | Areas | Stops) under the search rows; all by default, kept in the URL as `in=s`, `in=a` or `in=t` otherwise:
  - **Ulice**: streets, drawn in the group's colour.
  - **Čtvrti**: parts of town: the 57 městské části (Praha 1–22, Praha-Suchdol…), the 112 katastrální území (Vinohrady, Žižkov…) and smaller named čtvrti (Barrandov, Spořilov…). Matches are tinted and outlined (or a dot, for čtvrti that OSM has only as a point) and get a name tag at every zoom.
  - **Zastávky**: public transport stops (metro, train, tram, bus, funicular, ferry), one per name; every platform of a matching stop gets a dot and the stop a name tag.
  With **Vše**, the results are split into Ulice / Čtvrti / Zastávky; each area or stop is followed by its kind or its modes.
- **ě** (match diacritics) and **Aa** (match case), the small pills at the right of that switch, both off by default. While **ě** is off, accents are ignored, so `vaclavske` matches *Václavské náměstí*.
- Each search row shows its number of matches on the right (hover it for the split by kind). The line below gives the total, **zobrazit vše** (zoom to all) and **uložit ☆**.
- **Comparing groups**: **+ Přidat skupinu** (a dashed empty row, its + in the next group's colour) adds another search row (up to 5), each highlighted in its own colour (orange, cyan, green, purple, pink) on the map, in its count and in its own section of the result list (headed by the pattern and its count), e.g. `(^| )horní` vs `(^| )dolní`. × removes a row. A street matching several groups takes the colour of the first one and is listed under each. Clicking a street on the map searches for it in the row you last used.
- **uložit ☆ / save ☆** (at the end of the match line): saves the current pattern, or the whole comparison, to the **Starred** box below the search panel; it then reads **uloženo ★**, and clicking it again unstars. Click a starred pill to run it, or its × to remove it. Starred patterns are kept in this browser's local storage, so they're per browser and not shared.
- **New here?** box: example patterns and comparisons to click (edit the list in `SUGGESTIONS` in `app.js`; a comparison is an array of patterns). Only the first three rows of pills show, then **+ ukázat více**; order the list by priority.
- **Labels** (always on): street names along the lines at every zoom; major roads first, smaller streets appear as you zoom in and there is room. Matching streets take priority: when zoomed out (below zoom 14) each one gets a horizontal name tag placed beside its middle (never on top of the street), so you can read the matches over the whole city; zoomed in, their names run along the street in orange. When tags would overlap, major roads win and the rest appear as you zoom in.
- Click a result to zoom to that street, or **zoom to all** for every match.
- Hover a street, a matching stop or area to see its name (and kind or modes); click a street to search for exactly that street.
- The query (one `q=` per group), the kind (`in=`) and the map view are kept in the URL (`#q=...&q=...&map=zoom/lat/lng`), so you can share or bookmark a search exactly as you see it. The view is updated whenever you stop moving the map (or after zooming to results), and dropped when you change the search; a link without it opens on the whole city.

## Data

`data/streets.geojson` is built from OpenStreetMap (© OpenStreetMap
contributors, ODbL) through the Overpass API. To refresh it:

```bash
python3 scripts/fetch_streets.py
```

It contains every OSM way with a `highway` tag and a `name` inside Prague's
boundary (relation 435514), merged into one feature per street name. Unnamed
roads are included too, so the network has no gaps, but they can't be searched.

`data/areas.geojson` and `data/stops.geojson` come from the same source:

```bash
python3 scripts/fetch_places.py   # needs osmium: brew install osmium-tool
```

- Areas: relations with `boundary=cadastral` (katastrální území) or
  `boundary=administrative` + `admin_level` 9 (městské části) or 10 (smaller
  parts), as simplified polygons, plus `place=neighbourhood|quarter|suburb`
  points whose name no polygon has. Each has its kind (`k`), a point for its
  name tag and a bounding box.
- Stops: bus stops, tram stops, railway stations and halts, and
  `public_transport` platforms, stop positions and stations, merged into one
  MultiPoint per name (points closer than ~25 m dropped), with their modes
  (`m`, e.g. `metro,tram,bus`).

Overpass is sometimes overloaded; the script then stops with an error rather
than writing a partial file, so run it again later.
