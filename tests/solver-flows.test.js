// Operating-solver flow semantics: logistics edge clamps, splitter split /
// overflow / priority, buffers (state of charge, backpressure, starvation,
// buffer→buffer), sink caps and demand accept, energy export caps, and the
// starvation cause chains that explain each limit.
const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation, solveHorizon, attachCauseChains } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const { siteZabuyeAbundance } = require('../cases/network');
const { createCoastalCase } = require('../cases/coastal');
const { createSabatierCase } = require('../cases/sabatier');
const { createDacCase } = require('../cases/dac');

const clone = value => JSON.parse(JSON.stringify(value));
const codes = result => (result.causeChain || []).map(step => step.code);
const kg = stream => (stream ? streamMassKg(stream) : 0);

function near(actual, expected, tol = 1e-6, label = '') {
  assert.ok(Math.abs(actual - expected) < tol, `${label} expected ${expected}, got ${actual}`);
}

// Table-driven rows run in one test; a failure names its row.
function eachRow(rows, fn) {
  for (const row of rows) {
    try {
      fn(row);
    } catch (error) {
      error.message = `[${row.name}] ${error.message}`;
      throw error;
    }
  }
}

function closed(solved, tol = 1e-8) {
  assert.ok(solved.balances.maxAbsResidual < tol, JSON.stringify(solved.balances));
}

function waterStream(massKg) {
  return { kind: 'material', mol: { H2O: massKg * 1000 / 18.01528 }, phase: 'liquid', T_C: 25, P_bar: 1 };
}

function source(id, massKg) {
  return { id, unit: 'material-source', siteResource: 'water', params: { stream: waterStream(massKg) } };
}

function siteWater(massKg, extra = {}) {
  return {
    resources: {
      water: { quality: 'assumed', stream: waterStream(massKg), evidence: 'test feed' },
      ...extra,
    },
  };
}

const POWER_RESOURCE = kWh => ({
  electricity: { quality: 'assumed', stream: { kind: 'electricity', kWh }, evidence: 'test power' },
});

function electrolyzerNodes({ capacity = 40 } = {}) {
  return [
    { id: 'power', unit: 'electricity-source', siteResource: 'electricity', params: { stream: { kind: 'electricity', kWh: 20000 } } },
    { id: 'ely', unit: 'electrolyzer', label: 'Electrolyzer', capacity, params: { electricityKWhPerKg: 50, waterRejectFraction: 0 } },
    { id: 'o2', unit: 'material-sink' },
    { id: 'reject', unit: 'material-sink' },
  ];
}

function electrolyzerEdges(waterFrom, h2To) {
  return [
    { from: waterFrom, to: { node: 'ely', port: 'water' } },
    { from: { node: 'power', port: 'out' }, to: { node: 'ely', port: 'electricity' } },
    { from: { node: 'ely', port: 'hydrogen' }, to: h2To },
    { from: { node: 'ely', port: 'oxygen' }, to: { node: 'o2', port: 'in' } },
    { from: { node: 'ely', port: 'waterReject' }, to: { node: 'reject', port: 'in' } },
  ];
}

// ---------------------------------------------------------------------------
// Stock demos with no constraints set

test('stock demos solve deterministically with no limits, export caps or cause chains', () => {
  for (const factory of [siteZabuyeAbundance, () => createCoastalCase(), createSabatierCase, createDacCase]) {
    const a = solveOperation(clone(factory()));
    const b = solveOperation(clone(factory()));
    assert.equal(JSON.stringify(a.nodes), JSON.stringify(b.nodes));
    closed(a);
    assert.equal(a.edgeLimits.length, 0);
    for (const result of Object.values(a.nodes)) {
      assert.ok(!(result.limitedBy || []).includes('export'));
      assert.equal(result.causeChain, undefined);
      assert.equal(result.causeText, undefined);
    }
  }
  // Regional demand backs the lithium sink, but the cap sits above free receipt.
  const zabuye = solveOperation(siteZabuyeAbundance());
  assert.equal(zabuye.nodes.lithium.acceptSource, 'demand');
  assert.ok(zabuye.nodes.lithium.acceptKg > kg(zabuye.nodes.lithium.received));
});

// ---------------------------------------------------------------------------
// Logistics edge capacities

test('material edge capacity clamps a converter, names the edge, and lifts when removed', () => {
  const base = siteZabuyeAbundance();
  const free = solveOperation(clone(base));
  const freeLi = kg(free.nodes.lithium.received);

  const limited = clone(base);
  const edge = limited.graph.edges.find(item => item.from.node === 'brine-pump' && item.to.node === 'minerals');
  edge.capacity = free.nodes.minerals.activity * 0.4;
  const solved = solveOperation(limited);
  const minerals = solved.nodes.minerals;
  near(minerals.activity, free.nodes.minerals.activity * 0.4);
  near(kg(solved.nodes.lithium.received), freeLi * 0.4);
  assert.ok(minerals.limitedBy.includes('logistics'));
  assert.ok(minerals.limitedBy.includes('brine'));
  assert.equal(solved.edgeLimits.length, 1);
  assert.deepEqual([solved.edgeLimits[0].from.node, solved.edgeLimits[0].to.node], ['brine-pump', 'minerals']);
  assert.ok(solved.warnings.some(message => /brine-pump→minerals limited by logistics capacity/.test(message)));
  assert.deepEqual(codes(minerals), ['logistics']);
  assert.deepEqual([minerals.causeChain[0].edge.from.node, minerals.causeChain[0].edge.to.node], ['brine-pump', 'minerals']);
  assert.ok(minerals.causeText.includes('brine-pump→minerals logistics'));

  delete edge.capacity;
  const recovered = solveOperation(limited);
  assert.equal(recovered.nodes.minerals.activity, free.nodes.minerals.activity);
  assert.equal(recovered.edgeLimits.length, 0);
});

