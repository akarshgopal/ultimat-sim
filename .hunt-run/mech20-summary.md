# MECH20 — Undo place/connect · pump part-load · blower ΔP · assay density fallback

**Feat tip:** `1b74f65`
**Pages:** deploy after this note
**Tests:** 347 pass
**Date:** 2026-10-04 CEST
**Base:** `3e67381` (`docs(mech19): mark Pages live`)

## Shipped

### 1 Undo for add-block and connect-edge
- Ctrl/Cmd+Z still undoes delete, drag, arrow-nudge (one gesture), and inspector edits
- Placing a block (palette / `addNode`, not silent boundary fill) pushes one `add-node` entry
- A successful port-to-port connect pushes one `add-edge` entry; the first click and a rejected connect do not
- Ignored while focus is in INPUT/TEXTAREA/SELECT/contenteditable
- Stack max stays 20; slider ticks and arrow nudges still share one snapshot
- Clearing the factory or loading a case clears the stack so undo cannot resurrect the previous graph

### 2 Pump part-load and blower ΔP (screening)
- Optional `partLoadK` on intake-pump: SEC × (1 + k(1−Q/Qrated)²) with Q = min(setpoint, rated). k unset → ×1
- At Q ≥ Qrated the multiplier is 1 even when k is set
- Optional gas-blower `deltaP_kPa` and `blowerEta` (default 0.7): kWh/Nm³ = ΔP_kPa / (η·3600)
- ΔP unset keeps `blowerKWhPerNm3` (default 0.001). The kWh/Nm³ slider sets `blowerSecOverride`, same pattern as pump head
- Inspector status lines name the basis. Not a vendor pump map or fan curve

### 3 Density when the assay has no `density_kg_per_L`
- Brine/seawater tanks still prefer assay `density_kg_per_L` (site bag or assay library)
- Else salinity / TDS in 0–42 g/kg (`salinity_g_per_kg`, `salinity_psu`, `tds_g_per_kg`, or `tds_mg_per_kg` ÷ 1000) uses UNESCO EOS-80 at 25 °C, 1 atm. S=35 → about 1023.34 kg/m³. Source label: `salinity estimate (UNESCO 25 °C)`
- Salinity outside that fit does not extrapolate. Source label: `fluid default (assay salinity outside UNESCO 0–42 g/kg fit)` and ρ stays on the fluid-class tea default (brine 1200, seawater 1025)
- No salinity and no density stays `fluid default`
- Economics status-meta shows that source. `tds_mg_per_L` is not converted (needs a density)

## Cash deltas

| Site | CAPEX | Annual net cash | Pump SEC |
|------|------:|----------------:|---------:|
| Zabuye | $1,872,329 | +$2,411,222 | 0.4 kWh/m³ |
| Dead Sea | $2,818,579 | +$132,196 | 0.4 kWh/m³ |

Same as MECH19. New pump/blower knobs are unset on stock demos, and stock assays already carry `density_kg_per_L`.

## Verify
1. Hard-refresh https://akarshgopal.github.io/ultimat-sim/
2. Place a block, connect two ports, then Ctrl/Cmd+Z twice — edge goes, then the second block. Typing in a field does not undo
3. Intake pump → set Part-load shape and a setpoint below capacity; electricity rises vs k unset. At rated flow it does not
4. Gas blower → set Pressure rise; status line shows derived kWh/Nm³. Clear it and SEC returns to the slider
5. Dead Sea hub → buffer, fluid Brine, still ~1,240 kg/m³ (assay density). A brine assay with salinity and no density stays on the fluid default and says so

## Deferred
- Redo
- Undo of “Add sources & sinks” as one gesture (those adds stay silent)
- Vendor pump/fan curves, or part-load solved against the electricity limit (screening uses planned Q/Qrated)
- Density from `tds_mg_per_L` without a measured ρ
