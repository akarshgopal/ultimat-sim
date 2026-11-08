const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// Boot exactly what the page loads, in page order (CDN and vendored decoders aside),
// so a missing or misordered script fails here as a boot error. Every case file the
// page lists is loaded and exercised by the Overview demo test below.
const PAGE_SCRIPTS = [...INDEX_HTML.matchAll(/<script src="([^"]+)"/g)]
  .map(match => match[1])
  .filter(file => !/^(https?:|vendor\/)/.test(file));
const OVERVIEW_DEMOS = [...INDEX_HTML.matchAll(/data-demo-id="([^"]+)"/g)].map(match => match[1]);

function loadApp(localStorage) {
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
    const parts = () => new Set(String(el.className || '').split(/\s+/).filter(Boolean));
    el.classList = {
      add(name) { const set = parts(); set.add(name); el.className = [...set].join(' '); },
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
  for (const file of PAGE_SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  }
  return context;
}

const el = (context, id) => context.__elements.get(id);

test('page scripts boot the app on the Zabuye demo; wiring blocks keeps their setpoints', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  for (const global of ['FlowsheetUnits', 'MaterialPowerBreakeven', 'FlowsheetMapSite', 'PvgisSites', 'NetworkCase']) {
    assert.ok(context[global], `${global} must be loaded before the app`);
  }
  assert.equal(app.site.id, 'china-zabuye');
  assert.ok(app.economics.annualNetCash > 0);
  assert.equal(el(context, 'overviewDemoChip').hidden, false);

  app.clearFactory();
  assert.deepEqual([...app.graph.nodes], []);
  const dac = app.addNode('dac');
  const sabatier = app.addNode('sabatier');
  app.choosePort({ node: dac.id, port: 'capturedCo2', direction: 'out' });
  app.choosePort({ node: sabatier.id, port: 'co2', direction: 'in' });
  assert.equal(app.graph.edges.length, 1);
  assert.equal(app.setpoints[dac.id], 10);
  assert.equal(app.setpoints[sabatier.id], 5);
});

test('every Overview demo loads and solves from the case picker', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const picker = el(context, 'overviewCases');
  assert.ok(OVERVIEW_DEMOS.length >= 20);
  for (const id of OVERVIEW_DEMOS) {
    app.clearFactory();
    picker.listeners.change({ target: { value: id } });
    assert.ok(app.graph.nodes.length > 0, id);
    assert.equal(app.result.convergence.converged, true, id);
    assert.ok(Number.isFinite(app.economics.annualNetCash), id);
    assert.ok(Number.isFinite(app.economics.installedCapex), id);
  }
  assert.equal(app.network.plants.length, 12, 'last demo is the network rollup');
});

test('green routes feed the product reactor from on-site electrolysis, not a purchased feed', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const routes = [
    ['loadGreenAmmonia', 'ammonia', 'hydrogen', 'electrolyzer', 'hydrogen-feed'],
    ['loadGreenH2Dri', 'dri', 'hydrogen', 'electrolyzer', 'hydrogen-feed'],
    ['loadGreenFt', 'ft-liquids', 'hydrogen', 'electrolyzer', 'hydrogen-feed'],
    ['loadGreenMto', 'mto', 'methanol', 'methanol', 'methanol-feed'],
    ['loadGreenUrea', 'urea', 'ammonia', 'ammonia', 'ammonia-feed'],
  ];
  for (const [loader, product, port, upstream, purchased] of routes) {
    app[loader]();
    assert.ok(Math.abs(app.result.nodes[product].activity - 1000) / 1000 < 0.01, loader);
    assert.equal(app.graph.edges.find(edge => edge.to.node === product && edge.to.port === port).from.node, upstream, loader);
    assert.ok(!app.graph.nodes.some(node => node.id === purchased), loader);
    assert.ok(app.graph.nodes.some(node => node.unit === 'electrolyzer'), loader);
  }
});

test('methane recycle converges and baseline comparison keeps engine economics and deltas', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadMethaneRecycle();
  assert.equal(app.result.convergence.converged, true);
  assert.ok(app.graph.edges.some(edge => edge.recycle));
  assert.ok(Number.isFinite(app.economics.npv));

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
  assert.match(el(context, 'comparisonMetrics').innerHTML, /\+\$100/);
  const avoided = app.baseline.economics.breakdown.sourcePurchases - app.economics.breakdown.sourcePurchases;
  assert.ok(avoided > 0);
  assert.ok(el(context, 'synergyLedger').innerHTML.includes(`+$${avoided.toLocaleString('en-US', { maximumFractionDigits: 2 })}`));
  app.clearBaseline();
  assert.equal(el(context, 'comparisonPanel').hidden, true);
});

