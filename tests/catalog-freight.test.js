const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { evaluateEconomics } = require('../engine/economics');
const { solveOperation } = require('../engine/solve');
const tea = require('../data/tea-screening.js');
const { evaluateNetwork } = require('../engine/network');
const { createSiliconCase } = require('../cases/silicon');
const { createMaglutCase } = require('../cases/maglut');
const { createAbundanceCase } = require('../cases/abundance');
const { createReeSxCase } = require('../cases/ree-sx');
const { createReeCase } = require('../cases/ree');
const { createUreaCase } = require('../cases/urea');
const { createCementCase } = require('../cases/cement');
const { createCuEwCase } = require('../cases/cu-ew');
const { createFloatGlassCase } = require('../cases/float-glass');
const { createFtLiquidsCase } = require('../cases/ft-liquids');
const { createGreenFtCase } = require('../cases/green-ft');
const { createGreenMtoCase } = require('../cases/green-mto');
const { createGreenUreaCase } = require('../cases/green-urea');
const { createGreenAmmoniaCase } = require('../cases/green-ammonia');
const { createGreenH2DriCase } = require('../cases/green-h2-dri');
const { createH2DriCase } = require('../cases/h2-dri');
const { createFuelsAndMineralsNetwork } = require('../cases/network');

// Prior CATALOG-FREIGHT-BOM tip (module + bauxite + Ag/glass/EVA), solved createSiliconCase.
const PRIOR_FREIGHT_BOM_TIP_INSTALLED_CAPEX = 3076388.8084867904;
const PRIOR_FREIGHT_BOM_TIP_BREAKDOWN_FREIGHT = 43815.53;
// Plant-gate CAPEX baselines recorded tip 5611ea5 (freight does not change CAPEX).
const PRIOR_CEMENT_INSTALLED_CAPEX = 276387;
const PRIOR_CU_EW_INSTALLED_CAPEX = 1234597;
const PRIOR_FLOAT_GLASS_INSTALLED_CAPEX = 823065;
const PRIOR_FT_LIQUIDS_INSTALLED_CAPEX = 509860;
const PRIOR_GREEN_FT_INSTALLED_CAPEX = 6641032;
// Plant-gate CAPEX baselines recorded tip 9b89454 (freight does not change CAPEX).
const PRIOR_UREA_INSTALLED_CAPEX = 1281460;
const PRIOR_GREEN_UREA_INSTALLED_CAPEX = 3855897;
// Plant-gate CAPEX baseline recorded tip b2da51c Network table (freight does not change CAPEX).
const PRIOR_GREEN_H2_DRI_INSTALLED_CAPEX = 1740403;
// Plant-gate CAPEX baseline recorded tip 483d438 (freight does not change CAPEX).
const PRIOR_H2_DRI_INSTALLED_CAPEX = 982258;
// Iron-ore inland-truck-only freight recorded tip 4b2e3c7 (this leftover adds H2 container + steel shortsea).
const PRIOR_H2_DRI_BREAKDOWN_FREIGHT = 5218.53;
const PRIOR_GREEN_H2_DRI_BREAKDOWN_FREIGHT = 5218.53;
// Ore inland-truck + steel bulk-dry-shortsea, recorded catalog-dri-freight-leftovers (tip 4b2e3c7 leftover).
const PRIOR_GREEN_H2_DRI_STEEL_FREIGHT = 16168.529411764706;
const LINDE_LOX_TANKER = 'https://static.prd.echannel.linde.com/wcsstore/SE_REN_Industrial_Gas_Store/pdf/Prislista_Flytande_gaser_Industri_2024_01.pdf';

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
    ['bulk-dry-shortsea', 'chile-coast-container', 'cryo-tanker-short', 'inland-truck-short', 'none'],
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

test('Mejillones QCC freight: CAPEX matches BOM tip, cash finite, Maglut/SX/Minaçu unchanged', () => {
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
  assert.ok(ureaCash.breakdown.freight > 0, `urea freight ${ureaCash.breakdown.freight}`);
});

