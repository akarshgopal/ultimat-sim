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

const SOLAR_EVIDENCE = Object.freeze([
  Object.freeze({
    label: 'NREL Ong et al. 2013 PV land-use (GCR / acres per MWac)',
    url: 'https://www.nrel.gov/docs/fy13osti/56290.pdf',
  }),
  Object.freeze({
    label: 'NREL SAM: ground area = module area ÷ GCR',
    url: 'https://sam.nrel.gov/images/web_page_files/sam-help-2023-10-31.pdf',
  }),
]);

// Named pad intensities. Mid of published ranges where a range is cited.
const PROCESS_INTENSITIES = Object.freeze({
  electrolyzer: Object.freeze({
    id: 'electrolyzer',
    label: PROCESS_LABELS.electrolyzer,
    // PtX Hub electrolysis plant pad 0.048–0.095 m²/kW (excl. renewables).
    basis: 'allocatedKW',
    intensity: 0.072,
    unitLabel: 'm²/kW allocated',
    range: Object.freeze([0.048, 0.095]),
    floorM2: 24,
    quality: 'cited',
    evidence: Object.freeze([
      Object.freeze({
        label: 'PtX Hub 2024 land-use briefing (electrolysis 0.048–0.095 m²/kW)',
        url: 'https://ptx-hub.org/wp-content/uploads/2024/02/International-PtX-Hub_202402_Sustainability-Briefing-3_land-use.pdf',
      }),
    ]),
  }),
  'dac-solid': Object.freeze({
    id: 'dac-solid',
    label: PROCESS_LABELS['dac-solid'],
    basis: 'tCO2PerYear',
    intensity: 1.12,
    unitLabel: 'm²/(tCO₂·y)',
    range: Object.freeze([0.1, 1.12]),
    floorM2: 36,
    quality: 'cited',
    evidence: Object.freeze([
      Object.freeze({
        label: 'NASEM 2019 / Frontiers 2025 TVSA land 1.12 m²/(t·y)',
        url: 'https://www.frontiersin.org/journals/climate/articles/10.3389/fclim.2025.1558396/full',
      }),
    ]),
  }),
  'dac-liquid': Object.freeze({
    id: 'dac-liquid',
    label: PROCESS_LABELS['dac-liquid'],
    basis: 'tCO2PerYear',
    intensity: 7.0,
    unitLabel: 'm²/(tCO₂·y)',
    range: Object.freeze([6.1, 7.0]),
    floorM2: 36,
    quality: 'cited',
    evidence: Object.freeze([
      Object.freeze({
        label: 'NASEM 2019 AGW/liquid solvent land ~6–7 m²/(t·y)',
        url: 'https://www.frontiersin.org/journals/climate/articles/10.3389/fclim.2025.1558396/full',
      }),
    ]),
  }),
  'dac-electroswing': Object.freeze({
    id: 'dac-electroswing',
    label: PROCESS_LABELS['dac-electroswing'],
    basis: 'tCO2PerYear',
    intensity: 1.12,
    unitLabel: 'm²/(tCO₂·y)',
    range: Object.freeze([1.12, 1.12]),
    floorM2: 36,
    quality: 'screening',
    evidence: Object.freeze([
      Object.freeze({
        label: 'Frontiers 2025 assumes ESA ≈ TVSA 1.12 m²/(t·y) (no ESA plant quote)',
        url: 'https://www.frontiersin.org/journals/climate/articles/10.3389/fclim.2025.1558396/full',
      }),
    ]),
  }),
  dac: Object.freeze({
    id: 'dac',
    label: PROCESS_LABELS.dac,
    basis: 'tCO2PerYear',
    intensity: 1.12,
    unitLabel: 'm²/(tCO₂·y)',
    range: Object.freeze([0.1, 1.12]),
    floorM2: 36,
    quality: 'cited',
    evidence: Object.freeze([
      Object.freeze({
        label: 'NASEM 2019 / Frontiers 2025 TVSA default 1.12 m²/(t·y)',
        url: 'https://www.frontiersin.org/journals/climate/articles/10.3389/fclim.2025.1558396/full',
      }),
    ]),
  }),
  sabatier: Object.freeze({
    id: 'sabatier',
    label: PROCESS_LABELS.sabatier,
    // Conversion pads are small vs renewables (PtX Hub); mid of compact PtG reactor yards.
    basis: 'kgPerHour',
    intensity: 4.0,
    unitLabel: 'm²/(kg CH₄/h)',
    range: Object.freeze([2.0, 8.0]),
    floorM2: 9,
    quality: 'screening',
    evidence: Object.freeze([
      Object.freeze({
        label: 'PtX Hub 2024: methanation pad ≪ RE land; mid screening 2–8 m²/(kg/h)',
        url: 'https://ptx-hub.org/wp-content/uploads/2024/02/International-PtX-Hub_202402_Sustainability-Briefing-3_land-use.pdf',
      }),
    ]),
  }),
  methanol: Object.freeze({
    id: 'methanol',
    label: PROCESS_LABELS.methanol,
    basis: 'kgPerHour',
    intensity: 0.12,
    unitLabel: 'm²/(kg MeOH/h)',
    range: Object.freeze([0.08, 0.2]),
    floorM2: 12,
    quality: 'screening',
    evidence: Object.freeze([
      Object.freeze({
        label: 'Screening methanol synthesis pad (no plant survey quote)',
        url: 'https://ptx-hub.org/wp-content/uploads/2024/02/International-PtX-Hub_202402_Sustainability-Briefing-3_land-use.pdf',
      }),
    ]),
  }),
  swro: Object.freeze({
    id: 'swro',
    label: PROCESS_LABELS.swro,
    basis: 'm3PerDay',
    intensity: 0.18,
    unitLabel: 'm²/(m³/d)',
    range: Object.freeze([0.16, 0.20]),
    floorM2: 16,
    quality: 'cited',
    evidence: Object.freeze([
      Object.freeze({
        label: 'Sorek I / literature SWRO 0.16–0.20 m²/(m³/d)',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8953854/',
      }),
    ]),
  }),
  med: Object.freeze({
    id: 'med',
    label: PROCESS_LABELS.med,
    basis: 'm3PerDay',
    intensity: 0.36,
    unitLabel: 'm²/(m³/d)',
    range: Object.freeze([0.30, 0.45]),
    floorM2: 16,
    quality: 'screening',
    evidence: Object.freeze([
      Object.freeze({
        label: '≈2× SWRO pad (thermal trains); mid of 0.30–0.45 m²/(m³/d)',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8953854/',
      }),
    ]),
  }),
  msf: Object.freeze({
    id: 'msf',
    label: PROCESS_LABELS.msf,
    basis: 'm3PerDay',
    intensity: 0.45,
    unitLabel: 'm²/(m³/d)',
    range: Object.freeze([0.35, 0.55]),
    floorM2: 16,
    quality: 'screening',
    evidence: Object.freeze([
      Object.freeze({
        label: 'MSF larger than SWRO; screening mid 0.45 m²/(m³/d)',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8953854/',
      }),
    ]),
  }),
  desal: Object.freeze({
    id: 'desal',
    label: PROCESS_LABELS.desal,
    basis: 'm3PerDay',
    intensity: 0.18,
    unitLabel: 'm²/(m³/d)',
    range: Object.freeze([0.16, 0.20]),
    floorM2: 16,
    quality: 'cited',
    evidence: Object.freeze([
      Object.freeze({
        label: 'Default desal = SWRO 0.16–0.20 m²/(m³/d)',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8953854/',
      }),
    ]),
  }),
  'brine-minerals': Object.freeze({
    id: 'brine-minerals',
    label: PROCESS_LABELS['brine-minerals'],
    basis: 'feedTonnesPerDay',
    intensity: 2.0,
    unitLabel: 'm²/(t feed/d)',
    range: Object.freeze([1.0, 4.0]),
    floorM2: 20,
    quality: 'screening',
    evidence: Object.freeze([
      Object.freeze({
        label: 'Screening minerals pad (ponds/yards not surveyed)',
        url: 'https://ptx-hub.org/wp-content/uploads/2024/02/International-PtX-Hub_202402_Sustainability-Briefing-3_land-use.pdf',
      }),
    ]),
  }),
  asu: Object.freeze({
    id: 'asu',
    label: PROCESS_LABELS.asu,
    basis: 'tonnesPerDay',
    intensity: 10.0,
    unitLabel: 'm²/(t N₂/d)',
    range: Object.freeze([5.0, 20.0]),
    floorM2: 14,
    quality: 'screening',
    evidence: Object.freeze([
      Object.freeze({
        label: 'Industrial ASU yard screening (vendor layouts vary widely)',
        url: 'https://www.energy.gov/hgeo/articles/energy-department-invests-4m-air-separation-research-national-labs',
      }),
    ]),
  }),
  ammonia: Object.freeze({
    id: 'ammonia',
    label: PROCESS_LABELS.ammonia,
    basis: 'tonnesPerDay',
    intensity: 15.0,
    unitLabel: 'm²/(t NH₃/d)',
    range: Object.freeze([8.0, 30.0]),
    floorM2: 18,
    quality: 'screening',
    evidence: Object.freeze([
      Object.freeze({
        label: 'PtX Hub / PtX plant briefs: HB loop ≪ RE; mid screening 8–30 m²/(t/d)',
        url: 'https://ptx-hub.org/wp-content/uploads/2024/02/International-PtX-Hub_202402_Sustainability-Briefing-3_land-use.pdf',
      }),
    ]),
  }),
  battery: Object.freeze({
    id: 'battery',
    label: PROCESS_LABELS.battery,
    // ~0.02 acre/MWh ≈ 81 m²/MWh (Convergent planning rule of thumb).
    basis: 'mwh',
    intensity: 81.0,
    unitLabel: 'm²/MWh',
    range: Object.freeze([40.0, 120.0]),
    floorM2: 20,
    quality: 'cited',
    evidence: Object.freeze([
      Object.freeze({
        label: 'Convergent ~0.02 acre/MWh BESS planning rule (~81 m²/MWh)',
        url: 'https://terraprosolutions.com/battery-storage-land-requirements-what-developers-and-landowners-must-know/',
      }),
    ]),
  }),
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

function latitudeSpacingMultiplier(latitude, sensitivity) {
  const absLat = Math.abs(finiteNumber(latitude, 0));
  return clamp(1 + sensitivity * (absLat / 45 - 0.5), SPACING_MIN, SPACING_MAX);
}

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
    quality: 'cited',
    evidence: SOLAR_EVIDENCE,
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

function intensitySpec(unit) {
  return PROCESS_INTENSITIES[unit] || null;
}

function padAreaFromIntensity(spec, driver) {
  const value = Math.max(0, finiteNumber(driver));
  if (!(value > 0) || !spec) return 0;
  const area = value * finiteNumber(spec.intensity);
  const floor = Math.max(0, finiteNumber(spec.floorM2));
  return Math.max(floor, area);
}

function padElectrolyzer(node, solved) {
  const spec = intensitySpec('electrolyzer');
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  const consumed = consumedElectricityKWh(solved, node.id);
  const sec = finiteNumber(node.params?.secKWhPerKgH2, 52);
  const dailyKWh = Number.isFinite(consumed) && consumed > 0 ? consumed : activity * sec;
  const allocKW = dailyKWh / 24;
  return padAreaFromIntensity(spec, allocKW);
}

function padDac(node, solved, periodDays) {
  const unitKey = PROCESS_INTENSITIES[node.unit] ? node.unit : 'dac';
  const spec = intensitySpec(unitKey);
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  const co2AnnualTons = activity * periodDays / 1000;
  return padAreaFromIntensity(spec, co2AnnualTons);
}

function padSabatier(node, solved) {
  const spec = intensitySpec('sabatier');
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  return padAreaFromIntensity(spec, activity / 24);
}

function padMethanol(node, solved) {
  const spec = intensitySpec('methanol');
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  return padAreaFromIntensity(spec, activity / 24);
}

function padDesal(node, solved) {
  const unitKey = PROCESS_INTENSITIES[node.unit] ? node.unit : 'swro';
  const spec = intensitySpec(unitKey);
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  return padAreaFromIntensity(spec, activity);
}

function padBrine(node, solved) {
  const spec = intensitySpec('brine-minerals');
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  return padAreaFromIntensity(spec, activity / 1000);
}

function padAsu(node, solved) {
  const spec = intensitySpec('asu');
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  return padAreaFromIntensity(spec, activity / 1000);
}

function padAmmonia(node, solved) {
  const spec = intensitySpec('ammonia');
  const activity = activityOf(solved, node.id);
  if (!(activity > 0)) return 0;
  return padAreaFromIntensity(spec, activity / 1000);
}

function padBatteryKWh(batteryKWh) {
  const spec = intensitySpec('battery');
  const kWh = Math.max(0, finiteNumber(batteryKWh));
  if (!(kWh > 0)) return 0;
  return padAreaFromIntensity(spec, kWh / 1000);
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

function processRecord(node, areaM2) {
  const spec = intensitySpec(node.unit) || intensitySpec(
    node.unit?.startsWith?.('dac') ? 'dac' : node.unit
  );
  return {
    id: node.id,
    label: node.label || spec?.label || PROCESS_LABELS[node.unit] || node.unit,
    unit: node.unit,
    areaM2,
    quality: spec?.quality || 'screening',
    evidence: spec?.evidence || [],
    intensity: spec
      ? {
          value: spec.intensity,
          unitLabel: spec.unitLabel,
          range: spec.range ? [...spec.range] : undefined,
          basis: spec.basis,
        }
      : undefined,
  };
}

function processPads({ graph, solved, site, params = {} } = {}) {
  const periodDays = Math.max(1, finiteNumber(params.periodDays, 365));
  const processes = [];
  for (const node of graph?.nodes || []) {
    const areaFn = PROCESS_PADS[node.unit];
    if (!areaFn) continue;
    const areaM2 = areaFn(node, solved, periodDays);
    if (!(areaM2 > 0)) continue;
    processes.push(processRecord(node, areaM2));
  }

  const siteBatteryKWh = finiteNumber(site?.storage?.batteryKWh);
  if (siteBatteryKWh > 0) {
    const areaM2 = padBatteryKWh(siteBatteryKWh);
    if (areaM2 > 0) {
      const spec = intensitySpec('battery');
      processes.push({
        id: 'site-battery',
        label: PROCESS_LABELS.battery,
        unit: 'battery',
        areaM2,
        quality: spec.quality,
        evidence: spec.evidence,
        intensity: {
          value: spec.intensity,
          unitLabel: spec.unitLabel,
          range: [...spec.range],
          basis: spec.basis,
        },
      });
    }
  } else {
    for (const node of graph?.nodes || []) {
      if (node.unit !== 'battery') continue;
      const activity = activityOf(solved, node.id);
      const areaM2 = padBatteryKWh(activity);
      if (!(areaM2 > 0)) continue;
      processes.push(processRecord({ ...node, unit: 'battery' }, areaM2));
    }
  }

  processes.sort((left, right) => right.areaM2 - left.areaM2 || String(left.id).localeCompare(String(right.id)));
  return processes;
}

function solarAssumptions(solar, opts) {
  const mounting = mountingSpec(solar.mounting);
  const model = opts.gcrModel || 'latitude';
  const assumptions = [
    `Panel efficiency ${solar.panelEfficiency}% (screening default unless overridden).`,
    `${mounting.label} base GCR ${solar.baseGcr}; land = panel area / GCR (NREL SAM / Ong et al.).`,
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

function intensityAssumptionLine(spec) {
  if (!spec) return '';
  const range = spec.range ? ` (range ${spec.range[0]}–${spec.range[1]})` : '';
  return `${spec.label}: ${spec.intensity} ${spec.unitLabel}${range}, quality=${spec.quality}.`;
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
    'Process pads use cited or screening intensities × solved activity — not surveyed equipment layouts.',
  ];
  const usedUnits = [...new Set(processes.map(item => item.unit))];
  for (const unit of usedUnits) {
    const line = intensityAssumptionLine(intensitySpec(unit));
    if (line) assumptions.push(line);
  }
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
  PROCESS_INTENSITIES,
  SOLAR_EVIDENCE,
  clamp,
  winterNoonElevationDeg,
  layoutSpacingMultiplier,
  groundCoverageRatio,
  estimateSolar,
  estimateSolarLandHa,
  pvLandHa,
  processPads,
  estimateFootprint,
  intensitySpec,
};
});
