# Design: sun-tolerant Haber-Bosch ammonia loop (+ PSA nitrogen)

Status: concept design + build plan. Model: `engine/designs/haber-bosch.js` (tested in `tests/design-haber-bosch.test.js`). It replaces two flowsheet units, `ammonia` (the synthesis loop) and `asu` (nitrogen supply). Costs are screening estimates: a bill of materials at 2024–25 commodity prices (`data/bom.js`) times explicit manufacturing factors, plus bought-in items. Every number below regenerates from the module and the company simulator. Unless stated otherwise, sizes are at the green-ammonia recipe's reference output, **1,000 kg NH₃/day**.

## Why this unit

The recipe basis is $1,900 (loop) + $313 (ASU) per kg NH₃/day and 0.6 + 0.206 kWh/kg: a *small-plant* price in which almost nothing is steel. The engine scales it with a 0.85 exponent and a 0.4 floor, so a world-scale plant still pays $760/kg/day for the loop. At today's PV with the lean electrolyzer, green ammonia (200 Mt/yr) costs $1.07/kg against $0.45, and the `ammonia` unit is its largest item after energy ($0.39/kg). Recipe loops are also baseload, so a solar plant firms them with batteries and an H₂ buffer.

## Requirements

| Requirement | Target | Why |
|---|---|---|
| Operating profile | Follow PV: start each morning, ~7 full-load h/day, hold hot and pressurized overnight | With a cheap loop, ~3.5× oversizing costs less than a battery plus an H₂ buffer |
| Turndown / ramp | Autothermal down to 20% of nameplate; ramp ≥ 5%/min | Sets the makeup-gas buffer at 7.6 min instead of hours of H₂ storage |
| Installed cost | ≤ $160 per kg NH₃/day at 1 t/day; ≤ $30 at 100 t/day (loop + N₂) | Below this the loop is < $0.10/kg even when oversized |
| Energy | ≤ 1.0 kWh/kg NH₃ including H₂ compression from 1 atm and N₂ | ~2% of the electrolyzer's 9.2 kWh/kg NH₃ |
| H₂ yield | ≥ 99.5% (purge membrane, H₂ deoxo) | Each 1% of H₂ lost costs ~0.09 kWh/kg NH₃ of electrolysis |
| N₂ supply | PSA, 99.5% + catalytic deoxo with loop H₂; starts in minutes | A cryogenic cold box cannot start and stop every day |
| Catalyst | Abundant (fused iron); O₂/H₂O < 10 ppm | Ru at ~0.3 kg per t/day does not scale to 200 Mt/yr |

## Model results

### Today vs lean (per kg NH₃/day at 1 t/day)

| | Today: small e-NH₃ loop, custom-engineered | Lean solar-matched target |
|---|---|---|
| Loop | 150 bar, Fe, separator −5 °C, recip compressors, H₂ fed at 30 bar | 150 bar, Fe, separator −20 °C, factory skid, H₂ fed at 1.05 bar (atmospheric electrolyzer) |
| Installed (loop + N₂) | **$1,855** ($1,643 + $212) | **$158** ($142 + $16) |
| vs recipe ($1,900 + $313) | 0.86× / 0.68× | 0.075× / 0.050× |
| Raw materials | $14.5 | $5.1 |
| Idiot index | 128× | 31× (8.3× at 100 t/day) |
| Energy, kWh/kg NH₃ | 0.92 (loop 0.59, PSA 0.33) | 1.01 (loop 0.86, PSA 0.16) |
| Energy vs recipe (0.6 / 0.206) | 0.98× / 1.59× | 1.43× / 0.76× |
| NH₃ in → out of converter | 2.35% → 15.9% (equilibrium 18.3%) | 1.27% → 14.8% (equilibrium 17.2%) |
| Recycle, mol per mol NH₃ | 8.5 | 8.5 |
| Refrigeration COP | 2.19 | 1.65 |
| Converter wall | 18.8 mm (Ø 0.28 m) | 18.7 mm |
| H₂ lost (purge + deoxo) | 2.5 g/kg NH₃ | 1.0 g/kg |
| Operation | baseload (turndown 50%, 1%/min) | **sun-following** (turndown 20%, 5%/min, 7.6 min buffer) |
| `simulatorOverride` (capex / energy / materials factor) | `ammonia` 0.865 / 0.981 / 0.0057; `asu` 0.679 / 1.59 / 0.0117 | `ammonia` 0.0749 / 1.43 / 0.0022; `asu` 0.0503 / 0.759 / 0.0031 |

