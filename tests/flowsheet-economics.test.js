const assert = require('node:assert/strict');
const test = require('node:test');

const { evaluateEconomics, approximateIRR, netPresentValue, capitalRecoveryFactor, scorePositiveCashflow } = require('../engine/economics');

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
  assert.equal(result.annualOperatingCash, -7140);
  const annualizedCapex = 1000 * capitalRecoveryFactor(0.1, 2);
  assert.ok(Math.abs(result.annualizedCapex - annualizedCapex) < 1e-9);
  assert.ok(Math.abs(result.annualNetCash - (-7140 - annualizedCapex)) < 1e-9);
  assert.deepEqual(result.breakdown, {
    sourcePurchases: 1825, fixedOM: 50, variableOM: 7300, disposalCost: 365, productRevenue: 2400,
  });
  assert.deepEqual(result.cashFlows, [-1000, -7140, -7140], 'DCF years 1..N stay operating cash, not annualized');
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

test('capital-inclusive gate: annualNetCash is R − OPEX − annualizedCapex', () => {
  const waterKg = 1;
  const water = {
    kind: 'material',
    mol: { H2O: waterKg * 1000 / 18.01528 },
    phase: 'liquid',
    T_C: 25,
    P_bar: 1,
  };
  const result = evaluateEconomics({
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: { nodes: [
      { id: 'src', unit: 'material-source', economics: { unitCost: 0.1 } },
      { id: 'conv', unit: 'mixer', capacity: 1, economics: { installedCapex: 10000, fixedOMPercent: 0, assetLifeYears: 20 } },
      { id: 'sale', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 1, annualDemandLimit: 1e12 } },
    ] },
  }, {
    nodes: {
      src: { supplied: water },
      conv: { activity: 1 },
      sale: { received: water },
    },
  });
  assert.equal(result.annualRevenue, 365);
  assert.equal(result.annualOperatingCost, 36.5);
  assert.ok(result.annualOperatingCash > 0);
  assert.equal(result.annualOperatingCash, result.annualRevenue - result.annualOperatingCost);
  assert.ok(Math.abs(result.annualizedCapex - 10000 * capitalRecoveryFactor(0.08, 20)) < 1e-9);
  assert.ok(Math.abs(result.annualNetCash - (result.annualRevenue - result.annualOperatingCost - result.annualizedCapex)) < 1e-9);
  assert.ok(result.annualNetCash < 0, 'R > OPEX but R < OPEX + annualized CAPEX');
  assert.deepEqual(result.cashFlows[0], -10000);
  assert.equal(result.cashFlows[1], result.annualOperatingCash);
  const scored = scorePositiveCashflow(result);
  assert.equal(scored.met, false);
  assert.equal(scored.annualNetCash, result.annualNetCash);
  assert.match(scored.formula, /annualized CAPEX/i);
  const withoutNet = scorePositiveCashflow({
    annualOperatingCost: result.annualOperatingCost,
    annualizedCapex: result.annualizedCapex,
    sinks: result.sinks,
  });
  assert.ok(Math.abs(withoutNet.annualNetCash - result.annualNetCash) < 1e-9);
  assert.equal(withoutNet.met, false);
});
