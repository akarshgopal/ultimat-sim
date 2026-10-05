const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { evaluateEconomics } = require('../engine/economics');
const { solveOperation } = require('../engine/solve');
const tea = require('../data/tea-screening.js');
const { createSiliconCase } = require('../cases/silicon');
const { createMaglutCase } = require('../cases/maglut');
const { createAbundanceCase } = require('../cases/abundance');
const { createReeSxCase } = require('../cases/ree-sx');
const { createReeCase } = require('../cases/ree');
const { createUreaCase } = require('../cases/urea');

// Prior CATALOG-FREIGHT-BOM tip (module + bauxite + Ag/glass/EVA), solved createSiliconCase.
const PRIOR_FREIGHT_BOM_TIP_INSTALLED_CAPEX = 3076388.8084867904;
const PRIOR_FREIGHT_BOM_TIP_BREAKDOWN_FREIGHT = 43815.53;

function kgStream(kg) {
  return {
    kind: 'material',
    mol: { H2O: kg * 1000 / 18.01528 },
    phase: 'liquid',
    T_C: 25,
    P_bar: 1,
  };
}

test('bindCost without freight stays plant-gate; freight absent', () => {
  const plain = tea.bindCost('bauxite');
  const empty = tea.bindCost('bauxite', {});
  assert.deepEqual(plain, empty);
  assert.equal(plain.unitCost, tea.costs.bauxite.value);
  assert.equal(plain.unitCost, 0.04);
  assert.equal(plain.freightUsdPerKg, undefined);
  assert.equal(plain.freightId, undefined);
  assert.equal('freightUsdPerKg' in plain, false);
  assert.equal(tea.getFreight('none').value, 0);
  assert.equal(tea.getFreight('none').quality, 'cited');
});

test('bindCost chile-coast-container adds 0.08 $/kg freight into purchases', () => {
  const bound = tea.bindCost('bauxite', { freight: 'chile-coast-container' });
  assert.equal(bound.unitCost, 0.04);
  assert.equal(bound.freightUsdPerKg, 0.08);
  assert.equal(bound.freightId, 'chile-coast-container');
  assert.equal(tea.getFreight('chile-coast-container').value, 0.08);
  const stream = kgStream(1);
  const cash = evaluateEconomics({
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: { nodes: [{ id: 'src', unit: 'material-source', economics: bound }] },
  }, { nodes: { src: { supplied: stream } } });
  assert.equal(cash.breakdown.sourcePurchases, (0.04 + 0.08) * 365);
  assert.equal(cash.breakdown.freight, 0.08 * 365);
  assert.ok(cash.breakdown.freight > 0);
  assert.equal(cash.annualOperatingCost, cash.breakdown.sourcePurchases);
});

test('bindSale freight nets gate − 0.08; Maglut and Dead Sea stay plant-gate', () => {
  const sale = tea.bindSale('pv-module', { freight: 'chile-coast-container' });
  assert.equal(sale.gateUnitPrice, 2.85);
  assert.equal(sale.unitPrice, 2.77);
  assert.equal(sale.freightUsdPerKg, 0.08);
  assert.match(sale.note, /FOB vs landed/i);
  const stream = kgStream(1);
  const cash = evaluateEconomics({
    economics: { periodDays: 365 },
    graph: { nodes: [{ id: 'sale', unit: 'material-sink', economics: sale }] },
  }, { nodes: { sale: { received: stream } } });
  assert.equal(cash.annualRevenue, 2.77 * 365);
  assert.equal(cash.sinks[0].annualFreight, 0.08 * 365);
  assert.equal(cash.breakdown.freight, 0.08 * 365);

  const plantGate = tea.bindSale('pv-module');
  assert.equal(plantGate.unitPrice, 2.85);
  assert.equal(plantGate.freightUsdPerKg, undefined);
  assert.equal(plantGate.gateUnitPrice, undefined);

  const maglut = createMaglutCase();
  const ndpr = maglut.graph.nodes.find(node => node.id === 'ndpr');
  assert.equal(ndpr.economics.unitPrice, 69);
  assert.ok(!(ndpr.economics.freightUsdPerKg > 0));
  const maglutCash = evaluateEconomics(maglut, solveOperation(maglut));
  assert.equal(maglutCash.breakdown.freight, 0);
  assert.ok(Number.isFinite(maglutCash.annualNetCash));

  const deadSea = createAbundanceCase();
  const lithium = deadSea.graph.nodes.find(node => node.id === 'lithium');
  assert.equal(lithium.economics.unitPrice, 14);
  assert.ok(!(lithium.economics.freightUsdPerKg > 0));
  const deadSeaCash = evaluateEconomics(deadSea, solveOperation(deadSea));
  assert.equal(deadSeaCash.breakdown.freight, 0);
});