test('coastal methane idles at night in December, covers heat, and sizes to a methane target', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(12);
  assert.equal(app.site.month, 12);
  assert.equal(app.result.horizon.hours[0].methane, 0);
  assert.ok(app.result.horizon.hours.some(entry => entry.pv > 0 && entry.methane > 0));
  assert.ok(app.result.heatIntegration.coveredKWh > 0);

  const before = app.site.solarKWp;
  const sized = app.sizeCoastalToMethane(15, 12);
  assert.ok(app.site.solarKWp > before);
  assert.ok(Math.abs(sized.achieved - 15) < 1e-6);
  assert.equal(app.sizing.iterations, sized.iterations);

  app.loadCoastalMethane(0);
  const h2 = app.sizeToProduct('H2', 15);
  assert.equal(h2.product, 'H2');
  assert.ok(app.result.nodes.electrolyzer.activity > 1);
  assert.ok(app.graph.nodes.find(node => node.id === 'electricity').rate > 0);

  app.loadMethanolPlant(0);
  assert.ok(app.result.nodes.methanol.activity > 0);
  const methanol = app.sizeToProduct('methanol', 8);
  assert.ok(Math.abs(methanol.achieved - 8) < 1e-4);
});

test('switching DAC route drops incompatible heat and reagent connections', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.clearFactory();
  const dac = app.addNode('dac-solid');
  app.completeBoundaries();
  assert.equal(app.result.nodes[dac.id].activity, 10);

  app.replaceUnit(dac.id, 'dac-electroswing');
  assert.equal(dac.unit, 'dac-electroswing');
  assert.equal(app.graph.edges.some(edge => edge.to.node === dac.id && edge.to.port === 'heat'), false);
  assert.ok(app.result.nodes[dac.id].activity > 0);
  const chemicals = app.graph.nodes.filter(node => node.unit === 'consumable-source').map(node => node.params.stream.chemicalId);
  assert.ok(chemicals.includes('amine-sorbent'));
  assert.ok(chemicals.includes('quinone-electrode'));
});

test('network rollup sums sited plants and plants can be renamed, removed, and added in the page', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  context.window.prompt = () => { throw new Error('plant naming must stay in the page'); };
  app.loadDemoNetwork();
  assert.equal(app.network.plants.length, 12);
  for (const product of ['CH4', 'NH3', 'PVmodule', 'Urea', 'PortlandCement', 'Cu', 'FloatGlass', 'C12H26', 'C2H4', 'Fe']) {
    assert.ok(app.network.slate[product] > 0, product);
  }
  assert.equal(app.site.id, 'dead-sea-pvgis-2026-09-06');
  assert.equal(el(context, 'networkBody').hidden, false);

  const plantsHtml = el(context, 'networkPlants').innerHTML;
  let taggedByRevenueNotMass = false;
  for (const plant of app.network.plants) {
    const sales = (plant.economics?.sinks || []).filter(sink => sink.disposition === 'sale' && sink.deliveredAmount > 0);
    const byRevenue = sales.slice().sort((left, right) => right.annualRevenue - left.annualRevenue || right.deliveredAmount - left.deliveredAmount);
    const byMass = sales.slice().sort((left, right) => right.deliveredAmount - left.deliveredAmount);
    assert.match(plantsHtml, new RegExp(`data-plant-id="${plant.id}" data-lead="${byRevenue[0].id}"`));
    if (byRevenue[0].id !== byMass[0].id) taggedByRevenueNotMass = true;
  }
  assert.equal(taggedByRevenueNotMass, true);

  const count = app.network.plants.length;
  const id = app.network.plants[0].id;
  const original = app.network.plants[0].name;
  app.beginRemovePlant(id);
  assert.equal(app.network.plants.length, count);
  app.cancelPlantEdit();
  assert.equal(app.network.plants.length, count);
  assert.equal(app.renameNetworkPlant(id, `  ${original}  `), false);
  assert.equal(app.renameNetworkPlant(id, 'Renamed plant'), true);
  assert.equal(app.network.plants.find(plant => plant.id === id).name, 'Renamed plant');
  assert.equal(app.removeNetworkPlant(id), true);
  assert.equal(app.network.plants.length, count - 1);

  const beforeAdd = app.network.plants.length;
  app.beginAddPlant();
  assert.equal(el(context, 'addPlantForm').hidden, false);
  app.cancelAddPlant();
  assert.equal(el(context, 'addPlantForm').hidden, true);
  assert.equal(app.submitAddPlant('   '), false);
  assert.equal(app.network.plants.length, beforeAdd);
  assert.equal(app.submitAddPlant('  Extra plant  '), true);
  assert.equal(app.network.plants.length, beforeAdd + 1);
  assert.ok(app.network.plants.some(plant => plant.name === 'Extra plant'));

  app.clearNetwork();
  assert.equal(el(context, 'networkBody').hidden, true);
});

