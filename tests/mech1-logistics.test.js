const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation, solveHorizon } = require('../engine/solve');
const { siteZabuyeAbundance } = require('../cases/network');
const { createCoastalCase } = require('../cases/coastal');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fingerprint(solved) {
  return {
    activities: Object.fromEntries(
      Object.entries(solved.nodes)
        .filter(([, result]) => result.activity != null)
        .map(([id, result]) => [id, result.activity])
    ),
    residuals: solved.balances.maxAbsResidual,
    edgeLimits: solved.edgeLimits || [],
    limitedBy: Object.fromEntries(
      Object.entries(solved.nodes)
        .filter(([, result]) => result.limitedBy?.length)
        .map(([id, result]) => [id, [...result.limitedBy].sort()])
    ),
  };
}

test('unconstrained Zabuye and coastal demos stay bit-identical with empty edgeLimits', () => {
  const zabuyeA = solveOperation(clone(siteZabuyeAbundance()));
  const zabuyeB = solveOperation(clone(siteZabuyeAbundance()));
  assert.deepEqual(fingerprint(zabuyeA), fingerprint(zabuyeB));
  assert.equal(zabuyeA.edgeLimits.length, 0);
  assert.equal(zabuyeA.nodes.minerals.activity, 99999.99999999999);
  assert.ok(streamMassKg(zabuyeA.nodes.lithium.received) > 400);

  const coastalA = solveOperation(clone(createCoastalCase()));
  const coastalB = solveOperation(clone(createCoastalCase()));
  assert.deepEqual(fingerprint(coastalA), fingerprint(coastalB));
  assert.equal(coastalA.edgeLimits.length, 0);
});

test('brine→minerals edge capacity clamps minerals activity and product mass', () => {
  const freeCase = siteZabuyeAbundance();
  const free = solveOperation(clone(freeCase));
  const freeLi = streamMassKg(free.nodes.lithium.received);

  const limited = clone(freeCase);
  const brineEdge = limited.graph.edges.find(edge => edge.from.node === 'brine' && edge.to.node === 'minerals');
  assert.ok(brineEdge);
  brineEdge.capacity = free.nodes.minerals.activity * 0.4;

  const solved = solveOperation(limited);
  assert.ok(Math.abs(solved.nodes.minerals.activity - free.nodes.minerals.activity * 0.4) < 1e-6);
  assert.ok(solved.nodes.minerals.limitedBy.includes('logistics'));
  assert.ok(solved.nodes.minerals.limitedBy.includes('brine'));
  assert.equal(solved.edgeLimits.length, 1);
  assert.equal(solved.edgeLimits[0].from.node, 'brine');
  assert.equal(solved.edgeLimits[0].to.node, 'minerals');
  assert.ok(Math.abs(streamMassKg(solved.nodes.lithium.received) - freeLi * 0.4) < 1e-6);
  assert.ok(solved.warnings.some(message => /brine→minerals limited by logistics capacity/.test(message)));

  delete brineEdge.capacity;
  const recovered = solveOperation(limited);
  assert.equal(recovered.nodes.minerals.activity, free.nodes.minerals.activity);
  assert.equal(recovered.edgeLimits.length, 0);
});

test('electrical bus cable capacity clamps consumer and tags logistics', () => {
  const freeCase = siteZabuyeAbundance();
  const free = solveOperation(clone(freeCase));
  const limited = clone(freeCase);
  const cable = limited.graph.edges.find(edge => edge.from.node === 'power-bus' && edge.to.node === 'minerals');
  assert.ok(cable);
  cable.capacity = 1000; // free minerals draw 5000 kWh/day

  const solved = solveOperation(limited);
  assert.equal(solved.nodes.minerals.activity, 20000);
  assert.ok(solved.nodes.minerals.limitedBy.includes('electricity'));
  assert.ok(solved.nodes.minerals.limitedBy.includes('logistics'));
  assert.equal(solved.edgeLimits.length, 1);
  assert.equal(solved.edgeLimits[0].capacity, 1000);
  assert.equal(solved.edgeLimits[0].delivered, 1000);
  assert.ok(solved.edgeLimits[0].requested > 1000);
  assert.ok(solved.nodes.minerals.activity < free.nodes.minerals.activity);
});

test('horizon hourly solves honor per-step edge capacity clamps', () => {
  const coastal = createCoastalCase();
  const free = solveHorizon(clone(coastal));
  assert.equal(free.horizon?.hours?.length, 24);

  const limited = clone(coastal);
  // Undersize seawater → SWRO feed line relative to free daily throughput.
  const feedEdge = limited.graph.edges.find(edge => edge.to.node === 'swro' && edge.to.port === 'feed');
  assert.ok(feedEdge);
  const freeFeed = free.streams.find(stream => stream.to.node === 'swro' && stream.to.port === 'feed');
  const freeMass = streamMassKg(freeFeed.stream);
  // Per-step (hourly) cap well below free hourly share so some hours bind.
  feedEdge.capacity = freeMass / 24 * 0.25;
  const solved = solveHorizon(limited);
  assert.ok(solved.horizon?.hours?.length === 24);
  assert.ok((solved.edgeLimits || []).length >= 1, 'expected at least one logistics clamp across the day');
  assert.ok(solved.nodes.swro.activity < free.nodes.swro.activity - 1e-6);
  const hoursLimited = solved.horizon.hours.filter(hour => hour.limited.includes('swro')).length;
  assert.ok(hoursLimited >= 1, 'swro should show limited in at least one hour');
});

test('splitter fan-out respects per-edge capacity independently', () => {
  const feed = {
    kind: 'material',
    mol: { H2O: 1000 },
    phase: 'liquid',
    T_C: 25,
    P_bar: 1,
  };
  const caseDefinition = {
    graph: {
      nodes: [
        { id: 'src', unit: 'material-source', params: { stream: feed } },
        { id: 'split', unit: 'material-splitter' },
        { id: 'a', unit: 'material-sink' },
        { id: 'b', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'src', port: 'out' }, to: { node: 'split', port: 'in' } },
        { from: { node: 'split', port: 'out' }, to: { node: 'a', port: 'in' }, weight: 1, capacity: 2 },
        { from: { node: 'split', port: 'out' }, to: { node: 'b', port: 'in' }, weight: 1 },
      ],
    },
    operation: { setpoints: {} },
  };
  // Check splitter unit exists
  const solved = solveOperation(caseDefinition);
  const massA = streamMassKg(solved.nodes.a.received);
  const massB = streamMassKg(solved.nodes.b.received);
  assert.ok(massA <= 2 + 1e-9);
  assert.ok(massB > massA);
  assert.ok(solved.edgeLimits.some(limit => limit.to.node === 'a'));
});

test('blank / null / Infinity edge capacity means unlimited', () => {
  const base = siteZabuyeAbundance();
  const free = solveOperation(clone(base));
  for (const capacity of [null, undefined, '', Infinity]) {
    const next = clone(base);
    next.graph.edges.find(edge => edge.from.node === 'brine').capacity = capacity;
    const solved = solveOperation(next);
    assert.equal(solved.nodes.minerals.activity, free.nodes.minerals.activity);
    assert.equal(solved.edgeLimits.length, 0);
  }
});
