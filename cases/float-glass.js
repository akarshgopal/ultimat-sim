(function exposeFloatGlassCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FloatGlassCase = api;
})(globalThis, (model, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const DAILY_PV_ED = 5.27;
const GLASS_KG_PER_DAY = 1000;
const SEC_GLASS = 2.5;
const SAND_KG_PER_KG = 0.65;
const SODA_KG_PER_KG = 0.20;
const LIMESTONE_KG_PER_KG = 0.21;
const FEED_MARGIN = 1.05;
const REGION = 'Atacama/Chile';
const GFE_FLOAT_LCA = 'https://glassforeurope.com/wp-content/uploads/2018/04/Life-Cycle-Assessment.pdf';
const BURROWS_PV_GLASS = 'https://doi.org/10.1016/j.solmat.2014.09.028';
const USGS_SAND_IND = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-sand-industrial.pdf';
const USGS_SODA_ASH = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-soda-ash.pdf';
const USGS_STONE = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-stone-crushed.pdf';
const FRAUNHOFER_PV_REPORT = 'https://www.ise.fraunhofer.de/content/dam/ise/de/documents/publications/studies/Photovoltaics-Report.pdf';
const MEJILLONES_URL = 'https://en.wikipedia.org/wiki/Mejillones';

function right(kind, status, note, evidence) {
  return {
    kind,
    status,
    authorize: status === 'authorized' || status === 'assumed',
    note,
    ...(evidence ? { evidence } : {}),
  };
}

function material(substance, kg, phase = 'solid') {
  return {
    kind: 'material',
    mol: { [substance]: kg * 1000 / SUBSTANCES[substance].molarMassG },
    phase,
    T_C: 25,
    P_bar: 1,
  };
}

function createFloatGlassCase() {
  const sandKg = GLASS_KG_PER_DAY * SAND_KG_PER_KG * FEED_MARGIN;
  const sodaKg = GLASS_KG_PER_DAY * SODA_KG_PER_KG * FEED_MARGIN;
  const limestoneKg = GLASS_KG_PER_DAY * LIMESTONE_KG_PER_KG * FEED_MARGIN;
  const kWhPerDay = GLASS_KG_PER_DAY * SEC_GLASS;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const sand = material('SiO2', sandKg);
  const sodaAsh = material('Na2CO3', sodaKg);
  const limestone = material('CaCO3', limestoneKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'sand-feed', unit: 'material-source', sourcePreset: 'silica-sand', params: { stream: sand }, economics: tea.bindCost('silica-sand') },
        { id: 'soda-feed', unit: 'material-source', sourcePreset: 'soda-ash', params: { stream: sodaAsh }, economics: tea.bindCost('soda-ash') },
        { id: 'limestone-feed', unit: 'material-source', sourcePreset: 'limestone', params: { stream: limestone }, economics: tea.bindCost('limestone') },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'float-glass',
          unit: 'float-glass',
          capacity: GLASS_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_GLASS },
          economics: tea.bindCapexPack('float-glass', { capacity: GLASS_KG_PER_DAY, region: REGION }),
        },
        { id: 'glass', unit: 'material-sink', economics: tea.bindSale('float-glass', { region: REGION }) },
        { id: 'process-co2', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'sand-feed', port: 'out' }, to: { node: 'float-glass', port: 'sand' } },
        { from: { node: 'soda-feed', port: 'out' }, to: { node: 'float-glass', port: 'sodaAsh' } },
        { from: { node: 'limestone-feed', port: 'out' }, to: { node: 'float-glass', port: 'limestone' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'float-glass', port: 'electricity' } },
        { from: { node: 'float-glass', port: 'glass' }, to: { node: 'glass', port: 'in' } },
        { from: { node: 'float-glass', port: 'carbonDioxide' }, to: { node: 'process-co2', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { 'float-glass': GLASS_KG_PER_DAY },
      priorities: { 'power-bus': ['float-glass'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('sand-feed').siteResource = 'silica-sand';
  node('soda-feed').siteResource = 'soda-ash';
  node('limestone-feed').siteResource = 'limestone';
  definition.site = {
    id: 'chile-mejillones-float-glass',
    name: 'Mejillones, Antofagasta, Chile',
    latitude: -23.1,
    longitude: -70.448,
    region: REGION,
    solarKWp,
    dailyPVKWhPerKWp: DAILY_PV_ED,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'literature-estimate',
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to 1000 kg glass/day × 2.5 kWh/kg total-energy-as-electricity with 2% margin. No electricity purchase. Not a SEN interconnection or port lease.',
      },
      'silica-sand': {
        stream: clone(node('sand-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased industrial silica sand assumed available at screening $0.04/kg (USGS MCS 2026 industrial sand 2025e $36/t). Not a glass-sand contract and not silicon-grade quartzite.',
      },
      'soda-ash': {
        stream: clone(node('soda-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased soda ash assumed available at screening $0.15/kg (USGS MCS 2026 2025e $150/t f.o.b.). Not a Solvay/trona contract.',
      },
      limestone: {
        stream: clone(node('limestone-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased carbonate stone (GfE limestone+dolomite folded) assumed available at screening $0.02/kg (USGS crushed stone 2025e $18.50/t). Not a chemical-lime contract.',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-21',
      cite: {
        label: 'PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.1, −70.448); frozen data/pvgis-mejillones.json E_y 1923.52, totals.fixed E_d 5.27',
        url: PVGIS_URL,
      },
      notes: 'Frozen PVGIS-ERA5 totals.fixed E_d 5.27 kWh/kWp·day and E_y 1923.52 kWh/kWp from data/pvgis-mejillones.json. Not a plant pyranometer.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to the float-glass SEC proxy.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      sandPurchase: right('purchase', 'assumed', 'Purchased industrial silica sand assumed available at screening $0.04/kg; not a glass-sand contract', [
        { label: 'USGS MCS 2026 sand and gravel (industrial) — 2025e $36/t; screening purchase, not a contract', url: USGS_SAND_IND },
      ]),
      sodaPurchase: right('purchase', 'assumed', 'Purchased soda ash assumed available at screening $0.15/kg; not a Solvay/trona contract', [
        { label: 'USGS MCS 2026 soda ash — 2025e f.o.b. $150/t; screening purchase, not a contract', url: USGS_SODA_ASH },
      ]),
      limestonePurchase: right('purchase', 'assumed', 'Purchased carbonate stone assumed available at screening $0.02/kg; GfE limestone+dolomite folded, not a lime contract', [
        { label: 'USGS MCS 2026 stone (crushed) — 2025e $18.50/t; screening purchase, not a contract', url: USGS_STONE },
      ]),
    },
    evidence: [
      { label: 'Mejillones geography', url: MEJILLONES_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.1, −70.448); annual E_y 1923.52 kWh/kWp, totals.fixed E_d 5.27', url: PVGIS_URL },
      { label: 'Glass for Europe — Life Cycle Assessment of Float Glass (2011; Table 1 sand 0.65 / soda 0.20 / limestone+dolomite 0.21 kg/kg; energy 9.0 MJ/kg)', url: GFE_FLOAT_LCA },
      { label: 'Burrows & Fthenakis 2015 — Glass needs for a growing photovoltaics industry (float plant $150–200M / 500–700 t/day)', url: BURROWS_PV_GLASS },
      { label: 'Fraunhofer ISE Photovoltaics Report (solar-glass mass share; screening sale $0.45/kg)', url: FRAUNHOFER_PV_REPORT },
      { label: 'USGS MCS 2026 industrial sand — 2025e $36/t', url: USGS_SAND_IND },
      { label: 'USGS MCS 2026 soda ash — 2025e $150/t', url: USGS_SODA_ASH },
      { label: 'USGS MCS 2026 crushed stone — 2025e $18.50/t', url: USGS_STONE },
    ],
    notes: 'Purchased silica sand + soda ash + limestone (dolomite folded into limestone as GfE carbonate 0.21 kg/kg) → screening float/solar glass at the Mejillones map point. Not a full float line (tin bath / lehr / coating YAGNI). SEC 2.5 kWh/kg is an electricity-as-total-energy proxy for GfE 9.0 MJ/kg (NG 6.1 + HFO 2.1 + grid 0.80); real float is heat-dominated. CO2 is the three-feed mass remainder 0.06 kg/kg, vented; GfE 0.70 kg CO2/kg includes fuel carbon which is not emitted because energy is the electricity proxy. Cullet/feldspar/sulfate omitted. Sale is the existing solar-glass screening $0.45/kg — the PV-module purchased-glass cost is not retuned. Cash sign whatever falls out. Not bankable. Chile CAPEX× 1.05.',
  };
  return definition;
}

return { createFloatGlassCase };
});
