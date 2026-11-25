const assay = require('../data/pilbara-indian-ocean-seawater.js');
const tea = require('../data/tea-screening.js');
const { projectEconomics, streamFromAssay, right, nodeFinder, clone, solarPowerNode, powerToBusEdge } = require('./_shared.js');
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-21.64&lon=115.11&peakpower=1&loss=14&angle=20&aspect=-179&raddatabase=PVGIS-ERA5&outputformat=json';
const ONSLOW_URL = 'https://en.wikipedia.org/wiki/Onslow,_Western_Australia';
const UNIDO_SALT = 'https://downloads.unido.org/ot/47/93/4793176/10001-15000_12271.pdf';
const SALT_REVIEW = 'https://doi.org/10.4236/oalib.1114280';
const MARDIE = 'https://www.miningweekly.com/article/mardie-salt-and-potash-project-australia-2020-09-25';
const DAILY_PV_ED = 4.9;
const SALT_KG_PER_DAY = 1000;
// Share of the seawater's NaCl the crystallizers recover (UNIDO: ~76% of the salt in saturated
// brine deposits); bittern goes back to sea. Gypsum settles in the concentrating ponds first.
const SALT_RECOVERY = 0.8;
const GYPSUM_RECOVERY = 0.7;
// Seawater lift into the ponds, 0.4 kWh/m³ (the screening intake-pump lift).
const PUMP_KWH_PER_KG_SEAWATER = 0.4 / 1000;
const REGION = 'Australia';

