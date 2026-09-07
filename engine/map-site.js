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

// GSA / Solargis-style ramp for annual GHI (kWh/m²·year). Stops ≈ daily 0–10 × 365.
const GSA_GHI_RAMP = Object.freeze([
  Object.freeze([0, '#394b68']),
  Object.freeze([365, '#2c7bb6']),
  Object.freeze([730, '#00a6ca']),
  Object.freeze([1095, '#00ccbc']),
  Object.freeze([1460, '#90eb9d']),
  Object.freeze([1825, '#ffff8c']),
  Object.freeze([2190, '#f9d057']),
  Object.freeze([2555, '#f29e2e']),
  Object.freeze([2920, '#e76818']),
  Object.freeze([3285, '#d7191c']),
  Object.freeze([3650, '#c51b7d']),
]);

// Global Solar Atlas GSA_IRRAD ImageServer (geographic LERC2D cache, not Web Mercator).
const GSA_IRRAD = Object.freeze({
  sliceId: 2,
  variable: 'GHI',
  units: 'kWh/m²·year',
  minValue: 112,
  maxValue: 3013,
  tileSize: 256,
  maxZoom: 8,
  latMin: -60,
  latMax: 65,
  originX: -180,
  originY: 65,
  resolutions: Object.freeze([0.64, 0.32, 0.16, 0.08, 0.04, 0.02, 0.01, 0.005, 0.0025]),
  tileUrl: 'https://tiledimageservices.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/GSA_IRRAD/ImageServer/tile/{z}/{y}/{x}?sliceId=2',
});