test('Mejillones QCC freight: quartz/carbon 0.03, caustic 0.08; BOM/module unchanged', () => {
  const definition = createSiliconCase();
  const moduleSink = definition.graph.nodes.find(node => node.id === 'module');
  const bauxite = definition.graph.nodes.find(node => node.id === 'bauxite');
  const quartz = definition.graph.nodes.find(node => node.id === 'quartz');
  const silver = definition.graph.nodes.find(node => node.id === 'silver');
  const glass = definition.graph.nodes.find(node => node.id === 'glass');
  const eva = definition.graph.nodes.find(node => node.id === 'eva');
  const reductant = definition.graph.nodes.find(node => node.id === 'reductant');
  const anode = definition.graph.nodes.find(node => node.id === 'anode');
  const caustic = definition.graph.nodes.find(node => node.id === 'caustic');
  assert.equal(moduleSink.economics.freightUsdPerKg, 0.08);
  assert.equal(moduleSink.economics.freightId, 'chile-coast-container');
  assert.equal(moduleSink.economics.gateUnitPrice, 2.85);
  assert.equal(moduleSink.economics.unitPrice, 2.77);
  assert.equal(bauxite.economics.freightUsdPerKg, 0.03);
  assert.equal(bauxite.economics.freightId, 'bulk-dry-shortsea');
  assert.equal(bauxite.economics.unitCost, 0.04);
  assert.equal(silver.economics.freightId, 'chile-coast-container');
  assert.equal(silver.economics.freightUsdPerKg, 0.08);
  assert.equal(silver.economics.unitCost, tea.costs.silver.value);
  assert.equal(eva.economics.freightId, 'chile-coast-container');
  assert.equal(eva.economics.freightUsdPerKg, 0.08);
  assert.equal(eva.economics.unitCost, tea.costs['eva-encapsulant'].value);
  assert.equal(glass.economics.freightId, 'bulk-dry-shortsea');
  assert.equal(glass.economics.freightUsdPerKg, 0.03);
  assert.equal(glass.economics.unitCost, tea.costs['float-glass'].value);
  assert.equal(quartz.economics.freightId, 'bulk-dry-shortsea');
  assert.equal(quartz.economics.freightUsdPerKg, 0.03);
  assert.equal(quartz.economics.unitCost, tea.costs.quartz.value);
  assert.equal(reductant.economics.freightId, 'bulk-dry-shortsea');
  assert.equal(reductant.economics.freightUsdPerKg, 0.03);
  assert.equal(reductant.economics.unitCost, tea.costs['carbon-reductant'].value);
  assert.equal(anode.economics.freightId, 'bulk-dry-shortsea');
  assert.equal(anode.economics.freightUsdPerKg, 0.03);
  assert.equal(anode.economics.unitCost, tea.costs['carbon-anode'].value);
  assert.equal(caustic.economics.freightId, 'chile-coast-container');
  assert.equal(caustic.economics.freightUsdPerKg, 0.08);
  assert.equal(caustic.economics.unitCost, tea.costs['caustic-makeup'].value);
  assert.deepEqual(
    Object.keys(tea.freightBands).sort(),
    ['bulk-dry-shortsea', 'chile-coast-container', 'none'],
  );
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Number.isFinite(cash.annualNetCash));
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(cash.breakdown.freight > PRIOR_FREIGHT_BOM_TIP_BREAKDOWN_FREIGHT);
  const moduleFreight = cash.sinks.find(sink => sink.id === 'module');
  assert.ok(moduleFreight.annualFreight > 0);
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  assert.match(source, /Screening freight applied on \$\{freightStreams\} streams/);
  assert.match(source, /breakdown\?\.freight/);
});

test('Mejillones QCC freight: CAPEX matches BOM tip, cash finite, Maglut/SX/Minaçu/urea unchanged', () => {
  const definition = createSiliconCase();
  const solved = solveOperation(definition);
  const cash = evaluateEconomics(definition, solved);
  assert.ok(Math.abs(cash.installedCapex - PRIOR_FREIGHT_BOM_TIP_INSTALLED_CAPEX) <= 1);
  assert.ok(cash.breakdown.freight > PRIOR_FREIGHT_BOM_TIP_BREAKDOWN_FREIGHT, `freight ${cash.breakdown.freight}`);
  // Recorded screening disclosure after quartz/carbon/caustic inbound freight (not a cash-sign gate).
  assert.ok(Number.isFinite(cash.annualNetCash), `annualNetCash ${cash.annualNetCash}`);
  assert.ok(Number.isFinite(cash.annualRevenue));
  assert.ok(Number.isFinite(cash.annualizedCapex));

  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.equal(maglutCash.breakdown.freight, 0);
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);

  const deadSeaCash = evaluateEconomics(createAbundanceCase(), solveOperation(createAbundanceCase()));
  assert.equal(deadSeaCash.breakdown.freight, 0);
  assert.ok(Number.isFinite(deadSeaCash.annualNetCash));

  const sxCash = evaluateEconomics(createReeSxCase(), solveOperation(createReeSxCase()));
  assert.ok(Number.isFinite(sxCash.annualNetCash));
  const minacuCash = evaluateEconomics(createReeCase(), solveOperation(createReeCase()));
  assert.ok(Number.isFinite(minacuCash.annualNetCash));

  const ureaDef = createUreaCase();
  const ureaCash = evaluateEconomics(ureaDef, solveOperation(ureaDef));
  assert.ok(Number.isFinite(ureaCash.annualNetCash), `urea annualNetCash ${ureaCash.annualNetCash}`);
  assert.equal(ureaCash.breakdown.freight, 0);
});
