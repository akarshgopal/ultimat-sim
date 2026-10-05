# CATALOG-H2-DRI-INLAND-TRUCK (short-haul $0.01/kg on purchased-H2 DRI ore)

Mejillones purchased-H₂ H2-DRI iron-ore inbound freight switched from plant-gate to existing `inland-truck-short` ($0.01/kg). Same band as green-H2-DRI ore and cement quarry feeds. Purchased hydrogen and steel sale stay plant-gate this tranche (YAGNI — ore inbound is the cited short-haul feed). Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Not a routing/GIS model, not a mine-haul quote, not a carrier contract, and not a mine contract or port lease. Packs, product prices, SEC, and CAPEX are **untouched**. MECH undo/pump/blower untouched. Network plant list untouched (h2-dri is not a Network plant).

## Band (already live)

`freightBands['inland-truck-short']` = **$0.01/kg** (screening). Added in CATALOG-INLAND-TRUCK (`9c080bb`). Unchanged this tranche.

Cite: Nova Scotia Public Works *Truck Rates for Haulage of Bulk Material*, Table 1 Standard Gravel Tonne KM Rates, effective Feb 1, 2024. Screening OOM ~$10/t for ~50–100 km gravel/bulk family; quarry/mine short-haul inbound story. Distinct from `bulk-dry-shortsea` (ocean).

Primary URL: https://novascotia.ca/tran/publications/asphalt/Truck_Haul_Rates_2024.pdf

## Stream wired

**`cases/h2-dri.js` iron-ore only:**

- `iron-ore` `bindCost('iron-ore', { freight: 'inland-truck-short' })` (was plant-gate `bindCost('iron-ore')`)
- `hydrogen-feed` `bindCost('hydrogen-feed')` **kept** plant-gate
- `steel` `bindSale('steel', { region })` **kept** plant-gate

Unit cost iron-ore $0.10 / hydrogen-feed $2.00 and steel sale $0.40 unchanged. Chile CAPEX× 1.05 unchanged.

## Demo cash (solved `createH2DriCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Baseline recorded tip `483d438` plant-gate. Freight is a disclosure inside purchases; CAPEX unchanged. Sign recorded, not retuned. More cash− than −93017 because inbound ore freight is $0.01/kg.

| Line | Plant-gate (483d438) | After inland-truck-short |
|---|---:|---:|
| Annual revenue | 146,000 | 146,000 |
| Source purchases (incl. inbound freight) | 91,712 | 96,931 |
| Screening freight (disclosure) | 0 | 5,219 |
| Fixed O&M | 36,310 | 36,310 |
| Variable O&M | 10,950 | 10,950 |
| Annual operating cost | 138,972 | 144,191 |
| Annualized CAPEX | 100,045 | 100,045 |
| Installed CAPEX | 982,258 | 982,258 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−93,017** | **−98,236** |

Exact after: `annualRevenue` 146000; `breakdown.freight` 5218.529411764706; `annualOperatingCost` 144190.559772296; `annualizedCapex` 100045.1535053205; `annualNetCash` -98235.7132776165; `installedCapex` 982258.0645161291. CAPEX matches prior ±1. Freight delta ≈ $5,219/y on consumed hematite at $0.01/kg (same ore mass as green-H2-DRI).

Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91) and `breakdown.freight` 0. Cement leftover cash still ≈ −14,879; limestone/clay inland-truck; sale bulk-dry-shortsea. Green-H2-DRI ore still inland-truck; cash −145,573 / freight 5,219 / CAPEX 1,740,403 unchanged.

## Files

- `cases/h2-dri.js` (iron-ore bind + site evidence/rights/notes)
- `tests/catalog-freight.test.js` (purchased-H2 DRI ore inland-truck; H2/steel plant-gate; CAPEX pin; Maglut pin; green-H2-DRI + cement leftover pins; inland-truck title)
- `README.md` (one clause on Mejillones purchased-H₂ H2-DRI iron-ore inland-truck-short)
- `.hunt-run/catalog-h2-dri-inland-truck-summary.md`

Not edited: `data/tea-screening.js` (band already exists), `cases/green-h2-dri.js`, `cases/cement.js`, `cases/cu-ew.js`, `cases/float-glass.js`, `cases/silicon.js`, `cases/urea.js`, `cases/green-urea.js`, `cases/green-ft.js`, `cases/green-mto.js`, `cases/maglut.js`, `cases/abundance.js`, `cases/network.js`, `cases/dac.js`, packs/prices/SEC/CAPEX, MECH undo/pump/blower.

## Tests

`npm test` 533 pass / 0 fail. Maglut `annualNetCash` still ≈ 1299 (±5). h2-dri CAPEX pin 982258 ±1. Cash finite (−98,236; more cash− than −93,017), sign not forced.

## Leftovers

- Purchased H₂ and steel sale on `h2-dri.js` still plant-gate.
- Green-H2-DRI steel sale / electrolyzer O₂ / seawater still plant-gate.
- Cement sale still `bulk-dry-shortsea`. Float-glass limestone stays `bulk-dry-shortsea` (imported carbonate, not a quarry short-haul feed).
- No distance/GIS model. No Chile truck quote. No Maglut-quality vendor curve.
- Li-metal skipped (see `catalog-li-metal-summary.md`). Ni/soda-ash/Ag/TiCl4/Zn/Pb/phosphoric/chlor-alkali not retried.

## Tip

Feat `7543ab5` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `7543ab5`). `npm test` 533 pass / 0 fail. Prior checkout tip `483d438`.
