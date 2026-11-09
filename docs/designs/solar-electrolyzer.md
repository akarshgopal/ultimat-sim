# Design: solar-matched alkaline electrolyzer

Status: concept design + build plan. Model: `engine/designs/electrolyzer.js` (parametric, tested in `tests/design-electrolyzer.test.js`); interactive in the app under **Designs**. All costs are screening estimates from a bill of materials at 2024–25 commodity prices (`data/bom.js`) times explicit manufacturing factors — every number below regenerates from the model.

## Why this first

The company simulator says the electrolyzer gates the biggest material markets reachable from sunlight and water: H₂ itself, ammonia/urea, DRI steel, FT fuels, olefins. Today's electrolyzers cost ~31× their raw materials (the recipes' $1,500/kW), the highest idiot index of any equipment class except desalination. Make it cheap, and make it run well for 6–8 sun-hours a day, and those pathways move from "never" toward feasible.

## Requirements (from the model)

| Requirement | Target | Why |
|---|---|---|
| Operating profile | Follow PV directly, 0 → 100% → 0 every day, ~6.5–8 full-load h/day, ~2,500 h/yr | Solar-only; storage of electricity costs more than oversizing the stack |
| Installed cost | ≤ $50–100/kW (stack + BoP + install), ≤ $100–200 per kg H₂/day | Below this the stack is a small share of $/kg; PV dominates |
| Energy | ≤ 53 kWh/kg at the chosen current density | Every kWh/kg is ~2% more PV |
| Stack life | ≥ 25 yr at solar duty (≥ 65,000 operating h) | At ~2,500 h/yr an 80,000 h stack outlives the plant: no stack replacement |
| Output | Atmospheric H₂, ≥ 99.5% after drying | Compression belongs to the consumer (Haber loop, DRI, storage), sized to its own duty |

## Model results (Mejillones, Chile: 5.27 kWh/kWp·day)

| | Today (China-made pressurized alkaline) | Lean solar-matched target |
|---|---|---|
| Installed | **$453/kW** ($923 per kg/day) | **$48/kW** ($100 per kg/day) |
| Raw materials | $42/kW | $13.5/kW |
| Idiot index | 10.8× | 3.5× |
| Energy | 50.9 kWh/kg (0.3 A/cm², 1.80 V) | 52.8 kWh/kg (0.4 A/cm², 1.85 V) |
| H₂ on sunlight, PV $758/kWp (today) | $3.48/kg (stack $1.00, PV $2.45) | $2.65/kg (stack $0.12, PV $2.50) |
| H₂, PV $250/kWp (3×) | $1.81/kg | $0.97/kg |
| H₂, PV $76/kWp (10×) | $1.18/kg (stack $0.84) | **$0.39/kg** |
| Best current density at 10× PV | 0.55 A/cm² | 0.55 A/cm² |
| Full-load hours, stack oversizing | ~7 h/day, ~3.3× nameplate | ~7 h/day, ~3.4× nameplate |
| PV per kg H₂/day | ~10 kWp | ~10 kWp |

Read this as two coupled programs:

- **With a lean stack, PV is ~94% of $/kg at today's PV prices.** The electrolyzer program only pays off together with cheap PV (racking, DC-direct strings, land).
- **With cheap PV, today's stacks become the cost** ($0.84 of $1.18). The lean design takes $/kg from $1.18 to $0.39 at 10× cheaper PV.
- **Current density follows PV price.** Run low (0.15 A/cm²) when PV is dear — spend stack to save PV — and high (0.5+) when PV is cheap. Design the stack so the same hardware can be run at either.

## Architecture

1. **Stack** — bipolar filter-press, ~250 cells × 2.5 m² active (~4.6 MW at 0.4 A/cm²).
   - Bipolar plates: 1.0 mm stamped carbon steel, 15 µm Ni plating both faces.
   - Electrodes: Ni expanded mesh / foam, ~0.35 kg/m² each, activated (Raney-type or NiFe/NiMo coatings later).
   - Separator: Zirfon-type (PPS mesh + ZrO₂) at ~$60/m² baseline; plain PPS felt (~$8/m², +0.15 Ω·cm²) as the cost-down option.
   - Frames/gaskets: EPDM or PP; end plates 50 mm steel with tie rods.
2. **Lye loop** — 30 wt% KOH, ~80 °C at full load; atmospheric gas–lye separators, lye pump, simple plate cooler, demister and water wash on H₂. Atmospheric operation cuts BoP steel ~2× vs 30 bar and removes the pressure-rated vessels.
3. **Power** — PV strings wired straight to stack groups (no inverter, no rectifier). Stack voltage ≈ cells × 1.8–2.1 V ≈ 450–525 V per 250-cell stack; series pairs match ~1,000 V DC strings. Expected mismatch loss ~5% (modelled); a DC-DC MPPT stage ($40/kW, 2% loss) is the fallback. A grid-style rectifier costs ~$120/kW plus copper and nearly doubles $/kg at cheap PV.
4. **Turndown and safety** — at low current, H₂ crosses the separator into O₂. Stacks are grouped and switched in/out with the sun so each running group stays above its minimum load (~10–20%); O₂ purity is monitored with a hard trip at 2% H₂ in O₂ (half the LEL).
5. **Daily thermal cycle** — stacks start cold each morning and heat on their own losses; the model's polarization curve is at ~80 °C, so morning efficiency is lower (to be measured in Phase 1).
6. **Shutdown** — on PV loss the stack self-discharges; a small polarization/shunt circuit protects electrodes from reverse currents (the main known degradation mechanism under daily cycling).

