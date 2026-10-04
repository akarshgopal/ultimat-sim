(function exposeIonicClayLongnan(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IonicClayLongnan = api;
})(globalThis, () => {
// Deng & Kendall 2019 Table 1 Longnan (Jiangxi) ionic-clay oxide basket.
// Published listed-oxide points sum to 97.27, not 100. The missing 2.73 points
// are dropped — do not invent them. Renormalize listed masses onto 1.0 (÷ 97.27).
// Literature basket for screening, not a Serra Verde / Pela Ema reserve assay.

const PUBLISHED_SUM = 97.27;
const GAP_POINTS = 2.73;
const GRADE_KG_REO_PER_KG_CLAY = 0.001;
const RECOVERY = 0.85;
const AMMONIUM_SULFATE_KG_PER_KG_REO = 7;
const ELECTRICITY_KWH_PER_KG_REO = 8.8;
const PAYABILITY = 0.70;
const NDPR_SEPARATED_USD_PER_KG = 69;
const NDPR_PRICE_USD_PER_KG = 48.30;
const OTHER_REO_PRICE_USD_PER_KG = 33.61;
const OTHER_USGS_VALUE_SUM = 4372.174;
const NDPR_PUBLISHED_POINTS = 6.20;
const OTHER_PUBLISHED_POINTS = 91.07;

const MOLAR_MASS_G = Object.freeze({
  NH42SO4: 132.14,
  Al2Si2O5OH4: 258.16,
  La2O3: 325.81,
  CeO2: 172.12,
  Pr6O11: 1021.44,
  Nd2O3: 336.48,
  Sm2O3: 348.72,
  Eu2O3: 351.93,
  Gd2O3: 362.50,
  Tb4O7: 747.70,
  Dy2O3: 373.00,
  Ho2O3: 377.86,
  Er2O3: 382.52,
  Tm2O3: 385.87,
  Yb2O3: 394.08,
  Lu2O3: 397.94,
  Y2O3: 225.81,
});

const publishedPoints = Object.freeze({
  Nd2O3: 5.10,
  Pr6O11: 1.10,
  La2O3: 2.10,
  CeO2: 1.00,
  Sm2O3: 3.20,
  Eu2O3: 0.30,
  Gd2O3: 2.69,
  Tb4O7: 1.13,
  Dy2O3: 7.48,
  Ho2O3: 1.60,
  Er2O3: 4.26,
  Tm2O3: 0.60,
  Yb2O3: 3.34,
  Lu2O3: 0.47,
  Y2O3: 62.90,
});

const listedOxides = Object.freeze(Object.keys(publishedPoints));
const ndprOxides = Object.freeze(['Nd2O3', 'Pr6O11']);
const otherOxides = Object.freeze(listedOxides.filter(ox => !ndprOxides.includes(ox)));

const renormalizedFractions = Object.freeze(Object.fromEntries(
  listedOxides.map(ox => [ox, publishedPoints[ox] / PUBLISHED_SUM])
));

const usgsSeparatedUsdPerKg = Object.freeze({
  La2O3: 1.00,
  CeO2: 1.71,
  Sm2O3: 2.82,
  Eu2O3: 27,
  Gd2O3: 30,
  Tb4O7: 1010,
  Dy2O3: 239,
  Ho2O3: 70,
  Er2O3: 46,
  Tm2O3: 0,
  Yb2O3: 15,
  Lu2O3: 888,
  Y2O3: 9,
});

function clayMolForKg(kg) {
  const mass = Number(kg);
  if (!Number.isFinite(mass) || mass < 0) throw new Error('clayMolForKg needs a finite nonnegative kg');
  const reoKg = mass * GRADE_KG_REO_PER_KG_CLAY;
  const mol = {};
  for (const ox of listedOxides) {
    mol[ox] = reoKg * renormalizedFractions[ox] * 1000 / MOLAR_MASS_G[ox];
  }
  mol.Al2Si2O5OH4 = (mass - reoKg) * 1000 / MOLAR_MASS_G.Al2Si2O5OH4;
  return mol;
}

function clayMassFractions() {
  const fractions = { Al2Si2O5OH4: 1 - GRADE_KG_REO_PER_KG_CLAY };
  for (const ox of listedOxides) {
    fractions[ox] = GRADE_KG_REO_PER_KG_CLAY * renormalizedFractions[ox];
  }
  return fractions;
}

return {
  publishedPoints,
  publishedSum: PUBLISHED_SUM,
  gapPoints: GAP_POINTS,
  listedOxides,
  ndprOxides,
  otherOxides,
  renormalizedFractions,
  ndprPublishedPoints: NDPR_PUBLISHED_POINTS,
  otherPublishedPoints: OTHER_PUBLISHED_POINTS,
  usgsSeparatedUsdPerKg,
  otherUsgsValueSum: OTHER_USGS_VALUE_SUM,
  payability: PAYABILITY,
  ndprSeparatedUsdPerKg: NDPR_SEPARATED_USD_PER_KG,
  ndprPriceUsdPerKg: NDPR_PRICE_USD_PER_KG,
  otherReoPriceUsdPerKg: OTHER_REO_PRICE_USD_PER_KG,
  gradeKgReoPerKgClay: GRADE_KG_REO_PER_KG_CLAY,
  recovery: RECOVERY,
  ammoniumSulfateKgPerKgReo: AMMONIUM_SULFATE_KG_PER_KG_REO,
  electricityKWhPerKgReo: ELECTRICITY_KWH_PER_KG_REO,
  molarMassG: MOLAR_MASS_G,
  clayMolForKg,
  clayMassFractions,
  note: 'Deng & Kendall 2019 Table 1 Longnan listed oxides sum to 97.27; the unpublished 2.73-point gap is dropped and listed masses are renormalized onto 1.0. Y-rich heavy basket, not an NdPr clay. Literature assay, not a concession.',
};
});
