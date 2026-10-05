# CATALOG-SIZE-PV-MODULE (sizeToProduct PV module on Mejillones)

Thin `sizePvModule` path so Size-to-target can resize the Mejillones quartz→MG-Si→poly + Bayer Al + Ag/glass/EVA → module chain to a module kg/day target. Canonical product is **`module`** (aliases `pv-module`, `pvmodule`, `PVmodule`, `pv`). Baseline-ratio, not a stoich re-derive and not a cell-fab optimizer. Packs, product prices, SEC, freight bands, and Maglut/REE/urea/NH₃ numbers were **not** retuned. MECH undo/pump/blower untouched. Maglut / Minaçu / peer-SX / Bioforge / urea / green-NH₃ / Dead Sea case builders untouched. Mejillones `cases/silicon.js` constants were read, not changed.

## Design

Mirror `baselineAbundanceDuties` / mineral scaling:

1. Detect a `pv-module` converter and a module product sink (`material-sink` fed from `pv-module` port `module`, or id `module`). Missing `pv-module` throws.
2. Baseline = current definition: converter duties (max of capacity/setpoint) for `mg-si`, `polysilicon`, `bayer-alumina`, `aluminium-smelter`, `pv-module`; purchased `material-source` streams that feed those converters (quartz, reductant, bauxite, caustic, anode, silver, glass, eva); solar via existing `applyPowerAndSite`.
3. Ratio = targetModuleKg / baselineModuleKg. Scale captured duties and material streams by ratio. Recompute process electricity from unit `electricityKWhPerKg` × scaled duties (defaults MG-Si 12, poly 65, Bayer 3.5, Al 14, module 0.05). Size solar as `kWh / yieldPerKWp` (methanol / `applyPowerAndSite` convention; no extra 2% — the demo seed still has its own 1.02).
4. `iterateSize` until module sink mass ≈ target. No heat cascade (these units have no `wasteHeat`).

Fraunhofer mass shares stay on the demo (0.0273 poly, 0.1273 Al, 0.0003 Ag, 0.6745 glass, 0.0669 EVA, FEED_MARGIN 1.05). Baseline-ratio inherits them. No second share table.

## Test rates + achieved

`sizeToProduct({ product: 'module', rate, caseOrBuilder: createSiliconCase })`. One `iterateSize` pass. Achieved = target.

| Rate kg/day | Achieved | pv-module cap | poly cap | Al cap | solarKWp |
|---:|---:|---:|---:|---:|---:|
| 500 | 500 | 500 | 13.65 | 63.65 | 454.70 |
| 1000 (unsized demo) | 1000 | 1000 | 27.3 | 127.3 | 927.58 |
| 2000 | 2000 | 2000 | 54.6 | 254.6 | 1818.79 |

500 solar is ~2% under half of the 1000 seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±15% screen. 2000 capacities are exact 2×.

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.**

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 500 | 505,525 | 225,327 | 155,696 | 1,528,646 | **+124,502** |
| 1000 (default demo) | 1,011,050 | 451,018 | 313,337 | 3,076,389 | **+246,695** |
| 2000 | 2,022,100 | 901,308 | 622,784 | 6,114,583 | **+498,008** |

Exact 1000 default matches freight-qcc tip (`annualNetCash` 246695.07377732982). Maglut `createMaglutCase` cash still ≈ 1299 (±5). Urea / green NH₃ cash finite. Screening, not bankable.

## Files

- `engine/size.js` (`sizePvModule`, aliases, dispatcher)
- `js/flowsheet-app.js` (SIZE_PRODUCT_LABELS, selection, Mejillones load-status clause)
- `index.html` (`<option value="module">PV module</option>` after salt)
- `tests/catalog-size-pv-module.test.js`
- `tests/size.test.js` (light alias)
- `tests/flowsheet-ui.test.js` (sizeProduct option)
- `README.md` (one short clause + product-list mention)
- `.hunt-run/catalog-size-pv-module-summary.md`

## Tests

`npm test`: **414 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt sizeToProduct tests stay green. Maglut ≈ 1299. Freight-qcc Mejillones default 1000 still finite. No pack/price/SEC/freight edits.

## Leftovers

- Size quartz / silicon / alumina / poly alone (no separate aliases this tranche).
- Urea size alias.
- FT liquids.
- Inland freight / Asia-origin premium.
- Cell fab / TOPCon / bankable module line.
- Demo 2% solar seed margin is not copied into the sizer (methanol convention).
