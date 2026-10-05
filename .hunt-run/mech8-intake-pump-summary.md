# MECH8 — Intake pump energy

**Tip:** `dd472ce` on `main`
**Tests:** 258 pass
**Live:** https://akarshgopal.github.io/ultimat-sim/

## What shipped

New Utilities block **Intake pump** (`intake-pump`): liquid in + bus electricity → liquid out (composition pass-through).

- Default screening `pumpKWhPerM3 = 0.4` (~0.2–0.5 open-intake / transfer band).
- Optional `pumpKWhPerKg` for mass-basis brine lift.
- `densityKgM3` default 1025 (dial toward 1000 freshwater / denser brine).
- Power short → pump activity drops → downstream starves; cause chains name electricity / logistics.
- Stock Almería / Zabuye cases unchanged (bit-identical) until you place a pump.

## Why not on `material-source`

SWRO plant SEC 3.5 already includes a literature intake share. Bolting kWh onto every feed would fake ports on air/salt and break legacy graphs. A Factorio-style pump on the pipe is the smaller clear design (see `.hunt-run/mech8-intake-pump-audit.md`).

## Verify

1. Hard-refresh Pages.
2. Zabuye hub → Process: insert **Intake pump** on brine→minerals, wire **power-bus → pump electricity**, set pump energy 0.4 kWh/m³.
3. Cut the pump cable logistics capacity to `0` (or drop bus power) → minerals/Li starve; Cause names the pump / electricity.
4. Almería: same idea on seawater→SWRO; lower SWRO SEC toward ~2.7 if you want to avoid plant-level double-count.

## Deferred

- Auto-split SWRO plant SEC when an upstream pump exists
- Stock demo wiring
- Pump CAPEX / head curves
- Air/flue blowers
