// Primary aluminium on sunlight: crustal bauxite → Bayer alumina → Hall–Héroult smelter, sold as
// ingot. Same Bayer and smelter screening packs, energies and feeds as the PV-module chain
// (cases/silicon.js), at a stand-alone smelter scale.
const { SUBSTANCES } = require('../engine/model');
const tea = require('../data/tea-screening.js');
const { MEJILLONES_PVGIS_URL: PVGIS_URL, MEJILLONES_URL, projectEconomics, material, right, nodeFinder, clone, solarPowerNode, powerToBusEdge } = require('./_shared.js');
const DAILY_PV_ED = 5.27;
const AL_KG_PER_DAY = 10000;
const FEED_MARGIN = 1.05;
const USGS_AL = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-aluminum.pdf';
const USGS_BAUXITE = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-bauxite-alumina.pdf';
const DOE_AL = 'https://www.energy.gov/sites/prod/files/2013/11/f4/al_roadmap.pdf';
const IAI_ALUMINA_ENERGY = 'https://international-aluminium.org/statistics/metallurgical-alumina-refining-energy-intensity/';
const REGION = 'Atacama/Chile';

function createAluminiumCase() {
  const aluminaKgPerDay = AL_KG_PER_DAY * 0.5 * SUBSTANCES.Al2O3.molarMassG / SUBSTANCES.Al.molarMassG;
  const bauxiteKg = aluminaKgPerDay * 2.0 * FEED_MARGIN;
  const causticKg = aluminaKgPerDay * 0.08 * FEED_MARGIN;
  const anodeKg = AL_KG_PER_DAY * 0.75 * SUBSTANCES.C.molarMassG / SUBSTANCES.Al.molarMassG * FEED_MARGIN;
  const kWhPerDay = aluminaKgPerDay * 3.5 + AL_KG_PER_DAY * 14;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const bauxite = material('Bauxite', bauxiteKg);
  const caustic = material('NaOH', causticKg, 'liquid');
  const anode = material('C', anodeKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: projectEconomics(),
    graph: {
      nodes: [
        { id: 'bauxite', unit: 'material-source', sourcePreset: 'bauxite', params: { stream: bauxite }, economics: tea.bindCost('bauxite', { freight: 'bulk-dry-shortsea' }) },
        { id: 'caustic', unit: 'material-source', sourcePreset: 'caustic', params: { stream: caustic }, economics: tea.bindCost('caustic-makeup', { freight: 'chile-coast-container' }) },
        { id: 'anode', unit: 'material-source', sourcePreset: 'carbon', params: { stream: anode }, economics: tea.bindCost('carbon-anode', { freight: 'bulk-dry-shortsea' }) },
        solarPowerNode(power, solarKWp, REGION),
        { id: 'power-bus', unit: 'electrical-bus' },
        { id: 'bayer-alumina', unit: 'bayer-alumina', capacity: aluminaKgPerDay, params: { electricityKWhPerKg: 3.5 }, economics: tea.bindCapexPack('bayer-alumina', { capacity: aluminaKgPerDay, region: REGION }) },
        { id: 'aluminium-smelter', unit: 'aluminium-smelter', capacity: AL_KG_PER_DAY, params: { electricityKWhPerKg: 14 }, economics: tea.bindCapexPack('aluminium-smelter', { capacity: AL_KG_PER_DAY, region: REGION }) },
        { id: 'aluminium', unit: 'material-sink', economics: tea.bindSale('aluminium', { region: REGION, freight: 'chile-coast-container' }) },
        { id: 'carbonDioxide', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'redMud', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'bauxite', port: 'out' }, to: { node: 'bayer-alumina', port: 'bauxite' } },
        { from: { node: 'caustic', port: 'out' }, to: { node: 'bayer-alumina', port: 'caustic' } },
        { from: { node: 'bayer-alumina', port: 'alumina' }, to: { node: 'aluminium-smelter', port: 'alumina' } },
        { from: { node: 'anode', port: 'out' }, to: { node: 'aluminium-smelter', port: 'carbon' } },
        powerToBusEdge(),
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'bayer-alumina', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'aluminium-smelter', port: 'electricity' } },
        { from: { node: 'aluminium-smelter', port: 'aluminium' }, to: { node: 'aluminium', port: 'in' } },
        { from: { node: 'aluminium-smelter', port: 'carbonDioxide' }, to: { node: 'carbonDioxide', port: 'in' } },
        { from: { node: 'bayer-alumina', port: 'redMud' }, to: { node: 'redMud', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { 'bayer-alumina': aluminaKgPerDay, 'aluminium-smelter': AL_KG_PER_DAY },
      priorities: { 'power-bus': ['bayer-alumina', 'aluminium-smelter'] },
    },
  };
  const node = nodeFinder(definition);
  node('power').siteResource = 'electricity';
  node('bauxite').siteResource = 'bauxite';
  node('caustic').siteResource = 'caustic';
  node('anode').siteResource = 'anode';
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
        evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day (frozen data/pvgis-mejillones.json) × array sized to the Bayer alumina + Hall–Héroult load with 2% margin. Not a SEN interconnection or port lease.',
      },
      bauxite: {
        stream: clone(node('bauxite').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased bauxite assumed available at screening $0.04/kg plant-gate plus screening bulk-dry-shortsea freight $0.03/kg. Not a concession or port lease.',
      },
      caustic: {
        stream: clone(node('caustic').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased NaOH makeup at the caustic commodity band $0.45/kg plus screening chile-coast-container freight $0.08/kg. Not a contract.',
      },
      anode: {
        stream: clone(node('anode').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased Hall–Héroult anode carbon at screening $0.50/kg plus screening bulk-dry-shortsea freight $0.03/kg. Not a calcined-coke contract.',
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
      brineConcession: right('concession', 'unverified', 'No brine; purchased bauxite, caustic and anode carbon are not a mineral concession', [
        { label: 'USGS MCS 2025 bauxite and alumina (commodity context, not a concession)', url: USGS_BAUXITE },
      ]),
      bauxitePurchase: right('purchase', 'assumed', 'Purchased bauxite assumed available; not a mine contract or port lease', [
        { label: 'USGS MCS 2025 bauxite and alumina (commodity context, not a mine contract)', url: USGS_BAUXITE },
      ]),
      causticPurchase: right('purchase', 'assumed', 'Purchased NaOH makeup assumed available at the caustic band; not a contract', [
        { label: 'NaOH commodity band (same $/kg as caustic product price; not a contract)', url: null },
      ]),
    },
    evidence: [
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly; E_d 5.27', url: PVGIS_URL },
      { label: 'USGS MCS 2025 aluminum ingot (price $2.87/kg; world smelter ~72 Mt 2024e)', url: USGS_AL },
      { label: 'USGS MCS 2025 bauxite and alumina', url: USGS_BAUXITE },
      { label: 'IAI metallurgical alumina refining energy intensity (~10–12 GJ/t; screening 3.5 kWh/kg proxy)', url: IAI_ALUMINA_ENERGY },
      { label: 'DOE aluminium industry roadmap (Hall–Héroult ~13–15 kWh/kg; screening 14)', url: DOE_AL },
    ],
    notes: 'Screening crustal bauxite → Bayer alumina (2.0 kg ore + 0.08 kg NaOH makeup + 3.5 kWh/kg total-energy-as-electricity proxy; not a full Bayer train) → Hall–Héroult Al (14 kWh/kg; 0.75 mol C per mol Al prebaked anode) → primary ingot sold at USGS $2.87/kg net of screening container freight. Same packs and assumptions as the PV-module chain (cases/silicon.js) at a 10 t/day smelter. Smelter pots are baseload (they freeze if cut), Bayer digestion is heat (thermal store eligible). Not an inert-anode cell, not a smelter contract, not bankable.',
  };
  return definition;
}

module.exports = { createAluminiumCase };
