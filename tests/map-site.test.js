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

test('haToRadiusM converts hectares to an equivalent-circle radius', () => {
  assert.equal(haToRadiusM(0), 0);
  assert.equal(haToRadiusM(-4), 0);
  assert.equal(haToRadiusM(NaN), 0);
  const oneHa = haToRadiusM(1);
  assert.ok(Math.abs(oneHa - Math.sqrt(SQM_PER_HA / Math.PI)) < 1e-12);
  assert.ok(Math.abs(Math.PI * haToRadiusM(2.5) ** 2 - 2.5 * SQM_PER_HA) < 1e-6);
});

test('circlePolygon is a closed lat/lon ring whose vertices sit on the radius', () => {
  assert.deepEqual(circlePolygon(NaN, 0, 100), []);
  assert.deepEqual(circlePolygon(36.834, -2.463, 0), []);
  const ring = circlePolygon(36.834, -2.463, haToRadiusM(1), 32);
  assert.equal(ring.length, 33);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  const [lat0, lon0] = ring[0];
  const metersPerDegLat = 111319.9;
  const metersPerDegLon = metersPerDegLat * Math.cos(36.834 * Math.PI / 180);
  const eastM = (lon0 - -2.463) * metersPerDegLon;
  const northM = (lat0 - 36.834) * metersPerDegLat;
  assert.ok(Math.abs(Math.hypot(eastM, northM) - haToRadiusM(1)) < 0.02);
});

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

test('LAYER_SOURCES cites OSM, PVGIS PV, water screening, footprint, and network markers', () => {
  assert.equal(LAYER_SOURCES.osm.label, 'OSM');
  assert.match(LAYER_SOURCES.osm.url, /tile\.openstreetmap\.org/);
  assert.match(LAYER_SOURCES.osm.cite.url, /openstreetmap\.org\/copyright/);
  assert.equal(LAYER_SOURCES.pvgis.label, 'PVGIS PV');
  assert.match(LAYER_SOURCES.pvgis.cite.url, /pvg_tools|jrc\.ec\.europa\.eu/);
  assert.equal(LAYER_SOURCES.water.label, 'Water screening');
  assert.match(LAYER_SOURCES.water.cite.label, /Aqueduct/i);
  assert.equal(LAYER_SOURCES.footprint.source, 'estimateFootprint');
  assert.match(LAYER_SOURCES.footprint.cite.label, /estimateFootprint/);
  assert.equal(LAYER_SOURCES.network.label, 'Network markers');
  for (const source of Object.values(LAYER_SOURCES)) {
    assert.ok(source.id);
    assert.ok(source.cite);
    assert.ok(source.quality);
  }
});

test('networkPlantMarkers plots sited plants using estimateFootprint land radii', () => {
  const network = evaluateNetwork(createFuelsAndMineralsNetwork(6));
  const markers = networkPlantMarkers(network);
  assert.equal(markers.length, 2);
  const almeria = markers.find(item => /Almer/i.test(item.name));
  const deadSea = markers.find(item => /Dead Sea/i.test(item.name));
  assert.ok(almeria);
  assert.ok(deadSea);
  assert.ok(Math.abs(almeria.latitude - 36.834) < 1e-6);
  assert.ok(Math.abs(deadSea.longitude - 35.43) < 1e-6);
  assert.ok(almeria.landHa > 0);
  assert.ok(Math.abs(almeria.radiusM - haToRadiusM(almeria.landHa)) < 1e-9);
  assert.ok(almeria.polygon.length > 8);
  const coastal = createCoastalCase(0);
  const solvedFootprint = estimateFootprint({
    site: coastal.site,
    graph: coastal.graph,
    solved: { nodes: {} },
  });
  assert.ok(solvedFootprint.totalHa >= 0);
  assert.equal(networkPlantMarkers({ plants: [{ id: 'unsited', name: 'No coords' }] }).length, 0);
});

test('the Foundry page loads Leaflet 1.9, the map panel, and map-site.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /leaflet@1\.9/);
  assert.match(html, /unpkg\.com\/leaflet@1\.9/);
  assert.match(html, /id="siteMap"/);
  assert.match(html, /id="siteMapLayers"/);
  assert.match(html, /id="applyCoordinates"/);
  assert.match(html, /id="siteMeteo"/);
  assert.match(html, /id="siteAssay"/);
  assert.match(html, /id="siteRights"/);
  assert.match(html, /engine\/map-site\.js/);
  const mapAt = html.indexOf('src="engine/map-site.js"');
  const appAt = html.indexOf('src="js/flowsheet-app.js"');
  assert.ok(mapAt >= 0 && appAt > mapAt);
});

test('distanceKm is a finite haversine used by water screening', () => {
  const km = distanceKm(
    { latitude: 36.834, longitude: -2.463 },
    { latitude: 31.16, longitude: 35.43 },
  );
  assert.ok(km > 3000 && km < 4500);
});
