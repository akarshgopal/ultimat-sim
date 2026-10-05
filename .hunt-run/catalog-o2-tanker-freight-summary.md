# CATALOG-O2-TANKER-FREIGHT (Linde cryo-tanker $0.08/kg on green-H2-DRI O₂)

One new screening freight band `cryo-tanker-short` ($0.08/kg) wired to Mejillones green-H2-DRI electrolyzer-oxygen sale. Capital-inclusive cash (R − OPEX − annualized CAPEX). Sign recorded, not forced. No pack / product-price / SEC / CAPEX retune. Oxygen plant-gate stays $0.05/kg. MECH undo/pump/blower untouched. Network stays Network (never Empire). `dac.js` not deleted. Ni / soda-ash / Ag / TiCl4 / Zn / Pb / phosphoric / chlor-alkali / Li / graphite / Mg / EVA not retried.

Cite: Linde Gas AB (Sweden), *Flytande gaser, industri* price list valid 1 Jan 2024. Transport 0–100 km 0.86 SEK/kg (excl. VAT) for annual consumption 15–200 t/y. FX ~10.4–10.5 SEK/USD (Jan 2024) → 0.86 SEK/kg ≈ $0.082/kg, rounded to screening **$0.08/kg**. Not a pipeline, not tube-trailer, not a carrier contract, not a Chile quote, not a distance/GIS model. Liquefaction of gaseous electrolyzer O₂ is **not** modeled (freight-only disclosure — real LOX offtake also needs a liquefier, so this understates cost). Distinct from `inland-truck-short` (bulk solids).

Primary URL: https://static.prd.echannel.linde.com/wcsstore/SE_REN_Industrial_Gas_Store/pdf/Prislista_Flytande_gaser_Industri_2024_01.pdf

## Band

`freightBands['cryo-tanker-short']` = **$0.08/kg** (screening). Same `row()` shape as `inland-truck-short`.

Existing bands unchanged: `chile-coast-container` $0.08, `bulk-dry-shortsea` $0.03, `inland-truck-short` $0.01, `none` $0.

## O₂ tonnage (solved, 365 d) and wire rule

Wire only cases whose **total sold O₂** sits in the Linde 15–200 t/y tariff band.

| Case | Sold O₂ | t/y | In 15–200 t/y? | Wired |
|---|---|---:|---|---|
| green-h2-dri `electrolyzer-oxygen` | 156,857 kg/y | **156.86 ≈ 157** | yes | **cryo-tanker-short** |
| green-ft `electrolyzer-oxygen` | 1,268,513 kg/y | 1268.5 | no (above; larger volumes quoted separately) | plant-gate |
| green-mto `electrolyzer-oxygen` | 1,249,009 kg/y | 1249.0 | no (above) | plant-gate |
| green-urea `electrolyzer-oxygen` + `asu-oxygen` | 291,720 + 50,569 kg/y | 291.7 + 50.6 = 342.3 | no (above) | plant-gate |
| green-ammonia `electrolyzer-oxygen` + `asu-oxygen` | 514,351 + 89,161 kg/y | 514.4 + 89.2 = 603.5 | no (above) | plant-gate |
| abundance `oxygen` | 2,392 kg/y | 2.39 | no (below) | plant-gate (no edit) |

Matches orchestrator-measured baseline at tip `e3ac2d6`.

## Stream wired

**`cases/green-h2-dri.js` electrolyzer-oxygen** `tea.bindSale('oxygen', { region: REGION, freight: 'cryo-tanker-short' })`.

Steel `bulk-dry-shortsea` and iron-ore `inland-truck-short` kept. Seawater stays plant-gate. Disposition stays **sale** (not switched to vent).

green-ft / green-mto / green-urea / green-ammonia notes each got a one-clause “O₂ stays plant-gate because volume is above the Linde 15–200 t/y tanker tariff band (not a tariff for that scale)”. abundance left untouched.

## Honesty: net −$0.03/kg is clamped

Plant-gate O₂ $0.05/kg minus cryo-tanker-short $0.08/kg = **−$0.03/kg**. A real operator would likely vent or find an over-the-fence buyer. Liquefaction not modeled.

`attachFreight` already does `unitPrice = Math.max(0, gate − freight)`. **Did not add clamping. Did not remove the existing clamp.** bindSale therefore yields `gateUnitPrice` 0.05, `freightUsdPerKg` 0.08, **`unitPrice` 0** (not −0.03). Did not throw.

