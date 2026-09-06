# Flowsheet engine

Status: Molecular Foundry is the root app, with an editable flowsheet, material recycle, an extended process catalog, post-solve economics, baseline comparison, and site resource budgets. The coastal methane example is the first factory whose available solar, seawater, and unverified supplies come from a named site rather than unbounded sliders.

The engine solves material and energy flows first; `engine/economics.js` values the solved result. The earlier TEA page and its policy, dispatch, maps, and financing modules have been removed.

## Original implementation sequence

Build one small steady-state process engine that can grow in this order:

1. desalination
2. electrolysis
3. direct-air capture
4. fuel synthesis
5. recycle, when a real case needs it
6. economics over solved capacities and flows

Adding a unit must require a catalog entry and a case connection, not a new solver branch. This is what "plug and play" means here; there is no runtime plugin system.

## Model boundaries

The simulator has three layers:

```text
Physics       components, streams, transformations, capacities, constraints
Operation     requested loads, splits, priorities, limiting inputs, recycle convergence
Economics     CAPEX, OPEX, purchases, revenue, policy, financing, DCF
```

Physics says what can happen. Operation chooses how hard installed equipment runs. Economics values the solved result.

Prices never enter a unit equation or a conservation balance. A later optimizer may use economics to choose operating setpoints, but it must wrap the physics solver rather than become part of it.

## Principles

1. Elemental material balances close before money exists.
2. Electricity and heat are explicit edges, not hidden utility deductions.
3. If material or energy crosses a unit boundary, it is on an edge.
4. Units see only their inlet streams, physical parameters, installed capacity, and requested activity.
5. Installed capacity is an input to an operating solve. Automatic plant sizing is a separate outer calculation.
6. Unit models may be empirical, but their fidelity and omissions must be declared.
7. Start with an acyclic representative-day solve. Add allocation and recycle machinery only when a case needs them.

## Graph

The graph contains four kinds of nodes:

- **source**: a bounded environmental or purchased supply such as seawater, air, electricity, or makeup water
- **converter**: a physical unit such as SWRO, an electrolyzer, DAC, or a Sabatier reactor
- **junction**: an explicit mixer, splitter, or energy bus
- **sink**: product offtake, vent, disposal, reinjection, or rejected energy

An output port has one destination. Fan-out requires a splitter; fan-in requires a mixer. This prevents accidental duplication or disappearance of material.

```text
Case
  site          # named location with bounded, evidenced resource budgets
  graph         # nodes and edges
  operation     # setpoints, following rules, split and priority policies
  period        # one representative day in v1
  economics     # optional and ignored by the physics solver

Node
  id            # unique instance id, e.g. "ro-1"
  unit          # catalog id, e.g. "swro"
  params        # physical parameters: recovery, SEC, conversion, efficiency
  capacity      # installed activity limit in the unit's declared basis

Edge
  from          # { node, port }
  to            # { node, port }
```

Edges do not repeat their stream type or disposition. Those are determined by the connected ports, and all boundary outputs terminate at explicit sinks.

When `site` is present, every source block must name a `siteResource`. Resource presence is not access: an unverified grid or freshwater budget is explicit zero, not unlimited supply and not a silent free input. Two source blocks that share a resource draw from the same remaining quantity; the solver clamps rather than duplicating the budget. Composition, phase, temperature, and consumable identity on a source must match the named resource.

The first sited example is `cases/coastal.js`: Almería coast, frozen PVGIS-SARAH3/ERA5 monthly PV yield plus a 2023 hourly typical day (`data/pvgis-almeria-hourly.js`), global 35 g/kg seawater as NaCl, solid-sorbent DAC, and unverified grid/freshwater.

When `site.solar.typicalMonths` is present, `solveHorizon` runs 24 hourly operating solves. Daily setpoints are leftover demand, nameplate is capacity/24, and methane-chain setpoints stay stoichiometric so intermediate CO₂/H₂ is not orphaned. Site electricity is that hour's PV yield plus optional battery discharge. Other site budgets are remaining daily quantities. Night hours with no PV and no stored energy produce nothing.

Site land is estimated after the physics solve in `engine/footprint.js`: PV area from panel efficiency and a location-aware ground-coverage ratio (`layoutSpacingMultiplier = clamp(1 + k·(|lat|/45 − 0.5), 0.82, 1.35)`, then `GCR = clamp(baseGCR / multiplier, 0.05, 0.95)`; default fixed-tilt base GCR 0.45, k = 0.45), plus order-of-magnitude process pads from solved activity. Pads are screening geometry, not surveyed layouts or a restored TEA map. Network `landHa` is the sum of each plant’s total hectares.

