const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SQM_PER_ACRE,
  SQM_PER_HA,
  estimateFootprint,
  estimateSolar,
  estimateSolarLandHa,
  pvLandHa,
  layoutSpacingMultiplier,
  groundCoverageRatio,
} = require('../engine/footprint');
const { evaluateNetwork } = require('../engine/network');
const { createFuelsAndMineralsNetwork } = require('../cases/network');
const { createCoastalCase } = require('../cases/coastal');
const { solveHorizon } = require('../engine/solve');

test('solar land uses panel area / GCR rather than 1.6 ha/MWp', () => {
  const solarKWp = 50000;
  const ha = estimateSolarLandHa(solarKWp);
  assert.equal(ha, pvLandHa(solarKWp));
  assert.notEqual(ha, 80);
  const panelAreaM2 = (solarKWp / 1000) * 1e6 / ((20 / 100) * 1000);
  const landAreaM2 = panelAreaM2 / 0.45;
  assert.equal(panelAreaM2, 250000);
  assert.ok(Math.abs(ha - landAreaM2 / SQM_PER_HA) < 1e-12);
  const solar = estimateSolar(solarKWp);
  assert.equal(solar.panelAreaM2, panelAreaM2);
  assert.equal(solar.gcr, solar.baseGcr);
  assert.equal(solar.mounting, 'fixed');
  assert.equal(solar.panelEfficiency, 20);
  assert.ok(Math.abs(solar.acres - landAreaM2 / SQM_PER_ACRE) < 1e-12);
});

test('location-aware GCR follows the documented latitude formula', () => {
  const at45 = layoutSpacingMultiplier(45, { mounting: 'fixed' });
  assert.ok(Math.abs(at45 - 1.225) < 1e-12);
  const coverage = groundCoverageRatio({ latitude: 45, mounting: 'fixed' });
  assert.equal(coverage.baseGcr, 0.45);
  assert.ok(Math.abs(coverage.gcr - 0.45 / 1.225) < 1e-12);

  const equator = groundCoverageRatio({ latitude: 0, mounting: 'fixed' });
  assert.equal(equator.layoutSpacingMultiplier, 0.82);
  assert.ok(equator.gcr > coverage.gcr);

  const polar = layoutSpacingMultiplier(90, { mounting: 'fixed' });
  assert.equal(polar, 1.35);

  const high = estimateFootprint({ site: { latitude: 60, solarKWp: 1000 } });
  const low = estimateFootprint({ site: { latitude: 10, solarKWp: 1000 } });
  assert.ok(high.solar.landAreaM2 > low.solar.landAreaM2);
  assert.ok(high.solar.gcr < low.solar.gcr);
  assert.ok(high.solar.landAreaM2 > high.solar.panelAreaM2);
  assert.match(high.assumptions.join(' '), /layoutSpacingMultiplier/);
});

test('east-west packing is denser than fixed tilt at the same site', () => {
  const opts = { latitude: 36.834 };
  const fixed = estimateSolarLandHa(1000, { ...opts, mounting: 'fixed' });
  const eastWest = estimateSolarLandHa(1000, { ...opts, mounting: 'ew' });
  assert.ok(eastWest < fixed);
  assert.equal(groundCoverageRatio({ ...opts, mounting: 'ew' }).baseGcr, 0.75);
});

test('winter-noon GCR uses more land at higher winter-sun latitudes', () => {
  const houston = estimateSolarLandHa(1000, {
    latitude: 29.7604, mounting: 'single', gcrModel: 'winter-noon',
  });
  const buffalo = estimateSolarLandHa(1000, {
    latitude: 42.8864, mounting: 'single', gcrModel: 'winter-noon',
  });
  assert.ok(buffalo > houston);
});

test('process pads use solved activity and omit idle units', () => {
  const footprint = estimateFootprint({
    site: { solarKWp: 0, storage: { batteryKWh: 2000 } },
    graph: {
      nodes: [
        { id: 'ely', unit: 'electrolyzer', params: { secKWhPerKgH2: 50 } },
        { id: 'dac', unit: 'dac-solid' },
        { id: 'ch4', unit: 'sabatier' },
        { id: 'ro', unit: 'swro' },
        { id: 'brine', unit: 'brine-minerals' },
        { id: 'n2', unit: 'asu' },
        { id: 'nh3', unit: 'ammonia' },
        { id: 'idle', unit: 'electrolyzer' },
      ],
    },
    solved: {
      nodes: {
        ely: { activity: 100, consumed: { electricity: { kWh: 5000 } } },
        dac: { activity: 1000 },
        ch4: { activity: 240 },
        ro: { activity: 40 },
        brine: { activity: 20000 },
        n2: { activity: 5000 },
        nh3: { activity: 4000 },
        idle: { activity: 0 },
      },
    },
  });

  const byId = Object.fromEntries(footprint.processes.map(item => [item.id, item]));
  assert.equal(byId.ely.areaM2, 24);
  assert.ok(Math.abs(byId.dac.areaM2 - 365 * 0.35) < 1e-12);
  assert.equal(byId.ch4.areaM2, 40);
  assert.equal(byId.ro.areaM2, 32);
  assert.equal(byId.brine.areaM2, 40);
  assert.equal(byId.n2.areaM2, 40);
  assert.equal(byId.nh3.areaM2, 48);
  assert.equal(byId['site-battery'].areaM2, 20);
  assert.equal(byId.idle, undefined);
  assert.ok(footprint.processes.every(item => item.areaM2 > 0));
  assert.ok(Math.abs(footprint.processAreaM2 - footprint.processes.reduce((sum, item) => sum + item.areaM2, 0)) < 1e-12);
  assert.equal(footprint.totalAreaM2, footprint.processAreaM2);
  assert.match(footprint.assumptions.join(' '), /order-of-magnitude screening/);
});

test('coastal methane footprint is solar-dominated with DAC and electrolyzer pads', () => {
  const definition = createCoastalCase(6);
  const solved = solveHorizon(definition);
  const footprint = estimateFootprint({
    site: definition.site,
    graph: definition.graph,
    solved,
  });
  assert.ok(footprint.solar.ha > 0);
  assert.ok(footprint.solar.gcr < footprint.solar.baseGcr);
  assert.ok(footprint.solar.landAreaM2 > footprint.processAreaM2);
  const units = new Set(footprint.processes.map(item => item.unit));
  assert.ok(units.has('electrolyzer'));
  assert.ok(units.has('dac-solid') || units.has('dac'));
  assert.ok(units.has('sabatier'));
  assert.ok(units.has('swro'));
  assert.ok(Math.abs(footprint.totalHa - (footprint.solar.ha + footprint.processAreaM2 / SQM_PER_HA)) < 1e-12);
});

test('network landHa is the sum of plant totalHa from estimateFootprint', () => {
  const result = evaluateNetwork(createFuelsAndMineralsNetwork(6));
  const summed = result.plants.reduce((sum, plant) => sum + plant.footprint.totalHa, 0);
  assert.ok(Math.abs(result.landHa - summed) < 1e-12);
  assert.ok(result.landHa > result.plants[0].footprint.totalHa);
  const solarOnly = result.plants.reduce((sum, plant) => sum + plant.footprint.solar.ha, 0);
  assert.ok(result.landHa >= solarOnly);
});
