# Handoff: Secret Hitler — Pass-and-Play Companion App

## Overview
A single-device ("pass-and-play") companion web app for the social deduction board game **Secret Hitler**. One phone holds all game state and is passed around the table: it deals secret roles, runs the night phase, shuffles and manages the policy deck, tracks the two policy boards, the election tracker, term limits, presidential powers, and win conditions. Nominations and voting happen out loud at the table; players tap the app only to record results and to view secret information privately.

The app is **bilingual (English / Czech)** and persists the full game to `localStorage` so a locked screen or refresh never loses progress.

> ⚖️ **Licensing note (important).** Secret Hitler is by Mike Boxleiter, Tommy Maranges & Max Temkin (art by Mackenzie Schubert), released under **Creative Commons BY-NC-SA 4.0**. This app reimplements only the *rules and text* with **original artwork** (none of the original art is used). Any reimplementation must remain **non-commercial**, keep the attribution (see the Rules overlay's "Credits & License" block), and be shared under the **same CC BY-NC-SA 4.0** license (ShareAlike).

## About the Design Files
The file in this bundle — `Secret Hitler.dc.html` — is a **design reference created in HTML**, a working prototype showing the intended look, behavior, and complete game logic. It is **not production code to copy directly**.

It is authored as a "Design Component" (a proprietary HTML format with a small custom template runtime — `<sc-if>`, `<sc-for>`, `{{ }}` bindings — and a `class Component extends DCLogic` logic class). **Do not try to reuse the DC runtime.** Instead, **recreate this design in the target codebase's environment** (React, Vue, Svelte, SwiftUI, native, etc.) using its established patterns. If no codebase exists yet, **React + TypeScript** is a natural fit for this app (it's a self-contained state machine with no backend).

The good news: all game logic is plain, framework-agnostic JavaScript in one class and ports almost verbatim to a reducer/store. Treat the logic class as a spec for the rules engine, and the template as a spec for the visuals.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are all specified below and should be recreated faithfully. Exact hex values, the type scale, and the layout rules are in the Design Tokens section.

---

## Architecture at a glance
The app is a **single-screen state machine**. One state field, `screen`, selects which view renders. There is no routing and no backend. All other state describes the game.

```
screen ∈ {
  setup, deal-gate, deal-reveal, night, dashboard, chan-pick,
  gate, pres-draw, chan-enact, veto, policy-result, power-pick,
  inv-result, peek, exec-result, over
}
plus a boolean `showRules` overlay that can sit on top of any screen.
```

### Core state shape
```js
{
  lang: 'en' | 'cs',
  screen: <see above>,
  count: 5..10,                 // player count chosen at setup
  useNames: boolean,            // name players, or use "Player N"
  drafts: string[10],           // name input buffer
  players: [{ name, role, alive, investigated }],  // role: 'liberal'|'fascist'|'hitler'
  deck: ('F'|'L')[],            // draw pile, shuffled
  discard: ('F'|'L')[],
  lib: 0..5, fas: 0..6,         // enacted policy counts
  tracker: 0..3,                // failed-election (chaos) tracker
  presidentIdx, chancellorIdx, lastPresIdx, lastChanIdx,  // indices into players
  round: number,
  dealIndex: number,            // which player is viewing their role
  drawn: ('F'|'L')[],           // policies in hand during legislative session
  sel: number|null,             // selected card index
  pendingPower: 'investigate'|'peek'|'special'|'execute'|null,
  invTarget: number|null,
  specialReturnFrom: number|null,  // restores rotation after Special Election
  vetoRefused: boolean,
  reshuffled: boolean,          // deck was reshuffled this draw (show notice)
  chaos: boolean,               // last policy was forced by the tracker
  lastEnacted: 'F'|'L'|null,
  execName: string,
  gate: { name, subKey, subName, btnKey, next } | null,  // generic "pass the phone" interstitial
  winner: 'liberal'|'fascist'|null,
  winKey: string,               // i18n key for the win reason
  winName: string,              // player name used in the win reason
  showRules: boolean
}
```

### Rules engine — exact constants & functions (port these verbatim)

**Role distribution** by player count — liberals = `{5:3, 6:4, 7:4, 8:5, 9:5, 10:6}`; the rest are fascists; exactly 1 is Hitler. (So fascists = count − liberals − 1.)

**Deck:** 11 Fascist + 6 Liberal policy cards, shuffled (Fisher–Yates).

