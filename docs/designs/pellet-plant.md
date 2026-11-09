# Design: solar-fired iron-ore pellet plant

Status: concept design + build plan. Model: `engine/designs/pellet-plant.js` (parametric, tested in `tests/design-pellet-plant.test.js`). It replaces flowsheet unit `pellet-plant` in pathways `h2-dri` and `green-h2-dri`. All costs are screening estimates: a bill of materials at 2024–25 commodity prices (`data/bom.js`) times explicit manufacturing factors, plus installation and fixed plant costs. Every number below comes from the model at the plant that feeds a 100 t Fe/day DRI shaft (148 t pellets/day, 54 kt/yr), the size the abundance scoreboard prices (1,000 kg/day reference × 100). Costs are per kg of Fe in DRI/HBI per day unless marked "per t pellets".

## Why this one

The lean DRI shaft (`docs/designs/dri-shaft.md`) made iron ore the largest cost in DRI/HBI (158 Mt/yr at $0.40/kg). But the recipes fed 1.43 kg of pure Fe₂O₃ at $0.10/kg, which is not what a shaft eats. A shaft needs DR-grade pellets (≥ 67% Fe, SiO₂ + Al₂O₃ ≲ 3%), which trade at ~$150–180/t. This work does two things:

1. **Honest ore in the recipes.** The cases now buy DR-grade pellet-feed concentrate and fire it in an on-site `pellet-plant` unit before the shaft.
2. **A lean pellet plant.** The question is whether a pellet plant built for sunlight makes pellets cheap enough to unblock DRI again.

## Part 1: what the recipes now buy

| | Before | Now |
|---|---|---|
| Feed | 1.43 kg pure Fe₂O₃ per kg Fe at $0.10 + $0.01 freight | **1.48 kg DR-grade concentrate** (67.5% Fe: Fe₂O₃ + 3.5% gangue as SiO₂) at **$0.13 + $0.01 freight** |
| Pelletizing | none | `pellet-plant` unit: 1.48 kg fired pellets per kg Fe, **0.14 kWh/kg pellets** (0.207 per kg Fe), **$43 per kg pellets/day** (×1.05 Chile, $66.9 per kg Fe/day at the 1 t/day reference), variable O&M $0.006/kg pellets |
| Iron-ore cost per kg Fe | $0.157 | **$0.207** (+ pellet plant ~$0.02–0.04 incl. its energy) |
| Shaft (`hydrogen-dri`) | 840 $/(kg/day), 0.7 kWh/kg | unchanged, so the dri-shaft design's RECIPE basis still holds |

**Price basis.**

- **Concentrate: $130/dmt plant-gate + $10/t freight = $140/t delivered.** The Strategic Resources Port Saguenay DR pellet PFS (March 2024) buys DR-grade concentrate at the 62% Fe CFR China index ($100/dmt) + a DR-grade premium (65–62%) of $35/dmt + a Fe differential. Its total cash cost is $156/dmt pellets, including a $16.31/dmt conversion cost, which leaves ~$140/dmt for delivered concentrate. The 62% index averaged ~$99–112/t over 2024–25 (World Bank pink sheet).
- **Pellet plant capex: $117.5 per t/yr → $43 per kg pellets/day.** The same PFS (BBA, AACE Class 5) puts a 4 Mdmt/yr Metso straight-grate DR pellet plant at US$470M including $42M contingency. Band: Indian-built straight grates ~$50–60/t-yr (→ 20); integrated pellet + port complexes ~$150/t-yr (→ 55).
- **Energy: 0.14 kWh/kg pellets.** This is induration heat as a total-energy proxy (~0.35 GJ/t for magnetite straight grates) plus ~35 kWh/t for fans, balling and conveying. The PFS spends $2.56/t on gas and $2.09/t on electricity. Magnetite pellets take ~650 MJ/t in the mining system vs ~1,050 for hematite (ISIJ Int. 54(3):596).
- **The check.** Concentrate + this pellet plant reproduce the market: ~$176/t pellets on the recipe, and ~$153/t with the lean plant. The market price is index + $70/dmt DR premium ≈ $170–180/t.

**Modelling notes.**

