# MECH13 — Priority fill on material-splitter outlets (audit)

**Tip at start:** `106676f` on `origin/main` (feat tip `ada523c` MECH12)
**Date:** 2026-10-02 (Europe/Berlin)

---

## 1. Do weights already express priority?

**No.** `edge.weight` is proportional share among *simultaneously active* outlets
(first offer in `evaluateGraph`, and MECH12 water-fill within the active set).

| Goal | Weights alone | Need |
|------|---------------|------|
| 50/50 split | ✓ `weight:1` / `weight:1` | — |
| Overflow onto free leg | ✓ MECH12 | — |
| Fill left belt *first*, then spill | ✗ both get proportional offer even when both free | ranked fill |

Factorio priority output: high-priority leg takes flow until full (accept / edge cap),
then leftover water-fills lower-priority legs by weight.

---

## 2. Current MECH12 allocator

`allocateSplitterOverflow(available, weights, capacities)`:

1. Active = weight>0 ∧ capacity>0
2. Water-fill by weight; saturated drop out; leftover redistributes
3. Inlet rejects only if leftover remains

No priority dimension. Deferred explicitly in MECH12 audit.

---

## 3. Tranche design

**Ship**

1. Optional `edge.priority` (number, default `0`). Higher fills first.
2. Extend allocator: among eligible outlets, water-fill only the current
   **max priority** tier; when that tier saturates, spill to next (compose MECH12).
3. Equal priorities → bit-identical to MECH12.
4. Inspector: Priority number next to Share weight on splitter outlets.
5. Tests: high-first when both free; high capped → overflow low; same-tier weights; default = MECH12.

**Reject this tranche**

- Priority *input* (take-from-left-first) — separate Factorio lever
- Heat / electricity splitters
- Buffer↔buffer transfer
- Opt-in MECH6 no-overflow mode

---

## 4. Expected behavior

| Case | Result |
|------|--------|
| A prio 1, B prio 0, both free, feed 100 | A=100, B=0 |
| A prio 1 accept 30, B free | A=30, B=70 |
| A+B prio 1 w=1, C prio 0, A accept 10, feed 100 | A=10, B=90, C=0 |
| All prio 0 (or unset) | MECH12 unchanged |
