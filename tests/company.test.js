const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../engine/company.js');

const { close } = require('./helpers.js');

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
const hungry = { ...good, id: 'hungry', electricityKWhPerKg: 20 }; // energy-heavy enough to have a break-even

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
  // PV O&M holds the configured O&M/capex ratio ($20 per $758 of capex), so it scales with PV price.
  const opex = 1e5 * 0.03 + pvKWp * 1000 * (20 / 758) + 365000 * 0.01;
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
  const result = run({ finance: { initialEquityUsd: 2e6 } });
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

// Make-vs-buy fixtures: a consumer that buys 0.5 kg "h2" per kg, and a supplier recipe for h2.
const consumer = {
  ...good, id: 'consumer', product: 'widget',
  feeds: [{ id: 'hydrogen-feed', kgPerKg: 0.5, usdPerKg: 2, freightUsdPerKg: 0, origin: 'intermediate', purchased: true }],
};
const cheapH2 = {
  ...good, id: 'cheap-h2', product: 'hydrogen', electricityKWhPerKg: 1,
  feeds: [{ id: 'sw', kgPerKg: 10, origin: 'ocean', purchased: false }],
  coproducts: [{ id: 'oxygen', product: 'oxygen', kgPerKg: 8, usdPerKg: 0.01 }],
  capexByTechUsdPerKgDay: { electrolyzer: 50 },
};
const dearH2 = { ...cheapH2, id: 'dear-h2', capexByTechUsdPerKgDay: { electrolyzer: 1e6 } };
const H2_MARKETS = {
  ...MARKETS,
  hydrogen: { worldDemandTPerYear: 1e6, demandYear: 2027, growthPerYear: 0, priceUsdPerKg: 2, priceElasticity: 0.5 },
  oxygen: { worldDemandTPerYear: 1e9, demandYear: 2027, growthPerYear: 0, priceUsdPerKg: 0.01, priceElasticity: 0.5 },
};

function rankOne(pathways, config) {
  return C.rankOpportunities({ pathways, sites: SITES, markets: H2_MARKETS, config }).find(r => r.pathwayId === 'consumer');
}

test('make-vs-buy: a cheap same-site supplier replaces the purchased intermediate', () => {
  const bought = rankOne([consumer], {});
  const made = rankOne([consumer, cheapH2], {});
  assert.equal(bought.integration.length, 0);
  assert.equal(made.integration.length, 1);
  const item = made.integration[0];
  assert.equal(item.supplierId, 'cheap-h2');
  assert.equal(item.product, 'hydrogen');
  close(item.kgPerDay, 0.5 * made.sizeKgPerDay);
  assert.ok(item.makeUsdPerKg < item.buyUsdPerKg);
  assert.equal(made.siteId, 'coast', 'ocean-fed supplier forces a coastal site');
  // Supplier capex, PV and opex join the plant; its O2 is sold; the H2 itself is never sold.
  assert.ok(made.capex.byTech.electrolyzer > 0);
  assert.ok(made.sales.some(s => s.product === 'oxygen'));
  assert.ok(!made.sales.some(s => s.product === 'hydrogen'));
  assert.ok(!made.feedsKgPerYear.some(f => f.id === 'hydrogen-feed'));
  assert.ok(made.lcopUsdPerKg < bought.lcopUsdPerKg);
});

test('make-vs-buy: an expensive supplier, or integration disabled, keeps buying', () => {
  assert.equal(rankOne([consumer, dearH2], {}).integration.length, 0);
  assert.equal(rankOne([consumer, cheapH2], { integration: { enabled: false } }).integration.length, 0);
});

test('simulation records captive supply and keeps it out of the intermediate market', () => {
  const result = C.simulateCompany({
    pathways: [consumer, cheapH2], sites: SITES, markets: H2_MARKETS,
    config: { years: 12, build: { maxMarketShare: 0.05 } },
  });
  const integrated = result.plants.filter(p => p.integration.length);
  assert.ok(integrated.length > 0);
  const last = result.timeline.at(-1);
  assert.ok(last.captiveTByProduct.hydrogen > 0);
  const captiveT = integrated.filter(p => p.onlineYear <= last.year)
    .reduce((sum, p) => sum + p.integration[0].kgPerDay * 365 / 1000, 0);
  close(last.captiveTByProduct.hydrogen, captiveT);
  // Any H2 sold comes from merchant H2 plants, never from captive units.
  const merchantT = result.plants.filter(p => p.pathwayId === 'cheap-h2' && p.onlineYear <= last.year)
    .reduce((sum, p) => sum + p.sizeKgPerDay * 365 / 1000, 0);
  close(last.outputTByProduct.hydrogen || 0, merchantT);
});

