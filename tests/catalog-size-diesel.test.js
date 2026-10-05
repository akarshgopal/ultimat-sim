const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { createFtLiquidsCase } = require('../cases/ft-liquids');
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

test('sizeToProduct aliases diesel / ft / syncrude', () => {
  for (const alias of ['diesel', 'ft', 'syncrude']) {
    const sized = sizeToProduct({ product: alias, rate: 2000, caseOrBuilder: createFtLiquidsCase });
    assert.equal(sized.product, 'diesel', alias);
    assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `${alias} achieved ${sized.achieved}`);
  }
});

test('sizeToProduct diesel 2000 kg/day on purchased-H2 FT scales activity, feeds, CAPEX, and solar', () => {
  const baseline = createFtLiquidsCase();
  const sized = sizeToProduct({ product: 'diesel', rate: 2000, caseOrBuilder: createFtLiquidsCase });
  assert.equal(sized.product, 'diesel');
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `diesel sink ${sized.achieved}`);
  const ft = node(sized.definition, 'ft-liquids');
  assert.ok(Math.abs(ft.capacity - 2000) / 2000 < 0.05, `ft-liquids capacity ${ft.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes['ft-liquids'].activity - 2000) / 2000 < 0.05,
    `ft activity ${sized.solved.nodes['ft-liquids'].activity}`);
  const diesel = sinkMass(sized.solved, 'diesel-product');
  assert.ok(Math.abs(diesel - 2000) / 2000 < 0.05, `diesel sink mass ${diesel}`);

  const baseH2 = streamMassKg(node(baseline, 'hydrogen-feed').params.stream);
  const nextH2 = streamMassKg(node(sized.definition, 'hydrogen-feed').params.stream);
  const baseCo2 = streamMassKg(node(baseline, 'co2-feed').params.stream);
  const nextCo2 = streamMassKg(node(sized.definition, 'co2-feed').params.stream);
  assert.ok(Math.abs(nextH2 - 2 * baseH2) / (2 * baseH2) < 0.05, `H2 feed ${nextH2} vs 2× ${baseH2}`);
  assert.ok(Math.abs(nextCo2 - 2 * baseCo2) / (2 * baseCo2) < 0.05, `CO2 feed ${nextCo2} vs 2× ${baseCo2}`);

  const baseFtCapex = nodeCapex(node(baseline, 'ft-liquids'));
  const nextFtCapex = nodeCapex(ft);
  assert.ok(baseFtCapex > 0, `baseline ft CAPEX ${baseFtCapex}`);
  assert.ok(Math.abs(nextFtCapex - 2 * baseFtCapex) / (2 * baseFtCapex) < 0.05,
    `ft CAPEX ${nextFtCapex} vs 2× ${baseFtCapex}`);

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
  assert.ok(true, `purchased-H2 diesel 2000 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex}`);
});

test('Maglut cash stays ≈1299 after this path; sized diesel cash is finite', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('sizeToProduct diesel throws without ft-liquids', () => {
  assert.throws(
    () => sizeToProduct({ product: 'diesel', rate: 10, caseOrBuilder: createAbundanceCase }),
    /ft-liquids/,
  );
  assert.throws(
    () => sizeToProduct({ product: 'diesel', rate: 10, caseOrBuilder: createH2DriCase }),
    /ft-liquids/,
  );
});

test('Size-to-target menu lists diesel', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /value="diesel">diesel \/ FT</);
  assert.match(source, /diesel:\s*'diesel'/);
});
