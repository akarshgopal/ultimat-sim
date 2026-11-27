const assert = require('node:assert/strict');
const test = require('node:test');
const { PATHWAYS } = require('../data/pathways.js');
const { SITES } = require('../data/sites.js');
const { PLACES } = require('../data/site-climate.js');
const FeedConditions = require('../engine/feed-conditions.js');
const { withFeedConditions } = require('../cases/_shared.js');
const Company = require('../engine/company.js');
const PlantDesign = require('../engine/plant-design.js');
const { companyData } = require('./helpers.js');

const sourceEdges = id => {
  const p = PATHWAYS.find(x => x.id === id);
  const src = new Map(p.flowsheet.nodes.filter(n => n.kind === 'source').map(n => [n.id, n]));
  return p.flowsheet.edges.filter(e => e.kind === 'material' && src.has(e.from)).map(e => ({ ...e, node: src.get(e.from) }));
};
const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b}`);

test('site climate covers every company site; the sea is only a site’s own water', () => {
  for (const s of SITES) assert.ok(PLACES[`${s.latitude.toFixed(3)},${s.longitude.toFixed(3)}`], s.id);
  for (const p of Object.values(PLACES)) {
    assert.ok(p.airC > -10 && p.airC < 40, `${p.name} air ${p.airC}`);
    if (p.sea) assert.ok(p.sea.distanceKm <= 50 && p.sea.meanC > -2 && p.sea.meanC < 35, `${p.name} sea`);
  }
  // The Dead Sea shore is not the Mediterranean; a salar at 3,700 m is not at 1 atm.
  assert.equal(PLACES['31.160,35.430'].sea, null);
  const maricunga = FeedConditions.siteClimate({ latitude: -26.92, longitude: -69.05 }, PLACES);
  assert.ok(maricunga.pBar < 0.66 && maricunga.pBar > 0.6, `Maricunga ${maricunga.pBar} bar`);
});

test('every recipe’s feeds arrive at site or delivery conditions', () => {
  for (const p of PATHWAYS) {
    for (const e of sourceEdges(p.id)) {
      if (!e.phase) continue; // consumables carry no state
      assert.ok(Number.isFinite(e.T_C) && Number.isFinite(e.P_bar), `${p.id} ${e.from}`);
    }
  }
  // Walvis Bay: seawater at the OISST mean, air at the ERA5 mean.
  const walvis = PLACES['-22.957,14.505'];
  const nh3 = sourceEdges('green-ammonia');
  near(nh3.find(e => e.from === 'seawater').T_C, walvis.sea.meanC, 0.05, 'seawater');
  near(nh3.find(e => e.from === 'air').T_C, walvis.airC, 0.05, 'air');
  // Bought fluids at delivery conditions.
  const urea = sourceEdges('urea');
  const ammonia = urea.find(e => /ammonia/.test(e.from));
  assert.deepEqual([ammonia.T_C, ammonia.phase], [-33, 'liquid']);
  const co2 = urea.find(e => /co2/.test(e.from));
  assert.deepEqual([co2.T_C, co2.P_bar, co2.phase], [20, 15, 'gas']);
  assert.equal(sourceEdges('h2-dri').find(e => /hydrogen/.test(e.from)).P_bar, 30);
  // The Dead Sea hub sits 394 m below sea level.
  assert.ok(sourceEdges('abundance-lithium').find(e => e.from === 'air').P_bar > 1.05);
});

test('feed conditions keep the case and its site resource identical, and change no balance', () => {
  const { createGreenAmmoniaCase } = require('../cases/green-ammonia.js');
  const def = withFeedConditions(createGreenAmmoniaCase());
  for (const n of def.graph.nodes.filter(x => x.siteResource && x.params?.stream?.kind === 'material')) {
    const r = def.site.resources[n.siteResource].stream;
    assert.deepEqual([r.T_C, r.P_bar, r.phase], [n.params.stream.T_C, n.params.stream.P_bar, n.params.stream.phase], n.id);
  }
  const { solveOperation } = require('../engine/solve.js');
  const a = solveOperation(createGreenAmmoniaCase());
  const b = solveOperation(def);
  const { streamMassKg } = require('../engine/model.js');
  const mass = s => s.streams.reduce((t, x) => t + (x.stream?.kind === 'material' ? streamMassKg(x.stream) : 0), 0);
  const act = s => Object.values(s.nodes).reduce((t, n) => t + (Number(n.activity) || 0), 0);
  assert.ok(mass(a) > 0 && act(a) > 0, 'non-trivial solve');
  assert.ok(Math.abs(mass(a) - mass(b)) < 1e-9 * mass(a), 'same stream masses');
  assert.ok(Math.abs(act(a) - act(b)) < 1e-9 * act(a), 'same unit activities');
});

test('a recipe redesigned at another site takes that site’s feed conditions', () => {
  const input = companyData();
  const size = 100 * PATHWAYS.find(p => p.id === 'green-ammonia').refOutputKgPerDay;
  const at = site => PlantDesign.forPlant(Company, input, 'green-ammonia', site, size).pkg;
  const home = at('namibia-walvis-bay');
  const gulf = at('qatar-ras-laffan');
  const sea = pkg => pkg.streams.find(s => s.from === 'seawater');
  near(sea(gulf).T_C, PLACES['25.888,51.557'].sea.meanC, 1e-9, 'Ras Laffan seawater');
  assert.ok(sea(gulf).T_C > sea(home).T_C + 8, 'the Gulf is warmer than the Benguela');
  // RO permeate follows its feed; the electrolyzer's H₂ does not (its own outlet condition).
  const ro = gulf.equipment.find(e => e.unit === 'swro').nodeId;
  for (const s of gulf.streams.filter(x => x.from === ro)) assert.equal(s.T_C, sea(gulf).T_C);
  assert.equal(gulf.streams.find(s => s.composition[0]?.[0] === 'H2').T_C, 40);
  assert.match(gulf.basis.climate.source, /Ras Laffan/);
});

test('seasonal design: hottest-month coolers, coldest-month RO, freeze protection, hottest-month gas', () => {
  const input = companyData();
  const at = (id, site) => PlantDesign.forPlant(Company, input, id, site, 100 * PATHWAYS.find(p => p.id === id).refOutputKgPerDay).pkg;
  const gulf = PLACES['25.888,51.557'];
  // Methanol at Ras Laffan: 40 °C condensers cannot be reached with ~34 °C summer seawater + 10 K approach.
  const meoh = at('methanol', 'qatar-ras-laffan').seasonal;
  near(meoh.sea.summerC, Math.max(...gulf.sea.monthlyC), 1e-9, 'Gulf summer sea');
  assert.equal(meoh.medium.kind, 'seawater');
  assert.ok(meoh.cooling.length && meoh.cooling.every(c => c.status === 'summer'), JSON.stringify(meoh.cooling));
  // …while at Walvis Bay (cold Benguela) a 40 °C product cooler is fine all year.
  const urea = at('urea', 'namibia-walvis-bay').seasonal;
  assert.ok(urea.cooling.some(c => c.toC === 40 && c.status === 'ok'));
  // An ammonia product condensed to −33 °C is refrigerated anywhere.
  assert.ok(at('green-ammonia', 'namibia-walvis-bay').seasonal.cooling.some(c => c.toC === -33 && c.status === 'refrigeration'));
  // RO membrane area follows the coldest feed against the 25 °C rating the recipe is priced at: the cold
  // Benguela (13 °C winter) needs more margin than the Gulf (≈20 °C winter).
  const roGulf = at('green-ammonia', 'qatar-ras-laffan').seasonal.ro[0];
  const roWalvis = at('green-ammonia', 'namibia-walvis-bay').seasonal.ro[0];
  assert.ok(roWalvis.extraArea > roGulf.extraArea && roGulf.extraArea > 0);
  // Freeze protection only where the coldest month is near freezing, and only on water-bearing liquids.
  const cold = at('ft-liquids', 'us-great-salt-lake');
  assert.ok(cold.seasonal.air.winterC < 0 && cold.seasonal.freeze.length > 0);
  for (const f of cold.seasonal.freeze) {
    const st = cold.streams.find(s => s.no === f.stream);
    assert.ok(st.heatTrace && st.phase === 'liquid' && f.waterShare >= 0.3);
  }
  assert.equal(at('ft-liquids', 'chile-mejillones').seasonal.freeze.length, 0);
  assert.equal(cold.seasonal.medium.kind, 'air', 'no sea at Great Salt Lake: air coolers');
  // Air machines are sized for the hottest month: more volume than at the annual mean.
  const k = at('green-ammonia', 'qatar-ras-laffan').seasonal.gas.find(g => g.margin > 0);
  assert.ok(k && k.inletT_C > k.meanT_C && k.margin > 0.02);
});

test('seasonal fixes are priced into the simulator, itemized exactly, and only where needed', () => {
  const input = companyData();
  const off = { ...input, config: { seasonal: { enabled: false } } };
  const size = id => 100 * PATHWAYS.find(p => p.id === id).refOutputKgPerDay;
  const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
  const sum = (xs, f) => xs.reduce((t, x) => t + f(x), 0);
  for (const [id, site] of [['methanol', 'qatar-ras-laffan'], ['ft-liquids', 'us-great-salt-lake'], ['green-ammonia', 'namibia-walvis-bay']]) {
    const ev = Company.evaluateAtYear(input, id, site, size(id), 0);
    const base = Company.evaluateAtYear(off, id, site, size(id), 0);
    const s = ev.seasonal;
    assert.ok(s.chillerUsd + s.roUsd + s.tracingUsd > 0, `${id}@${site} has something to price`);
    assert.ok(ev.capex.total > base.capex.total && ev.lcopUsdPerKg > base.lcopUsdPerKg, `${id}@${site} costs more`);
    // Per-unit capex (seasonal keys included) still sums to the plant's equipment classes.
    const own = sum(Object.values(ev.unitCapexUsd), x => x);
    const cls = sum(Object.entries(ev.capex.byTech).filter(([c]) => c !== 'storage'), ([, v]) => v);
    assert.ok(rel(own, cls) < 1e-9, `${id}@${site} units ${own} vs classes ${cls}`);
    // The plant design itemizes it exactly, and reports the same delta.
    const { pkg } = PlantDesign.forPlant(Company, input, id, site, size(id));
    assert.ok(rel(sum(pkg.tea.capexItems, i => i.usd), ev.capex.total) < 1e-9, `${id}@${site} capex items`);
    assert.ok(!pkg.tea.capexItems.some(i => /Unallocated/.test(i.label)));
    assert.ok(rel(sum(pkg.tea.capexItems.filter(i => i.group === 'seasonal'), i => i.usd), sum(Object.entries(ev.unitCapexUsd).filter(([k]) => k.startsWith('seasonal:')), ([, v]) => v)) < 1e-9);
    assert.ok(rel(sum(pkg.tea.opexLines, l => l.usd), ev.opex.total) < 1e-9, `${id}@${site} opex`);
    assert.ok(rel(sum(pkg.tea.lcop, l => l.usdPerKg), ev.lcopUsdPerKg) < 1e-9, `${id}@${site} cost per kg`);
    assert.ok(Math.abs(pkg.seasonalCost.lcopDeltaUsdPerKg - (ev.lcopUsdPerKg - base.lcopUsdPerKg)) < 1e-12);
    // The coolers priced are exactly the coolers the drawing flags for summer trim.
    const drawn = pkg.seasonal.cooling.filter(c => PlantDesign.PRICED_COOLING.has(c.status)).map(c => pkg.exchangers.find(x => x.tag === c.tag))
      .map(x => { const st = pkg.streams.find(y => y.no === x.stream); return `${st.from}>${st.to}`; }).sort();
    const climate = FeedConditions.siteClimate(SITES.find(x => x.id === site), PLACES);
    const priced = PlantDesign.seasonalNeeds(PATHWAYS.find(p => p.id === id), climate).coolers.map(c => `${c.from}>${c.to}`).sort();
    assert.deepEqual(priced, drawn, `${id}@${site} coolers`);
  }
  // Methanol's summer trim exists at Ras Laffan but not on the cold Chilean coast.
  const mej = Company.evaluateAtYear(input, 'methanol', 'chile-mejillones', size('methanol'), 0).seasonal;
  assert.equal(mej.chillerUsd, 0);
  assert.equal(mej.tracingUsd, 0);
});

test('review fixes: all-year chilled water is priced; chillers follow their host; seasonal power is energy', () => {
  const input = companyData();
  const size = id => 100 * PATHWAYS.find(p => p.id === id).refOutputKgPerDay;
  // Green MTO's ethylene product cooler (→ 20 °C) needs chilled water all year at every coastal site:
  // priced, so a hotter site is never cheaper for the same cooling.
  for (const site of ['namibia-walvis-bay', 'qatar-ras-laffan']) {
    const { pkg } = PlantDesign.forPlant(Company, input, 'green-mto', site, size('green-mto'));
    const c = pkg.seasonal.cooling.find(x => x.toC === 20);
    assert.equal(c.status, 'chilled', site);
    assert.ok(pkg.seasonalCost.chillerUsd > 0, `${site} prices it`);
  }
  // NH₃ condensed to −33 °C stays the recipe's own refrigeration: not priced again.
  const nh3 = PlantDesign.forPlant(Company, input, 'green-ammonia', 'namibia-walvis-bay', size('green-ammonia')).pkg;
  assert.ok(nh3.seasonal.cooling.some(c => c.toC === -33 && c.status === 'refrigeration'));
  // With the synthesis design (sun-following loops), a chiller on a sun-following unit is oversized with it.
  const syn = require('../engine/designs/synthesis.js');
  const units = syn.simulatorOverride({ ...(Object.values(syn.PRESETS).at(-1).params || {}) });
  const ev = Company.evaluateAtYear({ ...input, config: { designs: { units } } }, 'green-mto', 'qatar-ras-laffan', size('green-mto'), 0);
  assert.equal(ev.utilization.strategy, 'sun-following');
  const chillers = Object.entries(ev.unitCapexUsd).filter(([k]) => k.startsWith('seasonal:chiller:'));
  assert.ok(chillers.length > 0);
  const off = Company.evaluateAtYear({ ...input, config: { designs: { units }, seasonal: { enabled: false } } }, 'green-mto', 'qatar-ras-laffan', size('green-mto'), 0);
  assert.ok(ev.seasonal.chillerUsd > 0 && Math.abs(ev.seasonal.chillerUsd - chillers.reduce((t, [, v]) => t + v, 0)) < 1e-6);
  // Installed chiller kW = the 24 h duty × the sun-following nameplate factor (all hosts are sun-following here).
  const climate = FeedConditions.siteClimate(SITES.find(x => x.id === 'qatar-ras-laffan'), PLACES);
  const kW24 = PlantDesign.seasonalNeeds(PATHWAYS.find(p => p.id === 'green-mto'), climate).chillerKWthPerKgDay * size('green-mto');
  assert.ok(Math.abs(ev.seasonal.chillerKWth / kW24 - ev.utilization.flexNameplateFactor) < 1e-9, `${ev.seasonal.chillerKWth} vs ${kW24} × ${ev.utilization.flexNameplateFactor}`);
  assert.ok(ev.capex.total > off.capex.total);
  // Seasonal electricity is reported as energy, and the cost breakdown still adds up.
  const m = Company.evaluateAtYear(input, 'methanol', 'qatar-ras-laffan', size('methanol'), 0);
  const mOff = Company.evaluateAtYear({ ...input, config: { seasonal: { enabled: false } } }, 'methanol', 'qatar-ras-laffan', size('methanol'), 0);
  assert.ok(m.costBreakdownUsdPerKg.energy > mOff.costBreakdownUsdPerKg.energy);
  assert.ok(Math.abs(m.costBreakdownUsdPerKg.other - mOff.costBreakdownUsdPerKg.other) < 1e-9, 'not in other O&M');
  const b = m.costBreakdownUsdPerKg;
  assert.ok(Math.abs(b.energy + b.equipment + b.feedstock + b.other - m.grossCostUsdPerKg) < 1e-9);
  assert.ok(m.electricityKWhPerYear > mOff.electricityKWhPerYear);
});
