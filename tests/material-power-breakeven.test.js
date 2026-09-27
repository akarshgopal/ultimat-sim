const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const script = path.join(__dirname, '..', 'scripts', 'material-power-breakeven.mjs');

function loadScript() {
  return import(pathToFileURL(script).href);
}

function twoProductPlant() {
  return {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        {
          id: 'power',
          unit: 'electricity-source',
          economics: {
            unitCost: 0,
            installedCapex: 1000000,
            capexRate: 800,
            fixedOM: 50000,
          },
        },
        {
          id: 'dle',
          unit: 'brine-minerals',
          capacity: 1,
          economics: { installedCapex: 200000, fixedOMPercent: 4 },
        },
        {
          id: 'lithium',
          unit: 'material-sink',
          economics: { disposition: 'sale', unitPrice: 1, annualDemandLimit: 1e12 },
        },
        {
          id: 'bromine',
          unit: 'material-sink',
          economics: { disposition: 'sale', unitPrice: 5, annualDemandLimit: 1e12, note: 'TEA bromine' },
        },
        {
          id: 'vent',
          unit: 'material-sink',
          economics: { disposition: 'vent', unitPrice: 9 },
        },
      ],
      edges: [],
    },
  };
}

function twoProductSolved() {
  return {
    nodes: {
      power: { supplied: { kind: 'electricity', kWh: 200 } },
      lithium: { received: { kind: 'electricity', kWh: 1 } },
      bromine: { received: { kind: 'electricity', kWh: 40 } },
      vent: { received: { kind: 'electricity', kWh: 10 } },
    },
    streams: [],
  };
}

test('--help documents solo and shared purchased-power modes', () => {
  const ran = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  const text = ran.stdout;
  assert.match(text, /--mode solo\|shared/);
  assert.match(text, /solo:/);
  assert.match(text, /shared:/);
  assert.match(text, /co-product/i);
  assert.match(text, /applySoloSale/);
  assert.match(text, /annualNetCash/);
  assert.match(text, /plant bill/i);
  assert.equal(ran.stdout.includes('Unknown mode'), false);
});

test('parseArgs defaults to solo and accepts --mode shared / --mode=solo', async () => {
  const { parseArgs } = await loadScript();
  const base = parseArgs(['node', 'material-power-breakeven.mjs']);
  assert.equal(base.mode, 'solo');
  assert.equal(base.fast, false);
  assert.equal(base.cache, '.hunt-run/site-search-top20.json');
  assert.equal(base.help, undefined);

  assert.equal(parseArgs(['node', 's', '--mode', 'shared']).mode, 'shared');
  assert.equal(parseArgs(['node', 's', '--mode=solo']).mode, 'solo');
  assert.equal(parseArgs(['node', 's', '--mode', 'SHARED']).mode, 'shared');
  assert.equal(parseArgs(['node', 's', '--no-cache', '--fast']).cache, null);
  assert.equal(parseArgs(['node', 's', '--fast']).fast, true);
  assert.equal(parseArgs(['node', 's', '--out', 'out.json']).out, 'out.json');
  assert.equal(parseArgs(['node', 's', '--out=.hunt-run/x.json']).out, '.hunt-run/x.json');

  const bad = parseArgs(['node', 's', '--mode', 'both']);
  assert.equal(bad.help, true);
  assert.equal(bad.badMode, 'both');
  const missing = parseArgs(['node', 's', '--mode']);
  assert.equal(missing.help, true);
});

