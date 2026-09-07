const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('root chrome exposes four tabs and keeps Network copy without Empire', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /role="tablist"/);
  assert.match(html, />Overview</);
  assert.match(html, />Location</);
  assert.match(html, />Process</);
  assert.match(html, />Economics</);
  assert.doesNotMatch(html, /empire/i);
  assert.match(html, /Network/);
  assert.match(html, /id="networkPanel"/);
  assert.doesNotMatch(html, /role="tab"[^>]*>\s*Network\s*</i);
  assert.match(html, /id="sitePreset"/);
  assert.match(html, /id="siteMapLegend"/);
  assert.match(html, /data\/site-presets\.js/);
  assert.match(html, /vendor\/LercDecode\.js/);
  assert.ok(html.indexOf('data/site-presets.js') < html.indexOf('js/flowsheet-app.js'));
  assert.ok(html.indexOf('vendor/LercDecode.js') < html.indexOf('js/flowsheet-app.js'));
});