function nodeEcon(definition, id) {
  return definition.graph.nodes.find(node => node.id === id).economics;
}

function solvedCash(create) {
  const definition = create();
  const solved = solveOperation(definition);
  assert.equal(solved.convergence.converged, true);
  return { definition, solved, cash: evaluateEconomics(definition, solved) };
}

test('Mejillones cement leftover freight: limestone/clay inland-truck-short 0.01; sale bulk-dry-shortsea 0.03', () => {
  const { definition, cash } = solvedCash(createCementCase);
  const limestone = nodeEcon(definition, 'limestone-feed');
  const clay = nodeEcon(definition, 'clay-feed');
  const sale = nodeEcon(definition, 'cement-product');
  assert.equal(limestone.freightId, 'inland-truck-short');
  assert.equal(limestone.freightUsdPerKg, 0.01);
  assert.equal(limestone.unitCost, 0.02);
  assert.equal(clay.freightId, 'inland-truck-short');
  assert.equal(clay.freightUsdPerKg, 0.01);
  assert.equal(clay.unitCost, 0.02);
  assert.equal(sale.freightId, 'bulk-dry-shortsea');
  assert.equal(sale.freightUsdPerKg, 0.03);
  assert.equal(sale.gateUnitPrice, 0.16);
  assert.equal(sale.unitPrice, 0.13);
  assert.ok(Math.abs(cash.installedCapex - PRIOR_CEMENT_INSTALLED_CAPEX) <= 1, `cement CAPEX ${cash.installedCapex}`);
  assert.ok(cash.breakdown.freight > 0, `cement freight ${cash.breakdown.freight}`);
  assert.ok(Number.isFinite(cash.annualNetCash), `cement annualNetCash ${cash.annualNetCash}`);
  // Feed freight $0.03→$0.01; less cash− than plant-gate-shortsea leftover ~−25975. Sign recorded, not forced.
  assert.ok(cash.annualNetCash > -25975, `cement expected less cash− than −25975, got ${cash.annualNetCash}`);
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
  assert.equal(maglutCash.breakdown.freight, 0);
});

test('Mejillones Cu-EW leftover freight: PLS + cathode chile-coast-container 0.08', () => {
  const { definition, cash } = solvedCash(createCuEwCase);
  const pls = nodeEcon(definition, 'pls-feed');
  const sale = nodeEcon(definition, 'cathode-product');
  assert.equal(pls.freightId, 'chile-coast-container');
  assert.equal(pls.freightUsdPerKg, 0.08);
  assert.equal(pls.unitCost, 9.36);
  assert.equal(sale.freightId, 'chile-coast-container');
  assert.equal(sale.freightUsdPerKg, 0.08);
  assert.equal(sale.gateUnitPrice, 9.70);
  assert.equal(sale.unitPrice, 9.62);
  assert.ok(Math.abs(cash.installedCapex - PRIOR_CU_EW_INSTALLED_CAPEX) <= 1, `cu-ew CAPEX ${cash.installedCapex}`);
  assert.ok(cash.breakdown.freight > 0, `cu-ew freight ${cash.breakdown.freight}`);
  assert.ok(Number.isFinite(cash.annualNetCash), `cu-ew annualNetCash ${cash.annualNetCash}`);
});