test('shared cash keeps co-product revenue and the same plant bill as solo', async () => {
  const { applySoloSale, applyPurchasedPower, cashAt, bisectBreakEven } = await loadScript();
  const definition = twoProductPlant();
  const solved = twoProductSolved();

  const soloSale = structuredClone(definition);
  applySoloSale(soloSale, ['lithium']);
  const lithium = soloSale.graph.nodes.find(node => node.id === 'lithium');
  const bromine = soloSale.graph.nodes.find(node => node.id === 'bromine');
  const vent = soloSale.graph.nodes.find(node => node.id === 'vent');
  const power = soloSale.graph.nodes.find(node => node.id === 'power');
  assert.equal(lithium.economics.unitPrice, 1);
  assert.equal(bromine.economics.unitPrice, 0);
  assert.match(bromine.economics.note, /Solo-sale/);
  assert.equal(vent.economics.unitPrice, 9);
  assert.equal(power.economics.installedCapex, 1000000);

  const purchased = structuredClone(definition);
  applyPurchasedPower(purchased, 0.12);
  const purchasedPower = purchased.graph.nodes.find(node => node.id === 'power');
  const purchasedLithium = purchased.graph.nodes.find(node => node.id === 'lithium');
  assert.equal(purchasedPower.economics.unitCost, 0.12);
  assert.equal(purchasedPower.economics.installedCapex, undefined);
  assert.equal(purchasedPower.economics.capexRate, undefined);
  assert.equal(purchasedPower.economics.fixedOM, undefined);
  assert.match(purchasedPower.economics.note, /Purchased-power/);
  assert.equal(purchasedLithium.economics.unitPrice, 1);
  assert.equal(definition.graph.nodes.find(node => node.id === 'power').economics.installedCapex, 1000000);

  const solo = cashAt(definition, solved, ['lithium'], 0.1, 'solo');
  const shared = cashAt(definition, solved, ['lithium'], 0.1, 'shared');
  const implicit = cashAt(definition, solved, ['lithium'], 0.1);
  assert.equal(implicit.annualRevenue, solo.annualRevenue);
  assert.equal(implicit.mode, 'solo');
  assert.equal(shared.mode, 'shared');
  assert.ok(shared.annualRevenue > solo.annualRevenue);
  // Bromine 40 kWh/day × 365 × $5/kg-equivalent; lithium stays in both.
  assert.ok(Math.abs((shared.annualRevenue - solo.annualRevenue) - (40 * 365 * 5)) < 1e-6);
  assert.equal(shared.sourcePurchases, solo.sourcePurchases);
  assert.ok(shared.sourcePurchases > 0);
  assert.equal(shared.annualizedCapex, solo.annualizedCapex);
  // PV installedCapex $1e6 must be stripped; process $200k CRF stays.
  assert.ok(shared.annualizedCapex > 15000 && shared.annualizedCapex < 30000);
  assert.ok(shared.annualOperatingCost < 20000);
  assert.equal(definition.graph.nodes.find(node => node.id === 'bromine').economics.unitPrice, 5);

  const soloFlip = bisectBreakEven(definition, solved, ['lithium'], 2, 'solo');
  assert.equal(soloFlip.status, 'no-flip-always-negative');
  assert.equal(soloFlip.breakEven, null);
  assert.match(soloFlip.reason, /^Solo-sale/);
  assert.ok(soloFlip.cashAt0 < 0);

  const sharedFlip = bisectBreakEven(definition, solved, ['lithium'], 2, 'shared');
  assert.equal(sharedFlip.status, 'flip');
  assert.ok(sharedFlip.breakEven > 0.4 && sharedFlip.breakEven < 1);
  assert.ok(sharedFlip.cashAt0 > 0);
  const atBe = cashAt(definition, solved, ['lithium'], sharedFlip.breakEven, 'shared');
  assert.ok(Math.abs(atBe.annualNetCash) < 1);
  const below = cashAt(definition, solved, ['lithium'], sharedFlip.breakEven - 0.05, 'shared');
  const above = cashAt(definition, solved, ['lithium'], sharedFlip.breakEven + 0.05, 'shared');
  assert.ok(below.annualNetCash > 0);
  assert.ok(above.annualNetCash < 0);
  assert.ok(sharedFlip.breakEven > (soloFlip.breakEven ?? 0));
});

test('pickHero uses cash+ tonnes, not the largest producer overall', async () => {
  const { pickHero } = await loadScript();
  const rows = [
    {
      siteId: 'cash-minus-big',
      siteName: 'Big negative',
      template: 'abundance',
      annualNetCash: -5000,
      met: false,
      feasible: false,
      products: [
        { id: 'lithium', tonnesPerYear: 80 },
        { id: 'bromine', tonnesPerYear: 1 },
      ],
    },
    {
      siteId: 'cash-plus-small',
      siteName: 'Small positive',
      template: 'abundance',
      annualNetCash: 1200,
      met: true,
      feasible: true,
      products: [
        { id: 'lithium', tonnesPerYear: 4 },
        { id: 'salt', tonnesPerYear: 10 },
        { id: 'recovered-salt', tonnesPerYear: 3 },
      ],
    },
  ];
  const hero = pickHero(rows, { id: 'lithium', sinks: ['lithium'] });
  assert.equal(hero.siteId, 'cash-plus-small');
  assert.equal(hero.fromCashPlusPool, true);
  assert.equal(hero.tonnesPerYear, 4);
  assert.equal(hero.pvCashPositive, true);

  const salt = pickHero(rows, { id: 'salt', sinks: ['salt', 'recovered-salt'] });
  assert.equal(salt.siteId, 'cash-plus-small');
  assert.equal(salt.tonnesPerYear, 13);
});
