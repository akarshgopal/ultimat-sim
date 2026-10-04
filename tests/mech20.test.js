const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { solveOperation } = require('../engine/solve');
const { resolveLiquidPumpSec, resolveGasBlowerSec } = require('../engine/units');
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

function pumpCase(params, { feedKg = 1025, capacityM3 = 10, setpoint = 10, powerKWh = 100 } = {}) {
  return {
    graph: {
      nodes: [
        { id: 'sea', unit: 'material-source', params: { stream: seawaterStream(feedKg) } },
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
    operation: { setpoints: { pump: setpoint }, priorities: { bus: ['pump'] } },
  };
}

function airStream(kmol = 1) {
  return {
    kind: 'material',
    phase: 'gas',
    T_C: 25,
    P_bar: 1,
    mol: { N2: 0.79 * kmol * 1000, O2: 0.21 * kmol * 1000 },
  };
}

test('part-load k unset is bit-identical; half flow raises SEC only when k is set', () => {
  const base = { pumpKWhPerM3: 0.4, densityKgM3: 1025 };
  const full = solveOperation(pumpCase(base, { capacityM3: 10, setpoint: 10, feedKg: 10250 }));
  const half = solveOperation(pumpCase(base, { capacityM3: 10, setpoint: 5, feedKg: 10250 }));
  assert.equal(full.nodes.pump.pumpKWhPerUnit, 0.4);
  assert.equal(half.nodes.pump.pumpKWhPerUnit, 0.4);
  assert.equal(full.nodes.pump.pumpPartLoadK, undefined);
  assert.equal(half.nodes.pump.consumed.electricity.kWh, 2);

  const shaped = solveOperation(pumpCase({ ...base, partLoadK: 0.4 }, { capacityM3: 10, setpoint: 5, feedKg: 10250 }));
  const expect = 0.4 * (1 + 0.4 * (1 - 0.5) ** 2);
  assert.ok(Math.abs(shaped.nodes.pump.pumpKWhPerUnit - expect) < 1e-9);
  assert.ok(Math.abs(shaped.nodes.pump.consumed.electricity.kWh - expect * 5) < 1e-9);
  assert.equal(shaped.nodes.pump.pumpPartLoadQ, 0.5);
  assert.ok(shaped.nodes.pump.pumpKWhPerUnit > 0.4);

  const rated = solveOperation(pumpCase({ ...base, partLoadK: 0.4 }, { capacityM3: 10, setpoint: 10, feedKg: 10250 }));
  assert.equal(rated.nodes.pump.pumpPartLoadMultiplier, 1);
  assert.equal(rated.nodes.pump.pumpKWhPerUnit, 0.4);

  assert.throws(() => solveOperation(pumpCase({ ...base, partLoadK: -0.1 })), /partLoadK/);
  const head = resolveLiquidPumpSec({ headM: 10, densityKgM3: 1000 }, 1000);
  assert.equal(head.pumpEta, 0.7);
});

test('blower ΔP unset keeps 0.001; set ΔP derives SEC and the slider can override', () => {
  const plain = resolveGasBlowerSec({ blowerKWhPerNm3: 0.001 });
  assert.equal(plain.sec, 0.001);
  assert.equal(plain.source, 'kWh/Nm3');

  const eta = 0.7;
  const dp = 5;
  const expect = dp / (eta * 3600);
  const derived = resolveGasBlowerSec({ blowerKWhPerNm3: 0.001, deltaP_kPa: dp });
  assert.ok(Math.abs(derived.sec - expect) < 1e-12);
  assert.equal(derived.source, 'deltaP');
  assert.equal(derived.blowerEta, 0.7);
  assert.notEqual(derived.sec, 0.001);

  const override = resolveGasBlowerSec({ blowerKWhPerNm3: 0.001, deltaP_kPa: dp, blowerSecOverride: true });
  assert.equal(override.sec, 0.001);
  assert.equal(override.source, 'override');

  assert.throws(() => resolveGasBlowerSec({ deltaP_kPa: -1 }), /deltaP_kPa/);
  assert.throws(() => resolveGasBlowerSec({ deltaP_kPa: 1, blowerEta: 0 }), /blowerEta/);

  const stream = airStream(1);
  const nm3 = (0.79 + 0.21) * 22.414;
  const solved = solveOperation({
    graph: {
      nodes: [
        { id: 'air', unit: 'material-source', params: { stream } },
        { id: 'blower', unit: 'gas-blower', capacity: 100, params: { blowerKWhPerNm3: 0.001, deltaP_kPa: dp } },
        { id: 'power', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: 10 } } },
        { id: 'bus', unit: 'electrical-bus' },
        { id: 'sink', unit: 'material-sink' },
      ],
      edges: [
        { from: { node: 'air', port: 'out' }, to: { node: 'blower', port: 'in' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'bus', port: 'in' } },
        { from: { node: 'bus', port: 'out' }, to: { node: 'blower', port: 'electricity' } },
        { from: { node: 'blower', port: 'out' }, to: { node: 'sink', port: 'in' } },
      ],
    },
    operation: { setpoints: { blower: nm3 }, priorities: { bus: ['blower'] } },
  });
  assert.ok(Math.abs(solved.nodes.blower.blowerKWhPerUnit - expect) < 1e-12);
  assert.equal(solved.nodes.blower.blowerSecSource, 'deltaP');
  assert.ok(Math.abs(solved.nodes.blower.consumed.electricity.kWh - nm3 * expect) < 1e-9);
});

