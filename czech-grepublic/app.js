/* Czech grepublic: streets and municipalities of Czechia with regex search.
   Sister app of pragrep. Data: data/index.json (search index) and
   data/cz.pmtiles (map tiles), both built by scripts/build_data.py. */
(() => {
  "use strict";

  const CZ_BOUNDS = [[12.09, 48.55], [18.86, 51.06]];
  const MAX_LIST = 300;   // how many matches of each kind to list in the panel
  const TAG_MAXZOOM = 14; // below this, matching streets get name tags instead of along-the-line labels

  // ---- language (Czech first, English second) -----------------------------

  const PLURAL = (lang, n, forms) => forms[new Intl.PluralRules(lang).select(n)] ?? forms.other;
  const csStreets = (n) => PLURAL("cs", n, { one: "ulice", few: "ulice", other: "ulic" });
  const csMunis = (n) => PLURAL("cs", n, { one: "obec", few: "obce", other: "obcí" });
  const I18N = {
    cs: {
      title: "Czech grepublic – ulice a obce Česka",
      placeholder: "Ulice nebo obec, třeba i regulární výraz, např. ^Lhota",
      matchCase: "VELKÁ/malá",
      matchDia: "Diakritika",
      labels: "Popisky",
      loading: "Načítám data…",
      loadFailed: (msg) => `Nepodařilo se načíst data (${msg}). Nejdřív spusťte scripts/build_data.py.`,
      idle: (counts) => `${counts}. Napište název nebo regulární výraz.`,
      scopeGroup: "Hledat",
      scopeBoth: "Obojí",
      scopeStreets: "Ulice",
      scopeMunis: "Obce",
      noMatch: "Nic neodpovídá.",
      matches: (s, ss, m, ms) => [m ? `${ms} ${csMunis(m)}` : "", s ? `${ss} ${csStreets(s)}` : ""].filter(Boolean).join(" a "),
      zoomAll: "zobrazit vše",
      more: (s) => `…a dalších ${s}`,
      munisHead: "Obce",
      streetsHead: "Ulice",
      okres: (o) => o,
      invalid: "Neplatný regulární výraz: ",
      starAdd: "Přidat vzor do oblíbených",
      starRemove: "Odebrat z oblíbených",
      removeAria: (p) => `Odebrat ${p} z oblíbených`,
      starredTitle: "Oblíbené",
      starredEmpty: "Přidejte vzor kliknutím na ☆ vedle vyhledávání",
      introTitle: "Jste tu poprvé?",
      introText: "Klikněte na vzor a vyzkoušejte ho:",
      showMore: "+ ukázat více",
      showLess: "− ukázat méně",
      addGroup: "+ Přidat skupinu k porovnání",
      removeGroup: "Odebrat skupinu",
      placeholderMore: "Další skupina, např. ^Dolní",
      groupName: (n) => `Skupina ${n}`,
      langGroup: "Jazyk",
      sheetExpand: "Rozbalit panel",
      sheetCollapse: "Sbalit panel",
      attribution: '© přispěvatelé <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      mapLocale: {
        "NavigationControl.ZoomIn": "Přiblížit",
        "NavigationControl.ZoomOut": "Oddálit",
        "AttributionControl.ToggleAttribution": "Zobrazit/skrýt zdroje dat",
      },
    },
    en: {
      title: "Czech grepublic – streets and towns of Czechia",
      placeholder: "Street or town, or a regex, e.g. ^Lhota",
      matchCase: "Match case",
      matchDia: "Match diacritics",
      labels: "Labels",
      loading: "Loading data…",
      loadFailed: (msg) => `Failed to load data (${msg}). Run scripts/build_data.py first.`,
      idle: (counts) => `${counts}. Type a name or a regular expression.`,
      scopeGroup: "Search in",
      scopeBoth: "Both",
      scopeStreets: "Streets",
      scopeMunis: "Municipalities",
      noMatch: "Nothing matches.",
      matches: (s, ss, m, ms) => [m ? `${ms} municipalit${m === 1 ? "y" : "ies"}` : "", s ? `${ss} street${s === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and "),
      zoomAll: "zoom to all",
      more: (s) => `…and ${s} more`,
      munisHead: "Municipalities",
      streetsHead: "Streets",
      okres: (o) => o.replace(/^okres /, "") + " district",
      invalid: "Invalid regex: ",
      starAdd: "Star this pattern",
      starRemove: "Remove from starred",
      removeAria: (p) => `Remove ${p} from starred`,
      starredTitle: "Starred",
      starredEmpty: "Click ☆ next to the search box to save a pattern here.",
      introTitle: "New here?",
      introText: "Click a pattern to try it:",
      showMore: "+ show more",
      showLess: "− show less",
      addGroup: "+ Add a group to compare",
      removeGroup: "Remove group",
      placeholderMore: "Another group, e.g. ^Dolní",
      groupName: (n) => `Group ${n}`,
      langGroup: "Language",
      sheetExpand: "Expand panel",
      sheetCollapse: "Collapse panel",
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      mapLocale: {},
    },
  };
  const LANG_KEY = "lang"; // shared with pragrep on purpose: one language choice for both
  const lang = (() => {
    try { const v = localStorage.getItem(LANG_KEY); if (v && v in I18N) return v; } catch {}
    return "cs";
  })();
  const T = I18N[lang];
  const fmt = (n) => n.toLocaleString(lang === "cs" ? "cs-CZ" : "en-US");

  // Static texts in index.html carry data-i18n* attributes naming a key in I18N.
  // The HTML is written in Czech, so this only changes anything for English.
  function applyI18n() {
    document.documentElement.lang = lang;
    document.title = T.title;
    for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = T[el.dataset.i18n];
    for (const el of document.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = T[el.dataset.i18nPlaceholder];
    for (const el of document.querySelectorAll("[data-i18n-label]")) el.setAttribute("aria-label", T[el.dataset.i18nLabel]);
    for (const b of document.querySelectorAll("#lang [data-lang]")) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
      // Switching reloads the page so every text, including the map's, is redone;
      // the search survives in the URL and starred patterns in localStorage.
      b.addEventListener("click", () => {
        if (b.dataset.lang === lang) return;
        try { localStorage.setItem(LANG_KEY, b.dataset.lang); } catch { return; }
        location.reload();
      });
    }
  }
  applyI18n();

  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const C = dark
    ? { bg: "#15161a", road: "#55565e", roadDim: "#2e2f35", hit: "#ff7a50", halo: "#15161a", label: "#ffd2c2", text: "#a3a3ab", border: "#3a3b42", place: "#8a8a92" }
    : { bg: "#f7f6f3", road: "#9a9aa0", roadDim: "#dddcd8", hit: "#e4572e", halo: "#ffffff", label: "#7a2410", text: "#5c5c62", border: "#cfcdc6", place: "#77777d" };
  // One colour per search group (line + darker/lighter label text). The first
  // is the usual orange; the others stay distinct in light and dark mode.
  // Groups 2–5: cyan #00B8D9, green #2FA36B, purple #7A52CC, pink #FF2D8D in
  // both modes; map label text uses a darker (light mode) or lighter (dark mode)
  // shade of each so names stay readable over the map.
  const GROUP_COLORS = dark
    ? [{ line: C.hit, label: C.label }, { line: "#00B8D9", label: "#b8f1fa" }, { line: "#2FA36B", label: "#c4ecd8" },
       { line: "#7A52CC", label: "#dcd1f5" }, { line: "#FF2D8D", label: "#ffc4e0" }]
    : [{ line: C.hit, label: C.label }, { line: "#00B8D9", label: "#006b80" }, { line: "#2FA36B", label: "#1a6642" },
       { line: "#7A52CC", label: "#4a2f85" }, { line: "#FF2D8D", label: "#a8105a" }];

  const $groups = document.getElementById("groups");
  const $addGroup = document.getElementById("add-group");
  const $star = document.getElementById("star");
  const $case = document.getElementById("opt-case");
  const $dia = document.getElementById("opt-diacritics");
  const $labels = document.getElementById("opt-labels");
  const $scope = document.getElementById("scope");
  // What to search: "both", "s" (streets only) or "m" (municipalities only).
  const getScope = () => $scope.querySelector("input:checked").value;
  const setScope = (v) => { for (const r of $scope.querySelectorAll("input")) r.checked = r.value === v; };
  const $status = document.getElementById("status");
  const $results = document.getElementById("results");
  const $tip = document.getElementById("tooltip");

  // ---- text helpers -------------------------------------------------------

  // Strip diacritics, keeping a map from each output char to its source index
  // so we can highlight the match in the original (accented) name.
  function fold(s) {
    let out = "";
    const idx = [];
    for (let i = 0; i < s.length; i++) {
      const f = s[i].normalize("NFD").replace(/\p{M}/gu, "");
      for (let k = 0; k < f.length; k++) idx.push(i);
      out += f;
    }
    idx.push(s.length);
    return { text: out, idx };
  }
  const stripDia = (s) => s.normalize("NFD").replace(/\p{M}/gu, "");
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- data -----------------------------------------------------------------
  //
  // index.json (see scripts/build_data.py):
  //   names[]   unique street names
  //   okresy[]  district names
  //   munis[]   [name, okres, x0, y0, x1, y1, px, py]
  //   streets[] [name, muni, x0, y0, x1, y1, px, py, side, rank]
  // A street is one name inside one municipality; its index is the "i" of its
  // lines in the tiles, and a municipality's index is the "i" of its polygon.

  let names = [], namesFolded = [], streetsOfName = [];
  let okresy = [];
  let munis = [];    // [{ i, name, folded, okres, bbox, point }]
  let streets = [];  // raw rows, see above
  let loaded = false;

  const streetName = (s) => names[streets[s][0]];
  const streetMuni = (s) => munis[streets[s][1]];
  const streetBbox = (s) => streets[s].slice(2, 6);

  // ---- map ----------------------------------------------------------------

  // Line width by zoom and road rank (tile property "r"); `extra` px is added at every zoom.
  const width = (base, extra = 0) => [
    "interpolate", ["exponential", 1.6], ["zoom"],
    6, ["+", extra, ["*", base * 0.8, ["match", ["get", "r"], 0, 1.8, 1, 1.2, 2, 0.9, 3, 0.7, 4, 0.5, 5, 0.35, 0.25]]],
    10, ["+", extra, ["*", base, ["match", ["get", "r"], 0, 1.6, 1, 1.3, 2, 1.1, 3, 0.9, 4, 0.6, 5, 0.35, 0.25]]],
    16, ["+", extra, ["*", base * 6, ["match", ["get", "r"], 0, 2.2, 1, 1.8, 2, 1.5, 3, 1.3, 4, 1.0, 5, 0.6, 0.45]]],
  ];

  // A shared link may carry the map view (map=zoom/lat/lng): open right there.
  const initialView = parseView(new URLSearchParams(location.hash.slice(1)).get("map"));

  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const map = new maplibregl.Map({
    container: "map",
    ...(initialView
      ? { center: initialView.center, zoom: initialView.zoom }
      : { bounds: CZ_BOUNDS, fitBoundsOptions: { padding: 20 } }),
    // Generous on purpose: on a tall phone screen, fitting the country's width
    // shows ~8° of latitude, and MapLibre won't zoom out past these bounds.
    maxBounds: [[4, 43], [27, 56]],
    // Tiles go to zoom 14; beyond 16 the enlarged tiles carry too many repeated
    // street names and MapLibre drops a tile's labels ("too many glyphs").
    maxZoom: 16,
    attributionControl: { compact: true },
    locale: T.mapLocale,
    style: {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {},
      layers: [{ id: "bg", type: "background", paint: { "background-color": C.bg } }],
    },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  const NONE = ["==", ["get", "i"], -1]; // filter matching nothing (ids are ≥ 0)
  // Filter: tile feature's "i" is one of `ids` (match compiles to a lookup table, fast for big sets).
  const idFilter = (ids) => (ids.length ? ["match", ["get", "i"], ids, true, false] : NONE);

  map.on("load", async () => {
    let index;
    try {
      const r = await fetch("data/index.json");
      if (!r.ok) throw new Error(`data/index.json: HTTP ${r.status}`);
      index = await r.json();
    } catch (e) {
      setStatus(esc(T.loadFailed(e.message)), true);
      throw e;
    }

    names = index.names;
    namesFolded = names.map(stripDia);
    okresy = index.okresy;
    streets = index.streets;
    streetsOfName = names.map(() => []);
    streets.forEach((s, i) => streetsOfName[s[0]].push(i));
    munis = index.munis.map((m, i) => ({
      i, name: m[0], folded: stripDia(m[0]), okres: m[1] >= 0 ? okresy[m[1]] : "",
      bbox: m.slice(2, 6), point: [m[6], m[7]],
    }));
    loaded = true;

    map.addSource("cz", {
      type: "vector",
      url: "pmtiles://" + new URL("data/cz.pmtiles", location.href).href,
      attribution: T.attribution,
    });

    // Municipalities: highlighted area + outline for matches, faint borders when zoomed in.
    map.addLayer({
      id: "muni-hit-fill", type: "fill", source: "cz", "source-layer": "munis", filter: NONE,
      paint: { "fill-color": C.hit, "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: "muni-borders", type: "line", source: "cz", "source-layer": "munis", minzoom: 9,
      paint: { "line-color": C.border, "line-width": 0.8, "line-dasharray": [3, 2] },
    });
    // Invisible fill, only there so hovering can find the municipality under the mouse.
    map.addLayer({
      id: "muni-any", type: "fill", source: "cz", "source-layer": "munis", minzoom: 9,
      paint: { "fill-color": "#000", "fill-opacity": 0 },
    });

    // Draw less important roads first so major ones sit on top.
    map.addLayer({
      id: "roads", type: "line", source: "cz", "source-layer": "streets",
      layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["-", 10, ["get", "r"]] },
      paint: { "line-color": C.road, "line-width": width(1) },
    });
    map.addLayer({
      id: "hits-casing", type: "line", source: "cz", "source-layer": "streets", filter: NONE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": C.halo, "line-width": width(1.6, 3), "line-opacity": 0.9 },
    });
    map.addLayer({
      id: "hits", type: "line", source: "cz", "source-layer": "streets", filter: NONE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": C.hit, "line-width": width(1.6, 1.5) },
    });
    map.addLayer({
      id: "muni-hit-line", type: "line", source: "cz", "source-layer": "munis", filter: NONE,
      paint: { "line-color": C.hit, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 12, 2.5] },
    });

    // Names of all (non-matching) streets; matching streets use hit-labels.
    map.addLayer({
      id: "street-labels", type: "symbol", source: "cz", "source-layer": "streets",
      filter: ["has", "n"],
      layout: {
        "symbol-placement": "line",
        "symbol-sort-key": ["get", "r"],
        "text-field": ["get", "n"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 11, 17, 13],
        "symbol-spacing": 350,
      },
      paint: { "text-color": C.text, "text-halo-color": C.bg, "text-halo-width": 1.5 },
    });
    // Zoomed in: matching names run along the street.
    map.addLayer({
      id: "hit-labels", type: "symbol", source: "cz", "source-layer": "streets", filter: NONE,
      minzoom: TAG_MAXZOOM,
      layout: {
        "symbol-placement": "line",
        "symbol-sort-key": ["get", "r"],
        "text-field": ["get", "n"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 13, 11, 17, 14],
        "symbol-spacing": 300,
      },
      paint: { "text-color": C.label, "text-halo-color": C.halo, "text-halo-width": 1.5 },
    });

    // Place names for orientation: every municipality, larger ones first.
    map.addSource("places", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: munis.map((m) => ({
          type: "Feature",
          properties: { n: m.name, a: -(m.bbox[2] - m.bbox[0]) * (m.bbox[3] - m.bbox[1]) },
          geometry: { type: "Point", coordinates: m.point },
        })),
      },
    });
    map.addLayer({
      id: "place-labels", type: "symbol", source: "places", minzoom: 8,
      layout: {
        "symbol-sort-key": ["get", "a"],
        "text-field": ["get", "n"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 12, 12],
        "text-padding": 6,
      },
      paint: { "text-color": C.place, "text-halo-color": C.bg, "text-halo-width": 1.5 },
    });

    // Name tags of the current matches (filled in by applyMatches): matching
    // municipalities at every zoom, matching streets until along-the-line
    // labels take over. Added last so they win label collisions.
    map.addSource("tags", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "street-tags", type: "symbol", source: "tags", maxzoom: TAG_MAXZOOM,
      filter: ["==", ["get", "k"], "s"],
      layout: {
        "symbol-sort-key": ["get", "r"],
        "text-field": ["get", "n"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 13, 12],
        "text-padding": 3,
        // Pin the tag by a corner beside the street; if that spot is taken,
        // try the mirror-image corner, which is just as clear of the street.
        "text-variable-anchor-offset": ["match", ["get", "side"],
          1, ["literal", ["bottom-right", [-0.3, -0.2], "top-left", [0.3, 0.2]]],
          ["literal", ["bottom-left", [0.3, -0.2], "top-right", [-0.3, 0.2]]]],
      },
      paint: { "text-color": ["get", "c"], "text-halo-color": C.halo, "text-halo-width": 2 },
    });
    map.addLayer({
      id: "muni-tags", type: "symbol", source: "tags",
      filter: ["==", ["get", "k"], "m"],
      layout: {
        "symbol-sort-key": ["get", "a"],
        "text-field": ["get", "n"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 6, 12, 12, 15],
        "text-padding": 3,
        "text-allow-overlap": false,
      },
      paint: { "text-color": ["get", "c"], "text-halo-color": C.halo, "text-halo-width": 2 },
    });

    readHash();
    // Without a view in the link, fit the whole country into the part of the
    // screen the panels leave free.
    if (!mapView) {
      map.fitBounds(CZ_BOUNDS, {
        padding: isPhone()
          ? { top: 60, bottom: $sidebar.offsetHeight + 10, left: 10, right: 10 }
          : { top: 20, bottom: 20, left: $sidebar.getBoundingClientRect().right + 20, right: 20 },
        animate: false,
      });
    }

    setupHover();
    applyLabels();
    search();

    // Put the view in the URL whenever the user stops moving the map, or after
    // we zoomed to results on their request (userMove).
    map.on("moveend", (e) => {
      if (!e.originalEvent && !e.userMove) return;
      mapView = viewString();
      writeHash();
    });
  });

  // ---- search -------------------------------------------------------------

  function setStatus(html, isError = false) {
    $status.innerHTML = html;
    $status.classList.toggle("error", isError);
  }

  function compile(pattern) {
    const ignoreDia = !$dia.checked; // checkbox = "match diacritics", off by default
    const src = ignoreDia ? stripDia(pattern) : pattern;
    return new RegExp(src, $case.checked ? "u" : "iu");
  }

  // ---- search groups --------------------------------------------------------
  //
  // One or more search rows ("groups"), each highlighted in its own colour so
  // patterns can be compared on one map. A street or municipality matching
  // several groups gets the colour of the first of them and is listed under each.

  const MAX_GROUPS = GROUP_COLORS.length;
  const groupInputs = () => [...$groups.querySelectorAll("input.q")];
  const groupPatterns = () => groupInputs().map((i) => i.value);
  let focusedGroup = 0; // the row a click on the map searches in

  function renderGroups(patterns) {
    const list = (patterns.length ? patterns : [""]).slice(0, MAX_GROUPS);
    const focused = groupInputs().indexOf(document.activeElement);
    $groups.innerHTML = list.map((p, i) =>
      `<div class="search-row" style="--g:${GROUP_COLORS[i].line}">` +
        `<span class="gdot" aria-hidden="true"></span>` +
        `<input class="q" type="search" value="${esc(p)}" placeholder="${esc(i ? T.placeholderMore : T.placeholder)}"` +
          ` aria-label="${esc(T.groupName(i + 1))}" autocomplete="off" spellcheck="false">` +
        `<button type="button" class="gremove" title="${esc(T.removeGroup)}" aria-label="${esc(T.removeGroup)}">×</button>` +
      `</div>`).join("");
    $groups.querySelector(".search-row").appendChild($star); // ☆ saves the whole set; it sits on the first row
    $groups.classList.toggle("multi", list.length > 1);
    $addGroup.hidden = list.length >= MAX_GROUPS;
    focusedGroup = Math.min(focusedGroup, list.length - 1);
    if (focused >= 0) groupInputs()[Math.min(focused, list.length - 1)].focus();
  }

  let lastHits = { munis: [], streets: [] };

  function search() {
    if (!loaded) return;
    const pats = groupPatterns();
    // A different search than the last one makes the saved view stale.
    const scope = getScope();
    const key = [...pats, $case.checked, $dia.checked, scope].join("\u0000");
    if (lastSearchKey !== null && key !== lastSearchKey) mapView = null;
    lastSearchKey = key;
    writeHash();
    markActiveSuggestion();

    const ignoreDia = !$dia.checked;
    const inputs = groupInputs();
    const groups = [];   // [{ i, p, re, munis: [ids], streets: [ids] }] for every non-empty, valid row
    let error = null;
    pats.forEach((p, i) => {
      inputs[i].classList.remove("invalid");
      if (!p) return;
      let re;
      try {
        re = compile(p);
      } catch (e) {
        inputs[i].classList.add("invalid");
        // The detail after the prefix comes from the browser and stays in its language.
        error ??= (pats.length > 1 ? T.groupName(i + 1) + ": " : "") +
          T.invalid + e.message.replace(/^Invalid regular expression: /, "");
        return;
      }
      const muniHits = scope === "s" ? [] : munis.filter((m) => re.test(ignoreDia ? m.folded : m.name)).map((m) => m.i);
      const nameHits = [];
      if (scope !== "m")
        for (let n = 0; n < names.length; n++) if (re.test(ignoreDia ? namesFolded[n] : names[n])) nameHits.push(n);
      groups.push({ i, p, re, munis: muniHits, streets: nameHits.flatMap((n) => streetsOfName[n]) });
    });
    applyMatches(groups);
    const allM = [...new Set(groups.flatMap((g) => g.munis))];
    const allS = [...new Set(groups.flatMap((g) => g.streets))];
    lastHits = { munis: allM, streets: allS };

    if (error) {
      setStatus(esc(error), true);
    } else if (!groups.length) {
      const ns = scope === "m" ? 0 : streets.length, nm = scope === "s" ? 0 : munis.length;
      setStatus(esc(T.idle(T.matches(ns, fmt(ns), nm, fmt(nm)))));
    } else if (!allM.length && !allS.length) {
      setStatus(esc(T.noMatch));
    } else {
      // One group: "3 obce a 12 ulic"; several: "● 3 obce a 12 ulic ● 40 ulic".
      const counts = groups.length === 1 ? esc(T.matches(allS.length, fmt(allS.length), allM.length, fmt(allM.length)))
        : groups.map((g) => `<span class="gcount" style="--g:${GROUP_COLORS[g.i].line}"><i class="gdot"></i>` +
            `${esc(T.matches(g.streets.length, fmt(g.streets.length), g.munis.length, fmt(g.munis.length)) || fmt(0))}</span>`).join("");
      setStatus(counts + `<button id="zoom-all" type="button">${esc(T.zoomAll)}</button>`);
      document.getElementById("zoom-all").addEventListener("click", () =>
        zoomTo([...allM.map((m) => munis[m].bbox), ...allS.map(streetBbox)]));
    }

    const list = [];
    for (const g of groups) {
      const st = `style="--g:${GROUP_COLORS[g.i].line}"`;
      if (groups.length > 1) list.push(`<li class="head ghead" ${st}><i class="gdot"></i>${pillText(g.p)}</li>`);
      const nm = g.munis.length, ns = g.streets.length;
      if (nm) {
        list.push(`<li class="head">${esc(T.munisHead)} <span>${fmt(nm)}</span></li>`);
        for (const m of g.munis.slice(0, MAX_LIST)) {
          const mu = munis[m];
          list.push(`<li data-m="${m}" title="${esc(mu.name)}" ${st}>${highlight(mu.name, g.re, ignoreDia)}` +
            (mu.okres ? `<span class="where"> · ${esc(T.okres(mu.okres))}</span>` : "") + "</li>");
        }
        if (nm > MAX_LIST) list.push(`<li class="more">${esc(T.more(fmt(nm - MAX_LIST)))}</li>`);
      }
      if (ns) {
        list.push(`<li class="head">${esc(T.streetsHead)} <span>${fmt(ns)}</span></li>`);
        for (const s of g.streets.slice(0, MAX_LIST)) {
          const name = streetName(s), mu = streetMuni(s);
          list.push(`<li data-s="${s}" title="${esc(name)} · ${esc(mu.name)}" ${st}>${highlight(name, g.re, ignoreDia)}` +
            `<span class="where"> · ${esc(mu.name)}</span></li>`);
        }
        if (ns > MAX_LIST) list.push(`<li class="more">${esc(T.more(fmt(ns - MAX_LIST)))}</li>`);
      }
    }
    $results.innerHTML = list.join("");
  }

  $results.addEventListener("click", (ev) => {
    const li = ev.target.closest("li[data-m], li[data-s]");
    if (!li) return;
    if (li.dataset.m !== undefined) zoomTo([munis[+li.dataset.m].bbox]);
    else zoomTo([streetBbox(+li.dataset.s)]);
  });

  function highlight(name, re, ignoreDia) {
    const g = new RegExp(re.source, re.flags + "g");
    const { text, idx } = ignoreDia ? fold(name) : { text: name, idx: [...name].map((_, i) => i).concat(name.length) };
    if (ignoreDia && text.length + 1 !== idx.length) return esc(name);
    let out = "", last = 0, m;
    while ((m = g.exec(text))) {
      if (m[0].length === 0) { g.lastIndex++; continue; }
      const a = idx[m.index], b = idx[m.index + m[0].length];
      out += esc(name.slice(last, a)) + "<mark>" + esc(name.slice(a, b)) + "</mark>";
      last = b;
    }
    return out + esc(name.slice(last));
  }

  function applyMatches(groups) {
    // Each street / municipality belongs to the first group it matches; that decides its colour.
    const sOwner = new Map(), mOwner = new Map();
    for (const g of groups) {
      for (const s of g.streets) if (!sOwner.has(s)) sOwner.set(s, g.i);
      for (const m of g.munis) if (!mOwner.has(m)) mOwner.set(m, g.i);
    }
    const sIds = [...sOwner.keys()], mIds = [...mOwner.keys()];
    const sf = idFilter(sIds), mf = idFilter(mIds);
    for (const id of ["hits-casing", "hits", "hit-labels"]) map.setFilter(id, sf);
    map.setFilter("street-labels", sIds.length ? ["all", ["has", "n"], ["!", sf]] : ["has", "n"]);
    map.setFilter("muni-hit-fill", mf);
    map.setFilter("muni-hit-line", mf);
    const any = sIds.length + mIds.length > 0;
    map.setPaintProperty("roads", "line-color", any ? C.roadDim : C.road);
    map.setLayoutProperty("place-labels", "visibility", any || !$labels.checked ? "none" : "visible");

    // Colour by group: ["match", tile id "i", [ids of group a], colour a, [ids of group b], colour b, …, fallback]
    const colourBy = (owner, key, fallback) => {
      const byGroup = new Map();
      for (const [id, gi] of owner) {
        if (!byGroup.has(gi)) byGroup.set(gi, []);
        byGroup.get(gi).push(id);
      }
      if (byGroup.size === 0) return fallback;
      if (byGroup.size === 1) return GROUP_COLORS[[...byGroup.keys()][0]][key];
      return ["match", ["get", "i"], ...[...byGroup].flatMap(([gi, ids]) => [ids, GROUP_COLORS[gi][key]]), fallback];
    };
    map.setPaintProperty("hits", "line-color", colourBy(sOwner, "line", C.hit));
    map.setPaintProperty("hit-labels", "text-color", colourBy(sOwner, "label", C.label));
    map.setPaintProperty("muni-hit-fill", "fill-color", colourBy(mOwner, "line", C.hit));
    map.setPaintProperty("muni-hit-line", "line-color", colourBy(mOwner, "line", C.hit));

    // Name tags carry their own colour ("c"): municipalities in the group's line
    // colour, streets in its label colour.
    const features = [];
    for (const [m, gi] of mOwner) {
      const mu = munis[m];
      features.push({
        type: "Feature",
        properties: { k: "m", n: mu.name, a: -(mu.bbox[2] - mu.bbox[0]) * (mu.bbox[3] - mu.bbox[1]), c: GROUP_COLORS[gi].line },
        geometry: { type: "Point", coordinates: mu.point },
      });
    }
    for (const [s, gi] of sOwner) {
      const row = streets[s];
      features.push({
        type: "Feature",
        properties: { k: "s", n: names[row[0]], r: row[9], side: row[8], c: GROUP_COLORS[gi].label },
        geometry: { type: "Point", coordinates: [row[6], row[7]] },
      });
    }
    map.getSource("tags").setData({ type: "FeatureCollection", features });
  }

  function applyLabels() {
    const v = $labels.checked ? "visible" : "none";
    for (const id of ["street-labels", "hit-labels", "street-tags", "muni-tags"]) map.setLayoutProperty(id, "visibility", v);
    const any = lastHits.munis.length + lastHits.streets.length > 0;
    map.setLayoutProperty("place-labels", "visibility", $labels.checked && !any ? "visible" : "none");
  }

  // Fit the map to a list of [x0, y0, x1, y1] boxes.
  function zoomTo(boxes) {
    if (!boxes.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of boxes) {
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    }
    let padding;
    if (isPhone()) {
      // Get the sheet out of the way, then fit between the logo and the sheet.
      setSheet(false);
      padding = { top: 70, bottom: $sidebar.offsetHeight + 24, left: 24, right: 24 };
    } else {
      padding = { top: 40, bottom: 40, right: 40, left: $sidebar.getBoundingClientRect().right + 40 };
    }
    // userMove: this was asked for, so moveend saves the new view in the URL.
    map.fitBounds([[x0, y0], [x1, y1]], { padding, maxZoom: 16 }, { userMove: true });
  }

  // ---- phone bottom sheet -------------------------------------------------

  const phoneMQ = matchMedia("(max-width: 640px)"); // keep in sync with style.css
  const isPhone = () => phoneMQ.matches;
  const $sidebar = document.getElementById("sidebar");
  const $handle = document.getElementById("sheet-handle");

  function setSheet(expanded) {
    $sidebar.classList.toggle("expanded", expanded);
    $handle.setAttribute("aria-expanded", String(expanded));
    $handle.setAttribute("aria-label", expanded ? T.sheetCollapse : T.sheetExpand);
    if (!expanded) $sidebar.scrollTop = 0;
  }
  setSheet(false);

  // Tap the handle to toggle; or swipe it: up expands, down collapses.
  let dragY = null, swiped = false;
  $handle.addEventListener("pointerdown", (e) => {
    dragY = e.clientY; swiped = false;
    // Keep receiving the pointer after the finger leaves the handle.
    $handle.setPointerCapture(e.pointerId);
  });
  $handle.addEventListener("pointerup", (e) => {
    if (dragY === null) return;
    const dy = e.clientY - dragY;
    dragY = null;
    if (Math.abs(dy) > 25) { swiped = true; setSheet(dy < 0); }
  });
  $handle.addEventListener("pointercancel", () => { dragY = null; });
  $handle.addEventListener("click", () => {
    if (swiped) { swiped = false; return; }
    setSheet(!$sidebar.classList.contains("expanded"));
  });

  // Tell the CSS how tall the sheet is, so the map's attribution sits above it.
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--sheet-h", isPhone() ? $sidebar.offsetHeight + "px" : "0px");
  }).observe($sidebar);

  // ---- hover tooltip ------------------------------------------------------

  // What is under the mouse: a street (name · municipality) or, zoomed in, a municipality.
  function featureAt(point) {
    const box = [[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]];
    const st = map.queryRenderedFeatures(box, { layers: ["hits", "roads"] }).find((f) => f.properties.n);
    if (st) {
      const i = st.properties.i;
      return { kind: "s", name: st.properties.n, label: i !== undefined ? `${st.properties.n} · ${streetMuni(i).name}` : st.properties.n };
    }
    const mu = map.queryRenderedFeatures(point, { layers: ["muni-any"] })[0];
    if (mu) return { kind: "m", name: mu.properties.n, label: mu.properties.n };
    return null;
  }

  function setupHover() {
    map.on("mousemove", (e) => {
      const f = featureAt(e.point);
      if (!f) { $tip.hidden = true; map.getCanvas().style.cursor = ""; return; }
      $tip.textContent = f.label;
      $tip.style.left = e.point.x + "px";
      $tip.style.top = e.point.y + "px";
      $tip.hidden = false;
      map.getCanvas().style.cursor = f.kind === "s" ? "pointer" : "";
    });
    map.getCanvas().addEventListener("mouseleave", () => { $tip.hidden = true; });
    // Click a street to search for exactly that name.
    map.on("click", (e) => {
      const f = featureAt(e.point);
      if (!f || f.kind !== "s") return;
      const inputs = groupInputs();
      inputs[Math.min(focusedGroup, inputs.length - 1)].value = "^" + f.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
      search();
    });
  }

  // ---- URL hash (shareable searches and map views) ------------------------
  //
  // #q=<pattern>[&q=<pattern 2>…]&in=s|m&case=1&dia=1&labels=0&map=<zoom>/<lat>/<lng>
  // (one q per search group, in order)
  // (in= is left out for the default, searching both streets and municipalities)
  // map= is written like on openstreetmap.org (slashes left unescaped).

  let mapView = null;        // "zoom/lat/lng" while the URL should carry the view
  let lastSearchKey = null;  // pattern + options of the last search; null right after reading the URL

  function parseView(s) {
    const [zoom, lat, lng] = String(s ?? "").split("/").map(Number);
    return [zoom, lat, lng].every(Number.isFinite) ? { zoom, center: [lng, lat] } : null;
  }
  function viewString() {
    const c = map.getCenter();
    return `${map.getZoom().toFixed(2)}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`;
  }

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    renderGroups(p.getAll("q"));
    setScope(["s", "m"].includes(p.get("in")) ? p.get("in") : "both");
    $case.checked = p.get("case") === "1";
    $dia.checked = p.get("dia") === "1";
    $labels.checked = p.get("labels") !== "0";
    const view = parseView(p.get("map"));
    mapView = view ? p.get("map") : null;
    lastSearchKey = null;
    return view;
  }
  function writeHash() {
    const p = new URLSearchParams();
    for (const q of groupPatterns()) if (q) p.append("q", q);
    if (getScope() !== "both") p.set("in", getScope());
    if ($case.checked) p.set("case", "1");
    if ($dia.checked) p.set("dia", "1");
    if (!$labels.checked) p.set("labels", "0");
    let h = p.toString();
    if (mapView) h += (h ? "&" : "") + "map=" + mapView;
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }

  // ---- "New here?" / "Jste tu poprvé?" suggestions -------------------------

  // An entry is a pattern, or a list of patterns for a comparison (one per group),
  // e.g. ["^Horní ", "^Dolní "]. Order matters: only the first three rows of
  // pills show until "+ ukázat více".
  const SUGGESTIONS = [
    "^Lhota", "Lhot(a|ka)$", "^Nádražní$", ["^Horní ", "^Dolní "], "Masaryk",
    "^.{1,3}$", "ves$", "^Nová ", "Hrad", "(^| )Kocour", "ice$",
    ["^Star[áýé]", "^Nov[áýé]", "^Mlad[áýé]"], ["štejn$", "hrad$"],
    ["Labská", "Vltavská"], ["Dvořák", "Smetan"], ["janacka|janackova", "Martinů"],
    ["newtonova", "einsteinova"],
  ];
  const $sugg = document.getElementById("suggestions");

  const asList = (entry) => (Array.isArray(entry) ? entry : [entry]);
  const entryKey = (entry) => JSON.stringify(asList(entry));
  const currentKey = () => JSON.stringify(groupPatterns().filter(Boolean));
  // Pattern text for a pill; spaces shown as a faint "␣" so "^Horní " is unambiguous.
  const pillText = (p) => esc(p).replace(/ /g, '<span class="space">␣</span>');
  // A comparison shows each pattern after a dot in its group's colour.
  const entryText = (entry) => {
    const l = asList(entry);
    return l.length === 1 ? pillText(l[0])
      : l.map((p, i) => `<i class="pdot" style="background:${GROUP_COLORS[i].line}"></i>${pillText(p)}`).join("");
  };
  const entryTitle = (entry) => asList(entry).join("  ·  ");

  $sugg.innerHTML = SUGGESTIONS.map((e) =>
    `<button type="button" class="pill" data-p="${esc(entryKey(e))}" title="${esc(entryTitle(e))}">${entryText(e)}</button>`).join("");
  $sugg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]");
    if (b) usePatterns(JSON.parse(b.dataset.p));
  });

  // Show only the first SUGG_ROWS rows of pills until "+ ukázat více". Rows
  // depend on the panel width, so this re-measures whenever the width changes
  // (window resize, or the phone sheet opening).
  const SUGG_ROWS = 3;
  const $suggMore = document.getElementById("sugg-more");
  let suggExpanded = false;
  function layoutSuggestions() {
    const pills = [...$sugg.children];
    for (const p of pills) p.hidden = false;
    const tops = pills.map((p) => p.offsetTop); // measure everything before hiding anything
    const rows = [...new Set(tops)];
    const overflow = rows.length > SUGG_ROWS;
    if (overflow && !suggExpanded) pills.forEach((p, i) => { p.hidden = tops[i] > rows[SUGG_ROWS - 1]; });
    $suggMore.hidden = !overflow;
    $suggMore.textContent = suggExpanded ? T.showLess : T.showMore;
  }
  $suggMore.addEventListener("click", () => { suggExpanded = !suggExpanded; layoutSuggestions(); });
  let suggWidth = -1;
  new ResizeObserver(([e]) => {
    if (e.contentRect.width === suggWidth) return; // hiding pills changes the height, not the width
    suggWidth = e.contentRect.width;
    layoutSuggestions();
  }).observe($sugg);

  function usePatterns(list) {
    renderGroups(list);
    clearTimeout(t);
    search();
    groupInputs()[0].focus();
  }
  function markActiveSuggestion() {
    const k = currentKey();
    for (const el of document.querySelectorAll(".pill[data-p]")) el.classList.toggle("active", el.dataset.p === k);
    updateStar();
  }

  // ---- starred patterns (saved in this browser's localStorage) ------------
  //
  // Each entry is a pattern (string) or a whole comparison (array of patterns).
  // Own key: pragrep runs on the same site and keeps its list under "starred-patterns".

  const STAR_KEY = "czech-grepublic-starred";

  function loadStarred() {
    try {
      const v = JSON.parse(localStorage.getItem(STAR_KEY) || "[]");
      const ok = (e) => typeof e === "string" || (Array.isArray(e) && e.length && e.every((p) => typeof p === "string"));
      return Array.isArray(v) ? v.filter(ok) : [];
    } catch { return []; }
  }
  function saveStarred(list) {
    try { localStorage.setItem(STAR_KEY, JSON.stringify(list)); } catch {}
  }
  let starred = loadStarred();

  // The star is filled when the current set of patterns is starred; it is
  // disabled when there is nothing (valid) to save.
  function updateStar() {
    const pats = groupPatterns().filter(Boolean);
    let valid = pats.length > 0;
    if (valid) { try { pats.forEach((p) => compile(p)); } catch { valid = false; } }
    const k = JSON.stringify(pats);
    const on = pats.length > 0 && starred.some((e) => entryKey(e) === k);
    $star.disabled = !valid && !on;
    $star.textContent = on ? "★" : "☆";
    $star.setAttribute("aria-pressed", String(on));
    $star.title = on ? T.starRemove : T.starAdd;
  }
  $star.addEventListener("click", () => {
    const pats = groupPatterns().filter(Boolean);
    if (!pats.length) return;
    const k = JSON.stringify(pats);
    setStarred(starred.some((e) => entryKey(e) === k)
      ? starred.filter((e) => entryKey(e) !== k)
      : [...starred, pats.length === 1 ? pats[0] : pats]);
  });

  const $starredList = document.getElementById("starred");
  const $starredEmpty = document.getElementById("starred-empty");

  function setStarred(list) {
    starred = list;
    saveStarred(list);
    renderStarred();
  }
  function renderStarred() {
    $starredEmpty.hidden = starred.length > 0;
    $starredList.innerHTML = starred.map((e) =>
      `<span class="pill" data-p="${esc(entryKey(e))}">` +
        `<button type="button" class="pill-main" title="${esc(entryTitle(e))}">${entryText(e)}</button>` +
        `<button type="button" class="pill-x" title="${esc(T.starRemove)}" aria-label="${esc(T.removeAria(entryTitle(e)))}">×</button>` +
      `</span>`).join("");
    markActiveSuggestion(); // also refreshes the star button
  }
  $starredList.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill[data-p]");
    if (!pill) return;
    const k = pill.dataset.p;
    if (e.target.closest(".pill-x")) setStarred(starred.filter((s) => entryKey(s) !== k));
    else usePatterns(JSON.parse(k));
  });
  // Another tab changed the list: pick it up.
  addEventListener("storage", (e) => {
    if (e.key !== STAR_KEY) return;
    starred = loadStarred();
    renderStarred();
  });
  renderStarred();

  // ---- wiring -------------------------------------------------------------

  let t;
  // The rows are re-rendered at times, so their events are handled on #groups.
  // A slightly longer pause than pragrep: there are ~30× more names to test.
  $groups.addEventListener("input", (e) => {
    if (!e.target.matches("input.q")) return;
    updateStar();
    clearTimeout(t);
    t = setTimeout(search, 200);
  });
  $groups.addEventListener("keydown", (e) => {
    if (!e.target.matches("input.q")) return;
    if (e.key === "Enter") { clearTimeout(t); search(); }
    if (e.key === "Escape") { e.target.value = ""; search(); }
  });
  $groups.addEventListener("focusin", (e) => {
    if (e.target.matches("input.q")) focusedGroup = groupInputs().indexOf(e.target);
  });
  $groups.addEventListener("click", (e) => {
    const b = e.target.closest(".gremove");
    if (!b) return;
    const i = [...$groups.querySelectorAll(".search-row")].indexOf(b.closest(".search-row"));
    const pats = groupPatterns();
    pats.splice(i, 1);
    renderGroups(pats);
    search();
  });
  $addGroup.addEventListener("click", () => {
    const pats = groupPatterns();
    if (pats.length >= MAX_GROUPS) return;
    renderGroups([...pats, ""]);
    focusedGroup = pats.length;
    groupInputs()[pats.length].focus();
  });
  // Someone edited or pasted the URL in this tab: apply it, view included.
  addEventListener("hashchange", () => {
    const view = readHash();
    if (view) map.jumpTo(view);
    applyLabels();
    search();
  });
  $labels.addEventListener("change", () => { applyLabels(); writeHash(); });
  $case.addEventListener("change", search);
  $dia.addEventListener("change", search);
  $scope.addEventListener("change", search);
})();