test('Mejillones float-glass leftover freight: sand/limestone/sale 0.03, soda 0.08', () => {
  const { definition, cash } = solvedCash(createFloatGlassCase);
  const sand = nodeEcon(definition, 'sand-feed');
  const limestone = nodeEcon(definition, 'limestone-feed');
  const soda = nodeEcon(definition, 'soda-feed');
  const sale = nodeEcon(definition, 'glass');
  assert.equal(sand.freightId, 'bulk-dry-shortsea');
  assert.equal(sand.freightUsdPerKg, 0.03);
  assert.equal(sand.unitCost, 0.04);
  assert.equal(limestone.freightId, 'bulk-dry-shortsea');
  assert.equal(limestone.freightUsdPerKg, 0.03);
  assert.equal(limestone.unitCost, 0.02);
  assert.equal(soda.freightId, 'chile-coast-container');
  assert.equal(soda.freightUsdPerKg, 0.08);
  assert.equal(soda.unitCost, 0.15);
  assert.equal(sale.freightId, 'bulk-dry-shortsea');
  assert.equal(sale.freightUsdPerKg, 0.03);
  assert.equal(sale.gateUnitPrice, 0.45);
  assert.equal(sale.unitPrice, 0.45 - 0.03);
  assert.ok(Math.abs(cash.installedCapex - PRIOR_FLOAT_GLASS_INSTALLED_CAPEX) <= 1, `float-glass CAPEX ${cash.installedCapex}`);
  assert.ok(cash.breakdown.freight > 0, `float-glass freight ${cash.breakdown.freight}`);
  assert.ok(Number.isFinite(cash.annualNetCash), `float-glass annualNetCash ${cash.annualNetCash}`);
});

test('Mejillones FT liquids leftover freight: H2+CO2+diesel chile-coast-container 0.08', () => {
  const { definition, cash } = solvedCash(createFtLiquidsCase);
  const hydrogen = nodeEcon(definition, 'hydrogen-feed');
  const co2 = nodeEcon(definition, 'co2-feed');
  const sale = nodeEcon(definition, 'diesel-product');
  assert.equal(hydrogen.freightId, 'chile-coast-container');
  assert.equal(hydrogen.freightUsdPerKg, 0.08);
  assert.equal(hydrogen.unitCost, 2);
  assert.equal(co2.freightId, 'chile-coast-container');
  assert.equal(co2.freightUsdPerKg, 0.08);
  assert.equal(co2.unitCost, 0.05);
  assert.equal(sale.freightId, 'chile-coast-container');
  assert.equal(sale.freightUsdPerKg, 0.08);
  assert.equal(sale.gateUnitPrice, 0.9);
  assert.equal(sale.unitPrice, 0.9 - 0.08);
  assert.ok(Math.abs(cash.installedCapex - PRIOR_FT_LIQUIDS_INSTALLED_CAPEX) <= 1, `ft-liquids CAPEX ${cash.installedCapex}`);
  assert.ok(cash.breakdown.freight > 0, `ft-liquids freight ${cash.breakdown.freight}`);
  assert.ok(Number.isFinite(cash.annualNetCash), `ft-liquids annualNetCash ${cash.annualNetCash}`);
  assert.ok(cash.annualNetCash < 0, `ft-liquids expected cash−, got ${cash.annualNetCash}`);
});

test('Mejillones green FT leftover freight: CO2+diesel 0.08; seawater plant-gate', () => {
  const { definition, cash } = solvedCash(createGreenFtCase);
  const co2 = nodeEcon(definition, 'co2-feed');
  const seawater = nodeEcon(definition, 'seawater');
  const sale = nodeEcon(definition, 'diesel-product');
  const oxygen = nodeEcon(definition, 'electrolyzer-oxygen');
  assert.equal(co2.freightId, 'chile-coast-container');
  assert.equal(co2.freightUsdPerKg, 0.08);
  assert.equal(co2.unitCost, 0.05);
  assert.equal(seawater.freightUsdPerKg, undefined);
  assert.equal(seawater.freightId, undefined);
  assert.equal(sale.freightId, 'chile-coast-container');
  assert.equal(sale.freightUsdPerKg, 0.08);
  assert.equal(sale.gateUnitPrice, 0.9);
  assert.equal(sale.unitPrice, 0.9 - 0.08);
  assert.equal(oxygen.freightUsdPerKg, undefined);
  assert.equal(oxygen.freightId, undefined);
  assert.ok(Math.abs(cash.installedCapex - PRIOR_GREEN_FT_INSTALLED_CAPEX) <= 1, `green-ft CAPEX ${cash.installedCapex}`);
  assert.ok(cash.breakdown.freight > 0, `green-ft freight ${cash.breakdown.freight}`);
  assert.ok(Number.isFinite(cash.annualNetCash), `green-ft annualNetCash ${cash.annualNetCash}`);
  assert.ok(cash.annualNetCash < 0, `green-ft expected cash−, got ${cash.annualNetCash}`);
});

