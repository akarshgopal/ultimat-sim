const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const clay = require('../data/ionic-clay-longnan.js');
const { createReeSxCase } = require('../cases/ree-sx');
const { createMaglutCase } = require('../cases/maglut');
const { createReeCase } = require('../cases/ree');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function concentrateInlet(kg, extra) {
  const mol = clay.concentrateMolForKg(kg);
  if (extra) Object.assign(mol, extra);
  return { kind: 'material', mol, phase: 'solid', T_C: 25, P_bar: 1 };
}

test('10 kg recovered listed REO at recovery 0.95 uses 10/0.95 kg and 53 kWh, splits oxide families, rejects extra feed', () => {
  const recovered = 10;
  const recovery = 0.95;
  const feedKg = recovered / recovery;
  const result = UNITS['ree-sx'].evaluate({
    inlets: {
      concentrate: concentrateInlet(feedKg),
      electricity: { kind: 'electricity', kWh: 53 },
    },
    requestedActivity: recovered,
    capacity: 10,
  });
  assert.ok(Math.abs(result.activity - recovered) < 1e-9);
  assert.equal(result.consumed.electricity.kWh, 53);
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
  assert.equal(UNITS['ree-sx'].ports.wasteHeat, undefined);
  assert.equal(UNITS['ree-sx'].ports.extractant, undefined);
  assert.equal(UNITS['ree-sx'].ports.solvent, undefined);
  for (const oxide of ['Nd2O3', 'Pr6O11']) {
    assert.ok((result.outlets.ndpr.mol[oxide] || 0) > 0, oxide);
    assert.equal(result.outlets.dytb.mol[oxide], undefined);
    assert.equal(result.outlets.lightReo.mol[oxide], undefined);
  }
  for (const oxide of ['Dy2O3', 'Tb4O7']) {
    assert.ok((result.outlets.dytb.mol[oxide] || 0) > 0, oxide);
    assert.equal(result.outlets.ndpr.mol[oxide], undefined);
    assert.equal(result.outlets.lightReo.mol[oxide], undefined);
  }
  assert.ok((result.outlets.lightReo.mol.Y2O3 || 0) > 0);
  assert.equal(result.outlets.ndpr.mol.Y2O3, undefined);
  assert.equal(result.outlets.dytb.mol.Y2O3, undefined);

  assert.throws(
    () => UNITS['ree-sx'].evaluate({
      inlets: {
        concentrate: concentrateInlet(feedKg, { H2O: 1e-6 }),
        electricity: { kind: 'electricity', kWh: 53 },
      },
      requestedActivity: recovered,
      capacity: 10,
    }),
    /extra substances/
  );
});

