#!/usr/bin/env node
/**
 * Screening fuel price / CAPEX break-even and mid-band cash hunt.
 * Native Almería coastal / Mejillones methanol cases stay on their frozen series.
 * Location overlays bind each site's frozen PVGIS from data/pvgis-sites.js
 * (Port Hedland, Oxagon, Taweelah, …) — they do not reuse Almería yield.
 *
 * Mid-band gate: tea-screening mid price × CAPEX factor 1.0.
 * Size retune: sizeForPositiveCashflow at 2 / 5 / 10 kg/day, then probeFuelCash.
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
const pvgisSites = require('../data/pvgis-sites.js');
const {
  evaluateCandidate,
  defaultSearchSites,
  templateEligible,
  frozenSolarFor,
  FUEL_TEMPLATES,
} = require('../engine/site-search.js');

const SCREENING = 'screening';
const HUNT_RATES = [2, 5, 10];

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

function applyFrozenSolar(definition, solar) {
  if (!solar) {
    return 'Solar yield remains the case plant-template PVGIS series; this overlay has no matching frozen series in data/pvgis-sites.js (not inventing kWh/kWp).';
  }
  definition.site = definition.site || {};
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
  const solarKWp = Number(definition.site.solarKWp) || 0;
  if (solar.dailyPVKWhPerKWp > 0 && solarKWp > 0) {
    const kWh = solar.dailyPVKWhPerKWp * solarKWp;
    const node = (definition.graph?.nodes || []).find(item => (
      item.id === 'electricity' || item.id === 'power' || item.siteResource === 'electricity'
    ));
    if (node?.params?.stream?.kind === 'electricity') node.params.stream.kWh = kWh;
    if (definition.site.resources?.electricity?.stream?.kind === 'electricity') {
      definition.site.resources.electricity.stream.kWh = kWh;
    }
  }
  return `Solar yield bound from frozen ${solar.source} retrieved ${solar.retrieved}; not an invented kWh/kWp.`;
}

/**
 * Overlay a location preset's name, coordinates, rights, assay, and frozen PVGIS
 * when data/pvgis-sites.js has a series. Native Almería/Mejillones cases are
 * not built through this helper.
 */
function applyLocationPreset(definition, presetId) {
  const preset = presetById(presetId);
  if (!preset) throw new Error(`Unknown site preset: ${presetId}`);
  const next = clone(definition);
  const previous = next.site || {};
  const solar = pvgisSites.frozenSolarFor({ id: preset.id });
  const solarNote = applyFrozenSolar(next, solar);
  next.site = {
    ...next.site,
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
    notes: [previous.notes, preset.notes, solarNote].filter(Boolean).join(' '),
  };
  bindPresetAssay(next.site, preset.id);
  const seawater = next.graph?.nodes?.find(node => node.id === 'seawater' || node.siteResource === 'seawater');
  const assayStream = next.site.resources?.seawater?.stream;
  if (seawater?.params && assayStream) {
    seawater.params.stream = clone(assayStream);
  }
  return next;
}

