# MECH15 — Buffer↔buffer transfer (audit)

**Tip at start:** `1bdbc92` on `origin/main` (feat tip `7bee34e` MECH14)
**Date:** 2026-10-02 (Europe/Berlin)
**Mode:** audit → implement thinnest correct transfer (no two-pass)

---

## 1. Buffer outlet wiring today

| Piece | Behavior | Anchor |
|-------|----------|--------|
| Unit | `material-buffer`, ports `in`/`out` (material) | `units.js` |
| Evaluate | Charge → discharge setpoint; rewrite inlet to accepted; `setOutlet` on out | `evaluateBuffer`, `evaluateGraph` |
| Backpressure | If delivered < produced on out edge: keep rejected mass in SOC, tag `export` | `reconcileBackpressure` buffer branch |
| Horizon SOC | Inject `inventoryKg` + `storedStream` each hour; record `horizon.hours[].buffers[id]` | `solveHorizon` |
| MECH14 overflow | Splitter may raise buffer inlet only if `bufferOutletFeedsSink` | `splitterBranchCapacity` |
| UI connect | Same-kind ports — buffer out → buffer in already legal | `flowsheet-app.js` |

**Probe (direct A→B→sink):** already moves mass. Full B backpressures A (`export` ← `full-buffer`). `edge.capacity` on A→B clamps transfer and A banks the rest. Horizon dual-tank SOC already carries both inventories.

---

## 2. Gaps that block “honest transfer”

1. **`initialKg` without `storedStream` + empty inlet throws** in `scaleMaterialToMass` — breaks inventory-only start / some transfer setups.
2. **Transfer-line logistics cause is wrong:** outlet `edge.capacity` clamps via `setOutlet` → `edgeLimits`, but reconcile tags source buffer `export` and cause walks downstream (or stops at “blocked by export”) instead of naming `A→B logistics`.
3. **MECH14** still freezes splitter overflow into buffer→buffer (needs cascade re-eval) — deferred this tranche.
4. **Pump between tanks** already works as optional `intake-pump` with capacity/setpoint (MECH8); not a new unit.

---

## 3. Ship (YAGNI)

**No new unit.** Transfer = buffer `out` → buffer `in` (optional `edge.capacity`; optional existing intake-pump on the leg).

1. `evaluateBuffer`: if discharge wanted but no composition template, hold SOC / activity 0 / `inventory` — never throw.
2. Buffer reconcile: when under-delivery matches an `edgeLimits` on the **outlet**, tag `logistics` (not `export`).
3. `attachCauseChains` logistics: also match edgeLimits where `from.node === nodeId` (outlet clamp).
4. Tests for pass-through transfer, dest-full BP + cause, edge-cap logistics cause, empty-source, horizon dual SOC, no-throw empty inlet.

**Reject this tranche**

- New “transfer pump” unit
- Two-pass pull / buffer→converter overflow
- Splitter overflow into buffer→buffer chains
- Heat/elec buffer analogs
- Tank CAPEX / pipe schedule

---

## 4. Expected behavior

| Case | Result |
|------|--------|
| A→B→sink pass-through | Mass conserved; both end SOC 0 |
| B capacity 40, disB=0, feed 100 | B inv=40; A act=40 inv=60; cause A ← B full |
| A→B edge.capacity 25 | Transfer 25; A banks rest; cause names A→B logistics |
| Horizon A setpoint 120, B 60, feed 240 | Both SOC series evolve; end A≈120 B≈60 sink≈60 |
| initialKg w/o storedStream, empty feed | No throw; activity 0; inventory held |


---

## 5. Shipped

- Engine: empty-inlet inventory hold (no throw); buffer outlet `edge.capacity` → `logistics` + cause `A→B logistics`
- Tests: `tests/mech15-buffer-transfer.test.js` (+8)
- Deferred: splitter overflow into buffer→buffer, two-pass buffer→converter, heat/elec splitters, tank CAPEX
