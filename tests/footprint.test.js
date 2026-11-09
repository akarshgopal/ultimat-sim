const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SQM_PER_ACRE,
  SQM_PER_HA,
  PROCESS_INTENSITIES,
  estimateFootprint,
  estimateSolar,
  estimateSolarLandHa,
} = require('../engine/footprint');

const MAIN_UNITS = [
  'electrolyzer',
  'dac-solid',
  'dac-liquid',
  'dac-electroswing',
  'sabatier',
  'methanol',
  'swro',
  'med',
  'msf',
  'brine-minerals',
  'asu',
  'ammonia',
  'battery',
  'material-buffer',
  'intake-pump',
  'gas-blower',
];

test('solar land is panel area over the ground-coverage ratio', () => {
  const solarKWp = 50000;
  const solar = estimateSolar(solarKWp);
  assert.ok(Math.abs(solar.panelAreaM2 - solarKWp * 1000 / (solar.panelEfficiency * 10)) < 1e-6, 'panel area from STC 1,000 W/m²');
  assert.ok(Math.abs(solar.landAreaM2 - solar.panelAreaM2 / solar.gcr) < 1e-6);
  assert.ok(Math.abs(solar.ha - solar.landAreaM2 / SQM_PER_HA) < 1e-12);
  assert.ok(Math.abs(solar.acres - solar.landAreaM2 / SQM_PER_ACRE) < 1e-12);
  assert.equal(estimateSolarLandHa(solarKWp), solar.ha);
  // Fixed-tilt utility PV needs roughly 1–2 ha per MWp.
  const haPerMWp = solar.ha / (solarKWp / 1000);
  assert.ok(haPerMWp > 0.8 && haPerMWp < 2, `${haPerMWp} ha/MWp`);
  assert.ok(estimateSolar(solarKWp, { panelEfficiency: 15 }).ha > solar.ha, 'less efficient panels need more land');
  assert.ok(solar.evidence.length >= 1 && solar.evidence.every(item => item.label && item.url));
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
  // Pads scale with throughput above a minimum pad per unit.
  const elyKW = 5000 / 24;
  assert.ok(Math.abs(byId.ely.areaM2 - Math.max(24, elyKW * PROCESS_INTENSITIES.electrolyzer.intensity)) < 1e-9);
  assert.ok(Math.abs(byId.dac.areaM2 - Math.max(36, 365 * PROCESS_INTENSITIES['dac-solid'].intensity)) < 1e-9);
  assert.ok(Math.abs(byId.ro.areaM2 - Math.max(16, 40 * PROCESS_INTENSITIES.swro.intensity)) < 1e-9);
  assert.ok(Math.abs(byId['site-battery'].areaM2 - Math.max(20, 2 * PROCESS_INTENSITIES.battery.intensity)) < 1e-9);
  assert.ok(Math.abs(footprint.processAreaM2 - footprint.processes.reduce((sum, item) => sum + item.areaM2, 0)) < 1e-12);
  assert.equal(footprint.totalAreaM2, footprint.processAreaM2);
});
