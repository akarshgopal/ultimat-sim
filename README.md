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
- Integrated methane + water-recycle, evidence-backed coastal methane, and ammonia + brine industrial-hub examples. The coastal case binds Almería PVGIS solar, a cited Alboran multi-ion seawater assay (Millero/Pilson S=35 scaled to 36.5 g/kg; not a NaCl proxy), assumed intake, and unverified grid/freshwater/discharge to the plant, then dispatches a 24-hour typical day so night hours produce nothing unless a battery is assumed. The Dead Sea hub cites the same PVGIS family, uses a frozen open-water ion assay, and marks freshwater and salt as assumed. Intake and discharge stay unverified inland. A literature assay is not a mineral concession. The abundance hub couples brine-derived bromide with chlor-alkali chlorine, then uses chlor-alkali hydrogen with ASU nitrogen for ammonia.
- Distinct DAC routes (solid-sorbent, liquid-solvent, electro-swing) with different heat and reagent contracts. Switching a route keeps compatible connections, does not rewrite an existing makeup chemical, and stays comparable against a captured baseline.
- A location bar: a Leaflet map picker plus coordinates. Click the map or Apply location to fetch or reuse PVGIS typical-day solar and bind it to the current factory. Toggle OSM, real Global Solar Atlas annual GHI LERC tiles (`GSA_IRRAD` ImageServer, `sliceId=2`, cited; hourly PVGIS still fetched on Apply location), WRI Aqueduct Baseline Water Stress tiles (UMN SCOPE MapServer, `{z}/{y}/{x}`, cited, with a screening GridLayer fallback), `estimateFootprint` pads, and network plant markers. Solar, water, and land colormaps are mutually exclusive. Land is a cited choropleth of official agricultural land values in USD/ha (USDA NASS Land Values 2025 farm real estate by US state; Eurostat `apri_lprc` arable land by country, EUR→USD via documented ECB/Frankfurter FX) — early siting proxy only, not cadastral or parcel comps; transparent where unpublished. If tiles or the map library fail, lat/lon still work. Site panels keep meteo cites, assay summaries, and rights chips (`authorized` / `assumed` / `unverified`) with a light `kind` (`grid` / `freshwater` / `intake` / `discharge` / `concession` / `purchase`). Unverified grid and freshwater stay explicit zeros until assigned (`authorize: false`); solve warns `unverified site right: KEY`. Size-to-target will not grow a resource whose right is unverified (`size-to-target cannot assume KEY`). Intake is not discharge; a concession is not a purchase.
- Location presets for real candidate coasts: Gulf (Taweelah, Ras Laffan), Texas/US Gulf (Corpus Christi), India (Mundra), Australia (Pilbara Port Hedland, Kwinana), North Africa (Agadir, Dakhla), Atacama/Chile (Mejillones), plus Red Sea (NEOM Oxagon, Ain Sokhna), Oman Duqm, Namibia Walvis Bay, and Almería. Selecting a site sets coordinates, name, and honest unverified/assumed rights, then fetches live PVGIS. These are map locations only — they do not replace the Almería coastal methane or Dead Sea abundance demos, and they are not bankable permits.
- Location-aware site footprint: solar land from panel area ÷ GCR (latitude-adjusted row spacing), plus order-of-magnitude process pads for active units. Network `landHa` is the sum of those site totals, not a flat 1.6 ha/MWp.
- Co-product positive-cashflow sizing (`sizeForPositiveCashflow`): maximize the number of sale sinks with revenue while `annualNetCash > 0` (revenue-proportional OPEX allocation makes every active sale product share that sign); ties break by higher net cash. Physics sizing first; dollars only after `evaluateEconomics`. Size-to-target remains the single-product physics tool.
- Iterative size-to-target: pick CH₄, H₂, lithium, or salt and a kg/day rate. The outer loop sizes the loaded plant (desal, electrolyzer, DAC/Sabatier, brine minerals, and PV as needed) until the operating solve is consistent. The coastal demo remains a one-shot 37.5 kWp methane example until Size to target is used.
- A network rollup: multiple sited plants, product slate in t/year, land, optional haul corridors, and combined CAPEX/NPV. The fuels + minerals demo places solar methane at Almería and a brine/ammonia hub on the Dead Sea.

