# Molecular Foundry

**What would a company look like that makes the world's materials from sunlight, seawater, air and rock?**

Molecular Foundry simulates that company. Its first prerogative is **material abundance through feasible economics**: it builds solar-powered plants year by year, choosing what to make, where and how big, so as to make as much material as possible while every plant pays back its capital. It reports what share of world material tonnage can be made below today's prices, what blocks the rest, and which equipment to design to unblock it.

It is a screening tool for exploring the Terraform Industries thesis — very cheap local solar, low-capex intermittent hardware, colocated conversion — across materials, not a bankable forecast.

Live: https://akarshgopal.github.io/ultimat-sim/

## The app

One page (`index.html`), seven views. The scenario lives in the URL, so a link reproduces both the screen and the assumptions.

| View | Question |
|---|---|
| **Abundance** | The landing view. Of ~10.9 Gt/yr of tracked world material demand, how much can be made below today's price — today, in the current scenario, and at the frontier (10× cheaper solar, every cost at 1.5× its raw materials, every design at its lean preset)? For each blocked material, its largest cost item per kg: a unit to design, a feed to make cheaper, or energy. |
| **Company** | What does the company build over the years, how much of world supply is that, and does it stay self-funding? |
| **Energy** | In kWh and $/kWh: the electricity price below which each recipe becomes feasible, the world demand each price unlocks, and where each kg's cost goes. |
| **Designs** | Parametric equipment designs (`engine/designs/`): knobs → bill of materials → installed $ per kg/day, kWh/kg, idiot index → the unit's factors in the simulation. |
| **Pathways** | Each recipe: cost vs price over time, best sites, make-vs-buy, and its plant flowsheet per kg of product. |
| **Sites** | 34 sites: solar, land price, seawater or brine, which recipes they host, what the run builds there. |
| **Markets** | 32 world markets: demand, price, sources, the company's share and the price relief it delivers. |

The simulation runs in a Web Worker. The browser loads the company engine (`engine/company.js`, `engine/utilization.js`), the design modules and four data files; plant models and the flowsheet solver run in Node when the data is regenerated:

```
cases/*.js ──solve + size + economics──▶ scripts/build-pathways.mjs ──▶ data/pathways.js ┐
data/markets.js, data/bom.js (cited) ──────────────────────────────────────────────────────┼─▶ engine/company.js ─▶ app / CLI
data/site-presets.js + PVGIS + engine/land.js ──▶ scripts/build-sites.mjs ──▶ data/sites.js ┘
```

## Results (screening)

