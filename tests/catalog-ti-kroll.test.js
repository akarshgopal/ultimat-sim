const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createTiKrollCase } = require('../cases/ti-kroll');
const { createH2DriCase } = require('../cases/h2-dri');
const { createSiliconCase } = require('../cases/silicon');
const { createUreaCase } = require('../cases/urea');
const { createMaglutCase } = require('../cases/maglut');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

function material(substance, mol, phase) {
  return { kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 };
}

test('47.867 kg Ti (~1 kmol) consumes 1 kmol TiCl4 + 2 kmol Mg + 8 kWh/kg and 2 kmol MgCl2', () => {
  const kg = SUBSTANCES.Ti.molarMassG;
  assert.equal(kg, 47.867);
  const result = UNITS['titanium-kroll'].evaluate({
    inlets: {
      titaniumTetrachloride: material('TiCl4', 2000, 'liquid'),
      magnesium: material('Mg', 5000, 'solid'),
      electricity: { kind: 'electricity', kWh: 1000 },
    },
    requestedActivity: kg,
    capacity: kg * 2,
  });
  assert.ok(Math.abs(result.activity - kg) < 1e-9, `activity ${result.activity}`);
  assert.ok(Math.abs(result.consumed.titaniumTetrachloride.mol.TiCl4 - 1000) < 1e-6);
  assert.ok(Math.abs(result.consumed.magnesium.mol.Mg - 2000) < 1e-6);
  assert.ok(Math.abs(result.consumed.electricity.kWh - 8 * kg) < 1e-9);
  assert.ok(Math.abs(result.outlets.titanium.mol.Ti - 1000) < 1e-6);
  assert.ok(Math.abs(result.outlets.magnesiumChloride.mol.MgCl2 - 2000) < 1e-6);
  assert.ok(Math.abs(streamMassKg(result.outlets.titanium) - kg) < 1e-9);
});

test('TEA titanium 8.00, TiCl4 1.50, magnesium-metal 2.50, pack 8000; brine Mg 0.08; steel/Al unchanged', () => {
  assert.equal(tea.prices.titanium.value, 8.00);
  assert.equal(tea.prices.titanium.quality, 'screening');
  const ticl4 = tea.costs['ticl4-feed'] || tea.costs['titanium-tetrachloride'];
  assert.ok(ticl4, 'ticl4-feed or titanium-tetrachloride cost');
  assert.equal(ticl4.value, 1.50);
  assert.equal(ticl4.quality, 'screening');
  assert.equal(tea.costs['titanium-tetrachloride'].value, 1.50);
  assert.equal(tea.costs['ticl4-feed'].value, 1.50);
  assert.equal(tea.costs['magnesium-metal'].value, 2.50);
  assert.equal(tea.costs['magnesium-metal'].quality, 'screening');
  assert.match(tea.costs['magnesium-metal'].note, /not the brine/i);
  assert.equal(tea.prices.magnesium.value, 0.08);
  assert.equal(tea.packs['titanium-kroll'].capexIntensity, 8000);
  assert.equal(tea.packs['titanium-kroll'].intensityUnit, '$/(kg Ti/day)');
  assert.equal(tea.packs['titanium-kroll'].fixedOmPercent, 4);
  assert.equal(tea.packs['titanium-kroll'].variableOm, 0.04);
  assert.equal(tea.packs['titanium-kroll'].assetLifeYears, 20);
  assert.equal(tea.packs['titanium-kroll'].quality, 'screening');
  assert.equal(tea.packs['titanium-kroll'].scaleExponent, null);
  assert.equal(tea.demand.titanium.value, 2e7);
  assert.equal(tea.demand.titanium.inherit, undefined);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('titanium'));
  assert.ok(!tea.FUEL_CHEM_DEMAND_KEYS.includes('titanium'));
  assert.equal(tea.getDemandForRegion('me-levant').titanium.value, 2e7);
  assert.equal(tea.getDemandForRegion('chile-atacama').titanium.value, 2e7);
  assert.equal(tea.getDemandForRegion('chile-atacama').titanium.inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('Atacama/Chile').titanium.value, 2e7);
  assert.equal(tea.getDemandForRegion('europe').titanium.inherit, 'me-levant');
  assert.equal(tea.getDemandForRegion('asia-china').titanium.value, 1e8);
  assert.equal(tea.getDemandForRegion('asia-china').titanium.inherit, undefined);
  assert.equal(tea.prices.steel.value, 0.40);
  assert.equal(tea.prices.aluminium.value, 2.87);
  assert.equal(tea.packs['hydrogen-dri'].capexIntensity, 800);
  assert.equal(tea.packs['aluminium-smelter'].capexIntensity, 1800);
});

