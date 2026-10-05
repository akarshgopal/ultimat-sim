# CATALOG-SIZE-COPPER

Thin `sizeToProduct` path for **copper** on graphs that already have a `copper-ew` converter (+ cathode-product sink). Canonical product is **`copper`**. Tea sale key is **`copper-cathode`** (USGS LME grade A; documented, not retuned). Aliases `copper`, `cu`, `cathode`, `cu-ew` (and `copper-cathode`) size that cathode sale. Purchased-PLS `cases/cu-ew.js` (Mejillones) is the size target. Packs, product prices, SEC, freight bands, and Maglut/cement/float-glass numbers were **not** retuned. MECH undo/pump/blower untouched. Network demo plants not edited. No new unit. No new pack/price. No mine/heap. Cash sign recorded, not forced.

## Copper vs copper-cathode labeling

The converter product is LME-grade cathode (substance `Cu`, solid). The tea sale key is **`copper-cathode`**. The size canonical key is **`copper`** (aliases `cu` / `cathode` / `cu-ew` / `copper-cathode`). Raffinate/acid inventory is not a sale; it scales with mass balance if present. The Mejillones island has no raffinate/acid inventory nodes (YAGNI). Documented, not retuned.

## Design

Mirror `sizeCement` / `sizeFloatGlass` baseline-ratio. Not a stoich re-derive and not a new unit.

1. Detect a `copper-ew` converter and a copper product sink (port `cathode`, or id `cathode` / `cathode-product` / `copper` / `copper-product` / `copper-cathode`). Missing `copper-ew` throws.
2. Baseline = current definition: copper-ew capacity/setpoint; purchased `material-source` streams feeding it (PLS on the purchased path). Solar via existing `applyPowerAndSite`.
3. Ratio = targetCopperKg / baselineCopperKg. Scale captured duties and material streams. Recompute process kWh from copper-ew SEC × scaled duty (param `electricityKWhPerKg`, default 2.2). Size solar as `kWh / yieldPerKWp` (methanol / urea / cement convention; demo seed still carries its own 1.02).
4. Does not add a heap, mine, pad, raffinate sale, or acid credit. Size-to-target copper on those stacks is leftover.

FEED_MARGIN 1.05 stays on the purchased demo stream. Baseline-ratio inherits it.

## Test rates + achieved

`sizeToProduct({ product: 'copper', rate: 2000, caseOrBuilder: createCuEwCase })`. One `iterateSize` pass. Achieved = target. Demo seed is 1000 kg cathode/day.

| Rate kg/day | Achieved | copper-ew cap | PLS kg | solarKWp | tankhouse CAPEX |
|---:|---:|---:|---:|---:|---:|
| 1000 (unsized demo) | 1000 | 1000 | 1050 | 425.81 | 787,500 |
| 2000 | 2000 | 2000 | 2100 | 834.91 | 1,575,000 |

2000 capacities and purchased PLS are exact 2× of the 1000 seed. 2000 solar is ~2% under 2× of the 1000 seed because the seed array still carries the demo 1.02 margin and the sizer matches methanol (`kWh / yieldPerKWp`). Within the ±20% screen. Copper-ew island CAPEX is exact 2× of the 1000 seed via `capexRate × capacity` (Chile ×1.05 already in the rate: 750 × 1.05 × 1000 = 787,500).

## Cash (evaluateEconomics, 365 d, CRF 8%/20 y)

Capital-inclusive `annualNetCash` = R − OPEX − annualized CAPEX. **Recorded, not a sign gate. Not retuned.** The unsized demo already fell cash−; this path did not change packs or prices to keep or flip that sign.

| Rate kg/day | Revenue | OPEX | Ann. CAPEX | Installed CAPEX | **Net cash** |
|---:|---:|---:|---:|---:|---:|
| 1000 (default demo) | 3,540,500 | 3,467,366 | 125,746 | 1,234,597 | **−52,613** |
| 2000 | 7,081,000 | 6,934,398 | 249,707 | 2,451,660 | **−103,105** |

Sign stays cash− (about 2×). Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91). Screening, not bankable.

Exact 2000 lines: `annualRevenue` 7080999.999999998; `annualOperatingCost` 6934398.292220112; `annualizedCapex` 249707.0210715961; `annualNetCash` -103105.3132917099; `installedCapex` 2451660.3415559772.

## Files

- `engine/size.js` (`sizeCopper`, aliases, dispatcher, error list)
- `js/flowsheet-app.js` (`SIZE_PRODUCT_LABELS`, Mejillones copper load-status clause, `selectionForProduct`)
- `index.html` (`<option value="copper">copper</option>` after cement)
- `tests/catalog-size-copper.test.js`
- `tests/size.test.js` (light `cu` alias)
- `tests/flowsheet-ui.test.js` (sizeProduct option)
- `README.md` (purchased-PLS SX-EW section + size-to-target product list)
- `.hunt-run/catalog-size-copper-summary.md`

## Tests

`npm test`: **514 pass / 0 fail**. Existing CH₄/H₂/methanol/ammonia/lithium/salt/module/steel/ethylene/diesel/urea/titanium/float-glass/cement sizeToProduct tests stay green. Maglut ≈ 1299. No pack/price/SEC/freight edits.

## Leftovers

- Heap leach / mine / pad not modeled; PLS stays a purchased feed.
- Raffinate / acid sale omitted (inventory if present; Mejillones island has none).
- Demo 2% solar seed margin is not copied into the sizer (methanol / urea / cement convention).
- Network demo plants not edited.

## Tip

Feat pending on `main`. Prior checkout tip `8c74f41`.
