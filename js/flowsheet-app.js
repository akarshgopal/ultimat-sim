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
    RIGHT_KINDS,
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
  const TAB_KEY = 'molecular-foundry.tab.v1';
  const FOUNDATION_TABS = ['overview', 'location', 'process', 'economics'];
  const TAB_IDS = {
    overview: { tab: 'tabOverview', panel: 'panelOverview' },
    location: { tab: 'tabLocation', panel: 'panelLocation' },
    process: { tab: 'tabProcess', panel: 'panelProcess' },
    economics: { tab: 'tabEconomics', panel: 'panelEconomics' },
  };
  let activeTab = 'overview';
  const NODE_WIDTH = 220;
  const NODE_RX = 3;
  const ISO_DX = 16;
  const ISO_DY = 9;
  const FLOOR_GRID = 24;
  const EMPTY_CANVAS_HTML = '<div class="empty-canvas"><span class="eyebrow">Plant floor</span><strong>No blocks</strong><p>Add a block or open a case on Overview. Drag empty canvas to pan · Fit frames the plant.</p></div>';
  const PORT_STEP = 20;
  const PORT_TOP = 58;
  const COLUMN_GAP = 120;
  let selectedNodeId = null;
  let selectedEdgeIndex = null;
  let undoStack = [];
  let redoStack = [];
  let undoGesture = null;
  const UNDO_STACK_MAX = 20;
  let pendingPort = null;
  let result = null;
  let currentEconomics = null;
  let baseline = null;
  let powerBreakevenSignature = '';
  let syncingEconomicsDisclosure = false;
  const MIN_ZOOM = 0.08;
  const MAX_ZOOM = 2;
  const READABLE_ZOOM = 0.5;
  let canvasZoom = 1;
  let zoomPinned = false;
  let highlightPort = null;
  let highlightRightKey = '';
  let site = null;
  let network = { plants: [], corridors: [] };
  let networkResult = null;
  let networkEditor = null;
  let networkNotice = '';
  let solveError = '';
  let routeNote = '';
  let dragging = null;
  let suppressClick = false;
  let canvasFocused = false;
  let lastSizing = null;
  let livePvgisBlocked = false;
  let operationMeta = {};
  let siteMap = null;
  let siteMapMarker = null;
  let siteMapOverlays = { osm: null, pvgis: null, water: null, land: null, footprint: null, network: null };
  let siteMapEnabled = { osm: true, pvgis: true, water: false, land: false, footprint: true, network: false };
  let siteMapFootprintById = {};
  let activeDemoId = null;
  let lastCashflowCompare = null;
  let preSizingSeed = null;
  let siteMapFailed = false;
  let siteMapTilesFailed = false;
  let siteMapLayersReady = false;
  const SIZE_PRODUCT_LABELS = {
    CH4: 'CH₄', H2: 'H₂', methanol: 'methanol', ammonia: 'NH₃', lithium: 'lithium', salt: 'salt',
  };
  const PALETTE_CATEGORIES = {
    Minerals: ['brine-minerals', 'chlor-alkali', 'bromine-recovery'],
    Fuels: ['electrolyzer', 'sabatier', 'methanol', 'asu', 'ammonia'],
    Water: ['swro'],
    Power: ['solar-pv', 'battery'],
    Carbon: ['dac-solid', 'dac-liquid', 'dac-electroswing'],
    Crust: ['mg-si', 'polysilicon', 'bayer-alumina', 'aluminium-smelter', 'pv-module'],
    REE: ['iac-leach', 'ree-chromatography'],
    Bio: ['bioforge'],
  };
  const PALETTE_MORE_UNITS = [
    'nuclear-electricity', 'solar-thermal', 'thermal-storage',
  ];
  const PALETTE_DEFAULT_OPEN = new Set(['Minerals', 'Fuels']);
  const MapSite = typeof FlowsheetMapSite !== 'undefined' ? FlowsheetMapSite : null;

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
      sourceNote: 'Default 3.5 kWh/m³ is a plant-level SEC in the Elimelech & Phillip 2011 3–4 kWh/m³ band (RO stage plus intake, pretreatment, posttreatment, and brine discharge). Recovery 0.45 is the low end of the 45–55% range in which most SWRO plants operate. Ghaffour et al. 2013 reports the same 3–4 kWh/m³ SWRO plant band with energy recovery. Voutchkov 2018 reports best-in-class medium/large SWRO membrane systems at 2.5–2.8 kWh/m³ (RO train); 3.5 keeps the broader plant-level band rather than RO-only best-in-class.',
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
      sourceNote: 'Screening assumption in the IEA DAC 2022 solid-sorbent family, not a plant quote. Electricity 0.5 kWh/kg CO₂ = 1.8 GJ/t; heat 1.5 kWh/kg CO₂ = 5.4 GJ/t (×3.6 MJ/kWh). Combined 7.2 GJ/t sits at the low end of IEA S-DAC 7.2–9.5 GJ/t with a 25/75 electricity/heat split. NASEM 2019 (DOI 10.17226/25259) likewise notes thermal regeneration dominates solid-sorbent DAC energy. Capture fraction 0.9 and amine makeup 0.02 kg/kg CO₂ are screening, not IEA/NASEM table values. minHeatT_C 80 °C is a low-grade solid-sorbent screening floor.',
      references: [
        { label: 'Keith et al. 2018', url: 'https://doi.org/10.1016/j.joule.2018.05.006' },
        { label: 'IEA DAC 2022', url: 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary' },
        { label: 'NASEM 2019 Negative Emissions Technologies (DAC chapter)', url: 'https://doi.org/10.17226/25259' },
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
      sourceNote: 'Screening assumption in the IEA DAC 2022 solid-sorbent family, not a plant quote. Electricity 0.5 kWh/kg CO₂ = 1.8 GJ/t; heat 1.5 kWh/kg CO₂ = 5.4 GJ/t (×3.6 MJ/kWh). Combined 7.2 GJ/t sits at the low end of IEA S-DAC 7.2–9.5 GJ/t with a 25/75 electricity/heat split. NASEM 2019 (DOI 10.17226/25259) likewise notes thermal regeneration dominates solid-sorbent DAC energy. Capture fraction 0.9 and amine makeup 0.02 kg/kg CO₂ are screening, not IEA/NASEM table values. minHeatT_C 80 °C is a low-grade solid-sorbent screening floor.',
      references: [
        { label: 'IEA DAC 2022', url: 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary' },
        { label: 'NASEM 2019 Negative Emissions Technologies (DAC chapter)', url: 'https://doi.org/10.17226/25259' },
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
      sourceNote: 'Keith et al. 2018 Carbon Engineering process. Heat 2.45 kWh/kg CO₂ = 8.82 GJ/t from Scenario A (8.81 GJ/t NG; 8.81/3.6 = 2.447 kWh/kg). Electricity 0.366 kWh/kg CO₂ = 366 kWh/t = 1.32 GJ/t from Scenario C purchased power. Mixed-scenario vectors, not one Keith plant configuration. Capture fraction 0.75 is Keith et al. 2018 Table 1 74.5% rounded. minHeatT_C 900 °C matches calciner-grade liquid solvent. KOH makeup 0.01 kg/kg CO₂ is screening, not a Keith table value. NASEM 2019 frames liquid-solvent DAC as heat-dominated high-temperature regeneration.',
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
      params: { electricityKWhPerKgCH4: 1, heatKWhPerKgCH4: 2.86, wasteHeatT_C: 250 },
      controls: [
        { key: 'heatKWhPerKgCH4', label: 'Reject heat', min: 0, max: 5, step: 0.01, unit: 'kWhₜₕ/kg CH₄' },
        { key: 'wasteHeatT_C', label: 'Reject heat temperature', min: 80, max: 400, step: 5, unit: '°C' },
      ],
      sourceNote: 'Default 1 kWh/kg CH₄ is a screening ancillary/compression/heat-up load in a 0.4–1.5 kWh/kg band, not electrolysis. Zapf (via Baier et al. 2018 Frontiers DOI 10.3389/fenrg.2018.00005) gives 0.4 kWh/m³ SNG to heat the 1:4 CO₂/H₂ feed to 300 °C (~0.56 kWh/kg at 0.717 kg/m³). Compression and recycle sit above that heat-up; 1 kWh/kg is in-band screening, not a plant quote. Reject heat 2.86 kWh/kg CH₄ is 165 kJ/mol methanation enthalpy (165/3.6/16.04); wasteHeatT_C 250 °C is a screening reject T for cascade eligibility, not a measured outlet.',
      references: [{ label: 'Baier et al. 2018 (citing Zapf 2017)', url: 'https://doi.org/10.3389/fenrg.2018.00005' }],
    },
    methanol: {
      label: 'Methanol synthesis', capacity: 1000, rate: 100, activityUnit: 'kg CH₃OH/day',
      palette: { section: 'building', order: 6.5, glyph: 'MeOH', tone: 'methane', description: 'CO₂ + 3 H₂ → methanol' },
      params: { electricityKWhPerKg: 0.5, wasteHeatKWhPerKg: 0.43, wasteHeatT_C: 250 },
      controls: [
        { key: 'electricityKWhPerKg', label: 'Synthesis electricity', min: 0, max: 3, step: 0.05, unit: 'kWh/kg MeOH' },
        { key: 'wasteHeatKWhPerKg', label: 'Reject heat', min: 0, max: 3, step: 0.01, unit: 'kWhₜₕ/kg MeOH' },
        { key: 'wasteHeatT_C', label: 'Reject heat temperature', min: 80, max: 400, step: 5, unit: '°C' },
      ],
      sourceNote: 'Default 0.5 kWh/kg is screening synthesis/compression, not electrolysis. Reject heat 0.43 kWh/kg is CO₂ + 3 H₂ → CH₃OH + H₂O enthalpy (~49 kJ/mol / 3.6 / 32.04); 250 °C is a screening reject T, not a measured outlet.',
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
    'bayer-alumina': {
      label: 'Bayer alumina', capacity: 1000, rate: 100, activityUnit: 'kg Al₂O₃/day',
      palette: { section: 'building', order: 12, glyph: 'Al2', description: 'Bauxite + caustic makeup + power → smelter-grade alumina' },
      params: { electricityKWhPerKg: 3.5 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity', min: 1, max: 8, step: 0.1, unit: 'kWh/kg Al₂O₃' }],
      sourceNote: 'Screening Bayer alumina: 2.0 kg bauxite + 0.08 kg NaOH makeup + 3.5 kWh/kg Al₂O₃. 3.5 kWh/kg is an IAI ~10–12 GJ/t total-energy-as-electricity proxy (≈3.33 kWh/kg at 12 GJ/t), not a metered Bayer plant. Red mud 1.0 kg leftover ore / kg alumina; caustic makeup is liquor loss, not a full recycle model. CAPEX from the tea-screening bayer-alumina pack (~$1370/t-y → 500 $/(kg/day)). Not a Hydro/Alcoa quote.',
      references: [
        { label: 'IAI metallurgical alumina refining energy intensity (~10–12 GJ/t family)', url: 'https://international-aluminium.org/statistics/metallurgical-alumina-refining-energy-intensity/' },
        { label: 'USGS MCS 2025 bauxite and alumina', url: 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-bauxite-alumina.pdf' },
      ],
    },
    'aluminium-smelter': {
      label: 'Aluminium smelter', capacity: 1000, rate: 100, activityUnit: 'kg Al/day',
      palette: { section: 'building', order: 12, glyph: 'Al', description: 'Alumina + carbon + power → aluminium' },
      params: { electricityKWhPerKg: 14 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Smelting electricity', min: 8, max: 25, step: 0.1, unit: 'kWh/kg Al' }],
      sourceNote: '14 kWh/kg is Hall–Héroult screening inside ~13–15 kWh/kg (IAI-class). CAPEX comes from the tea-screening aluminium-smelter pack (~$5000/t-y → 1800 $/(kg/day)), not a dead $0 block. Not Bayer refining and not a vendor quote.',
      references: [{ label: 'DOE aluminium roadmap', url: 'https://www.energy.gov/sites/prod/files/2013/11/f4/al_roadmap.pdf' }],
    },
    'mg-si': {
      label: 'MG-Si furnace', capacity: 1000, rate: 100, activityUnit: 'kg Si/day',
      palette: { section: 'building', order: 12, glyph: 'Si', description: 'Quartz + carbon + power → MG-Si' },
      params: { electricityKWhPerKg: 12 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity', min: 8, max: 20, step: 0.1, unit: 'kWh/kg Si' }],
      sourceNote: 'Screening SAF electrical SEC 12 kWh/kg inside the 11–13 kWh/kg band (Saevarsdottir-class / MDPI 2026 TEA comparison uses 12); SiO2+2C→Si+2CO; not Siemens/poly-Si and not a furnace quote.',
      references: [
        { label: 'MDPI Energies 2026 MG-Si TEA comparison (11–13 kWh/kg SAF; they use 12)', url: 'https://www.mdpi.com/1996-1073/19/9/2023' },
        { label: 'USGS MCS 2025 silicon metal', url: 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-silicon.pdf' },
      ],
    },
    polysilicon: {
      label: 'Polysilicon (Siemens)', capacity: 1000, rate: 100, activityUnit: 'kg poly-Si/day',
      palette: { section: 'building', order: 12, glyph: 'pSi', description: 'MG-Si + power → solar-grade poly-Si' },
      params: { electricityKWhPerKg: 65 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity', min: 40, max: 120, step: 1, unit: 'kWh/kg poly-Si' }],
      sourceNote: 'Screening Siemens / TCS-route upgrade 65 kWh/kg, mid of the Fraunhofer ISE SoG 2023 band 60–71 kWh/kg. Feed 1.05 mol MG-Si / mol product. Not a full TCS complex, not FBR, not a PV module BOM.',
      references: [
        { label: 'Fraunhofer ISE polysilicon electricity (SoG 60–71 kWh/kg family)', url: 'https://www.ise.fraunhofer.de/content/dam/ise/en/documents/publications/studies/25_en_ISE_Report_Analysis-of-the-Electricity-Consumption-for-the-Production-of-Electronic-Grade-Polysilicon.pdf' },
        { label: 'NREL Spring 2025 Solar Industry Update (SoG poly spot screening mid $6/kg)', url: 'https://www.nrel.gov/docs/' },
      ],
    },
    'pv-module': {
      label: 'PV module (BOM)', capacity: 1000, rate: 100, activityUnit: 'kg module/day',
      palette: { section: 'building', order: 12, glyph: 'PV', description: 'Poly-Si + Ag + glass + EVA + Al → module' },
      params: {
        electricityKWhPerKg: 0.05,
        polysiliconKgPerKg: 0.0273,
        silverKgPerKg: 0.0003,
        glassKgPerKg: 0.6745,
        evaKgPerKg: 0.0669,
        aluminiumKgPerKg: 0.1273,
      },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity', min: 0, max: 1, step: 0.01, unit: 'kWh/kg module' }],
      sourceNote: 'Fraunhofer ISE Photovoltaics Report 2021 module mass shares on 11.6 kg/m² (poly-Si 0.0273, Ag 0.0003, glass 0.6745, EVA 0.0669, Al 0.1273 kg/kg). Remaining ~10.4% backsheet/J-box/cables omitted. Assembly/laminator SEC 0.05 kWh/kg. Not a cell fab, not TOPCon, not bankable.',
      references: [
        { label: 'Fraunhofer ISE Photovoltaics Report (module mass 11.6 kg/m² shares)', url: 'https://www.ise.fraunhofer.de/content/dam/ise/de/documents/publications/studies/Photovoltaics-Report.pdf' },
        { label: 'NREL Solar Industry Update family (module ASP context)', url: 'https://www.nrel.gov/docs/' },
      ],
    },
    'iac-leach': {
      label: 'Ionic-clay REE', capacity: 100, rate: 100, activityUnit: 'kg REO/day',
      palette: { section: 'building', order: 13, glyph: 'REE', description: 'Clay + ammonium sulfate → NdPr oxide + other REO' },
      params: { gradeKgReoPerKgClay: 0.001, recovery: 0.85, ammoniumSulfateKgPerKgReo: 7, electricityKWhPerKgReo: 8.8 },
      controls: [
        { key: 'recovery', label: 'Recovery', min: 0.5, max: 0.95, step: 0.01 },
        { key: 'ammoniumSulfateKgPerKgReo', label: 'Ammonium sulfate', min: 4, max: 10, step: 0.1, unit: 'kg/kg REO' },
        { key: 'electricityKWhPerKgReo', label: 'Electricity', min: 4, max: 15, step: 0.1, unit: 'kWh/kg REO' },
      ],
      sourceNote: 'Ionic-clay leach+precip+calcine screening. 7 kg (NH4)2SO4 and 8.8 kWh per kg recovered listed REO (Deng & Kendall 2019 Table 2). No SX; 70% payability. Longnan literature basket, not a concession.',
      references: [
        { label: 'Deng & Kendall 2019 ionic-clay LCI (DOI)', url: 'https://doi.org/10.1007/s11367-019-01582-1' },
        { label: 'USGS MCS 2026 rare earths', url: 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-rare-earths.pdf' },
      ],
    },
    'ree-chromatography': {
      label: 'ARC-1 chromatography', capacity: 10, rate: 10, activityUnit: 'kg REO/day',
      palette: { section: 'building', order: 13, glyph: 'ARC', description: 'Maglut-style screening · mixed REO → NdPr + DyTb + light REO' },
      params: { recovery: 0.914, electricityKWhPerKgReo: 5 },
      controls: [
        { key: 'recovery', label: 'Recovery', min: 0.5, max: 0.99, step: 0.001 },
        { key: 'electricityKWhPerKgReo', label: 'Electricity', min: 0.01, max: 30, step: 0.01, unit: 'kWh/kg REO' },
      ],
      sourceNote: 'proxy band · not a Maglut ARC-1 quote · Maglut has not published kWh/kg or CAPEX. Company-reported pilot recovery/purity only; mass split is not a purity spec. Oxide-equivalent feed, not a chloride liquor. Screening, not bankable.',
      references: [
        { label: 'FAR RNS — US strategic rare earths separation company MOU', url: 'https://www.investegate.co.uk/announcement/rns/ferro-alloy-resources-limited-npv--far/us-strategic-rare-earths-separation-company-mou/9787733' },
        { label: 'Mining Technology — Maglut chromatography rare-earth processing US', url: 'https://www.mining-technology.com/news/maglut-chromatography-rare-earth-processing-us/' },
        { label: 'Talens Peiró & Villalba JOM 2013 SX electricity order', url: 'https://link.springer.com/article/10.1007/s11837-013-0719-8' },
        { label: 'Andersson et al. IECR 2014 MCSGP DOI', url: 'https://doi.org/10.1021/ie5023223' },
        { label: 'NETL IX LCI OSTI', url: 'https://www.osti.gov/servlets/purl/1509123' },
        { label: 'Honaker / NETL 2020 coal-to-REE PDF', url: 'https://www.netl.doe.gov/sites/default/files/2020-10/20VPRREE_Honaker_2.pdf' },
      ],
    },
    bioforge: {
      label: 'Bioforge', capacity: 1000, rate: 100, activityUnit: 'kg gluconic/day',
      palette: { section: 'building', order: 14, glyph: 'GA', description: 'Dextrose + O₂ + water → gluconic acid + H₂O₂' },
      params: { electricityKWhPerKg: 0.05 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity', min: 0.01, max: 0.2, step: 0.01, unit: 'kWh/kg' }],
      sourceNote: 'GOx stoich C6H12O6 + O2 + H2O → C6H12O7 + H2O2. SEC 0.05 kWh/kg is Vogelbusch MVR-family evaporation-order electricity (0.019–0.072 kWh/kg band), not a Solugen meter and not an unpublished enzyme-reactor load. Glucaric not modeled (no public mol split). Screening, not a plant quote.',
      references: [
        { label: 'EPA Green Chemistry Challenge 2023 — Greener Synthetic Pathways Award', url: 'https://www.epa.gov/greenchemistry/green-chemistry-challenge-2023-greener-synthetic-pathways-award' },
        { label: 'DOE EA-2246 Solugen Inc. Bioforge Marshall Project', url: 'https://www.energy.gov/nepa/doeea-2246-solugen-inc-bioforge-marshall-project-marshall-minnesota' },
        { label: 'C&EN 8 Nov 2023 — Solugen expand biobased chemical production', url: 'https://cen.acs.org/business/biobased-chemicals/Solugen-expand-biobased-chemical-production/101/web/2023/11' },
        { label: 'Vogelbusch MVR evaporation (SEC family, not a Solugen meter)', url: 'https://www.vogelbusch-biocommodities.com/en/technology/electrification/mvr-evaporation/' },
      ],
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
    'material-source': { label: 'Material source', palette: { section: 'purchased', order: 4, glyph: 'M', tone: 'water', description: 'Generic purchased feed — prefer named intakes' } },
    'electricity-source': { label: 'Electricity source', palette: { section: 'utility', order: 5, glyph: '⚡', description: 'Set available kWh/day' } },
    'heat-source': { label: 'Heat source', palette: { section: 'utility', order: 7, glyph: 'H', tone: 'carbon', description: 'Set energy and temperature' } },
    'consumable-source': { label: 'Consumables', palette: { section: 'utility', order: 8, glyph: 'C', tone: 'methane', description: 'Sorbent or reagent makeup' } },
    'consumable-sink': { label: 'Spent media', palette: { section: 'utility', order: 12, glyph: '↓C', tone: 'methane', description: 'Dispose spent sorbent or reagent' } },
    'electrical-bus': { label: 'Electricity bus', palette: { section: 'utility', order: 1, glyph: '⚡↗', description: 'One supply → many blocks' } },
    'material-splitter': { label: 'Material splitter', palette: { section: 'utility', order: 2, glyph: 'M↗', tone: 'water', description: 'One stream → many branches; optional priority fill + overflow' } },
    'material-mixer': { label: 'Material mixer', palette: { section: 'utility', order: 3, glyph: '↘M', tone: 'water', description: 'Many streams → one output' } },
    'intake-pump': {
      label: 'Intake pump', capacity: 1000, rate: 1000, activityUnit: 'm³/day',
      palette: { section: 'utility', order: 4, glyph: 'P', tone: 'water', description: 'Liquid lift — needs bus power or the line starves' },
      params: { pumpKWhPerM3: 0.4, densityKgM3: 1025 },
      controls: [
        { key: 'headM', label: 'Static head', min: 0, max: 200, step: 1, unit: 'm', optional: true },
        { key: 'pumpEta', label: 'Pump efficiency', min: 0.3, max: 0.95, step: 0.01, optional: true },
        { key: 'partLoadK', label: 'Part-load shape', min: 0, max: 2, step: 0.05, optional: true },
        { key: 'pumpKWhPerM3', label: 'Pump energy', min: 0, max: 2, step: 0.05, unit: 'kWh/m³' },
        { key: 'densityKgM3', label: 'Liquid density', min: 800, max: 1400, step: 5, unit: 'kg/m³' },
      ],
      sourceNote: 'MECH8 screening open-intake / transfer pump (~0.2–0.5 kWh/m³ band). Pass-through liquid; electricity from the bus. MECH18 screening CAPEX ~$350/(m³/day) × regional tea CAPEX×; campus pad ~0.15 m²/(m³/day) (floor 6 m²). MECH19: set static head to derive SEC = ρ·g·H / (η·3.6e6) with η default 0.7; moving the kWh/m³ slider overrides head. Head unset keeps the kWh/m³ value (default 0.4). MECH20: optional part-load shape k applies SEC × (1 + k(1−Q/Qrated)²) when flow is below rated capacity; k unset is ×1. MECH21 uses that shape at the delivered flow, so a short bus limits throughput on the curve instead of the setpoint SEC. Not a vendor curve. SWRO plant SEC should stay plant-only if lift is modeled here.',
      references: [
        { label: 'Voutchkov 2018 desalination energy (DOI 10.1016/j.desal.2017.10.033)', url: 'https://doi.org/10.1016/j.desal.2017.10.033' },
        { label: 'Elimelech & Phillip 2011 SWRO plant SEC band', url: 'https://doi.org/10.1126/science.1200488' },
      ],
    },
    'gas-blower': {
      label: 'Gas blower', capacity: 25000, rate: 25000, activityUnit: 'Nm³/day',
      palette: { section: 'utility', order: 4.5, glyph: 'F', tone: 'carbon', description: 'Air / flue move — needs bus power or the line starves' },
      params: { blowerKWhPerNm3: 0.001 },
      controls: [
        { key: 'deltaP_kPa', label: 'Pressure rise', min: 0, max: 20, step: 0.1, unit: 'kPa', optional: true },
        { key: 'blowerEta', label: 'Blower efficiency', min: 0.3, max: 0.95, step: 0.01, optional: true },
        { key: 'partLoadK', label: 'Part-load shape', min: 0, max: 2, step: 0.05, optional: true },
        { key: 'blowerKWhPerNm3', label: 'Blower energy', min: 0, max: 0.02, step: 0.0005, unit: 'kWh/Nm³' },
      ],
      sourceNote: 'MECH10 screening process fan / duct+filter (~0.5–5 kWh per 1000 Nm³). Default 0.001 kWh/Nm³. Pass-through gas; electricity from the bus. MECH18 screening CAPEX ~$1.5/(Nm³/day) × regional tea CAPEX×; campus pad ~0.002 m²/(Nm³/day) (floor 6 m²). MECH20: optional ΔP derives SEC = ΔP_kPa / (η·3600) with η default 0.7; moving the kWh/Nm³ slider overrides ΔP. ΔP unset keeps 0.001 kWh/Nm³. Not a Keith CE contactor fan (~0.00004 kWh/Nm³) — dial down for contactor-only. Not a fan curve or vendor quote. MECH22 part-load matches the pump and is not a fan curve.',
      references: [
        { label: 'Keith et al. 2018 Carbon Engineering (contactor fan order-of-magnitude)', url: 'https://doi.org/10.1016/j.joule.2018.05.006' },
        { label: 'IEA Direct Air Capture 2022', url: 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary' },
      ],
    },
    'material-buffer': {
      label: 'Buffer tank', capacity: 10000, rate: 1000, activityUnit: 'kg/day',
      palette: { section: 'utility', order: 5, glyph: 'T', tone: 'water', description: 'Store mass across hours — fill, hold, discharge' },
      params: { capacityKg: 10000, initialKg: 0 },
      controls: [
        { key: 'capacityKg', label: 'Tank capacity', min: 0, max: 1e6, step: 100, unit: 'kg' },
        { key: 'initialKg', label: 'Starting inventory', min: 0, max: 1e6, step: 100, unit: 'kg' },
        { key: 'densityKgM3', label: 'Density', min: 800, max: 1400, step: 5, unit: 'kg/m³' },
        { key: 'capexPerM3', label: 'CAPEX intensity', min: 50, max: 2000, step: 25, unit: '$/m³ capacity' },
      ],
      sourceNote: 'MECH3 inventory SOC across the typical-day horizon. Discharge setpoint is kg/day out of the tank; with no setpoint the tank drains whatever it holds each hour (pass-through). Full tanks backpressure upstream; empty tanks starve downstream. MECH18 tank CAPEX uses fluid-class $/m³ (freshwater/seawater/brine/generic) × regional tea CAPEX×; generic $500/m³ ≡ MECH17 $0.50/kg at ρ=1000. MECH19 uses assay density_kg_per_L for brine/seawater. MECH20: if that field is missing, salinity or TDS in 0–42 g/kg uses a UNESCO 25 °C estimate; salinity outside that fit, or no salinity, stays on the labeled fluid-class density. MECH22: tds_mg_per_L (no ρ) is a fixed-point proxy, not a lab density — S = mg/L ÷ UNESCO ρ(S) at 25 °C. Campus pad ~1 m²/t capacity. Not a vendor quote or surveyed plot.',
      references: [
        { label: 'EPA USP guide / tank-farm layout screening (pad+dike order)', url: 'https://www.epa.gov/sites/default/files/2014-03/documents/uspguide.pdf' },
        { label: 'Matches process equipment — atmospheric storage tank cost order', url: 'https://www.matche.com/equipcost/Tank.html' },
      ],
    },
    'material-sink': {
      label: 'Material sink',
      palette: { section: 'utility', order: 9, glyph: '↓', description: 'Capture, store, sell, or discard — demand or manual offtake cap backpressures upstream' },
      params: {},
      controls: [
        { key: 'acceptKg', label: 'Export / offtake limit', min: 0, max: 1e6, step: 10, unit: 'kg/day', optional: true },
      ],
      sourceNote: 'MECH7: blank offtake on a sale sink uses Destination annualDemandLimit ÷ operating days (TEA regional demand); vent/disposal stay unlimited unless you type a cap. A typed kg/day override always wins — upstream converters throttle and cause chains show export capped.',
    },
    'heat-sink': {
      label: 'Heat sink',
      palette: { section: 'utility', order: 10, glyph: '↓H', tone: 'carbon', description: 'Reject or recover process heat — optional kWh cap backpressures upstream' },
      params: {},
      controls: [
        { key: 'acceptKWh', label: 'Export / reject limit', min: 0, max: 1e6, step: 10, unit: 'kWh/day', optional: true },
      ],
      sourceNote: 'MECH9: blank = unlimited heat rejection. A typed kWh/day cap backpressures upstream converters (waste heat / heaters) and cause chains show export capped.',
    },
    'electricity-sink': {
      label: 'Electricity sink',
      palette: { section: 'utility', order: 11, glyph: '↓⚡', description: 'Export or curtail electricity — optional kWh cap backpressures generation' },
      params: {},
      controls: [
        { key: 'acceptKWh', label: 'Export / curtailment limit', min: 0, max: 1e6, step: 10, unit: 'kWh/day', optional: true },
      ],
      sourceNote: 'MECH9: blank = unlimited export/curtailment. On a power bus, put this sink last in priority so loads take power first; the cap limits surplus export and trims generation. Cause chains show curtailment capped.',
    },
  };
  const NODE_DISPLAY_LABELS = {
    dac: 'DAC',
    swro: 'SWRO',
    'sabatier-water': 'Sabatier water',
  };
  const RIGHT_DISPLAY_LABELS = {
    gridImport: 'Grid import',
    freshwater: 'Freshwater',
    seawaterIntake: 'Seawater intake',
    seawaterDischarge: 'Seawater discharge',
    brineConcession: 'Brine concession',
    saltPurchase: 'Salt purchase',
    concentratePurchase: 'Concentrate purchase',
    quartzPurchase: 'Quartz purchase',
    aluminaPurchase: 'Alumina purchase',
    bauxitePurchase: 'Bauxite purchase',
    causticPurchase: 'Caustic purchase',
    silverPurchase: 'Silver purchase',
    glassPurchase: 'Glass purchase',
    evaPurchase: 'EVA purchase',
  };
  const portNames = {
    air: 'Feed gas', electricity: 'Electricity', heat: 'Process heat', consumables: 'Consumables',
    logistics: 'Logistics',
    capturedCo2: 'Captured CO₂', depletedAir: 'Depleted gas', spentMedia: 'Spent media', feed: 'Feed water', product: 'Fresh water',
    brine: 'Brine', water: 'Water', hydrogen: 'Hydrogen', oxygen: 'Oxygen', waterReject: 'Reject water',
    co2: 'CO₂', methane: 'Methane', methanol: 'Methanol', out: 'Output', in: 'Input',
    wasteHeat: 'Waste heat', nitrogen: 'Nitrogen', ammonia: 'Ammonia', offgas: 'Off-gas',
    lithium: 'Lithium chloride', bromide: 'Sodium bromide', magnesium: 'Magnesium chloride', potash: 'Potash', gypsum: 'Gypsum', salt: 'Salt', raffinate: 'Raffinate',
    caustic: 'Caustic soda', chlorine: 'Chlorine', bromine: 'Bromine', alumina: 'Alumina', carbon: 'Carbon', aluminium: 'Al frame', carbonDioxide: 'Carbon dioxide',
    quartz: 'Quartzite', silicon: 'MG-Si', polysilicon: 'Poly-Si', carbonMonoxide: 'Carbon monoxide',
    bauxite: 'Bauxite', redMud: 'Red mud',
    silver: 'Ag paste', glass: 'Float glass', eva: 'EVA', module: 'Module',
    clay: 'Clay', lixiviant: '(NH4)2SO4', ndpr: 'NdPr', otherReo: 'Other REO', residue: 'Residue', liquor: 'Liquor',
    concentrate: 'Concentrate', dytb: 'DyTb', lightReo: 'Light REO',
    dextrose: 'Dextrose', gluconic: 'Gluconic acid', hydrogenPeroxide: 'Hydrogen peroxide',
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
    bauxite: { label: 'Bauxite', phase: 'solid', mol: { Bauxite: 1000 } },
    caustic: { label: 'Caustic soda', phase: 'liquid', mol: { NaOH: 1000 } },
    carbon: { label: 'Carbon anode', phase: 'solid', mol: { C: 1000 } },
    quartz: { label: 'Quartzite', phase: 'solid', mol: { SiO2: 1000 } },
    silicon: { label: 'Metallurgical silicon', phase: 'solid', mol: { Si: 1000 } },
    ironOre: { label: 'Hematite concentrate', phase: 'solid', mol: { Fe2O3: 1000 } },
    titaniumTetrachloride: { label: 'Titanium tetrachloride', phase: 'liquid', mol: { TiCl4: 1000 } },
    magnesium: { label: 'Magnesium', phase: 'solid', mol: { Mg: 1000 } },
    'ionic-clay': {
      label: 'Ionic clay (Longnan basket)',
      phase: 'solid',
      mol: (typeof IonicClayLongnan !== 'undefined' && IonicClayLongnan.clayMolForKg)
        ? IonicClayLongnan.clayMolForKg(1)
        : { Al2Si2O5OH4: 1000 / 258.16 },
    },
    'ammonium-sulfate': { label: 'Ammonium sulfate', phase: 'solid', mol: { NH42SO4: 1000 } },
    'mixed-reo': {
      label: 'Mixed REO concentrate',
      phase: 'solid',
      mol: (typeof IonicClayLongnan !== 'undefined' && IonicClayLongnan.concentrateMolForKg)
        ? IonicClayLongnan.concentrateMolForKg(1)
        : { Nd2O3: 5.10 / 97.27 * 1000 / 336.48, Y2O3: 62.90 / 97.27 * 1000 / 225.81 },
    },
    dextrose: { label: 'Dextrose', phase: 'solid', mol: { C6H12O6: 1000 } },
    silver: { label: 'Silver paste', phase: 'solid', mol: { Ag: 1000 } },
    'float-glass': { label: 'Float glass', phase: 'solid', mol: { FloatGlass: 1000 } },
    eva: { label: 'EVA encapsulant', phase: 'solid', mol: { EVA: 1000 } },
    aluminium: { label: 'Aluminium', phase: 'solid', mol: { Al: 1000 } },
    flueGas: {
      label: 'Flue gas',
      phase: 'gas',
      // Screening combustion flue — CO₂-rich, not a plant-specific stack assay.
      mol: { CO2: 150000, N2: 750000, O2: 50000, H2O: 50000 },
    },
  };

  // Practical intake identities for material-source (MECH2). Keep engine unit kind.
  // Resolve order: siteResource id → sourcePreset → minimal stream inference.
  const INTAKE_BY_KEY = {
    brine: { key: 'brine', label: 'Brine lake', profile: 'pond', glyph: 'brine' },
    seawater: { key: 'seawater', label: 'Seawater intake', profile: 'intake', glyph: 'intake' },
    air: { key: 'air', label: 'Ambient air', profile: 'stack', glyph: 'air' },
    flue: { key: 'flue', label: 'Flue gas', profile: 'stack', glyph: 'flue' },
    flueGas: { key: 'flue', label: 'Flue gas', profile: 'stack', glyph: 'flue' },
    'flue-gas': { key: 'flue', label: 'Flue gas', profile: 'stack', glyph: 'flue' },
    water: { key: 'water', label: 'Freshwater', profile: 'intake', glyph: 'intake' },
    freshwater: { key: 'water', label: 'Freshwater', profile: 'intake', glyph: 'intake' },
    salt: { key: 'salt', label: 'Sodium chloride', profile: 'silo', glyph: 'silo' },
    bromide: { key: 'bromide', label: 'Sodium bromide', profile: 'silo', glyph: 'silo' },
    alumina: { key: 'alumina', label: 'Alumina', profile: 'silo', glyph: 'silo' },
    bauxite: { key: 'bauxite', label: 'Bauxite', profile: 'silo', glyph: 'Bx' },
    caustic: { key: 'caustic', label: 'Caustic soda', profile: 'tank', glyph: 'NaOH' },
    carbon: { key: 'carbon', label: 'Carbon anode', profile: 'silo', glyph: 'silo' },
    quartz: { key: 'quartz', label: 'Quartzite', profile: 'silo', glyph: 'silo' },
    ironOre: { key: 'ironOre', label: 'Hematite concentrate', profile: 'silo', glyph: 'silo' },
    magnesium: { key: 'magnesium', label: 'Magnesium', profile: 'silo', glyph: 'silo' },
    co2: { key: 'co2', label: 'Carbon dioxide', profile: 'stack', glyph: 'CO₂' },
    hydrogen: { key: 'hydrogen', label: 'Hydrogen', profile: 'stack', glyph: 'H₂' },
    oxygen: { key: 'oxygen', label: 'Oxygen', profile: 'stack', glyph: 'O₂' },
    nitrogen: { key: 'nitrogen', label: 'Nitrogen', profile: 'stack', glyph: 'N₂' },
    chlorine: { key: 'chlorine', label: 'Chlorine', profile: 'stack', glyph: 'Cl₂' },
    titaniumTetrachloride: { key: 'titaniumTetrachloride', label: 'Titanium tetrachloride', profile: 'tank', glyph: 'feed' },
    'ionic-clay': { key: 'ionic-clay', label: 'Ionic clay (Longnan basket)', profile: 'silo', glyph: 'silo' },
    'ammonium-sulfate': { key: 'ammonium-sulfate', label: 'Ammonium sulfate', profile: 'silo', glyph: 'silo' },
    'mixed-reo': { key: 'mixed-reo', label: 'Mixed REO concentrate', profile: 'silo', glyph: 'silo' },
    dextrose: { key: 'dextrose', label: 'Dextrose', profile: 'silo', glyph: 'silo' },
    silver: { key: 'silver', label: 'Silver paste', profile: 'silo', glyph: 'Ag' },
    'float-glass': { key: 'float-glass', label: 'Float glass', profile: 'silo', glyph: 'Gl' },
    eva: { key: 'eva', label: 'EVA encapsulant', profile: 'silo', glyph: 'EVA' },
    aluminium: { key: 'aluminium', label: 'Aluminium', profile: 'silo', glyph: 'Al' },
  };
  const PRACTICAL_INTAKE_PALETTE = [
    { preset: 'seawater', label: 'Seawater intake', glyph: 'SW', tone: 'water', description: 'Coastal seawater feed' },
    { preset: 'brine', label: 'Brine lake', glyph: 'Br', tone: 'water', description: 'Saline lake / endorheic brine' },
    { preset: 'air', label: 'Ambient air', glyph: 'Air', tone: 'carbon', description: 'Atmosphere intake for DAC / ASU' },
    { preset: 'flueGas', label: 'Flue gas', glyph: 'Fg', tone: 'carbon', description: 'Screening CO₂-rich combustion flue' },
    { preset: 'water', label: 'Freshwater', glyph: 'H₂O', tone: 'water', description: 'Process freshwater intake' },
  ];
  const PURCHASED_FEED_PRESETS = ['salt', 'co2', 'hydrogen', 'oxygen', 'nitrogen', 'chlorine', 'bromide', 'alumina', 'bauxite', 'caustic', 'carbon', 'quartz', 'ironOre', 'magnesium', 'titaniumTetrachloride', 'ionic-clay', 'ammonium-sulfate', 'mixed-reo', 'dextrose', 'silver', 'float-glass', 'eva'];
  const PRACTICAL_INTAKE_LABELS = new Set([
    ...Object.values(INTAKE_BY_KEY).map(item => item.label),
    'Unassigned feed',
  ]);

  function normalizeIntakeKey(raw) {
    if (raw == null || raw === '') return null;
    const id = String(raw);
    if (INTAKE_BY_KEY[id]) return id;
    const lower = id.toLowerCase();
    if (INTAKE_BY_KEY[lower]) return lower;
    if (lower === 'fluegas' || lower === 'flue_gas') return 'flueGas';
    return null;
  }

  /** Infer a practical intake key from stream chemistry (minimal, documented). */
  function inferIntakeFromStream(stream) {
    if (!stream?.mol || stream.kind !== 'material') return null;
    const mol = stream.mol;
    const total = Object.values(mol).reduce((sum, value) => sum + (Number(value) || 0), 0);
    if (!(total > 0)) return null;
    const frac = (id) => (Number(mol[id]) || 0) / total;
    const nacl = (Number(mol['Na+']) || 0) + (Number(mol.NaCl) || 0);
    const cl = (Number(mol['Cl-']) || 0) + (Number(mol.NaCl) || 0);
    // CO₂-rich gas with bulk N₂ → screening flue (ambient air is ~400 ppm CO₂).
    if (stream.phase === 'gas' && frac('CO2') >= 0.05 && frac('N2') >= 0.4) return 'flueGas';
    if (stream.phase === 'gas' && frac('N2') >= 0.7 && frac('O2') >= 0.12) return 'air';
    if (stream.phase === 'gas' && frac('CO2') >= 0.9) return 'co2';
    if (stream.phase === 'gas' && frac('H2') >= 0.9) return 'hydrogen';
    if (stream.phase === 'liquid' && frac('H2O') >= 0.98 && cl < 50) return 'water';
    // Concentrated brine: elevated Cl⁻ vs seawater (~0.55 mol/kg-ish in presets).
    if (stream.phase === 'liquid' && cl >= 900 && nacl >= 500) return 'brine';
    if (stream.phase === 'liquid' && cl >= 300 && nacl >= 200) return 'seawater';
    if (stream.phase === 'solid' && (mol.NaCl || 0) > 0) return 'salt';
    return null;
  }

  function intakeKind(current) {
    if (!current || current.unit !== 'material-source') return null;
    const fromSite = normalizeIntakeKey(current.siteResource);
    if (fromSite) return INTAKE_BY_KEY[fromSite];
    const fromPreset = normalizeIntakeKey(current.sourcePreset);
    if (fromPreset) return INTAKE_BY_KEY[fromPreset];
    const fromId = normalizeIntakeKey(current.id);
    if (fromId && !String(current.id).includes('-')) return INTAKE_BY_KEY[fromId];
    const inferred = inferIntakeFromStream(current.params?.stream);
    if (inferred) return INTAKE_BY_KEY[inferred];
    return { key: 'unknown', label: 'Unassigned feed', profile: 'intake', glyph: 'feed' };
  }

  function isGenericMaterialSourceLabel(label) {
    return /^Material source(\s+\d+)?$/i.test(String(label || '').trim());
  }

  function isAutoIntakeLabel(label) {
    const text = String(label || '').trim();
    return isGenericMaterialSourceLabel(text) || PRACTICAL_INTAKE_LABELS.has(text);
  }

  function applyPracticalIntakeLabel(current, { force = false } = {}) {
    if (!current || current.unit !== 'material-source') return;
    const intake = intakeKind(current);
    if (!intake?.label) return;
    if (force || !current.label || isAutoIntakeLabel(current.label)) current.label = intake.label;
  }

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

  function paletteCard(unit, definition, extras = {}) {
    const { glyph, tone, title, description } = definition.palette;
    const name = extras.label || title || definition.label;
    const desc = extras.description != null ? extras.description : (description || '');
    const presetAttr = extras.preset ? ` data-preset="${escapeHtml(extras.preset)}"` : '';
    const labelAttr = extras.label ? ` data-label="${escapeHtml(extras.label)}"` : '';
    return `<button type="button" class="building-card" data-unit="${unit}"${presetAttr}${labelAttr} data-title="${escapeHtml(name)}" data-description="${escapeHtml(desc)}"><span class="building-glyph${tone ? ` ${tone}` : ''}">${extras.glyph || glyph}</span><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(desc)}</small></span><b>Add</b></button>`;
  }

  function intakePaletteCard(item) {
    return paletteCard('material-source', {
      label: item.label,
      palette: { glyph: item.glyph, tone: item.tone, description: item.description },
    }, { preset: item.preset, label: item.label, glyph: item.glyph, description: item.description });
  }


  function setActiveDemo(id, label) {
    activeDemoId = id || null;
    const cases = document.getElementById('overviewCases');
    if (cases) cases.value = id || '';
    document.querySelectorAll('[data-demo-id]').forEach(btn => {
      btn.classList.toggle('is-selected', !!id && btn.dataset.demoId === id);
    });
    document.querySelectorAll('[data-demo]').forEach(btn => {
      btn.classList.toggle('is-selected', !!id && btn.dataset.demo === id);
    });
    const chip = document.getElementById('overviewDemoChip');
    if (chip) {
      chip.hidden = !label;
      chip.textContent = label ? `Scenario · ${label}` : '';
    }
  }

  function paletteCategory(name, units, { open = false, extraClass = '' } = {}) {
    const cards = units
      .filter(unit => catalog[unit]?.palette?.section === 'building')
      .map(unit => paletteCard(unit, catalog[unit]))
      .join('');
    if (!cards) return '';
    const cls = extraClass ? `palette-category ${extraClass}` : 'palette-category';
    return `<details class="${cls}"${open ? ' open' : ''}><summary>${escapeHtml(name)}</summary>${cards}</details>`;
  }

  function renderPalettes() {
    const grouped = Object.entries(PALETTE_CATEGORIES)
      .map(([name, units]) => paletteCategory(name, units, { open: PALETTE_DEFAULT_OPEN.has(name) }))
      .join('');
    document.getElementById('buildingPalette').innerHTML = `${grouped}${paletteCategory('More units', PALETTE_MORE_UNITS, { extraClass: 'palette-more' })}`;
    const intakes = PRACTICAL_INTAKE_PALETTE.map(intakePaletteCard).join('');
    const utilities = Object.entries(catalog)
      .filter(([, definition]) => definition.palette?.section === 'utility')
      .sort(([, left], [, right]) => left.palette.order - right.palette.order)
      .map(([unit, definition]) => paletteCard(unit, definition))
      .join('');
    const purchased = PURCHASED_FEED_PRESETS
      .filter(id => materialPresets[id])
      .map(id => {
        const preset = materialPresets[id];
        const intake = INTAKE_BY_KEY[id];
        return intakePaletteCard({
          preset: id,
          label: intake?.label || preset.label,
          glyph: (intake?.glyph || id.slice(0, 2)).toString().slice(0, 3),
          tone: preset.phase === 'gas' ? 'carbon' : 'methane',
          description: `Purchased ${preset.label.toLowerCase()} feed`,
        });
      })
      .join('');
    document.getElementById('utilityPalette').innerHTML =
      `<div class="palette-intakes">${intakes}</div>${utilities}`
      + `<details class="palette-category palette-purchased"><summary>Purchased feeds</summary>${purchased}</details>`;
  }

  function paletteHaystack(card) {
    const title = card.getAttribute?.('data-title') || card.dataset?.title || '';
    const description = card.getAttribute?.('data-description') || card.dataset?.description || '';
    const unit = card.getAttribute?.('data-unit') || card.dataset?.unit || '';
    return `${title} ${description} ${unit}`.toLowerCase();
  }

  function applyPaletteFilter(query) {
    const q = String(query || '').trim().toLowerCase();
    const cards = document.querySelectorAll('#buildingPalette .building-card, #utilityPalette .building-card');
    let visible = 0;
    cards.forEach(card => {
      const match = !q || paletteHaystack(card).includes(q);
      card.hidden = !match;
      if (match) visible += 1;
    });
    document.querySelectorAll('#buildingPalette .palette-category').forEach(details => {
      const matched = [...details.querySelectorAll('.building-card')].filter(card => !card.hidden);
      details.hidden = !!q && matched.length === 0;
      if (q && matched.length) details.open = true;
    });
    const utilityHeading = document.getElementById('utilityPaletteHeading');
    const utilityVisible = [...document.querySelectorAll('#utilityPalette .building-card')].some(card => !card.hidden);
    if (utilityHeading) utilityHeading.hidden = !!q && !utilityVisible;
    const empty = document.getElementById('paletteEmpty');
    if (empty) empty.hidden = !q || visible > 0;
  }

  function setPaletteDrawer(open) {
    const sidebar = document.getElementById('controlsSidebar');
    const toggle = document.getElementById('paletteDrawerToggle');
    const backdrop = document.getElementById('paletteDrawerBackdrop');
    if (sidebar) sidebar.classList.toggle('is-open', !!open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (backdrop) backdrop.hidden = !open;
  }

  renderPalettes();
  document.getElementById('paletteSearch')?.addEventListener('input', event => {
    applyPaletteFilter(event.target.value);
  });
  document.getElementById('paletteDrawerToggle')?.addEventListener('click', () => {
    const sidebar = document.getElementById('controlsSidebar');
    const open = !sidebar?.classList.contains('is-open');
    setPaletteDrawer(open);
  });
  document.getElementById('paletteDrawerBackdrop')?.addEventListener('click', () => setPaletteDrawer(false));
  document.getElementById('buildingPalette').addEventListener('click', addFromPalette);
  document.getElementById('utilityPalette').addEventListener('click', addFromPalette);
  document.getElementById('clearFactory').addEventListener('click', clearFactory);
  document.getElementById('autoArrange').addEventListener('click', autoArrange);
  document.getElementById('focusCanvas').addEventListener('click', toggleCanvasFocus);
  document.getElementById('exitFocus')?.addEventListener('click', () => setCanvasFocus(false));
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', () => {
      if (zoomPinned || activeTab !== 'process' || !graph.nodes.length) return;
      fitCanvas();
    });
  }
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', handleProcessKeydown);
  }
  document.getElementById('zoomOut').addEventListener('click', () => setCanvasZoom(canvasZoom - 0.1));
  document.getElementById('zoomIn').addEventListener('click', () => setCanvasZoom(canvasZoom + 0.1));
  document.getElementById('zoomReset').addEventListener('click', () => setCanvasZoom(1));
  document.getElementById('zoomFit')?.addEventListener('click', () => fitCanvas({ compact: true }));
  document.getElementById('canvasZoom').addEventListener('input', event => setCanvasZoom(Number(event.target.value) / 100));
  document.getElementById('economicsDcf')?.addEventListener('toggle', () => {
    if (syncingEconomicsDisclosure) return;
    const dcf = document.getElementById('economicsDcf');
    const open = Boolean(dcf?.open);
    if (open === economicsAcknowledgment()) return;
    setEconomicsAcknowledgment(open);
    renderEconomics();
    renderNetwork();
  });
  document.getElementById('screenPowerBreakeven')?.addEventListener('click', screenPowerBreakEven);
  document.getElementById('powerBreakevenMode')?.addEventListener('change', () => {
    populatePowerBreakevenMaterials();
    powerBreakevenSignature = '';
    if (currentEconomics) screenPowerBreakEven();
  });
  document.getElementById('powerBreakevenMaterial')?.addEventListener('change', () => {
    powerBreakevenSignature = '';
    if (currentEconomics) screenPowerBreakEven();
  });
  document.getElementById('captureBaseline').addEventListener('click', captureBaseline);
  document.getElementById('clearBaseline').addEventListener('click', clearBaseline);
  document.getElementById('projectLifeYears').addEventListener('input', handleProjectEconomics);
  document.getElementById('discountRate').addEventListener('input', handleProjectEconomics);
  document.getElementById('completeBoundaries').addEventListener('click', completeBoundaries);
  document.getElementById('redoCanvas')?.addEventListener('click', () => redoLast());
  syncRedoButton();
  const OVERVIEW_CASES = {
    'methane-recycle': () => loadMethaneRecycle(),
    'coastal-methane': () => loadCoastalMethane(0),
    'coastal-methanol': () => loadMethanolPlant(0),
    'silicon-alumina': () => loadSiliconAlumina(),
    'ree-ionic': () => loadReeIonic(),
    'maglut-long-beach': () => loadMaglutLongBeach(),
    'bioforge-marshall': () => loadBioforgeMarshall(),
    'green-ammonia': () => loadGreenAmmonia(),
    'abundance-hub': () => loadAbundanceHub(),
    'zabuye-hub': () => loadZabuyeHub(),
    'demo-network': () => loadDemoNetwork(),
  };
  document.getElementById('overviewCases')?.addEventListener('change', event => {
    const run = OVERVIEW_CASES[event.target.value];
    if (!run) return;
    try { run(); } catch { /* loaders and sizing write the status line */ }
  });
  for (const name of FOUNDATION_TABS) {
    document.getElementById(TAB_IDS[name].tab)?.addEventListener('click', () => activateTab(name));
  }
  document.getElementById('foundryTabs')?.addEventListener('keydown', handleTabListKeydown);
  document.getElementById('warnings')?.addEventListener('click', event => {
    const jump = event.target.closest?.('[data-issue-node]');
    const nodeId = jump?.dataset.issueNode;
    if (nodeId && graph.nodes.some(item => item.id === nodeId)) {
      selectedNodeId = nodeId;
      const current = node(nodeId);
      const diagnosis = current ? blockDiagnosis(current) : null;
      if (diagnosis) followDiagnosis(diagnosis);
      else {
        activateTab('process');
        render();
      }
      return;
    }
    const tab = event.target.closest?.('[data-issue-tab]')?.dataset.issueTab;
    if (tab) activateTab(tab);
  });
  document.getElementById('sizeToTarget').addEventListener('click', () => {
    const product = document.getElementById('sizeProduct')?.value || 'CH4';
    const rate = Number(document.getElementById('sizeTargetRate').value);
    try {
      sizeToProduct(product, rate);
    } catch {
      /* sizeToProduct writes the status line */
    }
  });
  document.getElementById('sizeForCashflow')?.addEventListener('click', () => {
    try {
      sizeForPositiveCashflow();
    } catch {
      /* sizeForPositiveCashflow writes the status line */
    }
  });
  document.getElementById('overviewDrivers')?.addEventListener('click', event => {
    const target = event.target.closest?.('[data-driver-node], [data-driver-tab], [data-driver-rights]');
    if (!target) return;
    if (target.dataset.driverRights) {
      highlightRightKey = target.dataset.driverRights;
      highlightPort = null;
      const details = document.getElementById('siteRightsDetails');
      if (details) details.open = true;
      activateTab('location');
      renderSiteTruth();
      return;
    }
    highlightRightKey = '';
    highlightPort = null;
    if (target.dataset.driverNode) {
      selectedNodeId = target.dataset.driverNode;
      activateTab('process');
      render();
      return;
    }
    if (target.dataset.driverTab) activateTab(target.dataset.driverTab);
  });
  document.getElementById('addPlantToNetwork').addEventListener('click', beginAddPlant);
  document.getElementById('cancelAddPlant').addEventListener('click', cancelAddPlant);
  document.getElementById('addPlantForm').addEventListener('submit', event => {
    event.preventDefault();
    submitAddPlant(document.getElementById('addPlantName')?.value);
  });
  document.getElementById('addPlantForm').addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cancelAddPlant();
  });
  document.getElementById('clearNetwork').addEventListener('click', clearNetwork);
  document.getElementById('networkPlants').addEventListener('click', handleNetworkPlantClick);
  document.getElementById('networkPlants').addEventListener('submit', event => {
    const form = event.target?.closest?.('[data-rename-form]') || event.target;
    if (!form?.dataset?.renameForm) return;
    event.preventDefault();
    renameNetworkPlant(form.dataset.renameForm, form.querySelector('input')?.value);
  });
  document.getElementById('networkPlants').addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (networkEditor?.type !== 'rename' && networkEditor?.type !== 'remove') return;
    event.preventDefault();
    cancelPlantEdit();
  });
  document.getElementById('siteMonth').addEventListener('change', event => {
    if (!site) return;
    site.month = Number(event.target.value);
    refreshSiteElectricity();
    solveAndRender();
  });
  document.getElementById('applyCoordinates').addEventListener('click', applyCoordinates);
  document.getElementById('overviewSiteName')?.addEventListener('click', event => {
    if (event.target.closest?.('[data-apply-location]')) activateTab('location');
  });
  document.getElementById('sitePreset')?.addEventListener('change', () => { applySitePreset(); });
  document.getElementById('siteLatitude').addEventListener('input', syncSiteMapFromInputs);
  document.getElementById('siteLongitude').addEventListener('input', syncSiteMapFromInputs);
  document.getElementById('siteMapLayers').addEventListener('change', event => {
    const target = event.target;
    const id = target?.getAttribute?.('data-layer') || target?.['data-layer'];
    if (!id || !Object.prototype.hasOwnProperty.call(siteMapEnabled, id)) return;
    siteMapEnabled[id] = !!target.checked;
    if (siteMapEnabled[id] && MapSite?.COLORMAP_LAYER_IDS?.includes(id)) {
      for (const other of MapSite.COLORMAP_LAYER_IDS) {
        if (other === id || !siteMapEnabled[other]) continue;
        siteMapEnabled[other] = false;
        const root = document.getElementById('siteMapLayers');
        const input = root?.querySelector?.(`[data-layer="${other}"]`);
        if (input) input.checked = false;
      }
    }
    syncMapLayerChipState();
    updateSiteMapOverlays();
  });
  document.getElementById('siteFootprint')?.addEventListener('click', event => {
    const pad = event.target.closest?.('[data-footprint-pad]');
    const id = pad?.dataset?.footprintPad || pad?.getAttribute?.('data-footprint-pad');
    if (id) focusFootprintPad(id);
  });
  document.getElementById('siteFootprint')?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const pad = event.target.closest?.('[data-footprint-pad]');
    if (!pad || pad.tagName === 'BUTTON') return;
    event.preventDefault();
    const id = pad.dataset?.footprintPad || pad.getAttribute?.('data-footprint-pad');
    if (id) focusFootprintPad(id);
  });
  document.getElementById('overviewFootprint')?.addEventListener('click', () => activateTab('location'));
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

  let canvasPan = null;
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 1) return;
    const onNode = event.target.closest?.('[data-node]');
    const onPort = event.target.closest?.('[data-port]');
    const middle = event.button === 1;
    const shiftDrag = event.button === 0 && event.shiftKey;
    const background = event.button === 0 && !shiftDrag && !onNode && !onPort;
    if (!middle && !shiftDrag && !background) return;
    event.preventDefault();
    canvasPan = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft || 0, top: canvas.scrollTop || 0, moved: false };
    canvas.classList.add('is-panning');
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!canvasPan) return;
    const dx = event.clientX - canvasPan.x;
    const dy = event.clientY - canvasPan.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) canvasPan.moved = true;
    canvas.scrollLeft = canvasPan.left - dx;
    canvas.scrollTop = canvasPan.top - dy;
  });
  canvas.addEventListener('pointerup', () => {
    if (canvasPan?.moved) suppressClick = true;
    canvasPan = null;
    canvas.classList.remove('is-panning');
  });
  canvas.addEventListener('pointercancel', () => {
    canvasPan = null;
    canvas.classList.remove('is-panning');
  });
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCanvasClick(event);
      return;
    }
    handleProcessKeydown(event);
  });
  inspector.addEventListener('input', handleInspectorInput);
  inspector.addEventListener('change', handleInspectorInput);
  inspector.addEventListener('click', handleInspectorClick);

  function addFromPalette(event) {
    const card = event.target.closest('[data-unit]');
    const unit = card?.dataset.unit;
    if (!unit) return;
    const options = {};
    if (card.dataset.preset) options.preset = card.dataset.preset;
    if (card.dataset.label) options.label = card.dataset.label;
    addNode(unit, options);
    if (window.matchMedia?.('(max-width: 720px)')?.matches) setPaletteDrawer(false);
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
    if (kind === 'converter' || kind === 'buffer') setpoints[id] = definition.rate;
    current.economics = defaultEconomics(current);
    graph.nodes.push(current);
    if (!options.silent) {
      pushUndo({ type: 'add-node', nodeId: id });
      undoGesture = null;
      selectedNodeId = id;
      pendingPort = null;
      solveAndRender();
    }
    return current;
  }

  function configureNewSource(current, options = {}) {
    if (current.unit === 'material-source') {
      current.sourcePreset = options.preset || 'air';
      current.rate = (current.sourcePreset === 'air' || current.sourcePreset === 'flueGas') ? 25000 : 100;
      if (options.label) current.label = options.label;
      else applyPracticalIntakeLabel(current, { force: true });
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
    undoStack = [];
    redoStack = [];
    undoGesture = null;
    syncRedoButton();
    selectedNodeId = null;
    selectedEdgeIndex = null;
    pendingPort = null;
    site = null;
    lastSizing = null;
    preSizingSeed = null;
    operationMeta = {};
    routeNote = '';
    setActiveDemo(null);
    clearCashflowBanner();
    solveAndRender();
  }

  function loadMethaneRecycle() {
    setActiveDemo('methane-recycle', 'Methane recycle');
    lastSizing = null;
    loadCase(SabatierCase.createSabatierCase({ recycleWater: true }), 'sabatier');
  }

  function loadCoastalMethane(month = 0) {
    setActiveDemo('coastal-methane', 'Coastal methane');
    lastSizing = null;
    loadCase(CoastalCase.createCoastalCase(month), 'sabatier');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'Coastal plant loaded. Co-product cashflow ranks CH₄/H₂ setpoints for positive plant net cash; size-to-target remains available.';
    }
  }

  function loadMethanolPlant(month = 0) {
    setActiveDemo('coastal-methanol', 'Coastal methanol');
    lastSizing = null;
    if (typeof MethanolCase === 'undefined' || !MethanolCase.createMethanolCase) {
      throw new Error('Methanol case is not loaded');
    }
    loadCase(MethanolCase.createMethanolCase(month), 'methanol');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'Coastal methanol loaded. Size-to-target methanol sizes DAC, SWRO, electrolyzer, and PV; cashflow stays screening.';
    }
  }

  function loadSiliconAlumina() {
    setActiveDemo('silicon-alumina', 'Mejillones PV BOM (Bayer Al + poly-Si + Ag/glass/EVA)');
    lastSizing = null;
    if (typeof SiliconCase === 'undefined' || !SiliconCase.createSiliconCase) {
      throw new Error('Silicon case is not loaded');
    }
    loadCase(SiliconCase.createSiliconCase(), 'pv-module');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening module assembly on frozen Mejillones PV; may be cash±; not bankable; not a cell fab.';
    }
  }

  function loadReeIonic() {
    setActiveDemo('ree-ionic', 'Minaçu ionic clay → NdPr + mixed REO');
    lastSizing = null;
    if (typeof ReeCase === 'undefined' || !ReeCase.createReeCase) {
      throw new Error('REE case is not loaded');
    }
    loadCase(ReeCase.createReeCase(), 'iac-leach');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'Longnan literature basket on a Minaçu map point; ionic clay leach+precip+calcine; 70% payability; no SX; screening; not a concession; not bankable.';
    }
  }

  function loadMaglutLongBeach() {
    setActiveDemo('maglut-long-beach', 'Long Beach ARC-1 chromatography → NdPr + DyTb');
    lastSizing = null;
    if (typeof MaglutCase === 'undefined' || !MaglutCase.createMaglutCase) {
      throw new Error('Maglut case is not loaded');
    }
    loadCase(MaglutCase.createMaglutCase(), 'chrom');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'Long Beach map point only; ARC-1-style chromatography; proxy SEC/CAPEX; company-reported recovery not a Maglut quote; screening; not bankable.';
    }
  }

  function loadBioforgeMarshall() {
    setActiveDemo('bioforge-marshall', 'Marshall Bioforge gluconic + H₂O₂');
    lastSizing = null;
    if (typeof BioforgeCase === 'undefined' || !BioforgeCase.createBioforgeCase) {
      throw new Error('Bioforge case is not loaded');
    }
    loadCase(BioforgeCase.createBioforgeCase(), 'bioforge');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'Screening GOx dextrose → gluconic + H₂O₂ at a Marshall map point; may be cash−; not the Solugen plant; not an ADM contract; not bankable.';
    }
  }

  function loadGreenAmmonia() {
    setActiveDemo('green-ammonia', 'Walvis Bay green NH₃');
    lastSizing = null;
    if (typeof GreenAmmoniaCase === 'undefined' || !GreenAmmoniaCase.createGreenAmmoniaCase) {
      throw new Error('Green ammonia case is not loaded');
    }
    loadCase(GreenAmmoniaCase.createGreenAmmoniaCase(), 'ammonia');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening air + seawater + sun → NH₃, not chlor-alkali H₂, not bankable.';
    }
  }

  function formatSizingResidual(value) {
    const residual = Number(value);
    if (!Number.isFinite(residual)) return '—';
    if (Math.abs(residual) < 1e-9) return '0';
    if (Math.abs(residual) < 1e-4) return residual.toExponential(2);
    return residual.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  function currentCaseDefinition() {
    const priorities = cleanedPriorities();
    return {
      graph: { nodes: graph.nodes, edges: graph.edges },
      operation: {
        setpoints,
        ...(preSizingSeed ? { preSizingSeed: clone(preSizingSeed) } : {}),
        ...(priorities ? { priorities } : {}),
        ...(operationMeta.boundaryLimitedBy ? { boundaryLimitedBy: operationMeta.boundaryLimitedBy } : {}),
      },
      ...(site ? { site } : {}),
      economics: projectEconomics,
    };
  }

  function cleanedPriorities() {
    const priorities = operationMeta.priorities;
    if (!priorities) return null;
    const connected = id => new Set(graph.edges.filter(edge => edge.from.node === id).map(edge => edge.to.node));
    const ids = new Set(graph.nodes.map(node => node.id));
    const cleaned = {};
    for (const [bus, order] of Object.entries(priorities)) {
      if (!ids.has(bus) || !Array.isArray(order)) continue;
      const consumers = connected(bus);
      const next = order.filter(id => consumers.has(id));
      if (next.length) cleaned[bus] = next;
    }
    return Object.keys(cleaned).length ? cleaned : null;
  }

  function selectionForProduct(product, definition) {
    const nodes = definition?.graph?.nodes || [];
    if (product === 'CH4') return nodes.find(node => node.unit === 'sabatier')?.id;
    if (product === 'H2') return nodes.find(node => node.unit === 'electrolyzer')?.id;
    if (product === 'methanol') return nodes.find(node => node.unit === 'methanol')?.id;
    if (product === 'ammonia') return nodes.find(node => node.unit === 'ammonia')?.id;
    if (product === 'lithium' || product === 'salt') return nodes.find(node => node.unit === 'brine-minerals')?.id;
    return nodes[0]?.id;
  }

  function writeSizeStatus(error) {
    const text = error?.message || String(error || '');
    const status = document.getElementById('sizeToTargetStatus');
    if (status && error) status.textContent = text;
  }

  function sizeToProduct(product, rate, opts = {}) {
    const status = document.getElementById('sizeToTargetStatus');
    if (!globalThis.FlowsheetSize?.sizeToProduct) {
      if (status) status.textContent = 'Sizing engine is not loaded.';
      throw new Error('Sizing engine is not loaded');
    }
    if (!graph.nodes.length) {
      const error = new Error('Size to target needs a loaded flowsheet');
      writeSizeStatus(error);
      throw error;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      const error = new Error('Product rate must be a non-negative kg/day');
      writeSizeStatus(error);
      throw error;
    }
    try {
      lastSizing = FlowsheetSize.sizeToProduct({
        product,
        rate,
        definition: currentCaseDefinition(),
        ...opts,
      });
      loadCase(lastSizing.definition, selectionForProduct(lastSizing.product, lastSizing.definition));
      return lastSizing;
    } catch (error) {
      lastSizing = null;
      writeSizeStatus(error);
      throw error;
    }
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


  function formatCashflowMoney(value) {
    if (!Number.isFinite(value)) return '—';
    if (Math.abs(value) >= 1e6) return formatUncertainMoney(value, 'screening');
    const abs = Math.abs(value);
    const digits = abs >= 1000 ? 0 : abs >= 10 ? 1 : 2;
    return `${value < 0 ? '-' : ''}$${abs.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
  }

  function balancesNeedAttention(solved = result) {
    const residual = Number(solved?.balances?.maxAbsResidual);
    return Number.isFinite(residual) && residual >= 1e-8;
  }

  function clearCashflowBanner() {
    lastCashflowCompare = null;
    renderCashflowResult();
  }

  function clearLocationStaleState() {
    lastSizing = null;
    lastCashflowCompare = null;
    routeNote = '';
    clearCashflowBanner();
    const status = document.getElementById('sizeToTargetStatus');
    if (status) status.textContent = '';
  }

  function renderCashflowResult() {
    const el = document.getElementById('cashflowResult');
    if (!el) return;
    if (!lastCashflowCompare) { el.hidden = true; el.innerHTML = ''; return; }
    const { before, after, objective } = lastCashflowCompare;
    const delta = (after ?? 0) - (before ?? 0);
    const openBalances = balancesNeedAttention();
    const met = Boolean(objective?.met) && !openBalances;
    const products = objective?.activeSaleCount ?? objective?.positiveSaleCount ?? 0;
    const deltaLabel = `${delta >= 0 ? '+' : ''}${formatCashflowMoney(delta)}`;
    const deltaClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : '';
    const afterClass = (after ?? 0) > 0 ? 'positive' : (after ?? 0) < 0 ? 'negative' : '';
    const note = [
      `${products} positive-sale product${products === 1 ? '' : 's'}`,
      met ? 'Objective met' : 'Objective not met',
      met ? '' : 'Kept the best available net cash among searched slates.',
      openBalances ? 'Balances need attention, so this is not treated as a success.' : '',
    ].filter(Boolean).join(' · ');
    el.hidden = false;
    el.innerHTML = `<div class="delta-board" role="group" aria-label="Net cash before and after optimize">
      <div class="delta-cell"><span>Before</span><strong>${formatCashflowMoney(before)}</strong><small>Net cash / year</small></div>
      <div class="delta-cell delta-delta"><span>Delta</span><strong class="${deltaClass}">${deltaLabel}</strong><small>${met ? 'Objective met' : 'Objective not met'}</small></div>
      <div class="delta-cell"><span>After</span><strong class="${afterClass}">${formatCashflowMoney(after)}</strong><small>Net cash / year</small></div>
    </div>
    <p class="delta-note">${note}</p>`;
  }

  function sizeForPositiveCashflow(opts = {}) {
    const status = document.getElementById('sizeToTargetStatus');
    if (!globalThis.FlowsheetSize?.sizeForPositiveCashflow) {
      if (status) status.textContent = 'Cashflow sizing engine is not loaded.';
      throw new Error('Cashflow sizing engine is not loaded');
    }
    if (!graph.nodes.length) {
      const error = new Error('Co-product cashflow sizing needs a loaded flowsheet');
      writeSizeStatus(error);
      throw error;
    }
    const beforeNet = currentEconomics?.annualNetCash;
    try {
      lastSizing = FlowsheetSize.sizeForPositiveCashflow({
        definition: currentCaseDefinition(),
        ...opts,
      });
      const focus = selectionForProduct(lastSizing.selected?.product || 'lithium', lastSizing.definition)
        || selectionForProduct('CH4', lastSizing.definition)
        || lastSizing.definition.graph.nodes.find(node => node.unit === 'brine-minerals')?.id
        || lastSizing.definition.graph.nodes.find(node => node.unit === 'sabatier')?.id;
      loadCase(lastSizing.definition, focus);
      lastCashflowCompare = {
        before: beforeNet,
        after: currentEconomics?.annualNetCash ?? lastSizing.objective?.annualNetCash,
        objective: lastSizing.objective || {},
      };
      renderCashflowResult();
      return lastSizing;
    } catch (error) {
      lastSizing = null;
      lastCashflowCompare = null;
      renderCashflowResult();
      writeSizeStatus(error);
      throw error;
    }
  }

  function refreshSiteElectricity() {
    if (!site?.resources?.electricity) return;
    const hours = FlowsheetSolver.hourlyProfile?.(site);
    const monthly = site.meteo?.monthlyPVKWhPerKWp;
    const fromMonth = Array.isArray(monthly) ? monthly[site.month || 0] : null;
    const daily = hours
      ? hours.reduce((sum, value) => sum + value, 0)
      : Number(fromMonth || site.dailyPVKWhPerKWp) || 0;
    const kWh = daily * Number(site.solarKWp || 0);
    site.resources.electricity.stream = { kind: 'electricity', kWh };
    site.dailyPVKWhPerKWp = daily;
    if (site.meteo) {
      site.meteo.dailyPVKWhPerKWp = hours ? daily : (fromMonth || daily);
    }
    for (const current of graph.nodes.filter(item => item.siteResource === 'electricity')) {
      current.rate = kWh;
      updateSourceStream(current);
    }
  }

  function sitePresets() {
    const data = globalThis.SITE_PRESETS;
    return Array.isArray(data) ? data : [];
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function defaultSiteRights() {
    return {
      gridImport: { kind: 'grid', status: 'unverified', authorize: false, note: 'Unverified grid access; zero authorized imports' },
      freshwater: { kind: 'freshwater', status: 'unverified', authorize: false, note: 'Unverified freshwater access; zero authorized supply' },
      seawaterIntake: { kind: 'intake', status: 'unverified', authorize: false, note: 'No seawater intake permit verified' },
      seawaterDischarge: { kind: 'discharge', status: 'unverified', authorize: false, note: 'No seawater discharge permit verified' },
      brineConcession: { kind: 'concession', status: 'unverified', authorize: false, note: 'No brine or mineral concession verified' },
      saltPurchase: { kind: 'purchase', status: 'unverified', authorize: false, note: 'No salt purchase agreement verified' },
    };
  }

  function rightsFromHints(hints = {}) {
    const rights = defaultSiteRights();
    const keys = RIGHT_KEYS || Object.keys(rights);
    for (const key of keys) {
      const hint = hints[key];
      if (!hint) continue;
      const status = hint.status === 'assumed' ? 'assumed' : 'unverified';
      rights[key] = {
        kind: hint.kind || RIGHT_KINDS?.[key] || rights[key].kind,
        status,
        authorize: status === 'assumed',
        note: hint.note || rights[key].note,
      };
    }
    return rights;
  }

  function populateSitePresets() {
    const select = document.getElementById('sitePreset');
    const presets = sitePresets();
    if (!select || !presets.length) return;
    const groups = [];
    const byRegion = new Map();
    for (const preset of presets) {
      const region = preset.region || 'Other';
      if (!byRegion.has(region)) {
        byRegion.set(region, []);
        groups.push(region);
      }
      byRegion.get(region).push(preset);
    }
    const options = ['<option value="">Choose a site…</option>'];
    for (const region of groups) {
      const items = byRegion.get(region).map(preset => (
        `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`
      )).join('');
      options.push(`<optgroup label="${escapeHtml(region)}">${items}</optgroup>`);
    }
    select.innerHTML = options.join('');
  }

  function presetNear(preset, latitude, longitude) {
    return Math.abs(preset.latitude - latitude) < 0.01 && Math.abs(preset.longitude - longitude) < 0.01;
  }

  function matchingPresetId() {
    const lat = Number(site?.latitude);
    const lon = Number(site?.longitude);
    const presets = sitePresets();
    const named = site?.id ? presets.find(preset => preset.id === site.id) : null;
    if (named && Number.isFinite(lat) && Number.isFinite(lon) && presetNear(named, lat, lon)) return named.id;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return named ? '' : '';
    const match = presets.find(preset => presetNear(preset, lat, lon));
    return match?.id || '';
  }

  function brinePlaceLabel(text, assayId) {
    const blob = `${assayId || ''} ${text || ''}`;
    if (/zabuye|zhabuye/i.test(blob)) return 'Zabuye';
    if (/dead[- ]sea/i.test(blob)) return 'Dead Sea';
    if (/atacama/i.test(blob)) return 'Atacama';
    if (/uyuni/i.test(blob)) return 'Uyuni';
    if (/qaidam/i.test(blob)) return 'Qaidam';
    if (/salton/i.test(blob)) return 'Salton Sea';
    if (/great salt/i.test(blob)) return 'Great Salt Lake';
    if (/danakil|dallol/i.test(blob)) return 'Danakil';
    if (/searles/i.test(blob)) return 'Searles Lake';
    return '';
  }

  function compositionsCompatible(requested, available) {
    if (!requested?.mol || !available?.mol) return true;
    const quantity = sourceAmount(requested);
    const limit = sourceAmount(available);
    if (!(quantity > 0) || !(limit > 0)) return true;
    for (const species of new Set([...Object.keys(available.mol), ...Object.keys(requested.mol)])) {
      const expected = (available.mol[species] || 0) * quantity / limit;
      if (Math.abs((requested.mol[species] || 0) - expected) > Math.max(1, expected) * 1e-9) return false;
    }
    return true;
  }

  function brinePresetClash(preset) {
    const brineNodes = graph.nodes.filter(node => node.siteResource === 'brine' || node.sourcePreset === 'brine');
    if (!brineNodes.length) return '';
    const currentAssay = site?.brineAssay?.assayId || (site?.assay?.kind === 'brine' ? site?.assay?.assayId : null);
    const nextAssay = preset?.brineAssayId || '';
    if (currentAssay && nextAssay && currentAssay === nextAssay) return '';
    const nextStream = nextAssay && globalThis.SiteAssays?.getAssay && globalThis.SiteAssays?.brineFromAssay
      ? SiteAssays.brineFromAssay(SiteAssays.getAssay(nextAssay), 1000)
      : null;
    const breaks = !nextStream || brineNodes.some(node => node.params?.stream && !compositionsCompatible(node.params.stream, nextStream));
    if (!breaks) return '';
    const currentPlace = brinePlaceLabel(site?.name || site?.assay?.summary, currentAssay);
    const nextPlace = brinePlaceLabel(preset?.name, nextAssay) || String(preset?.name || 'that site').split(',')[0];
    const currentPhrase = currentPlace ? `${currentPlace} brine` : 'the current brine';
    return `This plant is sized for ${currentPhrase}. Switching to ${nextPlace} would break the feed. Load a ${nextPlace} demo or keep the current site.`;
  }

  function applySitePreset() {
    const select = document.getElementById('sitePreset');
    const id = select?.value;
    const preset = sitePresets().find(item => item.id === id);
    if (!preset) return;
    const clash = brinePresetClash(preset);
    if (clash) {
      clearLocationStaleState();
      routeNote = clash;
      const status = document.getElementById('siteFetchStatus');
      if (status) status.textContent = clash;
      if (select) select.value = matchingPresetId();
      render();
      return;
    }
    clearLocationStaleState();
    const latEl = document.getElementById('siteLatitude');
    const lonEl = document.getElementById('siteLongitude');
    if (latEl) latEl.value = preset.latitude;
    if (lonEl) lonEl.value = preset.longitude;
    const previous = site || {};
    site = {
      id: preset.id,
      name: preset.name,
      region: preset.region,
      kind: preset.kind,
      latitude: preset.latitude,
      longitude: preset.longitude,
      notes: preset.notes,
      evidence: Array.isArray(preset.evidence) ? preset.evidence.map(item => ({ ...item })) : [],
      rights: rightsFromHints(preset.rightsHints),
      resources: {},
      solarKWp: previous.solarKWp,
      storage: previous.storage,
      month: previous.month || 0,
    };
    if (globalThis.SiteAssays?.bindPresetAssay) {
      globalThis.SiteAssays.bindPresetAssay(site, preset.id);
    } else if (preset.assayId) {
      site.assay = {
        kind: 'seawater',
        assayId: preset.assayId,
        quality: 'cited',
        summary: `Frozen assay ${preset.assayId} (bind when SiteAssays is loaded)`,
        evidence: [],
      };
    } else if (preset.brineAssayId) {
      site.assay = {
        kind: 'brine',
        assayId: preset.brineAssayId,
        quality: 'cited',
        summary: `Frozen process-brine assay ${preset.brineAssayId} (bind when SiteAssays is loaded)`,
        evidence: [],
      };
    } else {
      site.assay = {
        kind: 'seawater',
        quality: 'screening',
        summary: 'No frozen multi-ion assay for this preset — composition not bound.',
        evidence: [],
      };
    }
    render();
    return applyCoordinates({ fromPreset: true });
  }

  function isHourlySolar(solar) {
    return !!(solar && (
      solar.typicalMonths
      || (Array.isArray(solar.annualTypical) && solar.annualTypical.length === 24)
      || (Array.isArray(solar.typicalDayKWhPerKWp) && solar.typicalDayKWhPerKWp.length === 24)
    ));
  }

  function placesMatch(latA, lonA, latB, lonB, tolerance = 0.02) {
    return Number.isFinite(Number(latA)) && Number.isFinite(Number(lonA))
      && Number.isFinite(Number(latB)) && Number.isFinite(Number(lonB))
      && Math.abs(Number(latA) - Number(latB)) <= tolerance
      && Math.abs(Number(lonA) - Number(lonB)) <= tolerance;
  }

  function formatKWp(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? '');
    return String(Number(n.toFixed(2)));
  }

  function formatDisplayNumber(value, digits) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return String(Number(n.toFixed(digits)));
  }

  function displayInputNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    const abs = Math.abs(n);
    const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
    return String(Number(n.toFixed(digits)));
  }

  function nodeDisplayLabel(saved) {
    if (NODE_DISPLAY_LABELS[saved?.id]) return NODE_DISPLAY_LABELS[saved.id];
    if (saved?.unit === 'material-source') {
      const intake = intakeKind(saved);
      if (intake?.label && intake.key !== 'unknown') return intake.label;
      if (saved?.label && !isGenericMaterialSourceLabel(saved.label)) return saved.label;
      return intake?.label || 'Unassigned feed';
    }
    if (saved?.id && saved.id === saved.unit && catalog[saved.unit]?.label) return catalog[saved.unit].label;
    return String(saved?.id || '').split('-').map(word => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
  }

  function humanizeUiText(text) {
    let out = String(text ?? '');
    for (const [id, label] of Object.entries(RIGHT_DISPLAY_LABELS)) {
      out = out.replaceAll(`unverified site right: ${id}`, `unverified site right: ${label}`);
    }
    return out;
  }

  function roundTaggedQuantities(text) {
    return String(text ?? '')
      .replace(/(\d+\.\d{4,})(?=\s*g\/kg\b)/gi, num => formatDisplayNumber(num, 2))
      .replace(/(\d+\.\d{3,})(?=\s*kWp\b)/g, num => formatKWp(num));
  }

  function nearbyPresetId(latitude, longitude) {
    const presets = sitePresets();
    const named = site?.id ? presets.find(item => item.id === site.id) : null;
    if (named && placesMatch(named.latitude, named.longitude, latitude, longitude, 0.25)) return named.id;
    const near = presets.find(item => placesMatch(item.latitude, item.longitude, latitude, longitude, 0.25));
    return near?.id || '';
  }

  function livePvgisHostBlocked() {
    const host = String(globalThis.location?.hostname || '');
    return host === 'github.io' || host.endsWith('.github.io');
  }

  function isPvgisCorsError(error) {
    if (!error) return false;
    if (error.name === 'TypeError') return true;
    return /failed to fetch|networkerror|cors/i.test(String(error.message || error));
  }

  function bindLocation({ latitude, longitude, solarKWp, batteryKWh = 0, solar, name, notes, rights, evidence, keepIdentity = false }) {
    const previous = site;
    const placeChanged = !placesMatch(previous?.latitude, previous?.longitude, latitude, longitude);
    const inheritStory = keepIdentity || !placeChanged;
    const previousMeteo = inheritStory ? previous?.meteo : null;
    const hourlySolar = isHourlySolar(solar) ? solar : null;
    const explicitMonthly = Array.isArray(solar?.monthlyPVKWhPerKWp) ? solar.monthlyPVKWhPerKWp.slice() : null;
    const nextName = keepIdentity
      ? (name || previous?.name || draftSiteLabel())
      : draftSiteLabel();
    const nextId = keepIdentity
      ? (previous?.id || `site-${latitude}-${longitude}`)
      : `site-${latitude}-${longitude}`;
    const kWpLabel = formatKWp(solarKWp);
    const solarStory = solar?.notes
      || (solar?.quality === 'screening'
        ? `Screening-band solar at ${latitude}, ${longitude}. Frozen PVGIS fallback unavailable for this site.`
        : `Solar for ${latitude}, ${longitude}.`);
    site = {
      ...(previous || {}),
      id: nextId,
      name: nextName,
      latitude, longitude, solarKWp, month: previous?.month || 0,
      solar: hourlySolar,
      storage: { batteryKWh, powerKW: batteryKWh, efficiency: 0.9, initialKWh: 0 },
      resources: { ...(previous?.resources || {}) },
      notes: notes || (inheritStory ? previous?.notes : '') || solarStory,
      ...(evidence ? { evidence: evidence.map(item => ({ ...item })) } : {}),
      ...(rights ? { rights } : {}),
    };
    if (!inheritStory && Array.isArray(site.evidence)) {
      site.evidence = site.evidence.filter(item => !/PVGIS|kWh\/kWp/i.test(`${item?.label || ''} ${item?.url || ''}`));
    }
    if (!keepIdentity) {
      delete site.region;
      delete site.kind;
    }
    if (!site.resources.grid) {
      site.resources.grid = { stream: { kind: 'electricity', kWh: 0 }, quality: 'unverified', evidence: 'Unverified grid access; zero authorized imports' };
    }
    if (!site.resources.freshwater) {
      site.resources.freshwater = {
        stream: { kind: 'material', mol: { H2O: 0 }, phase: 'liquid', T_C: 25, P_bar: 1 },
        quality: 'unverified',
        evidence: 'Unverified freshwater access; zero authorized supply',
      };
    }
    const profile = FlowsheetSolver.hourlyProfile?.(site);
    const fallbackHours = hourlySolar?.typicalMonths?.[1]
      ? (hourlySolar.annualTypical || Object.values(hourlySolar.typicalMonths)[0])
      : hourlySolar?.annualTypical;
    const hours = profile?.length ? profile : (Array.isArray(fallbackHours) ? fallbackHours : []);
    const fromMonth = explicitMonthly ? Number(explicitMonthly[site.month || 0]) : NaN;
    const daily = hours.length
      ? hours.reduce((sum, value) => sum + value, 0)
      : (fromMonth > 0 ? fromMonth : (Number(solar?.dailyPVKWhPerKWp) || 0));
    const screening = solar?.quality === 'screening';
    const frozenMonthly = !hourlySolar && !!explicitMonthly;
    site.resources.electricity = {
      stream: { kind: 'electricity', kWh: daily * solarKWp },
      quality: screening ? 'screening' : 'literature-estimate',
      evidence: screening
        ? `Screening-band ~${Number(daily).toFixed(1)} kWh/kWp·day × ${kWpLabel} kWp — not a cited hourly series. Frozen PVGIS fallback unavailable for this site.`
        : frozenMonthly
          ? `Frozen ${solar.source || 'PVGIS'} monthly × ${kWpLabel} kWp`
          : `PVGIS typical-day × ${kWpLabel} kWp`,
    };
    site.dailyPVKWhPerKWp = daily;
    const monthlyPVKWhPerKWp = explicitMonthly
      || (Array.isArray(previousMeteo?.monthlyPVKWhPerKWp) ? previousMeteo.monthlyPVKWhPerKWp : undefined);
    let cite;
    if (solar?.url) {
      cite = {
        label: solar.citeLabel || `${solar.database || solar.source || 'PVGIS'} typical-day solar`,
        url: solar.url,
      };
    } else if (solar?.cite) cite = solar.cite;
    else if (!explicitMonthly) cite = previousMeteo?.cite;
    site.meteo = {
      dailyPVKWhPerKWp: daily,
      ...(monthlyPVKWhPerKWp ? { monthlyPVKWhPerKWp } : {}),
      quality: solar?.quality || 'cited',
      source: solar?.source || solar?.database || previousMeteo?.source || 'PVGIS',
      ...(solar?.retrieved || (!explicitMonthly && previousMeteo?.retrieved)
        ? { retrieved: solar?.retrieved || previousMeteo?.retrieved }
        : {}),
      ...(solar?.notes || (!explicitMonthly && previousMeteo?.notes)
        ? { notes: solar?.notes || previousMeteo?.notes }
        : {}),
      ...(cite ? { cite } : {}),
    };
    if (!site.rights) site.rights = defaultSiteRights();
    if (site.rights.gridImport?.authorize === false) {
      site.resources.grid.stream = { kind: 'electricity', kWh: 0 };
    }
    if (site.rights.freshwater?.authorize === false) {
      site.resources.freshwater.stream = { kind: 'material', mol: { H2O: 0 }, phase: 'liquid', T_C: 25, P_bar: 1 };
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

  function pvgisFamily(source) {
    const head = String(source || 'PVGIS').split('/')[0].trim();
    return head || 'PVGIS';
  }

  function frozenSiteLabel(id) {
    const preset = sitePresets().find(item => item.id === id);
    if (preset?.name) return preset.name;
    return String(id || 'this site').replace(/-pvgis-\d{4}-\d{2}-\d{2}$/, '').replace(/-/g, ' ');
  }

  function diurnalProfile(daily) {
    const shape = Array.from({ length: 24 }, (_, hour) => (
      hour >= 6 && hour <= 17 ? Math.sin(Math.PI * (hour - 6) / 12) : 0
    ));
    const sum = shape.reduce((total, value) => total + value, 0) || 1;
    return shape.map(value => value * daily / sum);
  }

  function screeningSolar(latitude, longitude) {
    const band = MapSite?.pvScreeningBand?.(latitude, longitude);
    const daily = Number(band?.typicalKWhPerKWpDay);
    if (!(daily > 0)) return null;
    const annualTypical = diurnalProfile(daily);
    return {
      solar: {
        annualTypical,
        typicalDayKWhPerKWp: annualTypical,
        dailyPVKWhPerKWp: daily,
        monthlyPVKWhPerKWp: [daily, ...Array.from({ length: 12 }, () => daily)],
        quality: 'screening',
        source: 'pvScreeningBand',
        database: 'pvScreeningBand',
        notes: `Screening-band specific yield ~${daily.toFixed(1)} kWh/kWp·day at ${latitude}, ${longitude}. Frozen PVGIS fallback unavailable for this site. Not a cited PVGIS hourly series.`,
        cite: band.cite,
      },
      status: `Live PVGIS blocked (CORS/network). Frozen PVGIS fallback unavailable for this site. Using screening-band ~${daily.toFixed(1)} kWh/kWp·day — not a cited hourly series. Live seriescalc needs a same-origin proxy.`,
    };
  }

  function nearAlmeria(latitude, longitude) {
    return Math.abs(latitude - 36.834) < 0.2 && Math.abs(longitude + 2.463) < 0.2;
  }

  async function resolveSolarOnFetchFailure(latitude, longitude, siteId) {
    const hourly = globalThis.PvgisAlmeriaHourly;
    if (hourly && nearAlmeria(latitude, longitude)) {
      const retrieved = hourly.retrieved || '2026-09-05';
      return {
        solar: hourly,
        name: 'Almería coast · Spain',
        notes: `Frozen ${pvgisFamily(hourly.database)} typical-day for Almería (retrieved ${retrieved}) at ${latitude}, ${longitude}.`,
        latitude: 36.834,
        longitude: -2.463,
        status: `Live PVGIS blocked (CORS/network). Using frozen ${pvgisFamily(hourly.database)} for Almería (retrieved ${retrieved}).`,
      };
    }
    const sitesApi = globalThis.PvgisSites;
    if (sitesApi?.hydrate) {
      try { await sitesApi.hydrate(); } catch { /* screening band still applies */ }
    }
    const activeId = siteId || nearbyPresetId(latitude, longitude) || '';
    const match = sitesApi?.matchSeries?.(latitude, longitude, { siteId: activeId || undefined, maxDeg: 1 });
    const frozen = match?.id && match.dist != null && match.dist <= 1
      ? sitesApi.frozenSolarFor?.({ id: match.id })
      : null;
    if (frozen && match.series) {
      const retrieved = frozen.retrieved || match.series.retrieved || '';
      const family = pvgisFamily(frozen.source || match.series.source);
      const label = frozenSiteLabel(match.id);
      return {
        solar: {
          monthlyPVKWhPerKWp: frozen.monthlyPVKWhPerKWp,
          dailyPVKWhPerKWp: frozen.dailyPVKWhPerKWp,
          source: frozen.source || match.series.source,
          database: frozen.source || match.series.source,
          retrieved,
          quality: 'cited',
          url: match.series.url || '',
          citeLabel: `${family} monthly, frozen ${retrieved}`.trim(),
          notes: `Frozen ${family} monthly for ${label} (retrieved ${retrieved}) at ${latitude}, ${longitude}. Not a plant-measured irradiance series.`,
        },
        notes: `Frozen ${family} for ${label} (retrieved ${retrieved}) at ${latitude}, ${longitude}.`,
        status: `Live PVGIS blocked (CORS/network). Using frozen ${family} for ${label} (retrieved ${retrieved}).`,
      };
    }
    return screeningSolar(latitude, longitude);
  }

  async function frozenSolarAvailable(latitude, longitude, siteId) {
    if (globalThis.PvgisAlmeriaHourly && nearAlmeria(latitude, longitude)) return true;
    const sitesApi = globalThis.PvgisSites;
    if (sitesApi?.hydrate) {
      try { await sitesApi.hydrate(); } catch { /* screening band still applies */ }
    }
    const match = sitesApi?.matchSeries?.(latitude, longitude, { siteId: siteId || undefined, maxDeg: 1 });
    return !!(match?.id && match.dist != null && match.dist <= 1 && sitesApi.frozenSolarFor?.({ id: match.id }));
  }

  function readSolarKWp() {
    const input = document.getElementById('siteSolarKWp');
    const typed = Number(input?.value);
    const full = Number(input?.dataset?.fullKwp);
    if (Number.isFinite(full) && Number.isFinite(typed) && Math.abs(typed - Number(formatDisplayNumber(full, 2))) < 1e-9) {
      return full;
    }
    return typed;
  }

  async function bindResolvedSolar(latitude, longitude, solarKWp, batteryKWh, identity, activeId, status) {
    const resolved = await resolveSolarOnFetchFailure(latitude, longitude, activeId);
    if (!resolved?.solar) {
      status.textContent = 'Live PVGIS blocked (CORS/network). Frozen PVGIS fallback unavailable for this site. No screening yield for this point.';
      render();
      return;
    }
    const boundLatitude = resolved.latitude ?? latitude;
    const boundLongitude = resolved.longitude ?? longitude;
    const latEl = document.getElementById('siteLatitude');
    const lonEl = document.getElementById('siteLongitude');
    if (latEl) latEl.value = boundLatitude;
    if (lonEl) lonEl.value = boundLongitude;
    const moved = !placesMatch(site?.latitude, site?.longitude, boundLatitude, boundLongitude);
    bindLocation({
      latitude: boundLatitude,
      longitude: boundLongitude,
      solarKWp,
      batteryKWh,
      solar: resolved.solar,
      notes: identity.keepIdentity || !moved ? undefined : (resolved.notes || resolved.solar.notes),
      ...identity,
    });
    status.textContent = resolved.status;
  }

  async function applyCoordinates(options = {}) {
    const fromPreset = options.fromPreset === true;
    const latitude = Number(document.getElementById('siteLatitude').value);
    const longitude = Number(document.getElementById('siteLongitude').value);
    const solarKWp = readSolarKWp();
    const batteryKWh = Math.max(0, Number(document.getElementById('siteBatteryKWh').value) || 0);
    const status = document.getElementById('siteFetchStatus');
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90) {
      status.textContent = 'Latitude and longitude must be a real location.';
      return;
    }
    if (!fromPreset) {
      clearLocationStaleState();
      const select = document.getElementById('sitePreset');
      const chosen = sitePresets().find(preset => preset.id === select?.value);
      if (select && (!chosen || !presetNear(chosen, latitude, longitude))) select.value = '';
    }
    const identity = fromPreset
      ? { keepIdentity: true, name: site?.name }
      : { keepIdentity: false };
    const activeId = fromPreset ? (site?.id || nearbyPresetId(latitude, longitude)) : nearbyPresetId(latitude, longitude);
    // seriescalc is cross-origin and fails CORS on GitHub Pages. Use the
    // same-origin freeze when one exists for this point, and after the first
    // CORS failure do not keep calling seriescalc.
    const skipLive = livePvgisBlocked || (livePvgisHostBlocked() && await frozenSolarAvailable(latitude, longitude, activeId));
    if (skipLive) {
      status.textContent = 'Updating solar for these coordinates…';
      await bindResolvedSolar(latitude, longitude, solarKWp, batteryKWh, identity, activeId, status);
      return;
    }
    status.textContent = 'Fetching PVGIS hourly series…';
    try {
      const solar = await fetchPvgisHourly(latitude, longitude);
      const moved = !placesMatch(site?.latitude, site?.longitude, latitude, longitude);
      bindLocation({
        latitude, longitude, solarKWp, batteryKWh, solar,
        notes: identity.keepIdentity || !moved ? undefined : `Typical-day solar from ${solar.database || 'PVGIS'} at ${latitude}, ${longitude}.`,
        ...identity,
      });
      status.textContent = `Typical-day solar from ${solar.database || 'PVGIS'} ${solar.year || ''}`.trim();
    } catch (error) {
      if (isPvgisCorsError(error)) livePvgisBlocked = true;
      await bindResolvedSolar(latitude, longitude, solarKWp, batteryKWh, identity, activeId, status);
    }
  }

  async function fetchPvgisHourly(latitude, longitude) {
    // Live seriescalc is cross-origin and fails CORS on GitHub Pages.
    // applyCoordinates then uses a frozen series or the screening band.
    // Live hourly needs a same-origin proxy; this repo does not ship one.
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
    setActiveDemo('abundance-hub', 'Brine + ammonia');
    lastSizing = null;
    const definition = globalThis.NetworkCase?.siteDeadSeaAbundance
      ? NetworkCase.siteDeadSeaAbundance()
      : AbundanceCase.createAbundanceCase();
    loadCase(definition, 'minerals');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) status.textContent = 'Dead Sea hub loaded. Size for co-product cashflow expands the mineral/chemical slate while keeping plant net cash positive.';
  }

  function loadZabuyeHub() {
    setActiveDemo('zabuye-hub', 'Zabuye brine hub');
    lastSizing = null;
    if (!globalThis.NetworkCase?.siteZabuyeAbundance) {
      throw new Error('Zabuye abundance case is not loaded');
    }
    loadCase(NetworkCase.siteZabuyeAbundance(), 'minerals');
    return sizeForPositiveCashflow();
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

  function defaultPlantName() {
    const base = String(site?.name || '').trim() || 'Current plant';
    const names = new Set(network.plants.map(plant => plant.name));
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} ${n}`)) n += 1;
    return `${base} ${n}`;
  }

  function setNetworkNotice(message) {
    networkNotice = message || '';
  }

  function focusPlantField(input) {
    if (!input) return;
    input.focus?.();
    input.select?.();
  }

  function beginAddPlant() {
    networkEditor = { type: 'add' };
    setNetworkNotice('');
    renderNetwork();
    const input = document.getElementById('addPlantName');
    if (!input) return;
    input.value = defaultPlantName();
    focusPlantField(input);
  }

  function cancelAddPlant() {
    networkEditor = null;
    const input = document.getElementById('addPlantName');
    if (input) input.value = '';
    setNetworkNotice('Add canceled.');
    renderNetwork();
    return false;
  }

  function submitAddPlant(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      setNetworkNotice('Enter a name to add this plant.');
      renderNetwork();
      focusPlantField(document.getElementById('addPlantName'));
      return false;
    }
    networkEditor = null;
    setNetworkNotice(`Added ${trimmed}.`);
    addCurrentPlant(trimmed);
    return true;
  }

  function beginRenamePlant(id) {
    if (!network.plants.some(plant => plant.id === id)) return false;
    networkEditor = { type: 'rename', id };
    setNetworkNotice('');
    renderNetwork();
    focusPlantField(document.querySelector(`[data-rename-form="${id}"] input`));
    return true;
  }

  function beginRemovePlant(id) {
    if (!network.plants.some(plant => plant.id === id)) return false;
    networkEditor = { type: 'remove', id };
    setNetworkNotice('');
    renderNetwork();
    return true;
  }

  function cancelPlantEdit(message) {
    const pending = networkEditor?.type;
    if (pending === 'add') return cancelAddPlant();
    if (pending !== 'rename' && pending !== 'remove') return false;
    networkEditor = null;
    setNetworkNotice(message || (pending === 'rename' ? 'Rename canceled.' : 'Remove canceled.'));
    renderNetwork();
    return false;
  }

  function renameNetworkPlant(id, name) {
    const plant = network.plants.find(item => item.id === id);
    if (!plant) return false;
    const trimmed = String(name ?? '').trim();
    if (!trimmed || trimmed === plant.name) {
      networkEditor = null;
      setNetworkNotice('Rename canceled.');
      renderNetwork();
      return false;
    }
    plant.name = trimmed;
    networkEditor = null;
    setNetworkNotice(`Renamed to ${trimmed}.`);
    refreshNetwork();
    return true;
  }

  function removeNetworkPlant(id) {
    if (!network.plants.some(plant => plant.id === id)) return false;
    network.plants = network.plants.filter(plant => plant.id !== id);
    network.corridors = (network.corridors || []).filter(corridor => corridor.from?.plant !== id && corridor.to?.plant !== id);
    networkEditor = null;
    setNetworkNotice('Plant removed.');
    if (!network.plants.length) {
      networkResult = null;
      persistNetwork();
      renderNetwork();
      renderSiteMap();
      return true;
    }
    refreshNetwork();
    return true;
  }

  function handleNetworkPlantClick(event) {
    const openId = event.target.closest?.('[data-open-plant]')?.dataset.openPlant;
    if (openId) {
      openNetworkPlant(openId);
      return;
    }
    const renameId = event.target.closest?.('[data-rename-plant]')?.dataset.renamePlant;
    if (renameId) {
      beginRenamePlant(renameId);
      return;
    }
    const removeId = event.target.closest?.('[data-remove-plant]')?.dataset.removePlant;
    if (removeId) {
      beginRemovePlant(removeId);
      return;
    }
    if (event.target.closest?.('[data-cancel-rename]') || event.target.closest?.('[data-cancel-remove]')) {
      cancelPlantEdit();
      return;
    }
    const confirmId = event.target.closest?.('[data-confirm-remove]')?.dataset.confirmRemove;
    if (confirmId) removeNetworkPlant(confirmId);
  }

  function clearNetwork() {
    network = { plants: [], corridors: [] };
    networkResult = null;
    networkEditor = null;
    setNetworkNotice('Network cleared.');
    persistNetwork();
    renderNetwork();
    renderSiteMap();
  }

  const MINERAL_SALE_IDS = new Set([
    'lithium', 'magnesium', 'potash', 'gypsum', 'salt', 'recovered-salt',
    'caustic', 'bromine', 'bromide', 'ammonia', 'ammonia-product', 'oxygen',
  ]);

  function mineralSaleRevenue(plant) {
    const sinks = plant?.economics?.sinks;
    if (!Array.isArray(sinks)) return 0;
    return sinks.reduce((sum, sink) => {
      if (sink.disposition !== 'sale' || !(Number(sink.deliveredAmount) > 0)) return sum;
      if (!MINERAL_SALE_IDS.has(sink.id)) return sum;
      return sum + (Number(sink.annualRevenue) || 0);
    }, 0);
  }

  function mineralLeadPlantId() {
    const ranked = (networkResult?.plants || [])
      .map(plant => ({ id: plant.id, revenue: mineralSaleRevenue(plant) }))
      .filter(item => item.id && item.revenue > 0)
      .sort((left, right) => right.revenue - left.revenue);
    if (ranked.length) return ranked[0].id;
    const named = network.plants.find(plant => /mineral|brine|dead-sea/i.test(`${plant.id} ${plant.name}`));
    return named?.id || null;
  }

  function loadDemoNetwork() {
    setActiveDemo('demo-network', 'Fuels + minerals');
    network = clone(NetworkCase.createFuelsAndMineralsNetwork(6));
    refreshNetwork();
    const id = mineralLeadPlantId()
      || network.plants.find(plant => plant.id === 'dead-sea-minerals')?.id
      || network.plants[0]?.id;
    if (id) openNetworkPlant(id);
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
    renderSiteMap();
  }

  function persistNetwork() {
    if (!storage) return;
    try { storage.setItem(NETWORK_KEY, JSON.stringify({ plants: network.plants, corridors: network.corridors })); } catch { /* ignore */ }
  }

  function adoptPreSizingSeed(definition) {
    const seed = definition?.operation?.preSizingSeed;
    preSizingSeed = seed && Number(seed.brineKg) > 0 && seed.streams ? clone(seed) : null;
  }

  function loadCase(definition, selection) {
    clearCashflowBanner();
    routeNote = '';
    adoptPreSizingSeed(definition);
    site = definition.site || null;
    operationMeta = {
      priorities: definition.operation?.priorities ? clone(definition.operation.priorities) : undefined,
      boundaryLimitedBy: definition.operation?.boundaryLimitedBy
        ? clone(definition.operation.boundaryLimitedBy)
        : undefined,
    };
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
        label: nodeDisplayLabel(saved),
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
    undoStack = [];
    redoStack = [];
    undoGesture = null;
    syncRedoButton();
    autoArrange();
    solveAndRender();
    const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => fn();
    schedule(() => fitCanvas());
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
    return { version: 1, graph, setpoints, selectedNodeId, projectEconomics, canvasZoom, site, preSizingSeed };
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
    for (const current of graph.nodes) {
      current.economics ||= defaultEconomics(current);
      applyPracticalIntakeLabel(current);
    }
    Object.assign(projectEconomics, saved.projectEconomics || {});
    canvasZoom = clampZoom(saved.canvasZoom ?? 1);
    site = saved.site || null;
    preSizingSeed = saved.preSizingSeed && Number(saved.preSizingSeed.brineKg) > 0 ? clone(saved.preSizingSeed) : null;
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
    clearCashflowBanner();
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
      ['Annualized CAPEX', current.annualizedCapex, previous.annualizedCapex, formatMoney],
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
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function startDrag(event) {
    if (event.button === 1 || event.shiftKey) return;
    if (event.target.closest('[data-port]')) return;
    const nodeId = event.target.closest('[data-node]')?.dataset.node;
    if (!nodeId) return;
    const point = graphPoint(event);
    const position = node(nodeId).position;
    dragging = {
      nodeId,
      pointerId: event.pointerId,
      dx: point.x - position.x,
      dy: point.y - position.y,
      moved: false,
      origin: { x: position.x, y: position.y },
    };
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
    const drag = dragging;
    suppressClick = drag.moved;
    canvas.releasePointerCapture?.(event.pointerId);
    dragging = null;
    if (drag.moved && drag.origin) {
      const current = node(drag.nodeId);
      const same = current && current.position.x === drag.origin.x && current.position.y === drag.origin.y;
      if (!same) {
        pushUndo({ type: 'move', nodeId: drag.nodeId, position: { x: drag.origin.x, y: drag.origin.y } });
        undoGesture = null;
      }
    }
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

  function isTypingTarget(el) {
    if (!el || typeof el !== 'object') return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function rememberUndo(entry) {
    undoStack.push(entry);
    if (undoStack.length > UNDO_STACK_MAX) undoStack.shift();
  }

  function syncRedoButton() {
    const button = document.getElementById('redoCanvas');
    if (!button) return;
    const empty = redoStack.length === 0;
    button.disabled = empty;
    if (typeof button.setAttribute === 'function') button.setAttribute('aria-disabled', empty ? 'true' : 'false');
  }

  function pushUndo(entry) {
    rememberUndo(entry);
    redoStack = [];
    syncRedoButton();
  }

  function pushRedo(entry) {
    redoStack.push(entry);
    if (redoStack.length > UNDO_STACK_MAX) redoStack.shift();
    syncRedoButton();
  }

  function cloneUndo(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function snapshotEntry() {
    return {
      type: 'snapshot',
      graph: { nodes: cloneUndo(graph.nodes), edges: cloneUndo(graph.edges) },
      setpoints: cloneUndo(setpoints),
      selectedNodeId,
      selectedEdgeIndex,
    };
  }

  function inspectorUndoKey(target) {
    if (!target || !target.name) return null;
    const names = new Set([
      'requestedRate', 'dacRoute', 'processPreset', 'siteResource', 'chemicalId',
      'processParameter', 'bufferParameter', 'sinkParameter', 'sourceParameter',
      'sourceRate', 'sourcePreset', 'heatTemperature', 'branchWeight', 'branchPriority',
      'edgeCapacity', 'economics',
    ]);
    if (!names.has(target.name)) return null;
    const detail = target.dataset?.param || target.dataset?.economics || target.dataset?.edge || '';
    return `${target.name}:${detail}:${selectedNodeId || ''}:${selectedEdgeIndex ?? ''}`;
  }

  function noteInspectorUndo(event) {
    const key = inspectorUndoKey(event.target);
    if (!key) return;
    const same = undoGesture && undoGesture.key === key;
    if (!same) {
      pushUndo(snapshotEntry());
      undoGesture = { key };
    }
    if (event.type === 'change') undoGesture = null;
  }

  function deleteSelection() {
    if (selectedEdgeIndex != null && Number.isFinite(Number(selectedEdgeIndex))
      && selectedEdgeIndex >= 0 && selectedEdgeIndex < graph.edges.length) {
      const edgeIndex = selectedEdgeIndex;
      const edge = graph.edges[edgeIndex];
      pushUndo({ type: 'edge', edgeIndex, edge: JSON.parse(JSON.stringify(edge)) });
      graph.edges.splice(edgeIndex, 1);
      selectedEdgeIndex = null;
      pendingPort = null;
      solveAndRender();
      return true;
    }
    if (selectedNodeId && node(selectedNodeId)) {
      const id = selectedNodeId;
      const index = graph.nodes.findIndex(candidate => candidate.id === id);
      if (index < 0) return false;
      const removedNode = JSON.parse(JSON.stringify(graph.nodes[index]));
      const removedEdges = graph.edges
        .map((edge, edgeIndex) => ({ edgeIndex, edge }))
        .filter(item => item.edge.from.node === id || item.edge.to.node === id)
        .map(item => ({ edgeIndex: item.edgeIndex, edge: JSON.parse(JSON.stringify(item.edge)) }));
      const setpoint = setpoints[id];
      pushUndo({
        type: 'node',
        nodeIndex: index,
        node: removedNode,
        edges: removedEdges,
        setpoint: setpoint === undefined ? undefined : JSON.parse(JSON.stringify(setpoint)),
      });
      graph.edges = graph.edges.filter(edge => edge.from.node !== id && edge.to.node !== id);
      graph.nodes.splice(index, 1);
      delete setpoints[id];
      selectedNodeId = null;
      selectedEdgeIndex = null;
      pendingPort = null;
      solveAndRender();
      return true;
    }
    return false;
  }

  function applyHistorySnapshot(entry) {
    const restored = entry.graph || { nodes: [], edges: [] };
    graph.nodes.splice(0, graph.nodes.length, ...cloneUndo(restored.nodes || []));
    graph.edges.splice(0, graph.edges.length, ...cloneUndo(restored.edges || []));
    for (const key of Object.keys(setpoints)) delete setpoints[key];
    Object.assign(setpoints, cloneUndo(entry.setpoints || {}));
    selectedNodeId = entry.selectedNodeId ?? null;
    selectedEdgeIndex = entry.selectedEdgeIndex ?? null;
    pendingPort = null;
    solveAndRender();
  }

  function applyMove(entry) {
    const current = node(entry.nodeId);
    if (!current) return null;
    const forward = { type: 'move', nodeId: entry.nodeId, position: { x: current.position.x, y: current.position.y } };
    current.position = { x: entry.position.x, y: entry.position.y };
    selectedNodeId = entry.nodeId;
    selectedEdgeIndex = null;
    pendingPort = null;
    render();
    persistAutosave();
    return forward;
  }

  function removeNodeById(id) {
    const index = graph.nodes.findIndex(candidate => candidate.id === id);
    if (index < 0) return null;
    const removedNode = cloneUndo(graph.nodes[index]);
    const removedEdges = graph.edges
      .map((edge, edgeIndex) => ({ edgeIndex, edge }))
      .filter(item => item.edge.from.node === id || item.edge.to.node === id)
      .map(item => ({ edgeIndex: item.edgeIndex, edge: cloneUndo(item.edge) }));
    const setpoint = setpoints[id];
    graph.edges = graph.edges.filter(edge => edge.from.node !== id && edge.to.node !== id);
    graph.nodes.splice(index, 1);
    delete setpoints[id];
    selectedNodeId = null;
    selectedEdgeIndex = null;
    pendingPort = null;
    solveAndRender();
    return {
      type: 'restore-node',
      nodeIndex: index,
      node: removedNode,
      edges: removedEdges,
      setpoint: setpoint === undefined ? undefined : cloneUndo(setpoint),
    };
  }

  function restoreNode(entry) {
    const idx = Math.min(Math.max(0, entry.nodeIndex), graph.nodes.length);
    graph.nodes.splice(idx, 0, cloneUndo(entry.node));
    const sorted = [...(entry.edges || [])].sort((a, b) => a.edgeIndex - b.edgeIndex);
    for (const item of sorted) {
      const at = Math.min(Math.max(0, item.edgeIndex), graph.edges.length);
      graph.edges.splice(at, 0, cloneUndo(item.edge));
    }
    if (entry.setpoint !== undefined) setpoints[entry.node.id] = cloneUndo(entry.setpoint);
    selectedNodeId = entry.node.id;
    selectedEdgeIndex = null;
    pendingPort = null;
    solveAndRender();
    return { type: 'add-node', nodeId: entry.node.id };
  }

  function removeEdgeObject(edge) {
    const idx = graph.edges.indexOf(edge);
    if (idx < 0) return null;
    graph.edges.splice(idx, 1);
    selectedEdgeIndex = null;
    selectedNodeId = edge?.from?.node || selectedNodeId;
    pendingPort = null;
    solveAndRender();
    return { type: 'restore-edge', edgeIndex: idx, edge: cloneUndo(edge) };
  }

  function restoreEdge(entry) {
    const idx = Math.min(Math.max(0, entry.edgeIndex), graph.edges.length);
    const edge = cloneUndo(entry.edge);
    graph.edges.splice(idx, 0, edge);
    selectedEdgeIndex = idx;
    selectedNodeId = null;
    pendingPort = null;
    solveAndRender();
    return { type: 'add-edge', edge };
  }

  function applyUndo(entry) {
    if (entry.type === 'snapshot') {
      const forward = snapshotEntry();
      applyHistorySnapshot(entry);
      return forward;
    }
    if (entry.type === 'move') return applyMove(entry);
    if (entry.type === 'add-node') return removeNodeById(entry.nodeId);
    if (entry.type === 'add-edge') return removeEdgeObject(entry.edge);
    if (entry.type === 'edge') {
      const idx = Math.min(Math.max(0, entry.edgeIndex), graph.edges.length);
      graph.edges.splice(idx, 0, entry.edge);
      selectedEdgeIndex = idx;
      selectedNodeId = null;
      pendingPort = null;
      solveAndRender();
      return { type: 'drop-edge', edge: entry.edge };
    }
    if (entry.type === 'node') {
      restoreNode(entry);
      return { type: 'drop-node', nodeId: entry.node.id };
    }
    return null;
  }

  function applyRedo(entry) {
    if (entry.type === 'snapshot') {
      const back = snapshotEntry();
      applyHistorySnapshot(entry);
      return back;
    }
    if (entry.type === 'move') return applyMove(entry);
    if (entry.type === 'restore-node') return restoreNode(entry);
    if (entry.type === 'restore-edge') return restoreEdge(entry);
    if (entry.type === 'drop-edge') {
      const idx = graph.edges.indexOf(entry.edge);
      if (idx < 0) return null;
      const edge = entry.edge;
      graph.edges.splice(idx, 1);
      selectedEdgeIndex = null;
      pendingPort = null;
      solveAndRender();
      return { type: 'edge', edgeIndex: idx, edge };
    }
    if (entry.type === 'drop-node') {
      const removed = removeNodeById(entry.nodeId);
      if (!removed) return null;
      return {
        type: 'node',
        nodeIndex: removed.nodeIndex,
        node: removed.node,
        edges: removed.edges,
        setpoint: removed.setpoint,
      };
    }
    return null;
  }

  function undoLast() {
    const entry = undoStack.pop();
    undoGesture = null;
    if (!entry) {
      syncRedoButton();
      return false;
    }
    const forward = applyUndo(entry);
    if (!forward) {
      syncRedoButton();
      return false;
    }
    pushRedo(forward);
    return true;
  }

  function redoLast() {
    const entry = redoStack.pop();
    undoGesture = null;
    if (!entry) {
      syncRedoButton();
      return false;
    }
    const back = applyRedo(entry);
    if (!back) {
      syncRedoButton();
      return false;
    }
    rememberUndo(back);
    syncRedoButton();
    return true;
  }

  function clearCanvasSelection() {
    const had = selectedNodeId != null || selectedEdgeIndex != null || pendingPort != null;
    selectedNodeId = null;
    selectedEdgeIndex = null;
    pendingPort = null;
    highlightPort = null;
    if (had) render();
    return had;
  }

  function nudgeSelectedNode(dx, dy) {
    const current = node(selectedNodeId);
    if (!current) return false;
    if (!current.position) current.position = { x: 40, y: 40 };
    const key = `nudge:${current.id}`;
    if (!undoGesture || undoGesture.key !== key) {
      pushUndo({ type: 'move', nodeId: current.id, position: { x: current.position.x, y: current.position.y } });
      undoGesture = { key };
    }
    current.position.x = Math.max(10, current.position.x + dx);
    current.position.y = Math.max(10, current.position.y + dy);
    renderGraph();
    persistAutosave();
    return true;
  }

  function toggleShortcutsHint(force) {
    const hint = document.getElementById('processShortcuts');
    if (!hint) return;
    if (force === true) hint.open = true;
    else if (force === false) hint.open = false;
    else hint.open = !hint.open;
  }

  function handleProcessKeydown(event) {
    if (activeTab !== 'process') {
      if (event.key === 'Escape' && canvasFocused) setCanvasFocus(false);
      return;
    }
    if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) {
      if (event.key === 'Escape' && canvasFocused) setCanvasFocus(false);
      return;
    }
    const key = event.key;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === 'z' || key === 'Z')) {
      event.preventDefault();
      if (event.shiftKey) redoLast();
      else undoLast();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === 'y' || key === 'Y')) {
      event.preventDefault();
      redoLast();
      return;
    }
    if (key === 'Escape') {
      event.preventDefault();
      if (canvasFocused) setCanvasFocus(false);
      clearCanvasSelection();
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (key === '?' || (key === '/' && event.shiftKey)) {
      event.preventDefault();
      toggleShortcutsHint();
      return;
    }
    if (key === '+' || key === '=' ) {
      event.preventDefault();
      setCanvasZoom(canvasZoom + 0.1);
      return;
    }
    if (key === '-' || key === '_') {
      event.preventDefault();
      setCanvasZoom(canvasZoom - 0.1);
      return;
    }
    const step = event.shiftKey ? 40 : 10;
    if (key === 'ArrowLeft') { event.preventDefault(); nudgeSelectedNode(-step, 0); return; }
    if (key === 'ArrowRight') { event.preventDefault(); nudgeSelectedNode(step, 0); return; }
    if (key === 'ArrowUp') { event.preventDefault(); nudgeSelectedNode(0, -step); return; }
    if (key === 'ArrowDown') { event.preventDefault(); nudgeSelectedNode(0, step); return; }
  }

  function clampZoom(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n));
  }

  function setCanvasZoom(value) {
    zoomPinned = true;
    canvasZoom = clampZoom(value);
    renderGraph();
    persistAutosave();
  }

  function contentSize() {
    const hasRecycle = graph.edges.some(edge => edge.recycle);
    const maxX = Math.max(0, ...graph.nodes.map(current => current.position.x + NODE_WIDTH));
    const maxY = Math.max(0, ...graph.nodes.map(current => current.position.y + nodeHeight(current)));
    return {
      width: Math.max(320, maxX + 48 + ISO_DX),
      height: Math.max(220, maxY + (hasRecycle ? 120 : 48) + ISO_DY),
    };
  }

  function fitCanvas(options) {
    const compact = !!(options && options.compact === true);
    if (!graph.nodes.length) {
      zoomPinned = false;
      canvasZoom = 1;
      renderGraph();
      canvas.scrollTop = 0;
      canvas.scrollLeft = 0;
      persistAutosave();
      return;
    }
    const rawW = Number(canvas.clientWidth) || 0;
    const rawH = Number(canvas.clientHeight) || 0;
    if (rawW < 40) return;
    const availW = Math.max(120, rawW - 8);
    const availH = Math.max(120, (rawH || rawW) - 8);
    let size = contentSize();
    let widthZoom = availW / Math.max(size.width, 1);
    if (compact && widthZoom < READABLE_ZOOM) {
      autoArrange({ columnGap: 36, rowGap: 28 });
      size = contentSize();
      widthZoom = availW / Math.max(size.width, 1);
    }
    const heightZoom = availH / Math.max(size.height, 1);
    let zoom = Math.min(widthZoom, 1);
    if (heightZoom >= READABLE_ZOOM) zoom = Math.min(zoom, heightZoom);
    zoomPinned = false;
    canvasZoom = clampZoom(zoom);
    renderGraph();
    canvas.scrollTop = 0;
    canvas.scrollLeft = 0;
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

  function autoArrange(options) {
    const columnGap = options && Number.isFinite(options.columnGap) ? options.columnGap : COLUMN_GAP;
    const rowGap = options && Number.isFinite(options.rowGap) ? options.rowGap : 40;
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
    const xStep = NODE_WIDTH + columnGap;
    const layerHeights = [...layers.values()].map(layer => layer.reduce(
      (sum, current) => sum + nodeHeight(current), Math.max(0, layer.length - 1) * rowGap
    ));
    const tallestLayer = Math.max(0, ...layerHeights);
    for (const [depth, layer] of layers) {
      const layerHeight = layer.reduce(
        (sum, current) => sum + nodeHeight(current), Math.max(0, layer.length - 1) * rowGap
      );
      let y = 40 + (tallestLayer - layerHeight) / 2;
      for (const current of layer) {
        current.position = { x: 40 + depth * xStep, y };
        y += nodeHeight(current) + rowGap;
      }
    }
    persistAutosave();
    renderGraph();
  }

  function tabNameFromButton(button) {
    if (!button) return '';
    const controls = button.getAttribute?.('aria-controls') || button['aria-controls'] || '';
    const fromControls = String(controls).replace(/^panel/i, '').toLowerCase();
    if (FOUNDATION_TABS.includes(fromControls)) return fromControls;
    const id = button.id || '';
    const fromId = String(id).replace(/^tab/i, '').toLowerCase();
    return FOUNDATION_TABS.includes(fromId) ? fromId : '';
  }

  function readSavedTab() {
    if (!storage) return 'overview';
    try {
      const value = storage.getItem(TAB_KEY);
      return FOUNDATION_TABS.includes(value) ? value : 'overview';
    } catch {
      return 'overview';
    }
  }

  function persistTab(name) {
    if (!storage) return;
    try { storage.setItem(TAB_KEY, name); } catch { /* ignore */ }
  }

  function scheduleMapInvalidate() {
    if (!siteMap || typeof siteMap.invalidateSize !== 'function') return;
    const invalidate = () => { try { siteMap.invalidateSize({ animate: false }); } catch { /* ignore */ } };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(invalidate);
    else invalidate();
  }

  function activateTab(name) {
    const next = FOUNDATION_TABS.includes(name) ? name : 'overview';
    activeTab = next;
    for (const tab of FOUNDATION_TABS) {
      const selected = tab === next;
      const ids = TAB_IDS[tab];
      const button = document.getElementById(ids.tab);
      const panel = document.getElementById(ids.panel);
      if (button) {
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        button.classList[selected ? 'add' : 'remove']('is-active');
      }
      if (panel) {
        panel.hidden = !selected;
        panel.classList[selected ? 'add' : 'remove']('is-active');
      }
    }
    document.body.setAttribute('data-tab', next);
    persistTab(next);
    if (next === 'location') scheduleMapInvalidate();
    if (next === 'process' && graph.nodes.length) {
      const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => fn();
      schedule(() => { try { fitCanvas(); } catch { /* ignore */ } });
    }
    return next;
  }

  function handleTabListKeydown(event) {
    const current = tabNameFromButton(event.target.closest?.('[role="tab"]') || event.target);
    if (!current) return;
    const index = FOUNDATION_TABS.indexOf(current);
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = FOUNDATION_TABS[(index + 1) % FOUNDATION_TABS.length];
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = FOUNDATION_TABS[(index - 1 + FOUNDATION_TABS.length) % FOUNDATION_TABS.length];
    else if (event.key === 'Home') next = FOUNDATION_TABS[0];
    else if (event.key === 'End') next = FOUNDATION_TABS[FOUNDATION_TABS.length - 1];
    else return;
    event.preventDefault?.();
    activateTab(next);
    document.getElementById(TAB_IDS[next].tab)?.focus?.();
  }

  function setCanvasFocus(on) {
    const wasFocused = canvasFocused;
    canvasFocused = !!on;
    if (canvasFocused) activateTab('process');
    document.body.classList[canvasFocused ? 'add' : 'remove']('canvas-focus');
    const button = document.getElementById('focusCanvas');
    if (button) {
      button.textContent = canvasFocused ? 'Show panels' : 'Focus canvas';
      button.setAttribute('aria-pressed', String(canvasFocused));
    }
    const exit = document.getElementById('exitFocus');
    if (exit) exit.hidden = !canvasFocused;
    if (wasFocused && !canvasFocused && graph.nodes.length) {
      const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => fn();
      schedule(() => { try { fitCanvas({ compact: true }); } catch { /* ignore */ } });
    }
  }

  function toggleCanvasFocus() {
    setCanvasFocus(!canvasFocused);
  }

  function handleCanvasClick(event) {
    if (suppressClick) { suppressClick = false; return; }
    const port = event.target.closest('[data-port]');
    if (port) {
      choosePort({ node: port.dataset.node, port: port.dataset.port, direction: port.dataset.direction });
      return;
    }
    const edgeEl = event.target.closest('[data-edge-index]');
    if (edgeEl) {
      const index = Number(edgeEl.dataset.edgeIndex);
      selectedEdgeIndex = index;
      const edge = graph.edges[index];
      selectedNodeId = edge?.from?.node || selectedNodeId;
      highlightPort = edge ? { nodeId: edge.from.node, port: edge.from.port } : null;
      render();
      return;
    }
    const nodeId = event.target.closest('[data-node]')?.dataset.node;
    if (nodeId) {
      if (selectedNodeId !== nodeId) highlightPort = null;
      selectedNodeId = nodeId;
      selectedEdgeIndex = null;
      render();
    }
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
      || (edgeAt(to) >= 0 && units[node(to.node).unit].kind !== 'mixer' && node(to.node).unit !== 'heat-sink')) solveError = 'That port is already connected. Disconnect it first.';
    else {
      const edge = { from: { node: from.node, port: from.port }, to: { node: to.node, port: to.port }, ...(units[node(from.node).unit].kind === 'splitter' ? { weight: 1 } : {}) };
      graph.edges.push(edge);
      pushUndo({ type: 'add-edge', edge });
      undoGesture = null;
    }
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
    if (targets.length) {
      pushUndo(snapshotEntry());
      undoGesture = null;
      targets.forEach(target => addBoundaryNode(target, true));
    }
    selectedNodeId = selection;
    pendingPort = null;
    solveAndRender();
  }

  function handleInspectorInput(event) {
    const current = node(selectedNodeId);
    if (!current) return;
    noteInspectorUndo(event);
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
      if (current.unit === 'material-source') applyPracticalIntakeLabel(current, { force: isAutoIntakeLabel(current.label) });
      updateSourceStream(current);
    }
    if (event.target.name === 'chemicalId') {
      current.chemicalId = event.target.value || undefined;
      updateSourceStream(current);
    }
    if (event.target.name === 'processParameter') {
      current.processPreset = 'custom';
      const key = event.target.dataset.param;
      const raw = String(event.target.value ?? '').trim();
      if (raw === '') {
        delete current.params[key];
        if (key === 'headM' || key === 'pumpEta') delete current.params.pumpSecOverride;
        if (key === 'deltaP_kPa' || key === 'blowerEta') delete current.params.blowerSecOverride;
      } else {
        const value = Number(raw);
        if (!Number.isFinite(value)) solveError = `${key} must be a number`;
        else {
          current.params[key] = value;
          if (key === 'pumpKWhPerM3' || key === 'pumpKWhPerKg') current.params.pumpSecOverride = true;
          if (key === 'headM' || key === 'pumpEta') delete current.params.pumpSecOverride;
          if (key === 'blowerKWhPerNm3' || key === 'blowerKWhPerKg') current.params.blowerSecOverride = true;
          if (key === 'deltaP_kPa' || key === 'blowerEta') delete current.params.blowerSecOverride;
        }
      }
      if (['battery', 'thermal-storage'].includes(current.unit) && key === 'capexPerKWh') current.economics.installedCapex = current.capacity * current.params.capexPerKWh;
    }
    if (event.target.name === 'bufferParameter') {
      const key = event.target.dataset.param;
      if (key === 'fluidClass') {
        current.params.fluidClass = event.target.value;
        // Reset density/intensity so fluid-class defaults apply.
        delete current.params.densityKgM3;
        delete current.params.capexPerM3;
        delete current.params.densityOverride;
        delete current.params.intensityOverride;
        refreshBufferEconomics(current);
      } else {
        current.params[key] = Number(event.target.value);
        if (key === 'capacityKg') {
          current.capacity = Math.max(current.capacity || 0, Number(event.target.value) || 0);
        }
        if (key === 'densityKgM3') current.params.densityOverride = true;
        if (key === 'capexPerM3') current.params.intensityOverride = true;
        if (['capacityKg', 'capexPerM3', 'densityKgM3', 'capexPerKg'].includes(key)) {
          refreshBufferEconomics(current);
        }
      }
    }
    if (event.target.name === 'sinkParameter') {
      const key = event.target.dataset.param;
      const raw = String(event.target.value ?? '').trim();
      if (!current.params) current.params = {};
      if (raw === '' || event.target.dataset.cleared === '1') delete current.params[key];
      else {
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) solveError = 'Export / offtake limit must be ≥ 0 (blank = demand-backed or unlimited).';
        else current.params[key] = value;
      }
    }
    if (event.target.name === 'sourceParameter') {
      current.processPreset = 'custom';
      current.params[event.target.dataset.param] = Number(event.target.value);
      updateSourceStream(current);
      if (['capacityKW', 'capexPerKW', 'fixedOMPerKWYear', 'variableCostPerMWh', 'lifeYears', 'pricePerMWh'].includes(event.target.dataset.param)) current.economics = defaultEconomics(current);
    }
    if (event.target.name === 'sourceRate') { current.rate = Number(event.target.value); updateSourceStream(current); }
    if (event.target.name === 'sourcePreset') {
      current.sourcePreset = event.target.value;
      applyPracticalIntakeLabel(current, { force: isAutoIntakeLabel(current.label) });
      updateSourceStream(current);
    }
    if (event.target.name === 'heatTemperature') { current.temperature = Number(event.target.value); updateSourceStream(current); }
    if (event.target.name === 'branchWeight') graph.edges[Number(event.target.dataset.edge)].weight = Number(event.target.value);
    if (event.target.name === 'branchPriority') {
      const value = Number(event.target.value);
      graph.edges[Number(event.target.dataset.edge)].priority = Number.isFinite(value) ? value : 0;
    }
    if (event.target.name === 'edgeCapacity') {
      const edge = graph.edges[Number(event.target.dataset.edge)];
      const raw = String(event.target.value ?? '').trim();
      if (raw === '') delete edge.capacity;
      else {
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) solveError = 'Edge capacity must be ≥ 0 (blank = unlimited).';
        else edge.capacity = value;
      }
      selectedEdgeIndex = Number(event.target.dataset.edge);
    }
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
    const cause = event.target.closest?.('[data-diagnosis]');
    if (cause) {
      const current = node(selectedNodeId);
      const diagnosis = current ? blockDiagnosis(current) : null;
      if (diagnosis) followDiagnosis(diagnosis);
      return;
    }
    const selectEdge = event.target.closest('[data-select-edge]');
    if (selectEdge && !event.target.closest('input,button,select')) {
      selectedEdgeIndex = Number(selectEdge.dataset.selectEdge);
      render();
      return;
    }
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
    if (event.target.closest('#deleteNode')) deleteSelection();
  }

  function suggestedPreset(unit, port) {
    return {
      'dac.air': 'air', 'dac-solid.air': 'air', 'dac-liquid.air': 'air', 'dac-electroswing.air': 'air',
      'asu.air': 'air', 'swro.feed': 'seawater', 'med.feed': 'seawater', 'msf.feed': 'seawater', 'brine-minerals.brine': 'brine',
      'electrolyzer.water': 'water', 'chlor-alkali.water': 'water', 'sabatier.co2': 'co2', 'sabatier.hydrogen': 'hydrogen',
      'ammonia.nitrogen': 'nitrogen', 'ammonia.hydrogen': 'hydrogen',
      'methanol.co2': 'co2', 'methanol.hydrogen': 'hydrogen',
      'chlor-alkali.salt': 'salt',
      'bromine-recovery.bromide': 'bromide', 'bromine-recovery.chlorine': 'chlorine',
      'aluminium-smelter.alumina': 'alumina', 'aluminium-smelter.carbon': 'carbon', 'mg-si.quartz': 'quartz', 'mg-si.carbon': 'carbon', 'polysilicon.silicon': 'silicon',
      'bayer-alumina.bauxite': 'bauxite', 'bayer-alumina.caustic': 'caustic',
      'pv-module.polysilicon': 'silicon', 'pv-module.silver': 'silver', 'pv-module.glass': 'float-glass', 'pv-module.eva': 'eva', 'pv-module.aluminium': 'aluminium',
      'hydrogen-dri.ironOre': 'ironOre', 'hydrogen-dri.hydrogen': 'hydrogen',
      'iac-leach.clay': 'ionic-clay', 'iac-leach.lixiviant': 'ammonium-sulfate',
      'ree-chromatography.concentrate': 'mixed-reo',
      'bioforge.dextrose': 'dextrose', 'bioforge.oxygen': 'oxygen', 'bioforge.water': 'water',
      'titanium-kroll.titaniumTetrachloride': 'titaniumTetrachloride', 'titanium-kroll.magnesium': 'magnesium',
    }[`${unit}.${port}`] || 'water';
  }

  function solveAndRender() {
    result = null;
    currentEconomics = null;
    if (graph.nodes.length && missingConnections().length === 0) {
      try {
        const solver = FlowsheetSolver.solveHorizon || FlowsheetSolver.solveOperation;
        const operation = {
          setpoints,
          ...(cleanedPriorities() ? { priorities: cleanedPriorities() } : {}),
          ...(operationMeta.boundaryLimitedBy ? { boundaryLimitedBy: operationMeta.boundaryLimitedBy } : {}),
        };
        result = solver({ graph, operation, site });
        currentEconomics = FlowsheetEconomics.evaluateEconomics({ graph, operation, economics: projectEconomics }, result);
        solveError = '';
      } catch (error) {
        solveError = /site feed composition must be preserved/.test(error.message)
          ? 'This plant is sized for a different feed. Switching assays would break the feed. Load a matching demo or keep the current site.'
          : error.message;
      }
    }
    persistAutosave();
    render();
  }

  function missingConnectionRecords() {
    const missing = [];
    for (const current of graph.nodes) {
      if (['source', 'sink'].includes(units[current.unit].kind)) continue;
      for (const [port, declaration] of Object.entries(units[current.unit].ports)) {
        if (!declaration.required) continue;
        if (edgeAt({ node: current.id, port, direction: declaration.direction }) < 0) {
          missing.push({
            nodeId: current.id,
            label: current.label,
            port,
            text: `${current.label}: ${portName(port)}`,
          });
        }
      }
    }
    return missing;
  }

  function missingConnections() {
    return missingConnectionRecords().map(item => item.text);
  }

  function unconnectedPorts(current) {
    const missing = [];
    for (const [port, declaration] of Object.entries(units[current.unit].ports)) {
      if (!declaration.required) continue;
      if (edgeAt({ node: current.id, port, direction: declaration.direction }) < 0) {
        missing.push({
          nodeId: current.id,
          label: current.label,
          port,
          text: `${current.label}: ${portName(port)}`,
        });
      }
    }
    return missing;
  }

  function rightKeyForResource(resourceId) {
    return {
      grid: 'gridImport',
      freshwater: 'freshwater',
      seawater: 'seawaterIntake',
      brine: 'brineConcession',
      salt: 'saltPurchase',
    }[resourceId] || '';
  }

  function rightShortName(rightKey) {
    return {
      gridImport: 'grid',
      freshwater: 'freshwater',
      seawaterIntake: 'intake',
      seawaterDischarge: 'discharge',
      brineConcession: 'brine',
      saltPurchase: 'salt',
    }[rightKey] || rightKey || 'site';
  }

  function streamQuantity(stream) {
    if (!stream) return 0;
    try { return Math.abs(sourceAmount(stream)); } catch { return 0; }
  }

  function blockIsIdle(current) {
    const nodeResult = result?.nodes?.[current.id];
    if (!nodeResult) return true;
    if (nodeResult.activity !== undefined) return Math.abs(Number(nodeResult.activity) || 0) <= 1e-9;
    return streamQuantity(nodeResult.supplied || nodeResult.received || nodeResult.available) <= 1e-9;
  }

  function sourceSupplyDiagnosis(current) {
    if (!current || units[current.unit].kind !== 'source') return null;
    const resourceId = current.siteResource;
    const resource = resourceId ? site?.resources?.[resourceId] : null;
    const rightKey = rightKeyForResource(resourceId);
    const right = rightKey ? site?.rights?.[rightKey] : null;
    if (site && !resourceId) {
      return { code: 'missing-resource', text: 'No site resource', action: 'resource', nodeId: current.id };
    }
    const budget = resource?.stream ? streamQuantity(resource.stream) : null;
    const unverified = right?.status === 'unverified' || resource?.quality === 'unverified';
    if (unverified && (budget == null || budget <= 1e-9)) {
      return {
        code: 'unverified-right',
        text: `Unverified ${rightShortName(rightKey)} right`,
        action: 'rights',
        rightKey,
        nodeId: current.id,
      };
    }
    if (budget != null && budget <= 1e-9) {
      return { code: 'zero-resource', text: 'Zero resource budget', action: 'resource', nodeId: current.id };
    }
    if (Number(current.rate) <= 1e-9) {
      return { code: 'zero-setpoint', text: 'Zero setpoint', action: 'setpoint', nodeId: current.id };
    }
    return null;
  }

  function feedingNode(current, port) {
    let edge = graph.edges.find(item => item.to.node === current.id && item.to.port === port && !item.recycle);
    const seen = new Set();
    let from = edge ? node(edge.from.node) : null;
    while (from && ['junction', 'splitter', 'mixer'].includes(units[from.unit].kind) && !seen.has(from.id)) {
      seen.add(from.id);
      edge = graph.edges.find(item => item.to.node === from.id && !item.recycle);
      from = edge ? node(edge.from.node) : null;
    }
    return from;
  }

  function blockDiagnosis(current) {
    if (!current) return null;
    if (result?.nodes?.[current.id] && !blockIsIdle(current)) return null;
    const supply = sourceSupplyDiagnosis(current);
    if (supply && supply.code !== 'zero-setpoint') return supply;
    const missing = unconnectedPorts(current);
    if (missing.length) {
      const extra = missing.length > 1 ? ` +${missing.length - 1}` : '';
      return {
        code: 'missing-connection',
        text: `Missing ${portName(missing[0].port)}${extra}`,
        action: 'port',
        port: missing[0].port,
        nodeId: current.id,
      };
    }
    if (supply) return supply;
    if (units[current.unit].kind === 'converter' && Number(setpoints[current.id]) <= 1e-9) {
      return { code: 'zero-setpoint', text: 'Zero setpoint', action: 'setpoint', nodeId: current.id };
    }
    if (!result) {
      if (solveError) return { code: 'solve-error', text: 'Solve blocked', detail: solveError, action: 'warnings', nodeId: current.id };
      if (missingConnections().length) return { code: 'waiting', text: 'Waiting on another block', action: 'process', nodeId: current.id };
      return { code: 'not-running', text: 'Not running', nodeId: current.id };
    }
    const nodeResult = result.nodes[current.id];
    const limits = nodeResult?.limitedBy || [];
    if (limits.length) {
      const causeText = nodeResult.causeText || '';
      const root = nodeResult.causeChain?.length
        ? nodeResult.causeChain[nodeResult.causeChain.length - 1]
        : null;
      const limit = limits[0];
      if (/site budget/i.test(String(limit)) || root?.code === 'site-budget') {
        return supply || {
          code: 'limited',
          text: root?.text || 'Limited by site budget',
          detail: causeText || root?.text || 'Limited by site budget',
          action: 'resource',
          nodeId: root?.nodeId || current.id,
        };
      }
      const port = limitingPort(current, limit);
      const upstream = feedingNode(current, port);
      const upstreamSupply = upstream ? sourceSupplyDiagnosis(upstream) : null;
      if (upstreamSupply) {
        if (causeText) upstreamSupply.detail = causeText;
        return upstreamSupply;
      }
      const declared = units[current.unit].ports[port];
      const short = root?.text || `Limited by ${portName(limit)}`;
      return {
        code: 'limited',
        text: short,
        detail: causeText || short,
        action: declared ? 'port' : (root?.code === 'logistics' ? 'process' : 'process'),
        port: declared ? port : undefined,
        nodeId: current.id,
      };
    }
    const inlets = Object.entries(units[current.unit].ports).filter(([, declaration]) => declaration.direction === 'in');
    for (const [port] of inlets) {
      const upstreamSupply = sourceSupplyDiagnosis(feedingNode(current, port));
      if (upstreamSupply) return upstreamSupply;
    }
    return { code: 'idle', text: 'Idle', nodeId: current.id };
  }

  function followDiagnosis(diagnosis) {
    if (!diagnosis) return;
    if (diagnosis.action === 'rights') {
      highlightRightKey = diagnosis.rightKey || '';
      highlightPort = null;
      activateTab('location');
      const details = document.getElementById('siteRightsDetails');
      if (details) details.open = true;
      renderSiteTruth();
      document.getElementById('siteRights')?.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    highlightRightKey = '';
    if (diagnosis.nodeId) selectedNodeId = diagnosis.nodeId;
    highlightPort = diagnosis.action === 'port' && diagnosis.port
      ? { nodeId: selectedNodeId, port: diagnosis.port }
      : null;
    activateTab('process');
    render();
    if (diagnosis.action === 'setpoint') {
      document.querySelector('#nodeControls [name="requestedRate"], #nodeControls [name="sourceRate"]')?.focus?.();
    } else if (diagnosis.action === 'resource') {
      document.querySelector('#nodeControls [name="siteResource"]')?.focus?.();
    } else if (diagnosis.action === 'warnings') {
      document.getElementById('warnings')?.scrollIntoView?.({ block: 'nearest' });
    } else if (diagnosis.action === 'port') {
      document.querySelector(`#streamList [data-port-row="${diagnosis.port}"]`)?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function diagnosisButton(diagnosis) {
    if (!diagnosis?.action) return '';
    if (diagnosis.action === 'port') return `<button type="button" data-diagnosis="port">Show ${escapeHtml(portName(diagnosis.port))}</button>`;
    if (diagnosis.action === 'rights') return '<button type="button" data-diagnosis="rights">Open Rights</button>';
    if (diagnosis.action === 'setpoint') return '<button type="button" data-diagnosis="setpoint">Edit setpoint</button>';
    if (diagnosis.action === 'resource') return '<button type="button" data-diagnosis="resource">Edit resource</button>';
    if (diagnosis.action === 'warnings') return '<button type="button" data-diagnosis="warnings">Show issue</button>';
    return '<button type="button" data-diagnosis="process">Show block</button>';
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

  function readMapCoordinates() {
    const latitude = Number(document.getElementById('siteLatitude')?.value);
    const longitude = Number(document.getElementById('siteLongitude')?.value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90) return null;
    let lon = longitude;
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return { latitude, longitude: lon };
  }

  function siteMapStatus(text) {
    const status = document.getElementById('siteMapStatus');
    if (status && text) status.textContent = text;
  }

  function showSiteMapUnavailable(message) {
    const mapEl = document.getElementById('siteMap');
    const emptyEl = document.getElementById('siteMapEmpty');
    if (mapEl) mapEl.hidden = true;
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = message;
    }
  }

  function showSiteMapAvailable() {
    const mapEl = document.getElementById('siteMap');
    const emptyEl = document.getElementById('siteMapEmpty');
    if (mapEl) mapEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
  }

  function layerCiteHtml(source) {
    if (!source?.cite) return '';
    if (source.cite.url) {
      return `<a href="${source.cite.url}" target="_blank" rel="noreferrer">${source.cite.label}</a>`;
    }
    return source.cite.label || '';
  }

  const MAP_LAYER_UI = Object.freeze({
    osm: Object.freeze({ label: 'Basemap OSM', tone: 'basemap' }),
    pvgis: Object.freeze({ label: 'Solar (GHI)', tone: 'solar' }),
    water: Object.freeze({ label: 'Water', tone: 'water' }),
    land: Object.freeze({ label: 'Land value', tone: 'land' }),
    footprint: Object.freeze({ label: 'Footprint', tone: 'footprint' }),
    network: Object.freeze({ label: 'Network', tone: 'network' }),
  });
  const COLORMAP_IDS = MapSite?.COLORMAP_LAYER_IDS || ['pvgis', 'water', 'land'];

  function renderSiteMapLayerToggles() {
    const el = document.getElementById('siteMapLayers');
    if (!el || siteMapLayersReady) return;
    const sources = MapSite?.LAYER_SOURCES;
    if (!sources) {
      el.innerHTML = '';
      siteMapLayersReady = true;
      return;
    }
    const order = ['pvgis', 'water', 'land', 'footprint', 'network', 'osm'];
    const ids = order.filter(id => sources[id]).concat(Object.keys(sources).filter(id => !order.includes(id)));
    el.innerHTML = ids.map(id => {
      const source = sources[id];
      if (source.available === false) return '';
      const ui = MAP_LAYER_UI[id] || { label: source.label, tone: id };
      const checked = siteMapEnabled[id] ? ' checked' : '';
      const on = siteMapEnabled[id] ? ' is-on' : '';
      const citeText = source.cite?.label || '';
      const title = citeText.replace(/"/g, '&quot;');
      return `<label class="map-layer-chip map-layer-chip--${ui.tone}${on}" title="${title}"><input type="checkbox" data-layer="${id}"${checked}><span class="map-layer-dot" aria-hidden="true"></span><span class="map-layer-label">${ui.label}</span></label>`;
    }).join('');
    siteMapLayersReady = true;
  }

  function syncMapLayerChipState() {
    const root = document.getElementById('siteMapLayers');
    const labels = root?.querySelectorAll?.('.map-layer-chip') || [];
    for (const label of labels) {
      const input = label.querySelector?.('input');
      label.classList?.toggle?.('is-on', !!(input && input.checked));
    }
  }

  function clearSiteMapLayer(id) {
    const layer = siteMapOverlays[id];
    if (layer && siteMap) {
      try { siteMap.removeLayer(layer); } catch { /* already removed */ }
    }
    siteMapOverlays[id] = null;
    if (id === 'footprint') siteMapFootprintById = {};
  }

  function showSiteMapLayer(id) {
    const layer = siteMapOverlays[id];
    if (!layer || !siteMap) return;
    if (!siteMap.hasLayer(layer)) layer.addTo(siteMap);
  }

  function hideSiteMapLayer(id) {
    const layer = siteMapOverlays[id];
    if (!layer || !siteMap) return;
    if (siteMap.hasLayer(layer)) siteMap.removeLayer(layer);
  }

  function latLngForColormapTile(coords, px, py, tileSize) {
    if (MapSite?.webMercatorToLatLng) return MapSite.webMercatorToLatLng(coords.z, coords.x, coords.y, px, py, tileSize);
    const n = 2 ** coords.z;
    const mercX = (coords.x + px / tileSize) / n;
    const mercY = (coords.y + py / tileSize) / n;
    return {
      latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * mercY))) * 180 / Math.PI,
      longitude: mercX * 360 - 180,
    };
  }

  function paintScreeningColormap(canvas, coords, valueAt, colorAt, cells = 32) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const stepX = width / cells;
    const stepY = height / cells;
    for (let iy = 0; iy < cells; iy += 1) {
      for (let ix = 0; ix < cells; ix += 1) {
        const ll = latLngForColormapTile(coords, (ix + 0.5) * stepX, (iy + 0.5) * stepY, width);
        const value = valueAt(ll.latitude, ll.longitude);
        if (value == null || value === false) continue;
        const color = colorAt(value);
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(ix * stepX), Math.floor(iy * stepY), Math.ceil(stepX) + 1, Math.ceil(stepY) + 1);
      }
    }
  }

  function createScreeningColormapLayer(valueAt, colorAt, className) {
    if (typeof L === 'undefined' || typeof L.GridLayer !== 'function') return null;
    const Layer = L.GridLayer.extend({
      createTile(coords) {
        const size = this.getTileSize();
        const canvas = L.DomUtil.create('canvas', 'leaflet-tile');
        canvas.width = size.x;
        canvas.height = size.y;
        paintScreeningColormap(canvas, coords, valueAt, colorAt);
        return canvas;
      },
    });
    return new Layer({
      pane: 'overlayPane',
      opacity: 0.62,
      className: className || 'site-map-colormap',
      keepBuffer: 1,
    });
  }

  function punchNearBlack(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 18 && data[i + 1] < 18 && data[i + 2] < 18) data[i + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);
    } catch { /* tainted canvas; leave the raw tile */ }
  }

  function createAqueductBwsLayer() {
    if (typeof L === 'undefined' || typeof L.GridLayer !== 'function') return null;
    const src = MapSite?.LAYER_SOURCES?.water;
    const template = src?.url || 'https://gis6.uspatial.umn.edu/arcgis/rest/services/SCOPE/WRI_Aqueducts_Baseline_water_stress/MapServer/tile/{z}/{y}/{x}';
    const maxNative = src?.maxNativeZoom || 9;
    const Layer = L.GridLayer.extend({
      createTile(coords, done) {
        const size = this.getTileSize();
        const canvas = L.DomUtil.create('canvas', 'leaflet-tile');
        canvas.width = size.x;
        canvas.height = size.y;
        const url = template.replace('{z}', coords.z).replace('{y}', coords.y).replace('{x}', coords.x);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, size.x, size.y);
            punchNearBlack(canvas);
          }
          done(null, canvas);
        };
        img.onerror = () => {
          paintScreeningColormap(
            canvas,
            coords,
            (lat, lon) => MapSite.waterAvailabilityScreening(lat, lon).band,
            band => MapSite.waterScreeningColor(band),
            24,
          );
          done(null, canvas);
        };
        img.src = url;
        return canvas;
      },
    });
    return new Layer({
      pane: 'overlayPane',
      opacity: src?.opacity ?? 0.72,
      maxNativeZoom: maxNative,
      maxZoom: 19,
      className: 'site-map-colormap site-map-colormap--water',
      keepBuffer: 1,
    });
  }

  let lercLoadPromise = null;
  const gsaTileCache = new Map();

  function ensureLercLoaded() {
    if (typeof Lerc === 'undefined' || typeof Lerc.load !== 'function') {
      return Promise.reject(new Error('Lerc decoder unavailable'));
    }
    if (Lerc.isLoaded?.()) return Promise.resolve();
    if (!lercLoadPromise) {
      lercLoadPromise = Lerc.load({
        locateFile(fileName, scriptDir) {
          if (scriptDir) return `${scriptDir}${fileName}`;
          return `vendor/${fileName}`;
        },
      }).catch(err => {
        lercLoadPromise = null;
        throw err;
      });
    }
    return lercLoadPromise;
  }

  function gsaTileUrl(z, y, x) {
    const template = MapSite?.LAYER_SOURCES?.pvgis?.url || MapSite?.GSA_IRRAD?.tileUrl
      || 'https://tiledimageservices.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/GSA_IRRAD/ImageServer/tile/{z}/{y}/{x}?sliceId=2';
    return template.replace('{z}', z).replace('{y}', y).replace('{x}', x);
  }

  function fetchGsaLercTile(z, y, x) {
    const key = `${z}/${y}/${x}`;
    if (gsaTileCache.has(key)) return gsaTileCache.get(key);
    const pending = (async () => {
      try {
        await ensureLercLoaded();
        const response = await fetch(gsaTileUrl(z, y, x));
        if (!response.ok) return null;
        const buffer = await response.arrayBuffer();
        if (!buffer || !buffer.byteLength) return null;
        return Lerc.decode(buffer);
      } catch {
        return null;
      }
    })();
    gsaTileCache.set(key, pending);
    if (gsaTileCache.size > 96) {
      const first = gsaTileCache.keys().next().value;
      gsaTileCache.delete(first);
    }
    return pending;
  }

  async function paintGsaIrradTile(canvas, coords) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !MapSite) return;
    const width = canvas.width;
    const height = canvas.height;
    const nw = latLngForColormapTile(coords, 0, 0, width);
    const se = latLngForColormapTile(coords, width, height, width);
    const north = Math.max(nw.latitude, se.latitude);
    const south = Math.min(nw.latitude, se.latitude);
    const west = Math.min(nw.longitude, se.longitude);
    const east = Math.max(nw.longitude, se.longitude);
    const midLat = (north + south) / 2;
    if (north < (MapSite.GSA_IRRAD?.latMin ?? -60) || south > (MapSite.GSA_IRRAD?.latMax ?? 65)) return;

    const gsaZ = MapSite.gsaZoomForMapZoom(coords.z, midLat);
    const covers = MapSite.gsaCoveringTiles(south, west, north, east, gsaZ);
    if (!covers.length) return;

    const decodedByKey = new Map();
    await Promise.all(covers.map(async tile => {
      const decoded = await fetchGsaLercTile(tile.z, tile.y, tile.x);
      if (decoded) decodedByKey.set(`${tile.z}/${tile.y}/${tile.x}`, { tile, decoded });
    }));
    if (!decodedByKey.size) return;

    const image = ctx.createImageData(width, height);
    const data = image.data;
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const ll = latLngForColormapTile(coords, px + 0.5, py + 0.5, width);
        if (ll.latitude < (MapSite.GSA_IRRAD?.latMin ?? -60) || ll.latitude > (MapSite.GSA_IRRAD?.latMax ?? 65)) continue;
        const idx = MapSite.gsaTileXY(ll.latitude, ll.longitude, gsaZ);
        if (!idx) continue;
        const entry = decodedByKey.get(`${idx.z}/${idx.y}/${idx.x}`);
        if (!entry) continue;
        const value = MapSite.sampleGsaDecoded(entry.decoded, idx.z, idx.y, idx.x, ll.latitude, ll.longitude);
        if (value == null) continue;
        const rgb = MapSite.ghiColorRgb(value);
        if (!rgb) continue;
        const o = (py * width + px) * 4;
        data[o] = rgb[0];
        data[o + 1] = rgb[1];
        data[o + 2] = rgb[2];
        data[o + 3] = 168;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function createGsaIrradLayer() {
    if (typeof L === 'undefined' || typeof L.GridLayer !== 'function') return null;
    const Layer = L.GridLayer.extend({
      createTile(coords, done) {
        const size = this.getTileSize();
        const canvas = L.DomUtil.create('canvas', 'leaflet-tile');
        canvas.width = size.x;
        canvas.height = size.y;
        paintGsaIrradTile(canvas, coords).then(
          () => done(null, canvas),
          () => done(null, canvas),
        );
        return canvas;
      },
    });
    return new Layer({
      pane: 'overlayPane',
      opacity: 0.85,
      maxZoom: 19,
      maxNativeZoom: MapSite?.GSA_IRRAD?.maxZoom || 8,
      className: 'site-map-colormap site-map-colormap--solar',
      keepBuffer: 1,
    });
  }

  function ensureSolarColormap() {
    if (!MapSite) return;
    if (!siteMapOverlays.pvgis) {
      try {
        siteMapOverlays.pvgis = createGsaIrradLayer();
      } catch {
        siteMapOverlays.pvgis = null;
        siteMapStatus('Global Solar Atlas LERC tiles failed to initialize.');
      }
    }
    if (siteMapOverlays.pvgis) showSiteMapLayer('pvgis');
  }

  function ensureWaterColormap() {
    if (!MapSite) return;
    if (!siteMapOverlays.water) {
      try {
        siteMapOverlays.water = createAqueductBwsLayer();
      } catch {
        siteMapOverlays.water = createScreeningColormapLayer(
          (lat, lon) => MapSite.waterAvailabilityScreening(lat, lon).band,
          band => MapSite.waterScreeningColor(band),
          'site-map-colormap site-map-colormap--water',
        );
        siteMapStatus('Aqueduct BWS tiles unavailable; showing water screening colormap.');
      }
    }
    if (siteMapOverlays.water) showSiteMapLayer('water');
  }

  function ensureLandChoropleth() {
    if (!siteMap || typeof L === 'undefined' || !MapSite) return;
    if (siteMapOverlays.land) {
      showSiteMapLayer('land');
      return;
    }
    const geojson = MapSite.getLandAdminGeoJSON?.() || globalThis.LAND_ADMIN_GEOJSON;
    const prices = MapSite.getLandPricesBundle?.() || globalThis.LAND_PRICES;
    if (!geojson?.features?.length) {
      siteMapStatus('Land admin polygons missing; land choropleth unavailable.');
      return;
    }
    const layer = L.geoJSON(geojson, {
      style(feature) {
        return MapSite.landChoroplethStyle(feature, prices);
      },
      onEachFeature(feature, lyr) {
        const id = feature?.properties?.id;
        const record = MapSite.landPriceById?.(id, prices);
        const name = feature?.properties?.name || id || 'Unknown';
        if (record) {
          const usd = Math.round(record.usdPerHa).toLocaleString('en-US');
          const src = record.source || 'official agricultural land value';
          lyr.bindPopup(`${name}<br><strong>$${usd}/ha</strong> (${record.year})<br><small>${src}</small>`);
        } else {
          lyr.bindPopup(`${name}<br><small>No published agricultural land value in the bundled sources</small>`);
        }
      },
      pane: 'overlayPane',
      className: 'site-map-land-choropleth',
    });
    siteMapOverlays.land = layer;
    showSiteMapLayer('land');
  }

  function updateSiteMapLegend() {

    const el = document.getElementById('siteMapLegend');
    if (!el) return;
    const active = COLORMAP_IDS.find(id => siteMapEnabled[id]);
    if (!active || !MapSite) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.dataset.layer = active;
    const title = document.getElementById('siteMapLegendTitle');
    const ramp = document.getElementById('siteMapLegendRamp');
    const labels = document.getElementById('siteMapLegendLabels');
    const citeEl = document.getElementById('siteMapLegendCite');
    const source = MapSite.LAYER_SOURCES[active];
    const shortSwatch = label => {
      const text = String(label || '');
      if (/arid/i.test(text)) return 'Arid';
      if (/extremely/i.test(text)) return '>80%';
      if (/high/i.test(text)) return '40–80%';
      return text.length > 16 ? `${text.slice(0, 14)}…` : text;
    };
    if (active === 'pvgis') {
      if (title) title.textContent = 'GHI';
      const stops = MapSite.GSA_GHI_RAMP || [];
      if (ramp) {
        ramp.className = 'site-map-legend-ramp is-continuous';
        ramp.innerHTML = stops.map(([, color]) => `<span style="background:${color}"></span>`).join('');
      }
      if (labels) labels.innerHTML = '<span>700</span><span>1500</span><span>2200</span><span>3000</span>';
      if (citeEl) {
        citeEl.innerHTML = `<span class="site-map-source-name">Annual GHI, kWh/m²·year — Global Solar Atlas</span>${layerCiteHtml(source?.overlayCite ? { cite: source.overlayCite } : source)}`;
      }
    } else if (active === 'water') {
      if (title) title.textContent = 'Water stress';
      const items = source?.legend || [];
      if (ramp) {
        ramp.className = 'site-map-legend-ramp is-swatches';
        ramp.innerHTML = items.map(item => `<span class="site-map-legend-swatch"><i style="background:${item.color}"></i>${shortSwatch(item.label)}</span>`).join('');
      }
      if (labels) labels.innerHTML = '';
      if (citeEl) {
        const full = items.map(item => item.label).filter(Boolean).join(' · ');
        citeEl.innerHTML = `<span class="site-map-source-name">Baseline water stress${full ? ` — ${full}` : ''}</span>${layerCiteHtml(source)}`;
      }
    } else if (active === 'land') {
      if (title) title.textContent = 'Land value';
      const stops = MapSite.LAND_USD_HA_RAMP || source?.legend || [];
      if (ramp) {
        ramp.className = 'site-map-legend-ramp is-continuous';
        const colors = Array.isArray(stops[0]) ? stops.map(([, color]) => color) : stops.map(item => item.color);
        ramp.innerHTML = colors.map(color => `<span style="background:${color}"></span>`).join('');
      }
      if (labels) {
        labels.innerHTML = '<span>$2k</span><span>$10k</span><span>$40k</span><span>$80k+</span>';
      }
      if (citeEl) {
        const cites = source?.cites || [];
        const links = cites.length
          ? cites.map(c => (c.url ? `<a href="${c.url}" target="_blank" rel="noreferrer">${c.label}</a>` : c.label)).join(' · ')
          : layerCiteHtml(source);
        citeEl.innerHTML = `<span class="site-map-source-name">Agricultural land value, USD/ha</span>${links}`;
      }
    }
  }

  function initSiteMap() {
    const mapEl = document.getElementById('siteMap');
    if (!mapEl || siteMap || siteMapFailed) return siteMap;
    if (typeof L === 'undefined') {
      siteMapFailed = true;
      showSiteMapUnavailable('Map library failed to load. Enter latitude and longitude, then Apply location.');
      siteMapStatus('Leaflet is unavailable. Coordinates still apply; site meteo, assay, and rights stay in this panel.');
      return null;
    }
    try {
      const start = readMapCoordinates() || { latitude: 36.834, longitude: -2.463 };
      siteMap = L.map(mapEl, {
        zoomControl: false,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      siteMap.setView([start.latitude, start.longitude], 10, { animate: false });
      L.control.zoom({ position: 'bottomright' }).addTo(siteMap);
      const osm = MapSite?.LAYER_SOURCES?.osm;
      siteMapOverlays.osm = L.tileLayer(osm?.url || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: osm?.attribution || '&copy; OpenStreetMap',
        maxZoom: osm?.maxZoom || 19,
      }).addTo(siteMap);
      siteMapOverlays.osm.on('tileerror', () => {
        if (siteMapTilesFailed) return;
        siteMapTilesFailed = true;
        siteMapStatus('Basemap tiles failed to load. Click-to-site still works; screening overlays remain.');
      });
      const icon = L.divIcon({
        className: 'site-map-marker-wrap',
        html: '<span class="site-map-marker-dot"></span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      siteMapMarker = L.marker([start.latitude, start.longitude], { icon, keyboard: false }).addTo(siteMap);
      siteMap.on('click', event => {
        const latlng = event?.latlng;
        if (!latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) return;
        const latInput = document.getElementById('siteLatitude');
        const lonInput = document.getElementById('siteLongitude');
        if (latInput) latInput.value = Number(latlng.lat).toFixed(3);
        if (lonInput) lonInput.value = Number(latlng.lng).toFixed(3);
        try {
          siteMapMarker?.setLatLng([latlng.lat, latlng.lng]);
          updateSiteMapOverlays();
        } catch { /* overlays are optional while PVGIS fetches */ }
        applyCoordinates();
      });
      siteMap.on('zoomend', () => {
        try { refreshFootprintLabels(); } catch { /* labels are optional */ }
      });
      showSiteMapAvailable();
      return siteMap;
    } catch {
      siteMapFailed = true;
      siteMap = null;
      showSiteMapUnavailable('Map failed to initialize. Enter latitude and longitude, then Apply location.');
      siteMapStatus('The map could not start. Coordinates, PVGIS fetch, and site truth panels still work.');
      return null;
    }
  }

  function syncSiteMapFromInputs() {
    const coords = readMapCoordinates();
    if (!coords || !siteMap) return;
    try {
      siteMapMarker?.setLatLng([coords.latitude, coords.longitude]);
      const zoom = siteMap.getZoom?.() || 10;
      siteMap.setView([coords.latitude, coords.longitude], zoom, { animate: false });
    } catch { /* leaflet unavailable mid-update */ }
  }

  function updateSiteMapOverlays() {
    const footprint = currentSiteFootprint();
    if (!siteMap || typeof L === 'undefined') {
      syncFootprintMapChrome(footprint);
      return;
    }
    const coords = readMapCoordinates();
    if (!coords) {
      syncFootprintMapChrome(footprint);
      return;
    }

    if (siteMapOverlays.osm) {
      if (siteMapEnabled.osm) {
        if (!siteMap.hasLayer(siteMapOverlays.osm)) siteMapOverlays.osm.addTo(siteMap);
      } else if (siteMap.hasLayer(siteMapOverlays.osm)) {
        siteMap.removeLayer(siteMapOverlays.osm);
      }
    }

    try {
      for (const id of COLORMAP_IDS) {
        if (!siteMapEnabled[id]) hideSiteMapLayer(id);
      }
      if (siteMapEnabled.pvgis && MapSite) ensureSolarColormap();
      else if (siteMapEnabled.water && MapSite) ensureWaterColormap();
      else if (siteMapEnabled.land && MapSite) ensureLandChoropleth();
      updateSiteMapLegend();
    } catch {
      siteMapStatus('Colormap overlay failed. Coordinates, footprint, and network markers still work.');
    }

    clearSiteMapLayer('footprint');
    if (siteMapEnabled.footprint && MapSite && footprint && footprint.totalAreaM2 > 0 && typeof L.polygon === 'function') {
      const campus = typeof MapSite.layoutFootprintCampus === 'function'
        ? MapSite.layoutFootprintCampus({
          latitude: coords.latitude,
          longitude: coords.longitude,
          solar: footprint.solar,
          processes: footprint.processes,
          totalHa: footprint.totalHa,
        })
        : [];
      if (campus.length && typeof L.layerGroup === 'function') {
        const group = L.layerGroup();
        for (const block of campus) {
          if (!block.ring?.length) continue;
          const isOutline = block.kind === 'outline';
          const isSolar = block.kind === 'solar';
          const color = footprintColor(block.unit, { cssVar: false });
          const poly = L.polygon(block.ring, {
            color: isOutline ? '#e7eef6' : '#0b1016',
            weight: isOutline ? 2.25 : 1.75,
            opacity: 0.95,
            dashArray: isOutline ? '7 4' : null,
            fillColor: isOutline ? '#9aafc4' : color,
            fillOpacity: isOutline ? 0.14 : isSolar ? 0.58 : 0.78,
            interactive: true,
          });
          poly.__footprintBlock = block;
          poly.bindPopup(footprintPopupHtml(block));
          bindFootprintTooltip(poly, block);
          poly.addTo(group);
          if (block.id) siteMapFootprintById[block.id] = poly;
        }
        group.addTo(siteMap);
        siteMapOverlays.footprint = group;
      }
    }
    syncFootprintMapChrome(footprint);

    clearSiteMapLayer('network');
    if (siteMapEnabled.network && MapSite) {
      const markers = MapSite.networkPlantMarkers(networkResult || network);
      const group = L.layerGroup();
      for (const plant of markers) {
        const marker = L.circleMarker([plant.latitude, plant.longitude], {
          radius: 6,
          color: '#6ba177',
          weight: 2,
          fillColor: '#6ba177',
          fillOpacity: 0.9,
        });
        marker.bindPopup(`${plant.name}${plant.landHa ? ` · ${formatHa(plant.landHa)}` : ''}`);
        marker.on('click', () => {
          if (plant.id && network.plants.some(item => item.id === plant.id)) openNetworkPlant(plant.id);
        });
        marker.addTo(group);
        if (plant.polygon?.length) {
          L.polygon(plant.polygon, {
            color: '#6ba177',
            weight: 1,
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(group);
        }
      }
      group.addTo(siteMap);
      siteMapOverlays.network = group;
    }

    if (siteMapMarker?.bringToFront) siteMapMarker.bringToFront();
  }

  function renderSiteMap() {
    renderSiteMapLayerToggles();
    const coords = readMapCoordinates();
    if (!coords) {
      if (typeof L === 'undefined') {
        siteMapFailed = true;
        showSiteMapUnavailable('Map library failed to load. Enter latitude and longitude, then Apply location.');
      }
      return;
    }
    initSiteMap();
    if (!siteMap) return;
    showSiteMapAvailable();
    try {
      siteMapMarker?.setLatLng([coords.latitude, coords.longitude]);
      const current = siteMap.getCenter?.();
      const moved = !current
        || Math.abs(current.lat - coords.latitude) > 0.0005
        || Math.abs(current.lng - coords.longitude) > 0.0005;
      if (moved) siteMap.setView([coords.latitude, coords.longitude], siteMap.getZoom?.() || 10, { animate: false });
      updateSiteMapOverlays();
      if (activeTab === 'location') scheduleMapInvalidate();
    } catch {
      siteMapStatus('Map overlay update failed. Latitude/longitude and Apply location still work.');
    }
  }

  const ASIA_OFFTAKE_NOTE = 'Screening China/Asia offtake table — not a plant contract and not a silent ME-Levant inherit.';

  function offtakeHonestyText() {
    const tea = globalThis.TeaScreening;
    const siteRegionId = site?.region && tea?.resolveDemandRegion ? tea.resolveDemandRegion(site.region) : null;
    const bound = graph.nodes.find(node => node.economics?.demandRegionId)?.economics.demandRegionId || null;
    const asiaSite = siteRegionId === 'asia-china';
    const asiaBound = bound === 'asia-china';
    if (!asiaSite && !asiaBound) return '';
    if (asiaSite && bound && bound !== 'asia-china') {
      return 'This site screens prices on the China/Asia offtake table, not a silent ME-Levant inherit. The open plant still uses another region\'s prices. Not a plant contract.';
    }
    return ASIA_OFFTAKE_NOTE;
  }

  function renderOfftakeHonesty() {
    const text = offtakeHonestyText();
    for (const id of ['overviewOfftake', 'economicsOfftake']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.hidden = !text;
      el.textContent = text;
    }
  }

  function hudValue(text) {
    const value = String(text ?? '').trim();
    if (!value || value.includes('—')) return '';
    return value;
  }

  function formatDispatchPair(used, offered) {
    const scale = Math.max(Math.abs(used), Math.abs(offered));
    if (scale >= 1000) return `${formatNumber(used / 1000)} / ${formatNumber(offered / 1000)} MWh/d`;
    return `${formatNumber(used)} / ${formatNumber(offered)} kWh/d`;
  }

  function powerStripSlot() {
    const buses = graph.nodes.filter(node => node.unit === 'electrical-bus');
    if (result?.nodes && result?.streams) {
      let offered = 0;
      let used = 0;
      let live = false;
      for (const bus of buses) {
        const available = Number(result.nodes[bus.id]?.available?.kWh);
        if (!(available > 0)) continue;
        const drawn = result.streams
          .filter(edge => edge.from?.node === bus.id && edge.stream?.kind === 'electricity')
          .reduce((sum, edge) => sum + (Number(edge.stream.kWh) || 0), 0);
        if (!Number.isFinite(drawn)) continue;
        live = true;
        offered += available;
        used += drawn;
      }
      if (live) {
        const value = hudValue(formatDispatchPair(used, offered));
        if (!value) return null;
        return {
          id: 'power',
          label: 'Power',
          value,
          title: `Bus dispatch ${formatNumber(used)} / ${formatNumber(offered)} kWh/d`,
          fill: offered > 0 ? Math.max(0, Math.min(1, used / offered)) : null,
        };
      }
    }
    if (buses.length || !result) return null;
    const budget = Number(site?.resources?.electricity?.stream?.kWh);
    if (!(budget > 0)) return null;
    const value = hudValue(formatCompactEnergy(budget, false));
    if (!value) return null;
    return {
      id: 'power',
      label: 'Power',
      value,
      title: `Site electricity budget ${formatNumber(budget)} kWh/d`,
    };
  }

  function waterStripSlot() {
    const stream = site?.resources?.freshwater?.stream;
    if (!stream) return null;
    let kg;
    try { kg = sourceAmount(stream); } catch { return null; }
    if (!(Number(kg) > 0)) return null;
    const value = hudValue(formatCompactMass(kg));
    if (!value) return null;
    const status = site?.rights?.freshwater?.status;
    const title = status
      ? `Freshwater ${formatNumber(kg)} kg/d · ${status}`
      : `Freshwater ${formatNumber(kg)} kg/d`;
    return { id: 'water', label: 'Water', value, title };
  }

  function cashStripSlot() {
    const net = Number(currentEconomics?.annualNetCash);
    if (!Number.isFinite(net)) return null;
    const value = hudValue(`${formatUncertainMoney(net, classifyQuality({ kind: 'money' }))}/y`);
    if (!value) return null;
    const tone = net > 0 ? 'is-positive' : net < 0 ? 'is-negative' : '';
    return {
      id: 'cash',
      label: 'Cash',
      value,
      title: 'Annual net cash · R − OPEX − ann. CAPEX · screening',
      tone,
    };
  }

  function landStripSlot() {
    if (!site || typeof FlowsheetFootprint?.estimateFootprint !== 'function') return null;
    let footprint;
    try {
      footprint = FlowsheetFootprint.estimateFootprint({ site, graph, solved: result });
    } catch {
      return null;
    }
    if (!(Number(footprint?.totalAreaM2) > 0)) return null;
    const landQuality = classifyQuality({ kind: 'land' });
    const value = hudValue(formatUncertainHa(footprint.totalHa, landQuality));
    if (!value) return null;
    const solarHa = Number(footprint.solar?.ha);
    const title = solarHa > 0
      ? `Site footprint · solar ${formatUncertainHa(solarHa, landQuality)}`
      : 'Site footprint';
    return { id: 'land', label: 'Land', value, title };
  }

  function renderResourceStrip() {
    const el = document.getElementById('hudStrip');
    if (!el) return;
    const slots = [powerStripSlot(), waterStripSlot(), cashStripSlot(), landStripSlot()].filter(Boolean);
    if (!slots.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = slots.map(slot => {
      const tone = slot.tone ? ` ${slot.tone}` : '';
      const bar = Number.isFinite(slot.fill)
        ? `<span class="hud-bar" aria-hidden="true"><span style="--hud-fill:${Math.max(0, Math.min(1, slot.fill)).toFixed(4)}"></span></span>`
        : '';
      return `<li class="hud-slot hud-${slot.id}${tone}" data-hud="${slot.id}" title="${escapeHtml(slot.title)}"><span class="hud-key">${escapeHtml(slot.label)}</span><span class="hud-value">${escapeHtml(slot.value)}</span>${bar}</li>`;
    }).join('');
  }

  function render() { renderOfftakeHonesty(); renderGraph(); renderStatus(); renderSite(); renderInspector(); renderEconomics(); renderComparison(); renderNetwork(); renderOverview(); renderResourceStrip(); }

  const NETWORK_SALE_LABELS = {
    NH3: 'Ammonia',
    CH4: 'Methane',
    Br2: 'Bromine',
    H2: 'Hydrogen',
    CH3OH: 'Methanol',
    Li: 'Lithium',
    NaCl: 'Salt',
    'ammonia-product': 'Ammonia',
    ammonia: 'Ammonia',
    methane: 'Methane',
    bromine: 'Bromine',
    hydrogen: 'Hydrogen',
    methanol: 'Methanol',
    lithium: 'Lithium',
    LiCl: 'Lithium',
    Li2CO3: 'Lithium',
    salt: 'Salt',
    'recovered-salt': 'Salt',
    'sabatier-water': 'Sabatier water',
    water: 'Water',
    potash: 'Potash',
    KCl: 'Potash',
    magnesium: 'Magnesium',
    MgCl2: 'Magnesium',
    caustic: 'Caustic',
    NaOH: 'Caustic',
    gypsum: 'Gypsum',
    CaSO4: 'Gypsum',
    oxygen: 'Oxygen',
    O2: 'Oxygen',
    'poly-silicon': 'Poly-Si',
    polysilicon: 'Poly-Si',
    module: 'PV module',
    'pv-module': 'PV module',
    PVmodule: 'PV module',
    ndpr: 'NdPr oxide',
    'ndpr-oxide': 'NdPr oxide',
    'ndpr-oxide-separated': 'NdPr oxide',
    otherReo: 'Other REO',
    'other-reo': 'Other REO',
    dytb: 'DyTb oxide',
    'dytb-oxide': 'DyTb oxide',
    lightReo: 'Light REO',
    'light-reo': 'Light REO',
  };

  function overviewSaleRecords() {
    const productQuality = classifyQuality({ kind: 'product-cost' });
    const sinks = (currentEconomics?.sinks || [])
      .filter(sink => sink.disposition === 'sale' && Number(sink.deliveredAmount) > 0)
      .sort((left, right) => (Number(right.annualRevenue) - Number(left.annualRevenue))
        || (Number(right.deliveredAmount) - Number(left.deliveredAmount)));
    if (sinks.length) {
      const revenue = Number(currentEconomics.annualRevenue) || 0;
      const days = Number(currentEconomics.periodDays) > 0 ? Number(currentEconomics.periodDays) : 365;
      return sinks.map(sink => ({
        label: NETWORK_SALE_LABELS[sink.id] || sink.id,
        kgPerDay: Number(sink.deliveredAmount) / days,
        tonnesPerYear: Number(sink.deliveredAmount) / 1000,
        revenue: Number(sink.annualRevenue) || 0,
        share: revenue > 0 ? (Number(sink.annualRevenue) || 0) / revenue : null,
        quality: productQuality,
      }));
    }
    const slate = networkResult?.slate;
    if (!slate) return [];
    return Object.entries(slate)
      .filter(([, tonnes]) => Number(tonnes) > 0)
      .sort((left, right) => right[1] - left[1])
      .map(([substance, tonnes]) => ({
        label: NETWORK_SALE_LABELS[substance] || substance,
        kgPerDay: Number(tonnes) * 1000 / 365,
        tonnesPerYear: Number(tonnes),
        revenue: null,
        share: null,
        quality: productQuality,
      }));
  }

  function renderSlateTable(records) {
    if (!records.length) return '<p class="slate-empty">No products</p>';
    const lead = records.find(row => Number(row.revenue) > 0) || null;
    const body = records.map(row => {
      const isLead = lead === row;
      const share = row.share == null ? '—' : `${formatNumber(row.share * 100)}%`;
      const money = row.revenue == null ? '—' : formatUncertainMoney(row.revenue, row.quality);
      return `<tr class="${isLead ? 'is-lead' : ''}"><td>${escapeHtml(row.label)}${isLead ? ' <span class="slate-lead">lead</span>' : ''}</td><td>${formatNumber(row.kgPerDay)}</td><td>${formatNumber(row.tonnesPerYear)}</td><td>${money}</td><td>${share}</td></tr>`;
    }).join('');
    return `<table class="slate-table"><thead><tr><th>Product</th><th>kg/d</th><th>t/y</th><th>$/y</th><th>Share</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  function powerThrottleCallout() {
    const warnings = result?.warnings || [];
    const fromWarning = warnings.some(message => /Capacity reduced: limited by available electricity|site solar electricity/i.test(message));
    const fromBoundary = (operationMeta.boundaryLimitedBy || []).some(item => /solar electricity|available electricity/i.test(String(item)));
    const fromNodes = graph.nodes.some(node => {
      const limits = result?.nodes?.[node.id]?.limitedBy || [];
      if (limits.includes('electricity')) return true;
      const electricSource = node.siteResource === 'electricity' || node.unit === 'electricity-source' || node.unit === 'solar-pv';
      return electricSource && limits.includes('site budget');
    });
    return (fromWarning || fromBoundary || fromNodes) ? 'Capacity reduced: limited by available electricity' : '';
  }

  function powerLimitNodeId() {
    const limited = graph.nodes.filter(node => {
      const limits = result?.nodes?.[node.id]?.limitedBy || [];
      if (limits.includes('electricity')) return true;
      const electricSource = node.siteResource === 'electricity' || node.unit === 'electricity-source' || node.unit === 'solar-pv';
      return electricSource && limits.includes('site budget');
    });
    const converter = limited.find(node => units[node.unit]?.kind === 'converter');
    if (converter) return converter.id;
    if (limited[0]) return limited[0].id;
    const source = graph.nodes.find(node => node.siteResource === 'electricity' || node.unit === 'solar-pv' || node.unit === 'electricity-source');
    return source?.id || '';
  }

  function overviewYieldMeta() {
    const meteo = site?.meteo;
    if (!meteo && !Number.isFinite(Number(site?.dailyPVKWhPerKWp))) return null;
    const quality = classifyQuality({
      kind: 'meteo',
      quality: meteo?.quality,
      sourceNote: meteo?.cite?.label || meteo?.source || meteo?.notes,
    });
    const monthly = Array.isArray(meteo?.monthlyPVKWhPerKWp) ? meteo.monthlyPVKWhPerKWp : [];
    const monthVals = monthly.slice(1).map(Number).filter(Number.isFinite);
    const band = monthVals.length >= 2
      ? { low: Math.min(...monthVals), high: Math.max(...monthVals), unit: 'kWh/kWp·day' }
      : null;
    const daily = Number(meteo?.dailyPVKWhPerKWp ?? site.dailyPVKWhPerKWp);
    const references = quality === 'cited' ? citeFrom(meteo?.cite) : [];
    return { daily, quality, band, references };
  }

  function metricStats(pairs) {
    return pairs.map(([label, html]) => (
      `<div class="metric-stat"><span>${escapeHtml(label)}</span><strong>${html}</strong></div>`
    )).join('');
  }

  function driverRow(key, body, tone, attrs) {
    const value = attrs
      ? `<button type="button" class="tone-${tone}" ${attrs}>${body}</button>`
      : `<span class="tone-${tone}">${body}</span>`;
    return `<li class="driver-row"><span class="driver-key">${escapeHtml(key)}</span>${value}</li>`;
  }

  function renderOverviewDrivers() {
    const list = document.getElementById('overviewDrivers');
    if (!list) return;
    if (!graph.nodes.length) {
      list.innerHTML = driverRow('Plant', 'No plant loaded — pick a case or open Process.', 'idle', '');
      return;
    }
    const rows = [];
    const powerNote = powerThrottleCallout();
    if (powerNote) {
      const nodeId = powerLimitNodeId();
      rows.push(driverRow('Power', escapeHtml(powerNote), 'warn', nodeId ? `data-driver-node="${escapeHtml(nodeId)}"` : ''));
    } else {
      rows.push(driverRow('Power', 'Not limited', 'ok', ''));
    }
    const missing = missingConnectionRecords();
    if (missing.length) {
      const shown = missing.slice(0, 3).map(item => item.text).join(' · ');
      const extra = missing.length > 3 ? ` · +${missing.length - 3}` : '';
      rows.push(driverRow('Wiring', escapeHtml(`${shown}${extra}`), 'warn', `data-driver-node="${escapeHtml(missing[0].nodeId)}"`));
    } else {
      rows.push(driverRow('Wiring', 'Complete', 'ok', ''));
    }
    const bottleneckPairs = graph.nodes.flatMap(current => bottlenecksFor(current.id).map(limit => ({
      nodeId: current.id,
      limit,
      label: `${current.label}: ${portName(limit)}`,
    })));
    const otherBottlenecks = bottleneckPairs.filter(item => item.limit !== 'electricity' && item.limit !== 'site budget');
    if (otherBottlenecks.length) {
      const shown = otherBottlenecks.slice(0, 3).map(item => item.label).join(' · ');
      rows.push(driverRow('Bottleneck', escapeHtml(shown), 'warn', `data-driver-node="${escapeHtml(otherBottlenecks[0].nodeId)}"`));
    } else if (powerNote && bottleneckPairs.length) {
      rows.push(driverRow('Bottleneck', 'See power', 'warn', ''));
    } else {
      rows.push(driverRow('Bottleneck', 'None', 'ok', ''));
    }
    if (solveError) {
      rows.push(driverRow('Solve', escapeHtml(solveError), 'bad', ''));
    } else if (!result?.balances) {
      rows.push(driverRow('Balance', 'Not solved', 'warn', 'data-driver-tab="process"'));
    } else if (result.balances.maxAbsResidual >= 1e-8) {
      rows.push(driverRow('Balance', escapeHtml(`Residual ${formatNumber(result.balances.maxAbsResidual)}`), 'warn', 'data-driver-tab="process"'));
    } else {
      rows.push(driverRow('Balance', 'Closed', 'ok', ''));
    }
    if (site?.rights) {
      const concession = site.rights.brineConcession;
      const unverified = unverifiedRightsWarnings?.(site) || [];
      const chip = concession ? rightsChip(concession.status) : '';
      const extra = unverified.length ? ` · ${unverified.length} unverified` : '';
      rows.push(driverRow('Rights', `${chip} Brine concession${escapeHtml(extra)}`, unverified.length ? 'warn' : 'ok', 'data-driver-rights="brineConcession"'));
    } else {
      rows.push(driverRow('Rights', 'No site rights', 'warn', ''));
    }
    list.innerHTML = rows.join('');
  }

  function renderOverviewResources(landQuality) {
    const land = document.getElementById('overviewLand');
    const yieldEl = document.getElementById('overviewYield');
    const waterEl = document.getElementById('overviewWater');
    if (land) {
      if (site && typeof FlowsheetFootprint !== 'undefined') {
        const footprint = FlowsheetFootprint.estimateFootprint({ site, graph, solved: result });
        const meta = metricMetaMarkup({ quality: landQuality });
        land.innerHTML = footprint.totalAreaM2 > 0
          ? `<div class="metric-stat"><span>Land</span><strong>${formatUncertainHa(footprint.totalHa, landQuality)}</strong>${meta}</div><div class="metric-stat"><span>Solar land</span><strong>${formatUncertainHa(footprint.solar.ha, landQuality)}</strong></div>`
          : metricStats([['Land', '—'], ['Solar land', '—']]);
      } else if (networkResult?.landHa) {
        const meta = metricMetaMarkup({ quality: landQuality });
        land.innerHTML = `<div class="metric-stat"><span>Land</span><strong>${formatUncertainHa(networkResult.landHa, landQuality)} network</strong>${meta}</div><div class="metric-stat"><span>Solar land</span><strong>—</strong></div>`;
      } else {
        land.innerHTML = metricStats([['Land', '—'], ['Solar land', '—']]);
      }
    }
    if (yieldEl) {
      const yieldMeta = overviewYieldMeta();
      const kwp = Number(site?.solarKWp);
      const kwpText = Number.isFinite(kwp) ? `${formatNumber(kwp)} kWp` : '—';
      if (!yieldMeta || !Number.isFinite(yieldMeta.daily)) {
        yieldEl.innerHTML = metricStats([['Yield', '—'], ['Array', kwpText]]);
      } else {
        const value = formatUncertainNumber(yieldMeta.daily, yieldMeta.quality, { unit: 'kWh/kWp·day' });
        const meta = metricMetaMarkup({
          quality: yieldMeta.quality,
          band: yieldMeta.band,
          references: yieldMeta.references,
        });
        yieldEl.innerHTML = `<div class="metric-stat"><span>Yield</span><strong>${value}</strong>${meta}</div><div class="metric-stat"><span>Array</span><strong>${kwpText}</strong></div>`;
      }
    }
    if (waterEl) {
      const resource = site?.resources?.freshwater;
      const right = site?.rights?.freshwater;
      if (!resource?.stream) {
        waterEl.innerHTML = metricStats([['Water', '—'], ['Right', '—']]);
      } else {
        let kg = null;
        try { kg = sourceAmount(resource.stream); } catch { kg = null; }
        const amount = Number.isFinite(kg) ? `${formatNumber(kg)} kg/d` : '—';
        const chip = right ? rightsChip(right.status) : '';
        waterEl.innerHTML = metricStats([['Water', amount], ['Right', chip || '—']]);
      }
    }
  }

  function mirrorOverviewChips() {
    for (const [fromId, toId] of [['solveStatus', 'overviewSolveChip'], ['balanceStatus', 'overviewBalanceChip']]) {
      const from = document.getElementById(fromId);
      const to = document.getElementById(toId);
      if (!from || !to) continue;
      to.textContent = from.textContent;
      to.className = from.className || 'status-chip';
    }
  }

  function renderOverview() {
    const siteEl = document.getElementById('overviewSiteName');
    const honesty = document.getElementById('overviewHonesty');
    const cash = document.getElementById('overviewCashflow');
    const slate = document.getElementById('overviewSlate');
    if (!siteEl || !cash) return;

    if (site?.name) {
      siteEl.textContent = site.name;
    } else if (!graph.nodes.length) {
      siteEl.textContent = 'No plant loaded';
    } else {
      const label = draftSiteLabel();
      const lat = document.getElementById('siteLatitude')?.value;
      const lon = document.getElementById('siteLongitude')?.value;
      if (lat !== undefined && lat !== '' && lon !== undefined && lon !== '') {
        siteEl.innerHTML = `${escapeHtml(label)} <button type="button" class="text-button" data-apply-location>(apply location)</button>`;
      } else {
        siteEl.textContent = label;
      }
    }

    const gate = economicsGateReasons();
    const moneyQuality = classifyQuality({ kind: 'money' });
    const landQuality = classifyQuality({ kind: 'land' });
    if (honesty) {
      if (!graph.nodes.length) honesty.textContent = 'No plant loaded — pick a case or open Process.';
      else if (gate.length) honesty.textContent = `Screening — not bankable (${gate.join('; ')}). Gate is R − OPEX − ann. CAPEX.`;
      else if (currentEconomics && (moneyQuality === 'screening' || moneyQuality === 'assumption')) {
        honesty.textContent = 'Screening — not bankable. Capital-inclusive gate is R − OPEX − ann. CAPEX.';
      } else if (currentEconomics) honesty.textContent = 'Capital-inclusive gate is R − OPEX − ann. CAPEX. NPV and IRR stay on Economics.';
      else honesty.textContent = 'Graph incomplete — cash gate needs a solved plant.';
    }

    if (!currentEconomics) {
      cash.className = 'cash-gate';
      cash.innerHTML = '<span class="cash-gate-label">Net cash / year</span><strong>—</strong><span class="cash-gate-verdict">No gate</span><small>R − OPEX − ann. CAPEX</small>';
    } else {
      const net = currentEconomics.annualNetCash;
      const pass = net > 0;
      const fail = net < 0;
      const verdict = pass ? 'Above gate' : fail ? 'Below gate' : 'At gate';
      const netClass = pass ? 'positive' : fail ? 'negative' : '';
      cash.className = `cash-gate${pass ? ' is-pass' : fail ? ' is-fail' : ''}`;
      cash.innerHTML = `<span class="cash-gate-label">Net cash / year</span><strong class="${netClass}">${formatUncertainMoney(net, moneyQuality)}</strong><span class="cash-gate-verdict">${verdict}</span><small>R − OPEX − ann. CAPEX</small>`;
    }

    if (slate) slate.innerHTML = renderSlateTable(overviewSaleRecords());
    renderOverviewResources(landQuality);
    renderOverviewFootprint();
    renderOverviewDrivers();
    const offtake = document.getElementById('overviewOfftake');
    const offtakeWrap = document.getElementById('overviewOfftakeWrap');
    if (offtakeWrap && offtake) offtakeWrap.hidden = !!offtake.hidden || !offtake.textContent;
    mirrorOverviewChips();
    renderCashflowResult();
  }

  function finiteSeries(values) {
    if (!Array.isArray(values) || !values.length) return null;
    const nums = values.map(Number);
    if (nums.some(value => !Number.isFinite(value))) return null;
    return nums;
  }

  function formatCompactMass(kg) {
    const n = Number(kg);
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n) >= 1000) return `${formatNumber(n / 1000)} t/d`;
    return `${formatNumber(n)} kg/d`;
  }

  function formatCompactEnergy(kWh, heat) {
    const n = Number(kWh);
    if (!Number.isFinite(n)) return null;
    const mark = heat ? 'ₜₕ' : '';
    if (Math.abs(n) >= 1000) return `${formatNumber(n / 1000)} MWh${mark}/d`;
    return `${formatNumber(n)} kWh${mark}/d`;
  }

  function formatEdgeRate(stream) {
    if (!stream) return null;
    if (stream.kind === 'material') return formatCompactMass(FlowsheetModel.streamMassKg(stream));
    if (stream.kind === 'consumable') {
      const unit = stream.unit === 'kg/day' ? 'kg/d' : (stream.unit || '');
      return `${formatNumber(stream.amount)} ${unit}`.trim();
    }
    if (stream.kind === 'heat') return formatCompactEnergy(stream.kWh, true);
    if (stream.kind === 'electricity') return formatCompactEnergy(stream.kWh, false);
    return null;
  }

  function streamIsFlowing(stream) {
    if (!stream) return false;
    if (stream.kind === 'material') return FlowsheetModel.streamMassKg(stream) > 1e-9;
    if (stream.kind === 'consumable') return Number(stream.amount) > 1e-9;
    if (stream.kind === 'heat' || stream.kind === 'electricity') return Number(stream.kWh) > 1e-9;
    return false;
  }

  function utilizationRatio(current, nodeResult) {
    const capacity = Number(current.capacity);
    const activity = Number(nodeResult?.activity);
    if (!(capacity > 0) || !Number.isFinite(activity)) return null;
    return activity / capacity;
  }

  function ratioGauge(fraction, title, tone) {
    if (!Number.isFinite(fraction)) return null;
    const clamped = Math.max(0, Math.min(1, fraction));
    return { type: 'bar', fraction: clamped, read: `${formatNumber(clamped * 100)}%`, title, tone };
  }

  function monthlyYieldGauge(current) {
    const solarBacked = current.unit === 'solar-pv'
      || (current.unit === 'electricity-source' && current.siteResource === 'electricity');
    if (!solarBacked) return null;
    const raw = finiteSeries(site?.meteo?.monthlyPVKWhPerKWp || site?.solar?.monthlyPVKWhPerKWp);
    if (!raw) return null;
    const months = raw.length >= 13 ? raw.slice(1, 13) : raw.slice(0, 12);
    if (months.length < 2 || months.some(value => !Number.isFinite(value)) || months.every(value => value <= 0)) return null;
    const low = Math.min(...months);
    const high = Math.max(...months);
    return {
      type: 'spark',
      series: months,
      title: `Monthly yield ${formatNumber(low)}–${formatNumber(high)} kWh/kWp·day`,
    };
  }

  function configuredFactorGauge(current) {
    if (['solar-pv', 'nuclear-electricity'].includes(current.unit)) {
      const factor = Number(current.params?.capacityFactor);
      if (!Number.isFinite(factor) || factor < 0 || factor > 1) return null;
      return {
        type: 'bar',
        fraction: factor,
        read: `${formatNumber(factor * 100)}%`,
        title: `Capacity factor ${formatNumber(factor * 100)}%`,
        tone: 'cf',
      };
    }
    if (current.unit === 'solar-thermal') {
      const sunHours = Number(current.params?.sunHours);
      if (!Number.isFinite(sunHours) || sunHours < 0 || sunHours > 24) return null;
      return {
        type: 'bar',
        fraction: sunHours / 24,
        read: `${formatNumber(sunHours)}h`,
        title: `${formatNumber(sunHours)} sun hours`,
        tone: 'cf',
      };
    }
    return null;
  }

  function busDispatchGauge(current) {
    if (current.unit !== 'electrical-bus' || !result?.streams) return null;
    const offered = Number(result.nodes?.[current.id]?.available?.kWh);
    const used = result.streams
      .filter(edge => edge.from.node === current.id && edge.stream?.kind === 'electricity')
      .reduce((sum, edge) => sum + (Number(edge.stream.kWh) || 0), 0);
    if (!(offered > 0) || !Number.isFinite(used)) return null;
    return ratioGauge(used / offered, `Bus dispatch ${formatNumber(used)} / ${formatNumber(offered)} kWh/d`, 'util');
  }

  function activityGauge(current, nodeResult, allowed, title) {
    if (!allowed.has(current.unit)) return null;
    return ratioGauge(utilizationRatio(current, nodeResult), title, 'util');
  }

  function hubGauge(current, nodeResult) {
    return monthlyYieldGauge(current)
      || configuredFactorGauge(current)
      || busDispatchGauge(current)
      || activityGauge(current, nodeResult, new Set(['swro', 'med', 'msf']), 'Water train utilization')
      || activityGauge(current, nodeResult, new Set(['battery', 'thermal-storage']), 'Storage throughput');
  }

  function electricityDrawKWh(nodeResult) {
    const consumed = nodeResult?.consumed;
    if (!consumed || typeof consumed !== 'object') return null;
    let sum = 0;
    let found = false;
    for (const stream of Object.values(consumed)) {
      if (stream?.kind === 'electricity' && Number.isFinite(stream.kWh)) {
        sum += stream.kWh;
        found = true;
      }
    }
    return found ? sum : null;
  }

  function nodeMeterChip(current, nodeResult) {
    const util = utilizationRatio(current, nodeResult);
    if (util != null) {
      const shown = Math.max(0, Math.min(1, util));
      return { kind: 'util', text: `${formatNumber(shown * 100)}%` };
    }
    if (['source', 'sink', 'junction'].includes(units[current.unit].kind)) return null;
    const kWh = electricityDrawKWh(nodeResult);
    if (!(kWh > 0)) return null;
    return { kind: 'power', text: formatCompactEnergy(kWh, false) };
  }

  function buildingProfile(unit, kind, current) {
    if (kind === 'source') {
      if (unit === 'solar-pv' || unit === 'electricity-source') return 'solar';
      if (unit === 'solar-thermal' || unit === 'heat-source' || unit === 'combustion-heat') return 'furnace';
      if (unit === 'material-source') {
        const intake = intakeKind(current);
        return intake?.profile || 'intake';
      }
      if (unit === 'consumable-source') return 'silo';
      // Prefer honest intake slab over unlabeled storage tank for stray sources.
      return 'intake';
    }
    if (kind === 'sink') return 'silo';
    if (kind === 'buffer' || unit === 'material-buffer') return 'tank';
    if (unit === 'intake-pump' || unit === 'gas-blower') return 'pipe';
    if (unit === 'electrical-bus' || kind === 'junction') return 'bus';
    if (unit === 'brine-minerals' || unit === 'swro' || unit === 'med' || unit === 'msf' || unit === 'iac-leach') return 'pond';
    if (unit === 'mg-si' || unit === 'polysilicon') return 'furnace';
    if (unit === 'electrolyzer' || unit === 'chlor-alkali' || unit === 'bromine-recovery' || unit === 'bayer-alumina' || unit === 'aluminium-smelter' || unit === 'bioforge' || unit === 'pv-module') return 'cell';
    if (unit === 'asu' || unit === 'ammonia' || unit === 'sabatier' || unit === 'methanol' || unit === 'dac') return 'tower';
    if (kind === 'splitter' || kind === 'mixer') return 'pipe';
    return 'shed';
  }

  function renderBuildingBody(x, y, width, height, profile) {
    const dx = ISO_DX;
    const dy = ISO_DY;
    const x2 = x + width;
    const y2 = y + height;
    const top = `M${x} ${y} L${x2} ${y} L${x2 + dx} ${y - dy} L${x + dx} ${y - dy} Z`;
    const side = `M${x2} ${y} L${x2 + dx} ${y - dy} L${x2 + dx} ${y2 - dy} L${x2} ${y2} Z`;
    const front = `M${x} ${y} L${x2} ${y} L${x2} ${y2} L${x} ${y2} Z`;
    const hit = `<rect class="node-hit" x="${x}" y="${y}" width="${width}" height="${height}" rx="${NODE_RX}"/>`;
    if (profile === 'tank' || profile === 'silo') {
      const cx = x + width / 2;
      const rx = Math.min(width * 0.42, 78);
      const ry = Math.max(10, dy + 4);
      const bodyTop = y + 10;
      const lid = `<ellipse class="node-roof node-tank-lid" cx="${cx}" cy="${bodyTop}" rx="${rx}" ry="${ry}"/>`;
      const shell = `<path class="node-front node-tank-shell" d="M${cx - rx} ${bodyTop} L${cx - rx} ${y2 - 6} Q${cx} ${y2 + 4} ${cx + rx} ${y2 - 6} L${cx + rx} ${bodyTop} Q${cx} ${bodyTop + ry} ${cx - rx} ${bodyTop} Z"/>`;
      const rim = `<ellipse class="node-top node-tank-rim" cx="${cx}" cy="${bodyTop}" rx="${rx}" ry="${ry}"/>`;
      const band = `<rect class="node-band" x="${cx - rx + 4}" y="${(bodyTop + y2) / 2 - 4}" width="${rx * 2 - 8}" height="8" rx="1"/>`;
      return `${hit}${shell}${band}${lid}${rim}`;
    }
    if (profile === 'solar') {
      const panel = `<path class="node-top node-solar-top" d="${top}"/>`;
      const face = `<path class="node-front node-solar-front" d="${front}"/>`;
      const right = `<path class="node-side node-solar-side" d="${side}"/>`;
      const lines = [0.22, 0.4, 0.58, 0.76].map((t) => {
        const px = x + dx * t;
        const py = y - dy * t;
        return `<line class="node-solar-rib" x1="${px}" y1="${py}" x2="${x2 + dx * t}" y2="${py}"/>`;
      }).join('');
      return `${hit}${right}${face}${panel}${lines}`;
    }
    if (profile === 'pond') {
      const slab = `<path class="node-front node-pond-front" d="${front}"/>`;
      const lip = `<path class="node-top node-pond-top" d="${top}"/>`;
      const right = `<path class="node-side node-pond-side" d="${side}"/>`;
      const pool = `<rect class="node-pond-pool" x="${x + 10}" y="${y + 18}" width="${width - 20}" height="${Math.max(24, height - 44)}" rx="2"/>`;
      return `${hit}${right}${slab}${lip}${pool}`;
    }
    if (profile === 'intake') {
      // Low intake slab + pipe mouth — seawater / freshwater, not a storage tank.
      const slab = `<path class="node-front node-intake-front" d="${front}"/>`;
      const lip = `<path class="node-top node-intake-top" d="${top}"/>`;
      const right = `<path class="node-side node-intake-side" d="${side}"/>`;
      const mouthCx = x + width * 0.32;
      const mouthCy = y + Math.max(42, height * 0.55);
      const mouth = `<ellipse class="node-intake-mouth" cx="${mouthCx}" cy="${mouthCy}" rx="16" ry="12"/>`;
      const pipe = `<rect class="node-intake-pipe" x="${mouthCx + 12}" y="${mouthCy - 6}" width="${Math.max(36, width * 0.38)}" height="12" rx="2"/>`;
      return `${hit}${right}${slab}${lip}${mouth}${pipe}`;
    }
    if (profile === 'stack') {
      // Duct / stack intake for ambient air or flue — tower-like, not a tank.
      const face = `<path class="node-front node-stack-building" d="${front}"/>`;
      const roof = `<path class="node-top node-stack-building-top" d="${top}"/>`;
      const right = `<path class="node-side" d="${side}"/>`;
      const sx = x + width * 0.58;
      const stackH = 34;
      const duct = `<rect class="node-intake-stack" x="${sx}" y="${y - stackH}" width="20" height="${stackH}"/>`
        + `<ellipse class="node-intake-stack-rim" cx="${sx + 10}" cy="${y - stackH}" rx="11" ry="3.5"/>`;
      return `${hit}${right}${face}${roof}${duct}`;
    }
    if (profile === 'tower' || profile === 'cell' || profile === 'furnace') {
      const face = `<path class="node-front" d="${front}"/>`;
      const roof = `<path class="node-top" d="${top}"/>`;
      const right = `<path class="node-side" d="${side}"/>`;
      const stackX = x2 - 28;
      const stack = profile === 'cell'
        ? `<rect class="node-stack" x="${stackX}" y="${y - 22}" width="10" height="22"/><rect class="node-stack" x="${stackX + 14}" y="${y - 18}" width="8" height="18"/>`
        : `<rect class="node-stack" x="${stackX}" y="${y - 26}" width="12" height="26"/>`;
      return `${hit}${right}${face}${roof}${stack}`;
    }
    if (profile === 'bus' || profile === 'pipe') {
      const face = `<path class="node-front node-bus-front" d="${front}"/>`;
      const roof = `<path class="node-top node-bus-top" d="${top}"/>`;
      const right = `<path class="node-side" d="${side}"/>`;
      return `${hit}${right}${face}${roof}`;
    }
    const face = `<path class="node-front" d="${front}"/>`;
    const roof = `<path class="node-top" d="${top}"/>`;
    const right = `<path class="node-side" d="${side}"/>`;
    return `${hit}${right}${face}${roof}`;
  }

  function faceStatusModel(current, nodeResult, diagnosis) {
    const gauge = hubGauge(current, nodeResult);
    if (gauge?.type === 'bar' && Number.isFinite(gauge.fraction)) {
      return {
        fraction: Math.max(0, Math.min(1, gauge.fraction)),
        read: gauge.read,
        title: gauge.title,
        tone: gauge.tone === 'cf' ? 'cf' : 'util',
        kind: 'gauge',
      };
    }
    const util = utilizationRatio(current, nodeResult);
    if (util != null) {
      const shown = Math.max(0, Math.min(1, util));
      return {
        fraction: shown,
        read: `${formatNumber(shown * 100)}%`,
        title: `Utilization ${formatNumber(shown * 100)}%`,
        tone: 'util',
        kind: 'util',
      };
    }
    if (!['source', 'sink', 'junction'].includes(units[current.unit].kind)) {
      const kWh = electricityDrawKWh(nodeResult);
      if (kWh > 0) {
        return {
          fraction: null,
          read: formatCompactEnergy(kWh, false),
          title: `Power draw ${formatCompactEnergy(kWh, false)}`,
          tone: 'power',
          kind: 'power',
        };
      }
    }
    if (gauge?.type === 'spark') return { spark: gauge, kind: 'spark' };
    return null;
  }

  function renderFaceStatus(x, y, height, status, diagnosis, running) {
    if (!status && !diagnosis && !running) return '';
    const barY = y + 42;
    const trackX = x + 10;
    const trackW = NODE_WIDTH - 48;
    const lightCx = x + NODE_WIDTH - 14;
    const lightCy = y + 12;
    const light = diagnosis
      ? `<circle class="node-run-light is-starved" cx="${lightCx}" cy="${lightCy}" r="4.5"><title>Starved</title></circle>`
      : running
        ? `<circle class="node-run-light is-running" cx="${lightCx}" cy="${lightCy}" r="4.5"><title>Running</title></circle>`
        : '';
    if (!status) return light;
    if (status.spark) {
      const gauge = status.spark;
      const width = 72;
      const gx = x + NODE_WIDTH - 22 - width;
      const gy = y + 8;
      const peak = Math.max(...gauge.series, 0);
      if (!(peak > 0)) return light;
      const slot = width / gauge.series.length;
      const bars = gauge.series.map((value, index) => {
        const barHeight = Math.max(0, (value / peak) * 12);
        if (!(barHeight > 0)) return '';
        const barWidth = Math.max(0.8, slot - 0.7);
        return `<rect class="node-spark-bar" x="${(gx + index * slot).toFixed(2)}" y="${(gy + 12 - barHeight).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}"/>`;
      }).join('');
      return `<g class="node-gauge node-gauge-spark node-face-spark"><title>${escapeHtml(gauge.title)}</title>${bars}</g>${light}`;
    }
    const label = escapeHtml(status.read || '');
    const title = escapeHtml(status.title || status.read || '');
    const tone = status.tone || 'util';
    const chipClass = status.kind === 'util' ? ' node-chip node-chip-util' : status.kind === 'power' ? ' node-chip node-chip-power' : '';
    if (status.fraction == null) {
      return `<g class="node-face-status node-face-read node-gauge node-gauge-bar${chipClass}" data-face="${status.kind || 'read'}"><title>${title}</title><text class="node-gauge-read" x="${trackX}" y="${barY + 8}">${label}</text>${light}</g>`;
    }
    const fill = Math.max(0, (trackW - 2) * status.fraction);
    return `<g class="node-face-status node-face-bar node-gauge node-gauge-bar node-gauge-${tone}${chipClass}" data-face="${status.kind || 'bar'}"><title>${title}</title><rect class="node-gauge-track node-face-track" x="${trackX}" y="${barY}" width="${trackW}" height="9" rx="1"/><rect class="node-gauge-fill node-face-fill" x="${trackX + 1}" y="${barY + 1}" width="${fill.toFixed(2)}" height="7"/><text class="node-gauge-read node-face-readout" x="${trackX + trackW}" y="${barY - 3}" text-anchor="end">${label}</text>${light}</g>`;
  }

  function renderHubGauge(x, y, gauge) {
    // Legacy helper retained for tests/callers; face status owns paint.
    if (!gauge) return '';
    if (gauge.type === 'spark') {
      const width = 70;
      const height = 13;
      const gx = x + NODE_WIDTH - 8 - width;
      const gy = y + 6;
      const peak = Math.max(...gauge.series, 0);
      if (!(peak > 0)) return '';
      const slot = width / gauge.series.length;
      const bars = gauge.series.map((value, index) => {
        const barHeight = Math.max(0, (value / peak) * height);
        if (!(barHeight > 0)) return '';
        const barWidth = Math.max(0.8, slot - 0.7);
        return `<rect class="node-spark-bar" x="${(gx + index * slot).toFixed(2)}" y="${(gy + height - barHeight).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}"/>`;
      }).join('');
      return `<g class="node-gauge node-gauge-spark"><title>${escapeHtml(gauge.title)}</title>${bars}</g>`;
    }
    const read = String(gauge.read || '');
    const readWidth = Math.max(18, read.length * 5.6);
    const barWidth = 34;
    const gx = x + NODE_WIDTH - 8 - readWidth - 4 - barWidth;
    const barX = gx + readWidth + 4;
    const barY = y + 9;
    const fill = Math.max(0, (barWidth - 2) * gauge.fraction);
    const tone = gauge.tone === 'cf' ? ' node-gauge-cf' : ' node-gauge-util';
    return `<g class="node-gauge node-gauge-bar${tone}"><title>${escapeHtml(gauge.title)}</title><text class="node-gauge-read" x="${gx.toFixed(2)}" y="${y + 16}">${escapeHtml(read)}</text><rect class="node-gauge-track" x="${barX}" y="${barY}" width="${barWidth}" height="6" rx="1"/><rect class="node-gauge-fill" x="${barX + 1}" y="${barY + 1}" width="${fill.toFixed(2)}" height="4"/></g>`;
  }

  function renderMeterChip(x, y, chip) {
    if (!chip) return '';
    const width = Math.min(92, Math.max(34, String(chip.text).length * 5.8 + 10));
    const chipX = x + NODE_WIDTH - 8 - width;
    return `<g class="node-chip node-chip-${chip.kind}"><rect x="${chipX}" y="${y + 6}" width="${width}" height="13" rx="1"/><text x="${chipX + width / 2}" y="${y + 15.5}" text-anchor="middle">${escapeHtml(chip.text)}</text></g>`;
  }

  function floorGridMarkup(width, height) {
    const step = FLOOR_GRID;
    return `<defs><pattern id="plantFloorGrid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path class="floor-grid-line" d="M${step} 0 H0 V${step}" fill="none"/></pattern></defs><rect class="floor-grid" x="0" y="0" width="${width}" height="${height}" fill="url(#plantFloorGrid)"/>`;
  }

  function renderGraph() {
    renderCanvasZoom();
    if (!graph.nodes.length) {
      canvas.classList.add('empty');
      const hint = document.getElementById('canvasPanHint');
      if (hint) hint.hidden = true;
      canvas.innerHTML = EMPTY_CANVAS_HTML;
      return;
    }
    canvas.classList.remove('empty');
    const hint = document.getElementById('canvasPanHint');
    if (hint) hint.hidden = false;
    const sized = contentSize();
    const width = sized.width;
    const height = sized.height;
    const recycleY = height - 45;
    const edges = graph.edges.map((edge, edgeIndex) => {
      const start = portPoint(edge.from.node, edge.from.port, 'out');
      const end = portPoint(edge.to.node, edge.to.port, 'in');
      const sibling = graph.edges.slice(0, edgeIndex).filter(candidate => candidate.from.node === edge.from.node && candidate.from.port === edge.from.port).length;
      const mid = (start.x + end.x) / 2 + sibling * 12;
      const stream = result?.streams.find(candidate => candidate.from.node === edge.from.node && candidate.from.port === edge.from.port && candidate.to.node === edge.to.node && candidate.to.port === edge.to.port)?.stream
        || result?.streams.find(candidate => candidate.from.node === edge.from.node && candidate.from.port === edge.from.port)?.stream;
      const kind = units[node(edge.from.node).unit].ports[edge.from.port].kind;
      const logisticsClamped = (result?.edgeLimits || []).some(item => (
        item.from.node === edge.from.node && item.from.port === edge.from.port
        && item.to.node === edge.to.node && item.to.port === edge.to.port
      ));
      const constrained = logisticsClamped
        || bottlenecksFor(edge.to.node).some(limit => limit === 'logistics' || limitingPort(node(edge.to.node), limit) === edge.to.port);
      const path = edge.recycle
        ? `M${start.x} ${start.y} C${start.x + 70} ${start.y},${start.x + 70} ${recycleY},${start.x} ${recycleY} L${end.x} ${recycleY} C${end.x - 70} ${recycleY},${end.x - 70} ${end.y},${end.x} ${end.y}`
        : `M${start.x} ${start.y} C${mid} ${start.y},${mid} ${end.y},${end.x} ${end.y}`;
      const labelX = edge.recycle ? (start.x + end.x) / 2 : mid;
      const labelY = edge.recycle ? recycleY - 8 : (start.y + end.y) / 2 - 7;
      const rate = formatEdgeRate(stream);
      const flowing = streamIsFlowing(stream);
      const label = rate ? `${edge.recycle ? '↻ ' : ''}${rate}` : '—';
      const belt = kind === 'material' || kind === 'consumable' ? ' belt' : kind === 'electricity' ? ' cable' : kind === 'heat' ? ' pipe' : '';
      const selected = selectedEdgeIndex === edgeIndex ? ' is-selected' : '';
      return `<path class="flow-edge ${kind}${edge.recycle ? ' recycle' : ''}${belt}${constrained ? ' bottleneck' : ''}${flowing ? ' is-flowing' : ' is-static'}${selected}" data-edge-index="${edgeIndex}" d="${path}"/><text class="edge-label${constrained ? ' bottleneck' : ''}${rate ? '' : ' is-muted'}" data-edge-index="${edgeIndex}" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeHtml(label)}</text>`;
    }).join('');
    canvas.innerHTML = `<svg viewBox="0 0 ${width} ${height}" style="width:${width * canvasZoom}px;height:${height * canvasZoom}px;max-width:none" aria-label="Plant floor">${floorGridMarkup(width, height)}${edges}${graph.nodes.map(renderNode).join('')}</svg>`;
  }

  function renderNode(current) {
    const ports = Object.entries(units[current.unit].ports);
    const inputs = ports.filter(([, declaration]) => declaration.direction === 'in');
    const outputs = ports.filter(([, declaration]) => declaration.direction === 'out');
    const { x, y } = current.position;
    const height = nodeHeight(current);
    const nodeResult = result?.nodes[current.id];
    const bottlenecks = bottlenecksFor(current.id);
    const diagnosis = blockDiagnosis(current);
    const running = !!(nodeResult && !diagnosis && !blockIsIdle(current));
    const value = diagnosis
      ? diagnosis.text
      : nodeResult?.activity !== undefined
        ? `${formatNumber(nodeResult.activity)} ${catalog[current.unit].activityUnit}`
        : nodeResult
          ? formatStream(nodeResult.supplied || nodeResult.received || nodeResult.available)
          : 'Not running';
    const portMarkup = (list, direction) => list.map(([port, declaration], index) => {
      const cy = y + PORT_TOP + index * PORT_STEP;
      const cx = direction === 'in' ? x : x + NODE_WIDTH;
      const selected = pendingPort?.node === current.id && pendingPort.port === port;
      const cause = diagnosis?.action === 'port' && diagnosis.port === port && diagnosis.nodeId === current.id;
      const portLabel = `Connect ${portName(port)} ${direction === 'in' ? 'in' : 'out'}`;
      return `<g class="flow-port ${declaration.kind}${selected ? ' pending' : ''}${cause ? ' cause' : ''}" data-node="${current.id}" data-port="${port}" data-direction="${direction}" role="button" tabindex="0" aria-label="${portLabel}" title="${portLabel}"><circle cx="${cx}" cy="${cy}" r="7"/><text x="${direction === 'in' ? cx + 12 : cx - 12}" y="${cy + 3}" text-anchor="${direction === 'in' ? 'start' : 'end'}">${portName(port)}</text></g>`;
    }).join('');
    const reasonTitle = diagnosis ? escapeHtml(diagnosis.detail || diagnosis.text) : '';
    const kind = units[current.unit].kind;
    const intake = current.unit === 'material-source' ? intakeKind(current) : null;
    const profile = buildingProfile(current.unit, kind, current);
    const status = faceStatusModel(current, nodeResult, diagnosis);
    const flags = `${bottlenecks.length ? ' bottleneck' : ''}${current.id === selectedNodeId ? ' selected' : ''}${diagnosis ? ' is-idle' : ''}${running ? ' is-running' : ''} building-${profile}`;
    const bottleneckTitle = nodeResult?.causeText
      ? `Bottleneck: ${nodeResult.causeText}`
      : bottlenecks.length ? `Bottleneck: ${bottlenecks.map(portName).join(', ')}` : '';
    const title = reasonTitle
      ? `<title>${reasonTitle}</title>`
      : bottleneckTitle ? `<title>${escapeHtml(bottleneckTitle)}</title>` : '';
    const reasonAttr = diagnosis ? ` data-reason="${escapeHtml(diagnosis.text)}"` : '';
    const glyph = intake?.glyph
      || (profile === 'tank' ? 'tank'
        : profile === 'silo' ? 'silo'
        : profile === 'solar' ? 'solar'
        : profile === 'furnace' ? 'heat'
        : profile === 'bus' ? 'bus'
        : profile === 'intake' ? 'intake'
        : profile === 'stack' ? 'stack'
        : profile === 'pond' ? 'pond'
        : kind);
    const body = renderBuildingBody(x, y, NODE_WIDTH, height, profile);
    const face = renderFaceStatus(x, y, height, status, diagnosis, running);
    const badgeWidth = Math.min(92, Math.max(40, String(glyph).length * 7.0 + 12));
    return `<g class="flow-node${flags}" data-node="${current.id}" data-profile="${profile}"${reasonAttr} tabindex="0">${title}${body}<rect class="node-kind-badge" x="${x + 8}" y="${y + 6}" width="${badgeWidth}" height="13" rx="1"/><text class="node-kind" x="${x + 8 + badgeWidth / 2}" y="${y + 15.5}" text-anchor="middle">${glyph}</text><text class="node-label" x="${x + 8}" y="${y + 34}">${escapeHtml(current.label)}</text>${face}<line class="node-status-rule" x1="${x + 8}" y1="${y + height - 16}" x2="${x + NODE_WIDTH - 8}" y2="${y + height - 16}"/><text class="node-value${diagnosis ? ' node-reason' : ''}" x="${x + 8}" y="${y + height - 5}">${escapeHtml(value)}</text>${portMarkup(inputs, 'in')}${portMarkup(outputs, 'out')}</g>`;
  }

  function bottlenecksFor(nodeId) { return result?.nodes[nodeId]?.limitedBy || []; }
  function limitingPort(current, limit) {
    if (DAC_ROUTES[current.unit] && limit === 'feed') return 'air';
    if (['battery', 'thermal-storage'].includes(current.unit) && ['electricity', 'heat'].includes(limit)) return 'in';
    return limit;
  }

  function nodeHeight(current) {
    const ports = Object.values(units[current.unit].ports);
    const rows = Math.max(ports.filter(port => port.direction === 'in').length, ports.filter(port => port.direction === 'out').length);
    return Math.max(96, PORT_TOP + rows * PORT_STEP + 16);
  }

  function portPoint(nodeId, port, direction) {
    const current = node(nodeId);
    const ports = Object.entries(units[current.unit].ports).filter(([, declaration]) => declaration.direction === direction);
    return { x: current.position.x + (direction === 'out' ? NODE_WIDTH : 0), y: current.position.y + PORT_TOP + ports.findIndex(([name]) => name === port) * PORT_STEP };
  }

  function renderStatus() {
    const missing = missingConnections();
    const bottlenecks = graph.nodes.flatMap(current => bottlenecksFor(current.id).map(limit => `${current.label}: ${portName(limit)}`));
    const solveStatus = document.getElementById('solveStatus');
    const balanceStatus = document.getElementById('balanceStatus');
    document.getElementById('flowSummary').textContent = `${graph.nodes.length} blocks · ${graph.edges.length} connections`;
    document.getElementById('diagramTitle').textContent = site?.name || (graph.nodes.length ? 'Plant floor' : 'No blocks');
    if (!graph.nodes.length) {
      solveStatus.textContent = 'No plant loaded';
      solveStatus.className = 'status-chip idle';
      balanceStatus.textContent = 'Add a block';
      balanceStatus.className = 'status-chip idle';
    } else {
      solveStatus.textContent = result ? 'Plant running' : 'Plant incomplete';
      solveStatus.className = `status-chip${result ? ' good' : missing.length || solveError ? ' warn' : ''}`;
      balanceStatus.textContent = result ? (result.balances.maxAbsResidual < 1e-8 ? 'Balances closed' : 'Check balances') : pendingPort ? 'Choose compatible port' : 'Manual setpoints';
      balanceStatus.className = `status-chip${result?.balances.maxAbsResidual < 1e-8 ? ' good' : result || pendingPort ? ' warn' : ''}`;
    }
    const warning = document.getElementById('warnings');
    const siteRightWarnings = unverifiedRightsWarnings?.(site) || [];
    const issues = [];
    if (solveError) issues.push({ severity: 'error', text: solveError });
    if (routeNote) issues.push({ severity: 'warn', text: routeNote });
    const powerNote = powerThrottleCallout();
    if (powerNote) {
      const nodeId = powerLimitNodeId();
      issues.push(nodeId
        ? { severity: 'warn', text: powerNote, nodeId }
        : { severity: 'warn', text: powerNote });
    }
    if (pendingPort) {
      issues.push({
        severity: 'info',
        text: `Connecting ${node(pendingPort.node).label} · ${portName(pendingPort.port)}`,
      });
    }
    const openPorts = [
      ...missingConnectionRecords(),
      ...graph.nodes.filter(current => ['source', 'sink'].includes(units[current.unit].kind)).flatMap(unconnectedPorts),
    ];
    openPorts.slice(0, 4).forEach(item => issues.push({
      severity: 'warn',
      text: `Connect ${item.text}`,
      action: 'process',
      nodeId: item.nodeId,
      port: item.port,
    }));
    bottlenecks.slice(0, 4).forEach(item => issues.push({ severity: 'warn', text: `Bottleneck · ${item}`, action: 'process' }));
    siteRightWarnings.forEach(item => issues.push({ severity: 'warn', text: item, action: 'location' }));
    warning.hidden = issues.length === 0;
    warning.innerHTML = issues.map(issue => {
      const text = humanizeUiText(issue.text);
      const go = issue.nodeId
        ? `<button type="button" data-issue-node="${escapeHtml(issue.nodeId)}" data-issue-port="${escapeHtml(issue.port || '')}">Show block</button>`
        : issue.action === 'process'
          ? '<button type="button" data-issue-tab="process">Process</button>'
          : issue.action === 'location'
            ? '<button type="button" data-issue-tab="location">Location</button>'
            : '';
      return `<div class="warning-issue" data-severity="${issue.severity}"><span>${escapeHtml(text)}</span>${go}</div>`;
    }).join('');
  }

  function footprintColor(unit, { cssVar = true } = {}) {
    const hex = {
      electrolyzer: '#5b8def',
      dac: '#6ba177',
      'dac-solid': '#6ba177',
      'dac-liquid': '#4f8f6a',
      'dac-electroswing': '#7bb38a',
      sabatier: '#c4a35a',
      methanol: '#b8924a',
      swro: '#5aa6c7',
      med: '#4f97b8',
      msf: '#4588a8',
      desal: '#5aa6c7',
      'brine-minerals': '#d4a017',
      asu: '#7a8fa3',
      ammonia: '#6b7f9a',
      battery: '#8a8f98',
      'solar-pv': '#c9a227',
      total: '#7a8fa3',
    };
    if (!cssVar) return hex[unit] || '#9aa3ad';
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
      'solar-pv': 'var(--warning)',
    }[unit] || 'var(--border-light)';
  }

  function footprintPopupHtml(block) {
    const area = Number(block.areaM2) || 0;
    const areaText = area >= 10000 ? `${(area / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 })} ha` : `${Math.round(area).toLocaleString('en-US')} m²`;
    const quality = block.quality ? ` · ${block.quality}` : '';
    const cites = (block.evidence || [])
      .filter(item => item?.url)
      .map(item => `<div><a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.label || item.url}</a></div>`)
      .join('');
    return `<strong>${block.label || block.id}</strong><br>${areaText}${quality}${cites ? `<div class="map-popup-cites">${cites}</div>` : ''}`;
  }

  function formatHa(ha) {
    const value = Number(ha) || 0;
    if (value >= 1) return `${formatNumber(value)} ha`;
    if (value >= 0.001) return `${value.toLocaleString('en-US', { maximumFractionDigits: 3 })} ha`;
    if (value > 0) return `${formatNumber(value * 10000)} m²`;
    return '0 ha';
  }

  function currentSiteFootprint() {
    if (!site || typeof FlowsheetFootprint === 'undefined') return null;
    return FlowsheetFootprint.estimateFootprint({ site, graph, solved: result });
  }

  function campusWaterCue(footprint) {
    const units = new Set((footprint?.processes || []).map(item => item?.unit).filter(Boolean));
    if (units.has('brine-minerals')) return { kind: 'brine' };
    if (units.has('swro') || units.has('desal') || units.has('med') || units.has('msf')) {
      return { kind: site?.rights?.seawaterDischarge?.authorize ? 'discharge' : 'intake' };
    }
    if (site?.rights?.freshwater?.authorize || site?.resources?.freshwater?.authorize) return { kind: 'freshwater' };
    return null;
  }

  function footprintDiagramFor(footprint, size) {
    const project = MapSite?.projectCampusDiagramIso || MapSite?.projectCampusDiagram;
    if (!footprint || !(footprint.totalAreaM2 > 0) || !MapSite?.layoutFootprintCampus || !project) return null;
    const latitude = Number(site?.latitude);
    const longitude = Number(site?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const blocks = MapSite.layoutFootprintCampus({
      latitude,
      longitude,
      solar: footprint.solar,
      processes: footprint.processes,
      totalHa: footprint.totalHa,
    });
    if (!blocks.length) return null;
    const waterCue = campusWaterCue(footprint);
    return project(blocks, { latitude, longitude }, { ...size, waterCue });
  }

  function campusDiagramMarkup(diagram, { labels = true, interactive = false } = {}) {
    if (!diagram?.shapes?.length) return '';
    const isIso = diagram.mode === 'iso';
    const ptsAttr = points => points.map(point => point.join(',')).join(' ');
    const layers = [];
    const texts = [];

    if (isIso && Array.isArray(diagram.links)) {
      for (const link of diagram.links) {
        if (!link?.points?.length) continue;
        const d = link.points.map((point, index) => `${index ? 'L' : 'M'}${point[0]} ${point[1]}`).join(' ');
        const cls = link.kind === 'power' ? 'campus-utility' : 'campus-road';
        layers.push(`<path class="${cls}" d="${d}" fill="none"></path>`);
      }
    }

    if (isIso && Array.isArray(diagram.cues)) {
      for (const cue of diagram.cues) {
        if (cue?.pipe?.length >= 2) {
          const d = cue.pipe.map((point, index) => `${index ? 'L' : 'M'}${point[0]} ${point[1]}`).join(' ');
          layers.push(`<path class="campus-water-pipe" d="${d}" fill="none"></path>`);
        }
        if (cue?.points?.length) {
          layers.push(`<polygon class="campus-water campus-water-${escapeHtml(cue.kind || 'intake')}" points="${ptsAttr(cue.points)}"></polygon>`);
          if (labels && cue.label) {
            const xs = cue.points.map(p => p[0]);
            const ys = cue.points.map(p => p[1]);
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
            const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
            texts.push(`<text class="footprint-cue-label" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(cue.label)}</text>`);
          }
        }
      }
    }

    const shapes = diagram.shapes.slice().sort((left, right) => {
      if (isIso) {
        // Outline under pads; then far→near by depth.
        if (left.kind === 'outline' && right.kind !== 'outline') return -1;
        if (right.kind === 'outline' && left.kind !== 'outline') return 1;
        return (right.depth ?? 0) - (left.depth ?? 0);
      }
      const rank = { outline: 0, solar: 1, process: 2 };
      return (rank[left.kind] ?? 1) - (rank[right.kind] ?? 1);
    });

    for (const shape of shapes) {
      const isOutline = shape.kind === 'outline';
      const fill = footprintColor(shape.unit, { cssVar: false });
      const haText = formatHa((Number(shape.areaM2) || 0) / 10000);
      const title = `${shape.label || shape.id || 'Pad'} · ${haText}`;
      const padAttr = interactive && !isOutline && shape.id
        ? ` data-footprint-pad="${escapeHtml(shape.id)}" tabindex="0"`
        : '';

      if (isIso && shape.faces) {
        const parts = [];
        parts.push(`<title>${escapeHtml(title)}</title>`);
        if (isOutline) {
          parts.push(`<polygon class="pad-outline" points="${ptsAttr(shape.faces.top || shape.points)}" fill="${fill}" fill-opacity="0.1" stroke="#d7e2ee" stroke-width="1.2" stroke-dasharray="5 3"></polygon>`);
        } else {
          if (shape.faces.east) {
            parts.push(`<polygon class="pad-east" points="${ptsAttr(shape.faces.east)}" fill="${fill}" fill-opacity="0.55" stroke="#0c1117" stroke-width="0.9"></polygon>`);
          }
          if (shape.faces.south) {
            parts.push(`<polygon class="pad-south" points="${ptsAttr(shape.faces.south)}" fill="${fill}" fill-opacity="0.72" stroke="#0c1117" stroke-width="0.9"></polygon>`);
          }
          const topOpacity = shape.kind === 'solar' ? 0.78 : 0.92;
          parts.push(`<polygon class="pad-top pad-${escapeHtml(shape.kind || 'process')}" points="${ptsAttr(shape.faces.top || shape.points)}" fill="${fill}" fill-opacity="${topOpacity}" stroke="#0c1117" stroke-width="1.05"></polygon>`);
          for (const segment of shape.hatch || []) {
            if (!segment?.[0] || !segment?.[1]) continue;
            const cls = shape.kind === 'solar' ? 'pad-solar-hatch' : 'pad-shed-ridge';
            parts.push(`<line class="${cls}" x1="${segment[0][0]}" y1="${segment[0][1]}" x2="${segment[1][0]}" y2="${segment[1][1]}"></line>`);
          }
        }
        layers.push(`<g class="campus-pad"${padAttr}>${parts.join('')}</g>`);
      } else {
        const pts = ptsAttr(shape.points);
        const opacity = isOutline ? 0.14 : shape.kind === 'solar' ? 0.62 : 0.84;
        const stroke = isOutline ? '#d7e2ee' : '#0c1117';
        const weight = isOutline ? 1.4 : 1.1;
        const dash = isOutline ? ' stroke-dasharray="5 3"' : '';
        layers.push(
          `<g${padAttr}><title>${escapeHtml(title)}</title><polygon points="${pts}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${weight}"${dash}></polygon></g>`
        );
      }

      if (!labels) continue;
      if (isOutline && shape.box.h >= 28) {
        texts.push(`<text class="footprint-ha" x="${shape.box.cx}" y="${(shape.box.minY + 13).toFixed(1)}" text-anchor="middle">${escapeHtml(haText)}</text>`);
      } else if (!isOutline && shape.box.w >= 34 && shape.box.h >= 14) {
        const raw = String(shape.label || '');
        const name = raw.length > 18 ? `${raw.slice(0, 16)}…` : raw;
        if (name) {
          const y = isIso ? (shape.box.cy - (shape.kind === 'solar' ? 2 : 0)) : shape.box.cy;
          texts.push(`<text class="footprint-pad-name" x="${shape.box.cx}" y="${y}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(name)}</text>`);
        }
        if (isIso && shape.kind === 'solar' && shape.box.h >= 22) {
          texts.push(`<text class="footprint-ha" x="${shape.box.cx}" y="${(shape.box.cy + 11).toFixed(1)}" text-anchor="middle">${escapeHtml(haText)}</text>`);
        }
      }
    }
    return `${layers.join('')}${texts.join('')}`;
  }

  function footprintLegendMarkup(footprint) {
    const items = [];
    if (footprint.solar?.landAreaM2 > 0) {
      items.push({ id: 'solar', unit: 'solar-pv', label: 'Solar field', detail: formatHa(footprint.solar.ha) });
    }
    for (const item of footprint.processes || []) {
      const quality = item.quality && item.quality !== 'cited' ? ` · ${item.quality}` : '';
      items.push({
        id: item.id,
        unit: item.unit,
        label: item.label,
        detail: `${formatNumber(item.areaM2)} m²${quality}`,
      });
    }
    if (!items.length) return '<li class="pad-legend-empty">Add blocks to size pads</li>';
    const rows = items.map(item => (
      `<li><button type="button" class="pad-legend" data-footprint-pad="${escapeHtml(item.id)}"><span class="pad-swatch" style="background:${footprintColor(item.unit)}"></span>${escapeHtml(item.label)} · ${escapeHtml(item.detail)}</button></li>`
    )).join('');
    if (!footprint.processes?.length) {
      return `${rows}<li class="pad-legend-empty">Add blocks to size pads</li>`;
    }
    return rows;
  }

  function syncFootprintMapChrome(footprint) {
    const haEl = document.getElementById('siteMapHa');
    const emptyEl = document.getElementById('siteMapFootprintEmpty');
    const enabled = !!siteMapEnabled.footprint;
    const hasArea = !!(footprint && footprint.totalAreaM2 > 0);
    if (haEl) {
      haEl.hidden = !(enabled && hasArea);
      haEl.textContent = enabled && hasArea ? formatHa(footprint.totalHa) : '';
    }
    if (emptyEl) {
      emptyEl.hidden = !(enabled && !hasArea);
      emptyEl.textContent = 'Add blocks to size pads';
    }
  }

  function bindFootprintTooltip(poly, block) {
    if (typeof poly?.bindTooltip !== 'function' || !block) return;
    const isOutline = block.kind === 'outline';
    const text = isOutline
      ? formatHa((Number(block.areaM2) || 0) / 10000)
      : (block.label || block.id || '');
    if (!text) return;
    const coords = readMapCoordinates();
    const zoom = siteMap?.getZoom?.();
    const visible = MapSite?.footprintLabelVisible
      ? MapSite.footprintLabelVisible({ areaM2: block.areaM2, latitude: coords?.latitude, zoom })
      : false;
    let offset = [0, 0];
    if (isOutline && visible && Number.isFinite(zoom)) {
      const latitude = Number(coords?.latitude) || 0;
      const metersPerPixel = 156543.03392 * Math.cos(latitude * Math.PI / 180) / (2 ** zoom);
      const radiusPx = Math.sqrt((Number(block.areaM2) || 0) / Math.PI) / metersPerPixel;
      offset = [0, -Math.max(14, Math.min(radiusPx * 0.72, 96))];
    }
    try { poly.unbindTooltip?.(); } catch { /* no tooltip yet */ }
    poly.bindTooltip(text, {
      permanent: visible,
      direction: 'center',
      offset,
      className: isOutline ? 'footprint-map-ha' : 'footprint-map-label',
      opacity: 1,
    });
  }

  function refreshFootprintLabels() {
    for (const poly of Object.values(siteMapFootprintById)) {
      if (poly?.__footprintBlock) bindFootprintTooltip(poly, poly.__footprintBlock);
    }
  }

  function focusFootprintPad(id) {
    if (!id || !siteMap) return false;
    const layer = siteMapFootprintById[id];
    if (!layer || typeof layer.openPopup !== 'function') return false;
    try {
      if (activeTab !== 'location') activateTab('location');
      const bounds = typeof layer.getBounds === 'function' ? layer.getBounds() : null;
      if (bounds && typeof siteMap.fitBounds === 'function') {
        siteMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: false });
      }
      layer.openPopup();
      siteMapMarker?.bringToFront?.();
      return true;
    } catch {
      return false;
    }
  }

  function renderOverviewFootprint() {
    const wrap = document.getElementById('overviewFootprint');
    const svg = document.getElementById('overviewFootprintSvg');
    const ha = document.getElementById('overviewFootprintHa');
    if (!wrap) return;
    const footprint = currentSiteFootprint();
    const hasArea = !!(site && graph.nodes.length && footprint && footprint.totalAreaM2 > 0);
    wrap.hidden = !hasArea;
    if (!hasArea) {
      if (svg) svg.innerHTML = '';
      if (ha) ha.textContent = '';
      return;
    }
    if (ha) ha.textContent = formatHa(footprint.totalHa);
    const diagram = footprintDiagramFor(footprint, { width: 160, height: 96, pad: 4 });
    if (svg) {
      if (diagram?.viewBox) svg.setAttribute('viewBox', diagram.viewBox);
      svg.classList.toggle('is-iso', diagram?.mode === 'iso');
      svg.innerHTML = diagram ? campusDiagramMarkup(diagram, { labels: false, interactive: false }) : '';
    }
  }

  function renderSiteFootprint() {
    const panel = document.getElementById('siteFootprint');
    const metrics = document.getElementById('siteFootprintMetrics');
    const pads = document.getElementById('siteFootprintPads');
    const note = document.getElementById('siteFootprintNote');
    const svg = document.getElementById('siteFootprintSvg');
    const empty = document.getElementById('siteFootprintEmpty');
    const total = document.getElementById('siteFootprintTotal');
    if (!panel) return;
    panel.hidden = false;
    const footprint = currentSiteFootprint();
    const hasArea = !!(footprint && footprint.totalAreaM2 > 0);
    if (empty) {
      empty.hidden = hasArea;
      empty.textContent = 'Add blocks to size pads';
    }
    if (total) total.textContent = hasArea ? formatHa(footprint.totalHa) : '';
    if (!hasArea) {
      if (svg) {
        svg.hidden = true;
        svg.innerHTML = '';
      }
      if (metrics) metrics.innerHTML = '';
      if (pads) pads.innerHTML = '';
      if (note) note.textContent = '';
      syncFootprintMapChrome(footprint);
      return;
    }
    const diagram = footprintDiagramFor(footprint, { width: 320, height: 200, pad: 16 });
    if (svg) {
      svg.hidden = false;
      if (diagram?.viewBox) svg.setAttribute('viewBox', diagram.viewBox);
      svg.classList.toggle('is-iso', diagram?.mode === 'iso');
      svg.innerHTML = diagram ? campusDiagramMarkup(diagram, { labels: true, interactive: true }) : '';
    }
    if (metrics) {
      const landQuality = classifyQuality({ kind: 'land' });
      const padQuality = classifyQuality({ kind: 'intensity', sourceNote: footprint.processes.some(item => item.quality === 'cited') ? 'cited pad intensities' : 'order-of-magnitude screening' });
      metrics.innerHTML = metricRows([
        ['Solar land', `${formatUncertainHa(footprint.solar.ha)} · ${formatUncertainNumber(footprint.solar.acres, landQuality)} acres`, { quality: landQuality }],
        ['GCR', `${formatUncertainNumber(footprint.solar.gcr * 100, landQuality)}% (base ${formatUncertainNumber(footprint.solar.baseGcr * 100, landQuality)}%)`, { quality: landQuality }],
        ['Panel area', `${formatUncertainNumber(footprint.solar.panelAreaM2, landQuality)} m²`, { quality: landQuality }],
        ['Process pads', `${formatUncertainNumber(footprint.processAreaM2, padQuality)} m²`, { quality: padQuality }],
        ['Total', `${formatUncertainHa(footprint.totalHa)} · ${formatUncertainNumber(footprint.totalAcres, landQuality)} acres`, { quality: landQuality }],
      ]);
    }
    if (pads) pads.innerHTML = footprintLegendMarkup(footprint);
    if (note) {
      note.textContent = 'Process pads use cited or screening intensities × activity (not surveyed layouts). Solar = panel area ÷ GCR.';
    }
    syncFootprintMapChrome(footprint);
  }

  function draftSiteLabel() {
    const lat = document.getElementById('siteLatitude')?.value;
    const lon = document.getElementById('siteLongitude')?.value;
    if (lat !== undefined && lat !== '' && lon !== undefined && lon !== '') {
      return `Draft site · ${lat}, ${lon}`;
    }
    return 'Choose a site';
  }

  function renderSite() {
    const panel = document.getElementById('sitePanel');
    panel.hidden = false;
    document.getElementById('siteName').textContent = site?.name || draftSiteLabel();
    document.getElementById('siteNotes').textContent = site?.notes || '';
    const presetSelect = document.getElementById('sitePreset');
    if (presetSelect && sitePresets().length) {
      const match = matchingPresetId();
      if (presetSelect.value !== match) presetSelect.value = match;
    }
    document.getElementById('siteLatitude').value = site?.latitude ?? 31.35;
    document.getElementById('siteLongitude').value = site?.longitude ?? 84.05;
    const kWpInput = document.getElementById('siteSolarKWp');
    const kWpFull = site?.solarKWp ?? 37.5;
    kWpInput.value = formatDisplayNumber(kWpFull, 2);
    kWpInput.title = `${kWpFull} kWp`;
    kWpInput.dataset.fullKwp = String(kWpFull);
    document.getElementById('siteBatteryKWh').value = site?.storage?.batteryKWh ?? 0;
    const monthLabel = document.getElementById('siteMonthLabel');
    const monthSelect = document.getElementById('siteMonth');
    if (site?.solar?.typicalMonths || Array.isArray(site?.meteo?.monthlyPVKWhPerKWp)) {
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
    renderSiteMap();
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
    const sizeText = (() => {
      if (lastSizing?.mode === 'positive-cashflow') {
        const obj = lastSizing.objective || {};
        const selected = lastSizing.selected || {};
        const slate = selected.slateMode || selected.product || 'slate';
        const scale = selected.scale != null ? ` · scale ${selected.scale}×` : (selected.rate != null ? ` · ${selected.rate} kg/day` : '');
        const metNote = obj.met && !balancesNeedAttention() ? '' : ' · objective not met';
        const heatNote = lastSizing.heatCoveredKWh != null || lastSizing.heatResidualKWh != null
          ? ` · heat covered ${formatNumber(lastSizing.heatCoveredKWh || 0)} / residual ${formatNumber(lastSizing.heatResidualKWh || 0)} kWh`
          : '';
        return `${obj.activeSaleCount ?? obj.positiveSaleCount ?? 0} positive-sale products · net cash ${formatCashflowMoney(obj.annualNetCash)} · ${slate}${scale}${heatNote}${metNote}`;
      }
      if (lastSizing) {
        const iters = lastSizing.iterations;
        const capNote = lastSizing.history?.some(step => step.capped) ? ' · cap-limited' : '';
        const convergeNote = lastSizing.converged ? '' : ' · not converged';
        const unverified = (lastSizing.warnings || lastSizing.solved?.warnings || [])
          .filter(message => String(message).includes('unverified site right'));
        const rightsNote = unverified.length
          ? ` · ${unverified.length} unverified site right${unverified.length === 1 ? '' : 's'}`
          : '';
        const product = SIZE_PRODUCT_LABELS[lastSizing.product] || lastSizing.product || 'CH₄';
        const heatNote = lastSizing.heatCoveredKWh != null || lastSizing.heatResidualKWh != null
          ? ` · heat covered ${formatNumber(lastSizing.heatCoveredKWh || 0)} / residual ${formatNumber(lastSizing.heatResidualKWh || 0)} kWh`
          : '';
        return `${product} · ${iters} iteration${iters === 1 ? '' : 's'} · residual ${formatSizingResidual(lastSizing.residual)}${heatNote}${capNote}${convergeNote}${rightsNote}`;
      }
      return null;
    })();
    if (sizeText) {
      const sizeStatus = document.getElementById('sizeToTargetStatus');
      if (sizeStatus) sizeStatus.textContent = sizeText;
    } else {
      const overview = document.getElementById('sizeToTargetStatus');
      if (overview) overview.textContent = 'Single-product physics tool.';
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
      const meteoDetails = meteoEl.closest?.('details');
      if (meteoDetails) meteoDetails.hidden = !meteoEl.innerHTML;
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
        const summary = assay.summary || assay.kind || '';
        const shown = roundTaggedQuantities(summary);
        const tip = shown === summary ? '' : ` title="${escapeHtml(summary)}"`;
        assayEl.innerHTML = `<strong>Assay</strong> <span${tip}>${escapeHtml(shown)}</span> ${qualityChip(quality)}${citeMarkup(citeFrom(assay.evidence))}`;
      }
      const assayDetails = assayEl.closest?.('details');
      if (assayDetails) assayDetails.hidden = !assayEl.innerHTML;
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
          const kind = right.kind || RIGHT_KINDS?.[key] || '';
          const kindMark = kind ? `<span class="rights-kind">${kind}</span>` : '';
          const label = RIGHT_DISPLAY_LABELS[key] || key;
          const cause = highlightRightKey === key ? ' is-cause' : '';
          return `<span class="rights-item${cause}" data-right="${escapeHtml(key)}"${title}>${escapeHtml(label)}${kindMark}${rightsChip(right.status)}${citeMarkup(cites)}</span>`;
        }).join('');
      }
      const rightsDetails = rightsEl.closest?.('details');
      if (rightsDetails) rightsDetails.hidden = !rightsEl.innerHTML;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function syncNetworkChrome() {
    const form = document.getElementById('addPlantForm');
    const addButton = document.getElementById('addPlantToNetwork');
    const note = document.getElementById('networkActionNote');
    if (note) note.textContent = networkNotice;
    if (form) form.hidden = networkEditor?.type !== 'add';
    if (addButton) addButton.hidden = networkEditor?.type === 'add';
  }

  function plantLead(plant, transferred) {
    const sales = (plant.economics?.sinks || [])
      .filter(sink => sink.disposition === 'sale' && Number(sink.deliveredAmount) > 0 && !transferred.has(`${plant.id}:${sink.id}`))
      .sort((left, right) => (Number(right.annualRevenue) || 0) - (Number(left.annualRevenue) || 0)
        || (Number(right.deliveredAmount) || 0) - (Number(left.deliveredAmount) || 0));
    return sales[0] || null;
  }

  function plantLeadText(lead) {
    if (!lead) return 'No sale products';
    const label = NETWORK_SALE_LABELS[lead.id] || lead.id;
    if (Number(lead.annualRevenue) > 0) return `${label} · ${formatMoney(lead.annualRevenue)}/year`;
    return `${label} · ${formatNumber(lead.deliveredAmount / 1000)} t/year`;
  }

  function plantEditControls(plant) {
    const id = escapeHtml(plant.id);
    if (networkEditor?.type === 'rename' && networkEditor.id === plant.id) {
      return `<form class="network-plant-edit" data-rename-form="${id}"><label>Name <input type="text" name="plantName" value="${escapeHtml(plant.name)}" maxlength="80" autocomplete="off"></label><button type="submit">Save</button><button type="button" data-cancel-rename>Cancel</button></form>`;
    }
    if (networkEditor?.type === 'remove' && networkEditor.id === plant.id) {
      return `<div class="network-plant-edit" role="group" aria-label="Confirm remove"><span>Remove ${escapeHtml(plant.name)}?</span><button type="button" data-confirm-remove="${id}">Remove</button><button type="button" data-cancel-remove>Cancel</button></div>`;
    }
    return `<div class="network-plant-actions"><button type="button" data-open-plant="${id}">Open</button><button type="button" data-rename-plant="${id}">Rename</button><button type="button" data-remove-plant="${id}">Remove</button></div>`;
  }

  function plantCard(plant, transferred) {
    const siteName = plant.definition?.site?.name || 'Unspecified site';
    const lead = plantLead(plant, transferred);
    const landText = plant.footprint ? `${formatHa(plant.footprint.totalHa)} footprint` : '';
    const leadAttr = lead ? ` data-lead="${escapeHtml(lead.id)}"` : '';
    return `<div class="network-plant" data-plant-id="${escapeHtml(plant.id)}"${leadAttr}><div class="network-plant-copy"><strong>${escapeHtml(plant.name)}</strong><small>${escapeHtml(siteName)}${landText ? ` · ${escapeHtml(landText)}` : ''}</small><small>${escapeHtml(plantLeadText(lead))}</small></div>${plantEditControls(plant)}</div>`;
  }

  function renderNetwork() {
    syncNetworkChrome();
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
    const details = body.closest?.('details');
    if (details) {
      details.hidden = empty;
      details.open = !empty;
    }
    if (empty) {
      if (networkEditor && networkEditor.type !== 'add') networkEditor = null;
      status.textContent = 'No plants in this rollup.';
      plants.innerHTML = '';
      metrics.innerHTML = '';
      products.innerHTML = '';
      corridors.innerHTML = '';
      syncNetworkChrome();
      return;
    }
    if (!networkResult) {
      status.textContent = 'Network solve failed.';
      plants.innerHTML = network.plants.map(plant => plantCard(plant, new Set())).join('');
      return;
    }
    const freightQuality = classifyQuality({ kind: 'freight' });
    const landQuality = classifyQuality({ kind: 'land' });
    const moneyQuality = classifyQuality({ kind: 'money' });
    const corridorCount = networkResult.corridors?.length || 0;
    const freightLabel = corridorCount
      ? `freight ${formatUncertainMoney(networkResult.freight, freightQuality)}/year`
      : 'freight not modeled (no corridors)';
    status.textContent = `${networkResult.plants.length} plants · ${formatHa(networkResult.landHa)} site footprint · ${freightLabel}`;
    const transferred = networkResult.transferred || new Set();
    plants.innerHTML = networkResult.plants.map(plant => plantCard(plant, transferred)).join('');
    const showBankable = corridorCount > 0 || economicsAcknowledgment();
    metrics.innerHTML = metricRows([
      ['CAPEX', formatUncertainMoney(networkResult.installedCapex, moneyQuality), { quality: moneyQuality }],
      ['Annualized CAPEX', formatUncertainMoney(networkResult.annualizedCapex, moneyQuality), { quality: moneyQuality }],
      ['NPV', showBankable ? formatUncertainMoney(networkResult.npv, moneyQuality) : 'hidden until NPV/IRR disclosure is open', { quality: moneyQuality }],
      ['Net cash (R − OPEX − ann. CAPEX)', formatUncertainMoney(networkResult.annualNetCash, moneyQuality), { quality: moneyQuality }],
      ['Revenue', formatUncertainMoney(networkResult.annualRevenue, moneyQuality), { quality: moneyQuality }],
      ['Cost', formatUncertainMoney(networkResult.annualOperatingCost, moneyQuality), { quality: moneyQuality }],
      ['Freight', corridorCount ? `${formatUncertainMoney(networkResult.freight, freightQuality)}/year` : 'Not modeled (no corridors)', { quality: corridorCount ? freightQuality : 'assumed', references: FREIGHT_CITES }],
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
      : '<p class="status-meta">No haul corridors — freight is not modeled (not a free logistics win). Add corridors or treat market offtake as an explicit assumption.</p>';
  }

  function renderInspector() {
    const current = node(selectedNodeId);
    inspector.classList.toggle('has-selection', !!current);
    const diagnosisEl = document.getElementById('nodeDiagnosis');
    if (!current) {
      document.getElementById('inspectorTitle').textContent = 'Nothing selected';
      document.getElementById('inspectorKind').textContent = 'Select a block.';
      if (diagnosisEl) { diagnosisEl.hidden = true; diagnosisEl.innerHTML = ''; }
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
    const diagnosis = blockDiagnosis(current);
    if (diagnosisEl) {
      diagnosisEl.hidden = !diagnosis;
      diagnosisEl.innerHTML = diagnosis
        ? `<strong>${escapeHtml(diagnosis.detail || diagnosis.text)}</strong>${diagnosisButton(diagnosis)}`
        : '';
    }
    document.getElementById('nodeControls').innerHTML = controlsFor(current);
    const nodeResult = result?.nodes[current.id];
    const causeRow = nodeResult?.causeText ? [['Cause', nodeResult.causeText]] : [];
    const metrics = nodeResult?.activity !== undefined ? [
      ['Achieved', `${formatNumber(nodeResult.activity)} ${catalog[current.unit]?.activityUnit || ''}`],
      ['Requested', `${formatNumber(setpoints[current.id])} ${catalog[current.unit]?.activityUnit || ''}`],
      ['Limited by', formatLimitedBy(current, nodeResult)],
      ...causeRow,
      ...(nodeResult.inventoryKg != null ? [[
        'Inventory',
        `${formatNumber(nodeResult.inventoryKg)} kg${nodeResult.capacityKg != null ? ` / ${formatNumber(nodeResult.capacityKg)} kg` : ''}${nodeResult.fill != null ? ` (${formatNumber(nodeResult.fill * 100)}%)` : ''}`,
      ]] : []),
    ] : nodeResult?.inventoryKg != null ? [[
      'Inventory',
      `${formatNumber(nodeResult.inventoryKg)} kg${nodeResult.capacityKg != null ? ` / ${formatNumber(nodeResult.capacityKg)} kg` : ''}`,
    ], ...(nodeResult.limitedBy?.length ? [['Limited by', nodeResult.limitedBy.join(', ')]] : []), ...causeRow]
      : nodeResult?.limitedBy?.length ? [['Limited by', nodeResult.limitedBy.join(', ')], ...causeRow] : [...causeRow];
    document.getElementById('inspectorMetrics').innerHTML = metricRows([...metrics, ...economicsRows(current)]);
    document.getElementById('streamList').innerHTML = Object.entries(units[current.unit].ports).map(([port, declaration]) => renderInspectorPort(current, port, declaration)).join('');
    document.getElementById('recipeList').innerHTML = nodeResult?.requestedInputs ? `${recipeGroup('INFLOW', nodeResult.requestedInputs)}${recipeGroup('OUTFLOW', nodeResult.outlets)}` : '<p class="status-meta">Complete the graph to calculate flows.</p>';
    const exchanges = result?.streams.filter(stream => stream.recycle) || [];
    document.getElementById('exchangeList').innerHTML = exchanges.length
      ? exchanges.map(stream => `<div class="recipe-flow"><strong>${stream.label || 'Recovered stream'}</strong><span class="species">${node(stream.from.node).label} → ${node(stream.to.node).label} · ${formatStream(stream.stream)}</span></div>`).join('')
      : '<p class="status-meta">No circular exchanges.</p>';
    const heat = result?.heatIntegration;
    document.getElementById('balanceList').innerHTML = result ? metricRows([
      ...Object.entries(result.balances.elements).map(([element, value]) => [element, `${formatNumber(value)} mol`]),
      ['Electricity', `${formatNumber(result.balances.electricityKWh)} kWh`], ['Heat', `${formatNumber(result.balances.heatKWh)} kWh`],
      ...(heat ? [
        ['Heat covered', `${formatNumber(heat.coveredKWh)} kWh`],
        ['Heat residual demand', `${formatNumber(heat.residualDemandKWh)} kWh`],
        ['Unrecovered waste heat', `${formatNumber(heat.unrecoveredWasteKWh)} kWh`],
        ...(heat.matches || []).map(match => [
          `${match.from} → ${match.to}`,
          `${formatNumber(match.kWh)} kWh @ ${formatNumber(match.T_C)} °C`,
        ]),
      ] : []),
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
    const body = `${sourceNote}${bandLine}${references ? `<p class="literature-links">Basis: ${references}</p>` : ''}`;
    return body ? `<details class="more-section"><summary>Literature</summary>${body}</details>` : '';
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
      const parameters = (definition.controls || []).map(control => parameterControl(control, current, 'processParameter', intensityQuality)).join('');
      const headNote = current.unit === 'intake-pump' ? pumpHeadNote(current) : current.unit === 'gas-blower' ? blowerPressureNote(current) : '';
      const hasAssumptions = route || preset || parameters || definition.sourceNote || (definition.references && definition.references.length);
      return `<fieldset><legend>Independent setpoint</legend><label>Requested rate <output>${formatNumber(setpoints[current.id])} ${definition.activityUnit}</output></label><input name="requestedRate" type="range" min="0" max="${current.capacity}" step="1" value="${setpoints[current.id]}"></fieldset>${hasAssumptions ? `<fieldset><legend>Process assumptions</legend>${route}${preset}${parameters}${headNote}${definition.chemicalId ? `<p class="status-meta">Makeup chemical: ${CONSUMABLE_CHEMICALS[definition.chemicalId] || definition.chemicalId}. Switching routes does not rewrite an existing supply.</p>` : ''}${literatureMarkup(definition, current.unit)}</fieldset>` : ''}${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete block</button>`;
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
      const resourceEvidence = site?.resources?.[current.siteResource]?.evidence;
      const capNote = budget != null ? `<p class="status-meta"${resourceEvidence ? ` title="${escapeHtml(resourceEvidence)}"` : ''}>${escapeHtml(roundTaggedQuantities(resourceEvidence || 'Capped by the named site resource. A second block sharing this resource cannot duplicate it.'))}</p>` : (site && !current.siteResource ? '<p class="status-meta">Unassigned sources are unverified. They do not become unlimited supply.</p>' : '');
      const sourceLegend = current.unit === 'material-source' && intakeKind(current)?.key !== 'unknown'
        ? 'Intake settings'
        : current.unit === 'material-source'
          ? 'Intake settings'
          : 'Source settings';
      return `<fieldset><legend>${sourceLegend}</legend>${siteResource}${preset}${chemical}${processPreset}${rate}${temperature}${parameters}${capNote}${definition.economicsNote ? `<p class="status-meta">${definition.economicsNote}</p>` : ''}${literatureMarkup(definition, current.unit)}</fieldset>${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete source</button>`;
    }
    if (kind === 'buffer') {
      if (!current.params?.densityOverride && !current.params?.intensityOverride) {
        const nextFluid = inferBufferFluidClass(current);
        const live = liveFluidDensity(nextFluid);
        const econ = current.economics || {};
        const densityDrift = live && Math.abs(Number(econ.densityKgM3) - live.densityKgM3) > 0.5;
        if (econ.fluidClass !== nextFluid || densityDrift || (live && econ.densitySource !== live.source && econ.densitySource !== 'override')) {
          refreshBufferEconomics(current);
        }
      }
      const definition = catalog[current.unit];
      const parameters = (definition.controls || []).map(control => (
        `<label>${control.label} <output>${formatNumber(current.params[control.key] ?? 0)}${control.unit ? ` ${control.unit}` : ''}</output></label><input name="bufferParameter" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current.params[control.key] ?? 0}">`
      )).join('');
      const nodeResult = result?.nodes[current.id];
      const socLine = nodeResult?.inventoryKg != null
        ? `<p class="status-meta">Inventory ${formatNumber(nodeResult.inventoryKg)} kg${nodeResult.capacityKg != null ? ` / ${formatNumber(nodeResult.capacityKg)} kg` : ''}${nodeResult.fill != null ? ` (${formatNumber(nodeResult.fill * 100)}% full)` : ''}</p>`
        : '<p class="status-meta">Inventory updates after solve. Horizon carries SOC hour to hour.</p>';
      return `<fieldset><legend>Buffer tank</legend><label>Discharge setpoint <output>${formatNumber(setpoints[current.id] ?? 0)} ${definition.activityUnit}</output></label><input name="requestedRate" type="range" min="0" max="${Math.max(current.capacity || 0, definition.capacity || 0, setpoints[current.id] || 0, 1)}" step="1" value="${setpoints[current.id] ?? 0}">${(() => { const tea = teaApi(); const fluids = tea?.tankByFluid ? Object.values(tea.tankByFluid) : [{ id: 'generic', label: 'Generic liquid', capexPerM3: 500 }]; const currentFluid = inferBufferFluidClass(current); return `<label>Fluid class<select name="bufferParameter" data-param="fluidClass">${fluids.map(f => `<option value="${f.id}"${f.id === currentFluid ? ' selected' : ''}>${escapeHtml(f.label)} ($${formatNumber(f.capexPerM3)}/m³)</option>`).join('')}</select></label>`; })()}${parameters}${socLine}${literatureMarkup(definition, current.unit)}</fieldset>${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete buffer</button>`;
    }
    if (kind === 'sink' && current.unit === 'material-sink') {
      const definition = catalog[current.unit] || {};
      const acceptRaw = current.params?.acceptKg;
      const acceptValue = acceptRaw == null || acceptRaw === '' ? '' : acceptRaw;
      const periodDays = Number(currentEconomics?.periodDays) > 0
        ? Number(currentEconomics.periodDays)
        : (Number(projectEconomics.periodDays) > 0 ? Number(projectEconomics.periodDays) : 365);
      const demandAnnual = Number(current.economics?.annualDemandLimit);
      const demandEligible = current.economics?.disposition === 'sale'
        && Number.isFinite(demandAnnual) && demandAnnual >= 0;
      const demandDaily = demandEligible ? demandAnnual / periodDays : null;
      const demandBacked = acceptValue === '' && demandDaily != null;
      const acceptOut = acceptValue !== ''
        ? `${formatNumber(acceptValue)} kg/day`
        : demandBacked
          ? `${formatNumber(demandDaily)} kg/day (demand)`
          : 'Unlimited';
      const nodeResult = result?.nodes[current.id];
      const capNote = nodeResult?.acceptKg != null
        ? ` / ${formatNumber(nodeResult.acceptKg)} kg cap${nodeResult.acceptSource === 'demand' ? ' · demand-backed' : nodeResult.acceptSource === 'manual' ? ' · manual' : ''}`
        : '';
      const receivedLine = nodeResult?.received
        ? `<p class="status-meta">Received ${formatStream(nodeResult.received)}${capNote}</p>`
        : '';
      const demandLine = demandBacked
        ? `<p class="status-meta">Demand-backed offtake ${formatNumber(demandDaily)} kg/day from annualDemandLimit ${formatNumber(demandAnnual)} kg/y ÷ ${formatNumber(periodDays)} days. Clear Destination demand or type a manual override.</p>`
        : '';
      const placeholder = demandDaily != null ? 'Demand-backed' : 'Unlimited';
      const title = demandDaily != null
        ? 'Max kg accepted this solve day. Blank = TEA annualDemandLimit ÷ operating days. Type a value to override.'
        : 'Max kg accepted this solve day. Blank = unlimited (no annualDemandLimit on this sink).';
      const acceptControl = `<label>Export / offtake limit <output>${acceptOut}</output></label><input name="sinkParameter" data-param="acceptKg" type="number" min="0" step="any" placeholder="${placeholder}" value="${escapeHtml(acceptValue)}" title="${escapeHtml(title)}">`;
      return `<fieldset><legend>Offtake</legend>${acceptControl}${receivedLine}${demandLine}<p class="status-meta">${definition.sourceNote || ''}</p></fieldset>${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete sink</button>`;
    }
    if (kind === 'sink' && (current.unit === 'heat-sink' || current.unit === 'electricity-sink')) {
      const definition = catalog[current.unit] || {};
      const acceptRaw = current.params?.acceptKWh;
      const acceptValue = acceptRaw == null || acceptRaw === '' ? '' : acceptRaw;
      const isPower = current.unit === 'electricity-sink';
      const acceptOut = acceptValue !== '' ? `${formatNumber(acceptValue)} kWh/day` : 'Unlimited';
      const nodeResult = result?.nodes[current.id];
      const capNote = nodeResult?.acceptKWh != null
        ? ` / ${formatNumber(nodeResult.acceptKWh)} kWh cap${nodeResult.acceptSource === 'manual' ? ' · manual' : ''}`
        : '';
      const receivedLine = nodeResult?.received
        ? `<p class="status-meta">Received ${formatStream(nodeResult.received)}${capNote}</p>`
        : '';
      const label = isPower ? 'Export / curtailment limit' : 'Export / reject limit';
      const title = isPower
        ? 'Max kWh accepted this solve day (grid export or curtailment). Blank = unlimited.'
        : 'Max heat kWh rejected this solve day. Blank = unlimited.';
      const acceptControl = `<label>${label} <output>${acceptOut}</output></label><input name="sinkParameter" data-param="acceptKWh" type="number" min="0" step="any" placeholder="Unlimited" value="${escapeHtml(acceptValue)}" title="${escapeHtml(title)}">`;
      const legend = isPower ? 'Export / curtailment' : 'Heat reject';
      return `<fieldset><legend>${legend}</legend>${acceptControl}${receivedLine}<p class="status-meta">${definition.sourceNote || ''}</p></fieldset>${economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete sink</button>`;
    }
    return `${kind === 'sink' ? economicsControlsFor(current) : ''}<button class="delete-node" id="deleteNode" type="button">Delete ${kind === 'sink' ? 'sink' : 'junction'}</button>`;
  }


  function parameterControl(control, current, name, intensityQuality) {
    const raw = current.params?.[control.key];
    const missing = raw == null || raw === '';
    const unit = control.unit ? ` ${control.unit}` : '';
    const energy = /kWh|secKWh/i.test(`${control.key} ${control.unit || ''}`);
    const chip = energy && intensityQuality ? qualityChip(intensityQuality) : '';
    if (control.optional) {
      const shown = missing ? '—' : formatNumber(raw);
      const value = missing ? '' : raw;
      return `<label>${control.label} <output>${shown}${missing ? '' : unit}</output>${chip}</label><input name="${name}" data-param="${control.key}" type="number" min="${control.min}" max="${control.max}" step="${control.step}" placeholder="unset" value="${value}">`;
    }
    return `<label>${control.label} <output>${formatNumber(raw)}${unit}</output>${chip}</label><input name="${name}" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${raw}">`;
  }

  function partLoadClampNote(params) {
    const k = Number(params?.partLoadK);
    if (!Number.isFinite(k) || k <= 3) return '';
    return ' Shape was clamped to 3 because the screening fit is monotone only for k≤3.';
  }

  function partLoadPhrase(params, withHead) {
    const raw = params?.partLoadK;
    const clamp = partLoadClampNote(params);
    if (raw == null || raw === '') {
      return withHead ? '' : ' Part-load shape unset — no Q/Qrated multiplier.';
    }
    if (withHead) {
      return ` Part-load k ${formatNumber(raw)} multiplies SEC by (1 + k(1−Q/Qrated)²) at the delivered flow, including a short bus.${clamp}`;
    }
    return ` Part-load k ${formatNumber(raw)} is on: SEC × (1 + k(1−Q/Qrated)²) at the delivered flow, including when the bus is short.${clamp}`;
  }

  function pumpHeadNote(current) {
    const params = current.params || {};
    if (params.pumpSecOverride === true && params.headM != null && params.headM !== '') {
      return '<p class="status-meta">Pump energy slider overrides head. Set head or efficiency again to use ρ·g·H / (η·3.6e6).</p>';
    }
    if (params.headM == null || params.headM === '') {
      return `<p class="status-meta">Head unset — SEC stays on the kWh/m³ slider. Set head for screening hydraulics (η defaults to 0.7).${partLoadPhrase(params, false)}</p>`;
    }
    try {
      const resolved = globalThis.FlowsheetUnits?.resolveLiquidPumpSec?.(params, Number(params.densityKgM3) || 1025);
      if (!resolved) return '';
      return `<p class="status-meta">Head ${formatNumber(resolved.headM)} m → ${formatNumber(resolved.sec)} kWh/m³ at η ${formatNumber(resolved.pumpEta)} (screening, not a vendor curve).${partLoadPhrase(params, true)}</p>`;
    } catch (error) {
      return `<p class="status-meta">${escapeHtml(error.message || 'Invalid pump head')}</p>`;
    }
  }

  function blowerPressureNote(current) {
    const params = current.params || {};
    if (params.blowerSecOverride === true && params.deltaP_kPa != null && params.deltaP_kPa !== '') {
      return '<p class="status-meta">Blower energy slider overrides ΔP. Set pressure or efficiency again to use ΔP_kPa / (η·3600).</p>';
    }
    if (params.deltaP_kPa == null || params.deltaP_kPa === '') {
      return `<p class="status-meta">ΔP unset — SEC stays on the kWh/Nm³ slider (default 0.001). Set pressure rise for screening fan work (η defaults to 0.7).${partLoadPhrase(params, false)}</p>`;
    }
    try {
      const resolved = globalThis.FlowsheetUnits?.resolveGasBlowerSec?.(params);
      if (!resolved) return '';
      return `<p class="status-meta">ΔP ${formatNumber(resolved.deltaP_kPa)} kPa → ${formatNumber(resolved.sec)} kWh/Nm³ at η ${formatNumber(resolved.blowerEta)} (screening, not a fan curve).${partLoadPhrase(params, true)}</p>`;
    } catch (error) {
      return `<p class="status-meta">${escapeHtml(error.message || 'Invalid blower ΔP')}</p>`;
    }
  }

  function teaApi() {
    return globalThis.TeaScreening || null;
  }

  function siteRegionForTea() {
    return site?.region || site?.demandRegion || site?.demandRegionId || null;
  }

  function positiveDensityPerL(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function densityFromAssayBag(bag) {
    if (!bag || typeof bag !== 'object') return null;
    const direct = positiveDensityPerL(bag.density_kg_per_L);
    if (direct) return { densityKgM3: direct * 1000, source: 'site assay' };
    const id = bag.assayId;
    const full = id && globalThis.SiteAssays?.getAssay?.(id);
    const fromLib = positiveDensityPerL(full?.density_kg_per_L);
    if (fromLib) return { densityKgM3: fromLib * 1000, source: 'site assay' };
    const hint = teaApi()?.densityHintFromAssay?.(bag);
    if (hint?.densityKgM3) return { densityKgM3: hint.densityKgM3, source: hint.source };
    if (hint?.outOfRange) return { densityKgM3: null, source: hint.source, rejectEstimate: true };
    const fromFull = full && full !== bag ? teaApi()?.densityHintFromAssay?.(full) : null;
    if (fromFull?.densityKgM3) return { densityKgM3: fromFull.densityKgM3, source: fromFull.source };
    if (fromFull?.outOfRange) return { densityKgM3: null, source: fromFull.source, rejectEstimate: true };
    return null;
  }

  function liveFluidDensity(fluidClass) {
    if (fluidClass !== 'brine' && fluidClass !== 'seawater') return null;
    const bags = [];
    if (fluidClass === 'brine') {
      if (site?.brineAssay) bags.push(site.brineAssay);
      if (site?.assay?.kind === 'brine') bags.push(site.assay);
    } else if (site?.assay && (site.assay.kind === 'seawater' || site.assay.kind == null)) {
      bags.push(site.assay);
    }
    let rejected = null;
    for (const bag of bags) {
      const found = densityFromAssayBag(bag);
      if (found?.densityKgM3) return found;
      if (found?.rejectEstimate) rejected = found;
    }
    return rejected;
  }

  function inferBufferFluidClass(current) {
    const explicitRaw = current?.params?.fluidClass;
    const tea = teaApi();
    const explicit = tea?.resolveTankFluidClass
      ? tea.resolveTankFluidClass(explicitRaw)
      : (explicitRaw ? String(explicitRaw) : null);
    // 'generic' means unset — still allow upstream intake inference.
    if (explicit && explicit !== 'generic') return explicit;
    // Walk one or two hops upstream for a practical intake identity.
    const seen = new Set();
    const queue = [current?.id];
    while (queue.length) {
      const id = queue.shift();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      for (const edge of graph.edges) {
        if (edge.to?.node !== id) continue;
        const upstream = node(edge.from.node);
        if (!upstream) continue;
        if (upstream.unit === 'material-source') {
          const intake = intakeKind(upstream);
          const key = intake?.key;
          if (key === 'brine') return 'brine';
          if (key === 'seawater') return 'seawater';
          if (key === 'water' || key === 'freshwater') return 'freshwater';
        }
        if (upstream.unit === 'intake-pump' || upstream.unit === 'material-buffer' || upstream.unit === 'material-splitter' || upstream.unit === 'material-mixer') {
          queue.push(upstream.id);
        }
      }
    }
    return 'generic';
  }

  function refreshBufferEconomics(current) {
    if (!current || current.unit !== 'material-buffer') return;
    current.params ||= {};
    const tea = teaApi();
    const fluidClass = inferBufferFluidClass(current);
    current.params.fluidClass = fluidClass;
    const kg = Number(current.params.capacityKg ?? current.capacity) || 0;
    if (tea?.bindTankCapex) {
      const density = Number(current.params.densityKgM3);
      const capexPerM3 = Number(current.params.capexPerM3);
      const densityOverride = current.params.densityOverride === true && Number.isFinite(density) && density > 0;
      const intensityOverride = current.params.intensityOverride === true && Number.isFinite(capexPerM3) && capexPerM3 >= 0;
      const live = densityOverride ? null : liveFluidDensity(fluidClass);
      const bound = tea.bindTankCapex({
        fluidClass,
        capacityKg: kg,
        densityKgM3: densityOverride ? density : (live?.densityKgM3 || undefined),
        capexPerM3: intensityOverride ? capexPerM3 : undefined,
        region: siteRegionForTea(),
      });
      // Mirror pre-region intensity into params for the inspector slider.
      current.params.densityKgM3 = bound.densityKgM3;
      current.params.capexPerM3 = bound.capexPerM3 / (bound.regionMultiplier || 1);
      current.params.capexPerKg = bound.capexPerKg;
      current.economics = {
        ...(current.economics || {}),
        installedCapex: bound.installedCapex,
        fixedOMPercent: bound.fixedOMPercent,
        variableOM: bound.variableOM,
        assetLifeYears: bound.assetLifeYears,
        capexPerM3: bound.capexPerM3,
        fluidClass: bound.fluidClass,
        fluidLabel: bound.fluidLabel,
        intensityUnit: bound.intensityUnit,
        quality: bound.quality,
        source: bound.source,
        note: bound.note,
        evidence: bound.evidence,
        regionMultiplier: bound.regionMultiplier,
        densityKgM3: bound.densityKgM3,
        densitySource: densityOverride ? 'override' : (live?.densityKgM3 ? live.source : (live?.source || 'fluid default')),
      };
      return;
    }
    // Fallback without TeaScreening: MECH17 $0.50/kg.
    const rate = Number(current.params.capexPerKg) || 0.5;
    current.economics = {
      installedCapex: kg * rate,
      fixedOMPercent: 2,
      variableOM: 0,
      assetLifeYears: 25,
    };
  }

  function refreshLiftEconomics(current) {
    const tea = teaApi();
    if (!tea?.bindCapexPack) return;
    if (current.unit === 'intake-pump') {
      current.economics = {
        ...tea.bindCapexPack('intake-pump', { capacity: current.capacity, region: siteRegionForTea() }),
        ...(current.economics?.installedCapex != null && current.economics?.capexRate == null
          ? { installedCapex: current.economics.installedCapex }
          : {}),
      };
    } else if (current.unit === 'gas-blower') {
      current.economics = {
        ...tea.bindCapexPack('gas-blower', { capacity: current.capacity, region: siteRegionForTea() }),
        ...(current.economics?.installedCapex != null && current.economics?.capexRate == null
          ? { installedCapex: current.economics.installedCapex }
          : {}),
      };
    }
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
    if (current.unit === 'intake-pump' || current.unit === 'gas-blower') {
      const tea = teaApi();
      if (tea?.bindCapexPack) {
        return tea.bindCapexPack(current.unit, { capacity: current.capacity || 0, region: siteRegionForTea() });
      }
      return { installedCapex: 0, fixedOMPercent: 3, assetLifeYears: 20 };
    }
    if (current.unit === 'mg-si' || current.unit === 'polysilicon' || current.unit === 'bayer-alumina' || current.unit === 'aluminium-smelter' || current.unit === 'pv-module' || current.unit === 'iac-leach' || current.unit === 'ree-chromatography' || current.unit === 'bioforge') {
      const tea = teaApi();
      if (tea?.bindCapexPack) {
        return tea.bindCapexPack(current.unit, { capacity: current.capacity || 0, region: siteRegionForTea() });
      }
    }
    if (kind === 'converter') return {
      installedCapex: ['battery', 'thermal-storage'].includes(current.unit) ? current.capacity * current.params.capexPerKWh : 0,
      fixedOMPercent: 3,
      variableOM: 0,
      assetLifeYears: 20,
    };
    if (kind === 'buffer') {
      refreshBufferEconomics(current);
      return current.economics || { installedCapex: 0, fixedOMPercent: 2, assetLifeYears: 25 };
    }
    if (kind === 'sink') return { disposition: 'vent', unitPrice: 0, disposalCost: 0, annualDemandLimit: (globalThis.TeaScreening && globalThis.TeaScreening.EDITOR_DEMAND_DEFAULT) || 1e6 };
    return {};
  }

  function economicsControlsFor(current) {
    const kind = units[current.unit].kind;
    const economics = current.economics || (current.economics = defaultEconomics(current));
    const field = (key, label, step = '0.01') => {
      const raw = economics[key] ?? 0;
      const capexLike = /capex|fixedOM/i.test(key);
      const shown = capexLike ? displayInputNumber(raw) : raw;
      const title = capexLike ? ` title="${escapeHtml(raw)}"` : '';
      return `<label>${label}<input name="economics" data-economics="${key}" type="number" min="0" step="${step}" value="${shown}"${title}></label>`;
    };
    if (kind === 'source') return `<fieldset><legend>Economics</legend>${economics.unitCost != null ? field('unitCost', 'Delivered input cost') : `${field('installedCapex', 'Installed CAPEX', '100')}${field('fixedOM', 'Fixed O&M / year', '100')}${field('variableOM', 'Variable cost / output unit')}`}<p class="status-meta">Native unit is kg, kWh, or consumable unit. Zero values explore the physical limit.</p></fieldset>`;
    if (kind === 'converter' || kind === 'buffer') {
      const capexField = economics.capexRate != null && economics.installedCapex == null
        ? field('capexRate', 'CAPEX rate / capacity unit', '1')
        : field('installedCapex', 'Installed CAPEX', '100');
      const variable = kind === 'buffer'
        ? ''
        : field('variableOM', 'Variable O&M / activity unit');
      const densityNote = kind === 'buffer' && economics.densityKgM3
        ? ` · density ${formatNumber(economics.densityKgM3)} kg/m³${economics.densitySource ? ` (${escapeHtml(economics.densitySource)})` : ''}`
        : '';
      const liftNote = current.unit === 'intake-pump'
        ? 'Screening lift CAPEX = duty capacity × tea pack intensity × regional CAPEX×. Capacity changes refresh CAPEX. Head and part-load, when set, set electricity — not CAPEX. Part-load uses the delivered flow, so a short bus starves on the shaped SEC. k unset leaves SEC unchanged.'
        : current.unit === 'gas-blower'
          ? 'Screening lift CAPEX = duty capacity × tea pack intensity × regional CAPEX×. Capacity changes refresh CAPEX. ΔP, when set, sets electricity — not CAPEX. ΔP unset keeps the kWh/Nm³ slider.'
          : '';
      return `<fieldset><legend>Economics</legend>${capexField}${field('fixedOMPercent', 'Fixed O&M (% CAPEX)')}${variable}${field('assetLifeYears', 'Asset life (years)', '1')}${kind === 'buffer' ? `<p class="status-meta">Tank CAPEX = (kg ÷ density) × $/m³${economics.fluidLabel ? ` · fluid: <strong>${escapeHtml(economics.fluidLabel)}</strong>` : ''}${economics.capexPerM3 != null ? ` · intensity $${formatNumber(economics.capexPerM3)}/m³` : ''}${densityNote}${economics.regionMultiplier != null && economics.regionMultiplier !== 1 ? ` · region ×${formatNumber(economics.regionMultiplier)}` : ''}. Fluid class follows the upstream intake when unset. No assay density → UNESCO salinity (0–42 g/kg), a TDS mg/L proxy (1 L ≈ 1 kg, then S = mg/L ÷ ρ), or the labeled fluid-class density.</p>` : liftNote ? `<p class="status-meta">${liftNote}</p>` : ''}</fieldset>`;
    }
    return `<fieldset><legend>Destination economics</legend><label>Disposition<select name="economics" data-economics="disposition">${['sale', 'disposal', 'vent', 'reinjection'].map(value => `<option value="${value}"${economics.disposition === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label>${field('unitPrice', 'Sale price / unit')}${field('annualDemandLimit', 'Annual demand limit', '1')}${field('disposalCost', 'Disposal cost / unit')}</fieldset>`;
  }

  function economicsAcknowledgment() {
    if (!storage) return false;
    try { return storage.getItem('flowsheet-economics-ack') === '1'; } catch { return false; }
  }

  function setEconomicsAcknowledgment(value) {
    if (!storage) return;
    try { storage.setItem('flowsheet-economics-ack', value ? '1' : '0'); } catch { /* ignore */ }
  }

  function economicsGateReasons() {
    const reasons = [];
    const rights = unverifiedRightsWarnings?.(site) || [];
    if (rights.length) reasons.push('site rights unverified');
    if (network.plants.length && !(network.corridors || []).length) {
      reasons.push('no haul corridors / market freight');
    }
    return reasons;
  }

  function soldPowerBreakevenMaterials() {
    const materials = globalThis.MaterialPowerBreakeven?.MATERIALS || [];
    const sold = new Set(
      (currentEconomics?.sinks || [])
        .filter(sink => sink && sink.disposition === 'sale' && Number(sink.deliveredAmount) > 0)
        .map(sink => sink.id)
    );
    return materials.filter(item => (item.sinks || []).some(id => sold.has(id)));
  }

  function unsupportedSoldLabels() {
    const supported = new Set(
      (globalThis.MaterialPowerBreakeven?.MATERIALS || []).flatMap(item => item.sinks || [])
    );
    return (currentEconomics?.sinks || [])
      .filter(sink => sink && sink.disposition === 'sale' && Number(sink.deliveredAmount) > 0 && !supported.has(sink.id))
      .map(sink => NETWORK_SALE_LABELS[sink.id] || NODE_DISPLAY_LABELS[sink.id] || sink.id);
  }

  function populatePowerBreakevenMaterials() {
    const select = document.getElementById('powerBreakevenMaterial');
    if (!select) return;
    const shared = (document.getElementById('powerBreakevenMode')?.value || 'solo') === 'shared';
    const materials = soldPowerBreakevenMaterials();
    const current = select.value;
    if (!materials.length) {
      const unsupported = unsupportedSoldLabels();
      select.innerHTML = unsupported.length
        ? `<option value="">No product supported by the screening price table (${escapeHtml(unsupported.join(', '))})</option>`
        : '<option value="">No products sold</option>';
      select.value = '';
      select.disabled = true;
      return;
    }
    select.innerHTML = materials.map(item => `<option value="${item.id}">${item.id}</option>`).join('');
    select.value = materials.some(item => item.id === current) ? current : materials[0].id;
    select.disabled = shared;
  }

  const SCREENING_PACK_BY_UNIT = {
    'brine-minerals': 'minerals',
    'chlor-alkali': 'chlor-alkali',
    'bromine-recovery': 'bromine-recovery',
    asu: 'asu',
    ammonia: 'ammonia',
    swro: 'swro',
    electrolyzer: 'electrolyzer',
    dac: 'dac',
    'dac-solid': 'dac',
    'dac-liquid': 'dac',
    'dac-electroswing': 'dac',
    sabatier: 'sabatier',
    methanol: 'methanol',
    'solar-pv': 'solar-pv',
    'mg-si': 'mg-si',
    polysilicon: 'polysilicon',
    'bayer-alumina': 'bayer-alumina',
    'aluminium-smelter': 'aluminium-smelter',
    'pv-module': 'pv-module',
    'iac-leach': 'iac-leach',
    'ree-chromatography': 'ree-chromatography',
    bioforge: 'bioforge',
  };

  function screeningPackFor(node) {
    const packs = globalThis.TeaScreening?.packs;
    if (!packs || !node) return null;
    const byUnit = SCREENING_PACK_BY_UNIT[node.unit];
    if (byUnit && packs[byUnit]) return packs[byUnit];
    const source = String(node.economics?.source || '');
    if (/solar|PV|ATB/i.test(source) && packs['solar-pv']) return packs['solar-pv'];
    return null;
  }

  function formatIntensity(value, unit) {
    const n = formatNumber(value);
    const raw = String(unit || '');
    if (!raw) return `$${n}`;
    if (raw.startsWith('$')) return `$${n}${raw.slice(1)}`;
    return `$${n} ${raw}`;
  }

  function isSolarCapexNode(node) {
    if (!node) return false;
    if (node.unit === 'solar-pv' && Number.isFinite(Number(node.params?.capexPerKW))) return true;
    return Number.isFinite(Number(node.economics?.capexIntensity)) && /solar|PV|ATB/i.test(String(node.economics?.source || ''));
  }

  function powerPriceReadout() {
    const grid = graph.nodes.find(node => node.unit === 'grid-electricity' && Number.isFinite(Number(node.params?.pricePerMWh)));
    if (grid) {
      return { label: 'Grid tariff', value: `$${formatNumber(grid.params.pricePerMWh)}/MWh`, note: 'Block param · not a PPA', nodeId: grid.id };
    }
    const priced = graph.nodes.find(node => (
      node.unit === 'electricity-source' || node.unit === 'grid-electricity' || node.id === 'power' || node.siteResource === 'electricity'
    ) && Number.isFinite(Number(node.economics?.unitCost)));
    if (priced) {
      return { label: 'Power cost', value: `$${formatNumber(priced.economics.unitCost)}/kWh`, note: 'On the power block · screening · not a PPA', nodeId: priced.id };
    }
    const solar = graph.nodes.find(isSolarCapexNode);
    if (solar) {
      const intensity = Number(solar.economics?.capexIntensity);
      if (Number.isFinite(intensity)) {
        const pack = screeningPackFor(solar) || globalThis.TeaScreening?.packs?.['solar-pv'];
        return { label: 'PV CAPEX', value: formatIntensity(intensity, pack?.intensityUnit || '$/kWp'), note: 'On the power block · screening', nodeId: solar.id };
      }
      return { label: 'PV CAPEX', value: `$${formatNumber(solar.params.capexPerKW)}/kW`, note: 'Block param · screening', nodeId: solar.id };
    }
    const table = globalThis.TeaScreening?.costs?.power;
    if (table && Number.isFinite(Number(table.value))) {
      return {
        label: 'Power band',
        value: formatIntensity(table.value, table.unit || '$/kWh'),
        note: 'Screening table · not on this plant · not a PPA',
        nodeId: null,
      };
    }
    return { label: 'Power price', value: 'Not set', note: 'No purchased-power price on this plant', nodeId: null };
  }

  function capexIntensityReadout(skipId) {
    const usable = node => node && node.id !== skipId;
    const nodes = graph.nodes.filter(node => usable(node) && Number.isFinite(Number(node.economics?.capexIntensity)));
    const node = nodes.find(item => item.economics?.capexIntensityBand)
      || nodes.find(item => item.unit === 'brine-minerals')
      || nodes.find(item => !isSolarCapexNode(item))
      || nodes[0]
      || graph.nodes.find(item => usable(item) && item.unit === 'solar-pv' && Number.isFinite(Number(item.params?.capexPerKW)))
      || graph.nodes.find(item => usable(item) && Number(item.economics?.capexRate) > 0)
      || null;
    if (!node) return { label: 'CAPEX intensity', value: 'Not set', note: 'No intensity on this plant' };
    if (node.unit === 'solar-pv' && !Number.isFinite(Number(node.economics?.capexIntensity)) && Number.isFinite(Number(node.params?.capexPerKW))) {
      return { label: 'PV CAPEX', value: `$${formatNumber(node.params.capexPerKW)}/kW`, note: 'Block param · screening' };
    }
    const intensity = Number(node.economics?.capexIntensity ?? node.economics?.capexRate);
    const pack = screeningPackFor(node);
    const band = node.economics?.capexIntensityBand;
    const solar = isSolarCapexNode(node);
    const label = band || node.unit === 'brine-minerals' ? 'Minerals CAPEX' : solar ? 'PV CAPEX' : 'CAPEX intensity';
    const note = band
      ? `Screening band $${formatNumber(band.low)}–$${formatNumber(band.high)} · not bankable`
      : `On ${node.id} · screening`;
    return { label, value: formatIntensity(intensity, pack?.intensityUnit), note };
  }

  function paintAssumptionReadouts() {
    const host = document.getElementById('economicsAssumptions');
    if (!host) return;
    const power = powerPriceReadout();
    const capex = capexIntensityReadout(power.nodeId);
    host.innerHTML = [power, capex].map(row => (
      `<div class="tea-read"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong><small>${escapeHtml(row.note)}</small></div>`
    )).join('');
  }

  function paintCashGate(econ, moneyQuality) {
    const gateEl = document.getElementById('economicsGate');
    const valueEl = document.getElementById('economicsGateValue');
    const noteEl = document.getElementById('economicsGateNote');
    gateEl?.classList.remove('is-positive', 'is-negative');
    if (!econ) {
      if (valueEl) valueEl.textContent = '—';
      if (noteEl) noteEl.textContent = '';
      return;
    }
    const net = Number(econ.annualNetCash);
    if (valueEl) valueEl.textContent = formatUncertainMoney(net, moneyQuality);
    if (noteEl) {
      noteEl.textContent = net > 0
        ? 'Above the cash gate · screening'
        : net < 0
          ? 'Below the cash gate · screening'
          : 'At the cash gate · screening';
    }
    if (net > 0) gateEl?.classList.add('is-positive');
    else if (net < 0) gateEl?.classList.add('is-negative');
  }

  function teaChartEmpty(message) {
    return `<p class="tea-chart-empty">${escapeHtml(message)}</p>`;
  }

  function attrNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : '0';
  }

  function px(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '0';
  }

  function niceStep(span, target) {
    const rough = span / Math.max(1, target);
    if (!(rough > 0) || !Number.isFinite(rough)) return 1;
    const mag = 10 ** Math.floor(Math.log10(rough));
    if (!Number.isFinite(mag) || mag === 0) return 1;
    const residual = rough / mag;
    const nice = residual <= 1.5 ? 1 : residual <= 3.5 ? 2 : residual <= 7.5 ? 5 : 10;
    return nice * mag;
  }

  function roundTo(value, step) {
    if (!(step > 0) || !Number.isFinite(value)) return value;
    const digits = Math.max(0, Math.min(8, Math.ceil(-Math.log10(step)) + 1));
    return Number((Math.round(value / step) * step).toFixed(digits));
  }

  function axisFromValues(values, target = 4) {
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return { min: 0, max: 0, ticks: [0], flat: true };
    let lo = Math.min(0, ...finite);
    let hi = Math.max(0, ...finite);
    if (hi - lo < 1e-9) return { min: 0, max: 0, ticks: [0], flat: true };
    const pad = (hi - lo) * 0.08;
    if (lo < 0) lo -= pad;
    if (hi > 0) hi += pad;
    let step = niceStep(hi - lo, target);
    let min = Math.floor(lo / step + 1e-12) * step;
    let max = Math.ceil(hi / step - 1e-12) * step;
    let count = Math.round((max - min) / step);
    if (count > 8) {
      step *= 2;
      min = Math.floor(lo / step + 1e-12) * step;
      max = Math.ceil(hi / step - 1e-12) * step;
      count = Math.round((max - min) / step);
    }
    const ticks = [];
    for (let i = 0; i <= count && i < 10; i += 1) ticks.push(roundTo(min + i * step, step));
    return { min: ticks[0], max: ticks[ticks.length - 1], ticks, step, flat: false };
  }

  function trimFixed(value, digits) {
    return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function axisMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '$0';
    const sign = n < 0 ? '−' : '';
    const abs = Math.abs(n);
    const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
    for (const [scale, suffix] of units) {
      if (abs >= scale) {
        const scaled = abs / scale;
        const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
        return `${sign}$${trimFixed(scaled, digits)}${suffix}`;
      }
    }
    const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return `${sign}$${trimFixed(abs, digits)}`;
  }

  function formatKwh(price) {
    if (!Number.isFinite(price) || Math.abs(price) < 5e-5) return '$0';
    const digits = Math.abs(price) >= 1 ? 2 : 3;
    return `${price < 0 ? '−' : ''}$${Math.abs(price).toFixed(digits)}`;
  }

  function formatKwhTick(price, step) {
    if (!Number.isFinite(price) || Math.abs(price) < 5e-5) return '$0';
    const digits = step < 0.1 && Math.abs(price) < 1 ? 3 : 2;
    const body = Math.abs(price).toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return `${price < 0 ? '−' : ''}$${body}`;
  }

  function yMapper(scale, plotTop, plotH) {
    if (scale.flat || !(scale.max > scale.min)) {
      const y = plotTop + plotH / 2;
      return () => y;
    }
    const span = scale.max - scale.min;
    return value => plotTop + (scale.max - value) / span * plotH;
  }

  function waterfallSteps(econ) {
    const revenue = Number(econ.annualRevenue) || 0;
    const opex = Math.abs(Number(econ.annualOperatingCost) || 0);
    const capex = Math.abs(Number(econ.annualizedCapex) || 0);
    const net = Number.isFinite(Number(econ.annualNetCash)) ? Number(econ.annualNetCash) : revenue - opex - capex;
    return [
      { key: 'revenue', label: 'Revenue', kind: 'source', from: 0, to: revenue, value: revenue },
      { key: 'opex', label: '− OPEX', kind: 'deduct', from: revenue, to: revenue - opex, value: -opex },
      { key: 'capex', label: '− ann. CAPEX', kind: 'deduct', from: revenue - opex, to: revenue - opex - capex, value: -capex },
      { key: 'net', label: 'Net', kind: 'net', from: 0, to: net, value: net },
    ];
  }

  function economicsWaterfallMarkup(econ, moneyQuality) {
    if (!econ) return teaChartEmpty('Complete the graph to plot the cash gate.');
    const steps = waterfallSteps(econ);
    const scale = axisFromValues(steps.flatMap(step => [step.from, step.to, 0]));
    const width = 480;
    const height = 212;
    const padL = 58;
    const padR = 10;
    const padT = 22;
    const padB = 28;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const plotRight = padL + plotW;
    const y = yMapper(scale, padT, plotH);
    const slot = plotW / steps.length;
    const barW = Math.min(46, slot * 0.5);
    const cx = index => padL + slot * (index + 0.5);
    const ticks = scale.ticks.map(tick => {
      const yy = y(tick);
      const zero = tick === 0;
      return `<g class="tea-axis-tick"><line x1="${padL}" y1="${px(yy)}" x2="${plotRight}" y2="${px(yy)}" stroke="${zero ? 'var(--text-muted)' : 'var(--border)'}" stroke-width="${zero ? 1.25 : 1}"${zero ? ' class="tea-zero"' : ''}></line><text x="${padL - 6}" y="${px(yy + 3)}" text-anchor="end">${escapeHtml(axisMoney(tick))}</text></g>`;
    }).join('');
    const bandX = cx(3) - barW / 2 - 8;
    const band = `<rect class="tea-gate-band" x="${px(bandX)}" y="${px(padT)}" width="${px(barW + 16)}" height="${px(plotH)}" rx="4" fill="var(--accent)" opacity="0.14"></rect><text class="tea-gate-tag" x="${px(cx(3))}" y="12" text-anchor="middle">gate</text>`;
    const connectors = steps.slice(0, 3).map((step, index) => {
      const next = steps[index + 1];
      const y2 = y(index === 2 ? next.to : next.from);
      return `<line x1="${px(cx(index) + barW / 2)}" y1="${px(y(step.to))}" x2="${px(cx(index + 1) - barW / 2)}" y2="${px(y2)}" stroke="var(--text-muted)" stroke-dasharray="3 2"></line>`;
    }).join('');
    const columns = steps.map((step, index) => {
      const tone = step.kind === 'net'
        ? (step.value > 0 ? 'positive' : step.value < 0 ? 'negative' : 'flat')
        : step.kind;
      const gateClass = step.kind === 'net' ? ' is-gate' : '';
      const y0 = y(step.from);
      const y1 = y(step.to);
      const top = Math.min(y0, y1);
      const barH = Math.abs(y1 - y0);
      const fill = step.kind === 'source'
        ? 'var(--teal)'
        : step.kind === 'deduct'
          ? 'var(--warning)'
          : step.value > 0 ? 'var(--success)' : step.value < 0 ? 'var(--danger)' : 'var(--text-muted)';
      const rect = barH > 0.4
        ? `<rect x="${px(cx(index) - barW / 2)}" y="${px(top)}" width="${px(barW)}" height="${px(barH)}" rx="2" fill="${fill}"${step.kind === 'net' ? ' stroke="var(--text-primary)" stroke-width="1.25"' : ''}></rect>`
        : '';
      const plotBottom = padT + plotH - 2;
      let labelY = top - 6;
      if (labelY < padT + 3) labelY = top + barH + 12;
      if (labelY > plotBottom) labelY = Math.max(padT + 12, top + Math.min(14, Math.max(barH - 2, 0)));
      const shown = formatUncertainMoney(step.value, moneyQuality);
      return `<g class="tea-fall-step is-${tone}${gateClass}" data-key="${step.key}" data-from="${attrNum(step.from)}" data-to="${attrNum(step.to)}"><title>${escapeHtml(step.label)} ${escapeHtml(shown)}</title>${rect}<text class="tea-fall-value" x="${px(cx(index))}" y="${px(labelY)}" text-anchor="middle">${escapeHtml(shown)}</text><text class="tea-fall-label" x="${px(cx(index))}" y="${height - 8}" text-anchor="middle">${escapeHtml(step.label)}</text></g>`;
    }).join('');
    return `<svg class="tea-plot" viewBox="0 0 ${width} ${height}" role="img"><title>Revenue, minus operating cost, minus annualized CAPEX, net cash gate</title>${ticks}${band}${connectors}${columns}</svg>`;
  }

  function cashflowYearLabels(count) {
    if (count <= 1) return [0];
    if (count <= 8) return [...Array(count).keys()];
    const last = count - 1;
    const labels = new Set([0, last]);
    const step = Math.max(1, Math.ceil(last / 5));
    for (let year = 0; year <= last; year += step) labels.add(year);
    return [...labels].sort((a, b) => a - b);
  }

  function economicsCashflowMarkup(econ, moneyQuality) {
    const flows = Array.isArray(econ?.cashFlows) ? econ.cashFlows.map(Number) : [];
    if (!flows.length || flows.some(value => !Number.isFinite(value))) {
      return teaChartEmpty('Cash-flow series is incomplete.');
    }
    const scale = axisFromValues(flows);
    const width = 480;
    const height = 188;
    const padL = 58;
    const padR = 8;
    const padT = 16;
    const padB = 24;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const plotRight = padL + plotW;
    const y = yMapper(scale, padT, plotH);
    const slot = plotW / flows.length;
    const barW = Math.max(2, Math.min(28, slot * 0.62));
    const zeroY = y(0);
    const ticks = scale.ticks.map(tick => {
      const yy = y(tick);
      const zero = tick === 0;
      return `<g class="tea-axis-tick"><line x1="${padL}" y1="${px(yy)}" x2="${plotRight}" y2="${px(yy)}" stroke="${zero ? 'var(--text-muted)' : 'var(--border)'}" stroke-width="${zero ? 1.25 : 1}"${zero ? ' class="tea-zero"' : ''}></line><text x="${padL - 6}" y="${px(yy + 3)}" text-anchor="end">${escapeHtml(axisMoney(tick))}</text></g>`;
    }).join('');
    const labeled = new Set(cashflowYearLabels(flows.length));
    const bars = flows.map((value, year) => {
      const cx = padL + slot * (year + 0.5);
      const y1 = y(value);
      const top = Math.min(zeroY, y1);
      const barH = Math.abs(y1 - zeroY);
      const capex = year === 0;
      const fill = capex ? 'var(--warning)' : value > 0 ? 'var(--success)' : value < 0 ? 'var(--danger)' : 'var(--text-muted)';
      const cls = capex ? 'is-capex' : value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : 'is-flat';
      const rect = barH > 0.4
        ? `<rect x="${px(cx - barW / 2)}" y="${px(top)}" width="${px(barW)}" height="${px(barH)}" rx="1" fill="${fill}"${capex ? ' stroke="var(--text-primary)" stroke-width="1.15"' : ''}></rect>`
        : '';
      const yearLabel = labeled.has(year)
        ? `<text class="tea-year-label${capex ? ' is-capex-label' : ''}" x="${px(cx)}" y="${height - 6}" text-anchor="middle">${year}</text>`
        : '';
      const name = capex ? 'Year 0 · CAPEX' : `Year ${year}`;
      return `<g class="tea-cash-bar ${cls}" data-year="${year}" data-value="${attrNum(value)}"><title>${escapeHtml(name)} ${escapeHtml(formatUncertainMoney(value, moneyQuality))}</title>${rect}${yearLabel}</g>`;
    }).join('');
    const later = flows.slice(1);
    const steady = flows[1];
    const replacement = later.length > 1 && later.slice(1).some(value => Math.abs(value - steady) > 1);
    const legendBits = ['<span><i class="is-capex"></i>Year 0 · CAPEX</span>'];
    if (later.some(value => value > 0)) legendBits.push('<span><i class="is-positive"></i>Operating cash</span>');
    if (later.some(value => value < 0)) legendBits.push('<span><i class="is-negative"></i>Negative year</span>');
    const svg = `<svg class="tea-plot" viewBox="0 0 ${width} ${height}" role="img"><title>Cash flow by project year. Year 0 is installed CAPEX.</title>${ticks}${bars}</svg>`;
    const legend = `<p class="tea-chart-legend">${legendBits.join('')}</p>`;
    const note = replacement ? '<p class="tea-chart-note">Dips after year 0 are asset replacements in that year.</p>' : '';
    return `${svg}${legend}${note}`;
  }

  function breakevenMark(mode, result) {
    if (!result || !result.status || result.status === 'unknown-material') return null;
    if (result.status === 'flip' && Number.isFinite(Number(result.breakEven))) {
      return { mode, kind: 'price', price: Number(result.breakEven) };
    }
    if (result.status === 'no-flip-always-positive' && Number.isFinite(Number(result.pMax))) {
      return { mode, kind: 'above', price: Number(result.pMax) };
    }
    if (result.status === 'no-flip-always-negative' || result.status === 'non-monotonic') {
      return { mode, kind: 'none', price: null };
    }
    return { mode, kind: 'none', price: null };
  }

  function priceAxis(maxPrice) {
    const top = Math.max(Number(maxPrice) * 1.18, Number(maxPrice) + 0.01, 0.05);
    let step = niceStep(top, 4);
    if (step >= top) step = niceStep(top, 2);
    let max = Math.ceil((top - 1e-12) / step) * step;
    if (!(max > 0)) max = step || 1;
    let count = Math.round(max / step);
    if (count > 6) {
      step *= 2;
      max = Math.ceil((top - 1e-12) / step) * step;
      count = Math.round(max / step);
    }
    const ticks = [];
    for (let i = 0; i <= count && i < 8; i += 1) ticks.push(roundTo(i * step, step));
    if (ticks[ticks.length - 1] < maxPrice) ticks.push(roundTo(max, step));
    return { min: 0, max: ticks[ticks.length - 1] || max, ticks };
  }

  function breakevenDataAttrs(solo, shared) {
    const part = (name, mark) => {
      if (!mark) return '';
      const price = mark.kind === 'price' && Number.isFinite(mark.price) ? ` data-${name}-price="${attrNum(mark.price)}"` : '';
      const bound = mark.kind === 'above' && Number.isFinite(mark.price) ? ` data-${name}-bound="${attrNum(mark.price)}"` : '';
      return ` data-${name}-kind="${mark.kind}"${price}${bound}`;
    };
    return `${part('solo', solo)}${part('shared', shared)}`;
  }

  function powerBreakevenChartMarkup(soloResult, sharedResult, active) {
    const solo = breakevenMark('solo', soloResult);
    const shared = breakevenMark('shared', sharedResult);
    if (!solo && !shared) return '';
    const marks = [solo, shared].filter(Boolean);
    const prices = marks.filter(mark => mark.kind === 'price');
    const aboves = marks.filter(mark => mark.kind === 'above');
    const attrs = breakevenDataAttrs(solo, shared);
    if (!prices.length && !aboves.length) {
      return `<div class="tea-be-chart"${attrs}><p class="tea-chart-empty">No break-even $/kWh. Net cash stays at or below zero when purchased power is free.</p></div>`;
    }
    const domain = prices.length
      ? priceAxis(Math.max(...prices.map(mark => mark.price), 0))
      : priceAxis(Math.max(...aboves.map(mark => mark.price), 0));
    const plotted = prices.length ? prices : aboves;
    const width = 640;
    const height = 84;
    const padL = 8;
    const padR = 8;
    const axisY = 44;
    const plotW = width - padL - padR;
    const xOf = price => padL + ((price - domain.min) / (domain.max - domain.min || 1)) * plotW;
    const firstTick = domain.ticks[0];
    const lastTick = domain.ticks[domain.ticks.length - 1];
    const tickStep = domain.ticks.length > 1 ? domain.ticks[1] - domain.ticks[0] : domain.max;
    const ticks = domain.ticks.map(tick => {
      const x = xOf(tick);
      const anchor = tick === firstTick ? 'start' : tick === lastTick ? 'end' : 'middle';
      return `<g class="tea-axis-tick"><line x1="${px(x)}" y1="${axisY}" x2="${px(x)}" y2="${axisY + 5}" stroke="var(--text-muted)"></line><text x="${px(x)}" y="${axisY + 18}" text-anchor="${anchor}">${escapeHtml(formatKwhTick(tick, tickStep))}</text></g>`;
    }).join('');
    const used = [];
    const markers = plotted.map(mark => {
      const x = xOf(Math.min(Math.max(mark.price, domain.min), domain.max));
      let labelY = 16;
      if (used.some(prev => Math.abs(prev - x) < 88)) labelY = 30;
      used.push(x);
      const color = mark.mode === 'shared' ? 'var(--teal)' : 'var(--electric)';
      const on = mark.mode === active || plotted.length === 1;
      const open = mark.kind === 'above';
      const label = open ? `above ${formatKwh(mark.price)} · ${mark.mode}` : `${formatKwh(mark.price)} · ${mark.mode}`;
      const dot = open
        ? `<circle cx="${px(x)}" cy="${axisY}" r="${on ? 5 : 3.5}" fill="none" stroke="${color}" stroke-width="1.6"></circle>`
        : `<circle cx="${px(x)}" cy="${axisY}" r="${on ? 5 : 3.5}" fill="${color}"${on ? ' stroke="var(--text-primary)" stroke-width="1.4"' : ''}></circle>`;
      return `<g class="tea-be-mark is-${mark.mode}${mark.mode === active ? ' is-active' : ''}" data-mode="${mark.mode}" data-kind="${mark.kind}"><line x1="${px(x)}" y1="${labelY + 3}" x2="${px(x)}" y2="${axisY - 6}" stroke="${color}"></line>${dot}<text x="${px(x)}" y="${labelY}" text-anchor="middle" fill="${color}" font-weight="${on ? 700 : 600}">${escapeHtml(label)}</text></g>`;
    }).join('');
    const notes = [];
    if (prices.length) {
      for (const mark of marks) {
        if (mark.kind === 'none') notes.push(`${mark.mode}: no $/kWh cross — cash stays ≤ 0 at free power`);
        if (mark.kind === 'above') notes.push(`${mark.mode}: still above the gate at ${formatKwh(mark.price)}/kWh`);
      }
    }
    const note = notes.length ? `<p class="tea-chart-note">${escapeHtml(notes.join(' · '))}</p>` : '';
    const svg = `<svg class="tea-plot" viewBox="0 0 ${width} ${height}" role="img"><title>Screened purchased-power break-even in dollars per kilowatt-hour</title><line x1="${padL}" y1="${axisY}" x2="${padL + plotW}" y2="${axisY}" stroke="var(--border-light)" stroke-width="1.5"></line><text x="${width - padR}" y="${axisY - 10}" text-anchor="end" fill="var(--text-muted)">$/kWh</text>${ticks}${markers}</svg>`;
    return `<div class="tea-be-chart"${attrs}>${svg}${note}</div>`;
  }

  function paintPowerBreakevenChart(solo, shared, active) {
    const host = document.getElementById('powerBreakevenChart');
    if (!host) return;
    const markup = powerBreakevenChartMarkup(solo, shared, active);
    if (!markup) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.innerHTML = markup;
  }

  function clearPowerBreakevenChart() {
    const host = document.getElementById('powerBreakevenChart');
    if (!host) return;
    host.hidden = true;
    host.innerHTML = '';
  }

  function clearEconomicsFigures() {
    paintCashGate(null);
    const waterfall = document.getElementById('economicsWaterfall');
    if (waterfall) waterfall.innerHTML = teaChartEmpty('Complete the graph to plot the cash gate.');
    const cashflow = document.getElementById('economicsCashflow');
    if (cashflow) cashflow.innerHTML = teaChartEmpty('Complete the graph to plot cash flow.');
    for (const id of ['economicsCapital', 'economicsOps', 'economicsMetrics', 'economicsDcfMetrics']) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    }
  }

  function syncEconomicsDisclosure() {
    const dcf = document.getElementById('economicsDcf');
    if (!dcf) return;
    const open = economicsAcknowledgment();
    if (Boolean(dcf.open) === open) return;
    syncingEconomicsDisclosure = true;
    try { dcf.open = open; }
    finally { syncingEconomicsDisclosure = false; }
  }

  function powerBreakevenSignatureNow() {
    if (!currentEconomics) return '';
    const mode = document.getElementById('powerBreakevenMode')?.value || 'solo';
    const material = document.getElementById('powerBreakevenMaterial')?.value || '';
    return [
      mode,
      material,
      currentEconomics.annualNetCash,
      currentEconomics.installedCapex,
      currentEconomics.annualRevenue,
      currentEconomics.annualOperatingCost,
      projectEconomics.projectLifeYears,
      projectEconomics.discountRate,
      graph.nodes.length,
    ].join('|');
  }

  function screenPowerBreakEven() {
    const out = document.getElementById('powerBreakevenResult');
    const show = text => {
      if (!out) return null;
      out.hidden = false;
      out.textContent = text;
      return text;
    };
    try {
      const engine = globalThis.MaterialPowerBreakeven;
      if (!engine?.breakEvenForMaterial || !engine.formatBreakEven) {
        show('Power break-even engine is not loaded.');
        clearPowerBreakevenChart();
        return null;
      }
      if (!result || !graph.nodes.length) {
        show('Complete the graph before screening purchased-power break-even. Screening only — not a PPA.');
        clearPowerBreakevenChart();
        return null;
      }
      populatePowerBreakevenMaterials();
      const mode = document.getElementById('powerBreakevenMode')?.value || 'solo';
      const materialId = document.getElementById('powerBreakevenMaterial')?.value || '';
      if (!materialId) {
        const unsupported = unsupportedSoldLabels();
        show(unsupported.length
          ? `No product supported by the screening price table (${unsupported.join(', ')}). Screening only — not a PPA.`
          : 'This plant is not selling a product this screen can price. Screening only — not a PPA.');
        clearPowerBreakevenChart();
        return null;
      }
      const screened = engine.breakEvenForMaterial(currentCaseDefinition(), result, materialId, mode);
      const otherMode = mode === 'shared' ? 'solo' : 'shared';
      let other = null;
      try {
        other = engine.breakEvenForMaterial(currentCaseDefinition(), result, materialId, otherMode);
      } catch { other = null; }
      const solo = mode === 'solo' ? screened : other;
      const shared = mode === 'shared' ? screened : other;
      show(engine.formatBreakEven(screened));
      paintPowerBreakevenChart(solo, shared, mode);
      return screened;
    } catch (error) {
      show(error?.message || String(error));
      clearPowerBreakevenChart();
      return null;
    } finally {
      powerBreakevenSignature = powerBreakevenSignatureNow();
    }
  }

  function refreshPowerBreakevenReadout() {
    if (!currentEconomics) return;
    if (powerBreakevenSignatureNow() === powerBreakevenSignature) return;
    screenPowerBreakEven();
  }

  function renderEconomics() {
    const status = document.getElementById('economicsStatus');
    const banner = document.getElementById('economicsBanner');
    document.getElementById('projectLifeYears').value = projectEconomics.projectLifeYears;
    document.getElementById('discountRate').value = projectEconomics.discountRate * 100;
    populatePowerBreakevenMaterials();
    paintAssumptionReadouts();
    syncEconomicsDisclosure();
    if (!currentEconomics) {
      status.textContent = result ? `Economics unavailable: ${solveError}` : 'Complete the graph to calculate viability.';
      if (banner) banner.hidden = true;
      clearEconomicsFigures();
      powerBreakevenSignature = '';
      const breakeven = document.getElementById('powerBreakevenResult');
      if (breakeven) {
        breakeven.hidden = true;
        breakeven.textContent = '';
      }
      clearPowerBreakevenChart();
      return;
    }
    const moneyQuality = classifyQuality({ kind: 'money' });
    const productQuality = classifyQuality({ kind: 'product-cost' });
    const gate = economicsGateReasons();
    const showBankable = !gate.length || economicsAcknowledgment();
    if (banner) {
      banner.hidden = !gate.length;
      banner.textContent = gate.length
        ? `Screening — not bankable (${gate.join('; ')}). Open “Show NPV/IRR (screening)” for DCF.`
        : '';
    }
    status.textContent = `${currentEconomics.periodDays} operating days/year · screening. Annual net cash is R − OPEX − ann. CAPEX. NPV/IRR are DCF and stay in the disclosure.`;
    paintCashGate(currentEconomics, moneyQuality);
    const waterfall = document.getElementById('economicsWaterfall');
    if (waterfall) waterfall.innerHTML = economicsWaterfallMarkup(currentEconomics, moneyQuality);
    const cashflow = document.getElementById('economicsCashflow');
    if (cashflow) cashflow.innerHTML = economicsCashflowMarkup(currentEconomics, moneyQuality);
    const capital = document.getElementById('economicsCapital');
    if (capital) {
      capital.innerHTML = metricRows([
        ['Installed CAPEX', formatUncertainMoney(currentEconomics.installedCapex, moneyQuality), { quality: moneyQuality }],
        ['Annualized CAPEX', formatUncertainMoney(currentEconomics.annualizedCapex, moneyQuality), { quality: moneyQuality }],
      ]);
    }
    const ops = document.getElementById('economicsOps');
    if (ops) {
      const operating = Number(currentEconomics.annualOperatingCash);
      ops.innerHTML = metricRows([
        ['Revenue<small>per year</small>', formatUncertainMoney(currentEconomics.annualRevenue, moneyQuality), { quality: moneyQuality }],
        ['OPEX<small>per year</small>', formatUncertainMoney(currentEconomics.annualOperatingCost, moneyQuality), { quality: moneyQuality }],
        ['Operating cash<small>R − OPEX</small>', formatUncertainMoney(operating, moneyQuality), { quality: moneyQuality, tone: operating < 0 ? 'negative' : operating > 0 ? 'positive' : '' }],
      ]);
    }
    const metrics = document.getElementById('economicsMetrics');
    if (metrics) {
      const productRows = [
        ['Levelized delivered cost', currentEconomics.levelizedDeliveredCost == null ? '—' : `${formatUncertainMoney(currentEconomics.levelizedDeliveredCost, productQuality)}/unit`, { quality: productQuality }],
        ...(currentEconomics.sinks || []).filter(sink => sink.disposition === 'sale' && sink.deliveredAmount > 0).map(sink => (
          [`Sold ${sink.id}`, `${formatUncertainNumber(sink.deliveredAmount / 1000, productQuality)} t/year`, { quality: productQuality }]
        )),
      ];
      metrics.innerHTML = metricRows(productRows);
    }
    const dcf = document.getElementById('economicsDcfMetrics');
    if (dcf) {
      dcf.innerHTML = metricRows(showBankable ? [
        ['NPV', formatUncertainMoney(currentEconomics.npv, moneyQuality), { quality: moneyQuality }],
        ['IRR', formatRate(currentEconomics.irr), { quality: moneyQuality }],
      ] : [
        ['NPV', 'Hidden until this disclosure is open', { quality: moneyQuality }],
        ['IRR', 'Hidden until this disclosure is open', { quality: moneyQuality }],
      ]);
    }
    refreshPowerBreakevenReadout();
  }

  function renderInspectorPort(current, port, declaration) {
    const edgeIndexes = edgeIndexesAt({ node: current.id, port, direction: declaration.direction });
    const multi = declaration.direction === 'in'
      ? (units[current.unit].kind === 'mixer' || current.unit === 'heat-sink')
      : ['junction', 'splitter'].includes(units[current.unit].kind);
    const boundaryAllowed = declaration.direction === 'in'
      ? (edgeIndexes.length === 0 || multi)
      : Boolean(catalog[`${declaration.kind}-sink`]) && (edgeIndexes.length === 0 || multi);
    const connections = edgeIndexes.map(index => {
      const edge = graph.edges[index];
      const peerId = declaration.direction === 'in' ? edge.from.node : edge.to.node;
      const weight = units[current.unit].kind === 'splitter' && declaration.direction === 'out'
        ? `<label class="branch-weight">Share <input name="branchWeight" data-edge="${index}" type="range" min="0.1" max="10" step="0.1" value="${edge.weight ?? 1}" title="Relative share within the same priority tier"></label><label class="branch-priority">Priority <input name="branchPriority" data-edge="${index}" type="number" min="0" max="9" step="1" value="${Number.isFinite(Number(edge.priority)) ? Number(edge.priority) : 0}" title="Higher fills first (Factorio priority output). Equal priorities share by weight, then MECH12 overflow."></label>`
        : '';
      const capValue = edge.capacity == null || edge.capacity === '' || !Number.isFinite(Number(edge.capacity))
        ? ''
        : String(edge.capacity);
      const edgeLimit = result?.edgeLimits?.find(item => (
        item.from.node === edge.from.node && item.from.port === edge.from.port
        && item.to.node === edge.to.node && item.to.port === edge.to.port
      ));
      const kind = declaration.kind;
      const capUnit = kind === 'material' || kind === 'consumable' ? 'kg (or amount) / step' : 'kWh / step';
      const deliveredNote = edgeLimit
        ? `<small class="status-meta">Logistics clamp: ${formatNumber(edgeLimit.delivered)} / ${formatNumber(edgeLimit.capacity)} delivered (requested ${formatNumber(edgeLimit.requested)})</small>`
        : '';
      const capacity = `<label class="edge-capacity">Logistics capacity <input name="edgeCapacity" data-edge="${index}" type="number" min="0" step="any" placeholder="Unlimited" value="${escapeHtml(capValue)}" title="Max flow in this solve step (${capUnit}). Blank = unlimited."></label>${deliveredNote}`;
      const selected = selectedEdgeIndex === index ? ' is-selected-edge' : '';
      return `<div class="port-connection${selected}" data-select-edge="${index}"><small>Connected to ${node(peerId).label}</small>${weight}${capacity}<button type="button" data-disconnect="${index}">Disconnect</button></div>`;
    }).join('') || '<small>Not connected</small>';
    const cause = highlightPort && highlightPort.nodeId === current.id && highlightPort.port === port;
    return `<div class="port-row${cause ? ' is-cause' : ''}" data-port-row="${port}"><div><span>${declaration.direction === 'in' ? 'IN' : 'OUT'} · ${declaration.kind}</span><strong>${portName(port)}</strong>${connections}</div>${boundaryAllowed ? `<button type="button" data-boundary-port="${port}" data-direction="${declaration.direction}">${declaration.direction === 'in' ? 'Add source' : 'Add sink branch'}</button>` : ''}</div>`;
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

  function formatLimitedBy(current, nodeResult) {
    const limits = [...(nodeResult?.limitedBy || [])];
    if (operationMeta.boundaryLimitedBy?.length) {
      for (const item of operationMeta.boundaryLimitedBy) {
        if (!limits.includes(item)) limits.push(item);
      }
    }
    const requested = Number(setpoints[current.id]);
    const achieved = Number(nodeResult?.activity);
    if (limits.length) return limits.join(', ');
    if (Number.isFinite(requested) && requested > 0 && Number.isFinite(achieved) && achieved <= requested * 1e-9) {
      return 'unresolved constraint';
    }
    if (Number.isFinite(requested) && requested > 0 && Number.isFinite(achieved) && achieved + 1e-9 < requested) {
      return 'below setpoint';
    }
    return 'none';
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) < 1e-9) return '0';
    if (Math.abs(n) > 0 && Math.abs(n) < 1e-4) return n.toExponential(2);
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
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
    if (current.unit === 'material-buffer') {
      const econ = current.economics || {};
      const kg = Number(params.capacityKg ?? current.capacity) || 0;
      const perM3 = Number(econ.capexPerM3 ?? params.capexPerM3) || 500;
      const installed = Number(econ.installedCapex);
      const capex = Number.isFinite(installed) ? installed : kg * (Number(params.capexPerKg) || 0.5);
      const fluid = econ.fluidLabel || params.fluidClass || 'generic';
      return [
        ['Installed tank CAPEX', formatUncertainMoney(capex, moneyQuality), { quality: moneyQuality }],
        ['Fluid / intensity', `${escapeHtml(String(fluid))} · $${formatNumber(perM3)}/m³`, { quality: moneyQuality }],
      ];
    }
    if (current.unit === 'intake-pump' || current.unit === 'gas-blower') {
      const econ = current.economics || {};
      const rate = Number(econ.capexRate ?? econ.capexIntensity) || 0;
      const installed = econ.installedCapex != null ? Number(econ.installedCapex) : rate * (Number(current.capacity) || 0);
      const unitLabel = current.unit === 'intake-pump' ? '$/(m³/day)' : '$/(Nm³/day)';
      return [
        ['Installed lift CAPEX', formatUncertainMoney(installed, moneyQuality), { quality: moneyQuality }],
        ['CAPEX intensity', `$${formatNumber(rate)}${unitLabel}`, { quality: moneyQuality }],
      ];
    }
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
    if (typeof meta === 'string') return qualityChip(meta, { omitNoisy: true });
    const quality = meta.quality || (meta.kind ? classifyQuality(meta) : '');
    const chip = quality ? qualityChip(quality, { omitNoisy: true }) : '';
    const band = parseBand(meta.band);
    const bandText = band
      ? `<span class="quality-band">${formatUncertainNumber(band.low, 'cited')}–${formatUncertainNumber(band.high, 'cited')}${band.unit ? ` ${band.unit}` : ''}</span>`
      : '';
    const cite = meta.cite || citeMarkup(meta.references);
    return `${chip}${bandText}${cite}`;
  }
  function metricRows(rows) {
    return rows.map(([term, value, meta]) => {
      const tone = meta && typeof meta === 'object' && (meta.tone === 'positive' || meta.tone === 'negative') ? ` class="${meta.tone}"` : '';
      return `<div><dt>${term}</dt><dd${tone}>${value}${metricMetaMarkup(meta)}</dd></div>`;
    }).join('');
  }

  window.__FLOWSHEET_APP__ = {
    graph, setpoints, addNode, choosePort, clearFactory, autoArrange, toggleCanvasFocus,
    completeBoundaries, loadMethaneRecycle, loadCoastalMethane, loadMethanolPlant, loadSiliconAlumina, loadReeIonic, loadMaglutLongBeach, loadBioforgeMarshall, loadGreenAmmonia, sizeCoastalToMethane, sizeToProduct, sizeForPositiveCashflow, loadAbundanceHub, loadZabuyeHub, loadDemoNetwork,
    addCurrentPlant, openNetworkPlant, clearNetwork, replaceUnit, bindLocation, applySitePreset, applyCoordinates,
    beginAddPlant, cancelAddPlant, submitAddPlant, beginRenamePlant, beginRemovePlant, cancelPlantEdit,
    renameNetworkPlant, removeNetworkPlant,
    saveNamed, loadNamed, captureBaseline, clearBaseline, activateTab,
    deleteSelection, undoLast, redoLast, undoLastDelete: undoLast, clearCanvasSelection, handleProcessKeydown, nudgeSelectedNode,
    handleInspectorInput,
    get selectedNodeId() { return selectedNodeId; },
    set selectedNodeId(value) { selectedNodeId = value; },
    get selectedEdgeIndex() { return selectedEdgeIndex; },
    set selectedEdgeIndex(value) { selectedEdgeIndex = value; },
    get undoStackLength() { return undoStack.length; },
    get redoStackLength() { return redoStack.length; },
    clearUndoStack() { undoStack = []; redoStack = []; undoGesture = null; syncRedoButton(); },
    inferBufferFluidClass, refreshBufferEconomics,
    get pendingPort() { return pendingPort; },
    set pendingPort(value) { pendingPort = value; },
    solve: solveAndRender, fitCanvas, showCause(nodeId) {
      const current = node(nodeId || selectedNodeId);
      if (!current) return null;
      selectedNodeId = current.id;
      const diagnosis = blockDiagnosis(current);
      if (diagnosis) followDiagnosis(diagnosis);
      else render();
      return diagnosis;
    }, get result() { return result; }, get baseline() { return baseline; },
    get economics() { return currentEconomics; }, get site() { return site; }, get network() { return networkResult; },
    get sizing() { return lastSizing; }, get activeTab() { return activeTab; },
    projectEconomics, setCanvasZoom, get canvasZoom() { return canvasZoom; },
    screenPowerBreakEven,
    intakeKind, buildingProfile, materialPresets,
  };
  populatePowerBreakevenMaterials();
  populateSitePresets();
  refreshSaveOptions();
  const savedNetwork = readJson(NETWORK_KEY);
  if (savedNetwork?.plants) network = { plants: savedNetwork.plants, corridors: savedNetwork.corridors || [] };
  if (network.plants.length) refreshNetwork();
  if (restoreSnapshot(readJson(AUTOSAVE_KEY))) solveAndRender();
  else if (globalThis.NetworkCase?.siteZabuyeAbundance) {
    setActiveDemo('zabuye-hub', 'Zabuye brine hub');
    loadCase(NetworkCase.siteZabuyeAbundance(), 'minerals');
  } else render();
  activateTab(readSavedTab());
})();
