(function exposeTiKrollCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TiKrollCase = api;
})(globalThis, (model, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const DAILY_PV_ED = 5.27;
const TI_KG_PER_DAY = 100;
const SEC_KROLL = 8;
const FEED_MARGIN = 1.05;
const REGION = 'Atacama/Chile';
const USGS_TI = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-titanium.pdf';
const USGS_TI_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-titanium.pdf';
const USGS_MG_METAL = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-magnesium-metal.pdf';
const USGS_MG_METAL_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-magnesium-metal.pdf';
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

function createTiKrollCase() {
  const ticl4Kg = TI_KG_PER_DAY * SUBSTANCES.TiCl4.molarMassG / SUBSTANCES.Ti.molarMassG * FEED_MARGIN;
  const magnesiumKg = TI_KG_PER_DAY * 2 * SUBSTANCES.Mg.molarMassG / SUBSTANCES.Ti.molarMassG * FEED_MARGIN;
  const kWhPerDay = TI_KG_PER_DAY * SEC_KROLL;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const ticl4 = material('TiCl4', ticl4Kg, 'liquid');
  const magnesium = material('Mg', magnesiumKg, 'solid');
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'ticl4-feed', unit: 'material-source', sourcePreset: 'titaniumTetrachloride', params: { stream: ticl4 }, economics: tea.bindCost('titanium-tetrachloride') },
        { id: 'magnesium-feed', unit: 'material-source', sourcePreset: 'magnesium', params: { stream: magnesium }, economics: tea.bindCost('magnesium-metal') },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'kroll',
          unit: 'titanium-kroll',
          capacity: TI_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_KROLL },
          economics: tea.bindCapexPack('titanium-kroll', { capacity: TI_KG_PER_DAY, region: REGION }),
        },
        { id: 'titanium', unit: 'material-sink', economics: tea.bindSale('titanium', { region: REGION }) },
        { id: 'magnesium-chloride', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'ticl4-feed', port: 'out' }, to: { node: 'kroll', port: 'titaniumTetrachloride' } },
        { from: { node: 'magnesium-feed', port: 'out' }, to: { node: 'kroll', port: 'magnesium' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'kroll', port: 'electricity' } },
        { from: { node: 'kroll', port: 'titanium' }, to: { node: 'titanium', port: 'in' } },
        { from: { node: 'kroll', port: 'magnesiumChloride' }, to: { node: 'magnesium-chloride', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { kroll: TI_KG_PER_DAY },
      priorities: { 'power-bus': ['kroll'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('ticl4-feed').siteResource = 'titaniumTetrachloride';
  node('magnesium-feed').siteResource = 'magnesium';
  definition.site = {
    id: 'chile-mejillones-ti-kroll',
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to 100 kg Ti/day × 8 kWh/kg process electricity with 2% margin. No electricity purchase. Not a SEN interconnection or port lease.',
      },
      titaniumTetrachloride: {
        stream: clone(node('ticl4-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased TiCl₄ assumed available at screening $1.50/kg plant-gate. FEED_MARGIN 1.05 on the stoich 1 mol TiCl₄ / mol Ti. Not a chloride-process plant from rutile.',
      },
      magnesium: {
        stream: clone(node('magnesium-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased Mg metal assumed available at screening $2.50/kg. FEED_MARGIN 1.05 on the stoich 2 mol Mg / mol Ti. Not brine Mg-compound and not an Mg recycle electrolysis cell.',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-14',
      cite: {
        label: 'PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.100, −70.448); frozen data/pvgis-mejillones.json E_y 1923.52, E_d 5.27',
        url: PVGIS_URL,
      },
      notes: 'Frozen PVGIS-ERA5 totals.fixed E_d 5.27 kWh/kWp·day and E_y 1923.52 kWh/kWp from data/pvgis-mejillones.json, retrieved 2026-09-14. Not a plant-measured irradiance series.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to the Kroll SEC.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      ticl4Purchase: right('purchase', 'assumed', 'Purchased TiCl₄ assumed available at screening $1.50/kg; not a chloride-process plant or port lease', [
        { label: 'USGS MCS 2025 titanium (commodity context, not a TiCl₄ contract)', url: USGS_TI },
      ]),
      magnesiumPurchase: right('purchase', 'assumed', 'Purchased Mg metal assumed available at screening $2.50/kg; not brine Mg-compound and not an Mg recycle cell', [
        { label: 'USGS MCS 2026 magnesium metal (European free market family; screening purchase, not a US Magnesium contract)', url: USGS_MG_METAL_2026 },
      ]),
    },
    evidence: [
      { label: 'Mejillones industrial geography', url: MEJILLONES_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly; annual E_y 1923.52 kWh/kWp, E_d 5.27', url: PVGIS_URL },
      { label: 'USGS MCS 2025 titanium (sponge family; screening $8.00/kg of ~$6–12/kg, not a TIMET contract)', url: USGS_TI },
      { label: 'USGS MCS 2026 titanium (sponge US import unit-value family; screening, not a plant quote)', url: USGS_TI_2026 },
      { label: 'USGS MCS 2026 magnesium metal (European free market 2025e ~$2,500/t; Kroll reductant, not brine compound)', url: USGS_MG_METAL_2026 },
      { label: 'USGS MCS 2025 magnesium metal (family; screening metal purchase)', url: USGS_MG_METAL },
    ],
    notes: 'Purchased TiCl₄ + purchased Mg metal → screening Kroll Ti at Mejillones. Stoich TiCl₄ + 2 Mg → Ti + 2 MgCl₂ with FEED_MARGIN 1.05 on purchases. MgCl₂ vented, no credit this tranche. Not a chloride rutile train. Not an Mg recycle electrolysis cell. SEC 8 kWh/kg is process electricity with purchased feeds. Cash sign whatever falls out. Not TIMET. Not bankable. Chile CAPEX× 1.05 applies to the Kroll island and solar.',
  };
  return definition;
}

return { createTiKrollCase };
});
