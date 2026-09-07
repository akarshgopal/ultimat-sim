(function exposeCoastalCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./sabatier') : root.SabatierCase,
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/almeria-seawater.js') : root.AlmeriaSeawater
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoastalCase = api;
})(globalThis, (sabatier, model, assay) => {
const { SUBSTANCES } = model;
const HOURLY = typeof require === 'function' ? require('../data/pvgis-almeria-hourly.js') : globalThis.PvgisAlmeriaHourly;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=36.834&lon=-2.463&peakpower=1&loss=14&angle=30&aspect=0&outputformat=json';
// Frozen PVGIS response: data/pvgis-almeria.json, retrieved 2026-09-05.
const DAILY_PV = [1716.39 / 365, 3.75, 4.35, 4.75, 5.17, 5.37, 5.54, 5.52, 5.38, 4.91, 4.31, 3.72, 3.65];
const INTAKE_M3_PER_DAY = 0.1;
const FEED_DENSITY_KG_M3 = assay.density_kg_per_L * 1000;
const MILLERO_URL = 'https://doi.org/10.1016/j.dsr.2007.10.001';
const ALBORAN_URL = 'https://en.wikipedia.org/wiki/Alboran_Sea';
const EVIDENCE = [
  { label: 'Solar: PVGIS-SARAH3 / ERA5, 2005–2023 monthly; 2023 hourly typical day for dispatch', url: PVGIS_URL },
  { label: 'PEM: DOE 2022 system status, 55 kWh/kg H₂; not a future target', url: 'https://www.energy.gov/cmei/fuels/technical-targets-proton-exchange-membrane-electrolysis' },
  { label: 'Seawater: Millero/Pilson S=35 majors scaled 36.5/35 for Alboran MAW near Almería; not a NaCl proxy', url: MILLERO_URL },
  { label: 'Alboran Sea Modified Atlantic Water salinity context (~36.5 g/kg)', url: ALBORAN_URL },
  { label: 'Air: 422.45 ppm, 2024 global estimate; dry O₂/N₂ balance is simplified', url: 'https://essd.copernicus.org/articles/17/965/2025/' },
  { label: 'DAC: solid-sorbent route; heat, capture and makeup rates are screening assumptions', url: 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary' },
];

function seawaterFromAssay(almeriaAssay, massKg) {
  const gPerKg = almeriaAssay.ions_g_per_kg;
  const molPerKg = almeriaAssay.mol_per_kg;
  const saltMassKg = Object.values(gPerKg).reduce((sum, grams) => sum + grams, 0) / 1000 * massKg;
  const mol = {
    H2O: (massKg - saltMassKg) * 1000 / SUBSTANCES.H2O.molarMassG,
  };
  for (const [id, amount] of Object.entries(molPerKg)) mol[id] = amount * massKg;
  return { kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1, mol };
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

function createCoastalCase(month = 0) {
  if (!Number.isInteger(month) || month < 0 || month > 12) throw new Error('Month must be 0–12');
  const solarKWp = 37.5;
  const electricityKWh = DAILY_PV[month] * solarKWp;
  const massKg = INTAKE_M3_PER_DAY * FEED_DENSITY_KG_M3;
  const seawater = seawaterFromAssay(assay, massKg);
  const h2 = 4 * 2.01588 / 16.04246;
  const co2 = 44.0095 / 16.04246;
  const water = h2 * 18.01528 / 2.01588;
  // Match this example's upstream setpoints; installed capacities stay fixed.
  const target = Math.min(5, electricityKWh / (h2 * 55 + co2 * 0.5 + water / 1000 * 3.5 + 1));
  const definition = sabatier.createSabatierCase({
    co2Ppm: 422.45, seawater, electricityKWh,
    h2Requested: target * h2, dacRequested: target * co2,
    params: { electrolyzer: { secKWhPerKgH2: 55 }, swro: { feedDensityKgM3: FEED_DENSITY_KG_M3 } },
  });
  const node = id => definition.graph.nodes.find(item => item.id === id);
  node('dac').unit = 'dac-solid';
  node('dac').params.consumablesPerKgCO2 = 0.02;
  node('consumables').params.stream = { kind: 'consumable', amount: 1, unit: 'kg/day', label: 'Amine sorbent makeup', chemicalId: 'amine-sorbent' };
  node('electricity').economics = { installedCapex: solarKWp * 1000, fixedOM: solarKWp * 20, assetLifeYears: 25 };
  definition.graph.nodes.push({ id: 'spent-media', unit: 'consumable-sink', economics: { disposition: 'disposal', disposalCost: 1 } });
  definition.graph.edges.push({ from: { node: 'dac', port: 'spentMedia' }, to: { node: 'spent-media', port: 'in' } });
  const assumed = 'Assumed accessible quantity; no local supply agreement verified';
  const resources = {
    air: { stream: JSON.parse(JSON.stringify(node('air').params.stream)), quality: 'literature-estimate', evidence: assumed },
    seawater: {
      stream: JSON.parse(JSON.stringify(node('seawater').params.stream)),
      quality: 'cited',
      evidence: 'Alboran MAW multi-ion assay from frozen data/almeria-seawater.json (Millero/Pilson S=35 scaled 36.5/35). Daily intake is 0.1 m³; not an intake or discharge permit',
    },
    electricity: { stream: JSON.parse(JSON.stringify(node('electricity').params.stream)), quality: 'literature-estimate', evidence: 'PVGIS-SARAH3/ERA5 monthly average × assumed 37.5 kWp array' },
    heat: { stream: JSON.parse(JSON.stringify(node('heat').params.stream)), quality: 'user-assumption', evidence: assumed },
    consumables: { stream: JSON.parse(JSON.stringify(node('consumables').params.stream)), quality: 'user-assumption', evidence: 'Makeup chemical is a screening assumption, not a vendor contract' },
    grid: { stream: { kind: 'electricity', kWh: 0 }, quality: 'unverified', evidence: 'Unverified grid access; zero authorized imports' },
    freshwater: { stream: { kind: 'material', mol: { H2O: 0 }, phase: 'liquid', T_C: 25, P_bar: 1 }, quality: 'unverified', evidence: 'Unverified freshwater access; zero authorized supply' },
  };
  for (const id of ['air', 'seawater', 'electricity', 'heat', 'consumables']) node(id).siteResource = id;
  definition.site = {
    id: 'almeria-pvgis-2026-09-05', name: 'Almería coast · Spain', latitude: 36.834, longitude: -2.463,
    month, solarKWp, dailyPVKWhPerKWp: DAILY_PV[month], resources, evidence: EVIDENCE,
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV[month],
      monthlyPVKWhPerKWp: DAILY_PV.slice(),
      quality: 'cited',
      source: 'PVGIS-SARAH3/ERA5',
      retrieved: '2026-09-05',
      notes: 'Frozen PVGIS-SARAH3/ERA5 monthly plus 2023 hourly typical day at 36.834, −2.463; not a plant-measured irradiance series.',
      cite: {
        label: 'PVGIS-SARAH3 / ERA5, 2005–2023 monthly; frozen 2026-09-05',
        url: PVGIS_URL,
      },
    },
    assay: {
      kind: 'seawater',
      summary: 'Alboran MAW ~36.5 g/kg, Millero/Pilson S=35 majors scaled 36.5/35; multi-ion, not a NaCl proxy or intake permit',
      quality: 'cited',
      evidence: [
        { label: 'Millero et al. 2008 reference-composition seawater at S=35 (DOI)', url: MILLERO_URL },
        { label: 'Wikipedia: Alboran Sea (Modified Atlantic Water ~36.5 g/kg context)', url: ALBORAN_URL },
      ],
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports', [
        { label: 'Red Eléctrica de España (context, not a connection agreement)', url: 'https://www.ree.es/en' },
      ]),
      freshwater: right('freshwater', 'unverified', 'Unverified freshwater access; zero authorized supply', [
        { label: 'Spain MITECO water (context, not a concession)', url: 'https://www.miteco.gob.es/en/agua.html' },
      ]),
      seawaterIntake: right('intake', 'assumed', 'Assumed 0.1 m³/day intake; no Almería intake permit on file', [
        { label: 'Millero et al. 2008 assay context for the assumed intake volume', url: MILLERO_URL },
      ]),
      seawaterDischarge: right('discharge', 'unverified', 'Unverified coastal outfall; no Almería discharge permit on file'),
      brineConcession: right('concession', 'unverified', 'No brine or mineral concession at this coastal methane site'),
      saltPurchase: right('purchase', 'unverified', 'No salt purchase agreement; the plant does not buy salt'),
    },
    solar: HOURLY ? {
      typicalMonths: HOURLY.typicalMonths,
      annualTypical: HOURLY.annualTypical,
      year: HOURLY.year,
      database: HOURLY.database,
      url: HOURLY.url,
    } : null,
    notes: 'Hourly typical-day dispatch from PVGIS 2023 seriescalc; night hours have no PV unless a battery is assumed. Intake 0.1 m³/day and 30 kWh/day heat at 100°C are assumed, not permitted supplies. Seawater is the frozen Alboran multi-ion assay (data/almeria-seawater.json), not a NaCl proxy. Grid, freshwater, and seawater discharge rights are unverified zeros. SWRO includes ideal polishing; CO₂ is ideal dry gas. All costs are illustrative USD assumptions, not local quotes. Annual economics repeat the selected typical day for 365 days.',
  };
  definition.operation.boundaryLimitedBy = target < 5 ? ['site solar electricity'] : [];
  return definition;
}
return { createCoastalCase, DAILY_PV, seawaterFromAssay, INTAKE_M3_PER_DAY };
});
