(function exposeFootprint(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetFootprint = api;
})(globalThis, () => {
const SQM_PER_ACRE = 4046.8564224;
const SQM_PER_HA = 10000;
const DEFAULT_PANEL_EFFICIENCY = 20;
const GCR_MIN = 0.05;
const GCR_MAX = 0.95;
const SPACING_MIN = 0.82;
const SPACING_MAX = 1.35;
const REFERENCE_LATITUDE = 22.5;
const WINTER_NOON_REFERENCE = {
  latitude: 35.05,
  winterNoonElevationDeg: 31.51,
};
const AXIAL_OBLIQUITY_DEG = 23.44;

const MOUNTING = Object.freeze({
  fixed: {
    id: 'fixed',
    label: 'fixed tilt',
    baseGcr: 0.45,
    spacingLatitudeSensitivity: 0.45,
  },
  ew: {
    id: 'ew',
    label: 'east-west',
    baseGcr: 0.75,
    spacingLatitudeSensitivity: 0.18,
  },
  single: {
    id: 'single',
    label: 'single-axis tracker',
    baseGcr: 0.30,
    spacingLatitudeSensitivity: 0.60,
  },
  dual: {
    id: 'dual',
    label: 'dual-axis tracker',
    baseGcr: 0.22,
    spacingLatitudeSensitivity: 0.55,
  },
});

const PROCESS_LABELS = Object.freeze({
  electrolyzer: 'Electrolyzer',
  dac: 'DAC',
  'dac-solid': 'Solid-sorbent DAC',
  'dac-liquid': 'Liquid-solvent DAC',
  'dac-electroswing': 'Electro-swing DAC',
  battery: 'Battery yard',
  sabatier: 'Methane plant',
  methanol: 'Methanol plant',
  swro: 'SWRO',
  med: 'MED',
  msf: 'MSF',
  desal: 'Desalination',
  'brine-minerals': 'Brine minerals',
  asu: 'Air separation',
  ammonia: 'Haber–Bosch',
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mountingSpec(key) {
  return MOUNTING[key] || MOUNTING.fixed;
}

function resolveMounting(opts = {}) {
  const key = opts.mounting || opts.mountingType || 'fixed';
  return mountingSpec(key);
}

function winterNoonElevationDeg(latitude) {
  const lat = finiteNumber(latitude, 0);
  const winterDeclination = lat >= 0 ? -AXIAL_OBLIQUITY_DEG : AXIAL_OBLIQUITY_DEG;
  return Math.max(6, 90 - Math.abs(lat - winterDeclination));
}

// Linear latitude model from the Foundry footprint spec:
// layoutSpacingMultiplier = clamp(1 + k * (|lat|/45 − 0.5), 0.82, 1.35)
// with k = 0.45 for fixed tilt (mounting-specific k otherwise).
function latitudeSpacingMultiplier(latitude, sensitivity) {
  const absLat = Math.abs(finiteNumber(latitude, 0));
  return clamp(1 + sensitivity * (absLat / 45 - 0.5), SPACING_MIN, SPACING_MAX);
}

// Archived TEA winter-noon heuristic: row pitch scales with
// (reference winter elevation / local winter elevation) ^ sensitivity.
function winterNoonSpacingMultiplier(latitude, sensitivity) {
  const elevation = winterNoonElevationDeg(latitude);
  const sunAngleRatio = WINTER_NOON_REFERENCE.winterNoonElevationDeg / Math.max(elevation, 6);
  return clamp(sunAngleRatio ** sensitivity, SPACING_MIN, SPACING_MAX);
}

function layoutSpacingMultiplier(latitude, opts = {}) {
  if (!Number.isFinite(Number(latitude))) return 1;
  const mounting = resolveMounting(opts);
  const sensitivity = finiteNumber(
    opts.spacingLatitudeSensitivity,
    mounting.spacingLatitudeSensitivity
  );
  const model = opts.gcrModel || 'latitude';
  if (model === 'winter-noon') return winterNoonSpacingMultiplier(latitude, sensitivity);
  return latitudeSpacingMultiplier(latitude, sensitivity);
}

function groundCoverageRatio(opts = {}) {
  const mounting = resolveMounting(opts);
  const baseGcr = clamp(
    finiteNumber(opts.baseGcr, mounting.baseGcr),
    GCR_MIN,
    GCR_MAX
  );
  const multiplier = layoutSpacingMultiplier(opts.latitude, {
    mounting: mounting.id,
    gcrModel: opts.gcrModel,
    spacingLatitudeSensitivity: opts.spacingLatitudeSensitivity,
  });
  const gcr = clamp(baseGcr / multiplier, GCR_MIN, GCR_MAX);
  return { baseGcr, gcr, layoutSpacingMultiplier: multiplier, mounting };
}

function panelAreaM2(solarKWp, panelEfficiency) {
  const kwp = Math.max(0, finiteNumber(solarKWp));
  const efficiency = Math.max(0.1, finiteNumber(panelEfficiency, DEFAULT_PANEL_EFFICIENCY));
  const systemSizeMW = kwp / 1000;
  return systemSizeMW * 1e6 / ((efficiency / 100) * 1000);
}

function estimateSolar(solarKWp, opts = {}) {
  const efficiency = Math.max(
    0.1,
    finiteNumber(opts.panelEfficiency, DEFAULT_PANEL_EFFICIENCY)
  );
  const coverage = groundCoverageRatio(opts);
  const area = panelAreaM2(solarKWp, efficiency);
  const landArea = coverage.gcr > 0 ? area / coverage.gcr : 0;
  return {
    panelAreaM2: area,
    gcr: coverage.gcr,
    baseGcr: coverage.baseGcr,
    layoutSpacingMultiplier: coverage.layoutSpacingMultiplier,
    landAreaM2: landArea,
    acres: landArea / SQM_PER_ACRE,
    ha: landArea / SQM_PER_HA,
    mounting: coverage.mounting.id,
    panelEfficiency: efficiency,
  };
}

function estimateSolarLandHa(solarKWp, opts = {}) {
  return estimateSolar(solarKWp, opts).ha;
}

function pvLandHa(solarKWp, opts = {}) {
  return estimateSolarLandHa(solarKWp, opts);
}

function activityOf(solved, id) {
  return Math.max(0, finiteNumber(solved?.nodes?.[id]?.activity));
}

function consumedElectricityKWh(solved, id) {
  return finiteNumber(solved?.nodes?.[id]?.consumed?.electricity?.kWh, NaN);
}

function installedSolarKWp(site, graph) {
  const fromSite = finiteNumber(site?.solarKWp);
  if (fromSite > 0) return fromSite;
  return (graph?.nodes || [])
    .filter(node => node.unit === 'solar-pv')
    .reduce((sum, node) => sum + Math.max(0, finiteNumber(node.params?.capacityKW)), 0);
}

function padElectrolyzer(node, solved) {
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  const consumed = consumedElectricityKWh(solved, node.id);
  const sec = finiteNumber(node.params?.secKWhPerKgH2, 50);
  const dailyKWh = Number.isFinite(consumed) && consumed > 0 ? consumed : activity * sec;
  const allocKW = dailyKWh / 24;
  return Math.max(24, allocKW * 0.03);
}

function padDac(node, solved, periodDays) {
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  const co2AnnualTons = activity * periodDays / 1000;
  return Math.max(36, co2AnnualTons * 0.35);
}

function padSabatier(node, solved) {
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  const designHourlyRate = activity / 24;
  return Math.max(9, designHourlyRate * 4);
}

function padMethanol(node, solved) {
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  const hourlyKg = activity / 24;
  return Math.max(12, hourlyKg * 0.12);
}

function padDesal(node, solved) {
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  return Math.max(16, activity * 0.8);
}

function padBrine(node, solved) {
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  const feedTPerDay = activity / 1000;
  return Math.max(20, feedTPerDay * 2);
}

function padAsu(node, solved) {
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  return Math.max(14, (activity / 1000) * 8);
}

function padAmmonia(node, solved) {
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  return Math.max(18, (activity / 1000) * 12);
}

function padBatteryKWh(batteryKWh) {
  const kWh = Math.max(0, finiteNumber(batteryKWh));
  if (!(kWh > 0)) return 0;
  return Math.max(20, (kWh / 1000) * 6);
}

const PROCESS_PADS = Object.freeze({
  electrolyzer: padElectrolyzer,
  dac: padDac,
  'dac-solid': padDac,
  'dac-liquid': padDac,
  'dac-electroswing': padDac,
  sabatier: padSabatier,
  methanol: padMethanol,
  swro: padDesal,
  med: padDesal,
  msf: padDesal,
  desal: padDesal,
  'brine-minerals': padBrine,
  asu: padAsu,
  ammonia: padAmmonia,
});

function processPads({ graph, solved, site, params = {} } = {}) {
  const periodDays = Math.max(1, finiteNumber(params.periodDays, 365));
  const processes = [];
  for (const node of graph?.nodes || []) {
    const areaFn = PROCESS_PADS[node.unit];
    if (!areaFn) continue;
    const areaM2 = areaFn(node, solved, periodDays);
    if (!(areaM2 > 0)) continue;
    processes.push({
      id: node.id,
      label: node.label || PROCESS_LABELS[node.unit] || node.unit,
      unit: node.unit,
      areaM2,
    });
  }

  const siteBatteryKWh = finiteNumber(site?.storage?.batteryKWh);
  if (siteBatteryKWh > 0) {
    const areaM2 = padBatteryKWh(siteBatteryKWh);
    if (areaM2 > 0) {
      processes.push({
        id: 'site-battery',
        label: PROCESS_LABELS.battery,
        unit: 'battery',
        areaM2,
      });
    }
  } else {
    for (const node of graph?.nodes || []) {
      if (node.unit !== 'battery') continue;
      const activity = activityOf(solved, node.id);
      const areaM2 = padBatteryKWh(activity);
      if (!(areaM2 > 0)) continue;
      processes.push({
        id: node.id,
        label: node.label || PROCESS_LABELS.battery,
        unit: 'battery',
        areaM2,
      });
    }
  }

  processes.sort((left, right) => right.areaM2 - left.areaM2);
  return processes;
}

function solarAssumptions(solar, opts) {
  const mounting = mountingSpec(solar.mounting);
  const model = opts.gcrModel || 'latitude';
  const assumptions = [
    `Panel efficiency ${solar.panelEfficiency}% (screening default unless overridden).`,
    `${mounting.label} base GCR ${solar.baseGcr}; land = panel area / GCR.`,
    'Panel area m² = (kWp / 1000) × 1e6 / ((η / 100) × 1000).',
  ];
  if (model === 'winter-noon') {
    assumptions.push(
      'Location-aware GCR uses winter-noon elevation: elevation = max(6, 90 − |lat − winter declination ±23.44°|); '
      + `spacing = clamp((${WINTER_NOON_REFERENCE.winterNoonElevationDeg} / elevation)^k, ${SPACING_MIN}, ${SPACING_MAX}); `
      + `GCR = clamp(baseGCR / spacing, ${GCR_MIN}, ${GCR_MAX}).`
    );
  } else {
    assumptions.push(
      `Location-aware GCR: layoutSpacingMultiplier = clamp(1 + k × (|lat| / 45 − 0.5), ${SPACING_MIN}, ${SPACING_MAX}) `
      + `with k = ${mounting.spacingLatitudeSensitivity} for ${mounting.label}; `
      + `GCR = clamp(baseGCR / multiplier, ${GCR_MIN}, ${GCR_MAX}).`
    );
  }
  if (!Number.isFinite(Number(opts.latitude))) {
    assumptions.push('No site latitude: spacing multiplier = 1 (unadjusted base GCR).');
  }
  return assumptions;
}

function estimateFootprint({ site, graph, solved, params = {} } = {}) {
  const options = {
    ...site?.footprint,
    ...params,
    latitude: params.latitude ?? site?.latitude,
    longitude: params.longitude ?? site?.longitude,
    panelEfficiency: params.panelEfficiency ?? site?.footprint?.panelEfficiency,
    mounting: params.mounting ?? site?.footprint?.mounting ?? params.mountingType,
    baseGcr: params.baseGcr ?? site?.footprint?.baseGcr,
    gcrModel: params.gcrModel ?? site?.footprint?.gcrModel,
    periodDays: params.periodDays ?? site?.footprint?.periodDays,
  };
  const solarKWp = installedSolarKWp(site, graph);
  const solar = estimateSolar(solarKWp, options);
  const processes = processPads({ graph, solved, site, params: options });
  const processAreaM2 = processes.reduce((sum, item) => sum + item.areaM2, 0);
  const totalAreaM2 = solar.landAreaM2 + processAreaM2;
  const assumptions = [
    ...solarAssumptions(solar, options),
    'Process pads are order-of-magnitude screening areas from solved activity, not surveyed equipment layouts.',
  ];
  if (processes.length) {
    assumptions.push(
      `Active process pads: ${processes.map(item => `${item.label} ${Math.round(item.areaM2)} m²`).join('; ')}.`
    );
  }
  return {
    solar,
    processes,
    processAreaM2,
    totalAreaM2,
    totalAcres: totalAreaM2 / SQM_PER_ACRE,
    totalHa: totalAreaM2 / SQM_PER_HA,
    assumptions,
  };
}

return {
  SQM_PER_ACRE,
  SQM_PER_HA,
  DEFAULT_PANEL_EFFICIENCY,
  GCR_MIN,
  GCR_MAX,
  SPACING_MIN,
  SPACING_MAX,
  REFERENCE_LATITUDE,
  MOUNTING,
  PROCESS_LABELS,
  clamp,
  winterNoonElevationDeg,
  layoutSpacingMultiplier,
  groundCoverageRatio,
  estimateSolar,
  estimateSolarLandHa,
  pvLandHa,
  estimateFootprint,
};
});
