# UX-ELON-DELETE-2

**Tip before:** `c2be082` (`docs(catalog-float-glass): mark Pages live`)
**Product commit 1:** `a35790e` `refactor(ux-elon-delete-2): drop dead More-units palette, legacy gauges, duplicate Overview chips` — 5 files, **+16 / −143** (net **−127**)
**Product commit 2:** leftover triplicate `escapeHtml` + unused CSS (this follow-up). Product UI only: `index.html`, `js/flowsheet-app.js`, `flowsheet.css`. Tests updated only where they asserted the deleted hollow bits. `style.css` had nothing dead.

YAGNI. Network never Empire. Screening honesty left in place (one Overview honesty line; one Economics banner). No TEA pack/price/SEC retune. No MECH undo/pump/blower. No case cash numbers. `refreshLiftEconomics` left alone (pump/blower).

`npm test` → **456 pass / 0 fail**.

---

## Deleted (file:symbol) — why provably dead

| File:symbol | Why dead | Proof |
|---|---|---|
| `js/flowsheet-app.js:PALETTE_MORE_UNITS` | Always `[]`. `paletteCategory` returns `''` when no cards, so “More units” never rendered. | `rg PALETTE_MORE_UNITS` was only the empty const + one concat call. Tests already required `>More units<` absent from the palette. |
| `js/flowsheet-app.js:paletteCategory extraClass` | Only caller was the empty More-units concat. | `rg extraClass js/flowsheet-app.js` → those three lines. |
| `js/flowsheet-app.js:renderPalettes` More-units concat | Concatenated a guaranteed-empty string. | `paletteCategory('More units', [], …)` → `''`. |
| `js/flowsheet-app.js:setActiveDemo` `[data-demo]` + `[data-demo-id]` `is-selected` | No `data-demo=` in HTML. Cases are `<option>`s; select `value` is the live state. No CSS for `option.is-selected`. | `rg data-demo=` HTML/JS → 0. `rg is-selected flowsheet.css` → 0. |
| `js/flowsheet-app.js:nodeMeterChip` | Never called. Face paint uses `faceStatusModel` / `renderFaceStatus`. | `rg nodeMeterChip` → definition only. Not on `__FLOWSHEET_APP__`. Not in tests. |
| `js/flowsheet-app.js:renderHubGauge` | Unreachable. Comment said “retained for tests/callers”; neither exists. | `rg renderHubGauge` → definition only. Tests 0. |
| `js/flowsheet-app.js:renderMeterChip` | Unreachable. Replaced by face status. | `rg renderMeterChip` → definition only. Tests 0. |
| `js/flowsheet-app.js:mirrorOverviewChips` | Copied header `#solveStatus`/`#balanceStatus` onto Overview duplicates. | Only caller was `renderOverview`. Header chips remain. |
| `index.html:#overviewSolveChip` / `#overviewBalanceChip` / `.overview-chips` | Duplicate status lines of the header chips. | `rg overviewSolveChip` JS was only the mirror. Tests never asserted these ids. |
| `flowsheet.css:.palette-more` | Selector never matched (empty category never emitted). | `rg palette-more` HTML/JS after delete → 0. |
| `flowsheet.css:.demo-menu` / `.demo-menu-actions` | Process demo menu removed in UX-ABC. No DOM. | `rg demo-menu` HTML/JS → 0. |
| `flowsheet.css:.btn-ghost` | Class never applied. | `rg btn-ghost` HTML/JS → 0. |
| `flowsheet.css:.site-map-cite` | Live cite uses `#siteMapLegendCite` / `.site-map-legend-cite`. | `rg site-map-cite` HTML/JS → 0. |
| `flowsheet.css:.network-detail` | Class never applied. | `rg network-detail` HTML/JS → 0. |
| `flowsheet.css:.overview-chips` | Wrapper died with the duplicate chips. | HTML gone. |
| `js/flowsheet-app.js:escapeHtml` (2nd + 3rd defs) | Three `function escapeHtml` in one IIFE; later declarations overwrite. First copy omitted `'`. | `rg 'function escapeHtml'` → 3 defs, no tests. Kept the apostrophe-safe body once. |
| `flowsheet.css:.network-metrics` | Class never applied. Live rollup is `#networkMetrics.strip-metrics`. | `rg network-metrics` HTML/JS → 0. |
| `flowsheet.css:.stage-actions .primary-action` | Empty rule (`/* shared filled amber */`). No Process primary on `.stage-actions`. | Body was a comment only. |

## Kept on purpose

- Every Overview case option still has a working loader (`loadZabuyeHub` … `loadDemoNetwork`).
- Palette units with TEA packs (including Crust metals now on the default palette).
- Cite/evidence links, screening-honesty notices (one per panel).
- `refreshLiftEconomics` (MECH pump/blower, even though unused).
- Catalog defs for MED/MSF/nuclear/solar-thermal/TES (saved factories / tests).
- `data-demo-id` on `<option>`s (tests + documentation of case ids).
- Header `#solveStatus` / `#balanceStatus`.

## Tests touched

- `tests/flowsheet-ui.test.js`: assert More-units constant/CSS **absent** (was present-but-hidden).
- `tests/catalog-sial.test.js`: same; Crust still listed in `PALETTE_CATEGORIES`.

## Left on the tree (not this ticket)

- `refreshLiftEconomics` unused helper (MECH).
- Economics “screening / not a PPA” copy is distinct sentences, not the same line 3+ times.
- README still says “default More palette” in one historical sentence (docs, not UI).

## Tip

Feat `a35790e` on `main`, plus this follow-up. Pages published: https://akarshgopal.github.io/ultimat-sim/. `npm test` 456 pass / 0 fail. Prior checkout tip `c2be082`.
