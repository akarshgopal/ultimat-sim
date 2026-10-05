# CATALOG-GREEN-FT (Mejillones screening diesel from on-site SWRO+PEM H₂)

Screening FT liquids at Mejillones where hydrogen comes from on-site SWRO + PEM instead of purchased industrial H₂. Purchased industrial CO₂ is the carbon source (not DAC). Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced: **cash−**, and more cash− than purchased-H₂ FT (−$130k/y). Existing FT liquids 443 / diesel / MeOH / ethylene/MTO / Maglut / Si/Al / urea / NH₃ / H₂-DRI / green-H₂-DRI / green-NH₃ / green-MTO / float glass / steel / Ti packs and prices were not retuned. MECH undo/pump/blower untouched. Network still Dead Sea + Almería. Not Sasol/Shell, not DAC, not a green e-diesel premium, not bankable.

Gate **PASS**. Purchased-H₂ `ft-liquids.js` already exists. Wiring SWRO+PEM → FT as one 1000 kg diesel/day plant is a new cash signal (electrolyzer + PV dominate installed CAPEX). Reused existing SEC/packs (ft-liquids 443, electrolyzer, swro, solar-pv, co2-feed, diesel sale, oxygen sale). Purchased industrial CO₂ (green-mto/urea/FT pattern), not DAC — coastal methanol remains the DAC demo. Stoich mass-balances through existing `ft-liquids` unit.

## Chemistry

Already in the engine.

12 CO₂ + 37 H₂ → C₁₂H₂₆ + 24 H₂O

Activity = kg diesel / day on `ft-liquids`. Default FT SEC **0.22 kWh/kg** is IEA 0.018 GJe/GJliquid × 43.0 MJ/kg (electricity of the FT island; real FT is heat/H₂ dominated). On-site H₂ is PEM at unit default **52 kWh/kg H₂**; SWRO plant SEC **3.5 kWh/m³** product, recovery 0.45.

Mass check with model molar masses: C₁₂H₂₆ 170.33484, H₂ 2.01588, CO₂ 44.0095, H₂O 18.01528. Per 1000 kg diesel/day:

| Stream | kg/day | Notes |
|---|---:|---|
| Diesel product | 1000 | setpoint / FT capacity |
| H₂ (electrolyzer activity) | 437.89 | stoich 37 mol / mol C₁₂H₂₆; **no** purchase margin |
| CO₂ consumed | 3100.45 | stoich 12 mol / mol C₁₂H₂₆; source sized × FEED_MARGIN 1.05 |
| Electrolyzer water | 3913.26 | H₂ × M(H₂O)/M(H₂) |
| SWRO product | 4.109 m³ | water/1000 × 1.05 |
| Seawater feed | 9.131 m³ / 9359 kg | product / 0.45 × 1025 kg/m³ |
| Electrolyzer O₂ sold | 3475.38 | 0.5 mol O₂ / mol H₂ |

Electricity 23004.6 kWh/day = 437.89×52 + 4.109×3.5 + 1000×0.22. Electrolyzer is **22770 kWh/day (99%)** of the plant load. solarKWp = 23004.6 / 5.27 × 1.02 = **4452.49 kWp**. Array output on the electricity-source is solarKWp × 5.27.

Seawater stream is Millero-scaled multi-ion from `data/atacama-pacific-seawater.js` (ρ 1.025 kg/L, S=34.9), not a NaCl cartoon.

## Cited TEA table

Reused existing packs/prices. Nothing retuned.

| Item | Value | Basis |
|---|---:|---|
| Sale `diesel` | $0.90/kg | Mid of commodity diesel/gasoil ~$0.70–1.10/kg. Screening, not a contract. No green e-diesel premium. |
| Sale `oxygen` | $0.05/kg | Industrial O₂ screening. Electrolyzer O₂ sold. |
| Cost `co2-feed` | $0.05/kg | Existing industrial CO₂ purchase. Not DAC full chain. |
| Cost `seawater` | $0.001/kg | Existing seawater-intake screening. Not an intake tariff. |
| Cost `hydrogen-feed` | $2.00/kg | **Unused** in this case (stays for purchased `cases/ft-liquids.js`). |
| Pack `ft-liquids` | 443 $/(kg liquid/day) | Existing IEA 890 USD/kW_liquid × IPCC 43.0 MJ/kg. Chile CAPEX× 1.05 → $465.15/(kg/day). |
| Pack `electrolyzer` | 3250 $/(kg H₂/day) | Existing DOE/NREL PEM $/kW band. Chile × 1.05. Life 10 y. |
| Pack `swro` | 1500 $/(m³/day) | Existing Ghaffour/Voutchkov family. Chile × 1.05. |
| Pack `solar-pv` | 1000 $/kWp | NREL ATB family; Chile × 1.05 (no solar TIC overlay for chile-atacama). |
| PVGIS Mejillones | E_d 5.27, E_y 1923.52 | Frozen `data/pvgis-mejillones.json` totals.fixed, retrieved 2026-09-14. Coords −23.1, −70.448. |
| Seawater assay | S=34.9 g/kg, ρ=1.025 | Frozen `data/atacama-pacific-seawater.js`; Millero S=35 × 34.9/35. Basin typical, not a Mejillones intake permit. |

