const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApp(localStorage) {
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
  context.__elements = elements;
  for (const file of ['engine/model.js', 'engine/units.js', 'engine/heat.js', 'engine/solve.js', 'engine/economics.js', 'engine/footprint.js', 'engine/size.js', 'engine/network.js', 'engine/uncertainty.js', 'engine/map-site.js', 'data/pvgis-almeria-hourly.js', 'data/dead-sea-brine.js', 'data/almeria-seawater.js', 'cases/sabatier.js', 'cases/coastal.js', 'cases/abundance.js', 'cases/network.js', 'js/flowsheet-app.js']) {
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

test('palette clicks add the selected process and utility blocks', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  context.__elements.get('buildingPalette').listeners.click({ target: { closest: () => ({ dataset: { unit: 'dac-solid' } }) } });
  context.__elements.get('utilityPalette').listeners.click({ target: { closest: () => ({ dataset: { unit: 'electrical-bus' } }) } });
  assert.equal(app.graph.nodes.length, 2);
  assert.equal(app.graph.nodes[0].unit, 'dac-solid');
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

test('focus mode gives the graph the full workspace', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;

  app.toggleCanvasFocus();
  assert.equal(context.__elements.get('focusCanvas').textContent, 'Show panels');
  assert.equal(context.__elements.get('focusCanvas')['aria-pressed'], 'true');
});

test('baseline comparison preserves real engine economics and renders deltas and synergies', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadMethaneRecycle();
  app.captureBaseline();
  const baseline = JSON.stringify(app.baseline.economics);
  const capex = app.economics.installedCapex;
  app.graph.nodes.find(node => node.id === 'sabatier').economics.installedCapex += 100;
  app.graph.nodes.find(node => node.economics.unitCost > 0).economics.unitCost = 0;
  app.solve();

  assert.equal(JSON.stringify(app.baseline.economics), baseline);
  assert.equal(app.economics.installedCapex, capex + 100);
  assert.match(context.__elements.get('comparisonMetrics').innerHTML, /\+\$100/);
  const avoided = app.baseline.economics.breakdown.sourcePurchases - app.economics.breakdown.sourcePurchases;
  assert.ok(avoided > 0);
  assert.ok(context.__elements.get('synergyLedger').innerHTML.includes(`+$${avoided.toLocaleString('en-US', { maximumFractionDigits: 2 })}`));

  app.clearBaseline();
  assert.equal(context.__elements.get('comparisonPanel').hidden, true);
});

test('IRR always renders fractional engine rates as percentages, including above 100%', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadMethaneRecycle();
  const sale = app.graph.nodes.find(node => node.economics.disposition === 'sale');
  sale.economics.unitPrice = 1000;
  app.solve();
  assert.ok(app.economics.irr > 1);
  app.captureBaseline();
  sale.economics.unitPrice *= 2;
  app.solve();
  const percent = (app.economics.irr * 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const delta = ((app.economics.irr - app.baseline.economics.irr) * 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  assert.ok(context.__elements.get('economicsMetrics').innerHTML.includes(`${percent}%`));
  assert.ok(context.__elements.get('comparisonMetrics').innerHTML.includes(`${percent}%`));
  assert.ok(context.__elements.get('comparisonMetrics').innerHTML.includes(`+${delta} pp`));
});

test('site map picker lists cited layers and degrades without Leaflet', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const layers = context.__elements.get('siteMapLayers').innerHTML;
  assert.equal(typeof context.FlowsheetMapSite.circlePolygon, 'function');
  assert.match(layers, /OSM/);
  assert.match(layers, /PVGIS PV/);
  assert.match(layers, /Water screening/);
  assert.match(layers, /Site footprint/);
  assert.match(layers, /Network markers/);
  assert.match(layers, /openstreetmap\.org\/copyright/);
  assert.equal(context.__elements.get('siteMapEmpty').hidden, false);
  assert.match(context.__elements.get('siteMapEmpty').textContent, /failed to load|unavailable/i);
  app.loadCoastalMethane(0);
  assert.match(context.__elements.get('siteMeteo').innerHTML, /PVGIS/);
  assert.match(context.__elements.get('siteAssay').innerHTML, /Millero|Alboran|36\.5/);
  assert.match(context.__elements.get('siteRights').innerHTML, /gridImport/);
  assert.equal(typeof context.__elements.get('applyCoordinates').listeners.click, 'function');
});

test('coastal methane loads a sited factory whose winter solar cuts methane', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(12);
  assert.equal(app.site.id, 'almeria-pvgis-2026-09-05');
  assert.equal(app.graph.nodes.find(node => node.id === 'dac').unit, 'dac-solid');
  assert.match(context.__elements.get('siteResources').innerHTML, /unverified/);
  assert.match(context.__elements.get('siteMeteo').innerHTML, /PVGIS/);
  assert.match(context.__elements.get('siteMeteo').innerHTML, /quality-chip quality-cited/);
  assert.match(context.__elements.get('siteAssay').innerHTML, /Millero|Alboran|36\.5/);
  assert.match(context.__elements.get('siteRights').innerHTML, /rights-unverified/);
  assert.match(context.__elements.get('siteRights').innerHTML, /rights-assumed/);
  assert.match(context.__elements.get('siteRights').innerHTML, /gridImport/);
  assert.match(context.__elements.get('siteRights').innerHTML, /rights-kind/);
  assert.match(context.__elements.get('siteRights').innerHTML, /discharge/);
  assert.equal(app.site.month, 12);
  assert.equal(app.result.horizon.hours[0].methane, 0);
  assert.ok(app.result.horizon.hours.some(entry => entry.pv > 0 && entry.methane > 0));
  assert.ok(app.result.nodes.sabatier.activity > 0);
  assert.ok(app.result.heatIntegration);
  assert.ok(app.result.heatIntegration.coveredKWh > 0);
  assert.match(context.__elements.get('balanceList').innerHTML, /Heat covered/);
});

