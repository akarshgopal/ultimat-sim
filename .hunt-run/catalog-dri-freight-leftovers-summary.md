# CATALOG-DRI-FREIGHT-LEFTOVERS (container H₂ + short-sea DRI steel)

Wire existing freight bands onto remaining plant-gate legs of the two Mejillones DRI cases. No new bands. No band-value edits. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Not a routing/GIS model, not a voyage quote, not a tube-trailer/pipeline quote, and not a carrier contract. Packs, product prices, SEC, and CAPEX are **untouched**. MECH undo/pump/blower untouched. Network plant list untouched (h2-dri is not a Network plant).

## Bands (already live)

`freightBands['chile-coast-container']` = **$0.08/kg** (screening). UNCTAD / World Bank maritime freight family. Chile coastal plant → Pacific container offtake OOM (~$80/t). Not a Maersk quote.

`freightBands['bulk-dry-shortsea']` = **$0.03/kg** (screening). UNCTAD / World Bank bulk short-sea family. Short-sea / dry-bulk OOM (~$30/t). Not a voyage quote.

Primary URLs:

- https://unctad.org/publication/trade-and-transport-dataset
- https://documents1.worldbank.org/curated/en/620801468168857019/pdf/558370PUB0cost1C0disclosed071221101.pdf

Iron-ore `inland-truck-short` $0.01/kg on both cases **kept**. Band values **unchanged**.

## Streams wired

**`cases/h2-dri.js`**

- `hydrogen-feed` `bindCost('hydrogen-feed', { freight: 'chile-coast-container' })` (same precedent as `cases/ft-liquids.js` purchased hydrogen-feed)
- `steel` `bindSale('steel', { region, freight: 'bulk-dry-shortsea' })` (DRI/HBI ships as dry bulk; same band as cement/urea/float-glass offtake)
- `iron-ore` inland-truck-short **kept**

**`cases/green-h2-dri.js`**

- `steel` `bindSale('steel', { region, freight: 'bulk-dry-shortsea' })`
- `iron-ore` inland-truck-short **kept**
- `seawater` **kept** plant-gate (local intake)
- `electrolyzer-oxygen` **kept** plant-gate (gas over-the-fence; no existing gas/pipeline/cylinder band — container would be dishonest)

Unit costs iron-ore $0.10 / hydrogen-feed $2.00 / seawater $0.001 and steel gate $0.40 / oxygen $0.05 unchanged. Chile CAPEX× 1.05 unchanged.

## Demo cash (solved cases → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Baseline recorded tip `4b2e3c7` (catalog-h2-dri-inland-truck docs live). Freight is a disclosure inside purchases / netted from sale; CAPEX unchanged. Sign recorded, not retuned.

### Purchased-H₂ H2-DRI (`createH2DriCase`)

| Line | Tip 4b2e3c7 (ore inland-truck) | After leftover freight |
|---|---:|---:|
| Annual revenue | 146,000 | 135,050 |
| Source purchases (incl. inbound freight) | 96,931 | 98,512 |
| Screening freight (disclosure) | 5,219 | 17,750 |
| Fixed O&M | 36,310 | 36,310 |
| Variable O&M | 10,950 | 10,950 |
| Annual operating cost | 144,191 | 145,772 |
| Annualized CAPEX | 100,045 | 100,045 |
| Installed CAPEX | 982,258 | 982,258 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−98,236** | **−110,767** |

Exact after: `annualRevenue` 135050; `breakdown.freight` 17749.61176470588; `annualOperatingCost` 145771.6421252372; `annualizedCapex` 100045.1535053205; `annualNetCash` -110766.79563055771; `installedCapex` 982258.0645161291. CAPEX matches prior ±1. Freight delta ≈ $12,531/y = purchased-H₂ inbound $0.08/kg + steel offtake $0.03/kg on 1000 kg Fe/day.

