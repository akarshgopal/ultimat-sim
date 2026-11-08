const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../engine/company.js');

const close = (actual, expected, rel = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= rel * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
};

const SITES = [
  { id: 'coast', name: 'Coast', coastal: true, brineAssayId: 'b1', pvKWhPerKWpDay: 5, landUsdPerHa: 1000 },
  { id: 'inland', name: 'Inland', coastal: false, brineAssayId: null, pvKWhPerKWpDay: 6, landUsdPerHa: 1000 },
  { id: 'salar', name: 'Salar', coastal: false, brineAssayId: 'b1', pvKWhPerKWpDay: 5.5, landUsdPerHa: 1000 },
];

const good = {
  id: 'good', name: 'Good', product: 'widget', refSiteId: 'inland', refOutputKgPerDay: 1000,
  electricityKWhPerKg: 1, heatKWhPerKg: 0,
  feeds: [{ id: 'rock', kgPerKg: 1, usdPerKg: 0.01, freightUsdPerKg: 0, origin: 'crust', purchased: true }],
  coproducts: [],
  capexByTechUsdPerKgDay: { process: 100 },
  fixedOmFracPerYear: 0.03, variableOmUsdPerKg: 0, assetLifeYears: 25,
};
const bad = { ...good, id: 'bad', product: 'gadget', capexByTechUsdPerKgDay: { process: 1e6 } };
const ocean = { ...good, id: 'ocean', product: 'salt', feeds: [{ id: 'sw', kgPerKg: 30, origin: 'ocean', purchased: false }] };
const brine = { ...good, id: 'brine', product: 'li', refSiteId: 'salar', feeds: [{ id: 'br', kgPerKg: 1000, origin: 'brine', purchased: false }] };

const MARKETS = {
  widget: { worldDemandTPerYear: 1e6, demandYear: 2027, growthPerYear: 0, priceUsdPerKg: 1, priceElasticity: 0.5 },
  gadget: { worldDemandTPerYear: 1e6, demandYear: 2027, growthPerYear: 0, priceUsdPerKg: 1, priceElasticity: 0.5 },
  salt: { worldDemandTPerYear: 1e6, demandYear: 2027, growthPerYear: 0, priceUsdPerKg: 1, priceElasticity: 0.5 },
  li: { worldDemandTPerYear: 1e6, demandYear: 2027, growthPerYear: 0, priceUsdPerKg: 1, priceElasticity: 0.5 },
};

test('Wright learning: 20% learning rate gives 0.8 per doubling over the seed', () => {
  const cfg = { exogenousDeclinePerYear: 0, learningRate: 0.2, seedUsd: 100, floorFraction: 0 };
  close(C.techCostFactor(cfg, 0, 0), 1);
  close(C.techCostFactor(cfg, 0, 100), 0.8);
  close(C.techCostFactor(cfg, 0, 300), 0.64);
  close(C.techCostFactor({ ...cfg, floorFraction: 0.7 }, 0, 300), 0.7);
  close(C.techCostFactor({ ...cfg, learningRate: 0, exogenousDeclinePerYear: 0.1 }, 2, 0), 0.81);
});

test('scale factor follows size^(exponent-1) with a floor and never exceeds 1', () => {
  const cfg = { exponent: 0.8, floorFactor: 0.3 };
  close(C.scaleFactor(cfg, 1000, 1000), 1);
  close(C.scaleFactor(cfg, 32000, 1000), 32 ** -0.2);
  close(C.scaleFactor(cfg, 1e12, 1000), 0.3);
  close(C.scaleFactor(cfg, 10, 1000), 1);
});

test('evaluatePlant reproduces hand-computed plant economics', () => {
  const cfg = C.mergeConfig({ finance: { discountRate: 0.08 }, build: { leadTimeYears: 0 } });
  const ctx = {
    cfg,
    costFactors: Object.fromEntries(C.TECH_CLASSES.map(cls => [cls, 1])),
    pvUsdPerKWp: 1000,
    priceFor: (product, fallback) => (product ? 1 : fallback || 0),
  };
  const ev = C.evaluatePlant(good, SITES[1], 1000, ctx);
  const pvKWp = 1000 / 6;
  close(ev.pvKWp, pvKWp);
  close(ev.capex.process, 100 * 1000);
  close(ev.capex.pv, pvKWp * 1000);
  close(ev.capex.land, pvKWp * 0.0016 * 1000);
  const opex = 1e5 * 0.03 + pvKWp * 20 + 365000 * 0.01;
  close(ev.opex.total, opex);
  close(ev.revenue, 365000);
  const af = C.annuityFactor(0.08, 25);
  close(ev.npv, -ev.capex.total + (365000 - opex) * af);
  close(ev.lcopUsdPerKg, (ev.capex.total / af + opex) / 365000);
});

