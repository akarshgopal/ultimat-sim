const assert = require('node:assert/strict');
const test = require('node:test');
const Company = require('../engine/company.js');
const PlantDesign = require('../engine/plant-design.js');
const { companyData, VIEW_TEST, withApp, pageOverflow } = require('./helpers.js');

const input = companyData();
const ranks = Company.rankOpportunities(input, { sizeMultiple: 100 });
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);

test('every recipe: the plant package itemizes the simulator’s own totals exactly', () => {
  for (const p of input.pathways) {
    const row = ranks.find(r => r.pathwayId === p.id);
    if (!row) continue;
    const { ev, pkg } = PlantDesign.forPlant(Company, input, p.id, row.siteId, row.sizeKgPerDay);
    const t = pkg.tea;
    assert.ok(rel(sum(t.capexItems, i => i.usd), ev.capex.total) < 1e-9, `${p.id} capex`);
    assert.ok(rel(sum(t.opexLines, i => i.usd), ev.opex.total) < 1e-9, `${p.id} opex`);
    assert.ok(rel(sum(t.revenueLines, i => i.usd), ev.revenue) < 1e-9, `${p.id} revenue`);
    assert.ok(rel(sum(t.lcop, i => i.usdPerKg), ev.lcopUsdPerKg) < 1e-9, `${p.id} cost per kg`);
    assert.ok(rel(t.npv, ev.npv) < 1e-9, `${p.id} NPV`);
    // Co-products are priced as the simulator prices them: no unexplained residue line.
    if (!ev.integration.length) assert.ok(!t.revenueLines.some(l => /Captive/.test(l.label)), `${p.id} co-product prices`);
    // Tags are unique; every stream end is a tag or a flowsheet node.
    const tags = [...pkg.equipment.map(e => e.tag), ...pkg.buffers.map(b => b.tag), ...pkg.captive.map(c => c.tag)];
    assert.equal(new Set(tags).size, tags.length, `${p.id} unique tags`);
    assert.equal(new Set(pkg.instruments.map(i => i.tag)).size, pkg.instruments.length, `${p.id} unique instrument tags`);
    assert.equal(pkg.equipment.length, p.flowsheet.nodes.filter(n => n.kind === 'converter').length, `${p.id} one item per unit`);
    // Sensitivity at the base reproduces the TEA.
    assert.ok(rel(t.sensitivity.base.npv, t.npv) < 1e-9 && rel(t.sensitivity.base.lcop, t.lcopUsdPerKg) < 1e-9, `${p.id} sensitivity base`);
    // The discounted cash flows sum to the NPV (fractional lives included).
    assert.ok(rel(PlantDesign.npvAt(pkg.basis.discountRate, t.cashflow.map(c => c.cash)), ev.npv) < 1e-9, `${p.id} flows match NPV`);
    assert.ok(rel(t.cashflow.at(-1).cumulativeDiscounted, ev.npv) < 1e-9, `${p.id} discounted curve ends at the NPV`);
    // Instrument tags: a loop's first instrument carries no suffix (JIC-1, not JIC-1A).
    assert.ok(pkg.instruments.some(i => i.tag === 'JIC-1'), `${p.id} PV controller tag`);
    for (const s of pkg.streams) assert.ok(s.design >= s.average * (1 - 1e-9) - 1e-12 || pkg.basis.outputFactor > 1, `${p.id} stream ${s.no} design ≥ average`);
  }
});

