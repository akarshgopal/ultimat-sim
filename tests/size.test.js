const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { solveOperation, solveHorizon } = require('../engine/solve');
const DAC_HEAT_PER_KG_CO2 = 1.5;
const { sizeToTarget, sizeCoastalToMethane, sizeToProduct } = require('../engine/size');
const { createCoastalCase } = require('../cases/coastal');
const { createSabatierCase } = require('../cases/sabatier');
const { createAbundanceCase } = require('../cases/abundance');

const WATER_KG_PER_KG_H2 = SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;

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

test('sizeToProduct H2 parks Sabatier and DAC on a coastal methane plant', () => {
  const sized = sizeToProduct({ product: 'H2', rate: 10, caseOrBuilder: () => createCoastalCase(0) });
  assert.ok(Math.abs(sized.achieved - 10) < 1e-6);
  assert.equal(sized.definition.graph.nodes.find(node => node.id === 'sabatier').capacity, 0);
  assert.equal(sized.definition.graph.nodes.find(node => node.id === 'dac').capacity, 0);
  assert.equal(sized.definition.operation.setpoints.sabatier, 0);
  assert.equal(sized.definition.operation.setpoints.dac, 0);
  assert.ok(sized.definition.graph.nodes.find(node => node.id === 'electrolyzer').capacity >= 10 - 1e-9);
  assert.ok(sized.definition.site.solarKWp > 0);
  assert.ok(sized.residual < 1e-6);
});

test('sizeToProduct lithium scales the abundance brine train', () => {
  const sized = sizeToProduct({ product: 'LiCl', rate: 20, caseOrBuilder: createAbundanceCase });
  assert.equal(sized.product, 'lithium');
  assert.ok(sized.iterations >= 1);
  assert.ok(sized.residual < 1e-6);
  assert.equal(sized.converged, true);
  assert.ok(Math.abs(sized.achieved - 20) < 1e-6);
  const brine = sized.definition.graph.nodes.find(node => node.id === 'brine');
  assert.ok(streamMassKg(brine.params.stream) > 100000);
  assert.ok(sized.definition.graph.nodes.find(node => node.id === 'minerals').capacity > 100000);
  assert.equal(moneyKeys(sized.history).length, 0);
});

test('sizeToProduct salt meets a Dead Sea salt target', () => {
  const sized = sizeToProduct({ product: 'salt', rate: 8000, definition: createAbundanceCase() });
  assert.equal(sized.product, 'salt');
  assert.ok(Math.abs(sized.achieved - 8000) < 1e-4);
  assert.ok(sized.residual < 1e-6);
  assert.equal(moneyKeys(sized.history).length, 0);
});

test('CH4 heat credit lowers solar versus heatCredit:false', () => {
  const withCredit = sizeCoastalToMethane(15, 0);
  const withoutCredit = sizeCoastalToMethane(15, 0, { heatCredit: false });
  assert.ok(withCredit.definition.site.solarKWp < withoutCredit.definition.site.solarKWp);
  assert.ok(withCredit.heatCoveredKWh > 0);
  const purchasedWith = withCredit.history.at(-1).duties.heatKWh;
  const purchasedWithout = withoutCredit.history.at(-1).duties.heatKWh;
  const demandWithout = withoutCredit.history.at(-1).duties.co2 * DAC_HEAT_PER_KG_CO2;
  assert.ok(purchasedWith < purchasedWithout);
  assert.ok(Math.abs(purchasedWithout - demandWithout) / Math.max(1, demandWithout) < 1e-6);
  assert.ok(Math.abs(withCredit.achieved - 15) < 1e-6);
  assert.ok(Math.abs(withoutCredit.achieved - 15) < 1e-6);
  assertClosed(withCredit.solved);
  assertClosed(withoutCredit.solved);
  assert.ok(withCredit.definition.graph.nodes.some(node => node.unit === 'heat-source'));
});

test('Sabatier waste colder than DAC minHeat gets no cascade credit', () => {
  const sized = sizeToTarget(() => createSabatierCase({
    recycleWater: false,
    params: { sabatier: { wasteHeatT_C: 50 }, dac: { minHeatT_C: 80 } },
  }), 8);
  const last = sized.history.at(-1).duties;
  assert.ok(last.heatCoveredKWh < 1e-6);
  const demand = last.co2 * DAC_HEAT_PER_KG_CO2;
  assert.ok(Math.abs(last.heatKWh - demand) / Math.max(1, demand) < 1e-6);
  assert.ok(Math.abs(last.heatResidualKWh - demand) / Math.max(1, demand) < 1e-6);
  assert.ok(Math.abs(sized.achieved - 8) < 1e-6);
  assertClosed(sized.solved);
});

test('H2 sizing does not credit parked Sabatier waste heat', () => {
  const sized = sizeToProduct({ product: 'H2', rate: 10, caseOrBuilder: () => createCoastalCase(0) });
  const last = sized.history.at(-1).duties;
  assert.equal(last.ch4, 0);
  assert.ok((last.heatCoveredKWh || 0) < 1e-9);
  assert.ok((sized.heatCoveredKWh || 0) < 1e-9);
  const swro = 10 * WATER_KG_PER_KG_H2 / 1000;
  const processKWh = 10 * 55 + swro * 3.5;
  assert.ok(Math.abs(last.electricityKWh - processKWh) / processKWh < 1e-6);
  const heat = sized.definition.graph.nodes.find(node => node.unit === 'heat-source');
  assert.ok(heat);
  assert.ok((heat.params.stream.kWh || 0) < 1e-9);
  assert.ok(Math.abs(sized.achieved - 10) < 1e-6);
});

test('coastal H2 size closes mass balance and horizon produces hydrogen', () => {
  const sized = sizeToProduct({ product: 'H2', rate: 15, caseOrBuilder: () => createCoastalCase(0) });
  assert.equal(sized.product, 'H2');
  assert.ok(Math.abs(sized.achieved - 15) < 1e-6);
  assert.ok(sized.solved.balances.maxAbsResidual < 1e-6);
  assert.ok(sized.definition.graph.nodes.some(node => node.id === 'hydrogen' && node.unit === 'material-sink'));
  const edge = sized.definition.graph.edges.find(item => item.from.node === 'electrolyzer' && item.from.port === 'hydrogen');
  assert.equal(edge.to.node, 'hydrogen');
  const horizon = solveHorizon(sized.definition);
  assert.ok(horizon.nodes.electrolyzer.activity > 1, `horizon H2 activity ${horizon.nodes.electrolyzer.activity}`);
  assert.ok(horizon.nodes.electrolyzer.activity <= 15 + 1e-6);
  if (horizon.nodes.electrolyzer.activity + 1e-6 < 15) {
    assert.ok(horizon.nodes.electrolyzer.limitedBy.length, 'undersized horizon must name a binding constraint');
  }
});
