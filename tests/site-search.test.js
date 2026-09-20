const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const SITE_PRESETS = require('../data/site-presets.js');
const {
  searchAbundanceSites,
  rankCandidates,
  compareNearMisses,
  isIdleCandidate,
  defaultSearchSites,
  PLANT_TEMPLATES,
  DEAD_SEA_SITE_ID,
  SCREENING_NOTE,
  RIGHTS_SCREENING,
  RIGHTS_NONE,
  FAST_SCALES,
  FAST_RATES,
  templateEligible,
  buildAbundancePlant,
  frozenSolarFor,
  evaluateCandidate,
} = require('../engine/site-search');

const FAST = { scales: FAST_SCALES.slice(), rates: FAST_RATES.slice() };

function brineSite() {
  return defaultSearchSites().find(site => site.id === DEAD_SEA_SITE_ID);
}

function searchSite(id) {
  return defaultSearchSites().find(site => site.id === id);
}

test('default search sites union Dead Sea hub with SITE_PRESETS and do not invent a Dead Sea preset row', () => {
  const sites = defaultSearchSites();
  const ids = sites.map(site => site.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], DEAD_SEA_SITE_ID);
  assert.ok(sites[0].hasBrineAssay);
  assert.equal(sites[0].assayKind, 'brine');
  assert.equal(sites[0].assayId, 'dead-sea-brine');
  assert.equal(sites[0].source, 'NetworkCase.siteDeadSeaAbundance');
  assert.ok(!SITE_PRESETS.some(preset => preset.id === DEAD_SEA_SITE_ID));
  for (const preset of SITE_PRESETS) {
    const row = sites.find(site => site.id === preset.id);
    assert.ok(row, preset.id);
    if (preset.brineAssayId) {
      assert.equal(row.hasBrineAssay, true, preset.id);
      assert.equal(row.assayKind, 'brine');
      assert.equal(row.assayId, preset.brineAssayId);
      assert.equal(row.brineAssayId, preset.brineAssayId);
    } else {
      assert.equal(row.hasBrineAssay, false, preset.id);
    }
    if (preset.assayId) {
      assert.equal(row.hasSeawaterAssay, true, preset.id);
      assert.equal(row.seawaterAssayId, preset.assayId);
      if (!preset.brineAssayId) assert.equal(row.assayKind, 'seawater');
    } else {
      assert.equal(row.hasSeawaterAssay, false, preset.id);
    }
  }
  const mejillones = searchSite('chile-mejillones');
  assert.equal(mejillones.hasBrineAssay, true);
  assert.equal(mejillones.hasSeawaterAssay, true);
  assert.equal(mejillones.assayId, 'atacama-lithium-brine');
  assert.equal(mejillones.seawaterAssayId, 'atacama-pacific-seawater');
  assert.equal(templateEligible(mejillones, 'abundance').ok, true);
  assert.equal(templateEligible(mejillones, 'coastal').ok, true);
  assert.deepEqual(PLANT_TEMPLATES, ['abundance', 'coastal', 'methanol']);
});

test('when Dead Sea abundance is in the search set, returns a scored candidate under the capital-inclusive gate', () => {
  const result = searchAbundanceSites({
    sites: [brineSite()],
    templates: ['abundance'],
    topN: 10,
    sizeOpts: FAST,
  });
  const winner = result.ranking[0] || result.nearMisses[0];
  assert.ok(winner, 'search should return a ranking or near-miss row');
  assert.equal(winner.siteId, DEAD_SEA_SITE_ID);
  assert.equal(winner.template, 'abundance');
  assert.ok(Number.isFinite(winner.annualNetCash));
  assert.equal(typeof winner.met, 'boolean');
  assert.equal(winner.feasible, winner.met);
  if (winner.met) {
    assert.ok(winner.annualNetCash > 0);
    assert.ok(result.feasibleCount >= 1);
  } else {
    assert.ok(winner.annualNetCash <= 0);
    assert.equal(result.feasibleCount, 0);
    assert.ok(result.nearMisses.length >= 1);
  }
  assert.ok(winner.tonnes >= 0);
  assert.ok(Array.isArray(winner.products));
  assert.equal(winner.assayId, 'dead-sea-brine');
  assert.equal(winner.rightsScenario, RIGHTS_SCREENING);
  assert.ok(winner.notes.some(note => /screening assumes intake\/concession/i.test(note)));
  assert.match(SCREENING_NOTE, /not a bankable permit/i);
});

