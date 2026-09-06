(function exposeCoastalCase(root, factory) {
  const api = factory(typeof require === 'function' ? require('./sabatier') : root.SabatierCase);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoastalCase = api;
})(globalThis, sabatier => {
const HOURLY = typeof require === 'function' ? require('../data/pvgis-almeria-hourly.js') : globalThis.PvgisAlmeriaHourly;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=36.834&lon=-2.463&peakpower=1&loss=14&angle=30&aspect=0&outputformat=json';
// Frozen PVGIS response: data/pvgis-almeria.json, retrieved 2026-09-05.
const DAILY_PV = [1716.39 / 365, 3.75, 4.35, 4.75, 5.17, 5.37, 5.54, 5.52, 5.38, 4.91, 4.31, 3.72, 3.65];
const EVIDENCE = [
  { label: 'Solar: PVGIS-SARAH3 / ERA5, 2005–2023 monthly; 2023 hourly typical day for dispatch', url: PVGIS_URL },
  { label: 'PEM: DOE 2022 system status, 55 kWh/kg H₂; not a future target', url: 'https://www.energy.gov/cmei/fuels/technical-targets-proton-exchange-membrane-electrolysis' },
  { label: 'Salinity: 35 g/kg global reference, represented as NaCl; not an Almería water assay', url: 'https://oceanservice.noaa.gov/facts/whysalty.html' },
  { label: 'Air: 422.45 ppm, 2024 global estimate; dry O₂/N₂ balance is simplified', url: 'https://essd.copernicus.org/articles/17/965/2025/' },
  { label: 'DAC: solid-sorbent route; heat, capture and makeup rates are screening assumptions', url: 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary' },
];

function createCoastalCase(month = 0) {
  if (!Number.isInteger(month) || month < 0 || month > 12) throw new Error('Month must be 0–12');
  const solarKWp = 37.5;
  const electricityKWh = DAILY_PV[month] * solarKWp;
  const seawaterKg = 0.1 * 1025;
  const seawater = {
    kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1,
    mol: { H2O: seawaterKg * 0.965 * 1000 / 18.01528, 'Na+': seawaterKg * 0.035 * 1000 / 58.439769, 'Cl-': seawaterKg * 0.035 * 1000 / 58.439769 },
  };
  const h2 = 4 * 2.01588 / 16.04246;
  const co2 = 44.0095 / 16.04246;
  const water = h2 * 18.01528 / 2.01588;
  // Match this example's upstream setpoints; installed capacities stay fixed.
  const target = Math.min(5, electricityKWh / (h2 * 55 + co2 * 0.5 + water / 1000 * 3.5 + 1));
  const definition = sabatier.createSabatierCase({
    co2Ppm: 422.45, seawater, electricityKWh,
    h2Requested: target * h2, dacRequested: target * co2,
    params: { electrolyzer: { secKWhPerKgH2: 55 }, swro: { feedDensityKgM3: 1025 } },
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
    seawater: { stream: JSON.parse(JSON.stringify(node('seawater').params.stream)), quality: 'literature-estimate', evidence: 'Global 35 g/kg NaCl proxy; not an Almería assay or intake permit' },
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
    solar: HOURLY ? {
      typicalMonths: HOURLY.typicalMonths,
      annualTypical: HOURLY.annualTypical,
      year: HOURLY.year,
      database: HOURLY.database,
      url: HOURLY.url,
    } : null,
    storage: { batteryKWh: 0, powerKW: 0, efficiency: 0.9, initialKWh: 0 },
    notes: 'Hourly typical-day dispatch from PVGIS 2023 seriescalc; night hours have no PV unless a battery is assumed. Intake 0.1 m³/day and 30 kWh/day heat at 100°C are assumed, not permitted supplies. No mineral assay or grid tariff verified. SWRO includes ideal polishing; CO₂ is ideal dry gas. All costs are illustrative USD assumptions, not local quotes. Annual economics repeat the selected typical day for 365 days.',
  };
  definition.operation.boundaryLimitedBy = target < 5 ? ['site solar electricity'] : [];
  return definition;
}
return { createCoastalCase, DAILY_PV };
});
