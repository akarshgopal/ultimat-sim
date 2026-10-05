# MECH9 — Heat & power export / curtailment caps

**Tip:** `b7a9e1a` on `main`
**Tests:** 265 pass
**Pages:** https://akarshgopal.github.io/ultimat-sim/

## Ship
- `params.acceptKWh` on `heat-sink` / `electricity-sink` (blank = unlimited)
- `evaluateSink` for electricity + heat (fan-in mix then scale legs)
- Bus: sinks report requestedInputs/consumed so `allocateElectricity` can export surplus
- Cause: electricity → `curtailment capped`; heat → `export capped` (code `export-capped`)
- Inspector Export / curtailment (or reject) limit fields

## Verify
1. Hard-refresh Pages
2. Palette → Electricity sink on a gen or bus (last priority) → set Export / curtailment ≈ under free kWh → gen supplied drops; Cause shows curtailment capped
3. DAC / Sabatier → waste-heat sink → Export / reject limit ≈ 40% of free → DAC/Sabatier activity drops; Cause shows export capped
4. Blank caps leave stock demos unchanged

## Deferred
- PPA / interconnect annual MWh → daily accept
- Stock demos with explicit export legs
- Heat rejection T_C curves / interconnect CAPEX
