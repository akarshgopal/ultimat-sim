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
  landValueScreening,
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

test('landValueScreening is a coastal / inland / arid land-cost screen', () => {
  const almeria = landValueScreening(36.834, -2.463);
  assert.equal(almeria.quality, 'screening');
  assert.equal(almeria.band, 'coastal-high');
  assert.ok(almeria.relativeIndex > 0.6);
  assert.match(almeria.cite.label, /not cadastral|not transaction/i);
  assert.match(almeria.cite.url, /worldbank|fao/i);
  assert.match(almeria.note, /coastal|not a cadastral/i);

  const sahara = landValueScreening(23, 10);
  assert.equal(sahara.band, 'arid-low');
  assert.ok(sahara.relativeIndex < almeria.relativeIndex);

  const amazon = landValueScreening(3, -60);
  assert.equal(amazon.band, 'inland-moderate');
  assert.ok(amazon.relativeIndex > sahara.relativeIndex);
  assert.ok(amazon.relativeIndex < almeria.relativeIndex);

  const bad = landValueScreening(120, 0);
  assert.equal(bad.band, 'unknown');
  assert.equal(bad.relativeIndex, 0);
});

test('LAYER_SOURCES includes Land value screening overlay', () => {
  assert.equal(LAYER_SOURCES.land.id, 'land');
  assert.equal(LAYER_SOURCES.land.label, 'Land value');
  assert.equal(LAYER_SOURCES.land.kind, 'overlay');
  assert.equal(LAYER_SOURCES.land.quality, 'screening');
  assert.match(LAYER_SOURCES.land.cite.label, /not cadastral|not transaction/i);
  assert.ok(LAYER_SOURCES.land.cite.url === null || /worldbank|fao/i.test(LAYER_SOURCES.land.cite.url));
  assert.equal(LAYER_SOURCES.pvgis.label, 'PVGIS PV');
  assert.equal(LAYER_SOURCES.water.label, 'Water screening');
  for (const source of Object.values(LAYER_SOURCES)) {
    assert.ok(source.id);
    assert.ok(source.cite);
    assert.ok(source.quality);
  }
});
