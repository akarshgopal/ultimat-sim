const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  LAYER_SOURCES,
  COLORMAP_LAYER_IDS,
  GSA_GHI_RAMP,
  GSA_IRRAD,
  LAND_USD_HA_RAMP,
  LAND_VALUE_RAMP,
  haToRadiusM,
  circlePolygon,
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

test('landValueScreening remains a non-price helper; land overlay is cited choropleth', () => {
  const almeria = landValueScreening(36.834, -2.463);
  assert.equal(almeria.quality, 'screening');
  assert.equal(almeria.band, 'coastal-high');
  assert.ok(almeria.relativeIndex > 0.6);

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

  assert.equal(LAYER_SOURCES.land.available, true);
  assert.equal(LAYER_SOURCES.land.render, 'choropleth');
  assert.equal(LAYER_SOURCES.land.quality, 'cited');
  assert.match(LAYER_SOURCES.land.note, /not cadastral|not industrial|siting proxy/i);
  assert.match(LAYER_SOURCES.land.cite.url, /nass\.usda\.gov|land0825/);
  assert.ok(LAYER_SOURCES.land.cites.length >= 2);
});

test('LAYER_SOURCES describes cited GSA LERC solar and Aqueduct water', () => {
  assert.deepEqual([...COLORMAP_LAYER_IDS], ['pvgis', 'water', 'land']);
  assert.equal(LAYER_SOURCES.pvgis.label, 'Solar GHI');
  assert.equal(LAYER_SOURCES.pvgis.render, 'lerc-tiles');
  assert.equal(LAYER_SOURCES.pvgis.quality, 'cited');
  assert.equal(LAYER_SOURCES.pvgis.sliceId, 2);
  assert.equal(LAYER_SOURCES.pvgis.variable, 'GHI');
  assert.match(LAYER_SOURCES.pvgis.units, /kWh\/m²·year|kWh\/m\u00b2·year/);
  assert.match(LAYER_SOURCES.pvgis.url, /GSA_IRRAD/);
  assert.match(LAYER_SOURCES.pvgis.url, /sliceId=2/);
  assert.match(LAYER_SOURCES.pvgis.url, /\{z\}\/\{y\}\/\{x\}/);
  assert.doesNotMatch(LAYER_SOURCES.pvgis.url || '', /ghi-coarse/);
  assert.equal(LAYER_SOURCES.pvgis.data, undefined);
  assert.match(LAYER_SOURCES.pvgis.overlayCite.label, /Global Solar Atlas|Solargis|ESMAP/i);
  assert.match(LAYER_SOURCES.pvgis.overlayCite.url, /globalsolaratlas/i);
  assert.match(LAYER_SOURCES.pvgis.cite.url, /pvg_tools|jrc\.ec\.europa\.eu/);

  assert.equal(LAYER_SOURCES.water.label, 'Aqueduct BWS');
  assert.equal(LAYER_SOURCES.water.quality, 'cited');
  assert.equal(LAYER_SOURCES.water.render, 'tiles');
  assert.equal(LAYER_SOURCES.water.tileScheme, 'arcgis-zyx');
  assert.match(LAYER_SOURCES.water.url, /gis6\.uspatial\.umn\.edu/);
  assert.match(LAYER_SOURCES.water.url, /SCOPE\/WRI_Aqueducts_Baseline_water_stress/);
  assert.match(LAYER_SOURCES.water.url, /MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
  assert.equal(LAYER_SOURCES.water.fallback, 'screening-grid');
  assert.match(LAYER_SOURCES.water.cite.url, /aqueduct/);
  assert.ok(LAYER_SOURCES.water.legend.length >= 3);

  for (const source of Object.values(LAYER_SOURCES)) {
    assert.ok(source.id);
    assert.ok(source.cite);
    assert.ok(source.quality);
  }
});

test('GSA annual ramp and geographic tile helpers', () => {
  assert.equal(GSA_IRRAD.sliceId, 2);
  assert.equal(GSA_IRRAD.variable, 'GHI');
  assert.equal(GSA_GHI_RAMP.length, 11);
  assert.equal(GSA_GHI_RAMP[1][0], 365);
  assert.equal(ghiAt(NaN), null);
  const cool = ghiColor(700);
  const hot = ghiColor(2800);
  assert.match(cool, /rgb\(|#/);
  assert.match(hot, /rgb\(|#/);
  const coolRgb = ghiColorRgb(700);
  const hotRgb = ghiColorRgb(2800);
  assert.ok(coolRgb[2] > coolRgb[0], 'low annual GHI is blue/cyan');
  assert.ok(hotRgb[0] > hotRgb[2], 'high annual GHI is orange/red');

  const alm = gsaTileXY(36.834, -2.463, 6);
  assert.deepEqual({ z: alm.z, y: alm.y, x: alm.x }, { z: 6, y: 11, x: 69 });
  const covers = gsaCoveringTiles(36, -3, 37, -2, 6);
  assert.ok(covers.some(t => t.y === 11 && t.x === 69));
  assert.ok(gsaZoomForMapZoom(10, 36) >= 0);
  assert.ok(gsaZoomForMapZoom(10, 36) <= 8);
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

test('land USD/ha ramp is yellow→dark green; deep ocean skip still works', () => {
  const pale = landColorUsdPerHa(2500);
  const dark = landColorUsdPerHa(90000);
  assert.match(pale, /#|rgb\(/);
  assert.match(dark, /#|rgb\(/);
  assert.equal(LAND_USD_HA_RAMP[0][1], '#ffffcc');
  assert.equal(LAND_USD_HA_RAMP[LAND_USD_HA_RAMP.length - 1][1], '#006837');
  assert.equal(LAND_VALUE_RAMP[0][1], '#ffffcc');
  assert.ok(landIndexAt(36.834, -2.463) > 0.6);
  assert.ok(landIndexAt(36.77, -2.81) > 0.6, 'El Ejido / Alboran coast is not treated as ocean');
  assert.equal(isDeepOceanScreening(38, 15), true);
  assert.equal(landIndexAt(38, 15), null);
  assert.equal(isDeepOceanScreening(36.834, -2.463), false);
  assert.match(waterScreeningColor('arid'), /#999|#999999/i);
  const styled = landChoroplethStyle({ properties: { id: 'US-IA' } }, landPrices);
  assert.ok(styled.fillOpacity > 0);
  const empty = landChoroplethStyle({ properties: { id: 'AQ' } }, landPrices);
  assert.equal(empty.fillOpacity, 0);
});

test('bundled land-prices data is finite, unique, and covers US+EU', () => {
  const bundle = getLandPricesBundle();
  assert.equal(bundle, landPrices);
  assert.ok(Array.isArray(bundle.records));
  assert.ok(bundle.records.length >= 70);
  const ids = new Set();
  let us = 0;
  let eu = 0;
  for (const record of bundle.records) {
    assert.ok(record.id);
    assert.ok(!ids.has(record.id), `duplicate id ${record.id}`);
    ids.add(record.id);
    assert.ok(Number.isFinite(record.usdPerHa) && record.usdPerHa > 0, record.id);
    assert.ok(record.year >= 2010);
    assert.ok(record.source);
    assert.ok(record.citeUrl);
    if (record.kind === 'us-state') us += 1;
    if (record.kind === 'eu-country') eu += 1;
  }
  assert.equal(us, 48);
  assert.ok(eu >= 20, `expected ≥20 EU countries, got ${eu}`);
  assert.ok(landPriceById('US-IA', bundle).usdPerHa > 10000);
  assert.ok(landPriceById('ES', bundle).usdPerHa > 5000);
  assert.equal(landPriceById('US-AK', bundle), null);
  assert.ok(landAdmin.features.length > 50);
  const priced = landAdmin.features.filter(f => f.properties.hasPrice);
  assert.ok(priced.length >= 60);
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

test('site map solar uses GSA LERC; land uses GeoJSON choropleth, not GridLayer paint', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'flowsheet.css'), 'utf8');
  assert.doesNotMatch(app, /radius:\s*14000/);
  assert.doesNotMatch(app, /radius:\s*22000/);
  assert.doesNotMatch(app, /radius:\s*30000/);
  assert.match(app, /GridLayer/);
  assert.match(app, /GSA_IRRAD|gsaTileUrl|paintGsaIrradTile|createGsaIrradLayer/);
  assert.match(app, /sliceId/);
  assert.match(app, /Lerc\.(load|decode)/);
  assert.match(app, /gis6\.uspatial\.umn\.edu/);
  assert.match(app, /\{z\}\/\{y\}\/\{x\}/);
  assert.match(app, /COLORMAP_IDS|COLORMAP_LAYER_IDS/);
  assert.match(app, /updateSiteMapLegend/);
  assert.match(app, /ensureLandChoropleth/);
  assert.match(app, /L\.geoJSON/);
  assert.doesNotMatch(app, /ensureLandColormap/);
  assert.doesNotMatch(app, /landIndexAt\(lat,\s*lon\)/);
  assert.doesNotMatch(app, /ghi-coarse/);
  assert.match(html, /id="siteMapLegend"/);
  assert.match(html, /vendor\/LercDecode\.js/);
  assert.match(html, /data\/land-prices\.js/);
  assert.match(html, /data\/land-admin\.js/);
  assert.doesNotMatch(html, /ghi-coarse/);
  assert.ok(html.indexOf('vendor/LercDecode.js') < html.indexOf('js/flowsheet-app.js'));
  assert.ok(html.indexOf('data/land-prices.js') < html.indexOf('js/flowsheet-app.js'));
  assert.match(css, /\.site-map-legend/);
  assert.match(css, /\.site-map-legend-ramp/);
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'data', 'ghi-coarse.json')));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'data', 'ghi-coarse.js')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'data', 'land-prices.json')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'data', 'land-admin.geojson')));
});