The Foundry source is concentrated in `engine/`, `cases/`, `js/flowsheet-app.js`, `index.html`, and `flowsheet.css`.

## Code map

- `index.html`, `flowsheet.css`, and `js/flowsheet-app.js`: editor, inspector, saved factories, and scenario comparison.
- `engine/model.js`: substances, streams, and graph validation.
- `engine/units.js`: process catalog and unit physics.
- `engine/solve.js`: operation, resource allocation, recycles, and balance diagnostics.
- `engine/heat.js`: post-solve temperature-feasible heat cascade (not HEN synthesis).
- `engine/economics.js`: costs and cash flows computed from the solved graph. Both economics panels use this result directly; IRR is a fractional rate.
- `engine/footprint.js`: post-solve solar land (efficiency × location-aware GCR) and screening process pads.
- `engine/map-site.js`: map-picker geometry, layer cites, and colormap helpers (GSA annual GHI ramp + geographic LERC tile math, Aqueduct BWS tile template). Not a permit, assay, cadastral layer, or surveyed layout. Solar overlay decodes Esri LERC via `vendor/LercDecode.js`.
- `engine/size.js`: outer product sizing loop (`sizeToProduct`) plus co-product cashflow search (`sizeForPositiveCashflow`). CH₄, H₂, lithium, or salt demand sizes water, converters, brine, power, and `solarKWp`; `solveOperation` stays physics-only. `sizeToTarget` is the CH₄ wrapper.
- `engine/uncertainty.js`: quality tags (`cited` / `recoverable` / `assumption` / `derived` / `screening`) and screening-precision formatters. No fake error bars.
- `cases/`: runnable reference plants.
- `tests/*flowsheet*.test.js`: engine, economics, and browser-global/UI regression checks. `tests/map-site.test.js` covers the map-picker geometry and layer cites.
- `scripts/`: local server, static build, GitHub Pages deploy.

The root page loads only the Foundry engine, cases, and UI scripts. `style.css` retains base styles used by Foundry. `flowsheet.html` redirects old links to the root page. The archived TEA page, JavaScript, and tests have been removed; their committed history remains in Git.


## Model limits

The operating model uses representative-day flows and fixed installed capacities. It checks component/element, charge, electricity, and heat accounting, but does not provide full thermodynamic closure, hourly storage dispatch, or economic optimization. Automatic plant sizing is a separate outer loop (`engine/size.js`) that chooses capacities and `solarKWp` from a product target (CH₄, H₂, lithium, or salt), then calls the same operating solver. Process and cost presets are editable screening assumptions. Foundry money and land use fewer significant figures when screening; a single economics banner covers bankability instead of repeating screening chips on every metric.

## Running locally

Requires Node.js 18 or newer; no external runtime packages are needed.

- `npm run dev`: serve source files with caching disabled.
- `npm run build`: generate versioned deployment assets in `dist/`.
- `npm run preview`: serve the built output.
- `npm test`: run Foundry regression checks.
- `npm run deploy`: build `dist/` and publish it to GitHub Pages.

The live site is https://akarshgopal.github.io/ultimat-sim/ — pushes to main rebuild via GitHub Pages.

## License

MIT. See `LICENSE` and `NOTICE`.

The original simulator is copyright Ben Schrauwen (2026), from [`benschrauwen/terraform-simulator`](https://github.com/benschrauwen/terraform-simulator). Modifications in this repository (water-systems loop: desalination, brine mining, heat reuse, materials recovery) are copyright Akarsh Gopal (2026). Third-party names, trademarks, external datasets, and linked source materials remain under their own respective terms.
