const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createFtLiquidsCase } = require('../cases/ft-liquids');
const { createMtoCase } = require('../cases/mto');
const { createUreaCase } = require('../cases/urea');
const { createMaglutCase } = require('../cases/maglut');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function material(substance, mol, phase) {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

test('170.33484 kg diesel (~1 kmol C12H26) consumes 37 kmol H2 + 12 kmol CO2 + 0.22 kWh/kg and 24 kmol H2O', () => {
  const kg = SUBSTANCES.C12H26.molarMassG;
  assert.equal(kg, 170.33484);
  assert.deepEqual(SUBSTANCES.C12H26.elements, { C: 12, H: 26 });
  const result = UNITS['ft-liquids'].evaluate({
    inlets: {
      hydrogen: material('H2', 50000, 'gas'),
      co2: material('CO2', 20000, 'gas'),
      electricity: { kind: 'electricity', kWh: 100 },
    },
    requestedActivity: kg,
    capacity: kg * 2,
  });
  assert.ok(Math.abs(result.activity - kg) < 1e-9, `activity ${result.activity}`);
  assert.ok(Math.abs(result.consumed.hydrogen.mol.H2 - 37000) < 1e-6);
  assert.ok(Math.abs(result.consumed.co2.mol.CO2 - 12000) < 1e-6);
  assert.ok(Math.abs(result.consumed.electricity.kWh - 0.22 * kg) < 1e-9);
  assert.ok(Math.abs(result.outlets.diesel.mol.C12H26 - 1000) < 1e-6);
  assert.ok(Math.abs(result.outlets.water.mol.H2O - 24000) < 1e-6);
  const massIn = streamMassKg(result.consumed.hydrogen) + streamMassKg(result.consumed.co2);
  const massOut = streamMassKg(result.outlets.diesel) + streamMassKg(result.outlets.water);
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
  add(balance, atoms(result.consumed.hydrogen.mol.H2, SUBSTANCES.H2.elements), 1);
  add(balance, atoms(result.consumed.co2.mol.CO2, SUBSTANCES.CO2.elements), 1);
  add(balance, atoms(result.outlets.diesel.mol.C12H26, SUBSTANCES.C12H26.elements), -1);
  add(balance, atoms(result.outlets.water.mol.H2O, SUBSTANCES.H2O.elements), -1);
  for (const [el, n] of Object.entries(balance)) {
    assert.ok(Math.abs(n) < 1e-9, `${el} imbalance ${n}`);
  }
});

test('TEA diesel 0.90, H2-feed 2.00, CO2-feed 0.05, pack 443, demand 1e8 / asia-china 1e9; MTO/urea/Maglut packs untouched', () => {
  assert.equal(tea.prices.diesel.value, 0.90);
  assert.equal(tea.prices.diesel.quality, 'screening');
  assert.equal(tea.costs['hydrogen-feed'].value, 2.00);
  assert.equal(tea.costs['co2-feed'].value, 0.05);
  assert.equal(tea.packs['ft-liquids'].capexIntensity, 443);
  assert.equal(tea.packs['ft-liquids'].intensityUnit, '$/(kg liquid/day)');
  assert.equal(tea.packs['ft-liquids'].fixedOmPercent, 4);
  assert.equal(tea.packs['ft-liquids'].variableOm, 0.03);
  assert.equal(tea.packs['ft-liquids'].assetLifeYears, 20);
  assert.equal(tea.packs['ft-liquids'].quality, 'screening');
  assert.equal(tea.packs['ft-liquids'].scaleExponent, null);
  assert.equal(tea.demand.diesel.value, 1e8);
  assert.equal(tea.demand.diesel.inherit, undefined);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('diesel'));
  assert.ok(tea.FUEL_CHEM_DEMAND_KEYS.includes('diesel'));
  assert.equal(tea.getDemandForRegion('me-levant').diesel.value, 1e8);
  assert.equal(tea.getDemandForRegion('chile-atacama').diesel.value, 1e8);
  assert.equal(tea.getDemandForRegion('Atacama/Chile').diesel.value, 1e8);
  assert.equal(tea.getDemandForRegion('asia-china').diesel.value, 1e9);
  assert.equal(tea.getDemandForRegion('asia-china').diesel.inherit, undefined);
  assert.equal(tea.packs.mto.capexIntensity, 183);
  assert.equal(tea.packs.urea.capexIntensity, 1200);
  assert.equal(tea.packs['ree-chromatography'].capexIntensity, 27375);
  assert.equal(tea.prices.ethylene.value, 0.80);
  assert.equal(tea.prices.urea.value, 0.40);
});

