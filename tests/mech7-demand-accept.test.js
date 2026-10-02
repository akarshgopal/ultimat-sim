const assert = require('node:assert/strict');
const test = require('node:test');

const { streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { evaluateEconomics } = require('../engine/economics');
const { siteZabuyeAbundance } = require('../cases/network');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function waterStream(kg) {
  const mol = kg * 1000 / 18.01528;
  return { kind: 'material', mol: { H2O: mol }, phase: 'liquid', T_C: 25, P_bar: 1 };
}

function codes(result) {
  return (result.causeChain || []).map(step => step.code);
}

test('unconstrained Zabuye stays bit-identical under regional demand defaults', () => {
  const a = solveOperation(clone(siteZabuyeAbundance()));
  const b = solveOperation(clone(siteZabuyeAbundance()));
  assert.equal(a.nodes.minerals.activity, b.nodes.minerals.activity);
  assert.ok(a.balances.maxAbsResidual < 1e-8);
  assert.ok(!Object.values(a.nodes).some(node => (node.limitedBy || []).includes('export')));
  // Lithium sink should report demand-backed accept, but cap is above free receipt.
  assert.equal(a.nodes.lithium.acceptSource, 'demand');
  assert.ok(a.nodes.lithium.acceptKg > streamMassKg(a.nodes.lithium.received));
});

test('annualDemandLimit / periodDays backpressures when blank acceptKg', () => {
  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(100), evidence: 'MECH7' },
      },
    },
    graph: {
      nodes: [
        {
          id: 'feed',
          unit: 'material-source',
          siteResource: 'water',
          params: { stream: waterStream(100) },
        },
        {
          id: 'offtake',
          unit: 'material-sink',
          label: 'Offtake',
          economics: { disposition: 'sale', unitPrice: 1, annualDemandLimit: 3650 }, // 10 kg/day
        },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'offtake', port: 'in' } },
      ],
    },
    operation: { setpoints: {}, periodDays: 365 },
  };

  const solved = solveOperation(definition);
  assert.ok(Math.abs(streamMassKg(solved.nodes.offtake.received) - 10) < 1e-6);
  assert.ok(Math.abs(streamMassKg(solved.nodes.feed.supplied) - 10) < 1e-6);
  assert.equal(solved.nodes.offtake.acceptKg, 10);
  assert.equal(solved.nodes.offtake.acceptSource, 'demand');
  assert.ok(solved.nodes.offtake.limitedBy.includes('export'));
  assert.match(solved.nodes.offtake.causeText, /export capped/);
  assert.deepEqual(codes(solved.nodes.offtake), ['export-capped']);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('manual acceptKg overrides annualDemandLimit', () => {
  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(100), evidence: 'MECH7' },
      },
    },
    graph: {
      nodes: [
        {
          id: 'feed',
          unit: 'material-source',
          siteResource: 'water',
          params: { stream: waterStream(100) },
        },
        {
          id: 'offtake',
          unit: 'material-sink',
          label: 'Offtake',
          params: { acceptKg: 25 },
          economics: { disposition: 'sale', unitPrice: 1, annualDemandLimit: 3650 }, // would be 10/day
        },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'offtake', port: 'in' } },
      ],
    },
    operation: { setpoints: {} },
  };

  const solved = solveOperation(definition);
  assert.ok(Math.abs(streamMassKg(solved.nodes.offtake.received) - 25) < 1e-6);
  assert.equal(solved.nodes.offtake.acceptSource, 'manual');
  assert.equal(solved.nodes.offtake.acceptKg, 25);
});

test('tight lithium annualDemandLimit throttles Zabuye minerals and cash aligns', () => {
  const freeCase = siteZabuyeAbundance();
  const free = solveOperation(clone(freeCase));
  const freeLi = streamMassKg(free.nodes.lithium.received);
  assert.ok(freeLi > 1);

  const limited = clone(freeCase);
  const lithium = limited.graph.nodes.find(node => node.id === 'lithium');
  // Cap at 40% of free daily rate via annual demand (no manual acceptKg).
  const dailyCap = freeLi * 0.4;
  lithium.economics = {
    ...(lithium.economics || {}),
    annualDemandLimit: dailyCap * 365,
  };
  delete lithium.params?.acceptKg;
  if (lithium.params && Object.keys(lithium.params).length === 0) delete lithium.params;

  const solved = solveOperation(limited);
  assert.ok(Math.abs(solved.nodes.minerals.activity / free.nodes.minerals.activity - 0.4) < 1e-5);
  assert.ok(Math.abs(streamMassKg(solved.nodes.lithium.received) - dailyCap) < 1e-3);
  assert.equal(solved.nodes.lithium.acceptSource, 'demand');
  assert.ok(solved.nodes.lithium.limitedBy.includes('export'));
  assert.ok(solved.nodes.minerals.limitedBy.includes('export'));
  assert.match(solved.nodes.minerals.causeText, /export capped/);

  const economics = evaluateEconomics(
    { graph: limited.graph, operation: limited.operation, economics: { periodDays: 365 } },
    solved
  );
  const liSink = economics.sinks.find(sink => sink.id === 'lithium');
  assert.ok(liSink);
  // Physics already throttled to demand, so delivered ≈ annualAmount (no second cash haircut).
  assert.ok(Math.abs(liSink.deliveredAmount - liSink.annualAmount) < 1e-2);
  assert.ok(Math.abs(liSink.annualAmount - dailyCap * 365) < 1);
  assert.ok(solved.balances.maxAbsResidual < 1e-8, JSON.stringify(solved.balances));
});

test('custom periodDays scales demand-backed accept', () => {
  const definition = {
    site: {
      resources: {
        water: { quality: 'assumed', stream: waterStream(100), evidence: 'MECH7' },
      },
    },
    graph: {
      nodes: [
        {
          id: 'feed',
          unit: 'material-source',
          siteResource: 'water',
          params: { stream: waterStream(100) },
        },
        {
          id: 'offtake',
          unit: 'material-sink',
          economics: { disposition: 'sale', unitPrice: 1, annualDemandLimit: 3650 },
        },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'offtake', port: 'in' } },
      ],
    },
    operation: { setpoints: {}, periodDays: 365 },
  };
  const a = solveOperation(clone(definition));
  assert.equal(a.nodes.offtake.acceptKg, 10);

  definition.operation.periodDays = 730; // half the daily accept
  const b = solveOperation(definition);
  assert.ok(Math.abs(b.nodes.offtake.acceptKg - 5) < 1e-9);
  assert.ok(Math.abs(streamMassKg(b.nodes.offtake.received) - 5) < 1e-6);
});