test('switching DAC route drops incompatible heat and reagent connections', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const dac = app.addNode('dac-solid');
  app.completeBoundaries();
  assert.equal(app.result.nodes[dac.id].activity, 10);
  assert.equal(app.graph.nodes.find(node => node.unit === 'consumable-source').params.stream.chemicalId, 'amine-sorbent');

  app.replaceUnit(dac.id, 'dac-electroswing');
  assert.equal(dac.unit, 'dac-electroswing');
  assert.equal(context.FlowsheetUnits.UNITS[dac.unit].ports.heat, undefined);
  assert.ok(context.__elements.get('warnings').textContent.includes('not converted'));
  assert.equal(app.graph.edges.some(edge => edge.to.node === dac.id && edge.to.port === 'heat'), false);
  assert.ok(app.result.nodes[dac.id].activity > 0);
  const chemicals = app.graph.nodes.filter(node => node.unit === 'consumable-source').map(node => node.params.stream.chemicalId);
  assert.ok(chemicals.includes('amine-sorbent'));
  assert.ok(chemicals.includes('quinone-electrode'));
  assert.equal(app.graph.nodes.find(node => node.params.stream?.chemicalId === 'amine-sorbent').params.stream.chemicalId, 'amine-sorbent');
});

test('coastal DAC swap stays runnable and compares against the captured baseline', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(0);
  app.captureBaseline();
  const baselineMethane = app.result.nodes.sabatier.activity;
  app.replaceUnit('dac', 'dac-electroswing');
  assert.equal(app.graph.nodes.find(node => node.id === 'dac').unit, 'dac-electroswing');
  assert.ok(app.result);
  assert.ok(app.economics);
  assert.equal(JSON.stringify(app.baseline.economics) !== '{}', true);
  assert.match(context.__elements.get('comparisonMetrics').innerHTML, /CAPEX/);
  assert.equal(app.graph.nodes.find(node => node.id === 'consumables').params.stream.chemicalId, 'amine-sorbent');
  assert.ok(app.result.nodes.sabatier.activity <= baselineMethane + 1e-6);
});

