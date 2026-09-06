# Hardcoded constants audit (flowsheet branch)

**Scope:** Read-only inventory of numeric assumptions that drive physics, sizing, footprint, and economics in Molecular Foundry.  
**Date:** 2026-09-06 · **Branch:** `flowsheet`  
**Method:** Grep/read of `engine/`, `js/flowsheet-app.js`, `cases/`, and `docs/flowsheet-architecture.md`. No engine behavior changed.

**Classes**

| Class | Meaning |
| --- | --- |
| **cited** | DOI/URL/reference already attached in code, catalog `references`, or case `evidence` *and* the value is intended to come from that source (even if the paper is a family citation rather than a page-precise quote). |
| **recoverable** | Known literature / handbook / ATB value that should be cited next (or mapped to a specific table row). |
| **assumption** | Screening guess; must stay labeled as such in UI/docs until replaced. |
| **derived** | From stoichiometry, molar masses, or geometric/physical constants; OK if the formula is clear. |

**Gaps vs architecture literature table**

- `docs/flowsheet-architecture.md` cites desalination, electrolysis, DAC, PV, battery, and heat sources at the *family* level.
- Catalog entries often attach the same papers, but **several engine defaults in `units.js` still lack inline citations** (items 1–4, 6–7, 11 now cited; 8–10 labeled cited/screening). Abundance SECs/recoveries often cite only loosely related DOE/USGS pages.
- **`engine/footprint.js` now estimates site land** from panel area ÷ location-aware GCR plus order-of-magnitude process pads. Coefficients remain screening assumptions (see solar/land).
- Electrolyzer SEC defaults are aligned on alkaline **52** kWh/kg H₂ (Buttler 2018); catalog PEM **55** and coastal PEM **55** (DOE) stay as technology-specific overrides.

---

## Top 15 highest-leverage numbers to fix first

These distort “real” material–energy–land–money coupling the most when wrong:

1. **Electrolyzer `secKWhPerKgH2` (52 alkaline / 55 PEM)** — **cited** (Buttler & Spliethoff 2018). Engine, catalog alkaline, Sabatier, and horizon fallbacks are 52; PEM preset and coastal remain 55.
2. **DAC `heatKWhPerKgCO2` (1.5 solid / 2.45 liquid)** — solid **assumption** (IEA 2022 family, 5.4 GJ/t); liquid **cited** (Keith 2018 Scenario A, 8.81 GJ/t → 2.45 kWh/kg). Electroswing has no heat.
3. **DAC `electricityKWhPerKgCO2` (0.5 / 0.366 / 0.45)** — solid **assumption** (IEA family, 1.8 GJ/t); liquid **cited** (Keith 2018 Scenario C, 366 kWh/t); electroswing **cited** (Voskian & Hatton 2019 cell-work band).
4. **Site PV yield (`DAILY_PV` / `DEAD_SEA_PV` 4.59 / CF 0.24)** — coastal **cited** (PVGIS-SARAH3/ERA5 frozen 2026-09-05); Dead Sea **cited** (PVGIS frozen 2026-09-06, E_y 1674.85 → 4.59 kWh/kWp·day); catalog CF 0.24 **cited** (NREL ATB 2024 Class 8 mean 24.5% rounded).
5. **Solar GCR / panel efficiency (0.45 fixed, 20%)** — dominate site hectares; process pads are OOM floors. GCR remains **assumption**.
6. **SWRO `secKWhPerM3` = 3.5** — **cited** (Elimelech & Phillip 2011 plant SEC 3–4 kWh/m³). Value kept.
7. **SWRO `recovery` = 0.45** — **cited** (Elimelech 45–55% plant range, low end). Value kept.
8. **DAC `captureFraction` (0.9 / 0.75 / 0.5)** — liquid **cited** (Keith 2018 Table 1 74.5% rounded to 0.75); solid 0.9 and electroswing 0.5 **screening**.
9. **DAC `consumablesPerKgCO2` (0.02 / 0.01 / 0.005)** — **screening** makeup; not IEA/Keith/Voskian table values.
10. **Sabatier `electricityKWhPerKgCH4` = 1** — **screening** ancillary/compression/heat-up in a 0.4–1.5 kWh/kg band (Zapf via Baier et al. 2018, 0.4 kWh/m³ SNG heat-up). Not electrolysis. Value kept.
11. **Freight `SEA_USD_PER_T_KM` / `ROAD_USD_PER_T_KM` (0.012 / 0.08)** — **cited** (UNCTAD developing-import band ~0.011 $/t·km; WB long-haul ~0.04–0.06 vs corridor up to ~0.20). Screening corridor rates, not voyage quotes.
12. **Corridor `loss` default 0.002** — **assumption** / screening; delivered mass vs origin production. No literature default invented.
13. **Project `discountRate` 0.08 / `projectLifeYears` 20** — NPV/IRR of every demo.
14. **Brine mineral recoveries (Li/Br 0.9, Mg/salt 0.5, K/gypsum 0.7)** — abundance product slate.
15. **Product / purchase prices (CH₄ $1/kg, Li $5/kg, power $0.03/kWh, etc.)** — economic signal of coupling; all illustrative today.

