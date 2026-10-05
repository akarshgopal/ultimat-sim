# NETWORK-GREEN-FT (fuels + minerals rollup includes Mejillones green FT)

CATALOG-ZN-PB gated **FAIL on CAPEX** for both Zn EW/RLE and Pb Betts/EW (see `.hunt-run/catalog-zn-pb-summary.md`). Ethylene and diesel `sizeToProduct` already shipped. Fallback: compose the existing Mejillones green-FT plant into the fuels + minerals Network demo. Reused `createGreenFtCase` unchanged (no TEA retune). Corridors stay empty (YAGNI haul). Network never Empire. Screening honesty: cash sign recorded, not forced. Green-FT / cement / Cu-EW / float-glass / Maglut / green-urea / silicon / coastal / abundance factories not edited. MECH undo/pump/blower untouched. `dac.js` not deleted. Soda-ash / Ag-refine / TiCl4 / Ni-EW not touched. No Zn/Pb product files.

Gate **PASS** as a thin compose. `GreenFtCase.createGreenFtCase` → site id `chile-mejillones-green-ft`. Already exports and is browser-loadable; `cases/green-ft.js` now loads before `cases/network.js`. Empty corridors still roll up. No new flowsheet.

## Plants

`createFuelsAndMineralsNetwork(6)` / Overview id `demo-network` (label `Fuels + minerals · cement / Cu / glass / green-FT`):

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

Corridors: `[]`.

## Rollup cash (capital-inclusive, 365 d, CRF 8%/20 y)

Solved `evaluateNetwork(createFuelsAndMineralsNetwork(6))`. Sign is whatever falls out of the nine existing plants; nothing retuned to make the rollup cash+. Cement / Cu / glass / green-FT cash already include screening chile-coast-container freight from catalog-freight-leftovers.

| Plant | Revenue | OPEX | ann. CAPEX | **Net cash** | Installed CAPEX |
|---|---:|---:|---:|---:|---:|
| Dead Sea brine and ammonia | 904,894 | 485,620 | 287,079 | **+132,196** | 2,818,579 |
| Almería solar methane | 1,471 | 17,028 | 53,024 | **−68,580** | 520,594 |
| Mejillones silicon and PV | 1,011,050 | 451,018 | 313,337 | **+246,695** | 3,076,389 |
| Walvis Bay green urea | 163,114 | 169,315 | 392,732 | **−398,932** | 3,855,897 |
| Long Beach Maglut | 180,113 | 149,372 | 29,442 | **+1,299** | 289,065 |
| Mejillones cement | 47,450 | 45,275 | 28,151 | **−25,975** | 276,387 |
| Mejillones copper SX-EW | 3,511,300 | 3,496,566 | 125,746 | **−111,013** | 1,234,597 |
| Mejillones float glass | 153,300 | 70,457 | 83,831 | **−988** | 823,065 |
| Mejillones green FT | 362,726 | 318,956 | 676,404 | **−632,634** | 6,641,032 |
| **Network rollup** | **6,335,418** | **5,203,606** | **1,989,745** | **−857,933** | **19,535,605** |

Exact rollup: `annualRevenue` 6335418.1984783895; `annualOperatingCost` 5203606.378075632; `annualizedCapex` 1989744.5301699385; `annualNetCash` -857932.7097671812; `installedCapex` 19535605.100374393; `npv` -8423309.810166605; `landHa` 10.453263483659029.

Green-FT stays cash− (electrolyzer + PV dominate installed CAPEX; screening freight on diesel/CO₂). Prior 8-plant rollup was −113,098 before this plant. Walvis green urea, Almería methane, and Mejillones Cu SX-EW stay cash−. Maglut plant `annualNetCash` 1298.91 ≈ 1299 (±5) on its own and via `createMaglutCase`. Slate includes CH₄, NH₃, Br₂, PVmodule (365 t/y), Urea (365 t/y), PortlandCement (365 t/y), Cu (365 t/y), FloatGlass (365 t/y), **C12H26 (365 t/y)**, and Maglut oxides. Screening, not bankable.

## Files

- `cases/network.js` (require `./green-ft`; ninth plant)
- `index.html` (`green-ft.js` before `network.js`; Overview option text)
- `js/flowsheet-app.js` (`loadDemoNetwork` chip)
- `tests/network.test.js` (9 plants, site ids, finite cash, Maglut plant ≈1299, `createMaglutCase` ≈1299, corridors `[]`, C12H26 slate)
- `tests/flowsheet-ui.test.js` (script order + 9-plant rollup)
- `tests/flowsheet-browser.test.js` (script order)
- `tests/catalog-freight.test.js` (green-FT plant present, cash finite)
- `README.md` (one network sentence)
- `.hunt-run/catalog-zn-pb-summary.md` (Zn/Pb skip)
- `.hunt-run/network-green-ft-summary.md`

Not edited: `cases/green-ft.js`, `cases/cement.js`, `cases/cu-ew.js`, `cases/float-glass.js`, `cases/green-urea.js`, `cases/maglut.js`, `cases/silicon.js`, `cases/coastal.js`, `cases/abundance.js`, `cases/dac.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower.

## Tests

`npm test` after the feat. Maglut `annualNetCash` still ≈ 1299 (±5) on the network plant and via `createMaglutCase`. Network has 9 plants; green-FT site id `chile-mejillones-green-ft`; cash rollup finite (cash−); corridors empty. Green-FT / cement / Cu-EW / float-glass / Maglut factories and TEA packs/prices unchanged.

## Leftovers

- No haul between basins (empty corridors on purpose).
- Network demo still opens the Dead Sea mineral lead plant.
- Green-FT TEA is the existing case; this tranche only composes it.
- Zn/Pb still skip until an EW/RLE/Betts island TIC band exists.

## Tip

Feat pending on `main`. Prior checkout tip `bb2b159`. Zn/Pb skip (hollow CAPEX); fallback is this 9-plant compose.
