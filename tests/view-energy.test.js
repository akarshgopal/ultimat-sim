const assert = require('node:assert/strict');
const test = require('node:test');
const { VIEW_TEST, withApp } = require('./helpers.js');

test('energy view: break-even table, unlock curve, cost bars; presets drive the scenario', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(`${base}#/energy`);
  await page.waitForSelector('#view .en-bar-row');
  await page.waitForSelector('#view .kpi-value');

  const rows = await page.$$eval('#view .data-table tbody tr', trs => trs.length);
  assert.ok(rows >= 20, `break-even rows: ${rows}`);
  const curve = await page.$$eval('#view svg.chart-svg path.chart-line', ps => ps.length);
  assert.ok(curve >= 4, `unlock curves: ${curve}`);
  const cells = await page.$$eval('#view .data-table td', tds => tds.map(t => t.textContent.trim()));
  assert.ok(cells.some(t => t === 'never'), 'some pathways are blocked by more than energy');
  assert.ok(cells.some(t => t.startsWith('≤ ')), 'some pathways have an energy break-even');

  const feasible = () => page.$eval('#view .kpi-value', n => Number(n.textContent.trim().split(' ')[0]));
  const before = await feasible();
  await page.click('#view button[data-kwh]:last-child');
  await page.click('#view button[data-equip="0.1"]');
  await page.waitForFunction(() => /kwh=0\.0046/.test(location.hash) && /equip=0\.1/.test(location.hash));
  // The KPIs are recomputed after a debounce; their caption names the scenario they were solved for.
  await page.waitForFunction(() => /equipment ×0\.1\b/.test(document.querySelector('#view .kpi-sub')?.textContent));
  const after = await feasible();
  assert.ok(after > before, `feasible pathways ${before} → ${after}`);
  assert.deepEqual(errors, []);
}));
