# UX-ELON-DELETE-3

**Tip before:** `dd22b3f` (`docs(network-cement-cu-glass): mark Pages live`)
**Product commit:** `refactor(ux-elon-delete-3): drop unused CSS vars, dead labels, duplicate branches` — 3 files, **+3 / −12** (net **−9**). Product UI only: `js/flowsheet-app.js`, `flowsheet.css`, `style.css`. Tests unchanged (none asserted the deleted bits). `index.html` had nothing dead.

YAGNI. Network never Empire. Screening honesty left in place (one Overview honesty line; one Economics banner; offtake honesty on Overview + Economics). No TEA pack/price/SEC retune. No MECH undo/pump/blower (`refreshLiftEconomics` and `undoLastDelete` left alone). No case cash numbers. Catalog chemistry untouched. `cases/dac.js` not deleted.

`npm test` → **508 pass / 0 fail**. Maglut annualNetCash **1298.91** (≈1299).

---

## Deleted (file:symbol) — why provably dead

| File:symbol | Why dead | Proof |
|---|---|---|
| `style.css:--accent-muted` | Custom property defined, never read. | `rg accent-muted` → definition only. No `var(--accent-muted)` in HTML/JS/CSS. |
| `style.css:--focus-ring-teal` | Custom property defined, never read. | `rg focus-ring-teal` → definition only. Live focus uses `--focus-ring`. |
| `js/flowsheet-app.js:buildingProfile combustion-heat` | Unit id never exists. | `rg combustion-heat` → that branch only. No catalog/engine/tests unit. |
| `js/flowsheet-app.js:RIGHT_DISPLAY_LABELS.aluminaPurchase` | Lookup key never appears as a site right. | `rg aluminaPurchase` → definition only. Silicon uses `bauxitePurchase`; no alumina-purchase case. |
| `js/flowsheet-app.js:NETWORK_SALE_LABELS.Li2CO3` | Sink id never used. | `rg Li2CO3` → that label only. Lithium sinks are `lithium`. |
| `js/flowsheet-app.js:matchingPresetId` `named ? '' : ''` | Both arms returned `''`. | Overwritten duplicate; `return ''`. |
| `js/flowsheet-app.js:sourceLegend` dual Intake settings | Both `material-source` arms returned the same string. | Always-same; collapsed to one ternary. |
| `flowsheet.css:@media (max-width: 720px) .stage-actions` | Identical to `@media (max-width: 820px) .stage-actions`. | Broader 820px query already applies at ≤720px. |

## Checked, left in place

- Unused `refreshLiftEconomics` (MECH pump/blower — forbidden).
- Unused export alias `undoLastDelete: undoLast` (MECH undo — forbidden).
- Overview loaders, `data-demo-id` options, palette units with TEA packs.
- Catalog defs for MED/MSF/nuclear/solar-thermal/TES (and generic `dac` — tests `addNode('dac')`).
- Cite/evidence, header `#solveStatus` / `#balanceStatus`.
- CSS that looks unused but is template-built: `hud-${id}`, `campus-water-${kind}`, `tone-${tone}`, `map-layer-chip--${tone}`, `node-gauge-${tone}`, `building-${profile}`.
- Duplicate CSS selectors that are media-query overrides (not dead).
- `index.html` ids used for ARIA / `<details>` wrappers / tests.
- Economics “screening / not a PPA” copy is distinct sentences, not the same line 3+ times.

## Tests touched

None. Deleted symbols were not asserted.

## Tip

Feat SHA and Pages URL filled after push/deploy.
