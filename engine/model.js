(function exposeModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetModel = api;
})(globalThis, () => {
const SUBSTANCES = Object.freeze({
  H2O: { elements: { H: 2, O: 1 }, molarMassG: 18.01528, charge: 0 },
  H2: { elements: { H: 2 }, molarMassG: 2.01588, charge: 0 },
  O2: { elements: { O: 2 }, molarMassG: 31.9988, charge: 0 },
  CO2: { elements: { C: 1, O: 2 }, molarMassG: 44.0095, charge: 0 },
  CH4: { elements: { C: 1, H: 4 }, molarMassG: 16.04246, charge: 0 },
  N2: { elements: { N: 2 }, molarMassG: 28.0134, charge: 0 },
  'Na+': { elements: { Na: 1 }, molarMassG: 22.989769, charge: 1 },
  'Cl-': { elements: { Cl: 1 }, molarMassG: 35.45, charge: -1 },
  'Mg+2': { elements: { Mg: 1 }, molarMassG: 24.305, charge: 2 },
  'Ca+2': { elements: { Ca: 1 }, molarMassG: 40.078, charge: 2 },
  'K+': { elements: { K: 1 }, molarMassG: 39.0983, charge: 1 },
  'SO4-2': { elements: { S: 1, O: 4 }, molarMassG: 96.06, charge: -2 },
  'Br-': { elements: { Br: 1 }, molarMassG: 79.904, charge: -1 },
  'Li+': { elements: { Li: 1 }, molarMassG: 6.94, charge: 1 },
  B: { elements: { B: 1 }, molarMassG: 10.81, charge: 0 },
});

function validateStream(stream, expectedKind) {
  if (!stream || stream.kind !== expectedKind) {
    throw new Error(`Expected a ${expectedKind} stream`);
  }

  if (stream.kind === 'material') {
    if (!stream.mol || Object.keys(stream.mol).length === 0) {
      throw new Error('Material streams need at least one substance');
    }
    if (!['solid', 'liquid', 'gas'].includes(stream.phase)) {
      throw new Error('Material streams need a solid, liquid, or gas phase');
    }
    if (!Number.isFinite(stream.T_C)) throw new Error('Material streams need a finite T_C');
    if (!Number.isFinite(stream.P_bar) || stream.P_bar <= 0) {
      throw new Error('Material streams need a positive finite P_bar');
    }
    for (const [substance, amount] of Object.entries(stream.mol)) {
      if (!SUBSTANCES[substance]) throw new Error(`Unknown substance: ${substance}`);
      nonnegative(amount, `mol.${substance}`);
    }
  } else if (stream.kind === 'consumable') {
    nonnegative(stream.amount, 'amount');
    if (!stream.label || !stream.unit) throw new Error('Consumable streams need a label and unit');
  } else {
    nonnegative(stream.kWh, 'kWh');
    if (stream.kind === 'heat' && !Number.isFinite(stream.T_C)) {
      throw new Error('Heat streams need a finite T_C');
    }
  }

  return stream;
}

function cloneStream(stream) {
  return stream.kind === 'material'
    ? { ...stream, mol: { ...stream.mol } }
    : { ...stream };
}

function scaleStream(stream, factor) {
  nonnegative(factor, 'stream scale');
  if (stream.kind === 'consumable') return { ...stream, amount: stream.amount * factor };
  if (stream.kind !== 'material') return { ...stream, kWh: stream.kWh * factor };
  return {
    ...stream,
    mol: Object.fromEntries(
      Object.entries(stream.mol).map(([substance, amount]) => [substance, amount * factor])
    ),
  };
}

function streamMassKg(stream) {
  validateStream(stream, 'material');
  return Object.entries(stream.mol).reduce(
    (sum, [substance, amount]) => sum + amount * SUBSTANCES[substance].molarMassG / 1000,
    0
  );
}

function elementAmounts(stream) {
  validateStream(stream, 'material');
  const totals = {};
  for (const [substance, amount] of Object.entries(stream.mol)) {
    for (const [element, count] of Object.entries(SUBSTANCES[substance].elements)) {
      totals[element] = (totals[element] || 0) + amount * count;
    }
  }
  return totals;
}

function chargeAmount(stream) {
  validateStream(stream, 'material');
  return Object.entries(stream.mol).reduce(
    (sum, [substance, amount]) => sum + amount * SUBSTANCES[substance].charge,
    0
  );
}

function nonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite nonnegative number`);
  }
  return value;
}

return {
  SUBSTANCES,
  chargeAmount,
  cloneStream,
  elementAmounts,
  nonnegative,
  scaleStream,
  streamMassKg,
  validateStream,
};
});
