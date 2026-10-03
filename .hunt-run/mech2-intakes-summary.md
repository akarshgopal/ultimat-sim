# MECH2 — Practical intakes (over magic tanks)

**Branch:** `feat/mech2-practical-intakes` (from `e9dabd7`)  
**Date:** 2026-10-01 (Europe/Berlin)  
**Tip on main:** `512e530` · live https://akarshgopal.github.io/ultimat-sim/

## Problem

UX7 `buildingProfile` mapped every non-power/heat `kind === 'source'` to `'tank'`. Cases already used practical streams (brine, seawater, air) via unit `material-source`, but Process-floor chrome looked like storage tanks, palette promoted a magic “Material source · Air, water, CO₂, H₂…”, and auto labels stayed “Material source N”.

## Shipped

1. **`intakeKind(current)`** in `js/flowsheet-app.js` — resolve order: `siteResource` → `sourcePreset` → node id (unhyphenated) → minimal stream inference (CO₂-rich gas → flue; air-like N₂/O₂; brine/seawater Cl⁻ bands; pure H₂O → freshwater). Documented in-code.
2. **`buildingProfile(unit, kind, current?)`** — material-source maps:
   - brine → `pond`
   - seawater / freshwater → `intake` (slab + pipe mouth)
   - air / flue / bottled gases → `stack` (duct intake)
   - salt / solids → `silo`
   - unknown → `intake` + “Unassigned feed” (not unlabeled tank)
3. **`renderBuildingBody` + CSS** — minimal `intake` / `stack` visuals in the existing iso language; badge glyphs `brine` / `intake` / `air` / `flue` / `silo` instead of `tank`.
4. **Labels** — palette/addNode/`configureNewSource` set practical names; case load via `nodeDisplayLabel`; restore rewrites only generic “Material source…” / prior auto intake labels.
5. **Palette** — discrete Utilities cards: Seawater intake, Brine lake, Ambient air, Flue gas, Freshwater (`data-unit="material-source"` + `data-preset` / `data-label`). Generic magic card demoted; purchased chemicals under collapsed **Purchased feeds**.
6. **`flueGas` preset** — screening CO₂-rich mix `{ CO2: 150k, N2: 750k, O2: 50k, H2O: 50k }` mol basis.
7. **Inspector** — legend “Intake settings” for material-source.
8. **Tests** — updated Zabuye chrome expectations; new focused intake/palette assertions. Suite green (`npm test`: 223 pass).

## Verify

1. Open https://akarshgopal.github.io/ultimat-sim/ after deploy, or `npm run dev` locally.
2. Dead Sea or Zabuye hub → Process floor: brine = pond (“Brine lake”), air = stack (“Ambient air”) — **not** storage tanks labeled Material source.
3. Palette Utilities: add Seawater intake / Flue gas; labels match; Purchased feeds is collapsed secondary.
4. Existing solve still green; site resource caps still bind.

## Non-goals / follow-ups

- True plant-specific flue chemistry / stack assays
- Intake CAPEX, pumps, SOC / inventory buffers
- New UNITS kinds (kept `material-source`)
- Visual chrome overload beyond profiles + glyphs + palette

## Files touched

- `js/flowsheet-app.js`
- `flowsheet.css`
- `tests/flowsheet-ui.test.js`
- `.hunt-run/mech2-intakes-summary.md`
