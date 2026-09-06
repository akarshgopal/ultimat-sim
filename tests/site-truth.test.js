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
