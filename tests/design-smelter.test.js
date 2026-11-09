const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../engine/designs/smelter.js');
const { close, rank, companyData } = require('./helpers.js');

const PATHWAYS = companyData().pathways;
const node = id => PATHWAYS.find(p => p.id === id).flowsheet.nodes.find(n => n.unit === 'aluminium-smelter');
const alEdge = id => PATHWAYS.find(p => p.id === id).flowsheet.edges.find(e => e.from === 'aluminium-smelter' && e.substances?.[0]?.[0] === 'Al');

test('recipe basis, a potline that is firmed, and the scoreboard plant size', () => {
  // Recipe basis: the 'aluminium' pathway node, and the same unit per kg Al inside 'silicon'.
  assert.equal(node('aluminium').capexUsdPerKgDay, D.RECIPE['aluminium-smelter'].usdPerKgDay);
  assert.equal(node('aluminium').kWhPerKg, D.RECIPE['aluminium-smelter'].kWhPerKg);
  const si = alEdge('silicon').kgPerKg;
  assert.ok(Math.abs(node('silicon').capexUsdPerKgDay / si / D.RECIPE['aluminium-smelter'].usdPerKgDay - 1) < 0.02);
  assert.ok(Math.abs(node('silicon').kWhPerKg / si / D.RECIPE['aluminium-smelter'].kWhPerKg - 1) < 0.02);
  const d = D.design();
  assert.equal(d.flexible, false);
  const o = D.simulatorOverride(D.PRESETS.lean.params)['aluminium-smelter'];
  assert.equal(o.flexible, false, 'a potline is firmed, never stopped');
  assert.ok(o.minTurndown > 0 && o.minTurndown < 1);
  // Compared like with like at the scoreboard plant size (100 × the 10 t/day reference).
  close(d.recipeUsdPerKgDay, D.recipeAtSize(1e6), 1e-12);
  close(D.recipeAtSize(1e6), D.RECIPE['aluminium-smelter'].usdPerKgDay * 100 ** -0.15, 1e-12);
});

test('cell physics: thermoneutral floor, voltage, current efficiency and a closed heat balance', () => {
  // ΔH of Al₂O₃ + 1.5 C → 2 Al + 1.5 CO₂ (cold feed, products at 960 °C) ≈ 6.3–6.4 kWh/kg; O₂ anode ≈ 9.3.
  assert.ok(D.THERMO_MIN_KWH_PER_KG.carbon > 6.2 && D.THERMO_MIN_KWH_PER_KG.carbon < 6.5);
  assert.ok(D.THERMO_MIN_KWH_PER_KG.inert > 9.1 && D.THERMO_MIN_KWH_PER_KG.inert < 9.5);
  close(D.KWH_PER_KG_PER_V, 2.98, 1e-3);
  const today = D.design(D.PRESETS.today.params);
  const nom = today.envelope.nominal;
  assert.ok(nom.vPot + nom.vBus > 4.0 && nom.vPot + nom.vBus < 4.4, `cell ${nom.vPot + nom.vBus} V`);
  assert.ok(nom.ce > 0.93 && nom.ce < 0.97);
  // Heat generated = losses at the design point; side walls carry ~30–40%, top ~45%.
  const cell = D.cellModel(D.PRESETS.today.params);
  close(cell.gen(1, cell.acdNom, D.DEFAULTS.superheatNomK), cell.window.lossNom, 1e-12);
  assert.ok(today.heat.sideShare > 0.25 && today.heat.sideShare < 0.45);
  for (const params of Object.values(D.PRESETS).map(x => x.params)) {
    const d = D.design(params);
    assert.ok(d.kWhPerKg > d.thermoMinKWhPerKg * 1.5, `${d.kWhPerKg} vs ΔH`);
    assert.ok(d.envelope.xNight <= 1 && d.envelope.xPeak >= 1);
  }
  // Raising the anodes to make heat at night costs kWh/kg.
  assert.ok(today.kWhNight > today.kWhNominal);
  assert.ok(today.envelope.night.acd > today.envelope.nominal.acd);
});