test('UNESCO salinity density is the labeled 0–42 g/kg fit', () => {
  const rho = tea.estimateDensityKgM3FromSalinity(35);
  assert.ok(Math.abs(rho - 1023.6) < 1.5, rho);
  assert.equal(tea.estimateDensityKgM3FromSalinity(80), null);
  assert.equal(tea.estimateDensityKgM3FromSalinity(-1), null);
  const hint = tea.densityHintFromAssay({ salinity_g_per_kg: 35 });
  assert.equal(hint.source, 'salinity estimate (UNESCO 25 °C)');
  const hot = tea.densityHintFromAssay({ salinity_g_per_kg: 200 });
  assert.equal(hot.densityKgM3, null);
  assert.match(hot.source, /fluid default/);
  assert.equal(tea.densityHintFromAssay({ tds_mg_per_kg: 35000 }).source, hint.source);
});

function loadApp() {
  const elements = new Map();
  const makeElement = () => {
    const el = {
      listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener; },
      className: '',
      setAttribute(name, value) { this[name] = value; },
      _innerHTML: '',
      _textContent: '',
      hidden: false,
      open: false,
      dataset: {},
      get innerHTML() { return this._innerHTML; },
      set innerHTML(value) {
        this._innerHTML = String(value ?? '');
        this._textContent = this._innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      },
      get textContent() { return this._textContent; },
      set textContent(value) {
        this._textContent = String(value ?? '');
        this._innerHTML = this._textContent;
      },
    };
    el.classList = {
      add() {},
      remove() {},
      toggle() { return false; },
    };
    return el;
  };
  const document = {
    body: makeElement(),
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const context = vm.createContext({ document, console, localStorage: null });
  context.window = context;
  for (const file of [
    'engine/model.js', 'engine/units.js', 'engine/heat.js', 'engine/solve.js', 'engine/economics.js',
    'engine/material-power-breakeven.js', 'engine/footprint.js', 'engine/size.js', 'engine/network.js',
    'engine/uncertainty.js', 'engine/map-site.js', 'data/pvgis-almeria-hourly.js',
    'data/dead-sea-brine.js', 'data/persian-gulf-sabkha-brine.js', 'data/atacama-lithium-brine.js',
    'data/lake-mackay-wa-brine.js', 'data/great-salt-lake-brine.js', 'data/salton-sea-brine.js',
    'data/uyuni-lithium-brine.js', 'data/qaidam-brine.js', 'data/danakil-brine.js',
    'data/searles-lake-brine.js', 'data/hombre-muerto-lithium-brine.js', 'data/maricunga-lithium-brine.js',
    'data/clayton-valley-brine.js', 'data/zabuye-lithium-brine.js', 'data/almeria-seawater.js',
    'data/persian-gulf-seawater.js', 'data/red-sea-seawater.js', 'data/texas-gulf-seawater.js',
    'data/pilbara-indian-ocean-seawater.js', 'data/atacama-pacific-seawater.js',
    'data/morocco-atlantic-seawater.js', 'data/arabian-sea-seawater.js', 'data/gulf-of-kutch-seawater.js',
    'data/benguela-atlantic-seawater.js', 'data/site-assays.js', 'data/site-presets.js',
    'data/tea-screening.js', 'cases/sabatier.js', 'cases/coastal.js', 'cases/methanol.js',
    'cases/abundance.js', 'cases/network.js', 'js/flowsheet-app.js',
    'data/red-sea-sabkha-brine.js', 'data/kutch-subsoil-brine.js', 'data/texas-gulf-desal-brine.js',
    'data/mediterranean-swro-brine.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return context.__FLOWSHEET_APP__;
}

function keyEvent(key, extras = {}) {
  return {
    key,
    target: extras.target || { tagName: 'DIV' },
    shiftKey: false,
    ctrlKey: !!extras.ctrlKey,
    metaKey: !!extras.metaKey,
    preventDefault() {},
  };
}

test('Ctrl+Z undoes placing a block and connecting an edge, not while typing', () => {
  const app = loadApp();
  app.activateTab('process');
  app.clearFactory();
  const tank = app.addNode('material-buffer');
  const sink = app.addNode('material-sink');
  assert.equal(app.undoStackLength, 2);
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  assert.equal(app.graph.nodes.some(node => node.id === sink.id), false);
  assert.equal(app.graph.nodes.some(node => node.id === tank.id), true);
  app.handleProcessKeydown(keyEvent('z', { metaKey: true }));
  assert.equal(app.graph.nodes.length, 0);

  const a = app.addNode('material-buffer');
  const b = app.addNode('material-sink');
  app.clearUndoStack();
  app.choosePort({ node: a.id, port: 'out', direction: 'out' });
  assert.equal(app.graph.edges.length, 0);
  assert.equal(app.undoStackLength, 0);
  app.choosePort({ node: b.id, port: 'in', direction: 'in' });
  assert.equal(app.graph.edges.length, 1);
  assert.equal(app.undoStackLength, 1);
  const typing = { tagName: 'INPUT' };
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true, target: typing }));
  assert.equal(app.graph.edges.length, 1);
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  assert.equal(app.graph.edges.length, 0);
  assert.equal(app.graph.nodes.length, 2);
});

