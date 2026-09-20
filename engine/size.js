(function exposeSize(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./model') : root.FlowsheetModel,
    typeof require === 'function' ? require('./solve') : root.FlowsheetSolver,
    typeof require === 'function' ? require('./footprint') : root.FlowsheetFootprint,
    typeof require === 'function' ? require('./heat') : root.FlowsheetHeat,
    typeof require === 'function' ? require('./economics') : root.FlowsheetEconomics
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetSize = api;
})(globalThis, (model, solver, footprint, heat, economics) => {
const { SUBSTANCES, cloneStream, scaleStream, streamMassKg } = model;
const { solveOperation } = solver;
const { cascadeHeat } = heat;

// Outer plant-sizing loop. Installed capacity stays fixed inside solveOperation;
// this module is the separate design calculation that chooses those capacities.
//
// product kg/day (CH4, H2, methanol, ammonia, lithium, salt)
//   -> strategy estimates converter duties and source budgets
//   -> T-feasible cascade before purchasing heat on every path with
//      sinks/sources; residual heat is electric resistance COP=1 for PV;
//      covered heat is not. Parked converters are not credited.
//   -> solarKWp from site.dailyPVKWhPerKWp (else typical-day hourly sum)
//   -> solveOperation
//   -> recycle / yield credit from the solved plant
//   -> repeat until the operating residual is within tolerance
//
// Prices, CAPEX, OPEX, NPV, and IRR never enter the physics sizing loop.
// sizeForPositiveCashflow scores dollars only after solveOperation via
// evaluateEconomics / scorePositiveCashflow. Land hectares are recorded from
// engine/footprint.js as a physical consequence of the sized array and pads.
// Solar installedCapex/fixedOM on the electricity source are scaled with kWp
// only so the definition stays consistent after sizing; they are not a
// convergence signal inside iterateSize.

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
};
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

function cloneDefinition(definition) {
  return JSON.parse(JSON.stringify(definition));
}

function resolveDefinition(caseOrBuilder) {
  const definition = typeof caseOrBuilder === 'function' ? caseOrBuilder() : caseOrBuilder;
  if (!definition?.graph?.nodes) throw new Error('sizeToProduct needs a case definition or builder');
  return cloneDefinition(definition);
}

function nodeBy(definition, predicate) {
  return definition.graph.nodes.find(predicate);
}

function converter(definition, unit) {
  if (unit === 'dac') return nodeBy(definition, node => String(node.unit).startsWith('dac'));
  if (unit === 'desal') return nodeBy(definition, node => ['swro', 'med', 'msf'].includes(node.unit));
  return nodeBy(definition, node => node.unit === unit);
}

function hasWaterRecycle(definition, sabatier) {
  if (!sabatier) return false;
  return definition.graph.edges.some(edge => edge.recycle && edge.from.node === sabatier.id);
}

function dailyPvKWhPerKWp(definition) {
  const listed = Number(definition.site?.dailyPVKWhPerKWp);
  if (listed > 0) return listed;
  const hours = solver.hourlyProfile?.(definition.site);
  if (hours?.length) {
    const sum = hours.reduce((total, value) => total + value, 0);
    if (sum > 0) return sum;
  }
  return 0;
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
  if (upstream.unit === 'material-mixer' || upstream.unit === 'electrical-bus') {
    const feed = definition.graph.edges.find(item => item.to.node === upstream.id && !item.recycle);
    return feed ? nodeBy(definition, node => node.id === feed.from.node) : upstream;
  }
  return upstream;
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
    recovery: Number(desal?.params?.recovery ?? 0.45) || 0.45,
    productDensity: Number(desal?.params?.productDensityKgM3 ?? 1000) || 1000,
    feedDensity: Number(desal?.params?.feedDensityKgM3 ?? 1025) || 1025,
    secH2: Number(electrolyzer?.params?.secKWhPerKgH2 ?? 52),
    secDac: Number(dac?.params?.electricityKWhPerKgCO2 ?? 0.5),
    heatDac: String(dac?.unit).includes('electroswing') ? 0 : Number(dac?.params?.heatKWhPerKgCO2 ?? 0),
    secDesal: Number(desal?.params?.secKWhPerM3 ?? desal?.params?.electricityKWhPerM3 ?? 3.5),
    heatDesal: Number(desal?.params?.heatKWhPerM3 ?? 0),
    secCh4: Number(sabatier.params?.electricityKWhPerKgCH4 ?? sabatier.params?.secKWhPerKgCH4 ?? 1),
    heatKWhPerKgCH4: Number(sabatier.params?.heatKWhPerKgCH4 ?? 2.86),
    wasteHeatT_C: Number(sabatier.params?.wasteHeatT_C ?? 250),
    minHeatDac: Number(dac?.params?.minHeatT_C ?? 80),
    minHeatDesal: Number(desal?.params?.minHeatT_C ?? 0),
    captureFraction: Number(dac?.params?.captureFraction ?? 0.9),
    consumablesPerKgCO2: Number(dac?.params?.consumablesPerKgCO2 ?? 0),
    recycle: hasWaterRecycle(definition, sabatier),
  };
}

function creditHeat(flag) {
  return flag !== false;
}

function cascadePurchasedHeat({ sources = [], sinks = [], enabled = true } = {}) {
  const demandKWh = (sinks || []).reduce((sum, sink) => sum + (Number(sink.demandKWh) || 0), 0);
  if (!enabled) {
    return { heatCoveredKWh: 0, purchasedHeatKWh: demandKWh, heatResidualKWh: demandKWh };
  }
  const cascade = cascadeHeat({ sources, sinks });
  return {
    heatCoveredKWh: cascade.coveredKWh,
    purchasedHeatKWh: cascade.residualDemandKWh,
    heatResidualKWh: cascade.residualDemandKWh,
  };
}

