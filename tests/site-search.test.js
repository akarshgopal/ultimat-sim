const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const SITE_PRESETS = require('../data/site-presets.js');
const pvgisSites = require('../data/pvgis-sites');
const mapSite = require('../engine/map-site');
const { DEAD_SEA_PV } = require('../cases/network');
const {
  searchAbundanceSites,
  searchFuelSites,
  rankCandidates,
  compareNearMisses,
  isIdleCandidate,
  defaultSearchSites,
  MATERIALS_TEMPLATES,
  FUEL_TEMPLATES,
  PATH_MATERIALS,
  PATH_FUELS,
  DEAD_SEA_SITE_ID,
  RIGHTS_SCREENING,
  RIGHTS_INTAKE_ONLY,
  RIGHTS_NO_RIGHTS,
  RIGHTS_OFFTAKE,
  RIGHTS_NO_GRID,
  RIGHTS_FRESHWATER,
  RIGHTS_DISCHARGE,
  RIGHTS_NONE,
  OFFTAKE_DEMAND_FACTOR,
  NO_GRID_POWER_USD_PER_KWH,
  FAST_SCALES,
  FAST_RATES,
  templateEligible,
  buildAbundancePlant,
  buildFuelPlant,
  frozenSolarFor,
  evaluateCandidate,
  resolveAbundanceAssayId,
} = require('../engine/site-search');

const FAST = { scales: FAST_SCALES.slice(), rates: FAST_RATES.slice() };
const SCRIPT = path.join(__dirname, '..', 'scripts', 'abundance-site-search.mjs');

function searchSite(id) {
  return defaultSearchSites().find(site => site.id === id);
}
const brineSite = () => searchSite(DEAD_SEA_SITE_ID);

function runCli(args) {
  const ran = spawnSync(process.execPath, [SCRIPT, '--fast', ...args], { encoding: 'utf8', timeout: 60000 });
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  return JSON.parse(ran.stdout);
}

test('every search site mirrors its preset assays, binds frozen PVGIS, and is eligible by assay', () => {
  const sites = defaultSearchSites();
  const ids = sites.map(site => site.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], DEAD_SEA_SITE_ID);
  assert.ok(!SITE_PRESETS.some(preset => preset.id === DEAD_SEA_SITE_ID));
  assert.equal(brineSite().assayId, 'dead-sea-brine');

  for (const preset of SITE_PRESETS) {
    const site = sites.find(row => row.id === preset.id);
    assert.ok(site, preset.id);
    assert.equal(site.hasBrineAssay, Boolean(preset.brineAssayId), preset.id);
    assert.equal(site.hasSeawaterAssay, Boolean(preset.assayId), preset.id);
    if (preset.brineAssayId) {
      assert.equal(site.assayKind, 'brine', preset.id);
      assert.equal(site.assayId, preset.brineAssayId, preset.id);
      assert.equal(resolveAbundanceAssayId(site), preset.brineAssayId, preset.id);
    } else {
      assert.equal(resolveAbundanceAssayId(site), null, preset.id);
      assert.equal(templateEligible(site, 'abundance').reason, 'no-brine-assay', preset.id);
    }
    assert.equal(templateEligible(site, 'abundance').ok, Boolean(preset.brineAssayId), preset.id);

    const solar = frozenSolarFor(site, site.hasBrineAssay ? 'abundance' : 'coastal');
    assert.ok(pvgisSites.BY_SITE_ID[preset.id], `${preset.id} has a frozen PVGIS series`);
    assert.ok(solar?.dailyPVKWhPerKWp > 0, preset.id);
    if (preset.id !== 'levant-dead-sea') {
      assert.notEqual(solar.dailyPVKWhPerKWp, DEAD_SEA_PV, `${preset.id} is not a Dead Sea clone`);
    }
    if (site.hasSeawaterAssay) {
      assert.equal(templateEligible(site, 'coastal').ok, true, preset.id);
      assert.equal(templateEligible(site, 'methanol').ok, true, preset.id);
    } else {
      assert.equal(templateEligible(site, 'coastal').reason, 'no-seawater-assay', preset.id);
    }
  }
  assert.equal(templateEligible(brineSite(), 'abundance').ok, true);
  assert.equal(templateEligible(brineSite(), 'coastal').ok, false);
  assert.equal(resolveAbundanceAssayId(null), null);
});

