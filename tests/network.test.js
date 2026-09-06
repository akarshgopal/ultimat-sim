const assert = require('node:assert/strict');
const test = require('node:test');

const {
  distanceKm,
  pvLandHa,
  evaluateNetwork,
  SEA_USD_PER_T_KM,
} = require('../engine/network');
const { estimateSolarLandHa } = require('../engine/footprint');
const { createFuelsAndMineralsNetwork, siteDeadSeaAbundance, DAILY_PV, DEAD_SEA_PV } = require('../cases/network');
const { solveOperation } = require('../engine/solve');
const { streamMassKg } = require('../engine/model');
const pvgisDeadSea = require('../data/pvgis-dead-sea.json');

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

test('Almería to the Dead Sea is a multi-thousand kilometre haul', () => {
  const km = distanceKm(
    { latitude: 36.834, longitude: -2.463 },
    { latitude: 31.16, longitude: 35.43 }
  );
  assert.ok(km > 3000 && km < 4500);
  assert.equal(pvLandHa(50000), estimateSolarLandHa(50000));
  assert.notEqual(pvLandHa(50000), 80);
});

test('frozen PVGIS monthly yields match the Dead Sea snapshot', () => {
  assert.equal(DAILY_PV[0], pvgisDeadSea.outputs.totals.fixed.E_y / 365);
  assert.equal(DEAD_SEA_PV, DAILY_PV[0]);
  assert.equal(pvgisDeadSea.outputs.totals.fixed.E_d, 4.59);
  for (const row of pvgisDeadSea.outputs.monthly.fixed) {
    assert.equal(DAILY_PV[row.month], row.E_d);
  }
});

test('Dead Sea brine hub closes balances on assumed solar and brine', () => {
  const definition = siteDeadSeaAbundance();
  const solved = solveOperation(definition);
  assert.equal(definition.site.id, 'dead-sea-pvgis-2026-09-06');
  assert.equal(definition.site.dailyPVKWhPerKWp, DEAD_SEA_PV);
  assert.equal(definition.site.resources.electricity.quality, 'literature-estimate');
  assert.match(definition.site.resources.electricity.evidence, /PVGIS-SARAH3\/ERA5/);
  assert.doesNotMatch(definition.site.resources.electricity.evidence, /5\.4|desert PV screening/i);
  assert.doesNotMatch(definition.site.notes, /5\.4|desert PV/i);
  assert.ok(definition.site.evidence.some(item => /PVGIS-SARAH3/.test(item.label)));
  assert.equal(definition.site.resources.grid.quality, 'unverified');
  assert.ok(solved.nodes.ammonia.activity > 0);
  assert.ok(solved.nodes['bromine-recovery'].activity > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('fuels plus minerals network rolls up CH4, NH3, and money', () => {
  const result = evaluateNetwork(createFuelsAndMineralsNetwork(6));
  assert.equal(result.plants.length, 2);
  assert.ok(result.slate.CH4 > 0);
  assert.ok(result.slate.NH3 > 0);
  assert.ok(result.slate.Br2 > 0);
  assert.ok(result.landHa > 0);
  const rolledLand = result.plants.reduce((sum, plant) => sum + plant.footprint.totalHa, 0);
  assert.ok(Math.abs(result.landHa - rolledLand) < 1e-12);
  const crude = result.plants.reduce((sum, plant) => sum + (Number(plant.definition.site?.solarKWp) || 0) / 1000 * 1.6, 0);
  assert.notEqual(result.landHa, crude);
  assert.ok(result.plants.every(plant => plant.footprint && plant.footprint.totalHa > 0));
  assert.ok(result.installedCapex > result.plants[0].economics.installedCapex);
  assert.equal(result.npv, result.npv);
  assert.ok(Number.isFinite(result.npv));
  assert.ok(result.annualNetCash === result.annualRevenue - result.annualOperatingCost);
  assert.equal(result.corridors.length, 0);
});

test('evaluateNetwork deep-clones definitions and stays idempotent', () => {
  const network = createCorridorFixture();
  const originStreamBefore = network.plants[1].definition.graph.nodes.find(node => node.id === 'feed').params.stream;
  const originMass = streamMassKg(originStreamBefore);
  const first = evaluateNetwork(network);
  const second = evaluateNetwork(network);
  assert.equal(streamMassKg(network.plants[1].definition.graph.nodes.find(node => node.id === 'feed').params.stream), originMass);
  assert.equal(first.freight, second.freight);
  assert.equal(first.annualRevenue, second.annualRevenue);
  assert.equal(first.corridors[0].deliveredKgPerDay, second.corridors[0].deliveredKgPerDay);
  assert.deepEqual([...first.transferred], [...second.transferred]);
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

test('corridor scales destination feed without mutating the input network', () => {
  const network = createCorridorFixture({ loss: 0 });
  const feedBefore = clone(network.plants[1].definition.graph.nodes.find(node => node.id === 'feed').params.stream);
  const result = evaluateNetwork(network);
  assert.deepEqual(network.plants[1].definition.graph.nodes.find(node => node.id === 'feed').params.stream, feedBefore);
  const destination = result.plants.find(plant => plant.id === 'destination');
  const scaled = destination.definition.graph.nodes.find(node => node.id === 'feed').params.stream;
  assert.ok(streamMassKg(scaled) < streamMassKg(feedBefore));
  assert.ok(Math.abs(streamMassKg(scaled) - result.corridors[0].deliveredKgPerDay) < 1e-6);
});
