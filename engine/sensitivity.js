(function exposeSensitivity(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./solve') : root.FlowsheetSolver,
    typeof require === 'function' ? require('./economics') : root.FlowsheetEconomics,
    typeof require === 'function' ? require('./size') : root.FlowsheetSize
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetSensitivity = api;
})(globalThis, (solver, economics, size) => {
const { solveOperation } = solver || {};
const { evaluateEconomics, scorePositiveCashflow } = economics || {};
const { sizeForPositiveCashflow } = size || {};

// Screening fuel price / CAPEX break-even. Default path sizes the plant once
// at baseline capacities (`sizing: 'baseline-once'`), then re-evaluates
// economics only while sweeping product price or a CAPEX factor. Dollars never
// re-enter the physics solver. Optional `mode:'resize-each'` calls
// sizeForPositiveCashflow on every trial (slow; matches the cashflow search).
// Prices and CAPEX stay screening — not quotes.

const PRODUCT_ALIASES = {
  ch4: 'CH4',
  methane: 'CH4',
  h2: 'H2',
  meoh: 'methanol',
  ch3oh: 'methanol',
  methanol: 'methanol',
};
const DEFAULT_PRICE_MIN = 0.1;
const DEFAULT_PRICE_MAX = 20;
const DEFAULT_CAPEX_MIN = 0.05;
const DEFAULT_CAPEX_MAX = 2;
const DEFAULT_SAMPLES = 11;
const DEFAULT_TOLERANCE = 1e-6;
const BISECT_ITERS = 48;
const SCREENING_LABEL = 'screening';

function cloneDefinition(definition) {
  return JSON.parse(JSON.stringify(definition));
}

function resolveDefinition(caseOrBuilder) {
  const definition = typeof caseOrBuilder === 'function' ? caseOrBuilder() : caseOrBuilder;
  if (!definition?.graph?.nodes) throw new Error('findFuelBreakEven needs a case definition or builder');
  return cloneDefinition(definition);
}

function normalizeProduct(product) {
  const key = String(product ?? '').trim().toLowerCase();
  const normalized = PRODUCT_ALIASES[key];
  if (!normalized) throw new Error("Unknown product. Use CH4, methane, methanol, or H2");
  return normalized;
}

function isSink(node) {
  return Boolean(node && String(node.unit || '').includes('sink'));
}

function nodeBy(definition, predicate) {
  return (definition.graph?.nodes || []).find(predicate);
}

function edgeToSink(definition, fromId, port) {
  const edge = (definition.graph?.edges || []).find(item => item.from?.node === fromId && item.from?.port === port);
  if (!edge) return null;
  const sink = nodeBy(definition, node => node.id === edge.to?.node);
  return isSink(sink) ? sink : null;
}

function findProductSink(definition, product) {
  if (product === 'CH4') {
    return nodeBy(definition, node => node.id === 'methane' && isSink(node))
      || edgeToSink(definition, nodeBy(definition, node => node.unit === 'sabatier')?.id, 'methane')
      || nodeBy(definition, node => isSink(node) && /methane|ch4/i.test(node.id));
  }
  if (product === 'methanol') {
    return nodeBy(definition, node => (node.id === 'methanol-product' || node.id === 'methanol') && isSink(node))
      || edgeToSink(definition, nodeBy(definition, node => node.unit === 'methanol')?.id, 'methanol');
  }
  if (product === 'H2') {
    return nodeBy(definition, node => (node.id === 'hydrogen' || node.id === 'h2') && isSink(node))
      || edgeToSink(definition, nodeBy(definition, node => node.unit === 'electrolyzer')?.id, 'hydrogen')
      || nodeBy(definition, node => isSink(node) && /h2|hydrogen/i.test(node.id));
  }
  return null;
}

function scaleCapexFields(econ, factor) {
  if (!econ || typeof econ !== 'object') return;
  if (econ.installedCapex != null && Number.isFinite(Number(econ.installedCapex))) {
    econ.installedCapex = Number(econ.installedCapex) * factor;
  }
  if (econ.capexRate != null && Number.isFinite(Number(econ.capexRate))) {
    econ.capexRate = Number(econ.capexRate) * factor;
  }
}

function applyCapexFactor(definition, factor) {
  for (const node of definition.graph?.nodes || []) {
    scaleCapexFields(node.economics, factor);
    scaleCapexFields(node.params?.economics, factor);
  }
}

function applyPrice(definition, sink, price) {
  if (!sink) return;
  const node = nodeBy(definition, item => item.id === sink.id) || sink;
  node.economics = node.economics || {};
  node.economics.unitPrice = price;
  if (!node.economics.disposition) node.economics.disposition = 'sale';
}

function applyTrial(definition, vary, value, sink) {
  if (vary === 'price') applyPrice(definition, sink, value);
  else applyCapexFactor(definition, value);
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cashTolerance(tolerance, cash) {
  const abs = finiteNumber(tolerance, DEFAULT_TOLERANCE);
  return Math.max(abs, DEFAULT_TOLERANCE * Math.max(1, Math.abs(cash)));
}

function sampleValues(min, max, samples) {
  const count = Math.max(2, Math.round(finiteNumber(samples, DEFAULT_SAMPLES)));
  if (max <= min) return [min];
  const values = [];
  for (let i = 0; i < count; i += 1) {
    values.push(min + (max - min) * (i / (count - 1)));
  }
  return values;
}

function collectPriceSources(definition, product, sink) {
  const sources = [];
  const seen = new Set();
  const push = (item) => {
    if (!item) return;
    const label = typeof item === 'string' ? item : (item.label || item.note || '');
    if (!label || seen.has(label)) return;
    seen.add(label);
    sources.push({
      label,
      url: item.url || null,
      quality: item.quality || SCREENING_LABEL,
    });
  };

  for (const item of definition.site?.evidence || []) {
    const text = String(item?.label || item || '');
    if (/\$0\.40\/kg|\$1\/kg|product price|unitPrice|\$\/kg/i.test(text)) push(item);
  }

  const price = sink?.economics?.unitPrice;
  if (product === 'CH4') {
    push({
      label: `Methane ${price != null ? `$${price}/kg` : '$1/kg'} screening offtake (case sink unitPrice), not a quoted gas contract`,
      quality: SCREENING_LABEL,
    });
  } else if (product === 'methanol') {
    push({
      label: 'Methanol $0.40/kg product price is screening, not plant quotes',
      quality: SCREENING_LABEL,
    });
  } else if (product === 'H2') {
    push({
      label: `Hydrogen ${price != null ? `$${price}/kg` : ''} screening offtake (case sink unitPrice), not a quoted contract`.replace(/\s+/g, ' ').trim(),
      quality: SCREENING_LABEL,
    });
  }
  push({ label: 'CAPEX and O&M on this path are screening lump sums / percents, not vendor quotes', quality: SCREENING_LABEL });
  return sources;
}

function scoreTrial({ definition, solved, vary, value, sink, scales, rates, caps, maxIterations, tolerance, heatCredit, resizeEach }) {
  const trial = cloneDefinition(definition);
  applyTrial(trial, vary, value, sink);
  if (resizeEach) {
    if (!sizeForPositiveCashflow) throw new Error('findFuelBreakEven resize-each needs sizeForPositiveCashflow');
    const sized = sizeForPositiveCashflow({
      caseOrBuilder: () => trial,
      scales,
      rates,
      caps,
      maxIterations,
      tolerance,
      heatCredit,
    });
    return {
      value,
      annualNetCash: sized.objective?.annualNetCash ?? 0,
      positiveSaleCount: sized.objective?.positiveSaleCount ?? 0,
      met: Boolean(sized.objective?.met),
      objective: sized.objective,
      economics: sized.economics,
    };
  }
  if (!evaluateEconomics || !scorePositiveCashflow) {
    throw new Error('findFuelBreakEven needs FlowsheetEconomics');
  }
  const economicsResult = evaluateEconomics(trial, solved);
  const objective = scorePositiveCashflow(economicsResult);
  return {
    value,
    annualNetCash: objective.annualNetCash,
    positiveSaleCount: objective.positiveSaleCount,
    met: Boolean(objective.met),
    objective,
    economics: economicsResult,
  };
}

function interpolateZero(low, high, lowCash, highCash) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (high === low) return high;
  if (!Number.isFinite(lowCash) || !Number.isFinite(highCash) || highCash === lowCash) return high;
  const t = (0 - lowCash) / (highCash - lowCash);
  if (!Number.isFinite(t)) return high;
  return low + Math.min(1, Math.max(0, t)) * (high - low);
}

function findFuelBreakEven(opts = {}) {
  const product = normalizeProduct(opts.product);
  const vary = String(opts.vary || '').trim().toLowerCase();
  if (vary !== 'price' && vary !== 'capex') {
    throw new Error("findFuelBreakEven vary must be 'price' or 'capex'");
  }
  const caseOrBuilder = opts.definition ?? opts.caseOrBuilder;
  if (!caseOrBuilder) throw new Error('findFuelBreakEven needs a case definition or builder');
  const seedSnapshot = typeof caseOrBuilder === 'function' ? null : JSON.stringify(caseOrBuilder);
  const definition = resolveDefinition(caseOrBuilder);
  const sink = findProductSink(definition, product);
  if (!sink) throw new Error(`findFuelBreakEven needs a ${product} sale sink`);

  const resizeEach = opts.mode === 'resize-each' || opts.sizing === 'resize-each';
  const sizing = resizeEach ? 'resize-each' : 'baseline-once';
  const tolerance = finiteNumber(opts.tolerance, DEFAULT_TOLERANCE);
  const min = vary === 'price'
    ? finiteNumber(opts.priceMin, DEFAULT_PRICE_MIN)
    : finiteNumber(opts.capexMin, DEFAULT_CAPEX_MIN);
  const max = vary === 'price'
    ? finiteNumber(opts.priceMax, DEFAULT_PRICE_MAX)
    : finiteNumber(opts.capexMax, DEFAULT_CAPEX_MAX);
  if (!(max > min)) throw new Error('findFuelBreakEven search bounds must satisfy max > min');

  const warnings = [
    'Prices and CAPEX are screening assumptions, not quotes or permits.',
  ];
  if (sizing === 'baseline-once') {
    warnings.push('sizing: baseline-once — solved once at case capacities; sweep re-evaluates economics only (no re-size). Break-even is annualNetCash crossing 0 with positiveSaleCount ≥ 1.');
  }
  if (opts.mode === 'evaluate-only' && resizeEach) {
    warnings.push("mode 'evaluate-only' ignored because sizing is resize-each");
  }

  let solved = null;
  if (!resizeEach) {
    if (!solveOperation) throw new Error('findFuelBreakEven needs FlowsheetSolver');
    solved = solveOperation(definition);
  }

  const evaluate = value => scoreTrial({
    definition,
    solved,
    vary,
    value,
    sink,
    scales: opts.scales,
    rates: opts.rates,
    caps: opts.caps,
    maxIterations: opts.maxIterations,
    tolerance: opts.tolerance,
    heatCredit: opts.heatCredit,
    resizeEach,
  });

  const baselineScore = evaluate(vary === 'price'
    ? finiteNumber(sink.economics?.unitPrice, 0)
    : 1);
  const baseline = {
    unitPrice: finiteNumber(sink.economics?.unitPrice, null),
    installedCapex: baselineScore.economics?.installedCapex ?? null,
    annualNetCash: baselineScore.annualNetCash,
    objective: {
      met: Boolean(baselineScore.objective?.met),
      positiveSaleCount: baselineScore.objective?.positiveSaleCount ?? 0,
      annualNetCash: baselineScore.annualNetCash,
    },
  };

  const curve = sampleValues(min, max, opts.samples).map((value) => {
    const scored = evaluate(value);
    return {
      value,
      annualNetCash: scored.annualNetCash,
      positiveSaleCount: scored.positiveSaleCount,
      met: scored.met,
    };
  });

  const lowEval = evaluate(min);
  const highEval = evaluate(max);
  // Price: cash rises with value. CAPEX factor: cash falls with value (less
  // installedCapex → less percent-based fixed OM). Bracket the met/unmet pair.
  const rising = vary === 'price';
  const unmet = rising ? lowEval : highEval;
  const meeting = rising ? highEval : lowEval;
  const unmetValue = rising ? min : max;
  const meetingValue = rising ? max : min;

  let breakEven = null;
  let met = false;
  let brackets = {
    low: min,
    high: max,
    lowCash: lowEval.annualNetCash,
    highCash: highEval.annualNetCash,
  };

  if (meeting.met && !unmet.met) {
    let lo = unmetValue;
    let hi = meetingValue;
    let loScore = unmet;
    let hiScore = meeting;
    for (let i = 0; i < BISECT_ITERS; i += 1) {
      const mid = (lo + hi) / 2;
      const scored = evaluate(mid);
      if (scored.met) {
        hi = mid;
        hiScore = scored;
      } else {
        lo = mid;
        loScore = scored;
      }
      const span = Math.abs(hi - lo);
      const scale = Math.max(1, Math.abs(mid));
      if (span <= cashTolerance(tolerance, mid) || span / scale <= DEFAULT_TOLERANCE) break;
      if (hiScore.met && Math.abs(hiScore.annualNetCash) <= cashTolerance(tolerance, hiScore.annualNetCash)) break;
    }
    breakEven = interpolateZero(lo, hi, loScore.annualNetCash, hiScore.annualNetCash);
    met = Number.isFinite(breakEven);
    brackets = rising
      ? { low: lo, high: hi, lowCash: loScore.annualNetCash, highCash: hiScore.annualNetCash }
      : { low: hi, high: lo, lowCash: hiScore.annualNetCash, highCash: loScore.annualNetCash };
  } else if (lowEval.met && highEval.met) {
    warnings.push(`Plant is cash-positive across the full ${vary} search range; break-even is at or below the lower bound.`);
    breakEven = rising ? min : max;
    met = true;
    brackets = { low: min, high: max, lowCash: lowEval.annualNetCash, highCash: highEval.annualNetCash };
  } else {
    warnings.push(`No cash-positive ${vary} break-even inside bounds [${min}, ${max}].`);
    if (vary === 'capex') {
      warnings.push('CAPEX factor only moves percent-of-CAPEX fixed OM; OPEX-dominated plants may never cross zero.');
    }
    met = false;
    breakEven = null;
  }

  if (seedSnapshot && JSON.stringify(caseOrBuilder) !== seedSnapshot) {
    throw new Error('findFuelBreakEven mutated the input definition');
  }

  return {
    product,
    vary,
    met,
    breakEven,
    brackets,
    curve,
    baseline,
    label: SCREENING_LABEL,
    priceSources: collectPriceSources(definition, product, sink),
    sizing,
    warnings,
  };
}

return { findFuelBreakEven };
});
