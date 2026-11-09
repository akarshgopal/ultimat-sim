// Table-driven check of the ratio-island products in engine/size.js: every
// alias routes to its canonical product, a case lacking the island's converter
// throws, and sizing to 2x the baseline product meets target while scaling the
// chain's converters, feeds and solar ~linearly.
const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const { sizeToProduct } = require('../engine/size');
const { createAbundanceCase } = require('../cases/abundance');
const { createSiliconCase } = require('../cases/silicon');
const { createH2DriCase } = require('../cases/h2-dri');
const { createGreenH2DriCase } = require('../cases/green-h2-dri');
const { createMtoCase } = require('../cases/mto');
const { createGreenMtoCase } = require('../cases/green-mto');
const { createFtLiquidsCase } = require('../cases/ft-liquids');
const { createGreenFtCase } = require('../cases/green-ft');
const { createUreaCase } = require('../cases/urea');
const { createGreenUreaCase } = require('../cases/green-urea');
const { createTiKrollCase } = require('../cases/ti-kroll');
const { createFloatGlassCase } = require('../cases/float-glass');
const { createCementCase } = require('../cases/cement');
const { createCuEwCase } = require('../cases/cu-ew');
const { createMaglutCase } = require('../cases/maglut');
const { createReeSxCase } = require('../cases/ree-sx');
const { within } = require('./helpers.js');

// product -> aliases (PRODUCT_ALIASES), converter named when the block is
// missing, and the cases that carry the island: [builder, product sink id,
// converter units the sizing chain scales].
const ISLANDS = [
  {
    product: 'module', aliases: ['module', 'pv-module', 'PVmodule', 'pv'], unit: 'pv-module',
    cases: [[createSiliconCase, 'module', ['pv-module', 'polysilicon', 'aluminium-smelter', 'mg-si', 'bayer-alumina']]],
  },
  {
    product: 'steel', aliases: ['steel', 'fe', 'dri', 'iron'], unit: 'hydrogen-dri',
    cases: [
      [createH2DriCase, 'steel', ['hydrogen-dri', 'pellet-plant']],
      [createGreenH2DriCase, 'steel', ['hydrogen-dri', 'pellet-plant', 'electrolyzer', 'swro']],
    ],
  },
  {
    product: 'ethylene', aliases: ['ethylene', 'c2h4', 'mto', 'olefin'], unit: 'mto',
    cases: [
      [createMtoCase, 'ethylene-product', ['mto']],
      [createGreenMtoCase, 'ethylene-product', ['mto', 'methanol', 'electrolyzer', 'swro']],
    ],
  },
  {
    product: 'diesel', aliases: ['diesel', 'ft', 'syncrude'], unit: 'ft-liquids',
    cases: [
      [createFtLiquidsCase, 'diesel-product', ['ft-liquids']],
      [createGreenFtCase, 'diesel-product', ['ft-liquids', 'electrolyzer', 'swro']],
    ],
  },
  {
    product: 'urea', aliases: ['urea', 'CO(NH2)2'], unit: 'urea',
    cases: [
      [createUreaCase, 'urea-product', ['urea']],
      [createGreenUreaCase, 'urea-product', ['urea', 'ammonia', 'electrolyzer', 'asu', 'swro']],
    ],
  },
  { product: 'titanium', aliases: ['titanium', 'ti', 'sponge'], unit: 'titanium-kroll', cases: [[createTiKrollCase, 'titanium', ['titanium-kroll']]] },
  { product: 'float-glass', aliases: ['float-glass', 'glass', 'solar-glass'], unit: 'float-glass', cases: [[createFloatGlassCase, 'glass', ['float-glass']]] },
  { product: 'cement', aliases: ['cement', 'clinker', 'cem-i', 'portland'], unit: 'cement', cases: [[createCementCase, 'cement-product', ['cement']]] },
  { product: 'copper', aliases: ['copper', 'cu', 'cathode', 'cu-ew', 'copper-cathode'], unit: 'copper-ew', cases: [[createCuEwCase, 'cathode-product', ['copper-ew']]] },
  {
    product: 'ndpr', aliases: ['ndpr', 'nd-pr', 'ndpr-oxide', 'ndpr-oxide-separated', 'nd2o3', 'maglut'], unit: 'ree-chromatography',
    cases: [
      [createMaglutCase, 'ndpr', ['ree-chromatography']],
      [createReeSxCase, 'ndpr', ['ree-sx']],
    ],
  },
];