## Bill of materials (lean design, per kW)

| Part | Material | kg/kW | Materials $/kW | Mfg × | $/kW |
|---|---|---|---|---|---|
| Separator (purchased) | — | — | — | — | 10.9 |
| BoP vessels, piping, skid | steel | 4.0 | 2.60 | 3 | 7.80 |
| Install (×1.15) | — | — | — | — | 6.23 |
| BoP stainless (lye/gas) | stainless steel | 0.80 | 1.60 | 3 | 4.80 |
| DC bus / coupling copper | copper | 0.30 | 2.74 | 1.5 | 4.11 |
| Electrodes (Ni mesh) | nickel | 0.095 | 1.59 | 2.5 | 3.98 |
| Foundations | concrete | 15 | 1.50 | 1.5 | 2.25 |
| Bipolar plates | steel | 1.43 | 0.93 | 2 | 1.86 |
| Plate Ni plating | nickel | 0.049 | 0.82 | 2 | 1.64 |
| BoP pumps, instruments | copper | 0.05 | 0.46 | 3 | 1.37 |
| BoP polymer | polymer | 0.30 | 0.33 | 3 | 0.99 |
| End plates + tie rods | steel | 0.66 | 0.43 | 2 | 0.86 |
| Assembly labour | — | — | — | — | 0.69 |
| Gaskets / frames | polymer | 0.073 | 0.08 | 3 | 0.24 |
| **Total installed** | | | **13.5 (materials incl. separator)** | | **47.8** |

Where today's $453/kW goes instead: rectifier ($120), pressurized BoP fabricated at ~6× materials ($171), thick electrodes at 8× ($40), 2 mm plates at 5× ($13), assembly ~600 h/stack ($15), install 1.3×. The cost-down path is, in order of size: **drop the rectifier → atmospheric BoP built like water-treatment skids → thin stamped plates and mesh electrodes made in-line → cheap separator → minimal civil works.**

## Build plan

| Phase | What | Scale | Duration | Indicative budget | Exit criteria |
|---|---|---|---|---|---|
| 0. Bench cells | Single cells, 100–300 cm², Zirfon vs PPS, thin Ni-plated plates, mesh electrodes; solar-day cycling rig (programmable PSU replaying PVGIS days) | < 1 kW | 3 months | ~$50k | Polarization within ±50 mV of the model at 80 °C; degradation < 5 µV/h over 1,000 daily cycles; H₂-in-O₂ < 1% at 15% load |
| 1. Short stack on real PV | 10–20 cells at 0.25 m², direct DC to ~10 kWp of PV strings, atmospheric lye loop | 2–5 kW | 6 months | ~$150k | Daily kg/kWp within 10% of model; measured kWh/kg incl. morning warm-up; no reverse-current damage after 150 sun-days |
| 2. Full-size cell, short stack | 50 cells × 2.5 m², stamped plates from a pilot press, in-line Ni plating trial | ~400 kW | 9 months | ~$1M | Stack + BoP at ≤ $150/kW built cost; plate yield > 98% |
| 3. Pilot plant | 1 MW electrolyzer on ~3.5 MWp PV at a sunbelt site, feeding a buffer and a downstream consumer | 1 MW / ~45–50 t H₂/yr | 12 months | ~$3–5M | Installed ≤ $100/kW; 2,400+ full-load h/yr; ≥ 99.5% availability on sunny days; LCOH within 15% of the model at the site |
| 4. Product | Plate/electrode line, standard 5 MW skid, DC string kit | 100 MW/yr | — | — | Installed ≤ $50/kW |

Test instrumentation throughout: cell-voltage monitoring per cell group, H₂-in-O₂ and O₂-in-H₂ analyzers, lye temperature and concentration, string I–V curves, and a log of every start/stop for degradation fitting.

## Risks and open questions

- **Cycling degradation** under daily start/stop (reverse currents, oxidation of Ni cathodes at shutdown). Mitigation: polarization circuit, catalyst choice; measure in Phase 0–1.
- **Low-load gas purity** with thin, cheap separators. Mitigation: stack-group switching, minimum-load control; quantify crossover vs separator in Phase 0.
- **Direct-coupling mismatch** across temperature and irradiance. Measure the real loss vs a DC-DC stage in Phase 1 before committing.
- **Separator cost** is the single largest lean line item; the $60/m² Zirfon price and the PPS felt alternative both need quotes and testing.
- **Morning efficiency** below the 80 °C curve; possibly a small resistive pre-heat or insulation.
- **The model is screening-grade**: polarization fitted to typical literature points, manufacturing factors assumed, BoP masses estimated. Phase 0–2 replace these with measured values, which feed straight back into `engine/designs/electrolyzer.js`.

## What the model says to design next

With the lean electrolyzer in the simulation, ammonia, urea, DRI steel and FT/olefins are still infeasible: their remaining capex is the **synthesis and process equipment** — Haber-Bosch loop + air separation (~80% of green ammonia's capex), the DRI shaft, FT reactors, DAC for e-fuels. The Designs view ranks these blocks live; the next design targets are a **sun-tolerant ammonia loop** (small H₂ buffer, wide turndown) and a **solar DRI shaft**.
