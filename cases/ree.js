(function exposeReeCase(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? require('../data/tea-screening.js') : root.TeaScreening,
    typeof require === 'function' ? require('../data/ionic-clay-longnan.js') : root.IonicClayLongnan
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReeCase = api;
})(globalThis, (model, tea, clay) => {
const { SUBSTANCES } = model;
const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=-13.53&lon=-48.22&peakpower=1&loss=14&angle=13&aspect=180&outputformat=json';
const DAILY_PV_ED = 4.24;
const DAILY_PV_EY = 1546.98;
const REO_KG_PER_DAY = 100;
const GRADE = clay.gradeKgReoPerKgClay;
const RECOVERY = clay.recovery;
const AMS_KG_PER_KG = clay.ammoniumSulfateKgPerKgReo;
const SEC = clay.electricityKWhPerKgReo;
const REGION = 'Goiás / Brazil';
const DENG_DOI = 'https://doi.org/10.1007/s11367-019-01582-1';
const USGS_REE = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-rare-earths.pdf';
const USGS_HEAVY = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-rare-earths-heavy.pdf';
const USGS_Y = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-yttrium.pdf';
const METEORIC = 'https://wcsecure.weblink.com.au/pdf/MEI/02825639.pdf';
const MINACU_URL = 'https://en.wikipedia.org/wiki/Mina%C3%A7u';

function right(kind, status, note, evidence) {
  return {
    kind,
    status,
    authorize: status === 'authorized' || status === 'assumed',
    note,
    ...(evidence ? { evidence } : {}),
  };
}

function clayStream(kg) {
  const reoKg = kg * GRADE;
  const mol = {};
  for (const oxide of clay.listedOxides) {
    mol[oxide] = reoKg * clay.renormalizedFractions[oxide] * 1000 / SUBSTANCES[oxide].molarMassG;
  }
  mol.Al2Si2O5OH4 = (kg - reoKg) * 1000 / SUBSTANCES.Al2Si2O5OH4.molarMassG;
  return { kind: 'material', mol, phase: 'solid', T_C: 25, P_bar: 1 };
}

function material(substance, kg, phase = 'solid') {
  return {
    kind: 'material',
    mol: { [substance]: kg * 1000 / SUBSTANCES[substance].molarMassG },
    phase,
    T_C: 25,
    P_bar: 1,
  };
}

function createReeCase() {
  const clayKg = REO_KG_PER_DAY / (GRADE * RECOVERY);
  const lixKg = REO_KG_PER_DAY * AMS_KG_PER_KG;
  const kWhPerDay = REO_KG_PER_DAY * SEC;
  const solarKWp = kWhPerDay / DAILY_PV_ED * 1.02;
  const electricityKWh = solarKWp * DAILY_PV_ED;
  const clayFeed = clayStream(clayKg);
  const lixiviant = material('NH42SO4', lixKg, 'solid');
  const power = { kind: 'electricity', kWh: electricityKWh };
  const definition = {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'clay', unit: 'material-source', sourcePreset: 'ionic-clay', params: { stream: clayFeed }, economics: tea.bindCost('ionic-clay') },
        { id: 'lixiviant', unit: 'material-source', sourcePreset: 'ammonium-sulfate', params: { stream: lixiviant }, economics: tea.bindCost('ammonium-sulfate') },
        { id: 'power', unit: 'electricity-source', params: { stream: power }, economics: tea.bindCapexPack('solar-pv', { capacity: solarKWp, region: REGION }) },
        {
          id: 'iac-leach',
          unit: 'iac-leach',
          capacity: REO_KG_PER_DAY,
          params: {
            gradeKgReoPerKgClay: GRADE,
            recovery: RECOVERY,
            ammoniumSulfateKgPerKgReo: AMS_KG_PER_KG,
            electricityKWhPerKgReo: SEC,
          },
          economics: tea.bindCapexPack('iac-leach', { capacity: REO_KG_PER_DAY, region: REGION }),
        },
        { id: 'ndpr', unit: 'material-sink', economics: tea.bindSale('ndpr-oxide', { region: REGION }) },
        { id: 'other-reo', unit: 'material-sink', economics: tea.bindSale('other-reo', { region: REGION }) },
        { id: 'residue', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'liquor', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'clay', port: 'out' }, to: { node: 'iac-leach', port: 'clay' } },
        { from: { node: 'lixiviant', port: 'out' }, to: { node: 'iac-leach', port: 'lixiviant' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'iac-leach', port: 'electricity' } },
        { from: { node: 'iac-leach', port: 'ndpr' }, to: { node: 'ndpr', port: 'in' } },
        { from: { node: 'iac-leach', port: 'otherReo' }, to: { node: 'other-reo', port: 'in' } },
        { from: { node: 'iac-leach', port: 'residue' }, to: { node: 'residue', port: 'in' } },
        { from: { node: 'iac-leach', port: 'liquor' }, to: { node: 'liquor', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { 'iac-leach': REO_KG_PER_DAY },
    },
  };
  const node = id => definition.graph.nodes.find(item => item.id === id);
  const clone = stream => JSON.parse(JSON.stringify(stream));
  node('power').siteResource = 'electricity';
  node('clay').siteResource = 'clay';
  node('lixiviant').siteResource = 'lixiviant';
  definition.site = {
    id: 'brazil-minacu',
    name: 'Minaçu, Goiás, Brazil',
    latitude: -13.53,
    longitude: -48.22,
    region: REGION,
    solarKWp,
    dailyPVKWhPerKWp: DAILY_PV_ED,
    resources: {
      electricity: {
        stream: clone(node('power').params.stream),
        quality: 'literature-estimate',
        evidence: `PVGIS-SARAH3 annual average ${DAILY_PV_ED} kWh/kWp·day (E_y ${DAILY_PV_EY} from frozen data/pvgis-minacu.json) × array sized to 100 kg recovered REO/day × 8.8 kWh/kg with 2% margin. Not a grid interconnection or concession.`,
      },
      clay: {
        stream: clone(node('clay').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased-looking ionic-clay feed is the Deng & Kendall 2019 Longnan literature basket placed on a Minaçu map point; not a mineral concession and not Serra Verde / Pela Ema.',
      },
      lixiviant: {
        stream: clone(node('lixiviant').params.stream),
        quality: 'user-assumption',
        evidence: 'Purchased fertilizer-grade ammonium sulfate assumed available; not a concession.',
      },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV_ED,
      quality: 'cited',
      source: 'PVGIS-SARAH3',
      retrieved: '2026-10-04',
      cite: {
        label: `PVGIS-SARAH3, 2005–2023 monthly at Minaçu (−13.53, −48.22); frozen data/pvgis-minacu.json E_y ${DAILY_PV_EY}, E_d ${DAILY_PV_ED}`,
        url: PVGIS_URL,
      },
      notes: `Frozen PVGIS totals.fixed E_d ${DAILY_PV_ED} kWh/kWp·day and E_y ${DAILY_PV_EY} kWh/kWp from data/pvgis-minacu.json, retrieved 2026-10-04. Not a plant-measured irradiance series.`,
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Demo electricity is on-site solar only.', [
        { label: 'Wikipedia: Minaçu (context, not an interconnection)', url: MINACU_URL },
      ]),
      brineConcession: right('concession', 'unverified', 'Not a mineral concession and not Serra Verde / Pela Ema. Longnan literature basket on a Minaçu map point.', [
        { label: 'USGS MCS 2026 rare earths (commodity context, not a concession)', url: USGS_REE },
      ]),
      clayPurchase: right('purchase', 'assumed', 'Purchased-looking ionic clay assumed available as a literature basket; not a mining concession', [
        { label: 'Deng & Kendall 2019 Longnan Table 1 (literature basket, not a concession)', url: DENG_DOI },
      ]),
      reagentPurchase: right('purchase', 'assumed', 'Purchased ammonium sulfate assumed available; not a contract', [
        { label: 'Fertilizer-grade ammonium sulfate screening purchase; not a contract', url: null },
      ]),
    },
    evidence: [
      { label: 'Minaçu, Goiás geography (map point, not a concession)', url: MINACU_URL },
      { label: `Solar: PVGIS, 2005–2023 monthly; annual E_y ${DAILY_PV_EY} kWh/kWp, E_d ${DAILY_PV_ED}`, url: PVGIS_URL },
      { label: 'Deng & Kendall 2019 ionic-clay LCI — Longnan Table 1 basket and Table 2 intensities', url: DENG_DOI },
      { label: 'USGS MCS 2026 rare earths (NdPr oxide 2025e $69/kg; separated quotes)', url: USGS_REE },
      { label: 'USGS MCS 2026 rare earths — heavy', url: USGS_HEAVY },
      { label: 'USGS MCS 2026 yttrium', url: USGS_Y },
      { label: 'Meteoric Caldeira scoping — ~70% contained-oxide payability for MREC (company scoping, not a market print)', url: METEORIC },
    ],
    notes: 'Longnan literature basket on a Minaçu map point. Ionic clay, one leach+precip+calcine screening block. 7 kg ammonium sulfate and 8.8 kWh per kg recovered listed REO (Deng & Kendall 2019 Table 2 mid / point values). 70% payability because SX is not in the model. Tm is unpriced (MCS 2025e heavy table has no Tm price; mass tracked, value 0). Nd+Pr sold as one co-product; the rest is one mixed-REO sale — not an NdPr clay assay. Linear small-plant CAPEX (~$50k/t-y) makes a pilot look cheap. Cash sign is screening. Not a mineral concession, not Serra Verde, not bankable.',
  };
  return definition;
}

return { createReeCase };
});
