const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../engine/company.js');
const { companyData, cheapPv } = require('./helpers.js');

const board = config => C.abundanceScoreboard({ ...companyData(), config });

test('abundance scoreboard: every world market once, tonnage adds up, blockers explain blocked tonnage', () => {
  const s = board({});
  const products = s.rows.map(r => r.product);
  assert.equal(new Set(products).size, products.length);
  assert.ok(!products.includes('ndpr-oxide-separated'), 'grouped markets are scored under their group');
  const t = s.totals;
  assert.ok(Math.abs(t.feasibleT + t.blockedT + t.uncoveredT - t.worldDemandT) < 1);
  assert.ok(t.abundantT <= t.feasibleT);
  for (const r of s.rows.filter(x => x.lcopUsdPerKg !== undefined)) {
    // The cost items are the whole gross cost per kg, split, largest first.
    const items = r.costItems.reduce((a, i) => a + i.usdPerKg, 0);
    const gross = Object.values(r.costBreakdownUsdPerKg).reduce((a, v) => a + v, 0);
    assert.ok(Math.abs(items - gross) < 1e-6 * Math.max(1, gross), `${r.product}: ${items} vs ${gross}`);
    assert.equal(r.blocker, r.costItems[0]);
    assert.equal(r.status === 'feasible' || r.status === 'abundant', r.npv >= 0);
  }
  const blockedT = s.blockers.reduce((a, b) => a + b.worldDemandT, 0);
  assert.ok(Math.abs(blockedT - t.blockedT) < 1);
  // Urea made from bought ammonia is held back by the ammonia, not by the urea reactor.
  assert.equal(s.rows.find(r => r.product === 'urea').blocker.kind, 'feed');
});

test('cheaper electricity and a lean electrolyzer make more of the world\'s tonnage feasible', () => {
  const today = board({});
  const pv = cheapPv();
  const cheap = board({ pv });
  const lean = board({ pv, designs: { units: { electrolyzer: { capexFactor: 0.03, energyFactor: 1 } } } });
  assert.ok(cheap.totals.feasibleT >= today.totals.feasibleT);
  assert.ok(lean.totals.feasibleT > today.totals.feasibleT);
  assert.ok(lean.totals.feasibleT >= cheap.totals.feasibleT);
  const h2 = b => b.rows.find(r => r.product === 'hydrogen');
  assert.ok(h2(lean).lcopUsdPerKg < h2(cheap).lcopUsdPerKg);
});