test('location presets set coordinates and never authorize unverified rights', async () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.clearFactory();
  const picker = el(context, 'sitePreset');
  for (const id of ['spain-almeria', 'india-mundra', 'uae-taweelah', 'us-salton-sea']) {
    assert.match(picker.innerHTML, new RegExp(`value="${id}"`));
  }
  picker.value = 'spain-almeria';
  await app.applySitePreset();
  assert.equal(app.site.id, 'spain-almeria');
  assert.equal(app.site.latitude, 36.834);
  assert.equal(app.site.longitude, -2.463);
  assert.equal(Number(el(context, 'siteLatitude').value), 36.834);
  assert.equal(app.site.rights.seawaterIntake.status, 'assumed');
  assert.equal(app.site.rights.gridImport.authorize, false);
  assert.ok(Object.values(app.site.rights).every(right => right.status !== 'authorized'));

  picker.value = 'india-mundra';
  await app.applySitePreset();
  assert.equal(app.site.id, 'india-mundra');
  assert.equal(app.site.latitude, 22.737);
  assert.equal(app.site.rights.seawaterDischarge.status, 'unverified');
});

// Same-origin data/*.json is served; every cross-origin request fails like CORS does.
function offlineFetch(onPvgis) {
  return async url => {
    if (/^data\/[\w.-]+\.json$/.test(url)) {
      const body = fs.readFileSync(path.join(ROOT, url), 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    }
    if (/re\.jrc/.test(url)) onPvgis();
    throw new TypeError('Failed to fetch');
  };
}

test('apply location falls back to frozen, then screening, solar when live PVGIS fails', async () => {
  const context = loadApp();
  let fetches = 0;
  context.fetch = offlineFetch(() => { fetches += 1; });
  const app = context.__FLOWSHEET_APP__;
  const setCoords = (lat, lon) => {
    el(context, 'siteLatitude').value = String(lat);
    el(context, 'siteLongitude').value = String(lon);
    el(context, 'siteSolarKWp').value = '10';
    el(context, 'siteBatteryKWh').value = '0';
  };

  setCoords(36.834, -2.463);
  await app.applyCoordinates();
  assert.equal(fetches, 1);
  assert.equal(app.site.meteo.monthlyPVKWhPerKWp, undefined);
  assert.ok(app.site.solar.typicalMonths, 'Almería keeps the frozen hourly series');
  assert.ok(app.site.resources.electricity.stream.kWh > 0);

  setCoords(22.737, 69.71);
  await app.applyCoordinates();
  assert.equal(fetches, 1, 'live fetch is not retried after it failed once');
  assert.equal(app.site.solar, null);
  assert.equal(app.site.meteo.quality, 'cited');
  assert.equal(app.site.meteo.monthlyPVKWhPerKWp.length, 13);
  assert.ok(Math.abs(app.site.resources.electricity.stream.kWh - app.site.dailyPVKWhPerKWp * 10) < 1e-6);

  setCoords(59.9, 10.8);
  await app.applyCoordinates();
  assert.equal(app.site.meteo.quality, 'screening');
  assert.equal(app.site.solar.annualTypical.length, 24);
  const band = context.FlowsheetMapSite.pvScreeningBand(59.9, 10.8);
  const sum = app.site.solar.annualTypical.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - band.typicalKWhPerKWpDay) < 1e-9);

  const pages = loadApp();
  pages.location = { hostname: 'akarshgopal.github.io' };
  let pageFetches = 0;
  pages.fetch = offlineFetch(() => { pageFetches += 1; });
  el(pages, 'siteLatitude').value = '36.834';
  el(pages, 'siteLongitude').value = '-2.463';
  el(pages, 'siteSolarKWp').value = '10';
  el(pages, 'siteBatteryKWh').value = '0';
  await pages.__FLOWSHEET_APP__.applyCoordinates();
  assert.equal(pageFetches, 0, 'GitHub Pages uses the freeze without a live fetch');
  assert.equal(pages.__FLOWSHEET_APP__.site.latitude, 36.834);
});

