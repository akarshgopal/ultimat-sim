// Unit catalog, display labels, material presets, intake classification.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.defineProperties(app, {
    CONSUMABLE_CHEMICALS: { get: () => CONSUMABLE_CHEMICALS, enumerable: true },
    DAC_ROUTES: { get: () => DAC_ROUTES, enumerable: true },
    INTAKE_BY_KEY: { get: () => INTAKE_BY_KEY, enumerable: true },
    NODE_DISPLAY_LABELS: { get: () => NODE_DISPLAY_LABELS, enumerable: true },
    PALETTE_CATEGORIES: { get: () => PALETTE_CATEGORIES, enumerable: true },
    PALETTE_DEFAULT_OPEN: { get: () => PALETTE_DEFAULT_OPEN, enumerable: true },
    PRACTICAL_INTAKE_PALETTE: { get: () => PRACTICAL_INTAKE_PALETTE, enumerable: true },
    PURCHASED_FEED_PRESETS: { get: () => PURCHASED_FEED_PRESETS, enumerable: true },
    RIGHT_DISPLAY_LABELS: { get: () => RIGHT_DISPLAY_LABELS, enumerable: true },
    SITE_MONTHS: { get: () => SITE_MONTHS, enumerable: true },
    SIZE_PRODUCT_LABELS: { get: () => SIZE_PRODUCT_LABELS, enumerable: true },
    catalog: { get: () => catalog, enumerable: true },
    materialPresets: { get: () => materialPresets, enumerable: true },
    portNames: { get: () => portNames, enumerable: true },
  });
  Object.assign(app, {
    applyPracticalIntakeLabel, intakeKind, isAutoIntakeLabel, isGenericMaterialSourceLabel,
  });

  const SIZE_PRODUCT_LABELS = {
    CH4: 'CH₄', H2: 'H₂', methanol: 'methanol', ammonia: 'NH₃', lithium: 'lithium', salt: 'salt',
    module: 'PV module', steel: 'steel', ethylene: 'ethylene', diesel: 'diesel', urea: 'urea', titanium: 'titanium',
    'float-glass': 'float glass', cement: 'cement', copper: 'copper', ndpr: 'ndpr',
  };
  const PALETTE_CATEGORIES = {
    Minerals: ['brine-minerals', 'chlor-alkali', 'bromine-recovery'],
    Fuels: ['electrolyzer', 'sabatier', 'methanol', 'asu', 'ammonia', 'urea', 'mto', 'ft-liquids'],
    Water: ['swro'],
    Power: ['solar-pv', 'battery'],
    Carbon: ['dac-solid', 'dac-liquid', 'dac-electroswing'],
    Crust: ['mg-si', 'polysilicon', 'bayer-alumina', 'aluminium-smelter', 'float-glass', 'cement', 'pv-module', 'hydrogen-dri', 'titanium-kroll', 'copper-ew'],
    REE: ['iac-leach', 'ree-chromatography', 'ree-sx'],
    Bio: ['bioforge'],
  };
  const PALETTE_DEFAULT_OPEN = new Set(['Minerals', 'Fuels']);

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
    urea: {
      label: 'Urea', capacity: 1000, rate: 100, activityUnit: 'kg urea/day',
      palette: { section: 'building', order: 8.5, glyph: 'Ur', tone: 'hydrogen', description: 'NH₃ + CO₂ → urea' },
      params: { electricityKWhPerKg: 0.8 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity', min: 0, max: 3, step: 0.05, unit: 'kWh/kg urea' }],
      sourceNote: 'Screening overall stoichiometry 2 NH₃ + CO₂ → urea + H₂O; not carbamate recycle and not granulation. Default 0.8 kWh/kg is an electricity-as-total-energy proxy for a steam-heavy plant (real urea is heat-dominated). NH₃ is purchased (urea) or on-site Haber from SWRO+PEM+ASU (green-urea). Not a Stamicarbon SEC.',
    },
    mto: {
      label: 'MTO (ethylene)', capacity: 1000, rate: 100, activityUnit: 'kg ethylene/day',
      palette: { section: 'building', order: 8.7, glyph: 'MTO', tone: 'methane', description: '2 CH₃OH → ethylene + water' },
      params: { electricityKWhPerKg: 4 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity', min: 0, max: 12, step: 0.1, unit: 'kWh/kg ethylene' }],
      sourceNote: 'Screening overall stoichiometry 2 CH₃OH → C₂H₄ + 2 H₂O; SAPO-34 ethylene-maximizing proxy, propylene/C4 omitted. Default 4 kWh/kg is an electricity-as-total-energy proxy (real MTO is heat-dominated). MeOH is purchased (mto) or on-site SWRO+PEM+MeOH (green-mto). Not a UOP SEC and not FT liquids.',
    },
    'ft-liquids': {
      label: 'FT liquids (diesel)', capacity: 1000, rate: 100, activityUnit: 'kg liquid/day',
      palette: { section: 'building', order: 8.8, glyph: 'FT', tone: 'methane', description: 'H₂ + CO₂ → diesel + water' },
      params: { electricityKWhPerKg: 0.22 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity', min: 0, max: 2, step: 0.01, unit: 'kWh/kg liquid' }],
      sourceNote: 'Screening overall 12 CO₂ + 37 H₂ → C₁₂H₂₆ + 24 H₂O (n=12 paraffin diesel/syncrude proxy; RWGS folded into island). Default 0.22 kWh/kg is IEA 0.018 GJe/GJliquid × 43.0 MJ/kg (electricity of the FT island; real FT is heat/H₂ dominated). H₂ is purchased industrial (ft-liquids) or on-site SWRO+PEM (green-ft). Not a Sasol/Shell SEC and not a green e-diesel premium.',
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
    'float-glass': {
      label: 'Float glass', capacity: 1000, rate: 100, activityUnit: 'kg glass/day',
      palette: { section: 'building', order: 13, glyph: 'FG', description: 'Sand + soda ash + limestone + power → glass' },
      params: { electricityKWhPerKg: 2.5, sandKgPerKg: 0.65, sodaAshKgPerKg: 0.20, limestoneKgPerKg: 0.21 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity (total-energy proxy)', min: 0, max: 8, step: 0.1, unit: 'kWh/kg glass' }],
      sourceNote: 'Screening float/solar glass. GfE 2011 LCA Table 1: sand 0.65, soda ash 0.20, limestone+dolomite 0.21 kg/kg. SEC 2.5 kWh/kg is 9.0 MJ/kg as electricity-as-total-energy (real float is heat-dominated). Not a tin-bath line, not a Guardian/Xinyi quote.',
      references: [
        { label: 'Glass for Europe LCA of float glass (Table 1 mass + 9.0 MJ/kg energy)', url: 'https://glassforeurope.com/wp-content/uploads/2018/04/Life-Cycle-Assessment.pdf' },
        { label: 'Burrows & Fthenakis 2015 (float plant $150–200M / 500–700 t/day)', url: 'https://doi.org/10.1016/j.solmat.2014.09.028' },
      ],
    },
    cement: {
      label: 'Cement kiln', capacity: 1000, rate: 100, activityUnit: 'kg cement/day',
      palette: { section: 'building', order: 13, glyph: 'Cm', description: 'Limestone + clay/silica + power → cement' },
      params: { electricityKWhPerKg: 1.05, limestoneKgPerKg: 1.183, clayKgPerKg: 0.337 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electricity (total-energy proxy)', min: 0, max: 4, step: 0.05, unit: 'kWh/kg cement' }],
      sourceNote: 'Screening dry-process grey clinker as a Portland-cement proxy. IPCC 0.52 kg process CO2/kg; limestone 1.183 + clay/SiO2 0.337 kg/kg. SEC 1.05 kWh/kg is IEA 3.4 GJ/t clinker + ~100 kWh/t cement as electricity-as-total-energy (real kiln is heat-dominated). Gypsum ~5% omitted. Not a wet kiln, not CEM II, not CCUS.',
      references: [
        { label: 'IPCC 2006 Vol. 3 Ch. 2 — 0.52 t process CO2 / t clinker', url: 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/3_Volume3/V3_2_Ch2_Mineral_Industry.pdf' },
        { label: 'IEA Cement — thermal ~3.4–3.5 GJ/t clinker; electricity ~105 kWh/t cement', url: 'https://web.archive.org/web/20230528230323/https://www.iea.org/reports/cement' },
        { label: 'USGS MCS 2026 cement — mill unit value 2025e $160/t', url: 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-cement.pdf' },
      ],
    },
    'copper-ew': {
      label: 'Copper SX-EW', capacity: 1000, rate: 100, activityUnit: 'kg Cu/day',
      palette: { section: 'building', order: 13, glyph: 'Cu', description: 'PLS copper + power → LME cathode' },
      params: { electricityKWhPerKg: 2.2, plsKgPerKg: 1.0 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Electrowinning electricity', min: 1, max: 4, step: 0.05, unit: 'kWh/kg Cu' }],
      sourceNote: 'Screening heap-leach SX-EW island: purchased contained Cu in PLS → LME-grade cathode. Faraday 1.00 kg Cu / kg cathode; acid regenerates to raffinate (inventory). SEC 2.2 kWh/kg is industrial EW+SX island electricity (1.8–2.5 kWh/kg; Marimaca 2.28). Heap/mine/pad out of scope. Not a smelter and not electrorefining.',
      references: [
        { label: 'USGS MCS 2026 copper — LME grade A cash 2025e 440 ¢/lb', url: 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-copper.pdf' },
        { label: 'Copper electrowinning practice — typical 1900–2000 kWh/t Cu', url: 'https://pressbooks.bccampus.ca/hydrometallurgy/chapter/copper-electrowinning-practice/' },
        { label: 'Marimaca Oxide DFS — SX/TF/EW 50 kt/y cathode nameplate', url: 'https://marimaca.com/wp-content/uploads/2026/07/25-10-09-Marimaca-Oxide-Deposit-NI-43-101-Technical-Report-Feasibility-Study_FINAL.pdf' },
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
    'ree-sx': {
      label: 'REE SX (peer)', capacity: 10, rate: 10, activityUnit: 'kg REO/day',
      palette: { section: 'building', order: 13, glyph: 'SX', description: 'Peer solvent extraction · mixed REO → NdPr + DyTb + light REO' },
      params: { recovery: 0.95, electricityKWhPerKgReo: 5.3 },
      controls: [
        { key: 'recovery', label: 'Recovery', min: 0, max: 1, step: 0.01 },
        { key: 'electricityKWhPerKgReo', label: 'Electricity', min: 0, max: 15, step: 0.1, unit: 'kWh/kg REO' },
      ],
      sourceNote: 'Peer solvent-extraction screening, not Maglut chromatography and not a Lynas/MP Materials quote. Recovery 0.95 is a commercial SX mid (~90–98%). SEC 5.3 kWh/kg is the Talens Peiró & Villalba JOM 2013 SX electricity mid (15.6–22.7 GJ/t REM). CAPEX pack is $120k/t-y. Purity is not simulated. Screening, not bankable.',
      references: [
        { label: 'Talens Peiró & Villalba JOM 2013 SX electricity', url: 'https://link.springer.com/article/10.1007/s11837-013-0719-8' },
        { label: 'Honaker / NETL 2020 coal-to-REE PDF', url: 'https://www.netl.doe.gov/sites/default/files/2020-10/20VPRREE_Honaker_2.pdf' },
        { label: 'USGS MCS 2026 rare earths', url: 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-rare-earths.pdf' },
        { label: 'ORNL MSX — membrane SX scale context only', url: 'https://www.ornl.gov/publication/process-scale-energy-efficient-membrane-solvent-extraction-process-rare-earth-recycling' },
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
      palette: { section: 'building', order: 13, glyph: 'Fe', tone: 'carbon', description: 'Purchased hematite + H₂ → DRI Fe' },
      params: { electricityKWhPerKg: 0.7 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Direct electricity', min: 0, max: 3, step: 0.05, unit: 'kWh/kg Fe' }],
      sourceNote: 'Screening H₂-DRI, 0.7 kWh/kg shaft electricity. Stoich 0.5 Fe₂O₃ + 1.5 H₂ → Fe + 1.5 H₂O. H₂ is purchased industrial (h2-dri) or on-site SWRO+PEM (green-h2-dri). Not Midrex and not EAF.',
      references: [
        { label: 'USGS MCS 2025 iron ore', url: 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-ore.pdf' },
        { label: 'USGS MCS 2025 iron and steel', url: 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-steel.pdf' },
        { label: 'IEA Global Hydrogen Review 2024', url: 'https://www.iea.org/reports/global-hydrogen-review-2024' },
        { label: 'DOE hydrogen production electrolysis (family contrast; purchased H₂, not electrolyzer)', url: 'https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis' },
      ],
    },
    'titanium-kroll': {
      label: 'Titanium Kroll', capacity: 1000, rate: 100, activityUnit: 'kg Ti/day',
      palette: { section: 'building', order: 14, glyph: 'Ti', description: 'Purchased TiCl₄ + Mg metal → Ti sponge' },
      params: { electricityKWhPerKg: 8 },
      controls: [{ key: 'electricityKWhPerKg', label: 'Process electricity', min: 0, max: 30, step: 0.5, unit: 'kWh/kg Ti' }],
      sourceNote: 'Screening Kroll, 8 kWh/kg with purchased TiCl₄ + Mg metal, not TIMET. Stoich TiCl₄ + 2 Mg → Ti + 2 MgCl₂. Not chloride process from rutile and not an Mg recycle cell.',
      references: [
        { label: 'USGS MCS 2025 titanium', url: 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-titanium.pdf' },
        { label: 'USGS MCS 2026 titanium', url: 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-titanium.pdf' },
        { label: 'USGS MCS 2026 magnesium metal', url: 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-magnesium-metal.pdf' },
      ],
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
    bauxitePurchase: 'Bauxite purchase',
    causticPurchase: 'Caustic purchase',
    silverPurchase: 'Silver purchase',
    glassPurchase: 'Glass purchase',
    evaPurchase: 'EVA purchase',
    ammoniaPurchase: 'Ammonia purchase',
    co2Purchase: 'CO₂ purchase',
    limestonePurchase: 'Limestone purchase',
    clayPurchase: 'Clay purchase',
  };
  const portNames = {
    air: 'Feed gas', electricity: 'Electricity', heat: 'Process heat', consumables: 'Consumables',
    logistics: 'Logistics',
    capturedCo2: 'Captured CO₂', depletedAir: 'Depleted gas', spentMedia: 'Spent media', feed: 'Feed water', product: 'Fresh water',
    brine: 'Brine', water: 'Water', hydrogen: 'Hydrogen', oxygen: 'Oxygen', waterReject: 'Reject water',
    co2: 'CO₂', methane: 'Methane', methanol: 'Methanol', out: 'Output', in: 'Input',
    wasteHeat: 'Waste heat', nitrogen: 'Nitrogen', ammonia: 'NH₃', offgas: 'Off-gas',
    lithium: 'Lithium chloride', bromide: 'Sodium bromide', magnesium: 'Magnesium chloride', potash: 'Potash', gypsum: 'Gypsum', salt: 'Salt', raffinate: 'Raffinate',
    caustic: 'Caustic soda', chlorine: 'Chlorine', bromine: 'Bromine', alumina: 'Alumina', carbon: 'Carbon', aluminium: 'Al frame', carbonDioxide: 'CO₂', urea: 'Urea', ethylene: 'Ethylene',
    quartz: 'Quartzite', silicon: 'MG-Si', polysilicon: 'Poly-Si', carbonMonoxide: 'Carbon monoxide',
    bauxite: 'Bauxite', redMud: 'Red mud',
    silver: 'Ag paste', glass: 'Float glass', eva: 'EVA', module: 'Module',
    sand: 'Silica sand', sodaAsh: 'Soda ash', limestone: 'Limestone',
    cement: 'Portland cement',
    pls: 'PLS copper', cathode: 'Cu cathode',
    clay: 'Clay', lixiviant: '(NH4)2SO4', ndpr: 'NdPr', otherReo: 'Other REO', residue: 'Residue', liquor: 'Liquor',
    concentrate: 'Concentrate', dytb: 'DyTb', lightReo: 'Light REO',
    dextrose: 'Dextrose', gluconic: 'Gluconic acid', hydrogenPeroxide: 'Hydrogen peroxide',
    ironOre: 'Iron ore', steel: 'Fe / Iron', titaniumTetrachloride: 'TiCl₄', titanium: 'Ti', magnesiumChloride: 'MgCl₂',
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
    ammonia: { label: 'Ammonia', phase: 'liquid', mol: { NH3: 1000 } },
    methanol: { label: 'Methanol', phase: 'liquid', mol: { CH3OH: 1000 } },
    salt: { label: 'Sodium chloride', phase: 'solid', mol: { NaCl: 1000 } },
    bromide: { label: 'Sodium bromide', phase: 'solid', mol: { NaBr: 1000 } },
    chlorine: { label: 'Chlorine', phase: 'gas', mol: { Cl2: 1000 } },
    alumina: { label: 'Alumina', phase: 'solid', mol: { Al2O3: 1000 } },
    bauxite: { label: 'Bauxite', phase: 'solid', mol: { Bauxite: 1000 } },
    caustic: { label: 'Caustic soda', phase: 'liquid', mol: { NaOH: 1000 } },
    carbon: { label: 'Carbon anode', phase: 'solid', mol: { C: 1000 } },
    quartz: { label: 'Quartzite', phase: 'solid', mol: { SiO2: 1000 } },
    'silica-sand': { label: 'Silica sand', phase: 'solid', mol: { SiO2: 1000 } },
    'soda-ash': { label: 'Soda ash', phase: 'solid', mol: { Na2CO3: 1000 } },
    limestone: { label: 'Limestone', phase: 'solid', mol: { CaCO3: 1000 } },
    'kiln-clay': { label: 'Kiln clay / silica', phase: 'solid', mol: { SiO2: 1000 } },
    cement: { label: 'Portland cement', phase: 'solid', mol: { PortlandCement: 1000 } },
    'pls-copper': { label: 'PLS copper', phase: 'liquid', mol: { Cu: 1000 } },
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
    'silica-sand': { key: 'silica-sand', label: 'Silica sand', profile: 'silo', glyph: 'SiO2' },
    'soda-ash': { key: 'soda-ash', label: 'Soda ash', profile: 'silo', glyph: 'Na2' },
    limestone: { key: 'limestone', label: 'Limestone', profile: 'silo', glyph: 'Ca' },
    'kiln-clay': { key: 'kiln-clay', label: 'Kiln clay / silica', profile: 'silo', glyph: 'Cy' },
    cement: { key: 'cement', label: 'Portland cement', profile: 'silo', glyph: 'Cm' },
    'pls-copper': { key: 'pls-copper', label: 'PLS copper', profile: 'tank', glyph: 'Cu' },
    ironOre: { key: 'ironOre', label: 'Hematite concentrate', profile: 'silo', glyph: 'silo' },
    magnesium: { key: 'magnesium', label: 'Magnesium', profile: 'silo', glyph: 'silo' },
    co2: { key: 'co2', label: 'Carbon dioxide', profile: 'stack', glyph: 'CO₂' },
    ammonia: { key: 'ammonia', label: 'Ammonia', profile: 'tank', glyph: 'NH₃' },
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
  const PURCHASED_FEED_PRESETS = ['salt', 'ammonia', 'co2', 'methanol', 'hydrogen', 'oxygen', 'nitrogen', 'chlorine', 'bromide', 'alumina', 'bauxite', 'caustic', 'carbon', 'quartz', 'silica-sand', 'soda-ash', 'limestone', 'kiln-clay', 'ironOre', 'magnesium', 'titaniumTetrachloride', 'ionic-clay', 'ammonium-sulfate', 'mixed-reo', 'dextrose', 'silver', 'float-glass', 'eva', 'pls-copper'];
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
})();
