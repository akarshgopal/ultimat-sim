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
  assert.equal(tea.capex.minerals.value, 80);
  assert.equal(tea.capex.minerals.quality, 'screening');
  assert.ok(tea.capex.minerals.evidence.some(item => /10\.2172\/1782801/.test(item.doi || item.url || '')));
  assert.match(tea.demand.unlimited.note, /not a sales forecast/i);
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
  assert.equal(node('minerals').economics.capexRate, 80);
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
