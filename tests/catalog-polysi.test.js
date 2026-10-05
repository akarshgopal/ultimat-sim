const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createSiliconCase } = require('../cases/silicon');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

test('polysilicon Siemens-style upgrade closes Si mass at 1.05 feed and 65 kWh/kg', () => {
  const result = UNITS.polysilicon.evaluate({
    inlets: {
      silicon: { kind: 'material', mol: { Si: 10000 }, phase: 'solid', T_C: 25, P_bar: 1 },
      electricity: { kind: 'electricity', kWh: 1e6 },
    },
    requestedActivity: 10,
    capacity: 100,
  });
  assert.equal(result.activity, 10);
  assert.equal(result.consumed.electricity.kWh, 650);
  assert.ok(Math.abs(streamMassKg(result.consumed.silicon) - 10.5) < 1e-9);
  assert.ok(Math.abs(streamMassKg(result.outlets.polysilicon) - 10) < 1e-9);
  assert.equal(result.outlets.wasteHeat, undefined);
  assert.equal(UNITS.polysilicon.ports.wasteHeat, undefined);
  assert.equal(UNITS.polysilicon.ports.hydrogen, undefined);
  assert.ok(UNITS.polysilicon.ports.silicon.direction === 'in');
  assert.ok(UNITS.polysilicon.ports.electricity.direction === 'in');
  assert.ok(UNITS.polysilicon.ports.polysilicon.direction === 'out');
});

test('TEA polysilicon price, pack, and demand', () => {
  assert.equal(tea.prices.polysilicon.value, 6);
  assert.equal(tea.prices.polysilicon.quality, 'screening');
  assert.ok(tea.prices.polysilicon.evidence.some(item => /nrel\.gov/i.test(item.url || '')));
  assert.equal(tea.packs.polysilicon.capexIntensity, 31755);
  assert.equal(tea.packs.polysilicon.fixedOmPercent, 4);
  assert.equal(tea.packs.polysilicon.variableOm, 0.03);
  assert.equal(tea.packs.polysilicon.assetLifeYears, 20);
  assert.equal(tea.packs.polysilicon.quality, 'screening');
  assert.equal(tea.demand.polysilicon.value, 2e6);
  assert.equal(tea.demand.polysilicon.quality, 'screening');
  assert.equal(tea.demandByRegion['asia-china'].polysilicon.value, 2e8);
  const europe = tea.demandByRegion.europe;
  assert.equal(europe.polysilicon.inherit, 'me-levant');
  assert.equal(europe.polysilicon.value, 2e6);
  const chile = tea.demandByRegion['chile-atacama'];
  assert.equal(chile.polysilicon.inherit, 'me-levant');
  assert.equal(chile.polysilicon.value, 2e6);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('polysilicon'));
  assert.equal(tea.prices.silicon.value, 3.97);
  assert.notEqual(tea.prices.polysilicon.value, tea.prices.silicon.value);
});

test('Mejillones poly-Si island still solves with module assembly and no MG-Si sale', () => {
  const definition = createSiliconCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(solved.nodes.polysilicon.activity > 0);
  assert.ok(solved.nodes['mg-si'].activity > 0);
  const limited = [
    ...(solved.nodes.polysilicon.limitedBy || []),
    ...(solved.nodes['mg-si'].limitedBy || []),
    ...(solved.warnings || []),
  ].join(' ');
  assert.doesNotMatch(limited, /electricity/i);
  assert.equal(definition.graph.nodes.find(node => node.id === 'silicon'), undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'poly-silicon'), undefined);
  const furnaceCapex = id => {
    const node = definition.graph.nodes.find(item => item.id === id);
    return Number(node.economics.installedCapex) || Number(node.economics.capexRate) * Number(node.capacity);
  };
  assert.ok(furnaceCapex('polysilicon') > 0);
  assert.ok(furnaceCapex('mg-si') > 0);
  assert.ok(furnaceCapex('aluminium-smelter') > 0);
  const power = definition.graph.nodes.find(node => node.id === 'power').economics;
  assert.ok((Number(power.installedCapex) || Number(power.capexIntensity)) > 0);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash));
  assert.ok(Number.isFinite(cash.annualRevenue));
});

test('palette source lists Crust with polysilicon between mg-si and aluminium-smelter', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Crust:\s*\[\s*'mg-si',\s*'polysilicon',\s*'bayer-alumina',\s*'aluminium-smelter',\s*'float-glass',\s*'cement',\s*'pv-module',\s*'hydrogen-dri',\s*'titanium-kroll',\s*'copper-ew'\s*\]/);
  assert.match(html, /id="loadSiliconAlumina"/);
  assert.match(html, /Mejillones PV BOM \(Bayer Al \+ poly-Si \+ Ag\/glass\/EVA\)/);
  assert.match(html, /cases\/silicon\.js/);
  const poly = PROCESS_INTENSITIES.polysilicon;
  assert.equal(poly.intensity, 10);
  assert.equal(poly.quality, 'screening');
  assert.deepEqual([...poly.range], [6, 16]);
  assert.equal(poly.floorM2, 40);
  assert.ok(poly.evidence.every(item => /^https:\/\//.test(item.url)));
});
