(function exposeMapSite(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetMapSite = api;
})(globalThis, () => {
const SQM_PER_HA = 10000;
const EARTH_RADIUS_KM = 6371.0088;
const METERS_PER_DEG_LAT = 111319.9;
const DEFAULT_POLYGON_STEPS = 32;
const COASTAL_SEAWATER_KM = 80;
const INLAND_BRINE_KM = 50;

// Screening water bodies: named basins with an equivalent-circle radius, not shorelines.
// accessKm = max(0, haversine − radius). Used only for map-layer screening.
const WATER_BODIES = Object.freeze([
  { id: 'alboran', name: 'Alboran Sea', kind: 'seawater', latitude: 36.5, longitude: -3.0, radiusKm: 140 },
  { id: 'mediterranean', name: 'Mediterranean Sea', kind: 'seawater', latitude: 38.0, longitude: 15.0, radiusKm: 700 },
  { id: 'dead-sea', name: 'Dead Sea', kind: 'brine', latitude: 31.45, longitude: 35.5, radiusKm: 45 },
  { id: 'red-sea', name: 'Red Sea', kind: 'seawater', latitude: 20.0, longitude: 38.5, radiusKm: 450 },
  { id: 'persian-gulf', name: 'Persian Gulf', kind: 'seawater', latitude: 26.5, longitude: 51.5, radiusKm: 350 },
  { id: 'caspian', name: 'Caspian Sea', kind: 'brine', latitude: 42.0, longitude: 50.5, radiusKm: 450 },
  { id: 'black-sea', name: 'Black Sea', kind: 'seawater', latitude: 43.0, longitude: 34.0, radiusKm: 350 },
  { id: 'north-sea', name: 'North Sea', kind: 'seawater', latitude: 56.0, longitude: 3.0, radiusKm: 400 },
  { id: 'baltic', name: 'Baltic Sea', kind: 'seawater', latitude: 58.0, longitude: 20.0, radiusKm: 350 },
  { id: 'atlantic-west-europe', name: 'Northeast Atlantic', kind: 'seawater', latitude: 45.0, longitude: -10.0, radiusKm: 700 },
  { id: 'atlantic-iberia', name: 'Iberian Atlantic', kind: 'seawater', latitude: 38.0, longitude: -10.0, radiusKm: 250 },
  { id: 'canary', name: 'Canary / NW Africa', kind: 'seawater', latitude: 28.0, longitude: -16.0, radiusKm: 250 },
  { id: 'gulf-of-guinea', name: 'Gulf of Guinea', kind: 'seawater', latitude: 3.0, longitude: 3.0, radiusKm: 500 },
  { id: 'caribbean', name: 'Caribbean Sea', kind: 'seawater', latitude: 15.0, longitude: -75.0, radiusKm: 700 },
  { id: 'gulf-of-mexico', name: 'Gulf of Mexico', kind: 'seawater', latitude: 25.0, longitude: -90.0, radiusKm: 500 },
  { id: 'california', name: 'California Current', kind: 'seawater', latitude: 34.0, longitude: -121.0, radiusKm: 250 },
  { id: 'atacama-coast', name: 'Atacama Pacific', kind: 'seawater', latitude: -23.0, longitude: -71.0, radiusKm: 180 },
  { id: 'amazon-mouth', name: 'Amazon mouth', kind: 'seawater', latitude: 0.5, longitude: -48.0, radiusKm: 250 },
  { id: 'argentina', name: 'Southwest Atlantic', kind: 'seawater', latitude: -38.0, longitude: -56.0, radiusKm: 400 },
  { id: 'cape', name: 'Benguela / Cape', kind: 'seawater', latitude: -33.0, longitude: 17.0, radiusKm: 250 },
  { id: 'arabian-sea', name: 'Arabian Sea', kind: 'seawater', latitude: 18.0, longitude: 65.0, radiusKm: 700 },
  { id: 'bay-of-bengal', name: 'Bay of Bengal', kind: 'seawater', latitude: 16.0, longitude: 88.0, radiusKm: 600 },
  { id: 'south-china-sea', name: 'South China Sea', kind: 'seawater', latitude: 15.0, longitude: 115.0, radiusKm: 700 },
  { id: 'east-china', name: 'East China Sea', kind: 'seawater', latitude: 30.0, longitude: 125.0, radiusKm: 400 },
  { id: 'japan', name: 'Sea of Japan', kind: 'seawater', latitude: 40.0, longitude: 135.0, radiusKm: 400 },
  { id: 'australia-west', name: 'West Australia', kind: 'seawater', latitude: -32.0, longitude: 114.0, radiusKm: 250 },
  { id: 'australia-east', name: 'East Australia', kind: 'seawater', latitude: -34.0, longitude: 152.0, radiusKm: 250 },
  { id: 'great-lakes', name: 'North American Great Lakes', kind: 'freshwater', latitude: 45.0, longitude: -83.0, radiusKm: 350 },
]);

const COLORMAP_LAYER_IDS = Object.freeze(['pvgis', 'water', 'land']);

// GSA / Solargis DNI-style ramp (kWh/m²·day). Used for the screening GHI colormap.
const GSA_GHI_RAMP = Object.freeze([
  Object.freeze([0, '#394b68']),
  Object.freeze([1, '#2c7bb6']),
  Object.freeze([2, '#00a6ca']),
  Object.freeze([3, '#00ccbc']),
  Object.freeze([4, '#90eb9d']),
  Object.freeze([5, '#ffff8c']),
  Object.freeze([6, '#f9d057']),
  Object.freeze([7, '#f29e2e']),
  Object.freeze([8, '#e76818']),
  Object.freeze([9, '#d7191c']),
  Object.freeze([10, '#c51b7d']),
]);

// Pale → dark green land-cost index. Not cadastral, not a sale price.
const LAND_VALUE_RAMP = Object.freeze([
  Object.freeze([0, '#f7fcf5']),
  Object.freeze([0.2, '#e5f5e0']),
  Object.freeze([0.4, '#c7e9c0']),
  Object.freeze([0.6, '#74c476']),
  Object.freeze([0.8, '#238b45']),
  Object.freeze([1, '#00441b']),
]);

const LAYER_SOURCES = Object.freeze({
  osm: Object.freeze({
    id: 'osm',
    label: 'OSM',
    kind: 'basemap',
    quality: 'cited',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    cite: Object.freeze({
      label: '© OpenStreetMap contributors',
      url: 'https://www.openstreetmap.org/copyright',
    }),
  }),
  pvgis: Object.freeze({
    id: 'pvgis',
    label: 'Solar GHI',
    kind: 'overlay',
    quality: 'screening',
    render: 'colormap',
    colormap: 'gsa-ghi',
    data: 'data/ghi-coarse.json',
    url: 'https://re.jrc.ec.europa.eu/pvg_tools/en/',
    api: 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat={lat}&lon={lon}&peakpower=1&loss=14&angle=30&aspect=0&outputformat=json',
    cite: Object.freeze({
      label: 'JRC PVGIS',
      url: 'https://re.jrc.ec.europa.eu/pvg_tools/en/',
    }),
    overlayCite: Object.freeze({
      label: 'GHI colormap after Global Solar Atlas / Solargis. Screening field, not the GSA raster.',
      url: 'https://globalsolaratlas.info/',
    }),
  }),
  water: Object.freeze({
    id: 'water',
    label: 'Aqueduct BWS',
    kind: 'overlay',
    quality: 'cited',
    render: 'tiles',
    tileScheme: 'arcgis-zyx',
    url: 'https://gis6.uspatial.umn.edu/arcgis/rest/services/SCOPE/WRI_Aqueducts_Baseline_water_stress/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 9,
    opacity: 0.72,
    fallback: 'screening-grid',
    cite: Object.freeze({
      label: 'WRI Aqueduct Baseline Water Stress via UMN SCOPE MapServer (CC BY 4.0)',
      url: 'https://www.wri.org/data/aqueduct-water-risk-atlas',
    }),
    legend: Object.freeze([
      Object.freeze({ label: 'Arid and low water use', color: '#999999' }),
      Object.freeze({ label: 'High 40–80%', color: '#ff1500' }),
      Object.freeze({ label: 'Extremely high >80%', color: '#990000' }),
    ]),
  }),
  land: Object.freeze({
    id: 'land',
    label: 'Land value',
    kind: 'overlay',
    quality: 'screening',
    render: 'choropleth',
    colormap: 'pale-dark-green',
    url: 'https://www.worldbank.org/en/topic/land',
    cite: Object.freeze({
      label: 'Screening land-cost index (not cadastral / not transaction data)',
      url: 'https://www.worldbank.org/en/topic/land',
    }),
  }),
  footprint: Object.freeze({
    id: 'footprint',
    label: 'Site footprint',
    kind: 'overlay',
    quality: 'assumption',
    source: 'estimateFootprint',
    cite: Object.freeze({
      label: 'estimateFootprint: panel area ÷ location-aware GCR plus process pads',
      url: 'https://www.nrel.gov/docs/fy13osti/56290.pdf',
    }),
  }),
  network: Object.freeze({
    id: 'network',
    label: 'Network markers',
    kind: 'overlay',
    quality: 'derived',
    cite: Object.freeze({
      label: 'Sited network plants (coordinates from each plant site)',
      url: null,
    }),
  }),
});

function finiteNumber(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function haToRadiusM(ha) {
  const areaM2 = Math.max(0, finiteNumber(ha, 0)) * SQM_PER_HA;
  if (!(areaM2 > 0)) return 0;
  return Math.sqrt(areaM2 / Math.PI);
}

function circlePolygon(latitude, longitude, radiusM, steps = DEFAULT_POLYGON_STEPS) {
  const coords = coordsFrom(latitude, longitude);
  const radius = Math.max(0, finiteNumber(radiusM, 0));
  const count = Math.max(8, Math.min(128, Math.round(finiteNumber(steps, DEFAULT_POLYGON_STEPS))));
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || coords.latitude < -90 || coords.latitude > 90) {
    return [];
  }
  if (!(radius > 0)) return [];
  const latRad = coords.latitude * Math.PI / 180;
  const metersPerDegLon = Math.max(METERS_PER_DEG_LAT * Math.cos(latRad), 1e-6);
  const ring = [];
  for (let i = 0; i <= count; i += 1) {
    const angle = (i / count) * 2 * Math.PI;
    const eastM = radius * Math.cos(angle);
    const northM = radius * Math.sin(angle);
    ring.push([
      coords.latitude + northM / METERS_PER_DEG_LAT,
      coords.longitude + eastM / metersPerDegLon,
    ]);
  }
  return ring;
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

function climateBand(absLat) {
  if (absLat < 10) return { id: 'equatorial', humidity: 'humid' };
  if (absLat < 15) return { id: 'tropical', humidity: 'humid' };
  if (absLat < 35) return { id: 'subtropical-dry', humidity: 'arid' };
  if (absLat < 55) return { id: 'temperate', humidity: 'humid' };
  if (absLat < 70) return { id: 'boreal', humidity: 'moderate' };
  return { id: 'polar', humidity: 'arid' };
}

function nearestWater(latitude, longitude) {
  let best = null;
  for (const body of WATER_BODIES) {
    const km = distanceKm({ latitude, longitude }, body);
    const accessKm = Math.max(0, km - body.radiusKm);
    if (!best || accessKm < best.accessKm || (accessKm === best.accessKm && km < best.km)) {
      best = { ...body, km, accessKm };
    }
  }
  return best;
}

function waterAvailabilityScreening(latitude, longitude) {
  const coords = coordsFrom(latitude, longitude);
  const cite = LAYER_SOURCES.water.cite;
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || coords.latitude < -90 || coords.latitude > 90) {
    return {
      band: 'unknown',
      class: 'unknown',
      score: 0,
      climate: null,
      nearestWater: null,
      seawaterAccess: false,
      note: 'Latitude and longitude must be a real location.',
      quality: 'screening',
      cite,
    };
  }

  const absLat = Math.abs(coords.latitude);
  const climate = climateBand(absLat);
  const nearest = nearestWater(coords.latitude, coords.longitude);
  // Kind-specific nearest: the closest body may be a different class than seawater/brine.
  let nearestSeawater = null;
  let nearestBrine = null;
  for (const body of WATER_BODIES) {
    const km = distanceKm(coords, body);
    const accessKm = Math.max(0, km - body.radiusKm);
    const ranked = { ...body, km, accessKm };
    if (body.kind === 'seawater' && (!nearestSeawater || accessKm < nearestSeawater.accessKm)) nearestSeawater = ranked;
    if (body.kind === 'brine' && (!nearestBrine || accessKm < nearestBrine.accessKm)) nearestBrine = ranked;
  }

  let band;
  let score;
  let note;
  if (nearestBrine && nearestBrine.accessKm <= INLAND_BRINE_KM && nearestBrine.accessKm <= (nearestSeawater?.accessKm ?? Infinity)) {
    band = 'brine';
    score = 0.45;
    note = `${nearestBrine.name} is within ${Math.round(nearestBrine.accessKm)} km. Inland brine is a process feedstock, not a freshwater right or mineral concession.`;
  } else if (nearestSeawater && nearestSeawater.accessKm <= COASTAL_SEAWATER_KM) {
    band = 'seawater';
    score = 0.85;
    note = `${nearestSeawater.name} is within ${Math.round(nearestSeawater.accessKm)} km. Coastal screening suggests SWRO is geographically plausible; intake remains a site right.`;
  } else if (climate.humidity === 'arid') {
    band = 'arid';
    score = 0.15;
    note = `${climate.id} inland belt. Do not assume freshwater, seawater intake, or a brine concession from the map.`;
  } else {
    band = 'freshwater';
    score = climate.humidity === 'moderate' ? 0.5 : 0.7;
    note = `${climate.id} inland screening. Rainfall/surface water may exist; it is not an authorized freshwater right.`;
  }

  return {
    band,
    class: band === 'seawater' ? 'coastal-seawater'
      : band === 'brine' ? 'inland-brine'
        : band === 'arid' ? 'arid-inland'
          : 'inland-fresh',
    score,
    climate: climate.id,
    nearestWater: nearest,
    seawaterKm: nearestSeawater?.accessKm ?? null,
    brineKm: nearestBrine?.accessKm ?? null,
    seawaterAccess: band === 'seawater',
    note,
    quality: 'screening',
    cite,
  };
}

function pvScreeningBand(latitude, longitude) {
  const coords = coordsFrom(latitude, longitude);
  const cite = LAYER_SOURCES.pvgis.cite;
  if (!Number.isFinite(coords.latitude) || coords.latitude < -90 || coords.latitude > 90) {
    return {
      band: 'unknown',
      typicalKWhPerKWpDay: null,
      typicalKWhPerKWpYear: null,
      note: 'Latitude must be a real location.',
      quality: 'screening',
      cite,
    };
  }
  const absLat = Math.abs(coords.latitude);
  // Extra-terrestrial geometry declines with latitude; cloud climatology is a Hadley/ITCZ screen.
  // This is not a PVGIS hourly series — applyCoordinates still fetches that when the API is up.
  const geometry = Math.max(0.12, Math.cos(absLat * Math.PI / 180));
  let cloud = 1;
  if (absLat < 8) cloud = 0.78;
  else if (absLat < 15) cloud = 0.88;
  else if (absLat < 32) cloud = 1.08;
  else if (absLat < 40) cloud = 1.00;
  else if (absLat < 50) cloud = 0.88;
  else if (absLat < 60) cloud = 0.72;
  else cloud = 0.50;
  const typicalKWhPerKWpDay = clamp(5.5 * geometry * cloud, 0.7, 6.8);
  const typicalKWhPerKWpYear = typicalKWhPerKWpDay * 365;
  let band = 'poor';
  if (typicalKWhPerKWpDay >= 5.0) band = 'excellent';
  else if (typicalKWhPerKWpDay >= 4.2) band = 'good';
  else if (typicalKWhPerKWpDay >= 3.2) band = 'moderate';
  else if (typicalKWhPerKWpDay >= 2.2) band = 'limited';
  return {
    band,
    typicalKWhPerKWpDay,
    typicalKWhPerKWpYear,
    note: `Screening specific yield ~${typicalKWhPerKWpDay.toFixed(1)} kWh/kWp·day (${band}). Not a PVGIS typical-day series; click Apply location to fetch cited hourly solar.`,
    quality: 'screening',
    cite,
  };
}

function landValueScreening(latitude, longitude) {
  const coords = coordsFrom(latitude, longitude);
  const cite = LAYER_SOURCES.land.cite;
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || coords.latitude < -90 || coords.latitude > 90) {
    return {
      band: 'unknown',
      note: 'Latitude and longitude must be a real location.',
      cite,
      relativeIndex: 0,
      quality: 'screening',
    };
  }

  const water = waterAvailabilityScreening(coords);
  const absLat = Math.abs(coords.latitude);
  let band;
  let relativeIndex;
  let note;

  if (water.band === 'seawater' || (Number.isFinite(water.seawaterKm) && water.seawaterKm <= COASTAL_SEAWATER_KM)) {
    band = 'coastal-high';
    const km = Number.isFinite(water.seawaterKm) ? water.seawaterKm : 40;
    const proximity = Math.exp(-Math.max(0, km) / 50);
    relativeIndex = clamp(0.64 + 0.26 * proximity + (absLat < 40 ? 0.04 : 0), 0.64, 0.94);
    note = Number.isFinite(water.seawaterKm)
      ? `Coastal screening (~${Math.round(water.seawaterKm)} km to seawater). Land-cost band tends high near coasts and ports — not a cadastral value or transaction price.`
      : 'Coastal screening. Land-cost band tends high near coasts and ports — not a cadastral value or transaction price.';
  } else if (water.band === 'arid' || water.climate === 'subtropical-dry' || water.climate === 'polar') {
    band = 'arid-low';
    relativeIndex = clamp(0.14 + 0.10 * (1 - absLat / 90), 0.12, 0.28);
    note = 'Arid / sparse-settlement screening from latitude + water-access proxy. Proxy land-cost band tends low inland where water and access are scarce — not a market appraisal.';
  } else {
    band = 'inland-moderate';
    relativeIndex = water.band === 'brine' ? 0.42 : clamp(0.44 + 0.12 * (water.score || 0.5), 0.40, 0.62);
    note = 'Inland moderate screening from coastal distance + latitude. Not cadastral, not transaction data — early siting triage only (World Bank / FAO land-topic proxy).';
  }

  return {
    band,
    note,
    cite,
    relativeIndex,
    quality: 'screening',
    waterBand: water.band,
    seawaterKm: water.seawaterKm ?? null,
  };
}

function parseHexColor(hex) {
  const raw = String(hex || '').replace('#', '');
  if (raw.length !== 6) return [0, 0, 0];
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

function mixHex(a, b, t) {
  const pa = parseHexColor(a);
  const pb = parseHexColor(b);
  const u = clamp(t, 0, 1);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * u);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * u);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * u);
  return `rgb(${r},${g},${bl})`;
}

