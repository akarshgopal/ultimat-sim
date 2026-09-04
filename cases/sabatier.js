(function exposeSabatierCase(root, factory) {
  const commonJs = typeof module === 'object' && module.exports;
  const api = factory(commonJs ? require('../engine/model') : root.FlowsheetModel);
  if (commonJs) module.exports = api;
  else root.SabatierCase = api;
})(globalThis, model => {
const { streamMassKg } = model;
const H2O_KG_PER_KG_H2 = 18.01528 / 2.01588;
const H2_KG_PER_KG_CH4 = 4 * 2.01588 / 16.04246;
const CO2_KG_PER_KG_CH4 = 44.0095 / 16.04246;
const H2O_RECOVERED_PER_KG_CH4 = 2 * 18.01528 / 16.04246;

const GAS_PRESETS = {
  ambient: { co2Ppm: 428, oxygenShare: 0.2115 },
  natural_gas_flue: { co2Ppm: 40000, oxygenShare: 0.125 },
  coal_flue: { co2Ppm: 130000, oxygenShare: 0.046 },
};

function gasFromCo2Ppm(co2Ppm, oxygenShare) {
  if (!Number.isFinite(co2Ppm) || co2Ppm < 0 || co2Ppm > 1e6) {
    throw new Error('co2Ppm must be between 0 and 1,000,000');
  }
  const co2Mol = co2Ppm;
  const balanceMol = 1e6 - co2Mol;
  return {
    kind: 'material',
    mol: { CO2: co2Mol, O2: balanceMol * oxygenShare, N2: balanceMol * (1 - oxygenShare) },
    phase: 'gas',
    T_C: 25,
    P_bar: 1,
  };
}

const DEFAULT_SEAWATER = {
  kind: 'material',
  mol: { H2O: 967.858127 * 1000 / 18.01528, 'Na+': 550, 'Cl-': 550 },
  phase: 'liquid',
  T_C: 25,
  P_bar: 1,
};

const DEFAULT_PARAMS = {
  dac: {
    captureFraction: 0.9,
    electricityKWhPerKgCO2: 0.5,
    heatKWhPerKgCO2: 1.5,
    minHeatT_C: 80,
  },
  swro: {
    recovery: 0.45,
    secKWhPerM3: 3.5,
    feedDensityKgM3: 1000,
    productDensityKgM3: 1000,
    ionRejection: 1,
  },
  electrolyzer: { secKWhPerKgH2: 50 },
  sabatier: { electricityKWhPerKgCH4: 1 },
};

function scaleMaterial(stream, targetKg) {
  const factor = targetKg / streamMassKg(stream);
  return { ...stream, mol: Object.fromEntries(Object.entries(stream.mol).map(([id, mol]) => [id, mol * factor])) };
}

function createSabatierCase(overrides = {}) {
  const params = {
    dac: { ...DEFAULT_PARAMS.dac, ...(overrides.params?.dac || {}) },
    swro: { ...DEFAULT_PARAMS.swro, ...(overrides.params?.swro || {}) },
    electrolyzer: { ...DEFAULT_PARAMS.electrolyzer, ...(overrides.params?.electrolyzer || {}) },
    sabatier: { ...DEFAULT_PARAMS.sabatier, ...(overrides.params?.sabatier || {}) },
  };
  const gasPreset = GAS_PRESETS[overrides.gasPreset] || GAS_PRESETS.ambient;
  const co2Ppm = Number(overrides.co2Ppm ?? gasPreset.co2Ppm);
  const airIntakeKg = overrides.airIntakeKg ?? 25000;
  const seawaterAvailableM3 = overrides.seawaterAvailableM3 ?? 0.1;
  const air = overrides.air || scaleMaterial(gasFromCo2Ppm(co2Ppm, gasPreset.oxygenShare), airIntakeKg);
  const seawater = overrides.seawater || scaleMaterial(DEFAULT_SEAWATER, seawaterAvailableM3 * 1000);
  const sabatierRequested = overrides.sabatierRequested ?? 5;
  const sabatierCapacity = overrides.sabatierCapacity ?? 100;
  const brineCapacityKg = overrides.brineCapacityKg ?? 100;
  const offgasCapacityKg = overrides.offgasCapacityKg ?? 25000;
  const sunlightHours = overrides.sunlightHours ?? 8;
  const solarCapacityKW = overrides.solarCapacityKW ?? 37.5;
  const gridElectricityKWh = overrides.gridElectricityKWh ?? 0;
  const solarElectricityKWh = sunlightHours * solarCapacityKW;
  const electricityKWh = overrides.electricityKWh ?? solarElectricityKWh + gridElectricityKWh;
  const heatKWh = overrides.heatKWh ?? 30;
  const heatT_C = overrides.heatT_C ?? 100;
  const enforceSiteConstraints = Boolean(overrides.enforceSiteConstraints);
  const recycleWater = Boolean(overrides.recycleWater);
  const productWaterKgPerKgCH4 = H2_KG_PER_KG_CH4 * H2O_KG_PER_KG_H2;
  const brineKgPerKgCH4 = productWaterKgPerKgCH4 / params.swro.recovery - productWaterKgPerKgCH4;
  const airMassKg = streamMassKg(air);
  const airCo2MassFraction = airMassKg ? air.mol.CO2 * 44.0095 / 1000 / airMassKg : 0;
  const airKgPerKgCH4 = airCo2MassFraction
    ? CO2_KG_PER_KG_CH4 / params.dac.captureFraction / airCo2MassFraction
    : Infinity;
  const offgasKgPerKgCH4 = airKgPerKgCH4 - CO2_KG_PER_KG_CH4;
  const electricityKWhPerKgCH4 =
    CO2_KG_PER_KG_CH4 * params.dac.electricityKWhPerKgCO2
    + productWaterKgPerKgCH4 / 1000 / params.swro.recovery * params.swro.secKWhPerM3
    + H2_KG_PER_KG_CH4 * params.electrolyzer.secKWhPerKgH2
    + params.sabatier.electricityKWhPerKgCH4;
  const heatKWhPerKgCH4 = CO2_KG_PER_KG_CH4 * params.dac.heatKWhPerKgCO2;
  const boundaryLimits = enforceSiteConstraints ? {
    'air intake': airMassKg / airKgPerKgCH4,
    'seawater intake': streamMassKg(seawater) * params.swro.recovery / productWaterKgPerKgCH4,
    electricity: electricityKWh / electricityKWhPerKgCH4,
    'DAC heat': heatT_C < params.dac.minHeatT_C ? 0 : heatKWh / heatKWhPerKgCH4,
    'brine disposal': brineCapacityKg / brineKgPerKgCH4,
    'off-gas discharge': offgasCapacityKg / offgasKgPerKgCH4,
  } : {};
  const boundaryTarget = enforceSiteConstraints ? Math.min(...Object.values(boundaryLimits)) : Infinity;
  const upstreamTarget = Math.min(sabatierRequested, sabatierCapacity, boundaryTarget);
  const h2Requested = overrides.h2Requested ?? upstreamTarget * H2_KG_PER_KG_CH4;
  const roRequested = overrides.roRequested
    ?? Math.max(0, h2Requested * H2O_KG_PER_KG_H2
      - (recycleWater ? upstreamTarget * H2O_RECOVERED_PER_KG_CH4 : 0)) / 1000;

  const boundaryLimitedBy = [];
  if (boundaryTarget < Math.min(sabatierRequested, sabatierCapacity)) {
    for (const [name, limit] of Object.entries(boundaryLimits)) {
      if (Math.abs(boundaryTarget - limit) < 1e-9) boundaryLimitedBy.push(name);
    }
  }

  return {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    constraints: [
      { id: 'electricity', label: 'Electricity', node: 'electricity', side: 'source', capacity: electricityKWh, unit: 'kWh/day', detail: `${solarElectricityKWh.toFixed(1)} solar + ${gridElectricityKWh.toFixed(1)} grid` },
      { id: 'heat', label: 'DAC heat', node: 'heat', side: 'source', capacity: heatKWh, unit: 'kWh/day' },
      { id: 'seawater', label: 'Seawater intake', node: 'seawater', side: 'source', capacity: streamMassKg(seawater), unit: 'kg/day' },
      { id: 'air', label: 'Feed gas intake', node: 'air', side: 'source', capacity: airMassKg, unit: 'kg/day', detail: `${co2Ppm.toLocaleString('en-US')} ppm CO2` },
      { id: 'brine', label: 'Brine disposal', node: 'brine', side: 'sink', capacity: brineCapacityKg, unit: 'kg/day' },
      { id: 'depleted-air', label: 'Off-gas discharge', node: 'depleted-air', side: 'sink', capacity: offgasCapacityKg, unit: 'kg/day' },
    ],
    graph: {
      nodes: [
        { id: 'air', unit: 'material-source', params: { stream: air }, economics: { unitCost: 0 } },
        { id: 'seawater', unit: 'material-source', params: { stream: seawater }, economics: { unitCost: 0.001 } },
        {
          id: 'electricity',
          unit: 'electricity-source',
          params: { stream: { kind: 'electricity', kWh: electricityKWh } },
          economics: { unitCost: 0.03 },
        },
        {
          id: 'heat',
          unit: 'heat-source',
          params: { stream: { kind: 'heat', kWh: heatKWh, T_C: heatT_C } },
          economics: { unitCost: 0.01 },
        },
        {
          id: 'consumables',
          unit: 'consumable-source',
          params: { stream: { kind: 'consumable', amount: 100, unit: 'kg/day', label: 'Sorbent makeup' } },
          economics: { unitCost: 2 },
        },
        { id: 'dac', unit: 'dac', capacity: 100, params: params.dac, economics: { installedCapex: 16425, fixedOMPercent: 4, variableOM: 0.05, assetLifeYears: 20 } },
        { id: 'swro', unit: 'swro', capacity: 10, params: params.swro, economics: { installedCapex: 1000, fixedOMPercent: 3, variableOM: 0, assetLifeYears: 20 } },
        { id: 'electrical-bus', unit: 'electrical-bus' },
        {
          id: 'electrolyzer',
          unit: 'electrolyzer',
          capacity: 100,
          params: params.electrolyzer,
          economics: { installedCapex: 21000, fixedOMPercent: 3, variableOM: 0.03, assetLifeYears: 10 },
        },
        {
          id: 'sabatier',
          unit: 'sabatier',
          capacity: sabatierCapacity,
          params: params.sabatier,
          economics: { installedCapex: 14000, fixedOMPercent: 3, variableOM: 0.02, assetLifeYears: 20 },
        },
        { id: 'depleted-air', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waste-heat', unit: 'heat-sink', economics: { disposition: 'vent' } },
        { id: 'brine', unit: 'material-sink', economics: { disposition: 'disposal', disposalCost: 0.02 } },
        { id: 'oxygen', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'water-reject', unit: 'material-sink', economics: { disposition: 'disposal', disposalCost: 0.001 } },
        { id: 'methane', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 1, annualDemandLimit: 1e12 } },
        ...(recycleWater
          ? [{ id: 'water-mixer', unit: 'material-mixer' }]
          : [{ id: 'sabatier-water', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 0.001, annualDemandLimit: 1e12 } }]),
      ],
      edges: [
        { from: { node: 'air', port: 'out' }, to: { node: 'dac', port: 'air' } },
        { from: { node: 'heat', port: 'out' }, to: { node: 'dac', port: 'heat' } },
        { from: { node: 'consumables', port: 'out' }, to: { node: 'dac', port: 'consumables' } },
        { from: { node: 'seawater', port: 'out' }, to: { node: 'swro', port: 'feed' } },
        { from: { node: 'electricity', port: 'out' }, to: { node: 'electrical-bus', port: 'in' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'dac', port: 'electricity' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'swro', port: 'electricity' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'electrolyzer', port: 'electricity' } },
        { from: { node: 'electrical-bus', port: 'out' }, to: { node: 'sabatier', port: 'electricity' } },
        { from: { node: 'dac', port: 'capturedCo2' }, to: { node: 'sabatier', port: 'co2' } },
        { from: { node: 'dac', port: 'depletedAir' }, to: { node: 'depleted-air', port: 'in' } },
        { from: { node: 'dac', port: 'wasteHeat' }, to: { node: 'waste-heat', port: 'in' } },
        ...(recycleWater ? [
          { from: { node: 'swro', port: 'product' }, to: { node: 'water-mixer', port: 'in' } },
          {
            from: { node: 'sabatier', port: 'water' },
            to: { node: 'water-mixer', port: 'in' },
            recycle: true,
            label: 'Recovered process water',
            initialStream: { kind: 'material', mol: { H2O: 0 }, phase: 'liquid', T_C: 25, P_bar: 1 },
          },
          { from: { node: 'water-mixer', port: 'out' }, to: { node: 'electrolyzer', port: 'water' } },
        ] : [
          { from: { node: 'swro', port: 'product' }, to: { node: 'electrolyzer', port: 'water' } },
        ]),
        { from: { node: 'swro', port: 'brine' }, to: { node: 'brine', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'hydrogen' }, to: { node: 'sabatier', port: 'hydrogen' } },
        { from: { node: 'electrolyzer', port: 'oxygen' }, to: { node: 'oxygen', port: 'in' } },
        { from: { node: 'electrolyzer', port: 'waterReject' }, to: { node: 'water-reject', port: 'in' } },
        { from: { node: 'sabatier', port: 'methane' }, to: { node: 'methane', port: 'in' } },
        ...(!recycleWater ? [
          { from: { node: 'sabatier', port: 'water' }, to: { node: 'sabatier-water', port: 'in' } },
        ] : []),
      ],
    },
    operation: {
      setpoints: {
        dac: overrides.dacRequested ?? upstreamTarget * CO2_KG_PER_KG_CH4,
        swro: roRequested,
        electrolyzer: h2Requested,
        sabatier: boundaryLimitedBy.length ? upstreamTarget : sabatierRequested,
      },
      priorities: { 'electrical-bus': ['dac', 'swro', 'electrolyzer', 'sabatier'] },
      requestedProductActivity: sabatierRequested,
      boundaryLimitedBy,
    },
  };
}

return { createSabatierCase };
});
