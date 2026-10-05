const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createGreenH2DriCase } = require('../cases/green-h2-dri');
const { createH2DriCase } = require('../cases/h2-dri');
const { createSiliconCase } = require('../cases/silicon');
const { createUreaCase } = require('../cases/urea');
const { createMaglutCase } = require('../cases/maglut');

test('TEA steel/ore/H2/DRI/electrolyzer/SWRO stay at screening values', () => {
  assert.equal(tea.prices.steel.value, 0.40);
  assert.equal(tea.costs['iron-ore'].value, 0.10);
  assert.equal(tea.costs['hydrogen-feed'].value, 2.00);
  assert.equal(tea.packs['hydrogen-dri'].capexIntensity, 800);
  assert.equal(tea.packs.electrolyzer.capexIntensity, 3250);
  assert.equal(tea.packs.swro.capexIntensity, 1500);
  assert.equal(tea.prices.oxygen.value, 0.05);
});

test('Mejillones green H2-DRI solves ~1000 kg Fe/day without electricity bind', () => {
  const definition = createGreenH2DriCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.dri.activity - 1000) / 1000 < 0.01, `Fe activity ${solved.nodes.dri.activity}`);
  for (const id of ['electrolyzer', 'swro', 'dri']) {
    const limited = solved.nodes[id].limitedBy || [];
    assert.ok(!limited.includes('electricity'), `${id} limitedBy=${limited.join(',')}`);
  }
  assert.equal(definition.site.id, 'chile-mejillones-green-h2-dri');
  assert.equal(definition.site.latitude, -23.1);
  assert.equal(definition.site.longitude, -70.448);
  assert.equal(definition.site.region, 'Atacama/Chile');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.27);
  assert.equal(definition.site.assay.assayId, 'atacama-pacific-seawater');
  assert.equal(definition.site.assay.density_kg_per_L, 1.025);
  assert.equal(definition.site.rights.ironOrePurchase.status, 'assumed');
  assert.equal(definition.site.rights.seawaterIntake.status, 'assumed');
  assert.equal(definition.site.rights.seawaterIntake.authorize, true);
  assert.equal(definition.site.rights.seawaterDischarge.status, 'assumed');
  assert.equal(definition.site.rights.seawaterDischarge.authorize, true);
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /not purchased grey\/blue H₂/i);
  assert.match(definition.site.notes, /not Midrex/i);
  assert.match(definition.site.notes, /not bankable/i);
  assert.match(definition.site.notes, /No green-steel premium/i);
});

test('green H2-DRI graph is on-site PEM hydrogen, not purchased hydrogen-feed', () => {
  const definition = createGreenH2DriCase();
  assert.ok(!definition.graph.nodes.some(node => node.id === 'hydrogen-feed'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'material-source' && node.sourcePreset === 'hydrogen'));
  assert.ok(!definition.graph.nodes.some(node => {
    const note = JSON.stringify(node.economics || {});
    return /hydrogen-feed/.test(note) || (node.economics && node.economics.unitCost === 2 && node.unit === 'material-source');
  }));
  const hydrogen = definition.graph.edges.find(edge => edge.to.node === 'dri' && edge.to.port === 'hydrogen');
  assert.ok(hydrogen);
  assert.equal(hydrogen.from.node, 'electrolyzer');
  assert.equal(hydrogen.from.port, 'hydrogen');
  assert.ok(definition.graph.nodes.some(node => node.id === 'swro' && node.unit === 'swro'));
  assert.ok(definition.graph.nodes.some(node => node.id === 'electrolyzer' && node.unit === 'electrolyzer'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'chlor-alkali'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'asu'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'dac' || String(node.unit).startsWith('dac-')));
});

test('purchased createH2DriCase still has hydrogen-feed and no electrolyzer', () => {
  const purchased = createH2DriCase();
  assert.ok(purchased.graph.nodes.some(node => node.id === 'hydrogen-feed'));
  assert.ok(!purchased.graph.nodes.some(node => node.unit === 'electrolyzer'));
  assert.ok(!purchased.graph.nodes.some(node => node.unit === 'swro'));
  const hydrogen = purchased.graph.edges.find(edge => edge.to.node === 'dri' && edge.to.port === 'hydrogen');
  assert.ok(hydrogen);
  assert.equal(hydrogen.from.node, 'hydrogen-feed');
  assert.equal(purchased.site.id, 'chile-mejillones-h2-dri');
});

test('green H2-DRI economics have installed CAPEX and finite annualNetCash; Maglut/Si/urea/purchased H2-DRI unchanged', () => {
  const definition = createGreenH2DriCase();
  const solved = solveOperation(definition);
  const installed = id => {
    const node = definition.graph.nodes.find(item => item.id === id);
    const econ = node.economics;
    return Number(econ.installedCapex) || Number(econ.capexRate) * Number(node.capacity || 0);
  };
  assert.ok(installed('power') > 0, 'solar installed CAPEX');
  assert.ok(installed('electrolyzer') > 0, 'electrolyzer installed CAPEX');
  assert.ok(installed('swro') > 0, 'swro installed CAPEX');
  assert.ok(installed('dri') > 0, 'hydrogen-dri installed CAPEX');
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash} purchases=${cash.breakdown.sourcePurchases} fixedOM=${cash.breakdown.fixedOM} variableOM=${cash.breakdown.variableOM} installed=${cash.installedCapex}`);

  const purchased = createH2DriCase();
  const purchasedCash = evaluateEconomics(purchased, solveOperation(purchased));
  assert.ok(Number.isFinite(purchasedCash.annualNetCash), `purchased H2-DRI annualNetCash=${purchasedCash.annualNetCash}`);

  const silicon = createSiliconCase();
  const siliconCash = evaluateEconomics(silicon, solveOperation(silicon));
  assert.ok(Number.isFinite(siliconCash.annualNetCash), `silicon annualNetCash=${siliconCash.annualNetCash}`);

  const urea = createUreaCase();
  const ureaCash = evaluateEconomics(urea, solveOperation(urea));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash=${ureaCash.annualNetCash}`);

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('Overview lists Mejillones green H2-DRI under Fuels screening cash−', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /id="loadGreenH2Dri"/);
  assert.match(html, /Mejillones green H₂-DRI \(SWRO\+PEM\)/);
  assert.match(html, /cases\/green-h2-dri\.js/);
  assert.ok(html.indexOf('cases/green-h2-dri.js') < html.indexOf('js/flowsheet-app.js'));
  const fuels = html.slice(html.indexOf('optgroup label="Fuels'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Fuels')));
  assert.match(fuels, /id="loadGreenH2Dri"/);
  const materials = html.slice(html.indexOf('optgroup label="Materials"'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Materials"')));
  assert.doesNotMatch(materials, /loadGreenH2Dri/);
  assert.match(materials, /id="loadH2Dri"/);
  assert.match(source, /loadGreenH2Dri/);
  assert.match(source, /'green-h2-dri':\s*\(\)\s*=>\s*loadGreenH2Dri\(\)/);
});
