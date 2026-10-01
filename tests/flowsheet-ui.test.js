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
  for (const file of ['engine/model.js', 'engine/units.js', 'engine/heat.js', 'engine/solve.js', 'engine/economics.js', 'engine/material-power-breakeven.js', 'engine/footprint.js', 'engine/size.js', 'engine/network.js', 'engine/uncertainty.js', 'engine/map-site.js', 'data/pvgis-almeria-hourly.js', 'data/dead-sea-brine.js', 'data/persian-gulf-sabkha-brine.js', 'data/atacama-lithium-brine.js', 'data/lake-mackay-wa-brine.js', 'data/great-salt-lake-brine.js', 'data/salton-sea-brine.js', 'data/uyuni-lithium-brine.js', 'data/qaidam-brine.js', 'data/danakil-brine.js', 'data/searles-lake-brine.js', 'data/hombre-muerto-lithium-brine.js', 'data/maricunga-lithium-brine.js', 'data/clayton-valley-brine.js', 'data/zabuye-lithium-brine.js', 'data/almeria-seawater.js', 'data/persian-gulf-seawater.js', 'data/red-sea-seawater.js', 'data/texas-gulf-seawater.js', 'data/pilbara-indian-ocean-seawater.js', 'data/atacama-pacific-seawater.js', 'data/morocco-atlantic-seawater.js', 'data/arabian-sea-seawater.js', 'data/gulf-of-kutch-seawater.js', 'data/benguela-atlantic-seawater.js', 'data/site-assays.js', 'data/site-presets.js', 'data/tea-screening.js', 'cases/sabatier.js', 'cases/coastal.js', 'cases/methanol.js', 'cases/abundance.js', 'cases/network.js', 'js/flowsheet-app.js', 'data/red-sea-sabkha-brine.js', 'data/kutch-subsoil-brine.js', 'data/texas-gulf-desal-brine.js', 'data/mediterranean-swro-brine.js']) {
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

test('factory starts on the Zabuye materials demo and wiring blocks does not rewrite their setpoints', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;

  assert.equal(app.site.id, 'china-zabuye');
  assert.equal(app.site.latitude, 31.35);
  assert.equal(app.site.longitude, 84.05);
  assert.ok(app.economics.annualNetCash > 0);
  assert.match(context.__elements.get('overviewDemoChip').textContent, /Zabuye/);
  assert.equal(context.__elements.get('overviewDemoChip').hidden, false);
  app.clearFactory();
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
  assert.ok(Number.isFinite(app.economics.installedCapex));
  assert.ok(app.economics.installedCapex > 52425);
  assert.ok(Number.isFinite(app.economics.npv));
  assert.match(context.__elements.get('nodeControls').innerHTML, /CAPEX/);
  assert.match(context.__elements.get('economicsMetrics').innerHTML, /Levelized delivered cost/);
});

test('baseline comparison preserves real engine economics and renders deltas and synergies', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadMethaneRecycle();
  app.captureBaseline();
  const baseline = JSON.stringify(app.baseline.economics);
  const capex = app.economics.installedCapex;
  const sabatierNode = app.graph.nodes.find(node => node.id === 'sabatier');
  const prior = sabatierNode.economics.installedCapex != null
    ? sabatierNode.economics.installedCapex
    : sabatierNode.economics.capexRate * sabatierNode.capacity;
  sabatierNode.economics.installedCapex = prior + 100;
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
  assert.match(context.__elements.get('siteRights').innerHTML, /data-right="gridImport"/);
  assert.match(context.__elements.get('siteRights').innerHTML, /Grid import/);
  assert.match(context.__elements.get('siteRights').innerHTML, /Seawater intake|Seawater discharge|Brine concession|Salt purchase/);
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
  app.clearFactory();
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
  assert.match(context.__elements.get('networkPlants').innerHTML, /Dead Sea brine and ammonia/);
  assert.match(context.__elements.get('networkPlants').innerHTML, /footprint/);
  assert.match(context.__elements.get('networkMetrics').innerHTML, /Land/);
  assert.match(context.__elements.get('networkStatus').textContent, /site footprint/);
  assert.doesNotMatch(context.__elements.get('networkStatus').textContent, /1\.6 ha\/MWp/);
  assert.equal(app.site.id, 'dead-sea-pvgis-2026-09-06');
  assert.equal(app.site.name, 'Dead Sea industrial shore');
  assert.equal(app.site.latitude, 31.16);
  assert.equal(app.site.longitude, 35.43);
  assert.equal(context.__elements.get('sitePreset').value, 'levant-dead-sea');
  assert.match(context.__elements.get('overviewDemoChip').textContent, /Fuels \+ minerals/);
  assert.equal(context.__elements.get('overviewDemoChip').hidden, false);
  const slate = context.__elements.get('overviewSlate').innerHTML;
  assert.match(slate, /Lithium/);
  assert.match(slate, /Magnesium/);
  assert.match(slate, /Salt/);
  assert.match(slate, /Ammonia/);
  assert.match(context.__elements.get('overviewLand').innerHTML, /ha|m²/);
  assert.equal(context.__elements.get('siteFootprint').hidden, false);
  assert.match(context.__elements.get('siteFootprintMetrics').innerHTML, /Solar land|ha|m²/);
});

