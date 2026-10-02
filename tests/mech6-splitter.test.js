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

function equalSplitCase({ acceptA = null, capacityA = null, acceptB = null } = {}) {
  const nodes = [
    {
      id: 'feed',
      unit: 'material-source',
      siteResource: 'water',
      params: { stream: waterStream(100) },
    },
    { id: 'split', unit: 'material-splitter', label: 'Split' },
    {
      id: 'a',
      unit: 'material-sink',
      label: 'Branch A',
      ...(acceptA != null ? { params: { acceptKg: acceptA } } : {}),
    },
    {
      id: 'b',
      unit: 'material-sink',
      label: 'Branch B',
      ...(acceptB != null ? { params: { acceptKg: acceptB } } : {}),
    },
  ];
  const edgeA = {
    from: { node: 'split', port: 'out' },
    to: { node: 'a', port: 'in' },
    weight: 1,
  };
  if (capacityA != null) edgeA.capacity = capacityA;
  return {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(100), evidence: 'MECH6' },
      },
    },
    graph: {
      nodes,
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'split', port: 'in' } },
        edgeA,
        { from: { node: 'split', port: 'out' }, to: { node: 'b', port: 'in' }, weight: 1 },
      ],
    },
    operation: { setpoints: {} },
  };
}

test('unconstrained equal split stays balanced and closes mass', () => {
  const solved = solveOperation(equalSplitCase());
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 50) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 50) < 1e-6);
  assert.ok(!(solved.nodes.split.limitedBy || []).length);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

// MECH12: Factorio overflow — free sibling absorbs leftover; inlet stays open.
test('capped sink on one splitter branch overflows onto free sibling', () => {
  const solved = solveOperation(equalSplitCase({ acceptA: 10 }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 90) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.split.available) - 100) < 1e-6);
  assert.ok(!(solved.nodes.split.limitedBy || []).includes('export'));
  assert.ok(solved.nodes.a.limitedBy.includes('export'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('logistics cap on one splitter branch overflows onto free sibling', () => {
  const solved = solveOperation(equalSplitCase({ capacityA: 15 }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 15) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.b.received) - 85) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(!(solved.nodes.split.limitedBy || []).includes('logistics'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('converter upstream of splitter stays open when free branch can take overflow', () => {
  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(200), evidence: 'MECH6' },
        electricity: {
          quality: 'assumed',
          stream: { kind: 'electricity', kWh: 20000 },
          evidence: 'MECH6',
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
        { id: 'store', unit: 'material-sink', label: 'Store' },
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

  const free = solveOperation(clone({
    ...definition,
    graph: {
      ...definition.graph,
      nodes: definition.graph.nodes.map(node => (
        node.id === 'sale' ? { id: 'sale', unit: 'material-sink', label: 'Sale' } : node
      )),
    },
  }));
  const freeH2 = streamMassKg(free.nodes.split.available);
  assert.ok(freeH2 > 10, `free H2 ${freeH2}`);

  const solved = solveOperation(definition);
  // MECH12: sale takes 5, store takes the rest — craft stays at free rate.
  assert.ok(Math.abs(streamMassKg(solved.nodes.split.available) - freeH2) / freeH2 < 1e-4);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sale.received) - 5) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.store.received) - (freeH2 - 5)) / freeH2 < 1e-4);
  assert.ok(!(solved.nodes.ely.limitedBy || []).includes('export'));
  assert.ok(!(solved.nodes.split.limitedBy || []).includes('export'));
  assert.ok(solved.nodes.sale.limitedBy.includes('export'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('Zabuye unconstrained stays bit-identical under MECH6/12', () => {
  const a = solveOperation(clone(siteZabuyeAbundance()));
  const b = solveOperation(clone(siteZabuyeAbundance()));
  assert.equal(a.nodes.minerals.activity, b.nodes.minerals.activity);
  assert.ok(a.balances.maxAbsResidual < 1e-8);
  assert.ok(!Object.values(a.nodes).some(node => (node.limitedBy || []).includes('export')));
});
