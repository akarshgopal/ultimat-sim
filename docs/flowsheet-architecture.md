# Flowsheet engine

Status: design only. This branch exists so we can iterate the spec before any engine code.

`main` stays the live TEA (https://akarshgopal.github.io/ultimat-sim/). This document is the replacement for the middle of that app, not a rewrite of site/solar/DCF chrome.

## Why this exists

The current sim is one Terraform-shaped plant with bolt-ons. Core chain (electrolyzer, DAC, Sabatier, methanol) is hardcoded. Everything else is an exploratory card competing for leftover kWh. Dependencies are module names, not streams. Water only became real because it was special-cased inside the economics pass.

That shape cannot honestly combine process chains. A new unit today needs a catalog row *and* a bespoke hook. Recycles (Sabatier water, heat to MED, brine to mining) leak because they are not edges.

The replacement object is a **flowsheet**: unit operations with typed ports, edges that *are* the flows, a boring solver, economics as a fold.

## Principles

1. If it is not an edge, it does not flow.
2. Units never reach into each other. They only see ports and params.
3. Scarcity is a stream (kWh, water, heat at T, Li), not a special case.
4. Fidelity is per-unit and declared. A crude crystallizer is allowed; a silent fake is not.
5. The solver is dumb. Physics lives in units. Swap the solver later without rewriting the catalog.
6. Time resolution is a solver input, not a unit assumption. v1 is a representative day.

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
  economics     # prices, policy, debt (fold inputs)
  time          # representative day + cycles/year

Node
  id            # instance id, unique in the case ("ro-1")
  unit          # catalog id ("swro")
  params        # recovery, eta, capex overrides
  sizing        # demand | resource | fixed

Edge
  from          # { node, port }
  to            # { node, port }
  streamType    # must match both ports
  disposition   # only for dangling outputs: offtake | vent | reinject | waste

Unit (catalog)
  ports in/out  # name, streamType, required?, minQuality
  evaluate(...) # pure function, see below
  capex(size)
  opex(throughput)
  missing       # honesty notes
```

Environment is not magic. Seawater, air, solar, geothermal brine, makeup-water purchase, product offtake, vent, and reinject are units (sources/sinks) you must connect.

## Streams

A stream is `{ type, amount, quality }`. Amount is always SI-ish per representative day, then annualized by `cyclesPerYear`.

| type | amount | quality |
| --- | --- | --- |
| `electrical` | kWh | none in v1 |
| `heat` | kWh | `T` °C (source must be ≥ sink T) |
| `aqueous` | m³ | ion vector `{Na, Cl, Mg, Ca, K, SO4, Br, Li, B, TDS}`, `T` |
| `gas` | kg | species, purity |
| `solid` | kg | species, purity |

Money is not a stream. Purchases and offtakes are sink/source units; the economics fold reads their throughputs and prices.

v1 ion vector is the same eight-ion set already in the water loop. Unknown ions are not invented. Heat uses continuous T, not the current LT/MT/HT lump. Bands can be a UI grouping.

## Unit interface

```js
evaluate({ inputs, params, sizeHint, dt }) -> {
  outputs,          // map port -> stream
  utilities,        // leftover electrical/heat not modeled as ports (discouraged)
  throttle,         // 0..1, 1 = full
  unmet,            // named required inputs that were short
  size,             // actual capacity used (m³/d, kW, t/y, …)
  capex,            // $
  opex,             // $/rep-day, excluding stream purchases
  notes,            // fidelity flags for the UI
}
```

Rules:

- `evaluate` is pure. No DOM, no global state, no peeking at sibling nodes.
- If a required input is short, the unit throttles itself and reports `unmet`. It does not raid the electrical bus.
- Sizing modes:
  - `fixed`: capacity is pinned
  - `demand`: capacity follows downstream required pull (SWRO sized to electrolyzer water)
  - `resource`: capacity follows available driving stream (old leftover-kWh behavior, opt-in per node)
- Utilities on the return value are a smell. Electricity and heat should be ports so the buses can see them.

### Catalog seed (v1, not a product list)

Enough to reproduce today's three honest cases, plus one recycle:

- sources: `pv`, `seawater`, `air`, `geothermal-brine`, `makeup-water`
- buffers: `battery`
- converters: `electrolyzer`, `dac`, `sabatier`, `swro`, `med`, `ed`, `salt-suite`, `geothermal-li`
- sinks: `offtake`, `vent`, `reinject`, `brine-disposal`
- buses: `electrical-bus`, `heat-bus`

Ammonia, steel, lime, etc. stay *out* of v1. They re-enter as catalog rows once the graph is real. No more zombie exploratory cards.

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

Not v1: equation-oriented Newton, LP/MILP, pinch, 8760 hourly. The unit interface stays solver-agnostic so those can replace the loop later.

Convergence failure is a result, shown in the UI, not a silent last iterate.

## Economics

Fold over the solved graph:

- node CAPEX(size) + node OPEX(throughput)
- purchase sinks/sources: makeup water, reagents, grid kWh
- offtake nodes: product revenue, with optional market caps (salt)
- policy attaches to *unit kinds* (solar, electrolyzer) the way it does today
- DCF / IRR / debt unchanged in spirit

Mining reagent/disposal OPEX becomes edges to `purchase-reagent` and `brine-disposal`, not a footnote.

## Time

v1: one representative day, then `cyclesPerYear` (and PV degradation across years, already in the TEA). Battery still shifts energy inside that day.

Unit `evaluate` takes `dt` so later we can pass 24 hourly slices or 8760 without rewriting stoich.

## UI (after the engine, not before)

Phase 0 (this branch, now): this spec only.

Phase 1: case JSON in, auto-drawn block-flow out, existing site/solar/econ panels bound to the solved graph. The diagram *is* the model.

Phase 2: click a port to connect. Still not Aspen.

Do not start with a node editor. Do not port the 2000px slider form onto a new engine.

Shareable URL hashes the case (graph + site + prices), same trick as today.

## Proposed layout (do not create until we implement)

```
docs/flowsheet-architecture.md    # this file
engine/
  streams.js
  graph.js
  solver.js
  economics.js
catalog/units/*.json
cases/
  mojave-swro.json
  coastal-med.json
  salton-li.json
ui/                               # binds later; may reuse site/solar/charts
```

Tests live next to the engine and assert *graph* behavior (throttle, recycle, T-mismatch illegal), not slider HTML.

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
6. **Environment is units.** Makeup, offtake, reinject are edges you can see.
7. **Small catalog.** Three cases + Sabatier recycle, then more units.

## Open questions (actual ones)

- Electrical bus default: `priority` (desal before H₂) vs `user-share`? I am on priority with a visible order.
- Do we want a preview Pages URL on this branch (`/flowsheet/`) or keep Pages on `main` only until cutover?
- Reagent library for mining: one generic `purchase` unit with a price, or named reagents (NaOH, acid) in v1?