test('Mejillones FT liquids demo ~1000 kg diesel/day with CAPEX on ft-liquids + solar and finite cash−; MTO/urea/Maglut unchanged', () => {
  const definition = createFtLiquidsCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes['ft-liquids'].activity - 1000) / 1000 < 0.01, `ft activity ${solved.nodes['ft-liquids'].activity}`);
  assert.ok(!(solved.nodes['ft-liquids'].limitedBy || []).includes('electricity'));
  const ftNode = definition.graph.nodes.find(node => node.id === 'ft-liquids');
  const power = definition.graph.nodes.find(node => node.id === 'power');
  const ftCapex = Number(ftNode.economics.installedCapex) || Number(ftNode.economics.capexRate) * Number(ftNode.capacity || 0);
  const solarCapex = Number(power.economics.installedCapex) || Number(power.economics.capexRate) * Number(power.capacity || 0);
  assert.ok(ftCapex > 0, `ft CAPEX ${ftCapex}`);
  assert.ok(solarCapex > 0, `solar CAPEX ${solarCapex}`);
  assert.equal(power.economics.unitCost, undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'hydrogen-feed').economics.unitCost, 2);
  assert.equal(definition.graph.nodes.find(node => node.id === 'co2-feed').economics.unitCost, 0.05);
  assert.equal(definition.graph.nodes.find(node => node.id === 'diesel-product').economics.gateUnitPrice, 0.9);
  assert.equal(definition.graph.nodes.find(node => node.id === 'diesel-product').economics.unitPrice, 0.9 - 0.08);
  assert.equal(definition.graph.nodes.find(node => node.id === 'diesel-product').economics.freightId, 'chile-coast-container');
  assert.equal(definition.graph.nodes.find(node => node.id === 'process-water').economics.disposition, 'vent');
  assert.equal(definition.site.id, 'chile-mejillones-ft-liquids');
  assert.equal(definition.site.latitude, -23.1);
  assert.equal(definition.site.longitude, -70.448);
  assert.equal(definition.site.region, 'Atacama/Chile');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.27);
  assert.equal(definition.site.rights.hydrogenPurchase.status, 'assumed');
  assert.equal(definition.site.rights.co2Purchase.status, 'assumed');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /not a green e-diesel/i);
  assert.match(definition.site.notes, /RWGS/i);
  assert.match(definition.site.notes, /not bankable/i);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(cash.annualNetCash < 0, `expected cash−, got ${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash}`);

  const mto = createMtoCase();
  const mtoCash = evaluateEconomics(mto, solveOperation(mto));
  assert.ok(Number.isFinite(mtoCash.annualNetCash), `MTO annualNetCash=${mtoCash.annualNetCash}`);

  const urea = createUreaCase();
  const ureaCash = evaluateEconomics(urea, solveOperation(urea));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash=${ureaCash.annualNetCash}`);

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('Palette Fuels lists ft-liquids after mto; Overview option mentions FT; flowsheet-ui script list includes cases/ft-liquids.js', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const uiTest = fs.readFileSync(path.join(__dirname, 'flowsheet-ui.test.js'), 'utf8');
  assert.match(source, /Fuels:\s*\[\s*'electrolyzer',\s*'sabatier',\s*'methanol',\s*'asu',\s*'ammonia',\s*'urea',\s*'mto',\s*'ft-liquids'\s*\]/);
  assert.match(html, /id="loadFtLiquids"/);
  assert.match(html, /Mejillones FT liquids \(purchased H₂\+CO₂→diesel\)/);
  assert.match(html, /cases\/ft-liquids\.js/);
  assert.ok(html.indexOf('cases/ft-liquids.js') < html.indexOf('js/flowsheet-app.js'));
  const fuels = html.slice(html.indexOf('optgroup label="Fuels'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Fuels')));
  assert.match(fuels, /id="loadFtLiquids"/);
  assert.ok(fuels.indexOf('id="loadMto"') < fuels.indexOf('id="loadFtLiquids"'));
  assert.doesNotMatch(html.slice(html.indexOf('optgroup label="Innovative'), html.indexOf('optgroup label="Fuels')), /id="loadFtLiquids"/);
  assert.match(source, /'ft-liquids':\s*\(\)\s*=>\s*loadFtLiquids\(\)/);
  assert.match(uiTest, /cases\/ft-liquids\.js/);
  const pad = PROCESS_INTENSITIES['ft-liquids'];
  assert.equal(pad.intensity, 3);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [1, 8]);
  assert.equal(pad.floorM2, 30);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
