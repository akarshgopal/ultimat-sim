const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../engine/designs/urea.js');
const C = require('../engine/company.js');
const { PATHWAYS } = require('../data/pathways.js');
const { MARKETS } = require('../data/markets.js');
const { SITES } = require('../data/sites.js');

const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('module follows the design contract', () => {
  assert.equal(D.id, 'urea');
  assert.deepEqual([...D.units], ['urea']);
  assert.equal(D.product, 'urea');
  // The recipe basis is what data/pathways.js carries on both pathways that use the unit, and the
  // design is costed at the scoreboard's plant (100 × the pathways' reference output).
  for (const id of [D.RECIPE.urea.pathwayId, ...D.RECIPE.urea.alsoPathways]) {
    const pathway = PATHWAYS.find(p => p.id === id);
    const node = pathway.flowsheet.nodes.find(n => n.unit === 'urea');
    assert.equal(node.capexUsdPerKgDay, D.RECIPE.urea.usdPerKgDay);
    assert.equal(node.kWhPerKg, D.RECIPE.urea.kWhPerKg);
    assert.equal(node.variableOmUsdPerKg, D.RECIPE.urea.variableOmUsdPerKg);
    assert.equal(pathway.refOutputKgPerDay * D.SCOREBOARD_SIZE_MULTIPLE, D.DEFAULTS.plantKgPerDay);
  }
  assert.ok(D.PRESETS.today && D.PRESETS.lean);
  for (const c of D.CONTROLS) assert.ok(c.key in D.DEFAULTS, c.key);
  for (const params of Object.values(D.PRESETS).map(x => x.params)) {
    const d = D.design(params);
    for (const k of ['installedUsdPerKgDay', 'materialsUsdPerKgDay', 'idiotIndex', 'kWhPerKg']) assert.ok(Number.isFinite(d[k]) && d[k] > 0, k);
    assert.equal(typeof d.flexible, 'boolean');
    assert.ok(d.kpis.length >= 3 && d.kpis.length <= 6);
    // Parts add up to the installed cost and the materials floor.
    close(d.parts.reduce((s, x) => s + x.usd, 0), d.installedUsdPerKgDay, 1e-9);
    close(d.parts.reduce((s, x) => s + x.usdMaterials, 0), d.materialsUsdPerKgDay, 1e-9);
    assert.deepEqual(d.warnings, []);
  }
  const o = D.simulatorOverride(D.PRESETS.lean.params);
  assert.deepEqual(Object.keys(o), ['urea']);
  const u = o.urea;
  assert.ok(u.capexFactor > 0 && u.energyFactor > 0 && u.materialsFactor > 0 && u.materialsFactor < u.capexFactor);
  assert.ok(u.minTurndown > 0 && u.minTurndown < 1);
});

test('physics: stoichiometry, equilibrium, bubble pressure and the heat-driven recycle', () => {
  // 2 NH₃ + CO₂ → urea + H₂O, as the recipe edges feed it.
  const node = PATHWAYS.find(p => p.id === 'urea').flowsheet.edges;
  close(D.STOICH.nh3KgPerKg, node.find(e => e.from === 'ammonia-feed').kgPerKg, 2e-3);
  close(D.STOICH.co2KgPerKg, node.find(e => e.from === 'co2-feed').kgPerKg, 2e-3);
  close(D.STOICH.waterKgPerKg, 0.3, 2e-3);
  // Calibration points: CO₂-stripping reactor ~62% at N/C 3, H/C 0.5, 185 °C; ~75% at N/C 4, dry.
  assert.ok(Math.abs(D.equilibriumConversion(185, 3, 0.5) - 0.62) < 0.01);
  assert.ok(Math.abs(D.equilibriumConversion(185, 4, 0) - 0.75) < 0.01);
  // Excess NH₃ helps, water hurts, the endothermic dehydration favours heat.
  assert.ok(D.equilibriumConversion(185, 3.5, 0.5) > D.equilibriumConversion(185, 3, 0.5));
  assert.ok(D.equilibriumConversion(185, 3, 0.8) < D.equilibriumConversion(185, 3, 0.4));
  assert.ok(D.equilibriumConversion(195, 3, 0.5) > D.equilibriumConversion(175, 3, 0.5));
  // …but hotter liquid needs more pressure: below the bubble pressure CO₂ escapes the liquid.
  assert.ok(D.bubblePressureBar(195, 3) > D.bubblePressureBar(185, 3) && D.bubblePressureBar(185, 3.5) > D.bubblePressureBar(185, 3));
  const lowP = D.design({ pressureBar: 120 });
  assert.ok(lowP.synthesis.conversion < D.design().synthesis.conversion);
  assert.ok(lowP.warnings.some(w => /bubble/.test(w)));
  // There is a temperature optimum at fixed pressure (equilibrium up, liquid fraction down).
  const conv = T => D.design({ reactorC: T }).synthesis.conversion;
  assert.ok(conv(185) > conv(175) && conv(185) > conv(195));
  // Lower conversion means more carbamate to decompose: more heat per kg.
  const heat = params => D.balance(params).kJPerMol.hpStripper;
  assert.ok(heat({ residenceMin: 15 }) > heat({ residenceMin: 45 }));
  // Stripping at loop pressure recovers its heat as LP steam; a total-recycle plant cannot.
  const kwh = params => D.design({ ...D.PRESETS.heatStore.params, ...params }).kWhPerKg;
  assert.ok(kwh({ stripping: 'none' }) > kwh({ stripping: 'nh3' }) && kwh({ stripping: 'nh3' }) > kwh({ stripping: 'co2' }));
  // Recompressing surplus LP steam into the stripper cuts the energy; it never goes below the
  // electrical floor (CO₂ compression + pumps + finishing).
  const lean = D.design(D.PRESETS.lean.params);
  const store = D.design(D.PRESETS.heatStore.params);
  assert.ok(lean.kWhPerKg < store.kWhPerKg && lean.energy.mvr > 0 && store.energy.mvr === 0);
  assert.ok(lean.kWhPerKg > lean.energy.co2Compression + lean.energy.pumps + lean.energy.finishing);
  assert.ok(store.thermal && !lean.thermal, 'resistive heat is stored as heat; recompression is electricity');
});

