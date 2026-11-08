// Process-canvas editor interactions, run against the real app scripts in a vm
// with a minimal fake DOM: delete, undo/redo, gesture merging, the typing
// guard, and buffer-tank costing from the inferred fluid.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const tea = require('../data/tea-screening');
const { expandAppFiles } = require('./helpers/app-source');

const BRINES = [
  'dead-sea', 'persian-gulf-sabkha', 'atacama-lithium', 'lake-mackay-wa', 'great-salt-lake', 'salton-sea',
  'uyuni-lithium', 'qaidam', 'danakil', 'searles-lake', 'hombre-muerto-lithium', 'maricunga-lithium',
  'clayton-valley', 'zabuye-lithium', 'red-sea-sabkha', 'kutch-subsoil', 'texas-gulf-desal', 'mediterranean-swro',
].map(id => `data/${id}-brine.js`);
const SEAWATERS = [
  'almeria', 'persian-gulf', 'red-sea', 'texas-gulf', 'pilbara-indian-ocean', 'atacama-pacific',
  'morocco-atlantic', 'arabian-sea', 'gulf-of-kutch', 'benguela-atlantic',
].map(id => `data/${id}-seawater.js`);
const SCRIPTS = [
  'engine/model.js', 'engine/units.js', 'engine/heat.js', 'engine/solve.js', 'engine/economics.js',
  'engine/material-power-breakeven.js', 'engine/footprint.js', 'engine/size.js', 'engine/network.js',
  'engine/uncertainty.js', 'engine/map-site.js', 'data/pvgis-almeria-hourly.js',
  ...BRINES, ...SEAWATERS,
  'data/site-assays.js', 'data/site-presets.js', 'data/tea-screening.js',
  'cases/_shared.js', 'cases/sabatier.js', 'cases/coastal.js', 'cases/methanol.js', 'cases/abundance.js', 'cases/network.js',
  'js/flowsheet-app.js',
];

function makeElement() {
  const el = {
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    className: '',
    setAttribute(name, value) { this[name] = value; },
    _innerHTML: '',
    hidden: false,
    open: false,
    dataset: {},
    get innerHTML() { return this._innerHTML; },
    set innerHTML(value) { this._innerHTML = String(value ?? ''); },
    get textContent() { return this._innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); },
    set textContent(value) { this._innerHTML = String(value ?? ''); },
  };
  const parts = () => new Set(String(el.className || '').split(/\s+/).filter(Boolean));
  el.classList = {
    add(name) { el.className = [...parts().add(name)].join(' '); },
    remove(name) { const set = parts(); set.delete(name); el.className = [...set].join(' '); },
    toggle(name, force) {
      const set = parts();
      const on = force === undefined ? !set.has(name) : !!force;
      if (on) set.add(name); else set.delete(name);
      el.className = [...set].join(' ');
      return on;
    },
  };
  return el;
}

