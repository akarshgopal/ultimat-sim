const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('root chrome exposes four tabs and keeps Network copy without Empire', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /role="tablist"/);
  assert.match(html, />Overview</);
  assert.match(html, />Location</);
  assert.match(html, />Process</);
  assert.match(html, />Economics</);
  assert.doesNotMatch(html, /empire/i);
  assert.match(html, /Network/);
  assert.match(html, /id="networkPanel"/);
  assert.doesNotMatch(html, /role="tab"[^>]*>\s*Network\s*</i);
});

test('flowsheet engine runs through browser globals', () => {
  const context = vm.createContext({});
  for (const file of ['engine/model.js', 'engine/units.js', 'engine/heat.js', 'engine/solve.js', 'engine/economics.js', 'engine/footprint.js', 'engine/size.js', 'engine/network.js', 'engine/uncertainty.js', 'engine/map-site.js', 'data/pvgis-almeria-hourly.js', 'data/dead-sea-brine.js', 'data/almeria-seawater.js', 'cases/dac.js', 'cases/sabatier.js', 'cases/coastal.js', 'cases/abundance.js', 'cases/network.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }

  const result = context.FlowsheetSolver.solveOperation(context.DacCase.createDacCase());
  assert.equal(result.nodes.dac.activity, 10);
  assert.ok(result.balances.maxAbsResidual < 1e-8);

  const methane = context.FlowsheetSolver.solveOperation(context.SabatierCase.createSabatierCase());
  assert.equal(methane.nodes.sabatier.activity, 5);
  assert.ok(methane.balances.maxAbsResidual < 1e-8);
  assert.equal(typeof context.FlowsheetEconomics.evaluateEconomics, 'function');
  assert.equal(typeof context.FlowsheetUncertainty.classifyQuality, 'function');
  assert.equal(typeof context.FlowsheetMapSite.haToRadiusM, 'function');
  assert.ok(context.FlowsheetMapSite.LAYER_SOURCES.osm.cite.url);
  assert.equal(context.FlowsheetUncertainty.classifyQuality({ kind: 'lcoe', unit: 'solar-pv' }), 'cited');
  assert.doesNotMatch(context.FlowsheetUncertainty.formatUncertainMoney(1000, 'screening'), /±/);
  const abundance = context.FlowsheetSolver.solveOperation(context.AbundanceCase.createAbundanceCase());
  assert.ok(abundance.nodes.ammonia.activity > 0);
  assert.ok(abundance.balances.maxAbsResidual < 1e-8);

  const coastal = context.FlowsheetSolver.solveOperation(context.CoastalCase.createCoastalCase(12));
  assert.ok(coastal.nodes.sabatier.activity < 5);
  assert.ok(coastal.balances.maxAbsResidual < 1e-8);

  const sized = context.FlowsheetSize.sizeCoastalToMethane(8, 12);
  assert.ok(Math.abs(sized.achieved - 8) < 1e-6);
  assert.ok(sized.iterations >= 1);
  assert.match(String(sized.residual), /./);
  assert.equal(typeof context.FlowsheetSize.sizeToProduct, 'function');
  const hydrogen = context.FlowsheetSize.sizeToProduct({
    product: 'H2',
    rate: 6,
    definition: context.CoastalCase.createCoastalCase(0),
  });
  assert.ok(Math.abs(hydrogen.achieved - 6) < 1e-6);
  const lithium = context.FlowsheetSize.sizeToProduct({
    product: 'lithium',
    rate: 1,
    caseOrBuilder: context.AbundanceCase.createAbundanceCase,
  });
  assert.ok(Math.abs(lithium.achieved - 1) < 1e-6);
});
