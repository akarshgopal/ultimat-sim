# Design: solar-modulating Hall–Héroult aluminium smelter

Status: concept design + build plan. Model: `engine/designs/smelter.js` (tested in `tests/design-smelter.test.js`). It replaces the flowsheet unit `aluminium-smelter` in the pathways `aluminium` and `silicon` (which carries the same unit at 0.127 kg Al per kg product). Costs are screening estimates: a bill of materials at 2024–25 commodity prices (`data/bom.js`) times explicit manufacturing factors, plus installation and fixed plant costs. Every number below regenerates from the model and the company simulator, at a **1,000 t Al/day plant (≈ 365 kt/yr)**: the size the abundance scoreboard prices (10 t/day reference × 100). All `capexFactor`s are relative to the recipe at that size: 1,890 × 100^−0.15 = **$947 per kg/day** (≈ $2,600 per t/yr).

**Basis.** All $/(kg/day) figures are per kg/day at the line's **rated peak current**, which is what the engine means by full load (it derates output on nights the plant runs below it). A line that boosts to 1.3× nominal by day makes 1.3× more metal per pot at peak, so it is cheaper per kg/day.

## Why this unit

Primary aluminium is a 78 Mt/yr market at $2.87/kg. On the recipe it is **blocked at 1.29× price today** ($3.71/kg), and its largest item is energy: $2.49/kg for 20.6 kWh/kg (14 for the smelter, 6.6 for Bayer alumina). Most of that energy cost is storage: a 1,000 t/day recipe plant carries **9.2 GWh of batteries** (≈ $3.2 billion, ~3× the $0.95 billion smelter) plus 3.9 GWh of heat store for Bayer. A potline is the textbook baseload load: the pots keep a ~960 °C cryolite bath molten with their own ohmic heat, and a frozen ledge protects the side walls. Cut the current and the ledge grows until the bath freezes.

The questions: how far can a pot ride the sun, what does the hardware that lets it do that cost, and what is left of the unit's capex and kWh/kg once it is designed lean?

## Requirements

| Requirement | Target | Why |
|---|---|---|
| Product | P1020-grade ingot/sow, ≥ 99.7% Al | Bulk LME-grade metal |
| Energy | ≤ 13 kWh/kg AC at the PV bus (cycle average); ΔH = 6.38 kWh/kg (carbon anode) is the floor | Each kWh/kg is ~$0.11/kg at today's PV |
| Installed cost | ≤ $450 per kg/day of peak capacity at 1,000 t/day (≤ ½ the recipe) | Takes the unit below 10% of price |
| Modulation | Day boost ≥ 1.3× nominal; night floor as low as the heat balance allows, for 14–16 h every night | Cuts batteries and pot count |
| Firming | Firmed (never stops): `flexible: false` with the design's `minTurndown` | A frozen pot costs ~$0.5–1M to restart and reline |
| Power | ~1,500 V DC, fed from PV through DC/DC | The potline is a DC load at PV-string voltage |

## Model results (1,000 t/day)