A network is a set of sited plants plus optional haul corridors. `engine/network.js` solves each plant with the same physics engine, then rolls up product tonnes, site land, freight, and cash. A corridor moves a sold material to another plant's purchased source, applying distance, loss, and $/t-km. Corridor hauls are internal transfers: origin sales are excluded from the network slate and external revenue; destination economics after re-solve count normally; freight remains in network OPEX. Prices still never enter a unit equation.

## Substances and streams

Material composition is primary. Purity, mass, volume, TDS, and product tonnes are derived views.

```js
// Amounts are mol per representative day.
{
  kind: "material",
  mol: { H2O: 1_000, "Na+": 2, "Cl-": 2 },
  phase: "liquid",
  T_C: 25,
  P_bar: 1,
}

{ kind: "electricity", kWh: 500 }
{ kind: "heat", kWh: 80, T_C: 90 }
```

A small substance registry provides molecular formula, molar mass, and charge. It is enough to derive mass and audit elemental and charge balance; it is not a thermodynamic property package.

Port declarations use the three stream kinds (`material`, `electricity`, and `heat`) plus necessary constraints such as phase, accepted substances, or minimum heat temperature. They do not create a separate stream type for every product.

### Fidelity boundary

v1 guarantees:

- species balance for separation units
- elemental balance across reactions
- charge balance for ionic aqueous streams
- explicit accounting of electricity and heat supplied, consumed, and rejected
- declared empirical recovery, SEC, conversion, selectivity, density, and efficiency assumptions

v1 does not claim full thermodynamic first-law closure. Chemical enthalpy, phase equilibrium, pressure work, and property packages are added only when a unit needs them. The balance report must label this limitation rather than imply Aspen-level rigor.

### Literature-backed process assumptions

Process presets are editable starting points, not universal performance claims. The flowsheet exposes the assumptions that materially change coupling behavior: recovery, electric and thermal specific energy, minimum heat temperature, capture fraction, consumable makeup, and reject-heat temperature.