test('undo stack stays at 20 and place does not merge with a nudge', () => {
  const app = loadApp();
  app.activateTab('process');
  app.clearFactory();
  const first = app.addNode('material-buffer');
  app.clearUndoStack();
  app.selectedNodeId = first.id;
  app.nudgeSelectedNode(10, 0);
  const placed = [];
  for (let i = 0; i < 20; i += 1) placed.push(app.addNode('material-sink'));
  assert.equal(app.undoStackLength, 20);
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  assert.equal(app.graph.nodes.some(node => node.id === placed.at(-1).id), false);
  assert.equal(app.graph.nodes.some(node => node.id === first.id), true);
});

test('assay without density uses UNESCO salinity, else a labeled fluid default', () => {
  const app = loadApp();
  app.loadAbundanceHub();
  const tank = app.addNode('material-buffer', { silent: true });
  const rho35 = tea.estimateDensityKgM3FromSalinity(35);

  app.site.assay = { kind: 'seawater', salinity_g_per_kg: 35 };
  tank.params.fluidClass = 'seawater';
  delete tank.params.densityKgM3;
  delete tank.params.densityOverride;
  app.refreshBufferEconomics(tank);
  assert.ok(Math.abs(tank.params.densityKgM3 - rho35) < 1e-6);
  assert.equal(tank.economics.densitySource, 'salinity estimate (UNESCO 25 °C)');
  assert.notEqual(tank.params.densityKgM3, 1025);

  app.site.assay = { kind: 'brine', salinity_g_per_kg: 230 };
  tank.params.fluidClass = 'brine';
  delete tank.params.densityKgM3;
  delete tank.params.densityOverride;
  app.refreshBufferEconomics(tank);
  assert.equal(tank.params.densityKgM3, 1200);
  assert.match(tank.economics.densitySource, /fluid default/);
  assert.match(tank.economics.densitySource, /UNESCO/);

  app.site.assay = { kind: 'brine' };
  delete tank.params.densityKgM3;
  delete tank.params.densityOverride;
  app.refreshBufferEconomics(tank);
  assert.equal(tank.params.densityKgM3, 1200);
  assert.equal(tank.economics.densitySource, 'fluid default');

  const html = app.site && tank.economics.densitySource;
  assert.match(String(html), /fluid default|salinity|site assay|override/);
});
