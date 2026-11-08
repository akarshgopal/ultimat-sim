// Leaflet site map: layers, colormaps, GSA/LERC tiles, legend, overlays.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.defineProperties(app, {
    MapSite: { get: () => MapSite, enumerable: true },
  });
  Object.assign(app, {
    readMapCoordinates, renderSiteMap, syncMapLayerChipState, syncSiteMapFromInputs,
    updateSiteMapOverlays,
  });

  const MapSite = typeof FlowsheetMapSite !== 'undefined' ? FlowsheetMapSite : null;

  function readMapCoordinates() {
    const latitude = Number(document.getElementById('siteLatitude')?.value);
    const longitude = Number(document.getElementById('siteLongitude')?.value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90) return null;
    let lon = longitude;
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return { latitude, longitude: lon };
  }

  function siteMapStatus(text) {
    const status = document.getElementById('siteMapStatus');
    if (status && text) status.textContent = text;
  }

  function showSiteMapUnavailable(message) {
    const mapEl = document.getElementById('siteMap');
    const emptyEl = document.getElementById('siteMapEmpty');
    if (mapEl) mapEl.hidden = true;
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = message;
    }
  }

  function showSiteMapAvailable() {
    const mapEl = document.getElementById('siteMap');
    const emptyEl = document.getElementById('siteMapEmpty');
    if (mapEl) mapEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
  }

  function layerCiteHtml(source) {
    if (!source?.cite) return '';
    if (source.cite.url) {
      return `<a href="${source.cite.url}" target="_blank" rel="noreferrer">${source.cite.label}</a>`;
    }
    return source.cite.label || '';
  }

  const MAP_LAYER_UI = Object.freeze({
    osm: Object.freeze({ label: 'Basemap OSM', tone: 'basemap' }),
    pvgis: Object.freeze({ label: 'Solar (GHI)', tone: 'solar' }),
    water: Object.freeze({ label: 'Water', tone: 'water' }),
    land: Object.freeze({ label: 'Land value', tone: 'land' }),
    footprint: Object.freeze({ label: 'Footprint', tone: 'footprint' }),
    network: Object.freeze({ label: 'Network', tone: 'network' }),
  });
  const COLORMAP_IDS = MapSite?.COLORMAP_LAYER_IDS || ['pvgis', 'water', 'land'];

  function renderSiteMapLayerToggles() {
    const el = document.getElementById('siteMapLayers');
    if (!el || app.siteMapLayersReady) return;
    const sources = MapSite?.LAYER_SOURCES;
    if (!sources) {
      el.innerHTML = '';
      app.siteMapLayersReady = true;
      return;
    }
    const order = ['pvgis', 'water', 'land', 'footprint', 'network', 'osm'];
    const ids = order.filter(id => sources[id]).concat(Object.keys(sources).filter(id => !order.includes(id)));
    el.innerHTML = ids.map(id => {
      const source = sources[id];
      if (source.available === false) return '';
      const ui = MAP_LAYER_UI[id] || { label: source.label, tone: id };
      const checked = app.siteMapEnabled[id] ? ' checked' : '';
      const on = app.siteMapEnabled[id] ? ' is-on' : '';
      const citeText = source.cite?.label || '';
      const title = citeText.replace(/"/g, '&quot;');
      return `<label class="map-layer-chip map-layer-chip--${ui.tone}${on}" title="${title}"><input type="checkbox" data-layer="${id}"${checked}><span class="map-layer-dot" aria-hidden="true"></span><span class="map-layer-label">${ui.label}</span></label>`;
    }).join('');
    app.siteMapLayersReady = true;
  }

  function syncMapLayerChipState() {
    const root = document.getElementById('siteMapLayers');
    const labels = root?.querySelectorAll?.('.map-layer-chip') || [];
    for (const label of labels) {
      const input = label.querySelector?.('input');
      label.classList?.toggle?.('is-on', !!(input && input.checked));
    }
  }

  function clearSiteMapLayer(id) {
    const layer = app.siteMapOverlays[id];
    if (layer && app.siteMap) {
      try { app.siteMap.removeLayer(layer); } catch { /* already removed */ }
    }
    app.siteMapOverlays[id] = null;
    if (id === 'footprint') app.siteMapFootprintById = {};
  }

  function showSiteMapLayer(id) {
    const layer = app.siteMapOverlays[id];
    if (!layer || !app.siteMap) return;
    if (!app.siteMap.hasLayer(layer)) layer.addTo(app.siteMap);
  }

  function hideSiteMapLayer(id) {
    const layer = app.siteMapOverlays[id];
    if (!layer || !app.siteMap) return;
    if (app.siteMap.hasLayer(layer)) app.siteMap.removeLayer(layer);
  }

  function latLngForColormapTile(coords, px, py, tileSize) {
    if (MapSite?.webMercatorToLatLng) return MapSite.webMercatorToLatLng(coords.z, coords.x, coords.y, px, py, tileSize);
    const n = 2 ** coords.z;
    const mercX = (coords.x + px / tileSize) / n;
    const mercY = (coords.y + py / tileSize) / n;
    return {
      latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * mercY))) * 180 / Math.PI,
      longitude: mercX * 360 - 180,
    };
  }

  function paintScreeningColormap(canvas, coords, valueAt, colorAt, cells = 32) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const stepX = width / cells;
    const stepY = height / cells;
    for (let iy = 0; iy < cells; iy += 1) {
      for (let ix = 0; ix < cells; ix += 1) {
        const ll = latLngForColormapTile(coords, (ix + 0.5) * stepX, (iy + 0.5) * stepY, width);
        const value = valueAt(ll.latitude, ll.longitude);
        if (value == null || value === false) continue;
        const color = colorAt(value);
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(ix * stepX), Math.floor(iy * stepY), Math.ceil(stepX) + 1, Math.ceil(stepY) + 1);
      }
    }
  }

  function createScreeningColormapLayer(valueAt, colorAt, className) {
    if (typeof L === 'undefined' || typeof L.GridLayer !== 'function') return null;
    const Layer = L.GridLayer.extend({
      createTile(coords) {
        const size = this.getTileSize();
        const canvas = L.DomUtil.create('canvas', 'leaflet-tile');
        canvas.width = size.x;
        canvas.height = size.y;
        paintScreeningColormap(canvas, coords, valueAt, colorAt);
        return canvas;
      },
    });
    return new Layer({
      pane: 'overlayPane',
      opacity: 0.62,
      className: className || 'site-map-colormap',
      keepBuffer: 1,
    });
  }

  function punchNearBlack(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 18 && data[i + 1] < 18 && data[i + 2] < 18) data[i + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);
    } catch { /* tainted canvas; leave the raw tile */ }
  }

  function createAqueductBwsLayer() {
    if (typeof L === 'undefined' || typeof L.GridLayer !== 'function') return null;
    const src = MapSite?.LAYER_SOURCES?.water;
    const template = src?.url || 'https://gis6.uspatial.umn.edu/arcgis/rest/services/SCOPE/WRI_Aqueducts_Baseline_water_stress/MapServer/tile/{z}/{y}/{x}';
    const maxNative = src?.maxNativeZoom || 9;
    const Layer = L.GridLayer.extend({
      createTile(coords, done) {
        const size = this.getTileSize();
        const canvas = L.DomUtil.create('canvas', 'leaflet-tile');
        canvas.width = size.x;
        canvas.height = size.y;
        const url = template.replace('{z}', coords.z).replace('{y}', coords.y).replace('{x}', coords.x);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, size.x, size.y);
            punchNearBlack(canvas);
          }
          done(null, canvas);
        };
        img.onerror = () => {
          paintScreeningColormap(
            canvas,
            coords,
            (lat, lon) => MapSite.waterAvailabilityScreening(lat, lon).band,
            band => MapSite.waterScreeningColor(band),
            24,
          );
          done(null, canvas);
        };
        img.src = url;
        return canvas;
      },
    });
    return new Layer({
      pane: 'overlayPane',
      opacity: src?.opacity ?? 0.72,
      maxNativeZoom: maxNative,
      maxZoom: 19,
      className: 'site-map-colormap site-map-colormap--water',
      keepBuffer: 1,
    });
  }

  let lercLoadPromise = null;
  const gsaTileCache = new Map();

  function ensureLercLoaded() {
    if (typeof Lerc === 'undefined' || typeof Lerc.load !== 'function') {
      return Promise.reject(new Error('Lerc decoder unavailable'));
    }
    if (Lerc.isLoaded?.()) return Promise.resolve();
    if (!lercLoadPromise) {
      lercLoadPromise = Lerc.load({
        locateFile(fileName, scriptDir) {
          if (scriptDir) return `${scriptDir}${fileName}`;
          return `vendor/${fileName}`;
        },
      }).catch(err => {
        lercLoadPromise = null;
        throw err;
      });
    }
    return lercLoadPromise;
  }

  function gsaTileUrl(z, y, x) {
    const template = MapSite?.LAYER_SOURCES?.pvgis?.url || MapSite?.GSA_IRRAD?.tileUrl
      || 'https://tiledimageservices.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/GSA_IRRAD/ImageServer/tile/{z}/{y}/{x}?sliceId=2';
    return template.replace('{z}', z).replace('{y}', y).replace('{x}', x);
  }

  function fetchGsaLercTile(z, y, x) {
    const key = `${z}/${y}/${x}`;
    if (gsaTileCache.has(key)) return gsaTileCache.get(key);
    const pending = (async () => {
      try {
        await ensureLercLoaded();
        const response = await fetch(gsaTileUrl(z, y, x));
        if (!response.ok) return null;
        const buffer = await response.arrayBuffer();
        if (!buffer || !buffer.byteLength) return null;
        return Lerc.decode(buffer);
      } catch {
        return null;
      }
    })();
    gsaTileCache.set(key, pending);
    if (gsaTileCache.size > 96) {
      const first = gsaTileCache.keys().next().value;
      gsaTileCache.delete(first);
    }
    return pending;
  }

  async function paintGsaIrradTile(canvas, coords) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !MapSite) return;
    const width = canvas.width;
    const height = canvas.height;
    const nw = latLngForColormapTile(coords, 0, 0, width);
    const se = latLngForColormapTile(coords, width, height, width);
    const north = Math.max(nw.latitude, se.latitude);
    const south = Math.min(nw.latitude, se.latitude);
    const west = Math.min(nw.longitude, se.longitude);
    const east = Math.max(nw.longitude, se.longitude);
    const midLat = (north + south) / 2;
    if (north < (MapSite.GSA_IRRAD?.latMin ?? -60) || south > (MapSite.GSA_IRRAD?.latMax ?? 65)) return;

    const gsaZ = MapSite.gsaZoomForMapZoom(coords.z, midLat);
    const covers = MapSite.gsaCoveringTiles(south, west, north, east, gsaZ);
    if (!covers.length) return;

    const decodedByKey = new Map();
    await Promise.all(covers.map(async tile => {
      const decoded = await fetchGsaLercTile(tile.z, tile.y, tile.x);
      if (decoded) decodedByKey.set(`${tile.z}/${tile.y}/${tile.x}`, { tile, decoded });
    }));
    if (!decodedByKey.size) return;

    const image = ctx.createImageData(width, height);
    const data = image.data;
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const ll = latLngForColormapTile(coords, px + 0.5, py + 0.5, width);
        if (ll.latitude < (MapSite.GSA_IRRAD?.latMin ?? -60) || ll.latitude > (MapSite.GSA_IRRAD?.latMax ?? 65)) continue;
        const idx = MapSite.gsaTileXY(ll.latitude, ll.longitude, gsaZ);
        if (!idx) continue;
        const entry = decodedByKey.get(`${idx.z}/${idx.y}/${idx.x}`);
        if (!entry) continue;
        const value = MapSite.sampleGsaDecoded(entry.decoded, idx.z, idx.y, idx.x, ll.latitude, ll.longitude);
        if (value == null) continue;
        const rgb = MapSite.ghiColorRgb(value);
        if (!rgb) continue;
        const o = (py * width + px) * 4;
        data[o] = rgb[0];
        data[o + 1] = rgb[1];
        data[o + 2] = rgb[2];
        data[o + 3] = 168;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function createGsaIrradLayer() {
    if (typeof L === 'undefined' || typeof L.GridLayer !== 'function') return null;
    const Layer = L.GridLayer.extend({
      createTile(coords, done) {
        const size = this.getTileSize();
        const canvas = L.DomUtil.create('canvas', 'leaflet-tile');
        canvas.width = size.x;
        canvas.height = size.y;
        paintGsaIrradTile(canvas, coords).then(
          () => done(null, canvas),
          () => done(null, canvas),
        );
        return canvas;
      },
    });
    return new Layer({
      pane: 'overlayPane',
      opacity: 0.85,
      maxZoom: 19,
      maxNativeZoom: MapSite?.GSA_IRRAD?.maxZoom || 8,
      className: 'site-map-colormap site-map-colormap--solar',
      keepBuffer: 1,
    });
  }

  function ensureSolarColormap() {
    if (!MapSite) return;
    if (!app.siteMapOverlays.pvgis) {
      try {
        app.siteMapOverlays.pvgis = createGsaIrradLayer();
      } catch {
        app.siteMapOverlays.pvgis = null;
        siteMapStatus('Global Solar Atlas LERC tiles failed to initialize.');
      }
    }
    if (app.siteMapOverlays.pvgis) showSiteMapLayer('pvgis');
  }

  function ensureWaterColormap() {
    if (!MapSite) return;
    if (!app.siteMapOverlays.water) {
      try {
        app.siteMapOverlays.water = createAqueductBwsLayer();
      } catch {
        app.siteMapOverlays.water = createScreeningColormapLayer(
          (lat, lon) => MapSite.waterAvailabilityScreening(lat, lon).band,
          band => MapSite.waterScreeningColor(band),
          'site-map-colormap site-map-colormap--water',
        );
        siteMapStatus('Aqueduct BWS tiles unavailable; showing water screening colormap.');
      }
    }
    if (app.siteMapOverlays.water) showSiteMapLayer('water');
  }

  function ensureLandChoropleth() {
    if (!app.siteMap || typeof L === 'undefined' || !MapSite) return;
    if (app.siteMapOverlays.land) {
      showSiteMapLayer('land');
      return;
    }
    const geojson = MapSite.getLandAdminGeoJSON?.() || globalThis.LAND_ADMIN_GEOJSON;
    const prices = MapSite.getLandPricesBundle?.() || globalThis.LAND_PRICES;
    if (!geojson?.features?.length) {
      siteMapStatus('Land admin polygons missing; land choropleth unavailable.');
      return;
    }
    const layer = L.geoJSON(geojson, {
      style(feature) {
        return MapSite.landChoroplethStyle(feature, prices);
      },
      onEachFeature(feature, lyr) {
        const id = feature?.properties?.id;
        const record = MapSite.landPriceById?.(id, prices);
        const name = feature?.properties?.name || id || 'Unknown';
        if (record) {
          const usd = Math.round(record.usdPerHa).toLocaleString('en-US');
          const src = record.source || 'official agricultural land value';
          lyr.bindPopup(`${name}<br><strong>$${usd}/ha</strong> (${record.year})<br><small>${src}</small>`);
        } else {
          lyr.bindPopup(`${name}<br><small>No published agricultural land value in the bundled sources</small>`);
        }
      },
      pane: 'overlayPane',
      className: 'site-map-land-choropleth',
    });
    app.siteMapOverlays.land = layer;
    showSiteMapLayer('land');
  }

  function updateSiteMapLegend() {

    const el = document.getElementById('siteMapLegend');
    if (!el) return;
    const active = COLORMAP_IDS.find(id => app.siteMapEnabled[id]);
    if (!active || !MapSite) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.dataset.layer = active;
    const title = document.getElementById('siteMapLegendTitle');
    const ramp = document.getElementById('siteMapLegendRamp');
    const labels = document.getElementById('siteMapLegendLabels');
    const citeEl = document.getElementById('siteMapLegendCite');
    const source = MapSite.LAYER_SOURCES[active];
    const shortSwatch = label => {
      const text = String(label || '');
      if (/arid/i.test(text)) return 'Arid';
      if (/extremely/i.test(text)) return '>80%';
      if (/high/i.test(text)) return '40–80%';
      return text.length > 16 ? `${text.slice(0, 14)}…` : text;
    };
    if (active === 'pvgis') {
      if (title) title.textContent = 'GHI';
      const stops = MapSite.GSA_GHI_RAMP || [];
      if (ramp) {
        ramp.className = 'site-map-legend-ramp is-continuous';
        ramp.innerHTML = stops.map(([, color]) => `<span style="background:${color}"></span>`).join('');
      }
      if (labels) labels.innerHTML = '<span>700</span><span>1500</span><span>2200</span><span>3000</span>';
      if (citeEl) {
        citeEl.innerHTML = `<span class="site-map-source-name">Annual GHI, kWh/m²·year — Global Solar Atlas</span>${layerCiteHtml(source?.overlayCite ? { cite: source.overlayCite } : source)}`;
      }
    } else if (active === 'water') {
      if (title) title.textContent = 'Water stress';
      const items = source?.legend || [];
      if (ramp) {
        ramp.className = 'site-map-legend-ramp is-swatches';
        ramp.innerHTML = items.map(item => `<span class="site-map-legend-swatch"><i style="background:${item.color}"></i>${shortSwatch(item.label)}</span>`).join('');
      }
      if (labels) labels.innerHTML = '';
      if (citeEl) {
        const full = items.map(item => item.label).filter(Boolean).join(' · ');
        citeEl.innerHTML = `<span class="site-map-source-name">Baseline water stress${full ? ` — ${full}` : ''}</span>${layerCiteHtml(source)}`;
      }
    } else if (active === 'land') {
      if (title) title.textContent = 'Land value';
      const stops = MapSite.LAND_USD_HA_RAMP || source?.legend || [];
      if (ramp) {
        ramp.className = 'site-map-legend-ramp is-continuous';
        const colors = Array.isArray(stops[0]) ? stops.map(([, color]) => color) : stops.map(item => item.color);
        ramp.innerHTML = colors.map(color => `<span style="background:${color}"></span>`).join('');
      }
      if (labels) {
        labels.innerHTML = '<span>$2k</span><span>$10k</span><span>$40k</span><span>$80k+</span>';
      }
      if (citeEl) {
        const cites = source?.cites || [];
        const links = cites.length
          ? cites.map(c => (c.url ? `<a href="${c.url}" target="_blank" rel="noreferrer">${c.label}</a>` : c.label)).join(' · ')
          : layerCiteHtml(source);
        citeEl.innerHTML = `<span class="site-map-source-name">Agricultural land value, USD/ha</span>${links}`;
      }
    }
  }

  function initSiteMap() {
    const mapEl = document.getElementById('siteMap');
    if (!mapEl || app.siteMap || app.siteMapFailed) return app.siteMap;
    if (typeof L === 'undefined') {
      app.siteMapFailed = true;
      showSiteMapUnavailable('Map library failed to load. Enter latitude and longitude, then Apply location.');
      siteMapStatus('Leaflet is unavailable. Coordinates still apply; site meteo, assay, and rights stay in this panel.');
      return null;
    }
    try {
      const start = readMapCoordinates() || { latitude: 36.834, longitude: -2.463 };
      app.siteMap = L.map(mapEl, {
        zoomControl: false,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      app.siteMap.setView([start.latitude, start.longitude], 10, { animate: false });
      L.control.zoom({ position: 'bottomright' }).addTo(app.siteMap);
      const osm = MapSite?.LAYER_SOURCES?.osm;
      app.siteMapOverlays.osm = L.tileLayer(osm?.url || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: osm?.attribution || '&copy; OpenStreetMap',
        maxZoom: osm?.maxZoom || 19,
      }).addTo(app.siteMap);
      app.siteMapOverlays.osm.on('tileerror', () => {
        if (app.siteMapTilesFailed) return;
        app.siteMapTilesFailed = true;
        siteMapStatus('Basemap tiles failed to load. Click-to-site still works; screening overlays remain.');
      });
      const icon = L.divIcon({
        className: 'site-map-marker-wrap',
        html: '<span class="site-map-marker-dot"></span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      app.siteMapMarker = L.marker([start.latitude, start.longitude], { icon, keyboard: false }).addTo(app.siteMap);
      app.siteMap.on('click', event => {
        const latlng = event?.latlng;
        if (!latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) return;
        const latInput = document.getElementById('siteLatitude');
        const lonInput = document.getElementById('siteLongitude');
        if (latInput) latInput.value = Number(latlng.lat).toFixed(3);
        if (lonInput) lonInput.value = Number(latlng.lng).toFixed(3);
        try {
          app.siteMapMarker?.setLatLng([latlng.lat, latlng.lng]);
          updateSiteMapOverlays();
        } catch { /* overlays are optional while PVGIS fetches */ }
        app.applyCoordinates();
      });
      app.siteMap.on('zoomend', () => {
        try { app.refreshFootprintLabels(); } catch { /* labels are optional */ }
      });
      showSiteMapAvailable();
      return app.siteMap;
    } catch {
      app.siteMapFailed = true;
      app.siteMap = null;
      showSiteMapUnavailable('Map failed to initialize. Enter latitude and longitude, then Apply location.');
      siteMapStatus('The map could not start. Coordinates, PVGIS fetch, and site truth panels still work.');
      return null;
    }
  }

  function syncSiteMapFromInputs() {
    const coords = readMapCoordinates();
    if (!coords || !app.siteMap) return;
    try {
      app.siteMapMarker?.setLatLng([coords.latitude, coords.longitude]);
      const zoom = app.siteMap.getZoom?.() || 10;
      app.siteMap.setView([coords.latitude, coords.longitude], zoom, { animate: false });
    } catch { /* leaflet unavailable mid-update */ }
  }

  function updateSiteMapOverlays() {
    const footprint = app.currentSiteFootprint();
    if (!app.siteMap || typeof L === 'undefined') {
      app.syncFootprintMapChrome(footprint);
      return;
    }
    const coords = readMapCoordinates();
    if (!coords) {
      app.syncFootprintMapChrome(footprint);
      return;
    }

    if (app.siteMapOverlays.osm) {
      if (app.siteMapEnabled.osm) {
        if (!app.siteMap.hasLayer(app.siteMapOverlays.osm)) app.siteMapOverlays.osm.addTo(app.siteMap);
      } else if (app.siteMap.hasLayer(app.siteMapOverlays.osm)) {
        app.siteMap.removeLayer(app.siteMapOverlays.osm);
      }
    }

    try {
      for (const id of COLORMAP_IDS) {
        if (!app.siteMapEnabled[id]) hideSiteMapLayer(id);
      }
      if (app.siteMapEnabled.pvgis && MapSite) ensureSolarColormap();
      else if (app.siteMapEnabled.water && MapSite) ensureWaterColormap();
      else if (app.siteMapEnabled.land && MapSite) ensureLandChoropleth();
      updateSiteMapLegend();
    } catch {
      siteMapStatus('Colormap overlay failed. Coordinates, footprint, and network markers still work.');
    }

    clearSiteMapLayer('footprint');
    if (app.siteMapEnabled.footprint && MapSite && footprint && footprint.totalAreaM2 > 0 && typeof L.polygon === 'function') {
      const campus = typeof MapSite.layoutFootprintCampus === 'function'
        ? MapSite.layoutFootprintCampus({
          latitude: coords.latitude,
          longitude: coords.longitude,
          solar: footprint.solar,
          processes: footprint.processes,
          totalHa: footprint.totalHa,
        })
        : [];
      if (campus.length && typeof L.layerGroup === 'function') {
        const group = L.layerGroup();
        for (const block of campus) {
          if (!block.ring?.length) continue;
          const isOutline = block.kind === 'outline';
          const isSolar = block.kind === 'solar';
          const color = app.footprintColor(block.unit, { cssVar: false });
          const poly = L.polygon(block.ring, {
            color: isOutline ? '#e7eef6' : '#0b1016',
            weight: isOutline ? 2.25 : 1.75,
            opacity: 0.95,
            dashArray: isOutline ? '7 4' : null,
            fillColor: isOutline ? '#9aafc4' : color,
            fillOpacity: isOutline ? 0.14 : isSolar ? 0.58 : 0.78,
            interactive: true,
          });
          poly.__footprintBlock = block;
          poly.bindPopup(app.footprintPopupHtml(block));
          app.bindFootprintTooltip(poly, block);
          poly.addTo(group);
          if (block.id) app.siteMapFootprintById[block.id] = poly;
        }
        group.addTo(app.siteMap);
        app.siteMapOverlays.footprint = group;
      }
    }
    app.syncFootprintMapChrome(footprint);

    clearSiteMapLayer('network');
    if (app.siteMapEnabled.network && MapSite) {
      const markers = MapSite.networkPlantMarkers(app.networkResult || app.network);
      const group = L.layerGroup();
      for (const plant of markers) {
        const marker = L.circleMarker([plant.latitude, plant.longitude], {
          radius: 6,
          color: '#6ba177',
          weight: 2,
          fillColor: '#6ba177',
          fillOpacity: 0.9,
        });
        marker.bindPopup(`${plant.name}${plant.landHa ? ` · ${app.formatHa(plant.landHa)}` : ''}`);
        marker.on('click', () => {
          if (plant.id && app.network.plants.some(item => item.id === plant.id)) app.openNetworkPlant(plant.id);
        });
        marker.addTo(group);
        if (plant.polygon?.length) {
          L.polygon(plant.polygon, {
            color: '#6ba177',
            weight: 1,
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(group);
        }
      }
      group.addTo(app.siteMap);
      app.siteMapOverlays.network = group;
    }

    if (app.siteMapMarker?.bringToFront) app.siteMapMarker.bringToFront();
  }

  function renderSiteMap() {
    renderSiteMapLayerToggles();
    const coords = readMapCoordinates();
    if (!coords) {
      if (typeof L === 'undefined') {
        app.siteMapFailed = true;
        showSiteMapUnavailable('Map library failed to load. Enter latitude and longitude, then Apply location.');
      }
      return;
    }
    initSiteMap();
    if (!app.siteMap) return;
    showSiteMapAvailable();
    try {
      app.siteMapMarker?.setLatLng([coords.latitude, coords.longitude]);
      const current = app.siteMap.getCenter?.();
      const moved = !current
        || Math.abs(current.lat - coords.latitude) > 0.0005
        || Math.abs(current.lng - coords.longitude) > 0.0005;
      if (moved) app.siteMap.setView([coords.latitude, coords.longitude], app.siteMap.getZoom?.() || 10, { animate: false });
      updateSiteMapOverlays();
      if (app.activeTab === 'location') app.scheduleMapInvalidate();
    } catch {
      siteMapStatus('Map overlay update failed. Latitude/longitude and Apply location still work.');
    }
  }
})();
