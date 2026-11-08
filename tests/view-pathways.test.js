const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const Company = require('../engine/company.js');
const { PATHWAYS } = require('../data/pathways.js');
const { MARKETS } = require('../data/markets.js');
const { SITES } = require('../data/sites.js');

// ---------------------------------------------------------------- engine helper used by the view
test('evaluateAtYear matches rankOpportunities at year 0 and follows the cost factors it is given', () => {
  const input = { pathways: PATHWAYS, markets: MARKETS, sites: SITES };
  const [row] = Company.rankOpportunities(input, { sizeMultiple: 10 }).filter(r => r.pathwayId === 'green-ammonia');
  assert.ok(row, 'green-ammonia ranks');
  const ev = Company.evaluateAtYear(input, 'green-ammonia', row.siteId, row.sizeKgPerDay, 0);
  assert.ok(Math.abs(ev.lcopUsdPerKg - row.lcopUsdPerKg) < 1e-9, `${ev.lcopUsdPerKg} vs ${row.lcopUsdPerKg}`);
  const cheaper = Company.evaluateAtYear(input, 'green-ammonia', row.siteId, row.sizeKgPerDay, 5, {
    costFactors: { electrolyzer: 0.5, process: 0.5, desal: 0.5, dac: 0.5, storage: 0.5 }, pvUsdPerKWp: 200,
  });
  assert.ok(cheaper.lcopUsdPerKg < ev.lcopUsdPerKg, 'lower cost factors and PV price lower the cost');
  assert.ok(Math.abs(cheaper.capex.process - ev.capex.process * 0.5) < 1e-6 * ev.capex.process, 'process capex scales with the given factors');
  assert.equal(Company.evaluateAtYear(input, 'no-such-pathway', row.siteId, 1000, 0), null);
  assert.equal(Company.evaluateAtYear(input, 'green-ammonia', 'no-such-site', 1000, 0), null);
});

// ---------------------------------------------------------------- browser
let playwright = null;
try { playwright = require('playwright'); } catch { /* optional dev dependency */ }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function startServer() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.normalize(path.join(ROOT, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const SHOTS = process.env.PATHWAYS_SHOTS; // optional directory for screenshots

test('pathways view: list, detail with recipe, cost-vs-year chart and flowsheet', { skip: !playwright && 'playwright not installed', timeout: 20000 }, async () => {
  const server = await startServer();
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', err => pageErrors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/index.html`;

    // List.
    await page.goto(`${base}#/pathways`);
    await page.waitForFunction(() => globalThis.Store?.result && document.querySelectorAll('.v-pathways .pw-table tbody tr').length > 0, null, { timeout: 10000 });
    await page.waitForFunction(() => !globalThis.Store.busy);
    const rowCount = await page.$$eval('.v-pathways .pw-table tbody tr', rows => rows.length);
    assert.equal(rowCount, PATHWAYS.length, 'one row per pathway');
    const statuses = await page.$$eval('.v-pathways .pw-status', tags => tags.map(t => t.dataset.status));
    assert.ok(statuses.includes('built'), 'the default run builds at least one pathway');
    // Filters: search narrows, origin filter narrows, built-only shows built rows.
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
    await page.waitForFunction(() => document.querySelectorAll('.v-pathways .pw-chart svg.chart-svg path.chart-line').length >= 2, null, { timeout: 8000 });
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
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `no horizontal page scroll at 380 px (overflow ${overflow}px)`);
    if (SHOTS) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SHOTS, 'view-pathways-detail-390.png'), fullPage: true });
    }

    // Unknown id renders a friendly empty state.
    await page.goto(`${base}#/pathways/nope`);
    await page.waitForSelector('.v-pathways .empty');

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors.filter(text => !/net::ERR_FAILED|Failed to load resource/.test(text)), []);
  } finally {
    await browser.close();
    server.close();
  }
});
