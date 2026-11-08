const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  LAYER_SOURCES,
  COLORMAP_LAYER_IDS,
  LAYER_SCORE_EXPECTED_PARTS,
  PV_YIELD_SCORE_MAX,
  haToRadiusM,
  circlePolygon,
  layoutFootprintCampus,
  projectCampusDiagram,
  projectCampusDiagramIso,
  footprintLabelVisible,
  rectanglePolygon,
  waterAvailabilityScreening,
  pvScreeningBand,
  landValueScreening,
  networkPlantMarkers,
  ghiAt,
  ghiColor,
  ghiColorRgb,
  gsaZoomForMapZoom,
  gsaTileXY,
  gsaCoveringTiles,
  sampleGsaDecoded,
  getLandPricesBundle,
  landPriceById,
  landPriceAt,
  layerScoreAt,
  landColorUsdPerHa,
  landChoroplethStyle,
  landColor,
  landIndexAt,
  waterScreeningColor,
  isDeepOceanScreening,
  webMercatorToLatLng,
} = require('../engine/map-site');

const landPrices = require('../data/land-prices.js');
const landAdmin = require('../data/land-admin.js');

test('waterAvailabilityScreening keeps coastal seawater, Dead Sea brine, and inland arid/fresh bands', () => {
  const almeria = waterAvailabilityScreening(36.834, -2.463);
  assert.equal(almeria.band, 'seawater');
  assert.equal(almeria.quality, 'screening');
  assert.equal(almeria.seawaterAccess, true);

  const deadSea = waterAvailabilityScreening({ latitude: 31.16, longitude: 35.43 });
  assert.equal(deadSea.band, 'brine');

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
  assert.ok(['good', 'excellent'].includes(almeria.band));
  assert.ok(almeria.typicalKWhPerKWpDay > 4);

  const deadSea = pvScreeningBand({ latitude: 31.16, longitude: 35.43 });
  const oslo = pvScreeningBand(59.9, 10.8);
  const sahara = pvScreeningBand(23, 10);
  assert.ok(sahara.typicalKWhPerKWpDay > oslo.typicalKWhPerKWpDay);
  assert.ok(deadSea.typicalKWhPerKWpDay > oslo.typicalKWhPerKWpDay);
  assert.ok(oslo.typicalKWhPerKWpDay < 3);
  assert.equal(pvScreeningBand(NaN).band, 'unknown');
});

test('landValueScreening ranks coastal above inland above arid and rejects bad coordinates', () => {
  const almeria = landValueScreening(36.834, -2.463);
  const sahara = landValueScreening(23, 10);
  const amazon = landValueScreening(3, -60);
  assert.ok(sahara.relativeIndex < amazon.relativeIndex);
  assert.ok(amazon.relativeIndex < almeria.relativeIndex);
  assert.equal(landValueScreening(120, 0).relativeIndex, 0);
});

test('every colormap layer source is cited', () => {
  for (const id of COLORMAP_LAYER_IDS) assert.ok(LAYER_SOURCES[id], id);
  for (const source of Object.values(LAYER_SOURCES)) {
    assert.ok(source.id);
    assert.ok(source.cite);
    assert.ok(source.quality);
  }
});

test('GSA annual ramp colors and geographic tile helpers', () => {
  assert.equal(ghiAt(NaN), null);
  const coolRgb = ghiColorRgb(700);
  const hotRgb = ghiColorRgb(2800);
  assert.ok(coolRgb[2] > coolRgb[0], 'low annual GHI is blue/cyan');
  assert.ok(hotRgb[0] > hotRgb[2], 'high annual GHI is orange/red');
  assert.notEqual(ghiColor(700), ghiColor(2800));

  const alm = gsaTileXY(36.834, -2.463, 6);
  assert.deepEqual({ z: alm.z, y: alm.y, x: alm.x }, { z: 6, y: 11, x: 69 });
  assert.ok(gsaCoveringTiles(36, -3, 37, -2, 6).some(t => t.y === 11 && t.x === 69));
  const zoom = gsaZoomForMapZoom(10, 36);
  assert.ok(zoom >= 0 && zoom <= 8);
  assert.ok(ghiAt(23, 10) > ghiAt(59.9, 10.8));
});