test('size to target resizes coastal methane and reports iterations and residual', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(12);
  const before = app.site.solarKWp;
  const sized = app.sizeCoastalToMethane(15, 12);
  assert.ok(app.site.solarKWp > before);
  assert.ok(Math.abs(sized.achieved - 15) < 1e-6);
  assert.match(context.__elements.get('sizeToTargetStatus').textContent, /CH₄/);
  assert.match(context.__elements.get('sizeToTargetStatus').textContent, /iteration/);
  assert.match(context.__elements.get('sizeToTargetStatus').textContent, /residual/);
  assert.match(context.__elements.get('sizeToTargetStatus').textContent, /heat covered/);
  assert.match(context.__elements.get('sizeToTargetStatus').textContent, /unverified site right/);
  assert.equal(app.sizing.iterations, sized.iterations);
});

test('size to target uses the loaded plant and selected product', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  assert.throws(() => app.sizeToProduct('CH4', 5), /loaded flowsheet/);
  app.loadAbundanceHub();
  const sized = app.sizeToProduct('lithium', 2);
  assert.ok(Math.abs(sized.achieved - 2) < 1e-6);
  assert.equal(sized.product, 'lithium');
  assert.match(context.__elements.get('sizeToTargetStatus').textContent, /lithium/);
  assert.match(context.__elements.get('sizeToTargetStatus').textContent, /iteration/);
  assert.match(context.__elements.get('sizeToTargetStatus').textContent, /residual/);
  assert.equal(app.sizing.product, 'lithium');
  app.loadCoastalMethane(0);
  const hydrogen = app.sizeToProduct('H2', 8);
  assert.ok(Math.abs(hydrogen.achieved - 8) < 1e-6);
  assert.match(context.__elements.get('sizeToTargetStatus').textContent, /H₂/);
});

test('site panel reports location-aware footprint instead of 1.6 ha/MWp', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(0);
  const horizon = context.__elements.get('siteHorizon').textContent;
  const metrics = context.__elements.get('siteFootprintMetrics').innerHTML;
  const note = context.__elements.get('siteFootprintNote').textContent;
  assert.doesNotMatch(horizon, /1\.6 ha\/MWp/);
  assert.match(metrics, /GCR/);
  assert.match(metrics, /Solar land/);
  assert.match(note, /order-of-magnitude screening/);
  assert.equal(context.__elements.get('siteFootprint').hidden, false);
  assert.match(context.__elements.get('siteFootprintPads').innerHTML, /Electrolyzer|DAC|Sabatier|SWRO/i);
});

test('fuels plus minerals network rolls up two sited plants', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadDemoNetwork();
  assert.equal(app.network.plants.length, 2);
  assert.ok(app.network.slate.CH4 > 0);
  assert.ok(app.network.slate.NH3 > 0);
  assert.match(context.__elements.get('networkProducts').innerHTML, /CH4/);
  assert.match(context.__elements.get('networkProducts').innerHTML, /lead/);
  assert.match(context.__elements.get('networkPlants').innerHTML, /Almería solar methane/);
  assert.match(context.__elements.get('networkPlants').innerHTML, /footprint/);
  assert.match(context.__elements.get('networkMetrics').innerHTML, /Land/);
  assert.match(context.__elements.get('networkStatus').textContent, /site footprint/);
  assert.doesNotMatch(context.__elements.get('networkStatus').textContent, /1\.6 ha\/MWp/);
  assert.equal(app.site.id, 'almeria-pvgis-2026-09-05');
});

test('product chrome uses Network and never Empire', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'flowsheet.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'flowsheet-app.js'), 'utf8');
  assert.doesNotMatch(html, /empire/i);
  assert.doesNotMatch(css, /empire/i);
  assert.doesNotMatch(js, /LEGACY_EMPIRE|\bEmpire\b/);
  assert.match(html, /Network/);
  assert.match(html, /id="networkPanel"/);
  assert.match(html, /class="[^"]*network-panel/);
  assert.match(css, /\.network-panel/);
});

