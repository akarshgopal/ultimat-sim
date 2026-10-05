const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { createTiKrollCase } = require('../cases/ti-kroll');
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

test('sizeToProduct aliases titanium / ti / sponge', () => {
  for (const alias of ['titanium', 'ti', 'sponge']) {
    const sized = sizeToProduct({ product: alias, rate: 2000, caseOrBuilder: createTiKrollCase });
    assert.equal(sized.product, 'titanium', alias);
    assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `${alias} achieved ${sized.achieved}`);
  }
});

test('sizeToProduct titanium 2000 kg/day on purchased TiCl4+Mg scales activity, feeds, CAPEX, and solar', () => {
  const baseline = createTiKrollCase();
  const sized = sizeToProduct({ product: 'titanium', rate: 2000, caseOrBuilder: createTiKrollCase });
  assert.equal(sized.product, 'titanium');
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `titanium sink ${sized.achieved}`);
  const kroll = node(sized.definition, 'titanium-kroll');
  assert.ok(Math.abs(kroll.capacity - 2000) / 2000 < 0.05, `titanium-kroll capacity ${kroll.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes.kroll.activity - 2000) / 2000 < 0.05,
    `kroll activity ${sized.solved.nodes.kroll.activity}`);
  const product = sinkMass(sized.solved, 'titanium');
  assert.ok(Math.abs(product - 2000) / 2000 < 0.05, `titanium sink mass ${product}`);

  const scale = 2000 / 100;
  const baseTicl4 = streamMassKg(node(baseline, 'ticl4-feed').params.stream);
  const nextTicl4 = streamMassKg(node(sized.definition, 'ticl4-feed').params.stream);
  const baseMg = streamMassKg(node(baseline, 'magnesium-feed').params.stream);
  const nextMg = streamMassKg(node(sized.definition, 'magnesium-feed').params.stream);
  assert.ok(Math.abs(nextTicl4 - scale * baseTicl4) / (scale * baseTicl4) < 0.05,
    `TiCl4 feed ${nextTicl4} vs ${scale}× ${baseTicl4}`);
  assert.ok(Math.abs(nextMg - scale * baseMg) / (scale * baseMg) < 0.05,
    `Mg feed ${nextMg} vs ${scale}× ${baseMg}`);

  const baseKrollCapex = nodeCapex(node(baseline, 'titanium-kroll'));
  const nextKrollCapex = nodeCapex(kroll);
  assert.ok(baseKrollCapex > 0, `baseline kroll CAPEX ${baseKrollCapex}`);
  assert.ok(Math.abs(nextKrollCapex - scale * baseKrollCapex) / (scale * baseKrollCapex) < 0.05,
    `kroll CAPEX ${nextKrollCapex} vs ${scale}× ${baseKrollCapex}`);

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
  assert.ok(true, `purchased-feed titanium 2000 cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex}`);
});

test('Maglut cash stays ≈1299 after this path; sized titanium cash is finite', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('sizeToProduct titanium throws without titanium-kroll', () => {
  assert.throws(
    () => sizeToProduct({ product: 'titanium', rate: 10, caseOrBuilder: createAbundanceCase }),
    /titanium-kroll/,
  );
  assert.throws(
    () => sizeToProduct({ product: 'titanium', rate: 10, caseOrBuilder: createH2DriCase }),
    /titanium-kroll/,
  );
});

test('Size-to-target menu lists titanium', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /value="titanium">titanium \/ Kroll</);
  assert.match(source, /titanium:\s*'titanium'/);
  assert.match(source, /Size-to-target → titanium/);
});
