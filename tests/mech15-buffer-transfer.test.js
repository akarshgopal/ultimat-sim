const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation, solveHorizon } = require('../engine/solve');

function waterStream(kg) {
  const mol = kg * 1000 / 18.01528;
  return { kind: 'material', mol: { H2O: mol }, phase: 'liquid', T_C: 25, P_bar: 1 };
}

function horizonSite(dailyFeedKg) {
  const profile = Array(24).fill(0.1);
  return {
    solarKWp: 0,
    month: 0,
    solar: { annualTypical: profile, typicalDayKWhPerKWp: profile },
    resources: {
      water: {
        quality: 'assumed',
        stream: waterStream(dailyFeedKg),
        evidence: 'MECH15 horizon feed',
      },
      electricity: {
        quality: 'assumed',
        stream: { kind: 'electricity', kWh: 0 },
      },
    },
    storage: { batteryKWh: 0, powerKW: 0, efficiency: 0.9, initialKWh: 0 },
  };
}

function transferCase({
  feedKg = 100,
  capA = 1000,
  capB = 1000,
  initA = 0,
  initB = 0,
  disA = null,
  disB = null,
  edgeCap = null,
  storedA = null,
  storedB = null,
} = {}) {
  const tankA = { id: 'tankA', unit: 'material-buffer', params: { capacityKg: capA, initialKg: initA } };
  const tankB = { id: 'tankB', unit: 'material-buffer', params: { capacityKg: capB, initialKg: initB } };
  if (storedA) tankA.params.storedStream = storedA;
  if (storedB) tankB.params.storedStream = storedB;
  const transfer = {
    from: { node: 'tankA', port: 'out' },
    to: { node: 'tankB', port: 'in' },
  };
  if (edgeCap != null) transfer.capacity = edgeCap;
  const definition = {
    site: {
      resources: {
        water: {
          quality: 'assumed',
          stream: waterStream(Math.max(feedKg, 1e-9)),
          evidence: 'MECH15 transfer feed',
        },
      },
    },
    graph: {
      nodes: [
        {
          id: 'feed',
          unit: 'material-source',
          siteResource: 'water',
          params: { stream: waterStream(feedKg) },
        },
        tankA,
        tankB,
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'tankA', port: 'in' } },
        transfer,
        { from: { node: 'tankB', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: {} },
  };
  if (disA != null) definition.operation.setpoints.tankA = disA;
  if (disB != null) definition.operation.setpoints.tankB = disB;
  return definition;
}

test('buffer→buffer pass-through conserves mass', () => {
  const solved = solveOperation(transferCase({ feedKg: 80, capB: 1000 }));
  assert.ok(Math.abs(solved.nodes.tankA.activity - 80) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tankB.activity - 80) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tankA.inventoryKg) < 1e-9);
  assert.ok(Math.abs(solved.nodes.tankB.inventoryKg) < 1e-9);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 80) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('full destination backpressures source and cause names full buffer', () => {
  const solved = solveOperation(transferCase({
    feedKg: 100,
    capB: 40,
    disB: 0,
  }));
  assert.ok(Math.abs(solved.nodes.tankB.inventoryKg - 40) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tankA.activity - 40) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tankA.inventoryKg - 60) < 1e-6);
  assert.ok(solved.nodes.tankB.limitedBy.includes('capacity'));
  assert.ok(solved.nodes.tankA.limitedBy.includes('export'));
  assert.match(solved.nodes.tankA.causeText || '', /tankB buffer full/);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 0) < 1e-9);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('transfer edge.capacity clamps flow and cause names logistics', () => {
  const solved = solveOperation(transferCase({
    feedKg: 100,
    disA: 100,
    disB: 0,
    edgeCap: 25,
  }));
  assert.ok(Math.abs(solved.nodes.tankA.activity - 25) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tankA.inventoryKg - 75) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tankB.inventoryKg - 25) < 1e-6);
  assert.ok(solved.nodes.tankA.limitedBy.includes('logistics'));
  assert.ok(!(solved.nodes.tankA.limitedBy || []).includes('export'));
  assert.match(solved.nodes.tankA.causeText || '', /tankA→tankB logistics/);
  assert.ok(solved.edgeLimits.some(item => (
    item.from.node === 'tankA' && item.to.node === 'tankB' && item.capacity === 25
  )));
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('empty source inventory starves destination with empty-buffer cause', () => {
  const solved = solveOperation(transferCase({
    feedKg: 0,
    initA: 0,
    initB: 0,
    disA: 50,
    disB: 50,
  }));
  assert.equal(solved.nodes.tankA.activity, 0);
  assert.equal(solved.nodes.tankB.activity, 0);
  assert.ok(solved.nodes.tankA.limitedBy.includes('inventory'));
  assert.ok(
    (solved.nodes.tankA.causeText || '').includes('buffer empty')
      || (solved.nodes.tankB.causeText || '').includes('buffer empty')
      || (solved.nodes.sink.causeText || '').includes('buffer empty')
      || solved.nodes.tankA.limitedBy.includes('inventory'),
  );
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received || waterStream(0)) - 0) < 1e-9);
});

