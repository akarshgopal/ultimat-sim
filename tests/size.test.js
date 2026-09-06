const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { solveOperation } = require('../engine/solve');
const { sizeToTarget, sizeCoastalToMethane } = require('../engine/size');
const { createCoastalCase } = require('../cases/coastal');
const { createSabatierCase } = require('../cases/sabatier');

function assertClosed(solved) {
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
  assert.ok(Math.abs(solved.balances.electricityKWh) < 1e-8);
  assert.ok(Math.abs(solved.balances.heatKWh) < 1e-8);
}

function moneyKeys(value, path = '') {
  const hits = [];
  if (!value || typeof value !== 'object') return hits;
  for (const [key, child] of Object.entries(value)) {
    if (/capex|opex|npv|irr|price|dollar|usd|cost|revenue|cash/i.test(key)) hits.push(`${path}${key}`);
    hits.push(...moneyKeys(child, `${path}${key}.`));
  }
  return hits;
}

test('the one-shot coastal fixture still clamps methane from a 37.5 kWp array', () => {
  const definition = createCoastalCase(12);
  assert.equal(definition.site.solarKWp, 37.5);
  const solved = solveOperation(definition);
  assert.ok(solved.nodes.sabatier.activity < 5);
  assertClosed(solved);
});

test('sizeCoastalToMethane meets a methane target by growing PV and converters', () => {
  const sized = sizeCoastalToMethane(20, 0);
  assert.ok(sized.iterations >= 1);
  assert.ok(sized.iterations <= 20);
  assert.ok(sized.residual < 1e-6);
  assert.equal(sized.converged, true);
  assert.ok(Math.abs(sized.achieved - 20) < 1e-6);
  assert.ok(sized.definition.site.solarKWp > 37.5);
  assert.equal(sized.definition.site.meteo.dailyPVKWhPerKWp, sized.definition.site.dailyPVKWhPerKWp);
  assert.ok((sized.warnings || sized.solved.warnings).some(message => message.includes('unverified site right')));
  assert.ok(sized.definition.graph.nodes.find(node => node.id === 'sabatier').capacity >= 20 - 1e-9);
  assert.ok(sized.definition.graph.nodes.find(node => node.id === 'electrolyzer').capacity > 5);
  assert.ok(sized.definition.graph.nodes.find(node => node.id === 'dac').capacity > 20);
  assert.ok(sized.definition.graph.nodes.find(node => node.id === 'swro').capacity > 0.05);
  assertClosed(sized.solved);
  assert.equal(sized.solved.nodes.sabatier.limitedBy.length, 0);
});

test('December needs more kWp than June for the same methane target', () => {
  const june = sizeCoastalToMethane(10, 6);
  const december = sizeCoastalToMethane(10, 12);
  assert.ok(december.definition.site.solarKWp > june.definition.site.solarKWp);
  assert.ok(Math.abs(june.achieved - 10) < 1e-6);
  assert.ok(Math.abs(december.achieved - 10) < 1e-6);
  assertClosed(june.solved);
  assertClosed(december.solved);
});

test('a solar cap binds and leaves a demand residual', () => {
  const sized = sizeCoastalToMethane(100, 12, { caps: { solarKWp: 37.5 }, maxIterations: 8 });
  assert.ok(sized.definition.site.solarKWp <= 37.5 + 1e-9);
  assert.ok(sized.achieved < 100 - 1);
  assert.ok(sized.residual > 1e-3);
  assert.ok(sized.history.some(step => step.capped));
  assert.deepEqual(sized.definition.operation.boundaryLimitedBy, ['sizing cap']);
  assertClosed(sized.solved);
});

test('recycle water reduces sized desalination versus once-through', () => {
  const once = sizeToTarget(() => createSabatierCase({ recycleWater: false }), 8);
  const recycled = sizeToTarget(() => createSabatierCase({ recycleWater: true }), 8);
  assert.ok(recycled.iterations >= 1);
  assert.ok(recycled.definition.graph.nodes.find(node => node.id === 'swro').capacity
    < once.definition.graph.nodes.find(node => node.id === 'swro').capacity);
  assert.ok(recycled.history[recycled.history.length - 1].duties.swro
    < once.history[once.history.length - 1].duties.swro);
  assert.ok(Math.abs(once.achieved - 8) < 1e-6);
  assert.ok(Math.abs(recycled.achieved - 8) < 1e-6);
  assertClosed(once.solved);
  assertClosed(recycled.solved);
});

test('history records physical duties each step and no dollars', () => {
  const sized = sizeCoastalToMethane(12, 3);
  assert.ok(sized.history.length === sized.iterations);
  for (const step of sized.history) {
    assert.ok(step.iteration >= 1);
    assert.equal(typeof step.residual, 'number');
    assert.ok(step.duties.ch4 > 0);
    assert.ok(step.duties.h2 > 0);
    assert.ok(step.duties.co2 > 0);
    assert.ok(step.duties.swro > 0);
    assert.ok(step.duties.electricityKWh > 0);
    assert.ok(step.duties.solarKWp > 0);
    assert.ok(step.duties.landHa > 0);
    assert.equal(moneyKeys(step).length, 0);
  }
  assert.equal(moneyKeys(sized.history).length, 0);
});

test('sizeToTarget does not mutate the input case', () => {
  const original = createCoastalCase(0);
  const snapshot = JSON.stringify(original);
  sizeToTarget(original, 15);
  assert.equal(JSON.stringify(original), snapshot);
});

test('the Foundry page loads engine/size.js and the size-to-target control', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /engine\/size\.js/);
  assert.match(html, /engine\/uncertainty\.js/);
  assert.match(html, /id="sizeToTarget"/);
  assert.match(html, /id="sizeTargetCh4"/);
  assert.match(html, /id="sizeToTargetStatus"/);
});

test('a zero methane target sizes the plant to idle', () => {
  const sized = sizeCoastalToMethane(0, 0);
  assert.equal(sized.achieved, 0);
  assert.ok(sized.residual < 1e-8);
  assert.equal(sized.definition.site.solarKWp, 0);
  assertClosed(sized.solved);
});
