const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createCementCase } = require('../cases/cement');
const { createFloatGlassCase } = require('../cases/float-glass');
const { createH2DriCase } = require('../cases/h2-dri');
const { createUreaCase } = require('../cases/urea');
const { createMaglutCase } = require('../cases/maglut');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function material(substance, mol, phase) {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

test('1000 kg cement consumes 1183 limestone + 337 clay + 1.05 kWh/kg and 520 kg CO2', () => {
  const kg = 1000;
  const result = UNITS.cement.evaluate({
    inlets: {
      limestone: material('CaCO3', 20000, 'solid'),
      clay: material('SiO2', 10000, 'solid'),
      electricity: { kind: 'electricity', kWh: 10000 },
    },
    requestedActivity: kg,
    capacity: kg * 2,
  });
  assert.ok(Math.abs(result.activity - kg) < 1e-9, `activity ${result.activity}`);
  assert.ok(Math.abs(streamMassKg(result.consumed.limestone) - 1183) < 1e-6, `limestone ${streamMassKg(result.consumed.limestone)}`);
  assert.ok(Math.abs(streamMassKg(result.consumed.clay) - 337) < 1e-6, `clay ${streamMassKg(result.consumed.clay)}`);
  assert.ok(Math.abs(result.consumed.electricity.kWh - 1.05 * kg) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.outlets.cement) - kg) < 1e-6);
  assert.ok(Math.abs(streamMassKg(result.outlets.carbonDioxide) - 520) < 1e-6, `CO2 ${streamMassKg(result.outlets.carbonDioxide)}`);
  assert.equal(result.outlets.cement.mol.PortlandCement * SUBSTANCES.PortlandCement.molarMassG / 1000, streamMassKg(result.outlets.cement));
});

test('TEA cement sale 0.16, limestone 0.02, kiln-clay 0.02, pack 60; unrelated packs untouched', () => {
  assert.equal(tea.prices.cement.value, 0.16);
  assert.equal(tea.prices.cement.quality, 'screening');
  assert.equal(tea.costs.limestone.value, 0.02);
  assert.equal(tea.costs['kiln-clay'].value, 0.02);
  assert.equal(tea.costs['silica-sand'].value, 0.04);
  assert.equal(tea.costs['soda-ash'].value, 0.15);
  assert.equal(tea.packs.cement.capexIntensity, 60);
  assert.equal(tea.packs.cement.intensityUnit, '$/(kg cement/day)');
  assert.equal(tea.packs.cement.fixedOmPercent, 4);
  assert.equal(tea.packs.cement.variableOm, 0.03);
  assert.equal(tea.packs.cement.assetLifeYears, 20);
  assert.equal(tea.packs.cement.quality, 'screening');
  assert.equal(tea.packs.cement.scaleExponent, null);
  assert.equal(tea.packs.cement.capexIntensityBand.mid, 60);
  assert.equal(tea.demand.cement.value, 5e8);
  assert.equal(tea.demand.cement.inherit, undefined);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('cement'));
  assert.ok(!tea.FUEL_CHEM_DEMAND_KEYS.includes('cement'));
  assert.equal(tea.getDemandForRegion('me-levant').cement.value, 5e8);
  assert.equal(tea.getDemandForRegion('chile-atacama').cement.value, 5e8);
  assert.equal(tea.getDemandForRegion('chile-atacama').cement.inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('Atacama/Chile').cement.value, 5e8);
  assert.equal(tea.getDemandForRegion('europe').cement.inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('asia-china').cement.value, 5e9);
  assert.equal(tea.getDemandForRegion('asia-china').cement.inherit, undefined);
  assert.equal(tea.prices['float-glass'].value, 0.45);
  assert.equal(tea.packs['float-glass'].capexIntensity, 300);
  assert.equal(tea.packs.urea.capexIntensity, 1200);
  assert.equal(tea.packs['hydrogen-dri'].capexIntensity, 800);
  assert.equal(tea.packs['titanium-kroll'].capexIntensity, 8000);
});

