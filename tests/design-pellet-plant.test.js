const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../engine/designs/pellet-plant.js');
const Dri = require('../engine/designs/dri-shaft.js');
const C = require('../engine/company.js');
const { close, rank, lcop, companyData } = require('./helpers.js');

const PATHWAYS = companyData().pathways;

test('the recipe basis is the pellet-plant node on both DRI pathways; the plant is firmed', () => {
  for (const id of ['h2-dri', 'green-h2-dri']) {
    const node = PATHWAYS.find(p => p.id === id).flowsheet.nodes.find(n => n.unit === 'pellet-plant');
    assert.ok(node, `${id} has a pellet plant`);
    assert.equal(node.capexUsdPerKgDay, D.RECIPE['pellet-plant'].usdPerKgDay);
    assert.equal(node.kWhPerKg, D.RECIPE['pellet-plant'].kWhPerKg);
    close(node.variableOmUsdPerKg, D.RECIPE['pellet-plant'].variableOmUsdPerKgPellet / D.DEFAULTS.pelletFeFraction, 1e-2);
  }
  assert.equal(D.design().flexible, false);
});

test('heat balance: magnetite oxidation, recuperation and drying move induration heat the right way', () => {
  close(D.OXIDATION_MJ_PER_KG_FE2O3, 0.492, 5e-3);
  const heat = params => D.design(params).balance.netMJ;
  assert.ok(heat({ magnetiteFraction: 0 }) > heat({ magnetiteFraction: 1 }), 'hematite feed needs more firing heat');
  assert.ok(heat({ coolerRecuperation: 0.6 }) > heat({ coolerRecuperation: 0.9 }));
  assert.ok(heat({ moistureFrac: 0.1 }) > heat({ moistureFrac: 0.07 }));
  assert.ok(heat({ dryingFromShaftWaste: 0 }) > heat({ dryingFromShaftWaste: 0.5 }));
  // Today's gas-fired plant sits in the published straight-grate band for magnetite (~0.3–0.6 GJ/t).
  const today = D.design(D.PRESETS.today.params).balance.netMJ;
  assert.ok(today > 0.3 && today < 0.6, `today ${today} GJ/t`);
  // Gas burners lose more of the heat than electric air heaters.
  assert.ok(D.design({ heatSource: 'gas-burner' }).kWhPerKg > D.design().kWhPerKg);
});

test('presets: today costs more than the scaled recipe at 100 t/day, lean beats it; fixed costs dominate small plants', () => {
  const today = D.design(D.PRESETS.today.params);
  const lean = D.design(D.PRESETS.lean.params);
  close(today.recipeUsdPerKgDay, D.recipeAtSize(today.params.plantKgFePerDay), 1e-12);
  // The recipe pack is world-scale ($117/t-yr Port Saguenay) scaled down by the engine; a 55 kt/yr
  // plant built today-style costs more, but world-scale today-style lands on the cited peer band.
  assert.ok(today.vsRecipe.capexFactor > 1 && today.vsRecipe.capexFactor < 5, `today ×${today.vsRecipe.capexFactor}`);
  const worldScale = D.design({ ...D.PRESETS.today.params, plantKgFePerDay: 6e6 });
  assert.ok(worldScale.installedUsdPerTonneYear > 60 && worldScale.installedUsdPerTonneYear < 160, `$${worldScale.installedUsdPerTonneYear}/t-yr`);
  assert.ok(Math.abs(today.vsRecipe.energyFactor - 1) < 0.3, `today energy ×${today.vsRecipe.energyFactor}`);
  assert.ok(lean.installedUsdPerKgDay < today.installedUsdPerKgDay / 3);
  assert.ok(lean.vsRecipe.capexFactor < 1 && lean.vsRecipe.energyFactor < 0.7);
  assert.ok(lean.idiotIndex > 1 && lean.idiotIndex < today.idiotIndex);
  const curve = D.scaleCurve(D.PRESETS.lean.params, [25e3, 1e5, 1e6]);
  assert.ok(curve[0].usdPerKgDay > curve[1].usdPerKgDay && curve[1].usdPerKgDay > curve[2].usdPerKgDay);
  // Organic binder costs more per tonne than bentonite but leaves no gangue.
  const organic = D.design({ binder: 'organic' });
  assert.ok(organic.variableOmUsdPerKgPellet > lean.variableOmUsdPerKgPellet);
  assert.ok(organic.balance.pelletGangueFrac < lean.balance.pelletGangueFrac);
});

test('the override lowers DRI cost in the company simulator and leaves other pathways alone', () => {
  const o = D.simulatorOverride(D.PRESETS.lean.params);
  const d = D.design(D.PRESETS.lean.params);
  close(o['pellet-plant'].capexFactor, d.installedUsdPerKgDay / d.recipeUsdPerKgDay, 1e-12);
  close(o['pellet-plant'].energyFactor, d.kWhPerKg / D.RECIPE['pellet-plant'].kWhPerKg, 1e-12);
  assert.equal(o['pellet-plant'].thermal, true);
  assert.equal(o['pellet-plant'].flexible, false);
  const recipe = rank({});
  const designed = rank({ designs: { units: o } });
  const todayDesign = rank({ designs: { units: D.simulatorOverride(D.PRESETS.today.params) } });
  for (const id of ['h2-dri', 'green-h2-dri']) {
    assert.ok(lcop(designed, id) < lcop(recipe, id) - 0.005, `${id}: ${lcop(designed, id)} vs ${lcop(recipe, id)}`);
    assert.ok(lcop(todayDesign, id) > lcop(recipe, id), `${id} today design is dearer than the scaled recipe`);
  }
  close(lcop(designed, 'green-hydrogen'), lcop(recipe, 'green-hydrogen'), 1e-9);
  close(lcop(designed, 'green-ammonia'), lcop(recipe, 'green-ammonia'), 1e-9);
});

test('scoreboard: concentrate, not the pellet plant, gates DRI once the shaft is lean', () => {
  const units = { ...Dri.simulatorOverride(Dri.PRESETS.lean.params), ...D.simulatorOverride(D.PRESETS.lean.params) };
  const sb = C.abundanceScoreboard({ ...companyData(), config: { designs: { units } } });
  const steel = sb.rows.find(r => r.product === 'steel');
  const item = id => steel.costItems.find(c => c.id === id)?.usdPerKg ?? 0;
  assert.equal(steel.costItems[0].id, 'iron-ore');
  assert.ok(item('iron-ore') > 5 * item('pellet-plant'));
});
