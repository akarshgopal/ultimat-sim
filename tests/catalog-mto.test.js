const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createMtoCase } = require('../cases/mto');
const { createUreaCase } = require('../cases/urea');
const { createGreenH2DriCase } = require('../cases/green-h2-dri');
const { createH2DriCase } = require('../cases/h2-dri');
const { createMaglutCase } = require('../cases/maglut');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function material(substance, mol, phase) {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

test('28.0532 kg ethylene (~1 kmol) consumes 2 kmol CH3OH + 4 kWh/kg and 2 kmol H2O', () => {
  const kg = SUBSTANCES.C2H4.molarMassG;
  assert.equal(kg, 28.0532);
  assert.deepEqual(SUBSTANCES.C2H4.elements, { C: 2, H: 4 });
  const result = UNITS.mto.evaluate({
    inlets: {
      methanol: material('CH3OH', 3000, 'liquid'),
      electricity: { kind: 'electricity', kWh: 200 },
    },
    requestedActivity: kg,
    capacity: kg * 2,
  });
  assert.ok(Math.abs(result.activity - kg) < 1e-9, `activity ${result.activity}`);
  assert.ok(Math.abs(result.consumed.methanol.mol.CH3OH - 2000) < 1e-6);
  assert.ok(Math.abs(result.consumed.electricity.kWh - 4 * kg) < 1e-9);
  assert.ok(Math.abs(result.outlets.ethylene.mol.C2H4 - 1000) < 1e-6);
  assert.ok(Math.abs(result.outlets.water.mol.H2O - 2000) < 1e-6);
  const massIn = streamMassKg(result.consumed.methanol);
  const massOut = streamMassKg(result.outlets.ethylene) + streamMassKg(result.outlets.water);
  assert.ok(Math.abs(massIn - massOut) < 1e-4, `mass in ${massIn} out ${massOut}`);
  const atoms = (mol, elements) => {
    const out = {};
    for (const [el, n] of Object.entries(elements)) out[el] = (out[el] || 0) + mol * n;
    return out;
  };
  const add = (a, b, sign) => {
    for (const [el, n] of Object.entries(b)) a[el] = (a[el] || 0) + sign * n;
    return a;
  };
  const balance = {};
  add(balance, atoms(result.consumed.methanol.mol.CH3OH, SUBSTANCES.CH3OH.elements), 1);
  add(balance, atoms(result.outlets.ethylene.mol.C2H4, SUBSTANCES.C2H4.elements), -1);
  add(balance, atoms(result.outlets.water.mol.H2O, SUBSTANCES.H2O.elements), -1);
  for (const [el, n] of Object.entries(balance)) {
    assert.ok(Math.abs(n) < 1e-9, `${el} imbalance ${n}`);
  }
});

test('TEA ethylene 0.80, methanol-feed 0.40, pack 183, demand 5e7 / asia-china 5e8; methanol sale 0.40; DRI/urea/Maglut packs untouched', () => {
  assert.equal(tea.prices.ethylene.value, 0.80);
  assert.equal(tea.prices.ethylene.quality, 'screening');
  assert.equal(tea.costs['methanol-feed'].value, 0.40);
  assert.equal(tea.prices.methanol.value, 0.40);
  assert.equal(tea.packs.mto.capexIntensity, 183);
  assert.equal(tea.packs.mto.intensityUnit, '$/(kg olefin/day)');
  assert.equal(tea.packs.mto.fixedOmPercent, 4);
  assert.equal(tea.packs.mto.variableOm, 0.03);
  assert.equal(tea.packs.mto.assetLifeYears, 20);
  assert.equal(tea.packs.mto.quality, 'screening');
  assert.equal(tea.packs.mto.scaleExponent, null);
  assert.equal(tea.demand.ethylene.value, 5e7);
  assert.equal(tea.demand.ethylene.inherit, undefined);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('ethylene'));
  assert.ok(tea.FUEL_CHEM_DEMAND_KEYS.includes('ethylene'));
  assert.equal(tea.getDemandForRegion('me-levant').ethylene.value, 5e7);
  assert.equal(tea.getDemandForRegion('me-levant').ethylene.inherit, undefined);
  assert.equal(tea.getDemandForRegion('chile-atacama').ethylene.value, 5e7);
  assert.equal(tea.getDemandForRegion('chile-atacama').ethylene.inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('Atacama/Chile').ethylene.value, 5e7);
  assert.equal(tea.getDemandForRegion('asia-china').ethylene.value, 5e8);
  assert.equal(tea.getDemandForRegion('asia-china').ethylene.inherit, undefined);
  assert.equal(tea.getDemandForRegion('China / Tibet').ethylene.value, 5e8);
  assert.equal(tea.packs.methanol.capexIntensity, 200);
  assert.equal(tea.packs.urea.capexIntensity, 1200);
  assert.equal(tea.packs['hydrogen-dri'].capexIntensity, 800);
  assert.equal(tea.packs['ree-chromatography'].capexIntensity, 27375);
  assert.equal(tea.prices.steel.value, 0.40);
  assert.equal(tea.prices.urea.value, 0.40);
});