test('vendored Lerc decodes a GSA GHI fixture tile', async () => {
  const Lerc = require('../vendor/LercDecode.js');
  await Lerc.load({ locateFile: file => path.join(__dirname, '..', 'vendor', file) });
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'gsa-ghi-almeria-z6.lerc'));
  const decoded = Lerc.decode(fixture);
  assert.equal(decoded.width, 256);
  assert.equal(decoded.height, 256);
  assert.equal(decoded.pixelType, 'U16');
  const value = sampleGsaDecoded(decoded, 6, 11, 69, 36.834, -2.463);
  assert.ok(value > 1500 && value < 2300, `Almería annual GHI should be ~1871, got ${value}`);
});

test('land colors and choropleth follow USD/ha; deep ocean is skipped', () => {
  assert.notEqual(landColorUsdPerHa(2500), landColorUsdPerHa(90000));
  assert.ok(landIndexAt(36.834, -2.463) > 0.6);
  assert.ok(landIndexAt(36.77, -2.81) > 0.6, 'El Ejido / Alboran coast is not treated as ocean');
  assert.equal(isDeepOceanScreening(38, 15), true);
  assert.equal(landIndexAt(38, 15), null);
  assert.equal(isDeepOceanScreening(36.834, -2.463), false);
  assert.notEqual(waterScreeningColor('arid'), waterScreeningColor('seawater'));
  assert.ok(landChoroplethStyle({ properties: { id: 'US-IA' } }, landPrices).fillOpacity > 0);
  assert.equal(landChoroplethStyle({ properties: { id: 'AQ' } }, landPrices).fillOpacity, 0);
});

test('bundled land prices are unique, finite, and cited; lookups resolve by id and point', () => {
  const bundle = getLandPricesBundle();
  assert.equal(bundle, landPrices);
  const ids = new Set();
  for (const record of bundle.records) {
    assert.ok(!ids.has(record.id), `duplicate id ${record.id}`);
    ids.add(record.id);
    assert.ok(Number.isFinite(record.usdPerHa) && record.usdPerHa > 0, record.id);
    assert.ok(record.source && record.citeUrl, record.id);
    assert.ok(record.quality === 'cited' || record.quality === 'screening', record.id);
  }
  assert.ok(landPriceById('US-IA', bundle).usdPerHa > 0);
  assert.equal(landPriceById('US-AK', bundle), null);
  assert.equal(landPriceAt(36.834, -2.463)?.id, 'ES');
  assert.equal(landPriceAt(27.8, -97.4)?.id, 'US-TX');
  assert.equal(landPriceAt(31.16, 35.43), null);
  assert.equal(layerScoreAt(NaN, NaN), null);
  assert.equal(layerScoreAt(120, 0), null);
  assert.ok(layerScoreAt(36.834, -2.463) > layerScoreAt(59.9, 10.8));
  const priced = landAdmin.features.filter(f => f.properties.hasPrice);
  assert.ok(priced.length > 0);
  assert.ok(priced.every(f => landPriceById(f.properties.id, bundle)), 'every priced admin polygon has a record');
});

