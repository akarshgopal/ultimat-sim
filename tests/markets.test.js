const assert = require('node:assert/strict');
const test = require('node:test');

const tea = require('../data/tea-screening.js');
const { MARKETS, SCHEMA_VERSION } = require('../data/markets.js');

// Keys of TeaScreening.prices that are feeds/inputs, not sale products.
const INPUT_ONLY = new Set([
  'water', 'brine', 'seawater', 'power', 'quartz', 'limestone', 'bauxite', 'silica-sand',
  'soda-ash', 'kiln-clay', 'iron-ore', 'alumina', 'dextrose', 'ionic-clay',
]);
const isSaleKey = (key) => !INPUT_ONLY.has(key) && !key.endsWith('-feed');
const SALE_KEYS = Object.keys(tea.prices).filter(isSaleKey);
// Extra market rows not in TeaScreening.prices, with the TeaScreening value they mirror.
const EXTRA_PRICE_REF = {};

test('markets schema version and key set match TeaScreening sale keys', () => {
  assert.equal(SCHEMA_VERSION, 1);
  assert.ok(SALE_KEYS.length >= 30, `expected ≥30 sale keys, got ${SALE_KEYS.length}`);
  const expected = [...SALE_KEYS, ...Object.keys(EXTRA_PRICE_REF)].sort();
  assert.deepEqual(Object.keys(MARKETS).sort(), expected);
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
  for (const [key, value] of Object.entries(EXTRA_PRICE_REF)) {
    assert.equal(MARKETS[key].priceUsdPerKg, value, `${key} price must equal its TeaScreening cost reference`);
  }
});

test('basis-sensitive rows use the documented conversions', () => {
  // lithium tonnage is LCE (USGS Li content × 5.323) to match the LCE-proxy price.
  assert.ok(Math.abs(MARKETS.lithium.worldDemandTPerYear - 290000 * 5.323) < 1);
  // pv-module tonnage uses the same 52.7 kg/kWp as the TeaScreening price conversion.
  assert.ok(Math.abs(MARKETS['pv-module'].worldDemandTPerYear - 728e6 * 52.7 / 1000) < 1);
  // NdPr MREC and separated rows describe the same world market.
  assert.equal(MARKETS['ndpr-oxide'].worldDemandTPerYear, MARKETS['ndpr-oxide-separated'].worldDemandTPerYear);
});

test('hydrogen sells at the price the cases pay for purchased hydrogen-feed (make-vs-buy parity)', () => {
  assert.equal(tea.prices.hydrogen.value, tea.costs['hydrogen-feed'].value);
});
