# CATALOG-SIZE-GREEN-FT-UREA

Thin `sizeToProduct` extension so **green-FT diesel** and **green-urea** size the upstream stack (today they returned achieved ≈ 0 because `sizeDiesel` / `sizeUrea` only ratio-scaled the terminal converter + direct material-sources). Mirror green H₂-DRI steel: include electrolyzer + SWRO (and Haber/ASU on urea) in the baseline-ratio chain. Packs, product prices, SEC, freight bands, and Maglut/purchased size numbers were **not** retuned. MECH undo/pump/blower untouched. Green-MTO ethylene is leftover. Cash sign recorded, not forced.

## Design

One thin change to `dieselChain` / `sizeDiesel` and `ureaChain` / `sizeUrea`. No new product names, no `sizeGreen*` fork.

1. **Diesel.** If an `electrolyzer` feeds `ft-liquids` hydrogen (green-FT shape): include electrolyzer + swro (if present) in `converterDuties`; include seawater source feeding swro; keep scaling the purchased CO₂ source; process kWh = FT SEC + electrolyzer SEC + SWRO SEC.
2. **Urea.** If an `ammonia` converter feeds urea (green-urea shape): include ammonia + electrolyzer + asu + swro (if present); include seawater + air sources; keep scaling purchased CO₂; process kWh = urea + NH₃ + electrolyzer + ASU + SWRO SECs.
3. Purchased-feed graphs (no electrolyzer on the H₂ path, no Haber on the NH₃ path) keep current behavior. Existing `tests/catalog-size-diesel.test.js` and `tests/catalog-size-urea.test.js` stay green.
4. Ratio = targetKg / baselineKg. `applyRatioScale` scales captured duties and streams. Solar is `kWh / yieldPerKWp` (methanol / steel convention; demo seed still carries its own 1.02).

## Test rates + achieved

`sizeToProduct({ product: 'diesel', rate: 2000, caseOrBuilder: createGreenFtCase })` and `sizeToProduct({ product: 'urea', rate: 2000, caseOrBuilder: createGreenUreaCase })`. One `iterateSize` pass. Achieved = target.

### Green FT (Mejillones SWRO+PEM+purchased CO₂)

| Rate kg/day | Achieved | ft-liquids | electrolyzer kg H₂ | swro m³ | solarKWp | installed CAPEX |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 (unsized demo) | 1000 | 1000 | 437.89 | 4.109 | 4452.49 | 6,641,032 |
| 2000 | 2000 | 2000 | 875.78 | 8.218 | 8730.38 | 13,098,726 |

2000 converter duties are exact 2×. 2000 solar is ~2% under 2× of the 1000 seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±20% screen. CAPEX ~1.97× (solar pack is not linear with the 1.02 seed).

### Green urea (Walvis SWRO+PEM+ASU+Haber+purchased CO₂)

| Rate kg/day | Achieved | urea | ammonia | electrolyzer kg H₂ | asu kg N₂ | swro m³ | solarKWp | installed CAPEX |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 (unsized demo) | 1000 | 1000 | 567.16 | 100.70 | 466.46 | 0.945 | 1209.24 | 3,855,897 |
| 2000 | 2000 | 2000 | 1134.32 | 201.40 | 932.92 | 1.890 | 2371.05 | 7,666,744 |

Same 2× duties; solar ~2% under 2× of the seed. CAPEX ~1.99×.

Purchased `createFtLiquidsCase` diesel 2000 and `createUreaCase` urea 2000 still hit target (regression in the new file plus the existing size tests).

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.**

### Green FT

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 1000 (default demo) | 362,726 | 318,956 | 676,404 | 6,641,032 | **−632,634** |
| 2000 | 725,451 | 634,420 | 1,334,134 | 13,098,726 | **−1,243,103** |

Exact 1000: `annualRevenue` 362725.63183198456; `annualOperatingCost` 318955.9494581447; `annualizedCapex` 676403.8005642485; `annualNetCash` -632634.1181904087; `installedCapex` 6641032.220898725; `breakdown.freight` 119733.02777047842.

Exact 2000: `annualRevenue` 725451.2636639691; `annualOperatingCost` 634419.7470521614; `annualizedCapex` 1334134.2236308623; `annualNetCash` -1243102.7070190546; `installedCapex` 13098726.468930727; `breakdown.freight` 239466.05554095685.

### Green urea

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 1000 (default demo) | 152,164 | 190,713 | 392,732 | 3,855,897 | **−431,280** |
| 2000 | 304,329 | 380,478 | 780,875 | 7,666,744 | **−857,024** |

Exact 1000: `annualRevenue` 152164.4346583289; `annualOperatingCost` 190713.2830684946; `annualizedCapex` 392731.6335218451; `annualNetCash` -431280.48193201085; `installedCapex` 3855897.069485829; `breakdown.freight` 32348.23462708537.

Exact 2000: `annualRevenue` 304328.8693166578; `annualOperatingCost` 380478.14558707294; `annualizedCapex` 780874.8274683338; `annualNetCash` -857024.1037387489; `installedCapex` 7666744.162850635; `breakdown.freight` 64696.46925417074.

Sign stays cash− (about 2× the 1000 demo). Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91). Network `evaluateNetwork(createFuelsAndMineralsNetwork(6))` cash finite. Base-case green-FT / green-urea `breakdown.freight` > 0 unchanged. Screening, not bankable.

## Files

- `engine/size.js` (`dieselChain` / `ureaChain` detect upstream electrolyzer / Haber; process kWh includes stack SECs)
- `js/flowsheet-app.js` (green-FT / green-urea load-status Size-to-target honesty)
- `tests/catalog-size-green-ft-urea.test.js`
- `README.md` (sizeToProduct diesel/urea now covers green-FT / green-urea stacks)
- `.hunt-run/catalog-size-green-ft-urea-summary.md`

## Tests

`npm test`: **526 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module/steel/ethylene/diesel/urea sizeToProduct tests stay green. Maglut ≈ 1299. Green-FT / green-urea freight binds stay. Purchased `createFtLiquidsCase` diesel 2000 and `createUreaCase` urea 2000 still hit target. No pack/price/SEC/freight edits.

## Leftovers

- Size green-MTO ethylene (YAGNI this tranche; purchased-MeOH MTO remains the ethylene size path).
- Inland truck not modeled.
- Full FT slate (naphtha/wax/LPG); carbamate recycle / granulation.
- Demo 2% solar seed margin is not copied into the sizer (methanol / steel convention).

## Tip

Feat pending push. Pages URL pending deploy.
