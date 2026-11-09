(function exposeSize(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./model') : root.FlowsheetModel,
    typeof require === 'function' ? require('./solve') : root.FlowsheetSolver,
    typeof require === 'function' ? require('./footprint') : root.FlowsheetFootprint,
    typeof require === 'function' ? require('./heat') : root.FlowsheetHeat
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetSize = api;
})(globalThis, (model, solver, footprint, heat) => {
const { SUBSTANCES, cloneStream, scaleStream, streamMassKg } = model;
const { solveOperation } = solver;
const { cascadeHeat } = heat;

// Outer plant-sizing loop. solveOperation runs at fixed installed capacity;
// this module chooses those capacities.
//
// product kg/day
//   -> per-product strategy estimates converter duties and source budgets
//   -> waste heat cascades onto T-feasible process sinks; unmet heat is bought
//      as electric resistance (COP=1) and counted in PV. Parked converters
//      contribute no waste heat.
//   -> solarKWp from site.dailyPVKWhPerKWp
//   -> solveOperation
//   -> recycle / yield credit from the solved plant
//   -> repeat until the operating residual is within tolerance
//
// Prices never enter the sizing loop. Land hectares come from engine/footprint.js.
// Solar installedCapex/fixedOM scale with kWp only so the definition stays
// self-consistent; they do not feed back into iterateSize.

const H2_PER_KG_CH4 = 4 * SUBSTANCES.H2.molarMassG / SUBSTANCES.CH4.molarMassG;
const CO2_PER_KG_CH4 = SUBSTANCES.CO2.molarMassG / SUBSTANCES.CH4.molarMassG;
const WATER_KG_PER_KG_H2 = SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
const WATER_KG_PER_KG_CH4 = H2_PER_KG_CH4 * WATER_KG_PER_KG_H2;
const RECOVERED_WATER_PER_KG_CH4 = 2 * SUBSTANCES.H2O.molarMassG / SUBSTANCES.CH4.molarMassG;
const DEFAULT_MAX_ITERATIONS = 20;
const DEFAULT_TOLERANCE = 1e-8;
const PRODUCT_ALIASES = {
  ch4: 'CH4',
  methane: 'CH4',
  h2: 'H2',
  li: 'lithium',
  licl: 'lithium',
  lithium: 'lithium',
  salt: 'salt',
  meoh: 'methanol',
  ch3oh: 'methanol',
  methanol: 'methanol',
  nh3: 'ammonia',
  ammonia: 'ammonia',
  module: 'module',
  'pv-module': 'module',
  pvmodule: 'module',
  pv: 'module',
  steel: 'steel',
  fe: 'steel',
  dri: 'steel',
  iron: 'steel',
  ethylene: 'ethylene',
  c2h4: 'ethylene',
  mto: 'ethylene',
  olefin: 'ethylene',
  diesel: 'diesel',
  ft: 'diesel',
  syncrude: 'diesel',
  urea: 'urea',
  'co(nh2)2': 'urea',
  titanium: 'titanium',
  ti: 'titanium',
  sponge: 'titanium',
  'float-glass': 'float-glass',
  glass: 'float-glass',
  'solar-glass': 'float-glass',
  // The kiln makes clinker (the ~4–5% gypsum is omitted); clinker aliases
  // size the `cement` sale, not a separate clinker contract.
  cement: 'cement',
  clinker: 'cement',
  'cem-i': 'cement',
  portland: 'cement',
  // SX-EW cathode; TEA sale key `copper-cathode`.
  copper: 'copper',
  cu: 'copper',
  cathode: 'copper',
  'cu-ew': 'copper',
  'copper-cathode': 'copper',
  // Separated NdPr oxide (TEA sale key `ndpr-oxide-separated`), not a mixed
  // un-separated oxide.
  ndpr: 'ndpr',
  'nd-pr': 'ndpr',
  'ndpr-oxide': 'ndpr',
  'ndpr-oxide-separated': 'ndpr',
  nd2o3: 'ndpr',
  maglut: 'ndpr',
};
const PV_MODULE_CHAIN_UNITS = Object.freeze([
  'mg-si', 'polysilicon', 'bayer-alumina', 'aluminium-smelter', 'pv-module',
]);
// Default electricity per kg of each unit's product, kWh/kg.
const PV_MODULE_SEC_DEFAULTS = Object.freeze({
  'mg-si': 12,
  polysilicon: 65,
  'bayer-alumina': 3.5,
  'aluminium-smelter': 14,
  'pv-module': 0.05,
});
const RESOURCE_RIGHT_KEY = Object.freeze({
  grid: 'gridImport',
  freshwater: 'freshwater',
  seawater: 'seawaterIntake',
  brine: 'brineConcession',
  salt: 'saltPurchase',
  discharge: 'seawaterDischarge',
});

function rightIsAuthorized(right) {
  if (!right) return true;
  if (right.authorize === true) return true;
  if (right.authorize === false) return false;
  return right.status === 'authorized' || right.status === 'assumed';
}

function assertSizeMayAssume(definition, resourceIds) {
  const rights = definition?.site?.rights;
  if (!rights) return;
  for (const resourceId of resourceIds) {
    const key = RESOURCE_RIGHT_KEY[resourceId];
    if (!key) continue;
    const right = rights[key];
    if (right && !rightIsAuthorized(right)) {
      throw new Error(`size-to-target cannot assume ${key}`);
    }
  }
}

function withholdUnauthorizedSupply(definition) {
  const site = definition?.site;
  if (!site?.resources) return;
  if (site.resources.grid && !rightIsAuthorized(site.rights?.gridImport)) {
    site.resources.grid.stream = { kind: 'electricity', kWh: 0 };
  }
  if (site.resources.freshwater && !rightIsAuthorized(site.rights?.freshwater)) {
    site.resources.freshwater.stream = {
      kind: 'material',
      mol: { H2O: 0 },
      phase: 'liquid',
      T_C: 25,
      P_bar: 1,
    };
  }
}

function resolveDefinition(caseOrBuilder) {
  const definition = typeof caseOrBuilder === 'function' ? caseOrBuilder() : caseOrBuilder;
  if (!definition?.graph?.nodes) throw new Error('sizeToProduct needs a case definition or builder');
  return JSON.parse(JSON.stringify(definition));
}

function nodeBy(definition, predicate) {
  return definition.graph.nodes.find(predicate);
}

// Node with this id, else the node bound to this site resource.
function siteNode(definition, id) {
  return nodeBy(definition, node => node.id === id) || nodeBy(definition, node => node.siteResource === id);
}

function setpointsOf(definition) {
  return definition.operation.setpoints || (definition.operation.setpoints = {});
}

function setDuty(definition, node, value) {
  setpointsOf(definition)[node.id] = value;
  node.capacity = value;
}

function converter(definition, unit) {
  if (unit === 'dac') return nodeBy(definition, node => String(node.unit).startsWith('dac'));
  if (unit === 'desal') return nodeBy(definition, node => ['swro', 'med', 'msf'].includes(node.unit));
  return nodeBy(definition, node => node.unit === unit);
}

function hasWaterRecycle(definition, sabatier) {
  return definition.graph.edges.some(edge => edge.recycle && edge.from.node === sabatier.id);
}

function dailyPvKWhPerKWp(definition) {
  const listed = Number(definition.site?.dailyPVKWhPerKWp);
  return listed > 0 ? listed : 0;
}

function electricityNode(definition) {
  return nodeBy(definition, node => node.id === 'electricity')
    || nodeBy(definition, node => node.id === 'power')
    || nodeBy(definition, node => node.unit === 'electricity-source' || node.siteResource === 'electricity');
}

function sourceFeeding(definition, nodeId, port) {
  const edge = definition.graph.edges.find(item => item.to.node === nodeId && item.to.port === port);
  if (!edge) return null;
  const upstream = nodeBy(definition, node => node.id === edge.from.node);
  if (!upstream) return null;
  if (String(upstream.unit).includes('source')) return upstream;
  // Walk past intake pumps, gas blowers and buffers to the assay source.
  if (upstream.unit === 'intake-pump' || upstream.unit === 'gas-blower' || upstream.unit === 'material-buffer') {
    return sourceFeeding(definition, upstream.id, 'in') || upstream;
  }
  if (upstream.unit === 'material-mixer' || upstream.unit === 'electrical-bus') {
    const feed = definition.graph.edges.find(item => item.to.node === upstream.id && !item.recycle);
    return feed ? nodeBy(definition, node => node.id === feed.from.node) : upstream;
  }
  return upstream;
}

// A listed pumpKWhPerKg wins over pumpKWhPerM3 (default 0.4 kWh/m³).
function pumpElectricityKWh(pump, kg, defaultDensity) {
  const density = Number(pump.params?.densityKgM3 ?? defaultDensity) || defaultDensity;
  const useKg = pump.params?.pumpKWhPerKg != null && pump.params?.pumpKWhPerKg !== '';
  const sec = useKg ? Number(pump.params.pumpKWhPerKg) : Number(pump.params?.pumpKWhPerM3 ?? 0.4);
  if (!(sec >= 0) || !(kg > 0) || !(density > 0)) return 0;
  return useKg ? kg * sec : (kg / density) * sec;
}

function intakePumpElectricityKWh(definition, brineKg) {
  const pump = nodeBy(definition, node => node.unit === 'intake-pump' && (node.id === 'brine-pump' || node.id.includes('brine')));
  return pump ? pumpElectricityKWh(pump, brineKg, 1025) : 0;
}

// Normal m³ of air per kg: 22.414 L/mol over the site air's molar mass
// (dry air, 29 g/mol, when the site lists none).
function airNm3PerKgFromDefinition(definition) {
  const air = siteNode(definition, 'air');
  const stream = air?.params?.stream;
  if (!stream?.mol) return 22.414 / 29;
  const mass = streamMassKg(stream);
  const totalMol = Object.values(stream.mol).reduce((sum, amount) => sum + amount, 0);
  if (!(mass > 0) || !(totalMol > 0)) return 22.414 / 29;
  return (totalMol * 22.414 / 1000) / mass;
}

function liftElectricityKWh(definition, { seawaterKg = 0, airKg = 0, feedDensity = 1025 } = {}) {
  let kWh = 0;
  for (const pump of definition.graph.nodes.filter(node => node.unit === 'intake-pump' && node.id !== 'brine-pump')) {
    kWh += pumpElectricityKWh(pump, seawaterKg, feedDensity);
  }
  for (const blower of definition.graph.nodes.filter(node => node.unit === 'gas-blower')) {
    const useKg = blower.params?.blowerKWhPerKg != null && blower.params?.blowerKWhPerKg !== '';
    const sec = useKg
      ? Number(blower.params.blowerKWhPerKg)
      : Number(blower.params?.blowerKWhPerNm3 ?? 0.001);
    if (!(sec >= 0) || !(airKg > 0)) continue;
    kWh += useKg ? airKg * sec : airKg * airNm3PerKgFromDefinition(definition) * sec;
  }
  return kWh;
}

function syncLiftDuties(definition, duties) {
  const seawaterKg = Number(duties.seawaterKg) || 0;
  const airKg = Number(duties.airKg) || 0;
  const swro = Number(duties.swro) || 0;
  for (const pump of definition.graph.nodes.filter(node => node.unit === 'intake-pump' && node.id !== 'brine-pump')) {
    const density = Number(pump.params?.densityKgM3 ?? 1025) || 1025;
    let m3 = 0;
    if (seawaterKg > 0 && density > 0) m3 = seawaterKg / density;
    else if (swro > 0) {
      const desal = converter(definition, 'desal');
      const recovery = Number(desal?.params?.recovery ?? 0.45) || 0.45;
      m3 = recovery > 0 ? swro / recovery : 0;
    }
    setDuty(definition, pump, m3);
  }
  for (const blower of definition.graph.nodes.filter(node => node.unit === 'gas-blower')) {
    setDuty(definition, blower, airKg > 0 ? airKg * airNm3PerKgFromDefinition(definition) : 0);
  }
}

// Desalination defaults: SWRO at 45% recovery, 3.5 kWh/m³ product water.
function desalParams(desal) {
  return {
    recovery: Number(desal?.params?.recovery ?? 0.45) || 0.45,
    productDensity: Number(desal?.params?.productDensityKgM3 ?? 1000) || 1000,
    feedDensity: Number(desal?.params?.feedDensityKgM3 ?? 1025) || 1025,
    secDesal: Number(desal?.params?.secKWhPerM3 ?? desal?.params?.electricityKWhPerM3 ?? 3.5),
    heatDesal: Number(desal?.params?.heatKWhPerM3 ?? 0),
    minHeatDesal: Number(desal?.params?.minHeatT_C ?? 0),
  };
}

// DAC defaults per kg CO2. Electroswing DAC regenerates electrically, so it has no heat duty.
function dacParams(dac) {
  return {
    secDac: Number(dac?.params?.electricityKWhPerKgCO2 ?? 0.5),
    heatDac: String(dac?.unit).includes('electroswing') ? 0 : Number(dac?.params?.heatKWhPerKgCO2 ?? 0),
    minHeatDac: Number(dac?.params?.minHeatT_C ?? 80),
    captureFraction: Number(dac?.params?.captureFraction ?? 0.9),
    consumablesPerKgCO2: Number(dac?.params?.consumablesPerKgCO2 ?? 0),
  };
}

// Make-up water from desalination when there is a desal block; else the water
// source supplies it directly.
function waterDuty(chain, makeupWaterKg) {
  if (!chain.desal) return { swro: 0, seawaterKg: makeupWaterKg };
  const swro = makeupWaterKg / chain.productDensity;
  return { swro, seawaterKg: (chain.recovery > 0 ? swro / chain.recovery : 0) * chain.feedDensity };
}

function chainParams(definition) {
  const sabatier = converter(definition, 'sabatier');
  const electrolyzer = converter(definition, 'electrolyzer');
  const dac = converter(definition, 'dac');
  const desal = converter(definition, 'desal');
  if (!sabatier) throw new Error('sizeToProduct needs a Sabatier block to size methane demand');
  return {
    sabatier,
    electrolyzer,
    dac,
    desal,
    h2PerKg: H2_PER_KG_CH4,
    co2PerKg: CO2_PER_KG_CH4,
    waterKgPerKg: WATER_KG_PER_KG_CH4,
    recoveredWaterPerKg: RECOVERED_WATER_PER_KG_CH4,
    ...desalParams(desal),
    ...dacParams(dac),
    secH2: Number(electrolyzer?.params?.secKWhPerKgH2 ?? 52),
    secCh4: Number(sabatier.params?.electricityKWhPerKgCH4 ?? sabatier.params?.secKWhPerKgCH4 ?? 1),
    heatKWhPerKgCH4: Number(sabatier.params?.heatKWhPerKgCH4 ?? 2.86),
    wasteHeatT_C: Number(sabatier.params?.wasteHeatT_C ?? 250),
    recycle: hasWaterRecycle(definition, sabatier),
  };
}

function parkedSet(parked) {
  return new Set(parked.filter(Boolean).map(item => (typeof item === 'string' ? item : item.id)));
}

function converterActivity(definition, node) {
  const cap = Number(node.capacity);
  const sp = Number(definition.operation?.setpoints?.[node.id]);
  if (Number.isFinite(cap) && cap >= 0 && Number.isFinite(sp) && sp >= 0) return Math.min(cap, sp);
  if (Number.isFinite(sp) && sp >= 0) return sp;
  if (Number.isFinite(cap) && cap >= 0) return cap;
  return 0;
}

function converterWasteHeat(node, activity) {
  if (!(activity > 0)) return null;
  const params = node.params || {};
  let kWh = 0;
  let T_C = Number(params.wasteHeatT_C);
  if (node.unit === 'sabatier') {
    kWh = activity * Number(params.heatKWhPerKgCH4 ?? 2.86);
    if (!Number.isFinite(T_C)) T_C = 250;
  } else if (node.unit === 'methanol') {
    kWh = activity * Number(params.wasteHeatKWhPerKg ?? params.heatKWhPerKg ?? 0.43);
    if (!Number.isFinite(T_C)) T_C = 250;
  } else if (node.unit === 'med' || node.unit === 'msf') {
    kWh = activity * Number(params.heatKWhPerM3 ?? 0);
    if (!Number.isFinite(T_C)) T_C = 40;
  } else if (String(node.unit).startsWith('dac')) {
    kWh = activity * Number(params.heatKWhPerKgCO2 ?? 0);
    if (!Number.isFinite(T_C)) T_C = 40;
  } else {
    kWh = activity * Number(params.wasteHeatKWhPerKg ?? params.heatKWhPerKg ?? 0);
  }
  if (!(kWh > 0) || !Number.isFinite(T_C)) return null;
  return { id: node.id, kWh, T_C };
}

function liveHeatSources(definition, parked) {
  const skip = parkedSet(parked);
  const sources = [];
  for (const node of definition.graph.nodes) {
    if (skip.has(node.id) || skip.has(node.unit)) continue;
    const source = converterWasteHeat(node, converterActivity(definition, node));
    if (source) sources.push(source);
  }
  return sources;
}

function processHeatSinks(definition, parked = []) {
  const skip = parkedSet(parked);
  const sinks = [];
  for (const node of definition.graph.nodes) {
    if (skip.has(node.id) || skip.has(node.unit)) continue;
    const activity = converterActivity(definition, node);
    if (!(activity > 0)) continue;
    const params = node.params || {};
    if (String(node.unit).startsWith('dac') && node.unit !== 'dac-electroswing') {
      const demandKWh = activity * Number(params.heatKWhPerKgCO2 ?? 0);
      if (demandKWh > 0) {
        sinks.push({ id: node.id, demandKWh, minT_C: Number(params.minHeatT_C ?? 80) });
      }
    }
    if (node.unit === 'med' || node.unit === 'msf') {
      const demandKWh = activity * Number(params.heatKWhPerM3 ?? 0);
      if (demandKWh > 0) {
        sinks.push({ id: node.id, demandKWh, minT_C: Number(params.minHeatT_C ?? 70) });
      }
    }
  }
  return sinks;
}

// Cascade waste heat from live converters (plus the strategy's own estimated
// sources) onto process sinks. Converters listed in `parked`, or already given
// as estimated sources, are not read from the graph. heatCredit === false
// disables the cascade: all sink demand is purchased.
function dutyHeat({ definition, sources = [], sinks, parked = [], heatCredit }) {
  if (heatCredit === false) {
    const demandKWh = sinks.reduce((sum, sink) => sum + (Number(sink.demandKWh) || 0), 0);
    return { heatCoveredKWh: 0, purchasedHeatKWh: demandKWh, heatResidualKWh: demandKWh };
  }
  const live = liveHeatSources(definition, [...parked, ...sources.map(item => item.id)]);
  const cascade = cascadeHeat({ sources: [...live, ...sources], sinks });
  return {
    heatCoveredKWh: cascade.coveredKWh,
    purchasedHeatKWh: cascade.residualDemandKWh,
    heatResidualKWh: cascade.residualDemandKWh,
  };
}

// Unmet process heat after the cascade is electric resistance (COP=1) and
// adds to PV; heat the cascade covers does not.
function powerDuties(processElectricityKWh, cascade, yieldPerKWp) {
  const electricityKWh = processElectricityKWh + cascade.heatResidualKWh;
  return {
    processElectricityKWh,
    electricityKWh,
    heatKWh: cascade.purchasedHeatKWh,
    heatCoveredKWh: cascade.heatCoveredKWh,
    heatResidualKWh: cascade.heatResidualKWh,
    solarKWp: yieldPerKWp > 0 ? electricityKWh / yieldPerKWp : 0,
  };
}

function reactionProductSink(definition, converterNode, port) {
  const edge = definition.graph.edges.find(item => item.from.node === converterNode.id && item.from.port === port);
  if (!edge) {
    return nodeBy(definition, node => String(node.unit).includes('sink') && (
      node.id === port || node.id === `${converterNode.id}-product` || node.id === `${port}-product`
    ));
  }
  const sink = nodeBy(definition, node => node.id === edge.to.node);
  return sink && String(sink.unit).includes('sink') ? sink : null;
}

function h2Chain(definition) {
  const electrolyzer = converter(definition, 'electrolyzer');
  if (!electrolyzer) throw new Error('sizeToProduct needs an electrolyzer to size hydrogen demand');
  const desal = converter(definition, 'desal');
  const water = desal
    ? siteNode(definition, 'seawater') || sourceFeeding(definition, desal.id, 'feed')
    : sourceFeeding(definition, electrolyzer.id, 'water')
      || nodeBy(definition, node => node.id === 'water' || node.siteResource === 'water');
  if (!desal && !water) {
    throw new Error('sizeToProduct needs desalination or a water source to size hydrogen demand');
  }
  return {
    electrolyzer,
    desal,
    dac: converter(definition, 'dac'),
    sabatier: converter(definition, 'sabatier'),
    water,
    ...desalParams(desal),
    secH2: Number(electrolyzer.params?.secKWhPerKgH2 ?? 52),
  };
}

// True when `feed` is the chain's own converter (by id) or any node of that unit.
function feedsFrom(feed, node, unit) {
  return feed.unit === unit || Boolean(node && feed.id === node.id);
}

function methanolChain(definition) {
  const methanol = converter(definition, 'methanol');
  if (!methanol) throw new Error('sizeToProduct needs a methanol block to size methanol demand');
  const sink = reactionProductSink(definition, methanol, 'methanol');
  if (!sink) throw new Error('sizeToProduct needs a methanol sink');
  const h2Feed = sourceFeeding(definition, methanol.id, 'hydrogen');
  const co2Feed = sourceFeeding(definition, methanol.id, 'co2');
  if (!h2Feed) throw new Error('sizeToProduct needs a hydrogen feed to size methanol demand');
  if (!co2Feed) throw new Error('sizeToProduct needs a CO2 feed to size methanol demand');
  const electrolyzer = converter(definition, 'electrolyzer');
  const dac = converter(definition, 'dac');
  const desal = converter(definition, 'desal');
  return {
    methanol,
    sink,
    electrolyzer,
    dac,
    desal,
    h2Feed,
    co2Feed,
    usesElectrolyzer: feedsFrom(h2Feed, electrolyzer, 'electrolyzer'),
    usesDac: Boolean(dac) && (co2Feed.id === dac.id || String(co2Feed.unit || '').startsWith('dac')),
    // CO2 + 3 H2 -> CH3OH + H2O
    h2PerKg: 3 * SUBSTANCES.H2.molarMassG / SUBSTANCES.CH3OH.molarMassG,
    co2PerKg: SUBSTANCES.CO2.molarMassG / SUBSTANCES.CH3OH.molarMassG,
    ...desalParams(desal),
    ...dacParams(dac),
    secH2: Number(electrolyzer?.params?.secKWhPerKgH2 ?? 52),
    secMeoh: Number(methanol.params?.electricityKWhPerKg ?? 0.5),
    wasteHeatPerKg: Number(methanol.params?.wasteHeatKWhPerKg ?? methanol.params?.heatKWhPerKg ?? 0.43),
    wasteHeatT_C: Number(methanol.params?.wasteHeatT_C ?? 250),
  };
}

function ammoniaChain(definition) {
  const ammonia = converter(definition, 'ammonia');
  if (!ammonia) throw new Error('sizeToProduct needs an ammonia block to size ammonia demand');
  const sink = reactionProductSink(definition, ammonia, 'ammonia')
    || nodeBy(definition, node => node.id === 'ammonia-product' && String(node.unit).includes('sink'));
  if (!sink) throw new Error('sizeToProduct needs an ammonia sink');
  const h2Feed = sourceFeeding(definition, ammonia.id, 'hydrogen');
  const n2Feed = sourceFeeding(definition, ammonia.id, 'nitrogen');
  if (!h2Feed) throw new Error('sizeToProduct needs a hydrogen feed to size ammonia demand');
  if (!n2Feed) throw new Error('sizeToProduct needs a nitrogen feed to size ammonia demand');
  const electrolyzer = converter(definition, 'electrolyzer');
  const asu = converter(definition, 'asu');
  const desal = converter(definition, 'desal');
  return {
    ammonia,
    sink,
    electrolyzer,
    asu,
    desal,
    h2Feed,
    n2Feed,
    usesElectrolyzer: feedsFrom(h2Feed, electrolyzer, 'electrolyzer'),
    usesAsu: feedsFrom(n2Feed, asu, 'asu'),
    // N2 + 3 H2 -> 2 NH3
    h2PerKg: 1.5 * SUBSTANCES.H2.molarMassG / SUBSTANCES.NH3.molarMassG,
    n2PerKg: 0.5 * SUBSTANCES.N2.molarMassG / SUBSTANCES.NH3.molarMassG,
    ...desalParams(desal),
    secH2: Number(electrolyzer?.params?.secKWhPerKgH2 ?? 52),
    secAsu: Number(asu?.params?.electricityKWhPerKgN2 ?? 0.25),
    secNH3: Number(ammonia.params?.electricityKWhPerKg ?? 0.6),
    nitrogenRecovery: Number(asu?.params?.nitrogenRecovery ?? 0.98) || 0.98,
  };
}

// Air mass that must be processed to recover `kg` of `species` at `recovery`.
function airKgFor(definition, species, kg, recovery) {
  const air = siteNode(definition, 'air');
  if (!air?.params?.stream || !(kg > 0) || !(recovery > 0)) return 0;
  const mass = streamMassKg(air.params.stream);
  const speciesKgInAir = (air.params.stream.mol[species] || 0) * SUBSTANCES[species].molarMassG / 1000;
  if (!(mass > 0) || !(speciesKgInAir > 0)) return 0;
  return kg / recovery / (speciesKgInAir / mass);
}

// Scale the whole duty set down to the tightest cap in `keys` (re-running `raw`
// so the chain stays stoichiometric), then clip each capped duty.
function applyCapScale(duties, raw, caps, keys) {
  const scales = [1];
  const pushScale = (cap, duty) => {
    if (cap != null && Number.isFinite(cap) && duty > 0) scales.push(Math.max(0, cap) / duty);
  };
  for (const [capKey, dutyKey] of keys) pushScale(caps[capKey], duties[dutyKey]);
  const scale = Math.min(...scales);
  const capped = scale < 1 - 1e-12;
  const next = capped ? raw(duties._scaleBasis * scale) : duties;
  if (caps.solarKWp != null) next.solarKWp = Math.min(next.solarKWp, Math.max(0, caps.solarKWp));
  if (caps.swro != null && next.swro != null) next.swro = Math.min(next.swro, Math.max(0, caps.swro));
  if (caps.electrolyzer != null && next.h2 != null) next.h2 = Math.min(next.h2, Math.max(0, caps.electrolyzer));
  if (caps.dac != null && next.co2 != null) next.co2 = Math.min(next.co2, Math.max(0, caps.dac));
  if (caps.sabatier != null && next.ch4 != null) next.ch4 = Math.min(next.ch4, Math.max(0, caps.sabatier));
  if (caps.methanol != null && next.methanol != null) next.methanol = Math.min(next.methanol, Math.max(0, caps.methanol));
  if (caps.ammonia != null && next.ammonia != null) next.ammonia = Math.min(next.ammonia, Math.max(0, caps.ammonia));
  if (caps.asu != null && next.n2 != null) next.n2 = Math.min(next.n2, Math.max(0, caps.asu));
  if (caps.minerals != null && next.brineKg != null) next.brineKg = Math.min(next.brineKg, Math.max(0, caps.minerals));
  next.capped = capped;
  return next;
}

function dacDesalSinks(chain, dacHeatKWh, desalHeatKWh) {
  const sinks = [];
  if (dacHeatKWh > 0 && chain.dac) {
    sinks.push({ id: chain.dac.id, demandKWh: dacHeatKWh, minT_C: chain.minHeatDac });
  }
  if (desalHeatKWh > 0 && chain.desal) {
    sinks.push({ id: chain.desal.id, demandKWh: desalHeatKWh, minT_C: chain.minHeatDesal });
  }
  return sinks;
}

function estimateDuties(definition, methaneKg, recoveredPerKg, caps, heatCredit) {
  const chain = chainParams(definition);
  const yieldPerKWp = dailyPvKWhPerKWp(definition);
  const recycleCredit = chain.recycle ? Math.max(0, recoveredPerKg) : 0;

  const raw = ch4 => {
    const methane = Math.max(0, ch4);
    const h2 = methane * chain.h2PerKg;
    const co2 = methane * chain.co2PerKg;
    const makeupWaterKg = Math.max(0, methane * chain.waterKgPerKg - methane * recycleCredit);
    const swro = makeupWaterKg / chain.productDensity;
    const seawaterKg = (chain.recovery > 0 ? swro / chain.recovery : 0) * chain.feedDensity;
    const airKg = airKgFor(definition, 'CO2', co2, chain.captureFraction);
    const processElectricityKWh = h2 * chain.secH2 + co2 * chain.secDac + swro * chain.secDesal + methane * chain.secCh4
      + liftElectricityKWh(definition, { seawaterKg, airKg, feedDensity: chain.feedDensity });
    const sources = methane > 0 && chain.heatKWhPerKgCH4 > 0
      ? [{ id: chain.sabatier.id, kWh: methane * chain.heatKWhPerKgCH4, T_C: chain.wasteHeatT_C }]
      : [];
    const cascade = dutyHeat({
      definition,
      sources,
      sinks: dacDesalSinks(chain, co2 * chain.heatDac, swro * chain.heatDesal),
      parked: [chain.sabatier],
      heatCredit,
    });
    return {
      ch4: methane,
      h2,
      co2,
      makeupWaterKg,
      swro,
      seawaterKg,
      ...powerDuties(processElectricityKWh, cascade, yieldPerKWp),
      airKg,
      consumablesKg: co2 * chain.consumablesPerKgCO2,
      yieldPerKWp,
      _scaleBasis: methane,
    };
  };

  return applyCapScale(raw(methaneKg), raw, caps, [
    ['sabatier', 'ch4'],
    ['electrolyzer', 'h2'],
    ['dac', 'co2'],
    ['swro', 'swro'],
    ['solarKWp', 'solarKWp'],
  ]);
}

function estimateH2Duties(definition, h2Kg, caps, heatCredit) {
  const chain = h2Chain(definition);
  const yieldPerKWp = dailyPvKWhPerKWp(definition);
  const raw = targetH2 => {
    const h2 = Math.max(0, targetH2);
    const makeupWaterKg = h2 * WATER_KG_PER_KG_H2;
    const { swro, seawaterKg } = waterDuty(chain, makeupWaterKg);
    const processElectricityKWh = h2 * chain.secH2 + swro * chain.secDesal
      + liftElectricityKWh(definition, { seawaterKg, airKg: 0, feedDensity: chain.feedDensity });
    // Sabatier and DAC are parked, so there is no methanation waste heat; other
    // live hot sources may still cover MED/MSF heat.
    const cascade = dutyHeat({
      definition,
      sinks: dacDesalSinks(chain, 0, swro * chain.heatDesal),
      parked: [chain.sabatier, chain.dac],
      heatCredit,
    });
    return {
      ch4: 0,
      h2,
      co2: 0,
      makeupWaterKg,
      swro,
      seawaterKg,
      ...powerDuties(processElectricityKWh, cascade, yieldPerKWp),
      airKg: 0,
      consumablesKg: 0,
      yieldPerKWp,
      _scaleBasis: h2,
    };
  };
  return applyCapScale(raw(h2Kg), raw, caps, [
    ['electrolyzer', 'h2'],
    ['swro', 'swro'],
    ['solarKWp', 'solarKWp'],
  ]);
}

function estimateMethanolDuties(definition, methanolKg, caps, heatCredit) {
  const chain = methanolChain(definition);
  const yieldPerKWp = dailyPvKWhPerKWp(definition);
  const { usesElectrolyzer, usesDac } = chain;
  const raw = target => {
    const methanol = Math.max(0, target);
    const h2 = methanol * chain.h2PerKg;
    const co2 = methanol * chain.co2PerKg;
    const makeupWaterKg = usesElectrolyzer ? h2 * WATER_KG_PER_KG_H2 : 0;
    const { swro, seawaterKg } = waterDuty(chain, makeupWaterKg);
    const airKg = usesDac ? airKgFor(definition, 'CO2', co2, chain.captureFraction) : 0;
    const processElectricityKWh = methanol * chain.secMeoh
      + (usesElectrolyzer ? h2 * chain.secH2 : 0)
      + (usesDac ? co2 * chain.secDac : 0)
      + swro * chain.secDesal
      + liftElectricityKWh(definition, { seawaterKg, airKg, feedDensity: chain.feedDensity });
    const sources = methanol > 0 && chain.wasteHeatPerKg > 0
      ? [{ id: chain.methanol.id, kWh: methanol * chain.wasteHeatPerKg, T_C: chain.wasteHeatT_C }]
      : [];
    const cascade = dutyHeat({
      definition,
      sources,
      sinks: dacDesalSinks(chain, usesDac ? co2 * chain.heatDac : 0, swro * chain.heatDesal),
      parked: [chain.methanol],
      heatCredit,
    });
    return {
      methanol,
      ch4: 0,
      h2,
      co2,
      makeupWaterKg,
      swro,
      seawaterKg,
      ...powerDuties(processElectricityKWh, cascade, yieldPerKWp),
      airKg,
      consumablesKg: usesDac ? co2 * chain.consumablesPerKgCO2 : 0,
      yieldPerKWp,
      _scaleBasis: methanol,
    };
  };
  return applyCapScale(raw(methanolKg), raw, caps, [
    ['methanol', 'methanol'],
    ['electrolyzer', 'h2'],
    ['dac', 'co2'],
    ['swro', 'swro'],
    ['solarKWp', 'solarKWp'],
  ]);
}

function estimateAmmoniaDuties(definition, ammoniaKg, caps, heatCredit) {
  const chain = ammoniaChain(definition);
  const yieldPerKWp = dailyPvKWhPerKWp(definition);
  const { usesElectrolyzer, usesAsu } = chain;
  const raw = target => {
    const ammonia = Math.max(0, target);
    const h2 = ammonia * chain.h2PerKg;
    const n2 = ammonia * chain.n2PerKg;
    const makeupWaterKg = usesElectrolyzer ? h2 * WATER_KG_PER_KG_H2 : 0;
    const { swro, seawaterKg } = waterDuty(chain, makeupWaterKg);
    const airKg = usesAsu ? airKgFor(definition, 'N2', n2, chain.nitrogenRecovery) : 0;
    const processElectricityKWh = ammonia * chain.secNH3
      + (usesElectrolyzer ? h2 * chain.secH2 : 0)
      + (usesAsu ? n2 * chain.secAsu : 0)
      + swro * chain.secDesal
      + liftElectricityKWh(definition, { seawaterKg, airKg, feedDensity: chain.feedDensity });
    const cascade = dutyHeat({
      definition,
      sinks: [...dacDesalSinks(chain, 0, swro * chain.heatDesal), ...processHeatSinks(definition, [chain.desal])],
      heatCredit,
    });
    return {
      ammonia,
      n2,
      ch4: 0,
      methanol: 0,
      h2,
      co2: 0,
      makeupWaterKg,
      swro,
      seawaterKg,
      ...powerDuties(processElectricityKWh, cascade, yieldPerKWp),
      airKg,
      consumablesKg: 0,
      yieldPerKWp,
      _scaleBasis: ammonia,
    };
  };
  return applyCapScale(raw(ammoniaKg), raw, caps, [
    ['ammonia', 'ammonia'],
    ['electrolyzer', 'h2'],
    ['asu', 'n2'],
    ['swro', 'swro'],
    ['solarKWp', 'solarKWp'],
  ]);
}

function setMaterial(node, targetKg, definition) {
  if (!node?.params?.stream || node.params.stream.kind !== 'material') return;
  if (targetKg > 0) assertSizeMayAssume(definition, [node.siteResource]);
  const current = streamMassKg(node.params.stream);
  if (!(current > 0)) return;
  node.params.stream = scaleStream(node.params.stream, Math.max(0, targetKg) / current);
}

function setElectricity(node, kWh, definition) {
  if (!node?.params?.stream) return;
  if (kWh > 0) assertSizeMayAssume(definition, [node.siteResource]);
  node.params.stream = { kind: 'electricity', kWh: Math.max(0, kWh) };
}

function setHeat(node, kWh) {
  if (!node?.params?.stream) return;
  node.params.stream = { ...node.params.stream, kind: 'heat', kWh: Math.max(0, kWh) };
}

function setConsumable(node, amount) {
  if (!node?.params?.stream) return;
  node.params.stream = { ...node.params.stream, amount: Math.max(0, amount) };
}

// The heat cascade is accounting only (no exchanger network, no edge rewrite),
// so the heat source still delivers the purchased residual plus the covered
// process demand. Always written, including 0, so no stale heat budget survives.
function applyHeatBudget(definition, duties) {
  const heat = siteNode(definition, 'heat');
  setHeat(heat, (duties.heatKWh || 0) + (duties.heatCoveredKWh || 0));
  return heat;
}

function consumablesNode(definition) {
  return nodeBy(definition, node => node.id === 'consumables')
    || nodeBy(definition, node => node.unit === 'consumable-source');
}

function scaleFeedNode(definition, node, kg) {
  if (node.params?.stream?.kind === 'material') {
    setMaterial(node, kg, definition);
    syncSiteResource(definition, node);
    return;
  }
  if (node.unit === 'chlor-alkali') {
    // 2 NaCl + 2 H2O -> 2 NaOH + Cl2 + H2: chlor-alkali duty is kg NaOH.
    const naohKg = kg * 2 * SUBSTANCES.NaOH.molarMassG / SUBSTANCES.H2.molarMassG;
    setDuty(definition, node, naohKg);
    const salt = sourceFeeding(definition, node.id, 'salt');
    const water = sourceFeeding(definition, node.id, 'water');
    if (salt?.params?.stream) {
      setMaterial(salt, naohKg, definition);
      syncSiteResource(definition, salt);
    }
    if (water?.params?.stream) {
      const waterKg = naohKg * SUBSTANCES.H2O.molarMassG / SUBSTANCES.NaOH.molarMassG;
      setMaterial(water, waterKg, definition);
      syncSiteResource(definition, water);
    }
    return;
  }
  setpointsOf(definition)[node.id] = kg;
  node.capacity = Math.max(0, kg);
}

function syncSiteResource(definition, node) {
  if (!node?.siteResource || !definition.site?.resources?.[node.siteResource]) return;
  definition.site.resources[node.siteResource].stream = cloneStream(node.params.stream);
}

function scaleSolarEconomics(node, previousKWp, nextKWp) {
  if (!node?.economics || !(previousKWp > 0) || !Number.isFinite(nextKWp)) return;
  const ratio = nextKWp / previousKWp;
  if (node.economics.installedCapex != null) node.economics.installedCapex *= ratio;
  if (node.economics.fixedOM != null) node.economics.fixedOM *= ratio;
}

function parkConverter(definition, node) {
  if (node) setDuty(definition, node, 0);
}

function applyPowerAndSite(definition, duties) {
  const electricity = electricityNode(definition);
  const previousKWp = Number(definition.site?.solarKWp) || 0;
  const electricityKWh = duties.yieldPerKWp > 0 ? duties.solarKWp * duties.yieldPerKWp : duties.electricityKWh;
  setElectricity(electricity, electricityKWh, definition);
  scaleSolarEconomics(electricity, previousKWp, duties.solarKWp || 0);

  if (definition.site) {
    definition.site.solarKWp = duties.solarKWp || 0;
    if (duties.yieldPerKWp > 0) definition.site.dailyPVKWhPerKWp = duties.yieldPerKWp;
    if (definition.site.resources?.electricity) {
      definition.site.resources.electricity.stream = { kind: 'electricity', kWh: electricityKWh };
      definition.site.resources.electricity.evidence = `PVGIS typical-day × ${duties.solarKWp || 0} kWp`;
    }
    if (definition.site.meteo && duties.yieldPerKWp > 0) {
      definition.site.meteo.dailyPVKWhPerKWp = duties.yieldPerKWp;
    }
    withholdUnauthorizedSupply(definition);
  }
  syncSiteResource(definition, electricity);
}

function applyDuties(definition, duties) {
  const chain = chainParams(definition);
  setDuty(definition, chain.sabatier, duties.ch4);
  if (chain.electrolyzer) setDuty(definition, chain.electrolyzer, duties.h2);
  if (chain.dac) setDuty(definition, chain.dac, duties.co2);
  if (chain.desal) setDuty(definition, chain.desal, duties.swro);

  const air = siteNode(definition, 'air');
  const seawater = siteNode(definition, 'seawater');
  const consumables = consumablesNode(definition);
  if (duties.airKg > 0) setMaterial(air, duties.airKg, definition);
  if (duties.seawaterKg > 0) setMaterial(seawater, duties.seawaterKg, definition);
  const heat = applyHeatBudget(definition, duties);
  if (duties.consumablesKg > 0) setConsumable(consumables, duties.consumablesKg);

  applyPowerAndSite(definition, duties);
  for (const node of [air, seawater, heat, consumables]) syncSiteResource(definition, node);
  syncLiftDuties(definition, duties);
}

// Product H2 goes to a sink so a parked Sabatier cannot swallow it.
function ensureHydrogenOfftake(definition, electrolyzer, sabatier) {
  const edges = definition.graph.edges;
  const h2Edge = edges.find(edge => edge.from?.node === electrolyzer.id && edge.from?.port === 'hydrogen');
  const sinkId = 'hydrogen';
  let sink = nodeBy(definition, node => node.id === sinkId)
    || nodeBy(definition, node => node.unit === 'material-sink' && /h2|hydrogen/i.test(node.id));
  if (!sink) {
    sink = { id: sinkId, unit: 'material-sink' };
    definition.graph.nodes.push(sink);
  }
  if (h2Edge) {
    if (h2Edge.to?.node !== sink.id) h2Edge.to = { node: sink.id, port: 'in' };
  } else {
    edges.push({ from: { node: electrolyzer.id, port: 'hydrogen' }, to: { node: sink.id, port: 'in' } });
  }
  if (sabatier) {
    // Sabatier.hydrogen is a required port: feed it a zero stream while parked.
    const parkId = 'hydrogen-park';
    let park = nodeBy(definition, node => node.id === parkId);
    const parkStream = {
      kind: 'material',
      mol: { H2: 0 },
      phase: 'gas',
      T_C: 25,
      P_bar: 1,
    };
    if (!park) {
      park = {
        id: parkId,
        unit: 'material-source',
        siteResource: parkId,
        params: { stream: parkStream },
      };
      definition.graph.nodes.push(park);
    } else {
      park.siteResource = parkId;
      park.params = park.params || {};
      park.params.stream = parkStream;
    }
    if (definition.site) {
      definition.site.resources = definition.site.resources || {};
      definition.site.resources[parkId] = {
        stream: parkStream,
        quality: 'user-assumption',
        evidence: 'Zero H2 feed to keep parked Sabatier ports valid while product H2 goes to offtake',
      };
    }
    const sabH2 = edges.find(edge => edge.to?.node === sabatier.id && edge.to?.port === 'hydrogen');
    if (sabH2) sabH2.from = { node: park.id, port: 'out' };
    else edges.push({ from: { node: park.id, port: 'out' }, to: { node: sabatier.id, port: 'hydrogen' } });
  }
}

function applyH2Duties(definition, duties) {
  const chain = h2Chain(definition);
  setDuty(definition, chain.electrolyzer, duties.h2);
  if (chain.desal) setDuty(definition, chain.desal, duties.swro);
  parkConverter(definition, chain.sabatier);
  parkConverter(definition, chain.dac);
  ensureHydrogenOfftake(definition, chain.electrolyzer, chain.sabatier);

  if (duties.seawaterKg > 0) setMaterial(chain.water, duties.seawaterKg, definition);
  const heat = applyHeatBudget(definition, duties);
  applyPowerAndSite(definition, duties);
  syncSiteResource(definition, chain.water);
  syncSiteResource(definition, heat);
  syncLiftDuties(definition, duties);
}

function applyMethanolDuties(definition, duties) {
  const chain = methanolChain(definition);
  setDuty(definition, chain.methanol, duties.methanol);
  if (chain.usesElectrolyzer) setDuty(definition, chain.electrolyzer, duties.h2);
  else scaleFeedNode(definition, chain.h2Feed, duties.h2);
  if (chain.usesDac) setDuty(definition, chain.dac, duties.co2);
  else scaleFeedNode(definition, chain.co2Feed, duties.co2);
  if (chain.desal) setDuty(definition, chain.desal, duties.swro);

  const seawater = siteNode(definition, 'seawater');
  const air = siteNode(definition, 'air');
  const consumables = consumablesNode(definition);
  if (duties.seawaterKg > 0) setMaterial(seawater || chain.desal && sourceFeeding(definition, chain.desal.id, 'feed'), duties.seawaterKg, definition);
  if (duties.airKg > 0) setMaterial(air, duties.airKg, definition);
  const heat = applyHeatBudget(definition, duties);
  if (duties.consumablesKg > 0) setConsumable(consumables, duties.consumablesKg);
  applyPowerAndSite(definition, duties);
  for (const node of [seawater, air, heat, consumables]) syncSiteResource(definition, node);
  syncLiftDuties(definition, duties);
}

function applyAmmoniaDuties(definition, duties) {
  const chain = ammoniaChain(definition);
  setDuty(definition, chain.ammonia, duties.ammonia);
  if (chain.usesElectrolyzer) setDuty(definition, chain.electrolyzer, duties.h2);
  else scaleFeedNode(definition, chain.h2Feed, duties.h2);
  if (chain.usesAsu) setDuty(definition, chain.asu, duties.n2);
  else scaleFeedNode(definition, chain.n2Feed, duties.n2);
  if (chain.desal) setDuty(definition, chain.desal, duties.swro);

  const seawater = siteNode(definition, 'seawater');
  const air = siteNode(definition, 'air');
  if (duties.seawaterKg > 0) setMaterial(seawater, duties.seawaterKg, definition);
  if (duties.airKg > 0) setMaterial(air, duties.airKg, definition);
  const heat = applyHeatBudget(definition, duties);
  applyPowerAndSite(definition, duties);
  for (const node of [seawater, air, heat]) syncSiteResource(definition, node);
  syncLiftDuties(definition, duties);
}

function activity(solved, node) {
  return node ? solved.nodes[node.id]?.activity || 0 : 0;
}

function electricityConsumed(solved) {
  let kWh = 0;
  for (const result of Object.values(solved.nodes || {})) {
    for (const stream of Object.values(result.consumed || {})) {
      if (stream?.kind === 'electricity') kWh += stream.kWh;
    }
  }
  return kWh;
}

// Solved heat integration when the solver reports it, else the duty estimate.
function heatMeasureExtras(solved, duties) {
  const covered = solved.heatIntegration?.coveredKWh;
  const residual = solved.heatIntegration?.residualDemandKWh;
  return {
    heatCoveredKWh: Number.isFinite(covered) ? covered : Number(duties.heatCoveredKWh) || 0,
    heatResidualKWh: Number.isFinite(residual) ? residual : Number(duties.heatResidualKWh) || 0,
  };
}

function recoveredWaterKg(solved, sabatier) {
  const water = solved.nodes[sabatier.id]?.outlets?.water;
  return water ? streamMassKg(water) : 0;
}

function sinkMassKg(solved, sink) {
  const received = sink ? solved.nodes[sink.id]?.received : null;
  return received?.kind === 'material' ? streamMassKg(received) : 0;
}

function relativeGap(actual, expected) {
  return Math.abs((actual || 0) - (expected || 0)) / Math.max(1, Math.abs(expected || 0));
}

function landHaFor(definition, solved) {
  if (!footprint?.estimateFootprint || !definition.site) return 0;
  return footprint.estimateFootprint({
    site: definition.site,
    graph: definition.graph,
    solved,
  }).totalHa;
}

function historyDuties(duties, solved, definition, extras) {
  return {
    ch4: duties.ch4 || 0,
    h2: duties.h2 || 0,
    co2: duties.co2 || 0,
    waterKg: duties.makeupWaterKg || 0,
    swro: duties.swro || 0,
    seawaterKg: duties.seawaterKg || 0,
    brineKg: duties.brineKg || 0,
    electricityKWh: duties.electricityKWh || 0,
    heatKWh: duties.heatKWh || 0,
    solarKWp: duties.solarKWp || 0,
    airKg: duties.airKg || 0,
    consumablesKg: duties.consumablesKg || 0,
    landHa: landHaFor(definition, solved),
    ...extras,
  };
}

function productSink(definition, product) {
  const byId = nodeBy(definition, node => node.id === product && String(node.unit).includes('sink'));
  if (byId) return byId;
  const minerals = converter(definition, 'brine-minerals');
  if (!minerals) return null;
  const edge = definition.graph.edges.find(item => item.from.node === minerals.id && item.from.port === product);
  return edge ? nodeBy(definition, node => node.id === edge.to.node) : null;
}

function brineSource(definition, minerals) {
  return siteNode(definition, 'brine') || sourceFeeding(definition, minerals.id, 'brine');
}

// Precipitate up to `recovery` of the limiting ion pair as `productId`,
// consuming ions from `residual` so later salts see what is left.
function recoverMineralKg(residual, productId, cation, cationCount, anion, anionCount, recovery) {
  const fraction = Number(recovery);
  const safe = Number.isFinite(fraction) && fraction > 0 ? Math.min(1, fraction) : 0;
  const mol = Math.min((residual[cation] || 0) / cationCount, (residual[anion] || 0) / anionCount) * safe;
  residual[cation] = (residual[cation] || 0) - mol * cationCount;
  residual[anion] = (residual[anion] || 0) - mol * anionCount;
  return mol * SUBSTANCES[productId].molarMassG / 1000;
}

// Recovery order matters: each salt draws on the ions the previous ones left.
function mineralYieldsKg(brineStream, params) {
  const residual = { ...brineStream.mol };
  return {
    lithium: recoverMineralKg(residual, 'LiCl', 'Li+', 1, 'Cl-', 1, params.lithiumRecovery ?? 0.9),
    bromide: recoverMineralKg(residual, 'NaBr', 'Na+', 1, 'Br-', 1, params.bromideRecovery ?? 0.9),
    magnesium: recoverMineralKg(residual, 'MgCl2', 'Mg+2', 1, 'Cl-', 2, params.magnesiumRecovery ?? 0.5),
    potash: recoverMineralKg(residual, 'KCl', 'K+', 1, 'Cl-', 1, params.potashRecovery ?? 0.7),
    gypsum: recoverMineralKg(residual, 'CaSO4', 'Ca+2', 1, 'SO4-2', 1, params.gypsumRecovery ?? 0.7),
    salt: recoverMineralKg(residual, 'NaCl', 'Na+', 1, 'Cl-', 1, params.saltRecovery ?? 0.5),
  };
}

function mineralYieldPerKg(brineStream, params, product) {
  const mass = streamMassKg(brineStream);
  if (!(mass > 0)) return 0;
  return (mineralYieldsKg(brineStream, params)[product] || 0) / mass;
}

function applyMineralDuties(definition, duties) {
  const minerals = converter(definition, 'brine-minerals');
  setDuty(definition, minerals, duties.brineKg);
  const brine = brineSource(definition, minerals);
  setMaterial(brine, duties.brineKg, definition);
  const brinePump = nodeBy(definition, item => item.id === 'brine-pump' || (item.unit === 'intake-pump' && String(item.id).includes('brine')));
  if (brinePump) {
    const density = Number(brinePump.params?.densityKgM3 ?? 1200) || 1200;
    setDuty(definition, brinePump, duties.brineKg / density);
  }
  const heat = applyHeatBudget(definition, duties);
  applyPowerAndSite(definition, duties);
  syncSiteResource(definition, brine);
  syncSiteResource(definition, heat);
}

// Fixed-point loop shared by every product strategy:
//   estimate(definition, target, caps) -> duties
//   apply(definition, duties)          -> writes capacities, setpoints, feeds, PV
//   measure(solved, duties, definition) -> { achieved, gaps, extras }
// `gaps` are relative estimate-vs-solved mismatches; `extras` are product-specific
// history fields. Stops once the estimate is self-consistent and the target is
// met, or a cap binds.
function iterateSize(definition, target, opts, { product, estimate, apply, measure }) {
  const { caps, maxIterations, tolerance } = opts;
  const history = [];
  let residual = Infinity;
  let consistency = Infinity;
  let solved = null;
  let duties = null;
  let achieved = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    duties = estimate(definition, target, caps);
    apply(definition, duties);
    definition.operation.boundaryLimitedBy = duties.capped ? ['sizing cap'] : [];
    solved = solveOperation(definition);
    const measured = measure(solved, duties, definition);
    achieved = measured.achieved;
    consistency = Math.max(...measured.gaps);
    residual = Math.max(relativeGap(achieved, target), consistency);
    history.push({
      iteration,
      residual,
      consistency,
      capped: Boolean(duties.capped),
      duties: historyDuties(duties, solved, definition, {
        achieved,
        ...measured.extras,
        achievedElectricityKWh: electricityConsumed(solved),
        ...heatMeasureExtras(solved, duties),
      }),
    });
    if (consistency < tolerance && (residual < tolerance || duties.capped)) break;
  }

  const warnings = [...(solved.warnings || [])];
  for (const warning of solver.unverifiedRightsWarnings?.(definition.site) || []) {
    if (!warnings.includes(warning)) warnings.push(warning);
  }
  const last = history[history.length - 1].duties;
  return {
    definition,
    solved,
    product,
    rate: target,
    target,
    achieved,
    iterations: history.length,
    residual,
    consistency,
    converged: consistency < tolerance && (relativeGap(achieved, target) < tolerance || Boolean(duties.capped)),
    history,
    warnings,
    heatCoveredKWh: last.heatCoveredKWh,
    heatResidualKWh: last.heatResidualKWh,
  };
}

function sizeMethane(definition, target, opts) {
  const chain = chainParams(definition);
  let recoveredPerKg = chain.recycle ? chain.recoveredWaterPerKg : 0;
  return iterateSize(definition, target, opts, {
    product: 'CH4',
    estimate: (current, methaneKg, caps) => (
      estimateDuties(current, methaneKg, recoveredPerKg, caps, opts.heatCredit)
    ),
    apply: applyDuties,
    measure: (solved, duties) => {
      const achieved = activity(solved, chain.sabatier);
      if (chain.recycle) {
        recoveredPerKg = achieved > 0
          ? recoveredWaterKg(solved, chain.sabatier) / achieved
          : chain.recoveredWaterPerKg;
      }
      const gaps = [
        relativeGap(achieved, duties.ch4),
        relativeGap(electricityConsumed(solved), duties.processElectricityKWh),
      ];
      if (chain.electrolyzer) gaps.push(relativeGap(activity(solved, chain.electrolyzer), duties.h2));
      if (chain.dac) gaps.push(relativeGap(activity(solved, chain.dac), duties.co2));
      if (chain.desal) gaps.push(relativeGap(activity(solved, chain.desal), duties.swro));
      if (chain.recycle) {
        const recovered = recoveredWaterKg(solved, chain.sabatier);
        gaps.push(relativeGap(duties.makeupWaterKg, Math.max(0, duties.ch4 * chain.waterKgPerKg - recovered)));
      }
      return {
        achieved,
        gaps,
        extras: {
          achievedH2: activity(solved, chain.electrolyzer),
          achievedCo2: activity(solved, chain.dac),
          achievedSwro: activity(solved, chain.desal),
        },
      };
    },
  });
}

function sizeHydrogen(definition, target, opts) {
  const chain = h2Chain(definition);
  return iterateSize(definition, target, opts, {
    product: 'H2',
    estimate: (current, h2Kg, caps) => estimateH2Duties(current, h2Kg, caps, opts.heatCredit),
    apply: applyH2Duties,
    measure: (solved, duties) => {
      const achieved = activity(solved, chain.electrolyzer);
      const gaps = [
        relativeGap(achieved, duties.h2),
        relativeGap(electricityConsumed(solved), duties.processElectricityKWh),
      ];
      if (chain.desal) gaps.push(relativeGap(activity(solved, chain.desal), duties.swro));
      return {
        achieved,
        gaps,
        extras: { achievedH2: achieved, achievedSwro: activity(solved, chain.desal) },
      };
    },
  });
}

function sizeMethanol(definition, target, opts) {
  const chain = methanolChain(definition);
  return iterateSize(definition, target, opts, {
    product: 'methanol',
    estimate: (current, rate, caps) => estimateMethanolDuties(current, rate, caps, opts.heatCredit),
    apply: applyMethanolDuties,
    measure: (solved, duties) => {
      const gaps = [
        relativeGap(activity(solved, chain.methanol), duties.methanol),
        relativeGap(electricityConsumed(solved), duties.processElectricityKWh),
      ];
      if (chain.electrolyzer && chain.h2Feed.id === chain.electrolyzer.id) {
        gaps.push(relativeGap(activity(solved, chain.electrolyzer), duties.h2));
      }
      if (chain.dac && chain.co2Feed.id === chain.dac.id) {
        gaps.push(relativeGap(activity(solved, chain.dac), duties.co2));
      }
      if (chain.desal) gaps.push(relativeGap(activity(solved, chain.desal), duties.swro));
      return {
        achieved: sinkMassKg(solved, chain.sink),
        gaps,
        extras: {
          achievedMethanol: activity(solved, chain.methanol),
          achievedH2: activity(solved, chain.electrolyzer),
          achievedCo2: activity(solved, chain.dac),
          achievedSwro: activity(solved, chain.desal),
        },
      };
    },
  });
}

function sizeDedicatedAmmonia(definition, target, opts) {
  const chain = ammoniaChain(definition);
  return iterateSize(definition, target, opts, {
    product: 'ammonia',
    estimate: (current, rate, caps) => estimateAmmoniaDuties(current, rate, caps, opts.heatCredit),
    apply: applyAmmoniaDuties,
    measure: (solved, duties) => {
      const gaps = [
        relativeGap(activity(solved, chain.ammonia), duties.ammonia),
        relativeGap(electricityConsumed(solved), duties.processElectricityKWh),
      ];
      if (chain.electrolyzer && chain.h2Feed.id === chain.electrolyzer.id) {
        gaps.push(relativeGap(activity(solved, chain.electrolyzer), duties.h2));
      }
      if (chain.asu && chain.n2Feed.id === chain.asu.id) {
        gaps.push(relativeGap(activity(solved, chain.asu), duties.n2));
      }
      if (chain.desal) gaps.push(relativeGap(activity(solved, chain.desal), duties.swro));
      return {
        achieved: sinkMassKg(solved, chain.sink),
        gaps,
        extras: {
          achievedAmmonia: activity(solved, chain.ammonia),
          achievedH2: activity(solved, chain.electrolyzer),
          achievedN2: activity(solved, chain.asu),
        },
      };
    },
  });
}

// Brine-hub scaling for coupled ammonia: the hub's brine, downstream converters,
// feeds and power all scale from the pre-sizing baseline by one ratio.
const ABUNDANCE_DOWNSTREAM = Object.freeze(['chlor-alkali', 'bromine-recovery', 'asu', 'ammonia']);
// Cap on the multiplier versus the pre-sizing baseline.
const ABSOLUTE_SCALE_CAP = 10;

function scaleMaterialStream(stream, ratio) {
  if (!stream || stream.kind !== 'material' || !stream.mol) return;
  for (const key of Object.keys(stream.mol)) stream.mol[key] *= ratio;
}

function baselineAbundanceDuties(definition) {
  const minerals = converter(definition, 'brine-minerals');
  const brine = brineSource(definition, minerals);
  if (!minerals || !brine?.params?.stream) throw new Error('Coupled ammonia sizing needs brine-minerals and a brine source');
  return {
    brineKg: streamMassKg(brine.params.stream),
    setpoints: { ...(definition.operation.setpoints || {}) },
    streams: Object.fromEntries(
      definition.graph.nodes
        .filter(node => node.params?.stream)
        .map(node => [node.id, JSON.parse(JSON.stringify(node.params.stream))])
    ),
  };
}

function absoluteScale(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, ABSOLUTE_SCALE_CAP);
}

