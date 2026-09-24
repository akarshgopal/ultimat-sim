#!/usr/bin/env node
/**
 * Material × purchased-power break-even ($/kWh) for abundance heroes.
 *
 * For each sale material M:
 *   1. Hero site = max M tonnes among cash+ abundance sites (else max tonnes overall).
 *   2. Build abundance plant (same wiring as engine/site-search.js), size once,
 *      freeze capacities.
 *   3. Solo-sale: only M sinks keep TEA unitPrice; other sale sinks → unitPrice=0.
 *   4. Purchased-power: electricity-source / power / electricity nodes get
 *      economics.unitCost = p ($/kWh) and PV installedCapex / capexRate / fixedOM
 *      cleared so PV CAPEX is not double-counted with grid purchase.
 *   5. Bisect p where annualNetCash (R − OPEX − annualized CAPEX) crosses 0.
 *
 * Screening TEA bindSale prices by site region; not bankable quotes.
 * Usage: node scripts/material-power-breakeven.mjs [--fast] [--cache path]
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const {
  buildAbundancePlant,
  defaultSearchSites,
  searchAbundanceSites,
  SEARCH_SCALES,
  SEARCH_RATES,
  FAST_SCALES,
  FAST_RATES,
  NO_GRID_POWER_USD_PER_KWH,
} = require('../engine/site-search.js');
const { sizeForPositiveCashflow } = require('../engine/size.js');
const { evaluateEconomics, scorePositiveCashflow } = require('../engine/economics.js');

const CHILE_ISH_POWER = 0.07;
const NO_GRID_POWER = NO_GRID_POWER_USD_PER_KWH || 0.5;
const BISECT_ITERS = 56;
const P_MAX_DEFAULT = 2;
const P_MAX_EXTEND = 50;
const CASH_EPS = 1e-3;

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

function parseArgs(argv) {
  const opts = { fast: false, cache: '.hunt-run/site-search-top20.json' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fast') opts.fast = true;
    else if (arg === '--cache') opts.cache = argv[++i];
    else if (arg.startsWith('--cache=')) opts.cache = arg.slice('--cache='.length);
    else if (arg === '--no-cache') opts.cache = null;
    else if (arg === '--help' || arg === '-h') opts.help = true;
  }
  return opts;
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

function tonnesOfMaterial(row, sinkIds) {
  const want = new Set(sinkIds);
  let tonnes = 0;
  for (const product of row.products || []) {
    if (want.has(product.id)) tonnes += Number(product.tonnesPerYear) || 0;
  }
  // Fallback: slate keys sometimes use chemical ids
  return tonnes;
}

function pickHero(rows, material) {
  const producers = rows.filter(row => tonnesOfMaterial(row, material.sinks) > 0);
  const cashPlus = producers.filter(row => row.met || row.feasible || (Number(row.annualNetCash) > 0));
  const pool = cashPlus.length ? cashPlus : producers;
  if (!pool.length) return null;
  pool.sort((a, b) => {
    const ta = tonnesOfMaterial(a, material.sinks);
    const tb = tonnesOfMaterial(b, material.sinks);
    if (tb !== ta) return tb - ta;
    return (Number(b.annualNetCash) || 0) - (Number(a.annualNetCash) || 0);
  });
  const hero = pool[0];
  return {
    siteId: hero.siteId,
    siteName: hero.siteName,
    process: hero.template || 'abundance',
    tonnesPerYear: tonnesOfMaterial(hero, material.sinks),
    pvMultiCash: hero.annualNetCash,
    pvCashPositive: Boolean(hero.met || hero.feasible || hero.annualNetCash > 0),
    fromCashPlusPool: cashPlus.length > 0,
  };
}

function loadOrSearch(opts) {
  if (opts.cache) {
    const path = resolve(process.cwd(), opts.cache);
    if (existsSync(path)) {
      const cached = JSON.parse(readFileSync(path, 'utf8'));
      const ranking = cached.ranking || [];
      const nearMisses = cached.nearMisses || [];
      return {
        source: `cache:${opts.cache}`,
        rows: [...ranking, ...nearMisses],
        ranking,
        nearMisses,
        feasibleCount: cached.feasibleCount,
        notes: cached.notes,
      };
    }
  }
  const sizeOpts = opts.fast
    ? { scales: FAST_SCALES.slice(), rates: FAST_RATES.slice() }
    : { scales: SEARCH_SCALES.slice(), rates: SEARCH_RATES.slice() };
  const result = searchAbundanceSites({
    sites: defaultSearchSites(),
    path: 'materials',
    topN: 50,
    nearMisses: true,
    sizeOpts,
  });
  return {
    source: opts.fast ? 'searchAbundanceSites:fast' : 'searchAbundanceSites:full',
    rows: [...(result.ranking || []), ...(result.nearMisses || [])],
    ranking: result.ranking || [],
    nearMisses: result.nearMisses || [],
    feasibleCount: result.feasibleCount,
    notes: result.notes,
  };
}

function cashAt(frozenDefinition, solved, sinkIds, p) {
  const definition = clone(frozenDefinition);
  applySoloSale(definition, sinkIds);
  applyPurchasedPower(definition, p);
  const economics = evaluateEconomics(definition, solved);
  const score = scorePositiveCashflow(economics);
  return {
    annualNetCash: score.annualNetCash,
    annualRevenue: economics.annualRevenue,
    annualOperatingCost: economics.annualOperatingCost,
    annualizedCapex: economics.annualizedCapex,
    installedCapex: economics.installedCapex,
    sourcePurchases: economics.breakdown?.sourcePurchases ?? null,
  };
}

function bisectBreakEven(frozenDefinition, solved, sinkIds, pMaxStart = P_MAX_DEFAULT) {
  const at0 = cashAt(frozenDefinition, solved, sinkIds, 0);
  let pMax = pMaxStart;
  let atMax = cashAt(frozenDefinition, solved, sinkIds, pMax);

  // Extend upper bound while cash still positive at high p (cheap power relative to solo revenue).
  while (at0.annualNetCash > 0 && atMax.annualNetCash > 0 && pMax < P_MAX_EXTEND) {
    pMax = Math.min(P_MAX_EXTEND, pMax * 2);
    atMax = cashAt(frozenDefinition, solved, sinkIds, pMax);
  }

  const context = {
    cashAt0: at0.annualNetCash,
    cashAt007: cashAt(frozenDefinition, solved, sinkIds, CHILE_ISH_POWER).annualNetCash,
    cashAt050: cashAt(frozenDefinition, solved, sinkIds, NO_GRID_POWER).annualNetCash,
    at0,
    atMax,
    pMax,
  };

  if (!(at0.annualNetCash > 0) && !(atMax.annualNetCash > 0)) {
    return {
      ...context,
      breakEven: null,
      status: 'no-flip-always-negative',
      reason: at0.annualNetCash <= 0
        ? 'Solo-sale annualNetCash ≤ 0 even at p=0 (purchased power free); process CAPEX/OPEX alone dominates TEA revenue for this material at the frozen hero scale.'
        : 'Cash never crossed zero in band.',
    };
  }
  if (at0.annualNetCash > 0 && atMax.annualNetCash > 0) {
    return {
      ...context,
      breakEven: null,
      status: 'no-flip-always-positive',
      reason: `Solo-sale annualNetCash > 0 even at p=$${pMax}/kWh (band high). Revenue covers process CAPEX + power purchase in this band.`,
    };
  }
  if (!(at0.annualNetCash > 0) && atMax.annualNetCash > 0) {
    // Pathological: cash rises with power price — should not happen with unitCost.
    return {
      ...context,
      breakEven: null,
      status: 'non-monotonic',
      reason: 'Cash increased with power price; purchased-power transform may be mis-wired.',
    };
  }

  // at0 > 0, atMax ≤ 0 → classic flip
  let lo = 0;
  let hi = pMax;
  let loCash = at0.annualNetCash;
  let hiCash = atMax.annualNetCash;
  for (let i = 0; i < BISECT_ITERS; i += 1) {
    const mid = (lo + hi) / 2;
    const midCash = cashAt(frozenDefinition, solved, sinkIds, mid).annualNetCash;
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

function sizeHero(site, opts) {
  const definition = buildAbundancePlant(site);
  const sizeOpts = opts.fast
    ? { scales: FAST_SCALES.slice(), rates: FAST_RATES.slice() }
    : { scales: SEARCH_SCALES.slice(), rates: SEARCH_RATES.slice() };
  return sizeForPositiveCashflow({
    definition,
    scales: sizeOpts.scales,
    rates: sizeOpts.rates,
  });
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('Usage: node scripts/material-power-breakeven.mjs [--fast] [--cache path|--no-cache]');
    process.exit(0);
  }

  const hunt = loadOrSearch(opts);
  const sitesById = new Map(defaultSearchSites().map(site => [site.id, site]));
  const sizedCache = new Map();

  const rows = [];
  for (const material of MATERIALS) {
    const hero = pickHero(hunt.rows, material);
    if (!hero) {
      rows.push({
        material: material.id,
        heroSiteId: null,
        process: 'abundance',
        baselineAnnualNetCashAtP0: null,
        breakEvenUsdPerKWh: null,
        cashAt007: null,
        cashAt050: null,
        notes: 'No site in hunt produced this material at >0 tonnes.',
      });
      continue;
    }
    const site = sitesById.get(hero.siteId);
    if (!site) {
      rows.push({
        material: material.id,
        heroSiteId: hero.siteId,
        process: hero.process,
        baselineAnnualNetCashAtP0: null,
        breakEvenUsdPerKWh: null,
        cashAt007: null,
        cashAt050: null,
        notes: `Hero site ${hero.siteId} not in defaultSearchSites().`,
        hero,
      });
      continue;
    }

    let sized = sizedCache.get(hero.siteId);
    if (!sized) {
      sized = sizeHero(site, opts);
      sizedCache.set(hero.siteId, sized);
    }

    const result = bisectBreakEven(sized.definition, sized.solved, material.sinks);
    const notes = [
      `Hero: max ${material.id} tonnes among ${hero.fromCashPlusPool ? 'cash+' : 'all (no cash+ producer)'} sites → ${hero.tonnesPerYear.toFixed(2)} t/y.`,
      `PV multi-product baseline cash $${Number(hero.pvMultiCash).toFixed(0)}/y (cash${hero.pvCashPositive ? '+' : '−'}).`,
      `Sized selected=${JSON.stringify(sized.selected)}; freeze capacities then solo-sale + purchased-power econ-only.`,
      result.reason || result.status,
    ];
    rows.push({
      material: material.id,
      heroSiteId: hero.siteId,
      heroSiteName: hero.siteName,
      process: hero.process,
      heroTonnesPerYear: hero.tonnesPerYear,
      pvMultiProductCash: hero.pvMultiCash,
      baselineAnnualNetCashAtP0: result.cashAt0,
      breakEvenUsdPerKWh: result.breakEven,
      cashAt007: result.cashAt007,
      cashAt050: result.cashAt050,
      status: result.status,
      pMaxProbed: result.pMax,
      revenueAtP0: result.at0?.annualRevenue ?? null,
      annualizedCapexAtP0: result.at0?.annualizedCapex ?? null,
      notes: notes.join(' '),
    });
  }

  const report = {
    label: 'screening',
    tipNote: 'Material purchased-power break-even; solo-sale; PV CAPEX stripped.',
    method: {
      flipMetric: 'annualNetCash = R − OPEX − annualized CAPEX (Foundry gate)',
      powerModel: 'Purchased: electricity-source/power/electricity unitCost=p $/kWh; clear installedCapex/capexRate/fixedOM (no PV+grid double-count). Process CAPEX/OPEX and TEA sale prices retained.',
      soloSale: 'Only material sinks keep bindSale unitPrice; other sale sinks unitPrice=0.',
      sizing: opts.fast
        ? `sizeForPositiveCashflow FAST scales=${JSON.stringify(FAST_SCALES)} rates=${JSON.stringify(FAST_RATES)}; freeze then econ-only sweep`
        : `sizeForPositiveCashflow SEARCH scales=${JSON.stringify(SEARCH_SCALES)} rates=${JSON.stringify(SEARCH_RATES)}; freeze then econ-only sweep`,
      heroPick: 'Max material tonnes among cash+ abundance sites; else max tonnes overall.',
      contextPrices: { chileIsh: CHILE_ISH_POWER, noGrid: NO_GRID_POWER },
      huntSource: hunt.source,
      feasibleCount: hunt.feasibleCount,
    },
    caveats: [
      'Solo-sale zeros co-product revenue: flip points are product-specific, not co-product contribution-margin aliases. A material that only pencils with co-products will show no-flip / always-negative.',
      'Baseline abundance is PV-CAPEX powered; this sensitivity replaces PV TIC/fixedOM with a purchased $/kWh so power cost is not double-counted.',
      'Prices are cited tea-screening bindSale mid bands by site region — screening offtake, not contracts or vendor quotes.',
      'Hero scale is the multi-product cash maximizer size, frozen before solo-sale; not re-optimized for the single product.',
    ],
    rows,
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