| | Today: conventional 400 kA prebake | **Lean solar-modulating** | Lean + drained TiB₂ cathode | Lean + inert anode + drained cathode |
|---|---|---|---|---|
| Installed | $963 per kg/day ($2,639 per t/yr) | **$440 per kg/day** ($1,205 per t/yr) | $448 | $1,013 |
| capexFactor (vs $947) | 1.017 | **0.464** | 0.473 | 1.070 |
| Raw materials / idiot index | $154 / 6.3× | $123 / **3.6×** | $126 / 3.6× | $266 / 3.8× |
| materialsFactor | 0.162 | 0.130 | 0.133 | 0.281 |
| Energy, cycle average (AC) | 14.15 kWh/kg (energyFactor 1.011) | **12.94 kWh/kg (0.924)** | 12.00 (0.857) | 14.56 (1.040) |
| … at peak / nominal / night | 13.92 / 13.92 / 14.30 | 13.64 / 12.53 / 12.31 | 11.63 / 12.47 / 12.33 | 14.31 / 15.43 / 14.76 |
| Pots | 326 × 400 kA, 0.85 A/cm², 16.4 × 5.0 m | 203 × 500 kA, 0.70 A/cm², 24 × 5.0 m | 199 × 500 kA | 198 × 500 kA |
| Cell at nominal | 4.06 V + 0.17 V bus, ACD 4.5 cm, CE 95.3% | 3.67 V + 0.14 V, ACD 4.6 cm, CE 94.3% | 3.70 V, CE 95.4% | 4.64 V, CE 95.4% |
| Operating band (× nominal current) | 0.79–1.00 (no boost) | **0.73–1.30** | 0.73–1.30 | 0.81–1.30 |
| Night floor (÷ peak) → engine `minTurndown` | 0.79 → **0.858** | 0.56 → **0.707** | 0.56 → 0.705 | 0.62 → 0.748 |
| Heat-balance hardware | none (fixed shell cooling, h ≈ 30 W/m²K) | shell heat exchangers, h 6–110 W/m²K | same | same |
| Power conversion | AC rectiformers, 552 MW | DC/DC from PV, 548 MW DC peak, one 843 V line | 467 MW | 576 MW |

Lean override: `{ capexFactor: 0.464, energyFactor: 0.924, materialsFactor: 0.130, minTurndown: 0.707, flexible: false }`; today's: `{ 1.017, 1.011, 0.162, 0.858, false }`. The inert-anode preset also passes `feedFactors: { 'carbon-anode': 0 }`.

### The cell and its heat balance

**Voltage** = reversible voltage (1.20 V for carbon) + anode overvoltage (Tafel, 0.50 V at 0.85 A/cm²) + 0.05 V cathode + bath ohmic drop + bubbles + conductors + busbar drop.

- Bath drop j·ρ·ACD/1.15 with ρ = 0.45 Ω·cm: 1.50 V at 0.85 A/cm² and 4.5 cm.
- Bubbles add 0.25 V; anode and cathode conductors 0.66 Ω·cm².
- The busbar drop comes from aluminium busbars sized at 0.4 A/mm² of peak current.

**Current efficiency.** A back-reaction loss current of 0.04 A/cm² rises with superheat and with shorter ACD (metal-pad waves); CE ≈ 1 − 0.04/j, so low current density costs CE.

**Heat.** Each kg of Al takes the reaction enthalpy **ΔH = 6.38 kWh/kg** for Al₂O₃ + 1.5 C → 2 Al + 1.5 CO₂ with cold feed and products at 960 °C (NIST-JANAF): a thermoneutral voltage V_tn = 2.14 V. Inert anodes, which give off O₂, need 9.31 kWh/kg (3.12 V). The pot generates I·(V − CE·V_tn) of heat (807 kW for today's pot), which leaves through the side walls (36%), the top (46%: crust, anode cover, off-gas) and the bottom (18%). The lining is designed to close this balance at the design point.

**Side walls.** In steady state the side flux is pinned by the bath superheat, q = h_bath·ΔT_superheat with h ≈ 950 W/m²K. The shell's external cooling sets the **ledge thickness**, x_L = k_L·[(T_liq − T_air)/q − R_wall − 1/h_ext], which must stay 3–15 cm with superheat 5–14 K. With fixed shell cooling the ledge window allows q = 5.1–11.7 kW/m²; with a shell heat exchanger (insulate at night, blow air by day) only the superheat window binds, q = 4.75–13.3 kW/m². So the heat exchanger frees the full superheat window and steers the ledge, widening the band at the top (boost) more than at the bottom.

**Night.** Below nominal current the pot first cuts losses (superheat to 5 K, shell insulated, draft down), then **raises the anodes** (ACD up to 7 cm) to make heat ohmically in the bath. That costs kWh at night: today's pot needs 14.30 kWh/kg at its 0.79 floor against 13.92 at nominal.

**Day.** By day the pot lowers ACD to the 3.8 cm MHD limit, then opens the losses (superheat 14 K, forced air, draft).

**The ledge as a daily heat store.** Freezing it thicker through the night releases latent heat (510 kJ/kg), and it melts back by day: 70% of the 12 cm window over the lean pot's side wall is **1.34 MWh per pot** (today's pot, with fixed cooling: 0.41 MWh). That widens the daily band beyond the steady one (lean: 0.78–1.23 steady, 0.73–1.32 on a daily cycle).

