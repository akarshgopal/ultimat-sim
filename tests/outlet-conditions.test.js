const assert = require('node:assert/strict');
const test = require('node:test');
const { UNITS, OUTLET_CONDITIONS } = require('../engine/units.js');
const { SUBSTANCES } = require('../engine/model.js');
const { PATHWAYS } = require('../data/pathways.js');

test('every converter material outlet has a real outlet condition', () => {
  const missing = [];
  for (const [id, unit] of Object.entries(UNITS)) {
    if (unit.kind !== 'converter') continue;
    for (const [port, p] of Object.entries(unit.ports)) {
      if (p.direction === 'out' && p.kind === 'material' && !OUTLET_CONDITIONS[id]?.[port]) missing.push(`${id}.${port}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('outlet conditions set temperature, pressure and phase without touching mass or energy', () => {
  const unit = UNITS.electrolyzer;
  const water = { kind: 'material', mol: { H2O: 1e6 }, phase: 'liquid', T_C: 25, P_bar: 1.5 };
  const r = unit.evaluate({ inlets: { water, electricity: { kind: 'electricity', kWh: 1e9 } }, requestedActivity: 100, capacity: 1e6, params: {} });
  assert.equal(r.outlets.hydrogen.T_C, 40);
  assert.equal(r.outlets.hydrogen.P_bar, 30);
  // Mass in = mass out: conditions only relabel the streams.
  const kg = st => Object.entries(st.mol).reduce((t, [sub, mol]) => t + mol * SUBSTANCES[sub].molarMassG / 1000, 0);
  const out = ['hydrogen', 'oxygen', 'waterReject'].reduce((t, k) => t + kg(r.outlets[k]), 0);
  assert.ok(r.activity > 0 && Math.abs(out - kg(r.consumed.water)) < 1e-6 * out, `${out} vs ${kg(r.consumed.water)}`);
  // What a unit draws from a port stays at that port's conditions.
  assert.equal(r.consumed.water.T_C, 25);
  assert.equal(r.consumed.water.P_bar, 1.5);
  // A node can override a port.
  const o = unit.evaluate({ inlets: { water, electricity: { kind: 'electricity', kWh: 1e9 } }, requestedActivity: 100, capacity: 1e6, params: { outletConditions: { hydrogen: { P_bar: 1 } } } });
  assert.equal(o.outlets.hydrogen.P_bar, 1);
  assert.equal(o.outlets.hydrogen.T_C, 40);
});

test('a multi-feed reactor keeps each feed at its own conditions', () => {
  const h2 = { kind: 'material', mol: { H2: 3e5 }, phase: 'gas', T_C: 40, P_bar: 30 };
  const n2 = { kind: 'material', mol: { N2: 1e5 }, phase: 'gas', T_C: 20, P_bar: 5 };
  const r = UNITS.ammonia.evaluate({ inlets: { hydrogen: h2, nitrogen: n2, electricity: { kind: 'electricity', kWh: 1e9 } }, requestedActivity: 1000, capacity: 1e6, params: {} });
  assert.deepEqual([r.consumed.hydrogen.T_C, r.consumed.hydrogen.P_bar], [40, 30]);
  assert.deepEqual([r.consumed.nitrogen.T_C, r.consumed.nitrogen.P_bar], [20, 5]);
  assert.deepEqual([r.outlets.ammonia.T_C, r.outlets.ammonia.P_bar, r.outlets.ammonia.phase], [-33, 1, 'liquid']);
});

test('generated flowsheets carry each material stream’s temperature and pressure', () => {
  for (const p of PATHWAYS) {
    for (const e of p.flowsheet.edges) {
      if (e.kind !== 'material' || !e.phase) continue; // consumables (sorbent) have no phase
      assert.ok(Number.isFinite(e.T_C) && Number.isFinite(e.P_bar), `${p.id} ${e.from} → ${e.to}`);
    }
  }
  const nh3 = PATHWAYS.find(p => p.id === 'green-ammonia').flowsheet.edges;
  const h2 = nh3.find(e => e.from === 'electrolyzer' && e.to === 'ammonia');
  assert.deepEqual([h2.T_C, h2.P_bar], [40, 30], 'the H₂ edge is at the electrolyzer outlet, not the N₂ conditions');
});
