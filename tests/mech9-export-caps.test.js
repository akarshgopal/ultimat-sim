const assert = require('node:assert/strict');
const test = require('node:test');

const { solveOperation } = require('../engine/solve');
const { createSabatierCase } = require('../cases/sabatier');
const { createDacCase } = require('../cases/dac');
const { siteZabuyeAbundance } = require('../cases/network');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function codes(result) {
  return (result.causeChain || []).map(step => step.code);
}

test('unconstrained Sabatier / DAC / Zabuye stay bit-identical without energy caps', () => {
  for (const factory of [createSabatierCase, createDacCase, siteZabuyeAbundance]) {
    const a = solveOperation(clone(factory()));
    const b = solveOperation(clone(factory()));
    assert.ok(a.balances.maxAbsResidual < 1e-8, factory.name + ' ' + JSON.stringify(a.balances));
    assert.equal(JSON.stringify(a.nodes), JSON.stringify(b.nodes));
    assert.ok(!Object.values(a.nodes).some(node => (node.limitedBy || []).includes('export')));
  }
});

test('capped electricity sink curtails a direct generator', () => {
  const definition = {
    graph: {
      nodes: [
        { id: 'gen', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: 100 } } },
        { id: 'export', unit: 'electricity-sink', label: 'Grid export', params: { acceptKWh: 40 } },
      ],
      edges: [
        { from: { node: 'gen', port: 'out' }, to: { node: 'export', port: 'in' } },
      ],
    },
    operation: { setpoints: {} },
  };
  const solved = solveOperation(definition);
  assert.ok(Math.abs(solved.nodes.export.received.kWh - 40) < 1e-9);
  assert.ok(Math.abs(solved.nodes.gen.supplied.kWh - 40) < 1e-9);
  assert.equal(solved.nodes.export.acceptKWh, 40);
  assert.equal(solved.nodes.export.acceptSource, 'manual');
  assert.ok(solved.nodes.export.limitedBy.includes('export'));
  assert.match(solved.nodes.export.causeText, /curtailment capped/);
  assert.deepEqual(codes(solved.nodes.export), ['export-capped']);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('blank electricity sink stays unlimited', () => {
  const definition = {
    graph: {
      nodes: [
        { id: 'gen', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: 75 } } },
        { id: 'export', unit: 'electricity-sink' },
      ],
      edges: [
        { from: { node: 'gen', port: 'out' }, to: { node: 'export', port: 'in' } },
      ],
    },
    operation: { setpoints: {} },
  };
  const solved = solveOperation(definition);
  assert.ok(Math.abs(solved.nodes.export.received.kWh - 75) < 1e-9);
  assert.equal(solved.nodes.export.acceptKWh, null);
  assert.ok(!(solved.nodes.export.limitedBy || []).includes('export'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('bus export cap leaves loads whole and trims generation', () => {
  // Load cable capacity models plant draw; export acceptKWh caps surplus interconnect.
  const definition = {
    graph: {
      nodes: [
        { id: 'gen', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: 100 } } },
        { id: 'bus', unit: 'electrical-bus' },
        { id: 'load', unit: 'electricity-sink', label: 'Plant load' },
        { id: 'export', unit: 'electricity-sink', label: 'Export', params: { acceptKWh: 20 } },
      ],
      edges: [
        { from: { node: 'gen', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'load', port: 'in' }, capacity: 60 },
        { from: { node: 'bus', port: 'out' }, to: { node: 'export', port: 'in' } },
      ],
    },
    operation: {
      setpoints: {},
      priorities: { bus: ['load', 'export'] },
    },
  };

  const solved = solveOperation(definition);
  assert.ok(Math.abs(solved.nodes.load.received.kWh - 60) < 1e-9, `load=${solved.nodes.load.received.kWh}`);
  assert.ok(Math.abs(solved.nodes.export.received.kWh - 20) < 1e-9, `export=${solved.nodes.export.received.kWh}`);
  assert.ok(Math.abs(solved.nodes.gen.supplied.kWh - 80) < 1e-9, `gen=${solved.nodes.gen.supplied.kWh}`);
  assert.ok(solved.nodes.export.limitedBy.includes('export'));
  assert.match(solved.nodes.export.causeText, /curtailment capped/);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('capped heat sink backpressures an upstream heat source', () => {
  const definition = {
    graph: {
      nodes: [
        { id: 'furnace', unit: 'heat-source', params: { stream: { kind: 'heat', kWh: 200, T_C: 250 } } },
        { id: 'reject', unit: 'heat-sink', label: 'Cooling tower', params: { acceptKWh: 50 } },
      ],
      edges: [
        { from: { node: 'furnace', port: 'out' }, to: { node: 'reject', port: 'in' } },
      ],
    },
    operation: { setpoints: {} },
  };
  const solved = solveOperation(definition);
  assert.ok(Math.abs(solved.nodes.reject.received.kWh - 50) < 1e-9);
  assert.ok(Math.abs(solved.nodes.furnace.supplied.kWh - 50) < 1e-9);
  assert.equal(solved.nodes.reject.acceptKWh, 50);
  assert.ok(solved.nodes.reject.limitedBy.includes('export'));
  assert.match(solved.nodes.reject.causeText, /export capped/);
  assert.deepEqual(codes(solved.nodes.reject), ['export-capped']);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('capped waste-heat sink throttles DAC and names the cause', () => {
  const freeCase = createDacCase();
  const free = solveOperation(clone(freeCase));
  const freeWaste = free.nodes['waste-heat'].received.kWh;
  assert.ok(freeWaste > 0);

  const limited = clone(freeCase);
  const sink = limited.graph.nodes.find(node => node.id === 'waste-heat');
  sink.params = { ...(sink.params || {}), acceptKWh: freeWaste * 0.4 };
  sink.label = 'Waste heat';

  const solved = solveOperation(limited);
  assert.ok(Math.abs(solved.nodes['waste-heat'].received.kWh / freeWaste - 0.4) < 1e-6);
  assert.ok(Math.abs(solved.nodes.dac.activity / free.nodes.dac.activity - 0.4) < 1e-6);
  assert.ok(solved.nodes.dac.limitedBy.includes('export'));
  assert.ok(solved.nodes['waste-heat'].limitedBy.includes('export'));
  assert.match(solved.nodes.dac.causeText, /blocked by export/);
  assert.match(solved.nodes.dac.causeText, /export capped/);
  assert.ok(codes(solved.nodes.dac).includes('export-capped'));
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('heat sink fan-in scales both legs under one cap', () => {
  const definition = {
    graph: {
      nodes: [
        { id: 'a', unit: 'heat-source', params: { stream: { kind: 'heat', kWh: 80, T_C: 100 } } },
        { id: 'b', unit: 'heat-source', params: { stream: { kind: 'heat', kWh: 120, T_C: 100 } } },
        { id: 'reject', unit: 'heat-sink', params: { acceptKWh: 50 } },
      ],
      edges: [
        { from: { node: 'a', port: 'out' }, to: { node: 'reject', port: 'in' } },
        { from: { node: 'b', port: 'out' }, to: { node: 'reject', port: 'in' } },
      ],
    },
    operation: { setpoints: {} },
  };
  const solved = solveOperation(definition);
  assert.ok(Math.abs(solved.nodes.reject.received.kWh - 50) < 1e-9);
  assert.ok(Math.abs(solved.nodes.a.supplied.kWh - 20) < 1e-9);
  assert.ok(Math.abs(solved.nodes.b.supplied.kWh - 30) < 1e-9);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});
