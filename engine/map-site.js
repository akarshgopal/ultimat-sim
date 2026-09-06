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
    label: 'PVGIS PV',
    kind: 'overlay',
    quality: 'screening',
    url: 'https://re.jrc.ec.europa.eu/pvg_tools/en/',
    api: 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat={lat}&lon={lon}&peakpower=1&loss=14&angle=30&aspect=0&outputformat=json',
    cite: Object.freeze({
      label: 'JRC PVGIS',
      url: 'https://re.jrc.ec.europa.eu/pvg_tools/en/',
    }),
  }),
  water: Object.freeze({
    id: 'water',
    label: 'Water screening',
    kind: 'overlay',
    quality: 'screening',
    url: 'https://www.wri.org/data/aqueduct-water-risk-atlas',
    cite: Object.freeze({
      label: 'WRI Aqueduct (screening proxy, not the basin raster)',
      url: 'https://www.wri.org/data/aqueduct-water-risk-atlas',
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
  haToRadiusM,
  circlePolygon,
  waterAvailabilityScreening,
  pvScreeningBand,
  networkPlantMarkers,
  distanceKm,
};
});
