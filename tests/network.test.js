const assert = require('node:assert/strict');
const test = require('node:test');

const { evaluateNetwork, SEA_USD_PER_T_KM } = require('../engine/network');
const { estimateFootprint } = require('../engine/footprint');
const { createFuelsAndMineralsNetwork, siteZabuyeAbundance, DEAD_SEA_PV, ZABUYE_PV } = require('../cases/network');
const { solveOperation } = require('../engine/solve');
const { sizeForPositiveCashflow } = require('../engine/size');
const pvgisZabuye = require('../data/pvgis-zabuye.json');

function waterStream(mol = 1000) {
  return { kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1, mol: { H2O: mol } };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Minimal two-plant network with one sea corridor hauling H2O from origin sale to destination purchase. */
function createCorridorFixture({ loss = 0.002, usdPerTonneKm = SEA_USD_PER_T_KM, mode = 'sea' } = {}) {
  const originWater = waterStream(1000);
  const destinationWater = waterStream(2000);
  return {
    plants: [
      {
        id: 'origin',
        name: 'Origin well',
        definition: {
          graph: {
            nodes: [
              {
                id: 'well',
                unit: 'material-source',
                siteResource: 'water',
                params: { stream: clone(originWater) },
                economics: { unitCost: 0 },
              },
              {
                id: 'product',
                unit: 'material-sink',
                economics: { disposition: 'sale', unitPrice: 1, annualDemandLimit: 1e12 },
              },
            ],
            edges: [{ from: { node: 'well', port: 'out' }, to: { node: 'product', port: 'in' } }],
          },
          operation: { setpoints: {} },
          site: {
            name: 'Origin coast',
            latitude: 36.834,
            longitude: -2.463,
            resources: {
              water: { stream: clone(originWater), quality: 'user-assumption', evidence: 'fixture' },
            },
          },
          economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
        },
      },
      {
        id: 'destination',
        name: 'Destination buyer',
        definition: {
          graph: {
            nodes: [
              {
                id: 'feed',
                unit: 'material-source',
                siteResource: 'water',
                params: { stream: clone(destinationWater) },
                economics: { unitCost: 0.5 },
              },
              {
                id: 'sink',
                unit: 'material-sink',
                economics: { disposition: 'disposal', disposalCost: 0 },
              },
            ],
            edges: [{ from: { node: 'feed', port: 'out' }, to: { node: 'sink', port: 'in' } }],
          },
          operation: { setpoints: {} },
          site: {
            name: 'Dead Sea shore',
            latitude: 31.16,
            longitude: 35.43,
            resources: {
              water: { stream: clone(destinationWater), quality: 'user-assumption', evidence: 'fixture' },
            },
          },
          economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
        },
      },
    ],
    corridors: [
      {
        id: 'water-haul',
        from: { plant: 'origin', node: 'product' },
        to: { plant: 'destination', node: 'feed' },
        mode,
        loss,
        usdPerTonneKm,
      },
    ],
  };
}

test('Zabuye brine hub binds its own assay, China demand, and frozen PVGIS, then sizes cash-positive', () => {
  const definition = siteZabuyeAbundance();
  const solved = solveOperation(definition);
  assert.equal(definition.meta.assayId, 'zabuye-lithium-brine');
  assert.equal(definition.meta.demandRegionId, 'asia-china');
  assert.equal(definition.graph.nodes.find(node => node.id === 'lithium').economics.demandRegionId, 'asia-china');
  assert.equal(JSON.stringify(definition).includes('dead-sea-brine'), false);
  assert.equal(definition.site.dailyPVKWhPerKWp, ZABUYE_PV);
  assert.equal(definition.site.dailyPVKWhPerKWp, pvgisZabuye.outputs.totals.fixed.E_y / 365);
  assert.notEqual(definition.site.dailyPVKWhPerKWp, DEAD_SEA_PV);
  assert.ok(definition.site.resources.brine.stream.mol['Li+'] > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);

  const sized = sizeForPositiveCashflow({ caseOrBuilder: () => siteZabuyeAbundance() });
  assert.ok(sized.economics.annualNetCash > 0);
  assert.equal(sized.objective.annualNetCash, sized.economics.annualNetCash);
  assert.equal(sized.definition.site.assay.assayId, 'zabuye-lithium-brine');
  const footprint = estimateFootprint({ site: sized.definition.site, graph: sized.definition.graph, solved: sized.solved });
  const seed = estimateFootprint({ site: definition.site, graph: definition.graph, solved });
  assert.ok(footprint.totalHa > seed.totalHa && seed.totalHa > 0);
});

test('fuels plus minerals network rolls up every plant product, land, and money', () => {
  const definition = createFuelsAndMineralsNetwork(6);
  const ids = definition.plants.map(plant => plant.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(definition.corridors, []);
  const result = evaluateNetwork(definition);
  assert.equal(result.plants.length, definition.plants.length);
  for (const product of ['CH4', 'NH3', 'Br2', 'PVmodule', 'Urea', 'PortlandCement', 'Cu', 'FloatGlass', 'C12H26', 'C2H4', 'Fe']) {
    assert.ok(result.slate[product] > 0, product);
  }
  assert.ok(result.plants.every(plant => plant.footprint.totalHa > 0 && Number.isFinite(plant.economics.annualNetCash)));
  const rolledLand = result.plants.reduce((sum, plant) => sum + plant.footprint.totalHa, 0);
  assert.ok(Math.abs(result.landHa - rolledLand) < 1e-12);
  assert.ok(result.landHa >= result.plants.reduce((sum, plant) => sum + plant.footprint.solar.ha, 0));
  const rolledCapex = result.plants.reduce((sum, plant) => sum + plant.economics.installedCapex, 0);
  assert.ok(Math.abs(result.installedCapex - rolledCapex) < 1e-6 * rolledCapex);
  assert.ok(Number.isFinite(result.npv));
  assert.equal(result.annualOperatingCash, result.annualRevenue - result.annualOperatingCost);
  assert.ok(Math.abs(result.annualNetCash - (result.annualRevenue - result.annualOperatingCost - result.annualizedCapex)) < 1e-6);
  assert.equal(result.cashFlows[0], -result.installedCapex);
  assert.equal(result.cashFlows[1], result.annualOperatingCash);
  assert.equal(result.corridors.length, 0);
});

test('corridor excludes transferred origin sale from slate and revenue', () => {
  const network = createCorridorFixture();
  const without = evaluateNetwork({ ...network, corridors: [] });
  const withCorridor = evaluateNetwork(network);

  assert.equal(withCorridor.corridors.length, 1);
  assert.ok(withCorridor.transferred.has('origin:product'));
  assert.equal(withCorridor.slate.H2O, undefined);
  assert.ok(without.slate.H2O > 0);

  const originSale = without.products.find(product => product.plantId === 'origin' && product.nodeId === 'product');
  assert.ok(originSale);
  assert.ok(Math.abs(withCorridor.transferredOriginRevenue - originSale.annualAmount * originSale.unitPrice) < 1e-6);
  assert.ok(Math.abs(without.annualRevenue - withCorridor.annualRevenue - withCorridor.transferredOriginRevenue) < 1e-4
    || withCorridor.annualRevenue < without.annualRevenue);

  // Freight units: delivered t/day × periodDays × km × $/t-km = USD/year.
  const corridor = withCorridor.corridors[0];
  const expectedFreight = corridor.deliveredKgPerDay / 1000 * 365 * corridor.km * corridor.usdPerTonneKm;
  assert.ok(Math.abs(corridor.annualFreight - expectedFreight) < 1e-6);
  assert.ok(corridor.km > 3000);
  assert.ok(withCorridor.freight > 0);
  // Destination purchase OPEX may fall when the corridor scales the feed down;
  // freight is still present as an additive network operating cost.
  assert.ok(withCorridor.annualOperatingCost + 1e-9 >= withCorridor.freight);
  assert.ok(Math.abs(
    withCorridor.annualOperatingCost
    - (withCorridor.plants.reduce((sum, plant) => sum + plant.economics.annualOperatingCost, 0) + withCorridor.freight)
  ) < 1e-6);
});
