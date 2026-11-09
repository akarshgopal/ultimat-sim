# Molecular Foundry

**What would a company look like that makes the world's materials from sunlight, seawater, air and rock?**

Molecular Foundry simulates that company. Its first prerogative is **material abundance through feasible economics**: it builds solar-powered plants year by year, choosing what to make, where and how big, so as to make as much material as possible while every plant pays back its capital. It shows what the company produces, what share of world supply that is and how far prices fall, and whether it all stays self-funding.

It is a screening tool for exploring the Terraform Industries thesis — very cheap local solar, low-capex intermittent hardware, colocated conversion — across materials, not a bankable forecast.

Live: https://akarshgopal.github.io/ultimat-sim/

## The app

One page (`index.html`), six views. The scenario lives in the URL, so a link reproduces both the screen and the assumptions.

| View | Question |
|---|---|
| **Company** | What does the company make, how much of the world's supply is that, and is it feasible and self-funding? Scenario panel, abundance first, economics as the constraint. |
| **Energy** | Think in kWh and $/kWh: the electricity price below which each recipe becomes feasible, at several equipment costs; how much world material demand each price unlocks; where each kg's cost goes (energy, equipment, feedstock). Presets for today, 3× and 10× cheaper solar. |
| **Designs** | Engineer the equipment that gates abundance. First: a solar-matched alkaline electrolyzer (`engine/designs/electrolyzer.js`): knobs → geometry, bill of materials, $/kW, kWh/kg, idiot index → $/kg H₂ on sunlight alone; push the design into the company simulation; ranks what to design next. Design doc and build plan: [`docs/designs/solar-electrolyzer.md`](docs/designs/solar-electrolyzer.md). |
| **Pathways** | Each recipe: cost vs price over the years at its best site, when it becomes feasible, make-vs-buy, best sites, and the solved plant flowsheet per kg of product. |
| **Sites** | The 34 sites: solar, land price, seawater/brine, which recipes they can host, what the run builds there. |
| **Markets** | The 31 world markets: demand, price, sources, the company's share and the price relief it delivers. |

The simulation runs in a Web Worker. The browser loads only `engine/company.js` and three generated data files; plant models and the flowsheet solver run in Node when the data is regenerated:

```
cases/*.js ──solve + economics──▶ scripts/build-pathways.mjs ──▶ data/pathways.js (recipes + flowsheets) ┐
data/markets.js (world demand, price, growth; cited) ─────────────────────────────────────────────────────┼─▶ engine/company.js ─▶ app / CLI
data/site-presets.js + PVGIS + engine/land.js ──▶ scripts/build-sites.mjs ──▶ data/sites.js ──────────────┘
```

## How the company simulator works

Each simulated year:

1. **Plants come online** after a construction lead time.
2. **Plants operate.** Revenue uses that year's realized price, which falls as the company's share of the world market grows (`price = p0 × (1 − elasticity × share)`). Opex is fixed O&M on built capex plus purchased feeds.
3. **Debt is serviced** and cash is banked.
4. **The company builds.** Among plants that pay back their capital (NPV ≥ 0) and that it can afford, it values each by its lifetime material: the plant's own tonnes plus the tonnes its surplus will fund when reinvested (`own kg + λ × NPV`, with λ the year's best kg per capex dollar), and picks the best value per share of this year's scarce resources (equity, construction capacity, remaining site solar), so it is capital-efficient early and solar-efficient once solar binds. A `profit` objective (highest NPV) is kept for comparison. It decides make-vs-buy for each purchased intermediate (below) and builds the best affordable ones, using equity plus a debt fraction, until money, the yearly build limit, a per-product world-market share ceiling (applied to coproducts too) or a per-site PV ceiling stops it.

