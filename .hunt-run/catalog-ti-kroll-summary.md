# CATALOG-TI-KROLL (Mejillones screening Ti Kroll from purchased TiCl₄+Mg)

Screening Kroll sponge: purchased TiCl₄ + purchased Mg metal → Ti at the Mejillones map point. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Existing Si/Al/BOM/REE/Maglut/urea/NH₃/H₂-DRI packs and prices were not retuned. MECH undo/pump/blower untouched. Maglut / Minaçu / peer-SX / Mejillones silicon / h2-dri / urea / green-NH₃ / Dead Sea case builders unmodified. Not a TIMET/VSMPO quote, not chloride process from rutile, not Mg recycle electrolysis detail, not FT.

## Chemistry

Already in the engine (`titanium-kroll`). Per mol Ti:

TiCl₄ + 2 Mg → Ti + 2 MgCl₂

Activity = kg Ti / day. Default SEC **8 kWh/kg Ti** is process electricity when TiCl₄ and Mg metal are purchased feeds — not the chloride rutile train and not Mg recycle cell energy.

Mass check with model molar masses: TiCl₄ 189.679, Ti 47.867, Mg 24.305, MgCl₂ 95.205. Per 100 kg Ti/day (no margin): TiCl₄ = 100 × 189.679/47.867 = **396.26 kg/day**; Mg = 100 × 2 × 24.305/47.867 = **101.53 kg/day**. Demo purchases apply FEED_MARGIN **1.05**.

## Cited TEA table

| Item | Value | Basis |
|---|---:|---|
| Sale `titanium` | $8.00/kg | Mid of recent Ti sponge ~$6–12/kg bands. Screening, not a TIMET sponge contract. USGS MCS sponge US import unit values recently ~$11–13/kg sit at the high end of that family. |
| Cost `titanium-tetrachloride` / `ticl4-feed` | $1.50/kg | Screening TiCl₄ purchase. Not a chloride-process plant from rutile. USGS titanium family is commodity context. |
| Cost `magnesium-metal` | $2.50/kg | USGS MCS magnesium metal European free market 2025e ~$2,500/t. **Not** the brine `magnesium` sale at $0.08/kg Mg-compound. US spot Western is higher. |
| Pack `titanium-kroll` | 8000 $/(kg Ti/day) | ≈ $2.2M per annual tonne × 365/1000 rounded. Small Kroll island OOM; world-scale cheaper; linear intensity; not a TIMET quote. fixedOm 4%, variableOm 0.04, life 20 y. |
| Demand `titanium` | 2e7 kg/y | Screening regional ceiling. asia-china **1e8**. Other regions inherit me-levant (same style as aluminium/steel — not in MINERAL_DEMAND_KEYS, not in FUEL_CHEM_DEMAND_KEYS). |

Evidence:

- USGS MCS 2025 titanium: https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-titanium.pdf
- USGS MCS 2026 titanium: https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-titanium.pdf
- USGS MCS 2025 magnesium metal: https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-magnesium-metal.pdf
- USGS MCS 2026 magnesium metal: https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-magnesium-metal.pdf

Chile CAPEX× 1.05 applies to the Kroll island and solar-pv. Frozen Mejillones PVGIS-ERA5 totals.fixed E_d **5.27** (`data/pvgis-mejillones.json`). Solar sized to 100×8 / 5.27 × 1.02 = 154.84 kWp. No electricity purchase. Grid unverified. MgCl₂ vented, no credit.

Existing brine `magnesium` sale stays **$0.08/kg**. Steel pack 800, aluminium-smelter pack 1800, H₂-DRI/Si/Al/urea prices untouched.

## Demo cash (solved `createTiKrollCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

100 kg Ti/day at Mejillones (−23.1, −70.448). Purchased TiCl₄ + purchased Mg metal. MgCl₂ byproduct vented. Sign is **cash−** at these screening intensities; not retuned.

| Line | $/year |
|---|---:|
| Annual revenue | 292,000 |
| Feed purchases (TiCl₄ $1.50/kg + Mg metal $2.50/kg on consumed stoich) | 309,620 |
| Fixed O&M | 36,697 |
| Variable O&M | 1,460 |
| Annual operating cost | 347,777 |
| Annualized CAPEX | 102,115 |
| Installed CAPEX | 1,002,581 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−157,892** |

Exact solved lines: `annualRevenue` 292000; `annualOperatingCost` 347776.92481924046; `annualizedCapex` 102115.05323301678; `annualNetCash` −157891.97805225718; `installedCapex` 1002580.6451612903 (Kroll island 840,000 = 8000 × 1.05 × 100; solar 162,580.65). Screening, not bankable.

Maglut cash ≈ 1299 (±5). Mejillones `createH2DriCase` / `createSiliconCase` still finite. Walvis urea still finite.

## Files

- `data/tea-screening.js` (sale `titanium`, costs `titanium-tetrachloride` / `ticl4-feed` / `magnesium-metal`, pack `titanium-kroll`, demand `titanium`; Al/Si/steel/urea/Maglut packs and brine magnesium sale untouched)
- `cases/ti-kroll.js` (Mejillones purchased-feed demo)
- `engine/footprint.js` (pad 8 m²/(kg Ti/h), range [2, 20], floor 40 m², screening)
- `js/flowsheet-app.js` (Crust palette after hydrogen-dri, UNIT_META sourceNote, Overview loader, pack-on-place, port labels TiCl₄ / Mg / Ti / MgCl₂)
- `index.html` (Overview option + script tag)
- `tests/catalog-ti-kroll.test.js`
- `tests/flowsheet-ui.test.js` (palette lists titanium-kroll; MED / MSF stay off default)
- `tests/catalog-sial.test.js`, `tests/catalog-bayer.test.js`, `tests/catalog-ree.test.js`, `tests/catalog-bom-pv.test.js`, `tests/catalog-polysi.test.js`, `tests/catalog-h2-dri.test.js` (Crust list assertions)
- `README.md` (short Ti Kroll line)
- `.hunt-run/catalog-ti-kroll-summary.md`

Unit stoich in `engine/units.js` was already present and was not changed.

## Tests

`npm test`: **422 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5). Mejillones H₂-DRI, silicon, and Walvis urea remain finite. Dead Sea / Maglut / REE-SX / BOM / Bioforge / network cash tests not weakened.

## Leftovers

- Mg recycle electrolysis credit (MgCl₂ → Mg + Cl₂) not wired; this demo vents MgCl₂ with no credit.
- Chloride process from rutile (TiO₂ + C + 2 Cl₂ → TiCl₄ + CO₂) not modeled; TiCl₄ is a purchased feed.
- `sizeToProduct` Ti alias not added.
- FT liquids not in this tranche.
- Green H₂-DRI electrolyzer couple remains a leftover from CATALOG-H2-DRI.
- World-scale Kroll CAPEX (cheaper than the small-plant 8000 intensity) not a second pack.

## Tip

Feat pending on `main`. Prior checkout tip `273565d`. Pages URL after deploy: https://akarshgopal.github.io/ultimat-sim/
