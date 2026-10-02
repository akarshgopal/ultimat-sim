const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { sizeForPositiveCashflow } = require('../engine/size');
const { siteZabuyeAbundance, siteDeadSeaAbundance } = require('../cases/network');
const { createCoastalCase } = require('../cases/coastal');
const { createMethanolCase } = require('../cases/methanol');
const { createSabatierCase } = require('../cases/sabatier');
const { createAbundanceCase } = require('../cases/abundance');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('Zabuye and Dead Sea stock hubs run brine through an intake pump', () => {
  for (const factory of [siteZabuyeAbundance, siteDeadSeaAbundance]) {
    const def = factory();
    assert.ok(def.graph.nodes.some(node => node.id === 'brine-pump' && node.unit === 'intake-pump'));
    assert.ok(def.graph.edges.some(edge => edge.from.node === 'brine' && edge.to.node === 'brine-pump'));
    assert.ok(def.graph.edges.some(edge => edge.from.node === 'brine-pump' && edge.to.node === 'minerals'));
    assert.ok(def.graph.edges.some(edge => edge.from.node === 'power-bus' && edge.to.node === 'brine-pump'));
    const solved = solveOperation(clone(def));
    assert.ok(solved.nodes['brine-pump'].activity > 0);
    assert.ok(solved.nodes['brine-pump'].consumed.electricity.kWh > 0);
    assert.ok(solved.nodes.minerals.activity > 1e3);
    assert.ok(streamMassKg(solved.nodes.lithium.received) > 0);
  }
});

test('Almería coastal and Sabatier wire seawater pump + air blower; SWRO SEC is plant-only 3.1', () => {
  for (const factory of [() => createCoastalCase(0), () => createSabatierCase()]) {
    const def = factory();
    const swro = def.graph.nodes.find(node => node.id === 'swro');
    assert.equal(swro.params.secKWhPerM3, 3.1);
    assert.ok(def.graph.nodes.some(node => node.id === 'seawater-pump' && node.unit === 'intake-pump'));
    assert.ok(def.graph.nodes.some(node => node.id === 'air-blower' && node.unit === 'gas-blower'));
    const solved = solveOperation(clone(def));
    assert.ok(solved.nodes['seawater-pump'].activity > 0);
    assert.ok(solved.nodes['air-blower'].activity > 0);
    assert.ok(solved.nodes.swro.activity > 0);
    assert.ok(solved.nodes.dac.activity > 0);
  }
});

test('methanol demo wires seawater pump + air blower with plant-only SWRO SEC', () => {
  const def = createMethanolCase(0);
  assert.equal(def.graph.nodes.find(node => node.id === 'swro').params.secKWhPerM3, 3.1);
  const solved = solveOperation(clone(def));
  assert.ok(solved.nodes['seawater-pump'].consumed.electricity.kWh > 0);
  assert.ok(solved.nodes['air-blower'].consumed.electricity.kWh > 0);
  assert.ok(solved.nodes.methanol.activity > 0);
  assert.ok(streamMassKg(solved.nodes['methanol-product'].received) > 0);
});

test('cutting coastal seawater-pump bus power starves SWRO', () => {
  const base = clone(createCoastalCase(0));
  const free = solveOperation(clone(base));
  assert.ok(free.nodes.swro.activity > 0);
  const cable = base.graph.edges.find(edge => edge.from.node === 'electrical-bus' && edge.to.node === 'seawater-pump');
  assert.ok(cable);
  cable.capacity = 0;
  const solved = solveOperation(base);
  assert.equal(solved.nodes['seawater-pump'].activity, 0);
  assert.ok(solved.nodes.swro.activity < 1e-9);
});

test('cutting methanol air-blower bus power starves DAC', () => {
  const base = clone(createMethanolCase(0));
  const free = solveOperation(clone(base));
  const freeCo2 = free.nodes.dac.activity;
  assert.ok(freeCo2 > 0);
  const cable = base.graph.edges.find(edge => edge.from.node === 'electrical-bus' && edge.to.node === 'air-blower');
  assert.ok(cable);
  cable.capacity = 0;
  const solved = solveOperation(base);
  assert.equal(solved.nodes['air-blower'].activity, 0);
  assert.ok(solved.nodes.dac.activity < 1e-6);
});

test('abundance sizeForPositiveCashflow still finds a feasible slate with brine-pump', () => {
  const sized = sizeForPositiveCashflow({
    definition: createAbundanceCase({ assayId: 'zabuye-lithium-brine', region: 'China / Tibet' }),
    scales: [1],
    rates: [0],
  });
  assert.ok(sized.definition);
  const solved = solveOperation(clone(sized.definition));
  assert.ok(solved.nodes['brine-pump'].activity > 0);
  assert.ok(solved.nodes.minerals.activity > 0);
});