test('frozen PVGIS series match by preset or nearest coordinates and hydrate from same-origin JSON', async () => {
  assert.equal(pvgisSites.matchSeries(36.834, -2.463).id, 'spain-almeria', 'a preset id beats its dated alias on a tie');
  assert.equal(pvgisSites.matchSeries(36.9, -2.5, { siteId: 'almeria-pvgis-2026-09-05' }).id, 'almeria-pvgis-2026-09-05');
  assert.equal(pvgisSites.matchSeries(22.737, 69.71, { siteId: 'spain-almeria' }).id, 'india-mundra', 'a far preset id does not win');
  assert.equal(pvgisSites.matchSeries(59.9, 10.8), null);
  assert.equal(pvgisSites.matchSeries(NaN, 10), null);
  assert.equal(await pvgisSites.hydrate(), pvgisSites.BY_SITE_ID);

  // The browser build has no require(): it starts empty and fetches data/*.json.
  const fs = require('node:fs');
  const vm = require('node:vm');
  const file = require.resolve('../data/pvgis-sites.js');
  const browser = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, 'utf8'), browser, { filename: file });
  const api = browser.PvgisSites;
  assert.equal(api.matchSeries(36.834, -2.463), null);
  const fetched = [];
  const byId = await api.hydrate(async url => {
    fetched.push(url);
    if (url.endsWith('pvgis-almeria.json')) return { ok: false };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', url), 'utf8')) };
  });
  assert.equal(fetched.length, new Set(Object.values(api.FILES)).size, 'each file is fetched once');
  assert.equal(byId['spain-almeria'], undefined, 'a failed fetch leaves the site unfrozen');
  assert.equal(byId['india-mundra'].dailyPVKWhPerKWp, pvgisSites.BY_SITE_ID['india-mundra'].dailyPVKWhPerKWp);
});

test('abundance plants use the site brine assay, regional TEA, and frozen site solar', () => {
  const dead = buildAbundancePlant(brineSite());
  assert.equal(dead.meta.assayId, 'dead-sea-brine');
  assert.equal(dead.site.dailyPVKWhPerKWp, DEAD_SEA_PV);
  const deadLi = dead.graph.nodes.find(node => node.id === 'brine').params.stream.mol['Li+'];

  const cases = [
    ['chile-mejillones', 'atacama-lithium-brine', 'chile-atacama'],
    ['us-salton-sea', 'salton-sea-brine', 'texas'],
    ['china-qaidam', 'qaidam-brine', 'asia-china'],
    ['china-zabuye', 'zabuye-lithium-brine', 'asia-china'],
    ['ethiopia-danakil', 'danakil-brine', 'me-levant'],
  ];
  for (const [id, assayId, region] of cases) {
    const site = searchSite(id);
    const plant = buildAbundancePlant(site);
    assert.equal(plant.meta.assayId, assayId, id);
    assert.equal(plant.meta.demandRegionId, region, id);
    assert.equal(plant.graph.nodes.find(node => node.id === 'lithium').economics.demandRegionId, region, id);
    assert.equal(plant.site.dailyPVKWhPerKWp, frozenSolarFor(site, 'abundance').dailyPVKWhPerKWp, id);
    assert.equal(plant.site.meteo.quality, 'cited', id);
  }
  const atacama = buildAbundancePlant(searchSite('chile-mejillones')).graph.nodes.find(node => node.id === 'brine').params.stream;
  assert.ok(atacama.mol['Li+'] > deadLi * 10);
  assert.equal(atacama.mol['Br-'] || 0, 0, 'no invented bromide');

  const methanol = buildFuelPlant(searchSite('chile-mejillones'), 'methanol');
  assert.equal(methanol.graph.nodes.find(node => node.id === 'methanol-product').economics.demandRegionId, 'chile-atacama');
  const coastal = buildFuelPlant(searchSite('spain-almeria'), 'coastal');
  assert.equal(coastal.graph.nodes.find(node => node.id === 'methane').economics.demandRegionId, 'europe');
});

