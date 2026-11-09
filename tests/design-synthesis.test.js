const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../engine/designs/synthesis.js');
const E = require('../engine/designs/electrolyzer.js');
const C = require('../engine/company.js');
const Bom = require('../data/bom.js');
const { PATHWAYS } = require('../data/pathways.js');
const { MARKETS } = require('../data/markets.js');
const { SITES } = require('../data/sites.js');

const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const input = config => ({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config });
const rank = config => C.rankOpportunities(input(config), { sizeMultiple: 100 });
const lcop = (rows, id) => rows.find(r => r.pathwayId === id).lcopUsdPerKg;

// Frontier scenario: 10× cheaper PV, idiot-index squeeze to 1.5× materials, lean electrolyzer.
const ABSOLUTE = ['pv', 'battery', 'thermalStore', 'h2Storage'];
const floors = Object.fromEntries(Object.keys(Bom.CLASSES).map(cls => [cls, ABSOLUTE.includes(cls)
  ? { materialsUsdPerUnit: Bom.materialsUsdPerUnit(cls) } : { floorFraction: Bom.floorFraction(cls) }]));
const frontier = units => ({
  pv: { capexUsdPerKWp: C.DEFAULTS.pv.capexUsdPerKWp / 10, floorUsdPerKWp: C.DEFAULTS.pv.floorUsdPerKWp / 10 },
  idiotIndex: { target: 1.5, floors },
  designs: { units: { ...E.simulatorOverride(E.PRESETS.lean.params), ...units } },
});

test('module follows the design contract', () => {
  assert.equal(D.id, 'synthesis');
  assert.deepEqual(D.units, ['methanol', 'sabatier', 'mto']);
  for (const unit of D.units) assert.ok(D.RECIPE[unit].usdPerKgDay > 0 && D.RECIPE[unit].kWhPerKg > 0 && D.RECIPE[unit].pathwayId);
  assert.ok(D.PRESETS.today && D.PRESETS.lean);
  for (const c of D.CONTROLS) assert.ok(c.key in D.DEFAULTS, c.key);
  const d = D.design();
  for (const k of ['installedUsdPerKgDay', 'materialsUsdPerKgDay', 'idiotIndex', 'kWhPerKg']) assert.ok(Number.isFinite(d[k]) && d[k] > 0, k);
  assert.equal(typeof d.flexible, 'boolean');
  assert.ok(d.parts.length > 5 && d.kpis.length >= 3 && d.kpis.length <= 6);
  // Parts add up to the installed cost; materials to the idiot-index floor.
  close(d.parts.reduce((s, p) => s + p.usd, 0), d.installedUsdPerKgDay, 1e-9);
  close(d.parts.reduce((s, p) => s + p.usdMaterials, 0), d.materialsUsdPerKgDay, 1e-9);
  const o = D.simulatorOverride(D.PRESETS.lean.params);
  assert.deepEqual(Object.keys(o).sort(), [...D.units].sort());
  for (const u of D.units) {
    assert.ok(o[u].capexFactor > 0 && o[u].energyFactor > 0 && o[u].flexible === true);
    // Raw materials are a floor below the installed cost.
    assert.ok(o[u].materialsFactor > 0 && o[u].materialsFactor < o[u].capexFactor);
  }
  assert.equal(D.simulatorOverride(D.PRESETS.today.params).methanol.flexible, false);
});

test('physics: pressure raises equilibrium conversion and cuts recycle; heat favours reactants', () => {
  const lo = D.methanolEquilibrium(250, 50);
  const hi = D.methanolEquilibrium(250, 80);
  assert.ok(hi.methanolYield > lo.methanolYield, 'Le Chatelier: 4 mol → 2 mol');
  assert.ok(D.methanolEquilibrium(280, 70).methanolYield < D.methanolEquilibrium(230, 70).methanolYield, 'exothermic');
  // Graaf constants: K3 = K1·K2 at 250 °C ≈ 1.9e-5 bar⁻²; equilibrium yield ~15–30% at 50–80 bar.
  close(lo.K3, 10 ** (5139 / 523.15 - 12.621) * 10 ** (-2073 / 523.15 + 2.029), 1e-12);
  assert.ok(lo.methanolYield > 0.12 && hi.methanolYield < 0.35, `${lo.methanolYield} ${hi.methanolYield}`);
  const lean = { ...D.PRESETS.lean.params, reactor: 'methanol' };
  const curve = D.sweep(lean, 'pressureBar', [40, 60, 80]);
  assert.ok(curve[0].recycleRatio > curve[1].recycleRatio && curve[1].recycleRatio > curve[2].recycleRatio);
  assert.ok(curve[0].passYield < curve[2].passYield);
  // Recycle compressor energy falls with pressure; feed compression rises.
  const kWh = P => D.design({ ...lean, pressureBar: P }).kWhParts;
  assert.ok(kWh(40).recycle > kWh(80).recycle && kWh(40).h2Compression < kWh(80).h2Compression);
  // Sabatier: 5 → 3 moles, strongly exothermic.
  const gas = { co2: 1, h2: 4 };
  assert.ok(D.sabatierEquilibrium(gas, 350, 20).conversion > D.sabatierEquilibrium(gas, 350, 2).conversion);
  assert.ok(D.sabatierK(300) > D.sabatierK(500));
  // A pressurized H₂ supply removes most of the feed compression.
  assert.ok(D.design({ ...lean, h2SupplyBar: 30 }).kWhPerKg < D.design(lean).kWhPerKg - 0.2);
});