function solarCaption(site, template) {
  const solar = frozenSolarFor(site, template);
  if (!solar) return 'missing frozen PVGIS';
  return `frozen ${solar.source} retrieved ${solar.retrieved}`;
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
    rates: HUNT_RATES.slice(),
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
    midMet: probe.midMet,
    midCash: probe.midCash,
    bestCash: probe.bestCash,
    breakEvenPrice: probe.breakEvenPrice,
    breakEvenPriceInBand: probe.breakEvenPriceInBand,
    mid: probe.mid,
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

function huntFuelMidBand() {
  const fuelOpts = { scales: [1], rates: HUNT_RATES.slice(), refine: false };
  const rows = [];
  for (const site of defaultSearchSites()) {
    for (const template of FUEL_TEMPLATES) {
      const eligibility = templateEligible(site, template);
      if (!eligibility.ok) continue;
      const row = evaluateCandidate(site, template, fuelOpts);
      rows.push({
        siteId: site.id,
        siteName: site.name,
        template,
        solar: solarCaption(site, template),
        midPrice: row.fuelProbe?.bounds?.priceMid ?? null,
        capexFactor: 1,
        rate: row.fuelProbe?.mid?.rate ?? row.selected?.rate ?? null,
        midCash: row.midCash,
        bestCash: row.bestCash,
        breakEvenPrice: row.breakEvenPrice,
        midMet: Boolean(row.fuelProbe?.midMet),
        feasible: Boolean(row.feasible),
      });
    }
  }
  return rows;
}

const coastalAlmeria = createCoastalCase(0);
const methanolMejillones = createMethanolCase(0);
const coastalGulf = applyLocationPreset(createCoastalCase(0), 'uae-taweelah');
const coastalHedland = applyLocationPreset(createCoastalCase(0), 'au-port-hedland');
const methanolOxagon = applyLocationPreset(createMethanolCase(0), 'saudi-oxagon');

const taweelahSolar = pvgisSites.frozenSolarFor({ id: 'uae-taweelah' });
const hedlandSolar = pvgisSites.frozenSolarFor({ id: 'au-port-hedland' });
const oxagonSolar = pvgisSites.frozenSolarFor({ id: 'saudi-oxagon' });

const runs = [
  summarize(
    findFuelBreakEven({ caseOrBuilder: () => clone(coastalAlmeria), product: 'CH4', vary: 'price' }),
    {
      case: 'coastal',
      site: {
        id: coastalAlmeria.site.id,
        name: coastalAlmeria.site.name,
        preset: 'spain-almeria / native coastal',
        solar: 'frozen PVGIS-SARAH3/ERA5 Almería typical-day',
      },
    }
  ),
  summarize(
    findFuelBreakEven({ caseOrBuilder: () => clone(coastalAlmeria), product: 'CH4', vary: 'capex' }),
    {
      case: 'coastal',
      site: {
        id: coastalAlmeria.site.id,
        name: coastalAlmeria.site.name,
        preset: 'spain-almeria / native coastal',
        solar: 'frozen PVGIS-SARAH3/ERA5 Almería typical-day',
      },
    }
  ),
  summarize(
    findFuelBreakEven({ caseOrBuilder: () => clone(methanolMejillones), product: 'methanol', vary: 'price' }),
    {
      case: 'methanol',
      site: {
        id: methanolMejillones.site.id,
        name: methanolMejillones.site.name,
        preset: 'chile-mejillones / native methanol',
        solar: 'frozen PVGIS-ERA5 Mejillones monthly',
      },
    }
  ),
  summarize(
    findFuelBreakEven({ caseOrBuilder: () => clone(coastalGulf), product: 'CH4', vary: 'price' }),
    {
      case: 'coastal',
      site: {
        id: 'uae-taweelah',
        name: presetById('uae-taweelah')?.name,
        preset: 'uae-taweelah',
        solar: taweelahSolar
          ? `frozen ${taweelahSolar.source} retrieved ${taweelahSolar.retrieved}`
          : 'missing frozen PVGIS',
      },
    }
  ),
  summarize(
    findFuelBreakEven({ caseOrBuilder: () => clone(coastalHedland), product: 'CH4', vary: 'price' }),
    {
      case: 'coastal',
      site: {
        id: 'au-port-hedland',
        name: presetById('au-port-hedland')?.name,
        preset: 'au-port-hedland',
        solar: hedlandSolar
          ? `frozen ${hedlandSolar.source} retrieved ${hedlandSolar.retrieved}`
          : 'missing frozen PVGIS',
      },
    }
  ),
  summarize(
    findFuelBreakEven({ caseOrBuilder: () => clone(methanolOxagon), product: 'methanol', vary: 'price' }),
    {
      case: 'methanol',
      site: {
        id: 'saudi-oxagon',
        name: presetById('saudi-oxagon')?.name,
        preset: 'saudi-oxagon',
        solar: oxagonSolar
          ? `frozen ${oxagonSolar.source} retrieved ${oxagonSolar.retrieved}`
          : 'missing frozen PVGIS',
      },
    }
  ),
];

const probes = [
  sizedProbe(
    () => coastalAlmeria,
    'CH4',
    {
      case: 'coastal',
      site: {
        id: coastalAlmeria.site.id,
        name: coastalAlmeria.site.name,
        preset: 'spain-almeria / native coastal',
        solar: 'frozen PVGIS-SARAH3/ERA5 Almería typical-day',
      },
    }
  ),
  sizedProbe(
    () => methanolMejillones,
    'methanol',
    {
      case: 'methanol',
      site: {
        id: methanolMejillones.site.id,
        name: methanolMejillones.site.name,
        preset: 'chile-mejillones / native methanol',
        solar: 'frozen PVGIS-ERA5 Mejillones monthly',
      },
    }
  ),
];

const hunt = huntFuelMidBand();
const midPositive = hunt.filter(row => row.midMet || row.midCash > 0);

const proof = {
  gate: 'mid-band = tea-screening mid price × CAPEX factor 1.0 (not band-edge capexFactor=0.05)',
  sizeRetune: `sizeForPositiveCashflow rates [${HUNT_RATES.join(', ')}] kg/day then probeFuelCash economics-only`,
  cites: [
    'tea-screening CH4 $1/kg screening green-premium (EIA Henry Hub contrast only)',
    'tea-screening MeOH $0.25–0.50/kg commodity band, mid $0.40/kg (IRENA renewable methanol family)',
    'CAPEX factor 1.0 is the cited pack intensity (electrolyzer/DAC/Sabatier/MeOH/PV); 0.05–2 is a screening multiplier edge, not a rank',
    'Frozen PVGIS: data/pvgis-sites.js (Almería SARAH3 2026-09-05; Mejillones ERA5 2026-09-14; catalog coasts ERA5 2026-09-21)',
  ],
  midPositiveCount: midPositive.length,
  conclusion: midPositive.length
    ? 'At least one mid-band fuel cash+ row; fuels may rank on the fuels-screening path.'
    : 'midCash << 0 on every fuel-eligible frozen-PVGIS coast; no mid-band cash+ rank. Materials maximizer (searchAbundanceSites default path=materials) does not search coastal/methanol.',
  rows: hunt,
};

const report = {
  label: SCREENING,
  sizing: 'baseline-once',
  sitesRun: [
    'coastal CH4 @ Almería (native frozen PVGIS-SARAH3/ERA5 typical-day) — vary price and CAPEX factor',
    'methanol @ Mejillones (native chile-mejillones frozen PVGIS-ERA5) — vary price',
    'coastal CH4 @ uae-taweelah overlay with frozen Taweelah PVGIS-ERA5 (not Almería yield)',
    'coastal CH4 @ au-port-hedland overlay with frozen Port Hedland PVGIS-ERA5',
    'methanol @ saudi-oxagon overlay with frozen Oxagon PVGIS-ERA5',
    `catalog hunt: every seawater+frozen-PVGIS coast × ${FUEL_TEMPLATES.join('/')} at rates ${HUNT_RATES.join('/')} kg/day`,
  ],
  notRun: [],
  notes: [
    'Break-even is annualNetCash crossing 0 with positiveSaleCount ≥ 1 on the plant sized once at case capacities (no re-size per trial).',
    'Post-size probes and the catalog hunt sweep tea-screening CH4 green-premium / MeOH $0.25–0.50/kg at CAPEX factor 1.0 (mid-band). Edge capexFactor=0.05 is diagnostic, not a rank. Screening, not quotes.',
    'Prices and CAPEX are screening, not offtake quotes, vendor CAPEX, or permits.',
    'Default site-search path is materials (abundance only). Fuels screening is searchFuelSites / --path fuels.',
  ],
  runs,
  probes,
  proof,
};

console.log(JSON.stringify(report, null, 2));