test('realized price falls linearly with market share and is floored', () => {
  const cfg = C.mergeConfig();
  close(C.realizedPrice(cfg, MARKETS.widget, null, 0), 1);
  close(C.realizedPrice(cfg, MARKETS.widget, null, 0.2), 0.9);
  close(C.realizedPrice(cfg, MARKETS.widget, null, 100), cfg.minPriceFraction);
  close(C.realizedPrice(cfg, null, 0.3, 0.5), 0.3);
});

test('site compatibility: ocean needs a coast, brine needs the reference brine', () => {
  const byId = new Map(SITES.map(s => [s.id, s]));
  assert.deepEqual(SITES.filter(s => C.siteAllowsPathway(s, ocean, byId)).map(s => s.id), ['coast']);
  assert.deepEqual(SITES.filter(s => C.siteAllowsPathway(s, brine, byId)).map(s => s.id), ['coast', 'salar']);
  assert.deepEqual(SITES.filter(s => C.siteAllowsPathway(s, good, byId)).map(s => s.id), ['coast', 'inland', 'salar']);
});

function run(config = {}, pathways = [good, bad]) {
  return C.simulateCompany({ pathways, sites: SITES, markets: MARKETS, config: { startYear: 2027, years: 15, ...config } });
}

test('company builds profitable plants, never unprofitable ones, and grows', () => {
  const result = run();
  assert.ok(result.plants.length > 0);
  assert.ok(result.plants.every(p => p.pathwayId === 'good'));
  const t = result.timeline;
  assert.ok(t[t.length - 1].revenueUsd > t[1].revenueUsd);
  assert.ok(result.summary.equityMultiple > 1);
});

test('cash accounting identity holds every year', () => {
  const result = run({ finance: { debtFraction: 0.4, equityRaises: [{ year: 2030, usd: 5e6 }] } });
  let cash = result.config.finance.initialEquityUsd;
  for (const year of result.timeline) {
    cash += year.equityRaisedUsd + year.operatingCashUsd - year.debtServiceUsd - (year.capexUsd - year.debtRaisedUsd);
    close(year.cashUsd, cash, 1e-9);
    assert.ok(year.cashUsd >= -1e-6, `cash went negative in ${year.year}`);
  }
});

test('market share ceiling caps output per product', () => {
  const result = run({ build: { maxMarketShare: 0.02 }, finance: { initialEquityUsd: 1e9 } });
  for (const year of result.timeline) {
    const share = year.shareByProduct.widget || 0;
    assert.ok(share <= 0.02 + 1e-9, `share ${share} in ${year.year}`);
  }
  assert.ok(result.timeline.at(-1).shareByProduct.widget > 0.015);
});

test('lead time delays output and learning lowers later plant cost', () => {
  const result = run({ build: { leadTimeYears: 2 } });
  const first = result.plants[0];
  assert.equal(first.onlineYear, first.builtYear + 2);
  assert.equal(result.timeline[0].revenueUsd, 0);
  assert.equal(result.timeline[1].revenueUsd, 0);
  const factors = result.timeline.map(y => y.costFactors.process);
  assert.ok(factors.at(-1) < factors[0]);
});

test('simulation is deterministic', () => {
  assert.deepEqual(run(), run());
});

test('rankOpportunities picks the cheapest compatible site per pathway', () => {
  const rows = C.rankOpportunities({ pathways: [good, ocean, brine], sites: SITES, markets: MARKETS });
  const byId = Object.fromEntries(rows.map(r => [r.pathwayId, r]));
  assert.equal(byId.good.siteId, 'inland'); // best sun
  assert.equal(byId.ocean.siteId, 'coast');
  assert.equal(byId.brine.siteId, 'salar');
});

