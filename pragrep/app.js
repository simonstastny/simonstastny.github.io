/* Prague street map with regex search. */
(() => {
  "use strict";

  const PRAGUE_BOUNDS = [[14.224, 49.942], [14.707, 50.177]];
  const MAX_LIST = 300; // how many matching names to list in the panel
  const TAG_MAXZOOM = 14; // below this, matches get name tags instead of along-the-line labels

  // ---- language (Czech first, English second) -----------------------------

  const PLURAL = (lang, n, forms) => forms[new Intl.PluralRules(lang).select(n)] ?? forms.other;
  const I18N = {
    cs: {
      title: "Pražské ulice",
      placeholder: "Název ulice nebo regulární výraz, např. ^Na |ova$",
      matchCase: "VELKÁ/malá",
      matchDia: "Diakritika",
      labels: "Popisky",
      loading: "Načítám ulice…",
      loadFailed: (msg) => `Nepodařilo se načíst data ulic (${msg}). Nejdřív spusťte scripts/fetch_streets.py.`,
      idle: (n, s) => `${s} ${PLURAL("cs", n, { one: "ulice", few: "ulice", other: "ulic" })}. Napište název nebo regulární výraz.`,
      noMatch: "Žádná ulice neodpovídá.",
      matches: (n, s) => `${s} ${PLURAL("cs", n, { one: "odpovídající ulice", few: "odpovídající ulice", other: "odpovídajících ulic" })}`,
      count: (n, s) => `${s} ${PLURAL("cs", n, { one: "ulice", few: "ulice", other: "ulic" })}`,
      addGroup: "+ Přidat skupinu k porovnání",
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
      starredEmpty: "Přidejte vzor kliknutím na ☆ vedle vyhledávání",
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
      placeholder: "Street name or regex, e.g. ^Na |ova$",
      matchCase: "Match case",
      matchDia: "Match diacritics",
      labels: "Labels",
      loading: "Loading streets…",
      loadFailed: (msg) => `Failed to load street data (${msg}). Run scripts/fetch_streets.py first.`,
      idle: (n, s) => `${s} streets. Type a name or a regular expression.`,
      noMatch: "No matching streets.",
      matches: (n, s) => `${s} matching street${n === 1 ? "" : "s"}`,
      count: (n, s) => `${s} street${n === 1 ? "" : "s"}`,
      addGroup: "+ Add a group to compare",
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
      starredEmpty: "Click ☆ next to the search box to save a pattern here.",
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
  const $star = document.getElementById("star");
  const $case = document.getElementById("opt-case");
  const $dia = document.getElementById("opt-diacritics");
  const $labels = document.getElementById("opt-labels");
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
  let currentMatches = [];   // names currently highlighted

  map.on("load", async () => {
    const data = await fetch("data/streets.geojson").then((r) => {
      if (!r.ok) throw new Error(`data/streets.geojson: HTTP ${r.status}`);
      return r.json();
    }).catch((e) => { setStatus(esc(T.loadFailed(e.message)), true); throw e; });

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

    // Draw less important roads first so major ones sit on top.
    const sortKey = ["-", 10, ["get", "rank"]];
    map.addLayer({
      id: "roads", type: "line", source: "streets",
      layout: { "line-cap": "round", "line-join": "round", "line-sort-key": sortKey },
      paint: { "line-color": C.road, "line-width": width(1) },
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
    applyLabels();
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
        `<button type="button" class="gremove" title="${esc(T.removeGroup)}" aria-label="${esc(T.removeGroup)}">×</button>` +
      `</div>`).join("");
    $groups.querySelector(".search-row").appendChild($star); // ☆ saves the whole set; it sits on the first row
    $groups.classList.toggle("multi", list.length > 1);
    $addGroup.hidden = list.length >= MAX_GROUPS;
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
    const key = [...pats, $case.checked, $dia.checked].join("\u0000");
    if (lastSearchKey !== null && key !== lastSearchKey) mapView = null;
    lastSearchKey = key;
    writeHash();
    markActiveSuggestion();

    const ignoreDia = !$dia.checked;
    const inputs = groupInputs();
    const groups = [];   // [{ i, p, re, hits }] for every non-empty, valid row
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
      groups.push({ i, p, re, hits: streets.filter((s) => re.test(ignoreDia ? s.folded : s.name)) });
    });
    applyMatches(groups);
    const all = [...new Set(groups.flatMap((g) => g.hits))];

    if (error) {
      setStatus(esc(error), true);
    } else if (!groups.length) {
      setStatus(esc(T.idle(streets.length, fmt(streets.length))));
    } else if (!all.length) {
      setStatus(esc(T.noMatch));
    } else {
      // One group: "N odpovídajících ulic"; several: "● 13 ulic ● 7 ulic".
      const counts = groups.length === 1 ? esc(T.matches(all.length, fmt(all.length)))
        : groups.map((g) => `<span class="gcount" style="--g:${GROUP_COLORS[g.i].line}"><i class="gdot"></i>` +
            `${esc(T.count(g.hits.length, fmt(g.hits.length)))}</span>`).join("");
      setStatus(counts + `<button id="zoom-all" type="button">${esc(T.zoomAll)}</button>`);
      document.getElementById("zoom-all").addEventListener("click", () => zoomTo(all));
    }

    listed = [];
    const items = [];
    for (const g of groups) {
      const colour = GROUP_COLORS[g.i].line;
      if (groups.length > 1)
        items.push(`<li class="head" style="--g:${colour}"><i class="gdot"></i>${pillText(g.p)} <span>${fmt(g.hits.length)}</span></li>`);
      for (const s of g.hits.slice(0, MAX_LIST)) {
        listed.push(s);
        items.push(`<li data-i="${listed.length - 1}" title="${esc(s.name)}" style="--g:${colour}">${highlight(s.name, g.re, ignoreDia)}</li>`);
      }
      if (g.hits.length > MAX_LIST) items.push(`<li class="more">${esc(T.more(fmt(g.hits.length - MAX_LIST)))}</li>`);
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
    for (const g of groups) for (const s of g.hits) if (!owner.has(s.name)) owner.set(s.name, g.i);
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
  }

  function applyLabels() {
    const v = $labels.checked ? "visible" : "none";
    for (const id of ["street-labels", "hit-labels", "hit-tags"]) map.setLayoutProperty(id, "visibility", v);
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
    map.on("mousemove", (e) => {
      const f = map.queryRenderedFeatures(
        [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]],
        { layers: ["hits", "roads"] }
      ).find((f) => f.properties.name);
      if (!f) { $tip.hidden = true; map.getCanvas().style.cursor = ""; return; }
      $tip.textContent = f.properties.name;
      $tip.style.left = e.point.x + "px";
      $tip.style.top = e.point.y + "px";
      $tip.hidden = false;
      map.getCanvas().style.cursor = "pointer";
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
  // #q=<pattern>[&q=<pattern 2>…]&case=1&dia=1&labels=0&map=<zoom>/<lat>/<lng>
  // (one q per search group, in order)
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
    $case.checked = p.get("case") === "1";
    // dia=1: match diacritics. Older links wrote dia=0 ("don't ignore"), same meaning.
    $dia.checked = p.get("dia") === "1" || p.get("dia") === "0";
    $labels.checked = p.get("labels") !== "0";
    const view = parseView(p.get("map"));
    mapView = view ? p.get("map") : null;
    lastSearchKey = null;
    return view;
  }
  function writeHash() {
    const p = new URLSearchParams();
    for (const q of groupPatterns()) if (q) p.append("q", q);
    if ($case.checked) p.set("case", "1");
    if ($dia.checked) p.set("dia", "1");
    if (!$labels.checked) p.set("labels", "0");
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
    applyLabels();
    search();
  });
  $labels.addEventListener("change", () => { applyLabels(); writeHash(); });
  $case.addEventListener("change", search);
  $dia.addEventListener("change", search);
})();
