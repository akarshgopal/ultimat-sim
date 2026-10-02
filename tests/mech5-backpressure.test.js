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

test('unconstrained Zabuye stays bit-identical without sink caps', () => {
  const a = solveOperation(clone(siteZabuyeAbundance()));
  const b = solveOperation(clone(siteZabuyeAbundance()));
  assert.equal(a.nodes.minerals.activity, b.nodes.minerals.activity);
  assert.ok(a.balances.maxAbsResidual < 1e-8);
  assert.ok(!Object.values(a.nodes).some(node => (node.limitedBy || []).includes('export')));
});

test('capped material sink backpressures a direct source', () => {
  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(100), evidence: 'MECH5' },
      },
    },
    graph: {
      nodes: [
        {
          id: 'feed',
          unit: 'material-source',
          siteResource: 'water',
          params: { stream: waterStream(100) },
        },
        {
          id: 'offtake',
          unit: 'material-sink',
          label: 'Offtake',
          params: { acceptKg: 35 },
        },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'offtake', port: 'in' } },
      ],
    },
    operation: { setpoints: {} },
  };

  const solved = solveOperation(definition);
  assert.ok(Math.abs(streamMassKg(solved.nodes.offtake.received) - 35) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 35) < 1e-6);
  assert.ok(solved.nodes.offtake.limitedBy.includes('export'));
  assert.match(solved.nodes.offtake.causeText, /export capped/);
  assert.deepEqual(codes(solved.nodes.offtake), ['export-capped']);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('lithium offtake cap throttles brine-minerals and names the cause', () => {
  const freeCase = siteZabuyeAbundance();
  const free = solveOperation(clone(freeCase));
  const limited = clone(freeCase);
  const lithium = limited.graph.nodes.find(node => node.id === 'lithium');
  const freeLi = streamMassKg(free.nodes.lithium.received);
  lithium.params = { ...(lithium.params || {}), acceptKg: freeLi * 0.4 };
  lithium.label = 'Lithium offtake';

  const solved = solveOperation(limited);
  assert.ok(Math.abs(solved.nodes.minerals.activity / free.nodes.minerals.activity - 0.4) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.lithium.received) - freeLi * 0.4) < 1e-4);
  assert.ok(solved.nodes.lithium.limitedBy.includes('export'));
  assert.ok(solved.nodes.minerals.limitedBy.includes('export'));
  assert.match(solved.nodes.minerals.causeText, /blocked by export/);
  assert.match(solved.nodes.minerals.causeText, /export capped/);
  assert.ok(codes(solved.nodes.minerals).includes('export-capped'));
  assert.ok(
    Math.abs(streamMassKg(solved.nodes.brine.supplied) / streamMassKg(free.nodes.brine.supplied) - 0.4) < 1e-6
  );
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('full buffer backpressures an upstream converter', () => {
  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(100), evidence: 'MECH5' },
        electricity: {
          quality: 'assumed',
          stream: { kind: 'electricity', kWh: 10000 },
          evidence: 'MECH5',
        },
      },
    },
    graph: {
      nodes: [
        {
          id: 'water',
          unit: 'material-source',
          siteResource: 'water',
          params: { stream: waterStream(100) },
        },
        {
          id: 'power',
          unit: 'electricity-source',
          siteResource: 'electricity',
          params: { stream: { kind: 'electricity', kWh: 10000 } },
        },
        {
          id: 'ely',
          unit: 'electrolyzer',
          capacity: 50,
          params: { electricityKWhPerKg: 50, waterRejectFraction: 0 },
        },
        {
          id: 'tank',
          unit: 'material-buffer',
          label: 'H2 tank',
          params: { capacityKg: 5, initialKg: 5 },
        },
        { id: 'o2', unit: 'material-sink' },
        { id: 'reject', unit: 'material-sink' },
        { id: 'h2sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'water', port: 'out' }, to: { node: 'ely', port: 'water' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'ely', port: 'electricity' } },
        { from: { node: 'ely', port: 'hydrogen' }, to: { node: 'tank', port: 'in' } },
        { from: { node: 'tank', port: 'out' }, to: { node: 'h2sink', port: 'in' } },
        { from: { node: 'ely', port: 'oxygen' }, to: { node: 'o2', port: 'in' } },
        { from: { node: 'ely', port: 'waterReject' }, to: { node: 'reject', port: 'in' } },
      ],
    },
    operation: { setpoints: { ely: 50, tank: 0 } },
  };

  const solved = solveOperation(definition);
  assert.ok(solved.nodes.ely.activity < 1e-9);
  assert.ok(solved.nodes.ely.limitedBy.includes('export'));
  assert.ok(solved.nodes.tank.limitedBy.includes('capacity'));
  assert.match(solved.nodes.ely.causeText, /blocked by export/);
  assert.match(solved.nodes.ely.causeText, /buffer full/);
  assert.ok(Math.abs(streamMassKg(solved.nodes.water.supplied)) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('setpoint on sink also caps accept', () => {
  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(80), evidence: 'MECH5' },
      },
    },
    graph: {
      nodes: [
        {
          id: 'feed',
          unit: 'material-source',
          siteResource: 'water',
          params: { stream: waterStream(80) },
        },
        { id: 'offtake', unit: 'material-sink', label: 'Sale' },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'offtake', port: 'in' } },
      ],
    },
    operation: { setpoints: { offtake: 20 } },
  };

  const solved = solveOperation(definition);
  assert.ok(Math.abs(streamMassKg(solved.nodes.offtake.received) - 20) < 1e-6);
  assert.ok(solved.nodes.offtake.limitedBy.includes('export'));
});
