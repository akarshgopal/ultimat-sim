# NETWORK-H2-DRI (fuels + minerals rollup includes Mejillones purchased H2-DRI)

Compose the existing Mejillones purchased-H₂ DRI plant into the fuels + minerals Network demo so the rollup includes purchased-H₂ DRI steel alongside the existing green-H2-DRI plant. Reused `createH2DriCase` unchanged (no TEA retune). Corridors stay empty (YAGNI haul). Network never Empire. Screening honesty: cash sign recorded, not forced. H2-DRI / green-H2-DRI / green-MTO / green-FT / cement / Cu-EW / float-glass / Maglut / green-urea / silicon / coastal / abundance factories not edited. MECH undo/pump/blower untouched. `dac.js` not deleted. Ni / soda-ash / Ag / TiCl4 / Zn / Pb / phosphoric / chlor-alkali-deepen / Li-metal not retried.

Gate **PASS** as a thin compose. `H2DriCase.createH2DriCase` → site id `chile-mejillones-h2-dri`. Already exports and is browser-loadable; `cases/h2-dri.js` now loads before `cases/network.js`. Empty corridors still roll up. No new flowsheet. Plant ids distinguish purchased vs green (`mejillones-h2-dri` / `mejillones-green-h2-dri`).

## Plants

`createFuelsAndMineralsNetwork(6)` / Overview id `demo-network` (label `Fuels + minerals · cement / Cu / glass / green-FT / green-MTO / green-H2-DRI / purchased H2-DRI`):

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
| `mejillones-green-h2-dri` | Mejillones green H2-DRI | `chile-mejillones-green-h2-dri` | `greenH2Dri.createGreenH2DriCase()` (unchanged) |
| `mejillones-h2-dri` | Mejillones H2-DRI (purchased) | `chile-mejillones-h2-dri` | `h2Dri.createH2DriCase()` (unchanged) |

Corridors: `[]`.

## Rollup cash (capital-inclusive, 365 d, CRF 8%/20 y)

Solved `evaluateNetwork(createFuelsAndMineralsNetwork(6))`. Sign is whatever falls out of the twelve existing plants; nothing retuned to make the rollup cash+. Cement / Cu / glass / green-FT / green-MTO cash already include screening chile-coast-container freight from catalog-freight leftovers. Walvis green urea includes screening freight from catalog-freight-walvis-urea. Green-H2-DRI and purchased H2-DRI include catalog-dri-freight-leftovers (container H₂ + short-sea DRI steel) and inland-truck-short on ore. Purchased H2-DRI is the unsized factory (`createH2DriCase()`, 1000 kg Fe/d).

| Plant | Revenue | OPEX | ann. CAPEX | **Net cash** | Installed CAPEX |
|---|---:|---:|---:|---:|---:|
| Dead Sea brine and ammonia | 904,894 | 485,620 | 287,079 | **+132,196** | 2,818,579 |
| Almería solar methane | 1,471 | 17,028 | 53,024 | **−68,580** | 520,594 |
| Mejillones silicon and PV | 1,011,050 | 451,018 | 313,337 | **+246,695** | 3,076,389 |
| Walvis Bay green urea | 152,164 | 190,713 | 392,732 | **−431,280** | 3,855,897 |
| Long Beach Maglut | 180,113 | 149,372 | 29,442 | **+1,299** | 289,065 |
| Mejillones cement | 47,450 | 34,179 | 28,151 | **−14,879** | 276,387 |
| Mejillones copper SX-EW | 3,511,300 | 3,496,566 | 125,746 | **−111,013** | 1,234,597 |
| Mejillones float glass | 153,300 | 70,457 | 83,831 | **−988** | 823,065 |
| Mejillones green FT | 362,726 | 318,956 | 676,404 | **−632,634** | 6,641,032 |
| Mejillones green MTO | 354,450 | 266,127 | 789,741 | **−701,417** | 7,753,793 |
| Mejillones green H2-DRI | 142,893 | 122,152 | 177,264 | **−156,523** | 1,740,403 |
| Mejillones H2-DRI (purchased) | 135,050 | 145,772 | 100,045 | **−110,767** | 982,258 |
| **Network rollup** | **6,956,861** | **5,747,959** | **3,056,794** | **−1,847,892** | **30,012,059** |

Exact rollup: `annualRevenue` 6956861.467948469; `annualOperatingCost` 5747959.299343303; `annualizedCapex` 3056794.4983910024; `annualNetCash` -1847892.329785836; `installedCapex` 30012058.97948288; `npv` -18142879.28693225; `landHa` 17.39124375819774.

Purchased H2-DRI stays cash− (purchased H₂ + ore freight + shaft CAPEX). Unsized factory plant cash −110,767 (exact `annualNetCash` -110766.79563055771). Prompt expected ~−110767 at base 1000 kg/d after freight leftovers; recorded, not forced. Green-H2-DRI plant still present, cash −156,523 (exact -156523.22788277315). Prior 11-plant rollup was −1,737,126. Purchased H2-DRI contributes −110,767. Walvis green urea, Almería methane, and Mejillones Cu SX-EW stay cash−. Maglut plant `annualNetCash` 1298.91 ≈ 1299 (±5) on its own and via `createMaglutCase`. Slate includes CH₄, NH₃, Br₂, PVmodule (365 t/y), Urea (365 t/y), PortlandCement (365 t/y), Cu (365 t/y), FloatGlass (365 t/y), C12H26 (365 t/y), C2H4 (365 t/y), **Fe (730 t/y)** from both DRI plants, and Maglut oxides. Screening, not bankable.

## Files

- `cases/network.js` (require `./h2-dri`; twelfth plant)
- `index.html` (`h2-dri.js` before `network.js`; Overview option text)
- `js/flowsheet-app.js` (`loadDemoNetwork` chip)
- `tests/network.test.js` (12 plants, site ids, finite cash, Maglut plant ≈1299, `createMaglutCase` ≈1299, corridors `[]`, Fe slate, purchased H2-DRI alongside green-H2-DRI)
- `tests/flowsheet-ui.test.js` (script order + 12-plant rollup)
- `tests/flowsheet-browser.test.js` (script order)
- `tests/catalog-freight.test.js` (purchased H2-DRI plant present, cash finite)
- `README.md` (one network sentence)
- `.hunt-run/network-h2-dri-summary.md`

Not edited: `cases/h2-dri.js`, `cases/green-h2-dri.js`, `cases/green-mto.js`, `cases/green-ft.js`, `cases/cement.js`, `cases/cu-ew.js`, `cases/float-glass.js`, `cases/green-urea.js`, `cases/maglut.js`, `cases/silicon.js`, `cases/coastal.js`, `cases/abundance.js`, `cases/dac.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower.

## Tests

`npm test` 534 pass / 0 fail. Maglut `annualNetCash` still ≈ 1299 (±5) on the network plant and via `createMaglutCase`. Network has 12 plants; purchased H2-DRI site id `chile-mejillones-h2-dri`; green-H2-DRI site id `chile-mejillones-green-h2-dri`; cash rollup finite (cash−); corridors empty. H2-DRI / green-H2-DRI / green-MTO / green-FT / cement / Cu-EW / float-glass / Maglut factories and TEA packs/prices unchanged.

## Leftovers

- No haul between basins (empty corridors on purpose).
- Network demo still opens the Dead Sea mineral lead plant.
- Purchased H2-DRI TEA is the existing case; this tranche only composes it.

## Tip

Feat pending on `main`. Prior checkout tip `244e476`.
