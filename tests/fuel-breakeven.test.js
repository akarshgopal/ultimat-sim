const assert = require('node:assert/strict');
const test = require('node:test');

const { findFuelBreakEven, probeFuelCash, fuelScreeningBounds } = require('../engine/sensitivity');
const { sizeForPositiveCashflow } = require('../engine/size');

function waterStream(kg = 20) {
  return { kind: 'material', mol: { H2O: kg * 1000 / 18.01528 }, phase: 'liquid', T_C: 25, P_bar: 1 };
}

function methaneStream(kg = 1) {
  return { kind: 'material', mol: { CH4: kg * 1000 / 16.04246 }, phase: 'gas', T_C: 25, P_bar: 1 };
}

function tinyH2Plant({
  unitPrice = 1,
  installedCapex = 10000,
  fixedOMPercent = 20,
  electricityCost = 0.01,
} = {}) {
  return {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'water', unit: 'material-source', params: { stream: waterStream(20) }, economics: { unitCost: 0 } },
        {
          id: 'power',
          unit: 'electricity-source',
          params: { stream: { kind: 'electricity', kWh: 52 } },
          economics: { unitCost: electricityCost, installedCapex: 500, capexRate: 10 },
        },
        { id: 'power-bus', unit: 'electrical-bus' },
        {
          id: 'electrolyzer',
          unit: 'electrolyzer',
          capacity: 1,
          params: { secKWhPerKgH2: 52 },
          economics: { installedCapex, fixedOMPercent, variableOM: 0, assetLifeYears: 20 },
        },
        { id: 'hydrogen', unit: 'material-sink', economics: { disposition: 'sale', unitPrice, annualDemandLimit: 1e12 } },
        { id: 'oxygen', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waterReject', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'water', port: 'out' }, to: { node: 'electrolyzer', port: 'water' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'hydrogen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'oxygen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'waterReject', port: 'in' } },
      ],
    },
    operation: { setpoints: { electrolyzer: 1 }, priorities: { 'power-bus': ['electrolyzer'] } },
  };
}

function tinyMethanePlant({ unitPrice = 1, unitCost = 4 } = {}) {
  return {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'ch4-src', unit: 'material-source', params: { stream: methaneStream(1) }, economics: { unitCost } },
        { id: 'methane', unit: 'material-sink', economics: { disposition: 'sale', unitPrice, annualDemandLimit: 1e12 } },
      ],
      edges: [
        { from: { node: 'ch4-src', port: 'out' }, to: { node: 'methane', port: 'in' } },
      ],
    },
    operation: { setpoints: {} },
  };
}

test('findFuelBreakEven returns a finite H2 price for a tiny cash-negative plant', () => {
  const definition = tinyH2Plant({ unitPrice: 1, installedCapex: 10000, fixedOMPercent: 20, electricityCost: 0.01 });
  const result = findFuelBreakEven({ definition, product: 'H2', vary: 'price' });
  assert.equal(result.product, 'H2');
  assert.equal(result.vary, 'price');
  assert.equal(result.label, 'screening');
  assert.equal(result.sizing, 'baseline-once');
  assert.equal(result.met, true);
  assert.ok(Number.isFinite(result.breakEven));
  assert.ok(result.breakEven > 0.1);
  assert.ok(result.breakEven < 20);
  assert.ok(result.baseline.annualNetCash < 0);
  assert.equal(result.baseline.objective.met, false);
  assert.ok(result.curve.length >= 9);
  assert.ok(result.curve.some(point => point.met === false));
  assert.ok(result.curve.some(point => point.met === true));
  assert.ok(result.priceSources.some(item => /screening/i.test(item.label) || item.quality === 'screening'));
  const high = result.curve[result.curve.length - 1];
  assert.equal(high.met, true);
  assert.ok(high.positiveSaleCount >= 1);
  assert.ok(high.annualNetCash > 0);
});

