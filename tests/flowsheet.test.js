const assert = require('node:assert/strict');
const test = require('node:test');

const { SUBSTANCES } = require('../engine/model');
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