test('Mejillones MTO demo ~1000 kg ethylene/day with CAPEX on mto + solar and finite cash; green H2-DRI, H2-DRI, urea, Maglut unchanged', () => {
  const definition = createMtoCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.mto.activity - 1000) / 1000 < 0.01, `mto activity ${solved.nodes.mto.activity}`);
  assert.ok(!(solved.nodes.mto.limitedBy || []).includes('electricity'));
  const mtoNode = definition.graph.nodes.find(node => node.id === 'mto');
  const power = definition.graph.nodes.find(node => node.id === 'power');
  const mtoCapex = Number(mtoNode.economics.installedCapex) || Number(mtoNode.economics.capexRate) * Number(mtoNode.capacity || 0);
  const solarCapex = Number(power.economics.installedCapex) || Number(power.economics.capexRate) * Number(power.capacity || 0);
  assert.ok(mtoCapex > 0, `mto CAPEX ${mtoCapex}`);
  assert.ok(solarCapex > 0, `solar CAPEX ${solarCapex}`);
  assert.equal(power.economics.unitCost, undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'methanol-feed').economics.unitCost, 0.4);
  assert.equal(definition.graph.nodes.find(node => node.id === 'ethylene-product').economics.unitPrice, 0.8);
  assert.equal(definition.graph.nodes.find(node => node.id === 'process-water').economics.disposition, 'vent');
  assert.equal(definition.site.id, 'chile-mejillones-mto');
  assert.equal(definition.site.latitude, -23.1);
  assert.equal(definition.site.longitude, -70.448);
  assert.equal(definition.site.region, 'Atacama/Chile');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.27);
  assert.equal(definition.site.rights.methanolPurchase.status, 'assumed');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /not a green-MeOH/i);
  assert.match(definition.site.notes, /not FT/i);
  assert.match(definition.site.notes, /not bankable/i);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash}`);

  const green = createGreenH2DriCase();
  const greenCash = evaluateEconomics(green, solveOperation(green));
  assert.ok(Number.isFinite(greenCash.annualNetCash), `green H2-DRI annualNetCash=${greenCash.annualNetCash}`);

  const h2dri = createH2DriCase();
  const h2driCash = evaluateEconomics(h2dri, solveOperation(h2dri));
  assert.ok(Number.isFinite(h2driCash.annualNetCash), `H2-DRI annualNetCash=${h2driCash.annualNetCash}`);

  const urea = createUreaCase();
  const ureaCash = evaluateEconomics(urea, solveOperation(urea));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash=${ureaCash.annualNetCash}`);

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('Palette Fuels lists mto after urea; Overview option mentions MTO; flowsheet-ui script list includes cases/mto.js', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const uiTest = fs.readFileSync(path.join(__dirname, 'flowsheet-ui.test.js'), 'utf8');
  assert.match(source, /Fuels:\s*\[\s*'electrolyzer',\s*'sabatier',\s*'methanol',\s*'asu',\s*'ammonia',\s*'urea',\s*'mto',\s*'ft-liquids'\s*\]/);
  assert.match(html, /id="loadMto"/);
  assert.match(html, /Mejillones MTO \(purchased MeOH→ethylene\)/);
  assert.match(html, /cases\/mto\.js/);
  assert.ok(html.indexOf('cases/mto.js') < html.indexOf('js/flowsheet-app.js'));
  const fuels = html.slice(html.indexOf('optgroup label="Fuels'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Fuels')));
  assert.match(fuels, /id="loadMto"/);
  assert.doesNotMatch(html.slice(html.indexOf('optgroup label="Innovative'), html.indexOf('optgroup label="Fuels')), /id="loadMto"/);
  assert.match(source, /'mto':\s*\(\)\s*=>\s*loadMto\(\)/);
  assert.match(uiTest, /cases\/mto\.js/);
  const pad = PROCESS_INTENSITIES.mto;
  assert.equal(pad.intensity, 3);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [1, 8]);
  assert.equal(pad.floorM2, 30);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