test('electrical cable capacity clamps the consumer and tags logistics', () => {
  const free = solveOperation(siteZabuyeAbundance());
  const limited = siteZabuyeAbundance();
  limited.graph.edges.find(edge => edge.from.node === 'power-bus' && edge.to.node === 'minerals').capacity = 1000;
  const solved = solveOperation(limited);
  const minerals = solved.nodes.minerals;
  assert.ok(minerals.activity < free.nodes.minerals.activity);
  assert.ok(minerals.limitedBy.includes('electricity'));
  assert.ok(minerals.limitedBy.includes('logistics'));
  assert.equal(solved.edgeLimits.length, 1);
  assert.equal(solved.edgeLimits[0].capacity, 1000);
  assert.equal(solved.edgeLimits[0].delivered, 1000);
  assert.ok(solved.edgeLimits[0].requested > 1000);
  assert.deepEqual(codes(minerals), ['logistics']);
  assert.ok(minerals.causeText.includes('power-bus→minerals logistics'));
});

test('blank / null / Infinity edge capacity means unlimited', () => {
  const base = siteZabuyeAbundance();
  const free = solveOperation(clone(base));
  for (const capacity of [null, undefined, '', Infinity]) {
    const next = clone(base);
    next.graph.edges.find(edge => edge.from.node === 'brine').capacity = capacity;
    const solved = solveOperation(next);
    assert.equal(solved.nodes.minerals.activity, free.nodes.minerals.activity, String(capacity));
    assert.equal(solved.edgeLimits.length, 0);
  }
});

test('horizon hourly solves honour per-step edge capacity clamps', () => {
  const coastal = createCoastalCase();
  const free = solveHorizon(clone(coastal));
  assert.equal(free.horizon.hours.length, 24);
  const limited = clone(coastal);
  const feedEdge = limited.graph.edges.find(edge => edge.to.node === 'swro' && edge.to.port === 'feed');
  const freeFeed = free.streams.find(item => item.to.node === 'swro' && item.to.port === 'feed');
  feedEdge.capacity = kg(freeFeed.stream) / 24 * 0.25;
  const solved = solveHorizon(limited);
  assert.equal(solved.horizon.hours.length, 24);
  assert.ok(solved.edgeLimits.length >= 1);
  assert.ok(solved.nodes.swro.activity < free.nodes.swro.activity - 1e-6);
  assert.ok(solved.horizon.hours.some(hour => hour.limited.includes('swro')));
});

// ---------------------------------------------------------------------------
// Splitters: equal / weighted split, overflow, priority tiers

function splitCase({ feedKg = 100, branches = ['a', 'b'], accepts = {}, capacities = {}, weights = {}, priorities = {} } = {}) {
  const nodes = [source('feed', feedKg), { id: 'split', unit: 'material-splitter', label: 'Split' }];
  const edges = [{ from: { node: 'feed', port: 'out' }, to: { node: 'split', port: 'in' } }];
  for (const id of branches) {
    nodes.push({ id, unit: 'material-sink', label: `Branch ${id}`, ...(accepts[id] != null ? { params: { acceptKg: accepts[id] } } : {}) });
    edges.push({
      from: { node: 'split', port: 'out' },
      to: { node: id, port: 'in' },
      weight: weights[id] ?? 1,
      ...(priorities[id] != null ? { priority: priorities[id] } : {}),
      ...(capacities[id] != null ? { capacity: capacities[id] } : {}),
    });
  }
  return { site: siteWater(feedKg), graph: { nodes, edges }, operation: { setpoints: {} } };
}

const SPLIT_CASES = [
  { name: 'equal split', opts: {}, expect: { a: 50, b: 50 }, feed: 100, splitFree: true },
  { name: 'capped sink overflows onto free sibling', opts: { accepts: { a: 10 } }, expect: { a: 10, b: 90 }, feed: 100, splitFree: true, exportOn: ['a'] },
  { name: 'logistics cap overflows onto free sibling', opts: { capacities: { a: 15 } }, expect: { a: 15, b: 85 }, feed: 100, splitFree: true, edgeLimitTo: 'a' },
  { name: 'both branches capped backpressures inlet', opts: { accepts: { a: 10, b: 20 } }, expect: { a: 10, b: 20 }, feed: 30, splitCodes: ['branch-blocked', 'export-capped'] },
  { name: 'free leg pipe cap limits overflow absorb', opts: { accepts: { a: 10 }, capacities: { b: 60 } }, expect: { a: 10, b: 60 }, feed: 70, splitBlocked: true },
  { name: 'three-way rebalances onto two free legs', opts: { feedKg: 90, branches: ['a', 'b', 'c'], accepts: { a: 10 } }, expect: { a: 10, b: 40, c: 40 }, feed: 90, splitFree: true },
  { name: 'weighted overflow prefers heavier branch', opts: { branches: ['a', 'b', 'c'], accepts: { a: 10 }, weights: { c: 3 } }, expect: { a: 10, b: 22.5, c: 67.5 }, feed: 100 },
  { name: 'high priority free leg takes all', opts: { priorities: { a: 1, b: 0 } }, expect: { a: 100, b: 0 }, feed: 100, splitFree: true },
  { name: 'high priority capped overflows to lower tier', opts: { accepts: { a: 30 }, priorities: { a: 1, b: 0 } }, expect: { a: 30, b: 70 }, feed: 100, splitFree: true, exportOn: ['a'] },
  { name: 'logistics cap on high priority spills to low', opts: { capacities: { a: 25 }, priorities: { a: 1, b: 0 } }, expect: { a: 25, b: 75 }, feed: 100 },
  { name: 'same tier weight-splits before lower tier', opts: { branches: ['a', 'b', 'c'], accepts: { a: 10 }, priorities: { a: 1, b: 1, c: 0 } }, expect: { a: 10, b: 90, c: 0 }, feed: 100 },
  { name: 'weighted high tier fills before low', opts: { branches: ['a', 'b', 'c'], accepts: { a: 20 }, priorities: { a: 2, b: 2, c: 0 }, weights: { b: 3 } }, expect: { a: 20, b: 80, c: 0 }, feed: 100 },
  { name: 'both priority legs capped backpressures', opts: { accepts: { a: 10, b: 20 }, priorities: { a: 1, b: 0 } }, expect: { a: 10, b: 20 }, feed: 30, splitBlocked: true },
];

