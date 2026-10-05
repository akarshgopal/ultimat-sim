# CATALOG-FREIGHT-QCC (Mejillones quartz / carbon / caustic)

Inbound screening freight on the four purchased feeds the freight-bom leftover named. Reuses existing bands. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Not a routing/GIS model and not a carrier contract. Packs, product prices, SEC, Bayer/module CAPEX, and urea/NH₃/Maglut/REE numbers are **untouched**. MECH undo/pump/blower untouched. Maglut / Minaçu / peer-SX / Bioforge / urea / green-NH₃ / Dead Sea cases untouched.

## What landed

- Mejillones (`cases/silicon.js`) only. No new `freightBands`.
- Quartz (`quartz`): `bulk-dry-shortsea` $0.03/kg. Dry bulk ore/quartzite.
- Carbon reductant (`carbon-reductant`): `bulk-dry-shortsea` $0.03/kg. Coal/coke/charcoal bulk.
- Carbon anode (`carbon-anode`): `bulk-dry-shortsea` $0.03/kg. Anode carbon bulk.
- Caustic makeup (`caustic-makeup`): `chile-coast-container` $0.08/kg. Liquid chemical, containerized.
- Module sale stays `chile-coast-container` $0.08/kg (unit price still $2.77 net of gate $2.85). Bauxite and float glass stay `bulk-dry-shortsea` $0.03/kg. Ag paste and EVA stay `chile-coast-container` $0.08/kg.
- All eight purchased feeds plus the module sale now carry a screening freight band (9 streams with `freightUsdPerKg > 0`).
- Site notes and quartz/carbon/caustic resource evidence say which band applies. Not a logistics model. Chile CAPEX× 1.05 unchanged.
- Overview honesty chip counts streams with `freightUsdPerKg > 0`. Mejillones rises from 5 to 9 with no new UI chrome. The hard-coded “5 streams” UI assertion is now 9.

## Demo cash (solved `createSiliconCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Prior freight-bom tip is module sale + bauxite + Ag/glass/EVA (`55c310d` / docs tip `d44729c`). Module 1000 kg/day still nets $2.77/kg. Inbound masses are solved supply: quartz 61.32 kg/day × $0.03, reductant 24.52 kg/day × $0.03, anode 42.50 kg/day × $0.03, caustic 19.24 kg/day × $0.08. Added disclosure freight $1,967.22/y (quartz $671.50 + reductant $268.47 + anode $465.39 + caustic $561.87), all inside purchases / OPEX. Revenue, fixed O&M, variable O&M, and CAPEX unchanged. Sign stays positive at this scale; not asserted and not retuned.

| Line | Prior freight-bom tip | After quartz/carbon/caustic freight |
|---|---:|---:|
| Annual revenue | 1,011,050 | 1,011,050 |
| Feed purchases | 329,987 | 331,954 |
| Screening freight (disclosure) | 43,816 | 45,783 |
| Fixed O&M | 102,649 | 102,649 |
| Variable O&M | 16,415 | 16,415 |
| Annual operating cost | 449,051 | 451,018 |
| Annualized CAPEX | 313,337 | 313,337 |
| Installed CAPEX | 3,076,388.81 | 3,076,388.81 |
| **Net cash (R − OPEX − annualized CAPEX)** | **+248,662** | **+246,695** |

Exact solved lines: `breakdown.freight` 45782.75670988608; `annualNetCash` 246695.07377732982; `installedCapex` 3076388.8084867904 (delta 0 vs freight-bom tip). Screening, not bankable, not a voyage/Maersk quote.

## Files

- `cases/silicon.js` (quartz/reductant/anode/caustic binds; site notes and resource evidence)
- `tests/catalog-freight.test.js` (QCC binds, freight > prior ~43815.53, CAPEX ±1, finite cash, Maglut ≈ 1299, peer SX / Minaçu / urea finite, Dead Sea / Maglut / urea freight 0)
- `tests/flowsheet-ui.test.js` (honesty chip 9 streams)
- `README.md` (one clause)
- `.hunt-run/catalog-freight-qcc-summary.md`

No change to `data/tea-screening.js`, `engine/economics.js`, or `js/flowsheet-app.js`.

## Tests

`npm test`: **407 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5) and `breakdown.freight` 0. Dead Sea freight 0. Urea freight 0 and cash finite. Peer SX and Minaçu cash stay finite. Network cash assertions untouched.

## Leftovers

- Inland truck not modeled. No Asia-origin premium. No liquid-caustic-special band.
- Port fees, insurance, demurrage not modeled.
- Full offtake / carrier contracts not modeled.
- No routing, GIS, or distance × $/t·km on this layer.
- `sizeToProduct` crustal aliases (quartz / silicon / alumina / module) not added this tranche.
- FT liquids not in this tranche.
- Pump / undo / blower part-load untouched; packs and product prices not retuned.

## Tip

Feat `969b03a` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `969b03a`). `npm test` 407 pass / 0 fail. Prior checkout tip `f142351`.
