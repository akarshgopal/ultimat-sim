const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  SQM_PER_HA,
  LAYER_SOURCES,
  haToRadiusM,
  circlePolygon,
  waterAvailabilityScreening,
  pvScreeningBand,
  networkPlantMarkers,
  distanceKm,
} = require('../engine/map-site');
const { estimateFootprint } = require('../engine/footprint');
const { evaluateNetwork } = require('../engine/network');
const { createFuelsAndMineralsNetwork } = require('../cases/network');
const { createCoastalCase } = require('../cases/coastal');

test('waterAvailabilityScreening keeps coastal seawater, Dead Sea brine, and inland arid/fresh bands', () => {
  const almeria = waterAvailabilityScreening(36.834, -2.463);
  assert.equal(almeria.band, 'seawater');
  assert.equal(almeria.class, 'coastal-seawater');
  assert.equal(almeria.quality, 'screening');
  assert.match(almeria.cite.url, /aqueduct/);
  assert.equal(almeria.seawaterAccess, true);

  const deadSea = waterAvailabilityScreening({ latitude: 31.16, longitude: 35.43 });
  assert.equal(deadSea.band, 'brine');
  assert.equal(deadSea.class, 'inland-brine');
  assert.match(deadSea.note, /Dead Sea|brine/i);

  const sahara = waterAvailabilityScreening(23, 10);
  assert.equal(sahara.band, 'arid');
  assert.ok(sahara.score < 0.3);

  const amazon = waterAvailabilityScreening(3, -60);
  assert.equal(amazon.band, 'freshwater');
  assert.ok(amazon.score > sahara.score);

  const bad = waterAvailabilityScreening(120, 0);
  assert.equal(bad.band, 'unknown');
  assert.equal(bad.score, 0);
});

test('pvScreeningBand is a latitude screen, not a PVGIS hourly series', () => {
  const almeria = pvScreeningBand(36.834, -2.463);
  assert.equal(almeria.quality, 'screening');
  assert.match(almeria.cite.url, /pvg_tools|jrc\.ec\.europa\.eu/);
  assert.ok(['good', 'excellent'].includes(almeria.band));
  assert.ok(almeria.typicalKWhPerKWpDay > 4);
  assert.match(almeria.note, /not a PVGIS typical-day/i);

  const deadSea = pvScreeningBand({ latitude: 31.16, longitude: 35.43 });
  const oslo = pvScreeningBand(59.9, 10.8);
  const sahara = pvScreeningBand(23, 10);
  assert.ok(sahara.typicalKWhPerKWpDay > oslo.typicalKWhPerKWpDay);
  assert.ok(deadSea.typicalKWhPerKWpDay > oslo.typicalKWhPerKWpDay);
  assert.ok(oslo.typicalKWhPerKWpDay < 3);
  assert.equal(pvScreeningBand(NaN).band, 'unknown');
});