test('buildSites reads presets and frozen PVGIS yields from the repo data', () => {
  const sites = C.buildSites({ sitePresets: require('../data/site-presets.js'), pvgisSites: require('../data/pvgis-sites.js') });
  assert.ok(sites.length >= 30);
  const mej = sites.find(s => s.id === 'chile-mejillones');
  assert.ok(mej.coastal);
  close(mej.pvKWhPerKWpDay, 1923.52 / 365, 1e-3);
});

test('inland brine hubs host only brine recipes', () => {
  const hub = { id: 'hub', name: 'Hub', kind: 'brine-hub', coastal: false, brineAssayId: 'b1', pvKWhPerKWpDay: 7, landUsdPerHa: 1 };
  const sites = [...SITES, hub];
  const byId = new Map(sites.map(s => [s.id, s]));
  assert.equal(C.siteAllowsPathway(hub, good, byId), false);
  assert.equal(C.siteAllowsPathway(hub, brine, byId), true);
  const result = C.simulateCompany({ pathways: [good], sites, markets: MARKETS, config: { years: 8 } });
  assert.ok(result.plants.length > 0);
  assert.ok(result.plants.every(p => p.siteId !== 'hub'));
});

test('per-site PV ceiling spreads plants across sites', () => {
  const capGWp = 0.002;
  const result = run({ build: { maxPvGWpPerSite: capGWp }, finance: { initialEquityUsd: 1e9 } });
  const bySite = {};
  for (const p of result.plants) bySite[p.siteId] = (bySite[p.siteId] || 0) + p.pvKWp;
  for (const kWp of Object.values(bySite)) assert.ok(kWp <= capGWp * 1e6 + 1e-6);
  assert.ok(Object.keys(bySite).length >= 2);
});

test('products in one market group share one demand ceiling', () => {
  const twin = { ...good, id: 'twin', product: 'widget-sep' };
  const markets = { ...MARKETS, 'widget-sep': { ...MARKETS.widget } };
  const config = {
    years: 15,
    marketGroups: { 'widget-sep': 'widget' },
    build: { maxMarketShare: 0.02 },
    finance: { initialEquityUsd: 1e9 },
  };
  const result = C.simulateCompany({ pathways: [good, twin], sites: SITES, markets, config });
  for (const year of result.timeline) {
    const t = (year.outputTByProduct.widget || 0) + (year.outputTByProduct['widget-sep'] || 0);
    assert.ok(t <= 0.02 * 1e6 + 1e-6, `${year.year}: ${t} t`);
  }
  assert.equal(C.marketGroupOf('ndpr-oxide-separated'), 'ndpr-oxide');
});

test('coproducts are held to the market-share ceiling too', () => {
  const withCo = { ...good, id: 'withco', coproducts: [{ id: 'gadget', product: 'gadget', kgPerKg: 5, usdPerKg: 1 }] };
  const result = C.simulateCompany({
    pathways: [withCo], sites: SITES, markets: MARKETS,
    config: { years: 15, build: { maxMarketShare: 0.02 }, finance: { initialEquityUsd: 1e9 } },
  });
  assert.ok(result.plants.length > 0);
  for (const year of result.timeline) assert.ok((year.shareByProduct.gadget || 0) <= 0.02 + 1e-9);
});

test('cost per kg reports gross, coproduct credit and net consistently; shares are per market', () => {
  const withCo = { ...good, id: 'withco', coproducts: [{ id: 'gadget', product: 'gadget', kgPerKg: 5, usdPerKg: 1 }] };
  const [row] = C.rankOpportunities({ pathways: [withCo], sites: SITES, markets: MARKETS });
  close(row.lcopUsdPerKg, row.grossCostUsdPerKg - row.coproductCreditUsdPerKg);
  assert.ok(row.coproductCreditUsdPerKg > 4.9);
  const twin = { ...good, id: 'twin', product: 'widget-sep' };
  const markets = { ...MARKETS, 'widget-sep': { ...MARKETS.widget } };
  const result = C.simulateCompany({ pathways: [good, twin], sites: SITES, markets, config: { years: 10, marketGroups: { 'widget-sep': 'widget' } } });
  const last = result.timeline.at(-1);
  assert.ok(!('widget-sep' in last.shareByMarket));
  close(last.shareByMarket.widget, last.shareByProduct.widget);
  assert.ok(last.demandTByMarket.widget > 0);
});
