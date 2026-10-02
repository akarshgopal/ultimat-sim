const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg, SUBSTANCES } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { createMethanolCase } = require('../cases/methanol');
const { createDacCase } = require('../cases/dac');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function airStream(kg) {
  // ~422 ppm CO2, dry O2/N2 balance — same shape as methanol airFromCo2Ppm screening.
  const co2Mol = 422.45;
  const balanceMol = 1e6 - co2Mol;
  const mol = {
    CO2: co2Mol,
    O2: balanceMol * 0.2115,
    N2: balanceMol * (1 - 0.2115),
  };
  const mass = Object.entries(mol).reduce(
    (sum, [id, amount]) => sum + amount * SUBSTANCES[id].molarMassG / 1000,
    0,
  );
  const factor = kg / mass;
  return {
    kind: 'material',
    phase: 'gas',
    T_C: 25,
    P_bar: 1,
    mol: Object.fromEntries(Object.entries(mol).map(([id, amount]) => [id, amount * factor])),
  };
}

function streamNm3(stream, nm3PerKmol = 22.414) {
  const totalMol = Object.values(stream.mol).reduce((sum, amount) => sum + amount, 0);
  return totalMol * nm3PerKmol / 1000;
}

function blowerCase({
  feedKg = 1225,
  blowerKWhPerNm3 = 0.001,
  powerKWh = 10,
  capacityNm3 = 10000,
  setpointNm3 = null,
  siteFeedKg = null,
} = {}) {
  const budget = siteFeedKg == null ? feedKg : siteFeedKg;
  const stream = airStream(feedKg);
  const siteStream = airStream(budget);
  return {
    site: {
      resources: {
        air: {
          quality: 'assumed',
          stream: siteStream,
          evidence: 'MECH10 test air',
        },
        electricity: {
          quality: 'assumed',
          stream: { kind: 'electricity', kWh: powerKWh },
          evidence: 'MECH10 test power',
        },
      },
    },
    graph: {
      nodes: [
        {
          id: 'air',
          unit: 'material-source',
          siteResource: 'air',
          sourcePreset: 'air',
          params: { stream },
        },
        {
          id: 'blower',
          unit: 'gas-blower',
          capacity: capacityNm3,
          params: { blowerKWhPerNm3 },
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
        { from: { node: 'air', port: 'out' }, to: { node: 'blower', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'blower', port: 'electricity' } },
        { from: { node: 'blower', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { blower: setpointNm3 == null ? capacityNm3 : setpointNm3 },
      priorities: { bus: ['blower'] },
    },
  };
}

test('stock methanol demo exposes gas blower on the air path', () => {
  const solved = solveOperation(clone(createMethanolCase(0)));
  assert.equal(solved.edgeLimits.length, 0);
  assert.ok(solved.nodes.dac.activity > 0);
  assert.ok(solved.nodes.methanol.activity > 0);
  assert.ok(solved.nodes['air-blower'].activity > 0);
  assert.ok(solved.nodes['air-blower'].blowerKWhPerUnit > 0);
  assert.ok(solved.nodes['seawater-pump'].activity > 0);
});

test('gas blower passes air when bus power covers blowerKWhPerNm3', () => {
  const feedKg = 1225;
  const stream = airStream(feedKg);
  const nm3 = streamNm3(stream);
  // Ask for full feed Nm³; give plenty of power.
  const solved = solveOperation(blowerCase({
    feedKg,
    capacityNm3: nm3,
    setpointNm3: nm3,
    powerKWh: 10,
    blowerKWhPerNm3: 0.001,
  }));
  assert.ok(Math.abs(solved.nodes.blower.activity - nm3) < 1e-6);
  assert.equal(solved.nodes.blower.limitedBy.length, 0);
  assert.ok(Math.abs(solved.nodes.blower.consumed.electricity.kWh - nm3 * 0.001) < 1e-9);
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - feedKg) < 1e-6);
  assert.equal(solved.nodes.blower.blowerBasis, 'nm3');
});

test('gas blower starves the line when electricity is short', () => {
  const feedKg = 1225;
  const stream = airStream(feedKg);
  const nm3 = streamNm3(stream);
  // Want full nm3 @ 0.001 → need nm3*0.001 kWh; give 25% of that.
  const need = nm3 * 0.001;
  const solved = solveOperation(blowerCase({
    feedKg,
    capacityNm3: nm3,
    setpointNm3: nm3,
    powerKWh: need * 0.25,
    blowerKWhPerNm3: 0.001,
  }));
  assert.ok(Math.abs(solved.nodes.blower.activity - nm3 * 0.25) < 1e-6);
  assert.ok(solved.nodes.blower.limitedBy.includes('electricity'));
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - feedKg * 0.25) < 1e-6);
  assert.match(solved.nodes.blower.causeText || '', /short on electricity|electricity/i);
});

