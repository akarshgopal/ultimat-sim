# Design: sun-following catalytic synthesis reactors (methanol, Sabatier, MTO)

Status: concept design + build plan. Model: `engine/designs/synthesis.js` (tested in `tests/design-synthesis.test.js`). It covers three flowsheet units: `methanol`, `sabatier` and `mto`. Costs are screening estimates: a bill of materials at 2024–25 commodity prices (`data/bom.js`, plus zinc, alumina, ruthenium and a SAPO-34 raw-material mix in `DEFAULTS.extraCommodities`) times explicit manufacturing factors. Every number below regenerates from the module and the company simulator (see "Reproduce").

## Why this unit

The recipes treat synthesis loops as baseload. On solar alone, `engine/utilization.js` then firms their power with batteries through the night, and because the electrolyzer follows the sun, the H₂ feeding a baseload loop is buffered at ~$600/kg of compressed-gas storage. A reactor designed for wide turndown and a daily hot standby can follow the sun instead (`flexible: true`): no batteries and no H₂ buffer, but ~3.4× nameplate, so its installed $ per kg/day must be low.

**Short answer:**
- **Ethylene (green-mto):** a sun-following methanol + MTO train wins at today's and 10× cheaper PV. At today's PV green-mto drops from $3.68 to $2.75/kg; sun-following beats the lean baseload loop until methanol and MTO capex reach ~3.3× the lean design, about the recipe level. At the frontier it drops from $0.509 to $0.405/kg (cost ratio 0.64 → 0.51).
- **E-methane and e-methanol:** with every other lean design at the frontier (DAC included) they are already feasible, and the whole chain follows the sun. The reactor design moves methane $0.679 → $0.655/kg and methanol $0.317 → $0.315/kg. At today's PV the methane plant is firmed and the design moves it ~1%. Their cost is energy and other O&M, not the reactor.

## Requirements

| Requirement | Target | Why |
|---|---|---|
| Operating profile | Follow the electrolyzer's H₂ 0 → 100% → 0 each day, ~7 full-load h/day; hot standby ~16 h | No battery firming and no H₂ buffer ($600/kg). The simulator oversizes it ~3.4× |
| Turndown | Each module ≥ 30% (methanol, MTO fixed bed) / 20% (Sabatier); ≥ 4 modules switched with the sun | ≤ 0.2% of daily H₂ arrives below minimum load; a small trickle buffer covers it (costed) |
| Installed cost (lean) | Methanol ≤ $35/kg/day at ~230 t/day; MTO ≤ $25/kg/day at 100 t/day; Sabatier ≤ $100/kg/day at 5 t/day, ~$62 at ≥ 50 t/day | At today's PV the break-even against baseload is ~3.3× higher; at the frontier the squeeze leaves only materials and kWh/kg |
| Night | Stay above ~200 °C with no heater, using stored reaction heat; no cold starts | Cu/ZnO avoids water condensation and redox cycling; Ni avoids carbonyl; MTO avoids a cold restart |
| Catalyst | ≥ 3 years at daily cycling (the model assumes 0.75 × the baseload life) | Replacements are capitalized into the override |
| Energy | Methanol ≤ 0.75 kWh/kg including H₂ compression from 1 bar; Sabatier ≤ 0.6 kWh/kg; MTO ≤ 1 kWh/kg | Compression is most of it; every 0.1 kWh/kg is < 1% of the chain's PV |

## Model

