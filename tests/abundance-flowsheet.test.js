const assert = require('node:assert/strict');
const test = require('node:test');

const { SUBSTANCES } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { createAbundanceCase } = require('../cases/abundance');

const material = (substance, kg, phase = 'solid') => ({
  kind: 'material', mol: { [substance]: kg * 1000 / SUBSTANCES[substance].molarMassG }, phase, T_C: 25, P_bar: 1,
});
const source = (id, stream) => ({ id, unit: stream.kind === 'electricity' ? 'electricity-source' : 'material-source', params: { stream } });
const sink = id => ({ id, unit: 'material-sink' });

test('ASU nitrogen feeds Haber-Bosch ammonia with explicit oxygen and off-gas', () => {
  const air = { kind: 'material', mol: { N2: 10000, O2: 2650 }, phase: 'gas', T_C: 25, P_bar: 1 };
  const solved = solveOperation({
    graph: {
      nodes: [
        source('air', air), source('hydrogen', material('H2', 10, 'gas')), source('power', { kind: 'electricity', kWh: 100 }),
        { id: 'bus', unit: 'electrical-bus' }, { id: 'asu', unit: 'asu', capacity: 100 }, { id: 'ammonia', unit: 'ammonia', capacity: 100 },
        sink('oxygen'), sink('offgas'), sink('product'),
      ],
      edges: [
        { from: { node: 'air', port: 'out' }, to: { node: 'asu', port: 'air' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'asu', port: 'electricity' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'ammonia', port: 'electricity' } },
        { from: { node: 'asu', port: 'nitrogen' }, to: { node: 'ammonia', port: 'nitrogen' } },
        { from: { node: 'asu', port: 'oxygen' }, to: { node: 'oxygen', port: 'in' } },
        { from: { node: 'asu', port: 'offgas' }, to: { node: 'offgas', port: 'in' } },
        { from: { node: 'hydrogen', port: 'out' }, to: { node: 'ammonia', port: 'hydrogen' } },
        { from: { node: 'ammonia', port: 'ammonia' }, to: { node: 'product', port: 'in' } },
      ],
    },
    operation: { setpoints: { asu: 10 * SUBSTANCES.N2.molarMassG / (2 * SUBSTANCES.NH3.molarMassG), ammonia: 10 }, priorities: { bus: ['asu', 'ammonia'] } },
  });

  assert.equal(solved.nodes.ammonia.activity, 10);
  assert.ok(solved.nodes.oxygen.received.mol.O2 > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('brine train conserves ions while exposing lithium, bromide, potash, magnesium, gypsum, and salt', () => {
  const brine = {
    kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1,
    mol: { H2O: 10000, 'Na+': 1000, 'Cl-': 1188, 'Mg+2': 50, 'Ca+2': 20, 'K+': 30, 'SO4-2': 20, 'Br-': 1, 'Li+': 0.1 },
  };
  const outputs = ['lithium', 'bromide', 'magnesium', 'potash', 'gypsum', 'salt', 'raffinate'];
  const solved = solveOperation({
    graph: {
      nodes: [source('brine', brine), source('power', { kind: 'electricity', kWh: 100 }), { id: 'minerals', unit: 'brine-minerals', capacity: 1000 }, ...outputs.map(sink)],
      edges: [
        { from: { node: 'brine', port: 'out' }, to: { node: 'minerals', port: 'brine' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'minerals', port: 'electricity' } },
        ...outputs.map(port => ({ from: { node: 'minerals', port }, to: { node: port, port: 'in' } })),
      ],
    },
    operation: { setpoints: { minerals: 100 } },
  });

  assert.ok(solved.nodes.lithium.received.mol.LiCl > 0);
  assert.ok(solved.nodes.bromide.received.mol.NaBr > 0);
  assert.ok(solved.nodes.potash.received.mol.KCl > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('chlor-alkali chlorine upgrades bromide to bromine and returns salt', () => {
  const solved = solveOperation({
    graph: {
      nodes: [
        source('salt-feed', material('NaCl', 100)), source('water', material('H2O', 100, 'liquid')), source('bromide', material('NaBr', 10)),
        source('power', { kind: 'electricity', kWh: 1000 }), { id: 'bus', unit: 'electrical-bus' },
        { id: 'cell', unit: 'chlor-alkali', capacity: 100 }, { id: 'bromine-plant', unit: 'bromine-recovery', capacity: 100 },
        sink('caustic'), sink('hydrogen'), sink('bromine-product'), sink('recovered-salt'),
      ],
      edges: [
        { from: { node: 'salt-feed', port: 'out' }, to: { node: 'cell', port: 'salt' } },
        { from: { node: 'water', port: 'out' }, to: { node: 'cell', port: 'water' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'cell', port: 'electricity' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'bromine-plant', port: 'electricity' } },
        { from: { node: 'cell', port: 'caustic' }, to: { node: 'caustic', port: 'in' } },
        { from: { node: 'cell', port: 'hydrogen' }, to: { node: 'hydrogen', port: 'in' } },
        { from: { node: 'cell', port: 'chlorine' }, to: { node: 'bromine-plant', port: 'chlorine' } },
        { from: { node: 'bromide', port: 'out' }, to: { node: 'bromine-plant', port: 'bromide' } },
        { from: { node: 'bromine-plant', port: 'bromine' }, to: { node: 'bromine-product', port: 'in' } },
        { from: { node: 'bromine-plant', port: 'salt' }, to: { node: 'recovered-salt', port: 'in' } },
      ],
    },
    operation: { setpoints: { cell: 2 * SUBSTANCES.NaOH.molarMassG / SUBSTANCES.Br2.molarMassG, 'bromine-plant': 1 }, priorities: { bus: ['cell', 'bromine-plant'] } },
  });

  assert.equal(solved.nodes['bromine-plant'].activity, 1);
  assert.ok(solved.nodes['bromine-product'].received.mol.Br2 > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

for (const route of [
  { unit: 'aluminium-smelter', product: 'aluminium', requested: 10, inputs: { alumina: ['Al2O3', 30], carbon: ['C', 10] }, byproduct: 'carbonDioxide' },
  { unit: 'hydrogen-dri', product: 'steel', requested: 10, inputs: { ironOre: ['Fe2O3', 30], hydrogen: ['H2', 2, 'gas'] }, byproduct: 'water' },
  { unit: 'titanium-kroll', product: 'titanium', requested: 10, inputs: { titaniumTetrachloride: ['TiCl4', 50, 'liquid'], magnesium: ['Mg', 20] }, byproduct: 'magnesiumChloride' },
]) test(`${route.unit} closes its reaction and power balance`, () => {
  const inputNodes = Object.entries(route.inputs).map(([port, [substance, kg, phase]]) => source(port, material(substance, kg, phase)));
  const solved = solveOperation({
    graph: {
      nodes: [...inputNodes, source('power', { kind: 'electricity', kWh: 1000 }), { id: 'plant', unit: route.unit, capacity: 100 }, sink('product'), sink('byproduct')],
      edges: [
        ...Object.keys(route.inputs).map(port => ({ from: { node: port, port: 'out' }, to: { node: 'plant', port } })),
        { from: { node: 'power', port: 'out' }, to: { node: 'plant', port: 'electricity' } },
        { from: { node: 'plant', port: route.product }, to: { node: 'product', port: 'in' } },
        { from: { node: 'plant', port: route.byproduct }, to: { node: 'byproduct', port: 'in' } },
      ],
    },
    operation: { setpoints: { plant: route.requested } },
  });
  assert.equal(solved.nodes.plant.activity, route.requested);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});

test('abundance hub couples brine bromide to chlor-alkali chlorine and its hydrogen to ammonia', () => {
  const solved = solveOperation(createAbundanceCase());
  assert.equal(solved.convergence.converged, true);
  assert.ok(solved.nodes['bromine-recovery'].activity > 0);
  assert.ok(solved.nodes.ammonia.activity > 0);
  assert.ok(solved.nodes.minerals.outlets.lithium.mol.LiCl > 0);
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
});