function sinkKg(solved, id) {
  const received = solved.nodes[id]?.received;
  return received?.kind === 'material' ? streamMassKg(received) : 0;
}

for (const island of ISLANDS) {
  test(`${island.product}: aliases resolve and a case without ${island.unit} throws`, () => {
    for (const alias of island.aliases) {
      // Alias routing is observable without a solve: every alias reaches the
      // island's chain builder, which names the missing converter.
      assert.throws(
        () => sizeToProduct({ product: alias, rate: 10, caseOrBuilder: createAbundanceCase }),
        new RegExp(`needs an? ${island.unit} block`),
        alias,
      );
    }
  });

  for (const [build, sinkId, units] of island.cases) {
    test(`${island.product} on ${build.name}: 2x baseline meets target and scales the chain`, () => {
      const baseline = build();
      const baseSolved = solveOperation(baseline);
      const baseProduct = sinkKg(baseSolved, sinkId);
      assert.ok(baseProduct > 0, `baseline ${sinkId}`);
      const target = 2 * baseProduct;

      const sized = sizeToProduct({ product: island.aliases.at(-1), rate: target, caseOrBuilder: build });
      assert.equal(sized.product, island.product);
      assert.equal(sized.converged, true);
      within(sized.achieved, target, 0.01, 'achieved');
      within(sinkKg(sized.solved, sinkId), target, 0.01, `${sinkId} sink`);

      const byId = new Map(sized.definition.graph.nodes.map(node => [node.id, node]));
      for (const unit of units) {
        const base = baseline.graph.nodes.find(node => node.unit === unit);
        assert.ok(base, `${build.name} has ${unit}`);
        within(Number(byId.get(base.id).capacity), 2 * Number(base.capacity), 0.05, `${unit} capacity`);
        within(sized.solved.nodes[base.id].activity, 2 * baseSolved.nodes[base.id].activity, 0.05, `${unit} activity`);
      }
      const converterIds = new Set(baseline.graph.nodes.filter(node => units.includes(node.unit)).map(node => node.id));
      const feeds = baseline.graph.edges
        .filter(edge => converterIds.has(edge.to.node))
        .map(edge => baseline.graph.nodes.find(node => node.id === edge.from.node))
        .filter(node => node.unit === 'material-source' && node.params?.stream?.kind === 'material');
      for (const feed of feeds) {
        within(streamMassKg(byId.get(feed.id).params.stream), 2 * streamMassKg(feed.params.stream), 0.05, `${feed.id} feed`);
      }
      within(sized.definition.site.solarKWp, 2 * baseline.site.solarKWp, 0.1, 'solarKWp');

      const cash = evaluateEconomics(sized.definition, sized.solved);
      assert.ok(Number.isFinite(cash.annualNetCash));
      assert.ok(cash.installedCapex > evaluateEconomics(baseline, baseSolved).installedCapex);
    });
  }
}

test('ndpr refuses a graph with two REE separators', () => {
  const definition = createMaglutCase();
  const chrom = definition.graph.nodes.find(node => node.unit === 'ree-chromatography');
  definition.graph.nodes.push({ ...chrom, id: 'second-sx', unit: 'ree-sx' });
  assert.throws(() => sizeToProduct({ product: 'ndpr', rate: 1, definition }), /multiple REE separators/);
});
