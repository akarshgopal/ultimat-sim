const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');

test('committed data/sites.js equals a fresh regeneration (staleness guard)', async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'build-sites.mjs')).href);
  const fresh = mod.renderModule(mod.buildSiteRows());
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'data', 'sites.js'), 'utf8'), fresh,
    'data/sites.js is stale: run node scripts/build-sites.mjs');
});

test('every site has solar, a kind and resource tags the simulator relies on', () => {
  const { SITES } = require('../data/sites.js');
  assert.ok(SITES.length >= 30);
  assert.equal(new Set(SITES.map(s => s.id)).size, SITES.length);
  for (const s of SITES) {
    assert.ok(s.pvKWhPerKWpDay > 2 && s.pvKWhPerKWpDay < 8, s.id);
    assert.ok(Number.isFinite(s.latitude) && Number.isFinite(s.longitude), s.id);
    assert.equal(typeof s.coastal, 'boolean', s.id);
    assert.ok(s.kind, s.id);
  }
});
