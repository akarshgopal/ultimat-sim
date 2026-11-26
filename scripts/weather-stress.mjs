#!/usr/bin/env node
// Weather stress test of the abundance scoreboard. Plants are designed on 12 typical solar days per
// site (engine/utilization.js). This replays each best-site plant hour by hour through ten real
// years of PVGIS-ERA5 output (data/weather-hourly.js, rescaled to the site's annual yield so only
// the weather pattern differs) and reports the output it really reaches, how often its firmed units
// trip below minimum turndown, and its cost per kg once capital and fixed costs are spread over
// that output.
//
//   node scripts/weather-stress.mjs            # today and frontier
//   node scripts/weather-stress.mjs --json     # machine-readable
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = require(path.join(ROOT, 'engine/company.js'));
const U = require(path.join(ROOT, 'engine/utilization.js'));
const Bom = require(path.join(ROOT, 'data/bom.js'));
const { PATHWAYS } = require(path.join(ROOT, 'data/pathways.js'));
const { MARKETS } = require(path.join(ROOT, 'data/markets.js'));
const { SITES } = require(path.join(ROOT, 'data/sites.js'));
const { WEATHER } = require(path.join(ROOT, 'data/weather-hourly.js'));

// Month (0–11) of every hour of the series (local solar time from 1 January of the first year).
let monthOfHour = null;
function months(n) {
  if (monthOfHour?.length === n) return monthOfHour;
  monthOfHour = new Uint8Array(n);
  const t0 = Date.UTC(WEATHER.startYear, 0, 1);
  for (let h = 0; h < n; h += 1) monthOfHour[h] = new Date(t0 + h * 3600e3).getUTCMonth();
  return monthOfHour;
}

// Hourly kW per kWp at a site, rescaled so its mean daily yield equals the site's frozen yield.
const seriesCache = new Map();
export function hourlySeries(site) {
  if (seriesCache.has(site.id)) return seriesCache.get(site.id);
  const w = WEATHER.sites[site.id];
  if (!w) return null;
  const raw = new Uint16Array(Buffer.from(w.data, 'base64').buffer.slice(0));
  const scale = site.pvKWhPerKWpDay / w.meanKWhPerKWpDay / 1000;
  const g = Float64Array.from(raw, x => x * scale);
  seriesCache.set(site.id, g);
  return g;
}

function leanUnits() {
  const units = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'engine/designs')).filter(f => f.endsWith('.js'))) {
    const M = require(path.join(ROOT, 'engine/designs', f));
    Object.assign(units, M.simulatorOverride(M.PRESETS.lean.params));
  }
  return units;
}

export function stress(config, sizeMultiple = 100) {
  const input = { pathways: PATHWAYS, markets: MARKETS, sites: SITES, config };
  const cfg = C.mergeConfig(config);
  const board = C.abundanceScoreboard(input, { sizeMultiple });
  const rows = [];
  for (const r of board.rows) {
    if (!r.pathwayId || !r.siteId || r.lcopUsdPerKg === undefined) continue;
    const site = SITES.find(s => s.id === r.siteId);
    const g = hourlySeries(site);
    const pathway = PATHWAYS.find(p => p.id === r.pathwayId);
    const size = Math.min(cfg.build.maxPlantKgPerDay, pathway.refOutputKgPerDay * sizeMultiple);
    const ev = C.evaluateAtYear(input, r.pathwayId, r.siteId, size, 0);
    const blocks = ev?.utilization?.blocks;
    if (!g || !blocks) { rows.push({ ...pick(r), weather: null }); continue; }
    const real = U.replayWeather(blocks, g, months(g.length));
    const firming = firmUp(blocks, g, ev, cfg);
    const design = ev.utilization.outputFactor;
    // Capital and fixed costs (energy + equipment lines) spread over the output actually reached.
    const fixed = r.costBreakdownUsdPerKg.energy + r.costBreakdownUsdPerKg.equipment;
    const lcop = r.lcopUsdPerKg + fixed * (design / Math.max(real.outputFactor, 1e-6) - 1);
    const firmedLcop = firming ? lcop + firming.usdPerKg : lcop;
    rows.push({ ...pick(r), weather: { designOutputFactor: design, realOutputFactor: real.outputFactor, trippedHours: real.trippedHours, tripDayShare: real.tripDayShare, strategy: ev.utilization.strategy, lcopUsdPerKg: lcop, costRatio: lcop / r.priceUsdPerKg, firming, firmedLcopUsdPerKg: firmedLcop, firmedCostRatio: firmedLcop / r.priceUsdPerKg } });
  }
  const total = board.totals.worldDemandT;
  const feasible = rows => rows.filter(r => r.status === 'feasible' || r.status === 'abundant');
  const ok = r => r.status === 'feasible' || r.status === 'abundant';
  // Real weather can only take a row away: it must be feasible on typical days too.
  const weatherFeasibleT = rows.reduce((t, r) => t + (ok(r) && (!r.weather || r.weather.costRatio <= 1) ? r.worldDemandT : 0), 0);
  const firmedT = rows.reduce((t, r) => t + (ok(r) && (!r.weather || r.weather.firmedCostRatio <= 1) ? r.worldDemandT : 0), 0);
  return {
    rows,
    typicalFeasibleShare: board.totals.feasibleShare,
    weatherFeasibleShare: weatherFeasibleT / total,
    weatherFeasibleFirmedShare: firmedT / total,
    feasibleRows: feasible(rows).length,
  };
}

