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
        quality: 'literature-estimate',
        evidence: 'Example concentrated brine assay for screening; not a mineral concession',
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
    evidence: [
      { label: 'Dead Sea industrial geography', url: 'https://en.wikipedia.org/wiki/Dead_Sea' },
      { label: 'Solar: PVGIS-SARAH3 / ERA5, 2005–2023 monthly; annual E_y 1674.85 kWh/kWp', url: PVGIS_URL },
    ],
    notes: 'Representative-day brine and ammonia hub. Solar is sized to the process load at PVGIS-SARAH3/ERA5 4.59 kWh/kWp·day (E_y 1674.85 / 365). Freshwater and purchased salt are explicit assumptions. Annual economics repeat this day 365 times.',
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