function colorFromRamp(value, stops) {
  if (!Number.isFinite(value) || !stops?.length) return null;
  if (value <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i += 1) {
    if (value <= stops[i][0]) {
      const [v0, c0] = stops[i - 1];
      const [v1, c1] = stops[i];
      const span = v1 - v0;
      return mixHex(c0, c1, span === 0 ? 0 : (value - v0) / span);
    }
  }
  return last[1];
}

function cosineBump(value, center, halfWidth) {
  const width = Math.max(halfWidth, 1e-6);
  const t = Math.abs(value - center) / width;
  if (t >= 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * t));
}

function desertBoost(lat, lon) {
  let boost = 0;
  boost = Math.max(boost, cosineBump(lat, -23.5, 6) * cosineBump(lon, -69.5, 4) * 0.24);
  boost = Math.max(boost, cosineBump(lat, 23, 10) * cosineBump(lon, 12, 28) * 0.13);
  boost = Math.max(boost, cosineBump(lat, 24, 8) * cosineBump(lon, 46, 14) * 0.12);
  boost = Math.max(boost, cosineBump(lat, -26, 8) * cosineBump(lon, 133, 16) * 0.11);
  boost = Math.max(boost, cosineBump(lat, 33.5, 6) * cosineBump(lon, -112, 8) * 0.09);
  boost = Math.max(boost, cosineBump(lat, -24, 7) * cosineBump(lon, 20, 10) * 0.08);
  return boost;
}

