(function exposeMethanolCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/atacama-pacific-seawater.js') : root.AtacamaPacificSeawater
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MethanolCase = api;
})(globalThis, (model, assay) => {
const { SUBSTANCES, streamMassKg } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
// Frozen PVGIS-ERA5 response: data/pvgis-mejillones.json, retrieved 2026-09-14.
const DAILY_PV = [1923.52 / 365, 5.57, 5.66, 5.56, 5.05, 4.63, 4.38, 4.54, 5.1, 5.59, 5.8, 5.76, 5.62];
const INTAKE_M3_PER_DAY = 0.1;
const FEED_DENSITY_KG_M3 = assay.density_kg_per_L * 1000;
const MILLERO_URL = 'https://doi.org/10.1016/j.dsr.2007.10.001';
const WOA_URL = 'https://doi.org/10.25923/70qt-9574';
const H2_PER_KG = 3 * SUBSTANCES.H2.molarMassG / SUBSTANCES.CH3OH.molarMassG;
const CO2_PER_KG = SUBSTANCES.CO2.molarMassG / SUBSTANCES.CH3OH.molarMassG;
const WATER_PER_KG_H2 = SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
const EVIDENCE = [
  { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.100, −70.448); 23° tilt, north-facing. SARAH3 does not cover this longitude.', url: PVGIS_URL },
  { label: 'PEM: DOE 2022 system status, 55 kWh/kg H₂; not a future target', url: 'https://www.energy.gov/cmei/fuels/technical-targets-proton-exchange-membrane-electrolysis' },
  { label: 'SWRO plant SEC band: Elimelech & Phillip 2011; Voutchkov 2018 RO-train 2.5–2.8 kWh/m³', url: 'https://doi.org/10.1016/j.desal.2017.10.033' },
  { label: 'Seawater: Millero/Pilson S=35 majors scaled 34.9/35 for SE Pacific / Atacama coast; not a NaCl proxy', url: MILLERO_URL },
  { label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)', url: WOA_URL },
  { label: 'Air: 422.45 ppm, 2024 global estimate; dry O₂/N₂ balance is simplified', url: 'https://essd.copernicus.org/articles/17/965/2025/' },
  { label: 'DAC: solid-sorbent route; heat, capture and makeup rates are screening assumptions (IEA 2022)', url: 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary' },
  { label: 'NASEM 2019 Negative Emissions Technologies — DAC heat-dominated (DOI)', url: 'https://doi.org/10.17226/25259' },
  { label: 'Methanol: CO₂ + 3 H₂ → CH₃OH + H₂O; 0.5 kWh/kg synthesis/compression and $0.40/kg product price are screening, not plant quotes' },
];

function seawaterFromAssay(pacificAssay, massKg) {
  const gPerKg = pacificAssay.ions_g_per_kg;
  const molPerKg = pacificAssay.mol_per_kg;
  const saltMassKg = Object.values(gPerKg).reduce((sum, grams) => sum + grams, 0) / 1000 * massKg;
  const mol = {
    H2O: (massKg - saltMassKg) * 1000 / SUBSTANCES.H2O.molarMassG,
  };
  for (const [id, amount] of Object.entries(molPerKg)) mol[id] = amount * massKg;
  return { kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1, mol };
}

function scaleMaterial(stream, targetKg) {
  const factor = targetKg / streamMassKg(stream);
  return { ...stream, mol: Object.fromEntries(Object.entries(stream.mol).map(([id, mol]) => [id, mol * factor])) };
}

function airFromCo2Ppm(co2Ppm, massKg) {
  const co2Mol = co2Ppm;
  const balanceMol = 1e6 - co2Mol;
  return scaleMaterial({
    kind: 'material',
    mol: { CO2: co2Mol, O2: balanceMol * 0.2115, N2: balanceMol * (1 - 0.2115) },
    phase: 'gas',
    T_C: 25,
    P_bar: 1,
  }, massKg);
}

function right(kind, status, note, evidence) {
  return {
    kind,
    status,
    authorize: status === 'authorized' || status === 'assumed',
    note,
    ...(evidence ? { evidence } : {}),
  };
}

function createMethanolCase(month = 0) {
  if (!Number.isInteger(month) || month < 0 || month > 12) throw new Error('Month must be 0–12');
  const solarKWp = 20;
  const electricityKWh = DAILY_PV[month] * solarKWp;
  const massKg = INTAKE_M3_PER_DAY * FEED_DENSITY_KG_M3;
  const seawater = seawaterFromAssay(assay, massKg);
  const air = airFromCo2Ppm(422.45, 25000);
  const waterPerKg = H2_PER_KG * WATER_PER_KG_H2;
  const kWhPerKg = H2_PER_KG * 55 + CO2_PER_KG * 0.5 + waterPerKg / 1000 / 0.45 * 3.5 + 0.5;
  const target = Math.min(5, electricityKWh / kWhPerKg);
  const h2Requested = target * H2_PER_KG;
  const dacRequested = target * CO2_PER_KG;
  const roRequested = h2Requested * WATER_PER_KG_H2 / 1000;
  const heatKWh = 30;
  const heatT_C = 100;
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'air', unit: 'material-source', params: { stream: air }, economics: { unitCost: 0 } },
        { id: 'seawater', unit: 'material-source', params: { stream: seawater }, economics: { unitCost: 0.001 } },
        {
          id: 'electricity',
          unit: 'electricity-source',
          params: { stream: { kind: 'electricity', kWh: electricityKWh } },
          economics: { installedCapex: solarKWp * 1000, fixedOM: solarKWp * 20, assetLifeYears: 25 },
        },
        {
          id: 'heat',
          unit: 'heat-source',
          params: { stream: { kind: 'heat', kWh: heatKWh, T_C: heatT_C } },
          economics: { unitCost: 0.01 },
        },
        {
          id: 'consumables',
          unit: 'consumable-source',
          params: { stream: { kind: 'consumable', amount: 1, unit: 'kg/day', label: 'Amine sorbent makeup', chemicalId: 'amine-sorbent' } },
          economics: { unitCost: 2 },
        },
        {
          id: 'dac',
          unit: 'dac-solid',
          capacity: 100,
          params: {
            captureFraction: 0.9,
            electricityKWhPerKgCO2: 0.5,
            heatKWhPerKgCO2: 1.5,
            minHeatT_C: 80,
            consumablesPerKgCO2: 0.02,
            wasteHeatT_C: 40,
          },
          economics: { installedCapex: 16425, fixedOMPercent: 4, variableOM: 0.05, assetLifeYears: 20 },
        },
        {
          id: 'swro',
          unit: 'swro',
          capacity: 10,
          params: { recovery: 0.45, secKWhPerM3: 3.5, feedDensityKgM3: FEED_DENSITY_KG_M3, productDensityKgM3: 1000, ionRejection: 1 },
          economics: { installedCapex: 1000, fixedOMPercent: 3, variableOM: 0, assetLifeYears: 20 },
        },
        { id: 'electrical-bus', unit: 'electrical-bus' },
        {
          id: 'electrolyzer',
          unit: 'electrolyzer',
          capacity: 100,
          params: { secKWhPerKgH2: 55 },
          economics: { installedCapex: 21000, fixedOMPercent: 3, variableOM: 0.03, assetLifeYears: 10 },
        },
        {
          id: 'methanol',
          unit: 'methanol',
          capacity: 100,
          params: { electricityKWhPerKg: 0.5, wasteHeatKWhPerKg: 0.43, wasteHeatT_C: 250 },
          economics: { installedCapex: 12000, fixedOMPercent: 3, variableOM: 0.02, assetLifeYears: 20 },
        },
        { id: 'depleted-air', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waste-heat', unit: 'heat-sink', economics: { disposition: 'vent' } },
        { id: 'brine', unit: 'material-sink', economics: { disposition: 'disposal', disposalCost: 0.02 } },
        { id: 'oxygen', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'water-reject', unit: 'material-sink', economics: { disposition: 'disposal', disposalCost: 0.001 } },
        { id: 'spent-media', unit: 'consumable-sink', economics: { disposition: 'disposal', disposalCost: 1 } },
        { id: 'methanol-product', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 0.4, annualDemandLimit: 1e12 } },
        { id: 'process-water', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 0.001, annualDemandLimit: 1e12 } },
      ],
      edges: [
        { from: { node: 'air', port: 'out' }, to: { node: 'dac', port: 'air' } },
        { from: { node: 'heat', port: 'out' }, to: { node: 'dac', port: 'heat' } },
        { from: { node: 'consumables', port: 'out' }, to: { node: 'dac', port: 'consumables' } },
        { from: { node: 'seawater', port: 'out' }, to: { node: 'swro', port: 'feed' } },
        { from: { node: 'electricity', port: 'out' }, to: { node: 'electrical-bus', port: 'in' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'dac', port: 'electricity' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'methanol', port: 'electricity' } },
        { from: { node: 'dac', port: 'capturedCo2' }, to: { node: 'methanol', port: 'co2' } },
        { from: { node: 'dac', port: 'depletedAir' }, to: { node: 'depleted-air', port: 'in' } },
        { from: { node: 'dac', port: 'wasteHeat' }, to: { node: 'waste-heat', port: 'in' } },
        { from: { node: 'dac', port: 'spentMedia' }, to: { node: 'spent-media', port: 'in' } },
        { from: { node: 'swro', port: 'product' }, to: { node: 'electrolyzer', port: 'water' } },
        { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'methanol', port: 'hydrogen' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'oxygen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'water-reject', port: 'in' } },
        { from: { node: 'methanol', port: 'methanol' }, to: { node: 'methanol-product', port: 'in' } },
        { from: { node: 'methanol', port: 'water' }, to: { node: 'process-water', port: 'in' } },
        { from: { node: 'methanol', port: 'wasteHeat' }, to: { node: 'waste-heat', port: 'in' } },
      ],
    },
    operation: {
      setpoints: {
        dac: dacRequested,
        swro: roRequested,
        electrolyzer: h2Requested,
        methanol: target,
      },
      priorities: { 'electrical-bus': ['dac', 'swro', 'electrolyzer', 'methanol'] },
      boundaryLimitedBy: target < 5 ? ['site solar electricity'] : [],
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const assumed = 'Assumed accessible quantity; no local supply agreement verified';
  const resources = {
    air: { stream: JSON.parse(JSON.stringify(node('air').params.stream)), quality: 'literature-estimate', evidence: assumed },
    seawater: {
      stream: JSON.parse(JSON.stringify(node('seawater').params.stream)),
      quality: 'cited',
      evidence: 'SE Pacific / Atacama multi-ion assay from frozen data/atacama-pacific-seawater.json (Millero/Pilson S=35 scaled 34.9/35). Daily intake is 0.1 m³; not an intake or discharge permit',
    },
    electricity: { stream: JSON.parse(JSON.stringify(node('electricity').params.stream)), quality: 'literature-estimate', evidence: 'PVGIS-ERA5 monthly average × assumed 20 kWp array' },
    heat: { stream: JSON.parse(JSON.stringify(node('heat').params.stream)), quality: 'user-assumption', evidence: assumed },
    consumables: { stream: JSON.parse(JSON.stringify(node('consumables').params.stream)), quality: 'user-assumption', evidence: 'Makeup chemical is a screening assumption, not a vendor contract' },
    grid: { stream: { kind: 'electricity', kWh: 0 }, quality: 'unverified', evidence: 'Unverified grid access; zero authorized imports' },
    freshwater: { stream: { kind: 'material', mol: { H2O: 0 }, phase: 'liquid', T_C: 25, P_bar: 1 }, quality: 'unverified', evidence: 'Unverified freshwater access; zero authorized supply' },
  };
  for (const id of ['air', 'seawater', 'electricity', 'heat', 'consumables']) node(id).siteResource = id;
  definition.site = {
    id: 'mejillones-pvgis-2026-09-14',
    name: 'Mejillones · Antofagasta, Chile',
    latitude: -23.100,
    longitude: -70.448,
    month,
    solarKWp,
    dailyPVKWhPerKWp: DAILY_PV[month],
    resources,
    evidence: EVIDENCE,
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV[month],
      monthlyPVKWhPerKWp: DAILY_PV.slice(),
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-14',
      notes: 'Frozen PVGIS-ERA5 monthly at −23.100, −70.448; 23° tilt, north-facing. SARAH3 does not cover this longitude. Not a plant-measured irradiance series.',
      cite: {
        label: 'PVGIS-ERA5, 2005–2023 monthly; frozen 2026-09-14',
        url: PVGIS_URL,
      },
    },
    assay: {
      kind: 'seawater',
      summary: 'SE Pacific / Atacama ~34.9 g/kg, Millero/Pilson S=35 majors scaled 34.9/35; multi-ion, not a NaCl proxy or intake permit',
      quality: 'cited',
      evidence: [
        { label: 'Millero et al. 2008 reference-composition seawater at S=35 (DOI)', url: MILLERO_URL },
        { label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)', url: WOA_URL },
      ],
    },
    rights: {
      gridImport: right('grid', 'unverified', 'SING/SEN coastal substations are not an interconnection agreement', [
        { label: 'Wikipedia: Mejillones (context, not a connection agreement)', url: 'https://en.wikipedia.org/wiki/Mejillones' },
      ]),
      freshwater: right('freshwater', 'unverified', 'Unverified freshwater access; zero authorized supply in this arid basin'),
      seawaterIntake: right('intake', 'assumed', 'Assumed 0.1 m³/day Pacific intake; no Mejillones intake permit on file', [
        { label: 'Millero et al. 2008 assay context for the assumed intake volume', url: MILLERO_URL },
      ]),
      seawaterDischarge: right('discharge', 'unverified', 'Unverified Pacific outfall; no Mejillones discharge permit on file'),
      brineConcession: right('concession', 'unverified', 'Atacama minerals nearby are not a brine concession for this plant'),
      saltPurchase: right('purchase', 'unverified', 'No salt purchase agreement; the plant does not buy salt'),
    },
    notes: 'Representative-day methanol plant at the Mejillones industrial bay preset. Intake 0.1 m³/day and 30 kWh/day heat at 100°C are assumed, not permitted supplies. Seawater is the frozen Atacama Pacific multi-ion assay (data/atacama-pacific-seawater.json), not a NaCl proxy. Grid, freshwater, and seawater discharge rights are unverified zeros. Methanol synthesis electricity 0.5 kWh/kg and $0.40/kg product price are screening assumptions, not plant quotes. Annual economics repeat the selected typical day for 365 days.',
  };
  return definition;
}

return { createMethanolCase, DAILY_PV, seawaterFromAssay, INTAKE_M3_PER_DAY };
});