function applyAbundanceScale(definition, baseline, scale) {
  const ratio = absoluteScale(scale);
  const minerals = converter(definition, 'brine-minerals');
  const brine = brineSource(definition, minerals);
  const brineKg = baseline.brineKg * ratio;
  brine.params.stream = JSON.parse(JSON.stringify(baseline.streams[brine.id] || brine.params.stream));
  scaleMaterialStream(brine.params.stream, ratio);
  setDuty(definition, minerals, brineKg);

  const brinePump = nodeBy(definition, item => item.id === 'brine-pump' || item.unit === 'intake-pump');
  if (brinePump) {
    const density = Number(brinePump.params?.densityKgM3 ?? 1200) || 1200;
    setDuty(definition, brinePump, brineKg / density);
  }

  for (const id of ABUNDANCE_DOWNSTREAM) {
    const node = nodeBy(definition, item => item.id === id);
    if (node) setDuty(definition, node, Number(baseline.setpoints[id] || 0) * ratio);
  }

  for (const id of ['salt-feed', 'water', 'air', 'power']) {
    const node = nodeBy(definition, item => item.id === id);
    if (!node?.params?.stream || !baseline.streams[id]) continue;
    node.params.stream = JSON.parse(JSON.stringify(baseline.streams[id]));
    if (node.params.stream.kind === 'electricity') node.params.stream.kWh *= ratio;
    else scaleMaterialStream(node.params.stream, ratio);
  }

  syncSiteResource(definition, brine);
  const power = electricityNode(definition);
  if (power) syncSiteResource(definition, power);
  syncAbundanceSolar(definition, power);
  definition.operation.boundaryLimitedBy = [];
}