test('network plants edit in the page and tag the biggest earner', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'flowsheet-app.js'), 'utf8');
  assert.match(html, /id="addPlantForm"/);
  assert.match(html, /id="addPlantName"/);
  assert.match(html, /id="cancelAddPlant"/);
  assert.match(html, /id="clearNetwork"/);
  assert.match(html, /id="projectLifeYears"/);
  assert.match(html, />yr</);
  assert.match(html, /id="discountRate"/);
  assert.doesNotMatch(source, /Name this plant in the network/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'flowsheet.css'), 'utf8');
  assert.match(css, /@media \(max-width:\s*400px\)[\s\S]*\.brand \.status-meta \{\s*display:\s*none/);
  assert.match(css, /\.network-plant-actions/);
  assert.match(css, /minmax\(17\.5rem, 0\.9fr\)/);
  assert.match(css, /\.project-assumptions \{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);

  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  context.window.prompt = () => { throw new Error('plant naming must stay in the page'); };
  app.loadDemoNetwork();
  const plantsHtml = context.__elements.get('networkPlants').innerHTML;
  assert.match(plantsHtml, /data-open-plant=/);
  assert.match(plantsHtml, /data-rename-plant=/);
  assert.match(plantsHtml, /data-remove-plant=/);
  assert.match(plantsHtml, /\/year/);
  let taggedByRevenueNotMass = false;
  for (const plant of app.network.plants) {
    const sales = (plant.economics?.sinks || []).filter(sink => sink.disposition === 'sale' && sink.deliveredAmount > 0);
    const byRevenue = sales.slice().sort((left, right) => right.annualRevenue - left.annualRevenue || right.deliveredAmount - left.deliveredAmount);
    const byMass = sales.slice().sort((left, right) => right.deliveredAmount - left.deliveredAmount);
    assert.ok(byRevenue[0]);
    assert.match(plantsHtml, new RegExp(`data-plant-id="${plant.id}" data-lead="${byRevenue[0].id}"`));
    if (byRevenue[0].id !== byMass[0].id) taggedByRevenueNotMass = true;
  }
  assert.equal(taggedByRevenueNotMass, true);

  const count = app.network.plants.length;
  const id = app.network.plants[0].id;
  const original = app.network.plants[0].name;
  app.beginRemovePlant(id);
  assert.equal(app.network.plants.length, count);
  assert.match(context.__elements.get('networkPlants').innerHTML, new RegExp(`data-confirm-remove="${id}"`));
  app.cancelPlantEdit();
  assert.equal(app.network.plants.length, count);
  assert.doesNotMatch(context.__elements.get('networkPlants').innerHTML, /data-confirm-remove=/);
  assert.match(context.__elements.get('networkActionNote').textContent, /Remove canceled/);

  assert.equal(app.renameNetworkPlant(id, `  ${original}  `), false);
  assert.equal(app.network.plants.find(plant => plant.id === id).name, original);
  assert.equal(app.renameNetworkPlant(id, 'Renamed plant'), true);
  assert.equal(app.network.plants.find(plant => plant.id === id).name, 'Renamed plant');
  assert.match(context.__elements.get('networkPlants').innerHTML, /Renamed plant/);

  assert.equal(app.removeNetworkPlant(id), true);
  assert.equal(app.network.plants.length, count - 1);
  assert.doesNotMatch(context.__elements.get('networkPlants').innerHTML, /Renamed plant/);

  const beforeAdd = app.network.plants.length;
  app.beginAddPlant();
  assert.equal(context.__elements.get('addPlantForm').hidden, false);
  assert.equal(context.__elements.get('addPlantName').value, 'Dead Sea industrial shore');
  app.cancelAddPlant();
  assert.equal(app.network.plants.length, beforeAdd);
  assert.equal(context.__elements.get('addPlantForm').hidden, true);
  assert.match(context.__elements.get('networkActionNote').textContent, /Add canceled/);
  assert.equal(app.submitAddPlant('   '), false);
  assert.equal(app.network.plants.length, beforeAdd);
  assert.match(context.__elements.get('networkActionNote').textContent, /Enter a name/);
  assert.equal(app.submitAddPlant('  Extra plant  '), true);
  assert.equal(app.network.plants.length, beforeAdd + 1);
  assert.ok(app.network.plants.some(plant => plant.name === 'Extra plant'));
});

test('Dead Sea brine hub lists sold ammonia and minerals and refreshes land', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadAbundanceHub();
  assert.equal(app.site.id, 'dead-sea-pvgis-2026-09-06');
  assert.equal(app.site.name, 'Dead Sea industrial shore');
  assert.equal(app.site.latitude, 31.16);
  assert.equal(app.site.longitude, 35.43);
  assert.equal(context.__elements.get('sitePreset').value, 'levant-dead-sea');
  assert.match(context.__elements.get('overviewSiteName').textContent, /Dead Sea/);
  assert.match(context.__elements.get('overviewDemoChip').textContent, /Brine \+ ammonia/);
  const slate = context.__elements.get('overviewSlate').innerHTML;
  assert.match(slate, /Ammonia/);
  assert.match(slate, /Lithium/);
  assert.match(slate, /Magnesium/);
  assert.match(slate, /Salt/);
  assert.match(slate, /Potash/);
  assert.match(slate, /Bromine/);
  const ammonia = app.economics.sinks.find(sink => sink.id === 'ammonia-product');
  assert.equal(ammonia.disposition, 'sale');
  assert.ok(ammonia.deliveredAmount > 0);
  assert.match(context.__elements.get('overviewLand').innerHTML, /ha|m²/);
  assert.equal(context.__elements.get('siteFootprint').hidden, false);
  assert.match(context.__elements.get('siteFootprintMetrics').innerHTML, /Solar land|ha|m²/);
});

