const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, elementAmounts, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const clay = require('../data/ionic-clay-longnan.js');
const { createReeCase } = require('../cases/ree');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function addElements(into, stream) {
  for (const [el, n] of Object.entries(elementAmounts(stream))) {
    into[el] = (into[el] || 0) + n;
  }
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

test('10 kg recovered REO consumes Longnan clay, 70 kg AMS, 88 kWh and closes Nd/Pr/Y/Al/N/S', () => {
  const recovered = 10;
  const clayKg = recovered / (clay.gradeKgReoPerKgClay * clay.recovery);
  const result = UNITS['iac-leach'].evaluate({
    inlets: {
      clay: clayInlet(clayKg),
      lixiviant: {
        kind: 'material',
        mol: { NH42SO4: 70 * 1000 / SUBSTANCES.NH42SO4.molarMassG },
        phase: 'solid',
        T_C: 25,
        P_bar: 1,
      },
      electricity: { kind: 'electricity', kWh: 88 },
    },
    requestedActivity: recovered,
    capacity: 100,
  });
  assert.ok(Math.abs(result.activity - recovered) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.consumed.clay) - clayKg) < 1e-6);
  assert.ok(Math.abs(streamMassKg(result.consumed.lixiviant) - 70) < 1e-9);
  assert.equal(result.consumed.electricity.kWh, 88);
  const ndprKg = streamMassKg(result.outlets.ndpr);
  const otherKg = streamMassKg(result.outlets.otherReo);
  assert.ok(Math.abs(ndprKg + otherKg - recovered) < 1e-9);
  assert.ok(Math.abs(ndprKg / recovered - clay.ndprPublishedPoints / clay.publishedSum) < 1e-9);
  assert.ok(Math.abs(otherKg / recovered - clay.otherPublishedPoints / clay.publishedSum) < 1e-9);
  assert.ok(Math.abs(result.outlets.residue.mol.Al2Si2O5OH4 - result.consumed.clay.mol.Al2Si2O5OH4) < 1e-12);
  assert.ok(Math.abs(streamMassKg(result.outlets.liquor) - 70) < 1e-9);
  assert.ok(Math.abs((result.outlets.liquor.mol.NH42SO4 || 0) - result.consumed.lixiviant.mol.NH42SO4) < 1e-12);
  assert.equal(result.outlets.wasteHeat, undefined);
  assert.equal(UNITS['iac-leach'].ports.wasteHeat, undefined);

  const inEl = {};
  addElements(inEl, result.consumed.clay);
  addElements(inEl, result.consumed.lixiviant);
  const outEl = {};
  addElements(outEl, result.outlets.ndpr);
  addElements(outEl, result.outlets.otherReo);
  addElements(outEl, result.outlets.residue);
  addElements(outEl, result.outlets.liquor);
  for (const el of ['Nd', 'Pr', 'Y', 'Al', 'N', 'S']) {
    const incoming = inEl[el] || 0;
    const outgoing = outEl[el] || 0;
    const denom = Math.max(Math.abs(incoming), 1e-12);
    assert.ok(Math.abs(incoming - outgoing) / denom < 1e-6, el);
  }
});

