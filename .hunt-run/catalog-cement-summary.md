# CATALOG-CEMENT (Mejillones screening grey cement / clinker from limestone+clay)

Thin screening TEA for dry-process grey **clinker** as a Portland-cement (CEM I) proxy at the frozen-PV Mejillones map point. Purchased limestone + clay/silica (SiO₂ kiln-feed proxy) + on-site PV → PortlandCement; process CO₂ vented. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced: **cash+** at cheap USGS stone feeds vs mill cement $0.16/kg and a modest $60 pack. Existing packs/prices were not retuned (limestone $0.02, silica-sand $0.04, soda-ash $0.15, gypsum $0.02, float-glass 300 / $0.45, urea 1200, H₂-DRI 800, Ti-Kroll 8000, Maglut). MECH undo/pump/blower untouched. Network, Maglut, urea, green-urea, and float-glass **cases** not edited. Not a wet kiln, not blended CEM II/III, not CCUS, not a quarry, not bankable. Gypsum ~4–5% omitted (YAGNI). Size-to-target skipped this tranche.

Gate **PASS**. Citable mass close (IPCC 0.52 t process CO₂ / t clinker), CAPEX intensity from published dry-process grey plant TIC/capacity → $/(kg/day) peer band, labeled energy proxy (IEA ~3.4 GJ/t clinker thermal + ~100 kWh/t cement electricity as electricity-as-total-energy; real kiln is heat-dominated), cited feeds and USGS mill sale.

## Gate

| # | Need | Result |
|---|---|---|
| 1 | Mass balance: limestone (+ optional clay/SiO2/iron) → clinker or Portland cement that closes with existing/addable substances. Label clinker vs cement honestly | **PASS** — IPCC 0.52 kg process CO₂/kg clinker → limestone 1.183 kg CaCO₃ + clay/SiO₂ 0.337 kg → 1.000 kg product + 0.520 kg CO₂. Product is clinker sold at USGS portland mill value, labeled as such. Gypsum omitted |
| 2 | CAPEX intensity from published kiln/plant TIC/capacity → $/(kg clinker-or-cement/day) peer band. Prefer dry-process grey. Equipment-only without TIC = FAIL. Multi-product without cited split = FAIL unless a peer band of several plants converges | **PASS** — dry-process grey integrated/clinker TICs cluster ~$32–79/(kg/day); industry greenfield $120–250/t-y → $44–91. Screening mid **$60**. India+CPP and EPC-only KHD excluded |
| 3 | Energy SEC (thermal GJ/t + electricity kWh/t; electricity-as-total-energy OK if labeled; kiln is heat-dominated) | **PASS** — IEA ~3.4–3.5 GJ/t clinker thermal + GCCA/IEA ~102–105 kWh/t cement electricity → **1.05 kWh/kg** electricity-as-total-energy, labeled |
| 4 | Cited feed cost (limestone already $0.02/kg) and product sale (USGS cement / regional mid). Do not retune unrelated packs | **PASS** — limestone stays $0.02; new `kiln-clay` $0.02 (crushed-stone family, not kaolin, not silica-sand); sale `prices.cement` $0.16 USGS mill 2025e $160/t |

## Chemistry

Bayer/float-glass-style custom kg/kg evaluator `cementKiln` (not a mol reaction, not Bogue C₃S/C₂S/C₃A/C₄AF). IPCC 2006 Vol. 3 Ch. 2 default 0.52 t process CO₂ / t clinker (65% CaO + 2% CKD). Limestone 1.183 kg/kg = 0.52 × CaCO₃/CO₂ (100.0868/44.0095). Clay/silica 0.337 kg/kg is the non-carbonate remainder so 1 kg product closes (1.183 + 0.337 − 0.520 = 1.000). BREF ~1.57 t raw / t clinker is wet-raw including moisture/dust — screening is dry close. Clay port is SiO₂ as shale/clay/silica kiln feed, not kaolinite dehydroxylation.

| Stream | kg / kg product | Port / substance |
|---|---:|---|
| Limestone | 1.183 | `limestone` / CaCO₃ |
| Clay / silica | 0.337 | `clay` / SiO₂ |
| **in** | **1.520** | |
| Portland cement (clinker proxy) | 1.000 | `cement` / PortlandCement (1 mol ≡ 1 kg) |
| Process CO₂ | 0.520 | `carbonDioxide` / CO₂ |
| **out** | **1.520** | |

Gypsum ~4–5% (EN 197-1 CEM I) omitted. Product is **clinker**; sale is USGS mill portland/blended $0.16/kg, not a clinker export quote. Fuel-carbon CO₂ is not emitted because energy is the electricity proxy. Extra feed mol > 1e-12 throws. Pure substance required. No wasteHeat, no iron-ore port (YAGNI; SiO₂ clay proxy carries the non-carbonate).