test('retired plants free their market share for new builds', () => {
  const shortLived = { ...good, assetLifeYears: 3 };
  const result = C.simulateCompany({
    pathways: [shortLived], sites: SITES, markets: MARKETS,
    config: { years: 12, build: { maxMarketShare: 0.01, leadTimeYears: 0 }, finance: { initialEquityUsd: 1e9 } },
  });
  const builtAfterRetirement = result.plants.filter(p => p.builtYear >= 2027 + 3);
  assert.ok(builtAfterRetirement.length > 0, 'capacity is rebuilt once the first plants retire');
  for (const year of result.timeline) assert.ok((year.shareByProduct.widget || 0) <= 0.01 + 1e-9);
});

test('infinite-sources-only builds the consumer only when it makes its intermediate in-house', () => {
  const base = { pathways: [consumer], sites: SITES, markets: H2_MARKETS };
  const without = C.simulateCompany({ ...base, config: { years: 6, build: { infiniteSourcesOnly: true } } });
  assert.equal(without.plants.length, 0, 'buys H2 → not buildable');
  const withDear = C.simulateCompany({
    ...base, pathways: [consumer, dearH2],
    config: { years: 6, build: { infiniteSourcesOnly: true, allowPathways: ['consumer', 'dear-h2'] } },
  });
  // Forced make-not-buy uses even an expensive supplier; whether it pays is then NPV's call.
  const ranked = C.rankOpportunities({ ...base, pathways: [consumer, dearH2], config: { build: { infiniteSourcesOnly: true } } })
    .find(r => r.pathwayId === 'consumer');
  assert.equal(ranked.integration.length, 1);
  assert.deepEqual(ranked.purchasedIntermediates, []);
  assert.ok(withDear.plants.every(p => p.pathwayId !== 'consumer' || p.integration.length === 1));
});

test('abundance objective trades a little NPV for much more material, but not a lot of NPV', () => {
  // Bulk makes 10× the material per kg (a by-product aggregate); specialty earns more per plant.
  const sites = [{ id: 'inland', name: 'Inland', coastal: false, pvKWhPerKWpDay: 6, landUsdPerHa: 1000 }];
  const bulk = {
    ...good, id: 'bulk', product: 'widget', capexByTechUsdPerKgDay: { process: 20 },
    coproducts: [{ id: 'aggregate', product: 'aggregate', kgPerKg: 9, usdPerKg: 0 }],
  };
  const specialty = { ...good, id: 'specialty', product: 'gadget', electricityKWhPerKg: 0.1, capexByTechUsdPerKgDay: { process: 200 } };
  const firstBuild = (objective, gadgetPrice) => {
    const markets = {
      widget: { ...MARKETS.widget, priceUsdPerKg: 0.2, worldDemandTPerYear: 1e9 },
      gadget: { ...MARKETS.gadget, priceUsdPerKg: gadgetPrice, worldDemandTPerYear: 1e9 },
      aggregate: { priceUsdPerKg: 0, worldDemandTPerYear: 1e12 }, // only material with a market counts
    };
    const r = C.simulateCompany({
      pathways: [bulk, specialty], sites, markets,
      config: { objective, abundanceScore: 'absolute', years: 1, build: { maxPlantsPerYear: 1, sizeMultiples: [1000] }, finance: { initialEquityUsd: 1e10 } },
    });
    assert.equal(r.summary.objective, objective);
    assert.ok(r.plants.every(p => p.npvAtBuildUsd >= 0), 'every plant pays back its capital');
    return r.plants[0].pathwayId;
  };
  // Small NPV gap: profit takes specialty, abundance takes 10× the tonnes.
  assert.equal(firstBuild('profit', 0.2), 'specialty');
  assert.equal(firstBuild('abundance', 0.2), 'bulk');
  // Large NPV gap: the specialty surplus funds more material than bulk makes, so abundance agrees.
  assert.equal(firstBuild('abundance', 0.25), 'specialty');
});

