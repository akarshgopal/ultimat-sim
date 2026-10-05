# CATALOG-FREIGHT-BOM (Mejillones Ag / glass / EVA)

Inbound screening freight on the three purchased BOM feeds the prior freight leftover named. Reuses existing bands. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Not a routing/GIS model and not a carrier contract. Packs, product prices, SEC, and Bayer/module CAPEX are **untouched**. MECH undo/pump/blower untouched. Maglut / Minaçu / peer-SX / Bioforge / NH₃ cases untouched.

## What landed

- Mejillones (`cases/silicon.js`) only. No new `freightBands`.
- Ag paste (`silver` / cost `silver`): `chile-coast-container` $0.08/kg. High-value paste, containerized.
- Float glass (`float-glass`): `bulk-dry-shortsea` $0.03/kg. Bulky feed; short-sea OOM is the honest band already on the sheet. No glass-special band.
- EVA (`eva-encapsulant`): `chile-coast-container` $0.08/kg. Polymer film, containerized.
- Quartz, carbon (reductant and anode), and caustic stay plant-gate (`freightUsdPerKg` absent).
- Module sale stays `chile-coast-container` $0.08/kg (unit price still $2.77 net of gate $2.85). Bauxite stays `bulk-dry-shortsea` $0.03/kg on top of $0.04/kg.
- Site notes and Ag/glass/EVA resource evidence say which band applies. Not a logistics model. Chile CAPEX× 1.05 unchanged.
- Overview honesty chip counts streams with `freightUsdPerKg > 0`. Mejillones rises from 2 to 5 with no new UI chrome. The hard-coded “2 streams” UI assertion is now 5.

## Demo cash (solved `createSiliconCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Prior freight tip is module sale + bauxite only (`be62508` / docs tip `ebc4330` parent). Module 1000 kg/day still nets $2.77/kg. Inbound masses are solved supply: Ag 0.3 kg/day × $0.08, glass 674.5 kg/day × $0.03, EVA 66.9 kg/day × $0.08. Added disclosure freight $9,348.01/y (Ag $8.76 + glass $7,385.78 + EVA $1,953.48), all inside purchases / OPEX. Revenue, fixed O&M, variable O&M, and CAPEX unchanged. Sign stays positive at this scale; not asserted and not retuned.

| Line | Prior freight tip | After Ag/glass/EVA freight |
|---|---:|---:|
| Annual revenue | 1,011,050 | 1,011,050 |
| Feed purchases | 320,639 | 329,987 |
| Screening freight (disclosure) | 34,468 | 43,816 |
| Fixed O&M | 102,649 | 102,649 |
| Variable O&M | 16,415 | 16,415 |
| Annual operating cost | 439,703 | 449,051 |
| Annualized CAPEX | 313,337 | 313,337 |
| Installed CAPEX | 3,076,388.81 | 3,076,388.81 |
| **Net cash (R − OPEX − annualized CAPEX)** | **+258,010** | **+248,662** |

Exact solved lines: `breakdown.freight` 43815.532421766; `annualNetCash` 248662.29806545; `installedCapex` 3076388.8084867904 (delta 0 vs prior tip). Screening, not bankable, not a Maersk/Guardian/STR quote.

## Files

- `cases/silicon.js` (Ag/glass/EVA binds; site notes and resource evidence)
- `tests/catalog-freight.test.js` (BOM binds, freight > prior ~34468, CAPEX ±1, finite cash, Maglut ≈ 1299, peer SX / Minaçu finite, Dead Sea / Maglut freight 0)
- `tests/flowsheet-ui.test.js` (honesty chip 5 streams)
- `README.md` (one clause)
- `.hunt-run/catalog-freight-bom-summary.md`

No change to `data/tea-screening.js`, `engine/economics.js`, or `js/flowsheet-app.js`.

## Tests

`npm test`: **403 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5) and `breakdown.freight` 0. Dead Sea freight 0. Peer SX and Minaçu cash stay finite. Network cash assertions untouched.

## Leftovers

- Quartz / carbon / caustic freight still omitted (YAGNI; prior leftover named Ag/glass/EVA).
- Inland truck not modeled. No Asia-origin premium. No new glass-special band.
- Port fees, insurance, demurrage not modeled.
- Full offtake / carrier contracts not modeled.
- No routing, GIS, or distance × $/t·km on this layer.
- `sizeToProduct` crustal aliases (quartz / silicon / alumina / module) not added this tranche.
- Pump / undo / blower part-load untouched; packs and product prices not retuned.

## Tip

Feat `55c310d` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `55c310d`). `npm test` 403 pass / 0 fail. Prior checkout tip `ebc4330`.
