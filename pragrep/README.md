# Prague Streets

A map of Prague's streets only (no buildings, parks, water...) with a search
box that highlights every street whose name matches a string or regex.

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
just the search box with ☆ and the match count; tap or swipe the handle up to
expand it to everything (options, results, starred, suggestions), and tap or
swipe down to collapse. Picking a result or "zobrazit vše" collapses the sheet
and zooms the map into the space above it.

## Search

- The query is a JavaScript regular expression: `^Na `, `ova$`, `(ská|cká)$`, `^U [A-Z]`.
- **Rozlišovat diakritiku / Match diacritics** (off by default): while off, accents are ignored, so `vaclavske` matches *Václavské náměstí*.
- **Match case**: off by default.
- **☆ Star** (right of the search box): saves the current pattern to the **Starred** box below the search panel; click it again to unstar. Click a starred pill to run it, or its × to remove it. Starred patterns are kept in this browser's local storage, so they're per browser and not shared.
- **New here?** box: example patterns to click (edit the list in `SUGGESTIONS` in `app.js`).
- **Labels** (on by default): street names along the lines at every zoom; major roads first, smaller streets appear as you zoom in and there is room. Matching streets take priority: when zoomed out (below zoom 14) each one gets a horizontal name tag placed beside its middle (never on top of the street), so you can read the matches over the whole city; zoomed in, their names run along the street in orange. When tags would overlap, major roads win and the rest appear as you zoom in.
- Click a result to zoom to that street, or **zoom to all** for every match.
- Hover a street to see its name, or click it to search for exactly that street.
- The query and the map view are kept in the URL (`#q=...&map=zoom/lat/lng`), so you can share or bookmark a search exactly as you see it. The view is updated whenever you stop moving the map (or after zooming to results), and dropped when you change the search; a link without it opens on the whole city.

## Data

`data/streets.geojson` is built from OpenStreetMap (© OpenStreetMap
contributors, ODbL) through the Overpass API. To refresh it:

```bash
python3 scripts/fetch_streets.py
```

It contains every OSM way with a `highway` tag and a `name` inside Prague's
boundary (relation 435514), merged into one feature per street name. Unnamed
roads are included too, so the network has no gaps, but they can't be searched.
