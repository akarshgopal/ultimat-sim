# MECH1 — Constrained logistics (edge throughput limits)

**Branch:** `feat/mech1-logistics` (from `65836ad`)  
**Date:** 2026-10-01 (Europe/Berlin)  
**Grok Build:** started then stalled in exploration (~12 min, 0 writes); finished with direct edits.

## Shipped

1. **`edge.capacity`** — optional finite ≥ 0 in native stream units for the current solve step (material/consumable kg or amount; electricity/heat kWh). Blank / null / undefined / Infinity = unlimited.
2. **`evaluateGraph`** — clamps every outlet after write (source, splitter, mixer, converter, allocated bus). Site budget deduct uses post-clamp delivered mass. Electrical-bus plan pass does **not** pre-clamp fan-out; cable caps bind in `allocateElectricity` via `Math.min(wanted, usable, remaining, capacity)` so leftover power redistributes by priority.
3. **`edgeLimits[]`** + **`limitedBy` includes `logistics`** when a clamped inlet is binding; warnings like `brine→minerals limited by logistics capacity`.
4. **Horizon** — each hourly `solveOperation` applies the same clamps; `accumulateSolved` merges `edgeLimits`.
5. **UI (minimal)** — Logistics capacity number field on each inspector port connection (blank = unlimited); click edge on canvas to select; `logistics` in `portNames`; bottleneck class from `edgeLimits` / `limitedBy`.
6. **Tests** — `tests/mech1-logistics.test.js` (6): unconstrained bit-identical; brine→minerals clamp; electricity cable + bus; horizon hourly clamps; splitter per-edge; blank/Inf unlimited.

## Verify on Zabuye

1. Load Zabuye brine hub.
2. Select brine → minerals edge (or minerals’ brine port connection).
3. Set **Logistics capacity** to ~40% of free brine mass/day (e.g. `40000`).
4. Re-solve: minerals activity and Li (etc.) fall; Overview/Process show logistics bottleneck; edge gets `.bottleneck`.
5. Clear capacity → recovery.
6. Optional: set power-bus → minerals cable capacity below free kWh (e.g. `1000`) → same cascade via electricity + logistics.

## Non-goals (unchanged)

Buffers/SOC, starvation chains, sink backpressure, logistics CAPEX, size auto-pipe sizing, UX7 chrome, git push.

## Notes

- Capacity semantics = **max flow in this solve step** (horizon hours reuse the same number; not auto `/24`).
- Orphan sources after DAC route switches no longer crash `supplied` assignment (skip missing outlet edges).
