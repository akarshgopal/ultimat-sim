const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_PRESETS = require('../data/site-presets.js');

const KINDS = new Set(['coastal-solar', 'brine-hub', 'desert-solar', 'industrial-coast']);

test('SITE_PRESETS export unique ids and finite lat/lon on globalThis and module.exports', () => {
  assert.equal(globalThis.SITE_PRESETS, SITE_PRESETS);
  assert.ok(Array.isArray(SITE_PRESETS));
  const ids = SITE_PRESETS.map(site => site.id);
  assert.equal(new Set(ids).size, ids.length, 'site preset ids must be unique');

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
    if (site.kind === 'brine-hub') {
      assert.equal(site.rightsHints.seawaterIntake.status, 'unverified', `${site.id} inland intake`);
      assert.equal(site.rightsHints.brineConcession.status, 'unverified', `${site.id} concession`);
    } else {
      assert.equal(site.rightsHints.seawaterIntake.status, 'assumed', `${site.id} coastal intake`);
      assert.equal(site.rightsHints.seawaterIntake.authorize, true);
    }
    for (const [key, hint] of Object.entries(site.rightsHints)) {
      assert.ok(hint.status === 'unverified' || hint.status === 'assumed', `${site.id} ${key} status`);
      assert.notEqual(hint.status, 'authorized');
      assert.equal(hint.authorize, hint.status === 'assumed');
      assert.equal(typeof hint.note, 'string');
      assert.ok(hint.note.length > 0);
    }
  }
});
