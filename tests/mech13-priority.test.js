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

function splitCase({
  feedKg = 100,
  accepts = {},
  capacities = {},
  weights = {},
  priorities = {},
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
    if (priorities[id] != null) edge.priority = priorities[id];
    if (capacities[id] != null) edge.capacity = capacities[id];
    edges.push(edge);
  }
  return {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(feedKg), evidence: 'MECH13' },
      },
    },
    graph: { nodes, edges },
    operation: { setpoints: {} },
  };
}

test('high-priority free leg takes all when sibling is also free', () => {
  const solved = solveOperation(splitCase({
    priorities: { a: 1, b: 0 },
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 100) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 0) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(!(solved.nodes.split.limitedBy || []).length);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('high-priority capped overflows onto lower priority (MECH12 compose)', () => {
  const solved = solveOperation(splitCase({
    accepts: { a: 30 },
    priorities: { a: 1, b: 0 },
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 30) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 70) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(solved.nodes.a.limitedBy.includes('export'));
  assert.ok(!(solved.nodes.split.limitedBy || []).includes('export'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('same-tier priority still weight-splits then overflows', () => {
  // A+B priority 1 equal weight; A accept 10; C priority 0.
  // Tier 1 water-fills A/B: A→10, B→90; C stays 0.
  const solved = solveOperation(splitCase({
    feedKg: 100,
    branches: ['a', 'b', 'c'],
    accepts: { a: 10 },
    priorities: { a: 1, b: 1, c: 0 },
    weights: { a: 1, b: 1, c: 1 },
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 90) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.c.received) - 0) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('weighted high-priority pair fills before low priority', () => {
  // A prio 2 weight 1 accept 20; B prio 2 weight 3 uncapped; C prio 0.
  // Tier 2: A→20, B→80; C=0.
  const solved = solveOperation(splitCase({
    feedKg: 100,
    branches: ['a', 'b', 'c'],
    accepts: { a: 20 },
    priorities: { a: 2, b: 2, c: 0 },
    weights: { a: 1, b: 3, c: 1 },
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 20) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 80) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.c.received) - 0) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('unset priorities stay MECH12 equal-overflow', () => {
  const solved = solveOperation(splitCase({
    accepts: { a: 10 },
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 90) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('both priority legs capped backpressures after lower overflow', () => {
  // A prio 1 accept 10; B prio 0 accept 20 → feed 30.
  const solved = solveOperation(splitCase({
    accepts: { a: 10, b: 20 },
    priorities: { a: 1, b: 0 },
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 20) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 30) < 1e-6);
  assert.ok(solved.nodes.split.limitedBy.includes('export'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('logistics cap on high-priority spills to low', () => {
  const solved = solveOperation(splitCase({
    capacities: { a: 25 },
    priorities: { a: 1, b: 0 },
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 25) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 75) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('Zabuye unconstrained stays bit-identical under MECH13', () => {
  const a = solveOperation(clone(siteZabuyeAbundance()));
  const b = solveOperation(clone(siteZabuyeAbundance()));
  assert.equal(a.nodes.minerals.activity, b.nodes.minerals.activity);
  assert.ok(a.balances.maxAbsResidual < 1e-8);
  assert.ok(!Object.values(a.nodes).some(node => (node.limitedBy || []).includes('export')));
});