The lean loop uses *more* kWh per kg than the recipe because it compresses H₂ from 1.05 bar (0.57 kWh/kg) where today's pressurized stacks deliver it at 30 bar (0.29 kWh/kg). The energy moved from the electrolyzer to the loop; at frontier PV it is worth < $0.01/kg.

Where today's $1,855 goes: instruments and safety systems $350, engineering $300, assembly labour $180, HP valves $90, makeup and PSA air compressors $82, piping $41, PSA controls $40. All fabricated process equipment (converter, separator, exchangers, air coolers, chiller) is ~$27. A 1 t/day loop is a control system with a small reactor attached. Cost-down path, in order of size: **standard design reused (no per-plant engineering) → mass-produced instruments/SIS → factory skid assembly (≈ 255 h, not 3,000) → mass-produced compressors (10×, not 40× steel) → 99.5% PSA + H₂ deoxo instead of 99.999% PSA.**

### Scale

| NH₃ kg/day | Today $/kg/day | Today II | Lean $/kg/day | Lean II | Recipe × engine scale |
|---|---|---|---|---|---|
| 1,000 (reference) | 1,855 | 128 | 158 | 31 | 2,213 |
| 10,000 | 555 | 58 | 56.5 | 14 | 1,567 |
| 100,000 (scoreboard size) | 230 | 33 | 28.0 | 8.3 | 1,109 |
| 1,000,000 | 137 | 24 | 19.2 | 6.5 | 885 |
| 3,000,000 (world scale) | 118 | 22 | 17.4 | 6.2 | 885 |

Fixed per-plant costs (instruments, engineering) make the model fall much faster with size than the engine's 0.85 exponent with its 0.4 floor, so a factor quoted at 1 t/day understates the design at the scoreboard's 100 t/day. `simulatorOverride(params, { sizeKgPerDay: 100000 })` gives the like-for-like factor there: lean `ammonia` 0.026, `asu` 0.021. At 100 t/day the largest lean lines are instruments ($3.8), piping ($2.8), the makeup compressor ($2.0) and labour ($1.6).

### Loop pressure and catalyst (lean, 100 t/day; $/kg/day · kWh/kg · recycle)

| Pressure, bar | 40 | 50 | 70 | 100 | 150 | 200 | 250 |
|---|---|---|---|---|---|---|---|
| Fe | 78.6 · 1.93 · 86 | 42.5 · 1.26 · 34 | 32.2 · 1.09 · 18 | 29.3 · 1.07 · 12 | **28.0 · 1.01 · 8.5** | 27.8 · 0.98 · 7.0 | 28.2 · 0.97 · 6.2 |
| Ru | 62.5 · 1.15 · 22 | 47.1 · 1.06 · 15 | 37.4 · 1.03 · 10 | 32.8 · 1.01 · 7.6 | 29.9 · 0.94 · 6.0 | 29.3 · 0.94 · 5.2 | 29.5 · 0.94 · 4.7 |
| Sorbent separation (Fe): $/kg/day · kWh/kg | 45.2 (30 bar) · 1.59 | 36.0 · 1.39 | 35.0 · 1.37 | 36.9 · 1.38 | 43.1 · 1.41 | | |

- **Low pressure does not pay with condensation.** Below ~100 bar the equilibrium NH₃ approaches what the chilled separator leaves in the recycle, so recycle, refrigeration and catalyst volume blow up while makeup compression falls only with ln P. Above ~130 bar the optimum is flat (levelized loop cost at $0.046/kWh within ±4% from 150 to 250 bar).
- **Ru helps only below ~70 bar.** It is ~3× as active per volume and runs 50 K cooler, raising outlet equilibrium; at 150 bar its metal ($4.35/kg/day, 0.29 kg Ru per t/day) cancels the savings.
- **Sorbent separation** (supported metal halides) is the only route to a good loop at 50–70 bar but is not better on these numbers: regeneration heat beyond the recovered reaction heat is electric. Worth a bench test, not the baseline.
- Vessel steel is nearly pressure-independent per kg of gas held (V ∝ 1/P, wall ∝ P). Pressure costs show up in compressors, valve class and piping.

### Sun-following vs baseload

Green-ammonia $/kg at the best site, 100 t/day plants, with `flexible` set through the override. Today's PV uses the lean electrolyzer; the frontier (PV capex and floor ÷10, idiot-index target 1.5 with `Bom.floors()`) has every other design at its lean preset.

| Design | Mode | Today's PV ($758/kWp) | Frontier |
|---|---|---|---|
| Recipe | baseload | $1.07 | $0.184 |
| Today preset | **baseload** | **$1.01** | $0.161 |
| Today preset | sun-following | $1.73 | $0.160 |
| Lean preset | baseload | $0.68 | $0.160 |
| Lean preset | **sun-following** | **$0.64** | **$0.148** |
| Lean, factor at 100 t/day | baseload / **sun-following** | $0.66 / **$0.57** | $0.160 / **$0.149** |

