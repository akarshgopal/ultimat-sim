const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createGreenUreaCase } = require('../cases/green-urea');
const { createUreaCase } = require('../cases/urea');
const { createGreenAmmoniaCase } = require('../cases/green-ammonia');
const { createMaglutCase } = require('../cases/maglut');

test('TEA urea/ammonia/oxygen/electrolyzer/SWRO/ASU stay at screening values', () => {
  assert.equal(tea.prices.urea.value, 0.40);
  assert.equal(tea.prices.ammonia.value, 0.45);
  assert.equal(tea.costs['ammonia-feed'].value, 0.45);
  assert.equal(tea.costs['co2-feed'].value, 0.05);
  assert.equal(tea.prices.oxygen.value, 0.05);
  assert.equal(tea.packs.urea.capexIntensity, 1200);
  assert.equal(tea.packs.ammonia.capexIntensity, 2000);
  assert.equal(tea.packs.electrolyzer.capexIntensity, 3250);
  assert.equal(tea.packs.asu.capexIntensity, 400);
  assert.equal(tea.packs.swro.capexIntensity, 1500);
});

test('Walvis green urea solves ~1000 kg urea/day without electricity bind', () => {
  const definition = createGreenUreaCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.urea.activity - 1000) / 1000 < 0.01, `urea activity ${solved.nodes.urea.activity}`);
  const nh3Stoich = 1000 * 2 * SUBSTANCES.NH3.molarMassG / SUBSTANCES.Urea.molarMassG;
  assert.ok(Math.abs(solved.nodes.ammonia.activity - nh3Stoich) / nh3Stoich < 0.01, `NH3 activity ${solved.nodes.ammonia.activity}`);
  const massIn = streamMassKg(solved.nodes.urea.consumed.ammonia) + streamMassKg(solved.nodes.urea.consumed.carbonDioxide);
  const massOut = streamMassKg(solved.nodes.urea.outlets.urea) + streamMassKg(solved.nodes.urea.outlets.water);
  assert.ok(Math.abs(massIn - massOut) < 1e-2, `urea mass in ${massIn} out ${massOut}`);
  for (const id of ['electrolyzer', 'swro', 'asu', 'ammonia', 'urea']) {
    const limited = solved.nodes[id].limitedBy || [];
    assert.ok(!limited.includes('electricity'), `${id} limitedBy=${limited.join(',')}`);
  }
  assert.equal(definition.site.id, 'namibia-walvis-bay-green-urea');
  assert.equal(definition.site.latitude, -22.957);
  assert.equal(definition.site.longitude, 14.505);
  assert.equal(definition.site.region, 'Southern Africa');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.48);
  assert.equal(definition.site.assay.assayId, 'benguela-atlantic-seawater');
  assert.equal(definition.site.assay.density_kg_per_L, 1.025);
  assert.equal(definition.site.rights.co2Purchase.status, 'assumed');
  assert.equal(definition.site.rights.seawaterIntake.status, 'assumed');
  assert.equal(definition.site.rights.seawaterIntake.authorize, true);
  assert.equal(definition.site.rights.seawaterDischarge.status, 'assumed');
  assert.equal(definition.site.rights.seawaterDischarge.authorize, true);
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /not purchased NH/i);
  assert.match(definition.site.notes, /not DAC/i);
  assert.match(definition.site.notes, /not bankable/i);
  assert.match(definition.site.notes, /not a green premium/i);
});

test('green urea graph is on-site Haber NH3, not purchased ammonia-feed', () => {
  const definition = createGreenUreaCase();
  assert.ok(!definition.graph.nodes.some(node => node.id === 'ammonia-feed'));
  assert.ok(!definition.graph.nodes.some(node => node.id === 'ammonia-product'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'material-source' && node.sourcePreset === 'ammonia'));
  assert.ok(!definition.graph.nodes.some(node => {
    const note = JSON.stringify(node.economics || {});
    return /ammonia-feed/.test(note);
  }));
  const ammonia = definition.graph.edges.find(edge => edge.to.node === 'urea' && edge.to.port === 'ammonia');
  assert.ok(ammonia);
  assert.equal(ammonia.from.node, 'ammonia');
  assert.equal(ammonia.from.port, 'ammonia');
  const hydrogen = definition.graph.edges.find(edge => edge.to.node === 'ammonia' && edge.to.port === 'hydrogen');
  assert.ok(hydrogen);
  assert.equal(hydrogen.from.node, 'electrolyzer');
  assert.equal(hydrogen.from.port, 'hydrogen');
  const nitrogen = definition.graph.edges.find(edge => edge.to.node === 'ammonia' && edge.to.port === 'nitrogen');
  assert.ok(nitrogen);
  assert.equal(nitrogen.from.node, 'asu');
  assert.ok(definition.graph.nodes.some(node => node.id === 'swro' && node.unit === 'swro'));
  assert.ok(definition.graph.nodes.some(node => node.id === 'electrolyzer' && node.unit === 'electrolyzer'));
  assert.ok(definition.graph.nodes.some(node => node.id === 'asu' && node.unit === 'asu'));
  assert.ok(definition.graph.nodes.some(node => node.id === 'co2-feed' && node.sourcePreset === 'co2'));
  assert.equal(definition.graph.nodes.find(node => node.id === 'co2-feed').economics.unitCost, 0.05);
  assert.equal(definition.graph.nodes.find(node => node.id === 'urea-product').economics.unitPrice, 0.4);
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'dac' || String(node.unit).startsWith('dac-')));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'intake-pump'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'gas-blower'));
});

