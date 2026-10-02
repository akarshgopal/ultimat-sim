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

function splitBufferCase({
  feedKg = 100,
  acceptA = 10,
  capacityKg = 1000,
  initialKg = 0,
  dischargeKg = null,
  edgeCapB = null,
  priorityA = null,
  priorityB = null,
  bufferToConverter = false,
} = {}) {
  const nodes = [
    {
      id: 'feed',
      unit: 'material-source',
      siteResource: 'water',
      params: { stream: waterStream(feedKg) },
    },
    { id: 'split', unit: 'material-splitter', label: 'Split' },
    { id: 'a', unit: 'material-sink', label: 'Sale', params: { acceptKg: acceptA } },
    {
      id: 'tank',
      unit: 'material-buffer',
      label: 'Buffer tank',
      params: { capacityKg, initialKg },
    },
    { id: 'store', unit: 'material-sink', label: 'Store' },
  ];
  const edges = [
    { from: { node: 'feed', port: 'out' }, to: { node: 'split', port: 'in' } },
    {
      from: { node: 'split', port: 'out' },
      to: { node: 'a', port: 'in' },
      weight: 1,
      ...(priorityA != null ? { priority: priorityA } : {}),
    },
    {
      from: { node: 'split', port: 'out' },
      to: { node: 'tank', port: 'in' },
      weight: 1,
      ...(edgeCapB != null ? { capacity: edgeCapB } : {}),
      ...(priorityB != null ? { priority: priorityB } : {}),
    },
    { from: { node: 'tank', port: 'out' }, to: { node: 'store', port: 'in' } },
  ];

  if (bufferToConverter) {
    nodes.push(
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
      { id: 'h2', unit: 'material-sink' },
      { id: 'o2', unit: 'material-sink' },
      { id: 'reject', unit: 'material-sink' },
    );
    // Retarget tank outlet from store → electrolyzer water.
    edges.splice(edges.findIndex(e => e.from.node === 'tank'), 1);
    edges.push(
      { from: { node: 'tank', port: 'out' }, to: { node: 'ely', port: 'water' } },
      { from: { node: 'power', port: 'out' }, to: { node: 'ely', port: 'electricity' } },
      { from: { node: 'ely', port: 'hydrogen' }, to: { node: 'h2', port: 'in' } },
      { from: { node: 'ely', port: 'oxygen' }, to: { node: 'o2', port: 'in' } },
      { from: { node: 'ely', port: 'waterReject' }, to: { node: 'reject', port: 'in' } },
    );
    // Drop unused store sink.
    const storeIdx = nodes.findIndex(n => n.id === 'store');
    if (storeIdx >= 0) nodes.splice(storeIdx, 1);
  }

  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(feedKg), evidence: 'MECH14' },
        ...(bufferToConverter
          ? {
            electricity: {
              quality: 'assumed',
              stream: { kind: 'electricity', kWh: 20000 },
              evidence: 'MECH14',
            },
          }
          : {}),
      },
    },
    graph: { nodes, edges },
    operation: { setpoints: bufferToConverter ? { ely: 40 } : {} },
  };
  if (dischargeKg != null) definition.operation.setpoints.tank = dischargeKg;
  return definition;
}

test('overflow fills free pass-through buffer then drains to sink', () => {
  const solved = solveOperation(splitBufferCase({ acceptA: 10, capacityKg: 200 }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.tank.consumed.in) - 90) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tank.activity - 90) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tank.inventoryKg) < 1e-9);
  assert.ok(Math.abs(streamMassKg(solved.nodes.store.received) - 90) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(!(solved.nodes.split.limitedBy || []).length);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('buffer capacity caps overflow and backpressures leftover', () => {
  const solved = solveOperation(splitBufferCase({ acceptA: 10, capacityKg: 50 }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.tank.consumed.in) - 50) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 60) < 1e-6);
  assert.ok(solved.nodes.split.limitedBy.includes('export'));
  assert.ok(codes(solved.nodes.split).includes('branch-blocked'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('fixed discharge keeps overflow as inventory SOC', () => {
  const solved = solveOperation(splitBufferCase({
    acceptA: 10,
    capacityKg: 1000,
    dischargeKg: 20,
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.tank.consumed.in) - 90) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tank.activity - 20) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tank.inventoryKg - 70) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.store.received) - 20) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-6, JSON.stringify(solved.balances));
});

test('edge capacity on buffer leg limits overflow absorb', () => {
  const solved = solveOperation(splitBufferCase({
    acceptA: 10,
    capacityKg: 1000,
    edgeCapB: 40,
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.tank.consumed.in) - 40) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 50) < 1e-6);
  assert.ok(
    solved.nodes.split.limitedBy.includes('export')
    || solved.nodes.split.limitedBy.includes('logistics')
  );
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('priority sale fills first then overflows into buffer', () => {
  const solved = solveOperation(splitBufferCase({
    acceptA: 30,
    capacityKg: 1000,
    priorityA: 1,
    priorityB: 0,
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 30) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.tank.consumed.in) - 70) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('buffer feeding converter absorbs overflow (MECH16)', () => {
  // Equal split 50/50; A capped at 10. MECH16 opens tank→ely so leftover
  // fills the tank (90) and feed stays at 100.
  const solved = solveOperation(splitBufferCase({
    acceptA: 10,
    capacityKg: 1000,
    bufferToConverter: true,
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.tank.consumed.in) - 90) < 1e-6, JSON.stringify({
    tankIn: streamMassKg(solved.nodes.tank.consumed.in),
    feed: streamMassKg(solved.nodes.feed.supplied),
    ely: solved.nodes.ely?.activity,
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(solved.nodes.ely.activity > 5, solved.nodes.ely.activity);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('Zabuye unconstrained stays bit-identical under MECH14', () => {
  const a = solveOperation(clone(siteZabuyeAbundance()));
  const b = solveOperation(clone(siteZabuyeAbundance()));
  assert.equal(a.nodes.minerals.activity, b.nodes.minerals.activity);
  assert.ok(a.balances.maxAbsResidual < 1e-8);
});
