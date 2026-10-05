const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createCuEwCase } = require('../cases/cu-ew');
const { createCementCase } = require('../cases/cement');
const { createFloatGlassCase } = require('../cases/float-glass');
const { createH2DriCase } = require('../cases/h2-dri');
const { createUreaCase } = require('../cases/urea');
const { createMaglutCase } = require('../cases/maglut');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function material(substance, mol, phase) {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

test('1000 kg cathode consumes 1000 kg PLS Cu + 2.2 kWh/kg; extra mol throws', () => {
  const kg = 1000;
  const result = UNITS['copper-ew'].evaluate({
    inlets: {
      pls: material('Cu', 20000, 'liquid'),
      electricity: { kind: 'electricity', kWh: 10000 },
    },
    requestedActivity: kg,
    capacity: kg * 2,
  });
  assert.ok(Math.abs(result.activity - kg) < 1e-9, `activity ${result.activity}`);
  assert.ok(Math.abs(streamMassKg(result.consumed.pls) - kg) < 1e-6, `pls ${streamMassKg(result.consumed.pls)}`);
  assert.ok(Math.abs(result.consumed.electricity.kWh - 2.2 * kg) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.outlets.cathode) - kg) < 1e-6);
  assert.equal(result.outlets.cathode.phase, 'solid');
  assert.equal(result.outlets.cathode.mol.Cu * SUBSTANCES.Cu.molarMassG / 1000, streamMassKg(result.outlets.cathode));
  assert.equal(result.outlets.wasteHeat, undefined);
  assert.equal(UNITS['copper-ew'].ports.wasteHeat, undefined);
  assert.equal(UNITS['copper-ew'].ports.pls.direction, 'in');
  assert.equal(UNITS['copper-ew'].ports.cathode.direction, 'out');

  assert.throws(() => UNITS['copper-ew'].evaluate({
    inlets: {
      pls: { kind: 'material', mol: { Cu: 20000, H2O: 1 }, phase: 'liquid', T_C: 25, P_bar: 1 },
      electricity: { kind: 'electricity', kWh: 10000 },
    },
    requestedActivity: kg,
    capacity: kg * 2,
  }));
});

test('TEA copper-cathode 9.70, pls-copper 9.36, pack 750; unrelated packs untouched', () => {
  assert.equal(tea.prices['copper-cathode'].value, 9.70);
  assert.equal(tea.prices['copper-cathode'].quality, 'screening');
  assert.equal(tea.costs['pls-copper'].value, 9.36);
  assert.equal(tea.costs['pls-copper'].quality, 'screening');
  assert.equal(tea.costs['soda-ash'].value, 0.15);
  assert.equal(tea.packs['copper-ew'].capexIntensity, 750);
  assert.equal(tea.packs['copper-ew'].intensityUnit, '$/(kg Cu/day)');
  assert.equal(tea.packs['copper-ew'].fixedOmPercent, 4);
  assert.equal(tea.packs['copper-ew'].variableOm, 0.03);
  assert.equal(tea.packs['copper-ew'].assetLifeYears, 20);
  assert.equal(tea.packs['copper-ew'].quality, 'screening');
  assert.equal(tea.packs['copper-ew'].scaleExponent, null);
  assert.equal(tea.packs['copper-ew'].capexIntensityBand.low, 600);
  assert.equal(tea.packs['copper-ew'].capexIntensityBand.mid, 750);
  assert.equal(tea.packs['copper-ew'].capexIntensityBand.high, 900);
  assert.equal(tea.demand['copper-cathode'].value, 5e7);
  assert.equal(tea.demand['copper-cathode'].inherit, undefined);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('copper-cathode'));
  assert.ok(!tea.FUEL_CHEM_DEMAND_KEYS.includes('copper-cathode'));
  assert.equal(tea.getDemandForRegion('me-levant')['copper-cathode'].value, 5e7);
  assert.equal(tea.getDemandForRegion('chile-atacama')['copper-cathode'].value, 5e7);
  assert.equal(tea.getDemandForRegion('chile-atacama')['copper-cathode'].inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('Atacama/Chile')['copper-cathode'].value, 5e7);
  assert.equal(tea.getDemandForRegion('europe')['copper-cathode'].inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('asia-china')['copper-cathode'].value, 5e8);
  assert.equal(tea.getDemandForRegion('asia-china')['copper-cathode'].inherit, undefined);
  assert.equal(tea.packs.cement.capexIntensity, 60);
  assert.equal(tea.packs['float-glass'].capexIntensity, 300);
  assert.equal(tea.prices.cement.value, 0.16);
  assert.equal(tea.prices['float-glass'].value, 0.45);
});

