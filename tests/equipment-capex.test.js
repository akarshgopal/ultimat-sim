// Screening CAPEX and footprint for lifts (intake pump, gas blower) and buffer
// tanks: how they fold into economics, regional CAPEX×, tank $/m³ volume
// costing, and the density hints that size a tank from a site assay.
const assert = require('node:assert/strict');
const test = require('node:test');

const tea = require('../data/tea-screening');
const { evaluateEconomics } = require('../engine/economics');
const { estimateFootprint, PROCESS_INTENSITIES } = require('../engine/footprint');
const { solveOperation } = require('../engine/solve');
const { siteZabuyeAbundance, siteDeadSeaAbundance } = require('../cases/brine-hubs');
const { createCoastalCase } = require('../cases/coastal');
const { createAbundanceCase } = require('../cases/abundance');

const clone = value => JSON.parse(JSON.stringify(value));

function near(actual, expected, tol = 1e-6, label = '') {
  assert.ok(Math.abs(actual - expected) < tol, `${label} expected ${expected}, got ${actual}`);
}

test('each stock lift adds capexRate × capacity to installed CAPEX and a footprint pad', () => {
  for (const [factory, ids] of [
    [siteZabuyeAbundance, ['brine-pump']],
    [() => createCoastalCase(), ['seawater-pump', 'air-blower']],
  ]) {
    const definition = factory();
    const solved = solveOperation(definition);
    const withLifts = evaluateEconomics(definition, solved);
    const footprint = estimateFootprint({ site: definition.site, graph: definition.graph, solved });
    for (const id of ids) {
      const lift = definition.graph.nodes.find(node => node.id === id);
      assert.ok(lift.economics.capexRate > 0, id);
      const stripped = clone(definition);
      delete stripped.graph.nodes.find(node => node.id === id).economics;
      const without = evaluateEconomics(stripped, solved);
      near(withLifts.installedCapex - without.installedCapex, lift.economics.capexRate * lift.capacity, 1e-6, id);
      const pad = footprint.processes.find(item => item.id === id);
      assert.ok(pad && pad.areaM2 > 0, id);
      assert.equal(pad.unit, lift.unit);
    }
  }
});

test('a buffer tank is padded by installed capacity, not throughput', () => {
  const footprint = estimateFootprint({
    site: { solarKWp: 0 },
    graph: {
      nodes: [
        { id: 'tank', unit: 'material-buffer', params: { capacityKg: 100000 } },
        { id: 'idle', unit: 'material-buffer', params: { capacityKg: 0 } },
      ],
    },
    solved: { nodes: { tank: { activity: 0, inventoryKg: 0 }, idle: { activity: 0 } } },
  });
  const byId = Object.fromEntries(footprint.processes.map(item => [item.id, item]));
  assert.equal(byId.idle, undefined);
  near(byId.tank.areaM2, 100 * PROCESS_INTENSITIES['material-buffer'].intensity);
  assert.equal(byId.tank.unit, 'material-buffer');
});

test('adding a buffer tank on Zabuye raises CAPEX by its installed cost and adds a pad', () => {
  const definition = siteZabuyeAbundance();
  const before = evaluateEconomics(definition, solveOperation(definition));
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'material-buffer'));

  const feedEdge = definition.graph.edges.find(edge => edge.from.node === 'brine');
  const downstream = { ...feedEdge.to };
  definition.graph.nodes.push({
    id: 'brine-tank',
    unit: 'material-buffer',
    capacity: 50000,
    params: { capacityKg: 50000, initialKg: 0 },
    economics: { installedCapex: 25000, fixedOMPercent: 2, assetLifeYears: 25 },
  });
  feedEdge.to = { node: 'brine-tank', port: 'in' };
  definition.graph.edges.push({ from: { node: 'brine-tank', port: 'out' }, to: downstream });
  const solved = solveOperation(definition);
  const after = evaluateEconomics(definition, solved);
  assert.equal(after.installedCapex, before.installedCapex + 25000);
  assert.ok(after.annualizedCapex > before.annualizedCapex);
  const pad = estimateFootprint({ site: definition.site, graph: definition.graph, solved }).processes.find(item => item.id === 'brine-tank');
  near(pad.areaM2, 50 * PROCESS_INTENSITIES['material-buffer'].intensity);
});

