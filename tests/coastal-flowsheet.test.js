const assert = require('node:assert/strict');
const test = require('node:test');

const { UNITS } = require('../engine/units');
const { solveOperation, solveHorizon } = require('../engine/solve');
const { createCoastalCase, DAILY_PV } = require('../cases/coastal');

const pvgis = require('../data/pvgis-almeria.json');

function assertClosed(solved) {
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
  assert.ok(Math.abs(solved.balances.electricityKWh) < 1e-8);
  assert.ok(Math.abs(solved.balances.heatKWh) < 1e-8);
}

test('coastal methane uses solid-sorbent DAC on the frozen Almería series and closes balances', () => {
  const definition = createCoastalCase();
  const solved = solveOperation(definition);
  assert.equal(definition.graph.nodes.find(node => node.id === 'dac').unit, 'dac-solid');
  assert.equal(definition.site.meteo.dailyPVKWhPerKWp, DAILY_PV[0]);
  assert.deepEqual(DAILY_PV.slice(1), pvgis.outputs.monthly.fixed.map(row => row.E_d));
  assert.ok(Math.abs(solved.nodes.sabatier.activity - 5) < 1e-9);
  assert.equal(solved.nodes['spent-media'].received.chemicalId, 'amine-sorbent');
  assert.ok(solved.nodes['spent-media'].received.amount > 0);
  assertClosed(solved);
});

test('December PVGIS yield throttles coastal methane below the annual case', () => {
  const annual = solveOperation(createCoastalCase(0));
  const december = solveOperation(createCoastalCase(12));

  assert.ok(december.nodes.sabatier.activity < annual.nodes.sabatier.activity);
  assert.ok(december.warnings.some(message => message.includes('site solar electricity')));
  assertClosed(december);
});

test('requesting more electricity than the site budget cannot raise production', () => {
  const definition = createCoastalCase(12);
  const baseline = solveOperation(definition);
  definition.graph.nodes.find(node => node.id === 'electricity').params.stream.kWh *= 10;
  const solved = solveOperation(definition);

  assert.equal(solved.nodes.electricity.limitedBy[0], 'site budget');
  assert.ok(Math.abs(solved.nodes.sabatier.activity - baseline.nodes.sabatier.activity) < 1e-8);
  assert.ok(solved.nodes.electricity.supplied.kWh < definition.graph.nodes.find(node => node.id === 'electricity').params.stream.kWh);
  assertClosed(solved);
});

test('unverified grid imports stay at zero authorized supply', () => {
  const definition = createCoastalCase(12);
  const electricity = definition.graph.nodes.find(node => node.id === 'electricity');
  electricity.siteResource = 'grid';
  electricity.params.stream = { kind: 'electricity', kWh: 1000 };
  const solved = solveOperation(definition);

  assert.equal(solved.nodes.electricity.supplied.kWh, 0);
  assert.equal(solved.nodes.sabatier.activity, 0);
  assertClosed(solved);
});

test('an unassigned source on a sited factory is rejected', () => {
  const definition = createCoastalCase();
  delete definition.graph.nodes.find(node => node.id === 'heat').siteResource;
  assert.throws(() => solveOperation(definition), /verified or explicitly assumed site resource/);
});

test('hourly typical-day dispatch idles at night and produces in daylight', () => {
  const solved = solveHorizon(createCoastalCase(12));
  assert.ok(solved.horizon.hours.length === 24);
  assert.equal(solved.horizon.hours[0].pv, 0);
  assert.equal(solved.horizon.hours[0].methane, 0);
  assert.ok(solved.horizon.hours.some(entry => entry.pv > 0 && entry.methane > 0));
  assert.ok(solved.nodes.sabatier.activity > 0);
  assert.ok(solved.nodes.sabatier.activity < 5);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
  const june = solveHorizon(createCoastalCase(6));
  assert.ok(june.horizon.hours.filter(entry => entry.methane > 0).length > solved.horizon.hours.filter(entry => entry.methane > 0).length);
  const small = createCoastalCase(12);
  small.site.solarKWp = 10;
  assert.ok(solveHorizon(small).nodes.sabatier.activity < solved.nodes.sabatier.activity);
});

test('electro-swing DAC drops heat ports and requires quinone makeup', () => {
  assert.ok(UNITS['dac-solid'].ports.heat);
  assert.ok(UNITS['dac-solid'].ports.spentMedia);
  assert.equal(UNITS['dac-electroswing'].ports.heat, undefined);
  assert.equal(UNITS['dac-electroswing'].ports.wasteHeat, undefined);
  assert.ok(UNITS['dac-electroswing'].ports.spentMedia);
});
