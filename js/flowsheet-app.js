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
  const NODE_WIDTH = 220;
  const COLUMN_GAP = 120;
  let selectedNodeId = null;
  let pendingPort = null;
  let result = null;
  let currentEconomics = null;
  let baseline = null;
  let canvasZoom = 1;
  let solveError = '';
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
      palette: { section: 'building', order: 5, glyph: 'CO₂', tone: 'carbon', description: 'Gas + power + heat + consumables' },
      params: { captureFraction: 0.9, electricityKWhPerKgCO2: 0.5, heatKWhPerKgCO2: 1.5, minHeatT_C: 80, consumablesPerKgCO2: 0.02, wasteHeatT_C: 40 },
      presets: {
        solid: { label: 'Solid sorbent', params: { captureFraction: 0.9, electricityKWhPerKgCO2: 0.5, heatKWhPerKgCO2: 1.5, minHeatT_C: 80, consumablesPerKgCO2: 0.02, wasteHeatT_C: 40 } },
        koh: { label: 'KOH + calcium looping', params: { captureFraction: 0.75, electricityKWhPerKgCO2: 0.366, heatKWhPerKgCO2: 2.45, minHeatT_C: 900, consumablesPerKgCO2: 0.01, wasteHeatT_C: 100 } },
        electroSwing: { label: 'Electro-swing adsorption', params: { captureFraction: 0.5, electricityKWhPerKgCO2: 0.45, heatKWhPerKgCO2: 0, minHeatT_C: 20, consumablesPerKgCO2: 0.005, wasteHeatT_C: 30 } },
      },
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
        { label: 'Voskian & Hatton 2019', url: 'https://doi.org/10.1039/C9EE02412C' },
      ],
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
    'electrical-bus': { label: 'Electricity bus', palette: { section: 'utility', order: 1, glyph: '⚡↗', description: 'One supply → many blocks' } },
    'material-splitter': { label: 'Material splitter', palette: { section: 'utility', order: 2, glyph: 'M↗', tone: 'water', description: 'One stream → many branches' } },
    'material-mixer': { label: 'Material mixer', palette: { section: 'utility', order: 3, glyph: '↘M', tone: 'water', description: 'Many streams → one output' } },
    'material-sink': { label: 'Material sink', palette: { section: 'utility', order: 9, glyph: '↓', description: 'Capture, store, sell, or discard' } },
    'heat-sink': { label: 'Heat sink', palette: { section: 'utility', order: 10, glyph: '↓H', tone: 'carbon', description: 'Reject or recover process heat' } },
    'electricity-sink': { label: 'Electricity sink', palette: { section: 'utility', order: 11, glyph: '↓⚡', description: 'Export or curtail electricity' } },
  };
  const portNames = {
    air: 'Feed gas', electricity: 'Electricity', heat: 'Process heat', consumables: 'Consumables',
    capturedCo2: 'Captured CO₂', depletedAir: 'Depleted gas', feed: 'Feed water', product: 'Fresh water',
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
  document.getElementById('loadAbundanceHub').addEventListener('click', loadAbundanceHub);
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
    if (kind === 'source') configureNewSource(current, options.preset);
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

  function configureNewSource(current, preset) {
    if (current.unit === 'material-source') {
      current.sourcePreset = preset || 'air';
      current.rate = current.sourcePreset === 'air' ? 25000 : 100;
    } else if (current.unit === 'electricity-source' || current.unit === 'grid-electricity') current.rate = 1000;
    else if (current.unit === 'heat-source') { current.rate = 100; current.temperature = 100; }
    else if (current.unit === 'solar-pv' || current.unit === 'nuclear-electricity' || current.unit === 'solar-thermal') current.rate = 0;
    else current.rate = 10;
    updateSourceStream(current);
  }

  function positionFor(kind, index) {
    if (kind === 'source') return { x: 40, y: 40 + index * 150 };
    if (kind === 'sink') return { x: 1120, y: 40 + index * 150 };
    return { x: 370 + (index % 2) * 360, y: 40 + Math.floor(index / 2) * 200 };
  }

  function updateSourceStream(current) {
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
    if (current.unit === 'consumable-source') current.params.stream = { kind: 'consumable', amount: current.rate, unit: 'kg/day', label: 'Sorbent makeup' };
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
    solveAndRender();
  }

  function loadMethaneRecycle() {
    loadCase(SabatierCase.createSabatierCase({ recycleWater: true }), 'sabatier');
  }

  function loadAbundanceHub() {
    loadCase(AbundanceCase.createAbundanceCase(), 'minerals');
  }

  function loadCase(definition, selection) {
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

  function snapshot() {
    return { version: 1, graph, setpoints, selectedNodeId, projectEconomics, canvasZoom };
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

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function graphCaseSnapshot() {
    return { graph: clone(graph), operation: { setpoints: clone(setpoints) }, economics: clone(projectEconomics) };
  }

  function evaluateEconomics(graphCase, solved) {
    const evaluator = window.FlowsheetEconomics?.evaluateEconomics;
    if (typeof evaluator !== 'function' || !solved) return null;
    try { return evaluator(graphCase, solved) || null; } catch { return null; }
  }

  function captureBaseline() {
    baseline = { graphCase: graphCaseSnapshot(), solved: result ? clone(result) : null, economics: currentEconomics ? clone(currentEconomics) : null };
    renderComparison();
    return true;
  }

  function clearBaseline() {
    baseline = null;
    renderComparison();
  }

  function numberAt(value, paths) {
    for (const path of paths) {
      const candidate = path.split('.').reduce((current, key) => current?.[key], value);
      if (Number.isFinite(candidate)) return candidate;
    }
    return null;
  }

  function sumNumbers(value, exclude = []) {
    if (Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object') return null;
    const values = Object.entries(value)
      .filter(([key, entry]) => !exclude.includes(key) && Number.isFinite(entry))
      .map(([, entry]) => entry);
    return values.length ? values.reduce((sum, entry) => sum + entry, 0) : null;
  }

  function economicsSummary(value) {
    const economics = value?.economics || value;
    if (!economics || typeof economics !== 'object') return null;
    const revenueBreakdown = economics.revenue;
    const summary = {
      capex: numberAt(economics, ['totalCapex', 'installedCapex', 'capex', 'CAPEX']),
      revenue: numberAt(economics, ['totalAnnualRevenue', 'annualRevenue', 'annual.revenue'])
        ?? sumNumbers(revenueBreakdown, ['policyCredits', 'total']),
      cost: numberAt(economics, ['annualCost', 'annualOperatingCost', 'totalAnnualCost', 'annualCosts', 'annual.cost', 'costs.total']),
      netCash: numberAt(economics, ['annualNetCash', 'annualNetCashFlow', 'annualOperatingCashFlow', 'annualProfit', 'annual.netCash']),
      npv: numberAt(economics, ['npv', 'NPV']),
      irr: numberAt(economics, ['irr', 'projectIrr', 'equityIrr', 'IRR']),
      purchases: numberAt(economics, ['annualSourcePurchases', 'sourcePurchases.total', 'purchases.total', 'breakdown.sourcePurchases'])
        ?? sumNumbers(economics.sourcePurchases || economics.purchases),
      disposal: numberAt(economics, ['annualDisposalCost', 'disposalCost', 'disposal.total', 'disposals.total', 'breakdown.disposalCost'])
        ?? sumNumbers(economics.disposal || economics.disposals),
      productRevenue: numberAt(economics, ['annualProductRevenue', 'productRevenue', 'revenue.products', 'breakdown.productRevenue'])
        ?? sumNumbers(revenueBreakdown, ['policyCredits', 'total']),
    };
    return Object.values(summary).some(Number.isFinite) ? summary : null;
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
    return `${formatNumber(Math.abs(value) <= 1 ? value * 100 : value)}%`;
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

    const baselineEconomics = baseline.economics
      || evaluateEconomics(baseline.graphCase, baseline.solved);
    const current = economicsSummary(currentEconomics);
    const previous = economicsSummary(baselineEconomics);
    if (!current || !previous) {
      status.textContent = result ? 'Economics unavailable — load the optional economics adapter.' : 'Current graph is incomplete.';
      metrics.innerHTML = '';
      ledger.innerHTML = '';
      return;
    }
    status.textContent = 'Current graph compared with captured baseline';
    const rows = [
      ['CAPEX', current.capex, previous.capex, formatMoney],
      ['Annual revenue', current.revenue, previous.revenue, formatMoney],
      ['Annual cost', current.cost, previous.cost, formatMoney],
      ['Annual net cash', current.netCash, previous.netCash, formatMoney],
      ['NPV', current.npv, previous.npv, formatMoney],
      ['IRR', current.irr, previous.irr, formatRate],
    ];
    metrics.innerHTML = rows.map(([label, value, oldValue, format]) => {
      const delta = label === 'IRR' && Number.isFinite(value) && Number.isFinite(oldValue)
        ? (Math.abs(value) <= 1 ? value * 100 : value) - (Math.abs(oldValue) <= 1 ? oldValue * 100 : oldValue)
        : deltaValue(value, oldValue);
      const direction = ['Annual revenue', 'Annual net cash', 'NPV', 'IRR'].includes(label) ? delta : -delta;
      const cls = direction > 0 ? 'positive' : direction < 0 ? 'negative' : '';
      const deltaLabel = label === 'IRR' ? formatDelta(delta, value => `${formatNumber(delta)} pp`) : formatDelta(delta, format);
      return `<div><dt>${label}</dt><dd class="${cls}">${Number.isFinite(value) ? format(value) : '—'} <small>${deltaLabel}</small></dd></div>`;
    }).join('');
    // ponytail: annual aggregate ledger; add per-stream provenance when economics exposes it.
    const synergies = [
      ['Avoided source purchases', deltaValue(previous.purchases, current.purchases)],
      ['Avoided disposal', deltaValue(previous.disposal, current.disposal)],
      ['Additional product revenue', deltaValue(current.productRevenue, previous.productRevenue)],
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
      const source = addNode(`${kind}-source`, { preset: suggestedPreset(current.unit, target.port), silent });
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
    if (event.target.name === 'processPreset') {
      current.processPreset = event.target.value;
      if (current.processPreset !== 'custom') Object.assign(current.params, catalog[current.unit].presets[current.processPreset].params);
      if (units[current.unit].kind === 'source') updateSourceStream(current);
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
      'dac.air': 'air', 'asu.air': 'air', 'swro.feed': 'seawater', 'med.feed': 'seawater', 'msf.feed': 'seawater', 'brine-minerals.brine': 'brine',
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
        result = FlowsheetSolver.solveOperation({ graph, operation: { setpoints } });
        currentEconomics = evaluateEconomics(graphCaseSnapshot(), result);
        solveError = '';
      } catch (error) { solveError = error.message; }
    }
    persistAutosave();
    render();
  }

  function missingConnections() {
    const missing = [];
    for (const current of graph.nodes) {
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

  function render() { renderGraph(); renderStatus(); renderInspector(); renderEconomics(); renderComparison(); }

  function renderGraph() {
    renderCanvasZoom();
    if (!graph.nodes.length) {
      canvas.classList.add('empty');
      canvas.innerHTML = '<p class="empty-canvas">Add a process block or source to begin.</p>';
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
    if (current.unit === 'dac' && limit === 'feed') return 'air';
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
    document.getElementById('diagramTitle').textContent = graph.nodes.length ? 'Factory canvas' : 'Blank factory';
    solveStatus.textContent = !graph.nodes.length ? 'Empty factory' : result ? 'Factory running' : 'Factory incomplete';
    solveStatus.className = `status-chip${result ? ' good' : missing.length || solveError ? ' warn' : ''}`;
    balanceStatus.textContent = result ? (result.balances.maxAbsResidual < 1e-8 ? 'Balances closed' : 'Check balances') : pendingPort ? 'Choose compatible port' : 'Manual setpoints';
    balanceStatus.className = `status-chip${result?.balances.maxAbsResidual < 1e-8 ? ' good' : ''}`;
    const warning = document.getElementById('warnings');
    warning.hidden = !solveError && !pendingPort && missing.length === 0 && bottlenecks.length === 0;
    warning.textContent = solveError || (pendingPort ? `Connecting ${node(pendingPort.node).label} · ${portName(pendingPort.port)} — choose a compatible ${pendingPort.direction === 'out' ? 'input' : 'output'}.` : missing.length ? `Connect ${missing.slice(0, 4).join(' · ')}${missing.length > 4 ? ` · +${missing.length - 4} more` : ''}` : bottlenecks.length ? `Bottleneck: ${bottlenecks.join(' · ')}` : '');
  }

  function renderInspector() {
    const current = node(selectedNodeId);
    if (!current) {
      document.getElementById('inspectorTitle').textContent = 'Nothing selected';
      document.getElementById('inspectorKind').textContent = 'Select a block to configure it.';
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
    ] : [];
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
      const parameters = (definition.controls || []).map(control => `<label>${control.label} <output>${formatNumber(current.params[control.key])}${control.unit ? ` ${control.unit}` : ''}</output></label><input name="processParameter" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current.params[control.key]}">`).join('');
      const references = (definition.references || []).map(reference => `<a href="${reference.url}" target="_blank" rel="noreferrer">${reference.label}</a>`).join(' · ');
      return `<fieldset><legend>Independent setpoint</legend><label>Requested rate <output>${formatNumber(setpoints[current.id])} ${definition.activityUnit}</output></label><input name="requestedRate" type="range" min="0" max="${current.capacity}" step="1" value="${setpoints[current.id]}"></fieldset>${preset || parameters ? `<fieldset><legend>Process assumptions</legend>${preset}${parameters}${references ? `<p class="literature-links">Basis: ${references}</p>` : ''}</fieldset>` : ''}${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete block</button>`;
    }
    if (kind === 'source') {
      const definition = catalog[current.unit];
      const max = definition.manualRateMax || (current.unit === 'material-source' ? 100000 : current.unit === 'electricity-source' ? 10000 : current.unit === 'heat-source' ? 1000 : 100);
      const unit = definition.sourceUnit || (current.unit === 'material-source' || current.unit === 'consumable-source' ? 'kg/day' : 'kWh/day');
      const preset = current.unit === 'material-source' ? `<label>Material</label><select name="sourcePreset">${Object.entries(materialPresets).map(([id, item]) => `<option value="${id}"${id === current.sourcePreset ? ' selected' : ''}>${item.label}</option>`).join('')}</select>` : '';
      const temperature = current.unit === 'heat-source' ? `<label>Temperature <output>${current.temperature} °C</output></label><input name="heatTemperature" type="range" min="20" max="1000" step="5" value="${current.temperature}">` : '';
      const processPreset = definition.presets ? `<label>Technology</label><select name="processPreset">${Object.entries(definition.presets).map(([id, item]) => `<option value="${id}"${id === current.processPreset ? ' selected' : ''}>${item.label}</option>`).join('')}<option value="custom"${current.processPreset === 'custom' ? ' selected' : ''}>Custom</option></select>` : '';
      const parameters = (definition.controls || []).map(control => `<label>${control.label} <output>${formatNumber(current.params[control.key])}${control.unit ? ` ${control.unit}` : ''}</output></label><input name="sourceParameter" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current.params[control.key]}">`).join('');
      const references = (definition.references || []).map(reference => `<a href="${reference.url}" target="_blank" rel="noreferrer">${reference.label}</a>`).join(' · ');
      const rate = definition.controls && !definition.manualRateMax
        ? `<p class="status-meta">Available: ${formatNumber(current.rate)} ${unit}</p>`
        : `<label>Available rate <output>${formatNumber(current.rate)} ${unit}</output></label><input name="sourceRate" type="range" min="0" max="${max}" step="${max / 100}" value="${current.rate}">`;
      return `<fieldset><legend>Source settings</legend>${preset}${processPreset}${rate}${temperature}${parameters}${definition.economicsNote ? `<p class="status-meta">${definition.economicsNote}</p>` : ''}${references ? `<p class="literature-links">Basis: ${references}</p>` : ''}</fieldset>${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete source</button>`;
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
      status.textContent = result ? 'Economics adapter unavailable.' : 'Complete the graph to calculate viability.';
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
    if (stream.kind === 'material') return `${formatNumber(FlowsheetModel.streamMassKg(stream))} kg/day`;
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
    completeBoundaries, loadMethaneRecycle, loadAbundanceHub, saveNamed, loadNamed, captureBaseline, clearBaseline,
    solve: solveAndRender, get result() { return result; }, get baseline() { return baseline; },
    get economics() { return currentEconomics; }, projectEconomics, setCanvasZoom, get canvasZoom() { return canvasZoom; },
  };
  refreshSaveOptions();
  if (restoreSnapshot(readJson(AUTOSAVE_KEY))) solveAndRender();
  else render();
})();
