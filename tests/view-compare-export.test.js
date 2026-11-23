const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { VIEW_TEST, withApp, simulationIdle } = require('./helpers.js');

test('pin a scenario, change it, compare on Abundance and Company; the link carries both; swap and unpin', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(base + '#/abundance');
  await page.waitForSelector('#view .kpi-value');
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

test('only views that show simulation results run the 25-year simulation; Back undoes scenario changes', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  // Abundance never starts the company simulation, even when the scenario changes.
  await page.goto(base + '#/abundance');
  await page.waitForSelector('#view .kpi-value');
  await page.click('button:has-text("3× cheaper")');
  await page.waitForTimeout(600);
  assert.deepEqual(await page.evaluate(() => ({ busy: Store.busy, result: Boolean(Store.result) })), { busy: false, result: false });

  // Opening Company runs it once for the current scenario.
  await page.click('.app-nav a[data-view="company"]');
  await simulationIdle(page);
  assert.ok(await page.evaluate(() => Store.result.config.pv.capexUsdPerKWp > 0));
  const kwh = await page.evaluate(() => Store.scenario.kwh);

  // Two separate edits are two Back steps; each Back restores the scenario before it.
  await page.fill('#co-f-share', '20');
  await page.waitForTimeout(1300);
  await page.fill('#co-f-share', '30');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => Store.scenario.share), 30);
  await page.goBack();
  await page.waitForFunction(() => Store.scenario.share === 20);
  await page.goBack();
  await page.waitForFunction(() => Store.scenario.share === 10);
  assert.equal(await page.evaluate(() => Store.scenario.kwh), kwh, 'Back stops at the scenario Company opened with');
  assert.match(await page.evaluate(() => location.hash), /^#\/company/);
  await page.goForward();
  await page.waitForFunction(() => Store.scenario.share === 20);
  assert.deepEqual(errors, []);
}));

test('tables sort from the keyboard; chart values show on tap, not only on hover', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(base + '#/pathways');
  await page.waitForSelector('th[data-sort="price"] .th-sort');
  await page.focus('th[data-sort="price"] .th-sort');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('th[data-sort="price"]', th => th.getAttribute('aria-sort')), 'descending');
  await page.keyboard.press(' ');
  assert.equal(await page.$eval('th[data-sort="price"]', th => th.getAttribute('aria-sort')), 'ascending');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Price', 'focus stays on the sort button');

  await page.goto(base + '#/company');
  await simulationIdle(page);
  const tapAt = frac => page.$eval('svg.chart-svg', (svg, f) => {
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: r.left + r.width * f, clientY: r.top + r.height / 2 }));
    svg.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'touch' }));
    const tip = document.getElementById('chartTooltip');
    return tip && !tip.hidden ? tip.querySelector('.tip-head').textContent : null;
  }, frac);
  const year = await tapAt(0.98);
  assert.equal(year, String(await page.evaluate(() => Store.result.timeline.at(-1).year)), 'a tap shows the tapped year and survives pointerleave');
  await page.$eval('h1', h => h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })));
  assert.ok(await page.$eval('#chartTooltip', t => t.hidden), 'a tap elsewhere hides it');
  assert.deepEqual(errors, []);
}));

test('heavy calculations run off the main thread: no long freezes, same numbers as the synchronous path', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.addInitScript(() => {
    window.__longest = 0;
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__longest = Math.max(window.__longest, e.duration); }).observe({ type: 'longtask', buffered: true });
  });
  const longest = async fn => { await page.evaluate(() => { window.__longest = 0; }); await fn(); return page.evaluate(() => window.__longest); };
  await page.goto(base + '#/abundance');
  await page.waitForSelector('#view .kpi-value');
  // The scoreboard from the worker equals the synchronous one.
  assert.deepEqual(await page.evaluate(async () => (await Store.abundanceAsync()).totals), await page.evaluate(() => Store.abundance().totals));

  // Energy: break-evens for four equipment levels (~1 s of work) must not block the page.
  const energy = await longest(async () => {
    await page.click('.app-nav a[data-view="energy"]');
    await page.waitForSelector('#view .chart-svg', { timeout: 60000 });
  });
  assert.ok(energy < 500, `opening Energy froze the page for ${Math.round(energy)} ms`);

  // Company's profit comparison (a full 25-year run) must not block it either.
  await page.click('.app-nav a[data-view="company"]');
  await simulationIdle(page);
  const compare = await longest(async () => {
    await page.click('summary:has-text("Compare with the")');
    await page.waitForSelector('.compare-body table', { timeout: 90000 });
  });
  assert.ok(compare < 500, `the profit comparison froze the page for ${Math.round(compare)} ms`);
  assert.deepEqual(errors, []);
}));
