# CATALOG-FREIGHT-LEFTOVERS (Mejillones cement / Cu-EW / float-glass / FT(+green))

Inbound (and sale where natural) screening freight on the Mejillones demos that were still plant-gate after silicon QCC. Reuses existing bands only. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Not a routing/GIS model and not a carrier contract. Packs, product prices, SEC, and CAPEX are **untouched**. MECH undo/pump/blower untouched. Maglut / Minaçu / peer-SX / Bioforge / Dead Sea / silicon QCC / urea.js freight binds untouched. Network plant list untouched.

## What landed

- No new `freightBands`. Reuse `chile-coast-container` $0.08/kg and `bulk-dry-shortsea` $0.03/kg.
- **Cement** (`cases/cement.js`): limestone + kiln-clay + cement sale `bulk-dry-shortsea` $0.03/kg (bulk commodity offtake).
- **Cu-EW** (`cases/cu-ew.js`): pls-copper + copper-cathode sale `chile-coast-container` $0.08/kg (liquid chemical / concentrate-style screening OOM, not a PLS truck model and not a heap-haul quote).
- **Float-glass** (`cases/float-glass.js`): silica-sand + limestone + glass sale `bulk-dry-shortsea` $0.03/kg; soda-ash `chile-coast-container` $0.08/kg.
- **FT liquids** (`cases/ft-liquids.js`): hydrogen-feed + co2-feed + diesel sale `chile-coast-container` $0.08/kg.
- **Green FT** (`cases/green-ft.js`): co2-feed + diesel sale `chile-coast-container` $0.08/kg. Seawater stays plant-gate (local intake). Electrolyzer-oxygen sale stays plant-gate (YAGNI byproduct).
- Site notes and resource evidence say which band applies. Not a logistics model. Chile CAPEX× 1.05 unchanged.
- Overview honesty chip already counts streams with `freightUsdPerKg > 0`. Silicon stays **9 streams**. No new UI chrome.
- Optional Walvis `green-urea.js` freight skipped this tranche (YAGNI). `cases/urea.js` stays plant-gate (freight=0 pin).

## Demo cash (solved cases → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Plant-gate baselines recorded tip `5611ea5`. Freight is a disclosure inside purchases / netted from sale; CAPEX unchanged. Sign recorded, not retuned.

### Cement (1000 kg/day)

| Line | Plant-gate (5611ea5) | After leftover freight |
|---|---:|---:|
| Annual revenue | 58,400 | 47,450 |
| Feed purchases | 11,096 | 27,740 |
| Screening freight (disclosure) | 0 | 27,594 |
| Fixed O&M | 6,585 | 6,585 |
| Variable O&M | 10,950 | 10,950 |
| Annual operating cost | 28,631 | 45,275 |
| Annualized CAPEX | 28,151 | 28,151 |
| Installed CAPEX | 276,387 | 276,387 |
| **Net cash (R − OPEX − annualized CAPEX)** | **+1,619** | **−25,975** |

Exact after: `annualRevenue` 47450; `breakdown.freight` 27594; `annualOperatingCost` 45274.51612903226; `annualizedCapex` 28150.636296669494; `annualNetCash` -25975.15242570175; `installedCapex` 276387.0967741936.

### Copper SX-EW (1000 kg cathode/day)

| Line | Plant-gate (5611ea5) | After leftover freight |
|---|---:|---:|
| Annual revenue | 3,540,500 | 3,511,300 |
| Feed purchases | 3,416,400 | 3,445,600 |
| Screening freight (disclosure) | 0 | 58,400 |
| Fixed O&M | 40,016 | 40,016 |
| Variable O&M | 10,950 | 10,950 |
| Annual operating cost | 3,467,366 | 3,496,566 |
| Annualized CAPEX | 125,746 | 125,746 |
| Installed CAPEX | 1,234,597 | 1,234,597 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−52,613** | **−111,013** |

Exact after: `annualRevenue` 3511299.999999999; `breakdown.freight` 58399.99999999999; `annualOperatingCost` 3496566.129032257; `annualizedCapex` 125746.4084575494; `annualNetCash` -111012.53748980735; `installedCapex` 1234596.7741935486.

### Float-glass (1000 kg/day)

| Line | Plant-gate (5611ea5) | After leftover freight |
|---|---:|---:|
| Annual revenue | 164,250 | 153,300 |
| Feed purchases | 21,973 | 37,230 |
| Screening freight (disclosure) | 0 | 26,207 |
| Fixed O&M | 22,277 | 22,277 |
| Variable O&M | 10,950 | 10,950 |
| Annual operating cost | 55,200 | 70,457 |
| Annualized CAPEX | 83,831 | 83,831 |
| Installed CAPEX | 823,065 | 823,065 |
| **Net cash (R − OPEX − annualized CAPEX)** | **+25,219** | **−988** |

