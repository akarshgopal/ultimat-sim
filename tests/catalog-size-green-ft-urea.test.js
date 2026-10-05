const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { evaluateNetwork } = require('../engine/network');
const { createGreenFtCase } = require('../cases/green-ft');
const { createFtLiquidsCase } = require('../cases/ft-liquids');
const { createGreenUreaCase } = require('../cases/green-urea');
const { createUreaCase } = require('../cases/urea');
const { createMaglutCase } = require('../cases/maglut');
const { createFuelsAndMineralsNetwork } = require('../cases/network');
const { solveOperation } = require('../engine/solve');

function node(definition, unitOrId) {
  return definition.graph.nodes.find(item => item.id === unitOrId || item.unit === unitOrId);
}

function sinkMass(solved, sinkId) {
  const received = solved.nodes[sinkId]?.received;
  return received?.kind === 'material' ? streamMassKg(received) : 0;
}

test('sizeToProduct diesel 2000 kg/day on green-FT scales electrolyzer + swro + solar; purchased FT still works', () => {
  const baseline = createGreenFtCase();
  const sized = sizeToProduct({ product: 'diesel', rate: 2000, caseOrBuilder: createGreenFtCase });
  assert.equal(sized.product, 'diesel');
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `diesel sink ${sized.achieved}`);
  const ft = node(sized.definition, 'ft-liquids');
  assert.ok(Math.abs(ft.capacity - 2000) / 2000 < 0.05, `ft-liquids capacity ${ft.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes['ft-liquids'].activity - 2000) / 2000 < 0.05,
    `ft activity ${sized.solved.nodes['ft-liquids'].activity}`);
  const diesel = sinkMass(sized.solved, 'diesel-product');
  assert.ok(Math.abs(diesel - 2000) / 2000 < 0.05, `diesel sink mass ${diesel}`);

  const baseEl = Number(node(baseline, 'electrolyzer').capacity);
  const nextEl = Number(node(sized.definition, 'electrolyzer').capacity);
  const baseSwro = Number(node(baseline, 'swro').capacity);
  const nextSwro = Number(node(sized.definition, 'swro').capacity);
  assert.ok(Math.abs(nextEl - 2 * baseEl) / (2 * baseEl) < 0.05, `electrolyzer ${nextEl} vs 2× ${baseEl}`);
  assert.ok(Math.abs(nextSwro - 2 * baseSwro) / (2 * baseSwro) < 0.05, `swro ${nextSwro} vs 2× ${baseSwro}`);
  assert.ok(!sized.definition.graph.nodes.some(item => item.id === 'hydrogen-feed'));
  assert.ok(sized.definition.site.solarKWp > baseline.site.solarKWp,
    `solarKWp ${sized.definition.site.solarKWp} vs baseline ${baseline.site.solarKWp}`);

  const cash = evaluateEconomics(sized.definition, sized.solved);
  const baseCash = evaluateEconomics(baseline, solveOperation(baseline));
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(cash.installedCapex > baseCash.installedCapex,
    `installedCapex ${cash.installedCapex} vs baseline ${baseCash.installedCapex}`);
  assert.ok(cash.installedCapex > 1.4 * baseCash.installedCapex
    && cash.installedCapex < 2.8 * baseCash.installedCapex,
    `CAPEX ${cash.installedCapex} vs ~2× baseline ${baseCash.installedCapex}`);
  assert.ok(true, `green-FT diesel 2000 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex} baseCAPEX=${baseCash.installedCapex} baseCash=${baseCash.annualNetCash}`);

  const purchased = sizeToProduct({ product: 'diesel', rate: 2000, caseOrBuilder: createFtLiquidsCase });
  assert.equal(purchased.product, 'diesel');
  assert.ok(Math.abs(purchased.achieved - 2000) / 2000 < 0.05, `purchased diesel ${purchased.achieved}`);
  assert.ok(purchased.definition.graph.nodes.some(item => item.id === 'hydrogen-feed'));
  assert.ok(!purchased.definition.graph.nodes.some(item => item.unit === 'electrolyzer'));
});

test('sizeToProduct urea 2000 kg/day on green-urea scales electrolyzer + ammonia + swro + asu; purchased urea still works', () => {
  const baseline = createGreenUreaCase();
  const sized = sizeToProduct({ product: 'urea', rate: 2000, caseOrBuilder: createGreenUreaCase });
  assert.equal(sized.product, 'urea');
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `urea sink ${sized.achieved}`);
  const urea = node(sized.definition, 'urea');
  assert.ok(Math.abs(urea.capacity - 2000) / 2000 < 0.05, `urea capacity ${urea.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes.urea.activity - 2000) / 2000 < 0.05,
    `urea activity ${sized.solved.nodes.urea.activity}`);
  const product = sinkMass(sized.solved, 'urea-product');
  assert.ok(Math.abs(product - 2000) / 2000 < 0.05, `urea sink mass ${product}`);

  const baseEl = Number(node(baseline, 'electrolyzer').capacity);
  const nextEl = Number(node(sized.definition, 'electrolyzer').capacity);
  const baseNh3 = Number(node(baseline, 'ammonia').capacity);
  const nextNh3 = Number(node(sized.definition, 'ammonia').capacity);
  const baseSwro = Number(node(baseline, 'swro').capacity);
  const nextSwro = Number(node(sized.definition, 'swro').capacity);
  const baseAsu = Number(node(baseline, 'asu').capacity);
  const nextAsu = Number(node(sized.definition, 'asu').capacity);
  assert.ok(Math.abs(nextEl - 2 * baseEl) / (2 * baseEl) < 0.05, `electrolyzer ${nextEl} vs 2× ${baseEl}`);
  assert.ok(Math.abs(nextNh3 - 2 * baseNh3) / (2 * baseNh3) < 0.05, `ammonia ${nextNh3} vs 2× ${baseNh3}`);
  assert.ok(Math.abs(nextSwro - 2 * baseSwro) / (2 * baseSwro) < 0.05, `swro ${nextSwro} vs 2× ${baseSwro}`);
  assert.ok(Math.abs(nextAsu - 2 * baseAsu) / (2 * baseAsu) < 0.05, `asu ${nextAsu} vs 2× ${baseAsu}`);
  assert.ok(!sized.definition.graph.nodes.some(item => item.id === 'ammonia-feed'));
  assert.ok(sized.definition.site.solarKWp > baseline.site.solarKWp,
    `solarKWp ${sized.definition.site.solarKWp} vs baseline ${baseline.site.solarKWp}`);

  const cash = evaluateEconomics(sized.definition, sized.solved);
  const baseCash = evaluateEconomics(baseline, solveOperation(baseline));
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(cash.installedCapex > baseCash.installedCapex,
    `installedCapex ${cash.installedCapex} vs baseline ${baseCash.installedCapex}`);
  assert.ok(cash.installedCapex > 1.4 * baseCash.installedCapex
    && cash.installedCapex < 2.8 * baseCash.installedCapex,
    `CAPEX ${cash.installedCapex} vs ~2× baseline ${baseCash.installedCapex}`);
  assert.ok(true, `green-urea 2000 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex} baseCAPEX=${baseCash.installedCapex} baseCash=${baseCash.annualNetCash}`);

  const purchased = sizeToProduct({ product: 'urea', rate: 2000, caseOrBuilder: createUreaCase });
  assert.equal(purchased.product, 'urea');
  assert.ok(Math.abs(purchased.achieved - 2000) / 2000 < 0.05, `purchased urea ${purchased.achieved}`);
  assert.ok(purchased.definition.graph.nodes.some(item => item.id === 'ammonia-feed'));
  assert.ok(!purchased.definition.graph.nodes.some(item => item.unit === 'electrolyzer'));
});

