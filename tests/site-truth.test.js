const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { sizeCoastalToMethane, sizeToTarget, sizeToProduct } = require('../engine/size');
const { createCoastalCase, DAILY_PV, INTAKE_M3_PER_DAY } = require('../cases/coastal');
const { siteDeadSeaAbundance, DEAD_SEA_PV, DAILY_PV: DEAD_SEA_MONTHLY } = require('../cases/network');
const { RIGHT_KEYS, RIGHT_KINDS, classifyQuality, authorizeForStatus } = require('../engine/uncertainty');

function assertRight(right, status, kind) {
  assert.equal(right.status, status);
  assert.equal(right.kind, kind);
  assert.equal(right.authorize, status === 'authorized' || status === 'assumed');
  assert.equal(right.authorize, authorizeForStatus(status));
  assert.ok(RIGHT_KEYS.includes('gridImport'));
  assert.equal(RIGHT_KINDS[Object.keys(RIGHT_KINDS).find(key => RIGHT_KINDS[key] === kind) || ''], kind);
}

test('Almería site truth keeps resource streams and cites PV plus Millero-scale seawater', () => {
  const definition = createCoastalCase(6);
  const { site } = definition;
  assert.equal(site.meteo.dailyPVKWhPerKWp, DAILY_PV[6]);
  assert.equal(site.dailyPVKWhPerKWp, DAILY_PV[6]);
  assert.deepEqual(site.meteo.monthlyPVKWhPerKWp, DAILY_PV);
  assert.equal(site.meteo.quality, 'cited');
  assert.equal(classifyQuality({ kind: 'meteo', quality: site.meteo.quality, sourceNote: site.meteo.cite.label }), 'cited');
  assert.match(site.meteo.cite.url, /re\.jrc\.ec\.europa\.eu/);
  assert.equal(site.assay.kind, 'seawater');
  assert.match(site.assay.summary, /Millero|Alboran|36\.5/);
  assert.match(site.assay.summary, /not a NaCl proxy/i);
  assert.ok(site.assay.evidence.some(item => /doi\.org\/10\.1016\/j\.dsr\.2007\.10\.001/.test(item.url)));
  assert.ok(site.assay.evidence.some(item => /Alboran_Sea/.test(item.url)));
  assertRight(site.rights.seawaterIntake, 'assumed', 'intake');
  assertRight(site.rights.seawaterDischarge, 'unverified', 'discharge');
  assertRight(site.rights.gridImport, 'unverified', 'grid');
  assertRight(site.rights.freshwater, 'unverified', 'freshwater');
  assertRight(site.rights.brineConcession, 'unverified', 'concession');
  assertRight(site.rights.saltPurchase, 'unverified', 'purchase');
  assert.equal(site.resources.seawater.quality, 'cited');
  assert.equal(site.resources.seawater.stream.kind, 'material');
  assert.ok(site.resources.seawater.stream.mol.H2O > 0);
  assert.ok(site.resources.seawater.stream.mol['Mg+2'] > 0);
  assert.ok(site.resources.seawater.stream.mol['SO4-2'] > 0);
  assert.equal(site.resources.seawater.stream.mol.HCO3, undefined);
  assert.equal(site.resources.seawater.stream.mol['HCO3-'], undefined);
  assert.ok(Math.abs(streamMassKg(site.resources.seawater.stream) - INTAKE_M3_PER_DAY * 1026) < 1e-9);
  assert.equal(site.resources.grid.stream.kWh, 0);
  assert.equal(site.resources.freshwater.stream.mol.H2O, 0);
  const swro = definition.graph.nodes.find(node => node.id === 'swro' || node.unit === 'swro');
  assert.equal(swro.params.feedDensityKgM3, 1026);
  const solved = solveOperation(definition);
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: gridImport')));
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: freshwater')));
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: seawaterDischarge')));
  assert.ok(!solved.warnings.some(message => message.includes('unverified site right: seawaterIntake')));
});

test('Dead Sea site truth cites PVGIS and a literature brine assay with unverified concession', () => {
  const definition = siteDeadSeaAbundance();
  const { site } = definition;
  assert.equal(site.meteo.dailyPVKWhPerKWp, DEAD_SEA_PV);
  assert.deepEqual(site.meteo.monthlyPVKWhPerKWp, DEAD_SEA_MONTHLY);
  assert.equal(site.meteo.quality, 'cited');
  assert.match(site.meteo.cite.url, /lat=31\.16/);
  assert.equal(site.assay.kind, 'brine');
  assert.equal(site.assay.quality, 'cited');
  assert.ok(site.assay.evidence.some(item => /Dead_Sea/.test(item.url) || /doi\.org\/10\.1016\/j\.mineng\.2021\.107038/.test(item.url)));
  assertRight(site.rights.freshwater, 'assumed', 'freshwater');
  assertRight(site.rights.saltPurchase, 'assumed', 'purchase');
  assertRight(site.rights.gridImport, 'unverified', 'grid');
  assertRight(site.rights.brineConcession, 'unverified', 'concession');
  assert.match(site.rights.brineConcession.note, /not a mineral concession/i);
  assertRight(site.rights.seawaterIntake, 'unverified', 'intake');
  assertRight(site.rights.seawaterDischarge, 'unverified', 'discharge');
  assert.match(site.rights.seawaterDischarge.note, /inland/i);
  const brine = site.resources.brine.stream;
  assert.ok(brine.mol['Mg+2'] > 0);
  assert.ok(brine.mol['Cl-'] > 0);
  assert.ok(brine.mol['Li+'] > 0);
  const mgKg = brine.mol['Mg+2'] * SUBSTANCES['Mg+2'].molarMassG / 1000;
  const naKg = brine.mol['Na+'] * SUBSTANCES['Na+'].molarMassG / 1000;
  assert.ok(mgKg > naKg, 'Dead Sea open water is Mg-rich relative to Na');
  assert.ok(streamMassKg(brine) > 0);
  const solved = solveOperation(definition);
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: brineConcession')));
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: seawaterDischarge')));
  assert.ok(!solved.warnings.some(message => message.includes('unverified site right: saltPurchase')));
});

