(function exposeH2DriCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening,
    typeof require === 'function' ? require('./_shared.js') : root.CaseShared
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.H2DriCase = api;
})(globalThis, (model, tea, shared) => {
const { SUBSTANCES } = model;
const { MEJILLONES_URL, projectEconomics, right, nodeFinder, clone, solarPowerNode, powerToBusEdge } = shared;
const material = (substance, kg, phase = 'solid') => shared.material(substance, kg, phase);
const PVGIS_URL = shared.MEJILLONES_PVGIS_URL;
const DAILY_PV_ED = 5.27;
const FE_KG_PER_DAY = 1000;
const SEC_DRI = 0.7;
const FEED_MARGIN = 1.05;
// DR-grade pellets: 67.5% Fe (Fe₂O₃ 96.5%, gangue 3.5% as SiO₂ proxy). The pellet plant fires
// purchased pellet-feed concentrate at SEC_PELLET kWh/kg (induration heat as a total-energy proxy
// + balling/fans/conveying); see engine/units.js pelletPlant and TeaScreening 'pellet-plant'.
const PELLET_FE_FRACTION = 0.675;
const SEC_PELLET = 0.14;
const REGION = 'Atacama/Chile';
const USGS_IRON_ORE = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-ore.pdf';
const SR_PFS = 'https://www.stockwatch.com/News/Item/Z-C!SR-3523298/C/SR?fmt=orig';
const USGS_STEEL = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-steel.pdf';
const IEA_H2 = 'https://www.iea.org/reports/global-hydrogen-review-2024';
const DOE_H2 = 'https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis';
const WB_PINK = 'https://www.worldbank.org/en/research/commodity-markets';
const NS_TRUCK_RATES = 'https://novascotia.ca/tran/publications/asphalt/Truck_Haul_Rates_2024.pdf';
const UNCTAD_TRANSPORT = 'https://unctad.org/publication/trade-and-transport-dataset';
const WB_FREIGHT_LOGISTICS = 'https://documents1.worldbank.org/curated/en/620801468168857019/pdf/558370PUB0cost1C0disclosed071221101.pdf';

function createH2DriCase() {
  const fe2o3Kg = FE_KG_PER_DAY * 0.5 * SUBSTANCES.Fe2O3.molarMassG / SUBSTANCES.Fe.molarMassG;
  const fe2o3Fraction = PELLET_FE_FRACTION * SUBSTANCES.Fe2O3.molarMassG / (2 * SUBSTANCES.Fe.molarMassG);
  const pelletKg = fe2o3Kg / fe2o3Fraction;
  const oreKg = pelletKg * FEED_MARGIN;
  const hydrogenKg = FE_KG_PER_DAY * 1.5 * SUBSTANCES.H2.molarMassG / SUBSTANCES.Fe.molarMassG * FEED_MARGIN;
  const kWhPerDay = FE_KG_PER_DAY * SEC_DRI + pelletKg * SEC_PELLET;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const concentrate = {
    kind: 'material', phase: 'solid', T_C: 25, P_bar: 1,
    mol: {
      Fe2O3: oreKg * fe2o3Fraction * 1000 / SUBSTANCES.Fe2O3.molarMassG,
      SiO2: oreKg * (1 - fe2o3Fraction) * 1000 / SUBSTANCES.SiO2.molarMassG,
    },
  };
  const hydrogen = material('H2', hydrogenKg, 'gas');
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: projectEconomics(),
    graph: {
      nodes: [
        { id: 'iron-ore', unit: 'material-source', sourcePreset: 'ironOre', params: { stream: concentrate }, economics: tea.bindCost('iron-ore', { freight: 'inland-truck-short' }) },
        { id: 'hydrogen-feed', unit: 'material-source', sourcePreset: 'hydrogen', params: { stream: hydrogen }, economics: tea.bindCost('hydrogen-feed', { freight: 'chile-coast-container' }) },
        solarPowerNode(power, solarKWp, REGION),
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'pellet-plant',
          unit: 'pellet-plant',
          capacity: pelletKg,
          params: { electricityKWhPerKg: SEC_PELLET },
          economics: tea.bindCapexPack('pellet-plant', { capacity: pelletKg, region: REGION }),
        },
        { id: 'pellet-gangue', unit: 'material-sink', economics: { disposition: 'vent' } },
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
        { from: { node: 'iron-ore', port: 'out' }, to: { node: 'pellet-plant', port: 'concentrate' } },
        { from: { node: 'pellet-plant', port: 'pellets' }, to: { node: 'dri', port: 'ironOre' } },
        { from: { node: 'pellet-plant', port: 'gangue' }, to: { node: 'pellet-gangue', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'pellet-plant', port: 'electricity' } },
        { from: { node: 'hydrogen-feed', port: 'out' }, to: { node: 'dri', port: 'hydrogen' } },
        powerToBusEdge(),
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'dri', port: 'electricity' } },
        { from: { node: 'dri', port: 'steel' }, to: { node: 'steel', port: 'in' } },
        { from: { node: 'dri', port: 'water' }, to: { node: 'process-water', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { dri: FE_KG_PER_DAY, 'pellet-plant': pelletKg },
      priorities: { 'power-bus': ['pellet-plant', 'dri'] },
    },
  };
  const node = nodeFinder(definition);
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to 1000 kg Fe/day × (0.7 kWh/kg shaft electricity + 1.48 kg pellets × 0.14 kWh/kg pellet plant) with 2% margin. No electricity purchase. Not a SEN interconnection or port lease.',
      },
      ironOre: {
        stream: clone(node('iron-ore').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased DR-grade pellet-feed concentrate (67.5% Fe; Fe₂O₃ + 3.5% gangue as SiO₂ proxy; magnetite mass-proxied as Fe₂O₃) at screening $0.13/kg plant-gate plus screening inland-truck-short freight $0.01/kg (~$140/t delivered: 62% Fe index ~$100/dmt + DR-grade premium ~$35/dmt, Strategic Resources Port Saguenay PFS 2024). Fired in an on-site pellet plant (balling + straight-grate induration, 0.14 kWh/kg pellets) to 1.48 kg DR pellets per kg Fe. Not a mine-haul quote, not a carrier contract, and not a distance/GIS model. FEED_MARGIN 1.05 on the concentrate. Not a mine contract or port lease.',
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
      ironOrePurchase: right('purchase', 'assumed', 'Purchased DR-grade pellet-feed concentrate assumed available at screening $0.13/kg plus screening inland-truck-short freight $0.01/kg; not a mine-haul quote, not a mine contract or port lease', [
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
      { label: 'USGS MCS 2025 iron ore (concentrate feed family; 62% Fe index ~$99–112/t)', url: USGS_IRON_ORE },
      { label: 'Strategic Resources Port Saguenay DR pellet PFS (Mar 2024): concentrate at 62% index $100 + DR-grade premium $35/dmt; 4 Mdmt/y pellet plant US$470M; conversion $16.31/dmt (screening $0.13/kg concentrate and the pellet-plant pack)', url: SR_PFS },
      { label: 'Nova Scotia Public Works Truck Rates for Haulage of Bulk Material, Table 1 Standard Gravel Tonne KM Rates, effective Feb 1, 2024 (screening inland-truck-short $0.01/kg on iron-ore; not a mine-haul quote)', url: NS_TRUCK_RATES },
      { label: 'USGS MCS 2025 iron and steel (HBI/DRI family; screening $0.40/kg of ~$350–450/t)', url: USGS_STEEL },
      { label: 'World Bank commodity markets / pink sheet (metals family; screening HBI/DRI mid, not a Platts contract)', url: WB_PINK },
      { label: 'IEA Global Hydrogen Review 2024 (industrial/grey–blue H₂ family; screening purchase $2.00/kg)', url: IEA_H2 },
      { label: 'DOE hydrogen production electrolysis (family contrast only; this demo is purchased H₂, not an electrolyzer)', url: DOE_H2 },
      { label: 'UNCTAD Trade-and-Transport Dataset (maritime freight family; screening container OOM $80/t, not a voyage quote)', url: UNCTAD_TRANSPORT },
      { label: 'UNCTAD Trade-and-Transport Dataset (bulk/short-sea family; screening ~$30/t, not a voyage quote)', url: UNCTAD_TRANSPORT },
      { label: 'World Bank freight logistics (family cite; screening, not a carrier contract)', url: WB_FREIGHT_LOGISTICS },
    ],
    notes: 'Purchased concentrate → on-site DR pellets + purchased H₂ → screening DRI Fe at Mejillones. Stoich 0.5 Fe₂O₃ + 1.5 H₂ → Fe + 1.5 H₂O; 1.48 kg pellets (67.5% Fe) per kg Fe; FEED_MARGIN 1.05 on purchases. Not an electrolyzer/green-H₂ path. Ore is purchased DR-grade pellet-feed concentrate ($0.13/kg + $0.01 freight) fired to 67.5% Fe DR pellets in an on-site pellet plant (0.14 kWh/kg pellets as a total-energy proxy; gangue split to a vented sink only because the shaft takes pure Fe₂O₃ — physically it reports to EAF slag). SEC 0.7 kWh/kg is shaft electricity only. Purchased iron-ore carries screening inland-truck-short freight $0.01/kg (~$10/t short-haul gravel/bulk family; not a mine-haul quote, not a carrier contract, and not a distance/GIS model). Purchased H₂ carries screening chile-coast-container freight $0.08/kg (~$80/t; UNCTAD/WB container family; not a Maersk quote, not a tube-trailer/pipeline quote, and not a carrier contract). Sale is screening HBI/DRI $0.40/kg plant-gate, net of screening bulk-dry-shortsea freight $0.03/kg (UNCTAD/WB bulk short-sea family; DRI/HBI ships as dry bulk, same band as cement/urea/float-glass offtake; not a voyage quote; screening FOB vs landed). Not a logistics model. Chile CAPEX× 1.05 unchanged. Cash sign whatever falls out. Not Midrex. Not EAF. Not bankable. Chile CAPEX× 1.05 applies to the DRI island and solar.',
  };
  return definition;
}

return { createH2DriCase };
});