test('Location presets populate by region and applying Almería sets coords, name, and honest rights', async () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.clearFactory();
  const picker = context.__elements.get('sitePreset');
  assert.match(picker.innerHTML, /optgroup label="Gulf"/);
  assert.match(picker.innerHTML, /uae-taweelah/);
  assert.match(picker.innerHTML, /texas-corpus-christi/);
  assert.match(picker.innerHTML, /us-salton-sea/);
  assert.match(picker.innerHTML, /bolivia-uyuni/);
  assert.match(picker.innerHTML, /china-qaidam/);
  assert.match(picker.innerHTML, /ethiopia-danakil/);
  assert.match(picker.innerHTML, /us-searles-lake/);
  assert.match(picker.innerHTML, /saudi-ras-al-khair/);
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

test('Overview hero shows screening notice and cited solar yield without screening-chip spam', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(0);
  const honesty = context.__elements.get('overviewHonesty').textContent;
  const cash = context.__elements.get('overviewCashflow').innerHTML;
  const yieldHtml = context.__elements.get('overviewYield').innerHTML;
  const land = context.__elements.get('overviewLand').innerHTML;
  assert.match(honesty, /not bankable/i);
  assert.match(honesty, /screening/i);
  assert.equal(context.__elements.get('overviewOfftake').hidden, true);
  assert.equal(context.__elements.get('economicsOfftake').textContent, '');
  assert.doesNotMatch(cash, /quality-chip quality-screening/);
  assert.doesNotMatch(cash, /~|±|\+\/-/);
  assert.match(cash, /\$/);
  assert.match(yieldHtml, /quality-chip quality-cited/);
  assert.match(yieldHtml, /PVGIS|re\.jrc/);
  assert.match(yieldHtml, /kWh\/kWp/);
  assert.match(land, /ha|m²/);
});

test('coastal methanol demo loads Mejillones plant and sizes methanol', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadMethanolPlant(0);
  assert.equal(app.site.id, 'mejillones-pvgis-2026-09-14');
  assert.equal(app.graph.nodes.find(node => node.id === 'dac').unit, 'dac-solid');
  assert.ok(app.graph.nodes.some(node => node.unit === 'methanol'));
  assert.ok(app.result.nodes.methanol.activity > 0);
  assert.match(context.__elements.get('overviewSiteName').textContent, /Mejillones/);
  assert.match(context.__elements.get('overviewHonesty').textContent, /not bankable/i);
  assert.match(context.__elements.get('overviewYield').innerHTML, /quality-chip quality-cited/);
  const sized = app.sizeToProduct('methanol', 8);
  assert.equal(sized.product, 'methanol');
  assert.ok(Math.abs(sized.achieved - 8) < 1e-4);
});

test('size product menus list methanol and ammonia', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="sizeProduct"/);
  assert.match(html, /value="methanol"/);
  assert.match(html, /value="ammonia"/);
  assert.doesNotMatch(html, /id="processSizeProduct"/);
  assert.doesNotMatch(html, /id="processSizeForCashflow"/);
  assert.doesNotMatch(html, /id="processDemoMenu"/);
  assert.doesNotMatch(html, /id="processSizeMenu"/);
});

test('Zabuye brine hub loads the cited assay, frozen ERA5, and capital-inclusive cash', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="loadZabuyeHub"/);
  assert.match(html, /data-demo-id="zabuye-hub"/);
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  assert.equal(typeof app.loadZabuyeHub, 'function');
  const sized = app.loadZabuyeHub();
  assert.equal(app.site.id, 'china-zabuye');
  assert.equal(app.site.latitude, 31.35);
  assert.equal(app.site.longitude, 84.05);
  assert.equal(app.site.assay.assayId, 'zabuye-lithium-brine');
  assert.equal(app.site.dailyPVKWhPerKWp, context.NetworkCase.ZABUYE_PV);
  assert.notEqual(app.site.dailyPVKWhPerKWp, context.NetworkCase.DEAD_SEA_PV);
  assert.equal(app.site.meteo.source, 'PVGIS-ERA5');
  assert.equal(app.site.meteo.retrieved, '2026-09-27');
  assert.match(app.site.meteo.cite.url, /lat=31\.35/);
  assert.equal(sized.mode, 'positive-cashflow');
  assert.ok(app.economics.annualNetCash > 0);
  assert.match(context.__elements.get('overviewSiteName').textContent, /Zabuye/);
  assert.match(context.__elements.get('overviewOfftake').textContent, /China\/Asia/);
  assert.match(context.__elements.get('overviewOfftake').textContent, /not a plant contract/i);
  assert.match(context.__elements.get('overviewOfftake').textContent, /ME-Levant/i);
  assert.equal(context.__elements.get('overviewOfftake').hidden, false);
  assert.match(context.__elements.get('economicsOfftake').textContent, /screening China\/Asia offtake table/i);
  assert.equal(context.__elements.get('economicsOfftake').hidden, false);
  assert.match(context.__elements.get('overviewCashflow').innerHTML, /\$/);
  assert.match(context.__elements.get('overviewLand').innerHTML, /ha|m²/);
  assert.match(context.__elements.get('overviewYield').innerHTML, /PVGIS|re\.jrc/);
});

