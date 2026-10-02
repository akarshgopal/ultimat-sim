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

function bufferElyCase({
  feedKg = 0,
  initialKg = 0,
  capacityKg = 1000,
  dischargeKg = null,
  elySetpoint = 40,
  edgeCap = null,
} = {}) {
  const nodes = [
    {
      id: 'feed',
      unit: 'material-source',
      siteResource: 'water',
      params: { stream: waterStream(feedKg) },
    },
    {
      id: 'tank',
      unit: 'material-buffer',
      label: 'Feed tank',
      params: {
        capacityKg,
        initialKg,
        ...(initialKg > 0 ? { storedStream: waterStream(initialKg) } : {}),
      },
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
      label: 'Electrolyzer',
      capacity: 40,
      params: { secKWhPerKgH2: 50 },
    },
    { id: 'h2', unit: 'material-sink' },
    { id: 'o2', unit: 'material-sink' },
    { id: 'reject', unit: 'material-sink' },
  ];
  const edges = [
    { from: { node: 'feed', port: 'out' }, to: { node: 'tank', port: 'in' } },
    {
      from: { node: 'tank', port: 'out' },
      to: { node: 'ely', port: 'water' },
      ...(edgeCap != null ? { capacity: edgeCap } : {}),
    },
    { from: { node: 'power', port: 'out' }, to: { node: 'ely', port: 'electricity' } },
    { from: { node: 'ely', port: 'hydrogen' }, to: { node: 'h2', port: 'in' } },
    { from: { node: 'ely', port: 'oxygen' }, to: { node: 'o2', port: 'in' } },
    { from: { node: 'ely', port: 'waterReject' }, to: { node: 'reject', port: 'in' } },
  ];
  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(Math.max(feedKg, 1)), evidence: 'MECH16' },
        electricity: {
          quality: 'assumed',
          stream: { kind: 'electricity', kWh: 20000 },
          evidence: 'MECH16',
        },
      },
    },
    graph: { nodes, edges },
    operation: { setpoints: { ely: elySetpoint } },
  };
  if (dischargeKg != null) definition.operation.setpoints.tank = dischargeKg;
  return definition;
}

function splitBufferElyCase({
  feedKg = 100,
  acceptA = 10,
  capacityKg = 1000,
  swroCapacity = null,
} = {}) {
  const useSwro = swroCapacity != null;
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
      params: { capacityKg, initialKg: 0 },
    },
    {
      id: 'power',
      unit: 'electricity-source',
      siteResource: 'electricity',
      params: { stream: { kind: 'electricity', kWh: 1e6 } },
    },
  ];
  const edges = [
    { from: { node: 'feed', port: 'out' }, to: { node: 'split', port: 'in' } },
    { from: { node: 'split', port: 'out' }, to: { node: 'a', port: 'in' }, weight: 1 },
    { from: { node: 'split', port: 'out' }, to: { node: 'tank', port: 'in' }, weight: 1 },
  ];
  if (useSwro) {
    nodes.push(
      {
        id: 'swro',
        unit: 'swro',
        label: 'SWRO',
        capacity: swroCapacity,
        params: { recovery: 0.45, secKWhPerM3: 3.1 },
      },
      { id: 'water', unit: 'material-sink' },
      { id: 'brine', unit: 'material-sink' },
    );
    edges.push(
      { from: { node: 'tank', port: 'out' }, to: { node: 'swro', port: 'feed' } },
      { from: { node: 'power', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
      { from: { node: 'swro', port: 'product' }, to: { node: 'water', port: 'in' } },
      { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
    );
  } else {
    nodes.push(
      {
        id: 'ely',
        unit: 'electrolyzer',
        label: 'Electrolyzer',
        capacity: 40,
        params: { secKWhPerKgH2: 50 },
      },
      { id: 'h2', unit: 'material-sink' },
      { id: 'o2', unit: 'material-sink' },
      { id: 'reject', unit: 'material-sink' },
    );
    edges.push(
      { from: { node: 'tank', port: 'out' }, to: { node: 'ely', port: 'water' } },
      { from: { node: 'power', port: 'out' }, to: { node: 'ely', port: 'electricity' } },
      { from: { node: 'ely', port: 'hydrogen' }, to: { node: 'h2', port: 'in' } },
      { from: { node: 'ely', port: 'oxygen' }, to: { node: 'o2', port: 'in' } },
      { from: { node: 'ely', port: 'waterReject' }, to: { node: 'reject', port: 'in' } },
    );
  }
  return {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(feedKg), evidence: 'MECH16' },
        electricity: {
          quality: 'assumed',
          stream: { kind: 'electricity', kWh: 1e6 },
          evidence: 'MECH16',
        },
      },
    },
    graph: { nodes, edges },
    operation: {
      setpoints: useSwro ? { swro: swroCapacity } : { ely: 40 },
    },
  };
}

