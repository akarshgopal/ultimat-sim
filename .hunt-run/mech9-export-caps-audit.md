# MECH9 — Heat & power export / curtailment caps (audit + tranche)

**Tip at start:** `77628d5` (docs after MECH8 `dd472ce`) on `main`
**Date:** 2026-10-02 (Europe/Berlin)
**Mode:** audit → implement one YAGNI tranche

---

## 1. How energy sinks work today

| Piece | Behavior | Gap |
|-------|----------|-----|
| `material-sink` | `evaluateSink` + `acceptKg` / demand-backed accept; inlet rewrite; `limitedBy: export`; reverse reconcile | Done (MECH5–7) |
| `heat-sink` / `electricity-sink` | `evaluateGraph` copies inlet → `received` (heat allows fan-in via `mixHeat`); **no clamp** | Infinite void / free curtailment dump |
| `allocateElectricity` | Needs `requestedInputs` / `consumed` on each bus consumer | `electricity-sink` on a bus **crashes** today (no those fields) |
| Bus inlet rewrite | After solve, bus inlet = sum(allocated legs) → gen `supplied` follows | Curtailment would work if sink reported usable = accept cap |
| Cause chains | Sink root `export-capped` already exists for `limitedBy: export` | Never fires on heat/power sinks |

**Stock demos:** waste-heat sinks (DAC / Sabatier / methanol) and no `electricity-sink` nodes. Blank caps must stay bit-identical.

---

## 2. Tranche design

**Ship**

1. Optional `params.acceptKWh` (or setpoint) on `heat-sink` / `electricity-sink`. Blank = unlimited.
2. Reuse `evaluateSink` for electricity + heat (after `mixHeat` when fan-in). Result stashes `acceptKWh`; `limitedBy: export` when clamped; rewrite inlet edge(s).
3. `finiteSinkAccept` / `hasManualSinkAccept` also read `acceptKWh`. No MECH7 demand wiring for energy (sale kg/y is material-only).
4. Bus: plan-pass sink reports `requestedInputs` / `consumed` so `allocateElectricity` can treat export as a priority-ordered leg (`usable = min(in, cap)`). Surplus export = sink last in priorities.
5. Reverse reconcile already scales converters when a downstream sink is export-limited — heat reject caps throttle producers the same way material offtake does.
6. Cause: keep code `export-capped`; electricity text → `… curtailment capped`; heat → `… export capped`.
7. UI: Export / curtailment limit (kWh/day) on both energy sinks; blank unlimited.

**Reject this tranche**

- Auto-bind TEA / PPA MWh into accept
- New unit types (grid-export terminal CAPEX)
- Changing stock case priorities / wiring electricity-sink onto demos
- Battery charge as implicit curtailment sink

---

## 3. Why this tranche

Factorio/CoI: a full belt stops the machine; a capped grid interconnect / cooling tower must stop dumping and backpressure generation — same lever as MECH5, for kWh.

---

## 4. Deferred

- PPA / interconnect annual energy → daily accept
- Stock demos with explicit export legs
- Heat quality (T_C) rejection curves beyond energy cap
- CAPEX for interconnect / cooling



## 5. Shipped

- **Tip:** `b7a9e1a` on `main`
- **Pages:** https://akarshgopal.github.io/ultimat-sim/
- **Tests:** 265 pass
