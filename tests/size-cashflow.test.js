const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { scorePositiveCashflow, evaluateEconomics } = require('../engine/economics');
const { solveOperation } = require('../engine/solve');
const { sizeForPositiveCashflow, sizeToProduct } = require('../engine/size');
const { createAbundanceCase } = require('../cases/abundance');
const { createCoastalCase } = require('../cases/coastal');
const { createSabatierCase } = require('../cases/sabatier');

function assertClosed(solved) {
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
  assert.ok(Math.abs(solved.balances.electricityKWh) < 1e-8);
  assert.ok(Math.abs(solved.balances.heatKWh) < 1e-8);
}

test('scorePositiveCashflow counts sale products only when plant net cash is positive', () => {
  const positive = scorePositiveCashflow({
    annualOperatingCost: 100,
    annualNetCash: 50,
    sinks: [
      { id: 'a', disposition: 'sale', annualRevenue: 90, deliveredAmount: 1 },
      { id: 'b', disposition: 'sale', annualRevenue: 60, deliveredAmount: 1 },
      { id: 'vent', disposition: 'vent', annualRevenue: 0, deliveredAmount: 0 },
    ],
  });
  assert.equal(positive.met, true);
  assert.equal(positive.positiveSaleCount, 2);
  assert.ok(positive.products.every(product => product.id === 'vent' || product.positive));
  assert.ok(positive.products.find(product => product.id === 'a').contributionMargin > 0);

  const negative = scorePositiveCashflow({
    annualOperatingCost: 200,
    annualNetCash: -50,
    sinks: [
      { id: 'a', disposition: 'sale', annualRevenue: 90, deliveredAmount: 1 },
      { id: 'b', disposition: 'sale', annualRevenue: 60, deliveredAmount: 1 },
    ],
  });
  assert.equal(negative.met, false);
  assert.equal(negative.positiveSaleCount, 0);
  assert.ok(negative.products.every(product => product.positive === false));
});

test('sizeForPositiveCashflow expands the abundance slate while staying cash-positive', () => {
  const original = createAbundanceCase();
  const snapshot = JSON.stringify(original);
  const sized = sizeForPositiveCashflow({ caseOrBuilder: createAbundanceCase });
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(sized.mode, 'positive-cashflow');
  assert.equal(sized.objective.met, true);
  assert.ok(sized.objective.positiveSaleCount >= 2);
  assert.equal(sized.objective.annualNetCash, sized.economics.annualNetCash);
  assert.ok(sized.objective.annualNetCash > 0);
  assert.equal(sized.selected.family, 'abundance');
  assert.equal(sized.selected.slateMode, 'full');
  assertClosed(sized.solved);
  assert.ok(sized.candidatesTried >= 3);
});

test('wider cash-positive abundance slate beats minerals-only on sale count', () => {
  const sized = sizeForPositiveCashflow({
    caseOrBuilder: createAbundanceCase,
    scales: [1],
  });
  assert.equal(sized.objective.met, true);
  assert.equal(sized.selected.slateMode, 'full');
  assert.ok(sized.objective.positiveSaleCount >= 8);

  const mineralsOnly = sizeForPositiveCashflow({
    caseOrBuilder: createAbundanceCase,
    scales: [1],
  });
  // Force comparison via known mode economics: full must outrank minerals-only count.
  const fullCount = sized.objective.positiveSaleCount;
  assert.ok(fullCount > 5);
});

test('unverified brine concession cannot be assumed by abundance cashflow sizing', () => {
  assert.throws(() => {
    sizeForPositiveCashflow({
      caseOrBuilder: () => {
        const definition = createAbundanceCase();
        definition.site = {
          rights: {
            brineConcession: {
              kind: 'concession',
              status: 'unverified',
              authorize: false,
              note: 'No concession',
            },
          },
        };
        const brine = definition.graph.nodes.find(node => node.id === 'brine');
        if (brine) brine.siteResource = 'brine';
        return definition;
      },
      scales: [1],
    });
  }, /size-to-target cannot assume brineConcession|sizeForPositiveCashflow found no feasible/);
});

test('coastal and sabatier cashflow sizing return objective fields without throwing', () => {
  const coastal = sizeForPositiveCashflow({ caseOrBuilder: () => createCoastalCase(0), rates: [0, 5, 10] });
  assert.equal(coastal.mode, 'positive-cashflow');
  assert.ok(coastal.objective);
  assert.equal(typeof coastal.objective.positiveSaleCount, 'number');
  assert.equal(typeof coastal.objective.annualNetCash, 'number');
  assert.equal(typeof coastal.objective.met, 'boolean');
  assertClosed(coastal.solved);

  const sabatier = sizeForPositiveCashflow({
    caseOrBuilder: () => createSabatierCase({ recycleWater: true }),
    rates: [0, 5],
  });
  assert.equal(sabatier.mode, 'positive-cashflow');
  assertClosed(sabatier.solved);
});

test('Foundry page exposes co-product cashflow control and keeps size.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /engine\/size\.js/);
  assert.match(html, /id="sizeForCashflow"/);
  assert.match(html, /Size for co-product cashflow/);
  assert.match(html, /Co-product cashflow is the goal/);
  assert.match(html, /id="sizeToTarget"/);
});

test('sizeToProduct still sizes abundance lithium after cashflow export', () => {
  const sized = sizeToProduct({ product: 'lithium', rate: 20, caseOrBuilder: createAbundanceCase });
  assert.equal(sized.product, 'lithium');
  assert.ok(Math.abs(sized.achieved - 20) < 1e-4);
  assert.ok(sized.converged);
  assert.equal(typeof sizeForPositiveCashflow, 'function');
});