- **Today's loop must be baseload at today's PV.** At $1,600+/kg/day, oversizing it ~3× costs far more than the 62 MWh battery and 12.7 t H₂ buffer ($29M of storage) that firm a 100 t/day plant.
- **The lean loop wins sun-following in both scenarios.** Sun-following removes the battery (50 MWh) and H₂ buffer (10.3 t); the engine oversizes the loop and PSA ~3.4–3.5× on ~7 full-load h/day. The crossover is roughly loop + N₂ capex < (battery + buffer) ÷ (nameplate factor − 1), which the lean design clears and today's does not.
- At the frontier every designed loop is squeezed to 1.5× its own materials, so even today's preset gains from sun-following; the remaining difference is kWh/kg.
- Sun-following hardware is cheap: a 5 kW/t·day hold-hot heater, VFDs and the 7.6-minute makeup-gas buffer add $2.4/kg/day (1.5%); hot standby costs 0.004 kWh/kg. The hard part is catalyst life under daily thermal cycling and ramp control, not capex.

### Abundance scoreboard

`abundanceScoreboard` (sizeMultiple 100, best site). Cell: status, $/kg (top items).

| Scenario | Ammonia (200 Mt, $0.45) | Urea (213 Mt, $0.40) | Feasible share |
|---|---|---|---|
| Today, recipe | blocked $1.42 (energy 0.63, ammonia 0.55, electrolyzer 0.16) | blocked $0.70 (`urea`: bought NH₃ 0.30, urea unit 0.22) | 39.5% |
| Today, lean loop only | blocked $0.98 (energy 0.54, electrolyzer 0.35, ammonia 0.09) | blocked $0.70 (unchanged) | 39.5% |
| Today, lean electrolyzer | blocked $1.07 (energy 0.62, ammonia 0.39) | blocked $0.70 | 39.5% |
| Today, lean electrolyzer + loop | blocked **$0.64** (energy 0.53, ammonia 0.10) | blocked $0.70 | 39.5% |
| Frontier, recipes | abundant $0.195 (energy 0.16, other 0.07, ammonia 0.03) | feasible $0.265 | 60.6% |
| Frontier, every lean design except this | abundant $0.184 (ammonia 0.03) | abundant $0.135 | 93.6% |
| Frontier, every lean design | abundant **$0.148** (energy 0.15, other 0.07, ammonia 0.008) | abundant $0.116 | 93.6% |

- **At today's PV no loop makes green ammonia feasible**: electricity alone is $0.53/kg against $0.45. The lean loop removes the equipment blocker ($0.39 → $0.10), so ammonia becomes purely an energy problem.
- **At the frontier ammonia is abundant even on the recipe**, because the idiot-index squeeze already caps the recipe loop at its class floor. The lean loop takes it from $0.184 to $0.148/kg; what remains is energy and other O&M.
- Urea's cost is set by its own pathway (see `docs/designs/urea.md`), not by ammonia.

## Architecture

1. **Makeup compression.** H₂ arrives at ~1.05 bar from the atmospheric electrolyzer and N₂ at 7 bar from the PSA. A multistage intercooled compressor (isothermal efficiency 0.70) on a VFD takes them to 150 bar: ~25 kW at 1 t/day, ~2.5 MW at 100 t/day. It is the largest energy user (0.57 kWh/kg) and the largest machine.
2. **Converter.** Fused-iron catalyst, two to three adiabatic beds with an internal interbed exchanger; inlet 370 °C, outlet 450 °C, approach 85% of equilibrium. GHSV 15,000 h⁻¹ at 150 bar: 0.031 m³ catalyst per t/day. 2¼Cr-1Mo hot-wall shell, 18.7 mm at Ø 0.28 m for 1 t/day (ASME VIII thin wall, S = 130 MPa).
3. **Heat integration.** Feed–effluent exchanger (57 kW, 2.5 m² per t/day, compact plate-fin/PCHE) preheats the recycle. The remaining reaction heat and all compression heat go to air coolers at a 40 °C desert site (no cooling water), 66 kW per t/day. No steam system at these scales.
4. **Separation.** After the air cooler, a gas–gas cold exchanger (ε 0.8) recovers separator cold. An NH₃ vapour-compression chiller (COP 1.65) takes the gas to −20 °C, leaving 1.27% NH₃ in the recycle. Liquid NH₃ is let down to storage.
5. **Recycle and purge.** Recycle compressor (5 bar loop ΔP, 0.8 kW per t/day). Inerts (Ar from PSA N₂) are held at 8% of the loop; a small membrane on the purge returns 90% of its H₂.
6. **Nitrogen (`asu`).** Two-bed carbon-molecular-sieve PSA at 8 bar: 2.3 Nm³ air per Nm³ N₂ at 99.5%, 0.25 Nm³/h per kg sieve. Residual O₂ (0.5%) is burned with loop H₂ over a Pd deoxo bed and dried. 0.16 kWh/kg NH₃; starts in minutes.
7. **Sun-following operation.**
   - *Mornings:* electrolyzer H₂ rises and the loop follows at ≤ 5%/min.
   - *Clouds:* a makeup-gas buffer (7.6 min of nameplate makeup gas at loop pressure, 50% swing) absorbs a 60% PV step at that ramp rate and holds the loop at 20% through a 20-minute cloud.
   - *Below 20% load:* compressors stop, the loop is held at pressure, and a 5 kW/t·day heater keeps the beds above light-off (~350 °C for Fe) overnight (0.004 kWh/kg).
   - *Controls:* converter inlet temperature and interbed bypasses tuned for 20–100% load; NH₃ product flow is the slowest variable.