- Magnetite is mass-proxied as Fe₂O₃. The air O₂ that oxidizes it is not ledgered.
- Gangue leaves the pellet plant on its own outlet to a vented sink, because `hydrogen-dri` takes pure Fe₂O₃. Physically it rides through the shaft into the HBI and on to the EAF slag.
- The pellet plant is a thermal baseload unit (`engine/utilization.js` `thermalUnits`), so the engine firms it with a PV-charged heat store, not a battery.

## Requirements

| Requirement | Target | Why |
|---|---|---|
| Product | DR-grade pellets, 67.5% Fe, CCS ≥ 250 kg/pellet, 9–16 mm, low swelling under H₂ | What the shaft needs. Fines and swelling raise bed ΔP in a narrow bore |
| Feed | Purchased pellet-feed concentrate (magnetite preferred), P80 ~45 µm, 8–9% moisture after filtering | Magnetite oxidation supplies a large share of the firing heat |
| Installed cost | ≤ $25 per kg Fe/day at 100 t Fe/day (≤ $45 per t pellets/yr) | Keeps the unit below ~2% of the $0.40/kg price |
| Energy | ≤ 0.12 kWh/kg Fe (≤ 80 kWh/t pellets) | At $0.05/kWh effective, 0.1 kWh/kg Fe costs $0.005/kg |
| Operation on sunlight | 24 h induration, with night heat from a PV-charged heat store | The grate, hoods and pallet cars must not thermally cycle daily |
| Integration | Dry the green balls partly on the DRI shaft's top-gas condenser heat | The shaft rejects ~0.3–0.4 kWh/kg Fe at a ~100 °C dew point (2.5 bar, ~40% steam) |

## Model results (148 t pellets/day for 100 t Fe/day)

| | Today (small gas-fired straight grate, field-erected) | Lean solar-fired target |
|---|---|---|
| Installed | **$114 per kg Fe/day** ($212 per t pellets/yr) | **$20.8 per kg Fe/day** ($38 per t pellets/yr) |
| Recipe at this size | $33.5 per kg Fe/day (capexFactor **3.41**) | $33.5 (capexFactor **0.62**) |
| Raw materials | $4.48 per kg Fe/day | $1.96 per kg Fe/day |
| Idiot index | 25.5× | 10.6× (3.8× at 6,000 t Fe/day) |
| Energy | 0.252 kWh/kg Fe, 170 kWh/t pellets (energyFactor 1.22) | **0.105 kWh/kg Fe**, 71 kWh/t pellets (energyFactor **0.51**) |
| Induration heat | 0.46 GJ/t (gas burners, η 0.92) | 0.17 GJ/t (electric air heaters, η 0.97) |
| Fans / balling | 22 / 10 kWh/t | 15 / 8 kWh/t |
| Grate | 4.9 m² at 30 t/m²/day, 1 disc | 4.1 m² at 36 t/m²/day, 1 disc |
| Variable O&M | $6.0/t (bentonite + consumables; variableOmFactor 1.0) | $4.1/t (variableOmFactor 0.68) |
| Operation | Baseload, battery-firmed, turndown 70% | Baseload on a heat store (`thermal: true`), turndown 60% (`minTurndown: 0.6`) |

Lean override: `{ capexFactor: 0.619, energyFactor: 0.509, materialsFactor: 0.058, variableOmFactor: 0.683, flexible: false, thermal: true, minTurndown: 0.6 }`.

**Why today does not land on the recipe.** The recipe pack is a world-scale plant ($117/t-yr). The engine applies its own scale curve from the 1 t/day reference, so at 100 t Fe/day the recipe prices the pellet plant at $62 per t pellets/yr, cheaper than any real 54 kt/yr plant. The today design reproduces the cited peer band where it should: $103/t-yr at 6,000 t Fe/day (3.2 Mt pellets/yr), against $117 for Port Saguenay. At the scoreboard size it costs 3.4× the scaled recipe. This is the same engine issue the dri-shaft doc flags as "size-dependent design factors". Here it is small in $/kg: the today design adds $0.03/kg Fe.

**Heat balance (per kg fired pellet, MJ).**