function rainforestCut(lat, lon) {
  let cut = 0;
  cut = Math.max(cut, cosineBump(lat, -2, 9) * cosineBump(lon, -62, 16) * 0.18);
  cut = Math.max(cut, cosineBump(lat, 1, 7) * cosineBump(lon, 22, 12) * 0.16);
  cut = Math.max(cut, cosineBump(lat, 2, 8) * cosineBump(lon, 113, 14) * 0.12);
  return cut;
}

function ghiScreeningKWh(latitude, longitude) {
  const coords = coordsFrom(latitude, longitude);
  if (!Number.isFinite(coords.latitude) || coords.latitude < -90 || coords.latitude > 90) return null;
  const absLat = Math.abs(coords.latitude);
  const zenith = Math.max(0.08, Math.cos(absLat * Math.PI / 180));
  let cloud = 1;
  if (absLat < 8) cloud = 0.78;
  else if (absLat < 15) cloud = 0.86;
  else if (absLat < 32) cloud = 1.08;
  else if (absLat < 42) cloud = 0.98;
  else if (absLat < 52) cloud = 0.82;
  else if (absLat < 62) cloud = 0.66;
  else cloud = 0.48;
  const lon = Number.isFinite(coords.longitude) ? coords.longitude : 0;
  const regional = 1 + desertBoost(coords.latitude, lon) - rainforestCut(coords.latitude, lon);
  return clamp(6.6 * (zenith ** 0.85) * cloud * regional, 0.7, 8.4);
}