test('splitter split / overflow / priority table', () => {
  eachRow(SPLIT_CASES, row => {
    const solved = solveOperation(splitCase(row.opts));
    for (const [id, amount] of Object.entries(row.expect)) near(kg(solved.nodes[id].received), amount, 1e-6, id);
    near(kg(solved.nodes.feed.supplied), row.feed, 1e-6, 'feed');
    const splitLimits = solved.nodes.split.limitedBy || [];
    if (row.splitFree) assert.deepEqual(splitLimits, []);
    if (row.splitBlocked) assert.ok(splitLimits.includes('export') || splitLimits.includes('logistics'), splitLimits);
    if (row.splitCodes) {
      assert.ok(splitLimits.includes('export'));
      for (const code of row.splitCodes) assert.ok(codes(solved.nodes.split).includes(code), code);
      assert.match(solved.nodes.split.causeText, /branch blocked/);
    }
    for (const id of row.exportOn || []) assert.ok(solved.nodes[id].limitedBy.includes('export'));
    if (row.edgeLimitTo) assert.ok(solved.edgeLimits.some(limit => limit.to.node === row.edgeLimitTo));
    closed(solved);
  });
});

test('converter upstream of a splitter throttles only when every branch is saturated', () => {
  const build = storeAccept => ({
    site: siteWater(200, POWER_RESOURCE(20000)),
    graph: {
      nodes: [
        source('water', 200),
        ...electrolyzerNodes(),
        { id: 'split', unit: 'material-splitter', label: 'H2 split' },
        { id: 'sale', unit: 'material-sink', label: 'Sale', params: { acceptKg: 5 } },
        { id: 'store', unit: 'material-sink', label: 'Store', ...(storeAccept != null ? { params: { acceptKg: storeAccept } } : {}) },
      ],
      edges: [
        ...electrolyzerEdges({ node: 'water', port: 'out' }, { node: 'split', port: 'in' }),
        { from: { node: 'split', port: 'out' }, to: { node: 'sale', port: 'in' }, weight: 1 },
        { from: { node: 'split', port: 'out' }, to: { node: 'store', port: 'in' }, weight: 1 },
      ],
    },
    operation: { setpoints: { ely: 40 } },
  });
  const unconstrained = build(null);
  unconstrained.graph.nodes.find(node => node.id === 'sale').params = {};
  const freeH2 = kg(solveOperation(unconstrained).nodes.split.available);
  assert.ok(freeH2 > 10);

  const open = solveOperation(build(null));
  near(kg(open.nodes.split.available) / freeH2, 1, 1e-4);
  near(kg(open.nodes.sale.received), 5);
  near(kg(open.nodes.store.received) / freeH2, (freeH2 - 5) / freeH2, 1e-4);
  assert.ok(!(open.nodes.ely.limitedBy || []).includes('export'));
  assert.ok(!(open.nodes.split.limitedBy || []).includes('export'));
  closed(open);

  const saturated = solveOperation(build(5));
  near(kg(saturated.nodes.split.available), 10, 1e-4);
  assert.ok(saturated.nodes.split.limitedBy.includes('export'));
  assert.ok(saturated.nodes.ely.limitedBy.includes('export'));
  assert.ok(codes(saturated.nodes.ely).includes('branch-blocked'));
  closed(saturated);
});

// ---------------------------------------------------------------------------
// Buffers

