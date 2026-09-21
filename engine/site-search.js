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
    typeof require === 'function' ? require('../data/pvgis-sites.js') : root.PvgisSites,
    typeof require === 'function' ? require('./map-site') : root.FlowsheetMapSite,
    typeof require === 'function' ? require('./sensitivity') : root.FlowsheetSensitivity
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetSiteSearch = api;
})(globalThis, (sizeApi, networkApi, coastal, methanol, abundance, networkCase, sitePresets, siteAssays, pvgisSites, mapSite, sensitivityApi) => {

const PLANT_TEMPLATES = Object.freeze(['abundance', 'coastal', 'methanol']);
const DEAD_SEA_SITE_ID = 'dead-sea-pvgis-2026-09-06';
const SCREENING_NOTE = 'Screening assumes intake/concession for evaluation only; not a bankable permit.';
const LAYER_SOFT_NOTE = 'Map-layer sun/water/land score is a soft rank only; map layers are not optimizer objectives.';
const RIGHTS_SCREENING = 'screening-assumes-intake-concession';
const RIGHTS_INTAKE_ONLY = 'screening-assumes-intake-only';
const RIGHTS_NO_RIGHTS = 'no-rights';
const RIGHTS_OFFTAKE = 'offtake-limited';
const RIGHTS_NO_GRID = 'no-grid';
const RIGHTS_FRESHWATER = 'freshwater-constrained';
const RIGHTS_DISCHARGE = 'discharge-limited';
const RIGHTS_NONE = 'no-rights-modeled';
const RIGHTS_SCENARIOS = Object.freeze([
  RIGHTS_SCREENING, RIGHTS_INTAKE_ONLY, RIGHTS_NO_RIGHTS, RIGHTS_OFFTAKE,
  RIGHTS_NO_GRID, RIGHTS_FRESHWATER, RIGHTS_DISCHARGE,
]);
// 0.1× Chile Li still exceeds catalog plant scale; 0.01× binds so offtake actually changes cash.
const OFFTAKE_DEMAND_FACTOR = 0.01;
// Islanded / no-interconnection screening overlay (~diesel genset order). Chile industrial mid is ~$0.07/kWh — too small to move cash 10%.
const NO_GRID_POWER_USD_PER_KWH = 0.5;
const NO_RIGHTS_NOTE = 'No-rights scenario: intake/concession are not assumed. A literature assay is not a mineral concession; not a bankable permit.';
const INTAKE_ONLY_NOTE = 'Screening-assumes-intake-only: seawater intake may be assumed for evaluation; brine concession is not. A literature assay is not a mineral concession; not a bankable permit.';
const OFFTAKE_NOTE = `Offtake-limited scenario: regional demand caps scaled by ${OFFTAKE_DEMAND_FACTOR} for screening; not a plant offtake contract. ${SCREENING_NOTE}`;
const NO_GRID_NOTE = `No-grid scenario: expensive grid-power overlay $${NO_GRID_POWER_USD_PER_KWH}/kWh screening (islanded / no cheap interconnection); not a PPA. ${SCREENING_NOTE}`;
const FRESHWATER_NOTE = 'Freshwater-constrained scenario: no freshwater right. Process-water plants skip; not a municipal allocation. Screening assumes intake/concession for evaluation only; not a bankable permit.';
const DISCHARGE_NOTE = 'Discharge-limited scenario: no seawater outfall permit. Coastal/methanol plants skip; not a discharge right. Screening assumes intake/concession for evaluation only; not a bankable permit.';
const MAP_LAYER_IDS = Object.freeze(['pvgis', 'water', 'land']);
const SEARCH_SCALES = Object.freeze([0.25, 0.5, 1, 2, 4]);
const SEARCH_RATES = Object.freeze([0, 1, 2, 5, 10]);
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

function normalizeRightsScenario(value) {
  if (value == null || value === '') return RIGHTS_SCREENING;
  const raw = String(value).trim().toLowerCase();
  if (raw === RIGHTS_SCREENING || raw === 'screening' || raw === 'screening-assumes') {
    return RIGHTS_SCREENING;
  }
  if (raw === RIGHTS_INTAKE_ONLY || raw === 'intake-only' || raw === 'assumes-intake-only') {
    return RIGHTS_INTAKE_ONLY;
  }
  if (raw === RIGHTS_NO_RIGHTS || raw === 'none') return RIGHTS_NO_RIGHTS;
  if (raw === RIGHTS_OFFTAKE || raw === 'ofstake-limited' || raw === 'offtake') {
    return RIGHTS_OFFTAKE;
  }
  if (raw === RIGHTS_NO_GRID || raw === 'nogrid' || raw === 'grid-denied') return RIGHTS_NO_GRID;
  if (raw === RIGHTS_FRESHWATER || raw === 'freshwater' || raw === 'no-freshwater') {
    return RIGHTS_FRESHWATER;
  }
  if (raw === RIGHTS_DISCHARGE || raw === 'discharge' || raw === 'no-discharge') {
    return RIGHTS_DISCHARGE;
  }
  throw new Error(`Unknown rightsScenario ${value}`);
}

function scenarioNote(scenario) {
  if (scenario === RIGHTS_NO_RIGHTS) return NO_RIGHTS_NOTE;
  if (scenario === RIGHTS_INTAKE_ONLY) return INTAKE_ONLY_NOTE;
  if (scenario === RIGHTS_OFFTAKE) return OFFTAKE_NOTE;
  if (scenario === RIGHTS_NO_GRID) return NO_GRID_NOTE;
  if (scenario === RIGHTS_FRESHWATER) return FRESHWATER_NOTE;
  if (scenario === RIGHTS_DISCHARGE) return DISCHARGE_NOTE;
  return SCREENING_NOTE;
}

function templateNeedsConcession(template) {
  return template === 'abundance';
}

function templateNeedsIntakeOrConcession(template) {
  return template === 'abundance' || template === 'coastal' || template === 'methanol';
}

function templateNeedsFreshwater(template) {
  return template === 'abundance';
}

function templateNeedsDischarge(template) {
  return template === 'coastal' || template === 'methanol';
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

function templateEligible(site, template, rightsScenario) {
  if (isMapLayerTemplate(template)) {
    return {
      ok: false,
      reason: 'map-layer-not-objective',
      notes: 'Map layers are screening overlays, not plant templates or optimizer objectives.',
    };
  }
  if (template === 'abundance') {
    if (!site?.hasBrineAssay) {
      return {
        ok: false,
        reason: 'no-brine-assay',
        notes: 'Seawater Millero assays are not brine assays; abundance template skipped.',
      };
    }
  } else if (template === 'coastal' || template === 'methanol') {
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
  } else {
    return { ok: false, reason: 'unknown-template', notes: `Unknown plant template ${template}` };
  }
  const scenario = normalizeRightsScenario(rightsScenario);
  if (scenario === RIGHTS_NO_RIGHTS && templateNeedsIntakeOrConcession(template)) {
    return {
      ok: false,
      reason: 'no-rights',
      notes: 'Intake/concession would be required and are not assumed in the no-rights scenario.',
    };
  }
  if (scenario === RIGHTS_INTAKE_ONLY && templateNeedsConcession(template)) {
    return {
      ok: false,
      reason: 'no-concession',
      notes: 'Brine concession would be required and is not assumed in the screening-assumes-intake-only scenario.',
    };
  }
  if (scenario === RIGHTS_FRESHWATER && templateNeedsFreshwater(template)) {
    return {
      ok: false,
      reason: 'no-freshwater',
      notes: 'Process freshwater would be required and is denied in the freshwater-constrained scenario.',
    };
  }
  if (scenario === RIGHTS_DISCHARGE && templateNeedsDischarge(template)) {
    return {
      ok: false,
      reason: 'no-discharge',
      notes: 'Seawater outfall would be required and is denied in the discharge-limited scenario.',
    };
  }
  return { ok: true };
}

function frozenSolarFor(site, template) {
  if (!site) return null;
  const registered = pvgisSites?.frozenSolarFor?.(site, template);
  if (registered) {
    if ((site.id === 'spain-almeria' || site.id === 'almeria-pvgis-2026-09-05') && template === 'coastal') {
      return { ...registered, keepHourly: true, nativeTemplate: 'coastal' };
    }
    return registered;
  }
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

function saleKeyForNode(node) {
  const id = String(node?.id || '');
  const aliases = {
    lithium: 'lithium',
    magnesium: 'magnesium',
    potash: 'potash',
    gypsum: 'gypsum',
    salt: 'salt',
    'recovered-salt': 'salt',
    caustic: 'caustic',
    bromine: 'bromine',
    bromide: 'bromine',
    ammonia: 'ammonia',
    'ammonia-product': 'ammonia',
    oxygen: 'oxygen',
    methane: 'methane',
    methanol: 'methanol',
    'methanol-product': 'methanol',
    water: 'water',
    'process-water': 'water',
    'sabatier-water': 'water',
  };
  return aliases[id] || null;
}

function applyRegionalTea(definition, region) {
  const tea = abundance?.TEA;
  if (!definition?.graph?.nodes || !region || !tea?.bindSale) return;
  for (const node of definition.graph.nodes) {
    const econ = node.economics;
    if (!econ) continue;
    if (econ.disposition === 'sale') {
      const key = saleKeyForNode(node);
      if (key && tea.prices?.[key]) {
        node.economics = { ...econ, ...tea.bindSale(key, { region }) };
      }
    }
    const powerPurchase = (node.unit === 'electricity-source' || node.id === 'power' || node.id === 'electricity')
      && econ.unitCost != null
      && econ.installedCapex == null
      && econ.capexRate == null;
    if (powerPurchase && tea.bindCost) {
      node.economics = { ...econ, ...tea.bindCost('power', { region }) };
    }
  }
}

function revokeRight(definition, key, kind, note) {
  definition.site = definition.site || {};
  definition.site.rights = definition.site.rights || {};
  const prev = definition.site.rights[key] && typeof definition.site.rights[key] === 'object'
    ? definition.site.rights[key]
    : {};
  definition.site.rights[key] = {
    kind: prev.kind || kind,
    status: 'unverified',
    authorize: false,
    note: prev.note ? `${prev.note} ${note}` : note,
  };
}

function revokeAssumedIntakeAndConcession(definition) {
  revokeRight(
    definition,
    'seawaterIntake',
    'intake',
    'No-rights scenario: intake/concession not assumed; not a permit.'
  );
  revokeRight(
    definition,
    'brineConcession',
    'concession',
    'No-rights scenario: intake/concession not assumed; not a permit.'
  );
}

function revokeAssumedConcession(definition) {
  revokeRight(
    definition,
    'brineConcession',
    'concession',
    'Intake-only scenario does not assume a brine concession; a literature assay is not a mineral concession.'
  );
}

function applyOfftakeDemandHaircut(definition, factor = OFFTAKE_DEMAND_FACTOR) {
  const nodes = definition?.graph?.nodes || [];
  for (const node of nodes) {
    const economics = node?.economics;
    if (!economics || economics.disposition !== 'sale') continue;
    const cap = Number(economics.annualDemandLimit);
    if (Number.isFinite(cap)) economics.annualDemandLimit = cap * factor;
  }
}

function isElectricitySourceNode(node) {
  return node?.unit === 'electricity-source'
    || node?.id === 'power'
    || node?.id === 'electricity'
    || node?.siteResource === 'electricity';
}

function applyNoGridPowerOverlay(definition) {
  revokeRight(
    definition,
    'gridImport',
    'grid',
    'No-grid scenario: no cheap interconnection; expensive grid-power overlay applied to electricity sources.'
  );
  const nodes = definition?.graph?.nodes || [];
  for (const node of nodes) {
    if (!isElectricitySourceNode(node)) continue;
    const prev = node.economics && typeof node.economics === 'object' ? node.economics : {};
    const extra = `No-grid scenario: expensive grid-power overlay $${NO_GRID_POWER_USD_PER_KWH}/kWh screening; not a PPA.`;
    node.economics = {
      ...prev,
      unitCost: NO_GRID_POWER_USD_PER_KWH,
      note: prev.note ? `${prev.note} ${extra}` : extra,
    };
  }
}

function applyFreshwaterConstraint(definition) {
  revokeRight(
    definition,
    'freshwater',
    'freshwater',
    'Freshwater-constrained scenario: no freshwater right; not a municipal allocation.'
  );
  const resource = definition?.site?.resources?.freshwater;
  if (resource) {
    resource.stream = {
      kind: 'material',
      mol: { H2O: 0 },
      phase: 'liquid',
      T_C: 25,
      P_bar: 1,
    };
  }
}

function applyDischargeLimit(definition) {
  revokeRight(
    definition,
    'seawaterDischarge',
    'discharge',
    'Discharge-limited scenario: no seawater outfall permit; not a discharge right.'
  );
}

function applyRightsScenario(definition, template, scenario) {
  if (scenario === RIGHTS_NO_RIGHTS) {
    revokeAssumedIntakeAndConcession(definition);
    return;
  }
  if (scenario === RIGHTS_INTAKE_ONLY) {
    revokeAssumedConcession(definition);
    return;
  }
  if (template === 'abundance') assumeScreeningBrine(definition);
  if (scenario === RIGHTS_OFFTAKE) applyOfftakeDemandHaircut(definition);
  if (scenario === RIGHTS_NO_GRID) applyNoGridPowerOverlay(definition);
  if (scenario === RIGHTS_FRESHWATER) applyFreshwaterConstraint(definition);
  if (scenario === RIGHTS_DISCHARGE) applyDischargeLimit(definition);
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
  if (!site) return null;
  if (isDeadSeaHub(site)) return site.brineAssayId || site.assayId || 'dead-sea-brine';
  if (site.hasBrineAssay === false) return null;
  if (site.assayKind === 'brine' && site.assayId && isBrineAssayId(site.assayId)) return site.assayId;
  if (site.brineAssayId) return site.brineAssayId;
  const mapped = siteAssays?.brineAssayIdForPreset?.(site.id);
  if (mapped) return mapped;
  if (site.hasBrineAssay && site.assayId && isBrineAssayId(site.assayId)) return site.assayId;
  return null;
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

function buildAbundancePlant(site, rightsScenario) {
  if (typeof abundance?.createAbundanceCase !== 'function') {
    throw new Error('Abundance case is not loaded');
  }
  const scenario = normalizeRightsScenario(rightsScenario);
  const assayId = resolveAbundanceAssayId(site);
  if (!assayId) throw new Error('Abundance plant needs a cited brine assay');
  // Regional offtake: createAbundanceCase({ region }) maps site.region via TeaScreening.
  const definition = abundance.createAbundanceCase({ assayId, region: site.region });
  const solar = frozenSolarFor(site, 'abundance');
  attachAbundanceSite(definition, site, solar);
  overlaySiteIdentity(definition, site, [scenarioNote(scenario)]);
  applyFrozenSolar(definition, solar, 'abundance');
  applyRegionalTea(definition, site.region);
  applyRightsScenario(definition, 'abundance', scenario);
  return definition;
}

function buildFuelPlant(site, template, rightsScenario) {
  const scenario = normalizeRightsScenario(rightsScenario);
  const builder = template === 'methanol' ? methanol?.createMethanolCase : coastal?.createCoastalCase;
  if (typeof builder !== 'function') throw new Error(`${template} case is not loaded`);
  const definition = builder(0);
  const intake = Number(
    (template === 'methanol' ? methanol?.INTAKE_M3_PER_DAY : coastal?.INTAKE_M3_PER_DAY) || 0.1
  );
  const solarNote = applyFrozenSolar(definition, frozenSolarFor(site, template), template);
  overlaySiteIdentity(definition, site, [scenarioNote(scenario), solarNote].filter(Boolean));
  bindSeawaterAssay(definition, site, intake);
  applyRegionalTea(definition, site.region);
  applyRightsScenario(definition, template, scenario);
  return definition;
}

function buildPlant(site, template, rightsScenario) {
  if (template === 'abundance') return buildAbundancePlant(site, rightsScenario);
  if (template === 'coastal' || template === 'methanol') return buildFuelPlant(site, template, rightsScenario);
  throw new Error(`Unknown plant template ${template}`);
}

function saleProducts(objective, economics) {
  const products = [];
  let tonnes = 0;
  for (const sink of economics?.sinks || []) {
    if (sink?.disposition !== 'sale' || !(sink.annualRevenue > 0)) continue;
    const kgYear = finiteNumber(sink.deliveredAmount, 0);
    const tonnesPerYear = kgYear / 1000;
    tonnes += tonnesPerYear;
    products.push({
      id: sink.id,
      tonnesPerYear,
      annualRevenue: finiteNumber(sink.annualRevenue, 0),
      // Reporting: this is an active R_i>0 sale. Cash gate is row.met, not CM sign.
      positive: true,
      active: true,
    });
  }
  products.sort((left, right) => {
    if (right.tonnesPerYear !== left.tonnesPerYear) return right.tonnesPerYear - left.tonnesPerYear;
    return String(left.id).localeCompare(String(right.id), 'en');
  });
  return { tonnes, products };
}

function reportingSaleCount(objective, products) {
  const fromActive = finiteNumber(objective?.activeSaleCount, NaN);
  if (Number.isFinite(fromActive) && fromActive > 0) return fromActive;
  if (Array.isArray(products) && products.length) return products.length;
  return finiteNumber(objective?.positiveSaleCount, 0);
}

function saleCountOf(row) {
  return finiteNumber(row?.activeSaleCount, finiteNumber(row?.positiveSaleCount, 0));
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

function layerScoreForSite(site) {
  if (typeof mapSite?.layerScoreAt !== 'function') return null;
  const solar = frozenSolarFor(site);
  const daily = Number(solar?.dailyPVKWhPerKWp);
  const overrides = Number.isFinite(daily) && daily > 0
    ? { dailyPVKWhPerKWp: daily, frozen: true }
    : undefined;
  const score = mapSite.layerScoreAt(site?.latitude, site?.longitude, overrides);
  return Number.isFinite(score) ? score : null;
}

function withLayerScore(row, site) {
  const score = layerScoreForSite(site);
  row.layerScore = score;
  row.softRank = score;
  return row;
}

function compareIds(left, right) {
  const site = String(left?.siteId || '').localeCompare(String(right?.siteId || ''), 'en');
  if (site) return site;
  return String(left?.template || '').localeCompare(String(right?.template || ''), 'en');
}

function layerScoreValue(row) {
  const raw = row?.layerScore ?? row?.softRank;
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareLayerScore(left, right) {
  const scoreLeft = layerScoreValue(left);
  const scoreRight = layerScoreValue(right);
  if (scoreLeft == null || scoreRight == null) return 0;
  if (scoreLeft !== scoreRight) return scoreRight - scoreLeft;
  return 0;
}

function compareCandidates(left, right) {
  const feasLeft = left?.feasible || left?.met ? 1 : 0;
  const feasRight = right?.feasible || right?.met ? 1 : 0;
  if (feasLeft !== feasRight) return feasRight - feasLeft;
  const tonnesLeft = finiteNumber(left?.tonnes ?? left?.totalPositiveSaleTonnes, 0);
  const tonnesRight = finiteNumber(right?.tonnes ?? right?.totalPositiveSaleTonnes, 0);
  if (tonnesLeft !== tonnesRight) return tonnesRight - tonnesLeft;
  const countLeft = saleCountOf(left);
  const countRight = saleCountOf(right);
  if (countLeft !== countRight) return countRight - countLeft;
  const cashLeft = finiteNumber(left?.annualNetCash, 0);
  const cashRight = finiteNumber(right?.annualNetCash, 0);
  if (cashLeft !== cashRight) return cashRight - cashLeft;
  const soft = compareLayerScore(left, right);
  if (soft) return soft;
  return compareIds(left, right);
}

function rankCandidates(candidates = []) {
  return candidates.slice().sort(compareCandidates);
}

function hasOperatingSlate(row) {
  const tonnes = finiteNumber(row?.tonnes ?? row?.totalPositiveSaleTonnes, 0);
  if (tonnes > 0) return true;
  if (saleCountOf(row) > 0) return true;
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
  const countLeft = saleCountOf(left);
  const countRight = saleCountOf(right);
  if (countLeft !== countRight) return countRight - countLeft;
  const cashLeft = finiteNumber(left?.annualNetCash, 0);
  const cashRight = finiteNumber(right?.annualNetCash, 0);
  if (cashLeft !== cashRight) return cashRight - cashLeft;
  const soft = compareLayerScore(left, right);
  if (soft) return soft;
  return compareIds(left, right);
}

function rankNearMisses(candidates = []) {
  return candidates.slice().sort(compareNearMisses);
}

function rightsScenarioFor(template, searchScenario) {
  if (isMapLayerTemplate(template)) return RIGHTS_NONE;
  return normalizeRightsScenario(searchScenario);
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

const ABUNDANCE_SALE_IDS = Object.freeze([
  'lithium', 'magnesium', 'potash', 'gypsum', 'salt', 'recovered-salt', 'caustic', 'bromine', 'bromide',
]);
const FUEL_SALE_IDS = Object.freeze(['methane', 'methanol', 'methanol-product', 'hydrogen', 'h2']);

function selectedFamilyForRow(template, selected, products) {
  if (!selected || template !== 'abundance') return selected;
  let mineralTonnes = 0;
  let fuelTonnes = 0;
  for (const product of products || []) {
    const tonnes = finiteNumber(product?.tonnesPerYear, 0);
    const id = String(product?.id || '');
    if (ABUNDANCE_SALE_IDS.includes(id) || id === 'ammonia' || id === 'ammonia-product') mineralTonnes += tonnes;
    else if (FUEL_SALE_IDS.includes(id)) fuelTonnes += tonnes;
  }
  if (!(mineralTonnes > 0 && mineralTonnes >= fuelTonnes)) return selected;
  if (selected.family === 'abundance' && selected.product !== 'ammonia') return selected;
  const next = { family: 'abundance' };
  if (Number.isFinite(Number(selected.scale))) next.scale = Number(selected.scale);
  if (selected.slateMode) next.slateMode = selected.slateMode;
  return next;
}

function skippedRow(site, template, eligibility, rightsScenario) {
  const scenario = normalizeRightsScenario(rightsScenario);
  return withLayerScore({

    siteId: site.id,
    siteName: site.name,
    template,
    assayId: assayIdForRow(site, template),
    slate: {},
    annualNetCash: null,
    tonnes: 0,
    totalPositiveSaleTonnes: 0,
    positiveSaleCount: 0,
    activeSaleCount: 0,
    products: [],
    met: false,
    feasible: false,
    idle: false,
    status: 'skipped',
    reason: eligibility.reason,
    rightsScenario: rightsScenarioFor(template, scenario),
    notes: [eligibility.notes, scenarioNote(scenario)].filter(Boolean),
  }, site);

}

function errorRow(site, template, error, notes = [], rightsScenario) {
  const scenario = normalizeRightsScenario(rightsScenario);
  const message = error?.message || String(error);
  return withLayerScore({
    siteId: site.id,
    siteName: site.name,
    template,
    assayId: assayIdForRow(site, template),
    slate: {},
    annualNetCash: null,
    tonnes: 0,
    totalPositiveSaleTonnes: 0,
    positiveSaleCount: 0,
    activeSaleCount: 0,
    products: [],
    met: false,
    feasible: false,
    idle: false,
    status: 'error',
    reason: message,
    rightsScenario: rightsScenarioFor(template, scenario),
    notes: [...notes, message, scenarioNote(scenario)],
  }, site);

}

function evaluateCandidate(site, template, sizeOpts = {}) {
  const rightsScenario = normalizeRightsScenario(sizeOpts.rightsScenario);
  const notes = [scenarioNote(rightsScenario)];
  const eligibility = templateEligible(site, template, rightsScenario);
  if (!eligibility.ok) {
    return skippedRow(site, template, eligibility, rightsScenario);
  }
  const solar = frozenSolarFor(site, template);
  if (!solar && (template === 'coastal' || template === 'methanol')) {
    return skippedRow(site, template, {
      reason: 'no-frozen-pvgis',
      notes: 'Coastal/methanol templates need a frozen per-site PVGIS series; not applied with another site\'s kWh/kWp.',
    }, rightsScenario);
  }
  if (!solar) notes.push('No frozen PVGIS series for this site; screening uses the plant-template solar, not a local yield.');
  let definition;
  try {
    definition = buildPlant(site, template, rightsScenario);
  } catch (error) {
    return errorRow(site, template, error, notes, rightsScenario);
  }
  if (!sizeApi?.sizeForPositiveCashflow) {
    return errorRow(site, template, new Error('sizeForPositiveCashflow is not loaded'), notes, rightsScenario);
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
    if (/cannot assume|no feasible/i.test(error.message || '')) {
      if (rightsScenario === RIGHTS_NO_RIGHTS || rightsScenario === RIGHTS_INTAKE_ONLY) {
        const intakeOnly = rightsScenario === RIGHTS_INTAKE_ONLY;
        return skippedRow(site, template, {
          reason: intakeOnly ? 'no-concession' : 'no-rights',
          notes: intakeOnly
            ? 'Size/solve cannot grow unauthorized brine concession.'
            : 'Size/solve cannot grow unauthorized intake or brine concession.',
        }, rightsScenario);
      }
      if (rightsScenario === RIGHTS_FRESHWATER) {
        return skippedRow(site, template, {
          reason: 'no-freshwater',
          notes: 'Size/solve cannot grow unauthorized freshwater.',
        }, rightsScenario);
      }
      if (rightsScenario === RIGHTS_DISCHARGE) {
        return skippedRow(site, template, {
          reason: 'no-discharge',
          notes: 'Size/solve cannot grow unauthorized seawater discharge.',
        }, rightsScenario);
      }
    }
    return errorRow(site, template, error, notes, rightsScenario);
  }
  const objective = sized.objective || {};
  const economics = sized.economics || {};
  let annualNetCash = jsonNumber(objective.annualNetCash ?? economics.annualNetCash);
  let met = Boolean(objective.met) && annualNetCash != null && annualNetCash > 0;
  let { tonnes, products } = saleProducts(objective, economics);
  // Row counts are reporting: active R_i>0 sinks even when cash≤0. Maximizer
  // still uses objective.met + objective.positiveSaleCount (met-gated).
  let activeSaleCount = reportingSaleCount(objective, products);
  let positiveSaleCount = activeSaleCount;
  let selected = selectedFamilyForRow(template, sized.selected || null, products);
  const slate = slateFromNetwork(sized.definition, site);
  const fuelProduct = fuelProductForTemplate(template);
  if (!met) {
    notes.push(fuelProduct
      ? 'No cash-positive fuel slate under searched rates at TEA screening prices; not an invented fuel winner.'
      : 'No cash-positive slate under the searched coarse-then-refine grid; not an invented fuel winner.');
  }
  if (Array.isArray(sized.warnings)) {
    for (const warning of sized.warnings) {
      if (warning && !notes.includes(warning)) notes.push(warning);
    }
  }
  const row = withLayerScore({
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
    activeSaleCount,
    products,
    met,
    feasible: met,
    status: 'ok',
    selected,
    rightsScenario: rightsScenarioFor(template, rightsScenario),
    notes,
  }, site);
  if (!notes.includes(LAYER_SOFT_NOTE)) notes.push(LAYER_SOFT_NOTE);
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
    const midMet = Boolean(probe.midMet ?? probe.met);
    row.breakEvenPrice = probe.breakEvenPrice;
    row.bestCash = probe.bestCash;
    row.midCash = probe.midCash;
    row.fuelProbe = {
      met: midMet,
      midMet,
      mid: probe.mid,
      best: probe.best,
      bounds: probe.bounds,
      label: probe.label,
      breakEvenPriceInBand: probe.breakEvenPriceInBand,
    };
    if (probe.note && !notes.includes(probe.note)) notes.push(probe.note);
    row.notes = notes.filter(note => (
      note !== 'No cash-positive fuel slate under searched rates at TEA screening prices; not an invented fuel winner.'
    ));
    if (midMet) {
      const probed = saleProducts(probe.objective, probe.economics);
      met = true;
      annualNetCash = jsonNumber(probe.midCash ?? probe.mid?.annualNetCash);
      tonnes = probed.tonnes;
      products = probed.products;
      activeSaleCount = reportingSaleCount(probe.objective, probed.products);
      positiveSaleCount = activeSaleCount;
      selected = {
        ...(selected || {}),
        screeningPrice: probe.mid?.price,
        capexFactor: 1,
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
      row.activeSaleCount = activeSaleCount;
      row.selected = selected;
      row.notes = notes.filter(note => !/no cash-positive/i.test(note));
      if (probe.note && !row.notes.includes(probe.note)) row.notes.push(probe.note);
    } else {
      selected = {
        ...(selected || {}),
        screeningPrice: probe.best?.price,
        capexFactor: probe.best?.capexFactor,
        label: 'screening-edge',
      };
      row.selected = selected;
      if (Number.isFinite(probe.midCash)) row.annualNetCash = probe.midCash;
      else if (Number.isFinite(probe.bestCash)) row.annualNetCash = probe.bestCash;
    }
  }
  return row;
}

function resolveSizeOpts(sizeOpts = {}) {
  const scales = sizeOpts.scales && sizeOpts.scales.length ? sizeOpts.scales : SEARCH_SCALES.slice();
  const rates = sizeOpts.rates && sizeOpts.rates.length ? sizeOpts.rates : SEARCH_RATES.slice();
  const refine = sizeOpts.refine != null
    ? Boolean(sizeOpts.refine)
    : (sizeOpts.fast !== true && (scales.length >= 2 || rates.length >= 2));
  return { ...sizeOpts, scales, rates, refine };
}

function searchAbundanceSites(opts = {}) {
  const rawSites = opts.sites == null ? defaultSearchSites() : opts.sites;
  const sites = (Array.isArray(rawSites) ? rawSites : [])
    .map(normalizeSite)
    .filter(Boolean);
  const templates = normalizeTemplates(opts.templates);
  const topN = Number.isFinite(Number(opts.topN)) && Number(opts.topN) > 0 ? Math.floor(Number(opts.topN)) : 10;
  const rightsScenario = normalizeRightsScenario(opts.rightsScenario);
  const sizeOpts = resolveSizeOpts({ ...(opts.sizeOpts || {}), rightsScenario });
  const includeNearMisses = opts.nearMisses !== false;

  const skipped = [];
  const evaluated = [];
  for (const site of sites) {
    for (const template of templates) {
      const eligibility = templateEligible(site, template, rightsScenario);
      if (!eligibility.ok) {
        skipped.push(skippedRow(site, template, eligibility, rightsScenario));
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
    rightsScenario,
    notes: [scenarioNote(rightsScenario), LAYER_SOFT_NOTE],

  };
}

return {
  PLANT_TEMPLATES,
  DEAD_SEA_SITE_ID,
  SCREENING_NOTE,
  LAYER_SOFT_NOTE,
  RIGHTS_SCREENING,
  RIGHTS_INTAKE_ONLY,
  RIGHTS_NO_RIGHTS,
  RIGHTS_OFFTAKE,
  RIGHTS_NO_GRID,
  RIGHTS_FRESHWATER,
  RIGHTS_DISCHARGE,
  RIGHTS_NONE,
  RIGHTS_SCENARIOS,
  OFFTAKE_DEMAND_FACTOR,
  NO_GRID_POWER_USD_PER_KWH,
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
  buildFuelPlant,
  resolveAbundanceAssayId,
  frozenSolarFor,
  applyRegionalTea,
  normalizeRightsScenario,
};
});
