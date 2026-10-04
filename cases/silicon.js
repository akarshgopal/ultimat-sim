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
const POLY_KG_PER_DAY = 1000;
const SI_KG_PER_DAY = POLY_KG_PER_DAY * 1.05;
const AL_KG_PER_DAY = 1000;
const FEED_MARGIN = 1.05;
const USGS_SI = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-silicon.pdf';
const USGS_AL = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-aluminum.pdf';
const USGS_SILICA = 'https://www.usgs.gov/centers/national-minerals-information-center/silica-statistics-and-information';
const DOE_AL = 'https://www.energy.gov/sites/prod/files/2013/11/f4/al_roadmap.pdf';
const FRAUNHOFER_POLYSI = 'https://www.ise.fraunhofer.de/content/dam/ise/en/documents/publications/studies/25_en_ISE_Report_Analysis-of-the-Electricity-Consumption-for-the-Production-of-Electronic-Grade-Polysilicon.pdf';
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
  const aluminaKg = AL_KG_PER_DAY * 0.5 * SUBSTANCES.Al2O3.molarMassG / SUBSTANCES.Al.molarMassG * FEED_MARGIN;
  const anodeKg = AL_KG_PER_DAY * 0.75 * SUBSTANCES.C.molarMassG / SUBSTANCES.Al.molarMassG * FEED_MARGIN;
  const kWhPerDay = SI_KG_PER_DAY * 12 + POLY_KG_PER_DAY * 65 + AL_KG_PER_DAY * 14;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const quartz = material('SiO2', quartzKg);
  const reductant = material('C', reductantKg);
  const alumina = material('Al2O3', aluminaKg);
  const anode = material('C', anodeKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'quartz', unit: 'material-source', sourcePreset: 'quartz', params: { stream: quartz }, economics: tea.bindCost('quartz') },
        { id: 'reductant', unit: 'material-source', sourcePreset: 'carbon', params: { stream: reductant }, economics: tea.bindCost('carbon-reductant') },
        { id: 'alumina', unit: 'material-source', sourcePreset: 'alumina', params: { stream: alumina }, economics: tea.bindCost('alumina') },
        { id: 'anode', unit: 'material-source', sourcePreset: 'carbon', params: { stream: anode }, economics: tea.bindCost('carbon-anode') },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        { id: 'power-bus', unit: 'electrical-bus' },
        { id: 'mg-si', unit: 'mg-si', capacity: SI_KG_PER_DAY, params: { electricityKWhPerKg: 12 }, economics: tea.bindCapexPack('mg-si', { capacity: SI_KG_PER_DAY, region: REGION }) },
        { id: 'polysilicon', unit: 'polysilicon', capacity: POLY_KG_PER_DAY, params: { electricityKWhPerKg: 65 }, economics: tea.bindCapexPack('polysilicon', { capacity: POLY_KG_PER_DAY, region: REGION }) },
        { id: 'aluminium-smelter', unit: 'aluminium-smelter', capacity: AL_KG_PER_DAY, params: { electricityKWhPerKg: 14 }, economics: tea.bindCapexPack('aluminium-smelter', { capacity: AL_KG_PER_DAY, region: REGION }) },
        { id: 'poly-silicon', unit: 'material-sink', economics: tea.bindSale('polysilicon', { region: REGION }) },
        { id: 'aluminium', unit: 'material-sink', economics: tea.bindSale('aluminium', { region: REGION }) },
        { id: 'carbonMonoxide', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'carbonDioxide', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'quartz', port: 'out' }, to: { node: 'mg-si', port: 'quartz' } },
        { from: { node: 'reductant', port: 'out' }, to: { node: 'mg-si', port: 'carbon' } },
        { from: { node: 'alumina', port: 'out' }, to: { node: 'aluminium-smelter', port: 'alumina' } },
        { from: { node: 'anode', port: 'out' }, to: { node: 'aluminium-smelter', port: 'carbon' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'mg-si', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'polysilicon', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'aluminium-smelter', port: 'electricity' } },
        { from: { node: 'mg-si', port: 'silicon' }, to: { node: 'polysilicon', port: 'silicon' } },
        { from: { node: 'polysilicon', port: 'polysilicon' }, to: { node: 'poly-silicon', port: 'in' } },
        { from: { node: 'mg-si', port: 'carbonMonoxide' }, to: { node: 'carbonMonoxide', port: 'in' } },
        { from: { node: 'aluminium-smelter', port: 'aluminium' }, to: { node: 'aluminium', port: 'in' } },
        { from: { node: 'aluminium-smelter', port: 'carbonDioxide' }, to: { node: 'carbonDioxide', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { 'mg-si': SI_KG_PER_DAY, polysilicon: POLY_KG_PER_DAY, 'aluminium-smelter': AL_KG_PER_DAY },
      priorities: { 'power-bus': ['mg-si', 'polysilicon', 'aluminium-smelter'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('quartz').siteResource = 'quartz';
  node('reductant').siteResource = 'reductant';
  node('alumina').siteResource = 'alumina';
  node('anode').siteResource = 'anode';
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to the MG-Si + Siemens-style poly-Si + Al load with 2% margin. Not a SEN interconnection or port lease.',
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
      alumina: {
        stream: clone(node('alumina').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased smelter-grade alumina assumed available; not a concession or port lease and not a Bayer plant.',
      },
      anode: {
        stream: clone(node('anode').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased Hall–Héroult anode carbon assumed available; not a concession or port lease.',
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
      brineConcession: right('concession', 'unverified', 'No brine; purchased quartzite/alumina/carbon are not a mineral concession', [
        { label: 'USGS silica statistics (commodity context, not a concession)', url: USGS_SILICA },
      ]),
      quartzPurchase: right('purchase', 'assumed', 'Purchased quartzite assumed available; not a quarry quote or port lease', [
        { label: 'USGS silica statistics (commodity context, not a contract)', url: USGS_SILICA },
      ]),
      aluminaPurchase: right('purchase', 'assumed', 'Purchased smelter-grade alumina assumed available; not a Bayer plant or port lease', [
        { label: 'USGS MCS 2025 aluminum (alumina feed context, not a contract)', url: USGS_AL },
      ]),
    },
    evidence: [
      { label: 'Mejillones industrial geography', url: 'https://en.wikipedia.org/wiki/Mejillones' },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly; annual E_y 1923.52 kWh/kWp, E_d 5.27', url: PVGIS_URL },
      { label: 'USGS MCS 2025 silicon metal (MG-Si feed family; product is SoG poly, not silicon metal)', url: USGS_SI },
      { label: 'Fraunhofer ISE SoG polysilicon electricity 60–71 kWh/kg; screening SEC 65', url: FRAUNHOFER_POLYSI },
      { label: 'NREL Spring 2025 Solar Industry Update — SoG poly spot screening mid $6/kg', url: NREL_SOLAR_2025 },
      { label: 'Renewable Energy World TCS Siemens CAPEX family (~$87/kg-y → 31755 $/(kg/day))', url: REW_POLYSI },
      { label: 'USGS MCS 2025 aluminum ingot', url: USGS_AL },
      { label: 'DOE aluminium industry roadmap', url: DOE_AL },
    ],
    notes: 'Screening crustal quartz → MG-Si (SiO2+2C→Si+2CO, 12 kWh/kg) → Siemens-style poly-Si (65 kWh/kg, Fraunhofer SoG 60–71 band mid; 1.05 mol MG-Si / mol product) with purchased alumina → Al (Hall–Héroult 14 kWh/kg) on frozen Mejillones PV. Sale is solar-grade poly at screening $6/kg, not USGS silicon metal. Not a TCS/HCl plant model, not FBR, not a PV module BOM (Ag/glass/EVA). Purchased quartzite, alumina, and carbon are not a concession or port lease. Chile CAPEX× 1.05 applies to furnaces, poly island, and solar. Screening, not bankable.',
  };
  return definition;
}

return { createSiliconCase };
});