**Fascist-track presidential powers** depend on player count:
- 5–6 players: `{3:'peek', 4:'execute', 5:'execute'}`
- 7–8 players: `{2:'investigate', 3:'special', 4:'execute', 5:'execute'}`
- 9–10 players: `{1:'investigate', 2:'investigate', 3:'special', 4:'execute', 5:'execute'}`

The number key is the count of enacted **fascist** policies that triggers the power.

**Term limits (chancellor eligibility):** the last elected Chancellor is always ineligible to be nominated Chancellor. The last elected President is *also* ineligible **only when more than 5 players are alive**. The sitting President is never eligible. (After a chaos enactment, both `lastPresIdx`/`lastChanIdx` reset → term limits forgotten.)

**Legislative session:** President draws top 3 of deck → discards 1 (to discard pile) → Chancellor enacts 1 of remaining 2 (other → discard pile). If the draw pile has fewer than 3 (or fewer than 1 for chaos/peek), shuffle the discard pile back in first and flag `reshuffled`.

**Election tracker / chaos:** each failed vote increments `tracker`. At `tracker === 3`, the **top policy of the deck is enacted automatically** (chaos): no power granted, term limits reset, tracker resets to 0.

**Veto:** available only when `fas === 5` and not already refused this session. If the President consents, both policies are discarded, the tracker advances (and can trigger chaos), and the round ends. If refused, the Chancellor must enact.

**Win conditions:**
- Liberals win at **lib === 5**, or when **Hitler is executed**.
- Fascists win at **fas === 6**, or when **Hitler is elected Chancellor while fas ≥ 3**.

**President rotation:** `nextAlive(presidentIdx)` clockwise, skipping dead players. **Special Election** sets the next president to a chosen player and stores `specialReturnFrom`; the following round resumes rotation from the original seat.

---

## Screens / Views

All screens render inside a phone-width frame: **max-width 430px**, full viewport height (`100dvh`), centered on a `#1A1511` backdrop. Two background modes: **paper** (`#F2E6CE`, public screens) and **ink** (`#26201A`, secret/"eyes only" screens). Each screen carries a `data-screen-label` for context.

### 1. Setup — `screen: 'setup'` (paper)
- **Purpose:** choose language, player count, optional names; start the game.
- **Layout:** vertical stack, 28px/26px padding, 26px gaps.
- **Header row:** `space-between`, top-aligned. Left: kicker "PASS-AND-PLAY COMPANION" (13px). Right: a flex group (gap 10px) holding a **"?" help button** then the **EN/CZ language switcher**. Both are "stamp" controls: `3px solid #26201A` border + `3px 3px 0 #26201A` hard shadow. The active language cell is filled ink (`#26201A` bg, paper text); inactive is paper bg, ink text. The "?" opens the Rules overlay.
- **Title:** "Secret / Hitler" (or "Tajný / Hitler"), Grenze Gotisch 800, **60px**, line-height 0.95, two lines.
- **Intro paragraph:** 15px, `#6B5A43`.
- **Player-count stepper:** bordered panel (`3px solid #26201A`, fill `#EFE0C2`, shadow `6px 6px 0`). Label "PLAYERS AT THE TABLE" (13px `#B4543B`). Row: a **−** button, the count number (Grenze 800, **72px**, nudged up 7px via `translateY(-7px)` for optical centering), a **+** button. − and + are 58×58px, `3px solid #26201A` border, 32px glyph. Range clamped **5–10**. Below: role summary line ("3 LIBERALS · 1 FASCIST · 1 HITLER"), 13px `#DD5126`, with correct Czech pluralization.
- **Name toggle:** label "NAME THE PLAYERS?" then two equal buttons "NO — NUMBERS" / "YES — NAMES"; the selected one is filled ink. When "YES": a 2-column grid of text inputs (border `3px solid #26201A`, bg `#EFE0C2`, 15px), placeholders "Player 1"…"Player N".
- **Primary CTA:** "DEAL THE ROLES" — full-width ink button (`#26201A` bg, paper text, 15px 700, shadow `5px 5px 0 rgba(38,32,26,0.25)`).

