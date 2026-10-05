const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createGreenMtoCase } = require('../cases/green-mto');
const { createMtoCase } = require('../cases/mto');
const { createFtLiquidsCase } = require('../cases/ft-liquids');
const { createUreaCase } = require('../cases/urea');
const { createMaglutCase } = require('../cases/maglut');

test('TEA ethylene/MeOH/MTO/electrolyzer/SWRO/CO2 stay at screening values', () => {
  assert.equal(tea.prices.ethylene.value, 0.80);
  assert.equal(tea.prices.methanol.value, 0.40);
  assert.equal(tea.costs['methanol-feed'].value, 0.40);
  assert.equal(tea.costs['co2-feed'].value, 0.05);
  assert.equal(tea.prices.oxygen.value, 0.05);
  assert.equal(tea.packs.mto.capexIntensity, 183);
  assert.equal(tea.packs.methanol.capexIntensity, 200);
  assert.equal(tea.packs.electrolyzer.capexIntensity, 3250);
  assert.equal(tea.packs.swro.capexIntensity, 1500);
  assert.equal(tea.packs['ft-liquids'].capexIntensity, 443);
  assert.equal(tea.packs.urea.capexIntensity, 1200);
});

test('Mejillones green MTO solves ~1000 kg ethylene/day without electricity bind', () => {
  const definition = createGreenMtoCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.mto.activity - 1000) / 1000 < 0.01, `mto activity ${solved.nodes.mto.activity}`);
  const methanolStoich = 1000 * 2 * SUBSTANCES.CH3OH.molarMassG / SUBSTANCES.C2H4.molarMassG;
  assert.ok(Math.abs(solved.nodes.methanol.activity - methanolStoich) / methanolStoich < 0.01, `methanol activity ${solved.nodes.methanol.activity}`);
  const massIn = streamMassKg(solved.nodes.mto.consumed.methanol);
  const massOut = streamMassKg(solved.nodes.mto.outlets.ethylene) + streamMassKg(solved.nodes.mto.outlets.water);
  assert.ok(Math.abs(massIn - massOut) < 1e-2, `MTO mass in ${massIn} out ${massOut}`);
  for (const id of ['electrolyzer', 'swro', 'methanol', 'mto']) {
    const limited = solved.nodes[id].limitedBy || [];
    assert.ok(!limited.includes('electricity'), `${id} limitedBy=${limited.join(',')}`);
  }
  assert.equal(definition.site.id, 'chile-mejillones-green-mto');
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
  assert.match(definition.site.notes, /not purchased MeOH/i);
  assert.match(definition.site.notes, /not DAC/i);
  assert.match(definition.site.notes, /not bankable/i);
  assert.match(definition.site.notes, /not a green-ethylene premium/i);
});

test('green MTO graph is on-site MeOH from PEM, not purchased methanol-feed', () => {
  const definition = createGreenMtoCase();
  assert.ok(!definition.graph.nodes.some(node => node.id === 'methanol-feed'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'material-source' && node.sourcePreset === 'methanol'));
  assert.ok(!definition.graph.nodes.some(node => {
    const note = JSON.stringify(node.economics || {});
    return /methanol-feed/.test(note);
  }));
  const methanol = definition.graph.edges.find(edge => edge.to.node === 'mto' && edge.to.port === 'methanol');
  assert.ok(methanol);
  assert.equal(methanol.from.node, 'methanol');
  assert.equal(methanol.from.port, 'methanol');
  const hydrogen = definition.graph.edges.find(edge => edge.to.node === 'methanol' && edge.to.port === 'hydrogen');
  assert.ok(hydrogen);
  assert.equal(hydrogen.from.node, 'electrolyzer');
  assert.ok(definition.graph.nodes.some(node => node.id === 'swro' && node.unit === 'swro'));
  assert.ok(definition.graph.nodes.some(node => node.id === 'electrolyzer' && node.unit === 'electrolyzer'));
  assert.ok(definition.graph.nodes.some(node => node.id === 'co2-feed' && node.sourcePreset === 'co2'));
  assert.equal(definition.graph.nodes.find(node => node.id === 'co2-feed').economics.unitCost, 0.05);
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'dac' || String(node.unit).startsWith('dac-')));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'intake-pump'));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'gas-blower'));
});

