# CATALOG-SIZE-UREA

Thin `sizeToProduct` path for **urea** on graphs that already have a `urea` converter (+ urea sink). Canonical product is **`urea`** (alias `CO(NH2)2`). Purchased-NH₃ `cases/urea.js` (Walvis) is the size target. Packs, product prices, SEC, freight bands, and Maglut/FT/MTO numbers were **not** retuned. MECH undo/pump/blower untouched. Green-NH₃ electrolyzer stack is **not** sized this tranche (YAGNI). Cash sign recorded, not forced.

## Design

Mirror `sizeDiesel` / `sizeEthylene` baseline-ratio. Not a stoich re-derive and not a new unit.

1. Detect a `urea` converter and a urea product sink (port `urea`, or id `urea` / `urea-product`). Missing `urea` throws.
2. Baseline = current definition: urea capacity/setpoint; purchased `material-source` streams feeding it (NH₃ and CO₂ on the purchased path). Solar via existing `applyPowerAndSite`.
3. Ratio = targetUreaKg / baselineUreaKg. Scale captured duties and material streams. Recompute process kWh from urea SEC × scaled duty (param `electricityKWhPerKg`, default 0.8). Size solar as `kWh / yieldPerKWp` (methanol / ethylene convention; demo seed still carries its own 1.02).
4. Does not collect electrolyzer / Haber. Green-NH₃ remains a loadable demo; Size-to-target urea on that stack is leftover.

## Test rates + achieved

`sizeToProduct({ product: 'urea', rate: 2000, caseOrBuilder: createUreaCase })`. One `iterateSize` pass. Achieved = target.

| Rate kg/day | Achieved | urea cap | NH₃ feed kg | CO₂ feed kg | solarKWp | urea CAPEX |
|---:|---:|---:|---:|---:|---:|---:|
| 1000 (unsized demo) | 1000 | 1000 | 567.16 | 732.82 | 148.91 | 1,140,000 |
| 2000 | 2000 | 2000 | 1134.32 | 1465.63 | 291.97 | 2,280,000 |

2000 capacities and purchased feeds are exact 2×. 2000 solar is ~2% under 2× of the 1000 seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±20% screen. Urea island CAPEX is exact 2× via `capexRate × capacity` (Southern Africa ×0.95 already in the rate).

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.**

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 1000 (default demo) | 146,000 | 166,058 | 130,520 | 1,281,460 | **−150,578** |
| 2000 | 292,000 | 332,000 | 260,474 | 2,557,372 | **−300,474** |

Sign stays cash− (about 2× the 1000 demo). Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91). Screening, not bankable.

## Files

- `engine/size.js` (`sizeUrea`, aliases, dispatcher)
- `js/flowsheet-app.js` (`SIZE_PRODUCT_LABELS`, Walvis urea load-status clause)
- `index.html` (`<option value="urea">urea</option>` after diesel)
- `tests/catalog-size-urea.test.js`
- `tests/size.test.js` (light `CO(NH2)2` alias)
- `tests/flowsheet-ui.test.js` (sizeProduct option)
- `README.md` (purchased-NH₃ urea section + size-to-target product list)
- `.hunt-run/catalog-size-urea-summary.md`

## Tests

`npm test`: **475 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module/steel/ethylene/diesel sizeToProduct tests stay green. Maglut ≈ 1299. No pack/price/SEC/freight edits.

## Leftovers

- Size green-NH₃ electrolyzer + Haber stack into this urea island (YAGNI this tranche; demos stay separate).
- Size titanium.
- Carbamate recycle / granulation.
- Demo 2% solar seed margin is not copied into the sizer (methanol / ethylene convention).

## Tip

Feat `88823f7` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `88823f7`). `npm test` 475 pass / 0 fail. Prior checkout tip `d3d8058`.
