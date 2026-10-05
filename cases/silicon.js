(function exposeSiliconCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiliconCase = api;
})(globalThis, (model, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const DAILY_PV_ED = 5.27;
const MODULE_KG_PER_DAY = 1000;
const POLY_KG_PER_DAY = MODULE_KG_PER_DAY * 0.0273;
const SI_KG_PER_DAY = POLY_KG_PER_DAY * 1.05;
const AL_KG_PER_DAY = MODULE_KG_PER_DAY * 0.1273;
const AG_KG_PER_DAY = MODULE_KG_PER_DAY * 0.0003;
const GLASS_KG_PER_DAY = MODULE_KG_PER_DAY * 0.6745;
const EVA_KG_PER_DAY = MODULE_KG_PER_DAY * 0.0669;
const FEED_MARGIN = 1.05;
const USGS_SI = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-silicon.pdf';
const USGS_AL = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-aluminum.pdf';
const USGS_BAUXITE = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-bauxite-alumina.pdf';
const USGS_AG = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-silver.pdf';
const USGS_SILICA = 'https://www.usgs.gov/centers/national-minerals-information-center/silica-statistics-and-information';
const DOE_AL = 'https://www.energy.gov/sites/prod/files/2013/11/f4/al_roadmap.pdf';
const IAI_ALUMINA_ENERGY = 'https://international-aluminium.org/statistics/metallurgical-alumina-refining-energy-intensity/';
const FRAUNHOFER_POLYSI = 'https://www.ise.fraunhofer.de/content/dam/ise/en/documents/publications/studies/25_en_ISE_Report_Analysis-of-the-Electricity-Consumption-for-the-Production-of-Electronic-Grade-Polysilicon.pdf';
const FRAUNHOFER_PV = 'https://www.ise.fraunhofer.de/content/dam/ise/de/documents/publications/studies/Photovoltaics-Report.pdf';
const REW_POLYSI = 'https://www.renewableenergyworld.com/solar/advancements-in-the-commercial-production-of-polysilicon/';
const NREL_SOLAR_2025 = 'https://www.nrel.gov/docs/';
const REGION = 'Atacama/Chile';

function right(kind, status, note, evidence) {
  return {
    kind,
    status,
    authorize: status === 'authorized' || status === 'assumed',
    note,
    ...(evidence ? { evidence } : {}),
  };
}

function material(substance, kg, phase = 'solid') {
  return {
    kind: 'material',
    mol: { [substance]: kg * 1000 / SUBSTANCES[substance].molarMassG },
    phase,
    T_C: 25,
    P_bar: 1,
  };
}

function createSiliconCase() {
  const quartzKg = SI_KG_PER_DAY * SUBSTANCES.SiO2.molarMassG / SUBSTANCES.Si.molarMassG * FEED_MARGIN;
  const reductantKg = SI_KG_PER_DAY * 2 * SUBSTANCES.C.molarMassG / SUBSTANCES.Si.molarMassG * FEED_MARGIN;
  const aluminaKgPerDay = AL_KG_PER_DAY * 0.5 * SUBSTANCES.Al2O3.molarMassG / SUBSTANCES.Al.molarMassG;
  const bauxiteKg = aluminaKgPerDay * 2.0 * FEED_MARGIN;
  const causticKg = aluminaKgPerDay * 0.08 * FEED_MARGIN;
  const anodeKg = AL_KG_PER_DAY * 0.75 * SUBSTANCES.C.molarMassG / SUBSTANCES.Al.molarMassG * FEED_MARGIN;
  const silverKg = AG_KG_PER_DAY * FEED_MARGIN;
  const glassKg = GLASS_KG_PER_DAY * FEED_MARGIN;
  const evaKg = EVA_KG_PER_DAY * FEED_MARGIN;
  const kWhPerDay = SI_KG_PER_DAY * 12 + POLY_KG_PER_DAY * 65 + aluminaKgPerDay * 3.5 + AL_KG_PER_DAY * 14 + MODULE_KG_PER_DAY * 0.05;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const quartz = material('SiO2', quartzKg);
  const reductant = material('C', reductantKg);
  const bauxite = material('Bauxite', bauxiteKg);
  const caustic = material('NaOH', causticKg, 'liquid');
  const anode = material('C', anodeKg);
  const silver = material('Ag', silverKg);
  const glass = material('FloatGlass', glassKg);
  const eva = material('EVA', evaKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'quartz', unit: 'material-source', sourcePreset: 'quartz', params: { stream: quartz }, economics: tea.bindCost('quartz') },
        { id: 'reductant', unit: 'material-source', sourcePreset: 'carbon', params: { stream: reductant }, economics: tea.bindCost('carbon-reductant') },
        { id: 'bauxite', unit: 'material-source', sourcePreset: 'bauxite', params: { stream: bauxite }, economics: tea.bindCost('bauxite', { freight: 'bulk-dry-shortsea' }) },
        { id: 'caustic', unit: 'material-source', sourcePreset: 'caustic', params: { stream: caustic }, economics: tea.bindCost('caustic-makeup') },
        { id: 'anode', unit: 'material-source', sourcePreset: 'carbon', params: { stream: anode }, economics: tea.bindCost('carbon-anode') },
        { id: 'silver', unit: 'material-source', sourcePreset: 'silver', params: { stream: silver }, economics: tea.bindCost('silver', { freight: 'chile-coast-container' }) },
        { id: 'glass', unit: 'material-source', sourcePreset: 'float-glass', params: { stream: glass }, economics: tea.bindCost('float-glass', { freight: 'bulk-dry-shortsea' }) },
        { id: 'eva', unit: 'material-source', sourcePreset: 'eva', params: { stream: eva }, economics: tea.bindCost('eva-encapsulant', { freight: 'chile-coast-container' }) },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        { id: 'power-bus', unit: 'electrical-bus' },
        { id: 'mg-si', unit: 'mg-si', capacity: SI_KG_PER_DAY, params: { electricityKWhPerKg: 12 }, economics: tea.bindCapexPack('mg-si', { capacity: SI_KG_PER_DAY, region: REGION }) },
        { id: 'polysilicon', unit: 'polysilicon', capacity: POLY_KG_PER_DAY, params: { electricityKWhPerKg: 65 }, economics: tea.bindCapexPack('polysilicon', { capacity: POLY_KG_PER_DAY, region: REGION }) },
        { id: 'bayer-alumina', unit: 'bayer-alumina', capacity: aluminaKgPerDay, params: { electricityKWhPerKg: 3.5 }, economics: tea.bindCapexPack('bayer-alumina', { capacity: aluminaKgPerDay, region: REGION }) },
        { id: 'aluminium-smelter', unit: 'aluminium-smelter', capacity: AL_KG_PER_DAY, params: { electricityKWhPerKg: 14 }, economics: tea.bindCapexPack('aluminium-smelter', { capacity: AL_KG_PER_DAY, region: REGION }) },
        { id: 'pv-module', unit: 'pv-module', capacity: MODULE_KG_PER_DAY, params: { electricityKWhPerKg: 0.05 }, economics: tea.bindCapexPack('pv-module', { capacity: MODULE_KG_PER_DAY, region: REGION }) },
        { id: 'module', unit: 'material-sink', economics: tea.bindSale('pv-module', { region: REGION, freight: 'chile-coast-container' }) },
        { id: 'carbonMonoxide', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'carbonDioxide', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'redMud', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'quartz', port: 'out' }, to: { node: 'mg-si', port: 'quartz' } },
        { from: { node: 'reductant', port: 'out' }, to: { node: 'mg-si', port: 'carbon' } },
        { from: { node: 'bauxite', port: 'out' }, to: { node: 'bayer-alumina', port: 'bauxite' } },
        { from: { node: 'caustic', port: 'out' }, to: { node: 'bayer-alumina', port: 'caustic' } },
        { from: { node: 'bayer-alumina', port: 'alumina' }, to: { node: 'aluminium-smelter', port: 'alumina' } },
        { from: { node: 'anode', port: 'out' }, to: { node: 'aluminium-smelter', port: 'carbon' } },
        { from: { node: 'silver', port: 'out' }, to: { node: 'pv-module', port: 'silver' } },
        { from: { node: 'glass', port: 'out' }, to: { node: 'pv-module', port: 'glass' } },
        { from: { node: 'eva', port: 'out' }, to: { node: 'pv-module', port: 'eva' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'mg-si', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'polysilicon', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'bayer-alumina', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'aluminium-smelter', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'pv-module', port: 'electricity' } },
        { from: { node: 'mg-si', port: 'silicon' }, to: { node: 'polysilicon', port: 'silicon' } },
        { from: { node: 'polysilicon', port: 'polysilicon' }, to: { node: 'pv-module', port: 'polysilicon' } },
        { from: { node: 'aluminium-smelter', port: 'aluminium' }, to: { node: 'pv-module', port: 'aluminium' } },
        { from: { node: 'pv-module', port: 'module' }, to: { node: 'module', port: 'in' } },
        { from: { node: 'mg-si', port: 'carbonMonoxide' }, to: { node: 'carbonMonoxide', port: 'in' } },
        { from: { node: 'aluminium-smelter', port: 'carbonDioxide' }, to: { node: 'carbonDioxide', port: 'in' } },
        { from: { node: 'bayer-alumina', port: 'redMud' }, to: { node: 'redMud', port: 'in' } },
      ],
    },
    operation: {
      setpoints: {
        'mg-si': SI_KG_PER_DAY,
        polysilicon: POLY_KG_PER_DAY,
        'bayer-alumina': aluminaKgPerDay,
        'aluminium-smelter': AL_KG_PER_DAY,
        'pv-module': MODULE_KG_PER_DAY,
      },
      priorities: { 'power-bus': ['mg-si', 'polysilicon', 'bayer-alumina', 'aluminium-smelter', 'pv-module'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('quartz').siteResource = 'quartz';
  node('reductant').siteResource = 'reductant';
  node('bauxite').siteResource = 'bauxite';
  node('caustic').siteResource = 'caustic';
  node('anode').siteResource = 'anode';
  node('silver').siteResource = 'silver';
  node('glass').siteResource = 'glass';
  node('eva').siteResource = 'eva';
  definition.site = {
    id: 'chile-mejillones',
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to the MG-Si + Siemens-style poly-Si + Bayer alumina + Al + module-assembly load with 2% margin. Not a SEN interconnection or port lease.',
      },
      quartz: {
        stream: clone(node('quartz').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased quartzite assumed available at screening $0.08/kg; not a concession or port lease.',
      },
      reductant: {
        stream: clone(node('reductant').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased carbon reductant (coal/coke/charcoal mix) assumed available; not a concession or port lease.',
      },
      bauxite: {
        stream: clone(node('bauxite').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased bauxite assumed available at screening $0.04/kg plant-gate plus screening bulk-dry-shortsea freight $0.03/kg (~$30/t; not a voyage quote). Not a concession or port lease. Bayer island is screening, not a concession.',
      },
      caustic: {
        stream: clone(node('caustic').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased NaOH makeup assumed available at the existing caustic commodity band; not a concession or port lease.',
      },
      anode: {
        stream: clone(node('anode').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased Hall–Héroult anode carbon assumed available; not a concession or port lease.',
      },
      silver: {
        stream: clone(node('silver').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased silver paste (bullion-priced) assumed available at USGS MCS 2026 $38/troy oz plant-gate plus screening chile-coast-container freight $0.08/kg (~$80/t; not a Maersk quote). Not a paste contract or port lease.',
      },
      glass: {
        stream: clone(node('glass').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased solar float glass assumed available at screening $0.45/kg plant-gate plus screening bulk-dry-shortsea freight $0.03/kg (~$30/t; not a voyage quote). Not a Guardian/Xinyi quote or port lease.',
      },
      eva: {
        stream: clone(node('eva').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased solar EVA encapsulant assumed available at screening $2.00/kg plant-gate plus screening chile-coast-container freight $0.08/kg (~$80/t; not a Maersk quote). Not a STR/Mitsui contract or port lease.',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-14',
      cite: {
        label: 'PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.100, −70.448); frozen data/pvgis-mejillones.json E_y 1923.52, E_d 5.27',
        url: PVGIS_URL,
      },
      notes: 'Frozen PVGIS-ERA5 totals.fixed E_d 5.27 kWh/kWp·day and E_y 1923.52 kWh/kWp from data/pvgis-mejillones.json, retrieved 2026-09-14. Not a plant-measured irradiance series.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: 'https://en.wikipedia.org/wiki/Mejillones' },
      ]),
      brineConcession: right('concession', 'unverified', 'No brine; purchased quartzite/bauxite/caustic/carbon/Ag/glass/EVA are not a mineral concession', [
        { label: 'USGS silica statistics (commodity context, not a concession)', url: USGS_SILICA },
      ]),
      quartzPurchase: right('purchase', 'assumed', 'Purchased quartzite assumed available; not a quarry quote or port lease', [
        { label: 'USGS silica statistics (commodity context, not a contract)', url: USGS_SILICA },
      ]),
      bauxitePurchase: right('purchase', 'assumed', 'Purchased bauxite assumed available; Bayer screening is not a concession or port lease', [
        { label: 'USGS MCS 2025 bauxite and alumina (commodity context, not a mine contract)', url: USGS_BAUXITE },
      ]),
      causticPurchase: right('purchase', 'assumed', 'Purchased NaOH makeup assumed available at the existing caustic band; not a caustic contract or port lease', [
        { label: 'NaOH commodity band (same $/kg as caustic product price; not a contract)', url: null },
      ]),
      silverPurchase: right('purchase', 'assumed', 'Purchased silver paste assumed available at USGS bullion; not a paste contract or port lease', [
        { label: 'USGS MCS 2026 silver (bullion 2025e $38/troy oz; not a paste contract)', url: USGS_AG },
      ]),
      glassPurchase: right('purchase', 'assumed', 'Purchased solar float glass assumed available; not a Guardian/Xinyi quote or port lease', [
        { label: 'Fraunhofer ISE Photovoltaics Report (glass mass-share family; not a glass contract)', url: FRAUNHOFER_PV },
      ]),
      evaPurchase: right('purchase', 'assumed', 'Purchased solar EVA encapsulant assumed available; not a STR/Mitsui contract or port lease', [
        { label: 'Fraunhofer ISE Photovoltaics Report (EVA mass-share family; not an encapsulant contract)', url: FRAUNHOFER_PV },
      ]),
    },
    evidence: [
      { label: 'Mejillones industrial geography', url: 'https://en.wikipedia.org/wiki/Mejillones' },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly; annual E_y 1923.52 kWh/kWp, E_d 5.27', url: PVGIS_URL },
      { label: 'USGS MCS 2025 silicon metal (MG-Si feed family; product is SoG poly, not silicon metal)', url: USGS_SI },
      { label: 'Fraunhofer ISE SoG polysilicon electricity 60–71 kWh/kg; screening SEC 65', url: FRAUNHOFER_POLYSI },
      { label: 'NREL Spring 2025 Solar Industry Update — SoG poly spot screening mid $6/kg; module ASP context', url: NREL_SOLAR_2025 },
      { label: 'Renewable Energy World TCS Siemens CAPEX family (~$87/kg-y → 31755 $/(kg/day))', url: REW_POLYSI },
      { label: 'Fraunhofer ISE Photovoltaics Report — module mass 11.6 kg/m² shares (Si/Ag/glass/EVA/Al); remaining ~10% BOM omitted', url: FRAUNHOFER_PV },
      { label: 'USGS MCS 2026 silver bullion 2025e $38/troy oz → 1221.73 $/kg', url: USGS_AG },
      { label: 'USGS MCS 2025 aluminum ingot', url: USGS_AL },
      { label: 'USGS MCS 2025 bauxite and alumina (crude dry bauxite import unit value family)', url: USGS_BAUXITE },
      { label: 'IAI metallurgical alumina refining energy intensity (~10–12 GJ/t family; screening 3.5 kWh/kg total-energy-as-electricity proxy)', url: IAI_ALUMINA_ENERGY },
      { label: 'DOE aluminium industry roadmap', url: DOE_AL },
    ],
    notes: 'Screening crustal quartz → MG-Si (SiO2+2C→Si+2CO, 12 kWh/kg) → Siemens-style poly-Si (65 kWh/kg, Fraunhofer SoG 60–71 band mid; 1.05 mol MG-Si / mol product) + purchased Ag/glass/EVA + crustal bauxite → Bayer screening alumina (2.0 kg ore + 0.08 kg NaOH makeup + 3.5 kWh/kg total-energy-as-electricity proxy; not a full Bayer train) → Hall–Héroult Al (14 kWh/kg) → screening module assembly (Fraunhofer 2021 mass shares on 11.6 kg/m²; remaining ~10% backsheet/J-box/cables omitted). Sale is finished module at screening $2.85/kg ($0.15/W) plant-gate, net of screening Chile-coast container freight $0.08/kg to ocean offtake (not a Maersk quote; screening FOB vs landed). Purchased bauxite and float glass carry screening short-sea/bulk freight $0.03/kg; Ag paste and EVA carry screening Chile-coast container freight $0.08/kg; quartz, carbon, and caustic stay plant-gate. Not a logistics model. Not USGS silicon metal and not a poly/Al/alumina offtake. Not a cell fab, not TOPCon, not a TCS/HCl plant model, not FBR, not bankable. Purchased quartzite, bauxite, caustic makeup, carbon, Ag, glass, and EVA are not a concession or port lease. Chile CAPEX× 1.05 applies to furnaces, Bayer island, poly island, module line, and solar (unchanged). Screening, not bankable.',
  };
  return definition;
}

return { createSiliconCase };
});
