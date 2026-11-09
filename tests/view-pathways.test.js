const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Company = require('../engine/company.js');
const { VIEW_TEST, withApp, simulationIdle, pageOverflow, companyData } = require('./helpers.js');

const { pathways: PATHWAYS } = companyData();

// ---------------------------------------------------------------- engine helper used by the view
test('evaluateAtYear matches rankOpportunities at year 0 and follows the cost factors it is given', () => {
  const input = companyData();
  const [row] = Company.rankOpportunities(input, { sizeMultiple: 10 }).filter(r => r.pathwayId === 'green-ammonia');
  assert.ok(row, 'green-ammonia ranks');
  const ev = Company.evaluateAtYear(input, 'green-ammonia', row.siteId, row.sizeKgPerDay, 0);
  assert.ok(Math.abs(ev.lcopUsdPerKg - row.lcopUsdPerKg) < 1e-9, `${ev.lcopUsdPerKg} vs ${row.lcopUsdPerKg}`);
  const halved = { costFactors: { electrolyzer: 0.5, process: 0.5, desal: 0.5, dac: 0.5, storage: 0.5 }, pvUsdPerKWp: 200 };
  const cheaper = Company.evaluateAtYear(input, 'green-ammonia', row.siteId, row.sizeKgPerDay, 5, halved);
  assert.ok(cheaper.lcopUsdPerKg < ev.lcopUsdPerKg, 'lower cost factors and PV price lower the cost');
  // With the utilization design off, process capex scales exactly with the cost factors (with it
  // on, cheaper PV and equipment re-optimize oversizing and storage, so the scaling is not linear).
  const flat = { ...input, config: { utilization: { enabled: false } } };
  const flat0 = Company.evaluateAtYear(flat, 'green-ammonia', row.siteId, row.sizeKgPerDay, 0);
  const flatCheap = Company.evaluateAtYear(flat, 'green-ammonia', row.siteId, row.sizeKgPerDay, 5, halved);
  assert.ok(Math.abs(flatCheap.capex.process - flat0.capex.process * 0.5) < 1e-6 * flat0.capex.process, 'process capex scales with the given factors');
  assert.equal(Company.evaluateAtYear(input, 'no-such-pathway', row.siteId, 1000, 0), null);
  assert.equal(Company.evaluateAtYear(input, 'green-ammonia', 'no-such-site', 1000, 0), null);
});

// ---------------------------------------------------------------- browser
const SHOTS = process.env.PATHWAYS_SHOTS; // optional directory for screenshots

test('pathways view: list, detail with recipe, cost-vs-year chart and flowsheet', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  // List.
  await page.goto(`${base}#/pathways`);
  await simulationIdle(page);
  await page.waitForFunction(() => document.querySelectorAll('.v-pathways .pw-table tbody tr').length > 0);
  const rowCount = await page.$$eval('.v-pathways .pw-table tbody tr', rows => rows.length);
  assert.equal(rowCount, PATHWAYS.length, 'one row per pathway');
  const statuses = await page.$$eval('.v-pathways .pw-status', tags => tags.map(t => t.dataset.status));
  assert.ok(statuses.includes('built'), 'the default run builds at least one pathway');
  // Filters (applied synchronously): search narrows, built-only shows built rows.
  await page.fill('.v-pathways .pw-filters input[type="search"]', 'ammonia');
  const filtered = await page.$$eval('.v-pathways .pw-table tbody tr', rows => rows.length);
  assert.ok(filtered >= 1 && filtered < PATHWAYS.length, `search rows ${filtered}`);
  await page.fill('.v-pathways .pw-filters input[type="search"]', '');
  await page.check('.v-pathways .pw-filters input[type="checkbox"]');
  const builtRows = await page.$$eval('.v-pathways .pw-status', tags => tags.map(t => t.dataset.status));
  assert.ok(builtRows.length >= 1 && builtRows.every(s => s === 'built'), 'built only');
  await page.uncheck('.v-pathways .pw-filters input[type="checkbox"]');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'view-pathways-list.png'), fullPage: true });

  // Clicking a row opens the detail.
  await page.click('.v-pathways .pw-table tbody tr[data-href*="pathways/green-ammonia"] td:nth-child(4)');
  await page.waitForFunction(() => location.hash.startsWith('#/pathways/green-ammonia'));
  await page.waitForSelector('.v-pathways .pw-flowsheet');
  await page.waitForFunction(() => document.querySelectorAll('.v-pathways .pw-chart svg.chart-svg path.chart-line').length >= 2);
  assert.match(await page.textContent('.v-pathways h1'), /Green ammonia/);
  assert.ok(await page.$('.v-pathways a[href^="#/markets/ammonia"]'), 'product links to its market');
  const feedRows = await page.$$eval('.v-pathways .pw-feeds tbody tr', rows => rows.length);
  assert.ok(feedRows >= 2, `recipe feeds ${feedRows}`);
  assert.ok(await page.$$eval('.v-pathways .pw-bar', bars => bars.length) >= 2, 'capex bars');
  const fsNodes = await page.$$eval('.v-pathways .pw-flowsheet .pw-node', n => n.length);
  const fsEdges = await page.$$eval('.v-pathways .pw-flowsheet path.pw-edge', n => n.length);
  assert.ok(fsNodes >= 3 && fsEdges >= 2, `flowsheet ${fsNodes} nodes / ${fsEdges} edges`);
  assert.ok(await page.$$eval('.v-pathways .pw-rail-drop', n => n.length) >= 1, 'electricity drops');
  assert.ok(await page.$$eval('.v-pathways a[href^="#/sites/"]', n => n.length) >= 1, 'site links');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'view-pathways-detail.png'), fullPage: true });

  // Phone width: no page-level horizontal scroll; the diagram scrolls inside its card.
  await page.setViewportSize({ width: 380, height: 844 });
  const overflow = await pageOverflow(page);
  assert.ok(overflow <= 0, `no horizontal page scroll at 380 px (overflow ${overflow}px)`);
  if (SHOTS) {
    await page.setViewportSize({ width: 390, height: 844 });
    await pageOverflow(page);
    await page.screenshot({ path: path.join(SHOTS, 'view-pathways-detail-390.png'), fullPage: true });
  }

  // Unknown id renders a friendly empty state.
  await page.goto(`${base}#/pathways/nope`);
  await page.waitForSelector('.v-pathways .empty');

  assert.deepEqual(errors, []);
}));
