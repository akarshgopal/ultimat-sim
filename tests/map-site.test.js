const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  LAYER_SOURCES,
  COLORMAP_LAYER_IDS,
  GSA_GHI_RAMP,
  LAND_VALUE_RAMP,
  haToRadiusM,
  circlePolygon,
  waterAvailabilityScreening,
  pvScreeningBand,
  landValueScreening,
  networkPlantMarkers,
  ghiAt,
  ghiColor,
  landColor,
  landIndexAt,
  waterScreeningColor,
  isDeepOceanScreening,
  webMercatorToLatLng,
} = require('../engine/map-site');
const ghiCoarse = require('../data/ghi-coarse.json');

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

test('LAYER_SOURCES describes solar/water/land map-filling colormaps', () => {
  assert.deepEqual([...COLORMAP_LAYER_IDS], ['pvgis', 'water', 'land']);
  assert.equal(LAYER_SOURCES.land.id, 'land');
  assert.equal(LAYER_SOURCES.land.label, 'Land value');
  assert.equal(LAYER_SOURCES.land.kind, 'overlay');
  assert.equal(LAYER_SOURCES.land.quality, 'screening');
  assert.equal(LAYER_SOURCES.land.render, 'choropleth');
  assert.match(LAYER_SOURCES.land.colormap, /green/i);
  assert.match(LAYER_SOURCES.land.cite.label, /not cadastral|not transaction/i);
  assert.ok(LAYER_SOURCES.land.cite.url === null || /worldbank|fao/i.test(LAYER_SOURCES.land.cite.url));

  assert.equal(LAYER_SOURCES.pvgis.label, 'Solar GHI');
  assert.equal(LAYER_SOURCES.pvgis.render, 'colormap');
  assert.equal(LAYER_SOURCES.pvgis.quality, 'screening');
  assert.match(LAYER_SOURCES.pvgis.data, /ghi-coarse/);
  assert.match(LAYER_SOURCES.pvgis.overlayCite.label, /Global Solar Atlas|Solargis/i);
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

test('bundled GHI coarse grid is a screening field with GSA-like regional order', () => {
  assert.equal(ghiCoarse.quality, 'screening');
  assert.equal(ghiCoarse.ncols * ghiCoarse.nrows, ghiCoarse.values.length);
  assert.match(ghiCoarse.note, /not the Global Solar Atlas raster/i);
  const atacama = ghiAt(-24, -70);
  const sahara = ghiAt(23, 10);
  const amazon = ghiAt(3, -60);
  const oslo = ghiAt(59.9, 10.8);
  const almeria = ghiAt(36.834, -2.463);
  assert.ok(atacama > sahara);
  assert.ok(sahara > amazon);
  assert.ok(amazon > oslo);
  assert.ok(almeria > oslo);
  assert.ok(oslo < 3.2);
  assert.ok(atacama > 7);
  assert.equal(ghiAt(NaN), null);
  assert.equal(GSA_GHI_RAMP.length, 11);
  const cool = ghiColor(2);
  const hot = ghiColor(8);
  assert.match(cool, /rgb\(/);
  assert.match(hot, /rgb\(/);
  const coolParts = cool.match(/\d+/g).map(Number);
  const hotParts = hot.match(/\d+/g).map(Number);
  assert.ok(coolParts[2] > coolParts[0], 'low GHI is blue/cyan');
  assert.ok(hotParts[0] > hotParts[2], 'high GHI is orange/red');
});

test('land choropleth is pale-to-dark green and skips deep ocean', () => {
  const pale = landColor(0.15);
  const dark = landColor(0.9);
  const paleParts = pale.match(/\d+/g).map(Number);
  const darkParts = dark.match(/\d+/g).map(Number);
  assert.ok(paleParts[0] + paleParts[1] + paleParts[2] > darkParts[0] + darkParts[1] + darkParts[2]);
  assert.ok(darkParts[1] > darkParts[0], 'high land index stays green');
  assert.equal(LAND_VALUE_RAMP[0][1], '#f7fcf5');
  assert.equal(LAND_VALUE_RAMP[LAND_VALUE_RAMP.length - 1][1], '#00441b');
  assert.ok(landIndexAt(36.834, -2.463) > 0.6);
  assert.ok(landIndexAt(36.77, -2.81) > 0.6, 'El Ejido / Alboran coast is not treated as ocean');
  assert.equal(isDeepOceanScreening(38, 15), true);
  assert.equal(landIndexAt(38, 15), null);
  assert.equal(isDeepOceanScreening(36.834, -2.463), false);
  assert.match(waterScreeningColor('arid'), /#999|#999999/i);
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

test('site map solar/water/land overlays are colormaps, not L.circle rings', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'js/flowsheet-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'flowsheet.css'), 'utf8');
  assert.doesNotMatch(app, /radius:\s*14000/);
  assert.doesNotMatch(app, /radius:\s*22000/);
  assert.doesNotMatch(app, /radius:\s*30000/);
  assert.match(app, /GridLayer/);
  assert.match(app, /gis6\.uspatial\.umn\.edu/);
  assert.match(app, /\{z\}\/\{y\}\/\{x\}/);
  assert.match(app, /COLORMAP_IDS|COLORMAP_LAYER_IDS/);
  assert.match(app, /updateSiteMapLegend/);
  assert.match(html, /id="siteMapLegend"/);
  assert.match(html, /data\/ghi-coarse\.js/);
  assert.ok(html.indexOf('data/ghi-coarse.js') < html.indexOf('js/flowsheet-app.js'));
  assert.match(css, /\.site-map-legend/);
  assert.match(css, /\.site-map-legend-ramp/);
});