test('four primary tabs land on Overview and fold Network into Economics', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const labels = [...html.matchAll(/role="tab"(?![a-z])[^>]*>([^<]+)/gi)].map(match => match[1].trim());
  assert.deepEqual(labels, ['Overview', 'Location', 'Process', 'Economics']);
  assert.match(html, /role="tablist"/);
  assert.match(html, /id="tabOverview"[^>]*aria-selected="true"/);
  assert.match(html, /id="panelOverview"/);
  assert.match(html, /id="panelLocation"[^>]*hidden/);
  assert.match(html, /id="panelProcess"[^>]*hidden/);
  assert.match(html, /id="panelEconomics"[^>]*hidden/);
  assert.match(html, /id="sizeForCashflow"/);
  assert.match(html, /id="loadDemoNetwork"/);
  assert.match(html, /id="siteMap"/);
  assert.match(html, /id="flowsheetCanvas"/);
  assert.match(html, /id="economicsBanner"/);
  assert.match(html, /id="economicsAck"/);
  assert.doesNotMatch(html, /role="tab"[^>]*>\s*Network\s*</i);
  assert.match(html, /id="networkPanel"/);
  const economicsChunk = html.slice(html.indexOf('id="panelEconomics"'));
  assert.match(economicsChunk, /id="networkPanel"/);
  assert.match(economicsChunk, /id="siteFootprint"/);
});

test('activateTab switches panels, defaults to Overview, and persists', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const context = loadApp(storage);
  const app = context.__FLOWSHEET_APP__;
  assert.equal(app.activeTab, 'overview');
  assert.equal(context.__elements.get('panelOverview').hidden, false);
  assert.equal(context.__elements.get('panelLocation').hidden, true);
  assert.equal(context.__elements.get('panelProcess').hidden, true);
  assert.equal(context.__elements.get('panelEconomics').hidden, true);
  assert.equal(context.__elements.get('tabOverview')['aria-selected'], 'true');

  app.activateTab('location');
  assert.equal(app.activeTab, 'location');
  assert.equal(context.__elements.get('panelLocation').hidden, false);
  assert.equal(context.__elements.get('panelOverview').hidden, true);
  assert.equal(values.get('molecular-foundry.tab.v1'), 'location');
  assert.equal(context.__elements.get('tabLocation')['aria-selected'], 'true');
  assert.equal(typeof context.__elements.get('applyCoordinates').listeners.click, 'function');

  context.__elements.get('tabProcess').listeners.click();
  assert.equal(app.activeTab, 'process');
  assert.equal(context.__elements.get('panelProcess').hidden, false);

  const restored = loadApp({
    getItem(key) { return key === 'molecular-foundry.tab.v1' ? 'economics' : null; },
    setItem() {},
  }).__FLOWSHEET_APP__;
  assert.equal(restored.activeTab, 'economics');
});

test('overview dashboard stays calm after loading demos', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  assert.equal(app.activeTab, 'overview');
  app.loadMethaneRecycle();
  const cash = context.__elements.get('overviewCashflow').innerHTML;
  assert.match(cash, /Annual net cash/);
  assert.match(cash, /Installed CAPEX/);
  assert.doesNotMatch(cash, /quality-chip/);
  assert.doesNotMatch(cash, /~/);
  assert.match(context.__elements.get('overviewLimiting').textContent, /Factory running|balances closed/);
  assert.match(context.__elements.get('flowsheetCanvas').innerHTML, /flow-edge material recycle/);

  app.loadCoastalMethane(0);
  assert.match(context.__elements.get('overviewSiteName').textContent, /Almer/);
  assert.match(context.__elements.get('overviewHonesty').textContent, /not bankable/);
  assert.doesNotMatch(context.__elements.get('overviewLand').textContent, /1\.6 ha\/MWp/);
  assert.match(context.__elements.get('siteMapLayers').innerHTML, /OSM/);
  assert.equal(typeof context.__elements.get('sizeForCashflow').listeners.click, 'function');

  app.loadDemoNetwork();
  assert.match(context.__elements.get('networkProducts').innerHTML, /CH4/);
  assert.match(context.__elements.get('overviewSlate').innerHTML, /t\/year/);
  assert.doesNotMatch(context.__elements.get('overviewSlate').innerHTML, /quality-chip quality-screening/);
});