test('Economics screens purchased-power break-even on the frozen plant without site-search', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /class="primary-action" id="screenPowerBreakeven"/);
  assert.match(html, /id="powerBreakevenMode"/);
  assert.match(html, /value="solo"/);
  assert.match(html, /value="shared"/);
  assert.match(html, /id="powerBreakevenMaterial"/);
  assert.match(html, /engine\/material-power-breakeven\.js/);
  assert.ok(html.indexOf('engine/economics.js') < html.indexOf('engine/material-power-breakeven.js'));
  assert.ok(html.indexOf('engine/material-power-breakeven.js') < html.indexOf('js/flowsheet-app.js'));
  assert.doesNotMatch(html, /engine\/site-search\.js/);
  assert.doesNotMatch(html, /engine\/sensitivity\.js/);

  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  assert.equal(typeof app.screenPowerBreakEven, 'function');
  assert.equal(typeof context.MaterialPowerBreakeven.breakEvenForMaterial, 'function');
  const select = context.__elements.get('powerBreakevenMaterial');
  // First load is the Zabuye materials demo (goal 3), which sells products.
  assert.match(select.innerHTML, /value="lithium"/);
  assert.equal(select.disabled, false);

  app.loadAbundanceHub();
  assert.match(select.innerHTML, /value="lithium"/);
  assert.doesNotMatch(select.innerHTML, /value="methane"/);
  const soldIds = [...select.innerHTML.matchAll(/value="([^"]*)"/g)].map(match => match[1]).filter(Boolean);
  const catalogIds = context.MaterialPowerBreakeven.MATERIALS.map(item => item.id);
  assert.ok(soldIds.length > 0);
  assert.ok(soldIds.every(id => catalogIds.includes(id)));
  assert.equal(select.disabled, false);

  const screened = app.screenPowerBreakEven();
  assert.ok(screened);
  assert.ok(['flip', 'no-flip-always-negative', 'no-flip-always-positive'].includes(screened.status));
  const text = context.__elements.get('powerBreakevenResult').textContent;
  assert.match(text, /screening/i);
  assert.match(text, /not a PPA/i);
  assert.equal(context.__elements.get('powerBreakevenResult').hidden, false);
  const chart = context.__elements.get('powerBreakevenChart');
  assert.equal(chart.hidden, false);
  if (screened.status === 'flip') {
    assert.match(chart.innerHTML, /<svg/);
    assert.match(chart.innerHTML, new RegExp(`data-solo-kind="price" data-solo-price="${screened.breakEven}"`));
    assert.match(chart.innerHTML, /data-mode="solo"/);
  } else {
    assert.doesNotMatch(chart.innerHTML, /data-solo-kind="price"/);
  }
  assert.match(chart.innerHTML, /data-shared-kind=/);

  context.__elements.get('powerBreakevenMode').value = 'shared';
  const shared = app.screenPowerBreakEven();
  assert.equal(shared.mode, 'shared');
  assert.equal(select.disabled, true);
  const sharedText = context.__elements.get('powerBreakevenResult').textContent;
  assert.match(sharedText, /\(shared\)/);
  assert.doesNotMatch(sharedText, /\(shared,/);
  assert.match(sharedText, /screening/i);
  assert.doesNotMatch(sharedText, /annualNetCash|hero scale|TEA/);

  app.loadMethaneRecycle();
  assert.match(select.innerHTML, /No product supported by the screening price table/);
  assert.match(select.innerHTML, /Methane/);
  assert.doesNotMatch(select.innerHTML, /No products sold/);
  assert.equal(app.screenPowerBreakEven(), null);
  assert.match(context.__elements.get('powerBreakevenResult').textContent, /No product supported by the screening price table/);
  assert.match(context.__elements.get('powerBreakevenResult').textContent, /Methane/);
  assert.equal(context.__elements.get('powerBreakevenChart').hidden, true);
  assert.equal(context.__elements.get('powerBreakevenChart').innerHTML, '');
});

test('economics charts stay empty until the graph can support them', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.clearFactory();
  const fall = context.__elements.get('economicsWaterfall').innerHTML;
  const cash = context.__elements.get('economicsCashflow').innerHTML;
  assert.match(fall, /Complete the graph to plot the cash gate/);
  assert.match(cash, /Complete the graph to plot cash flow/);
  assert.doesNotMatch(fall, /<svg/);
  assert.doesNotMatch(cash, /<svg/);
  assert.doesNotMatch(fall, /\$\d/);
  assert.doesNotMatch(cash, /\$\d/);
  assert.equal(context.__elements.get('powerBreakevenChart').hidden, true);
  assert.equal(context.__elements.get('powerBreakevenChart').innerHTML, '');
});

