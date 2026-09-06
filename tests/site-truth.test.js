const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { solveOperation } = require('../engine/solve');
const { sizeCoastalToMethane } = require('../engine/size');
const { createCoastalCase, DAILY_PV } = require('../cases/coastal');
const { siteDeadSeaAbundance, DEAD_SEA_PV, DAILY_PV: DEAD_SEA_MONTHLY } = require('../cases/network');
const { RIGHT_KEYS, classifyQuality } = require('../engine/uncertainty');

function assertRight(right, status) {
  assert.equal(right.status, status);
  assert.ok(RIGHT_KEYS.includes('gridImport'));
}

test('Almería site truth keeps resource streams and cites PV plus NaCl', () => {
  const definition = createCoastalCase(6);
  const { site } = definition;
  assert.equal(site.meteo.dailyPVKWhPerKWp, DAILY_PV[6]);
  assert.equal(site.dailyPVKWhPerKWp, DAILY_PV[6]);
  assert.deepEqual(site.meteo.monthlyPVKWhPerKWp, DAILY_PV);
  assert.equal(site.meteo.quality, 'cited');
  assert.equal(classifyQuality({ kind: 'meteo', quality: site.meteo.quality, sourceNote: site.meteo.cite.label }), 'cited');
  assert.match(site.meteo.cite.url, /re\.jrc\.ec\.europa\.eu/);
  assert.equal(site.assay.kind, 'seawater');
  assert.match(site.assay.summary, /NaCl/);
  assert.ok(site.assay.evidence.some(item => /noaa\.gov/.test(item.url)));
  assertRight(site.rights.seawaterIntake, 'assumed');
  assertRight(site.rights.gridImport, 'unverified');
  assertRight(site.rights.freshwater, 'unverified');
  assertRight(site.rights.brineConcession, 'unverified');
  assertRight(site.rights.saltPurchase, 'unverified');
  assert.equal(site.resources.seawater.stream.kind, 'material');
  assert.ok(site.resources.seawater.stream.mol.H2O > 0);
  assert.equal(site.resources.grid.stream.kWh, 0);
  const solved = solveOperation(definition);
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: gridImport')));
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: freshwater')));
  assert.ok(!solved.warnings.some(message => message.includes('unverified site right: seawaterIntake')));
});

test('Dead Sea site truth cites PVGIS and a literature brine assay with unverified concession', () => {
  const { SUBSTANCES, streamMassKg } = require('../engine/model');
  const definition = siteDeadSeaAbundance();
  const { site } = definition;
  assert.equal(site.meteo.dailyPVKWhPerKWp, DEAD_SEA_PV);
  assert.deepEqual(site.meteo.monthlyPVKWhPerKWp, DEAD_SEA_MONTHLY);
  assert.equal(site.meteo.quality, 'cited');
  assert.match(site.meteo.cite.url, /lat=31\.16/);
  assert.equal(site.assay.kind, 'brine');
  assert.equal(site.assay.quality, 'cited');
  assert.ok(site.assay.evidence.some(item => /Dead_Sea/.test(item.url) || /doi\.org\/10\.1016\/j\.mineng\.2021\.107038/.test(item.url)));
  assertRight(site.rights.freshwater, 'assumed');
  assertRight(site.rights.saltPurchase, 'assumed');
  assertRight(site.rights.gridImport, 'unverified');
  assertRight(site.rights.brineConcession, 'unverified');
  assert.match(site.rights.brineConcession.note, /not a mineral concession/i);
  assertRight(site.rights.seawaterIntake, 'unverified');
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
  assert.ok(!solved.warnings.some(message => message.includes('unverified site right: saltPurchase')));
});

test('frozen Dead Sea brine JSON matches the JS export and SUBSTANCES mol_per_kg', () => {
  const { SUBSTANCES } = require('../engine/model');
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

test('sizing a coastal plant keeps meteo in sync and still warns on unverified rights', () => {
  const sized = sizeCoastalToMethane(8, 0);
  assert.equal(sized.definition.site.meteo.dailyPVKWhPerKWp, sized.definition.site.dailyPVKWhPerKWp);
  assert.equal(sized.definition.site.meteo.quality, 'cited');
  assert.ok(sized.warnings.some(message => message.includes('unverified site right')));
  assert.ok(sized.solved.warnings.some(message => message.includes('unverified site right')));
});

test('the site panel has meteo, assay, and rights mounts', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="siteMeteo"/);
  assert.match(html, /id="siteAssay"/);
  assert.match(html, /id="siteRights"/);
});
