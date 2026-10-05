# CATALOG-CU-EW (Mejillones screening SX-EW copper cathode from purchased PLS)

Thin screening TEA for **heap-leach SX-EW** cathode at the frozen-PV Mejillones map point. Purchased contained copper in pregnant leach solution + on-site PV → LME-grade cathode. Heap leach, mine, and pad are out of scope. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced: **cash−** at a 96.5% PLS payable vs LME cathode $9.70/kg and a $750 SX-EW pack. Existing packs/prices/SEC were not retuned (cement 60 / $0.16, float-glass 300 / $0.45, soda-ash $0.15, Maglut). MECH undo/pump/blower untouched. Network, Maglut, cement, and float-glass **cases** not edited. Not a smelter, not electrorefining, not a heap concession, not bankable. O₂ / raffinate sale omitted (YAGNI). Size-to-target skipped.

Gate **PASS**. Citable Faraday mass close (1.00 kg contained Cu / kg cathode), CAPEX intensity from published SX-EW plant line-item TIC/capacity → $/(kg Cu/day) peer band, labeled EW electricity SEC, cited PLS payable and USGS LME sale.

## Gate

| # | Need | Result |
|---|---|---|
| 1 | Mass balance: feed (Cu in PLS / concentrate / anode) → cathode (+ acid, raffinate, slime) that closes with existing or addable substances. No invented chemistry | **PASS** — Faraday Cu²⁺ + 2e⁻ → Cu; anode H₂O → ½O₂ + 2H⁺; overall CuSO₄ + H₂O → Cu + H₂SO₄ + ½O₂. Screening mass 1.00 kg contained Cu in PLS per kg cathode. Acid regenerates to raffinate (inventory). O₂ unlabeled |
| 2 | CAPEX intensity from published plant TIC / nameplate → $/(kg Cu/day) peer band. Prefer SX-EW-only line items. Mine/heap/whole-project without a cited SX-EW split = FAIL unless several SX-EW-only figures converge. Equipment-only = FAIL | **PASS** — SX-EW plant line items with t/y cathode cluster ~$630–880. Screening mid **$750**. Florence remaining $67M (sunk) and whole-project TICs excluded |
| 3 | Energy SEC (EW ~kWh/kg Cu cathode; electricity-as-total-energy OK if labeled) | **PASS** — industrial EW+SX island **2.2 kWh/kg** (Jenkins ~1.9–2.0; industrial 1.8–2.5; Marimaca SX/TF/EW 2.28; Minerals 2025 ~2.2 MWh/t). Electricity-dominated, labeled |
| 4 | Cited feed cost (PLS/ore payable basis or concentrate TC/RC) and cathode sale (USGS MCS 2026 / LME mid). Do not retune unrelated packs | **PASS** — sale `copper-cathode` $9.70 USGS LME grade A cash 2025e 440 ¢/lb; feed `pls-copper` $9.36 = 96.5% payable of that band (ore/PLS payable, not a TC/RC smelter ticket). Unrelated packs untouched |

## Chemistry

Cement-style custom kg/kg evaluator `copperEw` (not a mol reaction). Faraday plates contained Cu 1:1. Extra feed mol > 1e-12 throws. Pure Cu required. PLS feed is liquid Cu; cathode is solid Cu. Same substance, different phase. Raffinate Cu is electrolyte inventory, not a second product. Acid credit omitted (YAGNI; regenerated H₂SO₄ returns to the heap, which is out of scope).

| Stream | kg / kg product | Port / substance |
|---|---:|---|
| Contained Cu in PLS | 1.000 | `pls` / Cu (liquid) |
| **in** | **1.000** | |
| LME-grade cathode | 1.000 | `cathode` / Cu (solid) |
| **out** | **1.000** | |

Activity = kg cathode / day. Default SEC **2.2 kWh/kg** (`electricityKWhPerKg`) is industrial EW+SX island electricity.

Per 1000 kg cathode/day (consumed, no margin): PLS Cu 1000 kg, electricity 2200 kWh. Demo source stream applies FEED_MARGIN **1.05**; economics charge consumed stoich.