test('material totals and price relief are reported per year', () => {
  const r = run();
  const last = r.timeline.at(-1);
  close(last.materialTPerYear, Object.values(last.outputTByProduct).reduce((a, b) => a + b, 0));
  close(r.summary.cumulativeMaterialT, r.timeline.reduce((sum, y) => sum + y.materialTPerYear, 0));
  const relief = last.priceReliefByMarket.widget;
  close(relief, 1 - last.priceByProduct.widget / MARKETS.widget.priceUsdPerKg);
  assert.ok(relief > 0 && relief < 1);
});

test('solar $/kWh and PV capex convert both ways; O&M moves with capex', () => {
  const pv = C.DEFAULTS.pv;
  const fin = C.DEFAULTS.finance;
  const usd = C.solarLcoe(pv, fin);
  // IRENA 2023 $758/kW at 2,000 kWh/kWp·yr and an 8%/25-yr CRF ≈ 4.5¢/kWh.
  assert.ok(usd > 0.04 && usd < 0.05, String(usd));
  close(C.pvCapexFromLcoe(usd, pv, fin), pv.capexUsdPerKWp, 1e-12);
  close(C.solarLcoe(pv, fin, pv.capexUsdPerKWp / 10), usd / 10, 1e-12);
  // A sunnier site (3,000 kWh/kWp·yr) pays less per kWh for the same PV.
  close(C.solarLcoe(pv, fin, pv.capexUsdPerKWp, 3000), usd * 2000 / 3000, 1e-12);
});

test('equipment multiplier scales non-storage equipment capex only', () => {
  const rank = equip => C.rankOpportunities({ pathways: [good], sites: SITES, markets: MARKETS, config: { equipmentCostMultiplier: equip } })[0];
  const full = rank(1);
  const tenth = rank(0.1);
  close(tenth.capex.process, full.capex.process * 0.1, 1e-9);
  close(tenth.capex.pv, full.capex.pv, 1e-12);
  assert.ok(tenth.lcopUsdPerKg < full.lcopUsdPerKg);
});

test('energy break-evens: cheaper equipment raises the price a pathway can pay; NPV crosses zero there', () => {
  const at = equip => new Map(C.energyBreakevens({ pathways: [hungry, bad], sites: SITES, markets: MARKETS, config: { equipmentCostMultiplier: equip } }).map(r => [r.pathwayId, r]));
  const one = at(1);
  assert.equal(one.get('bad').limitedBy, 'not-energy', 'a $1M/(kg/day) plant cannot be saved by free electricity');
  const h = one.get('hungry');
  assert.equal(h.limitedBy, 'energy');
  assert.ok(at(0.1).get('hungry').breakevenUsdPerKWh > h.breakevenUsdPerKWh);
  // Just above the break-even price the best site's NPV is negative.
  const above = C.energyBreakevens({ pathways: [hungry], sites: SITES, markets: MARKETS, config: { pv: { capexUsdPerKWp: C.pvCapexFromLcoe(h.breakevenUsdPerKWh * 1.05, C.DEFAULTS.pv, C.DEFAULTS.finance) } } })[0];
  assert.ok(above.today.npv < 0);
});

test('idiot-index squeeze caps each class at materials floor × target, never raises a price', () => {
  const floors = {
    pv: { materialsUsdPerUnit: 150 },
    battery: { materialsUsdPerUnit: 40 },
    thermalStore: { materialsUsdPerUnit: 5 },
    h2Storage: { materialsUsdPerUnit: 60 },
    process: { floorFraction: 0.05 },
    electrolyzer: { floorFraction: 0.1 },
  };
  const cfgFor = target => C.mergeConfig({ idiotIndex: { target, floors } });
  close(C.squashUsd(cfgFor(2), 'pv', 758), 300);
  close(C.squashUsd(cfgFor(10), 'pv', 758), 758, 1e-12); // floor × target above today's price: no change
  close(C.squashUsd(cfgFor(null), 'pv', 758), 758);
  close(C.squashFactor(cfgFor(2), 'process', 1), 0.1);
  close(C.squashFactor(cfgFor(2), 'process', 0.05), 0.05); // learning already below the cap
  close(C.squashFactor(cfgFor(2), 'dac', 1), 1); // no floor for this class: untouched

  // In a run: PV, battery and equipment prices all fall, and plants get cheaper.
  const rank = target => C.rankOpportunities({ pathways: [good], sites: SITES, markets: MARKETS, config: { idiotIndex: { target, floors } } })[0];
  const today = rank(null);
  const squashed = rank(1.5);
  close(squashed.capex.pv / squashed.pvKWp, 150 * 1.5, 1e-9);
  close(squashed.capex.process, today.capex.process * 0.05 * 1.5, 1e-9);
  assert.ok(squashed.lcopUsdPerKg < today.lcopUsdPerKg);
});

