# MECH17 — Tank CAPEX + footprint (+ Process shortcuts)

**Feat tip:** (set after commit)
**Tests:** 321 pass
**Date:** 2026-10-02 CEST

## Shipped
- Buffer tank screening CAPEX: `$0.50/kg capacity` → `installedCapex`; fixed O&M 2%, life 25 y
- Campus pad: `1.0 m²/t capacity` (screening pad+dike); installed capacity, not throughput
- Inspector economics + Literature honesty on Buffer tank
- Process canvas shortcuts: Del/Backspace, Esc, arrows nudge, +/− zoom, `?` hint
- Tests: `mech17-tank-capex.test.js`, `mech17-shortcuts.test.js`; MAIN_UNITS includes material-buffer

## Verify
1. Hard-refresh https://akarshgopal.github.io/ultimat-sim/
2. Zabuye → Process → add **Buffer tank** → Economics CAPEX ~$5k default; Location/campus footprint gains a tank pad when capacity > 0
3. Select a block → Del deletes; Esc clears; `?` opens shortcut hint

## Deferred
- Regional tea.bindCapex pack for tanks
- Density-aware $/m³ vs $/kg by fluid
- Pump/blower CAPEX+footprint
- Undo stack for Delete
