const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createFloatGlassCase } = require('../cases/float-glass');
const { createH2DriCase } = require('../cases/h2-dri');
const { createSiliconCase } = require('../cases/silicon');
const { createUreaCase } = require('../cases/urea');
const { createMaglutCase } = require('../cases/maglut');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function material(substance, mol, phase) {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

test('1000 kg glass consumes 650 sand + 200 soda + 210 limestone + 2.5 kWh/kg and 60 kg CO2 remainder', () => {
  const kg = 1000;
  const result = UNITS['float-glass'].evaluate({
    inlets: {
      sand: material('SiO2', 20000, 'solid'),
      sodaAsh: material('Na2CO3', 5000, 'solid'),
      limestone: material('CaCO3', 5000, 'solid'),
      electricity: { kind: 'electricity', kWh: 10000 },
    },
    requestedActivity: kg,
    capacity: kg * 2,
  });
  assert.ok(Math.abs(result.activity - kg) < 1e-9, `activity ${result.activity}`);
  assert.ok(Math.abs(streamMassKg(result.consumed.sand) - 650) < 1e-6, `sand ${streamMassKg(result.consumed.sand)}`);
  assert.ok(Math.abs(streamMassKg(result.consumed.sodaAsh) - 200) < 1e-6, `soda ${streamMassKg(result.consumed.sodaAsh)}`);
  assert.ok(Math.abs(streamMassKg(result.consumed.limestone) - 210) < 1e-6, `limestone ${streamMassKg(result.consumed.limestone)}`);
  assert.ok(Math.abs(result.consumed.electricity.kWh - 2.5 * kg) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.outlets.glass) - kg) < 1e-6);
  assert.ok(Math.abs(streamMassKg(result.outlets.carbonDioxide) - 60) < 1e-6, `CO2 ${streamMassKg(result.outlets.carbonDioxide)}`);
  assert.equal(result.outlets.glass.mol.FloatGlass * SUBSTANCES.FloatGlass.molarMassG / 1000, streamMassKg(result.outlets.glass));
});

test('TEA float-glass sale 0.45, feeds 0.04/0.15/0.02, pack 300; pv-module glass purchase untouched', () => {
  assert.equal(tea.prices['float-glass'].value, 0.45);
  assert.equal(tea.prices['float-glass'].quality, 'screening');
  assert.equal(tea.costs['float-glass'].value, 0.45);
  assert.equal(tea.costs['silica-sand'].value, 0.04);
  assert.equal(tea.costs['soda-ash'].value, 0.15);
  assert.equal(tea.costs.limestone.value, 0.02);
  assert.equal(tea.costs.quartz.value, 0.08);
  assert.equal(tea.packs['float-glass'].capexIntensity, 300);
  assert.equal(tea.packs['float-glass'].intensityUnit, '$/(kg glass/day)');
  assert.equal(tea.packs['float-glass'].fixedOmPercent, 4);
  assert.equal(tea.packs['float-glass'].variableOm, 0.03);
  assert.equal(tea.packs['float-glass'].assetLifeYears, 20);
  assert.equal(tea.packs['float-glass'].quality, 'screening');
  assert.equal(tea.packs['float-glass'].scaleExponent, null);
  assert.equal(tea.demand['float-glass'].value, 5e7);
  assert.equal(tea.demand['float-glass'].inherit, undefined);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('float-glass'));
  assert.ok(!tea.FUEL_CHEM_DEMAND_KEYS.includes('float-glass'));
  assert.equal(tea.getDemandForRegion('me-levant')['float-glass'].value, 5e7);
  assert.equal(tea.getDemandForRegion('chile-atacama')['float-glass'].value, 5e7);
  assert.equal(tea.getDemandForRegion('chile-atacama')['float-glass'].inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('Atacama/Chile')['float-glass'].value, 5e7);
  assert.equal(tea.getDemandForRegion('europe')['float-glass'].inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('asia-china')['float-glass'].value, 5e8);
  assert.equal(tea.getDemandForRegion('asia-china')['float-glass'].inherit, undefined);
  assert.equal(tea.prices.steel.value, 0.40);
  assert.equal(tea.prices.aluminium.value, 2.87);
  assert.equal(tea.packs['pv-module'].capexIntensity, 700);
  assert.equal(tea.packs['hydrogen-dri'].capexIntensity, 800);
  assert.equal(tea.packs['aluminium-smelter'].capexIntensity, 1800);
});

