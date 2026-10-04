# MECH21 — Redo · one-gesture boundaries · honest part-load SEC · TDS mg/L density

**Feat tip:** `4944d5d`
**Pages:** pending
**Tests:** 351 pass
**Date:** 2026-10-04 CEST
**Base:** `e4a3a76` (`docs(mech20): mark Pages live`)

## Shipped

### 1 Redo
- Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo
- Pairs with the existing undo stack (place, connect, delete, move, nudge, inspector snapshot, Add sources & sinks)
- A new mutation clears redo. Stack max stays 20. Ignored while focus is in INPUT/TEXTAREA/SELECT/contenteditable
- Shortcuts hint names redo

### 2 Undo “Add sources & sinks” as one gesture
- `completeBoundaries` pushes one snapshot for the whole batch
- An empty click (nothing to add) does not push
- Ctrl/Cmd+Z removes every source and sink from that click; redo puts them back

### 3 Part-load vs electricity limit
- `partLoadK` unset stays bit-identical (SEC at the kWh/m³ slider, electricity limit = kWh / SEC)
- When k is set, delivered flow is the largest Q at or below min(setpoint, feed) whose shaped SEC(Q) × Q fits the bus
- `limitedBy` includes `electricity` on that consistent Q, not on the setpoint SEC
- Requested kWh is still the setpoint demand; consumed kWh is activity × SEC(activity)
- Screening curve is treated as increasing in flow for k ≤ 3 (slider max is 2)

### 4 Density from `tds_mg_per_L`
- Still prefers `density_kg_per_L`, then salinity / `tds_g_per_kg` / `tds_mg_per_kg`
- If only `tds_mg_per_L`: S0 = mg/L ÷ 1000 (1 L ≈ 1 kg), then S = mg/L ÷ UNESCO ρ(S0), then UNESCO 25 °C at S
- Source label: `salinity estimate (UNESCO 25 °C, TDS mg/L proxy)`
- Outside 0–42 g/kg: labeled fluid-class default, not an extrapolated ρ
- Status-meta shows that source

## Cash deltas

Stock demos do not set `partLoadK`, and stock assays already carry `density_kg_per_L`. Existing bit-identical cash tests stayed green. No stock CAPEX or net-cash delta.

## Verify
1. Hard-refresh https://akarshgopal.github.io/ultimat-sim/
2. Place a block, Ctrl/Cmd+Z, then Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y — it returns. Place something else and redo does nothing. Typing in a field does not redo
3. Drop an intake pump, Add sources & sinks, Ctrl/Cmd+Z once — pump only. Redo restores the batch
4. Intake pump → Part-load shape k, setpoint at rated capacity, starve the bus. Throughput is below kWh / base SEC and the block says electricity
5. Buffer on a seawater assay that has only `tds_mg_per_L` ≈ 35000 (no density) — density is the UNESCO proxy, not 1025, and the economics line names the TDS mg/L proxy

## Deferred
- Downstream backpressure still scales pump streams linearly, so a blocked outlet can desync part-load SEC from delivered Q
- `partLoadK` > 3 can make electricity vs flow non-monotonic; bisection assumes the screening range
- No toolbar redo button
- TDS mg/L proxy is one UNESCO correction, not a lab density
- Blower has no part-load twin
