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
  LAYER_SOFT_NOTE,
  RIGHTS_SCREENING,
  RIGHTS_INTAKE_ONLY,
  RIGHTS_NO_RIGHTS,
  RIGHTS_OFFTAKE,
  RIGHTS_NONE,
  OFFTAKE_DEMAND_FACTOR,
  FAST_SCALES,
  FAST_RATES,
  SEARCH_RATES,
  SEARCH_SCALES,
  templateEligible,
  buildAbundancePlant,
  buildFuelPlant,
  frozenSolarFor,
  evaluateCandidate,
  resolveAbundanceAssayId,
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

test('new catalog presets are searchable: brine hubs abundance-eligible, desal coasts seawater-eligible', () => {
  const gsl = searchSite('us-great-salt-lake');
  assert.ok(gsl, 'us-great-salt-lake');
  assert.equal(gsl.hasBrineAssay, true);
  assert.equal(gsl.hasSeawaterAssay, false);
  assert.equal(gsl.assayKind, 'brine');
  assert.equal(gsl.assayId, 'great-salt-lake-brine');
  assert.equal(gsl.brineAssayId, 'great-salt-lake-brine');
  assert.equal(gsl.kind, 'brine-hub');
  assert.equal(gsl.region, 'US West / Utah');
  assert.equal(templateEligible(gsl, 'abundance').ok, true);
  assert.equal(templateEligible(gsl, 'coastal').ok, false);
  assert.equal(templateEligible(gsl, 'coastal').reason, 'no-seawater-assay');

  const salar = searchSite('chile-salar-de-atacama');
  assert.ok(salar, 'chile-salar-de-atacama');
  assert.equal(salar.hasBrineAssay, true);
  assert.equal(salar.hasSeawaterAssay, false);
  assert.equal(salar.assayId, 'atacama-lithium-brine');
  assert.equal(salar.kind, 'brine-hub');
  assert.equal(templateEligible(salar, 'abundance').ok, true);
  assert.equal(templateEligible(salar, 'coastal').reason, 'no-seawater-assay');
  assert.notEqual(salar.id, 'chile-mejillones');

  const ras = searchSite('saudi-ras-al-khair');
  assert.ok(ras, 'saudi-ras-al-khair');
  assert.equal(ras.hasSeawaterAssay, true);
  assert.equal(ras.hasBrineAssay, true);
  assert.equal(ras.seawaterAssayId, 'persian-gulf-seawater');
  assert.equal(ras.brineAssayId, 'persian-gulf-sabkha-brine');
  assert.equal(ras.assayKind, 'brine');
  assert.equal(ras.assayId, 'persian-gulf-sabkha-brine');
  assert.equal(templateEligible(ras, 'abundance').ok, true);
  assert.equal(templateEligible(ras, 'coastal').ok, true);
  assert.equal(ras.rightsHints.seawaterIntake.status, 'assumed');

  const salton = searchSite('us-salton-sea');
  assert.ok(salton, 'us-salton-sea');
  assert.equal(salton.hasBrineAssay, true);
  assert.equal(salton.hasSeawaterAssay, false);
  assert.equal(salton.assayKind, 'brine');
  assert.equal(salton.assayId, 'salton-sea-brine');
  assert.equal(salton.brineAssayId, 'salton-sea-brine');
  assert.equal(salton.kind, 'brine-hub');
  assert.equal(salton.region, 'US West / California');
  assert.equal(templateEligible(salton, 'abundance').ok, true);
  assert.equal(templateEligible(salton, 'coastal').ok, false);
  assert.equal(templateEligible(salton, 'coastal').reason, 'no-seawater-assay');

  const yanbu = searchSite('saudi-yanbu');
  assert.ok(yanbu, 'saudi-yanbu');
  assert.equal(yanbu.hasSeawaterAssay, true);
  assert.equal(yanbu.hasBrineAssay, false);
  assert.equal(yanbu.seawaterAssayId, 'red-sea-seawater');
  assert.equal(templateEligible(yanbu, 'abundance').reason, 'no-brine-assay');
  assert.equal(templateEligible(yanbu, 'coastal').ok, true);
  assert.equal(yanbu.rightsHints.seawaterIntake.status, 'assumed');
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
  assert.ok(result.notes.includes(LAYER_SOFT_NOTE));
  assert.match(SCREENING_NOTE, /not a bankable permit/i);
});

