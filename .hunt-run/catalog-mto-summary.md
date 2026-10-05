# CATALOG-MTO (Mejillones screening ethylene from purchased methanol)

Screening methanol-to-olefins (ethylene proxy): purchased methanol → ethylene at the Mejillones map point. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced: **cash−**. Existing methanol / steel / Maglut / Si / Al / urea / H₂-DRI / green-H₂-DRI / green-NH₃ packs and prices were not retuned. MECH undo/pump/blower untouched. Network still Dead Sea + Almería. Not a UOP/Honeywell quote, not a full olefin slate, not FT liquids, not a green-MeOH stack.

Gate **PASS**. Public SEC + CAPEX peer band exists (Chen 2022 TCI/capacity; Sinopec Zhongyuan S-MTO total-energy). Numbers were not invented.

## Chemistry

Overall screening stoichiometry (SAPO-34 ethylene-maximizing proxy; propylene/C4 omitted):

2 CH₃OH → C₂H₄ + 2 H₂O

Substance `C2H4`: `{ elements: { C: 2, H: 4 }, molarMassG: 28.0532, charge: 0 }`. Verify: 2×12.0107 + 4×1.00794 = 28.05316.

Mass check with model molar masses: 2×32.04186 = 64.08372 g; 28.0532 + 2×18.01528 = 64.08376 g. Δ 4×10⁻⁵ kg/kmol. Element balances close on C, H, O.

Per 1000 kg ethylene/day: MeOH stoich = 1000 × 2 × 32.04186 / 28.0532 = **2284.36 kg/day**; purchased with FEED_MARGIN 1.05 = **2398.58 kg/day**. Water byproduct = 1000 × 2 × 18.01528 / 28.0532 = **1284.37 kg/day**.

Unit `mto` via `reaction({})`. Activity = kg ethylene/day. Ports: methanol + electricity in; ethylene + water out. Default SEC **4 kWh/kg ethylene** is an electricity-as-total-energy proxy of Sinopec S-MTO ~373 kgOE/t olefin (≈15.6 GJ/t ≈ 4.3 kWh/kg; screening 4). Real MTO is heat-dominated (quench, steam, refrigeration). Chen 2022 Table 9 compressor electricity is ~0.8 kWh/kg ethylene (electrical contrast, not the screening total-energy proxy). Not UOP. Not full olefin slate. Not FT. Not bankable.

## Cited TEA table

| Item | Value | Basis |
|---|---:|---|
| Sale `ethylene` | $0.80/kg | Mid of recent commodity ethylene ~$0.50–1.10/kg (USGC often lower, Asia/Europe contract higher). Screening, not a contract. |
| Cost `methanol-feed` | $0.40/kg | Purchase at screening MeOH; mirrors the existing methanol **sale** $0.40/kg. Methanol sale price was not changed. |
| Pack `mto` | 183 $/(kg olefin/day) | Chen 2022 Table 11 TCI $371.35 MM for 0.367 MM MTPA ethylene + 0.373 MM MTPA propylene. $371.35e6 / 740e6 kg/y × 365 = $183/(kg olefin/day). Linear small-plant OOM applied to ethylene-proxy activity; propylene/C4 omitted. Not a UOP/Honeywell quote. fixedOm 4%, variableOm 0.03, life 20 y. |
| Demand `ethylene` | 5e7 kg/y | Screening regional ceiling. asia-china **5e8**. Other regions inherit me-levant. In FUEL_CHEM_DEMAND_KEYS. Not in MINERAL_DEMAND_KEYS. |
| SEC proxy | 4 kWh/kg | Electricity-as-total-energy proxy of Sinopec Zhongyuan S-MTO 373.58 kgOE/t olefin. Real MTO is heat-dominated. Chen electrical ~0.8 kWh/kg ethylene is contrast only. |

Evidence:

- Chen, Hsieh, Chang, Ho 2022, J. Taiwan Inst. Chem. Eng. 130, 103893: https://doi.org/10.1016/j.jtice.2021.07.039
- Yokogawa — Sinopec Zhongyuan S-MTO 600 kt/y (capacity-family; total-energy SEC order): https://www.yokogawa.com/library/resources/references/stable-operation-and-proactive-maintenance-realized-at-new-coal-chemical-plant-in-china/
- Argus Ethylene and Derivatives sample (commodity-band context; screening mid, not a contract): https://www.argusmedia.com/-/media/project/argusmedia/mainsite/english/documents-and-files/sample-reports/argus-ethylene-and-derivatives.pdf
- IEA ethylene regional price / capacity-demand family (screening mid, not a contract): https://www.iea.org/data-and-statistics/charts/annual-ethylene-capacitydemand-growth-and-regional-price-developments-2015-2020
- IRENA Innovation Outlook: Renewable Methanol (purchase at screening MeOH $0.40/kg; sale unchanged): https://www.irena.org/publications/2021/Jan/Innovation-Outlook-Renewable-Methanol

