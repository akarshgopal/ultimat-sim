const { SUBSTANCES } = require('../engine/model');
const tea = require('../data/tea-screening.js');
const { projectEconomics, airFromNitrogenKg, right, nodeFinder, clone, solarPowerNode, powerToBusEdge } = require('./_shared.js');
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-22.957&lon=14.505&peakpower=1&loss=14&angle=23&aspect=-179&raddatabase=PVGIS-ERA5&outputformat=json';
const WALVIS_URL = 'https://en.wikipedia.org/wiki/Walvis_Bay';
const TSE_ASU = 'https://thundersaidenergy.com/downloads/cryogenic-air-separation-the-economics/';
const ASU_SPC = 'https://www.researchgate.net/publication/287708500_Oxygen_Specific_Power_Consumption_Comparison_for_Air_Separation_Units';
const O2_MIN_WORK = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7512746/';
const DAILY_PV_ED = 5.48;
const O2_KG_PER_DAY = 1000;
const FEED_MARGIN = 1.05;
const N2_RECOVERY = 0.98;
const O2_RECOVERY = 0.95;
// Cryogenic oxygen ~0.25 kWh/kg O₂ (0.35 kWh/Nm³; large plants 200–350 kWh/t), against a 51 kWh/t
// thermodynamic minimum. The ASU unit is sized on nitrogen processed, so its kWh are quoted per kg N₂.
const SEC_O2 = 0.25;
const REGION = 'Southern Africa';

// Oxygen out per kg of nitrogen the ASU processes, from dry-air N₂:O₂ and the two recoveries.
function oxygenPerNitrogenKg(air) {
  const n2Kg = air.mol.N2 * SUBSTANCES.N2.molarMassG / 1000;
  const o2Kg = air.mol.O2 * SUBSTANCES.O2.molarMassG / 1000;
  return (o2Kg * O2_RECOVERY) / (n2Kg * N2_RECOVERY);
}

function createOxygenAsuCase() {
  const perN2 = oxygenPerNitrogenKg(airFromNitrogenKg(1));
  const n2Kg = O2_KG_PER_DAY / perN2;
  const air = airFromNitrogenKg(n2Kg / N2_RECOVERY * FEED_MARGIN);
  const secN2 = SEC_O2 * perN2;
  const kWhPerDay = O2_KG_PER_DAY * SEC_O2;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const power = { kind: 'electricity', kWh: solarKWp * DAILY_PV_ED };
  const definition = {
    economics: projectEconomics(),
    graph: {
      nodes: [
        { id: 'air', unit: 'material-source', sourcePreset: 'air', params: { stream: air }, economics: { unitCost: 0 } },
        solarPowerNode(power, solarKWp, REGION),
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'asu',
          unit: 'asu',
          capacity: n2Kg,
          params: { nitrogenRecovery: N2_RECOVERY, oxygenRecovery: O2_RECOVERY, electricityKWhPerKgN2: secN2 },
          economics: tea.bindCapexPack('asu-oxygen', { capacity: n2Kg, region: REGION }),
        },
        { id: 'oxygen-product', unit: 'material-sink', economics: tea.bindSale('oxygen', { region: REGION }) },
        { id: 'nitrogen', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'offgas', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'air', port: 'out' }, to: { node: 'asu', port: 'air' } },
        powerToBusEdge(),
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'asu', port: 'electricity' } },
        { from: { node: 'asu', port: 'oxygen' }, to: { node: 'oxygen-product', port: 'in' } },
        { from: { node: 'asu', port: 'nitrogen' }, to: { node: 'nitrogen', port: 'in' } },
        { from: { node: 'asu', port: 'offgas' }, to: { node: 'offgas', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { asu: n2Kg },
      priorities: { 'power-bus': ['asu'] },
    },
  };
  const node = nodeFinder(definition);
  node('power').siteResource = 'electricity';
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
        evidence: 'PVGIS-ERA5 annual average 5.48 kWh/kWp·day (E_y 2000.67 from frozen data/pvgis-walvis-bay.json) × array sized to 1000 kg O₂/day × 0.25 kWh/kg with 2% margin. Not a NamPower interconnection.',
      },
      air: {
        stream: clone(node('air').params.stream),
        quality: 'literature-estimate',
        evidence: 'Ambient air sized to the ASU at 0.98 N₂ / 0.95 O₂ recovery with 5% margin; dry-air ratios. Not an air-quality permit.',
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
      notes: 'Frozen PVGIS-ERA5 totals.fixed E_d 5.48 kWh/kWp·day and E_y 2000.67 kWh/kWp from data/pvgis-walvis-bay.json. Not a plant pyranometer.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports', [
        { label: 'Wikipedia: Walvis Bay (context, not an interconnection)', url: WALVIS_URL },
      ]),
    },
    evidence: [
      { label: 'Walvis Bay geography', url: WALVIS_URL },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at Walvis Bay (−22.957, 14.505); annual E_y 2000.67 kWh/kWp, totals.fixed E_d 5.48', url: PVGIS_URL },
      { label: 'Thunder Said Energy, Costs of cryogenic air separation — base case $200 per t/yr capex, ~$100/t oxygen', url: TSE_ASU },
      { label: 'Oxygen specific power consumption comparison for air separation units — cryogenic ~0.35 kWh/Nm³ O₂ (≈ 0.25 kWh/kg)', url: ASU_SPC },
      { label: 'Banaszkiewicz et al. 2018 — minimum work to separate O₂ from air ≈ 51 kWh/t', url: O2_MIN_WORK },
    ],
    notes: 'Cryogenic air separation on frozen Walvis PV making oxygen; the nitrogen and argon are vented (no world nitrogen market is tracked). 0.25 kWh/kg O₂ and $73/(kg O₂/day) installed (Thunder Said Energy $200 per t/yr). A cryogenic ASU runs steady (cold box, slow restart), so on solar it is firmed. Screening, not bankable.',
  };
  return definition;
}

module.exports = { createOxygenAsuCase, oxygenPerNitrogenKg };
