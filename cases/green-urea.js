(function exposeGreenUreaCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/benguela-atlantic-seawater.js') : root.BenguelaAtlanticSeawater,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GreenUreaCase = api;
})(globalThis, (model, assay, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-22.957&lon=14.505&peakpower=1&loss=14&angle=23&aspect=-179&raddatabase=PVGIS-ERA5&outputformat=json';
const DAILY_PV_ED = 5.48;
const UREA_KG_PER_DAY = 1000;
const FEED_MARGIN = 1.05;
const RECOVERY = 0.45;
const N2_RECOVERY = 0.98;
const O2_RECOVERY = 0.95;
const SEC_H2 = 52;
const SEC_N2 = 0.25;
const SEC_NH3 = 0.6;
const SEC_SWRO = 3.5;
const SEC_UREA = 0.8;
const PRODUCT_DENSITY_KG_M3 = 1000;
const FEED_DENSITY_KG_M3 = assay.density_kg_per_L * 1000;
const REGION = 'Southern Africa';
const MILLERO_URL = 'https://doi.org/10.1016/j.dsr.2007.10.001';
const MOHRHOLZ_URL = 'https://doi.org/10.1016/j.csr.2007.10.001';
const WOA_URL = 'https://doi.org/10.25923/70qt-9574';
const IEA_NH3 = 'https://www.iea.org/reports/ammonia-technology-roadmap';
const USGS_N = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-nitrogen.pdf';
const WB_PINK = 'https://www.worldbank.org/en/research/commodity-markets';
const IEA_DAC = 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary';
const WALVIS_URL = 'https://en.wikipedia.org/wiki/Walvis_Bay';
// Ambient-air preset ratios from the flowsheet air source (N₂-dominated).
const AIR_N2 = 788163;
const AIR_O2 = 211409;
const AIR_CO2 = 428;

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

function airFromNitrogenKg(nitrogenKg) {
  const n2Mol = nitrogenKg * 1000 / SUBSTANCES.N2.molarMassG;
  return {
    kind: 'material',
    mol: {
      N2: n2Mol,
      O2: n2Mol * AIR_O2 / AIR_N2,
      CO2: n2Mol * AIR_CO2 / AIR_N2,
    },
    phase: 'gas',
    T_C: 25,
    P_bar: 1,
  };
}

function createGreenUreaCase() {
  const ureaKg = UREA_KG_PER_DAY;
  const nh3Kg = ureaKg * 2 * SUBSTANCES.NH3.molarMassG / SUBSTANCES.Urea.molarMassG;
  const co2Kg = ureaKg * SUBSTANCES.CO2.molarMassG / SUBSTANCES.Urea.molarMassG * FEED_MARGIN;
  const nh3Mol = nh3Kg * 1000 / SUBSTANCES.NH3.molarMassG;
  const h2Kg = nh3Mol * 1.5 * SUBSTANCES.H2.molarMassG / 1000;
  const n2Kg = nh3Mol * 0.5 * SUBSTANCES.N2.molarMassG / 1000;
  const waterKg = h2Kg * SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
  const swroProductM3 = waterKg / PRODUCT_DENSITY_KG_M3 * FEED_MARGIN;
  const feedM3 = swroProductM3 / RECOVERY;
  const seawaterKg = feedM3 * FEED_DENSITY_KG_M3;
  const airN2Kg = n2Kg / N2_RECOVERY * FEED_MARGIN;
  const kWhPerDay = h2Kg * SEC_H2 + n2Kg * SEC_N2 + nh3Kg * SEC_NH3 + swroProductM3 * SEC_SWRO + ureaKg * SEC_UREA;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const carbonDioxide = material('CO2', co2Kg, 'gas');
  const seawater = seawaterFromAssay(assay, seawaterKg);
  const air = airFromNitrogenKg(airN2Kg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'seawater', unit: 'material-source', sourcePreset: 'seawater', params: { stream: seawater }, economics: tea.bindCost('seawater') },
        { id: 'air', unit: 'material-source', sourcePreset: 'air', params: { stream: air }, economics: { unitCost: 0 } },
        { id: 'co2-feed', unit: 'material-source', sourcePreset: 'co2', params: { stream: carbonDioxide }, economics: tea.bindCost('co2-feed', { freight: 'chile-coast-container' }) },
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
          id: 'asu',
          unit: 'asu',
          capacity: n2Kg,
          params: { nitrogenRecovery: N2_RECOVERY, oxygenRecovery: O2_RECOVERY, electricityKWhPerKgN2: SEC_N2 },
          economics: tea.bindCapexPack('asu', { capacity: n2Kg, region: REGION }),
        },
        {
          id: 'ammonia',
          unit: 'ammonia',
          capacity: nh3Kg,
          params: { electricityKWhPerKg: SEC_NH3 },
          economics: tea.bindCapexPack('ammonia', { capacity: nh3Kg, region: REGION }),
        },
        {
          id: 'urea',
          unit: 'urea',
          capacity: UREA_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_UREA },
          economics: tea.bindCapexPack('urea', { capacity: UREA_KG_PER_DAY, region: REGION }),
        },
        { id: 'urea-product', unit: 'material-sink', economics: tea.bindSale('urea', { region: REGION, freight: 'bulk-dry-shortsea' }) },
        { id: 'electrolyzer-oxygen', unit: 'material-sink', economics: tea.bindSale('oxygen', { region: REGION }) },
        { id: 'asu-oxygen', unit: 'material-sink', economics: tea.bindSale('oxygen', { region: REGION }) },
        { id: 'brine', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'offgas', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waterReject', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'process-water', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'seawater', port: 'out' }, to: { node: 'swro', port: 'feed' } },
        { from: { node: 'swro', port: 'product' }, to: { node: 'electrolyzer', port: 'water' } },
        { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
        { from: { node: 'air', port: 'out' }, to: { node: 'asu', port: 'air' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'ammonia', port: 'hydrogen' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'electrolyzer-oxygen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'waterReject', port: 'in' } },
        { from: { node: 'asu', port: 'nitrogen' }, to: { node: 'ammonia', port: 'nitrogen' } },
        { from: { node: 'asu', port: 'oxygen' }, to: { node: 'asu-oxygen', port: 'in' } },
        { from: { node: 'asu', port: 'offgas' }, to: { node: 'offgas', port: 'in' } },
        { from: { node: 'ammonia', port: 'ammonia' }, to: { node: 'urea', port: 'ammonia' } },
        { from: { node: 'co2-feed', port: 'out' }, to: { node: 'urea', port: 'carbonDioxide' } },
        { from: { node: 'urea', port: 'urea' }, to: { node: 'urea-product', port: 'in' } },
        { from: { node: 'urea', port: 'water' }, to: { node: 'process-water', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'asu', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'ammonia', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'urea', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
      ],
    },
    operation: {
      setpoints: { electrolyzer: h2Kg, asu: n2Kg, ammonia: nh3Kg, urea: UREA_KG_PER_DAY, swro: swroProductM3 },
      priorities: { 'power-bus': ['electrolyzer', 'asu', 'ammonia', 'urea', 'swro'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('seawater').siteResource = 'seawater';
  node('air').siteResource = 'air';
  node('co2-feed').siteResource = 'co2';
  definition.site = {
    id: 'namibia-walvis-bay-green-urea',
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
        evidence: 'PVGIS-ERA5 annual average 5.48 kWh/kWp·day (E_y 2000.67 from frozen data/pvgis-walvis-bay.json) × array sized to the SWRO + electrolyzer + ASU + Haber + urea load with 2% margin. No electricity purchase. Not a NamPower interconnection or Namport lease.',
      },
      seawater: {
        stream: clone(node('seawater').params.stream),
        quality: 'cited',
        evidence: 'Benguela / SE Atlantic multi-ion assay from frozen data/benguela-atlantic-seawater.js (Millero/Pilson S=35 scaled 35.2/35; Mohrholz et al. 2008 Walvis 23°S hydrography). Basin typical, not a Namport intake sample.',
      },
      air: {
        stream: clone(node('air').params.stream),
        quality: 'literature-estimate',
        evidence: 'Ambient air intake sized to ASU nitrogen at 0.98 recovery with 5% margin; N₂-dominated dry-air ratios. Not a quality permit.',
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
    assay: {
      kind: 'seawater',
      assayId: 'benguela-atlantic-seawater',
      density_kg_per_L: assay.density_kg_per_L,
      summary: 'Northern Benguela / SE Atlantic ~35.2 g/kg, Millero/Pilson S=35 majors scaled 35.2/35; multi-ion, not a NaCl proxy or Namport intake sample',
      quality: 'cited',
      salinity_g_per_kg: assay.salinity_g_per_kg,
      evidence: Array.isArray(assay.evidence) ? assay.evidence.map(item => ({ ...item })) : [],
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant uses on-site PV sized to SWRO + PEM + ASU + Haber + urea.', [
        { label: 'Wikipedia: Walvis Bay (context, not an interconnection)', url: WALVIS_URL },
      ]),
      freshwater: right('freshwater', 'unverified', 'Plant uses SWRO product; no freshwater right claimed or used'),
      seawaterIntake: right('intake', 'assumed', 'Atlantic access is a screening assumption, not a Walvis Bay permit', [
        { label: 'Millero et al. 2008 assay context for the assumed intake volume', url: MILLERO_URL },
      ]),
      seawaterDischarge: right('discharge', 'assumed', 'Assumed so the screening cash gate can run; no Atlantic outfall permit is on file', [
        { label: 'Wikipedia: Walvis Bay (context, not an outfall permit)', url: WALVIS_URL },
      ]),
      brineConcession: right('concession', 'unverified', 'Not applicable — this plant is not a brine concession', [
        { label: 'Benguela seawater assay (intake chemistry, not a mineral concession)', url: MOHRHOLZ_URL },
      ]),
      co2Purchase: right('purchase', 'assumed', 'Purchased industrial CO₂ assumed available at screening $0.05/kg; not DAC full chain', [
        { label: 'IEA Direct Air Capture 2022 (family contrast only; this purchase is industrial CO₂, not DAC)', url: IEA_DAC },
      ]),
    },
    evidence: [
      { label: 'Walvis Bay geography', url: WALVIS_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at Walvis Bay (−22.957, 14.505); annual E_y 2000.67 kWh/kWp, totals.fixed E_d 5.48', url: PVGIS_URL },
      { label: 'Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)', url: MILLERO_URL },
      { label: 'Mohrholz et al. 2008 Cont. Shelf Res.: northern Benguela / Walvis Bay 23°S water-mass hydrography (DOI)', url: MOHRHOLZ_URL },
      { label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)', url: WOA_URL },
      { label: 'IEA Ammonia Technology Roadmap (ammonia/fertilizer family; screening urea $0.40/kg)', url: IEA_NH3 },
      { label: 'USGS MCS 2025 nitrogen (fixed) — fertilizer-family context', url: USGS_N },
      { label: 'World Bank commodity markets / pink sheet (urea family ~$350–450/t; screening mid $0.40/kg, not a Black Sea contract)', url: WB_PINK },
      { label: 'IEA Direct Air Capture 2022 (family contrast only; this purchase is industrial CO₂, not DAC)', url: IEA_DAC },
    ],
    notes: 'On-site SWRO + PEM H₂ + ASU N₂ → Haber NH₃ + purchased industrial CO₂ → screening urea at the Walvis map point. Not purchased NH₃ (that remains cases/urea.js). Not NH₃-sale (that remains cases/green-ammonia.js). Not DAC full chain. Overall stoich 2 NH₃ + CO₂ → urea + H₂O only; not carbamate recycle and not granulation. SEC 0.8 kWh/kg is an electricity-as-total-energy proxy for a steam-heavy plant (real urea is heat-dominated). Electrolyzer 52 kWh/kg H₂ dominates energy. Sale is screening urea $0.40/kg plant-gate, net of screening bulk-dry-shortsea freight $0.03/kg (bulk fertilizer offtake OOM; not a Namport quote; screening FOB vs landed). Purchased industrial CO₂ carries screening chile-coast-container freight $0.08/kg (existing container family band; not a Chile-origin claim for Walvis). Seawater intake and air stay plant-gate (local intake). Electrolyzer-oxygen sale stays plant-gate because volume is above the Linde 15–200 t/y tanker tariff band (not a tariff for that scale). NH₃ is on-site Haber — no NH₃ purchase freight. Not a logistics model. Cash sign whatever falls out. Not bankable. Not a green premium. Southern Africa CAPEX× 0.95 unchanged.',
  };
  return definition;
}

return { createGreenUreaCase };
});
