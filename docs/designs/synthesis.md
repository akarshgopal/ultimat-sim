# Design: sun-following catalytic synthesis reactors (methanol, Sabatier, MTO)

Status: concept design + build plan. Model: `engine/designs/synthesis.js` (parametric, tested in `tests/design-synthesis.test.js`). It covers three flowsheet units: `methanol`, `sabatier` and `mto`. Costs are screening estimates: a bill of materials at 2024–25 commodity prices (`data/bom.js`, plus zinc, alumina, ruthenium and a SAPO-34 raw-material mix in `DEFAULTS.extraCommodities`) times explicit manufacturing factors. Every number below comes from the module and the company simulator (the commands are under "Reproduce").

## The question

The recipes treat synthesis loops as baseload. On solar alone, `engine/utilization.js` then firms their power with batteries through the night. The electrolyzer upstream follows the sun, so the H₂ feeding a baseload loop must be buffered at ~$600/kg of compressed-gas storage. The thesis: a reactor designed for wide turndown and a daily hot-standby cycle can follow the sun (`designs.units.<unit>.flexible = true`). That removes the batteries and the H₂ buffer, but the reactor then needs ~3–3.5× nameplate. So the reactor's installed $ per kg/day has to be low. This document puts numbers on that trade.

**Short answer:**
- **Ethylene (green-mto):** a sun-following methanol + MTO train wins at both today's PV prices and 10× cheaper PV. It wins even at the recipes' own capex.
  - At today's PV the break-even is ~3.4× the lean design's capex, about the recipe level. Green-mto drops from $3.68 to $2.75/kg.
  - At the frontier, the idiot-index squeeze caps a designed unit at its own raw materials × 1.5, so oversizing it costs almost nothing and flexibility wins at any capex. Ethylene drops from $0.593 to $0.500/kg, and the cost ratio goes from 0.74 to 0.62.
- **E-methane and e-methanol (DAC-fed pathways):** making the synthesis reactor flexible changes nothing. The simulator still firms the whole chain, because DAC is the costly unit to oversize 3×. Even with the DAC forced to baseload (CO₂ buffered cheaply), it is a near-tie at the scoreboard's 500 kg/day plant. At 5 t/day it gains only 0.1% (methane $1.871 → $1.869/kg). Both products stay blocked. What blocks them is battery firming of the electrolyzer + DAC chain ($1.03/kg CH₄ at the frontier), DAC equipment and other O&M. None of these is the reactor.

## Requirements (from the model)

| Requirement | Target | Why |
|---|---|---|
| Operating profile | Follow the electrolyzer's H₂ 0 → 100% → 0 each day, ~6.6–7.5 full-load h/day; hot standby ~16 h | No battery firming and no H₂ buffer ($600/kg). The simulator oversizes it 3.2–3.6× |
| Turndown | Each module ≥ 30% (methanol, MTO fixed bed) / 20% (Sabatier); ≥ 4 modules switched with the sun | < 0.2% of daily H₂ arrives below minimum load. A ~1-hour trickle buffer covers it (costed) |
| Installed cost (lean) | Methanol ≤ $35/kg/day at ~230 t/day; MTO ≤ $25/kg/day at 100 t/day; Sabatier ≤ $100/kg/day at ≥ 5 t/day | At 3.5× nameplate these become small next to PV. At today's PV the break-even vs baseload is ~3.4× higher; at the frontier the squeeze leaves only materials and kWh/kg |
| Night | Stay above ~200 °C with no heater, using stored reaction heat; no cold starts | Cu/ZnO avoids water condensation and redox cycling; Ni avoids carbonyl; MTO avoids a cold fluidization restart |
| Catalyst | ≥ 3 years at daily cycling (the model assumes 0.75 × the baseload life) | Replacements are capitalized into the override (PV over 25 years) |
| Energy | Methanol ≤ 0.75 kWh/kg including H₂ compression from 1 bar; Sabatier ≤ 0.6 kWh/kg; MTO ≤ 1 kWh/kg | Compression is most of it. Every 0.1 kWh/kg is < 1% of the chain's PV |

## Model

