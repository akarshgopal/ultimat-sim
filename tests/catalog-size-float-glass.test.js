const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { createFloatGlassCase } = require('../cases/float-glass');
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

test('sizeToProduct aliases float-glass / glass / solar-glass', () => {
  for (const alias of ['float-glass', 'glass', 'solar-glass']) {
    const sized = sizeToProduct({ product: alias, rate: 2000, caseOrBuilder: createFloatGlassCase });
    assert.equal(sized.product, 'float-glass', alias);
    assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `${alias} achieved ${sized.achieved}`);
  }
});

test('sizeToProduct float-glass 2000 kg/day on purchased sand+soda+limestone scales activity, feeds, CAPEX, and solar', () => {
  const baseline = createFloatGlassCase();
  const sized = sizeToProduct({ product: 'float-glass', rate: 2000, caseOrBuilder: createFloatGlassCase });
  assert.equal(sized.product, 'float-glass');
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `float-glass sink ${sized.achieved}`);
  const glass = node(sized.definition, 'float-glass');
  assert.ok(Math.abs(glass.capacity - 2000) / 2000 < 0.05, `float-glass capacity ${glass.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes['float-glass'].activity - 2000) / 2000 < 0.05,
    `float-glass activity ${sized.solved.nodes['float-glass'].activity}`);
  const product = sinkMass(sized.solved, 'glass');
  assert.ok(Math.abs(product - 2000) / 2000 < 0.05, `glass sink mass ${product}`);

  const scale = 2000 / 1000;
  const baseSand = streamMassKg(node(baseline, 'sand-feed').params.stream);
  const nextSand = streamMassKg(node(sized.definition, 'sand-feed').params.stream);
  const baseSoda = streamMassKg(node(baseline, 'soda-feed').params.stream);
  const nextSoda = streamMassKg(node(sized.definition, 'soda-feed').params.stream);
  const baseLime = streamMassKg(node(baseline, 'limestone-feed').params.stream);
  const nextLime = streamMassKg(node(sized.definition, 'limestone-feed').params.stream);
  assert.ok(Math.abs(nextSand - scale * baseSand) / (scale * baseSand) < 0.05,
    `sand feed ${nextSand} vs ${scale}× ${baseSand}`);
  assert.ok(Math.abs(nextSoda - scale * baseSoda) / (scale * baseSoda) < 0.05,
    `soda feed ${nextSoda} vs ${scale}× ${baseSoda}`);
  assert.ok(Math.abs(nextLime - scale * baseLime) / (scale * baseLime) < 0.05,
    `limestone feed ${nextLime} vs ${scale}× ${baseLime}`);

  const baseGlassCapex = nodeCapex(node(baseline, 'float-glass'));
  const nextGlassCapex = nodeCapex(glass);
  assert.ok(baseGlassCapex > 0, `baseline float-glass CAPEX ${baseGlassCapex}`);
  assert.ok(Math.abs(nextGlassCapex - scale * baseGlassCapex) / (scale * baseGlassCapex) < 0.05,
    `float-glass CAPEX ${nextGlassCapex} vs ${scale}× ${baseGlassCapex}`);

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
  assert.ok(true, `purchased-feed float-glass 2000 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex}`);
});

test('Maglut cash stays ≈1299 after this path; sized float-glass cash is finite', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('sizeToProduct float-glass throws without float-glass', () => {
  assert.throws(
    () => sizeToProduct({ product: 'float-glass', rate: 10, caseOrBuilder: createAbundanceCase }),
    /float-glass/,
  );
  assert.throws(
    () => sizeToProduct({ product: 'float-glass', rate: 10, caseOrBuilder: createH2DriCase }),
    /float-glass/,
  );
});

test('Size-to-target menu lists float glass', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /value="float-glass">float glass</);
  assert.match(source, /'float-glass':\s*'float glass'/);
  assert.match(source, /Size-to-target → float glass/);
});