**Thermal wall at low current density.** Top and bottom losses cannot be insulated below ~3.5 kW/m² of pot plan area, so a low-voltage cell that makes less heat must run a longer ACD than asked for. At 0.70 A/cm² the lean pot is at that wall: asked for 4.3 cm, it runs 4.57 cm. Energy-lean cells are insulation-limited and the hardest to modulate.

### How low, and for how long

| Heat-balance hardware | Steady band | Daily band (ledge as store) | Night floor ÷ peak | Engine `minTurndown` | Hours at 70% / 60% / 50% of nominal before the ledge is used up |
|---|---|---|---|---|---|
| None (today's 400 kA pot) | 0.80–1.15 | 0.79–1.18 | 0.79 (no boost rating) | 0.858 | 2.4 / 1.3 / 0.9 |
| None, lean 500 kA pot, boost rated | 0.79–1.19 | 0.77–1.22 | 0.63 | 0.751 | — |
| **Shell heat exchangers (EnPot-type), lean** | 0.78–1.23 | **0.73–1.32** | **0.56** | **0.707** | 10 / 4.8 / 3.3 |
| Deep: heavy jackets, draft 0.6–1.8× | 0.75–1.26 | 0.70–1.35 | 0.52 | 0.681 | 15 / 5.6 / 3.7 |

Shell heat exchangers buy roughly **−27% / +32% around nominal** on a daily cycle, consistent with the ±25–30% demonstrated industrially. Doubling the hardware (the deep shell) adds only ~3 points at night, because a hot pot needs its loss heat whatever its output (~590–680 kW for the lean pot): at night it makes that heat by raising the anodes, and ACD tops out at ~7 cm. Below the floor the ledge buys a few hours, not a night.

**The night floor is set by the anode stroke and by top + bottom losses, not by the side wall.** Going deeper needs insulated lids or covers, a longer anode stroke, or the kWh penalty of very long ACDs (9 cm: floor 0.51, 13.23 kWh/kg).

**Engine translation.** The engine enforces `minTurndown` as a daily-energy floor in the worst month: direct PV plus store ≥ t × 24 h of full load (`baseDesign`'s `worstMonth`). A line at peak for H ≈ 8 h on direct PV and at night floor f for the rest needs t = f + (1 − f)·H/24; the design reports this t (the ~8 h is from the engine's baseload curves at k ≈ 2–4 kWp/kW at the best sites). For a conventional potline physics gives 0.858, stricter than the engine's generic 0.7 default, so the recipe row assumes more flexibility than real pots have.

### Design levers (lean baseline; aluminium $/kg at the best site, today's PV / frontier)

| Lever | $ per kg/day | kWh/kg | Band × nominal | Engine t | $/kg today | $/kg frontier |
|---|---|---|---|---|---|---|
| Anode current density 0.60 A/cm² | 462 | 12.47 | 0.85–1.30 | 0.77 | 3.27 | 1.171 |
| 0.65 | 450 | 12.70 | 0.78–1.30 | 0.73 | 3.30 | 1.174 |
| **0.70 (lean)** | **440** | **12.94** | **0.73–1.30** | **0.71** | **3.33** | **1.190** |
| 0.80 | 433 | 13.64 | 0.74–1.25 | 0.73 | 3.43 | 1.190 |
| 0.90 | 427 | 14.44 | 0.76–1.21 | 0.75 | 3.54 | 1.209 |
| Boost rating 1.0 / 1.15 / 1.3 | 506 / 467 / 440 | 12.51 / 12.57 / 12.94 | — | 0.82 / 0.76 / 0.71 | 3.30 / 3.29 / 3.33 | 1.181 / 1.174 / 1.190 |
| Pot amperage 300 / 400 / 500 kA | 464 / 448 / 440 | 12.95 / 12.94 / 12.94 | — | 0.72 / 0.71 / 0.71 | 3.34 / 3.34 / 3.33 | 1.184 / 1.183 / 1.190 |
| Max ACD 5.5 / 7 / 9 cm | 440 | 12.68 / 12.94 / 13.23 | from 0.80 / 0.73 / 0.66 | 0.74 / 0.71 / 0.67 | 3.29 / 3.33 / 3.37 | 1.176 / 1.190 / 1.197 |
| Busbar 0.25 / 0.4 / 0.6 A/mm² | 471 / 440 / 423 | 12.77 / 12.94 / 13.16 | — | 0.71 | 3.32 / 3.33 / 3.35 | 1.200 / 1.190 / 1.173 |
| AC rectiformers instead of DC/DC | 481 | 13.13 | — | 0.71 | 3.38 | 1.197 |
| Deep-modulation shell | 451 | 12.95 | 0.70–1.35 | 0.68 | 3.34 | 1.192 |
| Drained TiB₂ cathode (carbon anode) | 448 | **12.00** | 0.73–1.30 | 0.71 | **3.20** | 1.169 |
| Inert anode + drained cathode | 1,013 | 14.56 | 0.81–1.30 | 0.75 | 3.64 | **1.126** |
| *Recipe / today preset* | *947 / 963* | *14.0 / 14.15* | | *0.7 / 0.86* | *3.71 / 3.74* | *1.158 / 1.229* |

- **At today's PV, kWh/kg is the lever, not capex.** Once the unit is lean, 1 kWh/kg is $0.11/kg. Current density moves toward 0.6–0.7 A/cm² (more, longer pots at lower voltage) until the insulation wall stops it; below ~0.65 ACD is set by heat, not stability, and the band closes (0.85 floor at 0.60).
- **Boost lowers capex but not $/kg.** At 1.3× the line is 13% cheaper per kg/day, but the extra heat is dumped at 14 K superheat, so peak kWh/kg rises.
- **Amperage:** 400–500 kA is flat. Fewer, bigger pots save pot-tending machines, controllers and superstructure; busbar per kA grows with MHD compensation. Pot length is capped at a 24 m cavity, so at 0.7 A/cm² a pot carries at most ~520 kA.
- **Drained cathodes** are the biggest single kWh lever: −0.94 kWh/kg, mostly from running at 2.2 cm ACD by day with no metal-pad waves, plus +1 point CE. Their night floor matches the flat cell's, since nights are still ACD- and insulation-limited.
- **Inert anodes** need +1.0 V of reversible voltage and +2.9 kWh/kg of reaction enthalpy, and ~18 t of Cu–Ni–Fe anode per pot replaced every 3 years costs ~$430 per kg/day (initial charge + PV of replacements). At today's PV they do not pay. At the frontier they are the cheapest option, because `feedFactors` removes the purchased carbon anode ($0.177/kg Al: 0.334 kg at $0.53) and energy is cheap; they also remove 1.22 kg CO₂/kg.
- **At the frontier the rankings compress to ±3%**, and the designed smelter is squeezed to 1.5× its own materials (see the scoreboard).

### Deeper modulation vs battery kWh

Forcing the lean override's `minTurndown` over the range the engine allows:

| Engine t | 0.86 | 0.75 | **0.71 (lean)** | 0.6 | 0.5 | 0.4 | 0.3 | 0.2 |
|---|---|---|---|---|---|---|---|---|
| $/kg today | 3.34 | 3.33 | **3.33** | 3.33 | 3.34 | 3.39 | 3.55 | 3.73 |
| Output factor | 0.96 | 0.85 | 0.80 | 0.70 | 0.60 | 0.50 | 0.42 | 0.33 |
| Battery (GWh per 1,000 t/day) | 8.5 | 7.2 | 6.4 | 4.9 | 3.5 | 2.2 | 1.4 | 0.3 |
| $/kg frontier | 1.177 | 1.183 | **1.190** | 1.208 | 1.234 | 1.267 | 1.337 | 1.341 |

The engine trades storage against idle plant: every GWh of battery saved is paid for by running the whole plant (PV, Bayer, potline, the remaining store) below its rating at night. At today's PV the two cost about the same, so the curve is flat from t = 0.86 to 0.5. At the frontier, where the battery is squeezed to its materials, idle plant costs more than the battery it saves, so a shallower floor is slightly cheaper. **Deeper modulation is worth nothing in either scenario.** The lean design stops at EnPot-type shells (the deep shell costs ~$11 per kg/day more and returns nothing); the money is in kWh/kg and capex.

### Abundance scoreboard

`abundanceScoreboard` (sizeMultiple 100, best site). Today = default config. Frontier = PV capex and floor ÷10, idiot-index target 1.5 with `Bom.floors()`, every other design at its lean preset.

| Scenario | Smelter | Status | Cost ÷ price | $/kg | kWh/kg | Top cost items ($/kg) |
|---|---|---|---|---|---|---|
| Today | recipe | blocked | 1.29× | 3.71 | 20.6 | energy 2.49, smelter 0.39, bauxite 0.27, Bayer 0.20, carbon anode 0.18 |
| Today | today design | blocked | 1.30× | 3.74 | 20.8 | energy 2.52, smelter 0.39, bauxite 0.27 |
| Today | **lean** | blocked | **1.16×** | 3.33 | 19.6 | energy 2.25, bauxite 0.27, Bayer 0.24, smelter 0.21 |
| Today | lean + drained | blocked | 1.12× | 3.20 | 18.6 | energy 2.12, bauxite 0.27, Bayer 0.24, smelter 0.22 |
| Today | inert + drained | blocked | 1.27× | 3.64 | 21.2 | energy 2.57, smelter 0.42, bauxite 0.27 |
| Frontier | recipe | abundant | 0.40× | 1.158 | 20.6 | energy 0.48, bauxite 0.27, carbon anode 0.18, other 0.11, smelter 0.03 |
| Frontier | today design | abundant | 0.43× | 1.229 | 20.8 | energy 0.49, smelter 0.07 |
| Frontier | lean | abundant | 0.41× | 1.190 | 19.6 | energy 0.46, bauxite 0.27, carbon anode 0.18, other 0.11 |
| Frontier | lean + drained | abundant | 0.41× | 1.169 | 18.6 | energy 0.43, bauxite 0.27, carbon anode 0.18 |
| Frontier | **inert + drained** | abundant | **0.39×** | 1.126 | 21.2 | energy 0.50, bauxite 0.27, smelter 0.12, other 0.11 |

With recipes only the frontier row is the same as "Frontier, recipe" (abundant 0.40×). The design does not change the feasible share of world tonnage (39.5% today, 93.6% at the frontier).

**Today.** The lean smelter removes the unit as a cost item ($0.39 → $0.21/kg) and cuts batteries from 9.2 to 6.4 GWh per plant, but aluminium **stays blocked (1.16×)**: 19.6 kWh/kg at an effective $0.115/kWh is $2.25/kg on its own. No smelter design unblocks it at today's PV.

**Frontier.** Aluminium is already abundant on the recipe (0.40×), and the lean carbon-anode smelter is slightly *dearer* (0.41×). The engine squeezes a designed unit to its *own* materials × 1.5 (0.130 × 1.5 = 0.195 of recipe), while recipe units are squeezed to the generic process-class floor (0.045 × 1.5 = 0.067). A potline is materials-heavy (aluminium busbars, graphite cathodes: $123 per kg/day, 13% of the recipe), so the generic floor understates it ~3×; the design's own number is the honest one. Removing the carbon anode is what moves the frontier cost.

**What blocks aluminium next** is energy, and most of it is not the smelter: Bayer is 6.6 of the 19.6 kWh/kg (firmed on the heat store). The smelter rejects ~5.2 kWh/kg of heat, about half through the shell heat exchangers as 150–300 °C air that could supply part of the Bayer digestion heat (145–250 °C). After energy come bauxite ($0.27/kg), the purchased carbon anode ($0.18/kg) and Bayer capex.

## Architecture

1. **Potline.** 203 pots × 500 kA nominal (650 kA rated peak) in one ~843 V series line, single row, side-by-side, in an open-sided desert potroom.
   - 24.0 × 5.0 m shells: 20 mm plate on cradles, a 22.9 × 3.9 m cavity, 71 m² of anode in two rows.
   - Flat graphitized cathode blocks (0.45 m) with steel collector bars, Si₃N₄-bonded SiC side walls, 0.4 m of refractory and insulation under the cathode.
   - Superstructure: anode beam with jacks (stroke ≥ 3 cm beyond nominal ACD for night heat), point feeders, hooded gas collection.
2. **Heat-balance hardware (per pot).**
   - Insulated steel jackets with dampers on the long sides: closed at night (h_ext ≈ 6 W/m²K, ledge ≤ 15 cm), forced air by day (≈ 110 W/m²K, ledge ≥ 3 cm).
   - Fans: ~1.9 MW for the line, ≈ 9 kW per pot.
   - Ledge/superheat sensing (side-wall thermocouples, bath temperature, cell resistance noise) and damper actuators, closed-loop with amperage and anode-beam position.
   - Duct draft held at nominal in the lean preset (fluoride capture first), modulated 0.6–1.8× in the deep preset.
3. **Power.** PV strings feed DC/DC converters (≈ $35/kW, 99%) that regulate line current directly: no AC switchyard, no rectiformers. The night load is carried by the engine's battery block on the same DC bus. Busbars are cast aluminium (the plant's own metal) at 0.4 A/mm² of peak current, ~15 m per pot including MHD compensation; bus drop 0.14 V at nominal.
4. **Fume treatment.** Dry alumina scrubbers with bag filters at 396 Nm³/s; fluorides return to the pots on the reacted alumina.
5. **Alumina.** 20 days of silos and dense-phase conveying to the pot feeders.
6. **Anodes.** Bought baked. A lean rodding shop (bath crushing, stub repair, rod assembly); anode change by 6 pot-tending machines (≈ 34 pots each).
7. **Casthouse.** Holding furnaces and ingot/sow casting lines.

