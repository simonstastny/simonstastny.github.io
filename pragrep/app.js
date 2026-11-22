/* Prague street map with regex search. */
(() => {
  "use strict";

  const PRAGUE_BOUNDS = [[14.224, 49.942], [14.707, 50.177]];
  const MAX_LIST = 300; // how many matching names to list in the panel
  const TAG_MAXZOOM = 14; // below this, matches get name tags instead of along-the-line labels

  // ---- language (Czech first, English second) -----------------------------

  const PLURAL = (lang, n, forms) => forms[new Intl.PluralRules(lang).select(n)] ?? forms.other;
  // "a, b a c" / "a, b and c"
  const joinList = (parts, and) => parts.length > 1 ? parts.slice(0, -1).join(", ") + and + parts.at(-1) : parts[0] ?? "";
  const CS_FORMS = {
    s: { one: "ulice", few: "ulice", other: "ulic" },
    a: { one: "čtvrť", few: "čtvrti", other: "čtvrtí" },
    t: { one: "zastávka", few: "zastávky", other: "zastávek" },
  };
  const EN_FORMS = { s: ["street", "streets"], a: ["area", "areas"], t: ["stop", "stops"] };
  const I18N = {
    cs: {
      title: "Pražské ulice",
      placeholder: "Ulice, čtvrť nebo zastávka, např. ^Na |ova$",
      matchCase: "Rozlišovat VELKÁ/malá",
      matchDia: "Rozlišovat diakritiku",
      loading: "Načítám data…",
      loadFailed: (msg) => `Nepodařilo se načíst data (${msg}). Nejdřív spusťte scripts/fetch_streets.py a scripts/fetch_places.py.`,
      idle: (counts) => `${counts}. Napište název nebo regulární výraz.`,
      noMatch: "Nic neodpovídá.",
      // counts = { s: streets, a: areas, t: stops }; kinds with 0 are left out
      matches: (c) => joinList(["s", "a", "t"].filter((k) => c[k]).map((k) => `${fmt(c[k])} ${PLURAL("cs", c[k], CS_FORMS[k])}`), " a "),
      scopeGroup: "Hledat",
      scopeAll: "Vše",
      scopeStreets: "Ulice",
      scopeAreas: "Čtvrti",
      scopeStops: "Zastávky",
      heads: { s: "Ulice", a: "Čtvrti", t: "Zastávky" },
      areaKind: { mc: "městská část", ku: "katastrální území", ct: "čtvrť" },
      modes: { metro: "metro", train: "vlak", tram: "tramvaj", bus: "autobus", funicular: "lanovka", ferry: "přívoz" },
      addGroup: "Přidat skupinu",
      removeGroup: "Odebrat skupinu",
      placeholderMore: "Další skupina, např. dolní",
      groupName: (n) => `Skupina ${n}`,
      zoomAll: "zobrazit vše",
      more: (s) => `…a dalších ${s}`,
      invalid: "Neplatný regulární výraz: ",
      starAdd: "Přidat vzor do oblíbených",
      starRemove: "Odebrat z oblíbených",
      removeAria: (p) => `Odebrat ${p} z oblíbených`,
      starredTitle: "Oblíbené",
      starredEmpty: "Vzor uložíte kliknutím na „uložit ☆“ u výsledků.",
      starSave: "uložit",
      starSaved: "uloženo",
      introTitle: "Jste tu poprvé?",
      introText: "Klikněte na vzor a vyzkoušejte ho:",
      showMore: "+ ukázat více",
      showLess: "− ukázat méně",
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
      title: "Prague Streets",
      placeholder: "Street, area or stop, e.g. ^Na |ova$",
      matchCase: "Match case",
      matchDia: "Match diacritics",
      loading: "Loading data…",
      loadFailed: (msg) => `Failed to load the data (${msg}). Run scripts/fetch_streets.py and scripts/fetch_places.py first.`,
      idle: (counts) => `${counts}. Type a name or a regular expression.`,
      noMatch: "Nothing matches.",
      matches: (c) => joinList(["s", "a", "t"].filter((k) => c[k]).map((k) => `${fmt(c[k])} ${EN_FORMS[k][c[k] === 1 ? 0 : 1]}`), " and "),
      scopeGroup: "Search in",
      scopeAll: "All",
      scopeStreets: "Streets",
      scopeAreas: "Areas",
      scopeStops: "Stops",
      heads: { s: "Streets", a: "Areas", t: "Stops" },
      areaKind: { mc: "city district", ku: "cadastral area", ct: "neighbourhood" },
      modes: { metro: "metro", train: "train", tram: "tram", bus: "bus", funicular: "funicular", ferry: "ferry" },
      addGroup: "Add a group",
      removeGroup: "Remove group",
      placeholderMore: "Another group, e.g. dolní",
      groupName: (n) => `Group ${n}`,
      zoomAll: "zoom to all",
      more: (s) => `…and ${s} more`,
      invalid: "Invalid regex: ",
      starAdd: "Star this pattern",
      starRemove: "Remove from starred",
      removeAria: (p) => `Remove ${p} from starred`,
      starredTitle: "Starred",
      starredEmpty: "Click “save ☆” next to the results to keep a pattern here.",
      starSave: "save",
      starSaved: "saved",
      introTitle: "New here?",
      introText: "Click a pattern to try it:",
      showMore: "+ show more",
      showLess: "− show less",
      langGroup: "Language",
      sheetExpand: "Expand panel",
      sheetCollapse: "Collapse panel",
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      mapLocale: {},
    },
  };
  const LANG_KEY = "lang";
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
    for (const el of document.querySelectorAll("[data-i18n-title]")) el.title = T[el.dataset.i18nTitle];
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
    ? { bg: "#15161a", road: "#55565e", roadDim: "#2e2f35", hit: "#ff7a50", halo: "#15161a", label: "#ffd2c2", text: "#a3a3ab" }
    : { bg: "#f7f6f3", road: "#9a9aa0", roadDim: "#dddcd8", hit: "#e4572e", halo: "#ffffff", label: "#7a2410", text: "#5c5c62" };
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
  // "uložit ☆" / "uloženo ★": saves the whole set of patterns. It sits at the
  // end of the status line (search() puts it there after the count).
  const $star = Object.assign(document.createElement("button"), { id: "star", type: "button" });
  const $case = document.getElementById("opt-case");
  const $dia = document.getElementById("opt-diacritics");
  // What to search: everything ("all"), or only streets (s), areas (a) or stops (t).
  const $scope = document.getElementById("scope");
  const getScope = () => $scope.querySelector("input:checked").value;
  const setScope = (v) => { for (const r of $scope.querySelectorAll("input")) r.checked = r.value === v; };
  const inScope = (k) => getScope() === "all" || getScope() === k;
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
  // Where to pin a street's zoomed-out name tag, and on which side.
  //
  // The tag is pinned by one corner to the middle of the street's longest
  // line. Seen on screen, a street running up-right ("/") gets its tag to the
  // upper-left, any other street ("\", "-", "|") to the upper-right; a
  // straight line through the pin can then never pass under the tag.
  function tagPlacement(lines) {
    const len = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]);
    let best = lines[0], total = -1;
    for (const l of lines) {
      let s = 0;
      for (let i = 1; i < l.length; i++) s += len(l[i - 1], l[i]);
      if (s > total) { best = l; total = s; }
    }
    // Point at fraction `f` of the way along `best`.
    const at = (f) => {
      let rest = total * f;
      for (let i = 1; i < best.length; i++) {
        const d = len(best[i - 1], best[i]);
        if (d >= rest) {
          const t = d ? rest / d : 0;
          return [best[i - 1][0] + t * (best[i][0] - best[i - 1][0]), best[i - 1][1] + t * (best[i][1] - best[i - 1][1])];
        }
        rest -= d;
      }
      return best[best.length - 1];
    };
    // Overall direction of the middle part (ignores wiggles near the ends).
    const a = at(0.2), b = at(0.8);
    const sx = (b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180);
    const sy = -(b[1] - a[1]); // screen y points down
    return { point: at(0.5), side: sx * sy < 0 ? "up-left" : "up-right" };
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- map ----------------------------------------------------------------

  // Line width by zoom and road rank; `extra` px is added at every zoom.
  const width = (base, extra = 0) => [
    "interpolate", ["exponential", 1.6], ["zoom"],
    10, ["+", extra, ["*", base, ["match", ["get", "rank"], 0, 1.6, 1, 1.3, 2, 1.1, 3, 0.9, 4, 0.6, 5, 0.35, 0.25]]],
    16, ["+", extra, ["*", base * 6, ["match", ["get", "rank"], 0, 2.2, 1, 1.8, 2, 1.5, 3, 1.3, 4, 1.0, 5, 0.6, 0.45]]],
  ];

  // Filters on the "i" (index) of areas and stops.
  const NONE = ["==", ["get", "i"], -1];
  const idFilter = (ids) => ids.length ? ["match", ["get", "i"], ids, true, false] : NONE;

  // A shared link may carry the map view (map=zoom/lat/lng): open right there.
  const initialView = parseView(new URLSearchParams(location.hash.slice(1)).get("map"));

  const map = new maplibregl.Map({
    container: "map",
    ...(initialView
      ? { center: initialView.center, zoom: initialView.zoom }
      : { bounds: PRAGUE_BOUNDS, fitBoundsOptions: { padding: 20 } }),
    maxBounds: [[13.9, 49.8], [15.0, 50.3]],
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

  let streets = [];          // [{ name, folded, bbox }]
  let areas = [];            // [{ i, name, folded, bbox, k, lx, ly }]: parts of town (data/areas.geojson)
  let stops = [];            // [{ i, name, folded, bbox, m, lx, ly }]: public transport stops (data/stops.geojson)
  let currentMatches = [];   // names currently highlighted

  const getJSON = (url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  });

  map.on("load", async () => {
    let data, areaData, stopData;
    try {
      [data, areaData, stopData] = await Promise.all(
        ["data/streets.geojson", "data/areas.geojson", "data/stops.geojson"].map(getJSON));
    } catch (e) { setStatus(esc(T.loadFailed(e.message)), true); throw e; }
    // Areas and stops are found by their index "i" in the file.
    const indexed = (fc, extra) => fc.features.map((f, i) => {
      f.properties.i = i;
      const p = f.properties;
      return { i, name: p.name, folded: stripDia(p.name), bbox: p.bbox, lx: p.lx, ly: p.ly, ...extra(p) };
    }).sort((a, b) => a.name.localeCompare(b.name, "cs"));
    areas = indexed(areaData, (p) => ({ k: p.k }));
    stops = indexed(stopData, (p) => ({ m: p.m }));

    const tagPoints = []; // one point per street, for the zoomed-out name tags
    for (const f of data.features) {
      const name = f.properties.name;
      if (!name) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const line of f.geometry.coordinates)
        for (const [x, y] of line) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      streets.push({ name, folded: stripDia(name), bbox: [x0, y0, x1, y1] });
      const { point, side } = tagPlacement(f.geometry.coordinates);
      tagPoints.push({
        type: "Feature",
        properties: { name, rank: f.properties.rank, side },
        geometry: { type: "Point", coordinates: point },
      });
    }
    streets.sort((a, b) => a.name.localeCompare(b.name, "cs"));

    map.addSource("streets", {
      type: "geojson",
      data,
      attribution: T.attribution,
    });

    // Matching parts of town: a light tint under the roads, an outline over them.
    map.addSource("areas", { type: "geojson", data: areaData });
    map.addLayer({
      id: "area-fill", type: "fill", source: "areas", filter: NONE,
      paint: { "fill-color": C.hit, "fill-opacity": 0.12 },
    });

    // Draw less important roads first so major ones sit on top.
    const sortKey = ["-", 10, ["get", "rank"]];
    map.addLayer({
      id: "roads", type: "line", source: "streets",
      layout: { "line-cap": "round", "line-join": "round", "line-sort-key": sortKey },
      paint: { "line-color": C.road, "line-width": width(1) },
    });
    map.addLayer({
      id: "area-line", type: "line", source: "areas", filter: NONE,
      layout: { "line-join": "round" },
      paint: { "line-color": C.hit, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 15, 3], "line-opacity": 0.85 },
    });
    map.addLayer({
      id: "hits-casing", type: "line", source: "streets",
      filter: ["in", ["get", "name"], ["literal", []]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": C.halo, "line-width": width(1.6, 3), "line-opacity": 0.9 },
    });
    map.addLayer({
      id: "hits", type: "line", source: "streets",
      filter: ["in", ["get", "name"], ["literal", []]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": C.hit, "line-width": width(1.6, 1.5) },
    });
    // Names of all (non-matching) streets; matching streets use hit-labels.
    map.addLayer({
      id: "street-labels", type: "symbol", source: "streets",
      // Shown at every zoom; collision detection thins them out when zoomed
      // out, and the sort key gives major roads first claim on the space.
      filter: ["has", "name"],
      layout: {
        "symbol-placement": "line",
        "symbol-sort-key": ["get", "rank"],
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 11, 17, 13],
        "symbol-spacing": 350,
      },
      paint: { "text-color": C.text, "text-halo-color": C.bg, "text-halo-width": 1.5 },
    });
    // Zoomed in: matching names run along the street.
    map.addLayer({
      id: "hit-labels", type: "symbol", source: "streets",
      filter: ["in", ["get", "name"], ["literal", []]],
      minzoom: TAG_MAXZOOM,
      layout: {
        "symbol-placement": "line",
        "symbol-sort-key": ["get", "rank"],
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 13, 11, 17, 14],
        "symbol-spacing": 300,
      },
      paint: { "text-color": C.label, "text-halo-color": C.halo, "text-halo-width": 1.5 },
    });
    // Zoomed out: one horizontal name tag per matching street, centred on its
    // middle. Added last so it wins label collisions; overlapping tags are
    // dropped (major roads first) and reappear as you zoom in.
    map.addSource("tag-points", { type: "geojson", data: { type: "FeatureCollection", features: tagPoints } });
    map.addLayer({
      id: "hit-tags", type: "symbol", source: "tag-points",
      filter: ["in", ["get", "name"], ["literal", []]],
      maxzoom: TAG_MAXZOOM,
      layout: {
        "symbol-sort-key": ["get", "rank"],
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 13, 12],
        "text-padding": 3,
        // Pin the tag by a corner beside the street (see tagPlacement); if that
        // spot is taken by another tag, try the mirror-image corner, which is
        // just as clear of the street.
        "text-variable-anchor-offset": ["match", ["get", "side"],
          "up-left", ["literal", ["bottom-right", [-0.3, -0.2], "top-left", [0.3, 0.2]]],
          ["literal", ["bottom-left", [0.3, -0.2], "top-right", [-0.3, 0.2]]]],
      },
      paint: { "text-color": C.label, "text-halo-color": C.halo, "text-halo-width": 2 },
    });

    // Matching stops (every platform) and neighbourhoods that are only a point: dots.
    map.addSource("stops", { type: "geojson", data: stopData });
    const dot = (id, source, filter) => map.addLayer({
      id, type: "circle", source, filter,
      paint: {
        "circle-color": C.hit, "circle-stroke-color": C.halo, "circle-stroke-width": 1.5,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 5.5],
      },
    });
    dot("stop-dots", "stops", NONE);
    dot("area-dots", "areas", NONE);
    // Name tags of matching areas and stops at every zoom, each in its group's
    // colour ("c"); search() fills this source. Added after the street tags,
    // so these (usually fewer) win when they overlap; area names win over stops.
    map.addSource("place-tags", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "stop-tags", type: "symbol", source: "place-tags",
      filter: ["==", ["get", "k"], "t"],
      layout: {
        "symbol-sort-key": ["get", "o"],
        "text-field": ["get", "n"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 15, 13],
        "text-padding": 2,
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 0.7,
      },
      paint: { "text-color": ["get", "c"], "text-halo-color": C.halo, "text-halo-width": 2 },
    });
    map.addLayer({
      id: "area-tags", type: "symbol", source: "place-tags",
      filter: ["==", ["get", "k"], "a"],
      layout: {
        "symbol-sort-key": ["get", "o"],
        "text-field": ["get", "n"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 12, 15, 15],
        "text-padding": 3,
      },
      paint: { "text-color": ["get", "c"], "text-halo-color": C.halo, "text-halo-width": 2 },
    });

    readHash();
    // Without a view in the link, fit the whole city into the part of the
    // screen the panels leave free: on a phone, between the logo row and the
    // collapsed sheet; on a desktop, to the right of the panel column.
    if (!mapView) {
      map.fitBounds(PRAGUE_BOUNDS, {
        padding: isPhone()
          ? { top: 60, bottom: $sidebar.offsetHeight + 10, left: 10, right: 10 }
          : { top: 20, bottom: 20, left: $sidebar.getBoundingClientRect().right + 20, right: 20 },
        animate: false,
      });
    }

    setupHover();
    search();

    // Put the view in the URL whenever the user stops moving the map (drag,
    // scroll/pinch zoom, zoom buttons all carry originalEvent) or after we
    // zoomed to search results on their request (userMove). The startup fit
    // and views restored from a link are left out.
    map.on("moveend", (e) => {
      if (!e.originalEvent && !e.userMove) return;
      mapView = viewString();
      writeHash();
    });
  });

  // ---- search -------------------------------------------------------------

  const SEP = `<span class="sep" aria-hidden="true">·</span>`; // between items of the status line

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
  // patterns can be compared on one map. A street matching several groups gets
  // the colour of the first of them and is listed under each.

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
        `<span class="gcount"></span>` +
        `<button type="button" class="gremove" title="${esc(T.removeGroup)}" aria-label="${esc(T.removeGroup)}">` +
          `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` +
      `</div>`).join("");
    $groups.classList.toggle("multi", list.length > 1);
    $addGroup.hidden = list.length >= MAX_GROUPS;
    if (!$addGroup.hidden) $addGroup.style.setProperty("--g", GROUP_COLORS[list.length].line); // the new group's colour
    focusedGroup = Math.min(focusedGroup, list.length - 1);
    if (focused >= 0) groupInputs()[Math.min(focused, list.length - 1)].focus();
  }

  let listed = []; // streets in the result list, by data-i

  function search() {
    if (!streets.length) return;
    const pats = groupPatterns();
    // A different search than the last one makes the saved view stale: drop
    // it from the URL (it comes back once the map is moved again). The first
    // search after reading the URL keeps the view the link came with.
    const scope = getScope();
    const key = [...pats, $case.checked, $dia.checked, scope].join("\u0000");
    if (lastSearchKey !== null && key !== lastSearchKey) mapView = null;
    lastSearchKey = key;
    writeHash();
    markActiveSuggestion();

    const ignoreDia = !$dia.checked;
    const inputs = groupInputs();
    const groups = [];   // [{ i, p, re, s, a, t }] (matching streets, areas, stops) for every non-empty, valid row
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
      const test = (x) => re.test(ignoreDia ? x.folded : x.name);
      groups.push({
        i, p, re,
        s: inScope("s") ? streets.filter(test) : [],
        a: inScope("a") ? areas.filter(test) : [],
        t: inScope("t") ? stops.filter(test) : [],
      });
    });
    applyMatches(groups);
    const counts = (g) => ({ s: g.s.length, a: g.a.length, t: g.t.length });
    const union = (k) => [...new Set(groups.flatMap((g) => g[k]))];
    const all = { s: union("s"), a: union("a"), t: union("t") };
    const allList = [...all.s, ...all.a, ...all.t];
    // Each row shows its own number of matches (hover: per kind); empty or invalid rows show nothing.
    const rows = [...$groups.querySelectorAll(".search-row")];
    rows.forEach((row) => { const c = row.querySelector(".gcount"); c.textContent = ""; c.removeAttribute("title"); });
    for (const g of groups) {
      const c = rows[g.i].querySelector(".gcount");
      c.textContent = fmt(g.s.length + g.a.length + g.t.length);
      c.title = T.matches(counts(g)) || T.noMatch;
    }

    if (error) {
      setStatus(esc(error), true);
    } else if (!groups.length) {
      setStatus(esc(T.idle(T.matches({
        s: inScope("s") ? streets.length : 0, a: inScope("a") ? areas.length : 0, t: inScope("t") ? stops.length : 0,
      }))));
    } else if (!allList.length) {
      setStatus(esc(T.noMatch));
    } else {
      // "12 ulic a 3 zastávky · zobrazit vše · uložit ☆"; each group's own count is in its row.
      setStatus(esc(T.matches({ s: all.s.length, a: all.a.length, t: all.t.length })) +
        `<span class="nw">${SEP}<button id="zoom-all" type="button">${esc(T.zoomAll)}</button></span>` +
        `<span class="nw" id="star-slot">${SEP}</span>`);
      document.getElementById("star-slot").append($star);
      document.getElementById("zoom-all").addEventListener("click", () => zoomTo(allList));
    }

    // Result list: per group (a heading with its count when there are several),
    // then per kind (Ulice / Čtvrti / Zastávky headings only when searching all).
    listed = [];
    const items = [];
    const where = {
      s: () => "",
      a: (x) => T.areaKind[x.k],
      t: (x) => x.m.split(",").map((m) => T.modes[m] ?? m).join(", "),
    };
    for (const g of groups) {
      const colour = GROUP_COLORS[g.i].line;
      if (groups.length > 1)
        items.push(`<li class="head" style="--g:${colour}"><i class="gdot"></i>${pillText(g.p)} <span>${fmt(g.s.length + g.a.length + g.t.length)}</span></li>`);
      for (const k of ["s", "a", "t"]) {
        const hits = g[k];
        if (!hits.length) continue;
        if (scope === "all") items.push(`<li class="head kind">${esc(T.heads[k])} <span>${fmt(hits.length)}</span></li>`);
        for (const x of hits.slice(0, MAX_LIST)) {
          listed.push(x);
          const w = where[k](x);
          items.push(`<li data-i="${listed.length - 1}" title="${esc(x.name)}${w ? " · " + esc(w) : ""}" style="--g:${colour}">` +
            highlight(x.name, g.re, ignoreDia) + (w ? `<span class="where"> · ${esc(w)}</span>` : "") + "</li>");
        }
        if (hits.length > MAX_LIST) items.push(`<li class="more">${esc(T.more(fmt(hits.length - MAX_LIST)))}</li>`);
      }
    }
    $results.innerHTML = items.join("");
  }

  $results.addEventListener("click", (ev) => {
    const li = ev.target.closest("li[data-i]");
    if (li) zoomTo([listed[+li.dataset.i]]);
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
    const owner = new Map(); // street name -> index of the first group it matches
    for (const g of groups) for (const s of g.s) if (!owner.has(s.name)) owner.set(s.name, g.i);
    currentMatches = [...owner.keys()];
    const filter = ["in", ["get", "name"], ["literal", currentMatches]];
    for (const id of ["hits-casing", "hits", "hit-labels", "hit-tags"]) map.setFilter(id, filter);
    map.setFilter("street-labels", ["all", ["has", "name"], ["!", filter]]);
    map.setPaintProperty("roads", "line-color", currentMatches.length ? C.roadDim : C.road);

    // Colour by group: ["match", name, [names of group a], colour a, [names of group b], colour b, …, fallback]
    const byGroup = new Map();
    for (const [name, gi] of owner) {
      if (!byGroup.has(gi)) byGroup.set(gi, []);
      byGroup.get(gi).push(name);
    }
    const colour = (key, fallback) => {
      if (byGroup.size === 0) return fallback;
      if (byGroup.size === 1) return GROUP_COLORS[[...byGroup.keys()][0]][key];
      return ["match", ["get", "name"], ...[...byGroup].flatMap(([gi, names]) => [names, GROUP_COLORS[gi][key]]), fallback];
    };
    map.setPaintProperty("hits", "line-color", colour("line", C.hit));
    map.setPaintProperty("hit-labels", "text-color", colour("label", C.label));
    map.setPaintProperty("hit-tags", "text-color", colour("label", C.label));
    applyPlaceMatches(groups);
  }

  // Areas and stops: each belongs to the first group it matches (its colour).
  function applyPlaceMatches(groups) {
    const aOwner = new Map(), tOwner = new Map();
    for (const g of groups) {
      for (const a of g.a) if (!aOwner.has(a.i)) aOwner.set(a.i, g.i);
      for (const t of g.t) if (!tOwner.has(t.i)) tOwner.set(t.i, g.i);
    }
    // ["match", ["get", "i"], [ids of group a], colour a, …, fallback]
    const colourBy = (owner, key) => {
      const byGroup = new Map();
      for (const [id, gi] of owner) {
        if (!byGroup.has(gi)) byGroup.set(gi, []);
        byGroup.get(gi).push(id);
      }
      if (byGroup.size <= 1) return GROUP_COLORS[[...byGroup.keys()][0] ?? 0][key];
      return ["match", ["get", "i"], ...[...byGroup].flatMap(([gi, ids]) => [ids, GROUP_COLORS[gi][key]]), C.hit];
    };
    const af = idFilter([...aOwner.keys()]), tf = idFilter([...tOwner.keys()]);
    map.setFilter("area-fill", af);
    // (fill and line layers skip the point areas; the circle layer would draw
    // every corner of a polygon, so it only gets the points)
    map.setFilter("area-line", af);
    map.setFilter("area-dots", ["all", ["==", ["geometry-type"], "Point"], af]);
    map.setFilter("stop-dots", tf);
    const ac = colourBy(aOwner, "line");
    map.setPaintProperty("area-fill", "fill-color", ac);
    map.setPaintProperty("area-line", "line-color", ac);
    map.setPaintProperty("area-dots", "circle-color", ac);
    map.setPaintProperty("stop-dots", "circle-color", colourBy(tOwner, "line"));

    // Tags: areas in the group's line colour, biggest kinds first (o);
    // stops in its label colour, metro/train stations first.
    const kindOrder = { mc: 0, ku: 1, ct: 2 };
    const byI = (list) => new Map(list.map((x) => [x.i, x]));
    const areaByI = byI(areas), stopByI = byI(stops);
    const features = [];
    for (const [i, gi] of aOwner) {
      const a = areaByI.get(i);
      features.push({ type: "Feature", properties: { k: "a", n: a.name, c: GROUP_COLORS[gi].line, o: kindOrder[a.k] },
        geometry: { type: "Point", coordinates: [a.lx, a.ly] } });
    }
    for (const [i, gi] of tOwner) {
      const t = stopByI.get(i);
      const o = /metro|train/.test(t.m) ? 0 : /tram/.test(t.m) ? 1 : 2;
      features.push({ type: "Feature", properties: { k: "t", n: t.name, c: GROUP_COLORS[gi].label, o },
        geometry: { type: "Point", coordinates: [t.lx, t.ly] } });
    }
    map.getSource("place-tags").setData({ type: "FeatureCollection", features });
  }

  function zoomTo(list) {
    if (!list.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const { bbox } of list) {
      x0 = Math.min(x0, bbox[0]); y0 = Math.min(y0, bbox[1]);
      x1 = Math.max(x1, bbox[2]); y1 = Math.max(y1, bbox[3]);
    }
    let padding;
    if (isPhone()) {
      // Get the sheet out of the way, then fit between the logo and the sheet.
      setSheet(false);
      padding = { top: 70, bottom: $sidebar.offsetHeight + 24, left: 24, right: 24 };
    } else {
      const panelW = document.getElementById("panel").offsetWidth;
      padding = { top: 40, bottom: 40, right: 40, left: panelW + 40 };
    }
    // userMove: this was asked for, so moveend saves the new view in the URL.
    map.fitBounds([[x0, y0], [x1, y1]], { padding, maxZoom: 17 }, { userMove: true });
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

  function setupHover() {
    // Stops and point areas first, then streets, then the area under the mouse.
    const HOVER = ["stop-dots", "area-dots", "hits", "roads", "area-fill"];
    const describe = (f) => {
      const p = f.properties;
      if (f.layer.id === "stop-dots") return `${p.name} · ${p.m.split(",").map((m) => T.modes[m] ?? m).join(", ")}`;
      if (f.layer.id === "area-dots" || f.layer.id === "area-fill") return `${p.name} · ${T.areaKind[p.k]}`;
      return p.name;
    };
    map.on("mousemove", (e) => {
      const fs = map.queryRenderedFeatures(
        [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: HOVER }
      ).filter((f) => f.properties.name);
      const f = HOVER.map((id) => fs.find((f) => f.layer.id === id)).find(Boolean);
      if (!f) { $tip.hidden = true; map.getCanvas().style.cursor = ""; return; }
      $tip.textContent = describe(f);
      $tip.style.left = e.point.x + "px";
      $tip.style.top = e.point.y + "px";
      $tip.hidden = false;
      // Only streets are clickable (a click searches for that street).
      map.getCanvas().style.cursor = f.layer.id === "hits" || f.layer.id === "roads" ? "pointer" : "";
    });
    map.getCanvas().addEventListener("mouseleave", () => { $tip.hidden = true; });
    // Click a street to search for exactly that name.
    map.on("click", (e) => {
      const f = map.queryRenderedFeatures(
        [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]],
        { layers: ["hits", "roads"] }
      ).find((f) => f.properties.name);
      if (!f) return;
      const inputs = groupInputs();
      inputs[Math.min(focusedGroup, inputs.length - 1)].value =
        "^" + f.properties.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
      search();
    });
  }

  // ---- URL hash (shareable searches and map views) ------------------------
  //
  // #q=<pattern>[&q=<pattern 2>…]&in=s|a|t&case=1&dia=1&map=<zoom>/<lat>/<lng>
  // (one q per search group, in order; in= is left out when searching everything)
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
    setScope(["s", "a", "t"].includes(p.get("in")) ? p.get("in") : "all");
    $case.checked = p.get("case") === "1";
    // dia=1: match diacritics. Older links wrote dia=0 ("don't ignore"), same meaning.
    $dia.checked = p.get("dia") === "1" || p.get("dia") === "0";
    const view = parseView(p.get("map"));
    mapView = view ? p.get("map") : null;
    lastSearchKey = null;
    return view;
  }
  function writeHash() {
    const p = new URLSearchParams();
    for (const q of groupPatterns()) if (q) p.append("q", q);
    if (getScope() !== "all") p.set("in", getScope());
    if ($case.checked) p.set("case", "1");
    if ($dia.checked) p.set("dia", "1");
    let h = p.toString();
    if (mapView) h += (h ? "&" : "") + "map=" + mapView;
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }

  // ---- "New here?" / "Jste tu poprvé?" suggestions -------------------------

  // An entry is a pattern, or a list of patterns for a comparison (one per group).
  // Order matters: only the first three rows of pills show until "+ ukázat více".
  const SUGGESTIONS = [
    "Botič", "Beran", ".mírova", "Mich(a|e)lská", ["novo.+á$", "staro.+á$"],
    "nábřeží", "schod", "\\d. květ|květnového|máj", "(^| )chod", ["zahrad", "sad"],
    "dvor|dvůr", "^v?oticka", "st(i|y)chova",
    "Vltav", ["černo", "bělo", "kapitana"], "Padesát", "Milíčov", "Pra(z|h)", "Kamý", "Tábor",
    "žitná|ječná|pšeničná|ovesná", "lhot", "bojisti|cvicisti", ["generala", "plukovnika", "kapitana"]
  ];
  const $sugg = document.getElementById("suggestions");

  const asList = (entry) => (Array.isArray(entry) ? entry : [entry]);
  const entryKey = (entry) => JSON.stringify(asList(entry));
  const currentKey = () => JSON.stringify(groupPatterns().filter(Boolean));
  // Pattern text for a pill; spaces shown as a faint "␣" so "^Na " is unambiguous.
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

  const STAR_KEY = "starred-patterns";

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
    $star.textContent = on ? `${T.starSaved} ★` : `${T.starSave} ☆`;
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
  $groups.addEventListener("input", (e) => {
    if (!e.target.matches("input.q")) return;
    updateStar();
    clearTimeout(t);
    t = setTimeout(search, 120);
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
    search();
  });
  $case.addEventListener("change", search);
  $dia.addEventListener("change", search);
  $scope.addEventListener("change", search);
})();
