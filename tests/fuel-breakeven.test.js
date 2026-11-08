const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
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

test('fuelScreeningBounds brackets the mid price and CAPEX factor 1', () => {
  for (const product of ['CH4', 'methanol']) {
    const bounds = fuelScreeningBounds(product);
    assert.ok(bounds.priceMin <= bounds.priceMid && bounds.priceMid <= bounds.priceMax, product);
    assert.ok(bounds.capexMin < 1 && bounds.capexMax > 1, product);
  }
});

test('probeFuelCash documents a CH4 near-miss inside the green-premium × CAPEX band', () => {
  const definition = tinyMethanePlant({ unitPrice: 1, unitCost: 4 });
  const snapshot = JSON.stringify(definition);
  const probe = probeFuelCash({ definition, product: 'CH4' });
  assert.equal(JSON.stringify(definition), snapshot);
  assert.equal(probe.label, 'screening');
  assert.equal(probe.product, 'CH4');
  assert.equal(typeof probe.met, 'boolean');
  assert.equal(probe.met, probe.midMet);
  assert.ok(Number.isFinite(probe.bestCash));
  assert.ok(Number.isFinite(probe.midCash));
  if (probe.midMet) {
    assert.ok(probe.midCash > 0);
  } else {
    assert.ok(!(probe.midCash > 0));
    assert.ok(probe.breakEvenPrice === null || Number.isFinite(probe.breakEvenPrice));
  }
});

test('probeFuelCash ranks cash+ only at mid-band, not capexFactor=0.05 alone', () => {
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        {
          id: 'ch4-src',
          unit: 'material-source',
          params: { stream: methaneStream(1) },
          economics: { unitCost: 0.5, installedCapex: 10000, assetLifeYears: 20, fixedOMPercent: 0 },
        },
        { id: 'methane', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 1, annualDemandLimit: 1e12 } },
      ],
      edges: [
        { from: { node: 'ch4-src', port: 'out' }, to: { node: 'methane', port: 'in' } },
      ],
    },
    operation: { setpoints: {} },
  };
  const probe = probeFuelCash({ definition, product: 'CH4' });
  assert.equal(probe.midMet, false);
  assert.equal(probe.met, false);
  assert.ok(probe.midCash <= 0);
  assert.ok(probe.bestCash > 0);
  assert.equal(probe.best.capexFactor, 0.05);
  assert.equal(probe.mid.capexFactor, 1);

  const cheap = tinyMethanePlant({ unitPrice: 1, unitCost: 0.1 });
  const midHit = probeFuelCash({ definition: cheap, product: 'CH4' });
  assert.equal(midHit.midMet, true);
  assert.equal(midHit.met, true);
  assert.ok(midHit.midCash > 0);
  assert.equal(midHit.mid.capexFactor, 1);
});

test('fuel-breakeven script proves no frozen-PVGIS fuel site is cash+ at mid-band', () => {
  const ran = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'fuel-breakeven.mjs')], {
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  const report = JSON.parse(ran.stdout);
  assert.equal(report.notRun.length, 0);
  assert.ok(report.proof.rows.length >= 6);
  assert.equal(report.proof.midPositiveCount, 0);
  for (const id of ['spain-almeria', 'chile-mejillones', 'uae-taweelah', 'au-port-hedland', 'saudi-oxagon']) {
    assert.ok(report.proof.rows.some(row => row.siteId === id), id);
  }
  for (const row of report.proof.rows) {
    assert.equal(row.feasible, false, row.siteId);
    assert.ok(row.midCash < 0, `${row.siteId} ${row.template} midCash=${row.midCash}`);
    assert.match(row.solar, /frozen/i, row.siteId);
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