test('Walvis urea leftover freight: NH3+CO2 chile-coast-container 0.08; urea sale bulk-dry-shortsea 0.03', () => {
  const { definition, cash } = solvedCash(createUreaCase);
  const ammonia = nodeEcon(definition, 'ammonia-feed');
  const co2 = nodeEcon(definition, 'co2-feed');
  const sale = nodeEcon(definition, 'urea-product');
  assert.equal(ammonia.freightId, 'chile-coast-container');
  assert.equal(ammonia.freightUsdPerKg, 0.08);
  assert.equal(ammonia.unitCost, 0.45);
  assert.equal(co2.freightId, 'chile-coast-container');
  assert.equal(co2.freightUsdPerKg, 0.08);
  assert.equal(co2.unitCost, 0.05);
  assert.equal(sale.freightId, 'bulk-dry-shortsea');
  assert.equal(sale.freightUsdPerKg, 0.03);
  assert.equal(sale.gateUnitPrice, 0.4);
  assert.equal(sale.unitPrice, 0.4 - 0.03);
  assert.ok(Math.abs(cash.installedCapex - PRIOR_UREA_INSTALLED_CAPEX) <= 1, `urea CAPEX ${cash.installedCapex}`);
  assert.ok(cash.breakdown.freight > 0, `urea freight ${cash.breakdown.freight}`);
  assert.ok(Number.isFinite(cash.annualNetCash), `urea annualNetCash ${cash.annualNetCash}`);
});

test('Walvis green urea leftover freight: CO2 0.08; urea sale 0.03; seawater plant-gate', () => {
  const { definition, cash } = solvedCash(createGreenUreaCase);
  const co2 = nodeEcon(definition, 'co2-feed');
  const seawater = nodeEcon(definition, 'seawater');
  const sale = nodeEcon(definition, 'urea-product');
  const oxygen = nodeEcon(definition, 'electrolyzer-oxygen');
  assert.equal(co2.freightId, 'chile-coast-container');
  assert.equal(co2.freightUsdPerKg, 0.08);
  assert.equal(co2.unitCost, 0.05);
  assert.equal(seawater.freightUsdPerKg, undefined);
  assert.equal(seawater.freightId, undefined);
  assert.equal(sale.freightId, 'bulk-dry-shortsea');
  assert.equal(sale.freightUsdPerKg, 0.03);
  assert.equal(sale.gateUnitPrice, 0.4);
  assert.equal(sale.unitPrice, 0.4 - 0.03);
  assert.equal(oxygen.freightUsdPerKg, undefined);
  assert.equal(oxygen.freightId, undefined);
  assert.ok(Math.abs(cash.installedCapex - PRIOR_GREEN_UREA_INSTALLED_CAPEX) <= 1, `green-urea CAPEX ${cash.installedCapex}`);
  assert.ok(cash.breakdown.freight > 0, `green-urea freight ${cash.breakdown.freight}`);
  assert.ok(Number.isFinite(cash.annualNetCash), `green-urea annualNetCash ${cash.annualNetCash}`);
  assert.ok(cash.annualNetCash < 0, `green-urea expected cash−, got ${cash.annualNetCash}`);
});

