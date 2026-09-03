const assert = require('node:assert/strict');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');

function materialFromKg(kg, volumeM3, density = 1025) {
  const soluteKg = Object.values(kg).reduce((sum, value) => sum + value, 0);
  const components = { H2O: volumeM3 * density - soluteKg, ...kg };
  return {
    kind: 'material',
    mol: Object.fromEntries(
      Object.entries(components).map(([substance, mass]) => [
        substance,
        mass * 1000 / SUBSTANCES[substance].molarMassG,
      ])
    ),
    phase: 'liquid',
    T_C: 25,
    P_bar: 1,
  };
}

function swroCase({ requested = 40, capacity = 100, electricity = 500, recovery = 0.45 } = {}) {
  const feed = materialFromKg({
    'Na+': 1080,
    'Cl-': 1940,
    'Mg+2': 129,
    'Ca+2': 41,
    'K+': 39,
    'SO4-2': 270,
    'Br-': 6.7,
    'Li+': 0.017,
    B: 0.45,
  }, 100);

  return {
    graph: {
      nodes: [
        { id: 'sea', unit: 'material-source', params: { stream: feed } },
        {
          id: 'power',
          unit: 'electricity-source',
          params: { stream: { kind: 'electricity', kWh: electricity } },
        },
        {
          id: 'ro',
          unit: 'swro',
          capacity,
          params: { recovery, secKWhPerM3: 3.5, feedDensityKgM3: 1025, ionRejection: 0.99 },
        },
        { id: 'water', unit: 'material-sink' },
        { id: 'brine', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'sea', port: 'out' }, to: { node: 'ro', port: 'feed' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'ro', port: 'electricity' } },
        { from: { node: 'ro', port: 'product' }, to: { node: 'water', port: 'in' } },
        { from: { node: 'ro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
      ],
    },
    operation: { setpoints: { ro: requested } },
  };
}

test('standalone SWRO conserves components and reports its active limit', () => {
  const solved = solveOperation(swroCase());
  const ro = solved.nodes.ro;

  assert.equal(ro.activity, 40);
  assert.equal(ro.consumed.electricity.kWh, 140);
  assert.deepEqual(ro.limitedBy, []);
  for (const substance of Object.keys(ro.consumed.feed.mol)) {
    assert.ok(
      Math.abs(ro.consumed.feed.mol[substance] - ro.outlets.product.mol[substance] - ro.outlets.brine.mol[substance]) < 1e-8,
      `${substance} must close across SWRO`
    );
  }
  assert.ok(solved.balances.maxAbsResidual < 1e-8);

  assert.deepEqual(solveOperation(swroCase({ requested: 80, capacity: 30 })).nodes.ro.limitedBy, ['capacity']);
  assert.deepEqual(solveOperation(swroCase({ requested: 80, electricity: 70 })).nodes.ro.limitedBy, ['electricity']);
  assert.deepEqual(solveOperation(swroCase({ requested: 80, recovery: 0.2 })).nodes.ro.limitedBy, ['feed']);
});

test('battery shifts electricity with explicit conversion loss', () => {
  const definition = swroCase({ requested: 40, electricity: 100 });
  definition.graph.nodes.push({ id: 'battery', unit: 'battery', capacity: 100, params: { efficiency: 0.9 } });
  const powerEdge = definition.graph.edges.find(edge => edge.from.node === 'power');
  powerEdge.to = { node: 'battery', port: 'in' };
  definition.graph.edges.push({ from: { node: 'battery', port: 'out' }, to: { node: 'ro', port: 'electricity' } });
  definition.operation.setpoints.battery = 90;

  const solved = solveOperation(definition);
  assert.equal(solved.nodes.battery.activity, 90);
  assert.equal(solved.nodes.battery.consumed.in.kWh, 100);
  assert.equal(solved.nodes.ro.activity, 90 / 3.5);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('material splitters divide without duplication and mixers recombine', () => {
  const waterA = materialFromKg({}, 0.001, 1000);
  const waterB = materialFromKg({}, 0.002, 1000);
  const solved = solveOperation({
    graph: {
      nodes: [
        { id: 'a', unit: 'material-source', params: { stream: waterA } },
        { id: 'b', unit: 'material-source', params: { stream: waterB } },
        { id: 'mix', unit: 'material-mixer' },
        { id: 'split', unit: 'material-splitter' },
        { id: 'small', unit: 'material-sink' },
        { id: 'large', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'a', port: 'out' }, to: { node: 'mix', port: 'in' } },
        { from: { node: 'b', port: 'out' }, to: { node: 'mix', port: 'in' } },
        { from: { node: 'mix', port: 'out' }, to: { node: 'split', port: 'in' } },
        { from: { node: 'split', port: 'out' }, to: { node: 'small', port: 'in' }, weight: 1 },
        { from: { node: 'split', port: 'out' }, to: { node: 'large', port: 'in' }, weight: 2 },
      ],
    },
  });

  assert.ok(Math.abs(streamMassKg(solved.nodes.small.received) - 1) < 1e-10);
  assert.ok(Math.abs(streamMassKg(solved.nodes.large.received) - 2) < 1e-10);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('MED uses separate electrical and temperature-graded thermal duties', () => {
  const solved = solveOperation({
    graph: {
      nodes: [
        { id: 'sea', unit: 'material-source', params: { stream: materialFromKg({}, 100, 1025) } },
        { id: 'power', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: 1000 } } },
        { id: 'heat', unit: 'heat-source', params: { stream: { kind: 'heat', kWh: 10000, T_C: 75 } } },
        { id: 'med', unit: 'med', capacity: 100, params: { recovery: 0.35, electricityKWhPerM3: 2, heatKWhPerM3: 60, minHeatT_C: 70 } },
        { id: 'water', unit: 'material-sink' },
        { id: 'brine', unit: 'material-sink' },
        { id: 'reject-heat', unit: 'heat-sink' },
      ],
      edges: [
        { from: { node: 'sea', port: 'out' }, to: { node: 'med', port: 'feed' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'med', port: 'electricity' } },
        { from: { node: 'heat', port: 'out' }, to: { node: 'med', port: 'heat' } },
        { from: { node: 'med', port: 'product' }, to: { node: 'water', port: 'in' } },
        { from: { node: 'med', port: 'brine' }, to: { node: 'brine', port: 'in' } },
        { from: { node: 'med', port: 'wasteHeat' }, to: { node: 'reject-heat', port: 'in' } },
      ],
    },
    operation: { setpoints: { med: 10 } },
  });

  assert.equal(solved.nodes.med.activity, 10);
  assert.equal(solved.nodes.med.consumed.electricity.kWh, 20);
  assert.equal(solved.nodes.med.consumed.heat.kWh, 600);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});
