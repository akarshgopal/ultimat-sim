// Intake pumps and gas blowers: bus-powered lifts between a boundary feed and
// the plant. Covers energy per unit, starvation, mass basis, head / ΔP derived
// SEC, the part-load shape, and their wiring on the stock demos.
const assert = require('node:assert/strict');
const test = require('node:test');

const { solveOperation } = require('../engine/solve');
const { UNITS, resolveLiquidPumpSec, resolveGasBlowerSec, pumpPartLoad, flowWithinShapedSec } = require('../engine/units');
const { siteZabuyeAbundance, siteDeadSeaAbundance } = require('../cases/brine-hubs');
const { createCoastalCase } = require('../cases/coastal');
const { createSabatierCase } = require('../cases/sabatier');
const { createMethanolCase } = require('../cases/methanol');

const { near, eachRow, kg } = require('./helpers.js');

function seawaterStream(massKg) {
  const saltKg = massKg * 0.035;
  return {
    kind: 'material',
    phase: 'liquid',
    T_C: 25,
    P_bar: 1,
    mol: {
      H2O: (massKg - saltKg) * 1000 / 18.01528,
      'Na+': saltKg * 1000 / 22.989769 / 2,
      'Cl-': saltKg * 1000 / 35.45 / 2,
    },
  };
}

function airStream(kmol) {
  return { kind: 'material', phase: 'gas', T_C: 25, P_bar: 1, mol: { N2: 790 * kmol, O2: 210 * kmol } };
}

const airNm3 = kmol => kmol * 22.414;

// feed → lift → sink, with the lift powered from a bus.
function liftCase(unit, params, { feed, capacity, setpoint = capacity, powerKWh = 100, acceptKg } = {}) {
  return {
    graph: {
      nodes: [
        { id: 'feed', unit: 'material-source', params: { stream: feed } },
        { id: 'lift', unit, capacity, params },
        { id: 'power', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: powerKWh } } },
        { id: 'bus', unit: 'electrical-bus' },
        { id: 'sink', unit: 'material-sink', ...(acceptKg == null ? {} : { params: { acceptKg } }) },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'lift', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'lift', port: 'electricity' } },
        { from: { node: 'lift', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: { lift: setpoint }, priorities: { bus: ['lift'] } },
  };
}

const PUMP = { unit: 'intake-pump', prefix: 'pump' };
const BLOWER = { unit: 'gas-blower', prefix: 'blower' };

