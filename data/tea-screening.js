(function exposeTeaScreening(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TeaScreening = api;
})(globalThis, () => {
// Screening TEA intensities, offtake caps, and price bands for Foundry cash gates.
// Mid of a cited band + note. Never bankable quotes; do not invent contracts.
//
// CAPEX formula (packs): installedCapex = capexIntensity × capacity
//   × (capacity / refCapacity)^(scaleExponent − 1)  when scaleExponent and refCapacity are set;
//   otherwise installedCapex = capexIntensity × capacity (exponent omitted).
// Binders expose that as capexRate (= intensity) so evaluateEconomics uses rate × node.capacity,
// except solar-pv which precomputes installedCapex because kWp is not electricity-source capacity.
// Demand caps are regional offtake ceilings keyed by demandByRegion (me-levant default),
// not plant contracts. bindSale(key, { region }) / getDemandForRegion(region) map
// SITE_PRESETS.region strings onto those tables. Screening, not bankable quotes.

function row(value, unit, quality, source, note, evidence) {
  return { value, unit, quality, source, note, evidence };
}

const USGS_LI = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-lithium.pdf';
const USGS_BR = 'https://pubs.usgs.gov/periodicals/mcs2024/mcs2024-bromine.pdf';
const USGS_BR_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-bromine.pdf';
const USGS_K = 'https://pubs.usgs.gov/periodicals/mcs2024/mcs2024-potash.pdf';
const USGS_K_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-potash.pdf';
const USGS_SALT = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-salt.pdf';
const USGS_GYP = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-gypsum.pdf';
const USGS_MG = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-magnesium-compounds.pdf';
const NREL_DLE = 'https://doi.org/10.2172/1782801';
const NREL_ATB = 'https://atb.nrel.gov/';
const NREL_ATB_DOI = 'https://doi.org/10.25984/2377191';
const DOE_H2 = 'https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis';
const NREL_PEM = 'https://www.nrel.gov/docs/fy24osti/87625.pdf';
const IEA_NH3 = 'https://www.iea.org/reports/ammonia-technology-roadmap';
const IEA_H2 = 'https://www.iea.org/reports/global-hydrogen-review-2024';
const IEA_DAC = 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary';
const NASEM_DAC = 'https://doi.org/10.17226/25259';
const EIA_HH = 'https://www.eia.gov/dnav/ng/hist/rngwhhdm.htm';
const GHAFFOUR_2013 = 'https://doi.org/10.1016/j.desal.2013.08.011';
const VOUTCHKOV_2018 = 'https://doi.org/10.1016/j.desal.2017.10.033';
const THEMA_2019 = 'https://doi.org/10.1016/j.rser.2019.06.030';
const IRENA_MEOH = 'https://www.irena.org/publications/2021/Jan/Innovation-Outlook-Renewable-Methanol';
const IEA_ELEC = 'https://www.iea.org/reports/electricity-2024';
const DEFAULT_DEMAND_REGION_ID = 'me-levant';
const DEMAND_REGION_LABELS = {
  'me-levant': 'Dead Sea / Middle East default (Levant, Gulf, Red Sea, Arabian Sea). Not a plant offtake contract.',
  'chile-atacama': 'Atacama / Chile screening offtake. Lithium ceiling reflects USGS Chile mine-production order (supply-side, not a contract). Other minerals inherit me-levant. Not a plant offtake contract.',
  'australia': 'Australia screening offtake. Minerals inherit me-levant; USGS Australia lithium is hard-rock spodumene, not a brine offtake contract.',
  'default': 'Default screening offtake (inherits Dead Sea / Middle East tables) for unmapped site.region. Not a plant offtake contract.',
};
const DEMAND_REGION = DEMAND_REGION_LABELS[DEFAULT_DEMAND_REGION_ID];
const EDITOR_DEMAND_DEFAULT = 1e6; // kg/y screening editor seed; not unlimited offtake
// SITE_PRESETS.region / site-search Dead Sea 'Levant' → demandByRegion id. Unknown → default.
const REGION_STRING_TO_ID = {
  Levant: 'me-levant',
  Gulf: 'me-levant',
  'Red Sea': 'me-levant',
  'Arabian Sea': 'me-levant',
  'Atacama/Chile': 'chile-atacama',
  Australia: 'australia',
  India: 'default',
  'Texas/US Gulf': 'default',
  'North Africa': 'default',
  'Southern Africa': 'default',
  Europe: 'default',
};

const prices = {
  lithium: row(
    14, '$/kg', 'cited', 'USGS MCS 2025 lithium',
    'USGS MCS 2025 battery-grade Li₂CO₃ annual avg ~$14,000/t (2024e). Model product is Li salt / LiCl-like — LCE proxy for screening, not a LiCl contract.',
    [{ label: 'USGS Mineral Commodity Summaries 2025 — Lithium (battery-grade Li₂CO₃ ~$14,000/t 2024e)', url: USGS_LI }]
  ),
  bromine: row(
    3.1, '$/kg', 'cited', 'USGS MCS 2024 bromine',
    'USGS MCS 2024 bromine import unit value ~$3.10/kg (2023). Screening offtake, not a Br₂ contract.',
    [{ label: 'USGS Mineral Commodity Summaries 2024 — Bromine (import unit value ~$3.10/kg, 2023)', url: USGS_BR }]
  ),
  potash: row(
    0.35, '$/kg', 'cited', 'USGS MCS 2024 potash',
    'USGS MCS potash ~$300–400/t muriate order; mid ~$0.35/kg screening of that band. Not a KCl contract.',
    [{ label: 'USGS Mineral Commodity Summaries 2024 — Potash (~$300–400/t muriate order)', url: USGS_K }]
  ),
  salt: row(
    0.06, '$/kg', 'screening', 'industrial NaCl band',
    'Industrial NaCl ~$40–80/t band; mid ~$0.06/kg. Screening — no single USGS $/kg row pinned.',
    [{ label: 'Industrial NaCl ~$40–80/t commodity band (screening mid $0.06/kg)', url: USGS_SALT }]
  ),
  gypsum: row(
    0.02, '$/kg', 'screening', 'bulk gypsum band',
    'Bulk gypsum ~$10–30/t; mid ~$0.02/kg screening. Not a wallboard quote.',
    [{ label: 'Bulk gypsum ~$10–30/t commodity band (screening mid $0.02/kg)', url: USGS_GYP }]
  ),
  magnesium: row(
    0.08, '$/kg', 'screening', 'brine Mg compound band',
    'Brine Mg compound / MgCl₂·hexahydrate commodity band far below Mg metal; do not use Mg-metal prices. Mid ~$0.08/kg screening.',
    [{ label: 'USGS MCS magnesium compounds (family; brine compound screening mid $0.08/kg — not Mg-metal)', url: USGS_MG }]
  ),
  caustic: row(
    0.45, '$/kg', 'screening', 'NaOH commodity band',
    'NaOH ~$300–600/t commodity band; mid $0.45/kg screening. Not a caustic contract.',
    [{ label: 'NaOH ~$300–600/t commodity band (screening mid $0.45/kg)', url: null }]
  ),
  ammonia: row(
    0.45, '$/kg', 'screening', 'NH3 fertilizer band',
    'NH₃ ~$300–600/t; mid $0.45/kg screening (IEA/fertilizer market order). Not an offtake quote.',
    [{ label: 'IEA Ammonia Technology Roadmap (fertilizer-market order; screening mid $0.45/kg)', url: IEA_NH3 }]
  ),
  oxygen: row(
    0.05, '$/kg', 'screening', 'industrial O2',
    'Industrial O₂ screening ~$0.05/kg. Not a merchant-gas contract.',
    [{ label: 'Industrial oxygen screening $0.05/kg', url: null }]
  ),
  methane: row(
    1, '$/kg', 'screening', 'green-premium screening',
    'Screening green-premium offtake (~$28/MMBtu order), not Henry Hub fossil gas. EIA/Henry Hub is contrast only — not this $1/kg value.',
    [{ label: 'EIA Henry Hub (fossil-gas contrast only; not the model $1/kg CH₄)', url: EIA_HH }]
  ),
  methanol: row(
    0.4, '$/kg', 'screening', 'commodity MeOH band',
    'Screening mid of commodity methanol ~$250–500/t band ($0.40/kg). Not a plant quote.',
    [{ label: 'Commodity methanol ~$250–500/t band (screening mid $0.40/kg); not a plant quote', url: IRENA_MEOH }]
  ),
  water: row(
    0.001, '$/kg', 'screening', 'process water',
    'Process-water sale screening $0.001/kg. Not a municipal or concession tariff.',
    [{ label: 'Process water screening $0.001/kg', url: null }]
  ),
};

const costs = {
  power: row(
    0.04, '$/kWh', 'screening', 'industrial power band',
    'Utility / industrial power screening mid (~$30–50/MWh band). Not a PPA.',
    [{ label: 'Industrial power ~$30–50/MWh screening mid ($0.04/kWh); not a PPA', url: null }]
  ),
  brine: row(
    0.0005, '$/kg', 'screening', 'concession/pumping OOM',
    'Concession / pumping order-of-magnitude. Not a lease quote.',
    [{ label: 'Brine concession/pumping screening $0.0005/kg; not a lease quote', url: null }]
  ),
  water: row(
    0.001, '$/kg', 'screening', 'process water',
    'Process water screening. Not a municipal or concession tariff.',
    [{ label: 'Process water screening $0.001/kg', url: null }]
  ),
  seawater: row(
    0.001, '$/kg', 'screening', 'seawater intake',
    'Seawater intake screening (aligned with process-water OOM). Not an intake tariff.',
    [{ label: 'Seawater intake screening $0.001/kg; not an intake tariff', url: null }]
  ),
  'salt-feed': row(
    0.06, '$/kg', 'screening', 'industrial NaCl band',
    'Purchased salt-feed aligned with salt product band (~$0.06/kg). Screening, not a local quote.',
    [{ label: 'Salt-feed screening $0.06/kg, aligned with industrial NaCl product band', url: USGS_SALT }]
  ),
};

function pack({
  capexIntensity, intensityUnit, scaleExponent, refCapacity, precompute,
  fixedOmPercent, variableOm, assetLifeYears, fixedOmPerCapacity,
  quality, source, note, evidence,
}) {
  return {
    capexIntensity,
    intensityUnit,
    scaleExponent: scaleExponent ?? null,
    refCapacity: refCapacity ?? null,
    precompute: Boolean(precompute),
    fixedOmPercent: fixedOmPercent ?? 4,
    variableOm: variableOm ?? 0,
    assetLifeYears: assetLifeYears ?? 20,
    fixedOmPerCapacity: fixedOmPerCapacity ?? null,
    quality,
    source,
    note,
    evidence,
  };
}

const packs = {
  minerals: pack({
    capexIntensity: 80, intensityUnit: '$/(kg brine/day)',
    fixedOmPercent: 4, variableOm: 0.01, assetLifeYears: 20,
    quality: 'screening', source: 'NREL DLE TEA order (OSTI 1782801)',
    note: 'installedCapex = 80 $/ (kg brine/day) × capacity (scale exponent omitted). Screening brine-throughput intensity so CAPEX grows with size. Scaled from NREL TEA lithium-from-geothermal-brines (OSTI 1782801 / NREL/TP-5700-79178): example ~$52.3M CAPEX / 20,000 t/y LCE ≈ $2,615 per t-y LCE. Multi-product Dead Sea minerals ≠ Salton Sea DLE — OOM informed by that order, not a quote.',
    evidence: [
      { label: 'NREL TEA: lithium from geothermal brines (OSTI 1782801 / NREL/TP-5700-79178)', url: NREL_DLE, doi: '10.2172/1782801' },
    ],
  }),
  'chlor-alkali': pack({
    capexIntensity: 1500, intensityUnit: '$/(kg NaOH/day)',
    fixedOmPercent: 4, variableOm: 0.05, assetLifeYears: 20,
    quality: 'screening', source: 'chlor-alkali TEA order',
    note: 'installedCapex = 1500 $/ (kg NaOH/day) × capacity (scale exponent omitted). Chlor-alkali plant TEA order (~$1k/(kg/day) is world-scale OOM; this screening intensity is conservative for small plants). Not a vendor quote.',
    evidence: [{ label: 'Chlor-alkali CAPEX intensity screening ~$1500/(kg NaOH/day); not a vendor quote', url: null }],
  }),
  'bromine-recovery': pack({
    capexIntensity: 800, intensityUnit: '$/(kg Br2/day)',
    fixedOmPercent: 4, variableOm: 0.03, assetLifeYears: 20,
    quality: 'screening', source: 'bromine recovery TEA order',
    note: 'installedCapex = 800 $/ (kg Br₂/day) × capacity (scale exponent omitted). Bromine-recovery CAPEX intensity screening. Not a vendor quote.',
    evidence: [{ label: 'Bromine-recovery CAPEX intensity screening ~$800/(kg Br₂/day)', url: null }],
  }),
  asu: pack({
    capexIntensity: 400, intensityUnit: '$/(kg N2/day)',
    fixedOmPercent: 4, variableOm: 0.02, assetLifeYears: 20,
    quality: 'screening', source: 'ASU TEA order',
    note: 'installedCapex = 400 $/ (kg N₂/day) × capacity (scale exponent omitted). Air-separation CAPEX intensity screening. Not a vendor quote.',
    evidence: [{ label: 'ASU CAPEX intensity screening ~$400/(kg N₂/day)', url: null }],
  }),
  ammonia: pack({
    capexIntensity: 2000, intensityUnit: '$/(kg NH3/day)',
    fixedOmPercent: 4, variableOm: 0.05, assetLifeYears: 20,
    quality: 'screening', source: 'Haber–Bosch / e-ammonia OOM',
    note: 'installedCapex = 2000 $/ (kg NH₃/day) × capacity (scale exponent omitted). Haber–Bosch / e-ammonia CAPEX intensity screening OOM (world-scale is cheaper per kg; small e-NH₃ is not). Not a plant quote.',
    evidence: [{ label: 'IEA Ammonia Technology Roadmap (family cite; screening CAPEX intensity)', url: IEA_NH3 }],
  }),
  swro: pack({
    capexIntensity: 1500, intensityUnit: '$/(m³/day)',
    fixedOmPercent: 3, variableOm: 0, assetLifeYears: 20,
    quality: 'screening', source: 'SWRO TEA $/m³-d band',
    note: 'installedCapex = 1500 $/ (m³/day) × capacity (scale exponent omitted). Screening mid of large-plant SWRO CAPEX ~$1,000–2,500 per m³/day (Ghaffour 2013; Voutchkov 2018; NREL WaterTAP plant examples e.g. Ashkelon ~$1,400/(m³/d)). Not a vendor quote. Model SWRO capacity is m³/day.',
    evidence: [
      { label: 'Ghaffour et al. 2013 desalination cost review (DOI)', url: GHAFFOUR_2013, doi: '10.1016/j.desal.2013.08.011' },
      { label: 'Voutchkov 2018 SWRO energy/cost family (DOI)', url: VOUTCHKOV_2018, doi: '10.1016/j.desal.2017.10.033' },
    ],
  }),
  electrolyzer: pack({
    capexIntensity: 3250, intensityUnit: '$/(kg H2/day)',
    fixedOmPercent: 3, variableOm: 0.03, assetLifeYears: 10,
    quality: 'screening', source: 'DOE/NREL electrolyzer $/kW band',
    note: 'installedCapex = 3250 $/ (kg H₂/day) × capacity (scale exponent omitted). Derived from DOE/NREL installed PEM band ~$1,500/kW × 52 kWh/kg / 24 h (NREL FY24 PEM manufacturing: installed ~$1,300–1,700/kW). Capacity basis is kg H₂/day (the unit capacity), not kW. PEM 55 kWh/kg is the same OOM. Not a vendor quote.',
    evidence: [
      { label: 'NREL PEM electrolyzer manufacturing cost (FY24; installed ~$1,300–1,700/kW family)', url: NREL_PEM },
      { label: 'DOE hydrogen production: electrolysis (family cite)', url: DOE_H2 },
    ],
  }),
  dac: pack({
    capexIntensity: 800, intensityUnit: '$/(kg CO2/day)',
    fixedOmPercent: 4, variableOm: 0.05, assetLifeYears: 20,
    quality: 'screening', source: 'IEA DAC / NASEM family',
    note: 'installedCapex = 800 $/ (kg CO₂/day) × capacity (scale exponent omitted). Screening from ~$2,200 per t-y CO₂ (800 ≈ 2200 × 365/1000). IEA DAC 2022 and NASEM 2019 are the family; first-of-kind is higher, nth-of-kind lower. Not a plant quote.',
    evidence: [
      { label: 'IEA Direct Air Capture 2022 (family cite; not a plant quote)', url: IEA_DAC },
      { label: 'NASEM 2019 Negative Emissions Technologies — DAC (DOI)', url: NASEM_DAC, doi: '10.17226/25259' },
    ],
  }),
  sabatier: pack({
    capexIntensity: 300, intensityUnit: '$/(kg CH4/day)',
    fixedOmPercent: 3, variableOm: 0.02, assetLifeYears: 20,
    quality: 'screening', source: 'PtG methanation TEA order',
    note: 'installedCapex = 300 $/ (kg CH₄/day) × capacity (scale exponent omitted). Screening from methanation ~$500/kW × CH₄ LHV ~13.9 kWh/kg / 24 h (Thema et al. 2019 PtG review, 300–500 €/kW family). Synthesis island only — not electrolyzer. Not a vendor quote.',
    evidence: [
      { label: 'Thema, Bauer & Sterner 2019 Power-to-Gas status review (DOI)', url: THEMA_2019, doi: '10.1016/j.rser.2019.06.030' },
    ],
  }),
  methanol: pack({
    capexIntensity: 200, intensityUnit: '$/(kg MeOH/day)',
    fixedOmPercent: 3, variableOm: 0.02, assetLifeYears: 20,
    quality: 'screening', source: 'e-methanol synthesis TEA order',
    note: 'installedCapex = 200 $/ (kg MeOH/day) × capacity (scale exponent omitted). Screening synthesis-island intensity (IRENA renewable methanol / CO₂-to-MeOH TEA family, order $100–400/(kg/day) depending on scale). Excludes electrolyzer and DAC. Not a plant quote.',
    evidence: [
      { label: 'IRENA 2021 Innovation Outlook: Renewable Methanol (family cite)', url: IRENA_MEOH },
    ],
  }),
  'solar-pv': pack({
    capexIntensity: 1000, intensityUnit: '$/kWp',
    fixedOmPerCapacity: 20, assetLifeYears: 25, precompute: true,
    quality: 'screening', source: 'NREL ATB PV family',
    note: 'installedCapex = 1000 $/kWp × kWp; fixedOM = 20 $/kWp·y × kWp (scale exponent omitted). Round $1000/kWp screening, NREL ATB utility-PV order (~$1/W). Not NREL ATB site-adjusted and not a vendor quote.',
    evidence: [
      { label: 'NREL Annual Technology Baseline (family cite; not a plant quote)', url: NREL_ATB },
      { label: 'NREL ATB 2024 cost and performance data (DOI)', url: NREL_ATB_DOI, doi: '10.25984/2377191' },
    ],
  }),
};

const capex = Object.fromEntries(
  ['minerals', 'chlor-alkali', 'bromine-recovery', 'asu', 'ammonia'].map(key => {
    const item = packs[key];
    return [key, row(item.capexIntensity, item.intensityUnit, item.quality, item.source, item.note, item.evidence)];
  })
);

const demand = {
  lithium: row(
    1e6, 'kg/year', 'screening', 'USGS MCS world Li; ME tiny',
    `Conservative 1,000 t/y LCE-proxy ceiling. USGS MCS 2025 world mine production 2024e ~240,000 t lithium content; Middle East is not a listed producer. ${DEMAND_REGION}`,
    [{ label: 'USGS MCS 2025 lithium — world mine production 2024e ~240,000 t Li content; ME not listed', url: USGS_LI }]
  ),
  bromine: row(
    2e8, 'kg/year', 'screening', 'USGS Dead Sea Br production order',
    `200,000 t/y regional ceiling. USGS MCS world Br ~400 kt; Israel + Jordan Dead Sea are the large regional producers (order 100+ kt each). ${DEMAND_REGION}`,
    [
      { label: 'USGS MCS 2024 bromine (world production order)', url: USGS_BR },
      { label: 'USGS MCS 2026 bromine — Israel/Jordan Dead Sea production order', url: USGS_BR_2026 },
    ]
  ),
  potash: row(
    2e9, 'kg/year', 'screening', 'USGS Israel/Jordan potash',
    `2 Mt/y regional ceiling. USGS MCS 2026: Israel ~2.26 Mt and Jordan ~1.73 Mt K₂O (2024). Ceiling is below combined Dead Sea production. ${DEMAND_REGION}`,
    [{ label: 'USGS MCS 2026 potash — Israel ~2.26 Mt and Jordan ~1.73 Mt K₂O (2024)', url: USGS_K_2026 }]
  ),
  salt: row(
    5e9, 'kg/year', 'screening', 'USGS salt; regional industrial',
    `5 Mt/y regional industrial/agricultural ceiling. USGS salt world production is hundreds of Mt; Dead Sea / ME industrial salt is smaller. ${DEMAND_REGION}`,
    [{ label: 'USGS MCS 2025 salt (world industrial salt family; regional ceiling is screening)', url: USGS_SALT }]
  ),
  gypsum: row(
    1e9, 'kg/year', 'screening', 'USGS gypsum; regional construction',
    `1 Mt/y regional construction/ag ceiling. USGS gypsum world production is ~150 Mt order. ${DEMAND_REGION}`,
    [{ label: 'USGS MCS 2025 gypsum (world production family; regional ceiling is screening)', url: USGS_GYP }]
  ),
  magnesium: row(
    2e8, 'kg/year', 'screening', 'USGS Mg compounds; brine product',
    `200 kt/y regional brine-Mg-compound ceiling, not Mg-metal. USGS magnesium-compounds family; Dead Sea brine Mg compounds exist. ${DEMAND_REGION}`,
    [{ label: 'USGS MCS 2025 magnesium compounds (family; brine-compound ceiling, not metal)', url: USGS_MG }]
  ),
  caustic: row(
    1e9, 'kg/year', 'screening', 'regional chlor-alkali offtake',
    `1 Mt/y regional NaOH chemical offtake screening. World chlor-alkali is tens of Mt; this is a ME regional ceiling, not a contract.`,
    [{ label: 'NaOH regional chemical offtake screening 1 Mt/y; not a caustic contract', url: null }]
  ),
  ammonia: row(
    2e9, 'kg/year', 'screening', 'IEA NH3; ME producer region',
    `2 Mt/y regional ceiling. IEA ammonia world ~180 Mt; the Middle East is a large producer/exporter. ${DEMAND_REGION}`,
    [{ label: 'IEA Ammonia Technology Roadmap (world ~180 Mt family; regional ceiling is screening)', url: IEA_NH3 }]
  ),
  oxygen: row(
    1e8, 'kg/year', 'screening', 'merchant O2 ceiling',
    `100 kt/y merchant-O₂ screening ceiling. No USGS industrial-gas series pinned — conservative screening, not a contract.`,
    [{ label: 'Industrial oxygen offtake screening 100 kt/y; not a merchant-gas contract', url: null }]
  ),
  methane: row(
    1e8, 'kg/year', 'screening', 'green CH4 offtake',
    `100 kt/y regional green-methane fuel/chemical ceiling. Not EIA fossil-gas demand and not a pipeline offtake.`,
    [{ label: 'EIA Henry Hub (fossil-gas contrast only; green-CH₄ cap is screening)', url: EIA_HH }]
  ),
  methanol: row(
    5e8, 'kg/year', 'screening', 'regional MeOH chemical/fuel',
    `500 kt/y regional methanol chemical/fuel ceiling. World MeOH is ~100 Mt; ME conventional capacity is large. This is a screening offtake cap, not a contract.`,
    [{ label: 'IRENA renewable methanol outlook (family; regional offtake cap is screening)', url: IRENA_MEOH }]
  ),
  hydrogen: row(
    1e8, 'kg/year', 'screening', 'IEA H2; green offtake',
    `100 kt/y regional green-H₂ ceiling. IEA global H₂ is ~95 Mt, mostly grey. Not a offtake contract.`,
    [{ label: 'IEA Global Hydrogen Review 2024 (world ~95 Mt family; green offtake cap is screening)', url: IEA_H2 }]
  ),
  water: row(
    1e8, 'kg/year', 'screening', 'local process water',
    `100,000 m³/y local process-water offtake screening. Not a municipal tariff or concession.`,
    [{ label: 'Process-water offtake screening 1e8 kg/y; not a municipal tariff', url: null }]
  ),
};

function cloneDemandRow(item, extraNote) {
  return {
    value: item.value,
    unit: item.unit,
    quality: item.quality,
    source: item.source,
    note: extraNote ? `${item.note} ${extraNote}` : item.note,
    evidence: item.evidence,
  };
}

function inheritDemand(base, inheritNote, overrides = {}) {
  const out = {};
  for (const [key, item] of Object.entries(base)) {
    out[key] = overrides[key] || cloneDemandRow(item, inheritNote);
  }
  return out;
}

const CHILE_INHERIT_NOTE = 'Inherited me-levant screening offtake; Chile table only regionalizes lithium. Not a plant contract.';
const AUSTRALIA_INHERIT_NOTE = 'Inherited me-levant screening offtake. USGS MCS 2025 Australia lithium mine production 2024e ~88,000 t Li content is hard-rock spodumene, not a Lake Mackay brine offtake. Not a plant contract.';
const DEFAULT_INHERIT_NOTE = 'Inherited me-levant screening offtake (unmapped site.region). Not a plant contract.';

const demandChile = inheritDemand(demand, CHILE_INHERIT_NOTE, {
  lithium: row(
    2e7, 'kg/year', 'screening', 'USGS MCS Chile Li production order',
    'Conservative 20,000 t/y LCE-proxy ceiling, below USGS MCS 2025 Chile mine production 2024e ~49,000 t lithium content (major producer; world 2024e ~240,000 t). Chile is supply-side — this is not an offtake contract and not a LiCl quote.',
    [{ label: 'USGS MCS 2025 lithium — Chile mine production 2024e ~49,000 t Li content (world 2024e ~240,000 t); not an offtake contract', url: USGS_LI }]
  ),
});

const demandAustralia = inheritDemand(demand, AUSTRALIA_INHERIT_NOTE);
const demandDefault = inheritDemand(demand, DEFAULT_INHERIT_NOTE);

const demandByRegion = {
  'me-levant': demand,
  'chile-atacama': demandChile,
  australia: demandAustralia,
  default: demandDefault,
};
const DEMAND_REGIONS = demandByRegion;

// Screening industrial-power overlays (not a PPA). me-levant / default keep costs.power ($0.04/kWh).
const powerByRegion = {
  'chile-atacama': row(
    0.07, '$/kWh', 'screening', 'IEA industrial electricity family',
    'Chile industrial power screening overlay ~$70/MWh (above the global $30–50/MWh mid). IEA Electricity 2024 family order — not a SEN/SING PPA or plant tariff.',
    [{ label: 'IEA Electricity 2024 (family; screening industrial tariff overlay, not a PPA)', url: IEA_ELEC }]
  ),
  australia: row(
    0.08, '$/kWh', 'screening', 'IEA industrial electricity family',
    'Australia industrial power screening overlay ~$80/MWh (above the global $30–50/MWh mid). IEA Electricity 2024 family order — not an NWIS/SWIS PPA or plant tariff.',
    [{ label: 'IEA Electricity 2024 (family; screening industrial tariff overlay, not a PPA)', url: IEA_ELEC }]
  ),
};

function resolveDemandRegion(region) {
  if (region == null || region === '') return DEFAULT_DEMAND_REGION_ID;
  const raw = String(region).trim();
  if (demandByRegion[raw]) return raw;
  if (REGION_STRING_TO_ID[raw]) return REGION_STRING_TO_ID[raw];
  const lower = raw.toLowerCase();
  for (const [label, id] of Object.entries(REGION_STRING_TO_ID)) {
    if (label.toLowerCase() === lower) return id;
  }
  return 'default';
}

function getDemandForRegion(region) {
  return demandByRegion[resolveDemandRegion(region)];
}

function getCostForRegion(key, region) {
  const id = resolveDemandRegion(region);
  if (key === 'power' && powerByRegion[id]) return powerByRegion[id];
  return must(costs, key, 'cost');
}

function getPriceForRegion(key, region) {
  const item = must(prices, key, 'price');
  const id = resolveDemandRegion(region);
  if (key === 'lithium' && id === 'chile-atacama') {
    return {
      ...item,
      note: `${item.note} Chile is supply-side (USGS MCS Chile mine-production order); this USGS LCE proxy is not a Chilean offtake contract.`,
    };
  }
  return item;
}

const fuelsCapexNote = row(
  null, null, 'screening', 'NREL ATB / DOE H2 family',
  'Fuel-path converter CAPEX uses process packs (electrolyzer, DAC, SWRO, Sabatier, methanol) with literature intensities, not demo lumps. Family: NREL ATB / DOE hydrogen electrolysis / IEA DAC.',
  [
    { label: 'NREL Annual Technology Baseline (family cite; not a plant quote)', url: NREL_ATB },
    { label: 'DOE hydrogen production: electrolysis (family cite)', url: DOE_H2 },
  ]
);

function must(map, key, kind) {
  const found = map[key];
  if (!found) throw new Error(`Unknown TEA ${kind} ${key}`);
  return found;
}

function installedCapexFromPack(pack, capacity) {
  const intensity = Number(pack.capexIntensity);
  const size = Number(capacity);
  if (!Number.isFinite(intensity) || !Number.isFinite(size)) return null;
  const exponent = pack.scaleExponent;
  const ref = pack.refCapacity;
  if (Number.isFinite(exponent) && Number.isFinite(ref) && ref > 0 && size > 0) {
    return intensity * size * (size / ref) ** (exponent - 1);
  }
  return intensity * size;
}

function bindCapexPack(processKey, extra = {}) {
  const item = must(packs, processKey, 'pack');
  const capacity = extra.capacity;
  const merged = {
    ...item,
    scaleExponent: extra.scaleExponent ?? item.scaleExponent,
    refCapacity: extra.refCapacity ?? item.refCapacity,
    capexIntensity: extra.capexIntensity ?? item.capexIntensity,
  };
  const scaled = merged.scaleExponent != null && merged.refCapacity != null && Number.isFinite(capacity);
  const precompute = extra.precompute != null ? extra.precompute : (item.precompute || scaled);
  const fields = {
    quality: item.quality,
    source: item.source,
    note: item.note,
    evidence: item.evidence,
    capexIntensity: merged.capexIntensity,
    assetLifeYears: extra.assetLifeYears ?? item.assetLifeYears,
    variableOM: extra.variableOM ?? item.variableOm,
  };
  if (merged.scaleExponent != null) {
    fields.scaleExponent = merged.scaleExponent;
    fields.refCapacity = merged.refCapacity;
  }
  if (item.fixedOmPerCapacity != null && Number.isFinite(capacity) && extra.fixedOM == null) {
    fields.fixedOM = item.fixedOmPerCapacity * capacity;
  } else if (extra.fixedOM != null) {
    fields.fixedOM = extra.fixedOM;
  } else {
    fields.fixedOMPercent = extra.fixedOMPercent ?? item.fixedOmPercent;
  }
  if (extra.installedCapex != null) {
    fields.installedCapex = extra.installedCapex;
  } else if (precompute && Number.isFinite(capacity)) {
    fields.installedCapex = installedCapexFromPack(merged, capacity);
  } else {
    fields.capexRate = extra.capexRate ?? merged.capexIntensity;
  }
  return fields;
}

function bindSale(key, extra = {}) {
  const region = extra && extra.region;
  const item = getPriceForRegion(key, region);
  const cap = must(getDemandForRegion(region), key, 'demand');
  return {
    disposition: 'sale',
    unitPrice: item.value,
    annualDemandLimit: cap.value,
    quality: item.quality,
    source: item.source,
    note: `${item.note} Offtake cap ${cap.value} ${cap.unit}: ${cap.note}`,
    evidence: item.evidence,
    demandRegionId: resolveDemandRegion(region),
  };
}

function bindSaleForRegion(region) {
  return key => bindSale(key, { region });
}

function bindCost(key, extra = {}) {
  const item = getCostForRegion(key, extra && extra.region);
  return {
    unitCost: item.value,
    quality: item.quality,
    source: item.source,
    note: item.note,
    evidence: item.evidence,
  };
}

function bindCapex(key, extra = {}) {
  return bindCapexPack(key, extra);
}

function bindPriceFields(key) {
  const item = must(prices, key, 'price');
  return {
    unitPrice: item.value,
    quality: item.quality,
    source: item.source,
    note: item.note,
    evidence: item.evidence,
  };
}

function snapshot(map, keys) {
  return keys.map(key => {
    const item = map[key];
    return {
      key,
      value: item.value,
      unit: item.unit,
      quality: item.quality,
      source: item.source,
      note: item.note,
      evidence: item.evidence,
    };
  });
}

function snapshotPacks(keys) {
  return keys.map(key => {
    const item = packs[key];
    return {
      key,
      capexIntensity: item.capexIntensity,
      unit: item.intensityUnit,
      scaleExponent: item.scaleExponent,
      refCapacity: item.refCapacity,
      fixedOmPercent: item.fixedOmPercent,
      variableOm: item.variableOm,
      quality: item.quality,
      source: item.source,
      note: item.note,
      evidence: item.evidence,
    };
  });
}

function abundanceEvidence(region) {
  const regionId = resolveDemandRegion(region);
  const demandMap = getDemandForRegion(regionId);
  return {
    prices: snapshot(prices, ['lithium', 'bromine', 'potash', 'salt', 'gypsum', 'magnesium', 'caustic', 'ammonia', 'oxygen']),
    costs: ['power', 'brine', 'water', 'salt-feed'].map(key => {
      const item = getCostForRegion(key, regionId);
      return {
        key,
        value: item.value,
        unit: item.unit,
        quality: item.quality,
        source: item.source,
        note: item.note,
        evidence: item.evidence,
      };
    }),
    capex: snapshot(capex, ['minerals', 'chlor-alkali', 'bromine-recovery', 'asu', 'ammonia']),
    packs: snapshotPacks(['minerals', 'chlor-alkali', 'bromine-recovery', 'asu', 'ammonia']),
    demand: snapshot(demandMap, ['lithium', 'bromine', 'potash', 'salt', 'gypsum', 'magnesium', 'caustic', 'ammonia', 'oxygen']),
    demandRegion: DEMAND_REGION_LABELS[regionId],
    demandRegionId: regionId,
  };
}

return {
  prices,
  costs,
  capex,
  packs,
  demand,
  demandByRegion,
  DEMAND_REGIONS,
  REGION_STRING_TO_ID,
  DEFAULT_DEMAND_REGION_ID,
  DEMAND_REGION_LABELS,
  fuelsCapexNote,
  EDITOR_DEMAND_DEFAULT,
  DEMAND_REGION,
  installedCapexFromPack,
  resolveDemandRegion,
  getDemandForRegion,
  getCostForRegion,
  getPriceForRegion,
  bindSale,
  bindSaleForRegion,
  bindCost,
  bindCapex,
  bindCapexPack,
  bindPriceFields,
  abundanceEvidence,
};
});