test('zero power shuts the blower and cause names electricity', () => {
  const feedKg = 1225;
  const nm3 = streamNm3(airStream(feedKg));
  const solved = solveOperation(blowerCase({
    feedKg,
    capacityNm3: nm3,
    setpointNm3: nm3,
    powerKWh: 0,
    blowerKWhPerNm3: 0.001,
  }));
  assert.equal(solved.nodes.blower.activity, 0);
  assert.ok(solved.nodes.blower.limitedBy.includes('electricity'));
  assert.equal(streamMassKg(solved.nodes.sink.received || { kind: 'material', mol: { N2: 0 }, phase: 'gas', T_C: 25, P_bar: 1 }), 0);
});

test('blowerKWhPerKg basis uses mass instead of Nm³', () => {
  // 100 kg × 0.01 kWh/kg = 1 kWh wanted; 0.5 kWh → half.
  const definition = blowerCase({
    feedKg: 100,
    capacityNm3: 1e6,
    setpointNm3: 1e6,
    powerKWh: 0.5,
  });
  definition.graph.nodes.find(node => node.id === 'blower').params = {
    blowerKWhPerKg: 0.01,
  };
  definition.graph.nodes.find(node => node.id === 'blower').capacity = 1000;
  definition.operation.setpoints.blower = 1000;
  const solved = solveOperation(definition);
  assert.ok(Math.abs(solved.nodes.blower.activity - 50) < 1e-9);
  assert.ok(solved.nodes.blower.limitedBy.includes('electricity'));
  assert.equal(solved.nodes.blower.blowerBasis, 'kg');
  assert.ok(Math.abs(streamMassKg(solved.nodes.sink.received) - 50) < 1e-6);
});

test('DAC air path starves when gas blower loses bus power', () => {
  const base = clone(createDacCase({
    requestedActivity: 10,
    capacity: 100,
    electricityKWh: 1000,
    heatKWh: 1000,
  }));
  // Orphan DAC case has no bus — add bus + blower between air and dac.
  const free = solveOperation(clone(base));
  const freeCo2 = streamMassKg(free.nodes['captured-co2'].received);
  assert.ok(freeCo2 > 0);

  const nodes = base.graph.nodes;
  // Replace direct electricity → dac with bus fan-out.
  nodes.push({ id: 'bus', unit: 'electrical-bus' });
  nodes.push({
    id: 'air-blower',
    unit: 'gas-blower',
    capacity: 1e9,
    params: { blowerKWhPerNm3: 0.001 },
  });
  const airEdge = base.graph.edges.find(edge => edge.from.node === 'air' && edge.to.node === 'dac');
  assert.ok(airEdge);
  airEdge.to = { node: 'air-blower', port: 'in' };
  const elecEdge = base.graph.edges.find(edge => edge.from.node === 'electricity' && edge.to.node === 'dac');
  assert.ok(elecEdge);
  elecEdge.to = { node: 'bus', port: 'in' };
  base.graph.edges.push(
    { from: { node: 'air-blower', port: 'out' }, to: { node: 'dac', port: 'air' } },
    { from: { node: 'bus', port: 'out' }, to: { node: 'air-blower', port: 'electricity' } },
    { from: { node: 'bus', port: 'out' }, to: { node: 'dac', port: 'electricity' } },
  );
  base.operation.setpoints['air-blower'] = 1e9;
  base.operation.priorities = { bus: ['air-blower', 'dac'] };

  const powered = solveOperation(clone(base));
  assert.ok(powered.nodes['air-blower'].activity > 0);
  assert.ok(streamMassKg(powered.nodes['captured-co2'].received) > freeCo2 * 0.5);

  const starved = clone(base);
  const cable = starved.graph.edges.find(edge => (
    edge.from.node === 'bus' && edge.to.node === 'air-blower'
  ));
  cable.capacity = 0;
  const solved = solveOperation(starved);
  assert.equal(solved.nodes['air-blower'].activity, 0);
  assert.ok(solved.nodes['air-blower'].limitedBy.includes('electricity'));
  assert.ok(solved.nodes.dac.activity < 1e-6 || streamMassKg(solved.nodes['captured-co2'].received) < freeCo2 * 0.01);
  assert.ok(
    /air-blower|electricity|short on air|logistics/i.test(solved.nodes.dac.causeText || '')
    || /electricity|logistics/i.test(solved.nodes['air-blower'].causeText || ''),
    `dac=${solved.nodes.dac.causeText} blower=${solved.nodes['air-blower'].causeText}`,
  );
});

test('gas blower rejects liquid feeds', () => {
  const { UNITS } = require('../engine/units');
  assert.throws(
    () => UNITS['gas-blower'].evaluate({
      inlets: {
        in: { kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1, mol: { H2O: 55.5 } },
        electricity: { kind: 'electricity', kWh: 10 },
      },
      requestedActivity: 1,
      capacity: 1,
      params: {},
    }),
    /intake pump|liquid|gas/i,
  );
});
