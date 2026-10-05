# CATALOG-SIZE-NDPR

Thin `sizeToProduct` path for **ndpr** on graphs that already have a `ree-chromatography` converter (+ `ndpr` sink). Canonical product is **`ndpr`**. Tea sale key is **`ndpr-oxide-separated`** (USGS separated NdPr oxide; documented, not retuned). Aliases `ndpr`, `nd-pr`, `ndpr-oxide`, `ndpr-oxide-separated`, `nd2o3`, `maglut` size that NdPr sink. Maglut Long Beach (`cases/maglut.js`) is the size target. Packs, product prices, SEC, recovery, and CAPEX were **not** retuned. MECH undo/pump/blower untouched. Network demo plants not edited. No new unit. No new pack/price. No Maglut-quality vendor curve. Cash sign recorded, not forced.

## NdPr vs REO capacity labeling

The converter duty is recovered listed REO kg/day (`chrom.capacity`). The size target is NdPr oxide kg/day at the `ndpr` sink (Longnan basket fraction of recovered REO). DyTb / light-REO / raffinate follow mass balance; they are not sized independently. Canonical product key is `ndpr`; tea sale key is `ndpr-oxide-separated`. Documented, not retuned.

## Design

Mirror `sizeCopper` / `sizeCement` baseline-ratio. Not a stoich re-derive and not a new unit.

1. Detect a single `ree-chromatography` converter (or analogous `ree-sx`) and an ndpr product sink (port `ndpr`, or id `ndpr` / `ndpr-oxide` / `ndpr-oxide-separated` / `nd2o3`). Missing separator throws `ree-chromatography`. Multiple REE separators throw ambiguity.
2. Baseline = current definition: chrom capacity/setpoint; purchased `material-source` streams feeding it (mixed-REO concentrate). NdPr yield per scale-1 plant is measured from the baseline solved sink. Solar via existing `applyPowerAndSite`.
3. Ratio = targetNdprKg / baselineNdprKg. Scale captured duties and material streams. Recompute process kWh from chrom SEC × scaled REO duty (param `electricityKWhPerKgReo`, default 5). Size solar as `kWh / yieldPerKWp` (methanol / urea / copper convention; demo seed still carries its own 1.02).
4. Capital scaling is whatever the existing pack/engine does (`capexRate × capacity`; pack has no `scaleExponent`). No added curve.

## Test rates + achieved

`sizeToProduct({ product: 'ndpr', rate: 2 × baseline NdPr, caseOrBuilder: createMaglutCase })`. One `iterateSize` pass after the baseline yield solve. Achieved = target. Demo seed is 10 kg recovered listed REO/day → **0.6374 kg NdPr/day**.

| Rate | NdPr kg/day | REO cap | concentrate kg | solarKWp | chrom CAPEX |
|---|---:|---:|---:|---:|---:|
| unsized Maglut demo | 0.6374 | 10 | 10.941 | 15.315 | 273,750 |
| 2× NdPr | 1.2748 | 20 | 21.882 | 30.030 | 547,500 |

2× REO capacity, concentrate, DyTb, light-REO, and raffinate are exact 2× of the seed. 2× solar is ~2% under 2× of the seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±20% screen. Chrom island CAPEX is exact 2× of the seed via `capexRate × capacity` (linear pack; US West aliases to texas so CAPEX× stays 1).

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.** Maglut is the catalog's positive-cash flagship; 2× stays cash+. Sign is whatever fell out.

| | NdPr kg/day | REO cap | CAPEX | Revenue | OPEX | Ann. CAPEX | **Net cash** |
|---|---:|---:|---:|---:|---:|---:|---:|
| base Maglut | 0.6374 | 10 | 289,065 | 180,113 | 149,372 | 29,442 | **+1,299** |
| 2× sized | 1.2748 | 20 | 577,530 | 360,226 | 298,732 | 58,823 | **+2,671** |

Sign stays cash+. 2× net is a little above 2× of the seed because the sizer drops the demo 1.02 solar margin. Maglut unsized `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91). Screening, not bankable. Not a Maglut quote.

Exact 2× lines: `annualRevenue` 360225.8360234399; `annualOperatingCost` 298732.1213883467; `annualizedCapex` 58822.70922025905; `annualNetCash` 2671.0054148341223; `installedCapex` 577530.0300300301.

## Files

- `engine/size.js` (`sizeNdpr`, aliases, dispatcher, error list)
- `js/flowsheet-app.js` (`SIZE_PRODUCT_LABELS`, Maglut load-status clause, `selectionForProduct`)
- `index.html` (`<option value="ndpr">ndpr</option>` after copper)
- `tests/catalog-size-ndpr.test.js`
- `tests/size.test.js` (light `maglut` alias)
- `tests/flowsheet-ui.test.js` (sizeProduct option)
- `README.md` (Maglut chromatography section + size-to-target product list)
- `.hunt-run/catalog-size-ndpr-summary.md`

## Tests

`npm test`: **541 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module/steel/ethylene/diesel/urea/titanium/float-glass/cement/copper sizeToProduct tests stay green. Maglut ≈ 1299. No pack/price/SEC/recovery/CAPEX edits.

## Leftovers

- `cases/ree-sx.js` included: analogous single `ree-sx` block, baseline capacity, same `ndpr` sink; ~15 extra lines in the chain finder. Size-to-target ndpr on that island works (cash− at 2×, recorded, not a Maglut path).
- `cases/ree.js` (ionic clay, `ndpr-oxide` un-separated, `iac-leach`) is out of scope. Throws `ree-chromatography`.
- Demo 2% solar seed margin is not copied into the sizer (methanol / urea / copper convention).
- Network demo plants not edited.

## Tip

Feat pending on `main`. Prior checkout tip `227ab8b`.
