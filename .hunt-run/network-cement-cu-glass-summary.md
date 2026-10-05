# NETWORK-CEMENT-CU-GLASS (fuels + minerals rollup includes Mejillones cement, Cu SX-EW, float-glass)

Compose the existing Mejillones cement, copper SX-EW, and float-glass plants into the fuels + minerals Network demo so the rollup spans more materials. Reused `createCementCase`, `createCuEwCase`, and `createFloatGlassCase` unchanged (no TEA retune). Corridors stay empty (YAGNI haul). Network never Empire. Screening honesty: cash sign recorded, not forced. Cement / Cu-EW / float-glass / Maglut / green-urea / silicon / coastal / abundance factories not edited. MECH undo/pump/blower untouched. `dac.js` not deleted. Soda-ash / Ag-refine / TiCl4 not touched.

Gate **PASS**. `CementCase.createCementCase` → site id `chile-mejillones-cement`. `CuEwCase.createCuEwCase` → site id `chile-mejillones-cu-ew`. `FloatGlassCase.createFloatGlassCase` → site id `chile-mejillones-float-glass`. All three already export and are browser-loadable (`cases/float-glass.js`, `cases/cement.js`, `cases/cu-ew.js` now load before `cases/network.js`). Empty corridors still roll up. No new flowsheet.

## Plants

`createFuelsAndMineralsNetwork(6)` / Overview id `demo-network` (label `Fuels + minerals · cement / Cu / glass`):

| id | name | site.id | factory |
|---|---|---|---|
| `dead-sea-minerals` | Dead Sea brine and ammonia | `dead-sea-pvgis-2026-09-06` | `siteDeadSeaAbundance` (unchanged) |
| `almeria-fuels` | Almería solar methane | `almeria-pvgis-2026-09-05` | `coastal.createCoastalCase(6)` (unchanged) |
| `mejillones-silicon` | Mejillones silicon and PV | `chile-mejillones` | `silicon.createSiliconCase()` (unchanged) |
| `walvis-green-urea` | Walvis Bay green urea | `namibia-walvis-bay-green-urea` | `greenUrea.createGreenUreaCase()` (unchanged) |
| `long-beach-maglut` | Long Beach Maglut | `us-long-beach` | `maglut.createMaglutCase()` (unchanged) |
| `mejillones-cement` | Mejillones cement | `chile-mejillones-cement` | `cement.createCementCase()` (unchanged) |
| `mejillones-cu-ew` | Mejillones copper SX-EW | `chile-mejillones-cu-ew` | `cuEw.createCuEwCase()` (unchanged) |
| `mejillones-float-glass` | Mejillones float glass | `chile-mejillones-float-glass` | `floatGlass.createFloatGlassCase()` (unchanged) |

Corridors: `[]`.

## Rollup cash (capital-inclusive, 365 d, CRF 8%/20 y)

Solved `evaluateNetwork(createFuelsAndMineralsNetwork(6))`. Sign is whatever falls out of the eight existing plants; nothing retuned to make the rollup cash+.

| Plant | Revenue | OPEX | ann. CAPEX | **Net cash** | Installed CAPEX |
|---|---:|---:|---:|---:|---:|
| Dead Sea brine and ammonia | 904,894 | 485,620 | 287,079 | **+132,196** | 2,818,579 |
| Almería solar methane | 1,471 | 17,028 | 53,024 | **−68,580** | 520,594 |
| Mejillones silicon and PV | 1,011,050 | 451,018 | 313,337 | **+246,695** | 3,076,389 |
| Walvis Bay green urea | 163,114 | 169,315 | 392,732 | **−398,932** | 3,855,897 |
| Long Beach Maglut | 180,113 | 149,372 | 29,442 | **+1,299** | 289,065 |
| Mejillones cement | 58,400 | 28,631 | 28,151 | **+1,619** | 276,387 |
| Mejillones copper SX-EW | 3,540,500 | 3,467,366 | 125,746 | **−52,613** | 1,234,597 |
| Mejillones float glass | 164,250 | 55,200 | 83,831 | **+25,219** | 823,065 |
| **Network rollup** | **6,023,793** | **4,823,549** | **1,313,341** | **−113,098** | **12,894,573** |

Exact rollup: `annualRevenue` 6023792.566646405; `annualOperatingCost` 4823549.428617488; `annualizedCapex` 1313340.7296056899; `annualNetCash` -113097.59157677297; `installedCapex` 12894572.879475668; `npv` -1110408.825528264; `landHa` 5.455434001218987.

Walvis green urea stays cash− (electrolyzer + Haber + PV dominate). Almería methane stays cash−. Mejillones Cu SX-EW is cash− (PLS payable 96.5% of LME vs pack + Chile 1.05 CAPEX×). Dead Sea minerals, Mejillones PV BOM, Long Beach Maglut, Mejillones cement, and Mejillones float-glass were already cash+ at their existing screening mids; the rollup inherits the urea and Cu holes and is cash−. Screening, not bankable. Slate includes CH₄, NH₃, Br₂, PVmodule (365 t/y), Urea (365 t/y), PortlandCement (365 t/y), Cu (365 t/y), FloatGlass (365 t/y), and Maglut oxides. Maglut plant `annualNetCash` 1298.91 ≈ 1299 (±5) on its own and via `createMaglutCase`.

## Files

- `cases/network.js` (require `./cement` + `./cu-ew` + `./float-glass`; sixth–eighth plants)
- `index.html` (`float-glass.js`, `cement.js`, `cu-ew.js` before `network.js`; Overview option text)
- `js/flowsheet-app.js` (`loadDemoNetwork` chip)
- `tests/network.test.js` (8 plants, site ids, finite cash, Maglut plant ≈1299, `createMaglutCase` ≈1299, corridors `[]`, PortlandCement / Cu / FloatGlass slate)
- `tests/flowsheet-ui.test.js` (script order + 8-plant rollup)
- `tests/flowsheet-browser.test.js` (script order)
- `README.md` (one network sentence)
- `.hunt-run/network-cement-cu-glass-summary.md`

Not edited: `cases/cement.js`, `cases/cu-ew.js`, `cases/float-glass.js`, `cases/green-urea.js`, `cases/maglut.js`, `cases/silicon.js`, `cases/coastal.js`, `cases/abundance.js`, `cases/dac.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower.

## Tests

`npm test`: **508 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5) on the network plant and via `createMaglutCase`. Network has 8 plants; cement site id `chile-mejillones-cement`; Cu site id `chile-mejillones-cu-ew`; float-glass site id `chile-mejillones-float-glass`; cash rollup finite (cash−); corridors empty. Cement / Cu-EW / float-glass / Maglut / green-urea / silicon / coastal / abundance factories and TEA packs/prices unchanged.

## Leftovers

- No haul between basins (empty corridors on purpose).
- Network demo still opens the Dead Sea mineral lead plant.
- Cement, Cu SX-EW, and float-glass TEA are the existing cases; this tranche only composes them.

## Tip

Feat `17cc6f8` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `17cc6f8`). `npm test` 508 pass / 0 fail. Prior checkout tip `cae257a`.
