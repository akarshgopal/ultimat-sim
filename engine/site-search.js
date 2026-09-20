(function exposeSiteSearch(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./size') : root.FlowsheetSize,
    typeof require === 'function' ? require('./network') : root.FlowsheetNetwork,
    typeof require === 'function' ? require('../cases/coastal') : root.CoastalCase,
    typeof require === 'function' ? require('../cases/methanol') : root.MethanolCase,
    typeof require === 'function' ? require('../cases/abundance') : root.AbundanceCase,
    typeof require === 'function' ? require('../cases/network') : root.NetworkCase,
    typeof require === 'function' ? require('../data/site-presets.js') : root.SITE_PRESETS,
    typeof require === 'function' ? require('../data/site-assays') : root.SiteAssays
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetSiteSearch = api;
})(globalThis, (sizeApi, networkApi, coastal, methanol, abundance, networkCase, sitePresets, siteAssays) => {
const PLANT_TEMPLATES = Object.freeze(['abundance', 'coastal', 'methanol']);
const DEAD_SEA_SITE_ID = 'dead-sea-pvgis-2026-09-06';
const SCREENING_NOTE = 'Screening assumes intake/concession for evaluation only; not a bankable permit.';
const SEARCH_SCALES = Object.freeze([0.5, 1, 2]);
const SEARCH_RATES = Object.freeze([0, 5]);
const FAST_SCALES = Object.freeze([1]);
const FAST_RATES = Object.freeze([0]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function jsonNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function presetList() {
  return Array.isArray(sitePresets) ? sitePresets : [];
}

function deadSeaSearchSite() {
  const definition = networkCase?.siteDeadSeaAbundance?.();
  const site = definition?.site || {};
  return {
    id: site.id || DEAD_SEA_SITE_ID,
    name: site.name || 'Dead Sea industrial shore',
    region: 'Levant',
    latitude: finiteNumber(site.latitude, 31.16),
    longitude: finiteNumber(site.longitude, 35.43),
    kind: 'brine-hub',
    assayKind: 'brine',
    assayId: 'dead-sea-brine',
    hasBrineAssay: true,
    hasSeawaterAssay: false,
    rightsHints: site.rights ? clone(site.rights) : null,
    evidence: Array.isArray(site.evidence) ? clone(site.evidence) : [],
    notes: site.notes || 'Dead Sea open-water ion assay hub from NetworkCase.siteDeadSeaAbundance. Literature assay is not a mineral concession.',
    source: 'NetworkCase.siteDeadSeaAbundance',
  };
}

function hasCitedSeawaterAssay(preset) {
  const assayId = preset?.assayId || siteAssays?.assayIdForPreset?.(preset?.id);
  if (!assayId) return { assayId: null, assay: null };
  const assay = siteAssays?.getAssay?.(assayId) || null;
  return { assayId, assay };
}

function presetSearchSite(preset) {
  const { assayId, assay } = hasCitedSeawaterAssay(preset);
  return {
    id: preset.id,
    name: preset.name,
    region: preset.region || '',
    latitude: finiteNumber(preset.latitude),
    longitude: finiteNumber(preset.longitude),
    kind: preset.kind || 'industrial-coast',
    assayKind: assay ? 'seawater' : null,
    assayId: assay ? assayId : null,
    hasBrineAssay: false,
    hasSeawaterAssay: Boolean(assay),
    rightsHints: preset.rightsHints ? clone(preset.rightsHints) : null,
    evidence: Array.isArray(preset.evidence) ? clone(preset.evidence) : [],
    notes: preset.notes || '',
    source: 'SITE_PRESETS',
  };
}

function defaultSearchSites() {
  return [deadSeaSearchSite(), ...presetList().map(presetSearchSite)];
}

function isBrineSite(site) {
  if (!site) return false;
  if (site.hasBrineAssay === true || site.assayKind === 'brine') return true;
  return site.id === DEAD_SEA_SITE_ID || site.source === 'NetworkCase.siteDeadSeaAbundance';
}

function normalizeSite(site) {
  if (!site || typeof site !== 'object' || !site.id) return null;
  if (isBrineSite(site)) {
    const dead = deadSeaSearchSite();
    return {
      ...dead,
      id: site.id || dead.id,
      name: site.name || dead.name,
      latitude: Number.isFinite(Number(site.latitude)) ? Number(site.latitude) : dead.latitude,
      longitude: Number.isFinite(Number(site.longitude)) ? Number(site.longitude) : dead.longitude,
      region: site.region || dead.region,
      notes: site.notes || dead.notes,
      hasBrineAssay: true,
      hasSeawaterAssay: false,
      assayKind: 'brine',
    };
  }
  const listed = presetList().find(preset => preset.id === site.id);
  const row = presetSearchSite(listed || site);
  return {
    ...row,
    name: site.name || row.name,
    latitude: Number.isFinite(Number(site.latitude)) ? Number(site.latitude) : row.latitude,
    longitude: Number.isFinite(Number(site.longitude)) ? Number(site.longitude) : row.longitude,
    hasBrineAssay: false,
  };
}

function normalizeTemplates(templates) {
  const requested = templates == null
    ? PLANT_TEMPLATES.slice()
    : (Array.isArray(templates) ? templates : String(templates).split(','))
      .map(item => String(item || '').trim())
      .filter(Boolean);
  const known = new Set(PLANT_TEMPLATES);
  return requested.filter(id => known.has(id));
}

function templateEligible(site, template) {
  if (template === 'abundance') {
    if (site?.hasBrineAssay && site.assayKind === 'brine') {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'no-brine-assay',
      notes: 'Seawater Millero assays are not brine assays; abundance template skipped.',
    };
  }
  if (template === 'coastal' || template === 'methanol') {
    if (site?.hasSeawaterAssay && site.assayKind === 'seawater') {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'no-seawater-assay',
      notes: 'Coastal/methanol templates need a cited seawater assay; not applied to brine hubs or screening coasts without composition.',
    };
  }
  return { ok: false, reason: 'unknown-template', notes: `Unknown plant template ${template}` };
}

function frozenSolarFor(site, template) {
  if (!site) return null;
  if (site.id === 'spain-almeria' || site.id === 'almeria-pvgis-2026-09-05') {
    const monthly = coastal?.DAILY_PV?.slice?.() || null;
    return monthly ? {
      dailyPVKWhPerKWp: monthly[0],
      monthlyPVKWhPerKWp: monthly,
      source: 'PVGIS-SARAH3/ERA5',
      retrieved: '2026-09-05',
      keepHourly: template === 'coastal',
      nativeTemplate: 'coastal',
    } : null;
  }
  if (site.id === 'chile-mejillones' || site.id === 'mejillones-pvgis-2026-09-14') {
    const monthly = methanol?.DAILY_PV?.slice?.() || null;
    return monthly ? {
      dailyPVKWhPerKWp: monthly[0],
      monthlyPVKWhPerKWp: monthly,
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-14',
      keepHourly: false,
      nativeTemplate: 'methanol',
    } : null;
  }
  if (isBrineSite(site)) {
    const monthly = networkCase?.DAILY_PV?.slice?.() || null;
    const daily = networkCase?.DEAD_SEA_PV;
    return daily > 0 ? {
      dailyPVKWhPerKWp: daily,
      monthlyPVKWhPerKWp: monthly,
      source: 'PVGIS-SARAH3/ERA5',
      retrieved: '2026-09-06',
      keepHourly: false,
      nativeTemplate: 'abundance',
    } : null;
  }
  return null;
}

function assumeScreeningBrine(definition) {
  definition.site = definition.site || {};
  definition.site.rights = definition.site.rights || {};
  definition.site.rights.brineConcession = {
    kind: 'concession',
    status: 'assumed',
    authorize: true,
    note: `${SCREENING_NOTE} Literature assay is not a mineral concession.`,
  };
  const extra = `${SCREENING_NOTE} Do not treat this as a bankable brine right.`;
  definition.site.notes = definition.site.notes ? `${definition.site.notes} ${extra}` : extra;
}

function overlaySiteIdentity(definition, site, extraNotes = []) {
  definition.site = definition.site || {};
  definition.site.id = site.id;
  definition.site.name = site.name;
  definition.site.latitude = site.latitude;
  definition.site.longitude = site.longitude;
  if (site.region) definition.site.region = site.region;
  if (site.kind) definition.site.kind = site.kind;
  if (Array.isArray(site.evidence) && site.evidence.length) {
    definition.site.evidence = clone(site.evidence);
  }
  if (site.rightsHints && typeof site.rightsHints === 'object') {
    definition.site.rights = definition.site.rights || {};
    for (const [key, hint] of Object.entries(site.rightsHints)) {
      if (!hint || typeof hint !== 'object') continue;
      const status = hint.status === 'authorized' || hint.status === 'assumed' ? hint.status : 'unverified';
      definition.site.rights[key] = {
        kind: hint.kind || definition.site.rights[key]?.kind,
        status,
        authorize: hint.authorize === true || status === 'assumed' || status === 'authorized',
        note: hint.note || definition.site.rights[key]?.note,
      };
    }
  }
  if (extraNotes.length) {
    definition.site.notes = [definition.site.notes, ...extraNotes].filter(Boolean).join(' ');
  }
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

function applyFrozenSolar(definition, solar, template) {
  if (!solar) {
    delete definition.site.solar;
    return 'No frozen PVGIS series for this site; screening uses the plant-template solar, not a local yield.';
  }
  definition.site.dailyPVKWhPerKWp = solar.dailyPVKWhPerKWp;
  definition.site.meteo = {
    ...(definition.site.meteo || {}),
    dailyPVKWhPerKWp: solar.dailyPVKWhPerKWp,
    monthlyPVKWhPerKWp: solar.monthlyPVKWhPerKWp ? solar.monthlyPVKWhPerKWp.slice() : definition.site.meteo?.monthlyPVKWhPerKWp,
    quality: 'cited',
    source: solar.source,
    retrieved: solar.retrieved,
    notes: `Frozen ${solar.source} monthly bound for screening; not a plant-measured irradiance series.`,
  };
  if (!solar.keepHourly) delete definition.site.solar;
  if (template !== 'abundance') rescaleElectricity(definition, solar.dailyPVKWhPerKWp);
  return null;
}

function bindSeawaterAssay(definition, site, intakeM3PerDay) {
  const assay = siteAssays?.getAssay?.(site.assayId);
  if (!assay) return;
  const massKg = intakeM3PerDay * assay.density_kg_per_L * 1000;
  const stream = siteAssays.seawaterFromAssay(assay, massKg);
  const seawater = (definition.graph?.nodes || []).find(node => node.id === 'seawater');
  if (seawater?.params) seawater.params.stream = clone(stream);
  const swro = (definition.graph?.nodes || []).find(node => node.unit === 'swro');
  if (swro?.params) swro.params.feedDensityKgM3 = assay.density_kg_per_L * 1000;
  if (siteAssays.bindAssayToSite) {
    siteAssays.bindAssayToSite(definition.site, assay, { intakeM3PerDay });
  }
  if (definition.site.resources?.seawater) {
    definition.site.resources.seawater.stream = clone(stream);
  }
}

function buildAbundancePlant(site) {
  if (!networkCase?.siteDeadSeaAbundance && !abundance?.createAbundanceCase) {
    throw new Error('Abundance case is not loaded');
  }
  const definition = networkCase?.siteDeadSeaAbundance
    ? networkCase.siteDeadSeaAbundance()
    : abundance.createAbundanceCase();
  overlaySiteIdentity(definition, site, [SCREENING_NOTE]);
  assumeScreeningBrine(definition);
  applyFrozenSolar(definition, frozenSolarFor(site, 'abundance'), 'abundance');
  return definition;
}

function buildFuelPlant(site, template) {
  const builder = template === 'methanol' ? methanol?.createMethanolCase : coastal?.createCoastalCase;
  if (typeof builder !== 'function') throw new Error(`${template} case is not loaded`);
  const definition = builder(0);
  const intake = Number(
    (template === 'methanol' ? methanol?.INTAKE_M3_PER_DAY : coastal?.INTAKE_M3_PER_DAY) || 0.1
  );
  const solarNote = applyFrozenSolar(definition, frozenSolarFor(site, template), template);
  overlaySiteIdentity(definition, site, [SCREENING_NOTE, solarNote].filter(Boolean));
  bindSeawaterAssay(definition, site, intake);
  return definition;
}

function buildPlant(site, template) {
  if (template === 'abundance') return buildAbundancePlant(site);
  if (template === 'coastal' || template === 'methanol') return buildFuelPlant(site, template);
  throw new Error(`Unknown plant template ${template}`);
}

function saleProducts(objective, economics) {
  const scored = Array.isArray(objective?.products) ? objective.products : [];
  const byId = new Map(scored.map(product => [product.id, product]));
  const products = [];
  let tonnes = 0;
  for (const sink of economics?.sinks || []) {
    if (sink?.disposition !== 'sale' || !(sink.annualRevenue > 0)) continue;
    const kgYear = finiteNumber(sink.deliveredAmount, 0);
    const tonnesPerYear = kgYear / 1000;
    tonnes += tonnesPerYear;
    const scoredProduct = byId.get(sink.id);
    products.push({
      id: sink.id,
      tonnesPerYear,
      annualRevenue: finiteNumber(sink.annualRevenue, 0),
      positive: scoredProduct ? Boolean(scoredProduct.positive) : true,
    });
  }
  products.sort((left, right) => {
    if (right.tonnesPerYear !== left.tonnesPerYear) return right.tonnesPerYear - left.tonnesPerYear;
    return String(left.id).localeCompare(String(right.id), 'en');
  });
  return { tonnes, products };
}

function slateFromNetwork(definition, site) {
  if (!networkApi?.evaluateNetwork || !definition) return {};
  try {
    const rolled = networkApi.evaluateNetwork({
      plants: [{ id: site.id, name: site.name, definition }],
      corridors: [],
    });
    const slate = {};
    for (const [substance, tonnes] of Object.entries(rolled.slate || {})) {
      if (tonnes > 0) slate[substance] = tonnes;
    }
    return slate;
  } catch {
    return {};
  }
}

function compareCandidates(left, right) {
  const feasLeft = left?.feasible || left?.met ? 1 : 0;
  const feasRight = right?.feasible || right?.met ? 1 : 0;
  if (feasLeft !== feasRight) return feasRight - feasLeft;
  const tonnesLeft = finiteNumber(left?.tonnes ?? left?.totalPositiveSaleTonnes, 0);
  const tonnesRight = finiteNumber(right?.tonnes ?? right?.totalPositiveSaleTonnes, 0);
  if (tonnesLeft !== tonnesRight) return tonnesRight - tonnesLeft;
  const countLeft = finiteNumber(left?.positiveSaleCount, 0);
  const countRight = finiteNumber(right?.positiveSaleCount, 0);
  if (countLeft !== countRight) return countRight - countLeft;
  const cashLeft = finiteNumber(left?.annualNetCash, 0);
  const cashRight = finiteNumber(right?.annualNetCash, 0);
  if (cashLeft !== cashRight) return cashRight - cashLeft;
  const site = String(left?.siteId || '').localeCompare(String(right?.siteId || ''), 'en');
  if (site) return site;
  return String(left?.template || '').localeCompare(String(right?.template || ''), 'en');
}

function rankCandidates(candidates = []) {
  return candidates.slice().sort(compareCandidates);
}

function skippedRow(site, template, eligibility) {
  return {
    siteId: site.id,
    siteName: site.name,
    template,
    slate: {},
    annualNetCash: null,
    tonnes: 0,
    totalPositiveSaleTonnes: 0,
    positiveSaleCount: 0,
    products: [],
    met: false,
    feasible: false,
    status: 'skipped',
    reason: eligibility.reason,
    notes: [eligibility.notes, SCREENING_NOTE].filter(Boolean),
  };
}

function errorRow(site, template, error, notes = []) {
  const message = error?.message || String(error);
  return {
    siteId: site.id,
    siteName: site.name,
    template,
    slate: {},
    annualNetCash: null,
    tonnes: 0,
    totalPositiveSaleTonnes: 0,
    positiveSaleCount: 0,
    products: [],
    met: false,
    feasible: false,
    status: 'error',
    reason: message,
    notes: [...notes, message, SCREENING_NOTE],
  };
}

function evaluateCandidate(site, template, sizeOpts = {}) {
  const notes = [SCREENING_NOTE];
  const solar = frozenSolarFor(site, template);
  if (!solar) notes.push('No frozen PVGIS series for this site; screening uses the plant-template solar, not a local yield.');
  let definition;
  try {
    definition = buildPlant(site, template);
  } catch (error) {
    return errorRow(site, template, error, notes);
  }
  if (!sizeApi?.sizeForPositiveCashflow) {
    return errorRow(site, template, new Error('sizeForPositiveCashflow is not loaded'), notes);
  }
  let sized;
  try {
    sized = sizeApi.sizeForPositiveCashflow({
      definition,
      scales: sizeOpts.scales,
      rates: sizeOpts.rates,
      maxIterations: sizeOpts.maxIterations,
      tolerance: sizeOpts.tolerance,
      heatCredit: sizeOpts.heatCredit,
      caps: sizeOpts.caps,
    });
  } catch (error) {
    return errorRow(site, template, error, notes);
  }
  const objective = sized.objective || {};
  const economics = sized.economics || {};
  const annualNetCash = jsonNumber(objective.annualNetCash ?? economics.annualNetCash);
  const met = Boolean(objective.met) && annualNetCash != null && annualNetCash > 0;
  const { tonnes, products } = saleProducts(objective, economics);
  const slate = slateFromNetwork(sized.definition, site);
  if (!met) {
    notes.push('No cash-positive slate under the searched discrete grid; not an invented fuel winner.');
  }
  if (Array.isArray(sized.warnings)) {
    for (const warning of sized.warnings) {
      if (warning && !notes.includes(warning)) notes.push(warning);
    }
  }
  return {
    siteId: site.id,
    siteName: site.name,
    template,
    slate,
    annualNetCash,
    tonnes,
    totalPositiveSaleTonnes: tonnes,
    positiveSaleCount: finiteNumber(objective.positiveSaleCount, met ? products.length : 0),
    products,
    met,
    feasible: met,
    status: 'ok',
    selected: sized.selected || null,
    notes,
  };
}

function resolveSizeOpts(sizeOpts = {}) {
  const scales = sizeOpts.scales && sizeOpts.scales.length ? sizeOpts.scales : SEARCH_SCALES.slice();
  const rates = sizeOpts.rates && sizeOpts.rates.length ? sizeOpts.rates : SEARCH_RATES.slice();
  return { ...sizeOpts, scales, rates };
}

function searchAbundanceSites(opts = {}) {
  const rawSites = opts.sites == null ? defaultSearchSites() : opts.sites;
  const sites = (Array.isArray(rawSites) ? rawSites : [])
    .map(normalizeSite)
    .filter(Boolean);
  const templates = normalizeTemplates(opts.templates);
  const topN = Number.isFinite(Number(opts.topN)) && Number(opts.topN) > 0 ? Math.floor(Number(opts.topN)) : 10;
  const sizeOpts = resolveSizeOpts(opts.sizeOpts || {});
  const includeNearMisses = opts.nearMisses !== false;

  const skipped = [];
  const evaluated = [];
  for (const site of sites) {
    for (const template of templates) {
      const eligibility = templateEligible(site, template);
      if (!eligibility.ok) {
        skipped.push(skippedRow(site, template, eligibility));
        continue;
      }
      evaluated.push(evaluateCandidate(site, template, sizeOpts));
    }
  }

  const feasible = evaluated.filter(row => row.feasible);
  const ranking = rankCandidates(feasible).slice(0, topN);
  const nearMisses = includeNearMisses
    ? rankCandidates(evaluated.filter(row => row.status === 'ok' && !row.feasible)).slice(0, topN)
    : [];

  return {
    ranking,
    nearMisses,
    feasibleCount: feasible.length,
    tried: evaluated.length,
    skipped,
    skippedCount: skipped.length,
    sitesTried: sites.length,
    templates,
    notes: [SCREENING_NOTE],
  };
}

return {
  PLANT_TEMPLATES,
  DEAD_SEA_SITE_ID,
  SCREENING_NOTE,
  SEARCH_SCALES,
  SEARCH_RATES,
  FAST_SCALES,
  FAST_RATES,
  searchAbundanceSites,
  rankCandidates,
  defaultSearchSites,
  templateEligible,
  evaluateCandidate,
};
});
