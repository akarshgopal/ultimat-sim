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
    shiftKey: !!extras.shiftKey,
    ctrlKey: !!extras.ctrlKey,
    metaKey: !!extras.metaKey,
    preventDefault() {},
  };
}


test('redo restores an undo and a new edit clears the redo stack', () => {
  const app = loadApp();
  app.activateTab('process');
  app.clearFactory();
  const tank = app.addNode('material-buffer');
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  assert.equal(app.graph.nodes.length, 0);
  assert.equal(app.redoStackLength, 1);
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true, shiftKey: true }));
  assert.equal(app.graph.nodes.some(node => node.id === tank.id), true);
  assert.equal(app.undoStackLength, 1);
  assert.equal(app.redoStackLength, 0);

  app.handleProcessKeydown(keyEvent('z', { metaKey: true }));
  assert.equal(app.graph.nodes.length, 0);
  app.handleProcessKeydown(keyEvent('y', { metaKey: true }));
  assert.equal(app.graph.nodes.some(node => node.id === tank.id), true);

  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  app.addNode('material-sink');
  assert.equal(app.redoStackLength, 0);
  app.handleProcessKeydown(keyEvent('y', { ctrlKey: true }));
  assert.equal(app.graph.nodes.some(node => node.id === tank.id), false);

  const typing = { tagName: 'INPUT' };
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  const before = app.graph.nodes.length;
  app.handleProcessKeydown(keyEvent('y', { ctrlKey: true, target: typing }));
  app.handleProcessKeydown(keyEvent('Z', { metaKey: true, shiftKey: true, target: typing }));
  assert.equal(app.graph.nodes.length, before);
});

test('Add sources & sinks is one undo gesture', () => {
  const app = loadApp();
  app.activateTab('process');
  app.clearFactory();
  const pump = app.addNode('intake-pump');
  app.clearUndoStack();
  assert.equal(app.undoStackLength, 0);
  app.completeBoundaries();
  assert.ok(app.graph.nodes.length > 2);
  assert.equal(app.graph.edges.length, app.graph.nodes.length - 1);
  assert.equal(app.undoStackLength, 1);
  const populated = app.graph.nodes.length;
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  assert.equal(app.graph.nodes.length, 1);
  assert.equal(app.graph.nodes[0].id, pump.id);
  assert.equal(app.graph.edges.length, 0);
  app.handleProcessKeydown(keyEvent('y', { ctrlKey: true }));
  assert.equal(app.graph.nodes.length, populated);
  assert.equal(app.undoStackLength, 1);
});

test('part-load shape tightens the electricity limit below the setpoint SEC', () => {
  const base = { pumpKWhPerM3: 0.4, densityKgM3: 1025 };
  const power = 2;
  const plain = solveOperation(pumpCase(base, { capacityM3: 10, setpoint: 10, feedKg: 10250, powerKWh: power }));
  assert.equal(plain.nodes.pump.activity, 5);
  assert.equal(plain.nodes.pump.consumed.electricity.kWh, 2);
  assert.ok(plain.nodes.pump.limitedBy.includes('electricity'));

  const shaped = solveOperation(pumpCase({ ...base, partLoadK: 0.4 }, { capacityM3: 10, setpoint: 10, feedKg: 10250, powerKWh: power }));
  const pump = shaped.nodes.pump;
  assert.ok(pump.activity < 5 - 1e-3, pump.activity);
  assert.ok(pump.limitedBy.includes('electricity'));
  const q = pump.activity / 10;
  const secHat = 0.4 * (1 + 0.4 * (1 - q) ** 2);
  assert.ok(Math.abs(pump.pumpKWhPerUnit - secHat) < 1e-8);
  assert.ok(Math.abs(pump.consumed.electricity.kWh - pump.activity * secHat) < 1e-6);
  assert.ok(pump.consumed.electricity.kWh <= power + 1e-8);
  assert.ok(pump.consumed.electricity.kWh > power - 1e-4);
  // Setpoint is at rated flow, so the old planned-Q SEC was 0.4. Honest Q is lower.
  assert.ok(pump.pumpPartLoadQ < 0.5);

  const halfDemand = 5 * 0.4 * (1 + 0.4 * (1 - 0.5) ** 2);
  const cut = solveOperation(pumpCase(
    { ...base, partLoadK: 0.4 },
    { capacityM3: 10, setpoint: 5, feedKg: 10250, powerKWh: halfDemand * 0.5 },
  ));
  const cutPump = cut.nodes.pump;
  const naive = (halfDemand * 0.5) / (0.4 * (1 + 0.4 * 0.25));
  assert.ok(cutPump.activity < naive - 1e-4, `${cutPump.activity} vs ${naive}`);
  assert.ok(cutPump.limitedBy.includes('electricity'));
  const q2 = cutPump.pumpPartLoadQ;
  const sec2 = 0.4 * (1 + 0.4 * (1 - q2) ** 2);
  assert.ok(Math.abs(cutPump.pumpKWhPerUnit - sec2) < 1e-8);
  assert.ok(Math.abs(cutPump.consumed.electricity.kWh - cutPump.activity * sec2) < 1e-6);
});

test('tds_mg_per_L is a labeled UNESCO proxy, not a measured density', () => {
  const rho0 = tea.estimateDensityKgM3FromSalinity(35);
  const onePass = tea.estimateDensityKgM3FromSalinity(35000 / rho0);
  const hint = tea.densityHintFromAssay({ tds_mg_per_L: 35000 });
  assert.equal(hint.source, 'salinity estimate (UNESCO 25 °C, TDS mg/L proxy)');
  const refined = hint.densityKgM3;
  assert.ok(Math.abs(refined - tea.estimateDensityKgM3FromSalinity(35000 / refined)) < 1e-4);
  assert.ok(Math.abs(refined - 1022.755) < 0.001, refined);
  assert.ok(Math.abs(refined - onePass) > 0.005);
  assert.ok(hint.densityKgM3 < rho0);
  assert.equal(
    tea.densityHintFromAssay({ salinity_g_per_kg: 35, tds_mg_per_L: 10000 }).source,
    'salinity estimate (UNESCO 25 °C)',
  );
  const hot = tea.densityHintFromAssay({ tds_mg_per_L: 80000 });
  assert.equal(hot.densityKgM3, null);
  assert.match(hot.source, /fluid default/);
  assert.match(hot.source, /TDS mg\/L/);

  const app = loadApp();
  app.loadAbundanceHub();
  const tank = app.addNode('material-buffer', { silent: true });
  app.site.assay = { kind: 'seawater', tds_mg_per_L: 35000 };
  tank.params.fluidClass = 'seawater';
  delete tank.params.densityKgM3;
  delete tank.params.densityOverride;
  app.refreshBufferEconomics(tank);
  assert.ok(Math.abs(tank.params.densityKgM3 - refined) < 1e-6);
  assert.equal(tank.economics.densitySource, hint.source);
  assert.notEqual(tank.params.densityKgM3, 1025);
});