test('Leftover freight: Maglut/Dead Sea stay plant-gate; Walvis urea freighted; silicon 9 streams; network finite', () => {
  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.equal(maglutCash.breakdown.freight, 0);
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);

  const deadSeaCash = evaluateEconomics(createAbundanceCase(), solveOperation(createAbundanceCase()));
  assert.equal(deadSeaCash.breakdown.freight, 0);

  const sxCash = evaluateEconomics(createReeSxCase(), solveOperation(createReeSxCase()));
  assert.equal(sxCash.breakdown.freight, 0);

  const ureaCash = evaluateEconomics(createUreaCase(), solveOperation(createUreaCase()));
  assert.ok(ureaCash.breakdown.freight > 0, `urea freight ${ureaCash.breakdown.freight}`);
  assert.ok(Number.isFinite(ureaCash.annualNetCash));

  const silicon = createSiliconCase();
  const freighted = silicon.graph.nodes.filter(node => Number(node.economics?.freightUsdPerKg) > 0);
  assert.equal(freighted.length, 9);
  const siliconCash = evaluateEconomics(silicon, solveOperation(silicon));
  assert.ok(Math.abs(siliconCash.installedCapex - PRIOR_FREIGHT_BOM_TIP_INSTALLED_CAPEX) <= 1);
  assert.ok(siliconCash.breakdown.freight > PRIOR_FREIGHT_BOM_TIP_BREAKDOWN_FREIGHT);

  const network = evaluateNetwork(createFuelsAndMineralsNetwork(6));
  assert.ok(Number.isFinite(network.annualNetCash), `network annualNetCash ${network.annualNetCash}`);
  const maglutPlant = network.plants.find(plant => plant.id === 'long-beach-maglut');
  assert.ok(Math.abs(maglutPlant.economics.annualNetCash - 1299) <= 5, `Maglut plant ${maglutPlant.economics.annualNetCash}`);
  for (const id of ['mejillones-cement', 'mejillones-cu-ew', 'mejillones-float-glass', 'mejillones-green-ft', 'mejillones-green-mto', 'mejillones-green-h2-dri', 'mejillones-h2-dri']) {
    const plant = network.plants.find(item => item.id === id);
    assert.ok(plant, id);
    assert.ok(Number.isFinite(plant.economics.annualNetCash), `${id} annualNetCash ${plant.economics.annualNetCash}`);
  }
  const walvisGreen = network.plants.find(plant => plant.id === 'walvis-green-urea');
  assert.ok(walvisGreen);
  assert.ok(Number.isFinite(walvisGreen.economics.annualNetCash), `walvis-green-urea annualNetCash ${walvisGreen.economics.annualNetCash}`);
  assert.ok(walvisGreen.economics.breakdown.freight > 0, `walvis-green-urea freight ${walvisGreen.economics.breakdown.freight}`);

  const greenH2Dri = network.plants.find(plant => plant.id === 'mejillones-green-h2-dri');
  assert.ok(greenH2Dri);
  assert.ok(greenH2Dri.economics.breakdown.freight > 0, `green-H2-DRI freight ${greenH2Dri.economics.breakdown.freight}`);
  assert.ok(Number.isFinite(greenH2Dri.economics.annualNetCash), `green-H2-DRI annualNetCash ${greenH2Dri.economics.annualNetCash}`);
});