---

## Solar / land

| location | symbol/value | used for | class | proposed source or action |
| --- | --- | --- | --- | --- |
| `engine/footprint.js` | panelEfficiency 20%; baseGCR 0.45 (E–W 0.75); lat spacing multiplier | Solar land from panels÷GCR | **assumption** | Location-aware GCR documented in the module assumptions array; cite NREL PV land-use later. |
| `engine/footprint.js` process pads | e.g. electrolyzer `max(24, kW×0.03)` m²; DAC `max(36, tCO₂/y×0.35)`; SWRO `max(16, m³/d×0.8)` | Process pad area | **assumption** | Keep OOM labels; do not present as surveyed footprints. |
| `js/flowsheet-app.js` UI copy | “order-of-magnitude screening” | Site footprint note | **assumption** | Keep screening wording. |
| `js/…` `solar-pv` | `capacityFactor: 0.24` | Default PV energy when not sited | **cited** | NREL ATB 2024 utility-scale PV Resource Class 8 mean AC CF 24.5% (GHI bin 4–4.25 kWh/m²/day, ILR=1.34), rounded. Inspector `sourceNote`. CAPEX 1560 unchanged. |
| `js/…` `solar-pv` | `capexPerKW: 1560`, `fixedOMPerKWYear: 20`, `lifeYears: 30`, `discountRate: 0.07` | LCOE helper / installed economics | **cited** (NREL ATB URL on catalog) | 2024 ATB year pinned in CF `sourceNote`; CAPEX 1560 kept. |
| `cases/coastal.js` | `DAILY_PV` monthly kWh/kWp; PVGIS URL + frozen JSON | Site electricity budget / `site.meteo` | **cited** | Already PVGIS-SARAH3/ERA5; keep retrieval date. First-class `site.meteo` plus root `dailyPVKWhPerKWp`. |
| `cases/coastal.js` | `solarKWp = 37.5` | Example array size | **assumption** | Demo sizing only; document as scenario knob. |
| `cases/coastal.js` / app PVGIS query | `loss=14`, `angle=30`, `aspect=0` | Yield request defaults | **recoverable** | Cite PVGIS default system loss / tilt convention. |
| `cases/coastal.js`, `cases/network.js` | PV CAPEX `$1000/kWp`, O&M `$20/kWp·y`, life 25 y | Sited solar economics override | **assumption** | Prefer catalog/ATB 1560 unless labeled “round screening CAPEX”. |
| `cases/network.js` | `DEAD_SEA_PV = 4.59` kWh/kWp·day (`1674.85/365`); monthly `DAILY_PV` frozen | Sizes Dead Sea hub PV / `site.meteo` | **cited** | PVGIS-SARAH3/ERA5 2005–2023 at 31.16°N, 35.43°E; frozen `data/pvgis-dead-sea.json` retrieved 2026-09-06. Same query params as coastal Almería. |
| `js/…` `nuclear-electricity` | CF 0.9; CAPEX 10717 / 5882 $/kW; O&M 300; var 15 $/MWh | Advanced nuclear presets | **assumption** (vendor pages cited for identity, not costs) | Keep “not vendor quotes”; cite DOE SMR cost study only for generic SMR row. |
| `engine/network.js` | Earth radius `6371.0088` km | Haversine corridor distance | **derived** | WGS84 mean radius; optional cite. |