- **Equilibrium.** Methanol: Graaf constants (CO + 2H₂ ⇌ CH₃OH, log₁₀K₁ = 5139/T − 12.621; RWGS log₁₀K₂ = −2073/T + 2.029; K₃ = K₁K₂), solved for both extents by nested bisection from a stoichiometric CO₂ + 3H₂ feed. Sabatier: van 't Hoff with ΔH° = −165 kJ/mol and ΔG°₂₉₈ = −113.5 kJ/mol, staged with water knock-out between stages.
- **Kinetics (screening).** Approach to equilibrium 1 − exp(−k/GHSV), k fitted per catalyst at a reference point and scaled by Arrhenius: Cu/ZnO 85% of equilibrium at 8,000 h⁻¹ and 250 °C (60 kJ/mol); Ni 95% at 5,000 h⁻¹ and 320 °C; Ru 97% at 6,000 h⁻¹ and 260 °C.
- **Methanol loop.** Single-pass yield Y sets the recycle ratio (1/Y − 1); catalyst volume = inlet Nm³/h ÷ GHSV. Boiling-water-cooled tubes with Barlow walls at loop pressure (118 MPa allowable, plus corrosion allowance and a minimum wall); tube count is the larger of the catalyst-volume and heat-removal (U·ΔT) needs. Shells and tubesheets are sized at the larger of loop and steam pressure. Interchanger and condenser areas come from duty, U and LMTD. Distillation reboiler duty is (R+1)·λ; 85% of the 250 °C exotherm is reused and an MVR heat pump (COP 4) supplies the balance.
- **Compressors.** Multistage, intercooled (≤ 3:1 per stage, 75% efficient). Package steel ~35 kg/kW at 1 MW, heavier when smaller, halved for CO₂, hydrocarbons and vapour. Motor copper and iron are separate lines. Sun-following adds VFDs.
- **Sabatier.** Lean: two cooled isothermal tubular stages with thermal oil in the shell at 6 bar (boiling water at 300 °C would need an 86 bar shell); tubes are sized by heat removal, not catalyst volume. Today: TREMP-style adiabatic Ni beds with hot recycle (recycle ≈ ΔT_full/ΔT_allowed − 1).
- **MTO.** Fixed-bed swing reactors (lean) or a fluidized reactor-regenerator (today). Catalyst inventory from WHSV. Energy = product-gas compression + cold-section refrigeration (COP) + net feed heat after feed/effluent recovery + other utilities. The separation train is lumped steel, stainless and aluminium per kg/day.
- **Sun-following extras.** Insulation sized on reactor plus piping area. Night loss is compared with the thermal mass (steel, catalyst, coolant); if the overnight drop would exceed 40 K, a pressurized-water accumulator stores the day's reaction heat. A small H₂ buffer covers time below minimum load. At least 4 modules, VFDs, catalyst life × 0.75.
- **Scale and fixed costs.** Controls, analyzers, safety, engineering and assembly are charged per train, scaling with train size^0.3; the install factor goes on top.
- **Catalyst replacements** are capitalized as present value at 8% over 25 years and carried inside `capexFactor` (the simulator has no catalyst line).
- **The override.** `capexFactor` = (installed + catalyst-replacement PV) ÷ the recipe at the same scale (the engine's 0.85 exponent), compared at the scoreboard plant (100 × the recipe reference): 228 t MeOH/day (green-mto basis), 100 t CH₄/day and 100 t C₂H₄/day. `energyFactor` = kWh/kg ÷ the recipe's. `materialsFactor` = raw materials ÷ the same recipe. `flexible` = `operation !== 'baseload'`.

## Model results (scoreboard scale)

| | Methanol today | Methanol lean | Sabatier today | Sabatier lean | MTO today | MTO lean |
|---|---|---|---|---|---|---|
| Scale | 228 t/day | 228 t/day | 100 t/day | 100 t/day | 100 t C₂H₄/day | 100 t/day |
| Design | 75 bar, 38 mm tubes, single train, baseload | 60 bar, 25 mm × 6 m tubes, 5 modules, sun-following | 20 bar, 3 adiabatic Ni beds + hot recycle (2.2×) | 5 bar, 2 cooled stages, 0.5% Ru, 280/240 °C, 20 modules | Fluidized + regenerator | Fixed-bed swing beds |
| Installed $/kg/day | **$113** | **$30.6** | **$139** | **$62.2** | **$157** | **$23.7** |
| Recipe at this scale | $105 | $105 | $150 | $150 | $96 | $96 |
| Catalyst replacement PV | $5.5 | $5.6 | $9.5 | $30.4 | $33.4 | $9.8 |
| Override `capexFactor` | 1.13 | **0.34** | 0.99 | **0.62** | 1.98 | **0.35** |
| Override `materialsFactor` | 0.046 | 0.040 | 0.035 | 0.054 | 0.068 | 0.039 |
| kWh/kg (recipe) | 0.88 (0.50) | 0.72 (0.50) | 0.33 (1.00) | 0.60 (1.00) | 3.99 (4.00) | 0.84 (4.00) |
| `energyFactor` | 1.76 | 1.43 | 0.33 | 0.60 | 1.00 | 0.21 |
| Raw materials $/kg/day | 4.81 | 4.26 | 5.19 | 8.16 | 6.55 | 3.77 |
| Idiot index | 23.5× | 7.2× | 26.7× | 7.6× | 24.0× | 6.3× |
| Single pass / conversion | 19.5% (eq. 22.9%), recycle 4.1× | 15.9% (eq. 18.7%), recycle 5.3× | 99.6%, CH₄ 97.9% dry | 99.6%, CH₄ 98.0% dry | — | — |
| Hot standby | — | 0.6% of daily exotherm, coasts 12 K overnight (no heater) | — | 0.2% of exotherm, coasts 28 K (no heater) | — | 3.6% of exotherm, 118 K drop → 10 t water accumulator |

- **The reactor is not the cost.** In lean methanol, tubes, shells and tubesheets are $0.7 of $30.6 per kg/day. The H₂ feed compressor (1 → 60 bar) is $6.5, install $7.1, controls $2.6, piping $2.4. Today's cost is mostly the 2.4× install factor and compressors at 70× their steel price.
- **H₂ compression is the price of the atmospheric lean electrolyzer.** It adds 0.43 kWh/kg MeOH, which is why lean `energyFactor` is above 1 (today's is higher still, from distillation heat with no heat pump). Feeding 30 bar H₂ cuts lean methanol to $21.9/kg/day and 0.35 kWh/kg; that needs to be settled with the electrolyzer design.
- **The optimal methanol pressure is shallow.** Lean methanol costs $42.4 at 30 bar, $32.2 at 50, $30.6 at 60, $29.8 at 70 and $28.5/kg/day at 100 bar. kWh/kg bottoms out at ~0.71 near 50–60 bar (recycle compression falls with pressure, feed compression rises). Per-pass yield is 6.9% / 13.2% / 15.9% / 20.6% at 30/50/60/80 bar, with recycle falling from 13.4× to 3.9×. Higher temperature lowers the yield: 16.4% at 230 °C, 12.7% at 270 °C.
- **Sabatier should run at low pressure.** Conversion stays ≥ 99.4% from 2 to 20 bar, while energy rises from 0.29 kWh/kg at 2 bar to 1.10 at 20 bar because all 5 mol of feed are compressed. Compress the 1 mol of CH₄ product afterwards instead. At 100 t/day the Ru charge ($13.3) and its replacements ($30.4 PV) are the largest items; Ni is the cost-down option once its cycling is proven.
- **The sun-following premium on the unit is small.** Lean methanol run baseload is $28.7/kg/day against $30.6 sun-following (VFDs, more modules, thicker insulation, trickle buffer); catalyst life × 0.75 adds ~$1.6 of replacement PV.
- **Installed cost vs scale (lean / today, $/kg/day):** methanol 289 / 2,385 at 500 kg/day; 94 / 587 at 5 t/day; 42 / 189 at 50 t/day; 30.6 / 113 at 228 t/day; 29.9 / 73.7 at 2,000 t/day. Sabatier 296 / 2,353 at 500 kg/day; 100 / 566 at 5 t/day; 62 / 180 at 50 t/day. MTO 71 / 587 at 5 t/day; 20 / 126 at 228 t/day.

## Flexible vs baseload in the company simulator

$/kg of product at the best site, scoreboard size (100 × reference). Frontier = PV capex and floor ÷10, idiot-index target 1.5 with `Bom.floors()`, every other design at its lean preset. At the frontier, recipe units are squeezed to their cost class's floor and designed units to their own materials × 1.5 (`materialsFactor`); a designed unit without `materialsFactor` is not squeezed.

| Pathway | Scenario | Recipe (baseload) | Today preset (baseload) | Lean, forced baseload | **Lean, sun-following** | Recipe capex, sun-following |
|---|---|---|---|---|---|---|
| green-mto (ethylene) | today PV | 3.683 | 3.885 | 3.120 | **2.753** | 3.217 |
| green-mto (ethylene) | frontier | 0.509 | 0.533 | 0.438 | **0.405** | 0.914 (not squeezed) |
| mto (purchased MeOH) | today PV | 1.539 | 1.583 | 1.071 | **1.028** | 1.267 |
| mto (purchased MeOH) | frontier | 0.859 | 0.882 | 0.790 | **0.761** | 1.088 (not squeezed) |
| sabatier (methane) | today PV | 7.885 | 7.783 | 7.797 | 7.801 | 7.885 |
| sabatier (methane) | frontier | 0.679 | 0.653 | 0.662 | **0.655** | 0.860 (not squeezed) |
| methanol | today PV | 3.556 | 3.619 | 3.560 | 3.562 | 3.556 |
| methanol | frontier | 0.317 | 0.328 | 0.323 | **0.315** | 0.444 (not squeezed) |

The green-mto plant (100 t C₂H₄/day, Walvis Bay) at the frontier:
- **Lean, baseload:** 123 MWh of battery plus a $2.44M H₂ buffer (24.7 t H₂), $7.5M of firming storage next to $33.0M of PV, output factor 0.80 (winter months cannot hold the turndown floor).
- **Lean, sun-following:** no battery or buffer, 3.4× nameplate on 7.0 full-load h/day, output factor 1.00, PV $40.0M.

**Break-even capex.** At today's PV, sun-following beats the lean baseload loop until methanol and MTO capex reach ~3.3× the lean `capexFactor` (~$100 per kg MeOH/day and ~$80 per kg C₂H₄/day), about the recipe level. The trade is won mainly by deleting storage. At the frontier there is no break-even: designed units are capped at ~1.5× materials, so 3.4× nameplate is nearly free.

**Methane and methanol.** The utilization model compares two plants: every flexible unit sun-following (with buffers to firmed units), or everything firmed on PV + battery. At today's PV the methane plant is firmed either way, so a flexible reactor just joins a firmed plant. At the frontier, with the lean DAC, the sun-following plant wins by a wide margin and the reactor follows it. Either way, the synthesis unit is ≤ $0.03/kg of methane or methanol; at today's prices Sabatier's lower kWh/kg is what moves the cost.

## Abundance scoreboard

Today = default config. Frontier as above. Cell: status, cost ÷ price, $/kg, top items.

| | e-methanol (106 Mt, $0.40) | e-methane (3.2 Gt, $1.00) | ethylene (157 Mt, $0.80) |
|---|---|---|---|
| Today, recipe | blocked 8.89× ($3.56: energy 2.34, gas-blower 0.60) | blocked 7.89× ($7.89: energy 5.51, gas-blower 1.13) | blocked 1.92× (mto, $1.54: methanol-feed 0.91, energy 0.55) |
| Today, lean synthesis only | blocked 8.91× ($3.56) | blocked 7.80× ($7.80) | blocked **1.29×** (mto, $1.03: methanol-feed 0.91) |
| Frontier, every lean design except synthesis | feasible 0.79× ($0.317) | feasible 0.68× ($0.679) | feasible 0.64× (green-mto, $0.509: energy 0.49) |
| Frontier, every lean design | feasible 0.79× ($0.315: energy 0.19, other 0.10, methanol 0.01) | feasible 0.66× ($0.655: energy 0.44, other 0.15, sabatier 0.03) | feasible **0.51×** (green-mto, $0.405: energy 0.38, other 0.08) |

The synthesis design does not change the frontier feasible share (93.6%); its effect is ethylene's energy line ($0.488 → $0.378/kg), because batteries and the H₂ buffer disappear. Ethylene sits just above the "abundant" line (ratio ≤ 0.5).

## Architecture

1. **Methanol module** (~45 t/day at the 228 t/day scale, 5 modules).
   - Boiling-water tubular reactors: 7,258 tubes in all, 25 mm ID × 6 m, 1.5 mm carbon-steel walls at 60 bar, in six Ø1.4 m shells; steam at 240 °C / 34 bar; tubesheets ~80 mm.
   - Cu/ZnO/Al₂O₃ catalyst (~4.3 m³ per module).
   - Feed/effluent interchanger, condenser, HP flash.
   - VFD-driven recip compressors for H₂ (4 stages from 1 bar) and CO₂, and a recycle circulator.
   - Shared single-column distillation with an MVR heat pump on the overhead.
   - Modules switch in and out with the sun; a running module turns down to 30% by recycle and compressor speed.
2. **Hot standby.** At dusk the feed stops, the loop is depressurized to a low-pressure H₂/N₂ blanket and held at ~200 °C, above the water/methanol dew point with the catalyst still reduced. The boiling-water shell is the thermal store (night loss 0.6% of the day's exotherm, 12 K coast); no heater. Restart is a pressurize-and-feed ramp, not a cold reduction.
3. **Sabatier module** (lean). Two cooled tubular stages (20 mm tubes, thermal oil at 6 bar) at 280 °C and 240 °C with water knock-out between them; 0.5% Ru/Al₂O₃, active from ~240 °C and free of nickel carbonyl at shutdown. Runs at 5 bar; CH₄ is compressed downstream. Ni is the cost-down option once proven (it needs an N₂/H₂ purge below ~230 °C).
4. **MTO** (lean). Fixed-bed swing reactors (MTP-like) at 470 °C and 2 bar, WHSV 1 h⁻¹, beds online plus beds in regeneration; product compression to 30 bar, then a cold section. Fixed beds tolerate daily stop/start far better than a fluidized reactor-regenerator. The cold box is the cycling risk; it is held cold overnight with stored refrigeration and the accumulator (3.6% of the exotherm).
5. **Controls.** Standardized skid PLC with gas analyzers and an SIS per module; cost scales with module size^0.3, so it dominates at a few hundred kg/day.

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
| Motors (copper + iron, all machines) | copper, steel | 0.10 | 0.22 | 3 | 0.65 |
| Flash drums | steel | 0.24 | 0.158 | 3 | 0.47 |
| Reactor tubes | steel | 0.19 | 0.121 | 3 | 0.36 |
| Reactor shells + heads | steel | 0.15 | 0.096 | 3 | 0.29 |
| Assembly & commissioning labour | — | — | — | — | 0.28 |
| Packing, column, tubesheets, insulation | stainless, steel, refractory | 0.11 | 0.10 | 2–3 | 0.28 |
| Turndown H₂ buffer (47 kg) | — | — | — | — | 0.12 |
| **Total installed** | | | **4.26** | | **30.6** |
| Catalyst replacements (PV) | | | | | +5.6 → 36.2 in the override |

Where today's $113 goes instead: install at 2.4× equipment ($66), one stick-built train's controls and engineering ($11), compressors at 70× their steel ($14.5), piping at 1× equipment steel and heavy foundations ($11.6).

Cost-down path, in order of size:
1. Shop-built modules with a 1.3× install factor.
2. Compressors made like engine blocks (15× instead of 70×).
3. Standardized controls.
4. Lighter piping and civil works.
5. Pressurized H₂ from the electrolyzer, which deletes most of the $6.5 H₂ compressor and 0.36 kWh/kg.

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

- **Catalyst life under daily cycling** is the largest unknown. Cu sintering and ZnO redox under changing H₂O/H₂, Ru loss, and SAPO-34 coking and dealumination are all assumed (× 0.75 life); Phase 0 measures them. The Ru charge and its replacements are almost half of lean Sabatier's override ($43.7 of $92.6 per kg/day), so Ru life matters most. At today's PV, lean methanol has ~3× headroom before sun-following stops paying; at the frontier, replacements sit inside the materials × 1.5 cap.
- **The MTO cold section** (brazed aluminium, ethylene/ethane splitter) dislikes thermal cycling. Fallbacks: keep it cold on stored refrigeration, or buffer crude olefins.
- **H₂ supply pressure** is a cross-design decision: the atmospheric lean electrolyzer costs the methanol loop 0.43 kWh/kg and $6.5/kg/day of compression; a 30 bar stack removes both but costs electrolyzer BoP steel.
- **MTO energy:** the recipe's 4 kWh/kg is a total-energy proxy. The lean bottom-up 0.84 kWh/kg leans on feed/effluent heat recovery and a modest refrigeration duty; the today preset needs 3 kWh/kg of unexplained "other utilities" to match the recipe. Treat `energyFactor` 0.21 as optimistic until measured.
- **Screening grade throughout.** Ideal-gas equilibrium, one-point kinetics fits, assumed compressor masses and manufacturing factors, a lumped MTO separation train. Phases 0–2 replace these with measurements, which feed back into `engine/designs/synthesis.js`.

## Engine changes recommended (open)

1. **Per-unit modes in `designPlant`.** It compares only "each unit in its default mode" and "everything firmed". Mixes such as a sun-following reactor with a baseload DAC need `flexible: false` passed by hand. Add a candidate that flips flexible units with a cheap output buffer (CO₂, liquids) to baseload.
2. **Buffer base → flex edges.** `operatingProfile` buffers only flex → base edges; a baseload DAC feeding a sun-following reactor needs an uncosted CO₂ buffer for the night.
3. **A standby-energy term for flexible units** (`standbyKWhPerKgDay`). These reactors cover night losses from their own exotherm; units with no exotherm would not.
4. **A catalyst replacement line.** Replacements are capitalized into `capexFactor`; an explicit replacement $/yr would put them in O&M where the cash-flow model belongs.
5. **Heat integration (low priority).** The Sabatier exotherm (2.86 kWh/kg CH₄ at 240–280 °C) could cover part of the DAC regeneration heat.

## Reproduce

```js
const D = require('./engine/designs/synthesis.js');
D.design({ ...D.PRESETS.lean.params, reactor: 'methanol' });          // tables above (also 'sabatier', 'mto')
D.sweep({ ...D.PRESETS.lean.params, reactor: 'methanol' }, 'pressureBar', [30, 50, 60, 80, 100]);
const units = D.simulatorOverride(D.PRESETS.lean.params);             // { methanol, sabatier, mto }
// Frontier: config = { pv: { capexUsdPerKWp: 75.8, floorUsdPerKWp: C.DEFAULTS.pv.floorUsdPerKWp / 10 },
//   idiotIndex: { target: 1.5, floors: Bom.floors() }, designs: { units: { ...every design's lean override } } }
// Baseload variant: simulatorOverride({ ...D.PRESETS.lean.params, operation: 'baseload' }).
```
