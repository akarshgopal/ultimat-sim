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

function mineralsAndHydrogenPlant() {
  const brine = {
    kind: 'material',
    mol: { H2O: 50, 'Li+': 0.5, 'Cl-': 0.8, 'Na+': 0.3 },
    phase: 'liquid',
    T_C: 25,
    P_bar: 1,
  };
  return {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'brine', unit: 'material-source', params: { stream: brine }, economics: { unitCost: 0.0002 } },
        { id: 'water', unit: 'material-source', params: { stream: { kind: 'material', mol: { H2O: 20 }, phase: 'liquid', T_C: 25, P_bar: 1 } }, economics: { unitCost: 0.001 } },
        { id: 'power', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: 50 } }, economics: { unitCost: 0.03 } },
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'minerals',
          unit: 'brine-minerals',
          capacity: 1.5,
          params: { electricityKWhPerKgBrine: 0.05, lithiumRecovery: 0.9, bromideRecovery: 0, magnesiumRecovery: 0, potashRecovery: 0, gypsumRecovery: 0, saltRecovery: 0.5 },
          economics: { installedCapex: 1000, fixedOMPercent: 4, variableOM: 0.01, assetLifeYears: 20 },
        },
        { id: 'electrolyzer', unit: 'electrolyzer', capacity: 0.4, params: { secKWhPerKgH2: 52 }, economics: { installedCapex: 500, variableOM: 0.01, assetLifeYears: 20 } },
        { id: 'lithium', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 5, annualDemandLimit: 1e12 } },
        { id: 'bromide', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'magnesium', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'potash', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'gypsum', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'salt', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 0.08, annualDemandLimit: 1e12 } },
        { id: 'raffinate', unit: 'material-sink', economics: { disposition: 'reinjection' } },
        { id: 'hydrogen', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 3, annualDemandLimit: 1e12 } },
        { id: 'oxygen', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waterReject', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'brine', port: 'out' }, to: { node: 'minerals', port: 'brine' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'minerals', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'water', port: 'out' }, to: { node: 'electrolyzer', port: 'water' } },
        { from: { node: 'minerals', port: 'lithium' }, to: { node: 'lithium', port: 'in' } },
        { from: { node: 'minerals', port: 'bromide' }, to: { node: 'bromide', port: 'in' } },
        { from: { node: 'minerals', port: 'magnesium' }, to: { node: 'magnesium', port: 'in' } },
        { from: { node: 'minerals', port: 'potash' }, to: { node: 'potash', port: 'in' } },
        { from: { node: 'minerals', port: 'gypsum' }, to: { node: 'gypsum', port: 'in' } },
        { from: { node: 'minerals', port: 'salt' }, to: { node: 'salt', port: 'in' } },
        { from: { node: 'minerals', port: 'raffinate' }, to: { node: 'raffinate', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'hydrogen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'oxygen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'waterReject', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { minerals: 1.5, electrolyzer: 0.2 },
      priorities: { 'power-bus': ['minerals', 'electrolyzer'] },
    },
  };
}

test('sizeForPositiveCashflow on abundance also searches the ammonia fuel family', () => {
  const sized = sizeForPositiveCashflow({ caseOrBuilder: createAbundanceCase, scales: [1], rates: [0] });
  assert.ok(sized.familiesSearched.includes('abundance'));
  assert.ok(sized.familiesSearched.includes('fuel'));
  assert.ok(sized.candidatesTried > 3);
  assert.equal(sized.heatCoveredKWh != null || sized.heatResidualKWh != null, true);
});

test('sizeForPositiveCashflow on minerals plus hydrogen searches joint candidates', () => {
  const sized = sizeForPositiveCashflow({
    definition: mineralsAndHydrogenPlant(),
    scales: [1],
    rates: [0],
  });
  assert.ok(sized.familiesSearched.includes('abundance'));
  assert.ok(sized.familiesSearched.includes('fuel'));
  assert.ok(sized.familiesSearched.includes('joint'));
  assert.ok(sized.selected.family === 'abundance' || sized.selected.family === 'fuel' || sized.selected.family === 'joint');
  assert.ok(sized.candidatesTried > 3);
});
