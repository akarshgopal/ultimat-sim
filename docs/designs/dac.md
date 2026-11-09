# Design: solar-matched direct air capture (DAC) unit

> **Update — recipes resized.** The e-methanol and e-methane recipes (`methanol`, `sabatier`, `coastal`) were demo cases with units fixed at bench capacity (DAC, electrolyzer and synthesis packs oversized ~7–100×). `scripts/build-pathways.mjs` now sizes them to 1 t/day with `engine/size.js` before reducing them to recipes, so the scoreboard figures in this doc are from before that fix. With honest sizing and every lean design, e-methane reaches ~0.90× its price at the frontier, and e-methanol ~1.1× (blocked by energy and variable O&M). Regenerate with the Abundance view.

Status: concept design + build plan. Model: `engine/designs/dac.js` (parametric, tested in `tests/design-dac.test.js`). It replaces three flowsheet units: `dac-solid` (e-methanol `methanol`, coastal e-methane `coastal`), `dac` (e-methane `sabatier`) and the `gas-blower` that feeds them air. Costs are screening estimates: a bill of materials at 2024–25 commodity prices (`data/bom.js`) times explicit manufacturing factors. Every number below comes from the model and the company simulator, as described under each table.

## Why this unit

At the frontier scenario (PV 10× cheaper, the lean electrolyzer, idiot-index target 1.5), the abundance scoreboard blocks e-methanol (106 Mt/yr, $1.26/kg against $0.40) and e-methane (3.2 Gt/yr, $2.08/kg against $1.00). After energy, DAC is the largest single line in both: $0.33/kg methanol and $0.32/kg methane of equipment, plus $0.06–0.11 of sorbent makeup and $0.07–0.14 of DAC variable O&M. The recipes also charge the DAC 3.34 kWh per kg CO₂: 0.50 kWh_e for the unit, 1.50 kWh_th of regeneration heat, and 1.34 kWh_e for a generic 3.6 kPa process blower.

## What the recipe assumes (per kg CO₂)

| | Recipe basis | Where it comes from |
|---|---|---|
| DAC unit capex | $800 per kg CO₂/day | `data/tea-screening.js` packs.dac ($2,200 per t/yr, IEA/NASEM family) |
| As it appears in the flowsheets | $11,700 (methanol), $5,840 (methane) per kg CO₂/day | demo cases fix the DAC at 100 kg CO₂/day for a 5 kg/day plant: ×14.6 and ×7.3 oversized |
| Unit electricity | 0.50 kWh/kg | node kWh ÷ CO₂ edge (0.687/1.37, 1.37/2.74) |
| Regeneration heat | 1.50 kWh_th/kg, priced as 1.50 PV kWh | pathway `heatKWhPerKg` ÷ CO₂ edge |
| Air blower | $2,008 per kg CO₂/day, 1.34 kWh/kg | packs['gas-blower'] $1.5/(Nm³/day) and 0.001 kWh/Nm³ × 1,339 Nm³ air/kg CO₂ |
| Sorbent makeup | 0.02 kg/kg at $2/kg = $0.04/kg | consumables feed |
| Variable O&M | $0.05/kg | packs.dac variableOm |

The capex factors in this design are relative to the pack ($800 and $2,008), not to the inflated flowsheet nodes. The same factor then applies to every pathway that contains the unit, as with `electrolyzer.js`. The test checks the recipe basis against `data/pathways.js`.

## Requirements

| Requirement | Target | Why |
|---|---|---|
| Operating profile | Sun-following, with daily cold start and stop; ~7–9 full-load h/day; beds cycle only while PV runs | Batteries cost more than oversizing the contactors. A whole cycle lasts 39 min, so no bed is left half-loaded overnight |
| Installed cost | ≤ $30 per kg CO₂/day (≈ $80 per t/yr) | Below this, DAC adds ≤ $0.06/kg methanol and ≤ $0.12/kg methane at the frontier (see "What it takes") |
| Energy | ≤ 1.0 PV kWh/kg CO₂ total: fan ≤ 0.1, vacuum + aux ≤ 0.07, heat ≤ 1.9 kWh_th delivered by a heat pump at COP ≥ 2 | Recipe is 3.34 |
| Product | CO₂ ≥ 95% dry at ~1 atm, delivered to the synthesis unit's compressor | Methanol/Sabatier units compress to their own loop pressure |
| Sorbent | ≥ 20,000 cycles (≈ 4.5 yr at 12 cycles/day), ≤ $8/kg | Sorbent makeup ≤ $0.01/kg CO₂ |
| Delivered CO₂ cost at frontier PV | ≤ $0.05/kg | The simulator's purchased CO₂ price ($0.05/kg). At this cost a DAC CO₂ recipe can supply `co2-feed` pathways too |

