const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SQM_PER_ACRE,
  SQM_PER_HA,
  PROCESS_INTENSITIES,
  estimateFootprint,
  estimateSolar,
  estimateSolarLandHa,
  pvLandHa,
  layoutSpacingMultiplier,
  groundCoverageRatio,
} = require('../engine/footprint');
const { evaluateNetwork } = require('../engine/network');
const { createFuelsAndMineralsNetwork } = require('../cases/network');

const MAIN_UNITS = [
  'electrolyzer',
  'dac-solid',
  'dac-liquid',
  'sabatier',
  'swro',
  'med',
  'brine-minerals',
  'asu',
  'ammonia',
  'battery',
];

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
  assert.equal(solar.quality, 'cited');
  assert.ok(Array.isArray(solar.evidence) && solar.evidence.length >= 1);
  assert.ok(solar.evidence.every(item => item.label && item.url));
});

test('process intensities are finite with evidence for main units', () => {
  for (const unit of MAIN_UNITS) {
    const spec = PROCESS_INTENSITIES[unit];
    assert.ok(spec, unit);
    assert.ok(Number.isFinite(spec.intensity) && spec.intensity > 0, unit);
    assert.ok(Array.isArray(spec.evidence) && spec.evidence.length >= 1, unit);
    assert.ok(spec.evidence.every(item => item.label && /^https?:\/\//.test(item.url)), unit);
    assert.ok(['cited', 'screening', 'assumption', 'derived'].includes(spec.quality), unit);
    if (spec.range) {
      assert.equal(spec.range.length, 2);
      assert.ok(spec.range[0] <= spec.intensity && spec.intensity <= spec.range[1], unit);
    }
  }
});

test('estimateFootprint returns cited/screening process pads from activity', () => {
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
  assert.equal(byId.idle, undefined);
  assert.ok(footprint.processes.length >= 7);
  assert.ok(footprint.processes.every(item => item.areaM2 > 0 && item.evidence?.length && item.quality));
  // electrolyzer: allocKW = 5000/24, intensity 0.072 → max(24, ...)
  const elyKW = 5000 / 24;
  assert.ok(Math.abs(byId.ely.areaM2 - Math.max(24, elyKW * PROCESS_INTENSITIES.electrolyzer.intensity)) < 1e-9);
  // DAC solid: 1000 kg/d * 365 / 1000 t/y * 1.12
  assert.ok(Math.abs(byId.dac.areaM2 - Math.max(36, 365 * PROCESS_INTENSITIES['dac-solid'].intensity)) < 1e-9);
  assert.ok(Math.abs(byId.ro.areaM2 - Math.max(16, 40 * PROCESS_INTENSITIES.swro.intensity)) < 1e-9);
  assert.ok(Math.abs(byId['site-battery'].areaM2 - Math.max(20, 2 * PROCESS_INTENSITIES.battery.intensity)) < 1e-9);
  assert.ok(Math.abs(footprint.processAreaM2 - footprint.processes.reduce((sum, item) => sum + item.areaM2, 0)) < 1e-12);
  assert.equal(footprint.totalAreaM2, footprint.processAreaM2);
  assert.match(footprint.assumptions.join(' '), /cited or screening intensities/i);
});

test('network landHa is the sum of plant totalHa from estimateFootprint', () => {
  const result = evaluateNetwork(createFuelsAndMineralsNetwork(6));
  const summed = result.plants.reduce((sum, plant) => sum + plant.footprint.totalHa, 0);
  assert.ok(Math.abs(result.landHa - summed) < 1e-12);
  assert.ok(result.landHa > result.plants[0].footprint.totalHa);
  const solarOnly = result.plants.reduce((sum, plant) => sum + plant.footprint.solar.ha, 0);
  assert.ok(result.landHa >= solarOnly);
});
