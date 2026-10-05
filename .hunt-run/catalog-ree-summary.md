# CATALOG-REE (screening abundance-TEA tranche)

Ionic-clay leach+precip+calcine screening on a Longnan literature basket placed at Minaçu, Goiás. Screening honesty, not bankable. Cash is capital-inclusive and **positive** at this tiny linear-CAPEX scale.

## Route choice

Ion-adsorption clay, one leach+precip+calcine block. Not hard-rock: bastnäsite/monazite needs crush, float, acid bake, and SX — out of scope. The only complete public ionic-clay oxide table in Deng & Kendall 2019 Table 1 is Longnan, Jiangxi (Y-rich heavy basket, not an NdPr clay). Nd+Pr are split out as a co-product; the rest is one mixed-REO sale. Geography is Minaçu, Goiás (sun + ionic clay outside China) as a **literature basket on a map point**, not the Serra Verde / Pela Ema reserve, not a mining concession.

## Cited table

Deng & Kendall 2019 Table 1 listed oxides sum to **97.27**, not 100. The unpublished 2.73-point gap is dropped; listed masses are renormalized onto 1.0. Grade 0.001 kg listed-REO / kg clay (mid of Deng 0.05–0.2% REO). Recovery 0.85 (mid of Moldoveanu & Papangelakis 2013, 80–90%). Intensities per kg recovered listed REO from Deng Table 2 (southern China in-situ, 1 kg mixed HREO ~90% purity functional unit): (NH4)2SO4 7 kg/kg (4–10 mid), electricity 8.8 kWh/kg (4.3 injection + 4.5 calcination). Deng’s 90% purity is the LCI functional unit, not a diluent in the product stream.

| Item | Value | Quality | Source |
|---|---|---|---|
| NdPr sale | $48.30/kg | screening | USGS MCS 2026 NdPr oxide 99% min 2025e $69/kg × payability 0.70 (SX not modeled) |
| Other REO sale | $33.61/kg | screening | Longnan other-oxide basket (91.07 points; Tm value 0) × 0.70. Unrounded (4372.174/91.07)×0.70 = 33.606564… |
| Clay | $0.005/kg | screening | Soft ionic-clay mining ~$5/t. Not a contract. |
| Ammonium sulfate | $0.30/kg | screening | Fertilizer-grade ~$300/t. Not a contract. |
| CAPEX | 18250 $/(kg REO/day) | screening | ~$50k per annual tonne × 365/1000. Leach+precip+calcine **without SX**. Linear small-plant intensity. |
| Demand | ndpr-oxide 5e4 kg/y; other-reo 2e5 kg/y | screening | Regional ceilings, not world mine production. asia-china 2e6 / 1e7. Europe inherits base with inherit:me-levant. Not in MINERAL_DEMAND_KEYS. |
| Minaçu PV | E_d 4.24, E_y 1546.98 | cited | frozen `data/pvgis-minacu.json` (PVGIS-SARAH3, retrieved 2026-10-04) |
| Brazil CAPEX× | 1 | screening | `Goiás / Brazil` is unmapped → demand region `default` (inherit me-levant). No brazil region added; unmapped multiplier stays 1. |

## Demo cash (solved `createReeCase`, 365 d, CRF 8%/20 y)

100 kg recovered listed REO/day (NdPr 6.37 kg/day + other REO 93.63 kg/day). Clay 100/(0.001×0.85) kg/day; 700 kg/day (NH4)2SO4; 880 kWh/day on 211.7 kWp × 4.24 kWh/kWp·d with 2% margin. Electricity does not bind. No electricity purchase. Brazil CAPEX× 1 on leach island and solar. Sale is 2.33 t/y NdPr @ $48.30 plus 34.17 t/y mixed other-REO @ $33.61.

| Line | $/year |
|---|---:|
| Annual revenue | 1,260,941 |
| Feed purchases | 291,356 |
| Fixed O&M | 77,234 |
| Variable O&M | 1,825 |
| Annualized CAPEX | 207,442 |
| **Net cash (R − OPEX − annualized CAPEX)** | **683,084** |

Installed CAPEX ≈ $2.04 M (leach island $1.825 M, solar ≈ $0.212 M). Screening gate cash is **positive**. Honest: linear $50k/t-y on a 36.5 t/y plant is a cheap pilot intensity, and the Longnan heavy basket (Dy/Tb/Y) still pays after 70% payability. Not retuned to force a sign. Not a bankable offtake. Chinese in-situ is lower; a Western greenfield with water treatment is higher.

## Files

- `engine/model.js`, `engine/units.js`, `engine/footprint.js`, `engine/uncertainty.js`
- `data/ionic-clay-longnan.js`, `data/tea-screening.js`, `data/pvgis-minacu.json`
- `cases/ree.js`
- `js/flowsheet-app.js`, `index.html`
- `tests/catalog-ree.test.js` (new), `tests/flowsheet-ui.test.js`
- `README.md`

## Tests

`npm test`: **376 pass / 0 fail**. New file `tests/catalog-ree.test.js` has 4 tests. Palette order is `carbon < crust < ree < more`. Crust list unchanged (`mg-si`, `polysilicon`, `aluminium-smelter`). Dead Sea, NH3, silicon, and network cash tests untouched.

## Leftovers

- Solvent extraction / separated Nd, Pr, Dy, Tb metal or oxide prices not modeled (payability 0.70 stands in).
- Oxalic acid, NH4HCO3, and H2SO4 streams not modeled (second-order vs Dy/Tb payability).
- Serra Verde / Pela Ema reserve model not used.
- Hard-rock bastnäsite/monazite route not added.
- PV module BOM not modeled.
- Offtake / freight not modeled.
- Brazil CAPEX× not added (unmapped multiplier stays 1).
- `sizeToProduct` has no REO product.
- **Maglut ARC-1** (chromatography separation, Long Beach) is REE-related but not modeled. Public evidence is pilot purity and a Ferro-Alloy Resources RNS (23 Sep 2026): ~91.4% separation recovery, ~90.25% oxalate+calcine recovery, >99% Nd/Pr/Dy/Tb/Y in two stages, >95% reagent recycle claimed. No public kWh/kg, resin life, or $/kg CAPEX — relative “10× / 20× vs SX” claims are not an absolute intensity. Do not invent a block. Next innovative REE tranche only when those intensities exist.
- **Solugen** is not an REE route (enzymatic / bio oxidation to H2O2 and organic acids). Next catalog tranche: bio-chemical / alternative process, not this REE file.

## Tip

Feat `5adcb36`, docs `050270c` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `050270c`). `npm test` 376 pass / 0 fail before the docs note.