---

## Desal / water

| location | symbol/value | used for | class | proposed source or action |
| --- | --- | --- | --- | --- |
| `units.js` / catalog `swro` | `recovery: 0.45` | Freshwater vs feed | **cited** | Elimelech & Phillip 2011: most SWRO plants operate at 45–55%; 0.45 is the low end. Inspector `sourceNote`. Value kept. |
| `units.js` / catalog | `secKWhPerM3: 3.5` (high-recovery preset 4.5) | SWRO electricity | **cited** | Elimelech & Phillip 2011 plant SEC 3–4 kWh/m³ (RO plus intake/pretreatment/posttreatment/brine). Ghaffour et al. 2013 same 3–4 kWh/m³ band with energy recovery. 3.5 kept. |
| `units.js` / catalog | `feedDensityKgM3: 1025`, `productDensityKgM3: 1000` | m³ ↔ kg | **recoverable** / **derived** | ~seawater density at 25 °C; product ≈ pure water. |
| `units.js` / catalog | `ionRejection: 0.99` (MED/MSF 0.995) | Salt passage | **recoverable** | Typical RO rejection; cite membrane handbook or Elimelech. |
| catalog `med` | recovery 0.35; elec 2; heat 60 kWhₜₕ/m³; minHeat 70 °C; waste 40 °C | MED duties | **cited** | Ghaffour et al. 2013 MED band 1.5–2.5 kWh/m³ e; 145–390 MJ/m³ ≈ 40–108 kWhₜₕ/m³. Defaults kept. Recovery 0.35 typical in that review family. |
| catalog `msf` | recovery 0.25; elec 3.5; heat 80; minHeat 90; waste 45 °C | MSF duties | **cited** | Ghaffour et al. 2013 MSF band 3–5 kWh/m³ e; 250–330 MJ/m³ ≈ 69–92 kWhₜₕ/m³. Defaults kept. Recovery 0.25 typical in that review family. |
| `cases/coastal.js` | salinity 35 g/kg as NaCl; intake 0.1 m³/day | Feed composition / budget | **cited** (NOAA assay) + **assumed** (intake right) | `site.assay` is the NaCl proxy; `site.rights.seawaterIntake` is assumed. |
| `cases/sabatier.js` default SWRO | `feedDensityKgM3: 1000`, `ionRejection: 1` | Idealized fixture | **assumption** | Intentional test idealization; do not copy to coastal without note. |
| material preset `seawater` | ~53500 mol H₂O + 550 Na/Cl | UI default seawater | **recoverable** | Align mol fractions with 35 g/kg + 1025 kg/m³ derivation. |

---

## Electrolysis

| location | symbol/value | used for | class | proposed source or action |
| --- | --- | --- | --- | --- |
| `units.js` default | `secKWhPerKgH2: 52` | Engine fallback SEC | **cited** | Buttler & Spliethoff 2018 alkaline system band; catalog `sourceNote` + inspector. |
| catalog alkaline / PEM | 52 / 55 kWh/kg H₂ | Presets | **cited** (Buttler on catalog; DOE PEM on coastal) | System-level SEC, not stack-only; PEM 55 kept. |
| `cases/coastal.js` | forces PEM 55 | Coastal methane | **cited** | DOE 2022 PEM status URL already present. |
| `cases/sabatier.js` / `solve.js` fallback | 52 | Fixture + horizon SEC | **cited** | Synced with catalog alkaline / units.js. |
| `units.js` | `waterKgPerKgH2 = M_H2O / M_H2`; O₂ = H₂/2 | Stoichiometry | **derived** | Clear from molar masses in `model.js`. |

---

## DAC

