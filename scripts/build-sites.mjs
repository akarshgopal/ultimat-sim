// Generate data/sites.js: the company simulator's site rows (frozen PVGIS yield, land price,
// seawater/brine tags) precomputed from data/site-presets.js, data/pvgis-sites.js and the
// land-price lookup (engine/land.js), so the browser does not load PVGIS JSON or land geometry.
//
//   node scripts/build-sites.mjs          # write data/sites.js
//   node scripts/build-sites.mjs --check  # exit 1 if data/sites.js is stale
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'sites.js');

// Country of each site (ISO 3166-1 alpha-3), for its suitable land (data/land-pv.js).
const COUNTRY = {
  'uae-taweelah': 'ARE', 'qatar-ras-laffan': 'QAT', 'saudi-ras-al-khair': 'SAU', 'saudi-oxagon': 'SAU',
  'egypt-ain-sokhna': 'EGY', 'saudi-yanbu': 'SAU', 'oman-duqm': 'OMN', 'au-port-hedland': 'AUS',
  'au-kwinana': 'AUS', 'au-lake-mackay': 'AUS', 'india-mundra': 'IND', 'texas-corpus-christi': 'USA',
  'us-great-salt-lake': 'USA', 'us-salton-sea': 'USA', 'us-searles-lake': 'USA', 'morocco-agadir': 'MAR',
  'morocco-dakhla': 'ESH', 'chile-mejillones': 'CHL', 'chile-salar-de-atacama': 'CHL', 'bolivia-uyuni': 'BOL',
  'china-qaidam': 'CHN', 'ethiopia-danakil': 'ETH', 'namibia-walvis-bay': 'NAM', 'spain-almeria': 'ESP',
  'argentina-hombre-muerto': 'ARG', 'chile-salar-de-maricunga': 'CHL', 'us-clayton-valley': 'USA',
  'china-zabuye': 'CHN', 'argentina-puerto-madryn': 'ARG', 'levant-dead-sea': 'JOR', 'israel-ashkelon': 'ISR',
  'djibouti-doraleh': 'DJI', 'namibia-luderitz': 'NAM', 'southafrica-boegoebaai': 'ZAF', 'mauritania-nouadhibou': 'MRT', 'morocco-tarfaya': 'MAR', 'egypt-berenice': 'EGY', 'eritrea-assab': 'ERI', 'jordan-aqaba': 'JOR', 'pakistan-gwadar': 'PAK', 'au-onslow': 'AUS', 'au-geraldton': 'AUS', 'au-port-augusta': 'AUS', 'chile-taltal': 'CHL', 'chile-iquique': 'CHL', 'peru-marcona': 'PER', 'mexico-puerto-penasco': 'MEX', 'libya-misrata': 'LBY', 'tunisia-gabes': 'TUN', 'us-huntington-beach': 'USA', 'mexico-guerrero-negro': 'MEX',
};
// A site draws on the land within this radius (half of it for a coastal site, the rest is sea),
// or on its share of the country when the country is smaller, times the country's suitable share.
const CATCHMENT_KM = 200;

// Great-circle distance (km).
function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function suitableLandKm2(row, rows, countries) {
  const iso = COUNTRY[row.id];
  const c = countries[iso];
  if (!c) throw new Error(`no suitable-land data for ${row.id} (${iso})`);
  const siblings = rows.filter(r => COUNTRY[r.id] === iso).length;
  const R = CATCHMENT_KM;
  let circle = Math.PI * R ** 2;
  // Neighbouring catchments split the land they share: each gives up half of each overlap.
  for (const other of rows) {
    const d = other === row ? Infinity : distanceKm(row, other);
    if (d < 2 * R) circle -= (2 * R ** 2 * Math.acos(d / (2 * R)) - (d / 2) * Math.sqrt(4 * R ** 2 - d ** 2)) / 2;
  }
  if (row.coastal) circle *= 0.5;
  return Math.round(Math.min(c.areaKm2 / siblings, circle) * c.level1Share);
}

export function buildSiteRows() {
  const Company = require('../engine/company.js');
  const Land = require('../engine/land.js');
  const presets = require('../data/site-presets.js');
  const pvgis = require('../data/pvgis-sites.js');
  const { COUNTRIES } = require('../data/land-pv.js');
  const presetById = new Map(presets.map(p => [p.id, p]));
  const rows = Company.buildSites({
    sitePresets: presets,
    pvgisSites: pvgis,
    landPriceAt: (lat, lon) => Land.landPriceAt(lat, lon),
  });
  return rows.map(row => {
    const land = (() => { try { return Land.landPriceAt(row.latitude, row.longitude); } catch { return null; } })();
    const preset = presetById.get(row.id);
    return {
      ...row,
      pvKWhPerKWpDay: Number(row.pvKWhPerKWpDay.toPrecision(6)),
      // Frozen PVGIS monthly E_d (kWh/kWp·day, Jan..Dec): the utilization model's 12 typical days.
      pvMonthlyKWhPerKWpDay: (pvgis.frozenSolarFor(preset)?.monthlyPVKWhPerKWp || []).slice(1).map(v => Number(Number(v).toPrecision(4))),
      landUsdPerHa: row.landUsdPerHa == null ? null : Math.round(row.landUsdPerHa),
      landSource: land?.source ? { name: land.name || null, quality: land.quality || null, url: land.citeUrl || null } : null,
      country: COUNTRY[row.id],
      // Land suitable for utility PV within the site's catchment (km²), before any use cap.
      suitableLandKm2: suitableLandKm2(row, rows, COUNTRIES),
      // Road distance to a port for inland sites: 1.3× the straight line to the nearest coastal site.
      portDistanceKm: row.coastal ? 0 : Math.round(1.3 * Math.min(...rows.filter(r => r.coastal).map(r => distanceKm(row, r)))),
      notes: preset?.notes || '',
    };
  });
}

export function renderModule(rows) {
  return `// Generated by scripts/build-sites.mjs — do not edit by hand.
(function exposeFoundrySites(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.FoundrySites = data;
})(globalThis, Object.freeze({
  SITES: ${JSON.stringify(rows, null, 2).replace(/\n/g, '\n  ')},
}));
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = buildSiteRows();
  const text = renderModule(rows);
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== text) {
      console.error('data/sites.js is stale: run node scripts/build-sites.mjs');
      process.exit(1);
    }
    console.log('data/sites.js is up to date');
  } else {
    writeFileSync(OUT, text);
    console.log(`wrote data/sites.js: ${rows.length} sites`);
  }
}
