# Flowsheet engine

Status: Stage 4 implemented: SWRO, electrolysis, DAC, and once-through methane synthesis.

`main` remains the live TEA. The replacement engine solves material and energy flows first; the existing economics becomes a consumer of the solved flowsheet. Site, solar, DCF, policy, charts, maps, and shareable URLs are reused where they still fit.

## Goal

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
  site          # optional boundary data such as solar yield
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
sizeToTarget(caseDefinition, target) // later outer calculation
optimizeEconomics(caseDefinition)    // later still
```

## Solver growth

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

Add torn-edge fixed-point iteration only when fuel synthesis introduces the first recycle:

```text
guess torn stream
request and allocate
evaluate in dependency order
update torn stream
stop when all component flows converge
```

Convergence failure is a solved result with diagnostics, not a silent last iterate.

Not initially implemented: Newton methods, LP/MILP dispatch, pinch analysis, dynamic inventories, or 8760-hour simulation.

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
- policy by eligible unit kind
- financing, DCF, and IRR using the existing model where possible

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

Render the solved graph and stream table first, then bind existing TEA panels to installed capacities and solved boundary flows. A graphical editor remains optional.

## Deferred catalog

MED, batteries, salt mining, geothermal lithium, reagent networks, ammonia, steel, and lime products wait until the four-step core chain works. They must use the same ports and unit contract when added; they do not justify speculative v1 hooks.

## Initial layout

Stage 4 uses:

```text
engine/
  model.js       # substances, stream helpers, graph validation
  solve.js       # operating solve only
  units.js       # initial catalog and physics
cases/
  dac.js         # Stage 3 DAC acceptance fixture
  sabatier.js    # Integrated air + water to methane fixture
scripts/
  flowsheet-demo.js # Integrated CLI report
tests/
  flowsheet.test.js
  electrolysis-flowsheet.test.js
  dac-flowsheet.test.js
  sabatier-flowsheet.test.js
```

Cases can remain JavaScript fixtures until serialization or a shareable URL requires JSON.

## Non-goals for the first release

- automatic plant sizing or economic optimization
- full thermodynamic properties or phase equilibrium
- heat-exchanger-network synthesis
- storage and hourly dynamics
- drag-and-drop editing
- broad product catalog
- replacing Leaflet, Chart.js, or the existing policy/DCF implementation

## Decisions

1. Same repository and `flowsheet` branch; `main` remains live until an explicit cutover.
2. Representative-day steady state first.
3. Component-vector material streams, explicit electricity, and temperature-graded heat.
4. Fixed installed capacities during an operating solve.
5. Acyclic evaluation first, allocation second, recycle iteration only with synthesis.
6. Environment, purchases, products, vents, disposal, and reinjection are explicit boundary nodes.
7. Economics is a fold over the solved graph, with optimization deferred.
8. JavaScript catalog and Node's built-in test runner; no new dependency for v1.
9. JSON and a node editor wait until persistence or editing is actually needed.
10. Pages remains on `main` until the new engine has a usable diagram and stream table.