// Yellow → dark green USD/ha ramp (USDA farmland-map style). Absolute USD/ha stops.
const LAND_USD_HA_RAMP = Object.freeze([
  Object.freeze([2000, '#ffffcc']),
  Object.freeze([5000, '#d9f0a3']),
  Object.freeze([10000, '#addd8e']),
  Object.freeze([20000, '#78c679']),
  Object.freeze([40000, '#31a354']),
  Object.freeze([80000, '#006837']),
]);
// Relative 0–1 alias for legacy screening helpers (maps onto the USD ramp span).
const LAND_VALUE_RAMP = Object.freeze([
  Object.freeze([0, LAND_USD_HA_RAMP[0][1]]),
  Object.freeze([0.2, LAND_USD_HA_RAMP[1][1]]),
  Object.freeze([0.4, LAND_USD_HA_RAMP[2][1]]),
  Object.freeze([0.6, LAND_USD_HA_RAMP[3][1]]),
  Object.freeze([0.8, LAND_USD_HA_RAMP[4][1]]),
  Object.freeze([1, LAND_USD_HA_RAMP[5][1]]),
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
    quality: 'cited',
    render: 'lerc-tiles',
    colormap: 'gsa-ghi',
    tileScheme: 'gsa-geographic',
    sliceId: GSA_IRRAD.sliceId,
    variable: GSA_IRRAD.variable,
    units: GSA_IRRAD.units,
    url: GSA_IRRAD.tileUrl,
    maxNativeZoom: GSA_IRRAD.maxZoom,
    api: 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat={lat}&lon={lon}&peakpower=1&loss=14&angle=30&aspect=0&outputformat=json',
    cite: Object.freeze({
      label: 'JRC PVGIS (hourly site fetch on Apply location)',
      url: 'https://re.jrc.ec.europa.eu/pvg_tools/en/',
    }),
    overlayCite: Object.freeze({
      label: 'Annual GHI from Global Solar Atlas (World Bank ESMAP / Solargis) via GSA_IRRAD LERC tiles',
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
    quality: 'cited',
    available: true,
    render: 'choropleth',
    units: 'USD/ha',
    note: 'Official agricultural land values (USDA NASS farm real estate by US state; Eurostat apri_lprc arable land by country). Early siting proxy only — not cadastral, not industrial parcel quotes, not transaction comps. Transparent where unpublished.',
    data: 'data/land-prices.json',
    admin: 'data/land-admin.geojson',
    cite: Object.freeze({
      label: 'USDA NASS Land Values 2025 + Eurostat apri_lprc (USD/ha)',
      url: 'https://www.nass.usda.gov/Publications/Todays_Reports/reports/land0825.pdf',
    }),
    cites: Object.freeze([
      Object.freeze({
        label: 'USDA NASS Land Values 2025 (farm real estate $/acre → USD/ha)',
        url: 'https://www.nass.usda.gov/Publications/Todays_Reports/reports/land0825.pdf',
      }),
      Object.freeze({
        label: 'Eurostat apri_lprc agricultural land prices (ARA EUR/ha → USD)',
        url: 'https://ec.europa.eu/eurostat/databrowser/view/apri_lprc/default/table',
      }),
    ]),
    legend: Object.freeze([
      Object.freeze({ value: 2000, color: '#ffffcc', label: '$2k/ha' }),
      Object.freeze({ value: 5000, color: '#d9f0a3', label: '$5k' }),
      Object.freeze({ value: 10000, color: '#addd8e', label: '$10k' }),
      Object.freeze({ value: 20000, color: '#78c679', label: '$20k' }),
      Object.freeze({ value: 40000, color: '#31a354', label: '$40k' }),
      Object.freeze({ value: 80000, color: '#006837', label: '$80k+' }),
    ]),
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
  // Approximate annual GHI (kWh/m²·year) for offline triage only — not the GSA raster.
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
  const daily = clamp(6.6 * (zenith ** 0.85) * cloud * regional, 0.7, 8.4);
  return daily * 365;
}

function ghiAt(latitude, longitude) {
  return ghiScreeningKWh(latitude, longitude);
}

function ghiColor(annualKwhPerM2) {
  return colorFromRamp(annualKwhPerM2, GSA_GHI_RAMP);
}

function ghiColorRgb(annualKwhPerM2) {
  const color = ghiColor(annualKwhPerM2);
  if (!color) return null;
  if (color.startsWith('rgb')) {
    const parts = color.match(/\d+/g);
    if (!parts || parts.length < 3) return null;
    return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  }
  return parseHexColor(color);
}

function gsaResolution(z) {
  const zoom = Math.max(0, Math.min(GSA_IRRAD.maxZoom, Math.round(finiteNumber(z, 0))));
  return GSA_IRRAD.resolutions[zoom];
}

function gsaZoomForMapZoom(mapZoom, latitude = 0) {
  const z = Math.max(0, finiteNumber(mapZoom, 0));
  const latRad = clamp(finiteNumber(latitude, 0), -85, 85) * Math.PI / 180;
  const metersPerPx = 156543.03392 * Math.cos(latRad) / (2 ** z);
  const degPerPx = metersPerPx / METERS_PER_DEG_LAT;
  let bestZ = 0;
  let bestDiff = Infinity;
  for (let level = 0; level <= GSA_IRRAD.maxZoom; level += 1) {
    const diff = Math.abs(Math.log(Math.max(gsaResolution(level), 1e-12) / Math.max(degPerPx, 1e-12)));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestZ = level;
    }
  }
  return bestZ;
}

function gsaTileXY(latitude, longitude, z) {
  const zoom = Math.max(0, Math.min(GSA_IRRAD.maxZoom, Math.round(finiteNumber(z, 0))));
  const res = gsaResolution(zoom);
  const tileDeg = GSA_IRRAD.tileSize * res;
  let lon = finiteNumber(longitude);
  const lat = finiteNumber(latitude);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lat < GSA_IRRAD.latMin || lat > GSA_IRRAD.latMax) return null;
  while (lon < -180) lon += 360;
  while (lon >= 180) lon -= 360;
  const x = Math.floor((lon - GSA_IRRAD.originX) / tileDeg);
  const y = Math.floor((GSA_IRRAD.originY - lat) / tileDeg);
  if (x < 0 || y < 0) return null;
  return { z: zoom, x, y, res, tileDeg };
}

function gsaTileBounds(z, tileY, tileX) {
  const res = gsaResolution(z);
  const tileDeg = GSA_IRRAD.tileSize * res;
  const west = GSA_IRRAD.originX + tileX * tileDeg;
  const north = GSA_IRRAD.originY - tileY * tileDeg;
  return {
    west,
    east: west + tileDeg,
    north,
    south: north - tileDeg,
    res,
  };
}

function gsaCoveringTiles(south, west, north, east, z) {
  const zoom = Math.max(0, Math.min(GSA_IRRAD.maxZoom, Math.round(finiteNumber(z, 0))));
  const res = gsaResolution(zoom);
  const tileDeg = GSA_IRRAD.tileSize * res;
  const s = Math.max(GSA_IRRAD.latMin, finiteNumber(south));
  const n = Math.min(GSA_IRRAD.latMax, finiteNumber(north));
  let w = finiteNumber(west);
  let e = finiteNumber(east);
  if (![s, n, w, e].every(Number.isFinite) || !(n > s) || !(e > w)) return [];
  while (w < -180) { w += 360; e += 360; }
  while (w >= 180) { w -= 360; e -= 360; }
  const x0 = Math.max(0, Math.floor((w - GSA_IRRAD.originX) / tileDeg));
  const x1 = Math.max(0, Math.floor(((Math.min(e, 180) - GSA_IRRAD.originX) / tileDeg)));
  const y0 = Math.max(0, Math.floor((GSA_IRRAD.originY - n) / tileDeg));
  const y1 = Math.max(0, Math.floor((GSA_IRRAD.originY - s) / tileDeg));
  const tiles = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      tiles.push({ z: zoom, y, x });
    }
  }
  return tiles;
}

