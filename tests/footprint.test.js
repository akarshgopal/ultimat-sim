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

test('network landHa is the sum of plant totalHa from estimateFootprint', () => {
  const result = evaluateNetwork(createFuelsAndMineralsNetwork(6));
  const summed = result.plants.reduce((sum, plant) => sum + plant.footprint.totalHa, 0);
  assert.ok(Math.abs(result.landHa - summed) < 1e-12);
  assert.ok(result.landHa > result.plants[0].footprint.totalHa);
  const solarOnly = result.plants.reduce((sum, plant) => sum + plant.footprint.solar.ha, 0);
  assert.ok(result.landHa >= solarOnly);
});
