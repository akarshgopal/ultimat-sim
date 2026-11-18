const tea = require('../data/tea-screening.js');
const { MEJILLONES_PVGIS_URL: PVGIS_URL, MEJILLONES_URL, projectEconomics, material, right, nodeFinder, clone, solarPowerNode, powerToBusEdge } = require('./_shared.js');
const DAILY_PV_ED = 5.27;
const CEMENT_KG_PER_DAY = 1000;
const SEC_CEMENT = 1.05;
const LIMESTONE_KG_PER_KG = 1.183;
const CLAY_KG_PER_KG = 0.337;
const FEED_MARGIN = 1.05;
const REGION = 'Atacama/Chile';
const IPCC_CEMENT_CO2 = 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/3_Volume3/V3_2_Ch2_Mineral_Industry.pdf';
const IEA_CEMENT_ARCHIVE = 'https://web.archive.org/web/20230528230323/https://www.iea.org/reports/cement';
const ECRA_CEMENT_2022 = 'https://api.ecra-online.org/fileadmin/files/tp/ECRA_Technology_Papers_2022.pdf';
const USGS_CEMENT = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-cement.pdf';
const CEMEX_SOLID_TIC = 'https://mb.com.ph/2022/02/12/solid-cement-to-pursue-323-m-expansion/';
const SAMARKAND_CEMENT_TIC = 'https://www.globalcement.com/news/item/16382-china-energy-international-group-samarkand-cement-installs-kiln-at-upcoming-samarkand-cement-plant';
const DUGONG_CEMENT_TIC = 'https://www.globalcement.com/news/11756-dugong-cimentos-announces-upcoming-1-8mt-yr-integrated-cement-plant-in-mozambique';
const CEMENT_CAPEX_BENCH = 'https://www.cementequipment.org/cement-technical-package/package-tools/76038938-capex-of-cement-companies/';
const LC3_INDIA_2016 = 'https://lc3.ch/wp-content/uploads/2023/03/An-economic-analysis-of-the-production-of-limestone-calcined-clay-cement-in-India-2016.pdf';

