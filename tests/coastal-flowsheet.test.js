const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { createCoastalCase, DAILY_PV } = require('../cases/coastal');

const pvgis = require('../data/pvgis-almeria.json');

function assertClosed(solved) {
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
  assert.ok(Math.abs(solved.balances.electricityKWh) < 1e-8);
  assert.ok(Math.abs(solved.balances.heatKWh) < 1e-8);
}

test('frozen PVGIS monthly yields match the Almería snapshot', () => {
  assert.equal(DAILY_PV[0], pvgis.outputs.totals.fixed.E_y / 365);
  for (const row of pvgis.outputs.monthly.fixed) {
    assert.equal(DAILY_PV[row.month], row.E_d);
  }
});

test('coastal methane uses solid-sorbent DAC and closes balances', () => {
  const definition = createCoastalCase();
  const solved = solveOperation(definition);

  assert.equal(definition.graph.nodes.find(node => node.id === 'dac').unit, 'dac-solid');
  assert.equal(definition.site.resources.grid.quality, 'unverified');
  assert.equal(definition.site.resources.freshwater.quality, 'unverified');
  assert.equal(solved.nodes.sabatier.activity, 5);
  assert.ok(solved.nodes['spent-media'].received.amount > 0);
  assert.equal(solved.nodes['spent-media'].received.chemicalId, 'amine-sorbent');
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

test('two seawater intakes share one site budget instead of duplicating it', () => {
  const baseline = solveOperation(createCoastalCase(12));
  const definition = createCoastalCase(12);
  const seawater = definition.graph.nodes.find(node => node.id === 'seawater');
  const feed = definition.graph.edges.find(edge => edge.to.node === 'swro' && edge.to.port === 'feed');
  definition.graph.nodes.push(
    { id: 'seawater-2', unit: 'material-source', siteResource: 'seawater', params: { stream: JSON.parse(JSON.stringify(seawater.params.stream)) } },
    { id: 'intake-mixer', unit: 'material-mixer' },
  );
  feed.from = { node: 'intake-mixer', port: 'out' };
  definition.graph.edges.push(
    { from: { node: 'seawater', port: 'out' }, to: { node: 'intake-mixer', port: 'in' } },
    { from: { node: 'seawater-2', port: 'out' }, to: { node: 'intake-mixer', port: 'in' } },
  );
  const solved = solveOperation(definition);
  const intake = streamMassKg(solved.nodes['intake-mixer'].available);
  const budget = streamMassKg(definition.site.resources.seawater.stream);

  assert.ok(Math.abs(intake - budget) < 1e-8);
  assert.ok(solved.nodes['seawater-2'].limitedBy.includes('site budget'));
  assert.ok(solved.nodes.sabatier.activity <= baseline.nodes.sabatier.activity + 1e-8);
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

test('solid-sorbent DAC rejects the wrong makeup chemical', () => {
  const sited = createCoastalCase();
  sited.graph.nodes.find(node => node.id === 'consumables').params.stream.chemicalId = 'quinone-electrode';
  assert.throws(() => solveOperation(sited), /incompatible site consumable/);

  const unsited = createCoastalCase();
  delete unsited.site;
  unsited.graph.nodes.find(node => node.id === 'consumables').params.stream.chemicalId = 'quinone-electrode';
  assert.throws(() => solveOperation(unsited), /amine-sorbent/);
});

test('electro-swing DAC drops heat ports and requires quinone makeup', () => {
  assert.ok(UNITS['dac-solid'].ports.heat);
  assert.ok(UNITS['dac-solid'].ports.spentMedia);
  assert.equal(UNITS['dac-electroswing'].ports.heat, undefined);
  assert.equal(UNITS['dac-electroswing'].ports.wasteHeat, undefined);
  assert.ok(UNITS['dac-electroswing'].ports.spentMedia);
});
