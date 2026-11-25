const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../engine/company.js');
const { companyData, cheapPv, close } = require('./helpers.js');
const { MARKETS } = require('../data/markets.js');

const board = config => C.abundanceScoreboard({ ...companyData(), config });

test('abundance scoreboard: every world market once, tonnage adds up, blockers explain blocked tonnage', () => {
  const s = board({});
  const keys = s.rows.map(r => r.key);
  assert.equal(new Set(keys).size, keys.length);
  const products = s.rows.map(r => r.product);
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
    // A price-ladder tier is judged at its own price; other markets by NPV at today's price.
    if (r.tier) assert.equal(r.status === 'feasible' || r.status === 'abundant', r.costRatio <= 1);
    else assert.equal(r.status === 'feasible' || r.status === 'abundant', r.npv >= 0);
  }
  const blockedT = s.blockers.reduce((a, b) => a + b.worldDemandT, 0);
  assert.ok(Math.abs(blockedT - t.blockedT) < 1);
  // Urea made from bought ammonia is held back by the ammonia, not by the urea reactor.
  assert.equal(s.rows.find(r => r.product === 'urea').blocker.kind, 'feed');
});

test('a laddered market is scored tier by tier and sells at its marginal buyer\'s price', () => {
  const s = board({});
  const tiers = s.rows.filter(r => r.product === 'methane');
  const ladder = MARKETS.methane.priceLadder;
  assert.equal(tiers.length, ladder.length);
  const demand = tiers.reduce((a, r) => a + r.worldDemandT, 0);
  close(demand, C.marketDemandT(MARKETS.methane, C.DEFAULTS.startYear), 1e-9);
  // Same plant, so a tier is feasible exactly when its price covers the cost.
  for (const r of tiers) assert.equal(r.status !== 'blocked', r.lcopUsdPerKg <= r.priceUsdPerKg);
  // The company walks down the ladder as its share grows.
  const cfg = C.mergeConfig({});
  close(C.realizedPrice(cfg, MARKETS.methane, null, 0), ladder[0].usdPerKg);
  close(C.realizedPrice(cfg, MARKETS.methane, null, ladder[0].share + ladder[1].share / 2), ladder[1].usdPerKg);
  close(C.realizedPrice(cfg, MARKETS.methane, null, 0.5), ladder[ladder.length - 1].usdPerKg);
  close(C.realizedPrice(cfg, MARKETS.methane, null, 2), ladder[ladder.length - 1].usdPerKg);
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

test('coproduct credit counts only what the coproduct’s world market can absorb', () => {
  const SITES = require('../data/sites.js').SITES;
  const pathway = {
    id: 'twin', name: 'Twin', product: 'widget', refSiteId: SITES[0].id, refOutputKgPerDay: 1000,
    electricityKWhPerKg: 1, heatKWhPerKg: 0, feeds: [], capexByTechUsdPerKgDay: { process: 50 },
    fixedOmFracPerYear: 0.03, variableOmUsdPerKg: 0, assetLifeYears: 25,
    coproducts: [{ id: 'gizmo', product: 'gizmo', kgPerKg: 4, usdPerKg: 1 }],
  };
  const market = (t, price) => ({ worldDemandTPerYear: t, demandYear: 2027, growthPerYear: 0, priceUsdPerKg: price, priceElasticity: 0 });
  const score = gizmoT => C.abundanceScoreboard({ pathways: [pathway], sites: SITES,
    markets: { widget: market(1e6, 1), gizmo: market(gizmoT, 1) } }).rows.find(r => r.product === 'widget');
  // Making 1 Mt of widget yields 4 Mt of gizmo: a 4 Mt gizmo market takes all of it, a 1 Mt market a quarter.
  const all = score(4e6);
  const quarter = score(1e6);
  close(quarter.lcopUsdPerKg - all.lcopUsdPerKg, 3, 1e-6); // $3/kg of credit on 3 kg/kg that cannot be sold
  assert.ok(all.lcopUsdPerKg < 0, 'with room for its coproduct the plant is paid to make widgets');
});
