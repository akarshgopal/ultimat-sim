# MECH12 — Splitter overflow onto free legs (audit)

**Tip at start:** `51fb134` on `origin/main` (feat tip `a8c8fe4` MECH11)
**Date:** 2026-10-02 (Europe/Berlin)
**Mode:** audit → Factorio-correct default (update MECH6 tests honestly)

---

## 1. Current MECH6 allocation

| Piece | Behavior |
|-------|----------|
| `evaluateGraph` splitter | Weight-split inlet → outlets; `setOutlet` applies `edge.capacity` |
| Sink / buffer rewrite | Capped branch inlet rewritten to accept / fill room |
| `reconcileBackpressure` splitter | `got = sum(delivered)`; if `got < available`, scale inlet to `got`; **outlets stay put — no re-split** |
| Cause | Splitter `branch-blocked` ← capped sink / logistics when inlet backpressures |

**Probe (equal 50/50, A.acceptKg=10, B free, feed=100):** A=10, B=50, feed→60. Sibling does **not** get the rejected 40.

MECH6 audit explicitly deferred: “Factorio overflow rebalance onto uncapped legs.”

---

## 2. Factorio / CoI target

1. Weight-split as today.
2. Blocked branch keeps what it can (`accept` / edge cap / full buffer).
3. Leftover redistributes to **free** outlets by relative weight (water-fill).
4. Inlet backpressures only if leftover remains after all free legs saturate.

---

## 3. Tranche design

**Ship**

1. Replace MECH6 “keep delivered, scale inlet” with overflow water-fill in `reconcileBackpressure`.
2. Per-branch capacity:
   - material/energy **sink**: `acceptKg` / `acceptKWh` (else ∞), min edge capacity
   - **non-sink** (buffer / mixer / converter / nested splitter): freeze at current delivered this tranche (no invented buffer inventory)
3. Rewrite free outlet edge streams from inlet composition; refresh free sink `received` / `consumed`.
4. Tag splitter `export` / `logistics` only when inlet still rejects after rebalance.
5. Update MECH6 tests to Factorio expectations; add MECH12 coverage (both capped, edge-cap headroom, three-way).

**Reject this tranche**

- Opt-in `overflow: false` MECH6 mode (YAGNI — default Factorio only)
- Overflow into buffers (inventory rewrite)
- Priority / ranked fills
- Heat / electricity splitters

---

## 4. Behavior change vs MECH6

| Case | MECH6 | MECH12 |
|------|-------|--------|
| A capped 10, B free, feed 100 | A=10, B=50, feed=60 | A=10, B=90, feed=100 |
| A logistics 15, B free | A=15, B=50, feed=65 | A=15, B=85, feed=100 |
| A+B both capped | inlet = sum | same |
| Upstream converter, one sale capped, store free | craft throttles | craft **unthrottled**; store takes overflow |

Cause `branch-blocked` on the splitter only when inlet still backpressures (all useful legs saturated).
