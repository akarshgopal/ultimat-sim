const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation, attachCauseChains } = require('../engine/solve');
const { siteZabuyeAbundance } = require('../cases/network');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function waterStream(kg) {
  const mol = kg * 1000 / 18.01528;
  return { kind: 'material', mol: { H2O: mol }, phase: 'liquid', T_C: 25, P_bar: 1 };
}

function scaleMaterial(stream, factor) {
  return {
    ...stream,
    mol: Object.fromEntries(Object.entries(stream.mol).map(([key, value]) => [key, value * factor])),
  };
}

function codes(result) {
  return (result.causeChain || []).map(step => step.code);
}

test('brine→minerals logistics chain names the clamped edge', () => {
  const freeCase = siteZabuyeAbundance();
  const free = solveOperation(clone(freeCase));
  const limited = clone(freeCase);
  const brineEdge = limited.graph.edges.find(edge => edge.from.node === 'brine' && edge.to.node === 'minerals');
  brineEdge.capacity = free.nodes.minerals.activity * 0.4;

  const solved = solveOperation(limited);
  assert.ok(solved.nodes.minerals.limitedBy.includes('logistics'));
  assert.ok(solved.nodes.minerals.causeText.includes('brine→minerals logistics'));
  assert.deepEqual(codes(solved.nodes.minerals), ['logistics']);
  assert.equal(solved.nodes.minerals.causeChain[0].edge.from.node, 'brine');
  assert.equal(solved.nodes.minerals.causeChain[0].edge.to.node, 'minerals');
});

test('power-bus cable logistics chain cites the cable', () => {
  const limited = clone(siteZabuyeAbundance());
  const cable = limited.graph.edges.find(edge => edge.from.node === 'power-bus' && edge.to.node === 'minerals');
  cable.capacity = 1000;

  const solved = solveOperation(limited);
  assert.ok(solved.nodes.minerals.limitedBy.includes('logistics'));
  assert.ok(solved.nodes.minerals.causeText.includes('power-bus→minerals logistics'));
  assert.deepEqual(codes(solved.nodes.minerals), ['logistics']);
});

test('site budget on brine walks into minerals short-on-brine chain', () => {
  const limited = clone(siteZabuyeAbundance());
  const brine = limited.site.resources.brine.stream;
  const mass = streamMassKg(brine);
  limited.site.resources.brine.stream = scaleMaterial(brine, 5000 / mass);

  const solved = solveOperation(limited);
  assert.ok(solved.nodes.brine.limitedBy.includes('site budget'));
  assert.match(solved.nodes.brine.causeText, /site budget/);
  assert.ok(solved.nodes.minerals.limitedBy.includes('brine'));
  assert.ok(codes(solved.nodes.minerals).includes('site-budget'));
  assert.ok(solved.nodes.minerals.causeText.includes('site budget'));
  assert.ok(solved.nodes.minerals.causeText.includes('short on brine'));
});

test('empty buffer inventory is the root cause', () => {
  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(0), evidence: 'MECH4' },
      },
    },
    graph: {
      nodes: [
        {
          id: 'feed',
          unit: 'material-source',
          label: 'Freshwater',
          siteResource: 'water',
          params: { stream: waterStream(0) },
        },
        {
          id: 'tank',
          unit: 'material-buffer',
          label: 'Buffer tank',
          params: { capacityKg: 1000, initialKg: 0 },
        },
        { id: 'sink', unit: 'material-sink', label: 'Offtake' },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'tank', port: 'in' } },
        { from: { node: 'tank', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: { tank: 40 } },
  };

  const solved = solveOperation(definition);
  assert.ok(solved.nodes.tank.limitedBy.includes('inventory'));
  assert.equal(solved.nodes.tank.causeText, 'Buffer tank buffer empty');
  assert.deepEqual(codes(solved.nodes.tank), ['empty-buffer']);
});

test('downstream converter chain cites empty upstream buffer', () => {
  // Water → buffer → SWRO. Empty tank + zero discharge → SWRO short on feed ← buffer empty.
  const seawater = waterStream(1);
  const definition = {
    site: {
      resources: {
        seawater: { quality: 'assumed', stream: waterStream(0), evidence: 'MECH4' },
        electricity: { quality: 'assumed', stream: { kind: 'electricity', kWh: 1e6 } },
      },
    },
    graph: {
      nodes: [
        {
          id: 'sea',
          unit: 'material-source',
          label: 'Seawater intake',
          siteResource: 'seawater',
          params: { stream: waterStream(0) },
        },
        {
          id: 'tank',
          unit: 'material-buffer',
          label: 'Feed tank',
          params: { capacityKg: 1e6, initialKg: 0 },
        },
        {
          id: 'power',
          unit: 'electricity-source',
          siteResource: 'electricity',
          params: { stream: { kind: 'electricity', kWh: 1e6 } },
        },
        {
          id: 'swro',
          unit: 'swro',
          label: 'SWRO',
          capacity: 100,
          params: { recovery: 0.45, secKWhPerM3: 3.5 },
        },
        { id: 'water', unit: 'material-sink' },
        { id: 'brine', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'sea', port: 'out' }, to: { node: 'tank', port: 'in' } },
        { from: { node: 'tank', port: 'out' }, to: { node: 'swro', port: 'feed' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
        { from: { node: 'swro', port: 'product' }, to: { node: 'water', port: 'in' } },
        { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
      ],
    },
    operation: { setpoints: { swro: 10, tank: 0 } },
  };

  const solved = solveOperation(definition);
  assert.ok(solved.nodes.swro.limitedBy.includes('feed'), solved.nodes.swro.limitedBy);
  assert.ok(
    codes(solved.nodes.swro).includes('empty-buffer') || /buffer empty/.test(solved.nodes.swro.causeText),
    solved.nodes.swro.causeText
  );
  assert.match(solved.nodes.swro.causeText, /short on feed/i);
});

test('missing inlet port is reported when limitedBy names an unconnected port', () => {
  const caseDefinition = {
    graph: {
      nodes: [
        { id: 'swro', unit: 'swro', label: 'SWRO', capacity: 10, params: {} },
      ],
      edges: [],
    },
  };
  const nodeResults = {
    swro: { limitedBy: ['feed'], activity: 0 },
  };
  attachCauseChains(caseDefinition, nodeResults, []);
  assert.deepEqual(codes(nodeResults.swro), ['missing-inlet']);
  assert.match(nodeResults.swro.causeText, /missing feed/);
});

test('unconstrained Zabuye has no cause chains', () => {
  const solved = solveOperation(clone(siteZabuyeAbundance()));
  for (const result of Object.values(solved.nodes)) {
    assert.equal(result.causeText, undefined);
    assert.equal(result.causeChain, undefined);
  }
});
