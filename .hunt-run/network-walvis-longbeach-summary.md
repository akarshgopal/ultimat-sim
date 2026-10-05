# NETWORK-WALVIS-LONGBEACH (fuels + minerals rollup includes Walvis green urea + Long Beach Maglut)

Compose the existing Walvis Bay green-urea and Long Beach Maglut plants into the fuels + minerals Network demo so the rollup spans more basins. Reused `createGreenUreaCase` and `createMaglutCase` unchanged (no TEA retune). Corridors stay empty (YAGNI haul). Network never Empire. Screening honesty: cash sign recorded, not forced. Maglut / green-urea / silicon / coastal / abundance factories not edited. MECH undo/pump/blower untouched.

Gate **PASS**. `GreenUreaCase.createGreenUreaCase` and `MaglutCase.createMaglutCase` already export cleanly and are browser-loadable (`cases/maglut.js` and `cases/green-urea.js` now load before `cases/network.js`). Empty corridors still roll up. No new flowsheet.

## Plants

`createFuelsAndMineralsNetwork(6)` / Overview id `demo-network` (label `Fuels + minerals · Walvis / Long Beach`):

| id | name | site.id | factory |
|---|---|---|---|
| `dead-sea-minerals` | Dead Sea brine and ammonia | `dead-sea-pvgis-2026-09-06` | `siteDeadSeaAbundance` (unchanged) |
| `almeria-fuels` | Almería solar methane | `almeria-pvgis-2026-09-05` | `coastal.createCoastalCase(6)` (unchanged) |
| `mejillones-silicon` | Mejillones silicon and PV | `chile-mejillones` | `silicon.createSiliconCase()` (unchanged) |
| `walvis-green-urea` | Walvis Bay green urea | `namibia-walvis-bay-green-urea` | `greenUrea.createGreenUreaCase()` (unchanged) |
| `long-beach-maglut` | Long Beach Maglut | `us-long-beach` | `maglut.createMaglutCase()` (unchanged) |

Corridors: `[]`.

## Rollup cash (capital-inclusive, 365 d, CRF 8%/20 y)

Solved `evaluateNetwork(createFuelsAndMineralsNetwork(6))`. Sign is whatever falls out of the five existing plants; nothing retuned to make the rollup cash+.

| Plant | Revenue | OPEX | ann. CAPEX | **Net cash** | Installed CAPEX |
|---|---:|---:|---:|---:|---:|
| Dead Sea brine and ammonia | 904,894 | 485,620 | 287,079 | **+132,196** | 2,818,579 |
| Almería solar methane | 1,471 | 17,028 | 53,024 | **−68,580** | 520,594 |
| Mejillones silicon and PV | 1,011,050 | 451,018 | 313,337 | **+246,695** | 3,076,389 |
| Walvis Bay green urea | 163,114 | 169,315 | 392,732 | **−398,932** | 3,855,897 |
| Long Beach Maglut | 180,113 | 149,372 | 29,442 | **+1,299** | 289,065 |
| **Network rollup** | **2,260,643** | **1,272,352** | **1,075,613** | **−87,323** | **10,560,524** |

Exact rollup: `annualRevenue` 2260642.5666464055; `annualOperatingCost` 1272352.3641013603; `annualizedCapex` 1075612.7458797714; `annualNetCash` -87322.54333472624; `installedCapex` 10560524.492378892; `npv` -857345.6024537282; `landHa` 4.161455506595331.

Walvis green urea is cash− (electrolyzer + Haber + PV dominate). Almería methane stays cash−. Dead Sea minerals, Mejillones PV BOM, and Long Beach Maglut were already cash+ at their existing screening mids; the rollup inherits the urea hole and is cash−. Screening, not bankable. Slate includes CH₄, NH₃, Br₂, PVmodule (365 t/y), Urea (365 t/y), and Maglut oxides. Maglut plant `annualNetCash` 1298.91 ≈ 1299 (±5) on its own and via `createMaglutCase`.

## Files

- `cases/network.js` (require `./green-urea` + `./maglut`; fourth and fifth plants)
- `index.html` (`maglut.js` and `green-urea.js` before `network.js`; Overview option text)
- `js/flowsheet-app.js` (`loadDemoNetwork` chip)
- `tests/network.test.js` (5 plants, site ids, finite cash, Maglut plant ≈1299, `createMaglutCase` ≈1299, corridors `[]`)
- `tests/flowsheet-ui.test.js` (script order + 5-plant rollup)
- `tests/flowsheet-browser.test.js` (script order)
- `README.md` (one network sentence)
- `.hunt-run/network-walvis-longbeach-summary.md`

Not edited: `cases/green-urea.js`, `cases/maglut.js`, `cases/silicon.js`, `cases/coastal.js`, `cases/abundance.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower.

## Tests

`npm test`: **494 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5) on the network plant and via `createMaglutCase`. Network has 5 plants; Walvis site id `namibia-walvis-bay-green-urea`; Long Beach site id `us-long-beach`; cash rollup finite (cash−); corridors empty. Green-urea / Maglut / silicon / coastal / abundance factories and TEA packs/prices unchanged.

## Leftovers

- No haul between basins (empty corridors on purpose).
- Network demo still opens the Dead Sea mineral lead plant.
- Green-urea and Maglut TEA are the existing cases; this tranche only composes them.

## Tip

Feat pending on `main`. Pages pending. Prior checkout tip `fb70c9c`.
