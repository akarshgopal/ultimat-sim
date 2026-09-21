#!/usr/bin/env node
/**
 * Screening fuel price / CAPEX break-even for coastal methane and Mejillones methanol.
 * Sizes once at case capacities, then sweeps economics only (see engine/sensitivity.js).
 * Prices and CAPEX are screening, not quotes.
 *
 * Usage: node scripts/fuel-breakeven.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findFuelBreakEven, probeFuelCash } = require('../engine/sensitivity.js');
const { sizeForPositiveCashflow } = require('../engine/size.js');
const { createCoastalCase } = require('../cases/coastal.js');
const { createMethanolCase } = require('../cases/methanol.js');
const SITE_PRESETS = require('../data/site-presets.js');
const { bindPresetAssay } = require('../data/site-assays.js');
const { frozenSolarFor } = require('../engine/site-search.js');

const SCREENING = 'screening';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function presetById(id) {
  return (SITE_PRESETS || []).find(item => item.id === id) || null;
}

function rightsFromHints(hints = {}) {
  const rights = {};
  for (const [key, hint] of Object.entries(hints)) {
    if (!hint) continue;
    const status = hint.status === 'assumed' ? 'assumed' : (hint.status || 'unverified');
    rights[key] = {
      kind: hint.kind,
      status,
      authorize: status === 'assumed' || status === 'authorized',
      note: hint.note,
    };
  }
  return rights;
}

function rescaleElectricity(definition, dailyPVKWhPerKWp) {
  const solarKWp = Number(definition.site?.solarKWp) || 0;
  if (!(dailyPVKWhPerKWp > 0) || !(solarKWp > 0)) return;
  const kWh = dailyPVKWhPerKWp * solarKWp;
  const node = (definition.graph?.nodes || []).find(item => (
    item.id === 'electricity' || item.id === 'power' || item.siteResource === 'electricity'
  ));
  if (node?.params?.stream?.kind === 'electricity') node.params.stream.kWh = kWh;
  if (definition.site.resources?.electricity?.stream?.kind === 'electricity') {
    definition.site.resources.electricity.stream.kWh = kWh;
  }
  definition.site.dailyPVKWhPerKWp = dailyPVKWhPerKWp;
  if (definition.site.meteo) definition.site.meteo.dailyPVKWhPerKWp = dailyPVKWhPerKWp;
}

/** Same bind as engine/site-search.js applyFrozenSolar. Does not invent kWh/kWp. */
function applyFrozenSolar(definition, solar, template) {
  if (!solar) {
    return 'No frozen PVGIS series for this site; screening uses the plant-template solar, not a local yield.';
  }
  definition.site.dailyPVKWhPerKWp = solar.dailyPVKWhPerKWp;
  definition.site.meteo = {
    ...(definition.site.meteo || {}),
    dailyPVKWhPerKWp: solar.dailyPVKWhPerKWp,
    monthlyPVKWhPerKWp: solar.monthlyPVKWhPerKWp
      ? solar.monthlyPVKWhPerKWp.slice()
      : definition.site.meteo?.monthlyPVKWhPerKWp,
    quality: 'cited',
    source: solar.source,
    retrieved: solar.retrieved,
    notes: `Frozen ${solar.source} monthly bound for screening; not a plant-measured irradiance series.`,
  };
  if (!solar.keepHourly) delete definition.site.solar;
  if (template !== 'abundance') rescaleElectricity(definition, solar.dailyPVKWhPerKWp);
  return `Frozen ${solar.source} monthly bound from data/pvgis-sites.js; not Almería kWh/kWp.`;
}

function solarLabel(solar, name, fallback) {
  if (!solar) return fallback;
  const kind = solar.keepHourly ? 'typical-day' : 'monthly';
  return `frozen ${solar.source} ${name} ${kind}`;
}

/**
 * Overlay a location preset's name, coordinates, rights, and frozen assay.
 * Binds per-site frozen PVGIS when present (site-search frozenSolarFor). Does not invent yield.
 */
function applyLocationPreset(definition, presetId, template = 'coastal') {
  const preset = presetById(presetId);
  if (!preset) throw new Error(`Unknown site preset: ${presetId}`);
  const next = clone(definition);
  const previous = next.site || {};
  const solar = frozenSolarFor(preset, template);
  next.site = {
    ...previous,
    id: preset.id,
    name: preset.name,
    region: preset.region,
    kind: preset.kind,
    latitude: preset.latitude,
    longitude: preset.longitude,
    evidence: [
      ...(Array.isArray(previous.evidence) ? previous.evidence : []),
      ...(Array.isArray(preset.evidence) ? preset.evidence.map(item => ({ ...item })) : []),
    ],
    rights: { ...(previous.rights || {}), ...rightsFromHints(preset.rightsHints) },
  };
  const solarNote = applyFrozenSolar(next, solar, template);
  next.site.notes = [previous.notes, preset.notes, solarNote].filter(Boolean).join(' ');
  bindPresetAssay(next.site, preset.id);
  const seawater = next.graph?.nodes?.find(node => node.id === 'seawater' || node.siteResource === 'seawater');
  const assayStream = next.site.resources?.seawater?.stream;
  if (seawater?.params && assayStream) {
    seawater.params.stream = clone(assayStream);
  }
  return next;
}