function createCementCase() {
  const limestoneKg = CEMENT_KG_PER_DAY * LIMESTONE_KG_PER_KG * FEED_MARGIN;
  const clayKg = CEMENT_KG_PER_DAY * CLAY_KG_PER_KG * FEED_MARGIN;
  const kWhPerDay = CEMENT_KG_PER_DAY * SEC_CEMENT;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const limestone = material('CaCO3', limestoneKg);
  const clay = material('SiO2', clayKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: projectEconomics(),
    graph: {
      nodes: [
        { id: 'limestone-feed', unit: 'material-source', sourcePreset: 'limestone', params: { stream: limestone }, economics: tea.bindCost('quarried-limestone') },
        { id: 'clay-feed', unit: 'material-source', sourcePreset: 'kiln-clay', params: { stream: clay }, economics: tea.bindCost('quarried-clay') },
        solarPowerNode(power, solarKWp, REGION),
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'cement',
          unit: 'cement',
          capacity: CEMENT_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_CEMENT },
          economics: tea.bindCapexPack('cement', { capacity: CEMENT_KG_PER_DAY, region: REGION }),
        },
        { id: 'cement-product', unit: 'material-sink', economics: tea.bindSale('cement', { region: REGION, freight: 'bulk-dry-shortsea' }) },
        { id: 'process-co2', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'limestone-feed', port: 'out' }, to: { node: 'cement', port: 'limestone' } },
        { from: { node: 'clay-feed', port: 'out' }, to: { node: 'cement', port: 'clay' } },
        powerToBusEdge(),
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'cement', port: 'electricity' } },
        { from: { node: 'cement', port: 'cement' }, to: { node: 'cement-product', port: 'in' } },
        { from: { node: 'cement', port: 'carbonDioxide' }, to: { node: 'process-co2', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { cement: CEMENT_KG_PER_DAY },
      priorities: { 'power-bus': ['cement'] },
    },
  };
  const node = nodeFinder(definition);
  node('power').siteResource = 'electricity';
  node('limestone-feed').siteResource = 'limestone';
  node('clay-feed').siteResource = 'kiln-clay';
  definition.site = {
    id: 'chile-mejillones-cement',
    name: 'Mejillones, Antofagasta, Chile',
    latitude: -23.1,
    longitude: -70.448,
    region: REGION,
    solarKWp,
    dailyPVKWhPerKWp: DAILY_PV_ED,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'literature-estimate',
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to 1000 kg cement/day × 1.05 kWh/kg total-energy-as-electricity with 2% margin. No electricity purchase. Not a SEN interconnection or port lease.',
      },
      limestone: {
        stream: clone(node('limestone-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Own-quarry carbonate stone from a captive quarry a few km from the kiln, at a screening $0.003/kg delivered (LC3 India 2016: Rs 200/t). Quarry equipment is in the quarry-to-pack cement capex. Not a quarry concession.',
      },
      'kiln-clay': {
        stream: clone(node('clay-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Own-quarry clay/shale/silica kiln corrective as SiO2 proxy at the same screening $0.003/kg as the limestone. Not a clay-pit concession. Not kaolin.',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-21',
      cite: {
        label: 'PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.1, −70.448); frozen data/pvgis-mejillones.json E_y 1923.52, totals.fixed E_d 5.27',
        url: PVGIS_URL,
      },
      notes: 'Frozen PVGIS-ERA5 totals.fixed E_d 5.27 kWh/kWp·day and E_y 1923.52 kWh/kWp from data/pvgis-mejillones.json. Not a plant pyranometer.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to the cement SEC proxy.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      quarry: right('concession', 'unverified', 'Captive limestone and clay quarry assumed within a few km of the kiln; no quarry concession is held', [
        { label: 'LC3 India 2016 — limestone delivered to the plant Rs 200/t (screening $0.003/kg)', url: LC3_INDIA_2016 },
      ]),
    },
    evidence: [
      { label: 'Mejillones geography', url: MEJILLONES_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.1, −70.448); annual E_y 1923.52 kWh/kWp, totals.fixed E_d 5.27', url: PVGIS_URL },
      { label: 'IPCC 2006 Guidelines Vol. 3 Ch. 2 — default 0.52 t process CO2 / t clinker (65% CaO + 2% CKD)', url: IPCC_CEMENT_CO2 },
      { label: 'IEA Cement (archived) — global thermal intensity of clinker ~3.4–3.5 GJ/t; electricity ~105 kWh/t cement', url: IEA_CEMENT_ARCHIVE },
      { label: 'ECRA Technology Papers 2022 — GCCA GNR 2019 grey clinker 3,460 MJ/t; cement electricity ~102 kWh/t', url: ECRA_CEMENT_2022 },
      { label: 'USGS MCS 2026 cement — 2025e mill unit value $160/t', url: USGS_CEMENT },
      { label: 'LC3 India 2016 — limestone delivered to the plant Rs 200/t; own-quarry stone and clay screening $0.003/kg', url: LC3_INDIA_2016 },
      { label: 'Industry greenfield dry-process $120–250 / t-y clinker', url: CEMENT_CAPEX_BENCH },
      { label: 'Cemex Solid 1.5 Mtpa integrated line TIC $235–323M', url: CEMEX_SOLID_TIC },
      { label: 'Samarkand Cement 3 Mt/yr kiln US$313m', url: SAMARKAND_CEMENT_TIC },
      { label: 'Dugong Cimentos 1.8 Mt/yr integrated US$330m', url: DUGONG_CEMENT_TIC },
    ],
    notes: 'Own-quarry limestone + clay/silica (SiO2 kiln-feed proxy) → screening grey clinker as a Portland-cement proxy at the Mejillones map point. Product is clinker; gypsum ~4–5% (EN 197-1 CEM I) omitted. Sale is USGS mill portland/blended $0.16/kg plant-gate, net of screening bulk-dry-shortsea freight $0.03/kg (bulk commodity offtake; not a voyage quote; screening FOB vs landed). Limestone and clay come from a captive quarry a few km away at a screening $0.003/kg delivered (LC3 India 2016: Rs 200/t); the quarry is in the quarry-to-pack capex. IPCC 0.52 kg process CO2/kg clinker; limestone 1.183 kg/kg and clay 0.337 kg/kg close the dry mass (BREF 1.57 t raw/t clinker is wet-raw). SEC 1.05 kWh/kg is an electricity-as-total-energy proxy for IEA ~3.4 GJ/t clinker thermal plus ~100 kWh/t cement electricity; real kiln is heat-dominated. Pack $60/(kg cement/day) mid of published dry-process grey plant TICs (~$35–90). Fuel carbon is not emitted because energy is the electricity proxy. Not a wet-process kiln, not blended CEM II/III, not CCUS, not a quarry concession. Cash sign whatever falls out. Not bankable. Chile CAPEX× 1.05 unchanged.',
  };
  return definition;
}

module.exports = { createCementCase };
