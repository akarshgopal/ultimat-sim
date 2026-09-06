const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { createDacCase } = require('../cases/dac');

function assertClosed(solved) {
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
  assert.ok(Math.abs(solved.balances.electricityKWh) < 1e-8);
  assert.ok(Math.abs(solved.balances.heatKWh) < 1e-8);
}

test('DAC captures CO2, rejects air, and closes elemental/electric/heat balances', () => {
  const solved = solveOperation(createDacCase());
  const dac = solved.nodes.dac;

  assert.equal(dac.activity, 10);
  assert.deepEqual(dac.limitedBy, []);
  assert.ok(streamMassKg(solved.nodes['captured-co2'].received) > 0);
  assert.ok(streamMassKg(solved.nodes['depleted-air'].received) > 0);
  assertClosed(solved);

  for (const [element, amount] of Object.entries(solved.balances.elements)) {
    assert.ok(Math.abs(amount) < 1e-8, `${element} balance should close`);
  }
});

test('DAC reports heat quantity or temperature as its active limit', () => {
  const nominal = solveOperation(createDacCase());
  const requestedHeat = nominal.nodes.dac.requestedInputs.heat.kWh;
  const solved = solveOperation(createDacCase({ heatKWh: requestedHeat / 2 }));
  const dac = solved.nodes.dac;

  assert.ok(dac.activity < 10);
  assert.deepEqual(dac.limitedBy, ['heat']);
  assertClosed(solved);

  const cold = solveOperation(createDacCase({ heatT_C: 79 }));

  assert.equal(cold.nodes.dac.activity, 0);
  assert.deepEqual(cold.nodes.dac.limitedBy, ['heatTemperature']);
  assertClosed(cold);
});

test('DAC treats consumable makeup as an explicit limiting input', () => {
  const solved = solveOperation(createDacCase({ consumables: 0.1 }));

  assert.equal(solved.nodes.dac.activity, 5);
  assert.deepEqual(solved.nodes.dac.limitedBy, ['consumables']);
});
