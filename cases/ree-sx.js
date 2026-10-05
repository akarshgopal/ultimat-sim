(function exposeReeSxCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening,
    typeof require === 'function' ? require('../data/ionic-clay-longnan.js') : root.IonicClayLongnan
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReeSxCase = api;
})(globalThis, (model, tea, clay) => {
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=33.77&lon=-118.19&peakpower=1&loss=14&angle=20&aspect=180&outputformat=json';
const pvgis = typeof require === 'function' ? require('../data/pvgis-long-beach.json') : null;
const DAILY_PV_ED = pvgis ? pvgis.outputs.totals.fixed.E_d : 3.33;
const DAILY_PV_EY = pvgis ? pvgis.outputs.totals.fixed.E_y : 1213.78;
const REO_KG_PER_DAY = 10;
const RECOVERY = 0.95;
const SEC = 5.3;
const REGION = 'US West / California';
const TALENS = 'https://link.springer.com/article/10.1007/s11837-013-0719-8';
const HONAKER = 'https://www.netl.doe.gov/sites/default/files/2020-10/20VPRREE_Honaker_2.pdf';
const ORNL_MSX = 'https://www.ornl.gov/publication/process-scale-energy-efficient-membrane-solvent-extraction-process-rare-earth-recycling';
const USGS_REE = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-rare-earths.pdf';
const LONG_BEACH_URL = 'https://en.wikipedia.org/wiki/Long_Beach,_California';

function right(kind, status, note, evidence) {
  return {
    kind,
    status,
    authorize: status === 'authorized' || status === 'assumed',
    note,
    ...(evidence ? { evidence } : {}),
  };
}

function concentrateStream(kg) {
  return {
    kind: 'material',
    mol: clay.concentrateMolForKg(kg),
    phase: 'solid',
    T_C: 25,
    P_bar: 1,
  };
}

function createReeSxCase() {
  const feedKg = REO_KG_PER_DAY / RECOVERY;
  const kWhPerDay = REO_KG_PER_DAY * SEC;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const concentrate = concentrateStream(feedKg);
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'concentrate', unit: 'material-source', sourcePreset: 'mixed-reo', params: { stream: concentrate }, economics: tea.bindCost('mixed-reo-concentrate') },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        {
          id: 'sx',
          unit: 'ree-sx',
          capacity: REO_KG_PER_DAY,
          params: {
            recovery: RECOVERY,
            electricityKWhPerKgReo: SEC,
          },
          economics: tea.bindCapexPack('ree-sx', { capacity: REO_KG_PER_DAY, region: REGION }),
        },
        { id: 'ndpr', unit: 'material-sink', economics: tea.bindSale('ndpr-oxide-separated', { region: REGION }) },
        { id: 'dytb', unit: 'material-sink', economics: tea.bindSale('dytb-oxide', { region: REGION }) },
        { id: 'light-reo', unit: 'material-sink', economics: tea.bindSale('light-reo', { region: REGION }) },
        { id: 'raffinate', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'concentrate', port: 'out' }, to: { node: 'sx', port: 'concentrate' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'sx', port: 'electricity' } },
        { from: { node: 'sx', port: 'ndpr' }, to: { node: 'ndpr', port: 'in' } },
        { from: { node: 'sx', port: 'dytb' }, to: { node: 'dytb', port: 'in' } },
        { from: { node: 'sx', port: 'lightReo' }, to: { node: 'light-reo', port: 'in' } },
        { from: { node: 'sx', port: 'raffinate' }, to: { node: 'raffinate', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { sx: REO_KG_PER_DAY },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('concentrate').siteResource = 'concentrate';
  definition.site = {
    id: 'us-long-beach',
    name: 'Long Beach, California, USA',
    latitude: 33.77,
    longitude: -118.19,
    region: REGION,
    solarKWp,
    dailyPVKWhPerKWp: DAILY_PV_ED,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'literature-estimate',
        evidence: `PVGIS-ERA5 annual average ${DAILY_PV_ED} kWh/kWp·day (E_y ${DAILY_PV_EY} from frozen data/pvgis-long-beach.json) × array sized to 10 kg recovered listed REO/day × 5.3 kWh/kg with 2% margin. Not a grid interconnection and not a Maglut plant meter.`,
      },
      concentrate: {
        stream: clone(node('concentrate').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased oxide-equivalent mixed concentrate is the Deng & Kendall 2019 Longnan listed-oxide basket (no kaolinite) placed on a Long Beach map point. Peer SX feed, not a mine and not a Maglut feed assay.',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-10-05',
      cite: {
        label: `PVGIS-ERA5, 2005–2023 monthly at Long Beach (33.77, −118.19); frozen data/pvgis-long-beach.json E_y ${DAILY_PV_EY}, E_d ${DAILY_PV_ED}`,
        url: PVGIS_URL,
      },
      notes: `Frozen PVGIS totals.fixed E_d ${DAILY_PV_ED} kWh/kWp·day and E_y ${DAILY_PV_EY} kWh/kWp from data/pvgis-long-beach.json, retrieved 2026-10-05. Specified query aspect=180. Same map point and irradiance as the Maglut chromatography demo. Not a plant-measured irradiance series.`,
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Demo electricity is on-site solar only. Not an SX plant interconnection.', [
        { label: 'Wikipedia: Long Beach, California (geography, not an interconnection)', url: LONG_BEACH_URL },
      ]),
      concentratePurchase: right('purchase', 'assumed', 'Purchased mixed REO concentrate assumed available as a Longnan literature basket; not a mine and not a tolling contract', [
        { label: 'USGS MCS 2026 rare earths (separated-oxide context for the mixed-concentrate purchase, not a contract)', url: USGS_REE },
      ]),
    },
    evidence: [
      { label: 'Long Beach, California geography (map point, not a separation plant or concession)', url: LONG_BEACH_URL },
      { label: `Solar: PVGIS, 2005–2023 monthly; annual E_y ${DAILY_PV_EY} kWh/kWp, E_d ${DAILY_PV_ED}`, url: PVGIS_URL },
      { label: 'Talens Peiró & Villalba JOM 2013 — native SX electricity mid 5.3 kWh/kg', url: TALENS },
      { label: 'Honaker / NETL 2020 coal-to-REE plant CAPEX peer (~$153k/t-y); this island is $120k/t-y', url: HONAKER },
      { label: 'ORNL MSX skid (membrane SX scale context only; not this CAPEX)', url: ORNL_MSX },
      { label: 'USGS MCS 2026 rare earths (NdPr oxide 2025e $69/kg; separated quotes)', url: USGS_REE },
    ],
    notes: 'Peer SX screening on purchased Longnan concentrate at the Long Beach map point. Not Maglut. Not chromatography. Recovery 0.95 and SEC 5.3 are Talens/commercial SX screening, not Maglut ARC-1. CAPEX $120k/t-y peer band (above the chromatography proxy, below Honaker/NETL 2020). Cash sign is whatever falls out. Not bankable. Not a Lynas/MP Materials plant. Purity is not simulated.',
  };
  return definition;
}

return { createReeSxCase };
});
