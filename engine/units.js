(function exposeUnits(root, factory) {
  const api = factory(typeof require === 'function' ? require('./model') : root.FlowsheetModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetUnits = api;
})(globalThis, model => {
const {
  cloneStream,
  nonnegative,
  scaleStream,
  streamMassKg,
  SUBSTANCES,
  validateStream,
} = model;

function reached(activity, requested) {
  return requested - activity <= Math.max(1, requested) * 1e-12;
}

function swro({ inlets, requestedActivity, capacity, params = {} }) {
  const feed = validateStream(inlets.feed, 'material');
  const electricity = validateStream(inlets.electricity, 'electricity');
  const requested = nonnegative(requestedActivity, 'requestedActivity');
  const installed = nonnegative(capacity, 'capacity');
  const recovery = Number(params.recovery ?? 0.45);
  const sec = nonnegative(Number(params.secKWhPerM3 ?? 3.5), 'secKWhPerM3');
  const density = nonnegative(Number(params.feedDensityKgM3 ?? 1025), 'feedDensityKgM3');
  const productDensity = nonnegative(Number(params.productDensityKgM3 ?? 1000), 'productDensityKgM3');
  const rejection = Number(params.ionRejection ?? 0.99);

  if (recovery <= 0 || recovery >= 1) throw new Error('recovery must be between 0 and 1');
  if (rejection < 0 || rejection > 1) throw new Error('ionRejection must be between 0 and 1');
  if (density === 0) throw new Error('feedDensityKgM3 must be greater than zero');
  if (productDensity === 0) throw new Error('productDensityKgM3 must be greater than zero');
  if (feed.phase !== 'liquid') throw new Error('SWRO feed must be liquid');
  if (!Object.hasOwn(feed.mol, 'H2O')) throw new Error('SWRO feed must contain H2O');

  const availableFeedM3 = streamMassKg(feed) / density;
  const planned = Math.min(requested, installed);
  const limits = {
    capacity: installed,
    feed: availableFeedM3 * recovery,
    electricity: sec === 0 ? Infinity : electricity.kWh / sec,
  };
  const activity = Math.min(planned, limits.feed, limits.electricity);
  const feedFraction = activity === 0 ? 0 : (activity / recovery) / availableFeedM3;
  const consumedFeed = scaleStream(feed, feedFraction);
  const productMol = Object.fromEntries(
    Object.entries(consumedFeed.mol)
      .filter(([substance]) => substance !== 'H2O')
      .map(([substance, amount]) => [substance, amount * recovery * (1 - rejection)])
  );
  const productSoluteKg = Object.entries(productMol).reduce(
    (sum, [substance, amount]) => sum + amount * SUBSTANCES[substance].molarMassG / 1000,
    0
  );
  const productWaterKg = activity * productDensity - productSoluteKg;
  if (productWaterKg < 0) throw new Error('SWRO product density is too low for the modeled solutes');
  productMol.H2O = productWaterKg * 1000 / SUBSTANCES.H2O.molarMassG;
  if (productMol.H2O > consumedFeed.mol.H2O) {
    throw new Error('SWRO feed does not contain enough water for the requested recovery');
  }
  const brineMol = Object.fromEntries(
    Object.entries(consumedFeed.mol).map(([substance, amount]) => [
      substance,
      amount - productMol[substance],
    ])
  );
  const limitingValue = Math.min(limits.capacity, limits.feed, limits.electricity);
  const limitedBy = reached(activity, requested)
    ? []
    : Object.entries(limits)
      .filter(([, value]) => Math.abs(value - limitingValue) <= Math.max(1, limitingValue) * 1e-12)
      .map(([name]) => name);

  return {
    activity,
    requestedInputs: {
      feed: scaleStream(feed, availableFeedM3 === 0 ? 0 : (planned / recovery) / availableFeedM3),
      electricity: { kind: 'electricity', kWh: planned * sec },
    },
    consumed: {
      feed: consumedFeed,
      electricity: { kind: 'electricity', kWh: activity * sec },
    },
    outlets: {
      product: { ...cloneStream(consumedFeed), mol: productMol },
      brine: { ...cloneStream(consumedFeed), mol: brineMol },
    },
    limitedBy,
  };
}

function thermalDesalination({ inlets, requestedActivity, capacity, params = {} }) {
  const feed = validateStream(inlets.feed, 'material');
  const electricity = validateStream(inlets.electricity, 'electricity');
  const heat = validateStream(inlets.heat, 'heat');
  const requested = nonnegative(requestedActivity, 'requestedActivity');
  const installed = nonnegative(capacity, 'capacity');
  const recovery = Number(params.recovery ?? 0.35);
  const electricitySEC = nonnegative(Number(params.electricityKWhPerM3 ?? 2), 'electricityKWhPerM3');
  const heatSEC = nonnegative(Number(params.heatKWhPerM3 ?? 60), 'heatKWhPerM3');
  const density = nonnegative(Number(params.feedDensityKgM3 ?? 1025), 'feedDensityKgM3');
  const minHeatT_C = Number(params.minHeatT_C ?? 70);
  if (recovery <= 0 || recovery >= 1) throw new Error('recovery must be between 0 and 1');
  if (!Number.isFinite(minHeatT_C)) throw new Error('minHeatT_C must be finite');

  const limits = {
    capacity: installed,
    feed: streamMassKg(feed) / density * recovery,
    electricity: electricitySEC === 0 ? Infinity : electricity.kWh / electricitySEC,
    heat: heatSEC === 0 ? Infinity : heat.kWh / heatSEC,
    heatTemperature: heatSEC === 0 || heat.T_C >= minHeatT_C ? Infinity : 0,
  };
  const planned = Math.min(requested, installed);
  const activity = Math.min(requested, ...Object.values(limits));
  const separationParams = {
    recovery,
    secKWhPerM3: electricitySEC,
    feedDensityKgM3: density,
    productDensityKgM3: params.productDensityKgM3 ?? 1000,
    ionRejection: params.ionRejection ?? 0.995,
  };
  const actual = swro({ inlets: { feed, electricity }, requestedActivity: activity, capacity: installed, params: separationParams });
  const requestedFlow = swro({ inlets: { feed, electricity }, requestedActivity: requested, capacity: installed, params: separationParams });
  const limitingValue = Math.min(...Object.values(limits));
  const limitedBy = reached(activity, requested) ? [] : Object.entries(limits)
    .filter(([, value]) => Math.abs(value - limitingValue) <= Math.max(1, limitingValue) * 1e-12)
    .map(([name]) => name);

  return {
    ...actual,
    activity,
    requestedInputs: {
      feed: requestedFlow.requestedInputs.feed,
      electricity: { kind: 'electricity', kWh: planned * electricitySEC },
      heat: { kind: 'heat', kWh: planned * heatSEC, T_C: heat.T_C },
    },
    consumed: {
      ...actual.consumed,
      electricity: { kind: 'electricity', kWh: activity * electricitySEC },
      heat: { kind: 'heat', kWh: activity * heatSEC, T_C: heat.T_C },
    },
    outlets: {
      ...actual.outlets,
      wasteHeat: { kind: 'heat', kWh: activity * heatSEC, T_C: Number(params.wasteHeatT_C ?? 40) },
    },
    limitedBy,
  };
}

function electrolyzer({ inlets, requestedActivity, capacity, params = {} }) {
  const water = validateStream(inlets.water, 'material');
  const electricity = validateStream(inlets.electricity, 'electricity');
  const requested = nonnegative(requestedActivity, 'requestedActivity');
  const installed = nonnegative(capacity, 'capacity');
  const sec = nonnegative(Number(params.secKWhPerKgH2 ?? 50), 'secKWhPerKgH2');
  const waterKgPerKgH2 = SUBSTANCES.H2O.molarMassG / SUBSTANCES.H2.molarMassG;

  if (water.phase !== 'liquid') throw new Error('Electrolyzer water must be liquid');
  if (!Object.hasOwn(water.mol, 'H2O')) throw new Error('Electrolyzer water stream must contain H2O');

  const availableWaterKg = water.mol.H2O * SUBSTANCES.H2O.molarMassG / 1000;
  const planned = Math.min(requested, installed);
  const limits = {
    capacity: installed,
    water: availableWaterKg / waterKgPerKgH2,
    electricity: sec === 0 ? Infinity : electricity.kWh / sec,
  };
  const activity = Math.min(planned, limits.water, limits.electricity);
  const h2Mol = activity * 1000 / SUBSTANCES.H2.molarMassG;
  const waterMol = h2Mol;
  const oxygenMol = h2Mol / 2;
  const rejectMol = {
    ...water.mol,
    H2O: water.mol.H2O - waterMol,
  };
  const limitingValue = Math.min(limits.capacity, limits.water, limits.electricity);
  const limitedBy = reached(activity, requested)
    ? []
    : Object.entries(limits)
      .filter(([, value]) => Math.abs(value - limitingValue) <= Math.max(1, limitingValue) * 1e-12)
      .map(([name]) => name);

  return {
    activity,
    requestedInputs: {
      water: { ...cloneStream(water), mol: { H2O: planned * waterKgPerKgH2 * 1000 / SUBSTANCES.H2O.molarMassG } },
      electricity: { kind: 'electricity', kWh: planned * sec },
    },
    consumed: {
      water: cloneStream(water),
      electricity: { kind: 'electricity', kWh: activity * sec },
    },
    outlets: {
      hydrogen: { kind: 'material', mol: { H2: h2Mol }, phase: 'gas', T_C: water.T_C, P_bar: water.P_bar },
      oxygen: { kind: 'material', mol: { O2: oxygenMol }, phase: 'gas', T_C: water.T_C, P_bar: water.P_bar },
      waterReject: { ...cloneStream(water), mol: rejectMol },
    },
    limitedBy,
  };
}

function dac({ inlets, requestedActivity, capacity, params = {} }) {
  const air = validateStream(inlets.air, 'material');
  const electricity = validateStream(inlets.electricity, 'electricity');
  const heat = validateStream(inlets.heat, 'heat');
  const consumables = validateStream(inlets.consumables, 'consumable');
  const requested = nonnegative(requestedActivity, 'requestedActivity');
  const installed = nonnegative(capacity, 'capacity');
  const captureFraction = Number(params.captureFraction ?? 0.9);
  const electricityKWhPerKgCO2 = nonnegative(
    Number(params.electricityKWhPerKgCO2 ?? 0.5),
    'electricityKWhPerKgCO2'
  );
  const heatKWhPerKgCO2 = nonnegative(
    Number(params.heatKWhPerKgCO2 ?? 1.5),
    'heatKWhPerKgCO2'
  );
  const minHeatT_C = Number(params.minHeatT_C ?? 80);
  const consumablesPerKgCO2 = nonnegative(Number(params.consumablesPerKgCO2 ?? 0.02), 'consumablesPerKgCO2');

  if (air.phase !== 'gas') throw new Error('DAC air feed must be gas');
  if (!Object.hasOwn(air.mol, 'CO2')) throw new Error('DAC air feed must contain CO2');
  if (!Number.isFinite(captureFraction) || captureFraction < 0 || captureFraction > 1) {
    throw new Error('captureFraction must be between 0 and 1');
  }
  if (!Number.isFinite(minHeatT_C)) throw new Error('minHeatT_C must be finite');

  const co2Kg = air.mol.CO2 * SUBSTANCES.CO2.molarMassG / 1000;
  const planned = Math.min(requested, installed);
  const limits = {
    capacity: installed,
    feed: co2Kg * captureFraction,
    electricity: electricityKWhPerKgCO2 === 0
      ? Infinity
      : electricity.kWh / electricityKWhPerKgCO2,
    heat: heatKWhPerKgCO2 === 0 ? Infinity : heat.kWh / heatKWhPerKgCO2,
    consumables: consumablesPerKgCO2 === 0 ? Infinity : consumables.amount / consumablesPerKgCO2,
    heatTemperature: heatKWhPerKgCO2 === 0 || heat.T_C >= minHeatT_C ? Infinity : 0,
  };
  const activity = Math.min(planned, ...Object.values(limits));
  const airFraction = captureFraction > 0 && co2Kg > 0
    ? activity / (co2Kg * captureFraction)
    : 0;
  const acceptedAir = scaleStream(air, airFraction);
  const capturedMol = activity * 1000 / SUBSTANCES.CO2.molarMassG;
  const depletedMol = {
    ...acceptedAir.mol,
    CO2: Math.max(0, acceptedAir.mol.CO2 - capturedMol),
  };
  const limitingValue = Math.min(...Object.values(limits));
  const limitedBy = reached(activity, requested)
    ? []
    : Object.entries(limits)
      .filter(([, value]) => Math.abs(value - limitingValue) <= Math.max(1, limitingValue) * 1e-12)
      .map(([name]) => name);

  return {
    activity,
    requestedInputs: {
      air: scaleStream(air, captureFraction > 0 && co2Kg > 0
        ? planned / (co2Kg * captureFraction)
        : 0),
      electricity: { kind: 'electricity', kWh: planned * electricityKWhPerKgCO2 },
      heat: { kind: 'heat', kWh: planned * heatKWhPerKgCO2, T_C: heat.T_C },
      consumables: { ...consumables, amount: planned * consumablesPerKgCO2 },
    },
    consumed: {
      air: acceptedAir,
      electricity: { kind: 'electricity', kWh: activity * electricityKWhPerKgCO2 },
      heat: { kind: 'heat', kWh: activity * heatKWhPerKgCO2, T_C: heat.T_C },
      consumables: { ...consumables, amount: activity * consumablesPerKgCO2 },
    },
    outlets: {
      capturedCo2: {
        kind: 'material',
        mol: { CO2: capturedMol },
        phase: 'gas',
        T_C: air.T_C,
        P_bar: air.P_bar,
      },
      depletedAir: { ...cloneStream(acceptedAir), mol: depletedMol },
      wasteHeat: {
        kind: 'heat',
        kWh: activity * heatKWhPerKgCO2,
        T_C: Number(params.wasteHeatT_C ?? 40),
      },
    },
    limitedBy,
  };
}

function sabatier({ inlets, requestedActivity, capacity, params = {} }) {
  const co2 = validateStream(inlets.co2, 'material');
  const hydrogen = validateStream(inlets.hydrogen, 'material');
  const electricity = validateStream(inlets.electricity, 'electricity');
  const requested = nonnegative(requestedActivity, 'requestedActivity');
  const installed = nonnegative(capacity, 'capacity');
  const electricityKWhPerKgCH4 = nonnegative(Number(
    params.electricityKWhPerKgCH4 ?? params.secKWhPerKgCH4 ?? 0
  ), 'electricityKWhPerKgCH4');

  if (co2.phase !== 'gas' || hydrogen.phase !== 'gas') {
    throw new Error('Sabatier feeds must be gas');
  }
  if (!Object.hasOwn(co2.mol, 'CO2')) throw new Error('Sabatier CO2 feed must contain CO2');
  if (!Object.hasOwn(hydrogen.mol, 'H2')) throw new Error('Sabatier hydrogen feed must contain H2');
  if (Object.entries(co2.mol).some(([substance, amount]) => substance !== 'CO2' && amount > 0)) {
    throw new Error('Sabatier CO2 feed must be pure CO2 in the once-through model');
  }
  if (Object.entries(hydrogen.mol).some(([substance, amount]) => substance !== 'H2' && amount > 0)) {
    throw new Error('Sabatier hydrogen feed must be pure H2 in the once-through model');
  }
  const co2Potential = co2.mol.CO2 * SUBSTANCES.CH4.molarMassG / 1000;
  const hydrogenPotential = hydrogen.mol.H2 / 4 * SUBSTANCES.CH4.molarMassG / 1000;
  const planned = Math.min(requested, installed);
  const limits = {
    capacity: installed,
    co2: co2Potential,
    hydrogen: hydrogenPotential,
    electricity: electricityKWhPerKgCH4 === 0
      ? Infinity
      : electricity.kWh / electricityKWhPerKgCH4,
  };
  const activity = Math.min(planned, ...Object.values(limits));
  const reactionMol = activity * 1000 / SUBSTANCES.CH4.molarMassG;
  const consumedCo2 = { ...cloneStream(co2), mol: { CO2: reactionMol } };
  const consumedHydrogen = { ...cloneStream(hydrogen), mol: { H2: reactionMol * 4 } };
  const outputT_C = co2.T_C;
  const outputP_bar = co2.P_bar;
  const limitingValue = Math.min(...Object.values(limits));
  const limitedBy = reached(activity, requested)
    ? []
    : installed <= Math.min(limits.co2, limits.hydrogen, limits.electricity)
      ? ['capacity']
      : Object.entries(limits)
        .filter(([name, value]) => name !== 'capacity'
          && Math.abs(value - limitingValue) <= Math.max(1, limitingValue) * 1e-12)
        .map(([name]) => name);

  return {
    activity,
    requestedInputs: {
      co2: scaleStream(co2, planned / (co2Potential || Infinity)),
      hydrogen: scaleStream(hydrogen, planned / (hydrogenPotential || Infinity)),
      electricity: { kind: 'electricity', kWh: planned * electricityKWhPerKgCH4 },
    },
    consumed: {
      co2: consumedCo2,
      hydrogen: consumedHydrogen,
      electricity: { kind: 'electricity', kWh: activity * electricityKWhPerKgCH4 },
    },
    outlets: {
      methane: {
        kind: 'material',
        mol: { CH4: activity * 1000 / SUBSTANCES.CH4.molarMassG },
        phase: 'gas',
        T_C: outputT_C,
        P_bar: outputP_bar,
      },
      water: {
        kind: 'material',
        mol: { H2O: reactionMol * 2 },
        phase: 'liquid',
        T_C: outputT_C,
        P_bar: outputP_bar,
      },
    },
    limitedBy,
  };
}

function reaction(specification) {
  return ({ inlets, requestedActivity, capacity, params = {} }) => {
    const requested = nonnegative(requestedActivity, 'requestedActivity');
    const installed = nonnegative(capacity, 'capacity');
    const electricitySEC = nonnegative(Number(params.electricityKWhPerKg ?? specification.electricityKWhPerKg), 'electricityKWhPerKg');
    const electricity = validateStream(inlets.electricity, 'electricity');
    const feeds = Object.fromEntries(Object.entries(specification.inputs).map(([port, input]) => {
      const stream = validateStream(inlets[port], 'material');
      if (!Object.hasOwn(stream.mol, input.substance)) throw new Error(`${port} must contain ${input.substance}`);
      if (Object.entries(stream.mol).some(([substance, mol]) => substance !== input.substance && mol > 1e-12)) throw new Error(`${port} must be pure ${input.substance}`);
      return [port, stream];
    }));
    const productMolPerKg = 1000 / SUBSTANCES[specification.product].molarMassG;
    const limits = { capacity: installed };
    for (const [port, input] of Object.entries(specification.inputs)) {
      limits[port] = feeds[port].mol[input.substance] / input.molPerProductMol / productMolPerKg;
    }
    limits.electricity = electricitySEC === 0 ? Infinity : electricity.kWh / electricitySEC;
    const planned = Math.min(requested, installed);
    const activity = Math.min(planned, ...Object.values(limits));
    const productMol = activity * productMolPerKg;
    const requestedMol = planned * productMolPerKg;
    const stream = (substance, mol, phase = 'solid') => ({
      kind: 'material', mol: { [substance]: mol }, phase,
      T_C: Object.values(feeds)[0].T_C, P_bar: Object.values(feeds)[0].P_bar,
    });
    const materialInputs = Object.fromEntries(Object.entries(specification.inputs).map(([port, input]) => [
      port, stream(input.substance, requestedMol * input.molPerProductMol, feeds[port].phase),
    ]));
    const consumed = Object.fromEntries(Object.entries(specification.inputs).map(([port, input]) => [
      port, stream(input.substance, productMol * input.molPerProductMol, feeds[port].phase),
    ]));
    const limitingValue = Math.min(...Object.values(limits));
    return {
      activity,
      requestedInputs: { ...materialInputs, electricity: { kind: 'electricity', kWh: planned * electricitySEC } },
      consumed: { ...consumed, electricity: { kind: 'electricity', kWh: activity * electricitySEC } },
      outlets: Object.fromEntries(Object.entries(specification.outputs).map(([port, output]) => [
        port, stream(output.substance, productMol * output.molPerProductMol, output.phase),
      ])),
      limitedBy: reached(activity, requested) ? [] : Object.entries(limits)
        .filter(([, value]) => Math.abs(value - limitingValue) <= Math.max(1, limitingValue) * 1e-12)
        .map(([name]) => name),
    };
  };
}

function airSeparation({ inlets, requestedActivity, capacity, params = {} }) {
  const air = validateStream(inlets.air, 'material');
  const electricity = validateStream(inlets.electricity, 'electricity');
  const requested = nonnegative(requestedActivity, 'requestedActivity');
  const installed = nonnegative(capacity, 'capacity');
  const nitrogenRecovery = Number(params.nitrogenRecovery ?? 0.98);
  const oxygenRecovery = Number(params.oxygenRecovery ?? 0.95);
  const sec = nonnegative(Number(params.electricityKWhPerKgN2 ?? 0.25), 'electricityKWhPerKgN2');
  if (air.phase !== 'gas' || !Object.hasOwn(air.mol, 'N2')) throw new Error('ASU air feed must contain gaseous N2');
  if (![nitrogenRecovery, oxygenRecovery].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('ASU recoveries must be between 0 and 1');
  const availableN2Kg = air.mol.N2 * SUBSTANCES.N2.molarMassG / 1000;
  const planned = Math.min(requested, installed);
  const limits = { capacity: installed, air: availableN2Kg * nitrogenRecovery, electricity: sec === 0 ? Infinity : electricity.kWh / sec };
  const activity = Math.min(planned, ...Object.values(limits));
  const accepted = scaleStream(air, availableN2Kg && nitrogenRecovery ? activity / (availableN2Kg * nitrogenRecovery) : 0);
  const nitrogenMol = activity * 1000 / SUBSTANCES.N2.molarMassG;
  const oxygenMol = (accepted.mol.O2 || 0) * oxygenRecovery;
  const offgasMol = { ...accepted.mol, N2: (accepted.mol.N2 || 0) - nitrogenMol, O2: (accepted.mol.O2 || 0) - oxygenMol };
  const limitingValue = Math.min(...Object.values(limits));
  return {
    activity,
    requestedInputs: {
      air: scaleStream(air, availableN2Kg && nitrogenRecovery ? planned / (availableN2Kg * nitrogenRecovery) : 0),
      electricity: { kind: 'electricity', kWh: planned * sec },
    },
    consumed: { air: accepted, electricity: { kind: 'electricity', kWh: activity * sec } },
    outlets: {
      nitrogen: { kind: 'material', mol: { N2: nitrogenMol }, phase: 'gas', T_C: air.T_C, P_bar: air.P_bar },
      oxygen: { kind: 'material', mol: { O2: oxygenMol }, phase: 'gas', T_C: air.T_C, P_bar: air.P_bar },
      offgas: { ...cloneStream(accepted), mol: offgasMol },
    },
    limitedBy: reached(activity, requested) ? [] : Object.entries(limits)
      .filter(([, value]) => Math.abs(value - limitingValue) <= Math.max(1, limitingValue) * 1e-12)
      .map(([name]) => name),
  };
}

function brineMinerals({ inlets, requestedActivity, capacity, params = {} }) {
  const feed = validateStream(inlets.brine, 'material');
  const electricity = validateStream(inlets.electricity, 'electricity');
  const requested = nonnegative(requestedActivity, 'requestedActivity');
  const installed = nonnegative(capacity, 'capacity');
  const sec = nonnegative(Number(params.electricityKWhPerKgBrine ?? 0.05), 'electricityKWhPerKgBrine');
  const feedKg = streamMassKg(feed);
  const planned = Math.min(requested, installed);
  const limits = { capacity: installed, brine: feedKg, electricity: sec === 0 ? Infinity : electricity.kWh / sec };
  const activity = Math.min(planned, ...Object.values(limits));
  const processed = scaleStream(feed, feedKg ? activity / feedKg : 0);
  const residual = { ...processed.mol };
  const recover = (product, cation, cationCount, anion, anionCount, recovery) => {
    const fraction = Number(recovery);
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error(`${product} recovery must be between 0 and 1`);
    const mol = Math.min((residual[cation] || 0) / cationCount, (residual[anion] || 0) / anionCount) * fraction;
    residual[cation] = (residual[cation] || 0) - mol * cationCount;
    residual[anion] = (residual[anion] || 0) - mol * anionCount;
    return { kind: 'material', mol: { [product]: mol }, phase: 'solid', T_C: feed.T_C, P_bar: feed.P_bar };
  };
  const lithium = recover('LiCl', 'Li+', 1, 'Cl-', 1, params.lithiumRecovery ?? 0.9);
  const bromide = recover('NaBr', 'Na+', 1, 'Br-', 1, params.bromideRecovery ?? 0.9);
  const magnesium = recover('MgCl2', 'Mg+2', 1, 'Cl-', 2, params.magnesiumRecovery ?? 0.5);
  const potash = recover('KCl', 'K+', 1, 'Cl-', 1, params.potashRecovery ?? 0.7);
  const gypsum = recover('CaSO4', 'Ca+2', 1, 'SO4-2', 1, params.gypsumRecovery ?? 0.7);
  const salt = recover('NaCl', 'Na+', 1, 'Cl-', 1, params.saltRecovery ?? 0.5);
  const limitingValue = Math.min(...Object.values(limits));
  return {
    activity,
    requestedInputs: { brine: scaleStream(feed, feedKg ? planned / feedKg : 0), electricity: { kind: 'electricity', kWh: planned * sec } },
    consumed: { brine: processed, electricity: { kind: 'electricity', kWh: activity * sec } },
    outlets: { lithium, bromide, magnesium, potash, gypsum, salt, raffinate: { ...cloneStream(processed), mol: residual } },
    limitedBy: reached(activity, requested) ? [] : Object.entries(limits)
      .filter(([, value]) => Math.abs(value - limitingValue) <= Math.max(1, limitingValue) * 1e-12)
      .map(([name]) => name),
  };
}

const ammonia = reaction({
  product: 'NH3', electricityKWhPerKg: 0.6,
  inputs: { nitrogen: { substance: 'N2', molPerProductMol: 0.5 }, hydrogen: { substance: 'H2', molPerProductMol: 1.5 } },
  outputs: { ammonia: { substance: 'NH3', molPerProductMol: 1, phase: 'liquid' } },
});
const chlorAlkali = reaction({
  product: 'NaOH', electricityKWhPerKg: 2.5,
  inputs: { salt: { substance: 'NaCl', molPerProductMol: 1 }, water: { substance: 'H2O', molPerProductMol: 1 } },
  outputs: {
    caustic: { substance: 'NaOH', molPerProductMol: 1, phase: 'liquid' },
    chlorine: { substance: 'Cl2', molPerProductMol: 0.5, phase: 'gas' },
    hydrogen: { substance: 'H2', molPerProductMol: 0.5, phase: 'gas' },
  },
});
const bromineRecovery = reaction({
  product: 'Br2', electricityKWhPerKg: 0.2,
  inputs: { bromide: { substance: 'NaBr', molPerProductMol: 2 }, chlorine: { substance: 'Cl2', molPerProductMol: 1 } },
  outputs: { bromine: { substance: 'Br2', molPerProductMol: 1, phase: 'liquid' }, salt: { substance: 'NaCl', molPerProductMol: 2, phase: 'solid' } },
});
const aluminiumSmelter = reaction({
  product: 'Al', electricityKWhPerKg: 14,
  inputs: { alumina: { substance: 'Al2O3', molPerProductMol: 0.5 }, carbon: { substance: 'C', molPerProductMol: 0.75 } },
  outputs: { aluminium: { substance: 'Al', molPerProductMol: 1, phase: 'solid' }, carbonDioxide: { substance: 'CO2', molPerProductMol: 0.75, phase: 'gas' } },
});
const hydrogenDri = reaction({
  product: 'Fe', electricityKWhPerKg: 0.7,
  inputs: { ironOre: { substance: 'Fe2O3', molPerProductMol: 0.5 }, hydrogen: { substance: 'H2', molPerProductMol: 1.5 } },
  outputs: { steel: { substance: 'Fe', molPerProductMol: 1, phase: 'solid' }, water: { substance: 'H2O', molPerProductMol: 1.5, phase: 'liquid' } },
});
const titaniumKroll = reaction({
  product: 'Ti', electricityKWhPerKg: 8,
  inputs: { titaniumTetrachloride: { substance: 'TiCl4', molPerProductMol: 1 }, magnesium: { substance: 'Mg', molPerProductMol: 2 } },
  outputs: { titanium: { substance: 'Ti', molPerProductMol: 1, phase: 'solid' }, magnesiumChloride: { substance: 'MgCl2', molPerProductMol: 2, phase: 'solid' } },
});

function energyStorage(kind) {
  return ({ inlets, requestedActivity, capacity, params = {} }) => {
    const input = validateStream(inlets.in, kind);
    const requested = nonnegative(requestedActivity, 'requestedActivity');
    const installed = nonnegative(capacity, 'capacity');
    const efficiency = Number(params.efficiency ?? 0.95);
    if (!Number.isFinite(efficiency) || efficiency <= 0 || efficiency > 1) {
      throw new Error('efficiency must be greater than 0 and at most 1');
    }
    const planned = Math.min(requested, installed);
    const activity = Math.min(planned, input.kWh * efficiency);
    const inputKWh = activity / efficiency;
    const limitedBy = reached(activity, requested) ? [] : [
      ...(installed <= input.kWh * efficiency ? ['capacity'] : []),
      ...(input.kWh * efficiency <= installed ? [kind] : []),
    ];
    const stream = kWh => kind === 'heat'
      ? { kind, kWh, T_C: Math.max(20, input.T_C - Number(params.temperatureLossC ?? 0)) }
      : { kind, kWh };
    return {
      activity,
      requestedInputs: { in: kind === 'heat' ? { kind, kWh: planned / efficiency, T_C: input.T_C } : stream(planned / efficiency) },
      consumed: { in: { ...cloneStream(input), kWh: inputKWh } },
      outlets: { out: stream(activity) },
      limitedBy,
    };
  };
}

const UNITS = Object.freeze({
  'material-source': {
    kind: 'source',
    ports: { out: { direction: 'out', kind: 'material', required: true } },
  },
  'electricity-source': {
    kind: 'source',
    ports: { out: { direction: 'out', kind: 'electricity', required: true } },
  },
  'solar-pv': {
    kind: 'source',
    ports: { out: { direction: 'out', kind: 'electricity', required: true } },
  },
  'grid-electricity': {
    kind: 'source',
    ports: { out: { direction: 'out', kind: 'electricity', required: true } },
  },
  'nuclear-electricity': {
    kind: 'source',
    ports: { out: { direction: 'out', kind: 'electricity', required: true } },
  },
  'heat-source': {
    kind: 'source',
    ports: { out: { direction: 'out', kind: 'heat', required: true } },
  },
  'solar-thermal': {
    kind: 'source',
    ports: { out: { direction: 'out', kind: 'heat', required: true } },
  },
  'consumable-source': {
    kind: 'source',
    ports: { out: { direction: 'out', kind: 'consumable', required: true } },
  },
  'electrical-bus': {
    kind: 'junction',
    ports: {
      in: { direction: 'in', kind: 'electricity', required: true },
      out: { direction: 'out', kind: 'electricity', required: true },
    },
  },
  'material-splitter': {
    kind: 'splitter',
    ports: {
      in: { direction: 'in', kind: 'material', required: true },
      out: { direction: 'out', kind: 'material', required: true },
    },
  },
  'material-mixer': {
    kind: 'mixer',
    ports: {
      in: { direction: 'in', kind: 'material', required: true },
      out: { direction: 'out', kind: 'material', required: true },
    },
  },
  'material-sink': {
    kind: 'sink',
    ports: { in: { direction: 'in', kind: 'material', required: true } },
  },
  'heat-sink': {
    kind: 'sink',
    ports: { in: { direction: 'in', kind: 'heat', required: true } },
  },
  'electricity-sink': {
    kind: 'sink',
    ports: { in: { direction: 'in', kind: 'electricity', required: true } },
  },
  battery: {
    kind: 'converter',
    ports: {
      in: { direction: 'in', kind: 'electricity', required: true },
      out: { direction: 'out', kind: 'electricity', required: true },
    },
    evaluate: energyStorage('electricity'),
  },
  'thermal-storage': {
    kind: 'converter',
    ports: {
      in: { direction: 'in', kind: 'heat', required: true },
      out: { direction: 'out', kind: 'heat', required: true },
    },
    evaluate: energyStorage('heat'),
  },
  swro: {
    kind: 'converter',
    ports: {
      feed: { direction: 'in', kind: 'material', required: true },
      electricity: { direction: 'in', kind: 'electricity', required: true },
      product: { direction: 'out', kind: 'material', required: true },
      brine: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: swro,
  },
  med: {
    kind: 'converter',
    ports: {
      feed: { direction: 'in', kind: 'material', required: true },
      electricity: { direction: 'in', kind: 'electricity', required: true },
      heat: { direction: 'in', kind: 'heat', required: true },
      product: { direction: 'out', kind: 'material', required: true },
      brine: { direction: 'out', kind: 'material', required: true },
      wasteHeat: { direction: 'out', kind: 'heat', required: true },
    },
    evaluate: thermalDesalination,
  },
  msf: {
    kind: 'converter',
    ports: {
      feed: { direction: 'in', kind: 'material', required: true },
      electricity: { direction: 'in', kind: 'electricity', required: true },
      heat: { direction: 'in', kind: 'heat', required: true },
      product: { direction: 'out', kind: 'material', required: true },
      brine: { direction: 'out', kind: 'material', required: true },
      wasteHeat: { direction: 'out', kind: 'heat', required: true },
    },
    evaluate: thermalDesalination,
  },
  electrolyzer: {
    kind: 'converter',
    ports: {
      water: { direction: 'in', kind: 'material', required: true },
      electricity: { direction: 'in', kind: 'electricity', required: true },
      hydrogen: { direction: 'out', kind: 'material', required: true },
      oxygen: { direction: 'out', kind: 'material', required: true },
      waterReject: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: electrolyzer,
  },
  dac: {
    kind: 'converter',
    ports: {
      air: { direction: 'in', kind: 'material', required: true },
      electricity: { direction: 'in', kind: 'electricity', required: true },
      heat: { direction: 'in', kind: 'heat', required: true },
      consumables: { direction: 'in', kind: 'consumable', required: true },
      capturedCo2: { direction: 'out', kind: 'material', required: true },
      depletedAir: { direction: 'out', kind: 'material', required: true },
      wasteHeat: { direction: 'out', kind: 'heat', required: true },
    },
    evaluate: dac,
  },
  sabatier: {
    kind: 'converter',
    ports: {
      co2: { direction: 'in', kind: 'material', required: true },
      hydrogen: { direction: 'in', kind: 'material', required: true },
      electricity: { direction: 'in', kind: 'electricity', required: true },
      methane: { direction: 'out', kind: 'material', required: true },
      water: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: sabatier,
  },
  asu: {
    kind: 'converter',
    ports: {
      air: { direction: 'in', kind: 'material', required: true }, electricity: { direction: 'in', kind: 'electricity', required: true },
      nitrogen: { direction: 'out', kind: 'material', required: true }, oxygen: { direction: 'out', kind: 'material', required: true }, offgas: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: airSeparation,
  },
  ammonia: {
    kind: 'converter',
    ports: {
      nitrogen: { direction: 'in', kind: 'material', required: true }, hydrogen: { direction: 'in', kind: 'material', required: true }, electricity: { direction: 'in', kind: 'electricity', required: true },
      ammonia: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: ammonia,
  },
  'brine-minerals': {
    kind: 'converter',
    ports: {
      brine: { direction: 'in', kind: 'material', required: true }, electricity: { direction: 'in', kind: 'electricity', required: true },
      lithium: { direction: 'out', kind: 'material', required: true }, bromide: { direction: 'out', kind: 'material', required: true }, magnesium: { direction: 'out', kind: 'material', required: true },
      potash: { direction: 'out', kind: 'material', required: true }, gypsum: { direction: 'out', kind: 'material', required: true }, salt: { direction: 'out', kind: 'material', required: true }, raffinate: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: brineMinerals,
  },
  'chlor-alkali': {
    kind: 'converter',
    ports: {
      salt: { direction: 'in', kind: 'material', required: true }, water: { direction: 'in', kind: 'material', required: true }, electricity: { direction: 'in', kind: 'electricity', required: true },
      caustic: { direction: 'out', kind: 'material', required: true }, chlorine: { direction: 'out', kind: 'material', required: true }, hydrogen: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: chlorAlkali,
  },
  'bromine-recovery': {
    kind: 'converter',
    ports: {
      bromide: { direction: 'in', kind: 'material', required: true }, chlorine: { direction: 'in', kind: 'material', required: true }, electricity: { direction: 'in', kind: 'electricity', required: true },
      bromine: { direction: 'out', kind: 'material', required: true }, salt: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: bromineRecovery,
  },
  'aluminium-smelter': {
    kind: 'converter',
    ports: {
      alumina: { direction: 'in', kind: 'material', required: true }, carbon: { direction: 'in', kind: 'material', required: true }, electricity: { direction: 'in', kind: 'electricity', required: true },
      aluminium: { direction: 'out', kind: 'material', required: true }, carbonDioxide: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: aluminiumSmelter,
  },
  'hydrogen-dri': {
    kind: 'converter',
    ports: {
      ironOre: { direction: 'in', kind: 'material', required: true }, hydrogen: { direction: 'in', kind: 'material', required: true }, electricity: { direction: 'in', kind: 'electricity', required: true },
      steel: { direction: 'out', kind: 'material', required: true }, water: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: hydrogenDri,
  },
  'titanium-kroll': {
    kind: 'converter',
    ports: {
      titaniumTetrachloride: { direction: 'in', kind: 'material', required: true }, magnesium: { direction: 'in', kind: 'material', required: true }, electricity: { direction: 'in', kind: 'electricity', required: true },
      titanium: { direction: 'out', kind: 'material', required: true }, magnesiumChloride: { direction: 'out', kind: 'material', required: true },
    },
    evaluate: titaniumKroll,
  },
});

return { UNITS };
});
