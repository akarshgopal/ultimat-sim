const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { solveOperation } = require('../engine/solve');
const { sizeToProduct } = require('../engine/size');
const { createMethanolCase, DAILY_PV } = require('../cases/methanol');

const pvgis = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'pvgis-mejillones.json'), 'utf8'));

function assertClosed(solved) {
  assert.ok(solved.balances.maxAbsResidual < 1e-8);
  assert.ok(Math.abs(solved.balances.electricityKWh) < 1e-8);
  assert.ok(Math.abs(solved.balances.heatKWh) < 1e-8);
}

test('methanol plant uses solid-sorbent DAC, cited Mejillones site, and closes balances', () => {
  const definition = createMethanolCase();
  const solved = solveOperation(definition);

  assert.equal(definition.graph.nodes.find(node => node.id === 'dac').unit, 'dac-solid');
  assert.equal(definition.graph.nodes.find(node => node.id === 'methanol').unit, 'methanol');
  assert.equal(definition.graph.nodes.find(node => node.id === 'swro').unit, 'swro');
  assert.equal(definition.site.id, 'mejillones-pvgis-2026-09-14');
  assert.equal(definition.site.latitude, -23.100);
  assert.equal(definition.site.longitude, -70.448);
  assert.equal(definition.site.resources.grid.quality, 'unverified');
  assert.equal(definition.site.resources.freshwater.quality, 'unverified');
  assert.equal(definition.site.meteo.quality, 'cited');
  assert.equal(definition.site.meteo.dailyPVKWhPerKWp, DAILY_PV[0]);
  assert.equal(definition.site.assay.kind, 'seawater');
  assert.equal(definition.site.assay.quality, 'cited');
  assert.match(definition.site.assay.summary, /34\.9|Atacama|Millero/);
  assert.equal(definition.site.resources.seawater.quality, 'cited');
  assert.ok(definition.site.resources.seawater.stream.mol['Mg+2'] > 0);
  assert.equal(definition.site.rights.seawaterIntake.status, 'assumed');
  assert.equal(definition.site.rights.seawaterDischarge.status, 'unverified');
  assert.equal(definition.site.rights.gridImport.status, 'unverified');
  assert.equal(definition.site.rights.gridImport.authorize, false);
  assert.ok(definition.site.meteo.cite.url.includes('re.jrc.ec.europa.eu'));
  assert.ok(definition.site.assay.evidence.some(item => /doi\.org\/10\.1016\/j\.dsr\.2007\.10\.001/.test(item.url)));
  assert.ok(solved.warnings.some(message => message.includes('unverified site right: gridImport')));
  assert.ok(solved.nodes.methanol.activity > 0);
  assert.ok(solved.nodes.electrolyzer.activity > 0);
  assert.ok(solved.nodes.dac.activity > 0);
  assert.ok(solved.nodes.swro.activity > 0);
  assertClosed(solved);
});

test('frozen Mejillones PVGIS monthly matches the methanol case series', () => {
  const monthly = pvgis.outputs.monthly.fixed.map(row => row.E_d);
  assert.equal(pvgis.outputs.totals.fixed.E_y, 1923.52);
  assert.deepEqual(DAILY_PV.slice(1), monthly);
  assert.equal(pvgis.inputs.meteo_data.radiation_db, 'PVGIS-ERA5');
  assert.equal(pvgis.inputs.location.latitude, -23.1);
  assert.equal(pvgis.inputs.location.longitude, -70.448);
});

test('sizeToProduct methanol meets a sink target on the Mejillones plant', () => {
  const sized = sizeToProduct({ product: 'CH3OH', rate: 8, caseOrBuilder: () => createMethanolCase(0) });
  assert.equal(sized.product, 'methanol');
  assert.ok(Math.abs(sized.achieved - 8) < 1e-4, `achieved ${sized.achieved}`);
  assert.ok(sized.residual < 1e-6);
  assert.equal(sized.converged, true);
  assert.ok(sized.definition.graph.nodes.find(node => node.unit === 'methanol').capacity >= 8 - 1e-9);
  assert.ok(sized.definition.site.solarKWp > 20);
  assertClosed(sized.solved);
});
