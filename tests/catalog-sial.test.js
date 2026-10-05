const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, elementAmounts, streamMassKg } = require('../engine/model');
const { UNITS } = require('../engine/units');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const tea = require('../data/tea-screening.js');
const { createSiliconCase } = require('../cases/silicon');
const { PROCESS_INTENSITIES } = require('../engine/footprint');

test('SUBSTANCES include Si, SiO2, and CO', () => {
  assert.equal(SUBSTANCES.Si.molarMassG, 28.0855);
  assert.deepEqual(SUBSTANCES.Si.elements, { Si: 1 });
  assert.equal(SUBSTANCES.SiO2.molarMassG, 60.0843);
  assert.deepEqual(SUBSTANCES.SiO2.elements, { Si: 1, O: 2 });
  assert.equal(SUBSTANCES.CO.molarMassG, 28.0104);
  assert.deepEqual(SUBSTANCES.CO.elements, { C: 1, O: 1 });
});

test('mg-si carbothermic reaction closes Si/C/O at 12 kWh/kg', () => {
  const result = UNITS['mg-si'].evaluate({
    inlets: {
      quartz: { kind: 'material', mol: { SiO2: 10000 }, phase: 'solid', T_C: 25, P_bar: 1 },
      carbon: { kind: 'material', mol: { C: 20000 }, phase: 'solid', T_C: 25, P_bar: 1 },
      electricity: { kind: 'electricity', kWh: 1e6 },
    },
    requestedActivity: 10,
    capacity: 100,
  });
  assert.equal(result.activity, 10);
  assert.equal(result.consumed.electricity.kWh, 120);
  assert.ok(Math.abs(streamMassKg(result.outlets.silicon) - 10) < 1e-9);
  const siMol = result.outlets.silicon.mol.Si;
  assert.ok(Math.abs(result.outlets.carbonMonoxide.mol.CO - 2 * siMol) < 1e-9);
  assert.equal(result.outlets.wasteHeat, undefined);
  assert.equal(UNITS['mg-si'].ports.wasteHeat, undefined);
  const inEl = {};
  for (const stream of [result.consumed.quartz, result.consumed.carbon]) {
    for (const [el, n] of Object.entries(elementAmounts(stream))) inEl[el] = (inEl[el] || 0) + n;
  }
  const outEl = {};
  for (const stream of [result.outlets.silicon, result.outlets.carbonMonoxide]) {
    for (const [el, n] of Object.entries(elementAmounts(stream))) outEl[el] = (outEl[el] || 0) + n;
  }
  for (const el of ['Si', 'C', 'O']) {
    assert.ok(Math.abs((inEl[el] || 0) - (outEl[el] || 0)) < 1e-8, el);
  }
});

test('TEA silicon and aluminium prices, packs, and demand', () => {
  assert.equal(tea.prices.silicon.value, 3.97);
  assert.equal(tea.prices.silicon.quality, 'cited');
  assert.ok(tea.prices.silicon.evidence.some(item => /usgs\.gov.*silicon/i.test(item.url || '')));
  assert.equal(tea.prices.aluminium.value, 2.87);
  assert.equal(tea.prices.aluminium.quality, 'cited');
  assert.ok(tea.prices.aluminium.evidence.some(item => /usgs\.gov.*aluminum/i.test(item.url || '')));
  assert.equal(tea.packs['mg-si'].capexIntensity, 3000);
  assert.equal(tea.packs['aluminium-smelter'].capexIntensity, 1800);
  assert.equal(tea.demand.silicon.value, 5e6);
  assert.equal(tea.demand.aluminium.value, 2e7);
  assert.equal(tea.demandByRegion['asia-china'].silicon.value, 5e8);
  assert.equal(tea.demandByRegion['asia-china'].aluminium.value, 2e9);
  const europe = tea.demandByRegion.europe;
  assert.equal(europe.silicon.inherit, 'me-levant');
  assert.equal(europe.silicon.value, 5e6);
  assert.notEqual(europe.silicon.value, 5e8);
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('silicon'));
  assert.ok(!tea.MINERAL_DEMAND_KEYS.includes('aluminium'));
});

test('Mejillones MG-Si + Al case still solves with module assembly and no MG-Si sale', () => {
  const definition = createSiliconCase();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  assert.ok(solved.nodes['mg-si'].activity > 0);
  assert.ok(solved.nodes['aluminium-smelter'].activity > 0);
  const limited = [
    ...(solved.nodes['mg-si'].limitedBy || []),
    ...(solved.nodes['aluminium-smelter'].limitedBy || []),
    ...(solved.warnings || []),
  ].join(' ');
  assert.doesNotMatch(limited, /electricity/i);
  assert.equal(definition.graph.nodes.find(node => node.id === 'silicon'), undefined);
  assert.equal(definition.graph.nodes.find(node => node.id === 'aluminium' && node.unit === 'material-sink'), undefined);
  const furnaceCapex = id => {
    const econ = definition.graph.nodes.find(node => node.id === id).economics;
    return Number(econ.installedCapex) || Number(econ.capexRate) * Number(definition.graph.nodes.find(node => node.id === id).capacity);
  };
  assert.ok(furnaceCapex('mg-si') > 0);
  assert.ok(furnaceCapex('aluminium-smelter') > 0);
  const power = definition.graph.nodes.find(node => node.id === 'power').economics;
  assert.ok((Number(power.installedCapex) || Number(power.capexIntensity)) > 0);
  assert.notEqual(power.unitCost, 0.04);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(cash.annualRevenue > 0);
  assert.ok(Number.isFinite(cash.annualNetCash));
});

test('palette source lists Crust in default categories and hides gallery metals/desal', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /Crust:\s*\[\s*'mg-si',\s*'polysilicon',\s*'bayer-alumina',\s*'aluminium-smelter',\s*'float-glass',\s*'cement',\s*'pv-module',\s*'hydrogen-dri',\s*'titanium-kroll'\s*\]/);
  assert.doesNotMatch(source, /PALETTE_MORE_UNITS/);
  assert.doesNotMatch(source, /More units/);
  assert.doesNotMatch(source, /PALETTE_DEFAULT_OPEN = new Set\(\[[^\]]*Crust/);
  assert.match(html, /id="loadSiliconAlumina"/);
  assert.match(html, /cases\/silicon\.js/);
  assert.ok(html.indexOf('cases/silicon.js') < html.indexOf('js/flowsheet-app.js'));
  const mgSi = PROCESS_INTENSITIES['mg-si'];
  const al = PROCESS_INTENSITIES['aluminium-smelter'];
  assert.equal(mgSi.intensity, 8);
  assert.equal(mgSi.quality, 'screening');
  assert.ok(mgSi.evidence.every(item => /^https:\/\//.test(item.url)));
  assert.equal(al.intensity, 6);
  assert.equal(al.quality, 'screening');
  assert.ok(al.evidence.every(item => /^https:\/\//.test(item.url)));
});
