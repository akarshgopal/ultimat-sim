(function exposeMaglutCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening,
    typeof require === 'function' ? require('../data/ionic-clay-longnan.js') : root.IonicClayLongnan
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MaglutCase = api;
})(globalThis, (model, tea, clay) => {
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=33.77&lon=-118.19&peakpower=1&loss=14&angle=20&aspect=180&outputformat=json';
const pvgis = typeof require === 'function' ? require('../data/pvgis-long-beach.json') : null;
const DAILY_PV_ED = pvgis ? pvgis.outputs.totals.fixed.E_d : 3.33;
const DAILY_PV_EY = pvgis ? pvgis.outputs.totals.fixed.E_y : 1213.78;
const REO_KG_PER_DAY = 10;
const RECOVERY = 0.914;
const SEC = 5;
const REGION = 'US West / California';
const FAR_RNS = 'https://www.investegate.co.uk/announcement/rns/ferro-alloy-resources-limited-npv--far/us-strategic-rare-earths-separation-company-mou/9787733';
const MINING_TECH = 'https://www.mining-technology.com/news/maglut-chromatography-rare-earth-processing-us/';
const TALENS = 'https://link.springer.com/article/10.1007/s11837-013-0719-8';
const ANDERSSON = 'https://doi.org/10.1021/ie5023223';
const NETL_OSTI = 'https://www.osti.gov/servlets/purl/1509123';
const HONAKER = 'https://www.netl.doe.gov/sites/default/files/2020-10/20VPRREE_Honaker_2.pdf';
const ORNL_MSX = 'https://www.ornl.gov/publication/process-scale-energy-efficient-membrane-solvent-extraction-process-rare-earth-recycling';
const USGS_REE = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-rare-earths.pdf';
const LONG_BEACH_URL = 'https://en.wikipedia.org/wiki/Long_Beach,_California';
const METEORIC = 'https://wcsecure.weblink.com.au/pdf/MEI/02825639.pdf';

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

function createMaglutCase() {
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
          id: 'chrom',
          unit: 'ree-chromatography',
          capacity: REO_KG_PER_DAY,
          params: {
            recovery: RECOVERY,
            electricityKWhPerKgReo: SEC,
          },
          economics: tea.bindCapexPack('ree-chromatography', { capacity: REO_KG_PER_DAY, region: REGION }),
        },
        { id: 'ndpr', unit: 'material-sink', economics: tea.bindSale('ndpr-oxide-separated', { region: REGION }) },
        { id: 'dytb', unit: 'material-sink', economics: tea.bindSale('dytb-oxide', { region: REGION }) },
        { id: 'light-reo', unit: 'material-sink', economics: tea.bindSale('light-reo', { region: REGION }) },
        { id: 'raffinate', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'concentrate', port: 'out' }, to: { node: 'chrom', port: 'concentrate' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'chrom', port: 'electricity' } },
        { from: { node: 'chrom', port: 'ndpr' }, to: { node: 'ndpr', port: 'in' } },
        { from: { node: 'chrom', port: 'dytb' }, to: { node: 'dytb', port: 'in' } },
        { from: { node: 'chrom', port: 'lightReo' }, to: { node: 'light-reo', port: 'in' } },
        { from: { node: 'chrom', port: 'raffinate' }, to: { node: 'raffinate', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { chrom: REO_KG_PER_DAY },
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
        evidence: `PVGIS-ERA5 annual average ${DAILY_PV_ED} kWh/kWp·day (E_y ${DAILY_PV_EY} from frozen data/pvgis-long-beach.json) × array sized to 10 kg recovered listed REO/day × 5 kWh/kg with 2% margin. Not a grid interconnection, not a Maglut plant meter.`,
      },
      concentrate: {
        stream: clone(node('concentrate').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased oxide-equivalent mixed concentrate is the Deng & Kendall 2019 Longnan listed-oxide basket (no kaolinite) placed on a Long Beach map point; not a mine and not a Maglut feed assay.',
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
      notes: `Frozen PVGIS totals.fixed E_d ${DAILY_PV_ED} kWh/kWp·day and E_y ${DAILY_PV_EY} kWh/kWp from data/pvgis-long-beach.json, retrieved 2026-10-05. Specified query aspect=180. Not a plant-measured irradiance series.`,
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Demo electricity is on-site solar only. Not a Maglut interconnection.', [
        { label: 'Wikipedia: Long Beach, California (geography, not an interconnection)', url: LONG_BEACH_URL },
      ]),
      concentratePurchase: right('purchase', 'assumed', 'Purchased mixed REO concentrate assumed available as a Longnan literature basket; not a mine and not a Maglut toll', [
        { label: 'USGS MCS 2026 rare earths (separated-oxide context for the mixed-concentrate purchase, not a contract)', url: USGS_REE },
        { label: 'Meteoric Caldeira scoping — ~70% contained-oxide payability for MREC (company scoping, not a Maglut toll)', url: METEORIC },
      ]),
    },
    evidence: [
      { label: 'Long Beach, California geography (map point, not a Maglut HQ or concession)', url: LONG_BEACH_URL },
      { label: `Solar: PVGIS, 2005–2023 monthly; annual E_y ${DAILY_PV_EY} kWh/kWp, E_d ${DAILY_PV_ED}`, url: PVGIS_URL },
      { label: 'FAR RNS — US strategic rare earths separation company MOU (company-reported pilot recovery/purity, not CAPEX)', url: FAR_RNS },
      { label: 'Mining Technology — Maglut chromatography rare-earth processing US (press, not a kWh/kg or CAPEX quote)', url: MINING_TECH },
      { label: 'Talens Peiró & Villalba JOM 2013 — SX electricity order used as peer proxy SEC', url: TALENS },
      { label: 'Andersson et al. IECR 2014 MCSGP — productivity, not electricity', url: ANDERSSON },
      { label: 'NETL IX LCI pumping (lab pumping floor, not this default)', url: NETL_OSTI },
      { label: 'Honaker / NETL 2020 coal-to-REE plant CAPEX peer', url: HONAKER },
      { label: 'ORNL MSX skid 300 kg REO/month (membrane SX scale context only; not chromatography, not CAPEX)', url: ORNL_MSX },
      { label: 'USGS MCS 2026 rare earths (NdPr oxide 2025e $69/kg; separated quotes)', url: USGS_REE },
    ],
    notes: 'Long Beach map point only — not a Maglut HQ, not plot rights, not a concession. ARC-1-style chromatography screening on purchased Longnan listed-oxide concentrate (no kaolinite). Company-reported pilot (FAR RNS / Maglut press) ~91.4% average separation recovery and >99% / 99.9% purity claims; this model uses 0.914 as a mass recovery only and does not certify purity; 90.25% precip step is not stacked; SEC and CAPEX are proxy bands, not Maglut quotes; cash sign is whatever falls out; not bankable. ORNL MSX 300 kg REO/month is scale context only (membrane SX, not chromatography, not CAPEX).',
  };
  return definition;
}

return { createMaglutCase };
});
