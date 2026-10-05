# UX-ELON-DELETE-4

**Tip before:** `a9a1dc8` (`docs(catalog-dri-freight-leftovers): mark Pages live`)
**Product commit:** `56fb9b8` `refactor(ux-elon-delete-4): drop unused sale-label aliases, duplicate size/CSS branches` — 3 files, **+66 / −50** (product UI **+18 / −50**, net **−32**). Product UI only: `js/flowsheet-app.js`, `flowsheet.css`. Tests unchanged (none asserted the deleted bits). `index.html` / `style.css` had nothing dead.

YAGNI. Network never Empire. Screening honesty left in place (one Overview honesty line; one Economics banner; offtake honesty on Overview + Economics). No TEA pack/price/SEC/CAPEX/freight retune. No MECH undo/pump/blower (`refreshLiftEconomics` and `undoLastDelete` left alone). No case cash numbers. Catalog chemistry untouched. `cases/dac.js` not deleted. Did not retry Ni/soda-ash/Ag/TiCl4/Zn/Pb/phosphoric/chlor-alkali/Li-metal.

Focus: UI added since `f3ac067` plus newly-orphaned helpers/labels/CSS after cement/cu-ew/float-glass/green-FT/green-MTO/green-H2-DRI Network adds, sizeToProduct adds, and freight tranches. Did not re-check or re-delete ux-elon-delete-3 work.

Product UI only: `js/flowsheet-app.js`, `flowsheet.css`. `index.html` / `style.css` had nothing dead. Tests unchanged (none asserted the deleted bits).

`npm test` → **534 pass / 0 fail**. Maglut annualNetCash **1298.91** (≈1299).

---

## Deleted (file:symbol) — why provably dead

| File:symbol | Why dead | Proof |
|---|---|---|
| `js/flowsheet-app.js:NETWORK_SALE_LABELS` aliases `H2`, `Li`, `ammonia`, `hydrogen`, `methanol`, `urea`, `ethylene`, `diesel`, `dri`, `water`, `cement`, `copper-cathode`, `cathode`, `poly-silicon`, `polysilicon`, `pv-module`, `ndpr-oxide`, `ndpr-oxide-separated`, `otherReo`, `dytb-oxide`, `lightReo` | Lookup keys never appear as a sale sink.id or as a sale-product substance any case emits. Live lookups are `NETWORK_SALE_LABELS[sink.id]` and `NETWORK_SALE_LABELS[slateSubstance]`. | Solved every shipped case: sale sink ids are `ammonia-product` / `methanol-product` / `urea-product` / `ethylene-product` / `diesel-product` / `cathode-product` / `cement-product` / `module` / `steel` / …; substances are `NH3` / `CH3OH` / `Urea` / `C2H4` / `C12H26` / `Cu` / `PortlandCement` / `PVmodule` / `Fe` / `LiCl` / … — those keys kept. `dri` is a converter id; `copper-cathode` is a TEA price key; `otherReo` is an iac-leach port; `H2`/`hydrogen` are not sold. `rg` of each dropped key in the map → definition only for the UI lookup. |
| `js/flowsheet-app.js:blockDiagnosis` `logistics ? 'process' : 'process'` | Both arms returned `'process'`. | Overwritten duplicate; collapsed to `declared ? 'port' : 'process'`. |
| `js/flowsheet-app.js:renderSite` duplicate `#sizeToTargetStatus` writers + duplicate `heatNote` | Both branches wrote the same element; both sizing modes built the same heat residual string. | `getElementById('sizeToTargetStatus')` twice with the same fallback `'Single-product physics tool.'` (also the HTML default). One writer; one `heatNote`. |
| `flowsheet.css:@media (max-width: 960px) .network-body` | Identical to `@media (max-width: 1200px) .network-body`. | Broader 1200px query already applies at ≤960px. |

## Checked, left in place

- Unused `refreshLiftEconomics` (MECH pump/blower — forbidden).
- Unused export alias `undoLastDelete: undoLast` (MECH undo — forbidden).
- Overview loaders, `data-demo-id` options, palette units with TEA packs.
- Catalog defs for MED/MSF/nuclear/solar-thermal/TES (and generic `dac` — tests `addNode('dac')`).
- Cite/evidence, header `#solveStatus` / `#balanceStatus`.
- One Overview honesty line; one Economics banner; offtake honesty on Overview + Economics.
- Freight/size disclosure UI that is actually rendered (`offtakeHonestyText` stream count; Size-to-target status; network freight row; economics freight ops row).
- `SIZE_PRODUCT_LABELS` matches `#sizeProduct` options (including copper added since f3ac067).
- `RIGHT_DISPLAY_LABELS` extras that cases emit (`concentratePurchase`, `quartzPurchase`, `limestonePurchase`, `clayPurchase`, `co2Purchase`, …). `RIGHT_KEYS` still gates the rights strip; labels kept for `humanizeUiText`.
- CSS that looks unused but is template-built: `hud-${id}`, `campus-water-${kind}`, `tone-${tone}`, `map-layer-chip--${tone}`, `node-gauge-${tone}`, `building-${profile}`.
- Duplicate CSS selectors that are media-query overrides (not identical): two `@media (max-width: 720px)` blocks hold different rules.
- `index.html` ids used for ARIA / `<details>` wrappers / tests. Script order of green-ft/green-mto/green-h2-dri left as shipped.
- `style.css` custom properties all have `var(--…)` readers after elon-delete-3.
- Economics “screening / not a PPA” copy is distinct sentences, not the same line 3+ times.

## Tests touched

None. Deleted symbols were not asserted.

## Tip

Feat `56fb9b8` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `56fb9b8`). `npm test` 534 pass / 0 fail. Maglut annualNetCash 1298.91 (≈1299). Prior checkout tip `a9a1dc8`.