| | Today | Lean |
|---|---|---|
| Drying (0.105 / 0.093 kg water) | 0.270 | 0.239, of which 0.119 bought (50% from shaft waste heat) |
| Pellet sensible heat at 1,300 °C | 1.211 | 1.211 |
| … not returned by the cooler (recuperation 78% / 85%) | 0.266 | 0.182 |
| Stack (1.8 kg at 120 °C / 1.6 kg at 100 °C) | 0.180 | 0.126 |
| Hoods, windboxes, seals | 0.040 | 0.040 |
| Magnetite oxidation credit (90% magnetite, 70% useful) | −0.299 | −0.299 |
| **Net firing heat** | **0.457** | **0.168** |

The full oxidation heat is 0.492 MJ/kg Fe₂O₃ (2 Fe₃O₄ + ½ O₂ → 3 Fe₂O₃). A magnetite plant has almost no thermodynamic floor: oxidation pays for drying. Its real cost is the heat it cannot recover.

**Design levers (lean baseline, 0.105 kWh/kg Fe):**

- **Hematite feed** instead of magnetite: 0.232 kWh/kg Fe. Firing heat almost triples, to 0.47 GJ/t. Buy magnetite concentrate.
- **No shaft waste heat for drying:** 0.156.
- **Today's cooler recuperation (78%):** 0.141.
- **Gas burners** instead of electric air heaters: 0.109 kWh-eq. The burners are cheaper, but they need gas on site and a battery for nothing.
- **Organic binder** instead of bentonite: same energy, +$1.4/t binder cost, but 0.4 pt more Fe in the pellet (67.5% vs 67.2%) and less slag downstream. Bentonite is cheaper inside this unit. Organic binder is the choice once EAF slag is priced.

**Modular vs world-scale (lean / today-built, $ per kg Fe/day):**

| DRI plant | 25 t/day | 100 t/day | 300 t/day | 1,000 t/day | 6,000 t/day |
|---|---|---|---|---|---|
| Lean | 64.2 ($119/t-yr) | **20.8** ($38) | 11.1 ($21) | 7.8 ($14) | 6.6 ($12) |
| Today-built | 294.7 ($545) | 114.4 ($212) | 75.0 ($139) | 60.9 ($113) | 55.9 ($103) |
| Recipe in the engine | 41.3 | 33.5 | 28.4 | 26.8 | 26.8 |

Fixed costs dominate small plants. The lean plant's hardware is ~$5 per kg Fe/day. Engineering ($0.8M) and instruments ($0.4M) are 60% of the cost at 100 t/day.

## Abundance scoreboard: steel (DRI/HBI)

`abundanceScoreboard` at year 0, best site (Walvis Bay), 100 t/day plants.

- "Lean designs" means every design module's lean override. Only `dri-shaft`, and now `pellet-plant`, touch the steel pathways; the electrolyzer design touches `green-h2-dri`.
- Frontier is PV capex ÷ 10 plus the lean designs.
- World feasible share is by tonnage, across all markets.

| Scenario | Ore in recipe | Pellet plant | Status | Best pathway | Cost ÷ price | Top cost items ($/kg Fe) | World feasible share |
|---|---|---|---|---|---|---|---|
| Today, recipe | old ($0.10 Fe₂O₃) | — | blocked | h2-dri | 1.43× | unit 0.166, ore 0.157, H₂ 0.113, energy 0.105 | 40.4% |
| Today, lean designs | old | — | **feasible** | h2-dri | 0.87× | ore 0.157, H₂ 0.113, energy 0.034, unit 0.016 | 41.9% |
| Today, recipe | **concentrate + pellets** | recipe | blocked | h2-dri | 1.64× | ore 0.207, shaft 0.165, energy 0.118, H₂ 0.113, pellet plant 0.013 | 40.4% |
| Today, lean shaft only | concentrate + pellets | recipe | **blocked** | h2-dri | 1.09× | ore 0.207, H₂ 0.113, energy 0.046, other 0.039, shaft 0.016, pellet plant 0.014 | 40.4% |
| Today, lean shaft + **lean pellet plant** | concentrate + pellets | lean | **blocked** | h2-dri | **1.05×** | ore 0.207, H₂ 0.113, energy 0.040, other 0.036, shaft 0.016, pellet plant 0.008 | 40.4% |
| Today, all lean + idiot-index target 1.5 | concentrate + pellets | lean | blocked (NPV < 0) | h2-dri | 1.00× | ore 0.207, H₂ 0.113, energy 0.039 | 40.4% |
| Frontier, recipe | old | — | blocked | h2-dri | 1.36× | | 40.4% |
| Frontier, lean designs | old | — | feasible | green-h2-dri | 0.62× | ore 0.157, energy 0.061 | 90.3% |
| Frontier, recipe | concentrate + pellets | recipe | blocked | h2-dri | 1.55× | ore 0.207, shaft 0.165, H₂ 0.113 | 40.4% |
| Frontier, lean shaft | concentrate + pellets | recipe | feasible | green-h2-dri | 0.81× | ore 0.207, energy 0.066, other 0.041, shaft 0.017, pellet plant 0.015 | 90.3% |
| Frontier, all lean | concentrate + pellets | lean | **feasible** | green-h2-dri | **0.79×** | ore 0.207, energy 0.064, other 0.038, shaft 0.017, pellet plant 0.009 | 90.3% |
| Frontier, all lean + II 1.5 | concentrate + pellets | lean | feasible | green-h2-dri | 0.73× | ore 0.207, energy 0.063, other 0.038 | 90.3% |

