const assert = require('node:assert/strict');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { createSabatierCase } = require('../cases/sabatier');

const H2_PER_CH4 = 4 * SUBSTANCES.H2.molarMassG / SUBSTANCES.CH4.molarMassG;
const CO2_PER_CH4 = SUBSTANCES.CO2.molarMassG / SUBSTANCES.CH4.molarMassG;

function assertClosed(solved) {
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
  assert.ok(Math.abs(solved.balances.electricityKWh) < 1e-8);
  assert.ok(Math.abs(solved.balances.heatKWh) < 1e-8);
  for (const [element, amount] of Object.entries(solved.balances.elements)) {
    assert.ok(Math.abs(amount) < 1e-8, `${element} balance should close`);
  }
}

test('integrated DAC + SWRO/electrolysis + Sabatier closes stoichiometry and balances', () => {
  const solved = solveOperation(createSabatierCase());
  const sabatier = solved.nodes.sabatier;
  const methane = sabatier.outlets.methane;

  assert.equal(sabatier.activity, 5);
  assert.equal(sabatier.limitedBy.length, 0);
  assert.ok(Math.abs(streamMassKg(methane) - 5) < 1e-8);
  assert.ok(Math.abs(
    sabatier.consumed.hydrogen.mol.H2
      - sabatier.consumed.co2.mol.CO2 * 4
  ) < 1e-8);
  assert.ok(Math.abs(
    methane.mol.CH4 - sabatier.consumed.co2.mol.CO2
  ) < 1e-8);
  assert.ok(Math.abs(sabatier.outlets.water.mol.H2O - methane.mol.CH4 * 2) < 1e-8);
  assert.ok(sabatier.consumed.electricity.kWh > 0);
  assertClosed(solved);
});

test('Sabatier product water recycles into electrolysis and reduces desalination demand', () => {
  const baseline = solveOperation(createSabatierCase());
  const solved = solveOperation(createSabatierCase({ recycleWater: true }));
  const recycle = solved.streams.find(stream => stream.recycle);

  assert.equal(solved.convergence.converged, true);
  assert.ok(solved.convergence.iterations > 1);
  assert.ok(Math.abs(solved.nodes.sabatier.activity - 5) < 1e-8);
  assert.ok(solved.nodes.swro.activity < baseline.nodes.swro.activity);
  assert.ok(Math.abs(streamMassKg(recycle.stream) - streamMassKg(solved.nodes.sabatier.outlets.water)) < 1e-8);
  assertClosed(solved);
});

test('Sabatier reports CO2 as the limiting feed without inventing methane', () => {
  const capturedCo2Kg = 200 * SUBSTANCES.CO2.molarMassG / 1000 * 0.9;
  const solved = solveOperation(createSabatierCase({
    air: {
      kind: 'material',
      mol: { CO2: 200, N2: 1800 },
      phase: 'gas',
      T_C: 25,
      P_bar: 1,
    },
    h2Requested: capturedCo2Kg / CO2_PER_CH4 * H2_PER_CH4,
    // Match DAC's consumed heat at the reduced CO2 feed so the boundary closes.
    heatKWh: 200 * 44.0095 / 1000 * 0.9 * 1.5,
  }));
  const sabatier = solved.nodes.sabatier;
  const capturedKg = streamMassKg(solved.nodes.sabatier.consumed.co2);

  assert.ok(sabatier.activity < 5);
  assert.ok(sabatier.limitedBy.includes('co2'));
  assert.ok(Math.abs(sabatier.activity - capturedKg / CO2_PER_CH4) < 1e-8);
  assertClosed(solved);
});

test('Sabatier reports hydrogen as the limiting feed when electrolysis is curtailed', () => {
  const solved = solveOperation(createSabatierCase({
    h2Requested: 1,
    dacRequested: CO2_PER_CH4 / H2_PER_CH4,
  }));
  const sabatier = solved.nodes.sabatier;
  const hydrogenKg = streamMassKg(sabatier.consumed.hydrogen);

  assert.ok(sabatier.activity < 5);
  assert.ok(sabatier.limitedBy.includes('hydrogen'));
  assert.ok(Math.abs(sabatier.activity - hydrogenKg / H2_PER_CH4) < 1e-8);
  assertClosed(solved);
});

test('Sabatier capacity limit keeps matching upstream setpoints and balances closed', () => {
  const solved = solveOperation(createSabatierCase({ sabatierRequested: 5, sabatierCapacity: 2 }));

  assert.equal(solved.nodes.sabatier.activity, 2);
  assert.deepEqual(solved.nodes.sabatier.limitedBy, ['capacity']);
  assertClosed(solved);
});

test('site source and disposal constraints stop or throttle production cleanly', () => {
  for (const overrides of [
    { sunlightHours: 0, gridElectricityKWh: 0 },
    { seawaterAvailableM3: 0 },
    { airIntakeKg: 0 },
  ]) {
    const solved = solveOperation(createSabatierCase({ ...overrides, enforceSiteConstraints: true }));
    assert.equal(solved.nodes.sabatier.activity, 0);
    assertClosed(solved);
  }

  for (const [overrides, warning] of [
    [{ brineCapacityKg: 5 }, 'brine disposal'],
    [{ offgasCapacityKg: 10 }, 'off-gas discharge'],
  ]) {
    const solved = solveOperation(createSabatierCase({ ...overrides, enforceSiteConstraints: true }));
    assert.ok(solved.nodes.sabatier.activity < 5);
    assert.ok(solved.warnings.some(message => message.includes(warning)));
    assertClosed(solved);
  }
});

test('feed gas ppm presets use realistic ambient and flue-gas CO2 fractions', () => {
  for (const [overrides, expectedPpm] of [
    [{ gasPreset: 'ambient' }, 428],
    [{ gasPreset: 'natural_gas_flue' }, 40000],
    [{ gasPreset: 'coal_flue' }, 130000],
    [{ gasPreset: 'custom', co2Ppm: 12345 }, 12345],
  ]) {
    const gas = createSabatierCase(overrides).graph.nodes.find(node => node.id === 'air').params.stream;
    const totalMol = Object.values(gas.mol).reduce((sum, mol) => sum + mol, 0);
    assert.ok(Math.abs(gas.mol.CO2 / totalMol * 1e6 - expectedPpm) < 1e-8);
  }

  const ambient = solveOperation(createSabatierCase({
    gasPreset: 'ambient', airIntakeKg: 82, offgasCapacityKg: 100000, enforceSiteConstraints: true,
  }));
  assert.ok(streamMassKg(ambient.nodes.dac.outlets.capturedCo2) < 0.06);
  assertClosed(ambient);
});
