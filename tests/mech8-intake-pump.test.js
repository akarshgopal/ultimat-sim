const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { siteZabuyeAbundance } = require('../cases/network');
const { createCoastalCase } = require('../cases/coastal');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function waterStream(kg) {
  const mol = kg * 1000 / 18.01528;
  return { kind: 'material', mol: { H2O: mol }, phase: 'liquid', T_C: 25, P_bar: 1 };
}

function seawaterStream(kg) {
  // Screening S≈35: mostly water + Na/Cl so intakeKind stays liquid seawater-ish.
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
}

function pumpCase({
  feedKg = 1025,
  densityKgM3 = 1025,
  pumpKWhPerM3 = 0.4,
  powerKWh = 10,
  capacityM3 = 10,
  setpointM3 = null,
  siteFeedKg = null,
} = {}) {
  const budget = siteFeedKg == null ? feedKg : siteFeedKg;
  const stream = seawaterStream(feedKg);
  const siteStream = seawaterStream(budget);
  const definition = {
    site: {
      resources: {
        seawater: {
          quality: 'assumed',
          stream: siteStream,
          evidence: 'MECH8 test seawater',
        },
        electricity: {
          quality: 'assumed',
          stream: { kind: 'electricity', kWh: powerKWh },
          evidence: 'MECH8 test power',
        },
      },
    },
    graph: {
      nodes: [
        {
          id: 'sea',
          unit: 'material-source',
          siteResource: 'seawater',
          sourcePreset: 'seawater',
          params: { stream },
        },
        {
          id: 'pump',
          unit: 'intake-pump',
          capacity: capacityM3,
          params: { pumpKWhPerM3, densityKgM3 },
        },
        {
          id: 'power',
          unit: 'electricity-source',
          siteResource: 'electricity',
          params: { stream: { kind: 'electricity', kWh: powerKWh } },
        },
        { id: 'bus', unit: 'electrical-bus' },
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'sea', port: 'out' }, to: { node: 'pump', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'pump', port: 'electricity' } },
        { from: { node: 'pump', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { pump: setpointM3 == null ? capacityM3 : setpointM3 },
      priorities: { bus: ['pump'] },
    },
  };
  return definition;
}

test('stock Zabuye and coastal demos expose intake pumps on the floor', () => {
  const zabuye = solveOperation(clone(siteZabuyeAbundance()));
  assert.equal(zabuye.edgeLimits.length, 0);
  assert.ok(zabuye.nodes.minerals.activity > 0);
  assert.ok(zabuye.nodes['brine-pump'].activity > 0);
  assert.ok(zabuye.nodes['brine-pump'].pumpKWhPerUnit > 0);

  const coastal = solveOperation(clone(createCoastalCase()));
  assert.equal(coastal.edgeLimits.length, 0);
  assert.ok(coastal.nodes.swro.activity > 0);
  assert.ok(coastal.nodes['seawater-pump'].activity > 0);
  assert.ok(coastal.nodes['seawater-pump'].pumpKWhPerUnit > 0);
});

test('intake pump passes liquid when bus power covers pumpKWhPerM3', () => {
  // 1 m³ at 1025 kg/m³ needs 0.4 kWh; give 10 kWh and ask for 1 m³.
  const solved = solveOperation(pumpCase({
    feedKg: 1025,
    capacityM3: 1,
    setpointM3: 1,
    powerKWh: 10,
    pumpKWhPerM3: 0.4,
  }));
  assert.ok(Math.abs(solved.nodes.pump.activity - 1) < 1e-9);
  assert.equal(solved.nodes.pump.limitedBy.length, 0);
  assert.ok(Math.abs(solved.nodes.pump.consumed.electricity.kWh - 0.4) < 1e-9);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 1025) < 1e-6);
});

