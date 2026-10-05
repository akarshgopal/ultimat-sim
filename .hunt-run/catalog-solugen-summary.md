# CATALOG-Solugen (screening Bioforge TEA tranche)

Screening TEA for a cell-free chemoenzymatic route from quasi-abundant feeds (corn dextrose, air-derived O2, water, grid power) to gluconic acid + hydrogen peroxide. Capital-inclusive cash. Honest **cash−** at the cited prices. Intensities were not retuned to force cash+.

## What shipped

- Substances `C6H12O6`, `H2O2`, `C6H12O7` in `engine/model.js` (existing molar masses untouched).
- Unit `bioforge` via `reaction()` in `engine/units.js`. Activity is kg gluconic acid/day. No `wasteHeat` port.
- TEA pack `bioforge` ($438/(kg gluconic/day)), global prices/costs, me-levant demand keys inherited by every other region with `inherit:'me-levant'`.
- Region alias `REGION_STRING_TO_ID['US Midwest'] = 'texas'` (power $0.06/kWh, CAPEX× 1.0). No new power row or CAPEX×.
- Footprint pad `PROCESS_INTENSITIES.bioforge` 5.4 m²/(kg gluconic/h), wired like `mg-si`.
- Case `cases/bioforge.js` — Marshall, Minnesota map point, 1 t gluconic/day.
- Palette **Bio** after REE, before More; Overview optgroup `Innovative · bio`.
- Tests `tests/catalog-solugen.test.js`. Maglut/ARC-1 not added.

## Stoich

Public Bioforge description (EPA 2023 Green Chemistry; C&EN Nov 2023) is cell-free enzymatic oxidation of plant sugar that co-produces hydrogen peroxide and organic acids (gluconic and glucaric). The only published mol balance coded is glucose oxidase:

C6H12O6 + O2 + H2O → C6H12O7 + H2O2

Mass check: 180.156 + 31.9988 + 18.01528 = 196.1554 + 34.01468.

Per kg gluconic: glucose 180.156/196.1554 kg, H2O2 34.01468/196.1554 kg, electricity 0.05 kWh. Element balances close on C, H, O. No waste heat.

## SEC band

Solugen publishes no kWh/kg. Default **0.05 kWh/kg** is screening evaporation-order electricity inside the Vogelbusch MVR bioprocess table (glucose pre-concentration 19, citric pre-concentration 24, citric final concentrator 35, citric crystallizer 72 kWh/t → about 0.019–0.072 kWh/kg). 0.05 sits in that band. It is **not a Solugen meter** and does **not** include an unpublished enzyme-reactor load.

https://www.vogelbusch-biocommodities.com/en/technology/electrification/mvr-evaporation/

## CAPEX

C&EN 8 Nov 2023 “at least $90 million” for the then-75,000 t/y Marshall facility.

https://cen.acs.org/business/biobased-chemicals/Solugen-expand-biobased-chemical-production/101/web/2023/11

$90e6 / 75e6 kg/y = $1.20/(kg·y) × 365 = **$438/(kg/day)**. Stated investment floor, not a TIC. Linear small-plant intensity. Not bankable.

**Rejected as TIC:** DOE LPO $213.6M conditional commitment (Jun 2024) is a loan guarantee, not installed CAPEX.

https://solugen.com/blog/2024/06/13/solugen-secures-conditional-commitment-for-213-6m-doe-loan-guarantee-bolstering-u-s-leadership-in-green-manufacturing-and-domestic-chemical-production/

https://www.energy.gov/nepa/doeea-2246-solugen-inc-bioforge-marshall-project-marshall-minnesota

https://www.energy.gov/sites/default/files/2024-03/Solugen%20LPO%20EA_FONSI_Signed.pdf

ADM Apr 2024 “up to 120 kta” has no new dollar figure — not recomputed.

https://www.adm.com/en-us/news/news-releases/2024/4/solugen-breaks-ground-on-bioforge-marshall-facility-bolstering-u-s.--biomanufacturing-capabilities/

US Midwest aliases to texas so CAPEX× stays 1.0. Not a Minnesota location factor.

## Prices (global, no regional overlay)

