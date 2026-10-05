(function exposeGreenH2DriCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/atacama-pacific-seawater.js') : root.AtacamaPacificSeawater,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GreenH2DriCase = api;
})(globalThis, (model, assay, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const DAILY_PV_ED = 5.27;
const FE_KG_PER_DAY = 1000;
const SEC_DRI = 0.7;
const SEC_H2 = 52;
const SEC_SWRO = 3.5;
const FEED_MARGIN = 1.05;
const RECOVERY = 0.45;
const PRODUCT_DENSITY_KG_M3 = 1000;
const FEED_DENSITY_KG_M3 = assay.density_kg_per_L * 1000;
const REGION = 'Atacama/Chile';
const USGS_IRON_ORE = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-ore.pdf';
const USGS_STEEL = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-steel.pdf';
const IEA_H2 = 'https://www.iea.org/reports/global-hydrogen-review-2024';
const DOE_H2 = 'https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis';
const WB_PINK = 'https://www.worldbank.org/en/research/commodity-markets';
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

function material(substance, kg, phase = 'solid') {
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

function createGreenH2DriCase() {
  const oreKg = FE_KG_PER_DAY * 0.5 * SUBSTANCES.Fe2O3.molarMassG / SUBSTANCES.Fe.molarMassG * FEED_MARGIN;
  const h2Kg = FE_KG_PER_DAY * 1.5 * SUBSTANCES.H2.molarMassG / SUBSTANCES.Fe.molarMassG;
  const waterKg = h2Kg * SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
  const swroProductM3 = waterKg / PRODUCT_DENSITY_KG_M3 * FEED_MARGIN;
  const feedM3 = swroProductM3 / RECOVERY;
  const seawaterKg = feedM3 * FEED_DENSITY_KG_M3;
  const kWhPerDay = h2Kg * SEC_H2 + swroProductM3 * SEC_SWRO + FE_KG_PER_DAY * SEC_DRI;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const hematite = material('Fe2O3', oreKg);
  const seawater = seawaterFromAssay(assay, seawaterKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const seawaterCost = tea.costs && tea.costs.seawater
    ? tea.bindCost('seawater', { region: REGION })
    : { unitCost: 0 };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'iron-ore', unit: 'material-source', sourcePreset: 'ironOre', params: { stream: hematite }, economics: tea.bindCost('iron-ore', { region: REGION }) },
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
          id: 'dri',
          unit: 'hydrogen-dri',
          capacity: FE_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_DRI },
          economics: tea.bindCapexPack('hydrogen-dri', { capacity: FE_KG_PER_DAY, region: REGION }),
        },
        { id: 'steel', unit: 'material-sink', economics: tea.bindSale('steel', { region: REGION }) },
        { id: 'electrolyzer-oxygen', unit: 'material-sink', economics: tea.bindSale('oxygen', { region: REGION }) },
        { id: 'brine', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waterReject', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'process-water', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'iron-ore', port: 'out' }, to: { node: 'dri', port: 'ironOre' } },
        { from: { node: 'seawater', port: 'out' }, to: { node: 'swro', port: 'feed' } },
        { from: { node: 'swro', port: 'product' }, to: { node: 'electrolyzer', port: 'water' } },
        { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'dri', port: 'hydrogen' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'electrolyzer-oxygen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'waterReject', port: 'in' } },
        { from: { node: 'dri', port: 'steel' }, to: { node: 'steel', port: 'in' } },
        { from: { node: 'dri', port: 'water' }, to: { node: 'process-water', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'dri', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
      ],
    },
    operation: {
      setpoints: { electrolyzer: h2Kg, dri: FE_KG_PER_DAY, swro: swroProductM3 },
      priorities: { 'power-bus': ['electrolyzer', 'dri', 'swro'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('iron-ore').siteResource = 'ironOre';
  node('seawater').siteResource = 'seawater';
  definition.site = {
    id: 'chile-mejillones-green-h2-dri',
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to SWRO 3.5 kWh/m³ + electrolyzer 52 kWh/kg H₂ + DRI shaft 0.7 kWh/kg Fe with 2% margin. No electricity purchase. Not a SEN interconnection or port lease.',
      },
      ironOre: {
        stream: clone(node('iron-ore').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased hematite (Fe₂O₃) assumed available at screening $0.10/kg plant-gate. FEED_MARGIN 1.05 on the stoich 0.5 mol Fe₂O₃ / mol Fe. Not a mine contract or port lease.',
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
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to SWRO + PEM + DRI shaft.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      ironOrePurchase: right('purchase', 'assumed', 'Purchased hematite assumed available at screening $0.10/kg; not a mine contract or port lease', [
        { label: 'USGS MCS 2025 iron ore (commodity context, not a mine contract)', url: USGS_IRON_ORE },
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
      { label: 'USGS MCS 2025 iron ore (hematite feed family; screening $0.10/kg of ~$80–120/t)', url: USGS_IRON_ORE },
      { label: 'USGS MCS 2025 iron and steel (HBI/DRI family; screening $0.40/kg of ~$350–450/t)', url: USGS_STEEL },
      { label: 'World Bank commodity markets / pink sheet (metals family; screening HBI/DRI mid, not a Platts contract)', url: WB_PINK },
      { label: 'Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)', url: MILLERO_URL },
      { label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)', url: WOA_URL },
      { label: 'IEA Global Hydrogen Review 2024 (electrolytic H₂ family context; this demo is on-site PEM, not a purchased grey/blue H₂ contract)', url: IEA_H2 },
      { label: 'DOE hydrogen production electrolysis (PEM/alkaline family; screening 52 kWh/kg H₂, not a vendor meter)', url: DOE_H2 },
    ],
    notes: 'On-site SWRO + PEM H₂ → screening DRI Fe at Mejillones. Not purchased grey/blue H₂ (that remains cases/h2-dri.js). Stoich 0.5 Fe₂O₃ + 1.5 H₂ → Fe + 1.5 H₂O, same as hydrogen-dri. SEC 0.7 kWh/kg is shaft electricity only; electrolyzer 52 kWh/kg H₂ dominates energy. Cash sign whatever falls out. Not Midrex. Not EAF. Not bankable. Chile CAPEX× 1.05. Sell O₂ at screening $0.05/kg. No green-steel premium.',
  };
  return definition;
}

return { createGreenH2DriCase };
});
