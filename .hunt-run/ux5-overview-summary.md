# UX5 Overview — decision board

**Base:** `3c0e6b8`  
**Scope:** brief §3.1 only (Overview). Economics §3.2 and Process §3.3 are not in this worktree.  
**Not pushed.**

Overview is a full-width decision board: site and solve chips, a capital-inclusive cash gate, a product slate table, a constraints list, site resource pairs, and a one-row action toolbar. Cases are a single select. Optimize draws a before/after net-cash delta board.

## Acceptance (§3.1)

| Check | Result | Evidence |
| --- | --- | --- |
| At ≥1200px, Overview uses ≥90% of panel width (not a centered ~960px article) | Pass | `.overview-dashboard` is `width: 100%`, `max-width: none`, `margin: 0`. Headless Chrome at 1400×900: panel 1400px, board 1400px (ratio 1.00), computed `max-width: none`, margin 0. Horizontal padding 16px. The old `min(720px)` / `max-width: 960px` column is gone. |
| Zabuye: slate is a table with ≥3 products; land and solar are numeric pairs; cash gate is visible without scrolling past demos | Pass | Cold start paints Lithium (lead), Potash, Salt with kg/d, t/y, $/y, share. Land 1.2 ha / solar land 1.1 ha. Yield 5.67 kWh/kWp·day (cited PVGIS-ERA5) / array 883.12 kWp. Water 0 kg/d (Zabuye caustic-water stream is zero; bromide is absent) / right assumed. Cash gate sits in the top strip (`top` 94px) reading **$2.4M / Above gate**. Cases select is below the zones (`top` 446px). |
| Cases picker is ≤1 row / one control; fuels are not equal-weight primary | Pass | One `#overviewCases` select. Materials optgroup (Zabuye, Dead Sea brine + NH₃) then `Fuels · screening cash−`. No demo button rail. At 1400px the toolbar is one 57px row: Optimize, Size one product, Cases. |
| Optimize still works; delta board appears after the run | Pass | Clicking Optimize on the loaded Zabuye plant ran `sizeForPositiveCashflow`. Delta board: Before $2.4M → **+$22M** → After $24M, objective met, 3 positive-sale products. Gate updated to $24M above gate. Clearing the plant or loading another case still hides the board (existing tests). |
| No new Empire wording; Network is not on Overview | Pass | Overview markup has no Empire string. Network stays on Economics. |

## Also required

| Check | Result |
| --- | --- |
| Model-first empty copy, not “Load a demo” | Pass. Empty honesty is “No plant loaded — pick a case or open Process.” Overview no longer says “Choose a site” or “Load a demo.” |
| Screening honesty stays one line | Pass. “Screening — not bankable (site rights unverified). Gate is R − OPEX − ann. CAPEX.” NPV/IRR stay on Economics. |
| Solve / size / demo load behavior kept | Pass. Same loaders (`loadZabuyeHub`, `loadAbundanceHub`, fuels, network). Case ids remain on the options (`loadZabuyeHub`, `loadMethanolPlant`, `data-demo-id`). Size-one-product disclosure unchanged. |
| Constraints list replaces the single issue card | Pass. Power, wiring, bottleneck, balance, brine-concession chip, and the China/Asia offtake note. Rows that can jump still open Process or Location rights. |

## Verification

- `npm test` — 207 pass, 0 fail (includes `Overview is a full-width decision board…`).
- Headless Chrome, Zabuye cold start, then Optimize click: 1400×900 desktop and 390×844 narrow. Narrow layout stacks the three zones (`grid-template-columns: 359px`) and the board still fills the panel (ratio 1.00). Gate stays above the cases control.

## Out of this worktree

- Economics grouping, waterfall, break-even card, Network-open-by-default (§3.2).
- Process tone, toolbar, palette filter, node chrome (§3.3). The Process empty canvas still says “Load a scenario on Overview.”
- Location preset placeholder still says “Choose a site…”.
- Re-picking the case already shown in the select does not reload it (`change` does not fire). Switching cases does. Optimize still runs on the open plant.