test('modulation: deeper turndown needs more heat-balance hardware, and the ledge only buys hours', () => {
  const base = D.PRESETS.lean.params;
  const floor = hx => D.design({ ...base, ...hx }).envelope;
  const natural = floor({ shellHx: 'natural' });
  const enpot = floor({ shellHx: 'enpot' });
  const deep = floor({ shellHx: 'deep', draftMin: 0.6, draftMax: 1.8, boostTarget: 1.4 });
  assert.ok(natural.xMin > enpot.xMin && enpot.xMin > deep.xMin, `${natural.xMin} ${enpot.xMin} ${deep.xMin}`);
  assert.ok(natural.xMaxPhysical < enpot.xMaxPhysical && enpot.xMaxPhysical < deep.xMaxPhysical);
  // More hardware costs more per pot.
  const usdPerPot = params => { const d = D.design({ ...base, ...params }); return d.installedUsd / d.nPots; };
  assert.ok(usdPerPot({ shellHx: 'deep', draftMin: 0.6, draftMax: 1.8 }) > usdPerPot({ shellHx: 'enpot' }));
  assert.ok(usdPerPot({ shellHx: 'enpot' }) > usdPerPot({ shellHx: 'natural' }));
  // Even deep-modulation pots cannot sit at half load through a night: the ledge buffers a few hours.
  assert.ok(deep.xMin > 0.5, 'no steady half-load night');
  const h = x => D.holdHours(base, x);
  assert.equal(h(0.95), Infinity);
  assert.ok(h(0.5) < h(0.6) && h(0.6) < 16, `hold ${h(0.5)} h at 50%, ${h(0.6)} h at 60%`);
  // The ledge as a daily latent-heat store widens the steady window.
  assert.ok(enpot.xMin < enpot.xMinSteady && enpot.xMaxPhysical > enpot.xMaxSteady);
  // Physics is stricter than the engine's generic baseload default for a conventional potline.
  assert.ok(D.design(D.PRESETS.today.params).minTurndown > D.ENGINE_BASELOAD_TURNDOWN);
  // Low current density: fewer kWh, more pot, and less room to modulate once insulation binds.
  const lo = D.design({ ...base, anodeCurrentDensity: 0.6 });
  const hi = D.design({ ...base, anodeCurrentDensity: 0.9 });
  assert.ok(lo.kWhPerKg < hi.kWhPerKg && lo.installedUsdPerKgDay > hi.installedUsdPerKgDay);
  assert.ok(lo.envelope.thermallyLimited && lo.envelope.xMin > hi.envelope.xMin);
});

test('presets: today lands near the recipe, lean is cheaper, leaner in kWh and closer to its materials', () => {
  const today = D.design(D.PRESETS.today.params);
  const lean = D.design(D.PRESETS.lean.params);
  assert.ok(Math.abs(today.vsRecipe.capexFactor - 1) < 0.15, `today capex ×${today.vsRecipe.capexFactor}`);
  assert.ok(Math.abs(today.vsRecipe.energyFactor - 1) < 0.05, `today energy ×${today.vsRecipe.energyFactor}`);
  assert.ok(lean.installedUsdPerKgDay < today.installedUsdPerKgDay / 2);
  assert.ok(lean.kWhPerKg < today.kWhPerKg - 0.8);
  assert.ok(lean.idiotIndex > 1 && today.idiotIndex > lean.idiotIndex);
  assert.ok(lean.minTurndown < today.minTurndown);
  // Boost: the lean line is rated above its nominal current, so fewer pots make the same peak tonnage.
  assert.ok(lean.envelope.xPeak > 1.2 && lean.nPots < today.nPots);
});

test('the override lowers aluminium cost in the company simulator and leaves other pathways alone', () => {
  const lcop = (rows, id) => rows.filter(r => r.pathwayId === id).reduce((m, r) => Math.min(m, r.lcopUsdPerKg), Infinity);
  const o = D.simulatorOverride(D.PRESETS.lean.params);
  const recipe = rank({});
  const designed = rank({ designs: { units: o } });
  assert.ok(lcop(designed, 'aluminium') < lcop(recipe, 'aluminium') - 0.2, `${lcop(designed, 'aluminium')} vs ${lcop(recipe, 'aluminium')}`);
  assert.ok(lcop(designed, 'silicon') < lcop(recipe, 'silicon'));
  // Energy per kg falls with the design's kWh/kg.
  const e = rows => rows.find(r => r.pathwayId === 'aluminium').energyKWhPerKg;
  assert.ok(e(designed) < e(recipe));
  close(lcop(designed, 'green-ammonia'), lcop(recipe, 'green-ammonia'), 1e-9);
  close(lcop(designed, 'green-hydrogen'), lcop(recipe, 'green-hydrogen'), 1e-9);
  // The physical 'today' potline is no cheaper than the recipe: it cannot turn down as far as the
  // engine's generic 0.7 assumes.
  const today = rank({ designs: { units: D.simulatorOverride(D.PRESETS.today.params) } });
  assert.ok(lcop(today, 'aluminium') >= lcop(recipe, 'aluminium') - 0.02);
});