test('unfrozen sites fall back to the latitude screening band or are skipped for fuels', () => {
  const basin = { ...searchSite('bolivia-uyuni'), id: 'fixture-unfrozen-basin', latitude: -20.29, longitude: -67.61 };
  assert.equal(frozenSolarFor(basin, 'abundance'), null);
  const plant = buildAbundancePlant(basin);
  assert.equal(plant.site.dailyPVKWhPerKWp, mapSite.pvScreeningBand(basin.latitude, basin.longitude).typicalKWhPerKWpDay);
  assert.equal(plant.site.meteo.quality, 'screening');

  const coast = {
    id: 'no-pvgis-coast',
    hasSeawaterAssay: true,
    seawaterAssayId: 'red-sea-seawater',
    assayId: 'red-sea-seawater',
    assayKind: 'seawater',
  };
  assert.equal(templateEligible(coast, 'coastal').reason, 'no-frozen-pvgis');
  assert.equal(templateEligible(coast, 'methanol').reason, 'no-frozen-pvgis');
  const evaluated = evaluateCandidate(coast, 'coastal', FAST);
  assert.equal(evaluated.status, 'skipped');
  assert.equal(evaluated.reason, 'no-frozen-pvgis');
});

test('catalog brine basins evaluate on the abundance template with FAST sizing', () => {
  for (const id of ['bolivia-uyuni', 'china-qaidam', 'ethiopia-danakil', 'us-searles-lake', 'us-salton-sea', 'au-lake-mackay']) {
    const evaluated = evaluateCandidate(searchSite(id), 'abundance', FAST);
    assert.equal(evaluated.status, 'ok', id);
    assert.equal(evaluated.siteId, id);
    assert.ok(Number.isFinite(evaluated.annualNetCash), id);
    assert.equal(evaluated.idle, false, id);
  }
});

test('Dead Sea search returns a scored candidate under the capital-inclusive gate, deterministically', () => {
  const opts = { sites: [brineSite(), searchSite('spain-almeria')], templates: ['abundance', 'coastal'], topN: 10, sizeOpts: FAST };
  const first = searchAbundanceSites(opts);
  const second = searchAbundanceSites(opts);
  const key = row => [row.siteId, row.template, row.tonnes, row.positiveSaleCount, row.annualNetCash];
  assert.deepEqual(first.ranking.map(key), second.ranking.map(key));
  assert.deepEqual(first.nearMisses.map(key), second.nearMisses.map(key));

  const dead = searchAbundanceSites({ sites: [brineSite()], templates: ['abundance'], sizeOpts: FAST });
  const winner = dead.ranking[0] || dead.nearMisses[0];
  assert.equal(winner.siteId, DEAD_SEA_SITE_ID);
  assert.equal(winner.feasible, winner.met);
  assert.equal(winner.met, winner.annualNetCash > 0);
  assert.equal(dead.feasibleCount, winner.met ? 1 : 0);
  assert.equal(winner.rightsScenario, RIGHTS_SCREENING);
  assert.ok(dead.nearMisses.every(row => !row.idle));

  const byId = searchAbundanceSites({ sites: [{ id: 'chile-mejillones', name: 'Overlay' }], templates: ['abundance'], sizeOpts: FAST });
  const hit = byId.ranking.concat(byId.nearMisses);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].assayId, 'atacama-lithium-brine', 'a bare id is normalized to its catalog row');
});

test('seawater-only coasts and map layers are skipped, never given an invented abundance plant', () => {
  const duqm = searchSite('oman-duqm');
  const agadir = searchSite('morocco-agadir');
  const skipped = searchAbundanceSites({ sites: [duqm, agadir], templates: ['abundance'], sizeOpts: FAST });
  assert.equal(skipped.tried, 0);
  assert.equal(skipped.skippedCount, 2);
  assert.ok(skipped.skipped.every(row => row.reason === 'no-brine-assay' && row.assayId == null));
  assert.equal(skipped.ranking.length, 0);

  const mixed = searchAbundanceSites({ sites: [duqm, brineSite()], templates: ['abundance'], sizeOpts: FAST });
  assert.ok(mixed.ranking.concat(mixed.nearMisses).every(row => row.siteId === DEAD_SEA_SITE_ID));

  const layers = searchAbundanceSites({ sites: [brineSite()], templates: ['pvgis', 'water', 'land'], sizeOpts: FAST });
  assert.equal(layers.tried, 0);
  assert.ok(layers.skipped.every(row => row.reason === 'map-layer-not-objective' && row.rightsScenario === RIGHTS_NONE));
});