test('economics dashboard groups capital, operations, the cash gate, and screening DCF', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="economicsGateValue"/);
  assert.match(html, /id="economicsWaterfall"/);
  assert.match(html, /id="economicsCashflow"/);
  assert.match(html, /id="powerBreakevenChart"/);
  assert.doesNotMatch(html, /chart\.js/i);
  assert.doesNotMatch(html, /d3(?:\.min)?\.js/i);
  assert.match(html, /id="economicsCapital"/);
  assert.match(html, /id="economicsOps"/);
  assert.match(html, /id="economicsAssumptions"/);
  assert.match(html, /id="economicsDcf"/);
  assert.match(html, /Show NPV\/IRR \(screening\)/);
  assert.match(html, /R − OPEX − ann\. CAPEX/);
  assert.doesNotMatch(html, /id="economicsAck"/);
  assert.doesNotMatch(html, /I understand these are screening figures/);
  assert.doesNotMatch(html, /Network detail/);
  assert.doesNotMatch(html, /<summary>Site footprint<\/summary>/);
  assert.doesNotMatch(html, /Finds the purchased electricity price/);
  assert.match(html, /Not a PPA\. Does not re-size the plant\./);
  assert.match(html, /id="addPlantToNetwork"/);
  const networkBodyAt = html.indexOf('id="networkBody"');
  const networkPanelAt = html.indexOf('id="networkPanel"');
  assert.ok(networkBodyAt > networkPanelAt);
  assert.equal(html.slice(networkPanelAt, networkBodyAt).includes('<details'), false);

  const store = {
    data: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; },
    setItem(key, value) { this.data[key] = String(value); },
  };
  const context = loadApp(store);
  const app = context.__FLOWSHEET_APP__;
  assert.match(context.__elements.get('economicsGateValue').textContent, /\$/);
  assert.match(context.__elements.get('economicsGateNote').textContent, /cash gate/);
  assert.match(context.__elements.get('economicsCapital').innerHTML, /Installed CAPEX/);
  assert.match(context.__elements.get('economicsCapital').innerHTML, /Annualized CAPEX/);
  assert.match(context.__elements.get('economicsOps').innerHTML, /Revenue/);
  assert.match(context.__elements.get('economicsOps').innerHTML, /OPEX/);
  assert.match(context.__elements.get('economicsOps').innerHTML, /R − OPEX/);
  assert.doesNotMatch(context.__elements.get('economicsCapital').innerHTML, /NPV/);
  assert.doesNotMatch(context.__elements.get('economicsOps').innerHTML, /IRR/);
  const fall = context.__elements.get('economicsWaterfall').innerHTML;
  assert.match(fall, /<svg/);
  assert.match(fall, /Revenue/);
  assert.match(fall, /− OPEX/);
  assert.match(fall, /− ann\. CAPEX/);
  assert.match(fall, />Net</);
  assert.match(fall, /tea-gate-band/);
  assert.match(fall, /tea-fall-step[^"]*is-gate/);
  assert.equal((fall.match(/tea-fall-step/g) || []).length, 4);
  assert.ok((fall.match(/tea-axis-tick/g) || []).length >= 2);
  const econ = app.economics;
  const step = key => {
    const match = fall.match(new RegExp(`data-key="${key}" data-from="([^"]+)" data-to="([^"]+)"`));
    assert.ok(match, key);
    return { from: Number(match[1]), to: Number(match[2]) };
  };
  const revenue = step('revenue');
  assert.equal(revenue.from, 0);
  assert.equal(revenue.to, econ.annualRevenue);
  const opex = step('opex');
  assert.equal(opex.from, econ.annualRevenue);
  assert.ok(Math.abs((opex.from - opex.to) - Math.abs(econ.annualOperatingCost)) < 1e-6);
  const capex = step('capex');
  assert.ok(Math.abs((capex.from - capex.to) - Math.abs(econ.annualizedCapex)) < 1e-6);
  const net = step('net');
  assert.equal(net.from, 0);
  assert.equal(net.to, econ.annualNetCash);
  const cash = context.__elements.get('economicsCashflow').innerHTML;
  assert.match(cash, /<svg/);
  assert.match(cash, /Year 0 · CAPEX/);
  assert.equal((cash.match(/data-year="/g) || []).length, econ.cashFlows.length);
  const year0 = cash.match(/class="tea-cash-bar is-capex" data-year="0" data-value="([^"]+)"/);
  assert.ok(year0);
  assert.equal(Number(year0[1]), econ.cashFlows[0]);
  assert.equal(econ.cashFlows[0], -econ.installedCapex);
  assert.ok(econ.installedCapex > 0);
  const screenedChart = context.__elements.get('powerBreakevenChart');
  assert.equal(screenedChart.hidden, false);
  assert.match(screenedChart.innerHTML, /\$\/kWh/);
  assert.match(screenedChart.innerHTML, /data-solo-kind="(?:price|above|none)"/);
  assert.match(screenedChart.innerHTML, /data-shared-kind="(?:price|above|none)"/);
  assert.match(context.__elements.get('economicsMetrics').innerHTML, /Levelized delivered cost/);
  const assumptions = context.__elements.get('economicsAssumptions').textContent;
  assert.match(assumptions, /Power cost|Power band|Grid tariff|PV CAPEX/);
  assert.match(assumptions, /CAPEX/);
  assert.match(assumptions, /screening|not a PPA/i);
  assert.match(assumptions, /Screening band|Not set|On /);
  assert.equal(Boolean(context.__elements.get('economicsDcf').open), false);
  const dcf = context.__elements.get('economicsDcfMetrics').innerHTML;
  assert.match(dcf, /NPV/);
  assert.match(dcf, /IRR/);
  const wasHidden = /Hidden until this disclosure is open/.test(dcf);
  const details = context.__elements.get('economicsDcf');
  details.open = true;
  details.listeners.toggle();
  const shown = context.__elements.get('economicsDcfMetrics').innerHTML;
  assert.doesNotMatch(shown, /Hidden until this disclosure is open/);
  assert.match(shown, /NPV/);
  assert.match(shown, /\$/);
  assert.equal(store.getItem('flowsheet-economics-ack'), '1');
  details.open = false;
  details.listeners.toggle();
  assert.equal(store.getItem('flowsheet-economics-ack'), '0');
  if (wasHidden) {
    assert.match(context.__elements.get('economicsDcfMetrics').innerHTML, /Hidden until this disclosure is open/);
  }

  assert.match(context.__elements.get('networkStatus').textContent, /No plants in this rollup/);
  assert.equal(context.__elements.get('networkBody').hidden, true);
  assert.equal(context.__elements.get('powerBreakevenResult').hidden, false);
  assert.match(context.__elements.get('powerBreakevenResult').textContent, /screening/i);
  assert.equal(context.__elements.get('siteFootprint').hidden, false);

  app.loadDemoNetwork();
  assert.equal(context.__elements.get('networkBody').hidden, false);
  assert.match(context.__elements.get('networkPlants').innerHTML, /Open/);
  assert.match(context.__elements.get('networkMetrics').innerHTML, /Net cash/);
  app.clearNetwork();
  assert.equal(context.__elements.get('networkBody').hidden, true);
  assert.match(context.__elements.get('networkStatus').textContent, /No plants in this rollup/);
  assert.doesNotMatch(context.__elements.get('networkStatus').textContent, /Each keeps its own/);
});

test('positive-cashflow status reports heat covered when present', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadAbundanceHub();
  const sized = app.sizeForPositiveCashflow({ scales: [1], rates: [0] });
  assert.equal(sized.mode, 'positive-cashflow');
  const status = context.__elements.get('sizeToTargetStatus').textContent;
  assert.match(status, /positive-sale/);
  assert.match(status, /heat covered/);
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

test('apply location uses frozen or screening solar when live PVGIS fetch fails', async () => {
  const context = loadApp();
  let fetches = 0;
  context.fetch = async () => { fetches += 1; throw new TypeError('Failed to fetch'); };
  context.PvgisSites = require('../data/pvgis-sites');
  const app = context.__FLOWSHEET_APP__;
  const statusText = () => context.document.getElementById('siteFetchStatus').textContent;
  const notesText = () => context.__elements.get('siteNotes').textContent;
  const setCoords = (lat, lon) => {
    context.__elements.get('siteLatitude').value = String(lat);
    context.__elements.get('siteLongitude').value = String(lon);
    context.__elements.get('siteSolarKWp').value = '10';
    context.__elements.get('siteBatteryKWh').value = '0';
  };

  assert.match(app.site.notes, /Zabuye/);
  setCoords(36.834, -2.463);
  await app.applyCoordinates();
  assert.equal(fetches, 1);
  assert.doesNotMatch(statusText(), /Failed to fetch|TypeError|Zabuye/);
  assert.match(statusText(), /Live PVGIS blocked \(CORS\/network\)/);
  assert.match(statusText(), /frozen PVGIS-SARAH3 for Almería \(retrieved 2026-09-05\)/);
  assert.doesNotMatch(notesText(), /Zabuye/);
  assert.doesNotMatch(String(app.site.meteo?.notes || ''), /Zabuye|84\.05/);
  assert.equal(app.site.meteo.monthlyPVKWhPerKWp, undefined);
  assert.ok(app.site.solar.typicalMonths);
  assert.ok(app.site.resources.electricity.stream.kWh > 0);

  setCoords(22.737, 69.71);
  await app.applyCoordinates();
  assert.equal(fetches, 1);
  assert.doesNotMatch(statusText(), /Failed to fetch|TypeError|Zabuye|Almería/);
  assert.match(statusText(), /frozen PVGIS-ERA5 for Mundra/);
  assert.doesNotMatch(notesText(), /Zabuye|Almería/);
  assert.match(statusText(), /retrieved 2026-09-21/);
  assert.equal(app.site.solar, null);
  assert.equal(app.site.meteo.quality, 'cited');
  assert.equal(app.site.meteo.retrieved, '2026-09-21');
  assert.match(app.site.meteo.source, /PVGIS-ERA5/);
  assert.equal(app.site.meteo.monthlyPVKWhPerKWp.length, 13);
  assert.ok(app.site.dailyPVKWhPerKWp > 0);
  assert.ok(Math.abs(app.site.resources.electricity.stream.kWh - app.site.dailyPVKWhPerKWp * 10) < 1e-6);

  context.fetch = async () => { fetches += 1; return { ok: false, status: 503 }; };
  setCoords(59.9, 10.8);
  await app.applyCoordinates();
  assert.equal(fetches, 1);
  assert.doesNotMatch(statusText(), /Failed to fetch|TypeError|PVGIS 503|Zabuye|Mundra|Almería/);
  assert.match(statusText(), /fallback unavailable/i);
  assert.match(statusText(), /screening-band ~\d+\.\d kWh\/kWp·day/);
  assert.match(statusText(), /not a cited hourly series/);
  assert.match(statusText(), /same-origin proxy/);
  assert.equal(app.site.meteo.quality, 'screening');
  assert.equal(app.site.meteo.source, 'pvScreeningBand');
  assert.equal(app.site.solar.annualTypical.length, 24);
  const band = context.FlowsheetMapSite.pvScreeningBand(59.9, 10.8);
  const sum = app.site.solar.annualTypical.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - band.typicalKWhPerKWpDay) < 1e-9);
  assert.doesNotMatch(notesText(), /Zabuye|Mundra|Almería/);
});

test('github pages skips live PVGIS when the active site has a freeze', async () => {
  const context = loadApp();
  context.location = { hostname: 'akarshgopal.github.io' };
  let fetches = 0;
  context.fetch = async () => { fetches += 1; throw new TypeError('Failed to fetch'); };
  context.PvgisSites = require('../data/pvgis-sites');
  const app = context.__FLOWSHEET_APP__;
  context.__elements.get('siteLatitude').value = '36.834';
  context.__elements.get('siteLongitude').value = '-2.463';
  context.__elements.get('siteSolarKWp').value = '10';
  context.__elements.get('siteBatteryKWh').value = '0';
  await app.applyCoordinates();
  assert.equal(fetches, 0);
  const status = context.document.getElementById('siteFetchStatus').textContent;
  assert.match(status, /frozen PVGIS-SARAH3 for Almería/);
  assert.doesNotMatch(status, /Zabuye/);
  assert.doesNotMatch(context.__elements.get('siteNotes').textContent, /Zabuye/);
  assert.equal(app.site.latitude, 36.834);
  assert.equal(app.site.longitude, -2.463);
});

test('process and rights use human labels, and displayed kWp, assay, and CAPEX are rounded', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(0);
  const canvas = context.__elements.get('flowsheetCanvas').innerHTML;
  assert.match(canvas, />DAC</);
  assert.match(canvas, />SWRO</);
  assert.match(canvas, />Sabatier water</);
  assert.doesNotMatch(canvas, />Dac</);
  assert.doesNotMatch(canvas, />Swro</);
  assert.doesNotMatch(canvas, />Sabatier Water</);
  const rights = context.__elements.get('siteRights').innerHTML;
  assert.match(rights, /Grid import/);
  assert.match(rights, /Seawater intake/);
  assert.match(rights, /Salt purchase/);
  assert.match(rights, /data-right="brineConcession"/);
  assert.match(rights, /Brine concession/);

  app.site.solarKWp = 12.3456789;
  app.site.assay = {
    ...(app.site.assay || {}),
    summary: '68.54392789373814 g/kg cited process-brine majors',
    quality: 'cited',
  };
  const sabatier = app.graph.nodes.find(node => node.id === 'sabatier');
  sabatier.economics.installedCapex = 12345.6789;
  app.solve();
  const kWp = context.__elements.get('siteSolarKWp');
  assert.equal(kWp.value, '12.35');
  assert.match(kWp.title, /12\.3456789 kWp/);
  assert.equal(app.site.solarKWp, 12.3456789);
  const assay = context.__elements.get('siteAssay').innerHTML;
  assert.match(assay, />68\.54 g\/kg/);
  assert.doesNotMatch(assay, />68\.54392789373814/);
  assert.match(assay, /title="68\.54392789373814 g\/kg/);
  context.__elements.get('flowsheetCanvas').innerHTML = '';
  // Select the block through the public solve render by clicking is unavailable;
  // inspector follows selectedNodeId, which loadCase set to sabatier.
  const controls = context.__elements.get('nodeControls').innerHTML;
  assert.match(controls, /value="12346"/);
  assert.match(controls, /title="12345\.6789"/);
  assert.equal(sabatier.economics.installedCapex, 12345.6789);
});

test('loading a demo or clearing the factory drops a sticky cashflow banner', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const banner = context.__elements.get('cashflowResult');
  app.loadAbundanceHub();
  app.sizeForPositiveCashflow({ scales: [1], rates: [0] });
  assert.equal(banner.hidden, false);
  assert.match(banner.innerHTML, /Net cash/);
  app.loadCoastalMethane(0);
  assert.equal(banner.hidden, true);
  assert.equal(banner.innerHTML, '');
  app.loadAbundanceHub();
  app.sizeForPositiveCashflow({ scales: [1], rates: [0] });
  assert.equal(banner.hidden, false);
  app.clearFactory();
  assert.equal(banner.hidden, true);
  assert.equal(banner.innerHTML, '');
  assert.equal(app.graph.nodes.length, 0);
});