### 2. Deal Gate — `screen: 'deal-gate'` (ink)
- **Purpose:** "pass the phone to <player>" interstitial before each player privately views their role.
- Top row (`space-between`, amber `#E8A03C`): "DEALING ROLES" / "n OF m". Centered: kicker "PASS THE PHONE TO" (`#9C8E76`), player name (Grenze 800, **60px**, paper), instruction (15px `#D8CBAE`). Bottom: outlined amber button "I AM <NAME> — REVEAL".

### 3. Role Reveal — `screen: 'deal-reveal'` (ink)
- **Purpose:** show one player their secret role privately.
- Top row: player name (`#9C8E76`) / "EYES ONLY" (`#DD5126`), both 13px.
- **The role card** (centered): `4px solid #F2E6CE` border, fill `#EFE0C2`, shadow `8px 8px 0 rgba(0,0,0,0.45)`, with a `stampIn` entrance animation (`scale(1.5) rotate(-3deg)` → identity, 0.35s ease-out).
  - **Band:** "SECRET ROLE", paper text, 13px 700, letter-spacing 0.32em. Band background is **role-colored**: `#46688B` for Liberal, `#DD5126` for Fascist/Hitler.
  - **Role word:** Grenze 800, **60px**, color = `#46688B` liberal / `#DD5126` fascist / `#26201A` hitler; text-shadow `3px 3px 0` (`#26201A`, or `#DD5126` for Hitler).
  - **Party line:** "PARTY MEMBERSHIP: LIBERAL/FASCIST" (Hitler reads FASCIST), 13px `#6B5A43`.
  - **Intel block** (dashed top border) — only for Fascists and Hitler:
    - Fascist sees: "YOUR FELLOW CONSPIRATORS", then "Fascist(s): …" and "Hitler: <name>" (15px).
    - Hitler in **5–6 player** games sees his single fascist ("YOUR CONSPIRATOR" / "Your fascist is …"); in **7+** games sees "YOU STAND ALONE" / "You do not know your fascists — but they know you."
  - **Memo line** below card: fascists "MEMORIZE IT. TRUST NO ONE.", liberals "FIND HITLER. SAVE THE REPUBLIC." (13px `#9C8E76`).
- Bottom: paper button "HIDE & PASS THE PHONE". Advances to next player, or to Night after the last.

### 4. Night Phase — `screen: 'night'` (paper)
- **Purpose:** scripted eyes-closed ritual, read aloud.
- Kicker "PUBLIC — READ ALOUD" (`#B4543B`). Title "Lights out." (Grenze 800, **60px**). Intro (15px). Then a numbered step list: each step is a 34×34px ink square with a Grenze number (20px) + step text (15px). **Steps differ by player count** — 5–6 players use the simple mutual-reveal script; 7+ use the thumb script (Hitler keeps eyes closed, raises thumb; fascists identify him). Bottom CTA "TO THE FIRST ELECTION".

### 5. Dashboard — `screen: 'dashboard'` (paper) — the hub
- **Header (ink bar):** "Round N" (Grenze 700, 30px) on the left; right side has "ELECTION" (11px amber) and a **"?" help button** (34×34, `2px solid #E8A03C`, amber).
- **President card:** bordered panel. Flex row, **bottom-aligned** (`align-items: flex-end`). Left column: "PRESIDENT" label (13px `#B4543B`) + president name (Grenze 700, 30px). Right column (`text-align:right`, flex column, `justify-content: space-between`, so its label tops-aligns and its value bottoms-aligns with the president name): "NOT ELIGIBLE AS CHANCELLOR" label + the term-limited names (or "Everyone may serve").
- **Fascist track:** label row ("FASCIST POLICIES" 13px `#DD5126` / "n / 6"). Then 6 equal cells (height 58px, gap 5px):
  - Enacted cell: fill `#DD5126`, `3px solid #26201A`, **centered dark diamond** (20px square, `rotate(45deg)`, `#26201A`).
  - Power cell (unfilled, has a power): fill `#EFE0C2`, **`3px dashed #B4543B`**, power name label (8px 700, `#B4543B`, wraps) — e.g. INVESTIGATE LOYALTY / **LUSTRACE**, POLICY PEEK / NAHLÉDNUTÍ NA ZÁKONY, SPECIAL ELECTION / MIMOŘÁDNÁ VOLBA, EXECUTION / POPRAVA.
  - 6th cell: "WIN" label.
  - Plain empty cell: fill `#EFE0C2`, `3px solid #26201A`.