**Energy in $/kWh.** Solar electricity is a scenario input in $/kWh (quoted at 2,000 kWh/kWp·yr; a site's own price scales with its sun), converted to PV capex at a fixed O&M/capex ratio. Today ≈ 4.5¢/kWh (IRENA 2023 utility PV, $758/kW); presets at 3× and 10× cheaper. Equipment capex has its own multiplier. Every plant reports its cost per kg split into energy (PV + storage + land), equipment, feedstock and other, and the effective $/kWh it pays for the energy it actually uses (curtailment and storage push this above the headline price). `energyBreakevens` solves, per recipe, the electricity price at which its best site pays back its capital.

What that shows at 2027 equipment costs: cheap electricity alone unlocks little beyond cement, glass, PV modules and brine minerals. Ammonia, urea, steel, diesel and ethylene stay infeasible even with free electricity, because equipment running ~7 sun-hours a day dominates their cost; they unlock only when cheaper electricity comes with much cheaper low-utilization hardware (e.g. green ammonia below ~5¢/kWh at equipment ×0.1).

**Idiot index: squash the margins.** `data/bom.js` prices a bill of materials for every cost class at 2024–25 commodity prices, giving each a materials floor and today's idiot index (installed cost ÷ raw materials): PV 5.4× ($758 vs $139/kWp), LFP battery 13×, alkaline electrolyzer 31×, SWRO 36×, DAC 21×, generic process plant 22×, thermal store 5.9×, H₂ storage 9×. All screening-grade engineering inventories. The `target idiot index` lever caps every class at materials × target each year (never raising a price that learning has already cut). At 1.5× materials, solar falls to ~1.3¢/kWh and 18 of 24 recipes become feasible (8 today); ammonia, urea, DRI steel, FT diesel and MTO ethylene get real electricity break-evens (≈1–10¢/kWh) instead of "never", and a 25-year run makes ~1.4 Gt instead of ~0.5 Gt. Methanol, e-methane and Kroll titanium stay blocked. At that point the binding constraint is the build rate (plants per year), not money.

**What binds after the margins.** Construction capacity is a dollar budget that compounds: $250M in year one, then up to 50% more than the previous year's actual capex (`build.initialBuildUsdPerYear`, `buildGrowthPerYear`; the old 12-plants-a-year cap is off by default). Each catalog site can host up to 50 GWp (~800 km² at 1.6 ha/MWp). With those, the default 25-year run makes ~4.5 Gt at today's prices and ~6.3 Gt at 1.5× materials; the binding limits become the share-of-market ceiling and, above ~50% shares, total site solar (~1 TW over the catalog). The Terraform loop (the company's own steel, glass, aluminium, copper, polysilicon, lithium and cement lower commodity prices, re-pricing the materials floors each year) is modelled but moves little: PV's floor falls ~3% over 25 years, because the price effect of one producer is elasticity × share and those materials are only part of each floor. The margins, not the materials, are where the 10× is.

**Running on sunlight alone (utilization).** Each plant is designed per site from the recipe's flowsheet and 12 monthly typical solar days. Flexible units are sized for the hours the sun shines, choosing the unit-to-PV ratio that minimizes PV plus oversized equipment; steady units (kilns, furnaces, Haber-Bosch, synthesis loops) are firmed with batteries, or thermal stores for heat-dominated units, never turning down below 70% of full load; an intermediate passed from a flexible to a steady unit (H₂ into Haber-Bosch or DRI) is buffered overnight. The cheaper of "sun-following" and "everything firmed" wins. At 2027 costs this puts solar-only green H₂ at about $6.6/kg and green NH₃ at about $1.55/kg at the best site, inside or near the published IEA (2024) and IRENA (2022) ranges; the old 24 h costing gave $4.8 and $1.18.

Costs fall three ways:

- **Exogenous decline:** each technology class (PV, electrolyzer, DAC, desalination, storage, other process) gets cheaper by a set percentage a year.
- **Learning:** Wright's law on the company's own cumulative deployment of each class.
- **Scale:** process capex per unit of capacity falls with plant size (`size^exponent`, floored). PV and land stay linear, because solar is modular.

PV is sized per site from frozen PVGIS yields (daily-average energy, as in the plant models). Siting rules: seawater recipes need a coast; brine recipes need the reference brine; inland salt-lake hubs host brine recipes only.

**Make vs buy (vertical integration).** A plant that buys H₂, NH₃, methanol or glass can instead build its own supplier unit on the same site: another pathway whose product is that intermediate (seawater electrolysis for H₂, green ammonia, methanol, float glass). The supplier's capex, PV, land and opex join the plant, its coproducts (for example electrolyzer O₂) are sold, and the purchase disappears. The plant makes the intermediate only when the supplier's cost, net of its coproducts, beats the purchase price plus freight that year, so integration switches on as PV and electrolyzers get cheaper. In the default run every PV-module plant (the first is built in 2031) makes its own glass, and steel appears only from 2048, when PV and electrolyzer learning bring in-house hydrogen to about $1.60/kg against $2.08 bought. With "infinite sources only" on, in-house supply is forced and any plant that would still buy an intermediate is not built. CO₂ is always bought: no recipe undercuts $0.05–0.13/kg industrial CO₂.

Every tunable lives in `FoundryCompany.DEFAULTS` (`engine/company.js`). The defaults are screening guesses, not sourced numbers. Change them and look at what moves.

## The data

- **Pathways** (`data/pathways.js`, 24 recipes). Generated from the plant models by `npm run pathways`; a test fails if the committed file is stale. Each recipe gives electricity per kg, feeds by origin (`ocean`, `brine`, `air`, `crust`, `water`, or a purchased `intermediate` such as H₂ or TiCl₄), coproducts, and capex per kg/day split by technology class.
- **Markets** (`data/markets.js`, 31 products). World demand, year, growth, reference price (matching the plant models' prices) and a screening price elasticity. Rows are tagged `cited` (mostly USGS Mineral Commodity Summaries 2026, IEA) or `screening`, with sources. Overlapping rows (two NdPr oxides; other/light REO) share one market.
- **Sites** (`data/sites.js`, generated by `npm run sites` from `data/site-presets.js`). 34 coasts and brine hubs with frozen PVGIS solar, seawater and brine assays, and land prices where a source exists.

## Quickstart

Requires Node.js 18+. No dependencies.

```bash
npm run dev
```

Serves the app locally with caching disabled.

```bash
npm run company
```

Runs the default 25-year simulation in the terminal.

```bash
npm run company -- --rank
```

Year-0 ranking: cost vs price per pathway at its best site.

```bash
npm run company -- --years 15 --equity 1e8 --share 0.05 --only cement,float-glass,silicon
```

A scenario: 15 years, $100M starting equity, 5% market-share ceiling, three pathways only. `--config scenario.json` takes any `DEFAULTS` override.

```bash
npm test
```

Runs all regression checks (engine, data staleness, browser).

## Adding a material

1. Build the plant model in `cases/` (see existing cases and `cases/_shared.js`), with prices and capex bound through `data/tea-screening.js` and cited where possible.
2. `npm run pathways` to regenerate `data/pathways.js`.
3. If the product is new, add its world market to `data/markets.js` with a source.
4. Optional: add a `RATIO_ISLANDS` entry in `engine/size.js` so the plant can be resized in the plant view.

## Known limits

- **Screening economics.** Constant real prices within a plant's life, no tax or inflation, simple annuity debt. Elasticities and learning rates are screening assumptions.
- **Solar-only operation is modelled with typical days, not weather.** Equipment is sized for 12 monthly half-sine typical days per site (`engine/utilization.js`): flexible units (electrolyzers, SWRO, DAC, pumps, chlor-alkali, EW) follow the sun and are oversized accordingly; steady units are firmed by batteries or thermal stores and never turn down below 70%; intermediates between them are buffered. Day-to-day weather variability, multi-day storage and grid backup are not modelled; unit modes and storage costs are screening assumptions (all in `FoundryCompany.DEFAULTS.utilization`).
- **Make-vs-buy is one level deep and per plant.** A supplier unit serves only the plant it is built with. Suppliers that themselves buy intermediates are not used. TiCl₄, Mg, PLS and REE concentrates have no supplier recipe.
- **Demo-scale recipes.** Some plant models are tiny (0.6–5 kg/day), so their per-kg capex is high and scale extrapolation is large; recipe notes flag this.
- **Merchant vs captive markets.** Much ammonia, H₂, O₂ and DRI is captive; the share ceiling is the only guard.
- **Multi-product plants.** Cost per kg is net of coproduct revenue, so it can be negative for brine hubs.

Detailed per-plant notes, citations and engine reference: [`docs/plant-models.md`](docs/plant-models.md). TEA constant audit: [`docs/constants-audit.md`](docs/constants-audit.md).

## Repository map

- `index.html`, `app.css`, `css/`: the app and its design system (one stylesheet per view).
- `js/app.js` (router), `js/store.js` (scenario ↔ engine config, worker client), `js/sim-worker.js`, `js/ui/` (kit, charts), `js/views/` (company, pathways, sites, markets).
- `engine/company.js`: the company simulator. `engine/` also holds the plant solver (`model`, `units`, `solve`, `heat`), plant economics, sizing (`size.js`), footprint and land-price lookup (`land.js`), used in Node by the generators.
- `cases/`: plant models (one per pathway family), shared builders (`_shared.js`) and sited brine hubs (`brine-hubs.js`).
- `data/`: generated `pathways.js` and `sites.js`, cited `markets.js`, TEA prices and capex (`tea-screening.js`), site presets, assays, PVGIS, land prices.
- `scripts/`: dev server, build (ships only what the browser loads), deploy, generators (`build-pathways`, `build-sites`, `build-land-prices`, `build-seawater-assays`), company CLI.
- `tests/`: `node --test` suites, including Playwright checks of every view.

## License

MIT. See `LICENSE` and `NOTICE`.

Derived from [Ben Schrauwen](https://github.com/benschrauwen)'s unofficial MIT-licensed [`terraform-simulator`](https://github.com/benschrauwen/terraform-simulator) ([terraform-simulator.com](https://terraform-simulator.com/)), copyright (c) 2026 benschrauwen. This repository was created new rather than with GitHub's fork button, so GitHub will not show "forked from." Modifications (water-systems loop: desalination, brine mining, heat reuse, materials recovery; company simulator) are copyright Akarsh Gopal (2026). An independent educational tool, not affiliated with Terraform Industries. Third-party names, trademarks, external datasets and linked sources remain under their own terms.