| location | symbol/value | used for | class | proposed source or action |
| --- | --- | --- | --- | --- |
| generic / `dac-solid` | capture 0.9; elec 0.5; heat 1.5 kWh/kg; minHeat 80 °C; makeup 0.02; waste 40 °C | Default solid-sorbent screening | **assumption** / **screening** | IEA DAC 2022 S-DAC family: 0.5 kWh/kg e = 1.8 GJ/t; 1.5 kWh/kg th = 5.4 GJ/t; 7.2 GJ/t at the low end of 7.2–9.5. Capture 0.9 and makeup 0.02 are screening, not IEA table values. |
| `dac-liquid` | capture 0.75; elec 0.366; heat 2.45; minHeat 900 °C; makeup 0.01 | CE-like liquid solvent | **cited** (energy + capture); makeup **screening** | Keith et al. 2018: Scenario A heat 8.81 GJ/t → 2.45 kWh/kg; Scenario C elec 366 kWh/t → 0.366 kWh/kg. Capture 0.75 is Table 1 74.5% rounded. KOH makeup 0.01 is screening. Mixed-scenario vectors. |
| `dac-electroswing` | capture 0.5; elec 0.45; makeup 0.005; no heat | ESDAC | **cited** (cell work); capture + makeup **screening** | Voskian & Hatton 2019 cell work 40–90 kJ/mol CO₂ (0.25–0.57 kWh/kg); 0.45 is in-band (~71 kJ/mol). Capture 0.5 and electrode makeup 0.005 are screening. No heat; BOP not included. |
| coastal / app air | 422.45 ppm (2024) or preset 428 ppm; O₂/N₂ simplified | Air feed | **cited** (ESSD / coastal evidence) | Keep dry-air simplification note. |
| `cases/sabatier.js` gas presets | flue 4% / 13% CO₂ | Optional richer feeds | **recoverable** | Cite EPA/IEA flue CO₂ ranges. |

---

## Synthesis

| location | symbol/value | used for | class | proposed source or action |
| --- | --- | --- | --- | --- |
| Sabatier stoich | CO₂ + 4 H₂ → CH₄ + 2 H₂O | Mass balances | **derived** | Already documented in architecture. |
| Sabatier | `electricityKWhPerKgCH4: 1` (catalog & cases) | Ancillary power | **screening** | 0.4–1.5 kWh/kg band, not electrolysis. Zapf (via Baier et al. 2018 Frontiers) 0.4 kWh/m³ SNG heat-up ≈ 0.56 kWh/kg. 1 kWh/kg kept as in-band screening. |
| ASU | N₂ recovery 0.98; O₂ 0.95; `0.25` kWh/kg N₂ | Air separation | **recoverable** | Replace vague DOE R&D link with cryogenic ASU SEC literature (~0.2–0.4 kWh/kg N₂). |
| ammonia | `0.6` kWh/kg NH₃ (+ stoich 0.5 N₂, 1.5 H₂) | Haber–Bosch power beyond H₂ | **recoverable** | Cite IEA/DOE ammonia energy; clarify this excludes electrolysis. |
| chlor-alkali | `2.5` kWh/kg NaOH; 1:1:0.5:0.5 stoich | Membrane cell screening | **recoverable** | DOE chlor-alkali profile already linked — extract SEC. |
| bromine recovery | `0.2` kWh/kg Br₂; 2 NaBr + Cl₂ | Br₂ production | **assumption** | USGS link is geography/context only; find process energy. |
| aluminium | `14` kWh/kg Al | Hall–Héroult | **recoverable** | DOE aluminium roadmap cited — confirm modern SEC ~13–15. |
| hydrogen DRI | `0.7` kWh/kg Fe (+ 1.5 H₂ stoich) | Direct electricity beside H₂ | **assumption** | Cite HYBRIT/IEA DRI; separate H₂ demand (derived) from power. |
| titanium Kroll | `8` kWh/kg Ti | Process power | **assumption** | USGS titanium cite is commodity, not SEC — find Kroll energy. |

---

## Minerals / mining

