const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../engine/designs/synthesis.js');
const E = require('../engine/designs/electrolyzer.js');
const Bom = require('../data/bom.js');
const { close, rank, lcop, cheapPv } = require('./helpers.js');

// Frontier scenario: 10× cheaper PV, idiot-index squeeze to 1.5× materials, lean electrolyzer.
const ABSOLUTE = ['pv', 'battery', 'thermalStore', 'h2Storage'];
const floors = Object.fromEntries(Object.keys(Bom.CLASSES).map(cls => [cls, ABSOLUTE.includes(cls)
  ? { materialsUsdPerUnit: Bom.materialsUsdPerUnit(cls) } : { floorFraction: Bom.floorFraction(cls) }]));
const frontier = units => ({
  pv: cheapPv(),
  idiotIndex: { target: 1.5, floors },
  designs: { units: { ...E.simulatorOverride(E.PRESETS.lean.params), ...units } },
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
    assert.ok(lean.installedUsdPerKgDay < today.installedUsdPerKgDay / 2, `${unit} lean ${lean.installedUsdPerKgDay} vs ${today.installedUsdPerKgDay}`);
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
  for (const id of ['sabatier', 'coastal', 'green-mto', 'mto']) {
    assert.ok(lcop(designed, id) < lcop(base, id), `${id}: ${lcop(designed, id)} vs ${lcop(base, id)}`);
  }
  // e-methanol: the reactor is a small share at 1 t/day; the lean loop compresses H₂ from 1 bar,
  // so it is a wash (within 1%) until the electrolyzer is lean too.
  assert.ok(lcop(designed, 'methanol') < lcop(base, 'methanol') * 1.01);
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
    // Sabatier: at 1 t/day the reactor is a small share of the plant, so the designs tie; the lean one
    // pays H₂ compression from 1 bar (≤ 1%).
    assert.ok(lcop(lf, 'sabatier') < lcop(t, 'sabatier') * 1.01);
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
