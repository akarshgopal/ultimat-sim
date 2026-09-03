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

const WATER_KG_PER_KG_H2 = SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
const PRODUCT_WATER_KG_PER_M3 = 1000;

function electrolysisCase({
  electricity = 390,
  roRequested = null,
  electrolyzerRequested = 5,
  electrolyzerCapacity = 10,
} = {}) {
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
  const requestedRo = roRequested ?? electrolyzerRequested * WATER_KG_PER_KG_H2 / PRODUCT_WATER_KG_PER_M3;

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
          capacity: 100,
          params: { recovery: 0.45, secKWhPerM3: 3.5, feedDensityKgM3: 1025, ionRejection: 1 },
        },
        { id: 'electrical-bus', unit: 'electrical-bus' },
        {
          id: 'electrolyzer',
          unit: 'electrolyzer',
          capacity: electrolyzerCapacity,
          params: { secKWhPerKgH2: 50 },
        },
        { id: 'brine', unit: 'material-sink' },
        { id: 'h2', unit: 'material-sink' },
        { id: 'o2', unit: 'material-sink' },
        { id: 'water-reject', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'sea', port: 'out' }, to: { node: 'ro', port: 'feed' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'electrical-bus', port: 'in' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'ro', port: 'electricity' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'ro', port: 'product' }, to: { node: 'electrolyzer', port: 'water' } },
        { from: { node: 'ro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'h2', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'o2', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'water-reject', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { ro: requestedRo, electrolyzer: electrolyzerRequested },
      priorities: { 'electrical-bus': ['ro', 'electrolyzer'] },
    },
  };
}

test('SWRO to electrolysis closes components and produces H2/O2 at fixed capacities', () => {
  const solved = solveOperation(electrolysisCase());
  const ro = solved.nodes.ro;
  const electrolyzer = solved.nodes.electrolyzer;

  assert.ok(Math.abs(ro.activity - 5 * WATER_KG_PER_KG_H2 / PRODUCT_WATER_KG_PER_M3) < 1e-12);
  assert.equal(electrolyzer.activity, 5);
  assert.deepEqual(ro.limitedBy, []);
  assert.deepEqual(electrolyzer.limitedBy, []);
  assert.ok(Math.abs(streamMassKg(electrolyzer.outlets.hydrogen) - 5) < 1e-8);
  assert.ok(Math.abs(
    streamMassKg(electrolyzer.outlets.oxygen)
      - streamMassKg(electrolyzer.outlets.hydrogen)
        * SUBSTANCES.O2.molarMassG / (2 * SUBSTANCES.H2.molarMassG)
  ) < 1e-8);
  assert.equal(
    solved.nodes.power.supplied.kWh,
    ro.consumed.electricity.kWh + electrolyzer.consumed.electricity.kWh
  );
  assert.ok(solved.nodes.power.supplied.kWh < 390);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('priority electricity allocation serves SWRO before electrolyzer', () => {
  const solved = solveOperation(electrolysisCase({ electricity: 200 }));
  const ro = solved.nodes.ro;
  const electrolyzer = solved.nodes.electrolyzer;

  assert.ok(Math.abs(ro.activity - 5 * WATER_KG_PER_KG_H2 / PRODUCT_WATER_KG_PER_M3) < 1e-12);
  assert.ok(ro.consumed.electricity.kWh < 1);
  assert.ok(electrolyzer.activity < 5);
  assert.deepEqual(electrolyzer.limitedBy, ['electricity']);
  assert.ok(streamMassKg(solved.nodes['water-reject'].received) > 0);
  assert.ok(solved.warnings.some(warning => warning.includes('electrolyzer limited by electricity')));
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('electrolyzer honors fixed capacity while balances remain closed', () => {
  const solved = solveOperation(electrolysisCase({
    roRequested: 2 * WATER_KG_PER_KG_H2 / PRODUCT_WATER_KG_PER_M3,
    electrolyzerCapacity: 2,
    electrolyzerRequested: 5,
  }));
  const electrolyzer = solved.nodes.electrolyzer;

  assert.equal(electrolyzer.activity, 2);
  assert.ok(electrolyzer.limitedBy.includes('capacity'));
  assert.ok(Math.abs(streamMassKg(electrolyzer.consumed.water) - 2 * WATER_KG_PER_KG_H2) < 1e-8);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});
