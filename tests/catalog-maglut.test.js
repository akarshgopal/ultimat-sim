const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { elementAmounts, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const clay = require('../data/ionic-clay-longnan.js');
const { createMaglutCase } = require('../cases/maglut');
const { createReeCase } = require('../cases/ree');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

const PROXY_SENTENCE = 'proxy band · not a Maglut ARC-1 quote · Maglut has not published kWh/kg or CAPEX';

function addElements(into, stream) {
  for (const [el, n] of Object.entries(elementAmounts(stream))) {
    into[el] = (into[el] || 0) + n;
  }
}

function concentrateInlet(kg) {
  return { kind: 'material', mol: clay.concentrateMolForKg(kg), phase: 'solid', T_C: 25, P_bar: 1 };
}

test('10 kg recovered listed REO splits Longnan oxides, 50 kWh, raffinate complement, closes Nd/Pr/Dy/Tb/Y/La', () => {
  const recovered = 10;
  const recovery = 0.914;
  const feedKg = recovered / recovery;
  const result = UNITS['ree-chromatography'].evaluate({
    inlets: {
      concentrate: concentrateInlet(feedKg),
      electricity: { kind: 'electricity', kWh: 50 },
    },
    requestedActivity: recovered,
    capacity: 10,
  });
  assert.ok(Math.abs(result.activity - recovered) < 1e-9);
  assert.equal(result.consumed.electricity.kWh, 50);
  assert.ok(Math.abs(streamMassKg(result.consumed.concentrate) - feedKg) < 1e-6);
  const ndprKg = streamMassKg(result.outlets.ndpr);
  const dytbKg = streamMassKg(result.outlets.dytb);
  const lightKg = streamMassKg(result.outlets.lightReo);
  const raffKg = streamMassKg(result.outlets.raffinate);
  assert.ok(Math.abs(ndprKg + dytbKg + lightKg - recovered) < 1e-9);
  assert.ok(Math.abs(ndprKg - (clay.publishedPoints.Nd2O3 + clay.publishedPoints.Pr6O11) / clay.publishedSum * recovered) < 1e-9);
  assert.ok(Math.abs(dytbKg - (clay.publishedPoints.Dy2O3 + clay.publishedPoints.Tb4O7) / clay.publishedSum * recovered) < 1e-9);
  const lightPoints = clay.publishedSum - 6.20 - 8.61;
  assert.ok(Math.abs(lightKg - lightPoints / clay.publishedSum * recovered) < 1e-9);
  assert.ok(Math.abs(raffKg - feedKg * (1 - recovery)) < 1e-6);
  assert.equal(result.outlets.wasteHeat, undefined);
  assert.equal(UNITS['ree-chromatography'].ports.wasteHeat, undefined);

  const inEl = {};
  addElements(inEl, result.consumed.concentrate);
  const outEl = {};
  addElements(outEl, result.outlets.ndpr);
  addElements(outEl, result.outlets.dytb);
  addElements(outEl, result.outlets.lightReo);
  addElements(outEl, result.outlets.raffinate);
  for (const el of ['Nd', 'Pr', 'Dy', 'Tb', 'Y', 'La']) {
    const incoming = inEl[el] || 0;
    const outgoing = outEl[el] || 0;
    const denom = Math.max(Math.abs(incoming), 1e-12);
    assert.ok(Math.abs(incoming - outgoing) / denom < 1e-6, el);
  }
});

test('TEA separated NdPr / DyTb / light REO / mixed concentrate / chromatography pack / demand', () => {
  assert.equal(tea.prices['ndpr-oxide-separated'].value, 69);
  assert.equal(tea.prices['ndpr-oxide-separated'].quality, 'screening');
  const dytbUnrounded = (1.13 * 1010 + 7.48 * 239) / 8.61;
  assert.ok(Math.abs(dytbUnrounded - 2929.02 / 8.61) < 1e-9);
  assert.ok(Math.abs(tea.prices['dytb-oxide'].value - dytbUnrounded) < 0.02);
  assert.equal(tea.prices['dytb-oxide'].value, 340.19);
  assert.equal(tea.prices['dytb-oxide'].quality, 'screening');
  const lightUnrounded = (4372.174 - 2929.02) / (91.07 - 8.61);
  assert.ok(Math.abs(lightUnrounded - 1443.154 / 82.46) < 1e-9);
  assert.ok(Math.abs(tea.prices['light-reo'].value - lightUnrounded) < 0.02);
  assert.equal(tea.prices['light-reo'].value, 17.50);
  assert.equal(tea.prices['light-reo'].quality, 'screening');
  const mixUnrounded = 0.70 * (6.20 * 69 + 4372.174) / 97.27;
  assert.ok(Math.abs(tea.costs['mixed-reo-concentrate'].value - mixUnrounded) < 0.02);
  assert.equal(tea.costs['mixed-reo-concentrate'].value, 34.54);
  assert.equal(tea.costs['mixed-reo-concentrate'].quality, 'screening');
  assert.equal(tea.packs['ree-chromatography'].capexIntensity, 27375);
  assert.equal(tea.packs['ree-chromatography'].fixedOmPercent, 4);
  assert.equal(tea.packs['ree-chromatography'].variableOm, 0.05);
  assert.equal(tea.packs['ree-chromatography'].assetLifeYears, 20);
  assert.equal(tea.packs['ree-chromatography'].quality, 'screening');
  assert.ok(tea.packs['ree-chromatography'].note.includes(PROXY_SENTENCE));
  assert.equal(tea.demand['ndpr-oxide-separated'].value, 5e4);
  assert.equal(tea.demand['dytb-oxide'].value, 2e4);
  assert.equal(tea.demand['light-reo'].value, 2e5);
  assert.equal(tea.demand['ndpr-oxide-separated'].quality, 'screening');
  assert.equal(tea.demandByRegion['asia-china']['ndpr-oxide-separated'].value, 5e4);
  assert.equal(tea.demandByRegion['asia-china']['dytb-oxide'].value, 2e4);
  assert.equal(tea.demandByRegion['asia-china']['light-reo'].value, 2e5);
  assert.equal(tea.demandByRegion['asia-china']['ndpr-oxide-separated'].inherit, 'me-levant');
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('ndpr-oxide-separated'));
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('dytb-oxide'));
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('light-reo'));
  assert.equal(tea.prices['ndpr-oxide'].value, 48.30);
  assert.equal(tea.getCapexMultiplierForRegion('US West / California'), 1);
});

