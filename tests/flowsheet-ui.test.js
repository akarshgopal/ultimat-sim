const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApp(localStorage, economics) {
  const elements = new Map();
  const makeElement = () => ({
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    classList: { add() {}, remove() {} },
    setAttribute(name, value) { this[name] = value; },
    innerHTML: '',
    textContent: '',
    hidden: false,
  });
  const document = {
    body: makeElement(),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelector() { return makeElement(); },
  };
  const context = vm.createContext({ document, console, localStorage });
  context.window = context;
  if (economics) context.FlowsheetEconomics = economics;
  context.__elements = elements;
  for (const file of ['engine/model.js', 'engine/units.js', 'engine/solve.js', ...(economics ? [] : ['engine/economics.js']), 'cases/sabatier.js', 'cases/abundance.js', 'js/flowsheet-app.js']) {
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

test('catalog renders ordered palettes and palette clicks add the selected block', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const building = context.__elements.get('buildingPalette').innerHTML;
  const utility = context.__elements.get('utilityPalette').innerHTML;
  const units = markup => [...markup.matchAll(/data-unit="([^"]+)"/g)].map(match => match[1]);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'flowsheet.css'), 'utf8');

  assert.deepEqual(units(building), ['swro', 'med', 'msf', 'electrolyzer', 'dac', 'sabatier', 'asu', 'ammonia', 'brine-minerals', 'chlor-alkali', 'bromine-recovery', 'aluminium-smelter', 'hydrogen-dri', 'titanium-kroll', 'solar-pv', 'nuclear-electricity', 'battery', 'solar-thermal', 'thermal-storage']);
  assert.deepEqual(units(utility), ['electrical-bus', 'material-splitter', 'material-mixer', 'material-source', 'electricity-source', 'grid-electricity', 'heat-source', 'consumable-source', 'material-sink', 'heat-sink', 'electricity-sink']);
  assert.match(building, /Multi-effect distillation.*Low-grade heat \+ seawater → water/);
  assert.match(utility, /class="building-glyph carbon">↓H/);
  assert.match(html, /<div class="building-palette" id="buildingPalette">\s*<\/div>/);
  assert.match(html, /<div class="building-palette" id="utilityPalette">\s*<\/div>/);
  assert.doesNotMatch(html, /js\/format-numbers\.js/);
  assert.match(html, /id="canvasZoom"/);
  assert.match(css, /zoom: 0\.75/);
  assert.doesNotMatch(css, /width: 133\.333%/);

  context.__elements.get('buildingPalette').listeners.click({ target: { closest: () => ({ dataset: { unit: 'dac' } }) } });
  context.__elements.get('utilityPalette').listeners.click({ target: { closest: () => ({ dataset: { unit: 'electrical-bus' } }) } });
  assert.equal(app.graph.nodes.length, 2);
  assert.equal(app.graph.nodes[0].unit, 'dac');
  assert.equal(app.graph.nodes[1].unit, 'electrical-bus');
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
  assert.ok(dac.position.x - source.position.x >= 220);
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

test('an electricity bus output connects to multiple process inputs', () => {
  const app = loadApp().__FLOWSHEET_APP__;
  const source = app.addNode('electricity-source');
  const bus = app.addNode('electrical-bus');
  const consumers = [app.addNode('swro'), app.addNode('dac'), app.addNode('electrolyzer')];
  app.choosePort({ node: source.id, port: 'out', direction: 'out' });
  app.choosePort({ node: bus.id, port: 'in', direction: 'in' });
  for (const consumer of consumers) {
    app.choosePort({ node: bus.id, port: 'out', direction: 'out' });
    app.choosePort({ node: consumer.id, port: 'electricity', direction: 'in' });
  }

  assert.equal(app.graph.edges.filter(edge => edge.from.node === bus.id).length, 3);
  assert.deepEqual(consumers.map(consumer => app.setpoints[consumer.id]), [40, 10, 10]);
});

test('process blocks expose literature presets and adjustable physical assumptions', () => {
  const context = loadApp();
  const dac = context.__FLOWSHEET_APP__.addNode('dac');
  const controls = context.__elements.get('nodeControls').innerHTML;

  assert.equal(dac.processPreset, 'solid');
  assert.match(controls, /Solid sorbent/);
  assert.match(controls, /KOH \+ calcium looping/);
  assert.match(controls, /Electro-swing adsorption/);
  assert.match(controls, /data-param="captureFraction"/);
  assert.match(controls, /data-param="wasteHeatT_C"/);
  assert.match(controls, /Keith et al\. 2018/);
});

test('energy blocks expose physical output and editable economics', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const pv = app.addNode('solar-pv');
  assert.equal(pv.params.stream.kWh, 1000 * 24 * 0.24);
  assert.match(context.__elements.get('nodeControls').innerHTML, /NREL 2024 ATB/);
  assert.match(context.__elements.get('inspectorMetrics').innerHTML, /Simple LCOE/);

  const nuclear = app.addNode('nuclear-electricity');
  assert.equal(nuclear.processPreset, 'radiant');
  assert.equal(nuclear.params.capacityKW, 1000);
  assert.match(context.__elements.get('nodeControls').innerHTML, /not vendor quotes/i);

  const battery = app.addNode('battery');
  assert.deepEqual(Object.keys(context.FlowsheetUnits.UNITS[battery.unit].ports), ['in', 'out']);
  assert.match(context.__elements.get('inspectorMetrics').innerHTML, /Installed storage CAPEX/);
});

test('auto boundaries complete both ports of an energy storage block', () => {
  const app = loadApp().__FLOWSHEET_APP__;
  app.addNode('battery');
  app.completeBoundaries();

  assert.deepEqual([...app.graph.nodes].map(node => node.unit), ['battery', 'electricity-source', 'electricity-sink']);
  assert.equal(app.graph.edges.length, 2);
  assert.equal(app.result.nodes['battery-1'].activity, 950);
});

test('methane recycle example loads a converged circular water exchange', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;

  app.loadMethaneRecycle();

  assert.equal(app.result.convergence.converged, true);
  assert.ok(app.graph.edges.some(edge => edge.recycle));
  assert.match(context.__elements.get('exchangeList').innerHTML, /Recovered process water/);
  assert.match(context.__elements.get('flowsheetCanvas').innerHTML, /flow-edge material recycle/);
  assert.match(context.__elements.get('flowsheetCanvas').innerHTML, /L\d+ (\d+(\.\d+)?) C/);
  assert.equal(app.economics.installedCapex, 52425);
  assert.ok(Number.isFinite(app.economics.npv));
  assert.match(context.__elements.get('nodeControls').innerHTML, /Installed CAPEX/);
  assert.match(context.__elements.get('economicsMetrics').innerHTML, /Levelized delivered cost/);
});

test('abundance hub loads coupled brine, chlor-alkali, ASU, bromine, and ammonia routes', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadAbundanceHub();

  assert.equal(app.result.convergence.converged, true);
  assert.equal(app.graph.nodes.length, 23);
  assert.ok(app.result.nodes.ammonia.activity > 0);
  assert.ok(app.result.nodes['bromine-recovery'].activity > 0);
  assert.ok(app.result.nodes.minerals.outlets.lithium.mol.LiCl > 0);
  assert.ok(app.economics.annualRevenue > 0);
  assert.match(context.__elements.get('nodeControls').innerHTML, /Lithium recovery/);
});

