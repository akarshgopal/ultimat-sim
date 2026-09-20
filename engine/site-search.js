(function exposeSiteSearch(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./size') : root.FlowsheetSize,
    typeof require === 'function' ? require('./network') : root.FlowsheetNetwork,
    typeof require === 'function' ? require('../cases/coastal') : root.CoastalCase,
    typeof require === 'function' ? require('../cases/methanol') : root.MethanolCase,
    typeof require === 'function' ? require('../cases/abundance') : root.AbundanceCase,
    typeof require === 'function' ? require('../cases/network') : root.NetworkCase,
    typeof require === 'function' ? require('../data/site-presets.js') : root.SITE_PRESETS,
    typeof require === 'function' ? require('../data/site-assays') : root.SiteAssays,
    typeof require === 'function' ? require('./sensitivity') : root.FlowsheetSensitivity
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetSiteSearch = api;
})(globalThis, (sizeApi, networkApi, coastal, methanol, abundance, networkCase, sitePresets, siteAssays, sensitivityApi) => {
const PLANT_TEMPLATES = Object.freeze(['abundance', 'coastal', 'methanol']);
const DEAD_SEA_SITE_ID = 'dead-sea-pvgis-2026-09-06';
const SCREENING_NOTE = 'Screening assumes intake/concession for evaluation only; not a bankable permit.';
const RIGHTS_SCREENING = 'screening-assumes-intake-concession';
const RIGHTS_NONE = 'no-rights-modeled';
const MAP_LAYER_IDS = Object.freeze(['pvgis', 'water', 'land']);
const SEARCH_SCALES = Object.freeze([0.25, 0.5, 1, 2, 4]);
const SEARCH_RATES = Object.freeze([0, 2, 5]);
const FAST_SCALES = Object.freeze([1]);
const FAST_RATES = Object.freeze([0]);
const IDLE_CASH_EPS = 1e-6;

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
    brineAssayId: 'dead-sea-brine',
    seawaterAssayId: null,
    hasBrineAssay: true,
    hasSeawaterAssay: false,
    rightsHints: site.rights ? clone(site.rights) : null,
    evidence: Array.isArray(site.evidence) ? clone(site.evidence) : [],
    notes: site.notes || 'Dead Sea open-water ion assay hub from NetworkCase.siteDeadSeaAbundance. Literature assay is not a mineral concession.',
    source: 'NetworkCase.siteDeadSeaAbundance',
  };
}

function isBrineAssayId(assayId) {
  if (!assayId) return false;
  if (/brine/i.test(String(assayId))) return true;
  const assay = siteAssays?.getAssay?.(assayId);
  return assay?.meta?.kind === 'brine';
}

function citedSeawaterAssayId(preset) {
  if (!preset) return null;
  if (preset.seawaterAssayId) return preset.seawaterAssayId;
  const mapped = siteAssays?.assayIdForPreset?.(preset.id);
  if (mapped) return mapped;
  if (preset.assayId && !isBrineAssayId(preset.assayId) && preset.assayKind !== 'brine') {
    return preset.assayId;
  }
  return null;
}

function citedBrineAssayId(preset) {
  if (!preset) return null;
  if (preset.brineAssayId) return preset.brineAssayId;
  const mapped = siteAssays?.brineAssayIdForPreset?.(preset.id);
  if (mapped) return mapped;
  if (preset.assayId && (isBrineAssayId(preset.assayId) || preset.assayKind === 'brine')) {
    return preset.assayId;
  }
  return null;
}

function presetSearchSite(preset) {
  const seawaterAssayId = citedSeawaterAssayId(preset);
  const brineAssayId = citedBrineAssayId(preset);
  const seawater = seawaterAssayId ? siteAssays?.getAssay?.(seawaterAssayId) || true : null;
  const brine = brineAssayId ? siteAssays?.getAssay?.(brineAssayId) || true : null;
  return {
    id: preset.id,
    name: preset.name,
    region: preset.region || '',
    latitude: finiteNumber(preset.latitude),
    longitude: finiteNumber(preset.longitude),
    kind: preset.kind || 'industrial-coast',
    assayKind: brine ? 'brine' : (seawater ? 'seawater' : null),
    assayId: brine ? brineAssayId : (seawater ? seawaterAssayId : null),
    brineAssayId: brine ? brineAssayId : null,
    seawaterAssayId: seawater ? seawaterAssayId : null,
    hasBrineAssay: Boolean(brine),
    hasSeawaterAssay: Boolean(seawater),
    rightsHints: preset.rightsHints ? clone(preset.rightsHints) : null,
    evidence: Array.isArray(preset.evidence) ? clone(preset.evidence) : [],
    notes: preset.notes || '',
    source: 'SITE_PRESETS',
  };
}