let ghiGridCache;

function getGhiGrid() {
  if (ghiGridCache !== undefined) return ghiGridCache;
  if (globalThis.GHI_COARSE && Array.isArray(globalThis.GHI_COARSE.values)) {
    ghiGridCache = globalThis.GHI_COARSE;
    return ghiGridCache;
  }
  if (typeof require === 'function') {
    try {
      const loaded = require('../data/ghi-coarse.json');
      if (loaded && Array.isArray(loaded.values)) {
        ghiGridCache = loaded;
        return ghiGridCache;
      }
    } catch { /* formula fallback */ }
  }
  ghiGridCache = null;
  return null;
}

function ghiAt(latitude, longitude) {
  const coords = coordsFrom(latitude, longitude);
  if (!Number.isFinite(coords.latitude) || coords.latitude < -90 || coords.latitude > 90) return null;
  const grid = getGhiGrid();
  if (!grid?.values?.length) return ghiScreeningKWh(coords);

  const cellDeg = finiteNumber(grid.cellDeg, 2);
  const ncols = Math.round(finiteNumber(grid.ncols, 180));
  const nrows = Math.round(finiteNumber(grid.nrows, 60));
  const scale = finiteNumber(grid.scale, 10) || 10;
  const west = finiteNumber(grid.west, -180);
  const north = finiteNumber(grid.north, 60);
  const originLon = west + cellDeg / 2;
  const originLat = north - cellDeg / 2;
  let lon = coords.longitude;
  if (!Number.isFinite(lon)) return ghiScreeningKWh(coords);
  while (lon < -180) lon += 360;
  while (lon >= 180) lon -= 360;

  const fx = (lon - originLon) / cellDeg;
  const fy = (originLat - coords.latitude) / cellDeg;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;

  function sample(ix, iy) {
    if (iy < 0 || iy >= nrows) return null;
    const wrapped = ((ix % ncols) + ncols) % ncols;
    const packed = grid.values[iy * ncols + wrapped];
    if (!Number.isFinite(packed)) return null;
    return packed / scale;
  }

  const v00 = sample(x0, y0);
  const v10 = sample(x0 + 1, y0);
  const v01 = sample(x0, y0 + 1);
  const v11 = sample(x0 + 1, y0 + 1);
  const present = [v00, v10, v01, v11].filter(value => value != null);
  if (!present.length) return ghiScreeningKWh(coords);
  const a = v00 ?? present[0];
  const b = v10 ?? a;
  const c = v01 ?? a;
  const d = v11 ?? b;
  return (1 - tx) * (1 - ty) * a + tx * (1 - ty) * b + (1 - tx) * ty * c + tx * ty * d;
}

