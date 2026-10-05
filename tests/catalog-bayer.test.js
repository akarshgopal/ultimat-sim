const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createSiliconCase } = require('../cases/silicon');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function material(substance, mol, phase = 'solid') {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

function generousInlets() {
  return {
    bauxite: material('Bauxite', 10000),
    caustic: material('NaOH', 10000, 'liquid'),
    electricity: { kind: 'electricity', kWh: 1e6 },
  };
}

test('10 kg Al2O3 consumes 20 kg bauxite, 0.8 kg NaOH, 35 kWh; red mud ~10 kg; no wasteHeat; extra feed throws', () => {
  assert.equal(SUBSTANCES.Bauxite.molarMassG, 1000);
  assert.deepEqual(SUBSTANCES.Bauxite.elements, { Al: 1 });
  assert.equal(SUBSTANCES.Al2O3.molarMassG, 101.96008);

  const result = UNITS['bayer-alumina'].evaluate({
    inlets: generousInlets(),
    requestedActivity: 10,
    capacity: 100,
  });
  assert.equal(result.activity, 10);
  assert.ok(Math.abs(streamMassKg(result.consumed.bauxite) - 20) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.consumed.caustic) - 0.8) < 1e-9);
  assert.equal(result.consumed.electricity.kWh, 35);
  assert.ok(Math.abs(streamMassKg(result.outlets.alumina) - 10) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.outlets.redMud) - 10) < 1e-9);
  assert.equal(result.outlets.wasteHeat, undefined);
  assert.equal(UNITS['bayer-alumina'].ports.wasteHeat, undefined);
  assert.ok(UNITS['bayer-alumina'].ports.bauxite.direction === 'in');
  assert.ok(UNITS['bayer-alumina'].ports.caustic.direction === 'in');
  assert.ok(UNITS['bayer-alumina'].ports.electricity.direction === 'in');
  assert.ok(UNITS['bayer-alumina'].ports.alumina.direction === 'out');
  assert.ok(UNITS['bayer-alumina'].ports.redMud.direction === 'out');

  assert.throws(() => UNITS['bayer-alumina'].evaluate({
    inlets: { ...generousInlets(), bauxite: { kind: 'material', mol: { Bauxite: 10, Si: 1 }, phase: 'solid', T_C: 25, P_bar: 1 } },
    requestedActivity: 10,
    capacity: 100,
  }));
});

test('TEA bauxite cost 0.04, Bayer pack 500; aluminium-smelter / pv-module / alumina $0.45 untouched', () => {
  assert.equal(tea.costs.bauxite.value, 0.04);
  assert.equal(tea.costs.bauxite.quality, 'screening');
  assert.ok(tea.costs.bauxite.evidence.some(item => /usgs\.gov.*bauxite/i.test(item.url || '')));
  assert.equal(tea.costs['caustic-makeup'].value, tea.prices.caustic.value);
  assert.equal(tea.costs['caustic-makeup'].value, 0.45);
  assert.equal(tea.packs['bayer-alumina'].capexIntensity, 500);
  assert.equal(tea.packs['bayer-alumina'].fixedOmPercent, 4);
  assert.equal(tea.packs['bayer-alumina'].variableOm, 0.03);
  assert.equal(tea.packs['bayer-alumina'].assetLifeYears, 20);
  assert.equal(tea.packs['bayer-alumina'].quality, 'screening');
  assert.equal(tea.packs['aluminium-smelter'].capexIntensity, 1800);
  assert.equal(tea.packs['pv-module'].capexIntensity, 700);
  assert.equal(tea.costs.alumina.value, 0.45);
  assert.equal(tea.prices.aluminium.value, 2.87);
  assert.equal(tea.prices.silicon.value, 3.97);
  assert.equal(tea.prices.polysilicon.value, 6);
  assert.equal(tea.prices['pv-module'].value, 2.85);
  assert.equal(tea.demand.bauxite, undefined);
  assert.equal(tea.demand.alumina, undefined);
});

test('Mejillones Bayer island solves at Al 127.3 stoichiometry without purchased alumina or electricity bind', () => {
  const definition = createSiliconCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  const aluminaStoich = 127.3 * 0.5 * SUBSTANCES.Al2O3.molarMassG / SUBSTANCES.Al.molarMassG;
  assert.ok(Math.abs(solved.nodes['bayer-alumina'].activity - aluminaStoich) / aluminaStoich < 0.01);
  assert.ok(Math.abs(solved.nodes['aluminium-smelter'].activity - 127.3) / 127.3 < 0.01);
  assert.ok(Math.abs(solved.nodes['pv-module'].activity - 1000) / 1000 < 0.01);
  assert.equal(definition.graph.nodes.find(node => node.id === 'alumina'), undefined);
  assert.ok(definition.graph.nodes.some(node => node.id === 'bauxite' && node.unit === 'material-source'));
  assert.ok(definition.graph.nodes.some(node => node.id === 'caustic' && node.unit === 'material-source'));
  assert.ok(definition.graph.nodes.some(node => node.id === 'redMud' && node.economics?.disposition === 'vent'));
  const limited = [
    ...(solved.nodes['bayer-alumina'].limitedBy || []),
    ...(solved.nodes['aluminium-smelter'].limitedBy || []),
    ...(solved.nodes['pv-module'].limitedBy || []),
    ...(solved.warnings || []),
  ].join(' ');
  assert.doesNotMatch(limited, /electricity/i);
  const furnaceCapex = id => {
    const node = definition.graph.nodes.find(item => item.id === id);
    return Number(node.economics.installedCapex) || Number(node.economics.capexRate) * Number(node.capacity);
  };
  assert.ok(furnaceCapex('bayer-alumina') > 0);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash));
  assert.ok(Number.isFinite(cash.annualRevenue));
});

test('palette Crust lists bayer-alumina between polysilicon and aluminium-smelter; Overview mentions Bayer', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Crust:\s*\[\s*'mg-si',\s*'polysilicon',\s*'bayer-alumina',\s*'aluminium-smelter',\s*'float-glass',\s*'pv-module',\s*'hydrogen-dri',\s*'titanium-kroll'\s*\]/);
  assert.match(html, /id="loadSiliconAlumina"/);
  assert.match(html, /Mejillones PV BOM \(Bayer Al \+ poly-Si \+ Ag\/glass\/EVA\)/);
  assert.match(html, /cases\/silicon\.js/);
  const pad = PROCESS_INTENSITIES['bayer-alumina'];
  assert.equal(pad.intensity, 12);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [6, 24]);
  assert.equal(pad.floorM2, 40);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
