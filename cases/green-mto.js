(function exposeGreenMtoCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/atacama-pacific-seawater.js') : root.AtacamaPacificSeawater,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GreenMtoCase = api;
})(globalThis, (model, assay, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const DAILY_PV_ED = 5.27;
const ETHYLENE_KG_PER_DAY = 1000;
const SEC_MTO = 4;
const SEC_MEOH = 0.5;
const SEC_H2 = 52;
const SEC_SWRO = 3.5;
const FEED_MARGIN = 1.05;
const RECOVERY = 0.45;
const PRODUCT_DENSITY_KG_M3 = 1000;
const FEED_DENSITY_KG_M3 = assay.density_kg_per_L * 1000;
const REGION = 'Atacama/Chile';
const CHEN_MTO = 'https://doi.org/10.1016/j.jtice.2021.07.039';
const IRENA_MEOH = 'https://www.irena.org/publications/2021/Jan/Innovation-Outlook-Renewable-Methanol';
const ARGUS_ETHYLENE = 'https://www.argusmedia.com/-/media/project/argusmedia/mainsite/english/documents-and-files/sample-reports/argus-ethylene-and-derivatives.pdf';
const IEA_ETHYLENE = 'https://www.iea.org/data-and-statistics/charts/annual-ethylene-capacitydemand-growth-and-regional-price-developments-2015-2020';
const SINOPEC_MTO = 'https://www.yokogawa.com/library/resources/references/stable-operation-and-proactive-maintenance-realized-at-new-coal-chemical-plant-in-china/';
const IEA_DAC = 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary';
const IEA_H2 = 'https://www.iea.org/reports/global-hydrogen-review-2024';
const DOE_H2 = 'https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis';
const MEJILLONES_URL = 'https://en.wikipedia.org/wiki/Mejillones';
const MILLERO_URL = 'https://doi.org/10.1016/j.dsr.2007.10.001';
const WOA_URL = 'https://doi.org/10.25923/70qt-9574';

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

function seawaterFromAssay(seawaterAssay, massKg) {
  const gPerKg = seawaterAssay.ions_g_per_kg;
  const molPerKg = seawaterAssay.mol_per_kg;
  const saltMassKg = Object.values(gPerKg).reduce((sum, grams) => sum + grams, 0) / 1000 * massKg;
  const mol = {
    H2O: (massKg - saltMassKg) * 1000 / SUBSTANCES.H2O.molarMassG,
  };
  for (const [id, amount] of Object.entries(molPerKg)) mol[id] = amount * massKg;
  return { kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1, mol };
}

function createGreenMtoCase() {
  const methanolKg = ETHYLENE_KG_PER_DAY * 2 * SUBSTANCES.CH3OH.molarMassG / SUBSTANCES.C2H4.molarMassG;
  const h2Kg = methanolKg * 3 * SUBSTANCES.H2.molarMassG / SUBSTANCES.CH3OH.molarMassG;
  const co2Kg = methanolKg * SUBSTANCES.CO2.molarMassG / SUBSTANCES.CH3OH.molarMassG * FEED_MARGIN;
  const waterKg = h2Kg * SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
  const swroProductM3 = waterKg / PRODUCT_DENSITY_KG_M3 * FEED_MARGIN;
  const feedM3 = swroProductM3 / RECOVERY;
  const seawaterKg = feedM3 * FEED_DENSITY_KG_M3;
  const kWhPerDay = h2Kg * SEC_H2 + swroProductM3 * SEC_SWRO + methanolKg * SEC_MEOH + ETHYLENE_KG_PER_DAY * SEC_MTO;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const carbonDioxide = material('CO2', co2Kg, 'gas');
  const seawater = seawaterFromAssay(assay, seawaterKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const seawaterCost = tea.costs && tea.costs.seawater
    ? tea.bindCost('seawater', { region: REGION })
    : { unitCost: 0 };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'co2-feed', unit: 'material-source', sourcePreset: 'co2', params: { stream: carbonDioxide }, economics: tea.bindCost('co2-feed') },
        { id: 'seawater', unit: 'material-source', sourcePreset: 'seawater', params: { stream: seawater }, economics: seawaterCost },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'swro',
          unit: 'swro',
          capacity: swroProductM3,
          params: { recovery: RECOVERY, secKWhPerM3: SEC_SWRO, feedDensityKgM3: FEED_DENSITY_KG_M3, productDensityKgM3: PRODUCT_DENSITY_KG_M3 },
          economics: tea.bindCapexPack('swro', { capacity: swroProductM3, region: REGION }),
        },
        {
          id: 'electrolyzer',
          unit: 'electrolyzer',
          capacity: h2Kg,
          params: { secKWhPerKgH2: SEC_H2 },
          economics: tea.bindCapexPack('electrolyzer', { capacity: h2Kg, region: REGION }),
        },
        {
          id: 'methanol',
          unit: 'methanol',
          capacity: methanolKg,
          params: { electricityKWhPerKg: SEC_MEOH, wasteHeatKWhPerKg: 0.43, wasteHeatT_C: 250 },
          economics: tea.bindCapexPack('methanol', { capacity: methanolKg, region: REGION }),
        },
        {
          id: 'mto',
          unit: 'mto',
          capacity: ETHYLENE_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_MTO },
          economics: tea.bindCapexPack('mto', { capacity: ETHYLENE_KG_PER_DAY, region: REGION }),
        },
        { id: 'ethylene-product', unit: 'material-sink', economics: tea.bindSale('ethylene', { region: REGION }) },
        { id: 'electrolyzer-oxygen', unit: 'material-sink', economics: tea.bindSale('oxygen', { region: REGION }) },
        { id: 'brine', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waterReject', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'methanol-water', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'mto-water', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waste-heat', unit: 'heat-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'co2-feed', port: 'out' }, to: { node: 'methanol', port: 'co2' } },
        { from: { node: 'seawater', port: 'out' }, to: { node: 'swro', port: 'feed' } },
        { from: { node: 'swro', port: 'product' }, to: { node: 'electrolyzer', port: 'water' } },
        { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'methanol', port: 'hydrogen' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'electrolyzer-oxygen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'waterReject', port: 'in' } },
        { from: { node: 'methanol', port: 'methanol' }, to: { node: 'mto', port: 'methanol' } },
        { from: { node: 'methanol', port: 'water' }, to: { node: 'methanol-water', port: 'in' } },
        { from: { node: 'methanol', port: 'wasteHeat' }, to: { node: 'waste-heat', port: 'in' } },
        { from: { node: 'mto', port: 'ethylene' }, to: { node: 'ethylene-product', port: 'in' } },
        { from: { node: 'mto', port: 'water' }, to: { node: 'mto-water', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'methanol', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'mto', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
      ],
    },
    operation: {
      setpoints: { electrolyzer: h2Kg, methanol: methanolKg, mto: ETHYLENE_KG_PER_DAY, swro: swroProductM3 },
      priorities: { 'power-bus': ['electrolyzer', 'methanol', 'mto', 'swro'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('co2-feed').siteResource = 'co2';
  node('seawater').siteResource = 'seawater';
  definition.site = {
    id: 'chile-mejillones-green-mto',
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to SWRO 3.5 kWh/m³ + electrolyzer 52 kWh/kg H₂ + methanol 0.5 kWh/kg + MTO 4 kWh/kg with 2% margin. No electricity purchase. Not a SEN interconnection or port lease.',
      },
      co2: {
        stream: clone(node('co2-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased industrial CO₂ assumed available at screening $0.05/kg. Not DAC full chain (coastal methanol.js remains the DAC demo) and not a merchant-gas contract.',
      },
      seawater: {
        stream: clone(node('seawater').params.stream),
        quality: 'cited',
        evidence: 'SE Pacific / Atacama coast multi-ion assay from frozen data/atacama-pacific-seawater.js (Millero/Pilson S=35 scaled 34.9/35). Basin typical, not a Mejillones intake permit sample.',
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
    assay: {
      kind: 'seawater',
      assayId: 'atacama-pacific-seawater',
      density_kg_per_L: assay.density_kg_per_L,
      summary: 'SE Pacific / Atacama coast ~34.9 g/kg, Millero/Pilson S=35 majors scaled 34.9/35; multi-ion, not a NaCl proxy or Mejillones intake sample',
      quality: 'cited',
      salinity_g_per_kg: assay.salinity_g_per_kg,
      evidence: Array.isArray(assay.evidence) ? assay.evidence.map(item => ({ ...item })) : [],
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to SWRO + PEM + methanol + MTO.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      co2Purchase: right('purchase', 'assumed', 'Purchased industrial CO₂ assumed available at screening $0.05/kg; not DAC full chain', [
        { label: 'IEA Direct Air Capture 2022 (family contrast; this purchase is industrial CO₂, not DAC full chain)', url: IEA_DAC },
      ]),
      seawaterIntake: right('intake', 'assumed', 'Pacific access is a screening assumption, not a Mejillones intake permit', [
        { label: 'Millero et al. 2008 assay context for the assumed intake volume', url: MILLERO_URL },
      ]),
      seawaterDischarge: right('discharge', 'assumed', 'Assumed so the screening cash gate can run; no Pacific outfall permit is on file', [
        { label: 'Wikipedia: Mejillones (context, not an outfall permit)', url: MEJILLONES_URL },
      ]),
    },
    evidence: [
      { label: 'Mejillones industrial geography', url: MEJILLONES_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly; annual E_y 1923.52 kWh/kWp, E_d 5.27', url: PVGIS_URL },
      { label: 'Chen et al. 2022 industrial-scale MTO TEA (TCI $371.35 MM / 740 kt/y olefins → $183/(kg olefin/day); not a UOP quote)', url: CHEN_MTO },
      { label: 'Yokogawa — Sinopec Zhongyuan S-MTO 600 kt/y (capacity-family; SEC proxy is electricity-as-total-energy ~4 kWh/kg)', url: SINOPEC_MTO },
      { label: 'Argus ethylene sample (commodity-band context; screening ethylene $0.80/kg, not a contract)', url: ARGUS_ETHYLENE },
      { label: 'IEA ethylene regional price family (screening mid, not a contract)', url: IEA_ETHYLENE },
      { label: 'IRENA renewable methanol (synthesis-island family; methanol pack $200/(kg/day) unchanged)', url: IRENA_MEOH },
      { label: 'Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)', url: MILLERO_URL },
      { label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)', url: WOA_URL },
      { label: 'IEA Global Hydrogen Review 2024 (electrolytic H₂ family context; this demo is on-site PEM, not a purchased grey/blue H₂ contract)', url: IEA_H2 },
      { label: 'DOE hydrogen production electrolysis (PEM/alkaline family; screening 52 kWh/kg H₂, not a vendor meter)', url: DOE_H2 },
    ],
    notes: 'On-site SWRO + PEM H₂ + purchased industrial CO₂ → methanol → screening ethylene proxy at Mejillones. Not purchased MeOH (that remains cases/mto.js). Not DAC (coastal methanol.js remains the DAC demo). Stoich CO₂ + 3 H₂ → CH₃OH + H₂O then 2 CH₃OH → C₂H₄ + 2 H₂O. SEC 4 kWh/kg is MTO electricity-as-total-energy; electrolyzer 52 kWh/kg H₂ dominates energy. Cash sign whatever falls out. Not bankable. Not UOP. Not a green-ethylene premium. Not FT. Chile CAPEX× 1.05. Sell O₂ at screening $0.05/kg.',
  };
  return definition;
}

return { createGreenMtoCase };
});