Substance added: `Cu` (elements {Cu:1}, molarMassG 63.546). Shared by PLS feed and cathode product.

## Cited TEA table

Add-only. Cement 60 / $0.16, float-glass 300 / $0.45, soda-ash $0.15 **untouched**.

| Item | Value | Basis |
|---|---:|---|
| Sale `copper-cathode` | $9.70/kg | USGS MCS 2026 copper LME grade A cash 2025e 440 ¢/lb → $4.40/lb → $9.70/kg. Chile/LME cathode, not US producer COMEX+premium 490 ¢/lb |
| Cost `pls-copper` | $9.36/kg | **New.** 96.5% of USGS LME 2025e (standard contained-metal payable, 1% min deduction) on contained Cu in PLS. Ore/PLS payable basis — not a TC/RC smelter ticket |
| Pack `copper-ew` | 750 $/(kg Cu/day) | $/(kg/day) = TIC / (tpy × 1000/365). Published SX-EW plant line items cluster ~$630–880. Screening mid $750. Band 600/750/900. fixedOm 4%, variableOm 0.03, life 20 y, scaleExponent null |
| Demand `copper-cathode` | 5e7 kg/y | Screening regional ceiling 50 kt/y (one Marimaca-class nameplate). asia-china **5e8**. Other regions inherit me-levant. Not in MINERAL_DEMAND_KEYS / FUEL_CHEM_DEMAND_KEYS |
| Pack `solar-pv` | 1000 $/kWp | NREL ATB family; Chile × 1.05 |
| PVGIS Mejillones | E_d 5.27, E_y 1923.52 | Frozen `data/pvgis-mejillones.json` totals.fixed. Coords −23.1, −70.448 |

CAPEX peer points (SX-EW plant line item; TIC/capacity):

| Plant | SX-EW scope | TIC | Capacity | $/(kg/day) |
|---|---|---:|---:|---:|
| Ivanhoe Electric Santa Cruz S-K 1300 PFS 2026 | SX/EW | $132M | 76 kt/y design | 634 |
| Gunnison Open Pit PEA 2024 (M3) | SX-EW plant (SX + tank farm + EW + reagents) | $145M | 175 Mlb/y (79.4 kt) | 667 |
| Gunnison 2026 PEA | SX+TF+EW | $170M | 175 Mlb/y | 782 |
| Southern Copper El Pilar S-K 1300 FS 2022 | SX $24.2M + tank farm $11.7M + EW $39.8M | $75.6M | 31,752 t/y | 869 |
| Marimaca Oxide NI 43-101 DFS 2025 | SX/TF/EW | $121M | 50 kt/y | 883 |

Excluded: Florence remaining $67M (sunk equipment); whole-project / mine+heap TICs without a cited SX-EW split; 1985 911Metallurgist equipment quotes.

Evidence:

- USGS MCS 2026 copper: https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-copper.pdf
- Ivanhoe Electric Santa Cruz S-K 1300 PFS 2026: https://www.sec.gov/Archives/edgar/data/1879016/000110465926109810/tm2625798d1_ex99-1.htm
- Marimaca Oxide Deposit NI 43-101 DFS 2025: https://marimaca.com/wp-content/uploads/2026/07/25-10-09-Marimaca-Oxide-Deposit-NI-43-101-Technical-Report-Feasibility-Study_FINAL.pdf
- Southern Copper El Pilar S-K 1300 FS 2022: https://www.sec.gov/Archives/edgar/data/1001838/000155837022002995/scco-20211231ex9692df9bd.pdf
- Gunnison Open Pit PEA 2024 (M3): https://minedocs.com/27/Gunnison-PEA-11012024.pdf
- Copper electrowinning practice: https://pressbooks.bccampus.ca/hydrometallurgy/chapter/copper-electrowinning-practice/

Chile CAPEX× 1.05 applies to the SX-EW island and solar-pv. Solar sized to 1000 × 2.2 / 5.27 × 1.02 = **425.806 kWp**. No electricity purchase. Grid unverified. Rights: plsPurchase assumed; gridImport unverified.

