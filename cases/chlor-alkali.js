const { SUBSTANCES } = require('../engine/model');
const tea = require('../data/tea-screening.js');
const { projectEconomics, material, right, nodeFinder, clone, solarPowerNode, powerToBusEdge } = require('./_shared.js');
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-21.64&lon=115.11&peakpower=1&loss=14&angle=20&aspect=-179&raddatabase=PVGIS-ERA5&outputformat=json';
const ONSLOW_URL = 'https://en.wikipedia.org/wiki/Onslow,_Western_Australia';
const EUROCHLOR = 'https://www.eurochlor.org/production';
const DAILY_PV_ED = 4.9;
const NAOH_KG_PER_DAY = 1000;
const FEED_MARGIN = 1.02;
// Membrane cells, ~2.5 kWh per kg NaOH including rectification and brine treatment.
const SEC_NAOH = 2.5;
const REGION = 'Australia';

function createChlorAlkaliCase() {
  const naohMol = NAOH_KG_PER_DAY * 1000 / SUBSTANCES.NaOH.molarMassG;
  const saltKg = naohMol * SUBSTANCES.NaCl.molarMassG / 1000 * FEED_MARGIN;
  const waterKg = naohMol * SUBSTANCES.H2O.molarMassG / 1000 * FEED_MARGIN;
  const kWhPerDay = NAOH_KG_PER_DAY * SEC_NAOH;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const power = { kind: 'electricity', kWh: solarKWp * DAILY_PV_ED };
  const definition = {
    economics: projectEconomics(),
    graph: {
      nodes: [
        { id: 'salt-feed', unit: 'material-source', params: { stream: material('NaCl', saltKg) }, economics: tea.bindCost('salt-feed') },
        { id: 'water', unit: 'material-source', params: { stream: { ...material('H2O', waterKg), phase: 'liquid' } }, economics: tea.bindCost('water') },
        solarPowerNode(power, solarKWp, REGION),
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'chlor-alkali',
          unit: 'chlor-alkali',
          capacity: NAOH_KG_PER_DAY,
          params: { electricityKWhPerKg: SEC_NAOH },
          economics: tea.bindCapexPack('chlor-alkali', { capacity: NAOH_KG_PER_DAY, region: REGION }),
        },
        { id: 'caustic-product', unit: 'material-sink', economics: tea.bindSale('caustic', { region: REGION }) },
        { id: 'chlorine-product', unit: 'material-sink', economics: tea.bindSale('chlorine', { region: REGION }) },
        { id: 'hydrogen-product', unit: 'material-sink', economics: tea.bindSale('hydrogen', { region: REGION }) },
      ],
      edges: [
        { from: { node: 'salt-feed', port: 'out' }, to: { node: 'chlor-alkali', port: 'salt' } },
        { from: { node: 'water', port: 'out' }, to: { node: 'chlor-alkali', port: 'water' } },
        powerToBusEdge(),
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'chlor-alkali', port: 'electricity' } },
        { from: { node: 'chlor-alkali', port: 'caustic' }, to: { node: 'caustic-product', port: 'in' } },
        { from: { node: 'chlor-alkali', port: 'chlorine' }, to: { node: 'chlorine-product', port: 'in' } },
        { from: { node: 'chlor-alkali', port: 'hydrogen' }, to: { node: 'hydrogen-product', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { 'chlor-alkali': NAOH_KG_PER_DAY },
      priorities: { 'power-bus': ['chlor-alkali'] },
    },
  };
  const node = nodeFinder(definition);
  node('power').siteResource = 'electricity';
  node('salt-feed').siteResource = 'salt';
  node('water').siteResource = 'freshwater';
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
        evidence: 'PVGIS-ERA5 annual average 4.90 kWh/kWp·day (frozen data/pvgis-onslow.json) × array sized to 1000 kg NaOH/day × 2.5 kWh/kg with 2% margin. Not a grid connection.',
      },
      salt: {
        stream: clone(node('salt-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased salt at the screening $0.06/kg industrial band (the Pilbara solar saltworks next door make it for less).',
      },
      freshwater: {
        stream: clone(node('water').params.stream),
        quality: 'user-assumption',
        evidence: 'Process water at the screening $0.001/kg.',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-11-17',
      cite: { label: 'PVGIS-ERA5 at Onslow (−21.64, 115.11); frozen data/pvgis-onslow.json, totals.fixed E_d 4.90', url: PVGIS_URL },
      notes: 'Frozen PVGIS-ERA5 totals.fixed E_d 4.90 kWh/kWp·day from data/pvgis-onslow.json.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports', [
        { label: 'Wikipedia: Onslow (context)', url: ONSLOW_URL },
      ]),
    },
    evidence: [
      { label: 'Onslow geography', url: ONSLOW_URL },
      { label: 'Euro Chlor, Our industry — chlor-alkali production', url: EUROCHLOR },
    ],
    notes: 'Membrane chlor-alkali on solar: purchased salt + water → caustic soda, chlorine (0.89 kg/kg) and hydrogen (0.025 kg/kg), all sold. Membrane cells can modulate with the sun. Capex at the screening chlor-alkali pack ($1,500/(kg NaOH/day), conservative for small plants). Screening, not bankable.',
  };
  return definition;
}

module.exports = { createChlorAlkaliCase };
