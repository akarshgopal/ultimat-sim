# CATALOG-FREIGHT-WALVIS-UREA (Walvis purchased-NH₃ urea + green-urea)

Inbound (and sale where natural) screening freight on the Walvis urea demos that were still plant-gate after Mejillones leftovers. Reuses existing bands only. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. Not a routing/GIS model and not a carrier contract. Packs, product prices, SEC, and CAPEX are **untouched**. MECH undo/pump/blower untouched. Maglut / Minaçu / peer-SX / Bioforge / Dead Sea / Mejillones silicon/cement/Cu/glass/FT freight binds untouched. Network plant list untouched.

## What landed

- No new `freightBands`. Reuse `chile-coast-container` $0.08/kg (existing container family band; not a Chile-origin claim for Walvis) and `bulk-dry-shortsea` $0.03/kg.
- **Purchased-NH₃ urea** (`cases/urea.js`): ammonia-feed + co2-feed `chile-coast-container` $0.08/kg; urea sale `bulk-dry-shortsea` $0.03/kg (bulk fertilizer offtake OOM; not a Namport quote).
- **Green urea** (`cases/green-urea.js`): co2-feed `chile-coast-container` $0.08/kg; urea sale `bulk-dry-shortsea` $0.03/kg. Seawater, air, and electrolyzer-oxygen stay plant-gate (local intake / YAGNI byproduct). NH₃ is on-site Haber — no NH₃ purchase freight.
- Site notes and resource evidence say which band applies. Not a logistics model. Southern Africa CAPEX× 0.95 unchanged.
- Overview honesty chip already counts streams with `freightUsdPerKg > 0`. No new UI chrome.
- Prior leftover pin `createUreaCase` `breakdown.freight === 0` lifted on purpose.

## Demo cash (solved cases → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Plant-gate baselines recorded tip `9b89454`. Freight is a disclosure inside purchases / netted from sale; CAPEX unchanged. Sign recorded, not retuned.

### Purchased-NH₃ urea (1000 kg/day)

| Line | Plant-gate (9b89454) | After leftover freight |
|---|---:|---:|
| Annual revenue | 146,000 | 135,050 |
| Feed purchases | 106,530 | 144,489 |
| Screening freight (disclosure) | 0 | 48,909 |
| Fixed O&M | 48,578 | 48,578 |
| Variable O&M | 10,950 | 10,950 |
| Annual operating cost | 166,058 | 204,018 |
| Annualized CAPEX | 130,520 | 130,520 |
| Installed CAPEX | 1,281,460 | 1,281,460 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−150,578** | **−199,487** |

Exact after: `annualRevenue` 135049.99999999997; `breakdown.freight` 48909.3436049774; `annualOperatingCost` 204017.5804373295; `annualizedCapex` 130519.51664957896; `annualNetCash` -199487.0970869085; `installedCapex` 1281459.8540145985. Sign stays cash− (more negative).

### Green urea SWRO+PEM+Haber (1000 kg/day)

| Line | Plant-gate (9b89454) | After leftover freight |
|---|---:|---:|
| Annual revenue | 163,114 | 152,164 |
| Feed purchases | 14,160 | 35,558 |
| Screening freight (disclosure) | 0 | 32,348 |
| Fixed O&M | 129,347 | 129,347 |
| Variable O&M | 25,809 | 25,809 |
| Annual operating cost | 169,315 | 190,713 |
| Annualized CAPEX | 392,732 | 392,732 |
| Installed CAPEX | 3,855,897 | 3,855,897 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−398,932** | **−431,280** |

Exact after: `annualRevenue` 152164.4346583289; `breakdown.freight` 32348.23462708537; `annualOperatingCost` 190713.2830684946; `annualizedCapex` 392731.6335218451; `annualNetCash` -431280.48193201085; `installedCapex` 3855897.069485829. Sign stays cash− (more negative). Existing green-urea cash− assertion still true.

Maglut `createMaglutCase` cash still ≈ 1299 (±5; measured 1298.91) and `breakdown.freight` 0. Network rollup cash finite (measured −890,281); Maglut plant ≈1299; walvis-green-urea plant freight 32,348 > 0. Prior 9-plant rollup was −857,933 before this freight (delta matches green-urea freight).

Screening, not bankable, not a voyage/Namport/Maersk quote.

## Files

- `cases/urea.js` (NH₃/CO₂/sale binds; site notes and resource evidence)
- `cases/green-urea.js` (CO₂/sale binds; seawater/air/O₂ plant-gate; site notes and resource evidence)
- `tests/catalog-freight.test.js` (Walvis binds, CAPEX ±1, freight > 0, finite cash, Maglut ≈1299, Dead Sea / REE-SX freight 0, Mejillones leftovers kept, silicon 9 streams, network finite, walvis-green-urea freight > 0)
- `tests/catalog-urea.test.js`, `tests/catalog-green-urea.test.js` (sale `unitPrice` nets freight; `gateUnitPrice` keeps plant-gate)
- `README.md` (one leftover-freight clause)
- `.hunt-run/catalog-freight-walvis-urea-summary.md`

No change to `data/tea-screening.js`, `engine/economics.js`, `js/flowsheet-app.js`, Mejillones freight binds, Maglut, network plant list, or MECH.

## Tests

`npm test`: **522 pass / 0 fail**. Maglut `annualNetCash` still ≈ 1299 (±5) and `breakdown.freight` 0. Dead Sea / REE-SX freight 0. Walvis urea and green-urea freight > 0 and cash finite. Existing green-urea cash− stays true. Silicon still 9 freighted streams. Network cash finite; Maglut plant ≈1299; walvis-green-urea plant freight > 0. Mejillones leftover assertions kept.

## Leftovers

- Inland truck not modeled. No southern-Africa-special or liquid-NH₃-special band.
- Size-to-target green-FT / green-urea still not resized (purchased-H₂ diesel and purchased-NH₃ urea islands remain the size paths).
- Maglut plant-gate (no concentrate freight).
- Port fees, insurance, demurrage not modeled.
- Full offtake / carrier contracts not modeled.
- No routing, GIS, or distance × $/t·km on this layer.
- Pump / undo / blower part-load untouched; packs and product prices not retuned.

## Tip

Feat pending on `main`. Pages pending. Prior checkout tip `9b89454`.
