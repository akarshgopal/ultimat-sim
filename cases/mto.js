(function exposeMtoCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MtoCase = api;
})(globalThis, (model, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const DAILY_PV_ED = 5.27;
const ETHYLENE_KG_PER_DAY = 1000;
const SEC_MTO = 4;
const FEED_MARGIN = 1.05;
const REGION = 'Atacama/Chile';
const CHEN_MTO = 'https://doi.org/10.1016/j.jtice.2021.07.039';
const IRENA_MEOH = 'https://www.irena.org/publications/2021/Jan/Innovation-Outlook-Renewable-Methanol';
const ARGUS_ETHYLENE = 'https://www.argusmedia.com/-/media/project/argusmedia/mainsite/english/documents-and-files/sample-reports/argus-ethylene-and-derivatives.pdf';
const IEA_ETHYLENE = 'https://www.iea.org/data-and-statistics/charts/annual-ethylene-capacitydemand-growth-and-regional-price-developments-2015-2020';
const SINOPEC_MTO = 'https://www.yokogawa.com/library/resources/references/stable-operation-and-proactive-maintenance-realized-at-new-coal-chemical-plant-in-china/';
const MEJILLONES_URL = 'https://en.wikipedia.org/wiki/Mejillones';

function right(kind, status, note, evidence) {
  return {
    kind,
    status,
    authorize: status === 'authorized' || status === 'assumed',
    note,
    ...(evidence ? { evidence } : {}),
  };
}

function material(substance, kg, phase) {
  return {
    kind: 'material',
    mol: { [substance]: kg * 1000 / SUBSTANCES[substance].molarMassG },
    phase,
    T_C: 25,
    P_bar: 1,
  };
}

function createMtoCase() {
  const ethyleneKg = ETHYLENE_KG_PER_DAY;
  const methanolKg = ethyleneKg * FEED_MARGIN * 2 * SUBSTANCES.CH3OH.molarMassG / SUBSTANCES.C2H4.molarMassG;
  const kWhPerDay = ethyleneKg * SEC_MTO;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const methanol = material('CH3OH', methanolKg, 'liquid');
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'methanol-feed', unit: 'material-source', sourcePreset: 'methanol', params: { stream: methanol }, economics: tea.bindCost('methanol-feed') },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'mto',
          unit: 'mto',
          capacity: ETHYLENE_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_MTO },
          economics: tea.bindCapexPack('mto', { capacity: ETHYLENE_KG_PER_DAY, region: REGION }),
        },
        { id: 'ethylene-product', unit: 'material-sink', economics: tea.bindSale('ethylene', { region: REGION }) },
        { id: 'process-water', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'methanol-feed', port: 'out' }, to: { node: 'mto', port: 'methanol' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'mto', port: 'electricity' } },
        { from: { node: 'mto', port: 'ethylene' }, to: { node: 'ethylene-product', port: 'in' } },
        { from: { node: 'mto', port: 'water' }, to: { node: 'process-water', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { mto: ETHYLENE_KG_PER_DAY },
      priorities: { 'power-bus': ['mto'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('methanol-feed').siteResource = 'methanol';
  definition.site = {
    id: 'chile-mejillones-mto',
    name: 'Mejillones, Chile',
    latitude: -23.1,
    longitude: -70.448,
    region: REGION,
    solarKWp,
    dailyPVKWhPerKWp: DAILY_PV_ED,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'literature-estimate',
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to 1000 kg ethylene/day × 4 kWh/kg with 2% margin. No electricity purchase. Not a SING interconnection or Mejillones port lease.',
      },
      methanol: {
        stream: clone(node('methanol-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased methanol assumed available at screening $0.40/kg (mirrors the methanol sale price). Not a green-MeOH stack and not a methanol contract.',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-14',
      cite: {
        label: 'PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.100, −70.448); frozen data/pvgis-mejillones.json E_y 1923.52, totals.fixed E_d 5.27',
        url: PVGIS_URL,
      },
      notes: 'Frozen PVGIS-ERA5 totals.fixed E_d 5.27 kWh/kWp·day and E_y 1923.52 kWh/kWp from data/pvgis-mejillones.json, retrieved 2026-09-14. Not a plant pyranometer.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to the MTO SEC proxy.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      methanolPurchase: right('purchase', 'assumed', 'Purchased MeOH assumed available at screening $0.40/kg; not a green-MeOH stack and not a contract', [
        { label: 'IRENA Innovation Outlook: Renewable Methanol (commodity-band order; screening purchase, not a contract)', url: IRENA_MEOH },
      ]),
    },
    evidence: [
      { label: 'Mejillones geography', url: MEJILLONES_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.100, −70.448); annual E_y 1923.52 kWh/kWp, totals.fixed E_d 5.27', url: PVGIS_URL },
      { label: 'Chen et al. 2022 industrial-scale MTO TEA (TCI $371.35 MM / 740 kt/y olefins → $183/(kg olefin/day); not a UOP quote)', url: CHEN_MTO },
      { label: 'Yokogawa — Sinopec Zhongyuan S-MTO 600 kt/y (capacity-family; SEC proxy is electricity-as-total-energy ~4 kWh/kg)', url: SINOPEC_MTO },
      { label: 'Argus ethylene sample (commodity-band context; screening ethylene $0.80/kg, not a contract)', url: ARGUS_ETHYLENE },
      { label: 'IEA ethylene regional price family (screening mid, not a contract)', url: IEA_ETHYLENE },
      { label: 'IRENA renewable methanol (purchase at screening MeOH $0.40/kg; sale price unchanged)', url: IRENA_MEOH },
    ],
    notes: 'Purchased MeOH → screening ethylene proxy at the Mejillones map point. Not a green-MeOH stack. Overall stoich 2 CH₃OH → C₂H₄ + 2 H₂O only; not full MTO slate (propylene/C4 omitted) and not FT liquids. SEC 4 kWh/kg is an electricity-as-total-energy proxy (real MTO is heat-dominated). Cash sign whatever falls out. Not bankable. Atacama/Chile CAPEX× 1.05 on mto island + solar-pv.',
  };
  return definition;
}

return { createMtoCase };
});