// Abundance scales rewrite the electricity stream. Land uses site.solarKWp, so
// the array has to follow that stream or the footprint stays on the seed size.
function syncAbundanceSolar(definition, power) {
  if (!definition.site || !power?.params?.stream) return;
  const yieldPerKWp = dailyPvKWhPerKWp(definition);
  const kWh = Number(power.params.stream.kWh) || 0;
  if (!(yieldPerKWp > 0)) return;
  const nextKWp = kWh / yieldPerKWp;
  scaleSolarEconomics(power, Number(definition.site.solarKWp) || 0, nextKWp);
  definition.site.solarKWp = nextKWp;
  if (definition.site.resources?.electricity) {
    definition.site.resources.electricity.stream = { kind: 'electricity', kWh };
    definition.site.resources.electricity.evidence = `PVGIS typical-day × ${nextKWp} kWp`;
  }
}

// Ammonia on a brine-minerals hub is a co-product: the whole hub scales from
// its baseline by one ratio, and ammonia-per-scale is re-measured each solve.
function sizeCoupledAmmonia(definition, target, opts) {
  const chain = ammoniaChain(definition);
  const baseline = baselineAbundanceDuties(definition);
  const baseAmmonia = Number(baseline.setpoints[chain.ammonia.id] || 0);
  let yieldPerScale = baseAmmonia > 0 ? baseAmmonia : 1;
  return iterateSize(definition, target, opts, {
    product: 'ammonia',
    estimate: (current, rate, caps) => {
      const yieldPerKWp = dailyPvKWhPerKWp(current);
      const raw = kg => {
        const ammonia = Math.max(0, kg);
        const scale = ammonia / yieldPerScale;
        const brineKg = baseline.brineKg * scale;
        const basePower = Number(baseline.streams[electricityNode(current)?.id]?.kWh) || 0;
        const cascade = dutyHeat({
          definition: current,
          sinks: processHeatSinks(current),
          heatCredit: opts.heatCredit,
        });
        return {
          ammonia,
          scale,
          brineKg,
          n2: 0,
          h2: 0,
          ch4: 0,
          methanol: 0,
          co2: 0,
          makeupWaterKg: 0,
          swro: 0,
          seawaterKg: brineKg,
          ...powerDuties(basePower * scale, cascade, yieldPerKWp),
          yieldPerKWp,
          airKg: 0,
          consumablesKg: 0,
          _scaleBasis: brineKg,
        };
      };
      return applyCapScale(raw(rate), raw, caps, [
        ['ammonia', 'ammonia'],
        ['minerals', 'brineKg'],
        ['solarKWp', 'solarKWp'],
      ]);
    },
    apply: (current, duties) => {
      applyAbundanceScale(current, baseline, duties.scale);
      applyPowerAndSite(current, duties);
    },
    measure: (solved, duties) => {
      const achieved = sinkMassKg(solved, chain.sink);
      if (duties.scale > 0 && achieved > 0) yieldPerScale = achieved / duties.scale;
      return {
        achieved,
        gaps: [
          relativeGap(activity(solved, chain.ammonia), duties.ammonia),
          relativeGap(achieved, duties.ammonia),
        ],
        extras: { achievedAmmonia: activity(solved, chain.ammonia), scale: duties.scale },
      };
    },
  });
}

