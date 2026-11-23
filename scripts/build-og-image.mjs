// Renders og-image.png, the 1200×630 link-preview image (index.html og:image / twitter:image), from
// the live Abundance view: header, title and the world-tonnage card at today's defaults.
// Needs Playwright with Chromium (the CI workflows install it). Re-run after the headline numbers
// or the landing page change:  node scripts/build-og-image.mjs
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'og-image.png');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(ROOT, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'light' });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort()); // offline, like the tests
  await page.goto(`http://127.0.0.1:${server.address().port}/#/abundance`);
  await page.waitForSelector('.ab-bars .ab-track span');
  // A preview, not a working page: drop the per-visit status and the header buttons.
  await page.addStyleTag({ content: '#simStatus, #pinBtn, #copyLink, #themeToggle { visibility: hidden !important; }' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
} finally {
  await browser.close();
  server.close();
}