| Process family | Initial candidates | Parameter basis |
| --- | --- | --- |
| Seawater desalination | SWRO, MED, MSF | [Elimelech & Phillip (2011)](https://doi.org/10.1126/science.1200488); [Ghaffour et al. (2013)](https://doi.org/10.1016/j.apenergy.2012.12.073) |
| Low-temperature electrolysis | alkaline, PEM | [Buttler & Spliethoff (2018)](https://doi.org/10.1016/j.rser.2017.09.003) |
| Direct air capture | `dac-solid` and `dac-electroswing` as separate units; generic `dac` remains a screening block | [IEA DAC 2022](https://www.iea.org/reports/direct-air-capture-2022/executive-summary); [Keith et al. (2018)](https://doi.org/10.1016/j.joule.2018.05.006); [Voskian & Hatton (2019)](https://doi.org/10.1039/C9EE02412C) |
| Electricity | solar PV, grid imports, Radiant/Valar/generic advanced nuclear | [NREL ATB: PV](https://atb.nrel.gov/electricity/2024/utility-scale_pv); [NRC: Kaleidos](https://www.nrc.gov/reactors/new-reactors/advanced/who-were-working-with/pre-application-activities/kaleidos); [Valar Atomics](https://www.valaratomics.com/) |
| Energy storage and process heat | battery, solar thermal, thermal storage | [NREL ATB: battery storage](https://atb.nrel.gov/electricity/2024/2023/utility-scale_battery_storage); [DOE: solar process heat](https://www.energy.gov/cmei/systems/solar-industrial-processes); [DOE: thermal storage](https://www.energy.gov/cmei/systems/solar-thermal-energy-storage-and-heat-transfer-media) |

Different chemistry or external requirements get a separate unit, grouped in the same menu. Parameter presets are only for the same ports and reagents. Switching a DAC route preserves compatible connections and drops incompatible heat or reagent edges without rewriting the existing makeup chemical.

SOEC and enhanced rock weathering are separate future units because their steam/mineral feeds and products do not match the existing electrolyzer or DAC port contracts.

Energy CAPEX, O&M, tariffs, capacity factors, and simple levelized costs are editable scenario assumptions. Radiant and Valar do not publish comparable commercial overnight-cost schedules, so their presets describe configuration and scale while using visibly labeled user-editable cost assumptions rather than vendor quotes.

### Uncertainty display

The Foundry UI tags key outputs with quality classes from `docs/constants-audit.md` (`cited`, `recoverable`, `assumption`, `derived`, `screening`) via `engine/uncertainty.js`. LCOE is **cited** when the solar-pv catalog row uses NREL ATB; product cost is **screening**; site land is **assumption**; process intensities follow catalog `sourceNote` / references. Screening and assumption money uses a tilde and fewer significant figures. A numeric band is shown only when a source states a range. The UI never invents ± error bars.

## Unit contract

Every converter declares one activity basis:

| unit | activity basis |
| --- | --- |
| SWRO | m³ freshwater/day |
| electrolyzer | kg H2/day |
| DAC | kg CO2/day |
| Sabatier | kg CH4/day |

The internal component representation remains mol/day; activity units are the practical quantities used for capacity and controls.

```js
evaluate({ inlets, requestedActivity, capacity, params }) => ({
  activity,          // achieved activity, never above capacity
  requestedInputs,   // port flows wanted at the requested activity
  consumed,          // inlet port flows accepted; pass-through may reappear in an outlet
  outlets,           // output port streams
  limitedBy,         // capacity or named short inputs
})
```

Rules:

- `evaluate` is pure: no DOM, global state, sibling lookup, prices, or costs.
- A unit computes its own limiting activity, stoichiometry, recovery, conversion, and rejection.
- `requestedInputs`, `consumed`, and `outlets` are keyed by declared ports. Here `consumed` means accepted from the edge, not necessarily chemically destroyed.
- Required electricity and heat are ordinary input ports.
- Unit capacity is fixed during an operating solve.
- Diagnostics and derived duties belong in the solved result, not as a second hidden flow ledger.

The catalog begins as one JavaScript object containing port metadata and pure functions. Split it into files only when that becomes easier to maintain. Physics functions cannot live solely in JSON.

## Operation

Operation is separate from unit physics. It supplies:

- a requested activity for a terminal or independently controlled converter
- explicit operating setpoints; demand-following rules can be added without changing installed capacities
- splitter fractions
- an allocation order for a shared scarce resource

The initial electrical bus has one policy: priority allocation. More policies are added only if a real case needs them.

There is no `demand | resource | fixed` sizing mode. A unit can follow downstream demand operationally, but it cannot resize itself. A later design function may repeatedly call the operating solver with different capacities:

```js
solveOperation(caseDefinition)
sizeToTarget(caseDefinition, target) // outer sizing loop; see engine/size.js
optimizeEconomics(caseDefinition)    // later still
```

## Solver growth

The stages below record the implementation sequence; current UI and catalog support is described later in this document.

The solver grows with the acceptance cases rather than anticipating them all.

### Stage 1: acyclic flow

For standalone desalination, validate the graph and evaluate it in dependency order. Sources provide bounded requested inputs; the SWRO unit clamps activity to its capacity and available feed and electricity.

### Stage 2: request and allocation

Electrolysis introduces shared electricity and downstream water demand. A request pass determines usable demand, the priority bus allocates its bounded supply, and a second pass evaluates achieved activity.

The acceptance fixture uses fixed SWRO and electrolyzer capacities, explicit operating setpoints, an `electrical-bus` with priority order `['ro', 'electrolyzer']`, and explicit H2/O2 sinks. It expects electricity shortage to throttle electrolysis after SWRO, while component and electricity balances remain closed.

Automatic propagation of an H2 target into an SWRO operating setpoint is deferred. The case currently supplies matching setpoints explicitly; neither unit changes its installed capacity.

The result reports unmet requests and the limiting port. Shortage is not an exception and is never silently ignored.

### Stage 3: direct-air capture

DAC uses gas, electricity, temperature-graded heat, and consumable-makeup inputs. Captured CO2 and depleted air terminate at material sinks, while rejected process heat terminates at a heat sink. The acceptance case and runnable report are kept as small CommonJS fixtures:

```text
cases/dac.js
scripts/flowsheet-demo.js
tests/dac-flowsheet.test.js
```

The case checks nominal CO2 capture and elemental, electricity, and heat closure, then constrains the same unit with a short heat supply. It does not infer an operating setpoint from a downstream H2 or CO2 target.

### Stage 4: once-through fuel synthesis

The Sabatier unit adds methane to the component catalog and applies
`CO2 + 4 H2 -> CH4 + 2 H2O`. Activity and capacity are kg CH4/day; CO2,
hydrogen, electricity, and capacity can each constrain it. The integrated
case connects DAC and electrolysis directly and closes carbon, hydrogen,
oxygen, electricity, and DAC heat balances.

Reaction heat recovery, compression detail, conversion losses, and recycle
are deferred rather than hidden inside the first unit.

### Stage 5: recycle

The first recycle tears the Sabatier product-water edge and iterates it back through a water mixer into electrolysis:

```text
guess torn stream
request and allocate
evaluate in dependency order
update torn stream
stop when all component flows converge
```

Recycle edges are explicit, carry an initial material stream, and are the only edges omitted from dependency ordering. Unmarked cycles remain invalid. Convergence failure is a solved result with diagnostics, not a silent last iterate.

Battery and thermal-storage blocks apply conversion loss to a user-set representative-day transfer. State of charge, charging windows, degradation, Newton methods, LP/MILP dispatch, pinch analysis, dynamic inventories, and 8760-hour simulation remain outside this solver.

## Validation and balance report

Graph validation rejects:

- missing required ports
- incompatible stream kinds or phases
- output fan-out without a splitter
- input fan-in without a mixer
- heat below a consumer's minimum temperature limits that unit's activity
- material or energy outputs without explicit sinks
- duplicate node ids and invalid physical parameters

Every solve returns:

```text
streams        solved edge flows
nodes          activity, capacity utilization, limiting inputs
balances       element, charge, electricity, and heat residuals
warnings       fidelity notes and unmet requests
convergence    converged, iterations, largest residual
```

Balance residuals are assertions in tests and visible diagnostics in the UI.

## Economics overlay

Economics runs only after a flowsheet has solved:

- CAPEX from installed node capacity
- fixed O&M from installed capacity
- variable O&M from solved throughput
- source costs from purchased boundary flows
- sink revenue from product boundary flows
- replacement-aware cash flows, NPV, and fractional project IRR

Policy support and debt financing belonged to the retired TEA; they are not part of the Foundry economics fold.

Market demand and price do not alter a physics solve. If they later influence operation, an outer dispatch or optimization layer chooses new setpoints and calls the same solver.

## Incremental acceptance cases

### 1. Standalone SWRO

```text
seawater ──▶ swro ──▶ freshwater ──▶ sink
                └────▶ brine ───────▶ disposal
electricity ─────────▶ swro
```

Initial catalog: seawater source, electricity source, SWRO, freshwater sink, and brine disposal.

Acceptance checks:

- water and every modeled ion close
- freshwater plus brine equals feed by component
- electricity consumption equals achieved activity × SEC
- insufficient feed, electricity, or capacity reports the correct limit
- changing recovery changes product and brine without changing total components

### 2. Add electrolysis

```text
seawater ──▶ swro ──▶ water ──▶ electrolyzer ──▶ H2 ──▶ offtake
electricity ──▶ priority bus ──▶ {swro, electrolyzer}
electrolyzer ──▶ O2 ──▶ offtake or vent
electrolyzer ──▶ unreacted water ──▶ sink
```

Add multi-input limiting, the electrical priority junction, and elemental balance through electrolysis. Unreacted inlet water leaves through an explicit reject-water port when power or capacity throttles electrolysis. The acceptance case supplies matching H2 and SWRO operating setpoints explicitly; both installed capacities remain fixed.

### 3. Add DAC

Add an air source, DAC converter, CO2 stream, and its electricity and heat requirements. Validate composition, capture fraction, and explicit rejected air. The current case uses `air`, `electricity`, and `heat` sources, a `dac` node, and `captured-co2` plus `depleted-air` sinks.

### 4. Add fuel synthesis and recycle

Add Sabatier first, then other fuel routes. This introduces multi-reactant stoichiometry, rejected heat, and the first torn recycle:

```text
sabatier.water ──▶ electrolyzer.water
```

If the recycle edge is absent, makeup water must be connected or electrolysis throttles. There is no hidden water credit.

### 5. Bind economics and UI

Implemented: the graphical editor is the primary product. A generic post-solve fold prices source flows, converter capacity and throughput, and sink dispositions, then reports delivered cost, cash flow, NPV, and IRR. Baseline capture compares those outputs and attributes simple synergy value to avoided purchases, avoided disposal, and added product revenue.

## Extended abundance catalog

The shared unit contract now covers ASU nitrogen/oxygen separation, Haber–Bosch ammonia, brine fractionation into lithium chloride, sodium bromide, magnesium chloride, potash, gypsum and salt, chlor-alkali co-products, bromine recovery, aluminium smelting, hydrogen direct-reduced iron, and titanium Kroll reduction. These remain screening models: explicit stoichiometry, recoveries, power, capacity, balances, and economics are modeled; detailed pretreatment, kinetics, pressure/temperature trains, purity specifications, and logistics are not.

## Initial layout

Historical Stage 4 layout (see the README for the current code map):

```text
engine/
  model.js       # substances, stream helpers, graph validation
  solve.js       # operating solve only
  units.js       # initial catalog and physics
  footprint.js   # location-aware solar land and process pads
  size.js        # outer methane sizing loop (capacities + solarKWp)
  uncertainty.js # quality tags and screening-precision formatters
cases/
  dac.js         # Stage 3 DAC acceptance fixture
  sabatier.js    # Integrated air + water to methane fixture
  coastal.js     # Sited Almería methane example with PVGIS solar budgets
scripts/
  flowsheet-demo.js # Integrated CLI report
tests/
  flowsheet.test.js
  electrolysis-flowsheet.test.js
  dac-flowsheet.test.js
  sabatier-flowsheet.test.js
```

Cases can remain JavaScript fixtures until serialization or a shareable URL requires JSON.

## Automatic plant sizing

Installed capacity remains an input to `solveOperation`. `engine/size.js` is the outer design loop that chooses those capacities from a product target:

```text
CH4 kg/day
  -> stoich H2, CO2, electrolysis water, desal feed
  -> electricity and heat duties
  -> solarKWp = electricity / dailyPVKWhPerKWp
  -> source budgets (air, seawater, heat, consumables, PV kWh)
  -> solveOperation
  -> recycle water and actual converter duties
  -> repeat until residual < tolerance or maxIterations
```

`sizeToTarget(caseOrBuilder, targetKgCH4PerDay, { caps, maxIterations, tolerance })` clones the case, never mutates the caller, and returns `{ definition, solved, iterations, residual, consistency, converged, history }`. Each history step records physical duties (`ch4`, `h2`, `co2`, `swro`, `electricityKWh`, `solarKWp`, `landHa`, …). Prices, CAPEX, OPEX, NPV, and IRR are not convergence signals; land hectares are a physical consequence from `engine/footprint.js`. Optional `caps` (`sabatier`, `electrolyzer`, `dac`, `swro`, `solarKWp`) clamp the design and set `operation.boundaryLimitedBy` to `sizing cap` when they bind.

`sizeCoastalToMethane(target, month, opts)` runs that loop on `createCoastalCase(month)`. The one-shot coastal fixture keeps `solarKWp = 37.5` and still clamps methane from the electricity budget. The Foundry site panel **Size to target** control calls the outer loop and shows iteration count and residual.

The sizing residual is the max of demand miss (`|achieved CH4 − target| / max(1, target)`) and consistency (setpoint vs solved H2 / DAC / SWRO / electricity). The loop stops when the plant is internally consistent, even if a cap prevented the requested demand.

This loop sizes a representative day. `solveHorizon` still dispatches that day hourly, so night hours produce nothing unless a battery is assumed.

## Non-goals for the first release

- economic optimization of the sized plant
- full thermodynamic properties or phase equilibrium
- heat-exchanger-network synthesis
- full 8760-hour year simulation (the current horizon is a 24-hour typical day per selected month, with optional same-day battery carry)

## Decisions

1. Same repository; Molecular Foundry is the root page and the TEA code has been removed.
2. Representative-day steady state first.
3. Component-vector material streams, explicit electricity, and temperature-graded heat.
4. Fixed installed capacities during an operating solve.
5. Acyclic evaluation first, allocation second, recycle iteration only with synthesis.
6. Environment, purchases, products, vents, disposal, and reinjection are explicit boundary nodes.
7. Economics is a fold over the solved graph, with optimization deferred.
8. JavaScript catalog and Node's built-in test runner; no new dependency for v1.
9. The node editor saves versioned JSON factory snapshots in local storage.
10. Baseline comparison retains a copy of evaluated economics; it does not duplicate or re-solve the captured graph.
