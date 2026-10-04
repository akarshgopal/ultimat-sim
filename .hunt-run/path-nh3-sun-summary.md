# PATH-NH3-sun (screening TEA)

Walvis Bay air + seawater + sun → NH₃. Capital-inclusive cash (R − OPEX − annualized CAPEX). Screening honesty, not bankable. Not the Dead Sea chlor-alkali co-product NH₃ path.

## What landed

- Demo `cases/green-ammonia.js` (`createGreenAmmoniaCase`): 1000 kg NH₃/day Haber–Bosch, electrolytic H₂ (52 kWh/kg), ASU N₂ (0.25 kWh/kg, 0.98 recovery), SWRO (0.45 recovery, 3.5 kWh/m³ product) on frozen Walvis PV. Sells NH₃ at $0.45/kg and both O₂ streams at $0.05/kg. Vents brine, ASU offgas, and electrolyzer waterReject.
- Site `namibia-walvis-bay` (Walvis Bay, Namibia, −22.957, 14.505). Frozen PVGIS-ERA5 **totals.fixed** E_d **5.48** kWh/kWp·day, E_y **2000.67**, retrieved 2026-09-21. Benguela Atlantic seawater assay (`benguela-atlantic-seawater`, density 1.025, S=35.2). Southern Africa CAPEX× 0.95. Intake and discharge **assumed** so the cash gate can run; grid/freshwater/brine concession unverified. Not a Namport permit.
- Overview option **Walvis Bay green NH₃** under Fuels · screening cash− (cash is negative at screening prices). Palette Fuels already listed electrolyzer / ASU / Haber — no new unit. Fuels+minerals network left unchanged on purpose (still Dead Sea + Almería only).

## Cited numbers

| Item | Value | Quality | Source |
|---|---|---|---|
| NH₃ fertilizer | $0.45/kg | screening | IEA Ammonia Technology Roadmap family; already `prices.ammonia` |
| Industrial O₂ | $0.05/kg | screening | already `prices.oxygen` |
| Electrolyzer CAPEX | 3250 $/(kg H₂/day) | screening | DOE/NREL PEM $/kW band; already `packs.electrolyzer` |
| ASU CAPEX | 400 $/(kg N₂/day) | screening | already `packs.asu` |
| Haber CAPEX | 2000 $/(kg NH₃/day) | screening | IEA ammonia roadmap family; already `packs.ammonia` |
| SWRO CAPEX | 1500 $/(m³/day) | screening | Ghaffour 2013 / Voutchkov 2018 family; already `packs.swro` |
| Electrolyzer SEC | 52 kWh/kg H₂ | screening | Buttler 2018 alkaline band; unit default |
| ASU SEC | 0.25 kWh/kg N₂ | screening | unit default |
| Haber SEC | 0.6 kWh/kg NH₃ | screening | unit default |
| SWRO SEC | 3.5 kWh/m³ product | screening | Elimelech & Phillip / Ghaffour; unit default |
| Southern Africa CAPEX× | 0.95 | screening | already `capexMultiplierByRegion['southern-africa']` |
| Walvis Bay PV | E_d 5.48, E_y 2000.67 | cited | frozen `data/pvgis-walvis-bay.json` totals.fixed (not January 5.57) |
| Seawater assay | S=35.2 g/kg, ρ=1.025 | cited | frozen `data/benguela-atlantic-seawater.js`; Millero S=35 × 35.2/35; basin typical |

Packs, prices, and PV numbers were reused. Nothing was retuned to force cash-positive.

## Demo cash (solved `createGreenAmmoniaCase`, 365 d, CRF 8%/20 y)

Haber 1000 kg/day; electrolyzer / ASU / SWRO / Haber are not electricity-limited (1,870 kWp × 5.48 kWh/kWp·d with 2% margin). Southern Africa CAPEX× 0.95 on solar + process packs.

From `node --test tests/green-ammonia.test.js` / one-off `evaluateEconomics` on that solve:

| Line | $/year |
|---|---:|
| Annual revenue (365 t NH₃ @ 0.45 + 603 t O₂ @ 0.05) | 194,426 |
| Feed purchases (seawater intake screening) | 1,385 |
| Fixed O&M | 142,409 |
| Variable O&M | 26,198 |
| Annualized CAPEX | 462,324 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−437,890** |

Screening gate cash, cash-negative at fertilizer $0.45/kg and small-plant Haber/electrolyzer intensities. Not a bankable offtake and not a green premium.

## Files

- `cases/green-ammonia.js` (new)
- `tests/green-ammonia.test.js` (new)
- `js/flowsheet-app.js`, `index.html`, `tests/flowsheet-ui.test.js`
- `README.md` (added heading only)

## Tests

`npm test`: **368 pass / 0 fail**. New file `tests/green-ammonia.test.js` has 6 tests; Overview load assertion added in `tests/flowsheet-ui.test.js`. Dead Sea regression: `siteDeadSeaAbundance()` still has chlor-alkali H₂ → Haber and no electrolyzer. `cases/abundance.js` and `cases/network.js` were not edited.

## Leftovers

- No REE, no poly-Si, no offtake/freight.
- Dead Sea abundance unchanged (chlor-alkali hydrogen still feeds Haber).
- Fuels+minerals network left unchanged on purpose (exactly Dead Sea + Almería).
- No chlor-alkali, purchased H₂, brine minerals, battery, or DAC on this plant.
- Pump/undo/blower part-load untouched; existing packs and the ammonia price were not retuned.

## Tip

Pending Pages publish.
