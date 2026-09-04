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
  const nodeEconomics = {};
  const sources = [];
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
    nodeEconomics[node.id] = economics;
    if (economics.unitCost != null) {
      const amount = nativeAmount(result.supplied || firstOutgoingStream(streams, node.id));
      const cost = amount * periodDays * number(economics.unitCost);
      annualOperatingCost += cost;
      breakdown.sourcePurchases += cost;
      sources.push({ id: node.id, amountPerDay: amount, annualAmount: amount * periodDays, annualCost: cost });
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
      });
    }
  }

  const annualNetCash = annualRevenue - annualOperatingCost;
  const cashFlows = [-installedCapex];
  for (let year = 1; year <= projectLifeYears; year += 1) {
    let cashFlow = annualNetCash;
    for (const converter of converters) {
      if (converter.assetLifeYears < Infinity && year < projectLifeYears && year % converter.assetLifeYears === 0) {
        cashFlow -= converter.installedCapex;
      }
    }
    cashFlows.push(cashFlow);
  }

  const npv = netPresentValue(cashFlows, discountRate);
  const irr = approximateIRR(cashFlows);
  const levelizedCosts = {};
  const annualizedCapex = installedCapex * capitalRecoveryFactor(discountRate, projectLifeYears);
  const levelizedNumerator = annualizedCapex + annualOperatingCost;
  for (const sink of sinks.filter(entry => entry.disposition === 'sale')) {
    levelizedCosts[sink.id] = sink.deliveredAmount > 0
      ? (levelizedNumerator - (annualRevenue - sink.annualRevenue)) / sink.deliveredAmount
      : null;
  }
  const delivered = Object.values(levelizedCosts).filter(value => value != null);
  return {
    periodDays,
    projectLifeYears,
    discountRate,
    installedCapex,
    annualRevenue,
    annualOperatingCost,
    annualNetCash,
    annualDelivered: Object.fromEntries(sinks.map(sink => [sink.id, sink.deliveredAmount])),
    breakdown,
    levelizedCosts,
    levelizedDeliveredCost: delivered.length === 1 ? delivered[0] : null,
    levelizedCost: delivered.length === 1 ? delivered[0] : null,
    levelizedDeliveredCosts: levelizedCosts,
    cashFlows,
    npv,
    irr,
    nodeEconomics,
    sources,
    converters,
    sinks,
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

return { approximateIRR, evaluateEconomics, netPresentValue };
});
