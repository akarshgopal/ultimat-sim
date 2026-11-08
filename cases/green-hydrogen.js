(function exposeGreenHydrogenCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/benguela-atlantic-seawater.js') : root.BenguelaAtlanticSeawater,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening,
    typeof require === 'function' ? require('./_shared.js') : root.CaseShared
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GreenHydrogenCase = api;
})(globalThis, (model, assay, tea, shared) => {
const { SUBSTANCES } = model;
const { projectEconomics, streamFromAssay, right, nodeFinder, clone, solarPowerNode, powerToBusEdge } = shared;
// Seawater → SWRO → PEM electrolysis → merchant/captive H₂ (+ O₂). The company simulator uses
// this recipe as the make-vs-buy supplier for plants that buy hydrogen-feed (DRI, FT).
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-22.957&lon=14.505&peakpower=1&loss=14&angle=23&aspect=-179&raddatabase=PVGIS-ERA5&outputformat=json';
const DAILY_PV_ED = 5.48;
const H2_KG_PER_DAY = 1000;
const FEED_MARGIN = 1.05;
const RECOVERY = 0.45;
const O2_RECOVERY = 0.95;
const SEC_H2 = 52;
const SEC_SWRO = 3.5;
const PRODUCT_DENSITY_KG_M3 = 1000;
const FEED_DENSITY_KG_M3 = assay.density_kg_per_L * 1000;
const REGION = 'Southern Africa';
const MILLERO_URL = 'https://doi.org/10.1016/j.dsr.2007.10.001';
const MOHRHOLZ_URL = 'https://doi.org/10.1016/j.csr.2007.10.001';
const WOA_URL = 'https://doi.org/10.25923/70qt-9574';
const WALVIS_URL = 'https://en.wikipedia.org/wiki/Walvis_Bay';
const IEA_H2 = 'https://www.iea.org/reports/global-hydrogen-review-2024';
function createGreenHydrogenCase() {
  const h2Kg = H2_KG_PER_DAY;
  const waterKg = h2Kg * SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
  const swroProductM3 = waterKg / PRODUCT_DENSITY_KG_M3 * FEED_MARGIN;
  const feedM3 = swroProductM3 / RECOVERY;
  const seawaterKg = feedM3 * FEED_DENSITY_KG_M3;
  const kWhPerDay = h2Kg * SEC_H2 + swroProductM3 * SEC_SWRO;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const seawater = streamFromAssay(assay, seawaterKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: projectEconomics(),
    graph: {
      nodes: [
        { id: 'seawater', unit: 'material-source', sourcePreset: 'seawater', params: { stream: seawater }, economics: tea.bindCost('seawater') },
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
        { id: 'hydrogen-product', unit: 'material-sink', economics: tea.bindSale('hydrogen', { region: REGION }) },
        { id: 'electrolyzer-oxygen', unit: 'material-sink', economics: tea.bindSale('oxygen', { region: REGION }) },
        { id: 'brine', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waterReject', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'seawater', port: 'out' }, to: { node: 'swro', port: 'feed' } },
        { from: { node: 'swro', port: 'product' }, to: { node: 'electrolyzer', port: 'water' } },
        { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'hydrogen-product', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'electrolyzer-oxygen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'waterReject', port: 'in' } },
        powerToBusEdge(),
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
      ],
    },
    operation: {
      setpoints: { electrolyzer: h2Kg, swro: swroProductM3 },
      priorities: { 'power-bus': ['electrolyzer', 'swro'] },
    },
  };
  const node = nodeFinder(definition);
  node('power').siteResource = 'electricity';
  node('seawater').siteResource = 'seawater';
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
        evidence: 'PVGIS-ERA5 annual average 5.48 kWh/kWp·day (E_y 2000.67 from frozen data/pvgis-walvis-bay.json) × array sized to the SWRO + electrolyzer load with 2% margin. Not a NamPower interconnection or Namport lease.',
      },
      seawater: {
        stream: clone(node('seawater').params.stream),
        quality: 'cited',
        evidence: 'Benguela / SE Atlantic multi-ion assay from frozen data/benguela-atlantic-seawater.js (Millero/Pilson S=35 scaled 35.2/35; Mohrholz et al. 2008 Walvis 23°S hydrography). Basin typical, not a Namport intake sample.',
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
      notes: 'Screening seawater SWRO + PEM electrolysis (52 kWh/kg H₂) on frozen Walvis PV (totals.fixed E_d 5.48 / E_y 2000.67). Daily-average solar, no compression or storage for transport. H₂ sold at the same $2.00/kg screening price the cases pay for purchased H₂. Not bankable, not a green premium. Southern Africa CAPEX× 0.95.',
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
      { label: 'IEA Global Hydrogen Review 2024 (market H₂ family; screening $2.00/kg)', url: IEA_H2 },
    ],
    notes: 'Screening air + seawater SWRO + electrolysis + ASU + Haber–Bosch on frozen Walvis PV (totals.fixed E_d 5.48 / E_y 2000.67). Not Dead Sea chlor-alkali hydrogen. Screening fertilizer price $0.45/kg with small-plant Haber/electrolyzer intensities so cash may be negative. Not bankable. Not a green premium. Southern Africa CAPEX× 0.95. O₂ stays plant-gate because volume is above the Linde 15–200 t/y tanker tariff band (not a tariff for that scale).',
  };
  return definition;
}

return { createGreenHydrogenCase };
});
