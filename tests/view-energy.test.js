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

test('energy view: break-even table, unlock curve, cost bars; presets drive the scenario', { skip: !playwright && 'playwright not installed', timeout: 30000 }, async () => {
  const server = await startServer();
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', err => errors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    const { port } = server.address();
    await page.goto(`http://127.0.0.1:${port}/index.html#/energy`);
    await page.waitForSelector('#view .en-bar-row', { timeout: 15000 });

    const rows = await page.$$eval('#view .data-table tbody tr', trs => trs.length);
    assert.ok(rows >= 20, `break-even rows: ${rows}`);
    const curve = await page.$$eval('#view svg.chart-svg path.chart-line', ps => ps.length);
    assert.ok(curve >= 4, `unlock curves: ${curve}`);
    const cells = await page.$$eval('#view .data-table td', tds => tds.map(t => t.textContent.trim()));
    assert.ok(cells.some(t => t === 'never'), 'some pathways are blocked by more than energy');
    assert.ok(cells.some(t => t.startsWith('≤ ')), 'some pathways have an energy break-even');

    const feasible = () => page.$eval('#view .kpi-value', n => n.textContent.trim());
    const before = await feasible();
    await page.click('#view button[data-kwh]:last-child');
    await page.click('#view button[data-equip="0.1"]');
    await page.waitForFunction(() => /kwh=0\.0046/.test(location.hash) && /equip=0\.1/.test(location.hash));
    await page.waitForFunction(b => document.querySelector('#view .kpi-value')?.textContent.trim() !== b, before, { timeout: 15000 });
    const after = await feasible();
    assert.ok(Number(after.split(' ')[0]) > Number(before.split(' ')[0]), `feasible pathways ${before} → ${after}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
