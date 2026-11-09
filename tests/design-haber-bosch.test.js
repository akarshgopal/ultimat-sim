const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../engine/designs/haber-bosch.js');
const { within, rank, lcop, cheapPv } = require('./helpers.js');

test('thermodynamics: equilibrium constant, NH₃ vapour pressure and equilibrium trends', () => {
  within(H.equilibriumK(723.15), 6.6e-3, 0.05); // Gillespie–Beattie at 450 °C
  within(H.nh3VapourBar(298.15), 10.0, 0.03); // NH₃ boils at ~10 bar at 25 °C
  within(H.nh3VapourBar(239.8), 1.013, 0.03); // and at 1 atm near −33 °C
  assert.ok(H.equilibriumNH3(200, 723.15) > H.equilibriumNH3(100, 723.15), 'more pressure → more NH₃');
  assert.ok(H.equilibriumNH3(150, 673.15) > H.equilibriumNH3(150, 723.15), 'cooler outlet → more NH₃');
});

test('physical monotonicity: pressure → compressor kWh and wall thickness; colder separator → less recycle', () => {
  const at = P => H.design({ loopPressureBar: P, flexible: false });
  const lo = at(80);
  const hi = at(200);
  assert.ok(hi.energyKWhPerKg.makeupCompression > lo.energyKWhPerKg.makeupCompression);
  assert.ok(hi.loop.converterWallMm > lo.loop.converterWallMm);
  assert.ok(hi.loop.recycleMolPerMolNH3 < lo.loop.recycleMolPerMolNH3, 'higher pressure → higher conversion per pass');
  assert.ok(lo.energyKWhPerKg.refrigeration > hi.energyKWhPerKg.refrigeration, 'low pressure condenses less NH₃ with air alone');
  assert.ok(H.design({ separatorC: -30 }).loop.recycleMolPerMolNH3 < H.design({ separatorC: 0 }).loop.recycleMolPerMolNH3);
  // Pressure-vessel steel per kg of gas stored is ~independent of pressure (V ∝ 1/P, wall ∝ P).
  const v50 = H.vessel(1 / 50, 50, { minWallMm: 0, corrosionAllowanceMm: 0 });
  const v200 = H.vessel(1 / 200, 200, { minWallMm: 0, corrosionAllowanceMm: 0 });
  within(v50.kg, v200.kg, 0.1);
  // A design too low in pressure for its separator is flagged, not NaN.
  assert.equal(H.design({ catalyst: 'fe', loopPressureBar: 30, separatorC: -5 }).feasible, false);
});

test('presets: today lands near the recipe basis; the lean target is far cheaper and nearer its materials', () => {
  const today = H.design(H.PRESETS.today.params);
  const lean = H.design(H.PRESETS.lean.params);
  assert.equal(today.plantKgPerDay, H.RECIPE.ammonia.refKgPerDay);
  const recipeUsd = H.RECIPE.ammonia.usdPerKgDay + H.RECIPE.asu.usdPerKgDay;
  const ratio = today.installedUsdPerKgDay / recipeUsd;
  assert.ok(ratio > 0.6 && ratio < 1.4, `today ${today.installedUsdPerKgDay} vs recipe ${recipeUsd}`);
  const e = today.byUnit.ammonia.kWhPerKg / H.RECIPE.ammonia.kWhPerKg;
  assert.ok(e > 0.6 && e < 1.6, `today loop energy factor ${e}`);
  assert.ok(lean.installedUsdPerKgDay < today.installedUsdPerKgDay / 5);
  for (const d of [today, lean]) assert.ok(d.idiotIndex > 1);
  assert.ok(lean.idiotIndex < today.idiotIndex);
  assert.equal(lean.flexible, true);
  assert.equal(today.flexible, false);
  // Bigger plants are cheaper per kg/day.
  assert.ok(H.design({ ...H.PRESETS.lean.params, plantKgPerDay: 100000 }).installedUsdPerKgDay < lean.installedUsdPerKgDay);
});

test('the override re-prices ammonia and ASU in every recipe that has them, and nothing else', () => {
  const o = H.simulatorOverride(H.PRESETS.lean.params);
  const d = H.design(H.PRESETS.lean.params);
  within(o.ammonia.capexFactor, d.byUnit.ammonia.installedUsdPerKgDay / H.RECIPE.ammonia.usdPerKgDay, 1e-12);
  const recipe = rank({});
  const designed = rank({ designs: { units: o } });
  assert.ok(lcop(designed, 'green-ammonia') < lcop(recipe, 'green-ammonia'));
  assert.ok(lcop(designed, 'green-urea') < lcop(recipe, 'green-urea'));
  within(lcop(designed, 'green-hydrogen'), lcop(recipe, 'green-hydrogen'), 1e-9);
});

test('sun-following: wins for the lean loop at 10× cheaper PV, loses for today’s loop', () => {
  const nh3 = units => rank({ pv: cheapPv(), designs: { units } }).find(r => r.pathwayId === 'green-ammonia');
  const lcopAs = (preset, flexible) => nh3(H.simulatorOverride({ ...H.PRESETS[preset].params, flexible })).lcopUsdPerKg;
  assert.ok(lcopAs('lean', true) < lcopAs('lean', false));
  assert.ok(lcopAs('today', false) < lcopAs('today', true));
  // Flexible means no battery and no H₂ buffer for the loop; baseload keeps both.
  assert.equal(nh3(H.simulatorOverride(H.PRESETS.lean.params)).utilization.bufferUsd, 0);
});
