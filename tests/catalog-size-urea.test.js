const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { createUreaCase } = require('../cases/urea');
const { createAbundanceCase } = require('../cases/abundance');
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

function nodeCapex(item) {
  return Number(item.economics?.installedCapex) || Number(item.economics?.capexRate) * Number(item.capacity || 0);
}

test('sizeToProduct aliases urea / CO(NH2)2', () => {
  for (const alias of ['urea', 'CO(NH2)2']) {
    const sized = sizeToProduct({ product: alias, rate: 2000, caseOrBuilder: createUreaCase });
    assert.equal(sized.product, 'urea', alias);
    assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `${alias} achieved ${sized.achieved}`);
  }
});

test('sizeToProduct urea 2000 kg/day on purchased NH3+CO2 scales activity, feeds, CAPEX, and solar', () => {
  const baseline = createUreaCase();
  const sized = sizeToProduct({ product: 'urea', rate: 2000, caseOrBuilder: createUreaCase });
  assert.equal(sized.product, 'urea');
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `urea sink ${sized.achieved}`);
  const urea = node(sized.definition, 'urea');
  assert.ok(Math.abs(urea.capacity - 2000) / 2000 < 0.05, `urea capacity ${urea.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes.urea.activity - 2000) / 2000 < 0.05,
    `urea activity ${sized.solved.nodes.urea.activity}`);
  const product = sinkMass(sized.solved, 'urea-product');
  assert.ok(Math.abs(product - 2000) / 2000 < 0.05, `urea sink mass ${product}`);

  const baseNh3 = streamMassKg(node(baseline, 'ammonia-feed').params.stream);
  const nextNh3 = streamMassKg(node(sized.definition, 'ammonia-feed').params.stream);
  const baseCo2 = streamMassKg(node(baseline, 'co2-feed').params.stream);
  const nextCo2 = streamMassKg(node(sized.definition, 'co2-feed').params.stream);
  assert.ok(Math.abs(nextNh3 - 2 * baseNh3) / (2 * baseNh3) < 0.05, `NH3 feed ${nextNh3} vs 2× ${baseNh3}`);
  assert.ok(Math.abs(nextCo2 - 2 * baseCo2) / (2 * baseCo2) < 0.05, `CO2 feed ${nextCo2} vs 2× ${baseCo2}`);

  const baseUreaCapex = nodeCapex(node(baseline, 'urea'));
  const nextUreaCapex = nodeCapex(urea);
  assert.ok(baseUreaCapex > 0, `baseline urea CAPEX ${baseUreaCapex}`);
  assert.ok(Math.abs(nextUreaCapex - 2 * baseUreaCapex) / (2 * baseUreaCapex) < 0.05,
    `urea CAPEX ${nextUreaCapex} vs 2× ${baseUreaCapex}`);

  const doubleBaselineSolar = Number(baseline.site.solarKWp) * 2;
  assert.ok(
    Math.abs(sized.definition.site.solarKWp - doubleBaselineSolar) / doubleBaselineSolar < 0.20,
    `solarKWp ${sized.definition.site.solarKWp} vs 2× baseline ${doubleBaselineSolar}`,
  );

  const cash = evaluateEconomics(sized.definition, sized.solved);
  const baseCash = evaluateEconomics(baseline, solveOperation(baseline));
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(cash.installedCapex > baseCash.installedCapex,
    `installedCapex ${cash.installedCapex} vs baseline ${baseCash.installedCapex}`);
  assert.ok(true, `purchased-NH3 urea 2000 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex}`);
});

test('Maglut cash stays ≈1299 after this path; sized urea cash is finite', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('sizeToProduct urea throws without urea', () => {
  assert.throws(
    () => sizeToProduct({ product: 'urea', rate: 10, caseOrBuilder: createAbundanceCase }),
    /urea/,
  );
  assert.throws(
    () => sizeToProduct({ product: 'urea', rate: 10, caseOrBuilder: createH2DriCase }),
    /urea/,
  );
});

test('Size-to-target menu lists urea', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /value="urea">urea</);
  assert.match(source, /urea:\s*'urea'/);
});