test('green ammonia: sun-following electrolyzer, H₂ buffer between it and the steady loop, IRR consistent with NPV', () => {
  const row = ranks.find(r => r.pathwayId === 'green-ammonia');
  const { ev, pkg } = PlantDesign.forPlant(Company, input, 'green-ammonia', row.siteId, row.sizeKgPerDay);
  const el = pkg.equipment.find(e => e.unit === 'electrolyzer');
  const hb = pkg.equipment.find(e => e.unit === 'ammonia');
  assert.equal(el.mode, 'sun-following');
  assert.equal(hb.mode, 'steady');
  assert.ok(el.tag.startsWith('EL-') && hb.tag.startsWith('R-'));
  const buf = pkg.buffers.find(b => b.substance === 'H2');
  assert.ok(buf && buf.capacityKg > 0, 'H₂ buffer');
  const up = pkg.streams.find(s => s.no === buf.inStream);
  const down = pkg.streams.find(s => s.no === buf.outStream);
  assert.equal(up.line.slice(0, 2), 'HY');
  assert.ok(up.design > down.design * 1.5, 'the buffer takes H₂ in at the sun-following rate and lets it out steadily');
  assert.ok(Math.abs(up.average - down.average) < 1e-9 * up.average, 'same average flow either side');
  assert.ok(pkg.instruments.some(i => i.equipment === buf.tag && i.letters === 'PSV'), 'gas buffer has relief');
  // IRR: NPV of the cash flows at the IRR is zero, and the sign agrees with NPV at the hurdle.
  const t = pkg.tea;
  if (t.irr != null) {
    assert.ok(Math.abs(PlantDesign.npvAt(t.irr, t.cashflow.map(c => c.cash))) < 1e-3 * ev.capex.total);
    assert.equal(t.irr >= pkg.basis.discountRate, t.npv >= -1e-6 * ev.capex.total);
  }
});

test('captive supplier: the bought feed becomes a tagged package on its flowsheet source', () => {
  const row = ranks.find(r => r.pathwayId === 'silicon');
  const { ev, pkg } = PlantDesign.forPlant(Company, input, 'silicon', row.siteId, row.sizeKgPerDay);
  assert.ok(ev.integration.length, 'the default year-0 silicon plant makes its glass');
  const c = pkg.captive[0];
  assert.equal(c.nodeId, 'glass');
  assert.ok(c.tag.startsWith('PK-') && c.capexUsd > 0);
  assert.ok(pkg.tea.capexItems.some(i => i.group === 'captive' && i.usd === c.capexUsd));
  assert.ok(!pkg.tea.capexItems.some(i => /Unallocated/.test(i.label)), 'captive capex separates cleanly');
});

test('a later cost year takes the company run’s cost factors, and every unit has typical conditions', () => {
  const result = Company.simulateCompany(input);
  const i = 10;
  const row = result.timeline[i];
  const opts = { costFactors: row.costFactors, rawFactors: row.rawFactors, storagePrices: row.storagePrices, pvUsdPerKWp: row.pvCapexUsdPerKWp };
  const r0 = ranks.find(r => r.pathwayId === 'green-ammonia');
  const now = PlantDesign.forPlant(Company, input, 'green-ammonia', r0.siteId, r0.sizeKgPerDay);
  const later = PlantDesign.forPlant(Company, input, 'green-ammonia', r0.siteId, r0.sizeKgPerDay, i, opts);
  const direct = Company.evaluateAtYear(input, 'green-ammonia', r0.siteId, r0.sizeKgPerDay, i, opts);
  assert.equal(later.pkg.basis.year, result.timeline[i].year);
  assert.ok(rel(later.pkg.tea.lcopUsdPerKg, direct.lcopUsdPerKg) < 1e-12, 'same number as the Pathways cost curve');
  assert.ok(later.pkg.tea.capexTotal < now.pkg.tea.capexTotal, 'learning and decline make the plant cheaper');
  assert.ok(rel(sum(later.pkg.tea.capexItems, x => x.usd), later.ev.capex.total) < 1e-9);
  for (const p of input.pathways) {
    for (const n of p.flowsheet.nodes.filter(n => n.kind === 'converter')) {
      const t = PlantDesign.typeOf(n.unit);
      assert.ok(t.T && t.P, `${p.id}/${n.unit} has typical operating conditions`);
    }
  }
});

