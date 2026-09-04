(function exposeAbundanceCase(root, factory) {
  const api = factory(typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AbundanceCase = api;
})(globalThis, model => {
const { SUBSTANCES, streamMassKg } = model;

function createAbundanceCase() {
  const brine = {
    kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1,
    mol: { H2O: 5350000, 'Na+': 110000, 'Cl-': 129810, 'Mg+2': 8000, 'Ca+2': 2000, 'K+': 4000, 'SO4-2': 2000, 'Br-': 200, 'Li+': 10 },
  };
  const bromideRecovery = 0.9;
  const bromineMol = brine.mol['Br-'] * bromideRecovery / 2;
  const bromineKg = bromineMol * SUBSTANCES.Br2.molarMassG / 1000;
  const causticMol = bromineMol * 2;
  const causticKg = causticMol * SUBSTANCES.NaOH.molarMassG / 1000;
  const ammoniaMol = causticMol * 0.5 / 1.5;
  const ammoniaKg = ammoniaMol * SUBSTANCES.NH3.molarMassG / 1000;
  const nitrogenKg = ammoniaMol * 0.5 * SUBSTANCES.N2.molarMassG / 1000;
  const airN2Mol = nitrogenKg * 1000 / SUBSTANCES.N2.molarMassG / 0.98;
  const air = { kind: 'material', mol: { N2: airN2Mol, O2: airN2Mol * 0.268 }, phase: 'gas', T_C: 25, P_bar: 1 };
  const material = (substance, mol, phase = 'solid') => ({ kind: 'material', mol: { [substance]: mol }, phase, T_C: 25, P_bar: 1 });
  const powerKWh = streamMassKg(brine) * 0.05 + causticKg * 2.5 + bromineKg * 0.2 + nitrogenKg * 0.25 + ammoniaKg * 0.6 + 10;
  const outputs = ['lithium', 'magnesium', 'potash', 'gypsum', 'salt', 'raffinate'];

  return {
    economics: { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 },
    graph: {
      nodes: [
        { id: 'brine', unit: 'material-source', sourcePreset: 'brine', params: { stream: brine }, economics: { unitCost: 0.0002 } },
        { id: 'salt-feed', unit: 'material-source', sourcePreset: 'salt', params: { stream: material('NaCl', causticMol) }, economics: { unitCost: 0.08 } },
        { id: 'water', unit: 'material-source', sourcePreset: 'water', params: { stream: material('H2O', causticMol, 'liquid') }, economics: { unitCost: 0.001 } },
        { id: 'air', unit: 'material-source', sourcePreset: 'air', params: { stream: air }, economics: { unitCost: 0 } },
        { id: 'power', unit: 'electricity-source', params: { stream: { kind: 'electricity', kWh: powerKWh } }, economics: { unitCost: 0.03 } },
        { id: 'power-bus', unit: 'electrical-bus' },
        { id: 'minerals', unit: 'brine-minerals', capacity: streamMassKg(brine), params: { electricityKWhPerKgBrine: 0.05, lithiumRecovery: 0.9, bromideRecovery, magnesiumRecovery: 0.5, potashRecovery: 0.7, gypsumRecovery: 0.7, saltRecovery: 0.5 }, economics: { installedCapex: 500000, fixedOMPercent: 4, variableOM: 0.01, assetLifeYears: 20 } },
        { id: 'chlor-alkali', unit: 'chlor-alkali', capacity: 100, params: { electricityKWhPerKg: 2.5 }, economics: { installedCapex: 100000, fixedOMPercent: 4, variableOM: 0.05, assetLifeYears: 20 } },
        { id: 'bromine-recovery', unit: 'bromine-recovery', capacity: 100, params: { electricityKWhPerKg: 0.2 }, economics: { installedCapex: 75000, fixedOMPercent: 4, variableOM: 0.03, assetLifeYears: 20 } },
        { id: 'asu', unit: 'asu', capacity: 100, params: { nitrogenRecovery: 0.98, oxygenRecovery: 0.95, electricityKWhPerKgN2: 0.25 }, economics: { installedCapex: 50000, fixedOMPercent: 4, variableOM: 0.02, assetLifeYears: 20 } },
        { id: 'ammonia', unit: 'ammonia', capacity: 100, params: { electricityKWhPerKg: 0.6 }, economics: { installedCapex: 100000, fixedOMPercent: 4, variableOM: 0.05, assetLifeYears: 20 } },
        ...outputs.map(id => ({ id, unit: 'material-sink', economics: { disposition: id === 'raffinate' ? 'reinjection' : 'sale', unitPrice: { lithium: 5, magnesium: 0.2, potash: 0.3, gypsum: 0.05, salt: 0.08 }[id] || 0, annualDemandLimit: 1e12 } })),
        { id: 'caustic', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 0.5, annualDemandLimit: 1e12 } },
        { id: 'bromine', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 3, annualDemandLimit: 1e12 } },
        { id: 'recovered-salt', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 0.08, annualDemandLimit: 1e12 } },
        { id: 'ammonia-product', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 0.6, annualDemandLimit: 1e12 } },
        { id: 'oxygen', unit: 'material-sink', economics: { disposition: 'sale', unitPrice: 0.05, annualDemandLimit: 1e12 } },
        { id: 'offgas', unit: 'material-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'brine', port: 'out' }, to: { node: 'minerals', port: 'brine' } },
        { from: { node: 'salt-feed', port: 'out' }, to: { node: 'chlor-alkali', port: 'salt' } },
        { from: { node: 'water', port: 'out' }, to: { node: 'chlor-alkali', port: 'water' } },
        { from: { node: 'air', port: 'out' }, to: { node: 'asu', port: 'air' } },
        { from: { node: 'power', port: 'out' }, to: { node: 'power-bus', port: 'in' } },
        ...['minerals', 'chlor-alkali', 'bromine-recovery', 'asu', 'ammonia'].map(id => ({ from: { node: 'power-bus', port: 'out' }, to: { node: id, port: 'electricity' } })),
        ...outputs.map(port => ({ from: { node: 'minerals', port }, to: { node: port, port: 'in' } })),
        { from: { node: 'minerals', port: 'bromide' }, to: { node: 'bromine-recovery', port: 'bromide' } },
        { from: { node: 'chlor-alkali', port: 'chlorine' }, to: { node: 'bromine-recovery', port: 'chlorine' } },
        { from: { node: 'chlor-alkali', port: 'caustic' }, to: { node: 'caustic', port: 'in' } },
        { from: { node: 'chlor-alkali', port: 'hydrogen' }, to: { node: 'ammonia', port: 'hydrogen' } },
        { from: { node: 'bromine-recovery', port: 'bromine' }, to: { node: 'bromine', port: 'in' } },
        { from: { node: 'bromine-recovery', port: 'salt' }, to: { node: 'recovered-salt', port: 'in' } },
        { from: { node: 'asu', port: 'nitrogen' }, to: { node: 'ammonia', port: 'nitrogen' } },
        { from: { node: 'asu', port: 'oxygen' }, to: { node: 'oxygen', port: 'in' } },
        { from: { node: 'asu', port: 'offgas' }, to: { node: 'offgas', port: 'in' } },
        { from: { node: 'ammonia', port: 'ammonia' }, to: { node: 'ammonia-product', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { minerals: streamMassKg(brine), 'chlor-alkali': causticKg, 'bromine-recovery': bromineKg, asu: nitrogenKg, ammonia: ammoniaKg },
      priorities: { 'power-bus': ['minerals', 'chlor-alkali', 'bromine-recovery', 'asu', 'ammonia'] },
    },
  };
}

return { createAbundanceCase };
});
