(function exposeGreenAmmoniaCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/benguela-atlantic-seawater.js') : root.BenguelaAtlanticSeawater,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GreenAmmoniaCase = api;
})(globalThis, (model, assay, tea) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-22.957&lon=14.505&peakpower=1&loss=14&angle=23&aspect=-179&raddatabase=PVGIS-ERA5&outputformat=json';
const DAILY_PV_ED = 5.48;
const NH3_KG_PER_DAY = 1000;
const FEED_MARGIN = 1.05;
const RECOVERY = 0.45;
const N2_RECOVERY = 0.98;
const O2_RECOVERY = 0.95;
const SEC_H2 = 52;
const SEC_N2 = 0.25;
const SEC_NH3 = 0.6;
const SEC_SWRO = 3.5;
const PRODUCT_DENSITY_KG_M3 = 1000;
const FEED_DENSITY_KG_M3 = assay.density_kg_per_L * 1000;
const REGION = 'Southern Africa';
const MILLERO_URL = 'https://doi.org/10.1016/j.dsr.2007.10.001';
const MOHRHOLZ_URL = 'https://doi.org/10.1016/j.csr.2007.10.001';
const WOA_URL = 'https://doi.org/10.25923/70qt-9574';
const IEA_NH3 = 'https://www.iea.org/reports/ammonia-technology-roadmap';
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

function createGreenAmmoniaCase() {
  const nh3Mol = NH3_KG_PER_DAY * 1000 / SUBSTANCES.NH3.molarMassG;
  const h2Kg = nh3Mol * 1.5 * SUBSTANCES.H2.molarMassG / 1000;
  const n2Kg = nh3Mol * 0.5 * SUBSTANCES.N2.molarMassG / 1000;
  const waterKg = h2Kg * SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
  const swroProductM3 = waterKg / PRODUCT_DENSITY_KG_M3 * FEED_MARGIN;
  const feedM3 = swroProductM3 / RECOVERY;
  const seawaterKg = feedM3 * FEED_DENSITY_KG_M3;
  const airN2Kg = n2Kg / N2_RECOVERY * FEED_MARGIN;
  const kWhPerDay = h2Kg * SEC_H2 + n2Kg * SEC_N2 + NH3_KG_PER_DAY * SEC_NH3 + swroProductM3 * SEC_SWRO;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const seawater = seawaterFromAssay(assay, seawaterKg);
  const air = airFromNitrogenKg(airN2Kg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'seawater', unit: 'material-source', sourcePreset: 'seawater', params: { stream: seawater }, economics: tea.bindCost('seawater') },
        { id: 'air', unit: 'material-source', sourcePreset: 'air', params: { stream: air }, economics: { unitCost: 0 } },
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
          capacity: NH3_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_NH3 },
          economics: tea.bindCapexPack('ammonia', { capacity: NH3_KG_PER_DAY, region: REGION }),
        },
        { id: 'ammonia-product', unit: 'material-sink', economics: tea.bindSale('ammonia', { region: REGION }) },
        { id: 'electrolyzer-oxygen', unit: 'material-sink', economics: tea.bindSale('oxygen', { region: REGION }) },
        { id: 'asu-oxygen', unit: 'material-sink', economics: tea.bindSale('oxygen', { region: REGION }) },
        { id: 'brine', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'offgas', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waterReject', unit: 'material-sink', economics: { disposition: 'vent' } },
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
        { from: { node: 'ammonia', port: 'ammonia' }, to: { node: 'ammonia-product', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'asu', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'ammonia', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
      ],
    },
    operation: {
      setpoints: { electrolyzer: h2Kg, asu: n2Kg, ammonia: NH3_KG_PER_DAY, swro: swroProductM3 },
      priorities: { 'power-bus': ['electrolyzer', 'asu', 'ammonia', 'swro'] },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('seawater').siteResource = 'seawater';
  node('air').siteResource = 'air';
  definition.site = {
    id: 'namibia-walvis-bay',
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
        evidence: 'PVGIS-ERA5 annual average 5.48 kWh/kWp·day (E_y 2000.67 from frozen data/pvgis-walvis-bay.json) × array sized to the SWRO + electrolyzer + ASU + Haber load with 2% margin. Not a NamPower interconnection or Namport lease.',
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
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports', [
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
    },
    evidence: [
      { label: 'Walvis Bay geography', url: WALVIS_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at Walvis Bay (−22.957, 14.505); annual E_y 2000.67 kWh/kWp, totals.fixed E_d 5.48', url: PVGIS_URL },
      { label: 'Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)', url: MILLERO_URL },
      { label: 'Mohrholz et al. 2008 Cont. Shelf Res.: northern Benguela / Walvis Bay 23°S water-mass hydrography (DOI)', url: MOHRHOLZ_URL },
      { label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)', url: WOA_URL },
      { label: 'IEA Ammonia Technology Roadmap (fertilizer-market order; screening mid $0.45/kg)', url: IEA_NH3 },
    ],
    notes: 'Screening air + seawater SWRO + electrolysis + ASU + Haber–Bosch on frozen Walvis PV (totals.fixed E_d 5.48 / E_y 2000.67). Not Dead Sea chlor-alkali hydrogen. Screening fertilizer price $0.45/kg with small-plant Haber/electrolyzer intensities so cash may be negative. Not bankable. Not a green premium. Southern Africa CAPEX× 0.95. O₂ stays plant-gate because volume is above the Linde 15–200 t/y tanker tariff band (not a tariff for that scale).',
  };
  return definition;
}

return { createGreenAmmoniaCase };
});