- **Equilibrium.**
  - Methanol uses the Graaf constants (CO + 2H₂ ⇌ CH₃OH, log₁₀K₁ = 5139/T − 12.621; RWGS log₁₀K₂ = −2073/T + 2.029; K₃ = K₁K₂), solved for both extents by nested bisection from a stoichiometric CO₂ + 3H₂ feed.
  - Sabatier uses van 't Hoff with ΔH° = −165 kJ/mol and ΔG°₂₉₈ = −113.5 kJ/mol. It is staged, with water knocked out between stages.
- **Kinetics (screening).** Approach to equilibrium is 1 − exp(−k/GHSV). k is fitted per catalyst at a reference point and scaled by Arrhenius:
  - Cu/ZnO: 85% of equilibrium at 8,000 h⁻¹ and 250 °C, 60 kJ/mol.
  - Ni: 95% at 5,000 h⁻¹ and 320 °C.
  - Ru: 97% at 6,000 h⁻¹ and 260 °C.
- **Methanol loop.**
  - The single-pass yield Y sets the recycle ratio, (1/Y − 1).
  - Catalyst volume is the inlet Nm³/h divided by GHSV.
  - Tubes are boiling-water-cooled. Wall thickness comes from Barlow at loop pressure (118 MPa allowable, plus corrosion allowance and a minimum wall).
  - Tube count is the larger of what the catalyst volume needs and what the heat-removal area needs (U·ΔT).
  - Shells and tubesheets (TEMA order) are sized at the larger of the loop pressure and the steam pressure.
  - Feed/effluent interchanger and condenser areas come from duty, U and LMTD.
  - Distillation: reboiler duty is (R+1)·λ. 85% of the 250 °C exotherm is reused, and the balance comes from an MVR heat pump (COP 4).
- **Compressors.** Multistage and intercooled (≤ 3:1 per stage, 75% efficient). Package steel is ~35 kg/kW at 1 MW, heavier when smaller, and halved for CO₂, hydrocarbons and vapour (screw/centrifugal machines). Motor copper and iron are listed separately. Sun-following adds VFDs.
- **Sabatier.**
  - Lean design: two cooled isothermal tubular stages, thermal oil in the shell at 6 bar. Boiling water at 300 °C would need an 86 bar shell.
  - Today preset: TREMP-style adiabatic beds with hot recycle (recycle ratio ≈ ΔT_full/ΔT_allowed − 1).
  - The tubes are **sized by heat removal**, not by catalyst volume. ~119 W per kg CH₄/day has to cross the wall.
- **MTO.** Fixed-bed swing reactors (lean) or a fluidized reactor-regenerator (today). Catalyst inventory comes from WHSV. Energy includes product-gas compression, refrigeration for the cold section (COP), net feed heat after feed/effluent recovery, and other utilities. The separation train is lumped steel, stainless and aluminium per kg/day.
- **Sun-following extras.**
  - Insulation is sized on reactor plus piping area.
  - Night loss is compared with thermal mass (steel, catalyst, coolant). If the overnight drop would exceed 40 K, a pressurized-water accumulator stores the day's reaction heat.
  - A small H₂ buffer covers the time each module spends below its minimum load.
  - At least 4 modules, VFDs, and catalyst life × 0.75.
- **Scale and fixed costs.** Controls, analyzers, safety, engineering and assembly are charged per train and scale with train size^0.3. The install factor goes on top.
- **Catalyst replacements.** These are capitalized as present value at 8% over 25 years. The simulator has no catalyst opex line, so they are carried inside `capexFactor`.
- **The override.**
  - `capexFactor` = (installed + catalyst-replacement PV) ÷ the recipe at the same scale. The recipe is scaled with the engine's own 0.85 exponent.
  - The comparison scale is the abundance scoreboard's plant: 100 × the recipe reference. That is 228 t MeOH/day (green-mto basis), 500 kg CH₄/day and 100 t C₂H₄/day.
  - `energyFactor` = kWh/kg ÷ the recipe's kWh/kg.
  - `materialsFactor` = raw materials ÷ the same recipe. The frontier squeeze caps the unit at materials × target.
  - `flexible` = `operation !== 'baseload'`.

