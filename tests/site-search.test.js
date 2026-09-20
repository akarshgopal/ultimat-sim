const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const SITE_PRESETS = require('../data/site-presets.js');
const {
  searchAbundanceSites,
  rankCandidates,
  defaultSearchSites,
  PLANT_TEMPLATES,
  DEAD_SEA_SITE_ID,
  SCREENING_NOTE,
  FAST_SCALES,
  FAST_RATES,
  templateEligible,
} = require('../engine/site-search');

const FAST = { scales: FAST_SCALES.slice(), rates: FAST_RATES.slice() };

function brineSite() {
  return defaultSearchSites().find(site => site.id === DEAD_SEA_SITE_ID);
}

test('default search sites union Dead Sea hub with SITE_PRESETS and do not invent a Dead Sea preset row', () => {
  const sites = defaultSearchSites();
  const ids = sites.map(site => site.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], DEAD_SEA_SITE_ID);
  assert.ok(sites[0].hasBrineAssay);
  assert.equal(sites[0].assayKind, 'brine');
  assert.equal(sites[0].source, 'NetworkCase.siteDeadSeaAbundance');
  assert.ok(!SITE_PRESETS.some(preset => preset.id === DEAD_SEA_SITE_ID));
  for (const preset of SITE_PRESETS) {
    const row = sites.find(site => site.id === preset.id);
    assert.ok(row, preset.id);
    assert.equal(row.hasBrineAssay, false);
    if (preset.assayId) {
      assert.equal(row.hasSeawaterAssay, true);
      assert.equal(row.assayKind, 'seawater');
    } else {
      assert.equal(row.hasSeawaterAssay, false);
    }
  }
  assert.deepEqual(PLANT_TEMPLATES, ['abundance', 'coastal', 'methanol']);
});

test('when Dead Sea abundance is in the search set, returns ≥1 cash-positive candidate', () => {
  const result = searchAbundanceSites({
    sites: [brineSite()],
    templates: ['abundance'],
    topN: 10,
    sizeOpts: FAST,
  });
  assert.ok(result.feasibleCount >= 1, `feasibleCount ${result.feasibleCount}`);
  assert.ok(result.ranking.length >= 1);
  const winner = result.ranking[0];
  assert.equal(winner.siteId, DEAD_SEA_SITE_ID);
  assert.equal(winner.template, 'abundance');
  assert.equal(winner.met, true);
  assert.equal(winner.feasible, true);
  assert.ok(winner.annualNetCash > 0);
  assert.ok(winner.tonnes > 0);
  assert.ok(winner.positiveSaleCount >= 1);
  assert.ok(Array.isArray(winner.products) && winner.products.length >= 1);
  assert.ok(winner.notes.some(note => /screening assumes intake\/concession/i.test(note)));
  assert.match(SCREENING_NOTE, /not a bankable permit/i);
});

test('ranking is stable: same input yields the same top siteId+template order', () => {
  const opts = {
    sites: [brineSite(), defaultSearchSites().find(site => site.id === 'spain-almeria')],
    templates: ['abundance', 'coastal'],
    topN: 10,
    sizeOpts: FAST,
  };
  const first = searchAbundanceSites(opts);
  const second = searchAbundanceSites(opts);
  const key = row => [row.siteId, row.template, row.tonnes, row.positiveSaleCount, row.annualNetCash];
  assert.deepEqual(first.ranking.map(key), second.ranking.map(key));
  assert.equal(first.ranking[0].siteId, second.ranking[0].siteId);
  assert.equal(first.ranking[0].template, second.ranking[0].template);
  assert.equal(first.feasibleCount, second.feasibleCount);
});

test('presets without brine assay do not get an invented feasible abundance plant', () => {
  const seawater = defaultSearchSites().find(site => site.id === 'uae-taweelah');
  const noAssay = defaultSearchSites().find(site => site.id === 'oman-duqm');
  assert.equal(seawater.hasSeawaterAssay, true);
  assert.equal(seawater.hasBrineAssay, false);
  assert.equal(noAssay.hasSeawaterAssay, false);

  const skipped = searchAbundanceSites({
    sites: [seawater, noAssay],
    templates: ['abundance'],
    sizeOpts: FAST,
  });
  assert.equal(skipped.feasibleCount, 0);
  assert.equal(skipped.tried, 0);
  assert.equal(skipped.skippedCount, 2);
  assert.ok(skipped.skipped.every(row => row.template === 'abundance' && row.status === 'skipped'));
  assert.ok(skipped.skipped.every(row => row.reason === 'no-brine-assay'));
  assert.equal(skipped.ranking.length, 0);

  const mixed = searchAbundanceSites({
    sites: [seawater, brineSite()],
    templates: ['abundance'],
    sizeOpts: FAST,
  });
  assert.ok(mixed.feasibleCount >= 1);
  assert.ok(mixed.ranking.every(row => row.siteId === DEAD_SEA_SITE_ID && row.template === 'abundance'));
  assert.ok(mixed.skipped.some(row => row.siteId === 'uae-taweelah' && row.reason === 'no-brine-assay'));
  assert.equal(templateEligible(seawater, 'abundance').ok, false);
  assert.equal(templateEligible(brineSite(), 'coastal').ok, false);
});

test('ranking prefers higher tonnes among feasible, then sale count, then cash, then ids', () => {
  const ranked = rankCandidates([
    {
      siteId: 'b-site',
      template: 'abundance',
      tonnes: 10,
      positiveSaleCount: 4,
      annualNetCash: 90,
      feasible: true,
      met: true,
    },
    {
      siteId: 'a-site',
      template: 'abundance',
      tonnes: 40,
      positiveSaleCount: 2,
      annualNetCash: 10,
      feasible: true,
      met: true,
    },
    {
      siteId: 'c-site',
      template: 'coastal',
      tonnes: 10,
      positiveSaleCount: 4,
      annualNetCash: 50,
      feasible: true,
      met: true,
    },
    {
      siteId: 'miss',
      template: 'methanol',
      tonnes: 999,
      positiveSaleCount: 9,
      annualNetCash: -1,
      feasible: false,
      met: false,
    },
    {
      siteId: 'a-site',
      template: 'methanol',
      tonnes: 40,
      positiveSaleCount: 2,
      annualNetCash: 10,
      feasible: true,
      met: true,
    },
  ]);
  assert.deepEqual(
    ranked.map(row => `${row.siteId}:${row.template}`),
    ['a-site:abundance', 'a-site:methanol', 'b-site:abundance', 'c-site:coastal', 'miss:methanol'],
  );
  assert.ok(ranked[0].tonnes > ranked[2].tonnes);
});

test('CLI prints JSON and exits 0 with Dead Sea in the default set', () => {
  const script = path.join(__dirname, '..', 'scripts', 'abundance-site-search.mjs');
  const ran = spawnSync(process.execPath, [
    script,
    '--fast',
    '--templates', 'abundance',
    '--sites', DEAD_SEA_SITE_ID,
    '--top', '5',
  ], {
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  const payload = JSON.parse(ran.stdout);
  assert.ok(payload.feasibleCount >= 1);
  assert.equal(payload.ranking[0].siteId, DEAD_SEA_SITE_ID);
  assert.equal(payload.ranking[0].template, 'abundance');
  assert.ok(payload.ranking[0].annualNetCash > 0);
});