test('economics panel does not spam screening chips or tildes', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadMethaneRecycle();
  const html = context.__elements.get('economicsMetrics').innerHTML;
  assert.doesNotMatch(html, /quality-chip quality-screening/);
  assert.doesNotMatch(html, /~/);
  assert.match(html, /Levelized delivered cost/);
  assert.doesNotMatch(html, /±|&plusmn;|\+\/-\s*\d/);
  assert.equal(context.FlowsheetUncertainty.classifyQuality({ kind: 'product-cost' }), 'screening');
  app.loadCoastalMethane(0);
  const banner = context.__elements.get('economicsBanner');
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /not bankable/);
  assert.match(context.__elements.get('economicsMetrics').innerHTML, /hidden until acknowledged/);
  assert.doesNotMatch(context.__elements.get('economicsMetrics').innerHTML, /quality-chip quality-screening/);
});

test('solar PV inspector cites NREL ATB next to LCOE', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.addNode('solar-pv');
  const metrics = context.__elements.get('inspectorMetrics').innerHTML;
  const controls = context.__elements.get('nodeControls').innerHTML;
  assert.match(metrics, /Simple LCOE/);
  assert.match(metrics, /quality-chip quality-cited/);
  assert.match(metrics, /NREL 2024 ATB/);
  assert.doesNotMatch(metrics, /±|&plusmn;|\+\/-\s*\d/);
  assert.match(controls, /quality-chip quality-cited/);
  assert.match(controls, /ATB 2024/);
});

test('site footprint and network rollup skip noisy screening chips', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(0);
  const footprint = context.__elements.get('siteFootprintMetrics').innerHTML;
  assert.doesNotMatch(footprint, /quality-chip quality-screening/);
  assert.doesNotMatch(footprint, /quality-chip quality-assumption/);
  assert.match(footprint, /Solar land/);
  assert.doesNotMatch(footprint, /±|&plusmn;|\+\/-\s*\d/);
  app.loadDemoNetwork();
  const network = context.__elements.get('networkMetrics').innerHTML;
  assert.doesNotMatch(network, /quality-chip quality-screening/);
  assert.doesNotMatch(network, /quality-chip quality-assumption/);
  assert.match(network, /Land/);
  assert.match(network, /Freight/);
  assert.match(network, /Not modeled \(no corridors\)/);
  assert.match(network, /UNCTAD/);
});

test('inspector renders catalog sourceNote for electrolyzer and DAC energy', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.addNode('electrolyzer');
  assert.match(context.__elements.get('nodeControls').innerHTML, /Buttler & Spliethoff 2018/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /52 kWh\/kg H/);
  app.addNode('dac-solid');
  assert.match(context.__elements.get('nodeControls').innerHTML, /IEA DAC 2022/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /1\.8 GJ\/t/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /5\.4 GJ\/t/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /Capture fraction 0\.9/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /amine makeup 0\.02/);
  app.addNode('dac-liquid');
  assert.match(context.__elements.get('nodeControls').innerHTML, /Scenario A/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /Scenario C/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /Table 1 74\.5%/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /KOH makeup 0\.01/);
  app.addNode('dac-electroswing');
  assert.match(context.__elements.get('nodeControls').innerHTML, /40–90 kJ\/mol/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /Balance-of-plant/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /Capture fraction 0\.5/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /electrode makeup 0\.005/);
  app.addNode('swro');
  assert.match(context.__elements.get('nodeControls').innerHTML, /Elimelech & Phillip 2011/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /3–4 kWh\/m/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /45–55%/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /Ghaffour et al\. 2013/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /quality-chip quality-cited/);
  app.addNode('med');
  assert.match(context.__elements.get('nodeControls').innerHTML, /Ghaffour et al\. 2013 MED band/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /1\.5–2\.5 kWh\/m/);
  app.addNode('msf');
  assert.match(context.__elements.get('nodeControls').innerHTML, /Ghaffour et al\. 2013 MSF band/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /3–5 kWh\/m/);
  app.addNode('sabatier');
  assert.match(context.__elements.get('nodeControls').innerHTML, /0\.4–1\.5 kWh\/kg/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /not electrolysis/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /Zapf/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /Baier et al\. 2018/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /quality-chip quality-screening/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /fenrg\.2018\.00005/);
  app.addNode('solar-pv');
  assert.match(context.__elements.get('nodeControls').innerHTML, /ATB 2024/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /Class 8/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /24\.5%/);
  assert.match(context.__elements.get('nodeControls').innerHTML, /quality-chip quality-cited/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /engine\/uncertainty\.js/);
});

