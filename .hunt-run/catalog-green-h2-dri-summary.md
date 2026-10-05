# CATALOG-GREEN-H2-DRI (Mejillones screening H₂-DRI from on-site SWRO+PEM)

Screening shaft DRI at Mejillones where H₂ comes from on-site SWRO + PEM electrolyzer (air/sun/seawater abundance path) instead of purchased industrial H₂. Purchased hematite feed stays. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced: **cash−**. Existing Si/Al/BOM/REE/Maglut/urea/NH₃/H₂-DRI (purchased) packs and prices were not retuned. MECH undo/pump/blower untouched except the flowsheet-ui script list. `cases/h2-dri.js` unmodified. Network still Dead Sea + Almería. Not Midrex, not EAF, not bankable, not a green-steel premium.

## Chemistry

Already in the engine (`hydrogen-dri`). Per mol Fe:

0.5 Fe₂O₃ + 1.5 H₂ → Fe + 1.5 H₂O

Activity = kg Fe / day. Default SEC **0.7 kWh/kg Fe** is shaft-furnace electricity only. On-site H₂ is PEM at unit default **52 kWh/kg H₂**; SWRO plant SEC **3.5 kWh/m³** product, recovery 0.45.

Mass check with model molar masses: Fe₂O₃ 159.687, Fe 55.845, H₂ 2.01588, H₂O 18.01528. Per 1000 kg Fe/day:

| Stream | kg/day | Notes |
|---|---:|---|
| Fe product | 1000 | setpoint / DRI capacity |
| Fe₂O₃ purchased | 1501.22 | stoich 1430.00 × FEED_MARGIN 1.05 |
| H₂ (electrolyzer activity) | 54.1467 | stoich; **no** purchase margin |
| Electrolyzer water | 483.89 | H₂ × M(H₂O)/M(H₂) |
| SWRO product | 0.50809 m³ | water/1000 × 1.05 |
| Seawater feed | 1.1291 m³ / 1157.3 kg | product / 0.45 × 1025 kg/m³ |

Electricity 3517.40 kWh/day = 54.1467×52 + 0.50809×3.5 + 1000×0.7. Electrolyzer is **2816 kWh/day (80%)** of the plant load. solarKWp = 3517.40 / 5.27 × 1.02 = **680.79 kWp**. Array output on the electricity-source is solarKWp × 5.27.

Seawater stream is Millero-scaled multi-ion from `data/atacama-pacific-seawater.js` (ρ 1.025 kg/L, S=34.9), not a NaCl cartoon.

## Cited TEA table

Reused existing packs/prices. Nothing retuned.

| Item | Value | Basis |
|---|---:|---|
| Sale `steel` | $0.40/kg | Mid of recent HBI/DRI iron ~$350–450/t. Screening, not a Platts HBI contract. No green-steel premium. |
| Sale `oxygen` | $0.05/kg | Industrial O₂ screening. Electrolyzer O₂ sold. |
| Cost `iron-ore` | $0.10/kg | USGS MCS iron ore ~$80–120/t mid. Hematite / Fe₂O₃ feed. Not a mine contract. |
| Cost `seawater` | $0.001/kg | Existing seawater-intake screening. Not an intake tariff. |
| Cost `hydrogen-feed` | $2.00/kg | **Unused** in this case (stays for purchased `cases/h2-dri.js`). |
| Pack `hydrogen-dri` | 800 $/(kg Fe/day) | Existing small-shaft pack. Chile CAPEX× 1.05 → $840/(kg Fe/day). |
| Pack `electrolyzer` | 3250 $/(kg H₂/day) | Existing DOE/NREL PEM $/kW band. Chile × 1.05. Life 10 y. |
| Pack `swro` | 1500 $/(m³/day) | Existing Ghaffour/Voutchkov family. Chile × 1.05. |
| Pack `solar-pv` | 1000 $/kWp | NREL ATB family; Chile × 1.05 (no solar TIC overlay for chile-atacama). |
| PVGIS Mejillones | E_d 5.27, E_y 1923.52 | Frozen `data/pvgis-mejillones.json` totals.fixed, retrieved 2026-09-14. Coords −23.1, −70.448. |
| Seawater assay | S=34.9 g/kg, ρ=1.025 | Frozen `data/atacama-pacific-seawater.js`; Millero S=35 × 34.9/35. Basin typical, not a Mejillones intake permit. |