test('buildAbundancePlant uses the site brine assay, not a Dead Sea clone, for Mejillones/Atacama', () => {
  const mejillones = searchSite('chile-mejillones');
  const plant = buildAbundancePlant(mejillones);
  assert.equal(plant.meta.assayId, 'atacama-lithium-brine');
  assert.notEqual(plant.meta.assayId, 'dead-sea-brine');
  assert.equal(plant.site.id, 'chile-mejillones');
  const brine = plant.graph.nodes.find(node => node.id === 'brine');
  assert.ok(brine?.params?.stream?.mol['Li+'] > 0);
  const deadPlant = buildAbundancePlant(brineSite());
  assert.equal(deadPlant.meta.assayId, 'dead-sea-brine');
  const deadLi = deadPlant.graph.nodes.find(node => node.id === 'brine').params.stream.mol['Li+'];
  assert.ok(brine.params.stream.mol['Li+'] > deadLi * 10);
  assert.equal(deadPlant.graph.nodes.find(node => node.id === 'brine').params.stream.mol['Br-'] > 0, true);
  assert.equal(brine.params.stream.mol['Br-'] || 0, 0);
  const normalized = searchAbundanceSites({
    sites: [{ id: 'chile-mejillones', name: 'Mejillones overlay' }],
    templates: ['abundance'],
    sizeOpts: FAST,
  });
  assert.equal(normalized.tried, 1);
  const hit = normalized.ranking.concat(normalized.nearMisses);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].siteId, 'chile-mejillones');
  assert.equal(hit[0].assayId, 'atacama-lithium-brine');
  assert.equal(hit[0].rightsScenario, RIGHTS_SCREENING);
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
  assert.deepEqual(first.nearMisses.map(key), second.nearMisses.map(key));
  const firstLead = first.ranking[0] || first.nearMisses[0];
  const secondLead = second.ranking[0] || second.nearMisses[0];
  assert.ok(firstLead && secondLead);
  assert.equal(firstLead.siteId, secondLead.siteId);
  assert.equal(firstLead.template, secondLead.template);
  assert.equal(first.feasibleCount, second.feasibleCount);
});

