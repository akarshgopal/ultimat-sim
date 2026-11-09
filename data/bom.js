(function exposeFoundryBom(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoundryBom = api;
})(globalThis, () => {
// Bill of materials and "idiot index" for every engine cost class.
//
// Musk's idiot index = (installed cost of a finished thing) / (cost of its raw materials at
// commodity prices). For each cost class the engine prices (PV $/kWp, battery $/kWh,
// electrolyzer $/(kg H₂/day), …) this file lists the commodity materials one unit of installed
// capacity contains, so the engine can squash each class toward its materials floor:
//
//   materialsUsdPerUnit(cls) = Σ line.kgPerUnit × COMMODITIES[line.material].usdPerKg
//                              + cls.extraUsdPerUnit (non-commodity floor items; 0 for all classes here)
//   idiotIndex(cls)          = cls.todayUsdPerUnit / materialsUsdPerUnit(cls)
//   floorFraction(cls)       = 1 / idiotIndex(cls)
//
// todayUsdPerUnit copies the repo's current assumption for that class (engine/company.js
// DEFAULTS.pv, engine/utilization.js DEFAULTS, data/tea-screening.js packs); tests/bom.test.js
// asserts they stay equal so the two cannot drift silently.
//
// Commodity prices are recent (2024–2025) bulk prices for the raw/semi-finished material
// (plate, ingot, resin, brick, powder), not fabricated parts. quality 'cited' = a named source's
// published figure (possibly unit-converted as stated); 'screening' = a blend of quotes, a
// range mid, or a value the search results gave only indirectly.
//
// Material intensities (kgPerUnit) are screening engineering estimates anchored where possible
// to published intensities (cited in each class's sources). They are meant to be right to
// within ~±50% on the total, which is enough for an idiot index (an order-of-magnitude ratio).
// Screening, not bankable.

const SCHEMA_VERSION = 1;

const TROY_OZ_KG = 0.0311034768;
const CNY_PER_USD = 7.2; // 2024 average order, used for Chinese spot quotes below

// ── Commodity price sources (every URL was seen in a search result) ──────────────────────────
const WB_PINK_2026_02 = 'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Pink-Sheet-February-2026.pdf';
const WB_PINK_2026_01 = 'https://thedocs.worldbank.org/en/doc/18675f1d1639c7a34d463f59263ba0a2-0050012025/related/CMO-Pink-Sheet-January-2026.pdf';
const METALCHARTS_NI_2024 = 'https://metalcharts.org/nickel-price-history/2024';
const BIGMINT_STEEL_2024 = 'https://bigmint.co/insights/detail/global-steel-raw-material-prices-weaken-in-cy-24-will-new-year-bring-cheer-612447';
const SMU_HRC_2024 = 'https://steelmarketupdate.com/2024/11/12/nucor-raises-hot-rolled-spot-price-to-750-ton';
const FM_SS304 = 'https://www.fastmarkets.com/commodity-price/stainless-steel-cold-rolled-coil-2mm-grade-304-export-fob-china-mb-sts-0282';
const SMM_SS304_2024 = 'https://news.metal.com/newscontent/102728346/';
const USGS_TI_2025 = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-titanium.pdf';
const STATISTA_TI_SPONGE = 'https://statista.com/statistics/1394433/price-of-titanium-sponge-metal-united-states';
const USGS_PGM_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-platinum-group.pdf';
const USGS_MIS_PGM_2025_03 = 'https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/media/files/mis-202503-plati.pdf';
const SMM_SOLAR_GLASS = 'https://metal.com/en/prices/202206230001';
const SMM_SOLAR_GLASS_NOV24 = 'https://news.metal.com/newscontent/103058234/SMM-Analysis:-November-Glass-Prices-Decline-as-Major-Firms-Cut-Production';
const PVMAG_POLYSI_2024 = 'https://www.pv-magazine.com/2024/10/04/production-closures-bump-poly-price/';
const BERNREUTER_POLYSI = 'https://www.bernreuter.com/polysilicon/price-trend/';
const USGS_LI_2025 = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-lithium.pdf';
const USGS_LI_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-lithium.pdf';
const BENCHMARK_ANODE_2025 = 'https://a.storyblok.com/f/333611/x/fbd8539c02/anodes-price-assessment-full-assessment-15-may-2025-2.pdf';
const FASTMARKETS_GRAPHITE_2024 = 'https://fastmarkets.com/uploads/2024/09/Graphite-spotlight-August-2024.pdf';
const SMM_FEPO4_2024 = 'https://news.metal.com/newscontent/102770389/weekly-iron-phosphate-price-review';
const SMM_FEPO4_REVIEW_2024 = 'https://news.metal.com/newscontent/103128366/smm-analysis-2024-iron-phosphate-market-review-overcoming-challenges-and-looking-forward-to-a-bright-future';
const CONCRETE_NETWORK = 'https://www.concretenetwork.com/concrete-prices.html';
const CHEMORBIS_PE_2024 = 'https://www.chemorbis.com/en/plastics-news/China-SE-Asia-PE-outlook-for-2025-Oversupply-dilemma-deepens-with-new-capacity-surge/2024/12/17/920448&isflashhaber=true';
const PROCUREMENT_HDPE = 'https://procurementresource.com/resource-center/high-density-polyethylene-price-trends';
const IMARC_FLUOROPOLYMER = 'https://www.imarcgroup.com/fluoropolymer-pricing-report';
const INDEXBOX_FIREBRICK = 'https://www.indexbox.io/store/world-firebrick-refractory-materials-market-analysis-forecast-size-trends-and-insights/';
const INDEXBOX_FIRECLAY_UK = 'https://www.indexbox.io/blog/fireclay-united-kingdom-market-overview-2024-3/';

// ── Class / intensity sources ────────────────────────────────────────────────────────────────
const IRENA_RPGC_2023 = 'https://www.irena.org/Publications/2024/Sep/Renewable-Power-Generation-Costs-in-2023';
const PVMAG_IRENA_2023 = 'https://www.pv-magazine.com/2024/09/27/global-average-solar-lcoe-stood-at-0-044-kwh-in-2023-says-irena/';
const REMPD_SOLAR = 'https://apps.openei.org/REMPD/overview/solar';
const WOODMAC_PV_METALS = 'https://www.woodmac.com/ja/news/opinion/harnessing-the-sun-how-rising-solar-power-demand-impacts-base-metals/';
const FRAUNHOFER_PV_REPORT = 'https://www.ise.fraunhofer.de/content/dam/ise/de/documents/publications/studies/Photovoltaics-Report.pdf';
const ITRPV16_TAIYANG = 'https://taiyangnews.info/technology/vdma-releases-itrpv-16-edition';
const ITRPV17_PVTECH = 'https://www.pv-tech.org/itrpv-2026-solar-industry-maintains-historic-learning-curve-despite-market-turbulence/';
const NREL_ATB_BATT_2024 = 'https://atb.nrel.gov/electricity/2024/utility-scale_battery_storage';
const BATTERYDESIGN_LFP = 'https://www.batterydesign.net/chemistry/lithium-ion-chemistry/lithium-iron-phosphate/';
const SMM_LFP_2024 = 'https://news.metal.com/newscontent/103135433/LFP-to-Hit-a-New-High-Again-in-2024!-A-Quick-Overview-of-the-Annual-Industry-Analysis-[SMM-Analysis]';
const NREL_PEM = 'https://www.nrel.gov/docs/fy24osti/87625.pdf';
const DOE_H2 = 'https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis';
const MININGTECH_NI_ELY = 'https://www.mining-technology.com/features/why-critical-minerals-wont-hamper-the-green-hydrogen-revolution/';
const PLATINUM_INV_IR = 'https://platinuminvestment.com/about/60-seconds-in-platinum/2023/08/17';
const HFN_IR = 'https://www.hydrogenfuelnews.com/pem-electrolyzer-iridiums-supply/8569327';
const DNB_PEM_TI = 'https://d-nb.info/133796798X/34';
const FRAUNHOFER_ELY_SUPPLY = 'https://www.ise.fraunhofer.de/content/dam/ise/de/downloads/pdf/electrolysis_supply_chains.pdf';
const TSE_NAFION = 'https://thundersaidenergy.com/downloads/nafion-membranes-costs-and-hydrogen-crossover/';
const GHAFFOUR_2013 = 'https://doi.org/10.1016/j.desal.2013.08.011';
const VOUTCHKOV_2018 = 'https://doi.org/10.1016/j.desal.2017.10.033';
const WRC_SWRO_2023 = 'https://wrcwebsite.azurewebsites.net/wp-content/uploads/mdocs/WW%20May%20-%20June%202023_DESALINATION.pdf';
const PNNL_SWRO_LCA = 'https://tethys.pnnl.gov/publications/environmental-life-cycle-assessment-seawater-reverse-osmosis-desalination-plant';
const IEA_DAC = 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary';
const NASEM_DAC = 'https://doi.org/10.17226/25259';
const KEITH_2018 = 'https://www.hks.harvard.edu/publications/process-capturing-co2-atmosphere';
const SIMON_2023_DAC = 'https://carbondioxide-removal.eu/2023/03/14/simon-2023-material-flows-and-embodied-energy-of-direct-air-capture-a-cradle-to-gate-inventory-of-selected-technologies/';
const WRI_DAC = 'https://publications.wri.org/scaling-dac-in-the-us';
const PVMAG_FIREBRICK_2024 = 'https://www.pv-magazine.com/2024/09/23/firebrick-thermal-energy-storage-could-reach-170-gw-in-the-u-s-by-205/';
const MIT_FIRES = 'https://dspace.mit.edu/handle/1721.1/112390';
const DOE_H2_STORAGE_2016 = 'https://www.hydrogen.energy.gov/pdfs/review16/pd109_feng_2016_o.pdf';
const ORNL_H2_VESSEL = 'https://info.ornl.gov/sites/publications/Files/Pub41882.pdf';
const NIST_H2_DENSITY = 'https://www.nist.gov/publications/standardized-equation-hydrogen-gas-densities-fuel-consumption-applications';
const WIKI_LANG = 'https://en.wikipedia.org/wiki/Lang_factor';
const LIBRETEXTS_LANG = 'https://eng.libretexts.org/Bookshelves/Chemical_Engineering/Foundations_of_Chemical_and_Biological_Engineering_I_(Verret_Qiao_Barghout)/06%3A_Process_Economics/6.03%3A_Lang_Factor_and_Return_on_Investment';
const ENGTIPS_VESSEL = 'https://eng-tips.com/threads/pressure-vessel-cost-estimate.144737';
const POLIMI_PLANT_ECON = 'https://pselab.chem.polimi.it/wp-content/uploads/2015/01/L8-Plant-Economics.pdf';

// ── Commodities ($/kg) ───────────────────────────────────────────────────────────────────────
const COMMODITIES = {
  steel: {
    usdPerKg: 0.65,
    quality: 'screening',
    source: 'Hot-rolled coil 2024: China FOB avg ~$520/t (BigMint); US ~$640–800/short ton (SMU) ≈ $0.71–0.88/kg',
    url: BIGMINT_STEEL_2024,
    note: 'Carbon steel plate/structural/HRC proxy. Blend of China export HRC (2024 avg $520/t FOB, BigMint) and US mill HRC (2024 range ~$640–800 per short ton, SMU/Nucor CSP) → $0.65/kg. Plate and galvanised sections carry a premium; Cr-Mo seamless tube more. TeaScreening.prices.steel ($0.40/kg) is a DRI/billet sale proxy, not this.',
    evidence: [
      { label: 'BigMint: China HRC offers averaged $520/t FOB in CY2024', url: BIGMINT_STEEL_2024 },
      { label: 'SMU: Nucor hot-rolled CSP $750/st (Nov 2024)', url: SMU_HRC_2024 },
    ],
  },
  'stainless-steel': {
    usdPerKg: 2.0,
    quality: 'screening',
    source: '304 CRC 2mm export FOB China ~$2,000–2,060/t (Fastmarkets); Wuxi 304 CRC 14,050–14,350 CNY/t (SMM, Apr 2024)',
    url: FM_SS304,
    note: 'Grade 304 cold-rolled coil. 14,200 CNY/t incl. 13% VAT ≈ $1.75/kg ex-VAT domestic China; export FOB ≈ $2.0/kg. 316L / duplex cost ~1.3–2× more (noted where used).',
    evidence: [
      { label: 'Fastmarkets: stainless CRC 2mm grade 304 export FOB China $/t', url: FM_SS304 },
      { label: 'SMM: #304 CRC Wuxi 14,050–14,350 yuan/mt (24 Apr 2024)', url: SMM_SS304_2024 },
    ],
  },
  aluminium: {
    usdPerKg: 2.419,
    quality: 'cited',
    source: 'World Bank Pink Sheet: aluminum 2024 annual average $2,419/mt',
    url: WB_PINK_2026_01,
    note: 'LME primary ingot, 2024 annual average. Extruded frames/profiles cost ~$3.5–5/kg; the floor uses ingot.',
    evidence: [{ label: 'World Bank CMO Pink Sheet (Jan 2026): aluminum 2024 = $2,419/mt', url: WB_PINK_2026_01 }],
  },
  copper: {
    usdPerKg: 9.142,
    quality: 'cited',
    source: 'World Bank Pink Sheet: copper 2024 annual average $9,142/mt',
    url: WB_PINK_2026_02,
    note: 'LME grade-A cathode, 2024 average (2025: $9,947/mt). TeaScreening.prices["copper-cathode"] uses $9.7/kg.',
    evidence: [{ label: 'World Bank CMO Pink Sheet (Feb 2026): copper 2023/2024/2025 = 8,490 / 9,142 / 9,947 $/mt', url: WB_PINK_2026_02 }],
  },
  nickel: {
    usdPerKg: 16.814,
    quality: 'screening',
    source: 'Nickel 2024 annual average $16,814/t (metalcharts, from World Bank/LME annual data)',
    url: METALCHARTS_NI_2024,
    note: 'LME class-1 nickel 2024 average, −21.9% vs 2023. Screening only because the figure was read from a secondary aggregator of the World Bank/LME series, not the Pink Sheet row itself.',
    evidence: [
      { label: 'metalcharts.org nickel price history 2024 (World Bank/LME annual average $16,814/t)', url: METALCHARTS_NI_2024 },
      { label: 'World Bank CMO Pink Sheet (Feb 2026) — nickel row, family check', url: WB_PINK_2026_02 },
    ],
  },
  titanium: {
    usdPerKg: 10,
    quality: 'screening',
    source: 'Ti sponge: USGS-based US estimate ~$12/kg (2023); 2024 scrap imports $8.50/kg (USGS MCS 2026)',
    url: USGS_TI_2025,
    note: 'Sponge (not mill product). US 2023 estimate ~$12/kg; Chinese sponge lower; 2024 scrap $8.50/kg → screening $10/kg. Ti sheet/felt for PEM PTLs/BPPs sells at many times this — that gap is idiot index, not material. TeaScreening.prices.titanium uses $8/kg.',
    evidence: [
      { label: 'USGS MCS 2025 titanium', url: USGS_TI_2025 },
      { label: 'Statista (USGS chart): US titanium sponge price, 2023 est. ~$12/kg', url: STATISTA_TI_SPONGE },
    ],
  },
  platinum: {
    usdPerKg: 955 / TROY_OZ_KG, // ≈ $30,700/kg
    quality: 'cited',
    source: 'World Bank Pink Sheet: platinum 2024 annual average $955/troy oz',
    url: WB_PINK_2026_02,
    note: '$955/ozt ÷ 0.0311035 kg/ozt ≈ $30,700/kg (2025 average $1,278/ozt).',
    evidence: [{ label: 'World Bank CMO Pink Sheet (Feb 2026): platinum 2023/2024/2025 = 966 / 955 / 1,278 $/ozt', url: WB_PINK_2026_02 }],
  },
  iridium: {
    usdPerKg: 4810 / TROY_OZ_KG, // ≈ $154,600/kg
    quality: 'screening',
    source: 'USGS Mineral Industry Surveys PGM: iridium ~$4,810/troy oz (2024 annual column)',
    url: USGS_MIS_PGM_2025_03,
    note: '$4,810.40/ozt in the annual column of the USGS monthly PGM tables (read as the 2024 average; March 2025 $4,300/ozt; Metals Focus: ~$4,000/oz floor in 2024). USGS MCS 2026: 2025 average below 2024. ≈ $154,600/kg. Screening because the column label was inferred.',
    evidence: [
      { label: 'USGS Mineral Industry Surveys, PGM, March 2025 (iridium annual and monthly prices)', url: USGS_MIS_PGM_2025_03 },
      { label: 'USGS MCS 2026 platinum-group metals (iridium 2025 vs 2024)', url: USGS_PGM_2026 },
    ],
  },
  silver: {
    usdPerKg: 28.3 / TROY_OZ_KG, // ≈ $910/kg
    quality: 'cited',
    source: 'World Bank Pink Sheet: silver 2024 annual average $28.3/troy oz',
    url: WB_PINK_2026_02,
    note: '$28.3/ozt ≈ $910/kg (2025 average $39.8/ozt ≈ $1,280/kg — PV silver cost rises ~40% at 2025 prices).',
    evidence: [{ label: 'World Bank CMO Pink Sheet (Feb 2026): silver 2023/2024/2025 = 23.4 / 28.3 / 39.8 $/ozt', url: WB_PINK_2026_02 }],
  },
  'solar-glass': {
    usdPerKg: 23 / CNY_PER_USD / 8.0, // ≈ $0.40/kg
    quality: 'screening',
    source: 'SMM 3.2 mm coated PV glass 2024: ~25.5 CNY/m² (H1) → 20.5–21.5 CNY/m² (Nov)',
    url: SMM_SOLAR_GLASS,
    note: '2024 mid ≈ 23 CNY/m² ÷ 7.2 CNY/USD ≈ $3.19/m²; 3.2 mm × 2.5 kg/m²/mm = 8.0 kg/m² → ≈ $0.40/kg. Tempered, AR-coated, low-iron rolled glass (already a semi-finished good, so a slightly generous floor). Compare float glass $0.45/kg in TeaScreening.prices["float-glass"].',
    evidence: [
      { label: 'SMM single-coated 3.2mm PV glass price, CNY/m²', url: SMM_SOLAR_GLASS },
      { label: 'SMM: November 2024 glass prices decline (3.2mm 20.5–21.5 CNY/m²)', url: SMM_SOLAR_GLASS_NOV24 },
    ],
  },
  polysilicon: {
    usdPerKg: 6,
    quality: 'screening',
    source: 'China mono-grade polysilicon 2024: ~$8.5/kg (Feb) → ~$5.1/kg (H2) (OPIS via pv magazine)',
    url: PVMAG_POLYSI_2024,
    note: 'China solar-grade 2024 path CNY ~60 → ~36–40/kg; year mid ≈ $6/kg, same as TeaScreening.prices.polysilicon. Non-China polysilicon traded ~$20–30/kg (tariff-segmented).',
    evidence: [
      { label: 'pv magazine (Oct 2024): production closures bump poly price — OPIS China Mono Grade', url: PVMAG_POLYSI_2024 },
      { label: 'Bernreuter Research polysilicon price trend', url: BERNREUTER_POLYSI },
    ],
  },
  'lithium-carbonate': {
    usdPerKg: 14,
    quality: 'cited',
    source: 'USGS MCS 2025: US battery-grade Li₂CO₃ fixed-contract annual average $14,000/t in 2024',
    url: USGS_LI_2025,
    note: 'LCE. Matches TeaScreening.prices.lithium ($14/kg). USGS MCS 2026 tables show ~$11,800/t (2024, revised) and ~$9,000/t (2025): at $9/kg the battery floor falls ~$2.6/kWh.',
    evidence: [
      { label: 'USGS MCS 2025 lithium: 2024 fixed-contract average $14,000/t (−66% y/y)', url: USGS_LI_2025 },
      { label: 'USGS MCS 2026 lithium (2025 ≈ $9,000/t)', url: USGS_LI_2026 },
    ],
  },
  graphite: {
    usdPerKg: 2.7,
    quality: 'screening',
    source: 'Benchmark May 2025: low-energy synthetic anode RMB 19,250/t DDP China ≈ $2,676/t',
    url: BENCHMARK_ANODE_2025,
    note: 'Battery-grade anode material (finished active material, the cheapest grade). Fastmarkets 2024: spherical natural graphite $1.8–2.2k/t fob China; mid-energy synthetic ≈ $4,031/t.',
    evidence: [
      { label: 'Benchmark anode price assessment (15 May 2025)', url: BENCHMARK_ANODE_2025 },
      { label: 'Fastmarkets graphite spotlight Aug 2024', url: FASTMARKETS_GRAPHITE_2024 },
    ],
  },
  'iron-phosphate': {
    usdPerKg: 10500 / CNY_PER_USD / 1000, // ≈ $1.46/kg
    quality: 'screening',
    source: 'SMM: battery-grade FePO₄ 10,100–10,900 CNY/t, avg 10,500 (Apr 2024); H1 2024 10–11k CNY/t',
    url: SMM_FEPO4_2024,
    note: 'FePO₄ precursor (LFP = FePO₄ + ½Li₂CO₃ by carbothermal lithiation). 10,500 CNY/t ÷ 7.2 ≈ $1.46/kg (incl. VAT). The battery BOM carries LFP as FePO₄ + LCE, so LFP calcination is counted as manufacturing, not material.',
    evidence: [
      { label: 'SMM weekly iron phosphate price review (Apr 2024: avg 10,500 yuan/t)', url: SMM_FEPO4_2024 },
      { label: 'SMM 2024 iron phosphate market review', url: SMM_FEPO4_REVIEW_2024 },
    ],
  },
  concrete: {
    usdPerKg: 0.10,
    quality: 'screening',
    source: 'US ready-mix 2024 national average ~$180/yd³ (NRMCA via Concrete Network)',
    url: CONCRETE_NETWORK,
    note: '$180/yd³ ÷ 0.7646 m³/yd³ ≈ $235/m³ ÷ 2,400 kg/m³ ≈ $0.098/kg, delivered US. Rebar is carried as steel separately where material.',
    evidence: [{ label: 'Concrete Network: concrete prices (2024 ≈ $180/yd³)', url: CONCRETE_NETWORK }],
  },
  polymer: {
    usdPerKg: 1.1,
    quality: 'screening',
    source: 'HDPE film/injection 2024: China CIF ~$975–1,030/t, SE Asia ~$1,015–1,280/t (ChemOrbis); China spot ~$1,180/t (Procurement Resource)',
    url: CHEMORBIS_PE_2024,
    note: 'Generic commodity polymer (PE/PP/EVA/PVC/PVDF-free proxy) at ~$1.1/kg. EVA/POE encapsulant and RO membrane polymers sell higher; the floor uses resin.',
    evidence: [
      { label: 'ChemOrbis: China/SE Asia PE outlook (2024 price path)', url: CHEMORBIS_PE_2024 },
      { label: 'Procurement Resource HDPE price trend (Jan–Mar 2024)', url: PROCUREMENT_HDPE },
    ],
  },
  fluoropolymer: {
    usdPerKg: 6.1,
    quality: 'screening',
    source: 'IMARC: fluoropolymer (PTFE) China Q3 2024 ≈ $6,100/t; US ≈ $12,850/t',
    url: IMARC_FLUOROPOLYMER,
    note: 'PTFE resin as the materials proxy for PFSA ionomer (Nafion-type) in PEM membranes. Finished PFSA membrane sells at ~$500–2,000/m² (Thunder Said Energy), i.e. far above its fluoropolymer mass — that gap is idiot index.',
    evidence: [
      { label: 'IMARC fluoropolymer pricing report (2024 quarterly)', url: IMARC_FLUOROPOLYMER },
      { label: 'Thunder Said Energy: Nafion membranes ~$2,000/m²', url: TSE_NAFION },
    ],
  },
  refractory: {
    usdPerKg: 0.6,
    quality: 'screening',
    source: 'Standard fireclay firebrick ~$450–800/t ex-works; China FOB ~$450–700/t (IndexBox)',
    url: INDEXBOX_FIREBRICK,
    note: 'Fireclay/low-alumina firebrick mid $600/t. High-alumina bricks cost more. UK fireclay import avg $515/t (2024).',
    evidence: [
      { label: 'IndexBox: world firebrick refractory materials market', url: INDEXBOX_FIREBRICK },
      { label: 'IndexBox: UK fireclay market 2024 (import $515/t)', url: INDEXBOX_FIRECLAY_UK },
    ],
  },
};

// ── Classes ──────────────────────────────────────────────────────────────────────────────────
const KW_PER_KG_H2_DAY = 52 / 24; // 52 kWh/kg ⇒ 1 kg H₂/day ≈ 2.167 kW
const DAC_USD_PER_KG_DAY = 800; // TeaScreening.packs.dac.capexIntensity, $/(kg CO₂/day)

// Electrolyzer lines are written per kW and scaled to per (kg H₂/day).
const perKgDay = lines => lines.map(l => ({ ...l, kgPerUnit: l.kgPerKW * KW_PER_KG_H2_DAY }));

const ALKALINE_PER_KW = [
  { material: 'nickel', kgPerKW: 0.8, note: 'Ni electrodes/meshes/coatings; IEA ~1 t/MW (via Mining Technology), industry 0.15–0.5 t/MW' },
  { material: 'steel', kgPerKW: 20, note: 'stack end plates/tie rods + BoP: gas–lye separators, KOH tanks, piping, skids, structure' },
  { material: 'stainless-steel', kgPerKW: 3, note: 'lye/gas piping, scrubbers, instrument manifolds' },
  { material: 'copper', kgPerKW: 1.0, note: 'rectifier transformer windings, DC busbars, cabling' },
  { material: 'aluminium', kgPerKW: 0.3, note: 'busbars/enclosures' },
  { material: 'polymer', kgPerKW: 0.5, note: 'Zirfon-type separators (PPS + ZrO₂ proxied as polymer), gaskets, frames' },
  { material: 'concrete', kgPerKW: 50, note: 'foundations and building slab' },
];
const PEM_PER_KW = [
  { material: 'iridium', kgPerKW: 0.0004, note: 'anode IrOx ~0.4 g/kW today (≈400 kg/GW; thrifting to 0.1 g/kW near-market)' },
  { material: 'platinum', kgPerKW: 0.0001, note: 'cathode Pt/C ~0.1 g/kW' },
  { material: 'titanium', kgPerKW: 0.5, note: 'PTLs + bipolar plates (>500 kg per 1 MW stack, German 1 MW case)' },
  { material: 'fluoropolymer', kgPerKW: 0.1, note: 'PFSA membrane ~0.36 kg/m² × ~0.26 m²/kW + ionomer' },
  { material: 'stainless-steel', kgPerKW: 4, note: 'end plates, DI-water loop, separators, piping' },
  { material: 'steel', kgPerKW: 12, note: 'BoP skids, tanks, structure (no lye loop)' },
  { material: 'copper', kgPerKW: 1.0, note: 'rectifier transformer, busbars, cabling' },
  { material: 'aluminium', kgPerKW: 0.3, note: 'busbars/enclosures' },
  { material: 'polymer', kgPerKW: 0.3, note: 'gaskets, frames, hoses' },
  { material: 'concrete', kgPerKW: 40, note: 'foundations and building slab' },
];

const CLASSES = {
  pv: {
    unit: 'kWp',
    todayUsdPerUnit: 758,
    todaySource: 'IRENA RPGC 2023 utility PV global weighted avg (engine/company.js DEFAULTS.pv.capexUsdPerKWp)',
    lines: [
      { material: 'steel', kgPerUnit: 60, note: 'galvanised single-axis tracker/fixed racking + driven piles; 60–67 t/MW' },
      { material: 'solar-glass', kgPerUnit: 39, note: '~75% of 11.6 kg/m² module mass × 4.46 m²/kWp (22.4% modules)' },
      { material: 'aluminium', kgPerUnit: 8, note: 'module frames (~1.2 kg/m²) + inverter/cable Al; literature 6–21 kg/kW' },
      { material: 'copper', kgPerUnit: 4, note: 'ribbons, DC/AC cabling, inverter + transformer; 2.3–4.6 t/MW' },
      { material: 'polysilicon', kgPerUnit: 2.0, note: '≈2.0 g/W incl. kerf loss (ITRPV: 1.7–1.8 g/W TOPCon in 2026)' },
      { material: 'silver', kgPerUnit: 0.010, note: 'cell metallisation ≈9–13 mg/W (ITRPV 2024 fleet ≈9 mg/W, TOPCon ≈10–13)' },
      { material: 'polymer', kgPerUnit: 5.8, note: 'EVA/POE encapsulant + backsheet/junction box ≈1.3 kg/m²' },
      { material: 'concrete', kgPerUnit: 15, note: 'inverter/substation pads, roads excluded' },
    ],
    extraUsdPerUnit: 0,
    quality: 'screening',
    sources: [
      { label: 'IRENA Renewable Power Generation Costs in 2023 (utility PV $758/kW)', url: IRENA_RPGC_2023 },
      { label: 'pv magazine summary of IRENA 2023 costs', url: PVMAG_IRENA_2023 },
      { label: 'NREL REMPD: utility PV material intensities by component', url: REMPD_SOLAR },
      { label: 'Wood Mackenzie: solar demand and base metals (Al ~21 kg/kW)', url: WOODMAC_PV_METALS },
      { label: 'Fraunhofer ISE Photovoltaics Report (module mass)', url: FRAUNHOFER_PV_REPORT },
      { label: 'ITRPV 16th ed. via TaiyangNews (silver ≈9 mg/W in 2024)', url: ITRPV16_TAIYANG },
      { label: 'ITRPV 17th ed. via PV Tech (polysilicon g/W)', url: ITRPV17_PVTECH },
    ],
    note: 'Utility-scale c-Si (glass-backsheet or glass-glass) on steel trackers. Materials ≈ $140/kWp: copper, steel, aluminium dominate; glass, polysilicon and silver ≈ $38 together. The module itself (~$0.10–0.15/W) is ~2× its materials; most of the idiot index sits in BoS, EPC, development and margin.',
  },
  battery: {
    unit: 'kWh',
    todayUsdPerUnit: 350,
    todaySource: 'NREL ATB 2024 utility-scale battery (4-h) order (engine/utilization.js DEFAULTS.battery.usdPerKWh)',
    lines: [
      { material: 'lithium-carbonate', kgPerUnit: 0.53, note: '2.05 kg LFP/kWh × 0.234 kg Li₂CO₃/kg LFP (½·73.9/157.8) + ~10% electrolyte LiPF₆/losses' },
      { material: 'iron-phosphate', kgPerUnit: 1.96, note: '2.05 kg LFP/kWh × 0.956 kg FePO₄/kg LFP (150.8/157.8)' },
      { material: 'graphite', kgPerUnit: 1.0, note: 'anode active material ≈ 1.0 kg/kWh (LFP ~160 Wh/kg cell, ~16% graphite)' },
      { material: 'copper', kgPerUnit: 0.55, note: 'anode foil + tabs/busbars at cell/module level' },
      { material: 'copper', kgPerUnit: 0.4, note: 'PCS/transformer/AC cabling at 0.25 kW per kWh (4-h)' },
      { material: 'aluminium', kgPerUnit: 0.7, note: 'cathode foil + prismatic cans' },
      { material: 'polymer', kgPerUnit: 0.9, note: 'separator + carbonate electrolyte solvents (proxied at polymer price)' },
      { material: 'steel', kgPerUnit: 3, note: 'racks, container/enclosure, HVAC' },
      { material: 'concrete', kgPerUnit: 10, note: 'foundation pads' },
    ],
    extraUsdPerUnit: 0,
    quality: 'screening',
    sources: [
      { label: 'NREL ATB 2024: utility-scale battery storage', url: NREL_ATB_BATT_2024 },
      { label: 'Battery Design: LFP chemistry (2.05 kg LFP per kWh; 186 Wh/kg cell 2024)', url: BATTERYDESIGN_LFP },
      { label: 'SMM: LFP 2024 annual industry analysis', url: SMM_LFP_2024 },
    ],
    note: 'Utility LFP system, 4-h, materials ≈ $27/kWh: lithium carbonate ≈ $7.4, copper ≈ $8.7, FePO₄ ≈ $2.9, graphite ≈ $2.7. II ≈ 13 — at the top of the expected 6–14 band because the $350/kWh ATB-order default is high vs 2024–25 Chinese turnkey bids (~$100–150/kWh); at 2025 lithium ($9/kg) materials fall to ≈ $24/kWh.',
  },
  electrolyzer: {
    unit: 'kg H2/day',
    todayUsdPerUnit: 3250,
    todaySource: 'data/tea-screening.js packs.electrolyzer.capexIntensity (NREL/DOE installed PEM ~$1,500/kW × 52 kWh/kg / 24 h)',
    chemistry: 'alkaline',
    kWPerUnit: KW_PER_KG_H2_DAY,
    lines: perKgDay(ALKALINE_PER_KW),
    extraUsdPerUnit: 0,
    variants: {
      alkaline: { lines: perKgDay(ALKALINE_PER_KW), note: 'default: no PGM, no titanium; nickel + steel' },
      pem: { lines: perKgDay(PEM_PER_KW), note: 'iridium dominates (~$62/kW of ~$100/kW materials at 0.4 g Ir/kW)' },
    },
    quality: 'screening',
    sources: [
      { label: 'NREL PEM electrolyzer manufacturing cost (FY24)', url: NREL_PEM },
      { label: 'DOE hydrogen production: electrolysis', url: DOE_H2 },
      { label: 'Mining Technology: IEA ~1 t Ni per MW alkaline', url: MININGTECH_NI_ELY },
      { label: 'Platinum Investment: Ir loading 400 → 100 → 30 kg/GW', url: PLATINUM_INV_IR },
      { label: 'Hydrogen Fuel News: PEM iridium ~400 kg/GW', url: HFN_IR },
      { label: 'PEM stack titanium >500 kg per 1 MW (German case study)', url: DNB_PEM_TI },
      { label: 'Fraunhofer ISE: electrolysis supply chains', url: FRAUNHOFER_ELY_SUPPLY },
    ],
    note: 'Capacity basis is kg H₂/day at 52 kWh/kg ⇒ 1 kg/day ≈ 2.17 kW. The floor represents ALKALINE (cheaper materials: ≈ $48/kW ⇒ ≈ $104/(kg/day); II ≈ 31). PEM variant ≈ $100/kW ⇒ ≈ $217/(kg/day); II ≈ 15 against the same $3,250. Note the $3,250 default is a PEM-installed number (~$1,500/kW); Chinese alkaline systems sell ~$300–500/kW (II ≈ 7–11 on alkaline materials), so most of this class\'s idiot index is installation, BoP engineering and Western FOAK pricing, not stack materials.',
  },
  desal: {
    unit: 'm3/day',
    todayUsdPerUnit: 1500,
    todaySource: 'data/tea-screening.js packs.swro.capexIntensity (screening mid of $1,000–2,500 per m³/day)',
    lines: [
      { material: 'concrete', kgPerUnit: 150, note: 'intake structures, pretreatment basins/filters, buildings, outfall diffuser' },
      { material: 'steel', kgPerUnit: 10, note: 'structural steel, carbon-steel low-pressure pipe, tanks, racks' },
      { material: 'stainless-steel', kgPerUnit: 3, note: 'HP piping, pump casings, ERDs (duplex/super-duplex in practice ≈ 2× 304 price)' },
      { material: 'polymer', kgPerUnit: 9, note: 'HDPE intake/outfall pipes (~7 kg per m³/d for ~1 km each at 200,000 m³/d), RO elements (~1.3 kg per m³/d), FRP vessels' },
      { material: 'copper', kgPerUnit: 0.5, note: 'motors (~0.2 kW per m³/d), cabling, transformers' },
    ],
    extraUsdPerUnit: 0,
    quality: 'screening',
    sources: [
      { label: 'Ghaffour et al. 2013 desalination cost review (DOI)', url: GHAFFOUR_2013 },
      { label: 'Voutchkov 2018 SWRO energy/cost (DOI)', url: VOUTCHKOV_2018 },
      { label: 'Water Wheel 2023: SWRO EPC ~$1,000 → ~$650 per m³/day at 1,000 Ml/d', url: WRC_SWRO_2023 },
      { label: 'Environmental LCA of a SWRO plant (construction inventory family)', url: PNNL_SWRO_LCA },
    ],
    note: 'Large SWRO, materials ≈ $42/(m³/day): concrete, polymer, steel/stainless, copper. II ≈ 36 at the repo\'s $1,500; mega-plants at ~$650/(m³/d) give II ≈ 15. Materials intensities are engineering estimates (no per-capacity LCI found); civil works, marine intake construction, membranes (sold at ~$500+/element) and EPC dominate cost.',
  },
  dac: {
    unit: 't CO2/yr',
    todayUsdPerUnit: DAC_USD_PER_KG_DAY * 1000 / 365, // ≈ $2,192 per (t CO₂/yr)
    todaySource: 'data/tea-screening.js packs.dac.capexIntensity $800/(kg CO₂/day) × 1000/365',
    lines: [
      { material: 'steel', kgPerUnit: 60, note: 'contactor frames, calciner/slaker/pellet reactor shells, fans, compression, structure' },
      { material: 'concrete', kgPerUnit: 250, note: 'air-contactor structures and foundations' },
      { material: 'polymer', kgPerUnit: 15, note: 'PVC structured packing / sorbent supports' },
      { material: 'stainless-steel', kgPerUnit: 5, note: 'wetted KOH/amine service, heat exchangers' },
      { material: 'refractory', kgPerUnit: 2, note: 'calciner lining (liquid-solvent route)' },
      { material: 'copper', kgPerUnit: 1.5, note: 'fan/compressor motors, power distribution' },
    ],
    extraUsdPerUnit: 0,
    quality: 'screening',
    sources: [
      { label: 'IEA Direct Air Capture 2022', url: IEA_DAC },
      { label: 'NASEM 2019 Negative Emissions Technologies (DOI)', url: NASEM_DAC },
      { label: 'Keith et al. 2018 Joule — 0.98 Mt/yr KOH/Ca-loop process, engineered capex breakdown', url: KEITH_2018 },
      { label: 'Simon 2023 — material flows of DAC (cradle-to-gate inventory)', url: SIMON_2023_DAC },
      { label: 'WRI: 0.5 Gt DAC ≈ 1–3% of US steel and concrete output', url: WRI_DAC },
    ],
    note: 'Liquid-solvent (Keith 2018-type) plant used as the materials template: steel- and concrete-heavy contactors plus a calciner. Materials ≈ $105/(t/yr) ⇒ II ≈ 21. Solid-sorbent DAC adds a specialty amine sorbent (consumable, not floor material here). Intensities are screening engineering estimates; published per-capacity inventories (Simon 2023 SI) were not readable.',
  },
  thermalStore: {
    unit: 'kWh_th',
    todayUsdPerUnit: 40,
    todaySource: 'engine/utilization.js DEFAULTS.thermal.usdPerKWh (resistively charged firebrick; screening)',
    lines: [
      { material: 'refractory', kgPerUnit: 4.5, note: 'firebrick store: cp ≈ 1.0 kJ/kg·K × ΔT 800 K ⇒ 0.222 kWh_th/kg' },
      { material: 'refractory', kgPerUnit: 1.0, note: 'insulating brick/board shell (priced as fireclay; insulating grades cost more per kg)' },
      { material: 'steel', kgPerUnit: 1.5, note: 'casing, structure, air ducts/blowers' },
      { material: 'copper', kgPerUnit: 0.2, note: 'charge power ~0.2 kW per kWh_th: transformer/cabling' },
      { material: 'nickel', kgPerUnit: 0.01, note: 'NiCr/FeCrAl heater elements' },
      { material: 'concrete', kgPerUnit: 5, note: 'foundation' },
    ],
    extraUsdPerUnit: 0,
    quality: 'screening',
    sources: [
      { label: 'pv magazine 2024: firebrick storage at ~1/10 of battery $/kWh (Stanford, $6/kWh 2035)', url: PVMAG_FIREBRICK_2024 },
      { label: 'MIT FIRES firebrick resistance-heated energy storage (~$10/kWh est.)', url: MIT_FIRES },
      { label: 'IndexBox: firebrick prices', url: INDEXBOX_FIREBRICK },
    ],
    note: 'Materials ≈ $6.8/kWh_th ⇒ II ≈ 5.9. Published system estimates of $6–10/kWh are close to this materials floor, so the $40 default carries little idiot index relative to other classes.',
  },
  h2Storage: {
    unit: 'kg H2',
    todayUsdPerUnit: 600,
    todaySource: 'engine/utilization.js DEFAULTS.bufferUsdPerKg.H2 (DOE HFTO bulk storage family)',
    lines: [
      { material: 'steel', kgPerUnit: 95, note: 'Cr-Mo tube at 200 bar: shell mass/volume = 2·P·ρ/σ = 2×20 MPa×7850/250 MPa ≈ 1,256 kg/m³; H₂ ≈ 15.7 kg/m³ ⇒ 80 kg/kg; +10% heads, ÷0.9 usable ⇒ ≈ 95 kg/kg (Type I cylinders ≈ 80 kg/kg)' },
      { material: 'stainless-steel', kgPerUnit: 1, note: 'manifolds, valves, instrument tubing' },
      { material: 'concrete', kgPerUnit: 20, note: 'saddles/foundations' },
    ],
    extraUsdPerUnit: 0,
    quality: 'screening',
    sources: [
      { label: 'DOE Hydrogen Program 2016 review: steel/concrete composite stationary vessels (~$800/kg)', url: DOE_H2_STORAGE_2016 },
      { label: 'ORNL stationary H₂ vessel cost analysis', url: ORNL_H2_VESSEL },
      { label: 'NIST standardized equation for hydrogen gas densities', url: NIST_H2_DENSITY },
    ],
    note: 'Compressed-gas floor from thin-wall hoop stress: steel mass ∝ P·V/σ, while H₂ density rises sub-linearly with P, so higher pressure does not cut steel per kg. Materials ≈ $66/kg H₂ at $0.65/kg steel ⇒ II ≈ 9; Cr-Mo seamless tube trades at a premium to HRC.',
  },
  process: {
    unit: 'USD installed',
    todayUsdPerUnit: 1,
    todaySource: 'definition: $1 of installed process-plant capex (TeaScreening.packs for chlor-alkali, ASU, ammonia, …)',
    lines: [
      { material: 'steel', kgPerUnit: 0.030, note: 'equipment shells + bulk piping/structural: equipment ≈ $0.21 per $ installed (Lang 4.74) at ~$10/kg fabricated ⇒ 0.020 kg/$; piping ≈ 66% of PE $ at ~$25/kg installed ⇒ 0.0055; structural ≈ 0.005' },
      { material: 'stainless-steel', kgPerUnit: 0.004, note: '~20% of equipment mass in alloy service' },
      { material: 'concrete', kgPerUnit: 0.06, note: 'foundations, pipe-rack footings, buildings' },
      { material: 'copper', kgPerUnit: 0.001, note: 'motors, MCC, cabling' },
      { material: 'polymer', kgPerUnit: 0.002, note: 'linings, insulation jacketing, gaskets' },
    ],
    extraUsdPerUnit: 0,
    quality: 'screening',
    sources: [
      { label: 'Lang factor (fluids plant 4.74 × purchased equipment)', url: WIKI_LANG },
      { label: 'LibreTexts: Lang factor and ROI', url: LIBRETEXTS_LANG },
      { label: 'Peters/Timmerhaus FCI breakdown (piping 4–17% of FCI) — lecture notes', url: POLIMI_PLANT_ECON },
      { label: 'Eng-Tips: ASME VIII carbon-steel vessel ≈ $3/lb (2006; ≈ $10/kg escalated by CEPCI)', url: ENGTIPS_VESSEL },
    ],
    note: 'Generic chemical/metallurgical plant per $ installed. Materials ≈ $0.045 per $ ⇒ II ≈ 22 (target band 10–30). Fabricated equipment at ~$10/kg is itself ~15× its plate price; the remaining multiplier is installation labour, engineering, indirects and contingency (Lang). Steel intensity ≈ 34 t (incl. stainless) per $M installed.',
  },
};

function cls(c) {
  const row = typeof c === 'string' ? CLASSES[c] : c;
  if (!row) throw new Error(`unknown BOM class: ${c}`);
  return row;
}

function linesUsd(lines) {
  return lines.reduce((sum, l) => {
    const com = COMMODITIES[l.material];
    if (!com) throw new Error(`unknown commodity: ${l.material}`);
    return sum + l.kgPerUnit * com.usdPerKg;
  }, 0);
}

// Σ kgPerUnit × commodity price (+ extraUsdPerUnit). Pass a class key or row; optional variant key.
function materialsUsdPerUnit(c, variant) {
  const row = cls(c);
  const lines = variant ? row.variants[variant].lines : row.lines;
  return linesUsd(lines) + (row.extraUsdPerUnit || 0);
}

function idiotIndex(c, variant) {
  const row = cls(c);
  return row.todayUsdPerUnit / materialsUsdPerUnit(row, variant);
}

function floorFraction(c, variant) {
  return 1 / idiotIndex(c, variant);
}

// Material $ by commodity for a class, largest first.
function materialBreakdown(c, variant) {
  const row = cls(c);
  const lines = variant ? row.variants[variant].lines : row.lines;
  const by = {};
  for (const l of lines) by[l.material] = (by[l.material] || 0) + l.kgPerUnit * COMMODITIES[l.material].usdPerKg;
  return Object.entries(by).sort((a, b) => b[1] - a[1]).map(([material, usd]) => ({ material, usd }));
}

return {
  SCHEMA_VERSION,
  COMMODITIES,
  CLASSES,
  KW_PER_KG_H2_DAY,
  materialsUsdPerUnit,
  idiotIndex,
  floorFraction,
  materialBreakdown,
};
});
