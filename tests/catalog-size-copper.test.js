const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { createCuEwCase } = require('../cases/cu-ew');
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

test('sizeToProduct aliases copper / cu / cathode / cu-ew', () => {
  for (const alias of ['copper', 'cu', 'cathode', 'cu-ew']) {
    const sized = sizeToProduct({ product: alias, rate: 2000, caseOrBuilder: createCuEwCase });
    assert.equal(sized.product, 'copper', alias);
    assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `${alias} achieved ${sized.achieved}`);
  }
});

test('sizeToProduct copper 2000 kg/day on purchased PLS scales activity, feeds, CAPEX, and solar', () => {
  const baseline = createCuEwCase();
  const sized = sizeToProduct({ product: 'copper', rate: 2000, caseOrBuilder: createCuEwCase });
  assert.equal(sized.product, 'copper');
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `copper sink ${sized.achieved}`);
  const tankhouse = node(sized.definition, 'copper-ew');
  assert.ok(Math.abs(tankhouse.capacity - 2000) / 2000 < 0.05, `copper-ew capacity ${tankhouse.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes['copper-ew'].activity - 2000) / 2000 < 0.05,
    `copper-ew activity ${sized.solved.nodes['copper-ew'].activity}`);
  const product = sinkMass(sized.solved, 'cathode-product');
  assert.ok(Math.abs(product - 2000) / 2000 < 0.05, `cathode sink mass ${product}`);

  const scale = 2000 / 1000;
  const basePls = streamMassKg(node(baseline, 'pls-feed').params.stream);
  const nextPls = streamMassKg(node(sized.definition, 'pls-feed').params.stream);
  assert.ok(Math.abs(nextPls - scale * basePls) / (scale * basePls) < 0.05,
    `PLS feed ${nextPls} vs ${scale}× ${basePls}`);

  const baseEwCapex = nodeCapex(node(baseline, 'copper-ew'));
  const nextEwCapex = nodeCapex(tankhouse);
  assert.ok(baseEwCapex > 0, `baseline copper-ew CAPEX ${baseEwCapex}`);
  assert.ok(Math.abs(nextEwCapex - scale * baseEwCapex) / (scale * baseEwCapex) < 0.05,
    `copper-ew CAPEX ${nextEwCapex} vs ${scale}× ${baseEwCapex}`);

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
  assert.ok(true, `purchased-feed copper 2000 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex}`);
});

test('Maglut cash stays ≈1299 after this path; sized copper cash is finite', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('sizeToProduct copper throws without copper-ew', () => {
  assert.throws(
    () => sizeToProduct({ product: 'copper', rate: 10, caseOrBuilder: createAbundanceCase }),
    /copper-ew/,
  );
  assert.throws(
    () => sizeToProduct({ product: 'copper', rate: 10, caseOrBuilder: createH2DriCase }),
    /copper-ew/,
  );
});

test('Size-to-target menu lists copper', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /value="copper">copper</);
  assert.match(source, /copper:\s*'copper'/);
  assert.match(source, /Size-to-target → copper/);
});