## Bill of materials (lean design, per kg Al/day of peak capacity at 1,000 t/day)

| Part | Material | kg per kg/day | Materials $ | Mfg × | $ per kg/day |
|---|---|---|---|---|---|
| Installation (× 1.35) | — | — | — | — | 106.3 |
| Cathode blocks + ramming paste | graphite | 15.09 | 40.75 | 1.3 | 53.0 |
| Busbars | aluminium | 13.33 | 32.25 | 1.2 | 38.7 |
| Engineering, permits, owner | — | — | — | — | 30.0 |
| Pot shells and cradles | steel | 13.21 | 8.58 | 2.5 | 21.5 |
| Power conversion (DC/DC, 548 MW) | — | — | — | — | 19.2 |
| Pot-tending machines (6) | — | — | — | — | 18.0 |
| Bottom lining (refractory + insulation) | refractory | 14.63 | 8.78 | 2 | 17.6 |
| Superstructure, anode beam, feeders, hoods | steel | 8.63 | 5.61 | 3 | 16.8 |
| Offices, laboratory, mobile fleet | — | — | — | — | 15.0 |
| Anode rods (incl. rodding-cycle spares) | aluminium | 2.03 | 4.91 | 3 | 14.7 |
| Fume treatment | steel | 7.13 | 4.63 | 3 | 13.9 |
| Casting machines | — | — | — | — | 12.0 |
| Pot controllers + potline DCS | — | — | — | — | 10.0 |
| SiC side-wall blocks | refractory (× SiC factor) | 2.94 | 1.76 | 5 | 8.8 |
| Potroom concrete | concrete | 41.67 | 4.17 | 1.5 | 6.2 |
| Rodding shop equipment | — | — | — | — | 6.0 |
| Collector bars | steel | 3.04 | 1.98 | 3 | 5.9 |
| Auxiliaries (water, air, workshops) | steel | 2.00 | 1.30 | 3 | 3.9 |
| Anode yokes and stubs | steel | 1.83 | 1.19 | 3 | 3.6 |
| Shell heat-balance controls | — | — | — | — | 3.0 |
| Casthouse structure; potroom steel | steel | 3.73 | 2.42 | 2–3 | 5.8 |
| Rodding shop steel; holding-furnace refractory; alumina silos and handling | steel, refractory | 4.16 | 2.64 | 2–3 | 6.5 |
| **Shell heat-exchanger jackets, fans, motors** | steel, copper | 0.67 | 0.46 | 2.5–5 | **1.3** |
| Power conversion copper and steel | copper, steel | 0.47 | 1.46 | 1.5 | 2.2 |
| **Total installed** | | | **122.9** | | **440.0** |

