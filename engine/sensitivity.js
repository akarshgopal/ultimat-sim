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
const { sizeForPositiveCashflow, sizeToProduct } = size || {};

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

function teaPrices() {
  if (typeof require === 'function') {
    try {
      return require('../data/tea-screening.js').prices;
    } catch {
      return null;
    }
  }
  return globalThis.TeaScreening?.prices || null;
}

// Cited/screening fuel bands for the cash+ probe. CH4 is the tea-screening
// green-premium point ($1/kg), not Henry Hub. MeOH is the $250–500/t commodity
// band (mid $0.40/kg). CAPEX factor 0.05–2 is a screening multiplier, not a
// vendor quote. Do not treat these as bankable offtake or EPC numbers.
function fuelScreeningBounds(product) {
  const normalized = normalizeProduct(product);
  const prices = teaPrices();
  if (normalized === 'CH4') {
    const mid = finiteNumber(prices?.methane?.value, 1);
    return {
      product: 'CH4',
      priceMin: mid,
      priceMax: mid,
      priceMid: mid,
      capexMin: DEFAULT_CAPEX_MIN,
      capexMax: DEFAULT_CAPEX_MAX,
      label: SCREENING_LABEL,
      source: 'tea-screening methane green-premium',
      note: `CH4 $${mid}/kg screening green-premium (tea-screening); not Henry Hub and not a quoted gas contract. CAPEX factor ${DEFAULT_CAPEX_MIN}–${DEFAULT_CAPEX_MAX} is screening, not a vendor quote.`,
    };
  }
  if (normalized === 'methanol') {
    const mid = finiteNumber(prices?.methanol?.value, 0.4);
    const priceMin = 0.25;
    const priceMax = 0.5;
    return {
      product: 'methanol',
      priceMin,
      priceMax,
      priceMid: mid,
      capexMin: DEFAULT_CAPEX_MIN,
      capexMax: DEFAULT_CAPEX_MAX,
      label: SCREENING_LABEL,
      source: 'tea-screening methanol commodity band',
      note: `MeOH $${priceMin}–$${priceMax}/kg commodity band (mid $${mid}/kg, tea-screening); not a plant quote. CAPEX factor ${DEFAULT_CAPEX_MIN}–${DEFAULT_CAPEX_MAX} is screening, not a vendor quote.`,
    };
  }
  return {
    product: normalized,
    priceMin: DEFAULT_PRICE_MIN,
    priceMax: DEFAULT_PRICE_MAX,
    priceMid: null,
    capexMin: DEFAULT_CAPEX_MIN,
    capexMax: DEFAULT_CAPEX_MAX,
    label: SCREENING_LABEL,
    source: 'sensitivity defaults',
    note: `${normalized} screening price $${DEFAULT_PRICE_MIN}–$${DEFAULT_PRICE_MAX}/kg and CAPEX factor ${DEFAULT_CAPEX_MIN}–${DEFAULT_CAPEX_MAX}; not a quoted contract.`,
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(value => Number.isFinite(value)))].sort((left, right) => left - right);
}

function sameNumber(left, right) {
  return Math.abs(Number(left) - Number(right)) < 1e-9;
}

function midPriceOf(bounds) {
  if (Number.isFinite(Number(bounds?.priceMid))) return Number(bounds.priceMid);
  const min = Number(bounds?.priceMin);
  const max = Number(bounds?.priceMax);
  if (Number.isFinite(min) && Number.isFinite(max)) return (min + max) / 2;
  return Number.isFinite(min) ? min : null;
}

function summarizeTrial(trial) {
  if (!trial) return null;
  return {
    price: trial.price,
    capexFactor: trial.capexFactor,
    rate: trial.rate,
    annualNetCash: trial.annualNetCash,
    positiveSaleCount: trial.positiveSaleCount,
    met: Boolean(trial.met),
  };
}

function pickBestTrial(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (left.met !== right.met) return left.met ? left : right;
  return right.annualNetCash > left.annualNetCash ? right : left;
}

function pickMidTrial(trials, bounds) {
  const price = midPriceOf(bounds);
  if (!Number.isFinite(price)) return null;
  let mid = null;
  for (const trial of trials) {
    if (sameNumber(trial.price, price) && sameNumber(trial.capexFactor, 1)) {
      mid = pickBestTrial(mid, trial);
    }
  }
  return mid;
}