| Key | $/kg | Basis |
|---|---:|---|
| gluconic | 0.515 | ChemAnalyst China Q1 2025 average USD 515/MT (OpenPR). Asia spot screening, not a US contract. Kept 0.515. |
| hydrogen-peroxide | 0.674 | IndexBox US 2024 average export price $674/t. Concentration basis not stated. Not the Nov 2024 $950/t 70% Illinois quote, not 100% equivalent. |
| dextrose (cost) | 0.84 | Tridge US 2024 export low. Not an ADM transfer price. No invented Midwest plant-gate. |

Demand (me-levant base; every other region inherits with `inherit:me-levant`, no override):

- gluconic 7.5e7 kg/year — DOE EA-2246 Marshall phased nameplate 75 kta, used as a global screening offtake ceiling. Not world market and not a contract.
- hydrogen-peroxide 1e8 kg/year — conservative 100 kt/y, about one tenth of ~1 Mt US 2024 H2O2 consumption (IndexBox). Not the full market, concentration basis not stated, not a contract.

Power: `bindCost('power', { region: 'US Midwest' })` → texas overlay **$0.06/kWh**. Not an Xcel tariff.

## Demo scale and cash (solved `createBioforgeCase`, 365 d, CRF 8%/20 y)

1,000 kg gluconic/day (1 t/day) at Marshall, Minnesota map point (44.447, −95.788). Feed margin 1.02 on dextrose, water, oxygen, and electricity so the unit is not feed-limited. Purchased electricity-source (not grid-electricity, not PVGIS). Oxygen is an air-derived pure-O2 stand-in with **no unitCost** (ASU not modeled, N2 ballast omitted).

| Line | $/year |
|---|---:|
| Annual revenue | 230,635 |
| Feed purchases | 282,721 |
| Fixed O&M | 17,520 |
| Variable O&M | 0 |
| Annualized CAPEX | 44,611 |
| **Net cash (R − OPEX − annualized CAPEX)** | **−114,217** |

Installed CAPEX $438,000. Revenue is 365 t/y gluconic @ $0.515 plus 63.3 t/y H2O2 @ $0.674. Purchases are consumed dextrose @ $0.84/kg, process water, and 50 kWh/day @ $0.06/kWh. Screening gate cash is **negative**. Dextrose at the export-low still outruns the Asia-spot acid plus US-export H2O2. Honest: not retuned. Not the Solugen plant, not an ADM contract, not bankable.

Computed `annualNetCash` = **−114217.17791309254**.

## Palette

`PALETTE_CATEGORIES` Bio: `['bioforge']` after REE and before More. Not in `PALETTE_MORE_UNITS`. Not in `PALETTE_DEFAULT_OPEN` (same as REE). Overview optgroup label exactly `Innovative · bio`, option Marshall Bioforge gluconic + H₂O₂.

## Maglut skipped

Maglut ARC-1 (water-based chromatography) is still not a unit. Public data remain purity and recovery only — no public kWh/kg or CAPEX intensity. Do not invent a block.

## Glucaric skipped

Glucaric acid is a further metal-catalyst oxidation. No public mol split is available. No glucaric mode, yield, or substance.

## Enzyme consumable skipped

No public enzyme g/kg or $/kg. Makeup is omitted rather than invented.

## No PVGIS

Purchased electricity-source at the Texas/US industrial overlay. No frozen PVGIS series, no solar array, no Marshall irradiance fetch. `gridImport` is unverified because power is not a utility interconnection.

## Leftovers

- Enzyme reactor electrical load unpublished — MVR-family 0.05 kWh/kg stands in for evaporation-order only.
- ASU / air-separation and N2 ballast not modeled (O2 is a free screening stand-in).
- Glucaric metal-catalyst train not modeled.
- Concentration basis for H2O2 offtake not stated in the IndexBox average.
- US contract gluconic and ADM dextrose transfer prices not used.
- $213.6M DOE loan not used as TIC; 120 kta ADM nameplate not used to recompute intensity.
- Marshall map point is not the Bioforge plot and not a concession.
- `sizeToProduct` has no gluconic / H2O2 product.
- Maglut ARC-1 still waiting on public SEC/CAPEX.

## Tests

`npm test`: **381 pass / 0 fail**. New file `tests/catalog-solugen.test.js` has 5 tests. Palette order is `minerals < fuels < water < carbon < crust < ree < bio < more`. Maglut/ARC-1 absent. Dead Sea, NH3, silicon, REE, and network cash tests untouched.
