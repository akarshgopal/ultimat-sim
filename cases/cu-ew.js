(function exposeCuEwCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CuEwCase = api;
})(globalThis, (model, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const DAILY_PV_ED = 5.27;
const CATHODE_KG_PER_DAY = 1000;
const SEC_CU_EW = 2.2;
const PLS_KG_PER_KG = 1.0;
const FEED_MARGIN = 1.05;
const REGION = 'Atacama/Chile';
const USGS_COPPER = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-copper.pdf';
const SANTA_CRUZ_PFS_2026 = 'https://www.sec.gov/Archives/edgar/data/1879016/000110465926109810/tm2625798d1_ex99-1.htm';
const MARIMACA_DFS_2025 = 'https://marimaca.com/wp-content/uploads/2026/07/25-10-09-Marimaca-Oxide-Deposit-NI-43-101-Technical-Report-Feasibility-Study_FINAL.pdf';
const EL_PILAR_FS_2022 = 'https://www.sec.gov/Archives/edgar/data/1001838/000155837022002995/scco-20211231ex9692df9bd.pdf';
const GUNNISON_PEA_2024 = 'https://minedocs.com/27/Gunnison-PEA-11012024.pdf';
const CU_EW_SEC_PRACTICE = 'https://pressbooks.bccampus.ca/hydrometallurgy/chapter/copper-electrowinning-practice/';
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

function material(substance, kg, phase = 'liquid') {
  return {
    kind: 'material',
    mol: { [substance]: kg * 1000 / SUBSTANCES[substance].molarMassG },
    phase,
    T_C: 25,
    P_bar: 1,
  };
}

function createCuEwCase() {
  const plsKg = CATHODE_KG_PER_DAY * PLS_KG_PER_KG * FEED_MARGIN;
  const kWhPerDay = CATHODE_KG_PER_DAY * SEC_CU_EW;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const pls = material('Cu', plsKg, 'liquid');
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'pls-feed', unit: 'material-source', sourcePreset: 'pls-copper', params: { stream: pls }, economics: tea.bindCost('pls-copper') },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'copper-ew',
          unit: 'copper-ew',
          capacity: CATHODE_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_CU_EW },
          economics: tea.bindCapexPack('copper-ew', { capacity: CATHODE_KG_PER_DAY, region: REGION }),
        },
        { id: 'cathode-product', unit: 'material-sink', economics: tea.bindSale('copper-cathode', { region: REGION }) },
      ],
      edges: [
        { from: { node: 'pls-feed', port: 'out' }, to: { node: 'copper-ew', port: 'pls' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'copper-ew', port: 'electricity' } },
        { from: { node: 'copper-ew', port: 'cathode' }, to: { node: 'cathode-product', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { 'copper-ew': CATHODE_KG_PER_DAY },
      priorities: { 'power-bus': ['copper-ew'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('pls-feed').siteResource = 'pls-copper';
  definition.site = {
    id: 'chile-mejillones-cu-ew',
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to 1000 kg cathode/day × 2.2 kWh/kg EW+SX island electricity with 2% margin. No electricity purchase. Not a SEN interconnection or port lease.',
      },
      'pls-copper': {
        stream: clone(node('pls-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased contained copper in pregnant leach solution at 96.5% of USGS MCS 2026 LME grade A cash 2025e $9.70/kg → $9.36/kg. Ore/PLS payable basis, not a TC/RC smelter ticket and not a heap-ore FOB.',
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
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to the SX-EW SEC.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      plsPurchase: right('purchase', 'assumed', 'Purchased contained Cu in PLS assumed available at 96.5% of USGS LME 2025e; not a heap concession', [
        { label: 'USGS MCS 2026 copper — LME grade A cash 2025e 440 ¢/lb; 96.5% payable on contained Cu in PLS, not a contract', url: USGS_COPPER },
      ]),
    },
    evidence: [
      { label: 'Mejillones geography', url: MEJILLONES_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.1, −70.448); annual E_y 1923.52 kWh/kWp, totals.fixed E_d 5.27', url: PVGIS_URL },
      { label: 'USGS MCS 2026 copper — LME grade A cash 2025e 440 ¢/lb', url: USGS_COPPER },
      { label: 'Ivanhoe Electric Santa Cruz S-K 1300 PFS 2026 — SX/EW $132M / 76 kt/y cathode', url: SANTA_CRUZ_PFS_2026 },
      { label: 'Marimaca Oxide Deposit NI 43-101 DFS 2025 — SX/TF/EW $121M / 50 kt/y cathode', url: MARIMACA_DFS_2025 },
      { label: 'Southern Copper El Pilar S-K 1300 FS 2022 — SX+TF+EW $75.6M / 31,752 t/y', url: EL_PILAR_FS_2022 },
      { label: 'Gunnison Open Pit PEA 2024 (M3) — SX-EW plant $145M / 175 Mlb/y', url: GUNNISON_PEA_2024 },
      { label: 'Copper electrowinning practice — typical 1900–2000 kWh/t Cu', url: CU_EW_SEC_PRACTICE },
    ],
    notes: 'Purchased contained copper in pregnant leach solution → LME-grade cathode at the Mejillones map point. Heap leach, mine, and pad are out of scope; the island is SX-EW only (PLS in, cathode out). Faraday Cu²⁺ + 2e⁻ → Cu; acid regenerates to raffinate (inventory, not a sale). O₂ unlabeled. Mass 1.00 kg contained Cu / kg cathode. SEC 2.2 kWh/kg is industrial EW+SX island electricity (Jenkins ~1.9–2.0; industrial 1.8–2.5; Marimaca SX/TF/EW 2.28), not a heat-as-electricity proxy. Pack $750/(kg Cu/day) mid of published SX-EW plant line items (~$630–880). Sale is USGS MCS 2026 LME grade A cash 2025e $9.70/kg; PLS payable 96.5% of that band. Cash sign whatever falls out. Not bankable. Chile CAPEX× 1.05.',
  };
  return definition;
}

return { createCuEwCase };
});