## Model results

Basis: 25 °C, 420 ppm. Costs are per kg CO₂/day of 24 h nameplate (the simulator's basis). Levelized $/kg comes from `lcoc()` at Walvis Bay, with sun-following PV sizing from `engine/utilization.js`, 8% and 20 yr.

| | Today: amine-on-silica TVSA, resistive heat | Lean solar-matched target |
|---|---|---|
| Installed | **$714 per kg CO₂/day** ($1,960 per t/yr) | **$30.1 per kg CO₂/day** ($82 per t/yr) |
| of which fans | $2.5 | $0.75 |
| Raw materials (incl. sorbent floor) | $23.3 | $6.7 |
| Idiot index | 30.6× | 4.5× |
| Energy, PV kWh/kg CO₂ | 2.48 | **1.03** |
| fan / vacuum + aux / regeneration | 0.16 / 0.15 / 2.17 | 0.10 / 0.07 / 0.86 |
| Regeneration heat, kWh_th/kg | 2.17 (COP 1) | 1.81 (heat pump COP 2.1) |
| reaction / sensible sorbent / hardware / water / purge steam | 0.47 / 0.63 / 0.05 / 0.69 / 0.13 | 0.44 / 0.55·0.7 / 0.04·0.7 / 0.28 / 0.51 |
| Air: face velocity, capture, bed depth, ΔP | 1.0 m/s, 80%, 46 cm, 175 Pa | 2.5 m/s, 85%, 49 cm, 134 Pa |
| Air per kg CO₂ | 1,650 m³ | 1,560 m³ |
| Cycle: adsorb / desorb / cool | 152 / 60 / 30 min (2 cycles/sun-day) | 19 / 10 / 10 min (12 cycles/sun-day) |
| Contactor face per kg CO₂/day | 305 cm² | 148 cm² |
| Sorbent inventory per kg CO₂/day | 4.2 kg at $50/kg | 0.51 kg at $8/kg |
| Sorbent replacement | $0.25/kg CO₂ (5,000 cycles) | $0.0076/kg CO₂ (20,000 cycles) |
| Steel per t/yr | 51 kg (vacuum doors 350 kg/m² face) | 13 kg (doors 185 kg/m² face) |
| CO₂ on sunlight, PV $758/kWp | $1.17/kg (unit $0.74, PV $0.18, sorbent $0.25) | $0.094/kg (unit $0.035, PV $0.051, sorbent $0.008) |
| CO₂ on sunlight, PV $76/kWp | $0.95/kg | **$0.044/kg** (unit $0.029, PV $0.008, sorbent $0.008) |
| Oversizing for sun hours | 2.4–2.7× | 2.7–3.3× |

The lean sensible-heat terms are shown before 30% bed-to-bed recovery (×0.7). Today's preset lands at $714 against the pack's $800 and uses 2.3 kWh/kg of heat plus vacuum against the recipe's 2.0. Its sorbent replacement is 6× the recipe's $0.04/kg, because the recipe's 0.02 kg at $2/kg is not a real sorbent price: amine sorbents sell for $20–100/kg.

### Simulator override (`simulatorOverride`)

| Unit | today capexFactor / energyFactor | lean capexFactor / energyFactor | lean, extra keys (not yet read by the engine) |
|---|---|---|---|
| `dac`, `dac-solid` | 0.889 / 0.306 | **0.0366 / 0.138** | heatFactor 0.576, consumablesFactor 0.189, variableOmFactor 0 |
| `gas-blower` | 0.00126 / 0.120 | **0.000375 / 0.0722** | — |

All three units return `flexible: true` and `materialsFactor` (design raw materials ÷ recipe pack capex). For lean that is 0.0081 for `dac`/`dac-solid` and 0.000104 for `gas-blower`; for today, 0.0288 and 0.000131. The engine reads `materialsFactor` to squeeze the design to its own materials × the idiot-index target. The blower factors are tiny because the recipe's blower is a generic process pad at $1.5/(Nm³/day) and 3.6 kPa. A DAC contactor moves ~1,600 m³ of air per kg CO₂ against 130–180 Pa, using large axial fans costing ~$0.4–2.5 per kg CO₂/day.

### Design choices (lean otherwise; installed $/kg·d, PV kWh/kg, idiot index, $/kg CO₂ at PV $758 → $76)

| Choice | $/kg·d | kWh/kg | II | $/kg CO₂ |
|---|---|---|---|---|
| **Amine-on-fibre laminate** (lean) | 30.1 | 1.03 | 4.5 | 0.094 → 0.044 |
| Amine on silica (today's sorbent) | 110 | 1.41 | 12.9 | 0.45 → 0.37 |
| Diamine-appended MOF | 52.2 | 1.05 | 5.3 | 0.17 → 0.11 |
| **Heat pump** (lean) | 30.1 | 1.03 | 4.5 | 0.094 → 0.044 |
| Resistive heat | 25.9 | 1.98 | 4.5 | 0.14 → 0.046 |
| Desorb at 10 kPa (deep vacuum, little steam) | 32.5 | 0.87 | 4.3 | 0.089 → 0.045 |
| **50 kPa + steam purge** (lean) | 30.1 | 1.03 | 4.5 | 0.094 → 0.044 |
| 101 kPa steam stripping (no vacuum) | 27.9 | 1.32 | 4.9 | 0.11 → 0.044 |
| Face velocity 1.0 / 1.5 / 2.5 / 4.0 m/s | 45.5 / 36.8 / 30.1 / 26.8 | 1.00 / 1.00 / 1.03 / 1.13 | | 0.11→0.058 / 0.10→0.050 / 0.094→0.044 / 0.096→0.042 |
| Capture 50 / 70 / 85 / 95% | 42.3 / 33.6 / 30.1 / 29.0 | 1.06 / 1.03 / 1.03 / 1.04 | | 0.11→0.056 / 0.099→0.047 / 0.094→0.044 / 0.094→0.043 |

How to read this:

- **Sorbent is the first decision.** Amine on silica costs 3.7× more installed. Its slow pellets and thick layers need long cycles, so more contactor is installed per kg/day, and each kg costs $50. Its makeup alone is $0.25/kg CO₂. A thin open fibre laminate holding 2 mmol/g gives 12 short cycles per sun-day.
- **At today's PV the heat pump wins; at 10× cheaper PV it is a wash.** Resistive heat saves $4/(kg/day) of capex but costs 0.95 kWh/kg more. The design keeps the heat pump, so the unit is not stuck with resistive heat if PV stays dear.
- **Vacuum depth trades door steel against purge steam.** Flat doors at Δp 86 kPa weigh 350 kg/m² of face (today); at 51 kPa they weigh 185. At cheap PV the optimum moves toward steam stripping at ~1 atm, where the doors become light dampers. The lean design takes the middle (50 kPa) until steam-purge sorbent life is measured.
- **Deep beds and high capture pay.** One set of doors then serves more sorbent, and ΔP stays at 130 Pa because the channels are laminar (Re ≈ 800). Fan energy is 0.1 kWh/kg, a fourteenth of the recipe's blower.
- **Liquid KOH + calciner (rejected)** runs about $260/(kg CO₂/day) nth-of-kind (Keith et al. 2018) and needs 1.46 kWh_th/kg at ~900 °C. A heat pump cannot supply that heat, and a calciner cannot start and stop daily, so on PV it needs a 900 °C thermal store. **Moisture swing (not chosen)** needs almost no heat. It makes a dilute CO₂ product, evaporates 5–20 kg of water per kg CO₂ and has slow kinetics. Both are listed in `ALTERNATIVES`.

### Physics floor: what DAC cannot go below

- Minimum separation work at 420 ppm is ~0.12 kWh/kg (RT·ln(1/x) ≈ 19 kJ/mol). The lean 1.03 PV kWh/kg is ~8.5× that. Of the 1.81 kWh_th, 0.44 is amine reaction enthalpy, a chemistry floor for this sorbent class.
- Sensible heat of the sorbent ((c_p·ΔT)/(working capacity) ≈ 0.55 kWh/kg at 2 mmol/g × 60% utilization) is the largest heat term. It falls only with more working capacity per kg, a smaller temperature swing, or bed-to-bed heat recovery.
- Even a free DAC does not make e-methanol feasible at the frontier (next section).

## Abundance scoreboard: before and after

`abundanceScoreboard` (sizeMultiple 100, best site; every winner is Walvis Bay).
- Today: default config.
- Frontier: PV capex and floor ÷10, idiot-index target 1.5 with `data/bom.js` floors, and `designs.units = { ...electrolyzer lean override, ...this override }`.

The engine is at the version where designed units are squeezed to their own `materialsFactor` × target, not to the class cap. Each cell shows status, cost ÷ price, and the top cost items in $/kg.

**Engine as it stands** (config `designs.units` = the override; the engine reads capexFactor, energyFactor, materialsFactor and flexible):

| | e-methanol (106 Mt) | e-methane (3.2 Gt) | ethylene (157 Mt) |
|---|---|---|---|
| Today, recipe | blocked 57.3× (electrolyzer 14, dac-solid 3.5, energy 2.7) | blocked 27.5× (electrolyzer 14, energy 6.2, dac 3.5) | blocked 1.92× (mto, methanol-feed 0.91) |
| Today, + lean DAC | blocked 46.2× (electrolyzer 14, energy 2.3); DAC 0.13 | blocked 22.1× (electrolyzer 14, energy 5.5); DAC 0.13 | unchanged |
| Frontier, recipe | blocked **3.14×** ($1.26: energy 0.46, dac-solid 0.33, other 0.16) | blocked **2.08×** ($2.08: energy 1.0, dac 0.32, other 0.28) | **feasible** 0.74× (green-mto, buys CO₂ at $0.05) |
| Frontier, + today DAC | blocked 2.62× (dac-solid 0.27) | blocked 1.78× (dac 0.26) | unchanged |
| Frontier, + lean DAC | blocked **2.31×** ($0.93: energy 0.38, other 0.16, methanol 0.14, swro 0.10) | blocked **1.66×** ($1.66: energy 0.91, other 0.28, sabatier 0.19, consumables 0.11) | feasible 0.74× (unchanged) |

Frontier feasible share stays at 62.0% (today 40.4%). Ethylene does not move: its best route, green-mto, buys point-source CO₂, and mto's captive methanol is not integrated while methanol costs more than $0.40. Once DAC is designed, it no longer appears among the top items for methanol or methane.

**With the remaining recommended engine changes emulated** (items 1–3 and 5 under "Engine changes"; done by rewriting copies of the pathway data, with no engine file edited):

| Frontier | e-methanol | e-methane | ethylene | feasible share |
|---|---|---|---|---|
| + today DAC, at its own price (no materialsFactor) | blocked 3.40× (consumables 0.35) | blocked 2.55× (consumables 0.69) | feasible | 62.0% |
| + lean DAC, at its own price ($30/kg·d) | blocked **1.87×** ($0.75) | blocked **1.35×** ($1.35) | feasible | 62.0% |
| + lean DAC, squeezed to 1.5× its own materials ($10/kg·d) | blocked 1.86× ($0.74) | blocked 1.34× ($1.34) | feasible | 62.0% |
| DAC free (bound) | blocked **1.73×** ($0.69: energy 0.31, methanol 0.12, other 0.096, swro 0.093) | blocked **1.23×** ($1.23: energy 0.78, sabatier 0.17, other 0.15, swro 0.084) | feasible | 62.0% |

### What it takes: plain answers

- **The lean DAC removes DAC as a blocker.** At the frontier it cuts e-methanol from 3.14× to 2.31× of price, and e-methane from 2.08× to 1.66×, with the engine as it stands. With heat, sorbent and the blower priced properly, the remaining DAC cost is $0.06/kg methanol and $0.12/kg methane, or ≈ $0.045/kg CO₂. That is the gap between the lean rows and the DAC-free bound.
- **Physics says DAC cannot make either fuel feasible at the frontier.** With the CO₂ free (no capex, no energy, no sorbent, no O&M), e-methanol still costs $0.69/kg against $0.40 (1.73×) and e-methane $1.23/kg against $1.00 (1.23×). A DAC capex scan from $40 down to $5 per kg CO₂/day moves methane only between 1.36× and 1.33×.
  - What remains is mostly **energy**: 11 kWh/kg methanol and 28 kWh/kg methane, almost all of it H₂, at an effective ~$0.028/kWh after sun-following oversizing and firming of the synthesis loop.
  - Then come the **synthesis units** (methanol $0.12, Sabatier $0.17, still on demo-scale oversized nodes), the **SWRO/intake** ($0.08–0.09, also oversized) and the **variable O&M pads** ($0.10–0.15).
  - The next designs for e-fuels are therefore a **sun-tolerant methanol/Sabatier loop**, a re-sized **SWRO**, and cheaper **H₂ kWh** (PV and electrolyzer efficiency), not more DAC.
- **CO₂ as a product:** lean DAC CO₂ at frontier PV costs $0.044/kg, under the simulator's $0.05/kg purchased CO₂. A DAC-only CO₂ recipe would let `green-mto`, `green-ft` and `green-urea` stop buying point-source CO₂. Today `config.integration.feedProducts` deliberately leaves `co2-feed` unmapped ("no DAC undercuts purchased CO₂").

## Architecture

1. **Contactor module**: 2–6 m² face, laminate block ~0.5 m deep. Amine-functionalized polymer/cellulose fibre sheets 0.5 mm thick with 2 mm gaps, giving laminar parallel channels (porosity 0.8, Re ≈ 800).
   - Air enters through a rain hood and coarse filter at 2.5 m/s and loses 134 Pa: 86 Pa channel friction (plane Poiseuille, 12μuL/gap²), 9 Pa entry/exit, 40 Pa hood/filter/plenum.
   - Capture comes from the channel NTU: gas-film Sh = 7.54 in series with a sorbent-side uptake coefficient of 0.02 m/s.
2. **Fans**: one large low-pressure axial fan per module bank, ~60% wire-to-air, on VFDs. They follow irradiance and run beds in staggered phases.
3. **Swing chamber**: square steel module with doors on both faces. Doors and walls are stiffened flat panels sized to Δp = 1 atm − p_desorb:
   - plate t = b·√(Δp/2σ) with stiffeners at b = 0.15 m;
   - I-section stiffeners spanning the module at depth h = span/15;
   - σ_allow = 100 MPa, set by fatigue at 10⁵ cycles.
   The shell is **lined inside** so it does not swing in temperature. Heating 185 kg/m² of doors every cycle would add ~1 kWh_th/kg.
4. **Regeneration** (temperature–vacuum swing, 95 °C, 50 kPa, steam purge):
   - Doors close and a claw pump evacuates the void to 50 kPa.
   - Steam from the heat pump heats the laminate directly and strips CO₂, holding p_CO₂ at 10 kPa (4 mol steam/mol CO₂, half the latent heat recovered by condensing against feed water).
   - CO₂ and steam go to a condenser and then the pump to 1 atm. The bed cools under vacuum before air is readmitted, which protects the amines from hot O₂.
   - Bed-to-bed heat recovery takes 30% of the sensible heat.
5. **Heat supply**: air-source high-temperature heat pump, 105 °C condensing and 15 °C evaporating, COP ≈ 2.1 at ½ Carnot. It is the largest electrical load. A resistive steam boiler is the fallback and the frontier-PV alternative.
6. **Sun-following**: 12 cycles per sun-day. At sunset no new cycle starts and the last beds finish desorbing on the evening shoulder, so no loaded bed sits overnight. Morning start is just the first cycle, because every cycle starts from ambient anyway.
7. **Product**: ≥ 95% CO₂ at ~1 atm, dried and handed to the methanol or Sabatier compressor. The utilization model buffers CO₂ ($5/kg capacity) to a baseload synthesis loop.

## Bill of materials (lean design, per kg CO₂/day)

| Part | Material | kg | Materials $ | Mfg × | $ |
|---|---|---|---|---|---|
| Vacuum doors (both faces) | steel | 2.7 | 1.80 | 3 | 5.4 |
| Install (×1.2) | — | — | — | — | 5.0 |
| Heat pump: copper | copper | 0.12 | 1.10 | 4 | 4.3 |
| Sorbent fill (purchased, 0.51 kg at $8) | amine + polymer | 0.51 | 0.85 (floor $1.66/kg) | 4.8 | 4.1 |
| Controls, VFDs, analyzers | — | — | — | — | 1.6 |
| Assembly labour | — | — | — | — | 1.6 |
| Heat pump: steel | steel | 0.59 | 0.38 | 4 | 1.5 |
| Chamber side walls | steel | 0.88 | 0.57 | 2.5 | 1.4 |
| Heat pump: aluminium | aluminium | 0.15 | 0.36 | 4 | 1.4 |
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

Where today's $714 goes instead:
- install at 1.6× ($268);
- the sorbent fill: 4.2 kg at $50/kg ($212);
- first-of-kind assembly at 300 h per 4 m² module ($92);
- deep-vacuum doors and walls at 7–8× fabrication ($79);
- controls at $300/kW ($40).

The cost-down path, in order of size:
1. **a cheap, thin, fast sorbent made by the tonne**, which shrinks inventory 8× and price 6×;
2. **short cycles**, so less contactor sits idle;
3. **mild vacuum with light, mass-produced, internally insulated doors**;
4. **module assembly in a line, not on site**;
5. **heat pump bought as a commodity HVAC-class product.**

## Engine changes recommended (not made here)

1. **Regeneration heat is on the pathway, not the node.** `pathway.heatKWhPerKg` (1.5 kWh/kg CO₂) is added to energy in `evaluatePlant` and to the flexible block in `Utilization.operatingProfile`, and no design factor reaches it.
   - Proposal: read `designs.units.<unit>.heatFactor`.
   - In `operatingProfile`, add `heat × (heatFactor − 1)` to `energyDelta` for the converter that receives the flowsheet's `heat` edge. `evaluatePlant`'s `kWhPerKg` already adds `profile.energyDeltaKWhPerKg`, and the flexible block picks it up through `recipeTotal`.
   - The lean design needs 0.86 kWh instead of 1.5 per kg CO₂.
2. **Sorbent makeup and DAC variable O&M are pathway feeds and pads.**
   - Proposal: `consumablesFactor` scales the `consumables` feed's `kgPerKg`.
   - `variableOmFactor` scales the unit's share of `variableOmUsdPerKg` (store per-node variable O&M in the flowsheet, or subtract `packs.dac.variableOm × CO₂ edge`).
   - Lean: 0.19 and 0. Today's design is 6.3× the recipe's makeup.
3. **`gas-blower` is in the `dac` cost class in `data/pathways.js`** (`scripts/build-pathways.mjs` `techClass`), **but `Utilization.UNIT_TECH` maps it to `process`.** A gas-blower capexFactor therefore subtracts the blower's savings from the *process* class (the methanol/Sabatier unit, clamped at 0 for `coastal`), while the blower's recipe capex stays in `dac`.
   - Fix: add `'gas-blower': 'dac'` to `UNIT_TECH`.
   - Without it, the blower's recipe pad ($2,008 per kg CO₂/day) stays in the `dac` class at the class's squeeze, and the design's saving is taken from the synthesis unit instead.
4. ~~Designed units squeezed twice~~: resolved upstream by `materialsFactor`, which this design returns for every unit.
5. **Demo-scale node sizing.** Cases fix DAC, electrolyzer and synthesis nodes at `capacity: 100`, so the 5 kg/day flowsheets read DAC ×7–15, electrolyzer ×100 and methanol ×20 above their packs.
   - At today's prices the scoreboard's "$3.5/kg dac-solid" is mostly this artifact. At the frontier it still inflates the undesigned methanol, Sabatier and SWRO units.
   - Size these nodes to target in the cases, as `sizeToProduct` does elsewhere, and rebuild `data/pathways.js`.
6. **A DAC CO₂ supplier recipe:** lean DAC CO₂ undercuts $0.05/kg at frontier PV, so `co2-feed` could map to it in `integration.feedProducts`.

The "fixes emulated" rows above apply items 1–3 and 5 (DAC node only) to copies of the pathway data:
- the DAC node is set to $800 × kg CO₂ per kg product;
- the blower's recipe capex moves to the class `UNIT_TECH` gives it;
- heat, consumables and DAC variable O&M are scaled by the extra override keys.

They are run with and without `materialsFactor`. The design module is independent of all of these.

## Build plan

| Phase | What | Scale | Duration | Indicative budget | Exit criteria |
|---|---|---|---|---|---|
| 0. Sorbent bench | Amine-on-fibre sheets from 3 suppliers/recipes; TGA and breakthrough rig with humid air at 420 ppm; 95 °C / 50 kPa steam-purge cycling in a 1 L cell, 1,000 cycles/week | < 1 kg CO₂/day | 4 months | ~$150k | Working capacity ≥ 1.2 mmol/g at 60% utilization; ≤ 1.5 mol H₂O/mol CO₂; capacity loss < 10% over 5,000 accelerated cycles; uptake coefficient ≥ 0.015 m/s |
| 1. One laminate block | 0.25 m² face × 0.5 m block in a lined steel box: fan, claw pump, small heat pump; PV-replay power supply (PVGIS days) | ~2–5 kg CO₂/day | 6 months | ~$300k | ΔP within 20% of model at 2.5 m/s; capture ≥ 80%; heat ≤ 2.0 kWh_th/kg measured at the heat-pump outlet; 39-min cycle; 150 sun-days without a loaded bed overnight |
| 2. Full module | 4–6 m² face module: stamped/stiffened doors at 50 kPa, internal liner, production-intent dampers; sorbent from a pilot coating line | ~50–100 kg CO₂/day | 9 months | ~$1.5M | Door steel ≤ 200 kg/m² face with no seal leaks after 20,000 cycles (accelerated); built cost ≤ $150 per kg CO₂/day; sorbent ≤ $15/kg at pilot scale |
| 3. Pilot plant | 20 modules on ~150 kWp PV, feeding a small Sabatier or methanol unit through a CO₂ buffer | ~1 t CO₂/day | 12 months | ~$3–5M | Installed ≤ $60 per kg CO₂/day; ≤ 1.2 PV kWh/kg; ≥ 2,500 operating h/yr; sorbent life trend ≥ 20,000 cycles; $/kg CO₂ within 15% of `lcoc()` at the site |
| 4. Product | Module line (doors, laminate blocks), sorbent plant ≥ 10 kt/yr, standard 1 t/day bank | 100 kt CO₂/yr | — | — | Installed ≤ $30 per kg CO₂/day; CO₂ ≤ $0.05/kg at the site |

Instrumentation throughout:
- inlet/outlet CO₂ (NDIR) and humidity per bed;
- bed thermocouples;
- door strain gauges;
- heat-pump COP (electric in, heat out);
- vacuum-pump energy;
- product purity;
- a cycle log for degradation fitting.

Measured values replace DEFAULTS in `engine/designs/dac.js`.

## Risks and open questions

- **Sorbent life under steam and daily thermal cycling** is the main risk. Amines oxidize (O₂ at temperature) and leach or rearrange under steam. Everything rides on 20,000 cycles at $8/kg: at 5,000 cycles and $50/kg, makeup alone is $0.25/kg CO₂. Mitigation: cool under vacuum before readmitting air, add antioxidants, and run Phase 0 accelerated cycling before any hardware scale-up.
- **Humidity.** Co-adsorbed water costs 0.28 kWh_th/kg at 1 mol/mol (lean) and 0.69 at 2.5 mol/mol (today). Coastal sites (Walvis Bay, Mejillones) are humid, so the chosen sorbent must be measured at the site's dew point.
- **Kinetics and capacity utilization are lumped.** `uptakeCoeffMPerS` and `adsorbUtilization` are assumptions. In reality capture falls during each adsorption step as the front moves through the bed. Phase 1 breakthrough curves must calibrate both.
- **Vacuum doors and seals** at 12 cycles/day and ~50,000 cycles/yr. Fatigue, not yield, governs (σ_allow = 100 MPa assumed). The light steam-stripping variant at ~1 atm removes the problem and is the fallback, at +0.3 kWh/kg.
- **Heat pump at 105 °C** is commercially available but young. COP ½ Carnot (2.1) is assumed. At frontier PV, resistive heat costs about the same per kg, so this is a hedge rather than a dependency.
- **Purge-steam recovery (50%)** is assumed. Without it the lean design needs ~0.5 kWh_th/kg more.
- **Screening-grade model.** Manufacturing factors, install factor and sorbent prices are estimates, and no vendor quotes exist. The today preset is calibrated only to the $800 pack, not to a disclosed plant cost.
- **The simulator gains from this design are partly hidden** by engine items 1–3 and 5 above. Read the scoreboard rows together with the "fixes emulated" table.