function loadApp() {
  const elements = new Map();
  const document = {
    body: makeElement(),
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const context = vm.createContext({ document, console, localStorage: null });
  context.window = context;
  for (const file of expandAppFiles(SCRIPTS)) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return { app: context.__FLOWSHEET_APP__, elements };
}

// Fresh Process canvas with an empty factory and undo history.
function processCanvas() {
  const loaded = loadApp();
  loaded.app.activateTab('process');
  loaded.app.clearFactory();
  loaded.app.clearUndoStack();
  return loaded;
}

const TYPING = { tagName: 'INPUT' };

function key(app, name, extras = {}) {
  const event = {
    key: name,
    target: extras.target || { tagName: 'DIV' },
    shiftKey: !!extras.shiftKey,
    ctrlKey: !!extras.ctrlKey,
    metaKey: !!extras.metaKey,
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
  app.handleProcessKeydown(event);
  return event;
}

const undo = (app, extras = {}) => key(app, 'z', { ctrlKey: true, ...extras });
const hasNode = (app, id) => app.graph.nodes.some(node => node.id === id);

function connect(app, from, to) {
  app.choosePort({ node: from.id, port: 'out', direction: 'out' });
  app.choosePort({ node: to.id, port: 'in', direction: 'in' });
}

test('Escape clears selection and a pending connect; Delete removes the node and its edges', () => {
  const { app } = processCanvas();
  const tank = app.addNode('material-buffer');
  const sink = app.addNode('material-sink');
  connect(app, tank, sink);
  app.choosePort({ node: tank.id, port: 'out', direction: 'out' });
  app.selectedNodeId = tank.id;
  assert.ok(app.pendingPort);
  key(app, 'Escape');
  assert.equal(app.pendingPort, null);
  assert.equal(app.selectedNodeId, null);

  app.selectedNodeId = tank.id;
  key(app, 'Delete');
  assert.deepEqual([...app.graph.nodes.map(node => node.id)], [sink.id]);
  assert.equal(app.graph.edges.length, 0);
  assert.equal(app.selectedNodeId, null);
});

test('Delete removes the selected edge only', () => {
  const { app } = processCanvas();
  const tank = app.addNode('material-buffer');
  const sink = app.addNode('material-sink');
  connect(app, tank, sink);
  app.selectedEdgeIndex = 0;
  key(app, 'Delete');
  assert.equal(app.graph.edges.length, 0);
  assert.equal(app.graph.nodes.length, 2);
  assert.equal(app.selectedEdgeIndex, null);
});

test('undo restores a deleted node with its edges, and a deleted edge with its selection', () => {
  const { app } = processCanvas();
  const tank = app.addNode('material-buffer');
  const sink = app.addNode('material-sink');
  connect(app, tank, sink);
  app.clearUndoStack();

  app.selectedNodeId = tank.id;
  key(app, 'Delete');
  assert.equal(app.graph.edges.length, 0);
  assert.equal(app.undoStackLength, 1);
  undo(app);
  assert.ok(hasNode(app, tank.id));
  assert.equal(app.graph.edges.length, 1);
  assert.equal(app.selectedNodeId, tank.id);
  assert.equal(app.undoStackLength, 0);

  app.selectedEdgeIndex = 0;
  key(app, 'Delete');
  assert.equal(app.graph.edges.length, 0);
  key(app, 'z', { metaKey: true });
  assert.equal(app.graph.edges.length, 1);
  assert.equal(app.selectedEdgeIndex, 0);
});

test('placing a block and connecting an edge are each one undo step', () => {
  const { app } = processCanvas();
  const tank = app.addNode('material-buffer');
  const sink = app.addNode('material-sink');
  assert.equal(app.undoStackLength, 2);
  undo(app);
  assert.ok(!hasNode(app, sink.id));
  assert.ok(hasNode(app, tank.id));
  key(app, 'z', { metaKey: true });
  assert.equal(app.graph.nodes.length, 0);

  const a = app.addNode('material-buffer');
  const b = app.addNode('material-sink');
  app.clearUndoStack();
  app.choosePort({ node: a.id, port: 'out', direction: 'out' });
  assert.equal(app.undoStackLength, 0, 'a half-made connection is not an edit');
  app.choosePort({ node: b.id, port: 'in', direction: 'in' });
  assert.equal(app.graph.edges.length, 1);
  assert.equal(app.undoStackLength, 1);
  undo(app);
  assert.equal(app.graph.edges.length, 0);
  assert.equal(app.graph.nodes.length, 2);
});

test('redo re-applies an undo via Ctrl+Shift+Z or Ctrl/Cmd+Y; a new edit clears it', () => {
  const { app } = processCanvas();
  const tank = app.addNode('material-buffer');
  undo(app);
  assert.equal(app.graph.nodes.length, 0);
  assert.equal(app.redoStackLength, 1);
  key(app, 'z', { ctrlKey: true, shiftKey: true });
  assert.ok(hasNode(app, tank.id));
  assert.equal(app.undoStackLength, 1);
  assert.equal(app.redoStackLength, 0);

  key(app, 'z', { metaKey: true });
  key(app, 'y', { metaKey: true });
  assert.ok(hasNode(app, tank.id));

  undo(app);
  app.addNode('material-sink');
  assert.equal(app.redoStackLength, 0);
  key(app, 'y', { ctrlKey: true });
  assert.ok(!hasNode(app, tank.id));
});

test('the Redo button is disabled with an empty redo stack and redoes on click', () => {
  const { app, elements } = processCanvas();
  const button = elements.get('redoCanvas');
  assert.equal(button.disabled, true);
  assert.equal(button['aria-disabled'], 'true');
  const tank = app.addNode('material-buffer');
  assert.equal(button.disabled, true);
  undo(app);
  assert.equal(button.disabled, false);
  assert.equal(button['aria-disabled'], 'false');
  button.listeners.click();
  assert.ok(hasNode(app, tank.id));
  assert.equal(app.redoStackLength, 0);
  assert.equal(button.disabled, true);
});

test('typing in an input ignores Backspace, undo and redo shortcuts', () => {
  const { app } = processCanvas();
  const tank = app.addNode('material-buffer');
  const sink = app.addNode('material-sink');
  connect(app, tank, sink);
  app.selectedEdgeIndex = 0;
  key(app, 'Backspace', { target: TYPING });
  assert.equal(app.graph.edges.length, 1);

  const undoDepth = app.undoStackLength;
  undo(app, { target: TYPING });
  key(app, 'z', { metaKey: true, target: TYPING });
  assert.equal(app.graph.edges.length, 1);
  assert.equal(app.undoStackLength, undoDepth);

  undo(app);
  const nodes = app.graph.nodes.length;
  const edges = app.graph.edges.length;
  key(app, 'y', { ctrlKey: true, target: TYPING });
  key(app, 'Z', { metaKey: true, shiftKey: true, target: TYPING });
  assert.equal(app.redoStackLength, 1);
  assert.deepEqual([app.graph.nodes.length, app.graph.edges.length], [nodes, edges]);
});

test('arrow nudges merge into one undo gesture', () => {
  const { app } = processCanvas();
  const tank = app.addNode('material-buffer');
  app.clearUndoStack();
  app.selectedNodeId = tank.id;
  const { x, y } = tank.position;
  app.nudgeSelectedNode(10, 0);
  app.nudgeSelectedNode(10, 0);
  assert.equal(tank.position.x, x + 20);
  assert.equal(app.undoStackLength, 1);
  undo(app);
  const restored = app.graph.nodes.find(node => node.id === tank.id);
  assert.deepEqual([restored.position.x, restored.position.y], [x, y]);
});

test('slider ticks merge into one undo gesture and undo in order with a later Delete', () => {
  const { app } = processCanvas();
  const pump = app.addNode('intake-pump');
  const original = pump.params.pumpKWhPerM3;
  app.clearUndoStack();
  app.selectedNodeId = pump.id;
  const target = { name: 'processParameter', type: 'range', dataset: { param: 'pumpKWhPerM3' }, value: '0.8' };
  app.handleInspectorInput({ type: 'input', target });
  target.value = '1.1';
  app.handleInspectorInput({ type: 'input', target });
  app.handleInspectorInput({ type: 'change', target });
  assert.equal(pump.params.pumpKWhPerM3, 1.1);
  assert.equal(pump.params.pumpSecOverride, true);
  assert.equal(app.undoStackLength, 1);

  key(app, 'Delete');
  assert.ok(!hasNode(app, pump.id));
  undo(app);
  assert.equal(app.graph.nodes.find(node => node.id === pump.id).params.pumpKWhPerM3, 1.1);
  key(app, 'z', { metaKey: true });
  const restored = app.graph.nodes.find(node => node.id === pump.id);
  assert.equal(restored.params.pumpKWhPerM3, original);
  assert.equal(restored.params.pumpSecOverride, undefined);
});

test('undo history is capped at 20 steps and a place does not merge with a nudge', () => {
  const { app } = processCanvas();
  const first = app.addNode('material-buffer');
  app.clearUndoStack();
  app.selectedNodeId = first.id;
  app.nudgeSelectedNode(10, 0);
  const placed = [];
  for (let i = 0; i < 20; i += 1) placed.push(app.addNode('material-sink'));
  assert.equal(app.undoStackLength, 20);
  undo(app);
  assert.ok(!hasNode(app, placed.at(-1).id));
  assert.ok(hasNode(app, first.id));
});

test('Add sources & sinks is one undo gesture', () => {
  const { app } = processCanvas();
  const pump = app.addNode('intake-pump');
  app.clearUndoStack();
  app.completeBoundaries();
  const populated = app.graph.nodes.length;
  assert.ok(populated > 2);
  assert.equal(app.graph.edges.length, populated - 1);
  assert.equal(app.undoStackLength, 1);
  undo(app);
  assert.deepEqual([...app.graph.nodes.map(node => node.id)], [pump.id]);
  assert.equal(app.graph.edges.length, 0);
  key(app, 'y', { ctrlKey: true });
  assert.equal(app.graph.nodes.length, populated);
});

test('the inspector names a clamped part-load k on pumps and blowers', () => {
  const { app, elements } = processCanvas();
  for (const unit of ['intake-pump', 'gas-blower']) {
    const node = app.addNode(unit);
    node.params.partLoadK = 4;
    app.solve();
    assert.match(elements.get('nodeControls').innerHTML, /clamped to 3/, unit);
  }
});

test('a new buffer tank is costed from its inferred fluid class and density source', () => {
  const { app } = loadApp();
  app.clearFactory();
  const fresh = app.addNode('material-buffer', { silent: true });
  const spec = tea.getTankFluidSpec(fresh.params.fluidClass);
  assert.equal(fresh.economics.installedCapex, spec.capexPerM3 * fresh.params.capacityKg / spec.densityKgM3);
  assert.ok(fresh.economics.assetLifeYears > 0);

  const brine = app.addNode('material-source', { preset: 'brine', silent: true });
  const tank = app.addNode('material-buffer', { silent: true });
  connect(app, brine, tank);
  assert.equal(app.inferBufferFluidClass(tank), 'brine');
  app.refreshBufferEconomics(tank);
  assert.equal(tank.economics.fluidClass, 'brine');
  assert.ok(tank.economics.installedCapex > fresh.economics.installedCapex);

  // Density precedence on the Dead Sea hub: override > site assay > salinity / TDS estimate > fluid default.
  app.loadAbundanceHub();
  const hubTank = app.addNode('material-buffer', { silent: true });
  const salinityHint = tea.densityHintFromAssay({ salinity_g_per_kg: 35 });
  const tdsHint = tea.densityHintFromAssay({ tds_mg_per_L: 35000 });
  const rows = [
    { name: 'measured assay density', fluid: 'brine', density: app.site.assay.density_kg_per_L * 1000, source: 'site assay' },
    { name: 'manual override', fluid: 'brine', override: 1100, density: 1100, source: 'override' },
    { name: 'salinity estimate', fluid: 'seawater', assay: { kind: 'seawater', salinity_g_per_kg: 35 }, density: salinityHint.densityKgM3, source: salinityHint.source },
    { name: 'TDS mg/L estimate', fluid: 'seawater', assay: { kind: 'seawater', tds_mg_per_L: 35000 }, density: tdsHint.densityKgM3, source: tdsHint.source },
    { name: 'salinity outside the fit', fluid: 'brine', assay: { kind: 'brine', salinity_g_per_kg: 230 }, density: tea.getTankFluidSpec('brine').densityKgM3, source: /fluid default/ },
    { name: 'no density data', fluid: 'freshwater', assay: { kind: 'brine' }, density: tea.getTankFluidSpec('freshwater').densityKgM3, source: 'fluid default' },
  ];
  for (const row of rows) {
    if (row.assay) app.site.assay = row.assay;
    hubTank.params.fluidClass = row.fluid;
    delete hubTank.params.densityKgM3;
    delete hubTank.params.densityOverride;
    if (row.override) Object.assign(hubTank.params, { densityKgM3: row.override, densityOverride: true });
    app.refreshBufferEconomics(hubTank);
    assert.ok(Math.abs(hubTank.params.densityKgM3 - row.density) < 1e-6, `${row.name}: ${hubTank.params.densityKgM3}`);
    if (row.source instanceof RegExp) assert.match(hubTank.economics.densitySource, row.source, row.name);
    else assert.equal(hubTank.economics.densitySource, row.source, row.name);
  }
});
