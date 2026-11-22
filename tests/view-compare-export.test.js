const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { VIEW_TEST, withApp, simulationIdle } = require('./helpers.js');

test('pin a scenario, change it, compare on Abundance and Company; the link carries both; swap and unpin', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(base + '#/abundance');
  await simulationIdle(page);
  await page.click('#pinBtn');
  assert.match(await page.textContent('#compareBar'), /Nothing changed yet/);
  assert.ok(!/null/.test(await page.textContent('#compareBar')));

  await page.click('button:has-text("10× cheaper")');
  await page.waitForFunction(() => /Solar electricity/.test(document.getElementById('compareBar').textContent));
  assert.deepEqual(await page.$$eval('.ab-bar-label', l => l.map(x => x.textContent)), ['Today', 'Pinned', 'Your scenario', 'Frontier']);
  assert.match(await page.$eval('.kpi-sub', e => e.textContent), /pinned \d+%/);
  assert.ok((await page.$$eval('#view thead th', t => t.map(x => x.textContent))).includes('Pinned'));

  // The URL reproduces the comparison: open it fresh on Company.
  const hash = await page.evaluate(() => location.hash);
  assert.match(hash, /kwh=.*vs=/);
  await page.goto(base + hash.replace('#/abundance', '#/company'));
  await page.waitForSelector('.pin-compare table', { timeout: 60000 });
  const rows = await page.$$eval('.pin-compare tbody tr', r => r.map(x => x.cells[0].textContent));
  assert.ok(rows.includes('Cumulative material'));

  // Swap reuses both runs; unpin clears the URL.
  const kwh = await page.evaluate(() => Store.scenario.kwh);
  await page.click('#compareBar >> text=Swap');
  await page.waitForFunction(k => Store.scenario.kwh !== k && Store.pinned.scenario.kwh === k, kwh);
  await page.click('#compareBar >> text=Unpin');
  assert.ok(await page.$eval('#compareBar', e => e.hidden));
  assert.ok(!/vs=/.test(await page.evaluate(() => location.hash)));
  assert.deepEqual(errors, []);
}));

test('tables download as CSV with raw numbers; Company downloads its run', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  const grab = async selector => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
    return { name: download.suggestedFilename(), lines: fs.readFileSync(await download.path(), 'utf8').trim().split('\r\n') };
  };
  await page.goto(base + '#/markets');
  await simulationIdle(page);
  const markets = await grab('.table-csv');
  assert.equal(markets.name, 'markets.csv');
  assert.match(markets.lines[0], /^Material,"Output \d{4} \(t, incl\. in-house\)",Share of world supply \(fraction\)/);
  assert.equal(markets.lines.length, 1 + await page.$$eval('#view tbody tr', r => r.length));
  assert.match(markets.lines[1], /^(?:"[^"]*"|[^,]*),\d+(\.\d+)?,0\.\d+/, 'numbers are raw, not "430M t"');

  await page.goto(base + '#/company');
  await simulationIdle(page);
  const log = await grab('.build-log + .table-foot .table-csv');
  const shown = await page.$$eval('.build-log tbody tr', r => r.length);
  assert.ok(log.lines.length - 1 > shown, 'the export has every plant, not just the rows shown');
  const timeline = await grab('text=year-by-year CSV');
  assert.equal(timeline.lines.length - 1, await page.evaluate(() => Store.result.timeline.length));
  assert.match(timeline.lines[0], /^year,/);
  const run = await grab('text=full run (JSON)');
  const json = JSON.parse(run.lines.join('\r\n'));
  assert.equal(json.plants.length, await page.evaluate(() => Store.result.plants.length));
  assert.deepEqual(errors, []);
}));
