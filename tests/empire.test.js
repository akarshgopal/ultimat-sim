const assert = require('node:assert/strict');
const test = require('node:test');

const { distanceKm, pvLandHa, evaluateEmpire } = require('../engine/empire');
const { createFuelsAndMineralsEmpire, siteDeadSeaAbundance } = require('../cases/empire');
const { solveOperation } = require('../engine/solve');

test('Almería to the Dead Sea is a multi-thousand kilometre haul', () => {
  const km = distanceKm(
    { latitude: 36.834, longitude: -2.463 },
    { latitude: 31.16, longitude: 35.43 }
  );
  assert.ok(km > 3000 && km < 4500);
  assert.ok(pvLandHa(50000) === 80);
});

test('Dead Sea brine hub closes balances on assumed solar and brine', () => {
  const definition = siteDeadSeaAbundance();
  const solved = solveOperation(definition);
  assert.equal(definition.site.resources.grid.quality, 'unverified');
  assert.ok(solved.nodes.ammonia.activity > 0);
  assert.ok(solved.nodes['bromine-recovery'].activity > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('fuels plus minerals empire rolls up CH4, NH3, and money', () => {
  const result = evaluateEmpire(createFuelsAndMineralsEmpire(6));
  assert.equal(result.plants.length, 2);
  assert.ok(result.slate.CH4 > 0);
  assert.ok(result.slate.NH3 > 0);
  assert.ok(result.slate.Br2 > 0);
  assert.ok(result.landHa > 0);
  assert.ok(result.installedCapex > result.plants[0].economics.installedCapex);
  assert.equal(result.npv, result.npv);
  assert.ok(Number.isFinite(result.npv));
  assert.ok(result.annualNetCash === result.annualRevenue - result.annualOperatingCost);
});