**What changed.**

- **Honest ore costs DRI about 0.2× of price.** Today with the lean shaft, DRI goes from 0.87× (feasible) to 1.09× (**blocked**), which confirms the dri-shaft doc's 1.07× estimate. The world feasible share today drops from 41.9% to 40.4%.
- **At the frontier, DRI stays feasible:** 0.62× → 0.81×.
- **The lean pellet plant is worth ~0.035× of price.** That is 1.09× → 1.05× today, and 0.81× → 0.79× at the frontier. It halves the pellet plant's energy and drops its capex 3.4× below the today-built plant, but the plant was only ~$0.03/kg Fe to begin with. **It does not unblock DRI today.**

**Where the blocker is now: concentrate.** Concentrate is ~$0.21 of a ~$0.42/kg cost (today, all lean). Sensitivity, today with all lean designs:

| Concentrate (plant-gate, + $0.01 freight) | $0.13 (DR-grade, PFS basis) | $0.12 | **$0.11** | $0.10 (62% fines index) | $0.08 |
|---|---|---|---|---|---|
| Cost ÷ price | 1.05× blocked | 1.01× blocked | **0.98× feasible** | 0.94× | 0.87× |

So DRI needs concentrate at ≤ ~$120/t delivered: a ~$20/t discount to today's DR-grade premium. That means one of:

- buying at the 62% index plus a small premium;
- upgrading 62–65% concentrate ourselves (fine grinding + magnetic separation / reverse flotation, ~10–20 kWh/t);
- or, better, siting next to a magnetite mine and pelletizing its concentrate before it pays a DR premium.

At the frontier, $0.10 concentrate gives 0.68× and $0.08 gives 0.60×.

## Architecture

1. **Concentrate receiving and mixing.**
   - Day bins instead of a stockyard with stacker-reclaimers.
   - Belt filter or filter press to 8.5% moisture.
   - Bentonite dosing (0.6%) into an intensive mixer.
2. **Balling.** One ~5 m disc pelletizer (~8 t/h green balls incl. 25% recycle). A roller screen returns undersize and oversize to the disc.
3. **Induration: a mini straight grate**, 4.1 m² active (≈ 1.5 m wide × 2.7 m firing length, ~20 m total machine).
   - Zones: updraft drying → downdraft drying → preheat → firing at 1,300 °C → after-firing → two-stage cooling.
   - Pallet cars carry a hearth layer of fired pellets that protects the grate bars.
   - Cooling air goes back to the firing hood (first cooler) and the drying hood (second cooler). Recuperation is 85% of pellet sensible heat.
   - Hood lining: thinner dense castable on ceramic-fibre backing. Steel is ~4 t/m² of grate against 6 t/m² for today's field-built hoods.