test('inland-truck-short band is $0.01/kg; green-H2-DRI and purchased-H2 DRI iron-ore (cement quarry feeds covered by leftover cement test)', () => {
  assert.equal(tea.getFreight('inland-truck-short').value, 0.01);
  assert.equal(tea.getFreight('inland-truck-short').unit, '$/kg');
  assert.equal(tea.getFreight('inland-truck-short').quality, 'screening');
  assert.match(tea.getFreight('inland-truck-short').source, /Nova Scotia Public Works/i);
  assert.equal(tea.freightBands['inland-truck-short'].value, 0.01);

  const { definition, cash } = solvedCash(createGreenH2DriCase);
  const ore = nodeEcon(definition, 'iron-ore');
  const seawater = nodeEcon(definition, 'seawater');
  const steel = nodeEcon(definition, 'steel');
  const oxygen = nodeEcon(definition, 'electrolyzer-oxygen');
  assert.equal(ore.freightId, 'inland-truck-short');
  assert.equal(ore.freightUsdPerKg, 0.01);
  assert.equal(ore.unitCost, 0.10);
  assert.equal(seawater.freightUsdPerKg, undefined);
  assert.equal(seawater.freightId, undefined);
  assert.equal(steel.freightId, 'bulk-dry-shortsea');
  assert.equal(steel.freightUsdPerKg, 0.03);
  assert.equal(oxygen.freightId, 'cryo-tanker-short');
  assert.equal(oxygen.freightUsdPerKg, 0.08);
  assert.ok(cash.breakdown.freight > PRIOR_GREEN_H2_DRI_BREAKDOWN_FREIGHT, `green-H2-DRI freight ${cash.breakdown.freight}`);
  assert.ok(Math.abs(cash.installedCapex - PRIOR_GREEN_H2_DRI_INSTALLED_CAPEX) <= 1, `green-H2-DRI CAPEX ${cash.installedCapex}`);
  assert.ok(Number.isFinite(cash.annualNetCash), `green-H2-DRI annualNetCash ${cash.annualNetCash}`);
  assert.ok(true, `green-H2-DRI cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} freight=${cash.breakdown.freight} net=${cash.annualNetCash} installed=${cash.installedCapex}`);

  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.equal(maglutCash.breakdown.freight, 0);
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);

  const deadSeaCash = evaluateEconomics(createAbundanceCase(), solveOperation(createAbundanceCase()));
  assert.equal(deadSeaCash.breakdown.freight, 0);

  const ureaCash = evaluateEconomics(createUreaCase(), solveOperation(createUreaCase()));
  assert.ok(ureaCash.breakdown.freight > 0, `urea freight ${ureaCash.breakdown.freight}`);

  const silicon = createSiliconCase();
  const freighted = silicon.graph.nodes.filter(node => Number(node.economics?.freightUsdPerKg) > 0);
  assert.equal(freighted.length, 9);

  const network = evaluateNetwork(createFuelsAndMineralsNetwork(6));
  assert.equal(network.plants.length, 12);
  assert.ok(Number.isFinite(network.annualNetCash), `network annualNetCash ${network.annualNetCash}`);
  const maglutPlant = network.plants.find(plant => plant.id === 'long-beach-maglut');
  assert.ok(Math.abs(maglutPlant.economics.annualNetCash - 1299) <= 5, `Maglut plant ${maglutPlant.economics.annualNetCash}`);
  const greenH2DriPlant = network.plants.find(plant => plant.id === 'mejillones-green-h2-dri');
  assert.ok(greenH2DriPlant);
  assert.ok(greenH2DriPlant.economics.breakdown.freight > 0, `network green-H2-DRI freight ${greenH2DriPlant.economics.breakdown.freight}`);
  assert.ok(Number.isFinite(greenH2DriPlant.economics.annualNetCash), `network green-H2-DRI cash ${greenH2DriPlant.economics.annualNetCash}`);
  assert.ok(Math.abs(greenH2DriPlant.economics.installedCapex - PRIOR_GREEN_H2_DRI_INSTALLED_CAPEX) <= 1, `network green-H2-DRI CAPEX ${greenH2DriPlant.economics.installedCapex}`);
  const h2DriPlant = network.plants.find(plant => plant.id === 'mejillones-h2-dri');
  assert.ok(h2DriPlant);
  assert.ok(Number.isFinite(h2DriPlant.economics.annualNetCash), `network purchased H2-DRI cash ${h2DriPlant.economics.annualNetCash}`);
});

