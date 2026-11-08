// Run the company build-out simulator from the command line.
//
//   node scripts/company.mjs                          # default 25-year run
//   node scripts/company.mjs --years 15 --equity 1e8  # override a few knobs
//   node scripts/company.mjs --config scenario.json   # full config override (see engine/company.js DEFAULTS)
//   node scripts/company.mjs --rank                   # year-0 opportunity ranking only
//   node scripts/company.mjs --json                   # machine-readable result
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const Company = require('../engine/company.js');
const { PATHWAYS } = require('../data/pathways.js');
const { MARKETS } = require('../data/markets.js');
const { SITES } = require('../data/sites.js');

const FLAGS = {
  '--years': (cfg, v) => { cfg.years = Number(v); },
  '--start': (cfg, v) => { cfg.startYear = Number(v); },
  '--equity': (cfg, v) => { (cfg.finance ||= {}).initialEquityUsd = Number(v); },
  '--debt': (cfg, v) => { (cfg.finance ||= {}).debtFraction = Number(v); },
  '--share': (cfg, v) => { (cfg.build ||= {}).maxMarketShare = Number(v); },
  '--site-gw': (cfg, v) => { (cfg.build ||= {}).maxPvGWpPerSite = Number(v); },
  '--pv': (cfg, v) => { (cfg.pv ||= {}).capexUsdPerKWp = Number(v); },
  '--only': (cfg, v) => { (cfg.build ||= {}).allowPathways = v.split(','); },
};

function parseArgs(argv) {
  const config = {};
  const opts = { rank: false, json: false, sizeMultiple: 1000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--rank') opts.rank = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--size') opts.sizeMultiple = Number(argv[++i]);
    else if (arg === '--config') Object.assign(config, JSON.parse(readFileSync(argv[++i], 'utf8')));
    else if (FLAGS[arg]) FLAGS[arg](config, argv[++i]);
    else throw new Error(`Unknown argument ${arg}`);
  }
  return { config, opts };
}

const money = usd => {
  const abs = Math.abs(usd);
  if (abs >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(usd / 1e3).toFixed(0)}k`;
  return `$${usd.toFixed(2)}`;
};

const { config, opts } = parseArgs(process.argv.slice(2));
const input = { pathways: PATHWAYS, markets: MARKETS, sites: SITES, config };

if (opts.rank) {
  const rows = Company.rankOpportunities(input, { sizeMultiple: opts.sizeMultiple });
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 1));
  } else {
    console.log('pathway             product               best site                 $/kg cost  $/kg price  NPV/capex');
    for (const r of rows) {
      console.log(`${r.pathwayId.padEnd(20)}${r.product.padEnd(22)}${r.siteId.padEnd(26)}${r.lcopUsdPerKg.toFixed(3).padStart(9)}${r.priceUsdPerKg.toFixed(3).padStart(12)}${r.profitabilityIndex.toFixed(2).padStart(11)}`);
    }
  }
} else {
  const result = Company.simulateCompany(input);
  if (opts.json) {
    console.log(JSON.stringify({ summary: result.summary, timeline: result.timeline, plants: result.plants }, null, 1));
  } else {
    const s = result.summary;
    console.log(`${s.years} years · ${s.plants} plants · capex ${money(s.totalCapexUsd)} · final revenue ${money(s.finalRevenueUsd)}/y · net assets ${money(s.finalNetAssetsUsd)} · PV ${s.finalPvGWp.toFixed(1)} GWp · land ${(s.finalLandHa / 100).toFixed(0)} km²`);
    console.log('\nyear   revenue      opex     capex      cash    plants   PV GWp');
    for (const y of result.timeline) {
      console.log(`${y.year}  ${money(y.revenueUsd).padStart(8)}  ${money(y.opexUsd).padStart(8)}  ${money(y.capexUsd).padStart(8)}  ${money(y.cashUsd).padStart(8)}  ${String(y.plantsTotal).padStart(7)}  ${y.pvGWp.toFixed(2).padStart(7)}`);
    }
    const bySite = {};
    for (const p of result.plants) bySite[`${p.pathwayId} @ ${p.siteId}`] = (bySite[`${p.pathwayId} @ ${p.siteId}`] || 0) + 1;
    console.log('\nplants built:');
    for (const [key, n] of Object.entries(bySite).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${key}`);
  }
}
