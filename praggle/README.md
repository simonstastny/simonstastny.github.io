# Praggle

Prague + puzzle: you get two random Prague districts and connect them through
as few neighbouring districts as you can, against the clock. A sibling of
[pragrep](../pragrep/), with the same look.

## Run

```bash
python3 serve.py
```

Then open http://localhost:8767/praggle/. The server serves the whole site,
because the street map comes from `../pragrep/data/streets.geojson`.

## How it plays

- **Katastrální území | Městské části** picks the districts: the 112
  cadastral areas (Vinohrady, Žižkov…) or the 57 city districts (Praha 1–22,
  Praha-Suchdol…). Changing it, or ↻, starts a new game. The choice is
  remembered in the browser.
- A game picks a random start and an end 3–6 borders away (3–5 for city
  districts) and shows how many districts a shortest route goes through. The
  clock starts right away and stops when the game ends.
- Type a district; suggestions match anywhere in a name, accents ignored
  (`vin` → Vinohrady, Vinoř, Veleslavín). ↑/↓ and Enter, or click, picks one.
- Each guess is coloured on the map, in the list and in the attempt bar by its
  **detour**: how many extra borders a route through it needs compared with a
  shortest route. Green 0 (on a shortest route), yellow 1, orange 2, red 3+.
  Colours are pastel fills with an outline in the full colour.
- The game is won as soon as the guesses link start to end without a gap.
  You have the shortest route's length + 5 attempts (`EXTRA_GUESSES` in
  `app.js`); run out and the game shows a shortest route.
- **Nápověda / Hint** adds the next district on a shortest route, next to what
  is already connected to the start. It uses an attempt and costs +1.
- **Score**: `0` = a shortest route, guessed in order from the start; `+0` =
  a shortest route in another order; `+1`, `+2`… = each district beyond a
  shortest route, plus 1 per hint. The result also shows the time, the number
  of guesses and hints, your route, the extra districts and, if yours was
  longer, a shortest route.
- The logo (`assets/logo.svg`) is coloured like a finished route, with a dotted
  trail under it. `assets/logo-dark.svg` is the same with the dark grey letters
  lightened for dark mode.
- CS/EN switch (shared with pragrep), dark mode, and a bottom-sheet layout on
  phones (suggestions open upwards there, above the keyboard).

## Data

`data/ku.geojson` and `data/mc.geojson` are built from OpenStreetMap
(© OpenStreetMap contributors, ODbL) through the Overpass API:

```bash
python3 scripts/build_data.py   # needs osmium: brew install osmium-tool
```

One feature per district with its name, a point for its name on the map, and
`nb`, the indices of its neighbours. Two districts are neighbours when their
OSM boundaries share at least two nodes, i.e. a stretch of border (touching at
a corner doesn't count). The script reuses pragrep's `scripts/fetch_places.py`
helpers. Overpass is sometimes overloaded; the script then stops rather than
writing a partial file, so run it again later.
