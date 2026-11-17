const assert = require('node:assert/strict');
const test = require('node:test');
const { VIEW_TEST, withApp } = require('./helpers.js');

test('abundance view is the landing page: tonnage bars, blockers, materials; frontier button drives the scenario', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(base);
  await page.waitForSelector('#view .ab-track span');
  await page.waitForSelector('#view .kpi-value');
  assert.match(await page.evaluate(() => location.hash), /^#\/abundance/);

  assert.equal(await page.$$eval('#view .ab-bar-row', rows => rows.length), 3, 'today, scenario, frontier');
  const rows = await page.$$eval('#view .data-table tbody tr', trs => trs.length);
  assert.ok(rows >= 25, `material rows: ${rows}`);
  assert.ok(await page.$$eval('#view .ab-blocker-list li', li => li.length) > 0, 'blocked tonnage is attributed to cost items');

  const share = () => page.$eval('#view .kpi-value', n => parseFloat(n.textContent));
  const before = await share();
  await page.click('text=Set the scenario to the frontier');
  await page.waitForFunction(() => /ii=1\.5/.test(location.hash) && /ds=/.test(location.hash));
  // The button disables in the same render that scores the frontier scenario.
  await page.waitForFunction(() => [...document.querySelectorAll('#view button')]
    .find(b => b.textContent.includes('Set the scenario to the frontier'))?.disabled);
  assert.ok(await share() > before, 'the frontier makes more of the world’s tonnage feasible');
  assert.deepEqual(errors, []);
}));
