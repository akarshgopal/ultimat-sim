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
  C2H4: { elements: { C: 2, H: 4 }, molarMassG: 28.0532, charge: 0 },
  // n=12 paraffin diesel/syncrude proxy (dodecane). Not a full FT slate.
  C12H26: { elements: { C: 12, H: 26 }, molarMassG: 170.33484, charge: 0 },
  CH3OH: { elements: { C: 1, H: 4, O: 1 }, molarMassG: 32.04186, charge: 0 },
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
  NH3: { elements: { N: 1, H: 3 }, molarMassG: 17.03052, charge: 0 },
  Urea: { elements: { C: 1, H: 4, N: 2, O: 1 }, molarMassG: 60.0553, charge: 0 },
  Cl2: { elements: { Cl: 2 }, molarMassG: 70.9, charge: 0 },
  NaOH: { elements: { Na: 1, O: 1, H: 1 }, molarMassG: 39.997, charge: 0 },
  C: { elements: { C: 1 }, molarMassG: 12.011, charge: 0 },
  Al2O3: { elements: { Al: 2, O: 3 }, molarMassG: 101.96008, charge: 0 },
  Al: { elements: { Al: 1 }, molarMassG: 26.9815385, charge: 0 },
  Si: { elements: { Si: 1 }, molarMassG: 28.0855, charge: 0 },
  SiO2: { elements: { Si: 1, O: 2 }, molarMassG: 60.0843, charge: 0 },
  Na2CO3: { elements: { Na: 2, C: 1, O: 3 }, molarMassG: 105.9883, charge: 0 },
  CaCO3: { elements: { Ca: 1, C: 1, O: 3 }, molarMassG: 100.0868, charge: 0 },
  CO: { elements: { C: 1, O: 1 }, molarMassG: 28.0104, charge: 0 },
  Fe2O3: { elements: { Fe: 2, O: 3 }, molarMassG: 159.687, charge: 0 },
  Fe: { elements: { Fe: 1 }, molarMassG: 55.845, charge: 0 },
  TiCl4: { elements: { Ti: 1, Cl: 4 }, molarMassG: 189.679, charge: 0 },
  Ti: { elements: { Ti: 1 }, molarMassG: 47.867, charge: 0 },
  Mg: { elements: { Mg: 1 }, molarMassG: 24.305, charge: 0 },
  MgCl2: { elements: { Mg: 1, Cl: 2 }, molarMassG: 95.205, charge: 0 },
  LiCl: { elements: { Li: 1, Cl: 1 }, molarMassG: 42.389769, charge: 0 },
  NaCl: { elements: { Na: 1, Cl: 1 }, molarMassG: 58.439769, charge: 0 },
  NaBr: { elements: { Na: 1, Br: 1 }, molarMassG: 102.893769, charge: 0 },
  KCl: { elements: { K: 1, Cl: 1 }, molarMassG: 74.5483, charge: 0 },
  CaSO4: { elements: { Ca: 1, S: 1, O: 4 }, molarMassG: 136.138, charge: 0 },
  Br2: { elements: { Br: 2 }, molarMassG: 159.808, charge: 0 },
  NH42SO4: { elements: { N: 2, H: 8, S: 1, O: 4 }, molarMassG: 132.14, charge: 0 },
  Al2Si2O5OH4: { elements: { Al: 2, Si: 2, O: 9, H: 4 }, molarMassG: 258.16, charge: 0 },
  La2O3: { elements: { La: 2, O: 3 }, molarMassG: 325.81, charge: 0 },
  CeO2: { elements: { Ce: 1, O: 2 }, molarMassG: 172.12, charge: 0 },
  Pr6O11: { elements: { Pr: 6, O: 11 }, molarMassG: 1021.44, charge: 0 },
  Nd2O3: { elements: { Nd: 2, O: 3 }, molarMassG: 336.48, charge: 0 },
  Sm2O3: { elements: { Sm: 2, O: 3 }, molarMassG: 348.72, charge: 0 },
  Eu2O3: { elements: { Eu: 2, O: 3 }, molarMassG: 351.93, charge: 0 },
  Gd2O3: { elements: { Gd: 2, O: 3 }, molarMassG: 362.50, charge: 0 },
  Tb4O7: { elements: { Tb: 4, O: 7 }, molarMassG: 747.70, charge: 0 },
  Dy2O3: { elements: { Dy: 2, O: 3 }, molarMassG: 373.00, charge: 0 },
  Ho2O3: { elements: { Ho: 2, O: 3 }, molarMassG: 377.86, charge: 0 },
  Er2O3: { elements: { Er: 2, O: 3 }, molarMassG: 382.52, charge: 0 },
  Tm2O3: { elements: { Tm: 2, O: 3 }, molarMassG: 385.87, charge: 0 },
  Yb2O3: { elements: { Yb: 2, O: 3 }, molarMassG: 394.08, charge: 0 },
  Lu2O3: { elements: { Lu: 2, O: 3 }, molarMassG: 397.94, charge: 0 },
  Y2O3: { elements: { Y: 2, O: 3 }, molarMassG: 225.81, charge: 0 },
  C6H12O6: { elements: { C: 6, H: 12, O: 6 }, molarMassG: 180.156, charge: 0 },
  H2O2: { elements: { H: 2, O: 2 }, molarMassG: 34.01468, charge: 0 },
  C6H12O7: { elements: { C: 6, H: 12, O: 7 }, molarMassG: 196.1554, charge: 0 },
  Ag: { elements: { Ag: 1 }, molarMassG: 107.8682, charge: 0 },
  // Encapsulant film mass proxy, not a polymer chain model.
  EVA: { elements: { C: 4, H: 6, O: 2 }, molarMassG: 86.09, charge: 0 },
  // Soda-lime screening proxy. Distinct key from SiO2 even though mass matches; quartz stays SiO2.
  FloatGlass: { elements: { Si: 1, O: 2 }, molarMassG: 60.0843, charge: 0 },
  // 1 mol ≡ 1 kg finished module mass; not a molecule.
  PVmodule: { elements: { Si: 1 }, molarMassG: 1000, charge: 0 },
  // 1 mol ≡ 1 kg screening bauxite ore. Al content / gangue / gibbsite vs boehmite
  // are handled by Bayer intensity (2.0 kg ore / kg Al₂O₃), not a mineralogy model.
  // Distinct from Al2O3 so purchased alumina and ore cannot be confused.
  Bauxite: { elements: { Al: 1 }, molarMassG: 1000, charge: 0 },
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
