# Design: solar-matched hydrogen DRI/HBI shaft furnace

Status: concept design + build plan. Model: `engine/designs/dri-shaft.js` (tested in `tests/design-dri-shaft.test.js`). It replaces the flowsheet unit `hydrogen-dri` in the pathways `h2-dri` (bought H₂) and `green-h2-dri` (own electrolyzer). Both buy DR-grade concentrate and pelletize it on site (`pellet-plant`, see `docs/designs/pellet-plant.md`). Costs are screening estimates: a bill of materials at 2024–25 commodity prices (`data/bom.js`) times explicit manufacturing factors, plus installation and fixed plant costs. Every number below regenerates from the model and the company simulator, at a 100 t Fe/day plant, the size the abundance scoreboard prices (1,000 kg/day reference × 100).

## Why this unit

DRI/HBI ("steel" in the scoreboard) is a 158 Mt/yr market at $0.40/kg. At today's PV it is blocked at 1.64× price; after the DR-grade concentrate ($0.207/kg Fe) the `hydrogen-dri` unit's equipment is the largest item ($0.165/kg), ahead of energy ($0.118, mostly batteries firming a baseload shaft). The recipe's shaft is a screening placeholder: $840 per kg Fe/day at the 1 t/day reference (about $2,300 per annual tonne) and $421 per kg/day after the engine's scale factor at 100 t/day, 5–10× what large DRI plants cost per tonne.

## Requirements

| Requirement | Target | Why |
|---|---|---|
| Product | HBI, ≥ 92% metallization, hot-briquetted at ~700 °C | Ships as dry bulk; does not re-oxidize like loose DRI |
| Reductant | Electrolytic H₂, atmospheric supply (~1.1 bar) | Matches the lean electrolyzer. Carbon-free: no reformer, no CO₂ loop |
| Installed cost | ≤ $50 per kg Fe/day at 100 t/day; ≤ $15 at ≥ 1,000 t/day | Makes the unit < 5% of the $0.40/kg price |
| Energy (shaft only, H₂ excluded) | ≤ 0.6 kWh/kg Fe; ΔH = 0.246 kWh/kg is the floor | At $0.03/kWh effective, every 0.1 kWh/kg costs $0.003/kg |
| Operation on sunlight | 24 h burden movement; night heat from a PV-charged heat store, not a battery | See "Sun-following vs baseload" |
| Water | Condensate (~0.47 kg/kg Fe) goes back to the electrolyzer | Desert site with no cooling water: air-cooled knock-out |

## Model results (100 t Fe/day)

| | Today (first-of-a-kind field-built H₂ shaft) | Lean solar-matched target |
|---|---|---|
| Installed | **$401 per kg/day** ($1,098 per t/yr) | **$39 per kg/day** ($107 per t/yr) |
| Recipe at this size | $421 per kg/day (capexFactor **0.95**) | $421 (capexFactor **0.093**) |
| Raw materials | $5.8 per kg/day | $2.4 per kg/day |
| Idiot index | 69× | 16× (6× at 5,000 t/day) |
| Energy | 0.819 kWh/kg (energyFactor 1.17) | **0.569 kWh/kg** (energyFactor **0.81**) |
| Heater / compressors | 0.717 / 0.058 kWh/kg | 0.465 / 0.062 kWh/kg |
| Shaft | 1.03 m bore × 32 m, 5 t Fe/h/m², 6 h residence | 0.87 m bore × 29 m, 7 t Fe/h/m², 4.5 h residence |
| H₂ loop | λ 3.33 (30% H₂ used per pass), no recuperator, top gas 407 °C | λ 2.78 (36% per pass), recuperator ε 0.7 (99 m²), top gas 262 °C → recycle preheated to 195 °C |
| Gas preheat | 2.9 MW AC heater + SCR, 950 °C | DC-direct elements, 900 °C; 6 MW of elements charge a firebrick heat store in sun hours |
| Operation | Baseload, battery-firmed | Baseload on a heat store (`thermal: true`). Sun-following variant: $38 per kg/day, 0.681 kWh/kg, `flexible: true` |
| Override `materialsFactor` | 0.0138 | 0.0057 |

