# CATALOG-GREEN-UREA (Walvis screening urea from on-site Haber NH₃)

Screening urea at Walvis Bay where ammonia comes from on-site SWRO + PEM + ASU + Haber instead of purchased fertilizer NH₃. Purchased industrial CO₂ is the carbon source (not DAC). Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced: **cash−**, and more cash− than purchased-NH₃ urea (−$151k/y). Existing urea / ammonia / Maglut / Si/Al / BOM / FT / MTO / H₂-DRI / green-H₂-DRI / green-MTO / green-FT / green-NH₃ / float-glass / titanium packs and prices were not retuned. MECH undo/pump/blower untouched. Network still Dead Sea + Almería. Not Stamicarbon, not DAC, not a green-urea premium, not bankable.

Gate **PASS**. Purchased-NH₃ `urea.js` and green-NH₃ `green-ammonia.js` already exist. Wiring Haber NH₃ → urea as one 1000 kg urea/day plant is a new cash signal (no NH₃ purchase; electrolyzer + PV + Haber dominate installed CAPEX). Reused existing SEC/packs (electrolyzer, swro, asu, ammonia, urea, solar-pv, oxygen sale, co2-feed, urea sale). Purchased industrial CO₂ (urea/green-mto pattern), not DAC. Stoich mass-balances through existing `ammonia` + `urea` units with model `SUBSTANCES` molarMassG. `cases/urea.js` and `cases/green-ammonia.js` were not edited.

## Chemistry

Already in the engine.

N₂ + 3 H₂ → 2 NH₃

2 NH₃ + CO₂ → CO(NH₂)₂ + H₂O

Activity = kg urea / day on `urea`. Haber NH₃ kg = 1000 × 2 × M(NH₃)/M(Urea). Default urea SEC **0.8 kWh/kg** is an electricity-as-total-energy proxy (real urea is heat-dominated). Haber **0.6 kWh/kg**. On-site H₂ is PEM at unit default **52 kWh/kg H₂**; ASU **0.25 kWh/kg N₂**; SWRO plant SEC **3.5 kWh/m³** product, recovery 0.45.

Mass check with model molar masses: Urea 60.0553, NH₃ 17.03052, CO₂ 44.0095, H₂ 2.01588, N₂ 28.0134, H₂O 18.01528. Per 1000 kg urea/day:

| Stream | kg/day | Notes |
|---|---:|---|
| Urea product | 1000 | setpoint / urea capacity |
| NH₃ (Haber activity) | 567.16 | stoich 2 mol / mol urea; **no** NH₃ purchase and **no** NH₃ sale |
| H₂ (electrolyzer activity) | 100.70 | stoich 1.5 mol / mol NH₃ |
| N₂ (ASU activity) | 466.46 | stoich 0.5 mol / mol NH₃ |
| CO₂ consumed | 732.82 | stoich 1 mol / mol urea; source sized × FEED_MARGIN 1.05 |
| Electrolyzer water | 899.93 | H₂ × M(H₂O)/M(H₂) |
| SWRO product | 0.945 m³ | water/1000 × 1.05 |
| Seawater feed | 2.100 m³ / 2152 kg | product / 0.45 × 1025 kg/m³ |
| Electrolyzer O₂ sold | 799.23 | 0.5 mol O₂ / mol H₂ |
| ASU O₂ sold | 138.54 | ASU oxygen recovery 0.95 |

Electricity 6496.7 kWh/day = 100.70×52 + 466.46×0.25 + 567.16×0.6 + 0.945×3.5 + 1000×0.8. Electrolyzer is **5236 kWh/day (81%)** of the plant load. solarKWp = 6496.7 / 5.48 × 1.02 = **1209.24 kWp**. Array output on the electricity-source is solarKWp × 5.48. No electricity purchase. Grid unverified.

Seawater stream is Millero-scaled multi-ion from `data/benguela-atlantic-seawater.js` (ρ 1.025 kg/L, S=35.2), not a NaCl cartoon.

## Cited TEA table

Reused existing packs/prices. Nothing retuned.

| Item | Value | Basis |
|---|---:|---|
| Sale `urea` | $0.40/kg | Mid of recent fertilizer urea ~$350–450/t. Screening, not a Black Sea / Middle East contract. No green-urea premium. |
| Sale `oxygen` | $0.05/kg | Industrial O₂ screening. Electrolyzer O₂ and ASU O₂ sold. |
| Cost `co2-feed` | $0.05/kg | Existing industrial CO₂ purchase. Not DAC full chain. |
| Cost `seawater` | $0.001/kg | Existing seawater-intake screening. Not an intake tariff. |
| Cost `ammonia-feed` | $0.45/kg | **Unused** in this case (stays for purchased `cases/urea.js`). |
| Pack `urea` | 1200 $/(kg urea/day) | Existing small-plant urea island OOM. Southern Africa CAPEX× 0.95 → $1140/(kg/day). |
| Pack `ammonia` | 2000 $/(kg NH₃/day) | Existing small-plant Haber pack. Southern Africa × 0.95. |
| Pack `electrolyzer` | 3250 $/(kg H₂/day) | Existing DOE/NREL PEM $/kW band. Southern Africa × 0.95. Life 10 y. |
| Pack `asu` | 400 $/(kg N₂/day) | Existing ASU pack. Southern Africa × 0.95. |
| Pack `swro` | 1500 $/(m³/day) | Existing Ghaffour/Voutchkov family. Southern Africa × 0.95. |
| Pack `solar-pv` | 1000 $/kWp | NREL ATB family; Southern Africa × 0.95. |
| PVGIS Walvis Bay | E_d 5.48, E_y 2000.67 | Frozen `data/pvgis-walvis-bay.json` totals.fixed, retrieved 2026-09-21. Coords −22.957, 14.505. |
| Seawater assay | S=35.2 g/kg, ρ=1.025 | Frozen `data/benguela-atlantic-seawater.js`; Millero S=35 × 35.2/35. Basin typical, not a Namport intake permit. |

