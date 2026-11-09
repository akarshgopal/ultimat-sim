// Shared test helpers. Not a test file: `node --test` only runs *.test.js here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- numbers
// |a − b| ≤ rel · max(1, |b|): relative for large values, absolute below 1.
function close(actual, expected, rel = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= rel * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

// |a − b| ≤ rel · |b|: purely relative, for small physical constants and ratios.
function within(actual, expected, rel, label = '') {
  assert.ok(Math.abs(actual - expected) <= rel * Math.abs(expected), `${label} ${actual} not within ${rel * 100}% of ${expected}`);
}

// |a − b| < tol: absolute.
function near(actual, expected, tol = 1e-6, label = '') {
  assert.ok(Math.abs(actual - expected) < tol, `${label} expected ${expected}, got ${actual}`);
}

// Table-driven rows run in one test; a failure names its row.
function eachRow(rows, fn) {
  for (const row of rows) {
    try {
      fn(row);
    } catch (error) {
      error.message = `[${row.name}] ${error.message}`;
      throw error;
    }
  }
}

// ---------------------------------------------------------------- flowsheets
const clone = value => JSON.parse(JSON.stringify(value));

function kg(stream) {
  const { streamMassKg } = require('../engine/model');
  return stream ? streamMassKg(stream) : 0;
}

function assertClosed(solved, { elements = false } = {}) {
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
  assert.ok(Math.abs(solved.balances.electricityKWh) < 1e-8);
  assert.ok(Math.abs(solved.balances.heatKWh) < 1e-8);
  if (elements) {
    for (const [element, amount] of Object.entries(solved.balances.elements)) {
      assert.ok(Math.abs(amount) < 1e-8, `${element} balance should close`);
    }
  }
}

function waterStream(massKg) {
  return { kind: 'material', mol: { H2O: massKg * 1000 / 18.01528 }, phase: 'liquid', T_C: 25, P_bar: 1 };
}

// A liquid of `volumeM3` at `density` carrying the given solute kg; the rest is water.
function materialFromKg(soluteKg, volumeM3, density = 1025) {
  const { SUBSTANCES } = require('../engine/model');
  const totalSolute = Object.values(soluteKg).reduce((sum, value) => sum + value, 0);
  const components = { H2O: volumeM3 * density - totalSolute, ...soluteKg };
  return {
    kind: 'material',
    mol: Object.fromEntries(Object.entries(components).map(([substance, mass]) => [substance, mass * 1000 / SUBSTANCES[substance].molarMassG])),
    phase: 'liquid',
    T_C: 25,
    P_bar: 1,
  };
}

// Major ions in 100 m³ of seawater, kg.
const SEAWATER_100M3_KG = Object.freeze({
  'Na+': 1080, 'Cl-': 1940, 'Mg+2': 129, 'Ca+2': 41, 'K+': 39, 'SO4-2': 270, 'Br-': 6.7, 'Li+': 0.017, B: 0.45,
});

// ---------------------------------------------------------------- company simulator on repo data
function companyData() {
  return {
    pathways: require('../data/pathways.js').PATHWAYS,
    markets: require('../data/markets.js').MARKETS,
    sites: require('../data/sites.js').SITES,
  };
}

// Year-0 ranking of every pathway at the scoreboard size (100 × reference output).
function rank(config = {}, { pathways, sizeMultiple = 100 } = {}) {
  const C = require('../engine/company.js');
  const data = companyData();
  return C.rankOpportunities({ ...data, ...(pathways ? { pathways } : {}), config }, { sizeMultiple });
}

const lcop = (rows, id) => rows.find(r => r.pathwayId === id).lcopUsdPerKg;

// PV capex and its floor at a tenth of today's.
function cheapPv(divisor = 10) {
  const { pv } = require('../engine/company.js').DEFAULTS;
  return { capexUsdPerKWp: pv.capexUsdPerKWp / divisor, floorUsdPerKWp: pv.floorUsdPerKWp / divisor };
}

// ---------------------------------------------------------------- browser views
// Playwright is an optional dev dependency, loaded only by the view tests (it is slow to require).
let hasPlaywright = true;
try { require.resolve('playwright'); } catch { hasPlaywright = false; }

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

// Options for a view test: skipped without Playwright; generous timeout because the simulator runs
// in the page and a loaded machine can take several times longer than an idle one.
const VIEW_TEST = { skip: !hasPlaywright && 'playwright not installed', timeout: 90000 };

// Runs `fn({ page, base, errors })` against the app served from the repo, offline: third-party
// requests (Leaflet from unpkg) are aborted, so views must fall back. `errors` collects page errors
// and console errors other than those aborted requests.
async function withApp(fn, { viewport = { width: 1280, height: 900 } } = {}) {
  const server = await startServer();
  const browser = await require('playwright').chromium.launch();
  try {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', err => errors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error' && !/net::ERR_FAILED/.test(msg.text())) errors.push(msg.text()); });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await fn({ page, base: `http://127.0.0.1:${server.address().port}/index.html`, errors });
  } finally {
    await browser.close();
    server.close();
  }
}

// Waits for a simulation result with no run pending.
const simulationIdle = page => page.waitForFunction(() => globalThis.Store?.result && !globalThis.Store.busy);

// Horizontal page overflow at the current viewport, once charts have re-rendered for it.
async function pageOverflow(page) {
  const fits = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth;
  await page.waitForFunction(fits, null, { timeout: 5000 }).catch(() => {});
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

module.exports = {
  ROOT,
  close, within, near, eachRow,
  clone, kg, assertClosed, waterStream, materialFromKg, SEAWATER_100M3_KG,
  companyData, rank, lcop, cheapPv,
  VIEW_TEST, withApp, simulationIdle, pageOverflow,
};
