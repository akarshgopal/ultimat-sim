# Design: solar-matched urea synthesis unit

Status: concept design + build plan. Model: `engine/designs/urea.js` (tested in `tests/design-urea.test.js`). It replaces the flowsheet unit `urea` in the pathways `urea` (bought NH₃ + CO₂) and `green-urea` (SWRO + electrolyzer + ASU + Haber-Bosch + urea, bought CO₂). Costs are screening estimates: a bill of materials at 2024–25 commodity prices (`data/bom.js`) times explicit manufacturing factors, plus bought-in items. Every number below regenerates from the module and the company simulator. Unless stated otherwise the plant is **100,000 kg urea/day**, the size the abundance scoreboard prices (100 × the pathways' 1,000 kg/day reference). The design is compared with the recipe scaled the way the engine scales it to that size: 1,140 × 100^−0.15 = **$571 per kg/day**.

## Why this unit

Urea is the largest nitrogen product (213 Mt/yr at $0.40/kg). At today's PV it costs $0.70/kg on the recipe, and after bought ammonia ($0.30/kg) the `urea` unit's equipment is the largest item ($0.22/kg). The recipe's $1,140 per kg/day (≈ $3,100 per t/yr at 1 t/day) is a small-plant number, and its 0.8 kWh/kg is an "electricity as total energy" stand-in for a plant that really runs on steam.

## Requirements

| Requirement | Target | Why |
|---|---|---|
| Installed cost | ≤ $100 per kg urea/day at 100 t/day (≤ $275 per t/yr); ≤ $40 at 1,000 t/day | Equipment below ~$0.04/kg, so feeds and energy decide the price |
| Energy | ≤ 0.45 kWh/kg all-in (heat + electricity), CO₂ from 1 atm | The recipe's 0.8 kWh/kg costs ~$0.05/kg at today's PV |
| Feeds | Liquid NH₃ (HB loop or bought), CO₂ at ~1 atm (DAC or bought), no cooling water, no fuel | Desert-coast PV site; DAC delivers CO₂ at atmospheric pressure |
| Operating profile | Baseload, firmed. Turndown ≤ 50% per train; HP loop can block in hot for ≥ 24 h | Urea capex is ~5× its energy cost, so oversizing it for sun hours does not pay (see verdict) |
| Product | Solid urea, ≥ 46% N, in a form the fertilizer market takes | The scoreboard prices solid urea at $0.40/kg |
| Materials | Abundant: carbon steel, stainless/duplex; no Zr or Ti | Ammonium carbamate at 180–210 °C sets the alloy |
| Water | Process condensate (0.30 kg/kg urea) cleaned to boiler-feed quality | In `green-urea` it can go back to the electrolyzer |

## Model results

### Today vs lean (per kg urea/day at 100 t/day)

| | Today: small CO₂-stripping plant, field-built | Lean solar-matched target |
|---|---|---|
| Synthesis | 145 bar, 185 °C, N/C 3.0, H/C 0.5, 50 min | 140 bar, 185 °C, N/C 3.0, H/C 0.4, 45 min |
| Recycle | CO₂ stripping; vertical HP condenser + separate reactor, elevated for gravity flow | CO₂ stripping; **pool reactor** (condenser + reactor in one horizontal vessel at grade) |
| HP materials | CS + 316L-UG-lined vessels; 25-22-2 stripper and condenser tubes | CS + 316L-UG-lined vessels; **super-duplex tubes** |
| Heat | Electric steam (85% system efficiency) | **Steam recompression** of surplus LP steam into the stripper (COP 3.5) + electric top-up |
| Finishing | Fluid-bed granulation | **Steel-belt pastillation** |
| CO₂ conversion per pass (equilibrium) | 61.4% (62.0%) | 62.2% (63.3%) |
| Installed | **$522** ($1,430 per t/yr) | **$79** ($218 per t/yr) |
| vs recipe at 100 t/day ($571) | 0.91× | **0.139×** |
| Raw materials | $8.76 | $3.42 |
| Idiot index | 60× | 23× |
| Energy, kWh/kg | 0.750 (heat 0.576) | **0.409** (heat 0.196, recompressor 0.087, CO₂ compression 0.089) |
| Energy vs recipe (0.8) | 0.94× | 0.51× |
| Variable O&M, $/kg | 0.025 | 0.0055 |
| Operation | Baseload on a heat store, turndown 60% | Baseload, firmed as electricity, turndown 50% |
| `simulatorOverride().urea` | `{ capexFactor 0.913, energyFactor 0.938, materialsFactor 0.0153, variableOmFactor 0.828, flexible false, thermal true, minTurndown 0.6 }` | `{ capexFactor 0.139, energyFactor 0.511, materialsFactor 0.0060, variableOmFactor 0.183, flexible false, thermal false, minTurndown 0.5 }` |

Other presets (lean except for the change named):

| Preset | Installed | kWh/kg | Idiot index | Override |
|---|---|---|---|---|
| `heatStore`: electric steam off a PV-charged heat store, no recompressor | $79 | 0.629 | 23× | capex 0.138, energy 0.786, thermal **true** |
| `duplex`: solid super-duplex HP vessels, no liner, 0.1% passivation O₂ | $84 | 0.409 | 20× | capex 0.148, energy 0.511, VOM 0.160 |
| `sunFollowing`: HP loop blocked in hot every night | $80 | 0.440 | 23× | capex 0.140, energy 0.550, **flexible true**, turndown 0.4 |

**Where today's $522 goes.** Installation (×2.0) $191, engineering + licence $140, erection labour $54, instruments $40 and HP valves $25: $450, or 86%. Granulation is $20 and the whole HP section $57. At 100 t/day a urea plant is mostly a project, not a machine. Cost-down path, in order of size:

1. A repeat standard design: no licence fee, ~$2M of site engineering instead of $12M.
2. Factory-built modules: install factor 1.25 instead of 2.0, 25,000 erection hours instead of 90,000.
3. Mass-produced instruments and safety systems.
4. Pastillation instead of granulation.
5. A pool reactor at grade instead of a gravity-flow structure.

The alloy choice moves the lean unit by only ~$5 per kg/day.

### Heat balance: why urea is cheap in kWh (lean, per kg urea)

The overall reaction 2 NH₃(l) + CO₂(g) → urea + H₂O is **exothermic** (about −76 kJ/mol, 0.35 kWh/kg); the minimum work is about zero. A urea plant needs heat only because ~38% of the CO₂ leaves the reactor as unconverted carbamate, which is decomposed at ~205 °C in the stripper and re-formed at ~170 °C in the HP condenser, moving heat downhill once per pass:

| Duty, kWh/kg urea | Lean |
|---|---|
| HP stripper (decompose 80% of the carbamate, strip 85% of the free NH₃) | 0.476 |
| LP steam raised by the HP carbamate condenser (4.5 bar, 147 °C) | 0.703 |
| LP needs: LP decomposer + evaporation to 99.5% + condensate hydrolyser | 0.413 |
| Surplus LP steam | 0.290 → recompressed to the stripper at COP 3.5: **0.087 kWh_e** |
| Stripper heat still bought (resistive, 95%) | 0.196 |

Without recompression the surplus is rejected to air and the unit takes 0.63 kWh/kg, 0.50 of it heat. With it, 0.41 kWh/kg, about half heat and half electricity. The engine's `thermal` flag is all-or-nothing, so the recompression design is firmed as electricity and `heatStore` as heat. Recompression still wins at today's PV ($0.458 vs $0.471/kg urea) and at the frontier ($0.116 vs $0.120).

### Synthesis knobs (lean, 100 t/day; levelized $/kg = unit capex at 9.4% CRF / 365 + kWh × $0.045)

| Knob | Conversion | Bubble P, bar | kWh/kg | $/(kg/day) | $/kg | Note |
|---|---|---|---|---|---|---|
| 175 °C | 55.9% | 107 | 0.481 | 81.2 | 0.0425 | lower K |
| 180 °C | 59.7% | 120 | 0.437 | 80.1 | 0.0402 | |
| **185 °C** | **62.2%** | 135 | **0.409** | 79.5 | **0.0388** | optimum at 140 bar |
| 190 °C | 46.9% | 151 | 0.589 | 83.9 | 0.0480 | above the bubble pressure: CO₂ leaves the liquid |
| 195 °C | 30.6% | 169 | 0.978 | 93.4 | 0.0680 | also above the 316L-UG limit |
| 125 bar | 45.7% | 135 | 0.610 | 83.2 | 0.0488 | below the bubble pressure |
| 160 / 180 bar | 62.2% | 135 | 0.412 / 0.416 | 80.9 / 82.2 | 0.0393 / 0.0398 | thicker walls, more CO₂ compression, no gain |
| N/C 2.8 | 60.8% | 130 | 0.405 | 79.3 | 0.0386 | flat (crystallization risk below ~2.9) |
| N/C 3.5 / 4.0 at 140 bar | 52.1% / 39.2% | 148 / 160 | 0.569 / 0.873 | 83.5 / 91.1 | 0.047 / 0.063 | needs 155–170 bar (NH₃-stripping territory) |
| 20 / 30 / 60 min | 53.0 / 59.1 / 63.0% | | 0.507 / 0.438 / 0.402 | 78.7 / 78.5 / 80.8 | 0.043 / 0.040 / 0.039 | flat above ~45 min |
| NH₃ stripping (+ MP section) | 62.2% | | 0.531 | 78.9 | 0.0441 | more heat goes to MP/LP; less is recovered |
| Total recycle (no stripper) | 62.2% | | 0.985 | 76.6 | 0.0640 | cheapest hardware, 2.4× the energy |
| Vertical condenser + reactor | | | 0.409 | 79.2 | 0.0387 | tie: one less HP shell vs a taller structure |
| Lined-25-22-2 / solid duplex vessels | | | | 80.1 / 84.4 | 0.0390 / 0.0401 | see materials below |
| 25-22-2 / 316L-UG tubes | | | | 81.1 / 79.4 | | 316L-UG tubes are flagged: stripper at 205 °C > 190 °C limit |
| Granulation / prilling | | | 0.424 / 0.423 | 92.8 / 86.4 | 0.0429 / 0.0412 | pastillation is $13 / $7 cheaper |
| No finishing (solution) | | | 0.251 | 76.0 | 0.0308 | not the product the scoreboard prices |

Conversion is a carbamate-dehydration equilibrium, K = x_U·x_W/x_C with free NH₃ diluting the liquid; K(185 °C) is calibrated to 62% at N/C 3, H/C 0.5 and to 75% at N/C 4, dry, with ΔH +15.5 kJ/mol. The approach follows first-order kinetics, and the loop must stay above the bubble pressure of the synthesis liquid (135 bar at 185 °C and N/C 3). Together these reproduce the industrial design point from first principles: **CO₂ stripping at ~140 bar, 185 °C, N/C ≈ 3, ~45 min** (the Stamicarbon point), and the reason NH₃-stripping plants run at 150–160 bar with N/C 3.3–3.6.

### Materials of construction

| HP vessels | Wall at 140 bar, Ø1.6 m | Installed $/(kg/day) | Passivation O₂ | Notes |
|---|---|---|---|---|
| **CS + 8 mm 316L-UG liner** (lean) | 87 mm CS + 8 mm liner | 79.5 | 0.6% | carbon steel holds pressure; ≤ 190 °C; needs leak detection |
| CS + 25-22-2 liner | 87 mm + 8 mm | 80.1 | 0.4% | ≤ 205 °C |
| Solid super duplex | 52 mm | 84.4 | 0.1% | 230 MPa allowable; no liner, no weep holes; ≤ 210 °C |

At 100 t/day the corrosion-driven alloy is **not** the cost driver: the whole HP section (vessels, exchangers, piping, pumps, CO₂ compressor) is $15.7 of the lean $79. Carbon steel at $0.65/kg carries the pressure and a thin liner handles corrosion, cheapest in raw materials and installed cost. Duplex earns its place in the **tubes**, where walls are thin; there it is cheaper than 25-22-2 and allows a 205 °C stripper. Solid duplex vessels cost $5 more per kg/day but cut passivation air (and the NH₃ vented with it) ~6×; at the frontier the two tie ($0.116/kg urea). Use duplex if liner leak detection becomes an operability problem. Alloy prices are `data/bom.js` stainless ($2.0/kg) × premium: 316L-UG ×1.8, 25-22-2 ×2.8, super duplex ×2.5.

### Scale

| Urea t/day | Today $/(kg/day) | Today II | Lean $/(kg/day) | Lean $/t·yr | Lean II | Recipe × engine scale |
|---|---|---|---|---|---|---|
| 10 | 1,460 | 108 | 197 | 541 | 41 | 807 |
| 30 | 869 | 80 | 126 | 344 | 31 | 684 |
| **100 (scoreboard)** | **522** | 60 | **79** | 218 | 23 | **571** |
| 300 | 350 | 47 | 55 | 150 | 18 | 485 |
| 1,000 | 247 | 39 | 39 | 106 | 14 | 456 |
| 3,500 (world scale) | 192 | 34 | 29 | 81 | 11 | 456 |

Today's preset at world scale ($192/kg·day, $526 per t/yr) is the order commonly reported for world-scale urea + granulation projects (~$400–700 per t/yr), a check on the model from the other end. Small modular plants are not cheaper per tonne: fixed engineering, instruments and the HP valve package make lean 10 t/day units 2.5× the cost of 100 t/day per kg/day. **100–300 t/day is the smallest sensible module**, about one 50–150 MW PV-to-ammonia complex. Above 300 t/day the design falls faster than the engine's 0.85 exponent and past its 0.4 floor, so the factor quoted at 100 t/day understates world-scale plants.

### Sun-following vs baseload

The HP loop holds a hot, pressurized carbamate solution that must not crystallize (below ~150 °C) or lose its passivation. Plants can block the loop in hot for a day or more, so nightly block-in is physically possible, but it does not pay: the engine oversizes a sun-following unit for sun hours, and the urea unit's capex is ~5× its energy cost.

| $/kg urea (best of `urea` / `green-urea`) | Today's PV | Frontier |
|---|---|---|
| Lean, baseload (firmed as electricity; turndown 50%) | **0.458** | **0.116** |
| Lean, heat-store firmed (`heatStore`) | 0.471 | 0.120 |
| Lean, sun-following (`sunFollowing`) | 0.498 | 0.119 |

Frontier = PV capex and floor ÷10, idiot-index target 1.5 with `Bom.floors()`, every other design lean. **Run the urea unit baseload**, let the HB loop upstream follow the sun, and buffer liquid NH₃ between them (the engine's $0.5/kg tank capacity is negligible). At the frontier the margin is small (3%) because the squeeze makes oversizing cheap. Two parallel trains would let a plant turn down to 25% at night by blocking one in, at the cost of a second HP train.

### Abundance scoreboard

`abundanceScoreboard` (sizeMultiple 100, best site). Urea row: status, cost ÷ $0.40, best pathway and top items.

| Scenario | Recipe urea unit | Today preset | **Lean preset** |
|---|---|---|---|
| Today, no other designs | blocked 1.75× ($0.701; bought NH₃ 0.301, urea unit 0.224, CO₂ 0.095) | blocked 1.68× ($0.673) | **blocked 1.15× ($0.458)**; bought NH₃ 0.301, CO₂ 0.095, urea unit 0.032 |
| Frontier, every other design lean | abundant 0.40× (`urea`, $0.160; NH₃ made in-house 0.131) | abundant 0.36× (`green-urea`, $0.143) | **abundant 0.29× (`green-urea`, $0.116)**; energy 0.093, other 0.042, CO₂ 0.016, urea unit 0.008 |

With recipes only, the frontier urea row is feasible at 0.66× ($0.265). The feasible share of world tonnage does not change with this design (39.5% today, 93.6% at the frontier); it moves urea from 0.40× to 0.29× of price at the frontier, mostly through energy (0.51×) and variable O&M (0.18×), since the squeeze already caps equipment.

**Next blocker:** at today's PV, the bought ammonia, 0.567 kg × ($0.45 + $0.08 freight) = $0.301/kg urea, 66% of the lean cost. At the frontier it is electricity for the in-house NH₃ chain. CO₂ comes from the `dac-co2` recipe at $0.016/kg urea instead of 0.733 kg × ($0.05 + $0.08 freight) = $0.095 bought.

## Architecture

```
 liquid NH₃ (HB loop let-down, ~20 bar) ─► HP NH₃ pump ─┐
                                                         ▼
 CO₂ ~1 atm (DAC) ─► 4-stage CO₂ compressor ─► HP STRIPPER (falling film, duplex tubes, 205 °C)
                     (+0.6% air if lined)        │ strip gas (NH₃ + CO₂)      ▲ heat: recompressed LP steam
                                                 ▼                            │ + resistive top-up
                       ┌──────────── POOL REACTOR at grade, 140 bar ──────────┘
                       │  condensing zone (duplex U-bundle raising 4.5 bar steam)
                       │  + reactor zone (baffled, 45 min, 185 °C, N/C 3, conversion 62%)
                       └─► urea/carbamate solution ─► stripper ─► LP recirculation (3–4 bar)
                                                                    │ LP carbamate ─► HP carbamate pump ─► pool reactor
                                                                    ▼
                         vacuum evaporators (LP steam) 72% → 99.5% melt ─► steel-belt pastillation ─► bulk store
                         condensate ─► desorber + hydrolyser ─► boiler-feed water (to the electrolyzer)
 surplus 4.5 bar LP steam ─► steam recompressor (COP 3.5) ─► stripper shell
 all heat rejection: air coolers (no cooling water)
```

- **One HP loop, CO₂ stripping, pool reactor.** Condensation and the first part of the reaction happen in one horizontal vessel at grade, removing a vertical HP condenser and the tall structure a gravity-flow loop needs. Licensors already offer this arrangement for smaller plants.
- **Lined CS vessels, duplex tubes.** Carbon steel takes the pressure, a 316L-UG liner the corrosion. Super duplex is used where walls are thin (stripper and condenser tubes, HP pump wetted parts).
- **Steam recompression instead of a boiler.** Surplus 147 °C LP steam from the pool condenser is compressed to ~22 bar and condensed in the stripper shell. A resistive steam generator (PV-direct or heat-store discharge) supplies the remaining 0.2 kWh/kg.
- **Pastillation, not granulation.** Drop formers lay melt on water-cooled stainless belts: modular lines, no dust scrubber, little formaldehyde, line-by-line turndown. Pastilles (2–4 mm hemispheres) are an established sulphur and specialty-urea form; fertilizer offtake must accept them (see risks).
- **Baseload, firmed.** The HB loop follows the sun and a liquid-NH₃ tank carries the night. The urea unit runs 24 h at 50–100% load.
- **Water.** Process condensate (0.3 kg/kg) is hydrolysed to < 5 ppm urea/NH₃ and returned; in `green-urea` it covers ~30% of the electrolyzer's make-up water.

## Bill of materials (lean design, per kg urea/day at 100 t/day)

| Part | Material | kg | Materials $ | × | $ | Note |
|---|---|---|---|---|---|---|
| Engineering, permits | bought-in | – | 0 | – | 20.00 | repeat standard design, no licence fee |
| Instruments, DCS/SIS, analysers | bought-in | – | 0 | – | 12.00 | HP level, NH₃ detection, carbamate-proof transmitters |
| Installation (× 1.25) | bought-in | – | 0 | – | 11.89 | module erection, tie-ins, insulation, commissioning |
| Assembly + erection labour | bought-in | – | 0 | – | 11.25 | 25,000 h |
| HP valves (urea-grade alloy) | bought-in | – | 0 | – | 6.85 | control, let-down, isolation, relief |
| Pool reactor shell | steel | 0.288 | 0.187 | 12 | 2.25 | 9.2 m³ liquid, Ø1.6 m × 6.4 m, 87 mm CS at 140 bar |
| HP carbamate condenser tubes | super duplex | 0.057 | 0.283 | 7 | 1.98 | 326 m², 2.9 MW → 4.5 bar steam |
| HP piping + fittings | 316L-UG | 0.075 | 0.271 | 4 | 1.08 | 35% of HP equipment mass |
| Drop formers | bought-in | – | 0 | – | 1.04 | one per belt |
| Pastillation fans, screens, analysers | bought-in | – | 0 | – | 1.00 | |
| Pool reactor liner | 316L-UG | 0.020 | 0.074 | 12 | 0.88 | 8 mm |
| Foundations | concrete | 4.74 | 0.474 | 1.5 | 0.71 | |
| Steam recompressor | stainless | 0.044 | 0.087 | 8 | 0.70 | 379 kW, COP 3.5 |
| HP stripper tubes | super duplex | 0.019 | 0.096 | 7 | 0.67 | 110 m², 234 tubes, 2.0 MW at 205 °C |
| Reclaim + loading conveyors | steel | 0.489 | 0.318 | 2 | 0.64 | 3× production rate |
| Passivation-air dosing | bought-in | – | 0 | – | 0.60 | 0.6% O₂ in the CO₂ |
| Offsites (flare, fire water, instrument air) | steel | 0.190 | 0.123 | 4 | 0.49 | |
| Bulk store floor + walls | concrete | 3.00 | 0.300 | 1.5 | 0.45 | |
| Interconnecting + utility piping | steel | 0.158 | 0.103 | 4 | 0.41 | |
| Desorbers + hydrolyser | 316L-UG | 0.028 | 0.101 | 4 | 0.40 | 1.9 t/h condensate |
| CO₂ compressor | steel | 0.074 | 0.048 | 8 | 0.38 | 386 kW, 1.05 → 140 bar |
| … 27 smaller lines | | | | | 3.8 | drives, stripper channels, scrubber, LP section, evaporators, belts, air coolers, motors, store, structure |
| **Total** | | | **3.42** | | **79.5** | idiot index 23× |

82% of the lean installed cost is still bought-in items or installation (engineering, instruments, labour, valves, install factor, finishing packages) with no commodity floor. That share, not steel or alloy, is what the build plan attacks.

## Build plan

| Phase | What | Scale | Duration | Indicative budget | Exit criteria |
|---|---|---|---|---|---|
| 0. Bench and corrosion | Autoclave equilibrium runs (175–195 °C, N/C 2.8–3.6, H/C 0.3–0.7) against the model. Corrosion coupons of 316L-UG, 25-22-2 and super duplex in carbamate at 0.1–0.6% O₂, including 14 h hot block-ins. Pastille quality (crush strength, caking) from a lab drop former | < 10 kg/day | 6 months | ~$0.4M | Conversion within ±2 points of the model. Duplex corrosion < 0.05 mm/yr at 0.1% O₂. Pastilles ≥ 2.5 kg crush, caking ≤ granules with ≤ 0.15% UF |
| 1. Pilot loop on real feeds | 1 t/day pool-reactor + stripper skid on a PV-fed NH₃ loop and DAC CO₂. Steam-recompression mock-up (single stage, 4.5 → 12 bar) | 1 t/day | 12 months | ~$4M | ≥ 60% conversion at 140 bar / 185 °C. Stripper efficiency ≥ 0.78. Measured kWh/kg within 15% of the model. Turndown to 50% and a 24 h hot block-in restarted in < 2 h without passivation loss |
| 2. First module | 100 t/day factory-built, shop-tested modules (HP module ≤ 4.5 m wide for road transport). One pastillation line per 50 t/day. Two-stage MVR. Standard SIS/DCS package | 100 t/day | 24 months | ~$15M first-of-kind (target $8M) | Installed ≤ $150 per kg/day first unit, trending to ≤ $100 by unit 3. ≤ 0.45 kWh/kg. ≥ 8,000 h/yr availability. Pastilles sold to a fertilizer offtaker |
| 3. Product | Numbered 100–300 t/day modules co-located with PV-ammonia complexes. 1,000 t/day single-train variant | 100–1,000 t/day | — | — | ≤ $80 per kg/day at 100 t/day and ≤ $40 at 1,000 t/day. Urea ≤ $0.30/kg with 10× cheaper PV |

Instrument the pilot for model feedback: reactor N/C and H/C (online densitometer/NIR), CO₂ conversion, stripper efficiency and heat flux, condenser steam make, recompressor COP, NH₃/CO₂ in every vent, liner leak detection and corrosion probes. Measured values go into `engine/designs/urea.js` DEFAULTS.

## Risks and open questions

- **Equilibrium is a fit, not a thermodynamic model.** One K(T) with mole-fraction activities, calibrated to three industrial points; the bubble-pressure law and its penalty are screening. The optimum matches practice, but absolute conversion away from the calibration points could be off by ±5 points.
- **Steam recompression to ~22 bar is unusual.** MVR is mature to ~150–180 °C; lifting 147 °C steam to a 205 °C stripper needs 2–3 stages with desuperheating, not off-the-shelf. If it fails, `heatStore` costs $0.013/kg urea more at today's PV.
- **Pastilles as a fertilizer product.** Market acceptance, blending with granular NPK and bulk handling (dust, flowability) are unproven at fertilizer volumes. Fall-backs: prilling (+$7 per kg/day) or a small fluid-bed granulator (+$13).
- **Bought-in costs dominate.** $20 engineering, $12 instruments and $7 HP valves per kg/day are targets that need one certified standard design and a licence-free (or flat-fee) process. A small plant pays a licence of ~$20,000 per t/day (the today preset); the today preset's $140 engineering + licence and $40 instruments are what one-off projects pay.
- **Lined vessels.** Liner cracking is found by leak detection, not prevented. Solid duplex removes that risk for +$5 per kg/day; decide after Phase 0 coupons.
- **Block-in and restart.** Hot block-ins (maintenance, trips, a sun-following fallback) need passivation O₂ kept up and the loop above ~150 °C; 316L-UG active corrosion after O₂ depletion is a known failure mode. Baseload operation avoids daily block-ins.
- **NH₃ and CO₂ quality.** DAC CO₂ carries no H₂ (no H₂-removal reactor) but may carry O₂/H₂O; electrolytic NH₃ is oil-free. Both are assumed within the instrument budget.
- **Product form.** The `solution` option (no evaporation or finishing, 0.25 kWh/kg, $76 per kg/day) only suits captive UAN/DEF; the scoreboard prices solid urea.

## Engine changes recommended (open)

1. **Partial thermal firming.** `thermal` is all-or-nothing per unit; this unit is ~50% heat (stripper top-up) and ~50% electricity (recompressor, CO₂ compressor). Add `thermalShare` (fraction of the unit's kWh a heat store can carry).
2. **Heat integration across units.** Without recompression the unit rejects ~0.3 kWh/kg of 147 °C LP steam, and a co-located DAC needs ~100 °C regeneration heat. A `heatExportKWhPerKg` on designs, consumed through `heatFactor` on co-located units, would value it.
3. **Internal water recycle.** Process condensate (0.30 kg/kg urea) could replace SWRO product in `green-urea`; flowsheet edges from a unit's water sink to the electrolyzer would show it. Small value, but it matters inland.
4. **Per-design scale law.** This design falls faster than size^0.85 above 300 t/day and past the 0.4 floor ($29 per kg/day at 3,500 t/day vs $79 at 100). A `scaleExponent` or size → factor table would let a design price the plant sizes it was drawn for.
5. **Parallel trains and turndown.** A plant with n trains can block one in at night (turndown ≈ train turndown ÷ n). The engine could choose n when it designs the firmed block.

## Reproduce

```js
const U = require('./engine/designs/urea.js');
U.design(U.PRESETS.lean.params);                                    // tables above (also today, heatStore, duplex, sunFollowing)
U.sweep(U.PRESETS.lean.params, 'reactorC', [175, 180, 185, 190, 195]);
U.scaleCurve(U.PRESETS.lean.params, [1e4, 1e5, 1e6, 3.5e6]);
const units = U.simulatorOverride(U.PRESETS.lean.params);           // { urea: { capexFactor, energyFactor, materialsFactor, variableOmFactor, flexible, thermal, minTurndown } }
// Frontier: config = { pv: { capexUsdPerKWp: C.DEFAULTS.pv.capexUsdPerKWp / 10, floorUsdPerKWp: C.DEFAULTS.pv.floorUsdPerKWp / 10 },
//   idiotIndex: { target: 1.5, floors: Bom.floors() }, designs: { units: { ...every design's lean override } } }
```