function ghiColor(kwhPerM2Day) {
  return colorFromRamp(kwhPerM2Day, GSA_GHI_RAMP);
}

function landColor(relativeIndex) {
  return colorFromRamp(relativeIndex, LAND_VALUE_RAMP);
}

function waterScreeningColor(bandOrScore) {
  if (typeof bandOrScore === 'string') {
    return {
      seawater: '#2bb5a0',
      brine: '#9b8ec4',
      freshwater: '#7ec8a3',
      arid: '#999999',
      unknown: null,
    }[bandOrScore] || null;
  }
  if (!Number.isFinite(bandOrScore)) return null;
  return colorFromRamp(bandOrScore, [
    [0, '#999999'],
    [0.2, '#c4a35a'],
    [0.5, '#7ec8a3'],
    [0.85, '#2bb5a0'],
    [1, '#1a8f90'],
  ]);
}

function isDeepOceanScreening(latitude, longitude) {
  const water = waterAvailabilityScreening(latitude, longitude);
  const nearest = water.nearestWater;
  if (!nearest || nearest.kind !== 'seawater') return false;
  if (!(nearest.accessKm === 0)) return false;
  // Equivalent-circle basins are not shorelines. Only skip the interior of
  // very large seas so coastal land near small basins still paints.
  if (!(nearest.radiusKm >= 400)) return false;
  return nearest.km < nearest.radiusKm * 0.2;
}

