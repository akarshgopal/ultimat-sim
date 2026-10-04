# CATALOG-SiAl (screening abundance-TEA tranche)

One shippable MG-Si + Hall–Héroult aluminium catalog. Screening honesty, not bankable.

## What landed

- Substances `Si`, `SiO2`, `CO` (masses 28.0855 / 60.0843 / 28.0104).
- Converter `mg-si`: SiO₂ + 2 C → Si + 2 CO, electrical SEC 12 kWh/kg (11–13 SAF band mid). No `heatKWhPerKg` / no wasteHeat port. Aluminium smelter, H₂-DRI, and Kroll engine units stay in place.
- TEA: cited USGS MCS 2025 product prices; screening quartz / reductant / anode / alumina costs; packs `mg-si` 3000 and `aluminium-smelter` 1800 $/(kg/day); demand ceilings 5 kt/y Si and 20 kt/y Al (asia-china 500 kt/y and 2 Mt/y). Not in `MINERAL_DEMAND_KEYS`.
- Palette **Crust** (`mg-si`, `aluminium-smelter`) after Carbon, not default-open. Titanium Kroll, H₂-DRI, MED, MSF leave the More-units gallery (catalog/engine remain). New blocks of the two Crust units bind tea packs so CAPEX is not $0.
- Demo `cases/silicon.js`: purchased quartzite + reductant → MG-Si sale; purchased alumina + anode → Al sale; shared Mejillones PV (`chile-mejillones`, frozen E_d 5.27 / E_y 1923.52). CO/CO₂ vent. Chile CAPEX× 1.05 on furnaces and solar. Not a concession, not polysilicon.
- Screening campus pads: 8 m²/(kg Si/h) and 6 m²/(kg Al/h), floor 40 m².

## Cited numbers

| Item | Value | Quality | Source |
|---|---|---|---|
| MG-Si metal | $3.97/kg | cited | USGS MCS 2025 silicon 180 ¢/lb × 2.20462 |
| Al ingot | $2.87/kg | cited | USGS MCS 2025 aluminum 130 ¢/lb × 2.20462 |
| Quartzite | $0.08/kg | screening | ~$80/t lump; USGS silica family |
| SAF reductant | $0.25/kg | screening | coal/coke/charcoal mix |
| Anode carbon | $0.50/kg | screening | Hall–Héroult; DOE roadmap family |
| Alumina | $0.45/kg | screening | smelter-grade ~$300–600/t mid |
| MG-Si CAPEX | 3000 $/(kg Si/day) | screening | ~$8/kg-y × 365; linear; not a vendor quote |
| Al CAPEX | 1800 $/(kg Al/day) | screening | ~$5000/t-y → 1800; not Bayer |
| SAF SEC | 12 kWh/kg | screening | 11–13 kWh/kg band; MDPI 2026 uses 12 |
| Hall–Héroult SEC | 14 kWh/kg | recoverable | IAI-class 13–15; already on the unit |
| Mejillones PV | E_d 5.27, E_y 1923.52 | cited | frozen `data/pvgis-mejillones.json` |

## Demo cash (solved `createSiliconCase`, 365 d, CRF 8%/20 y)

Both furnaces at 1000 kg/day; electricity does not bind (5,032 kWp × 5.27 kWh/kWp·d with 2% margin). Chile CAPEX× 1.05 on solar + furnaces.

| Line | $/year |
|---|---:|
| Annual revenue (365 t Si @ 3.97 + 365 t Al @ 2.87) | 2,496,600 |
| Feed purchases | 511,788 |
| Fixed O&M | 302,245 |
| Variable O&M | 25,550 |
| Annualized CAPEX | 1,051,509 |
| **Net cash (R − OPEX − annualized CAPEX)** | **605,508** |

Screening gate cash, not a bankable offtake.

## Files

- `engine/model.js`, `engine/units.js`, `engine/footprint.js`, `engine/uncertainty.js`
- `data/tea-screening.js`
- `js/flowsheet-app.js`, `index.html`
- `cases/silicon.js` (new)
- `tests/catalog-sial.test.js` (new), `tests/flowsheet-ui.test.js`
- `README.md` (added heading only)

## Tests

`npm test`: **356 pass / 0 fail**. New file `tests/catalog-sial.test.js` has 5 tests; palette assertions updated in `tests/flowsheet-ui.test.js`.

## Leftovers

- Polysilicon / Siemens not modeled.
- Bayer alumina refining not modeled.
- `sizeToProduct` has no Si/Al product.
- Titanium Kroll, H₂-DRI, MED, MSF still in engine/catalog, hidden from the palette.
- Offtake/freight and green-NH₃ not added.
- Pump/undo/blower part-load untouched; abundance/zabuye/fuels cash not retuned.