test('Mejillones Ti Kroll demo ~100 kg Ti/day with CAPEX on kroll + solar and finite cash; Maglut/H2-DRI/Si/urea unchanged', () => {
  const definition = createTiKrollCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(Math.abs(solved.nodes.kroll.activity - 100) / 100 < 0.01, `Ti activity ${solved.nodes.kroll.activity}`);
  assert.ok(!(solved.nodes.kroll.limitedBy || []).includes('electricity'));
  const krollNode = definition.graph.nodes.find(node => node.id === 'kroll');
  const power = definition.graph.nodes.find(node => node.id === 'power');
  const krollCapex = Number(krollNode.economics.installedCapex) || Number(krollNode.economics.capexRate) * Number(krollNode.capacity || 0);
  const solarCapex = Number(power.economics.installedCapex) || Number(power.economics.capexRate) * Number(power.capacity || 0);
  assert.ok(krollCapex > 0, `kroll CAPEX ${krollCapex}`);
  assert.ok(solarCapex > 0, `solar CAPEX ${solarCapex}`);
  assert.equal(power.economics.unitCost, undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'ticl4-feed').economics.unitCost, 1.50);
  assert.equal(definition.graph.nodes.find(node => node.id === 'magnesium-feed').economics.unitCost, 2.50);
  assert.equal(definition.graph.nodes.find(node => node.id === 'titanium').economics.unitPrice, 8);
  assert.equal(definition.graph.nodes.find(node => node.id === 'magnesium-chloride').economics.disposition, 'vent');
  assert.equal(definition.site.latitude, -23.1);
  assert.equal(definition.site.longitude, -70.448);
  assert.equal(definition.site.region, 'Atacama/Chile');
  assert.equal(definition.site.dailyPVKWhPerKWp, 5.27);
  assert.equal(definition.site.rights.ticl4Purchase.status, 'assumed');
  assert.equal(definition.site.rights.magnesiumPurchase.status, 'assumed');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.match(definition.site.notes, /not a chloride rutile/i);
  assert.match(definition.site.notes, /not an Mg recycle/i);
  assert.match(definition.site.notes, /not bankable/i);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash=${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualOperatingCost));
  assert.ok(Number.isFinite(cash.annualizedCapex));
  assert.ok(true, `cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} annCAPEX=${cash.annualizedCapex} net=${cash.annualNetCash}`);

  const maglut = createMaglutCase();
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);

  const h2dri = createH2DriCase();
  const h2driCash = evaluateEconomics(h2dri, solveOperation(h2dri));
  assert.ok(Number.isFinite(h2driCash.annualNetCash), `H2-DRI annualNetCash=${h2driCash.annualNetCash}`);

  const silicon = createSiliconCase();
  const siliconCash = evaluateEconomics(silicon, solveOperation(silicon));
  assert.ok(Number.isFinite(siliconCash.annualNetCash), `silicon annualNetCash=${siliconCash.annualNetCash}`);

  const urea = createUreaCase();
  const ureaCash = evaluateEconomics(urea, solveOperation(urea));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash=${ureaCash.annualNetCash}`);
});

test('Palette Crust lists titanium-kroll after hydrogen-dri; Overview option mentions Kroll / Ti', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Crust:\s*\[\s*'mg-si',\s*'polysilicon',\s*'bayer-alumina',\s*'aluminium-smelter',\s*'pv-module',\s*'hydrogen-dri',\s*'titanium-kroll'\s*\]/);
  assert.match(html, /id="loadTiKroll"/);
  assert.match(html, /Mejillones Ti Kroll \(purchased TiCl₄\+Mg\)/);
  assert.match(html, /cases\/ti-kroll\.js/);
  assert.ok(html.indexOf('cases/ti-kroll.js') < html.indexOf('js/flowsheet-app.js'));
  const materials = html.slice(html.indexOf('optgroup label="Materials"'), html.indexOf('</optgroup>', html.indexOf('optgroup label="Materials"')));
  assert.match(materials, /id="loadTiKroll"/);
  assert.match(materials, /Kroll|Ti/);
  assert.match(source, /'ti-kroll':\s*\(\)\s*=>\s*loadTiKroll\(\)/);
  const pad = PROCESS_INTENSITIES['titanium-kroll'];
  assert.equal(pad.intensity, 8);
  assert.equal(pad.quality, 'screening');
  assert.deepEqual([...pad.range], [2, 20]);
  assert.equal(pad.floorM2, 40);
  assert.ok(pad.evidence.every(item => /^https:\/\//.test(item.url)));
});
