# CATALOG-GREEN-MTO (Mejillones screening ethylene from on-site SWRO+PEM MeOH)

Screening methanol-to-olefins at Mejillones where methanol comes from on-site SWRO + PEM H₂ + purchased industrial CO₂ instead of purchased MeOH. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced: **cash−**, and more cash− than purchased-MeOH MTO (−$178k/y). Existing MeOH / ethylene / MTO / FT / Maglut / Si/Al / urea / NH₃ / H₂-DRI / green-H₂-DRI / green-NH₃ / steel packs and prices were not retuned. MECH undo/pump/blower untouched. Network still Dead Sea + Almería. Not UOP, not DAC, not a green-ethylene premium, not FT, not bankable.

Gate **PASS**. Coastal `methanol.js` is a tiny DAC green-ish MeOH demo; `mto.js` is purchased-MeOH MTO. Wiring MeOH synthesis → MTO as one 1000 kg ethylene/day plant is a new cash signal. Reused existing SEC/packs (methanol, mto, electrolyzer, swro, solar-pv, co2-feed). Purchased industrial CO₂ (urea/FT pattern), not DAC — coastal methanol remains the DAC demo. Stoich mass-balances through existing `methanol` + `mto` units.

## Chemistry

Already in the engine.

CO₂ + 3 H₂ → CH₃OH + H₂O

2 CH₃OH → C₂H₄ + 2 H₂O

Activity = kg ethylene / day on `mto`; methanol activity = exact MTO stoich. Default MTO SEC **4 kWh/kg** is electricity-as-total-energy. Methanol synthesis **0.5 kWh/kg**. On-site H₂ is PEM at unit default **52 kWh/kg H₂**; SWRO plant SEC **3.5 kWh/m³** product, recovery 0.45.

Mass check with model molar masses: CH₃OH 32.04186, C₂H₄ 28.0532, H₂ 2.01588, CO₂ 44.0095, H₂O 18.01528. Per 1000 kg ethylene/day:

| Stream | kg/day | Notes |
|---|---:|---|
| Ethylene product | 1000 | setpoint / MTO capacity |
| MeOH (methanol activity) | 2284.36 | stoich 2 mol / mol C₂H₄; **no** purchase margin |
| H₂ (electrolyzer activity) | 431.16 | stoich 3 mol / mol MeOH |
| CO₂ consumed | 3137.57 | stoich 1 mol / mol MeOH; source sized × FEED_MARGIN 1.05 |
| Electrolyzer water | 3853.10 | H₂ × M(H₂O)/M(H₂) |
| SWRO product | 4.046 m³ | water/1000 × 1.05 |
| Seawater feed | 8.991 m³ / 9215 kg | product / 0.45 × 1025 kg/m³ |
| Electrolyzer O₂ sold | 3421.94 | 0.5 mol O₂ / mol H₂ |

Electricity 27576.4 kWh/day = 431.16×52 + 4.046×3.5 + 2284.36×0.5 + 1000×4. Electrolyzer is **22420 kWh/day (81%)** of the plant load. solarKWp = 27576.4 / 5.27 × 1.02 = **5337.37 kWp**. Array output on the electricity-source is solarKWp × 5.27.

Seawater stream is Millero-scaled multi-ion from `data/atacama-pacific-seawater.js` (ρ 1.025 kg/L, S=34.9), not a NaCl cartoon.

## Cited TEA table

Reused existing packs/prices. Nothing retuned.

| Item | Value | Basis |
|---|---:|---|
| Sale `ethylene` | $0.80/kg | Mid of recent commodity ethylene ~$0.50–1.10/kg. Screening, not a contract. No green-ethylene premium. |
| Sale `oxygen` | $0.05/kg | Industrial O₂ screening. Electrolyzer O₂ sold. |
| Cost `co2-feed` | $0.05/kg | Existing industrial CO₂ purchase. Not DAC full chain. |
| Cost `seawater` | $0.001/kg | Existing seawater-intake screening. Not an intake tariff. |
| Cost `methanol-feed` | $0.40/kg | **Unused** in this case (stays for purchased `cases/mto.js`). |
| Pack `mto` | 183 $/(kg olefin/day) | Existing Chen 2022 conversion. Chile CAPEX× 1.05 → $192.15/(kg/day). |
| Pack `methanol` | 200 $/(kg MeOH/day) | Existing IRENA e-methanol synthesis-island pack. Chile × 1.05. Excludes electrolyzer and DAC. |
| Pack `electrolyzer` | 3250 $/(kg H₂/day) | Existing DOE/NREL PEM $/kW band. Chile × 1.05. Life 10 y. |
| Pack `swro` | 1500 $/(m³/day) | Existing Ghaffour/Voutchkov family. Chile × 1.05. |
| Pack `solar-pv` | 1000 $/kWp | NREL ATB family; Chile × 1.05 (no solar TIC overlay for chile-atacama). |
| PVGIS Mejillones | E_d 5.27, E_y 1923.52 | Frozen `data/pvgis-mejillones.json` totals.fixed, retrieved 2026-09-14. Coords −23.1, −70.448. |
| Seawater assay | S=34.9 g/kg, ρ=1.025 | Frozen `data/atacama-pacific-seawater.js`; Millero S=35 × 34.9/35. Basin typical, not a Mejillones intake permit. |

