const assert = require('node:assert/strict');
const test = require('node:test');

const { SUBSTANCES } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { createAbundanceCase } = require('../cases/abundance');
const tea = require('../data/tea-screening.js');
const { evaluateEconomics } = require('../engine/economics');
const { sizeForPositiveCashflow } = require('../engine/size');

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

test('abundance TEA registry exposes cited prices and screening CAPEX intensities', () => {
  assert.equal(tea.prices.lithium.value, 14);
  assert.equal(tea.prices.lithium.quality, 'cited');
  assert.ok(tea.prices.lithium.evidence.some(item => /usgs\.gov.*lithium/i.test(item.url || '')));
  assert.equal(tea.prices.bromine.value, 3.1);
  assert.equal(tea.prices.bromine.quality, 'cited');
  assert.ok(tea.prices.bromine.evidence.some(item => /usgs\.gov.*bromine/i.test(item.url || '')));
  assert.equal(tea.prices.potash.value, 0.35);
  assert.equal(tea.prices.magnesium.value, 0.08);
  assert.match(tea.prices.magnesium.note, /not.*Mg-metal|not use Mg-metal/i);
  assert.equal(tea.prices.magnesium.quality, 'screening');
  assert.equal(tea.capex.minerals.value, 12);
  assert.equal(tea.capex.minerals.quality, 'screening');
  assert.ok(tea.capex.minerals.evidence.some(item => /10\.2172\/1782801/.test(item.doi || item.url || '')));
  assert.equal(tea.packs.minerals.capexIntensity, 12);
  assert.deepEqual(tea.packs.minerals.capexIntensityBand, { low: 3, mid: 12, high: 40 });
  assert.equal(tea.packs.minerals.capexIntensityBand.mid, tea.packs.minerals.capexIntensity);
  assert.deepEqual(tea.capex.minerals.capexIntensityBand, tea.packs.minerals.capexIntensityBand);
  assert.match(tea.packs.minerals.note, /10\.2172\/1782801/);
  assert.match(tea.packs.minerals.note, /2\.86e7 kg brine\/day/);
  assert.match(tea.packs.minerals.note, /multi-product Dead Sea/i);
  assert.match(tea.packs.minerals.note, /not bankable/i);
  assert.match(tea.packs.minerals.note, /not independent bankable quotes/i);
  const mineralsPack = tea.abundanceEvidence().packs.find(item => item.key === 'minerals');
  assert.equal(mineralsPack.capexIntensity, 12);
  assert.deepEqual(mineralsPack.capexIntensityBand, { low: 3, mid: 12, high: 40 });
  assert.equal(tea.demand.lithium.value, 1e6);
  assert.match(tea.demand.lithium.note, /not a plant offtake/i);
  assert.equal(tea.demand.unlimited, undefined);
});

test('abundance case binds TEA prices, capexRate, and evidence onto nodes', () => {
  const definition = createAbundanceCase();
  const node = id => definition.graph.nodes.find(item => item.id === id);
  assert.equal(node('lithium').economics.unitPrice, 14);
  assert.equal(node('lithium').economics.quality, 'cited');
  assert.ok(Array.isArray(node('lithium').economics.evidence) && node('lithium').economics.evidence.length >= 1);
  assert.equal(node('bromine').economics.unitPrice, 3.1);
  assert.equal(node('brine').economics.unitCost, 0.0005);
  assert.equal(node('power').economics.unitCost, 0.04);
  assert.equal(node('salt-feed').economics.unitCost, 0.06);
  assert.equal(node('minerals').economics.capexRate, 12);
  assert.equal(node('minerals').economics.capexIntensity, 12);
  assert.deepEqual(node('minerals').economics.capexIntensityBand, { low: 3, mid: 12, high: 40 });
  assert.equal(node('minerals').economics.installedCapex, undefined);
  assert.equal(node('chlor-alkali').economics.capexRate, 1500);
  assert.equal(node('ammonia').economics.capexRate, 2000);
  assert.ok(definition.teaEvidence?.prices?.some(row => row.key === 'lithium' && row.quality === 'cited'));
  const solved = solveOperation(definition);
  const economics = evaluateEconomics(definition, solved);
  const lithiumSink = economics.sinks.find(sink => sink.id === 'lithium');
  assert.equal(lithiumSink.quality, 'cited');
  assert.ok(lithiumSink.evidence.some(item => /usgs/i.test(item.url || item.label || '')));
  assert.ok(economics.annualizedCapex > 0);
  assert.equal(node('lithium').economics.annualDemandLimit, tea.demand.lithium.value);
  assert.notEqual(node('lithium').economics.annualDemandLimit, 1e12);
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

test('TEA pack CAPEX scales with capacity and is not the old fuel-path toy lump', () => {
  const intensity = tea.packs.minerals.capexIntensity;
  assert.equal(intensity, 12);
  const mineralsLarge = packCapex('minerals', 100000);
  const mineralsSmall = packCapex('minerals', 1000);
  assert.equal(mineralsLarge, intensity * 100000);
  assert.equal(mineralsSmall, intensity * 1000);
  assert.equal(mineralsLarge / mineralsSmall, 100);
  assert.notEqual(mineralsLarge, 80 * 100000);

  const electrolyzer = packCapex('electrolyzer', 100);
  assert.equal(electrolyzer, tea.packs.electrolyzer.capexIntensity * 100);
  assert.notEqual(electrolyzer, 21000);
  assert.ok(electrolyzer > 21000);

  const swro = packCapex('swro', 10);
  assert.equal(swro, 1500 * 10);
  assert.notEqual(swro, 1000);

  const scaled = tea.bindCapexPack('swro', { capacity: 100, scaleExponent: 0.6, refCapacity: 10, precompute: true });
  assert.ok(Math.abs(scaled.installedCapex - 1500 * 100 * (100 / 10) ** (0.6 - 1)) < 1e-6);
});

test('Dead Sea demo scale is cash-positive at minerals mid intensity; Atacama Li stays cash+', () => {
  const deadSea = sizeForPositiveCashflow({ definition: createAbundanceCase(), scales: [1], rates: [0] });
  assert.ok(deadSea.objective.annualNetCash > 0, 'mid=12 is cash+ at Dead Sea demo scale because 4% fixed OM tracks CAPEX');
  assert.ok(deadSea.economics.installedCapex < 80 * 1e5, 'minerals intensity drop must cut demo CAPEX below the old $8M minerals line');
  const minerals = deadSea.definition.graph.nodes.find(node => node.id === 'minerals');
  assert.equal(minerals.capacity, 1e5);
  assert.equal(minerals.economics.capexRate, 12);

  const atacama = sizeForPositiveCashflow({
    definition: createAbundanceCase({ assayId: 'atacama-lithium-brine', region: 'Atacama/Chile' }),
    scales: [1],
    rates: [0],
  });
  assert.equal(atacama.objective.met, true);
  assert.ok(atacama.objective.annualNetCash > 0);
  assert.ok(atacama.objective.annualNetCash > deadSea.objective.annualNetCash);
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
    assert.notEqual(node.economics.annualDemandLimit, 1e12, node.id);
    assert.ok(node.economics.annualDemandLimit < 1e12, node.id);
    assert.ok(node.economics.annualDemandLimit > 0, node.id);
    assert.equal(node.economics.annualDemandLimit, tea.demand[productKey[node.id]].value, node.id);
  }
});

