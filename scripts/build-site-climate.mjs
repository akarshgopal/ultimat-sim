#!/usr/bin/env node
// Fetch each place's climate for the feed conditions of the plant models: data/site-climate.js.
//   air  — ERA5 2 m air temperature, monthly means 2014–2023 (PVGIS MRcalc avtemp), and the site's
//          elevation (PVGIS DEM), from which the barometric pressure follows;
//   sea  — NOAA OISST v2.1 high-resolution monthly long-term mean 1991–2020 (0.25°), at the nearest
//          ocean cell within 50 km of the site (null inland).
// Places: every company site (data/sites.js) and every plant-model case location (cases/*.js).
// Read by the plant models (cases/_shared.js) and by the app's plant design view.
//
//   node scripts/build-site-climate.mjs           # fetch and write
//   node scripts/build-site-climate.mjs --check   # exit 1 if a site or case location is missing
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'site-climate.js');
const PVGIS = 'https://re.jrc.ec.europa.eu/api/v5_3/MRcalc';
const OISST = 'https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/sst.mon.ltm.1991-2020.nc.ascii';
const START_YEAR = 2014;
const END_YEAR = 2023;
const WINDOW = 4; // ±4 cells of 0.25° = ±1°
// The nearest ocean cell is the site's own water only when it is close: the Dead Sea shore is 110 km
// from the Mediterranean, Dallol 94 km from the Red Sea.
const MAX_SEA_KM = 50;

export const keyOf = (lat, lon) => `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;

// Places to fetch: company sites and case locations (abundance.js sits at the Dead Sea site).
export function places() {
  const out = new Map();
  const { SITES } = require(path.join(ROOT, 'data', 'sites.js'));
  for (const s of SITES) if (Number.isFinite(s.latitude) && Number.isFinite(s.longitude)) out.set(keyOf(s.latitude, s.longitude), { lat: s.latitude, lon: s.longitude, name: s.name });
  const dir = path.join(ROOT, 'cases');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.startsWith('_'))) {
    const mod = require(path.join(dir, f));
    const factory = Object.entries(mod).find(([k, v]) => /^create.*Case$/.test(k) && typeof v === 'function')?.[1];
    if (!factory) continue;
    let site;
    try { site = factory().site; } catch { continue; }
    if (Number.isFinite(site?.latitude) && Number.isFinite(site?.longitude)) {
      const k = keyOf(site.latitude, site.longitude);
      if (!out.has(k)) out.set(k, { lat: site.latitude, lon: site.longitude, name: site.name || site.id });
    }
  }
  return out;
}

async function getText(url, tries = 4) {
  for (let i = 0; ; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
      if (i >= tries - 1) throw new Error(`${res.status} ${url}`);
    } catch (e) {
      if (i >= tries - 1) throw e;
    }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
}

async function air(lat, lon) {
  const q = new URLSearchParams({ lat, lon, avtemp: 1, horirrad: 1, startyear: START_YEAR, endyear: END_YEAR, outputformat: 'json' });
  const json = JSON.parse(await getText(`${PVGIS}?${q}`));
  const rows = json.outputs.monthly;
  const monthly = Array.from({ length: 12 }, (_, m) => {
    const v = rows.filter(r => r.month === m + 1).map(r => r.T2m);
    return Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2));
  });
  return { elevationM: json.inputs.location.elevation, monthlyC: monthly, meanC: Number((monthly.reduce((a, b) => a + b, 0) / 12).toFixed(2)) };
}

async function sea(lat, lon) {
  const li = Math.round((lat + 89.875) / 0.25);
  const lo = Math.round(((((lon % 360) + 360) % 360) - 0.125) / 0.25);
  const l0 = Math.max(0, li - WINDOW);
  const l1 = Math.min(719, li + WINDOW);
  // Longitude window may wrap at 0°/360°: fetch the one or two index ranges.
  const ranges = [];
  const a = lo - WINDOW;
  const b = lo + WINDOW;
  if (a < 0) ranges.push([1440 + a, 1439], [0, b]);
  else if (b > 1439) ranges.push([a, 1439], [0, b - 1440]);
  else ranges.push([a, b]);
  const cells = [];
  for (const [x0, x1] of ranges) {
    const text = await getText(`${OISST}?sst%5B0:11%5D%5B${l0}:${l1}%5D%5B${x0}:${x1}%5D`);
    // Rows look like "[m][j], v0, v1, …" over lon indices x0..x1.
    for (const line of text.split('\n')) {
      const m = line.match(/^\[(\d+)\]\[(\d+)\],\s*(.*)$/);
      if (!m) continue;
      const month = Number(m[1]);
      const j = l0 + Number(m[2]);
      m[3].split(',').map(Number).forEach((v, k) => {
        const i = x0 + k;
        cells.push({ month, j, i, v });
      });
    }
  }
  const byCell = new Map();
  for (const c of cells) {
    if (!(c.v > -100 && c.v < 100)) continue; // land / fill
    const key = c.j + ',' + c.i;
    if (!byCell.has(key)) byCell.set(key, { j: c.j, i: c.i, months: new Array(12).fill(null) });
    byCell.get(key).months[c.month] = c.v;
  }
  const toLatLon = (j, i) => ({ lat: -89.875 + 0.25 * j, lon: ((0.125 + 0.25 * i + 180) % 360) - 180 });
  const km = (p, q) => {
    const R = 6371;
    const dLat = (q.lat - p.lat) * Math.PI / 180;
    const dLon = (q.lon - p.lon) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * Math.PI / 180) * Math.cos(q.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  let best = null;
  for (const c of byCell.values()) {
    if (c.months.some(v => v == null)) continue;
    const at = toLatLon(c.j, c.i);
    const d = km({ lat, lon }, at);
    if (!best || d < best.d) best = { d, at, months: c.months };
  }
  if (!best || best.d > MAX_SEA_KM) return null;
  const monthly = best.months.map(v => Number(v.toFixed(2)));
  return {
    meanC: Number((monthly.reduce((x, y) => x + y, 0) / 12).toFixed(2)), monthlyC: monthly,
    cell: { lat: best.at.lat, lon: Number(best.at.lon.toFixed(3)) }, distanceKm: Math.round(best.d),
  };
}

function render(data) {
  return `// Generated by scripts/build-site-climate.mjs — do not edit. Climate of each company site and plant-model
