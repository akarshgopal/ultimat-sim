// Table-driven physics check for the catalog converter units: each reaction
// closes its element (and mass) balance, draws its declared SEC, and rejects
// feeds carrying substances the reaction does not use.
const assert = require('node:assert/strict');
const test = require('node:test');

const { SUBSTANCES, elementAmounts, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const clay = require('../data/ionic-clay-longnan.js');

function material(substance, mol, phase = 'solid') {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

function clayInlet(kg) {
  const reoKg = kg * clay.gradeKgReoPerKgClay;
  const mol = {};
  for (const oxide of clay.listedOxides) {
    mol[oxide] = reoKg * clay.renormalizedFractions[oxide] * 1000 / SUBSTANCES[oxide].molarMassG;
  }
  mol.Al2Si2O5OH4 = (kg - reoKg) * 1000 / SUBSTANCES.Al2Si2O5OH4.molarMassG;
  return { kind: 'material', mol, phase: 'solid', T_C: 25, P_bar: 1 };
}

function concentrate(kg) {
  return { kind: 'material', mol: clay.concentrateMolForKg(kg), phase: 'solid', T_C: 25, P_bar: 1 };
}

const POWER = { kind: 'electricity', kWh: 1e6 };

// unit, product outlet port, kWh per kg of activity, generous inlets, and the
// inlet port to contaminate for the extra-substance rejection check.
// Units whose feeds or products are lumped pseudo-substances (bauxite, BOM
// glass/EVA, clinker) cannot close elements; for those `recipe` pins the
// kg per kg of product on every listed port instead.
// `massLoss` is the declared fraction of feed mass that leaves no outlet
// (polysilicon's Siemens kerf/recycle loss); elements then close on outlets
// plus that loss.
const CASES = [
  { unit: 'mg-si', product: 'silicon', sec: 12, inlets: { quartz: material('SiO2', 1e4), carbon: material('C', 2e4) } },
  { unit: 'polysilicon', product: 'polysilicon', sec: 65, inlets: { silicon: material('Si', 1e4) } },
  {
    unit: 'bayer-alumina', product: 'alumina', sec: 3.5, reject: 'bauxite',
    recipe: { bauxite: 2, caustic: 0.08, alumina: 1, redMud: 1 },
    inlets: { bauxite: material('Bauxite', 1e4), caustic: material('NaOH', 1e4, 'liquid') },
  },
  { unit: 'aluminium-smelter', product: 'aluminium', sec: 14, inlets: { alumina: material('Al2O3', 1e4), carbon: material('C', 1e4) } },
  {
    unit: 'pv-module', product: 'module', sec: 0.05, reject: 'silver',
    recipe: { polysilicon: 0.0273, silver: 0.0003, glass: 0.6745, eva: 0.0669, aluminium: 0.1273, module: 1 },
    inlets: {
      polysilicon: material('Si', 1e4), silver: material('Ag', 1e4), glass: material('FloatGlass', 1e4),
      eva: material('EVA', 1e4), aluminium: material('Al', 1e4),
    },
  },
  { unit: 'hydrogen-dri', product: 'steel', sec: 0.7, inlets: { ironOre: material('Fe2O3', 2e3), hydrogen: material('H2', 5e3, 'gas') } },
  {
    // Gangue passes through to its own outlet, so mixed concentrate is accepted.
    unit: 'pellet-plant', product: 'pellets', sec: 0.14, reject: false,
    inlets: { concentrate: { kind: 'material', mol: { Fe2O3: 2e3, SiO2: 1e3 }, phase: 'solid', T_C: 25, P_bar: 1 } },
  },
  { unit: 'titanium-kroll', product: 'titanium', sec: 8, inlets: { titaniumTetrachloride: material('TiCl4', 2e3, 'liquid'), magnesium: material('Mg', 5e3) } },
  {
    unit: 'float-glass', product: 'glass', sec: 2.5,
    recipe: { sand: 0.65, sodaAsh: 0.2, limestone: 0.21, glass: 1, carbonDioxide: 0.06 },
    inlets: { sand: material('SiO2', 2e4), sodaAsh: material('Na2CO3', 5e3), limestone: material('CaCO3', 5e3) },
  },
  {
    unit: 'cement', product: 'cement', sec: 1.05,
    recipe: { limestone: 1.183, clay: 0.337, cement: 1, carbonDioxide: 0.52 },
    inlets: { limestone: material('CaCO3', 2e4), clay: material('SiO2', 1e4) },
  },
  { unit: 'copper-ew', product: 'cathode', sec: 2.2, reject: 'pls', inlets: { pls: material('Cu', 2e4, 'liquid') } },
  {
    unit: 'iac-leach', product: 'ndpr', sec: 8.8, reject: false,
    inlets: { clay: clayInlet(10 / (clay.gradeKgReoPerKgClay * clay.recovery) * 2), lixiviant: material('NH42SO4', 1e3) },
  },
  { unit: 'ree-chromatography', product: 'ndpr', sec: 5, reject: 'concentrate', inlets: { concentrate: concentrate(20) } },
  { unit: 'ree-sx', product: 'ndpr', sec: 5.3, reject: 'concentrate', inlets: { concentrate: concentrate(20) } },
  { unit: 'ammonia', product: 'ammonia', sec: 0.6, inlets: { nitrogen: material('N2', 1e4, 'gas'), hydrogen: material('H2', 1e4, 'gas') } },
  { unit: 'urea', product: 'urea', sec: 0.8, inlets: { ammonia: material('NH3', 3e3, 'liquid'), carbonDioxide: material('CO2', 2e3, 'gas') } },
  { unit: 'mto', product: 'ethylene', sec: 4, inlets: { methanol: material('CH3OH', 3e3, 'liquid') } },
  { unit: 'ft-liquids', product: 'diesel', sec: 0.22, inlets: { hydrogen: material('H2', 5e4, 'gas'), co2: material('CO2', 2e4, 'gas') } },
  {
    unit: 'bioforge', product: 'gluconic', sec: 0.05,
    inlets: { dextrose: material('C6H12O6', 1e3), oxygen: material('O2', 1e3, 'gas'), water: material('H2O', 1e3, 'liquid') },
  },
];

const ACTIVITY = 10;

function evaluate(spec, inlets) {
  return UNITS[spec.unit].evaluate({
    inlets: { ...inlets, electricity: POWER },
    requestedActivity: ACTIVITY,
    capacity: ACTIVITY * 10,
  });
}

function sumMaterial(streams) {
  const elements = {};
  let kg = 0;
  for (const stream of Object.values(streams || {})) {
    if (stream?.kind !== 'material') continue;
    kg += streamMassKg(stream);
    for (const [el, n] of Object.entries(elementAmounts(stream))) elements[el] = (elements[el] || 0) + n;
  }
  return { elements, kg };
}

for (const spec of CASES) {
  test(`${spec.unit}: balance closes, declared SEC, rejects foreign feed`, () => {
    const result = evaluate(spec, spec.inlets);
    assert.ok(Math.abs(result.activity - ACTIVITY) < 1e-9, `activity ${result.activity}`);
    assert.ok(result.outlets[spec.product]?.kind === 'material', `product port ${spec.product}`);
    assert.ok(Math.abs(result.consumed.electricity.kWh - spec.sec * ACTIVITY) < 1e-9,
      `kWh ${result.consumed.electricity.kWh} vs ${spec.sec} kWh/kg`);

    if (spec.recipe) {
      for (const [port, kgPerKg] of Object.entries(spec.recipe)) {
        const stream = result.consumed[port] || result.outlets[port];
        assert.ok(Math.abs(streamMassKg(stream) - kgPerKg * ACTIVITY) < 1e-6, `${spec.unit} ${port} ${streamMassKg(stream)}`);
      }
    } else {
      const keep = 1 - (spec.massLoss || 0);
      const inSum = sumMaterial(result.consumed);
      const outSum = sumMaterial(result.outlets);
      assert.ok(inSum.kg > 0);
      assert.ok(Math.abs(inSum.kg * keep - outSum.kg) / inSum.kg < 1e-4, `mass in ${inSum.kg} out ${outSum.kg}`);
      const elements = new Set([...Object.keys(inSum.elements), ...Object.keys(outSum.elements)]);
      for (const el of elements) {
        const incoming = (inSum.elements[el] || 0) * keep;
        const outgoing = outSum.elements[el] || 0;
        assert.ok(Math.abs(incoming - outgoing) / Math.max(incoming, 1e-12) < 1e-6, `${spec.unit} ${el} in ${incoming} out ${outgoing}`);
      }
    }

    if (spec.reject === false) return; // ore leach passes gangue through to residue
    const port = spec.reject || Object.keys(spec.inlets)[0];
    const dirty = { ...spec.inlets[port], mol: { ...spec.inlets[port].mol, NaCl: 1 } };
    assert.throws(() => evaluate(spec, { ...spec.inlets, [port]: dirty }), /must be pure|extra substances/);
  });
}

test('a short co-feed limits activity and is named in limitedBy', () => {
  const result = UNITS.bioforge.evaluate({
    inlets: {
      dextrose: material('C6H12O6', 10),
      oxygen: material('O2', 10, 'gas'),
      water: material('H2O', 1, 'liquid'),
      electricity: POWER,
    },
    requestedActivity: 1,
    capacity: 10,
  });
  assert.ok(Math.abs(result.activity - SUBSTANCES.C6H12O7.molarMassG / 1000) < 1e-9);
  assert.ok(result.limitedBy.includes('water'));
});
