# CATALOG-Bayer (screening abundance-TEA tranche)

Bayer alumina on the existing Mejillones PV BOM so the Al path is crustal bauxite → smelter-grade Al₂O₃ → Hall–Héroult Al → module frame. Screening honesty, not bankable. Cash is capital-inclusive (R − OPEX − annualized CAPEX). **Not a full Bayer train.** Sign is recorded, not forced.

## What landed

- Substance `Bauxite`: Maglut-style mass proxy, `molarMassG` 1000 (1 mol ≡ 1 kg ore), `elements: { Al: 1 }`. Grade / gibbsite vs boehmite / gangue are handled by intensity (2.0 kg ore / kg Al₂O₃), not a mineralogy model. Distinct from `Al2O3` so purchased alumina stays a purchase option.
- Converter `bayer-alumina`: custom evaluator `bayerAlumina`. Locked intensities per kg smelter-grade Al₂O₃: bauxite 2.0 kg, NaOH makeup 0.08 kg, electricity 3.5 kWh (IAI metallurgical-alumina ~10–12 GJ/t ≈ 2.8–3.3 kWh/kg as a **total-energy-as-electricity** proxy — not a metered Bayer plant). Red mud 1.0 kg leftover `Bauxite` so 2.0 ore → 1.0 alumina + 1.0 mud. 0.08 kg NaOH is makeup consumed into liquor loss and is not added to mud mass. Activity = kg Al₂O₃/day. No wasteHeat. Extra feed mol > 1e-12 throws. No new `RedMud` substance.
- TEA add-only: cost `bauxite` $0.04/kg screening (USGS MCS bauxite-and-alumina crude dry import unit value ~$31–32/t inside a $30–50/t band; mid $0.04/kg; not a mine contract); cost `caustic-makeup` $0.45/kg matching the existing caustic product price (not a second invented price); pack `bayer-alumina` 500 $/(kg Al₂O₃/day), 4% fixed O&M, 0.03 variable, 20 y. Existing alumina cost/sale $0.45/kg **untouched**. No new demand key. Existing MG-Si / poly-Si / Al smelter / pv-module / REE / Bioforge / Maglut / NH₃ packs and product prices **untouched**.
- Demo `cases/silicon.js` (same Mejillones site, same Overview id `silicon-alumina`): purchased alumina node removed. Bauxite + caustic makeup → Bayer (capacity = Al 127.3 stoichiometry, **no** FEED_MARGIN on unit capacity; 1.05 margin on bauxite/caustic streams only) → Hall–Héroult → module. Red mud vents. Electricity adds 3.5 × aluminaKgPerDay into solar sizing; power-bus priority `bayer-alumina` before the smelter. Frozen PVGIS-ERA5 E_d 5.27. Chile CAPEX× 1.05 on Bayer island too. Not a concession, not a full Bayer train, not offtake/freight.
- Palette **Crust** (`mg-si`, `polysilicon`, `bayer-alumina`, `aluminium-smelter`, `pv-module`). UNIT_META “Bayer alumina”, glyph `Al2`. Purchased presets `bauxite` and `caustic`. Campus pad 12 m²/(kg alumina/h), range 6–24, floor 40 m², screening.

## Cited numbers

| Item | Value | Quality | Source |
|---|---|---|---|
| Bauxite | $0.04/kg | screening | USGS MCS 2025 bauxite-and-alumina crude dry import unit value ~$31–32/t (2024–2025e) inside a $30–50/t band; mid $0.04/kg. Not a mine contract. https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-bauxite-alumina.pdf |
| Caustic makeup | $0.45/kg | screening | Same as existing caustic product price (NaOH ~$300–600/t mid). Not a second price. |
| Bayer CAPEX | 500 $/(kg Al₂O₃/day) | screening | ~$1370/t-y × 365/1000 ≈ 500. Greenfield alumina-refinery OOM; linear small-plant; not a Hydro/Alcoa quote. |
| Bayer SEC | 3.5 kWh/kg | screening | IAI metallurgical alumina refining energy intensity ~10–12 GJ/t (12 GJ/t ≈ 3.33 kWh/kg) as total-energy-as-electricity proxy. Not a metered plant. https://international-aluminium.org/statistics/metallurgical-alumina-refining-energy-intensity/ |
| Bauxite intensity | 2.0 kg/kg Al₂O₃ | screening | Screening gibbsite-grade ore order; not a mineralogy model. |
| NaOH makeup | 0.08 kg/kg Al₂O₃ | screening | Makeup, not a full liquor-recycle model. |
| Red mud | 1.0 kg/kg Al₂O₃ | screening | Mass close 2.0 ore → 1.0 alumina + 1.0 mud. Caustic makeup counted as liquor loss. |
| Alumina (purchase option) | $0.45/kg | screening | Untouched. Hall–Héroult feed still purchasable. |