function sizeAmmonia(definition, target, opts) {
  if (converter(definition, 'brine-minerals')) return sizeCoupledAmmonia(definition, target, opts);
  return sizeDedicatedAmmonia(definition, target, opts);
}

function converterDutyKg(definition, node) {
  const cap = Number(node.capacity);
  const sp = Number(definition.operation?.setpoints?.[node.id]);
  const fromCap = Number.isFinite(cap) && cap > 0 ? cap : 0;
  const fromSp = Number.isFinite(sp) && sp > 0 ? sp : 0;
  return Math.max(fromCap, fromSp);
}

function applyRatioScale(definition, baseline, ratio) {
  for (const [id, base] of Object.entries(baseline.converterDuties)) {
    const node = nodeBy(definition, item => item.id === id);
    if (node) setDuty(definition, node, base * ratio);
  }
  for (const [id, stream] of Object.entries(baseline.streams)) {
    const node = nodeBy(definition, item => item.id === id);
    if (!node?.params) continue;
    node.params.stream = JSON.parse(JSON.stringify(stream));
    scaleMaterialStream(node.params.stream, ratio);
    syncSiteResource(definition, node);
  }
}

function isMaterialSource(node) {
  return node.unit === 'material-source' && node.params?.stream?.kind === 'material';
}

