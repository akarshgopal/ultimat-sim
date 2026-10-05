const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createUreaCase } = require('../cases/urea');
const { createGreenAmmoniaCase } = require('../cases/green-ammonia');
const { createMaglutCase } = require('../cases/maglut');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function material(substance, mol, phase) {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

test('60.0553 kg urea (~1 kmol) consumes 2 kmol NH3 + 1 kmol CO2 + 0.8 kWh/kg and 1 kmol H2O', () => {
  const kg = SUBSTANCES.Urea.molarMassG;
  assert.equal(kg, 60.0553);
  const result = UNITS.urea.evaluate({
    inlets: {
      ammonia: material('NH3', 3000, 'liquid'),
      carbonDioxide: material('CO2', 2000, 'gas'),
      electricity: { kind: 'electricity', kWh: 100 },
    },
    requestedActivity: kg,
    capacity: kg * 2,
  });
  assert.ok(Math.abs(result.activity - kg) < 1e-9, `activity ${result.activity}`);
  assert.ok(Math.abs(result.consumed.ammonia.mol.NH3 - 2000) < 1e-6);
  assert.ok(Math.abs(result.consumed.carbonDioxide.mol.CO2 - 1000) < 1e-6);
  assert.ok(Math.abs(result.consumed.electricity.kWh - 0.8 * kg) < 1e-9);
  assert.ok(Math.abs(result.outlets.urea.mol.Urea - 1000) < 1e-6);
  assert.ok(Math.abs(result.outlets.water.mol.H2O - 1000) < 1e-6);
  assert.ok(Math.abs(streamMassKg(result.outlets.urea) - kg) < 1e-9);
});

test('TEA urea price 0.40, pack 1200, demand 5e7 / asia-china 5e8; ammonia pack/price unchanged', () => {
  assert.equal(tea.prices.urea.value, 0.40);
  assert.equal(tea.prices.urea.quality, 'screening');
  assert.equal(tea.packs.urea.capexIntensity, 1200);
  assert.equal(tea.packs.urea.intensityUnit, '$/(kg urea/day)');
  assert.equal(tea.packs.urea.fixedOmPercent, 4);
  assert.equal(tea.packs.urea.variableOm, 0.03);
  assert.equal(tea.packs.urea.assetLifeYears, 20);
  assert.equal(tea.packs.urea.quality, 'screening');
  assert.equal(tea.packs.urea.scaleExponent, null);
  assert.equal(tea.demand.urea.value, 5e7);
  assert.equal(tea.demand.urea.inherit, undefined);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('urea'));
  assert.ok(tea.FUEL_CHEM_DEMAND_KEYS.includes('urea'));
  assert.equal(tea.getDemandForRegion('me-levant').urea.value, 5e7);
  assert.equal(tea.getDemandForRegion('me-levant').urea.inherit, undefined);
  assert.equal(tea.getDemandForRegion('southern-africa').urea.value, 5e7);
  assert.equal(tea.getDemandForRegion('southern-africa').urea.inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('Southern Africa').urea.value, 5e7);
  assert.equal(tea.getDemandForRegion('asia-china').urea.value, 5e8);
  assert.equal(tea.getDemandForRegion('asia-china').urea.inherit, undefined);
  assert.equal(tea.getDemandForRegion('China / Tibet').urea.value, 5e8);
  assert.equal(tea.costs['ammonia-feed'].value, 0.45);
  assert.equal(tea.costs['co2-feed'].value, 0.05);
  assert.equal(tea.prices.ammonia.value, 0.45);
  assert.equal(tea.packs.ammonia.capexIntensity, 2000);
  assert.equal(tea.packs.ammonia.variableOm, 0.05);
});

test('Walvis urea demo ~1000 kg/day with CAPEX on urea + solar and finite cash; green NH3 and Maglut unchanged', () => {
  const definition = createUreaCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.urea.activity - 1000) / 1000 < 0.01, `urea activity ${solved.nodes.urea.activity}`);
  assert.ok(!(solved.nodes.urea.limitedBy || []).includes('electricity'));
  const ureaNode = definition.graph.nodes.find(node => node.id === 'urea');
  const power = definition.graph.nodes.find(node => node.id === 'power');
  const ureaCapex = Number(ureaNode.economics.installedCapex) || Number(ureaNode.economics.capexRate) * Number(ureaNode.capacity || 0);
  const solarCapex = Number(power.economics.installedCapex) || Number(power.economics.capexRate) * Number(power.capacity || 0);
  assert.ok(ureaCapex > 0, `urea CAPEX ${ureaCapex}`);
  assert.ok(solarCapex > 0, `solar CAPEX ${solarCapex}`);
  assert.equal(power.economics.unitCost, undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'ammonia-feed').economics.unitCost, 0.45);
  assert.equal(definition.graph.nodes.find(node => node.id === 'co2-feed').economics.unitCost, 0.05);
  assert.equal(definition.graph.nodes.find(node => node.id === 'urea-product').economics.unitPrice, 0.4);
  assert.equal(definition.graph.nodes.find(node => node.id === 'process-water').economics.disposition, 'vent');
  assert.equal(definition.site.latitude, -22.957);
  assert.equal(definition.site.longitude, 14.505);
  assert.equal(definition.site.region, 'Southern Africa');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.48);
  assert.equal(definition.site.rights.ammoniaPurchase.status, 'assumed');
  assert.equal(definition.site.rights.co2Purchase.status, 'assumed');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /not the green-NH/i);
  assert.match(definition.site.notes, /not bankable/i);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash}`);

  const green = createGreenAmmoniaCase();
  const greenSolved = solveOperation(green);
  assert.equal(greenSolved.convergence.converged, true);
  const greenCash = evaluateEconomics(green, greenSolved);
  assert.ok(Number.isFinite(greenCash.annualNetCash), `green NH3 annualNetCash=${greenCash.annualNetCash}`);

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
});

test('Palette Fuels lists urea after ammonia; Overview option mentions urea', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Fuels:\s*\[\s*'electrolyzer',\s*'sabatier',\s*'methanol',\s*'asu',\s*'ammonia',\s*'urea',\s*'mto',\s*'ft-liquids'\s*\]/);
  assert.match(html, /id="loadUrea"/);
  assert.match(html, /Walvis Bay urea \(purchased NH₃\+CO₂\)/);
  assert.match(html, /cases\/urea\.js/);
  assert.ok(html.indexOf('cases/urea.js') < html.indexOf('js/flowsheet-app.js'));
  const fuels = html.slice(html.indexOf('optgroup label="Fuels'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Fuels')));
  assert.match(fuels, /id="loadUrea"/);
  assert.match(source, /'urea':\s*\(\)\s*=>\s*loadUrea\(\)/);
  const pad = PROCESS_INTENSITIES.urea;
  assert.equal(pad.intensity, 3);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [1, 8]);
  assert.equal(pad.floorM2, 30);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
