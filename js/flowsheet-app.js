(() => {
  const canvas = document.getElementById('flowsheetCanvas');
  const inspector = document.querySelector('.inspector-sidebar');
  const units = FlowsheetUnits.UNITS;
  const {
    classifyQuality,
    formatUncertainMoney,
    formatUncertainNumber,
    qualityChip,
    rightsChip,
    citeFrom,
    unverifiedRightsWarnings,
    RIGHT_KEYS,
    parseBand,
    citeMarkup,
  } = FlowsheetUncertainty;
  const FREIGHT_CITES = [
    { label: 'UNCTAD transport costs', url: 'https://unctad.org/publication/trade-and-transport-dataset' },
    { label: 'World Bank freight logistics', url: 'https://documents1.worldbank.org/curated/en/620801468168857019/pdf/558370PUB0cost1C0disclosed071221101.pdf' },
  ];
  const graph = { nodes: [], edges: [] };
  const setpoints = {};
  const projectEconomics = { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 };
  const counts = {};
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const AUTOSAVE_KEY = 'molecular-foundry.autosave.v1';
  const SAVES_KEY = 'molecular-foundry.saves.v1';
  const NETWORK_KEY = 'molecular-foundry.network.v1';
  const LEGACY_NETWORK_KEY = 'molecular-foundry.empire.v1';
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
  let lastSizing = null;

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
      sourceNote: 'Default 3.5 kWh/m³ is a plant-level SEC in the Elimelech & Phillip 2011 3–4 kWh/m³ band (RO stage plus intake, pretreatment, posttreatment, and brine discharge). Recovery 0.45 is the low end of the 45–55% range in which most SWRO plants operate. Ghaffour et al. 2013 reports the same 3–4 kWh/m³ SWRO plant band with energy recovery.',
      references: [
        { label: 'Elimelech & Phillip 2011', url: 'https://doi.org/10.1126/science.1200488' },
        { label: 'Ghaffour et al. 2013', url: 'https://doi.org/10.1016/j.apenergy.2012.12.073' },
      ],
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
      sourceNote: 'Default 2 kWh/m³ electricity and 60 kWhₜₕ/m³ heat sit in the Ghaffour et al. 2013 MED band (1.5–2.5 kWh/m³ e; 145–390 MJ/m³ ≈ 40–108 kWhₜₕ/m³). Recovery 0.35 is a typical MED ratio in that review family.',
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
      sourceNote: 'Default 3.5 kWh/m³ electricity and 80 kWhₜₕ/m³ heat sit in the Ghaffour et al. 2013 MSF band (3–5 kWh/m³ e; 250–330 MJ/m³ ≈ 69–92 kWhₜₕ/m³). Recovery 0.25 is a typical MSF ratio in that review family.',
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
      sourceNote: 'Alkaline default 52 kWh/kg H₂ is a system-level SEC in the Buttler & Spliethoff 2018 commercial alkaline band (~4.5–5.0 kWh/Nm³ ≈ 50–56 kWh/kg). PEM preset 55 kWh/kg is the same survey’s PEM typical. Engine and Sabatier fallbacks match alkaline.',
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
      sourceNote: 'Screening assumption in the IEA DAC 2022 solid-sorbent family, not a plant quote. Electricity 0.5 kWh/kg CO₂ = 1.8 GJ/t; heat 1.5 kWh/kg CO₂ = 5.4 GJ/t (×3.6 MJ/kWh). Combined 7.2 GJ/t sits at the low end of IEA S-DAC 7.2–9.5 GJ/t with a 25/75 electricity/heat split. Capture fraction 0.9 and amine makeup 0.02 kg/kg CO₂ are screening, not IEA table values.',
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
      sourceNote: 'Screening assumption in the IEA DAC 2022 solid-sorbent family, not a plant quote. Electricity 0.5 kWh/kg CO₂ = 1.8 GJ/t; heat 1.5 kWh/kg CO₂ = 5.4 GJ/t (×3.6 MJ/kWh). Combined 7.2 GJ/t sits at the low end of IEA S-DAC 7.2–9.5 GJ/t with a 25/75 electricity/heat split. Capture fraction 0.9 and amine makeup 0.02 kg/kg CO₂ are screening, not IEA table values.',
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
      sourceNote: 'Keith et al. 2018 Carbon Engineering process. Heat 2.45 kWh/kg CO₂ = 8.82 GJ/t from Scenario A (8.81 GJ/t NG; 8.81/3.6 = 2.447 kWh/kg). Electricity 0.366 kWh/kg CO₂ = 366 kWh/t = 1.32 GJ/t from Scenario C purchased power. Mixed-scenario vectors, not one Keith plant configuration. Capture fraction 0.75 is Keith et al. 2018 Table 1 74.5% rounded. KOH makeup 0.01 kg/kg CO₂ is screening, not a Keith table value.',
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
      sourceNote: 'Voskian & Hatton 2019 cell work 40–90 kJ/mol CO₂ (0.25–0.57 kWh/kg at 44.01 g/mol). Default 0.45 kWh/kg sits in that range (~71 kJ/mol). No heat. Balance-of-plant (fans, compression) is not included. Capture fraction 0.5 and electrode makeup 0.005 kg/kg CO₂ are screening, not Voskian table values.',
      references: [{ label: 'Voskian & Hatton 2019', url: 'https://doi.org/10.1039/C9EE02412C' }],
    },
    sabatier: {
      label: 'Sabatier', capacity: 100, rate: 5, activityUnit: 'kg CH₄/day',
      palette: { section: 'building', order: 6, glyph: 'CH₄', tone: 'methane', description: 'CO₂ + H₂ → methane' },
      params: { electricityKWhPerKgCH4: 1 },
      sourceNote: 'Default 1 kWh/kg CH₄ is a screening ancillary load in a 0.4–1.5 kWh/kg band, not electrolysis. Zapf (via Baier et al. 2018) gives 0.4 kWh/m³ SNG to heat the 1:4 CO₂/H₂ feed to 300 °C (~0.56 kWh/kg at 0.717 kg/m³). Compression and recycle sit above that heat-up; 1 kWh/kg is in-band screening, not a plant quote.',
      references: [{ label: 'Baier et al. 2018 (citing Zapf 2017)', url: 'https://doi.org/10.3389/fenrg.2018.00005' }],
    },
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
    // NREL ATB 2024 utility-scale PV, base-year CF table, Resource Class 8: mean AC CF 24.5% (GHI bin 4–4.25 kWh/m²/day, ILR=1.34). Catalog default 0.24 is that class rounded. CAPEX 1560 kept.
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
      sourceNote: 'NREL ATB 2024 utility-scale PV Resource Class 8 mean AC CF is 24.5% (GHI bin 4–4.25 kWh/m²/day, ILR=1.34); catalog default 0.24 is that class rounded. 2024 ATB base-year CF table. CAPEX 1560 unchanged.',
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
  document.getElementById('sizeToTarget').addEventListener('click', () => {
    const target = Number(document.getElementById('sizeTargetCh4').value);
    try {
      sizeCoastalToMethane(target, site?.month ?? 0);
    } catch {
      /* sizeCoastalToMethane writes the status line */
    }
  });
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
    lastSizing = null;
    loadCase(CoastalCase.createCoastalCase(month), 'sabatier');
  }

  function formatSizingResidual(value) {
    const residual = Number(value);
    if (!Number.isFinite(residual)) return '—';
    if (residual === 0) return '0';
    if (residual < 1e-4) return residual.toExponential(2);
    return residual.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  function sizeCoastalToMethane(target, month = 0, opts = {}) {
    const status = document.getElementById('sizeToTargetStatus');
    if (!globalThis.FlowsheetSize?.sizeCoastalToMethane) {
      if (status) status.textContent = 'Sizing engine is not loaded.';
      throw new Error('Sizing engine is not loaded');
    }
    if (!Number.isFinite(target) || target < 0) {
      if (status) status.textContent = 'Methane target must be a non-negative kg/day.';
      throw new Error('Methane target must be a non-negative kg/day');
    }
    try {
      lastSizing = FlowsheetSize.sizeCoastalToMethane(target, month, opts);
      loadCase(lastSizing.definition, 'sabatier');
      return lastSizing;
    } catch (error) {
      lastSizing = null;
      if (status) status.textContent = error.message;
      throw error;
    }
  }

  function refreshSiteElectricity() {
    if (!site?.resources?.electricity) return;
    const hours = FlowsheetSolver.hourlyProfile?.(site);
    const daily = hours ? hours.reduce((sum, value) => sum + value, 0) : Number(site.dailyPVKWhPerKWp) || 0;
    const kWh = daily * Number(site.solarKWp || 0);
    site.resources.electricity.stream = { kind: 'electricity', kWh };
    site.dailyPVKWhPerKWp = daily;
    if (site.meteo) {
      const monthly = site.meteo.monthlyPVKWhPerKWp;
      const fromMonth = Array.isArray(monthly) ? monthly[site.month || 0] : null;
      site.meteo.dailyPVKWhPerKWp = hours ? daily : (fromMonth || daily);
    }
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
    site.meteo = {
      dailyPVKWhPerKWp: daily,
      monthlyPVKWhPerKWp: site.meteo?.monthlyPVKWhPerKWp,
      quality: 'cited',
      source: solar?.database || site.meteo?.source || 'PVGIS',
      cite: solar?.url
        ? { label: `${solar.database || 'PVGIS'} typical-day solar`, url: solar.url }
        : site.meteo?.cite,
    };
    if (!site.rights) {
      site.rights = {
        gridImport: { status: 'unverified', note: 'Unverified grid access; zero authorized imports' },
        freshwater: { status: 'unverified', note: 'Unverified freshwater access; zero authorized supply' },
        seawaterIntake: { status: 'unverified', note: 'No seawater intake permit verified' },
        brineConcession: { status: 'unverified', note: 'No brine or mineral concession verified' },
        saltPurchase: { status: 'unverified', note: 'No salt purchase agreement verified' },
      };
    }
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
    const siteRightWarnings = unverifiedRightsWarnings?.(site) || [];
    warning.hidden = !solveError && !routeNote && !pendingPort && missing.length === 0 && bottlenecks.length === 0 && siteRightWarnings.length === 0;
    warning.textContent = solveError || routeNote || (pendingPort ? `Connecting ${node(pendingPort.node).label} · ${portName(pendingPort.port)} — choose a compatible ${pendingPort.direction === 'out' ? 'input' : 'output'}.` : missing.length ? `Connect ${missing.slice(0, 4).join(' · ')}${missing.length > 4 ? ` · +${missing.length - 4} more` : ''}` : bottlenecks.length ? `Bottleneck: ${bottlenecks.join(' · ')}` : siteRightWarnings.length ? siteRightWarnings.join(' · ') : '');
  }

  function footprintColor(unit) {
    return {
      electrolyzer: 'var(--h2)',
      dac: 'var(--co2)',
      'dac-solid': 'var(--co2)',
      'dac-liquid': 'var(--co2)',
      'dac-electroswing': 'var(--co2)',
      sabatier: 'var(--methane)',
      methanol: 'var(--methane)',
      swro: 'var(--electric)',
      med: 'var(--electric)',
      msf: 'var(--electric)',
      desal: 'var(--electric)',
      'brine-minerals': 'var(--warning)',
      asu: 'var(--h2)',
      ammonia: 'var(--h2)',
      battery: 'var(--text-muted)',
    }[unit] || 'var(--border-light)';
  }

  function formatHa(ha) {
    const value = Number(ha) || 0;
    if (value >= 1) return `${formatNumber(value)} ha`;
    if (value >= 0.001) return `${value.toLocaleString('en-US', { maximumFractionDigits: 3 })} ha`;
    if (value > 0) return `${formatNumber(value * 10000)} m²`;
    return '0 ha';
  }

  function footprintBarSvg(footprint) {
    const total = footprint.totalAreaM2;
    if (!(total > 0)) return '';
    const width = 160;
    const height = 12;
    const solarShare = footprint.solar.landAreaM2 / total;
    let x = solarShare * width;
    const solarRect = `<rect x="0" y="0" width="${Math.max(0, x)}" height="${height}" fill="var(--warning)" opacity="0.9"></rect>`;
    const padRects = footprint.processes.map(item => {
      const w = Math.max(item.areaM2 / total * width, footprint.processes.length ? 1.2 : 0);
      const rect = `<rect x="${x}" y="0" width="${w}" height="${height}" fill="${footprintColor(item.unit)}" opacity="0.95"></rect>`;
      x += w;
      return rect;
    }).join('');
    return `${solarRect}${padRects}`;
  }

  function renderSiteFootprint() {
    const panel = document.getElementById('siteFootprint');
    const metrics = document.getElementById('siteFootprintMetrics');
    const pads = document.getElementById('siteFootprintPads');
    const note = document.getElementById('siteFootprintNote');
    const svg = document.getElementById('siteFootprintSvg');
    if (!panel || !FlowsheetFootprint) return;
    if (!site) {
      panel.hidden = true;
      if (metrics) metrics.innerHTML = '';
      if (pads) pads.innerHTML = '';
      if (note) note.textContent = '';
      if (svg) svg.innerHTML = '';
      return;
    }
    const footprint = FlowsheetFootprint.estimateFootprint({ site, graph, solved: result });
    const hasArea = footprint.totalAreaM2 > 0;
    panel.hidden = !hasArea;
    if (!hasArea) {
      if (metrics) metrics.innerHTML = '';
      if (pads) pads.innerHTML = '';
      if (note) note.textContent = '';
      if (svg) svg.innerHTML = '';
      return;
    }
    if (svg) svg.innerHTML = footprintBarSvg(footprint);
    if (metrics) {
      const landQuality = classifyQuality({ kind: 'land' });
      const padQuality = classifyQuality({ kind: 'intensity', sourceNote: 'order-of-magnitude screening' });
      metrics.innerHTML = metricRows([
        ['Solar land', `${formatUncertainHa(footprint.solar.ha)} · ${formatUncertainNumber(footprint.solar.acres, landQuality)} acres`, { quality: landQuality }],
        ['GCR', `${formatUncertainNumber(footprint.solar.gcr * 100, landQuality)}% (base ${formatUncertainNumber(footprint.solar.baseGcr * 100, landQuality)}%)`, { quality: landQuality }],
        ['Panel area', `${formatUncertainNumber(footprint.solar.panelAreaM2, landQuality)} m²`, { quality: landQuality }],
        ['Process pads', `${formatUncertainNumber(footprint.processAreaM2, padQuality)} m²`, { quality: padQuality }],
        ['Total', `${formatUncertainHa(footprint.totalHa)} · ${formatUncertainNumber(footprint.totalAcres, landQuality)} acres`, { quality: landQuality }],
      ]);
    }
    if (pads) {
      pads.innerHTML = footprint.processes
        .map(item => `<li><span class="pad-swatch" style="background:${footprintColor(item.unit)}"></span>${item.label} · ${formatNumber(item.areaM2)} m²</li>`)
        .join('');
    }
    if (note) {
      note.textContent = 'Process pads are order-of-magnitude screening, not equipment layouts. Solar land is panel area ÷ location-aware GCR.';
    }
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
    document.getElementById('siteHorizon').textContent = hours
      ? `${hours.filter(entry => entry.pv > 0).length} daylight hours · ${hours.filter(entry => entry.pv === 0).length} night hours · peak ${formatNumber(Math.max(...hours.map(entry => entry.pv)))} kWh PV · battery ${formatNumber(site?.storage?.batteryKWh || 0)} kWh`
      : '';
    renderSiteFootprint();
    renderSiteTruth();
    document.getElementById('siteResources').innerHTML = Object.entries(site?.resources || {}).map(([id, resource]) => {
      const quality = resource.quality || 'user-assumption';
      const chip = quality === 'unverified'
        ? rightsChip('unverified')
        : qualityChip({ quality, sourceNote: resource.evidence });
      return `<div class="${quality === 'unverified' ? 'unverified' : ''}"><dt>${id}${chip}</dt><dd>${formatStream(resource.stream)}</dd></div>`;
    }).join('');
    document.getElementById('siteEvidence').innerHTML = (site?.evidence || []).map(item => (
      item.url ? `<a href="${item.url}" target="_blank" rel="noreferrer">${item.label}</a>` : item.label
    )).join(' · ');
    const sizeStatus = document.getElementById('sizeToTargetStatus');
    if (sizeStatus) {
      if (lastSizing) {
        const iters = lastSizing.iterations;
        const capNote = lastSizing.history?.some(step => step.capped) ? ' · cap-limited' : '';
        const convergeNote = lastSizing.converged ? '' : ' · not converged';
        const unverified = (lastSizing.warnings || lastSizing.solved?.warnings || [])
          .filter(message => String(message).includes('unverified site right'));
        const rightsNote = unverified.length
          ? ` · ${unverified.length} unverified site right${unverified.length === 1 ? '' : 's'}`
          : '';
        sizeStatus.textContent = `${iters} iteration${iters === 1 ? '' : 's'} · residual ${formatSizingResidual(lastSizing.residual)}${capNote}${convergeNote}${rightsNote}`;
      } else {
        sizeStatus.textContent = 'Demand sizes water, H₂, DAC, and PV. The operating solve stays physics-only.';
      }
    }
  }

  function renderSiteTruth() {
    const meteoEl = document.getElementById('siteMeteo');
    const assayEl = document.getElementById('siteAssay');
    const rightsEl = document.getElementById('siteRights');
    if (meteoEl) {
      const meteo = site?.meteo;
      if (!meteo) meteoEl.innerHTML = '';
      else {
        const quality = classifyQuality({
          kind: 'meteo',
          quality: meteo.quality,
          sourceNote: meteo.cite?.label || meteo.source,
        });
        const daily = Number(meteo.dailyPVKWhPerKWp ?? site.dailyPVKWhPerKWp);
        meteoEl.innerHTML = `<strong>Meteo</strong> ${formatUncertainNumber(daily, quality)} kWh/kWp·day ${qualityChip(quality)}${citeMarkup(citeFrom(meteo.cite))}`;
      }
    }
    if (assayEl) {
      const assay = site?.assay;
      if (!assay) assayEl.innerHTML = '';
      else {
        const quality = classifyQuality({
          kind: 'assay',
          quality: assay.quality,
          sourceNote: assay.summary,
        });
        assayEl.innerHTML = `<strong>Assay</strong> ${assay.summary || assay.kind || ''} ${qualityChip(quality)}${citeMarkup(citeFrom(assay.evidence))}`;
      }
    }
    if (rightsEl) {
      const rights = site?.rights;
      if (!rights) rightsEl.innerHTML = '';
      else {
        const keys = RIGHT_KEYS || Object.keys(rights);
        rightsEl.innerHTML = keys.map(key => {
          const right = rights[key];
          if (!right) return '';
          const cites = citeFrom(right.evidence);
          const title = right.note ? ` title="${right.note.replace(/"/g, '&quot;')}"` : '';
          return `<span class="rights-item"${title}>${key}${rightsChip(right.status)}${citeMarkup(cites)}</span>`;
        }).join('');
      }
    }
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
    const freightQuality = classifyQuality({ kind: 'freight' });
    const landQuality = classifyQuality({ kind: 'land' });
    const moneyQuality = classifyQuality({ kind: 'money' });
    status.textContent = `${networkResult.plants.length} plants · ${formatHa(networkResult.landHa)} site footprint · freight ${formatUncertainMoney(networkResult.freight, freightQuality)}/year`;
    const transferred = networkResult.transferred || new Set();
    plants.innerHTML = networkResult.plants.map(plant => {
      const siteName = plant.definition.site?.name || 'Unspecified site';
      const lead = (networkResult.products || [])
        .filter(item => item.plantId === plant.id && item.tonnesPerYear && !transferred.has(`${item.plantId}:${item.nodeId}`))
        .sort((left, right) => right.tonnesPerYear - left.tonnesPerYear)[0];
      const leadText = lead ? `${lead.substance} · ${formatNumber(lead.tonnesPerYear)} t/year` : 'No sale products';
      const landText = plant.footprint ? `${formatHa(plant.footprint.totalHa)} footprint` : '';
      return `<div class="network-plant"><div class="network-plant-copy"><strong>${plant.name}</strong><small>${siteName}${landText ? ` · ${landText}` : ''}</small><small>${leadText}</small></div><button type="button" data-open-plant="${plant.id}">Open</button></div>`;
    }).join('');
    metrics.innerHTML = metricRows([
      ['CAPEX', formatUncertainMoney(networkResult.installedCapex, moneyQuality), { quality: moneyQuality }],
      ['NPV', formatUncertainMoney(networkResult.npv, moneyQuality), { quality: moneyQuality }],
      ['Net cash', formatUncertainMoney(networkResult.annualNetCash, moneyQuality), { quality: moneyQuality }],
      ['Revenue', formatUncertainMoney(networkResult.annualRevenue, moneyQuality), { quality: moneyQuality }],
      ['Cost', formatUncertainMoney(networkResult.annualOperatingCost, moneyQuality), { quality: moneyQuality }],
      ['Freight', `${formatUncertainMoney(networkResult.freight, freightQuality)}/year`, { quality: freightQuality, references: FREIGHT_CITES }],
      ['Land', formatUncertainHa(networkResult.landHa), { quality: landQuality }],
    ]);
    const ranked = Object.entries(networkResult.slate).sort((left, right) => right[1] - left[1]);
    const peak = ranked[0]?.[1] || 1;
    products.innerHTML = ranked.map(([substance, tonnes], index) => {
      const share = Math.max(6, (tonnes / peak) * 100);
      return `<div class="${index === 0 ? 'lead' : ''}"><dt>${substance}</dt><dd><span class="product-bar" aria-hidden="true"><i style="width:${share}%"></i></span><strong>${formatNumber(tonnes)}</strong> <small>t/year</small></dd></div>`;
    }).join('');
    corridors.innerHTML = networkResult.corridors.length
      ? networkResult.corridors.map(corridor => `<div class="corridor-row">${corridor.substance} · ${formatNumber(corridor.km)} km ${corridor.mode} · ${formatUncertainMoney(corridor.annualFreight, freightQuality)}/year ${qualityChip(freightQuality)}${citeMarkup(FREIGHT_CITES)}</div>`).join('')
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

  function literatureMarkup(definition, unitId) {
    const quality = classifyQuality({
      kind: 'intensity',
      unit: unitId,
      sourceNote: definition.sourceNote,
      references: definition.references,
      economicsNote: definition.economicsNote,
    });
    const chip = qualityChip(quality);
    const references = (definition.references || []).map(reference => `<a href="${reference.url}" target="_blank" rel="noreferrer">${reference.label}</a>`).join(' · ');
    const band = parseBand(definition.sourceNote);
    const bandLine = band
      ? `<p class="status-meta quality-band">Literature range ${formatUncertainNumber(band.low, 'cited')}–${formatUncertainNumber(band.high, 'cited')} ${band.unit}</p>`
      : '';
    const sourceNote = definition.sourceNote
      ? `<p class="status-meta">${chip} ${definition.sourceNote}</p>`
      : (chip ? `<p class="status-meta">${chip}</p>` : '');
    return `${sourceNote}${bandLine}${references ? `<p class="literature-links">Basis: ${references}</p>` : ''}`;
  }

  function controlsFor(current) {
    const kind = units[current.unit].kind;
    if (kind === 'converter') {
      const definition = catalog[current.unit];
      const preset = definition.presets ? `<label>Process type</label><select name="processPreset">${Object.entries(definition.presets).map(([id, item]) => `<option value="${id}"${id === current.processPreset ? ' selected' : ''}>${item.label}</option>`).join('')}<option value="custom"${current.processPreset === 'custom' ? ' selected' : ''}>Custom</option></select>` : '';
      const route = DAC_ROUTES[current.unit] ? `<label>Process route<select name="dacRoute">${Object.entries(DAC_ROUTES).filter(([id]) => current.unit === 'dac' || id !== 'dac').map(([id, label]) => `<option value="${id}"${id === current.unit ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : '';
      const intensityQuality = classifyQuality({
        kind: 'intensity',
        unit: current.unit,
        sourceNote: definition.sourceNote,
        references: definition.references,
      });
      const parameters = (definition.controls || []).map(control => {
        const energy = /kWh|secKWh/i.test(`${control.key} ${control.unit || ''}`);
        const chip = energy ? qualityChip(intensityQuality) : '';
        return `<label>${control.label} <output>${formatNumber(current.params[control.key])}${control.unit ? ` ${control.unit}` : ''}</output>${chip}</label><input name="processParameter" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current.params[control.key]}">`;
      }).join('');
      const hasAssumptions = route || preset || parameters || definition.sourceNote || (definition.references && definition.references.length);
      return `<fieldset><legend>Independent setpoint</legend><label>Requested rate <output>${formatNumber(setpoints[current.id])} ${definition.activityUnit}</output></label><input name="requestedRate" type="range" min="0" max="${current.capacity}" step="1" value="${setpoints[current.id]}"></fieldset>${hasAssumptions ? `<fieldset><legend>Process assumptions</legend>${route}${preset}${parameters}${definition.chemicalId ? `<p class="status-meta">Makeup chemical: ${CONSUMABLE_CHEMICALS[definition.chemicalId] || definition.chemicalId}. Switching routes does not rewrite an existing supply.</p>` : ''}${literatureMarkup(definition, current.unit)}</fieldset>` : ''}${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete block</button>`;
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
      const intensityQuality = classifyQuality({
        kind: 'intensity',
        unit: current.unit,
        sourceNote: definition.sourceNote,
        references: definition.references,
        economicsNote: definition.economicsNote,
      });
      const parameters = (definition.controls || []).map(control => {
        const energy = /kWh|secKWh|capacityFactor/i.test(`${control.key} ${control.unit || ''}`);
        const chip = energy ? qualityChip(intensityQuality) : '';
        return `<label>${control.label} <output>${formatNumber(current.params[control.key])}${control.unit ? ` ${control.unit}` : ''}</output>${chip}</label><input name="sourceParameter" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current.params[control.key]}">`;
      }).join('');
      const rate = definition.controls && !definition.manualRateMax
        ? `<p class="status-meta">Available: ${formatNumber(current.rate)} ${unit}</p>`
        : `<label>Available rate <output>${formatNumber(current.rate)} ${unit}</output></label><input name="sourceRate" type="range" min="0" max="${max}" step="${max / 100 || 0.01}" value="${current.rate}">`;
      const capNote = budget != null ? `<p class="status-meta">${site.resources[current.siteResource]?.evidence || 'Capped by the named site resource. A second block sharing this resource cannot duplicate it.'}</p>` : (site && !current.siteResource ? '<p class="status-meta">Unassigned sources are unverified. They do not become unlimited supply.</p>' : '');
      return `<fieldset><legend>Source settings</legend>${siteResource}${preset}${chemical}${processPreset}${rate}${temperature}${parameters}${capNote}${definition.economicsNote ? `<p class="status-meta">${definition.economicsNote}</p>` : ''}${literatureMarkup(definition, current.unit)}</fieldset>${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete source</button>`;
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
    const moneyQuality = classifyQuality({ kind: 'money' });
    const productQuality = classifyQuality({ kind: 'product-cost' });
    status.textContent = `${currentEconomics.periodDays} operating days/year · illustrative assumptions; edit any source, block, or destination in the inspector.`;
    metrics.innerHTML = metricRows([
      ['Installed CAPEX', formatUncertainMoney(currentEconomics.installedCapex, moneyQuality), { quality: moneyQuality }],
      ['Annual revenue', formatUncertainMoney(currentEconomics.annualRevenue, moneyQuality), { quality: moneyQuality }],
      ['Annual operating cost', formatUncertainMoney(currentEconomics.annualOperatingCost, moneyQuality), { quality: moneyQuality }],
      ['Annual net cash', formatUncertainMoney(currentEconomics.annualNetCash, moneyQuality), { quality: moneyQuality }],
      ['NPV', formatUncertainMoney(currentEconomics.npv, moneyQuality), { quality: moneyQuality }],
      ['IRR', formatRate(currentEconomics.irr), { quality: moneyQuality }],
      ['Levelized delivered cost', currentEconomics.levelizedDeliveredCost == null ? '—' : `${formatUncertainMoney(currentEconomics.levelizedDeliveredCost, productQuality)}/unit`, { quality: productQuality }],
      ...(currentEconomics.sinks || []).filter(sink => sink.disposition === 'sale' && sink.deliveredAmount > 0).map(sink => (
        [`Sold ${sink.id}`, `${formatUncertainNumber(sink.deliveredAmount / 1000, productQuality)} t/year`, { quality: productQuality }]
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
  function formatUncertainHa(ha, quality = classifyQuality({ kind: 'land' })) {
    const value = Number(ha) || 0;
    if (value >= 1) return formatUncertainNumber(value, quality, { unit: 'ha' });
    if (value >= 0.001) return formatUncertainNumber(value, quality, { unit: 'ha' });
    if (value > 0) return formatUncertainNumber(value * 10000, quality, { unit: 'm²' });
    return formatUncertainNumber(0, quality, { unit: 'ha' });
  }
  function economicsRows(current) {
    const params = current.params || {};
    const definition = catalog[current.unit] || {};
    const moneyQuality = classifyQuality({ kind: 'money' });
    if (current.unit === 'grid-electricity') return [
      ['Electricity price', `${formatUncertainMoney(params.pricePerMWh, moneyQuality)}/MWh`, { quality: moneyQuality }],
      ['Annual energy bill', formatUncertainMoney(current.rate * 365 / 1000 * params.pricePerMWh, moneyQuality), { quality: moneyQuality }],
      ['Annual operational CO₂', `${formatUncertainNumber(current.rate * 365 / 1000 * params.kgCO2PerMWh, moneyQuality)} kg`, { quality: moneyQuality }],
    ];
    if (['battery', 'thermal-storage'].includes(current.unit)) return [
      ['Installed storage CAPEX', formatUncertainMoney(current.capacity * params.capexPerKWh, moneyQuality), { quality: moneyQuality }],
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
    const lcoeKind = current.unit === 'solar-thermal' ? 'lcoh' : 'lcoe';
    const lcoeQuality = classifyQuality({
      kind: lcoeKind,
      unit: current.unit,
      sourceNote: definition.sourceNote,
      references: definition.references,
      economicsNote: definition.economicsNote,
    });
    const intensityQuality = classifyQuality({
      kind: 'intensity',
      unit: current.unit,
      sourceNote: definition.sourceNote,
      references: definition.references,
    });
    const lcoeCites = lcoeQuality === 'cited' ? definition.references : [];
    return [
      ['Installed CAPEX', formatUncertainMoney(capex, moneyQuality), { quality: moneyQuality }],
      [
        current.unit === 'solar-thermal' ? 'Simple LCOH' : 'Simple LCOE',
        `${formatUncertainMoney(levelized, lcoeQuality)}/MWh`,
        { quality: lcoeQuality, references: lcoeCites },
      ],
      current.unit === 'solar-pv'
        ? ['Capacity factor', formatUncertainNumber(params.capacityFactor, intensityQuality), { quality: intensityQuality, references: intensityQuality === 'cited' ? definition.references : [] }]
        : null,
    ].filter(Boolean);
  }
  function formatMoney(value) { return `$${formatNumber(value)}`; }
  function metricMetaMarkup(meta) {
    if (!meta) return '';
    if (typeof meta === 'string') return qualityChip(meta);
    const quality = meta.quality || (meta.kind ? classifyQuality(meta) : '');
    const chip = quality ? qualityChip(quality) : '';
    const band = parseBand(meta.band);
    const bandText = band
      ? `<span class="quality-band">${formatUncertainNumber(band.low, 'cited')}–${formatUncertainNumber(band.high, 'cited')}${band.unit ? ` ${band.unit}` : ''}</span>`
      : '';
    const cite = meta.cite || citeMarkup(meta.references);
    return `${chip}${bandText}${cite}`;
  }
  function metricRows(rows) {
    return rows.map(([term, value, meta]) => `<div><dt>${term}</dt><dd>${value}${metricMetaMarkup(meta)}</dd></div>`).join('');
  }

  window.__FLOWSHEET_APP__ = {
    graph, setpoints, addNode, choosePort, clearFactory, autoArrange, toggleCanvasFocus,
    completeBoundaries, loadMethaneRecycle, loadCoastalMethane, sizeCoastalToMethane, loadAbundanceHub, loadDemoNetwork,
    addCurrentPlant, openNetworkPlant, clearNetwork, replaceUnit, bindLocation,
    saveNamed, loadNamed, captureBaseline, clearBaseline,
    solve: solveAndRender, get result() { return result; }, get baseline() { return baseline; },
    get economics() { return currentEconomics; }, get site() { return site; }, get network() { return networkResult; },
    get sizing() { return lastSizing; },
    projectEconomics, setCanvasZoom, get canvasZoom() { return canvasZoom; },
  };
  refreshSaveOptions();
  const savedNetwork = readJson(NETWORK_KEY) || readJson(LEGACY_NETWORK_KEY);
  if (savedNetwork?.plants) network = { plants: savedNetwork.plants, corridors: savedNetwork.corridors || [] };
  if (network.plants.length) {
    refreshNetwork();
    if (storage && !readJson(NETWORK_KEY) && readJson(LEGACY_NETWORK_KEY)) {
      try {
        storage.setItem(NETWORK_KEY, JSON.stringify({ plants: network.plants, corridors: network.corridors }));
        storage.removeItem(LEGACY_NETWORK_KEY);
      } catch { /* ignore */ }
    }
  }
  if (restoreSnapshot(readJson(AUTOSAVE_KEY))) solveAndRender();
  else render();
})();
