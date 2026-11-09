(function exposeGreenH2DriCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/atacama-pacific-seawater.js') : root.AtacamaPacificSeawater,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening,
    typeof require === 'function' ? require('./_shared.js') : root.CaseShared
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GreenH2DriCase = api;
})(globalThis, (model, assay, tea, shared) => {
const { SUBSTANCES } = model;
const { MEJILLONES_URL, projectEconomics, streamFromAssay, right, nodeFinder, clone, solarPowerNode, powerToBusEdge } = shared;
const PVGIS_URL = shared.MEJILLONES_PVGIS_URL;
const DAILY_PV_ED = 5.27;
const FE_KG_PER_DAY = 1000;
const SEC_DRI = 0.7;
const SEC_H2 = 52;
const SEC_SWRO = 3.5;
const FEED_MARGIN = 1.05;
// DR-grade pellets: 67.5% Fe (Fe₂O₃ 96.5%, gangue 3.5% as SiO₂ proxy). The pellet plant fires
// purchased pellet-feed concentrate at SEC_PELLET kWh/kg (induration heat as a total-energy proxy
// + balling/fans/conveying); see engine/units.js pelletPlant and TeaScreening 'pellet-plant'.
const PELLET_FE_FRACTION = 0.675;
const SEC_PELLET = 0.14;
const RECOVERY = 0.45;
const PRODUCT_DENSITY_KG_M3 = 1000;
const FEED_DENSITY_KG_M3 = assay.density_kg_per_L * 1000;
const REGION = 'Atacama/Chile';
const USGS_IRON_ORE = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-ore.pdf';
const SR_PFS = 'https://www.stockwatch.com/News/Item/Z-C!SR-3523298/C/SR?fmt=orig';
const USGS_STEEL = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-iron-steel.pdf';
const IEA_H2 = 'https://www.iea.org/reports/global-hydrogen-review-2024';
const DOE_H2 = 'https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis';
const WB_PINK = 'https://www.worldbank.org/en/research/commodity-markets';
const MILLERO_URL = 'https://doi.org/10.1016/j.dsr.2007.10.001';
const WOA_URL = 'https://doi.org/10.25923/70qt-9574';
const UNCTAD_TRANSPORT = 'https://unctad.org/publication/trade-and-transport-dataset';
const WB_FREIGHT_LOGISTICS = 'https://documents1.worldbank.org/curated/en/620801468168857019/pdf/558370PUB0cost1C0disclosed071221101.pdf';
const LINDE_LOX_TANKER = 'https://static.prd.echannel.linde.com/wcsstore/SE_REN_Industrial_Gas_Store/pdf/Prislista_Flytande_gaser_Industri_2024_01.pdf';

function createGreenH2DriCase() {
  const fe2o3Kg = FE_KG_PER_DAY * 0.5 * SUBSTANCES.Fe2O3.molarMassG / SUBSTANCES.Fe.molarMassG;
  const fe2o3Fraction = PELLET_FE_FRACTION * SUBSTANCES.Fe2O3.molarMassG / (2 * SUBSTANCES.Fe.molarMassG);
  const pelletKg = fe2o3Kg / fe2o3Fraction;
  const oreKg = pelletKg * FEED_MARGIN;
  const h2Kg = FE_KG_PER_DAY * 1.5 * SUBSTANCES.H2.molarMassG / SUBSTANCES.Fe.molarMassG;
  const waterKg = h2Kg * SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
  const swroProductM3 = waterKg / PRODUCT_DENSITY_KG_M3 * FEED_MARGIN;
  const feedM3 = swroProductM3 / RECOVERY;
  const seawaterKg = feedM3 * FEED_DENSITY_KG_M3;
  const kWhPerDay = h2Kg * SEC_H2 + swroProductM3 * SEC_SWRO + FE_KG_PER_DAY * SEC_DRI + pelletKg * SEC_PELLET;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const concentrate = {
    kind: 'material', phase: 'solid', T_C: 25, P_bar: 1,
    mol: {
      Fe2O3: oreKg * fe2o3Fraction * 1000 / SUBSTANCES.Fe2O3.molarMassG,
      SiO2: oreKg * (1 - fe2o3Fraction) * 1000 / SUBSTANCES.SiO2.molarMassG,
    },
  };
  const seawater = streamFromAssay(assay, seawaterKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const seawaterCost = tea.costs && tea.costs.seawater
    ? tea.bindCost('seawater', { region: REGION })
    : { unitCost: 0 };
  const definition = {
    economics: projectEconomics(),
    graph: {
      nodes: [
        { id: 'iron-ore', unit: 'material-source', sourcePreset: 'ironOre', params: { stream: concentrate }, economics: tea.bindCost('iron-ore', { region: REGION, freight: 'inland-truck-short' }) },
        { id: 'seawater', unit: 'material-source', sourcePreset: 'seawater', params: { stream: seawater }, economics: seawaterCost },
        solarPowerNode(power, solarKWp, REGION),
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'swro',
          unit: 'swro',
          capacity: swroProductM3,
          params: { recovery: RECOVERY, secKWhPerM3: SEC_SWRO, feedDensityKgM3: FEED_DENSITY_KG_M3, productDensityKgM3: PRODUCT_DENSITY_KG_M3 },
          economics: tea.bindCapexPack('swro', { capacity: swroProductM3, region: REGION }),
        },
        {
          id: 'electrolyzer',
          unit: 'electrolyzer',
          capacity: h2Kg,
          params: { secKWhPerKgH2: SEC_H2 },
          economics: tea.bindCapexPack('electrolyzer', { capacity: h2Kg, region: REGION }),
        },
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
        { id: 'electrolyzer-oxygen', unit: 'material-sink', economics: tea.bindSale('oxygen', { region: REGION, freight: 'cryo-tanker-short' }) },
        { id: 'brine', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waterReject', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'process-water', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'iron-ore', port: 'out' }, to: { node: 'pellet-plant', port: 'concentrate' } },
        { from: { node: 'pellet-plant', port: 'pellets' }, to: { node: 'dri', port: 'ironOre' } },
        { from: { node: 'pellet-plant', port: 'gangue' }, to: { node: 'pellet-gangue', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'pellet-plant', port: 'electricity' } },
        { from: { node: 'seawater', port: 'out' }, to: { node: 'swro', port: 'feed' } },
        { from: { node: 'swro', port: 'product' }, to: { node: 'electrolyzer', port: 'water' } },
        { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'dri', port: 'hydrogen' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'electrolyzer-oxygen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'waterReject', port: 'in' } },
        { from: { node: 'dri', port: 'steel' }, to: { node: 'steel', port: 'in' } },
        { from: { node: 'dri', port: 'water' }, to: { node: 'process-water', port: 'in' } },
        powerToBusEdge(),
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'dri', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
      ],
    },
    operation: {
      setpoints: { electrolyzer: h2Kg, dri: FE_KG_PER_DAY, swro: swroProductM3, 'pellet-plant': pelletKg },
      priorities: { 'power-bus': ['electrolyzer', 'pellet-plant', 'dri', 'swro'] },
    },
  };
  const node = nodeFinder(definition);
  node('power').siteResource = 'electricity';
  node('iron-ore').siteResource = 'ironOre';
  node('seawater').siteResource = 'seawater';
  definition.site = {
    id: 'chile-mejillones-green-h2-dri',
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to SWRO 3.5 kWh/m³ + electrolyzer 52 kWh/kg H₂ + DRI shaft 0.7 kWh/kg Fe + pellet plant 0.14 kWh/kg pellets with 2% margin. No electricity purchase. Not a SEN interconnection or port lease.',
      },
      ironOre: {
        stream: clone(node('iron-ore').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased DR-grade pellet-feed concentrate (67.5% Fe; Fe₂O₃ + 3.5% gangue as SiO₂ proxy; magnetite mass-proxied as Fe₂O₃) at screening $0.13/kg plant-gate plus screening inland-truck-short freight $0.01/kg (~$140/t delivered: 62% Fe index ~$100/dmt + DR-grade premium ~$35/dmt, Strategic Resources Port Saguenay PFS 2024). Fired in an on-site pellet plant (balling + straight-grate induration, 0.14 kWh/kg pellets) to 1.48 kg DR pellets per kg Fe. Not a mine-haul quote, not a carrier contract, and not a distance/GIS model. FEED_MARGIN 1.05 on the concentrate. Not a mine contract or port lease.',
      },
      seawater: {
        stream: clone(node('seawater').params.stream),
        quality: 'cited',
        evidence: 'SE Pacific / Atacama coast multi-ion assay from frozen data/atacama-pacific-seawater.js (Millero/Pilson S=35 scaled 34.9/35). Basin typical, not a Mejillones intake permit sample.',
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
    assay: {
      kind: 'seawater',
      assayId: 'atacama-pacific-seawater',
      density_kg_per_L: assay.density_kg_per_L,
      summary: 'SE Pacific / Atacama coast ~34.9 g/kg, Millero/Pilson S=35 majors scaled 34.9/35; multi-ion, not a NaCl proxy or Mejillones intake sample',
      quality: 'cited',
      salinity_g_per_kg: assay.salinity_g_per_kg,
      evidence: Array.isArray(assay.evidence) ? assay.evidence.map(item => ({ ...item })) : [],
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to SWRO + PEM + DRI shaft.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      ironOrePurchase: right('purchase', 'assumed', 'Purchased DR-grade pellet-feed concentrate assumed available at screening $0.13/kg plus screening inland-truck-short freight $0.01/kg; not a mine-haul quote, not a mine contract or port lease', [
        { label: 'USGS MCS 2025 iron ore (commodity context, not a mine contract)', url: USGS_IRON_ORE },
        { label: 'Nova Scotia Public Works Truck Rates for Haulage of Bulk Material, Table 1 Standard Gravel Tonne KM Rates, effective Feb 1, 2024 (screening inland-truck-short $0.01/kg; not a mine-haul quote)', url: 'https://novascotia.ca/tran/publications/asphalt/Truck_Haul_Rates_2024.pdf' },
      ]),
      seawaterIntake: right('intake', 'assumed', 'Pacific access is a screening assumption, not a Mejillones intake permit', [
        { label: 'Millero et al. 2008 assay context for the assumed intake volume', url: MILLERO_URL },
      ]),
      seawaterDischarge: right('discharge', 'assumed', 'Assumed so the screening cash gate can run; no Pacific outfall permit is on file', [
        { label: 'Wikipedia: Mejillones (context, not an outfall permit)', url: MEJILLONES_URL },
      ]),
    },
    evidence: [
      { label: 'Mejillones industrial geography', url: MEJILLONES_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly; annual E_y 1923.52 kWh/kWp, E_d 5.27', url: PVGIS_URL },
      { label: 'USGS MCS 2025 iron ore (concentrate feed family; 62% Fe index ~$99–112/t)', url: USGS_IRON_ORE },
      { label: 'Strategic Resources Port Saguenay DR pellet PFS (Mar 2024): concentrate at 62% index $100 + DR-grade premium $35/dmt; 4 Mdmt/y pellet plant US$470M; conversion $16.31/dmt (screening $0.13/kg concentrate and the pellet-plant pack)', url: SR_PFS },
      { label: 'Nova Scotia Public Works Truck Rates for Haulage of Bulk Material, Table 1 Standard Gravel Tonne KM Rates, effective Feb 1, 2024 (screening inland-truck-short $0.01/kg on iron-ore; not a mine-haul quote)', url: 'https://novascotia.ca/tran/publications/asphalt/Truck_Haul_Rates_2024.pdf' },
      { label: 'USGS MCS 2025 iron and steel (HBI/DRI family; screening $0.40/kg of ~$350–450/t)', url: USGS_STEEL },
      { label: 'World Bank commodity markets / pink sheet (metals family; screening HBI/DRI mid, not a Platts contract)', url: WB_PINK },
      { label: 'UNCTAD Trade-and-Transport Dataset (bulk/short-sea family; screening ~$30/t, not a voyage quote)', url: UNCTAD_TRANSPORT },
      { label: 'World Bank freight logistics (family cite; screening, not a carrier contract)', url: WB_FREIGHT_LOGISTICS },
      { label: 'Linde Gas AB (Sweden), Flytande gaser, industri price list valid 1 Jan 2024 (cryogenic tanker 0–100 km 0.86 SEK/kg; screening cryo-tanker-short $0.08/kg on electrolyzer O₂; not a pipeline)', url: LINDE_LOX_TANKER },
      { label: 'Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)', url: MILLERO_URL },
      { label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)', url: WOA_URL },
      { label: 'IEA Global Hydrogen Review 2024 (electrolytic H₂ family context; this demo is on-site PEM, not a purchased grey/blue H₂ contract)', url: IEA_H2 },
      { label: 'DOE hydrogen production electrolysis (PEM/alkaline family; screening 52 kWh/kg H₂, not a vendor meter)', url: DOE_H2 },
    ],
    notes: 'On-site SWRO + PEM H₂ → screening DRI Fe at Mejillones. Not purchased grey/blue H₂ (that remains cases/h2-dri.js). Stoich 0.5 Fe₂O₃ + 1.5 H₂ → Fe + 1.5 H₂O, same as hydrogen-dri. Ore is purchased DR-grade pellet-feed concentrate ($0.13/kg + $0.01 freight) fired to 67.5% Fe DR pellets in an on-site pellet plant (0.14 kWh/kg pellets as a total-energy proxy; gangue split to a vented sink only because the shaft takes pure Fe₂O₃ — physically it reports to EAF slag). SEC 0.7 kWh/kg is shaft electricity only; electrolyzer 52 kWh/kg H₂ dominates energy. Purchased iron-ore carries screening inland-truck-short freight $0.01/kg (~$10/t short-haul gravel/bulk family; not a mine-haul quote, not a carrier contract, and not a distance/GIS model). Sale is screening HBI/DRI $0.40/kg plant-gate, net of screening bulk-dry-shortsea freight $0.03/kg (UNCTAD/WB bulk short-sea family; DRI/HBI ships as dry bulk, same band as cement/urea/float-glass offtake; not a voyage quote; screening FOB vs landed). Seawater intake stays plant-gate (local intake). Electrolyzer O₂ sale nets plant-gate $0.05/kg minus screening cryo-tanker-short $0.08/kg (Linde Sweden 2024 0–100 km 0.86 SEK/kg; ~157 t/y sits in the 15–200 t/y band). Honesty: freight exceeds the plant-gate O₂ price so O₂ offtake nets ≈ −$0.03/kg (a real operator would likely vent or find an over-the-fence buyer); liquefaction not modeled; not a pipeline. Not a logistics model. Chile CAPEX× 1.05 unchanged. Cash sign whatever falls out. Not Midrex. Not EAF. Not bankable. Sell O₂ at screening $0.05/kg. No green-steel premium.',
  };
  return definition;
}

return { createGreenH2DriCase };
});
