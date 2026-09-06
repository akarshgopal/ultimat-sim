(function exposeSize(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./model') : root.FlowsheetModel,
    typeof require === 'function' ? require('./solve') : root.FlowsheetSolver,
    typeof require === 'function' ? require('./footprint') : root.FlowsheetFootprint
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetSize = api;
})(globalThis, (model, solver, footprint) => {
const { SUBSTANCES, cloneStream, scaleStream, streamMassKg } = model;
const { solveOperation } = solver;

// Outer plant-sizing loop. Installed capacity stays fixed inside solveOperation;
// this module is the separate design calculation that chooses those capacities.
//
// demand (CH4 kg/day)
//   -> Sabatier stoich (H2, CO2, electrolysis water, desal feed)
//   -> electricity and heat duties
//   -> solarKWp from site.dailyPVKWhPerKWp (else typical-day hourly sum)
//   -> source budgets (air, seawater, heat, consumables, PV kWh)
//   -> solveOperation
//   -> recycle-water credit and solved H2 / DAC / SWRO / power duties
//   -> repeat until the operating residual is within tolerance
//
// Prices, CAPEX, OPEX, NPV, and IRR never enter the loop. Land hectares are
// recorded from engine/footprint.js as a physical consequence of the sized
// array and pads. Solar installedCapex/fixedOM on the electricity source are
// scaled with kWp only so the definition stays consistent after sizing; they
// are not an objective or a convergence signal.

const H2_PER_KG_CH4 = 4 * SUBSTANCES.H2.molarMassG / SUBSTANCES.CH4.molarMassG;
const CO2_PER_KG_CH4 = SUBSTANCES.CO2.molarMassG / SUBSTANCES.CH4.molarMassG;
const WATER_KG_PER_KG_H2 = SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;
const WATER_KG_PER_KG_CH4 = H2_PER_KG_CH4 * WATER_KG_PER_KG_H2;
const RECOVERED_WATER_PER_KG_CH4 = 2 * SUBSTANCES.H2O.molarMassG / SUBSTANCES.CH4.molarMassG;
const DEFAULT_MAX_ITERATIONS = 20;
const DEFAULT_TOLERANCE = 1e-8;

function cloneDefinition(definition) {
  return JSON.parse(JSON.stringify(definition));
}

function resolveDefinition(caseOrBuilder) {
  const definition = typeof caseOrBuilder === 'function' ? caseOrBuilder() : caseOrBuilder;
  if (!definition?.graph?.nodes) throw new Error('sizeToTarget needs a case definition or builder');
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

function chainParams(definition) {
  const sabatier = converter(definition, 'sabatier');
  const electrolyzer = converter(definition, 'electrolyzer');
  const dac = converter(definition, 'dac');
  const desal = converter(definition, 'desal');
  if (!sabatier) throw new Error('sizeToTarget needs a Sabatier block to size methane demand');
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
    captureFraction: Number(dac?.params?.captureFraction ?? 0.9),
    consumablesPerKgCO2: Number(dac?.params?.consumablesPerKgCO2 ?? 0),
    recycle: hasWaterRecycle(definition, sabatier),
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

function estimateDuties(definition, methaneKg, recoveredPerKg, caps) {
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
    const electricityKWh = h2 * chain.secH2 + co2 * chain.secDac + swro * chain.secDesal + methane * chain.secCh4;
    const heatKWh = co2 * chain.heatDac + swro * chain.heatDesal;
    const solarKWp = yieldPerKWp > 0 ? electricityKWh / yieldPerKWp : 0;
    return {
      ch4: methane,
      h2,
      co2,
      makeupWaterKg,
      swro,
      seawaterKg,
      electricityKWh,
      heatKWh,
      solarKWp,
      airKg: airKgForCo2(definition, co2, chain.captureFraction),
      consumablesKg: co2 * chain.consumablesPerKgCO2,
      yieldPerKWp,
    };
  };

  let duties = raw(methaneKg);
  const scales = [1];
  const pushScale = (cap, duty) => {
    if (cap != null && Number.isFinite(cap) && duty > 0) scales.push(Math.max(0, cap) / duty);
  };
  pushScale(caps.sabatier, duties.ch4);
  pushScale(caps.electrolyzer, duties.h2);
  pushScale(caps.dac, duties.co2);
  pushScale(caps.swro, duties.swro);
  pushScale(caps.solarKWp, duties.solarKWp);
  const scale = Math.min(...scales);
  const capped = scale < 1 - 1e-12;
  if (capped) duties = raw(duties.ch4 * scale);
  if (caps.solarKWp != null) duties.solarKWp = Math.min(duties.solarKWp, Math.max(0, caps.solarKWp));
  if (caps.swro != null) duties.swro = Math.min(duties.swro, Math.max(0, caps.swro));
  if (caps.electrolyzer != null) duties.h2 = Math.min(duties.h2, Math.max(0, caps.electrolyzer));
  if (caps.dac != null) duties.co2 = Math.min(duties.co2, Math.max(0, caps.dac));
  if (caps.sabatier != null) duties.ch4 = Math.min(duties.ch4, Math.max(0, caps.sabatier));
  duties.capped = capped;
  return duties;
}

function setMaterial(node, targetKg) {
  if (!node?.params?.stream || node.params.stream.kind !== 'material') return;
  const current = streamMassKg(node.params.stream);
  if (!(current > 0)) return;
  node.params.stream = scaleStream(node.params.stream, Math.max(0, targetKg) / current);
}

function setElectricity(node, kWh) {
  if (!node?.params?.stream) return;
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
  const electricity = nodeBy(definition, node => node.id === 'electricity')
    || nodeBy(definition, node => node.unit === 'electricity-source' || node.siteResource === 'electricity');
  const heat = nodeBy(definition, node => node.id === 'heat') || nodeBy(definition, node => node.siteResource === 'heat');
  const consumables = nodeBy(definition, node => node.id === 'consumables')
    || nodeBy(definition, node => node.unit === 'consumable-source');

  if (duties.airKg > 0) setMaterial(air, duties.airKg);
  if (duties.seawaterKg > 0) setMaterial(seawater, duties.seawaterKg);
  if (duties.heatKWh > 0) setHeat(heat, duties.heatKWh);
  if (duties.consumablesKg > 0) setConsumable(consumables, duties.consumablesKg);

  const previousKWp = Number(definition.site?.solarKWp) || 0;
  const electricityKWh = duties.yieldPerKWp > 0 ? duties.solarKWp * duties.yieldPerKWp : duties.electricityKWh;
  setElectricity(electricity, electricityKWh);
  scaleSolarEconomics(electricity, previousKWp, duties.solarKWp);

  if (definition.site) {
    definition.site.solarKWp = duties.solarKWp;
    if (duties.yieldPerKWp > 0) definition.site.dailyPVKWhPerKWp = duties.yieldPerKWp;
    if (definition.site.resources?.electricity) {
      definition.site.resources.electricity.stream = { kind: 'electricity', kWh: electricityKWh };
      definition.site.resources.electricity.evidence = `PVGIS typical-day × ${duties.solarKWp} kWp`;
    }
    if (definition.site.meteo && duties.yieldPerKWp > 0) {
      definition.site.meteo.dailyPVKWhPerKWp = duties.yieldPerKWp;
    }
  }
  for (const node of [air, seawater, electricity, heat, consumables]) syncSiteResource(definition, node);

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

function recoveredWaterKg(solved, sabatier) {
  const water = solved.nodes[sabatier.id]?.outlets?.water;
  return water ? streamMassKg(water) : 0;
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

function historyDuties(duties, solved, definition, chain) {
  return {
    ch4: duties.ch4,
    h2: duties.h2,
    co2: duties.co2,
    waterKg: duties.makeupWaterKg,
    swro: duties.swro,
    seawaterKg: duties.seawaterKg,
    electricityKWh: duties.electricityKWh,
    heatKWh: duties.heatKWh,
    solarKWp: duties.solarKWp,
    airKg: duties.airKg,
    consumablesKg: duties.consumablesKg,
    landHa: landHaFor(definition, solved),
    achieved: activity(solved, chain.sabatier),
    achievedH2: activity(solved, chain.electrolyzer),
    achievedCo2: activity(solved, chain.dac),
    achievedSwro: activity(solved, chain.desal),
    achievedElectricityKWh: electricityConsumed(solved),
  };
}

function sizeToTarget(caseOrBuilder, target, opts = {}) {
  if (!Number.isFinite(target) || target < 0) {
    throw new Error('Methane target must be a non-negative finite kg/day');
  }
  const maxIterations = Math.max(1, Number(opts.maxIterations) || DEFAULT_MAX_ITERATIONS);
  const tolerance = Number(opts.tolerance) > 0 ? Number(opts.tolerance) : DEFAULT_TOLERANCE;
  const caps = opts.caps || {};
  const definition = resolveDefinition(caseOrBuilder);
  const chain = chainParams(definition);
  const history = [];
  let recoveredPerKg = chain.recycle ? chain.recoveredWaterPerKg : 0;
  let residual = Infinity;
  let consistency = Infinity;
  let solved = null;
  let duties = null;
  let iterations = 0;

  for (; iterations < maxIterations; iterations += 1) {
    duties = estimateDuties(definition, target, recoveredPerKg, caps);
    applyDuties(definition, duties);
    solved = solveOperation(definition);
    const achieved = activity(solved, chain.sabatier);
    if (chain.recycle && achieved > 0) {
      recoveredPerKg = recoveredWaterKg(solved, chain.sabatier) / achieved;
    } else if (chain.recycle) {
      recoveredPerKg = chain.recoveredWaterPerKg;
    }
    const gaps = [relativeGap(achieved, duties.ch4), relativeGap(electricityConsumed(solved), duties.electricityKWh)];
    if (chain.electrolyzer) gaps.push(relativeGap(activity(solved, chain.electrolyzer), duties.h2));
    if (chain.dac) gaps.push(relativeGap(activity(solved, chain.dac), duties.co2));
    if (chain.desal) gaps.push(relativeGap(activity(solved, chain.desal), duties.swro));
    if (chain.recycle) {
      const recovered = recoveredWaterKg(solved, chain.sabatier);
      gaps.push(relativeGap(duties.makeupWaterKg, Math.max(0, duties.ch4 * chain.waterKgPerKg - recovered)));
    }
    consistency = Math.max(...gaps);
    residual = Math.max(relativeGap(achieved, target), consistency);
    history.push({
      iteration: iterations + 1,
      residual,
      consistency,
      capped: Boolean(duties.capped),
      duties: historyDuties(duties, solved, definition, chain),
    });
    if (consistency < tolerance && (residual < tolerance || duties.capped)) break;
  }

  const count = Math.min(iterations + 1, maxIterations);
  const warnings = [...(solved.warnings || [])];
  for (const warning of solver.unverifiedRightsWarnings?.(definition.site) || []) {
    if (!warnings.includes(warning)) warnings.push(warning);
  }
  return {
    definition,
    solved,
    target,
    achieved: activity(solved, chain.sabatier),
    iterations: count,
    residual,
    consistency,
    converged: consistency < tolerance && (relativeGap(activity(solved, chain.sabatier), target) < tolerance || Boolean(duties?.capped)),
    history,
    warnings,
  };
}

function sizeCoastalToMethane(target, month = 0, opts = {}) {
  const coastal = typeof require === 'function' ? require('../cases/coastal') : globalThis.CoastalCase;
  if (!coastal?.createCoastalCase) throw new Error('Coastal case is not loaded');
  return sizeToTarget(() => coastal.createCoastalCase(month), target, opts);
}

return { sizeToTarget, sizeCoastalToMethane };
});
