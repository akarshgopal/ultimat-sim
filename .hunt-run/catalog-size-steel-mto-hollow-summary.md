# CATALOG-SIZE-STEEL-MTO + hollow More-units delete

Thin `sizeToProduct` paths for **steel** (H₂-DRI Fe) and **ethylene** (MTO), plus Elon-delete of physics-only More palette units that had no TEA packs. Packs, product prices, SEC, freight bands, and Maglut/REE/urea/NH₃ numbers were **not** retuned. MECH undo/pump/blower untouched. Case builders (`h2-dri.js`, `green-h2-dri.js`, `mto.js`) were read-only for sizing. Network still Dead Sea + Almería. Cash sign recorded, not forced.

## Design

Mirror `sizePvModule` / mineral baseline-ratio. Not a stoich re-derive.

### steel (canonical) aliases `steel`, `fe`, `dri`, `iron`

1. Detect a `hydrogen-dri` converter and a steel product sink (port `steel` or id `steel`). Missing `hydrogen-dri` throws.
2. Baseline = current definition: dri capacity/setpoint; material-sources feeding dri (ironOre and purchased hydrogen when present); if present, `swro` + `electrolyzer` duties and the seawater source stream (green path). Solar via existing `applyPowerAndSite`.
3. Ratio = targetFeKg / baselineFeKg. Scale captured duties and material streams. Recompute process kWh from SEC × scaled duties: purchased path dri 0.7 only; green path dri 0.7 + electrolyzer 52 × H₂ kg + swro 3.5 × m³ (params override those defaults). Size solar as `kWh / yieldPerKWp` (methanol / module convention; demo seeds still carry their own 1.02).
4. Works on `createH2DriCase` (purchased H₂) and `createGreenH2DriCase` (SWRO+PEM). Does not invent a `hydrogen-feed` node on the green path.

### ethylene (canonical) aliases `ethylene`, `c2h4`, `mto`, `olefin`

Detect `mto` + ethylene sink. Baseline-ratio scale mto + methanol-feed stream + solar (SEC default 4). Missing `mto` throws.

### Hollow More units

`PALETTE_MORE_UNITS` was `nuclear-electricity`, `solar-thermal`, `thermal-storage` — physics in `engine/units.js` / UNIT_META, no TEA packs/prices/demand/cases. Emptied the array. `paletteCategory` already hides empty sections, so More chrome disappears. Unit implementations stay.

## Test rates + achieved

`sizeToProduct({ product, rate: 500, caseOrBuilder })`. One `iterateSize` pass. Achieved = target.

| Product / case | Achieved | Converter cap | solarKWp | vs half of 1000 seed |
|---|---:|---:|---:|---|
| steel / purchased H₂-DRI | 500 | dri 500 | 66.41 | half of 135.48 is 67.74 (~2% under; ±20% OK) |
| steel / green SWRO+PEM | 500 | dri 500; el 27.07; swro 0.254 | 333.72 | half of 680.79 is 340.39 |
| ethylene / MTO | 500 | mto 500 | 379.51 | half of 774.19 is 387.10 |

Green path: no `hydrogen-feed` node. Electrolyzer + SWRO exact ½ of the 1000 kg Fe/day seed.

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.**

| Case | Revenue | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---|---:|---:|---:|---:|
| steel 500 purchased H₂ | 73,000 | 49,881 | 489,734 | **−46,340** |
| steel 500 green H₂-DRI | 76,921 | 87,918 | 863,193 | **−69,330** |
| ethylene 500 MTO | 146,000 | 50,372 | 494,557 | **−88,038** |
| Maglut default | — | — | — | **≈ 1299** (±5; measured 1298.91) |

Purchased-H₂ 1000 kg/day default remains finite (net ≈ −93,017). Screening, not bankable.

## Files

- `engine/size.js` (`sizeSteel`, `sizeEthylene`, aliases, dispatcher)
- `js/flowsheet-app.js` (`SIZE_PRODUCT_LABELS`, selection, `PALETTE_MORE_UNITS = []`)
- `index.html` (`<option value="steel">steel / DRI Fe</option>`, `<option value="ethylene">ethylene</option>` after module)
- `tests/catalog-size-steel-mto.test.js`
- `tests/size.test.js` (light `fe` / `mto` aliases)
- `tests/flowsheet-ui.test.js` (hollow units absent like med/msf; More hidden)
- `tests/catalog-sial.test.js` (empty `PALETTE_MORE_UNITS`)
- `README.md` (size steel/ethylene + palette delete)
- `.hunt-run/catalog-size-steel-mto-hollow-summary.md`

## Tests

`npm test`: **441 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module sizeToProduct tests stay green. Maglut ≈ 1299. No pack/price/SEC/freight edits.

## Leftovers

- Size urea / titanium this tranche (skipped).
- FT liquids.
- Glucaric blocked (no public mol split).
- Mg-recycle skip (Kroll still vents MgCl₂).
- Full MTO olefin slate (propylene/C4).
- Demo 2% solar seed margin is not copied into the sizer (methanol / module convention).
- Nuclear / solar-thermal / thermal-storage TEA packs (still out of the default palette).

## Tip

Pending feat commit + Pages publish.
