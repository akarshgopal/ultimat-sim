const assert = require('node:assert/strict');
const test = require('node:test');

const { evaluateEconomics, approximateIRR, netPresentValue } = require('../engine/economics');

function stream(kind, value) {
  if (kind === 'material') return {
    kind, mol: { CH4: value * 1000 / 16.04246 }, phase: 'gas', T_C: 25, P_bar: 1,
  };
  return { kind, kWh: value };
}

function methaneCase() {
  return {
    economics: { periodDays: 365, projectLifeYears: 2, discountRate: 0.1 },
    graph: { nodes: [
      { id: 'power', unit: 'electricity-source', economics: { unitCost: 0.05 } },
      { id: 'reactor', unit: 'sabatier', capacity: 10, economics: { capexRate: 100, fixedOMPercent: 0.05, variableOM: 2, assetLifeYears: 2 } },
      { id: 'methane', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 3, annualDemandLimit: 800 } },
      { id: 'brine', unit: 'material-sink', economics: { disposition: 'disposal', disposalCost: 0.2 } },
    ] },
  };
}

function solvedMethane() {
  const product = stream('material', 10);
  const waste = stream('material', 5);
  return {
    nodes: {
      power: { supplied: stream('electricity', 100) },
      reactor: { activity: 10 },
      methane: { received: product },
      brine: { received: waste },
    },
    streams: [
      { from: { node: 'power', port: 'out' }, stream: stream('electricity', 100) },
      { from: { node: 'reactor', port: 'product' }, to: { node: 'methane', port: 'in' }, stream: product },
      { from: { node: 'reactor', port: 'waste' }, to: { node: 'brine', port: 'in' }, stream: waste },
    ],
  };
}

test('generic methane-like graph folds source, converter, sale, and disposal economics', () => {
  const result = evaluateEconomics(methaneCase(), solvedMethane());

  assert.equal(result.installedCapex, 1000);
  assert.equal(result.annualRevenue, 2400, 'sale should be capped at 800 kg/y');
  assert.equal(result.annualOperatingCost, 9540);
  assert.equal(result.annualNetCash, -7140);
  assert.deepEqual(result.breakdown, {
    sourcePurchases: 1825, fixedOM: 50, variableOM: 7300, disposalCost: 365, productRevenue: 2400,
  });
  assert.deepEqual(result.cashFlows, [-1000, -7140, -7140]);
  assert.equal(result.sinks.find(sink => sink.id === 'methane').deliveredAmount, 800);
  assert.equal(result.sinks.find(sink => sink.id === 'brine').annualDisposalCost, 365);
});

test('sale demand cap does not discard the physical delivered amount', () => {
  const result = evaluateEconomics({
    economics: { projectLifeYears: 1 },
    graph: { nodes: [{ id: 'product', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 10, annualDemandLimit: 2 } }] },
  }, { nodes: { product: { received: stream('material', 5) } } });

  assert.equal(result.sinks[0].annualAmount, 1825);
  assert.equal(result.sinks[0].deliveredAmount, 2);
  assert.equal(result.annualRevenue, 20);
});

test('NPV and IRR agree on a simple two-year investment', () => {
  const cashFlows = [-100, 70, 70];
  assert.ok(Math.abs(netPresentValue(cashFlows, 0.1) - 21.4876) < 1e-3);
  assert.ok(approximateIRR(cashFlows) > 0);
  assert.ok(Math.abs(approximateIRR(cashFlows) - 0.2567) < 1e-3);
});