test('presets without brine assay do not get an invented feasible abundance plant', () => {
  const seawater = searchSite('spain-almeria');
  const gulf = searchSite('uae-taweelah');
  const noAssay = searchSite('oman-duqm');
  assert.equal(seawater.hasSeawaterAssay, true);
  assert.equal(seawater.hasBrineAssay, false);
  assert.equal(gulf.hasSeawaterAssay, true);
  assert.equal(gulf.hasBrineAssay, true);
  assert.equal(gulf.assayId, 'persian-gulf-sabkha-brine');
  assert.equal(noAssay.hasSeawaterAssay, true);
  assert.equal(noAssay.hasBrineAssay, false);
  assert.equal(noAssay.assayId, 'arabian-sea-seawater');
  assert.equal(noAssay.seawaterAssayId, 'arabian-sea-seawater');

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
  assert.ok(skipped.skipped.every(row => row.rightsScenario === RIGHTS_SCREENING || row.rightsScenario === RIGHTS_NONE));
  assert.equal(skipped.ranking.length, 0);

  const mixed = searchAbundanceSites({
    sites: [seawater, brineSite()],
    templates: ['abundance'],
    sizeOpts: FAST,
  });
  const mixedHit = mixed.ranking.concat(mixed.nearMisses);
  assert.ok(mixedHit.some(row => row.siteId === DEAD_SEA_SITE_ID && row.template === 'abundance'));
  assert.ok(mixedHit.every(row => row.siteId === DEAD_SEA_SITE_ID && row.template === 'abundance'));
  assert.ok(mixed.skipped.some(row => row.siteId === 'spain-almeria' && row.reason === 'no-brine-assay'));
  assert.equal(templateEligible(seawater, 'abundance').ok, false);
  assert.equal(templateEligible(gulf, 'abundance').ok, true);
  assert.equal(templateEligible(brineSite(), 'coastal').ok, false);

  const layers = searchAbundanceSites({
    sites: [brineSite()],
    templates: ['pvgis', 'water', 'land'],
    sizeOpts: FAST,
  });
  assert.equal(layers.tried, 0);
  assert.ok(layers.skipped.length >= 1);
  assert.ok(layers.skipped.every(row => row.reason === 'map-layer-not-objective'));
  assert.ok(layers.skipped.every(row => row.rightsScenario === RIGHTS_NONE));
});

test('coastal/methanol skip coasts without frozen PVGIS rather than inventing kWh/kWp', () => {
  const duqm = defaultSearchSites().find(site => site.id === 'oman-duqm');
  const mundra = defaultSearchSites().find(site => site.id === 'india-mundra');
  const walvis = defaultSearchSites().find(site => site.id === 'namibia-walvis-bay');
  const taweelah = defaultSearchSites().find(site => site.id === 'uae-taweelah');
  const almeria = defaultSearchSites().find(site => site.id === 'spain-almeria');
  const mejillones = defaultSearchSites().find(site => site.id === 'chile-mejillones');

  for (const site of [duqm, mundra, walvis, taweelah]) {
    assert.equal(site.hasSeawaterAssay, true, site.id);
    assert.equal(frozenSolarFor(site, 'coastal'), null, site.id);
    assert.equal(frozenSolarFor(site, 'methanol'), null, site.id);
    const coastal = templateEligible(site, 'coastal');
    assert.equal(coastal.ok, false);
    assert.equal(coastal.reason, 'no-frozen-pvgis');
    const methanol = templateEligible(site, 'methanol');
    assert.equal(methanol.ok, false);
    assert.equal(methanol.reason, 'no-frozen-pvgis');
    const abundance = templateEligible(site, 'abundance');
    if (site.hasBrineAssay) {
      assert.equal(abundance.ok, true, site.id);
    } else {
      assert.equal(abundance.reason, 'no-brine-assay', site.id);
    }
    const evaluated = evaluateCandidate(site, 'coastal', FAST);
    assert.equal(evaluated.status, 'skipped');
    assert.equal(evaluated.reason, 'no-frozen-pvgis');
  }

  assert.equal(duqm.assayId, 'arabian-sea-seawater');
  assert.equal(mundra.assayId, 'gulf-of-kutch-seawater');
  assert.equal(walvis.assayId, 'benguela-atlantic-seawater');
  assert.ok(frozenSolarFor(almeria, 'coastal'));
  assert.ok(frozenSolarFor(mejillones, 'methanol'));
  assert.equal(templateEligible(almeria, 'coastal').ok, true);
  assert.equal(templateEligible(mejillones, 'methanol').ok, true);
  assert.equal(templateEligible(almeria, 'abundance').ok, false);
  assert.ok(frozenSolarFor(brineSite(), 'abundance'));
  assert.equal(templateEligible(brineSite(), 'abundance').ok, true);

  const skipped = searchAbundanceSites({
    sites: [duqm, mundra, walvis, taweelah],
    templates: ['coastal', 'methanol'],
    sizeOpts: FAST,
  });
  assert.equal(skipped.tried, 0);
  assert.equal(skipped.feasibleCount, 0);
  assert.equal(skipped.skippedCount, 8);
  assert.ok(skipped.skipped.every(row => row.reason === 'no-frozen-pvgis'));
});

