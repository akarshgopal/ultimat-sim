// Freight binding: plant-gate by default; a freight band adds $/kg to
// purchases and nets it from sale price (never below zero). Freight is OPEX
// only and never changes installed CAPEX.
const assert = require('node:assert/strict');
const test = require('node:test');

const { evaluateEconomics } = require('../engine/economics');
const { solveOperation } = require('../engine/solve');
const tea = require('../data/tea-screening.js');
const { createH2DriCase } = require('../cases/h2-dri');
const { waterStream } = require('./helpers.js');

const CONTAINER = 'chile-coast-container';

test('bindCost without freight stays plant-gate', () => {
  const plain = tea.bindCost('bauxite');
  assert.deepEqual(plain, tea.bindCost('bauxite', {}));
  assert.equal(plain.unitCost, tea.costs.bauxite.value);
  assert.equal('freightUsdPerKg' in plain, false);
  assert.equal(plain.freightId, undefined);
  assert.equal(tea.getFreight('none').value, 0);
});

test('bindCost freight is added to source purchases and reported as freight', () => {
  const freight = tea.getFreight(CONTAINER).value;
  assert.ok(freight > 0);
  const bound = tea.bindCost('bauxite', { freight: CONTAINER });
  assert.equal(bound.unitCost, tea.costs.bauxite.value);
  assert.equal(bound.freightUsdPerKg, freight);
  assert.equal(bound.freightId, CONTAINER);
  const cash = evaluateEconomics({
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: { nodes: [{ id: 'src', unit: 'material-source', economics: bound }] },
  }, { nodes: { src: { supplied: waterStream(1) } } });
  assert.ok(Math.abs(cash.breakdown.sourcePurchases - (bound.unitCost + freight) * 365) < 1e-9);
  assert.ok(Math.abs(cash.breakdown.freight - freight * 365) < 1e-9);
  assert.equal(cash.annualOperatingCost, cash.breakdown.sourcePurchases);
});

test('bindSale freight nets from the gate price; plant-gate sale has no freight', () => {
  const freight = tea.getFreight(CONTAINER).value;
  const gate = tea.prices['pv-module'].value;
  const sale = tea.bindSale('pv-module', { freight: CONTAINER });
  assert.equal(sale.gateUnitPrice, gate);
  assert.ok(Math.abs(sale.unitPrice - (gate - freight)) < 1e-12);
  assert.equal(sale.freightUsdPerKg, freight);
  const cash = evaluateEconomics({
    economics: { periodDays: 365 },
    graph: { nodes: [{ id: 'sale', unit: 'material-sink', economics: sale }] },
  }, { nodes: { sale: { received: waterStream(1) } } });
  assert.ok(Math.abs(cash.annualRevenue - sale.unitPrice * 365) < 1e-9);
  assert.ok(Math.abs(cash.sinks[0].annualFreight - freight * 365) < 1e-9);
  assert.ok(Math.abs(cash.breakdown.freight - freight * 365) < 1e-9);

  const plantGate = tea.bindSale('pv-module');
  assert.equal(plantGate.unitPrice, gate);
  assert.equal(plantGate.freightUsdPerKg, undefined);
  assert.equal(plantGate.gateUnitPrice, undefined);
});

test('freight above the gate price clamps the net sale price at zero', () => {
  const sale = tea.bindSale('oxygen', { freight: 'cryo-tanker-short' });
  assert.ok(sale.freightUsdPerKg > sale.gateUnitPrice, 'fixture: LOX tanker freight exceeds O2 gate price');
  assert.equal(sale.unitPrice, 0);
});

test('freight changes plant OPEX but not installed CAPEX', () => {
  const definition = createH2DriCase();
  const solved = solveOperation(definition);
  const withFreight = evaluateEconomics(definition, solved);
  assert.ok(withFreight.breakdown.freight > 0);
  const gate = JSON.parse(JSON.stringify(definition));
  for (const node of gate.graph.nodes) {
    const econ = node.economics;
    if (!econ?.freightUsdPerKg) continue;
    if (econ.gateUnitPrice != null) econ.unitPrice = econ.gateUnitPrice;
    delete econ.freightUsdPerKg;
    delete econ.freightId;
    delete econ.gateUnitPrice;
  }
  const plantGate = evaluateEconomics(gate, solved);
  assert.equal(plantGate.breakdown.freight, 0);
  assert.equal(plantGate.installedCapex, withFreight.installedCapex);
  assert.ok(plantGate.annualNetCash > withFreight.annualNetCash);
});
