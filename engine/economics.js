(function exposeEconomics(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./model') : root.FlowsheetModel
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetEconomics = api;
})(globalThis, model => {
const { streamMassKg } = model || {};

function evaluateEconomics(caseDefinition = {}, solved = {}) {
  const graph = caseDefinition.graph || {};
  const nodes = graph.nodes || [];
  const nodeResults = solved.nodes || {};
  const config = caseDefinition.economics || {};
  const periodDays = positive(config.periodDays ?? caseDefinition.operation?.periodDays, 365);
  const projectLifeYears = positive(
    config.projectLifeYears ?? config.lifetimeYears ?? maxAssetLife(nodes),
    20
  );
  const discountRate = number(config.discountRate ?? config.discountRatePercent / 100, 0.08);
  const nodeConfigs = config.nodes || {};
  const streams = solved.streams || [];
  const converters = [];
  const sinks = [];
  let installedCapex = 0;
  let annualRevenue = 0;
  let annualOperatingCost = 0;
  const breakdown = { sourcePurchases: 0, fixedOM: 0, variableOM: 0, disposalCost: 0, productRevenue: 0 };

  for (const node of nodes) {
    const result = nodeResults[node.id] || {};
    const economics = {
      ...(node.params?.economics || {}),
      ...(node.economics || {}),
      ...(nodeConfigs[node.id] || {}),
    };
    if (economics.unitCost != null) {
      const amount = nativeAmount(result.supplied || firstOutgoingStream(streams, node.id));
      const cost = amount * periodDays * number(economics.unitCost);
      annualOperatingCost += cost;
      breakdown.sourcePurchases += cost;
    }

    const capexRate = number(economics.capexRate, 0);
    if (capexRate || economics.installedCapex != null || economics.capacityBasis != null || economics.fixedOM != null || economics.fixedOMPercent != null || economics.variableOM != null) {
      const basis = capacityBasis(economics.capacityBasis, node, result);
      const capex = economics.installedCapex != null
        ? number(economics.installedCapex)
        : capexRate * basis;
      const fixedOM = economics.fixedOM != null
        ? number(economics.fixedOM)
        : capex * fraction(economics.fixedOMPercent);
      const variableOM = number(economics.variableOM, 0) * number(result.activity, 0) * periodDays;
      installedCapex += capex;
      annualOperatingCost += fixedOM + variableOM;
      breakdown.fixedOM += fixedOM;
      breakdown.variableOM += variableOM;
      converters.push({
        id: node.id,
        capacityBasis: basis,
        installedCapex: capex,
        annualFixedOM: fixedOM,
        annualVariableOM: variableOM,
        assetLifeYears: positive(economics.assetLifeYears, projectLifeYears),
      });
    }

    if (economics.disposition) {
      const amount = nativeAmount(result.received || firstIncomingStream(streams, node.id));
      const annualAmount = amount * periodDays;
      const demand = finiteNonnegative(economics.annualDemandLimit) ? economics.annualDemandLimit : Infinity;
      const sold = economics.disposition === 'sale' ? Math.min(annualAmount, demand) : 0;
      const revenue = sold * number(economics.unitPrice, 0);
      const disposal = economics.disposition === 'disposal'
        ? annualAmount * number(economics.disposalCost, 0)
        : 0;
      annualRevenue += revenue;
      annualOperatingCost += disposal;
      breakdown.productRevenue += revenue;
      breakdown.disposalCost += disposal;
      sinks.push({
        id: node.id,
        disposition: economics.disposition,
        amountPerDay: amount,
        annualAmount,
        deliveredAmount: sold,
        annualRevenue: revenue,
        annualDisposalCost: disposal,
        unitPrice: number(economics.unitPrice, 0),
        quality: economics.quality || null,
        source: economics.source || null,
        note: economics.note || null,
        evidence: Array.isArray(economics.evidence) ? economics.evidence : null,
      });
    }
  }

  const annualOperatingCash = annualRevenue - annualOperatingCost;
  const annualizedCapex = installedCapex * capitalRecoveryFactor(discountRate, projectLifeYears);
  // Screening gate is capital-inclusive. NPV/IRR cashFlows stay DCF: year 0 is
  // -installedCapex and years 1..N are operating cash (R−OPEX) plus replacements.
  // Do not subtract annualizedCapex again inside cashFlows.
  const annualNetCash = annualOperatingCash - annualizedCapex;
  const cashFlows = [-installedCapex];
  for (let year = 1; year <= projectLifeYears; year += 1) {
    let cashFlow = annualOperatingCash;
    for (const converter of converters) {
      if (converter.assetLifeYears < Infinity && year < projectLifeYears && year % converter.assetLifeYears === 0) {
        cashFlow -= converter.installedCapex;
      }
    }
    cashFlows.push(cashFlow);
  }

  const npv = netPresentValue(cashFlows, discountRate);
  const irr = approximateIRR(cashFlows);
  const levelizedNumerator = annualizedCapex + annualOperatingCost;
  const delivered = sinks
    .filter(sink => sink.disposition === 'sale' && sink.deliveredAmount > 0)
    .map(sink => (levelizedNumerator - (annualRevenue - sink.annualRevenue)) / sink.deliveredAmount);
  return {
    periodDays,
    projectLifeYears,
    discountRate,
    installedCapex,
    annualizedCapex,
    annualRevenue,
    annualOperatingCost,
    annualOperatingCash,
    annualNetCash,
    breakdown,
    levelizedDeliveredCost: delivered.length === 1 ? delivered[0] : null,
    cashFlows,
    npv,
    irr,
    sinks,
    gateCashFormula: 'annualNetCash = annualRevenue − annualOperatingCost − annualizedCapex (capital-inclusive screening gate; CRF on installedCapex)',
    dcfFormula: 'NPV/IRR cashFlows: year 0 = −installedCapex; years 1..N = annualOperatingCash (R−OPEX) plus replacements; annualizedCapex is not subtracted again',
  };
}

function nativeAmount(stream) {
  if (!stream) return 0;
  if (stream.kind === 'material') return streamMassKg ? streamMassKg(stream) : number(stream.kg, 0);
  if (stream.kind === 'consumable') return number(stream.amount, 0);
  return number(stream.kWh, 0);
}

function capacityBasis(value, node, result) {
  if (typeof value === 'number') return Math.max(0, value);
  if (value === 'activity') return number(result.activity, 0);
  return number(node.capacity ?? result.capacity ?? result.activity, 0);
}

function firstIncomingStream(streams, nodeId) {
  return streams.find(edge => edge.to?.node === nodeId)?.stream;
}

function firstOutgoingStream(streams, nodeId) {
  return streams.find(edge => edge.from?.node === nodeId)?.stream;
}

function maxAssetLife(nodes) {
  const lives = nodes.map(node => Number(node.economics?.assetLifeYears ?? node.params?.economics?.assetLifeYears)).filter(Number.isFinite);
  return lives.length ? Math.max(...lives) : 20;
}

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function positive(value, fallback) {
  const parsed = number(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function finiteNonnegative(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function fraction(value) {
  const parsed = number(value, 0);
  return parsed > 1 ? parsed / 100 : parsed;
}

function capitalRecoveryFactor(rate, years) {
  if (!rate) return 1 / years;
  return rate * (1 + rate) ** years / ((1 + rate) ** years - 1);
}

function netPresentValue(cashFlows, rate) {
  return cashFlows.reduce((sum, cashFlow, year) => sum + cashFlow / (1 + rate) ** year, 0);
}

function approximateIRR(cashFlows) {
  const npv = rate => netPresentValue(cashFlows, rate);
  let low = -0.999999;
  let lowValue = npv(low);
  for (let high = -0.9; high <= 100000; high = high < 1 ? high + 0.1 : high * 1.25) {
    const highValue = npv(high);
    if (lowValue === 0) return low;
    if (lowValue * highValue <= 0) {
      for (let i = 0; i < 100; i += 1) {
        const middle = (low + high) / 2;
        if (npv(middle) * lowValue <= 0) high = middle;
        else { low = middle; lowValue = npv(middle); }
      }
      return (low + high) / 2;
    }
    low = high;
    lowValue = highValue;
  }
  return null;
}


// Co-product cashflow score (post-solve dollars only).
// Gate cash is capital-inclusive: annualNetCash = R − C − annualizedCapex.
// Revenue-proportional charge: A_i = (R_i / R) * (C + annualizedCapex) when R > 0.
// CM_i = R_i - A_i, so every active sale product shares sign(R − C − annualizedCapex).
// Maximizer field: positiveSaleCount = |{R_i>0}| when met, else 0 (max count s.t. cash>0).
// Reporting field: activeSaleCount = |{sale sinks with R_i>0}| regardless of met.
// product.active is R_i>0; product.positive follows CM_i (same sign as plant cash).
function scorePositiveCashflow(economics = {}) {
  const sinks = Array.isArray(economics.sinks) ? economics.sinks : [];
  const annualOperatingCost = number(economics.annualOperatingCost, 0);
  const annualizedCapex = number(economics.annualizedCapex, 0);
  const saleSinks = sinks.filter(sink => sink && sink.disposition === 'sale');
  const revenueTotal = saleSinks.reduce((sum, sink) => sum + number(sink.annualRevenue, 0), 0);
  const annualNetCash = economics.annualNetCash != null
    ? number(economics.annualNetCash, 0)
    : revenueTotal - annualOperatingCost - annualizedCapex;
  const chargedCost = annualOperatingCost + annualizedCapex;
  const products = saleSinks.map(sink => {
    const annualRevenue = number(sink.annualRevenue, 0);
    const allocatedOpex = revenueTotal > 0 ? (annualRevenue / revenueTotal) * chargedCost : 0;
    const contributionMargin = annualRevenue - allocatedOpex;
    return {
      id: sink.id,
      annualRevenue,
      allocatedOpex,
      allocatedCapex: revenueTotal > 0 ? (annualRevenue / revenueTotal) * annualizedCapex : 0,
      contributionMargin,
      positive: contributionMargin > 0,
      active: annualRevenue > 0,
      deliveredAmount: number(sink.deliveredAmount, 0),
    };
  });
  const active = products.filter(product => product.active);
  const met = annualNetCash > 0 && active.length > 0;
  const activeSaleCount = active.length;
  const positiveSaleCount = met ? active.length : 0;
  return {
    name: 'maximize-positive-sale-count',
    formula: 'max |{sale sinks with R_i>0}| s.t. annualNetCash>0; ties -> max annualNetCash. Gate cash = R − OPEX − annualized CAPEX (CRF). positiveSaleCount is met-gated; activeSaleCount is |{R_i>0}| even when cash≤0. CM_i=R_i-(R_i/R)*(C+annualizedCapex); sign(CM_i)=sign(R-C-annualizedCapex) when R_i>0. NPV/IRR use year-0 CAPEX + operating cash (R−OPEX), not the annualized charge.',
    positiveSaleCount,
    activeSaleCount,
    annualNetCash,
    annualRevenue: revenueTotal,
    annualOperatingCost,
    annualizedCapex,
    met,
    products,
  };
}

return { approximateIRR, capitalRecoveryFactor, evaluateEconomics, netPresentValue, scorePositiveCashflow };
});
