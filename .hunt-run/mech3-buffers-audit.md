# MECH3 — Material buffers / inventory SOC (audit + tranche)

**Tip at start:** `7d1ea36` (MECH2 practical intakes) on `main`  
**Date:** 2026-10-02 (Europe/Berlin)  
**Mode:** audit → implement one YAGNI tranche

---

## 1. Where horizon / battery SOC lives today

| Piece | Behavior | Anchor |
|-------|----------|--------|
| `solveHorizon` | 24× `solveOperation`; leftover converter demand; PV + **site** battery SOC | `engine/solve.js` L634–806 |
| Site battery | `storage.batteryKWh` / `powerKW` / `efficiency` / `initialKWh`; discharge into hourly electricity budget; charge from PV surplus | L639–643, L667–669, L775–776 |
| Graph `battery` unit | Single-hour electricity in→out with efficiency — **no multi-hour SOC** | `units.js` `energyStorage` |
| Site resource budgets | Non-electric resources deplete across hours (`remainingResource`) | L645–648, L766–771 |
| Material edges | Steady push each hour; MECH1 `edge.capacity` clamps rate; **no inventory** | `applyEdgeCapacity` |

**Gap:** intermediates and offtake cannot bank mass from hour N for hour N+k. Night/day and surge decoupling are impossible without power SOC alone.

---

## 2. Minimal design that is still “real”

**Reject for this tranche**

- Capacity-on-sink only (no discharge control; can’t feed a converter later)
- Perfect two-pass pull allocation (electrical-bus style) — real but larger
- Pipe fluid boxes on every edge — too broad
- CAPEX / footprint / TEA for tanks — defer

**Ship: `material-buffer` unit + horizon SOC carry**

| Field | Role |
|-------|------|
| Unit | `material-buffer`, `kind: 'buffer'` |
| Ports | `in` + `out` (material, both required) |
| `params.capacityKg` | Max inventory (kg). Blank/`Infinity` = unlimited hold. |
| `params.initialKg` / `inventoryKg` | Starting / carried SOC |
| `params.storedStream` | Composition template for inventory |
| `operation.setpoints[id]` | **Discharge** kg this solve (daily in case; hourly leftover split in horizon) |
| Default setpoint | Drain all available → pass-through (end SOC 0) — bit-identical if unused |

**Hour logic (charge then discharge)**

1. Accept inlet up to free capacity (`capacity − SOC`); reject excess → `limitedBy: capacity` (edge rewritten → upstream source `supplied` drops).
2. Mix accepted into `storedStream`; SOC += accepted.
3. Discharge `min(setpoint, SOC)`; `limitedBy: inventory` when short.
4. Result carries `inventoryKg`, `fill`, `storedStream`.
5. Element balance: SOC increase counts as sink; decrease as source (keeps `maxAbsResidual` honest).

**`solveHorizon`**

- Init buffer state from `initialKg` / `storedStream`.
- Each hour inject `inventoryKg` + `storedStream` into node params.
- Split daily discharge setpoint across remaining hours (all 24, not sun-gated).
- After solve, write SOC forward; record `horizon.hours[].buffers[id] = { soc, capacity, fill }`.

**UI (minimal)**

- Palette utility card “Buffer tank” (tank profile — finally honest storage chrome).
- Inspector: capacity kg, initial kg, discharge setpoint; metrics show SOC / fill.
- No case rewiring required; tests use a tiny graph. Player can drop a tank on Zabuye/Dead Sea Process floor.

---

## 3. Why this is highest leverage / smallest

Mirrors the **already-shipping** site-battery pattern (SOC outside the hourly craft solve, injected as availability) but for **mass**, with one explicit unit players can place. Shows Factorio/CoI storage: fill when feed is fat, starve downstream when empty, backpressure when full — without inventing a second solver.

---

## 4. Deferred

- Two-pass pull (discharge = exact downstream demand)
- Per-hour charge/discharge rate limits (pump nameplate)
- Tank CAPEX / pad footprint / boil-off
- Auto-insert buffers in `size.js` / Zabuye preset wiring
- Root-cause starvation chains (next mechanic candidate)
- Gas vs liquid headspace / density UI