Activity = kg cement / day. Default SEC **1.05 kWh/kg** (`electricityKWhPerKg`) is IEA ~3.4 GJ/t clinker (0.944 kWh/kg) + ~102 kWh/t cement electricity. Real kiln is heat-dominated.

Per 1000 kg cement/day (consumed, no margin): limestone 1183 kg, clay 337 kg, electricity 1050 kWh, CO₂ 520 kg. Demo source streams apply FEED_MARGIN **1.05**; economics charge consumed stoich.

Substance added: `PortlandCement` (elements {Ca:1}, molarMassG 1000). Distinct from CaCO₃ limestone feed.

## Cited TEA table

Add-only. Limestone $0.02, silica-sand $0.04, soda-ash $0.15, gypsum $0.02, float-glass pack/sale **untouched**.

| Item | Value | Basis |
|---|---:|---|
| Sale `cement` | $0.16/kg | USGS MCS 2026 cement mill unit value 2025e $160/t. Portland, blended, and masonry mill value f.o.b. plant; 2021–24 prints $127 / $139 / $152 / $160. Screening grey cement, not bagged retail and not a clinker export contract |
| Cost `limestone` | $0.02/kg | Existing USGS MCS 2026 crushed stone 2025e $18.50/t. **Not retuned** |
| Cost `kiln-clay` | $0.02/kg | **New.** Same bulk-quarry family as crushed stone. Not kaolin, not glass-sand $0.04, not a retune of limestone |
| Pack `cement` | 60 $/(kg cement/day) | $/(kg/day) = 0.365 × TIC $M / Mtpa. Published dry-process grey plants cluster ~$32–79; industry greenfield $120–250/t-y clinker → $44–91. Screening mid $60. Band 35/60/90. fixedOm 4%, variableOm 0.03, life 20 y, scaleExponent null |
| Demand `cement` | 5e8 kg/y | Screening regional ceiling 500 kt/y. asia-china **5e9**. Other regions inherit me-levant. Not in MINERAL_DEMAND_KEYS / FUEL_CHEM_DEMAND_KEYS |
| Pack `solar-pv` | 1000 $/kWp | NREL ATB family; Chile × 1.05 |
| PVGIS Mejillones | E_d 5.27, E_y 1923.52 | Frozen `data/pvgis-mejillones.json` totals.fixed. Coords −23.1, −70.448 |

CAPEX peer points (dry-process grey; TIC/capacity):

| Plant | TIC | Capacity | $/(kg/day) |
|---|---:|---:|---:|
| Dugongo Nacala | $192M | 2.2 Mtpa cement | 32 |
| Samarkand Cement | $313M | 3 Mtpa | 38 |
| PPC Riebeeck | $159M | 1.5 Mtpa | 39 (brownfield) |
| Uganda (industry table) | ~$150/t-y | — | 55 |
| Bamburi Matuga | $250M | 1.6 Mtpa clinker | 57 |
| Cemex Solid Antipolo | $235M then $323M | 1.5 Mtpa | 57–79 |
| Cemtech Kenya | ~$170/t-y | — | 62 |
| Dugong Matutuíne | $330M | 1.8 Mtpa | 67 |
| Industry greenfield band | $120–250 / t-y clinker | — | 44–91 |

Excluded: India plants bundled with 40–80 MW captive power; EPC-only KHD equipment contracts without TIC.

Evidence:

- IPCC 2006 Guidelines Vol. 3 Ch. 2: https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/3_Volume3/V3_2_Ch2_Mineral_Industry.pdf
- IEA Cement (archived): https://web.archive.org/web/20230528230323/https://www.iea.org/reports/cement
- ECRA Technology Papers 2022: https://api.ecra-online.org/fileadmin/files/tp/ECRA_Technology_Papers_2022.pdf
- IEA-ETSAP cement brief: https://iea-etsap.org/E-TechDS/PDF/I03_cement_June_2010_GS-gct.pdf
- USGS MCS 2026 cement: https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-cement.pdf
- USGS MCS 2026 crushed stone: https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-stone-crushed.pdf
- Industry greenfield $120–250/t-y: https://www.cementequipment.org/cement-technical-package/package-tools/76038938-capex-of-cement-companies/
- Cemex Solid 1.5 Mtpa $235–323M: https://mb.com.ph/2022/02/12/solid-cement-to-pursue-323-m-expansion/
- Samarkand Cement 3 Mt/yr US$313m: https://www.globalcement.com/news/item/16382-china-energy-international-group-samarkand-cement-installs-kiln-at-upcoming-samarkand-cement-plant
- Dugong Cimentos 1.8 Mt/yr US$330m: https://www.globalcement.com/news/11756-dugong-cimentos-announces-upcoming-1-8mt-yr-integrated-cement-plant-in-mozambique