Exact after: `annualRevenue` 153300.00000000003; `breakdown.freight` 26207; `annualOperatingCost` 70457.41935483871; `annualizedCapex` 83830.9389716996; `annualNetCash` -988.3583265382767; `installedCapex` 823064.5161290322.

### FT liquids purchased H₂ (1000 kg diesel/day)

| Line | Plant-gate (5611ea5) | After leftover freight |
|---|---:|---:|
| Annual revenue | 328,500 | 299,300 |
| Feed purchases | ~376,241 | 479,561 |
| Screening freight (disclosure) | 0 | 132,519 |
| Annual operating cost | ~406,649 | 509,968 |
| Annualized CAPEX | 51,930 | 51,930 |
| Installed CAPEX | 509,860 | 509,860 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−130,079** | **−262,599** |

Exact after: `annualRevenue` 299300; `breakdown.freight` 132519.3535274404; `annualOperatingCost` 509968.25271126506; `annualizedCapex` 51930.334335020336; `annualNetCash` -262598.5870462854; `installedCapex` 509859.6774193549. Sign stays cash− (more negative).

### Green FT SWRO+PEM (1000 kg diesel/day)

| Line | Plant-gate (5611ea5) | After leftover freight |
|---|---:|---:|
| Annual revenue | 391,926 | 362,726 |
| Feed purchases | 59,999 | 150,532 |
| Screening freight (disclosure) | 0 | 119,733 |
| Fixed O&M | 152,679 | 152,679 |
| Variable O&M | 15,745 | 15,745 |
| Annual operating cost | 228,423 | 318,956 |
| Annualized CAPEX | 676,404 | 676,404 |
| Installed CAPEX | 6,641,032 | 6,641,032 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−512,901** | **−632,634** |

Exact after: `annualRevenue` 362725.63183198456; `breakdown.freight` 119733.02777047842; `annualOperatingCost` 318955.9494581447; `annualizedCapex` 676403.8005642485; `annualNetCash` -632634.1181904087; `installedCapex` 6641032.220898725. Sign stays cash− (more negative).

Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91) and `breakdown.freight` 0. Silicon QCC 9 freighted streams; CAPEX still 3,076,388.81. Network rollup cash finite (measured −225,299); Maglut plant ≈1299; cement/cu/glass plants finite.

Screening, not bankable, not a voyage/Maersk quote.

## Files

- `cases/cement.js` (limestone/clay/sale binds; site notes and resource evidence)
- `cases/cu-ew.js` (PLS/cathode binds; site notes and resource evidence)
- `cases/float-glass.js` (sand/soda/limestone/sale binds; site notes and resource evidence)
- `cases/ft-liquids.js` (H₂/CO₂/diesel binds; site notes and resource evidence)
- `cases/green-ft.js` (CO₂/diesel binds; seawater and O₂ plant-gate; site notes and resource evidence)
- `tests/catalog-freight.test.js` (leftover binds, CAPEX ±1, freight > 0, finite cash, Maglut ≈1299, Dead Sea / urea freight 0, silicon 9 streams, network finite)
- `tests/catalog-cement.test.js`, `tests/catalog-cu-ew.test.js`, `tests/catalog-float-glass.test.js`, `tests/catalog-ft-liquids.test.js`, `tests/catalog-green-ft.test.js` (sale `unitPrice` nets freight; `gateUnitPrice` keeps plant-gate)
- `README.md` (one leftover-freight clause)
- `.hunt-run/catalog-freight-leftovers-summary.md`

No change to `data/tea-screening.js`, `engine/economics.js`, `js/flowsheet-app.js`, silicon QCC binds, Maglut, urea.js, network plant list, or MECH.

## Tests

`npm test`: **520 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5) and `breakdown.freight` 0. Dead Sea freight 0. Urea freight 0 and cash finite. Silicon still 9 freighted streams. Network cash finite; Maglut plant ≈1299; cement/cu/glass plants finite. Existing FT/green-FT cash− assertions stay true.

## Leftovers

- Walvis `cases/urea.js` still plant-gate (freight=0 pin).
- Optional Walvis `cases/green-urea.js` freight skipped this tranche.
- Maglut plant-gate (no concentrate freight).
- Inland truck not modeled. No Asia-origin premium. No liquid-PLS-special band.
- Port fees, insurance, demurrage not modeled.
- Full offtake / carrier contracts not modeled.
- No routing, GIS, or distance × $/t·km on this layer.
- Green-FT is not a Network demo plant.
- Pump / undo / blower part-load untouched; packs and product prices not retuned.

## Tip

Feat `28ed7a4` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `28ed7a4`). `npm test` 520 pass / 0 fail. Prior checkout tip `5611ea5`.
