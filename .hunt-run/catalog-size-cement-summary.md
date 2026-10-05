# CATALOG-SIZE-CEMENT

Thin `sizeToProduct` path for **cement** on graphs that already have a `cement` converter (+ cement-product sink). Canonical product is **`cement`** (tea sale key; aliases `clinker`, `cem-i`, `portland`). Purchased-limestone/clay `cases/cement.js` (Mejillones) is the size target. Packs, product prices, SEC, freight bands, and Maglut/urea/titanium/float-glass numbers were **not** retuned. MECH undo/pump/blower untouched. Network demo plants not edited. No new unit. No new pack/price. Cash sign recorded, not forced.

## Clinker vs cement labeling

The kiln product is **clinker** (gypsum ~4–5% EN 197-1 CEM I omitted). The tea sale key and size canonical key are **`cement`** (USGS mill portland/blended $0.16/kg, not a clinker export quote). Aliases `clinker` / `cem-i` / `portland` all size that `cement` key. Substance is `PortlandCement`. Documented, not retuned.

## Design

Mirror `sizeFloatGlass` / `sizeTitanium` / `sizeUrea` baseline-ratio. Not a stoich re-derive and not a new unit.

1. Detect a `cement` converter and a cement product sink (port `cement`, or id `cement` / `clinker` / `portland` / `cement-product` / `cem-i`). Missing `cement` throws.
2. Baseline = current definition: cement capacity/setpoint; purchased `material-source` streams feeding it (limestone, kiln-clay on the purchased path). Solar via existing `applyPowerAndSite`.
3. Ratio = targetCementKg / baselineCementKg. Scale captured duties and material streams. Recompute process kWh from cement SEC × scaled duty (param `electricityKWhPerKg`, default 1.05). Size solar as `kWh / yieldPerKWp` (methanol / urea / float-glass convention; demo seed still carries its own 1.02).
4. Process CO₂ vent is the kiln mass-balance outlet (0.52 kg/kg); it scales with activity. No new vent unit.
5. Does not add a gypsum finish mill, wet kiln, CEM II/III blend, quarry, or CCUS. Size-to-target cement on those stacks is leftover.

FEED_MARGIN 1.05 stays on the purchased demo streams. Baseline-ratio inherits it.

## Test rates + achieved

`sizeToProduct({ product: 'cement', rate: 2000, caseOrBuilder: createCementCase })`. One `iterateSize` pass. Achieved = target. Demo seed is 1000 kg cement/day.

| Rate kg/day | Achieved | cement cap | limestone kg | clay kg | process CO₂ kg | solarKWp | kiln CAPEX |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 (unsized demo) | 1000 | 1000 | 1242.15 | 353.85 | 520 | 203.23 | 63,000 |
| 2000 | 2000 | 2000 | 2484.30 | 707.70 | 1040 | 398.48 | 126,000 |

2000 capacities, purchased feeds, and process CO₂ are exact 2× of the 1000 seed. 2000 solar is ~2% under 2× of the 1000 seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±20% screen. Cement island CAPEX is exact 2× of the 1000 seed via `capexRate × capacity` (Chile ×1.05 already in the rate: 60 × 1.05 × 1000 = 63,000).

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.** The unsized demo already fell cash+; this path did not change packs or prices to keep that sign.

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 1000 (default demo) | 58,400 | 28,631 | 28,151 | 276,387 | **+1,619** |
| 2000 | 116,800 | 57,102 | 55,449 | 544,406 | **+4,249** |

Sign stays cash+ (about 2.6×; solar seed margin vs sizer is the non-linearity). Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91). Screening, not bankable.

Exact 2000 lines: `annualRevenue` 116800; `annualOperatingCost` 57101.6394686907; `annualizedCapex` 55448.960940758174; `annualNetCash` 4249.399590551126; `installedCapex` 544406.072106262.

## Files

- `engine/size.js` (`sizeCement`, aliases, dispatcher, error list)
- `js/flowsheet-app.js` (`SIZE_PRODUCT_LABELS`, Mejillones cement load-status clause, `selectionForProduct`)
- `index.html` (`<option value="cement">cement</option>` after float-glass)
- `tests/catalog-size-cement.test.js`
- `tests/size.test.js` (light `clinker` alias)
- `tests/flowsheet-ui.test.js` (sizeProduct option)
- `README.md` (purchased-limestone/clay section + size-to-target product list)
- `.hunt-run/catalog-size-cement-summary.md`

## Tests

`npm test`: **504 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module/steel/ethylene/diesel/urea/titanium/float-glass sizeToProduct tests stay green. Maglut ≈ 1299. No pack/price/SEC/freight edits.

## Leftovers

- Gypsum / CEM I finish mill not modeled; product is clinker sold at mill portland value, labeled `cement`.
- Wet kiln / CEM II/III / CCUS / quarry not modeled.
- Demo 2% solar seed margin is not copied into the sizer (methanol / urea / float-glass convention).
- Not added to the network demo.

## Tip

Feat `83c1281` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `83c128117505`). `npm test` 504 pass / 0 fail. Prior checkout tip `a2f2cce`.
