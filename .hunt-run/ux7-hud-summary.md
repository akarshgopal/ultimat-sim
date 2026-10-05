# UX7 HUD resource strip

Branch `feat/ux7-hud-strip`. Baseline tip `cf6a2da`. Workstream C only. Process floor paint and the campus diagram were left alone.

## Kill check

Shipped. On Zabuye, three of {power, water, cash, land} fill from state that already exists. No new model fields and no timers.

## What you should see

The strip sits in the app chrome, under the header and above the tabs, on every view. It repaints from `render()`, which already runs after solve and economics. Empty quantities are omitted. There is no em dash standing in for a live reading.

**Zabuye** (the plant that opens). Three slots:

| Slot | Reading | Source |
|------|---------|--------|
| Power | `5 / 5.01 MWh/d` | Electrical-bus dispatch `5,000 / 5,010 kWh/d`. The bar is that ratio. |
| Cash | `$2.4M/y` | `currentEconomics.annualNetCash`. Screening gate, above zero. |
| Land | `1.2 ha` | `FlowsheetFootprint.estimateFootprint` total. Title carries solar `1.1 ha`. |

Water stays off. `site.resources.freshwater` is present and the right is `assumed`, but the stream mass is `0 kg/d`: the Murphy & Haji Zabuye assay has no bromide, so chlor-alkali asks for no water. Overview still shows that zero in Site resources. The strip does not.

**Optimize co-product cashflow** on Zabuye scales the same three readings (`50 / 50.1 MWh/d`, `$24M/y`, `12 ha`). Water stays hidden.

**Dead Sea brine + ammonia** also lights Water, because that freshwater stream has a positive mass. **Coastal methane** hides water (unverified zero supply) and shows power, negative cash, and land. **Clear factory** hides the whole strip.

## Files

- `index.html` — `#hudStrip` mount
- `flowsheet.css` — compact strip
- `js/flowsheet-app.js` — slot paint inside `render()`
- `tests/flowsheet-ui.test.js` — Zabuye trio, hidden water, empty factory, Dead Sea water, coastal negative cash

`npm test`: 215 passed. Headless Chrome on the local page showed the Zabuye trio on Overview at desktop and mobile widths. Overview’s slate, cash gate, and site-resource block are unchanged. Never Empire.