test('Mejillones cement demo 1000 kg/day with CAPEX on line + solar and finite cash; Maglut/float-glass/H2-DRI/urea unchanged', () => {
  const definition = createCementCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.cement.activity - 1000) / 1000 < 0.01, `cement activity ${solved.nodes.cement.activity}`);
  assert.ok(!(solved.nodes.cement.limitedBy || []).includes('electricity'));
  const kiln = definition.graph.nodes.find(node => node.id === 'cement');
  const power = definition.graph.nodes.find(node => node.id === 'power');
  const kilnCapex = Number(kiln.economics.installedCapex) || Number(kiln.economics.capexRate) * Number(kiln.capacity || 0);
  const solarCapex = Number(power.economics.installedCapex) || Number(power.economics.capexRate) * Number(power.capacity || 0);
  assert.ok(kilnCapex > 0, `kiln CAPEX ${kilnCapex}`);
  assert.ok(solarCapex > 0, `solar CAPEX ${solarCapex}`);
  assert.equal(power.economics.unitCost, undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'limestone-feed').economics.unitCost, 0.02);
  assert.equal(definition.graph.nodes.find(node => node.id === 'clay-feed').economics.unitCost, 0.02);
  assert.equal(definition.graph.nodes.find(node => node.id === 'cement-product').economics.unitPrice, 0.16);
  assert.equal(definition.graph.nodes.find(node => node.id === 'process-co2').economics.disposition, 'vent');
  assert.equal(definition.site.latitude, -23.1);
  assert.equal(definition.site.longitude, -70.448);
  assert.equal(definition.site.region, 'Atacama/Chile');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.27);
  assert.equal(definition.site.rights.limestonePurchase.status, 'assumed');
  assert.equal(definition.site.rights.clayPurchase.status, 'assumed');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /clinker/i);
  assert.match(definition.site.notes, /heat-dominated/i);
  assert.match(definition.site.notes, /not bankable/i);
  assert.match(definition.site.notes, /gypsum/i);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash} installed=${cash.installedCapex}`);

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);

  const glass = createFloatGlassCase();
  const glassCash = evaluateEconomics(glass, solveOperation(glass));
  assert.ok(Number.isFinite(glassCash.annualNetCash), `float-glass annualNetCash=${glassCash.annualNetCash}`);
  assert.equal(glass.graph.nodes.find(node => node.id === 'glass').economics.unitPrice, 0.45);

  const h2dri = createH2DriCase();
  const h2driCash = evaluateEconomics(h2dri, solveOperation(h2dri));
  assert.ok(Number.isFinite(h2driCash.annualNetCash), `H2-DRI annualNetCash=${h2driCash.annualNetCash}`);

  const urea = createUreaCase();
  const ureaCash = evaluateEconomics(urea, solveOperation(urea));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash=${ureaCash.annualNetCash}`);
});

test('Palette Crust lists cement after float-glass; Overview option mentions cement', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Crust:\s*\[\s*'mg-si',\s*'polysilicon',\s*'bayer-alumina',\s*'aluminium-smelter',\s*'float-glass',\s*'cement',\s*'pv-module',\s*'hydrogen-dri',\s*'titanium-kroll'\s*\]/);
  assert.match(html, /id="loadCement"/);
  assert.match(html, /Mejillones cement \(limestone\+clay\)/);
  assert.match(html, /cases\/cement\.js/);
  assert.ok(html.indexOf('cases/cement.js') < html.indexOf('js/flowsheet-app.js'));
  const materials = html.slice(html.indexOf('optgroup label="Materials"'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Materials"')));
  assert.match(materials, /id="loadCement"/);
  assert.match(source, /cement:\s*\(\)\s*=>\s*loadCement\(\)/);
  const pad = PROCESS_INTENSITIES.cement;
  assert.equal(pad.intensity, 4);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [1, 12]);
  assert.equal(pad.floorM2, 40);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
