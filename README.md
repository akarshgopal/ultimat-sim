# Molecular Foundry

**Attribution.** This codebase is derived from [Ben Schrauwen](https://github.com/benschrauwen)'s unofficial MIT-licensed [`terraform-simulator`](https://github.com/benschrauwen/terraform-simulator) ([terraform-simulator.com](https://terraform-simulator.com/)). Copyright (c) 2026 benschrauwen. This GitHub repository was created new rather than using GitHub's fork button, so GitHub will not show "forked from." It is an independent educational tool and is not affiliated with Terraform Industries.

An unofficial, MIT-licensed browser app for exploring coupled industrial processes. The main product is Molecular Foundry, a flowsheet workspace for connecting process blocks and inspecting material and energy flows.

The app is intentionally centered on the idea that very cheap local solar DC, low-capex intermittent hardware, and colocated conversion can matter more than chasing maximum utilization or maximum electrical efficiency.

## Current Foundry State

The root app now provides:

- A blank, editable process canvas with explicit material, electricity, heat, and consumable ports.
- Reusable desalination, electrolysis, DAC, Sabatier, ASU, Haber–Bosch, brine-mineral, chlor-alkali, bromine, aluminium, hydrogen-DRI steel, titanium, energy, storage, splitter, mixer, source, and destination blocks.
- A deterministic operating solver with capacity limits, bottleneck reporting, recycles, and visible balance residuals.
- A generic post-solve economics fold: source purchases, installed CAPEX, fixed and variable O&M, sale/disposal destinations, demand caps, replacements, delivered cost, NPV, and IRR.
- Editable economic assumptions on every source, converter, and destination, including zero-cost inputs for in-the-limit experiments.
- Captured-baseline scenario comparison and a synergy ledger for avoided purchases, avoided disposal, and added product revenue.
- Integrated methane + water-recycle, evidence-backed coastal methane, and ammonia + brine industrial-hub examples. The coastal case binds Almería PVGIS solar, seawater intake, and unverified grid/freshwater to the plant, then dispatches a 24-hour typical day so night hours produce nothing unless a battery is assumed. The abundance hub couples brine-derived bromide with chlor-alkali chlorine, then uses chlor-alkali hydrogen with ASU nitrogen for ammonia.
- Distinct DAC routes (solid-sorbent, liquid-solvent, electro-swing) with different heat and reagent contracts. Switching a route keeps compatible connections, does not rewrite an existing makeup chemical, and stays comparable against a captured baseline.
- A location bar: coordinates plus PV kWp fetch or reuse PVGIS typical-day solar and bind it to the current factory. Unverified grid and freshwater stay explicit zeros until assigned.
- Location-aware site footprint: solar land from panel area ÷ GCR (latitude-adjusted row spacing), plus order-of-magnitude process pads for active units. Network `landHa` is the sum of those site totals, not a flat 1.6 ha/MWp.
- A network rollup: multiple sited plants, product slate in t/year, land, optional haul corridors, and combined CAPEX/NPV. The fuels + minerals demo places solar methane at Almería and a brine/ammonia hub on the Dead Sea.

The Foundry source is concentrated in `engine/`, `cases/`, `js/flowsheet-app.js`, `index.html`, and `flowsheet.css`.

## Code map

- `index.html`, `flowsheet.css`, and `js/flowsheet-app.js`: editor, inspector, saved factories, and scenario comparison.
- `engine/model.js`: substances, streams, and graph validation.
- `engine/units.js`: process catalog and unit physics.
- `engine/solve.js`: operation, resource allocation, recycles, and balance diagnostics.
- `engine/economics.js`: costs and cash flows computed from the solved graph. Both economics panels use this result directly; IRR is a fractional rate.
- `engine/footprint.js`: post-solve solar land (efficiency × location-aware GCR) and screening process pads.
- `cases/`: runnable reference plants.
- `tests/*flowsheet*.test.js`: engine, economics, and browser-global/UI regression checks.
- `scripts/`: local server, static build, CLI example, and deployment.

The root page loads only the Foundry engine, cases, and UI scripts. `style.css` retains base styles used by Foundry. `flowsheet.html` redirects old links to the root page. The archived TEA page, JavaScript, and tests have been removed; their committed history remains in Git.

See [engine architecture](docs/flowsheet-architecture.md) for model contracts and fidelity limits.

## Model limits

The operating model uses representative-day flows and fixed installed capacities. It checks component/element, charge, electricity, and heat accounting, but does not provide full thermodynamic closure, hourly storage dispatch, automatic plant sizing, or economic optimization. Process and cost presets are editable screening assumptions.

## Running locally

Requires Node.js 18 or newer; no external runtime packages are needed.

- `npm run dev`: serve source files with caching disabled.
- `npm run build`: generate versioned deployment assets in `dist/`.
- `npm run preview`: serve the built output.
- `npm run flowsheet`: print the integrated methane example's flows and balances.
- `npm test`: run Foundry regression checks.
- `npm run deploy`: build `dist/` and publish it to GitHub Pages.

The live site is [akarshgopal.github.io/ultimat-sim](https://akarshgopal.github.io/ultimat-sim/). Pushes to `flowsheet` rebuild it. Vercel is also configured to build and serve `dist/`.

## License

MIT. See `LICENSE` and `NOTICE`.

The original simulator is copyright Ben Schrauwen (2026), from [`benschrauwen/terraform-simulator`](https://github.com/benschrauwen/terraform-simulator). Modifications in this repository (water-systems loop: desalination, brine mining, heat reuse, materials recovery) are copyright Akarsh Gopal (2026). Third-party names, trademarks, external datasets, and linked source materials remain under their own respective terms.
