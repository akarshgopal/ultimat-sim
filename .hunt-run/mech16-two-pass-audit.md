# MECH16 — Two-pass buffer→converter feed / overflow (audit)

**Tip at start:** `5985602` on `origin/main` (feat tip `8b60b28` MECH15)
**Date:** 2026-10-02 (Europe/Berlin / CEST)
**Mode:** audit → minimal two-pass reconcile (YAGNI)

---

## 1. Solver order today

| Pass | Where | Buffer→converter behavior |
|------|-------|---------------------------|
| Topo evaluate | `evaluateGraph` | Buffer charges/discharges first; converter crafts on delivered outlet. **Direct** buffer→converter inventory limiting already works (MECH3/4). |
| Plan + bus | `allocations == null && hasBus` | `reconcileBackpressure` **skipped** so plan demand stays unconstrained. |
| Allocated / no-bus reconcile | `reconcileBackpressure` reverse-topo | Splitter overflow (MECH12–14) may raise buffer inlets **only** when `bufferOutletFeedsSink`. Buffer→converter / mixer / nested splitter frozen at delivered. |
| MECH14 absorb | `applyBufferOverflowIntake` | Re-`evaluateBuffer` + refresh sink receipts. Does **not** re-evaluate a downstream converter. |

Growing a buffer outlet that already fed a converter in the topo pass would leave converter `activity` / `consumed` / product edges stale — mass invent or balance lie — hence the freeze.

---

## 2. Factorio / CoI target

1. Buffer discharge into a converter inlet; empty inventory limits craft; cause names `empty-buffer`.
2. Splitter leftover overflows onto a buffer→converter leg up to tank room (and edge caps); converter re-crafts on the new feed; no invented mass.
3. Converter under-draw (e.g. SWRO / brine-minerals pull-only feed) banks rejected discharge back into buffer SOC; electrolyzer take-all + reject port stays honest.
4. Cause: `full-buffer` / `… logistics` / `empty-buffer` stay attached as today.

---

## 3. Ship (smallest correct two-pass)

**In-reconcile re-eval** (not a full second `evaluateGraph`):

1. Replace `bufferOutletFeedsSink` with `bufferOutletCanAbsorbOverflow` — true when outlet → **sink or converter** (direct edge only).
2. `splitterBranchCapacity`: open those legs to `bufferOverflowRoomKg` (same MECH14 room math).
3. After `applyBufferOverflowIntake` re-charges the tank:
   - If outlet → converter: rebuild inlets from `edgeStreams`, `unit.evaluate`, write `consumed` / outlets (edge caps), refresh product sinks.
   - If converter consumed less than buffer offered on the feed port: bank reject into buffer SOC (same math as buffer reconcile branch).
4. Keep mixer / nested splitter / buffer→buffer overflow **frozen** (cascade still needs a fuller multi-pass).
5. Tests: direct buffer→electrolyzer inventory limit; splitter overflow → buffer→ely; brine-minerals pull bank; empty-buffer cause; logistics on tank→converter edge; Zabuye bit-stable; flip MECH14 frozen test to absorb.

**Reject / defer this tranche**

- Splitter overflow into buffer→mixer / buffer→buffer / nested splitter
- Plan-pass bus foresight (overflow still skipped on plan; allocated power may under-serve a newly water-rich ely — excess banks or sits as waterReject; honest enough)
- Heat/elec buffers
- Tank CAPEX

---

## 4. Expected behavior

| Case | Result |
|------|--------|
| Direct tank(initial 100)→ely, discharge pass-through, feed 0 | Ely crafts on ~100 kg water; tank ends empty |
| Split A accept 10, B tank→ely cap 1000, feed 100 | A=10, tank in=90, ely water-fed, feed=100 (was frozen 50/60) |
| Tank→SWRO, overflow 90, SWRO setpoint tiny | Tank banks unconsumed feed; balances close |
| Tank→ely edge.capacity 20 after overflow offer | Transfer ≤20; logistics cause on tank or split |
| Empty tank → converter | Cause `short on … ← … buffer empty` |
| Unconstrained Zabuye | Bit-identical activities |

---

## 5. Risk

- Stock hubs have no splitter→buffer→converter today (MECH11 pumps are converters on the lift leg, not buffers). Regression = Zabuye + full suite.
- Double `applyEdgeCapacity` must not duplicate `edgeLimits` rows — only apply when writing new outlet offers.
