# Molecular Foundry

**What would a company look like that makes the world's materials from sunlight, seawater, air and rock?**

Molecular Foundry simulates that company. Its first prerogative is **material abundance through feasible economics**: it builds solar-powered plants year by year, choosing what to make, where and how big, so as to make as much material as possible while every plant pays back its capital. It reports what share of world material tonnage can be made below today's prices, what blocks the rest, and which equipment to design to unblock it.

It is a screening tool for exploring the Terraform Industries thesis — very cheap local solar, low-capex intermittent hardware, colocated conversion — across materials, not a bankable forecast.

Live: https://akarshgopal.github.io/ultimat-sim/

## The app

One page (`index.html`), eight views. The scenario lives in the URL, so a link reproduces both the screen and the assumptions.

| View | Question |
|---|---|
| **Abundance** | The landing view. Of ~11 Gt/yr of tracked world material demand, how much can be made below today's price — today, in the current scenario, and at the frontier (10× cheaper solar, every cost at 1.5× its raw materials, every design at its lean preset)? For each blocked material, its largest cost item per kg: a unit to design, a feed to make cheaper, or energy. |
| **Company** | What does the company build over the years, how much of world supply is that, and does it stay self-funding? |
| **Energy** | In kWh and $/kWh: the electricity price below which each recipe becomes feasible, the world demand each price unlocks, and where each kg's cost goes. |
| **Designs** | Parametric equipment designs (`engine/designs/`): knobs → bill of materials → installed $ per kg/day, kWh/kg, idiot index → the unit's factors in the simulation. |
| **Pathways** | Each recipe: cost vs price over time, best sites, make-vs-buy, and its plant flowsheet per kg of product. |
| **Plant** | One recipe at one site, size and cost year (later years use the company run's cost factors), designed in detail: a P&ID (tagged equipment, numbered streams, control loops, PV, battery, heat store and buffers from the solar design), equipment list, stream table, instrument index, and its TEA: capex by item, operating account, cost per kg by driver, cash flow with NPV/IRR/payback, a ±25% sensitivity and the same plant at every buildable size. |
| **Sites** | 51 sites (38 coasts, 13 inland brine hubs): solar, land price, seawater or brine, which recipes they host, what the run builds there. |
| **Markets** | 33 world markets: demand, price, sources, the company's share and the price relief it delivers. |

The simulation runs in a Web Worker. The browser loads the company engine (`engine/company.js`, `engine/utilization.js`), the design modules and four data files; plant models and the flowsheet solver run in Node when the data is regenerated:

```
cases/*.js ──solve + size + economics──▶ scripts/build-pathways.mjs ──▶ data/pathways.js ┐
data/markets.js, data/bom.js (cited) ──────────────────────────────────────────────────────┼─▶ engine/company.js ─▶ app / CLI
data/site-presets.js + PVGIS + engine/land.js ──▶ scripts/build-sites.mjs ──▶ data/sites.js ┘
```

## Results (screening)

| | Share of world tonnage feasible | Abundant (≤ ½ today's price) |
|---|---|---|
| Today | 39% | 2.5% |
| Frontier | 70% | 68% |

- **Energy alone unlocks little.** 10× cheaper solar by itself lifts the feasible share only from 37% to 38% (cement turns abundant; little else moves): equipment running ~7 sun-hours a day dominates most recipes. Cheap solar plus lean equipment and squeezed margins does.
- **What binds the company is not money: it is land.** The default 25-year run makes ~5.6 Gt today and ~10.5 Gt at the frontier, where it ends with ~$2.6 trillion unspent. Each site may cover a share of the land suitable for utility PV in its catchment (World Bank/ESMAP; default 2%). With 100% market share the frontier company reaches 3.0 Gt/yr by 2051 at 2% land use (filling all 2.3 TW it may build), 6.7 Gt/yr at 10%, 7.4 Gt/yr at 25% (18 TW; there land no longer binds). Coastal sites fill first; inland sites fill when they are within a few hundred km of a port, since they pay overland freight on everything they sell and buy.
- **Bulk gas is the largest prize still out of reach.** Methane sells down a price ladder of buyer tiers (Terraform Industries' estimates): packaged gas $495/MMBtu, off-grid $45, western-US RNG $35, Asian and European LNG $16–19, and bulk pipeline gas at Henry Hub $3 (≈ $0.16/kg), which is 92% of the 3.1 Gt. Frontier e-methane at $0.30/kg (~$6/MMBtu) is abundant in every premium tier (~250 Mt) but costs 1.9× bulk gas: its 30 kWh/kg alone cost $0.17/kg at frontier solar (0.56¢/kWh), before any equipment. Cement (clinker $0.043/kg against $0.16) is the largest abundant market. What else is feasible but not abundant is steel (bought iron ore is $0.21 of its $0.25/kg) and copper (bought leach solution); polysilicon and aluminium lose abundance once their steady units are firmed against cloudy weather.
- **The oldest solar chemistry is already abundant.** Solar sea salt from evaporation ponds (Pilbara, Mardie-scale capex) costs ~$19/t today against a $60/t price. Oxygen by air separation (0.25 kWh/kg) is near-feasible today and nearly free at the frontier, and membrane chlor-alkali makes caustic soda once its chlorine and hydrogen are sold; those markets were previously only coproducts of the brine hubs.
- **Coproducts cannot carry a whole world market.** The scoreboard asks whether *all* of a material's demand can be made below today's price, so a plant's coproduct credit only counts up to what each coproduct's own world market can absorb. That keeps salt and lithium from brine hubs, and NdPr oxide from chromatography, blocked: at world scale their coproducts would far exceed those markets (NdPr alone would bring ~135 kt/yr of Dy/Tb oxides to a 4 kt/yr market). Hydrogen stays abundant, but at $0.31/kg rather than $0.07, because only 300 Mt/yr of its 790 Mt/yr of oxygen can be sold.

## How the company simulator works

Each simulated year:

1. **Plants come online** after a construction lead time.
2. **Plants operate.** Revenue uses that year's realized price, which falls as the company's share of the market grows (`price = p0 × (1 − elasticity × share)`). Opex is fixed O&M on capex plus purchased feeds.
3. **Debt is serviced** and cash is banked.
4. **The company builds.** Among plants that pay back their capital (NPV ≥ 0) and that it can afford, it values each by its lifetime material — own tonnes plus the tonnes its surplus funds (`own kg + λ × NPV`) — per share of this year's scarce resources (equity, construction capacity, remaining site solar). Only material that serves a world market counts. A `profit` objective is kept for comparison. Building stops at money, construction capacity ($250M in year one, growing up to 50% a year over actual capex), the market-share ceiling (coproducts included) or the site's solar ceiling (its suitable land × the land-use share).

**Energy in $/kWh.** Solar electricity is an input in $/kWh (quoted at 2,000 kWh/kWp·yr; each site's price scales with its sun), converted to PV capex at a fixed O&M/capex ratio. Today ≈ 4.5¢/kWh (IRENA 2023 utility PV, $758/kW). Every plant reports its cost per kg split into energy (PV + storage + land), equipment, feedstock and other, and the effective $/kWh it pays. `energyBreakevens` solves each recipe's break-even electricity price.

**Idiot index.** `data/bom.js` prices a bill of materials for every cost class at 2024–25 commodity prices: PV 5.4× its materials, LFP battery 13×, electrolyzer 31×, SWRO 36×, DAC 21×, process plant 22×. The target idiot index caps every class at materials × target each year. The Terraform loop re-prices those floors as the company's own output lowers commodity prices; it moves little, because one producer's price effect is elasticity × share.

**Running on sunlight alone** (`engine/utilization.js`). Each plant is designed per site from its flowsheet and 12 monthly typical solar days. Flexible units (electrolyzers, SWRO, DAC, pumps) are oversized for the sun hours; steady units (kilns, furnaces, synthesis loops) are firmed by batteries, or heat stores for heat-dominated units, down to a minimum turndown; an intermediate passed from a flexible to a steady unit is buffered overnight. The cheaper of "sun-following" and "everything firmed" wins.

**Make vs buy.** A plant that buys H₂, NH₃, CO₂, methanol or glass can build a same-site supplier (another recipe making that intermediate) when its cost beats the purchase price plus freight. With "infinite sources only", in-house supply is forced and plants that still buy an intermediate are not built.

**Costs fall** by exogenous decline per technology class, Wright's-law learning on the company's own deployment, and plant scale (`size^0.85`, floored at 0.4×; PV and land stay linear).

Every tunable lives in `FoundryCompany.DEFAULTS` (`engine/company.js`). The defaults are screening guesses; change them and look at what moves.

## Unit designs

`engine/designs/` holds parametric designs of the equipment that gates abundance: electrolyzer, Haber-Bosch loop, urea unit, H₂-DRI shaft, iron-ore pellet plant, direct air capture, methanol/Sabatier/MTO reactors and a modulating aluminium smelter. A design re-prices its own flowsheet unit in every recipe that contains it — capex, energy, raw-materials floor, operating mode, turndown, feeds and O&M — through `config.designs.units` ([contract](engine/designs/README.md)). Each has a design doc and build plan in [`docs/designs/`](docs/designs/).

## Plant design layer

`engine/plant-design.js` turns any recipe at any site and size into a design package (`FoundryPlantDesign.forPlant(Company, input, pathwayId, siteId, kgPerDay)`). It re-presents what the simulator already computed rather than adding a second cost model: each unit's installed capex is the simulator's own, storage and PV come from the site's utilization design, and every capex, opex and revenue line sums to `evaluatePlant`'s totals (a test checks all 28 recipes). Sun-following units are sized at their nameplate factor; a buffer between a sun-following and a steady unit splits the line into a fast upstream and a steady downstream stream. Instrumentation is a typical scheme per unit type (ISA 5.1 letters), indicative rather than engineered. Every stream carries the temperature, pressure and phase it leaves its unit with: each plant-model unit sets its outlet conditions after its own cooler, separator or condenser (`OUTLET_CONDITIONS` in `engine/units.js`: electrolyzer H₂ at 40 °C and 30 bar, ASU nitrogen at 20 °C and 5 bar, ammonia condensed to −33 °C, kiln gas at 350 °C, …), and what a unit draws from a port stays at that port's conditions. Feeds enter at their battery-limit conditions (`engine/feed-conditions.js`): site feeds at the site's real climate (`data/site-climate.js`, from `npm run climate`: ERA5 2014–2023 mean air temperature and elevation from PVGIS, so air and solids sit at the site's barometric pressure, 1.06 bar at the Dead Sea and 0.63 bar at a 3,700 m salar; seawater at the NOAA OISST 1991–2020 mean of the nearest ocean cell within 50 km; utility water at 3 bar), bought fluids at standard delivery conditions (ammonia refrigerated at −33 °C, CO₂ vaporized at 15 bar, pipeline H₂ at 30 bar). A recipe redesigned at another site takes that site's feed conditions, and outlets that pass their feed temperature through (pumps, blowers, RO) follow. Seasonal design uses the monthly temperatures (hottest and coldest monthly means, not 0.4 % design extremes): gas lines and air machines are sized for the hottest month; every cooler and condenser is checked against the hottest month's cooling medium (once-through seawater with a 10 K approach where the site has sea, else air coolers with 15 K), so a 40 °C product condenser needs chilled-water trim in a Gulf summer but not on the Benguela coast; RO membrane area is set by the coldest feed (FilmTec temperature correction against the recipes' 25 °C rating: +20% at Ras Laffan, +51% in the cold Benguela at Walvis Bay); and where the coldest month is ≤ 2 °C, water-bearing lines are heat traced (ET on the drawing). The Plant view shows these in a Seasonal design card with the site's monthly air and sea temperatures. These fixes are priced into every plant the simulator evaluates (`config.seasonal`, screening prices): chillers for the summer trim at $300/kW of refrigeration and a COP of 4, the RO margin on the membranes-and-vessels share (15%) of the RO train, and heat tracing at $150/m over an assumed 50 m per line (pipe lengths are not modelled) and 30 W/m in months with mean air ≤ 5 °C; capex takes the process class's cost factor and the electricity is priced at the plant's own levelized $/kWh. They are small: +0.002% on methanol's net cost at Ras Laffan, +0.009% on FT diesel at Great Salt Lake, at most 0.017% on any product's scoreboard cost, and no change to the feasible or abundant shares. The compressors' hottest-month volume is a sizing basis inside each package's price, not an added item. The units' specific energies are plant-level and already include their internal heating, cooling and compression, so these conditions change no mass, energy or cost (the recipes and the scoreboard are identical with and without them); they drive the design layer. Each unit also shows its type's typical operating range from the process literature (Haber-Bosch 400–500 °C at 150–250 bar, SWRO 55–70 bar feed). Where a line reaches a unit below its operating pressure the drawing adds a compressor or pump (the electrolyzer's 30 bar H₂ boosted to 150 bar for the ammonia loop, or to 50 bar for methanol; seawater pumped to 55 bar for RO); where its temperature is far from the unit's, a feed preheater or cooler (the ASU's cold-box main exchanger); where a unit's fluid product leaves far below its operating temperature, a product cooler or condenser (or, for a kiln or furnace, off-gas heat recovery). These are tagged to the unit whose package carries their cost and energy (K-104A, E-104C), drawn inside its package boundary in process order, listed, and not costed twice. Co-products and wastes leave by an off-page connector next to the unit that makes them; hovering a table row lights its item on the drawing, and clicking the drawing brings up its row. Each unit's installed cost is the simulator's own (`evaluatePlant().unitCapexUsd`): designed units on their materials floor and scale law, recipe units sharing the rest of their class, sun-following units at the solar design's nameplate factor; the same per-unit prices set the sun-following/steady split of the solar design. Lines carry an indicative size (design flow, density at the line's temperature and pressure, ~2 m/s liquid and ~15 m/s gas, rounded up to a standard pipe size; near-ambient air too big for a 3 m duct is an open air path), so line numbers read `36"-HY-005`; batteries and heat stores carry a power rating (the steady load they carry overnight) and duration; a unit and the compressors, pumps and exchangers in its package sit inside a dash-dot package boundary. A later cost year re-evaluates the plant with that year's cost factors from the company run (`forPlant(…, yearIndex, timelineOpts)`), the same numbers as the Pathways cost curve. The P&ID downloads as SVG and each table as CSV.

## The data

- **Pathways** (`data/pathways.js`, 31 recipes): generated from `cases/*.js` by `npm run pathways`; a test fails if the file is stale. Each recipe gives electricity and heat per kg, feeds by origin (`ocean`, `brine`, `air`, `crust`, `water`, `consumable`, or a bought `intermediate`), coproducts, capex per kg/day by technology class, and the solved flowsheet.
- **Markets** (`data/markets.js`, 32 products): world demand, growth, reference price and a screening elasticity, tagged `cited` (mostly USGS, IEA) or `screening`.
- **Sites** (`data/sites.js`, generated by `npm run sites` from `data/site-presets.js`): 51 coasts and brine hubs with frozen PVGIS solar, seawater and brine assays, land prices where a source exists, the land suitable for utility PV in each site's 200 km catchment (`data/land-pv.js`, World Bank/ESMAP Level 1 land by country; neighbouring catchments split their overlap, coastal ones are half sea) and, inland, the road distance to a port.
- **Prices and capex packs** (`data/tea-screening.js`) and **bills of materials** (`data/bom.js`), cited where possible.

## Quickstart

Requires Node.js 18+. No dependencies.

```bash
npm run dev
```

Serves the app locally.

```bash
npm run company
```

Runs the default 25-year simulation in the terminal (`-- --rank` for the year-0 ranking; `-- --config scenario.json` for any `DEFAULTS` override).

```bash
npm test
```

Runs every check: engine, designs, data staleness, and Playwright tests of each view.

## Adding a material

1. Build the plant model in `cases/` (see `cases/_shared.js` and a recent case such as `cases/aluminium.js`), binding prices and capex through `data/tea-screening.js`.
2. `npm run pathways` to regenerate `data/pathways.js`. Cases with units fixed at bench size are sized first (`SIZE_TO` in `scripts/build-pathways.mjs`).
3. If the product is new, add its world market to `data/markets.js` with a source.

## Known limits

- **Screening economics.** Constant real prices over a plant's life, no tax or inflation, simple annuity debt. Elasticities, learning rates and many capex packs are screening assumptions.
- **Designed on typical days.** Plants are sized on 12 typical days per site. A stress test replays them through ten real years of hourly weather ([`docs/weather-stress.md`](docs/weather-stress.md), `npm run weather`): the frontier holds (91% feasible and 89% abundant even with steady units firmed against cloudy runs), while today's feasibility relies on kilns tolerating a few trips a month. Grid backup and inter-site sharing are not modelled.
- **Design factors are exact only at their reference plant size.** Several designs fall in cost with size faster than the engine's single scale law.
- **Make-vs-buy is one level deep and per plant.** TiCl₄, Mg, PLS and REE concentrates have no supplier recipe.
- **Captive markets.** Much ammonia, H₂, O₂ and DRI is captive; the share ceiling is the only guard.
- **Multi-product plants.** A single plant's cost per kg is net of coproduct revenue, so it can be negative for brine hubs. The Abundance scoreboard credits coproducts only up to their world markets; the company simulation caps every product it sells, coproducts included, at the market-share ceiling.

## Repository map

- `index.html`, `app.css`, `css/`: the app and its styles (one stylesheet per view).
- `js/app.js` (router), `js/store.js` (scenario ↔ engine config, worker client), `js/sim-worker.js`, `js/ui/` (kit, charts), `js/views/` (one file per view).
- `engine/company.js`: the company simulator and abundance scoreboard; `engine/utilization.js`: solar-only plant design; `engine/plant-design.js`: P&ID package and TEA for one plant; `engine/designs/`: equipment designs. The plant solver (`model`, `units`, `solve`, `heat`), economics, sizing (`size.js`), footprint and land prices (`land.js`) run in Node for the generators.
- `cases/`: plant models, shared builders (`_shared.js`) and sited brine hubs (`brine-hubs.js`).
- `data/`: generated `pathways.js` and `sites.js`; cited markets, TEA prices, bills of materials, site presets, assays, PVGIS, land prices.
- `scripts/`: dev server, build (ships only what the browser loads), deploy, generators, company CLI.
- `tests/`: `node --test` suites.

## License

MIT. See `LICENSE` and `NOTICE`.

Derived from [Ben Schrauwen](https://github.com/benschrauwen)'s unofficial MIT-licensed [`terraform-simulator`](https://github.com/benschrauwen/terraform-simulator) ([terraform-simulator.com](https://terraform-simulator.com/)), copyright (c) 2026 benschrauwen. This repository was created new rather than with GitHub's fork button, so GitHub will not show "forked from." Modifications (water-systems loop: desalination, brine mining, heat reuse, materials recovery; company simulator) are copyright Akarsh Gopal (2026). An independent educational tool, not affiliated with Terraform Industries. Third-party names, trademarks, external datasets and linked sources remain under their own terms.
