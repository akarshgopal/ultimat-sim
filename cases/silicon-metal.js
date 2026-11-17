// Silicon on sunlight from crustal quartz: submerged-arc MG-Si (SiO₂ + 2C → Si + 2CO, 12 kWh/kg),
// optionally refined to solar-grade polysilicon (Siemens-style, 65 kWh/kg). Same packs, energies
// and feeds as the PV-module chain (cases/silicon.js), at stand-alone scale. siliconChain() is shared
// with cases/polysilicon.js.
const { SUBSTANCES } = require('../engine/model');
const tea = require('../data/tea-screening.js');
const { MEJILLONES_PVGIS_URL: PVGIS_URL, MEJILLONES_URL, projectEconomics, material, right, nodeFinder, clone, solarPowerNode, powerToBusEdge } = require('./_shared.js');
const DAILY_PV_ED = 5.27;
const FEED_MARGIN = 1.05;
const USGS_SI = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-silicon.pdf';
const USGS_SILICA = 'https://www.usgs.gov/centers/national-minerals-information-center/silica-statistics-and-information';
const FRAUNHOFER_POLYSI = 'https://www.ise.fraunhofer.de/content/dam/ise/en/documents/publications/studies/25_en_ISE_Report_Analysis-of-the-Electricity-Consumption-for-the-Production-of-Electronic-Grade-Polysilicon.pdf';
const NREL_SOLAR_2025 = 'https://www.nrel.gov/docs/';
const REGION = 'Atacama/Chile';