function parkedSet(parked = []) {
  return new Set((parked || []).filter(Boolean).map(item => (typeof item === 'string' ? item : item.id)));
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

function liveHeatSources(definition, parked = []) {
  const skip = parkedSet(parked);
  const sources = [];
  for (const node of definition.graph?.nodes || []) {
    if (skip.has(node.id) || skip.has(node.unit)) continue;
    const source = converterWasteHeat(node, converterActivity(definition, node));
    if (source) sources.push(source);
  }
  return sources;
}

function processHeatSinks(definition, parked = []) {
  const skip = parkedSet(parked);
  const sinks = [];
  for (const node of definition.graph?.nodes || []) {
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

function dutyHeat({ definition, sources = [], sinks = [], parked = [], heatCredit } = {}) {
  const extraIds = new Set(sources.map(item => item.id));
  const live = definition ? liveHeatSources(definition, [...parked, ...extraIds]) : [];
  return cascadePurchasedHeat({
    sources: [...live, ...sources],
    sinks,
    enabled: creditHeat(heatCredit),
  });
}

function reactionProductSink(definition, converterNode, port) {
  if (!converterNode) return null;
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
    ? nodeBy(definition, node => node.id === 'seawater')
      || nodeBy(definition, node => node.siteResource === 'seawater')
      || sourceFeeding(definition, desal.id, 'feed')
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
    waterKgPerKg: WATER_KG_PER_KG_H2,
    recovery: Number(desal?.params?.recovery ?? 0.45) || 0.45,
    productDensity: Number(desal?.params?.productDensityKgM3 ?? 1000) || 1000,
    feedDensity: Number(desal?.params?.feedDensityKgM3 ?? 1025) || 1025,
    secH2: Number(electrolyzer.params?.secKWhPerKgH2 ?? 52),
    secDesal: Number(desal?.params?.secKWhPerM3 ?? desal?.params?.electricityKWhPerM3 ?? 3.5),
    heatDesal: Number(desal?.params?.heatKWhPerM3 ?? 0),
    minHeatDesal: Number(desal?.params?.minHeatT_C ?? 0),
  };
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
    sabatier: converter(definition, 'sabatier'),
    h2Feed,
    co2Feed,
    h2PerKg: 3 * SUBSTANCES.H2.molarMassG / SUBSTANCES.CH3OH.molarMassG,
    co2PerKg: SUBSTANCES.CO2.molarMassG / SUBSTANCES.CH3OH.molarMassG,
    waterKgPerKg: 3 * SUBSTANCES.H2O.molarMassG / SUBSTANCES.CH3OH.molarMassG,
    recovery: Number(desal?.params?.recovery ?? 0.45) || 0.45,
    productDensity: Number(desal?.params?.productDensityKgM3 ?? 1000) || 1000,
    feedDensity: Number(desal?.params?.feedDensityKgM3 ?? 1025) || 1025,
    secH2: electrolyzer ? Number(electrolyzer.params?.secKWhPerKgH2 ?? 52) : 0,
    secDac: dac ? Number(dac.params?.electricityKWhPerKgCO2 ?? 0.5) : 0,
    heatDac: dac && !String(dac.unit).includes('electroswing') ? Number(dac.params?.heatKWhPerKgCO2 ?? 0) : 0,
    secDesal: Number(desal?.params?.secKWhPerM3 ?? desal?.params?.electricityKWhPerM3 ?? 3.5),
    heatDesal: Number(desal?.params?.heatKWhPerM3 ?? 0),
    secMeoh: Number(methanol.params?.electricityKWhPerKg ?? 0.5),
    wasteHeatPerKg: Number(methanol.params?.wasteHeatKWhPerKg ?? methanol.params?.heatKWhPerKg ?? 0.43),
    wasteHeatT_C: Number(methanol.params?.wasteHeatT_C ?? 250),
    minHeatDac: Number(dac?.params?.minHeatT_C ?? 80),
    minHeatDesal: Number(desal?.params?.minHeatT_C ?? 0),
    captureFraction: Number(dac?.params?.captureFraction ?? 0.9),
    consumablesPerKgCO2: Number(dac?.params?.consumablesPerKgCO2 ?? 0),
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
  const dac = converter(definition, 'dac');
  return {
    ammonia,
    sink,
    electrolyzer,
    asu,
    desal,
    dac,
    h2Feed,
    n2Feed,
    h2PerKg: 1.5 * SUBSTANCES.H2.molarMassG / SUBSTANCES.NH3.molarMassG,
    n2PerKg: 0.5 * SUBSTANCES.N2.molarMassG / SUBSTANCES.NH3.molarMassG,
    waterKgPerKg: 1.5 * SUBSTANCES.H2O.molarMassG / SUBSTANCES.NH3.molarMassG,
    recovery: Number(desal?.params?.recovery ?? 0.45) || 0.45,
    productDensity: Number(desal?.params?.productDensityKgM3 ?? 1000) || 1000,
    feedDensity: Number(desal?.params?.feedDensityKgM3 ?? 1025) || 1025,
    secH2: electrolyzer ? Number(electrolyzer.params?.secKWhPerKgH2 ?? 52) : 0,
    secAsu: asu ? Number(asu.params?.electricityKWhPerKgN2 ?? 0.25) : 0,
    secDesal: Number(desal?.params?.secKWhPerM3 ?? desal?.params?.electricityKWhPerM3 ?? 3.5),
    heatDesal: Number(desal?.params?.heatKWhPerM3 ?? 0),
    heatDac: dac && !String(dac.unit).includes('electroswing') ? Number(dac.params?.heatKWhPerKgCO2 ?? 0) : 0,
    secNH3: Number(ammonia.params?.electricityKWhPerKg ?? 0.6),
    minHeatDac: Number(dac?.params?.minHeatT_C ?? 80),
    minHeatDesal: Number(desal?.params?.minHeatT_C ?? 0),
    captureFraction: Number(dac?.params?.captureFraction ?? 0.9),
    nitrogenRecovery: Number(asu?.params?.nitrogenRecovery ?? 0.98) || 0.98,
  };
}

function airKgForCo2(definition, co2Kg, captureFraction) {
  const air = nodeBy(definition, node => node.id === 'air')
    || nodeBy(definition, node => node.siteResource === 'air');
  if (!air?.params?.stream || !(co2Kg > 0) || !(captureFraction > 0)) return 0;
  const mass = streamMassKg(air.params.stream);
  const co2KgInAir = (air.params.stream.mol.CO2 || 0) * SUBSTANCES.CO2.molarMassG / 1000;
  if (!(mass > 0) || !(co2KgInAir > 0)) return 0;
  return co2Kg / captureFraction / (co2KgInAir / mass);
}

function airKgForN2(definition, n2Kg, nitrogenRecovery) {
  const air = nodeBy(definition, node => node.id === 'air')
    || nodeBy(definition, node => node.siteResource === 'air');
  if (!air?.params?.stream || !(n2Kg > 0) || !(nitrogenRecovery > 0)) return 0;
  const mass = streamMassKg(air.params.stream);
  const n2KgInAir = (air.params.stream.mol.N2 || 0) * SUBSTANCES.N2.molarMassG / 1000;
  if (!(mass > 0) || !(n2KgInAir > 0)) return 0;
  return n2Kg / nitrogenRecovery / (n2KgInAir / mass);
}

function applyCapScale(duties, raw, caps, keys) {
  const scales = [1];
  const pushScale = (cap, duty) => {
    if (cap != null && Number.isFinite(cap) && duty > 0) scales.push(Math.max(0, cap) / duty);
  };
  for (const [capKey, dutyKey] of keys) pushScale(caps[capKey], duties[dutyKey]);
  const scale = Math.min(...scales);
  const capped = scale < 1 - 1e-12;
  let next = capped ? raw(duties._scaleBasis * scale) : duties;
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

function estimateDuties(definition, methaneKg, recoveredPerKg, caps, heatCredit = true) {
  const chain = chainParams(definition);
  const yieldPerKWp = dailyPvKWhPerKWp(definition);
  const recycleCredit = chain.recycle ? Math.max(0, recoveredPerKg) : 0;
  const enabled = creditHeat(heatCredit);

  const raw = ch4 => {
    const methane = Math.max(0, ch4);
    const h2 = methane * chain.h2PerKg;
    const co2 = methane * chain.co2PerKg;
    const makeupWaterKg = Math.max(0, methane * chain.waterKgPerKg - methane * recycleCredit);
    const swro = makeupWaterKg / chain.productDensity;
    const seawaterKg = (chain.recovery > 0 ? swro / chain.recovery : 0) * chain.feedDensity;
    const processElectricityKWh = h2 * chain.secH2 + co2 * chain.secDac + swro * chain.secDesal + methane * chain.secCh4;
    const dacHeatKWh = co2 * chain.heatDac;
    const desalHeatKWh = swro * chain.heatDesal;
    const sources = [];
    const sinks = [];
    if (methane > 0 && chain.heatKWhPerKgCH4 > 0) {
      sources.push({
        id: chain.sabatier.id,
        kWh: methane * chain.heatKWhPerKgCH4,
        T_C: chain.wasteHeatT_C,
      });
    }
    if (dacHeatKWh > 0 && chain.dac) {
      sinks.push({
        id: chain.dac.id,
        demandKWh: dacHeatKWh,
        minT_C: chain.minHeatDac,
      });
    }
    if (desalHeatKWh > 0 && chain.desal) {
      sinks.push({
        id: chain.desal.id,
        demandKWh: desalHeatKWh,
        minT_C: chain.minHeatDesal,
      });
    }
    const cascade = dutyHeat({
      definition,
      sources,
      sinks,
      parked: [chain.sabatier],
      heatCredit: enabled,
    });
    // Screening: unmet process heat after cascade is electric resistance COP=1.
    // Covered cascade duty is not added to electricity or PV.
    const electricityKWh = processElectricityKWh + cascade.heatResidualKWh;
    const solarKWp = yieldPerKWp > 0 ? electricityKWh / yieldPerKWp : 0;
    return {
      ch4: methane,
      h2,
      co2,
      makeupWaterKg,
      swro,
      seawaterKg,
      processElectricityKWh,
      electricityKWh,
      heatKWh: cascade.purchasedHeatKWh,
      heatCoveredKWh: cascade.heatCoveredKWh,
      heatResidualKWh: cascade.heatResidualKWh,
      solarKWp,
      airKg: airKgForCo2(definition, co2, chain.captureFraction),
      consumablesKg: co2 * chain.consumablesPerKgCO2,
      yieldPerKWp,
      _scaleBasis: methane,
    };
  };

  let duties = raw(methaneKg);
  return applyCapScale(duties, raw, caps, [
    ['sabatier', 'ch4'],
    ['electrolyzer', 'h2'],
    ['dac', 'co2'],
    ['swro', 'swro'],
    ['solarKWp', 'solarKWp'],
  ]);
}

function estimateH2Duties(definition, h2Kg, caps, heatCredit = true) {
  const chain = h2Chain(definition);
  const yieldPerKWp = dailyPvKWhPerKWp(definition);
  const raw = targetH2 => {
    const h2 = Math.max(0, targetH2);
    const makeupWaterKg = h2 * chain.waterKgPerKg;
    const swro = chain.desal ? makeupWaterKg / chain.productDensity : 0;
    const seawaterKg = chain.desal
      ? (chain.recovery > 0 ? swro / chain.recovery : 0) * chain.feedDensity
      : makeupWaterKg;
    const processElectricityKWh = h2 * chain.secH2 + swro * chain.secDesal;
    const desalHeatKWh = swro * chain.heatDesal;
    const sinks = desalHeatKWh > 0 && chain.desal
      ? [{ id: chain.desal.id, demandKWh: desalHeatKWh, minT_C: chain.minHeatDesal }]
      : [];
    // H2 parks Sabatier/DAC: no methanation waste credit. Other live hot
    // sources (not parked) may cover MED/MSF heat. Residual is COP=1.
    const cascade = dutyHeat({
      definition,
      sources: [],
      sinks,
      parked: [chain.sabatier, chain.dac],
      heatCredit,
    });
    const electricityKWh = processElectricityKWh + cascade.heatResidualKWh;
    const solarKWp = yieldPerKWp > 0 ? electricityKWh / yieldPerKWp : 0;
    return {
      ch4: 0,
      h2,
      co2: 0,
      makeupWaterKg,
      swro,
      seawaterKg,
      processElectricityKWh,
      electricityKWh,
      heatKWh: cascade.purchasedHeatKWh,
      heatCoveredKWh: cascade.heatCoveredKWh,
      heatResidualKWh: cascade.heatResidualKWh,
      solarKWp,
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

function estimateMethanolDuties(definition, methanolKg, caps, heatCredit = true) {
  const chain = methanolChain(definition);
  const yieldPerKWp = dailyPvKWhPerKWp(definition);
  const usesElectrolyzer = chain.h2Feed?.unit === 'electrolyzer' || Boolean(chain.electrolyzer && chain.h2Feed?.id === chain.electrolyzer.id);
  const usesDac = Boolean(chain.dac) && (chain.co2Feed?.id === chain.dac.id || String(chain.co2Feed?.unit || '').startsWith('dac'));
  const raw = target => {
    const methanol = Math.max(0, target);
    const h2 = methanol * chain.h2PerKg;
    const co2 = methanol * chain.co2PerKg;
    const makeupWaterKg = usesElectrolyzer ? h2 * WATER_KG_PER_KG_H2 : 0;
    const swro = chain.desal && makeupWaterKg > 0 ? makeupWaterKg / chain.productDensity : 0;
    const seawaterKg = chain.desal && swro > 0
      ? (chain.recovery > 0 ? swro / chain.recovery : 0) * chain.feedDensity
      : makeupWaterKg;
    const processElectricityKWh = methanol * chain.secMeoh
      + (usesElectrolyzer ? h2 * chain.secH2 : 0)
      + (usesDac ? co2 * chain.secDac : 0)
      + swro * chain.secDesal;
    const sources = [];
    const sinks = [];
    if (methanol > 0 && chain.wasteHeatPerKg > 0) {
      sources.push({ id: chain.methanol.id, kWh: methanol * chain.wasteHeatPerKg, T_C: chain.wasteHeatT_C });
    }
    const dacHeatKWh = usesDac ? co2 * chain.heatDac : 0;
    const desalHeatKWh = swro * chain.heatDesal;
    if (dacHeatKWh > 0 && chain.dac) {
      sinks.push({ id: chain.dac.id, demandKWh: dacHeatKWh, minT_C: chain.minHeatDac });
    }
    if (desalHeatKWh > 0 && chain.desal) {
      sinks.push({ id: chain.desal.id, demandKWh: desalHeatKWh, minT_C: chain.minHeatDesal });
    }
    const cascade = dutyHeat({
      definition,
      sources,
      sinks,
      parked: [chain.methanol],
      heatCredit,
    });
    const electricityKWh = processElectricityKWh + cascade.heatResidualKWh;
    const solarKWp = yieldPerKWp > 0 ? electricityKWh / yieldPerKWp : 0;
    return {
      methanol,
      ch4: 0,
      h2,
      co2,
      makeupWaterKg,
      swro,
      seawaterKg,
      processElectricityKWh,
      electricityKWh,
      heatKWh: cascade.purchasedHeatKWh,
      heatCoveredKWh: cascade.heatCoveredKWh,
      heatResidualKWh: cascade.heatResidualKWh,
      solarKWp,
      airKg: usesDac ? airKgForCo2(definition, co2, chain.captureFraction) : 0,
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

function estimateAmmoniaDuties(definition, ammoniaKg, caps, heatCredit = true) {
  const chain = ammoniaChain(definition);
  const yieldPerKWp = dailyPvKWhPerKWp(definition);
  const usesElectrolyzer = chain.h2Feed?.unit === 'electrolyzer' || Boolean(chain.electrolyzer && chain.h2Feed?.id === chain.electrolyzer.id);
  const usesAsu = chain.n2Feed?.unit === 'asu' || Boolean(chain.asu && chain.n2Feed?.id === chain.asu.id);
  const raw = target => {
    const ammonia = Math.max(0, target);
    const h2 = ammonia * chain.h2PerKg;
    const n2 = ammonia * chain.n2PerKg;
    const makeupWaterKg = usesElectrolyzer ? h2 * WATER_KG_PER_KG_H2 : 0;
    const swro = chain.desal && makeupWaterKg > 0 ? makeupWaterKg / chain.productDensity : 0;
    const seawaterKg = chain.desal && swro > 0
      ? (chain.recovery > 0 ? swro / chain.recovery : 0) * chain.feedDensity
      : makeupWaterKg;
    const processElectricityKWh = ammonia * chain.secNH3
      + (usesElectrolyzer ? h2 * chain.secH2 : 0)
      + (usesAsu ? n2 * chain.secAsu : 0)
      + swro * chain.secDesal;
    const sinks = [];
    const desalHeatKWh = swro * chain.heatDesal;
    if (desalHeatKWh > 0 && chain.desal) {
      sinks.push({ id: chain.desal.id, demandKWh: desalHeatKWh, minT_C: chain.minHeatDesal });
    }
    const cascade = dutyHeat({
      definition,
      sources: [],
      sinks: [...sinks, ...processHeatSinks(definition, [chain.desal])],
      parked: [],
      heatCredit,
    });
    const electricityKWh = processElectricityKWh + cascade.heatResidualKWh;
    const solarKWp = yieldPerKWp > 0 ? electricityKWh / yieldPerKWp : 0;
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
      processElectricityKWh,
      electricityKWh,
      heatKWh: cascade.purchasedHeatKWh,
      heatCoveredKWh: cascade.heatCoveredKWh,
      heatResidualKWh: cascade.heatResidualKWh,
      solarKWp,
      airKg: usesAsu ? airKgForN2(definition, n2, chain.nitrogenRecovery) : 0,
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
  if (definition && targetKg > 0) assertSizeMayAssume(definition, [node.siteResource]);
  const current = streamMassKg(node.params.stream);
  if (!(current > 0)) return;
  node.params.stream = scaleStream(node.params.stream, Math.max(0, targetKg) / current);
}

function setElectricity(node, kWh, definition) {
  if (!node?.params?.stream) return;
  if (definition && kWh > 0) assertSizeMayAssume(definition, [node.siteResource]);
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

function scaleFeedNode(definition, node, kg) {
  if (!node) return;
  if (node.params?.stream?.kind === 'material') {
    setMaterial(node, kg, definition);
    syncSiteResource(definition, node);
    return;
  }
  const setpoints = definition.operation.setpoints || (definition.operation.setpoints = {});
  if (node.unit === 'chlor-alkali') {
    const naohKg = kg * 2 * SUBSTANCES.NaOH.molarMassG / SUBSTANCES.H2.molarMassG;
    setpoints[node.id] = naohKg;
    node.capacity = naohKg;
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
  setpoints[node.id] = kg;
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
  if (!node) return;
  const setpoints = definition.operation.setpoints || (definition.operation.setpoints = {});
  setpoints[node.id] = 0;
  node.capacity = 0;
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
  const setpoints = definition.operation.setpoints || (definition.operation.setpoints = {});
  setpoints[chain.sabatier.id] = duties.ch4;
  chain.sabatier.capacity = duties.ch4;
  if (chain.electrolyzer) {
    setpoints[chain.electrolyzer.id] = duties.h2;
    chain.electrolyzer.capacity = duties.h2;
  }
  if (chain.dac) {
    setpoints[chain.dac.id] = duties.co2;
    chain.dac.capacity = duties.co2;
  }
  if (chain.desal) {
    setpoints[chain.desal.id] = duties.swro;
    chain.desal.capacity = duties.swro;
  }

  const air = nodeBy(definition, node => node.id === 'air') || nodeBy(definition, node => node.siteResource === 'air');
  const seawater = nodeBy(definition, node => node.id === 'seawater')
    || nodeBy(definition, node => node.siteResource === 'seawater');
  const heat = nodeBy(definition, node => node.id === 'heat') || nodeBy(definition, node => node.siteResource === 'heat');
  const consumables = nodeBy(definition, node => node.id === 'consumables')
    || nodeBy(definition, node => node.unit === 'consumable-source');

  if (duties.airKg > 0) setMaterial(air, duties.airKg, definition);
  if (duties.seawaterKg > 0) setMaterial(seawater, duties.seawaterKg, definition);
  // Purchased residual is duties.heatKWh. Cascade is accounting-only (no HEN,
  // no edge rewrite), so the heat-source still delivers residual + covered
  // process demand. Always write, including 0, to avoid a stale heat budget.
  setHeat(heat, (duties.heatKWh || 0) + (duties.heatCoveredKWh || 0));
  if (duties.consumablesKg > 0) setConsumable(consumables, duties.consumablesKg);

  applyPowerAndSite(definition, duties);
  for (const node of [air, seawater, heat, consumables]) syncSiteResource(definition, node);

  definition.operation.boundaryLimitedBy = duties.capped ? ['sizing cap'] : [];
}

function ensureHydrogenOfftake(definition, electrolyzer, sabatier) {
  if (!electrolyzer) return;
  const edges = definition.graph.edges || (definition.graph.edges = []);
  const h2Edge = edges.find(edge => edge.from?.node === electrolyzer.id && edge.from?.port === 'hydrogen');
  const sinkId = 'hydrogen';
  let sink = nodeBy(definition, node => node.id === sinkId)
    || nodeBy(definition, node => node.unit === 'material-sink' && /h2|hydrogen/i.test(node.id));
  if (!sink) {
    sink = { id: sinkId, unit: 'material-sink' };
    definition.graph.nodes.push(sink);
  }
  const previousSink = h2Edge?.to?.node;
  if (h2Edge) {
    // Parked Sabatier must not swallow product H2 — sell/vent through a sink.
    if (h2Edge.to?.node !== sink.id) h2Edge.to = { node: sink.id, port: 'in' };
  } else {
    edges.push({ from: { node: electrolyzer.id, port: 'hydrogen' }, to: { node: sink.id, port: 'in' } });
  }
  if (sabatier) {
    // Sabatier.hydrogen is required; feed a zero stream so validation stays closed while parked.
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
    else if (previousSink === sabatier.id || !edges.some(edge => edge.to?.node === sabatier.id && edge.to?.port === 'hydrogen')) {
      edges.push({ from: { node: park.id, port: 'out' }, to: { node: sabatier.id, port: 'hydrogen' } });
    }
  }
}

function applyH2Duties(definition, duties) {
  const chain = h2Chain(definition);
  const setpoints = definition.operation.setpoints || (definition.operation.setpoints = {});
  setpoints[chain.electrolyzer.id] = duties.h2;
  chain.electrolyzer.capacity = duties.h2;
  if (chain.desal) {
    setpoints[chain.desal.id] = duties.swro;
    chain.desal.capacity = duties.swro;
  }
  parkConverter(definition, chain.sabatier);
  parkConverter(definition, chain.dac);
  ensureHydrogenOfftake(definition, chain.electrolyzer, chain.sabatier);

  const water = chain.water
    || nodeBy(definition, node => node.id === 'seawater')
    || nodeBy(definition, node => node.siteResource === 'seawater');
  const heat = nodeBy(definition, node => node.id === 'heat') || nodeBy(definition, node => node.siteResource === 'heat');
  if (duties.seawaterKg > 0) setMaterial(water, duties.seawaterKg, definition);
  setHeat(heat, (duties.heatKWh || 0) + (duties.heatCoveredKWh || 0));
  applyPowerAndSite(definition, duties);
  syncSiteResource(definition, water);
  syncSiteResource(definition, heat);
  definition.operation.boundaryLimitedBy = duties.capped ? ['sizing cap'] : [];
}

function applyMethanolDuties(definition, duties) {
  const chain = methanolChain(definition);
  const setpoints = definition.operation.setpoints || (definition.operation.setpoints = {});
  setpoints[chain.methanol.id] = duties.methanol;
  chain.methanol.capacity = duties.methanol;
  if (chain.electrolyzer && (chain.h2Feed?.id === chain.electrolyzer.id || chain.h2Feed?.unit === 'electrolyzer')) {
    setpoints[chain.electrolyzer.id] = duties.h2;
    chain.electrolyzer.capacity = duties.h2;
  } else {
    scaleFeedNode(definition, chain.h2Feed, duties.h2);
  }
  if (chain.dac && (chain.co2Feed?.id === chain.dac.id || String(chain.co2Feed?.unit || '').startsWith('dac'))) {
    setpoints[chain.dac.id] = duties.co2;
    chain.dac.capacity = duties.co2;
  } else {
    scaleFeedNode(definition, chain.co2Feed, duties.co2);
  }
  if (chain.desal) {
    setpoints[chain.desal.id] = duties.swro;
    chain.desal.capacity = duties.swro;
  }
  const seawater = nodeBy(definition, node => node.id === 'seawater')
    || nodeBy(definition, node => node.siteResource === 'seawater');
  const air = nodeBy(definition, node => node.id === 'air') || nodeBy(definition, node => node.siteResource === 'air');
  const heat = nodeBy(definition, node => node.id === 'heat') || nodeBy(definition, node => node.siteResource === 'heat');
  const consumables = nodeBy(definition, node => node.id === 'consumables')
    || nodeBy(definition, node => node.unit === 'consumable-source');
  if (duties.seawaterKg > 0) setMaterial(seawater || chain.desal && sourceFeeding(definition, chain.desal.id, 'feed'), duties.seawaterKg, definition);
  if (duties.airKg > 0) setMaterial(air, duties.airKg, definition);
  setHeat(heat, (duties.heatKWh || 0) + (duties.heatCoveredKWh || 0));
  if (duties.consumablesKg > 0) setConsumable(consumables, duties.consumablesKg);
  applyPowerAndSite(definition, duties);
  for (const node of [seawater, air, heat, consumables]) syncSiteResource(definition, node);
  definition.operation.boundaryLimitedBy = duties.capped ? ['sizing cap'] : [];
}

function applyAmmoniaDuties(definition, duties) {
  const chain = ammoniaChain(definition);
  const setpoints = definition.operation.setpoints || (definition.operation.setpoints = {});
  setpoints[chain.ammonia.id] = duties.ammonia;
  chain.ammonia.capacity = duties.ammonia;
  if (chain.electrolyzer && (chain.h2Feed?.id === chain.electrolyzer.id || chain.h2Feed?.unit === 'electrolyzer')) {
    setpoints[chain.electrolyzer.id] = duties.h2;
    chain.electrolyzer.capacity = duties.h2;
  } else {
    scaleFeedNode(definition, chain.h2Feed, duties.h2);
  }
  if (chain.asu && (chain.n2Feed?.id === chain.asu.id || chain.n2Feed?.unit === 'asu')) {
    setpoints[chain.asu.id] = duties.n2;
    chain.asu.capacity = duties.n2;
  } else {
    scaleFeedNode(definition, chain.n2Feed, duties.n2);
  }
  if (chain.desal) {
    setpoints[chain.desal.id] = duties.swro;
    chain.desal.capacity = duties.swro;
  }
  const seawater = nodeBy(definition, node => node.id === 'seawater')
    || nodeBy(definition, node => node.siteResource === 'seawater');
  const air = nodeBy(definition, node => node.id === 'air') || nodeBy(definition, node => node.siteResource === 'air');
  const heat = nodeBy(definition, node => node.id === 'heat') || nodeBy(definition, node => node.siteResource === 'heat');
  if (duties.seawaterKg > 0) setMaterial(seawater, duties.seawaterKg, definition);
  if (duties.airKg > 0) setMaterial(air, duties.airKg, definition);
  setHeat(heat, (duties.heatKWh || 0) + (duties.heatCoveredKWh || 0));
  applyPowerAndSite(definition, duties);
  for (const node of [seawater, air, heat]) syncSiteResource(definition, node);
  definition.operation.boundaryLimitedBy = duties.capped ? ['sizing cap'] : [];
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

function processElectricityKWh(duties) {
  if (duties.processElectricityKWh != null) return duties.processElectricityKWh;
  return Math.max(0, (duties.electricityKWh || 0) - (duties.heatResidualKWh || 0));
}

function heatMeasureExtras(solved, duties) {
  const covered = solved?.heatIntegration?.coveredKWh;
  const residual = solved?.heatIntegration?.residualDemandKWh;
  return {
    heatCoveredKWh: Number.isFinite(covered) ? covered : Number(duties?.heatCoveredKWh) || 0,
    heatResidualKWh: Number.isFinite(residual) ? residual : Number(duties?.heatResidualKWh) || 0,
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

function historyDuties(duties, solved, definition, extras = {}) {
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
    heatCoveredKWh: extras.heatCoveredKWh ?? duties.heatCoveredKWh ?? 0,
    heatResidualKWh: extras.heatResidualKWh ?? duties.heatResidualKWh ?? 0,
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
  return nodeBy(definition, node => node.id === 'brine')
    || nodeBy(definition, node => node.siteResource === 'brine')
    || sourceFeeding(definition, minerals.id, 'brine');
}

function recoverMineralKg(residual, productId, cation, cationCount, anion, anionCount, recovery) {
  const fraction = Number(recovery);
  const safe = Number.isFinite(fraction) && fraction > 0 ? Math.min(1, Math.max(0, fraction)) : 0;
  const mol = Math.min((residual[cation] || 0) / cationCount, (residual[anion] || 0) / anionCount) * safe;
  residual[cation] = (residual[cation] || 0) - mol * cationCount;
  residual[anion] = (residual[anion] || 0) - mol * anionCount;
  return mol * SUBSTANCES[productId].molarMassG / 1000;
}

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
  if (!brineStream || brineStream.kind !== 'material') return 0;
  const mass = streamMassKg(brineStream);
  if (!(mass > 0)) return 0;
  return (mineralYieldsKg(brineStream, params)[product] || 0) / mass;
}

function applyMineralDuties(definition, duties) {
  const minerals = converter(definition, 'brine-minerals');
  const setpoints = definition.operation.setpoints || (definition.operation.setpoints = {});
  setpoints[minerals.id] = duties.brineKg;
  minerals.capacity = duties.brineKg;
  const brine = brineSource(definition, minerals);
  if (duties.brineKg >= 0) setMaterial(brine, duties.brineKg, definition);
  const heat = nodeBy(definition, node => node.id === 'heat') || nodeBy(definition, node => node.siteResource === 'heat');
  setHeat(heat, (duties.heatKWh || 0) + (duties.heatCoveredKWh || 0));
  applyPowerAndSite(definition, duties);
  syncSiteResource(definition, brine);
  syncSiteResource(definition, heat);
  definition.operation.boundaryLimitedBy = duties.capped ? ['sizing cap'] : [];
}

function iterateSize({
  definition, target, caps, maxIterations, tolerance, product, estimate, apply, measure,
}) {
  const history = [];
  let residual = Infinity;
  let consistency = Infinity;
  let solved = null;
  let duties = null;
  let iterations = 0;
  let achieved = 0;
  const state = {};

  for (; iterations < maxIterations; iterations += 1) {
    duties = estimate(definition, target, state, caps);
    apply(definition, duties);
    solved = solveOperation(definition);
    const measured = measure(solved, definition, duties, state);
    achieved = measured.achieved;
    consistency = measured.consistency;
    residual = measured.residual;
    Object.assign(state, measured.state || {});
    history.push({
      iteration: iterations + 1,
      residual,
      consistency,
      capped: Boolean(duties.capped),
      duties: measured.historyDuties,
    });
    if (consistency < tolerance && (residual < tolerance || duties.capped)) break;
  }

  const count = Math.min(iterations + 1, maxIterations);
  const warnings = [...(solved.warnings || [])];
  for (const warning of solver.unverifiedRightsWarnings?.(definition.site) || []) {
    if (!warnings.includes(warning)) warnings.push(warning);
  }
  const lastDuties = history[history.length - 1]?.duties || {};
  return {
    definition,
    solved,
    product,
    rate: target,
    target,
    achieved,
    iterations: count,
    residual,
    consistency,
    converged: consistency < tolerance && (relativeGap(achieved, target) < tolerance || Boolean(duties?.capped)),
    history,
    warnings,
    heatCoveredKWh: lastDuties.heatCoveredKWh ?? solved?.heatIntegration?.coveredKWh ?? 0,
    heatResidualKWh: lastDuties.heatResidualKWh ?? solved?.heatIntegration?.residualDemandKWh ?? 0,
  };
}

function sizeMethane(definition, target, opts) {
  const chain = chainParams(definition);
  let recoveredPerKg = chain.recycle ? chain.recoveredWaterPerKg : 0;
  return iterateSize({
    definition,
    target,
    caps: opts.caps || {},
    maxIterations: opts.maxIterations,
    tolerance: opts.tolerance,
    product: 'CH4',
    estimate: (current, methaneKg, _state, caps) => (
      estimateDuties(current, methaneKg, recoveredPerKg, caps, opts.heatCredit)
    ),
    apply: applyDuties,
    measure: (solved, current, duties) => {
      const achieved = activity(solved, chain.sabatier);
      if (chain.recycle && achieved > 0) {
        recoveredPerKg = recoveredWaterKg(solved, chain.sabatier) / achieved;
      } else if (chain.recycle) {
        recoveredPerKg = chain.recoveredWaterPerKg;
      }
      const gaps = [
        relativeGap(achieved, duties.ch4),
        relativeGap(electricityConsumed(solved), processElectricityKWh(duties)),
      ];
      if (chain.electrolyzer) gaps.push(relativeGap(activity(solved, chain.electrolyzer), duties.h2));
      if (chain.dac) gaps.push(relativeGap(activity(solved, chain.dac), duties.co2));
      if (chain.desal) gaps.push(relativeGap(activity(solved, chain.desal), duties.swro));
      if (chain.recycle) {
        const recovered = recoveredWaterKg(solved, chain.sabatier);
        gaps.push(relativeGap(duties.makeupWaterKg, Math.max(0, duties.ch4 * chain.waterKgPerKg - recovered)));
      }
      const consistency = Math.max(...gaps);
      return {
        achieved,
        consistency,
        residual: Math.max(relativeGap(achieved, target), consistency),
        historyDuties: historyDuties(duties, solved, current, {
          achieved,
          achievedH2: activity(solved, chain.electrolyzer),
          achievedCo2: activity(solved, chain.dac),
          achievedSwro: activity(solved, chain.desal),
          achievedElectricityKWh: electricityConsumed(solved),
          ...heatMeasureExtras(solved, duties),
        }),
      };
    },
  });
}

function sizeHydrogen(definition, target, opts) {
  const chain = h2Chain(definition);
  return iterateSize({
    definition,
    target,
    caps: opts.caps || {},
    maxIterations: opts.maxIterations,
    tolerance: opts.tolerance,
    product: 'H2',
    estimate: (current, h2Kg, _state, caps) => estimateH2Duties(current, h2Kg, caps, opts.heatCredit),
    apply: applyH2Duties,
    measure: (solved, current, duties) => {
      const achieved = activity(solved, chain.electrolyzer);
      const gaps = [
        relativeGap(achieved, duties.h2),
        relativeGap(electricityConsumed(solved), processElectricityKWh(duties)),
      ];
      if (chain.desal) gaps.push(relativeGap(activity(solved, chain.desal), duties.swro));
      const consistency = Math.max(...gaps);
      return {
        achieved,
        consistency,
        residual: Math.max(relativeGap(achieved, target), consistency),
        historyDuties: historyDuties(duties, solved, current, {
          achieved,
          achievedH2: achieved,
          achievedSwro: activity(solved, chain.desal),
          achievedElectricityKWh: electricityConsumed(solved),
          ...heatMeasureExtras(solved, duties),
        }),
      };
    },
  });
}

function sizeMethanol(definition, target, opts) {
  const chain = methanolChain(definition);
  return iterateSize({
    definition,
    target,
    caps: opts.caps || {},
    maxIterations: opts.maxIterations,
    tolerance: opts.tolerance,
    product: 'methanol',
    estimate: (current, rate, _state, caps) => estimateMethanolDuties(current, rate, caps, opts.heatCredit),
    apply: applyMethanolDuties,
    measure: (solved, current, duties) => {
      const achieved = sinkMassKg(solved, chain.sink);
      const gaps = [
        relativeGap(activity(solved, chain.methanol), duties.methanol),
        relativeGap(electricityConsumed(solved), processElectricityKWh(duties)),
      ];
      if (chain.electrolyzer && chain.h2Feed?.id === chain.electrolyzer.id) {
        gaps.push(relativeGap(activity(solved, chain.electrolyzer), duties.h2));
      }
      if (chain.dac && chain.co2Feed?.id === chain.dac.id) {
        gaps.push(relativeGap(activity(solved, chain.dac), duties.co2));
      }
      if (chain.desal) gaps.push(relativeGap(activity(solved, chain.desal), duties.swro));
      const consistency = Math.max(...gaps);
      return {
        achieved,
        consistency,
        residual: Math.max(relativeGap(achieved, target), consistency),
        historyDuties: historyDuties(duties, solved, current, {
          achieved,
          achievedMethanol: activity(solved, chain.methanol),
          achievedH2: activity(solved, chain.electrolyzer),
          achievedCo2: activity(solved, chain.dac),
          achievedSwro: activity(solved, chain.desal),
          achievedElectricityKWh: electricityConsumed(solved),
          ...heatMeasureExtras(solved, duties),
        }),
      };
    },
  });
}

function sizeDedicatedAmmonia(definition, target, opts) {
  const chain = ammoniaChain(definition);
  return iterateSize({
    definition,
    target,
    caps: opts.caps || {},
    maxIterations: opts.maxIterations,
    tolerance: opts.tolerance,
    product: 'ammonia',
    estimate: (current, rate, _state, caps) => estimateAmmoniaDuties(current, rate, caps, opts.heatCredit),
    apply: applyAmmoniaDuties,
    measure: (solved, current, duties) => {
      const achieved = sinkMassKg(solved, chain.sink);
      const gaps = [
        relativeGap(activity(solved, chain.ammonia), duties.ammonia),
        relativeGap(electricityConsumed(solved), processElectricityKWh(duties)),
      ];
      if (chain.electrolyzer && chain.h2Feed?.id === chain.electrolyzer.id) {
        gaps.push(relativeGap(activity(solved, chain.electrolyzer), duties.h2));
      }
      if (chain.asu && chain.n2Feed?.id === chain.asu.id) {
        gaps.push(relativeGap(activity(solved, chain.asu), duties.n2));
      }
      if (chain.desal) gaps.push(relativeGap(activity(solved, chain.desal), duties.swro));
      const consistency = Math.max(...gaps);
      return {
        achieved,
        consistency,
        residual: Math.max(relativeGap(achieved, target), consistency),
        historyDuties: historyDuties(duties, solved, current, {
          achieved,
          achievedAmmonia: activity(solved, chain.ammonia),
          achievedH2: activity(solved, chain.electrolyzer),
          achievedN2: activity(solved, chain.asu),
          achievedElectricityKWh: electricityConsumed(solved),
          ...heatMeasureExtras(solved, duties),
        }),
      };
    },
  });
}

function sizeCoupledAmmonia(definition, target, opts) {
  const chain = ammoniaChain(definition);
  const baseline = baselineAbundanceDuties(definition);
  const baseAmmonia = Number(baseline.setpoints[chain.ammonia.id] || 0);
  let yieldPerScale = baseAmmonia > 0 ? baseAmmonia : 1;
  return iterateSize({
    definition,
    target,
    caps: opts.caps || {},
    maxIterations: opts.maxIterations,
    tolerance: opts.tolerance,
    product: 'ammonia',
    estimate: (current, rate, _state, caps) => {
      const yieldPerKWp = dailyPvKWhPerKWp(current);
      const raw = kg => {
        const ammonia = Math.max(0, kg);
        const scale = yieldPerScale > 0 ? ammonia / yieldPerScale : 0;
        const brineKg = baseline.brineKg * scale;
        const powerId = electricityNode(current)?.id;
        const basePower = Number(baseline.streams[powerId]?.kWh) || 0;
        const processElectricityKWh = basePower * scale;
        const sinks = processHeatSinks(current);
        const cascade = dutyHeat({
          definition: current,
          sources: [],
          sinks,
          parked: [],
          heatCredit: opts.heatCredit,
        });
        const electricityKWh = processElectricityKWh + cascade.heatResidualKWh;
        const solarKWp = yieldPerKWp > 0 ? electricityKWh / yieldPerKWp : 0;
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
          processElectricityKWh,
          electricityKWh,
          heatKWh: cascade.purchasedHeatKWh,
          heatCoveredKWh: cascade.heatCoveredKWh,
          heatResidualKWh: cascade.heatResidualKWh,
          solarKWp,
          yieldPerKWp,
          airKg: 0,
          consumablesKg: 0,
          _scaleBasis: brineKg,
        };
      };
      const uncapped = yieldPerScale > 0 ? rate : 0;
      return applyCapScale(raw(uncapped), raw, caps, [
        ['ammonia', 'ammonia'],
        ['minerals', 'brineKg'],
        ['solarKWp', 'solarKWp'],
      ]);
    },
    apply: (current, duties) => {
      applyAbundanceScale(current, baseline, duties.scale, 'full');
      applyPowerAndSite(current, duties);
      current.operation.boundaryLimitedBy = duties.capped ? ['sizing cap'] : [];
    },
    measure: (solved, current, duties) => {
      const achieved = sinkMassKg(solved, chain.sink);
      if (duties.scale > 0 && achieved > 0) yieldPerScale = achieved / duties.scale;
      const gaps = [
        relativeGap(activity(solved, chain.ammonia), duties.ammonia),
        relativeGap(achieved, duties.ammonia),
      ];
      const consistency = Math.max(...gaps);
      return {
        achieved,
        consistency,
        residual: Math.max(relativeGap(achieved, target), consistency),
        historyDuties: historyDuties(duties, solved, current, {
          achieved,
          achievedAmmonia: activity(solved, chain.ammonia),
          scale: duties.scale,
          achievedElectricityKWh: electricityConsumed(solved),
          ...heatMeasureExtras(solved, duties),
        }),
      };
    },
  });
}

function sizeAmmonia(definition, target, opts) {
  if (converter(definition, 'brine-minerals')) return sizeCoupledAmmonia(definition, target, opts);
  return sizeDedicatedAmmonia(definition, target, opts);
}

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
  let otherKWh = Math.max(0, suppliedKWh - currentBrineKg * sec);
  let yieldPerKg = yield0;

  return iterateSize({
    definition,
    target,
    caps: opts.caps || {},
    maxIterations: opts.maxIterations,
    tolerance: opts.tolerance,
    product,
    estimate: (current, rate, _state, caps) => {
      const yieldPerKWp = dailyPvKWhPerKWp(current);
      const raw = kg => {
        const brineKg = Math.max(0, kg);
        const processElectricityKWh = brineKg * sec + otherKWh;
        const sinks = processHeatSinks(current);
        const cascade = dutyHeat({
          definition: current,
          sources: [],
          sinks,
          parked: [],
          heatCredit: opts.heatCredit,
        });
        const electricityKWh = processElectricityKWh + cascade.heatResidualKWh;
        const solarKWp = yieldPerKWp > 0 ? electricityKWh / yieldPerKWp : 0;
        return {
          brineKg,
          seawaterKg: brineKg,
          processElectricityKWh,
          electricityKWh,
          heatKWh: cascade.purchasedHeatKWh,
          heatCoveredKWh: cascade.heatCoveredKWh,
          heatResidualKWh: cascade.heatResidualKWh,
          solarKWp,
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
      const uncappedBrine = yieldPerKg > 0 ? rate / yieldPerKg : 0;
      return applyCapScale(raw(uncappedBrine), raw, caps, [
        ['minerals', 'brineKg'],
        ['solarKWp', 'solarKWp'],
      ]);
    },
    apply: applyMineralDuties,
    measure: (solved, current, duties) => {
      const achieved = sinkMassKg(solved, sink);
      const brineActivity = activity(solved, minerals);
      if (duties.brineKg > 0 && achieved > 0) yieldPerKg = achieved / duties.brineKg;
      const consumedKWh = electricityConsumed(solved);
      otherKWh = Math.max(0, consumedKWh - brineActivity * sec);
      const gaps = [
        relativeGap(brineActivity, duties.brineKg),
        relativeGap(consumedKWh, duties.electricityKWh),
      ];
      const consistency = Math.max(...gaps);
      return {
        achieved,
        consistency,
        residual: Math.max(relativeGap(achieved, target), consistency),
        historyDuties: historyDuties(duties, solved, current, {
          achieved,
          achievedBrine: activity(solved, minerals),
          achievedElectricityKWh: electricityConsumed(solved),
          ...heatMeasureExtras(solved, duties),
        }),
      };
    },
  });
}

function normalizeProduct(product) {
  const key = String(product ?? '').trim().toLowerCase();
  const normalized = PRODUCT_ALIASES[key];
  if (!normalized) throw new Error('Unknown product. Use CH4, H2, methanol, ammonia, lithium, or salt');
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
  return sizeMinerals(definition, product, rate, loopOpts);
}

function sizeToTarget(caseOrBuilder, target, opts = {}) {
  if (!Number.isFinite(target) || target < 0) {
    throw new Error('Methane target must be a non-negative finite kg/day');
  }
  return sizeToProduct({
    product: 'CH4',
    rate: target,
    caseOrBuilder,
    caps: opts.caps,
    maxIterations: opts.maxIterations,
    tolerance: opts.tolerance,
    heatCredit: opts.heatCredit,
  });
}

function sizeCoastalToMethane(target, month = 0, opts = {}) {
  const coastal = typeof require === 'function' ? require('../cases/coastal') : globalThis.CoastalCase;
  if (!coastal?.createCoastalCase) throw new Error('Coastal case is not loaded');
  return sizeToTarget(() => coastal.createCoastalCase(month), target, opts);
}


const { evaluateEconomics, scorePositiveCashflow } = economics || {};
const ABUNDANCE_SCALES = [0.25, 0.5, 1, 1.5, 2];
const FUEL_RATES = [0, 2, 5, 10, 15, 20];
const ABUNDANCE_DOWNSTREAM = Object.freeze(['chlor-alkali', 'bromine-recovery', 'asu', 'ammonia']);

function operatingRevenue(candidate) {
  const fromObjective = Number(candidate?.objective?.annualRevenue);
  if (Number.isFinite(fromObjective) && fromObjective > 0) return fromObjective;
  const products = candidate?.objective?.products || candidate?.products || [];
  let revenue = 0;
  for (const product of products) revenue += Number(product.annualRevenue) || 0;
  if (revenue > 0) return revenue;
  return Number(candidate?.economics?.annualRevenue) || 0;
}

function betterCashflowCandidate(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (left.objective.met !== right.objective.met) return left.objective.met ? left : right;
  if (left.objective.met) {
    if (left.objective.positiveSaleCount !== right.objective.positiveSaleCount) {
      return left.objective.positiveSaleCount > right.objective.positiveSaleCount ? left : right;
    }
    return left.objective.annualNetCash >= right.objective.annualNetCash ? left : right;
  }
  const revLeft = operatingRevenue(left);
  const revRight = operatingRevenue(right);
  if ((revLeft > 0) !== (revRight > 0)) return revLeft > 0 ? left : right;
  if (revLeft !== revRight) return revLeft > revRight ? left : right;
  if (left.objective.positiveSaleCount !== right.objective.positiveSaleCount) {
    return left.objective.positiveSaleCount > right.objective.positiveSaleCount ? left : right;
  }
  return left.objective.annualNetCash >= right.objective.annualNetCash ? left : right;
}

function scaleMaterialStream(stream, ratio) {
  if (!stream || stream.kind !== 'material' || !stream.mol) return;
  for (const key of Object.keys(stream.mol)) stream.mol[key] *= ratio;
}

function removeGraphNodes(definition, ids) {
  const drop = new Set(ids.filter(Boolean));
  if (!drop.size) return;
  definition.graph.nodes = definition.graph.nodes.filter(node => !drop.has(node.id));
  definition.graph.edges = definition.graph.edges.filter(edge => !drop.has(edge.from.node) && !drop.has(edge.to.node));
  for (const id of drop) delete definition.operation.setpoints[id];
  const priorities = definition.operation.priorities || {};
  for (const [bus, order] of Object.entries(priorities)) {
    priorities[bus] = (order || []).filter(id => !drop.has(id));
  }
}

function baselineAbundanceDuties(definition) {
  const minerals = converter(definition, 'brine-minerals');
  const brine = brineSource(definition, minerals);
  if (!minerals || !brine?.params?.stream) throw new Error('sizeForPositiveCashflow needs brine-minerals and a brine source');
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

function applyAbundanceScale(definition, baseline, scale, slateMode) {
  const ratio = scale;
  const minerals = converter(definition, 'brine-minerals');
  const brine = brineSource(definition, minerals);
  const brineKg = baseline.brineKg * ratio;
  brine.params.stream = JSON.parse(JSON.stringify(baseline.streams[brine.id] || brine.params.stream));
  scaleMaterialStream(brine.params.stream, ratio);
  minerals.capacity = brineKg;
  definition.operation.setpoints[minerals.id] = brineKg;

  for (const id of ABUNDANCE_DOWNSTREAM) {
    const node = nodeBy(definition, item => item.id === id);
    if (!node) continue;
    const base = Number(baseline.setpoints[id] || 0);
    node.capacity = base * ratio;
    definition.operation.setpoints[id] = base * ratio;
  }

  for (const id of ['salt-feed', 'water', 'air', 'power']) {
    const node = nodeBy(definition, item => item.id === id);
    if (!node?.params?.stream || !baseline.streams[id]) continue;
    node.params.stream = JSON.parse(JSON.stringify(baseline.streams[id]));
    if (node.params.stream.kind === 'electricity') node.params.stream.kWh *= ratio;
    else scaleMaterialStream(node.params.stream, ratio);
  }

  if (slateMode === 'minerals-only') {
    minerals.params = { ...(minerals.params || {}), bromideRecovery: 0 };
    for (const id of ABUNDANCE_DOWNSTREAM) {
      const node = nodeBy(definition, item => item.id === id);
      if (!node) continue;
      node.capacity = 0;
      definition.operation.setpoints[id] = 0;
    }
    for (const id of ['salt-feed', 'water', 'air']) {
      const node = nodeBy(definition, item => item.id === id);
      if (!node?.params?.stream?.mol) continue;
      for (const key of Object.keys(node.params.stream.mol)) node.params.stream.mol[key] = 0;
    }
    const power = electricityNode(definition);
    if (power?.params?.stream) {
      power.params.stream.kWh = brineKg * Number(minerals.params?.electricityKWhPerKgBrine ?? 0.05);
    }
  } else if (slateMode === 'minerals+halogens') {
    if (!nodeBy(definition, item => item.id === 'hydrogen-vent')) {
      definition.graph.nodes.push({ id: 'hydrogen-vent', unit: 'material-sink', economics: { disposition: 'vent' } });
    }
    const h2Edge = definition.graph.edges.find(edge => edge.from.node === 'chlor-alkali' && edge.from.port === 'hydrogen');
    if (h2Edge) h2Edge.to = { node: 'hydrogen-vent', port: 'in' };
    removeGraphNodes(definition, ['asu', 'ammonia', 'ammonia-product', 'oxygen', 'offgas', 'air']);
    const ca = Number(definition.operation.setpoints['chlor-alkali'] || 0);
    const br = Number(definition.operation.setpoints['bromine-recovery'] || 0);
    const power = electricityNode(definition);
    if (power?.params?.stream) {
      power.params.stream.kWh = brineKg * Number(minerals.params?.electricityKWhPerKgBrine ?? 0.05) + ca * 2.5 + br * 0.2;
    }
  }

  syncSiteResource(definition, brine);
  const power = electricityNode(definition);
  if (power) syncSiteResource(definition, power);
  definition.operation.boundaryLimitedBy = [];
}

function scoreSizedCandidate(definition, solved, selected, warnings = []) {
  if (!evaluateEconomics || !scorePositiveCashflow) {
    throw new Error('sizeForPositiveCashflow needs FlowsheetEconomics');
  }
  const economicsResult = evaluateEconomics(definition, solved);
  const objective = scorePositiveCashflow(economicsResult);
  return {
    mode: 'positive-cashflow',
    definition,
    solved,
    economics: economicsResult,
    objective,
    products: objective.products,
    selected,
    warnings: [...warnings, ...(solved.warnings || [])],
    residual: solved.balances?.maxAbsResidual ?? 0,
    converged: (solved.balances?.maxAbsResidual ?? 0) < 1e-6,
    iterations: 1,
    heatCoveredKWh: solved.heatIntegration?.coveredKWh ?? 0,
    heatResidualKWh: solved.heatIntegration?.residualDemandKWh ?? 0,
  };
}

function fuelProductsOn(definition) {
  const products = [];
  if (converter(definition, 'sabatier') || productSink(definition, 'CH4') || nodeBy(definition, node => node.id === 'methane')) {
    products.push('CH4');
  }
  if (converter(definition, 'electrolyzer')) products.push('H2');
  if (converter(definition, 'methanol')) products.push('methanol');
  if (converter(definition, 'ammonia')) products.push('ammonia');
  return products;
}

function jointFuelProducts(definition) {
  return fuelProductsOn(definition).filter(product => {
    if (product === 'ammonia' && converter(definition, 'brine-minerals')) return false;
    return true;
  });
}

function searchAbundanceCashflow(seed, opts) {
  const baselineDef = resolveDefinition(seed);
  const baseline = baselineAbundanceDuties(baselineDef);
  const modes = [];
  if (converter(baselineDef, 'brine-minerals')) modes.push('minerals-only');
  if (nodeBy(baselineDef, node => node.id === 'chlor-alkali') && nodeBy(baselineDef, node => node.id === 'bromine-recovery')) {
    modes.push('minerals+halogens');
  }
  modes.push('full');
  const scales = (opts.scales && opts.scales.length) ? opts.scales : ABUNDANCE_SCALES;
  let best = null;
  let tried = 0;
  for (const slateMode of modes) {
    for (const scale of scales) {
      const definition = resolveDefinition(seed);
      try {
        if (definition.site?.rights?.brineConcession && !rightIsAuthorized(definition.site.rights.brineConcession)) {
          assertSizeMayAssume(definition, ['brine']);
        }
        applyAbundanceScale(definition, baseline, scale, slateMode);
        withholdUnauthorizedSupply(definition);
        const solved = solveOperation(definition);
        const candidate = scoreSizedCandidate(definition, solved, { family: 'abundance', slateMode, scale }, []);
        tried += 1;
        best = betterCashflowCandidate(best, candidate);
      } catch (error) {
        tried += 1;
        if (!best) {
          best = {
            mode: 'positive-cashflow',
            error: error.message,
            objective: { met: false, positiveSaleCount: 0, annualNetCash: -Infinity, formula: 'max |{sale sinks with R_i>0}| s.t. annualNetCash>0; ties -> max annualNetCash. Gate cash = R − OPEX − annualized CAPEX (CRF).' },
            selected: { family: 'abundance', slateMode, scale },
            warnings: [error.message],
          };
        }
      }
    }
  }
  if (!best || !best.definition) throw new Error(best?.error || 'sizeForPositiveCashflow found no feasible abundance slate');
  best.candidatesTried = tried;
  if (!best.objective.met) {
    best.warnings = [...(best.warnings || []), 'No cash-positive co-product slate under searched modes/scales'];
  }
  return best;
}

function searchFuelCashflow(seed, opts) {
  const rates = (opts.rates && opts.rates.length) ? opts.rates : FUEL_RATES;
  const probe = resolveDefinition(seed);
  const products = fuelProductsOn(probe);
  if (!products.length) throw new Error('sizeForPositiveCashflow needs Sabatier/CH4, electrolyzer/H2, methanol, or ammonia sale paths');
  let best = null;
  let tried = 0;
  for (const product of products) {
    for (const rate of rates) {
      try {
        const sized = sizeToProduct({
          product,
          rate,
          caseOrBuilder: seed,
          caps: opts.caps,
          maxIterations: opts.maxIterations,
          tolerance: opts.tolerance,
          heatCredit: opts.heatCredit,
        });
        const candidate = scoreSizedCandidate(
          sized.definition,
          sized.solved,
          { family: 'fuel', product, rate },
          sized.warnings || []
        );
        candidate.iterations = sized.iterations;
        candidate.history = sized.history;
        candidate.residual = sized.residual;
        candidate.converged = sized.converged;
        candidate.heatCoveredKWh = sized.heatCoveredKWh;
        candidate.heatResidualKWh = sized.heatResidualKWh;
        tried += 1;
        best = betterCashflowCandidate(best, candidate);
      } catch (error) {
        tried += 1;
      }
    }
  }
  if (!best) throw new Error('sizeForPositiveCashflow found no feasible fuel sizing candidate');
  best.candidatesTried = tried;
  if (!best.objective.met) {
    best.warnings = [...(best.warnings || []), 'No cash-positive fuel slate under searched rates; returning best annualNetCash'];
  }
  return best;
}

function searchJointCashflow(seed, opts) {
  const products = jointFuelProducts(resolveDefinition(seed));
  if (!products.length) return null;
  const baselineDef = resolveDefinition(seed);
  if (!converter(baselineDef, 'brine-minerals')) return null;
  const baseline = baselineAbundanceDuties(baselineDef);
  const scales = (opts.scales && opts.scales.length) ? opts.scales : ABUNDANCE_SCALES;
  const rates = (opts.rates && opts.rates.length) ? opts.rates : FUEL_RATES;
  let best = null;
  let tried = 0;
  for (const scale of scales) {
    for (const product of products) {
      for (const rate of rates) {
        try {
          const scaled = resolveDefinition(seed);
          applyAbundanceScale(scaled, baseline, scale, 'full');
          const sized = sizeToProduct({
            product,
            rate,
            definition: scaled,
            caps: opts.caps,
            maxIterations: opts.maxIterations,
            tolerance: opts.tolerance,
            heatCredit: opts.heatCredit,
          });
          const candidate = scoreSizedCandidate(
            sized.definition,
            sized.solved,
            { family: 'joint', slateMode: 'full', scale, product, rate },
            sized.warnings || []
          );
          candidate.iterations = sized.iterations;
          candidate.history = sized.history;
          candidate.residual = sized.residual;
          candidate.converged = sized.converged;
          candidate.heatCoveredKWh = sized.heatCoveredKWh;
          candidate.heatResidualKWh = sized.heatResidualKWh;
          tried += 1;
          best = betterCashflowCandidate(best, candidate);
        } catch (error) {
          tried += 1;
        }
      }
    }
  }
  if (!best) {
    return { candidatesTried: tried, objective: { met: false, positiveSaleCount: 0, annualNetCash: -Infinity } };
  }
  best.candidatesTried = tried;
  return best;
}

function sizeForPositiveCashflow(opts = {}) {
  const caseOrBuilder = opts.definition ?? opts.caseOrBuilder;
  if (!caseOrBuilder) throw new Error('sizeForPositiveCashflow needs a case definition or builder');
  const probe = resolveDefinition(caseOrBuilder);
  const hasAbundance = Boolean(converter(probe, 'brine-minerals'));
  const fuels = fuelProductsOn(probe);
  if (!hasAbundance && !fuels.length) {
    throw new Error('sizeForPositiveCashflow supports abundance (brine minerals) or fuel (CH4/H2/methanol/ammonia) plants');
  }

  let best = null;
  let tried = 0;
  const familiesSearched = [];
  const take = (result, family) => {
    if (!result) return;
    tried += Number(result.candidatesTried) || 0;
    if (family) familiesSearched.push(family);
    if (result.definition || result.objective) best = betterCashflowCandidate(best, result);
  };
  const tryFamily = (family, search) => {
    try {
      take(search(), family);
    } catch (error) {
      familiesSearched.push(family);
      tried += 1;
      if (!best) {
        best = {
          mode: 'positive-cashflow',
          error: error.message,
          objective: { met: false, positiveSaleCount: 0, annualNetCash: -Infinity, formula: 'max |{sale sinks with R_i>0}| s.t. annualNetCash>0; ties -> max annualNetCash. Gate cash = R − OPEX − annualized CAPEX (CRF).' },
          warnings: [error.message],
        };
      }
    }
  };

  if (hasAbundance) tryFamily('abundance', () => searchAbundanceCashflow(caseOrBuilder, opts));
  if (fuels.length) tryFamily('fuel', () => searchFuelCashflow(caseOrBuilder, opts));
  if (hasAbundance && jointFuelProducts(probe).length) {
    tryFamily('joint', () => searchJointCashflow(caseOrBuilder, opts));
  }

  if (!best || !best.definition) {
    throw new Error(best?.error || 'sizeForPositiveCashflow found no feasible co-product slate');
  }
  best.candidatesTried = tried;
  best.familiesSearched = familiesSearched;
  if (!best.objective.met) {
    const note = 'No cash-positive co-product slate under searched modes/scales';
    if (!(best.warnings || []).includes(note)) best.warnings = [...(best.warnings || []), note];
  }
  return best;
}

return { sizeToTarget, sizeCoastalToMethane, sizeToProduct, sizeForPositiveCashflow };
});
