const assert = require('node:assert/strict');
const test = require('node:test');

const BOM = require('../data/bom.js');
const C = require('../engine/company.js');
const U = require('../engine/utilization.js');
const tea = require('../data/tea-screening.js');

const { close } = require('./helpers.js');

const { COMMODITIES, CLASSES, materialsUsdPerUnit, idiotIndex, floorFraction } = BOM;
const QUALITIES = new Set(['cited', 'screening']);
// The engine looks floors up by these names; a renamed class would silently stop being squeezed.
const ENGINE_CLASSES = ['pv', 'battery', 'electrolyzer', 'desal', 'dac', 'thermalStore', 'h2Storage', 'process'];

test('BOM classes are exactly the cost classes the engine squeezes', () => {
  assert.deepEqual(Object.keys(CLASSES).sort(), [...ENGINE_CLASSES].sort());
});

test('every commodity has a finite positive price, quality and an https URL', () => {
  for (const [key, c] of Object.entries(COMMODITIES)) {
    const where = `COMMODITIES.${key}`;
    assert.ok(Number.isFinite(c.usdPerKg) && c.usdPerKg > 0, where);
    assert.ok(QUALITIES.has(c.quality), where);
    assert.equal(typeof c.source, 'string', where);
    assert.ok(c.source.length > 0, where);
    assert.match(c.url, /^https:\/\//, where);
    assert.equal(typeof c.note, 'string', where);
    for (const e of c.evidence || []) assert.match(e.url, /^https:\/\//, `${where} evidence`);
  }
});

const checkLines = (lines, where) => {
  assert.ok(Array.isArray(lines) && lines.length >= 1, `${where}: ≥ 1 line`);
  for (const l of lines) {
    assert.ok(COMMODITIES[l.material], `${where}: unknown material ${l.material}`);
    assert.ok(Number.isFinite(l.kgPerUnit) && l.kgPerUnit > 0, `${where}: ${l.material} kgPerUnit`);
    assert.equal(typeof l.note, 'string', `${where}: ${l.material} note`);
  }
};

test('every class matches the schema', () => {
  for (const [key, row] of Object.entries(CLASSES)) {
    const where = `CLASSES.${key}`;
    assert.equal(typeof row.unit, 'string', where);
    assert.ok(row.unit.length > 0, where);
    assert.ok(Number.isFinite(row.todayUsdPerUnit) && row.todayUsdPerUnit > 0, where);
    assert.equal(typeof row.todaySource, 'string', where);
    checkLines(row.lines, where);
    for (const [v, variant] of Object.entries(row.variants || {})) checkLines(variant.lines, `${where}.variants.${v}`);
    assert.ok((row.extraUsdPerUnit || 0) >= 0, where);
    assert.ok(QUALITIES.has(row.quality), where);
    assert.ok(row.sources.length >= 1, `${where}: ≥ 1 source`);
    assert.ok(row.sources.some(s => /^https:\/\//.test(s.url)), `${where}: ≥ 1 https source`);
    for (const s of row.sources) assert.match(s.url, /^https:\/\//, `${where} source ${s.label}`);
    assert.equal(typeof row.note, 'string', where);
  }
});

test('helpers: materials sum, idiot index > 1, floor fraction = 1/II', () => {
  for (const [key, row] of Object.entries(CLASSES)) {
    const sum = row.lines.reduce((s, l) => s + l.kgPerUnit * COMMODITIES[l.material].usdPerKg, 0) + (row.extraUsdPerUnit || 0);
    close(materialsUsdPerUnit(key), sum);
    close(materialsUsdPerUnit(row), sum);
    const ii = idiotIndex(key);
    assert.ok(Number.isFinite(ii) && ii > 1, `${key}: idiot index ${ii} must exceed 1`);
    close(ii, row.todayUsdPerUnit / sum);
    close(floorFraction(key) * ii, 1);
    for (const v of Object.keys(row.variants || {})) assert.ok(idiotIndex(key, v) > 1, `${key}.${v}`);
  }
  assert.throws(() => materialsUsdPerUnit('nope'));
});

test('todayUsdPerUnit equals the engine/repo defaults', () => {
  assert.equal(CLASSES.pv.todayUsdPerUnit, C.DEFAULTS.pv.capexUsdPerKWp);
  assert.equal(CLASSES.battery.todayUsdPerUnit, U.DEFAULTS.battery.usdPerKWh);
  assert.equal(CLASSES.thermalStore.todayUsdPerUnit, U.DEFAULTS.thermal.usdPerKWh);
  assert.equal(CLASSES.h2Storage.todayUsdPerUnit, U.DEFAULTS.bufferUsdPerKg.H2);
  assert.equal(CLASSES.electrolyzer.todayUsdPerUnit, tea.packs.electrolyzer.capexIntensity);
  assert.equal(tea.packs.electrolyzer.intensityUnit, '$/(kg H2/day)');
  assert.equal(CLASSES.desal.todayUsdPerUnit, tea.packs.swro.capexIntensity);
  assert.equal(tea.packs.swro.intensityUnit, '$/(m³/day)');
  // DAC pack is $/(kg CO₂/day); the BOM class is $/(t CO₂/yr).
  close(CLASSES.dac.todayUsdPerUnit, tea.packs.dac.capexIntensity * 1000 / 365);
  assert.equal(tea.packs.dac.intensityUnit, '$/(kg CO2/day)');
});

test('the electrolyzer class defaults to the cheaper-materials chemistry', () => {
  assert.equal(CLASSES.electrolyzer.chemistry, 'alkaline');
  close(materialsUsdPerUnit('electrolyzer'), materialsUsdPerUnit('electrolyzer', 'alkaline'));
  assert.ok(materialsUsdPerUnit('electrolyzer', 'alkaline') < materialsUsdPerUnit('electrolyzer', 'pem'));
});

test('materials floors land in the expected screening bands', () => {
  const m = k => materialsUsdPerUnit(k);
  assert.ok(m('pv') >= 100 && m('pv') <= 250, `PV ${m('pv')}`);
  assert.ok(idiotIndex('pv') >= 3 && idiotIndex('pv') <= 7);
  assert.ok(m('battery') >= 25 && m('battery') <= 60, `battery ${m('battery')}`);
  assert.ok(idiotIndex('battery') >= 6 && idiotIndex('battery') <= 14);
  for (const v of ['alkaline', 'pem']) {
    const perKW = materialsUsdPerUnit('electrolyzer', v) / BOM.KW_PER_KG_H2_DAY;
    assert.ok(perKW >= 40 && perKW <= 150, `electrolyzer ${v} ${perKW} $/kW`);
  }
  assert.ok(idiotIndex('process') >= 10 && idiotIndex('process') <= 30);
});
