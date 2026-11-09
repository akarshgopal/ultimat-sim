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
test('abundance view is the landing page: tonnage bars, blockers, materials; frontier button drives the scenario', { skip: !playwright && 'playwright not installed', timeout: 30000 }, async () => {
  const server = await startServer();
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', err => errors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForSelector('#view .ab-track span', { timeout: 15000 });
    assert.match(await page.evaluate(() => location.hash), /^#\/abundance/);

    assert.equal(await page.$$eval('#view .ab-bar-row', rows => rows.length), 3, 'today, scenario, frontier');
    const rows = await page.$$eval('#view .data-table tbody tr', trs => trs.length);
    assert.ok(rows >= 25, `material rows: ${rows}`);
    assert.ok(await page.$$eval('#view .ab-blocker-list li', li => li.length) > 0, 'blocked tonnage is attributed to cost items');

    const share = () => page.$eval('#view .kpi-value', n => parseFloat(n.textContent));
    const before = await share();
    await page.click('text=Set the scenario to the frontier');
    await page.waitForFunction(() => /ii=1\.5/.test(location.hash) && /el=/.test(location.hash));
    await page.waitForFunction(b => parseFloat(document.querySelector('#view .kpi-value')?.textContent) !== b, before, { timeout: 15000 });
    assert.ok(await share() > before, 'the frontier makes more of the world’s tonnage feasible');
    assert.ok(await page.$eval('text=Set the scenario to the frontier', b => b.disabled));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