function bufferCase({ feedKg = 100, capacityKg = 1000, initialKg = 0, dischargeKg = null, label } = {}) {
  return {
    site: siteWater(feedKg),
    graph: {
      nodes: [
        source('feed', feedKg),
        { id: 'tank', unit: 'material-buffer', ...(label ? { label } : {}), params: { capacityKg, initialKg } },
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'tank', port: 'in' } },
        { from: { node: 'tank', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: dischargeKg == null ? {} : { tank: dischargeKg } },
  };
}

test('single buffer: pass-through, charge, full backpressure, empty starvation', () => {
  const pass = solveOperation(bufferCase({ feedKg: 80, capacityKg: 500 }));
  near(pass.nodes.tank.activity, 80);
  near(pass.nodes.tank.inventoryKg, 0, 1e-9);
  near(kg(pass.nodes.sink.received), 80);
  closed(pass);

  const charge = solveOperation(bufferCase({ feedKg: 100, capacityKg: 1000, dischargeKg: 40 }));
  near(charge.nodes.tank.activity, 40);
  near(charge.nodes.tank.inventoryKg, 60);
  near(charge.nodes.tank.fill, 0.06);
  near(kg(charge.nodes.sink.received), 40);
  closed(charge, 1e-6);

  const full = solveOperation(bufferCase({ feedKg: 100, capacityKg: 50, initialKg: 50, dischargeKg: 0 }));
  assert.ok(full.nodes.tank.limitedBy.includes('capacity'));
  near(kg(full.nodes.feed.supplied), 0);
  near(full.nodes.tank.inventoryKg, 50);
  near(kg(full.nodes.sink.received), 0);
  closed(full, 1e-6);

  const empty = solveOperation(bufferCase({ feedKg: 0, capacityKg: 100, dischargeKg: 25, label: 'Buffer tank' }));
  assert.ok(empty.nodes.tank.limitedBy.includes('inventory'));
  near(empty.nodes.tank.activity, 0, 1e-9);
  near(kg(empty.nodes.sink.received), 0, 1e-9);
  assert.deepEqual(codes(empty.nodes.tank), ['empty-buffer']);
});

function horizonSite(dailyFeedKg) {
  const profile = Array(24).fill(0.1);
  return {
    solarKWp: 0,
    month: 0,
    solar: { annualTypical: profile, typicalDayKWhPerKWp: profile },
    resources: {
      water: { quality: 'assumed', stream: waterStream(dailyFeedKg), evidence: 'horizon feed' },
      electricity: { quality: 'assumed', stream: { kind: 'electricity', kWh: 0 } },
    },
    storage: { batteryKWh: 0, powerKW: 0, efficiency: 0.9, initialKWh: 0 },
  };
}

function horizonChain(dailyFeedKg, tanks, setpoints) {
  const ids = ['feed', ...tanks.map(tank => tank.id), 'sink'];
  return {
    site: horizonSite(dailyFeedKg),
    graph: {
      nodes: [
        source('feed', dailyFeedKg),
        ...tanks.map(({ id, params }) => ({ id, unit: 'material-buffer', params })),
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: ids.slice(1).map((id, index) => ({ from: { node: ids[index], port: 'out' }, to: { node: id, port: 'in' } })),
    },
    operation: { setpoints },
  };
}

test('horizon carries buffer state of charge hour to hour', () => {
  // 240 kg/day in, 120 discharged → the rest banks in the tank.
  const fill = solveHorizon(horizonChain(240, [{ id: 'tank', params: { capacityKg: 500, initialKg: 0 } }], { tank: 120 }));
  const soc = fill.horizon.hours.map(hour => hour.buffers?.tank?.soc ?? 0);
  assert.ok(Math.max(...soc) > 50);
  near(soc[23], 120, 1);
  near(fill.nodes.tank.activity, 120, 1);
  near(kg(fill.nodes.sink.received), 120, 1);
  near(fill.nodes.tank.inventoryKg, soc[23]);

  // No feed: drain initial inventory, then hit inventory starvation.
  const drain = solveHorizon(horizonChain(0, [{ id: 'tank', params: { capacityKg: 200, initialKg: 120, storedStream: waterStream(120) } }], { tank: 200 }));
  const drainSoc = drain.horizon.hours.map(hour => hour.buffers.tank.soc);
  assert.ok(drainSoc[0] < 120);
  near(drainSoc[23], 0);
  near(kg(drain.nodes.sink.received), 120, 1);
  assert.ok(drain.horizon.hours.some(hour => hour.limited.includes('tank')));
  assert.ok(drain.nodes.tank.limitedBy.includes('inventory'));

  // Two tanks in series keep consistent SOC.
  const dual = solveHorizon(horizonChain(240, [
    { id: 'tankA', params: { capacityKg: 500, initialKg: 0 } },
    { id: 'tankB', params: { capacityKg: 200, initialKg: 0 } },
  ], { tankA: 120, tankB: 60 }));
  const socA = dual.horizon.hours.map(hour => hour.buffers.tankA.soc);
  const socB = dual.horizon.hours.map(hour => hour.buffers.tankB.soc);
  near(socA[23], 120, 1);
  near(socB[23], 60, 1);
  near(dual.nodes.tankA.inventoryKg, socA[23]);
  near(dual.nodes.tankB.inventoryKg, socB[23]);
  near(kg(dual.nodes.sink.received), 60, 1);
  closed(dual, 1e-6);
});

function transferCase({ feedKg = 100, capA = 1000, capB = 1000, initA = 0, storedA = null, disA = null, disB = null, edgeCap = null } = {}) {
  const definition = horizonChain(feedKg, [
    { id: 'tankA', params: { capacityKg: capA, initialKg: initA, ...(storedA ? { storedStream: storedA } : {}) } },
    { id: 'tankB', params: { capacityKg: capB, initialKg: 0 } },
  ], {});
  delete definition.site;
  definition.site = siteWater(Math.max(feedKg, 1e-9));
  if (edgeCap != null) definition.graph.edges[1].capacity = edgeCap;
  if (disA != null) definition.operation.setpoints.tankA = disA;
  if (disB != null) definition.operation.setpoints.tankB = disB;
  return definition;
}

test('buffer→buffer transfer: pass-through, full destination, edge cap, empty and stored sources', () => {
  const pass = solveOperation(transferCase({ feedKg: 80 }));
  near(pass.nodes.tankA.activity, 80);
  near(pass.nodes.tankB.activity, 80);
  near(pass.nodes.tankA.inventoryKg, 0, 1e-9);
  near(pass.nodes.tankB.inventoryKg, 0, 1e-9);
  near(kg(pass.nodes.sink.received), 80);
  closed(pass);

  const full = solveOperation(transferCase({ capB: 40, disB: 0 }));
  near(full.nodes.tankB.inventoryKg, 40);
  near(full.nodes.tankA.activity, 40);
  near(full.nodes.tankA.inventoryKg, 60);
  assert.ok(full.nodes.tankB.limitedBy.includes('capacity'));
  assert.ok(full.nodes.tankA.limitedBy.includes('export'));
  assert.match(full.nodes.tankA.causeText, /tankB buffer full/);
  near(kg(full.nodes.sink.received), 0, 1e-9);
  closed(full);

  const capped = solveOperation(transferCase({ disA: 100, disB: 0, edgeCap: 25 }));
  near(capped.nodes.tankA.activity, 25);
  near(capped.nodes.tankA.inventoryKg, 75);
  near(capped.nodes.tankB.inventoryKg, 25);
  assert.ok(capped.nodes.tankA.limitedBy.includes('logistics'));
  assert.ok(!capped.nodes.tankA.limitedBy.includes('export'));
  assert.match(capped.nodes.tankA.causeText, /tankA→tankB logistics/);
  assert.ok(capped.edgeLimits.some(item => item.from.node === 'tankA' && item.to.node === 'tankB' && item.capacity === 25));
  closed(capped);

  const empty = solveOperation(transferCase({ feedKg: 0, disA: 50, disB: 50 }));
  assert.equal(empty.nodes.tankA.activity, 0);
  assert.equal(empty.nodes.tankB.activity, 0);
  assert.ok(empty.nodes.tankA.limitedBy.includes('inventory'));
  near(kg(empty.nodes.sink.received), 0, 1e-9);

  // Inventory with no recorded composition cannot be discharged, but must not throw.
  const opaque = solveOperation(transferCase({ feedKg: 0, initA: 50, capA: 100, disA: 20, disB: 0 }));
  assert.equal(opaque.nodes.tankA.activity, 0);
  near(opaque.nodes.tankA.inventoryKg, 50, 1e-9);
  assert.ok(opaque.nodes.tankA.limitedBy.includes('inventory'));
  closed(opaque, 1e-6);

  const stored = solveOperation(transferCase({ feedKg: 0, initA: 60, storedA: waterStream(60), capA: 200, capB: 200, disA: 60 }));
  near(stored.nodes.tankA.activity, 60);
  near(stored.nodes.tankA.inventoryKg, 0, 1e-9);
  near(stored.nodes.tankB.activity, 60);
  near(kg(stored.nodes.sink.received), 60);
  closed(stored);
});

function splitBufferCase({ acceptA = 10, capacityKg = 1000, dischargeKg = null, edgeCapB = null, priorityA = null, priorityB = null, toElectrolyzer = false } = {}) {
  const nodes = [
    source('feed', 100),
    { id: 'split', unit: 'material-splitter', label: 'Split' },
    { id: 'a', unit: 'material-sink', label: 'Sale', params: { acceptKg: acceptA } },
    { id: 'tank', unit: 'material-buffer', label: 'Buffer tank', params: { capacityKg, initialKg: 0 } },
  ];
  const edges = [
    { from: { node: 'feed', port: 'out' }, to: { node: 'split', port: 'in' } },
    { from: { node: 'split', port: 'out' }, to: { node: 'a', port: 'in' }, weight: 1, ...(priorityA != null ? { priority: priorityA } : {}) },
    {
      from: { node: 'split', port: 'out' },
      to: { node: 'tank', port: 'in' },
      weight: 1,
      ...(edgeCapB != null ? { capacity: edgeCapB } : {}),
      ...(priorityB != null ? { priority: priorityB } : {}),
    },
  ];
  const setpoints = {};
  if (toElectrolyzer) {
    nodes.push(...electrolyzerNodes(), { id: 'h2', unit: 'material-sink' });
    edges.push(...electrolyzerEdges({ node: 'tank', port: 'out' }, { node: 'h2', port: 'in' }));
    setpoints.ely = 40;
  } else {
    nodes.push({ id: 'store', unit: 'material-sink', label: 'Store' });
    edges.push({ from: { node: 'tank', port: 'out' }, to: { node: 'store', port: 'in' } });
  }
  if (dischargeKg != null) setpoints.tank = dischargeKg;
  return { site: siteWater(100, POWER_RESOURCE(20000)), graph: { nodes, edges }, operation: { setpoints } };
}

test('splitter overflow into a buffer branch', () => {
  const rows = [
    { name: 'free pass-through buffer drains to sink', opts: { capacityKg: 200 }, a: 10, tankIn: 90, feed: 100, extra: s => {
      near(s.nodes.tank.activity, 90);
      near(s.nodes.tank.inventoryKg, 0, 1e-9);
      near(kg(s.nodes.store.received), 90);
      assert.deepEqual(s.nodes.split.limitedBy || [], []);
    } },
    { name: 'buffer capacity caps overflow and backpressures', opts: { capacityKg: 50 }, a: 10, tankIn: 50, feed: 60, extra: s => {
      assert.ok(s.nodes.split.limitedBy.includes('export'));
      assert.ok(codes(s.nodes.split).includes('branch-blocked'));
    } },
    { name: 'fixed discharge banks overflow as inventory', opts: { dischargeKg: 20 }, a: 10, tankIn: 90, feed: 100, tol: 1e-6, extra: s => {
      near(s.nodes.tank.activity, 20);
      near(s.nodes.tank.inventoryKg, 70);
      near(kg(s.nodes.store.received), 20);
    } },
    { name: 'edge capacity on buffer leg limits absorb', opts: { edgeCapB: 40 }, a: 10, tankIn: 40, feed: 50, extra: s => {
      assert.ok(s.nodes.split.limitedBy.includes('export') || s.nodes.split.limitedBy.includes('logistics'));
    } },
    { name: 'priority sale fills first then overflows into buffer', opts: { acceptA: 30, priorityA: 1, priorityB: 0 }, a: 30, tankIn: 70, feed: 100 },
    { name: 'buffer feeding a converter absorbs overflow', opts: { toElectrolyzer: true }, a: 10, tankIn: 90, feed: 100, extra: s => {
      assert.ok(s.nodes.ely.activity > 5, s.nodes.ely.activity);
      assert.ok(s.nodes.ely.limitedBy.includes('water'));
      assert.deepEqual(s.nodes.split.limitedBy || [], []);
    } },
  ];
  eachRow(rows, row => {
    const solved = solveOperation(splitBufferCase(row.opts));
    near(kg(solved.nodes.a.received), row.a);
    near(kg(solved.nodes.tank.consumed.in), row.tankIn);
    near(kg(solved.nodes.feed.supplied), row.feed);
    row.extra?.(solved);
    closed(solved, row.tol ?? 1e-8);
  });
});

function bufferElyCase({ initialKg = 0, dischargeKg = null, edgeCap = null } = {}) {
  return {
    site: siteWater(1, POWER_RESOURCE(20000)),
    graph: {
      nodes: [
        source('feed', 0),
        { id: 'tank', unit: 'material-buffer', label: 'Feed tank', params: { capacityKg: 1000, initialKg, ...(initialKg > 0 ? { storedStream: waterStream(initialKg) } : {}) } },
        ...electrolyzerNodes(),
        { id: 'h2', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'tank', port: 'in' } },
        ...electrolyzerEdges({ node: 'tank', port: 'out' }, { node: 'h2', port: 'in' }),
      ].map((edge, index) => (index === 1 && edgeCap != null ? { ...edge, capacity: edgeCap } : edge)),
    },
    operation: { setpoints: { ely: 40, ...(dischargeKg != null ? { tank: dischargeKg } : {}) } },
  };
}

test('buffer discharging into a converter: inventory feeds, empty starves, edge cap banks', () => {
  const fed = solveOperation(bufferElyCase({ initialKg: 100 }));
  near(fed.nodes.tank.activity, 100);
  near(fed.nodes.tank.inventoryKg, 0, 1e-9);
  assert.ok(fed.nodes.ely.activity > 10);
  assert.ok(fed.nodes.ely.limitedBy.includes('water'));
  closed(fed);

  const starved = solveOperation(bufferElyCase({ dischargeKg: 0 }));
  assert.ok(starved.nodes.ely.activity < 1e-9);
  assert.ok(starved.nodes.ely.limitedBy.includes('water'));
  assert.ok(codes(starved.nodes.ely).includes('empty-buffer'), starved.nodes.ely.causeText);
  assert.match(starved.nodes.ely.causeText, /short on water/i);

  const capped = solveOperation(bufferElyCase({ initialKg: 100, edgeCap: 25 }));
  near(capped.nodes.tank.activity, 25);
  near(capped.nodes.tank.inventoryKg, 75);
  assert.ok(capped.nodes.tank.limitedBy.includes('logistics'));
  assert.ok(codes(capped.nodes.tank).includes('logistics'), capped.nodes.tank.causeText);
  closed(capped);
});

test('a converter drawing less than the buffer offers banks the rest as inventory', () => {
  const definition = splitBufferCase();
  definition.graph.nodes = definition.graph.nodes.filter(node => node.id !== 'store');
  definition.graph.edges = definition.graph.edges.filter(edge => edge.to.node !== 'store');
  definition.site = siteWater(100, POWER_RESOURCE(1e6));
  definition.graph.nodes.push(
    { id: 'power', unit: 'electricity-source', siteResource: 'electricity', params: { stream: { kind: 'electricity', kWh: 1e6 } } },
    { id: 'swro', unit: 'swro', label: 'SWRO', capacity: 0.01, params: { recovery: 0.45, secKWhPerM3: 3.1 } },
    { id: 'water', unit: 'material-sink' },
    { id: 'brine', unit: 'material-sink' },
  );
  definition.graph.edges.push(
    { from: { node: 'tank', port: 'out' }, to: { node: 'swro', port: 'feed' } },
    { from: { node: 'power', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
    { from: { node: 'swro', port: 'product' }, to: { node: 'water', port: 'in' } },
    { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
  );
  definition.operation.setpoints = { swro: 0.01 };
  const solved = solveOperation(definition);
  near(kg(solved.nodes.tank.consumed.in), 90);
  near(solved.nodes.swro.activity, 0.01, 1e-9);
  const drawn = kg(solved.nodes.swro.consumed.feed);
  assert.ok(drawn > 0 && drawn < 90);
  near(solved.nodes.tank.inventoryKg, 90 - drawn);
  assert.ok(solved.nodes.tank.limitedBy.includes('export'));
  closed(solved);
});

// ---------------------------------------------------------------------------
// Sink caps, backpressure and demand-backed accept

function offtakeCase({ feedKg = 100, params, economics, setpoint, periodDays } = {}) {
  return {
    site: siteWater(feedKg),
    graph: {
      nodes: [
        source('feed', feedKg),
        { id: 'offtake', unit: 'material-sink', label: 'Offtake', ...(params ? { params } : {}), ...(economics ? { economics } : {}) },
      ],
      edges: [{ from: { node: 'feed', port: 'out' }, to: { node: 'offtake', port: 'in' } }],
    },
    operation: { setpoints: setpoint == null ? {} : { offtake: setpoint }, ...(periodDays ? { periodDays } : {}) },
  };
}

test('material sink accept caps backpressure a direct source', () => {
  const demand = { disposition: 'sale', unitPrice: 1, annualDemandLimit: 3650 };
  const rows = [
    { name: 'manual acceptKg', opts: { params: { acceptKg: 35 } }, accept: 35, source: 'manual' },
    { name: 'sink setpoint', opts: { setpoint: 20 }, accept: 20 },
    { name: 'annualDemandLimit / periodDays', opts: { economics: demand, periodDays: 365 }, accept: 10, source: 'demand' },
    { name: 'longer periodDays shrinks daily accept', opts: { economics: demand, periodDays: 730 }, accept: 5, source: 'demand' },
    { name: 'manual acceptKg overrides demand', opts: { params: { acceptKg: 25 }, economics: demand }, accept: 25, source: 'manual' },
  ];
  eachRow(rows, row => {
    const solved = solveOperation(offtakeCase(row.opts));
    const offtake = solved.nodes.offtake;
    near(kg(offtake.received), row.accept);
    near(kg(solved.nodes.feed.supplied), row.accept);
    assert.ok(offtake.limitedBy.includes('export'));
    if (row.source) {
      assert.equal(offtake.acceptSource, row.source);
      near(offtake.acceptKg, row.accept, 1e-9);
      assert.deepEqual(codes(offtake), ['export-capped']);
      assert.match(offtake.causeText, /export capped/);
    }
    closed(solved);
  });
});

test('lithium offtake cap (manual or annual demand) throttles Zabuye minerals and cash agrees', () => {
  const base = siteZabuyeAbundance();
  const free = solveOperation(clone(base));
  const freeLi = kg(free.nodes.lithium.received);
  assert.ok(freeLi > 1);
  const dailyCap = freeLi * 0.4;
  for (const mode of ['manual', 'demand']) {
    const limited = clone(base);
    const lithium = limited.graph.nodes.find(node => node.id === 'lithium');
    if (mode === 'manual') lithium.params = { ...(lithium.params || {}), acceptKg: dailyCap };
    else lithium.economics = { ...(lithium.economics || {}), annualDemandLimit: dailyCap * 365 };
    const solved = solveOperation(limited);
    near(solved.nodes.minerals.activity / free.nodes.minerals.activity, 0.4, 1e-5, mode);
    near(kg(solved.nodes.lithium.received), dailyCap, 1e-3, mode);
    near(kg(solved.nodes.brine.supplied) / kg(free.nodes.brine.supplied), 0.4, 1e-5, mode);
    assert.equal(solved.nodes.lithium.acceptSource, mode);
    assert.ok(solved.nodes.lithium.limitedBy.includes('export'));
    assert.ok(solved.nodes.minerals.limitedBy.includes('export'));
    assert.match(solved.nodes.minerals.causeText, /blocked by export/);
    assert.ok(codes(solved.nodes.minerals).includes('export-capped'));
    closed(solved);
    if (mode === 'demand') {
      // Physics already throttled to demand, so cash takes no second haircut.
      const economics = evaluateEconomics({ graph: limited.graph, operation: limited.operation, economics: { periodDays: 365 } }, solved);
      const sink = economics.sinks.find(item => item.id === 'lithium');
      near(sink.deliveredAmount, sink.annualAmount, 1e-2);
      near(sink.annualAmount, dailyCap * 365, 1);
    }
  }
});

test('a full buffer backpressures an upstream converter', () => {
  const solved = solveOperation({
    site: siteWater(100, POWER_RESOURCE(10000)),
    graph: {
      nodes: [
        source('water', 100),
        ...electrolyzerNodes({ capacity: 50 }),
        { id: 'tank', unit: 'material-buffer', label: 'H2 tank', params: { capacityKg: 5, initialKg: 5 } },
        { id: 'h2sink', unit: 'material-sink' },
      ],
      edges: [
        ...electrolyzerEdges({ node: 'water', port: 'out' }, { node: 'tank', port: 'in' }),
        { from: { node: 'tank', port: 'out' }, to: { node: 'h2sink', port: 'in' } },
      ],
    },
    operation: { setpoints: { ely: 50, tank: 0 } },
  });
  assert.ok(solved.nodes.ely.activity < 1e-9);
  assert.ok(solved.nodes.ely.limitedBy.includes('export'));
  assert.ok(solved.nodes.tank.limitedBy.includes('capacity'));
  assert.match(solved.nodes.ely.causeText, /blocked by export/);
  assert.match(solved.nodes.ely.causeText, /buffer full/);
  near(kg(solved.nodes.water.supplied), 0);
  closed(solved);
});

// ---------------------------------------------------------------------------
// Electricity / heat export caps

function energyCase(kind, sources, sinkParams) {
  return {
    graph: {
      nodes: [
        ...sources.map(([id, kWh]) => ({ id, unit: `${kind}-source`, params: { stream: kind === 'heat' ? { kind, kWh, T_C: 250 } : { kind, kWh } } })),
        { id: 'sink', unit: `${kind}-sink`, label: 'Export', ...(sinkParams ? { params: sinkParams } : {}) },
      ],
      edges: sources.map(([id]) => ({ from: { node: id, port: 'out' }, to: { node: 'sink', port: 'in' } })),
    },
    operation: { setpoints: {} },
  };
}

test('energy sink caps curtail or backpressure their sources', () => {
  const rows = [
    { name: 'capped electricity sink curtails generator', kind: 'electricity', sources: [['gen', 100]], params: { acceptKWh: 40 }, received: 40, supplied: { gen: 40 }, cause: /curtailment capped/ },
    { name: 'blank electricity sink is unlimited', kind: 'electricity', sources: [['gen', 75]], params: null, received: 75, supplied: { gen: 75 }, uncapped: true },
    { name: 'capped heat sink backpressures heat source', kind: 'heat', sources: [['furnace', 200]], params: { acceptKWh: 50 }, received: 50, supplied: { furnace: 50 }, cause: /export capped/ },
    { name: 'heat fan-in scales both legs under one cap', kind: 'heat', sources: [['a', 80], ['b', 120]], params: { acceptKWh: 50 }, received: 50, supplied: { a: 20, b: 30 } },
  ];
  eachRow(rows, row => {
    const solved = solveOperation(energyCase(row.kind, row.sources, row.params));
    const sink = solved.nodes.sink;
    near(sink.received.kWh, row.received, 1e-9);
    for (const [id, kWh] of Object.entries(row.supplied)) near(solved.nodes[id].supplied.kWh, kWh, 1e-9, id);
    if (row.uncapped) {
      assert.equal(sink.acceptKWh, null);
      assert.ok(!(sink.limitedBy || []).includes('export'));
    } else {
      assert.equal(sink.acceptKWh, row.params.acceptKWh);
      assert.equal(sink.acceptSource, 'manual');
      assert.ok(sink.limitedBy.includes('export'));
      assert.deepEqual(codes(sink), ['export-capped']);
    }
    if (row.cause) assert.match(sink.causeText, row.cause);
    closed(solved);
  });
});

test('bus export cap leaves cable-limited loads whole and trims generation', () => {
  const solved = solveOperation({
    graph: {
      nodes: [
        { id: 'gen', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: 100 } } },
        { id: 'bus', unit: 'electrical-bus' },
        { id: 'load', unit: 'electricity-sink', label: 'Plant load' },
        { id: 'export', unit: 'electricity-sink', label: 'Export', params: { acceptKWh: 20 } },
      ],
      edges: [
        { from: { node: 'gen', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'load', port: 'in' }, capacity: 60 },
        { from: { node: 'bus', port: 'out' }, to: { node: 'export', port: 'in' } },
      ],
    },
    operation: { setpoints: {}, priorities: { bus: ['load', 'export'] } },
  });
  near(solved.nodes.load.received.kWh, 60, 1e-9);
  near(solved.nodes.export.received.kWh, 20, 1e-9);
  near(solved.nodes.gen.supplied.kWh, 80, 1e-9);
  assert.ok(solved.nodes.export.limitedBy.includes('export'));
  closed(solved);
});

test('capped waste-heat sink throttles DAC and names the cause', () => {
  const free = solveOperation(createDacCase());
  const freeWaste = free.nodes['waste-heat'].received.kWh;
  assert.ok(freeWaste > 0);
  const limited = createDacCase();
  const sink = limited.graph.nodes.find(node => node.id === 'waste-heat');
  sink.params = { ...(sink.params || {}), acceptKWh: freeWaste * 0.4 };
  const solved = solveOperation(limited);
  near(solved.nodes['waste-heat'].received.kWh / freeWaste, 0.4);
  near(solved.nodes.dac.activity / free.nodes.dac.activity, 0.4);
  assert.ok(solved.nodes.dac.limitedBy.includes('export'));
  assert.match(solved.nodes.dac.causeText, /blocked by export/);
  assert.ok(codes(solved.nodes.dac).includes('export-capped'));
  closed(solved);
});

// ---------------------------------------------------------------------------
// Starvation cause chains

test('site budget on brine walks into a minerals short-on-brine chain', () => {
  const limited = siteZabuyeAbundance();
  const brine = limited.site.resources.brine.stream;
  const factor = 5000 / kg(brine);
  limited.site.resources.brine.stream = { ...brine, mol: Object.fromEntries(Object.entries(brine.mol).map(([id, mol]) => [id, mol * factor])) };
  const solved = solveOperation(limited);
  assert.ok(solved.nodes.brine.limitedBy.includes('site budget'));
  assert.match(solved.nodes.brine.causeText, /site budget/);
  assert.ok(solved.nodes.minerals.limitedBy.includes('brine'));
  assert.ok(codes(solved.nodes.minerals).includes('site-budget'));
  assert.match(solved.nodes.minerals.causeText, /short on brine/);
});

test('an unconnected limiting inlet is reported as a missing inlet', () => {
  const nodeResults = { swro: { limitedBy: ['feed'], activity: 0 } };
  attachCauseChains({ graph: { nodes: [{ id: 'swro', unit: 'swro', label: 'SWRO', capacity: 10, params: {} }], edges: [] } }, nodeResults, []);
  assert.deepEqual(codes(nodeResults.swro), ['missing-inlet']);
  assert.match(nodeResults.swro.causeText, /missing feed/);
});
