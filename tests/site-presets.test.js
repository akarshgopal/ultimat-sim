const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_PRESETS = require('../data/site-presets.js');
const { RIGHT_KEYS, RIGHT_KINDS, authorizeForStatus } = require('../engine/uncertainty');

const KINDS = new Set(['coastal-solar', 'brine-hub', 'desert-solar', 'industrial-coast']);
const REQUIRED_IDS = [
  'uae-taweelah',
  'saudi-oxagon',
  'au-port-hedland',
  'india-mundra',
  'texas-corpus-christi',
  'egypt-ain-sokhna',
  'chile-mejillones',
  'namibia-walvis-bay',
  'oman-duqm',
  'spain-almeria',
];

test('SITE_PRESETS export unique ids and finite lat/lon on globalThis and module.exports', () => {
  assert.equal(globalThis.SITE_PRESETS, SITE_PRESETS);
  assert.ok(Array.isArray(SITE_PRESETS));
  assert.ok(SITE_PRESETS.length >= REQUIRED_IDS.length);

  const ids = SITE_PRESETS.map(site => site.id);
  assert.equal(new Set(ids).size, ids.length, 'site preset ids must be unique');

  const byId = new Map(SITE_PRESETS.map(site => [site.id, site]));
  for (const id of REQUIRED_IDS) {
    assert.ok(byId.has(id), `missing required site ${id}`);
  }
  assert.ok(byId.has('morocco-agadir') || byId.has('morocco-dakhla'), 'North Africa needs Agadir or Dakhla');

  const almeria = byId.get('spain-almeria');
  assert.equal(almeria.latitude, 36.834);
  assert.equal(almeria.longitude, -2.463);
  assert.equal(almeria.kind, 'coastal-solar');

  for (const site of SITE_PRESETS) {
    assert.equal(typeof site.id, 'string');
    assert.ok(site.id.length > 0);
    assert.equal(typeof site.name, 'string');
    assert.ok(site.name.length > 0);
    assert.equal(typeof site.region, 'string');
    assert.ok(site.region.length > 0);
    assert.ok(Number.isFinite(site.latitude), `${site.id} latitude must be finite`);
    assert.ok(Number.isFinite(site.longitude), `${site.id} longitude must be finite`);
    assert.ok(site.latitude >= -90 && site.latitude <= 90, `${site.id} latitude in range`);
    assert.ok(site.longitude >= -180 && site.longitude <= 180, `${site.id} longitude in range`);
    assert.ok(KINDS.has(site.kind), `${site.id} kind ${site.kind}`);
    assert.ok(Array.isArray(site.evidence) && site.evidence.length > 0, `${site.id} needs evidence`);
    for (const item of site.evidence) {
      assert.equal(typeof item.label, 'string');
      assert.match(item.url, /^https?:\/\//);
    }
    assert.equal(typeof site.notes, 'string');
    assert.ok(site.rightsHints && typeof site.rightsHints === 'object');
    for (const [key, hint] of Object.entries(site.rightsHints)) {
      assert.ok(RIGHT_KEYS.includes(key), `${site.id} unknown right ${key}`);
      assert.equal(hint.kind, RIGHT_KINDS[key]);
      assert.ok(hint.status === 'unverified' || hint.status === 'assumed', `${site.id} ${key} status`);
      assert.notEqual(hint.status, 'authorized');
      assert.equal(hint.authorize, authorizeForStatus(hint.status));
      assert.equal(hint.authorize, hint.status === 'assumed');
      assert.equal(typeof hint.note, 'string');
      assert.ok(hint.note.length > 0);
    }
  }
});