test('layerScoreAt prefers frozen PVGIS yield and completeness-weights missing land $/ha', () => {
  const almeriaLat = 36.834;
  const almeriaLon = -2.463;
  const screening = layerScoreAt(almeriaLat, almeriaLon);
  const almeriaDaily = 1716.39 / 365;
  const frozen = layerScoreAt(almeriaLat, almeriaLon, {
    dailyPVKWhPerKWp: almeriaDaily,
    frozen: true,
  });
  const fromYear = layerScoreAt(almeriaLat, almeriaLon, {
    yearlyPVKWhPerKWp: 1716.39,
    frozen: true,
  });
  const fromCoordsObject = layerScoreAt(
    { latitude: almeriaLat, longitude: almeriaLon },
    { dailyPVKWhPerKWp: almeriaDaily, frozen: true },
  );
  assert.ok(Number.isFinite(screening));
  assert.ok(Number.isFinite(frozen));
  assert.notEqual(frozen, screening);
  assert.equal(fromYear, frozen);
  assert.equal(fromCoordsObject, frozen);

  const hot = layerScoreAt(almeriaLat, almeriaLon, { dailyPVKWhPerKWp: PV_YIELD_SCORE_MAX, frozen: true });
  const cold = layerScoreAt(almeriaLat, almeriaLon, { dailyPVKWhPerKWp: 1, frozen: true });
  assert.ok(hot > frozen);
  assert.ok(frozen > cold);

  assert.ok(landPriceAt(almeriaLat, almeriaLon), 'Spain has a cited land $/ha series');
  const waterAlm = waterAvailabilityScreening(almeriaLat, almeriaLon);
  const twoLayerMean = (
    Math.min(1, Math.max(0, almeriaDaily / PV_YIELD_SCORE_MAX)) + waterAlm.score
  ) / 2;
  assert.notEqual(frozen, Math.round(twoLayerMean * 1e4) / 1e4);

  const chileLat = -23.1;
  const chileLon = -70.448;
  const chileLand = landPriceAt(chileLat, chileLon);
  assert.ok(chileLand && chileLand.usdPerHa > 0, 'Chile has a land $/ha series');
  assert.equal(chileLand.id, 'CL');
  const chileDaily = 1923.52 / 365;
  const chileFrozen = layerScoreAt(chileLat, chileLon, {
    dailyPVKWhPerKWp: chileDaily,
    frozen: true,
  });
  const chileScreen = layerScoreAt(chileLat, chileLon);
  const chileWater = waterAvailabilityScreening(chileLat, chileLon);
  const chileSunFrozen = Math.min(1, Math.max(0, chileDaily / PV_YIELD_SCORE_MAX));
  const naiveFrozen = (chileSunFrozen + chileWater.score) / 2;
  const completeFrozen = naiveFrozen * (2 / LAYER_SCORE_EXPECTED_PARTS);
  assert.notEqual(chileFrozen, Math.round(completeFrozen * 1e4) / 1e4);
  assert.ok(chileFrozen > completeFrozen, 'filled Chile land must not completeness-penalize');
  assert.notEqual(chileFrozen, chileScreen);

  const dsLat = 31.16;
  const dsLon = 35.43;
  assert.equal(landPriceAt(dsLat, dsLon), null, 'Dead Sea / Jordan still has no land $/ha');
  const dsDaily = 4.2;
  const dsFrozen = layerScoreAt(dsLat, dsLon, { dailyPVKWhPerKWp: dsDaily, frozen: true });
  const dsWater = waterAvailabilityScreening(dsLat, dsLon);
  const dsSun = Math.min(1, Math.max(0, dsDaily / PV_YIELD_SCORE_MAX));
  const dsNaive = (dsSun + dsWater.score) / 2;
  const dsComplete = dsNaive * (2 / LAYER_SCORE_EXPECTED_PARTS);
  assert.equal(dsFrozen, Math.round(dsComplete * 1e4) / 1e4);
  assert.ok(dsFrozen < dsNaive, 'missing land must not silently over-weight sun+water');
});

test('landPriceAt returns usdPerHa for Mejillones, Taweelah, Mundra, Tokyo-ish, Cape Town', () => {
  const pins = [
    { name: 'Mejillones', lat: -23.100, lon: -70.448, id: 'CL' },
    { name: 'Taweelah', lat: 24.761, lon: 54.683, id: 'AE' },
    { name: 'Mundra', lat: 22.737, lon: 69.710, id: 'IN' },
    { name: 'Tokyo-ish', lat: 35.6895, lon: 139.6917, id: 'JP' },
    { name: 'Cape Town', lat: -33.9249, lon: 18.4241, id: 'ZA' },
  ];
  for (const pin of pins) {
    const record = landPriceAt(pin.lat, pin.lon);
    assert.ok(record, pin.name);
    assert.equal(record.id, pin.id, pin.name);
    assert.ok(Number.isFinite(record.usdPerHa) && record.usdPerHa > 0, pin.name);
    assert.ok(record.quality === 'cited' || record.quality === 'screening', pin.name);
    const scored = layerScoreAt(pin.lat, pin.lon, { dailyPVKWhPerKWp: 5, frozen: true });
    const water = waterAvailabilityScreening(pin.lat, pin.lon);
    const sun = Math.min(1, Math.max(0, 5 / PV_YIELD_SCORE_MAX));
    const twoLayer = ((sun + water.score) / 2) * (2 / LAYER_SCORE_EXPECTED_PARTS);
    assert.notEqual(scored, Math.round(twoLayer * 1e4) / 1e4, `${pin.name} must not completeness-penalize missing land`);
  }
});