## Model results (scoreboard scale)

| | Methanol today | Methanol lean | Sabatier today | Sabatier lean | MTO today | MTO lean |
|---|---|---|---|---|---|---|
| Scale | 228 t/day | 228 t/day | 500 kg/day | 500 kg/day | 100 t C₂H₄/day | 100 t/day |
| Design | 75 bar, 38 mm tubes, Ø5 m single train, baseload | 60 bar, 25 mm × 6 m tubes, 5 modules, sun-following | 20 bar adiabatic Ni beds + hot recycle (2.2×) | 5 bar, 2 cooled stages, 0.5% Ru, 280/240 °C | Fluidized + regenerator | Fixed-bed swing beds |
| Installed $/kg/day | **$113** | **$30.6** | **$2,353** | **$295** | **$157** | **$23.7** |
| Recipe at this scale | $105 | $105 | $3,007 | $3,007 | $96 | $96 |
| Override `capexFactor` (incl. catalyst PV) | 1.13 | **0.34** | 0.79 | **0.11** | 1.98 | **0.35** |
| Override `materialsFactor` | 0.046 | 0.040 | 0.0025 | 0.0037 | 0.068 | 0.039 |
| kWh/kg (recipe) | 0.88 (0.50) | 0.72 (0.50) | 0.33 (1.00) | 0.60 (1.00) | 3.99 (4.00) | 0.84 (4.00) |
| `energyFactor` | 1.76 | 1.43 | 0.33 | 0.60 | 1.00 | 0.21 |
| Raw materials $/kg/day | 4.81 | 4.26 | 7.52 | 11.05 | 6.55 | 3.77 |
| Idiot index | 23.5× | 7.2× | 313× | 26.7× | 24.0× | 6.3× |
| Single pass / conversion | 19.5% (eq. 22.9%), recycle 4.1× | 15.9% (eq. 18.7%), recycle 5.3× | 99.6%, CH₄ 97.9% dry | 99.6%, CH₄ 98.0% dry | — | — |
| Hot standby | — | 0.6% of daily exotherm, coasts 12 K overnight (no heater) | — | 1.0% of exotherm, 110 K drop → 9 kWh/day accumulator | — | 3.6% of exotherm → accumulator |

Reading the table:

- **The reactor is not the cost.** In the lean methanol design, tubes, shells and tubesheets add up to $0.7 per kg/day of $30.6. The H₂ feed compressor (1 → 60 bar) is $6.5, install is $7.1, controls are $2.6 and piping is $2.4. In today's design, the 2.4× install factor and compressors at ~70× their steel price are most of the cost.
- **H₂ compression is the price of the atmospheric lean electrolyzer.** It adds 0.43 kWh/kg MeOH, which is why `energyFactor` is above 1: the recipe's 0.5 kWh/kg assumes pressurized H₂. Feeding 30 bar H₂ instead cuts the lean design to $21.9/kg/day and 0.35 kWh/kg. Pressurizing the electrolyzer costs BoP steel, so this needs to be settled jointly with the electrolyzer design.
- **The optimal synthesis pressure is shallow.** Lean methanol costs $42.4 at 30 bar, $32.2 at 50, $30.6 at 60, $29.8 at 70 and $28.5/kg/day at 100 bar. kWh/kg bottoms out at about 0.71 near 50–60 bar, because recycle compression falls with pressure while feed compression rises. Per-pass yield goes 6.9% → 13.2% → 15.9% → 20.6% at 30/50/60/80 bar, and recycle falls from 13.4× to 3.9×. Higher temperature lowers the yield (exothermic): 230 °C gives 16.4%, 270 °C gives 12.7%.
- **Sabatier should run at low pressure.** Conversion stays above 99.4% from 2 to 20 bar. Because the 5 mol of feed are compressed, the design rises from 0.29 kWh/kg at 2 bar to 1.10 kWh/kg at 20 bar. Compress the 1 mol of CH₄ product to pipeline pressure afterwards instead. At 500 kg/day the controls skid ($162 of $295) dominates. The lean design costs $100/kg/day at 5 t/day and ~$62 at ≥ 50 t/day, where the Ru charge (including replacements) is the largest item.
- **The sun-following premium on the unit itself is small.** Lean methanol run baseload is $28.7/kg/day, against $30.6 sun-following. The difference is VFDs, more modules, thicker insulation and the trickle H₂ buffer. Catalyst life × 0.75 adds a further ~$1 of replacement PV.
- **Installed cost vs scale (lean / today, $/kg/day):**
  - Methanol: 289 / 2,385 at 500 kg/day; 94 / 587 at 5 t/day; 42 / 189 at 50 t/day; 30.6 / 113 at 228 t/day; 29.9 / 73.7 at 2,000 t/day.
  - MTO: 71 / 587 at 5 t/day; 20 / 126 at 228 t/day.