test('a cheap test-fixture plant can still be cash-positive so ranking logic stays testable', () => {
  const { sizeForPositiveCashflow } = require('../engine/size');
  const { createAbundanceCase } = require('../cases/abundance');
  const definition = createAbundanceCase();
  for (const node of definition.graph.nodes) {
    if (!node.economics) continue;
    if (node.economics.capexRate != null) node.economics.capexRate = 0.001;
    if (node.economics.disposition === 'sale') node.economics.unitPrice = 50;
  }
  const sized = sizeForPositiveCashflow({ definition, scales: [1], rates: [0] });
  assert.equal(sized.objective.met, true);
  assert.ok(sized.objective.annualNetCash > 0);
  const ranked = rankCandidates([
    {
      siteId: 'fixture-rich',
      template: 'abundance',
      tonnes: 1,
      positiveSaleCount: sized.objective.positiveSaleCount,
      annualNetCash: sized.objective.annualNetCash,
      feasible: true,
      met: true,
    },
    {
      siteId: 'miss',
      template: 'abundance',
      tonnes: 999,
      positiveSaleCount: 9,
      annualNetCash: -1,
      feasible: false,
      met: false,
    },
  ]);
  assert.equal(ranked[0].siteId, 'fixture-rich');
  assert.equal(ranked[1].siteId, 'miss');
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

test('near-miss ranking prefers operating cash- slates over idle cash≈0', () => {
  const idle = {
    siteId: 'idle-coast',
    template: 'coastal',
    tonnes: 0,
    totalPositiveSaleTonnes: 0,
    positiveSaleCount: 0,
    annualNetCash: 0,
    feasible: false,
    met: false,
    selected: { family: 'fuel', rate: 0 },
    slate: {},
    products: [],
  };
  const operating = {
    siteId: 'dead-sea-operating',
    template: 'abundance',
    tonnes: 0,
    totalPositiveSaleTonnes: 0,
    positiveSaleCount: 0,
    annualNetCash: -50000,
    feasible: false,
    met: false,
    selected: { family: 'abundance', scale: 1, slateMode: 'minerals-only' },
    slate: { lithium: 12 },
    products: [{ id: 'lithium', tonnesPerYear: 12, annualRevenue: 1, positive: true }],
  };
  const richer = {
    siteId: 'atacama-operating',
    template: 'abundance',
    tonnes: 40,
    totalPositiveSaleTonnes: 40,
    positiveSaleCount: 3,
    annualNetCash: -80000,
    feasible: false,
    met: false,
    selected: { family: 'abundance', scale: 1 },
    slate: { lithium: 40 },
    products: [{ id: 'lithium', tonnesPerYear: 40, annualRevenue: 1, positive: true }],
  };
  assert.equal(isIdleCandidate(idle), true);
  assert.equal(isIdleCandidate(operating), false);
  assert.equal(isIdleCandidate(richer), false);
  assert.ok(compareNearMisses(operating, idle) < 0);
  assert.ok(compareNearMisses(idle, operating) > 0);
  const ranked = [idle, operating, richer].slice().sort(compareNearMisses);
  assert.deepEqual(ranked.map(row => row.siteId), [
    'atacama-operating',
    'dead-sea-operating',
    'idle-coast',
  ]);
  const search = searchAbundanceSites({
    sites: [brineSite()],
    templates: ['abundance'],
    sizeOpts: FAST,
  });
  assert.ok(search.nearMisses.every(row => !row.idle));
  if (search.nearMisses.length) {
    assert.ok(search.nearMisses[0].tonnes > 0 || Object.keys(search.nearMisses[0].slate || {}).length > 0 || search.nearMisses[0].annualNetCash < 0);
  }
});

test('coastal/methanol get a screening price×CAPEX probe: cash+ inside bands or documented near-miss', () => {
  const almeria = searchSite('spain-almeria');
  const mejillones = searchSite('chile-mejillones');
  const fuelOpts = { scales: [1], rates: [5] };

  const coastal = evaluateCandidate(almeria, 'coastal', fuelOpts);
  assert.equal(coastal.status, 'ok');
  assert.equal(coastal.template, 'coastal');
  assert.equal(coastal.idle, false);
  assert.ok('breakEvenPrice' in coastal);
  assert.ok(Number.isFinite(coastal.bestCash));
  assert.ok(coastal.fuelProbe);
  assert.equal(coastal.fuelProbe.bounds.priceMid, 1);
  assert.equal(coastal.fuelProbe.bounds.capexMin, 0.05);
  assert.ok(coastal.notes.some(note => /screening/i.test(note)));
  if (coastal.feasible) {
    assert.ok(coastal.annualNetCash > 0);
    assert.ok(coastal.notes.some(note => /cash-positive under screening/i.test(note)));
  } else {
    assert.ok(coastal.annualNetCash <= 0);
    assert.ok(coastal.bestCash <= 0);
    assert.ok(coastal.breakEvenPrice === null || Number.isFinite(coastal.breakEvenPrice));
    assert.ok(coastal.notes.some(note => /green-premium|not an invented fuel winner/i.test(note)));
  }

  const methanol = evaluateCandidate(mejillones, 'methanol', fuelOpts);
  assert.equal(methanol.status, 'ok');
  assert.equal(methanol.template, 'methanol');
  assert.equal(methanol.idle, false);
  assert.ok('breakEvenPrice' in methanol);
  assert.ok(Number.isFinite(methanol.bestCash));
  assert.ok(methanol.fuelProbe);
  assert.equal(methanol.fuelProbe.bounds.priceMin, 0.25);
  assert.equal(methanol.fuelProbe.bounds.priceMax, 0.5);
  assert.ok(methanol.notes.some(note => /screening|commodity/i.test(note)));
  if (methanol.feasible) {
    assert.ok(methanol.annualNetCash > 0);
    assert.ok(methanol.notes.some(note => /cash-positive under screening/i.test(note)));
    assert.equal(methanol.selected.label, 'screening');
    assert.ok(methanol.selected.capexFactor >= 0.05 && methanol.selected.capexFactor <= 2);
    assert.ok(methanol.selected.screeningPrice >= 0.25 && methanol.selected.screeningPrice <= 0.5);
  } else {
    assert.ok(methanol.annualNetCash <= 0);
    assert.ok(methanol.bestCash <= 0);
    assert.ok(methanol.breakEvenPrice === null || Number.isFinite(methanol.breakEvenPrice));
    assert.ok(methanol.notes.some(note => /not an invented fuel winner/i.test(note)));
  }

  const ranked = searchAbundanceSites({
    sites: [mejillones],
    templates: ['methanol'],
    sizeOpts: fuelOpts,
  });
  if (methanol.feasible) {
    assert.ok(ranked.ranking.some(row => row.template === 'methanol' && row.siteId === 'chile-mejillones'));
    assert.ok(ranked.feasibleCount >= 1);
  } else {
    assert.equal(ranked.feasibleCount, 0);
    assert.ok(ranked.nearMisses.some(row => (
      row.template === 'methanol'
      && row.siteId === 'chile-mejillones'
      && Number.isFinite(row.bestCash)
    )));
  }
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
  const winner = (payload.ranking && payload.ranking[0]) || (payload.nearMisses && payload.nearMisses[0]);
  assert.ok(winner);
  assert.equal(winner.siteId, DEAD_SEA_SITE_ID);
  assert.equal(winner.template, 'abundance');
  assert.ok(Number.isFinite(winner.annualNetCash));
});
