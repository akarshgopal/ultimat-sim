# Design: solar-matched direct air capture (DAC) unit

Status: concept design + build plan. Model: `engine/designs/dac.js` (tested in `tests/design-dac.test.js`). It replaces three flowsheet units: `dac-solid` (e-methanol `methanol`, coastal e-methane `coastal`, CO₂ supply `dac-co2`), `dac` (e-methane `sabatier`) and the `gas-blower` that feeds them air. Costs are screening estimates: a bill of materials at 2024–25 commodity prices (`data/bom.js`) times explicit manufacturing factors. Every number below regenerates from the model and the company simulator.

## Why this unit

At the frontier (PV capex and floor ÷10, idiot-index target 1.5 with `Bom.floors()`, every other design at its lean preset), DAC is what still blocks the e-fuels: e-methanol costs $0.67/kg against $0.40 (1.67×) and e-methane $1.35/kg against $1.00 (1.35×). The DAC lines are the blower ($0.13/kg methanol, $0.25/kg methane), sorbent makeup ($0.06, $0.11) and the DAC unit ($0.05, $0.10), plus the pack's $0.05/kg CO₂ variable O&M inside "other". The recipes also charge 3.34 kWh per kg CO₂: 0.50 kWh_e for the unit, 1.50 kWh_th of regeneration heat and 1.34 kWh_e for a generic 3.6 kPa process blower. Purchased CO₂ ($0.05/kg) also feeds urea, FT diesel and MTO ethylene; a cheap DAC supplies them through the `dac-co2` recipe.

## What the recipe assumes (per kg CO₂)

| | Recipe basis | Source |
|---|---|---|
| DAC unit capex | $800 per kg CO₂/day | `data/tea-screening.js` packs.dac ($2,200 per t/yr, IEA/NASEM family) |
| Unit electricity | 0.50 kWh/kg | node kWh ÷ CO₂ edge |
| Regeneration heat | 1.50 kWh_th/kg, priced as 1.50 PV kWh | pathway `heatKWhPerKg` ÷ CO₂ edge |
| Air blower | $2,008 per kg CO₂/day, 1.34 kWh/kg | packs['gas-blower'] $1.5/(Nm³/day) and 0.001 kWh/Nm³ × 1,339 Nm³ air/kg CO₂ |
| Sorbent makeup | 0.02 kg/kg at $2/kg = $0.04/kg | `consumables` feed |
| Variable O&M | $0.05/kg | packs.dac variableOm |

The flowsheets are sized to 1 t/day (`scripts/build-pathways.mjs` with `engine/size.js`), so each DAC node equals the pack. The test checks this basis against `data/pathways.js`.

## Requirements

| Requirement | Target | Why |
|---|---|---|
| Operating profile | Sun-following with daily cold start and stop; beds cycle only while PV runs | Oversizing contactors is cheaper than batteries. A 39-min cycle leaves no bed half-loaded overnight |
| Installed cost | ≤ $30 per kg CO₂/day (≈ $80 per t/yr) | DAC then drops out of the top cost lines of both e-fuels at the frontier |
| Energy | ≤ 1.0 PV kWh/kg CO₂: fan ≤ 0.1, vacuum + aux ≤ 0.07, heat ≤ 1.9 kWh_th from a heat pump at COP ≥ 2 | Recipe is 3.34 |
| Product | CO₂ ≥ 95% dry at ~1 atm, delivered to the synthesis unit's compressor | Methanol/Sabatier units compress to their own loop pressure |
| Sorbent | ≥ 20,000 cycles (≈ 4.4 yr at 12 cycles/day), ≤ $8/kg | Makeup ≤ $0.01/kg CO₂ |
| Delivered CO₂ at frontier PV | ≤ $0.05/kg | The simulator's purchased CO₂ price; below it `dac-co2` wins make-vs-buy |

## Model results