test('implied machines: pressure step-ups get a compressor or pump in the receiving unit’s package', () => {
  const row = ranks.find(r => r.pathwayId === 'green-ammonia');
  const { pkg } = PlantDesign.forPlant(Company, input, 'green-ammonia', row.siteId, row.sizeKgPerDay);
  const hb = pkg.equipment.find(e => e.unit === 'ammonia');
  const ro = pkg.equipment.find(e => e.unit === 'swro');
  const k = pkg.machines.filter(m => m.host === hb.tag);
  assert.deepEqual(k.map(m => m.kind), ['compressor', 'compressor'], 'H₂ and N₂ syngas compressors');
  assert.ok(k.every(m => m.tag.startsWith('K-' + hb.tag.split('-')[1]) && m.toBar >= 150));
  assert.ok(pkg.machines.some(m => m.host === ro.tag && m.kind === 'pump' && m.toBar >= 55), 'RO high-pressure pump');
  for (const m of pkg.machines) assert.equal(pkg.streams.find(s => s.no === m.stream).machine, m.tag);
  assert.deepEqual(PlantDesign.pressureRange('150–250 bar'), { lo: 150, hi: 250 });
  assert.deepEqual(PlantDesign.pressureRange('atmospheric'), { lo: 1, hi: 1 });
});

test('a design that removes a feed drops it from the opex lines instead of offsetting it', () => {
  const row = ranks.find(r => r.pathwayId === 'silicon');
  const base = PlantDesign.forPlant(Company, input, 'silicon', row.siteId, row.sizeKgPerDay);
  assert.ok(base.pkg.tea.opexLines.some(l => /^quartz/.test(l.label)), 'quartz is bought');
  const designed = { ...input, config: { designs: { units: { 'mg-si': { feedFactors: { quartz: 0 } } } } } };
  const { ev, pkg } = PlantDesign.forPlant(Company, designed, 'silicon', row.siteId, row.sizeKgPerDay);
  assert.ok(ev.costParts.feedCost < base.ev.costParts.feedCost, 'the simulator drops the feed');
  assert.ok(!pkg.tea.opexLines.some(l => /^quartz/.test(l.label)), 'no quartz line');
  const rest = pkg.tea.opexLines.find(l => /Captive/.test(l.label));
  const baseRest = base.pkg.tea.opexLines.find(l => /Captive/.test(l.label));
  assert.ok(rel(rest?.usd ?? 0, baseRest?.usd ?? 0) < 1e-6, 'only the captive suppliers’ feeds are left unitemized');
  assert.ok(rel(sum(pkg.tea.opexLines, l => l.usd), ev.opex.total) < 1e-9);
});

test('per-unit capex is the simulator’s own, designed units included, and sums exactly', () => {
  // Every repository design on, at its last (leanest) preset.
  const units = {};
  for (const f of ['electrolyzer', 'haber-bosch', 'dri-shaft', 'pellet-plant', 'dac', 'synthesis', 'urea', 'smelter']) {
    const m = require(`../engine/designs/${f}.js`);
    Object.assign(units, m.simulatorOverride({ ...(Object.values(m.PRESETS).at(-1).params || {}) }));
  }
  const designed = { ...input, config: { designs: { units } } };
  const dRanks = Company.rankOpportunities(designed, { sizeMultiple: 100 });
  for (const p of input.pathways) {
    const row = dRanks.find(r => r.pathwayId === p.id);
    if (!row) continue;
    const { ev, pkg } = PlantDesign.forPlant(Company, designed, p.id, row.siteId, row.sizeKgPerDay);
    // Units + balance = this plant's equipment classes (captive suppliers' own capex taken out).
    let own = 0;
    for (const [cls, v] of Object.entries(ev.capex.byTech)) if (cls !== 'storage') own += v;
    for (const c of pkg.captive) for (const [cls, v] of Object.entries(Company.evaluateAtYear(designed, c.supplierId, row.siteId, c.kgPerDay, 0).capex.byTech)) if (cls !== 'storage') own -= v;
    assert.ok(rel(sum(Object.values(ev.unitCapexUsd), x => x), own) < 1e-9, `${p.id} units sum to the classes`);
    for (const e of pkg.equipment) assert.equal(e.capexUsd, ev.unitCapexUsd[e.nodeId] || 0, `${p.id} ${e.tag}`);
    assert.ok(!pkg.tea.capexItems.some(i => /Unallocated/.test(i.label)), `${p.id} nothing unallocated`);
    assert.ok(rel(sum(pkg.tea.capexItems, i => i.usd), ev.capex.total) < 1e-9, `${p.id} capex`);
  }
  // A designed electrolyzer is priced on its own: its share of the class differs from recipe × capexFactor.
  const row = dRanks.find(r => r.pathwayId === 'green-ammonia');
  const { pkg } = PlantDesign.forPlant(Company, designed, 'green-ammonia', row.siteId, row.sizeKgPerDay);
  assert.ok(pkg.equipment.find(e => e.unit === 'electrolyzer').capexUsd > 0);
});