| location | symbol/value | used for | class | proposed source or action |
| --- | --- | --- | --- | --- |
| brine-minerals | `electricityKWhPerKgBrine: 0.05` | Train power | **assumption** | USGS brine bulletin cited for commodities, not kWh — label OOM or find DLE/evaporation energy. |
| recoveries | Li 0.9, Br 0.9, Mg 0.5, K 0.7, gypsum 0.7, salt 0.5 | Product yields | **assumption** | Optimistic screening; cite specific DLE / solar-pond recoveries per ion. |
| abundance / preset brine assay | high Na/Cl/Mg/… Li⁺ 10 mol/day scale | Feed composition | **screening** | Dead Sea `site.assay` labels this screening; Wikipedia composition is context, not this mol vector. |
| abundance product prices | Li 5, Br₂ 3, NH₃ 0.6, NaOH 0.5, … $/kg | Revenue | **assumption** | Illustrative; cite USGS commodity summaries when hardening. |
| purchase costs | brine 0.0002, salt 0.08, water 0.001, power 0.03 $/native-unit | OPEX | **assumption** | Same. |

---

## Heat

| location | symbol/value | used for | class | proposed source or action |
| --- | --- | --- | --- | --- |
| MED/MSF/DAC waste heat T | 40–100 °C defaults | Reject heat grade | **assumption** | Screening reject temperature for cascade eligibility. |
| coastal heat budget | 30 kWh/day @ 100 °C | DAC heat supply | **assumption** | Explicitly noted unverified in site notes. |
| `solar-thermal` | sunHours 6; T 150 °C; CAPEX 1000 $/kWₜₕ | Process heat source | **assumption** (DOE process-heat page linked) | Map to DOE/NREL CSP or flat-plate cost & yield. |
| `thermal-storage` | η 0.95; ΔT loss 5 °C; CAPEX 30 $/kWhₜₕ | Heat shift | **assumption** | Cite DOE TES ranges. |
| `battery` | η 0.95; CAPEX 400 $/kWh | Electrical storage | **recoverable** | NREL ATB battery URL already on catalog — pin 2024 case. |
| coastal `storage.efficiency` | 0.9 | Horizon battery default | **assumption** | Align with catalog 0.95 or document RTE vs one-way. |

---

## Economics / freight

| location | symbol/value | used for | class | proposed source or action |
| --- | --- | --- | --- | --- |
| `economics.js` / app / cases | `periodDays: 365`, `projectLifeYears: 20`, `discountRate: 0.08` | DCF defaults | **assumption** | Finance convention; document; allow site override. |
| `network.js` | `SEA_USD_PER_T_KM = 0.012`, `ROAD_USD_PER_T_KM = 0.08` | Corridor freight | **cited** | Sea: UNCTAD Trade-and-Transport Dataset developing-economy import intensity ~0.011 $/t·km (developed ~0.019). Road: WB/Arvis industrial long-haul ~0.04–0.06 vs LLDC/corridor up to ~0.20 (Central America ~0.17). Screening OOM, not a voyage quote. Values kept. |
| `network.js` | corridor `loss ?? 0.002` | Transit mass loss | **assumption** | Screening default; not a literature factor. Commodity-specific losses later. |
| sabatier case CAPEX lumps | DAC 16425, electrolyzer 21000, Sabatier 14000, SWRO 1000 | Installed costs at demo scale | **assumption** | Scale-inconsistent with $/kW catalog; label toy CAPEX or derive from rates × capacity. |
| fixed O&M | 3–4% of CAPEX (cases); converter UI default 3% | Annual O&M | **assumption** | Common TEA rule of thumb — cite ATB O&M fractions where applicable. |
| electrolyzer `assetLifeYears: 10` | Replacement in cash flows | **recoverable** | Stack life literature / DOE H2 targets. |
| grid | `pricePerMWh: 100`, `kgCO2PerMWh: 400` | Import tariff / emissions display | **assumption** | Site-specific; cite EIA/EMBER when used. |
| methane sale | `unitPrice: 1` $/kg | Revenue | **assumption** | ~$28/MMBtu order — label illustrative vs HHV gas price. |
| Earth / period math | kg/day × 365 → t/y | Annualization | **derived** | Clear; note leap years ignored. |

