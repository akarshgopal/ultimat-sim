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