test('web mercator helper and footprint circle stay available', () => {
  const center = webMercatorToLatLng(0, 0, 0, 128, 128, 256);
  assert.ok(Math.abs(center.latitude) < 1e-6);
  assert.ok(Math.abs(center.longitude) < 1e-6);
  assert.ok(haToRadiusM(1) > 50);
  assert.ok(circlePolygon(36.834, -2.463, 100).length > 8);
  const markers = networkPlantMarkers({ plants: [{ id: 'p', name: 'P', definition: { site: { latitude: 36.8, longitude: -2.5 } } }] });
  assert.equal(markers.length, 1);
});

test('layoutFootprintCampus returns solar + pad rings whose areas sum to inputs', () => {
  const solar = { landAreaM2: 10000, quality: 'cited', evidence: [{ label: 't', url: 'https://example.com' }] };
  const processes = [
    { id: 'a', label: 'A', unit: 'electrolyzer', areaM2: 400, quality: 'cited', evidence: [] },
    { id: 'b', label: 'B', unit: 'swro', areaM2: 100, quality: 'cited', evidence: [] },
  ];
  const blocks = layoutFootprintCampus({
    latitude: 36.834,
    longitude: -2.463,
    solar,
    processes,
    totalHa: (10000 + 500) / 10000,
  });
  const again = layoutFootprintCampus({
    latitude: 36.834,
    longitude: -2.463,
    solar,
    processes,
    totalHa: (10000 + 500) / 10000,
  });
  assert.ok(blocks.length >= 3);
  assert.equal(JSON.stringify(blocks.map(b => b.id)), JSON.stringify(again.map(b => b.id)));
  const solarBlock = blocks.find(b => b.kind === 'solar');
  const processBlocks = blocks.filter(b => b.kind === 'process');
  const outline = blocks.find(b => b.kind === 'outline');
  assert.ok(solarBlock?.ring?.length >= 4);
  assert.equal(processBlocks.length, 2);
  assert.ok(processBlocks.every(b => b.ring.length >= 4));
  assert.ok(outline?.ring?.length > 8);
  const laid = solarBlock.areaM2 + processBlocks.reduce((sum, b) => sum + b.areaM2, 0);
  assert.ok(Math.abs(laid - (10000 + 500)) < 1e-9);
  assert.ok(rectanglePolygon(36.834, -2.463, 40, 20).length >= 4);
});

test('projectCampusDiagram is north-up and proportional', () => {
  const origin = { latitude: 31.16, longitude: 35.43 };
  const blocks = [
    {
      id: 'n',
      kind: 'solar',
      label: 'Solar field',
      unit: 'solar-pv',
      areaM2: 400,
      ring: rectanglePolygon(origin.latitude, origin.longitude, 20, 20, 0, 40),
    },
    {
      id: 's',
      kind: 'process',
      label: 'SWRO',
      unit: 'swro',
      areaM2: 400,
      ring: rectanglePolygon(origin.latitude, origin.longitude, 20, 20, 0, -40),
    },
  ];
  const diagram = projectCampusDiagram(blocks, origin, { width: 200, height: 200, pad: 10 });
  const again = projectCampusDiagram(blocks, origin, { width: 200, height: 200, pad: 10 });
  assert.equal(JSON.stringify(diagram.shapes), JSON.stringify(again.shapes));
  const north = diagram.shapes.find(shape => shape.id === 'n');
  const south = diagram.shapes.find(shape => shape.id === 's');
  assert.ok(north.box.cy < south.box.cy);
  assert.ok(Math.abs(north.box.w * north.box.h - south.box.w * south.box.h) / (north.box.w * north.box.h) < 0.05);
  for (const shape of diagram.shapes) {
    for (const [x, y] of shape.points) {
      assert.ok(x >= 9 && x <= 191, `x ${x}`);
      assert.ok(y >= 9 && y <= 191, `y ${y}`);
    }
  }
  assert.equal(projectCampusDiagram([], origin).shapes.length, 0);
  assert.equal(projectCampusDiagram(null).shapes.length, 0);

  const solar = { landAreaM2: 10000, quality: 'cited', evidence: [] };
  const processes = [
    { id: 'ely', label: 'Electrolyzer', unit: 'electrolyzer', areaM2: 400, quality: 'cited', evidence: [] },
  ];
  const campus = layoutFootprintCampus({
    latitude: origin.latitude,
    longitude: origin.longitude,
    solar,
    processes,
    totalHa: 1.04,
  });
  const fitted = projectCampusDiagram(campus, origin, { width: 320, height: 200, pad: 16 });
  const solarShape = fitted.shapes.find(shape => shape.kind === 'solar');
  const padShape = fitted.shapes.find(shape => shape.id === 'ely');
  const outline = fitted.shapes.find(shape => shape.kind === 'outline');
  assert.ok(solarShape && padShape && outline);
  assert.ok(solarShape.box.cy < padShape.box.cy);
  assert.ok(solarShape.box.w * solarShape.box.h > padShape.box.w * padShape.box.h * 10);
});


