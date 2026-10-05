# NETWORK-GREEN-H2-DRI (fuels + minerals rollup includes Mejillones green H2-DRI)

Compose the existing Mejillones green-H2-DRI plant into the fuels + minerals Network demo so the rollup includes green DRI steel. Reused `createGreenH2DriCase` unchanged (no TEA retune). Corridors stay empty (YAGNI haul). Network never Empire. Screening honesty: cash sign recorded, not forced. Green-H2-DRI / green-MTO / green-FT / cement / Cu-EW / float-glass / Maglut / green-urea / silicon / coastal / abundance factories not edited. MECH undo/pump/blower untouched. `dac.js` not deleted. Ni / soda-ash / Ag / TiCl4 / Zn / Pb / phosphoric / chlor-alkali-deepen / Li-metal not retried.

Gate **PASS** as a thin compose. `GreenH2DriCase.createGreenH2DriCase` → site id `chile-mejillones-green-h2-dri`. Already exports and is browser-loadable; `cases/green-h2-dri.js` now loads before `cases/network.js`. Empty corridors still roll up. No new flowsheet.

## Plants

`createFuelsAndMineralsNetwork(6)` / Overview id `demo-network` (label `Fuels + minerals · cement / Cu / glass / green-FT / green-MTO / green-H2-DRI`):

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

Corridors: `[]`.

## Rollup cash (capital-inclusive, 365 d, CRF 8%/20 y)

Solved `evaluateNetwork(createFuelsAndMineralsNetwork(6))`. Sign is whatever falls out of the eleven existing plants; nothing retuned to make the rollup cash+. Cement / Cu / glass / green-FT / green-MTO cash already include screening chile-coast-container freight from catalog-freight leftovers. Walvis green urea includes screening freight from catalog-freight-walvis-urea. Green-H2-DRI is the unsized factory (`createGreenH2DriCase()`, 1000 kg Fe/d).

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
| Mejillones green H2-DRI | 153,843 | 116,934 | 177,264 | **−140,355** | 1,740,403 |
| **Network rollup** | **6,832,761** | **5,608,065** | **2,956,749** | **−1,732,053** | **29,029,801** |

Exact rollup: `annualRevenue` 6832761.467948469; `annualOperatingCost` 5608065.127806301; `annualizedCapex` 2956749.3448856818; `annualNetCash` -1732053.0047435137; `installedCapex` 29029800.91496675; `npv` -17005551.7180873; `landHa` 17.231469564649352.

Green-H2-DRI stays cash− (electrolyzer + PV dominate installed CAPEX). Unsized factory plant cash −140,355 (exact `annualNetCash` -140354.69847100842). The catalog-size-green-h2-dri `sizeToProduct` 1000 kg/d figure was −138,660; Network composes the factory as-is, so −140,355 is the rollup number. Prompt expected ~−138660 at base 1000 kg/d; recorded, not forced. Prior 10-plant rollup was −1,591,698. Green-H2-DRI contributes −140,355. Walvis green urea, Almería methane, and Mejillones Cu SX-EW stay cash−. Maglut plant `annualNetCash` 1298.91 ≈ 1299 (±5) on its own and via `createMaglutCase`. Slate includes CH₄, NH₃, Br₂, PVmodule (365 t/y), Urea (365 t/y), PortlandCement (365 t/y), Cu (365 t/y), FloatGlass (365 t/y), C12H26 (365 t/y), C2H4 (365 t/y), **Fe (365 t/y)**, and Maglut oxides. Screening, not bankable.

## Files

- `cases/network.js` (require `./green-h2-dri`; eleventh plant)
- `index.html` (`green-h2-dri.js` before `network.js`; Overview option text)
- `js/flowsheet-app.js` (`loadDemoNetwork` chip)
- `tests/network.test.js` (11 plants, site ids, finite cash, Maglut plant ≈1299, `createMaglutCase` ≈1299, corridors `[]`, Fe slate)
- `tests/flowsheet-ui.test.js` (script order + 11-plant rollup)
- `tests/flowsheet-browser.test.js` (script order)
- `tests/catalog-freight.test.js` (green-H2-DRI plant present, cash finite)
- `README.md` (one network sentence)
- `.hunt-run/network-green-h2-dri-summary.md`

Not edited: `cases/green-h2-dri.js`, `cases/green-mto.js`, `cases/green-ft.js`, `cases/cement.js`, `cases/cu-ew.js`, `cases/float-glass.js`, `cases/green-urea.js`, `cases/maglut.js`, `cases/silicon.js`, `cases/coastal.js`, `cases/abundance.js`, `cases/dac.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower.

## Tests

`npm test` 531 pass / 0 fail. Maglut `annualNetCash` still ≈ 1299 (±5) on the network plant and via `createMaglutCase`. Network has 11 plants; green-H2-DRI site id `chile-mejillones-green-h2-dri`; cash rollup finite (cash−); corridors empty. Green-H2-DRI / green-MTO / green-FT / cement / Cu-EW / float-glass / Maglut factories and TEA packs/prices unchanged.

## Leftovers

- No haul between basins (empty corridors on purpose).
- Network demo still opens the Dead Sea mineral lead plant.
- Green-H2-DRI TEA is the existing case; this tranche only composes it.

## Tip

Feat `cc1e38f` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `cc1e38f`). `npm test` 531 pass / 0 fail. Prior checkout tip `58e3d50`.
