#!/usr/bin/env node
// Reduce every screening case in cases/*.js to per-kg-product "pathway" recipes for the
// multi-year company build-out simulator (which must not re-solve flowsheets each year).
//
// For each case factory: build the definition, solveOperation(), evaluateEconomics(), and
// emit one row per (case, primary sale product), normalized per kg of primary product at
// the baseline solve. Writes data/pathways.js (UMD: module.exports / globalThis.FoundryPathways).
//
//   node scripts/build-pathways.mjs          # regenerate data/pathways.js
//   node scripts/build-pathways.mjs --check  # exit 1 if data/pathways.js is stale
//
// Primary product rule: every sale sink whose TEA price key engine/size.js sizeToProduct()
// accepts for that case (PRODUCT_ALIASES / RATIO_ISLANDS) and that earns >= 2% of plant
// revenue; if none, the highest-revenue sale. Cases with several primaries get one row each,
// id `<stem>-<product>`, each carrying the whole plant normalized to that product.
//
// Instrumentation: while factories run, tea.bindSale/bindCost/bindCapexPack are wrapped
// (and restored afterwards) only to tag each bound economics object with its TEA key and to
// record the region the case passes, so sale products and feed ids come from the case's own
// bindings rather than from price matching. Engine numbers are untouched.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'data', 'pathways.js');
export const SCHEMA_VERSION = 1;

const { solveOperation } = require(path.join(ROOT, 'engine/solve.js'));
const { evaluateEconomics } = require(path.join(ROOT, 'engine/economics.js'));
const { streamMassKg } = require(path.join(ROOT, 'engine/model.js'));
const { sizeToProduct } = require(path.join(ROOT, 'engine/size.js'));
const tea = require(path.join(ROOT, 'data/tea-screening.js'));
const pvgisSites = fs.readFileSync(path.join(ROOT, 'data/pvgis-sites.js'), 'utf8');

const SKIP = {
  'dac.js': 'test fixture (DAC unit harness), not a production plant',
  'network.js': 'aggregates other cases into a site network; its member plants are already rows',
};

const NAMES = {
  'abundance.js': 'Dead Sea brine minerals hub (DLE Li, salt, Br2, Mg, potash, chlor-alkali, NH3)',
  'bioforge.js': 'Gluconic acid + H2O2 from purchased dextrose (Bioforge)',
  'cement.js': 'Clinker from purchased limestone + clay',
  'coastal.js': 'Coastal e-methane (DAC + SWRO + PEM + Sabatier), Almeria',
  'cu-ew.js': 'Copper cathode by SX-EW from purchased PLS',
  'float-glass.js': 'Float glass from purchased sand, soda ash + limestone',
  'ft-liquids.js': 'FT diesel from purchased H2 + CO2',
  'green-ammonia.js': 'Green ammonia (SWRO + PEM + ASU + Haber-Bosch)',
  'green-hydrogen.js': 'Green hydrogen (SWRO + PEM electrolysis)',
  'green-ft.js': 'Green FT diesel (SWRO + PEM H2, purchased CO2)',
  'green-h2-dri.js': 'Green H2-DRI iron (SWRO + PEM H2, purchased ore)',
  'green-mto.js': 'Green ethylene via methanol-to-olefins (SWRO + PEM, purchased CO2)',
  'green-urea.js': 'Green urea (SWRO + PEM + ASU + NH3, purchased CO2)',
  'h2-dri.js': 'H2-DRI iron from purchased H2 + iron ore',
  'maglut.js': 'Separated NdPr oxide by chromatography (purchased REO concentrate)',
  'methanol.js': 'Coastal e-methanol (DAC + SWRO + PEM), Mejillones',
  'mto.js': 'Ethylene from purchased methanol (MTO)',
  'ree-sx.js': 'Separated NdPr oxide by solvent extraction (purchased REO concentrate)',
  'ree.js': 'Mixed REO + NdPr from ionic-clay heap leach (Minacu)',
  'sabatier.js': 'Reference e-methane (DAC + SWRO + PEM + Sabatier) on grid power',
  'silicon.js': 'PV modules from quartz + bauxite chain (MG-Si, polysilicon, Al)',
  'ti-kroll.js': 'Titanium sponge by Kroll from purchased TiCl4 + Mg',
  'urea.js': 'Urea from purchased NH3 + CO2',
};