// case location, for the plant models' feed conditions: ERA5 2 m air temperature 2014–2023 (PVGIS
// MRcalc) with the site's elevation, and NOAA OISST v2.1 sea-surface temperature 1991–2020 monthly
// long-term mean at the nearest ocean cell within 50 km (null inland). Read by the plant models and
// the plant design view.
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.FoundrySiteClimate = data;
})(globalThis, ${JSON.stringify(data, null, 1)});
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const want = places();
  if (process.argv.includes('--check')) {
    const have = fs.existsSync(OUT) ? require(OUT).PLACES : {};
    const missing = [...want.keys()].filter(k => !have[k]);
    if (missing.length) { console.error(`data/site-climate.js is missing ${missing.join(' ')}`); process.exit(1); }
    console.log('data/site-climate.js covers every site and case location');
  } else {
    const out = {};
    for (const [k, p] of [...want.entries()].sort()) {
      const [a, s] = await Promise.all([air(p.lat, p.lon), sea(p.lat, p.lon)]);
      out[k] = { name: p.name, lat: p.lat, lon: p.lon, elevationM: a.elevationM, airC: a.meanC, airMonthlyC: a.monthlyC, sea: s };
      console.log(k.padEnd(18), String(p.name).slice(0, 28).padEnd(28), 'air', a.meanC, 'elev', a.elevationM, 'sea', s ? `${s.meanC} (${s.distanceKm} km)` : '—');
    }
    fs.writeFileSync(OUT, render({
      SOURCES: {
        air: `PVGIS v5.3 MRcalc (ERA5 T2m, monthly ${START_YEAR}–${END_YEAR}) — ${PVGIS}`,
        elevation: 'PVGIS DEM elevation at the site',
        sea: `NOAA OISST v2.1 high-resolution monthly long-term mean 1991–2020, 0.25° — ${OISST.replace('.ascii', '')}`,
      },
      PLACES: out,
    }));
    console.log(`Wrote ${path.relative(ROOT, OUT)} (${Object.keys(out).length} places)`);
  }
}
