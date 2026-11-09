const assert = require('node:assert/strict');
const test = require('node:test');

const { solveOperation } = require('../engine/solve');
const { createCoastalCase, DAILY_PV } = require('../cases/coastal');
const pvgis = require('../data/pvgis-almeria.json');
const { assertClosed } = require('./helpers.js');

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

test('requesting more electricity than the site budget cannot raise production', () => {
  const definition = createCoastalCase();
  const baseline = solveOperation(definition);
  definition.graph.nodes.find(node => node.id === 'electricity').params.stream.kWh *= 10;
  const solved = solveOperation(definition);

  assert.equal(solved.nodes.electricity.limitedBy[0], 'site budget');
  assert.ok(Math.abs(solved.nodes.sabatier.activity - baseline.nodes.sabatier.activity) < 1e-8);
  assert.ok(solved.nodes.electricity.supplied.kWh < definition.graph.nodes.find(node => node.id === 'electricity').params.stream.kWh);
  assertClosed(solved);
});

test('unverified grid imports stay at zero authorized supply', () => {
  const definition = createCoastalCase();
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
