# CATALOG-SIZE-GREEN-MTO

Thin `sizeToProduct` extension so **green-MTO ethylene** sizes the upstream stack (today rate 2000 returned achieved ≈ 0 because `sizeEthylene` only ratio-scaled the MTO converter + material-sources feeding MTO, leaving methanol/electrolyzer/SWRO at the 1000 kg/day seed and starving ethylene). Mirror green-FT diesel / green-urea / green H₂-DRI steel: include methanol + electrolyzer + SWRO in the baseline-ratio chain. Packs, product prices, SEC, freight bands, and Maglut/purchased size numbers were **not** retuned. MECH undo/pump/blower untouched. Network never Empire. Cash sign recorded, not forced.

## Design

One thin change to `ethyleneChain` / `ethyleneProcessElectricityKWh`. No new product names, no `sizeGreenMto` fork.

1. **Green-MTO.** If a `methanol` converter feeds `mto` methanol: include methanol + electrolyzer (when it feeds methanol hydrogen) + swro (if present) in `converterDuties`; include seawater source feeding swro; scale purchased CO₂ via `collectMaterialSourcesFeeding` from methanol; process kWh = MTO SEC + methanol SEC + electrolyzer SEC + SWRO SEC.
2. Purchased-MeOH graphs (`createMtoCase` buys MeOH as a material-source; no methanol converter upstream of mto) keep current behavior. Existing `tests/catalog-size-steel-mto.test.js` ethylene asserts stay green.
3. Ratio = targetKg / baselineKg. `applyRatioScale` scales captured duties and streams. Solar is `kWh / yieldPerKWp` (methanol / steel / green-FT convention; demo seed still carries its own 1.02).

## Test rates + achieved

`sizeToProduct({ product: 'ethylene', rate: 2000, caseOrBuilder: createGreenMtoCase })`. One `iterateSize` pass. Achieved = target. Rate 1000 is a sanity check.

### Green MTO (Mejillones SWRO+PEM+MeOH+MTO, purchased CO₂)

| Rate kg/day | Achieved | mto | methanol | electrolyzer kg H₂ | swro m³ | solarKWp | installed CAPEX |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 (unsized demo) | 1000 | 1000 | 2284.36 | 431.16 | 4.046 | 5337.37 | 7,753,793 |
| 1000 (sized) | 1000 | 1000 | 2284.36 | 431.16 | 4.046 | 5232.71 | 7,643,906 |
| 2000 | 2000 | 2000 | 4568.73 | 862.31 | 8.092 | 10465.43 | 15,287,812 |

2000 converter duties are exact 2×. 2000 solar is ~2% under 2× of the 1000 seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±20% screen. CAPEX ~1.97× of the unsized 1000 seed (solar pack is not linear with the 1.02 seed); 2.00× of the sized-1000 plant.

Purchased `createMtoCase` ethylene 2000 still hits target (assert in the new file plus existing `catalog-size-steel-mto.test.js`).

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.**

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 1000 (default demo) | 354,450 | 266,127 | 789,741 | 7,753,793 | **−701,417** |
| 1000 (sized) | 354,450 | 264,034 | 778,549 | 7,643,906 | **−688,132** |
| 2000 | 708,901 | 528,068 | 1,557,097 | 15,287,812 | **−1,376,264** |

Exact 1000 unsized: `annualRevenue` 354450.42633282475; `annualOperatingCost` 266126.86802930885; `annualizedCapex` 789740.9201817545; `annualNetCash` -701417.3618782386; `installedCapex` 7753792.768039112.

Exact 1000 sized: `annualRevenue` 354450.42633282475; `annualOperatingCost` 264033.78211963346; `annualizedCapex` 778548.6854660121; `annualNetCash` -688132.0412528208; `installedCapex` 7643905.757781182.

Exact 2000: `annualRevenue` 708900.8526656495; `annualOperatingCost` 528067.5642392669; `annualizedCapex` 1557097.3709320242; `annualNetCash` -1376264.0825056415; `installedCapex` 15287811.515562365.

Sign stays cash− (about 2× the 1000 demo). Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91). Screening, not bankable.

## Files

- `engine/size.js` (`ethyleneChain` detects upstream methanol→electrolyzer+swro; process kWh includes stack SECs)
- `js/flowsheet-app.js` (green-MTO load-status Size-to-target honesty)
- `tests/catalog-size-green-mto.test.js`
- `README.md` (sizeToProduct ethylene now covers green-MTO stacks)
- `.hunt-run/catalog-size-green-mto-summary.md`

## Tests

`npm test`: **529 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module/steel/ethylene/diesel/urea sizeToProduct tests stay green. Maglut ≈ 1299. Green-FT / green-urea size tests stay green. Purchased `createMtoCase` ethylene 2000 still hits target. No pack/price/SEC/freight edits.

## Leftovers

- Network green-MTO plant (fuels+minerals demo still has green-FT, not green-MTO).
- Phosphoric / MAP-DAP or chlor-alkali as a sized catalog product only with a public TIC.