test('idle blocks name the cause and can jump to the port or Rights', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.clearFactory();
  const dac = app.addNode('dac');
  const canvas = context.__elements.get('flowsheetCanvas');
  assert.match(canvas.innerHTML, /Missing Feed gas/);
  assert.doesNotMatch(canvas.innerHTML, /Not running/);
  assert.match(context.__elements.get('nodeDiagnosis').innerHTML, /Open|Show Feed gas|data-diagnosis="port"/);
  const diagnosis = app.showCause(dac.id);
  assert.equal(diagnosis.code, 'missing-connection');
  assert.equal(diagnosis.port, 'air');
  assert.match(context.__elements.get('streamList').innerHTML, /is-cause/);
  assert.match(context.__elements.get('streamList').innerHTML, /data-port-row="air"/);

  app.completeBoundaries();
  app.setpoints[dac.id] = 0;
  app.solve();
  assert.match(context.__elements.get('flowsheetCanvas').innerHTML, /Zero setpoint/);
  assert.equal(app.showCause(dac.id).code, 'zero-setpoint');

  app.loadCoastalMethane(0);
  const grid = app.addNode('grid-electricity');
  assert.match(context.__elements.get('flowsheetCanvas').innerHTML, /Unverified grid right/);
  const right = app.showCause(grid.id);
  assert.equal(right.code, 'unverified-right');
  assert.equal(right.action, 'rights');
  assert.equal(app.activeTab, 'location');
  const rights = context.__elements.get('siteRights').innerHTML;
  assert.match(rights, /data-right="gridImport"/);
  assert.match(rights, /is-cause/);
});

