const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('flowsheet engine runs through browser globals', () => {
  const context = vm.createContext({});
  for (const file of ['engine/model.js', 'engine/units.js', 'engine/solve.js', 'engine/economics.js', 'cases/dac.js', 'cases/sabatier.js', 'cases/abundance.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }

  const result = context.FlowsheetSolver.solveOperation(context.DacCase.createDacCase());
  assert.equal(result.nodes.dac.activity, 10);
  assert.ok(result.balances.maxAbsResidual < 1e-8);

  const methane = context.FlowsheetSolver.solveOperation(context.SabatierCase.createSabatierCase());
  assert.equal(methane.nodes.sabatier.activity, 5);
  assert.ok(methane.balances.maxAbsResidual < 1e-8);
  assert.equal(typeof context.FlowsheetEconomics.evaluateEconomics, 'function');
  const abundance = context.FlowsheetSolver.solveOperation(context.AbundanceCase.createAbundanceCase());
  assert.ok(abundance.nodes.ammonia.activity > 0);
  assert.ok(abundance.balances.maxAbsResidual < 1e-8);
});