test('Long Beach Maglut case solves at 10 kg recovered REO/day without electricity limit; Minaçu untouched', () => {
  const definition = createMaglutCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.chrom.activity - 10) / 10 < 0.01);
  const limited = [
    ...(solved.nodes.chrom.limitedBy || []),
    ...(solved.warnings || []),
  ].join(' ');
  assert.doesNotMatch(limited, /electricity/i);
  const ndprSink = definition.graph.nodes.find(node => node.id === 'ndpr');
  const dytbSink = definition.graph.nodes.find(node => node.id === 'dytb');
  const lightSink = definition.graph.nodes.find(node => node.id === 'light-reo');
  const raffinateSink = definition.graph.nodes.find(node => node.id === 'raffinate');
  assert.equal(ndprSink.economics.disposition, 'sale');
  assert.equal(ndprSink.economics.unitPrice, 69);
  assert.equal(dytbSink.economics.disposition, 'sale');
  assert.equal(dytbSink.economics.unitPrice, 340.19);
  assert.equal(lightSink.economics.disposition, 'sale');
  assert.equal(lightSink.economics.unitPrice, 17.50);
  assert.equal(raffinateSink.economics.disposition, 'vent');
  const power = definition.graph.nodes.find(node => node.id === 'power').economics;
  assert.ok((Number(power.installedCapex) || Number(power.capexIntensity)) > 0);
  assert.equal(power.unitCost, undefined);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash));
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));

  assert.equal(tea.prices['ndpr-oxide'].value, 48.30);
  const minacu = createReeCase();
  assert.ok(!minacu.graph.nodes.some(node => node.unit === 'ree-chromatography'));
});

test('Overview option, palette, proxy sentence, and chromatography footprint', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const teaSource = fs.readFileSync(path.join(__dirname, '..', 'data/tea-screening.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(source.includes(PROXY_SENTENCE));
  assert.ok(teaSource.includes(PROXY_SENTENCE));
  assert.match(source, /REE:\s*\[\s*'iac-leach',\s*'ree-chromatography',\s*'ree-sx'\s*\]/);
  assert.match(html, /id="loadMaglutLongBeach"/);
  assert.match(html, /Long Beach ARC-1 chromatography → NdPr \+ DyTb/);
  assert.match(html, /cases\/maglut\.js/);
  assert.ok(html.indexOf('cases/maglut.js') < html.indexOf('js/flowsheet-app.js'));
  const pad = PROCESS_INTENSITIES['ree-chromatography'];
  assert.equal(pad.intensity, 15);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [8, 30]);
  assert.equal(pad.floorM2, 40);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
