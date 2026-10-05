# CATALOG-SIZE-GREEN-H2-DRI

Thin **1000 → 2000** `sizeToProduct` coverage for **green H₂-DRI steel**. Rate 500 was already asserted in `tests/catalog-size-steel-mto.test.js`. Probe on tip `0508c2d` (after network-green-mto) showed `steelChain` already sizes the green stack: rate 1000 → achieved 1000; rate 2000 → achieved 2000, electrolyzer + SWRO exact 2×, CAPEX/solar ~2×, cash finite. **Tests + docs only.** `engine/size.js` untouched. Packs, product prices, SEC, freight bands, and Maglut/purchased size numbers were **not** retuned. MECH undo/pump/blower untouched. Network never Empire. Cash sign recorded, not forced. Inland-truck and Li metal not invented.

## Design

No code change. Green graphs already go through `steelChain`: hydrogen-dri + electrolyzer + swro in `converterDuties`; seawater source feeding swro; process kWh = DRI 0.7 + electrolyzer 52 × H₂ kg + SWRO 3.5 × m³. Ratio = targetKg / baselineKg. `applyRatioScale` scales captured duties and streams. Solar is `kWh / yieldPerKWp` (methanol / module convention; demo seed still carries its own 1.02). Purchased `createH2DriCase` stays a hydrogen-feed path (no electrolyzer).

## Test rates + achieved

`sizeToProduct({ product: 'steel', rate: 1000, caseOrBuilder: createGreenH2DriCase })` and rate 2000. One `iterateSize` pass each. Achieved = target. Existing rate-500 green + purchased asserts stay.

### Green H₂-DRI (Mejillones SWRO+PEM, purchased hematite)

| Rate kg/day | Achieved | dri | electrolyzer kg H₂ | swro m³ | solarKWp | installed CAPEX |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 (unsized demo) | 1000 | 1000 | 54.147 | 0.508 | 680.79 | 1,740,403 |
| 1000 (sized) | 1000 | 1000 | 54.147 | 0.508 | 667.44 | 1,726,387 |
| 2000 | 2000 | 2000 | 108.293 | 1.016 | 1334.88 | 3,452,774 |

2000 converter duties are exact 2× of sized 1000 / unsized seed. 2000 solar is ~2% under 2× of the 1000 seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±20% screen. CAPEX ~1.98× of the unsized 1000 seed (solar pack is not linear with the 1.02 seed); 2.00× of the sized-1000 plant.

Purchased `createH2DriCase` steel 2000 still hits target (assert in the new file plus existing `catalog-size-steel-mto.test.js` at 500).

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.**

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 1000 (default demo) | 153,843 | 116,934 | 177,264 | 1,740,403 | **−140,355** |
| 1000 (sized) | 153,843 | 116,667 | 175,836 | 1,726,387 | **−138,660** |
| 2000 | 307,686 | 233,333 | 351,673 | 3,452,774 | **−277,320** |

Exact 1000 unsized: `annualRevenue` 153842.8431372549; `annualOperatingCost` 116933.64707427443; `annualizedCapex` 177263.8945339889; `annualNetCash` -140354.69847100842; `installedCapex` 1740403.046553248.

Exact 1000 sized: `annualRevenue` 153842.8431372549; `annualOperatingCost` 116666.67140754302; `annualizedCapex` 175836.31131266104; `annualNetCash` -138660.13958294917; `installedCapex` 1726386.8240498498.

Exact 2000: `annualRevenue` 307685.6862745098; `annualOperatingCost` 233333.34281508604; `annualizedCapex` 351672.6226253221; `annualNetCash` -277320.27916589833; `installedCapex` 3452773.6480996995.

Sign stays cash− (about 2× the 1000 demo). Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91). Screening, not bankable.

## Files

- `tests/catalog-size-green-h2-dri.test.js`
- `README.md` (sizeToProduct steel covers green H₂-DRI at island scale 1000→2000)
- `.hunt-run/catalog-size-green-h2-dri-summary.md`

Not edited: `engine/size.js`, `cases/green-h2-dri.js`, `cases/h2-dri.js`, `data/tea-screening.js`, `js/flowsheet-app.js`, MECH undo/pump/blower, Network.

## Tests

`npm test`: **531 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module/steel/ethylene/diesel/urea sizeToProduct tests stay green, including rate-500 green + purchased steel. Maglut ≈ 1299. Purchased `createH2DriCase` steel 2000 still hits target. No pack/price/SEC/freight edits.

## Leftovers

- Inland-truck freight band only with a cited $/kg (existing bands stay chile-coast-container / bulk-dry-shortsea / none).
- Li metal as a sized catalog product only with an open TIC.

## Tip

Feat `3bb0fe8` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `3bb0fe8`). `npm test` 531 pass / 0 fail. Prior checkout tip `0508c2d`.
