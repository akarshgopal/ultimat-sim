const assert = require('node:assert/strict');
const test = require('node:test');
const { VIEW_TEST, withApp } = require('./helpers.js');

test('designs view: electrolyzer KPIs, cost curve, BOM, next targets; push design into the simulation', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(`${base}#/designs`);
  await page.waitForSelector('#view svg.chart-svg path.chart-line');

  const kpis = await page.$$eval('#view .kpi-value', ns => ns.map(n => n.textContent.trim()));
  assert.ok(kpis.length >= 6, `KPIs: ${kpis.length}`);
  assert.match(kpis[0], /^\$[0-9,.]+k?$/);
  const curves = await page.$$eval('#view svg.chart-svg path.chart-line', ps => ps.length);
  assert.ok(curves >= 3, `cost curves: ${curves}`);
  const bomRows = await page.$$eval('#view .card', cards => {
    const c = cards.find(x => /Bill of materials per kW/.test(x.textContent));
    return c ? c.querySelectorAll('tbody tr').length : 0;
  });
  assert.ok(bomRows >= 10, `BOM rows: ${bomRows}`);

  // The today preset is several times dearer per kW than the lean target (presets redraw synchronously).
  const installed = () => page.$eval('#view .kpi-value', n => Number(n.textContent.replace(/[^0-9.]/g, '')));
  const lean = await installed();
  await page.click('[data-preset="today"]');
  const today = await installed();
  assert.ok(today > 3 * lean, `today $${today}/kW vs lean $${lean}/kW`);

  await page.click('[data-preset="lean"]');
  await page.click('text=Use this design in the company simulation');
  await page.waitForFunction(() => /ds=/.test(location.hash) && /electrolyzer/.test(decodeURIComponent(location.hash)));
  assert.deepEqual(errors, []);
}));
