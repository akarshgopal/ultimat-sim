const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const APP_RENDERERS_PATH = path.join(ROOT, 'js', 'app-renderers.js');
const APP_RENDERERS_SOURCE = fs.readFileSync(APP_RENDERERS_PATH, 'utf8');

function loadRendererMethods() {
  const productionGrid = { innerHTML: '' };
  const context = {
    window: {},
    document: {
      getElementById(id) {
        if (id === 'productionGrid') return productionGrid;
        throw new Error(`Unexpected element lookup: ${id}`);
      },
    },
    FormatNumbers: {
      fixed(value, digits = 0) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 'N/A';
        return numeric.toLocaleString('en-US', {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });
      },
      formatMoney(value) {
        return `$${value}`;
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(APP_RENDERERS_SOURCE, context, { filename: 'js/app-renderers.js' });

  return {
    methods: context.window.AppRendererMethods,
    productionGrid,
  };
}

function createHarness() {
  const { methods, productionGrid } = loadRendererMethods();
  const app = {
    getCycleRateUnit(result) {
      return result.solar.cycleUnitCompact;
    },
    prodItem(...args) {
      return methods.prodItem.call(this, ...args);
    },
  };

  return {
    methods,
    productionGrid,
    app,
  };
}

test('production summary keeps AI scenarios focused on outputs', () => {
  const { methods, productionGrid, app } = createHarness();
  const result = {
    solar: { annualMWh: 185643, cycleUnitCompact: 'day' },
    ai: { enabled: true, annualTokensM: 72491.13 },
    electrolyzer: { enabled: true, h2DailyKg: 2861.9 },
    dac: { enabled: true, co2DailyKg: 20805.7 },
    sabatier: { enabled: false, ch4DailyMCF: 0 },
    methanol: { enabled: true, dailyLiters: 15295.4 },
    h2Surplus: 572.4,
    co2Surplus: 4161.1,
  };

  methods.updateProduction.call(app, result);

  assert.ok(productionGrid.innerHTML.includes('Electricity'));
  assert.ok(productionGrid.innerHTML.includes('AI Tokens'));
  assert.ok(productionGrid.innerHTML.includes('Hydrogen'));
  assert.ok(productionGrid.innerHTML.includes('CO₂ Captured'));
  assert.ok(productionGrid.innerHTML.includes('Methanol'));
  assert.ok(productionGrid.innerHTML.includes('Unused H₂'));
  assert.ok(productionGrid.innerHTML.includes('CO₂ Surplus'));
  assert.equal(productionGrid.innerHTML.includes('Flexible Chem Energy'), false);
  assert.equal(productionGrid.innerHTML.includes('Residual Chem Energy'), false);
  assert.equal(productionGrid.innerHTML.includes('AI Load'), false);
  assert.equal(productionGrid.innerHTML.includes('AI Utilization'), false);
});

test('production summary omits disabled process rows', () => {
  const { methods, productionGrid, app } = createHarness();
  const result = {
    solar: { annualMWh: 4200, cycleUnitCompact: 'day' },
    ai: { enabled: false, annualTokensM: 0 },
    electrolyzer: { enabled: false, h2DailyKg: 0 },
    dac: { enabled: false, co2DailyKg: 0 },
    sabatier: { enabled: false, ch4DailyMCF: 0 },
    methanol: { enabled: false, dailyLiters: 0 },
    h2Surplus: 0,
    co2Surplus: 0,
  };

  methods.updateProduction.call(app, result);

  assert.ok(productionGrid.innerHTML.includes('Electricity'));
  assert.equal(productionGrid.innerHTML.includes('Daily Energy'), false);
  assert.equal(productionGrid.innerHTML.includes('Hydrogen'), false);
  assert.equal(productionGrid.innerHTML.includes('CO₂ Captured'), false);
  assert.equal(productionGrid.innerHTML.includes('AI Tokens'), false);
});

test('production summary exposes the honest water and heat loop', () => {
  const { methods, productionGrid, app } = createHarness();
  const result = {
    solar: { annualMWh: 4200, cycleUnitCompact: 'day' },
    ai: { enabled: false },
    electrolyzer: { enabled: true, h2DailyKg: 40, oxygenDailyKg: 320 },
    dac: { enabled: false },
    sabatier: { enabled: false },
    methanol: { enabled: false },
    waterSystems: {
      enabled: true,
      freshWaterDailyM3: 0.36,
      waterCreditDailyM3: 0.35,
      makeupDailyM3: 0.01,
      waterSaleDailyM3: 0,
      brineDailyM3: 0.44,
      h2CurtailedDailyKg: 0.5,
      route: 'thermal',
      heat: { usedKWhth: 18, dumpedKWhth: 7, unmetKWhth: 2, limitingFactor: 'heat-limited' },
    },
    h2Surplus: 0,
    co2Surplus: 0,
  };

  app.getCycleRateUnit = result => result.solar.cycleUnitCompact;
  methods.updateProduction.call(app, result);

  ['Fresh water produced', 'Water credit', 'Makeup water', 'H₂ water curtailment', 'Heat used', 'Heat dumped', 'Unmet MED heat', 'MED limiting factor', 'heat-limited']
    .forEach(label => assert.ok(productionGrid.innerHTML.includes(label), `Expected production panel to include ${label}.`));
});

test('economics renderer uses custom tooltip attributes on labels', () => {
  const { methods } = createHarness();

  const rowHtml = methods.econRow('IRR', '12.4%', '', 'Project "return" & hurdle comparison');
  assert.ok(rowHtml.includes('class="econ-label tooltip-label"'));
  assert.ok(rowHtml.includes('data-tooltip="Project &quot;return&quot; &amp; hurdle comparison"'));
  assert.equal(rowHtml.includes('title='), false);

  const metricHtml = methods.econMetric('Levelized cost', '$42', 'negative', 'CRF capital + O&M');
  assert.ok(metricHtml.includes('class="econ-metric-label tooltip-label"'));
  assert.ok(metricHtml.includes('data-tooltip="CRF capital + O&amp;M"'));
});
