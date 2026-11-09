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

test('designs view: electrolyzer KPIs, cost curve, BOM, next targets; push design into the simulation', { skip: !playwright && 'playwright not installed', timeout: 30000 }, async () => {
  const server = await startServer();
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', err => errors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    const { port } = server.address();
    await page.goto(`http://127.0.0.1:${port}/index.html#/designs`);
    await page.waitForSelector('#view svg.chart-svg path.chart-line', { timeout: 15000 });

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

    // The today preset is several times dearer per kW than the lean target.
    const lean = await page.$eval('#view .kpi-value', n => Number(n.textContent.replace(/[^0-9.]/g, '')));
    await page.click('[data-preset="today"]');
    const today = await page.$eval('#view .kpi-value', n => Number(n.textContent.replace(/[^0-9.]/g, '')));
    assert.ok(today > 3 * lean, `today $${today}/kW vs lean $${lean}/kW`);

    await page.click('[data-preset="lean"]');
    await page.click('text=Use this design in the company simulation');
    await page.waitForFunction(() => /ds=/.test(location.hash) && /electrolyzer/.test(decodeURIComponent(location.hash)));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
