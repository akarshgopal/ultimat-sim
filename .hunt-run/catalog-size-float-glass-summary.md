# CATALOG-SIZE-FLOAT-GLASS

Thin `sizeToProduct` path for **float-glass** on graphs that already have a `float-glass` converter (+ glass sink). Canonical product is **`float-glass`** (tea sale key; aliases `glass`, `solar-glass`). Purchased-sand/soda/limestone `cases/float-glass.js` (Mejillones) is the size target. Packs, product prices, SEC, freight bands, and Maglut/urea/titanium/FT numbers were **not** retuned. MECH undo/pump/blower untouched. No new unit. No soda-ash manufacture unit. Cash sign recorded, not forced.

## Design

Mirror `sizeTitanium` / `sizeUrea` baseline-ratio. Not a stoich re-derive and not a new unit.

1. Detect a `float-glass` converter and a glass product sink (port `glass`, or id `glass` / `float-glass` / `solar-glass` / `float-glass-product`). Missing `float-glass` throws.
2. Baseline = current definition: float-glass capacity/setpoint; purchased `material-source` streams feeding it (silica sand, soda ash, limestone on the purchased path). Solar via existing `applyPowerAndSite`.
3. Ratio = targetGlassKg / baselineGlassKg. Scale captured duties and material streams. Recompute process kWh from float-glass SEC × scaled duty (param `electricityKWhPerKg`, default 2.5). Size solar as `kWh / yieldPerKWp` (methanol / urea convention; demo seed still carries its own 1.02).
4. Does not add a Solvay/trona soda-ash train or a tin-bath / lehr / coating line. Size-to-target float-glass on those stacks is leftover.

FEED_MARGIN 1.05 stays on the purchased demo streams. Baseline-ratio inherits it.

## Test rates + achieved

`sizeToProduct({ product: 'float-glass', rate: 2000, caseOrBuilder: createFloatGlassCase })`. One `iterateSize` pass. Achieved = target. Demo seed is 1000 kg glass/day.

| Rate kg/day | Achieved | float-glass cap | sand kg | soda kg | limestone kg | solarKWp | glass CAPEX |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 (unsized demo) | 1000 | 1000 | 682.50 | 210.00 | 220.50 | 483.87 | 315,000 |
| 2000 | 2000 | 2000 | 1365.00 | 420.00 | 441.00 | 948.77 | 630,000 |

2000 capacities and purchased feeds are exact 2× of the 1000 seed. 2000 solar is ~2% under 2× of the 1000 seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±20% screen. Float-glass island CAPEX is exact 2× of the 1000 seed via `capexRate × capacity` (Chile ×1.05 already in the rate: 300 × 1.05 × 1000 = 315,000).

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.** The unsized demo already fell cash+; this path did not change packs or prices to keep that sign.

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 1000 (default demo) | 164,250 | 55,200 | 83,831 | 823,065 | **+25,219** |
| 2000 | 328,500 | 110,021 | 165,633 | 1,626,205 | **+52,846** |

Sign stays cash+ (about 2×). Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91). Screening, not bankable.

## Files

- `engine/size.js` (`sizeFloatGlass`, aliases, dispatcher)
- `js/flowsheet-app.js` (`SIZE_PRODUCT_LABELS`, Mejillones float-glass load-status clause)
- `index.html` (`<option value="float-glass">float glass</option>` after titanium)
- `tests/catalog-size-float-glass.test.js`
- `tests/size.test.js` (light `glass` alias)
- `tests/flowsheet-ui.test.js` (sizeProduct option)
- `README.md` (purchased-sand/soda/limestone section + size-to-target product list)
- `.hunt-run/catalog-size-float-glass-summary.md`

## Tests

`npm test`: **487 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module/steel/ethylene/diesel/urea/titanium sizeToProduct tests stay green. Maglut ≈ 1299. No pack/price/SEC/freight edits.

## Leftovers

- Soda-ash manufacture (Solvay/trona) not modeled; soda stays a purchased feed.
- Tin bath / lehr / coating / cullet recycle not modeled.
- Demo 2% solar seed margin is not copied into the sizer (methanol / urea convention).

## Tip

Feat `bfb85c8` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `bfb85c8b64ba`). `npm test` 487 pass / 0 fail. Prior checkout tip `47355c9`.