4. **Heat supply.**
   - FeCrAl/NiCr electric air heaters switched straight onto PV strings in banks, with no inverter or rectifier (staged contactors ~$12/kW).
   - The heaters sit in a firebrick regenerator. By day, PV heats the brick and the firing air; at night, recirculated hood air is blown through the hot brick.
   - Average firing duty is ~300 kW. The elements are ~950 kW so they can take the whole day's heat in sun hours.
   - The store holds ~16 h × 300 kW ≈ 5 MWh_th. The engine prices it at its thermal-store rate ($40/kWh_th), not in this BOM.
   - Fans and discs (~23 kWh/t) need battery or night PV. The engine's thermal-unit path treats all of the unit's energy as heat; that is a small error.
5. **Drying on shaft waste heat.** The DRI shaft's top gas leaves the recuperator with ~40% steam at 2.5 bar (dew point ~100 °C). An air-cooled knock-out must reject that heat anyway. Instead, its first stage heats updraft-drying air to ~90 °C, which covers ~half the drying duty.
6. **Gas cleaning.** A bag filter on the windbox/hood exhaust. The stack runs at ~100 °C because there is no sulphur from fuel.

## Bill of materials (lean design, per kg Fe/day at 100 t Fe/day)

| Part | Material | kg per kg/day | Materials $ | Mfg × | $ per kg/day |
|---|---|---|---|---|---|
| Engineering, permits, owner (per plant) | — | — | — | — | 8.00 |
| Instruments, DCS, analysers | — | — | — | — | 4.00 |
| Installation (× 1.35) | — | — | — | — | 3.15 |
| Concentrate receiving, bins, mixer, binder dosing, pellet reclaim | steel | 0.520 | 0.338 | 2.5 | 0.85 |
| Structure, platforms (open, no building) | steel | 0.555 | 0.360 | 2 | 0.72 |
| Contingency (5%) | — | — | — | — | 0.61 |
| Balling discs and drives | steel | 0.239 | 0.156 | 3.5 | 0.54 |
| Dust collection | steel | 0.204 | 0.133 | 3.5 | 0.46 |
| Foundations | concrete | 2.773 | 0.277 | 1.5 | 0.42 |
| Grate machine frame, drives, seals | steel | 0.165 | 0.107 | 3.5 | 0.37 |
| Pallet cars and grate bars (Cr–Ni cast alloy) | stainless (proxy) | 0.058 | 0.115 | 3 | 0.35 |
| Hoods and windboxes | steel | 0.165 | 0.107 | 2.5 | 0.27 |
| Pallet car bodies | steel | 0.107 | 0.070 | 3 | 0.21 |
| Hood refractory | refractory | 0.165 | 0.099 | 2 | 0.20 |
| Process gas ducts | steel | 0.103 | 0.067 | 2.5 | 0.17 |
| Roller screens | steel | 0.067 | 0.044 | 3.5 | 0.15 |
| Heater power control (DC staging) | — | — | — | — | 0.11 |
| Air heater elements, shell, lining, copper; fans; motors | stainless, steel, refractory, copper | — | 0.09 | 1.5–3.5 | 0.18 |
| **Total installed** | | | **1.96** | | **20.8** |

Where today's $114 goes instead:

- **Installation at 2.0× equipment: $37.**
- **Engineering $2M: $20.**
- **EPCM 15% + contingency 10%: $20.**
- **Instruments $0.8M: $8.**
- Field-fabricated hardware at 5–10× materials, with a stockyard, a building and heavier hoods (6 t/m²): ~$29.

The cost-down path, in order of size:

1. **One standard design, built many times.** Engineering drops from $2M to $0.8M, and EPCM is folded into it.
2. **Skid-built modules.** The install factor drops from 2.0 to 1.35.
3. **Shop fabrication at 2.5–3.5× materials.**
4. **Day bins and an open structure** instead of a stockyard and a building.

## Build plan