| | Share of world tonnage feasible | Abundant (≤ ½ today's price) |
|---|---|---|
| Today | 39% | ~0% |
| Frontier | 94% | 25% |

- **Energy alone unlocks little.** 10× cheaper solar by itself adds almost nothing: equipment running ~7 sun-hours a day dominates most recipes. Cheap solar plus lean equipment and squeezed margins does.
- **What binds the company is not money.** The default 25-year run makes ~4.3 Gt today and ~8.5 Gt at the frontier, where it ends with over $1 trillion unspent. The limits are the 10% share-of-market ceiling and solar per site (50 GW each). With 100% share and 1 TW per site, the frontier company reaches ~6.8 Gt/yr by 2051 (57 Gt cumulative) on 21 TW of PV — and fills every site again.

## How the company simulator works

Each simulated year:

1. **Plants come online** after a construction lead time.
2. **Plants operate.** Revenue uses that year's realized price, which falls as the company's share of the market grows (`price = p0 × (1 − elasticity × share)`). Opex is fixed O&M on capex plus purchased feeds.
3. **Debt is serviced** and cash is banked.
4. **The company builds.** Among plants that pay back their capital (NPV ≥ 0) and that it can afford, it values each by its lifetime material — own tonnes plus the tonnes its surplus funds (`own kg + λ × NPV`) — per share of this year's scarce resources (equity, construction capacity, remaining site solar). Only material that serves a world market counts. A `profit` objective is kept for comparison. Building stops at money, construction capacity ($250M in year one, growing up to 50% a year over actual capex), the market-share ceiling (coproducts included) or the per-site PV ceiling.

**Energy in $/kWh.** Solar electricity is an input in $/kWh (quoted at 2,000 kWh/kWp·yr; each site's price scales with its sun), converted to PV capex at a fixed O&M/capex ratio. Today ≈ 4.5¢/kWh (IRENA 2023 utility PV, $758/kW). Every plant reports its cost per kg split into energy (PV + storage + land), equipment, feedstock and other, and the effective $/kWh it pays. `energyBreakevens` solves each recipe's break-even electricity price.

**Idiot index.** `data/bom.js` prices a bill of materials for every cost class at 2024–25 commodity prices: PV 5.4× its materials, LFP battery 13×, electrolyzer 31×, SWRO 36×, DAC 21×, process plant 22×. The target idiot index caps every class at materials × target each year. The Terraform loop re-prices those floors as the company's own output lowers commodity prices; it moves little, because one producer's price effect is elasticity × share.

**Running on sunlight alone** (`engine/utilization.js`). Each plant is designed per site from its flowsheet and 12 monthly typical solar days. Flexible units (electrolyzers, SWRO, DAC, pumps) are oversized for the sun hours; steady units (kilns, furnaces, synthesis loops) are firmed by batteries, or heat stores for heat-dominated units, down to a minimum turndown; an intermediate passed from a flexible to a steady unit is buffered overnight. The cheaper of "sun-following" and "everything firmed" wins.

**Make vs buy.** A plant that buys H₂, NH₃, CO₂, methanol or glass can build a same-site supplier (another recipe making that intermediate) when its cost beats the purchase price plus freight. With "infinite sources only", in-house supply is forced and plants that still buy an intermediate are not built.

**Costs fall** by exogenous decline per technology class, Wright's-law learning on the company's own deployment, and plant scale (`size^0.85`, floored at 0.4×; PV and land stay linear).

Every tunable lives in `FoundryCompany.DEFAULTS` (`engine/company.js`). The defaults are screening guesses; change them and look at what moves.

## Unit designs

`engine/designs/` holds parametric designs of the equipment that gates abundance: electrolyzer, Haber-Bosch loop, urea unit, H₂-DRI shaft, iron-ore pellet plant, direct air capture, methanol/Sabatier/MTO reactors and a modulating aluminium smelter. A design re-prices its own flowsheet unit in every recipe that contains it — capex, energy, raw-materials floor, operating mode, turndown, feeds and O&M — through `config.designs.units` ([contract](engine/designs/README.md)). Each has a design doc and build plan in [`docs/designs/`](docs/designs/).

## The data

- **Pathways** (`data/pathways.js`, 28 recipes): generated from `cases/*.js` by `npm run pathways`; a test fails if the file is stale. Each recipe gives electricity and heat per kg, feeds by origin (`ocean`, `brine`, `air`, `crust`, `water`, `consumable`, or a bought `intermediate`), coproducts, capex per kg/day by technology class, and the solved flowsheet.
- **Markets** (`data/markets.js`, 32 products): world demand, growth, reference price and a screening elasticity, tagged `cited` (mostly USGS, IEA) or `screening`.
- **Sites** (`data/sites.js`, generated by `npm run sites` from `data/site-presets.js`): 34 coasts and brine hubs with frozen PVGIS solar, seawater and brine assays, and land prices where a source exists.
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
- **Typical days, not weather.** Day-to-day variability, multi-day storage and grid backup are not modelled.
- **Design factors are exact only at their reference plant size.** Several designs fall in cost with size faster than the engine's single scale law.
- **Make-vs-buy is one level deep and per plant.** TiCl₄, Mg, PLS and REE concentrates have no supplier recipe.
- **Captive markets.** Much ammonia, H₂, O₂ and DRI is captive; the share ceiling is the only guard.
- **Multi-product plants.** Cost per kg is net of coproduct revenue, so it can be negative for brine hubs.

## Repository map

- `index.html`, `app.css`, `css/`: the app and its styles (one stylesheet per view).
- `js/app.js` (router), `js/store.js` (scenario ↔ engine config, worker client), `js/sim-worker.js`, `js/ui/` (kit, charts), `js/views/` (one file per view).
- `engine/company.js`: the company simulator and abundance scoreboard; `engine/utilization.js`: solar-only plant design; `engine/designs/`: equipment designs. The plant solver (`model`, `units`, `solve`, `heat`), economics, sizing (`size.js`), footprint and land prices (`land.js`) run in Node for the generators.
- `cases/`: plant models, shared builders (`_shared.js`) and sited brine hubs (`brine-hubs.js`).
- `data/`: generated `pathways.js` and `sites.js`; cited markets, TEA prices, bills of materials, site presets, assays, PVGIS, land prices.
- `scripts/`: dev server, build (ships only what the browser loads), deploy, generators, company CLI.
- `tests/`: `node --test` suites.

## License

MIT. See `LICENSE` and `NOTICE`.

Derived from [Ben Schrauwen](https://github.com/benschrauwen)'s unofficial MIT-licensed [`terraform-simulator`](https://github.com/benschrauwen/terraform-simulator) ([terraform-simulator.com](https://terraform-simulator.com/)), copyright (c) 2026 benschrauwen. This repository was created new rather than with GitHub's fork button, so GitHub will not show "forked from." Modifications (water-systems loop: desalination, brine mining, heat reuse, materials recovery; company simulator) are copyright Akarsh Gopal (2026). An independent educational tool, not affiliated with Terraform Industries. Third-party names, trademarks, external datasets and linked sources remain under their own terms.