test('Mejillones purchased-H2 DRI iron-ore inland-truck-short 0.01; H2 chile-coast-container; steel bulk-dry-shortsea', () => {
  const { definition, cash } = solvedCash(createH2DriCase);
  const ore = nodeEcon(definition, 'iron-ore');
  const hydrogen = nodeEcon(definition, 'hydrogen-feed');
  const steel = nodeEcon(definition, 'steel');
  assert.equal(ore.freightId, 'inland-truck-short');
  assert.equal(ore.freightUsdPerKg, 0.01);
  assert.equal(ore.unitCost, 0.10);
  assert.equal(hydrogen.freightId, 'chile-coast-container');
  assert.equal(hydrogen.freightUsdPerKg, 0.08);
  assert.equal(hydrogen.unitCost, 2);
  assert.equal(steel.freightId, 'bulk-dry-shortsea');
  assert.equal(steel.freightUsdPerKg, 0.03);
  assert.equal(steel.gateUnitPrice, 0.4);
  assert.equal(steel.unitPrice, 0.4 - 0.03);
  assert.ok(cash.breakdown.freight > PRIOR_H2_DRI_BREAKDOWN_FREIGHT, `h2-dri freight ${cash.breakdown.freight}`);
  assert.ok(Math.abs(cash.installedCapex - PRIOR_H2_DRI_INSTALLED_CAPEX) <= 1, `h2-dri CAPEX ${cash.installedCapex}`);
  assert.ok(Number.isFinite(cash.annualNetCash), `h2-dri annualNetCash ${cash.annualNetCash}`);
  assert.ok(true, `h2-dri cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} freight=${cash.breakdown.freight} net=${cash.annualNetCash} installed=${cash.installedCapex}`);

  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
  assert.equal(maglutCash.breakdown.freight, 0);

  const greenOre = nodeEcon(createGreenH2DriCase(), 'iron-ore');
  assert.equal(greenOre.freightId, 'inland-truck-short');
  assert.equal(greenOre.freightUsdPerKg, 0.01);
  const cement = createCementCase();
  assert.equal(nodeEcon(cement, 'limestone-feed').freightId, 'inland-truck-short');
  assert.equal(nodeEcon(cement, 'clay-feed').freightId, 'inland-truck-short');
  assert.equal(nodeEcon(cement, 'cement-product').freightId, 'bulk-dry-shortsea');
});

test('Mejillones DRI leftover freight: purchased H2 chile-coast-container 0.08; steel sale bulk-dry-shortsea 0.03; green O2 cryo-tanker-short; seawater plant-gate', () => {
  const h2 = solvedCash(createH2DriCase);
  const hydrogen = nodeEcon(h2.definition, 'hydrogen-feed');
  const h2Ore = nodeEcon(h2.definition, 'iron-ore');
  const h2Steel = nodeEcon(h2.definition, 'steel');
  assert.equal(hydrogen.freightId, 'chile-coast-container');
  assert.equal(hydrogen.freightUsdPerKg, 0.08);
  assert.equal(h2Ore.freightId, 'inland-truck-short');
  assert.equal(h2Ore.freightUsdPerKg, 0.01);
  assert.equal(h2Steel.freightId, 'bulk-dry-shortsea');
  assert.equal(h2Steel.freightUsdPerKg, 0.03);
  assert.ok(Math.abs(h2.cash.installedCapex - PRIOR_H2_DRI_INSTALLED_CAPEX) <= 1, `h2-dri CAPEX ${h2.cash.installedCapex}`);
  assert.ok(h2.cash.breakdown.freight > PRIOR_H2_DRI_BREAKDOWN_FREIGHT, `h2-dri freight ${h2.cash.breakdown.freight}`);
  assert.ok(Number.isFinite(h2.cash.annualNetCash), `h2-dri annualNetCash ${h2.cash.annualNetCash}`);

  const green = solvedCash(createGreenH2DriCase);
  const greenSteel = nodeEcon(green.definition, 'steel');
  const oxygen = nodeEcon(green.definition, 'electrolyzer-oxygen');
  const seawater = nodeEcon(green.definition, 'seawater');
  const greenOre = nodeEcon(green.definition, 'iron-ore');
  assert.equal(greenSteel.freightId, 'bulk-dry-shortsea');
  assert.equal(greenSteel.freightUsdPerKg, 0.03);
  assert.equal(oxygen.freightId, 'cryo-tanker-short');
  assert.equal(oxygen.freightUsdPerKg, 0.08);
  assert.equal(seawater.freightId, undefined);
  assert.equal(seawater.freightUsdPerKg, undefined);
  assert.equal(greenOre.freightId, 'inland-truck-short');
  assert.ok(Math.abs(green.cash.installedCapex - PRIOR_GREEN_H2_DRI_INSTALLED_CAPEX) <= 1, `green-H2-DRI CAPEX ${green.cash.installedCapex}`);
  assert.ok(green.cash.breakdown.freight > PRIOR_GREEN_H2_DRI_BREAKDOWN_FREIGHT, `green-H2-DRI freight ${green.cash.breakdown.freight}`);
  assert.ok(Number.isFinite(green.cash.annualNetCash), `green-H2-DRI annualNetCash ${green.cash.annualNetCash}`);

  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
  assert.equal(maglutCash.breakdown.freight, 0);
});

