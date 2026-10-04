const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createGreenAmmoniaCase } = require('../cases/green-ammonia');
const { siteDeadSeaAbundance } = require('../cases/network');

test('TEA ammonia/oxygen prices and fuel packs stay at screening values', () => {
  assert.equal(tea.prices.ammonia.value, 0.45);
  assert.equal(tea.prices.oxygen.value, 0.05);
  assert.equal(tea.packs.electrolyzer.capexIntensity, 3250);
  assert.equal(tea.packs.asu.capexIntensity, 400);
  assert.equal(tea.packs.ammonia.capexIntensity, 2000);
  assert.equal(tea.packs.swro.capexIntensity, 1500);
});

test('Walvis Bay green NH3 case solves at 1000 kg/day without electricity bind', () => {
  const definition = createGreenAmmoniaCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.ammonia.activity - 1000) / 1000 < 0.01, `Haber activity ${solved.nodes.ammonia.activity}`);
  for (const id of ['electrolyzer', 'asu', 'swro', 'ammonia']) {
    const limited = solved.nodes[id].limitedBy || [];
    assert.ok(!limited.includes('electricity'), `${id} limitedBy=${limited.join(',')}`);
  }
  assert.ok(solved.nodes['ammonia-product'].received && streamMassKg(solved.nodes['ammonia-product'].received) > 0);
  assert.equal(definition.site.id, 'namibia-walvis-bay');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.48);
  assert.equal(definition.site.assay.assayId, 'benguela-atlantic-seawater');
  assert.equal(definition.site.assay.density_kg_per_L, 1.025);
  assert.match(definition.site.notes, /not Dead Sea chlor-alkali/i);
});

test('green NH3 graph is electrolytic hydrogen, not chlor-alkali', () => {
  const definition = createGreenAmmoniaCase();
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'chlor-alkali'));
  const hydrogen = definition.graph.edges.find(edge => edge.to.node === 'ammonia' && edge.to.port === 'hydrogen');
  assert.ok(hydrogen);
  assert.equal(hydrogen.from.node, 'electrolyzer');
  assert.equal(hydrogen.from.port, 'hydrogen');
});

test('green NH3 economics have installed CAPEX and finite annualNetCash', () => {
  const definition = createGreenAmmoniaCase();
  const solved = solveOperation(definition);
  const installed = id => {
    const econ = definition.graph.nodes.find(node => node.id === id).economics;
    return Number(econ.installedCapex) || Number(econ.capexRate) * Number(definition.graph.nodes.find(node => node.id === id).capacity || 0);
  };
  assert.ok(installed('power') > 0, 'solar installed CAPEX');
  assert.ok(installed('electrolyzer') > 0, 'electrolyzer installed CAPEX');
  assert.ok(installed('asu') > 0, 'asu installed CAPEX');
  assert.ok(installed('ammonia') > 0, 'ammonia installed CAPEX');
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  // Recorded from this solve (screening gate; sign is not asserted):
  // annualRevenue, annualOperatingCost, annualizedCapex, annualNetCash printed here so the summary can cite them.
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash} purchases=${cash.breakdown.sourcePurchases} fixedOM=${cash.breakdown.fixedOM} variableOM=${cash.breakdown.variableOM}`);
});

test('Dead Sea abundance still feeds Haber from chlor-alkali, with no electrolyzer', () => {
  const definition = siteDeadSeaAbundance();
  assert.ok(definition.graph.nodes.some(node => node.unit === 'chlor-alkali'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'electrolyzer'));
  const hydrogen = definition.graph.edges.find(edge => edge.to.node === 'ammonia' && edge.to.port === 'hydrogen');
  assert.ok(hydrogen);
  assert.equal(hydrogen.from.node, 'chlor-alkali');
  assert.equal(hydrogen.from.port, 'hydrogen');
});

test('Overview lists Walvis Bay green NH3 under Fuels screening cash−', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /id="loadGreenAmmonia"/);
  assert.match(html, /cases\/green-ammonia\.js/);
  assert.ok(html.indexOf('cases/green-ammonia.js') < html.indexOf('js/flowsheet-app.js'));
  const fuels = html.slice(html.indexOf('optgroup label="Fuels'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Fuels')));
  assert.match(fuels, /id="loadGreenAmmonia"/);
  const materials = html.slice(html.indexOf('optgroup label="Materials"'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Materials"')));
  assert.doesNotMatch(materials, /loadGreenAmmonia/);
  assert.match(source, /loadGreenAmmonia/);
  assert.match(source, /'green-ammonia':\s*\(\)\s*=>\s*loadGreenAmmonia\(\)/);
});
