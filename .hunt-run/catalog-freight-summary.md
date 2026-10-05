# CATALOG-FREIGHT (screening honesty layer)

Optional cited freight $/kg on TEA binds so Mejillones BOM/Bayer cash is no longer silent plant-gate. Screening honesty, not a routing/GIS model and not a carrier contract. Cash is capital-inclusive (R − OPEX − annualized CAPEX). Sign is recorded, not forced. Packs, product prices, and SEC are **untouched**. MECH undo/pump/blower untouched.

## What landed

- `freightBands` in `data/tea-screening.js`: `chile-coast-container` $0.08/kg, `bulk-dry-shortsea` $0.03/kg, `none` $0/kg plant-gate. `getFreight(id)` plus optional `extra.freight` on `bindSale` / `bindCost`. Default binds (no freight key) stay plant-gate (`freightUsdPerKg` absent).
- `bindCost` keeps `unitCost` as material. Economics charges `(unitCost + freightUsdPerKg) × amount × days`; the freight portion is `breakdown.freight` and is inside `sourcePurchases` / OPEX.
- `bindSale` nets seller-paid freight: `unitPrice` = max(0, gate − freight), `gateUnitPrice` keeps plant-gate. Revenue is already net. Sink `annualFreight` = sold × freight (also folded into `breakdown.freight` as disclosure, not a third cash term). Screening FOB vs landed.
- Demo `cases/silicon.js` only: module sale `chile-coast-container`; bauxite purchase `bulk-dry-shortsea`. Ag / glass / EVA / quartz / carbon / caustic stay plant-gate. Chile CAPEX× 1.05 unchanged.
- Overview / Economics honesty: “Screening freight applied on N streams (not a carrier contract; plant-gate elsewhere).” Asia-China offtake note kept. Economics ops panel shows a Freight line when `breakdown.freight > 0`.

## Cited freight bands

| Id | $/kg | Quality | Note |
|---|---:|---|---|
| `chile-coast-container` | 0.08 | screening | Chile coastal plant → Pacific container offtake OOM (~$80/t). Not a Maersk quote; not inland truck. UNCTAD Trade-and-Transport Dataset / World Bank freight-logistics family. |
| `bulk-dry-shortsea` | 0.03 | screening | Short-sea / dry-bulk OOM (~$30/t). Not a voyage quote; not inland truck. Same UNCTAD / WB family. |
| `none` | 0 | cited | Plant-gate. |

Cites: https://unctad.org/publication/trade-and-transport-dataset and https://documents1.worldbank.org/curated/en/620801468168857019/pdf/558370PUB0cost1C0disclosed071221101.pdf — family, not a voyage quote.

Module ASP $2.85/kg, bauxite $0.04/kg, Bayer pack 500, module pack 700, Chile CAPEX× 1.05, SEC rows: **unchanged**.

## Demo cash (solved `createSiliconCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Module 1000 kg/day @ net $2.77/kg (gate $2.85 − $0.08). Bauxite actual supplied ~481 kg/day @ $0.04 + $0.03 freight. Sale freight $29,200/y; inbound bauxite freight $5,268/y; `breakdown.freight` $34,468 (disclosure of both; purchase freight is already in OPEX, sale freight already netted from revenue). CAPEX / fixed O&M / variable O&M unchanged vs Bayer tip. Freight reduces cash vs Bayer plant-gate ~+$292k; sign stays positive. Not retuned to force a sign.

| Line | Bayer plant-gate | After screening freight |
|---|---:|---:|
| Annual revenue | 1,040,250 | 1,011,050 |
| Feed purchases | 315,371 | 320,639 |
| Screening freight (disclosure) | 0 | 34,468 |
| Fixed O&M | 102,649 | 102,649 |
| Variable O&M | 16,415 | 16,415 |
| Annual operating cost | 434,435 | 439,703 |
| Annualized CAPEX | 313,337 | 313,337 |
| **Net cash (R − OPEX − annualized CAPEX)** | **+292,478** | **+258,010** |

Installed CAPEX ≈ $3.08 M unchanged. Screening, not bankable, not a Maersk/Hydro quote.

## Files

- `data/tea-screening.js` (freightBands, getFreight, bindSale/bindCost)
- `engine/economics.js` (`breakdown.freight`; source purchases include freight; sink `annualFreight`)
- `cases/silicon.js` (module + bauxite binds; site notes)
- `js/flowsheet-app.js` (honesty chip + Economics freight line)
- `tests/catalog-freight.test.js` (new), `tests/catalog-bom-pv.test.js` (net module price), `tests/flowsheet-economics.test.js` (breakdown.freight 0), `tests/flowsheet-ui.test.js` (Mejillones honesty)
- `README.md`

## Tests

`npm test`: **398 pass / 0 fail**. Maglut / Dead Sea binds without freight keep plant-gate prices and `breakdown.freight` 0. Mejillones annualNetCash asserted finite only.

## Leftovers

- Inland truck not modeled.
- Port fees, insurance, demurrage not modeled.
- Full offtake / carrier contracts not modeled.
- Ag / glass / EVA / quartz / carbon / caustic freight omitted this tranche (YAGNI).
- No routing, GIS, or distance × $/t·km on this layer (network corridors stay the UNCTAD/WB $/t·km model).
- Pump / undo / blower part-load untouched; packs and product prices not retuned.

## Tip

Feat `be62508` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `be62508`). `npm test` 398 pass / 0 fail.
