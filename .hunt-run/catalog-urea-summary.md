# CATALOG-UREA (Walvis screening urea from purchased NH₃+CO₂)

Screening fertilizer upgrade: purchased NH₃ + purchased industrial CO₂ → urea at the Walvis Bay map point. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Existing NH₃ / Maglut / REE-SX / Si/Al/BOM / Bioforge packs and prices were not retuned. MECH undo/pump/blower untouched. Maglut / Minaçu / peer-SX / Mejillones silicon / Dead Sea cases unmodified. Not a Stamicarbon quote, not a full urea melt/granulation plant, not FT/olefins, not the green-NH₃ electrolyzer path.

## Chemistry

Overall screening stoichiometry (ammonium-carbamate intermediate skipped):

2 NH₃ + CO₂ → CO(NH₂)₂ + H₂O

Substance `Urea`: `{ elements: { C: 1, H: 4, N: 2, O: 1 }, molarMassG: 60.0553, charge: 0 }`.

Mass check with model molar masses: 2×17.03052 + 44.0095 = 78.07054 g; 60.0553 + 18.01528 = 78.07058 g. Element balances close on C, H, N, O.

Per 1000 kg urea/day: NH₃ = 1000 × 2 × 17.03052 / 60.0553 = **567.16 kg/day**; CO₂ = 1000 × 44.0095 / 60.0553 = **732.82 kg/day**.

Unit `urea` via `reaction({})`. Activity = kg urea/day. Ports: ammonia + carbonDioxide + electricity in; urea + water out. Default SEC **0.8 kWh/kg urea** is an electricity-as-total-energy proxy for a steam-heavy plant (real urea is heat-dominated). Not a Stamicarbon SEC. Not carbamate recycle. Not granulation. Not bankable.

## Cited TEA table

| Item | Value | Basis |
|---|---:|---|
| Sale `urea` | $0.40/kg | Mid of recent fertilizer urea ~$350–450/t. Screening, not a Black Sea / Middle East contract. |
| Pack `urea` | 1200 $/(kg urea/day) | ≈ $330k per annual tonne × 365/1000 rounded. Small-plant urea island OOM; world-scale is cheaper; linear intensity; not a Stamicarbon/Saipem quote. fixedOm 4%, variableOm 0.03, life 20 y. |
| Demand `urea` | 5e7 kg/y | Screening regional ceiling. asia-china **5e8**. Other regions inherit me-levant. Not in MINERAL_DEMAND_KEYS. In FUEL_CHEM_DEMAND_KEYS. |
| Cost `ammonia-feed` | $0.45/kg | Purchase at fertilizer NH₃ screening; mirrors the existing ammonia sale price. Ammonia pack/price untouched. |
| Cost `co2-feed` | $0.05/kg | Screening industrial CO₂. Not DAC full chain. No existing `costs.co2`. |

Evidence:

- IEA Ammonia Technology Roadmap (ammonia/fertilizer family): https://www.iea.org/reports/ammonia-technology-roadmap
- USGS MCS 2025 nitrogen (fixed): https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-nitrogen.pdf
- World Bank commodity markets / pink sheet (urea family context): https://www.worldbank.org/en/research/commodity-markets
- IEA DAC 2022 (family contrast only for industrial CO₂ vs DAC): https://www.iea.org/reports/direct-air-capture-2022/executive-summary

Southern Africa CAPEX× 0.95 applies to the urea island and solar-pv. Frozen Walvis PVGIS-ERA5 totals.fixed E_d **5.48** (`data/pvgis-walvis-bay.json`). Solar sized to 1000×0.8 / 5.48 × 1.02 = 148.91 kWp. No electricity purchase. Grid unverified.

## Demo cash (solved `createUreaCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

1000 kg urea/day at Walvis Bay (−22.957, 14.505). Purchased NH₃+CO₂. Water byproduct vented. Sign is **cash−** at these screening intensities; not retuned.

| Line | $/year |
|---|---:|
| Annual revenue | 146,000 |
| Feed purchases (NH₃ $0.45/kg + CO₂ $0.05/kg) | 106,530 |
| Fixed O&M | 48,578 |
| Variable O&M | 10,950 |
| Annual operating cost | 166,058 |
| Annualized CAPEX | 130,520 |
| Installed CAPEX | 1,281,460 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−150,578** |

Exact solved lines: `annualRevenue` 145999.99999999997; `annualOperatingCost` 166058.2368323521; `annualizedCapex` 130519.51664957896; `annualNetCash` −150577.75348193108; `installedCapex` 1281459.8540145985 (urea island 1,140,000 = 1200 × 0.95 × 1000; solar 141,459.85). Screening, not bankable.

Green ammonia `createGreenAmmoniaCase` still loads with finite `annualNetCash`. Maglut cash ≈ 1299 (±5).

## Files

- `engine/model.js` (substance `Urea`)
- `engine/units.js` (unit `urea`)
- `engine/footprint.js` (pad 3 m²/(kg urea/h), range [1, 8], floor 30 m², screening)
- `data/tea-screening.js` (sale, pack, demand, ammonia-feed, co2-feed only; ammonia pack/price untouched)
- `cases/urea.js` (Walvis purchased-feed demo; `green-ammonia.js` untouched)
- `js/flowsheet-app.js` (Fuels palette after ammonia, UNIT_META, Overview loader, purchased ammonia preset, port labels, pack-on-place)
- `index.html` (Overview option + script tag)
- `tests/catalog-urea.test.js`
- `tests/flowsheet-ui.test.js` (palette list includes urea)
- `README.md` (short urea line under fuels/fertilizer)
- `.hunt-run/catalog-urea-summary.md`

## Tests

`npm test`: **407 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Green ammonia path unchanged and finite. Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened.

## Leftovers

- Carbamate recycle / stripping loop not modeled (overall stoich only).
- Granulation / prilling / urea melt finishing not modeled.
- Green-NH₃ → urea integration (Walvis electrolyzer NH₃ feeding this island) not wired; the two demos stay separate.
- FT / olefins not in this tranche.
- `sizeToProduct` urea alias not added.
- Heat-dominated steam SEC (vs electricity-as-total-energy proxy 0.8 kWh/kg) not split into a heat port.
- World-scale urea CAPEX (cheaper than the small-plant 1200 intensity) not a second pack.

## Tip

Feat SHA pending deploy. Pages URL pending. Prior checkout tip `d44729c`.