test('projectCampusDiagramIso extrudes pads, links them, and stays deterministic', () => {
  const origin = { latitude: 31.35, longitude: 84.05 };
  const solar = { landAreaM2: 100000, quality: 'cited', evidence: [] };
  const processes = [
    { id: 'minerals', label: 'Minerals', unit: 'brine-minerals', areaM2: 900, quality: 'cited', evidence: [] },
  ];
  const campus = layoutFootprintCampus({
    latitude: origin.latitude,
    longitude: origin.longitude,
    solar,
    processes,
    totalHa: 10.09,
  });
  const diagram = projectCampusDiagramIso(campus, origin, {
    width: 320,
    height: 200,
    pad: 16,
    waterCue: { kind: 'brine' },
  });
  const again = projectCampusDiagramIso(campus, origin, {
    width: 320,
    height: 200,
    pad: 16,
    waterCue: { kind: 'brine' },
  });
  assert.equal(diagram.mode, 'iso');
  assert.equal(JSON.stringify(diagram.shapes), JSON.stringify(again.shapes));
  assert.equal(JSON.stringify(diagram.links), JSON.stringify(again.links));
  assert.equal(JSON.stringify(diagram.cues), JSON.stringify(again.cues));

  const solarShape = diagram.shapes.find(shape => shape.kind === 'solar');
  const padShape = diagram.shapes.find(shape => shape.id === 'minerals');
  const outline = diagram.shapes.find(shape => shape.kind === 'outline');
  assert.ok(solarShape?.faces?.top?.length >= 4);
  assert.ok(solarShape.faces.south?.length === 4);
  assert.ok(solarShape.faces.east?.length === 4);
  assert.ok(solarShape.hatch.length >= 2, 'solar panel hatch');
  assert.ok(padShape?.faces?.south?.length === 4);
  assert.ok(padShape.hatch.length >= 1, 'shed ridge');
  assert.ok(outline?.faces?.top?.length >= 8);
  assert.ok(diagram.links.some(link => link.kind === 'road'));
  assert.ok(diagram.links.some(link => link.kind === 'power'));
  assert.equal(diagram.cues.length, 1);
  assert.equal(diagram.cues[0].kind, 'brine');
  assert.ok(diagram.cues[0].points.length >= 4);

  for (const shape of diagram.shapes) {
    for (const [x, y] of shape.points) {
      assert.ok(x >= 0 && x <= 320, `x ${x}`);
      assert.ok(y >= 0 && y <= 200, `y ${y}`);
    }
  }
  assert.equal(projectCampusDiagramIso([], origin).shapes.length, 0);
  assert.equal(projectCampusDiagramIso(null).shapes.length, 0);
});

test('footprint labels appear only when a pad is wide enough on the map', () => {

  assert.equal(footprintLabelVisible({ areaM2: 400, latitude: 31.16, zoom: 10 }), false);
  assert.equal(footprintLabelVisible({ areaM2: 500000, latitude: 31.16, zoom: 15 }), true);
  assert.equal(footprintLabelVisible({ areaM2: 0, latitude: 31.16, zoom: 16 }), false);
  assert.equal(footprintLabelVisible({ areaM2: 1000, latitude: 31.16, zoom: NaN }), false);
});
