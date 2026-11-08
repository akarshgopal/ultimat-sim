# Molecular Foundry

**What would a company look like that makes the world's materials from sunlight, seawater, air and rock?**

Molecular Foundry simulates that company. Pick starting capital and technology assumptions; it builds solar-powered plants year by year, choosing what to make, where, and how big, and shows what the company becomes: revenue, plants, gigawatts of PV, land, share of world markets, and which technologies' learning curves made it possible.

It is a screening tool for exploring the Terraform Industries thesis — very cheap local solar, low-capex intermittent hardware, colocated conversion — across materials, not a bankable forecast.

Live: https://akarshgopal.github.io/ultimat-sim/

## Two levels

| View | Question | Code |
|---|---|---|
| **Company** | What does the company build over 25 years, and what does it become? | `engine/company.js`, `data/pathways.js`, `data/markets.js` |
| **Plant detail** | How does one plant work — mass and energy balance, heat, sizing, cash? | `index.html`, `engine/` solver, `cases/` |

The levels are linked: each plant model in `cases/` is reduced to a per-kg **pathway** recipe that the company simulator reuses, so the company view never drifts from the physics.

```
cases/*.js  ──solve + economics──▶  scripts/build-pathways.mjs  ──▶  data/pathways.js ┐
data/markets.js (world demand, price, growth; cited)  ────────────────────────────────┼─▶ engine/company.js ─▶ company view / CLI
data/site-presets.js + data/pvgis-sites.js + land prices (34 sites)  ─────────────────┘
```

## How the company simulator works

Each simulated year:

1. **Plants come online** after a construction lead time.
2. **Plants operate.** Revenue uses that year's realized price, which falls as the company's share of the world market grows (`price = p0 × (1 − elasticity × share)`). Opex is fixed O&M on built capex plus purchased feeds.
3. **Debt is serviced** and cash is banked.
4. **The company builds.** It ranks every pathway × site × plant size by NPV and builds the best affordable ones, using equity plus a debt fraction, until money, the yearly build limit, a per-product world-market share ceiling (applied to coproducts too) or a per-site PV ceiling stops it.

Costs fall three ways:

- **Exogenous decline:** each technology class (PV, electrolyzer, DAC, desalination, storage, other process) gets cheaper by a set percentage a year.
- **Learning:** Wright's law on the company's own cumulative deployment of each class.
- **Scale:** process capex per unit of capacity falls with plant size (`size^exponent`, floored). PV and land stay linear, because solar is modular.

PV is sized per site from frozen PVGIS yields (daily-average energy, as in the plant models). Siting rules: seawater recipes need a coast; brine recipes need the reference brine; inland salt-lake hubs host brine recipes only.

Every tunable lives in `FoundryCompany.DEFAULTS` (`engine/company.js`). The defaults are screening guesses, not sourced numbers. Change them and look at what moves.

## The data

- **Pathways** (`data/pathways.js`, 23 recipes). Generated from the plant models by `npm run pathways`; a test fails if the committed file is stale. Each recipe gives electricity per kg, feeds by origin (`ocean`, `brine`, `air`, `crust`, `water`, or a purchased `intermediate` such as H₂ or TiCl₄), coproducts, and capex per kg/day split by technology class.
- **Markets** (`data/markets.js`, 31 products). World demand, year, growth, reference price (matching the plant models' prices) and a screening price elasticity. Rows are tagged `cited` (mostly USGS Mineral Commodity Summaries 2026, IEA) or `screening`, with sources. Overlapping rows (two NdPr oxides; other/light REO) share one market.
- **Sites** (`data/site-presets.js`). 34 coasts and brine hubs with frozen PVGIS solar, seawater and brine assays, and land prices where a source exists.

## Quickstart

Requires Node.js 18+. No dependencies.

```bash
npm run dev
```

Serves the app locally with caching disabled. Open the company view from the header.

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
- **No seasonal storage.** Daily-average solar energy, as in the plant models; batteries only where a case includes them.
- **Purchased intermediates stay purchased.** The company does not yet integrate vertically, for example making its own H₂ for DRI.
- **Demo-scale recipes.** Some plant models are tiny (0.6–5 kg/day), so their per-kg capex is high and scale extrapolation is large; recipe notes flag this.
- **Merchant vs captive markets.** Much ammonia, H₂, O₂ and DRI is captive; the share ceiling is the only guard.
- **Multi-product plants.** Cost per kg is net of coproduct revenue, so it can be negative for brine hubs.

Detailed per-plant notes, citations and engine reference: [`docs/plant-models.md`](docs/plant-models.md). TEA constant audit: [`docs/constants-audit.md`](docs/constants-audit.md).

## Repository map

- `engine/`: solver (`model`, `units`, `solve`, `heat`), plant economics, sizing (`size.js`), footprint, map helpers, and the company simulator (`company.js`).
- `cases/`: plant models (one per pathway family) and shared builders (`_shared.js`).
- `data/`: TEA prices and capex (`tea-screening.js`), markets, pathways, sites, assays, PVGIS, land prices.
- `js/flowsheet-app.js` + `js/app/*.js`: plant-detail UI (entry file plus one file per panel).
- `scripts/`: dev server, build, deploy, pathway generator, company CLI, site-search tools.
- `tests/`: `node --test` suites, including Playwright browser checks.

## License

MIT. See `LICENSE` and `NOTICE`.

Derived from [Ben Schrauwen](https://github.com/benschrauwen)'s unofficial MIT-licensed [`terraform-simulator`](https://github.com/benschrauwen/terraform-simulator) ([terraform-simulator.com](https://terraform-simulator.com/)), copyright (c) 2026 benschrauwen. This repository was created new rather than with GitHub's fork button, so GitHub will not show "forked from." Modifications (water-systems loop: desalination, brine mining, heat reuse, materials recovery; company simulator) are copyright Akarsh Gopal (2026). An independent educational tool, not affiliated with Terraform Industries. Third-party names, trademarks, external datasets and linked sources remain under their own terms.