Sale freight is a disclosure in `breakdown.freight` and is netted from `unitPrice`; it is **not** added to OPEX. With the clamp, cash loses the $0.05/kg O₂ revenue and does **not** charge the extra $0.03/kg. Honest unclamped cash would be a further −$4,706/y (156,857 kg × $0.03). Recorded, not retuned.

## Demo cash (solved `createGreenH2DriCase` → `evaluateEconomics`, 365 d, CRF 8%/20 y)

Baseline tip `e3ac2d6` (network-h2-dri docs live). Freight is a disclosure; CAPEX unchanged. Sign recorded, not retuned.

| Line | Before (e3ac2d6) | After cryo-tanker-short |
|---|---:|---:|
| Annual revenue | 142,893 | 135,050 |
| Screening freight (disclosure) | 16,169 | 28,717 |
| Annual operating cost | 122,152 | 122,152 |
| Annualized CAPEX | 177,264 | 177,264 |
| Installed CAPEX | 1,740,403 | 1,740,403 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−156,523** | **−164,366** |

Exact before: `annualRevenue` 142892.8431372549; `breakdown.freight` 16168.529411764706; `annualOperatingCost` 122152.17648603914; `annualizedCapex` 177263.8945339889; `annualNetCash` -156523.22788277315; `installedCapex` 1740403.046553248.

Exact after: `annualRevenue` 135050; `breakdown.freight` 28717.078431372545; `annualOperatingCost` 122152.17648603914; `annualizedCapex` 177263.8945339889; `annualNetCash` -164366.07102002803; `installedCapex` 1740403.046553248.

CAPEX matches prior ±1. Freight 28717 > prior 16169 (strictly greater). Revenue delta −$7,843 = lost O₂ plant-gate revenue (156,857 kg × $0.05). O₂ sink `annualFreight` 12548.55 = 156,857 kg × $0.08.

## Network rollup (12 plants, empty corridors)

| | Before (e3ac2d6) | After |
|---|---:|---:|
| **annualNetCash** | **−1,847,892** | **−1,855,735** |
| annualRevenue | 6,956,861 | 6,949,019 |
| annualOperatingCost | 5,747,959 | 5,747,959 |
| installedCapex | 30,012,059 | 30,012,059 |

Exact before: `annualNetCash` -1847892.329785836.
Exact after: `annualNetCash` -1855735.1729230909; `annualRevenue` 6949018.624811214; `annualOperatingCost` 5747959.299343303; `installedCapex` 30012058.97948288.

Delta −$7,843 matches green-H2-DRI lost O₂ revenue. No Network test pinned exact rollup cash (finite + Maglut ≈1299 only); no pin update.

## Maglut pin

`createMaglutCase` `annualNetCash` 1298.91 ≈ **1299 (±5)**, `breakdown.freight` **0**. Unchanged.

## Files

- `data/tea-screening.js` (`freightBands['cryo-tanker-short']`)
- `cases/green-h2-dri.js` (O₂ bind + site evidence/notes)
- `cases/green-ft.js` / `cases/green-mto.js` / `cases/green-urea.js` / `cases/green-ammonia.js` (one-clause above-band plant-gate notes)
- `tests/catalog-freight.test.js` (band, bind, CAPEX pin, freight > 16169, Maglut, leftover O₂ assertions, green-ft/mto/urea/ammonia stay plant-gate)
- `README.md` (one clause on green-H2-DRI cryo-tanker-short; other green O₂ plant-gate)
- `.hunt-run/catalog-o2-tanker-freight-summary.md`

Not edited: packs, oxygen price, SEC, CAPEX, MECH undo/pump/blower, `cases/dac.js`, `attachFreight` clamp, Network plant list, abundance, Maglut.

## Leftovers

- Liquefaction of gaseous electrolyzer O₂ is not modeled (band understates real LOX offtake cost).
- `attachFreight` clamps net sale `unitPrice` at 0; honest −$0.03/kg does not hit cash.
- green-ft / green-mto / green-urea / green-ammonia O₂ stay plant-gate (above Linde 15–200 t/y band; larger volumes quoted separately).
- abundance O₂ ~2 t/y stays plant-gate (below band).
- No pipeline or tube-trailer band.

## Tip

Feat `e20fb4e` on `main`. Pages published: https://akarshgopal.github.io/ultimat-sim/ (asset `e20fb4e`). `npm test` 535 pass / 0 fail. Prior checkout tip `e3ac2d6`.
