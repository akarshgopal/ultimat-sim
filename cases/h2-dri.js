(function exposeH2DriCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.H2DriCase = api;
})(globalThis, (model, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const DAILY_PV_ED = 5.27;
const FE_KG_PER_DAY = 1000;
const SEC_DRI = 0.7;
const FEED_MARGIN = 1.05;
const REGION = 'Atacama/Chile';
const USGS_IRON_ORE = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-ore.pdf';
const USGS_STEEL = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-steel.pdf';
const IEA_H2 = 'https://www.iea.org/reports/global-hydrogen-review-2024';
const DOE_H2 = 'https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis';
const WB_PINK = 'https://www.worldbank.org/en/research/commodity-markets';
const MEJILLONES_URL = 'https://en.wikipedia.org/wiki/Mejillones';
const NS_TRUCK_RATES = 'https://novascotia.ca/tran/publications/asphalt/Truck_Haul_Rates_2024.pdf';
const UNCTAD_TRANSPORT = 'https://unctad.org/publication/trade-and-transport-dataset';
const WB_FREIGHT_LOGISTICS = 'https://documents1.worldbank.org/curated/en/620801468168857019/pdf/558370PUB0cost1C0disclosed071221101.pdf';

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

function createH2DriCase() {
  const oreKg = FE_KG_PER_DAY * 0.5 * SUBSTANCES.Fe2O3.molarMassG / SUBSTANCES.Fe.molarMassG * FEED_MARGIN;
  const hydrogenKg = FE_KG_PER_DAY * 1.5 * SUBSTANCES.H2.molarMassG / SUBSTANCES.Fe.molarMassG * FEED_MARGIN;
  const kWhPerDay = FE_KG_PER_DAY * SEC_DRI;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const hematite = material('Fe2O3', oreKg);
  const hydrogen = material('H2', hydrogenKg, 'gas');
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'iron-ore', unit: 'material-source', sourcePreset: 'ironOre', params: { stream: hematite }, economics: tea.bindCost('iron-ore', { freight: 'inland-truck-short' }) },
        { id: 'hydrogen-feed', unit: 'material-source', sourcePreset: 'hydrogen', params: { stream: hydrogen }, economics: tea.bindCost('hydrogen-feed', { freight: 'chile-coast-container' }) },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'dri',
          unit: 'hydrogen-dri',
          capacity: FE_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_DRI },
          economics: tea.bindCapexPack('hydrogen-dri', { capacity: FE_KG_PER_DAY, region: REGION }),
        },
        { id: 'steel', unit: 'material-sink', economics: tea.bindSale('steel', { region: REGION, freight: 'bulk-dry-shortsea' }) },
        { id: 'process-water', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'iron-ore', port: 'out' }, to: { node: 'dri', port: 'ironOre' } },
        { from: { node: 'hydrogen-feed', port: 'out' }, to: { node: 'dri', port: 'hydrogen' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'dri', port: 'electricity' } },
        { from: { node: 'dri', port: 'steel' }, to: { node: 'steel', port: 'in' } },
        { from: { node: 'dri', port: 'water' }, to: { node: 'process-water', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { dri: FE_KG_PER_DAY },
      priorities: { 'power-bus': ['dri'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('iron-ore').siteResource = 'ironOre';
  node('hydrogen-feed').siteResource = 'hydrogen';
  definition.site = {
    id: 'chile-mejillones-h2-dri',
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to 1000 kg Fe/day × 0.7 kWh/kg shaft electricity with 2% margin. No electricity purchase. Not a SEN interconnection or port lease.',
      },
      ironOre: {
        stream: clone(node('iron-ore').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased hematite (Fe₂O₃) assumed available at screening $0.10/kg plant-gate plus screening inland-truck-short freight $0.01/kg (~$10/t; ~50–100 km gravel/bulk family). Not a mine-haul quote, not a carrier contract, and not a distance/GIS model. FEED_MARGIN 1.05 on the stoich 0.5 mol Fe₂O₃ / mol Fe. Not a mine contract or port lease.',
      },
      hydrogen: {
        stream: clone(node('hydrogen-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased industrial/grey–blue H₂ assumed available at screening $2.00/kg plant-gate plus screening chile-coast-container freight $0.08/kg (~$80/t; UNCTAD/WB container family; not a Maersk quote, not a tube-trailer/pipeline quote, and not a carrier contract). FEED_MARGIN 1.05 on the stoich 1.5 mol H₂ / mol Fe. Not an electrolyzer path and not a DOE $1/kg goal.',
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
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to the DRI shaft SEC.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      ironOrePurchase: right('purchase', 'assumed', 'Purchased hematite assumed available at screening $0.10/kg plus screening inland-truck-short freight $0.01/kg; not a mine-haul quote, not a mine contract or port lease', [
        { label: 'USGS MCS 2025 iron ore (commodity context, not a mine contract)', url: USGS_IRON_ORE },
        { label: 'Nova Scotia Public Works Truck Rates for Haulage of Bulk Material, Table 1 Standard Gravel Tonne KM Rates, effective Feb 1, 2024 (screening inland-truck-short $0.01/kg; not a mine-haul quote)', url: NS_TRUCK_RATES },
      ]),
      hydrogenPurchase: right('purchase', 'assumed', 'Purchased industrial/grey–blue H₂ assumed available at screening $2.00/kg plus screening chile-coast-container freight $0.08/kg; not an electrolyzer path, not a tube-trailer/pipeline quote', [
        { label: 'IEA Global Hydrogen Review 2024 (industrial/grey–blue family; screening purchase, not green LCOH)', url: IEA_H2 },
        { label: 'UNCTAD Trade-and-Transport Dataset (maritime freight family; screening container OOM $80/t, not a voyage quote)', url: UNCTAD_TRANSPORT },
        { label: 'World Bank freight logistics (family cite; screening, not a carrier contract)', url: WB_FREIGHT_LOGISTICS },
      ]),
    },
    evidence: [
      { label: 'Mejillones industrial geography', url: MEJILLONES_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly; annual E_y 1923.52 kWh/kWp, E_d 5.27', url: PVGIS_URL },
      { label: 'USGS MCS 2025 iron ore (hematite feed family; screening $0.10/kg of ~$80–120/t)', url: USGS_IRON_ORE },
      { label: 'Nova Scotia Public Works Truck Rates for Haulage of Bulk Material, Table 1 Standard Gravel Tonne KM Rates, effective Feb 1, 2024 (screening inland-truck-short $0.01/kg on iron-ore; not a mine-haul quote)', url: NS_TRUCK_RATES },
      { label: 'USGS MCS 2025 iron and steel (HBI/DRI family; screening $0.40/kg of ~$350–450/t)', url: USGS_STEEL },
      { label: 'World Bank commodity markets / pink sheet (metals family; screening HBI/DRI mid, not a Platts contract)', url: WB_PINK },
      { label: 'IEA Global Hydrogen Review 2024 (industrial/grey–blue H₂ family; screening purchase $2.00/kg)', url: IEA_H2 },
      { label: 'DOE hydrogen production electrolysis (family contrast only; this demo is purchased H₂, not an electrolyzer)', url: DOE_H2 },
      { label: 'UNCTAD Trade-and-Transport Dataset (maritime freight family; screening container OOM $80/t, not a voyage quote)', url: UNCTAD_TRANSPORT },
      { label: 'UNCTAD Trade-and-Transport Dataset (bulk/short-sea family; screening ~$30/t, not a voyage quote)', url: UNCTAD_TRANSPORT },
      { label: 'World Bank freight logistics (family cite; screening, not a carrier contract)', url: WB_FREIGHT_LOGISTICS },
    ],
    notes: 'Purchased hematite + purchased H₂ → screening DRI Fe at Mejillones. Stoich 0.5 Fe₂O₃ + 1.5 H₂ → Fe + 1.5 H₂O with FEED_MARGIN 1.05 on purchases. Not an electrolyzer/green-H₂ path. SEC 0.7 kWh/kg is shaft electricity only. Purchased iron-ore carries screening inland-truck-short freight $0.01/kg (~$10/t short-haul gravel/bulk family; not a mine-haul quote, not a carrier contract, and not a distance/GIS model). Purchased H₂ carries screening chile-coast-container freight $0.08/kg (~$80/t; UNCTAD/WB container family; not a Maersk quote, not a tube-trailer/pipeline quote, and not a carrier contract). Sale is screening HBI/DRI $0.40/kg plant-gate, net of screening bulk-dry-shortsea freight $0.03/kg (UNCTAD/WB bulk short-sea family; DRI/HBI ships as dry bulk, same band as cement/urea/float-glass offtake; not a voyage quote; screening FOB vs landed). Not a logistics model. Chile CAPEX× 1.05 unchanged. Cash sign whatever falls out. Not Midrex. Not EAF. Not bankable. Chile CAPEX× 1.05 applies to the DRI island and solar.',
  };
  return definition;
}

return { createH2DriCase };
});
