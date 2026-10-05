# CATALOG-H2-DRI (Mejillones screening H₂-DRI from purchased ore+H₂)

Screening shaft DRI: purchased hematite (Fe₂O₃) + purchased industrial/grey–blue H₂ → DRI Fe at the Mejillones map point. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Existing Si/Al/BOM/REE/Maglut/urea/NH₃/Bioforge packs and prices were not retuned. MECH undo/pump/blower untouched. Maglut / Minaçu / peer-SX / Mejillones silicon / urea / green-NH₃ / Dead Sea case builders unmodified. Not a Midrex/HYBRIT/Tenova quote, not an EAF melt shop, not a green-H₂ electrolyzer path, not FT/olefins.

## Chemistry

Already in the engine (`hydrogen-dri`). Per mol Fe:

0.5 Fe₂O₃ + 1.5 H₂ → Fe + 1.5 H₂O

(equivalent to Fe₂O₃ + 3 H₂ → 2 Fe + 3 H₂O). Activity = kg Fe / day. Default SEC **0.7 kWh/kg Fe** is shaft-furnace electricity when H₂ is a purchased feed — not the full H₂ production energy.

Mass check with model molar masses: Fe₂O₃ 159.687, Fe 55.845, H₂ 2.01588, H₂O 18.01528. Per 1000 kg Fe/day (no margin): Fe₂O₃ = 1000 × 0.5 × 159.687/55.845 = **1430.00 kg/day**; H₂ = 1000 × 1.5 × 2.01588/55.845 = **54.15 kg/day**. Demo purchases apply FEED_MARGIN **1.05**.

## Cited TEA table

| Item | Value | Basis |
|---|---:|---|
| Sale `steel` | $0.40/kg | Mid of recent HBI/DRI iron ~$350–450/t. Screening, not a Platts HBI contract. |
| Cost `iron-ore` | $0.10/kg | USGS MCS iron ore ~$80–120/t mid → $0.10/kg. Hematite / Fe₂O₃ feed. Not a mine contract. |
| Cost `hydrogen-feed` | $2.00/kg | Screening industrial/grey–blue blend purchase. Not a DOE $1/kg goal and not an electrolyzer demo. |
| Pack `hydrogen-dri` | 800 $/(kg Fe/day) | ≈ $220k per annual tonne × 365/1000 rounded. Small shaft/DRI island OOM; world-scale Midrex cheaper; linear intensity; not a Midrex/HYBRIT/Tenova quote. fixedOm 4%, variableOm 0.03, life 20 y. |
| Demand `steel` | 5e8 kg/y | Screening regional ceiling. asia-china **5e9**. Other regions inherit me-levant (same style as aluminium/silicon — not in MINERAL_DEMAND_KEYS, not in FUEL_CHEM_DEMAND_KEYS). |

Evidence:

- USGS MCS 2025 iron ore: https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-ore.pdf
- USGS MCS 2025 iron and steel: https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-steel.pdf
- World Bank commodity markets / pink sheet (metals family): https://www.worldbank.org/en/research/commodity-markets
- IEA Global Hydrogen Review 2024: https://www.iea.org/reports/global-hydrogen-review-2024
- DOE hydrogen production electrolysis (family contrast; this purchase is not an electrolyzer path): https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis

Chile CAPEX× 1.05 applies to the DRI island and solar-pv. Frozen Mejillones PVGIS-ERA5 totals.fixed E_d **5.27** (`data/pvgis-mejillones.json`). Solar sized to 1000×0.7 / 5.27 × 1.02 = 135.48 kWp. No electricity purchase. Grid unverified.

## Demo cash (solved `createH2DriCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

1000 kg Fe/day at Mejillones (−23.1, −70.448). Purchased hematite + purchased H₂. Water byproduct vented. Sign is **cash−** at these screening intensities; not retuned.

| Line | $/year |
|---|---:|
| Annual revenue | 146,000 |
| Feed purchases (ore $0.10/kg + H₂ $2.00/kg on consumed stoich) | 91,712 |
| Fixed O&M | 36,310 |
| Variable O&M | 10,950 |
| Annual operating cost | 138,972 |
| Annualized CAPEX | 100,045 |
| Installed CAPEX | 982,258 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−93,017** |

Exact solved lines: `annualRevenue` 146000; `annualOperatingCost` 138972.0303605313; `annualizedCapex` 100045.1535053205; `annualNetCash` −93017.1838658518; `installedCapex` 982258.0645161291 (DRI island 840,000 = 800 × 1.05 × 1000; solar 142,258.06). Screening, not bankable.

Maglut cash ≈ 1299 (±5). Mejillones `createSiliconCase` still finite. Walvis urea still finite.

## Files

- `data/tea-screening.js` (sale `steel`, costs `iron-ore` / `hydrogen-feed`, pack `hydrogen-dri`, demand `steel`; Al/Si/urea/Maglut packs and prices untouched)
- `cases/h2-dri.js` (Mejillones purchased-feed demo)
- `engine/footprint.js` (pad 2 m²/(kg Fe/h), range [0.5, 8], floor 40 m², screening)
- `js/flowsheet-app.js` (Crust palette after pv-module, UNIT_META sourceNote, Overview loader, pack-on-place, steel port label Fe / Iron)
- `index.html` (Overview option + script tag)
- `tests/catalog-h2-dri.test.js`
- `tests/flowsheet-ui.test.js` (palette lists hydrogen-dri; titanium-kroll / MED / MSF stay off default)
- `tests/catalog-sial.test.js`, `tests/catalog-bayer.test.js`, `tests/catalog-ree.test.js`, `tests/catalog-bom-pv.test.js`, `tests/catalog-polysi.test.js` (Crust list assertions)
- `README.md` (short H₂-DRI line under crust/steel)
- `.hunt-run/catalog-h2-dri-summary.md`

Unit stoich in `engine/units.js` was already present and was not changed.

## Tests

`npm test`: **418 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Mejillones silicon and Walvis urea remain finite. Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened.

## Leftovers

- Electrolyzer-coupled green H₂-DRI (on-site PEM feeding this shaft) not wired; this demo is purchased H₂.
- EAF melt shop / liquid steel finishing not modeled (product is DRI Fe).
- Titanium Kroll TEA still hollow.
- `sizeToProduct` steel alias not added.
- FT liquids not in this tranche.
- World-scale Midrex CAPEX (cheaper than the small-plant 800 intensity) not a second pack.
- Hot-briquetting / HBI finishing island not modeled.

## Tip

Feat `acc4eaf` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `acc4eaf`). `npm test` 418 pass / 0 fail. Prior checkout tip `6742ad6`.
