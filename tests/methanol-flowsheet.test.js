const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { solveOperation } = require('../engine/solve');
const { sizeToProduct } = require('../engine/size');
const { createMethanolCase, DAILY_PV } = require('../cases/methanol');
const { assertClosed } = require('./helpers.js');

const pvgis = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'pvgis-mejillones.json'), 'utf8'));

test('methanol plant runs DAC, SWRO, and electrolysis on the frozen Mejillones series and closes balances', () => {
  const definition = createMethanolCase();
  const solved = solveOperation(definition);
  assert.deepEqual(DAILY_PV.slice(1), pvgis.outputs.monthly.fixed.map(row => row.E_d));
  assert.equal(definition.site.meteo.dailyPVKWhPerKWp, DAILY_PV[0]);
  assert.equal(definition.graph.nodes.find(node => node.id === 'dac').unit, 'dac-solid');
  for (const node of definition.graph.nodes.filter(item => item.economics?.disposition === 'sale')) {
    assert.ok(node.economics.annualDemandLimit < 1e12, node.id);
  }
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: gridImport')));
  for (const id of ['methanol', 'electrolyzer', 'dac', 'swro']) assert.ok(solved.nodes[id].activity > 0, id);
  assertClosed(solved);
});

test('sizeToProduct methanol meets a sink target on the Mejillones plant', () => {
  const sized = sizeToProduct({ product: 'CH3OH', rate: 8, caseOrBuilder: () => createMethanolCase() });
  assert.equal(sized.product, 'methanol');
  assert.ok(Math.abs(sized.achieved - 8) < 1e-4, `achieved ${sized.achieved}`);
  assert.ok(sized.residual < 1e-6);
  assert.equal(sized.converged, true);
  assert.ok(sized.definition.graph.nodes.find(node => node.unit === 'methanol').capacity >= 8 - 1e-9);
  assert.ok(sized.definition.site.solarKWp > 20);
  assertClosed(sized.solved);
});