## Flexible vs baseload in the company simulator

Plants are at the scoreboard size (100 × reference) at the best site, in year 0. Prices are $/kg of product.

"Frontier" means:
- PV at $75.8/kWp (10× cheaper) with a floor of $25.
- The idiot-index squeeze to 1.5× materials (floors from `data/bom.js`).
- The lean electrolyzer override.

The squeeze works differently for recipe and designed units:
- Recipe units are capped at their cost class's floor.
- Designed units are capped at their own raw materials × 1.5 (`materialsFactor`).

At the frontier, a designed reactor therefore costs only ~1.5× its steel, catalyst and copper, whatever its manufacturing factors. Only its materials and its kWh/kg count there.

| Pathway | Scenario | Recipe (baseload) | Today preset (baseload) | Lean, forced baseload | **Lean, sun-following** | Recipe capex, sun-following |
|---|---|---|---|---|---|---|
| green-mto (ethylene) | today PV | 3.677 | 3.755 | 3.128 | **2.753** | 3.217 |
| green-mto (ethylene) | frontier | 0.593 | 0.618 | 0.521 | **0.500** | 0.543 |
| mto (purchased MeOH) | today PV | 1.539 | 1.583 | 1.076 | **1.028** | 1.267 |
| mto (purchased MeOH) | frontier | 1.047 | 1.048 | 0.967 | **0.963** | 1.009 |
| sabatier (methane) | today PV | 27.47 | 27.08 | 26.24 | 26.24 | 27.47 |
| sabatier (methane) | frontier | 2.080 | 1.976 | 1.986 | 1.986 | 2.080 |
| methanol | today PV | 22.92 | 23.10 | 22.38 | 22.38 | 22.92 |
| methanol | frontier | 1.255 | 1.267 | 1.256 | 1.256 | 1.255 |

What changes in the green-mto plant (100 t C₂H₄/day) at the frontier when methanol and MTO follow the sun:

- **Baseload (lean design):**
  - 123 MWh of battery plus a $2.44M H₂ buffer (24.7 t H₂).
  - Output factor 0.80. Winter months cannot hold the 70% turndown floor, so output is derated.
  - The firming storage is $7.5M next to $28.3M of PV.
- **Sun-following:**
  - Zero battery and zero buffer.
  - 3.4× nameplate on 7.0 full-load hours a day.
  - Output factor 1.00.
  - PV rises from $28.3M to $35.2M, because the extra clipped output has to come from more panels.

**Break-even capex.**
- At today's PV, sun-following beats the lean baseload loop until the methanol and MTO capex rise to about 3.4× the lean values. That is about $122 per kg MeOH/day and $113 per kg C₂H₄/day, roughly the recipe level. The trade is won mainly by deleting storage, not by the cheap reactor: the cheap reactor adds a further ~12%.
- At the frontier there is no break-even. The squeeze caps the designed units at their materials × 1.5 (~$6–7 per kg/day), so 3.4× nameplate is nearly free and flexibility always wins.

