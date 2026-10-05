# CATALOG-REE-SX (peer solvent-extraction screening)

Peer solvent-extraction screening on purchased Longnan listed-oxide concentrate at the Long Beach map point. Network label only. Not Maglut chromatography. Not a Lynas/MP Materials/Mountain Pass quote. Not bankable. Cash sign is whatever falls out of capital-inclusive screening cash (R − OPEX − annualized CAPEX).

## What landed

- Unit `ree-sx` in `engine/units.js`: custom evaluator `reeSx` (sibling of `reeChromatography`, not a reaction stub). Ports `concentrate` + `electricity` in; `ndpr` / `dytb` / `lightReo` / `raffinate` out. Recovery default **0.95**. SEC default **5.3 kWh/kg**. Extra feed substances with mol > 1e-12 throw. No wasteHeat. No extractant, solvent, water, or acid ports.
- TEA pack `ree-sx` only. Capex intensity **43800** $/(kg separated REO/day) = $120,000 per annual tonne × 365/1000. Fixed O&M 4%, variable 0.05, 20 y, quality screening. Existing price, cost, and demand rows were not edited.
- Demo `cases/ree-sx.js` `ReeSxCase.createReeSxCase`: 10 kg recovered listed REO/day, feed 10/0.95 kg Longnan-oxide basket (no kaolinite), Long Beach (33.77, −118.19), region `US West / California` (aliases to texas, CAPEX× 1). Frozen PV `data/pvgis-long-beach.json` E_d **3.33** / E_y **1213.78** (same map point as Maglut). Concentrate purchase assumed; grid unverified; on-site solar only.
- UI: palette REE `['iac-leach', 'ree-chromatography', 'ree-sx']`, catalog **REE SX (peer)** glyph `SX`, Overview option after Maglut (`ree-sx` / `loadReeSx`). Purchased preset `mixed-reo` reused. Footprint pad 20 m²/(kg REO/h), range [10, 40], floor 50 m².
- Minaçu `iac-leach` and Maglut `ree-chromatography` evaluators, packs, and prices left at their published numbers.

## Cited numbers

| Item | Value | Source |
|---|---:|---|
| Recovery | 0.95 | Commercial SX screening mid of ~90–98%. Not Maglut’s 0.914. |
| SEC | 5.3 kWh/kg | Talens Peiró & Villalba JOM 2013 SX electricity mid of 15.6–22.7 GJ/t REM = 4.33–6.31 kWh/kg → 5.32, rounded 5.3. Native SX number. Maglut’s 5 was a chromatography proxy. |
| Pack | 43800 $/(kg separated REO/day) | $120,000/t-y × 365/1000. Above Maglut chromatography proxy $75k/t-y (pack 27375) and below Honaker/NETL 2020 full coal-to-REE plant ~$153k/t-y. |
| `ndpr-oxide-separated` | $69/kg | Reused. USGS MCS 2026. |
| `dytb-oxide` | $340.19/kg | Reused. |
| `light-reo` | $17.50/kg | Reused. |
| `mixed-reo-concentrate` | $34.54/kg | Reused cost. |
| `ree-chromatography` pack | 27375 | Unchanged. |
| `iac-leach` pack | 18250 | Unchanged. |
| Frozen PV | E_d 3.33, E_y 1213.78 | `data/pvgis-long-beach.json`. |

Evidence URLs on the pack: Talens Peiró JOM 2013; Honaker/NETL 2020 PDF; USGS MCS 2026 rare earths; ORNL MSX (membrane SX scale context only — not this CAPEX).

## Demo cash (solved `createReeSxCase`, `evaluateEconomics`, 365 d, CRF 8%/20 y)

10 kg recovered listed REO/day (NdPr 0.637 kg/day + DyTb 0.885 kg/day + light REO 8.477 kg/day). Feed 10/0.95 = 10.526 kg/day mixed concentrate @ $34.54/kg. SEC 5.3 → 53 kWh/day; array 16.234 kWp × 3.33 kWh/kWp·d delivers 54.06 kWh/day (2% margin). Electricity does not bind. No electricity purchase. CAPEX× 1.

| Line | $/year |
|---|---:|
| Annual revenue | 180,112.92 |
| Feed purchases | 132,706.32 |
| Fixed O&M | 17,844.68 |
| Variable O&M | 182.50 |
| Annual operating cost | 150,733.50 |
| Annualized CAPEX | 46,264.76 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−16,885.34** |

`annualNetCash` from the run: **-16885.342542287508**. Installed CAPEX 454,234.23 (SX island $438,000 = 43800 × 10 kg/day; solar $16,234.23). Screening gate cash is **negative** at this scale. Not retuned. Not bankable.

Maglut `createMaglutCase` on the same run: `annualNetCash` **1298.9104525152143** (within ±5 of 1299). Minaçu `createReeCase` stays cash-positive and finite (`annualNetCash` 683084.44).

## Files

- `engine/units.js` — `reeSx` evaluator and `ree-sx` unit
- `data/tea-screening.js` — pack `ree-sx` only
- `cases/ree-sx.js` — Long Beach demo
- `js/flowsheet-app.js` — palette, catalog, loader, tea bind on place
- `index.html` — Overview option and script tag
- `engine/footprint.js` — SX pad
- `engine/uncertainty.js` — screening quality
- `tests/catalog-ree-sx.test.js` — new
- `tests/flowsheet-ui.test.js`, `tests/catalog-maglut.test.js`, `tests/catalog-ree.test.js` — palette list now includes `ree-sx` after chromatography
- `README.md` — one REE line

## Tests

`npm test`: **402 pass / 0 fail** before the feat commit. Cash sign is not asserted for the SX demo. Maglut cash stays ≈ 1299. Minaçu stays cash+.

## Leftovers

- Extractant / solvent makeup (and water or acid ports). Second-order versus DyTb payability at this screening grain.
- Multi-stage McCabe-Thiele stage counts, scrub/strip ratios, and separation factors.
- Chloride liquor feed from `iac-leach` (this block is oxide-equivalent concentrate, same honesty as Maglut).
- Purity certificates. Mass split is not a grade spec.
- Freight on the concentrate purchase or separated-oxide sales.
- `sizeToProduct` REO alias (size-to-target still lists CH₄, H₂, methanol, ammonia, lithium, salt).

## Tip

Pending the feat commit and Pages publish.
