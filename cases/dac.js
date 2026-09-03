(function exposeDacCase(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DacCase = api;
})(globalThis, () => {
const DEFAULT_AIR = {
  kind: 'material',
  mol: { CO2: 10000, N2: 90000 },
  phase: 'gas',
  T_C: 25,
  P_bar: 1,
};

const DEFAULT_PARAMS = {
  captureFraction: 0.9,
  electricityKWhPerKgCO2: 0.5,
  heatKWhPerKgCO2: 1.5,
  minHeatT_C: 80,
};

function createDacCase(overrides = {}) {
  const params = { ...DEFAULT_PARAMS, ...(overrides.params || {}) };
  const air = overrides.air || DEFAULT_AIR;
  const electricityKWh = overrides.electricityKWh ?? 1000;
  const heatKWh = overrides.heatKWh ?? 1000;
  const heatT_C = overrides.heatT_C ?? 100;
  const consumables = overrides.consumables ?? 100;
  const requestedActivity = overrides.requestedActivity ?? 10;
  const capacity = overrides.capacity ?? 100;

  return {
    graph: {
      nodes: [
        { id: 'air', unit: 'material-source', params: { stream: air } },
        {
          id: 'electricity',
          unit: 'electricity-source',
          params: { stream: { kind: 'electricity', kWh: electricityKWh } },
        },
        {
          id: 'heat',
          unit: 'heat-source',
          params: { stream: { kind: 'heat', kWh: heatKWh, T_C: heatT_C } },
        },
        {
          id: 'consumables',
          unit: 'consumable-source',
          params: { stream: { kind: 'consumable', amount: consumables, unit: 'kg/day', label: 'Sorbent makeup' } },
        },
        { id: 'dac', unit: 'dac', capacity, params },
        { id: 'captured-co2', unit: 'material-sink' },
        { id: 'depleted-air', unit: 'material-sink' },
        { id: 'waste-heat', unit: 'heat-sink' },
      ],
      edges: [
        { from: { node: 'air', port: 'out' }, to: { node: 'dac', port: 'air' } },
        { from: { node: 'electricity', port: 'out' }, to: { node: 'dac', port: 'electricity' } },
        { from: { node: 'heat', port: 'out' }, to: { node: 'dac', port: 'heat' } },
        { from: { node: 'consumables', port: 'out' }, to: { node: 'dac', port: 'consumables' } },
        { from: { node: 'dac', port: 'capturedCo2' }, to: { node: 'captured-co2', port: 'in' } },
        { from: { node: 'dac', port: 'depletedAir' }, to: { node: 'depleted-air', port: 'in' } },
        { from: { node: 'dac', port: 'wasteHeat' }, to: { node: 'waste-heat', port: 'in' } },
      ],
    },
    operation: { setpoints: { dac: requestedActivity } },
  };
}

return { createDacCase };
});