test('stores carry a power rating; lines carry an indicative size, pressure and number', () => {
  const row = ranks.find(r => r.pathwayId === 'green-ammonia');
  const { ev, pkg } = PlantDesign.forPlant(Company, input, 'green-ammonia', row.siteId, row.sizeKgPerDay);
  const b = pkg.utilities.battery;
  assert.ok(b.kW > 0 && Math.abs(b.kW - ev.utilization.blocks.elec.loadKW) < 1e-6 * b.kW, 'battery power = the steady load it carries');
  assert.ok(Math.abs(b.hours - b.kWh / b.kW) < 1e-9 && b.hours > 4 && b.hours < 24);
  for (const st of pkg.streams.filter(x => x.kind === 'material' && (x.phase === 'gas' || x.phase === 'liquid'))) {
    assert.ok(st.pressureBar >= 1, `stream ${st.no} pressure`);
    assert.ok(st.openIntake || st.size, `stream ${st.no} sized`);
    if (st.size && /"$/.test(st.size)) assert.ok(st.lineNumber.startsWith(st.size + '-' + st.line.split('-')[0]));
  }
  // The H₂ after the 150-bar compressor runs at loop pressure in a far smaller pipe than the ~1 bar H₂ before it.
  const k = pkg.machines.find(m => m.host === pkg.equipment.find(e => e.unit === 'ammonia').tag && /H2/.test(m.service));
  const after = pkg.streams.find(x => x.no === k.stream);
  const before = pkg.streams.find(x => x.to === after.from && x.composition[0][0] === 'H2');
  assert.equal(after.pressureBar, 150);
  assert.ok(after.innerDiameterM < before.innerDiameterM / 3);
  // RO permeate and brine leave near ambient, not at the 55 bar feed pressure.
  const ro = pkg.equipment.find(e => e.unit === 'swro');
  assert.ok(pkg.streams.filter(x => x.from === ro.nodeId).every(x => x.pressureBar <= 1.5));
  // DAC air is an open air path, not a 14 m duct.
  const dr = ranks.find(r => r.pathwayId === 'dac-co2');
  const dac = PlantDesign.forPlant(Company, input, 'dac-co2', dr.siteId, dr.sizeKgPerDay).pkg;
  assert.ok(dac.streams.some(x => x.openIntake), 'open intake');
  assert.ok(!dac.streams.some(x => /duct/.test(x.size || '')), 'no absurd ducts');
});

test('real stream conditions drive the machines, exchangers and line sizes', () => {
  const at = id => { const r = ranks.find(x => x.pathwayId === id); return PlantDesign.forPlant(Company, input, id, r.siteId, r.sizeKgPerDay).pkg; };
  // Green ammonia: electrolyzer H₂ leaves at 30 bar and needs a 30 → 150 bar booster; both syngas
  // feeds are preheated to the loop; the product is condensed to −33 °C; air is cooled in the cold box.
  const nh3 = at('green-ammonia');
  const hb = nh3.equipment.find(e => e.unit === 'ammonia').tag;
  const h2k = nh3.machines.find(m => m.host === hb && /H2/.test(m.service));
  assert.deepEqual([h2k.fromBar, h2k.toBar], [30, 150]);
  assert.equal(nh3.exchangers.filter(x => x.host === hb && x.duty === 'heater').length, 2, 'H₂ and N₂ preheaters');
  const cond = nh3.exchangers.find(x => x.host === hb && x.side === 'product');
  assert.equal(cond.duty, 'condenser');
  assert.equal(cond.toC, -33);
  const asu = nh3.equipment.find(e => e.unit === 'asu').tag;
  assert.match(nh3.exchangers.find(x => x.host === asu).service, /cold box/);
  // Every stream carries the conditions it leaves its unit with.
  const product = nh3.streams.find(x => x.from === nh3.equipment.find(e => e.unit === 'ammonia').nodeId);
  assert.deepEqual([product.T_C, product.P_bar, product.phase], [-33, 1, 'liquid']);
  // Methanol: a 30 → 50 bar H₂ booster that a guess from typical pressures missed.
  const meoh = at('methanol');
  assert.ok(meoh.machines.some(m => /H2/.test(m.service) && m.fromBar === 30 && m.toBar === 50));
  // Cement: the kiln's hot gas is heat recovery, not a "product cooler"; at 350 °C it needs a bigger
  // line than the same flow at 25 °C would.
  const cem = at('cement');
  const gas = cem.streams.find(x => x.phase === 'gas');
  assert.equal(gas.T_C, 350);
  assert.equal(cem.exchangers.find(x => x.stream === gas.no).duty, 'recovery');
  const cold = PlantDesign.sizeLine({ ...gas, T_C: 25, sizingT_C: 25 });
  assert.ok(gas.innerDiameterM > cold.innerDiameterM * 1.4, 'hot gas is less dense');
  // In-line items are listed under their unit and never costed twice.
  for (const id of ['green-ammonia', 'methanol', 'urea']) {
    const pkg = at(id);
    const tags = new Set(pkg.tea.capexItems.map(i => i.tag));
    for (const x of [...pkg.machines, ...pkg.exchangers]) assert.ok(!tags.has(x.tag), `${id} ${x.tag} not in the capex list`);
  }
});

test('irr and the sensitivity levers behave', () => {
  assert.ok(Math.abs(PlantDesign.irr([-100, 110]) - 0.1) < 1e-9);
  assert.equal(PlantDesign.irr([-100, -5]), null);
  const parts = { capex: { equipment: 100, pv: 50, storage: 0, land: 1 }, fixedOm: 5, feed: 10, other: 2, productRevenue: 60, coproductRevenue: 0, kg: 100, rate: 0.08, life: 20, lead: 1 };
  const s = PlantDesign.sensitivity(parts);
  const price = s.rows.find(r => r.key === 'price');
  assert.ok(price.high.npv > s.base.npv && price.low.npv < s.base.npv);
  assert.equal(price.high.lcop, s.base.lcop, 'price does not move cost');
  assert.ok(!s.rows.some(r => r.key === 'storage'), 'a lever with nothing behind it is dropped');
});

// ---------------------------------------------------------------- browser
test('plant view: P&ID, tables and TEA; site and size selectors; link from pathways', VIEW_TEST, () => withApp(async ({ page, base, errors }) => {
  await page.goto(`${base}#/pathways/green-ammonia`);
  await page.click('.v-pathways a.pw-plant-link');
  await page.waitForFunction(() => location.hash.startsWith('#/plant/green-ammonia'));
  await page.waitForSelector('.v-plant svg.pid');
  const counts = await page.evaluate(() => ({
    units: document.querySelectorAll('.v-plant svg.pid .pid-item.is-equip').length,
    lines: document.querySelectorAll('.v-plant svg.pid .pid-line').length,
    bubbles: document.querySelectorAll('.v-plant svg.pid .pid-inst').length,
    tanks: document.querySelectorAll('.v-plant svg.pid .pid-item.is-tank').length,
  }));
  assert.equal(counts.units, 4);
  assert.ok(counts.lines >= 10 && counts.bubbles >= 15 && counts.tanks === 1, JSON.stringify(counts));
  assert.match(await page.textContent('.v-plant .kpis'), /NPV/);
  // Tables ↔ drawing: hovering an equipment row lights the unit; the inferred compressors are listed.
  await page.hover('.v-plant .pl-grid tbody [data-tag^="R-"]');
  assert.ok(await page.$('.v-plant svg.pid .pid-item.is-lit[data-tag^="R-"]'), 'hovered unit lit');
  assert.ok(await page.$('.v-plant .pl-grid tbody [data-tag^="K-"]'), 'compressors in the equipment list');
  assert.ok(await page.$('.v-plant svg.pid .pid-machine[data-tag^="K-"]'), 'compressors on the drawing');
  await page.click('.v-plant svg.pid .pid-stream-tag[data-stream="1"]');
  await page.waitForSelector('.v-plant .pl-grid tr.is-flash');
  assert.ok(await page.$('.v-plant .pl-waterfall .pl-wf-row'), 'cost waterfall');
  assert.ok(await page.$('.v-plant .pl-tornado .pl-tn-row:not(.is-head)'), 'tornado');
  await page.waitForSelector('.v-plant svg.chart-svg path.chart-line');

  // Change the size: the URL carries it and the plant is redesigned.
  const before = await page.textContent('.v-plant .kpi-value');
  await page.selectOption('.v-plant .pl-controls select[aria-label="Plant size"]', '1000');
  await page.waitForFunction(() => /\/plant\/green-ammonia\/[^/]+\/1000/.test(location.hash));
  await page.waitForFunction(b => document.querySelector('.v-plant .kpi-value')?.textContent !== b, before);
  // Change the site.
  const other = await page.$eval('.v-plant select[aria-label="Site"] option:nth-child(2)', o => o.value);
  await page.selectOption('.v-plant select[aria-label="Site"]', other);
  await page.waitForFunction(id => location.hash.includes('/' + id + '/'), other);
  await page.waitForSelector('.v-plant svg.pid');

  // A later cost year waits for the company run, then redesigns at that year's costs.
  const cost0 = await page.textContent('.v-plant .kpi:nth-child(3) .kpi-value');
  await page.waitForFunction(() => document.querySelectorAll('.v-plant select[aria-label="Cost year"] option').length > 10);
  await page.waitForFunction(() => /\$/.test(document.querySelector('.v-plant select[aria-label="Cost year"] option:last-child').textContent), null, { timeout: 90000 });
  const lastYear = await page.$eval('.v-plant select[aria-label="Cost year"] option:last-child', o => o.value);
  await page.selectOption('.v-plant select[aria-label="Cost year"]', lastYear);
  await page.waitForFunction(y => location.hash.endsWith('/' + y) || location.hash.includes('/' + y + '?'), lastYear);
  await page.waitForFunction(c => document.querySelector('.v-plant .kpi:nth-child(3) .kpi-value')?.textContent !== c, cost0, { timeout: 90000 });
  assert.match(await page.textContent('.v-plant .pl-intro'), new RegExp(lastYear + ' costs from the company run'));
  assert.ok(await page.$('.v-plant svg.pid .pid-cond'), 'typical conditions on the drawing');

  // '_' segments mean the default, and a fractional year is rounded rather than hanging.
  await page.goto(`${base}#/plant/_/_/_/2030.4`);
  await page.waitForSelector('.v-plant svg.pid');
  assert.match(await page.textContent('.v-plant h1'), /Green ammonia/);
  await page.waitForFunction(() => /2030 costs from the company run/.test(document.querySelector('.v-plant .pl-intro')?.textContent || ''), null, { timeout: 90000 });

  // Captive supplier package links to its own plant design.
  await page.goto(`${base}#/plant/silicon`);
  await page.waitForSelector('.v-plant svg.pid .pid-item.is-package');
  // Phone width: no sideways page scroll (the P&ID scrolls in its own box).
  await page.setViewportSize({ width: 390, height: 800 });
  assert.equal(await pageOverflow(page), 0);
  assert.deepEqual(errors, []);
}));
