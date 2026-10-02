# MECH10 — Air / flue gas blower

**Tip:** (pending push)
**Tests:** 272 pass (+7 MECH10)
**Pages:** https://akarshgopal.github.io/ultimat-sim/

## Ship
- `gas-blower` converter: gas in + electricity → gas out (pass-through)
- Default `blowerKWhPerNm3: 0.001` (1 kWh / 1000 Nm³); optional `blowerKWhPerKg`
- Utilities palette **Gas blower**; pipe building profile
- Starve when power short; cause chains via existing `limitedBy: electricity`
- Stock demos bit-identical until a blower is placed

## Verify
1. Hard-refresh Pages
2. Methanol or blank canvas → Ambient air → Gas blower → bus power → DAC (or sink)
3. Set blower cable capacity to `0` → downstream DAC/sink starves; Cause names electricity / air-blower
4. Leave demos without a blower — unchanged

## Deferred
- Auto-reduce DAC/ASU electricity when upstream blower present
- Wire blowers into stock methanol / abundance demos
- Blower CAPEX / fan curves
- Flue-specific denser / hotter defaults
