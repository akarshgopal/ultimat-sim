const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApp(localStorage) {
  const elements = new Map();
  const makeElement = () => ({
    addEventListener() {},
    classList: { add() {}, remove() {} },
    innerHTML: '',
    textContent: '',
    hidden: false,
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelector() { return makeElement(); },
  };
  const context = vm.createContext({ document, console, localStorage });
  context.window = context;
  context.__elements = elements;
  for (const file of ['engine/model.js', 'engine/units.js', 'engine/solve.js', 'js/flowsheet-app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return context;
}

test('factory starts blank and wiring blocks does not rewrite their setpoints', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;

  assert.deepEqual([...app.graph.nodes], []);
  const dac = app.addNode('dac');
  const sabatier = app.addNode('sabatier');
  assert.deepEqual(Object.keys(context.FlowsheetUnits.UNITS.dac.ports), [
    'air', 'electricity', 'heat', 'consumables', 'capturedCo2', 'depletedAir', 'wasteHeat',
  ]);

  app.choosePort({ node: dac.id, port: 'capturedCo2', direction: 'out' });
  app.choosePort({ node: sabatier.id, port: 'co2', direction: 'in' });

  assert.equal(app.graph.edges.length, 1);
  assert.equal(app.setpoints[dac.id], 10);
  assert.equal(app.setpoints[sabatier.id], 5);
});

test('a manually wired DAC runs only after every source and sink is connected', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const dac = app.addNode('dac');
  const endpoints = [
    [app.addNode('material-source'), 'out', 'air'],
    [app.addNode('electricity-source'), 'out', 'electricity'],
    [app.addNode('heat-source'), 'out', 'heat'],
    [app.addNode('consumable-source'), 'out', 'consumables'],
  ];
  for (const [source, output, input] of endpoints) {
    app.choosePort({ node: source.id, port: output, direction: 'out' });
    app.choosePort({ node: dac.id, port: input, direction: 'in' });
  }
  for (const output of ['capturedCo2', 'depletedAir']) {
    const sink = app.addNode('material-sink');
    app.choosePort({ node: dac.id, port: output, direction: 'out' });
    app.choosePort({ node: sink.id, port: 'in', direction: 'in' });
  }
  const heatSink = app.addNode('heat-sink');
  app.choosePort({ node: dac.id, port: 'wasteHeat', direction: 'out' });
  app.choosePort({ node: heatSink.id, port: 'in', direction: 'in' });

  assert.equal(app.result.nodes[dac.id].activity, 10);

  endpoints[3][0].params.stream.amount = 0.1;
  app.solve();
  assert.deepEqual([...app.result.nodes[dac.id].limitedBy], ['consumables']);
  assert.match(context.__elements.get('flowsheetCanvas').innerHTML, /flow-edge consumable bottleneck/);
  assert.match(context.__elements.get('flowsheetCanvas').innerHTML, /flow-node bottleneck/);
});

test('auto arrange puts sources before converters and sinks', () => {
  const app = loadApp().__FLOWSHEET_APP__;
  const source = app.addNode('material-source');
  const dac = app.addNode('dac');
  const sink = app.addNode('material-sink');
  app.choosePort({ node: source.id, port: 'out', direction: 'out' });
  app.choosePort({ node: dac.id, port: 'air', direction: 'in' });
  app.choosePort({ node: dac.id, port: 'capturedCo2', direction: 'out' });
  app.choosePort({ node: sink.id, port: 'in', direction: 'in' });

  source.position = { x: 900, y: 500 };
  dac.position = { x: 20, y: 500 };
  sink.position = { x: 20, y: 20 };
  app.autoArrange();

  assert.ok(source.position.x < dac.position.x);
  assert.ok(dac.position.x < sink.position.x);
});

test('autosave restores the graph and named saves can be switched', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const first = loadApp(storage).__FLOWSHEET_APP__;
  const dac = first.addNode('dac');
  dac.position = { x: 777, y: 333 };
  first.solve();
  assert.equal(first.saveNamed('DAC experiment'), true);
  first.clearFactory();

  assert.equal(first.loadNamed('DAC experiment'), true);
  assert.equal(first.graph.nodes[0].position.x, 777);

  const reloaded = loadApp(storage).__FLOWSHEET_APP__;
  assert.equal(reloaded.graph.nodes[0].unit, 'dac');
  assert.equal(reloaded.graph.nodes[0].position.x, 777);
  assert.equal(reloaded.graph.nodes[0].position.y, 333);
});

test('remaining converter ports can be completed with sources and sinks', () => {
  const app = loadApp().__FLOWSHEET_APP__;
  const dac = app.addNode('dac');

  app.completeBoundaries();

  assert.equal(app.graph.nodes.length, 8);
  assert.equal(app.graph.edges.length, 7);
  assert.equal(app.result.nodes[dac.id].activity, 10);
  assert.deepEqual(
    [...new Set(app.graph.nodes.filter(node => node.id !== dac.id).map(node => node.unit))].sort(),
    ['consumable-source', 'electricity-source', 'heat-sink', 'heat-source', 'material-sink', 'material-source']
  );
});
