# CATALOG-polySi (screening abundance-TEA tranche)

Siemens-style poly-Si screening on the existing Mejillones MG-Si path. Screening honesty, not bankable. Cash is capital-inclusive and **negative**.

## What landed

- Converter `polysilicon`: MG-Si + power → solar-grade poly-Si. Electrical SEC 65 kWh/kg (Fraunhofer ISE SoG 60–71 kWh/kg mid). Feed 1.05 mol Si / mol product (≈5% MG-Si loss / recycle bleed). No `heatKWhPerKg` / no wasteHeat port. No HCl / TCS substances. `mg-si` chemistry unchanged.
- TEA: screening SoG poly price $6/kg (NREL Spring 2025 Solar Industry Update family; not USGS silicon metal $3.97). Pack `polysilicon` 31755 $/(kg poly-Si/day) from ~$87/kg-y × 365. Demand ceiling 2 kt/y (asia-china 200 kt/y). Not in `MINERAL_DEMAND_KEYS`. Europe / chile-atacama inherit 2e6 with `inherit:'me-levant'`.
- Palette **Crust** (`mg-si`, `polysilicon`, `aluminium-smelter`) after Carbon, not default-open. New poly blocks bind the tea pack so CAPEX is not $0. Campus glyph furnace.
- Demo `cases/silicon.js` extended (same Mejillones site): quartz → MG-Si (1050 kg/day) → poly-Si sale (1000 kg/day) + Al co-product (1000 kg/day). MG-Si metal sale removed. Shared frozen PVGIS-ERA5 5.27 kWh/kWp·day sized to 1050×12 + 1000×65 + 1000×14 with 2% margin. Chile CAPEX× 1.05 on furnaces, poly island, and solar. Not a TCS plant, not FBR, not a PV module BOM.
- Screening campus pad: 10 m²/(kg poly-Si/h), range 6–16, floor 40 m².

## Cited numbers

| Item | Value | Quality | Source |
|---|---|---|---|
| SoG poly sale | $6/kg | screening | NREL Spring 2025 Solar Industry Update family; Q1 2025 global spot ~$5.54→$6.24/kg; mid $6. Not USGS silicon metal. |
| Poly CAPEX | 31755 $/(kg poly-Si/day) | screening | ~$87/kg-y × 365 from $565M / 6,500 t/y TCS Siemens (REW / Ceccaroli–Lohne family). Linear small-plant intensity. |
| Poly SEC | 65 kWh/kg | screening | Fraunhofer ISE SoG 60–71 kWh/kg mid (CPIA / Bernreuter family). |
| Feed bleed | 1.05 mol Si / mol product | screening | ≈5% MG-Si loss / recycle bleed. Not a TCS/CVD plant. |
| Demand | 2e6 kg/y (asia-china 2e8) | screening | Tiny slice of SoG poly; not world production; not a contract. |
| Mejillones PV | E_d 5.27, E_y 1923.52 | cited | frozen `data/pvgis-mejillones.json` |
| Chile CAPEX× | 1.05 | screening | existing regional multiplier; not retuned. |

MG-Si metal $3.97/kg, Al ingot $2.87/kg, MG-Si pack 3000, Al pack 1800, SAF 12 kWh/kg, Hall–Héroult 14 kWh/kg: **unchanged**.

## Demo cash (solved `createSiliconCase`, 365 d, CRF 8%/20 y)

Poly 1000 kg/day, MG-Si 1050 kg/day, Al 1000 kg/day; electricity does not bind (17,729 kWp × 5.27 kWh/kWp·d with 2% margin). Chile CAPEX× 1.05 on solar + MG-Si + poly + Al. Sale is 365 t poly @ $6 plus 365 t Al @ $2.87.

| Line | $/year |
|---|---:|
| Annual revenue | 3,237,550 |
| Feed purchases | 518,814 |
| Fixed O&M | 1,896,191 |
| Variable O&M | 36,865 |
| Annualized CAPEX | 5,821,438 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−5,035,757** |

Installed CAPEX ≈ $57.2 M (poly island ≈ $33.3 M). Screening gate cash is **negative**. Honest: linear $87/kg-y Siemens intensity on a 365 t/y plant is not China nth-of-kind, and SoG $6/kg does not cover annualized CAPEX + 4% fixed O&M. Not retuned to force cash+. Not a bankable offtake.

## Files

- `engine/units.js`, `engine/footprint.js`, `engine/uncertainty.js`
- `data/tea-screening.js`
- `js/flowsheet-app.js`, `index.html`
- `cases/silicon.js` (extended; no second site)
- `tests/catalog-polysi.test.js` (new), `tests/catalog-sial.test.js`, `tests/flowsheet-ui.test.js`
- `README.md`

## Tests

`npm test`: **372 pass / 0 fail**. New file `tests/catalog-polysi.test.js` has 4 tests; sial case-level assertions follow the poly graph (MG-Si 1050, no silicon sale sink); Crust palette list includes `polysilicon`.

## Leftovers

- Full TCS / HCl / chlorosilane plant not modeled.
- FBR granular poly not modeled.
- PV module BOM (Ag / glass / EVA) not modeled.
- Bayer alumina refining not modeled.
- REE not modeled.
- Offtake / freight not modeled.
- `sizeToProduct` has no Si / poly / Al product.
- Pump / undo / blower part-load untouched; MG-Si / Al / NH₃ packs and USGS silicon-metal price not retuned.

## Tip

Feat `c1d0c5c` on `main` (onto PATH-NH3-sun `20172b6` / `8d922d6`). `npm test` 372 pass / 0 fail. Pages published from that SHA: https://akarshgopal.github.io/ultimat-sim/