---

## Literature table vs code (summary)

| Architecture family | Papers listed | What code actually uses | Gap |
| --- | --- | --- | --- |
| Seawater desalination | Elimelech 2011; Ghaffour 2013 | SWRO 0.45 / 3.5 in Elimelech plant 45–55% and 3–4 kWh/m³; MED/MSF Ghaffour elec/heat bands | **cited**; defaults kept. Ion rejection still unpinned. |
| Electrolysis | Buttler & Spliethoff 2018 | Default / alkaline 52; PEM 55 | **cited**; PEM 55 also DOE-cited in coastal. |
| DAC | IEA 2022; Keith 2018; Voskian 2019 | Solid screening 0.5/1.5 with IEA GJ/t note; liquid Keith A heat / C elec / Table 1 capture 74.5%→0.75; electroswing 0.45 in 40–90 kJ/mol | Solid energy **assumption**; liquid and electroswing energy **cited**. Capture 0.9/0.5 and all makeup **screening**. |
| Electricity / storage / heat | NREL ATB; DOE heat/TES; NRC/Valar; PVGIS | PV CF 0.24 = ATB 2024 Class 8 (24.5% rounded); coastal + Dead Sea PVGIS frozen; nuclear costs user-assumption; land from `footprint.js` GCR | GCR/pads remain screening. |
| Abundance minerals / metals | USGS/DOE links on catalog | Recoveries & many SECs screening | Citations do not substantiate the numeric defaults. |

---

## Derived constants (OK; low priority)

| location | symbol/value | used for | class | notes |
| --- | --- | --- | --- | --- |
| `engine/model.js` | IUPAC-style molar masses | All mass conversions | **derived** | Keep registry; optional cite IUPAC. |
| electrolyzer / sabatier / reaction blocks | Stoichiometric coefficients | Balances | **derived** | Documented. |
| coastal / sabatier helpers | `H2_KG_PER_KG_CH4`, etc. | Setpoint sizing | **derived** | From molar masses. |

---

## Recommended next actions (documentation / citation only — not this pass)

1. ~~Single source of truth for electrolyzer SEC presets; engine default = catalog alkaline.~~ Done: 52 kWh/kg H₂ (Buttler 2018) with inspector `sourceNote`.
2. Add inline `basis` / DOI fields on remaining catalog `params` defaults (electrolyzer, DAC energy, solar-pv CF, SWRO, MED/MSF, and Sabatier now have `sourceNote`).
   - ~~Dead Sea screening 5.4 kWh/kWp·day / catalog CF unpinned / freight uncited.~~ Done: PVGIS frozen 4.59 (2026-09-06); ATB 2024 Class 8 CF 0.24; UNCTAD/WB freight 0.012/0.08. Corridor loss 0.002 remains **assumption**.
   - ~~SWRO 3.5 / 0.45 unpinned.~~ Done: Elimelech & Phillip 2011 plant 3–4 kWh/m³ and 45–55%; Ghaffour 2013 on SWRO refs. Values kept.
   - ~~MED/MSF family cites only.~~ Done: Ghaffour elec/heat/recovery bands in inspector `sourceNote`. Defaults kept.
   - ~~Sabatier 1 kWh/kg CH₄ undocumented.~~ Done: screening 0.4–1.5 kWh/kg; Zapf via Baier et al. 2018. Not electrolysis.
   - ~~DAC capture/makeup unpinned.~~ Done: liquid capture Keith 2018 Table 1 74.5% rounded; solid/electroswing capture and all makeup **screening**.
3. When adding `footprint.js`, mark every pad coefficient **assumption** and retire naked `1.6` or derive it from η×GCR with a citation.
4. Split “family citation present” vs “number traced to table X” in UI literature links.
5. Mark all case `unitPrice` / lump CAPEX as `quality: 'user-assumption'` in site evidence where missing.
6. UI quality tags: `engine/uncertainty.js` labels LCOE (**cited** when NREL ATB), product cost (**screening**), land (**assumption**), and catalog intensities. Screening money uses a tilde / fewer sig figs. No fake ± error bars.
