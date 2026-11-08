const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

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

test('sites and markets views render lists, details, maps and charts offline', { skip: !playwright && 'playwright not installed', timeout: 20000 }, async () => {
  const server = await startServer();
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', err => pageErrors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    // Hermetic: no third-party requests (Leaflet from unpkg); the map must fall back to SVG.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    const base = `http://127.0.0.1:${server.address().port}/index.html`;
    const ready = () => page.waitForFunction(() => globalThis.Store?.result && !globalThis.Store.busy, null, { timeout: 15000 });

    // Sites list.
    await page.goto(`${base}#/sites`);
    await ready();
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
    await ready();
    await page.waitForFunction(() => document.querySelectorAll('#marketsTable tbody tr').length >= 30);
    const first = await page.$eval('#marketsTable tbody tr', tr => tr.className);
    assert.match(first, /is-supplied/, 'supplied markets lead');

    // Market detail: sources and a chart.
    await page.goto(`${base}#/markets/pv-module`);
    await page.waitForFunction(() => document.querySelectorAll('.v-markets svg.chart-svg path.chart-line').length >= 2, null, { timeout: 15000 });
    const sources = await page.$$eval('.v-markets .sources a[href^="http"]', a => a.length);
    assert.ok(sources >= 1, `source links: ${sources}`);
    assert.ok(await page.$('#marketPathways a[href*="#/pathways/silicon"]'), 'pv-module made by the silicon pathway');

    // Phone width: no horizontal page scroll.
    await page.setViewportSize({ width: 380, height: 800 });
    await page.waitForTimeout(200);
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