test('ranking orders feasible rows by tonnes, sales, cash, ids, then soft rank; near-misses prefer operating slates', () => {
  const row = (siteId, template, tonnes, positiveSaleCount, annualNetCash, met = true) => ({
    siteId, template, tonnes, positiveSaleCount, annualNetCash, feasible: met, met,
  });
  const ranked = rankCandidates([
    row('b-site', 'abundance', 10, 4, 90),
    row('a-site', 'abundance', 40, 2, 10),
    row('c-site', 'coastal', 10, 4, 50),
    row('miss', 'methanol', 999, 9, -1, false),
    row('a-site', 'methanol', 40, 2, 10),
  ]);
  assert.deepEqual(
    ranked.map(item => `${item.siteId}:${item.template}`),
    ['a-site:abundance', 'a-site:methanol', 'b-site:abundance', 'c-site:coastal', 'miss:methanol'],
  );

  const base = row('x', 'abundance', 10, 2, 50);
  const soft = rankCandidates([
    { ...base, siteId: 'z-low', softRank: 0.2 },
    { ...base, siteId: 'a-high', softRank: 0.9 },
    { ...base, siteId: 'm-missing', softRank: null },
  ]);
  assert.deepEqual(soft.map(item => item.siteId), ['a-high', 'm-missing', 'z-low']);
  const cashWins = rankCandidates([
    { ...base, siteId: 'high-soft', annualNetCash: 10, softRank: 0.99 },
    { ...base, siteId: 'high-cash', annualNetCash: 50, softRank: 0.01 },
  ]);
  assert.equal(cashWins[0].siteId, 'high-cash');
  const nearSoft = [
    { ...base, siteId: 'z-low', feasible: false, met: false, annualNetCash: -20, softRank: 0.2 },
    { ...base, siteId: 'a-high', feasible: false, met: false, annualNetCash: -20, softRank: 0.9 },
    { ...base, siteId: 'm-missing', feasible: false, met: false, annualNetCash: -20, softRank: null },
  ].sort(compareNearMisses);
  assert.deepEqual(nearSoft.map(item => item.siteId), ['a-high', 'm-missing', 'z-low']);

  const idle = { ...row('idle-coast', 'coastal', 0, 0, 0, false), totalPositiveSaleTonnes: 0, selected: { family: 'fuel', rate: 0 }, slate: {}, products: [] };
  const operating = {
    ...row('dead-sea-operating', 'abundance', 0, 0, -50000, false),
    totalPositiveSaleTonnes: 0,
    selected: { family: 'abundance', scale: 1 },
    slate: { lithium: 12 },
    products: [{ id: 'lithium', tonnesPerYear: 12, annualRevenue: 1, positive: true }],
  };
  const richer = {
    ...row('atacama-operating', 'abundance', 40, 3, -80000, false),
    totalPositiveSaleTonnes: 40,
    selected: { family: 'abundance', scale: 1 },
    slate: { lithium: 40 },
    products: [{ id: 'lithium', tonnesPerYear: 40, annualRevenue: 1, positive: true }],
  };
  assert.equal(isIdleCandidate(idle), true);
  assert.equal(isIdleCandidate(operating), false);
  assert.deepEqual([idle, operating, richer].sort(compareNearMisses).map(item => item.siteId), [
    'atacama-operating', 'dead-sea-operating', 'idle-coast',
  ]);
});

test('soft rank scores frozen PVGIS yield and is null without coordinates', () => {
  const duqm = searchSite('oman-duqm');
  const solar = frozenSolarFor(duqm, 'coastal');
  const scored = evaluateCandidate(duqm, 'coastal', FAST);
  const expected = mapSite.layerScoreAt(duqm.latitude, duqm.longitude, { dailyPVKWhPerKWp: solar.dailyPVKWhPerKWp, frozen: true });
  assert.equal(scored.layerScore, expected);
  assert.equal(scored.softRank, expected);
  assert.notEqual(expected, mapSite.layerScoreAt(duqm.latitude, duqm.longitude));

  const noLayers = evaluateCandidate({
    id: 'nowhere',
    latitude: NaN,
    longitude: NaN,
    hasBrineAssay: true,
    brineAssayId: 'dead-sea-brine',
    assayId: 'dead-sea-brine',
    assayKind: 'brine',
  }, 'abundance', FAST);
  assert.equal(noLayers.status, 'ok');
  assert.equal(noLayers.softRank, null);
});

test('Lake Mackay near-miss reports its producing slate while cash ≤ 0', () => {
  const row = evaluateCandidate(searchSite('au-lake-mackay'), 'abundance', FAST);
  assert.equal(row.met, false);
  assert.ok(row.annualNetCash <= 0);
  assert.ok(row.tonnes > 0);
  assert.ok(row.activeSaleCount > 0);
  assert.equal(row.activeSaleCount, row.products.length);
  assert.equal(row.positiveSaleCount, row.activeSaleCount);
  assert.ok(row.products.every(product => product.annualRevenue > 0));
});

