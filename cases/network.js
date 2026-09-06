(function exposeNetworkCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./coastal') : root.CoastalCase,
    typeof require === 'function' ? require('./abundance') : root.AbundanceCase,
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NetworkCase = api;
})(globalThis, (coastal, abundance, model) => {
const { streamMassKg } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=31.16&lon=35.43&peakpower=1&loss=14&angle=30&aspect=0&outputformat=json';
// Frozen PVGIS response: data/pvgis-dead-sea.json, retrieved 2026-09-06.
const DAILY_PV = [1674.85 / 365, 3.68, 4.05, 4.56, 4.9, 4.94, 5.05, 5.06, 5.13, 5.13, 4.63, 4.14, 3.77];
const DEAD_SEA_PV = DAILY_PV[0]; // 4.59 kWh/kWp·day = E_y 1674.85 / 365

function siteDeadSeaAbundance() {
  const definition = abundance.createAbundanceCase();
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const power = node('power').params.stream.kWh;
  const solarKWp = power / DEAD_SEA_PV;
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('brine').siteResource = 'brine';
  node('salt-feed').siteResource = 'salt';
  node('water').siteResource = 'freshwater';
  node('air').siteResource = 'air';
  node('power').economics = { installedCapex: solarKWp * 1000, fixedOM: solarKWp * 20, assetLifeYears: 25 };
  definition.site = {
    id: 'dead-sea-pvgis-2026-09-06',
    name: 'Dead Sea industrial shore',
    latitude: 31.16,
    longitude: 35.43,
    solarKWp,
    dailyPVKWhPerKWp: DEAD_SEA_PV,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'literature-estimate',
        evidence: 'PVGIS-SARAH3/ERA5 annual average 4.59 kWh/kWp·day (E_y 1674.85) × array sized to the hub load',
      },
      brine: {
        stream: clone(node('brine').params.stream),
        quality: 'cited',
        evidence: 'Dead Sea open-water ion assay from frozen data/dead-sea-brine.json (Wikipedia chemistry + Alsabbagh 2021 Li). Daily mass is 1e5 kg; not a mineral concession',
      },
      salt: {
        stream: clone(node('salt-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased salt makeup assumed available; not a local quote',
      },
      freshwater: {
        stream: clone(node('water').params.stream),
        quality: 'user-assumption',
        evidence: 'Process water is assumed, not a Dead Sea freshwater right',
      },
      air: {
        stream: clone(node('air').params.stream),
        quality: 'literature-estimate',
        evidence: 'Ambient air intake; no quality permit modeled',
      },
      grid: { stream: { kind: 'electricity', kWh: 0 }, quality: 'unverified', evidence: 'Unverified grid access; zero authorized imports' },
    },
    meteo: {
      dailyPVKWhPerKWp: DEAD_SEA_PV,
      monthlyPVKWhPerKWp: DAILY_PV.slice(),
      quality: 'cited',
      source: 'PVGIS-SARAH3/ERA5',
      retrieved: '2026-09-06',
      cite: {
        label: 'PVGIS-SARAH3 / ERA5, 2005–2023 monthly; annual E_y 1674.85 kWh/kWp; frozen 2026-09-06',
        url: PVGIS_URL,
      },
    },
    assay: {
      kind: 'brine',
      summary: 'Dead Sea open-water ion assay from frozen data (early-1980s surface majors; Li+ 18 mg/L). Not a mineral concession assay',
      quality: 'cited',
      evidence: [
        { label: 'Wikipedia: Dead Sea chemical composition (early-1980s surface)', url: 'https://en.wikipedia.org/wiki/Dead_Sea#Chemical_composition' },
        { label: 'Alsabbagh et al. 2021 Li+ 18 mg/L Dead Sea water', url: 'https://doi.org/10.1016/j.mineng.2021.107038' },
      ],
    },
    rights: {
      gridImport: {
        status: 'unverified',
        note: 'Unverified grid access; zero authorized imports',
        evidence: [{ label: 'Dead Sea industrial geography (context, not an interconnection)', url: 'https://en.wikipedia.org/wiki/Dead_Sea' }],
      },
      freshwater: {
        status: 'assumed',
        note: 'Process water is assumed, not a Dead Sea freshwater right',
        evidence: [{ label: 'Dead Sea water context', url: 'https://en.wikipedia.org/wiki/Dead_Sea' }],
      },
      seawaterIntake: {
        status: 'unverified',
        note: 'Inland brine hub; no seawater intake',
      },
      brineConcession: {
        status: 'unverified',
        note: 'Literature assay is not a mineral concession',
        evidence: [
          { label: 'Wikipedia: Dead Sea chemical composition (assay context, not a concession)', url: 'https://en.wikipedia.org/wiki/Dead_Sea#Chemical_composition' },
        ],
      },
      saltPurchase: {
        status: 'assumed',
        note: 'Purchased salt makeup assumed available; not a local quote',
        evidence: [{ label: 'USGS salt statistics (commodity context, not a contract)', url: 'https://www.usgs.gov/centers/national-minerals-information-center/salt-statistics-and-information' }],
      },
    },
    evidence: [
      { label: 'Dead Sea industrial geography', url: 'https://en.wikipedia.org/wiki/Dead_Sea' },
      { label: 'Solar: PVGIS-SARAH3 / ERA5, 2005–2023 monthly; annual E_y 1674.85 kWh/kWp', url: PVGIS_URL },
      { label: 'Dead Sea chemical composition (early-1980s surface majors)', url: 'https://en.wikipedia.org/wiki/Dead_Sea#Chemical_composition' },
      { label: 'Alsabbagh et al. 2021: Li+ 18 mg/L Dead Sea water', url: 'https://doi.org/10.1016/j.mineng.2021.107038' },
      { label: 'USGS salt statistics (purchased-salt context)', url: 'https://www.usgs.gov/centers/national-minerals-information-center/salt-statistics-and-information' },
    ],
    notes: 'Representative-day brine and ammonia hub. Solar is sized to the process load at PVGIS-SARAH3/ERA5 4.59 kWh/kWp·day (E_y 1674.85 / 365). Brine composition is the frozen Dead Sea open-water ion assay (data/dead-sea-brine.json); a literature assay is not a mineral concession. Freshwater and purchased salt are explicit assumptions. Grid and brine rights are unverified. Annual economics repeat this day 365 times.',
  };
  return definition;
}

function createFuelsAndMineralsNetwork(month = 6) {
  return {
    plants: [
      { id: 'almeria-fuels', name: 'Almería solar methane', definition: coastal.createCoastalCase(month) },
      { id: 'dead-sea-minerals', name: 'Dead Sea brine and ammonia', definition: siteDeadSeaAbundance() },
    ],
    corridors: [],
  };
}

return { DEAD_SEA_PV, DAILY_PV, siteDeadSeaAbundance, createFuelsAndMineralsNetwork };
});