// TEA sale key -> sizeToProduct alias (engine/size.js PRODUCT_ALIASES).
const SIZE_ALIAS = {
  methane: 'methane', hydrogen: 'h2', methanol: 'methanol', ammonia: 'ammonia', lithium: 'lithium',
  salt: 'salt', 'pv-module': 'pv-module', steel: 'steel', ethylene: 'ethylene', diesel: 'diesel',
  urea: 'urea', titanium: 'titanium', 'float-glass': 'float-glass', cement: 'cement',
  'copper-cathode': 'copper-cathode', 'ndpr-oxide-separated': 'ndpr-oxide-separated', 'ndpr-oxide': 'ndpr-oxide',
};
const PRIMARY_MIN_REVENUE_SHARE = 0.02;

// Feed origin by TEA cost key / sourcePreset / node id (first match wins).
const ORIGIN = {
  seawater: 'ocean',
  brine: 'brine',
  air: 'air', oxygen: 'air',
  water: 'water',
  limestone: 'crust', 'kiln-clay': 'crust', 'silica-sand': 'crust', 'soda-ash': 'crust', 'iron-ore': 'crust',
  ironore: 'crust', quartz: 'crust', bauxite: 'crust', 'ionic-clay': 'crust', salt: 'crust', 'salt-feed': 'crust',
};
const INFINITE_ORIGINS = new Set(['ocean', 'brine', 'air', 'crust', 'water']);
const ON_SITE_ORIGINS = new Set(['ocean', 'brine', 'air']);

function techClass(unit = '') {
  const u = String(unit).toLowerCase();
  if (/electroly|chlor-alkali|pem|alkaline/.test(u)) return 'electrolyzer';
  if (/^dac|gas-blower/.test(u)) return 'dac';
  if (/swro|^med|^msf|intake-pump|desal/.test(u)) return 'desal';
  if (/battery|tank|buffer|storage/.test(u)) return 'storage';
  return 'process';
}

// 7 significant figures: relative rounding error <= 5e-7, so recipe x refOutputKgPerDay
// reproduces the solved totals within 1e-6 (6 s.f. would allow up to 5e-6).
const SIG_FIGS = 7;

function roundSig(value) {
  if (value == null) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) < 1e-12) return 0;
  return Number(n.toPrecision(SIG_FIGS));
}

function deepRound(value) {
  if (typeof value === 'number') return roundSig(value);
  if (Array.isArray(value)) return value.map(deepRound);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepRound(v);
    return out;
  }
  return value;
}

