# MECH18 — Tank fluid $/m³ + regional tea · pump/blower CAPEX+pad · Delete undo

**Feat tip:** `1cdc770`
**Pages:** live
**Tests:** 333 pass
**Date:** 2026-10-02 CEST
**Base:** `a2c12fa` (`docs(mech17): record tip SHA 2d9de32`)

## Shipped

### 1–2 Tank economics (regional pack + $/m³ by fluid)
- `tea.tankByFluid`: freshwater `$400/m³`, seawater `$550/m³`, brine `$750/m³`, generic `$500/m³` (≡ MECH17 `$0.50/kg` at ρ=1000)
- `tea.bindTankCapex({ fluidClass, capacityKg, densityKgM3, region })` applies regional CAPEX×
- Buffer inspector: fluid-class select + intensity line (`fluid · $/m³ · region ×`)
- Upstream intake inference (brine lake / seawater / freshwater); generic = unset

### 3 Pump + gas-blower CAPEX + campus footprint
- Tea packs: `intake-pump` `$350/(m³/day)`, `gas-blower` `$1.5/(Nm³/day)` × regional CAPEX×
- Footprint: pump `0.15 m²/(m³/day)` floor 6 m²; blower `0.002 m²/(Nm³/day)` floor 6 m²
- Wired into abundance (Zabuye/Dead Sea), sabatier/coastal (Europe ×), methanol (Atacama ×)

### 4 Undo for Delete
- Ctrl/Cmd+Z restores last deleted node (+incident edges/setpoint) or edge
- Stack max 20; ignored while typing in inputs
- Shortcuts hint updated

## Cash deltas (stock demos)

| Site | Before CAPEX | After CAPEX | Δ CAPEX | Before cash | After cash |
|------|-------------:|------------:|--------:|------------:|-----------:|
| Zabuye | $1,848,996 | $1,872,329 | +$23,333 (brine-pump ×0.8) | +$2,414,298 | +$2,411,222 |
| Almería | $487,500 | $520,594 | +$33,094 (blower+pump ×1.2) | −$63,792 | −$68,156 |

Dead Sea brine-pump +$28,226 CAPEX (base intensity; case omits region → CAPEX× 1.0, same as minerals packs).

## Verify
1. Hard-refresh https://akarshgopal.github.io/ultimat-sim/
2. Zabuye → Process → brine-pump Economics shows CAPEX; Location campus has a pump pad
3. Add Buffer tank on brine line → fluid class **Brine** · ~$750/m³ (× region if set)
4. Del a block → Ctrl/Cmd+Z restores it; typing in an input does not undo

## Deferred leftovers
- Multi-step undo beyond delete (param edits / moves)
- Pump/blower vendor curves / head–flow
- Density from live stream assay (still param / fluid default)
- Dead Sea explicit `region: 'Levant'` for CAPEX× 0.85 (would also re-rate minerals)