test('lift energy per unit, electricity starvation and mass basis', () => {
  const nm3 = airNm3(50);
  const airKg = kg(airStream(50));
  const rows = [
    // 1 m³ seawater at 0.4 kWh/m³.
    { name: 'pump powered', lift: PUMP, params: { pumpKWhPerM3: 0.4, densityKgM3: 1025 }, opts: { feed: seawaterStream(1025), capacity: 1, powerKWh: 10 }, activity: 1, kWh: 0.4, outKg: 1025, basis: 'm3' },
    { name: 'pump short on power', lift: PUMP, params: { pumpKWhPerM3: 0.4, densityKgM3: 1025 }, opts: { feed: seawaterStream(1025), capacity: 1, powerKWh: 0.1 }, activity: 0.25, kWh: 0.1, outKg: 1025 * 0.25, starved: true },
    { name: 'pump unpowered', lift: PUMP, params: { pumpKWhPerM3: 0.4, densityKgM3: 1025 }, opts: { feed: seawaterStream(1025), capacity: 1, powerKWh: 0 }, activity: 0, kWh: 0, outKg: 0, starved: true },
    // 100 kg at 0.05 kWh/kg with 2.5 kWh → half.
    { name: 'pump kg basis', lift: PUMP, params: { pumpKWhPerKg: 0.05, densityKgM3: 1000 }, opts: { feed: seawaterStream(100), capacity: 1000, powerKWh: 2.5 }, activity: 50, kWh: 2.5, outKg: 50, starved: true, basis: 'kg' },
    { name: 'blower powered', lift: BLOWER, params: { blowerKWhPerNm3: 0.001 }, opts: { feed: airStream(50), capacity: nm3, powerKWh: 10 }, activity: nm3, kWh: nm3 * 0.001, outKg: airKg, basis: 'nm3' },
    { name: 'blower short on power', lift: BLOWER, params: { blowerKWhPerNm3: 0.001 }, opts: { feed: airStream(50), capacity: nm3, powerKWh: nm3 * 0.001 * 0.25 }, activity: nm3 * 0.25, kWh: nm3 * 0.001 * 0.25, outKg: airKg * 0.25, starved: true },
    { name: 'blower unpowered', lift: BLOWER, params: { blowerKWhPerNm3: 0.001 }, opts: { feed: airStream(50), capacity: nm3, powerKWh: 0 }, activity: 0, kWh: 0, outKg: 0, starved: true },
    { name: 'blower kg basis', lift: BLOWER, params: { blowerKWhPerKg: 0.01 }, opts: { feed: airStream(100 / kg(airStream(1))), capacity: 1000, powerKWh: 0.5 }, activity: 50, kWh: 0.5, outKg: 50, starved: true, basis: 'kg' },
  ];
  eachRow(rows, row => {
    const solved = solveOperation(liftCase(row.lift.unit, row.params, row.opts));
    const lift = solved.nodes.lift;
    near(lift.activity, row.activity, 1e-6, 'activity');
    near(lift.consumed?.electricity?.kWh ?? 0, row.kWh, 1e-9, 'kWh');
    near(kg(solved.nodes.sink.received), row.outKg, 1e-6, 'delivered');
    if (row.starved) {
      assert.ok(lift.limitedBy.includes('electricity'));
    } else {
      assert.deepEqual(lift.limitedBy, []);
    }
    if (row.basis && row.basis !== 'm3') assert.equal(lift[`${row.lift.prefix}Basis`], row.basis);
  });
});

test('gas blower rejects liquid feeds', () => {
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
    /is for gas feeds/,
  );
});

test('pump head and blower ΔP derive SEC unless overridden; bad inputs are rejected', () => {
  const pumpBase = { pumpKWhPerM3: 0.4, densityKgM3: 1025 };
  const pumpOpts = { feed: seawaterStream(1025), capacity: 1, powerKWh: 10 };
  const plain = solveOperation(liftCase('intake-pump', pumpBase, pumpOpts)).nodes.lift;
  assert.equal(plain.pumpKWhPerUnit, 0.4);
  assert.equal(plain.pumpSecSource, 'kWh/m3');

  const hydraulic = (1025 * 9.81 * 40) / (0.7 * 3.6e6); // ρ g H / (η · 3.6e6)
  const headed = solveOperation(liftCase('intake-pump', { ...pumpBase, headM: 40 }, pumpOpts)).nodes.lift;
  near(headed.pumpKWhPerUnit, hydraulic, 1e-9);
  near(headed.consumed.electricity.kWh, hydraulic, 1e-9);
  assert.equal(headed.pumpSecSource, 'head');

  const pumpOverride = solveOperation(liftCase('intake-pump', { ...pumpBase, headM: 40, pumpSecOverride: true }, pumpOpts)).nodes.lift;
  assert.equal(pumpOverride.pumpKWhPerUnit, 0.4);
  assert.equal(pumpOverride.pumpSecSource, 'override');

  assert.throws(() => resolveLiquidPumpSec({ headM: -1, densityKgM3: 1025 }, 1025), /headM/);
  assert.throws(() => resolveLiquidPumpSec({ headM: 10, pumpEta: 0, densityKgM3: 1025 }, 1025), /pumpEta/);
  assert.throws(() => resolveLiquidPumpSec({ headM: 10, pumpEta: 1.2, densityKgM3: 1025 }, 1025), /pumpEta/);

  assert.deepEqual(
    [resolveGasBlowerSec({ blowerKWhPerNm3: 0.001 }).sec, resolveGasBlowerSec({ blowerKWhPerNm3: 0.001 }).source],
    [0.001, 'kWh/Nm3'],
  );
  const dpSec = 5 / (0.7 * 3600); // ΔP[kPa] / (η · 3600)
  const derived = resolveGasBlowerSec({ blowerKWhPerNm3: 0.001, deltaP_kPa: 5 });
  near(derived.sec, dpSec, 1e-12);
  assert.equal(derived.source, 'deltaP');
  const blowerOverride = resolveGasBlowerSec({ blowerKWhPerNm3: 0.001, deltaP_kPa: 5, blowerSecOverride: true });
  assert.deepEqual([blowerOverride.sec, blowerOverride.source], [0.001, 'override']);
  assert.throws(() => resolveGasBlowerSec({ deltaP_kPa: -1 }), /deltaP_kPa/);
  assert.throws(() => resolveGasBlowerSec({ deltaP_kPa: 1, blowerEta: 0 }), /blowerEta/);

  const nm3 = airNm3(1);
  const blown = solveOperation(liftCase('gas-blower', { blowerKWhPerNm3: 0.001, deltaP_kPa: 5 }, { feed: airStream(1), capacity: 100, setpoint: nm3, powerKWh: 10 })).nodes.lift;
  near(blown.blowerKWhPerUnit, dpSec, 1e-12);
  assert.equal(blown.blowerSecSource, 'deltaP');
  near(blown.consumed.electricity.kWh, nm3 * dpSec, 1e-9);
});

