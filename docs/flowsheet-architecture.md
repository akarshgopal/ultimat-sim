# Flowsheet engine

Status: design only. This branch exists so we can iterate the spec before any engine code.

`main` stays the live TEA (https://akarshgopal.github.io/ultimat-sim/). This document is the **process engine**: mass and energy on a typed graph. The existing TEA (DCF, policy, prices) is a consumer of solved streams, not the thing being replaced first. Site/solar chrome stays. Dollar assignment is a layer on top of the solved graph, not a rewrite of that chrome and not the first object to replace.

## Why this exists

The current sim is one Terraform-shaped plant with bolt-ons. Core chain (electrolyzer, DAC, Sabatier, methanol) is hardcoded. Everything else is an exploratory card competing for leftover kWh. Dependencies are module names, not streams. Water only became real because it was special-cased inside the economics pass.

That shape cannot honestly combine process chains. A new unit today needs a catalog row *and* a bespoke hook. Recycles (Sabatier water, heat to MED, brine to mining) leak because they are not edges.

The replacement object is a **flowsheet**: unit operations with typed ports, edges that *are* the mass and energy flows, a boring physics solver. Economics is not in the graph. It is a fold over a graph that has already closed.

## Principles

1. Mass and energy close before money exists. Prices, CAPEX, OPEX, market caps, incentives, and IRR never enter `evaluate` or the solver. A case with all prices at zero must still produce a valid flowsheet.
2. If it is not an edge, it does not flow.
3. Units never reach into each other. They only see ports and params.
4. Scarcity is a stream (kWh, water, heat at T, Li), not a special case.
5. Fidelity is per-unit and declared. A crude crystallizer is allowed; a silent fake is not.
6. The solver is dumb. Physics lives in units. Swap the solver later without rewriting the catalog.
7. Time resolution is a solver input, not a unit assumption. v1 is a representative day.

## Keep / drop

Keep:

- Site, solar geometry, battery-as-day-buffer, DCF, policy fold, shareable URL, Leaflet, Chart.js
- Catalog *data* (routes, SEC, capex correlations, missing-fidelity notes)
- Attribution (Ben Schrauwen / terraform-simulator MIT; not affiliated with Terraform Industries)

Drop:

- Core vs exploratory split
- Leftover-kWh allocation
- Hardcoded electrolyzer → DAC → Sabatier chain
- Water loop as a private function inside economics
- `diagramInputs: { brine: true }` flags pretending to be ports

## Object model

```
Case
  site          # lat/lon/yield, same as today
  graph         # nodes + edges
  buses         # electrical + heat policies
  economics     # optional; prices, policy, debt. Unused by the solver.
  time          # representative day + cycles/year

Node
  id            # instance id, unique in the case ("ro-1")
  unit          # catalog id ("swro")
  params        # physical only: eta, recovery, T, stoich
  sizing        # demand | resource | fixed

Edge
  from          # { node, port }
  to            # { node, port }
  streamType    # must match both ports
  disposition   # only for dangling outputs: offtake | vent | reinject | waste

Unit (catalog, physics)
  ports in/out  # name, streamType, required?, minQuality
  evaluate(...) # pure physics function, see below
  missing       # honesty notes

Cost overlay (catalog, not physics)
  capex(size)   # declared correlation; called only by the economics layer
  opex(throughput)
  # CAPEX overrides live here (or on the case economics block), never on node.params
```

Environment is not magic. Seawater, air, solar, geothermal brine, makeup-water purchase, product offtake, vent, and reinject are units (sources/sinks) you must connect. They are mass and energy objects, not dollar objects. A `purchase-lime` unit supplies kg of reagent; the price sticker is overlay.

## Streams

A stream is `{ type, amount, quality }`. Amount is always SI-ish per representative day, then annualized by `cyclesPerYear`.

| type | amount | quality |
| --- | --- | --- |
| `electrical` | kWh | none in v1 |
| `heat` | kWh | `T` °C (source must be ≥ sink T) |
| `aqueous` | m³ | ion vector `{Na, Cl, Mg, Ca, K, SO4, Br, Li, B, TDS}`, `T` |
| `gas` | kg | species, purity |
| `solid` | kg | species, purity |

Money is not a stream. Purchases and offtakes remain in the physics catalog as mass sources and sinks. The economics layer reads their throughputs and prices *after* the graph has converged. The solver never sees a price.

v1 ion vector is the same eight-ion set already in the water loop. Unknown ions are not invented. Heat uses continuous T, not the current LT/MT/HT lump. Bands can be a UI grouping.

## Unit interface

```js
evaluate({ inputs, params, sizeHint, dt }) -> {
  outputs,          // map port -> stream
  utilities,        // leftover electrical/heat not modeled as ports (discouraged)
  throttle,         // 0..1, 1 = full
  unmet,            // named required inputs that were short
  size,             // actual capacity used (m³/d, kW, t/y, …)
  duty,             // physical: electrical kWh, heat in/out (optional but useful)
  notes,            // fidelity flags for the UI
}
```

Rules:

- `evaluate` is pure. No DOM, no global state, no peeking at sibling nodes.
- `evaluate` returns physics only. No `capex`, no `opex`, no prices. A catalog row may still *declare* capex/opex correlations; those functions are called only by the economics layer after the graph has converged.
- If a required input is short, the unit throttles itself and reports `unmet`. It does not raid the electrical bus.
- Sizing modes:
  - `fixed`: capacity is pinned
  - `demand`: capacity follows downstream required pull (SWRO sized to electrolyzer water)
  - `resource`: capacity follows available driving stream (old leftover-kWh behavior, opt-in per node)
- Utilities on the return value are a smell. Electricity and heat should be ports so the buses can see them. `duty` is a convenience rollup of those physical flows, not a dollar field.

### Catalog seed (v1, not a product list)

Enough to reproduce today's three honest cases, plus one recycle:

- sources: `pv`, `seawater`, `air`, `geothermal-brine`, `makeup-water`, named reagent purchases (`purchase-lime`, HCl, NaOH, soda ash) as mass sources
- buffers: `battery`
- converters: `electrolyzer`, `dac`, `sabatier`, `swro`, `med`, `ed`, `salt-suite`, `geothermal-li`
- sinks: `offtake`, `vent`, `reinject`, `brine-disposal`
- buses: `electrical-bus`, `heat-bus`

Offtake, vent, reinject, and purchase units stay in this physics catalog. They are kg (or m³, or kWh) sources and sinks. They are not dollar objects.

Ammonia, steel, lime, etc. stay *out* of v1 as *product* cards. They re-enter as catalog rows once the graph is real. No more zombie exploratory cards. Lime-as-reagent is a mass edge; lime-as-product-card is not v1.

## Buses

Scarce shared resources are nodes, not a hidden allocator.

**Electrical bus.** Inputs from PV, battery, optional grid. Outputs to consumers. Policy on the node (v1):

- `user-share`: explicit fractions, must sum ≤ 1
- `priority`: ordered list, each takes what it needs until the bus is empty
- `proportional`: split by instantaneous demand

Default for v1: `priority`. Water-related electrical demand (SWRO/MED pumps) sits above the electrolyzer so "size desal for H₂" is a graph + policy, not a special case.

**Heat bus.** Same, with a T match: an edge is illegal if source T < sink T. Unmatched heat dumps to a `reject-heat` sink (atmosphere / cooling). MED is just a consumer of `heat` at T ≥ ~70 °C.

No leftover-kWh. If the electrolyzer is on the bus after desal, it sees what remains.

## Solver (v1)

Sequential modular with torn recycles, nested inside an electrical/heat allocation loop.

```
guess torn recycle streams (0 or previous day)
loop up to N (8):
  allocate electrical bus per policy
  allocate heat bus per T + policy
  topo-eval all other nodes (demand-driven sizes may grow)
  update torn streams
  if max relative change < ε: break
unmet required inputs → throttle that node and re-eval downstream once
```

This is the 3-pass water loop, generalized. Recycles (Sabatier water → electrolyzer) are torn edges, not `calculateWaterSystems` calling `constrainElectrolyzerToWater`.

The solver sees streams, throttle, unmet, size, and duty. It does not see prices, CAPEX, OPEX, market caps, incentives, or IRR.

Not v1: equation-oriented Newton, LP/MILP, pinch, 8760 hourly. The unit interface stays solver-agnostic so those can replace the loop later.

Convergence failure is a result, shown in the UI, not a silent last iterate.

## Economics layer (after the graph has converged)

This layer runs only after the physics solver has a closed flowsheet. It does not participate in `evaluate`, bus allocation, or recycle tearing.

- node CAPEX(size) + node OPEX(throughput), from catalog correlations or overlay overrides
- purchase units: reagent cost = purchase-unit kg × price, after the fact. The solver does not see it.
- offtake nodes: product revenue. Market caps affect revenue, never throughput. A salt cap does not throttle the salt-suite.
- policy attaches to *unit kinds* (solar, electrolyzer) the way it does today
- DCF / IRR / debt unchanged in spirit

Mining reagent/disposal remain mass edges to `purchase-reagent` and `brine-disposal`. Dollars are assigned on those throughputs after the fact, not a footnote and not a solver input.

## Time

v1: one representative day, then `cyclesPerYear` (and PV degradation across years, already in the TEA). Battery still shifts energy inside that day.

Unit `evaluate` takes `dt` so later we can pass 24 hourly slices or 8760 without rewriting stoich.

## UI (after the engine, not before)

Phase 0 (this branch, now): this spec only.

Phase 1: case JSON in, auto-drawn block-flow out, stream table (amounts, T, ion vector, unmet, throttle). Existing site/solar panels can bind. The diagram *is* the model. No IRR or header-metrics requirement for v1 clickable.

Phase 1b: economics panels bound to the solved graph (prices × throughputs, DCF).

Phase 2: click a port to connect. Still not Aspen.

Do not start with a node editor. Do not port the 2000px slider form onto a new engine.

Shareable URL hashes the case (graph + site + prices), same trick as today. Prices in the hash do not imply prices in the solver.

## Proposed layout (do not create until we implement)

```
docs/flowsheet-architecture.md    # this file
engine/
  streams.js
  graph.js
  solver.js                       # physics only; never imports economics
economics.js                      # sibling overlay; fold over a solved graph
catalog/units/*.json
cases/
  mojave-swro.json
  coastal-med.json
  salton-li.json
ui/                               # binds later; may reuse site/solar/charts
```

Tests live next to the engine. First assertions are conservation (mass by species / ions, electrical + heat accounting) and throttle / recycle / T-mismatch. Dollar tests come later and take a solved graph as input; they do not live inside solver tests.

Implementation, when we start, is Codex Luna (`gpt-5.6-luna`, xhigh) on this branch. No Contents API. `npm run deploy` only when we explicitly want a preview; `main` / live Pages stay on the current TEA until we say otherwise.

## v1 cases (the spec's acceptance tests)

### Mojave SWRO

```
seawater ──▶ swro ──▶ water ──▶ electrolyzer ──▶ h2 ──▶ offtake
               │                    ▲   │
               │                    │   └── heat ──▶ reject-heat
               └── brine ──▶ salt-suite ──▶ solids ──▶ offtake
                                │
                                └── spent ──▶ brine-disposal
pv ──▶ electrical-bus ──▶ {swro, salt-suite, electrolyzer}
makeup-water optional, off by default
electrolyzer sizing: resource (bus residual)
swro sizing: demand (electrolyzer water × oversize)
```

### Coastal waste-heat MED

```
seawater ──▶ med ──▶ water ──▶ electrolyzer
               ▲
electrolyzer heat ──▶ heat-bus ──▶ med     (T match)
pv ──▶ electrical-bus ──▶ {electrolyzer, med pumps}
med throttles if heat is short; no fake 14 kWh/m³ electrical MED
```

### Salton geothermal Li

```
geothermal-brine ──▶ geothermal-li ──▶ Li2CO3 ──▶ offtake
                         │
                         └── spent ──▶ reinject     (required)
pv ──▶ electrical-bus ──▶ geothermal-li
no seawater Li; Li gated by feed ion vector, not a yield constant
```

### Recycle check (must work on day one)

Sabatier water is an edge `sabatier.water → electrolyzer.water`. Torn recycle. If that edge is missing, the electrolyzer buys makeup or throttles. No hidden credit.

## Non-goals (v1)

- Pinch / HEN synthesis
- ZLD
- Seawater lithium
- 8760 and weather
- Drag-and-drop editor
- Porting ammonia/steel/lime cards
- Replacing Leaflet, Chart.js, or the policy panel
- Git ties to benschrauwen/terraform-simulator

## Decisions I am making unless you push back

1. **Same repo, branch `flowsheet`.** New engine, old TEA remains on `main` until we cut over.
2. **Sequential modular + torn recycles**, not an LP. Allocation lives on bus nodes.
3. **Representative day**, not 8760.
4. **JSON cases + auto diagram** before any editor.
5. **Typed streams with ion vectors and heat T in v1.** That is the whole point of the water work.
6. **Environment is units.** Makeup, offtake, reinject are mass edges you can see. They are not dollar objects.
7. **Small catalog.** Three cases + Sabatier recycle, then more units.
8. **Electrical bus default is priority.** RO/MED pumps above the electrolyzer. User shares are an override.
9. **Named reagents in v1.** Lime, HCl, NaOH, soda ash as purchase units with stoich, plus required disposal/reinject edges. No lump reagents $/m³ slider. These are mass edges; prices attach after the fact.
10. **Pages stays on `main` until the engine is clickable.** No `/flowsheet/` preview until there is a diagram to poke.
11. **Physics first.** Mass and energy flow sim; dollars are an overlay. Named reagents remain mass edges. A zero-price case is still a valid flowsheet.