test('site-search plants bind regional TEA when site.region is set', () => {
  const mejillones = searchSite('chile-mejillones');
  const abundance = buildAbundancePlant(mejillones);
  const lithium = abundance.graph.nodes.find(node => node.id === 'lithium');
  assert.equal(abundance.meta.demandRegionId, 'chile-atacama');
  assert.equal(lithium.economics.annualDemandLimit, 2e7);
  assert.equal(lithium.economics.unitPrice, 14);

  const methanol = buildFuelPlant(mejillones, 'methanol');
  const sale = methanol.graph.nodes.find(node => node.id === 'methanol-product');
  assert.equal(methanol.site.region, 'Atacama/Chile');
  assert.equal(sale.economics.demandRegionId, 'chile-atacama');
  assert.equal(sale.economics.unitPrice, 0.4);

  const almeria = searchSite('spain-almeria');
  const coastal = buildFuelPlant(almeria, 'coastal');
  const methane = coastal.graph.nodes.find(node => node.id === 'methane');
  assert.equal(coastal.site.region, 'Europe');
  assert.equal(methane.economics.demandRegionId, 'europe');

  const salton = searchSite('us-salton-sea');
  const saltonPlant = buildAbundancePlant(salton);
  assert.equal(saltonPlant.meta.assayId, 'salton-sea-brine');
  assert.equal(saltonPlant.meta.demandRegionId, 'texas');
  const saltonLi = saltonPlant.graph.nodes.find(node => node.id === 'lithium');
  assert.equal(saltonLi.economics.demandRegionId, 'texas');
  const saltonBrine = saltonPlant.graph.nodes.find(node => node.id === 'brine');
  assert.ok(saltonBrine.params.stream.mol['Li+'] > 0);
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
  assert.ok(skipped.skipped.every(row => row.assayId == null), 'seawater-only coasts must not inherit dead-sea-brine');
  assert.ok(skipped.skipped.every(row => row.rightsScenario === RIGHTS_SCREENING || row.rightsScenario === RIGHTS_NONE));
  assert.equal(skipped.ranking.length, 0);
  assert.equal(resolveAbundanceAssayId(seawater), null);
  assert.equal(resolveAbundanceAssayId(noAssay), null);
  assert.equal(resolveAbundanceAssayId(searchSite('saudi-ras-al-khair')), 'persian-gulf-sabkha-brine');
  assert.equal(templateEligible(searchSite('saudi-ras-al-khair'), 'abundance').ok, true);
  assert.equal(resolveAbundanceAssayId(searchSite('chile-mejillones')), 'atacama-lithium-brine');
  assert.equal(resolveAbundanceAssayId(brineSite()), 'dead-sea-brine');
  assert.equal(resolveAbundanceAssayId(null), null);

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

test('coastal/methanol use per-site frozen PVGIS and skip coasts that still lack one', () => {
  const pvgisSites = require('../data/pvgis-sites.js');
  const duqm = defaultSearchSites().find(site => site.id === 'oman-duqm');
  const mundra = defaultSearchSites().find(site => site.id === 'india-mundra');
  const walvis = defaultSearchSites().find(site => site.id === 'namibia-walvis-bay');
  const taweelah = defaultSearchSites().find(site => site.id === 'uae-taweelah');
  const yanbu = defaultSearchSites().find(site => site.id === 'saudi-yanbu');
  const almeria = defaultSearchSites().find(site => site.id === 'spain-almeria');
  const mejillones = defaultSearchSites().find(site => site.id === 'chile-mejillones');
  const almeriaSolar = frozenSolarFor(almeria, 'coastal');
  const mejillonesSolar = frozenSolarFor(mejillones, 'methanol');
  const frozenCoasts = [
    ['oman-duqm', 'data/pvgis-duqm.json', 1770.4, 19.65, 57.7],
    ['india-mundra', 'data/pvgis-mundra.json', 1654.06, 22.737, 69.71],
    ['namibia-walvis-bay', 'data/pvgis-walvis-bay.json', 2000.67, -22.957, 14.505],
    ['uae-taweelah', 'data/pvgis-taweelah.json', 1758.02, 24.761, 54.683],
    ['qatar-ras-laffan', 'data/pvgis-ras-laffan.json', 1760.51, 25.888, 51.557],
    ['saudi-oxagon', 'data/pvgis-oxagon.json', 1847.62, 28.131, 34.921],
    ['saudi-ras-al-khair', 'data/pvgis-ras-al-khair.json', 1753.58, 27.534, 49.171],
    ['texas-corpus-christi', 'data/pvgis-corpus-christi.json', 1477.75, 27.813, -97.396],
    ['au-port-hedland', 'data/pvgis-port-hedland.json', 1779.01, -20.31, 118.576],
    ['morocco-agadir', 'data/pvgis-agadir.json', 1769.7, 30.427, -9.598],
    ['egypt-ain-sokhna', 'data/pvgis-ain-sokhna.json', 1817.08, 29.648, 32.356],
    ['saudi-yanbu', 'data/pvgis-yanbu.json', 1836.01, 24.089, 38.064],
    ['au-kwinana', 'data/pvgis-kwinana.json', 1200.43, -32.232, 115.77],
    ['morocco-dakhla', 'data/pvgis-dakhla.json', 2001.69, 23.714, -15.937],
  ];

  for (const [id, file, eY, lat, lon] of frozenCoasts) {
    const site = defaultSearchSites().find(row => row.id === id);
    assert.equal(site.hasSeawaterAssay, true, id);
    const pvgis = require(path.join(__dirname, '..', file));
    const monthly = pvgis.outputs.monthly.fixed.map(row => row.E_d);
    assert.equal(monthly.length, 12, id);
    assert.equal(pvgis.outputs.totals.fixed.E_y, eY, id);
    assert.equal(pvgis.inputs.location.latitude, lat, id);
    assert.equal(pvgis.inputs.location.longitude, lon, id);
    assert.equal(pvgis.inputs.meteo_data.radiation_db, 'PVGIS-ERA5', id);
    assert.equal(pvgis.meta.retrieved, '2026-09-21', id);
    assert.match(pvgis.meta.notes, /not Almer[ií]a/i);
    assert.ok(pvgis.meta.query, id);
    const coastalSolar = frozenSolarFor(site, 'coastal');
    const methanolSolar = frozenSolarFor(site, 'methanol');
    assert.ok(coastalSolar, id);
    assert.ok(methanolSolar, id);
    assert.equal(coastalSolar.retrieved, '2026-09-21', id);
    assert.match(coastalSolar.source, /PVGIS-ERA5/, id);
    assert.equal(coastalSolar.keepHourly, false, id);
    assert.equal(coastalSolar.dailyPVKWhPerKWp, eY / 365, id);
    assert.deepEqual(coastalSolar.monthlyPVKWhPerKWp.slice(1), monthly, id);
    assert.notDeepEqual(coastalSolar.monthlyPVKWhPerKWp, almeriaSolar.monthlyPVKWhPerKWp, id);
    assert.notDeepEqual(coastalSolar.monthlyPVKWhPerKWp, mejillonesSolar.monthlyPVKWhPerKWp, id);
    assert.notEqual(eY, 1716.39, id);
    assert.notEqual(eY, 1923.52, id);
    assert.equal(templateEligible(site, 'coastal').ok, true, id);
    assert.equal(templateEligible(site, 'methanol').ok, true, id);
    const evaluated = evaluateCandidate(site, 'coastal', FAST);
    assert.equal(evaluated.status, 'ok', id);
    assert.notEqual(evaluated.reason, 'no-frozen-pvgis', id);
  }

  assert.equal(yanbu.hasSeawaterAssay, true);
  assert.ok(frozenSolarFor(yanbu, 'coastal'));
  assert.ok(frozenSolarFor(yanbu, 'methanol'));
  assert.equal(templateEligible(yanbu, 'coastal').ok, true);
  assert.equal(templateEligible(yanbu, 'methanol').ok, true);

  const unfrozen = {
    id: 'no-pvgis-coast',
    name: 'Unfrozen screening coast',
    hasSeawaterAssay: true,
    seawaterAssayId: 'red-sea-seawater',
    assayId: 'red-sea-seawater',
    assayKind: 'seawater',
  };
  assert.equal(frozenSolarFor(unfrozen, 'coastal'), null);
  assert.equal(frozenSolarFor(unfrozen, 'methanol'), null);
  assert.equal(templateEligible(unfrozen, 'coastal').reason, 'no-frozen-pvgis');
  assert.equal(templateEligible(unfrozen, 'methanol').reason, 'no-frozen-pvgis');
  const unfrozenEval = evaluateCandidate(unfrozen, 'coastal', FAST);
  assert.equal(unfrozenEval.status, 'skipped');
  assert.equal(unfrozenEval.reason, 'no-frozen-pvgis');

  assert.equal(duqm.assayId, 'arabian-sea-seawater');
  assert.equal(mundra.assayId, 'gulf-of-kutch-seawater');
  assert.equal(walvis.assayId, 'benguela-atlantic-seawater');
  assert.ok(pvgisSites.BY_SITE_ID['chile-mejillones']);
  assert.ok(pvgisSites.BY_SITE_ID['mejillones-pvgis-2026-09-14']);
  assert.ok(pvgisSites.BY_SITE_ID['spain-almeria']);
  assert.ok(pvgisSites.BY_SITE_ID['almeria-pvgis-2026-09-05']);
  assert.ok(pvgisSites.BY_SITE_ID['dead-sea-pvgis-2026-09-06']);
  assert.equal(require('../data/pvgis-mejillones.json').meta.retrieved, '2026-09-14');
  assert.equal(require('../data/pvgis-almeria.json').meta.retrieved, '2026-09-05');
  assert.equal(require('../data/pvgis-dead-sea.json').meta.retrieved, '2026-09-06');
  assert.ok(frozenSolarFor(almeria, 'coastal'));
  assert.equal(frozenSolarFor(almeria, 'coastal').keepHourly, true);
  assert.equal(frozenSolarFor(almeria, 'coastal').retrieved, '2026-09-05');
  assert.ok(frozenSolarFor(mejillones, 'methanol'));
  assert.equal(frozenSolarFor(mejillones, 'methanol').retrieved, '2026-09-14');
  assert.ok(frozenSolarFor({ id: 'almeria-pvgis-2026-09-05' }, 'coastal'));
  assert.ok(frozenSolarFor({ id: 'mejillones-pvgis-2026-09-14' }, 'methanol'));
  assert.equal(templateEligible(almeria, 'coastal').ok, true);
  assert.equal(templateEligible(mejillones, 'methanol').ok, true);
  assert.equal(templateEligible(almeria, 'abundance').ok, false);
  assert.ok(frozenSolarFor(brineSite(), 'abundance'));
  assert.equal(frozenSolarFor(brineSite(), 'abundance').retrieved, '2026-09-06');
  assert.equal(templateEligible(brineSite(), 'abundance').ok, true);

  const inlandHubs = [
    ['au-lake-mackay', 'data/pvgis-lake-mackay.json', 1369.45, -22.5, 128.5],
    ['us-great-salt-lake', 'data/pvgis-great-salt-lake.json', 1729.31, 41.15, -112.55],
    ['chile-salar-de-atacama', 'data/pvgis-salar-de-atacama.json', 1628.15, -23.5, -68.25],
  ];
  for (const [id, file, eY, lat, lon] of inlandHubs) {
    const site = defaultSearchSites().find(row => row.id === id);
    assert.ok(site, id);
    assert.equal(site.hasBrineAssay, true, id);
    const pvgis = require(path.join(__dirname, '..', file));
    assert.equal(pvgis.outputs.totals.fixed.E_y, eY, id);
    assert.equal(pvgis.inputs.location.latitude, lat, id);
    assert.equal(pvgis.inputs.location.longitude, lon, id);
    assert.equal(pvgis.inputs.meteo_data.radiation_db, 'PVGIS-ERA5', id);
    assert.equal(pvgis.meta.retrieved, '2026-09-21', id);
    const solar = frozenSolarFor(site, 'abundance');
    assert.ok(solar, id);
    assert.equal(solar.retrieved, '2026-09-21', id);
    assert.match(solar.source, /PVGIS-ERA5/, id);
    assert.equal(solar.dailyPVKWhPerKWp, eY / 365, id);
    assert.equal(templateEligible(site, 'abundance').ok, true, id);
    const evaluated = evaluateCandidate(site, 'abundance', FAST);
    assert.equal(evaluated.status, 'ok', id);
    assert.ok(!evaluated.notes.some(note => /No frozen PVGIS/i.test(note)), id);
  }

  const searched = searchAbundanceSites({
    sites: [duqm, mundra, walvis, taweelah, yanbu],
    templates: ['coastal', 'methanol'],
    sizeOpts: FAST,
  });
  assert.equal(searched.tried, 10);
  assert.equal(searched.skippedCount, 0);
  assert.ok(!searched.skipped.some(row => row.reason === 'no-frozen-pvgis'));
  assert.ok(!searched.skipped.some(row => ['oman-duqm', 'india-mundra', 'namibia-walvis-bay', 'uae-taweelah', 'saudi-yanbu'].includes(row.siteId)));
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

test('soft rank breaks equal-primary ties; missing layers do not exclude', () => {
  const base = {
    template: 'abundance',
    tonnes: 10,
    positiveSaleCount: 2,
    annualNetCash: 50,
    feasible: true,
    met: true,
  };
  const ranked = rankCandidates([
    { ...base, siteId: 'z-low', layerScore: 0.2, softRank: 0.2 },
    { ...base, siteId: 'a-high', layerScore: 0.9, softRank: 0.9 },
    { ...base, siteId: 'm-missing', layerScore: null, softRank: null },
  ]);
  assert.equal(ranked[0].siteId, 'a-high');
  assert.equal(ranked.length, 3);
  assert.ok(ranked.some(row => row.siteId === 'm-missing'));
  assert.deepEqual(ranked.map(row => row.siteId), ['a-high', 'm-missing', 'z-low']);

  const cashWins = rankCandidates([
    { ...base, siteId: 'high-soft', annualNetCash: 10, layerScore: 0.99, softRank: 0.99 },
    { ...base, siteId: 'high-cash', annualNetCash: 50, layerScore: 0.01, softRank: 0.01 },
  ]);
  assert.equal(cashWins[0].siteId, 'high-cash');

  const near = [
    { ...base, siteId: 'z-low', feasible: false, met: false, annualNetCash: -20, layerScore: 0.2, softRank: 0.2 },
    { ...base, siteId: 'a-high', feasible: false, met: false, annualNetCash: -20, layerScore: 0.9, softRank: 0.9 },
    { ...base, siteId: 'm-missing', feasible: false, met: false, annualNetCash: -20, layerScore: null, softRank: null },
  ].sort(compareNearMisses);
  assert.deepEqual(near.map(row => row.siteId), ['a-high', 'm-missing', 'z-low']);

  const almeria = searchSite('spain-almeria');
  const scored = evaluateCandidate(almeria, 'coastal', FAST);
  assert.equal(typeof scored.layerScore, 'number');
  assert.equal(scored.softRank, scored.layerScore);
  assert.ok(scored.notes.includes(LAYER_SOFT_NOTE));
  assert.match(LAYER_SOFT_NOTE, /not optimizer objectives/i);

  const noLayers = evaluateCandidate({
    id: 'nowhere',
    name: 'No coordinates',
    latitude: NaN,
    longitude: NaN,
    hasBrineAssay: true,
    brineAssayId: 'dead-sea-brine',
    assayId: 'dead-sea-brine',
    assayKind: 'brine',
  }, 'abundance', FAST);
  assert.equal(noLayers.status, 'ok');
  assert.equal(noLayers.layerScore, null);
  assert.equal(noLayers.softRank, null);
});

test('soft rank uses frozen PVGIS yield when present and still scores sites without land $/ha', () => {
  const mapSite = require('../engine/map-site');
  const duqm = searchSite('oman-duqm');
  const solar = frozenSolarFor(duqm, 'coastal');
  assert.ok(solar?.dailyPVKWhPerKWp > 0);
  const scored = evaluateCandidate(duqm, 'coastal', FAST);
  const expected = mapSite.layerScoreAt(duqm.latitude, duqm.longitude, {
    dailyPVKWhPerKWp: solar.dailyPVKWhPerKWp,
    frozen: true,
  });
  const screening = mapSite.layerScoreAt(duqm.latitude, duqm.longitude);
  assert.equal(scored.layerScore, expected);
  assert.equal(scored.softRank, expected);
  assert.notEqual(expected, screening);
  assert.equal(mapSite.landPriceAt(duqm.latitude, duqm.longitude), null);

  const mejillones = searchSite('chile-mejillones');
  const mejSolar = frozenSolarFor(mejillones, 'methanol');
  const mejEval = evaluateCandidate(mejillones, 'methanol', FAST);
  assert.equal(mejEval.layerScore, mapSite.layerScoreAt(mejillones.latitude, mejillones.longitude, {
    dailyPVKWhPerKWp: mejSolar.dailyPVKWhPerKWp,
    frozen: true,
  }));
  assert.equal(mejEval.softRank, mejEval.layerScore);
  assert.equal(typeof mejEval.layerScore, 'number');
  assert.equal(mapSite.landPriceAt(mejillones.latitude, mejillones.longitude), null);
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

test('no-rights makes screening-cash+ Mejillones abundance infeasible/skipped; offtake changes cash', () => {
  const mejillones = searchSite('chile-mejillones');
  const screening = searchAbundanceSites({
    sites: [mejillones],
    templates: ['abundance'],
    sizeOpts: FAST,
  });
  const winner = screening.ranking[0];
  assert.ok(winner, 'Mejillones abundance should be cash+ under screening');
  assert.equal(screening.rightsScenario, RIGHTS_SCREENING);
  assert.equal(winner.rightsScenario, RIGHTS_SCREENING);
  assert.equal(winner.feasible, true);
  assert.equal(winner.met, true);
  assert.ok(winner.annualNetCash > 0);

  const none = searchAbundanceSites({
    sites: [mejillones],
    templates: ['abundance'],
    rightsScenario: 'no-rights',
    sizeOpts: FAST,
  });
  assert.equal(none.rightsScenario, RIGHTS_NO_RIGHTS);
  assert.equal(none.feasibleCount, 0);
  assert.equal(none.ranking.length, 0);
  const skipped = none.skipped.find(row => row.siteId === 'chile-mejillones' && row.template === 'abundance');
  const miss = none.nearMisses.find(row => row.siteId === 'chile-mejillones' && row.template === 'abundance');
  const hit = skipped || miss;
  assert.ok(hit, 'no-rights should skip or return a non-cash+ row');
  assert.equal(hit.feasible, false);
  assert.equal(hit.met, false);
  assert.equal(hit.rightsScenario, RIGHTS_NO_RIGHTS);
  if (skipped) {
    assert.equal(skipped.reason, 'no-rights');
    assert.equal(skipped.status, 'skipped');
  } else {
    assert.ok(!(hit.annualNetCash > 0));
  }
  const plant = buildAbundancePlant(mejillones, RIGHTS_NO_RIGHTS);
  assert.equal(plant.site.rights.brineConcession.authorize, false);
  assert.equal(plant.site.rights.brineConcession.status, 'unverified');

  const offtake = searchAbundanceSites({
    sites: [mejillones],
    templates: ['abundance'],
    rightsScenario: 'offtake-limited',
    sizeOpts: FAST,
  });
  assert.equal(offtake.rightsScenario, RIGHTS_OFFTAKE);
  const offtakeHit = offtake.ranking[0] || offtake.nearMisses[0];
  assert.ok(offtakeHit);
  assert.equal(offtakeHit.rightsScenario, RIGHTS_OFFTAKE);
  assert.ok(Number.isFinite(offtakeHit.annualNetCash));
  assert.notEqual(offtakeHit.annualNetCash, winner.annualNetCash);
  assert.ok(offtakeHit.annualNetCash < winner.annualNetCash);

  const script = path.join(__dirname, '..', 'scripts/abundance-site-search.mjs');
  const ran = spawnSync(process.execPath, [
    script,
    '--fast',
    '--templates', 'abundance',
    '--sites', 'chile-mejillones',
    '--rights-scenario', 'no-rights',
  ], { encoding: 'utf8', timeout: 60000 });
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  const payload = JSON.parse(ran.stdout);
  assert.equal(payload.rightsScenario, RIGHTS_NO_RIGHTS);
  assert.equal(payload.feasibleCount, 0);
  assert.equal(payload.cli.rightsScenario, RIGHTS_NO_RIGHTS);
});

test('screening-assumes-intake-only skips abundance (no concession) but keeps fuel intake', () => {
  const mejillones = searchSite('chile-mejillones');
  assert.equal(templateEligible(mejillones, 'abundance').ok, true);
  assert.equal(templateEligible(mejillones, 'methanol').ok, true);
  assert.equal(templateEligible(mejillones, 'abundance', RIGHTS_INTAKE_ONLY).ok, false);
  assert.equal(templateEligible(mejillones, 'abundance', RIGHTS_INTAKE_ONLY).reason, 'no-concession');
  assert.equal(templateEligible(mejillones, 'methanol', RIGHTS_INTAKE_ONLY).ok, true);
  assert.equal(templateEligible(mejillones, 'coastal', RIGHTS_INTAKE_ONLY).ok, true);
  assert.equal(templateEligible(mejillones, 'methanol', RIGHTS_NO_RIGHTS).ok, false);

  const screening = searchAbundanceSites({
    sites: [mejillones],
    templates: ['abundance', 'methanol'],
    sizeOpts: FAST,
  });
  const screeningAbund = screening.ranking.find(row => row.template === 'abundance')
    || screening.nearMisses.find(row => row.template === 'abundance');
  assert.ok(screeningAbund, 'screening should evaluate Mejillones abundance');
  assert.equal(screeningAbund.feasible, true);
  assert.ok(screeningAbund.annualNetCash > 0);

  const intakeOnly = searchAbundanceSites({
    sites: [mejillones],
    templates: ['abundance', 'methanol'],
    rightsScenario: 'screening-assumes-intake-only',
    sizeOpts: FAST,
  });
  assert.equal(intakeOnly.rightsScenario, RIGHTS_INTAKE_ONLY);
  assert.ok(!intakeOnly.ranking.some(row => row.template === 'abundance'));
  const skippedAbund = intakeOnly.skipped.find(row => row.siteId === 'chile-mejillones' && row.template === 'abundance');
  assert.ok(skippedAbund);
  assert.equal(skippedAbund.reason, 'no-concession');
  assert.equal(skippedAbund.feasible, false);
  assert.equal(skippedAbund.rightsScenario, RIGHTS_INTAKE_ONLY);
  assert.ok(!intakeOnly.skipped.some(row => row.template === 'methanol'));
  assert.ok(intakeOnly.tried >= 1, 'methanol should still be evaluated under intake-only');

  const plant = buildAbundancePlant(mejillones, RIGHTS_INTAKE_ONLY);
  assert.equal(plant.site.rights.brineConcession.authorize, false);
  assert.equal(plant.site.rights.brineConcession.status, 'unverified');
  const fuel = buildFuelPlant(mejillones, 'methanol', RIGHTS_INTAKE_ONLY);
  assert.equal(fuel.site.rights.seawaterIntake.authorize, true);
  assert.equal(fuel.site.rights.brineConcession.authorize, false);

  const cli = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'scripts/abundance-site-search.mjs'),
    '--fast',
    '--templates', 'abundance,methanol',
    '--sites', 'chile-mejillones',
    '--rights-scenario', 'screening-assumes-intake-only',
  ], { encoding: 'utf8', timeout: 60000 });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const payload = JSON.parse(cli.stdout);
  assert.equal(payload.rightsScenario, RIGHTS_INTAKE_ONLY);
  assert.ok(!payload.ranking.some(row => row.template === 'abundance'));
  assert.ok(payload.skipped.some(row => row.template === 'abundance' && row.reason === 'no-concession'));
  assert.equal(payload.cli.rightsScenario, RIGHTS_INTAKE_ONLY);
});

test('offtake-limited haircut applies to regional mineral ceilings, not a shared me-levant table', () => {
  const chile = buildAbundancePlant(searchSite('chile-mejillones'), RIGHTS_OFFTAKE);
  const australia = buildAbundancePlant(searchSite('au-lake-mackay'), RIGHTS_OFFTAKE);
  const levant = buildAbundancePlant(brineSite(), RIGHTS_OFFTAKE);
  const li = def => def.graph.nodes.find(node => node.id === 'lithium').economics.annualDemandLimit;
  const br = def => def.graph.nodes.find(node => node.id === 'bromine').economics.annualDemandLimit;
  assert.equal(li(chile), 2e7 * OFFTAKE_DEMAND_FACTOR);
  assert.equal(li(australia), 5e6 * OFFTAKE_DEMAND_FACTOR);
  assert.equal(li(levant), 1e6 * OFFTAKE_DEMAND_FACTOR);
  assert.notEqual(li(chile), li(australia));
  assert.notEqual(li(australia), li(levant));
  assert.equal(br(australia), 2e6 * OFFTAKE_DEMAND_FACTOR);
  assert.equal(br(levant), 2e8 * OFFTAKE_DEMAND_FACTOR);
  assert.notEqual(br(australia), br(levant));
});

test('SEARCH_RATES is slightly denser than 0/2/5; FAST_RATES stays tiny for CI', () => {
  assert.ok(SEARCH_RATES.includes(0));
  assert.ok(SEARCH_RATES.includes(1) || SEARCH_RATES.includes(10));
  assert.ok(SEARCH_RATES.includes(2));
  assert.ok(SEARCH_RATES.includes(5));
  assert.ok(SEARCH_RATES.length <= 6, 'do not explode the joint grid');
  assert.deepEqual(FAST_RATES, [0]);
  assert.deepEqual(FAST_SCALES, [1]);
  assert.ok(SEARCH_SCALES.length >= 3);
});

test('coastal/methanol get a screening price×CAPEX probe: cash+ only at mid-band, else annotated near-miss', () => {
  const almeria = searchSite('spain-almeria');
  const mejillones = searchSite('chile-mejillones');
  const fuelOpts = { scales: [1], rates: [5] };

  const coastal = evaluateCandidate(almeria, 'coastal', fuelOpts);
  assert.equal(coastal.status, 'ok');
  assert.equal(coastal.template, 'coastal');
  assert.equal(coastal.idle, false);
  assert.ok('breakEvenPrice' in coastal);
  assert.ok(Number.isFinite(coastal.bestCash));
  assert.ok(Number.isFinite(coastal.midCash));
  assert.ok(coastal.fuelProbe);
  assert.equal(coastal.fuelProbe.bounds.priceMid, 1);
  assert.equal(coastal.fuelProbe.bounds.capexMin, 0.05);
  assert.equal(coastal.feasible, Boolean(coastal.fuelProbe.midMet));
  assert.ok(coastal.notes.some(note => /screening/i.test(note)));
  if (coastal.feasible) {
    assert.ok(coastal.annualNetCash > 0);
    assert.equal(coastal.selected.capexFactor, 1);
    assert.equal(coastal.selected.label, 'screening');
    assert.ok(coastal.notes.some(note => /mid-band/i.test(note)));
  } else {
    assert.ok(!(coastal.midCash > 0));
    assert.equal(coastal.selected.label, 'screening-edge');
    assert.ok(coastal.breakEvenPrice === null || Number.isFinite(coastal.breakEvenPrice));
    assert.ok(coastal.notes.some(note => /green-premium|not an invented fuel winner|not ranked/i.test(note)));
  }

  const methanol = evaluateCandidate(mejillones, 'methanol', fuelOpts);
  assert.equal(methanol.status, 'ok');
  assert.equal(methanol.template, 'methanol');
  assert.equal(methanol.idle, false);
  assert.ok('breakEvenPrice' in methanol);
  assert.ok(Number.isFinite(methanol.bestCash));
  assert.ok(Number.isFinite(methanol.midCash));
  assert.ok(methanol.fuelProbe);
  assert.equal(methanol.fuelProbe.bounds.priceMin, 0.25);
  assert.equal(methanol.fuelProbe.bounds.priceMax, 0.5);
  assert.equal(methanol.fuelProbe.bounds.priceMid, 0.4);
  assert.equal(methanol.feasible, Boolean(methanol.fuelProbe.midMet));
  assert.ok(methanol.notes.some(note => /screening|commodity/i.test(note)));
  if (methanol.feasible) {
    assert.ok(methanol.annualNetCash > 0);
    assert.ok(methanol.notes.some(note => /mid-band/i.test(note)));
    assert.equal(methanol.selected.label, 'screening');
    assert.equal(methanol.selected.capexFactor, 1);
    assert.ok(methanol.selected.screeningPrice >= 0.25 && methanol.selected.screeningPrice <= 0.5);
  } else {
    assert.ok(!(methanol.midCash > 0));
    assert.equal(methanol.selected.label, 'screening-edge');
    if (methanol.fuelProbe.best?.met) {
      assert.ok(methanol.fuelProbe.best.capexFactor < 1 - 1e-9 || methanol.fuelProbe.best.price !== methanol.fuelProbe.bounds.priceMid);
    }
    assert.ok(methanol.breakEvenPrice === null || Number.isFinite(methanol.breakEvenPrice));
    assert.ok(methanol.notes.some(note => /not an invented fuel winner|not ranked/i.test(note)));
  }

  const ranked = searchAbundanceSites({
    sites: [mejillones],
    templates: ['methanol'],
    sizeOpts: fuelOpts,
  });
  if (methanol.feasible) {
    assert.ok(ranked.ranking.some(row => row.template === 'methanol' && row.siteId === 'chile-mejillones'));
    assert.ok(ranked.feasibleCount >= 1);
    assert.ok(ranked.ranking.every(row => row.selected?.capexFactor === 1));
  } else {
    assert.equal(ranked.feasibleCount, 0);
    assert.ok(!ranked.ranking.some(row => row.template === 'methanol'));
    assert.ok(ranked.nearMisses.some(row => (
      row.template === 'methanol'
      && row.siteId === 'chile-mejillones'
      && Number.isFinite(row.bestCash)
      && row.selected?.label === 'screening-edge'
    )));
  }
});

test('abundance winners report selected.family abundance, not fuel/ammonia', () => {
  const mejillones = searchSite('chile-mejillones');
  const abundance = evaluateCandidate(mejillones, 'abundance', {
    scales: [1],
    rates: [0, 5],
    refine: false,
  });
  assert.equal(abundance.status, 'ok');
  assert.equal(abundance.template, 'abundance');
  assert.ok(abundance.selected);
  assert.equal(abundance.selected.family, 'abundance');
  assert.notEqual(abundance.selected.product, 'ammonia');
  assert.notEqual(abundance.selected.family, 'fuel');
  assert.notEqual(abundance.selected.family, 'joint');
  const mineralIds = new Set(['lithium', 'salt', 'magnesium', 'potash', 'gypsum', 'caustic', 'bromine', 'bromide']);
  assert.ok((abundance.products || []).some(product => mineralIds.has(product.id)));
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