// SEC(q) = SEC_rated · (1 + k (1 − q)²), q = flow / capacity.
const shapedSec = (rated, k, q) => rated * (1 + k * (1 - q) ** 2);

test('part-load shape: off by default, raises SEC below rated flow, clamps k to 3', () => {
  const base = { pumpKWhPerM3: 0.4, densityKgM3: 1025 };
  const half = { feed: seawaterStream(10250), capacity: 10, setpoint: 5 };
  const unshaped = solveOperation(liftCase('intake-pump', base, half)).nodes.lift;
  assert.equal(unshaped.pumpKWhPerUnit, 0.4);
  assert.equal(unshaped.pumpPartLoadK, undefined);
  assert.equal(unshaped.consumed.electricity.kWh, 2);
  const explicitZero = solveOperation(liftCase('intake-pump', { ...base, partLoadK: 0 }, half)).nodes.lift;
  near(explicitZero.consumed.electricity.kWh, 2, 1e-9);

  const shaped = solveOperation(liftCase('intake-pump', { ...base, partLoadK: 0.4 }, half)).nodes.lift;
  near(shaped.pumpKWhPerUnit, shapedSec(0.4, 0.4, 0.5), 1e-9);
  near(shaped.consumed.electricity.kWh, shapedSec(0.4, 0.4, 0.5) * 5, 1e-9);
  assert.equal(shaped.pumpPartLoadQ, 0.5);

  const rated = solveOperation(liftCase('intake-pump', { ...base, partLoadK: 0.4 }, { ...half, setpoint: 10 })).nodes.lift;
  assert.equal(rated.pumpPartLoadMultiplier, 1);
  assert.equal(rated.pumpKWhPerUnit, 0.4);

  const clamped = pumpPartLoad({ partLoadK: 4 }, 5, 10);
  assert.equal(clamped.k, 3);
  assert.equal(clamped.clamped, true);
  assert.equal(clamped.multiplier, 1 + 3 * 0.25);
  assert.equal(pumpPartLoad({ partLoadK: 3 }, 5, 10).clamped, undefined);
  assert.throws(() => pumpPartLoad({ partLoadK: -0.2 }, 1, 10), /partLoadK/);
  assert.throws(() => solveOperation(liftCase('intake-pump', { ...base, partLoadK: -0.1 }, half)), /partLoadK/);
});