test('purchased-power break-even screens sold products and handles plants with none', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const select = el(context, 'powerBreakevenMaterial');
  app.loadAbundanceHub();
  const soldIds = [...select.innerHTML.matchAll(/value="([^"]*)"/g)].map(match => match[1]).filter(Boolean);
  const catalogIds = context.MaterialPowerBreakeven.MATERIALS.map(item => item.id);
  assert.ok(soldIds.includes('lithium'));
  assert.ok(soldIds.every(id => catalogIds.includes(id)));

  const screened = app.screenPowerBreakEven();
  assert.ok(['flip', 'no-flip-always-negative', 'no-flip-always-positive'].includes(screened.status));
  const chart = el(context, 'powerBreakevenChart');
  assert.equal(chart.hidden, false);
  if (screened.status === 'flip') {
    assert.match(chart.innerHTML, new RegExp(`data-solo-kind="price" data-solo-price="${screened.breakEven}"`));
  }

  el(context, 'powerBreakevenMode').value = 'shared';
  assert.equal(app.screenPowerBreakEven().mode, 'shared');
  assert.equal(select.disabled, true);

  app.loadMethaneRecycle();
  assert.equal(app.screenPowerBreakEven(), null);
  assert.equal(chart.hidden, true);
  assert.equal(chart.innerHTML, '');
});

test('economics charts stay empty until the graph solves, then plot the engine numbers', () => {
  const store = {
    data: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; },
    setItem(key, value) { this.data[key] = String(value); },
  };
  const context = loadApp(store);
  const app = context.__FLOWSHEET_APP__;
  const econ = app.economics;
  const fall = el(context, 'economicsWaterfall').innerHTML;
  const step = key => {
    const match = fall.match(new RegExp(`data-key="${key}" data-from="([^"]+)" data-to="([^"]+)"`));
    assert.ok(match, key);
    return { from: Number(match[1]), to: Number(match[2]) };
  };
  assert.deepEqual(step('revenue'), { from: 0, to: econ.annualRevenue });
  const opex = step('opex');
  assert.equal(opex.from, econ.annualRevenue);
  assert.ok(Math.abs((opex.from - opex.to) - Math.abs(econ.annualOperatingCost)) < 1e-6);
  const capex = step('capex');
  assert.ok(Math.abs((capex.from - capex.to) - Math.abs(econ.annualizedCapex)) < 1e-6);
  assert.deepEqual(step('net'), { from: 0, to: econ.annualNetCash });
  const cash = el(context, 'economicsCashflow').innerHTML;
  assert.equal((cash.match(/data-year="/g) || []).length, econ.cashFlows.length);
  const year0 = cash.match(/class="tea-cash-bar is-capex" data-year="0" data-value="([^"]+)"/);
  assert.equal(Number(year0[1]), -econ.installedCapex);

  const details = el(context, 'economicsDcf');
  details.open = true;
  details.listeners.toggle();
  assert.equal(store.getItem('flowsheet-economics-ack'), '1');
  details.open = false;
  details.listeners.toggle();
  assert.equal(store.getItem('flowsheet-economics-ack'), '0');

  app.clearFactory();
  assert.doesNotMatch(el(context, 'economicsWaterfall').innerHTML, /<svg|\$\d/);
  assert.doesNotMatch(el(context, 'economicsCashflow').innerHTML, /<svg|\$\d/);
  assert.equal(el(context, 'powerBreakevenChart').hidden, true);
});

test('positive-cashflow sizing banner clears when a demo loads or the factory clears', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const banner = el(context, 'cashflowResult');
  app.loadAbundanceHub();
  assert.equal(app.sizeForPositiveCashflow({ scales: [1], rates: [0] }).mode, 'positive-cashflow');
  assert.equal(banner.hidden, false);
  app.loadCoastalMethane(0);
  assert.equal(banner.hidden, true);
  app.loadAbundanceHub();
  app.sizeForPositiveCashflow({ scales: [1], rates: [0] });
  assert.equal(banner.hidden, false);
  app.clearFactory();
  assert.equal(banner.hidden, true);
  assert.equal(app.graph.nodes.length, 0);
});

test('displayed kWp, assay, and CAPEX are rounded without changing the model values', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(0);
  app.site.solarKWp = 12.3456789;
  app.site.assay = { ...(app.site.assay || {}), summary: '68.54392789373814 g/kg cited process-brine majors', quality: 'cited' };
  const sabatier = app.graph.nodes.find(node => node.id === 'sabatier');
  sabatier.economics.installedCapex = 12345.6789;
  app.solve();
  assert.equal(el(context, 'siteSolarKWp').value, '12.35');
  assert.equal(app.site.solarKWp, 12.3456789);
  assert.match(el(context, 'siteAssay').innerHTML, />68\.54 g\/kg/);
  assert.match(el(context, 'nodeControls').innerHTML, /value="12346"/);
  assert.equal(sabatier.economics.installedCapex, 12345.6789);
});

