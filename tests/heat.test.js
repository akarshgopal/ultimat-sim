const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { cascadeHeat } = require('../engine/heat');
const { solveOperation } = require('../engine/solve');
const { createSabatierCase } = require('../cases/sabatier');
const { createCoastalCase } = require('../cases/coastal');

function assertConserved(result, sources, sinks) {
  const sourceSum = sources.reduce((sum, item) => sum + item.kWh, 0);
  const sinkSum = sinks.reduce((sum, item) => sum + item.demandKWh, 0);
  assert.ok(Math.abs(result.coveredKWh + result.unrecoveredWasteKWh - sourceSum) < 1e-9);
  assert.ok(Math.abs(result.coveredKWh + result.residualDemandKWh - sinkSum) < 1e-9);
}

test('cold waste cannot cover a high-minimum-temperature sink', () => {
  const sources = [{ id: 'dac', kWh: 12, T_C: 40 }];
  const sinks = [{ id: 'dac', demandKWh: 12, minT_C: 80 }];
  const result = cascadeHeat({ sources, sinks });
  assert.equal(result.matches.length, 0);
  assert.equal(result.coveredKWh, 0);
  assert.equal(result.residualDemandKWh, 12);
  assert.equal(result.unrecoveredWasteKWh, 12);
  assertConserved(result, sources, sinks);
});

test('Sabatier waste heat is a cascade source that can cover DAC', () => {
  const solved = solveOperation(createSabatierCase());
  const heat = solved.heatIntegration;
  const waste = solved.nodes.sabatier.outlets.wasteHeat;
  assert.ok(heat);
  assert.equal(waste.kind, 'heat');
  assert.ok(waste.kWh > 0);
  assert.equal(waste.T_C, 250);
  assert.ok(Math.abs(waste.kWh - 5 * 2.86) < 1e-9);
  assert.ok(heat.sources.some(source => source.id === 'sabatier' && source.kWh > 0));
  assert.ok(heat.sinks.some(sink => sink.id === 'dac' && sink.demandKWh > 0));
  assert.ok(heat.coveredKWh > 0);
  assert.ok(heat.matches.some(match => match.from === 'sabatier' && match.to === 'dac'));
  assert.ok(Math.abs(solved.balances.heatKWh) < 1e-8);
  assertConserved(heat, heat.sources, heat.sinks);
});

test('coastal methane keeps heatIntegration and does not drop the heat source', () => {
  const definition = createCoastalCase(6);
  const solved = solveOperation(definition);
  assert.ok(definition.graph.nodes.some(node => node.unit === 'heat-source'));
  assert.ok(solved.heatIntegration);
  assert.ok(solved.nodes.sabatier.outlets.wasteHeat.kWh > 0);
  assert.ok(solved.heatIntegration.coveredKWh > 0);
  assert.ok(Math.abs(solved.balances.heatKWh) < 1e-8);
});
