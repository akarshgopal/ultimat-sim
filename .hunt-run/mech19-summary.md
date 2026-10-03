# MECH19 — Multi-step undo · pump head→SEC · assay tank density · Levant CAPEX×

**Feat tip:** `dc8faae`
**Pages:** pending
**Tests:** 341 pass
**Date:** 2026-10-03 CEST
**Base:** `4b3bc88` (`docs(mech18): record tip SHA 1cdc770`)

## Shipped

### 1 Multi-step undo
- Ctrl/Cmd+Z still restores Delete of a node or edge
- Also undoes node moves (drag end, or arrow-nudge as one gesture) and inspector edits (setpoint, parameters, economics)
- Slider `input` ticks share one snapshot; stack max stays 20
- Ignored while focus is in INPUT/TEXTAREA/SELECT
- Delete button uses the same undo path
- Place-node / connect-edge undo not added

### 2 Pump head → SEC (screening)
- Optional `headM` and `pumpEta` (default 0.7)
- `kWh/m³ = ρ·g·H / (η·3.6e6)` when head is set
- `pumpSecOverride` (set by the kWh/m³ slider) keeps an explicit SEC
- Head unset stays on `pumpKWhPerM3` (default 0.4) — stock demos bit-identical
- No part-load curve and no gas-blower curve this tranche

### 3 Live assay density for tanks
- Brine/seawater buffers use `site.assay` / `brineAssay` `density_kg_per_L × 1000`, or `SiteAssays.getAssay(assayId)`, unless `densityOverride`
- Dead Sea and Zabuye site assays carry the pump's assay density (Dead Sea 1.24 → 1240 kg/m³)
- Inspector status-meta names the density source (site assay / override / fluid default)
- Freshwater stays on the fluid-class default

### 4 Dead Sea Levant CAPEX×
- `createAbundanceCase({ region: 'Levant' })` and `site.region = 'Levant'`
- Minerals, chemicals, and brine-pump CAPEX × 0.85
- Solar PV is still sized without the process-plant multiplier (IRENA overlay path unchanged)
- Prices/power stay on me-levant (same as the previous implicit demand region)

## Cash deltas

| Site | CAPEX before | CAPEX after | Annual net cash before | After |
|------|-------------:|------------:|-----------------------:|------:|
| Zabuye | $1,872,329 | $1,872,329 | +$2,411,222 | +$2,411,222 |
| Dead Sea | $3,100,128 | $2,818,579 | +$92,300 | +$132,196 |

Dead Sea before is the same solar hub with regionalized packs put back to ×1.0 (solar unchanged). CAPEX −$281,549. NPV about $0.91M → $1.30M. Pump SEC unchanged (head unset, 0.4 kWh/m³).

## Verify
1. Hard-refresh https://akarshgopal.github.io/ultimat-sim/
2. Nudge or drag a block, edit a slider, then Ctrl/Cmd+Z — one step per gesture; typing in a field does not undo
3. Intake pump → set Static head; status line shows derived kWh/m³; moving Pump energy overrides it
4. Dead Sea hub → add a buffer, set fluid Brine (or connect a brine line and select the tank) → density ~1,240 kg/m³ (site assay)
5. Dead Sea brine-pump Economics intensity is $297.5/(m³/day) (350 × 0.85), not $350

## Deferred
- Undo for placing a block or connecting an edge
- Pump part-load curve and gas-blower ΔP → SEC
- Density from an upstream stream that does not carry `density_kg_per_L` (no invented ρ)