**At the frontier the Sabatier and methanol units are a rounding error.** They are squeezed to their materials either way. The lean designs differ from today's mainly in kWh/kg: H₂ compression from the atmospheric lean electrolyzer adds 0.27–0.43 kWh/kg, which today's 30-bar H₂ supply avoids. Lean Sabatier lands 0.5% above the today preset ($1.986 vs $1.976), and lean methanol $0.001 above the recipe. With 30-bar H₂, lean Sabatier would be $1.972, and a Ni catalyst (lower materials than Ru) $1.969. The ranking flips at ≤ 0.5%.

**Why methane and methanol do not move.** Those two pathways make CO₂ with DAC, which the utilization model treats as flexible. The plant chooses between two candidates:
1. Sun-following: every flexible unit oversized about 3.3×, DAC included.
2. Firm everything: run 24 h on PV plus ~12 MWh (methane) / 5 MWh (methanol) of battery.

Firming wins: $1.44M vs $2.08M per unit of output for a 500 kg/day methane plant at the frontier. So a flexible synthesis unit simply joins a firmed plant.

Setting the DAC and its blower to baseload too (CO₂ buffered at ~$5/kg) narrows the gap to $1.44M vs $1.47M, which is still firmed. At 5 t/day (1,000×) sun-following wins, but only by $0.002/kg ($1.871 → $1.869). Methanol stays firmed at every size.

Methane's remaining cost items at the frontier, per kg CH₄:
- energy $1.03 (mostly battery firming of the electrolyzer + DAC chain)
- DAC equipment $0.34
- other O&M $0.28
- air blower $0.12
- sorbent $0.11

That is a DAC and storage question, not a reactor question.

## Abundance scoreboard: before / after

"Before" is the recipes; "after" is `designs.units = simulatorOverride(PRESETS.lean.params)`, i.e. all three units lean and sun-following. Cost ratio = best pathway's cost ÷ market price.

| Material (market) | Scenario | Before: status, best pathway, $/kg (ratio), top blocker | After: status, best pathway, $/kg (ratio), top blocker |
|---|---|---|---|
| Methane (3.2 Gt/yr at $1.00) | today PV | blocked, sabatier, 27.47 (27.5), electrolyzer $14.20 | blocked, sabatier, 26.24 (26.2), electrolyzer $14.20 |
| Methane | frontier | blocked, sabatier, 2.080 (2.08), energy $1.036 | blocked, sabatier, 1.986 (1.99), energy $1.025 |
| Methanol ($0.40) | today PV | blocked, methanol, 22.92 (57.3), electrolyzer $14.32 | blocked, methanol, 22.38 (56.0), electrolyzer $14.32 |
| Methanol | frontier | blocked, methanol, 1.255 (3.14), energy $0.457 | blocked, methanol, 1.256 (3.14), energy $0.463 |
| Ethylene (157 Mt/yr at $0.80) | today PV | blocked, mto, 1.539 (1.92), methanol feed $0.914 | blocked, mto, **1.028 (1.29)**, methanol feed $0.914 |
| Ethylene | frontier | feasible, green-mto, 0.593 (0.74), energy $0.488 | feasible, green-mto, **0.500 (0.62)**, energy $0.381 |

The feasible share of world tonnage is unchanged: 40.39% at today's PV and 61.97% at the frontier. Ethylene was already feasible at the frontier in this version of the data. It now sits 25% above the "abundant" line (ratio ≤ 0.5). The frontier ethylene plant's energy line falls from $0.488 to $0.381/kg because the batteries and the H₂ buffer disappear.

## Architecture

1. **Methanol module** (~45 t/day at the 228 t/day scale, 5 modules).
   - Boiling-water tubular reactors: 7,258 tubes in all, 25 mm ID × 6 m, 1.5 mm carbon-steel walls at 60 bar, in six Ø1.4 m shells. Steam is at 240 °C / 34 bar and tubesheets are ~80 mm.
   - Cu/ZnO/Al₂O₃ catalyst (~4.3 m³ per module).
   - Feed/effluent interchanger, condenser, HP flash.
   - VFD-driven recip compressors: H₂ (4 stages from 1 bar) and CO₂.
   - A recycle circulator (ΔP 4 bar).
   - Shared single-column distillation with an MVR heat pump on the overhead.
   - Modules are switched in and out with the sun. A running module turns down to 30% by recycle and compressor speed.
