const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createH2DriCase } = require('../cases/h2-dri');
const { createSiliconCase } = require('../cases/silicon');
const { createUreaCase } = require('../cases/urea');
const { createMaglutCase } = require('../cases/maglut');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function material(substance, mol, phase) {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

test('55.845 kg Fe (~1 kmol) consumes 0.5 kmol Fe2O3 + 1.5 kmol H2 + 0.7 kWh/kg and 1.5 kmol H2O', () => {
  const kg = SUBSTANCES.Fe.molarMassG;
  assert.equal(kg, 55.845);
  const result = UNITS['hydrogen-dri'].evaluate({
    inlets: {
      ironOre: material('Fe2O3', 2000, 'solid'),
      hydrogen: material('H2', 5000, 'gas'),
      electricity: { kind: 'electricity', kWh: 100 },
    },
    requestedActivity: kg,
    capacity: kg * 2,
  });
  assert.ok(Math.abs(result.activity - kg) < 1e-9, `activity ${result.activity}`);
  assert.ok(Math.abs(result.consumed.ironOre.mol.Fe2O3 - 500) < 1e-6);
  assert.ok(Math.abs(result.consumed.hydrogen.mol.H2 - 1500) < 1e-6);
  assert.ok(Math.abs(result.consumed.electricity.kWh - 0.7 * kg) < 1e-9);
  assert.ok(Math.abs(result.outlets.steel.mol.Fe - 1000) < 1e-6);
  assert.ok(Math.abs(result.outlets.water.mol.H2O - 1500) < 1e-6);
  assert.ok(Math.abs(streamMassKg(result.outlets.steel) - kg) < 1e-9);
});

test('TEA steel 0.40, iron-ore 0.10, hydrogen-feed 2.00, pack 800, demand 5e8 / asia-china 5e9; Al/Si/urea unchanged', () => {
  assert.equal(tea.prices.steel.value, 0.40);
  assert.equal(tea.prices.steel.quality, 'screening');
  assert.equal(tea.costs['iron-ore'].value, 0.10);
  assert.equal(tea.costs['iron-ore'].quality, 'screening');
  assert.equal(tea.costs['hydrogen-feed'].value, 2.00);
  assert.equal(tea.costs['hydrogen-feed'].quality, 'screening');
  assert.equal(tea.packs['hydrogen-dri'].capexIntensity, 800);
  assert.equal(tea.packs['hydrogen-dri'].intensityUnit, '$/(kg Fe/day)');
  assert.equal(tea.packs['hydrogen-dri'].fixedOmPercent, 4);
  assert.equal(tea.packs['hydrogen-dri'].variableOm, 0.03);
  assert.equal(tea.packs['hydrogen-dri'].assetLifeYears, 20);
  assert.equal(tea.packs['hydrogen-dri'].quality, 'screening');
  assert.equal(tea.packs['hydrogen-dri'].scaleExponent, null);
  assert.equal(tea.demand.steel.value, 5e8);
  assert.equal(tea.demand.steel.inherit, undefined);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('steel'));
  assert.ok(!tea.FUEL_CHEM_DEMAND_KEYS.includes('steel'));
  assert.equal(tea.getDemandForRegion('me-levant').steel.value, 5e8);
  assert.equal(tea.getDemandForRegion('chile-atacama').steel.value, 5e8);
  assert.equal(tea.getDemandForRegion('chile-atacama').steel.inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('Atacama/Chile').steel.value, 5e8);
  assert.equal(tea.getDemandForRegion('europe').steel.inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('asia-china').steel.value, 5e9);
  assert.equal(tea.getDemandForRegion('asia-china').steel.inherit, undefined);
  assert.equal(tea.prices.aluminium.value, 2.87);
  assert.equal(tea.prices.silicon.value, 3.97);
  assert.equal(tea.prices.urea.value, 0.40);
  assert.equal(tea.packs['aluminium-smelter'].capexIntensity, 1800);
  assert.equal(tea.packs['mg-si'].capexIntensity, 3000);
  assert.equal(tea.packs.urea.capexIntensity, 1200);
});

test('Mejillones H2-DRI demo ~1000 kg Fe/day with CAPEX on dri + solar and finite cash; Maglut/Si/urea unchanged', () => {
  const definition = createH2DriCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.dri.activity - 1000) / 1000 < 0.01, `Fe activity ${solved.nodes.dri.activity}`);
  assert.ok(!(solved.nodes.dri.limitedBy || []).includes('electricity'));
  const driNode = definition.graph.nodes.find(node => node.id === 'dri');
  const power = definition.graph.nodes.find(node => node.id === 'power');
  const driCapex = Number(driNode.economics.installedCapex) || Number(driNode.economics.capexRate) * Number(driNode.capacity || 0);
  const solarCapex = Number(power.economics.installedCapex) || Number(power.economics.capexRate) * Number(power.capacity || 0);
  assert.ok(driCapex > 0, `dri CAPEX ${driCapex}`);
  assert.ok(solarCapex > 0, `solar CAPEX ${solarCapex}`);
  assert.equal(power.economics.unitCost, undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'iron-ore').economics.unitCost, 0.10);
  assert.equal(definition.graph.nodes.find(node => node.id === 'hydrogen-feed').economics.unitCost, 2.00);
  assert.equal(definition.graph.nodes.find(node => node.id === 'steel').economics.unitPrice, 0.4);
  assert.equal(definition.graph.nodes.find(node => node.id === 'process-water').economics.disposition, 'vent');
  assert.equal(definition.site.latitude, -23.1);
  assert.equal(definition.site.longitude, -70.448);
  assert.equal(definition.site.region, 'Atacama/Chile');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.27);
  assert.equal(definition.site.rights.ironOrePurchase.status, 'assumed');
  assert.equal(definition.site.rights.hydrogenPurchase.status, 'assumed');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /not an electrolyzer/i);
  assert.match(definition.site.notes, /not Midrex/i);
  assert.match(definition.site.notes, /not bankable/i);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash}`);

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

test('Palette Crust lists hydrogen-dri after pv-module; Overview option mentions H₂-DRI / DRI', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Crust:\s*\[\s*'mg-si',\s*'polysilicon',\s*'bayer-alumina',\s*'aluminium-smelter',\s*'float-glass',\s*'cement',\s*'pv-module',\s*'hydrogen-dri',\s*'titanium-kroll'\s*\]/);
  assert.match(html, /id="loadH2Dri"/);
  assert.match(html, /Mejillones H₂-DRI \(purchased ore\+H₂\)/);
  assert.match(html, /cases\/h2-dri\.js/);
  assert.ok(html.indexOf('cases/h2-dri.js') < html.indexOf('js/flowsheet-app.js'));
  const materials = html.slice(html.indexOf('optgroup label="Materials"'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Materials"')));
  assert.match(materials, /id="loadH2Dri"/);
  assert.match(materials, /H₂-DRI|DRI/);
  assert.match(source, /'h2-dri':\s*\(\)\s*=>\s*loadH2Dri\(\)/);
  const pad = PROCESS_INTENSITIES['hydrogen-dri'];
  assert.equal(pad.intensity, 2);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [0.5, 8]);
  assert.equal(pad.floorM2, 40);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