- **Liberal track:** same pattern, 5 cells, enacted fill `#46688B` with a **centered cream circle** (22px, `#F2E6CE`, `border-radius:50%`); 5th cell "WIN".
- **Tracker + Deck row** (`space-between`): left "ELECTION TRACKER" (13px) with 3 dots (filled `#26201A` per failed vote, empty `#EFE0C2`, each `3px solid #26201A`) and a note — "3 FAILS = CHAOS", or "ONE MORE = CHAOS" in `#DD5126` when tracker is 2. Right "DECK" (13px) with two 11px lines: "n TO DRAW" / "n DISCARDED".
- **The Table:** "THE TABLE" label, then a wrapped row of player chips. Sitting president chip is filled ink; alive players are outlined ink; dead players are `#B4543B`, struck through, 0.55 opacity.
- **Footer actions:** instruction line ("<PRESIDENT> NOMINATES A CHANCELLOR. VOTE OUT LOUD, THEN RECORD:") + two buttons: **"VOTE PASSED"** (filled ink) and **"VOTE FAILED"** (outlined). Passed → Chancellor Pick. Failed → tracker++ (or chaos at 3) and next round.

### 6. Chancellor Pick — `screen: 'chan-pick'` (paper)
- Kicker "GOVERNMENT ELECTED". Title "Who is / Chancellor?" (Grenze 800, **50px**, two lines). Sub: "Tap the player the table just elected alongside President <name>." Then a 2-column grid of eligible-player buttons (bordered `#EFE0C2` panels, 15px 700, shadow `4px 4px 0`). Term-limited / president / dead players are excluded; a footnote lists who's term-limited. Selecting Hitler when `fas ≥ 3` → instant Fascist win.

### 7. Pass Gate — `screen: 'gate'` (ink, generic)
- Reusable "pass the phone to <name>" interstitial used before any private screen (president draw, chancellor enact, policy peek, investigation). Kicker "CONFIDENTIAL" (`#DD5126`), "PASS THE PHONE TO", name (Grenze **60px**), a context sub-line, and an outlined amber CTA whose label varies ("REVEAL THE POLICIES" / "SHOW THE TOP THREE" / "OPEN THE DOSSIER"). Driven by the `gate` state object; `gate.next` is the screen to advance to.

### 8. President Draw — `screen: 'pres-draw'` (ink)
- Kicker "PRESIDENT <NAME> — EYES ONLY" (amber). Title "Draw three. / Discard one." (Grenze 800, **60px**, two lines). Optional reshuffle notice. Then the **3 drawn policies as vertical rows** (each: fill = party color, `4px` border, shadow `5px 5px 0`, a 30px diamond/circle symbol + the party word at 15px). **Tapping a card selects it for discard** — selected card greys out (`grayscale(0.9)`, opacity 0.55), shifts right 12px, gets a gold (`#E8A03C`) border. Then "DISCARD THE SELECTED POLICY" (amber button) appears; before selection a muted "TAP THE POLICY TO DISCARD" placeholder sits in the button slot.

### 9. Chancellor Enact — `screen: 'chan-enact'` (ink)
- Same row/card pattern as President Draw, but **2 cards**. Kicker "CHANCELLOR <NAME> — EYES ONLY". Title "Two policies. / Enact one." Sub "The other is discarded face-down. Say nothing." The **confirm button is colored to match the selected policy** — `#46688B` (liberal) or `#DD5126` (fascist) — and reads "ENACT THE LIBERAL/FASCIST POLICY". If `fas === 5`, an outlined `#DD5126` "PROPOSE THE VETO" button also shows. If a veto was refused, a red note appears.

### 10. Veto — `screen: 'veto'` (paper)
- Kicker "PUBLIC — VETO POWER". Title "The veto / is proposed." Body explains the President must consent and that the tracker advances. Two buttons: "I CONSENT — DISCARD BOTH" (ink) and "I REFUSE — THE CHANCELLOR MUST ENACT" (outlined).

### 11. Policy Result — `screen: 'policy-result'` (full-bleed party color)
- Whole screen is `#DD5126` (fascist) or `#46688B` (liberal). Kicker "PUBLIC ANNOUNCEMENT". Big headline "A Fascist/Liberal policy is enacted." (Grenze 800, **60px**). Count line ("FASCIST POLICIES: n OF 6"). If chaos, a bordered explanatory box. If a power unlocked, a bordered "POWER UNLOCKED" box naming it. CTA "UNLOCK THE POWER" or "TO THE NEXT ROUND". Foreground color flips with bg: fascist uses ink text, liberal uses paper text.

