(() => {
  const canvas = document.getElementById('flowsheetCanvas');
  const inspector = document.querySelector('.inspector-sidebar');
  const units = FlowsheetUnits.UNITS;
  const graph = { nodes: [], edges: [] };
  const setpoints = {};
  const projectEconomics = { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 };
  const counts = {};
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const AUTOSAVE_KEY = 'molecular-foundry.autosave.v1';
  const SAVES_KEY = 'molecular-foundry.saves.v1';
  const NETWORK_KEY = 'molecular-foundry.network.v1';
  const LEGACY_EMPIRE_KEY = 'molecular-foundry.empire.v1';
  const NODE_WIDTH = 220;
  const COLUMN_GAP = 120;
  let selectedNodeId = null;
  let pendingPort = null;
  let result = null;
  let currentEconomics = null;
  let baseline = null;
  let canvasZoom = 1;
  let site = null;
  let network = { plants: [], corridors: [] };
  let networkResult = null;
  let solveError = '';
  let routeNote = '';
  let dragging = null;
  let suppressClick = false;
  let canvasFocused = false;

  const catalog = {
    swro: {
      label: 'SWRO', capacity: 100, rate: 40, activityUnit: 'm³ water/day',
      palette: { section: 'building', order: 1, glyph: 'RO', tone: 'water', description: 'Seawater → fresh water' },
      params: { recovery: 0.45, secKWhPerM3: 3.5, feedDensityKgM3: 1025, productDensityKgM3: 1000, ionRejection: 0.99 },
      presets: {
        modern: { label: 'Modern SWRO', params: { recovery: 0.45, secKWhPerM3: 3.5, ionRejection: 0.99 } },
        highRecovery: { label: 'High-recovery SWRO', params: { recovery: 0.55, secKWhPerM3: 4.5, ionRejection: 0.99 } },
      },
      controls: [
        { key: 'recovery', label: 'Water recovery', min: 0.2, max: 0.6, step: 0.01 },
        { key: 'secKWhPerM3', label: 'Electricity', min: 2, max: 8, step: 0.1, unit: 'kWh/m³' },
        { key: 'ionRejection', label: 'Ion rejection', min: 0.95, max: 1, step: 0.001 },
      ],
      references: [{ label: 'Elimelech & Phillip 2011', url: 'https://doi.org/10.1126/science.1200488' }],
    },
    med: {
      label: 'MED', capacity: 100, rate: 40, activityUnit: 'm³ water/day',
      palette: { section: 'building', order: 2, glyph: 'MED', tone: 'water', title: 'Multi-effect distillation', description: 'Low-grade heat + seawater → water' },
      params: { recovery: 0.35, electricityKWhPerM3: 2, heatKWhPerM3: 60, minHeatT_C: 70, ionRejection: 0.995, feedDensityKgM3: 1025, productDensityKgM3: 1000, wasteHeatT_C: 40 },
      controls: [
        { key: 'recovery', label: 'Water recovery', min: 0.2, max: 0.5, step: 0.01 },
        { key: 'electricityKWhPerM3', label: 'Electricity', min: 0.5, max: 5, step: 0.1, unit: 'kWh/m³' },
        { key: 'heatKWhPerM3', label: 'Thermal duty', min: 35, max: 100, step: 1, unit: 'kWhₜₕ/m³' },
        { key: 'minHeatT_C', label: 'Minimum heat', min: 50, max: 100, step: 1, unit: '°C' },
        { key: 'wasteHeatT_C', label: 'Reject heat temperature', min: 20, max: 80, step: 1, unit: '°C' },
      ],
      references: [{ label: 'Ghaffour et al. 2013', url: 'https://doi.org/10.1016/j.apenergy.2012.12.073' }],
    },
    msf: {
      label: 'MSF', capacity: 100, rate: 40, activityUnit: 'm³ water/day',
      palette: { section: 'building', order: 3, glyph: 'MSF', tone: 'water', title: 'Multi-stage flash', description: 'Steam + seawater → water' },
      params: { recovery: 0.25, electricityKWhPerM3: 3.5, heatKWhPerM3: 80, minHeatT_C: 90, ionRejection: 0.995, feedDensityKgM3: 1025, productDensityKgM3: 1000, wasteHeatT_C: 45 },
      controls: [
        { key: 'recovery', label: 'Water recovery', min: 0.15, max: 0.4, step: 0.01 },
        { key: 'electricityKWhPerM3', label: 'Electricity', min: 1, max: 7, step: 0.1, unit: 'kWh/m³' },
        { key: 'heatKWhPerM3', label: 'Thermal duty', min: 55, max: 130, step: 1, unit: 'kWhₜₕ/m³' },
        { key: 'minHeatT_C', label: 'Minimum heat', min: 75, max: 130, step: 1, unit: '°C' },
        { key: 'wasteHeatT_C', label: 'Reject heat temperature', min: 20, max: 100, step: 1, unit: '°C' },
      ],
      references: [{ label: 'Ghaffour et al. 2013', url: 'https://doi.org/10.1016/j.apenergy.2012.12.073' }],
    },
    electrolyzer: {
      label: 'Electrolyzer', capacity: 100, rate: 10, activityUnit: 'kg H₂/day', params: { secKWhPerKgH2: 52 },
      palette: { section: 'building', order: 4, glyph: 'H₂', tone: 'hydrogen', description: 'Water + power → H₂' },
      presets: {
        alkaline: { label: 'Alkaline', params: { secKWhPerKgH2: 52 } },
        pem: { label: 'PEM', params: { secKWhPerKgH2: 55 } },
      },
      controls: [{ key: 'secKWhPerKgH2', label: 'Electricity', min: 39, max: 80, step: 0.5, unit: 'kWh/kg H₂' }],
      references: [{ label: 'Buttler & Spliethoff 2018', url: 'https://doi.org/10.1016/j.rser.2017.09.003' }],
    },
    dac: {
      label: 'DAC', capacity: 100, rate: 10, activityUnit: 'kg CO₂/day',
      params: { captureFraction: 0.9, electricityKWhPerKgCO2: 0.5, heatKWhPerKgCO2: 1.5, minHeatT_C: 80, consumablesPerKgCO2: 0.02, wasteHeatT_C: 40 },
      controls: [
        { key: 'captureFraction', label: 'Single-pass capture', min: 0.1, max: 0.95, step: 0.01 },
        { key: 'electricityKWhPerKgCO2', label: 'Electricity', min: 0.05, max: 1.5, step: 0.01, unit: 'kWh/kg CO₂' },
        { key: 'heatKWhPerKgCO2', label: 'Thermal duty', min: 0, max: 3.5, step: 0.05, unit: 'kWhₜₕ/kg CO₂' },
        { key: 'minHeatT_C', label: 'Minimum heat', min: 20, max: 1000, step: 5, unit: '°C' },
        { key: 'consumablesPerKgCO2', label: 'Consumables', min: 0, max: 0.1, step: 0.001, unit: 'kg/kg CO₂' },
        { key: 'wasteHeatT_C', label: 'Reject heat temperature', min: 20, max: 300, step: 5, unit: '°C' },
      ],
      references: [
        { label: 'Keith et al. 2018', url: 'https://doi.org/10.1016/j.joule.2018.05.006' },
        { label: 'IEA DAC 2022', url: 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary' },
      ],
    },
    'dac-solid': {
      label: 'Solid-sorbent DAC', capacity: 100, rate: 10, activityUnit: 'kg CO₂/day', chemicalId: 'amine-sorbent',
      palette: { section: 'building', order: 5, glyph: 'CO₂', tone: 'carbon', description: 'Air + heat + amine makeup → CO₂' },
      params: { captureFraction: 0.9, electricityKWhPerKgCO2: 0.5, heatKWhPerKgCO2: 1.5, minHeatT_C: 80, consumablesPerKgCO2: 0.02, wasteHeatT_C: 40 },
      controls: [
        { key: 'captureFraction', label: 'Single-pass capture', min: 0.1, max: 0.95, step: 0.01 },
        { key: 'electricityKWhPerKgCO2', label: 'Electricity', min: 0.05, max: 1.5, step: 0.01, unit: 'kWh/kg CO₂' },
        { key: 'heatKWhPerKgCO2', label: 'Thermal duty', min: 0, max: 3.5, step: 0.05, unit: 'kWhₜₕ/kg CO₂' },
        { key: 'minHeatT_C', label: 'Minimum heat', min: 20, max: 1000, step: 5, unit: '°C' },
        { key: 'consumablesPerKgCO2', label: 'Amine makeup', min: 0, max: 0.1, step: 0.001, unit: 'kg/kg CO₂' },
        { key: 'wasteHeatT_C', label: 'Reject heat temperature', min: 20, max: 300, step: 5, unit: '°C' },
      ],
      references: [
        { label: 'IEA DAC 2022', url: 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary' },
        { label: 'Keith et al. 2018', url: 'https://doi.org/10.1016/j.joule.2018.05.006' },
      ],
    },
    'dac-liquid': {
      label: 'Liquid-solvent DAC', capacity: 100, rate: 10, activityUnit: 'kg CO₂/day', chemicalId: 'potassium-hydroxide',
      palette: { section: 'building', order: 5.2, glyph: 'KOH', tone: 'carbon', description: 'Air + 900°C heat + KOH makeup → CO₂' },
      params: { captureFraction: 0.75, electricityKWhPerKgCO2: 0.366, heatKWhPerKgCO2: 2.45, minHeatT_C: 900, consumablesPerKgCO2: 0.01, wasteHeatT_C: 100 },
      controls: [
        { key: 'captureFraction', label: 'Single-pass capture', min: 0.1, max: 0.95, step: 0.01 },
        { key: 'electricityKWhPerKgCO2', label: 'Electricity', min: 0.05, max: 1.5, step: 0.01, unit: 'kWh/kg CO₂' },
        { key: 'heatKWhPerKgCO2', label: 'Thermal duty', min: 0, max: 3.5, step: 0.05, unit: 'kWhₜₕ/kg CO₂' },
        { key: 'minHeatT_C', label: 'Minimum heat', min: 20, max: 1000, step: 5, unit: '°C' },
        { key: 'consumablesPerKgCO2', label: 'KOH makeup', min: 0, max: 0.1, step: 0.001, unit: 'kg/kg CO₂' },
        { key: 'wasteHeatT_C', label: 'Reject heat temperature', min: 20, max: 300, step: 5, unit: '°C' },
      ],
      references: [{ label: 'Keith et al. 2018 Carbon Engineering process', url: 'https://doi.org/10.1016/j.joule.2018.05.006' }],
    },
    'dac-electroswing': {
      label: 'Electro-swing DAC', capacity: 100, rate: 10, activityUnit: 'kg CO₂/day', chemicalId: 'quinone-electrode',
      palette: { section: 'building', order: 5.5, glyph: 'eDAC', tone: 'carbon', description: 'Air + electricity + electrode makeup → CO₂' },
      params: { captureFraction: 0.5, electricityKWhPerKgCO2: 0.45, consumablesPerKgCO2: 0.005 },
      controls: [
        { key: 'captureFraction', label: 'Single-pass capture', min: 0.1, max: 0.95, step: 0.01 },
        { key: 'electricityKWhPerKgCO2', label: 'Electricity', min: 0.05, max: 1.5, step: 0.01, unit: 'kWh/kg CO₂' },
        { key: 'consumablesPerKgCO2', label: 'Electrode makeup', min: 0, max: 0.1, step: 0.001, unit: 'kg/kg CO₂' },
      ],
      references: [{ label: 'Voskian & Hatton 2019', url: 'https://doi.org/10.1039/C9EE02412C' }],
    },
    sabatier: { label: 'Sabatier', capacity: 100, rate: 5, activityUnit: 'kg CH₄/day', palette: { section: 'building', order: 6, glyph: 'CH₄', tone: 'methane', description: 'CO₂ + H₂ → methane' }, params: { electricityKWhPerKgCH4: 1 } },
    asu: {
      label: 'Air separation unit', capacity: 1000, rate: 100, activityUnit: 'kg N₂/day',
      palette: { section: 'building', order: 7, glyph: 'ASU', tone: 'hydrogen', description: 'Air + power → N₂ + O₂' },
      params: { nitrogenRecovery: 0.98, oxygenRecovery: 0.95, electricityKWhPerKgN2: 0.25 },
      controls: [
        { key: 'nitrogenRecovery', label: 'Nitrogen recovery', min: 0.5, max: 1, step: 0.01 },
        { key: 'oxygenRecovery', label: 'Oxygen recovery', min: 0, max: 1, step: 0.01 },
        { key: 'electricityKWhPerKgN2', label: 'Electricity', min: 0.05, max: 1, step: 0.01, unit: 'kWh/kg N₂' },
      ],
      references: [{ label: 'DOE air separation R&D', url: 'https://www.energy.gov/hgeo/articles/energy-department-invests-4m-air-separation-research-national-labs' }],
    },
    ammonia: {
      label: 'Haber–Bosch ammonia', capacity: 1000, rate: 100, activityUnit: 'kg NH₃/day',
      palette: { section: 'building', order: 8, glyph: 'NH₃', tone: 'hydrogen', description: 'N₂ + H₂ + power → ammonia' },
      params: { electricityKWhPerKg: 0.6 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Synthesis electricity', min: 0, max: 3, step: 0.05, unit: 'kWh/kg NH₃' }],
      references: [{ label: 'DOE ammonia synthesis', url: 'https://www.energy.gov/cmei/fuels/h2iq-hour-ammonia-fertilizer-energy-carriers-text-version' }],
    },
    'brine-minerals': {
      label: 'Brine mineral train', capacity: 100000, rate: 1000, activityUnit: 'kg brine/day',
      palette: { section: 'building', order: 9, glyph: 'Li+', tone: 'water', description: 'Brine → Li, Br, Mg, K, salt, gypsum' },
      params: { electricityKWhPerKgBrine: 0.05, lithiumRecovery: 0.9, bromideRecovery: 0.9, magnesiumRecovery: 0.5, potashRecovery: 0.7, gypsumRecovery: 0.7, saltRecovery: 0.5 },
      controls: [
        { key: 'electricityKWhPerKgBrine', label: 'Electricity', min: 0, max: 1, step: 0.01, unit: 'kWh/kg brine' },
        { key: 'lithiumRecovery', label: 'Lithium recovery', min: 0, max: 1, step: 0.01 },
        { key: 'bromideRecovery', label: 'Bromide recovery', min: 0, max: 1, step: 0.01 },
        { key: 'magnesiumRecovery', label: 'Magnesium recovery', min: 0, max: 1, step: 0.01 },
        { key: 'potashRecovery', label: 'Potash recovery', min: 0, max: 1, step: 0.01 },
        { key: 'gypsumRecovery', label: 'Gypsum recovery', min: 0, max: 1, step: 0.01 },
        { key: 'saltRecovery', label: 'Salt recovery', min: 0, max: 1, step: 0.01 },
      ],
      references: [{ label: 'USGS brine commodities', url: 'https://pubs.usgs.gov/bul/1738d/report.pdf' }],
    },
    'chlor-alkali': {
      label: 'Chlor-alkali', capacity: 1000, rate: 100, activityUnit: 'kg NaOH/day',
      palette: { section: 'building', order: 10, glyph: 'Cl₂', tone: 'water', description: 'Salt + water + power → NaOH + Cl₂ + H₂' },
      params: { electricityKWhPerKg: 2.5 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity', min: 0, max: 6, step: 0.05, unit: 'kWh/kg NaOH' }],
      references: [{ label: 'DOE chlor-alkali profile', url: 'https://www1.eere.energy.gov/manufacturing/resources/chemicals/pdfs/profile_chap6.pdf' }],
    },
    'bromine-recovery': {
      label: 'Bromine recovery', capacity: 1000, rate: 10, activityUnit: 'kg Br₂/day',
      palette: { section: 'building', order: 11, glyph: 'Br₂', tone: 'methane', description: 'Bromide + chlorine → bromine + salt' },
      params: { electricityKWhPerKg: 0.2 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity', min: 0, max: 3, step: 0.05, unit: 'kWh/kg Br₂' }],
      references: [{ label: 'USGS bromine production context', url: 'https://www.usgs.gov/centers/national-minerals-information-center/israel' }],
    },
    'aluminium-smelter': {
      label: 'Aluminium smelter', capacity: 1000, rate: 100, activityUnit: 'kg Al/day',
      palette: { section: 'building', order: 12, glyph: 'Al', description: 'Alumina + carbon + power → aluminium' },
      params: { electricityKWhPerKg: 14 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Smelting electricity', min: 8, max: 25, step: 0.1, unit: 'kWh/kg Al' }],
      references: [{ label: 'DOE aluminium roadmap', url: 'https://www.energy.gov/sites/prod/files/2013/11/f4/al_roadmap.pdf' }],
    },
    'hydrogen-dri': {
      label: 'Hydrogen DRI steel', capacity: 1000, rate: 100, activityUnit: 'kg Fe/day',
      palette: { section: 'building', order: 13, glyph: 'Fe', tone: 'carbon', description: 'Iron oxide + H₂ + power → iron + water' },
      params: { electricityKWhPerKg: 0.7 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Direct electricity', min: 0, max: 3, step: 0.05, unit: 'kWh/kg Fe' }],
      references: [{ label: 'DOE hydrogen for industry', url: 'https://www.energy.gov/cmei/fuels/systems-development-and-integration-chemical-and-industrial-processes' }],
    },
    'titanium-kroll': {
      label: 'Titanium Kroll', capacity: 1000, rate: 100, activityUnit: 'kg Ti/day',
      palette: { section: 'building', order: 14, glyph: 'Ti', description: 'TiCl₄ + Mg + power → Ti + MgCl₂' },
      params: { electricityKWhPerKg: 8 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Process electricity', min: 0, max: 30, step: 0.5, unit: 'kWh/kg Ti' }],
      references: [{ label: 'USGS Kroll process', url: 'https://www.usgs.gov/publications/titanium-2013' }],
    },
    'solar-pv': {
      label: 'Solar PV', sourceUnit: 'kWh/day',
      palette: { section: 'building', order: 20, glyph: 'PV', description: 'Capacity × resource → electricity' },
      params: { capacityKW: 1000, capacityFactor: 0.24, capexPerKW: 1560, fixedOMPerKWYear: 20, variableCostPerMWh: 0, discountRate: 0.07, lifeYears: 30 },
      controls: [
        { key: 'capacityKW', label: 'AC capacity', min: 10, max: 10000, step: 10, unit: 'kW' },
        { key: 'capacityFactor', label: 'Capacity factor', min: 0.05, max: 0.4, step: 0.01 },
        { key: 'capexPerKW', label: 'Installed CAPEX', min: 300, max: 3000, step: 10, unit: '$/kW' },
        { key: 'fixedOMPerKWYear', label: 'Fixed O&M', min: 0, max: 100, step: 1, unit: '$/kW-y' },
      ],
      references: [{ label: 'NREL 2024 ATB', url: 'https://atb.nrel.gov/electricity/2024/utility-scale_pv' }],
    },
    'grid-electricity': {
      label: 'Grid electricity', sourceUnit: 'kWh/day', manualRateMax: 100000,
      palette: { section: 'utility', order: 6, glyph: 'G', description: 'Import limit + tariff' },
      params: { pricePerMWh: 100, kgCO2PerMWh: 400 },
      controls: [
        { key: 'pricePerMWh', label: 'Tariff', min: -100, max: 500, step: 1, unit: '$/MWh' },
        { key: 'kgCO2PerMWh', label: 'Grid emissions', min: 0, max: 1200, step: 10, unit: 'kg CO₂/MWh' },
      ],
    },
    'nuclear-electricity': {
      label: 'Advanced nuclear', sourceUnit: 'kWh/day', economicsNote: 'Costs are editable assumptions, not vendor quotes.',
      palette: { section: 'building', order: 21, glyph: 'N', tone: 'carbon', description: 'Radiant, Valar, generic SMR' },
      params: { capacityKW: 1000, capacityFactor: 0.9, capexPerKW: 10717, fixedOMPerKWYear: 300, variableCostPerMWh: 15, discountRate: 0.07, lifeYears: 30 },
      presets: {
        radiant: { label: 'Radiant Kaleidos · 1 MWe', params: { capacityKW: 1000, capacityFactor: 0.9, capexPerKW: 10717 } },
        valar: { label: 'Valar industrial HTGR · 30 MW assumption', params: { capacityKW: 30000, capacityFactor: 0.9, capexPerKW: 10717 } },
        smr: { label: 'Generic nth-of-a-kind SMR', params: { capacityKW: 300000, capacityFactor: 0.9, capexPerKW: 5882 } },
      },
      controls: [
        { key: 'capacityKW', label: 'Net capacity', min: 100, max: 500000, step: 100, unit: 'kW' },
        { key: 'capacityFactor', label: 'Capacity factor', min: 0.4, max: 1, step: 0.01 },
        { key: 'capexPerKW', label: 'Overnight CAPEX', min: 1000, max: 50000, step: 100, unit: '$/kW' },
        { key: 'fixedOMPerKWYear', label: 'Fixed O&M', min: 0, max: 1000, step: 10, unit: '$/kW-y' },
        { key: 'variableCostPerMWh', label: 'Fuel + variable O&M', min: 0, max: 200, step: 1, unit: '$/MWh' },
      ],
      references: [
        { label: 'NRC: Kaleidos', url: 'https://www.nrc.gov/reactors/new-reactors/advanced/who-were-working-with/pre-application-activities/kaleidos' },
        { label: 'Valar: industrial model', url: 'https://www.valaratomics.com/' },
        { label: 'DOE advanced nuclear costs', url: 'https://www.energy.gov/ne/downloads/small-modular-reactors-key-future-nuclear-power-generation-us' },
      ],
    },
    battery: {
      label: 'Battery', capacity: 4000, rate: 1000, activityUnit: 'kWh/day',
      palette: { section: 'building', order: 22, glyph: 'B', description: 'Electricity in → shifted electricity' },
      params: { efficiency: 0.95, capexPerKWh: 400 },
      controls: [
        { key: 'efficiency', label: 'One-way efficiency', min: 0.7, max: 1, step: 0.01 },
        { key: 'capexPerKWh', label: 'Installed CAPEX', min: 50, max: 1000, step: 10, unit: '$/kWh' },
      ],
      references: [{ label: 'NREL 2024 ATB', url: 'https://atb.nrel.gov/electricity/2024/2023/utility-scale_battery_storage' }],
    },
    'solar-thermal': {
      label: 'Solar thermal', sourceUnit: 'kWhₜₕ/day',
      palette: { section: 'building', order: 23, glyph: 'ST', tone: 'carbon', description: 'Sun → temperature-graded heat' },
      params: { capacityKW: 1000, sunHours: 6, temperatureC: 150, capexPerKW: 1000, fixedOMPerKWYear: 20, variableCostPerMWh: 0, discountRate: 0.07, lifeYears: 25 },
      controls: [
        { key: 'capacityKW', label: 'Thermal capacity', min: 10, max: 10000, step: 10, unit: 'kWₜₕ' },
        { key: 'sunHours', label: 'Equivalent sun', min: 1, max: 12, step: 0.1, unit: 'h/day' },
        { key: 'temperatureC', label: 'Delivery temperature', min: 40, max: 1000, step: 5, unit: '°C' },
        { key: 'capexPerKW', label: 'Installed CAPEX', min: 100, max: 5000, step: 25, unit: '$/kWₜₕ' },
      ],
      references: [{ label: 'DOE solar process heat', url: 'https://www.energy.gov/cmei/systems/solar-industrial-processes' }],
    },
    'thermal-storage': {
      label: 'Thermal storage', capacity: 10000, rate: 1000, activityUnit: 'kWhₜₕ/day',
      palette: { section: 'building', order: 24, glyph: 'TS', tone: 'carbon', description: 'Heat in → shifted process heat' },
      params: { efficiency: 0.95, temperatureLossC: 5, capexPerKWh: 30 },
      controls: [
        { key: 'efficiency', label: 'Discharge efficiency', min: 0.5, max: 1, step: 0.01 },
        { key: 'temperatureLossC', label: 'Temperature loss', min: 0, max: 200, step: 1, unit: '°C' },
        { key: 'capexPerKWh', label: 'Installed CAPEX', min: 1, max: 300, step: 1, unit: '$/kWhₜₕ' },
      ],
      references: [{ label: 'DOE thermal storage', url: 'https://www.energy.gov/cmei/systems/solar-thermal-energy-storage-and-heat-transfer-media' }],
    },
    'material-source': { label: 'Material source', palette: { section: 'utility', order: 4, glyph: 'M', tone: 'water', description: 'Air, water, CO₂, H₂…' } },
    'electricity-source': { label: 'Electricity source', palette: { section: 'utility', order: 5, glyph: '⚡', description: 'Set available kWh/day' } },
    'heat-source': { label: 'Heat source', palette: { section: 'utility', order: 7, glyph: 'H', tone: 'carbon', description: 'Set energy and temperature' } },
    'consumable-source': { label: 'Consumables', palette: { section: 'utility', order: 8, glyph: 'C', tone: 'methane', description: 'Sorbent or reagent makeup' } },
    'consumable-sink': { label: 'Spent media', palette: { section: 'utility', order: 12, glyph: '↓C', tone: 'methane', description: 'Dispose spent sorbent or reagent' } },
    'electrical-bus': { label: 'Electricity bus', palette: { section: 'utility', order: 1, glyph: '⚡↗', description: 'One supply → many blocks' } },
    'material-splitter': { label: 'Material splitter', palette: { section: 'utility', order: 2, glyph: 'M↗', tone: 'water', description: 'One stream → many branches' } },
    'material-mixer': { label: 'Material mixer', palette: { section: 'utility', order: 3, glyph: '↘M', tone: 'water', description: 'Many streams → one output' } },
    'material-sink': { label: 'Material sink', palette: { section: 'utility', order: 9, glyph: '↓', description: 'Capture, store, sell, or discard' } },
    'heat-sink': { label: 'Heat sink', palette: { section: 'utility', order: 10, glyph: '↓H', tone: 'carbon', description: 'Reject or recover process heat' } },
    'electricity-sink': { label: 'Electricity sink', palette: { section: 'utility', order: 11, glyph: '↓⚡', description: 'Export or curtail electricity' } },
  };
  const portNames = {
    air: 'Feed gas', electricity: 'Electricity', heat: 'Process heat', consumables: 'Consumables',
    capturedCo2: 'Captured CO₂', depletedAir: 'Depleted gas', spentMedia: 'Spent media', feed: 'Feed water', product: 'Fresh water',
    brine: 'Brine', water: 'Water', hydrogen: 'Hydrogen', oxygen: 'Oxygen', waterReject: 'Reject water',
    co2: 'CO₂', methane: 'Methane', out: 'Output', in: 'Input',
    wasteHeat: 'Waste heat', nitrogen: 'Nitrogen', ammonia: 'Ammonia', offgas: 'Off-gas',
    lithium: 'Lithium chloride', bromide: 'Sodium bromide', magnesium: 'Magnesium chloride', potash: 'Potash', gypsum: 'Gypsum', salt: 'Salt', raffinate: 'Raffinate',
    caustic: 'Caustic soda', chlorine: 'Chlorine', bromine: 'Bromine', alumina: 'Alumina', carbon: 'Carbon', aluminium: 'Aluminium', carbonDioxide: 'Carbon dioxide',
    ironOre: 'Iron ore', steel: 'Iron / steel', titaniumTetrachloride: 'Titanium tetrachloride', titanium: 'Titanium', magnesiumChloride: 'Magnesium chloride',
  };
  const materialPresets = {
    air: { label: 'Ambient air', phase: 'gas', mol: { CO2: 428, O2: 211409, N2: 788163 } },
    seawater: { label: 'Seawater', phase: 'liquid', mol: { H2O: 53500, 'Na+': 550, 'Cl-': 550 } },
    brine: { label: 'Concentrated brine', phase: 'liquid', mol: { H2O: 53500, 'Na+': 1100, 'Cl-': 1298.1, 'Mg+2': 80, 'Ca+2': 20, 'K+': 40, 'SO4-2': 20, 'Br-': 2, 'Li+': 0.1 } },
    water: { label: 'Pure water', phase: 'liquid', mol: { H2O: 1000 } },
    co2: { label: 'Carbon dioxide', phase: 'gas', mol: { CO2: 1000 } },
    hydrogen: { label: 'Hydrogen', phase: 'gas', mol: { H2: 1000 } },
    oxygen: { label: 'Oxygen', phase: 'gas', mol: { O2: 1000 } },
    nitrogen: { label: 'Nitrogen', phase: 'gas', mol: { N2: 1000 } },
    salt: { label: 'Sodium chloride', phase: 'solid', mol: { NaCl: 1000 } },
    bromide: { label: 'Sodium bromide', phase: 'solid', mol: { NaBr: 1000 } },
    chlorine: { label: 'Chlorine', phase: 'gas', mol: { Cl2: 1000 } },
    alumina: { label: 'Alumina', phase: 'solid', mol: { Al2O3: 1000 } },
    carbon: { label: 'Carbon anode', phase: 'solid', mol: { C: 1000 } },
    ironOre: { label: 'Hematite concentrate', phase: 'solid', mol: { Fe2O3: 1000 } },
    titaniumTetrachloride: { label: 'Titanium tetrachloride', phase: 'liquid', mol: { TiCl4: 1000 } },
    magnesium: { label: 'Magnesium', phase: 'solid', mol: { Mg: 1000 } },
  };
  const DAC_ROUTES = {
    dac: 'Generic screening DAC',
    'dac-solid': 'Solid-sorbent DAC',
    'dac-liquid': 'Liquid-solvent DAC',
    'dac-electroswing': 'Electro-swing DAC',
  };
  const CONSUMABLE_CHEMICALS = {
    'amine-sorbent': 'Amine sorbent makeup',
    'potassium-hydroxide': 'KOH solvent makeup',
    'quinone-electrode': 'Quinone electrode makeup',
  };
  const SITE_MONTHS = ['Annual average', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function renderPalettes() {
    for (const [id, section] of [['buildingPalette', 'building'], ['utilityPalette', 'utility']]) {
      document.getElementById(id).innerHTML = Object.entries(catalog)
        .filter(([, definition]) => definition.palette?.section === section)
        .sort(([, left], [, right]) => left.palette.order - right.palette.order)
        .map(([unit, definition]) => {
          const { glyph, tone, title, description } = definition.palette;
          return `<button type="button" class="building-card" data-unit="${unit}"><span class="building-glyph${tone ? ` ${tone}` : ''}">${glyph}</span><span><strong>${title || definition.label}</strong><small>${description}</small></span><b>Add</b></button>`;
        }).join('');
    }
  }

  renderPalettes();
  document.getElementById('buildingPalette').addEventListener('click', addFromPalette);
  document.getElementById('utilityPalette').addEventListener('click', addFromPalette);
  document.getElementById('clearFactory').addEventListener('click', clearFactory);
  document.getElementById('autoArrange').addEventListener('click', autoArrange);
  document.getElementById('focusCanvas').addEventListener('click', toggleCanvasFocus);
  document.getElementById('zoomOut').addEventListener('click', () => setCanvasZoom(canvasZoom - 0.1));
  document.getElementById('zoomIn').addEventListener('click', () => setCanvasZoom(canvasZoom + 0.1));
  document.getElementById('zoomReset').addEventListener('click', () => setCanvasZoom(1));
  document.getElementById('canvasZoom').addEventListener('input', event => setCanvasZoom(Number(event.target.value) / 100));
  document.getElementById('captureBaseline').addEventListener('click', captureBaseline);
  document.getElementById('clearBaseline').addEventListener('click', clearBaseline);
  document.getElementById('projectLifeYears').addEventListener('input', handleProjectEconomics);
  document.getElementById('discountRate').addEventListener('input', handleProjectEconomics);
  document.getElementById('completeBoundaries').addEventListener('click', completeBoundaries);
  document.getElementById('loadMethaneRecycle').addEventListener('click', loadMethaneRecycle);
  document.getElementById('loadCoastalMethane').addEventListener('click', () => loadCoastalMethane(0));
  document.getElementById('loadAbundanceHub').addEventListener('click', loadAbundanceHub);
  document.getElementById('loadDemoNetwork').addEventListener('click', loadDemoNetwork);
  document.getElementById('addPlantToNetwork').addEventListener('click', () => {
    const name = window.prompt('Name this plant in the network:')?.trim();
    if (name) addCurrentPlant(name);
  });
  document.getElementById('clearNetwork').addEventListener('click', clearNetwork);
  document.getElementById('networkPlants').addEventListener('click', event => {
    const id = event.target.closest('[data-open-plant]')?.dataset.openPlant;
    if (id) openNetworkPlant(id);
  });
  document.getElementById('siteMonth').addEventListener('change', event => {
    if (!site) return;
    site.month = Number(event.target.value);
    refreshSiteElectricity();
    solveAndRender();
  });
  document.getElementById('applyCoordinates').addEventListener('click', applyCoordinates);
  document.getElementById('siteBatteryKWh').addEventListener('change', event => {
    if (!site) return;
    const batteryKWh = Math.max(0, Number(event.target.value) || 0);
    site.storage = { ...(site.storage || {}), batteryKWh, powerKW: batteryKWh, efficiency: site.storage?.efficiency ?? 0.9 };
    solveAndRender();
  });
  document.getElementById('saveFactory').addEventListener('click', () => {
    const name = window.prompt('Name this factory save:')?.trim();
    if (name) saveNamed(name);
  });
  document.getElementById('deleteFactorySave').addEventListener('click', () => {
    const value = document.getElementById('factorySaves').value;
    if (value) deleteNamed(decodeURIComponent(value));
  });
  document.getElementById('factorySaves').addEventListener('change', event => {
    if (event.target.value) loadNamed(decodeURIComponent(event.target.value));
    else restoreSnapshot(readJson(AUTOSAVE_KEY)) && solveAndRender();
  });
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('pointerdown', startDrag);
  canvas.addEventListener('pointermove', dragNode);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
  canvas.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleCanvasClick(event);
  });
  inspector.addEventListener('input', handleInspectorInput);
  inspector.addEventListener('change', handleInspectorInput);
  inspector.addEventListener('click', handleInspectorClick);

  function addFromPalette(event) {
    const unit = event.target.closest('[data-unit]')?.dataset.unit;
    if (unit) addNode(unit);
  }

  function addNode(unit, options = {}) {
    const number = (counts[unit] || 0) + 1;
    counts[unit] = number;
    const id = `${unit}-${number}`;
    const definition = catalog[unit];
    const kind = units[unit].kind;
    const sameKindCount = graph.nodes.filter(candidate => units[candidate.unit].kind === kind).length;
    const current = {
      id, unit, label: options.label || `${definition.label} ${number}`,
      capacity: definition.capacity, params: { ...(definition.params || {}) },
      position: positionFor(kind, sameKindCount),
    };
    if (definition.presets) {
      current.processPreset = Object.keys(definition.presets)[0];
      Object.assign(current.params, definition.presets[current.processPreset].params);
    }
    if (kind === 'source') configureNewSource(current, options);
    if (kind === 'converter') setpoints[id] = definition.rate;
    current.economics = defaultEconomics(current);
    graph.nodes.push(current);
    if (!options.silent) {
      selectedNodeId = id;
      pendingPort = null;
      solveAndRender();
    }
    return current;
  }

  function configureNewSource(current, options = {}) {
    if (current.unit === 'material-source') {
      current.sourcePreset = options.preset || 'air';
      current.rate = current.sourcePreset === 'air' ? 25000 : 100;
    } else if (current.unit === 'electricity-source' || current.unit === 'grid-electricity') current.rate = 1000;
    else if (current.unit === 'heat-source') { current.rate = 100; current.temperature = 100; }
    else if (current.unit === 'solar-pv' || current.unit === 'nuclear-electricity' || current.unit === 'solar-thermal') current.rate = 0;
    else current.rate = 10;
    if (options.chemicalId) current.chemicalId = options.chemicalId;
    if (options.temperature != null) current.temperature = options.temperature;
    assignSiteResource(current);
    if (site && !current.siteResource) assumeSiteResource(current);
    updateSourceStream(current);
  }

  function assignSiteResource(current) {
    if (!site || units[current.unit].kind !== 'source') return;
    const kind = units[current.unit].ports.out.kind;
    if (current.unit === 'grid-electricity' && site.resources.grid) current.siteResource = 'grid';
    else if (current.sourcePreset && site.resources[current.sourcePreset]?.stream?.kind === kind) current.siteResource = current.sourcePreset;
    else if (kind === 'electricity' && site.resources.electricity) current.siteResource = 'electricity';
    else if (kind === 'heat' && site.resources.heat) current.siteResource = 'heat';
    else if (kind === 'consumable') {
      const match = Object.entries(site.resources).find(([, resource]) => (
        resource.stream?.kind === 'consumable' && resource.stream.chemicalId === current.chemicalId
      ));
      if (match) current.siteResource = match[0];
    }
  }

  function assumeSiteResource(current) {
    updateSourceStream(current);
    const stream = current.params.stream;
    if (!stream) return;
    const key = stream.chemicalId || `${current.unit}-assumed`;
    let id = key;
    let n = 1;
    while (site.resources[id] && site.resources[id].stream?.chemicalId !== stream.chemicalId) {
      id = `${key}-${++n}`;
    }
    if (!site.resources[id]) {
      site.resources[id] = {
        stream: clone(stream),
        quality: 'user-assumption',
        evidence: 'Explicit project assumption added to complete a process route; not a verified local supply',
      };
    }
    current.siteResource = id;
  }

  function positionFor(kind, index) {
    if (kind === 'source') return { x: 40, y: 40 + index * 150 };
    if (kind === 'sink') return { x: 1120, y: 40 + index * 150 };
    return { x: 370 + (index % 2) * 360, y: 40 + Math.floor(index / 2) * 200 };
  }

  function updateSourceStream(current) {
    const resource = site?.resources?.[current.siteResource];
    if (resource?.stream) {
      const budget = sourceAmount(resource.stream);
      current.rate = Math.min(Number(current.rate) || 0, budget);
      if (resource.stream.kind === 'material') {
        current.params.stream = FlowsheetModel.scaleStream(resource.stream, budget === 0 ? 0 : current.rate / budget);
      } else if (resource.stream.kind === 'consumable') {
        current.params.stream = { ...resource.stream, amount: current.rate };
        current.chemicalId = resource.stream.chemicalId;
      } else if (resource.stream.kind === 'heat') {
        current.temperature = resource.stream.T_C;
        current.params.stream = { ...resource.stream, kWh: current.rate };
      } else {
        current.params.stream = { ...resource.stream, kWh: current.rate };
      }
      return;
    }
    if (current.unit === 'material-source') current.params.stream = materialStream(current.sourcePreset, current.rate);
    if (current.unit === 'electricity-source') current.params.stream = { kind: 'electricity', kWh: current.rate };
    if (current.unit === 'grid-electricity') current.params.stream = { kind: 'electricity', kWh: current.rate };
    if (current.unit === 'solar-pv' || current.unit === 'nuclear-electricity') {
      current.rate = current.params.capacityKW * 24 * current.params.capacityFactor;
      current.params.stream = { kind: 'electricity', kWh: current.rate };
    }
    if (current.unit === 'heat-source') current.params.stream = { kind: 'heat', kWh: current.rate, T_C: current.temperature };
    if (current.unit === 'solar-thermal') {
      current.rate = current.params.capacityKW * current.params.sunHours;
      current.params.stream = { kind: 'heat', kWh: current.rate, T_C: current.params.temperatureC };
    }
    if (current.unit === 'consumable-source') {
      current.params.stream = {
        kind: 'consumable', amount: current.rate, unit: 'kg/day',
        label: CONSUMABLE_CHEMICALS[current.chemicalId] || 'Sorbent makeup',
        ...(current.chemicalId ? { chemicalId: current.chemicalId } : {}),
      };
    }
  }

  function sourceAmount(stream) {
    if (stream.kind === 'material') return FlowsheetModel.streamMassKg(stream);
    if (stream.kind === 'consumable') return stream.amount;
    return stream.kWh;
  }

  function materialStream(presetId, targetKg) {
    const preset = materialPresets[presetId];
    const base = { kind: 'material', mol: { ...preset.mol }, phase: preset.phase, T_C: 25, P_bar: 1 };
    const factor = targetKg / FlowsheetModel.streamMassKg(base);
    return { ...base, mol: Object.fromEntries(Object.entries(base.mol).map(([id, mol]) => [id, mol * factor])) };
  }

  function clearFactory() {
    graph.nodes.length = 0;
    graph.edges.length = 0;
    Object.keys(setpoints).forEach(key => delete setpoints[key]);
    Object.keys(counts).forEach(key => delete counts[key]);
    selectedNodeId = null;
    pendingPort = null;
    site = null;
    solveAndRender();
  }

  function loadMethaneRecycle() {
    loadCase(SabatierCase.createSabatierCase({ recycleWater: true }), 'sabatier');
  }

  function loadCoastalMethane(month = 0) {
    loadCase(CoastalCase.createCoastalCase(month), 'sabatier');
  }

  function refreshSiteElectricity() {
    if (!site?.resources?.electricity) return;
    const hours = FlowsheetSolver.hourlyProfile?.(site);
    const daily = hours ? hours.reduce((sum, value) => sum + value, 0) : Number(site.dailyPVKWhPerKWp) || 0;
    const kWh = daily * Number(site.solarKWp || 0);
    site.resources.electricity.stream = { kind: 'electricity', kWh };
    site.dailyPVKWhPerKWp = daily;
    for (const current of graph.nodes.filter(item => item.siteResource === 'electricity')) {
      current.rate = kWh;
      updateSourceStream(current);
    }
  }

  function bindLocation({ latitude, longitude, solarKWp, batteryKWh = 0, solar, name }) {
    const hours = solar?.typicalMonths?.[1] && (solar.annualTypical || Object.values(solar.typicalMonths)[0]);
    site = {
      ...(site || {}),
      id: site?.id || `site-${latitude}-${longitude}`,
      name: name || site?.name || `${Number(latitude).toFixed(3)}, ${Number(longitude).toFixed(3)}`,
      latitude, longitude, solarKWp, month: site?.month || 0, solar,
      storage: { batteryKWh, powerKW: batteryKWh, efficiency: 0.9, initialKWh: 0 },
      resources: { ...(site?.resources || {}) },
      notes: site?.notes || 'Location-bound solar from PVGIS. Other supplies stay unverified until assigned.',
    };
    if (!site.resources.grid) {
      site.resources.grid = { stream: { kind: 'electricity', kWh: 0 }, quality: 'unverified', evidence: 'Unverified grid access; zero authorized imports' };
    }
    const daily = (FlowsheetSolver.hourlyProfile?.(site) || hours || []).reduce((sum, value) => sum + value, 0);
    site.resources.electricity = {
      stream: { kind: 'electricity', kWh: daily * solarKWp },
      quality: 'literature-estimate',
      evidence: `PVGIS typical-day × ${solarKWp} kWp`,
    };
    site.dailyPVKWhPerKWp = daily;
    for (const current of graph.nodes.filter(item => units[item.unit].kind === 'source')) {
      if (!current.siteResource) assignSiteResource(current);
      if (current.siteResource === 'electricity') {
        current.rate = daily * solarKWp;
        updateSourceStream(current);
      }
    }
    solveAndRender();
    return site;
  }

  async function applyCoordinates() {
    const latitude = Number(document.getElementById('siteLatitude').value);
    const longitude = Number(document.getElementById('siteLongitude').value);
    const solarKWp = Number(document.getElementById('siteSolarKWp').value);
    const batteryKWh = Math.max(0, Number(document.getElementById('siteBatteryKWh').value) || 0);
    const status = document.getElementById('siteFetchStatus');
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90) {
      status.textContent = 'Latitude and longitude must be a real location.';
      return;
    }
    status.textContent = 'Fetching PVGIS hourly series…';
    try {
      const solar = await fetchPvgisHourly(latitude, longitude);
      bindLocation({ latitude, longitude, solarKWp, batteryKWh, solar });
      status.textContent = `Typical-day solar from ${solar.database || 'PVGIS'} ${solar.year || ''}`.trim();
    } catch (error) {
      const frozen = globalThis.PvgisAlmeriaHourly;
      if (frozen && Math.abs(latitude - 36.834) < 0.2 && Math.abs(longitude + 2.463) < 0.2) {
        bindLocation({ latitude: 36.834, longitude: -2.463, solarKWp, batteryKWh, solar: frozen, name: 'Almería coast · Spain' });
        status.textContent = 'Live PVGIS unavailable; using frozen Almería 2023 typical days.';
        return;
      }
      status.textContent = error.message;
    }
  }

  async function fetchPvgisHourly(latitude, longitude) {
    const url = `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?lat=${latitude}&lon=${longitude}&startyear=2023&endyear=2023&pvcalculation=1&peakpower=1&loss=14&angle=30&aspect=0&outputformat=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PVGIS ${response.status}`);
    const payload = await response.json();
    const rows = payload.outputs?.hourly;
    if (!rows?.length) throw new Error('PVGIS returned no hourly series for this location');
    const byMonth = Array.from({ length: 13 }, () => Array.from({ length: 24 }, () => []));
    for (const row of rows) {
      const stamp = String(row.time);
      byMonth[Number(stamp.slice(4, 6))][Number(stamp.slice(9, 11))].push(row.P / 1000);
    }
    const typicalMonths = {};
    const annualTypical = Array.from({ length: 24 }, () => 0);
    for (let month = 1; month <= 12; month += 1) {
      typicalMonths[month] = byMonth[month].map(values => (
        values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
      ));
      typicalMonths[month].forEach((value, hour) => { annualTypical[hour] += value / 12; });
    }
    return {
      typicalMonths, annualTypical, year: 2023,
      database: payload.inputs?.meteo_data?.radiation_db,
      url,
    };
  }

  function loadAbundanceHub() {
    loadCase(AbundanceCase.createAbundanceCase(), 'minerals');
  }

  function plantSnapshot(name, definition) {
    return {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
      name,
      definition: clone(definition),
    };
  }

  function addCurrentPlant(name) {
    network.plants.push(plantSnapshot(name, {
      graph: { nodes: graph.nodes, edges: graph.edges },
      operation: { setpoints },
      site,
      economics: projectEconomics,
    }));
    refreshNetwork();
    return true;
  }

  function clearNetwork() {
    network = { plants: [], corridors: [] };
    networkResult = null;
    persistNetwork();
    renderNetwork();
  }

  function loadDemoNetwork() {
    network = clone(NetworkCase.createFuelsAndMineralsNetwork(6));
    refreshNetwork();
    const first = network.plants[0];
    if (first) openNetworkPlant(first.id);
  }

  function openNetworkPlant(id) {
    const plant = network.plants.find(item => item.id === id);
    if (!plant) return false;
    loadCase(plant.definition, plant.definition.graph.nodes.find(node => node.unit === 'sabatier' || node.unit === 'ammonia')?.id);
    return true;
  }

  function refreshNetwork() {
    try {
      networkResult = FlowsheetNetwork.evaluateNetwork(network);
      network.plants = networkResult.plants.map(plant => ({
        id: plant.id,
        name: plant.name,
        definition: plant.definition,
      }));
    } catch (error) {
      networkResult = null;
      routeNote = error.message;
    }
    persistNetwork();
    renderNetwork();
  }

  function persistNetwork() {
    if (!storage) return;
    try { storage.setItem(NETWORK_KEY, JSON.stringify({ plants: network.plants, corridors: network.corridors })); } catch { /* ignore */ }
  }

  function loadCase(definition, selection) {
    site = definition.site || null;
    Object.assign(projectEconomics, definition.economics || {});
    graph.nodes.length = 0;
    graph.edges.length = 0;
    Object.keys(setpoints).forEach(key => delete setpoints[key]);
    Object.keys(counts).forEach(key => delete counts[key]);
    for (const saved of definition.graph.nodes) {
      counts[saved.unit] = (counts[saved.unit] || 0) + 1;
      const kind = units[saved.unit].kind;
      const stream = saved.params?.stream;
      graph.nodes.push({
        ...saved,
        label: saved.id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' '),
        position: positionFor(kind, graph.nodes.filter(current => units[current.unit].kind === kind).length),
        ...(kind === 'converter' && catalog[saved.unit].presets ? { processPreset: 'custom' } : {}),
        ...(kind === 'source' ? {
          rate: stream?.kind === 'material' ? FlowsheetModel.streamMassKg(stream)
            : stream?.kind === 'consumable' ? stream.amount : stream?.kWh,
          ...(saved.sourcePreset ? { sourcePreset: saved.sourcePreset } : saved.id === 'air' ? { sourcePreset: 'air' } : saved.id === 'seawater' ? { sourcePreset: 'seawater' } : {}),
          ...(stream?.kind === 'heat' ? { temperature: stream.T_C } : {}),
        } : {}),
      });
    }
    for (const current of graph.nodes) current.economics ||= defaultEconomics(current);
    graph.edges.push(...definition.graph.edges.map(edge => ({ ...edge })));
    Object.assign(setpoints, definition.operation.setpoints);
    selectedNodeId = selection;
    pendingPort = null;
    autoArrange();
    solveAndRender();
  }

  function replaceUnit(nodeId, nextUnit) {
    const current = node(nodeId);
    const definition = catalog[nextUnit];
    if (!current || !definition || !units[nextUnit] || units[nextUnit].kind !== units[current.unit].kind) return false;
    const previousPorts = units[current.unit].ports;
    const nextPorts = units[nextUnit].ports;
    const dropped = [];
    graph.edges = graph.edges.filter(edge => {
      const onNode = edge.from.node === nodeId || edge.to.node === nodeId;
      if (!onNode) return true;
      const outgoing = edge.from.node === nodeId;
      const port = outgoing ? edge.from.port : edge.to.port;
      const next = nextPorts[port];
      const previous = previousPorts[port];
      if (!next || next.direction !== (outgoing ? 'out' : 'in') || next.kind !== previous?.kind) {
        dropped.push(portName(port));
        return false;
      }
      if (next.kind === 'consumable' && !outgoing) {
        const required = catalog[nextUnit].chemicalId;
        const supply = node(edge.from.node)?.params?.stream;
        if (required && supply?.chemicalId !== required) {
          dropped.push(`${portName(port)} (${supply?.chemicalId || 'unspecified'} ≠ ${required})`);
          return false;
        }
      }
      return true;
    });
    current.unit = nextUnit;
    current.label = definition.label;
    current.params = { ...(definition.params || {}) };
    if (Number.isFinite(definition.capacity)) current.capacity = definition.capacity;
    if (Number.isFinite(definition.rate) && setpoints[nodeId] != null) {
      setpoints[nodeId] = Math.min(setpoints[nodeId], current.capacity);
    }
    delete current.processPreset;
    selectedNodeId = nodeId;
    completeNodePorts(nodeId);
    routeNote = dropped.length
      ? `Route changed. Disconnected: ${dropped.join(', ')}. Existing reagent supplies were not converted.`
      : '';
    solveAndRender();
    return true;
  }

  function completeNodePorts(nodeId) {
    const current = node(nodeId);
    for (const [port, declaration] of Object.entries(units[current.unit].ports)) {
      if (!declaration.required) continue;
      if (edgeAt({ node: nodeId, port, direction: declaration.direction }) >= 0) continue;
      if (!catalog[`${declaration.kind}-${declaration.direction === 'in' ? 'source' : 'sink'}`]) continue;
      addBoundaryNode({ node: nodeId, port, direction: declaration.direction }, true);
    }
  }

  function snapshot() {
    return { version: 1, graph, setpoints, selectedNodeId, projectEconomics, canvasZoom, site };
  }

  function persistAutosave() {
    if (!storage) return;
    try { storage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot())); } catch { /* Storage may be unavailable or full. */ }
  }

  function readJson(key) {
    if (!storage) return null;
    try { return JSON.parse(storage.getItem(key)); } catch { return null; }
  }

  function restoreSnapshot(saved) {
    if (saved?.version !== 1 || !Array.isArray(saved.graph?.nodes) || !Array.isArray(saved.graph?.edges)) return false;
    const savedNodes = saved.graph.nodes.filter(current => current && typeof current.id === 'string'
      && catalog[current.unit] && Number.isFinite(current.position?.x) && Number.isFinite(current.position?.y));
    const ids = new Set(savedNodes.map(current => current.id));
    if (ids.size !== savedNodes.length) return false;
    const savedEdges = saved.graph.edges.filter(edge => {
      const from = savedNodes.find(current => current.id === edge?.from?.node);
      const to = savedNodes.find(current => current.id === edge?.to?.node);
      const output = from && units[from.unit].ports[edge.from.port];
      const input = to && units[to.unit].ports[edge.to.port];
      return ids.has(edge?.from?.node) && ids.has(edge?.to?.node)
        && output?.direction === 'out' && input?.direction === 'in' && output.kind === input.kind;
    });
    graph.nodes.splice(0, graph.nodes.length, ...savedNodes);
    graph.edges.splice(0, graph.edges.length, ...savedEdges);
    Object.keys(setpoints).forEach(key => delete setpoints[key]);
    for (const [id, value] of Object.entries(saved.setpoints || {})) {
      if (ids.has(id) && Number.isFinite(value) && value >= 0) setpoints[id] = value;
    }
    Object.keys(counts).forEach(key => delete counts[key]);
    for (const current of graph.nodes) {
      const suffix = Number(current.id.match(/-(\d+)$/)?.[1]) || 0;
      counts[current.unit] = Math.max(counts[current.unit] || 0, suffix);
    }
    selectedNodeId = ids.has(saved.selectedNodeId) ? saved.selectedNodeId : null;
    for (const current of graph.nodes) current.economics ||= defaultEconomics(current);
    Object.assign(projectEconomics, saved.projectEconomics || {});
    canvasZoom = clampZoom(saved.canvasZoom ?? 1);
    site = saved.site || null;
    pendingPort = null;
    return true;
  }

  function saveNamed(name) {
    if (!storage) return false;
    const saves = readJson(SAVES_KEY) || {};
    saves[name] = snapshot();
    try { storage.setItem(SAVES_KEY, JSON.stringify(saves)); } catch { return false; }
    refreshSaveOptions(name);
    return true;
  }

  function loadNamed(name) {
    const saved = (readJson(SAVES_KEY) || {})[name];
    if (!restoreSnapshot(saved)) return false;
    refreshSaveOptions(name);
    solveAndRender();
    return true;
  }

  function deleteNamed(name) {
    if (!storage) return;
    const saves = readJson(SAVES_KEY) || {};
    delete saves[name];
    storage.setItem(SAVES_KEY, JSON.stringify(saves));
    refreshSaveOptions();
  }

  function clone(value) {
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  }

  function captureBaseline() {
    baseline = { economics: currentEconomics ? clone(currentEconomics) : null };
    renderComparison();
    return true;
  }

  function clearBaseline() {
    baseline = null;
    renderComparison();
  }

  function deltaValue(current, previous) {
    return Number.isFinite(current) && Number.isFinite(previous) ? current - previous : null;
  }

  function formatDelta(value, format = formatMoney) {
    if (!Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${format(value)}`;
  }

  function formatRate(value) {
    if (!Number.isFinite(value)) return '—';
    return `${formatNumber(value * 100)}%`;
  }

  function renderComparison() {
    const panel = document.getElementById('comparisonPanel');
    const status = document.getElementById('comparisonStatus');
    const metrics = document.getElementById('comparisonMetrics');
    const ledger = document.getElementById('synergyLedger');
    const clear = document.getElementById('clearBaseline');
    if (!panel || !status || !metrics || !ledger) return;
    clear.disabled = !baseline;
    panel.hidden = !baseline;
    if (!baseline) { status.textContent = ''; metrics.innerHTML = ''; ledger.innerHTML = ''; return; }

    const current = currentEconomics;
    const previous = baseline.economics;
    if (!current || !previous) {
      status.textContent = !result ? 'Current graph is incomplete.' : !current ? 'Current economics unavailable.' : 'Baseline economics unavailable — capture a complete graph.';
      metrics.innerHTML = '';
      ledger.innerHTML = '';
      return;
    }
    status.textContent = 'Current graph compared with captured baseline';
    const rows = [
      ['CAPEX', current.installedCapex, previous.installedCapex, formatMoney],
      ['Annual revenue', current.annualRevenue, previous.annualRevenue, formatMoney],
      ['Annual cost', current.annualOperatingCost, previous.annualOperatingCost, formatMoney],
      ['Annual net cash', current.annualNetCash, previous.annualNetCash, formatMoney],
      ['NPV', current.npv, previous.npv, formatMoney],
      ['IRR', current.irr, previous.irr, formatRate],
    ];
    metrics.innerHTML = rows.map(([label, value, oldValue, format]) => {
      const delta = label === 'IRR' && Number.isFinite(value) && Number.isFinite(oldValue)
        ? (value - oldValue) * 100
        : deltaValue(value, oldValue);
      const direction = ['Annual revenue', 'Annual net cash', 'NPV', 'IRR'].includes(label) ? delta : -delta;
      const cls = direction > 0 ? 'positive' : direction < 0 ? 'negative' : '';
      const deltaLabel = label === 'IRR' ? formatDelta(delta, value => `${formatNumber(value)} pp`) : formatDelta(delta, format);
      return `<div><dt>${label}</dt><dd class="${cls}">${Number.isFinite(value) ? format(value) : '—'} <small>${deltaLabel}</small></dd></div>`;
    }).join('');
    // ponytail: annual aggregate ledger; add per-stream provenance when economics exposes it.
    const synergies = [
      ['Avoided source purchases', deltaValue(previous.breakdown.sourcePurchases, current.breakdown.sourcePurchases)],
      ['Avoided disposal', deltaValue(previous.breakdown.disposalCost, current.breakdown.disposalCost)],
      ['Additional product revenue', deltaValue(current.breakdown.productRevenue, previous.breakdown.productRevenue)],
    ].filter(([, value]) => Number.isFinite(value));
    const netSynergy = synergies.reduce((sum, [, value]) => sum + value, 0);
    if (synergies.length) synergies.push(['Net synergy value', netSynergy]);
    ledger.innerHTML = synergies.length
      ? synergies.map(([label, value]) => `<div class="synergy-row"><span>${label}</span><strong class="${value >= 0 ? 'positive' : 'negative'}">${formatDelta(value)}</strong></div>`).join('')
      : '<p class="status-meta">No comparable purchase, disposal, or product-revenue breakdowns.</p>';
  }

  function refreshSaveOptions(selected = '') {
    const saves = readJson(SAVES_KEY) || {};
    const select = document.getElementById('factorySaves');
    select.innerHTML = `<option value="">Autosave</option>${Object.keys(saves).sort().map(name => `<option value="${encodeURIComponent(name)}"${name === selected ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}`;
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function startDrag(event) {
    if (event.target.closest('[data-port]')) return;
    const nodeId = event.target.closest('[data-node]')?.dataset.node;
    if (!nodeId) return;
    const point = graphPoint(event);
    const position = node(nodeId).position;
    dragging = { nodeId, pointerId: event.pointerId, dx: point.x - position.x, dy: point.y - position.y, moved: false };
    selectedNodeId = nodeId;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function dragNode(event) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const point = graphPoint(event);
    const current = node(dragging.nodeId);
    const x = Math.max(10, point.x - dragging.dx);
    const y = Math.max(10, point.y - dragging.dy);
    dragging.moved ||= Math.abs(x - current.position.x) > 2 || Math.abs(y - current.position.y) > 2;
    current.position = { x, y };
    renderGraph();
  }

  function endDrag(event) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    suppressClick = dragging.moved;
    canvas.releasePointerCapture?.(event.pointerId);
    dragging = null;
    persistAutosave();
    render();
  }

  function graphPoint(event) {
    const svg = canvas.querySelector('svg');
    const bounds = svg.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * svg.viewBox.baseVal.width / bounds.width,
      y: (event.clientY - bounds.top) * svg.viewBox.baseVal.height / bounds.height,
    };
  }

  function clampZoom(value) { return Math.min(2, Math.max(0.25, Number(value) || 1)); }

  function setCanvasZoom(value) {
    canvasZoom = clampZoom(value);
    renderGraph();
    persistAutosave();
  }

  function handleCanvasWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setCanvasZoom(canvasZoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }

  function renderCanvasZoom() {
    document.getElementById('canvasZoom').value = Math.round(canvasZoom * 100);
    document.getElementById('canvasZoomValue').textContent = `${Math.round(canvasZoom * 100)}%`;
  }

  function autoArrange() {
    const depths = new Map(graph.nodes.map(current => [current.id, units[current.unit].kind === 'source' ? 0 : units[current.unit].kind === 'sink' ? 2 : 1]));
    const outgoing = new Map(graph.nodes.map(current => [current.id, []]));
    const indegree = new Map(graph.nodes.map(current => [current.id, 0]));
    for (const edge of graph.edges.filter(candidate => !candidate.recycle)) {
      outgoing.get(edge.from.node).push(edge.to.node);
      indegree.set(edge.to.node, indegree.get(edge.to.node) + 1);
    }
    const queue = graph.nodes.filter(current => indegree.get(current.id) === 0).map(current => current.id);
    while (queue.length) {
      const id = queue.shift();
      for (const target of outgoing.get(id)) {
        depths.set(target, Math.max(depths.get(target), depths.get(id) + 1));
        indegree.set(target, indegree.get(target) - 1);
        if (indegree.get(target) === 0) queue.push(target);
      }
    }
    const layers = new Map();
    for (const current of graph.nodes) {
      const depth = depths.get(current.id);
      if (!layers.has(depth)) layers.set(depth, []);
      layers.get(depth).push(current);
    }
    const xStep = NODE_WIDTH + COLUMN_GAP;
    const layerHeights = [...layers.values()].map(layer => layer.reduce(
      (sum, current) => sum + nodeHeight(current), Math.max(0, layer.length - 1) * 40
    ));
    const tallestLayer = Math.max(0, ...layerHeights);
    for (const [depth, layer] of layers) {
      const layerHeight = layer.reduce(
        (sum, current) => sum + nodeHeight(current), Math.max(0, layer.length - 1) * 40
      );
      let y = 40 + (tallestLayer - layerHeight) / 2;
      for (const current of layer) {
        current.position = { x: 40 + depth * xStep, y };
        y += nodeHeight(current) + 40;
      }
    }
    persistAutosave();
    renderGraph();
  }

  function toggleCanvasFocus() {
    canvasFocused = !canvasFocused;
    document.body.classList[canvasFocused ? 'add' : 'remove']('canvas-focus');
    const button = document.getElementById('focusCanvas');
    button.textContent = canvasFocused ? 'Show panels' : 'Focus canvas';
    button.setAttribute('aria-pressed', String(canvasFocused));
  }

  function handleCanvasClick(event) {
    if (suppressClick) { suppressClick = false; return; }
    const port = event.target.closest('[data-port]');
    if (port) {
      choosePort({ node: port.dataset.node, port: port.dataset.port, direction: port.dataset.direction });
      return;
    }
    const nodeId = event.target.closest('[data-node]')?.dataset.node;
    if (nodeId) { selectedNodeId = nodeId; render(); }
  }

  function choosePort(endpoint) {
    selectedNodeId = endpoint.node;
    if (!pendingPort) { pendingPort = endpoint; render(); return; }
    if (pendingPort.node === endpoint.node && pendingPort.port === endpoint.port) { pendingPort = null; render(); return; }
    const from = pendingPort.direction === 'out' ? pendingPort : endpoint;
    const to = pendingPort.direction === 'in' ? pendingPort : endpoint;
    const fromDeclaration = units[node(from.node).unit].ports[from.port];
    const toDeclaration = units[node(to.node).unit].ports[to.port];
    solveError = '';
    if (from.direction !== 'out' || to.direction !== 'in') solveError = 'Connect an output port to an input port.';
    else if (fromDeclaration.kind !== toDeclaration.kind) solveError = `Cannot connect ${fromDeclaration.kind} to ${toDeclaration.kind}.`;
    else if ((edgeAt(from) >= 0 && !['junction', 'splitter'].includes(units[node(from.node).unit].kind))
      || (edgeAt(to) >= 0 && units[node(to.node).unit].kind !== 'mixer')) solveError = 'That port is already connected. Disconnect it first.';
    else graph.edges.push({ from: { node: from.node, port: from.port }, to: { node: to.node, port: to.port }, ...(units[node(from.node).unit].kind === 'splitter' ? { weight: 1 } : {}) });
    pendingPort = null;
    solveAndRender();
  }

  function addBoundaryNode(target, silent = false) {
    const current = node(target.node);
    const kind = units[current.unit].ports[target.port].kind;
    if (target.direction === 'in') {
      const source = addNode(`${kind}-source`, {
        preset: suggestedPreset(current.unit, target.port),
        chemicalId: catalog[current.unit]?.chemicalId,
        temperature: kind === 'heat' ? current.params?.minHeatT_C : undefined,
        silent,
      });
      graph.edges.push({ from: { node: source.id, port: 'out' }, to: { node: target.node, port: target.port } });
      return source;
    }
    const sink = addNode(`${kind}-sink`, { label: `${portName(target.port)} sink`, silent });
    graph.edges.push({ from: { node: target.node, port: target.port }, to: { node: sink.id, port: 'in' } });
    return sink;
  }

  function completeBoundaries() {
    const selection = selectedNodeId;
    const targets = graph.nodes
      .filter(current => !['source', 'sink'].includes(units[current.unit].kind))
      .flatMap(current => Object.entries(units[current.unit].ports)
        .filter(([port, declaration]) => declaration.required
          && edgeAt({ node: current.id, port, direction: declaration.direction }) < 0
          && catalog[`${declaration.kind}-${declaration.direction === 'in' ? 'source' : 'sink'}`])
        .map(([port, declaration]) => ({ node: current.id, port, direction: declaration.direction })));
    targets.forEach(target => addBoundaryNode(target, true));
    selectedNodeId = selection;
    pendingPort = null;
    solveAndRender();
  }

  function handleInspectorInput(event) {
    const current = node(selectedNodeId);
    if (!current) return;
    if (event.target.name === 'requestedRate') setpoints[current.id] = Number(event.target.value);
    if (event.target.name === 'dacRoute' && event.target.value !== current.unit) {
      replaceUnit(current.id, event.target.value);
      return;
    }
    if (event.target.name === 'processPreset') {
      current.processPreset = event.target.value;
      if (current.processPreset !== 'custom') Object.assign(current.params, catalog[current.unit].presets[current.processPreset].params);
      if (units[current.unit].kind === 'source') updateSourceStream(current);
    }
    if (event.target.name === 'siteResource') {
      current.siteResource = event.target.value || undefined;
      updateSourceStream(current);
    }
    if (event.target.name === 'chemicalId') {
      current.chemicalId = event.target.value || undefined;
      updateSourceStream(current);
    }
    if (event.target.name === 'processParameter') {
      current.processPreset = 'custom';
      current.params[event.target.dataset.param] = Number(event.target.value);
      if (['battery', 'thermal-storage'].includes(current.unit) && event.target.dataset.param === 'capexPerKWh') current.economics.installedCapex = current.capacity * current.params.capexPerKWh;
    }
    if (event.target.name === 'sourceParameter') {
      current.processPreset = 'custom';
      current.params[event.target.dataset.param] = Number(event.target.value);
      updateSourceStream(current);
      if (['capacityKW', 'capexPerKW', 'fixedOMPerKWYear', 'variableCostPerMWh', 'lifeYears', 'pricePerMWh'].includes(event.target.dataset.param)) current.economics = defaultEconomics(current);
    }
    if (event.target.name === 'sourceRate') { current.rate = Number(event.target.value); updateSourceStream(current); }
    if (event.target.name === 'sourcePreset') { current.sourcePreset = event.target.value; updateSourceStream(current); }
    if (event.target.name === 'heatTemperature') { current.temperature = Number(event.target.value); updateSourceStream(current); }
    if (event.target.name === 'branchWeight') graph.edges[Number(event.target.dataset.edge)].weight = Number(event.target.value);
    if (event.target.name === 'economics') {
      const key = event.target.dataset.economics;
      current.economics[key] = key === 'disposition' ? event.target.value : Number(event.target.value);
    }
    solveAndRender();
  }

  function handleProjectEconomics(event) {
    if (event.target.id === 'projectLifeYears') projectEconomics.projectLifeYears = Math.max(1, Number(event.target.value) || 1);
    if (event.target.id === 'discountRate') projectEconomics.discountRate = Math.max(0, Number(event.target.value) || 0) / 100;
    solveAndRender();
  }

  function handleInspectorClick(event) {
    const disconnect = event.target.closest('[data-disconnect]');
    if (disconnect) {
      graph.edges.splice(Number(disconnect.dataset.disconnect), 1);
      pendingPort = null;
      solveAndRender();
      return;
    }
    const addBoundary = event.target.closest('[data-boundary-port]');
    if (addBoundary) {
      const target = { node: selectedNodeId, port: addBoundary.dataset.boundaryPort, direction: addBoundary.dataset.direction };
      addBoundaryNode(target, true);
      selectedNodeId = target.node;
      solveAndRender();
      return;
    }
    if (event.target.closest('#deleteNode')) {
      const id = selectedNodeId;
      graph.edges = graph.edges.filter(edge => edge.from.node !== id && edge.to.node !== id);
      graph.nodes.splice(graph.nodes.findIndex(candidate => candidate.id === id), 1);
      delete setpoints[id];
      selectedNodeId = null;
      pendingPort = null;
      solveAndRender();
    }
  }

  function suggestedPreset(unit, port) {
    return {
      'dac.air': 'air', 'dac-solid.air': 'air', 'dac-liquid.air': 'air', 'dac-electroswing.air': 'air',
      'asu.air': 'air', 'swro.feed': 'seawater', 'med.feed': 'seawater', 'msf.feed': 'seawater', 'brine-minerals.brine': 'brine',
      'electrolyzer.water': 'water', 'chlor-alkali.water': 'water', 'sabatier.co2': 'co2', 'sabatier.hydrogen': 'hydrogen',
      'ammonia.nitrogen': 'nitrogen', 'ammonia.hydrogen': 'hydrogen', 'chlor-alkali.salt': 'salt',
      'bromine-recovery.bromide': 'bromide', 'bromine-recovery.chlorine': 'chlorine',
      'aluminium-smelter.alumina': 'alumina', 'aluminium-smelter.carbon': 'carbon', 'hydrogen-dri.ironOre': 'ironOre', 'hydrogen-dri.hydrogen': 'hydrogen',
      'titanium-kroll.titaniumTetrachloride': 'titaniumTetrachloride', 'titanium-kroll.magnesium': 'magnesium',
    }[`${unit}.${port}`] || 'water';
  }

  function solveAndRender() {
    result = null;
    currentEconomics = null;
    if (graph.nodes.length && missingConnections().length === 0) {
      try {
        const solver = FlowsheetSolver.solveHorizon || FlowsheetSolver.solveOperation;
        result = solver({ graph, operation: { setpoints }, site });
        currentEconomics = FlowsheetEconomics.evaluateEconomics({ graph, operation: { setpoints }, economics: projectEconomics }, result);
        solveError = '';
      } catch (error) { solveError = error.message; }
    }
    persistAutosave();
    render();
  }

  function missingConnections() {
    const missing = [];
    for (const current of graph.nodes) {
      if (['source', 'sink'].includes(units[current.unit].kind)) continue;
      for (const [port, declaration] of Object.entries(units[current.unit].ports)) {
        if (declaration.required && edgeAt({ node: current.id, port, direction: declaration.direction }) < 0) missing.push(`${current.label}: ${portName(port)}`);
      }
    }
    return missing;
  }

  function edgeAt(endpoint) {
    return edgeIndexesAt(endpoint)[0] ?? -1;
  }

  function edgeIndexesAt(endpoint) {
    return graph.edges.map((edge, index) => ({ edge, index })).filter(({ edge }) => endpoint.direction === 'out'
      ? edge.from.node === endpoint.node && edge.from.port === endpoint.port
      : edge.to.node === endpoint.node && edge.to.port === endpoint.port).map(({ index }) => index);
  }

  function node(id) { return graph.nodes.find(candidate => candidate.id === id); }
  function portName(port) { return portNames[port] || port.replace(/([a-z])([A-Z])/g, '$1 $2'); }

  function render() { renderGraph(); renderStatus(); renderSite(); renderInspector(); renderEconomics(); renderComparison(); renderNetwork(); }

  function renderGraph() {
    renderCanvasZoom();
    if (!graph.nodes.length) {
      canvas.classList.add('empty');
      canvas.innerHTML = '<div class="empty-canvas"><span class="eyebrow">Blank factory</span><strong>Add a process block to begin</strong><p>Pick a block from the build menu, then click two compatible ports to connect them.</p></div>';
      return;
    }
    canvas.classList.remove('empty');
    const hasRecycle = graph.edges.some(edge => edge.recycle);
    const width = Math.max(1400, ...graph.nodes.map(current => current.position.x + NODE_WIDTH + 40));
    const height = Math.max(620, ...graph.nodes.map(current => current.position.y + nodeHeight(current) + (hasRecycle ? 120 : 40)));
    const recycleY = height - 45;
    const edges = graph.edges.map((edge, edgeIndex) => {
      const start = portPoint(edge.from.node, edge.from.port, 'out');
      const end = portPoint(edge.to.node, edge.to.port, 'in');
      const sibling = graph.edges.slice(0, edgeIndex).filter(candidate => candidate.from.node === edge.from.node && candidate.from.port === edge.from.port).length;
      const mid = (start.x + end.x) / 2 + sibling * 12;
      const stream = result?.streams.find(candidate => candidate.from.node === edge.from.node && candidate.from.port === edge.from.port)?.stream;
      const kind = units[node(edge.from.node).unit].ports[edge.from.port].kind;
      const constrained = bottlenecksFor(edge.to.node).some(limit => limitingPort(node(edge.to.node), limit) === edge.to.port);
      const path = edge.recycle
        ? `M${start.x} ${start.y} C${start.x + 70} ${start.y},${start.x + 70} ${recycleY},${start.x} ${recycleY} L${end.x} ${recycleY} C${end.x - 70} ${recycleY},${end.x - 70} ${end.y},${end.x} ${end.y}`
        : `M${start.x} ${start.y} C${mid} ${start.y},${mid} ${end.y},${end.x} ${end.y}`;
      const labelX = edge.recycle ? (start.x + end.x) / 2 : mid;
      const labelY = edge.recycle ? recycleY - 8 : (start.y + end.y) / 2 - 7;
      return `<path class="flow-edge ${kind}${edge.recycle ? ' recycle' : ''}${constrained ? ' bottleneck' : ''}" d="${path}"/><text class="edge-label${constrained ? ' bottleneck' : ''}" x="${labelX}" y="${labelY}" text-anchor="middle">${stream ? `${edge.recycle ? '↻ ' : ''}${formatStream(stream)}` : ''}</text>`;
    }).join('');
    canvas.innerHTML = `<svg viewBox="0 0 ${width} ${height}" style="width:${width * canvasZoom}px;height:${height * canvasZoom}px;max-width:none" aria-label="Editable factory flowsheet">${edges}${graph.nodes.map(renderNode).join('')}</svg>`;
  }

  function renderNode(current) {
    const ports = Object.entries(units[current.unit].ports);
    const inputs = ports.filter(([, declaration]) => declaration.direction === 'in');
    const outputs = ports.filter(([, declaration]) => declaration.direction === 'out');
    const { x, y } = current.position;
    const height = nodeHeight(current);
    const nodeResult = result?.nodes[current.id];
    const bottlenecks = bottlenecksFor(current.id);
    const value = nodeResult?.activity !== undefined ? `${formatNumber(nodeResult.activity)} ${catalog[current.unit].activityUnit}` : nodeResult ? formatStream(nodeResult.supplied || nodeResult.received || nodeResult.available) : 'Not running';
    const portMarkup = (list, direction) => list.map(([port, declaration], index) => {
      const cy = y + 66 + index * 24;
      const cx = direction === 'in' ? x : x + NODE_WIDTH;
      const selected = pendingPort?.node === current.id && pendingPort.port === port;
      return `<g class="flow-port ${declaration.kind}${selected ? ' pending' : ''}" data-node="${current.id}" data-port="${port}" data-direction="${direction}" role="button" tabindex="0"><circle cx="${cx}" cy="${cy}" r="7"/><text x="${direction === 'in' ? cx + 13 : cx - 13}" y="${cy + 4}" text-anchor="${direction === 'in' ? 'start' : 'end'}">${portName(port)}</text></g>`;
    }).join('');
    return `<g class="flow-node${bottlenecks.length ? ' bottleneck' : ''}${current.id === selectedNodeId ? ' selected' : ''}" data-node="${current.id}" tabindex="0">${bottlenecks.length ? `<title>Bottleneck: ${bottlenecks.map(portName).join(', ')}</title>` : ''}<rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${height}" rx="10"/><text class="node-kind" x="${x + 16}" y="${y + 20}">${units[current.unit].kind}</text><text class="node-label" x="${x + 16}" y="${y + 42}">${current.label}</text><text class="node-value" x="${x + 16}" y="${y + height - 12}">${value}</text>${portMarkup(inputs, 'in')}${portMarkup(outputs, 'out')}</g>`;
  }

  function bottlenecksFor(nodeId) { return result?.nodes[nodeId]?.limitedBy || []; }
  function limitingPort(current, limit) {
    if (DAC_ROUTES[current.unit] && limit === 'feed') return 'air';
    if (['battery', 'thermal-storage'].includes(current.unit) && ['electricity', 'heat'].includes(limit)) return 'in';
    return limit;
  }

  function nodeHeight(current) {
    const ports = Object.values(units[current.unit].ports);
    return Math.max(104, 82 + Math.max(ports.filter(port => port.direction === 'in').length, ports.filter(port => port.direction === 'out').length) * 24);
  }

  function portPoint(nodeId, port, direction) {
    const current = node(nodeId);
    const ports = Object.entries(units[current.unit].ports).filter(([, declaration]) => declaration.direction === direction);
    return { x: current.position.x + (direction === 'out' ? NODE_WIDTH : 0), y: current.position.y + 66 + ports.findIndex(([name]) => name === port) * 24 };
  }

  function renderStatus() {
    const missing = missingConnections();
    const bottlenecks = graph.nodes.flatMap(current => bottlenecksFor(current.id).map(limit => `${current.label}: ${portName(limit)}`));
    const solveStatus = document.getElementById('solveStatus');
    const balanceStatus = document.getElementById('balanceStatus');
    document.getElementById('flowSummary').textContent = `${graph.nodes.length} blocks · ${graph.edges.length} connections`;
    document.getElementById('diagramTitle').textContent = site?.name || (graph.nodes.length ? 'Factory canvas' : 'Blank factory');
    if (!graph.nodes.length) {
      solveStatus.textContent = 'Empty factory';
      solveStatus.className = 'status-chip idle';
      balanceStatus.textContent = 'Add a block';
      balanceStatus.className = 'status-chip idle';
    } else {
      solveStatus.textContent = result ? 'Factory running' : 'Factory incomplete';
      solveStatus.className = `status-chip${result ? ' good' : missing.length || solveError ? ' warn' : ''}`;
      balanceStatus.textContent = result ? (result.balances.maxAbsResidual < 1e-8 ? 'Balances closed' : 'Check balances') : pendingPort ? 'Choose compatible port' : 'Manual setpoints';
      balanceStatus.className = `status-chip${result?.balances.maxAbsResidual < 1e-8 ? ' good' : result || pendingPort ? ' warn' : ''}`;
    }
    const warning = document.getElementById('warnings');
    warning.hidden = !solveError && !routeNote && !pendingPort && missing.length === 0 && bottlenecks.length === 0;
    warning.textContent = solveError || routeNote || (pendingPort ? `Connecting ${node(pendingPort.node).label} · ${portName(pendingPort.port)} — choose a compatible ${pendingPort.direction === 'out' ? 'input' : 'output'}.` : missing.length ? `Connect ${missing.slice(0, 4).join(' · ')}${missing.length > 4 ? ` · +${missing.length - 4} more` : ''}` : bottlenecks.length ? `Bottleneck: ${bottlenecks.join(' · ')}` : '');
  }

  function renderSite() {
    const panel = document.getElementById('sitePanel');
    panel.hidden = false;
    document.getElementById('siteName').textContent = site?.name || 'No site selected';
    document.getElementById('siteNotes').textContent = site?.notes || '';
    document.getElementById('siteLatitude').value = site?.latitude ?? 36.834;
    document.getElementById('siteLongitude').value = site?.longitude ?? -2.463;
    document.getElementById('siteSolarKWp').value = site?.solarKWp ?? 37.5;
    document.getElementById('siteBatteryKWh').value = site?.storage?.batteryKWh ?? 0;
    const monthLabel = document.getElementById('siteMonthLabel');
    const monthSelect = document.getElementById('siteMonth');
    if (site?.solar?.typicalMonths || site?.id === 'almeria-pvgis-2026-09-05') {
      monthLabel.hidden = false;
      monthSelect.innerHTML = SITE_MONTHS.map((label, index) => `<option value="${index}"${index === (site.month || 0) ? ' selected' : ''}>${label}</option>`).join('');
    } else {
      monthLabel.hidden = true;
    }
    const hours = result?.horizon?.hours;
    const land = site?.solarKWp && FlowsheetNetwork ? FlowsheetNetwork.pvLandHa(site.solarKWp) : 0;
    document.getElementById('siteHorizon').textContent = [
      hours ? `${hours.filter(entry => entry.pv > 0).length} daylight hours · ${hours.filter(entry => entry.pv === 0).length} night hours · peak ${formatNumber(Math.max(...hours.map(entry => entry.pv)))} kWh PV · battery ${formatNumber(site?.storage?.batteryKWh || 0)} kWh` : '',
      land ? `${formatNumber(land)} ha PV land at 1.6 ha/MWp screening` : '',
    ].filter(Boolean).join(' · ');
    document.getElementById('siteResources').innerHTML = Object.entries(site?.resources || {}).map(([id, resource]) => {
      const quality = resource.quality || 'user-assumption';
      return `<div class="${quality === 'unverified' ? 'unverified' : ''}"><dt>${id} <small>${quality}</small></dt><dd>${formatStream(resource.stream)}</dd></div>`;
    }).join('');
    document.getElementById('siteEvidence').innerHTML = (site?.evidence || []).map(item => (
      item.url ? `<a href="${item.url}" target="_blank" rel="noreferrer">${item.label}</a>` : item.label
    )).join(' · ');
  }

  function renderNetwork() {
    const panel = document.getElementById('networkPanel');
    const body = document.getElementById('networkBody');
    const title = document.getElementById('networkTitle');
    const plants = document.getElementById('networkPlants');
    const status = document.getElementById('networkStatus');
    const metrics = document.getElementById('networkMetrics');
    const products = document.getElementById('networkProducts');
    const corridors = document.getElementById('networkCorridors');
    const empty = !network.plants.length;
    title.textContent = empty ? 'No plants' : `${network.plants.length} plant${network.plants.length === 1 ? '' : 's'}`;
    if (empty) panel.classList.add('is-empty');
    else panel.classList.remove('is-empty');
    body.hidden = empty;
    if (empty) {
      status.textContent = 'Add sited plants. Each keeps its own physics solve; the network rolls up materials, land, freight, and cash.';
      plants.innerHTML = '';
      metrics.innerHTML = '';
      products.innerHTML = '';
      corridors.innerHTML = '';
      return;
    }
    if (!networkResult) {
      status.textContent = 'Network solve failed.';
      return;
    }
    status.textContent = `${networkResult.plants.length} plants · ${formatNumber(networkResult.landHa)} ha PV land · freight ${formatMoney(networkResult.freight)}/year`;
    const transferred = networkResult.transferred || new Set();
    plants.innerHTML = networkResult.plants.map(plant => {
      const siteName = plant.definition.site?.name || 'Unspecified site';
      const lead = (networkResult.products || [])
        .filter(item => item.plantId === plant.id && item.tonnesPerYear && !transferred.has(`${item.plantId}:${item.nodeId}`))
        .sort((left, right) => right.tonnesPerYear - left.tonnesPerYear)[0];
      const leadText = lead ? `${lead.substance} · ${formatNumber(lead.tonnesPerYear)} t/year` : 'No sale products';
      return `<div class="network-plant"><div class="network-plant-copy"><strong>${plant.name}</strong><small>${siteName}</small><small>${leadText}</small></div><button type="button" data-open-plant="${plant.id}">Open</button></div>`;
    }).join('');
    metrics.innerHTML = metricRows([
      ['CAPEX', formatMoney(networkResult.installedCapex)],
      ['NPV', formatMoney(networkResult.npv)],
      ['Net cash', formatMoney(networkResult.annualNetCash)],
      ['Revenue', formatMoney(networkResult.annualRevenue)],
      ['Cost', formatMoney(networkResult.annualOperatingCost)],
    ]);
    const ranked = Object.entries(networkResult.slate).sort((left, right) => right[1] - left[1]);
    const peak = ranked[0]?.[1] || 1;
    products.innerHTML = ranked.map(([substance, tonnes], index) => {
      const share = Math.max(6, (tonnes / peak) * 100);
      return `<div class="${index === 0 ? 'lead' : ''}"><dt>${substance}</dt><dd><span class="product-bar" aria-hidden="true"><i style="width:${share}%"></i></span><strong>${formatNumber(tonnes)}</strong> <small>t/year</small></dd></div>`;
    }).join('');
    corridors.innerHTML = networkResult.corridors.length
      ? networkResult.corridors.map(corridor => `<div class="corridor-row">${corridor.substance} · ${formatNumber(corridor.km)} km ${corridor.mode} · ${formatMoney(corridor.annualFreight)}/year</div>`).join('')
      : '<p class="status-meta">No haul corridors. Plants trade with markets until a corridor is added.</p>';
  }

  function renderInspector() {
    const current = node(selectedNodeId);
    if (!current) {
      document.getElementById('inspectorTitle').textContent = 'Nothing selected';
      document.getElementById('inspectorKind').textContent = 'Select a block on the canvas to configure it.';
      document.getElementById('nodeControls').innerHTML = '';
      document.getElementById('inspectorMetrics').innerHTML = '';
      document.getElementById('streamList').innerHTML = '<p class="status-meta">No ports yet.</p>';
      document.getElementById('recipeList').innerHTML = '';
      document.getElementById('exchangeList').innerHTML = '';
      document.getElementById('balanceList').innerHTML = '';
      return;
    }
    document.getElementById('inspectorTitle').textContent = current.label;
    document.getElementById('inspectorKind').textContent = `${units[current.unit].kind} · ${current.unit}`;
    document.getElementById('nodeControls').innerHTML = controlsFor(current);
    const nodeResult = result?.nodes[current.id];
    const metrics = nodeResult?.activity !== undefined ? [
      ['Achieved', `${formatNumber(nodeResult.activity)} ${catalog[current.unit].activityUnit}`],
      ['Requested', `${formatNumber(setpoints[current.id])} ${catalog[current.unit].activityUnit}`],
      ['Limited by', nodeResult.limitedBy.join(', ') || 'Nothing'],
    ] : nodeResult?.limitedBy?.length ? [['Limited by', nodeResult.limitedBy.join(', ')]] : [];
    document.getElementById('inspectorMetrics').innerHTML = metricRows([...metrics, ...economicsRows(current)]);
    document.getElementById('streamList').innerHTML = Object.entries(units[current.unit].ports).map(([port, declaration]) => renderInspectorPort(current, port, declaration)).join('');
    document.getElementById('recipeList').innerHTML = nodeResult?.requestedInputs ? `${recipeGroup('INFLOW', nodeResult.requestedInputs)}${recipeGroup('OUTFLOW', nodeResult.outlets)}` : '<p class="status-meta">Complete the graph to calculate flows.</p>';
    const exchanges = result?.streams.filter(stream => stream.recycle) || [];
    document.getElementById('exchangeList').innerHTML = exchanges.length
      ? exchanges.map(stream => `<div class="recipe-flow"><strong>${stream.label || 'Recovered stream'}</strong><span class="species">${node(stream.from.node).label} → ${node(stream.to.node).label} · ${formatStream(stream.stream)}</span></div>`).join('')
      : '<p class="status-meta">No circular exchanges.</p>';
    document.getElementById('balanceList').innerHTML = result ? metricRows([
      ...Object.entries(result.balances.elements).map(([element, value]) => [element, `${formatNumber(value)} mol`]),
      ['Electricity', `${formatNumber(result.balances.electricityKWh)} kWh`], ['Heat', `${formatNumber(result.balances.heatKWh)} kWh`],
      ['Recycle solve', result.convergence.converged ? `${result.convergence.iterations} iterations` : 'Did not converge'],
    ]) : '';
  }

  function controlsFor(current) {
    const kind = units[current.unit].kind;
    if (kind === 'converter') {
      const definition = catalog[current.unit];
      const preset = definition.presets ? `<label>Process type</label><select name="processPreset">${Object.entries(definition.presets).map(([id, item]) => `<option value="${id}"${id === current.processPreset ? ' selected' : ''}>${item.label}</option>`).join('')}<option value="custom"${current.processPreset === 'custom' ? ' selected' : ''}>Custom</option></select>` : '';
      const route = DAC_ROUTES[current.unit] ? `<label>Process route<select name="dacRoute">${Object.entries(DAC_ROUTES).filter(([id]) => current.unit === 'dac' || id !== 'dac').map(([id, label]) => `<option value="${id}"${id === current.unit ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : '';
      const parameters = (definition.controls || []).map(control => `<label>${control.label} <output>${formatNumber(current.params[control.key])}${control.unit ? ` ${control.unit}` : ''}</output></label><input name="processParameter" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current.params[control.key]}">`).join('');
      const references = (definition.references || []).map(reference => `<a href="${reference.url}" target="_blank" rel="noreferrer">${reference.label}</a>`).join(' · ');
      return `<fieldset><legend>Independent setpoint</legend><label>Requested rate <output>${formatNumber(setpoints[current.id])} ${definition.activityUnit}</output></label><input name="requestedRate" type="range" min="0" max="${current.capacity}" step="1" value="${setpoints[current.id]}"></fieldset>${route || preset || parameters ? `<fieldset><legend>Process assumptions</legend>${route}${preset}${parameters}${definition.chemicalId ? `<p class="status-meta">Makeup chemical: ${CONSUMABLE_CHEMICALS[definition.chemicalId] || definition.chemicalId}. Switching routes does not rewrite an existing supply.</p>` : ''}${references ? `<p class="literature-links">Basis: ${references}</p>` : ''}</fieldset>` : ''}${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete block</button>`;
    }
    if (kind === 'source') {
      const definition = catalog[current.unit];
      const budget = current.siteResource && site?.resources?.[current.siteResource]?.stream
        ? sourceAmount(site.resources[current.siteResource].stream) : null;
      const max = budget ?? definition.manualRateMax ?? (current.unit === 'material-source' ? 100000 : current.unit === 'electricity-source' ? 10000 : current.unit === 'heat-source' ? 1000 : 100);
      const unit = definition.sourceUnit || (current.unit === 'material-source' || current.unit === 'consumable-source' ? 'kg/day' : 'kWh/day');
      const siteResource = site ? `<label>Site resource<select name="siteResource"><option value="">Unassigned — unverified</option>${Object.entries(site.resources).filter(([, resource]) => resource.stream?.kind === units[current.unit].ports.out.kind).map(([id, resource]) => `<option value="${id}"${id === current.siteResource ? ' selected' : ''}>${id} · ${resource.quality || 'assumed'}</option>`).join('')}</select></label>` : '';
      const preset = current.unit === 'material-source' && !current.siteResource ? `<label>Material</label><select name="sourcePreset">${Object.entries(materialPresets).map(([id, item]) => `<option value="${id}"${id === current.sourcePreset ? ' selected' : ''}>${item.label}</option>`).join('')}</select>` : '';
      const chemical = current.unit === 'consumable-source' && !current.siteResource ? `<label>Makeup chemical<select name="chemicalId"><option value="">Unspecified</option>${Object.entries(CONSUMABLE_CHEMICALS).map(([id, label]) => `<option value="${id}"${id === current.chemicalId ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : '';
      const temperature = current.unit === 'heat-source' && !current.siteResource ? `<label>Temperature <output>${current.temperature} °C</output></label><input name="heatTemperature" type="range" min="20" max="1000" step="5" value="${current.temperature}">` : '';
      const processPreset = definition.presets ? `<label>Technology</label><select name="processPreset">${Object.entries(definition.presets).map(([id, item]) => `<option value="${id}"${id === current.processPreset ? ' selected' : ''}>${item.label}</option>`).join('')}<option value="custom"${current.processPreset === 'custom' ? ' selected' : ''}>Custom</option></select>` : '';
      const parameters = (definition.controls || []).map(control => `<label>${control.label} <output>${formatNumber(current.params[control.key])}${control.unit ? ` ${control.unit}` : ''}</output></label><input name="sourceParameter" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current.params[control.key]}">`).join('');
      const references = (definition.references || []).map(reference => `<a href="${reference.url}" target="_blank" rel="noreferrer">${reference.label}</a>`).join(' · ');
      const rate = definition.controls && !definition.manualRateMax
        ? `<p class="status-meta">Available: ${formatNumber(current.rate)} ${unit}</p>`
        : `<label>Available rate <output>${formatNumber(current.rate)} ${unit}</output></label><input name="sourceRate" type="range" min="0" max="${max}" step="${max / 100 || 0.01}" value="${current.rate}">`;
      const capNote = budget != null ? `<p class="status-meta">${site.resources[current.siteResource]?.evidence || 'Capped by the named site resource. A second block sharing this resource cannot duplicate it.'}</p>` : (site && !current.siteResource ? '<p class="status-meta">Unassigned sources are unverified. They do not become unlimited supply.</p>' : '');
      return `<fieldset><legend>Source settings</legend>${siteResource}${preset}${chemical}${processPreset}${rate}${temperature}${parameters}${capNote}${definition.economicsNote ? `<p class="status-meta">${definition.economicsNote}</p>` : ''}${references ? `<p class="literature-links">Basis: ${references}</p>` : ''}</fieldset>${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete source</button>`;
    }
    return `${kind === 'sink' ? economicsControlsFor(current) : ''}<button class="delete-node" id="deleteNode" type="button">Delete ${kind === 'sink' ? 'sink' : 'junction'}</button>`;
  }

  function defaultEconomics(current) {
    const kind = units[current.unit].kind;
    if (kind === 'source') {
      if (['solar-pv', 'nuclear-electricity', 'solar-thermal'].includes(current.unit)) return {
        installedCapex: current.params.capacityKW * current.params.capexPerKW,
        fixedOM: current.params.capacityKW * Number(current.params.fixedOMPerKWYear || 0),
        variableOM: Number(current.params.variableCostPerMWh || 0) / 1000,
        assetLifeYears: current.params.lifeYears,
      };
      const unitCost = current.unit === 'grid-electricity' ? current.params.pricePerMWh / 1000
        : current.unit === 'electricity-source' ? 0.05
          : current.unit === 'heat-source' ? 0.02
            : current.unit === 'consumable-source' ? 1 : 0;
      return { unitCost };
    }
    if (kind === 'converter') return {
      installedCapex: ['battery', 'thermal-storage'].includes(current.unit) ? current.capacity * current.params.capexPerKWh : 0,
      fixedOMPercent: 3,
      variableOM: 0,
      assetLifeYears: 20,
    };
    if (kind === 'sink') return { disposition: 'vent', unitPrice: 0, disposalCost: 0, annualDemandLimit: 1e12 };
    return {};
  }

  function economicsControlsFor(current) {
    const kind = units[current.unit].kind;
    const economics = current.economics || (current.economics = defaultEconomics(current));
    const field = (key, label, step = '0.01') => `<label>${label}<input name="economics" data-economics="${key}" type="number" min="0" step="${step}" value="${economics[key] ?? 0}"></label>`;
    if (kind === 'source') return `<fieldset><legend>Economics</legend>${economics.unitCost != null ? field('unitCost', 'Delivered input cost') : `${field('installedCapex', 'Installed CAPEX', '100')}${field('fixedOM', 'Fixed O&M / year', '100')}${field('variableOM', 'Variable cost / output unit')}`}<p class="status-meta">Native unit is kg, kWh, or consumable unit. Zero values explore the physical limit.</p></fieldset>`;
    if (kind === 'converter') return `<fieldset><legend>Economics</legend>${field('installedCapex', 'Installed CAPEX', '100')}${field('fixedOMPercent', 'Fixed O&M (% CAPEX)')}${field('variableOM', 'Variable O&M / activity unit')}${field('assetLifeYears', 'Asset life (years)', '1')}</fieldset>`;
    return `<fieldset><legend>Destination economics</legend><label>Disposition<select name="economics" data-economics="disposition">${['sale', 'disposal', 'vent', 'reinjection'].map(value => `<option value="${value}"${economics.disposition === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label>${field('unitPrice', 'Sale price / unit')}${field('annualDemandLimit', 'Annual demand limit', '1')}${field('disposalCost', 'Disposal cost / unit')}</fieldset>`;
  }

  function renderEconomics() {
    const metrics = document.getElementById('economicsMetrics');
    const status = document.getElementById('economicsStatus');
    document.getElementById('projectLifeYears').value = projectEconomics.projectLifeYears;
    document.getElementById('discountRate').value = projectEconomics.discountRate * 100;
    if (!currentEconomics) {
      status.textContent = result ? `Economics unavailable: ${solveError}` : 'Complete the graph to calculate viability.';
      metrics.innerHTML = '';
      return;
    }
    status.textContent = `${currentEconomics.periodDays} operating days/year · illustrative assumptions; edit any source, block, or destination in the inspector.`;
    metrics.innerHTML = metricRows([
      ['Installed CAPEX', formatMoney(currentEconomics.installedCapex)],
      ['Annual revenue', formatMoney(currentEconomics.annualRevenue)],
      ['Annual operating cost', formatMoney(currentEconomics.annualOperatingCost)],
      ['Annual net cash', formatMoney(currentEconomics.annualNetCash)],
      ['NPV', formatMoney(currentEconomics.npv)],
      ['IRR', formatRate(currentEconomics.irr)],
      ['Levelized delivered cost', currentEconomics.levelizedDeliveredCost == null ? '—' : `${formatMoney(currentEconomics.levelizedDeliveredCost)}/unit`],
      ...(currentEconomics.sinks || []).filter(sink => sink.disposition === 'sale' && sink.deliveredAmount > 0).map(sink => (
        [`Sold ${sink.id}`, `${formatNumber(sink.deliveredAmount / 1000)} t/year`]
      )),
    ]);
  }

  function renderInspectorPort(current, port, declaration) {
    const edgeIndexes = edgeIndexesAt({ node: current.id, port, direction: declaration.direction });
    const multi = declaration.direction === 'in' ? units[current.unit].kind === 'mixer' : ['junction', 'splitter'].includes(units[current.unit].kind);
    const boundaryAllowed = declaration.direction === 'in'
      ? (edgeIndexes.length === 0 || multi)
      : Boolean(catalog[`${declaration.kind}-sink`]) && (edgeIndexes.length === 0 || multi);
    const connections = edgeIndexes.map(index => {
      const edge = graph.edges[index];
      const peerId = declaration.direction === 'in' ? edge.from.node : edge.to.node;
      const weight = units[current.unit].kind === 'splitter' && declaration.direction === 'out'
        ? `<label class="branch-weight">Share <input name="branchWeight" data-edge="${index}" type="range" min="0.1" max="10" step="0.1" value="${edge.weight ?? 1}"></label>`
        : '';
      return `<div class="port-connection"><small>Connected to ${node(peerId).label}</small>${weight}<button type="button" data-disconnect="${index}">Disconnect</button></div>`;
    }).join('') || '<small>Not connected</small>';
    return `<div class="port-row"><div><span>${declaration.direction === 'in' ? 'IN' : 'OUT'} · ${declaration.kind}</span><strong>${portName(port)}</strong>${connections}</div>${boundaryAllowed ? `<button type="button" data-boundary-port="${port}" data-direction="${declaration.direction}">${declaration.direction === 'in' ? 'Add source' : 'Add sink branch'}</button>` : ''}</div>`;
  }

  function recipeGroup(title, streams) {
    return `<div class="recipe-group"><h4>${title}</h4>${Object.entries(streams).map(([port, stream]) => `<div class="recipe-flow"><strong>${portName(port)}</strong><span class="species">${formatStream(stream)}</span></div>`).join('')}</div>`;
  }

  function formatStream(stream) {
    if (!stream) return '—';
    if (stream.kind === 'material') {
      const kg = FlowsheetModel.streamMassKg(stream);
      return `${formatNumber(kg)} kg/day · ${formatNumber(kg * 365 / 1000)} t/year`;
    }
    if (stream.kind === 'consumable') return `${formatNumber(stream.amount)} ${stream.unit}`;
    return `${formatNumber(stream.kWh)} kWh/day${stream.kind === 'heat' ? ` @ ${stream.T_C}°C` : ''}`;
  }

  function formatNumber(value) { return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function economicsRows(current) {
    const params = current.params || {};
    if (current.unit === 'grid-electricity') return [
      ['Electricity price', `$${formatNumber(params.pricePerMWh)}/MWh`],
      ['Annual energy bill', formatMoney(current.rate * 365 / 1000 * params.pricePerMWh)],
      ['Annual operational CO₂', `${formatNumber(current.rate * 365 / 1000 * params.kgCO2PerMWh)} kg`],
    ];
    if (['battery', 'thermal-storage'].includes(current.unit)) return [
      ['Installed storage CAPEX', formatMoney(current.capacity * params.capexPerKWh)],
      ['Conversion loss', `${formatNumber((1 - params.efficiency) * 100)}%`],
    ];
    if (!Number.isFinite(params.capacityKW) || !Number.isFinite(params.capexPerKW)) return [];
    const annualEnergy = current.rate * 365;
    const rate = Number(params.discountRate ?? 0.07);
    const years = Number(params.lifeYears ?? 30);
    const crf = rate === 0 ? 1 / years : rate * (1 + rate) ** years / ((1 + rate) ** years - 1);
    const capex = params.capacityKW * params.capexPerKW;
    const annualCost = capex * crf + params.capacityKW * Number(params.fixedOMPerKWYear || 0);
    const levelized = annualEnergy ? annualCost / (annualEnergy / 1000) + Number(params.variableCostPerMWh || 0) : 0;
    return [
      ['Installed CAPEX', formatMoney(capex)],
      [current.unit === 'solar-thermal' ? 'Simple LCOH' : 'Simple LCOE', `$${formatNumber(levelized)}/MWh`],
    ];
  }
  function formatMoney(value) { return `$${formatNumber(value)}`; }
  function metricRows(rows) { return rows.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join(''); }

  window.__FLOWSHEET_APP__ = {
    graph, setpoints, addNode, choosePort, clearFactory, autoArrange, toggleCanvasFocus,
    completeBoundaries, loadMethaneRecycle, loadCoastalMethane, loadAbundanceHub, loadDemoNetwork,
    addCurrentPlant, openNetworkPlant, clearNetwork, replaceUnit, bindLocation,
    saveNamed, loadNamed, captureBaseline, clearBaseline,
    solve: solveAndRender, get result() { return result; }, get baseline() { return baseline; },
    get economics() { return currentEconomics; }, get site() { return site; }, get network() { return networkResult; },
    projectEconomics, setCanvasZoom, get canvasZoom() { return canvasZoom; },
  };
  refreshSaveOptions();
  const savedNetwork = readJson(NETWORK_KEY) || readJson(LEGACY_EMPIRE_KEY);
  if (savedNetwork?.plants) network = { plants: savedNetwork.plants, corridors: savedNetwork.corridors || [] };
  if (network.plants.length) {
    refreshNetwork();
    if (storage && !readJson(NETWORK_KEY) && readJson(LEGACY_EMPIRE_KEY)) {
      try {
        storage.setItem(NETWORK_KEY, JSON.stringify({ plants: network.plants, corridors: network.corridors }));
        storage.removeItem(LEGACY_EMPIRE_KEY);
      } catch { /* ignore */ }
    }
  }
  if (restoreSnapshot(readJson(AUTOSAVE_KEY))) solveAndRender();
  else render();
})();
