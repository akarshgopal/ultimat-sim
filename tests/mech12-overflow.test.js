const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { siteZabuyeAbundance } = require('../cases/network');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function waterStream(kg) {
  const mol = kg * 1000 / 18.01528;
  return { kind: 'material', mol: { H2O: mol }, phase: 'liquid', T_C: 25, P_bar: 1 };
}

function codes(result) {
  return (result.causeChain || []).map(step => step.code);
}

function splitCase({
  feedKg = 100,
  accepts = {},
  capacities = {},
  weights = {},
  branches = ['a', 'b'],
} = {}) {
  const nodes = [
    {
      id: 'feed',
      unit: 'material-source',
      siteResource: 'water',
      params: { stream: waterStream(feedKg) },
    },
    { id: 'split', unit: 'material-splitter', label: 'Split' },
  ];
  const edges = [
    { from: { node: 'feed', port: 'out' }, to: { node: 'split', port: 'in' } },
  ];
  for (const id of branches) {
    const node = { id, unit: 'material-sink', label: `Branch ${id.toUpperCase()}` };
    if (accepts[id] != null) node.params = { acceptKg: accepts[id] };
    nodes.push(node);
    const edge = {
      from: { node: 'split', port: 'out' },
      to: { node: id, port: 'in' },
      weight: weights[id] ?? 1,
    };
    if (capacities[id] != null) edge.capacity = capacities[id];
    edges.push(edge);
  }
  return {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(feedKg), evidence: 'MECH12' },
      },
    },
    graph: { nodes, edges },
    operation: { setpoints: {} },
  };
}

test('both branches capped backpressures inlet after overflow attempt', () => {
  const solved = solveOperation(splitCase({ accepts: { a: 10, b: 20 } }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 20) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 30) < 1e-6);
  assert.ok(solved.nodes.split.limitedBy.includes('export'));
  assert.match(solved.nodes.split.causeText, /branch blocked/);
  assert.match(solved.nodes.split.causeText, /export capped/);
  assert.ok(codes(solved.nodes.split).includes('branch-blocked'));
  assert.ok(codes(solved.nodes.split).includes('export-capped'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('free leg edge capacity limits how much overflow it can absorb', () => {
  // A accept 10; B free but pipe cap 60 → leftover 30 still backpressures.
  const solved = solveOperation(splitCase({
    accepts: { a: 10 },
    capacities: { b: 60 },
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 60) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 70) < 1e-6);
  assert.ok(solved.nodes.split.limitedBy.includes('export') || solved.nodes.split.limitedBy.includes('logistics'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('three-way equal split rebalances leftover onto two free legs', () => {
  const solved = solveOperation(splitCase({
    feedKg: 90,
    branches: ['a', 'b', 'c'],
    accepts: { a: 10 },
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 40) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.c.received) - 40) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 90) < 1e-6);
  assert.ok(!(solved.nodes.split.limitedBy || []).length);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('weighted overflow prefers heavier free branch', () => {
  // A capped 10; B weight 1, C weight 3.
  // Round 1 offers 20/20/60; A→10; remaining 90 on B:C = 1:3 → 22.5/67.5.
  const solved = solveOperation(splitCase({
    feedKg: 100,
    branches: ['a', 'b', 'c'],
    accepts: { a: 10 },
    weights: { a: 1, b: 1, c: 3 },
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 22.5) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.c.received) - 67.5) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('converter throttles only when every splitter branch is saturated', () => {
  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(200), evidence: 'MECH12' },
        electricity: {
          quality: 'assumed',
          stream: { kind: 'electricity', kWh: 20000 },
          evidence: 'MECH12',
        },
      },
    },
    graph: {
      nodes: [
        {
          id: 'water',
          unit: 'material-source',
          siteResource: 'water',
          params: { stream: waterStream(200) },
        },
        {
          id: 'power',
          unit: 'electricity-source',
          siteResource: 'electricity',
          params: { stream: { kind: 'electricity', kWh: 20000 } },
        },
        {
          id: 'ely',
          unit: 'electrolyzer',
          capacity: 40,
          params: { electricityKWhPerKg: 50, waterRejectFraction: 0 },
        },
        { id: 'split', unit: 'material-splitter', label: 'H2 split' },
        { id: 'sale', unit: 'material-sink', label: 'Sale', params: { acceptKg: 5 } },
        { id: 'store', unit: 'material-sink', label: 'Store', params: { acceptKg: 5 } },
        { id: 'o2', unit: 'material-sink' },
        { id: 'reject', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'water', port: 'out' }, to: { node: 'ely', port: 'water' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'ely', port: 'electricity' } },
        { from: { node: 'ely', port: 'hydrogen' }, to: { node: 'split', port: 'in' } },
        { from: { node: 'split', port: 'out' }, to: { node: 'sale', port: 'in' }, weight: 1 },
        { from: { node: 'split', port: 'out' }, to: { node: 'store', port: 'in' }, weight: 1 },
        { from: { node: 'ely', port: 'oxygen' }, to: { node: 'o2', port: 'in' } },
        { from: { node: 'ely', port: 'waterReject' }, to: { node: 'reject', port: 'in' } },
      ],
    },
    operation: { setpoints: { ely: 40 } },
  };

  const solved = solveOperation(definition);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sale.received) - 5) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.store.received) - 5) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.split.available) - 10) < 1e-4);
  assert.ok(solved.nodes.split.limitedBy.includes('export'));
  assert.ok(solved.nodes.ely.limitedBy.includes('export'));
  assert.match(solved.nodes.ely.causeText, /branch blocked/);
  assert.ok(codes(solved.nodes.ely).includes('branch-blocked'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('Zabuye unconstrained stays bit-identical under MECH12', () => {
  const a = solveOperation(clone(siteZabuyeAbundance()));
  const b = solveOperation(clone(siteZabuyeAbundance()));
  assert.equal(a.nodes.minerals.activity, b.nodes.minerals.activity);
  assert.ok(a.balances.maxAbsResidual < 1e-8);
  assert.ok(!Object.values(a.nodes).some(node => (node.limitedBy || []).includes('export')));
});