function defaultSearchSites() {
  return [deadSeaSearchSite(), ...presetList().map(presetSearchSite)];
}

function isDeadSeaHub(site) {
  return site?.id === DEAD_SEA_SITE_ID || site?.source === 'NetworkCase.siteDeadSeaAbundance';
}

function pickCoord(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeSite(site) {
  if (!site || typeof site !== 'object' || !site.id) return null;
  if (isDeadSeaHub(site)) {
    const dead = deadSeaSearchSite();
    return {
      ...dead,
      name: site.name || dead.name,
      latitude: pickCoord(site.latitude, dead.latitude),
      longitude: pickCoord(site.longitude, dead.longitude),
      region: site.region || dead.region,
      notes: site.notes || dead.notes,
      assayId: site.assayId || dead.assayId,
      brineAssayId: site.brineAssayId || dead.assayId,
      seawaterAssayId: site.seawaterAssayId || null,
      hasBrineAssay: true,
      hasSeawaterAssay: site.hasSeawaterAssay === true,
      assayKind: 'brine',
    };
  }
  const listed = presetList().find(preset => preset.id === site.id);
  const row = presetSearchSite(listed || site);
  return {
    ...row,
    name: site.name || row.name,
    latitude: pickCoord(site.latitude, row.latitude),
    longitude: pickCoord(site.longitude, row.longitude),
    hasBrineAssay: site.hasBrineAssay != null ? Boolean(site.hasBrineAssay) : row.hasBrineAssay,
    hasSeawaterAssay: site.hasSeawaterAssay != null ? Boolean(site.hasSeawaterAssay) : row.hasSeawaterAssay,
    assayId: site.assayId || row.assayId,
    brineAssayId: site.brineAssayId || row.brineAssayId,
    seawaterAssayId: site.seawaterAssayId || row.seawaterAssayId,
    assayKind: site.assayKind || row.assayKind,
  };
}

function normalizeTemplates(templates) {
  const requested = templates == null
    ? PLANT_TEMPLATES.slice()
    : (Array.isArray(templates) ? templates : String(templates).split(','))
      .map(item => String(item || '').trim())
      .filter(Boolean);
  const known = new Set(PLANT_TEMPLATES);
  return requested.filter(id => known.has(id) || isMapLayerTemplate(id));
}

function isMapLayerTemplate(template) {
  return MAP_LAYER_IDS.includes(template);
}

function templateEligible(site, template) {
  if (isMapLayerTemplate(template)) {
    return {
      ok: false,
      reason: 'map-layer-not-objective',
      notes: 'Map layers are screening overlays, not plant templates or optimizer objectives.',
    };
  }
  if (template === 'abundance') {
    if (site?.hasBrineAssay) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'no-brine-assay',
      notes: 'Seawater Millero assays are not brine assays; abundance template skipped.',
    };
  }
  if (template === 'coastal' || template === 'methanol') {
    if (!site?.hasSeawaterAssay) {
      return {
        ok: false,
        reason: 'no-seawater-assay',
        notes: 'Coastal/methanol templates need a cited seawater assay; not applied to brine hubs or screening coasts without composition.',
      };
    }
    if (!frozenSolarFor(site, template)) {
      return {
        ok: false,
        reason: 'no-frozen-pvgis',
        notes: 'Coastal/methanol templates need a frozen per-site PVGIS series; not applied with another site\'s kWh/kWp.',
      };
    }
    return { ok: true };
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
  if (isDeadSeaHub(site)) {
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
  const assayId = site.seawaterAssayId
    || (site.assayKind === 'seawater' || !site.hasBrineAssay ? site.assayId : null);
  const assay = siteAssays?.getAssay?.(assayId);
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

function resolveAbundanceAssayId(site) {
  if (!site) return 'dead-sea-brine';
  if (site.assayKind === 'brine' && site.assayId) return site.assayId;
  if (site.brineAssayId) return site.brineAssayId;
  const mapped = siteAssays?.brineAssayIdForPreset?.(site.id);
  if (mapped) return mapped;
  if (isDeadSeaHub(site)) return 'dead-sea-brine';
  if (site.hasBrineAssay && site.assayId && isBrineAssayId(site.assayId)) return site.assayId;
  return 'dead-sea-brine';
}

function nodeById(definition, id) {
  return (definition.graph?.nodes || []).find(item => item.id === id);
}

function attachAbundanceSite(definition, site, solar) {
  const tea = abundance?.TEA;
  const powerNode = nodeById(definition, 'power');
  const brineNode = nodeById(definition, 'brine');
  const powerKWh = Number(powerNode?.params?.stream?.kWh) || 0;
  const dailyPV = Number(solar?.dailyPVKWhPerKWp) || Number(networkCase?.DEAD_SEA_PV) || 0;
  const solarKWp = dailyPV > 0 ? powerKWh / dailyPV : 0;
  if (powerNode) {
    powerNode.siteResource = 'electricity';
    if (tea?.bindCapexPack) {
      powerNode.economics = tea.bindCapexPack('solar-pv', { capacity: solarKWp });
    }
  }
  if (brineNode) brineNode.siteResource = 'brine';
  const saltNode = nodeById(definition, 'salt-feed');
  if (saltNode) saltNode.siteResource = 'salt';
  const waterNode = nodeById(definition, 'water');
  if (waterNode) waterNode.siteResource = 'freshwater';
  const airNode = nodeById(definition, 'air');
  if (airNode) airNode.siteResource = 'air';

  const assayId = definition.meta?.assayId || resolveAbundanceAssayId(site);
  const assay = siteAssays?.getAssay?.(assayId);
  definition.site = definition.site || {};
  definition.site.solarKWp = solarKWp;
  definition.site.dailyPVKWhPerKWp = dailyPV;
  definition.site.resources = {
    electricity: powerNode?.params?.stream ? {
      stream: clone(powerNode.params.stream),
      quality: solar ? 'cited' : 'literature-estimate',
      evidence: solar
        ? `Frozen ${solar.source} × array sized to the hub load`
        : 'Screening PV yield × array sized to the hub load; not a local PVGIS series',
    } : undefined,
    brine: brineNode?.params?.stream ? {
      stream: clone(brineNode.params.stream),
      quality: 'cited',
      evidence: `Frozen process-brine assay ${assayId || ''}; daily mass from createAbundanceCase. Literature assay is not a mineral concession.`,
    } : undefined,
    salt: saltNode?.params?.stream ? {
      stream: clone(saltNode.params.stream),
      quality: 'user-assumption',
      evidence: 'Purchased salt makeup assumed available; not a local quote',
    } : undefined,
    freshwater: waterNode?.params?.stream ? {
      stream: clone(waterNode.params.stream),
      quality: 'user-assumption',
      evidence: 'Process water is assumed, not a local freshwater right',
    } : undefined,
    air: airNode?.params?.stream ? {
      stream: clone(airNode.params.stream),
      quality: 'literature-estimate',
      evidence: 'Ambient air intake; no quality permit modeled',
    } : undefined,
    grid: {
      stream: { kind: 'electricity', kWh: 0 },
      quality: 'unverified',
      evidence: 'Unverified grid access; zero authorized imports',
    },
  };
  if (assay) {
    definition.site.assay = {
      kind: 'brine',
      assayId: assay.meta?.id || assayId,
      summary: assay.meta?.notes || assay.meta?.quality || `Frozen process-brine assay ${assayId}`,
      quality: 'cited',
      salinity_g_per_kg: assay.salinity_g_per_kg,
      density_kg_per_L: assay.density_kg_per_L,
      evidence: Array.isArray(assay.evidence) ? clone(assay.evidence) : [],
    };
    definition.site.brineAssay = definition.site.assay;
  }
}

function buildAbundancePlant(site) {
  if (typeof abundance?.createAbundanceCase !== 'function') {
    throw new Error('Abundance case is not loaded');
  }
  const assayId = resolveAbundanceAssayId(site);
  // Regional offtake: createAbundanceCase({ region }) maps site.region via TeaScreening.
  const definition = abundance.createAbundanceCase({ assayId, region: site.region });
  const solar = frozenSolarFor(site, 'abundance');
  attachAbundanceSite(definition, site, solar);
  overlaySiteIdentity(definition, site, [SCREENING_NOTE]);
  assumeScreeningBrine(definition);
  applyFrozenSolar(definition, solar, 'abundance');
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

function hasOperatingSlate(row) {
  const tonnes = finiteNumber(row?.tonnes ?? row?.totalPositiveSaleTonnes, 0);
  if (tonnes > 0) return true;
  if (finiteNumber(row?.positiveSaleCount, 0) > 0) return true;
  if (Array.isArray(row?.products) && row.products.some(product => finiteNumber(product.tonnesPerYear, 0) > 0)) {
    return true;
  }
  if (row?.slate && Object.values(row.slate).some(tonnes => Number(tonnes) > 0)) return true;
  return false;
}

function selectedRatePositive(row) {
  return finiteNumber(row?.selected?.rate, 0) > 0;
}

function isIdleCandidate(row) {
  if (hasOperatingSlate(row) || selectedRatePositive(row)) return false;
  const cash = jsonNumber(row?.annualNetCash);
  if (cash != null && cash < -IDLE_CASH_EPS) return false;
  return true;
}

function compareNearMisses(left, right) {
  const idleLeft = isIdleCandidate(left) ? 1 : 0;
  const idleRight = isIdleCandidate(right) ? 1 : 0;
  if (idleLeft !== idleRight) return idleLeft - idleRight;
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

function rankNearMisses(candidates = []) {
  return candidates.slice().sort(compareNearMisses);
}

function rightsScenarioFor(site, template, { evaluated = false } = {}) {
  if (isMapLayerTemplate(template)) return RIGHTS_NONE;
  if (evaluated && template === 'abundance') return RIGHTS_SCREENING;
  const hints = site?.rightsHints || {};
  const intakeOrConcession = hints.seawaterIntake || hints.brineConcession;
  if (intakeOrConcession && (intakeOrConcession.status === 'assumed' || intakeOrConcession.authorize === true)) {
    return RIGHTS_SCREENING;
  }
  if (evaluated && (template === 'coastal' || template === 'methanol')) return RIGHTS_SCREENING;
  return RIGHTS_NONE;
}

function fuelProductForTemplate(template) {
  if (template === 'coastal') return 'CH4';
  if (template === 'methanol') return 'methanol';
  return null;
}

function assayIdForRow(site, template) {
  if (template === 'abundance') return resolveAbundanceAssayId(site);
  return site.seawaterAssayId || (site.assayKind === 'seawater' ? site.assayId : null);
}

function skippedRow(site, template, eligibility) {
  return {
    siteId: site.id,
    siteName: site.name,
    template,
    assayId: assayIdForRow(site, template),
    slate: {},
    annualNetCash: null,
    tonnes: 0,
    totalPositiveSaleTonnes: 0,
    positiveSaleCount: 0,
    products: [],
    met: false,
    feasible: false,
    idle: false,
    status: 'skipped',
    reason: eligibility.reason,
    rightsScenario: rightsScenarioFor(site, template, { evaluated: false }),
    notes: [eligibility.notes, SCREENING_NOTE].filter(Boolean),
  };
}

function errorRow(site, template, error, notes = []) {
  const message = error?.message || String(error);
  return {
    siteId: site.id,
    siteName: site.name,
    template,
    assayId: assayIdForRow(site, template),
    slate: {},
    annualNetCash: null,
    tonnes: 0,
    totalPositiveSaleTonnes: 0,
    positiveSaleCount: 0,
    products: [],
    met: false,
    feasible: false,
    idle: false,
    status: 'error',
    reason: message,
    rightsScenario: rightsScenarioFor(site, template, { evaluated: false }),
    notes: [...notes, message, SCREENING_NOTE],
  };
}

function evaluateCandidate(site, template, sizeOpts = {}) {
  const notes = [SCREENING_NOTE];
  const solar = frozenSolarFor(site, template);
  if (!solar && (template === 'coastal' || template === 'methanol')) {
    return skippedRow(site, template, {
      reason: 'no-frozen-pvgis',
      notes: 'Coastal/methanol templates need a frozen per-site PVGIS series; not applied with another site\'s kWh/kWp.',
    });
  }
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
  let annualNetCash = jsonNumber(objective.annualNetCash ?? economics.annualNetCash);
  let met = Boolean(objective.met) && annualNetCash != null && annualNetCash > 0;
  let { tonnes, products } = saleProducts(objective, economics);
  let positiveSaleCount = finiteNumber(objective.positiveSaleCount, met ? products.length : 0);
  let selected = sized.selected || null;
  const slate = slateFromNetwork(sized.definition, site);
  const fuelProduct = fuelProductForTemplate(template);
  if (!met) {
    notes.push(fuelProduct
      ? 'No cash-positive fuel slate under searched rates at TEA screening prices; not an invented fuel winner.'
      : 'No cash-positive slate under the searched discrete grid; not an invented fuel winner.');
  }
  if (Array.isArray(sized.warnings)) {
    for (const warning of sized.warnings) {
      if (warning && !notes.includes(warning)) notes.push(warning);
    }
  }
  const row = {
    siteId: site.id,
    siteName: site.name,
    template,
    assayId: template === 'abundance'
      ? (definition.meta?.assayId || resolveAbundanceAssayId(site))
      : (site.seawaterAssayId || site.assayId),
    slate,
    annualNetCash,
    tonnes,
    totalPositiveSaleTonnes: tonnes,
    positiveSaleCount,
    products,
    met,
    feasible: met,
    status: 'ok',
    selected,
    rightsScenario: rightsScenarioFor(site, template, { evaluated: true }),
    notes,
  };
  row.idle = isIdleCandidate(row);
  if (row.idle) {
    notes.push('Idle (selected rate 0 / no positive sale tonnes and cash≈0); not a near-miss operating slate.');
  }
  const probeFn = sensitivityApi?.probeFuelCash;
  if (!met && !row.idle && fuelProduct && sizeOpts.fuelProbe !== false && typeof probeFn === 'function') {
    const probe = probeFn({
      definition: sized.definition,
      solved: sized.solved,
      product: fuelProduct,
      selected,
    });
    row.breakEvenPrice = probe.breakEvenPrice;
    row.bestCash = probe.bestCash;
    row.fuelProbe = {
      met: probe.met,
      best: probe.best,
      bounds: probe.bounds,
      label: probe.label,
      breakEvenPriceInBand: probe.breakEvenPriceInBand,
    };
    if (probe.note && !notes.includes(probe.note)) notes.push(probe.note);
    row.notes = notes.filter(note => (
      note !== 'No cash-positive fuel slate under searched rates at TEA screening prices; not an invented fuel winner.'
    ));
    if (probe.met) {
      const probed = saleProducts(probe.objective, probe.economics);
      met = true;
      annualNetCash = jsonNumber(probe.bestCash);
      tonnes = probed.tonnes;
      products = probed.products;
      positiveSaleCount = finiteNumber(probe.objective?.positiveSaleCount, probed.products.length);
      selected = {
        ...(selected || {}),
        screeningPrice: probe.best?.price,
        capexFactor: probe.best?.capexFactor,
        label: 'screening',
      };
      row.met = true;
      row.feasible = true;
      row.idle = false;
      row.annualNetCash = annualNetCash;
      row.tonnes = tonnes;
      row.totalPositiveSaleTonnes = tonnes;
      row.products = products;
      row.positiveSaleCount = positiveSaleCount;
      row.selected = selected;
      row.notes = notes.filter(note => !/no cash-positive/i.test(note));
      if (probe.note && !row.notes.includes(probe.note)) row.notes.push(probe.note);
    } else if (Number.isFinite(probe.bestCash)) {
      row.annualNetCash = probe.bestCash;
    }
  }
  return row;
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
  const nearMissPool = evaluated.filter(row => (
    row.status === 'ok' && !row.feasible && !row.idle
  ));
  const nearMisses = includeNearMisses
    ? rankNearMisses(nearMissPool).slice(0, topN)
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
  RIGHTS_SCREENING,
  RIGHTS_NONE,
  MAP_LAYER_IDS,
  SEARCH_SCALES,
  SEARCH_RATES,
  FAST_SCALES,
  FAST_RATES,
  searchAbundanceSites,
  rankCandidates,
  compareNearMisses,
  rankNearMisses,
  isIdleCandidate,
  defaultSearchSites,
  templateEligible,
  evaluateCandidate,
  buildAbundancePlant,
  resolveAbundanceAssayId,
  frozenSolarFor,
};
});