test('presets: today lands near the recipe at the scoreboard size; lean is far cheaper', () => {
  const today = D.design(D.PRESETS.today.params);
  const lean = D.design(D.PRESETS.lean.params);
  close(today.recipeUsdPerKgDay, D.recipeAtSize(1e5), 1e-12);
  close(today.recipeUsdPerKgDay, D.RECIPE.urea.usdPerKgDay * 100 ** -0.15, 1e-9);
  assert.ok(Math.abs(today.vsRecipe.capexFactor - 1) < 0.15, `today capex ×${today.vsRecipe.capexFactor}`);
  assert.ok(Math.abs(today.vsRecipe.energyFactor - 1) < 0.25, `today energy ×${today.vsRecipe.energyFactor}`);
  assert.ok(Math.abs(today.vsRecipe.variableOmFactor - 1) < 0.25);
  assert.ok(lean.installedUsdPerKgDay < today.installedUsdPerKgDay / 4);
  assert.ok(lean.kWhPerKg < today.kWhPerKg);
  assert.ok(today.idiotIndex > lean.idiotIndex && lean.idiotIndex > 1);
  // Pastillation is cheaper than granulation or a prilling tower at 100 t/day.
  const fin = f => D.design({ finishing: f }).installedUsdPerKgDay;
  assert.ok(fin('pastillation') < fin('prilling') && fin('pastillation') < fin('granulation'));
  // Fixed costs dominate small plants: $/kg-day falls with size, and stays below the recipe.
  const curve = D.scaleCurve(D.PRESETS.lean.params, [1e4, 1e5, 1e6]);
  assert.ok(curve[0].usdPerKgDay > curve[1].usdPerKgDay && curve[1].usdPerKgDay > curve[2].usdPerKgDay);
  for (const r of curve) assert.ok(r.usdPerKgDay < r.recipeUsdPerKgDay);
  // Only the sun-following preset claims to be flexible; baseload presets carry a turndown.
  assert.equal(lean.flexible, false);
  assert.equal(D.design(D.PRESETS.sunFollowing.params).flexible, true);
  assert.ok(D.design(D.PRESETS.sunFollowing.params).energy.standby > 0);
  assert.ok(lean.minTurndown < today.minTurndown);
});

test('the override lowers urea and green-urea cost in the company simulator and leaves other pathways alone', () => {
  const input = config => ({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config });
  const rank = config => C.rankOpportunities(input(config), { sizeMultiple: 100 });
  const lcop = (rows, id) => rows.find(r => r.pathwayId === id).lcopUsdPerKg;
  const o = D.simulatorOverride(D.PRESETS.lean.params);
  const d = D.design(D.PRESETS.lean.params);
  close(o.urea.capexFactor, d.installedUsdPerKgDay / D.recipeAtSize(1e5), 1e-12);
  close(o.urea.energyFactor, d.kWhPerKg / D.RECIPE.urea.kWhPerKg, 1e-12);
  const recipe = rank({});
  const designed = rank({ designs: { units: o } });
  for (const id of ['urea', 'green-urea']) {
    assert.ok(lcop(designed, id) < lcop(recipe, id) - 0.1, `${id}: ${lcop(designed, id)} vs ${lcop(recipe, id)}`);
  }
  // The today preset re-prices the unit near the recipe.
  const today = rank({ designs: { units: D.simulatorOverride(D.PRESETS.today.params) } });
  assert.ok(Math.abs(lcop(today, 'urea') / lcop(recipe, 'urea') - 1) < 0.1);
  // Running the unit sun-following (≈ 3× nameplate) costs more than firming it at today's PV.
  const sun = rank({ designs: { units: D.simulatorOverride(D.PRESETS.sunFollowing.params) } });
  assert.ok(lcop(sun, 'urea') > lcop(designed, 'urea'));
  // Pathways without the unit are untouched.
  for (const id of ['green-ammonia', 'green-hydrogen']) close(lcop(designed, id), lcop(recipe, id), 1e-9);
});