**Heat and mass balance (lean, per kg Fe).** Pellets are 1.48 kg at 67.5% Fe. H₂ consumption is 0.052 kg (94% metallization) with 0.150 kg circulated; gas flow 1,720 Nm³/t. The gas heater supplies 0.45 kWh, which goes to the reaction (0.234), hot HBI at discharge (0.141), shell loss (0.027) and top gas the recuperator does not recover. The thermodynamic floor is ΔH°₂₉₈ = 0.246 kWh/kg Fe. The H₂ balance needs λ ≥ 1.74 for the Fe/FeO equilibrium at the bustle (the wüstite stage, which removes ⅔ of the oxygen) and λ ≥ 2.73 to carry the reaction and discharge heat in as sensible heat. **An H₂ shaft is heat-limited, not equilibrium-limited**, which is why it circulates ~3× the stoichiometric H₂.

**Design levers (lean baseline, 0.569 kWh/kg):**

- **Inlet temperature has an optimum at the heat pinch:** 0.581 kWh/kg at 800 °C (heat-limited, λ 3.21), 0.571 at 850, 0.569 at 900, 0.583 at 950, 0.597 at 1,000. Above ~900 °C hotter gas only heats gas that leaves through the top.
- **Recuperation:** ε 0 → 0.673, 0.5 → 0.599, 0.7 → 0.569, 0.85 → 0.547 kWh/kg. The exchanger costs ~$0.1 per kg/day: the cheapest kWh in the plant.
- **Burning H₂ for heat** (with electrolyzer O₂ in the bustle) saves ~$1.5 per kg/day of heater but burns 0.016 kg H₂/kg Fe (+30% H₂ use): 0.94 kWh-equivalent/kg against 0.57 for electric heating. Resistive heating wins wherever H₂ comes from electricity.
- **Shaft pressure:** at 1.3 bar abs the superficial gas velocity is 7.4 m/s and the total 0.608 kWh/kg; at 2.5 bar, 4.0 m/s and 0.569; at 5 bar, 2.0 m/s and 0.561. Run at 2.5–3 bar; gas then lifts ≤ 21% of the burden weight (Ergun).

**Modular vs world-scale.** Hardware is cheap; fixed costs per plant and per shaft (engineering, instruments, safety systems) dominate small plants:

| Plant | 25 t/day | 100 t/day | 300 t/day | 1,000 t/day | 5,000 t/day |
|---|---|---|---|---|---|
| Lean, $ per kg/day (shafts) | 142 (1) | **39** (1) | 18.5 (2) | 10.2 (4) | 8.1 (20) |
| Today-style, $ per kg/day | 1,487 | **401** | 195 | 105 | 86 ($235/t-yr ≈ large DRI plants) |
| Recipe in the engine at that size | 518 | 421 | 357 | 336 | 336 |

At 1,000 t/day, lean plants cost $21.4 per kg/day with 20 × 50 t/day shafts, $10.2 with 4 × 250 t/day and $7.9 with one 2.75 m shaft; built today-style, $283, $105 and $70. The answer is **standard shop-built ~250 t/day shafts** (≤ 2.3 m bore, truckable shell) repeated with one engineering package; the last 25% of scale economy is not worth giving up factory production. The engine's 0.4 scale floor keeps the recipe at $336 per kg/day at any size, while a today-style build-up reaches large-plant cost at ~$86.

### Sun-following vs baseload

The shaft is a ~5 h solids-residence, ~100 t refractory-and-burden thermal mass. It can ramp (burden descent follows gas flow), but stopping it every night risks clustering, refractory spalling and off-spec metallization.

- **Battery-firmed baseload** is the worst: night heat from a $350/kWh battery costs more than the shaft.
- **Sun-following** (`flexible: true`) is better: the engine oversizes the shaft for sun hours, which the lean shaft can afford; hot standby adds 0.11 kWh/kg.
- **Baseload on a PV-charged heat store is best.** 82% of the shaft's energy is gas preheat, so it can be stored as heat in firebrick ($40/kWh_th in `engine/utilization.js`) and blown through to the bustle at night. The shaft runs 24 h at constant conditions, which also removes the process risk of sun-following. The heater elements are sized ~3× to charge the store in sun hours (in the BOM).

So the shaft is marked `thermal: true`, not `flexible`.

### Abundance scoreboard