test('part-load shape binds on a short bus: flow fits the shaped SEC to the power available', () => {
  const nm3 = airNm3(10);
  const rows = [
    { name: 'pump', lift: PUMP, rated: 0.4, k: 0.4, cap: 10, params: { pumpKWhPerM3: 0.4, densityKgM3: 1025 }, feed: seawaterStream(10250), power: 2 },
    { name: 'pump, k clamped from 4', lift: PUMP, rated: 0.4, k: 3, cap: 10, params: { pumpKWhPerM3: 0.4, densityKgM3: 1025, partLoadK: 4 }, feed: seawaterStream(10250), power: 1, clamped: true },
    { name: 'blower', lift: BLOWER, rated: 0.001, k: 0.4, cap: nm3, params: { blowerKWhPerNm3: 0.001 }, feed: airStream(10), power: nm3 * 0.001 * 0.4 },
  ];
  eachRow(rows, row => {
    const params = { partLoadK: row.k, ...row.params };
    const lift = solveOperation(liftCase(row.lift.unit, params, { feed: row.feed, capacity: row.cap, powerKWh: row.power })).nodes.lift;
    const p = row.lift.prefix;
    // A flat SEC would deliver power / rated; the shape must deliver less.
    assert.ok(lift.activity > 0 && lift.activity < row.power / row.rated - 1e-3, lift.activity);
    assert.ok(lift.limitedBy.includes('electricity'));
    const sec = shapedSec(row.rated, row.k, lift.activity / row.cap);
    near(lift[`${p}KWhPerUnit`], sec, 1e-8, 'sec');
    near(lift.consumed.electricity.kWh, lift.activity * sec, 1e-6, 'kWh');
    assert.ok(lift.consumed.electricity.kWh <= row.power + 1e-8);
    assert.ok(lift.consumed.electricity.kWh > row.power - 1e-4);
    assert.equal(lift[`${p}PartLoadK`], row.k);
    if (row.clamped) {
      assert.equal(lift.pumpPartLoadClamped, true);
      near(lift.activity, flowWithinShapedSec(0.4, { partLoadK: 4 }, 10, 10, row.power), 1e-6, 'fitted');
    }
    if (p === 'blower') near(lift.requestedInputs.electricity.kWh, nm3 * row.rated, 1e-6, 'planned at rated');
  });

  // Below-rated setpoint with half the shaped demand: still below the naive planned-SEC flow.
  const halfDemand = 5 * shapedSec(0.4, 0.4, 0.5);
  const cut = solveOperation(liftCase('intake-pump', { pumpKWhPerM3: 0.4, densityKgM3: 1025, partLoadK: 0.4 }, {
    feed: seawaterStream(10250), capacity: 10, setpoint: 5, powerKWh: halfDemand * 0.5,
  })).nodes.lift;
  assert.ok(cut.activity < (halfDemand * 0.5) / shapedSec(0.4, 0.4, 0.5) - 1e-4);
  near(cut.pumpKWhPerUnit, shapedSec(0.4, 0.4, cut.pumpPartLoadQ), 1e-8);
});