test('Mejillones copper SX-EW demo 1000 kg/day with Chile 1.05 CAPEX + solar and finite cash; Maglut unchanged', () => {
  const definition = createCuEwCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes['copper-ew'].activity - 1000) / 1000 < 0.01, `cathode activity ${solved.nodes['copper-ew'].activity}`);
  assert.ok(!(solved.nodes['copper-ew'].limitedBy || []).includes('electricity'));
  const tankhouse = definition.graph.nodes.find(node => node.id === 'copper-ew');
  const power = definition.graph.nodes.find(node => node.id === 'power');
  const ewCapex = Number(tankhouse.economics.installedCapex) || Number(tankhouse.economics.capexRate) * Number(tankhouse.capacity || 0);
  const solarCapex = Number(power.economics.installedCapex) || Number(power.economics.capexRate) * Number(power.capacity || 0);
  assert.ok(Math.abs(ewCapex - 750 * 1.05 * 1000) < 1, `Chile CAPEX× 1.05 tankhouse ${ewCapex}`);
  assert.ok(solarCapex > 0, `solar CAPEX ${solarCapex}`);
  assert.equal(power.economics.unitCost, undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'pls-feed').economics.unitCost, 9.36);
  assert.equal(definition.graph.nodes.find(node => node.id === 'cathode-product').economics.unitPrice, 9.70);
  assert.equal(definition.site.latitude, -23.1);
  assert.equal(definition.site.longitude, -70.448);
  assert.equal(definition.site.region, 'Atacama/Chile');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.27);
  assert.equal(definition.site.rights.plsPurchase.status, 'assumed');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /heap/i);
  assert.match(definition.site.notes, /not bankable/i);
  assert.match(definition.site.notes, /SX-EW/i);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash} installed=${cash.installedCapex}`);

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);

  const cement = createCementCase();
  const cementCash = evaluateEconomics(cement, solveOperation(cement));
  assert.ok(Number.isFinite(cementCash.annualNetCash), `cement annualNetCash=${cementCash.annualNetCash}`);
  assert.equal(cement.graph.nodes.find(node => node.id === 'cement-product').economics.unitPrice, 0.16);

  const glass = createFloatGlassCase();
  const glassCash = evaluateEconomics(glass, solveOperation(glass));
  assert.ok(Number.isFinite(glassCash.annualNetCash), `float-glass annualNetCash=${glassCash.annualNetCash}`);

  const h2dri = createH2DriCase();
  const h2driCash = evaluateEconomics(h2dri, solveOperation(h2dri));
  assert.ok(Number.isFinite(h2driCash.annualNetCash), `H2-DRI annualNetCash=${h2driCash.annualNetCash}`);

  const urea = createUreaCase();
  const ureaCash = evaluateEconomics(urea, solveOperation(urea));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash=${ureaCash.annualNetCash}`);
});

test('Palette Crust lists copper-ew after titanium-kroll; Overview option mentions copper SX-EW', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Crust:\s*\[\s*'mg-si',\s*'polysilicon',\s*'bayer-alumina',\s*'aluminium-smelter',\s*'float-glass',\s*'cement',\s*'pv-module',\s*'hydrogen-dri',\s*'titanium-kroll',\s*'copper-ew'\s*\]/);
  assert.match(html, /id="loadCuEw"/);
  assert.match(html, /Mejillones copper SX-EW \(purchased PLS\)/);
  assert.match(html, /cases\/cu-ew\.js/);
  assert.ok(html.indexOf('cases/cu-ew.js') < html.indexOf('js/flowsheet-app.js'));
  const materials = html.slice(html.indexOf('optgroup label="Materials"'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Materials"')));
  assert.match(materials, /id="loadCuEw"/);
  assert.match(source, /'cu-ew':\s*\(\)\s*=>\s*loadCuEw\(\)/);
  const pad = PROCESS_INTENSITIES['copper-ew'];
  assert.equal(pad.intensity, 4);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [1, 12]);
  assert.equal(pad.floorM2, 40);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
