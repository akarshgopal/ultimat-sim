const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../engine/designs/dri-shaft.js');
const C = require('../engine/company.js');
const { PATHWAYS } = require('../data/pathways.js');
const { MARKETS } = require('../data/markets.js');
const { SITES } = require('../data/sites.js');

const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('module follows the design contract', () => {
  assert.equal(D.id, 'dri-shaft');
  assert.deepEqual([...D.units], ['hydrogen-dri']);
  assert.ok(D.RECIPE[D.product].usdPerKgDay > 0 && D.RECIPE[D.product].kWhPerKg > 0);
  // The recipe basis is what data/pathways.js carries on both pathways that use the unit.
  for (const id of ['h2-dri', 'green-h2-dri']) {
    const node = PATHWAYS.find(p => p.id === id).flowsheet.nodes.find(n => n.unit === 'hydrogen-dri');
    assert.equal(node.capexUsdPerKgDay, D.RECIPE.steel.usdPerKgDay);
    assert.equal(node.kWhPerKg, D.RECIPE.steel.kWhPerKg);
  }
  assert.ok(D.PRESETS.today && D.PRESETS.lean);
  for (const c of D.CONTROLS) assert.ok(c.key in D.DEFAULTS, c.key);
  const d = D.design();
  for (const k of ['installedUsdPerKgDay', 'materialsUsdPerKgDay', 'idiotIndex', 'kWhPerKg']) assert.ok(Number.isFinite(d[k]) && d[k] > 0, k);
  assert.equal(typeof d.flexible, 'boolean');
  assert.ok(d.kpis.length >= 3 && d.kpis.length <= 6);
  // Parts add up to the installed cost and the materials floor.
  close(d.parts.reduce((s, x) => s + x.usd, 0), d.installedUsdPerKgDay, 1e-9);
  close(d.parts.reduce((s, x) => s + x.usdMaterials, 0), d.materialsUsdPerKgDay, 1e-9);
});

test('mass and heat balance: stoichiometry, closure and the thermodynamic floor', () => {
  // Fe₂O₃ + 3 H₂ → 2 Fe + 3 H₂O: 1.5 mol H₂ per mol Fe = 0.0541 kg/kg Fe, as the recipes feed.
  close(D.H2_STOICH_KG_PER_KG_FE, 0.05415, 1e-3);
  close(D.THERMO_MIN_KWH_PER_KG, 0.2455, 2e-3);
  const d = D.design();
  const b = d.balance;
  assert.ok(Math.abs(b.waterKgPerKg - 0.484 * (D.DEFAULTS.metallization + (1 - D.DEFAULTS.metallization) / 3)) < 1e-3);
  // The shaft balance closes: gas heat in = reaction + hot DRI + top gas + shell loss.
  const s = D.shaftBalance(d.params, b.lambda, b.shellLossKWhPerKg * 3600);
  close(s.topGasC, b.topGasC, 1e-6);
  assert.ok(b.topGasC >= d.params.topGasMinC - 1e-6, 'top gas never below its minimum');
  assert.ok(b.lambda >= b.lambdaEquilibrium && b.lambda >= b.lambdaHeat - 1e-9);
  // Counter-current shafts are heat-limited, not equilibrium-limited: λ_heat > λ_eq.
  assert.ok(b.lambdaHeat > b.lambdaEquilibrium);
  // Energy is never below ΔH, across presets and a sweep of the knobs.
  for (const params of [D.PRESETS.today.params, D.PRESETS.lean.params, D.PRESETS.sunFollowing.params,
    { recuperatorEffectiveness: 0.95, gasUtilization: 0.6, topGasMinC: 100, dischargeC: 100 },
    { preheat: 'h2-combustion' }, { gasInletC: 750 }, { plantKgFePerDay: 5e6 }]) {
    const x = D.design(params);
    assert.ok(x.kWhPerKg >= D.THERMO_MIN_KWH_PER_KG, `${x.kWhPerKg} < ΔH for ${JSON.stringify(params)}`);
    assert.ok(x.balance.heatDutyKWhPerKg + x.balance.recuperatorKWhPerKg > x.balance.reactionKWhPerKg, 'gas must carry at least the reaction heat');
  }
});

