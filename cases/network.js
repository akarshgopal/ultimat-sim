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
const tea = abundance.TEA;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=31.16&lon=35.43&peakpower=1&loss=14&angle=30&aspect=0&outputformat=json';
// Frozen PVGIS response: data/pvgis-dead-sea.json, retrieved 2026-09-06.
const DAILY_PV = [1674.85 / 365, 3.68, 4.05, 4.56, 4.9, 4.94, 5.05, 5.06, 5.13, 5.13, 4.63, 4.14, 3.77];
const DEAD_SEA_PV = DAILY_PV[0]; // 4.59 kWh/kWp·day = E_y 1674.85 / 365
const ZABUYE_PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=31.35&lon=84.05&peakpower=1&loss=14&angle=20&aspect=0&raddatabase=PVGIS-ERA5&outputformat=json';
// Frozen PVGIS-ERA5 response: data/pvgis-zabuye.json, retrieved 2026-09-27. E_d month order.
const ZABUYE_DAILY_PV = [2070.67 / 365, 5.44, 5.93, 6.09, 6.29, 6.12, 5.98, 5.34, 5.27, 5.76, 5.65, 5.12, 5.12];
const ZABUYE_PV = ZABUYE_DAILY_PV[0]; // kWh/kWp·day = E_y 2070.67 / 365
const ZABUYE_ASSAY_URL = 'https://doi.org/10.3389/fceng.2022.1008680';

function right(kind, status, note, evidence) {
  return {
    kind,
    status,
    authorize: status === 'authorized' || status === 'assumed',
    note,
    ...(evidence ? { evidence } : {}),
  };
}

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
  node('power').economics = tea.bindCapexPack('solar-pv', { capacity: solarKWp });
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
      notes: 'Frozen PVGIS-SARAH3/ERA5 monthly at 31.16, 35.43; not a plant-measured irradiance series.',
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
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports', [
        { label: 'Dead Sea industrial geography (context, not an interconnection)', url: 'https://en.wikipedia.org/wiki/Dead_Sea' },
      ]),
      freshwater: right('freshwater', 'assumed', 'Process water is assumed, not a Dead Sea freshwater right', [
        { label: 'Dead Sea water context', url: 'https://en.wikipedia.org/wiki/Dead_Sea' },
      ]),
      seawaterIntake: right('intake', 'unverified', 'Inland brine hub; no seawater intake'),
      seawaterDischarge: right('discharge', 'unverified', 'Inland brine hub; no seawater outfall'),
      brineConcession: right('concession', 'unverified', 'Literature assay is not a mineral concession', [
        { label: 'Wikipedia: Dead Sea chemical composition (assay context, not a concession)', url: 'https://en.wikipedia.org/wiki/Dead_Sea#Chemical_composition' },
      ]),
      saltPurchase: right('purchase', 'assumed', 'Purchased salt makeup assumed available; not a local quote', [
        { label: 'USGS salt statistics (commodity context, not a contract)', url: 'https://www.usgs.gov/centers/national-minerals-information-center/salt-statistics-and-information' },
      ]),
    },
    evidence: [
      { label: 'Dead Sea industrial geography', url: 'https://en.wikipedia.org/wiki/Dead_Sea' },
      { label: 'Solar: PVGIS-SARAH3 / ERA5, 2005–2023 monthly; annual E_y 1674.85 kWh/kWp', url: PVGIS_URL },
      { label: 'Dead Sea chemical composition (early-1980s surface majors)', url: 'https://en.wikipedia.org/wiki/Dead_Sea#Chemical_composition' },
      { label: 'Alsabbagh et al. 2021: Li+ 18 mg/L Dead Sea water', url: 'https://doi.org/10.1016/j.mineng.2021.107038' },
      { label: 'USGS salt statistics (purchased-salt context)', url: 'https://www.usgs.gov/centers/national-minerals-information-center/salt-statistics-and-information' },
    ],
    notes: 'Representative-day brine and ammonia hub. Solar is sized to the process load at PVGIS-SARAH3/ERA5 4.59 kWh/kWp·day (E_y 1674.85 / 365). Brine composition is the frozen Dead Sea open-water ion assay (data/dead-sea-brine.json); a literature assay is not a mineral concession. Minerals CAPEX uses the tea-screening DLE brine-throughput mid (not the old $80 OOM). Dead Sea demo scale is cash-positive at that mid because 4% fixed O&M tracks CAPEX; high-band $40 stays cash-negative. MECH11 wires brine→intake-pump→minerals (0.4 kWh/m³ lift on the bus). Screening, not bankable. Freshwater and purchased salt are explicit assumptions. Grid, brine concession, and seawater intake/discharge rights are unverified. Annual economics repeat this day 365 times.',
  };
  return definition;
}

