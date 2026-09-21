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

test('sizeForPositiveCashflow scores abundance with a capital-inclusive cash gate', () => {
  const original = createAbundanceCase();
  const snapshot = JSON.stringify(original);
  const baseline = evaluateEconomics(original, solveOperation(original));
  assert.ok(baseline.annualizedCapex > 0, 'unsized abundance CAPEX must scale with capexRate × capacity');
  assert.ok(Math.abs(baseline.annualNetCash - (baseline.annualRevenue - baseline.annualOperatingCost - baseline.annualizedCapex)) < 1e-6);
  const sized = sizeForPositiveCashflow({ caseOrBuilder: createAbundanceCase });
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(sized.mode, 'positive-cashflow');
  assert.ok(sized.selected);
  assert.equal(sized.objective.annualNetCash, sized.economics.annualNetCash);
  const econ = sized.economics;
  assert.ok(econ.annualizedCapex >= 0);
  assert.ok(Math.abs(econ.annualOperatingCash - (econ.annualRevenue - econ.annualOperatingCost)) < 1e-6);
  assert.ok(Math.abs(econ.annualNetCash - (econ.annualRevenue - econ.annualOperatingCost - econ.annualizedCapex)) < 1e-6);
  assert.equal(typeof sized.objective.met, 'boolean');
  if (sized.objective.met) {
    assert.ok(sized.objective.annualNetCash > 0);
    assert.ok(sized.objective.positiveSaleCount >= 1);
  } else {
    assert.ok(sized.objective.annualNetCash <= 0);
    assert.ok((sized.warnings || []).some(warning => /no cash-positive/i.test(warning)));
  }
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

test('sizeToProduct runs on Atacama lithium brine abundance case', () => {
  const definition = createAbundanceCase({ assayId: 'atacama-lithium-brine' });
  const sized = sizeToProduct({ product: 'LiCl', rate: 20, definition });
  assert.equal(sized.product, 'lithium');
  assert.equal(sized.converged, true);
  assert.ok(Math.abs(sized.achieved - 20) < 1e-4);
  assertClosed(sized.solved);
});

function windowedCashMineralsPlant() {
  const brine = {
    kind: 'material',
    mol: { H2O: 50, 'Li+': 0.5, 'Cl-': 0.5 },
    phase: 'liquid',
    T_C: 25,
    P_bar: 1,
  };
  return {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'brine', unit: 'material-source', params: { stream: brine }, economics: { unitCost: 2 } },
        { id: 'power', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: 1 } }, economics: { unitCost: 0.01 } },
        {
          id: 'minerals',
          unit: 'brine-minerals',
          capacity: 1,
          params: {
            electricityKWhPerKgBrine: 0.05,
            lithiumRecovery: 1,
            bromideRecovery: 0,
            magnesiumRecovery: 0,
            potashRecovery: 0,
            gypsumRecovery: 0,
            saltRecovery: 0,
          },
          economics: { installedCapex: 8000, fixedOMPercent: 4, variableOM: 0, assetLifeYears: 20 },
        },
        { id: 'lithium', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 400, annualDemandLimit: 8 } },
        { id: 'bromide', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'magnesium', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'potash', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'gypsum', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'salt', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'raffinate', unit: 'material-sink', economics: { disposition: 'reinjection' } },
      ],
      edges: [
        { from: { node: 'brine', port: 'out' }, to: { node: 'minerals', port: 'brine' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'minerals', port: 'electricity' } },
        { from: { node: 'minerals', port: 'lithium' }, to: { node: 'lithium', port: 'in' } },
        { from: { node: 'minerals', port: 'bromide' }, to: { node: 'bromide', port: 'in' } },
        { from: { node: 'minerals', port: 'magnesium' }, to: { node: 'magnesium', port: 'in' } },
        { from: { node: 'minerals', port: 'potash' }, to: { node: 'potash', port: 'in' } },
        { from: { node: 'minerals', port: 'gypsum' }, to: { node: 'gypsum', port: 'in' } },
        { from: { node: 'minerals', port: 'salt' }, to: { node: 'salt', port: 'in' } },
        { from: { node: 'minerals', port: 'raffinate' }, to: { node: 'raffinate', port: 'in' } },
      ],
    },
    operation: { setpoints: { minerals: 1 } },
  };
}

test('sizeForPositiveCashflow refines a coarse scale grid that can miss cash+', () => {
  const coarse = [0.25, 4];
  const missed = sizeForPositiveCashflow({
    definition: windowedCashMineralsPlant(),
    scales: coarse,
    rates: [0],
    refine: false,
  });
  assert.equal(missed.objective.met, false);
  assert.ok(missed.objective.annualNetCash <= 0);
  assert.ok(coarse.includes(missed.selected.scale));

  const refined = sizeForPositiveCashflow({
    definition: windowedCashMineralsPlant(),
    scales: coarse,
    rates: [0],
    refine: true,
  });
  assert.equal(refined.objective.met, true);
  assert.ok(refined.objective.annualNetCash > 0);
  assert.ok(refined.selected.scale > 0.25);
  assert.ok(refined.selected.scale < 4);
  assert.ok(refined.candidatesTried > missed.candidatesTried);
  assert.ok(Math.abs(refined.economics.annualNetCash - (
    refined.economics.annualRevenue - refined.economics.annualOperatingCost - refined.economics.annualizedCapex
  )) < 1e-6);
});

test('abundance cash+ winner reports selected.family abundance, not fuel/ammonia', () => {
  const sized = sizeForPositiveCashflow({
    caseOrBuilder: () => createAbundanceCase({ assayId: 'atacama-lithium-brine', region: 'Atacama/Chile' }),
    scales: [1],
    rates: [0, 5],
    refine: false,
  });
  assert.ok(sized.familiesSearched.includes('abundance'));
  assert.equal(sized.selected.family, 'abundance');
  assert.notEqual(sized.selected.product, 'ammonia');
  assert.notEqual(sized.selected.family, 'fuel');
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