Evidence URLs are the existing USGS iron-ore / iron-and-steel, World Bank pink sheet, IEA GHR 2024, DOE electrolysis, Millero 2008, WOA 2023, PVGIS-ERA5, Ghaffour 2013, Voutchkov 2018, NREL PEM FY24. Chile CAPEX× 1.05 applies to DRI island, electrolyzer, SWRO, and solar.

## Demo cash (solved `createGreenH2DriCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y; electrolyzer life 10 y)

1000 kg Fe/day at Mejillones (−23.1, −70.448). On-site SWRO+PEM H₂, purchased hematite, O₂ sold, brine / waterReject / DRI water vented. Sign is **cash−** at these screening intensities; not retuned.

| Line | $/year |
|---|---:|
| Annual revenue (365 t Fe @ $0.40 + 157 t O₂ @ $0.05) | 153,843 |
| Feed purchases (ore $0.10/kg on consumed stoich + seawater $0.001/kg) | 52,608 |
| Fixed O&M | 52,783 |
| Variable O&M | 11,543 |
| Annual operating cost | 116,934 |
| Annualized CAPEX | 177,264 |
| Installed CAPEX | 1,740,403 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−140,355** |

Exact solved lines: `annualRevenue` 153842.8431372549; `annualOperatingCost` 116933.64707427443; `annualizedCapex` 177263.8945339889; `annualNetCash` −140354.69847100842; `installedCapex` 1740403.046553248.

Installed CAPEX split: DRI island 840,000 = 800 × 1.05 × 1000; solar 714,827 = 1000 × 1.05 × 680.79 kWp; electrolyzer 184,775 = 3250 × 1.05 × 54.147; SWRO 800 = 1500 × 1.05 × 0.508. At this 1000 kg Fe/day scale the DRI island and PV array are the largest installed lines; electrolyzer 52 kWh/kg dominates **energy**. Electrolyzer 10-year life raises its annualized share vs 20-year process packs. Screening, not bankable.

DRI activity 1000 kg/day (within 1%). Electrolyzer / SWRO / DRI not electricity-limited. Maglut cash ≈ 1299 (±5). Purchased `createH2DriCase`, Mejillones `createSiliconCase`, and Walvis `createUreaCase` still finite.

## Files

- `cases/green-h2-dri.js` (`createGreenH2DriCase`; site `chile-mejillones-green-h2-dri`)
- `js/flowsheet-app.js` (`loadGreenH2Dri`, OVERVIEW_CASES, UNIT_META sourceNote mentions purchased vs green path)
- `index.html` (Fuels · screening cash− option + script tag next to h2-dri.js)
- `tests/catalog-green-h2-dri.test.js`
- `tests/flowsheet-ui.test.js` (script list + Overview load)
- `README.md` (one short green SWRO+PEM line under Hydrogen DRI)
- `.hunt-run/catalog-green-h2-dri-summary.md`

Not edited: `cases/h2-dri.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower, Network.

## Tests

`npm test`: **429 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Purchased H₂-DRI still has `hydrogen-feed` and no electrolyzer. Mejillones silicon and Walvis urea remain finite. Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened.

## Leftovers

- EAF melt shop / liquid steel finishing not modeled (product is DRI Fe).
- `sizeToProduct` steel alias not added.
- FT liquids not in this tranche.
- Purchased `cases/h2-dri.js` unchanged (grey/blue H₂ purchase demo stays).
- No chlor-alkali, ASU, battery, DAC, or Network plant for this case.
- World-scale Midrex CAPEX (cheaper than the small-plant 800 intensity) not a second pack.
- Intake/outfall remain screening assumptions, not permits.

## Tip

Feat `39781da` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `39781da`). `npm test` 429 pass / 0 fail. Prior checkout tip `d92fcd4`.
