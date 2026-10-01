# UX7 campus iso — summary

**Branch:** `feat/ux7-campus`  
**Baseline tip:** `cf6a2da` (UX6 merge on main)  
**Date:** 2026-10-01 (Europe/Berlin)  
**Workstream:** B — Campus as iso plant layout (Factorio / CoI plant read)

## Outcome

Location/Overview campus diagrams now use an **axonometric (2:1) plant layout** from the same `layoutFootprintCampus` footprint pads. Leaflet map layers stay honest 2D lat/lon rings. Legend / pad click → map focus unchanged.

Live Zabuye diagnosis (flat Solar rectangle + tiny Minerals inside dashed outline) was the bar: the diagram now reads as sheds / solar field / yard links, not a screening jellybean.

## What shipped

1. **`MapSite.projectCampusDiagramIso`** (`engine/map-site.js`)
   - Deterministic iso fit of campus rings into the instrument viewBox
   - Solar: low extruded slab + panel hatch lines
   - Process pads: taller shed faces (top / south / east) + roof ridge hint
   - Outline: flat dashed ground ring (screening total), still present
   - **Roads** (solid) + **power utilities** (dashed) between solar ↔ process centroids
   - Optional **`waterCue`**: brine / intake / discharge / freshwater canal stub + pipe when UI has supporting process/rights data
   - Keeps `projectCampusDiagram` (north-up flat) for compatibility

2. **UI wiring** (`js/flowsheet-app.js`)
   - `footprintDiagramFor` prefers iso projector; `campusWaterCue` from pad units / rights (Zabuye brine-minerals → brine feed cue)
   - `campusDiagramMarkup` paints links, water cue, extruded faces, hatch; preserves `data-footprint-pad` + titles
   - Location instrument + Overview mini toggle `.is-iso`
   - Honesty note unchanged: pads are intensities × activity, not surveyed layouts

3. **CSS** (`flowsheet.css`) — road / utility / water / hatch / shed face chrome; focus still strokes pad polygons

4. **Tests** — iso geometry + strengthened Location footprint UI assertions; mock `classList.toggle` updates `className`

## Files

| File | Change |
|------|--------|
| `engine/map-site.js` | `projectCampusDiagramIso` + export |
| `js/flowsheet-app.js` | water cue, iso wiring, markup |
| `flowsheet.css` | iso campus chrome |
| `tests/map-site.test.js` | iso determinism / faces / links / cues |
| `tests/flowsheet-ui.test.js` | iso campus assertions + classList mock |
| `.hunt-run/ux7-campus-summary.md` | this file |

## Tests

```text
npm test → 215 pass / 0 fail
```

## Zabuye 30s checklist (campus)

1. Location campus SVG has extruded solar + Minerals shed (not flat north-up rects only)
2. Panel hatch on solar; road + power spur to Minerals
3. Brine feed cue when brine-minerals pad present
4. Legend button / pad click still calls `focusFootprintPad` → map popup
5. Leaflet footprint polys remain 2D geographic truth
6. Overview mini uses same iso projector at 160×96
7. Empty state still “Add blocks to size pads”; note still denies surveyed-layout claim
8. Never Empire

## Non-goals held

No new GIS, no footprint physics, no Process node paint, no TEA chart restyle, no Unity/React.

## Grok Build note

CLI run was interrupted (empty `.hunt-run/grok-logs/ux7-campus.json`); implementation finished in-worktree against the raised plant-layout bar from live Zabuye screenshots.

## Blockers

None for merge readiness of this branch. Visual QA on live Pages after merge still recommended (SVG paint vs Leaflet side-by-side).
