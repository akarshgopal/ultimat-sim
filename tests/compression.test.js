const assert = require('node:assert/strict');
const test = require('node:test');
const Company = require('../engine/company.js');
const PlantDesign = require('../engine/plant-design.js');
const { companyData, VIEW_TEST, withApp } = require('./helpers.js');

const input = companyData();
const design = f => require(`../engine/designs/${f}.js`);
const preset = (f, name) => design(f).simulatorOverride({ ...(design(f).PRESETS[name]?.params || {}) });
const leanElec = preset('electrolyzer', 'lean');
const consumersLean = { ...preset('haber-bosch', 'lean'), ...preset('synthesis', 'lean'), ...preset('dri-shaft', 'lean') };
const size = id => 100 * input.pathways.find(p => p.id === id).refOutputKgPerDay;
const at = (config, id, site = 'chile-mejillones') => Company.evaluateAtYear({ ...input, config }, id, site, size(id), 0);
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
const sum = (xs, f) => xs.reduce((t, x) => t + f(x), 0);

test('the electrolyzer design reports where its H₂ leaves', () => {
  assert.equal(leanElec.electrolyzer.outletP_bar, 1.05, 'lean: atmospheric');
  const pressurized = Object.entries(design('electrolyzer').PRESETS).find(([, p]) => p.params?.pressure === 'pressurized');
  assert.ok(pressurized, 'a pressurized preset exists');
  assert.equal(preset('electrolyzer', pressurized[0]).electrolyzer.outletP_bar, 30);
});

test('nothing is priced while H₂ arrives at the recipes’ 30 bar basis', () => {
  const ranks = Company.rankOpportunities(input, { sizeMultiple: 100 });
  for (const r of ranks) {
    const ev = Company.evaluateAtYear(input, r.pathwayId, r.siteId, r.sizeKgPerDay, 0);
    assert.equal(ev.compression, null, r.pathwayId);
    assert.ok(!Object.keys(ev.unitCapexUsd).some(k => k.startsWith('compression:')), r.pathwayId);
  }
});

test('an atmospheric electrolyzer feeding a recipe consumer pays for 1.05 → 30 bar compression', () => {
  const config = { designs: { units: { ...leanElec } } };
  const ev = at(config, 'green-ft');
  const off = at({ ...config, compression: { enabled: false } }, 'green-ft');
  const c = ev.compression;
  assert.ok(c, 'priced');
  assert.deepEqual(c.consumers.map(x => x.consumer), ['ft-liquids']);
  // Multistage intercooled compression on an isothermal basis at 40 °C, 70% efficient.
  const expected = 8.314 * 313.15 / 2.016 * Math.log(30 / 1.05) / 0.7 / 3600;
  assert.ok(Math.abs(c.kWhPerKgH2 - expected) < 1e-12, `${c.kWhPerKgH2} kWh/kg H₂`);
  assert.ok(c.kWhPerKgH2 > 1.5 && c.kWhPerKgH2 < 2, 'about 1.7 kWh/kg H₂');
  const kgH2PerKg = sum(c.consumers, x => x.kgH2PerKg);
  assert.ok(rel(c.energyKWhPerYear, c.kWhPerKgH2 * kgH2PerKg * ev.annualKg) < 1e-12);
  assert.ok(rel(c.usd, sum(Object.entries(ev.unitCapexUsd).filter(([k]) => k.startsWith('compression:')), ([, v]) => v)) < 1e-12);
  assert.ok(ev.capex.total > off.capex.total && ev.lcopUsdPerKg > off.lcopUsdPerKg);
  // Its electricity is reported as energy, not other O&M; the breakdown still adds up.
  assert.ok(Math.abs(ev.costBreakdownUsdPerKg.other - off.costBreakdownUsdPerKg.other) < 1e-9);
  const b = ev.costBreakdownUsdPerKg;
  assert.ok(Math.abs(b.energy + b.equipment + b.feedstock + b.other - ev.grossCostUsdPerKg) < 1e-9);
  // Units (compressors included) still sum to the plant's equipment classes.
  const own = sum(Object.values(ev.unitCapexUsd), x => x);
  const cls = sum(Object.entries(ev.capex.byTech).filter(([k]) => k !== 'storage'), ([, v]) => v);
  assert.ok(rel(own, cls) < 1e-9);
  // A sun-following electrolyzer's compressor is sized for its nameplate.
  if (ev.utilization.strategy === 'sun-following') {
    const kW24 = kgH2PerKg * size('green-ft') / 24 * c.kWhPerKgH2;
    assert.ok(rel(c.shaftKW, kW24 * ev.utilization.flexNameplateFactor) < 1e-9);
  }
});