### 12. Power Pick — `screen: 'power-pick'` (paper)
- Kicker "PRESIDENTIAL POWER — PUBLIC CHOICE". Title = power name (Grenze 800, **60px**). Description varies by power. 2-column grid of valid target buttons (Investigate excludes already-investigated players; all exclude the president and the dead).

### 13. Investigation Result — `screen: 'inv-result'` (ink)
- Private to the president. "THE DOSSIER ON" + target name (Grenze 700, 42px). A **stamp** (same style as the role card) showing "PARTY MEMBERSHIP" + the party word (Grenze 800, 54px, party-colored), with `stampIn` animation. Note: "Hitler's membership card reads Fascist. You may lie about what you saw." CTA "CONCEAL & CONTINUE".

### 14. Policy Peek — `screen: 'peek'` (ink)
- Private to the president. "The next three." Shows the top 3 deck cards as rows, each numbered (Grenze 800, 30px) with symbol + party word. They stay in place. CTA "CONCEAL & CONTINUE".

### 15. Execution Result — `screen: 'exec-result'` (paper)
- "<name> / is executed." (Grenze 800, **60px**). Body clarifies they were not Hitler (if they had been, the game would already be over). CTA "TO THE NEXT ROUND".

### 16. Game Over — `screen: 'over'` (full-bleed winner color)
- Bg `#46688B` (liberal win) or `#DD5126` (fascist win). Kicker "THE GAME IS OVER". Title "The Liberals/Fascists win." (Grenze 800, **60px**). Reason sentence. Then a **full role reveal** table (paper card, `4px` border): every player with their role word (Grenze 700, 21px, role-colored); executed players struck through with an "EXECUTED" tag. Buttons: "NEW GAME — SAME PLAYERS" (re-deals with same roster) and "BACK TO SETUP".

### 17. Rules overlay — `showRules: true` (ink, fixed, scrollable)
- Covers any screen (`position: fixed; inset: 0;` over a `rgba(20,16,12,0.6)` scrim, 430px-wide ink panel). Header "The Rules" (Grenze 800, 60px) + a ✕ close button. Sections (each: 13px amber `#E8A03C` heading + 15px `#D8CBAE` body): This Table, Each Round, Term Limits, Fascist Track Powers (computed for the current count), The Veto, How It Ends, then a **"Credits & License"** block (attribution + tappable links to secrethitler.com and the CC BY-NC-SA 4.0 deed), and finally an outlined red "ABANDON GAME — BACK TO SETUP" button.

---

## Interactions & Behavior
- **No drag, no timers.** Everything is tap-to-advance. The one animation is `stampIn` (role card & dossier stamp): `@keyframes stampIn { from { transform: scale(1.5) rotate(-3deg); opacity:0 } to { transform: scale(1) rotate(0); opacity:1 } }`, 0.35s ease-out.
- **Card selection** (draw/enact): tap toggles `sel`; selected card greys out + shifts + gold border; a confirm button appears only once something is selected.
- **Privacy gating:** every screen that shows secret info is preceded by an ink "pass the phone" gate so the device changes hands face-down. Secret screens are ink-colored; public screens are paper/party-colored. Preserve this two-mode convention.
- **Abandon** prompts a native `confirm()` before resetting to setup (keeps language + count + names).
- **Language switch** is instant and re-renders all copy, including mid-game; every user-facing string is keyed, and stored game references (gate sub-lines, win reasons) are stored as **keys + names**, not baked strings, so they translate retroactively.

## State Management
- Single source of truth (the state object above); a screen field drives a switch of views. Port the `Component` class to your store of choice (Redux/Zustand/useReducer/etc.). Every method that mutates (`startGame`, `chanPick`, `confirmDiscard`, `confirmEnact`, `applyEnact`, `doChaos`, `continueFromResult`, `pickPowerTarget`, `advanceRoundPatch`, veto handlers) is a pure-ish transition you can lift directly.
- **Persistence:** write the entire state to `localStorage['secret-hitler-game-v1']` on every change; load it on mount. This is what makes the pass-and-play / lock-screen-safe behavior work — keep it.
- **i18n:** two dictionaries (`en`, `cs`) of strings and string-functions (for interpolation/pluralization). `S()` returns the active dictionary. Czech requires the pluralization helpers already written (e.g. 3 liberálové vs 6 liberálů, 1 fašista vs 2 fašisté) — keep those rules.

