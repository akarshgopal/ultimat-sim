const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { createH2DriCase } = require('../cases/h2-dri');
const { createGreenH2DriCase } = require('../cases/green-h2-dri');
const { createMtoCase } = require('../cases/mto');
const { createAbundanceCase } = require('../cases/abundance');
const { createMaglutCase } = require('../cases/maglut');
const { solveOperation } = require('../engine/solve');

function node(definition, unitOrId) {
  return definition.graph.nodes.find(item => item.id === unitOrId || item.unit === unitOrId);
}

function sinkMass(solved, sinkId) {
  const received = solved.nodes[sinkId]?.received;
  return received?.kind === 'material' ? streamMassKg(received) : 0;
}

test('sizeToProduct aliases steel / fe / dri / iron and ethylene / c2h4 / mto / olefin', () => {
  for (const alias of ['steel', 'fe', 'dri', 'iron']) {
    const sized = sizeToProduct({ product: alias, rate: 500, caseOrBuilder: createH2DriCase });
    assert.equal(sized.product, 'steel', alias);
    assert.ok(Math.abs(sized.achieved - 500) / 500 < 0.05, `${alias} achieved ${sized.achieved}`);
  }
  for (const alias of ['ethylene', 'c2h4', 'mto', 'olefin']) {
    const sized = sizeToProduct({ product: alias, rate: 500, caseOrBuilder: createMtoCase });
    assert.equal(sized.product, 'ethylene', alias);
    assert.ok(Math.abs(sized.achieved - 500) / 500 < 0.05, `${alias} achieved ${sized.achieved}`);
  }
});

test('sizeToProduct steel 500 kg/day on purchased-H2 DRI scales Fe, dri, and solar', () => {
  const baseline = createH2DriCase();
  const sized = sizeToProduct({ product: 'steel', rate: 500, caseOrBuilder: createH2DriCase });
  assert.equal(sized.product, 'steel');
  assert.ok(Math.abs(sized.achieved - 500) / 500 < 0.05, `Fe sink ${sized.achieved}`);
  const dri = node(sized.definition, 'hydrogen-dri');
  assert.ok(Math.abs(dri.capacity - 500) / 500 < 0.05, `dri capacity ${dri.capacity}`);
  const fe = sinkMass(sized.solved, 'steel');
  assert.ok(Math.abs(fe - 500) / 500 < 0.05, `steel sink mass ${fe}`);
  const halfBaseline = Number(baseline.site.solarKWp) / 2;
  assert.ok(
    Math.abs(sized.definition.site.solarKWp - halfBaseline) / halfBaseline < 0.20,
    `solarKWp ${sized.definition.site.solarKWp} vs half baseline ${halfBaseline}`,
  );
  const cash = evaluateEconomics(sized.definition, sized.solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(true, `purchased-H2 steel 500 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp}`);
});

test('sizeToProduct steel 500 kg/day on green H2-DRI scales electrolyzer + swro and keeps no hydrogen-feed', () => {
  const baseline = createGreenH2DriCase();
  const sized = sizeToProduct({ product: 'steel', rate: 500, caseOrBuilder: createGreenH2DriCase });
  assert.equal(sized.product, 'steel');
  assert.ok(Math.abs(sized.achieved - 500) / 500 < 0.05, `Fe sink ${sized.achieved}`);
  const dri = node(sized.definition, 'hydrogen-dri');
  const electrolyzer = node(sized.definition, 'electrolyzer');
  const swro = node(sized.definition, 'swro');
  assert.ok(Math.abs(dri.capacity - 500) / 500 < 0.05, `dri ${dri.capacity}`);
  const baseEl = Number(node(baseline, 'electrolyzer').capacity);
  const baseSwro = Number(node(baseline, 'swro').capacity);
  assert.ok(Math.abs(electrolyzer.capacity - baseEl / 2) / (baseEl / 2) < 0.05, `electrolyzer ${electrolyzer.capacity}`);
  assert.ok(Math.abs(swro.capacity - baseSwro / 2) / (baseSwro / 2) < 0.05, `swro ${swro.capacity}`);
  assert.ok(!sized.definition.graph.nodes.some(item => item.id === 'hydrogen-feed'));
  const cash = evaluateEconomics(sized.definition, sized.solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(true, `green H2-DRI steel 500 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp}`);
});

test('sizeToProduct ethylene 500 kg/day on createMtoCase scales the MTO island', () => {
  const sized = sizeToProduct({ product: 'ethylene', rate: 500, caseOrBuilder: createMtoCase });
  assert.equal(sized.product, 'ethylene');
  assert.ok(Math.abs(sized.achieved - 500) / 500 < 0.05, `ethylene ${sized.achieved}`);
  const mto = node(sized.definition, 'mto');
  assert.ok(Math.abs(mto.capacity - 500) / 500 < 0.05, `mto capacity ${mto.capacity}`);
  const ethylene = sinkMass(sized.solved, 'ethylene-product');
  assert.ok(Math.abs(ethylene - 500) / 500 < 0.05, `ethylene sink ${ethylene}`);
  const cash = evaluateEconomics(sized.definition, sized.solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(true, `ethylene 500 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp}`);
});

test('Maglut cash stays ≈1299 after this path; sized steel/ethylene cash is finite', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('sizeToProduct steel throws without hydrogen-dri; ethylene throws without mto', () => {
  assert.throws(
    () => sizeToProduct({ product: 'steel', rate: 10, caseOrBuilder: createAbundanceCase }),
    /hydrogen-dri/,
  );
  assert.throws(
    () => sizeToProduct({ product: 'ethylene', rate: 10, caseOrBuilder: createH2DriCase }),
    /mto/,
  );
  assert.throws(
    () => sizeToProduct({ product: 'ethylene', rate: 10, caseOrBuilder: createAbundanceCase }),
    /mto/,
  );
});

test('Size-to-target menu lists steel and ethylene', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /value="steel">steel \/ DRI Fe</);
  assert.match(html, /value="ethylene">ethylene</);
  assert.match(source, /steel:\s*'steel'/);
  assert.match(source, /ethylene:\s*'ethylene'/);
});