Southern Africa CAPEX× 0.95 applies to urea island, Haber island, electrolyzer, ASU, SWRO, and solar.

## Demo cash (solved `createGreenUreaCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y; electrolyzer life 10 y)

1000 kg urea/day at Walvis Bay (−22.957, 14.505). On-site SWRO+PEM H₂ + ASU N₂ → Haber NH₃, purchased industrial CO₂, O₂ sold, brine / ASU offgas / electrolyzer waterReject / urea water vented. Sign is **cash−** at these screening intensities; not retuned. More cash− than purchased-NH₃ urea because electrolyzer + PV + Haber CAPEX dominate.

| Line | $/year |
|---|---:|
| Annual revenue (365 t urea @ $0.40 + 342 t O₂ @ $0.05) | 163,114 |
| Feed purchases (CO₂ $0.05/kg on consumed stoich + seawater $0.001/kg) | 14,160 |
| Fixed O&M | 129,347 |
| Variable O&M | 25,809 |
| Annual operating cost | 169,315 |
| Annualized CAPEX | 392,732 |
| Installed CAPEX | 3,855,897 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−398,932** |

Exact solved lines: `annualRevenue` 163114.4346583289; `annualOperatingCost` 169315.04844140925; `annualizedCapex` 392731.6335218451; `annualNetCash` −398932.24730492546; `installedCapex` 3855897.069485829.

Installed CAPEX split: solar 1,148,774 = 1000 × 0.95 × 1209.24 kWp; Haber island 1,077,606 = 2000 × 0.95 × 567.16; urea island 1,140,000 = 1200 × 0.95 × 1000; electrolyzer 310,915 = 3250 × 0.95 × 100.70; ASU 177,255 = 400 × 0.95 × 466.46; SWRO 1,347 = 1500 × 0.95 × 0.945. Electrolyzer 10-year life raises its annualized share vs 20-year process packs. Screening, not bankable.

Contrast purchased-NH₃ `createUreaCase`: R 146,000; OPEX 166,058; annCAPEX 130,520; **net −150,578**. Green path drops NH₃ purchases and adds O₂ revenue, but electrolyzer + Haber + extra PV CAPEX more than offsets that.

Urea activity 1000 kg/day (within 1%). Electrolyzer / SWRO / ASU / Haber / urea not electricity-limited. Maglut cash ≈ 1299 (±5). Purchased `createUreaCase` and `createGreenAmmoniaCase` still finite and still load. Packs/prices untouched.

## Files

- `cases/green-urea.js` (`createGreenUreaCase`; site `namibia-walvis-bay-green-urea`)
- `js/flowsheet-app.js` (`loadGreenUrea`, OVERVIEW_CASES; urea sourceNote mentions purchased vs green path)
- `index.html` (Fuels · screening cash− option after urea / green-ammonia + script tag)
- `tests/catalog-green-urea.test.js`
- `tests/flowsheet-ui.test.js` (script list + Overview load)
- `README.md` (one short green SWRO+PEM Haber→urea line)
- `.hunt-run/catalog-green-urea-summary.md`

Not edited: `cases/urea.js`, `cases/green-ammonia.js`, `data/tea-screening.js`, `engine/units.js`, MECH undo/pump/blower, Network. Palette Fuels list unchanged (reuse ammonia + urea).

## Tests

`npm test`: **494 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Purchased urea still has `ammonia-feed` and no electrolyzer. Green-ammonia still loads and sells NH₃ (no urea block). Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened.

## Leftovers

- Carbamate recycle / stripping loop not modeled (overall stoich only).
- Granulation / prilling / urea melt finishing not modeled.
- DAC-fed green urea stack not wired; industrial CO₂ purchase is the carbon source (coastal methanol.js stays the DAC demo).
- Heat-dominated urea steam SEC not split into a heat port.
- `sizeToProduct` urea still resizes the purchased-NH₃ island, not this green stack.
- No intake-pump / gas-blower on this path (MECH untouched).
- Not a Stamicarbon/Saipem licensed flowsheet.

## Tip

Feat `00df808` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `00df808`). `npm test` 494 pass / 0 fail. Prior checkout tip `d24bdd4`.
