const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../engine/utilization.js');
const C = require('../engine/company.js');
const { PATHWAYS } = require('../data/pathways.js');
const { MARKETS } = require('../data/markets.js');
const { SITES } = require('../data/sites.js');

const cfg = U.mergeCfg();
const site = id => SITES.find(s => s.id === id);
const pathway = id => PATHWAYS.find(p => p.id === id);
const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('day length: 12 h at the equator, long summer days at high latitude', () => {
  close(U.dayLengthHours(0, 172), 12, 1e-6);
  assert.ok(U.dayLengthHours(50, 172) > 15.5 && U.dayLengthHours(50, 172) < 16.8);
  assert.ok(U.dayLengthHours(50, 355) < 8.5);
  assert.ok(U.dayLengthHours(-50, 355) > 15.5, 'southern summer in December');
});

test('typical days reproduce the site\'s monthly and annual PVGIS energy', () => {
  const mej = site('chile-mejillones');
  const solar = U.siteSolar(mej, cfg);
  solar.months.forEach((m, i) => {
    const energy = m.profile.reduce((a, b) => a + b, 0) * (24 / m.profile.length);
    close(energy, mej.pvMonthlyKWhPerKWpDay[i], 1e-9);
  });
  close(solar.annualKWhPerKWp / 365, mej.pvKWhPerKWpDay, 0.01);
});

test('flexible block: nameplate factor = 24 h / full-load hours, and cheaper equipment means more oversizing', () => {
  const solar = U.siteSolar(site('chile-mejillones'), cfg);
  const energy = 1e9; // kWh/yr
  const pricey = U.flexDesign(solar, energy, 5e9, 1000);
  const cheap = U.flexDesign(solar, energy, 5e7, 1000);
  for (const d of [pricey, cheap]) close(d.nameplateFactor, 24 / d.fullLoadHoursPerDay, 1e-9);
  assert.ok(pricey.nameplateFactor > 1.5, 'solar-only equipment is oversized vs a 24 h basis');
  assert.ok(cheap.nameplateFactor > pricey.nameplateFactor);
  assert.ok(cheap.pvKWp < pricey.pvKWp, 'cheap equipment clips less solar, so needs less PV');
});

test('baseload block: stored through the night, never below the turndown floor', () => {
  const solar = U.siteSolar(site('chile-mejillones'), cfg);
  const store = usd => ({ ...cfg.battery, usdPerKWh: usd });
  const designs = [0.001, 100, 300, 5000].map(usd => U.baseDesign(solar, 1000, 1e6, 1000, store(usd)));
  for (const d of designs) {
    assert.ok(d.storeKWh > 10 * 1000, 'about a night of storage per kW of steady load');
    assert.ok(d.outputFactor >= cfg.baseloadMinTurndown && d.outputFactor <= 1);
  }
  // Dearer storage never buys more output.
  for (let i = 1; i < designs.length; i += 1) assert.ok(designs[i].outputFactor <= designs[i - 1].outputFactor + 1e-12);
  // Dear PV and dear equipment push towards full output.
  const firm = U.baseDesign(solar, 1000, 1e9, 1000, store(300));
  assert.ok(firm.outputFactor > 0.97);
  // Without the turndown floor the optimizer would idle a "steady" plant at night.
  const noFloor = U.baseDesign(solar, 1000, 1e6, 1000, store(300), 0);
  assert.ok(noFloor.outputFactor < 0.5);
  assert.equal(U.baseDesign(solar, 0, 0, 1000, store(300)).outputFactor, 1);
});

test('plant designs: electrolysis follows the sun with an H₂ buffer; kilns are firmed on heat storage', () => {
  const mej = site('chile-mejillones');
  const design = id => {
    const p = pathway(id);
    const k24 = {};
    for (const [cls, v] of Object.entries(p.capexByTechUsdPerKgDay)) if (cls !== 'storage') k24[cls] = v * 1e5;
    return U.designPlant(U.operatingProfile(p, cfg), mej, 1e5, { pvUsdPerKWp: 1000, capex24ByClass: k24 }, cfg);
  };
  const h2 = design('green-hydrogen');
  assert.equal(h2.strategy, 'sun-following');
  assert.equal(h2.outputFactor, 1);
  assert.ok(h2.flexFullLoadHoursPerDay > 5 && h2.flexFullLoadHoursPerDay < 12);
  assert.equal(h2.batteryKWh, 0);
  const nh3 = design('green-ammonia');
  assert.equal(nh3.strategy, 'sun-following');
  assert.ok(nh3.buffers.some(b => b.substance === 'H2' && b.kg > 0), 'H₂ buffered into Haber-Bosch');
  const cement = design('cement');
  assert.equal(cement.strategy, 'firmed');
  assert.ok(cement.thermalKWh > 0);
  assert.equal(cement.batteryKWh, 0, 'kiln heat is stored as heat, not in batteries');
});

function bestYear0(id, config = {}) {
  return C.rankOpportunities({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config }, { sizeMultiple: 100 })
    .find(r => r.pathwayId === id);
}

test('validation: solar-only green H₂ and NH₃ costs land in published bands at 2027 costs', () => {
  // IEA Global Hydrogen Review 2024: renewable (solar PV) electrolytic H₂ roughly $4–9/kg today.
  const h2 = bestYear0('green-hydrogen');
  assert.ok(h2.lcopUsdPerKg > 4 && h2.lcopUsdPerKg < 9, `green H₂ $${h2.lcopUsdPerKg.toFixed(2)}/kg`);
  // IRENA Innovation Outlook: Renewable Ammonia (2022): ~$720–1,400/t; band widened 25% for our
  // $1,000/kWp PV starting point.
  const nh3 = bestYear0('green-ammonia');
  assert.ok(nh3.lcopUsdPerKg > 0.54 && nh3.lcopUsdPerKg < 1.75, `green NH₃ $${nh3.lcopUsdPerKg.toFixed(2)}/kg`);
});

test('utilization raises solar-only costs versus the old 24 h costing, and is reported per plant', () => {
  for (const id of ['green-hydrogen', 'green-ammonia', 'cement', 'silicon']) {
    const on = bestYear0(id);
    const off = bestYear0(id, { utilization: { enabled: false } });
    assert.ok(on.grossCostUsdPerKg > off.grossCostUsdPerKg, id);
    assert.ok(on.utilization && on.utilization.outputFactor <= 1 && on.utilization.outputFactor > 0.5, id);
    assert.ok(on.annualKg <= on.sizeKgPerDay * 365 + 1e-6, id);
    assert.equal(off.utilization, null);
  }
});

test('recipes without a flowsheet keep the 24 h costing', () => {
  const legacy = { ...pathway('cement'), id: 'legacy', flowsheet: undefined };
  assert.equal(U.operatingProfile(legacy, cfg), null);
});
