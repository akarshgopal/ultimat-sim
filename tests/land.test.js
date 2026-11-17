const test = require('node:test');
const assert = require('node:assert/strict');
const { landPriceAt } = require('../engine/land.js');

test('landPriceAt returns the priced admin region containing (or nearest to) a coordinate', () => {
  const cases = [
    [-23.1, -70.448, 'Chile'],
    [24.761, 54.683, 'United Arab Emirates'],
    [22.84, 69.72, 'India'],
    [35.6, 139.7, 'Japan'],
    [-33.9, 18.4, 'South Africa'],
  ];
  for (const [lat, lon, name] of cases) {
    const record = landPriceAt(lat, lon);
    assert.equal(record?.name, name, `${lat},${lon}`);
    assert.ok(record.usdPerHa > 0);
    assert.ok(['cited', 'screening'].includes(record.quality));
  }
});

test('open ocean and invalid coordinates have no land price', () => {
  assert.equal(landPriceAt(0, -30), null);
  assert.equal(landPriceAt(120, 0), null);
  assert.equal(landPriceAt(NaN, 10), null);
});