test('focus mode gives the graph the full workspace', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;

  app.toggleCanvasFocus();
  assert.equal(context.__elements.get('focusCanvas').textContent, 'Show panels');
  assert.equal(context.__elements.get('focusCanvas')['aria-pressed'], 'true');
});

test('canvas zoom rescales the SVG and clamps to a usable range', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.addNode('material-source');

  app.setCanvasZoom(0.5);
  assert.equal(app.canvasZoom, 0.5);
  assert.equal(context.__elements.get('canvasZoomValue').textContent, '50%');
  assert.match(context.__elements.get('flowsheetCanvas').innerHTML, /style="width:700px;height:310px;max-width:none"/);

  app.setCanvasZoom(10);
  assert.equal(app.canvasZoom, 2);
});

test('baseline comparison clones the graph and renders economics deltas plus synergies', () => {
  const economics = {
    evaluateEconomics(graphCase) {
      const battery = graphCase.graph.nodes.find(node => node.unit === 'battery');
      const capex = battery ? battery.params.capexPerKWh * battery.capacity : 0;
      return {
        economics: {
          totalCapex: capex,
          totalAnnualRevenue: 100,
          annualCost: capex / 10,
          annualNetCash: 90 - capex / 10,
          npv: 1000 - capex,
          irr: 0.1,
          sourcePurchases: { total: 10 },
          disposal: { total: 5 },
          revenue: { products: 100 },
        },
      };
    },
  };
  const context = loadApp(undefined, economics);
  const app = context.__FLOWSHEET_APP__;
  app.addNode('battery');
  app.completeBoundaries();
  app.captureBaseline();
  const baselineCapex = app.baseline.graphCase.graph.nodes[0].params.capexPerKWh;

  app.graph.nodes[0].params.capexPerKWh = 200;
  app.solve();

  assert.equal(baselineCapex, 400);
  assert.equal(app.baseline.graphCase.graph.nodes[0].params.capexPerKWh, 400);
  assert.match(context.__elements.get('comparisonMetrics').innerHTML, /CAPEX/);
  assert.match(context.__elements.get('comparisonMetrics').innerHTML, /NPV/);
  assert.match(context.__elements.get('synergyLedger').innerHTML, /Avoided source purchases/);
});
