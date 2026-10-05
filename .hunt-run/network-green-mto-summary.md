# NETWORK-GREEN-MTO (fuels + minerals rollup includes Mejillones green MTO)

Compose the existing Mejillones green-MTO plant into the fuels + minerals Network demo so the rollup includes green ethylene. Reused `createGreenMtoCase` unchanged (no TEA retune). Corridors stay empty (YAGNI haul). Network never Empire. Screening honesty: cash sign recorded, not forced. Green-MTO / green-FT / cement / Cu-EW / float-glass / Maglut / green-urea / silicon / coastal / abundance factories not edited. MECH undo/pump/blower untouched. `dac.js` not deleted. Ni / soda-ash / Ag / TiCl4 / Zn / Pb / phosphoric / chlor-alkali-deepen not retried.

Gate **PASS** as a thin compose. `GreenMtoCase.createGreenMtoCase` → site id `chile-mejillones-green-mto`. Already exports and is browser-loadable; `cases/green-mto.js` now loads before `cases/network.js`. Empty corridors still roll up. No new flowsheet.

## Plants

`createFuelsAndMineralsNetwork(6)` / Overview id `demo-network` (label `Fuels + minerals · cement / Cu / glass / green-FT / green-MTO`):

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
| `mejillones-green-ft` | Mejillones green FT | `chile-mejillones-green-ft` | `greenFt.createGreenFtCase()` (unchanged) |
| `mejillones-green-mto` | Mejillones green MTO | `chile-mejillones-green-mto` | `greenMto.createGreenMtoCase()` (unchanged) |

Corridors: `[]`.

## Rollup cash (capital-inclusive, 365 d, CRF 8%/20 y)

Solved `evaluateNetwork(createFuelsAndMineralsNetwork(6))`. Sign is whatever falls out of the ten existing plants; nothing retuned to make the rollup cash+. Cement / Cu / glass / green-FT / green-MTO cash already include screening chile-coast-container freight from catalog-freight leftovers. Walvis green urea includes screening freight from catalog-freight-walvis-urea.

| Plant | Revenue | OPEX | ann. CAPEX | **Net cash** | Installed CAPEX |
|---|---:|---:|---:|---:|---:|
| Dead Sea brine and ammonia | 904,894 | 485,620 | 287,079 | **+132,196** | 2,818,579 |
| Almería solar methane | 1,471 | 17,028 | 53,024 | **−68,580** | 520,594 |
| Mejillones silicon and PV | 1,011,050 | 451,018 | 313,337 | **+246,695** | 3,076,389 |
| Walvis Bay green urea | 152,164 | 190,713 | 392,732 | **−431,280** | 3,855,897 |
| Long Beach Maglut | 180,113 | 149,372 | 29,442 | **+1,299** | 289,065 |
| Mejillones cement | 47,450 | 45,275 | 28,151 | **−25,975** | 276,387 |
| Mejillones copper SX-EW | 3,511,300 | 3,496,566 | 125,746 | **−111,013** | 1,234,597 |
| Mejillones float glass | 153,300 | 70,457 | 83,831 | **−988** | 823,065 |
| Mejillones green FT | 362,726 | 318,956 | 676,404 | **−632,634** | 6,641,032 |
| Mejillones green MTO | 354,450 | 266,127 | 789,741 | **−701,417** | 7,753,793 |
| **Network rollup** | **6,678,919** | **5,491,131** | **2,779,485** | **−1,591,698** | **27,289,398** |

Exact rollup: `annualRevenue` 6678918.624811214; `annualOperatingCost` 5491131.4807320265; `annualizedCapex` 2779485.4503516927; `annualNetCash` -1591698.3062725049; `installedCapex` 27289397.868413504; `npv` -15627528.59917083; `landHa` 16.45816658924263.

Green-MTO stays cash− (electrolyzer + PV dominate installed CAPEX; screening freight on ethylene/CO₂). Prior 9-plant rollup was −857,933 before Walvis urea freight leftover and this plant. Green-MTO contributes −701,417. Walvis green urea, Almería methane, and Mejillones Cu SX-EW stay cash−. Maglut plant `annualNetCash` 1298.91 ≈ 1299 (±5) on its own and via `createMaglutCase`. Slate includes CH₄, NH₃, Br₂, PVmodule (365 t/y), Urea (365 t/y), PortlandCement (365 t/y), Cu (365 t/y), FloatGlass (365 t/y), C12H26 (365 t/y), **C2H4 (365 t/y)**, and Maglut oxides. Screening, not bankable.

## Files

- `cases/network.js` (require `./green-mto`; tenth plant)
- `index.html` (`green-mto.js` before `network.js`; Overview option text)
- `js/flowsheet-app.js` (`loadDemoNetwork` chip)
- `tests/network.test.js` (10 plants, site ids, finite cash, Maglut plant ≈1299, `createMaglutCase` ≈1299, corridors `[]`, C2H4 slate)
- `tests/flowsheet-ui.test.js` (script order + 10-plant rollup)
- `tests/flowsheet-browser.test.js` (script order)
- `tests/catalog-freight.test.js` (green-MTO plant present, cash finite)
- `README.md` (one network sentence)
- `.hunt-run/network-green-mto-summary.md`

Not edited: `cases/green-mto.js`, `cases/green-ft.js`, `cases/cement.js`, `cases/cu-ew.js`, `cases/float-glass.js`, `cases/green-urea.js`, `cases/maglut.js`, `cases/silicon.js`, `cases/coastal.js`, `cases/abundance.js`, `cases/dac.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower.

## Tests

`npm test` 529 pass / 0 fail. Maglut `annualNetCash` still ≈ 1299 (±5) on the network plant and via `createMaglutCase`. Network has 10 plants; green-MTO site id `chile-mejillones-green-mto`; cash rollup finite (cash−); corridors empty. Green-MTO / green-FT / cement / Cu-EW / float-glass / Maglut factories and TEA packs/prices unchanged.

## Leftovers

- No haul between basins (empty corridors on purpose).
- Network demo still opens the Dead Sea mineral lead plant.
- Green-MTO TEA is the existing case; this tranche only composes it.

## Tip

Feat `8769874` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `8769874`). `npm test` 529 pass / 0 fail. Prior checkout tip `c0813b3`.