// Purchased material sources feeding any of `nodeIds`, in edge order.
function materialSourcesFeeding(definition, nodeIds, seen = new Set()) {
  const sources = [];
  for (const edge of definition.graph.edges || []) {
    if (!nodeIds.includes(edge.to?.node)) continue;
    const upstream = nodeBy(definition, node => node.id === edge.from.node);
    if (!upstream || seen.has(upstream.id)) continue;
    if (isMaterialSource(upstream)) {
      seen.add(upstream.id);
      sources.push(upstream);
    }
  }
  return sources;
}

function materialSourceOnPort(definition, nodeId, port, seen) {
  const upstream = sourceFeeding(definition, nodeId, port);
  if (!upstream || seen.has(upstream.id) || !isMaterialSource(upstream)) return null;
  seen.add(upstream.id);
  return upstream;
}

function converterSecKWh(node, keys, fallback) {
  for (const key of keys) {
    const listed = Number(node.params?.[key]);
    if (Number.isFinite(listed) && listed >= 0) return listed;
  }
  return fallback;
}

function ratioChainElectricityKWh(definition, baseline, scale, secOf) {
  let kWh = 0;
  for (const [id, duty] of Object.entries(baseline.converterDuties)) {
    if (!(duty > 0)) continue;
    const node = nodeBy(definition, item => item.id === id);
    if (!node) continue;
    const sec = secOf(node);
    if (sec > 0) kWh += duty * scale * sec;
  }
  return kWh;
}