test('an incomplete baseline has no economics until a complete graph is captured', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.captureBaseline();
  app.loadMethaneRecycle();
  assert.match(context.__elements.get('comparisonStatus').textContent, /Baseline economics unavailable/);
  app.captureBaseline();
  assert.match(context.__elements.get('comparisonMetrics').innerHTML, /CAPEX/);
});


test('coastal methane sizeToProduct H2 produces electrolyzer activity and never Limited by Nothing at zero', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(0);
  const sized = app.sizeToProduct('H2', 15);
  assert.equal(sized.product, 'H2');
  assert.ok(app.result.nodes.electrolyzer.activity > 1, `UI electrolyzer activity ${app.result.nodes.electrolyzer.activity}`);
  const metrics = context.__elements.get('inspectorMetrics').innerHTML;
  assert.match(metrics, /Achieved/);
  assert.doesNotMatch(metrics, /Achieved<\/dt><dd>0[^<]*<\/dd>.*Limited by<\/dt><dd>Nothing/);
  assert.doesNotMatch(metrics, /Limited by<\/dt><dd>Nothing/);
  const electricity = app.graph.nodes.find(node => node.id === 'electricity');
  assert.ok(electricity.rate > 0);
});

test('blank canvas and draft site copy guide onboarding', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.clearFactory();
  const canvas = context.__elements.get('flowsheetCanvas').innerHTML;
  assert.match(canvas, /Recommended path/);
  assert.match(canvas, /Size to target/);
  assert.match(context.__elements.get('siteName').textContent, /Draft site|Choose a site|Almer/);
});

test('formatNumber hides false precision near zero', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  // Drive inspector balances through a tiny residual by loading coastal and checking status formatting indirectly via size residual display.
  app.loadCoastalMethane(0);
  app.sizeToProduct('H2', 15);
  const status = context.__elements.get('sizeToTargetStatus').textContent;
  assert.doesNotMatch(status, /2\.78e-17|2\.775/);
});

function detailsOpeningTag(html, id) {
  const match = html.match(new RegExp(`<details\\b[^>]*\\sid="${id}"[^>]*>`));
  assert.ok(match, `details#${id} exists`);
  return match[0];
}

function assertClosedDetailsId(html, id) {
  const tag = detailsOpeningTag(html, id);
  assert.doesNotMatch(tag, /\sopen(\s|>|=)/, `${id} starts closed`);
}

