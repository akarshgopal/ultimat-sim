const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createGreenFtCase } = require('../cases/green-ft');
const { createFtLiquidsCase } = require('../cases/ft-liquids');
const { createGreenMtoCase } = require('../cases/green-mto');
const { createUreaCase } = require('../cases/urea');
const { createMaglutCase } = require('../cases/maglut');

test('TEA diesel/H2/CO2/FT/electrolyzer/SWRO stay at screening values', () => {
  assert.equal(tea.prices.diesel.value, 0.90);
  assert.equal(tea.costs['hydrogen-feed'].value, 2.00);
  assert.equal(tea.costs['co2-feed'].value, 0.05);
  assert.equal(tea.prices.oxygen.value, 0.05);
  assert.equal(tea.packs['ft-liquids'].capexIntensity, 443);
  assert.equal(tea.packs.electrolyzer.capexIntensity, 3250);
  assert.equal(tea.packs.swro.capexIntensity, 1500);
  assert.equal(tea.packs.mto.capexIntensity, 183);
  assert.equal(tea.packs.urea.capexIntensity, 1200);
});

test('Mejillones green FT solves ~1000 kg diesel/day without electricity bind', () => {
  const definition = createGreenFtCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes['ft-liquids'].activity - 1000) / 1000 < 0.01, `ft activity ${solved.nodes['ft-liquids'].activity}`);
  const h2Stoich = 1000 * 37 * SUBSTANCES.H2.molarMassG / SUBSTANCES.C12H26.molarMassG;
  assert.ok(Math.abs(solved.nodes.electrolyzer.activity - h2Stoich) / h2Stoich < 0.01, `H2 activity ${solved.nodes.electrolyzer.activity}`);
  const massIn = streamMassKg(solved.nodes['ft-liquids'].consumed.hydrogen) + streamMassKg(solved.nodes['ft-liquids'].consumed.co2);
  const massOut = streamMassKg(solved.nodes['ft-liquids'].outlets.diesel) + streamMassKg(solved.nodes['ft-liquids'].outlets.water);
  assert.ok(Math.abs(massIn - massOut) < 1e-2, `FT mass in ${massIn} out ${massOut}`);
  for (const id of ['electrolyzer', 'swro', 'ft-liquids']) {
    const limited = solved.nodes[id].limitedBy || [];
    assert.ok(!limited.includes('electricity'), `${id} limitedBy=${limited.join(',')}`);
  }
  assert.equal(definition.site.id, 'chile-mejillones-green-ft');
  assert.equal(definition.site.latitude, -23.1);
  assert.equal(definition.site.longitude, -70.448);
  assert.equal(definition.site.region, 'Atacama/Chile');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.27);
  assert.equal(definition.site.assay.assayId, 'atacama-pacific-seawater');
  assert.equal(definition.site.assay.density_kg_per_L, 1.025);
  assert.equal(definition.site.rights.co2Purchase.status, 'assumed');
  assert.equal(definition.site.rights.seawaterIntake.status, 'assumed');
  assert.equal(definition.site.rights.seawaterIntake.authorize, true);
  assert.equal(definition.site.rights.seawaterDischarge.status, 'assumed');
  assert.equal(definition.site.rights.seawaterDischarge.authorize, true);
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /not purchased H₂/i);
  assert.match(definition.site.notes, /not DAC/i);
  assert.match(definition.site.notes, /not bankable/i);
  assert.match(definition.site.notes, /not a green e-diesel/i);
});

test('green FT graph is on-site PEM hydrogen, not purchased hydrogen-feed', () => {
  const definition = createGreenFtCase();
  assert.ok(!definition.graph.nodes.some(node => node.id === 'hydrogen-feed'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'material-source' && node.sourcePreset === 'hydrogen'));
  assert.ok(!definition.graph.nodes.some(node => {
    const note = JSON.stringify(node.economics || {});
    return /hydrogen-feed/.test(note);
  }));
  const hydrogen = definition.graph.edges.find(edge => edge.to.node === 'ft-liquids' && edge.to.port === 'hydrogen');
  assert.ok(hydrogen);
  assert.equal(hydrogen.from.node, 'electrolyzer');
  assert.equal(hydrogen.from.port, 'hydrogen');
  assert.ok(definition.graph.nodes.some(node => node.id === 'swro' && node.unit === 'swro'));
  assert.ok(definition.graph.nodes.some(node => node.id === 'electrolyzer' && node.unit === 'electrolyzer'));
  assert.ok(definition.graph.nodes.some(node => node.id === 'co2-feed' && node.sourcePreset === 'co2'));
  assert.equal(definition.graph.nodes.find(node => node.id === 'co2-feed').economics.unitCost, 0.05);
  assert.equal(definition.graph.nodes.find(node => node.id === 'diesel-product').economics.gateUnitPrice, 0.9);
  assert.equal(definition.graph.nodes.find(node => node.id === 'diesel-product').economics.unitPrice, 0.9 - 0.08);
  assert.equal(definition.graph.nodes.find(node => node.id === 'diesel-product').economics.freightId, 'chile-coast-container');
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'dac' || String(node.unit).startsWith('dac-')));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'intake-pump'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'gas-blower'));
});

