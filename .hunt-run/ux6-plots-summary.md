# UX6 plots — Economics instrument charts

Branch `feat/ux6-plots` from `16337b9`. Inline SVG only. No Chart.js or D3. `npm test`: 210 passed.

## Files

- `index.html` — gate waterfall and cash-flow figures in `tea-main`; break-even chart under the existing screen
- `flowsheet.css` — chart layout; removed the old CSS bar rows
- `js/flowsheet-app.js` — SVG waterfall, cash-flow vs year, and $/kWh axis, painted from `renderEconomics()` / `screenPowerBreakEven()`
- `tests/flowsheet-ui.test.js` — step geometry, year-0 CAPEX, solo/shared marker, empty graph

Capital, Operations, the cash gate, and the NPV/IRR disclosure are unchanged. Screening honesty banners stay. Location and Process were not touched.

## What you should see

Open Economics. Charts follow the solved plant. An incomplete graph says “Complete the graph…” and does not draw a dollar series.

### Zabuye (default hub)

- **Gate waterfall.** Revenue about $3M, then −OPEX about $440k and −ann. CAPEX about $190k, down to Net about $2.4M. Dollar ticks. The Net column is the highlighted cash gate.
- **Cash flow by year.** Year 0 is installed CAPEX, about −$1.8M, drawn apart from later years. Years 1–20 are operating cash, about +$2.6M. No replacement dips on this plant.
- **Purchased-power break-even.** Axis in $/kWh. Solo lithium crosses near $0.960/kWh (the screened mode). Shared crosses near $1.38/kWh. The sentence above the chart is still the screening line, not a PPA.

### Dead Sea (abundance hub)

- **Gate waterfall.** Revenue about $900k, −OPEX about $500k, −ann. CAPEX about $310k, Net about $97k. Still above the gate; the Net column stays highlighted.
- **Cash flow by year.** Year 0 CAPEX is about −$3.1M and dominates the axis. Later years are about +$410k.
- **Purchased-power break-even.** Solo lithium has no crossing: cash stays at or below zero even when purchased power is free, so the chart does not invent a solo price. Shared crosses near $0.121/kWh and is marked on the axis.
