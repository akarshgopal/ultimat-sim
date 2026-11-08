// Land price at a coordinate: the agricultural land $/ha record of the admin region containing
// it (or the nearest one within LAND_ADMIN_SNAP_KM). Data: data/land-prices.js (records, built by
// scripts/build-land-prices.mjs) and data/land-admin.js (region polygons). Used by
// scripts/build-sites.mjs to precompute site land prices; not loaded in the browser.
(function exposeLand(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoundryLand = api;
})(globalThis, () => {
const EARTH_RADIUS_KM = 6371.0088;
const LAND_ADMIN_SNAP_KM = 80;

function finiteNumber(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function distanceKm(from, to) {
  if (![from?.latitude, from?.longitude, to?.latitude, to?.longitude].every(Number.isFinite)) return Infinity;
  const toRad = value => value * Math.PI / 180;
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRad(to.longitude - from.longitude);
  const chord = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

function coordsFrom(latitude, longitude) {
  if (latitude && typeof latitude === 'object' && !Array.isArray(latitude)) {
    return {
      latitude: finiteNumber(latitude.latitude ?? latitude.lat),
      longitude: finiteNumber(latitude.longitude ?? latitude.lon ?? latitude.lng),
    };
  }
  return {
    latitude: finiteNumber(latitude),
    longitude: finiteNumber(longitude),
  };
}

function pointInRing(lon, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = finiteNumber(ring[i]?.[0]);
    const yi = finiteNumber(ring[i]?.[1]);
    const xj = finiteNumber(ring[j]?.[0]);
    const yj = finiteNumber(ring[j]?.[1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersect = ((yi > lat) !== (yj > lat))
      && (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon, lat, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates;
    if (!Array.isArray(rings) || !rings.length) return false;
    if (!pointInRing(lon, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i += 1) {
      if (pointInRing(lon, lat, rings[i])) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates;
    if (!Array.isArray(polys)) return false;
    return polys.some(rings => pointInPolygon(lon, lat, { type: 'Polygon', coordinates: rings }));
  }
  return false;
}

function minVertexDistanceKm(latitude, longitude, geometry) {
  let best = Infinity;
  function walk(coords) {
    if (!Array.isArray(coords) || !coords.length) return;
    if (typeof coords[0] === 'number') {
      const lon = finiteNumber(coords[0]);
      const lat = finiteNumber(coords[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      const km = distanceKm({ latitude, longitude }, { latitude: lat, longitude: lon });
      if (km < best) best = km;
      return;
    }
    for (const child of coords) walk(child);
  }
  walk(geometry?.coordinates);
  return best;
}

function pricedRecordForFeature(feature, bundle) {
  const record = landPriceById(feature?.properties?.id, bundle);
  if (record && Number.isFinite(record.usdPerHa) && record.usdPerHa > 0) return record;
  return null;
}

function getLandPricesBundle() {
  if (globalThis.LAND_PRICES && typeof globalThis.LAND_PRICES === 'object') return globalThis.LAND_PRICES;
  if (typeof require === 'function') {
    try { return require('../data/land-prices.js'); } catch { /* optional in browser */ }
  }
  return null;
}

function getLandAdminGeoJSON() {
  if (globalThis.LAND_ADMIN_GEOJSON && typeof globalThis.LAND_ADMIN_GEOJSON === 'object') {
    return globalThis.LAND_ADMIN_GEOJSON;
  }
  if (typeof require === 'function') {
    try { return require('../data/land-admin.js'); } catch { /* optional */ }
  }
  return null;
}

function landPriceIndex(bundle = getLandPricesBundle()) {
  const map = new Map();
  const records = bundle?.records;
  if (!Array.isArray(records)) return map;
  for (const record of records) {
    if (!record?.id) continue;
    map.set(record.id, record);
  }
  return map;
}

function landPriceById(id, bundle = getLandPricesBundle()) {
  if (!id) return null;
  return landPriceIndex(bundle).get(id) || null;
}

function landPriceAt(latitude, longitude, bundle = getLandPricesBundle(), admin = getLandAdminGeoJSON()) {
  const coords = coordsFrom(latitude, longitude);
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || coords.latitude < -90 || coords.latitude > 90) {
    return null;
  }
  const features = admin?.features;
  if (!Array.isArray(features) || !features.length) return null;
  let nearest = null;
  for (const feature of features) {
    if (pointInPolygon(coords.longitude, coords.latitude, feature?.geometry)) {
      return pricedRecordForFeature(feature, bundle);
    }
    const km = minVertexDistanceKm(coords.latitude, coords.longitude, feature?.geometry);
    if (!Number.isFinite(km) || km > LAND_ADMIN_SNAP_KM) continue;
    if (!nearest || km < nearest.km) nearest = { feature, km };
  }
  if (!nearest) return null;
  return pricedRecordForFeature(nearest.feature, bundle);
}

return { landPriceAt, landPriceById, landPriceIndex, getLandPricesBundle, getLandAdminGeoJSON, LAND_ADMIN_SNAP_KM };
});