## Demo cash (solved `createCuEwCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

1000 kg cathode/day at Mejillones (−23.1, −70.448). Purchased PLS copper. On-site PV. Sign is **cash−** at these screening intensities (96.5% payable vs LME cathode and a $750 pack); not retuned to force cash+.

| Line | $/year |
|---|---:|
| Annual revenue (365 t cathode @ $9.70) | 3,540,500 |
| Feed purchases (PLS Cu $9.36 on consumed stoich) | 3,416,400 |
| Fixed O&M | 40,016 |
| Variable O&M | 10,950 |
| Annual operating cost | 3,467,366 |
| Annualized CAPEX | 125,746 |
| Installed CAPEX | 1,234,597 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−52,613** |

Exact solved lines: `annualRevenue` 3540499.999999999; `annualOperatingCost` 3467366.129032257; `annualizedCapex` 125746.4084575494; `annualNetCash` -52612.53748980735; `installedCapex` 1234596.7741935486. Breakdown: `sourcePurchases` 3416399.999999999; `fixedOM` 40016.12903225807; `variableOM` 10949.999999999998.

Installed CAPEX split: tankhouse 787,500 = 750 × 1.05 × 1000; solar 447,097 = 1000 × 1.05 × 425.806 kWp. Screening, not bankable.

Cathode activity 1000 kg/day. Not electricity-limited. Maglut cash ≈ 1299 (±5) — solved `1298.91`. Mejillones `createCementCase` / `createFloatGlassCase` / `createH2DriCase` / `createUreaCase` still finite; cement sale still $0.16.

## Files

- `engine/model.js` (`Cu`)
- `engine/units.js` (`copperEw` evaluator + `UNITS['copper-ew']`)
- `data/tea-screening.js` (sale `copper-cathode`, cost `pls-copper`, pack `copper-ew`, demand `copper-cathode`; other packs/prices untouched)
- `cases/cu-ew.js` (`createCuEwCase`; site `chile-mejillones-cu-ew`)
- `engine/footprint.js` (pad 4 m²/(kg Cu/h), range [1, 12], floor 40 m², screening)
- `engine/uncertainty.js` (`copper-ew: 'screening'`)
- `js/flowsheet-app.js` (Crust palette after titanium-kroll, UNIT_META, Overview loader, presets, cell profile)
- `index.html` (Materials option after cement + script tag)
- `tests/catalog-cu-ew.test.js`
- `tests/flowsheet-ui.test.js` (palette lists copper-ew)
- `tests/catalog-sial.test.js`, `tests/catalog-bayer.test.js`, `tests/catalog-ree.test.js`, `tests/catalog-bom-pv.test.js`, `tests/catalog-polysi.test.js`, `tests/catalog-h2-dri.test.js`, `tests/catalog-ti-kroll.test.js`, `tests/catalog-float-glass.test.js`, `tests/catalog-cement.test.js` (Crust list assertions)
- `README.md` (## Copper SX-EW)
- `.hunt-run/catalog-cu-ew-summary.md`

## Tests

`npm test`: **508 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Mejillones cement, float-glass, H₂-DRI, and Walvis urea remain finite. Unrelated packs/prices untouched. Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened. Network still Dead Sea + Almería + Walvis + Long Beach.

## Leftovers

- Heap leach / mine / pad out of scope (YAGNI). Island is purchased-PLS SX-EW.
- Raffinate and regenerated acid are inventory, not a sale.
- O₂ vent unlabeled (YAGNI; no O₂ port).
- Size-to-target skipped (not a trivial cement/float-glass alias).
- World-scale tankhouse CAPEX (inside the $630–880 cluster) is not a second pack.
- No intake-pump / gas-blower on this path (MECH untouched).
- Not added to the network demo.
- Not a smelter, not electrorefining of anodes, not a heap concession.

## Tip

Feat pending on `main`. Prior checkout tip `0605721`.