test('Mejillones float-glass demo 1000 kg/day with CAPEX on line + solar and finite cash; Maglut/H2-DRI/Si/urea unchanged', () => {
  const definition = createFloatGlassCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes['float-glass'].activity - 1000) / 1000 < 0.01, `glass activity ${solved.nodes['float-glass'].activity}`);
  assert.ok(!(solved.nodes['float-glass'].limitedBy || []).includes('electricity'));
  const glassNode = definition.graph.nodes.find(node => node.id === 'float-glass');
  const power = definition.graph.nodes.find(node => node.id === 'power');
  const glassCapex = Number(glassNode.economics.installedCapex) || Number(glassNode.economics.capexRate) * Number(glassNode.capacity || 0);
  const solarCapex = Number(power.economics.installedCapex) || Number(power.economics.capexRate) * Number(power.capacity || 0);
  assert.ok(glassCapex > 0, `glass CAPEX ${glassCapex}`);
  assert.ok(solarCapex > 0, `solar CAPEX ${solarCapex}`);
  assert.equal(power.economics.unitCost, undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'sand-feed').economics.unitCost, 0.04);
  assert.equal(definition.graph.nodes.find(node => node.id === 'soda-feed').economics.unitCost, 0.15);
  assert.equal(definition.graph.nodes.find(node => node.id === 'limestone-feed').economics.unitCost, 0.02);
  assert.equal(definition.graph.nodes.find(node => node.id === 'glass').economics.unitPrice, 0.45);
  assert.equal(definition.graph.nodes.find(node => node.id === 'process-co2').economics.disposition, 'vent');
  assert.equal(definition.site.latitude, -23.1);
  assert.equal(definition.site.longitude, -70.448);
  assert.equal(definition.site.region, 'Atacama/Chile');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.27);
  assert.equal(definition.site.rights.sandPurchase.status, 'assumed');
  assert.equal(definition.site.rights.sodaPurchase.status, 'assumed');
  assert.equal(definition.site.rights.limestonePurchase.status, 'assumed');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /not a full float line/i);
  assert.match(definition.site.notes, /heat-dominated/i);
  assert.match(definition.site.notes, /not bankable/i);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash} installed=${cash.installedCapex}`);

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);

  const h2dri = createH2DriCase();
  const h2driCash = evaluateEconomics(h2dri, solveOperation(h2dri));
  assert.ok(Number.isFinite(h2driCash.annualNetCash), `H2-DRI annualNetCash=${h2driCash.annualNetCash}`);

  const silicon = createSiliconCase();
  const siliconCash = evaluateEconomics(silicon, solveOperation(silicon));
  assert.ok(Number.isFinite(siliconCash.annualNetCash), `silicon annualNetCash=${siliconCash.annualNetCash}`);
  assert.equal(silicon.graph.nodes.find(node => node.id === 'glass').economics.unitCost, 0.45);

  const urea = createUreaCase();
  const ureaCash = evaluateEconomics(urea, solveOperation(urea));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash=${ureaCash.annualNetCash}`);
});

test('Palette Crust lists float-glass after aluminium-smelter; Overview option mentions float glass', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Crust:\s*\[\s*'mg-si',\s*'polysilicon',\s*'bayer-alumina',\s*'aluminium-smelter',\s*'float-glass',\s*'cement',\s*'pv-module',\s*'hydrogen-dri',\s*'titanium-kroll'\s*\]/);
  assert.match(html, /id="loadFloatGlass"/);
  assert.match(html, /Mejillones float glass \(sand\+soda\+limestone\)/);
  assert.match(html, /cases\/float-glass\.js/);
  assert.ok(html.indexOf('cases/float-glass.js') < html.indexOf('js/flowsheet-app.js'));
  const materials = html.slice(html.indexOf('optgroup label="Materials"'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Materials"')));
  assert.match(materials, /id="loadFloatGlass"/);
  assert.match(source, /'float-glass':\s*\(\)\s*=>\s*loadFloatGlass\(\)/);
  const pad = PROCESS_INTENSITIES['float-glass'];
  assert.equal(pad.intensity, 4);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [1, 12]);
  assert.equal(pad.floorM2, 40);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