function scorePriceCapex({ definition, solved, sink, price, capexFactor }) {
  if (!evaluateEconomics || !scorePositiveCashflow) {
    throw new Error('probeFuelCash needs FlowsheetEconomics');
  }
  const trial = cloneDefinition(definition);
  applyPrice(trial, sink, price);
  applyCapexFactor(trial, capexFactor);
  const economicsResult = evaluateEconomics(trial, solved);
  const objective = scorePositiveCashflow(economicsResult);
  return {
    price,
    capexFactor,
    annualNetCash: objective.annualNetCash,
    positiveSaleCount: objective.positiveSaleCount,
    met: Boolean(objective.met),
    objective,
    economics: economicsResult,
  };
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : (abs >= 10 ? 1 : 2);
  return value.toFixed(digits);
}

// Post-size (or already-solved) price × CAPEX-factor grid inside tea-screening
// bands. Economics only — dollars never re-enter the physics solver. Optional
// `rates` re-sizes each rate with sizeToProduct before the grid (true size ×
// price × CAPEX; slower). Default is the given sized plant.
// Rank gate is mid-band: tea-screening mid price × CAPEX factor 1.0. Edge
// trials (e.g. capexFactor=0.05) stay diagnostic — they do not set `met`.
function probeFuelCash(opts = {}) {
  const product = normalizeProduct(opts.product);
  const bounds = fuelScreeningBounds(product);
  const caseOrBuilder = opts.definition ?? opts.caseOrBuilder;
  if (!caseOrBuilder) throw new Error('probeFuelCash needs a case definition or builder');
  const seedSnapshot = typeof caseOrBuilder === 'function' ? null : JSON.stringify(caseOrBuilder);
  const midPrice = midPriceOf(bounds);
  const prices = uniqueSorted([bounds.priceMin, midPrice, bounds.priceMax]);
  const capexFactors = uniqueSorted(
    opts.capexFactors && opts.capexFactors.length
      ? [...opts.capexFactors, 1]
      : [bounds.capexMin, 1, bounds.capexMax]
  );
  const rates = (opts.rates || []).map(Number).filter(rate => rate > 0);
  const seeds = [];
  if (rates.length) {
    if (!sizeToProduct) throw new Error('probeFuelCash rates need sizeToProduct');
    for (const rate of rates) {
      try {
        const sized = sizeToProduct({
          product,
          rate,
          caseOrBuilder,
          caps: opts.caps,
          maxIterations: opts.maxIterations,
          tolerance: opts.tolerance,
          heatCredit: opts.heatCredit,
        });
        seeds.push({
          definition: sized.definition,
          solved: sized.solved,
          rate,
          selected: { family: 'fuel', product, rate },
        });
      } catch {
        // Rate may be infeasible; skip.
      }
    }
  } else {
    const definition = resolveDefinition(caseOrBuilder);
    let solved = opts.solved;
    if (!solved) {
      if (!solveOperation) throw new Error('probeFuelCash needs FlowsheetSolver');
      solved = solveOperation(definition);
    }
    seeds.push({
      definition,
      solved,
      rate: opts.selected?.rate ?? null,
      selected: opts.selected || null,
    });
  }
  if (!seeds.length) {
    throw new Error('probeFuelCash found no sized fuel plant to probe');
  }

  const trials = [];
  const curve = [];
  for (const seed of seeds) {
    const sink = findProductSink(seed.definition, product);
    if (!sink) throw new Error(`probeFuelCash needs a ${product} sale sink`);
    // Mid-band first (rank gate), then the rest of the screening grid.
    const orderedCapex = uniqueSorted(capexFactors).sort((left, right) => (
      sameNumber(left, 1) === sameNumber(right, 1) ? left - right : (sameNumber(left, 1) ? -1 : 1)
    ));
    const orderedPrices = uniqueSorted(prices).sort((left, right) => (
      sameNumber(left, midPrice) === sameNumber(right, midPrice) ? left - right : (sameNumber(left, midPrice) ? -1 : 1)
    ));
    for (const price of orderedPrices) {
      for (const capexFactor of orderedCapex) {
        const scored = scorePriceCapex({
          definition: seed.definition,
          solved: seed.solved,
          sink,
          price,
          capexFactor,
        });
        const trial = {
          ...scored,
          rate: seed.rate,
          selected: seed.selected,
        };
        trials.push(trial);
        curve.push({
          rate: seed.rate,
          price,
          capexFactor,
          annualNetCash: trial.annualNetCash,
          positiveSaleCount: trial.positiveSaleCount,
          met: trial.met,
        });
      }
    }
  }

  const best = trials.reduce((lead, trial) => pickBestTrial(lead, trial), null);
  const mid = pickMidTrial(trials, bounds);
  const midMet = Boolean(mid?.met);
  const ranked = midMet ? mid : null;

  const diagnosticSeed = (best && seeds.find(seed => seed.rate === best.rate)) || seeds[0];
  const priceSweep = findFuelBreakEven({
    definition: diagnosticSeed.definition,
    product,
    vary: 'price',
    priceMin: DEFAULT_PRICE_MIN,
    priceMax: DEFAULT_PRICE_MAX,
    samples: opts.samples,
    tolerance: opts.tolerance,
  });
  const breakEvenPrice = priceSweep.met ? priceSweep.breakEven : null;
  const inBand = Number.isFinite(breakEvenPrice)
    && breakEvenPrice >= bounds.priceMin - 1e-9
    && breakEvenPrice <= bounds.priceMax + 1e-9;

  const warnings = [
    'Prices and CAPEX are screening assumptions, not quotes or permits.',
    bounds.note,
  ];
  const rateText = trial => (trial?.rate != null ? ` at ${trial.rate} kg/day` : '');
  let note;
  if (midMet) {
    note = `Cash-positive at mid-band screening ${product} $${mid.price}/kg × CAPEX factor 1`
      + rateText(mid)
      + ` (midCash ${formatMoney(mid.annualNetCash)}/y). ${bounds.note}`;
  } else if (best?.met) {
    note = `Cash-positive only at screening band edge ${product} $${best.price}/kg × CAPEX factor ${best.capexFactor}`
      + rateText(best)
      + ` (bestCash ${formatMoney(best.annualNetCash)}/y); mid-band $${Number.isFinite(midPrice) ? midPrice : bounds.priceMin}/kg × CAPEX 1 cash ${formatMoney(mid?.annualNetCash)}/y. Not ranked as cash+. Not an invented fuel winner. ${bounds.note}`;
    warnings.push(`Edge-of-band cash+ (CAPEX factor ${best.capexFactor}) is not a mid-band rank.`);
  } else {
    const beText = Number.isFinite(breakEvenPrice)
      ? `diagnostic breakEvenPrice $${formatMoney(breakEvenPrice)}/kg at sized plant / CAPEX factor 1`
        + (inBand ? ' (inside screening band)' : ' (outside screening band)')
      : `no price break-even inside $${DEFAULT_PRICE_MIN}–$${DEFAULT_PRICE_MAX}/kg at CAPEX factor 1`;
    note = `No cash-positive fuel slate inside screening ${product} $${bounds.priceMin}`
      + (bounds.priceMax !== bounds.priceMin ? `–$${bounds.priceMax}` : '')
      + `/kg × CAPEX factor ${bounds.capexMin}–${bounds.capexMax}`
      + ` (bestCash ${formatMoney(best?.annualNetCash)}/y; ${beText}). Not an invented fuel winner. ${bounds.note}`;
    warnings.push(`No cash-positive price×CAPEX trial inside screening bounds for ${product}.`);
  }

  if (seedSnapshot && JSON.stringify(caseOrBuilder) !== seedSnapshot) {
    throw new Error('probeFuelCash mutated the input definition');
  }

  const reported = ranked || best;
  return {
    product,
    met: midMet,
    midMet,
    midCash: mid?.annualNetCash ?? null,
    bestCash: best?.annualNetCash ?? null,
    breakEvenPrice,
    breakEvenPriceInBand: Boolean(inBand),
    mid: summarizeTrial(mid),
    best: summarizeTrial(best),
    bounds,
    curve,
    objective: reported?.objective || null,
    economics: reported?.economics || null,
    selected: reported?.selected || null,
    label: SCREENING_LABEL,
    note,
    warnings,
  };
}

return { findFuelBreakEven, probeFuelCash, fuelScreeningBounds };
});