test('purchased createFtLiquidsCase still has hydrogen-feed and no electrolyzer', () => {
  const purchased = createFtLiquidsCase();
  assert.ok(purchased.graph.nodes.some(node => node.id === 'hydrogen-feed'));
  assert.ok(!purchased.graph.nodes.some(node => node.unit === 'electrolyzer'));
  assert.ok(!purchased.graph.nodes.some(node => node.unit === 'swro'));
  const hydrogen = purchased.graph.edges.find(edge => edge.to.node === 'ft-liquids' && edge.to.port === 'hydrogen');
  assert.ok(hydrogen);
  assert.equal(hydrogen.from.node, 'hydrogen-feed');
  assert.equal(purchased.site.id, 'chile-mejillones-ft-liquids');
});

test('green FT economics have installed CAPEX and finite cash−; Maglut/purchased FT/green-MTO/urea unchanged', () => {
  const definition = createGreenFtCase();
  const solved = solveOperation(definition);
  const installed = id => {
    const node = definition.graph.nodes.find(item => item.id === id);
    const econ = node.economics;
    return Number(econ.installedCapex) || Number(econ.capexRate) * Number(node.capacity || 0);
  };
  assert.ok(installed('power') > 0, 'solar installed CAPEX');
  assert.ok(installed('electrolyzer') > 0, 'electrolyzer installed CAPEX');
  assert.ok(installed('swro') > 0, 'swro installed CAPEX');
  assert.ok(installed('ft-liquids') > 0, 'ft-liquids installed CAPEX');
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(cash.annualNetCash < 0, `expected cash−, got ${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash} purchases=${cash.breakdown.sourcePurchases} fixedOM=${cash.breakdown.fixedOM} variableOM=${cash.breakdown.variableOM} installed=${cash.installedCapex}`);

  const purchased = createFtLiquidsCase();
  const purchasedCash = evaluateEconomics(purchased, solveOperation(purchased));
  assert.ok(Number.isFinite(purchasedCash.annualNetCash), `purchased FT annualNetCash=${purchasedCash.annualNetCash}`);
  assert.ok(purchasedCash.annualNetCash < 0, `purchased FT expected cash−, got ${purchasedCash.annualNetCash}`);
  assert.ok(cash.annualNetCash < purchasedCash.annualNetCash, `green FT ${cash.annualNetCash} should be more cash− than purchased FT ${purchasedCash.annualNetCash}`);

  const greenMto = createGreenMtoCase();
  const greenMtoCash = evaluateEconomics(greenMto, solveOperation(greenMto));
  assert.ok(Number.isFinite(greenMtoCash.annualNetCash), `green MTO annualNetCash=${greenMtoCash.annualNetCash}`);

  const urea = createUreaCase();
  const ureaCash = evaluateEconomics(urea, solveOperation(urea));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash=${ureaCash.annualNetCash}`);

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('Overview lists Mejillones green FT under Fuels screening cash− after ft-liquids / green-mto', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /id="loadGreenFt"/);
  assert.match(html, /Mejillones green FT \(SWRO\+PEM H₂\+CO₂→diesel\)/);
  assert.match(html, /cases\/green-ft\.js/);
  assert.ok(html.indexOf('cases/green-ft.js') < html.indexOf('js/flowsheet-app.js'));
  const fuels = html.slice(html.indexOf('optgroup label="Fuels'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Fuels')));
  assert.match(fuels, /id="loadGreenFt"/);
  assert.ok(fuels.indexOf('id="loadFtLiquids"') < fuels.indexOf('id="loadGreenFt"'));
  assert.ok(fuels.indexOf('id="loadGreenMto"') < fuels.indexOf('id="loadGreenFt"'));
  const materials = html.slice(html.indexOf('optgroup label="Materials"'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Materials"')));
  assert.doesNotMatch(materials, /loadGreenFt/);
  assert.match(source, /loadGreenFt/);
  assert.match(source, /'green-ft':\s*\(\)\s*=>\s*loadGreenFt\(\)/);
  assert.match(source, /Fuels:\s*\[\s*'electrolyzer',\s*'sabatier',\s*'methanol',\s*'asu',\s*'ammonia',\s*'urea',\s*'mto',\s*'ft-liquids'\s*\]/);
});
