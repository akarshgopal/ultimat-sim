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
  assert.match(html, /id="screenPowerBreakeven"/);
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
  assert.match(select.innerHTML, /value="lithium"/);
  assert.match(select.innerHTML, /value="potash"/);
  assert.match(select.innerHTML, /value="bromine"/);

  app.loadMethaneRecycle();
  const screened = app.screenPowerBreakEven();
  assert.ok(screened);
  assert.ok(['flip', 'no-flip-always-negative', 'no-flip-always-positive'].includes(screened.status));
  const text = context.__elements.get('powerBreakevenResult').textContent;
  assert.match(text, /screening/i);
  assert.match(text, /not a PPA/i);
  assert.equal(context.__elements.get('powerBreakevenResult').hidden, false);

  context.__elements.get('powerBreakevenMode').value = 'shared';
  const shared = app.screenPowerBreakEven();
  assert.equal(shared.mode, 'shared');
  assert.match(context.__elements.get('powerBreakevenResult').textContent, /shared/i);
  assert.match(context.__elements.get('powerBreakevenResult').textContent, /screening/i);
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
  context.fetch = async () => { throw new TypeError('Failed to fetch'); };
  context.PvgisSites = require('../data/pvgis-sites');
  const app = context.__FLOWSHEET_APP__;
  const statusText = () => context.document.getElementById('siteFetchStatus').textContent;
  const setCoords = (lat, lon) => {
    context.__elements.get('siteLatitude').value = String(lat);
    context.__elements.get('siteLongitude').value = String(lon);
    context.__elements.get('siteSolarKWp').value = '10';
    context.__elements.get('siteBatteryKWh').value = '0';
  };

  setCoords(36.834, -2.463);
  await app.applyCoordinates();
  assert.doesNotMatch(statusText(), /Failed to fetch|TypeError/);
  assert.match(statusText(), /Live PVGIS blocked \(CORS\/network\)/);
  assert.match(statusText(), /frozen PVGIS-SARAH3 for Almería \(retrieved 2026-09-05\)/);
  assert.ok(app.site.solar.typicalMonths);
  assert.ok(app.site.resources.electricity.stream.kWh > 0);

  setCoords(22.737, 69.71);
  await app.applyCoordinates();
  assert.doesNotMatch(statusText(), /Failed to fetch|TypeError/);
  assert.match(statusText(), /frozen PVGIS-ERA5 for Mundra/);
  assert.match(statusText(), /retrieved 2026-09-21/);
  assert.equal(app.site.solar, null);
  assert.equal(app.site.meteo.quality, 'cited');
  assert.equal(app.site.meteo.retrieved, '2026-09-21');
  assert.match(app.site.meteo.source, /PVGIS-ERA5/);
  assert.equal(app.site.meteo.monthlyPVKWhPerKWp.length, 13);
  assert.ok(app.site.dailyPVKWhPerKWp > 0);
  assert.ok(Math.abs(app.site.resources.electricity.stream.kWh - app.site.dailyPVKWhPerKWp * 10) < 1e-6);

  context.fetch = async () => ({ ok: false, status: 503 });
  setCoords(59.9, 10.8);
  await app.applyCoordinates();
  assert.doesNotMatch(statusText(), /Failed to fetch|TypeError|PVGIS 503/);
  assert.match(statusText(), /screening-band ~\d+\.\d kWh\/kWp·day/);
  assert.match(statusText(), /not a cited hourly series/);
  assert.match(statusText(), /same-origin proxy/);
  assert.equal(app.site.meteo.quality, 'screening');
  assert.equal(app.site.meteo.source, 'pvScreeningBand');
  assert.equal(app.site.solar.annualTypical.length, 24);
  const band = context.FlowsheetMapSite.pvScreeningBand(59.9, 10.8);
  const sum = app.site.solar.annualTypical.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - band.typicalKWhPerKWpDay) < 1e-9);
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
