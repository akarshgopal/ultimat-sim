#!/usr/bin/env node
/**
 * Build cited agricultural land-price bundle + compact admin GeoJSON.
 * Sources: USDA NASS Land Values 2025 (farm real estate $/acre by state);
 * Eurostat apri_lprc ARA EUR/ha (latest year per NUTS0).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');

const ACRES_PER_HA = 2.47105; // 1 ha = 2.47105 acres → $/ha = $/acre × ACRES_PER_HA
const FX = Object.freeze({
  pair: 'EURUSD',
  rate: 1.1622,
  date: '2026-09-04',
  source: 'Frankfurter (ECB reference rates)',
  citeUrl: 'https://www.frankfurter.app/',
});

// USDA NASS Land Values 2025 Summary (Aug 2025): Farm real estate average $/acre, 2025.
// Report excludes Alaska and Hawaii. https://www.nass.usda.gov/Publications/Todays_Reports/reports/land0825.pdf
const NASS_2025_USD_PER_ACRE = Object.freeze({
  AL: 4150, AZ: 4180, AR: 4250, CA: 13700, CO: 2290, CT: 14400, DE: 9550,
  FL: 8700, GA: 4720, ID: 4580, IL: 8930, IN: 8850, IA: 9790, KS: 3100,
  KY: 5480, LA: 3850, ME: 3350, MD: 9750, MA: 14900, MI: 6800, MN: 6790,
  MS: 3580, MO: 5000, MT: 1230, NE: 4250, NV: 1200, NH: 6500, NJ: 16600,
  NM: 725, NY: 4300, NC: 5470, ND: 2360, OH: 9350, OK: 2540, OR: 3780,
  PA: 8490, RI: 22500, SC: 4740, SD: 2970, TN: 6150, TX: 2970, UT: 3500,
  VT: 4400, VA: 6100, WA: 3710, WV: 3520, WI: 6420, WY: 1000,
});

const NASS_NAMES = Object.freeze({
  AL: 'Alabama', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska',
  NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
});

const EUROSTAT_ISO = Object.freeze({ EL: 'GR', UK: 'GB' }); // Eurostat geo → ISO_A2_EH

function roundMoney(n) {
  return Math.round(n);
}

function buildUsRecords() {
  return Object.entries(NASS_2025_USD_PER_ACRE).map(([postal, usdPerAcre]) => ({
    id: `US-${postal}`,
    name: NASS_NAMES[postal],
    usdPerHa: roundMoney(usdPerAcre * ACRES_PER_HA),
    usdPerAcre,
    year: 2025,
    source: 'USDA NASS Land Values 2025 — farm real estate average',
    citeUrl: 'https://www.nass.usda.gov/Publications/Todays_Reports/reports/land0825.pdf',
    unit: 'USD/ha',
    kind: 'us-state',
  }));
}

function extractEurostat(apriPath) {
  const d = JSON.parse(readFileSync(apriPath, 'utf8'));
  const id = d.id;
  const size = d.size;
  const dims = d.dimension;
  const indexOf = (dim) => dims[dim].category.index;
  const labels = {
    geo: dims.geo.category.label,
  };
  const freqI = indexOf('freq').A;
  const unitI = indexOf('unit').EUR_HA;
  const agri = indexOf('agriprod');
  const geo = indexOf('geo');
  const time = indexOf('time');
  const agriCodes = ['ARA', 'J0000', 'ARAIB', 'ARAXIB'];
  const times = Object.keys(time).sort();
  const nuts0 = Object.keys(geo).filter((g) => /^[A-Z]{2}$/.test(g));

  function pos(indices) {
    let p = 0;
    let stride = 1;
    for (let i = id.length - 1; i >= 0; i -= 1) {
      p += indices[i] * stride;
      stride *= size[i];
    }
    return p;
  }

  const out = [];
  for (const g of nuts0) {
    let best = null;
    for (const year of [...times].reverse()) {
      for (const ac of agriCodes) {
        if (agri[ac] == null) continue;
        const p = pos([freqI, unitI, agri[ac], geo[g], time[year]]);
        const v = d.value[String(p)];
        if (v != null && Number.isFinite(v) && v > 0) {
          best = { geo: g, name: labels.geo[g], year: Number(year), agriprod: ac, eurPerHa: v };
          break;
        }
      }
      if (best) break;
    }
    if (!best) continue;
    const iso = EUROSTAT_ISO[best.geo] || best.geo;
    out.push({
      id: iso,
      eurostatGeo: best.geo,
      name: best.name,
      usdPerHa: roundMoney(best.eurPerHa * FX.rate),
      eurPerHa: best.eurPerHa,
      year: best.year,
      agriprod: best.agriprod,
      source: `Eurostat apri_lprc ${best.agriprod} (arable land preferred) EUR/ha → USD`,
      citeUrl: 'https://ec.europa.eu/eurostat/databrowser/view/apri_lprc/default/table',
      unit: 'USD/ha',
      kind: 'eu-country',
      fx: { ...FX },
    });
  }
  return out;
}

function quantizeCoords(coords, decimals = 2) {
  const f = 10 ** decimals;
  if (typeof coords[0] === 'number') {
    return [Math.round(coords[0] * f) / f, Math.round(coords[1] * f) / f];
  }
  return coords.map((c) => quantizeCoords(c, decimals));
}

function stripFeature(f, props) {
  return {
    type: 'Feature',
    properties: props,
    geometry: {
      type: f.geometry.type,
      coordinates: quantizeCoords(f.geometry.coordinates, 2),
    },
  };
}

function buildAdmin(priceIds) {
  const countriesPath = '/tmp/ne_countries.geojson';
  const statesPath = '/tmp/ne_states.geojson';
  if (!existsSync(countriesPath) || !existsSync(statesPath)) {
    throw new Error('Missing /tmp/ne_countries.geojson or /tmp/ne_states.geojson — download Natural Earth 110m first');
  }
  const countries = JSON.parse(readFileSync(countriesPath, 'utf8'));
  const states = JSON.parse(readFileSync(statesPath, 'utf8'));
  const features = [];

  // US states (contiguous published by NASS — exclude AK/HI; skip DC)
  for (const f of states.features) {
    if (f.properties.adm0_a3 !== 'USA') continue;
    const postal = f.properties.postal;
    if (!postal || postal === 'AK' || postal === 'HI' || postal === 'DC') continue;
    features.push(stripFeature(f, {
      id: `US-${postal}`,
      name: f.properties.name,
      kind: 'us-state',
      hasPrice: priceIds.has(`US-${postal}`),
    }));
  }

  // Countries (exclude USA — covered by states). Use ISO_A2_EH when ISO_A2 is -99.
  for (const f of countries.features) {
    const iso = (f.properties.ISO_A2_EH && f.properties.ISO_A2_EH !== '-99')
      ? f.properties.ISO_A2_EH
      : f.properties.ISO_A2;
    if (!iso || iso === '-99' || iso === 'US') continue;
    features.push(stripFeature(f, {
      id: iso,
      name: f.properties.NAME || f.properties.ADMIN,
      kind: 'country',
      hasPrice: priceIds.has(iso),
    }));
  }

  return { type: 'FeatureCollection', features };
}

function toUmd(globalName, json, headerComment) {
  const body = JSON.stringify(json);
  return `${headerComment}\n(function exposeLandData(root, data) {\n  if (typeof module === 'object' && module.exports) module.exports = data;\n  root.${globalName} = data;\n})(typeof globalThis !== 'undefined' ? globalThis : this, ${body});\n`;
}

const apriPath = '/tmp/apri_lprc.json';
if (!existsSync(apriPath)) {
  throw new Error('Missing /tmp/apri_lprc.json');
}

const us = buildUsRecords();
const eu = extractEurostat(apriPath);
const byId = new Map();
for (const r of [...us, ...eu]) {
  if (byId.has(r.id)) throw new Error(`Duplicate id ${r.id}`);
  byId.set(r.id, r);
}

const bundle = {
  meta: {
    title: 'Agricultural land values (official sources)',
    units: 'USD/ha',
    note: 'Early siting proxy from official agricultural land-price statistics — not cadastral, not industrial parcel quotes, not transaction comps.',
    acresPerHa: ACRES_PER_HA,
    fx: FX,
    sources: [
      {
        id: 'nass-2025',
        label: 'USDA NASS Land Values 2025 (farm real estate $/acre by state)',
        url: 'https://www.nass.usda.gov/Publications/Todays_Reports/reports/land0825.pdf',
      },
      {
        id: 'eurostat-apri_lprc',
        label: 'Eurostat apri_lprc agricultural land prices (EUR/ha, ARA preferred)',
        url: 'https://ec.europa.eu/eurostat/databrowser/view/apri_lprc/default/table',
      },
    ],
    generatedAt: new Date().toISOString(),
  },
  records: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
};

const priceIds = new Set(bundle.records.map((r) => r.id));
const admin = buildAdmin(priceIds);

writeFileSync(join(DATA, 'land-prices.json'), JSON.stringify(bundle, null, 2) + '\n');
writeFileSync(join(DATA, 'land-prices.js'), toUmd(
  'LAND_PRICES',
  bundle,
  '// Cited agricultural land prices (USDA NASS 2025 + Eurostat apri_lprc). Generated by scripts/build-land-prices.mjs.',
));
writeFileSync(join(DATA, 'land-admin.geojson'), JSON.stringify(admin));
writeFileSync(join(DATA, 'land-admin.js'), toUmd(
  'LAND_ADMIN_GEOJSON',
  admin,
  '// Compact Natural Earth 110m admin polygons for land choropleth. Generated by scripts/build-land-prices.mjs.',
));

const usCount = us.length;
const euCount = eu.length;
const adminBytes = Buffer.byteLength(JSON.stringify(admin));
const priceBytes = Buffer.byteLength(JSON.stringify(bundle));
console.log(JSON.stringify({
  usStates: usCount,
  euCountries: euCount,
  totalRecords: bundle.records.length,
  adminFeatures: admin.features.length,
  landPricesJsonBytes: priceBytes,
  landAdminGeojsonBytes: adminBytes,
  fx: FX,
  sample: { IA: byId.get('IA'), ES: byId.get('ES'), GR: byId.get('GR') },
}, null, 2));
