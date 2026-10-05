(function exposeGreenFtCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/atacama-pacific-seawater.js') : root.AtacamaPacificSeawater,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GreenFtCase = api;
})(globalThis, (model, assay, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const DAILY_PV_ED = 5.27;
const DIESEL_KG_PER_DAY = 1000;
const SEC_FT = 0.22;
const SEC_H2 = 52;
const SEC_SWRO = 3.5;
const FEED_MARGIN = 1.05;
const RECOVERY = 0.45;
const PRODUCT_DENSITY_KG_M3 = 1000;
const FEED_DENSITY_KG_M3 = assay.density_kg_per_L * 1000;
const REGION = 'Atacama/Chile';
const IEA_H2_FUTURE = 'https://www.iea.org/reports/the-future-of-hydrogen';
const IEA_H2_FUTURE_ANNEX = 'https://iea.blob.core.windows.net/assets/29b027e5-fefc-47df-aed0-456b1bb38844/IEA-The-Future-of-Hydrogen-Assumptions-Annex_CORR.pdf';
const IEA_H2 = 'https://www.iea.org/reports/global-hydrogen-review-2024';
const IEA_DAC = 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary';
const DOE_H2 = 'https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis';
const EIA_DIESEL = 'https://www.eia.gov/petroleum/gasdiesel/';
const WB_PINK = 'https://www.worldbank.org/en/research/commodity-markets';
const IPCC_FUEL_NCV = 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_1_Ch1_Introduction.pdf';
const MEJILLONES_URL = 'https://en.wikipedia.org/wiki/Mejillones';
const MILLERO_URL = 'https://doi.org/10.1016/j.dsr.2007.10.001';
const WOA_URL = 'https://doi.org/10.25923/70qt-9574';

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

function seawaterFromAssay(seawaterAssay, massKg) {
  const gPerKg = seawaterAssay.ions_g_per_kg;
  const molPerKg = seawaterAssay.mol_per_kg;
  const saltMassKg = Object.values(gPerKg).reduce((sum, grams) => sum + grams, 0) / 1000 * massKg;
  const mol = {
    H2O: (massKg - saltMassKg) * 1000 / SUBSTANCES.H2O.molarMassG,
  };
  for (const [id, amount] of Object.entries(molPerKg)) mol[id] = amount * massKg;
  return { kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1, mol };
}

function createGreenFtCase() {
  const dieselKg = DIESEL_KG_PER_DAY;
  const h2Kg = dieselKg * 37 * SUBSTANCES.H2.molarMassG / SUBSTANCES.C12H26.molarMassG;
  const co2Kg = dieselKg * FEED_MARGIN * 12 * SUBSTANCES.CO2.molarMassG / SUBSTANCES.C12H26.molarMassG;
  const waterKg = h2Kg * SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
  const swroProductM3 = waterKg / PRODUCT_DENSITY_KG_M3 * FEED_MARGIN;
  const feedM3 = swroProductM3 / RECOVERY;
  const seawaterKg = feedM3 * FEED_DENSITY_KG_M3;
  const kWhPerDay = h2Kg * SEC_H2 + swroProductM3 * SEC_SWRO + dieselKg * SEC_FT;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const carbonDioxide = material('CO2', co2Kg, 'gas');
  const seawater = seawaterFromAssay(assay, seawaterKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const seawaterCost = tea.costs && tea.costs.seawater
    ? tea.bindCost('seawater', { region: REGION })
    : { unitCost: 0 };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'co2-feed', unit: 'material-source', sourcePreset: 'co2', params: { stream: carbonDioxide }, economics: tea.bindCost('co2-feed', { freight: 'chile-coast-container' }) },
        { id: 'seawater', unit: 'material-source', sourcePreset: 'seawater', params: { stream: seawater }, economics: seawaterCost },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
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
          id: 'ft-liquids',
          unit: 'ft-liquids',
          capacity: DIESEL_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_FT },
          economics: tea.bindCapexPack('ft-liquids', { capacity: DIESEL_KG_PER_DAY, region: REGION }),
        },
        { id: 'diesel-product', unit: 'material-sink', economics: tea.bindSale('diesel', { region: REGION, freight: 'chile-coast-container' }) },
        { id: 'electrolyzer-oxygen', unit: 'material-sink', economics: tea.bindSale('oxygen', { region: REGION }) },
        { id: 'brine', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waterReject', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'process-water', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'co2-feed', port: 'out' }, to: { node: 'ft-liquids', port: 'co2' } },
        { from: { node: 'seawater', port: 'out' }, to: { node: 'swro', port: 'feed' } },
        { from: { node: 'swro', port: 'product' }, to: { node: 'electrolyzer', port: 'water' } },
        { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'ft-liquids', port: 'hydrogen' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'electrolyzer-oxygen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'waterReject', port: 'in' } },
        { from: { node: 'ft-liquids', port: 'diesel' }, to: { node: 'diesel-product', port: 'in' } },
        { from: { node: 'ft-liquids', port: 'water' }, to: { node: 'process-water', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'ft-liquids', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
      ],
    },
    operation: {
      setpoints: { electrolyzer: h2Kg, 'ft-liquids': DIESEL_KG_PER_DAY, swro: swroProductM3 },
      priorities: { 'power-bus': ['electrolyzer', 'ft-liquids', 'swro'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('co2-feed').siteResource = 'co2';
  node('seawater').siteResource = 'seawater';
  definition.site = {
    id: 'chile-mejillones-green-ft',
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (E_y 1923.52 from frozen data/pvgis-mejillones.json) × array sized to SWRO 3.5 kWh/m³ + electrolyzer 52 kWh/kg H₂ + FT 0.22 kWh/kg with 2% margin. No electricity purchase. Not a SEN interconnection or port lease.',
      },
      co2: {
        stream: clone(node('co2-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased industrial CO₂ assumed available at screening $0.05/kg plant-gate plus screening chile-coast-container freight $0.08/kg (~$80/t; not a Maersk quote). Not DAC full chain (coastal methanol.js remains the DAC demo) and not a merchant-gas contract. RWGS is folded into the FT island.',
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
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to SWRO + PEM + FT island.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      co2Purchase: right('purchase', 'assumed', 'Purchased industrial CO₂ assumed available at screening $0.05/kg; not DAC full chain; RWGS is folded into the island', [
        { label: 'IEA Direct Air Capture 2022 (family contrast; this purchase is industrial CO₂, not DAC full chain)', url: IEA_DAC },
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
      { label: 'IEA The Future of Hydrogen (2019) — FT synthesis family; CAPEX 890 USD/kW_liquid in the assumptions annex', url: IEA_H2_FUTURE },
      { label: 'IEA G20 Hydrogen assumptions annex (corr. Dec 2020) — FT CAPEX 890 USD2017/kW_liquid, electricity 0.018 GJe/GJliquid', url: IEA_H2_FUTURE_ANNEX },
      { label: 'IPCC 2006 Guidelines Vol. 2 Table 1.2 — gas/diesel oil NCV 43.0 TJ/Gg (kW_liquid → kg/day conversion)', url: IPCC_FUEL_NCV },
      { label: 'EIA gasoline and diesel fuel update (commodity-band context; screening diesel $0.90/kg, not a contract)', url: EIA_DIESEL },
      { label: 'World Bank commodity markets / pink sheet (gasoil family; screening mid, not a contract)', url: WB_PINK },
      { label: 'Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)', url: MILLERO_URL },
      { label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)', url: WOA_URL },
      { label: 'IEA Global Hydrogen Review 2024 (electrolytic H₂ family context; this demo is on-site PEM, not a purchased grey/blue H₂ contract)', url: IEA_H2 },
      { label: 'DOE hydrogen production electrolysis (PEM/alkaline family; screening 52 kWh/kg H₂, not a vendor meter)', url: DOE_H2 },
    ],
    notes: 'On-site SWRO + PEM H₂ + purchased industrial CO₂ → screening diesel/syncrude proxy (n=12 paraffin C₁₂H₂₆) at Mejillones. Not purchased H₂ (that remains cases/ft-liquids.js). Not DAC (coastal methanol.js remains the DAC demo). Overall stoich 12 CO₂ + 37 H₂ → C₁₂H₂₆ + 24 H₂O folds RWGS into the island; not a standalone RWGS unit and not a full FT slate. SEC 0.22 kWh/kg is IEA 0.018 GJe/GJliquid × 43.0 MJ/kg (electricity of the FT island; real FT is heat/H₂ dominated). Electrolyzer 52 kWh/kg H₂ dominates energy. Sale is screening diesel $0.90/kg plant-gate, net of screening chile-coast-container freight $0.08/kg (not a Maersk quote; screening FOB vs landed). Purchased industrial CO₂ carries screening chile-coast-container freight $0.08/kg. Seawater intake and electrolyzer-oxygen sale stay plant-gate (local intake; YAGNI byproduct). Not a logistics model. Cash sign whatever falls out. Not bankable. Not a green e-diesel premium. Chile CAPEX× 1.05 unchanged. Sell O₂ at screening $0.05/kg.',
  };
  return definition;
}

return { createGreenFtCase };
});
