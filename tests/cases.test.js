// Every shipped case factory builds, solves with closed balances, and prices to
// finite cash with installed CAPEX. Solved flows and CAPEX per case are pinned
// by tests/pathways.test.js (regenerates data/pathways.js from every case).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const { siteDeadSeaAbundance } = require('../cases/network');

const CASES_DIR = path.join(__dirname, '..', 'cases');
// Units whose feeds/products are lumped pseudo-substances (clinker, bauxite,
// BOM glass/EVA/module): their reactions close mass by recipe, not elements
// (see tests/units-physics.test.js), so a graph containing one cannot close
// the element ledger.
const LUMPED_UNITS = new Set(['cement', 'float-glass', 'bayer-alumina', 'pv-module']);

const FACTORIES = fs.readdirSync(CASES_DIR)
  .filter(file => file.endsWith('.js') && file !== '_shared.js')
  .flatMap(file => Object.entries(require(path.join(CASES_DIR, file)))
    .filter(([name, value]) => /^create\w+Case$/.test(name) && typeof value === 'function')
    .map(([name, build]) => ({ file, name, build })));

test('case discovery finds the factories', () => {
  assert.ok(FACTORIES.length >= 20, FACTORIES.map(item => item.name).join(','));
  assert.ok(FACTORIES.some(item => item.name === 'createDacCase'));
});

for (const { file, name, build } of FACTORIES) {
  test(`${file} ${name}: solves with closed balances and finite economics`, () => {
    const definition = build();
    const solved = solveOperation(definition);
    assert.equal(solved.convergence.converged, true);
    assert.ok(Math.abs(solved.balances.electricityKWh) < 1e-6, `electricity residual ${solved.balances.electricityKWh}`);
    assert.ok(Math.abs(solved.balances.heatKWh) < 1e-6, `heat residual ${solved.balances.heatKWh}`);
    assert.ok(Math.abs(solved.balances.chargeMol) < 1e-6, `charge residual ${solved.balances.chargeMol}`);
    if (!definition.graph.nodes.some(node => LUMPED_UNITS.has(node.unit))) {
      assert.ok(solved.balances.maxAbsResidual < 1e-6, JSON.stringify(solved.balances));
    }

    const cash = evaluateEconomics(definition, solved);
    for (const key of ['annualNetCash', 'annualRevenue', 'annualOperatingCost', 'annualizedCapex', 'installedCapex']) {
      assert.ok(Number.isFinite(cash[key]), `${key}=${cash[key]}`);
    }
    if (definition.graph.nodes.some(node => node.economics)) {
      assert.ok(cash.installedCapex > 0, `installedCapex ${cash.installedCapex}`);
      assert.ok(Math.abs(cash.annualNetCash - (cash.annualRevenue - cash.annualOperatingCost - cash.annualizedCapex)) < 1e-6);
    }
  });
}

function feeder(definition, node, port) {
  const edge = definition.graph.edges.find(item => item.to.node === node && item.to.port === port);
  assert.ok(edge, `${node}.${port} has a feed edge`);
  return definition.graph.nodes.find(item => item.id === edge.from.node);
}

const BY_NAME = Object.fromEntries(FACTORIES.map(item => [item.name, item.build]));

// On-site ("green") variants make their intermediate from an electrolyzer;
// the purchased variants buy it from a material-source.
const ROUTES = [
  { build: BY_NAME.createGreenAmmoniaCase, feeds: [['ammonia', 'hydrogen', 'electrolyzer']], absent: ['chlor-alkali'] },
  { build: siteDeadSeaAbundance, feeds: [['ammonia', 'hydrogen', 'chlor-alkali']], absent: ['electrolyzer'] },
  { build: BY_NAME.createGreenUreaCase, feeds: [['urea', 'ammonia', 'ammonia'], ['ammonia', 'hydrogen', 'electrolyzer'], ['ammonia', 'nitrogen', 'asu']] },
  { build: BY_NAME.createUreaCase, feeds: [['urea', 'ammonia', 'material-source']], absent: ['electrolyzer'] },
  { build: BY_NAME.createGreenFtCase, feeds: [['ft-liquids', 'hydrogen', 'electrolyzer']] },
  { build: BY_NAME.createFtLiquidsCase, feeds: [['ft-liquids', 'hydrogen', 'material-source']], absent: ['electrolyzer'] },
  { build: BY_NAME.createGreenMtoCase, feeds: [['mto', 'methanol', 'methanol'], ['methanol', 'hydrogen', 'electrolyzer']] },
  { build: BY_NAME.createMtoCase, feeds: [['mto', 'methanol', 'material-source']], absent: ['electrolyzer'] },
  { build: BY_NAME.createGreenH2DriCase, feeds: [['hydrogen-dri', 'hydrogen', 'electrolyzer']] },
  { build: BY_NAME.createH2DriCase, feeds: [['hydrogen-dri', 'hydrogen', 'material-source']], absent: ['electrolyzer'] },
];

test('green variants feed on-site intermediates; purchased variants buy them', () => {
  for (const { build, feeds, absent = [] } of ROUTES) {
    const definition = build();
    for (const [consumerUnit, port, upstreamUnit] of feeds) {
      const consumer = definition.graph.nodes.find(node => node.unit === consumerUnit);
      assert.ok(consumer, `${build.name} has ${consumerUnit}`);
      assert.equal(feeder(definition, consumer.id, port).unit, upstreamUnit, `${build.name} ${consumerUnit}.${port}`);
    }
    for (const unit of absent) {
      assert.ok(!definition.graph.nodes.some(node => node.unit === unit), `${build.name} has no ${unit}`);
    }
  }
});
