const assert = require('node:assert/strict');
const test = require('node:test');

const tea = require('../data/tea-screening.js');
const { MARKETS } = require('../data/markets.js');

// Keys of TeaScreening.prices that are feeds/inputs, not sale products.
const INPUT_ONLY = new Set([
  'water', 'brine', 'seawater', 'power', 'quartz', 'limestone', 'bauxite', 'silica-sand',
  'soda-ash', 'kiln-clay', 'iron-ore', 'alumina', 'dextrose', 'ionic-clay',
]);
const isSaleKey = (key) => !INPUT_ONLY.has(key) && !key.endsWith('-feed');
const SALE_KEYS = Object.keys(tea.prices).filter(isSaleKey);

test('there is one market row per TeaScreening sale key', () => {
  assert.ok(SALE_KEYS.length >= 30, `expected ≥30 sale keys, got ${SALE_KEYS.length}`);
  assert.deepEqual(Object.keys(MARKETS).sort(), [...SALE_KEYS].sort());
});

test('every market row matches the schema', () => {
  for (const [key, row] of Object.entries(MARKETS)) {
    const where = `MARKETS.${key}`;
    assert.equal(typeof row.name, 'string', where);
    assert.ok(row.name.length > 0, where);
    assert.equal(typeof row.basis, 'string', where);
    assert.ok(row.basis.length > 0, where);
    for (const f of ['worldDemandTPerYear', 'priceUsdPerKg', 'priceElasticity']) {
      assert.ok(Number.isFinite(row[f]) && row[f] > 0, `${where}.${f} must be finite > 0`);
    }
    assert.ok(Number.isInteger(row.demandYear) && row.demandYear >= 2015 && row.demandYear <= 2026, `${where}.demandYear`);
    assert.ok(Number.isFinite(row.growthPerYear) && row.growthPerYear >= -0.1 && row.growthPerYear <= 0.5, `${where}.growthPerYear`);
    assert.ok(Array.isArray(row.priceBandUsdPerKg) && row.priceBandUsdPerKg.length === 2, `${where}.priceBandUsdPerKg`);
    const [lo, hi] = row.priceBandUsdPerKg;
    assert.ok(Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && lo <= hi, `${where} band`);
    assert.ok(lo <= row.priceUsdPerKg && row.priceUsdPerKg <= hi, `${where} band must contain price`);
    assert.ok(row.priceElasticity > 0 && row.priceElasticity <= 1.5, `${where}.priceElasticity in (0, 1.5]`);
    assert.ok(row.quality === 'cited' || row.quality === 'screening', `${where}.quality`);
    assert.ok(Array.isArray(row.sources) && row.sources.length >= 1, `${where}.sources`);
    for (const s of row.sources) {
      assert.equal(typeof s.label, 'string', where);
      assert.ok(s.label.length > 0, where);
      assert.match(s.url, /^https:\/\/\S+$/, `${where} source url`);
    }
    assert.equal(typeof row.note, 'string', where);
    assert.ok(row.note.length > 0, where);
  }
});

test('market reference price equals TeaScreening price', () => {
  for (const key of SALE_KEYS) {
    assert.equal(MARKETS[key].priceUsdPerKg, tea.prices[key].value, `${key} price must equal TeaScreening.prices`);
  }
});

test('NdPr MREC and separated rows describe the same world market', () => {
  assert.equal(MARKETS['ndpr-oxide'].worldDemandTPerYear, MARKETS['ndpr-oxide-separated'].worldDemandTPerYear);
});

test('intermediates the cases can buy sell at that purchase price (make-vs-buy parity)', () => {
  assert.equal(tea.prices.hydrogen.value, tea.costs['hydrogen-feed'].value);
  assert.equal(tea.prices.co2.value, tea.costs['co2-feed'].value);
});
