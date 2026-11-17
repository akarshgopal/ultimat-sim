// Frozen PVGIS PVcalc responses (data/pvgis-*.json) keyed by site id; dated case-site aliases
// point at the same file. Node only.
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
    DAILY_PV,
    dailyPVKWhPerKWp: eY / 365,
    source: `${radiation}/${meteoDb}`,
    retrieved: pvgis.meta?.retrieved || '2026-09-21',
  };
}

const BY_SITE_ID = Object.create(null);
for (const [siteId, file] of Object.entries(FILES)) {
  const series = fromPvgis(require('./' + file));
  if (series) BY_SITE_ID[siteId] = series;
}

function frozenSolarFor(site) {
  const series = site ? BY_SITE_ID[site.id] : null;
  if (!series) return null;
  return {
    dailyPVKWhPerKWp: series.dailyPVKWhPerKWp,
    monthlyPVKWhPerKWp: [series.dailyPVKWhPerKWp, ...series.DAILY_PV],
    source: series.source,
    retrieved: series.retrieved,
    keepHourly: false,
  };
}

module.exports = { FILES, frozenSolarFor };