Al ingot $2.87/kg, MG-Si metal $3.97/kg, poly-Si $6/kg, module $2.85/kg, Al pack 1800, MG-Si pack 3000, poly pack 31755, module pack 700, Hall–Héroult 14 kWh/kg, SAF 12 kWh/kg, Siemens 65 kWh/kg: **unchanged**.

## Demo cash (solved `createSiliconCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Module 1000 kg/day, poly-Si 27.3, MG-Si 28.665, Al 127.3, Bayer 240.526 kg Al₂O₃/day (Al 127.3 × 0.5 × M_Al₂O₃/M_Al). Electricity does not bind. Chile CAPEX× 1.05 on solar + MG-Si + poly + Bayer + Al + module. Sale is 365 t module @ $2.85. Alumina is consumed into the smelter, not sold. Sign is honest — not retuned to force cash-positive.

| Line | $/year |
|---|---:|
| Annual revenue | 1,040,250 |
| Feed purchases | 315,371 |
| Fixed O&M | 102,649 |
| Variable O&M | 16,415 |
| Annual operating cost | 434,435 |
| Annualized CAPEX | 313,337 |
| **Net cash (R − OPEX − annualized CAPEX)** | **+292,478** |

Installed CAPEX ≈ $3.08 M (power $974 k; poly island $910 k at 31755×1.05; module line $735 k at 700×1.05; Al $241 k; Bayer $126 k at 500×1.05; MG-Si $90 k). Screening gate cash stays **positive** at this campus because the module sale is 1000 kg/day × $2.85 while Bayer replaced purchased alumina ($0.45/kg) with cheaper bauxite + makeup + a small-plant refinery island. Not retuned to force a sign. Not a bankable offtake. Not a Hydro/Alcoa quote.

Purchased: quartz $0.08, reductant $0.25, bauxite $0.04, caustic makeup $0.45, anode $0.50, silver $1221.73, float-glass $0.45, EVA $2.00. CO / CO₂ / red mud vent, no sale.

## Files

- `engine/model.js`, `engine/units.js`, `engine/footprint.js`, `engine/uncertainty.js`
- `data/tea-screening.js` (add only)
- `js/flowsheet-app.js`, `index.html`
- `cases/silicon.js` (extended; no second site)
- `tests/catalog-bayer.test.js` (new), `tests/catalog-bom-pv.test.js`, `tests/catalog-polysi.test.js`, `tests/catalog-sial.test.js`, `tests/catalog-ree.test.js` (Crust list), `tests/flowsheet-ui.test.js`
- `README.md`

## Tests

`npm test`: **393 pass / 0 fail**. New file `tests/catalog-bayer.test.js` has 4 tests (unit intensities, TEA rows, Mejillones graph, palette/Overview). BOM-PV / polysi / sial / REE Crust lists include `bayer-alumina` between polysilicon and aluminium-smelter. Overview option mentions Bayer. Annual net cash is asserted finite only — sign is not asserted.

## Leftovers

- Full liquor recycle not modeled (0.08 kg/kg is makeup only).
- Digester T/P not modeled.
- Gibbsite vs boehmite grade not modeled (ore is a 1 kg ≡ 1 mol mass proxy).
- Red-mud valorization not modeled (vented leftover Bauxite).
- Offtake / freight not modeled.
- Cell fab / TOPCon still not modeled.
- Pump / undo / blower part-load untouched; MG-Si / poly / Al / pv-module / REE / Bioforge / Maglut / NH₃ packs and product prices not retuned.

## Tip

Feat pending push on `main`. Pages not yet marked live.