2. **Hot standby.**
   - At dusk the feed stops. The loop is depressurized to a low-pressure H₂/N₂ blanket and held at ~200 °C. That is above the water/methanol dew point, and the catalyst stays reduced.
   - The boiling-water shell is the thermal store: night loss is 0.6% of the day's exotherm, and the loop coasts 12 K. No heater is needed.
   - Restart is a pressurize-and-feed ramp, not a cold reduction.
3. **Sabatier module** (lean).
   - Two cooled tubular stages (20 mm tubes, thermal oil at 6 bar) at 280 °C and 240 °C, with water knock-out between them.
   - 0.5% Ru/Al₂O₃ catalyst. It is active from ~240 °C and forms no nickel carbonyl at shutdown, which makes it the right catalyst for daily cycling.
   - Runs at 5 bar. The CH₄ product is compressed downstream.
   - A small hot-water accumulator stores reaction heat for the night.
   - Ni is the cost-down option once its cycling behaviour is proven (it needs an N₂/H₂ purge below ~230 °C).
4. **MTO** (lean).
   - Fixed-bed swing reactors (MTP-like) at 470 °C and 2 bar: beds online plus beds in regeneration, WHSV 1 h⁻¹.
   - Product compression to 30 bar, then a cold section.
   - Fixed beds tolerate daily stop/start far better than a fluidized reactor-regenerator, whose circulation and coke balance need continuous operation.
   - The cold box is the cycling risk. It is held cold overnight with stored refrigeration and the accumulator, at 3.6% of the exotherm.
5. **Controls.** A standardized skid PLC with gas analyzers and an SIS per module. Its cost scales with module size^0.3, so it dominates at a few hundred kg/day.

## Bill of materials (lean methanol, per kg CH₃OH/day at 228 t/day)

| Part | Material | kg per kg/day | Materials $ | Mfg × | $ per kg/day |
|---|---|---|---|---|---|
| Install (×1.3) | — | — | — | — | 7.07 |
| H₂ feed compressor (1 → 60 bar, 4 stages) | steel | 0.66 | 0.431 | 15 | 6.46 |
| Controls, analyzers, safety, engineering (5 trains) | — | — | — | — | 2.60 |
| Loop piping, valves, structure | steel | 1.2 | 0.792 | 3 | 2.38 |
| Catalyst charge (Cu/ZnO/Al₂O₃) | Cu, Zn, alumina | 0.11 | 0.573 | 3 | 1.72 |
| CO₂ feed compressor | steel | 0.17 | 0.111 | 15 | 1.66 |
| Foundations | concrete | 11 | 1.10 | 1.5 | 1.64 |
| Variable-speed drives ($45/kW) | — | — | — | — | 1.30 |
| Heat exchangers (22 m² per t/day) | steel | 0.65 | 0.425 | 3 | 1.27 |
| Recycle compressor | steel | 0.12 | 0.079 | 15 | 1.19 |
| MVR vapour compressor | steel | 0.091 | 0.059 | 15 | 0.89 |
| Flash drums | steel | 0.24 | 0.158 | 3 | 0.47 |
| Reactor tubes | steel | 0.19 | 0.121 | 3 | 0.36 |
| Reactor shells + heads | steel | 0.15 | 0.096 | 3 | 0.29 |
| Motors (copper + iron, all machines) | copper, steel | 0.10 | 0.22 | 3 | 0.65 |
| Assembly & commissioning labour | — | — | — | — | 0.28 |
| Packing, column, tubesheets, insulation | stainless, steel, refractory | 0.11 | 0.10 | 2–3 | 0.28 |
| Turndown H₂ buffer (47 kg) | — | — | — | — | 0.12 |
| **Total installed** | | | **4.26** | | **30.6** |
| Catalyst replacements (PV, 3-year life) | | | | | +5.6 → 36.2 in the override |

Where today's $113 goes instead:
- Install at 2.4× equipment: $66.
- One stick-built train's controls and engineering: $11.
- Compressors at ~70× their steel: $14.5.
- Piping at 1× equipment steel and heavy foundations: $11.6.

