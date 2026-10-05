# MECH6 — Splitter branch backpressure (audit + tranche)

**Tip at start:** `e6c981f` / feat `299eb29` (MECH5) on `main`
**Date:** 2026-10-02 (Europe/Berlin)
**Mode:** audit → implement one YAGNI tranche

---

## 1. How splitters work today

| Piece | Behavior | Gap |
|-------|----------|-----|
| `material-splitter` evaluate | Weight-split inlet → outlets; `setOutlet` applies `edge.capacity` per branch | Inlet `available` stays full even when a branch is clamped |
| MECH5 `reconcileBackpressure` | Scales converters / buffers / single-outlet mixer·junction | **Explicitly skips splitters** (one capped branch must not starve siblings by global scale) |
| Capped sink on one leg | Sink rewrites its inlet to `acceptKg`; sibling keeps weight share | Feed still supplies 100%; **mass balance residual** (destroyed mass on capped leg) |
| Mixer | Single outlet — MECH5 already scales through | No change needed |
| Cause chains | Passthrough through splitter; no `branch-blocked` | Upstream cannot name “branch blocked ← export capped” |

**Probe (equal 50/50, A.acceptKg=10, B free, feed=100):** feed supplied 100, A=10, B=50, `maxAbsResidual` ≫ 0. Sibling is correct; inlet is not.

**Conclusion:** not already correct under MECH1/5. Need accept-per-branch + inlet rewrite (no overflow to free legs).

---

## 2. Tranche design

**Ship**

1. `reconcileBackpressure` for `kind === 'splitter'`:
   - Keep each outlet `edgeStreams` as already delivered (sink rewrite / edge cap / full buffer).
   - If `sum(delivered) < available`, scale splitter `available` to the sum, rewrite inlet edge, tag `export` or `logistics`.
   - **Do not** re-split or boost free branches (no invented overflow).
2. Converter binding: treat downstream splitter with `export`/`logistics` like mixer (throttle craft).
3. MECH4: splitter root/symptom `branch-blocked` (“… branch blocked”); walk blocked outlets to sink/buffer/logistics root; export walk enters splitters.

**Reject this tranche**

- Factorio overflow rebalance onto uncapped legs (still deferred)
- Priority / ranked branch fills
- Heat / electricity splitters
- Auto `annualDemandLimit` → accept (still deferred)

---

## 3. Why this tranche

MECH5 left a hole: a capped offtake behind a splitter silently destroys mass and never throttles the feed. Closing mass with per-branch accepts + inlet backpressure is the thin Factorio lever without starving siblings.

---

## 4. Deferred

- Overflow rebalance to uncapped legs when one branch blocks
- Wire `annualDemandLimit` → daily accept (opt-in)
- Heat rejection / power export caps
- Intake pump energy / CAPEX for intakes
- CAPEX for offtake terminals

---

## 5. Shipped

- **Tip:** `9bce275` on `main`
- **Pages:** https://akarshgopal.github.io/ultimat-sim/
- **Tests:** 247 pass
