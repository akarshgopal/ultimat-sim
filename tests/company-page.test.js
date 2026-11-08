const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'company.html'), 'utf8');

function scriptSrcs(source) {
  return [...source.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
}

test('company.html loads engine and data before the app script, all from local files', () => {
  const srcs = scriptSrcs(html);
  const app = srcs.indexOf('js/company-app.js');
  assert.ok(app >= 0, 'company-app.js is loaded');
  assert.equal(app, srcs.length - 1, 'company-app.js is the last script');
  for (const dep of [
    'engine/company.js', 'engine/map-site.js', 'data/pathways.js', 'data/markets.js',
    'data/site-presets.js', 'data/land-prices.js', 'data/land-admin.js', 'data/pvgis-sites.js',
  ]) {
    const at = srcs.indexOf(dep);
    assert.ok(at >= 0 && at < app, `${dep} loads before js/company-app.js`);
    assert.ok(fs.existsSync(path.join(ROOT, dep)), `${dep} exists`);
  }
  for (const src of srcs) assert.doesNotMatch(src, /^(?:https?:)?\/\//, `no remote script blocks the page: ${src}`);
  assert.match(html, /href="index\.html"[^>]*>Plant detail</);
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(index, /href="company\.html"[^>]*>Company</);
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build.mjs'), 'utf8');
  assert.match(build, /'company\.html'/);
});

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

test('company page simulates, draws charts, ranks pathways and re-runs on input', { skip: !playwright && 'playwright not installed', timeout: 30000 }, async () => {
  const server = await startServer();
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', err => pageErrors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    // Hermetic: no third-party requests (Leaflet/tiles); the page must fall back offline.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    const { port } = server.address();
    await page.goto(`http://127.0.0.1:${port}/company.html`);
    await page.waitForFunction(() => Number(document.body.dataset.runCount) >= 1, null, { timeout: 15000 });

    const kpis = await page.$$eval('#kpiGrid .kpi-value', nodes => nodes.map(n => n.textContent.trim()));
    assert.ok(kpis.length >= 9, `KPI tiles: ${kpis.length}`);
    for (const value of kpis) assert.ok(value && value !== '—', `KPI non-empty: "${value}"`);

    const charts = await page.$$eval('.chart-card svg.chart-svg', svgs => svgs.filter(s => s.querySelector('path')).length);
    assert.ok(charts >= 4, `charts with paths: ${charts}`);

    const rankRows = await page.$$eval('#rankingTable tbody tr', rows => rows.length);
    assert.ok(rankRows >= 10, `ranking rows: ${rankRows}`);
    assert.ok(await page.$eval('#plantsMap', node => node.querySelectorAll('circle').length > 0 || node.classList.contains('is-leaflet')));

    // Sorting flips order.
    const firstBefore = await page.$eval('#rankingTable tbody tr th', n => n.textContent);
    await page.click('#rankingTable thead th:nth-child(1) .sort-btn');
    const firstAfter = await page.$eval('#rankingTable tbody tr th', n => n.textContent);
    assert.notEqual(firstAfter, firstBefore);

    // Changing max market share re-runs and moves the headline numbers.
    const before = await page.evaluate(() => globalThis.__companyLast.summary);
    await page.fill('#f-share', '2');
    await page.waitForFunction(() => Number(document.body.dataset.runCount) >= 2, null, { timeout: 10000 });
    const after = await page.evaluate(() => globalThis.__companyLast.summary);
    assert.notEqual(after.finalRevenueUsd, before.finalRevenueUsd);
    const kpiAfter = await page.$eval('#kpiGrid .kpi-value', n => n.textContent.trim());
    assert.notEqual(kpiAfter, kpis[0]);
    assert.match(await page.evaluate(() => location.hash), /share=2/);

    // Horizontal scroll check at phone width.
    await page.setViewportSize({ width: 380, height: 800 });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `no horizontal page scroll at 380 px (overflow ${overflow}px)`);

    assert.deepEqual(pageErrors, []);
    const localErrors = consoleErrors.filter(text => !/net::ERR_FAILED|Failed to load resource/.test(text));
    assert.deepEqual(localErrors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
