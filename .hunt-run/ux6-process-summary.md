# UX6 process floor

Branch `feat/ux6-process`. Process canvas only. Economics charts and the Location map were left alone.

## Files
- `index.html` — Process eyebrow and empty state: Plant floor / No blocks
- `js/flowsheet-app.js` — edge rates, utilization or power chips, hub gauges
- `flowsheet.css` — sharper node stroke, square chips, process-canvas grid
- `tests/flowsheet-ui.test.js` — rates, muted open edges, no gauge without data

## What you should see

**Zabuye** (opens on Process as Lake Zabuye). Title stays the site name. Brine edge reads `100 t/d`; product edges are `kg/d` or `t/d` (a real zero stream stays `0 kg/d`). Power edges are `kWh/d` or `MWh/d`. Minerals shows a `100%` utilization chip; the activity line is still `kg brine/day`. Lithium, Salt, Potash, and the other sinks keep their names and solved masses, with no meter. Power has a 12-bar monthly yield sparkline (frozen PVGIS-ERA5, about 5.12–6.29 kWh/kWp·day). The power bus has a dispatch bar (about 5,000 / 5,010 kWh/d). Blocks the carbonate assay cannot feed (zero nameplate) do not get a fake 0% or 0 kWh chip.

**Dead Sea** (Brine + ammonia). Same floor. Monthly yield is the frozen SARAH3/ERA5 band, about 3.68–5.13 kWh/kWp·day. Bus dispatch is about 5,570 / 5,580 kWh/d. Minerals, chlor-alkali, bromine, the air separation unit, and ammonia each show `100%` because the solved rate fills nameplate. Product masses differ from Zabuye because the assay does.

Clear canvas: Plant floor / No blocks. An unfinished wire shows a muted `—` on the edge and no chip or gauge. Fit, Focus, and the Blocks drawer are unchanged.

`npm test`: 210 passed.