test('secondary Foundry controls start collapsed behind closed details', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const overview = html.slice(html.indexOf('id="panelOverview"'), html.indexOf('id="panelLocation"'));
  const location = html.slice(html.indexOf('id="panelLocation"'), html.indexOf('id="panelProcess"'));
  const process = html.slice(html.indexOf('id="panelProcess"'), html.indexOf('id="panelEconomics"'));
  const economics = html.slice(html.indexOf('id="panelEconomics"'));

  assertClosedDetailsId(html, 'sizeToTargetDetails');
  assertClosedDetailsId(html, 'overviewDemoMenu');
  assertClosedDetailsId(html, 'siteMapLayerDetails');
  assertClosedDetailsId(html, 'siteLocationDetails');
  assertClosedDetailsId(html, 'siteMeteoDetails');
  assertClosedDetailsId(html, 'siteAssayDetails');
  assertClosedDetailsId(html, 'siteRightsDetails');
  assertClosedDetailsId(html, 'processDemoMenu');
  assertClosedDetailsId(html, 'baselineMenu');

  const sizeChunk = overview.slice(overview.indexOf('id="sizeToTargetDetails"'));
  assert.match(sizeChunk, /id="sizeToTarget"/);
  assert.match(sizeChunk, /id="sizeProduct"/);
  assert.match(sizeChunk, /id="sizeTargetRate"/);
  assert.match(sizeChunk, /id="sizeToTargetStatus"/);
  assert.ok(overview.indexOf('id="sizeForCashflow"') < overview.indexOf('id="sizeToTargetDetails"'));

  const demoChunk = overview.slice(overview.indexOf('id="overviewDemoMenu"'));
  assert.match(demoChunk, /id="loadMethaneRecycle"/);
  assert.match(demoChunk, /id="loadCoastalMethane"/);
  assert.match(demoChunk, /id="loadAbundanceHub"/);
  assert.match(demoChunk, /id="loadDemoNetwork"/);

  const layerClose = location.indexOf('</details>', location.indexOf('id="siteMapLayerDetails"'));
  assert.ok(location.indexOf('id="siteName"') < location.indexOf('id="siteMapLayerDetails"'));
  assert.ok(location.indexOf('id="siteMap"') > layerClose);
  assert.match(location, /class="site-location"/);
  assert.match(location, /id="siteMapLayers"/);
  assert.match(location, /id="applyCoordinates"/);
  assert.match(location, /id="siteMeteo"/);
  assert.match(location, /id="siteAssay"/);
  assert.match(location, /id="siteRights"/);

  assert.match(process, /id="captureBaseline"/);
  assert.match(process, /id="clearBaseline"/);
  assert.match(process, /id="flowsheetCanvas"/);

  assert.match(economics, /id="economicsBanner"/);
  assert.match(economics, /id="economicsAck"/);
  assert.match(economics, /<details class="more-section network-detail">/);
  assert.match(economics, /<details class="more-section footprint-details">/);
  assert.doesNotMatch(economics, /<details class="more-section network-detail" open/);
  assert.doesNotMatch(economics, /<details class="more-section footprint-details" open/);
  assert.ok(economics.indexOf('id="economicsAck"') < economics.indexOf('class="more-section network-detail"'));
  assert.match(economics, /id="networkBody"/);
  assert.match(economics, /id="siteFootprint"/);
});

test('building palette groups units into closed category details', () => {
  const context = loadApp();
  const palette = context.__elements.get('buildingPalette').innerHTML;
  for (const name of ['Water', 'Carbon', 'Fuels', 'Minerals', 'Power']) {
    assert.match(palette, new RegExp(`<details class="palette-category"><summary>${name}</summary>`));
  }
  assert.doesNotMatch(palette, /<details class="palette-category" open/);
  for (const unit of ['swro', 'med', 'msf', 'dac-solid', 'dac-liquid', 'dac-electroswing', 'electrolyzer', 'sabatier', 'brine-minerals', 'solar-pv', 'nuclear-electricity']) {
    assert.match(palette, new RegExp(`data-unit="${unit}"`));
  }
  context.__elements.get('buildingPalette').listeners.click({
    target: { closest: () => ({ dataset: { unit: 'sabatier' } }) },
  });
  assert.equal(context.__FLOWSHEET_APP__.graph.nodes[0].unit, 'sabatier');
});

test('inspector literature stays in the DOM behind closed details', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.addNode('electrolyzer');
  const html = context.__elements.get('nodeControls').innerHTML;
  assert.match(html, /<details class="more-section">/);
  assert.match(html, /<summary>Literature<\/summary>/);
  assert.match(html, /Buttler & Spliethoff 2018/);
  assert.match(html, /52 kWh\/kg H/);
  assert.doesNotMatch(html, /<details[^>]*\sopen/);
});