function sampleGsaDecoded(decoded, z, tileY, tileX, latitude, longitude) {
  if (!decoded?.pixels?.[0]) return null;
  const bounds = gsaTileBounds(z, tileY, tileX);
  const res = bounds.res;
  const px = Math.floor((longitude - bounds.west) / res);
  const py = Math.floor((bounds.north - latitude) / res);
  if (px < 0 || py < 0 || px >= GSA_IRRAD.tileSize || py >= GSA_IRRAD.tileSize) return null;
  const i = py * GSA_IRRAD.tileSize + px;
  if (decoded.mask && !decoded.mask[i]) return null;
  const value = decoded.pixels[0][i];
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
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

function landColorUsdPerHa(usdPerHa) {
  if (!Number.isFinite(usdPerHa) || !(usdPerHa > 0)) return null;
  return colorFromRamp(usdPerHa, LAND_USD_HA_RAMP);
}

function landColor(relativeIndexOrUsd) {
  if (!Number.isFinite(relativeIndexOrUsd)) return null;
  // Absolute USD/ha values are >> 1; relative screening index stays in [0, 1].
  if (relativeIndexOrUsd > 1.5) return landColorUsdPerHa(relativeIndexOrUsd);
  return colorFromRamp(relativeIndexOrUsd, LAND_VALUE_RAMP);
}

function landChoroplethStyle(feature, bundle = getLandPricesBundle()) {
  const id = feature?.properties?.id;
  const record = landPriceById(id, bundle);
  if (!record || !Number.isFinite(record.usdPerHa) || !(record.usdPerHa > 0)) {
    return {
      fillColor: '#000000',
      fillOpacity: 0,
      color: '#445566',
      weight: 0.4,
      opacity: 0.25,
    };
  }
  return {
    fillColor: landColorUsdPerHa(record.usdPerHa),
    fillOpacity: 0.72,
    color: '#1b4332',
    weight: 0.6,
    opacity: 0.55,
  };
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


function offsetLatLng(latitude, longitude, eastM, northM) {
  const coords = coordsFrom(latitude, longitude);
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
    return { latitude: NaN, longitude: NaN };
  }
  const latRad = coords.latitude * Math.PI / 180;
  const metersPerDegLon = Math.max(METERS_PER_DEG_LAT * Math.cos(latRad), 1e-6);
  return {
    latitude: coords.latitude + finiteNumber(northM) / METERS_PER_DEG_LAT,
    longitude: coords.longitude + finiteNumber(eastM) / metersPerDegLon,
  };
}

function rectanglePolygon(latitude, longitude, widthM, heightM, eastM = 0, northM = 0) {
  const width = Math.max(0, finiteNumber(widthM));
  const height = Math.max(0, finiteNumber(heightM));
  if (!(width > 0) || !(height > 0)) return [];
  const halfW = width / 2;
  const halfH = height / 2;
  const corners = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH],
    [-halfW, -halfH],
  ];
  return corners.map(([de, dn]) => {
    const point = offsetLatLng(latitude, longitude, eastM + de, northM + dn);
    return [point.latitude, point.longitude];
  });
}

function padFootprintDimensions(areaM2, aspect = 1.25) {
  const area = Math.max(0, finiteNumber(areaM2));
  if (!(area > 0)) return { widthM: 0, heightM: 0 };
  const ratio = Math.max(0.5, finiteNumber(aspect, 1.25));
  const heightM = Math.sqrt(area / ratio);
  const widthM = area / heightM;
  return { widthM, heightM };
}

