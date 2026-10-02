# MECH4 — Root-cause starvation chains (audit + tranche)

**Tip at start:** `0d19945` (MECH3 buffers) on `main`
**Date:** 2026-10-02 (Europe/Berlin)
**Mode:** audit → implement one YAGNI tranche

---

## 1. What diagnosis exists today

| Piece | Behavior | Gap |
|-------|----------|-----|
| `nodeResults[id].limitedBy` | Local binding names only (`brine`, `electricity`, `logistics`, `site budget`, `inventory`, `capacity`, …) | No upstream walk |
| `tagLogisticsLimits` | Adds `logistics` when an inlet was MECH1-clamped and that port binds | Names the fact, not the edge in the node field |
| `edgeLimits[]` | `{ from, to, capacity, requested, delivered }` | Used for warnings/UI belt paint; not joined into a chain |
| `warnings` | `"minerals limited by brine, logistics"` + `"brine→minerals limited by logistics capacity"` | Player must mentally join lines |
| UI `blockDiagnosis` | Only when block is **idle**; one hop to `sourceSupplyDiagnosis` | Running-but-starved converters show activity, not why; no multi-hop |
| Face / inspector | Bottleneck CSS + `Limited by: brine, logistics` | No “because …” root |

**Already real mechanics that starve:** MECH1 edge capacity, MECH3 empty buffer (`inventory`), site budget on sources, craft inlet shortfalls, power-bus allocation. Missing inlet is a pre-solve graph error (`validateGraph` requires every `required` port) — UI `missing-connection` covers incomplete plants; engine chain still handles a named port with no edge defensively.

---

## 2. Tranche design (diagnosis only)

**Ship:** post-solve `attachCauseChains(case, nodeResults, edgeLimits)`

For each node with non-empty `limitedBy`:

1. Emit local symptom step(s) for binding limits.
2. Walk upstream along binding inlet ports / logistics edges:
   - **logistics** → cite `from→to` capacity clamp (stop or continue if supplier also limited)
   - **site budget** on a source → root
   - **inventory** on a buffer → “buffer empty” root
   - **capacity** on a buffer → “buffer full” (backpressure)
   - inlet port → recurse into supplier’s `limitedBy` / empty supply
   - skip through junction / splitter / mixer
3. Attach:
   - `causeChain: [{ code, nodeId, text, port?, edge? }, …]`
   - `causeText: steps.map(s => s.text).join(' ← ')`  (symptom ← … ← root)

Call from `solveOperation` after `tagLogisticsLimits`, and again at end of `solveHorizon` on accumulated totals + merged `edgeLimits` so daily view matches.

**UI (minimal):**

- Inspector metric row **Cause** when `causeText` present
- Node `<title>` / idle diagnosis `detail` use `causeText`
- No new units, no solver physics change

---

## 3. Why this tranche

Factorio/CoI “why is this machine red?” is a **chain**, not a local tag. We already compute every leaf cause (logistics, buffer SOC, site budget); MECH4 only joins them. Zero risk to mass/energy balances.

---

## 4. Deferred

- Click-to-select upstream hop along the chain
- Horizon per-hour cause timelines
- Auto-highlight the binding edge when selecting a starved block
- Pull-demand / two-pass allocation (separate mechanic)

---

## 5. Shipped

- **Tip:** `07d84eb` on `main`
- **Pages:** https://akarshgopal.github.io/ultimat-sim/
- **Tests:** 237 pass