test('rights scenarios change eligibility, feasibility, and cash for Mejillones', () => {
  const mejillones = searchSite('chile-mejillones');
  const almeria = searchSite('spain-almeria');
  const eligibility = [
    ['abundance', RIGHTS_INTAKE_ONLY, 'no-concession'],
    ['methanol', RIGHTS_INTAKE_ONLY, true],
    ['coastal', RIGHTS_INTAKE_ONLY, true],
    ['methanol', RIGHTS_NO_RIGHTS, false],
    ['abundance', RIGHTS_NO_GRID, true],
    ['abundance', RIGHTS_FRESHWATER, 'no-freshwater'],
    ['methanol', RIGHTS_FRESHWATER, true],
    ['abundance', RIGHTS_DISCHARGE, true],
    ['methanol', RIGHTS_DISCHARGE, 'no-discharge'],
  ];
  for (const [template, scenario, expected] of eligibility) {
    const result = templateEligible(mejillones, template, scenario);
    if (typeof expected === 'string') {
      assert.equal(result.ok, false, `${template}/${scenario}`);
      assert.equal(result.reason, expected, `${template}/${scenario}`);
    } else {
      assert.equal(result.ok, expected, `${template}/${scenario}`);
    }
  }
  assert.equal(templateEligible(almeria, 'coastal', RIGHTS_DISCHARGE).reason, 'no-discharge');

  const search = rightsScenario => searchAbundanceSites({ sites: [mejillones], templates: ['abundance'], rightsScenario, sizeOpts: FAST });
  const screening = search(undefined);
  const winner = screening.ranking[0];
  assert.ok(winner && winner.feasible && winner.annualNetCash > 0, 'Mejillones abundance is cash+ under screening');
  assert.equal(winner.rightsScenario, RIGHTS_SCREENING);

  const none = search('no-rights');
  assert.equal(none.rightsScenario, RIGHTS_NO_RIGHTS);
  assert.equal(none.feasibleCount, 0);
  const fresh = search('freshwater-constrained');
  assert.equal(fresh.feasibleCount, 0);
  assert.equal(fresh.skipped.find(row => row.siteId === 'chile-mejillones').reason, 'no-freshwater');

  const offtake = search('offtake-limited');
  const offtakeHit = offtake.ranking[0] || offtake.nearMisses[0];
  assert.equal(offtakeHit.rightsScenario, RIGHTS_OFFTAKE);
  assert.ok(offtakeHit.annualNetCash < winner.annualNetCash);

  const noGrid = search('no-grid');
  const noGridHit = noGrid.ranking[0] || noGrid.nearMisses[0];
  assert.ok((winner.annualNetCash - noGridHit.annualNetCash) / Math.abs(winner.annualNetCash) > 0.10);

  const intake = searchAbundanceSites({ sites: [mejillones], templates: ['abundance', 'methanol'], rightsScenario: 'screening-assumes-intake-only', sizeOpts: FAST });
  assert.ok(!intake.ranking.some(row => row.template === 'abundance'));
  assert.equal(intake.skipped.find(row => row.template === 'abundance').reason, 'no-concession');
  assert.ok(intake.tried >= 1, 'methanol still evaluates under intake-only');

  const discharge = searchAbundanceSites({ sites: [mejillones, almeria], templates: ['methanol', 'coastal'], rightsScenario: 'discharge-limited', sizeOpts: FAST });
  assert.equal(discharge.tried, 0);
  assert.ok(discharge.skipped.every(row => row.reason === 'no-discharge'));
});

