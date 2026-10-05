# CATALOG-SIZE-DIESEL

Thin `sizeToProduct` path for **diesel** on graphs that already have `ft-liquids` (+ diesel sink). Canonical product is **`diesel`** (aliases `ft`, `syncrude`). Purchased-H₂ `cases/ft-liquids.js` is the size target. Packs, product prices, SEC, freight bands, and Maglut/MTO/urea numbers were **not** retuned. MECH undo/pump/blower untouched. Green-FT electrolyzer stack is **not** sized this tranche (YAGNI). Cash sign recorded, not forced.

## Design

Mirror `sizeEthylene` / `sizeSteel` baseline-ratio. Not a stoich re-derive and not a new unit.

1. Detect an `ft-liquids` converter and a diesel product sink (port `diesel`, or id `diesel` / `diesel-product`). Missing `ft-liquids` throws.
2. Baseline = current definition: ft-liquids capacity/setpoint; purchased `material-source` streams feeding it (H₂ and CO₂ on the purchased path). Solar via existing `applyPowerAndSite`.
3. Ratio = targetDieselKg / baselineDieselKg. Scale captured duties and material streams. Recompute process kWh from FT SEC × scaled duty (param `electricityKWhPerKg`, default 0.22). Size solar as `kWh / yieldPerKWp` (methanol / ethylene convention; demo seed still carries its own 1.02).
4. Does not collect electrolyzer / SWRO. Green-FT remains a loadable demo; Size-to-target diesel on that stack is leftover.

FEED_MARGIN 1.05 stays on the purchased demo streams. Baseline-ratio inherits it.

## Test rates + achieved

`sizeToProduct({ product: 'diesel', rate: 2000, caseOrBuilder: createFtLiquidsCase })`. One `iterateSize` pass. Achieved = target.

| Rate kg/day | Achieved | ft-liquids cap | H₂ feed kg | CO₂ feed kg | solarKWp | ft CAPEX |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 (unsized demo) | 1000 | 1000 | 459.78 | 3255.47 | 42.58 | 465,150 |
| 2000 | 2000 | 2000 | 919.56 | 6510.94 | 83.49 | 930,300 |

2000 capacities and purchased feeds are exact 2×. 2000 solar is ~2% under 2× of the 1000 seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±20% screen. FT island CAPEX is exact 2× via `capexRate × capacity`.

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.**

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 1000 (default demo) | 328,500 | 406,649 | 51,930 | 509,860 | **−130,079** |
| 2000 | 657,000 | 813,264 | 103,682 | 1,017,966 | **−259,946** |

Sign stays cash− (about 2× the 1000 demo). Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91). Screening, not bankable.

## Files

- `engine/size.js` (`sizeDiesel`, aliases, dispatcher)
- `js/flowsheet-app.js` (`SIZE_PRODUCT_LABELS`, Mejillones FT load-status clause)
- `index.html` (`<option value="diesel">diesel / FT</option>` after ethylene)
- `tests/catalog-size-diesel.test.js`
- `tests/size.test.js` (light `ft` alias)
- `tests/flowsheet-ui.test.js` (sizeProduct option)
- `README.md` (purchased-H₂ FT section + size-to-target product list)
- `.hunt-run/catalog-size-diesel-summary.md`

## Tests

`npm test`: **469 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module/steel/ethylene sizeToProduct tests stay green. Maglut ≈ 1299. No pack/price/SEC/freight edits.

## Leftovers

- Size green-FT electrolyzer + SWRO stack (YAGNI this tranche).
- Size urea / titanium.
- Full FT slate (naphtha/wax/LPG).
- Demo 2% solar seed margin is not copied into the sizer (methanol / ethylene convention).