Chile CAPEX× 1.05 applies to MTO island, methanol island, electrolyzer, SWRO, and solar.

## Demo cash (solved `createGreenMtoCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y; electrolyzer life 10 y)

1000 kg ethylene/day at Mejillones (−23.1, −70.448). On-site SWRO+PEM H₂, purchased industrial CO₂, O₂ sold, MeOH/MTO water and brine vented. Sign is **cash−** at these screening intensities; not retuned. More cash− than purchased-MeOH MTO because electrolyzer + PV dominate installed CAPEX.

| Line | $/year |
|---|---:|
| Annual revenue (365 t ethylene @ $0.80 + 1249 t O₂ @ $0.05) | 354,450 |
| Feed purchases (CO₂ $0.05/kg on consumed stoich + seawater $0.001/kg) | 60,624 |
| Fixed O&M | 173,156 |
| Variable O&M | 32,347 |
| Annual operating cost | 266,127 |
| Annualized CAPEX | 789,741 |
| Installed CAPEX | 7,753,793 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−701,417** |

Exact solved lines: `annualRevenue` 354450.42633282475; `annualOperatingCost` 266126.86802930885; `annualizedCapex` 789740.9201817545; `annualNetCash` −701417.3618782386; `installedCapex` 7753792.768039112.

Installed CAPEX split: solar 5,604,238 = 1000 × 1.05 × 5337.37 kWp; electrolyzer 1,471,317 = 3250 × 1.05 × 431.16; methanol island 479,716 = 200 × 1.05 × 2284.36; MTO island 192,150 = 183 × 1.05 × 1000; SWRO 6,372 = 1500 × 1.05 × 4.046. Electrolyzer 10-year life raises its annualized share vs 20-year process packs. Screening, not bankable.

MTO activity 1000 kg/day (within 1%). Electrolyzer / SWRO / methanol / MTO not electricity-limited. Maglut cash ≈ 1299 (±5). Purchased `createMtoCase`, `createFtLiquidsCase`, and Walvis `createUreaCase` still finite.

## Files

- `cases/green-mto.js` (`createGreenMtoCase`; site `chile-mejillones-green-mto`)
- `js/flowsheet-app.js` (`loadGreenMto`, OVERVIEW_CASES; mto sourceNote mentions purchased vs green path)
- `index.html` (Fuels · screening cash− option after mto / ft-liquids + script tag)
- `tests/catalog-green-mto.test.js`
- `tests/flowsheet-ui.test.js` (script list + Overview load)
- `README.md` (one short green SWRO+PEM MeOH→MTO line)
- `.hunt-run/catalog-green-mto-summary.md`

Not edited: `cases/mto.js`, `cases/methanol.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower, Network. Palette Fuels list unchanged (reuse methanol + mto).

## Tests

`npm test`: **452 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Purchased MTO still has `methanol-feed` and no electrolyzer. FT liquids / urea paths unchanged and finite. Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened.

## Leftovers

- Full MTO olefin slate (propylene, C4) not modeled (ethylene proxy only).
- DAC-fed green MeOH stack not wired; industrial CO₂ purchase is the carbon source (coastal methanol.js stays the DAC demo).
- Heat-dominated MTO steam/quench/refrigeration SEC not split into a heat port.
- `sizeToProduct` ethylene still resizes the purchased-MeOH MTO island, not this green stack.
- No intake-pump / gas-blower on this path (MECH untouched).
- Not a UOP/Honeywell licensed flowsheet.