// ---------------------------------------------------------------------------
// Baseline-ratio islands. The loaded case is the recipe: every converter in the
// chain and every purchased feed scales by one ratio from its baseline duty,
// PV is resized to the summed process electricity, and the loop re-measures
// product-per-scale after each solve. A product only declares how to find its
// chain and each converter's default SEC (listed params win).

function namedProductSink(definition, node, reactionKey, sinkIds) {
  return reactionProductSink(definition, node, reactionKey)
    || nodeBy(definition, item => sinkIds.includes(item.id) && String(item.unit).includes('sink'));
}

function singleConverterChain(definition, { unit, product, sinkLabel, reactionKey, sinkIds }) {
  const primary = converter(definition, unit);
  if (!primary) throw new Error(`sizeToProduct needs a ${unit} block to size ${product} demand`);
  const sink = namedProductSink(definition, primary, reactionKey, sinkIds);
  if (!sink) throw new Error(`sizeToProduct needs a ${sinkLabel} sink`);
  return { primary, sink, converters: [primary], sources: materialSourcesFeeding(definition, [primary.id]) };
}

function pvModuleChain(definition) {
  const primary = converter(definition, 'pv-module');
  if (!primary) throw new Error('sizeToProduct needs a pv-module block to size module demand');
  const sink = namedProductSink(definition, primary, 'module', ['module']);
  if (!sink) throw new Error('sizeToProduct needs a module sink');
  const converters = definition.graph.nodes.filter(node => PV_MODULE_CHAIN_UNITS.includes(node.unit));
  const sources = materialSourcesFeeding(definition, converters.map(node => node.id));
  return { primary, sink, converters, sources };
}

