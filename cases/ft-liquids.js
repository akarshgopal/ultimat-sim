(function exposeFtLiquidsCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FtLiquidsCase = api;
})(globalThis, (model, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const DAILY_PV_ED = 5.27;
const DIESEL_KG_PER_DAY = 1000;
const SEC_FT = 0.22;
const FEED_MARGIN = 1.05;
const REGION = 'Atacama/Chile';
const IEA_H2_FUTURE = 'https://www.iea.org/reports/the-future-of-hydrogen';
const IEA_H2_FUTURE_ANNEX = 'https://iea.blob.core.windows.net/assets/29b027e5-fefc-47df-aed0-456b1bb38844/IEA-The-Future-of-Hydrogen-Assumptions-Annex_CORR.pdf';
const IEA_H2 = 'https://www.iea.org/reports/global-hydrogen-review-2024';
const IEA_DAC = 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary';
const EIA_DIESEL = 'https://www.eia.gov/petroleum/gasdiesel/';
const WB_PINK = 'https://www.worldbank.org/en/research/commodity-markets';
const IPCC_FUEL_NCV = 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_1_Ch1_Introduction.pdf';
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

function material(substance, kg, phase) {
  return {
    kind: 'material',
    mol: { [substance]: kg * 1000 / SUBSTANCES[substance].molarMassG },
    phase,
    T_C: 25,
    P_bar: 1,
  };
}

function createFtLiquidsCase() {
  const dieselKg = DIESEL_KG_PER_DAY;
  const hydrogenKg = dieselKg * FEED_MARGIN * 37 * SUBSTANCES.H2.molarMassG / SUBSTANCES.C12H26.molarMassG;
  const co2Kg = dieselKg * FEED_MARGIN * 12 * SUBSTANCES.CO2.molarMassG / SUBSTANCES.C12H26.molarMassG;
  const kWhPerDay = dieselKg * SEC_FT;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const hydrogen = material('H2', hydrogenKg, 'gas');
  const carbonDioxide = material('CO2', co2Kg, 'gas');
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'hydrogen-feed', unit: 'material-source', sourcePreset: 'hydrogen', params: { stream: hydrogen }, economics: tea.bindCost('hydrogen-feed', { freight: 'chile-coast-container' }) },
        { id: 'co2-feed', unit: 'material-source', sourcePreset: 'co2', params: { stream: carbonDioxide }, economics: tea.bindCost('co2-feed', { freight: 'chile-coast-container' }) },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'ft-liquids',
          unit: 'ft-liquids',
          capacity: DIESEL_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_FT },
          economics: tea.bindCapexPack('ft-liquids', { capacity: DIESEL_KG_PER_DAY, region: REGION }),
        },
        { id: 'diesel-product', unit: 'material-sink', economics: tea.bindSale('diesel', { region: REGION, freight: 'chile-coast-container' }) },
        { id: 'process-water', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'hydrogen-feed', port: 'out' }, to: { node: 'ft-liquids', port: 'hydrogen' } },
        { from: { node: 'co2-feed', port: 'out' }, to: { node: 'ft-liquids', port: 'co2' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'ft-liquids', port: 'electricity' } },
        { from: { node: 'ft-liquids', port: 'diesel' }, to: { node: 'diesel-product', port: 'in' } },
        { from: { node: 'ft-liquids', port: 'water' }, to: { node: 'process-water', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { 'ft-liquids': DIESEL_KG_PER_DAY },
      priorities: { 'power-bus': ['ft-liquids'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('hydrogen-feed').siteResource = 'hydrogen';
  node('co2-feed').siteResource = 'co2';
  definition.site = {
    id: 'chile-mejillones-ft-liquids',
    name: 'Mejillones, Chile',
    latitude: -23.1,
    longitude: -70.448,
    region: REGION,
    solarKWp,
    dailyPVKWhPerKWp: DAILY_PV_ED,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'literature-estimate',
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to 1000 kg diesel/day × 0.22 kWh/kg with 2% margin. No electricity purchase. Not a SING interconnection or Mejillones port lease.',
      },
      hydrogen: {
        stream: clone(node('hydrogen-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased industrial/grey–blue H₂ assumed available at screening $2.00/kg plant-gate plus screening chile-coast-container freight $0.08/kg (~$80/t; not a Maersk quote). Not an electrolyzer path and not a DOE $1/kg goal.',
      },
      co2: {
        stream: clone(node('co2-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased industrial CO₂ assumed available at screening $0.05/kg plant-gate plus screening chile-coast-container freight $0.08/kg (~$80/t; not a Maersk quote). RWGS is folded into the FT island (not a standalone RWGS unit and not DAC).',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-14',
      cite: {
        label: 'PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.100, −70.448); frozen data/pvgis-mejillones.json E_y 1923.52, totals.fixed E_d 5.27',
        url: PVGIS_URL,
      },
      notes: 'Frozen PVGIS-ERA5 totals.fixed E_d 5.27 kWh/kWp·day and E_y 1923.52 kWh/kWp from data/pvgis-mejillones.json, retrieved 2026-09-14. Not a plant pyranometer.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to the FT-island SEC proxy.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      hydrogenPurchase: right('purchase', 'assumed', 'Purchased industrial/grey–blue H₂ assumed available at screening $2.00/kg; not an electrolyzer path', [
        { label: 'IEA Global Hydrogen Review 2024 (industrial/grey–blue family; screening purchase, not green LCOH)', url: IEA_H2 },
      ]),
      co2Purchase: right('purchase', 'assumed', 'Purchased industrial CO₂ assumed available at screening $0.05/kg; RWGS is folded into the island, not DAC', [
        { label: 'IEA Direct Air Capture 2022 (family contrast; this purchase is industrial CO₂, not DAC full chain)', url: IEA_DAC },
      ]),
    },
    evidence: [
      { label: 'Mejillones geography', url: MEJILLONES_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.100, −70.448); annual E_y 1923.52 kWh/kWp, totals.fixed E_d 5.27', url: PVGIS_URL },
      { label: 'IEA The Future of Hydrogen (2019) — FT synthesis family; CAPEX 890 USD/kW_liquid in the assumptions annex', url: IEA_H2_FUTURE },
      { label: 'IEA G20 Hydrogen assumptions annex (corr. Dec 2020) — FT CAPEX 890 USD2017/kW_liquid, electricity 0.018 GJe/GJliquid', url: IEA_H2_FUTURE_ANNEX },
      { label: 'IPCC 2006 Guidelines Vol. 2 Table 1.2 — gas/diesel oil NCV 43.0 TJ/Gg (kW_liquid → kg/day conversion)', url: IPCC_FUEL_NCV },
      { label: 'EIA gasoline and diesel fuel update (commodity-band context; screening diesel $0.90/kg, not a contract)', url: EIA_DIESEL },
      { label: 'World Bank commodity markets / pink sheet (gasoil family; screening mid, not a contract)', url: WB_PINK },
      { label: 'IEA Global Hydrogen Review 2024 (H₂ purchase at screening $2.00/kg; not green LCOH)', url: IEA_H2 },
    ],
    notes: 'Purchased H₂ + purchased industrial CO₂ → screening diesel/syncrude proxy (n=12 paraffin C₁₂H₂₆) at the Mejillones map point. Overall stoich 12 CO₂ + 37 H₂ → C₁₂H₂₆ + 24 H₂O folds RWGS into the island; not a standalone RWGS unit, not DAC, not an electrolyzer path, not a full FT slate. SEC 0.22 kWh/kg is IEA 0.018 GJe/GJliquid × 43.0 MJ/kg (electricity of the FT island; real FT is heat/H₂ dominated). Sale is screening diesel $0.90/kg plant-gate, net of screening chile-coast-container freight $0.08/kg (not a Maersk quote; screening FOB vs landed). Purchased H₂ and industrial CO₂ carry screening chile-coast-container freight $0.08/kg. Not a logistics model. Cash sign whatever falls out. Not bankable. Not a green e-diesel premium. Atacama/Chile CAPEX× 1.05 on ft-liquids island + solar-pv unchanged.',
  };
  return definition;
}

return { createFtLiquidsCase };
});
