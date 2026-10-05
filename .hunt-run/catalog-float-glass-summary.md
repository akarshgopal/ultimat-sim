# CATALOG-FLOAT-GLASS (Mejillones screening float/solar glass from sand+soda+limestone)

Thin screening TEA for float/solar glass at the frozen-PV Mejillones map point. Purchased silica sand + soda ash + limestone (GfE dolomite folded into limestone) + on-site PV → glass; process CO₂ vented. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced: **cash+** at cheap USGS mineral feeds vs the existing $0.45/kg solar-glass screening sale. Existing packs/prices were not retuned (pv-module BOM glass purchase stays $0.45, MeOH, MTO, FT, Maglut, Si/Al, urea, NH₃, H₂-DRI, green paths, steel, Ti). MECH undo/pump/blower untouched. Network still Dead Sea + Almería. Not a tin-bath line, not Guardian/Xinyi, not a green premium, not bankable. Manufacture is **not** wired into `pv-module`.

Gate **PASS**. Citable stoich (GfE Table 1), CAPEX intensity (Burrows & Fthenakis 2015 TIC/capacity → $/(kg/day)), and labeled energy proxy (GfE 9.0 MJ/kg as electricity-as-total-energy; real float is heat-dominated).

## Chemistry

Bayer-style custom kg/kg evaluator `floatGlass` (not a mol reaction). GfE 2011 LCA Table 1 (25-site EU ~50% market):

| Feed | kg / kg glass | Port / substance |
|---|---:|---|
| Silica sand | 0.65 | `sand` / SiO₂ |
| Soda ash | 0.20 | `sodaAsh` / Na₂CO₃ |
| Limestone + dolomite | 0.21 | `limestone` / CaCO₃ (dolomite folded) |

Cullet / feldspar / sulfate skipped (YAGNI). Mass-close 1.06 → 1.0 glass + 0.06 kg CO₂ remainder. GfE 0.70 kg CO₂/kg includes fuel carbon, which is **not** emitted here because energy is the electricity proxy. Extra feed mol > 1e-12 throws. Pure substance required. No wasteHeat, no tin bath.

Activity = kg glass / day. Default SEC **2.5 kWh/kg** (`electricityKWhPerKg`) is GfE 9.0 MJ/kg (NG 6.1 + HFO 2.1 + grid 0.80) converted as electricity-as-total-energy. Schmitz ~9.2 GJ/t and Miserocchi 11.1 GJ/t sit in the same family.

Per 1000 kg glass/day (consumed, no margin): sand 650 kg, soda ash 200 kg, limestone 210 kg, electricity 2500 kWh, CO₂ 60 kg. Demo source streams apply FEED_MARGIN **1.05**; economics charge consumed stoich.

Substances added: `Na2CO3` (105.9883 g/mol), `CaCO3` (100.0868 g/mol). `FloatGlass` stays the existing SiO₂ mass proxy.

## Cited TEA table

Add-only. `costs['float-glass']` $0.45 **untouched** (PV-module purchased glass). Quartz $0.08 untouched.

| Item | Value | Basis |
|---|---:|---|
| Sale `float-glass` | $0.45/kg | Same solar AR screening band as the existing purchased-glass cost. Fraunhofer glass mass share 0.6745 × 11.6 kg/m²; ~$2.50–4.00/m² mid $3.25 ≈ $0.42/kg → round $0.45/kg. Not a Guardian/Xinyi quote. No green premium. |
| Cost `silica-sand` | $0.04/kg | USGS MCS 2026 industrial sand 2025e $36/t. Frac-weighted industrial average, not a glass-sand contract. |
| Cost `soda-ash` | $0.15/kg | USGS MCS 2026 soda ash 2025e $150/t f.o.b. mine/plant. Not a Solvay/trona contract. |
| Cost `limestone` | $0.02/kg | USGS MCS 2026 crushed stone 2025e $18.50/t. Carbonate-stone proxy for GfE limestone+dolomite; not chemical-lime ~$260/t. |
| Pack `float-glass` | 300 $/(kg glass/day) | Burrows & Fthenakis 2015: new Europe/NA plant $150–200M for a 500–700 t/day line → $214–400/(kg/day); mid ~$300. World-scale 1000 t/day cheaper (~$141–188). Linear small-plant intensity; not a Guardian/Xinyi quote. fixedOm 4%, variableOm 0.03, life 20 y. |
| Demand `float-glass` | 5e7 kg/y | Screening regional ceiling. asia-china **5e8**. Other regions inherit me-levant. Not in MINERAL_DEMAND_KEYS / FUEL_CHEM_DEMAND_KEYS. |
| Pack `solar-pv` | 1000 $/kWp | NREL ATB family; Chile × 1.05 (no solar TIC overlay for chile-atacama). |
| PVGIS Mejillones | E_d 5.27, E_y 1923.52 | Frozen `data/pvgis-mejillones.json` totals.fixed. Coords −23.1, −70.448. |

Evidence:

- Glass for Europe LCA of float glass (2011 Table 1 + 9.0 MJ/kg): https://glassforeurope.com/wp-content/uploads/2018/04/Life-Cycle-Assessment.pdf
- Burrows & Fthenakis 2015 Solar Energy Materials & Solar Cells (DOI 10.1016/j.solmat.2014.09.028): https://doi.org/10.1016/j.solmat.2014.09.028
- Fraunhofer ISE Photovoltaics Report: https://www.ise.fraunhofer.de/content/dam/ise/de/documents/publications/studies/Photovoltaics-Report.pdf
- USGS MCS 2026 industrial sand: https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-sand-industrial.pdf
- USGS MCS 2026 soda ash: https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-soda-ash.pdf
- USGS MCS 2026 crushed stone: https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-stone-crushed.pdf

Chile CAPEX× 1.05 applies to the float-glass island and solar-pv. Solar sized to 1000×2.5 / 5.27 × 1.02 = **483.871 kWp**. No electricity purchase. Grid unverified. Process CO₂ vented, no credit.

Existing `costs['float-glass']` stays **$0.45**. Packs pv-module 700, hydrogen-dri 800, aluminium-smelter 1800, quartz $0.08 untouched.

## Demo cash (solved `createFloatGlassCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

1000 kg glass/day at Mejillones (−23.1, −70.448). Purchased sand + soda + limestone. On-site PV. CO₂ vented. Sign is **cash+** at these screening intensities (cheap mineral feeds vs solar-glass ASP and a modest $300 pack); not retuned to force cash−.

| Line | $/year |
|---|---:|
| Annual revenue (365 t glass @ $0.45) | 164,250 |
| Feed purchases (sand $0.04 + soda $0.15 + limestone $0.02 on consumed stoich) | 21,973 |
| Fixed O&M | 22,277 |
| Variable O&M | 10,950 |
| Annual operating cost | 55,200 |
| Annualized CAPEX | 83,831 |
| Installed CAPEX | 823,065 |
| **Net cash (R − OPEX − annualized CAPEX)** | **+25,219** |

Exact solved lines: `annualRevenue` 164250.00000000003; `annualOperatingCost` 55200.41935483871; `annualizedCapex` 83830.9389716996; `annualNetCash` 25218.641673461723; `installedCapex` 823064.5161290322.

Installed CAPEX split: solar 508,065 = 1000 × 1.05 × 483.871 kWp; float-glass island 315,000 = 300 × 1.05 × 1000. Screening, not bankable.

Glass activity 1000 kg/day. Not electricity-limited. Maglut cash ≈ 1299 (±5) — solved `1298.91`. Mejillones `createH2DriCase` / `createSiliconCase` still finite; silicon purchased-glass cost still $0.45. Walvis urea still finite.

## Files

- `engine/model.js` (Na₂CO₃, CaCO₃)
- `engine/units.js` (`floatGlass` evaluator + `UNITS['float-glass']`)
- `data/tea-screening.js` (sale `float-glass`, costs `silica-sand` / `soda-ash` / `limestone`, pack `float-glass`, demand `float-glass`; `costs['float-glass']` and other packs/prices untouched)
- `cases/float-glass.js` (`createFloatGlassCase`; site `chile-mejillones-float-glass`)
- `engine/footprint.js` (pad 4 m²/(kg glass/h), range [1, 12], floor 40 m², screening)
- `engine/uncertainty.js` (`'float-glass': 'screening'`)
- `js/flowsheet-app.js` (Crust palette after aluminium-smelter, UNIT_META, Overview loader, presets, furnace profile)
- `index.html` (Materials option after silicon-alumina + script tag)
- `tests/catalog-float-glass.test.js`
- `tests/flowsheet-ui.test.js` (palette lists float-glass after aluminium-smelter)
- `tests/catalog-sial.test.js`, `tests/catalog-bayer.test.js`, `tests/catalog-ree.test.js`, `tests/catalog-bom-pv.test.js`, `tests/catalog-polysi.test.js`, `tests/catalog-h2-dri.test.js`, `tests/catalog-ti-kroll.test.js` (Crust list assertions)
- `README.md` (short float-glass line under Crustal silicon and aluminium)
- `.hunt-run/catalog-float-glass-summary.md`

## Tests

`npm test`: **456 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Mejillones H₂-DRI, silicon, and Walvis urea remain finite. PV-module purchased-glass cost still $0.45. Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened.

## Leftovers

- Tin-bath / annealing-lehr / SO₂ polish detail not modeled (YAGNI).
- Cullet, feldspar, salt cake omitted from GfE Table 1.
- Fuel-carbon process CO₂ (GfE 0.70 kg/kg) is not emitted; remainder is three-feed mass close (0.06 kg/kg).
- Manufacture not wired into `pv-module` (that chain still purchases glass at $0.45).
- World-scale float CAPEX (cheaper than the small-plant $300 intensity) is not a second pack.
- No intake-pump / gas-blower on this path (MECH untouched).
- Not a Guardian/Xinyi licensed flowsheet.

## Tip

Feat `d5a9dc0` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `d5a9dc0`). `npm test` 456 pass / 0 fail. Prior checkout tip `7df6040`.
