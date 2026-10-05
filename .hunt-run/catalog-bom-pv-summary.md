# CATALOG-BOM-PV (screening abundance-TEA tranche)

PV module BOM on the existing Mejillones poly-Si + Al path. Screening honesty, not bankable. Cash is capital-inclusive (R − OPEX − annualized CAPEX). **Not a cell fab.**

## What landed

- Substances `Ag`, `EVA` (vinyl-acetate-monomer mass proxy, not a polymer chain), `FloatGlass` (soda-lime screening proxy, distinct key from quartz `SiO2`), `PVmodule` (1 mol ≡ 1 kg finished module mass).
- Converter `pv-module`: custom evaluator `pvModuleAssembly`. Locked Fraunhofer ISE Photovoltaics Report 2021 mass shares on 11.6 kg/m² as kg/kg module: poly-Si 0.0273, Ag 0.0003, FloatGlass 0.6745, EVA 0.0669, Al 0.1273 (sum 0.8963). Remaining ~10.4% (backsheet, J-box, cables, silicones, cell Al/PbO paste extras) omitted — no filler substances. Activity = kg module/day. SEC 0.05 kWh/kg assembly/laminator screening. No heatKWhPerKg / no wasteHeat. Extra feed mol > 1e-12 throws.
- TEA add-only: sale `pv-module` $2.85/kg screening; cost silver $1221.73/kg cited USGS MCS 2026 $38/troy oz; float-glass $0.45/kg screening; eva-encapsulant $2.00/kg screening; pack 700 $/(kg module/day), 4% fixed O&M, 0.03 variable, 20 y. Demand 5e6 kg/y (asia-china 5e8). Not in `MINERAL_DEMAND_KEYS`. No Ag/glass/EVA demand (cost-only, same as quartz/alumina). Existing MG-Si / poly-Si / Al / REE / Bioforge / Maglut / NH₃ packs and prices **untouched**.
- Demo `cases/silicon.js` extended (same Mejillones site, same Overview id `silicon-alumina`): quartz → MG-Si (28.665 kg/day) → poly-Si (27.3) + purchased Ag/glass/EVA + Hall–Héroult Al (127.3) → module sale (1000 kg/day). Poly-Si and Al sale sinks removed. Frozen PVGIS-ERA5 E_d 5.27. Electricity 28.665×12 + 27.3×65 + 127.3×14 + 1000×0.05 kWh/day; solarKWp = that / 5.27 × 1.02. Chile CAPEX× 1.05 on furnaces / poly / module / solar. Not a cell fab, not TOPCon, not bankable.
- Palette **Crust** (`mg-si`, `polysilicon`, `aluminium-smelter`, `pv-module`) after Carbon, not default-open. UNIT_META label “PV module (BOM)”, glyph PV. Purchased presets `silver`, `float-glass`, `eva`.
- Campus pad: 4 m²/(kg module/h), range 2–8, floor 40 m², screening.

## Cited numbers

| Item | Value | Quality | Source |
|---|---|---|---|
| Module sale | $2.85/kg | screening | $0.15/W × 1000 / 52.7 kg/kWp; 52.7 = 11.6 kg/m² ÷ 0.220 kW/m². ASP mid of ~$0.10–0.20/W. Not a Tier-1 contract. Fraunhofer Photovoltaics Report + NREL solar industry update family. |
| Ag paste | $1221.73/kg | cited | USGS MCS 2026 silver bullion 2025e $38/troy oz × (1/0.0311034768) = 1221.73 $/kg. https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-silver.pdf |
| Float glass | $0.45/kg | screening | Solar float/AR ~$2.50–4.00/m² mid $3.25 / 7.8242 kg/m² (0.6745×11.6) ≈ $0.42 → $0.45. Not Guardian/Xinyi. |
| EVA encapsulant | $2.00/kg | screening | Solar EVA film ~$1.8–2.5/kg mid. Not STR/Mitsui. |
| Module CAPEX | 700 $/(kg module/day) | screening | ~$0.10/W × 1000 / 52.7 ≈ $1.90/kg-y × 365 ≈ 693 → 700. Linear small-plant; not a GW fab quote. |
| Module SEC | 0.05 kWh/kg | screening | Assembly/laminator order. Not a cell fab. |
| BOM shares | 0.0273 / 0.0003 / 0.6745 / 0.0669 / 0.1273 | screening | Fraunhofer ISE Photovoltaics Report 2021 on 11.6 kg/m². Sum 0.8963; ~10.4% omitted. https://www.ise.fraunhofer.de/content/dam/ise/de/documents/publications/studies/Photovoltaics-Report.pdf |
| Demand | 5e6 kg/y (asia-china 5e8) | screening | ~95 MWp/y at 52.7 kg/kWp. Not world production. |
| Mejillones PV | E_d 5.27, E_y 1923.52 | cited | frozen `data/pvgis-mejillones.json` |
| Chile CAPEX× | 1.05 | screening | existing regional multiplier; not retuned. |