test('purchased createUreaCase still has ammonia-feed and no electrolyzer', () => {
  const purchased = createUreaCase();
  assert.ok(purchased.graph.nodes.some(node => node.id === 'ammonia-feed'));
  assert.ok(!purchased.graph.nodes.some(node => node.unit === 'electrolyzer'));
  assert.ok(!purchased.graph.nodes.some(node => node.unit === 'swro'));
  assert.ok(!purchased.graph.nodes.some(node => node.unit === 'asu'));
  const ammonia = purchased.graph.edges.find(edge => edge.to.node === 'urea' && edge.to.port === 'ammonia');
  assert.ok(ammonia);
  assert.equal(ammonia.from.node, 'ammonia-feed');
  assert.equal(purchased.site.id, 'namibia-walvis-bay-urea');
});

test('green urea economics have installed CAPEX and finite cash−; Maglut/purchased urea/green-ammonia unchanged', () => {
  const definition = createGreenUreaCase();
  const solved = solveOperation(definition);
  const installed = id => {
    const node = definition.graph.nodes.find(item => item.id === id);
    const econ = node.economics;
    return Number(econ.installedCapex) || Number(econ.capexRate) * Number(node.capacity || 0);
  };
  assert.ok(installed('power') > 0, 'solar installed CAPEX');
  assert.ok(installed('electrolyzer') > 0, 'electrolyzer installed CAPEX');
  assert.ok(installed('swro') > 0, 'swro installed CAPEX');
  assert.ok(installed('asu') > 0, 'asu installed CAPEX');
  assert.ok(installed('ammonia') > 0, 'ammonia installed CAPEX');
  assert.ok(installed('urea') > 0, 'urea installed CAPEX');
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(cash.annualNetCash < 0, `expected cash−, got ${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash} purchases=${cash.breakdown.sourcePurchases} fixedOM=${cash.breakdown.fixedOM} variableOM=${cash.breakdown.variableOM} installed=${cash.installedCapex}`);

  const purchased = createUreaCase();
  const purchasedCash = evaluateEconomics(purchased, solveOperation(purchased));
  assert.ok(Number.isFinite(purchasedCash.annualNetCash), `purchased urea annualNetCash=${purchasedCash.annualNetCash}`);
  assert.ok(cash.annualNetCash < purchasedCash.annualNetCash, `green urea ${cash.annualNetCash} should be more cash− than purchased urea ${purchasedCash.annualNetCash}`);

  const greenNh3 = createGreenAmmoniaCase();
  const greenNh3Solved = solveOperation(greenNh3);
  assert.equal(greenNh3Solved.convergence.converged, true);
  const greenNh3Cash = evaluateEconomics(greenNh3, greenNh3Solved);
  assert.ok(Number.isFinite(greenNh3Cash.annualNetCash), `green NH3 annualNetCash=${greenNh3Cash.annualNetCash}`);
  assert.ok(greenNh3.graph.nodes.some(node => node.id === 'ammonia-product'));
  assert.ok(!greenNh3.graph.nodes.some(node => node.unit === 'urea'));

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('Overview lists Walvis Bay green urea under Fuels screening cash− after urea / green-ammonia', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /id="loadGreenUrea"/);
  assert.match(html, /Walvis Bay green urea \(SWRO\+PEM Haber→urea\)/);
  assert.match(html, /cases\/green-urea\.js/);
  assert.ok(html.indexOf('cases/green-urea.js') < html.indexOf('js/flowsheet-app.js'));
  const fuels = html.slice(html.indexOf('optgroup label="Fuels'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Fuels')));
  assert.match(fuels, /id="loadGreenUrea"/);
  assert.ok(fuels.indexOf('id="loadUrea"') < fuels.indexOf('id="loadGreenUrea"'));
  assert.ok(fuels.indexOf('id="loadGreenAmmonia"') < fuels.indexOf('id="loadGreenUrea"'));
  const materials = html.slice(html.indexOf('optgroup label="Materials"'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Materials"')));
  assert.doesNotMatch(materials, /loadGreenUrea/);
  assert.match(source, /loadGreenUrea/);
  assert.match(source, /'green-urea':\s*\(\)\s*=>\s*loadGreenUrea\(\)/);
  assert.match(source, /Fuels:\s*\[\s*'electrolyzer',\s*'sabatier',\s*'methanol',\s*'asu',\s*'ammonia',\s*'urea',\s*'mto',\s*'ft-liquids'\s*\]/);
});