8. **Modularity.** A factory-built skid from one standard design, so there is no per-plant engineering. 1–10 t/day skids are numbered up; larger plants scale the same design. Per-plant instruments and engineering fall from $80 to ~$5 per kg/day from 1 to 100 t/day.

## Bill of materials (lean design, per kg NH₃/day at 1 t/day)

| Part | Unit | Material | kg | Materials $ | Mfg × | $ |
|---|---|---|---|---|---|---|
| Instruments, PLC/SIS, gas detection (bought) | ammonia | — | — | — | — | 60.00 |
| Engineering, HAZOP, permits (standard design) | ammonia | — | — | — | — | 20.00 |
| HP valves (bought) | ammonia | — | — | — | — | 15.00 |
| Assembly labour (255 h) | ammonia | — | — | — | — | 10.20 |
| PSA valves, O₂ analyser, deoxo, controls | asu | — | — | — | — | 8.00 |
| Makeup compressor (25 kW) | ammonia | steel | 0.615 | 0.40 | 10 | 4.00 |
| Piping, fittings | ammonia | stainless | 0.438 | 0.88 | 4 | 3.51 |
| Skid / structure | ammonia | steel | 1.20 | 0.78 | 2.5 | 1.95 |
| Assembly labour | asu | — | — | — | — | 1.80 |
| Air coolers (66 kW) | ammonia | steel + Al | 0.495 | 0.50 | 3 | 1.49 |
| PSA air compressor (6.6 kW) | asu | steel | 0.199 | 0.13 | 10 | 1.29 |
| Chiller package (12 kW cooling) | ammonia | steel + Cu | 0.107 | 0.15 | 8 | 1.22 |
| Foundations | both | concrete | 8.0 | 0.80 | 1.5 | 1.20 |
| Makeup-gas ramp buffer (0.22 m³) | ammonia | steel | 0.426 | 0.28 | 4 | 1.11 |
| Fe catalyst charge (87 kg) | ammonia | — | — | 0.01 | — | 1.04 |
| Drives (VFD) | ammonia | — | — | — | — | 1.03 |
| Adsorber vessels + receivers | asu | steel | 0.393 | 0.26 | 4 | 1.02 |
| Carbon molecular sieve (110 kg) | asu | activated carbon | 0.110 | 0.17 | 4 | 0.66 |
| Motors | ammonia | copper | 0.021 | 0.19 | 3 | 0.57 |
| Converter shell (Cr-Mo) | ammonia | steel | 0.127 | 0.08 | 6 | 0.49 |
| Skid / structure | asu | steel | 0.30 | 0.20 | 2.5 | 0.49 |
| Feed–effluent exchanger | ammonia | stainless | 0.038 | 0.08 | 5 | 0.38 |
| Converter internals | ammonia | stainless | 0.038 | 0.08 | 4 | 0.30 |
| Recycle compressor, PSA motor/dryer, heater, separator, cold exchanger | — | — | — | — | — | 0.71 |
| **Equipment** | | | | **5.1** | | **137.5** |
| **Installed (× 1.15)** | | | | | | **158.1** |

At 1 t/day, 85% of the lean cost is bought-in instruments, valves, engineering and labour, which carry no commodity floor; hence the idiot index of 31× here and 8.3× at 100 t/day.

## Build plan