MG-Si metal $3.97/kg, Al ingot $2.87/kg, poly-Si $6/kg, MG-Si pack 3000, Al pack 1800, poly pack 31755, SAF 12 kWh/kg, Siemens 65 kWh/kg, Hall–Héroult 14 kWh/kg: **unchanged**.

## Demo cash (solved `createSiliconCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Module 1000 kg/day, poly-Si 27.3, MG-Si 28.665, Al 127.3; electricity does not bind (~765 kWp × 5.27 kWh/kWp·d with 2% margin). Chile CAPEX× 1.05 on solar + MG-Si + poly + Al + module. Sale is 365 t module @ $2.85. Poly-Si and Al are consumed, not sold.

| Line | $/year |
|---|---:|
| Annual revenue | 1,040,250 |
| Feed purchases | 344,694 |
| Fixed O&M | 94,339 |
| Variable O&M | 13,781 |
| Annual operating cost | 452,814 |
| Annualized CAPEX | 283,050 |
| **Net cash (R − OPEX − annualized CAPEX)** | **+304,386** |

Installed CAPEX ≈ $2.78 M (power $803 k; poly island $910 k at 31755×1.05; module line $735 k at 700×1.05; Al $241 k; MG-Si $90 k). Screening gate cash is **positive** at this campus because the Siemens island shrank from 1000 → 27.3 kg/day while module sale is 1000 kg/day × $2.85. Not retuned to force a sign. Not a bankable offtake. Not a GW fab.

Purchased: quartz $0.08, reductant $0.25, alumina $0.45, anode $0.50, silver $1221.73, float-glass $0.45, EVA $2.00. CO / CO₂ vents remain, no sale.

## Files

- `engine/model.js`, `engine/units.js`, `engine/footprint.js`, `engine/uncertainty.js`
- `data/tea-screening.js` (add only)
- `js/flowsheet-app.js`, `index.html`
- `cases/silicon.js` (extended; no second site)
- `tests/catalog-bom-pv.test.js` (new), `tests/catalog-polysi.test.js`, `tests/catalog-sial.test.js`, `tests/catalog-ree.test.js` (Crust list), `tests/flowsheet-ui.test.js`
- `README.md`

## Tests

`npm test`: **389 pass / 0 fail**. New file `tests/catalog-bom-pv.test.js` has 4 tests (unit BOM shares, TEA rows, Mejillones graph, palette/Overview). Polysi / sial case-level checks follow the module graph (poly 27.3, no poly/Al sale sinks). Crust list includes `pv-module` after `aluminium-smelter`.

## Leftovers

- Backsheet / J-box / cables / silicones / cell Al-PbO paste extras (~10.4% of module mass) not modeled.
- Cell fab / TOPCon / PERC process model not modeled.
- Copper interconnect not modeled.
- Bayer alumina refining not modeled.
- Offtake / freight not modeled.
- `sizeToProduct` has no module / poly / Al / Si product alias.
- Pump / undo / blower part-load untouched; MG-Si / poly / Al / REE / Bioforge / Maglut / NH₃ packs and USGS silicon-metal price not retuned.

## Tip

Feat SHA and Pages URL after deploy.