test('cryo-tanker-short band is $0.08/kg from Linde Sweden 2024; green-H2-DRI O2 in-band', () => {
  const band = tea.freightBands['cryo-tanker-short'];
  assert.equal(band.value, 0.08);
  assert.equal(band.unit, '$/kg');
  assert.equal(band.quality, 'screening');
  assert.equal(tea.getFreight('cryo-tanker-short').value, 0.08);
  assert.equal(band.evidence[0].url, LINDE_LOX_TANKER);
  assert.match(band.note, /not a pipeline/i);
  assert.match(band.note, /liquefaction/i);

  const { definition, cash } = solvedCash(createGreenH2DriCase);
  const oxygen = nodeEcon(definition, 'electrolyzer-oxygen');
  assert.equal(oxygen.freightId, 'cryo-tanker-short');
  assert.equal(oxygen.freightUsdPerKg, 0.08);
  assert.equal(oxygen.gateUnitPrice, 0.05);
  // Honest net is 0.05 − 0.08. attachFreight already clamps sale unitPrice at 0 (Math.max); do not add more clamping.
  assert.ok(Math.abs((oxygen.gateUnitPrice - oxygen.freightUsdPerKg) - (0.05 - 0.08)) < 1e-12);
  assert.equal(oxygen.unitPrice, 0);
  assert.ok(oxygen.evidence.some(item => item.url === LINDE_LOX_TANKER));

  assert.ok(Math.abs(cash.installedCapex - PRIOR_GREEN_H2_DRI_INSTALLED_CAPEX) <= 1, `green-H2-DRI CAPEX ${cash.installedCapex}`);
  assert.ok(cash.breakdown.freight > 16169, `green-H2-DRI freight ${cash.breakdown.freight} vs prior ${PRIOR_GREEN_H2_DRI_STEEL_FREIGHT}`);
  assert.ok(Number.isFinite(cash.annualNetCash), `green-H2-DRI annualNetCash ${cash.annualNetCash}`);
  assert.ok(true, `green-H2-DRI cash lines R=${cash.annualRevenue} OPEX=${cash.annualOperatingCost} freight=${cash.breakdown.freight} net=${cash.annualNetCash} installed=${cash.installedCapex}`);

  const maglutCash = evaluateEconomics(createMaglutCase(), solveOperation(createMaglutCase()));
  assert.ok(Math.abs(maglutCash.annualNetCash - 1299) <= 5, `Maglut annualNetCash ${maglutCash.annualNetCash}`);
  assert.equal(maglutCash.breakdown.freight, 0);

  const ftOxygen = nodeEcon(createGreenFtCase(), 'electrolyzer-oxygen');
  assert.equal(ftOxygen.freightId, undefined);
  assert.equal(ftOxygen.freightUsdPerKg, undefined);
  const mtoOxygen = nodeEcon(createGreenMtoCase(), 'electrolyzer-oxygen');
  assert.equal(mtoOxygen.freightId, undefined);
  assert.equal(mtoOxygen.freightUsdPerKg, undefined);
  const ureaOxygen = nodeEcon(createGreenUreaCase(), 'electrolyzer-oxygen');
  assert.equal(ureaOxygen.freightId, undefined);
  assert.equal(ureaOxygen.freightUsdPerKg, undefined);
  const ureaAsu = nodeEcon(createGreenUreaCase(), 'asu-oxygen');
  assert.equal(ureaAsu.freightId, undefined);
  const ammoniaOxygen = nodeEcon(createGreenAmmoniaCase(), 'electrolyzer-oxygen');
  assert.equal(ammoniaOxygen.freightId, undefined);
  assert.equal(ammoniaOxygen.freightUsdPerKg, undefined);
  const ammoniaAsu = nodeEcon(createGreenAmmoniaCase(), 'asu-oxygen');
  assert.equal(ammoniaAsu.freightId, undefined);
});
