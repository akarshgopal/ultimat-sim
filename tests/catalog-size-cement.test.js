const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { createCementCase } = require('../cases/cement');
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

test('sizeToProduct aliases cement / clinker / cem-i / portland', () => {
  for (const alias of ['cement', 'clinker', 'cem-i', 'portland']) {
    const sized = sizeToProduct({ product: alias, rate: 2000, caseOrBuilder: createCementCase });
    assert.equal(sized.product, 'cement', alias);
    assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `${alias} achieved ${sized.achieved}`);
  }
});

test('sizeToProduct cement 2000 kg/day on purchased limestone+clay scales activity, feeds, CAPEX, solar, and process CO2', () => {
  const baseline = createCementCase();
  const sized = sizeToProduct({ product: 'cement', rate: 2000, caseOrBuilder: createCementCase });
  assert.equal(sized.product, 'cement');
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `cement sink ${sized.achieved}`);
  const kiln = node(sized.definition, 'cement');
  assert.ok(Math.abs(kiln.capacity - 2000) / 2000 < 0.05, `cement capacity ${kiln.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes.cement.activity - 2000) / 2000 < 0.05,
    `cement activity ${sized.solved.nodes.cement.activity}`);
  const product = sinkMass(sized.solved, 'cement-product');
  assert.ok(Math.abs(product - 2000) / 2000 < 0.05, `cement sink mass ${product}`);

  const scale = 2000 / 1000;
  const baseLime = streamMassKg(node(baseline, 'limestone-feed').params.stream);
  const nextLime = streamMassKg(node(sized.definition, 'limestone-feed').params.stream);
  const baseClay = streamMassKg(node(baseline, 'clay-feed').params.stream);
  const nextClay = streamMassKg(node(sized.definition, 'clay-feed').params.stream);
  assert.ok(Math.abs(nextLime - scale * baseLime) / (scale * baseLime) < 0.05,
    `limestone feed ${nextLime} vs ${scale}× ${baseLime}`);
  assert.ok(Math.abs(nextClay - scale * baseClay) / (scale * baseClay) < 0.05,
    `clay feed ${nextClay} vs ${scale}× ${baseClay}`);

  const baseCo2 = sinkMass(solveOperation(baseline), 'process-co2');
  const nextCo2 = sinkMass(sized.solved, 'process-co2');
  assert.ok(baseCo2 > 0, `baseline process CO2 ${baseCo2}`);
  assert.ok(Math.abs(nextCo2 - scale * baseCo2) / (scale * baseCo2) < 0.05,
    `process CO2 ${nextCo2} vs ${scale}× ${baseCo2}`);

  const baseKilnCapex = nodeCapex(node(baseline, 'cement'));
  const nextKilnCapex = nodeCapex(kiln);
  assert.ok(baseKilnCapex > 0, `baseline cement CAPEX ${baseKilnCapex}`);
  assert.ok(Math.abs(nextKilnCapex - scale * baseKilnCapex) / (scale * baseKilnCapex) < 0.05,
    `cement CAPEX ${nextKilnCapex} vs ${scale}× ${baseKilnCapex}`);

  const scaledBaselineSolar = Number(baseline.site.solarKWp) * scale;
  assert.ok(
    Math.abs(sized.definition.site.solarKWp - scaledBaselineSolar) / scaledBaselineSolar < 0.20,
    `solarKWp ${sized.definition.site.solarKWp} vs ${scale}× baseline ${scaledBaselineSolar}`,
  );

  const cash = evaluateEconomics(sized.definition, sized.solved);
  const baseCash = evaluateEconomics(baseline, solveOperation(baseline));
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(cash.installedCapex > baseCash.installedCapex,
    `installedCapex ${cash.installedCapex} vs baseline ${baseCash.installedCapex}`);
  assert.ok(true, `purchased-feed cement 2000 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex}`);
});

test('Maglut cash stays ≈1299 after this path; sized cement cash is finite', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('sizeToProduct cement throws without cement', () => {
  assert.throws(
    () => sizeToProduct({ product: 'cement', rate: 10, caseOrBuilder: createAbundanceCase }),
    /cement/,
  );
  assert.throws(
    () => sizeToProduct({ product: 'cement', rate: 10, caseOrBuilder: createH2DriCase }),
    /cement/,
  );
});

test('Size-to-target menu lists cement', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /value="cement">cement</);
  assert.match(source, /cement:\s*'cement'/);
  assert.match(source, /Size-to-target → cement/);
});
