const assert = require('node:assert/strict');
const test = require('node:test');
const { VIEW_TEST, withApp } = require('./helpers.js');

// Every view, plain and with a pinned comparison: no stray "null"/"undefined"/"NaN" text, which is
// what a null passed to replaceChildren/append (instead of being filtered out) renders as.
test('no view renders stray null, undefined or NaN text', { ...VIEW_TEST, timeout: 240000 }, () => withApp(async ({ page, base, errors }) => {
  const views = ['abundance', 'company', 'energy', 'designs', 'pathways', 'pathways/green-hydrogen', 'plant', 'plant/silicon', 'sites', 'sites/namibia-walvis-bay', 'markets', 'markets/hydrogen'];
  for (const query of ['', '?kwh=0.01&vs=']) {
    for (const view of views) {
      await page.goto(`${base}#/${view}${query}`);
      await page.waitForFunction(() => globalThis.Store && !Store.busy && document.getElementById('view').childElementCount > 0, null, { timeout: 60000 });
      const stray = await page.evaluate(() => {
        const out = [];
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (/(^|[^\w-])(null|undefined|NaN)([^\w-]|$)/.test(n.textContent)) out.push(`${n.parentElement.className}: ${n.textContent.trim().slice(0, 60)}`);
        }
        return out;
      });
      assert.deepEqual(stray, [], `#/${view}${query}`);
    }
  }
  assert.deepEqual(errors, []);
}));

test('the header fits without sideways scrolling from phone to desktop widths', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(base + '#/abundance');
  await page.waitForSelector('.kpi-value');
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  // Whether one row fits depends on the fonts (CI's fallback font is wider than a desktop's), so
  // check with the page's own fonts and with text forced much wider.
  for (const wide of [false, true]) {
    if (wide) await page.addStyleTag({ content: 'html { letter-spacing: 0.08em; }' });
    for (const width of [360, 390, 768, 1019, 1021, 1100, 1200, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await frame();
      const over = await page.$eval('.app-header', h => h.scrollWidth - h.clientWidth);
      assert.equal(over, 0, `header overflows by ${over}px at ${width}px${wide ? ' with wide text' : ''}`);
    }
  }
  // Wide screens keep the one-row header.
  assert.ok(!(await page.evaluate(() => document.documentElement.classList.contains('header-wrap'))), 'one row at 1440px');
  assert.deepEqual(errors, []);
}));

test('the page carries link-preview tags with an image that ships with the site', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const tag of ['og:title', 'og:description', 'og:image', 'og:url']) assert.match(html, new RegExp(`property="${tag}" content="[^"]+"`), tag);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  const png = fs.readFileSync(path.join(__dirname, '..', 'og-image.png'));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build.mjs'), 'utf8'), /'og-image\.png'/, 'the build ships it');
});