test('a blocked outlet refits part-load SEC at the delivered flow', () => {
  const nm3 = airNm3(10);
  const rows = [
    { name: 'pump', lift: PUMP, rated: 0.4, cap: 10, params: { pumpKWhPerM3: 0.4, densityKgM3: 1025 }, feed: seawaterStream(10250) },
    { name: 'blower', lift: BLOWER, rated: 0.001, cap: nm3, params: { blowerKWhPerNm3: 0.001 }, feed: airStream(10) },
  ];
  eachRow(rows, row => {
    const opts = { feed: row.feed, capacity: row.cap, powerKWh: 100 };
    const open = solveOperation(liftCase(row.lift.unit, row.params, opts));
    near(open.nodes.lift.activity, row.cap);
    near(open.nodes.lift.consumed.electricity.kWh, row.cap * row.rated, 1e-9);
    const acceptKg = kg(open.nodes.sink.received) / 2;

    const plain = solveOperation(liftCase(row.lift.unit, row.params, { ...opts, acceptKg })).nodes.lift;
    near(plain.activity, row.cap / 2, 1e-4);
    near(plain.consumed.electricity.kWh, plain.activity * row.rated, 1e-9);
    assert.ok(plain.limitedBy.includes('export'));

    const solved = solveOperation(liftCase(row.lift.unit, { ...row.params, partLoadK: 0.4 }, { ...opts, acceptKg }));
    const lift = solved.nodes.lift;
    near(lift.activity, plain.activity, 1e-4);
    assert.ok(lift.limitedBy.includes('export'));
    assert.ok(!lift.limitedBy.includes('electricity'));
    const sec = shapedSec(row.rated, 0.4, lift.activity / row.cap);
    near(lift.consumed.electricity.kWh, lift.activity * sec, 1e-6);
    near(lift[`${row.lift.prefix}KWhPerUnit`], sec, 1e-8);
    assert.ok(lift.consumed.electricity.kWh > plain.consumed.electricity.kWh + 1e-7);
    assert.ok(solved.balances.maxAbsResidual < 1e-6);
  });
});

test('an intake pump moves inventory between two buffers when powered', () => {
  const sea = seawaterStream(1025);
  const solved = solveOperation({
    graph: {
      nodes: [
        { id: 'sea', unit: 'material-source', params: { stream: sea } },
        { id: 'tankA', unit: 'material-buffer', params: { capacityKg: 5000, initialKg: 0 } },
        { id: 'pump', unit: 'intake-pump', capacity: 1, params: { pumpKWhPerM3: 0.4, densityKgM3: 1025 } },
        { id: 'power', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: 10 } } },
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
    operation: { setpoints: { pump: 1 }, priorities: { bus: ['pump'] } },
  });
  near(solved.nodes.pump.activity, 1, 1e-9);
  near(kg(solved.nodes.sink.received), 1025, 1e-4);
  assert.ok(solved.balances.maxAbsResidual < 1e-6);
});

test('stock demos feed the plant through bus-powered lifts; cutting a lift cable starves its consumer', () => {
  const demos = {
    zabuye: siteZabuyeAbundance,
    deadSea: siteDeadSeaAbundance,
    coastal: () => createCoastalCase(),
    sabatier: () => createSabatierCase(),
    methanol: () => createMethanolCase(),
  };
  const seen = new Set();
  for (const [name, factory] of Object.entries(demos)) {
    const definition = factory();
    const lifts = definition.graph.nodes.filter(node => node.unit === 'intake-pump' || node.unit === 'gas-blower');
    assert.ok(lifts.length >= 1, name);
    const free = solveOperation(definition);
    for (const lift of lifts) {
      const label = `${name}/${lift.id}`;
      seen.add(lift.unit);
      const consumer = definition.graph.edges.find(edge => edge.from.node === lift.id).to.node;
      const result = free.nodes[lift.id];
      assert.ok(result.activity > 0, label);
      assert.ok(result.consumed.electricity.kWh > 0, label);
      assert.ok(free.nodes[consumer].activity > 0, label);

      const cut = factory();
      cut.graph.edges.find(edge => edge.to.node === lift.id && edge.to.port === 'electricity').capacity = 0;
      const starved = solveOperation(cut);
      assert.equal(starved.nodes[lift.id].activity, 0, label);
      assert.ok(starved.nodes[lift.id].limitedBy.includes('electricity'), label);
      assert.ok(starved.nodes[consumer].activity < 1e-6, label);
    }
  }
  assert.deepEqual([...seen].sort(), ['gas-blower', 'intake-pump']);
});