test('regional CAPEX× scales every equipment pack', () => {
  const levant = tea.getCapexMultiplierForRegion('Levant');
  assert.ok(levant > 0 && levant !== 1);
  const bare = createAbundanceCase();
  const regional = createAbundanceCase({ region: 'Levant' });
  const deadSea = siteDeadSeaAbundance();
  const priced = bare.graph.nodes.filter(node => node.economics?.capexRate > 0).map(node => node.id);
  assert.ok(priced.includes('brine-pump') && priced.length > 3);
  const rate = (definition, id) => definition.graph.nodes.find(node => node.id === id).economics.capexRate;
  for (const id of priced) {
    near(rate(regional, id), rate(bare, id) * levant, 1e-9, id);
    near(rate(deadSea, id), rate(regional, id), 1e-9, id);
  }

  for (const [unit, region] of [['intake-pump', 'asia-china'], ['gas-blower', 'Europe']]) {
    const base = tea.bindCapexPack(unit, { capacity: 100 }).capexRate;
    near(tea.bindCapexPack(unit, { capacity: 100, region }).capexRate, base * tea.getCapexMultiplierForRegion(region), 1e-9, unit);
  }
  const tank = tea.bindTankCapex({ fluidClass: 'brine', capacityKg: 12000 });
  const china = tea.bindTankCapex({ fluidClass: 'brine', capacityKg: 12000, region: 'China / Tibet' });
  assert.equal(china.regionMultiplier, tea.getCapexMultiplierForRegion('China / Tibet'));
  near(china.installedCapex, tank.installedCapex * china.regionMultiplier);
});

test('tank CAPEX is $/m³ × volume at the fluid class density', () => {
  assert.equal(tea.resolveTankFluidClass('water'), 'freshwater');
  assert.equal(tea.resolveTankFluidClass('BRINE'), 'brine');
  assert.equal(tea.bindTankCapex({ capacityKg: 10000 }).fluidClass, tea.DEFAULT_TANK_FLUID);
  for (const fluidClass of ['freshwater', 'seawater', 'brine', 'generic']) {
    const spec = tea.getTankFluidSpec(fluidClass);
    const bound = tea.bindTankCapex({ fluidClass, capacityKg: 24000 });
    near(bound.installedCapex, spec.capexPerM3 * 24000 / spec.densityKgM3, 1e-6, fluidClass);
    near(bound.capexPerKg, spec.capexPerM3 / spec.densityKgM3, 1e-9, fluidClass);
  }
});

test('assay density hints: UNESCO salinity fit, TDS proxies, and labelled fallbacks', () => {
  const rho35 = tea.estimateDensityKgM3FromSalinity(35);
  near(rho35, 1023.6, 1.5, 'seawater density at S=35');
  assert.equal(tea.estimateDensityKgM3FromSalinity(80), null);
  assert.equal(tea.estimateDensityKgM3FromSalinity(-1), null);

  const salinity = tea.densityHintFromAssay({ salinity_g_per_kg: 35 });
  near(salinity.densityKgM3, rho35, 1e-9);
  assert.equal(tea.densityHintFromAssay({ tds_mg_per_kg: 35000 }).source, salinity.source);
  // Measured salinity wins over a TDS proxy.
  assert.equal(tea.densityHintFromAssay({ salinity_g_per_kg: 35, tds_mg_per_L: 10000 }).source, salinity.source);

  // mg/L needs the density it is solving for: the hint is the fixed point, not one pass.
  const tds = tea.densityHintFromAssay({ tds_mg_per_L: 35000 });
  assert.notEqual(tds.source, salinity.source);
  assert.match(tds.source, /TDS mg\/L/);
  near(tds.densityKgM3, tea.estimateDensityKgM3FromSalinity(35000 / tds.densityKgM3), 1e-4, 'fixed point');
  assert.ok(Math.abs(tds.densityKgM3 - tea.estimateDensityKgM3FromSalinity(35000 / rho35)) > 0.005);
  assert.ok(tds.densityKgM3 < rho35);

  for (const assay of [{ salinity_g_per_kg: 200 }, { tds_mg_per_L: 80000 }]) {
    const hint = tea.densityHintFromAssay(assay);
    assert.equal(hint.densityKgM3, null, JSON.stringify(assay));
    assert.match(hint.source, /fluid default/);
  }
});
