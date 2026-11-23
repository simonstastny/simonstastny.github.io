/* Praggle: connect two Prague districts with as few others as possible. */
(() => {
  "use strict";

  const PRAGUE_BOUNDS = [[14.224, 49.942], [14.707, 50.177]];
  const EXTRA_GUESSES = 5;                    // attempts = districts on a shortest route + this
  const PAIR_STEPS = { ku: [3, 6], mc: [3, 5] }; // borders crossed between start and end
  const MAX_SUGGEST = 6;
  const SET_KEY = "praggle-set";

  // ---- language (Czech first, English second) -----------------------------

  const PLURAL = (lang, n, forms) => forms[new Intl.PluralRules(lang).select(n)] ?? forms.other;
  const cs = (n, one, few, other) => PLURAL("cs", n, { one, few, other });
  const I18N = {
    cs: {
      title: "Praggle – spojte pražské čtvrti",
      langGroup: "Jazyk",
      setGroup: "Čtvrti",
      setKu: "Katastrální území",
      setMc: "Městské části",
      newGame: "Nová hra",
      loading: "Načítám…",
      loadFailed: (m) => `Nepodařilo se načíst data (${m}).`,
      task: (n) => `Spojte je co nejméně čtvrtěmi. Nejkratší cesta vede přes ${n}.`,
      timeLabel: "Čas",
      placeholder: "Napište čtvrť…",
      guessLabel: "Čtvrť",
      guessesLabel: "Pokusy",
      attempts: (n, max) => `Pokusy <b>${n}</b> / ${max}`,
      hint: "Nápověda",
      unknown: (q) => `„${q}“ tu není, vyberte čtvrť z nabídky.`,
      already: (n) => `${n} už máte.`,
      endpoint: (n) => `${n} je start nebo cíl.`,
      det: ["na trase", "zajížďka 1", "zajížďka 2", "mimo"],
      legRoute: "na nejkratší cestě", legExtra: "zajížďka", legEnds: "start a cíl",
      hinted: "nápověda",
      howTitle: "Jak hrát",
      howText: "Hádejte čtvrti, které spojí start s cílem. Každý pokus se obarví podle toho, jestli leží na nejkratší cestě; v seznamu uvidíte, o kolik je případná zajížďka delší. Hra končí, jakmile vede souvislá cesta od startu do cíle.",
      howScore: (n) => `Skóre: <b>0</b> nejkratší cesta ve správném pořadí, <b>+0</b> nejkratší cesta v jiném pořadí, <b>+1</b>, <b>+2</b>… každá čtvrť navíc. Nápověda přidá +1. Pokusů máte o ${n} víc, než má nejkratší cesta.`,
      doneHead: "Hotovo! Skóre",
      lostHead: "Došly pokusy",
      perfect: "perfektní: nejkratší cesta ve správném pořadí",
      otherOrder: "nejkratší cesta, jen v jiném pořadí",
      extra: (n) => `o ${n} ${cs(n, "čtvrť", "čtvrti", "čtvrtí")} navíc`,
      lostDesc: "Cesta zůstala nedokončená.",
      statTime: "čas",
      statGuesses: (n) => cs(n, "pokus", "pokusy", "pokusů"),
      statHints: (n) => cs(n, "nápověda", "nápovědy", "nápověd"),
      yourPath: "Vaše cesta",
      shortestPath: "Nejkratší cesta",
      extraList: (l) => `Navíc: ${l}.`,
      alsoShortest: (l) => `Nejkratší cesta je třeba ${l}.`,
      attribution: '© přispěvatelé <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      mapLocale: {
        "NavigationControl.ZoomIn": "Přiblížit",
        "NavigationControl.ZoomOut": "Oddálit",
        "AttributionControl.ToggleAttribution": "Zobrazit/skrýt zdroje dat",
      },
    },
    en: {
      title: "Praggle – connect Prague's districts",
      langGroup: "Language",
      setGroup: "Districts",
      setKu: "Cadastral areas",
      setMc: "City districts",
      newGame: "New game",
      loading: "Loading…",
      loadFailed: (m) => `Failed to load the data (${m}).`,
      task: (n) => `Connect them through as few districts as you can. The shortest route goes through ${n}.`,
      timeLabel: "Time",
      placeholder: "Type a district…",
      guessLabel: "District",
      guessesLabel: "Guesses",
      attempts: (n, max) => `Guesses <b>${n}</b> / ${max}`,
      hint: "Hint",
      unknown: (q) => `“${q}” isn't here; pick a district from the list.`,
      already: (n) => `You already have ${n}.`,
      endpoint: (n) => `${n} is the start or the end.`,
      det: ["on route", "detour 1", "detour 2", "off route"],
      legRoute: "on a shortest route", legExtra: "detour", legEnds: "start and end",
      hinted: "hint",
      howTitle: "How to play",
      howText: "Guess the districts that connect the start with the end. Each guess is coloured by whether it lies on a shortest route; the list shows how long a detour is. The game ends as soon as an unbroken route leads from start to end.",
      howScore: (n) => `Score: <b>0</b> a shortest route in order, <b>+0</b> a shortest route in another order, <b>+1</b>, <b>+2</b>… for each extra district. A hint adds +1. You get ${n} more guesses than the shortest route needs.`,
      doneHead: "Done! Score",
      lostHead: "Out of guesses",
      perfect: "perfect: a shortest route, in order",
      otherOrder: "a shortest route, in another order",
      extra: (n) => `${n} extra district${n === 1 ? "" : "s"}`,
      lostDesc: "The route stayed unfinished.",
      statTime: "time",
      statGuesses: (n) => (n === 1 ? "guess" : "guesses"),
      statHints: (n) => (n === 1 ? "hint" : "hints"),
      yourPath: "Your route",
      shortestPath: "Shortest route",
      extraList: (l) => `Extra: ${l}.`,
      alsoShortest: (l) => `A shortest route is e.g. ${l}.`,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      mapLocale: {},
    },
  };
  const LANG_KEY = "lang"; // shared with pragrep and czech grepublic: one language choice for all
  const lang = (() => {
    try { const v = localStorage.getItem(LANG_KEY); if (v && v in I18N) return v; } catch {}
    return "cs";
  })();
  const T = I18N[lang];

  function applyI18n() {
    document.documentElement.lang = lang;
    document.title = T.title;
    for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = T[el.dataset.i18n];
    for (const el of document.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = T[el.dataset.i18nPlaceholder];
    for (const el of document.querySelectorAll("[data-i18n-label]")) el.setAttribute("aria-label", T[el.dataset.i18nLabel]);
    for (const el of document.querySelectorAll("[data-i18n-title]")) el.title = T[el.dataset.i18nTitle];
    document.getElementById("how-score").innerHTML = T.howScore(EXTRA_GUESSES);
    for (const b of document.querySelectorAll("#lang [data-lang]")) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
      // Switching reloads the page so every text, including the map's, is redone.
      b.addEventListener("click", () => {
        if (b.dataset.lang === lang) return;
        try { localStorage.setItem(LANG_KEY, b.dataset.lang); } catch { return; }
        location.reload();
      });
    }
  }
  applyI18n();

  // ---- helpers ------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Lower case without diacritics, one output character per input character
  // (true for Czech), so match positions also work on the original name.
  const fold = (s) => [...s].map((c) => c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()[0] ?? c).join("");
  const fmtTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // ---- map ----------------------------------------------------------------

  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const C = dark
    ? { bg: "#15161a", road: "#30313a", base: "#1c1d22", edge: "#3a3b42" }
    : { bg: "#F7F6F2", road: "#DEDED8", base: "#F7F6F2", edge: "#d3d2cb" };
  // Pastel fill + a slightly deeper outline per state: start/end ("inactive"),
  // then detour 0 ("visited") and any detour ("extra stop"; the list still says
  // how far). Keep in sync with the --se/--d* colours in style.css.
  const EXTRA = { fill: "#F3D69A", line: "#d4ad55" };
  const PATH = {
    se: { fill: "#BFC5CE", line: "#8a929e" },
    0: { fill: "#B6DCCA", line: "#6fb394" },
    1: EXTRA,
    2: EXTRA,
    3: EXTRA,
  };
  const LABEL = "#303A43";
  const ST = ["coalesce", ["feature-state", "s"], "x"]; // a district's state, "x" when untouched
  const byState = (key, fallback) => ["match", ST, ...["se", "0", "1", "2", "3"].flatMap((s) => [s, PATH[s][key]]), fallback];

  const map = new maplibregl.Map({
    container: "map",
    bounds: PRAGUE_BOUNDS,
    fitBoundsOptions: { padding: 20 },
    maxBounds: [[13.9, 49.8], [15.0, 50.3]],
    attributionControl: { compact: true },
    locale: T.mapLocale,
    dragRotate: false,
    pitchWithRotate: false,
    style: {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {},
      layers: [{ id: "bg", type: "background", paint: { "background-color": C.bg } }],
    },
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  // ---- data ----------------------------------------------------------------

  // sets[key] = { fc, names, folded, nb, bbox }; nb[i] = indices of i's neighbours
  const sets = {};
  const getJSON = (url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  });
  function prepare(fc) {
    const names = [], nb = [], bbox = [];
    fc.features.forEach((f, i) => {
      f.id = i; // feature-state key
      names.push(f.properties.name);
      nb.push(f.properties.nb);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const poly of f.geometry.coordinates)
        for (const [x, y] of poly[0]) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      bbox.push([x0, y0, x1, y1]);
    });
    return { fc, names, folded: names.map(fold), nb, bbox };
  }
  function bfs(nb, from, allowed = null) {
    const dist = new Map([[from, 0]]), prev = new Map(), q = [from];
    for (let k = 0; k < q.length; k++) {
      const u = q[k];
      for (const v of nb[u]) {
        if (dist.has(v) || (allowed && !allowed.has(v))) continue;
        dist.set(v, dist.get(u) + 1);
        prev.set(v, u);
        q.push(v);
      }
    }
    return { dist, prev };
  }
  const pathTo = (prev, from, to) => {
    const p = [to];
    while (p[0] !== from) p.unshift(prev.get(p[0]));
    return p;
  };

  map.on("load", async () => {
    let ku, mc, streets;
    try {
      [ku, mc] = await Promise.all([getJSON("data/ku.geojson"), getJSON("data/mc.geojson")]);
    } catch (e) {
      $("task").textContent = T.loadFailed(e.message);
      throw e;
    }
    sets.ku = prepare(ku);
    sets.mc = prepare(mc);
    // Streets for orientation come from pragrep; the game works without them.
    streets = await getJSON("../pragrep/data/streets.geojson").catch(() => null);

    map.addSource("districts", { type: "geojson", data: ku, attribution: T.attribution });
    map.addLayer({
      id: "d-fill", type: "fill", source: "districts",
      paint: { "fill-color": byState("fill", C.base), "fill-opacity": ["case", ["==", ST, "x"], 0.7, 0.92] },
    });
    if (streets) {
      map.addSource("streets", { type: "geojson", data: streets });
      map.addLayer({
        id: "roads", type: "line", source: "streets", filter: ["<=", ["get", "rank"], 5],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.road,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, ["match", ["get", "rank"], [0, 1], 1.2, [2, 3], 0.8, 0.4],
            15, ["match", ["get", "rank"], [0, 1], 5, [2, 3], 3.5, 1.8]],
          "line-opacity": 0.8,
        },
      });
    }
    // Grey borders of all districts, then the coloured ones of guessed districts on top.
    map.addLayer({
      id: "d-edge", type: "line", source: "districts",
      layout: { "line-join": "round" },
      paint: { "line-color": C.edge, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 15, 1.6] },
    });
    map.addLayer({
      id: "d-line", type: "line", source: "districts",
      layout: { "line-join": "round" },
      paint: {
        "line-color": byState("line", C.edge),
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 15, 3],
        "line-opacity": ["case", ["==", ST, "x"], 0, 1],
      },
    });
    // Names of the start, the end and every guessed district.
    map.addSource("labels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "d-labels", type: "symbol", source: "labels",
      layout: {
        "text-field": ["get", "n"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 12, 15, 16],
        "text-padding": 2,
        "symbol-sort-key": ["get", "o"],
      },
      paint: { "text-color": LABEL, "text-halo-color": "#ffffff", "text-halo-width": 2 },
    });

    let saved = null;
    try { saved = localStorage.getItem(SET_KEY); } catch {}
    setSet(saved in sets ? saved : "ku");
    $("guess").disabled = false;
    newGame();
  });

  // ---- game -----------------------------------------------------------------

  let setKey = "ku";
  let game = null; // { start, end, ds, de, D, min, limit, guesses: [{ i, det, hint }], over, won, t0, t1 }
  let ticker = null;

  const $set = $("set");
  function setSet(key) {
    setKey = key;
    for (const r of $set.querySelectorAll("input")) r.checked = r.value === key;
    try { localStorage.setItem(SET_KEY, key); } catch {}
    map.getSource("districts")?.setData(sets[key].fc);
  }
  $set.addEventListener("change", (e) => {
    setSet(e.target.value);
    newGame();
  });

  function newGame() {
    const S = sets[setKey];
    if (!S) return;
    const [lo, hi] = PAIR_STEPS[setKey];
    let start, end, ds;
    // A random start, then a random end the right number of borders away.
    for (let tries = 0; tries < 100; tries++) {
      start = Math.floor(Math.random() * S.names.length);
      ds = bfs(S.nb, start).dist;
      const ends = [...ds].filter(([, d]) => d >= lo && d <= hi).map(([i]) => i);
      if (ends.length) { end = pick(ends); break; }
    }
    const de = bfs(S.nb, end).dist;
    const D = ds.get(end);
    game = { start, end, ds, de, D, min: D - 1, limit: D - 1 + EXTRA_GUESSES, guesses: [], over: false, won: false, t0: performance.now(), t1: null };

    map.removeFeatureState({ source: "districts" });
    map.setFeatureState({ source: "districts", id: start }, { s: "se" });
    map.setFeatureState({ source: "districts", id: end }, { s: "se" });

    $("from").textContent = S.names[start];
    $("to").textContent = S.names[end];
    $("task").textContent = T.task(game.min);
    $("guess").value = "";
    $("guess").disabled = false;
    hideSuggest();
    setMsg("");
    clearInterval(ticker);
    ticker = setInterval(tick, 250);
    tick();
    render();
    fitTo([start, end]);
    if (!isPhone()) $("guess").focus();
  }
  $("new-game").addEventListener("click", newGame);
  $("again").addEventListener("click", newGame);

  function tick() {
    $("time").textContent = fmtTime((game.t1 ?? performance.now()) - game.t0);
  }

  const used = (i) => i === game.start || i === game.end || game.guesses.some((g) => g.i === i);
  const detour = (i) => game.ds.get(i) + game.de.get(i) - game.D;

  function addGuess(i, hint = false) {
    if (!game || game.over || used(i)) return;
    const det = detour(i);
    game.guesses.push({ i, det, hint });
    map.setFeatureState({ source: "districts", id: i }, { s: String(Math.min(det, 3)) });
    const route = currentRoute();
    if (route) finish(true, route);
    else if (game.guesses.length >= game.limit) finish(false);
    render();
    // Game over: show the whole route and every guess (render() first: the panel's height changed).
    if (game.over) { $("guess").blur(); fitTo(fitIds()); }
  }

  // The route from start to end through guessed districts, if there is one
  // (a shortest one among them), else null.
  function currentRoute() {
    const allowed = new Set([game.start, game.end, ...game.guesses.map((g) => g.i)]);
    const { dist, prev } = bfs(sets[setKey].nb, game.start, allowed);
    return dist.has(game.end) ? pathTo(prev, game.start, game.end) : null;
  }

  function finish(won, route = null) {
    game.over = true;
    game.won = won;
    game.route = route;
    game.t1 = performance.now();
    clearInterval(ticker);
    tick();
    hideSuggest();
    $("guess").disabled = true;
    // Lost: show a shortest route on the map, unguessed parts in plain green.
    if (!won) {
      const sp = pathTo(bfs(sets[setKey].nb, game.start).prev, game.start, game.end);
      game.shortest = sp;
      for (const i of sp.slice(1, -1)) if (!used(i)) map.setFeatureState({ source: "districts", id: i }, { s: "0" });
    }
  }

  // A hint: the next district on a shortest route, next to what is already
  // connected to the start. Costs +1 and uses an attempt.
  function hint() {
    if (!game || game.over) return;
    const S = sets[setKey];
    const allowed = new Set([game.start, game.end, ...game.guesses.map((g) => g.i)]);
    const reach = bfs(S.nb, game.start, allowed).dist;
    const onRoute = (i) => !used(i) && detour(i) === 0;
    let best = null;
    for (const u of reach.keys())
      for (const v of S.nb[u])
        if (onRoute(v) && (best === null || game.ds.get(v) > game.ds.get(best))) best = v;
    if (best === null) best = [...game.ds.keys()].filter(onRoute).sort((a, b) => game.ds.get(a) - game.ds.get(b))[0];
    if (best !== undefined && best !== null) addGuess(best, true);
  }
  $("hint").addEventListener("click", hint);
  // Don't take the focus from the guess box: on phones that would close the keyboard.
  $("hint").addEventListener("mousedown", (e) => { if (document.activeElement === $("guess")) e.preventDefault(); });

  // ---- rendering --------------------------------------------------------------

  function render() {
    const S = sets[setKey];
    const g = game.guesses;
    const hints = g.filter((x) => x.hint).length;

    $("attempts").innerHTML = T.attempts(g.length, game.limit);
    $("bar").innerHTML = Array.from({ length: game.limit }, (_, k) =>
      `<i${k < g.length ? ` class="c-${Math.min(g[k].det, 3)}"` : ""}></i>`).join("");
    $("hint").disabled = game.over;
    $("guesses").innerHTML = g.map((x, k) =>
      `<li><span class="n">${k + 1}</span><i class="dot c-${Math.min(x.det, 3)}"></i>` +
      `<span class="name">${esc(S.names[x.i])}</span>` +
      `<span class="det">${x.hint ? esc(T.hinted) + " · " : ""}${esc(T.det[Math.min(x.det, 3)])}</span></li>`).join("");
    $("how").hidden = g.length > 0 || game.over;
    $("play").hidden = game.over;
    $("result").hidden = !game.over;
    if (game.over) renderResult(hints);

    // Map labels: start, end, guesses (and on a loss the revealed route).
    const shown = new Set([game.start, game.end, ...g.map((x) => x.i), ...(game.shortest ?? [])]);
    map.getSource("labels").setData({
      type: "FeatureCollection",
      features: [...shown].map((i) => ({
        type: "Feature",
        properties: { n: S.names[i], o: i === game.start || i === game.end ? 0 : 1 },
        geometry: { type: "Point", coordinates: [S.fc.features[i].properties.lx, S.fc.features[i].properties.ly] },
      })),
    });
    updateSheetHeight();
  }

  function chips(route) {
    const S = sets[setKey];
    return route.map((i, k) => {
      const cls = k === 0 || k === route.length - 1 ? "c-se" : `c-${Math.min(detour(i), 3)}`;
      return `<span class="chip ${cls}">${esc(S.names[i])}</span>`;
    }).join('<span class="to">→</span>');
  }

  function renderResult(hints) {
    const S = sets[setKey];
    const g = game.guesses;
    $("stat-time").textContent = fmtTime(game.t1 - game.t0);
    $("stat-guesses").textContent = g.length;
    $("stat-guesses-l").textContent = T.statGuesses(g.length);
    $("stat-hints").textContent = hints;
    $("stat-hints-l").textContent = T.statHints(hints);

    if (!game.won) {
      $("result-head").textContent = T.lostHead;
      $("score").textContent = "–";
      $("score-desc").textContent = T.lostDesc;
      $("path-head").textContent = T.shortestPath;
      $("path").innerHTML = chips(game.shortest);
      $("path-note").textContent = "";
      return;
    }
    // Score: districts guessed beyond a shortest route, plus 1 per hint.
    // 0 = a shortest route guessed in order from the start; +0 = in another order.
    const extra = g.length + hints - game.min;
    const chain = [game.start, ...g.map((x) => x.i), game.end];
    const inOrder = chain.every((v, k) => k === 0 || S.nb[chain[k - 1]].includes(v));
    const perfect = extra === 0 && inOrder;
    $("result-head").textContent = T.doneHead;
    $("score").textContent = perfect ? "0" : `+${extra}`;
    $("score-desc").textContent = perfect ? T.perfect : extra === 0 ? T.otherOrder : T.extra(extra);
    $("path-head").textContent = T.yourPath;
    $("path").innerHTML = chips(game.route);
    const onRoute = new Set(game.route);
    const extras = g.filter((x) => !onRoute.has(x.i)).map((x) => S.names[x.i]);
    const notes = [];
    if (extras.length) notes.push(T.extraList(extras.join(", ")));
    if (game.route.length - 2 > game.min) {
      const sp = pathTo(bfs(S.nb, game.start).prev, game.start, game.end);
      notes.push(T.alsoShortest(sp.slice(1, -1).map((i) => S.names[i]).join(" → ")));
    }
    $("path-note").textContent = notes.join(" ");
  }

  // ---- the guess box and its suggestions --------------------------------------

  const $guess = $("guess"), $suggest = $("suggest"), $msg = $("msg");
  let suggestions = [], active = 0;

  function setMsg(text) {
    $msg.textContent = text;
    $guess.parentElement.classList.toggle("bad", !!text);
  }

  function updateSuggest() {
    const q = fold($guess.value.trim());
    if (!q || !game || game.over) return hideSuggest();
    const S = sets[setKey];
    const hits = [];
    S.folded.forEach((f, i) => {
      if (used(i)) return;
      const pos = f.indexOf(q);
      if (pos < 0) return;
      // Name starts with it, then a word in it starts with it, then anywhere.
      const rank = pos === 0 ? 0 : /[\s-]/.test(f[pos - 1]) ? 1 : 2;
      hits.push({ i, pos, rank });
    });
    // numeric: "Praha 2" before "Praha 10"
    hits.sort((a, b) => a.rank - b.rank || S.names[a.i].localeCompare(S.names[b.i], "cs", { numeric: true }));
    suggestions = hits.slice(0, MAX_SUGGEST);
    active = 0;
    if (!suggestions.length) return hideSuggest();
    $suggest.innerHTML = suggestions.map(({ i, pos }, k) => {
      const n = S.names[i];
      return `<li role="option" id="sg-${k}" data-k="${k}" aria-selected="${k === active}">` +
        `${esc(n.slice(0, pos))}<b>${esc(n.slice(pos, pos + q.length))}</b>${esc(n.slice(pos + q.length))}</li>`;
    }).join("");
    $suggest.hidden = false;
    $guess.setAttribute("aria-expanded", "true");
    $guess.setAttribute("aria-activedescendant", "sg-0");
  }
  function hideSuggest() {
    suggestions = [];
    $suggest.hidden = true;
    $guess.setAttribute("aria-expanded", "false");
    $guess.removeAttribute("aria-activedescendant");
  }
  function setActive(k) {
    active = (k + suggestions.length) % suggestions.length;
    for (const li of $suggest.children) li.setAttribute("aria-selected", String(+li.dataset.k === active));
    $guess.setAttribute("aria-activedescendant", `sg-${active}`);
  }
  function choose(i) {
    $guess.value = "";
    hideSuggest();
    setMsg("");
    addGuess(i);
    if (!game.over) $guess.focus();
  }
  function submit() {
    const raw = $guess.value.trim();
    if (!raw) return;
    if (suggestions.length) return choose(suggestions[active].i);
    // No suggestion left: an exact name that is already in play, or unknown.
    const S = sets[setKey];
    const i = S.folded.indexOf(fold(raw));
    if (i < 0) return setMsg(T.unknown(raw));
    setMsg(i === game.start || i === game.end ? T.endpoint(S.names[i]) : T.already(S.names[i]));
  }

  $guess.addEventListener("input", () => { setMsg(""); updateSuggest(); });
  $guess.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && suggestions.length) { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp" && suggestions.length) { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "Escape") { $guess.value = ""; hideSuggest(); setMsg(""); }
  });
  // mousedown, not click: keep the focus in the box.
  $suggest.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-k]");
    if (!li) return;
    e.preventDefault();
    choose(suggestions[+li.dataset.k].i);
  });
  $guess.addEventListener("blur", () => { setTyping(false); setTimeout(hideSuggest, 100); });
  $guess.addEventListener("focus", () => { setTyping(true); updateSuggest(); });

  // ---- layout -------------------------------------------------------------------

  const phoneMQ = matchMedia("(max-width: 640px)"); // keep in sync with style.css
  const isPhone = () => phoneMQ.matches;
  const $sidebar = $("sidebar");

  function updateSheetHeight() {
    document.documentElement.style.setProperty("--sheet-h", isPhone() ? $sidebar.offsetHeight + "px" : "0px");
  }
  new ResizeObserver(updateSheetHeight).observe($sidebar);

  // Typing on a phone: the panel shrinks to the guess box and the hint button
  // (body.typing in style.css), and the map refits into the space left above it.
  function setTyping(on) {
    on = on && isPhone() && document.activeElement === $guess;
    if (document.body.classList.contains("typing") === on) return;
    document.body.classList.toggle("typing", on);
    refitSoon();
  }

  // Where the browser lets the keyboard cover the page instead of shrinking it
  // (iOS Safari; Chrome on Android shrinks it, see the viewport meta tag), lift
  // the panel above the keyboard. Closing the keyboard (Android's back button)
  // keeps the focus in the box, so leave typing mode then too.
  const vv = window.visualViewport;
  let vvHeight = vv ? vv.height : innerHeight;
  function onViewport() {
    const h = vv ? vv.height : innerHeight;
    if (vv) {
      const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty("--kb", isPhone() ? kb + "px" : "0px");
    }
    // A big change is the keyboard opening or closing, not the address bar.
    if (Math.abs(h - vvHeight) > 120) {
      if (h > vvHeight && document.activeElement === $guess && isPhone()) $guess.blur();
      refitSoon();
    }
    vvHeight = h;
  }
  (vv ?? window).addEventListener("resize", onViewport);
  vv?.addEventListener("scroll", onViewport);

  // Once the keyboard and the panel have settled, show start, end and the guesses again.
  let refitTimer;
  function refitSoon() {
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => {
      if (!game || !isPhone()) return;
      map.resize();
      fitTo(fitIds());
    }, 250);
  }

  // What the map shows: start, end and the guesses; when the game is over also
  // a shortest route.
  const fitIds = () => [game.start, game.end, ...game.guesses.map((g) => g.i),
    ...(game.over ? game.shortest ?? [] : [])];

  // Fit the map to some districts in the part of the screen the panel leaves free.
  function fitTo(ids) {
    const S = sets[setKey];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of ids) {
      const b = S.bbox[i];
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    }
    const padding = isPhone()
      ? { top: document.body.classList.contains("typing") ? 20 : 60, left: 20, right: 20,
          bottom: Math.max(0, map.getContainer().getBoundingClientRect().bottom - $sidebar.getBoundingClientRect().top) + 20 }
      : { top: 40, bottom: 40, right: 60, left: $sidebar.getBoundingClientRect().right + 40 };
    map.fitBounds([[x0, y0], [x1, y1]], { padding, maxZoom: 14, duration: 600 });
  }
})();
