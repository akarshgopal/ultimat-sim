const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { createGreenMtoCase } = require('../cases/green-mto');
const { createMtoCase } = require('../cases/mto');
const { createMaglutCase } = require('../cases/maglut');
const { solveOperation } = require('../engine/solve');

function node(definition, unitOrId) {
  return definition.graph.nodes.find(item => item.id === unitOrId || item.unit === unitOrId);
}

function sinkMass(solved, sinkId) {
  const received = solved.nodes[sinkId]?.received;
  return received?.kind === 'material' ? streamMassKg(received) : 0;
}

test('sizeToProduct ethylene 2000 kg/day on green-MTO scales methanol + electrolyzer + swro + solar; purchased MTO still works', () => {
  const baseline = createGreenMtoCase();
  const sized = sizeToProduct({ product: 'ethylene', rate: 2000, caseOrBuilder: createGreenMtoCase });
  assert.equal(sized.product, 'ethylene');
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `ethylene sink ${sized.achieved}`);
  const mto = node(sized.definition, 'mto');
  assert.ok(Math.abs(mto.capacity - 2000) / 2000 < 0.05, `mto capacity ${mto.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes.mto.activity - 2000) / 2000 < 0.05,
    `mto activity ${sized.solved.nodes.mto.activity}`);
  const ethylene = sinkMass(sized.solved, 'ethylene-product');
  assert.ok(Math.abs(ethylene - 2000) / 2000 < 0.05, `ethylene sink mass ${ethylene}`);

  const baseMeoh = Number(node(baseline, 'methanol').capacity);
  const nextMeoh = Number(node(sized.definition, 'methanol').capacity);
  const baseEl = Number(node(baseline, 'electrolyzer').capacity);
  const nextEl = Number(node(sized.definition, 'electrolyzer').capacity);
  const baseSwro = Number(node(baseline, 'swro').capacity);
  const nextSwro = Number(node(sized.definition, 'swro').capacity);
  assert.ok(Math.abs(nextMeoh - 2 * baseMeoh) / (2 * baseMeoh) < 0.05, `methanol ${nextMeoh} vs 2× ${baseMeoh}`);
  assert.ok(Math.abs(nextEl - 2 * baseEl) / (2 * baseEl) < 0.05, `electrolyzer ${nextEl} vs 2× ${baseEl}`);
  assert.ok(Math.abs(nextSwro - 2 * baseSwro) / (2 * baseSwro) < 0.05, `swro ${nextSwro} vs 2× ${baseSwro}`);
  assert.ok(!sized.definition.graph.nodes.some(item => item.id === 'methanol-feed'));
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
  assert.ok(true, `green-MTO ethylene 2000 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex} baseCAPEX=${baseCash.installedCapex} baseCash=${baseCash.annualNetCash}`);

  const sanity = sizeToProduct({ product: 'ethylene', rate: 1000, caseOrBuilder: createGreenMtoCase });
  assert.ok(Math.abs(sanity.achieved - 1000) / 1000 < 0.05, `ethylene 1000 ${sanity.achieved}`);

  const purchased = sizeToProduct({ product: 'ethylene', rate: 2000, caseOrBuilder: createMtoCase });
  assert.equal(purchased.product, 'ethylene');
  assert.ok(Math.abs(purchased.achieved - 2000) / 2000 < 0.05, `purchased ethylene ${purchased.achieved}`);
  assert.ok(purchased.definition.graph.nodes.some(item => item.id === 'methanol-feed'));
  assert.ok(!purchased.definition.graph.nodes.some(item => item.unit === 'electrolyzer'));
});

test('Maglut cash stays ≈1299 after green-MTO size', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('Size-to-target load status mentions green-MTO ethylene stack', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(source, /Size-to-target → ethylene resizes this stack/);
});