The heat-balance hardware is under 1% of the plant: $4.3 per kg/day for jackets, fans and controls.

**Where today's $963 goes instead:** installation at 1.45× equipment ($280), cathodes ($66), engineering ($60), pot-tending machines at 30 pots each ($55), superstructure at 4.5× its steel ($51), rectiformers and switchyard ($47), busbars ($45), offices and fleet ($40).

**Cost-down path, in order of size:**

1. **Standard potline, repeat engineering, skid-built superstructures** (install 1.45 → 1.35, manufacturing factors 3–5 → 2–3): about −$300.
2. **Boost rating** (1.3× peak per pot): about −$65.
3. **Fewer, bigger pot-tending machines and a desert potroom without cladding:** about −$60.
4. **DC/DC instead of rectiformers:** −$40 and −0.2 kWh/kg.

Materials are dominated by **graphite cathodes ($41) and aluminium busbars ($32)**. The busbars are priced at LME, but they are the plant's own metal at its production cost and fully recyclable. What is left above materials (3.6×) is installation and per-plant fixed costs.

## Build plan

| Phase | What | Scale | Duration | Indicative budget | Exit criteria |
|---|---|---|---|---|---|
| 0. Bench pot + heat-balance rig | 10–20 kA laboratory cell with instrumented side wall: thermocouple arrays through the SiC, ledge profiling by probe, heat-flux plates on the shell. Removable insulated jacket with forced-air channels. Daily current cycles 0.6–1.3× on a programmable DC supply | 15 kA, ~100 kg Al/day | 6 months | ~$1.5M | Measured side flux vs superheat within 20% of q = h·ΔT. Ledge thickness tracks the model across a 0.7–1.3× daily cycle. Latent buffer ≥ 50% of the model's. 60 cycles with no side-wall attack |
| 1. Pilot section on a host line | 4–6 commercial pots (400–500 kA class) retrofitted with shell heat exchangers and long-stroke anode jacks, in an existing potline that accepts a daily amperage profile (or a test section with its own DC/DC supply on ~5 MWp PV + battery) | 4–6 pots, ~20 t Al/day | 18 months | ~$12M | ±25% daily modulation for 90 days at CE ≥ 93% at the floor. Night-floor kWh within 5% of the model. No pot lost. Side-wall temperature excursions inside limits |
| 2. First solar potline section | 40 pots × 500 kA at 0.70 A/cm², DC/DC from ~250 MWp PV + batteries, open potroom, standard superstructure | ~200 t Al/day | 30 months | ~$120M (≈ $600 per kg/day, a first-unit premium over the $440 target) | 0.73–1.30× daily band held for a year. ≤ 13.0 kWh/kg cycle average. Built cost ≤ $600 per kg/day |
| 3. Full line | 203 pots, one 843 V line, from the same drawings | 1,000 t Al/day | 24 months | ~$440M | ≤ $440 per kg/day, ≤ 12.9 kWh/kg, engine turndown ≤ 0.71 demonstrated |
| 4. Next lines | Drained TiB₂ cathodes in the relining cycle. Pot-heat recovery to Bayer digestion | 1,000 t/day × n | — | — | ≤ 12.0 kWh/kg |

