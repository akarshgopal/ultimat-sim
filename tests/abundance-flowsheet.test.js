const assert = require('node:assert/strict');
const test = require('node:test');

const { SUBSTANCES } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { createAbundanceCase } = require('../cases/abundance');
const tea = require('../data/tea-screening.js');
const { evaluateEconomics } = require('../engine/economics');

const material = (substance, kg, phase = 'solid') => ({
  kind: 'material', mol: { [substance]: kg * 1000 / SUBSTANCES[substance].molarMassG }, phase, T_C: 25, P_bar: 1,
});
const source = (id, stream) => ({ id, unit: stream.kind === 'electricity' ? 'electricity-source' : 'material-source', params: { stream } });
const sink = id => ({ id, unit: 'material-sink' });

test('brine train conserves ions while exposing lithium, bromide, potash, magnesium, gypsum, and salt', () => {
  const brine = {
    kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1,
    mol: { H2O: 10000, 'Na+': 1000, 'Cl-': 1188, 'Mg+2': 50, 'Ca+2': 20, 'K+': 30, 'SO4-2': 20, 'Br-': 1, 'Li+': 0.1 },
  };
  const outputs = ['lithium', 'bromide', 'magnesium', 'potash', 'gypsum', 'salt', 'raffinate'];
  const solved = solveOperation({
    graph: {
      nodes: [source('brine', brine), source('power', { kind: 'electricity', kWh: 100 }), { id: 'minerals', unit: 'brine-minerals', capacity: 1000 }, ...outputs.map(sink)],
      edges: [
        { from: { node: 'brine', port: 'out' }, to: { node: 'minerals', port: 'brine' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'minerals', port: 'electricity' } },
        ...outputs.map(port => ({ from: { node: 'minerals', port }, to: { node: port, port: 'in' } })),
      ],
    },
    operation: { setpoints: { minerals: 100 } },
  });

  assert.ok(solved.nodes.lithium.received.mol.LiCl > 0);
  assert.ok(solved.nodes.bromide.received.mol.NaBr > 0);
  assert.ok(solved.nodes.potash.received.mol.KCl > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('abundance hub couples brine bromide to chlor-alkali chlorine and its hydrogen to ammonia', () => {
  const definition = createAbundanceCase();
  assert.equal(definition.meta.assayId, 'dead-sea-brine');
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(solved.nodes['bromine-recovery'].activity > 0);
  assert.ok(solved.nodes.ammonia.activity > 0);
  assert.ok(solved.nodes.minerals.outlets.lithium.mol.LiCl > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('abundance case binds TEA prices, CAPEX intensity, and demand ceilings onto nodes', () => {
  const definition = createAbundanceCase();
  const node = id => definition.graph.nodes.find(item => item.id === id);
  assert.equal(node('lithium').economics.unitPrice, tea.prices.lithium.value);
  assert.equal(node('bromine').economics.unitPrice, tea.prices.bromine.value);
  assert.equal(node('minerals').economics.capexRate, tea.packs.minerals.capexIntensity);
  assert.equal(node('minerals').economics.installedCapex, undefined, 'minerals CAPEX scales with capacity');
  const economics = evaluateEconomics(definition, solveOperation(definition));
  assert.equal(economics.sinks.find(sink => sink.id === 'lithium').quality, tea.prices.lithium.quality);
  assert.ok(economics.annualizedCapex > 0);
});

test('createAbundanceCase({ assayId }) runs Atacama lithium brine without invented bromide', () => {
  const definition = createAbundanceCase({ assayId: 'atacama-lithium-brine' });
  assert.equal(definition.meta.assayId, 'atacama-lithium-brine');
  assert.equal(createAbundanceCase('atacama-lithium-brine').meta.assayId, 'atacama-lithium-brine');
  const brine = definition.graph.nodes.find(node => node.id === 'brine').params.stream;
  assert.ok(brine.mol['Li+'] > 0);
  assert.equal(brine.mol['Br-'], undefined);
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(solved.nodes.minerals.outlets.lithium.mol.LiCl > 0);
  assert.equal(solved.nodes['bromine-recovery'].activity, 0);
  assert.ok(Number.isFinite(solved.nodes.ammonia.activity));
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

function packCapex(key, capacity) {
  const bound = tea.bindCapexPack(key, { capacity });
  if (bound.installedCapex != null) return bound.installedCapex;
  return bound.capexRate * capacity;
}

test('TEA pack CAPEX scales linearly with capacity, or by the scale exponent when asked', () => {
  for (const key of ['minerals', 'electrolyzer', 'swro']) {
    assert.equal(packCapex(key, 1000), tea.packs[key].capexIntensity * 1000, key);
    assert.equal(packCapex(key, 100000), 100 * packCapex(key, 1000), key);
  }
  const intensity = tea.packs.swro.capexIntensity;
  const scaled = tea.bindCapexPack('swro', { capacity: 100, scaleExponent: 0.6, refCapacity: 10, precompute: true });
  assert.ok(Math.abs(scaled.installedCapex - intensity * 100 * (100 / 10) ** (0.6 - 1)) < 1e-6);
});

test('Dead Sea demo scale is cash-positive at minerals mid intensity; Atacama Li stays cash+', () => {
  const netCash = definition => evaluateEconomics(definition, solveOperation(definition)).annualNetCash;
  const deadSea = netCash(createAbundanceCase());
  assert.ok(deadSea > 0, 'mid=12 is cash+ at Dead Sea demo scale because 4% fixed OM tracks CAPEX');

  const atacama = netCash(createAbundanceCase({ assayId: 'atacama-lithium-brine', region: 'Atacama/Chile' }));
  assert.ok(atacama > 0);
  assert.ok(atacama > deadSea);
});

test('abundance sale products do not ship annualDemandLimit 1e12', () => {
  const definition = createAbundanceCase();
  const productKey = {
    lithium: 'lithium',
    magnesium: 'magnesium',
    potash: 'potash',
    gypsum: 'gypsum',
    salt: 'salt',
    caustic: 'caustic',
    bromine: 'bromine',
    'recovered-salt': 'salt',
    'ammonia-product': 'ammonia',
    oxygen: 'oxygen',
  };
  const sales = definition.graph.nodes.filter(node => node.economics?.disposition === 'sale');
  assert.ok(sales.length >= 8);
  for (const node of sales) {
    assert.ok(node.economics.annualDemandLimit < 1e12, node.id);
    assert.ok(node.economics.annualDemandLimit > 0, node.id);
    assert.equal(node.economics.annualDemandLimit, tea.demand[productKey[node.id]].value, node.id);
  }
});

