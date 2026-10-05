# NETWORK-MEJILLONES (fuels + minerals rollup includes Mejillones PV BOM)

Compose the existing Mejillones silicon/PV BOM plant into the fuels + minerals Network demo so the rollup shows materials + fuels across basins. Reused `createSiliconCase` unchanged (no TEA retune). Corridors stay empty (YAGNI haul). Network never Empire. Screening honesty: cash sign recorded, not forced. Maglut / green-ft / float-glass / FT packs untouched. MECH undo/pump/blower untouched.

Gate **PASS**. `SiliconCase.createSiliconCase` already exports cleanly and is browser-loadable (`cases/silicon.js` now loads before `cases/network.js`). Empty corridors still roll up. No new flowsheet.

## Plants

`createFuelsAndMineralsNetwork(6)` / Overview id `demo-network` (label `Fuels + minerals · Mejillones`):

| id | name | site.id | factory |
|---|---|---|---|
| `dead-sea-minerals` | Dead Sea brine and ammonia | `dead-sea-pvgis-2026-09-06` | `siteDeadSeaAbundance` (unchanged) |
| `almeria-fuels` | Almería solar methane | `almeria-pvgis-2026-09-05` | `coastal.createCoastalCase(6)` (unchanged) |
| `mejillones-silicon` | Mejillones silicon and PV | `chile-mejillones` | `silicon.createSiliconCase()` (unchanged) |

Corridors: `[]`.

## Rollup cash (capital-inclusive, 365 d, CRF 8%/20 y)

Solved `evaluateNetwork(createFuelsAndMineralsNetwork(6))`. Sign is whatever falls out of the three existing plants; nothing retuned to make the rollup cash+.

| Plant | Revenue | OPEX | ann. CAPEX | **Net cash** | Installed CAPEX |
|---|---:|---:|---:|---:|---:|
| Dead Sea brine and ammonia | 904,894 | 485,620 | 287,079 | **+132,196** | 2,818,579 |
| Almería solar methane | 1,471 | 17,028 | 53,024 | **−68,580** | 520,594 |
| Mejillones silicon and PV | 1,011,050 | 451,018 | 313,337 | **+246,695** | 3,076,389 |
| **Network rollup** | **1,917,415** | **953,665** | **653,439** | **+310,311** | **6,415,562** |

Exact rollup: `annualRevenue` 1917415.2139763567; `annualOperatingCost` 953665.2489597716; `annualizedCapex` 653439.1714989007; `annualNetCash` 310310.79351768433; `installedCapex` 6415562.107577747; `npv` 3046677.1128791785; `landHa` 2.76908466000219.

Almería methane stays cash−. Dead Sea minerals and Mejillones PV BOM were already cash+ at their existing screening mids; the rollup inherits that. Screening, not bankable. Slate includes CH₄, NH₃, Br₂, and PVmodule (365 t/y). Maglut `annualNetCash` 1298.91 ≈ 1299 (±5).

## Files

- `cases/network.js` (require `./silicon`; third plant)
- `index.html` (`silicon.js` before `network.js`; Overview option text)
- `js/flowsheet-app.js` (`loadDemoNetwork` chip)
- `tests/network.test.js` (3 plants, `chile-mejillones`, finite cash, Maglut ≈1299)
- `tests/flowsheet-ui.test.js` (script order + 3-plant rollup)
- `tests/flowsheet-browser.test.js` (script order)
- `README.md` (one network sentence)
- `.hunt-run/network-mejillones-summary.md`

Not edited: `cases/silicon.js`, `cases/green-ft.js`, `cases/float-glass.js`, `cases/ft-liquids.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower.

## Tests

`npm test`: **463 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Network has 3 plants; Mejillones site id `chile-mejillones`; cash rollup finite; corridors empty. Green-ft / float-glass / FT packs and prices unchanged.

## Leftovers

- No haul between basins (empty corridors on purpose).
- Network demo still opens the Dead Sea mineral lead plant.
- Silicon/PV BOM TEA is the existing Mejillones case; this tranche only composes it.