// Deterministic campus: solar rectangle north of pin; process pads in a grid to the south.
function layoutFootprintCampus({ latitude, longitude, solar, processes = [], totalHa, gapM = 24 } = {}) {
  const coords = coordsFrom(latitude, longitude);
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return [];
  const gap = Math.max(4, finiteNumber(gapM, 24));
  const blocks = [];
  const solarArea = Math.max(0, finiteNumber(solar?.landAreaM2 ?? solar?.areaM2));
  if (solarArea > 0) {
    const dims = padFootprintDimensions(solarArea, 1.6);
    const northM = gap + dims.heightM / 2;
    blocks.push({
      id: 'solar',
      label: 'Solar field',
      unit: 'solar-pv',
      areaM2: solarArea,
      quality: solar?.quality || 'cited',
      evidence: solar?.evidence || [],
      ring: rectanglePolygon(coords.latitude, coords.longitude, dims.widthM, dims.heightM, 0, northM),
      kind: 'solar',
    });
  }

  const pads = [...(processes || [])]
    .filter(item => finiteNumber(item?.areaM2) > 0)
    .map(item => ({ ...item }))
    .sort((a, b) => b.areaM2 - a.areaM2 || String(a.id).localeCompare(String(b.id)));

  const rowBudget = Math.max(
    60,
    solarArea > 0
      ? Math.sqrt(solarArea) * 0.55
      : Math.max(60, pads.reduce((sum, item) => sum + Math.sqrt(item.areaM2), 0) * 0.5)
  );

  let cursorEast = 0;
  let rowIndex = 0;
  for (const pad of pads) {
    const dims = padFootprintDimensions(pad.areaM2, 1.2);
    if (cursorEast > 0 && cursorEast + dims.widthM > rowBudget) {
      rowIndex += 1;
      cursorEast = 0;
    }
    pad.__widthM = dims.widthM;
    pad.__heightM = dims.heightM;
    pad.__row = rowIndex;
    pad.__eastStart = cursorEast;
    cursorEast += dims.widthM + gap;
  }

  const rowHeights = [];
  for (const pad of pads) {
    rowHeights[pad.__row] = Math.max(rowHeights[pad.__row] || 0, pad.__heightM);
  }
  const rowSouthEdge = [];
  let southCursor = gap;
  for (let r = 0; r < rowHeights.length; r += 1) {
    rowSouthEdge[r] = southCursor;
    southCursor += (rowHeights[r] || 0) + gap;
  }

  for (const pad of pads) {
    const rowPads = pads.filter(item => item.__row === pad.__row);
    const rowWidth = rowPads.reduce(
      (sum, item, index) => sum + item.__widthM + (index < rowPads.length - 1 ? gap : 0),
      0
    );
    const eastM = -rowWidth / 2 + pad.__eastStart + pad.__widthM / 2;
    const northM = -(rowSouthEdge[pad.__row] + pad.__heightM / 2);
    blocks.push({
      id: pad.id,
      label: pad.label,
      unit: pad.unit,
      areaM2: pad.areaM2,
      quality: pad.quality,
      evidence: pad.evidence || [],
      ring: rectanglePolygon(coords.latitude, coords.longitude, pad.__widthM, pad.__heightM, eastM, northM),
      kind: 'process',
    });
  }

  const outlineHa = finiteNumber(totalHa);
  if (outlineHa > 0) {
    const radiusM = haToRadiusM(outlineHa);
    if (radiusM > 0) {
      blocks.push({
        id: 'total-outline',
        label: 'Total footprint outline',
        unit: 'total',
        areaM2: outlineHa * SQM_PER_HA,
        quality: 'screening',
        evidence: [],
        ring: circlePolygon(coords.latitude, coords.longitude, radiusM),
        kind: 'outline',
      });
    }
  }

  return blocks;
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
  GSA_IRRAD,
  LAND_USD_HA_RAMP,
  LAND_VALUE_RAMP,
  haToRadiusM,
  circlePolygon,
  rectanglePolygon,
  offsetLatLng,
  padFootprintDimensions,
  layoutFootprintCampus,
  waterAvailabilityScreening,
  pvScreeningBand,
  landValueScreening,
  networkPlantMarkers,
  distanceKm,
  ghiScreeningKWh,
  ghiAt,
  ghiColor,
  ghiColorRgb,
  gsaResolution,
  gsaZoomForMapZoom,
  gsaTileXY,
  gsaTileBounds,
  gsaCoveringTiles,
  sampleGsaDecoded,
  getLandPricesBundle,
  getLandAdminGeoJSON,
  landPriceIndex,
  landPriceById,
  landColorUsdPerHa,
  landChoroplethStyle,
  landColor,
  landIndexAt,
  waterScreeningColor,
  colorFromRamp,
  isDeepOceanScreening,
  webMercatorToLatLng,
};
});
