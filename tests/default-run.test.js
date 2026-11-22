const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// The deploy precomputes the default scenario's run (scripts/build-default-run.mjs); the build only
// runs at deploy time, so check here that the generator works and writes what js/store.js expects.
test('build precomputes the default company run in the shape the app reads', { timeout: 120000 }, async () => {
  const { buildDefaultRun } = await import('../scripts/build-default-run.mjs');
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-run-')), 'default-run.json');
  await buildDefaultRun(out);
  const { configKey, result } = JSON.parse(fs.readFileSync(out, 'utf8'));
  const config = JSON.parse(configKey);
  assert.equal(result.timeline.length, config.years);
  assert.ok(result.plants.length > 0 && result.summary.finalMaterialTPerYear > 0);
  assert.equal(result.config.years, config.years);
});
