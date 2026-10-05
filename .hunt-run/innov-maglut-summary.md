# INNOV-Maglut (screening abundance-TEA tranche)

Standalone ARC-1-style REE chromatography screening on purchased Longnan listed-oxide concentrate at a Long Beach, California map point. Network not Empire. Not a solvent-extraction train. Not bankable. **proxy band · not a Maglut ARC-1 quote · Maglut has not published kWh/kg or CAPEX.**

## What shipped

- Unit `ree-chromatography` in `engine/units.js`: oxide-equivalent mixed concentrate + electricity → NdPr / DyTb / light REO + raffinate. Custom evaluator (same shape as `iacLeach`). Recovery default 0.914; SEC default 5 kWh/kg REO. No wasteHeat, oxalic acid, resin, or water ports. Extra feed substances with mol > 1e-12 throw. 90.25% precip/calcine company figure is not multiplied; purity is not simulated.
- Locked TEA rows in `data/tea-screening.js` (Minaçu `ndpr-oxide` 48.30, `other-reo` 33.61, pack `iac-leach` 18250 untouched):
  - `ndpr-oxide-separated` $69/kg (USGS MCS 2026 NdPr oxide 99% min 2025e; 0.70 MREC haircut not applied because this block is the separation)
  - `dytb-oxide` $340.19/kg (unrounded 2929.02/8.61)
  - `light-reo` $17.50/kg (unrounded 1443.154/82.46; Tm value 0)
  - cost `mixed-reo-concentrate` $34.54/kg (unrounded 0.70 × (6.20×69 + 4372.174) / 97.27)
  - pack `ree-chromatography` 27375 $/(kg separated REO/day) = $75,000/t-y × 365/1000; fixed O&M 4%, variable 0.05, 20 y, quality screening
  - demand (base object only; regions inherit): NdPr-sep 5e4, DyTb 2e4, light REO 2e5 kg/y. Not in `MINERAL_DEMAND_KEYS`.
- Demo `cases/maglut.js` `MaglutCase.createMaglutCase`: 10 kg recovered listed REO/day, feed 10/0.914 kg Longnan-oxide basket (no kaolinite), Long Beach (33.77, −118.19), region `US West / California` (aliases to texas, CAPEX× 1). Concentrate purchase assumed; grid unverified; no plot / no Maglut HQ / no concession.
- Frozen PVGIS `data/pvgis-long-beach.json` from the specified PVcalc query. `totals.fixed.E_d` **3.33**, `E_y` **1213.78**. Array 15.315 kWp = (10×5)/3.33 × 1.02. No electricity purchase.
- UI: palette REE `['iac-leach', 'ree-chromatography']`, catalog **ARC-1 chromatography**, Overview option after Minaçu, purchased preset `mixed-reo`.
- Footprint pad `ree-chromatography`: 15 m²/(kg REO/h), range [8, 30], floor 40 m², screening, Andersson DOI evidence.
- Tests `tests/catalog-maglut.test.js`. `npm test`: **385 pass / 0 fail**.

Minaçu (`cases/ree.js`, `iac-leach`) stays bit-identical. Oxide list, molar masses, Longnan points, and USGS separated $/kg stay in `data/ionic-clay-longnan.js` (`concentrateMolForKg` helper added; published numbers unchanged).

## Demo cash (solved `createMaglutCase`, 365 d, CRF 8%/20 y)

10 kg recovered listed REO/day (NdPr 0.637 kg/day + DyTb 0.885 kg/day + light REO 8.477 kg/day). Feed 10/0.914 kg/day mixed concentrate @ $34.54/kg; 50 kWh/day on 15.315 kWp × 3.33 kWh/kWp·d with 2% margin. Electricity does not bind. No electricity purchase. CAPEX× 1 on chromatography island and solar.

| Line | $/year |
|---|---:|
| Annual revenue | 180,113 |
| Feed purchases | 137,933 |
| Fixed O&M | 11,256 |
| Variable O&M | 183 |
| Annual operating cost | 149,372 |
| Annualized CAPEX | 29,442 |
| **Net cash (R − OPEX − annualized CAPEX)** | **1,299** |

Installed CAPEX ≈ $289 k (chromatography island $273,750, solar ≈ $15,315). Screening gate cash is **positive** at this tiny linear-CAPEX scale because DyTb at $340.19/kg carries the basket and $75,000/t-y on 3.65 t/y is a cheap pilot intensity. Not retuned to force a sign. Not a Maglut quote. Not bankable.

## Evidence used

| Item | Role |
|---|---|
| USGS MCS 2026 rare earths PDF | NdPr $69/kg; separated-oxide family; offtake context |
| Longnan published points × `usgsSeparatedUsdPerKg` | DyTb and light-REO baskets; Tm value 0 |
| Meteoric Caldeira scoping PDF | 0.70 payability on the **purchase** (mixed concentrate), not on separated sales |
| Talens Peiró & Villalba JOM 2013 | 5 kWh/kg peer proxy (SX electricity 15.6–22.7 GJ/t REM ≈ 4.3–6.3 kWh/kg) |
| Andersson et al. IECR 2014 | MCSGP productivity, not electricity; pad evidence URL |
| NETL OSTI 1509123 | IX LCI pumping ~4.24 Wh/kg is a lab floor, not the default |
| Honaker/NETL 2020 PDF | full coal-to-REE plant $126M / 825 t/y ≈ $153k/t-y (upper peer) |
| FAR RNS / Mining Technology | company-reported ~91.4% recovery and purity claims (mass recovery only in the model) |
| ORNL MSX publication | 300 kg REO/month scale context only (membrane SX, not chromatography, not CAPEX) |
| PVGIS-ERA5 PVcalc 2026-10-05 | frozen E_d 3.33, E_y 1213.78 at 33.77, −118.19; specified query `aspect=180` |
| Wikipedia Long Beach | geography cite; map point only |

## Explicit non-claims

- Intensities are **not** Maglut’s. Maglut has not published kWh/kg or CAPEX.
- The demo is **not** Maglut-validated and **not** bankable.
- 0.914 is company-reported average separation recovery used as **mass recovery only**. Purity (>99% / 99.9%) is not certified and not simulated.
- 90.25% precip/calcine is **not** stacked on 0.914.
- SEC 5 kWh/kg is a Talens SX electricity **peer proxy**, not a chromatography plant meter and not NETL lab pumping.
- CAPEX $75,000/t-y is a **proxy band** between leach-without-SX (~$50k/t-y) and Honaker/NETL 2020 (~$153k/t-y). Wide peer band about $25,000–$150,000 per annual tonne. Linear small-plant intensity.
- Separated-oxide prices are USGS screening, not contracts and not purity certificates.
- Mixed-concentrate purchase is USGS basket × 0.70 payability, not a Maglut toll.
- Long Beach is a **map point only**. Not a Maglut HQ, not plot rights, not a concession.
- Cash sign is whatever falls out of the screening gate.

## Leftovers

- Oxalate precipitation / calcine step (90.25% company figure) not modeled as a second block.
- Chloride liquor feed (this block is oxide-equivalent concentrate).
- Resin inventory, resin life, and resin OPEX.
- Purity spec / grade certificates.
- Minaçu upgrade path (chromatography is a standalone demo; do not bolt it onto `iac-leach`).
- Water, acid, and reagent recycle ports.
- Freight / offtake contracts.
- California location factor (US West / California already aliases to texas, CAPEX× 1).

## Tip

Feat `f68ef45` on `main`. `npm test` 385 pass / 0 fail. Pages published: https://akarshgopal.github.io/ultimat-sim/
