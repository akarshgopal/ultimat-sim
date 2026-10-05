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
    polysilicon: material('Si', 10000),
    silver: material('Ag', 10000),
    glass: material('FloatGlass', 10000),
    eva: material('EVA', 10000),
    aluminium: material('Al', 10000),
    electricity: { kind: 'electricity', kWh: 1e6 },
  };
}

test('10 kg module consumes Fraunhofer BOM shares, 0.5 kWh, no wasteHeat; extra feed mol throws', () => {
  assert.equal(SUBSTANCES.Ag.molarMassG, 107.8682);
  assert.equal(SUBSTANCES.EVA.molarMassG, 86.09);
  assert.equal(SUBSTANCES.FloatGlass.molarMassG, 60.0843);
  assert.equal(SUBSTANCES.PVmodule.molarMassG, 1000);
  assert.notEqual('FloatGlass' in SUBSTANCES && 'SiO2' in SUBSTANCES, false);

  const result = UNITS['pv-module'].evaluate({
    inlets: generousInlets(),
    requestedActivity: 10,
    capacity: 100,
  });
  assert.equal(result.activity, 10);
  assert.ok(Math.abs(streamMassKg(result.consumed.polysilicon) - 0.273) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.consumed.silver) - 0.003) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.consumed.glass) - 6.745) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.consumed.eva) - 0.669) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.consumed.aluminium) - 1.273) < 1e-9);
  assert.equal(result.consumed.electricity.kWh, 0.5);
  assert.ok(Math.abs(streamMassKg(result.outlets.module) - 10) < 1e-9);
  assert.equal(result.outlets.wasteHeat, undefined);
  assert.equal(UNITS['pv-module'].ports.wasteHeat, undefined);
  assert.ok(UNITS['pv-module'].ports.polysilicon.direction === 'in');
  assert.ok(UNITS['pv-module'].ports.silver.direction === 'in');
  assert.ok(UNITS['pv-module'].ports.glass.direction === 'in');
  assert.ok(UNITS['pv-module'].ports.eva.direction === 'in');
  assert.ok(UNITS['pv-module'].ports.aluminium.direction === 'in');
  assert.ok(UNITS['pv-module'].ports.electricity.direction === 'in');
  assert.ok(UNITS['pv-module'].ports.module.direction === 'out');

  assert.throws(() => UNITS['pv-module'].evaluate({
    inlets: { ...generousInlets(), silver: { kind: 'material', mol: { Ag: 10, Si: 1 }, phase: 'solid', T_C: 25, P_bar: 1 } },
    requestedActivity: 10,
    capacity: 100,
  }));
});

test('TEA pv-module price, Ag/glass/EVA costs, pack, and demand', () => {
  assert.equal(tea.prices['pv-module'].value, 2.85);
  assert.equal(tea.prices['pv-module'].quality, 'screening');
  assert.equal(tea.costs.silver.value, 1221.73);
  assert.equal(tea.costs.silver.quality, 'cited');
  assert.ok(tea.costs.silver.evidence.some(item => /usgs\.gov.*silver/i.test(item.url || '')));
  assert.equal(tea.costs['float-glass'].value, 0.45);
  assert.equal(tea.costs['float-glass'].quality, 'screening');
  assert.equal(tea.costs['eva-encapsulant'].value, 2);
  assert.equal(tea.costs['eva-encapsulant'].quality, 'screening');
  assert.equal(tea.packs['pv-module'].capexIntensity, 700);
  assert.equal(tea.packs['pv-module'].fixedOmPercent, 4);
  assert.equal(tea.packs['pv-module'].variableOm, 0.03);
  assert.equal(tea.packs['pv-module'].assetLifeYears, 20);
  assert.equal(tea.packs['pv-module'].quality, 'screening');
  assert.equal(tea.demand['pv-module'].value, 5e6);
  assert.equal(tea.demand['pv-module'].quality, 'screening');
  assert.equal(tea.demandByRegion['asia-china']['pv-module'].value, 5e8);
  const europe = tea.demandByRegion.europe;
  assert.equal(europe['pv-module'].inherit, 'me-levant');
  assert.equal(europe['pv-module'].value, 5e6);
  const chile = tea.demandByRegion['chile-atacama'];
  assert.equal(chile['pv-module'].inherit, 'me-levant');
  assert.equal(chile['pv-module'].value, 5e6);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('pv-module'));
  assert.equal(tea.demand.quartz, undefined);
  assert.equal(tea.demand.alumina, undefined);
  assert.equal(tea.demand.silver, undefined);
});

test('Mejillones PV BOM case solves at 1000 kg module/day without electricity bind', () => {
  const definition = createSiliconCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes['pv-module'].activity - 1000) / 1000 < 0.01);
  assert.ok(Math.abs(solved.nodes.polysilicon.activity - 27.3) / 27.3 < 0.01);
  assert.ok(Math.abs(solved.nodes['mg-si'].activity - 28.665) / 28.665 < 0.01);
  assert.ok(Math.abs(solved.nodes['aluminium-smelter'].activity - 127.3) / 127.3 < 0.01);
  const limited = [
    ...(solved.nodes['pv-module'].limitedBy || []),
    ...(solved.nodes.polysilicon.limitedBy || []),
    ...(solved.nodes['mg-si'].limitedBy || []),
    ...(solved.nodes['aluminium-smelter'].limitedBy || []),
    ...(solved.warnings || []),
  ].join(' ');
  assert.doesNotMatch(limited, /electricity/i);
  const moduleSink = definition.graph.nodes.find(node => node.id === 'module');
  assert.equal(moduleSink.economics.disposition, 'sale');
  assert.equal(moduleSink.economics.gateUnitPrice, 2.85);
  assert.equal(moduleSink.economics.unitPrice, 2.77);
  assert.equal(moduleSink.economics.freightUsdPerKg, 0.08);
  assert.ok(!definition.graph.nodes.some(node => node.economics?.unitCost === 0.04 && node.unit === 'electricity-source'));
  const power = definition.graph.nodes.find(node => node.id === 'power').economics;
  assert.equal(power.unitCost, undefined);
  const furnaceCapex = id => {
    const node = definition.graph.nodes.find(item => item.id === id);
    return Number(node.economics.installedCapex) || Number(node.economics.capexRate) * Number(node.capacity);
  };
  assert.ok(furnaceCapex('pv-module') > 0);
  assert.ok(furnaceCapex('polysilicon') > 0);
  assert.ok(furnaceCapex('mg-si') > 0);
  assert.ok(furnaceCapex('aluminium-smelter') > 0);
  assert.ok((Number(power.installedCapex) || Number(power.capexIntensity)) > 0);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash));
  assert.ok(Number.isFinite(cash.annualRevenue));
});

test('palette Crust lists pv-module after aluminium-smelter; Overview mentions BOM or module', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Crust:\s*\[\s*'mg-si',\s*'polysilicon',\s*'bayer-alumina',\s*'aluminium-smelter',\s*'pv-module'\s*\]/);
  assert.match(html, /id="loadSiliconAlumina"/);
  assert.match(html, /Mejillones PV BOM \(Bayer Al \+ poly-Si \+ Ag\/glass\/EVA\)/);
  assert.match(source, /screening module assembly on frozen Mejillones PV/);
  assert.match(html, /cases\/silicon\.js/);
  const pad = PROCESS_INTENSITIES['pv-module'];
  assert.equal(pad.intensity, 4);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [2, 8]);
  assert.equal(pad.floorM2, 40);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
