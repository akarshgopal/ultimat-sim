const assert = require('node:assert/strict');
const test = require('node:test');

const { evaluateEconomics } = require('../engine/economics');
const { estimateFootprint, PROCESS_INTENSITIES } = require('../engine/footprint');
const { solveOperation } = require('../engine/solve');
const { siteZabuyeAbundance } = require('../cases/network');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function waterStream(kg) {
  const mol = kg * 1000 / 18.01528;
  return { kind: 'material', mol: { H2O: mol }, phase: 'liquid', T_C: 25, P_bar: 1 };
}

test('material-buffer has screening footprint intensity with evidence', () => {
  const spec = PROCESS_INTENSITIES['material-buffer'];
  assert.ok(spec);
  assert.equal(spec.quality, 'screening');
  assert.equal(spec.intensity, 1.0);
  assert.equal(spec.basis, 'capacityTonnes');
  assert.ok(spec.evidence.length >= 1);
  assert.ok(spec.evidence.every(item => item.label && /^https?:\/\//.test(item.url)));
});

test('buffer tank pad uses installed capacityKg, not throughput', () => {
  const footprint = estimateFootprint({
    site: { solarKWp: 0 },
    graph: {
      nodes: [
        { id: 'tank', unit: 'material-buffer', params: { capacityKg: 10000, capexPerKg: 0.5 } },
        { id: 'idle', unit: 'material-buffer', params: { capacityKg: 0 } },
      ],
    },
    solved: { nodes: { tank: { activity: 0, inventoryKg: 0 }, idle: { activity: 0 } } },
  });
  const byId = Object.fromEntries(footprint.processes.map(item => [item.id, item]));
  assert.equal(byId.idle, undefined);
  assert.ok(byId.tank);
  // 10 t × 1.0 m²/t = 10 m²; floor is 9 → 10
  assert.equal(byId.tank.areaM2, 10);
  assert.equal(byId.tank.quality, 'screening');
  assert.equal(byId.tank.unit, 'material-buffer');
});

test('buffer installed CAPEX folds into annualized cash gate', () => {
  const definition = {
    graph: {
      nodes: [
        {
          id: 'feed',
          unit: 'material-source',
          params: { stream: waterStream(100) },
          economics: { unitCost: 0 },
        },
        {
          id: 'tank',
          unit: 'material-buffer',
          capacity: 10000,
          params: { capacityKg: 10000, initialKg: 0, capexPerKg: 0.5 },
          economics: { installedCapex: 5000, fixedOMPercent: 2, assetLifeYears: 25 },
        },
        {
          id: 'sink',
          unit: 'material-sink',
          economics: { disposition: 'sale', unitPrice: 1, annualDemandLimit: 1e9 },
        },
      ],
      edges: [
        { from: { node: 'feed', port: 'out' }, to: { node: 'tank', port: 'in' } },
        { from: { node: 'tank', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: { tank: 100 }, periodDays: 365 },
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
  };
  const solved = solveOperation(definition);
  const withTank = evaluateEconomics(definition, solved);
  assert.equal(withTank.installedCapex, 5000);
  assert.ok(withTank.annualizedCapex > 0);

  const bare = clone(definition);
  bare.graph.nodes = bare.graph.nodes.filter(node => node.id !== 'tank');
  bare.graph.edges = [
    { from: { node: 'feed', port: 'out' }, to: { node: 'sink', port: 'in' } },
  ];
  delete bare.operation.setpoints.tank;
  const bareSolved = solveOperation(bare);
  const withoutTank = evaluateEconomics(bare, bareSolved);
  assert.equal(withoutTank.installedCapex, 0);
  assert.ok(withTank.annualNetCash < withoutTank.annualNetCash);
});

test('stock Zabuye (no buffers) CAPEX and footprint stay free of tank pads', () => {
  const definition = clone(siteZabuyeAbundance());
  const solved = solveOperation(definition);
  const economics = evaluateEconomics(definition, solved);
  const footprint = estimateFootprint({
    site: definition.site,
    graph: definition.graph,
    solved,
  });
  assert.ok(!definition.graph.nodes.some(node => node.unit === 'material-buffer'));
  assert.ok(!footprint.processes.some(item => item.unit === 'material-buffer'));
  assert.ok(Number.isFinite(economics.installedCapex));
  assert.ok(economics.installedCapex > 0);
});

test('adding a buffer on Zabuye raises CAPEX and adds a campus pad', () => {
  const definition = clone(siteZabuyeAbundance());
  const beforeSolved = solveOperation(definition);
  const beforeEcon = evaluateEconomics(definition, beforeSolved);
  const beforeFoot = estimateFootprint({
    site: definition.site,
    graph: definition.graph,
    solved: beforeSolved,
  });

  // Insert on brine → minerals (or first brine-minerals feed edge).
  const feedEdge = definition.graph.edges.find(edge => (
    edge.to?.node && definition.graph.nodes.find(n => n.id === edge.to.node)?.unit === 'brine-minerals'
    && edge.to.port === 'brine'
  )) || definition.graph.edges.find(edge => edge.from?.node === 'brine');
  assert.ok(feedEdge, 'expected a brine feed edge on Zabuye');
  const downstream = { ...feedEdge.to };
  definition.graph.nodes.push({
    id: 'brine-tank',
    unit: 'material-buffer',
    label: 'Brine buffer',
    capacity: 50000,
    params: { capacityKg: 50000, initialKg: 0, capexPerKg: 0.5 },
    economics: { installedCapex: 25000, fixedOMPercent: 2, assetLifeYears: 25 },
    position: { x: 200, y: 200 },
  });
  feedEdge.to = { node: 'brine-tank', port: 'in' };
  definition.graph.edges.push({
    from: { node: 'brine-tank', port: 'out' },
    to: downstream,
  });
  // No discharge setpoint → pass-through so minerals activity (and its pad) stays live.
  const afterSolved = solveOperation(definition);
  const afterEcon = evaluateEconomics(definition, afterSolved);
  const afterFoot = estimateFootprint({
    site: definition.site,
    graph: definition.graph,
    solved: afterSolved,
  });

  assert.equal(afterEcon.installedCapex, beforeEcon.installedCapex + 25000);
  assert.ok(afterEcon.annualizedCapex > beforeEcon.annualizedCapex);
  const pad = afterFoot.processes.find(item => item.id === 'brine-tank');
  assert.ok(pad);
  assert.equal(pad.areaM2, 50); // 50 t × 1.0
  // Throughput-based pads (minerals) can shrink when the tank clamps the line —
  // the MECH17 contract is tank CAPEX + tank pad presence.
  assert.ok(!beforeFoot.processes.some(item => item.id === 'brine-tank'));
});
