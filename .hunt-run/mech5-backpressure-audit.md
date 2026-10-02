# MECH5 — Output backpressure / full-sink block (audit + tranche)

**Tip at start:** `2af3df4` (MECH4 cause chains) on `main`
**Date:** 2026-10-02 (Europe/Berlin)
**Mode:** audit → implement one YAGNI tranche

---

## 1. How sinks work today

| Piece | Behavior | Gap |
|-------|----------|-----|
| `material-sink` / `consumable-sink` | `evaluateGraph` copies inlet → `received`; **no clamp** | Infinite void — converter can always dump |
| `heat-sink` / `electricity-sink` | Same accept-all (heat allows fan-in) | Out of scope this tranche |
| `economics.annualDemandLimit` | Caps **revenue** only (`engine/economics.js`) | Physics still pushes full mass |
| MECH3 `material-buffer` | Accepts up to free capacity; rewrites inlet; `limitedBy: capacity` | Backpressures **sources** on the inlet edge; **converters upstream still run full** (ghost outlets / residual risk) |
| MECH1 `edge.capacity` | Clamps when producer `setOutlet`s | Inlet caps correctly throttle converters; **outlet** caps leave `result.outlets` hot |
| MECH4 `causeChain` | Walks logistics / site budget / empty·full buffer | No `export capped` / sink-full root |

**Conclusion:** sinks are infinite accepts. Buffer-full is only half the Factorio lever (source rewrite, no converter throttle). TEA offtake limits are not wired into solve.

---

## 2. Tranche design

**Ship**

1. Optional sink accept rate: `params.acceptKg` (material) / `params.acceptAmount` (consumable), or `operation.setpoints[sinkId]`. Blank = unlimited (bit-identical).
2. `evaluateSink`: accept `min(in, cap)`; rewrite inlet edge; `limitedBy: export` when clamped; stash `acceptKg` on result.
3. `reconcileBackpressure` (end of `evaluateGraph`, reverse topo):
   - **Converters:** if any outlet `edgeStreams` ≪ `result.outlets`, scale activity / consumed / outlets / requestedInputs; rewrite inlets + outlets; tag `export` (or `logistics` when the clamp is an outlet edge capacity).
   - **Buffers:** if discharge outlet was reduced by a capped sink, restore rejected mass into inventory and shrink `activity`.
   - **Mixer / junction:** scale through when the single outlet was reduced.
   - **Splitter:** skip (one capped branch must not starve siblings — deferred).
4. MECH4 hooks: sink root `export-capped` (“… export capped”); converter symptom `export` (“… blocked by export”) walks downstream to sink/buffer root.
5. UI: material-sink control **Export / offtake limit** (`acceptKg`); blank unlimited.

**Reject this tranche**

- Auto-bind `economics.annualDemandLimit / 365` as accept (surprising; TEA stays revenue-only until explicit)
- Heat / electricity sink caps
- Splitter rebalance
- Two-pass global pull allocator

---

## 3. Why this tranche

Factorio/CoI: a full belt / closed offtake **stops the machine**, not just paints a warning. Extending buffer inlet-rewrite with a thin reverse reconcile closes the converter gap for sinks **and** full buffers, and reuses cause-chain wiring.

---

## 4. Deferred

- Wire `annualDemandLimit` → daily accept (opt-in)
- Splitter branch backpressure / overflow to uncapped legs
- Heat rejection / power export caps
- CAPEX for offtake terminals
- Horizon per-hour offtake nomination UI beyond the accept field

---

## 5. Shipped

- **Tip:** _(see merge commit)_
- **Pages:** https://akarshgopal.github.io/ultimat-sim/
- **Tests:** 242 pass