Chile CAPEX× 1.05 applies to the cement island and solar-pv. Solar sized to 1000 × 1.05 / 5.27 × 1.02 = **203.226 kWp**. No electricity purchase. Grid unverified. Process CO₂ vented, no credit. Rights: limestonePurchase + clayPurchase assumed; gridImport unverified.

## Demo cash (solved `createCementCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

1000 kg cement/day at Mejillones (−23.1, −70.448). Purchased limestone + kiln-clay. On-site PV. CO₂ vented. Sign is **cash+** at these screening intensities (cheap stone vs mill cement ASP and a modest $60 pack); not retuned to force cash−.

| Line | $/year |
|---|---:|
| Annual revenue (365 t cement @ $0.16) | 58,400 |
| Feed purchases (limestone $0.02 + kiln-clay $0.02 on consumed stoich) | 11,096 |
| Fixed O&M | 6,585 |
| Variable O&M | 10,950 |
| Annual operating cost | 28,631 |
| Annualized CAPEX | 28,151 |
| Installed CAPEX | 276,387 |
| **Net cash (R − OPEX − annualized CAPEX)** | **+1,619** |

Exact solved lines: `annualRevenue` 58400; `annualOperatingCost` 28630.516129032258; `annualizedCapex` 28150.636296669494; `annualNetCash` 1618.8475742982482; `installedCapex` 276387.0967741936. Breakdown: `sourcePurchases` 11096; `fixedOM` 6584.5161290322585; `variableOM` 10950.

Installed CAPEX split: kiln 63,000 = 60 × 1.05 × 1000; solar 213,387 = 1000 × 1.05 × 203.226 kWp. Screening, not bankable.

Cement activity 1000 kg/day. Not electricity-limited. Maglut cash ≈ 1299 (±5) — solved `1298.91`. Mejillones `createFloatGlassCase` / `createH2DriCase` / `createUreaCase` still finite; float-glass sale still $0.45.

## Files

- `engine/model.js` (`PortlandCement`)
- `engine/units.js` (`cementKiln` evaluator + `UNITS.cement`)
- `data/tea-screening.js` (sale `cement`, cost `kiln-clay`, pack `cement`, demand `cement`; limestone and other packs/prices untouched)
- `cases/cement.js` (`createCementCase`; site `chile-mejillones-cement`)
- `engine/footprint.js` (pad 4 m²/(kg cement/h), range [1, 12], floor 40 m², screening)
- `engine/uncertainty.js` (`cement: 'screening'`)
- `js/flowsheet-app.js` (Crust palette after float-glass, UNIT_META, Overview loader, presets, furnace profile)
- `index.html` (Materials option after float-glass + script tag)
- `tests/catalog-cement.test.js`
- `tests/flowsheet-ui.test.js` (palette lists cement after float-glass)
- `tests/catalog-sial.test.js`, `tests/catalog-bayer.test.js`, `tests/catalog-ree.test.js`, `tests/catalog-bom-pv.test.js`, `tests/catalog-polysi.test.js`, `tests/catalog-h2-dri.test.js`, `tests/catalog-ti-kroll.test.js`, `tests/catalog-float-glass.test.js` (Crust list assertions)
- `README.md` (## Cement / clinker)
- `.hunt-run/catalog-cement-summary.md`

## Tests

`npm test`: **498 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Mejillones float-glass, H₂-DRI, and Walvis urea remain finite. Unrelated packs/prices untouched. Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened. Network still Dead Sea + Almería + Walvis + Long Beach.

## Leftovers

- Gypsum / CEM I finish mill omitted (YAGNI). Product is clinker sold at mill portland value, labeled.
- Iron-ore / alumina kiln correctives omitted; SiO₂ clay proxy carries the non-carbonate.
- Fuel-carbon process CO₂ is not emitted; remainder is two-feed dry mass close (0.52 kg/kg = IPCC process default).
- World-scale kiln CAPEX (cheaper than the small-plant $60 intensity) is not a second pack.
- Size-to-target skipped this tranche (float-glass size was a later catalog-size).
- No intake-pump / gas-blower on this path (MECH untouched).
- Not added to the network demo.
- Not a wet-process kiln, not blended CEM II/III, not CCUS, not a quarry concession.

## Tip

Feat on `main` after this file. Pages: https://akarshgopal.github.io/ultimat-sim/. `npm test` 498 pass / 0 fail. Prior checkout tip `712a560`.
