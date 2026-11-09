const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine/designs/electrolyzer.js');
const C = require('../engine/company.js');
const { PATHWAYS } = require('../data/pathways.js');
const { MARKETS } = require('../data/markets.js');
const { SITES } = require('../data/sites.js');

const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const site = SITES.find(s => s.id === 'chile-mejillones');

test('polarization fit reproduces its calibration points', () => {
  const p = E.design().params;
  close(E.cellVoltage(0.2, p), 1.75, 2e-3);
  close(E.cellVoltage(0.4, p), 1.85, 2e-3);
  close(E.cellVoltage(1.0, p), 2.10, 2e-3);
  assert.ok(E.cellVoltage(0.4, { ...p, separator: 'pps' }) > E.cellVoltage(0.4, p), 'a cheaper separator costs voltage');
});

test('electrochemistry and geometry follow from voltage and current density', () => {
  const d = E.design({ currentDensityAPerCm2: 0.5 });
  // kWh/kg = V · 2F / M_H2 / η_F / 3.6e6, then coupling losses.
  close(d.stackKWhPerKg, d.cellVoltage * 2 * 96485.33212 / 2.01588e-3 / 0.98 / 3.6e6, 1e-9);
  close(d.kWhPerKg, d.stackKWhPerKg / (1 - 0.05), 1e-9);
  close(d.activeM2PerKW, 0.1 / (d.cellVoltage * 0.5), 1e-12);
  assert.ok(E.design({ currentDensityAPerCm2: 1 }).activeM2PerKW < d.activeM2PerKW, 'higher j → less area per kW');
  close(d.installedUsdPerKgDay, d.installedUsdPerKW * d.stackKWhPerKg / 24, 1e-9);
});

test('presets: today is calibrated to ~$300–500/kW alkaline; the lean target is far cheaper but never below its materials', () => {
  const today = E.design(E.PRESETS.today.params);
  const lean = E.design(E.PRESETS.lean.params);
  assert.ok(today.installedUsdPerKW > 300 && today.installedUsdPerKW < 600, `today $${today.installedUsdPerKW}/kW`);
  assert.ok(lean.installedUsdPerKW < today.installedUsdPerKW / 3);
  for (const d of [today, lean]) assert.ok(d.idiotIndex > 1);
  assert.ok(today.idiotIndex > lean.idiotIndex);
});

test('the optimal current density rises as PV gets cheaper, and cheaper PV lowers $/kg', () => {
  const at = pv => E.optimizeCurrentDensity({}, site, { pvUsdPerKWp: pv }).best;
  const dear = at(758);
  const cheap = at(76);
  assert.ok(cheap.j > dear.j, `${cheap.j} vs ${dear.j}`);
  assert.ok(cheap.usdPerKg < dear.usdPerKg);
  const rectifier = E.lcoh({ coupling: 'rectifier' }, site, { pvUsdPerKWp: 76 }).usdPerKg;
  const direct = E.lcoh({}, site, { pvUsdPerKWp: 76 }).usdPerKg;
  assert.ok(rectifier > direct, 'a rectifier costs more than direct DC coupling');
});

test('a design overrides electrolyzer capex and kWh/kg in the company simulator', () => {
  const units = E.simulatorOverride(E.PRESETS.lean.params);
  const o = units.electrolyzer;
  close(o.capexFactor, E.design(E.PRESETS.lean.params).installedUsdPerKgDay / E.RECIPE_USD_PER_KG_DAY, 1e-12);
  const input = config => ({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config });
  const h2 = config => C.rankOpportunities(input(config), { sizeMultiple: 100 }).find(r => r.pathwayId === 'green-hydrogen');
  const recipe = h2({});
  const designed = h2({ designs: { units } });
  assert.ok(designed.lcopUsdPerKg < recipe.lcopUsdPerKg);
  // Energy per kg follows the design's kWh/kg (the electrolyzer dominates this recipe's energy).
  const ratio = designed.energyKWhPerKg / recipe.energyKWhPerKg;
  assert.ok(Math.abs(ratio - o.energyFactor) < 0.02, `energy ratio ${ratio} vs ${o.energyFactor}`);
  // The design is per unit: chlor-alkali cells share the cost class but are not re-priced.
  const salt = config => C.rankOpportunities(input(config), { sizeMultiple: 100 }).find(r => r.pathwayId === 'abundance-salt');
  close(salt({ designs: { units } }).lcopUsdPerKg, salt({}).lcopUsdPerKg, 1e-9);
});
