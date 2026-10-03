const assert = require('node:assert/strict');
const test = require('node:test');

const { evaluateEconomics } = require('../engine/economics');
const { estimateFootprint, PROCESS_INTENSITIES } = require('../engine/footprint');
const { solveOperation } = require('../engine/solve');
const { siteZabuyeAbundance, siteDeadSeaAbundance } = require('../cases/network');
const { createCoastalCase } = require('../cases/coastal');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('intake-pump and gas-blower have screening footprint intensities', () => {
  for (const unit of ['intake-pump', 'gas-blower']) {
    const spec = PROCESS_INTENSITIES[unit];
    assert.ok(spec, unit);
    assert.equal(spec.quality, 'screening');
    assert.ok(spec.intensity > 0);
    assert.ok(spec.evidence.length >= 1);
  }
});

test('stock Zabuye brine-pump adds CAPEX and campus pad', () => {
  const definition = siteZabuyeAbundance();
  const pump = definition.graph.nodes.find(node => node.id === 'brine-pump');
  assert.ok(pump);
  assert.equal(pump.unit, 'intake-pump');
  assert.ok(pump.economics?.capexRate > 0);
  // Asia-China CAPEX× 0.8 on $350 → $280/(m³/day)
  assert.equal(pump.economics.capexRate, 280);

  const solved = solveOperation(definition);
  const economics = evaluateEconomics(definition, solved);
  const footprint = estimateFootprint({ site: definition.site, graph: definition.graph, solved });
  const expectedPumpCapex = pump.economics.capexRate * pump.capacity;
  assert.ok(economics.installedCapex > expectedPumpCapex);
  const pad = footprint.processes.find(item => item.id === 'brine-pump');
  assert.ok(pad);
  assert.ok(pad.areaM2 >= 6);
  assert.equal(pad.unit, 'intake-pump');
});

test('Almería seawater-pump + air-blower raise CAPEX and add pads', () => {
  const definition = createCoastalCase();
  const pump = definition.graph.nodes.find(node => node.id === 'seawater-pump');
  const blower = definition.graph.nodes.find(node => node.id === 'air-blower');
  assert.ok(pump?.economics?.capexRate);
  assert.ok(blower?.economics?.capexRate);
  // Europe CAPEX× 1.2
  assert.equal(pump.economics.capexRate, 350 * 1.2);
  assert.equal(blower.economics.capexRate, 1.5 * 1.2);

  const solved = solveOperation(definition);
  const economics = evaluateEconomics(definition, solved);
  const footprint = estimateFootprint({ site: definition.site, graph: definition.graph, solved });
  const pumpCapex = pump.economics.capexRate * pump.capacity;
  const blowerCapex = blower.economics.capexRate * blower.capacity;
  assert.ok(economics.installedCapex >= pumpCapex + blowerCapex);
  assert.ok(footprint.processes.some(item => item.id === 'seawater-pump'));
  assert.ok(footprint.processes.some(item => item.id === 'air-blower'));
});

test('Dead Sea brine-pump CAPEX uses Levant CAPEX× 0.85', () => {
  const definition = siteDeadSeaAbundance();
  const pump = definition.graph.nodes.find(node => node.id === 'brine-pump');
  assert.equal(definition.site.region, 'Levant');
  assert.equal(pump.economics.capexRate, 350 * 0.85);
  const solved = solveOperation(definition);
  const beforeNodes = clone(definition.graph.nodes);
  // Strip pump economics → CAPEX drops by rate × capacity
  pump.economics = undefined;
  const after = evaluateEconomics(definition, solveOperation(definition));
  definition.graph.nodes = beforeNodes;
  const withPump = evaluateEconomics(definition, solved);
  const delta = withPump.installedCapex - after.installedCapex;
  assert.ok(Math.abs(delta - 350 * 0.85 * pump.capacity) < 1e-6);
});
