const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { sizeToProduct } = require('../engine/size');
const { evaluateEconomics } = require('../engine/economics');
const { createMaglutCase } = require('../cases/maglut');
const { createAbundanceCase } = require('../cases/abundance');
const { createH2DriCase } = require('../cases/h2-dri');
const { solveOperation } = require('../engine/solve');

function node(definition, unitOrId) {
  return definition.graph.nodes.find(item => item.id === unitOrId || item.unit === unitOrId);
}

function sinkMass(solved, sinkId) {
  const received = solved.nodes[sinkId]?.received;
  return received?.kind === 'material' ? streamMassKg(received) : 0;
}

test('sizeToProduct aliases ndpr / nd-pr / ndpr-oxide / ndpr-oxide-separated / nd2o3 / maglut', () => {
  const baseline = createMaglutCase();
  const baseNdpr = sinkMass(solveOperation(baseline), 'ndpr');
  const target = 2 * baseNdpr;
  for (const alias of ['ndpr', 'nd-pr', 'ndpr-oxide', 'ndpr-oxide-separated', 'nd2o3', 'maglut']) {
    const sized = sizeToProduct({ product: alias, rate: target, caseOrBuilder: createMaglutCase });
    assert.equal(sized.product, 'ndpr', alias);
    assert.ok(Math.abs(sized.achieved - target) / target < 0.05, `${alias} achieved ${sized.achieved}`);
  }
});

test('sizeToProduct ndpr 2× Maglut scales chrom, concentrate, solar, and CAPEX; cash finite', () => {
  const baseline = createMaglutCase();
  const baseSolved = solveOperation(baseline);
  const baseNdpr = sinkMass(baseSolved, 'ndpr');
  assert.ok(baseNdpr > 0, `baseline NdPr ${baseNdpr}`);
  const target = 2 * baseNdpr;
  const sized = sizeToProduct({ product: 'ndpr', rate: target, caseOrBuilder: createMaglutCase });
  assert.equal(sized.product, 'ndpr');
  assert.ok(Math.abs(sized.achieved - target) / target < 0.05, `ndpr sink ${sized.achieved}`);
  const chrom = node(sized.definition, 'ree-chromatography');
  const baseChrom = node(baseline, 'ree-chromatography');
  assert.ok(Math.abs(chrom.capacity - 2 * baseChrom.capacity) / (2 * baseChrom.capacity) < 0.05,
    `chrom capacity ${chrom.capacity} vs 2× ${baseChrom.capacity}`);
  assert.ok(Math.abs(sized.solved.nodes.chrom.activity - 2 * baseChrom.capacity) / (2 * baseChrom.capacity) < 0.05,
    `chrom activity ${sized.solved.nodes.chrom.activity}`);
  const product = sinkMass(sized.solved, 'ndpr');
  assert.ok(Math.abs(product - target) / target < 0.05, `ndpr sink mass ${product}`);

  const scale = 2;
  const baseConc = streamMassKg(node(baseline, 'concentrate').params.stream);
  const nextConc = streamMassKg(node(sized.definition, 'concentrate').params.stream);
  assert.ok(Math.abs(nextConc - scale * baseConc) / (scale * baseConc) < 0.05,
    `concentrate feed ${nextConc} vs ${scale}× ${baseConc}`);

  const scaledBaselineSolar = Number(baseline.site.solarKWp) * scale;
  assert.ok(
    Math.abs(sized.definition.site.solarKWp - scaledBaselineSolar) / scaledBaselineSolar < 0.20,
    `solarKWp ${sized.definition.site.solarKWp} vs ${scale}× baseline ${scaledBaselineSolar}`,
  );

  const cash = evaluateEconomics(sized.definition, sized.solved);
  const baseCash = evaluateEconomics(baseline, baseSolved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.installedCapex), `installedCapex ${cash.installedCapex}`);
  assert.ok(cash.installedCapex > baseCash.installedCapex,
    `installedCapex ${cash.installedCapex} vs baseline ${baseCash.installedCapex}`);
  assert.ok(true, `Maglut 2× ndpr cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp} CAPEX=${cash.installedCapex}`);
});

test('Maglut cash stays ≈1299 after this path; sized ndpr cash is finite', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('sizeToProduct ndpr throws without ree-chromatography', () => {
  assert.throws(
    () => sizeToProduct({ product: 'ndpr', rate: 10, caseOrBuilder: createAbundanceCase }),
    /ree-chromatography/,
  );
  assert.throws(
    () => sizeToProduct({ product: 'ndpr', rate: 10, caseOrBuilder: createH2DriCase }),
    /ree-chromatography/,
  );
});

test('Size-to-target menu lists ndpr', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /value="ndpr">ndpr</);
  assert.match(source, /ndpr:\s*'ndpr'/);
  assert.match(source, /Size-to-target → ndpr/);
});