| Phase | What | Scale | Duration | Indicative budget | Exit criteria |
|---|---|---|---|---|---|
| 0. Pot-grate tests | Balling and pot-grate firing of the candidate concentrate (magnetite, 67–68% Fe) with bentonite and organic binder. Electric-air firing profile. Low-temperature (90 °C) updraft drying | 50 kg pots | 3 months | ~$250k | CCS ≥ 250 kg/pellet, tumble ≥ 93%, reducibility and swelling under H₂ at 900 °C within the DR-shaft Phase 0 spec. Firing heat within 20% of the model |
| 1. Pilot grate on PV | 0.5 m × 4 m mini straight grate with 2-stage cooler recuperation. Electric air heater in a 1 MWh_th firebrick store on ~0.4 MWp PV | ~5 t pellets/day | 9 months | ~$2M | Net firing heat ≤ 0.25 GJ/t. 30 days continuous on the store. Pellet quality as Phase 0. Measured recuperation ≥ 80% |
| 2. Standard module, first unit | 4 m² grate beside the first 100 t/day DRI shaft, drying on its condenser heat | 148 t pellets/day | 15 months | ~$4M (2× lean target) | ≤ 0.12 kWh/kg Fe. ≥ 90% availability. Built cost ≤ $40 per kg Fe/day |
| 3. Repeat module | Second identical plant from the same drawings, skid-erected | 148 t/day | 6 months | ~$2.1M | Installed ≤ $21 per kg Fe/day. Engineering ≤ $0.8M |
| 4. Product | 12 m² standard grate for 4-shaft (1,000 t Fe/day) sites, at a magnetite mine or port | 1.5 kt pellets/day | — | — | ≤ $8 per kg Fe/day. Concentrate ≤ $120/t delivered |

## Risks and open questions

- **Concentrate price and access are the real risk, not the plant.**
  - DR-grade concentrate is a thin market: a few Mt/yr of merchant supply (Canada, Sweden, Brazil, Chile).
  - At the PFS basis ($140/t delivered) DRI is blocked today. The plan only pays at ≤ ~$120/t, which means a mine-mouth site or our own upgrading of 65% concentrate.
  - The model has no upgrading step yet. That is a separate design: regrind + magnetic separation / flotation, ~10–20 kWh/t.
- **Mini straight grate.** No straight grate has been built below ~1 Mt/yr. Pot grates and small grate-kilns have. Edge effects (side-wall leakage, hearth layer) are larger on a 1.5 m grate, and recuperation could be well under 85%. Today's recuperation (78%) costs +0.036 kWh/kg Fe.
- **Electric firing.** Firing at 1,300 °C needs ~1,350–1,400 °C air. That is at the limit of FeCrAl elements (≈ 1,400 °C max) and of firebrick-store outlet temperatures. A last-stage top-up from SiC/MoSi₂ heaters or a plasma torch may be needed. Burning a little H₂ in the firing hood is the fallback; it costs electrolyzer kWh at ~1.6× the resistive heat.
- **Low-temperature drying on shaft waste heat** at ~90 °C dries slowly. More of the grate goes to drying, or the share falls below 50%. Without it, +0.051 kWh/kg Fe.
- **Bentonite gangue.** Bentonite gangue (0.4 pt Fe) lowers Fe in the HBI and raises EAF slag. An organic binder avoids it, but weaker green balls and lower fired strength under H₂ reduction are open questions (Phase 0).
- **Gangue accounting.** The flowsheet splits gangue out at the pellet plant only because the shaft unit takes pure Fe₂O₃. Shaft heat for gangue is in the dri-shaft design (`pelletFeFraction`), but not in the recipe.
- **Screening-grade model.** Mean heat capacities, the oxidation "useful fraction", stack flows, masses per m² of grate, manufacturing factors and fixed costs are assumptions. Phases 0–2 replace them with measured values in `engine/designs/pellet-plant.js`.

## Engine changes recommended (not made here)

1. **Size-dependent design factors.** As in the dri-shaft doc: the recipe pack is world-scale, and the engine scales it further down by size, so it under-prices small plants (today-built is 3.4× the scaled recipe at 100 t/day). Accept `capexFactor` as a function of size, or use small-plant pack intensities with the engine's scale curve.
2. **Gangue through the shaft.** Let `hydrogen-dri` accept a mixed ore stream (Fe₂O₃ + gangue to the product or a slag port), so the pellet plant does not have to split gangue out.
3. **Part-thermal units.** A thermal unit's fans and drives (~25% of the lean pellet plant's kWh) are firmed on the heat store with the rest of its energy. A `thermalShare` in the design override would firm only the heat.
4. **App registration.** The Designs view and the Abundance frontier load designs through `<script>` tags in `index.html`. Add `<script src="engine/designs/pellet-plant.js"></script>` next to `dri-shaft.js` (not done here: `index.html` was out of scope).
