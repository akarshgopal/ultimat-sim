const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { sizeToProduct } = require('../engine/size');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const { createSiliconCase } = require('../cases/silicon');
const { createAbundanceCase } = require('../cases/abundance');
const { createMaglutCase } = require('../cases/maglut');
const { createUreaCase } = require('../cases/urea');
const { createGreenAmmoniaCase } = require('../cases/green-ammonia');

const POLY_SHARE = 0.0273;
const AL_SHARE = 0.1273;

function node(definition, unitOrId) {
  return definition.graph.nodes.find(item => item.id === unitOrId || item.unit === unitOrId);
}

test('sizeToProduct aliases module / pv-module / PVmodule / pv', () => {
  for (const alias of ['module', 'pv-module', 'PVmodule', 'pv']) {
    const sized = sizeToProduct({ product: alias, rate: 500, caseOrBuilder: createSiliconCase });
    assert.equal(sized.product, 'module', alias);
    assert.ok(Math.abs(sized.achieved - 500) / 500 < 0.05, `${alias} achieved ${sized.achieved}`);
  }
});

test('sizeToProduct module 500 kg/day scales the Mejillones chain', () => {
  const baseline = createSiliconCase();
  const sized = sizeToProduct({ product: 'module', rate: 500, caseOrBuilder: createSiliconCase });
  assert.equal(sized.product, 'module');
  assert.ok(Math.abs(sized.achieved - 500) / 500 < 0.05, `achieved ${sized.achieved}`);
  const pv = node(sized.definition, 'pv-module');
  const poly = node(sized.definition, 'polysilicon');
  const al = node(sized.definition, 'aluminium-smelter');
  assert.ok(Math.abs(pv.capacity - 500) / 500 < 0.05, `pv-module capacity ${pv.capacity}`);
  assert.ok(Math.abs(poly.capacity - 500 * POLY_SHARE) / (500 * POLY_SHARE) < 0.05, `poly ${poly.capacity}`);
  assert.ok(Math.abs(al.capacity - 500 * AL_SHARE) / (500 * AL_SHARE) < 0.05, `Al ${al.capacity}`);
  assert.ok(sized.definition.site.solarKWp > 0);
  const halfBaseline = Number(baseline.site.solarKWp) / 2;
  assert.ok(
    Math.abs(sized.definition.site.solarKWp - halfBaseline) / halfBaseline < 0.15,
    `solarKWp ${sized.definition.site.solarKWp} vs half baseline ${halfBaseline}`,
  );
  const cash = evaluateEconomics(sized.definition, sized.solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(true, `500 kg/day cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp}`);
});

test('sizeToProduct module 2000 kg/day is 2× the 1000 baseline capacities', () => {
  const baseline = createSiliconCase();
  const sized = sizeToProduct({ product: 'module', rate: 2000, caseOrBuilder: createSiliconCase });
  assert.ok(Math.abs(sized.achieved - 2000) / 2000 < 0.05, `achieved ${sized.achieved}`);
  for (const unit of ['pv-module', 'polysilicon', 'aluminium-smelter', 'mg-si', 'bayer-alumina']) {
    const baseCap = Number(node(baseline, unit).capacity);
    const nextCap = Number(node(sized.definition, unit).capacity);
    assert.ok(Math.abs(nextCap - 2 * baseCap) / (2 * baseCap) < 0.05, `${unit} ${nextCap} vs 2× ${baseCap}`);
  }
  const cash = evaluateEconomics(sized.definition, sized.solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(true, `2000 kg/day cash R=${cash.annualRevenue} net=${cash.annualNetCash} kWp=${sized.definition.site.solarKWp}`);
});

test('Mejillones default 1000, Maglut, urea, green NH3 cash stay finite after this path', () => {
  const silicon = createSiliconCase();
  const siliconCash = evaluateEconomics(silicon, solveOperation(silicon));
  assert.ok(Number.isFinite(siliconCash.annualNetCash), `Mejillones 1000 annualNetCash ${siliconCash.annualNetCash}`);
  assert.ok(true, `1000 kg/day default cash R=${siliconCash.annualRevenue} net=${siliconCash.annualNetCash}`);

  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);

  const ureaCash = evaluateEconomics(createUreaCase(), solveOperation(createUreaCase()));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash ${ureaCash.annualNetCash}`);
  const greenCash = evaluateEconomics(createGreenAmmoniaCase(), solveOperation(createGreenAmmoniaCase()));
  assert.ok(Number.isFinite(greenCash.annualNetCash), `green NH3 annualNetCash ${greenCash.annualNetCash}`);
});

test('sizeToProduct module throws without a pv-module block', () => {
  assert.throws(
    () => sizeToProduct({ product: 'module', rate: 10, caseOrBuilder: createAbundanceCase }),
    /pv-module/,
  );
});

test('Size-to-target menu and Mejillones load status mention PV module', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /value="module">PV module</);
  assert.match(source, /module:\s*'PV module'/);
  assert.match(source, /Size-to-target → PV module/);
});