Basis: 25 °C, 420 ppm. Costs per kg CO₂/day of 24 h nameplate (the simulator's basis). Levelized $/kg from `lcoc()` at Walvis Bay, sun-following PV sizing from `engine/utilization.js`, 8%, 20 yr.

| | Today: amine-on-silica TVSA, resistive heat | Lean solar-matched target |
|---|---|---|
| Installed | **$714 per kg CO₂/day** ($1,955 per t/yr) | **$30.1 per kg CO₂/day** ($82 per t/yr) |
| of which fans | $2.5 | $0.75 |
| Raw materials (incl. sorbent floor) | $23.3 | $6.7 |
| Idiot index | 30.6× | 4.5× |
| Energy, PV kWh/kg CO₂ | 2.48 | **1.03** |
| fan / vacuum + aux / regeneration | 0.16 / 0.15 / 2.17 | 0.10 / 0.07 / 0.86 |
| Regeneration heat, kWh_th/kg | 2.17 (COP 1) | 1.81 (heat pump COP 2.1) |
| reaction / sensible sorbent / hardware / water / purge steam | 0.47 / 0.63 / 0.05 / 0.69 / 0.13 | 0.44 / 0.55 / 0.04 / 0.28 / 0.51 |
| Air: face velocity, capture, bed depth, ΔP | 1.0 m/s, 80%, 46 cm, 175 Pa | 2.5 m/s, 85%, 49 cm, 134 Pa |
| Air per kg CO₂ | 1,650 m³ | 1,560 m³ |
| Cycle: adsorb / desorb / cool | 152 / 60 / 30 min (2 cycles/sun-day) | 19 / 10 / 10 min (12 cycles/sun-day) |
| Contactor face per kg CO₂/day | 305 cm² | 148 cm² |
| Sorbent inventory per kg CO₂/day | 4.2 kg at $50/kg | 0.51 kg at $8/kg |
| Sorbent replacement | $0.25/kg CO₂ (5,000 cycles) | $0.0076/kg CO₂ (20,000 cycles) |
| Chamber steel per t/yr | 43 kg (doors 350 kg/m² face) | 10 kg (doors 185 kg/m² face) |
| CO₂ on sunlight, PV $758/kWp | $1.17/kg (unit $0.74, PV $0.18, sorbent $0.25) | $0.094/kg (unit $0.035, PV $0.051, sorbent $0.008) |
| CO₂ on sunlight, PV $76/kWp | $0.95/kg | **$0.044/kg** (unit $0.029, PV $0.008, sorbent $0.008) |
| Oversizing for sun hours (PV $758 → $76) | 2.7× → 2.4× | 3.3× → 2.7× |

The lean sensible-heat terms are before 30% bed-to-bed recovery. Today's preset lands at $714 against the pack's $800. Its sorbent makeup is 6.3× the recipe's $0.04/kg, because 0.02 kg at $2/kg is not a real sorbent price: amine sorbents sell for $20–100/kg.

### Simulator override (`simulatorOverride`)

| Unit | today capexFactor / energyFactor / materialsFactor | lean capexFactor / energyFactor / materialsFactor | lean, other keys |
|---|---|---|---|
| `dac`, `dac-solid` | 0.889 / 0.306 / 0.0288 | **0.0366 / 0.138 / 0.0081** | heatFactor 0.576, consumablesFactor 0.189, variableOmFactor 0 (today: 1.45, 6.31, 0) |
| `gas-blower` | 0.00126 / 0.120 / 0.000131 | **0.000375 / 0.0722 / 0.000104** | — |

All three units are `flexible: true`. The blower factors are tiny because the recipe's blower is a generic process pad at $1.5/(Nm³/day) and 3.6 kPa, while a contactor moves ~1,600 m³ of air per kg CO₂ against 130–180 Pa with large axial fans costing ~$0.4–2.5 per kg CO₂/day. `variableOmFactor` 0: the pack's variable O&M is covered by sorbent makeup and fixed O&M.

### Design choices (lean otherwise; installed $/kg·d, PV kWh/kg, idiot index, $/kg CO₂ at PV $758 → $76)

| Choice | $/kg·d | kWh/kg | II | $/kg CO₂ |
|---|---|---|---|---|
| **Amine-on-fibre laminate** (lean) | 30.1 | 1.03 | 4.5 | 0.094 → 0.044 |
| Amine on silica (today's sorbent) | 110 | 1.41 | 12.9 | 0.45 → 0.37 |
| Diamine-appended MOF | 52.2 | 1.05 | 5.3 | 0.17 → 0.11 |
| Resistive heat (instead of heat pump) | 25.9 | 1.98 | 4.5 | 0.14 → 0.046 |
| Desorb at 10 kPa (deep vacuum, little steam) | 32.5 | 0.87 | 4.3 | 0.089 → 0.045 |
| 101 kPa steam stripping (no vacuum) | 27.9 | 1.32 | 4.9 | 0.11 → 0.044 |
| Face velocity 1.0 / 1.5 / 2.5 / 4.0 m/s | 45.5 / 36.8 / 30.1 / 26.8 | 1.00 / 1.00 / 1.03 / 1.13 | | 0.11→0.058 / 0.10→0.050 / 0.094→0.044 / 0.096→0.042 |
| Capture 50 / 70 / 85 / 95% | 42.3 / 33.6 / 30.1 / 29.0 | 1.06 / 1.03 / 1.03 / 1.04 | | 0.11→0.056 / 0.099→0.047 / 0.094→0.044 / 0.094→0.043 |

- **Sorbent is the first decision.** Amine on silica costs 3.6× more installed: slow pellets and thick layers need long cycles, so more contactor is installed per kg/day, at $50/kg sorbent. A thin fibre laminate holding 2 mmol/g gives 12 short cycles per sun-day.
- **Heat pump vs resistive heat** wins at today's PV and is a wash at 10× cheaper PV (resistive saves $4/(kg/day) and costs 0.95 kWh/kg more). The design keeps the heat pump as the hedge against dear PV.
- **Vacuum depth trades door steel against purge steam.** Flat doors at Δp 86 kPa weigh 350 kg/m² of face; at 51 kPa, 185. At cheap PV the optimum moves toward steam stripping at ~1 atm, where doors become light dampers. The lean design takes 50 kPa until steam-purge sorbent life is measured.
- **Deep beds and high capture pay.** One set of doors serves more sorbent, and ΔP stays at 134 Pa because the channels are laminar (Re ≈ 800). Fan energy is 0.10 kWh/kg against the recipe blower's 1.34.
- **Rejected alternatives** (`ALTERNATIVES`): liquid KOH + calciner (~$260 per kg CO₂/day nth-of-kind, Keith et al. 2018) needs 1.46 kWh_th/kg at ~900 °C, which a heat pump cannot supply and a calciner cannot start and stop daily. Moisture swing needs almost no heat but makes a dilute product, evaporates 5–20 kg water per kg CO₂ and has slow kinetics.

### Physics floor

- Minimum separation work at 420 ppm is ~0.12 kWh/kg (RT·ln(1/x) ≈ 19 kJ/mol); the lean 1.03 PV kWh/kg is ~8.5× that. Of the 1.81 kWh_th, 0.44 is amine reaction enthalpy, a floor for this sorbent class.
- Sorbent sensible heat (0.55 kWh/kg at 2 mmol/g × 60% utilization) is the largest heat term. It falls only with more working capacity, a smaller temperature swing, or more bed-to-bed recovery.

## Abundance scoreboard

`abundanceScoreboard` (sizeMultiple 100, best site). Today = default config. Frontier = PV capex and floor ÷10, idiot-index target 1.5 with `Bom.floors()`, `designs.units` = every design's lean override. Each cell: status, cost ÷ price, $/kg and top cost items.

| | e-methanol (106 Mt) | e-methane (3.2 Gt) | CO₂ (259 Mt) |
|---|---|---|---|
| Today, recipe | blocked 8.89× ($3.56: energy 2.34, gas-blower 0.60, dac-solid 0.23) | blocked 7.89× ($7.89: energy 5.51, gas-blower 1.13, dac 0.46) | blocked 23.3× ($1.17: energy 0.50, gas-blower 0.41, dac-solid 0.16) |
| Today, lean DAC only | blocked 3.34× ($1.34: energy 0.75, electrolyzer 0.34, methanol 0.11) | blocked 3.21× ($3.21: energy 1.85, electrolyzer 0.97, sabatier 0.18) | blocked 1.50× ($0.075) |
| Frontier, every lean design except DAC | blocked 1.67× ($0.67: energy 0.27, other 0.17, gas-blower 0.13, consumables 0.06) | blocked 1.35× ($1.35: energy 0.60, other 0.28, gas-blower 0.25, consumables 0.11) | blocked 4.42× ($0.22) |
| Frontier, today's DAC | blocked 1.77× (consumables 0.35) | blocked 1.43× (consumables 0.69) | blocked 1.21× ($0.061) |
| Frontier, every lean design | **feasible 0.79×** ($0.315: energy 0.19, other 0.10, methanol 0.01, consumables 0.01) | **feasible 0.66×** ($0.655: energy 0.44, other 0.15, sabatier 0.03, consumables 0.02) | **abundant 0.44×** ($0.022) |

Frontier feasible share: 60.6% without the lean DAC, 93.6% with it (today 39.5%); e-methane's 3.2 Gt is most of the gain. Through make-vs-buy, `dac-co2` also cuts the CO₂ line of urea ($0.095 → $0.016/kg), MTO ethylene ($0.157 → $0.066) and FT diesel ($0.403 → $0.065).

- **The lean DAC removes DAC as a blocker.** With it, DAC lines are ≤ $0.03/kg of either fuel; energy (mostly H₂) and other O&M are what remains.
- **Today's DAC design does not help at the frontier** (1.77× and 1.43×): its sorbent makeup alone is $0.35/kg methanol and $0.69/kg methane. Sorbent life and price matter more than hardware.

## Architecture

1. **Contactor module**: 2–6 m² face, laminate block ~0.5 m deep. Amine-functionalized polymer/cellulose fibre sheets with 2 mm gaps form laminar parallel channels (porosity 0.8, Re ≈ 800).
   - Air enters through a rain hood and coarse filter at 2.5 m/s and loses 134 Pa: channel friction (plane Poiseuille, 12μuL/gap²), entry/exit, and 40 Pa hood/filter/plenum.
   - Capture comes from the channel NTU: gas-film Sh = 7.54 in series with a sorbent-side uptake coefficient of 0.02 m/s.
2. **Fans**: one large low-pressure axial fan per module bank, ~60% wire-to-air, on VFDs, following irradiance with beds in staggered phases.
3. **Swing chamber**: square steel module with doors on both faces. Doors and walls are stiffened flat panels sized to Δp = 1 atm − p_desorb: plate t = b·√(Δp/2σ) with stiffeners at b = 0.15 m; I-section stiffeners at depth h = span/15; σ_allow = 100 MPa (fatigue at 10⁵ cycles). The shell is **lined inside** so it does not swing in temperature; heating 185 kg/m² of doors every cycle would add ~1 kWh_th/kg.
4. **Regeneration** (temperature–vacuum swing, 95 °C, 50 kPa, steam purge):
   - Doors close and a claw pump evacuates the void to 50 kPa.
   - Steam from the heat pump heats the laminate directly and strips CO₂ at p_CO₂ 10 kPa (4 mol steam/mol CO₂, half the latent heat recovered against feed water).
   - CO₂ and steam go to a condenser, then the pump lifts CO₂ to 1 atm. The bed cools under vacuum before air is readmitted, protecting the amines from hot O₂.
   - Bed-to-bed heat recovery takes 30% of the sensible heat.
5. **Heat supply**: air-source high-temperature heat pump, 105 °C condensing / 15 °C evaporating, COP ≈ 2.1 at ½ Carnot; the largest electrical load. A resistive steam boiler is the fallback.
6. **Sun-following**: 12 cycles per sun-day. At sunset no new cycle starts; the last beds finish on the evening shoulder, so no loaded bed sits overnight. Every cycle starts from ambient, so a morning start is just the first cycle.
7. **Product**: ≥ 95% CO₂ at ~1 atm, dried and handed to the methanol or Sabatier compressor. The utilization model buffers CO₂ to a firmed synthesis loop.

## Bill of materials (lean design, per kg CO₂/day)

| Part | Material | kg | Materials $ | Mfg × | $ |
|---|---|---|---|---|---|
| Vacuum doors (both faces) | steel | 2.75 | 1.79 | 3 | 5.36 |
| Install (×1.2) | — | — | — | — | 5.01 |
| Heat pump: copper | copper | 0.12 | 1.08 | 4 | 4.31 |
| Sorbent fill (purchased, 0.51 kg at $8) | amine + polymer | 0.51 | 0.85 (floor $1.66/kg) | 4.8 | 4.09 |
| Controls, VFDs, analyzers | — | — | — | — | 1.63 |
| Assembly labour (16 h per 6 m² module) | — | — | — | — | 1.58 |
| Heat pump: steel | steel | 0.59 | 0.38 | 4 | 1.53 |
| Chamber side walls | steel | 0.88 | 0.57 | 2.5 | 1.43 |
| Heat pump: aluminium | aluminium | 0.15 | 0.36 | 4 | 1.43 |
| Electrical: cabling, switchgear | copper | 0.054 | 0.50 | 1.5 | 0.74 |
| In-bed heat exchanger | aluminium | 0.098 | 0.24 | 3 | 0.71 |
| Structure / racking | steel | 0.37 | 0.24 | 2 | 0.48 |
| Fans + housings | steel | 0.22 | 0.14 | 3 | 0.42 |
| Foundations | concrete | 2.2 | 0.22 | 1.5 | 0.33 |
| Internal insulation liner | polymer | 0.098 | 0.11 | 2.5 | 0.27 |
| Process piping | stainless steel | 0.044 | 0.089 | 3 | 0.27 |
| Fan motors | copper + steel | 0.026 | 0.068 | 3 | 0.21 |
| Vacuum pumps + condenser | steel + copper | 0.044 | 0.062 | 4 | 0.25 |
| **Total installed** | | | **6.7** | | **30.1** |

Where today's $714 goes instead: install at 1.6× ($268), 4.2 kg of sorbent at $50/kg ($212), first-of-kind assembly at 300 h per 4 m² module ($92), deep-vacuum doors and walls at 7–8× fabrication ($79), controls at $300/kW ($40).

Cost-down path, in order of size:
1. a cheap, thin, fast sorbent made by the tonne (inventory 8× smaller, price 6× lower);
2. short cycles, so less contactor sits idle;
3. mild vacuum with light, mass-produced, internally insulated doors;
4. module assembly on a line, not on site;
5. heat pump bought as a commodity HVAC-class product.

## Build plan

| Phase | What | Scale | Duration | Indicative budget | Exit criteria |
|---|---|---|---|---|---|
| 0. Sorbent bench | Amine-on-fibre sheets from 3 suppliers/recipes; TGA and breakthrough rig with humid air at 420 ppm; 95 °C / 50 kPa steam-purge cycling in a 1 L cell, 1,000 cycles/week | < 1 kg CO₂/day | 4 months | ~$150k | Working capacity ≥ 1.2 mmol/g at 60% utilization; ≤ 1.5 mol H₂O/mol CO₂; capacity loss < 10% over 5,000 accelerated cycles; uptake coefficient ≥ 0.015 m/s |
| 1. One laminate block | 0.25 m² face × 0.5 m block in a lined steel box: fan, claw pump, small heat pump; PV-replay power supply (PVGIS days) | ~2–5 kg CO₂/day | 6 months | ~$300k | ΔP within 20% of model at 2.5 m/s; capture ≥ 80%; heat ≤ 2.0 kWh_th/kg at the heat-pump outlet; 39-min cycle; 150 sun-days without a loaded bed overnight |
| 2. Full module | 4–6 m² face module: stamped/stiffened doors at 50 kPa, internal liner, production-intent dampers; sorbent from a pilot coating line | ~50–100 kg CO₂/day | 9 months | ~$1.5M | Door steel ≤ 200 kg/m² face with no seal leaks after 20,000 cycles (accelerated); built cost ≤ $150 per kg CO₂/day; sorbent ≤ $15/kg at pilot scale |
| 3. Pilot plant | 20 modules on ~150 kWp PV, feeding a small Sabatier or methanol unit through a CO₂ buffer | ~1 t CO₂/day | 12 months | ~$3–5M | Installed ≤ $60 per kg CO₂/day; ≤ 1.2 PV kWh/kg; ≥ 2,500 operating h/yr; sorbent life trend ≥ 20,000 cycles; $/kg CO₂ within 15% of `lcoc()` at the site |
| 4. Product | Module line (doors, laminate blocks), sorbent plant ≥ 10 kt/yr, standard 1 t/day bank | 100 kt CO₂/yr | — | — | Installed ≤ $30 per kg CO₂/day; CO₂ ≤ $0.05/kg at the site |

Instrumentation throughout: inlet/outlet CO₂ (NDIR) and humidity per bed, bed thermocouples, door strain gauges, heat-pump COP (electric in, heat out), vacuum-pump energy, product purity, and a cycle log for degradation fitting. Measured values replace DEFAULTS in `engine/designs/dac.js`.

## Risks and open questions

- **Sorbent life under steam and daily thermal cycling** is the main risk. Amines oxidize (O₂ at temperature) and leach or rearrange under steam. Everything rides on 20,000 cycles at $8/kg: at 5,000 cycles and $50/kg, makeup alone is $0.25/kg CO₂ and the e-fuels stay blocked at the frontier. Mitigation: cool under vacuum before readmitting air, antioxidants, and Phase 0 accelerated cycling before any hardware scale-up.
- **Humidity.** Co-adsorbed water costs 0.28 kWh_th/kg at 1 mol/mol (lean) and 0.69 at 2.5 mol/mol (today). Coastal sites (Walvis Bay, Mejillones) are humid; measure the sorbent at the site's dew point.
- **Kinetics and capacity utilization are lumped.** `uptakeCoeffMPerS` and `adsorbUtilization` are assumptions; real capture falls during each adsorption step as the front moves. Phase 1 breakthrough curves calibrate both.
- **Vacuum doors and seals** at 12 cycles/day (~4,500 cycles/yr). Fatigue governs (σ_allow = 100 MPa assumed). Steam stripping at ~1 atm removes the problem and is the fallback, at +0.3 kWh/kg.
- **Heat pump at 105 °C** is commercially available but young; COP ½ Carnot (2.1) is assumed. At frontier PV resistive heat costs about the same per kg, so this is a hedge, not a dependency.
- **Purge-steam recovery (50%)** is assumed. Without it the lean design needs ~0.5 kWh_th/kg more.
- **Screening-grade model.** Manufacturing factors, install factor and sorbent prices are estimates with no vendor quotes. The today preset is calibrated only to the $800 pack, not to a disclosed plant cost.

## Engine changes

None open. The engine reads every key this design returns (`heatFactor`, `consumablesFactor`, `variableOmFactor`, `materialsFactor`), `gas-blower` is in the `dac` class, the flowsheets are sized to 1 t/day, and `dac-co2` supplies `co2-feed` through make-vs-buy.
