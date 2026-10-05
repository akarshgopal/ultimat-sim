(function exposeMaterialPowerBreakeven(root, factory) {
  const economics = typeof require === 'function' ? require('./economics') : root.FlowsheetEconomics;
  const api = factory(economics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MaterialPowerBreakeven = api;
})(globalThis, economics => {
// Purchased-power $/kWh break-even on a frozen solved plant.
// Depends on engine/economics.js only — not site-search or hunt.
// Screening TEA prices. Not a PPA, quote, or offtake contract.

const { evaluateEconomics, scorePositiveCashflow } = economics || {};

const CHILE_ISH_POWER = 0.07;
const NO_GRID_POWER = 0.5;
const BISECT_ITERS = 56;
const P_MAX_DEFAULT = 2;
const P_MAX_EXTEND = 50;
const CASH_EPS = 1e-3;
const MODES = Object.freeze(['solo', 'shared']);

/** Material label → sink node ids that sell that material. */
const MATERIALS = Object.freeze([
  { id: 'lithium', sinks: ['lithium'] },
  { id: 'bromine', sinks: ['bromine'] },
  { id: 'potash', sinks: ['potash'] },
  { id: 'salt', sinks: ['salt', 'recovered-salt'] },
  { id: 'gypsum', sinks: ['gypsum'] },
  { id: 'magnesium', sinks: ['magnesium'] },
  { id: 'caustic', sinks: ['caustic'] },
  { id: 'ammonia', sinks: ['ammonia-product', 'ammonia'] },
  { id: 'oxygen', sinks: ['oxygen'] },
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeMode(mode) {
  const value = String(mode == null || mode === '' ? 'solo' : mode).trim().toLowerCase();
  if (!MODES.includes(value)) {
    throw new Error(`Unknown mode ${mode}; expected solo or shared`);
  }
  return value;
}

function isElectricitySourceNode(node) {
  return node?.unit === 'electricity-source'
    || node?.id === 'power'
    || node?.id === 'electricity'
    || node?.siteResource === 'electricity';
}

/** Strip solar CAPEX/O&M and set purchased unitCost = p $/kWh. */
function applyPurchasedPower(definition, p) {
  for (const node of definition.graph?.nodes || []) {
    if (!isElectricitySourceNode(node)) continue;
    const prev = node.economics && typeof node.economics === 'object' ? { ...node.economics } : {};
    delete prev.installedCapex;
    delete prev.capexRate;
    delete prev.capexIntensity;
    delete prev.fixedOM;
    delete prev.fixedOMPercent;
    delete prev.fixedOmPerCapacity;
    delete prev.capacityBasis;
    const extra = `Purchased-power sensitivity: unitCost=$${p}/kWh; PV installedCapex/capexRate/fixedOM cleared (no PV+grid double-count). Screening, not a PPA.`;
    node.economics = {
      ...prev,
      unitCost: p,
      note: prev.note ? `${prev.note} ${extra}` : extra,
    };
  }
}

/** Keep TEA unitPrice only on sinks for material M; zero other sale prices. */
function applySoloSale(definition, sinkIds) {
  const keep = new Set(sinkIds);
  for (const node of definition.graph?.nodes || []) {
    const econ = node.economics;
    if (!econ || econ.disposition !== 'sale') continue;
    if (keep.has(node.id)) continue;
    node.economics = {
      ...econ,
      unitPrice: 0,
      note: econ.note
        ? `${econ.note} Solo-sale sensitivity: unitPrice zeroed (not the probed material).`
        : 'Solo-sale sensitivity: unitPrice zeroed (not the probed material).',
    };
  }
}

function cashAt(frozenDefinition, solved, sinkIds, p, mode = 'solo') {
  const definition = clone(frozenDefinition);
  const saleMode = normalizeMode(mode);
  if (saleMode === 'solo') applySoloSale(definition, sinkIds);
  applyPurchasedPower(definition, p);
  const evaluated = evaluateEconomics(definition, solved);
  const score = scorePositiveCashflow(evaluated);
  return {
    mode: saleMode,
    annualNetCash: score.annualNetCash,
    annualRevenue: evaluated.annualRevenue,
    annualOperatingCost: evaluated.annualOperatingCost,
    annualizedCapex: evaluated.annualizedCapex,
    installedCapex: evaluated.installedCapex,
    sourcePurchases: evaluated.breakdown?.sourcePurchases ?? null,
  };
}

function bisectBreakEven(frozenDefinition, solved, sinkIds, pMaxStart = P_MAX_DEFAULT, mode = 'solo') {
  const saleMode = normalizeMode(mode);
  const at0 = cashAt(frozenDefinition, solved, sinkIds, 0, saleMode);
  let pMax = pMaxStart;
  let atMax = cashAt(frozenDefinition, solved, sinkIds, pMax, saleMode);

  while (at0.annualNetCash > 0 && atMax.annualNetCash > 0 && pMax < P_MAX_EXTEND) {
    pMax = Math.min(P_MAX_EXTEND, pMax * 2);
    atMax = cashAt(frozenDefinition, solved, sinkIds, pMax, saleMode);
  }

  const context = {
    mode: saleMode,
    cashAt0: at0.annualNetCash,
    cashAt007: cashAt(frozenDefinition, solved, sinkIds, CHILE_ISH_POWER, saleMode).annualNetCash,
    cashAt050: cashAt(frozenDefinition, solved, sinkIds, NO_GRID_POWER, saleMode).annualNetCash,
    at0,
    atMax,
    pMax,
  };

  if (!(at0.annualNetCash > 0) && !(atMax.annualNetCash > 0)) {
    const dominated = saleMode === 'shared'
      ? 'Yearly net cash stays at or below zero even when purchased electricity is free. Operating costs and capital charges are larger than sales of all products together. The plant size is left as it is.'
      : 'Yearly net cash stays at or below zero even when purchased electricity is free. Operating costs and capital charges are larger than this product’s sales alone. The plant size is left as it is.';
    return {
      ...context,
      breakEven: null,
      status: 'no-flip-always-negative',
      reason: at0.annualNetCash <= 0
        ? dominated
        : 'Net cash did not cross zero in the price range checked.',
    };
  }
  if (at0.annualNetCash > 0 && atMax.annualNetCash > 0) {
    const covers = saleMode === 'shared'
      ? `Yearly net cash stays above zero even at $${pMax}/kWh, the top of the price range checked. Sales of all products together still cover operating costs, capital charges, and the electricity purchase.`
      : `Yearly net cash stays above zero even at $${pMax}/kWh, the top of the price range checked. This product’s sales still cover operating costs, capital charges, and the electricity purchase.`;
    return {
      ...context,
      breakEven: null,
      status: 'no-flip-always-positive',
      reason: covers,
    };
  }
  if (!(at0.annualNetCash > 0) && atMax.annualNetCash > 0) {
    return {
      ...context,
      breakEven: null,
      status: 'non-monotonic',
      reason: 'Net cash went up as electricity got more expensive, so this screen cannot find a break-even price.',
    };
  }

  let lo = 0;
  let hi = pMax;
  let loCash = at0.annualNetCash;
  let hiCash = atMax.annualNetCash;
  for (let i = 0; i < BISECT_ITERS; i += 1) {
    const mid = (lo + hi) / 2;
    const midCash = cashAt(frozenDefinition, solved, sinkIds, mid, saleMode).annualNetCash;
    if (Math.abs(midCash) <= CASH_EPS) {
      lo = hi = mid;
      loCash = hiCash = midCash;
      break;
    }
    if (midCash > 0) {
      lo = mid;
      loCash = midCash;
    } else {
      hi = mid;
      hiCash = midCash;
    }
  }
  const breakEven = loCash === hiCash ? lo : lo - loCash * (hi - lo) / (hiCash - loCash);
  return {
    ...context,
    breakEven,
    status: 'flip',
    brackets: { lo, hi, loCash, hiCash },
  };
}

function breakEvenForMaterial(definition, solved, materialId, mode = 'solo') {
  const id = String(materialId || '').trim().toLowerCase();
  const material = MATERIALS.find(item => item.id === id);
  const saleMode = normalizeMode(mode);
  if (!material) {
    return {
      mode: saleMode,
      material: id,
      breakEven: null,
      status: 'unknown-material',
      reason: `Unknown material ${materialId}.`,
      cashAt0: null,
    };
  }
  const result = bisectBreakEven(definition, solved, material.sinks, P_MAX_DEFAULT, saleMode);
  return { ...result, material: material.id };
}

function formatBreakEven(result = {}, materialId) {
  const mode = result.mode === 'shared' ? 'shared' : 'solo';
  const material = materialId || result.material || 'material';
  const head = mode === 'shared'
    ? 'Screening purchased-power break-even (shared) — not a PPA and not bankable. Frozen plant, no re-size.'
    : `Screening purchased-power break-even (solo, ${material}) — not a PPA and not bankable. Frozen plant, no re-size.`;
  if (result.status === 'flip' && Number.isFinite(result.breakEven)) {
    const price = result.breakEven >= 1
      ? `$${result.breakEven.toFixed(2)}`
      : `$${result.breakEven.toFixed(3)}`;
    return `${head} Annual net cash crosses zero near ${price}/kWh.`;
  }
  if (result.reason) return `${head} ${result.reason}`;
  if (result.status === 'no-flip-always-negative') {
    return `${head} Yearly net cash stays negative even when purchased electricity is free.`;
  }
  if (result.status === 'no-flip-always-positive') {
    return `${head} Yearly net cash stays positive across the electricity prices checked.`;
  }
  return `${head} ${result.status || 'No break-even.'}`;
}

return {
  MATERIALS,
  MODES,
  CHILE_ISH_POWER,
  NO_GRID_POWER,
  P_MAX_DEFAULT,
  P_MAX_EXTEND,
  normalizeMode,
  isElectricitySourceNode,
  applySoloSale,
  applyPurchasedPower,
  cashAt,
  bisectBreakEven,
  breakEvenForMaterial,
  formatBreakEven,
};
});
