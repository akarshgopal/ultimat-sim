// Shared case-builder helpers. Load after engine/model.js and data/tea-screening.js,
// before any other cases/*.js script. Every helper returns a fresh object so a case
// can mutate its definition without leaking into other cases.
(function exposeCaseShared(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaseShared = api;
})(globalThis, (model, tea) => {
const { SUBSTANCES } = model;

// Mejillones, Antofagasta (−23.100, −70.448) — shared site for the Chilean coast cases.
const MEJILLONES_PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-23.100&lon=-70.448&peakpower=1&loss=14&angle=23&aspect=180&outputformat=json';
const MEJILLONES_URL = 'https://en.wikipedia.org/wiki/Mejillones';

function projectEconomics() {
  return { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 };
}

// Single-substance material stream at 25 °C / 1 bar from a mass in kg.
function material(substance, kg, phase) {
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

return {
  MEJILLONES_PVGIS_URL,
  MEJILLONES_URL,
  projectEconomics,
  material,
  streamFromAssay,
  right,
  nodeFinder,
  clone,
  solarPowerNode,
  powerToBusEdge,
};
});