function steelChain(definition) {
  const primary = converter(definition, 'hydrogen-dri');
  if (!primary) throw new Error('sizeToProduct needs a hydrogen-dri block to size steel demand');
  const sink = namedProductSink(definition, primary, 'steel', ['steel']);
  if (!sink) throw new Error('sizeToProduct needs a steel sink');
  const electrolyzer = converter(definition, 'electrolyzer');
  const swro = converter(definition, 'swro');
  // An on-site pellet plant feeding the shaft scales with it, with its purchased concentrate.
  const pelletFeed = sourceFeeding(definition, primary.id, 'ironOre');
  const pellets = pelletFeed?.unit === 'pellet-plant' ? pelletFeed : null;
  const seen = new Set();
  const sources = materialSourcesFeeding(definition, [primary.id], seen);
  if (pellets) sources.push(...materialSourcesFeeding(definition, [pellets.id], seen));
  const seawater = swro && materialSourceOnPort(definition, swro.id, 'feed', seen);
  if (seawater) sources.push(seawater);
  return { primary, sink, converters: [primary, pellets, electrolyzer, swro].filter(Boolean), sources };
}

function ethyleneChain(definition) {
  const primary = converter(definition, 'mto');
  if (!primary) throw new Error('sizeToProduct needs an mto block to size ethylene demand');
  const sink = namedProductSink(definition, primary, 'ethylene', ['ethylene', 'ethylene-product']);
  if (!sink) throw new Error('sizeToProduct needs an ethylene sink');
  const meohFeed = sourceFeeding(definition, primary.id, 'methanol');
  const methanol = meohFeed?.unit === 'methanol' ? meohFeed : null;
  const h2Feed = methanol ? sourceFeeding(definition, methanol.id, 'hydrogen') : null;
  const electrolyzer = h2Feed?.unit === 'electrolyzer'
    ? h2Feed
    : (methanol ? converter(definition, 'electrolyzer') : null);
  const swro = electrolyzer ? converter(definition, 'swro') : null;
  const seen = new Set();
  const sources = materialSourcesFeeding(definition, [primary.id], seen);
  if (methanol) sources.push(...materialSourcesFeeding(definition, [methanol.id], seen));
  const seawater = swro && materialSourceOnPort(definition, swro.id, 'feed', seen);
  if (seawater) sources.push(seawater);
  return { primary, sink, converters: [primary, methanol, electrolyzer, swro].filter(Boolean), sources };
}

function dieselChain(definition) {
  const primary = converter(definition, 'ft-liquids');
  if (!primary) throw new Error('sizeToProduct needs an ft-liquids block to size diesel demand');
  const sink = namedProductSink(definition, primary, 'diesel', ['diesel', 'diesel-product']);
  if (!sink) throw new Error('sizeToProduct needs a diesel sink');
  const h2Feed = sourceFeeding(definition, primary.id, 'hydrogen');
  const electrolyzer = h2Feed?.unit === 'electrolyzer' ? h2Feed : null;
  const swro = electrolyzer ? converter(definition, 'swro') : null;
  const seen = new Set();
  const sources = materialSourcesFeeding(definition, [primary.id], seen);
  const seawater = swro && materialSourceOnPort(definition, swro.id, 'feed', seen);
  if (seawater) sources.push(seawater);
  return { primary, sink, converters: [primary, electrolyzer, swro].filter(Boolean), sources };
}

function ureaChain(definition) {
  const primary = converter(definition, 'urea');
  if (!primary) throw new Error('sizeToProduct needs a urea block to size urea demand');
  const sink = namedProductSink(definition, primary, 'urea', ['urea', 'urea-product']);
  if (!sink) throw new Error('sizeToProduct needs a urea sink');
  const nh3Feed = sourceFeeding(definition, primary.id, 'ammonia');
  const ammonia = nh3Feed?.unit === 'ammonia' ? nh3Feed : null;
  const electrolyzer = ammonia ? converter(definition, 'electrolyzer') : null;
  const asu = ammonia ? converter(definition, 'asu') : null;
  const swro = ammonia ? converter(definition, 'swro') : null;
  const seen = new Set();
  const sources = materialSourcesFeeding(definition, [primary.id], seen);
  const seawater = swro && materialSourceOnPort(definition, swro.id, 'feed', seen);
  if (seawater) sources.push(seawater);
  const air = asu && materialSourceOnPort(definition, asu.id, 'air', seen);
  if (air) sources.push(air);
  return { primary, sink, converters: [primary, ammonia, electrolyzer, asu, swro].filter(Boolean), sources };
}

const NDPR_SEPARATOR_UNITS = Object.freeze(['ree-chromatography', 'ree-sx']);

function ndprChain(definition) {
  const separators = definition.graph.nodes.filter(node => NDPR_SEPARATOR_UNITS.includes(node.unit));
  if (separators.length > 1) {
    throw new Error('sizeToProduct cannot size ndpr: multiple REE separators');
  }
  const primary = separators[0];
  if (!primary) throw new Error('sizeToProduct needs a ree-chromatography block to size ndpr demand');
  const sink = namedProductSink(definition, primary, 'ndpr', ['ndpr', 'ndpr-oxide', 'ndpr-oxide-separated', 'nd2o3']);
  if (!sink) throw new Error('sizeToProduct needs an ndpr sink');
  return { primary, sink, converters: [primary], sources: materialSourcesFeeding(definition, [primary.id]) };
}

const perKg = fallback => [['electricityKWhPerKg'], fallback];
const ELECTROLYZER_SEC = [['secKWhPerKgH2'], 52];
const SWRO_SEC = [['secKWhPerM3', 'electricityKWhPerM3'], 3.5];
const REE_SEC_KEYS = ['electricityKWhPerKgReo', 'electricityKWhPerKg'];

