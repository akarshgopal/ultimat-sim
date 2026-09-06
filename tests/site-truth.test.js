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

test('Dead Sea site truth cites PVGIS and labels brine screening with unverified concession', () => {
  const definition = siteDeadSeaAbundance();
  const { site } = definition;
  assert.equal(site.meteo.dailyPVKWhPerKWp, DEAD_SEA_PV);
  assert.deepEqual(site.meteo.monthlyPVKWhPerKWp, DEAD_SEA_MONTHLY);
  assert.equal(site.meteo.quality, 'cited');
  assert.match(site.meteo.cite.url, /lat=31\.16/);
  assert.equal(site.assay.kind, 'brine');
  assert.equal(site.assay.quality, 'screening');
  assert.ok(site.assay.evidence.some(item => /Dead_Sea/.test(item.url)));
  assertRight(site.rights.freshwater, 'assumed');
  assertRight(site.rights.saltPurchase, 'assumed');
  assertRight(site.rights.gridImport, 'unverified');
  assertRight(site.rights.brineConcession, 'unverified');
  assertRight(site.rights.seawaterIntake, 'unverified');
  assert.ok(site.resources.brine.stream.mol['Li+'] > 0);
  const solved = solveOperation(definition);
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: brineConcession')));
  assert.ok(!solved.warnings.some(message => message.includes('unverified site right: saltPurchase')));
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
