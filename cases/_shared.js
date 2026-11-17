// Shared case-builder helpers. Every helper returns a fresh object so a case can mutate its
// definition without leaking into other cases.
const { SUBSTANCES, streamMassKg } = require('../engine/model');
const tea = require('../data/tea-screening.js');

// Mejillones, Antofagasta (−23.100, −70.448) — shared site for the Chilean coast cases.
const MEJILLONES_PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const MEJILLONES_URL = 'https://en.wikipedia.org/wiki/Mejillones';
const MILLERO_URL = 'https://doi.org/10.1016/j.dsr.2007.10.001';
const WOA_URL = 'https://doi.org/10.25923/70qt-9574';
// Ambient-air preset ratios from the flowsheet air source (N₂-dominated).
const AIR_N2 = 788163;
const AIR_O2 = 211409;
const AIR_CO2 = 428;

function projectEconomics() {
  return { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 };
}

// Single-substance material stream at 25 °C / 1 bar from a mass in kg.
function material(substance, kg, phase = 'solid') {
  return {
    kind: 'material',
    mol: { [substance]: kg * 1000 / SUBSTANCES[substance].molarMassG },
    phase,
    T_C: 25,
    P_bar: 1,
  };
}

// Liquid stream from a seawater/brine assay (ions_g_per_kg + mol_per_kg) and a total mass in kg;
// water is the mass balance after dissolved salts.
function streamFromAssay(assay, massKg) {
  const gPerKg = assay.ions_g_per_kg;
  const molPerKg = assay.mol_per_kg;
  const saltMassKg = Object.values(gPerKg).reduce((sum, grams) => sum + grams, 0) / 1000 * massKg;
  const mol = {
    H2O: (massKg - saltMassKg) * 1000 / SUBSTANCES.H2O.molarMassG,
  };
  for (const [id, amount] of Object.entries(molPerKg)) mol[id] = amount * massKg;
  return { kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1, mol };
}

function scaleMaterial(stream, targetKg) {
  const factor = targetKg / streamMassKg(stream);
  return { ...stream, mol: Object.fromEntries(Object.entries(stream.mol).map(([id, mol]) => [id, mol * factor])) };
}

// 1e6 mol of dry gas at co2Ppm CO₂; the balance splits O₂/N₂ by oxygenShare.
function gasFromCo2Ppm(co2Ppm, oxygenShare) {
  if (!Number.isFinite(co2Ppm) || co2Ppm < 0 || co2Ppm > 1e6) {
    throw new Error('co2Ppm must be between 0 and 1,000,000');
  }
  const co2Mol = co2Ppm;
  const balanceMol = 1e6 - co2Mol;
  return {
    kind: 'material',
    mol: { CO2: co2Mol, O2: balanceMol * oxygenShare, N2: balanceMol * (1 - oxygenShare) },
    phase: 'gas',
    T_C: 25,
    P_bar: 1,
  };
}

// Ambient air carrying nitrogenKg of N₂.
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

function right(kind, status, note, evidence) {
  return {
    kind,
    status,
    authorize: status === 'authorized' || status === 'assumed',
    note,
    ...(evidence ? { evidence } : {}),
  };
}

function nodeFinder(definition) {
  return id => definition.graph.nodes.find(item => item.id === id);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// On-site solar PV electricity source, CAPEX bound to the solar-pv pack.
function solarPowerNode(power, solarKWp, region) {
  return { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region }) };
}

function powerToBusEdge() {
  return { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } };
}

module.exports = {
  MEJILLONES_PVGIS_URL,
  MEJILLONES_URL,
  MILLERO_URL,
  WOA_URL,
  projectEconomics,
  material,
  streamFromAssay,
  scaleMaterial,
  gasFromCo2Ppm,
  airFromNitrogenKg,
  right,
  nodeFinder,
  clone,
  solarPowerNode,
  powerToBusEdge,
};
