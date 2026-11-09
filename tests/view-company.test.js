const assert = require('node:assert/strict');
const test = require('node:test');
const { VIEW_TEST, withApp } = require('./helpers.js');

const runs = page => page.$eval('#view', node => Number(node.dataset.runs) || 0);
const headline = page => page.$eval('#view .kpis .kpi-value', node => node.textContent.trim());

test('company view: abundance KPIs, charts, build log, objective and share re-run', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(`${base}#/company`);
  await page.waitForFunction(() => Number(document.getElementById('view').dataset.runs) >= 1);

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
    && document.getElementById('view').dataset.objective === 'profit', before);
  assert.match(await page.evaluate(() => location.hash), /objective=profit/);
  assert.equal(await page.$eval('#view [data-objective="profit"]', b => b.getAttribute('aria-pressed')), 'true');

  // Max market share changes the headline.
  const head = await headline(page);
  const n = await runs(page);
  await page.fill('#co-f-share', '1');
  await page.waitForFunction(k => Number(document.getElementById('view').dataset.runs) > k, n);
  assert.match(await page.evaluate(() => location.hash), /share=1(&|$)/);
  assert.notEqual(await headline(page), head, 'headline material changes with max market share');
  assert.ok(await page.$eval('#co-f-share', i => i.closest('.field').classList.contains('is-changed')), 'changed-from-default marker');

  assert.deepEqual(errors, []);
}));