test('preheat: hotter gas costs kWh once heat no longer binds; colder gas needs more of it', () => {
  for (const base of [D.PRESETS.today.params, D.PRESETS.lean.params]) {
    const kwh = T => D.design({ ...base, gasInletC: T }).kWhPerKg;
    assert.ok(kwh(1000) > kwh(950) && kwh(950) > kwh(900) - 1e-12, 'kWh rises with inlet temperature above the pinch');
  }
  // Below the pinch the heat balance sets the gas flow: λ rises as the gas cools.
  const lam = T => D.design({ gasInletC: T }).balance;
  assert.equal(lam(800).limitedBy, 'heat');
  assert.ok(lam(800).lambda > lam(900).lambda);
  // Recuperation and electric heating save energy; burning H₂ for heat costs more (52 kWh per kg H₂).
  assert.ok(D.design({ recuperatorEffectiveness: 0 }).kWhPerKg > D.design().kWhPerKg);
  assert.ok(D.design({ preheat: 'h2-combustion' }).kWhPerKg > D.design().kWhPerKg);
  // Hot standby costs energy only when the shaft follows the sun.
  assert.ok(D.design(D.PRESETS.sunFollowing.params).energy.standby > 0);
  assert.equal(D.design().energy.standby, 0);
});

test('presets: today lands near the recipe, lean is far cheaper but never below its materials', () => {
  const today = D.design(D.PRESETS.today.params);
  const lean = D.design(D.PRESETS.lean.params);
  // Recipe compared at the same plant size (the engine scales process capex with size).
  close(today.recipeUsdPerKgDay, D.recipeAtSize(today.params.plantKgFePerDay), 1e-12);
  assert.ok(Math.abs(today.vsRecipe.capexFactor - 1) < 0.15, `today capex ×${today.vsRecipe.capexFactor}`);
  assert.ok(Math.abs(today.vsRecipe.energyFactor - 1) < 0.25, `today energy ×${today.vsRecipe.energyFactor}`);
  assert.ok(lean.installedUsdPerKgDay < today.installedUsdPerKgDay / 5);
  assert.ok(lean.kWhPerKg < today.kWhPerKg);
  for (const d of [today, lean]) assert.ok(d.idiotIndex > 1);
  assert.ok(today.idiotIndex > lean.idiotIndex);
  // Fixed costs dominate small plants: $/kg-day falls with plant size.
  const curve = D.scaleCurve(D.PRESETS.lean.params, [25e3, 1e5, 1e6]);
  assert.ok(curve[0].usdPerKgDay > curve[1].usdPerKgDay && curve[1].usdPerKgDay > curve[2].usdPerKgDay);
  // Only the sun-following preset claims to be flexible.
  assert.equal(lean.flexible, false);
  assert.equal(D.design(D.PRESETS.sunFollowing.params).flexible, true);
});

test('the override lowers H₂-DRI cost in the company simulator and leaves other pathways alone', () => {
  const input = config => ({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config });
  const rank = config => C.rankOpportunities(input(config), { sizeMultiple: 100 });
  const o = D.simulatorOverride(D.PRESETS.lean.params);
  const d = D.design(D.PRESETS.lean.params);
  close(o['hydrogen-dri'].capexFactor, d.installedUsdPerKgDay / d.recipeUsdPerKgDay, 1e-12);
  close(o['hydrogen-dri'].energyFactor, d.kWhPerKg / D.RECIPE.steel.kWhPerKg, 1e-12);
  const recipe = rank({});
  const designed = rank({ designs: { units: o } });
  const heatStore = rank({ designs: { units: o }, utilization: D.utilizationPatch(D.PRESETS.lean.params) });
  const lcop = (rows, id) => rows.find(r => r.pathwayId === id).lcopUsdPerKg;
  for (const id of ['h2-dri', 'green-h2-dri']) {
    assert.ok(lcop(designed, id) < lcop(recipe, id) - 0.05, `${id}: ${lcop(designed, id)} vs ${lcop(recipe, id)}`);
    // Firming the shaft's heat with a PV-charged heat store instead of batteries is cheaper still.
    assert.ok(lcop(heatStore, id) < lcop(designed, id), `${id} heat store`);
  }
  // Energy per kg of h2-dri (the shaft is all of its electricity) follows the design's kWh/kg.
  const e = id => designed.find(r => r.pathwayId === id).energyKWhPerKg / recipe.find(r => r.pathwayId === id).energyKWhPerKg;
  assert.ok(Math.abs(e('h2-dri') - o['hydrogen-dri'].energyFactor) < 0.02, `energy ratio ${e('h2-dri')}`);
  // A pathway without the unit is untouched.
  close(lcop(designed, 'green-hydrogen'), lcop(recipe, 'green-hydrogen'), 1e-9);
  close(lcop(designed, 'green-ammonia'), lcop(recipe, 'green-ammonia'), 1e-9);
});
