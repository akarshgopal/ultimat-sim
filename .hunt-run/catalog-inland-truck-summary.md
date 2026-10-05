# CATALOG-INLAND-TRUCK (short-haul $0.01/kg band on green-H2-DRI ore)

New screening freight band `inland-truck-short` ($0.01/kg) wired to Mejillones green-H2-DRI purchased iron-ore only. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Not a routing/GIS model, not a carrier contract, not a Chile quote, and not a mine-haul quote. Packs, product prices, SEC, and CAPEX are **untouched**. MECH undo/pump/blower untouched. Network plant list untouched (already has green-H2-DRI). Corridors stay `[]`.

Li metal was **skipped** this burst (see `.hunt-run/catalog-li-metal-summary.md`). No honest paired open TIC→$/(kg/day) + SEC for one electrolytic route.

## Band

`freightBands['inland-truck-short']` = **$0.01/kg** (screening).

Cite: Nova Scotia Public Works *Truck Rates for Haulage of Bulk Material*, Table 1 Standard Gravel Tonne KM Rates, effective Feb 1, 2024. Table values are cumulative CAD $/t for the listed haul distance (50 km = 10.72, 100 km = 20.20). Screening OOM ~CAD $10–14/t ≈ USD ~$7–10/t for ~50–100 km gravel/bulk (FX ~0.73) → **$0.01/kg**. Not a carrier contract. Distinct from `bulk-dry-shortsea` (ocean).

Primary URL: https://novascotia.ca/tran/publications/asphalt/Truck_Haul_Rates_2024.pdf

`getFreight` / `bindSale` / `bindCost` freight attachment unchanged. Existing `chile-coast-container` $0.08/kg and `bulk-dry-shortsea` $0.03/kg unchanged.

## Stream wired

**`cases/green-h2-dri.js` iron-ore** `bindCost('iron-ore', { region: 'Atacama/Chile', freight: 'inland-truck-short' })`.

Seawater stays plant-gate (local intake). Steel sale and electrolyzer-oxygen sale stay plant-gate this tranche (YAGNI — ore inbound is the cited short-haul feed). Purchased-H₂ `cases/h2-dri.js` iron-ore stays plant-gate.

## Demo cash (solved `createGreenH2DriCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Plant-gate baseline recorded tip `b2da51c` Network table. Freight is a disclosure inside purchases; CAPEX unchanged. Sign recorded, not retuned. More cash− than pre-freight ~−140355 is expected.

| Line | Plant-gate (b2da51c) | After inland-truck-short |
|---|---:|---:|
| Annual revenue | 153,843 | 153,843 |
| Feed purchases | 52,608 | 57,826 |
| Screening freight (disclosure) | 0 | 5,219 |
| Fixed O&M | 52,783 | 52,783 |
| Variable O&M | 11,543 | 11,543 |
| Annual operating cost | 116,934 | 122,152 |
| Annualized CAPEX | 177,264 | 177,264 |
| Installed CAPEX | 1,740,403 | 1,740,403 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−140,355** | **−145,573** |

Exact after: `annualRevenue` 153842.8431372549; `breakdown.freight` 5218.529411764706; `annualOperatingCost` 122152.17648603914; `annualizedCapex` 177263.8945339889; `annualNetCash` -145573.22788277315; `installedCapex` 1740403.046553248. CAPEX matches prior ±1. Freight delta ≈ $5,219/y on consumed hematite at $0.01/kg.

Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91) and `breakdown.freight` 0. Network 11 plants, rollup cash finite (measured −1,737,272; prior −1,732,053; delta matches green-H2-DRI freight). Maglut plant ≈1299. green-H2-DRI plant freight 5,219 > 0 / cash finite / CAPEX 1,740,403.

## Files

- `data/tea-screening.js` (`freightBands['inland-truck-short']`)
- `cases/green-h2-dri.js` (iron-ore bind + site evidence/notes)
- `tests/catalog-freight.test.js` (band, green-H2-DRI ore, CAPEX pin, Maglut, Network, silicon 9 streams, Dead Sea freight 0)
- `README.md` (one clause on inland-truck-short on Mejillones green-H2-DRI iron-ore)
- `.hunt-run/catalog-inland-truck-summary.md`
- `.hunt-run/catalog-li-metal-summary.md` (skip note from parent; included this commit)

Not edited: `cases/h2-dri.js`, `cases/cement.js`, `cases/cu-ew.js`, `cases/float-glass.js`, `cases/silicon.js`, `cases/urea.js`, `cases/green-urea.js`, `cases/green-ft.js`, `cases/green-mto.js`, `cases/maglut.js`, `cases/abundance.js`, `cases/network.js`, `cases/dac.js`, packs/prices/SEC, MECH undo/pump/blower.

## Tests

`npm test` 532 pass / 0 fail. Maglut `annualNetCash` still ≈ 1299 (±5). Network 11 plants. Silicon still 9 freighted streams. Dead Sea freight 0. `createUreaCase` already carries leftover chile-coast-container / bulk-dry-shortsea freight from catalog-freight-walvis-urea (prompt “urea freight still 0” is stale vs tip `b2da51c`); tests keep `freight > 0` and do not pin 0.

## Leftovers

- Cement still `bulk-dry-shortsea`.
- Purchased-H₂ `h2-dri.js` iron-ore still plant-gate.
- Steel sale / electrolyzer O₂ / seawater on green-H2-DRI still plant-gate.
- No distance/GIS model. No Chile truck quote. No Maglut-quality vendor curve.
- Li-metal skipped (see `catalog-li-metal-summary.md`).

## Tip

Feat pending on `main`. Pages pending. Prior checkout tip `b2da51c`.