test('frozen Dead Sea brine JSON matches the JS export and SUBSTANCES mol_per_kg', () => {
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dead-sea-brine.json'), 'utf8'));
  const js = require('../data/dead-sea-brine.js');
  assert.deepEqual(js, json);
  assert.equal(json.ions_g_per_kg['Cl-'], 181.4);
  assert.equal(json.ions_g_per_kg['Mg+2'], 35.2);
  assert.equal(json.ions_g_per_kg['Na+'], 32.5);
  assert.ok(Math.abs(json.ions_g_per_kg['Li+'] - 0.018 / 1.24) < 1e-12);
  for (const [id, grams] of Object.entries(json.ions_g_per_kg)) {
    assert.ok(Math.abs(json.mol_per_kg[id] - grams / SUBSTANCES[id].molarMassG) < 1e-12);
  }
});

test('frozen Almería seawater JSON matches the JS export and scaled Millero majors', () => {
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'almeria-seawater.json'), 'utf8'));
  const js = require('../data/almeria-seawater.js');
  assert.deepEqual(js, json);
  assert.equal(json.density_kg_per_L, 1.026);
  assert.equal(json.salinity_g_per_kg, 36.5);
  assert.equal(json.meta.retrieved, '2026-09-06');
  const scale = 36.5 / 35;
  assert.ok(Math.abs(json.ions_g_per_kg['Cl-'] - 19.353 * scale) < 1e-12);
  assert.ok(Math.abs(json.ions_g_per_kg['Na+'] - 10.781 * scale) < 1e-12);
  assert.ok(Math.abs(json.ions_g_per_kg['SO4-2'] - 2.712 * scale) < 1e-12);
  assert.ok(Math.abs(json.ions_g_per_kg['Mg+2'] - 1.284 * scale) < 1e-12);
  assert.ok(Math.abs(json.ions_g_per_kg['Ca+2'] - 0.4119 * scale) < 1e-12);
  assert.ok(Math.abs(json.ions_g_per_kg['K+'] - 0.399 * scale) < 1e-12);
  assert.ok(Math.abs(json.ions_g_per_kg['Br-'] - 0.0673 * scale) < 1e-12);
  assert.equal(json.ions_g_per_kg.HCO3, undefined);
  assert.equal(json.ions_g_per_kg['HCO3-'], undefined);
  for (const [id, grams] of Object.entries(json.ions_g_per_kg)) {
    assert.ok(Math.abs(json.mol_per_kg[id] - grams / SUBSTANCES[id].molarMassG) < 1e-12);
  }
  assert.ok(json.evidence.some(item => /doi\.org\/10\.1016\/j\.dsr\.2007\.10\.001/.test(item.url)));
  assert.ok(json.evidence.some(item => /Alboran_Sea/.test(item.url)));
});

test('sizing a coastal plant keeps meteo in sync and still warns on unverified rights', () => {
  const sized = sizeCoastalToMethane(8, 0);
  assert.equal(sized.definition.site.meteo.dailyPVKWhPerKWp, sized.definition.site.dailyPVKWhPerKWp);
  assert.equal(sized.definition.site.meteo.quality, 'cited');
  assert.ok(sized.warnings.some(message => message.includes('unverified site right')));
  assert.ok(sized.solved.warnings.some(message => message.includes('unverified site right')));
  assert.equal(sized.definition.site.resources.grid.stream.kWh, 0);
  assert.equal(sized.definition.site.resources.freshwater.stream.mol.H2O, 0);
});

test('size-to-target cannot assume unverified intake or brine concession', () => {
  const coastal = createCoastalCase(0);
  coastal.site.rights.seawaterIntake.status = 'unverified';
  coastal.site.rights.seawaterIntake.authorize = false;
  assert.throws(() => sizeToTarget(coastal, 8), /size-to-target cannot assume seawaterIntake/);
  assert.throws(
    () => sizeToProduct({ product: 'lithium', rate: 1, definition: siteDeadSeaAbundance() }),
    /size-to-target cannot assume brineConcession/,
  );
});

test('the site panel has meteo, assay, and rights mounts', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="siteMeteo"/);
  assert.match(html, /id="siteAssay"/);
  assert.match(html, /id="siteRights"/);
  assert.match(html, /data\/almeria-seawater\.js/);
});