`abundanceScoreboard` (sizeMultiple 100, best site). Today = default config. Frontier = PV capex and floor ÷10, idiot-index target 1.5 with `Bom.floors()`, every other design at its lean preset.

| Scenario | Shaft | Status | Best pathway | Cost ÷ price | Top cost items ($/kg Fe) |
|---|---|---|---|---|---|
| Today | recipe | blocked | h2-dri | 1.64× | concentrate 0.207, unit 0.165, energy 0.118, H₂ 0.113 |
| Today | today design | blocked | h2-dri | 1.66× | concentrate 0.207, unit 0.159, energy 0.133, H₂ 0.113 |
| Today | lean, battery-firmed | blocked | h2-dri | 1.21× | concentrate 0.207, H₂ 0.113, energy 0.097, unit 0.016 |
| Today | lean, sun-following | blocked | h2-dri | 1.17× | concentrate 0.207, H₂ 0.113, energy 0.048, unit 0.033 |
| Today | **lean, heat store** | blocked | h2-dri | **1.09×** | concentrate 0.207, H₂ 0.113, energy 0.046, unit 0.016 |
| Frontier | recipe | feasible | green-h2-dri | 0.75× | concentrate 0.207, energy 0.062, other 0.038, unit 0.014 |
| Frontier | today design | feasible | green-h2-dri | 0.74× | |
| Frontier | lean, battery-firmed | feasible | green-h2-dri | 0.72× | |
| Frontier | lean, sun-following | feasible | green-h2-dri | 0.71× | |
| Frontier | **lean, heat store** | feasible | green-h2-dri | **0.70×** | concentrate 0.207, energy 0.053, other 0.038, unit 0.003 |

With recipes only, the frontier steel row is feasible at 0.77×. The design does not change the feasible share of world tonnage (39.5% today, 93.6% at the frontier): at the frontier the idiot-index squeeze already caps the recipe shaft, and today steel stays blocked by its feeds.

### What blocks steel after the shaft

With the lean shaft the unit falls from the second-largest item ($0.165/kg) to ~$0.016/kg, about 4% of price. Steel is then gated by its feeds:

- **Ore is the largest item everywhere:** 1.48 kg of DR-grade concentrate at $0.13/kg + $0.01 freight = **$0.207/kg Fe**, 48% of the lean cost today and 74% at the frontier. Ore grade and price are the next lever: cheaper concentrate, or reducing lower-grade ore with more gangue (`pelletFeFraction`; at 65% Fe kWh/kg rises from 0.569 to 0.580, and the cost lands in EAF slag, outside this unit).
- **H₂** is next today: $0.113/kg as purchased $2/kg H₂. At the frontier the plant makes its own (`green-h2-dri`) and electrolysis is inside energy.
- **Energy for the shaft itself** is small once it is stored as heat (~$0.05/kg).

## Architecture

1. **Shaft** — vertical moving-bed reactor with counter-current gas.
   - Lean standard module: 0.87 m bore at 100 t/day, up to ~2.3 m at 250 t/day. About 29 m tall: a 23 m reduction zone (4.5 h at 5.2 m/h burden descent), a top seal leg and distributor, and a discharge cone.
   - 10 mm SA-516 shell, shop-welded in truckable sections.
   - 0.30 m lining: dense high-alumina hot face plus insulating castable. The shell stays at ~150 °C, so carbon steel never sees hot hydrogen.
   - 2.5 bar abs at the top; Ergun bed pressure drop ~1.1 bar.
2. **Gas loop**
   - **Bustle → shaft → top gas** (262 °C, ~40% steam).
   - **Recuperator** (stainless shell-and-tube, ε 0.7) preheats the recycle gas to ~195 °C.
   - **Air-cooled knock-out condenser** to 40 °C; condensate (already distilled) goes to the electrolyzer feed.
   - **Recycle compressor** (PR ~1.5) plus make-up H₂ compression from 1.1 bar.
   - **Heater** to 900 °C, then the bustle.