Chile CAPEX× 1.05 applies to FT island, electrolyzer, SWRO, and solar.

## Demo cash (solved `createGreenFtCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y; electrolyzer life 10 y)

1000 kg diesel/day at Mejillones (−23.1, −70.448). On-site SWRO+PEM H₂, purchased industrial CO₂, O₂ sold, FT water and brine vented. Sign is **cash−** at these screening intensities; not retuned. More cash− than purchased-H₂ FT because electrolyzer + PV dominate installed CAPEX.

| Line | $/year |
|---|---:|
| Annual revenue (365 t diesel @ $0.90 + 1269 t O₂ @ $0.05) | 391,926 |
| Feed purchases (CO₂ $0.05/kg on consumed stoich + seawater $0.001/kg) | 59,999 |
| Fixed O&M | 152,679 |
| Variable O&M | 15,745 |
| Annual operating cost | 228,423 |
| Annualized CAPEX | 676,404 |
| Installed CAPEX | 6,641,032 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−512,901** |

Exact solved lines: `annualRevenue` 391925.63183198456; `annualOperatingCost` 228422.92168766633; `annualizedCapex` 676403.8005642485; `annualNetCash` −512901.09041993023; `installedCapex` 6641032.220898725.

Installed CAPEX split: solar 4,675,118 = 1000 × 1.05 × 4452.49 kWp; electrolyzer 1,494,292 = 3250 × 1.05 × 437.89; FT island 465,150 = 443 × 1.05 × 1000; SWRO 6,472 = 1500 × 1.05 × 4.109. Electrolyzer 10-year life raises its annualized share vs 20-year process packs. Screening, not bankable.

Contrast purchased-H₂ `createFtLiquidsCase`: R 328,500; OPEX 406,649; annCAPEX 51,930; **net −130,079**. Green path drops H₂ purchases and adds O₂ revenue, but electrolyzer + PV CAPEX more than offsets that.

FT activity 1000 kg/day (within 1%). Electrolyzer / SWRO / FT not electricity-limited. Maglut cash ≈ 1299 (±5). Purchased `createFtLiquidsCase`, `createGreenMtoCase`, and Walvis `createUreaCase` still finite. Packs/prices untouched.

## Files

- `cases/green-ft.js` (`createGreenFtCase`; site `chile-mejillones-green-ft`)
- `js/flowsheet-app.js` (`loadGreenFt`, OVERVIEW_CASES; ft-liquids sourceNote mentions purchased vs green path)
- `index.html` (Fuels · screening cash− option after ft-liquids / green-mto + script tag)
- `tests/catalog-green-ft.test.js`
- `tests/flowsheet-ui.test.js` (script list + Overview load)
- `README.md` (one short green SWRO+PEM H₂→FT line)
- `.hunt-run/catalog-green-ft-summary.md`

Not edited: `cases/ft-liquids.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower, Network. Palette Fuels list unchanged (reuse ft-liquids).

## Tests

`npm test`: **463 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Purchased FT still has `hydrogen-feed` and no electrolyzer. Green-MTO / urea paths unchanged and finite. Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened.

## Leftovers

- Full FT slate (naphtha, wax, LPG) not modeled (n=12 paraffin diesel proxy only).
- DAC-fed green FT stack not wired; industrial CO₂ purchase is the carbon source (coastal methanol.js stays the DAC demo).
- Heat-dominated FT steam/RWGS SEC not split into a heat port.
- `sizeToProduct` diesel still resizes the purchased-H₂ FT island, not this green stack.
- No intake-pump / gas-blower on this path (MECH untouched).
- Not a Sasol/Shell licensed flowsheet.