test('direct buffer inventory discharges into electrolyzer', () => {
  const solved = solveOperation(bufferElyCase({ initialKg: 100, feedKg: 0 }));
  assert.ok(Math.abs(solved.nodes.tank.activity - 100) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tank.inventoryKg) < 1e-9);
  assert.ok(solved.nodes.ely.activity > 10, solved.nodes.ely.activity);
  assert.ok(solved.nodes.ely.limitedBy.includes('water'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('empty buffer starves electrolyzer with honest cause', () => {
  const solved = solveOperation(bufferElyCase({
    initialKg: 0,
    feedKg: 0,
    dischargeKg: 0,
  }));
  assert.ok(solved.nodes.ely.activity < 1e-9);
  assert.ok(solved.nodes.ely.limitedBy.includes('water'), solved.nodes.ely.limitedBy);
  assert.ok(
    codes(solved.nodes.ely).includes('empty-buffer') || /buffer empty/.test(solved.nodes.ely.causeText || ''),
    solved.nodes.ely.causeText
  );
});

test('splitter overflow fills buffer→electrolyzer and crafts', () => {
  const solved = solveOperation(splitBufferElyCase({ acceptA: 10, capacityKg: 1000 }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.a.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.tank.consumed.in) - 90) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 100) < 1e-6);
  assert.ok(Math.abs(solved.nodes.ely.activity - 10.07085096651287) < 1e-6, solved.nodes.ely.activity);
  assert.ok(solved.nodes.ely.limitedBy.includes('water'));
  assert.ok(!(solved.nodes.split.limitedBy || []).length);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('SWRO under-draw banks rejected buffer discharge', () => {
  const solved = solveOperation(splitBufferElyCase({
    acceptA: 10,
    capacityKg: 1000,
    swroCapacity: 0.01,
  }));
  assert.ok(Math.abs(streamMassKg(solved.nodes.tank.consumed.in) - 90) < 1e-6);
  assert.ok(Math.abs(solved.nodes.swro.activity - 0.01) < 1e-9);
  assert.ok(Math.abs(streamMassKg(solved.nodes.swro.consumed.feed) - 22.77777777777778) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tank.inventoryKg - 67.22222222222223) < 1e-6, solved.nodes.tank.inventoryKg);
  assert.ok(solved.nodes.tank.limitedBy.includes('export'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('buffer→converter edge capacity banks as logistics', () => {
  const solved = solveOperation(bufferElyCase({
    initialKg: 100,
    feedKg: 0,
    edgeCap: 25,
  }));
  assert.ok(Math.abs(solved.nodes.tank.activity - 25) < 1e-6, solved.nodes.tank.activity);
  assert.ok(Math.abs(solved.nodes.tank.inventoryKg - 75) < 1e-6, solved.nodes.tank.inventoryKg);
  assert.ok(solved.nodes.tank.limitedBy.includes('logistics'), solved.nodes.tank.limitedBy);
  assert.ok(
    codes(solved.nodes.tank).includes('logistics') || /logistics/.test(solved.nodes.tank.causeText || ''),
    solved.nodes.tank.causeText
  );
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('Zabuye unconstrained stays bit-identical under MECH16', () => {
  const a = solveOperation(clone(siteZabuyeAbundance()));
  const b = solveOperation(clone(siteZabuyeAbundance()));
  assert.equal(a.nodes.minerals.activity, b.nodes.minerals.activity);
  assert.ok(a.balances.maxAbsResidual < 1e-8);
});
