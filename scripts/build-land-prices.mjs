#!/usr/bin/env node
/**
 * Build cited agricultural land-price bundle + compact admin GeoJSON.
 * Sources: USDA NASS Land Values 2025 (farm real estate $/acre by state);
 * Eurostat apri_lprc ARA EUR/ha (latest year per NUTS0);
 * Statistics Canada 32-10-0047-01 (CAD/acre → USD/ha);
 * ABARES/DAFF Farmland Price Indicator (AUD/ha → USD/ha);
 * plus labeled national/regional series for Chile / Gulf / India / Japan / South Africa
 * (NCA Japan cited; Saudi MoJ 2023 ag-land deals cited; ODEPA-family ads, Gujarat
 * acre-order, Western Cape sheets, and GCC MoJ proxy are screening).
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

const FX_AUDUSD = Object.freeze({
  pair: 'AUDUSD',
  rate: 0.71728,
  date: '2026-09-11',
  source: 'Frankfurter (ECB reference rates)',
  citeUrl: 'https://www.frankfurter.app/',
});

const FX_CADUSD = Object.freeze({
  pair: 'CADUSD',
  rate: 0.72161,
  date: '2026-09-11',
  source: 'Frankfurter (ECB reference rates)',
  citeUrl: 'https://www.frankfurter.app/',
});

// Frankfurter (ECB) USD quotes, 2026-09-18. usdPerHa = local / USDxxx.
const FX_USDJPY = Object.freeze({
  pair: 'USDJPY',
  rate: 157.89,
  date: '2026-09-18',
  source: 'Frankfurter (ECB reference rates)',
  citeUrl: 'https://www.frankfurter.app/',
});
const FX_USDZAR = Object.freeze({
  pair: 'USDZAR',
  rate: 16.2724,
  date: '2026-09-18',
  source: 'Frankfurter (ECB reference rates)',
  citeUrl: 'https://www.frankfurter.app/',
});
const FX_USDINR = Object.freeze({
  pair: 'USDINR',
  rate: 95.88,
  date: '2026-09-18',
  source: 'Frankfurter (ECB reference rates)',
  citeUrl: 'https://www.frankfurter.app/',
});
// Saudi riyal official peg (SAMA). AED/QAR/OMR are similarly dollar-pegged.
const FX_USDSAR = Object.freeze({
  pair: 'USDSAR',
  rate: 3.75,
  date: '2026-09-18',
  source: 'Saudi riyal official peg (SAMA)',
  citeUrl: 'https://www.sama.gov.sa/',
});

// Statistics Canada Table 32-10-0047-01 — Value per acre of farm land and buildings at July 1, 2025 (CAD/acre).
// CSV: https://www150.statcan.gc.ca/n1/tbl/csv/32100047-eng.zip retrieved 2026-09-13.
const STATCAN_2025_CAD_PER_ACRE = Object.freeze({
  CA: 5643, // Canada national
});

// ABARES Farmland Price Indicator — national broadacre AUD/ha, 2023.
// DAFF news (official): average rose from $4,088 to $9,429/ha over 10 years to 2023.
const ABARES_2023_AUD_PER_HA = Object.freeze({
  AU: 9429,
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
    quality: 'cited',
  }));
}


function buildCanadaRecords() {
  return Object.entries(STATCAN_2025_CAD_PER_ACRE).map(([id, cadPerAcre]) => {
    const usdPerAcre = cadPerAcre * FX_CADUSD.rate;
    return {
      id,
      name: id === 'CA' ? 'Canada' : id,
      usdPerHa: roundMoney(usdPerAcre * ACRES_PER_HA),
      cadPerAcre,
      usdPerAcre: roundMoney(usdPerAcre),
      year: 2025,
      source: 'Statistics Canada Table 32-10-0047-01 — farm land and buildings value per acre (CAD) → USD',
      citeUrl: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210004701',
      unit: 'USD/ha',
      kind: 'country',
      quality: 'cited',
      fx: { ...FX_CADUSD },
    };
  });
}

function buildAustraliaRecords() {
  return Object.entries(ABARES_2023_AUD_PER_HA).map(([id, audPerHa]) => ({
    id,
    name: 'Australia',
    usdPerHa: roundMoney(audPerHa * FX_AUDUSD.rate),
    audPerHa,
    year: 2023,
    source: 'ABARES Farmland Price Indicator via DAFF — national broadacre AUD/ha → USD',
    citeUrl: 'https://www.agriculture.gov.au/about/news/broadacre-farmland-prices-strong-growth',
    unit: 'USD/ha',
    kind: 'country',
    quality: 'cited',
    fx: { ...FX_AUDUSD },
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
      quality: 'cited',
      fx: { ...FX },
    });
  }
  return out;
}

// NCA 全国農業会議所 令和7年田畑売買価格 — 純農業地域 中田 103.1万円/10a (published 2026-03-19).
const NCA_2025_JPY_PER_10A = 1031000;

// Western Cape DoA Dec 2024 provincial agricultural land sheet — Western Cape R23,317/ha.
const WCDOA_2024_ZAR_PER_HA = 23317;

// Screening Central Valley cropland asking-price order (ODEPA-family / broker ads).
const CHILE_SCREENING_USD_PER_HA = 13000;

// Screening Gujarat farmland acre-order (not MOSPI/NABARD official).
const INDIA_SCREENING_INR_PER_ACRE = 400000;

// Saudi MoJ real-estate indicator 2023: 1,571 ag-land deals, SAR 2,180,103,242 on 219,089,383 m².
const SAUDI_MOJ_2023_SAR = 2180103242;
const SAUDI_MOJ_2023_M2 = 219089383;

function buildExtraRecords() {
  const jpyPerHa = NCA_2025_JPY_PER_10A * 10;
  const inrPerHa = INDIA_SCREENING_INR_PER_ACRE * ACRES_PER_HA;
  const sarPerHa = (SAUDI_MOJ_2023_SAR / SAUDI_MOJ_2023_M2) * 10000;
  const saudiUsd = roundMoney(sarPerHa / FX_USDSAR.rate);
  const gulfProxyNote = 'Screening GCC agricultural land $/ha — Saudi MoJ 2023 ag-land deal average as regional proxy (no published national farmland statistical series). Not cadastral, not industrial parcel quotes.';
  const gulfCite = 'https://www.alwatan.com.sa/article/1138667';

  return [
    {
      id: 'CL',
      name: 'Chile',
      usdPerHa: CHILE_SCREENING_USD_PER_HA,
      year: 2025,
      source: 'Screening agricultural land $/ha (Chile) — Central Valley cropland asking-price order ~USD 13,000/ha (ODEPA-family / broker ads). Not cadastral, not industrial Mejillones parcel quotes.',
      citeUrl: 'https://www.odepa.gob.cl/estadisticas-del-sector/estadisticas-productivas',
      unit: 'USD/ha',
      kind: 'country',
      quality: 'screening',
    },
    {
      id: 'IN',
      name: 'India',
      usdPerHa: roundMoney(inrPerHa / FX_USDINR.rate),
      inrPerAcre: INDIA_SCREENING_INR_PER_ACRE,
      inrPerHa: roundMoney(inrPerHa),
      year: 2024,
      source: 'Screening agricultural land $/ha (India) — Gujarat farmland acre-order ~₹4 lakh/acre → USD/ha. Not MOSPI/NABARD official, not cadastral, not Mundra SEZ quotes.',
      citeUrl: 'https://www.iima.ac.in/sites/default/files/2025-12/ISALPI%20Index%20December%202025%20%20Release%20%20%281%29.pdf',
      unit: 'USD/ha',
      kind: 'country',
      quality: 'screening',
      fx: { ...FX_USDINR },
    },
    {
      id: 'JP',
      name: 'Japan',
      usdPerHa: roundMoney(jpyPerHa / FX_USDJPY.rate),
      jpyPer10a: NCA_2025_JPY_PER_10A,
      jpyPerHa,
      year: 2025,
      source: 'NCA 全国農業会議所 令和7年田畑売買価格等に関する調査結果 — 純農業地域 中田 103.1万円/10a → USD/ha',
      citeUrl: 'https://www.nca.or.jp/upload/denpata_r7_youshi.pdf',
      unit: 'USD/ha',
      kind: 'country',
      quality: 'cited',
      fx: { ...FX_USDJPY },
    },
    {
      id: 'ZA',
      name: 'South Africa',
      usdPerHa: roundMoney(WCDOA_2024_ZAR_PER_HA / FX_USDZAR.rate),
      zarPerHa: WCDOA_2024_ZAR_PER_HA,
      year: 2024,
      source: 'Screening agricultural land $/ha (South Africa) — Western Cape DoA Dec 2024 provincial sheet R23,317/ha as national/regional proxy. Not cadastral, not Cape Town industrial parcel quotes.',
      citeUrl: 'https://www.elsenburg.com/wp-content/uploads/2024/12/2024-Agric-land-prices-December.pdf',
      unit: 'USD/ha',
      kind: 'country',
      quality: 'screening',
      fx: { ...FX_USDZAR },
    },
    {
      id: 'SA',
      name: 'Saudi Arabia',
      usdPerHa: saudiUsd,
      sarPerHa: roundMoney(sarPerHa),
      year: 2023,
      source: 'Saudi Ministry of Justice real-estate indicator 2023 — 1,571 agricultural-land deals, SAR 2.180 billion on 219.1 million m² → USD/ha',
      citeUrl: gulfCite,
      unit: 'USD/ha',
      kind: 'country',
      quality: 'cited',
      fx: { ...FX_USDSAR },
    },
    {
      id: 'AE',
      name: 'United Arab Emirates',
      usdPerHa: saudiUsd,
      year: 2023,
      source: gulfProxyNote,
      citeUrl: gulfCite,
      unit: 'USD/ha',
      kind: 'country',
      quality: 'screening',
      fx: { ...FX_USDSAR },
    },
    {
      id: 'QA',
      name: 'Qatar',
      usdPerHa: saudiUsd,
      year: 2023,
      source: gulfProxyNote,
      citeUrl: gulfCite,
      unit: 'USD/ha',
      kind: 'country',
      quality: 'screening',
      fx: { ...FX_USDSAR },
    },
    {
      id: 'OM',
      name: 'Oman',
      usdPerHa: saudiUsd,
      year: 2023,
      source: gulfProxyNote,
      citeUrl: gulfCite,
      unit: 'USD/ha',
      kind: 'country',
      quality: 'screening',
      fx: { ...FX_USDSAR },
    },
  ];
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

const EXTRA_SOURCES = [
  {
    id: 'nca-japan-r7',
    label: 'NCA Japan 令和7年田畑売買価格 (純農業地域 中田 yen/10a → USD/ha)',
    url: 'https://www.nca.or.jp/upload/denpata_r7_youshi.pdf',
  },
  {
    id: 'saudi-moj-ag-2023',
    label: 'Saudi MoJ real-estate indicator 2023 agricultural-land deals (SAR/m² → USD/ha)',
    url: 'https://www.alwatan.com.sa/article/1138667',
  },
  {
    id: 'odepa-chile-screening',
    label: 'Screening: Chile Central Valley cropland ads (ODEPA-family / broker order)',
    url: 'https://www.odepa.gob.cl/estadisticas-del-sector/estadisticas-productivas',
  },
  {
    id: 'wcdoa-za-2024',
    label: 'Screening: Western Cape DoA Dec 2024 provincial agricultural land R/ha',
    url: 'https://www.elsenburg.com/wp-content/uploads/2024/12/2024-Agric-land-prices-December.pdf',
  },
  {
    id: 'india-gujarat-screening',
    label: 'Screening: India Gujarat farmland acre-order (IIMA ISALPI context; not MOSPI official)',
    url: 'https://www.iima.ac.in/sites/default/files/2025-12/ISALPI%20Index%20December%202025%20%20Release%20%20%281%29.pdf',
  },
];

function extraFx() {
  return {
    AUDUSD: FX_AUDUSD,
    CADUSD: FX_CADUSD,
    USDJPY: FX_USDJPY,
    USDZAR: FX_USDZAR,
    USDINR: FX_USDINR,
    USDSAR: FX_USDSAR,
  };
}

function mergeRecords(existing, extras) {
  const byId = new Map();
  for (const r of existing) {
    if (!r?.id) continue;
    if (r.quality == null && (r.kind === 'us-state' || r.kind === 'eu-country' || r.kind === 'country')) {
      byId.set(r.id, { ...r, quality: 'cited' });
    } else {
      byId.set(r.id, r);
    }
  }
  for (const r of extras) {
    byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function writeBundle(bundle, admin) {
  writeFileSync(join(DATA, 'land-prices.json'), JSON.stringify(bundle, null, 2) + '\n');
  writeFileSync(join(DATA, 'land-prices.js'), toUmd(
    'LAND_PRICES',
    bundle,
    '// Agricultural land prices (USDA NASS 2025 + Eurostat + StatCan + ABARES + NCA/MoJ + labeled screening). Generated by scripts/build-land-prices.mjs.',
  ));
  writeFileSync(join(DATA, 'land-admin.geojson'), JSON.stringify(admin));
  writeFileSync(join(DATA, 'land-admin.js'), toUmd(
    'LAND_ADMIN_GEOJSON',
    admin,
    '// Compact Natural Earth 110m admin polygons for land choropleth. Generated by scripts/build-land-prices.mjs.',
  ));
}

function stampAdminHasPrice(admin, priceIds) {
  for (const feature of admin.features || []) {
    const id = feature?.properties?.id;
    if (!id) continue;
    feature.properties.hasPrice = priceIds.has(id);
  }
  return admin;
}

const apriPath = '/tmp/apri_lprc.json';
const extras = buildExtraRecords();
const canRebuild = existsSync(apriPath)
  && existsSync('/tmp/ne_countries.geojson')
  && existsSync('/tmp/ne_states.geojson');

if (!canRebuild) {
  const existing = JSON.parse(readFileSync(join(DATA, 'land-prices.json'), 'utf8'));
  const admin = JSON.parse(readFileSync(join(DATA, 'land-admin.geojson'), 'utf8'));
  const records = mergeRecords(existing.records || [], extras);
  const sources = [...(existing.meta?.sources || [])];
  for (const src of EXTRA_SOURCES) {
    if (!sources.some((s) => s.id === src.id)) sources.push(src);
  }
  const bundle = {
    ...existing,
    meta: {
      ...existing.meta,
      title: 'Agricultural land values (official + labeled screening)',
      note: 'Early siting proxy from official agricultural land-price statistics plus labeled screening national/regional proxies — not cadastral, not industrial parcel quotes, not transaction comps. Record quality is cited vs screening.',
      sources,
      fxExtra: { ...(existing.meta?.fxExtra || {}), ...extraFx() },
      generatedAt: new Date().toISOString(),
    },
    records,
  };
  const priceIds = new Set(bundle.records.map((r) => r.id));
  stampAdminHasPrice(admin, priceIds);
  writeBundle(bundle, admin);
  console.log(JSON.stringify({
    mode: 'merge-extras',
    extraIds: extras.map((r) => r.id),
    totalRecords: bundle.records.length,
    sample: Object.fromEntries(extras.map((r) => [r.id, { usdPerHa: r.usdPerHa, quality: r.quality }])),
  }, null, 2));
  process.exit(0);
}

const us = buildUsRecords();
const eu = extractEurostat(apriPath);
const ca = buildCanadaRecords();
const au = buildAustraliaRecords();
const extra = extras;
const byId = new Map();
for (const r of [...us, ...eu, ...ca, ...au, ...extra]) {
  if (byId.has(r.id)) throw new Error(`Duplicate id ${r.id}`);
  byId.set(r.id, r);
}

const bundle = {
  meta: {
    title: 'Agricultural land values (official + labeled screening)',
    units: 'USD/ha',
    note: 'Early siting proxy from official agricultural land-price statistics plus labeled screening national/regional proxies — not cadastral, not industrial parcel quotes, not transaction comps. Record quality is cited vs screening.',
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
      {
        id: 'statcan-32100047',
        label: 'Statistics Canada 32-10-0047-01 farm land and buildings $/acre (CAD→USD)',
        url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210004701',
      },
      {
        id: 'abares-farmland-2023',
        label: 'ABARES/DAFF Farmland Price Indicator national broadacre AUD/ha (2023)',
        url: 'https://www.agriculture.gov.au/about/news/broadacre-farmland-prices-strong-growth',
      },
      ...EXTRA_SOURCES,
    ],
    fxExtra: extraFx(),
    generatedAt: new Date().toISOString(),
  },
  records: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
};

const priceIds = new Set(bundle.records.map((r) => r.id));
const admin = buildAdmin(priceIds);
writeBundle(bundle, admin);

const usCount = us.length;
const euCount = eu.length;
const adminBytes = Buffer.byteLength(JSON.stringify(admin));
const priceBytes = Buffer.byteLength(JSON.stringify(bundle));
console.log(JSON.stringify({
  mode: 'rebuild',
  usStates: usCount,
  euCountries: euCount,
  canada: ca.length,
  australia: au.length,
  extras: extra.length,
  totalRecords: bundle.records.length,
  adminFeatures: admin.features.length,
  landPricesJsonBytes: priceBytes,
  landAdminGeojsonBytes: adminBytes,
  fx: FX,
  fxAud: FX_AUDUSD,
  fxCad: FX_CADUSD,
  sample: {
    IA: byId.get('US-IA') || byId.get('IA'),
    ES: byId.get('ES'),
    CA: byId.get('CA'),
    AU: byId.get('AU'),
    CL: byId.get('CL'),
    JP: byId.get('JP'),
  },
}, null, 2));
