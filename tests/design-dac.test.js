const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../engine/designs/dac.js');
const { within, rank, companyData } = require('./helpers.js');

const { pathways: PATHWAYS, sites: SITES } = companyData();
const dacPathways = ['methanol', 'sabatier', 'coastal'];

test('recipe basis matches the DAC flowsheets in data/pathways.js', () => {
  for (const id of dacPathways) {
    const p = PATHWAYS.find(x => x.id === id);
    const dac = p.flowsheet.nodes.find(n => n.unit === 'dac' || n.unit === 'dac-solid');
    const blower = p.flowsheet.nodes.find(n => n.unit === 'gas-blower');
    const co2 = p.flowsheet.edges.find(e => e.from === dac.id && e.substances?.[0]?.[0] === 'CO2').kgPerKg;
    const recipe = D.RECIPE[dac.unit];
    within(dac.kWhPerKg / co2, recipe.kWhPerKg, 0.02);
    within(p.heatKWhPerKg / co2, recipe.heatKWhPerKg, 0.02);
    within(p.feeds.find(f => f.id === 'consumables').kgPerKg / co2, recipe.consumablesKgPerKg, 0.02);
    within(blower.kWhPerKg / co2, D.RECIPE['gas-blower'].kWhPerKg, 0.02);
    // The demo cases are sized to 1 t/day by scripts/build-pathways.mjs: node capex = the pack.
    within(dac.capexUsdPerKgDay / co2 / recipe.usdPerKgDay, 1, 0.05);
  }
});

test('today preset lands near the recipe; the lean preset beats it on every axis', () => {
  const today = D.design(D.PRESETS.today.params);
  const lean = D.design(D.PRESETS.lean.params);
  const r = D.RECIPE.dac;
  within(today.dacUsdPerKgDay, r.usdPerKgDay, 0.25);
  // Regeneration + vacuum/aux energy near the recipe's 0.5 kWh_e + 1.5 kWh_th per kg CO₂.
  within(today.energy.electricKWhPerKg + today.energy.regenKWhPerKg, r.kWhPerKg + r.heatKWhPerKg, 0.35);
  assert.ok(today.energy.heatThKWhPerKg > 1.5 && today.energy.heatThKWhPerKg < 3, 'today 1.5–3 kWh_th/kg (literature range)');
  assert.ok(lean.installedUsdPerKgDay < today.installedUsdPerKgDay / 5);
  assert.ok(lean.kWhPerKg < today.kWhPerKg);
  assert.ok(lean.idiotIndex < today.idiotIndex && lean.idiotIndex > 1);
  assert.ok(lean.sorbentUsdPerKgCO2 < today.sorbentUsdPerKgCO2);
  const site = SITES.find(s => s.id === 'namibia-walvis-bay');
  for (const pv of [758, 76]) assert.ok(D.lcoc(D.PRESETS.lean.params, site, { pvUsdPerKWp: pv }).usdPerKg < D.lcoc(D.PRESETS.today.params, site, { pvUsdPerKWp: pv }).usdPerKg);
});

test('physics: air speed, capture, vacuum and heat supply move the design the right way', () => {
  const slow = D.design({ faceVelocityMPerS: 1 });
  const fast = D.design({ faceVelocityMPerS: 3 });
  assert.ok(slow.energy.fanKWhPerKg < fast.energy.fanKWhPerKg, 'slower air → less fan kWh');
  assert.ok(slow.faceM2PerKgDay > fast.faceM2PerKgDay, 'slower air → more contactor face');
  assert.ok(D.design({ captureFraction: 0.9 }).air.depth > D.design({ captureFraction: 0.6 }).air.depth, 'higher capture → deeper beds');
  assert.ok(D.design({ captureFraction: 0.9 }).air.airM3PerKg < D.design({ captureFraction: 0.6 }).air.airM3PerKg, 'higher capture → less air per kg');
  const deep = D.design({ vacuumKPa: 10 });
  const mild = D.design({ vacuumKPa: 70 });
  assert.ok(deep.chamber.doorsKgPerM2Face > mild.chamber.doorsKgPerM2Face, 'deeper vacuum → heavier doors');
  assert.ok(deep.energy.heat.steamKWh < mild.energy.heat.steamKWh, 'deeper vacuum → less purge steam');
  assert.ok(deep.energy.vacuumKWhPerKg > mild.energy.vacuumKWhPerKg, 'deeper vacuum → more pump work');
  const hp = D.design({ heatSupply: 'heat-pump' });
  const res = D.design({ heatSupply: 'resistive' });
  assert.ok(hp.energy.cop > 1.5 && hp.kWhPerKg < res.kWhPerKg);
  // Reaction enthalpy: 70 kJ/mol ÷ 44.01 g/mol = 0.442 kWh/kg.
  within(D.design().energy.heat.reactionKWh, 70 / 44.01 / 3.6, 1e-9);
  // Laminar channels; pressure drop well under a generic blower's 3.6 kPa.
  for (const d of [slow, fast, D.design(D.PRESETS.today.params)]) assert.ok(d.air.re < 2300 && d.air.dp < 500);
});

test('the override re-prices DAC pathways in rankOpportunities and leaves the rest alone', () => {
  const o = D.simulatorOverride(D.PRESETS.lean.params);
  for (const u of D.units) assert.equal(o[u].flexible, true, u);
  const lean = D.design(D.PRESETS.lean.params);
  within(o.dac.capexFactor, lean.dacUsdPerKgDay / D.RECIPE.dac.usdPerKgDay, 1e-12);
  const byId = config => new Map(rank(config).map(r => [r.pathwayId, r]));
  const recipe = byId({});
  const designed = byId({ designs: { units: o } });
  for (const id of dacPathways) {
    assert.ok(designed.get(id).lcopUsdPerKg < recipe.get(id).lcopUsdPerKg, id);
    assert.ok(designed.get(id).energyKWhPerKg < recipe.get(id).energyKWhPerKg, id);
  }
  for (const id of ['green-hydrogen', 'green-mto', 'green-ammonia']) within(designed.get(id).lcopUsdPerKg, recipe.get(id).lcopUsdPerKg, 1e-9, id);
});
