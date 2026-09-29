(function exposePvgisSites(root, factory) {
  // Same-origin frozen PVcalc JSON. Browser has no require(); hydrate() fetches these
  // files when live seriescalc is blocked. Not a public CORS proxy.
  const FILES = Object.freeze({
    'oman-duqm': 'pvgis-duqm.json',
    'india-mundra': 'pvgis-mundra.json',
    'namibia-walvis-bay': 'pvgis-walvis-bay.json',
    'uae-taweelah': 'pvgis-taweelah.json',
    'qatar-ras-laffan': 'pvgis-ras-laffan.json',
    'saudi-oxagon': 'pvgis-oxagon.json',
    'saudi-ras-al-khair': 'pvgis-ras-al-khair.json',
    'texas-corpus-christi': 'pvgis-corpus-christi.json',
    'au-port-hedland': 'pvgis-port-hedland.json',
    'morocco-agadir': 'pvgis-agadir.json',
    'egypt-ain-sokhna': 'pvgis-ain-sokhna.json',
    'saudi-yanbu': 'pvgis-yanbu.json',
    'au-kwinana': 'pvgis-kwinana.json',
    'morocco-dakhla': 'pvgis-dakhla.json',
    'au-lake-mackay': 'pvgis-lake-mackay.json',
    'us-great-salt-lake': 'pvgis-great-salt-lake.json',
    'us-salton-sea': 'pvgis-salton-sea.json',
    'us-searles-lake': 'pvgis-searles-lake.json',
    'bolivia-uyuni': 'pvgis-uyuni.json',
    'china-qaidam': 'pvgis-qaidam.json',
    'china-zabuye': 'pvgis-zabuye.json',
    'ethiopia-danakil': 'pvgis-danakil.json',
    'argentina-hombre-muerto': 'pvgis-hombre-muerto.json',
    'chile-salar-de-maricunga': 'pvgis-maricunga.json',
    'us-clayton-valley': 'pvgis-clayton-valley.json',
    'argentina-puerto-madryn': 'pvgis-puerto-madryn.json',
    'israel-ashkelon': 'pvgis-ashkelon.json',
    'djibouti-doraleh': 'pvgis-doraleh.json',
    'us-huntington-beach': 'pvgis-huntington-beach.json',
    'mexico-guerrero-negro': 'pvgis-guerrero-negro.json',
    'chile-salar-de-atacama': 'pvgis-salar-de-atacama.json',
    'chile-mejillones': 'pvgis-mejillones.json',
    'mejillones-pvgis-2026-09-14': 'pvgis-mejillones.json',
    'spain-almeria': 'pvgis-almeria.json',
    'almeria-pvgis-2026-09-05': 'pvgis-almeria.json',
    'dead-sea-pvgis-2026-09-06': 'pvgis-dead-sea.json',
    'levant-dead-sea': 'pvgis-dead-sea.json',
  });
  const raw = {};
  if (typeof require === 'function') {
    for (const [id, file] of Object.entries(FILES)) raw[id] = require('./' + file);
  }
  const api = factory(raw, FILES);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PvgisSites = api;
})(globalThis, (rawBySite, files) => {
  function fromPvgis(pvgis) {
    const months = pvgis?.outputs?.monthly?.fixed;
    if (!Array.isArray(months) || months.length !== 12) return null;
    const DAILY_PV = months.map(row => Number(row.E_d));
    if (DAILY_PV.some(value => !(value > 0))) return null;
    const eY = Number(pvgis.outputs?.totals?.fixed?.E_y);
    if (!(eY > 0)) return null;
    const meteo = pvgis.inputs?.meteo_data || {};
    const radiation = meteo.radiation_db || 'PVGIS-ERA5';
    const meteoDb = meteo.meteo_db || 'ERA5';
    return {
      DAILY_PV: Object.freeze(DAILY_PV.slice()),
      E_y: eY,
      E_d: Number(pvgis.outputs?.totals?.fixed?.E_d) || eY / 365,
      dailyPVKWhPerKWp: eY / 365,
      latitude: pvgis.inputs?.location?.latitude,
      longitude: pvgis.inputs?.location?.longitude,
      source: `${radiation}/${meteoDb}`,
      retrieved: pvgis.meta?.retrieved || '2026-09-21',
      query: pvgis.meta?.query || null,
      notes: pvgis.meta?.notes || '',
      url: pvgis.meta?.url || '',
    };
  }

  const BY_SITE_ID = Object.create(null);
  for (const [siteId, pvgis] of Object.entries(rawBySite || {})) {
    const series = fromPvgis(pvgis);
    if (series) BY_SITE_ID[siteId] = series;
  }

  function seriesFor(site) {
    if (!site) return null;
    return BY_SITE_ID[site.id] || null;
  }

  function frozenSolarFor(site) {
    const series = seriesFor(site);
    if (!series) return null;
    return {
      dailyPVKWhPerKWp: series.dailyPVKWhPerKWp,
      monthlyPVKWhPerKWp: [series.dailyPVKWhPerKWp, ...series.DAILY_PV],
      source: series.source,
      retrieved: series.retrieved,
      keepHourly: false,
    };
  }

  function coordDistance(series, latitude, longitude) {
    const lat = Number(series?.latitude);
    const lon = Number(series?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return Math.hypot(lat - latitude, lon - longitude);
  }

  function aliasPenalty(id) {
    return /-pvgis-\d{4}/.test(String(id || '')) ? 1 : 0;
  }

  function nearestSeries(latitude, longitude, maxDeg) {
    let best = null;
    let bestDist = Infinity;
    for (const [id, series] of Object.entries(BY_SITE_ID)) {
      const dist = coordDistance(series, latitude, longitude);
      if (dist == null || dist > maxDeg) continue;
      const closer = dist + 1e-9 < bestDist;
      const tie = Math.abs(dist - bestDist) <= 1e-9 && best && aliasPenalty(id) < aliasPenalty(best.id);
      if (closer || tie) {
        bestDist = dist;
        best = { id, series, dist };
      }
    }
    return best;
  }

  // Prefer the selected preset id when its freeze is within maxDeg; otherwise the nearest freeze.
  function matchSeries(latitude, longitude, opts = {}) {
    const maxDeg = Number.isFinite(Number(opts.maxDeg)) ? Number(opts.maxDeg) : 1;
    const siteId = opts.siteId;
    if (siteId && BY_SITE_ID[siteId]) {
      const series = BY_SITE_ID[siteId];
      const dist = coordDistance(series, latitude, longitude);
      if (dist == null || dist <= maxDeg) return { id: siteId, series, dist: dist ?? 0 };
    }
    return nearestSeries(latitude, longitude, maxDeg);
  }

  let hydratePromise = null;
  function hydrate(fetchImpl) {
    const pending = Object.entries(files || {}).filter(([id]) => !BY_SITE_ID[id]);
    if (!pending.length) return Promise.resolve(BY_SITE_ID);
    if (hydratePromise) return hydratePromise;
    const fetcher = fetchImpl || globalThis.fetch;
    hydratePromise = (async () => {
      if (typeof fetcher !== 'function') return BY_SITE_ID;
      const loaded = new Map();
      const uniqueFiles = [...new Set(pending.map(([, file]) => file))];
      await Promise.all(uniqueFiles.map(async file => {
        try {
          const response = await fetcher(`data/${file}`);
          if (!response?.ok) return;
          const series = fromPvgis(await response.json());
          if (series) loaded.set(file, series);
        } catch { /* missing freeze; caller can still use the screening band */ }
      }));
      for (const [id, file] of pending) {
        if (!BY_SITE_ID[id] && loaded.get(file)) BY_SITE_ID[id] = loaded.get(file);
      }
      return BY_SITE_ID;
    })().finally(() => { hydratePromise = null; });
    return hydratePromise;
  }

  // Catalog polish 2026-09-27: prior screening-band 58ca0d7 sites now have per-site
  // PVGIS-ERA5 freezes. Keep the export for callers; empty means none fall back.
  // Still do NOT clone Dead Sea / Atacama / Uyuni series onto distant basins.
  const SCREENING_BAND_SITE_IDS = Object.freeze([]);

  return {
    fromPvgis,
    BY_SITE_ID,
    FILES: files,
    SCREENING_BAND_SITE_IDS,
    seriesFor,
    frozenSolarFor,
    matchSeries,
    hydrate,
  };
});