test('Fit scales the graph to the viewport instead of stopping at 25%', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(0);
  const canvas = context.__elements.get('flowsheetCanvas');
  canvas.clientWidth = 1100;
  canvas.clientHeight = 720;
  canvas.scrollLeft = 0;
  canvas.scrollTop = 0;
  app.fitCanvas();
  assert.ok(app.canvasZoom > 0.45, `desktop fit zoom ${app.canvasZoom}`);
  assert.ok(app.canvasZoom <= 1);

  canvas.clientWidth = 375;
  canvas.clientHeight = 640;
  app.fitCanvas({ compact: true });
  assert.ok(app.canvasZoom >= 0.08, `narrow fit zoom ${app.canvasZoom}`);
  assert.ok(app.canvasZoom < 0.5, `narrow fit zoom ${app.canvasZoom}`);
  const width = Number(canvas.innerHTML.match(/style="width:([0-9.]+)px/)[1]);
  assert.ok(width <= 375, `svg width ${width}`);
});

test('process chrome collapses the palette, cites map sources, and searches block copy', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'flowsheet.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js/flowsheet-app.js'), 'utf8');
  assert.match(html, /id="paletteDrawerToggle"/);
  assert.match(html, /id="paletteEmpty"/);
  assert.match(html, /id="siteMapSources"/);
  assert.match(html, /min="8"/);
  assert.match(html, /Drag empty canvas to pan/);
  assert.doesNotMatch(css, /min-width:\s*980px/);
  assert.match(css, /\.building-card\[hidden\]/);
  assert.match(css, /\.controls-sidebar\.is-open/);
  assert.match(css, /\.inspector-sidebar\.has-selection/);
  assert.match(html, /No blocks match/);
  assert.match(app, /MIN_ZOOM = 0\.08/);
  assert.match(app, /data-title/);
  assert.match(app, /applyPaletteFilter/);
  assert.doesNotMatch(html, /empire/i);
});

