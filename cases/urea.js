(function exposeUreaCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UreaCase = api;
})(globalThis, (model, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-22.957&lon=14.505&peakpower=1&loss=14&angle=23&aspect=-179&raddatabase=PVGIS-ERA5&outputformat=json';
const DAILY_PV_ED = 5.48;
const UREA_KG_PER_DAY = 1000;
const SEC_UREA = 0.8;
const REGION = 'Southern Africa';
const IEA_NH3 = 'https://www.iea.org/reports/ammonia-technology-roadmap';
const USGS_N = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-nitrogen.pdf';
const WB_PINK = 'https://www.worldbank.org/en/research/commodity-markets';
const WALVIS_URL = 'https://en.wikipedia.org/wiki/Walvis_Bay';

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

function createUreaCase() {
  const ureaKg = UREA_KG_PER_DAY;
  const nh3Kg = ureaKg * 2 * SUBSTANCES.NH3.molarMassG / SUBSTANCES.Urea.molarMassG;
  const co2Kg = ureaKg * SUBSTANCES.CO2.molarMassG / SUBSTANCES.Urea.molarMassG;
  const kWhPerDay = ureaKg * SEC_UREA;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const ammonia = material('NH3', nh3Kg, 'liquid');
  const carbonDioxide = material('CO2', co2Kg, 'gas');
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'ammonia-feed', unit: 'material-source', sourcePreset: 'ammonia', params: { stream: ammonia }, economics: tea.bindCost('ammonia-feed', { freight: 'chile-coast-container' }) },
        { id: 'co2-feed', unit: 'material-source', sourcePreset: 'co2', params: { stream: carbonDioxide }, economics: tea.bindCost('co2-feed', { freight: 'chile-coast-container' }) },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'urea',
          unit: 'urea',
          capacity: UREA_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_UREA },
          economics: tea.bindCapexPack('urea', { capacity: UREA_KG_PER_DAY, region: REGION }),
        },
        { id: 'urea-product', unit: 'material-sink', economics: tea.bindSale('urea', { region: REGION, freight: 'bulk-dry-shortsea' }) },
        { id: 'process-water', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'ammonia-feed', port: 'out' }, to: { node: 'urea', port: 'ammonia' } },
        { from: { node: 'co2-feed', port: 'out' }, to: { node: 'urea', port: 'carbonDioxide' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'urea', port: 'electricity' } },
        { from: { node: 'urea', port: 'urea' }, to: { node: 'urea-product', port: 'in' } },
        { from: { node: 'urea', port: 'water' }, to: { node: 'process-water', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { urea: UREA_KG_PER_DAY },
      priorities: { 'power-bus': ['urea'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('ammonia-feed').siteResource = 'ammonia';
  node('co2-feed').siteResource = 'co2';
  definition.site = {
    id: 'namibia-walvis-bay-urea',
    name: 'Walvis Bay, Namibia',
    latitude: -22.957,
    longitude: 14.505,
    region: REGION,
    solarKWp,
    dailyPVKWhPerKWp: DAILY_PV_ED,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'literature-estimate',
        evidence: 'PVGIS-ERA5 annual average 5.48 kWh/kWp·day (E_y 2000.67 from frozen data/pvgis-walvis-bay.json) × array sized to 1000 kg urea/day × 0.8 kWh/kg with 2% margin. No electricity purchase. Not a NamPower interconnection or Namport lease.',
      },
      ammonia: {
        stream: clone(node('ammonia-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased fertilizer NH₃ assumed available at screening $0.45/kg plant-gate plus screening chile-coast-container freight $0.08/kg (~$80/t; not a Maersk quote). chile-coast-container is the existing container family band (not a Chile-origin claim for Walvis). Not a green-NH₃ electrolyzer path and not a fertilizer contract.',
      },
      co2: {
        stream: clone(node('co2-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased industrial CO₂ assumed available at screening $0.05/kg plant-gate plus screening chile-coast-container freight $0.08/kg (~$80/t; not a Maersk quote). chile-coast-container is the existing container family band (not a Chile-origin claim for Walvis). Not DAC full chain and not a merchant-gas contract.',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-21',
      cite: {
        label: 'PVGIS-ERA5, 2005–2023 monthly at Walvis Bay (−22.957, 14.505); frozen data/pvgis-walvis-bay.json E_y 2000.67, totals.fixed E_d 5.48',
        url: PVGIS_URL,
      },
      notes: 'Frozen PVGIS-ERA5 totals.fixed E_d 5.48 kWh/kWp·day and E_y 2000.67 kWh/kWp from data/pvgis-walvis-bay.json, retrieved 2026-09-21. Not a plant pyranometer and not Mejillones/Dead Sea.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to the urea SEC proxy.', [
        { label: 'Wikipedia: Walvis Bay (context, not an interconnection)', url: WALVIS_URL },
      ]),
      ammoniaPurchase: right('purchase', 'assumed', 'Purchased NH₃ assumed available at fertilizer screening $0.45/kg; not a green-NH₃ path and not a contract', [
        { label: 'IEA Ammonia Technology Roadmap (fertilizer-market order; screening purchase, not a contract)', url: IEA_NH3 },
      ]),
      co2Purchase: right('purchase', 'assumed', 'Purchased industrial CO₂ assumed available at screening $0.05/kg; not DAC full chain', [
        { label: 'IEA Direct Air Capture 2022 (family contrast only; this purchase is industrial CO₂, not DAC)', url: 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary' },
      ]),
    },
    evidence: [
      { label: 'Walvis Bay geography', url: WALVIS_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at Walvis Bay (−22.957, 14.505); annual E_y 2000.67 kWh/kWp, totals.fixed E_d 5.48', url: PVGIS_URL },
      { label: 'IEA Ammonia Technology Roadmap (ammonia/fertilizer family; screening urea $0.40/kg and NH₃-feed $0.45/kg)', url: IEA_NH3 },
      { label: 'USGS MCS 2025 nitrogen (fixed) — fertilizer-family context', url: USGS_N },
      { label: 'World Bank commodity markets / pink sheet (urea family ~$350–450/t; screening mid $0.40/kg, not a Black Sea contract)', url: WB_PINK },
    ],
    notes: 'Purchased NH₃+CO₂ → screening urea at the Walvis map point. Not the green-NH₃ electrolyzer path (that demo stays separate). Overall stoich 2 NH₃ + CO₂ → urea + H₂O only; not carbamate recycle and not granulation. SEC 0.8 kWh/kg is an electricity-as-total-energy proxy for a steam-heavy plant (real urea is heat-dominated). Sale is screening urea $0.40/kg plant-gate, net of screening bulk-dry-shortsea freight $0.03/kg (bulk fertilizer offtake OOM; not a Namport quote; screening FOB vs landed). Purchased fertilizer NH₃ and industrial CO₂ carry screening chile-coast-container freight $0.08/kg (existing container family band; not a Chile-origin claim for Walvis). Not a logistics model. Cash sign whatever falls out. Not bankable. Southern Africa CAPEX× 0.95 unchanged.',
  };
  return definition;
}

return { createUreaCase };
});