test('consumers with engineered designs price their own compression: not counted twice', () => {
  const both = { designs: { units: { ...leanElec, ...consumersLean } } };
  for (const id of ['green-ammonia', 'green-mto', 'green-h2-dri']) {
    const onlyElec = at({ designs: { units: { ...leanElec } } }, id, input.pathways.find(p => p.id === id).refSiteId || 'chile-mejillones');
    assert.ok(onlyElec.compression, `${id}: priced when its consumer is a recipe unit`);
    assert.equal(at(both, id, input.pathways.find(p => p.id === id).refSiteId || 'chile-mejillones').compression, null, `${id}: its design compresses`);
  }
  // FT has no engineered design: still priced with every lean design on.
  assert.ok(at(both, 'green-ft').compression);
});

test('the plant design shows the atmospheric supply and itemizes the priced compressor exactly', () => {
  const inp = { ...input, config: { designs: { units: { ...leanElec } } } };
  const { ev, pkg } = PlantDesign.forPlant(Company, inp, 'green-ft', 'chile-mejillones', size('green-ft'));
  const h2 = pkg.streams.filter(s => s.composition[0]?.[0] === 'H2' && pkg.equipment.find(e => e.nodeId === s.from)?.unit === 'electrolyzer');
  assert.ok(h2.length && h2.every(s => s.P_bar === 1.05), 'electrolyzer H₂ at 1.05 bar');
  const k = pkg.machines.find(m => m.priced);
  assert.ok(k && k.kind === 'compressor' && k.fromBar === 1.05);
  const item = pkg.tea.capexItems.find(i => i.compressionFor);
  assert.equal(item.tag, k.tag);
  assert.ok(rel(item.usd, ev.compression.usd) < 1e-12);
  assert.ok(rel(sum(pkg.tea.capexItems, i => i.usd), ev.capex.total) < 1e-9);
  assert.ok(rel(sum(pkg.tea.opexLines, l => l.usd), ev.opex.total) < 1e-9);
  assert.ok(rel(sum(pkg.tea.lcop, l => l.usdPerKg), ev.lcopUsdPerKg) < 1e-9);
  assert.ok(pkg.tea.opexLines.some(l => /compression electricity/.test(l.label)));
});

test('the app passes the actual H₂ supply pressure to the consumer designs', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(`${base}#/designs`);
  await page.waitForFunction(() => globalThis.Store);
  const r = await page.evaluate(() => {
    const cfg = ds => Store.toConfig({ ...Store.defaults(), ds }).designs.units;
    const lean = { preset: 'lean', overrides: {} };
    const pressurized = Object.entries(FoundryDesigns.electrolyzer.PRESETS).find(([, p]) => p.params?.pressure === 'pressurized')[0];
    return {
      atm: cfg({ electrolyzer: lean, synthesis: lean }),
      press: cfg({ electrolyzer: { preset: pressurized, overrides: {} }, synthesis: lean }),
      recipe: cfg({ synthesis: lean }),
      userSet: cfg({ electrolyzer: { preset: pressurized, overrides: {} }, synthesis: { preset: 'lean', overrides: { h2SupplyBar: 1.05 } } }),
      direct30: FoundryDesigns.synthesis.simulatorOverride({ ...FoundryDesigns.synthesis.PRESETS.lean.params, h2SupplyBar: 30 }).methanol.energyFactor,
      direct1: FoundryDesigns.synthesis.simulatorOverride({ ...FoundryDesigns.synthesis.PRESETS.lean.params, h2SupplyBar: 1.05 }).methanol.energyFactor,
    };
  });
  assert.equal(r.atm.electrolyzer.outletP_bar, 1.05);
  assert.equal(r.press.electrolyzer.outletP_bar, 30);
  assert.ok(Math.abs(r.atm.methanol.energyFactor - r.direct1) < 1e-12, 'atmospheric stack: synthesis compresses from 1.05 bar');
  assert.ok(Math.abs(r.press.methanol.energyFactor - r.direct30) < 1e-12, 'pressurized stack: from 30 bar');
  assert.ok(Math.abs(r.recipe.methanol.energyFactor - r.direct30) < 1e-12, 'recipe electrolyzer: from 30 bar');
  assert.ok(Math.abs(r.userSet.methanol.energyFactor - r.direct1) < 1e-12, 'a supply pressure the user set stays');
  assert.ok(r.press.methanol.energyFactor < r.atm.methanol.energyFactor, 'less compression from a pressurized stack');
  assert.deepEqual(errors, []);
}));