test('Maglut cash stays ≈1299; network evaluate stays finite; green-FT / green-urea freight binds stay', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);

  const network = evaluateNetwork(createFuelsAndMineralsNetwork(6));
  assert.ok(Number.isFinite(network.annualNetCash), `network annualNetCash ${network.annualNetCash}`);

  const greenFtCash = evaluateEconomics(createGreenFtCase(), solveOperation(createGreenFtCase()));
  assert.ok(greenFtCash.breakdown.freight > 0, `green-ft freight ${greenFtCash.breakdown.freight}`);
  assert.ok(Number.isFinite(greenFtCash.annualNetCash), `green-ft annualNetCash ${greenFtCash.annualNetCash}`);

  const greenUreaCash = evaluateEconomics(createGreenUreaCase(), solveOperation(createGreenUreaCase()));
  assert.ok(greenUreaCash.breakdown.freight > 0, `green-urea freight ${greenUreaCash.breakdown.freight}`);
  assert.ok(Number.isFinite(greenUreaCash.annualNetCash), `green-urea annualNetCash ${greenUreaCash.annualNetCash}`);
});

test('Size-to-target load status mentions green-FT diesel and green-urea stacks', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(source, /Size-to-target → diesel resizes this stack/);
  assert.match(source, /Size-to-target → urea resizes this stack/);
});