function siteZabuyeAbundance() {
  const definition = abundance.createAbundanceCase({
    assayId: 'zabuye-lithium-brine',
    region: 'China / Tibet',
  });
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const power = node('power').params.stream.kWh;
  const solarKWp = power / ZABUYE_PV;
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('brine').siteResource = 'brine';
  node('salt-feed').siteResource = 'salt';
  node('water').siteResource = 'freshwater';
  node('air').siteResource = 'air';
  node('power').economics = tea.bindCapexPack('solar-pv', { capacity: solarKWp });
  definition.site = {
    id: 'china-zabuye',
    name: 'Lake Zabuye (Zhabuye), Tibet, China',
    region: 'China / Tibet',
    latitude: 31.35,
    longitude: 84.05,
    solarKWp,
    dailyPVKWhPerKWp: ZABUYE_PV,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'cited',
        evidence: 'PVGIS-ERA5 annual average from E_y 2070.67 kWh/kWp × array sized to the hub load',
      },
      brine: {
        stream: clone(node('brine').params.stream),
        quality: 'cited',
        evidence: 'Lake Zabuye carbonate brine from Murphy & Haji 2022 Table 1 (frozen data/zabuye-lithium-brine.json; Li+ 970 mg/L). Daily mass is 1e5 kg; not a mineral concession',
      },
      salt: {
        stream: clone(node('salt-feed').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased salt makeup assumed available; not a local quote',
      },
      freshwater: {
        stream: clone(node('water').params.stream),
        quality: 'user-assumption',
        evidence: 'Process water is assumed, not a Zabuye freshwater right',
      },
      air: {
        stream: clone(node('air').params.stream),
        quality: 'literature-estimate',
        evidence: 'Ambient air intake; no quality permit modeled',
      },
      grid: { stream: { kind: 'electricity', kWh: 0 }, quality: 'unverified', evidence: 'Unverified grid access; zero authorized imports' },
    },
    meteo: {
      dailyPVKWhPerKWp: ZABUYE_PV,
      monthlyPVKWhPerKWp: ZABUYE_DAILY_PV.slice(),
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-27',
      cite: {
        label: 'PVGIS-ERA5, 2005–2023 monthly; annual E_y 2070.67 kWh/kWp; frozen 2026-09-27',
        url: ZABUYE_PVGIS_URL,
      },
      notes: 'Frozen PVGIS-ERA5 monthly at 31.35, 84.05 (elevation ~4424 m). Not a plant-measured irradiance series and not a Dead Sea or Qaidam clone.',
    },
    assay: {
      kind: 'brine',
      assayId: 'zabuye-lithium-brine',
      summary: 'Lake Zabuye carbonate-type brine (Murphy & Haji 2022 Table 1; Li+ 970 mg/L). Mg, Ca, HCO3, and Br omitted because the table lists them as zero or absent. Not a mineral concession assay',
      quality: 'cited',
      evidence: [
        { label: 'Murphy & Haji 2022, Frontiers in Chemical Engineering Table 1: Lake Zabuye brine majors', url: ZABUYE_ASSAY_URL },
        { label: 'Murphy & Haji 2022 full text (same Table 1)', url: 'https://www.frontiersin.org/journals/chemical-engineering/articles/10.3389/fceng.2022.1008680/full' },
      ],
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports', [
        { label: 'Zabuye Lake geography (context, not an interconnection)', url: 'https://en.wikipedia.org/wiki/Zabuye_Lake' },
      ]),
      freshwater: right('freshwater', 'assumed', 'Process water is assumed, not a Zabuye freshwater right', [
        { label: 'Zabuye Lake water context', url: 'https://en.wikipedia.org/wiki/Zabuye_Lake' },
      ]),
      seawaterIntake: right('intake', 'unverified', 'Inland brine hub; no seawater intake'),
      seawaterDischarge: right('discharge', 'unverified', 'Inland brine hub; no seawater outfall'),
      brineConcession: right('concession', 'assumed', 'Screening assumption so the capital-inclusive cash gate can run. Murphy & Haji 2022 Table 1 is not a Tibet Mineral concession', [
        { label: 'Murphy & Haji 2022 Table 1 (assay context, not a concession)', url: ZABUYE_ASSAY_URL },
      ]),
      saltPurchase: right('purchase', 'assumed', 'Purchased salt makeup assumed available; not a local quote', [
        { label: 'USGS salt statistics (commodity context, not a contract)', url: 'https://www.usgs.gov/centers/national-minerals-information-center/salt-statistics-and-information' },
      ]),
    },
    evidence: [
      { label: 'Zabuye Lake geography', url: 'https://en.wikipedia.org/wiki/Zabuye_Lake' },
      { label: 'Solar: PVGIS-ERA5, 2005–2023 monthly at 31.35, 84.05; annual E_y 2070.67 kWh/kWp', url: ZABUYE_PVGIS_URL },
      { label: 'Murphy & Haji 2022 Table 1: Lake Zabuye carbonate brine majors', url: ZABUYE_ASSAY_URL },
      { label: 'USGS salt statistics (purchased-salt context)', url: 'https://www.usgs.gov/centers/national-minerals-information-center/salt-statistics-and-information' },
    ],
    notes: 'Representative-day Zabuye brine hub. Solar is sized to the process load at frozen PVGIS-ERA5 E_y 2070.67 kWh/kWp (2070.67 / 365). Brine composition is the Murphy & Haji 2022 Table 1 carbonate assay (data/zabuye-lithium-brine.json); a literature assay is not a mineral concession. Brine concession is an explicit screening assumption so sizeForPositiveCashflow can run the capital-inclusive gate. Screening offtake uses the China/Asia USGS table (not a plant contract and not a silent ME-Levant inherit). MECH11 wires brine→intake-pump→minerals (0.4 kWh/m³ lift on the bus). Screening, not bankable. Freshwater and purchased salt are explicit assumptions. Grid and seawater intake/discharge rights are unverified. Annual economics repeat this day 365 times.',
  };
  return definition;
}

function createFuelsAndMineralsNetwork(month = 6) {
  return {
    plants: [
      { id: 'dead-sea-minerals', name: 'Dead Sea brine and ammonia', definition: siteDeadSeaAbundance() },
      { id: 'almeria-fuels', name: 'Almería solar methane', definition: coastal.createCoastalCase(month) },
    ],
    corridors: [],
  };
}

return {
  DEAD_SEA_PV,
  DAILY_PV,
  ZABUYE_PV,
  ZABUYE_DAILY_PV,
  siteDeadSeaAbundance,
  siteZabuyeAbundance,
  createFuelsAndMineralsNetwork,
};
});