test('inventory-only start without storedStream does not throw', () => {
  const solved = solveOperation(transferCase({
    feedKg: 0,
    initA: 50,
    capA: 100,
    disA: 20,
    disB: 0,
  }));
  assert.equal(solved.nodes.tankA.activity, 0);
  assert.ok(Math.abs(solved.nodes.tankA.inventoryKg - 50) < 1e-9);
  assert.ok(solved.nodes.tankA.limitedBy.includes('inventory'));
  assert.ok(solved.balances.maxAbsResidual < 1e-6);
});

test('drain A into B with storedStream then B to sink', () => {
  const solved = solveOperation(transferCase({
    feedKg: 0,
    initA: 60,
    storedA: waterStream(60),
    capA: 200,
    capB: 200,
    disA: 60,
    disB: null,
  }));
  assert.ok(Math.abs(solved.nodes.tankA.activity - 60) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tankA.inventoryKg) < 1e-9);
  assert.ok(Math.abs(solved.nodes.tankB.activity - 60) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 60) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('horizon dual-tank SOC stays consistent across both buffers', () => {
  const definition = {
    site: horizonSite(240),
    graph: {
      nodes: [
        {
          id: 'feed',
          unit: 'material-source',
          siteResource: 'water',
          params: { stream: waterStream(240) },
        },
        { id: 'tankA', unit: 'material-buffer', params: { capacityKg: 500, initialKg: 0 } },
        { id: 'tankB', unit: 'material-buffer', params: { capacityKg: 200, initialKg: 0 } },
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'tankA', port: 'in' } },
        { from: { node: 'tankA', port: 'out' }, to: { node: 'tankB', port: 'in' } },
        { from: { node: 'tankB', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: { tankA: 120, tankB: 60 } },
  };
  const solved = solveHorizon(definition);
  assert.equal(solved.horizon.hours.length, 24);
  const socA = solved.horizon.hours.map(entry => entry.buffers.tankA.soc);
  const socB = solved.horizon.hours.map(entry => entry.buffers.tankB.soc);
  assert.ok(Math.abs(socA[23] - 120) < 1, `A final ${socA[23]}`);
  assert.ok(Math.abs(socB[23] - 60) < 1, `B final ${socB[23]}`);
  assert.ok(Math.abs(solved.nodes.tankA.inventoryKg - socA[23]) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tankB.inventoryKg - socB[23]) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 60) < 1);
  assert.ok(solved.balances.maxAbsResidual < 1e-6);
});

test('optional intake-pump between tanks transfers when powered', () => {
  const seawater = (() => {
    const kg = 1025;
    const saltKg = kg * 0.035;
    const waterKg = kg - saltKg;
    return {
      kind: 'material',
      phase: 'liquid',
      T_C: 25,
      P_bar: 1,
      mol: {
        H2O: waterKg * 1000 / 18.01528,
        'Na+': saltKg * 1000 / 22.989769 / 2,
        'Cl-': saltKg * 1000 / 35.45 / 2,
      },
    };
  })();
  const definition = {
    site: {
      resources: {
        seawater: { quality: 'assumed', stream: seawater, evidence: 'MECH15 pump' },
        electricity: {
          quality: 'assumed',
          stream: { kind: 'electricity', kWh: 10 },
          evidence: 'MECH15 power',
        },
      },
    },
    graph: {
      nodes: [
        {
          id: 'sea',
          unit: 'material-source',
          siteResource: 'seawater',
          params: { stream: seawater },
        },
        { id: 'tankA', unit: 'material-buffer', params: { capacityKg: 5000, initialKg: 0 } },
        {
          id: 'pump',
          unit: 'intake-pump',
          capacity: 1,
          params: { pumpKWhPerM3: 0.4, densityKgM3: 1025 },
        },
        {
          id: 'power',
          unit: 'electricity-source',
          siteResource: 'electricity',
          params: { stream: { kind: 'electricity', kWh: 10 } },
        },
        { id: 'bus', unit: 'electrical-bus' },
        { id: 'tankB', unit: 'material-buffer', params: { capacityKg: 5000, initialKg: 0 } },
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'sea', port: 'out' }, to: { node: 'tankA', port: 'in' } },
        { from: { node: 'tankA', port: 'out' }, to: { node: 'pump', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'pump', port: 'electricity' } },
        { from: { node: 'pump', port: 'out' }, to: { node: 'tankB', port: 'in' } },
        { from: { node: 'tankB', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { pump: 1 },
      priorities: { bus: ['pump'] },
    },
  };
  const solved = solveOperation(definition);
  assert.ok(Math.abs(solved.nodes.pump.activity - 1) < 1e-9);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 1025) < 1e-4);
  assert.ok(solved.balances.maxAbsResidual < 1e-6);
});
