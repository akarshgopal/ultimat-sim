(function exposePvgisSites(root, factory) {
  const raw = typeof require === 'function' ? {
    'oman-duqm': require('./pvgis-duqm.json'),
    'india-mundra': require('./pvgis-mundra.json'),
    'namibia-walvis-bay': require('./pvgis-walvis-bay.json'),
  } : {
    'oman-duqm': root.PvgisDuqm,
    'india-mundra': root.PvgisMundra,
    'namibia-walvis-bay': root.PvgisWalvisBay,
  };
  const api = factory(raw);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PvgisSites = api;
})(globalThis, (rawBySite) => {
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

  return {
    fromPvgis,
    BY_SITE_ID: Object.freeze(BY_SITE_ID),
    seriesFor,
    frozenSolarFor,
  };
});