3. **Preheat and night heat**
   - FeCrAl/NiCr resistive elements switched straight onto PV strings in banks, with no inverter or rectifier: staged contactors cost ~$12/kW of power control against ~$70/kW for AC + SCR.
   - The elements sit in a firebrick regenerator: by day PV heats brick and gas together; by night recycle gas is blown through the hot brick to bustle temperature.
   - The store holds ~16 h of 0.45 kWh/kg heater duty: ~30 MWh_th per 100 t/day, ~180 t of firebrick at a 600 K swing. The engine prices it at $40/kWh_th (~$12 per kg/day), outside the BOM below.
   - Compressors, fans and the press (~0.1 kWh/kg) still need battery or night PV; the engine's thermal path treats all the unit's energy as heat, a small error.
4. **Pellet handling** — reclaim, screen (< 6 mm fines rejected), conveyors, a day bin on top of the shaft. Burden enters through a gas-sealed leg purged with recycle gas.
5. **HBI** — hot discharge at ~700 °C through burden feeders to a hot-briquetting roller press (one up to 60 t/h); briquettes cooled on a quench conveyor.
6. **Safety** — N₂ inerting for startup and shutdown, a flare for loop venting, H₂ detection, SIS trips on bustle temperature (sticking) and loop O₂.

## Bill of materials (lean design, per kg Fe/day at 100 t/day)

| Part | Material | kg per kg/day | Materials $ | Mfg × | $ per kg/day |
|---|---|---|---|---|---|
| Engineering, permits, owner (per plant) | — | — | — | — | 15.00 |
| Instruments, gas analysers, DCS/SIS, H₂ safety | — | — | — | — | 11.00 |
| Installation (× 1.35) | — | — | — | — | 6.25 |
| Auxiliaries: N₂, flare, dust collection, HBI cooling, control room | steel | 0.447 | 0.290 | 3.5 | 1.02 |
| Heater power control (DC staging) | — | — | — | — | 0.72 |
| Pellet handling | steel | 0.404 | 0.263 | 2.5 | 0.66 |
| Shaft refractory lining | refractory | 0.537 | 0.322 | 2 | 0.64 |
| Hot briquetting press frame | steel | 0.164 | 0.107 | 4 | 0.43 |
| Auxiliaries, alloy service | stainless | 0.050 | 0.099 | 3.5 | 0.35 |
| Charging, seal legs, burden feeders | steel | 0.153 | 0.099 | 3.5 | 0.35 |
| Heater power copper | copper | 0.024 | 0.220 | 1.5 | 0.33 |
| Tower structure, platforms | steel | 0.237 | 0.154 | 2 | 0.31 |
| Pellet yard pads | concrete | 1.617 | 0.162 | 1.5 | 0.24 |
| Press rolls/pockets | stainless (proxy for hot-work alloy) | 0.029 | 0.058 | 4 | 0.23 |
| Foundations | concrete | 1.527 | 0.153 | 1.5 | 0.23 |
| Shaft shell | steel | 0.140 | 0.091 | 2.5 | 0.23 |
| Recycle + make-up compressors | steel | 0.065 | 0.042 | 5 | 0.21 |
| Gas ducts and bustle main | steel | 0.098 | 0.063 | 2.5 | 0.16 |
| Compressor motors | copper | 0.003 | 0.028 | 5 | 0.14 |
| Gas heater elements (sized for heat-store charging) | stainless (proxy for FeCrAl) | 0.021 | 0.042 | 3 | 0.13 |
| Recuperator | stainless | 0.018 | 0.036 | 3 | 0.11 |
| Heater shell, lining; duct lining; condenser; fins; cabling | steel, refractory, aluminium, copper | — | 0.16 | 1.5–3 | 0.39 |
| **Total installed** | | | **2.39** | | **39.1** |

Where today's $401 goes instead: installation at 2.6× equipment ($173), engineering at $12M per plant ($120), instruments and safety at $7M ($70), hardware fabricated at 4–14× materials (~$36). **At 100 t/day the hardware is under 10% of the cost.** Cost-down path, in order of size:

1. **One standard design, built many times.** Engineering drops from $12M to $1.5M per plant, instruments and safety from $7M to $1.1M (a standard analyser/SIS/control package).
2. **Skid and module erection:** install factor 2.6 → 1.35.
3. **Shop-built shaft and loop at 2–5× materials.**
4. **Recuperator and DC heaters:** −0.25 kWh/kg.

The lean shaft's own materials are under $1 per kg/day; its 16× idiot index is mostly fixed costs that shrink with plant size (6× at 5,000 t/day).

## Build plan