---

## Design Tokens

### Colors (8 core + support)
| Token | Hex | Role |
|---|---|---|
| Ink | `#26201A` | Text, borders, dark/secret backgrounds |
| Paper | `#F2E6CE` | Light backgrounds, text on ink |
| Panel | `#EFE0C2` | Card/box/input fill on paper |
| Fascist | `#DD5126` | Fascist party; also danger/secret accents (EYES ONLY, chaos, abandon) |
| Liberal | `#46688B` | Liberal party (semantic only) |
| Accent (on dark) | `#E8A03C` | Kickers/borders/buttons on ink screens |
| Accent (on paper) | `#B4543B` | Kickers + dashed power-slot borders on paper |
| Secondary text (paper) | `#6B5A43` | Captions/descriptions on paper |
| Secondary text (dark) | `#9C8E76` | Dim sub-captions on ink |
| Body text (dark) | `#D8CBAE` | Body paragraphs on ink |
| Backdrop | `#1A1511` | Behind the phone frame |

Rule of thumb: **accent and secondary-text colors switch with the background** — amber/tan on ink, rust/brown on paper. Shadows are flat offset blocks (no blur): `Npx Npx 0 <ink or rgba(38,32,26,…)>`. Overlay scrim `rgba(20,16,12,0.6)`.

### Typography
Two families only:
- **Grenze Gotisch** (Google Fonts, weights 500/600/700/800) — all display headlines. Blackletter, so it is **only ever used in mixed case, never ALL CAPS**.
- **Oswald** (Google Fonts, 400/500/600/700) — all UI, labels, body.

**Display scale (Grenze Gotisch):** 72 (count number) · 60 (hero headlines) · 50 (chancellor pick) · 42 (legislative/dossier headlines) · 30 (dashboard round + president name, peek number) · 21 (game-over role words).

**Text scale (Oswald), after consolidation:** **15** body + all buttons + card labels + emphasis · **13** labels/captions/section headers · **11** micro labels (dashboard chips, tracker/deck) · **8** policy-track power labels. Uppercase labels use letter-spacing 0.10–0.32em; body is normal tracking. (Control glyphs sit outside the text scale: 32px stepper +/−, 20px night-step numerals, 17–18px icon buttons.)

### Spacing / shape
- Phone frame: max-width **430px**, `100dvh`.
- Screen padding: ~28–32px vertical, 24–28px horizontal.
- Borders: **3px solid #26201A** for panels/controls (4px on the role card/stamp); power slots **3px dashed #B4543B**.
- **No border radius anywhere** — hard corners are part of the woodcut/poster aesthetic. (Symbols are the only round things: the liberal circle.)
- Shadows: flat offset blocks only — `3px 3px 0`, `4px 4px 0`, `5px 5px 0`, `6px 6px 0`, `8px 8px 0`.
- Track cells 58px tall; stepper buttons 58×58; help button 34×34 (dashboard) / ~40px (setup).

### Assets
**None external.** All "art" is CSS: flat color blocks, the rotated-square (diamond) and circle policy symbols, offset shadows, and the two web fonts. No images, no icon library, no SVG. The "?" and "✕" are plain text glyphs. This keeps the app fully offline-capable and license-clean (no original Secret Hitler artwork).

---

## Files
- `Secret Hitler.dc.html` — the complete design reference: all 17 screens, the full rules engine (`class Component`), and both language dictionaries. Open it in a browser to play through and observe exact behavior, then implement against your codebase. (Ignore the `support.js`/DC-runtime mechanics — only the template markup and the logic class are the spec.)

## Suggested implementation order
1. Port the **rules engine** (constants, role deal, deck, legislative session, powers, win checks, term limits) into a tested reducer/store — this is the heart and is framework-agnostic.
2. Wire **persistence** (localStorage or platform equivalent) and the **screen switch**.
3. Build screens in dependency order: Setup → Deal/Reveal → Night → Dashboard → Chancellor Pick → Gate → Draw/Enact → Result → Powers → Game Over → Rules overlay.
4. Add **i18n** (port both dictionaries verbatim, including the Czech pluralization helpers).
5. Apply the **design tokens** for pixel-faithful styling.
