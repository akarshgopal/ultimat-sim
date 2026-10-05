const assert = require('node:assert/strict');
const test = require('node:test');

const {
  distanceKm,
  pvLandHa,
  evaluateNetwork,
  SEA_USD_PER_T_KM,
} = require('../engine/network');
const { estimateSolarLandHa, estimateFootprint } = require('../engine/footprint');
const { createFuelsAndMineralsNetwork, siteDeadSeaAbundance, siteZabuyeAbundance, DAILY_PV, DEAD_SEA_PV, ZABUYE_PV, ZABUYE_DAILY_PV } = require('../cases/network');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const { sizeForPositiveCashflow } = require('../engine/size');
const { streamMassKg } = require('../engine/model');
const { createMaglutCase } = require('../cases/maglut');
const pvgisZabuye = require('../data/pvgis-zabuye.json');
const pvgisSites = require('../data/pvgis-sites');

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
  assert.equal(definition.site.meteo.quality, 'cited');
  assert.equal(definition.site.meteo.dailyPVKWhPerKWp, DEAD_SEA_PV);
  assert.deepEqual(definition.site.meteo.monthlyPVKWhPerKWp, DAILY_PV);
  assert.equal(definition.site.assay.kind, 'brine');
  assert.equal(definition.site.assay.quality, 'cited');
  assert.ok(definition.site.assay.evidence.some(item => /Dead_Sea/.test(item.url)));
  assert.equal(definition.site.rights.freshwater.status, 'assumed');
  assert.equal(definition.site.rights.freshwater.kind, 'freshwater');
  assert.equal(definition.site.rights.freshwater.authorize, true);
  assert.equal(definition.site.rights.saltPurchase.status, 'assumed');
  assert.equal(definition.site.rights.saltPurchase.kind, 'purchase');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.equal(definition.site.rights.gridImport.authorize, false);
  assert.equal(definition.site.rights.brineConcession.status, 'unverified');
  assert.equal(definition.site.rights.brineConcession.kind, 'concession');
  assert.equal(definition.site.rights.seawaterDischarge.status, 'unverified');
  assert.equal(definition.site.rights.seawaterDischarge.kind, 'discharge');
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: gridImport')));
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: brineConcession')));
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: seawaterDischarge')));
  assert.ok(!solved.warnings.some(message => message.includes('unverified site right: freshwater')));
  assert.ok(solved.nodes.ammonia.activity > 0);
  assert.ok(solved.nodes['bromine-recovery'].activity > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('Zabuye brine hub uses the cited carbonate assay and frozen PVGIS-ERA5, then sizes cash-positive', () => {
  const definition = siteZabuyeAbundance();
  const solved = solveOperation(definition);
  assert.equal(definition.meta.assayId, 'zabuye-lithium-brine');
  assert.equal(definition.site.id, 'china-zabuye');
  assert.equal(definition.site.region, 'China / Tibet');
  assert.equal(definition.meta.demandRegionId, 'asia-china');
  const zabuyeLithium = definition.graph.nodes.find(node => node.id === 'lithium');
  assert.equal(zabuyeLithium.economics.demandRegionId, 'asia-china');
  assert.equal(zabuyeLithium.economics.annualDemandLimit, 2e7);
  assert.equal(zabuyeLithium.economics.inherit, undefined);
  assert.match(definition.site.notes, /China\/Asia/);
  assert.doesNotMatch(definition.site.notes, /default TEA/);
  assert.equal(definition.site.name, 'Lake Zabuye (Zhabuye), Tibet, China');
  assert.equal(definition.site.latitude, 31.35);
  assert.equal(definition.site.longitude, 84.05);
  assert.equal(definition.site.assay.assayId, 'zabuye-lithium-brine');
  assert.equal(definition.site.assay.kind, 'brine');
  assert.equal(definition.site.assay.quality, 'cited');
  assert.ok(definition.site.assay.evidence.some(item => /10\.3389\/fceng\.2022\.1008680/.test(item.url)));
  assert.equal(JSON.stringify(definition).includes('dead-sea-brine'), false);
  assert.equal(definition.site.dailyPVKWhPerKWp, ZABUYE_PV);
  assert.equal(definition.site.dailyPVKWhPerKWp, pvgisZabuye.outputs.totals.fixed.E_y / 365);
  assert.notEqual(definition.site.dailyPVKWhPerKWp, DEAD_SEA_PV);
  assert.deepEqual(definition.site.meteo.monthlyPVKWhPerKWp, ZABUYE_DAILY_PV);
  assert.equal(definition.site.meteo.quality, 'cited');
  assert.equal(definition.site.meteo.source, 'PVGIS-ERA5');
  assert.equal(definition.site.meteo.retrieved, '2026-09-27');
  assert.match(definition.site.meteo.cite.url, /lat=31\.35/);
  assert.match(definition.site.meteo.cite.url, /PVGIS-ERA5/);
  assert.doesNotMatch(definition.site.meteo.cite.url, /lat=31\.16/);
  assert.equal(definition.site.resources.brine.stream.mol['Li+'] > 0, true);
  assert.equal(definition.site.resources.brine.stream.mol['Mg+2'], undefined);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
  assert.equal(pvgisSites.BY_SITE_ID['china-zabuye'].E_y, 2070.67);
  assert.equal(pvgisSites.BY_SITE_ID['china-zabuye'].retrieved, '2026-09-27');
  assert.equal(pvgisSites.SCREENING_BAND_SITE_IDS.includes('china-zabuye'), false);
  const seedFootprint = estimateFootprint({ site: definition.site, graph: definition.graph, solved });
  assert.ok(seedFootprint.totalAreaM2 > 0);
  assert.ok(seedFootprint.totalHa > 0);
  const sized = sizeForPositiveCashflow({ caseOrBuilder: () => siteZabuyeAbundance() });
  assert.ok(sized.economics.annualNetCash > 0);
  assert.equal(sized.objective.annualNetCash, sized.economics.annualNetCash);
  assert.equal(sized.definition.site.id, 'china-zabuye');
  assert.equal(sized.definition.site.assay.assayId, 'zabuye-lithium-brine');
  assert.notEqual(sized.definition.site.dailyPVKWhPerKWp, DEAD_SEA_PV);
  const footprint = estimateFootprint({
    site: sized.definition.site,
    graph: sized.definition.graph,
    solved: sized.solved,
  });
  assert.ok(footprint.totalAreaM2 > 0);
  assert.ok(footprint.totalHa > 0);
});

test('fuels plus minerals network rolls up CH4, NH3, Mejillones PV, Walvis urea, Long Beach Maglut, cement, Cu, glass, and money', () => {
  const definition = createFuelsAndMineralsNetwork(6);
  assert.equal(definition.plants.length, 8);
  assert.equal(definition.plants[0].id, 'dead-sea-minerals');
  assert.equal(definition.plants[1].id, 'almeria-fuels');
  assert.equal(definition.plants[2].id, 'mejillones-silicon');
  assert.equal(definition.plants[2].definition.site.id, 'chile-mejillones');
  assert.equal(definition.plants[3].id, 'walvis-green-urea');
  assert.equal(definition.plants[3].definition.site.id, 'namibia-walvis-bay-green-urea');
  assert.equal(definition.plants[4].id, 'long-beach-maglut');
  assert.equal(definition.plants[4].definition.site.id, 'us-long-beach');
  assert.equal(definition.plants[5].id, 'mejillones-cement');
  assert.equal(definition.plants[5].definition.site.id, 'chile-mejillones-cement');
  assert.equal(definition.plants[6].id, 'mejillones-cu-ew');
  assert.equal(definition.plants[6].definition.site.id, 'chile-mejillones-cu-ew');
  assert.equal(definition.plants[7].id, 'mejillones-float-glass');
  assert.equal(definition.plants[7].definition.site.id, 'chile-mejillones-float-glass');
  const result = evaluateNetwork(definition);
  assert.equal(result.plants.length, 8);
  assert.ok(result.slate.CH4 > 0);
  assert.ok(result.slate.NH3 > 0);
  assert.ok(result.slate.Br2 > 0);
  assert.ok(result.slate.PVmodule > 0);
  assert.ok(result.slate.Urea > 0);
  assert.ok(result.slate.PortlandCement > 0);
  assert.ok(result.slate.Cu > 0);
  assert.ok(result.slate.FloatGlass > 0);
  assert.ok(result.landHa > 0);
  const rolledLand = result.plants.reduce((sum, plant) => sum + plant.footprint.totalHa, 0);
  assert.ok(Math.abs(result.landHa - rolledLand) < 1e-12);
  const crude = result.plants.reduce((sum, plant) => sum + (Number(plant.definition.site?.solarKWp) || 0) / 1000 * 1.6, 0);
  assert.notEqual(result.landHa, crude);
  assert.ok(result.plants.every(plant => plant.footprint && plant.footprint.totalHa > 0));
  assert.ok(result.installedCapex > result.plants[0].economics.installedCapex);
  assert.ok(Number.isFinite(result.npv));
  assert.ok(Number.isFinite(result.annualNetCash));
  assert.ok(Number.isFinite(result.annualizedCapex) && result.annualizedCapex > 0);
  assert.equal(result.annualOperatingCash, result.annualRevenue - result.annualOperatingCost);
  assert.ok(Math.abs(result.annualNetCash - (result.annualRevenue - result.annualOperatingCost - result.annualizedCapex)) < 1e-6);
  assert.equal(result.cashFlows[0], -result.installedCapex);
  assert.equal(result.cashFlows[1], result.annualOperatingCash);
  assert.equal(result.corridors.length, 0);
  assert.deepEqual(definition.corridors, []);
  const maglutPlant = result.plants.find(plant => plant.id === 'long-beach-maglut');
  assert.ok(maglutPlant);
  assert.ok(Math.abs(maglutPlant.economics.annualNetCash - 1299) <= 5, `Maglut plant annualNetCash ${maglutPlant.economics.annualNetCash}`);
  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
  const cementPlant = result.plants.find(plant => plant.id === 'mejillones-cement');
  assert.ok(cementPlant);
  assert.equal(cementPlant.definition.site.id, 'chile-mejillones-cement');
  assert.ok(Number.isFinite(cementPlant.economics.annualNetCash));
  const cuPlant = result.plants.find(plant => plant.id === 'mejillones-cu-ew');
  assert.ok(cuPlant);
  assert.equal(cuPlant.definition.site.id, 'chile-mejillones-cu-ew');
  assert.ok(Number.isFinite(cuPlant.economics.annualNetCash));
  const glassPlant = result.plants.find(plant => plant.id === 'mejillones-float-glass');
  assert.ok(glassPlant);
  assert.equal(glassPlant.definition.site.id, 'chile-mejillones-float-glass');
  assert.ok(Number.isFinite(glassPlant.economics.annualNetCash));
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
