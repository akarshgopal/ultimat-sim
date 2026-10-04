(function exposeBioforgeCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BioforgeCase = api;
})(globalThis, (model, tea) => {
const { SUBSTANCES } = model;
const GLUCONIC_KG_PER_DAY = 1000;
const FEED_MARGIN = 1.02;
const SEC = 0.05;
const REGION = 'US Midwest';
const EPA_GREEN = 'https://www.epa.gov/greenchemistry/green-chemistry-challenge-2023-greener-synthetic-pathways-award';
const DOE_EA = 'https://www.energy.gov/nepa/doeea-2246-solugen-inc-bioforge-marshall-project-marshall-minnesota';
const DOE_EA_PDF = 'https://www.energy.gov/sites/default/files/2024-03/Solugen%20LPO%20EA_FONSI_Signed.pdf';
const CEN = 'https://cen.acs.org/business/biobased-chemicals/Solugen-expand-biobased-chemical-production/101/web/2023/11';
const VOGELBUSCH = 'https://www.vogelbusch-biocommodities.com/en/technology/electrification/mvr-evaporation/';
const TRIDGE = 'https://dir.tridge.com/prices/dextrose/US';
const INDEXBOX = 'https://www.indexbox.io/blog/hydrogen-peroxide-united-states-market-overview-2024-3/';
const OPENPR = 'https://www.openpr.com/news/4394627/track-gluconic-acid-price-index-historical-and-forecast';
const ADM = 'https://www.adm.com/en-us/news/news-releases/2024/4/solugen-breaks-ground-on-bioforge-marshall-facility-bolstering-u-s.--biomanufacturing-capabilities/';
const DOE_LPO = 'https://solugen.com/blog/2024/06/13/solugen-secures-conditional-commitment-for-213-6m-doe-loan-guarantee-bolstering-u-s-leadership-in-green-manufacturing-and-domestic-chemical-production/';

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

function createBioforgeCase() {
  const dextroseKg = GLUCONIC_KG_PER_DAY * SUBSTANCES.C6H12O6.molarMassG / SUBSTANCES.C6H12O7.molarMassG * FEED_MARGIN;
  const oxygenKg = GLUCONIC_KG_PER_DAY * SUBSTANCES.O2.molarMassG / SUBSTANCES.C6H12O7.molarMassG * FEED_MARGIN;
  const waterKg = GLUCONIC_KG_PER_DAY * SUBSTANCES.H2O.molarMassG / SUBSTANCES.C6H12O7.molarMassG * FEED_MARGIN;
  const electricityKWh = GLUCONIC_KG_PER_DAY * SEC * FEED_MARGIN;
  const dextrose = material('C6H12O6', dextroseKg, 'solid');
  const oxygen = material('O2', oxygenKg, 'gas');
  const water = material('H2O', waterKg, 'liquid');
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'dextrose', unit: 'material-source', sourcePreset: 'dextrose', params: { stream: dextrose }, economics: tea.bindCost('dextrose') },
        { id: 'water', unit: 'material-source', sourcePreset: 'water', params: { stream: water }, economics: tea.bindCost('water') },
        {
          id: 'oxygen',
          unit: 'material-source',
          sourcePreset: 'oxygen',
          params: { stream: oxygen },
          economics: {
            quality: 'screening',
            note: 'Air-derived screening pure O2 stand-in. ASU not modeled; N2 ballast omitted. Not charged from costs/prices oxygen.',
          },
        },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCost('power', { region: REGION }) },
        { id: 'electrical-bus', unit: 'electrical-bus' },
        {
          id: 'bioforge',
          unit: 'bioforge',
          capacity: GLUCONIC_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC },
          economics: tea.bindCapexPack('bioforge', { capacity: GLUCONIC_KG_PER_DAY, region: REGION }),
        },
        { id: 'gluconic', unit: 'material-sink', economics: tea.bindSale('gluconic', { region: REGION }) },
        { id: 'hydrogenPeroxide', unit: 'material-sink', economics: tea.bindSale('hydrogen-peroxide', { region: REGION }) },
      ],
      edges: [
        { from: { node: 'dextrose', port: 'out' }, to: { node: 'bioforge', port: 'dextrose' } },
        { from: { node: 'water', port: 'out' }, to: { node: 'bioforge', port: 'water' } },
        { from: { node: 'oxygen', port: 'out' }, to: { node: 'bioforge', port: 'oxygen' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'electrical-bus', port: 'in' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'bioforge', port: 'electricity' } },
        { from: { node: 'bioforge', port: 'gluconic' }, to: { node: 'gluconic', port: 'in' } },
        { from: { node: 'bioforge', port: 'hydrogenPeroxide' }, to: { node: 'hydrogenPeroxide', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { bioforge: GLUCONIC_KG_PER_DAY },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('dextrose').siteResource = 'dextrose';
  node('water').siteResource = 'water';
  node('oxygen').siteResource = 'oxygen';
  definition.site = {
    id: 'us-marshall',
    name: 'Marshall, Minnesota, USA',
    latitude: 44.447,
    longitude: -95.788,
    region: REGION,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'screening',
        evidence: 'Purchased electricity-source at Texas/US industrial overlay $0.06/kWh via US Midwest → texas alias. Not an Xcel tariff, not a Minnesota location factor, and not a utility interconnection.',
      },
      dextrose: {
        stream: clone(node('dextrose').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased dextrose assumed available at Tridge US 2024 export low $0.84/kg; not an ADM contract or Midwest plant-gate.',
      },
      water: {
        stream: clone(node('water').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased process water assumed available at screening $0.001/kg; not a municipal or concession tariff.',
      },
      oxygen: {
        stream: clone(node('oxygen').params.stream),
        quality: 'user-assumption',
        evidence: 'Air-derived screening pure-O2 stand-in. ASU not modeled; N2 ballast omitted. Not charged.',
      },
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; power is a purchased electricity-source, not a utility interconnection. Not an Xcel tariff.', [
        { label: 'DOE EA-2246 Bioforge Marshall (context, not an interconnection)', url: DOE_EA },
      ]),
      brineConcession: right('concession', 'unverified', 'Not the Bioforge plot and not a concession. Marshall map point only.', [
        { label: 'DOE EA-2246 Bioforge Marshall (geography context, not a concession)', url: DOE_EA },
      ]),
      dextrosePurchase: right('purchase', 'assumed', 'Purchased dextrose assumed available; not an ADM contract', [
        { label: 'Tridge US 2024 dextrose export low (screening purchase, not an ADM contract)', url: TRIDGE },
      ]),
      oxygenAssumed: right('purchase', 'assumed', 'Oxygen assumed as air-derived pure-O2 stand-in; ASU not modeled, N2 ballast omitted', [
        { label: 'EPA Green Chemistry 2023 Greener Synthetic Pathways — Solugen Bioforge (stoich context, not an ASU)', url: EPA_GREEN },
      ]),
    },
    evidence: [
      { label: 'EPA Green Chemistry Challenge 2023 — Greener Synthetic Pathways Award (Solugen Bioforge)', url: EPA_GREEN },
      { label: 'DOE EA-2246 Solugen Inc. Bioforge Marshall Project, Marshall, Minnesota', url: DOE_EA },
      { label: 'DOE LPO EA/FONSI PDF — Bioforge Marshall', url: DOE_EA_PDF },
      { label: 'C&EN 8 Nov 2023 — Solugen expand biobased chemical production; $90M / 75 kta floor', url: CEN },
      { label: 'Vogelbusch MVR evaporation — bioprocess electrification table (SEC family, not a Solugen meter)', url: VOGELBUSCH },
      { label: 'Tridge US dextrose export prices (2024 low $0.84/kg)', url: TRIDGE },
      { label: 'IndexBox US 2024 hydrogen peroxide average export price $674/t', url: INDEXBOX },
      { label: 'OpenPR / ChemAnalyst China Q1 2025 gluconic acid average USD 515/MT', url: OPENPR },
      { label: 'ADM Apr 2024 Bioforge Marshall groundbreaking (up to 120 kta; no new dollar figure)', url: ADM },
      { label: 'DOE LPO $213.6M conditional commitment — loan guarantee, not installed CAPEX', url: DOE_LPO },
    ],
    notes: 'Screening GOx: C6H12O6 + O2 + H2O → C6H12O7 + H2O2 at 1 t gluconic/day. SEC 0.05 kWh/kg is Vogelbusch MVR-family evaporation-order electricity (not a Solugen meter; unpublished enzyme-reactor load omitted). CAPEX $438/(kg/day) from C&EN $90M / 75 kta floor — not the $213.6M DOE loan as TIC. Dextrose $0.84/kg export low; gluconic $0.515/kg Asia spot; H2O2 $0.674/kg US export average. US Midwest aliases to texas: industrial power $0.06/kWh and CAPEX× 1.0 — not an Xcel tariff and not a Minnesota location factor. Marshall map point is not the plant. Glucaric not modeled (no public mol split). Enzyme consumable omitted (no public g/kg or $/kg). Cash may be negative. Not an ADM contract, not bankable.',
  };
  return definition;
}

return { createBioforgeCase };
});