function pvgisFileKeys() {
  const block = pvgisSites.match(/FILES\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
  const keys = [];
  const files = {};
  if (block) {
    for (const m of block[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) { keys.push(m[1]); files[m[1]] = m[2]; }
  }
  return { keys, files };
}

// Exact FILES key, else the longest FILES key that prefixes the case site id; aliases that
// point at the same frozen JSON resolve to the canonical (non-dated) key.
// Cases without a map site whose recipe is still tied to one place.
// abundance.js defaults to the Dead Sea brine assay (DEFAULT_ASSAY_ID = 'dead-sea-brine').
const CASE_SITE_FALLBACK = Object.freeze({ 'abundance.js': 'levant-dead-sea' });

function resolveSiteId(siteId) {
  if (!siteId) return null;
  const { keys, files } = pvgisFileKeys();
  let match = keys.includes(siteId) ? siteId : null;
  if (!match) {
    const prefixes = keys.filter(k => siteId.startsWith(k + '-')).sort((a, b) => b.length - a.length);
    match = prefixes[0] || null;
  }
  if (!match) return null;
  const canonical = keys.find(k => files[k] === files[match] && !/pvgis/.test(k));
  return canonical || match;
}

function withTeaInstrumentation(run) {
  const originals = { bindSale: tea.bindSale, bindCost: tea.bindCost, bindCapexPack: tea.bindCapexPack, bindCapex: tea.bindCapex };
  const regions = [];
  const tag = (kind, fn) => function tagged(key, extra) {
    const out = fn.call(this, key, extra);
    if (extra && extra.region != null) regions.push(extra.region);
    if (out && typeof out === 'object') { out.__teaKind = kind; out.__teaKey = key; }
    return out;
  };
  tea.bindSale = tag('sale', originals.bindSale);
  tea.bindCost = tag('cost', originals.bindCost);
  tea.bindCapexPack = tag('pack', originals.bindCapexPack);
  tea.bindCapex = tag('pack', originals.bindCapex);
  try {
    return { result: run(), regions };
  } finally {
    Object.assign(tea, originals);
  }
}

function nodeEconomics(node, config) {
  return { ...(node.params?.economics || {}), ...(node.economics || {}), ...((config.nodes || {})[node.id] || {}) };
}

function streamAmount(stream) {
  if (!stream) return 0;
  if (stream.kind === 'material') return streamMassKg(stream);
  if (stream.kind === 'consumable') return Number(stream.amount) || 0;
  return Number(stream.kWh) || 0;
}

function isPvNode(node) {
  return node.unit === 'electricity-source';
}

function electricityKWh(definition, solved) {
  let total = 0;
  for (const node of definition.graph.nodes) {
    if (node.unit === 'electrical-bus' || /battery/.test(node.unit)) continue;
    const consumed = solved.nodes[node.id]?.consumed?.electricity;
    if (consumed && consumed.kind === 'electricity') total += Number(consumed.kWh) || 0;
  }
  return total;
}

function analyseCase(file, factoryName, factory) {
  const { result: definition, regions } = withTeaInstrumentation(() => factory());
  const solved = solveOperation(definition);
  if (!solved?.convergence?.converged) throw new Error('baseline solve did not converge');
  const econ = evaluateEconomics(definition, solved);
  const config = definition.economics || {};
  const nodes = definition.graph.nodes;
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const periodDays = econ.periodDays;

  // Sales grouped by TEA product key.
  const sales = new Map();
  for (const sink of econ.sinks.filter(s => s.disposition === 'sale')) {
    const key = byId[sink.id]?.economics?.__teaKey ?? null;
    const product = key && tea.prices[key] ? key : null;
    const groupKey = product || sink.id;
    const prev = sales.get(groupKey) || { product, sinkIds: [], kgPerDay: 0, revenuePerDay: 0 };
    prev.sinkIds.push(sink.id);
    prev.kgPerDay += sink.amountPerDay;
    prev.revenuePerDay += sink.annualRevenue / periodDays;
    sales.set(groupKey, prev);
  }
  const totalRevenue = [...sales.values()].reduce((s, x) => s + x.revenuePerDay, 0);
  const sizable = [...sales.entries()].filter(([, s]) => {
    if (!s.product || !SIZE_ALIAS[s.product] || !(s.kgPerDay > 0)) return false;
    try { sizeToProduct({ product: SIZE_ALIAS[s.product], rate: s.kgPerDay, definition: factory() }); return true; } catch { return false; }
  });
  let primaries = sizable.filter(([, s]) => totalRevenue <= 0 || s.revenuePerDay / totalRevenue >= PRIMARY_MIN_REVENUE_SHARE);
  let primaryRule = 'size-to-target product';
  if (!primaries.length) {
    const best = [...sales.entries()].filter(([, s]) => s.kgPerDay > 0).sort((a, b) => b[1].revenuePerDay - a[1].revenuePerDay)[0];
    if (!best) throw new Error('no sale product with positive flow');
    primaries = [best];
    primaryRule = 'highest-revenue sale (no size-to-target product)';
  }

  // Non-PV converters (per-node fold through evaluateEconomics so capex/O&M are the engine's).
  const converters = [];
  let pvCapex = 0;
  for (const node of nodes) {
    const one = evaluateEconomics({ ...definition, graph: { nodes: [node], edges: [] } }, solved);
    const fixedOM = one.breakdown.fixedOM;
    const variableOM = one.breakdown.variableOM;
    if (!(one.installedCapex > 0 || fixedOM > 0 || variableOM > 0)) continue;
    if (isPvNode(node)) { pvCapex += one.installedCapex; continue; }
    const ec = nodeEconomics(node, config);
    const life = Number(ec.assetLifeYears) > 0 ? Number(ec.assetLifeYears) : econ.projectLifeYears;
    converters.push({ id: node.id, cls: techClass(node.unit), capex: one.installedCapex, fixedOM, variableOM, life });
  }
  const nonPvCapex = converters.reduce((s, c) => s + c.capex, 0);
  if (Math.abs(nonPvCapex + pvCapex - econ.installedCapex) > 1e-6 * Math.max(1, econ.installedCapex)) {
    throw new Error(`per-node capex ${nonPvCapex + pvCapex} != engine installedCapex ${econ.installedCapex}`);
  }
  const fixedOM = converters.reduce((s, c) => s + c.fixedOM, 0);
  const variableOMAnnual = converters.reduce((s, c) => s + c.variableOM, 0) + econ.breakdown.disposalCost;
  const capexByTech = { process: 0, electrolyzer: 0, dac: 0, desal: 0, storage: 0 };
  for (const c of converters) capexByTech[c.cls] += c.capex;
  const lifeWeighted = nonPvCapex > 0 ? converters.reduce((s, c) => s + c.capex * c.life, 0) / nonPvCapex : econ.projectLifeYears;

  // Feeds (material + consumable sources) and energy.
  const feeds = [];
  let heatKWh = 0;
  let gridPower = false;
  for (const node of nodes) {
    const r = solved.nodes[node.id] || {};
    const ec = nodeEconomics(node, config);
    if (node.unit === 'heat-source') { heatKWh += streamAmount(r.supplied); continue; }
    if (node.unit === 'electricity-source') { if (ec.unitCost != null && Number(ec.unitCost) > 0) gridPower = true; continue; }
    if (node.unit !== 'material-source' && node.unit !== 'consumable-source') continue;
    const amount = streamAmount(r.supplied);
    const id = node.economics?.__teaKind === 'cost' ? node.economics.__teaKey : (node.sourcePreset || node.id);
    const origin = ORIGIN[id] || ORIGIN[node.sourcePreset] || ORIGIN[node.id] || 'intermediate';
    const purchased = !ON_SITE_ORIGINS.has(origin) && ec.unitCost != null;
    feeds.push({
      id,
      amount,
      usdPerKg: Number(ec.unitCost) || 0,
      freightUsdPerKg: Number(ec.freightUsdPerKg) || 0,
      origin,
      purchased,
      consumable: node.unit === 'consumable-source',
    });
  }
  const elecKWh = electricityKWh(definition, solved);
  const feedMass = feeds.reduce((s, f) => s + f.amount, 0);
  const infiniteMass = feeds.filter(f => INFINITE_ORIGINS.has(f.origin)).reduce((s, f) => s + f.amount, 0);
  const caseNotes = `${definition.site?.notes || ''} ${definition.notes || ''}`;

  const stem = file.replace(/\.js$/, '');
  const siteId = definition.site?.id || null;
  const uniqueRegions = [...new Set(regions)];
  const refRegion = definition.site?.region || definition.region || (uniqueRegions.length === 1 ? uniqueRegions[0] : null);

  return primaries.map(([groupKey, primary]) => {
    const kg = primary.kgPerDay;
    const caveats = [];
    caveats.push(primaryRule === 'size-to-target product' && primaries.length > 1
      ? `one of ${primaries.length} size-to-target primaries (whole plant normalized to ${primary.product})`
      : primaryRule);
    if (/total-energy/.test(caseNotes)) caveats.push('electricity-as-total-energy proxy');
    const purchasedIntermediates = feeds.filter(f => f.origin === 'intermediate' && f.purchased).map(f => f.id);
    if (purchasedIntermediates.length) caveats.push(`purchased ${purchasedIntermediates.join(', ')}`);
    if (gridPower) caveats.push('case buys grid power (no PV CAPEX in case)');
    if (heatKWh > 0) caveats.push('DAC heat bought at screening $/kWh');
    if (feeds.some(f => f.consumable)) caveats.push('consumable makeup counted as kg feed');
    if (feeds.some(f => ON_SITE_ORIGINS.has(f.origin) && f.usdPerKg > 0)) caveats.push('on-site intake keeps the case screening $/kg as usdPerKg');
    if (kg < 50) caveats.push(`demo scale ${roundSig(kg)} kg/day`);
    const coproducts = [...sales.entries()]
      .filter(([k]) => k !== groupKey)
      .map(([k, s]) => ({
        id: s.product || k,
        product: s.product,
        kgPerKg: s.kgPerDay / kg,
        usdPerKg: s.kgPerDay > 0 ? s.revenuePerDay / s.kgPerDay : 0,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      id: primaries.length > 1 ? `${stem}-${primary.product}` : stem,
      name: NAMES[file] || stem,
      product: primary.product,
      case: { file: `cases/${file}`, factory: factoryName },
      refSiteId: resolveSiteId(siteId) ?? CASE_SITE_FALLBACK[file] ?? null,
      refRegion,
      refOutputKgPerDay: kg,
      electricityKWhPerKg: elecKWh / kg,
      heatKWhPerKg: heatKWh / kg,
      feeds: feeds.map(f => ({
        id: f.id, kgPerKg: f.amount / kg, usdPerKg: f.usdPerKg, freightUsdPerKg: f.freightUsdPerKg,
        origin: f.origin, purchased: f.purchased,
      })),
      coproducts,
      capexByTechUsdPerKgDay: Object.fromEntries(Object.entries(capexByTech).map(([k, v]) => [k, v / kg])),
      fixedOmFracPerYear: nonPvCapex > 0 ? fixedOM / nonPvCapex : 0,
      variableOmUsdPerKg: variableOMAnnual / periodDays / kg,
      assetLifeYears: lifeWeighted,
      infiniteSourceShare: feedMass > 0 ? infiniteMass / feedMass : 1,
      quality: 'screening',
      notes: `${NAMES[file] || stem} at ${siteId || 'no map site'}; ${caveats.join('; ')}.`,
    };
  });
}

export function buildPathways() {
  const files = fs.readdirSync(path.join(ROOT, 'cases')).filter(f => f.endsWith('.js') && !f.startsWith('_')).sort();
  const pathways = [];
  const skipped = [];
  let caseCount = 0;
  for (const file of files) {
    if (SKIP[file]) { skipped.push({ file: `cases/${file}`, reason: SKIP[file] }); continue; }
    try {
      const mod = require(path.join(ROOT, 'cases', file));
      const factoryName = Object.keys(mod).find(k => /^create\w*Case$/.test(k));
      if (!factoryName) { skipped.push({ file: `cases/${file}`, reason: 'no create…Case factory export' }); continue; }
      pathways.push(...analyseCase(file, factoryName, mod[factoryName]));
      caseCount += 1;
    } catch (error) {
      skipped.push({ file: `cases/${file}`, reason: `threw: ${error.message}` });
    }
  }
  pathways.sort((a, b) => a.id.localeCompare(b.id));
  return { pathways: deepRound(pathways), caseCount, skipped };
}

export function currentGitSha() {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
}

export function renderModule({ pathways, caseCount, skipped }, gitSha = null) {
  const data = { PATHWAYS: pathways, GENERATED_FROM: { gitSha, caseCount, skipped }, SCHEMA_VERSION };
  const skipLines = skipped.map(s => `//   ${s.file}: ${s.reason}`).join('\n') || '//   (none)';
  return `// Generated by scripts/build-pathways.mjs — do not edit by hand.
// Per-kg-product recipes reduced from each cases/*.js baseline solve + evaluateEconomics
// (PV CAPEX excluded; non-PV CAPEX per kg/day of primary product, split by technology class).
// Cases: ${caseCount}; pathways: ${pathways.length}. Skipped:
${skipLines}
(function exposePathways(root, data) {
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  freeze(data);
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.FoundryPathways = data;
})(globalThis, ${JSON.stringify(data, null, 2)});
`;
}

export function normalizeForCompare(source) {
  return source.replace(/"gitSha": (null|"[^"]*")/, '"gitSha": null');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const built = buildPathways();
  if (process.argv.includes('--check')) {
    const fresh = normalizeForCompare(renderModule(built));
    const current = fs.existsSync(OUT_FILE) ? normalizeForCompare(fs.readFileSync(OUT_FILE, 'utf8')) : '';
    if (fresh !== current) { console.error('data/pathways.js is stale; run node scripts/build-pathways.mjs'); process.exit(1); }
    console.log('data/pathways.js is up to date');
  } else {
    fs.writeFileSync(OUT_FILE, renderModule(built, currentGitSha()));
    console.log(`wrote ${path.relative(ROOT, OUT_FILE)}: ${built.pathways.length} pathways from ${built.caseCount} cases; skipped ${built.skipped.length}`);
  }
}
