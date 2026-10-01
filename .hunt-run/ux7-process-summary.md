# UX7 Process — factory-floor visual language

**Branch:** `feat/ux7-process`  
**Tip baseline:** `cf6a2da` (main / UX6 merge tip)  
**Date:** 2026-10-01 (Europe/Berlin)  
**Workstream:** A only (Process paint). Campus iso + HUD strip out of scope.

## Outcome

Process `#flowsheetCanvas` paint layer now reads as a **plant floor**, not a soft flowchart:

1. **Floor grid** — SVG `plantFloorGrid` under edges/nodes + stronger CSS dual grid on `#panelProcess .flowsheet-canvas`.
2. **Iso / 2.5D buildings** — front + top (+ side) SVG paths from orthographic `position.{x,y}`; profiles by unit/kind (`tank`, `silo`, `solar`, `pond`, `cell`, `tower`, `furnace`, `bus`, `shed`). Sources/sinks are tanks/silos; brine minerals is a pond slab; chlor-alkali / bromine are cell sheds; ASU / ammonia are towers.
3. **Belts / pipes / cables** — material+consumable `belt` (wide), heat `pipe`, electricity `cable`. CSS `stroke-dashoffset` **`is-flowing`** only when `streamIsFlowing` (positive throughput); incomplete / zero stay `is-static` muted.
4. **Face status** — util / power / hub bar+spark on the building face (`node-face-bar` / spark); **Running** / **Starved** lights from real solve + diagnosis only.
5. **Hit-testing unchanged** — invisible `node-hit` + ports / `portPoint` / drag / Fit stay orthographic. Iso is paint-only (`ISO_DX`/`ISO_DY`).
6. **Plant floor wins viewport** — taller Process canvas min-height; slightly narrower sidebars (210 / flex / 220).

Empty state still **Plant floor / No blocks**. Never Empty factory. Never Empire.

## Grok Build

Started Grok Build CLI (`grok-4.7` high effort) per prompt; after ~6 min it was still exploring with **zero file writes**. Live Zabuye diagnosis steering raised the bar (no chip-on-rect polish). Executor stopped that session and finished with direct edits.

## Files

| File | Change |
|------|--------|
| `js/flowsheet-app.js` | Iso building paint, floor grid markup, belt classes + flow gate, face status + run lights; layout coords untouched |
| `flowsheet.css` | Building faces, belt/pipe/cable, flow animation, stronger floor, canvas height / workspace columns |
| `tests/flowsheet-ui.test.js` | Assert iso/floor/flowing/face markers instead of flat `rx="3"` card chrome |
| `.hunt-run/ux7-process-summary.md` | This note |
| `.hunt-run/ux7-process-raised-bar.md` | Diagnosis steering captured during the run |

## Tests

`npm test` — **214 pass / 0 fail**.

## Zabuye 30s checklist

| Check | Status |
|-------|--------|
| <5 s plant floor (grid + chunky buildings) | Paint: tanks/silos/ponds/cells/towers + dominant grid |
| <15 s belts/pipes animate on positive rates | `is-flowing` on material/power/heat when throughput > 0; muted static otherwise |
| <20 s face status / Running light from solve | Face bars + run/starved lights; util chip class retained where data exists |
| Fit / Focus / ports / mobile drawer | Ortho hit path preserved; no IA rewrite beyond canvas height / column tweak |
| Never Empire / Empty factory | Unchanged copy |

## Non-goals (left alone)

Location campus projector, Economics charts, HUD strip, unit physics, logistics DES, React/Unity.

## Blockers

None for merge readiness of workstream A. Visual QA on a live browser screenshot of Zabuye is still the human vibe check (Factorio/CoI-lite vs flowchart).