Instrumentation throughout: individual pot voltage, current and resistance noise; side-wall and bath temperature; ledge probes on sample pots; superheat by bath/liquidus sampling; damper position and fan power; current efficiency per pot by metal tapping; anode-effect and PFC counts; fluoride emissions at every draft setting.

## Risks and open questions

- **Ledge and side-wall integrity under daily cycling.** Thermal fatigue of the SiC blocks, ledge toe growth under the anodes at night, and side-wall attack if the ledge thins below 3 cm on boost days. The model uses steady-state heat transfer plus a lumped latent buffer; a transient 2D ledge model, checked on the Phase 0 rig, replaces it.
- **Current efficiency at low current density and long ACD.** The model takes CE ≈ 1 − 0.04/j and a mild ACD term. If night CE falls more steeply, night kWh/kg and the floor rise.
- **MHD stability at 0.73× nominal current.** Busbar compensation is designed for one current, so metal-pad stability over 0.73–1.3× must be checked; the model only limits ACD to ≥ 3.8 cm.
- **Alumina feeding and anode effects.** Lower superheat at night slows dissolution (sludge risk); PFC emissions during modulation must be counted.
- **Fluoride capture at reduced draft.** Night draft below nominal risks fugitive HF; the lean preset keeps draft at 1.0×.
- **Drained cathodes.** TiB₂ coatings tried in the 1980s–2000s failed by cracking and dissolution, and their life in a cycling pot is unknown. Phase 4 only.
- **Inert anodes.** Anode life, metal purity (Cu/Ni/Fe pick-up) and cost. They pay only when energy is cheap and the carbon anode is removed.
- **Screening-grade model.** Typical literature electrochemical constants; assumed manufacturing factors, fixed costs and today calibration (to the recipe at 1,000 t/day). The ~8 h of direct-PV peak in the turndown translation is from the engine's curves, not a site study.

## Engine changes recommended (open)

1. **Make `minTurndown` a night floor, not a daily-energy floor.** `baseDesign` tests `worstMonth = (direct + fromStore)/24 ≥ t`, which lets a unit with t = 0.7 sit at ~55% overnight, while the README defines it as the lowest fraction of full load the unit can hold through the night. Compare the worst month's `fromStore / deficit` with t in `curvesFor`; designs could then pass the physical night floor (0.56 lean, 0.79 today) instead of the H-hour translation. Revisit the generic 0.7 default: for a conventional potline it is too generous.
2. **Unit heat export.** The smelter rejects ~5 kWh/kg Al, half as 150–300 °C air from the shell heat exchangers, while Bayer in the same flowsheet buys 6.6 kWh/kg of heat. A `heatExportKWhPerKg` with a temperature on a designed unit, netted against a co-located thermal unit's energy, would price pot-heat recovery.
3. **Process-class floor for metallurgical units.** `bom.js`'s `process` class (0.045 of recipe) understates a potline ~3×, which is why the designed smelter looks dearer than the recipe under `idiotIndex.target`. Give electrolytic-metal units their own class (graphite, aluminium, steel, refractory), or let recipe units of a designed type use that design's `materialsFactor`.
