(function exposePvgisSites(root, factory) {
  const raw = typeof require === 'function' ? {
    'oman-duqm': require('./pvgis-duqm.json'),
    'india-mundra': require('./pvgis-mundra.json'),
    'namibia-walvis-bay': require('./pvgis-walvis-bay.json'),
    'uae-taweelah': require('./pvgis-taweelah.json'),
    'qatar-ras-laffan': require('./pvgis-ras-laffan.json'),
    'saudi-oxagon': require('./pvgis-oxagon.json'),
    'saudi-ras-al-khair': require('./pvgis-ras-al-khair.json'),
    'texas-corpus-christi': require('./pvgis-corpus-christi.json'),
    'au-port-hedland': require('./pvgis-port-hedland.json'),
    'morocco-agadir': require('./pvgis-agadir.json'),
    'egypt-ain-sokhna': require('./pvgis-ain-sokhna.json'),
    'saudi-yanbu': require('./pvgis-yanbu.json'),
    'au-kwinana': require('./pvgis-kwinana.json'),
    'morocco-dakhla': require('./pvgis-dakhla.json'),
    'au-lake-mackay': require('./pvgis-lake-mackay.json'),
    'us-great-salt-lake': require('./pvgis-great-salt-lake.json'),
    'us-salton-sea': require('./pvgis-salton-sea.json'),
    'us-searles-lake': require('./pvgis-searles-lake.json'),
    'bolivia-uyuni': require('./pvgis-uyuni.json'),
    'china-qaidam': require('./pvgis-qaidam.json'),
    'ethiopia-danakil': require('./pvgis-danakil.json'),
    'chile-salar-de-atacama': require('./pvgis-salar-de-atacama.json'),
    'chile-mejillones': require('./pvgis-mejillones.json'),
    'mejillones-pvgis-2026-09-14': require('./pvgis-mejillones.json'),
    'spain-almeria': require('./pvgis-almeria.json'),
    'almeria-pvgis-2026-09-05': require('./pvgis-almeria.json'),
    'dead-sea-pvgis-2026-09-06': require('./pvgis-dead-sea.json'),
  } : {
    'oman-duqm': root.PvgisDuqm,
    'india-mundra': root.PvgisMundra,
    'namibia-walvis-bay': root.PvgisWalvisBay,
    'uae-taweelah': root.PvgisTaweelah,
    'qatar-ras-laffan': root.PvgisRasLaffan,
    'saudi-oxagon': root.PvgisOxagon,
    'saudi-ras-al-khair': root.PvgisRasAlKhair,
    'texas-corpus-christi': root.PvgisCorpusChristi,
    'au-port-hedland': root.PvgisPortHedland,
    'morocco-agadir': root.PvgisAgadir,
    'egypt-ain-sokhna': root.PvgisAinSokhna,
    'saudi-yanbu': root.PvgisYanbu,
    'au-kwinana': root.PvgisKwinana,
    'morocco-dakhla': root.PvgisDakhla,
    'au-lake-mackay': root.PvgisLakeMackay,
    'us-great-salt-lake': root.PvgisGreatSaltLake,
    'us-salton-sea': root.PvgisSaltonSea,
    'us-searles-lake': root.PvgisSearlesLake,
    'bolivia-uyuni': root.PvgisUyuni,
    'china-qaidam': root.PvgisQaidam,
    'ethiopia-danakil': root.PvgisDanakil,
    'chile-salar-de-atacama': root.PvgisSalarDeAtacama,
    'chile-mejillones': root.PvgisMejillones,
    'mejillones-pvgis-2026-09-14': root.PvgisMejillones,
    'spain-almeria': root.PvgisAlmeria,
    'almeria-pvgis-2026-09-05': root.PvgisAlmeria,
    'dead-sea-pvgis-2026-09-06': root.PvgisDeadSea,
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