test('rights scenarios rewrite the plant rights, power price, and regional offtake ceilings', () => {
  const mejillones = searchSite('chile-mejillones');
  for (const scenario of [RIGHTS_NO_RIGHTS, RIGHTS_INTAKE_ONLY]) {
    const plant = buildAbundancePlant(mejillones, scenario);
    assert.equal(plant.site.rights.brineConcession.authorize, false, scenario);
    assert.equal(plant.site.rights.brineConcession.status, 'unverified', scenario);
  }
  const intakeFuel = buildFuelPlant(mejillones, 'methanol', RIGHTS_INTAKE_ONLY);
  assert.equal(intakeFuel.site.rights.seawaterIntake.authorize, true);
  const noGrid = buildAbundancePlant(mejillones, RIGHTS_NO_GRID);
  assert.equal(noGrid.graph.nodes.find(node => node.id === 'power').economics.unitCost, NO_GRID_POWER_USD_PER_KWH);
  assert.equal(noGrid.site.rights.gridImport.authorize, false);
  assert.equal(buildAbundancePlant(mejillones, RIGHTS_FRESHWATER).site.rights.freshwater.authorize, false);
  const discharge = buildFuelPlant(mejillones, 'methanol', RIGHTS_DISCHARGE);
  assert.equal(discharge.site.rights.seawaterDischarge.authorize, false);
  assert.equal(discharge.site.rights.seawaterIntake.authorize, true);

  const li = def => def.graph.nodes.find(node => node.id === 'lithium').economics.annualDemandLimit;
  for (const site of [mejillones, searchSite('au-lake-mackay'), brineSite()]) {
    assert.equal(li(buildAbundancePlant(site, RIGHTS_OFFTAKE)), li(buildAbundancePlant(site)) * OFFTAKE_DEMAND_FACTOR, site.id);
  }
  assert.notEqual(li(buildAbundancePlant(mejillones)), li(buildAbundancePlant(brineSite())));
});

test('fuel templates get a price×CAPEX probe: ranked only when cash+ at mid-band', () => {
  const fuelOpts = { scales: [1], rates: [5] };
  for (const [site, template] of [[searchSite('spain-almeria'), 'coastal'], [searchSite('chile-mejillones'), 'methanol']]) {
    const row = evaluateCandidate(site, template, fuelOpts);
    assert.equal(row.status, 'ok', template);
    assert.equal(row.idle, false, template);
    assert.ok(Number.isFinite(row.bestCash) && Number.isFinite(row.midCash), template);
    assert.equal(row.feasible, Boolean(row.fuelProbe.midMet), template);
    if (row.feasible) {
      assert.ok(row.annualNetCash > 0, template);
      assert.equal(row.selected.capexFactor, 1, template);
    } else {
      assert.ok(!(row.midCash > 0), template);
      assert.equal(row.selected.label, 'screening-edge', template);
    }
    const ranked = searchAbundanceSites({ sites: [site], templates: [template], sizeOpts: fuelOpts });
    assert.equal(ranked.ranking.some(item => item.template === template), row.feasible, template);
  }
});

test('materials and fuels search paths keep their templates apart', () => {
  const sites = [brineSite(), searchSite('chile-mejillones'), searchSite('spain-almeria')];
  const materials = searchAbundanceSites({ sites, sizeOpts: FAST });
  assert.equal(materials.path, PATH_MATERIALS);
  assert.deepEqual(materials.templates, MATERIALS_TEMPLATES.slice());
  assert.ok(materials.ranking.concat(materials.nearMisses, materials.skipped).every(row => row.template === 'abundance'));
  assert.equal(materials.tried, 3);

  const abundanceKey = row => [row.siteId, row.template, row.annualNetCash, row.feasible];
  const mixed = searchAbundanceSites({ sites, templates: ['abundance', 'methanol'], sizeOpts: FAST });
  assert.deepEqual(materials.ranking.map(abundanceKey), mixed.ranking.filter(row => row.template === 'abundance').map(abundanceKey));

  const fuels = searchFuelSites({ sites, sizeOpts: FAST });
  assert.equal(fuels.path, PATH_FUELS);
  assert.deepEqual(fuels.templates, FUEL_TEMPLATES.slice());
  assert.ok(fuels.ranking.concat(fuels.nearMisses, fuels.skipped).every(row => FUEL_TEMPLATES.includes(row.template)));

  const abundance = evaluateCandidate(searchSite('chile-mejillones'), 'abundance', { scales: [1], rates: [0, 5], refine: false });
  assert.equal(abundance.selected.family, 'abundance');
});

test('CLI prints JSON and exits 0 for rights scenarios and the fuels path', () => {
  const noRights = runCli(['--templates', 'abundance', '--sites', 'chile-mejillones', '--rights-scenario', 'no-rights']);
  assert.equal(noRights.rightsScenario, RIGHTS_NO_RIGHTS);
  assert.equal(noRights.cli.rightsScenario, RIGHTS_NO_RIGHTS);
  assert.equal(noRights.feasibleCount, 0);

  const fuels = runCli(['--path', 'fuels', '--sites', 'spain-almeria,chile-mejillones', '--top', '5']);
  assert.equal(fuels.path, PATH_FUELS);
  assert.ok(fuels.tried >= 1);
  assert.ok(![...fuels.ranking, ...fuels.nearMisses, ...fuels.skipped].some(row => row.template === 'abundance'));
});
