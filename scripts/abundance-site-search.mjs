#!/usr/bin/env node
/**
 * Discrete multi-site abundance search: maximize positive-sale tonnes s.t. cash>0.
 * Prints one JSON object to stdout. Exit 0 even when feasibleCount is 0.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  searchAbundanceSites,
  defaultSearchSites,
  FAST_SCALES,
  FAST_RATES,
  SEARCH_SCALES,
  SEARCH_RATES,
  PLANT_TEMPLATES,
  MATERIALS_TEMPLATES,
  FUEL_TEMPLATES,
  RIGHTS_SCENARIOS,
} = require('../engine/site-search.js');

function parseList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const opts = {
    topN: 10,
    templates: undefined,
    siteIds: undefined,
    fast: false,
    nearMisses: true,
    rightsScenario: undefined,
    path: undefined,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--fast') opts.fast = true;
    else if (arg === '--top') opts.topN = Number(next());
    else if (arg.startsWith('--top=')) opts.topN = Number(arg.slice('--top='.length));
    else if (arg === '--templates') opts.templates = parseList(next());
    else if (arg.startsWith('--templates=')) opts.templates = parseList(arg.slice('--templates='.length));
    else if (arg === '--sites') opts.siteIds = parseList(next());
    else if (arg.startsWith('--sites=')) opts.siteIds = parseList(arg.slice('--sites='.length));
    else if (arg === '--rights-scenario') opts.rightsScenario = next();
    else if (arg.startsWith('--rights-scenario=')) opts.rightsScenario = arg.slice('--rights-scenario='.length);
    else if (arg === '--path') opts.path = next();
    else if (arg.startsWith('--path=')) opts.path = arg.slice('--path='.length);
    else if (arg === '--no-near-misses') opts.nearMisses = false;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else {
      console.error(`Unknown flag: ${arg}`);
      opts.help = true;
      opts.unknown = true;
    }
  }
  return opts;
}

function usage() {
  return `Usage: node scripts/abundance-site-search.mjs [options]
  --top N                 ranking length (default 10)
  --path materials|fuels  default materials (${MATERIALS_TEMPLATES.join(',')}); fuels = ${FUEL_TEMPLATES.join(',')}
  --templates a,b,c       subset of ${PLANT_TEMPLATES.join(',')} (overrides --path)
  --sites id,id           subset of default search sites (Dead Sea + SITE_PRESETS)
  --fast                  tiny scales/rates for CI
  --no-near-misses        omit cash<=0 rows
  --rights-scenario s     ${RIGHTS_SCENARIOS.join(' | ')} (default screening-assumes-intake-concession)
`;
}

const args = parseArgs(process.argv);
if (args.help) {
  console.error(usage());
  process.exit(args.unknown ? 1 : 0);
}

let sites = defaultSearchSites();
if (args.siteIds) {
  const wanted = new Set(args.siteIds);
  sites = sites.filter(site => wanted.has(site.id));
}

const result = searchAbundanceSites({
  sites,
  templates: args.templates,
  path: args.path,
  topN: Number.isFinite(args.topN) && args.topN > 0 ? args.topN : 10,
  nearMisses: args.nearMisses,
  rightsScenario: args.rightsScenario,
  sizeOpts: args.fast
    ? { scales: FAST_SCALES.slice(), rates: FAST_RATES.slice() }
    : { scales: SEARCH_SCALES.slice(), rates: SEARCH_RATES.slice() },
});

result.cli = {
  fast: args.fast,
  topN: Number.isFinite(args.topN) ? args.topN : 10,
  path: result.path,
  templates: result.templates.slice(),
  sites: sites.map(site => site.id),
  rightsScenario: result.rightsScenario,
};

console.log(JSON.stringify(result, null, 2));
process.exit(0);
