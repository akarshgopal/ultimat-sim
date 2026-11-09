const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../engine/designs/dac.js');
const C = require('../engine/company.js');
const Bom = require('../data/bom.js');
const Utilization = require('../engine/utilization.js');
const { PATHWAYS } = require('../data/pathways.js');
const { MARKETS } = require('../data/markets.js');
const { SITES } = require('../data/sites.js');

const near = (a, b, rel) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} not within ${rel * 100}% of ${b}`);
const dacPathways = ['methanol', 'sabatier', 'coastal'];

test('module contract: id, units, presets, controls, browser registration', () => {
  assert.equal(D.id, 'dac');
  assert.deepEqual(D.units, ['dac', 'dac-solid', 'gas-blower']);
  for (const u of D.units) assert.ok(D.RECIPE[u].usdPerKgDay > 0 && D.RECIPE[u].kWhPerKg > 0);
  assert.ok(D.PRESETS.today && D.PRESETS.lean);
  for (const c of D.CONTROLS) assert.ok(c.key in D.DEFAULTS, c.key);
  const d = D.design();
  for (const k of ['installedUsdPerKgDay', 'materialsUsdPerKgDay', 'idiotIndex', 'kWhPerKg']) assert.ok(Number.isFinite(d[k]) && d[k] > 0, k);
  assert.equal(d.flexible, true);
  assert.ok(d.kpis.length >= 3 && d.kpis.length <= 6);
  // Parts add up to the installed cost (install is a part), and the floor to the materials.
  const sum = d.parts.reduce((t, p) => t + p.usd, 0);
  assert.ok(Math.abs(sum - d.installedUsdPerKgDay) < 1e-9 * sum);
  // Browser: no require/module, registers on globalThis.FoundryDesigns.
  const ctx = { FoundryBom: Bom, FoundryUtilization: Utilization, Math };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../engine/designs/dac.js'), 'utf8'), ctx);
  assert.equal(ctx.FoundryDesigns.dac.id, 'dac');
});

test('recipe basis matches the DAC flowsheets in data/pathways.js', () => {
  for (const id of dacPathways) {
    const p = PATHWAYS.find(x => x.id === id);
    const dac = p.flowsheet.nodes.find(n => n.unit === 'dac' || n.unit === 'dac-solid');
    const blower = p.flowsheet.nodes.find(n => n.unit === 'gas-blower');
    const co2 = p.flowsheet.edges.find(e => e.from === dac.id && e.substances?.[0]?.[0] === 'CO2').kgPerKg;
    const recipe = D.RECIPE[dac.unit];
    near(dac.kWhPerKg / co2, recipe.kWhPerKg, 0.02);
    near(p.heatKWhPerKg / co2, recipe.heatKWhPerKg, 0.02);
    near(p.feeds.find(f => f.id === 'consumables').kgPerKg / co2, recipe.consumablesKgPerKg, 0.02);
    near(blower.kWhPerKg / co2, D.RECIPE['gas-blower'].kWhPerKg, 0.02);
    // The demo cases fix the DAC at 100 kg CO₂/day for a 5 kg/day plant: node capex = pack × oversize.
    near(dac.capexUsdPerKgDay / co2 / recipe.usdPerKgDay, 100 / (5 * co2), 0.02);
  }
  near(D.RECIPE['dac-solid'].demoOversize, 100 / (5 * 1.37), 0.01);
});

test('today preset lands near the recipe; the lean preset beats it on every axis', () => {
  const today = D.design(D.PRESETS.today.params);
  const lean = D.design(D.PRESETS.lean.params);
  const r = D.RECIPE.dac;
  near(today.dacUsdPerKgDay, r.usdPerKgDay, 0.25);
  // Regeneration + vacuum/aux energy near the recipe's 0.5 kWh_e + 1.5 kWh_th per kg CO₂.
  near(today.energy.electricKWhPerKg + today.energy.regenKWhPerKg, r.kWhPerKg + r.heatKWhPerKg, 0.35);
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
  near(D.design().energy.heat.reactionKWh, 70 / 44.01 / 3.6, 1e-9);
  // Laminar channels; pressure drop well under a generic blower's 3.6 kPa.
  for (const d of [slow, fast, D.design(D.PRESETS.today.params)]) assert.ok(d.air.re < 2300 && d.air.dp < 500);
});

test('the override re-prices DAC pathways in rankOpportunities and leaves the rest alone', () => {
  const o = D.simulatorOverride(D.PRESETS.lean.params);
  for (const u of D.units) {
    assert.ok(o[u].capexFactor > 0 && o[u].energyFactor > 0 && o[u].flexible === true, u);
    assert.ok(o[u].materialsFactor > 0 && o[u].materialsFactor < o[u].capexFactor, `${u} materialsFactor below capexFactor (idiot index > 1)`);
  }
  const lean = D.design(D.PRESETS.lean.params);
  near(o.dac.capexFactor, lean.dacUsdPerKgDay / D.RECIPE.dac.usdPerKgDay, 1e-12);
  const input = config => ({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config });
  const rank = config => new Map(C.rankOpportunities(input(config), { sizeMultiple: 100 }).map(r => [r.pathwayId, r]));
  const recipe = rank({});
  const designed = rank({ designs: { units: o } });
  for (const id of dacPathways) {
    assert.ok(designed.get(id).lcopUsdPerKg < recipe.get(id).lcopUsdPerKg, id);
    assert.ok(designed.get(id).energyKWhPerKg < recipe.get(id).energyKWhPerKg, id);
  }
  for (const id of ['green-hydrogen', 'green-mto', 'green-ammonia']) {
    const a = recipe.get(id);
    if (a) assert.ok(Math.abs(designed.get(id).lcopUsdPerKg - a.lcopUsdPerKg) <= 1e-9 * a.lcopUsdPerKg, id);
  }
});
