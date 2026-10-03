# UX 3 — site demo / location / Dead Sea hub

Build stopped at max-turns (80) with `stopReason: cancelled` before this file was written by the agent. Changes below were left dirty on `fix/ux3-site-demo` and committed by the merge agent.

## Files changed

- `js/flowsheet-app.js` — clear cashflow banner on location/preset apply; `draftSiteLabel` for custom coords; `keepIdentity` on bindLocation; power-throttle Overview callout; `setActiveDemo` on hub/network loads; first-load Zabuye preference; cross-brine mismatch guard
- `engine/solve.js` — surface capacity-reduced / site-budget warnings
- `engine/size.js` — `syncAbundanceSolar` so footprint/solarKWp follows abundance rescale
- `data/site-presets.js` (+ assays/pvgis) — Dead Sea (and related) location preset wiring
- `index.html` — first-load / demo defaults
- `tests/flowsheet-ui.test.js` — coverage updates

## Verify (manual)

1. Apply custom lat/lon → title becomes Draft site · …; optimize banner clears; power throttle shows “Capacity reduced: limited by available electricity”
2. Brine plant → switch to different brine preset → plain mismatch + block/CTA
3. Cold load (no autosave) → Zabuye (or Dead Sea) materials demo highlighted, not Almería methane; Fuels+minerals shows minerals
5. Dead Sea hub has real coords/solar; footprint refreshes after optimize; ammonia appears when sold

## Tests

Last full `npm test` during the build: 197 pass / 1 fail (before final edits). Re-run on merge.
