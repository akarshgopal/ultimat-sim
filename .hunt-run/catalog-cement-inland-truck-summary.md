# CATALOG-CEMENT-INLAND-TRUCK (quarry short-haul $0.01/kg on limestone/clay)

Mejillones cement purchased limestone and kiln-clay inbound freight switched from `bulk-dry-shortsea` ($0.03/kg) to existing `inland-truck-short` ($0.01/kg). Cement **sale** stays `bulk-dry-shortsea` (bulk commodity offtake). Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Not a routing/GIS model, not a mine-haul quote, not a carrier contract, and not a quarry concession. Packs, product prices, SEC, and CAPEX are **untouched**. MECH undo/pump/blower untouched. Network plant list untouched.

## Band (already live)

`freightBands['inland-truck-short']` = **$0.01/kg** (screening). Added in CATALOG-INLAND-TRUCK (`9c080bb`). Unchanged this tranche.

Cite: Nova Scotia Public Works *Truck Rates for Haulage of Bulk Material*, Table 1 Standard Gravel Tonne KM Rates, effective Feb 1, 2024. Screening OOM ~$10/t for ~50–100 km gravel/bulk family; quarry short-haul story. Distinct from `bulk-dry-shortsea` (ocean).

Primary URL: https://novascotia.ca/tran/publications/asphalt/Truck_Haul_Rates_2024.pdf

## Streams wired

**`cases/cement.js` only (feeds):**

- `limestone-feed` `bindCost('limestone', { freight: 'inland-truck-short' })` (was `bulk-dry-shortsea`)
- `clay-feed` `bindCost('kiln-clay', { freight: 'inland-truck-short' })` (was `bulk-dry-shortsea`)
- `cement-product` `bindSale('cement', { region, freight: 'bulk-dry-shortsea' })` **kept**

Unit costs limestone $0.02 / kiln-clay $0.02 and cement sale gate $0.16 unchanged. Chile CAPEX× 1.05 unchanged.

## Demo cash (solved `createCementCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Baseline recorded tip `cbf46a0` leftover shortsea on limestone+clay+sale. Freight is a disclosure; CAPEX unchanged. Sign recorded, not retuned. Less cash− than −25975 because feed freight drops $0.03→$0.01.

| Line | Leftover shortsea (cbf46a0) | After inland-truck-short feeds |
|---|---:|---:|
| Annual revenue | 47,450 | 47,450 |
| Source purchases (incl. inbound freight) | 27,740 | 16,644 |
| Screening freight (disclosure) | 27,594 | 16,498 |
| Fixed O&M | 6,585 | 6,585 |
| Variable O&M | 10,950 | 10,950 |
| Annual operating cost | 45,275 | 34,179 |
| Annualized CAPEX | 28,151 | 28,151 |
| Installed CAPEX | 276,387 | 276,387 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−25,975** | **−14,879** |

Exact after: `annualRevenue` 47450; `breakdown.freight` 16498; `annualOperatingCost` 34178.51612903226; `annualizedCapex` 28150.636296669494; `annualNetCash` -14879.152425701752; `installedCapex` 276387.0967741936. CAPEX matches prior ±1. Freight delta ≈ −$11,096/y on consumed limestone+clay at $0.02/kg drop ($0.03→$0.01); sale freight still $0.03/kg.

Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91) and `breakdown.freight` 0. Network 11 plants, rollup cash finite (measured −1,726,176; prior inland-truck tip ≈ −1,737,272; delta matches cement freight drop). Maglut plant ≈1299. green-H2-DRI plant freight 5,219 / cash −145,573 unchanged.

## Files

- `cases/cement.js` (limestone/clay bind + site evidence/rights/notes)
- `tests/catalog-freight.test.js` (cement leftover feeds inland-truck; Maglut pin; inland-truck title)
- `tests/catalog-cement.test.js` (limestone/clay freightId)
- `README.md` (one clause on Mejillones cement quarry feeds inland-truck-short; offtake still shortsea)
- `.hunt-run/catalog-cement-inland-truck-summary.md`

Not edited: `data/tea-screening.js` (band already exists), `cases/green-h2-dri.js`, `cases/h2-dri.js`, `cases/cu-ew.js`, `cases/float-glass.js`, `cases/silicon.js`, `cases/urea.js`, `cases/green-urea.js`, `cases/green-ft.js`, `cases/green-mto.js`, `cases/maglut.js`, `cases/abundance.js`, `cases/network.js`, `cases/dac.js`, packs/prices/SEC/CAPEX, MECH undo/pump/blower.

## Tests

`npm test` 532 pass / 0 fail. Maglut `annualNetCash` still ≈ 1299 (±5). Network 11 plants. Cement CAPEX pin 276387 ±1. Cash finite (−14,879; less cash− than −25,975), sign not forced.

## Leftovers

- Purchased-H₂ `h2-dri.js` iron-ore still plant-gate → next tranche.
- Green-H2-DRI steel sale / electrolyzer O₂ / seawater still plant-gate.
- Float-glass limestone stays `bulk-dry-shortsea` (imported carbonate, not a quarry short-haul feed).
- No distance/GIS model. No Chile truck quote. No Maglut-quality vendor curve.
- Li-metal skipped (see `catalog-li-metal-summary.md`). Ni/soda-ash/Ag/TiCl4/Zn/Pb/phosphoric/chlor-alkali not retried.

## Tip

Feat pending on `main`. Pages pending. Prior checkout tip `cbf46a0`.
