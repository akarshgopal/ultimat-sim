const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation, solveHorizon } = require('../engine/solve');
const { siteZabuyeAbundance } = require('../cases/network');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function waterStream(kg) {
  // 1 kg ≈ 55.508 mol H2O
  const mol = kg * 1000 / 18.01528;
  return { kind: 'material', mol: { H2O: mol }, phase: 'liquid', T_C: 25, P_bar: 1 };
}

function bufferCase({
  feedKg = 100,
  capacityKg = 1000,
  initialKg = 0,
  dischargeKg = null,
  siteFeedKg = null,
} = {}) {
  const feedBudget = siteFeedKg == null ? feedKg : siteFeedKg;
  const definition = {
    site: {
      resources: {
        water: {
          quality: 'assumed',
          stream: waterStream(feedBudget),
          evidence: 'MECH3 test feed',
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
        {
          id: 'tank',
          unit: 'material-buffer',
          params: { capacityKg, initialKg },
        },
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'tank', port: 'in' } },
        { from: { node: 'tank', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: {} },
  };
  if (dischargeKg != null) definition.operation.setpoints.tank = dischargeKg;
  return definition;
}

function horizonSite(dailyFeedKg) {
  // Flat non-zero PV so solveHorizon does not fall back; power unused in this graph.
  const profile = Array(24).fill(0.1);
  return {
    solarKWp: 0,
    month: 0,
    solar: { annualTypical: profile, typicalDayKWhPerKWp: profile },
    resources: {
      water: {
        quality: 'assumed',
        stream: waterStream(dailyFeedKg),
        evidence: 'MECH3 horizon feed',
      },
      electricity: {
        quality: 'assumed',
        stream: { kind: 'electricity', kWh: 0 },
      },
    },
    storage: { batteryKWh: 0, powerKW: 0, efficiency: 0.9, initialKWh: 0 },
  };
}

test('unconstrained Zabuye stays bit-identical without buffers', () => {
  const a = solveOperation(clone(siteZabuyeAbundance()));
  const b = solveOperation(clone(siteZabuyeAbundance()));
  assert.equal(a.nodes.minerals.activity, b.nodes.minerals.activity);
  assert.ok(a.balances.maxAbsResidual < 1e-8);
  assert.equal(a.nodes.tank, undefined);
});

test('empty buffer with no setpoint is a pass-through', () => {
  const solved = solveOperation(bufferCase({ feedKg: 80, capacityKg: 500 }));
  assert.ok(Math.abs(solved.nodes.tank.activity - 80) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tank.inventoryKg) < 1e-9);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 80) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('throttled discharge charges inventory and balances close', () => {
  const solved = solveOperation(bufferCase({
    feedKg: 100,
    capacityKg: 1000,
    initialKg: 0,
    dischargeKg: 40,
  }));
  assert.ok(Math.abs(solved.nodes.tank.activity - 40) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tank.inventoryKg - 60) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tank.fill - 0.06) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 40) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-6, JSON.stringify(solved.balances));
});

test('full tank backpressures upstream feed', () => {
  const solved = solveOperation(bufferCase({
    feedKg: 100,
    capacityKg: 50,
    initialKg: 50,
    dischargeKg: 0,
  }));
  assert.ok(solved.nodes.tank.limitedBy.includes('capacity'));
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied)) < 1e-6);
  assert.ok(Math.abs(solved.nodes.tank.inventoryKg - 50) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received)) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-6, JSON.stringify(solved.balances));
});

test('empty tank starves discharge setpoint', () => {
  const solved = solveOperation(bufferCase({
    feedKg: 0,
    capacityKg: 100,
    initialKg: 0,
    dischargeKg: 25,
    siteFeedKg: 0,
  }));
  assert.ok(solved.nodes.tank.limitedBy.includes('inventory'));
  assert.ok(Math.abs(solved.nodes.tank.activity) < 1e-9);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received)) < 1e-9);
});

test('horizon carries buffer SOC: fill early, drain later', () => {
  // 240 kg/day site budget ≈ 10 kg offered each hour before depletion accounting.
  // Feed node requests 10 kg/h equivalent via daily stream of 240 scaled per hour by remaining.
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
        {
          id: 'tank',
          unit: 'material-buffer',
          params: { capacityKg: 500, initialKg: 0 },
        },
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'tank', port: 'in' } },
        { from: { node: 'tank', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    // Discharge only 120 kg across the day → half the feed banks in the tank.
    operation: { setpoints: { tank: 120 } },
  };

  const solved = solveHorizon(definition);
  assert.ok(solved.horizon?.hours?.length === 24);
  const socSeries = solved.horizon.hours.map(entry => entry.buffers?.tank?.soc ?? 0);
  const peak = Math.max(...socSeries);
  const finalSoc = socSeries[23];
  assert.ok(peak > 50, `expected banked inventory, peak=${peak}`);
  // Net: 240 in − 120 out ≈ 120 left in tank at end of day.
  assert.ok(Math.abs(finalSoc - 120) < 1, `final SOC ${finalSoc}`);
  assert.ok(Math.abs(solved.nodes.tank.activity - 120) < 1, `discharged ${solved.nodes.tank.activity}`);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 120) < 1);
  assert.ok(solved.nodes.tank.inventoryKg != null);
  assert.ok(Math.abs(solved.nodes.tank.inventoryKg - finalSoc) < 1e-6);
});

test('horizon drain from initial inventory when feed is gone', () => {
  const definition = {
    site: horizonSite(0),
    graph: {
      nodes: [
        {
          id: 'feed',
          unit: 'material-source',
          siteResource: 'water',
          params: { stream: waterStream(0) },
        },
        {
          id: 'tank',
          unit: 'material-buffer',
          params: {
            capacityKg: 200,
            initialKg: 120,
            storedStream: waterStream(120),
          },
        },
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'tank', port: 'in' } },
        { from: { node: 'tank', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    // Ask for more than the tank holds so later hours hit inventory starvation.
    operation: { setpoints: { tank: 200 } },
  };

  const solved = solveHorizon(definition);
  const socSeries = solved.horizon.hours.map(entry => entry.buffers.tank.soc);
  assert.ok(socSeries[0] < 120);
  assert.ok(socSeries[23] < 1e-6, `expected empty, got ${socSeries[23]}`);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 120) < 1);
  const limitedHours = solved.horizon.hours.filter(entry => entry.limited.includes('tank')).length;
  assert.ok(limitedHours >= 1, 'expected some hours limited by empty inventory');
  assert.ok(
    (solved.nodes.tank.limitedBy || []).includes('inventory'),
    `expected inventory limit, got ${solved.nodes.tank.limitedBy}`
  );
});