test('Overview is a full-width decision board with a slate table, cash gate, and demoted cases', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'flowsheet.css'), 'utf8');
  const overview = html.slice(html.indexOf('id="panelOverview"'), html.indexOf('id="panelLocation"'));
  assert.match(css, /\.overview-dashboard\s*\{[^}]*max-width:\s*none/);
  assert.doesNotMatch(css, /\.overview-dashboard\s*\{[^}]*max-width:\s*960px/);
  assert.doesNotMatch(css, /min\(720px/);
  assert.match(overview, /id="overviewCases"/);
  assert.match(overview, /id="loadZabuyeHub"/);
  assert.match(overview, /data-demo-id="zabuye-hub"/);
  assert.match(overview, /id="loadMethanolPlant"/);
  assert.match(overview, /optgroup label="Materials"/);
  assert.match(overview, /optgroup label="Fuels/);
  assert.match(overview, /screening cash/);
  assert.ok(overview.indexOf('label="Materials"') < overview.indexOf('label="Fuels'));
  assert.doesNotMatch(overview, /class="overview-demos"/);
  assert.doesNotMatch(overview, /class="hero-metric"/);
  assert.doesNotMatch(overview, /Load a demo/);
  assert.doesNotMatch(overview, /Choose a site/);
  assert.doesNotMatch(overview, /empire/i);
  assert.match(overview, /id="sizeForCashflow"/);
  assert.match(overview, /Size one product/);

  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const slate = context.__elements.get('overviewSlate').innerHTML;
  assert.match(slate, /<table/);
  assert.match(slate, /kg\/d/);
  assert.match(slate, /t\/y/);
  assert.match(slate, /Share/);
  assert.match(slate, /Lithium/);
  assert.match(slate, /Salt/);
  assert.match(slate, /Potash/);
  const productRows = slate.match(/<tr/g) || [];
  assert.ok(productRows.length >= 4, `expected a header plus at least 3 products, got ${productRows.length}`);
  const land = context.__elements.get('overviewLand').innerHTML;
  assert.match(land, /Land/);
  assert.match(land, /Solar land/);
  assert.match(land, /ha|m²/);
  const yieldHtml = context.__elements.get('overviewYield').innerHTML;
  assert.match(yieldHtml, /kWh\/kWp/);
  assert.match(yieldHtml, /kWp/);
  const water = context.__elements.get('overviewWater').innerHTML;
  assert.match(water, /Water/);
  assert.match(water, /kg\/d|—/);
  const cash = context.__elements.get('overviewCashflow').innerHTML;
  assert.match(cash, /Net cash \/ year/);
  assert.match(cash, /\$/);
  assert.match(cash, /Above gate|Below gate|At gate/);
  assert.match(cash, /R − OPEX − ann\. CAPEX/);
  assert.doesNotMatch(cash, /quality-chip quality-screening/);
  const honesty = context.__elements.get('overviewHonesty').textContent;
  assert.match(honesty, /not bankable/i);
  assert.match(honesty, /screening/i);
  assert.doesNotMatch(honesty, /Load a demo|Load a scenario/);
  const drivers = context.__elements.get('overviewDrivers').innerHTML;
  assert.match(drivers, /Power/);
  assert.match(drivers, /Wiring/);
  assert.match(drivers, /Balance/);
  assert.match(drivers, /Rights/);
  assert.match(drivers, /Brine concession/);

  app.clearFactory();
  assert.match(context.__elements.get('overviewSiteName').textContent, /No plant loaded/);
  assert.match(context.__elements.get('overviewHonesty').textContent, /No plant loaded — pick a case or open Process/);
  assert.doesNotMatch(context.__elements.get('overviewHonesty').textContent, /Load a demo/);
  assert.equal(context.__elements.get('cashflowResult').hidden, true);

  app.loadAbundanceHub();
  const sized = app.sizeForPositiveCashflow({ scales: [1], rates: [0] });
  assert.equal(sized.mode, 'positive-cashflow');
  const banner = context.__elements.get('cashflowResult');
  assert.equal(banner.hidden, false);
  assert.match(banner.innerHTML, /Before/);
  assert.match(banner.innerHTML, /After/);
  assert.match(banner.innerHTML, /Delta/);
  assert.match(banner.innerHTML, /Net cash/);
  assert.match(banner.innerHTML, /class="delta-board"/);
});

test('process chrome reads as a flowsheet, with gallery units behind More units', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'flowsheet.css'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'js/flowsheet-app.js'), 'utf8');
  const process = html.slice(html.indexOf('id="panelProcess"'), html.indexOf('id="panelEconomics"'));
  assert.doesNotMatch(process, /Blank factory|Start here|Factory floor|Saved factories/);
  assert.match(process, /Empty flowsheet/);
  assert.match(process, /Add a block or open a case on Overview/);
  assert.match(process, />Canvas</);
  assert.ok(process.indexOf('id="zoomFit"') < process.indexOf('>Canvas<'));
  assert.ok(process.indexOf('id="autoArrange"') < process.indexOf('>Canvas<'));
  assert.ok(process.indexOf('id="paletteDrawerToggle"') < process.indexOf('>Canvas<'));
  assert.ok(process.indexOf('id="focusCanvas"') > process.indexOf('>Canvas<'));
  assert.match(process, /id="advancedComparison"/);
  assert.doesNotMatch(process, /id="advancedComparison"[^>]*\bopen\b/);
  assert.match(process, /<summary>Advanced<\/summary>/);
  assert.match(css, /\.node-kind-badge/);
  assert.match(css, /\.palette-more/);
  assert.match(source, /PALETTE_MORE_UNITS/);
  assert.doesNotMatch(html, /empire/i);

  const context = loadApp();
  const palette = context.__elements.get('buildingPalette').innerHTML;
  const minerals = palette.indexOf('>Minerals<');
  const fuels = palette.indexOf('>Fuels<');
  const water = palette.indexOf('>Water<');
  const more = palette.indexOf('>More units<');
  assert.ok(minerals >= 0 && minerals < fuels && fuels < water && water < more);
  assert.match(palette.slice(Math.max(0, minerals - 40), minerals), /\bopen\b/);
  assert.match(palette.slice(Math.max(0, fuels - 40), fuels), /\bopen\b/);
  assert.doesNotMatch(palette.slice(Math.max(0, more - 80), more), /\bopen\b/);
  for (const unit of ['brine-minerals', 'chlor-alkali', 'electrolyzer', 'sabatier', 'swro', 'solar-pv']) {
    assert.ok(palette.indexOf(`data-unit="${unit}"`) < more, unit);
  }
  for (const unit of ['titanium-kroll', 'aluminium-smelter', 'hydrogen-dri', 'nuclear-electricity', 'solar-thermal', 'thermal-storage', 'med', 'msf']) {
    assert.ok(palette.indexOf(`data-unit="${unit}"`) > more, unit);
  }

  const canvas = context.__elements.get('flowsheetCanvas').innerHTML;
  assert.match(canvas, /node-kind-badge/);
  assert.match(canvas, /node-status-rule/);
  assert.match(canvas, /rx="3"/);
  assert.doesNotMatch(canvas, /rx="10"/);

  context.__FLOWSHEET_APP__.clearFactory();
  const empty = context.__elements.get('flowsheetCanvas').innerHTML;
  assert.match(empty, /Empty flowsheet/);
  assert.match(empty, /Add a block or open a case on Overview/);
  assert.doesNotMatch(empty, /Blank factory|Start here/);
  assert.equal(context.__elements.get('diagramTitle').textContent, 'Empty flowsheet');
});
