# CATALOG-SIZE-TITANIUM

Thin `sizeToProduct` path for **titanium** on graphs that already have a `titanium-kroll` converter (+ Ti sink). Canonical product is **`titanium`** (aliases `ti`, `sponge`). Purchased-TiCl₄ `cases/ti-kroll.js` (Mejillones) is the size target. Packs, product prices, SEC, freight bands, and Maglut/urea/FT numbers were **not** retuned. MECH undo/pump/blower untouched. No new unit. No TiCl₄-chloride front-end (that skip stays hollow CAPEX). Cash sign recorded, not forced.

## Design

Mirror `sizeUrea` / `sizeDiesel` baseline-ratio. Not a stoich re-derive and not a new unit.

1. Detect a `titanium-kroll` converter and a titanium product sink (port `titanium`, or id `titanium` / `titanium-product` / `sponge`). Missing `titanium-kroll` throws.
2. Baseline = current definition: kroll capacity/setpoint; purchased `material-source` streams feeding it (TiCl₄ and Mg on the purchased path). Solar via existing `applyPowerAndSite`.
3. Ratio = targetTitaniumKg / baselineTitaniumKg. Scale captured duties and material streams. Recompute process kWh from Kroll SEC × scaled duty (param `electricityKWhPerKg`, default 8). Size solar as `kWh / yieldPerKWp` (methanol / urea convention; demo seed still carries its own 1.02).
4. Does not add a chloride rutile train or Mg recycle cell. Size-to-target titanium on those stacks is leftover.

FEED_MARGIN 1.05 stays on the purchased demo streams. Baseline-ratio inherits it.

## Test rates + achieved

`sizeToProduct({ product: 'titanium', rate: 2000, caseOrBuilder: createTiKrollCase })`. One `iterateSize` pass. Achieved = target. Demo seed is 100 kg Ti/day.

| Rate kg/day | Achieved | kroll cap | TiCl₄ feed kg | Mg feed kg | solarKWp | kroll CAPEX |
|---:|---:|---:|---:|---:|---:|---:|
| 100 (unsized demo) | 100 | 100 | 416.08 | 106.63 | 154.84 | 840,000 |
| 1000 | 1000 | 1000 | 4160.76 | 1066.30 | 1518.03 | 8,400,000 |
| 2000 | 2000 | 2000 | 8321.51 | 2132.60 | 3036.05 | 16,800,000 |

1000/2000 capacities and purchased feeds are exact 10× / 20× of the 100 seed. 1000 solar is ~2% under 10× of the 100 seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±20% screen. 2000 is exact 2× of 1000. Kroll island CAPEX is exact 20× of the 100 seed via `capexRate × capacity` (Chile ×1.05 already in the rate).

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.**

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 100 (default demo) | 292,000 | 347,777 | 102,115 | 1,002,581 | **−157,892** |
| 1000 | 2,920,000 | 3,477,162 | 1,017,904 | 9,993,928 | **−1,575,066** |
| 2000 | 5,840,000 | 6,954,324 | 2,035,807 | 19,987,856 | **−3,150,131** |

Sign stays cash− (1000 vs 2000 is about 2×). Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91). Screening, not bankable.

## Files

- `engine/size.js` (`sizeTitanium`, aliases, dispatcher)
- `js/flowsheet-app.js` (`SIZE_PRODUCT_LABELS`, Mejillones Ti Kroll load-status clause)
- `index.html` (`<option value="titanium">titanium / Kroll</option>` after urea)
- `tests/catalog-size-titanium.test.js`
- `tests/size.test.js` (light `ti` alias)
- `tests/flowsheet-ui.test.js` (sizeProduct option)
- `README.md` (purchased-TiCl₄ Kroll section + size-to-target product list)
- `.hunt-run/catalog-size-titanium-summary.md`

## Tests

`npm test`: **481 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module/steel/ethylene/diesel/urea sizeToProduct tests stay green. Maglut ≈ 1299. No pack/price/SEC/freight edits.

## Leftovers

- Chloride process from rutile (TiO₂ + C + 2 Cl₂ → TiCl₄ + CO₂) not modeled; TiCl₄ stays a purchased feed.
- Mg recycle electrolysis credit (MgCl₂ → Mg + Cl₂) not wired; demo vents MgCl₂ with no credit.
- Demo 2% solar seed margin is not copied into the sizer (methanol / urea convention).

## Tip

Feat `d46797a` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `d46797afb7ab`). `npm test` 481 pass / 0 fail. Prior checkout tip `d7d895f`.