| Phase | What | Scale | Duration | Indicative budget | Exit criteria |
|---|---|---|---|---|---|
| 0. Reduction kinetics + sticking | TGA and a 0.1 m fixed-bed rig: H₂ at 800–1,000 °C on DR-grade, BF-grade and in-house pellets. Swelling/fines tests. Hot-standby cycles: hold 600 °C, no flow, restart | < 10 kg/h | 3 months | ~$200k | ≥ 94% metallization within the model's 4.5 h at 900 °C. No clustering at 900 °C or after 50 standby cycles. Fines < 5% |
| 1. Mini-shaft on PV | 0.15 m bore × 8 m shaft. Recycle loop with recuperator and knock-out. DC-direct heater in a firebrick store on ~0.3 MWp PV. H₂ (~0.16 t/day) from tube trailers | ~3 t Fe/day | 9 months | ~$2M | Measured kWh/kg within 15% of the model incl. shell loss. λ ≤ 3. 30 days continuous, nights on the heat store. Condensate quality fit for the electrolyzer |
| 2. Standard module, first unit | 0.87 m bore, full height, hot briquetting press, on PV + the lean electrolyzer (≈ 5.2 t H₂/day) | 100 t Fe/day | 18 months | ~$8M (2× the lean target for a first unit) | HBI ≥ 92% met., density ≥ 5 g/cm³. ≥ 90% availability. Built cost ≤ $80 per kg/day. Heat-store night operation without metallization swings > 2 pts |
| 3. Repeat module | Second identical plant from the same drawings, skid-erected | 100 t Fe/day | 9 months | ~$4M | Installed ≤ $40 per kg/day. Engineering ≤ $1.5M |
| 4. Product | 250 t/day standard shaft, 4-pack sites, own pelletizing | 1,000 t Fe/day | — | — | ≤ $12 per kg/day installed. ≤ 0.55 kWh/kg |

Instrumentation throughout: burden temperature probes at three heights, bustle and top-gas analysers (H₂/H₂O), shell thermography, burden descent rate, metallization of every briquette batch, and a log of every ramp and standby for the turndown model.

## Risks and open questions

- **Sticking and clustering** of freshly reduced iron above ~900–950 °C, and during hot standby if the bed sits hot without flow. The lean inlet temperature (900 °C) sits at the energy optimum, below the sticking range. Measure in Phase 0.
- **Pellet degradation under H₂**: swelling and fines raise bed ΔP and cause channelling in a narrow bore. The bore-to-pellet ratio (0.87 m / 12 mm ≈ 70) is fine for plug flow, but wall effects grow below ~0.5 m bores.
- **DR-grade concentrate supply and price.** DR-grade is a few percent of seaborne ore and is the largest cost item; a lower-grade route is a separate design.
- **Carbon-free HBI.** EAFs expect 1–4% C in DRI for foaming slag and as a melting aid. Selling to EAFs may need a small carbon addition (biogenic or DAC-derived CH₄ in the cooling zone), outside this unit.
- **Hydrogen attack and embrittlement** of hot ducts and the bustle main. Refractory-lined carbon steel keeps metal temperatures low; Nelson-curve check per duct.
- **Heat-store integration.** Gas-through-brick regenerators at 900 °C are proven in hot-blast stoves (at ~1 bar, in air). Pressurized H₂ service, element life inside the store and dust carry-over are open.
- **Screening-grade model.** Mean heat capacities, a two-point van 't Hoff equilibrium fit, and assumed manufacturing factors, fixed costs and today calibration (to the recipe at 100 t/day). Phases 0–2 replace them with measured values in `engine/designs/dri-shaft.js`.

## Engine and design changes recommended (open)

1. **Size-dependent design factors.** `capexFactor` is computed at 100 t/day against the recipe at that size (`recipeAtSize`: the engine's `(size/ref)^-0.15`, floored at 0.4). The design's scale curve is much steeper, so plants of other sizes get the wrong factor. Accept `capexFactor` as a function of `sizeKgPerDay` (or a table), or lower `scale.floorFactor` for process units.
2. **Partial thermal firming.** The unit is ~82% heat and ~18% electricity (compressors, press), but `thermal` puts all of it on the heat store.
3. **Pass `minTurndown`.** The override does not yet pass the design's turndown to the firmed block.