test('Sabatier tubes are sized by heat removal, and Ru runs cooler than Ni', () => {
  const d = D.design({ ...D.PRESETS.lean.params, reactor: 'sabatier' });
  assert.ok(d.model.reactor.heatLimited, 'the exotherm (~165 kJ/mol) sets the tube area, not the catalyst volume');
  assert.ok(d.model.reactor.areaM2 >= d.model.reactor.areaReqM2 * 0.999);
  assert.ok(d.model.conversion > 0.99);
  const ni = D.design({ ...D.PRESETS.lean.params, reactor: 'sabatier', sabatier: { catalyst: 'ni', pressureBar: 5, stageOutletC: [280, 240] } });
  assert.ok(ni.model.conversion < d.model.conversion, 'Ni is too slow at 240–280 °C');
});

test('presets: today lands near the recipe, lean is cheaper per kg/day and never below its materials', () => {
  for (const unit of D.units) {
    const today = D.design({ ...D.PRESETS.today.params, reactor: unit });
    const lean = D.design({ ...D.PRESETS.lean.params, reactor: unit });
    // MTO today sits ~2× above its recipe (the recipe looks low for a 100 t/day MTO + cold section).
    const band = unit === 'mto' ? [0.5, 2.5] : [0.6, 1.5];
    assert.ok(today.vsRecipe.capexFactor > band[0] && today.vsRecipe.capexFactor < band[1], `${unit} today ×${today.vsRecipe.capexFactor}`);
    assert.equal(today.flexible, false);
    assert.equal(lean.flexible, true);
    assert.ok(lean.installedUsdPerKgDay < today.installedUsdPerKgDay / 2.5, `${unit} lean ${lean.installedUsdPerKgDay} vs ${today.installedUsdPerKgDay}`);
    assert.ok(lean.idiotIndex > 1 && lean.idiotIndex < today.idiotIndex);
    // Sun-following: hot standby is covered by a small share of the day's reaction heat.
    assert.ok(lean.standby.shareOfExotherm < 0.1, `${unit} standby ${lean.standby.shareOfExotherm}`);
    assert.ok(lean.turndown.lostShare < 0.01);
  }
  // Installed $ per kg/day falls with scale.
  const at = S => D.design({ ...D.PRESETS.lean.params, reactor: 'methanol', scaleKgPerDay: S }).installedUsdPerKgDay;
  assert.ok(at(500) > at(5000) && at(5000) > at(228000));
});

test('override lowers methanol/Sabatier/MTO costs in rankOpportunities and leaves other pathways alone', () => {
  const lean = D.simulatorOverride(D.PRESETS.lean.params);
  const units = { methanol: lean.methanol, sabatier: lean.sabatier, mto: lean.mto };
  const base = rank({});
  const designed = rank({ designs: { units } });
  for (const id of ['methanol', 'sabatier', 'coastal', 'green-mto', 'mto']) {
    assert.ok(lcop(designed, id) < lcop(base, id), `${id}: ${lcop(designed, id)} vs ${lcop(base, id)}`);
  }
  for (const id of ['green-hydrogen', 'abundance-salt']) close(lcop(designed, id), lcop(base, id), 1e-9);
});

test('lean sun-following beats today baseload, and flexibility removes batteries and the H₂ buffer', () => {
  const today = D.simulatorOverride(D.PRESETS.today.params);
  const lean = D.simulatorOverride(D.PRESETS.lean.params);
  const leanBase = Object.fromEntries(Object.entries(lean).map(([u, o]) => [u, { ...o, flexible: false }]));
  for (const [name, mk] of [['today PV', units => ({ designs: { units } })], ['frontier', frontier]]) {
    const t = rank(mk(today));
    const lb = rank(mk(leanBase));
    const lf = rank(mk(lean));
    for (const id of ['green-mto', 'mto']) assert.ok(lcop(lf, id) < lcop(t, id), `${name} ${id}`);
    // Sabatier: cheaper at today's PV. At the frontier both designs are squeezed to their own materials
    // × 1.5, so the tiny unit is a tie; the lean one only pays H₂ compression from 1 bar (≤ 1%).
    if (name === 'today PV') assert.ok(lcop(lf, 'sabatier') < lcop(t, 'sabatier'));
    else assert.ok(lcop(lf, 'sabatier') < lcop(t, 'sabatier') * 1.01);
    // Ethylene from sunlight: making methanol + MTO sun-following is worth more than its 3× nameplate.
    assert.ok(lcop(lf, 'green-mto') < lcop(lb, 'green-mto'));
    const flex = lf.find(r => r.pathwayId === 'green-mto').utilization;
    const firm = lb.find(r => r.pathwayId === 'green-mto').utilization;
    assert.equal(flex.batteryKWh, 0);
    assert.equal(flex.bufferUsd, 0);
    assert.ok(firm.batteryKWh > 0 && firm.buffers.some(b => b.substance === 'H2'));
    assert.ok(flex.flexNameplateFactor > 2.5 && flex.flexNameplateFactor < 4.5);
  }
});
