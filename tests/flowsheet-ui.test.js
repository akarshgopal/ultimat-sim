const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApp(localStorage) {
  const elements = new Map();
  const makeElement = () => {
    const el = {
      listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener; },
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(name, value) { this[name] = value; },
      _innerHTML: '',
      _textContent: '',
      hidden: false,
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
    return el;
  };
  const document = {
    body: makeElement(),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const context = vm.createContext({ document, console, localStorage });
  context.window = context;
  context.__elements = elements;
  for (const file of ['engine/model.js', 'engine/units.js', 'engine/heat.js', 'engine/solve.js', 'engine/economics.js', 'engine/footprint.js', 'engine/size.js', 'engine/network.js', 'engine/uncertainty.js', 'engine/map-site.js', 'data/pvgis-almeria-hourly.js', 'data/dead-sea-brine.js', 'data/almeria-seawater.js', 'data/site-presets.js', 'cases/sabatier.js', 'cases/coastal.js', 'cases/abundance.js', 'cases/network.js', 'js/flowsheet-app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return context;
}

test('vendor ships Esri Lerc decode assets for GSA tiles', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'vendor', 'LercDecode.js')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'vendor', 'lerc-wasm.wasm')));
  assert.doesNotMatch(
    fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'),
    /ghi-coarse/,
  );
});

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
  assert.match(note, /cited or screening intensities|orders of magnitude|order-of-magnitude screening|panel area/i);
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

test('Location presets populate by region and applying Almería sets coords, name, and honest rights', async () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const picker = context.__elements.get('sitePreset');
  assert.match(picker.innerHTML, /optgroup label="Gulf"/);
  assert.match(picker.innerHTML, /uae-taweelah/);
  assert.match(picker.innerHTML, /texas-corpus-christi/);
  assert.match(picker.innerHTML, /india-mundra/);
  assert.match(picker.innerHTML, /au-port-hedland/);
  assert.match(picker.innerHTML, /optgroup label="North Africa"/);
  assert.match(picker.innerHTML, /chile-mejillones/);
  assert.match(picker.innerHTML, /spain-almeria/);

  picker.value = 'spain-almeria';
  await app.applySitePreset();
  assert.equal(app.site.id, 'spain-almeria');
  assert.equal(app.site.latitude, 36.834);
  assert.equal(app.site.longitude, -2.463);
  assert.match(app.site.name, /Almer/);
  assert.equal(app.site.rights.seawaterIntake.status, 'assumed');
  assert.equal(app.site.rights.gridImport.status, 'unverified');
  assert.equal(app.site.rights.gridImport.authorize, false);
  assert.ok(Object.values(app.site.rights).every(right => right.status !== 'authorized'));
  assert.match(context.__elements.get('overviewSiteName').textContent, /Almer/);
  assert.equal(Number(context.__elements.get('siteLatitude').value), 36.834);
  assert.equal(Number(context.__elements.get('siteLongitude').value), -2.463);

  picker.value = 'india-mundra';
  await app.applySitePreset();
  assert.equal(app.site.id, 'india-mundra');
  assert.equal(app.site.latitude, 22.737);
  assert.match(app.site.name, /Mundra/);
  assert.match(context.__elements.get('overviewSiteName').textContent, /Mundra/);
  assert.equal(app.site.rights.seawaterIntake.status, 'assumed');
  assert.equal(app.site.rights.seawaterDischarge.status, 'unverified');
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
