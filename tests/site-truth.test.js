const assert = require('node:assert/strict');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { sizeToProduct } = require('../engine/size');
const { createCoastalCase, DAILY_PV, INTAKE_M3_PER_DAY } = require('../cases/coastal');
const { siteDeadSeaAbundance, DEAD_SEA_PV } = require('../cases/brine-hubs');

const warned = (solved, right) => solved.warnings.some(message => message.includes(`unverified site right: ${right}`));

test('Almería site truth binds annual-mean PV and a full-ion seawater intake; solve warns on unverified rights only', () => {
  const definition = createCoastalCase();
  const { site } = definition;
  assert.equal(site.dailyPVKWhPerKWp, DAILY_PV[0]);
  const seawater = site.resources.seawater.stream;
  assert.ok(seawater.mol['Mg+2'] > 0 && seawater.mol['SO4-2'] > 0, 'not a NaCl proxy');
  assert.ok(Math.abs(streamMassKg(seawater) - INTAKE_M3_PER_DAY * 1026) < 1e-9);
  assert.equal(site.resources.grid.stream.kWh, 0);
  assert.equal(definition.graph.nodes.find(node => node.unit === 'swro').params.feedDensityKgM3, 1026);

  const solved = solveOperation(definition);
  for (const right of ['gridImport', 'freshwater', 'seawaterDischarge']) {
    assert.equal(site.rights[right].authorize, false, right);
    assert.ok(warned(solved, right), right);
  }
  assert.equal(site.rights.seawaterIntake.authorize, true);
  assert.ok(!warned(solved, 'seawaterIntake'));
});

test('Dead Sea site truth is an Mg-rich brine with an unverified concession', () => {
  const definition = siteDeadSeaAbundance();
  const { site } = definition;
  assert.equal(site.dailyPVKWhPerKWp, DEAD_SEA_PV);
  const brine = site.resources.brine.stream;
  assert.ok(brine.mol['Li+'] > 0);
  const mgKg = brine.mol['Mg+2'] * SUBSTANCES['Mg+2'].molarMassG / 1000;
  const naKg = brine.mol['Na+'] * SUBSTANCES['Na+'].molarMassG / 1000;
  assert.ok(mgKg > naKg, 'Dead Sea open water is Mg-rich relative to Na');

  const solved = solveOperation(definition);
  assert.ok(warned(solved, 'brineConcession'));
  assert.ok(warned(solved, 'seawaterDischarge'));
  assert.ok(!warned(solved, 'saltPurchase'));
  assert.ok(solved.nodes.ammonia.activity > 0);
  assert.ok(solved.nodes['bromine-recovery'].activity > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('size-to-target cannot assume unverified intake or brine concession', () => {
  const coastal = createCoastalCase();
  coastal.site.rights.seawaterIntake.status = 'unverified';
  coastal.site.rights.seawaterIntake.authorize = false;
  assert.throws(() => sizeToProduct({ product: 'CH4', rate: 8, definition: coastal }), /size-to-target cannot assume seawaterIntake/);
  assert.throws(
    () => sizeToProduct({ product: 'lithium', rate: 1, definition: siteDeadSeaAbundance() }),
    /size-to-target cannot assume brineConcession/,
  );
});