| Phase | What | Scale | Duration | Indicative budget | Exit criteria |
|---|---|---|---|---|---|
| 0. Bench | Fe (and Ru, sorbent) catalyst in a 10–50 g tubular reactor at 50–150 bar; replay PVGIS solar days (0 → 100 → 0% load, hold-hot nights); activity vs cycle count; PSA + deoxo on a lab skid | < 1 kg NH₃/day | 4 months | ~$150k | Activity loss < 5% after 300 simulated sun-days; light-off and re-ignition reproducible from 350 °C hot standby; N₂ O₂ < 5 ppm after deoxo |
| 1. Loop pilot on real PV | 50–100 kg/day skid: 150 bar Fe converter, chiller, recip/diaphragm makeup compressor on VFD, 5–10 min buffer; fed by a ~50 kW electrolyzer on PV | 50–100 kg/day | 9 months | ~$1.5M | Follows a real PV day at ≥ 5%/min with ≤ 10 min buffer; autothermal down to 20%; measured kWh/kg within 15% of the model; no unplanned trips over 100 sun-days |
| 2. Product prototype | 1 t/day factory-built skid (loop + PSA), standard SIS/PLC package, assembled in < 400 h | 1 t/day | 12 months | ~$2–3M (first unit), target ≤ $300k by unit 5 | Installed ≤ $300 per kg/day by the fifth unit (trend to $160); ≥ 2,500 full-load h/yr on solar alone; catalyst life projection ≥ 10 years |
| 3. Product | 10 t/day standard module, numbered up to 100+ t/day plants; compressors bought as a mass-produced class | 10–100 t/day | — | — | Installed ≤ $60 per kg/day at 10 t/day and ≤ $30 at 100 t/day; green NH₃ ≤ $0.30/kg at 10× cheaper PV |

Instrument everything for model feedback: bed temperature profiles, NH₃ at converter in and out (IR), H₂/N₂ ratio, purge composition, compressor kW per stage, chiller COP, and every start/stop with its thermal history. Measured values go back into `engine/designs/haber-bosch.js` DEFAULTS.

## Risks and open questions

- **Catalyst life under daily cycling.** Fused iron is proven at steady state for 10–15 years; daily load swings, no-flow hot standby and re-reduction after oxygen ingress are not. This is the main technical risk and the reason for Phase 0.
- **Low-load stability.** Below ~20–30% load an autothermal converter can lose ignition. Conventional loops turn down to 40–60%; 20% is aggressive. The model makes flexibility cheap in capex; the controls must make it real.
- **Thermal fatigue.** The loop stays pressurized overnight, but daily thermal cycles on a hot-wall Cr-Mo shell and compact exchangers (~9,000 cycles over 25 years) need a fatigue assessment; the model does not knock down allowable stress.
- **Bought-in costs dominate at small scale.** $60 instruments and $20 engineering per kg/day at 1 t/day are targets, not quotes; they need a standard design certified once and a mass-produced safety system. The today preset ($350 and $300) is what one-off projects pay.
- **Compressor cost class.** Lean assumes mass-produced industrial compressors (10× steel) against 40× for small API-618 reciprocating machines. H₂ service (seals, embrittlement) may not reach that.
- **Screening thermodynamics.** Ideal-gas Gillespie–Beattie equilibrium (conservative by ~10–20% at 150 bar), NIST Antoine vapour pressure without high-pressure enhancement, single-number approach and GHSV.
- **H₂ purity.** O₂ from a cycling electrolyzer (crossover at low load) poisons the catalyst. A deoxo and dryer on the H₂ feed is assumed inside the instrument/valve budget.

## Engine and design changes recommended (open)

1. **Pass `minTurndown`.** The engine takes a per-unit firmed turndown; this design's baseload variant should pass its own floor (0.2 lean, 0.5 today) so a firmed loop needs less battery.
2. **Per-design scale law.** `scaleFactor` applies one exponent (0.85, floor 0.4) to every process unit, while this design falls ~3× per decade from 1 to 10 t/day and keeps falling past the floor. Allow `designs.units.<unit>.scaleExponent` / `scaleFloor`, or a size → factor table. Until then, `simulatorOverride(params, { sizeKgPerDay })` gives the factor at the size of interest.
3. **Buffers only flow flexible → baseload.** If the loop were flexible and the ASU baseload (or the reverse), the N₂ buffer would be missing. This design sets both units' `flexible` together; the engine could warn when connected units are split.
4. **Oversizing is linear.** `flexDesign` multiplies equipment capex by the nameplate factor (~3.5×); with economies of scale the flexible penalty is overstated by roughly 3.5^0.15 ≈ 20% for the loop.
