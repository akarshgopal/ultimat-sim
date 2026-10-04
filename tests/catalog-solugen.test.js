const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, elementAmounts, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createBioforgeCase } = require('../cases/bioforge');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function addElements(into, stream) {
  for (const [el, n] of Object.entries(elementAmounts(stream))) {
    into[el] = (into[el] || 0) + n;
  }
}

function material(substance, mol, phase) {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

test('1 kg gluconic closes C/H/O, matches GOx mass ratios, 0.05 kWh, no wasteHeat', () => {
  const result = UNITS.bioforge.evaluate({
    inlets: {
      dextrose: material('C6H12O6', 10, 'solid'),
      oxygen: material('O2', 10, 'gas'),
      water: material('H2O', 10, 'liquid'),
      electricity: { kind: 'electricity', kWh: 1 },
    },
    requestedActivity: 1,
    capacity: 10,
  });
  assert.ok(Math.abs(result.activity - 1) < 1e-12);
  assert.ok(Math.abs(streamMassKg(result.outlets.gluconic) - 1) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.consumed.dextrose) - 180.156 / 196.1554) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.outlets.hydrogenPeroxide) - 34.01468 / 196.1554) < 1e-9);
  assert.equal(result.consumed.electricity.kWh, 0.05);
  assert.equal(result.outlets.wasteHeat, undefined);
  assert.equal(UNITS.bioforge.ports.wasteHeat, undefined);

  const inEl = {};
  addElements(inEl, result.consumed.dextrose);
  addElements(inEl, result.consumed.oxygen);
  addElements(inEl, result.consumed.water);
  const outEl = {};
  addElements(outEl, result.outlets.gluconic);
  addElements(outEl, result.outlets.hydrogenPeroxide);
  for (const el of ['C', 'H', 'O']) {
    const incoming = inEl[el] || 0;
    const outgoing = outEl[el] || 0;
    const denom = Math.max(Math.abs(incoming), 1e-12);
    assert.ok(Math.abs(incoming - outgoing) / denom < 1e-6, el);
  }
});

test('short water feed limits bioforge activity', () => {
  const result = UNITS.bioforge.evaluate({
    inlets: {
      dextrose: material('C6H12O6', 10, 'solid'),
      oxygen: material('O2', 10, 'gas'),
      water: material('H2O', 1, 'liquid'),
      electricity: { kind: 'electricity', kWh: 1 },
    },
    requestedActivity: 1,
    capacity: 10,
  });
  const productMolPerKg = 1000 / SUBSTANCES.C6H12O7.molarMassG;
  assert.ok(result.activity < 1);
  assert.ok(Math.abs(result.activity - 1 / productMolPerKg) < 1e-9);
  assert.ok(result.limitedBy.includes('water'));
});

test('TEA gluconic / H2O2 / dextrose / bioforge pack / Midwest alias', () => {
  assert.equal(tea.prices.gluconic.value, 0.515);
  assert.equal(tea.prices['hydrogen-peroxide'].value, 0.674);
  assert.equal(tea.costs.dextrose.value, 0.84);
  assert.equal(tea.packs.bioforge.capexIntensity, 438);
  assert.equal(tea.packs.bioforge.intensityUnit, '$/(kg gluconic/day)');
  assert.equal(tea.packs.bioforge.fixedOmPercent, 4);
  assert.equal(tea.packs.bioforge.variableOm, 0);
  assert.equal(tea.packs.bioforge.assetLifeYears, 20);
  assert.equal(tea.packs.bioforge.quality, 'screening');
  assert.equal(tea.packs.bioforge.scaleExponent, null);
  assert.equal(tea.getDemandForRegion('texas').gluconic.value, 7.5e7);
  assert.equal(tea.getDemandForRegion('texas').gluconic.inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('US Midwest').gluconic.value, 7.5e7);
  assert.equal(tea.getDemandForRegion('US Midwest').gluconic.inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('US Midwest')['hydrogen-peroxide'].value, 1e8);
  assert.equal(tea.getDemandForRegion('US Midwest')['hydrogen-peroxide'].inherit, 'me-levant');
  assert.equal(tea.resolveDemandRegion('US Midwest'), 'texas');
  assert.equal(tea.getCostForRegion('power', 'US Midwest').value, 0.06);
  assert.equal(tea.bindCost('power', { region: 'US Midwest' }).unitCost, 0.06);
  assert.equal(tea.getCapexMultiplierForRegion('US Midwest'), 1);
});

test('Marshall Bioforge case solves 1000 kg/day with finite cash−', () => {
  const definition = createBioforgeCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.bioforge.activity - 1000) < 1e-6);
  assert.ok(solved.balances.maxAbsResidual < 1e-6, JSON.stringify(solved.balances));
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash));
  assert.ok(cash.annualNetCash < 0);
  assert.ok(cash.annualRevenue > 0);
  const oxygen = definition.graph.nodes.find(node => node.id === 'oxygen');
  assert.equal(oxygen.economics.unitCost, undefined);
  const power = definition.graph.nodes.find(node => node.id === 'power');
  assert.equal(power.unit, 'electricity-source');
  assert.equal(power.economics.unitCost, 0.06);
});

test('No Maglut/ARC-1 unit; overview and palette expose Bioforge', () => {
  assert.equal(UNITS.maglut, undefined);
  assert.equal(UNITS['arc-1'], undefined);
  assert.equal(UNITS['ARC-1'], undefined);
  assert.ok(UNITS.bioforge);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /Innovative · bio/);
  assert.match(html, /id="loadBioforgeMarshall"/);
  assert.match(html, /cases\/bioforge\.js/);
  assert.match(source, /Bio:\s*\[\s*'bioforge'\s*\]/);
  const pad = PROCESS_INTENSITIES.bioforge;
  assert.equal(pad.intensity, 5.4);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [3, 12]);
  assert.equal(pad.floorM2, 40);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