test('TEA NdPr and other-REO prices, pack, and demand', () => {
  assert.equal(tea.prices['ndpr-oxide'].value, 48.30);
  assert.equal(tea.prices['ndpr-oxide'].quality, 'screening');
  const otherValueSum = 2.10 * 1 + 1.00 * 1.71 + 3.20 * 2.82 + 0.30 * 27 + 2.69 * 30
    + 1.13 * 1010 + 7.48 * 239 + 1.60 * 70 + 4.26 * 46 + 0.60 * 0 + 3.34 * 15
    + 0.47 * 888 + 62.90 * 9;
  const unrounded = otherValueSum / 91.07 * 0.70;
  assert.ok(Math.abs(otherValueSum - 4372.174) < 1e-9);
  assert.ok(Math.abs(tea.prices['other-reo'].value - unrounded) < 0.02);
  assert.equal(tea.prices['other-reo'].value, 33.61);
  assert.equal(tea.prices['other-reo'].quality, 'screening');
  assert.equal(tea.packs['iac-leach'].capexIntensity, 18250);
  assert.equal(tea.packs['iac-leach'].fixedOmPercent, 4);
  assert.equal(tea.packs['iac-leach'].variableOm, 0.05);
  assert.equal(tea.packs['iac-leach'].assetLifeYears, 20);
  assert.equal(tea.packs['iac-leach'].quality, 'screening');
  assert.equal(tea.demand['ndpr-oxide'].value, 5e4);
  assert.equal(tea.demand['other-reo'].value, 2e5);
  assert.equal(tea.demandByRegion['asia-china']['ndpr-oxide'].value, 2e6);
  assert.equal(tea.demandByRegion['asia-china']['other-reo'].value, 1e7);
  assert.equal(tea.demandByRegion['asia-china']['ndpr-oxide'].inherit, undefined);
  const europe = tea.demandByRegion.europe;
  assert.equal(europe['ndpr-oxide'].inherit, 'me-levant');
  assert.equal(europe['other-reo'].inherit, 'me-levant');
  assert.equal(europe['ndpr-oxide'].value, 5e4);
  assert.equal(europe['other-reo'].value, 2e5);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('ndpr-oxide'));
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('other-reo'));
  assert.equal(tea.resolveDemandRegion('Goiás / Brazil'), 'default');
  assert.equal(tea.getCapexMultiplierForRegion('Goiás / Brazil'), 1);
  assert.equal(tea.demandByRegion.default['ndpr-oxide'].inherit, 'me-levant');
});

test('Minaçu ionic-clay case solves at 100 kg recovered REO/day without electricity purchase', () => {
  const definition = createReeCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes['iac-leach'].activity - 100) / 100 < 0.01);
  const limited = [
    ...(solved.nodes['iac-leach'].limitedBy || []),
    ...(solved.warnings || []),
  ].join(' ');
  assert.doesNotMatch(limited, /electricity/i);
  const ndprSink = definition.graph.nodes.find(node => node.id === 'ndpr');
  const otherSink = definition.graph.nodes.find(node => node.id === 'other-reo');
  const residueSink = definition.graph.nodes.find(node => node.id === 'residue');
  const liquorSink = definition.graph.nodes.find(node => node.id === 'liquor');
  assert.equal(ndprSink.economics.disposition, 'sale');
  assert.equal(ndprSink.economics.unitPrice, 48.30);
  assert.equal(otherSink.economics.disposition, 'sale');
  assert.equal(otherSink.economics.unitPrice, 33.61);
  assert.equal(residueSink.economics.disposition, 'vent');
  assert.equal(liquorSink.economics.disposition, 'vent');
  const power = definition.graph.nodes.find(node => node.id === 'power').economics;
  assert.ok((Number(power.installedCapex) || Number(power.capexIntensity)) > 0);
  assert.equal(power.unitCost, undefined);
  const claySource = definition.graph.nodes.find(node => node.id === 'clay');
  assert.notEqual(claySource.economics.unitCost, undefined);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash));
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
});

test('Overview option text contains Minaçu and NdPr; palette has REE with iac-leach; Crust unchanged', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Crust:\s*\[\s*'mg-si',\s*'polysilicon',\s*'bayer-alumina',\s*'aluminium-smelter',\s*'pv-module'\s*\]/);
  assert.match(source, /REE:\s*\[\s*'iac-leach',\s*'ree-chromatography',\s*'ree-sx'\s*\]/);
  assert.match(html, /id="loadReeIonic"/);
  assert.match(html, /Minaçu ionic clay → NdPr \+ mixed REO/);
  assert.match(html, /cases\/ree\.js/);
  assert.match(html, /data\/ionic-clay-longnan\.js/);
  assert.ok(html.indexOf('data/ionic-clay-longnan.js') < html.indexOf('js/flowsheet-app.js'));
  assert.ok(html.indexOf('cases/ree.js') < html.indexOf('js/flowsheet-app.js'));
  const pad = PROCESS_INTENSITIES['iac-leach'];
  assert.equal(pad.intensity, 20);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [10, 40]);
  assert.equal(pad.floorM2, 40);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
