# MECH11 — Wire intake pumps + gas blowers into stock demos

**Tip:**  on 
**Tests:** 278 pass
**Live:** https://akarshgopal.github.io/ultimat-sim/

## What shipped

Stock hubs now show lift energy out of the box:

| Hub | Wiring |
|-----|--------|
| Zabuye / Dead Sea | `brine → brine-pump → minerals` + bus power |
| Almería coastal / Sabatier | `seawater → seawater-pump → SWRO`, `air → air-blower → DAC` |
| Methanol / Mejillones | same seawater pump + air blower |

- SWRO SEC trimmed **3.5 → 3.1** (plant-only; intake share on the pump at 0.4 kWh/m³). Noted in coastal/methanol/sabatier evidence + site notes.
- `size.js`: walk pumps/blowers in `sourceFeeding`; sync lift duties when sizing; include lift kWh in fuel/minerals power estimates; scale brine-pump with abundance.
- `solve.js`: pass-through lift backpressure; converter under-draw when downstream is non-feed-limited; hourly lift setpoints track downstream; heat-sink resync after scale.

## Skips

- Orphan `cases/dac.js` (no bus; CLI-only) — mech10 manual insert still covers it.
- Abundance ASU air blower (goal named DAC path).
- Pump/blower CAPEX / head curves.
- Auto-detect SWRO SEC split when a pump appears (manual 3.1 is enough).

## Verify

1. Hard-refresh Pages.
2. Zabuye Process: brine lake → **Intake pump** → minerals; bus cable to pump. Cut pump cable capacity to `0` → minerals/Li starve.
3. Almería: seawater → intake pump → SWRO; air → gas blower → DAC. SWRO SEC reads 3.1.
4. Methanol: same air blower + seawater pump on the floor.