test('energy break-evens scan electricity price even when PV margins are squeezed', () => {
  const floors = { pv: { materialsUsdPerUnit: 100 }, process: { floorFraction: 0.05 } };
  const rows = idiot => C.energyBreakevens({ pathways: [hungry], sites: SITES, markets: MARKETS, config: { idiotIndex: { target: idiot, floors } } })[0];
  const plain = rows(null);
  const squeezed = rows(1.5);
  // Cheaper equipment (process squeezed) raises the price the pathway can afford; PV is not capped
  // in the scan, so the result is a real price, not "any".
  assert.equal(plain.limitedBy, 'energy');
  assert.equal(squeezed.limitedBy, 'energy');
  assert.ok(squeezed.breakevenUsdPerKWh > plain.breakevenUsdPerKWh);
});

test('construction capacity: capex per year never exceeds it, and it grows from last year\'s build', () => {
  const r = run({ build: { initialBuildUsdPerYear: 2e5, buildGrowthPerYear: 0.5 }, finance: { initialEquityUsd: 1e9 } });
  let capacity = 2e5;
  for (const y of r.timeline) {
    close(y.buildCapacityUsd, capacity, 1e-9);
    assert.ok(y.capexUsd <= capacity + 1e-6, `${y.year}: ${y.capexUsd} > ${capacity}`);
    capacity = Math.max(2e5, y.capexUsd * 1.5);
  }
  const unlimited = run({ build: { initialBuildUsdPerYear: Infinity }, finance: { initialEquityUsd: 1e9 } });
  assert.ok(unlimited.timeline[0].capexUsd > r.timeline[0].capexUsd);
});

test('Terraform loop: the company\'s own supply lowers commodity prices and so the materials floors', () => {
  const cfg = C.mergeConfig({
    idiotIndex: {
      target: 2,
      bom: { commodities: { steel: 1, silver: 1000 }, classes: { pv: { lines: [{ material: 'steel', kgPerUnit: 10 }, { material: 'silver', kgPerUnit: 0.01 }], absolute: true } } },
      commodityMarkets: { steel: { market: 'widget', weight: 1 } },
    },
  });
  const none = C.liveFloors(cfg, {});
  close(none.floors.pv.materialsUsdPerUnit, 20);
  const half = C.liveFloors(cfg, { widget: 0.5 });
  close(half.commodityFactors.steel, 0.5);
  close(half.floors.pv.materialsUsdPerUnit, 15); // steel halves, silver (no market link) does not
});

test('resource-weighted abundance favours solar-efficient plants when site solar is the scarce resource', () => {
  // Heavy: energy-hungry, valuable. Light: little energy per kg, thin margin. Site solar is tight.
  const heavy = { ...good, id: 'heavy', product: 'gadget', electricityKWhPerKg: 20, capexByTechUsdPerKgDay: { process: 50 } };
  const light = { ...good, id: 'light', product: 'widget', electricityKWhPerKg: 0.5, capexByTechUsdPerKgDay: { process: 50 } };
  const markets = {
    widget: { ...MARKETS.widget, priceUsdPerKg: 0.3, worldDemandTPerYear: 1e9 },
    gadget: { ...MARKETS.gadget, priceUsdPerKg: 6, worldDemandTPerYear: 1e9 },
  };
  const runWith = abundanceScore => C.simulateCompany({
    pathways: [heavy, light], sites: SITES, markets,
    config: { abundanceScore, years: 10, build: { maxPvGWpPerSite: 0.05, initialBuildUsdPerYear: Infinity }, finance: { initialEquityUsd: 1e10 } },
  }).summary.cumulativeMaterialT;
  assert.ok(runWith('resource-weighted') > runWith('absolute'));
});