### Green H2-DRI (`createGreenH2DriCase`)

| Line | Tip 4b2e3c7 (ore inland-truck) | After leftover freight |
|---|---:|---:|
| Annual revenue | 153,843 | 142,893 |
| Source purchases (incl. inbound freight) | 57,826 | 57,826 |
| Screening freight (disclosure) | 5,219 | 16,169 |
| Fixed O&M | 52,783 | 52,783 |
| Variable O&M | 11,543 | 11,543 |
| Annual operating cost | 122,152 | 122,152 |
| Annualized CAPEX | 177,264 | 177,264 |
| Installed CAPEX | 1,740,403 | 1,740,403 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−145,573** | **−156,523** |

Exact after: `annualRevenue` 142892.8431372549; `breakdown.freight` 16168.529411764706; `annualOperatingCost` 122152.17648603914; `annualizedCapex` 177263.8945339889; `annualNetCash` -156523.22788277315; `installedCapex` 1740403.046553248. CAPEX matches prior ±1. Freight delta ≈ $10,950/y = steel offtake $0.03/kg × 1000 kg/day × 365 d (sale freight nets plant-gate price; OPEX unchanged). Electrolyzer O₂ revenue stays $7,843 (plant-gate $0.05/kg).

### Network (11 plants)

Baseline rollup tip `4b2e3c7` measured **−1,726,176**. After: **−1,737,126**. Delta −10,950 matches green-H2-DRI steel offtake freight. Maglut plant ≈1299, freight 0. h2-dri is **not** a Network plant and was not added.

Exact after: `annualNetCash` -1737125.5341552785. Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91) and `breakdown.freight` 0.

## Files

- `cases/h2-dri.js` (hydrogen-feed + steel binds + site evidence/rights/notes)
- `cases/green-h2-dri.js` (steel bind + site evidence/notes; O₂/seawater stay plant-gate)
- `tests/catalog-freight.test.js` (DRI leftover binds; CAPEX pins; freight larger than 4b2e3c7; Maglut pin)
- `tests/catalog-h2-dri.test.js` (steel unitPrice pin 0.40 → 0.37 net of shortsea)
- `README.md` (one short clause on container H₂ + shortsea DRI steel; green O₂ plant-gate)
- `.hunt-run/catalog-dri-freight-leftovers-summary.md`

Not edited: `data/tea-screening.js` (bands already exist), `cases/network.js`, `cases/cement.js`, `cases/cu-ew.js`, `cases/float-glass.js`, `cases/silicon.js`, `cases/urea.js`, `cases/green-urea.js`, `cases/green-ft.js`, `cases/green-mto.js`, `cases/maglut.js`, `cases/abundance.js`, `cases/dac.js`, packs/prices/SEC/CAPEX, MECH undo/pump/blower.

## Tests

`npm test` 534 pass / 0 fail (one new leftover freight test). Maglut `annualNetCash` still ≈ 1299 (±5). h2-dri CAPEX pin 982258 ±1. green-h2-dri CAPEX pin 1740403 ±1. Cash finite (h2-dri −110,767; green-h2-dri −156,523), sign not forced. Network 11 plants, rollup finite.

## Leftovers

- Green-H2-DRI electrolyzer-oxygen sale stays plant-gate (gas over-the-fence; no existing gas/pipeline/cylinder band).
- Green-H2-DRI seawater intake stays plant-gate (local intake).
- Cement sale still `bulk-dry-shortsea`. Float-glass limestone stays `bulk-dry-shortsea` (imported carbonate, not a quarry short-haul feed).
- No distance/GIS model. No Chile truck/voyage quote. No Maglut-quality vendor curve.
- Ni/soda-ash/Ag/TiCl4/Zn/Pb/phosphoric/chlor-alkali/Li-metal not retried. `dac.js` not deleted.

## Tip

Feat pending on `main`. Pages pending. Prior checkout tip `4b2e3c7`.
