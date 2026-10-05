# MECH11 — Wire intake pumps + gas blowers into stock demos

**Base:** `2123a7a` (docs after MECH10 `87fbccb`) on `main`
**Date:** 2026-10-02 (Europe/Berlin)

## Goal

Place MECH8 `intake-pump` and MECH10 `gas-blower` on stock hub graphs so lift energy is visible out of the box — not only after a manual Process-floor insert.

## Audit — which cases to touch

| Demo / hub | Graph source | Liquid lift | Gas lift | Notes |
|------------|--------------|-------------|----------|-------|
| Zabuye | `cases/abundance.js` via `network.siteZabuyeAbundance` | **brine → brine-pump → minerals** | skip ASU air (not in goal) | Density 1200 kg/m³; ~33 kWh @ 0.4 kWh/m³ on 1e5 kg/day |
| Dead Sea | same abundance builder | same | skip | Density 1240 kg/m³ |
| Almería coastal | `cases/sabatier.js` + `coastal.js` wrap | **seawater → seawater-pump → swro** | **air → air-blower → dac** | Intake 0.1 m³ → 0.04 kWh pump (tiny). Blower on 25 t air ~19 kWh (~11% of day-0 PV) |
| Methanol / Mejillones | `cases/methanol.js` | same seawater pump | same air blower | Own graph (not sabatier clone) |
| Orphan `cases/dac.js` | CLI-only, no bus | — | **skip** | No electrical-bus; mech10 already covers manual insert. Document skip. |
| Network wrapper | `cases/network.js` | inherits abundance | — | Notes only; solarKWp follows power stream |

## SEC double-count (SWRO)

Plant SEC default **3.5** kWh/m³ includes literature intake share (MECH8 audit). With an explicit intake-pump @ **0.4** kWh/m³, trim SWRO default / case params to **3.1** (plant-only = 3.5 − 0.4). Note in coastal / methanol / sabatier summaries. Not auto-detect.

## Power / sizing

- Abundance `powerKWh` += brine m³ × 0.4; network solarKWp tracks that stream.
- Sabatier / methanol day-target kWh/kg += pump (feed m³) + blower (Nm³); coastal hardcoded `* 3.5` → `* 3.1` + lift terms.
- `size.js` `sourceFeeding`: walk through `intake-pump` / `gas-blower` so feed-port walks still find the assay source.
- `applyAbundanceScale` minerals-only / +halogens power rewrite: add brine-pump kWh.
- Pump/blower **capacity** set huge so scale-up is feed/power limited, not capacity-capped.

## Brittle tests to update honestly

- mech1 / mech4: `brine → minerals` edge → `brine → brine-pump` (logistics / cause labels).
- mech8: “bit-identical without pumps” → expect pumps present; starve test uses stock pump cable.
- mech10: methanol “without blowers” → expect blower present.

## Skips

- Orphan DAC case (no bus).
- Abundance ASU air blower (goal names DAC path).
- Pump/blower CAPEX (still deferred).
- Auto-split SWRO SEC when pump detected (manual 3.1 is enough).

## Ship checklist

1. Wire abundance / sabatier / methanol (+ coastal notes + target formula)
2. size.js sourceFeeding + abundance scale power
3. Update mech1/4/8/10 + add mech11 smoke tests
4. npm test → push main → Pages