function createSeaSaltCase() {
  const naclGPerKg = assay.ions_g_per_kg['Na+'] * 58.44 / 22.99;
  const seawaterKg = SALT_KG_PER_DAY / (naclGPerKg / 1000 * SALT_RECOVERY);
  const seawater = streamFromAssay(assay, seawaterKg);
  const kWhPerDay = seawaterKg * PUMP_KWH_PER_KG_SEAWATER;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const power = { kind: 'electricity', kWh: solarKWp * DAILY_PV_ED };
  const vent = id => ({ id, unit: 'material-sink', economics: { disposition: 'vent' } });
  const definition = {
    economics: projectEconomics(),
    graph: {
      nodes: [
        { id: 'seawater', unit: 'material-source', sourcePreset: 'seawater', params: { stream: seawater }, economics: { ...tea.bindCost('seawater'), unitCost: 0 } },
        solarPowerNode(power, solarKWp, REGION),
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'ponds',
          unit: 'brine-minerals',
          capacity: seawaterKg,
          params: {
            electricityKWhPerKgBrine: PUMP_KWH_PER_KG_SEAWATER,
            lithiumRecovery: 0, bromideRecovery: 0, magnesiumRecovery: 0, potashRecovery: 0,
            gypsumRecovery: GYPSUM_RECOVERY, saltRecovery: SALT_RECOVERY,
          },
          economics: tea.bindCapexPack('solar-salt-ponds', { capacity: seawaterKg, region: REGION }),
        },
        { id: 'salt-product', unit: 'material-sink', economics: tea.bindSale('salt', { region: REGION }) },
        { id: 'gypsum-product', unit: 'material-sink', economics: tea.bindSale('gypsum', { region: REGION }) },
        vent('bittern'), vent('lithium'), vent('bromide'), vent('magnesium'), vent('potash'),
      ],
      edges: [
        { from: { node: 'seawater', port: 'out' }, to: { node: 'ponds', port: 'brine' } },
        powerToBusEdge(),
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'ponds', port: 'electricity' } },
        { from: { node: 'ponds', port: 'salt' }, to: { node: 'salt-product', port: 'in' } },
        { from: { node: 'ponds', port: 'gypsum' }, to: { node: 'gypsum-product', port: 'in' } },
        { from: { node: 'ponds', port: 'raffinate' }, to: { node: 'bittern', port: 'in' } },
        { from: { node: 'ponds', port: 'lithium' }, to: { node: 'lithium', port: 'in' } },
        { from: { node: 'ponds', port: 'bromide' }, to: { node: 'bromide', port: 'in' } },
        { from: { node: 'ponds', port: 'magnesium' }, to: { node: 'magnesium', port: 'in' } },
        { from: { node: 'ponds', port: 'potash' }, to: { node: 'potash', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { ponds: seawaterKg },
      priorities: { 'power-bus': ['ponds'] },
    },
  };
  const node = nodeFinder(definition);
  node('power').siteResource = 'electricity';
  node('seawater').siteResource = 'seawater';
  definition.site = {
    id: 'au-onslow',
    name: 'Onslow, Pilbara, Australia',
    latitude: -21.64,
    longitude: 115.11,
    region: REGION,
    solarKWp,
    dailyPVKWhPerKWp: DAILY_PV_ED,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'literature-estimate',
        evidence: 'PVGIS-ERA5 annual average 4.90 kWh/kWp·day (E_y 1787.29 from frozen data/pvgis-onslow.json) × array sized to the pond intake pumps (0.4 kWh/m³) with 2% margin. Evaporation itself is direct sun on the ponds. Not a grid connection.',
      },
      seawater: {
        stream: clone(node('seawater').params.stream),
        quality: 'cited',
        evidence: 'Pilbara Indian Ocean assay from frozen data/pilbara-indian-ocean-seawater.js, sized to 1000 kg NaCl/day at 80% recovery (~45 kg seawater per kg salt; industrial saltworks use 32–37 m³/t).',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-11-17',
      cite: {
        label: 'PVGIS-ERA5 at Onslow (−21.64, 115.11); frozen data/pvgis-onslow.json E_y 1787.29, totals.fixed E_d 4.90',
        url: PVGIS_URL,
      },
      notes: 'Frozen PVGIS-ERA5 totals.fixed E_d 4.90 kWh/kWp·day from data/pvgis-onslow.json. Pond evaporation is not modelled from weather; the pond capex is per tonne of salt capacity.',
    },
    assay: {
      kind: 'seawater',
      assayId: 'pilbara-indian-ocean-seawater',
      density_kg_per_L: assay.density_kg_per_L,
      summary: 'Pilbara Indian Ocean seawater, regional screening assay',
      quality: 'cited',
      salinity_g_per_kg: assay.salinity_g_per_kg,
      evidence: assay.evidence.map(item => ({ ...item })),
    },
    rights: {
      seawaterIntake: right('intake', 'assumed', 'Ocean intake to the ponds is a screening assumption, not a Pilbara permit', [
        { label: 'Wikipedia: Onslow (context)', url: ONSLOW_URL },
      ]),
      seawaterDischarge: right('discharge', 'assumed', 'Bittern returned to sea is assumed; no outfall permit is on file', [
        { label: 'UNIDO solar salt guidelines (bittern handling)', url: UNIDO_SALT },
      ]),
    },
    evidence: [
      { label: 'Onslow geography', url: ONSLOW_URL },
      { label: 'UNIDO, Guidelines for the establishment of solar salt facilities — yields 10–250 t/ha·yr; ~76% of salt in saturated brine deposits', url: UNIDO_SALT },
      { label: 'Ouma et al. 2025, Seawater evaporation salt production review — industrial 32–37 m³ seawater per tonne (theoretical 28.6)', url: SALT_REVIEW },
      { label: 'Mardie salt and potash project (Pilbara) DFS — A$779M total capex for 4.4 Mt/yr salt + 120 kt/yr SOP, port included', url: MARDIE },
    ],
    notes: 'Solar sea salt: seawater pumped into concentrating ponds and crystallizers, evaporated by the sun; gypsum settles out first and is sold, bittern returns to sea. Pond, harvest, wash and port capex at the Mardie DFS (A$177 per t/yr, port and SOP plant included, so conservative). The ponds cover ~100 t salt/ha·yr of land (UNIDO range 10–250), which the site land ceiling does not yet count. Screening, not bankable.',
  };
  return definition;
}

module.exports = { createSeaSaltCase };