test('CAPEX factor break-even is finite when reducing CAPEX helps, else curve is monotonic', () => {
  const definition = tinyH2Plant({
    unitPrice: 2,
    installedCapex: 20000,
    fixedOMPercent: 25,
    electricityCost: 0.001,
  });
  const result = findFuelBreakEven({ definition, product: 'h2', vary: 'capex' });
  assert.equal(result.vary, 'capex');
  assert.equal(result.sizing, 'baseline-once');
  assert.ok(result.brackets);
  assert.ok(result.curve.length >= 2);
  for (let i = 1; i < result.curve.length; i += 1) {
    assert.ok(
      result.curve[i].annualNetCash <= result.curve[i - 1].annualNetCash + 1e-6,
      'higher CAPEX factor should not improve annualNetCash'
    );
  }
  assert.equal(result.met, true);
  assert.ok(Number.isFinite(result.breakEven));
  assert.ok(result.breakEven > 0);
  assert.ok(result.breakEven <= 2);
  assert.ok(result.breakEven >= 0.05);
});

test('findFuelBreakEven does not mutate the input definition', () => {
  const definition = tinyH2Plant({ unitPrice: 1.25 });
  const snapshot = JSON.stringify(definition);
  findFuelBreakEven({ definition, product: 'H2', vary: 'price' });
  findFuelBreakEven({ definition, product: 'H2', vary: 'capex' });
  assert.equal(JSON.stringify(definition), snapshot);
});

test("alias product 'methane' normalizes to CH4", () => {
  const definition = tinyMethanePlant({ unitPrice: 1, unitCost: 4 });
  const result = findFuelBreakEven({ caseOrBuilder: definition, product: 'methane', vary: 'price' });
  assert.equal(result.product, 'CH4');
  assert.equal(result.met, true);
  assert.ok(Number.isFinite(result.breakEven));
  assert.ok(Math.abs(result.breakEven - 4) < 0.05);
  assert.equal(result.label, 'screening');
});

test('fuelScreeningBounds uses tea-screening CH4 green-premium and MeOH commodity band', () => {
  const ch4 = fuelScreeningBounds('CH4');
  const meoh = fuelScreeningBounds('methanol');
  assert.equal(ch4.label, 'screening');
  assert.equal(ch4.priceMid, 1);
  assert.equal(ch4.priceMin, 1);
  assert.equal(ch4.priceMax, 1);
  assert.equal(ch4.capexMin, 0.05);
  assert.equal(ch4.capexMax, 2);
  assert.match(ch4.note, /green-premium/i);
  assert.equal(meoh.priceMid, 0.4);
  assert.equal(meoh.priceMin, 0.25);
  assert.equal(meoh.priceMax, 0.5);
  assert.equal(meoh.capexMin, 0.05);
  assert.equal(meoh.capexMax, 2);
  assert.match(meoh.note, /commodity/i);
});

test('probeFuelCash documents a CH4 near-miss inside the green-premium × CAPEX band', () => {
  const definition = tinyMethanePlant({ unitPrice: 1, unitCost: 4 });
  const snapshot = JSON.stringify(definition);
  const probe = probeFuelCash({ definition, product: 'CH4' });
  assert.equal(JSON.stringify(definition), snapshot);
  assert.equal(probe.label, 'screening');
  assert.equal(probe.product, 'CH4');
  assert.equal(typeof probe.met, 'boolean');
  assert.ok(Number.isFinite(probe.bestCash));
  assert.ok(probe.note);
  assert.match(probe.note, /screening/i);
  if (probe.met) {
    assert.ok(probe.bestCash > 0);
  } else {
    assert.ok(probe.bestCash <= 0);
    assert.ok(probe.breakEvenPrice === null || Number.isFinite(probe.breakEvenPrice));
    assert.match(probe.note, /not an invented fuel winner/i);
  }
});

test('sizeForPositiveCashflow still scores the tiny H2 plant without sensitivity side effects', () => {
  const sized = sizeForPositiveCashflow({
    definition: tinyH2Plant({ unitPrice: 12, installedCapex: 500, fixedOMPercent: 4, electricityCost: 0.01 }),
    scales: [1],
    rates: [1],
  });
  assert.equal(sized.mode, 'positive-cashflow');
  assert.ok(sized.familiesSearched.includes('fuel'));
  assert.equal(typeof sized.objective.met, 'boolean');
});
