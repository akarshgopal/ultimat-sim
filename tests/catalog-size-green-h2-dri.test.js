const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { createGreenH2DriCase } = require('../cases/green-h2-dri');
const { createH2DriCase } = require('../cases/h2-dri');
const { createMaglutCase } = require('../cases/maglut');
const { solveOperation } = require('../engine/solve');

function node(definition, unitOrId) {
  return definition.graph.nodes.find(item => item.id === unitOrId || item.unit === unitOrId);
}

function sinkMass(solved, sinkId) {
  const received = solved.nodes[sinkId]?.received;
  return received?.kind === 'material' ? streamMassKg(received) : 0;
}

test('sizeToProduct steel 1000 and 2000 kg/day on green H2-DRI scale electrolyzer + swro + solar; purchased H2-DRI still works', () => {
  const baseline = createGreenH2DriCase();
  const baseEl = Number(node(baseline, 'electrolyzer').capacity);
  const baseSwro = Number(node(baseline, 'swro').capacity);
  const baseCash = evaluateEconomics(baseline, solveOperation(baseline));

  const sized1000 = sizeToProduct({ product: 'steel', rate: 1000, caseOrBuilder: createGreenH2DriCase });
  assert.equal(sized1000.product, 'steel');
  assert.ok(Math.abs(sized1000.achieved - 1000) / 1000 < 0.05, `Fe sink 1000 ${sized1000.achieved}`);
  const dri1000 = node(sized1000.definition, 'hydrogen-dri');
  assert.ok(Math.abs(dri1000.capacity - 1000) / 1000 < 0.05, `dri 1000 ${dri1000.capacity}`);
  assert.ok(Math.abs(sized1000.solved.nodes[dri1000.id].activity - 1000) / 1000 < 0.05,
    `dri activity 1000 ${sized1000.solved.nodes[dri1000.id].activity}`);
  const steel1000 = sinkMass(sized1000.solved, 'steel');
  assert.ok(Math.abs(steel1000 - 1000) / 1000 < 0.05, `steel sink 1000 ${steel1000}`);
  const el1000 = Number(node(sized1000.definition, 'electrolyzer').capacity);
  const swro1000 = Number(node(sized1000.definition, 'swro').capacity);
  assert.ok(Math.abs(el1000 - baseEl) / baseEl < 0.05, `electrolyzer 1000 ${el1000} vs baseline ${baseEl}`);
  assert.ok(Math.abs(swro1000 - baseSwro) / baseSwro < 0.05, `swro 1000 ${swro1000} vs baseline ${baseSwro}`);
  assert.ok(!sized1000.definition.graph.nodes.some(item => item.id === 'hydrogen-feed'));
  assert.ok(Number.isFinite(sized1000.definition.site.solarKWp) && sized1000.definition.site.solarKWp > 0,
    `solarKWp 1000 ${sized1000.definition.site.solarKWp}`);
  const cash1000 = evaluateEconomics(sized1000.definition, sized1000.solved);
  assert.ok(Number.isFinite(cash1000.annualNetCash), `annualNetCash 1000 ${cash1000.annualNetCash}`);
  assert.ok(true, `green H2-DRI steel 1000 cash R=${cash1000.annualRevenue} net=${cash1000.annualNetCash} kWp=${sized1000.definition.site.solarKWp} CAPEX=${cash1000.installedCapex}`);

  const sized = sizeToProduct({ product: 'steel', rate: 2000, caseOrBuilder: createGreenH2DriCase });
  assert.equal(sized.product, 'steel');
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `Fe sink 2000 ${sized.achieved}`);
  const dri = node(sized.definition, 'hydrogen-dri');
  assert.ok(Math.abs(dri.capacity - 2000) / 2000 < 0.05, `dri 2000 ${dri.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes[dri.id].activity - 2000) / 2000 < 0.05,
    `dri activity 2000 ${sized.solved.nodes[dri.id].activity}`);
  const steel = sinkMass(sized.solved, 'steel');
  assert.ok(Math.abs(steel - 2000) / 2000 < 0.05, `steel sink 2000 ${steel}`);

  const nextEl = Number(node(sized.definition, 'electrolyzer').capacity);
  const nextSwro = Number(node(sized.definition, 'swro').capacity);
  assert.ok(Math.abs(nextEl - 2 * el1000) / (2 * el1000) < 0.05, `electrolyzer ${nextEl} vs 2× ${el1000}`);
  assert.ok(Math.abs(nextSwro - 2 * swro1000) / (2 * swro1000) < 0.05, `swro ${nextSwro} vs 2× ${swro1000}`);
  assert.ok(!sized.definition.graph.nodes.some(item => item.id === 'hydrogen-feed'));
  assert.ok(sized.definition.site.solarKWp > sized1000.definition.site.solarKWp,
    `solarKWp ${sized.definition.site.solarKWp} vs 1000 ${sized1000.definition.site.solarKWp}`);

  const cash = evaluateEconomics(sized.definition, sized.solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(cash.installedCapex > baseCash.installedCapex,
    `installedCapex ${cash.installedCapex} vs baseline ${baseCash.installedCapex}`);
  assert.ok(cash.installedCapex > 1.4 * baseCash.installedCapex
    && cash.installedCapex < 2.8 * baseCash.installedCapex,
    `CAPEX ${cash.installedCapex} vs ~2× baseline ${baseCash.installedCapex}`);
  assert.ok(true, `green H2-DRI steel 2000 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex} baseCAPEX=${baseCash.installedCapex} baseCash=${baseCash.annualNetCash}`);

  const purchased = sizeToProduct({ product: 'steel', rate: 2000, caseOrBuilder: createH2DriCase });
  assert.equal(purchased.product, 'steel');
  assert.ok(Math.abs(purchased.achieved - 2000) / 2000 < 0.05, `purchased steel ${purchased.achieved}`);
  assert.ok(purchased.definition.graph.nodes.some(item => item.id === 'hydrogen-feed'));
  assert.ok(!purchased.definition.graph.nodes.some(item => item.unit === 'electrolyzer'));
});

test('Maglut cash stays ≈1299 after green H2-DRI size', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});
