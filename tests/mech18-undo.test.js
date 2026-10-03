const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApp() {
  const elements = new Map();
  const documentListeners = {};
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
      add(name) {
        const parts = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
        parts.add(name);
        el.className = [...parts].join(' ');
      },
      remove(name) {
        const parts = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
        parts.delete(name);
        el.className = [...parts].join(' ');
      },
      toggle(name, force) {
        const parts = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
        const on = force === undefined ? !parts.has(name) : !!force;
        if (on) parts.add(name); else parts.delete(name);
        el.className = [...parts].join(' ');
        return on;
      },
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
    addEventListener(type, listener) {
      (documentListeners[type] ||= []).push(listener);
    },
  };
  const context = vm.createContext({ document, console, localStorage: null });
  context.window = context;
  context.__elements = elements;
  context.__documentListeners = documentListeners;
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
  return context;
}

function keyEvent(key, extras = {}) {
  return {
    key,
    target: extras.target || { tagName: 'DIV' },
    shiftKey: !!extras.shiftKey,
    ctrlKey: !!extras.ctrlKey,
    metaKey: !!extras.metaKey,
    preventDefault() { this.prevented = true; },
    prevented: false,
  };
}

test('Ctrl/Cmd+Z undoes Delete of a Process node and its edges', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.activateTab('process');
  app.clearFactory();
  app.clearUndoStack();
  const tank = app.addNode('material-buffer');
  const sink = app.addNode('material-sink');
  app.choosePort({ node: tank.id, port: 'out', direction: 'out' });
  app.choosePort({ node: sink.id, port: 'in', direction: 'in' });
  assert.equal(app.graph.edges.length, 1);
  assert.equal(app.graph.nodes.length, 2);

  app.selectedNodeId = tank.id;
  app.handleProcessKeydown(keyEvent('Delete'));
  assert.equal(app.graph.nodes.some(node => node.id === tank.id), false);
  assert.equal(app.graph.edges.length, 0);
  assert.equal(app.undoStackLength, 1);

  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  assert.equal(app.graph.nodes.some(node => node.id === tank.id), true);
  assert.equal(app.graph.edges.length, 1);
  assert.equal(app.selectedNodeId, tank.id);
  assert.equal(app.undoStackLength, 0);
});

test('Cmd+Z undoes Delete of a selected edge', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.activateTab('process');
  app.clearFactory();
  app.clearUndoStack();
  const tank = app.addNode('material-buffer');
  const sink = app.addNode('material-sink');
  app.choosePort({ node: tank.id, port: 'out', direction: 'out' });
  app.choosePort({ node: sink.id, port: 'in', direction: 'in' });
  app.selectedEdgeIndex = 0;
  app.handleProcessKeydown(keyEvent('Delete'));
  assert.equal(app.graph.edges.length, 0);

  app.handleProcessKeydown(keyEvent('z', { metaKey: true }));
  assert.equal(app.graph.edges.length, 1);
  assert.equal(app.selectedEdgeIndex, 0);
});

test('Ctrl+Z ignored while typing in inputs', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.activateTab('process');
  app.clearFactory();
  app.clearUndoStack();
  const tank = app.addNode('material-buffer');
  app.selectedNodeId = tank.id;
  app.handleProcessKeydown(keyEvent('Delete'));
  assert.equal(app.graph.nodes.length, 0);
  assert.equal(app.undoStackLength, 1);

  const input = { tagName: 'INPUT' };
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true, target: input }));
  assert.equal(app.graph.nodes.length, 0);
  assert.equal(app.undoStackLength, 1);
});

test('buffer on brine feed infers brine fluid class and $/m³ intensity', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.clearFactory();
  const brine = app.addNode('material-source', { preset: 'brine', silent: true });
  const tank = app.addNode('material-buffer', { silent: true });
  app.choosePort({ node: brine.id, port: 'out', direction: 'out' });
  app.choosePort({ node: tank.id, port: 'in', direction: 'in' });
  assert.equal(app.inferBufferFluidClass(tank), 'brine');
  app.refreshBufferEconomics(tank);
  assert.equal(tank.economics.fluidClass, 'brine');
  assert.ok(tank.economics.capexPerM3 >= 700); // 750 base (no site region)
  assert.ok(tank.economics.installedCapex > 5000);
});

test('arrow nudge is one undo gesture and Ctrl+Z restores the position', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.activateTab('process');
  app.clearFactory();
  app.clearUndoStack();
  const tank = app.addNode('material-buffer');
  app.clearUndoStack();
  app.selectedNodeId = tank.id;
  const x0 = tank.position.x;
  const y0 = tank.position.y;
  app.nudgeSelectedNode(10, 0);
  app.nudgeSelectedNode(10, 0);
  assert.equal(tank.position.x, x0 + 20);
  assert.equal(app.undoStackLength, 1);
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  const restored = app.graph.nodes.find(node => node.id === tank.id);
  assert.equal(restored.position.x, x0);
  assert.equal(restored.position.y, y0);
});

test('slider ticks share one undo; Ctrl+Z restores the parameter', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.activateTab('process');
  app.clearFactory();
  const pump = app.addNode('intake-pump');
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
  app.handleProcessKeydown(keyEvent('z', { metaKey: true }));
  const restored = app.graph.nodes.find(node => node.id === pump.id);
  assert.equal(restored.params.pumpKWhPerM3, 0.4);
  assert.equal(restored.params.pumpSecOverride, undefined);
});

test('Delete still undoes after a parameter edit', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.activateTab('process');
  app.clearFactory();
  const tank = app.addNode('material-buffer');
  app.clearUndoStack();
  app.selectedNodeId = tank.id;
  const target = { name: 'bufferParameter', type: 'range', dataset: { param: 'initialKg' }, value: '250' };
  app.handleInspectorInput({ type: 'change', target });
  assert.equal(tank.params.initialKg, 250);
  app.handleProcessKeydown(keyEvent('Delete'));
  assert.equal(app.graph.nodes.some(node => node.id === tank.id), false);
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  assert.equal(app.graph.nodes.some(node => node.id === tank.id), true);
  app.handleProcessKeydown(keyEvent('z', { ctrlKey: true }));
  const restored = app.graph.nodes.find(node => node.id === tank.id);
  assert.equal(restored.params.initialKg, 0);
});

test('Dead Sea brine buffer uses assay density ~1240 unless overridden; freshwater stays 1000', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadAbundanceHub();
  const tank = app.addNode('material-buffer', { silent: true });
  tank.params.fluidClass = 'brine';
  delete tank.params.densityOverride;
  delete tank.params.densityKgM3;
  app.refreshBufferEconomics(tank);
  assert.ok(Math.abs(tank.params.densityKgM3 - 1240) < 0.01);
  assert.equal(tank.economics.densitySource, 'site assay');
  assert.equal(tank.params.densityOverride, undefined);

  tank.params.densityKgM3 = 1100;
  tank.params.densityOverride = true;
  app.refreshBufferEconomics(tank);
  assert.equal(tank.params.densityKgM3, 1100);
  assert.equal(tank.economics.densitySource, 'override');

  tank.params.fluidClass = 'freshwater';
  delete tank.params.densityKgM3;
  delete tank.params.densityOverride;
  app.refreshBufferEconomics(tank);
  assert.equal(tank.params.densityKgM3, 1000);
  assert.equal(tank.economics.densitySource, 'fluid default');
});
