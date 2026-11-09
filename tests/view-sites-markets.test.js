const assert = require('node:assert/strict');
const test = require('node:test');
const { VIEW_TEST, withApp, simulationIdle, pageOverflow } = require('./helpers.js');

test('sites and markets views render lists, details, maps and charts offline', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  // Sites list. Leaflet (unpkg) is unreachable, so the map must fall back to SVG.
  await page.goto(`${base}#/sites`);
  await simulationIdle(page);
  await page.waitForFunction(() => document.querySelectorAll('#sitesTable tbody tr').length >= 30);
  assert.ok(await page.$('.v-sites .site-map svg.map-fallback'), 'SVG fallback map');
  assert.ok(await page.$$eval('.map-fallback .map-site circle', c => c.length) >= 30, 'site dots');
  assert.ok(await page.$$eval('.map-fallback .map-site.is-built', c => c.length) >= 1, 'some site has PV built');

  // Site detail: hostable pathways.
  await page.goto(`${base}#/sites/chile-mejillones`);
  await page.waitForSelector('#sitePathways tbody tr');
  const hosted = await page.$$eval('#sitePathways tbody tr a[href*="#/pathways/"]', a => a.map(n => n.getAttribute('href')));
  assert.ok(hosted.length >= 5, `hostable pathways: ${hosted.length}`);
  assert.match(await page.textContent('h1'), /Mejillones/);

  // Markets list.
  await page.goto(`${base}#/markets`);
  await simulationIdle(page);
  await page.waitForFunction(() => document.querySelectorAll('#marketsTable tbody tr').length >= 30);
  const first = await page.$eval('#marketsTable tbody tr', tr => tr.className);
  assert.match(first, /is-supplied/, 'supplied markets lead');

  // Market detail: sources and a chart.
  await page.goto(`${base}#/markets/pv-module`);
  await page.waitForFunction(() => document.querySelectorAll('.v-markets svg.chart-svg path.chart-line').length >= 2);
  const sources = await page.$$eval('.v-markets .sources a[href^="http"]', a => a.length);
  assert.ok(sources >= 1, `source links: ${sources}`);
  assert.ok(await page.$('#marketPathways a[href*="#/pathways/silicon"]'), 'pv-module made by the silicon pathway');

  // Phone width: no horizontal page scroll.
  await page.setViewportSize({ width: 380, height: 800 });
  const overflow = await pageOverflow(page);
  assert.ok(overflow <= 0, `no horizontal page scroll at 380 px (overflow ${overflow}px)`);

  assert.deepEqual(errors, []);
}));
