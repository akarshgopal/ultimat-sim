(function exposeSiteAssays(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../engine/model') : root.FlowsheetModel,
    typeof require === 'function' ? {
      'almeria-seawater': require('./almeria-seawater.js'),
      'persian-gulf-seawater': require('./persian-gulf-seawater.js'),
      'red-sea-seawater': require('./red-sea-seawater.js'),
      'texas-gulf-seawater': require('./texas-gulf-seawater.js'),
      'pilbara-indian-ocean-seawater': require('./pilbara-indian-ocean-seawater.js'),
      'atacama-pacific-seawater': require('./atacama-pacific-seawater.js'),
      'morocco-atlantic-seawater': require('./morocco-atlantic-seawater.js'),
      'arabian-sea-seawater': require('./arabian-sea-seawater.js'),
      'gulf-of-kutch-seawater': require('./gulf-of-kutch-seawater.js'),
      'benguela-atlantic-seawater': require('./benguela-atlantic-seawater.js'),
      'persian-gulf-sabkha-brine': require('./persian-gulf-sabkha-brine.js'),
      'atacama-lithium-brine': require('./atacama-lithium-brine.js'),
      'lake-mackay-wa-brine': require('./lake-mackay-wa-brine.js'),
      'great-salt-lake-brine': require('./great-salt-lake-brine.js'),
    } : {
      'almeria-seawater': root.AlmeriaSeawater,
      'persian-gulf-seawater': root.PersianGulfSeawater,
      'red-sea-seawater': root.RedSeaSeawater,
      'texas-gulf-seawater': root.TexasGulfSeawater,
      'pilbara-indian-ocean-seawater': root.PilbaraIndianOceanSeawater,
      'atacama-pacific-seawater': root.AtacamaPacificSeawater,
      'morocco-atlantic-seawater': root.MoroccoAtlanticSeawater,
      'arabian-sea-seawater': root.ArabianSeaSeawater,
      'gulf-of-kutch-seawater': root.GulfOfKutchSeawater,
      'benguela-atlantic-seawater': root.BenguelaAtlanticSeawater,
      'persian-gulf-sabkha-brine': root.PersianGulfSabkhaBrine,
      'atacama-lithium-brine': root.AtacamaLithiumBrine,
      'lake-mackay-wa-brine': root.LakeMackayWaBrine,
      'great-salt-lake-brine': root.GreatSaltLakeBrine,
    }
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteAssays = api;
})(globalThis, (model, assays) => {
  const { SUBSTANCES } = model;

  /** Preset id → seawater assay file id. Only presets with a frozen literature assay. */
  const PRESET_ASSAY_IDS = Object.freeze({
    'spain-almeria': 'almeria-seawater',
    'uae-taweelah': 'persian-gulf-seawater',
    'qatar-ras-laffan': 'persian-gulf-seawater',
    'saudi-oxagon': 'red-sea-seawater',
    'egypt-ain-sokhna': 'red-sea-seawater',
    'texas-corpus-christi': 'texas-gulf-seawater',
    'au-port-hedland': 'pilbara-indian-ocean-seawater',
    'au-kwinana': 'pilbara-indian-ocean-seawater',
    'chile-mejillones': 'atacama-pacific-seawater',
    'morocco-agadir': 'morocco-atlantic-seawater',
    'morocco-dakhla': 'morocco-atlantic-seawater',
    'oman-duqm': 'arabian-sea-seawater',
    'india-mundra': 'gulf-of-kutch-seawater',
    'namibia-walvis-bay': 'benguela-atlantic-seawater',
  });

  /** Preset id → process-brine assay file id. Literature brine is not a mineral concession. */
  const PRESET_BRINE_ASSAY_IDS = Object.freeze({
    'uae-taweelah': 'persian-gulf-sabkha-brine',
    'qatar-ras-laffan': 'persian-gulf-sabkha-brine',
    'chile-mejillones': 'atacama-lithium-brine',
    'au-port-hedland': 'lake-mackay-wa-brine',
    'au-lake-mackay': 'lake-mackay-wa-brine',
  });

  const BRINE_ASSAY_IDS = Object.freeze([
    'persian-gulf-sabkha-brine',
    'atacama-lithium-brine',
    'lake-mackay-wa-brine',
    'great-salt-lake-brine',
  ]);

  const SCREENING_INTAKE_M3_PER_DAY = 0.1;

  function getAssay(assayId) {
    if (!assayId || !assays[assayId]) return null;
    return assays[assayId];
  }

  function assayIdForPreset(presetId) {
    return PRESET_ASSAY_IDS[presetId] || null;
  }

  function brineAssayIdForPreset(presetId) {
    return PRESET_BRINE_ASSAY_IDS[presetId] || null;
  }

  function materialFromAssay(assayData, massKg) {
    const gPerKg = assayData.ions_g_per_kg;
    const molPerKg = assayData.mol_per_kg;
    const saltMassKg = Object.values(gPerKg).reduce((sum, grams) => sum + grams, 0) / 1000 * massKg;
    const mol = {
      H2O: (massKg - saltMassKg) * 1000 / SUBSTANCES.H2O.molarMassG,
    };
    for (const [id, amount] of Object.entries(molPerKg)) mol[id] = amount * massKg;
    return { kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1, mol };
  }

  function seawaterFromAssay(assayData, massKg) {
    return materialFromAssay(assayData, massKg);
  }

  function brineFromAssay(assayData, massKg) {
    return materialFromAssay(assayData, massKg);
  }

  function isBrineAssay(assayData) {
    return assayData?.meta?.kind === 'brine' || /brine/i.test(assayData?.meta?.id || '');
  }

  function siteAssaySummary(assayData) {
    const S = assayData.salinity_g_per_kg;
    const ctx = assayData.meta?.site?.context || assayData.meta?.quality || '';
    if (isBrineAssay(assayData)) {
      return `${S} g/kg cited process-brine majors; multi-ion, not a seawater desal feed or mineral concession. ${ctx}`.slice(0, 280);
    }
    return `${S} g/kg Millero/Pilson S=35 majors scaled ${S}/35; multi-ion, not a NaCl proxy or intake permit. ${ctx}`.slice(0, 280);
  }

  function cloneEvidence(assayData) {
    return Array.isArray(assayData.evidence)
      ? assayData.evidence.map((item) => ({ ...item }))
      : [];
  }

  function bindAssayToSite(site, assayData, { intakeM3PerDay = SCREENING_INTAKE_M3_PER_DAY } = {}) {
    if (!site || !assayData) return site;
    const densityKgM3 = assayData.density_kg_per_L * 1000;
    const massKg = intakeM3PerDay * densityKgM3;
    const stream = seawaterFromAssay(assayData, massKg);
    const evidence = cloneEvidence(assayData);
    site.assay = {
      kind: 'seawater',
      assayId: assayData.meta?.id || null,
      summary: siteAssaySummary(assayData),
      quality: 'cited',
      salinity_g_per_kg: assayData.salinity_g_per_kg,
      density_kg_per_L: assayData.density_kg_per_L,
      evidence,
    };
    site.resources = site.resources || {};
    site.resources.seawater = {
      stream,
      quality: 'cited',
      evidence: `Frozen multi-ion assay ${assayData.meta?.id || ''}: Millero-scale majors at S=${assayData.salinity_g_per_kg}. Screening intake ${intakeM3PerDay} m³/day; not an intake or discharge permit.`,
    };
    return site;
  }

  function bindBrineAssayToSite(site, assayData, { intakeM3PerDay = SCREENING_INTAKE_M3_PER_DAY } = {}) {
    if (!site || !assayData) return site;
    const densityKgM3 = assayData.density_kg_per_L * 1000;
    const massKg = intakeM3PerDay * densityKgM3;
    const stream = brineFromAssay(assayData, massKg);
    const evidence = cloneEvidence(assayData);
    const brineAssay = {
      kind: 'brine',
      assayId: assayData.meta?.id || null,
      summary: siteAssaySummary(assayData),
      quality: 'cited',
      salinity_g_per_kg: assayData.salinity_g_per_kg,
      density_kg_per_L: assayData.density_kg_per_L,
      evidence,
    };
    site.brineAssay = brineAssay;
    if (!site.assay || site.assay.kind !== 'seawater') site.assay = brineAssay;
    site.resources = site.resources || {};
    site.resources.brine = {
      stream,
      quality: 'cited',
      evidence: `Frozen process-brine assay ${assayData.meta?.id || ''}: cited literature ions at S=${assayData.salinity_g_per_kg} g/kg. Screening intake ${intakeM3PerDay} m³/day; literature assay is not a mineral concession.`,
    };
    return site;
  }

  function bindPresetAssay(site, presetId) {
    const assayId = assayIdForPreset(presetId);
    const brineAssayId = brineAssayIdForPreset(presetId);
    if (assayId) bindAssayToSite(site, getAssay(assayId));
    if (brineAssayId) bindBrineAssayToSite(site, getAssay(brineAssayId));
    if (!assayId && !brineAssayId && site) {
      site.assay = site.assay || {
        kind: 'seawater',
        quality: 'screening',
        summary: 'No frozen multi-ion assay for this preset — composition not bound; select a cited-assay coast or keep screening.',
        evidence: [],
      };
    }
    return site;
  }

  return {
    PRESET_ASSAY_IDS,
    PRESET_BRINE_ASSAY_IDS,
    SCREENING_INTAKE_M3_PER_DAY,
    getAssay,
    assayIdForPreset,
    brineAssayIdForPreset,
    seawaterFromAssay,
    brineFromAssay,
    bindAssayToSite,
    bindBrineAssayToSite,
    bindPresetAssay,
    brineAssayIds: BRINE_ASSAY_IDS.slice(),
    assayIds: Object.keys(assays),
  };
});
