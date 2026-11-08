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

const runs = page => page.$eval('#view', node => Number(node.dataset.runs) || 0);
const headline = page => page.$eval('#view .kpis .kpi-value', node => node.textContent.trim());

test('company view: abundance KPIs, charts, build log, objective and share re-run', { skip: !playwright && 'playwright not installed', timeout: 20000 }, async () => {
  const server = await startServer();
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', err => errors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    const { port } = server.address();
    await page.goto(`http://127.0.0.1:${port}/index.html#/company`);
    await page.waitForFunction(() => Number(document.getElementById('view').dataset.runs) >= 1, null, { timeout: 10000 });

    const kpis = await page.$$eval('#view .kpi-value', nodes => nodes.map(n => n.textContent.trim()));
    assert.ok(kpis.length >= 6, `KPI tiles: ${kpis.length}`);
    for (const value of kpis) assert.ok(value && value !== '—', `KPI non-empty: "${value}"`);

    await page.waitForFunction(() => document.querySelectorAll('#view svg.chart-svg path').length > 0);
    const charts = await page.$$eval('#view svg.chart-svg', svgs => svgs.filter(s => s.querySelector('path')).length);
    assert.ok(charts >= 4, `charts with paths: ${charts}`);

    const links = await page.$$eval('#view .build-log tbody a', as => as.map(a => a.getAttribute('href')));
    assert.ok(links.some(h => h.startsWith('#/pathways/')), 'build log links to pathways');
    assert.ok(links.some(h => h.startsWith('#/sites/')), 'build log links to sites');

    // Objective → profit: re-runs and lands in the URL.
    const before = await runs(page);
    await page.click('#view [data-objective="profit"]');
    await page.waitForFunction(n => Number(document.getElementById('view').dataset.runs) > n
      && document.getElementById('view').dataset.objective === 'profit', before, { timeout: 8000 });
    assert.match(await page.evaluate(() => location.hash), /objective=profit/);
    assert.equal(await page.$eval('#view [data-objective="profit"]', b => b.getAttribute('aria-pressed')), 'true');

    // Max market share changes the headline.
    const head = await headline(page);
    const n = await runs(page);
    await page.fill('#co-f-share', '1');
    await page.waitForFunction(k => Number(document.getElementById('view').dataset.runs) > k, n, { timeout: 8000 });
    assert.match(await page.evaluate(() => location.hash), /share=1(&|$)/);
    assert.notEqual(await headline(page), head, 'headline material changes with max market share');
    assert.ok(await page.$eval('#co-f-share', i => i.closest('.field').classList.contains('is-changed')), 'changed-from-default marker');

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