// Each entry: the converter named in "no baseline capacity" errors, how to
// collect the scaled chain, and default SEC [paramKeys, kWh/unit] per unit.
// Units not listed read electricityKWhPerKg with a 0 default.
const RATIO_ISLANDS = Object.freeze({
  module: {
    unitLabel: 'pv-module',
    chain: pvModuleChain,
    sec: Object.fromEntries(Object.entries(PV_MODULE_SEC_DEFAULTS).map(([unit, kWh]) => [unit, perKg(kWh)])),
  },
  steel: {
    unitLabel: 'hydrogen-dri',
    chain: steelChain,
    sec: { 'hydrogen-dri': perKg(0.7), 'pellet-plant': perKg(0.14), electrolyzer: ELECTROLYZER_SEC, swro: SWRO_SEC },
  },
  ethylene: {
    unitLabel: 'mto',
    chain: ethyleneChain,
    sec: { mto: perKg(4), methanol: perKg(0.5), electrolyzer: ELECTROLYZER_SEC, swro: SWRO_SEC },
  },
  diesel: {
    unitLabel: 'ft-liquids',
    chain: dieselChain,
    sec: { 'ft-liquids': perKg(0.22), electrolyzer: ELECTROLYZER_SEC, swro: SWRO_SEC },
  },
  urea: {
    unitLabel: 'urea',
    chain: ureaChain,
    sec: {
      urea: perKg(0.8),
      ammonia: perKg(0.6),
      asu: [['electricityKWhPerKgN2'], 0.25],
      electrolyzer: ELECTROLYZER_SEC,
      swro: SWRO_SEC,
    },
  },
  titanium: {
    unitLabel: 'titanium-kroll',
    chain: definition => singleConverterChain(definition, {
      unit: 'titanium-kroll', product: 'titanium', sinkLabel: 'titanium',
      reactionKey: 'titanium', sinkIds: ['titanium', 'titanium-product', 'sponge'],
    }),
    sec: { 'titanium-kroll': perKg(8) },
  },
  'float-glass': {
    unitLabel: 'float-glass',
    chain: definition => singleConverterChain(definition, {
      unit: 'float-glass', product: 'float-glass', sinkLabel: 'glass',
      reactionKey: 'glass', sinkIds: ['glass', 'float-glass', 'solar-glass', 'float-glass-product'],
    }),
    sec: { 'float-glass': perKg(2.5) },
  },
  cement: {
    unitLabel: 'cement',
    chain: definition => singleConverterChain(definition, {
      unit: 'cement', product: 'cement', sinkLabel: 'cement',
      reactionKey: 'cement', sinkIds: ['cement', 'clinker', 'portland', 'cement-product', 'cem-i'],
    }),
    sec: { cement: perKg(1.05) },
  },
  copper: {
    unitLabel: 'copper-ew',
    chain: definition => singleConverterChain(definition, {
      unit: 'copper-ew', product: 'copper', sinkLabel: 'copper',
      reactionKey: 'cathode',
      sinkIds: ['cathode', 'cathode-product', 'copper', 'copper-product', 'copper-cathode'],
    }),
    sec: { 'copper-ew': perKg(2.2) },
  },
  // NdPr is a co-product of the separator's REO duty, so the converter duty
  // ("reo") is tracked separately and product-per-scale comes from a baseline solve.
  ndpr: {
    unitLabel: 'ree-chromatography',
    chain: ndprChain,
    sec: { 'ree-chromatography': [REE_SEC_KEYS, 5], 'ree-sx': [REE_SEC_KEYS, 5.3] },
    primaryKey: 'reo',
    yieldFromBaselineSolve: true,
  },
});

function ratioBaseline(definition, chain) {
  const converterDuties = {};
  for (const node of chain.converters) converterDuties[node.id] = converterDutyKg(definition, node);
  const streams = {};
  for (const node of chain.sources) streams[node.id] = JSON.parse(JSON.stringify(node.params.stream));
  return { primaryKg: converterDuties[chain.primary.id] || 0, converterDuties, streams };
}

function sizeRatioIsland(definition, product, target, opts) {
  const spec = RATIO_ISLANDS[product];
  const primaryKey = spec.primaryKey || product;
  const chain = spec.chain(definition);
  const baseline = ratioBaseline(definition, chain);
  if (!(baseline.primaryKg > 0) && target > 0) {
    throw new Error(`sizeToProduct cannot size ${product}: ${spec.unitLabel} has no baseline capacity`);
  }
  let yieldPerScale = baseline.primaryKg > 0 ? baseline.primaryKg : 1;
  if (spec.yieldFromBaselineSolve) {
    yieldPerScale = 1;
    if (target > 0) {
      const baselineProduct = sinkMassKg(solveOperation(definition), chain.sink);
      if (!(baselineProduct > 0)) {
        throw new Error(`sizeToProduct cannot size ${product}: ${product} sink has no baseline product`);
      }
      yieldPerScale = baselineProduct;
    }
  }
  const secOf = node => {
    const [keys, fallback] = spec.sec[node.unit] || perKg(0);
    return converterSecKWh(node, keys, fallback);
  };
  return iterateSize(definition, target, opts, {
    product,
    estimate: (current, rate, caps) => {
      const yieldPerKWp = dailyPvKWhPerKWp(current);
      const raw = kg => {
        const productKg = Math.max(0, kg);
        const scale = productKg / yieldPerScale;
        const processElectricityKWh = ratioChainElectricityKWh(current, baseline, scale, secOf);
        const solarKWp = yieldPerKWp > 0 ? processElectricityKWh / yieldPerKWp : 0;
        return {
          [product]: productKg,
          ...(primaryKey !== product ? { [primaryKey]: baseline.primaryKg * scale } : {}),
          scale,
          processElectricityKWh,
          electricityKWh: processElectricityKWh,
          heatKWh: 0,
          heatCoveredKWh: 0,
          heatResidualKWh: 0,
          solarKWp,
          yieldPerKWp,
          ch4: 0,
          h2: 0,
          co2: 0,
          makeupWaterKg: 0,
          swro: 0,
          seawaterKg: 0,
          brineKg: 0,
          airKg: 0,
          consumablesKg: 0,
          _scaleBasis: productKg,
        };
      };
      return applyCapScale(raw(rate), raw, caps, [
        [product, product],
        ['solarKWp', 'solarKWp'],
      ]);
    },
    apply: (current, duties) => {
      applyRatioScale(current, baseline, duties.scale);
      applyPowerAndSite(current, duties);
    },
    measure: (solved, duties) => {
      const achieved = sinkMassKg(solved, chain.sink);
      if (duties.scale > 0 && achieved > 0) yieldPerScale = achieved / duties.scale;
      return {
        achieved,
        gaps: [
          relativeGap(achieved, duties[product]),
          relativeGap(activity(solved, chain.primary), duties[primaryKey]),
        ],
        extras: {
          scale: duties.scale,
          [product]: duties[product],
          ...(primaryKey !== product ? { [primaryKey]: duties[primaryKey] } : {}),
        },
      };
    },
  });
}

// Brine strategy: recovered product per kg brine is re-measured each solve, and
// electricity outside the minerals block and brine pump (`otherKWh`) is carried
// over from the last solve unscaled.
function sizeMinerals(definition, product, target, opts) {
  const minerals = converter(definition, 'brine-minerals');
  if (!minerals) throw new Error('sizeToProduct needs a brine-minerals block to size lithium or salt demand');
  const sink = productSink(definition, product);
  if (!sink) throw new Error(`sizeToProduct needs a ${product} sink`);
  const brine = brineSource(definition, minerals);
  if (!brine?.params?.stream || brine.params.stream.kind !== 'material') {
    throw new Error('sizeToProduct needs a brine source feeding brine-minerals');
  }
  const yield0 = mineralYieldPerKg(brine.params.stream, minerals.params || {}, product);
  if (!(yield0 > 0)) throw new Error(`sizeToProduct cannot size ${product}: brine has no recoverable ${product}`);
  const sec = Number(minerals.params?.electricityKWhPerKgBrine ?? 0.05);
  const currentBrineKg = streamMassKg(brine.params.stream);
  const suppliedKWh = Number(electricityNode(definition)?.params?.stream?.kWh) || 0;
  const pumpKWh0 = intakePumpElectricityKWh(definition, currentBrineKg);
  let otherKWh = Math.max(0, suppliedKWh - currentBrineKg * sec - pumpKWh0);
  let yieldPerKg = yield0;

  return iterateSize(definition, target, opts, {
    product,
    estimate: (current, rate, caps) => {
      const yieldPerKWp = dailyPvKWhPerKWp(current);
      const raw = kg => {
        const brineKg = Math.max(0, kg);
        const processElectricityKWh = brineKg * sec + intakePumpElectricityKWh(current, brineKg) + otherKWh;
        const cascade = dutyHeat({
          definition: current,
          sinks: processHeatSinks(current),
          heatCredit: opts.heatCredit,
        });
        return {
          brineKg,
          seawaterKg: brineKg,
          ...powerDuties(processElectricityKWh, cascade, yieldPerKWp),
          yieldPerKWp,
          makeupWaterKg: 0,
          swro: 0,
          h2: 0,
          ch4: 0,
          co2: 0,
          airKg: 0,
          consumablesKg: 0,
          _scaleBasis: brineKg,
        };
      };
      return applyCapScale(raw(rate / yieldPerKg), raw, caps, [
        ['minerals', 'brineKg'],
        ['solarKWp', 'solarKWp'],
      ]);
    },
    apply: applyMineralDuties,
    measure: (solved, duties, current) => {
      const achieved = sinkMassKg(solved, sink);
      const brineActivity = activity(solved, minerals);
      if (duties.brineKg > 0 && achieved > 0) yieldPerKg = achieved / duties.brineKg;
      const consumedKWh = electricityConsumed(solved);
      otherKWh = Math.max(0, consumedKWh - brineActivity * sec - intakePumpElectricityKWh(current, brineActivity));
      return {
        achieved,
        gaps: [
          relativeGap(brineActivity, duties.brineKg),
          relativeGap(consumedKWh, duties.electricityKWh),
        ],
        extras: { achievedBrine: brineActivity },
      };
    },
  });
}

function normalizeProduct(product) {
  const key = String(product ?? '').trim().toLowerCase();
  const normalized = PRODUCT_ALIASES[key];
  if (!normalized) {
    throw new Error('Unknown product. Use CH4, H2, methanol, ammonia, lithium, salt, module, steel, ethylene, diesel, urea, titanium, float-glass, cement, copper, or ndpr');
  }
  return normalized;
}

function sizeToProduct(opts = {}) {
  const product = normalizeProduct(opts.product);
  const rate = opts.rate;
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error('Product rate must be a non-negative finite kg/day');
  }
  const caseOrBuilder = opts.definition ?? opts.caseOrBuilder;
  const definition = resolveDefinition(caseOrBuilder);
  const maxIterations = Math.max(1, Number(opts.maxIterations) || DEFAULT_MAX_ITERATIONS);
  const tolerance = Number(opts.tolerance) > 0 ? Number(opts.tolerance) : DEFAULT_TOLERANCE;
  const loopOpts = { caps: opts.caps || {}, maxIterations, tolerance, heatCredit: opts.heatCredit };
  if (product === 'CH4') return sizeMethane(definition, rate, loopOpts);
  if (product === 'H2') return sizeHydrogen(definition, rate, loopOpts);
  if (product === 'methanol') return sizeMethanol(definition, rate, loopOpts);
  if (product === 'ammonia') return sizeAmmonia(definition, rate, loopOpts);
  if (RATIO_ISLANDS[product]) return sizeRatioIsland(definition, product, rate, loopOpts);
  return sizeMinerals(definition, product, rate, loopOpts);
}

return {
  sizeToProduct,
};
});
