(function exposeTeaScreening(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TeaScreening = api;
})(globalThis, () => {
// Screening TEA intensities and price bands for Foundry cash gates.
// Mid of a cited band + note. Never bankable quotes; do not invent contracts.

function row(value, unit, quality, source, note, evidence) {
  return { value, unit, quality, source, note, evidence };
}

const USGS_LI = 'https://pubs.usgs.gov/periodicals/mcs2025/mcs2025-lithium.pdf';
const USGS_BR = 'https://pubs.usgs.gov/periodicals/mcs2024/mcs2024-bromine.pdf';
const USGS_K = 'https://pubs.usgs.gov/periodicals/mcs2024/mcs2024-potash.pdf';
const NREL_DLE = 'https://doi.org/10.2172/1782801';
const NREL_ATB = 'https://atb.nrel.gov/';
const DOE_H2 = 'https://www.energy.gov/eere/fuelcells/hydrogen-production-electrolysis';
const IEA_NH3 = 'https://www.iea.org/reports/ammonia-technology-roadmap';
const EIA_HH = 'https://www.eia.gov/dnav/ng/hist/rngwhhdm.htm';

const prices = {
  lithium: row(
    14, '$/kg', 'cited', 'USGS MCS 2025 lithium',
    'USGS MCS 2025 battery-grade Li₂CO₃ annual avg ~$14,000/t (2024e). Model product is Li salt / LiCl-like — LCE proxy for screening, not a LiCl contract.',
    [{ label: 'USGS Mineral Commodity Summaries 2025 — Lithium (battery-grade Li₂CO₃ ~$14,000/t 2024e)', url: USGS_LI }]
  ),
  bromine: row(
    3.1, '$/kg', 'cited', 'USGS MCS 2024 bromine',
    'USGS MCS 2024 bromine import unit value ~$3.10/kg (2023). Screening offtake, not a Br₂ contract.',
    [{ label: 'USGS Mineral Commodity Summaries 2024 — Bromine (import unit value ~$3.10/kg, 2023)', url: USGS_BR }]
  ),
  potash: row(
    0.35, '$/kg', 'cited', 'USGS MCS 2024 potash',
    'USGS MCS potash ~$300–400/t muriate order; mid ~$0.35/kg screening of that band. Not a KCl contract.',
    [{ label: 'USGS Mineral Commodity Summaries 2024 — Potash (~$300–400/t muriate order)', url: USGS_K }]
  ),
  salt: row(
    0.06, '$/kg', 'screening', 'industrial NaCl band',
    'Industrial NaCl ~$40–80/t band; mid ~$0.06/kg. Screening — no single USGS $/kg row pinned.',
    [{ label: 'Industrial NaCl ~$40–80/t commodity band (screening mid $0.06/kg)', url: null }]
  ),
  gypsum: row(
    0.02, '$/kg', 'screening', 'bulk gypsum band',
    'Bulk gypsum ~$10–30/t; mid ~$0.02/kg screening. Not a wallboard quote.',
    [{ label: 'Bulk gypsum ~$10–30/t commodity band (screening mid $0.02/kg)', url: null }]
  ),
  magnesium: row(
    0.08, '$/kg', 'screening', 'brine Mg compound band',
    'Brine Mg compound / MgCl₂·hexahydrate commodity band far below Mg metal; do not use Mg-metal prices. Mid ~$0.08/kg screening.',
    [{ label: 'Brine magnesium compound screening mid $0.08/kg — not Mg-metal', url: null }]
  ),
  caustic: row(
    0.45, '$/kg', 'screening', 'NaOH commodity band',
    'NaOH ~$300–600/t commodity band; mid $0.45/kg screening. Not a caustic contract.',
    [{ label: 'NaOH ~$300–600/t commodity band (screening mid $0.45/kg)', url: null }]
  ),
  ammonia: row(
    0.45, '$/kg', 'screening', 'NH3 fertilizer band',
    'NH₃ ~$300–600/t; mid $0.45/kg screening (IEA/fertilizer market order). Not an offtake quote.',
    [{ label: 'IEA Ammonia Technology Roadmap (fertilizer-market order; screening mid $0.45/kg)', url: IEA_NH3 }]
  ),
  oxygen: row(
    0.05, '$/kg', 'screening', 'industrial O2',
    'Industrial O₂ screening ~$0.05/kg. Not a merchant-gas contract.',
    [{ label: 'Industrial oxygen screening $0.05/kg', url: null }]
  ),
  methane: row(
    1, '$/kg', 'screening', 'green-premium screening',
    'Screening green-premium offtake (~$28/MMBtu order), not Henry Hub fossil gas. EIA/Henry Hub is contrast only — not this $1/kg value.',
    [{ label: 'EIA Henry Hub (fossil-gas contrast only; not the model $1/kg CH₄)', url: EIA_HH }]
  ),
  methanol: row(
    0.4, '$/kg', 'screening', 'commodity MeOH band',
    'Screening mid of commodity methanol ~$250–500/t band ($0.40/kg). Not a plant quote.',
    [{ label: 'Commodity methanol ~$250–500/t band (screening mid $0.40/kg); not a plant quote', url: null }]
  ),
};

const costs = {
  power: row(
    0.04, '$/kWh', 'screening', 'industrial power band',
    'Utility / industrial power screening mid (~$30–50/MWh band). Not a PPA.',
    [{ label: 'Industrial power ~$30–50/MWh screening mid ($0.04/kWh); not a PPA', url: null }]
  ),
  brine: row(
    0.0005, '$/kg', 'screening', 'concession/pumping OOM',
    'Concession / pumping order-of-magnitude. Not a lease quote.',
    [{ label: 'Brine concession/pumping screening $0.0005/kg; not a lease quote', url: null }]
  ),
  water: row(
    0.001, '$/kg', 'screening', 'process water',
    'Process water screening. Not a municipal or concession tariff.',
    [{ label: 'Process water screening $0.001/kg', url: null }]
  ),
  seawater: row(
    0.001, '$/kg', 'screening', 'seawater intake',
    'Seawater intake screening (aligned with process-water OOM). Not an intake tariff.',
    [{ label: 'Seawater intake screening $0.001/kg; not an intake tariff', url: null }]
  ),
  'salt-feed': row(
    0.06, '$/kg', 'screening', 'industrial NaCl band',
    'Purchased salt-feed aligned with salt product band (~$0.06/kg). Screening, not a local quote.',
    [{ label: 'Salt-feed screening $0.06/kg, aligned with industrial NaCl product band', url: null }]
  ),
};

const capex = {
  minerals: row(
    80, '$/(kg brine/day)', 'screening', 'NREL DLE TEA order (OSTI 1782801)',
    'Screening brine-throughput intensity so CAPEX grows with size. Scaled from NREL TEA lithium-from-geothermal-brines (OSTI 1782801 / NREL/TP-5700-79178): example ~$52.3M CAPEX / 20,000 t/y LCE ≈ $2,615 per t-y LCE. Multi-product Dead Sea minerals ≠ Salton Sea DLE — OOM informed by that order, not a quote.',
    [
      { label: 'NREL TEA: lithium from geothermal brines (OSTI 1782801 / NREL/TP-5700-79178)', url: NREL_DLE, doi: '10.2172/1782801' },
    ]
  ),
  'chlor-alkali': row(
    1500, '$/(kg NaOH/day)', 'screening', 'chlor-alkali TEA order',
    'Chlor-alkali plant TEA order; screening intensity, not a vendor quote.',
    [{ label: 'Chlor-alkali CAPEX intensity screening ~$1500/(kg NaOH/day); not a vendor quote', url: null }]
  ),
  'bromine-recovery': row(
    800, '$/(kg Br2/day)', 'screening', 'bromine recovery TEA order',
    'Bromine-recovery CAPEX intensity screening. Not a vendor quote.',
    [{ label: 'Bromine-recovery CAPEX intensity screening ~$800/(kg Br₂/day)', url: null }]
  ),
  asu: row(
    400, '$/(kg N2/day)', 'screening', 'ASU TEA order',
    'Air-separation CAPEX intensity screening. Not a vendor quote.',
    [{ label: 'ASU CAPEX intensity screening ~$400/(kg N₂/day)', url: null }]
  ),
  ammonia: row(
    2000, '$/(kg NH3/day)', 'screening', 'Haber–Bosch / e-ammonia OOM',
    'Haber–Bosch / e-ammonia CAPEX intensity screening OOM. Not a plant quote.',
    [{ label: 'IEA Ammonia Technology Roadmap (family cite; screening CAPEX intensity)', url: IEA_NH3 }]
  ),
};

const demand = {
  unlimited: row(
    1e12, 'kg/year', 'screening', 'placeholder offtake',
    'Unlimited demand is a screening placeholder (no market offtake model), not a sales forecast.',
    [{ label: 'annualDemandLimit 1e12 is a screening placeholder, not a sales forecast', url: null }]
  ),
};

const fuelsCapexNote = row(
  null, null, 'screening', 'NREL ATB / DOE H2 family',
  'Fuel-path converter CAPEX lumps are screening at demo capacity (not vendor quotes). Family: NREL ATB / DOE hydrogen electrolysis order.',
  [
    { label: 'NREL Annual Technology Baseline (family cite; not a plant quote)', url: NREL_ATB },
    { label: 'DOE hydrogen production: electrolysis (family cite)', url: DOE_H2 },
  ]
);

function must(map, key, kind) {
  const found = map[key];
  if (!found) throw new Error(`Unknown TEA ${kind} ${key}`);
  return found;
}

function bindSale(key) {
  const item = must(prices, key, 'price');
  return {
    disposition: 'sale',
    unitPrice: item.value,
    annualDemandLimit: demand.unlimited.value,
    quality: item.quality,
    source: item.source,
    note: item.note,
    evidence: item.evidence,
  };
}

function bindCost(key) {
  const item = must(costs, key, 'cost');
  return {
    unitCost: item.value,
    quality: item.quality,
    source: item.source,
    note: item.note,
    evidence: item.evidence,
  };
}

function bindCapex(key, extra = {}) {
  const item = must(capex, key, 'capex');
  return {
    capexRate: item.value,
    fixedOMPercent: extra.fixedOMPercent ?? 4,
    variableOM: extra.variableOM ?? 0,
    assetLifeYears: extra.assetLifeYears ?? 20,
    quality: item.quality,
    source: item.source,
    note: item.note,
    evidence: item.evidence,
  };
}

function bindPriceFields(key) {
  const item = must(prices, key, 'price');
  return {
    unitPrice: item.value,
    quality: item.quality,
    source: item.source,
    note: item.note,
    evidence: item.evidence,
  };
}

function snapshot(map, keys) {
  return keys.map(key => {
    const item = map[key];
    return {
      key,
      value: item.value,
      unit: item.unit,
      quality: item.quality,
      source: item.source,
      note: item.note,
      evidence: item.evidence,
    };
  });
}

function abundanceEvidence() {
  return {
    prices: snapshot(prices, ['lithium', 'bromine', 'potash', 'salt', 'gypsum', 'magnesium', 'caustic', 'ammonia', 'oxygen']),
    costs: snapshot(costs, ['power', 'brine', 'water', 'salt-feed']),
    capex: snapshot(capex, ['minerals', 'chlor-alkali', 'bromine-recovery', 'asu', 'ammonia']),
    demand: demand.unlimited,
  };
}

return {
  prices,
  costs,
  capex,
  demand,
  fuelsCapexNote,
  bindSale,
  bindCost,
  bindCapex,
  bindPriceFields,
  abundanceEvidence,
};
});