Atacama/Chile CAPEX× 1.05 applies to the mto island and solar-pv. Frozen Mejillones PVGIS-ERA5 totals.fixed E_d **5.27** (`data/pvgis-mejillones.json`, retrieved 2026-09-14; E_y 1923.52). Solar sized to 1000 × 4 / 5.27 × 1.02 = **774.19 kWp**. No electricity purchase. Grid unverified. Rights: methanol purchase assumed; grid import unverified.

## Demo cash (solved `createMtoCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

1000 kg ethylene/day at Mejillones (−23.1, −70.448). Purchased methanol. Water byproduct vented. Sign is **cash−** at these screening intensities; not retuned. Feed purchases already exceed ethylene revenue before CAPEX ($0.40/kg MeOH × 2.284 kg MeOH/kg C₂H₄ consumed > $0.80/kg ethylene).

| Line | $/year |
|---|---:|
| Annual revenue (365 t ethylene @ $0.80) | 292,000 |
| Feed purchases (MeOH $0.40/kg on consumed stoich) | 333,517 |
| Fixed O&M | 23,170 |
| Variable O&M | 10,950 |
| Annual operating cost | 367,637 |
| Annualized CAPEX | 102,367 |
| Installed CAPEX | 1,005,053 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−178,004** |

Exact solved lines: `annualRevenue` 292000.00000000006; `annualOperatingCost` 367637.01411005727; `annualizedCapex` 102366.89103321984; `annualNetCash` −178003.90514327705; `installedCapex` 1005053.2258064518.

Installed CAPEX split: mto island 192,150 = 183 × 1.05 × 1000; solar 812,903 = 1000 × 1.05 × 774.19 kWp. Activity 1000 kg ethylene/day. Not electricity-limited. Screening, not bankable.

Green H₂-DRI `createGreenH2DriCase`, purchased H₂-DRI `createH2DriCase`, and Walvis `createUreaCase` still load with finite `annualNetCash`. Maglut cash ≈ 1299 (±5).

## Files

- `engine/model.js` (substance `C2H4`)
- `engine/units.js` (unit `mto`)
- `engine/footprint.js` (pad 3 m²/(kg ethylene/h), range [1, 8], floor 30 m², screening)
- `data/tea-screening.js` (sale ethylene, pack mto, demand ethylene, methanol-feed only; methanol sale/pack untouched)
- `cases/mto.js` (Mejillones purchased-feed demo; site `chile-mejillones-mto`)
- `js/flowsheet-app.js` (Fuels palette after urea, UNIT_META, Overview loader, purchased methanol preset, port labels, pack-on-place)
- `index.html` (Overview option under Fuels · screening cash− + script tag)
- `tests/catalog-mto.test.js`
- `tests/catalog-urea.test.js` (Fuels palette regex includes mto)
- `tests/flowsheet-ui.test.js` (script list + palette includes mto)
- `README.md` (short MTO line under fuels)
- `.hunt-run/catalog-mto-summary.md`

Not edited: `cases/network.js`, MECH undo/pump/blower, methanol/steel/Maglut/Si/Al/urea/H₂-DRI/green-H₂-DRI/green-NH₃ packs or prices.

## Tests

`npm test`: **433 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Green H₂-DRI / H₂-DRI / urea paths unchanged and finite. Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened.

## Leftovers

- Full MTO olefin slate (propylene, C4, gasoline-range) not modeled (ethylene proxy only).
- Heat-dominated steam/quench/refrigeration SEC (vs electricity-as-total-energy proxy 4 kWh/kg) not split into a heat port.
- Green-MeOH stack feeding this island not wired; methanol is purchased.
- FT liquids remain a different leftover (not this tranche).
- `sizeToProduct` ethylene alias not added.
- World-scale MTO CAPEX (Chen 2022 world-scale TCI is cheaper per kg than a tiny 1 t/d plant; linear small-plant OOM is the house style) not a second pack.
- Not a UOP/Honeywell licensed flowsheet.

## Tip

Feat SHA pending deploy. Pages URL pending. Prior checkout tip `24788fe`.
