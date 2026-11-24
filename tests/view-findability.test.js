const assert = require('node:assert/strict');
const test = require('node:test');
const { VIEW_TEST, withApp, simulationIdle } = require('./helpers.js');

test('search finds materials by everyday words on Abundance, Markets and Pathways', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  const names = () => page.$$eval('#view .data-table tbody tr', rows => rows.map(r => r.cells[0].innerText.split('\n')[0]));
  await page.goto(base + '#/abundance');
  await page.waitForSelector('#view .data-table tbody tr');
  await page.fill('.table-search', 'fertilizer');
  await page.waitForFunction(() => document.querySelectorAll('#view .data-table tbody tr').length === 3);
  assert.deepEqual((await names()).sort(), ['Ammonia (NH₃)', 'Potash (muriate of potash, KCl)', 'Urea']);
  await page.fill('.table-search', 'steel');
  await page.waitForFunction(() => document.querySelectorAll('#view .data-table tbody tr').length === 1);
  assert.match((await names())[0], /DRI/);
  await page.fill('.table-search', 'no such thing');
  await page.waitForSelector('#view .empty');

  await page.goto(base + '#/markets');
  await simulationIdle(page);
  await page.fill('.table-search', 'rare earth');
  await page.waitForFunction(() => document.querySelectorAll('#view .data-table tbody tr').length >= 3);
  assert.ok((await names()).every(n => /oxide|REO|rare/i.test(n)));

  await page.goto(base + '#/pathways');
  await page.waitForSelector('#view input[type=search]');
  await page.fill('#view input[type=search]', 'fertilizer');
  await page.waitForFunction(() => document.querySelectorAll('#view .data-table tbody tr').length >= 3);
  assert.deepEqual(errors, []);
}));

test('a skip link takes keyboard users past the header without changing the route', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(base + '#/energy');
  await page.waitForSelector('#view .kpi-value');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'skipLink');
  assert.ok(await page.$eval('#skipLink', e => e.getBoundingClientRect().top >= 0), 'visible when focused');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'view');
  assert.match(await page.evaluate(() => location.hash), /^#\/energy/);
  assert.deepEqual(errors, []);
}));

test('with the service worker on, the app reloads and works offline after one visit', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  // The deployed build switches it on with a meta tag; here the same code path via the global.
  await page.addInitScript(() => { globalThis.FOUNDRY_OFFLINE = 'sw.js'; });
  await page.goto(base + '#/markets');
  await simulationIdle(page);
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active, null, { timeout: 20000 });
  await page.waitForFunction(async () => (await (await caches.open('foundry-offline-v1')).keys()).length > 20, null, { timeout: 20000 });
  await page.context().setOffline(true);
  try {
    await page.reload();
    await simulationIdle(page);
    assert.equal(await page.$$eval('#view .data-table tbody tr', r => r.length), 32);
  } finally {
    await page.context().setOffline(false);
  }
  assert.deepEqual(errors.filter(e => !/ERR_INTERNET_DISCONNECTED/.test(e)), []);
}));