function summarize(result, extra) {
  return {
    ...extra,
    product: result.product,
    vary: result.vary,
    met: result.met,
    breakEven: result.breakEven,
    brackets: result.brackets,
    curve: result.curve,
    baseline: result.baseline,
    label: result.label || SCREENING,
    priceSources: result.priceSources,
    sizing: result.sizing,
    warnings: result.warnings,
  };
}

function sizedProbe(builder, product, extra) {
  const sized = sizeForPositiveCashflow({
    caseOrBuilder: () => clone(typeof builder === 'function' ? builder() : builder),
    rates: [2, 5],
  });
  const probe = probeFuelCash({
    definition: sized.definition,
    solved: sized.solved,
    product,
    selected: sized.selected,
  });
  return {
    ...extra,
    product: probe.product,
    met: probe.met,
    bestCash: probe.bestCash,
    breakEvenPrice: probe.breakEvenPrice,
    breakEvenPriceInBand: probe.breakEvenPriceInBand,
    best: probe.best,
    bounds: probe.bounds,
    label: probe.label || SCREENING,
    note: probe.note,
    warnings: probe.warnings,
    sized: {
      met: Boolean(sized.objective?.met),
      annualNetCash: sized.objective?.annualNetCash ?? null,
      selected: sized.selected,
    },
  };
}

const coastalAlmeria = createCoastalCase(0);
const methanolMejillones = createMethanolCase(0);
const taweelahPreset = presetById('uae-taweelah');
const taweelahSolar = frozenSolarFor(taweelahPreset, 'coastal');
const coastalGulf = applyLocationPreset(createCoastalCase(0), 'uae-taweelah');

const almeriaSolarMeta = {
  id: coastalAlmeria.site.id,
  name: coastalAlmeria.site.name,
  preset: 'spain-almeria / native coastal',
  solar: 'frozen PVGIS-SARAH3/ERA5 Almería typical-day',
};
const mejillonesSolarMeta = {
  id: methanolMejillones.site.id,
  name: methanolMejillones.site.name,
  preset: 'chile-mejillones / native methanol',
  solar: 'frozen PVGIS-ERA5 Mejillones monthly',
};
const taweelahSolarMeta = {
  id: 'uae-taweelah',
  name: taweelahPreset?.name,
  preset: 'uae-taweelah',
  solar: solarLabel(taweelahSolar, 'Taweelah', 'plant-template solar retained (no frozen PVGIS for this site)'),
};

const runs = [
  summarize(
    findFuelBreakEven({ caseOrBuilder: () => clone(coastalAlmeria), product: 'CH4', vary: 'price' }),
    { case: 'coastal', site: almeriaSolarMeta }
  ),
  summarize(
    findFuelBreakEven({ caseOrBuilder: () => clone(coastalAlmeria), product: 'CH4', vary: 'capex' }),
    { case: 'coastal', site: almeriaSolarMeta }
  ),
  summarize(
    findFuelBreakEven({ caseOrBuilder: () => clone(methanolMejillones), product: 'methanol', vary: 'price' }),
    { case: 'methanol', site: mejillonesSolarMeta }
  ),
  summarize(
    findFuelBreakEven({ caseOrBuilder: () => clone(coastalGulf), product: 'CH4', vary: 'price' }),
    { case: 'coastal', site: taweelahSolarMeta }
  ),
];

const probes = [
  sizedProbe(() => coastalAlmeria, 'CH4', { case: 'coastal', site: almeriaSolarMeta }),
  sizedProbe(() => methanolMejillones, 'methanol', { case: 'methanol', site: mejillonesSolarMeta }),
];

const report = {
  label: SCREENING,
  sizing: 'baseline-once',
  sitesRun: [
    'coastal CH4 @ Almería (native frozen PVGIS) — vary price and CAPEX factor',
    'methanol @ Mejillones (native chile-mejillones frozen PVGIS-ERA5) — vary price',
    'coastal CH4 @ uae-taweelah location/assay/rights overlay; frozen PVGIS-ERA5 Taweelah monthly from data/pvgis-sites.js (not Almería)',
    'post-size probeFuelCash at 2 and 5 kg/day: CH4 green-premium × CAPEX 0.05–2; MeOH commodity band × CAPEX 0.05–2',
  ],
  notRun: [
    'Catalog fuel coasts beyond the uae-taweelah overlay (including au-port-hedland and saudi-oxagon) are not extra sample runs; they already have frozen PVGIS in data/pvgis-sites.js. Not inventing yield.',
  ],
  notes: [
    'Break-even is annualNetCash crossing 0 with positiveSaleCount ≥ 1 on the plant sized once at case capacities (no re-size per trial).',
    'Post-size probes sweep tea-screening CH4 green-premium / MeOH $0.25–0.50/kg and CAPEX factor 0.05–2 on the cashflow-sized plant (economics only). Screening, not quotes.',
    'Prices and CAPEX are screening, not offtake quotes, vendor CAPEX, or permits.',
    'Location overlays bind frozenSolarFor when present; missing frozen PVGIS keeps plant-template solar rather than inventing kWh/kWp.',
  ],
  runs,
  probes,
};

console.log(JSON.stringify(report, null, 2));