test('ree-sx pack is 43800; separated prices and Maglut / Minaçu packs stay put', () => {
  assert.equal(tea.packs['ree-sx'].capexIntensity, 43800);
  assert.equal(tea.packs['ree-sx'].fixedOmPercent, 4);
  assert.equal(tea.packs['ree-sx'].variableOm, 0.05);
  assert.equal(tea.packs['ree-sx'].assetLifeYears, 20);
  assert.equal(tea.packs['ree-sx'].quality, 'screening');
  assert.match(tea.packs['ree-sx'].note, /\$120,000/);
  assert.match(tea.packs['ree-sx'].note, /Not a Lynas\/MP Materials\/Mountain Pass quote/);
  assert.ok(tea.packs['ree-sx'].evidence.some(item => /Talens/i.test(item.label) && /^https:\/\//.test(item.url)));
  assert.ok(tea.packs['ree-sx'].evidence.some(item => /Honaker/i.test(item.label) && /^https:\/\//.test(item.url)));
  assert.ok(tea.packs['ree-sx'].evidence.some(item => /USGS/i.test(item.label) && /^https:\/\//.test(item.url)));
  assert.ok(tea.packs['ree-sx'].evidence.some(item => /ORNL MSX/i.test(item.label) && /^https:\/\//.test(item.url)));
  assert.equal(tea.prices['ndpr-oxide-separated'].value, 69);
  assert.equal(tea.prices['dytb-oxide'].value, 340.19);
  assert.equal(tea.prices['light-reo'].value, 17.50);
  assert.equal(tea.costs['mixed-reo-concentrate'].value, 34.54);
  assert.equal(tea.prices['ndpr-oxide'].value, 48.30);
  assert.equal(tea.prices['other-reo'].value, 33.61);
  assert.equal(tea.packs['ree-chromatography'].capexIntensity, 27375);
  assert.equal(tea.packs['iac-leach'].capexIntensity, 18250);
  assert.equal(tea.demand['ndpr-oxide-separated'].value, 5e4);
  assert.equal(tea.demand['dytb-oxide'].value, 2e4);
  assert.equal(tea.demand['light-reo'].value, 2e5);
  assert.equal(tea.getCapexMultiplierForRegion('US West / California'), 1);
});

test('Long Beach peer SX demo is 10 kg/day with finite cash; Maglut stays ~1299; Minaçu stays cash+', () => {
  const definition = createReeSxCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.sx.activity - 10) / 10 < 0.01);
  const limited = [
    ...(solved.nodes.sx.limitedBy || []),
    ...(solved.warnings || []),
  ].join(' ');
  assert.doesNotMatch(limited, /electricity/i);
  const sx = definition.graph.nodes.find(node => node.id === 'sx');
  const power = definition.graph.nodes.find(node => node.id === 'power');
  assert.equal(sx.unit, 'ree-sx');
  assert.equal(sx.params.recovery, 0.95);
  assert.equal(sx.params.electricityKWhPerKgReo, 5.3);
  assert.ok((Number(sx.economics.installedCapex) || Number(sx.economics.capexIntensity) || Number(sx.economics.capexRate)) > 0);
  assert.ok((Number(power.economics.installedCapex) || Number(power.economics.capexIntensity)) > 0);
  assert.equal(power.economics.unitCost, undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'ndpr').economics.unitPrice, 69);
  assert.equal(definition.graph.nodes.find(node => node.id === 'dytb').economics.unitPrice, 340.19);
  assert.equal(definition.graph.nodes.find(node => node.id === 'light-reo').economics.unitPrice, 17.50);
  assert.equal(definition.graph.nodes.find(node => node.id === 'raffinate').economics.disposition, 'vent');
  assert.equal(definition.site.latitude, 33.77);
  assert.equal(definition.site.longitude, -118.19);
  assert.equal(definition.site.region, 'US West / California');
  assert.equal(definition.site.dailyPVKWhPerKWp, 3.33);
  assert.equal(definition.site.rights.concentratePurchase.status, 'assumed');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /not Maglut/i);
  assert.match(definition.site.notes, /not chromatography/i);
  assert.match(definition.site.notes, /not bankable/i);
  assert.match(definition.site.notes, /Lynas\/MP Materials/);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash));
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);

  const minacu = createReeCase();
  const minacuCash = evaluateEconomics(minacu, solveOperation(minacu));
  assert.ok(Number.isFinite(minacuCash.annualNetCash));
  assert.ok(minacuCash.annualNetCash > 0, `Minaçu annualNetCash ${minacuCash.annualNetCash}`);
});

test('palette lists ree-sx after chromatography and Overview names peer SX', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /REE:\s*\[\s*'iac-leach',\s*'ree-chromatography',\s*'ree-sx'\s*\]/);
  assert.match(html, /id="loadReeSx"/);
  assert.match(html, /Long Beach peer SX \(not Maglut\)/);
  assert.match(html, /cases\/ree-sx\.js/);
  assert.ok(html.indexOf('cases/maglut.js') < html.indexOf('cases/ree-sx.js'));
  assert.ok(html.indexOf('cases/ree-sx.js') < html.indexOf('js/flowsheet-app.js'));
  const maglutOption = html.indexOf('id="loadMaglutLongBeach"');
  const sxOption = html.indexOf('id="loadReeSx"');
  assert.ok(maglutOption >= 0 && sxOption > maglutOption);
  const pad = PROCESS_INTENSITIES['ree-sx'];
  assert.equal(pad.intensity, 20);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [10, 40]);
  assert.equal(pad.floorM2, 50);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
  assert.match(source, /label: 'REE SX \(peer\)'/);
  assert.match(source, /glyph: 'SX'/);
});