// poly: false → sell MG-Si (kgPerDay of Si); true → refine to polysilicon (kgPerDay of poly-Si).
function siliconChain({ poly, kgPerDay }) {
  const siKgPerDay = poly ? kgPerDay * 1.05 : kgPerDay;
  const quartzKg = siKgPerDay * SUBSTANCES.SiO2.molarMassG / SUBSTANCES.Si.molarMassG * FEED_MARGIN;
  const reductantKg = siKgPerDay * 2 * SUBSTANCES.C.molarMassG / SUBSTANCES.Si.molarMassG * FEED_MARGIN;
  const kWhPerDay = siKgPerDay * 12 + (poly ? kgPerDay * 65 : 0);
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const power = { kind: 'electricity', kWh: solarKWp * DAILY_PV_ED };
  const saleKey = poly ? 'polysilicon' : 'silicon';
  const sinkId = poly ? 'poly-product' : 'silicon';
  const nodes = [
    { id: 'quartz', unit: 'material-source', sourcePreset: 'quartz', params: { stream: material('SiO2', quartzKg) }, economics: tea.bindCost('quartz', { freight: 'bulk-dry-shortsea' }) },
    { id: 'reductant', unit: 'material-source', sourcePreset: 'carbon', params: { stream: material('C', reductantKg) }, economics: tea.bindCost('carbon-reductant', { freight: 'bulk-dry-shortsea' }) },
    solarPowerNode(power, solarKWp, REGION),
    { id: 'power-bus', unit: 'electrical-bus' },
    { id: 'mg-si', unit: 'mg-si', capacity: siKgPerDay, params: { electricityKWhPerKg: 12 }, economics: tea.bindCapexPack('mg-si', { capacity: siKgPerDay, region: REGION }) },
    { id: sinkId, unit: 'material-sink', economics: tea.bindSale(saleKey, { region: REGION, freight: 'chile-coast-container' }) },
    { id: 'carbonMonoxide', unit: 'material-sink', economics: { disposition: 'vent' } },
  ];
  const edges = [
    { from: { node: 'quartz', port: 'out' }, to: { node: 'mg-si', port: 'quartz' } },
    { from: { node: 'reductant', port: 'out' }, to: { node: 'mg-si', port: 'carbon' } },
    powerToBusEdge(),
    { from: { node: 'power-bus', port: 'out' }, to: { node: 'mg-si', port: 'electricity' } },
    { from: { node: 'mg-si', port: 'carbonMonoxide' }, to: { node: 'carbonMonoxide', port: 'in' } },
  ];
  const setpoints = { 'mg-si': siKgPerDay };
  if (poly) {
    nodes.push({ id: 'polysilicon', unit: 'polysilicon', capacity: kgPerDay, params: { electricityKWhPerKg: 65 }, economics: tea.bindCapexPack('polysilicon', { capacity: kgPerDay, region: REGION }) });
    edges.push(
      { from: { node: 'power-bus', port: 'out' }, to: { node: 'polysilicon', port: 'electricity' } },
      { from: { node: 'mg-si', port: 'silicon' }, to: { node: 'polysilicon', port: 'silicon' } },
      { from: { node: 'polysilicon', port: 'polysilicon' }, to: { node: sinkId, port: 'in' } },
      { from: { node: 'polysilicon', port: 'bleed' }, to: { node: 'siliconBleed', port: 'in' } },
    );
    nodes.push({ id: 'siliconBleed', unit: 'material-sink', economics: { disposition: 'vent' } });
    setpoints.polysilicon = kgPerDay;
  } else {
    edges.push({ from: { node: 'mg-si', port: 'silicon' }, to: { node: sinkId, port: 'in' } });
  }
  const definition = {
    economics: projectEconomics(),
    graph: { nodes, edges },
    operation: { setpoints, priorities: { 'power-bus': poly ? ['mg-si', 'polysilicon'] : ['mg-si'] } },
  };
  const node = nodeFinder(definition);
  node('power').siteResource = 'electricity';
  node('quartz').siteResource = 'quartz';
  node('reductant').siteResource = 'reductant';
  definition.site = {
    id: 'chile-mejillones',
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
        evidence: `PVGIS-ERA5 annual average 5.27 kWh/kWp·day (frozen data/pvgis-mejillones.json) × array sized to the MG-Si${poly ? ' + Siemens-style poly-Si' : ''} load with 2% margin. Not a SEN interconnection.`,
      },
      quartz: {
        stream: clone(node('quartz').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased quartzite assumed available at screening $0.08/kg plant-gate plus screening bulk-dry-shortsea freight $0.03/kg. Not a quarry quote.',
      },
      reductant: {
        stream: clone(node('reductant').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased carbon reductant (coal/coke/charcoal mix) at screening $0.25/kg plus bulk-dry-shortsea freight $0.03/kg. Not a contract.',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-14',
      cite: { label: 'PVGIS-ERA5, 2005–2023 monthly at Mejillones (−23.100, −70.448); E_d 5.27', url: PVGIS_URL },
      notes: 'Frozen PVGIS-ERA5 E_d 5.27 kWh/kWp·day from data/pvgis-mejillones.json. Not a plant-measured irradiance series.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      brineConcession: right('concession', 'unverified', 'No brine; purchased quartzite and carbon are not a mineral concession', [
        { label: 'USGS silica statistics (commodity context, not a concession)', url: USGS_SILICA },
      ]),
      quartzPurchase: right('purchase', 'assumed', 'Purchased quartzite assumed available; not a quarry quote or port lease', [
        { label: 'USGS silica statistics (commodity context, not a contract)', url: USGS_SILICA },
      ]),
    },
    evidence: [
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly; E_d 5.27', url: PVGIS_URL },
      { label: 'USGS MCS 2025 silicon metal ($3.97/kg; submerged-arc ~11–13 kWh/kg family)', url: USGS_SI },
      ...(poly ? [
        { label: 'Fraunhofer ISE SoG polysilicon electricity 60–71 kWh/kg; screening 65', url: FRAUNHOFER_POLYSI },
        { label: 'NREL Spring 2025 Solar Industry Update — SoG poly spot ~$6/kg', url: NREL_SOLAR_2025 },
      ] : []),
    ],
    notes: poly
      ? 'Screening crustal quartz → MG-Si (12 kWh/kg) → Siemens-style poly-Si (65 kWh/kg; 1.05 kg MG-Si per kg) sold at screening $6/kg net of container freight. Same packs and assumptions as the PV-module chain (cases/silicon.js). Not a TCS/HCl plant model, not FBR, not bankable.'
      : 'Screening crustal quartz → submerged-arc MG-Si (SiO₂ + 2C → Si + 2CO, 12 kWh/kg) sold at USGS $3.97/kg net of container freight. Same pack and assumptions as the PV-module chain (cases/silicon.js). Arc furnaces are baseload. Not a furnace contract, not bankable.',
  };
  return definition;
}

function createSiliconMetalCase() {
  return siliconChain({ poly: false, kgPerDay: 10000 });
}

module.exports = { createSiliconMetalCase, siliconChain };