test('idle blocks name the cause and can jump to the port or Rights', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.clearFactory();
  const dac = app.addNode('dac');
  const diagnosis = app.showCause(dac.id);
  assert.equal(diagnosis.code, 'missing-connection');
  assert.equal(diagnosis.port, 'air');
  assert.match(el(context, 'streamList').innerHTML, /data-port-row="air"/);

  app.completeBoundaries();
  app.setpoints[dac.id] = 0;
  app.solve();
  assert.equal(app.showCause(dac.id).code, 'zero-setpoint');

  app.loadCoastalMethane(0);
  const grid = app.addNode('grid-electricity');
  const right = app.showCause(grid.id);
  assert.equal(right.code, 'unverified-right');
  assert.equal(right.action, 'rights');
  assert.equal(app.activeTab, 'location');
});

test('Fit scales the graph to the viewport', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  app.loadCoastalMethane(0);
  const canvas = el(context, 'flowsheetCanvas');
  Object.assign(canvas, { clientWidth: 1100, clientHeight: 720, scrollLeft: 0, scrollTop: 0 });
  app.fitCanvas();
  assert.ok(app.canvasZoom > 0.45 && app.canvasZoom <= 1, `desktop fit zoom ${app.canvasZoom}`);
  Object.assign(canvas, { clientWidth: 375, clientHeight: 640 });
  app.fitCanvas({ compact: true });
  assert.ok(app.canvasZoom >= 0.08 && app.canvasZoom < 0.5, `narrow fit zoom ${app.canvasZoom}`);
  const width = Number(canvas.innerHTML.match(/style="width:([0-9.]+)px/)[1]);
  assert.ok(width <= 375, `svg width ${width}`);
});

test('footprint, resource strip, and canvas edges follow whether the plant has solved data', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const strip = el(context, 'hudStrip');
  assert.equal(el(context, 'siteFootprintEmpty').hidden, true);
  assert.match(el(context, 'siteFootprintSvg').innerHTML, /polygon/);
  assert.equal(el(context, 'overviewFootprint').hidden, false);
  assert.equal(strip.hidden, false);
  assert.doesNotMatch(strip.innerHTML, /data-hud="water"/);
  assert.doesNotMatch(el(context, 'flowsheetCanvas').innerHTML, /edge-label is-muted/);

  app.clearFactory();
  assert.equal(el(context, 'siteFootprintEmpty').hidden, false);
  assert.equal(el(context, 'siteFootprintSvg').innerHTML, '');
  assert.equal(el(context, 'overviewFootprint').hidden, true);
  assert.equal(strip.hidden, true);

  const dac = app.addNode('dac');
  const sabatier = app.addNode('sabatier');
  app.choosePort({ node: dac.id, port: 'capturedCo2', direction: 'out' });
  app.choosePort({ node: sabatier.id, port: 'co2', direction: 'in' });
  assert.match(el(context, 'flowsheetCanvas').innerHTML, /edge-label is-muted/);
  assert.doesNotMatch(el(context, 'flowsheetCanvas').innerHTML, /node-gauge/);

  app.loadAbundanceHub();
  assert.equal(strip.hidden, false);
  assert.match(strip.innerHTML, /data-hud="water"/);
});

test('material sources pick an intake profile from their preset', () => {
  const context = loadApp();
  const app = context.__FLOWSHEET_APP__;
  const cases = [
    [{ siteResource: 'brine', sourcePreset: 'brine' }, 'pond'],
    [{ sourcePreset: 'air' }, 'stack'],
    [{ sourcePreset: 'seawater' }, 'intake'],
    [{ sourcePreset: 'flueGas' }, 'stack'],
    [{ siteResource: 'freshwater', sourcePreset: 'water' }, 'intake'],
  ];
  for (const [node, profile] of cases) {
    const full = { unit: 'material-source', ...node };
    assert.equal(app.intakeKind(full).profile, profile, node.sourcePreset);
    assert.equal(app.buildingProfile('material-source', 'source', full), profile, node.sourcePreset);
  }
  assert.ok(app.materialPresets.flueGas.mol.CO2 > app.materialPresets.air.mol.CO2);

  app.clearFactory();
  const sea = app.addNode('material-source', { preset: 'seawater', label: 'Seawater intake' });
  assert.equal(sea.sourcePreset, 'seawater');
  assert.equal(sea.label, 'Seawater intake');
});