// The extra storage (batteries, heat store and intermediate buffers, scaled together) that cuts trips
// to at most about one day a year, and what it adds per kg: annualized over the plant life, at the
// design's own storage prices, spread over the output reached.
const TARGET_TRIP_DAY_SHARE = 1 / 365;
function firmUp(blocks, g, ev, cfg) {
  if (!blocks.hasBase) return null;
  const scaled = f => ({
    ...blocks,
    elec: { ...blocks.elec, storeKWh: blocks.elec.storeKWh * f },
    heat: { ...blocks.heat, storeKWh: blocks.heat.storeKWh * f },
    buffers: blocks.buffers.map(b => ({ ...b, capKg: b.capKg * f })),
  });
  const trips = f => U.replayWeather(scaled(f), g, months(g.length)).tripDayShare;
  if (trips(1) <= TARGET_TRIP_DAY_SHARE) return { storeMultiplier: 1, usdPerKg: 0, reached: true };
  let hi = 2;
  while (hi < 64 && trips(hi) > TARGET_TRIP_DAY_SHARE) hi *= 2;
  const reached = trips(hi) <= TARGET_TRIP_DAY_SHARE;
  let lo = hi / 2;
  if (reached) for (let i = 0; i < 12; i += 1) { const mid = (lo + hi) / 2; if (trips(mid) <= TARGET_TRIP_DAY_SHARE) hi = mid; else lo = mid; }
  const storeUsd = (ev.utilization.batteryUsd || 0) + (ev.utilization.thermalUsd || 0) + (ev.utilization.bufferUsd || 0);
  const crf = 1 / C.annuityFactor(cfg.finance.discountRate, ev.lifeYears);
  const usdPerKg = (hi - 1) * storeUsd * crf / ev.annualKg;
  return { storeMultiplier: hi, usdPerKg, reached };
}

function pick(r) {
  return { key: r.key, product: r.product, worldDemandT: r.worldDemandT, status: r.status, pathwayId: r.pathwayId, siteId: r.siteId, lcopUsdPerKg: r.lcopUsdPerKg, costRatio: r.costRatio };
}

export function frontierConfig() {
  const D = C.DEFAULTS;
  return {
    pv: { capexUsdPerKWp: D.pv.capexUsdPerKWp / 10, floorUsdPerKWp: D.pv.floorUsdPerKWp / 10 },
    idiotIndex: { target: 1.5, floors: Bom.floors() },
    designs: { units: leanUnits() },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = { today: stress({}), frontier: stress(frontierConfig()) };
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 1));
  } else {
    for (const [name, s] of Object.entries(out)) {
      console.log(`\n## ${name}: feasible share ${(s.typicalFeasibleShare * 100).toFixed(1)}% on typical days → ${(s.weatherFeasibleShare * 100).toFixed(1)}% on real weather`);
      console.log(`   firmed to ≤ 1 trip day a year: ${(s.weatherFeasibleFirmedShare * 100).toFixed(1)}%`);
      console.log('material'.padEnd(22), 'site'.padEnd(20), 'strategy'.padEnd(14), 'output typ→real', 'trip days', 'cost/price typ→real', 'store × to firm', 'firmed cost/price');
      for (const r of s.rows.filter(x => x.weather).sort((a, b) => b.worldDemandT - a.worldDemandT)) {
        const w = r.weather;
        console.log((r.key || r.product).padEnd(22), r.siteId.padEnd(20), w.strategy.padEnd(14),
          `${(w.designOutputFactor * 100).toFixed(0)}% → ${(w.realOutputFactor * 100).toFixed(0)}%`.padEnd(15),
          `${(w.tripDayShare * 100).toFixed(1)}%`.padEnd(9),
          `${r.costRatio.toFixed(2)} → ${w.costRatio.toFixed(2)}`.padEnd(19),
          (w.firming ? `${w.firming.storeMultiplier.toFixed(1)}×${w.firming.reached ? '' : ' (not reached)'}` : '—').padEnd(15),
          w.firmedCostRatio.toFixed(2));
      }
    }
  }
}