The cost-down path, in order of size:
1. Shop-built modules with a 1.3× install factor.
2. Compressors made like engine blocks (15× instead of 70×).
3. Standardized controls.
4. Lighter piping and civil works.
5. Pressurized H₂ from the electrolyzer, which deletes $6.5 and 0.36 kWh/kg.

## Build plan

| Phase | What | Scale | Duration | Indicative budget | Exit criteria |
|---|---|---|---|---|---|
| 0. Cycling catalyst bench | Microreactors: Cu/ZnO (methanol), Ru and Ni (methanation), SAPO-34 fixed bed. Daily ramp 0→100→0 plus a 16 h hot standby at 200 °C, replaying PVGIS days | g of catalyst | 4 months | ~$80k | Approach to equilibrium within ±10% of the model at 3 GHSVs. Activity loss after 300 cycles ≤ 1.33× the baseload rate (the model's 0.75 life factor). No Ni(CO)₄ above detection with the purge procedure |
| 1. Single full-length tube on solar H₂ | One 25 mm × 6 m methanol tube in a boiling-water jacket, fed by a ~50 kW electrolyzer on PV. Two Sabatier tubes in thermal oil | 10–20 kg/day MeOH | 6 months | ~$400k | Ramp 30→100% in < 15 min. Overnight coast ≤ 20 K with no heater. Per-pass yield and hot-spot ΔT within model ±15%. Sabatier tube sized by heat removal holds ≤ 40 K hot spot |
| 2. One module | One Ø1.4 m shell (~1,200 tubes), VFD recip H₂/CO₂ compressors, recycle circulator, MVR column. Pressurized-H₂ variant tested | 2–5 t/day | 9 months | ~$3M | Built cost ≤ $150/kg/day at this scale (model: lean ~$94 at 5 t/day, plus a first-of-kind margin). 150 consecutive sun-days with daily standby. Energy ≤ 0.8 kWh/kg incl. compression |
| 3. Pilot plant | 4 modules (~45 t/day MeOH) behind ~10 MW of lean electrolyzer and PV, plus a 500 kg/day Ru Sabatier skid and a fixed-bed MTO pilot (~2 t/day C₂H₄) | 45 t/day | 12 months | ~$10–15M | Installed ≤ $45/kg/day (methanol). Zero battery and zero H₂ buffer beyond the trickle buffer. Catalyst life ≥ 2.5 yr projected. Measured $/kg within 15% of `rankOpportunities` at the site |
| 4. Product | Module line (tube bundles, compressor frames, skids), 50 t/day standard methanol module, 5 t/day methanation module, MTO swing-bed module | 1–2 GW electrolyzer-equivalent/yr | — | — | Methanol ≤ $35/kg/day installed, MTO ≤ $25, Sabatier ≤ $100 at 5 t/day |

Instrumentation throughout: tube-wall thermocouples (hot spot), inlet/outlet gas analyzers (CO₂, CO, CH₄, MeOH), compressor power and speed, steam drum pressure and level, and a log of every start, stop and standby for catalyst-degradation fitting.

## Risks and open questions

- **Catalyst life under daily cycling** is the largest unknown. Cu sintering and ZnO redox under changing H₂O/H₂, Ru loss, and SAPO-34 coke and dealumination cycles are all assumed (× 0.75 life). Phase 0 measures them. If life halves, lean methanol's override rises from 0.34 to ~0.40, which is still far below today's-PV break-even of ~1.2. At the frontier, replacements sit inside the materials × 1.5 cap.
- **The cold section in MTO** (brazed aluminium, ethylene/ethane splitter) dislikes thermal cycling. The fallbacks are keeping it cold on stored refrigeration, or buffering crude olefins. A methanol buffer with a baseload MTO is not attractive: in the `mto` pathway, a baseload lean MTO needs 42 MWh of battery per 100 t/day and runs at an output factor of 0.80.
- **H₂ supply pressure** is a cross-design decision. With the atmospheric lean electrolyzer, the methanol loop pays 0.43 kWh/kg and $6.5/kg/day of H₂ compression. A 30 bar stack would remove both but costs electrolyzer BoP steel. This needs to be settled jointly.
- **MTO energy:** the recipe's 4 kWh/kg is a total-energy proxy. The lean bottom-up figure (0.84 kWh/kg) leans on feed/effluent heat recovery and a modest refrigeration duty. The today preset needs 3 kWh/kg of unexplained "other utilities" to match the recipe. Treat `energyFactor` 0.21 as optimistic until it is measured.
- **The recipes disagree on methanol scale.** The `methanol` pathway's node is $4,000/kg/day at a 5 kg/day demo reference; green-mto's is $210 at 2.3 t/day. The single `capexFactor`, computed at 228 t/day, gives the 500 kg/day methanol plant ~$690/kg/day. The design itself costs $289 there (0.14× its recipe), so the override understates the gain for that pathway by ~2.4×.
- **Screening grade throughout.** The equilibrium is ideal-gas, the kinetics are a one-point approach fit, the compressor masses and manufacturing factors are assumed, and the MTO separation train is lumped. Phases 0–2 replace these with measurements, which feed straight back into `engine/designs/synthesis.js`.

## Engine changes this design suggests (not made)

1. **Let the plant pick per-unit modes.** `designPlant` compares only two candidates: "each unit in its default mode" and "everything firmed". Mixes such as sun-following electrolyzer and synthesis with a baseload DAC (CO₂ buffered at $5/kg) are reachable only by passing `designs.units.dac(-solid)/gas-blower.flexible = false` by hand. In this data such a mix only ties the all-firmed plant ($1.44M vs $1.47M per output at 500 kg/day CH₄), but with a cheaper DAC it would win. A third candidate should be added: flip each flexible unit whose output buffer is cheap (CO₂, liquids) to baseload.
2. **Buffer base → flex edges too.** `operatingProfile` buffers only flex → base edges. A baseload DAC feeding a sun-following reactor needs a CO₂ buffer covering the night. It is small (~$5k per 500 kg CH₄/day) but is currently not costed.
3. **A standby-energy term for flexible units** (`standbyKWhPerKgDay`, served from a thermal store or battery at night). These reactors do not need it: night losses are 0.6–3.6% of their own exotherm and are stored as heat in the loop. Other sun-following units with no exotherm would.
4. **Absolute or scale-aware design overrides.** Allow `designs.units.<unit> = { usdPerKgDay, refKgPerDay, scaleExponent }` as an alternative to one `capexFactor`. That way a design re-prices the 5 kg/day demo recipe and the 2.3 t/day recipe each at its own scale (see the methanol scale risk above).
5. **A catalyst / consumable replacement line.** Today it is capitalized into `capexFactor` as present value. An explicit `replacementUsdPerKgDayYear` would put it in O&M where the cash-flow model belongs.
6. **Heat integration (low priority).** The Sabatier exotherm (2.86 kWh/kg CH₄ at 240–280 °C) could cover ~55% of DAC regeneration heat. The what-if (heat cut by 0.8 × 2.86 kWh/kg) moves methane only from $1.986 to $1.922 at the frontier, because heat is already stored cheaply.

## Reproduce

```js
const D = require('./engine/designs/synthesis.js');
D.design({ ...D.PRESETS.lean.params, reactor: 'methanol' });          // table above (also 'sabatier', 'mto')
D.sweep({ ...D.PRESETS.lean.params, reactor: 'methanol' }, 'pressureBar', [30, 50, 60, 80, 100]);
const units = D.simulatorOverride(D.PRESETS.lean.params);             // { methanol, sabatier, mto: { capexFactor, energyFactor, flexible } }
const C = require('./engine/company.js');
C.abundanceScoreboard({ pathways, markets, sites, config: { designs: { units } } });
// frontier: config = { pv: { capexUsdPerKWp: 75.8, floorUsdPerKWp: 25 }, idiotIndex: { target: 1.5, floors },
//   designs: { units: { ...E.simulatorOverride(E.PRESETS.lean.params), ...units } } }
// DAC-baseload variant: add dac / 'dac-solid' / 'gas-blower': { flexible: false } to units.
```
