# MECH14 — Splitter overflow into material-buffers (audit)

**Tip at start:** `eab0de7` on `origin/main` (feat tip `160a189` MECH13)
**Date:** 2026-10-02 (Europe/Berlin)
**Mode:** audit → implement safe slice (no two-pass solver)

---

## 1. Why MECH12 froze buffers

`splitterBranchCapacity` (MECH12) set non-sink branch capacity to **current delivered**:

> Non-sink targets (buffer / mixer / converter / nested splitter): freeze at
> current delivered this tranche — no invented buffer inventory from overflow.

Reason: overflow rebalance runs in `reconcileBackpressure` **after** the topo
evaluate pass. Buffers already charged/discharged from the weight-split offer.
Raising a buffer inlet without rewriting `inventoryKg` / `storedStream` /
`consumed` would either:

1. Leave mass on the edge that the buffer never accepted (balance lie), or
2. “Invent” SOC without a charge step.

Sinks were safe because they have no SOC — only `received` / `consumed` to refresh.

---

## 2. Factorio / CoI target

Capped sale leg + free buffer leg: leftover water-fills the tank up to remaining
capacity (and edge caps). Priority tiers (MECH13) still fill first. Inlet
backpressures only when every useful sink/buffer leg saturates.

---

## 3. Safe slice (no two-pass)

**Ship**

1. Buffer branch capacity = `min(edgeCap, capacityKg − startInventoryKg)` (∞ if unlimited).
2. **Outlet safety gate:** if the buffer’s outlet feeds a **non-sink**, freeze at
   delivered (MECH12). Growing pass-through discharge into a converter would
   require re-solving downstream craft — deferred.
3. After overflow alloc to a buffer leg: re-`evaluateBuffer` with the new inlet
   offer; write `consumed` / `inventoryKg` / `storedStream` / outlet; if outlet
   → sink, refresh sink `received`/`consumed` (same as MECH12 free sinks).
4. Fixed discharge setpoints: extra mass stays as inventory; outlet unchanged.
5. Pass-through buffer → sink: extra mass charges then drains into the sink.
6. Cause: full buffer still `full-buffer` / capacity; splitter `branch-blocked`
   only when leftover remains.

**Reject this tranche**

- Buffer → converter / mixer / nested splitter overflow (needs two-pass)
- Buffer↔buffer transfer unit
- Heat / electricity splitters
- Re-water-fill after partial buffer accept (capacity math matches evaluateBuffer)

---

## 4. Expected behavior

| Case | Result |
|------|--------|
| A sink accept 10, B buffer cap 200 pass-through→sink, feed 100 | A=10, B in=90, sinkB=90, feed=100 |
| A accept 10, B buffer cap 50 empty, feed 100 | A=10, B in=50, leftover 40 backpressures |
| A accept 10, B buffer discharge 20, cap 1000, feed 100 | A=10, B in=90, activity=20, SOC=70 |
| B buffer → electrolyzer (non-sink) | B frozen at weight share (MECH12) |
| Equal / unset priorities | Compose MECH12/13 |


---

## 5. Shipped

- Engine: `splitterBranchCapacity` opens buffer→sink legs to remaining room; `applyBufferOverflowIntake` re-evals SOC.
- Tests: `tests/mech14-buffer-overflow.test.js` (+7)
- Deferred: buffer→converter overflow (two-pass), buffer↔buffer transfer, heat/elec splitters
