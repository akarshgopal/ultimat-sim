const assert = require('node:assert/strict');
const test = require('node:test');

const { solveOperation } = require('../engine/solve');
const { resolveLiquidPumpSec } = require('../engine/units');
const { siteDeadSeaAbundance, siteZabuyeAbundance } = require('../cases/network');
const { createAbundanceCase } = require('../cases/abundance');
const tea = require('../data/tea-screening');

function seawaterStream(kg) {
  const saltKg = kg * 0.035;
  const waterKg = kg - saltKg;
  return {
    kind: 'material',
    phase: 'liquid',
    T_C: 25,
    P_bar: 1,
    mol: {
      H2O: waterKg * 1000 / 18.01528,
      'Na+': saltKg * 1000 / 22.989769 / 2,
      'Cl-': saltKg * 1000 / 35.45 / 2,
    },
  };
}

function pumpCase(params, { feedKg = 1025, capacityM3 = 1, powerKWh = 10 } = {}) {
  const stream = seawaterStream(feedKg);
  return {
    graph: {
      nodes: [
        { id: 'sea', unit: 'material-source', params: { stream } },
        { id: 'pump', unit: 'intake-pump', capacity: capacityM3, params },
        { id: 'power', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: powerKWh } } },
        { id: 'bus', unit: 'electrical-bus' },
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'sea', port: 'out' }, to: { node: 'pump', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'pump', port: 'electricity' } },
        { from: { node: 'pump', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: { pump: capacityM3 }, priorities: { bus: ['pump'] } },
  };
}

test('unset head keeps pumpKWhPerM3; headM derives SEC and changes electricity', () => {
  const baseParams = { pumpKWhPerM3: 0.4, densityKgM3: 1025 };
  const base = solveOperation(pumpCase(baseParams));
  assert.equal(base.nodes.pump.pumpKWhPerUnit, 0.4);
  assert.equal(base.nodes.pump.consumed.electricity.kWh, 0.4);
  assert.equal(base.nodes.pump.pumpSecSource, 'kWh/m3');

  const expect = (1025 * 9.81 * 40) / (0.7 * 3.6e6);
  const headed = solveOperation(pumpCase({ ...baseParams, headM: 40 }));
  assert.ok(Math.abs(headed.nodes.pump.pumpKWhPerUnit - expect) < 1e-9);
  assert.ok(Math.abs(headed.nodes.pump.consumed.electricity.kWh - expect) < 1e-9);
  assert.equal(headed.nodes.pump.pumpSecSource, 'head');
  assert.notEqual(headed.nodes.pump.pumpKWhPerUnit, 0.4);

  const override = solveOperation(pumpCase({ ...baseParams, headM: 40, pumpSecOverride: true }));
  assert.equal(override.nodes.pump.pumpKWhPerUnit, 0.4);
  assert.equal(override.nodes.pump.pumpSecSource, 'override');
});

test('invalid pump head and efficiency are rejected', () => {
  assert.throws(() => resolveLiquidPumpSec({ headM: -1, densityKgM3: 1025 }, 1025), /headM/);
  assert.throws(() => resolveLiquidPumpSec({ headM: 10, pumpEta: 0, densityKgM3: 1025 }, 1025), /pumpEta/);
  assert.throws(() => resolveLiquidPumpSec({ headM: 10, pumpEta: 1.2, densityKgM3: 1025 }, 1025), /pumpEta/);
  const clampedDefaultEta = resolveLiquidPumpSec({ headM: 10, densityKgM3: 1000 }, 1000);
  assert.equal(clampedDefaultEta.pumpEta, 0.7);
});

test('Dead Sea site is Levant CAPEX× 0.85 versus the same case without region', () => {
  const definition = siteDeadSeaAbundance();
  assert.equal(definition.site.region, 'Levant');
  assert.equal(definition.meta.demandRegionId, 'me-levant');
  assert.equal(tea.getCapexMultiplierForRegion('Levant'), 0.85);
  assert.match(definition.site.notes, /Levant CAPEX× 0\.85/);
  assert.equal(definition.site.assay.density_kg_per_L, 1.24);

  const bare = createAbundanceCase();
  const regional = createAbundanceCase({ region: 'Levant' });
  const rate = (def, id) => def.graph.nodes.find(node => node.id === id).economics.capexRate;
  for (const id of ['minerals', 'chlor-alkali', 'bromine-recovery', 'asu', 'ammonia', 'brine-pump']) {
    assert.ok(Math.abs(rate(definition, id) - rate(bare, id) * 0.85) < 1e-9, id);
    assert.ok(Math.abs(rate(definition, id) - rate(regional, id)) < 1e-9, id);
  }
  const pack = def => ['minerals', 'chlor-alkali', 'bromine-recovery', 'asu', 'ammonia', 'brine-pump'].reduce((sum, id) => {
    const node = def.graph.nodes.find(item => item.id === id);
    return sum + node.economics.capexRate * node.capacity;
  }, 0);
  assert.ok(Math.abs(pack(definition) / pack(bare) - 0.85) < 1e-9);
});

test('Zabuye region and cash inputs stay on China / Tibet', () => {
  const definition = siteZabuyeAbundance();
  assert.equal(definition.site.region, 'China / Tibet');
  const pump = definition.graph.nodes.find(node => node.id === 'brine-pump');
  assert.equal(pump.economics.capexRate, 280);
  assert.equal(definition.site.assay.density_kg_per_L, pump.params.densityKgM3 / 1000);
});