test('intake pump starves the line when electricity is short', () => {
  // Want 1 m³ → 0.4 kWh; only 0.1 kWh available → 0.25 m³.
  const solved = solveOperation(pumpCase({
    feedKg: 1025,
    capacityM3: 1,
    setpointM3: 1,
    powerKWh: 0.1,
    pumpKWhPerM3: 0.4,
  }));
  assert.ok(Math.abs(solved.nodes.pump.activity - 0.25) < 1e-9);
  assert.ok(solved.nodes.pump.limitedBy.includes('electricity'));
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 1025 * 0.25) < 1e-6);
  assert.match(solved.nodes.pump.causeText || '', /short on electricity|electricity/i);
});

test('zero power shuts the pump and cause names electricity', () => {
  const solved = solveOperation(pumpCase({
    feedKg: 1025,
    capacityM3: 1,
    setpointM3: 1,
    powerKWh: 0,
    pumpKWhPerM3: 0.4,
  }));
  assert.equal(solved.nodes.pump.activity, 0);
  assert.ok(solved.nodes.pump.limitedBy.includes('electricity'));
  assert.equal(streamMassKg(solved.nodes.sink.received || { kind: 'material', mol: {}, phase: 'liquid', T_C: 25, P_bar: 1 }), 0);
});

test('pumpKWhPerKg basis uses mass instead of volume', () => {
  // 100 kg × 0.05 kWh/kg = 5 kWh wanted; 2.5 kWh → half.
  const solved = solveOperation(pumpCase({
    feedKg: 100,
    densityKgM3: 1000,
    capacityM3: 1000,
    setpointM3: 1000,
    powerKWh: 2.5,
    pumpKWhPerM3: 0.4,
  }));
  // Override to kg basis after clone pattern — rebuild with params.
  const definition = pumpCase({
    feedKg: 100,
    densityKgM3: 1000,
    capacityM3: 1000,
    setpointM3: 1000,
    powerKWh: 2.5,
  });
  definition.graph.nodes.find(node => node.id === 'pump').params = {
    pumpKWhPerKg: 0.05,
    densityKgM3: 1000,
  };
  // Capacity/setpoint are m³; with kg basis feedAmount=100 kg, activity is kg.
  // Give capacity large in the same unit as activity (kg when pumpKWhPerKg set).
  definition.graph.nodes.find(node => node.id === 'pump').capacity = 1000;
  definition.operation.setpoints.pump = 1000;
  const kgSolved = solveOperation(definition);
  assert.ok(Math.abs(kgSolved.nodes.pump.activity - 50) < 1e-9);
  assert.ok(kgSolved.nodes.pump.limitedBy.includes('electricity'));
  assert.equal(kgSolved.nodes.pump.pumpBasis, 'kg');
  assert.ok(Math.abs(streamMassKg(kgSolved.nodes.sink.received) - 50) < 1e-6);
});

test('Zabuye brine path starves minerals when intake pump loses bus power', () => {
  // MECH11: brine-pump is stock-wired on Zabuye; starve its bus cable.
  const base = clone(siteZabuyeAbundance());
  const free = solveOperation(clone(base));
  const freeLi = streamMassKg(free.nodes.lithium.received);
  assert.ok(free.nodes['brine-pump'].activity > 0);
  assert.ok(freeLi > 0);

  const starved = clone(base);
  const cable = starved.graph.edges.find(edge => (
    edge.from.node === 'power-bus' && edge.to.node === 'brine-pump'
  ));
  assert.ok(cable);
  cable.capacity = 0;
  const solved = solveOperation(starved);
  assert.equal(solved.nodes['brine-pump'].activity, 0);
  assert.ok(solved.nodes['brine-pump'].limitedBy.includes('electricity'));
  assert.ok(solved.nodes.minerals.activity < 1e-6 || streamMassKg(solved.nodes.lithium.received) < freeLi * 0.01);
  assert.ok(
    /brine-pump|electricity|short on brine|logistics/i.test(solved.nodes.minerals.causeText || '')
    || /electricity|logistics/i.test(solved.nodes['brine-pump'].causeText || ''),
    `minerals=${solved.nodes.minerals.causeText} pump=${solved.nodes['brine-pump'].causeText}`,
  );
});