function landIndexAt(latitude, longitude) {
  const land = landValueScreening(latitude, longitude);
  if (land.band === 'unknown' || !Number.isFinite(land.relativeIndex)) return null;
  if (isDeepOceanScreening(latitude, longitude)) return null;
  return land.relativeIndex;
}

function webMercatorToLatLng(z, tileX, tileY, px, py, tileSize = 256) {
  const zoom = Math.max(0, finiteNumber(z, 0));
  const n = 2 ** zoom;
  const size = Math.max(1, finiteNumber(tileSize, 256));
  const mercX = (finiteNumber(tileX, 0) + finiteNumber(px, 0) / size) / n;
  const mercY = (finiteNumber(tileY, 0) + finiteNumber(py, 0) / size) / n;
  const longitude = mercX * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * mercY)));
  return { latitude: latRad * 180 / Math.PI, longitude };
}

function plantSite(plant) {
  return plant?.definition?.site || plant?.site || {};
}

function networkPlantMarkers(network = {}) {
  const plants = network.plants || [];
  const markers = [];
  for (const plant of plants) {
    const site = plantSite(plant);
    const latitude = finiteNumber(site.latitude);
    const longitude = finiteNumber(site.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const landHa = finiteNumber(plant.footprint?.totalHa ?? site.footprint?.totalHa, 0);
    markers.push({
      id: plant.id,
      name: plant.name || site.name || plant.id,
      latitude,
      longitude,
      landHa,
      radiusM: haToRadiusM(landHa),
      polygon: landHa > 0 ? circlePolygon(latitude, longitude, haToRadiusM(landHa)) : [],
    });
  }
  return markers;
}

return {
  SQM_PER_HA,
  EARTH_RADIUS_KM,
  WATER_BODIES,
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
  distanceKm,
  ghiScreeningKWh,
  ghiAt,
  ghiColor,
  landColor,
  landIndexAt,
  waterScreeningColor,
  colorFromRamp,
  isDeepOceanScreening,
  webMercatorToLatLng,
};
});