test('purchased createMtoCase still has methanol-feed and no electrolyzer', () => {
  const purchased = createMtoCase();
  assert.ok(purchased.graph.nodes.some(node => node.id === 'methanol-feed'));
  assert.ok(!purchased.graph.nodes.some(node => node.unit === 'electrolyzer'));
  assert.ok(!purchased.graph.nodes.some(node => node.unit === 'swro'));
  const methanol = purchased.graph.edges.find(edge => edge.to.node === 'mto' && edge.to.port === 'methanol');
  assert.ok(methanol);
  assert.equal(methanol.from.node, 'methanol-feed');
  assert.equal(purchased.site.id, 'chile-mejillones-mto');
});

test('green MTO economics have installed CAPEX and finite annualNetCash; Maglut/purchased MTO/FT/urea unchanged', () => {
  const definition = createGreenMtoCase();
  const solved = solveOperation(definition);
  const installed = id => {
    const node = definition.graph.nodes.find(item => item.id === id);
    const econ = node.economics;
    return Number(econ.installedCapex) || Number(econ.capexRate) * Number(node.capacity || 0);
  };
  assert.ok(installed('power') > 0, 'solar installed CAPEX');
  assert.ok(installed('electrolyzer') > 0, 'electrolyzer installed CAPEX');
  assert.ok(installed('swro') > 0, 'swro installed CAPEX');
  assert.ok(installed('methanol') > 0, 'methanol installed CAPEX');
  assert.ok(installed('mto') > 0, 'mto installed CAPEX');
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash} purchases=${cash.breakdown.sourcePurchases} fixedOM=${cash.breakdown.fixedOM} variableOM=${cash.breakdown.variableOM} installed=${cash.installedCapex}`);

  const purchased = createMtoCase();
  const purchasedCash = evaluateEconomics(purchased, solveOperation(purchased));
  assert.ok(Number.isFinite(purchasedCash.annualNetCash), `purchased MTO annualNetCash=${purchasedCash.annualNetCash}`);

  const ft = createFtLiquidsCase();
  const ftCash = evaluateEconomics(ft, solveOperation(ft));
  assert.ok(Number.isFinite(ftCash.annualNetCash), `FT annualNetCash=${ftCash.annualNetCash}`);

  const urea = createUreaCase();
  const ureaCash = evaluateEconomics(urea, solveOperation(urea));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash=${ureaCash.annualNetCash}`);

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('Overview lists Mejillones green MTO under Fuels screening cash− after mto / ft-liquids', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /id="loadGreenMto"/);
  assert.match(html, /Mejillones green MTO \(SWRO\+PEM MeOH→ethylene\)/);
  assert.match(html, /cases\/green-mto\.js/);
  assert.ok(html.indexOf('cases/green-mto.js') < html.indexOf('js/flowsheet-app.js'));
  const fuels = html.slice(html.indexOf('optgroup label="Fuels'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Fuels')));
  assert.match(fuels, /id="loadGreenMto"/);
  assert.ok(fuels.indexOf('id="loadMto"') < fuels.indexOf('id="loadGreenMto"'));
  assert.ok(fuels.indexOf('id="loadFtLiquids"') < fuels.indexOf('id="loadGreenMto"'));
  const materials = html.slice(html.indexOf('optgroup label="Materials"'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Materials"')));
  assert.doesNotMatch(materials, /loadGreenMto/);
  assert.match(source, /loadGreenMto/);
  assert.match(source, /'green-mto':\s*\(\)\s*=>\s*loadGreenMto\(\)/);
  assert.match(source, /Fuels:\s*\[\s*'electrolyzer',\s*'sabatier',\s*'methanol',\s*'asu',\s*'ammonia',\s*'urea',\s*'mto',\s*'ft-liquids'\s*\]/);
});
