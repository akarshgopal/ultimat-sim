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
    } : {
      'almeria-seawater': root.AlmeriaSeawater,
      'persian-gulf-seawater': root.PersianGulfSeawater,
      'red-sea-seawater': root.RedSeaSeawater,
      'texas-gulf-seawater': root.TexasGulfSeawater,
      'pilbara-indian-ocean-seawater': root.PilbaraIndianOceanSeawater,
      'atacama-pacific-seawater': root.AtacamaPacificSeawater,
      'morocco-atlantic-seawater': root.MoroccoAtlanticSeawater,
    }
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteAssays = api;
})(globalThis, (model, assays) => {
  const { SUBSTANCES } = model;

  /** Preset id → assay file id. Only presets with a frozen literature assay. */
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
  });

  const SCREENING_INTAKE_M3_PER_DAY = 0.1;

  function getAssay(assayId) {
    if (!assayId || !assays[assayId]) return null;
    return assays[assayId];
  }

  function assayIdForPreset(presetId) {
    return PRESET_ASSAY_IDS[presetId] || null;
  }

  function seawaterFromAssay(assayData, massKg) {
    const gPerKg = assayData.ions_g_per_kg;
    const molPerKg = assayData.mol_per_kg;
    const saltMassKg = Object.values(gPerKg).reduce((sum, grams) => sum + grams, 0) / 1000 * massKg;
    const mol = {
      H2O: (massKg - saltMassKg) * 1000 / SUBSTANCES.H2O.molarMassG,
    };
    for (const [id, amount] of Object.entries(molPerKg)) mol[id] = amount * massKg;
    return { kind: 'material', phase: 'liquid', T_C: 25, P_bar: 1, mol };
  }

  function siteAssaySummary(assayData) {
    const S = assayData.salinity_g_per_kg;
    const ctx = assayData.meta?.site?.context || assayData.meta?.quality || '';
    return `${S} g/kg Millero/Pilson S=35 majors scaled ${S}/35; multi-ion, not a NaCl proxy or intake permit. ${ctx}`.slice(0, 280);
  }

  function bindAssayToSite(site, assayData, { intakeM3PerDay = SCREENING_INTAKE_M3_PER_DAY } = {}) {
    if (!site || !assayData) return site;
    const densityKgM3 = assayData.density_kg_per_L * 1000;
    const massKg = intakeM3PerDay * densityKgM3;
    const stream = seawaterFromAssay(assayData, massKg);
    const evidence = Array.isArray(assayData.evidence)
      ? assayData.evidence.map((item) => ({ ...item }))
      : [];
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

  function bindPresetAssay(site, presetId) {
    const assayId = assayIdForPreset(presetId);
    if (!assayId) {
      if (site) {
        site.assay = site.assay || {
          kind: 'seawater',
          quality: 'screening',
          summary: 'No frozen multi-ion assay for this preset — composition not bound; select a cited-assay coast or keep screening.',
          evidence: [],
        };
      }
      return site;
    }
    return bindAssayToSite(site, getAssay(assayId));
  }

  return {
    PRESET_ASSAY_IDS,
    SCREENING_INTAKE_M3_PER_DAY,
    getAssay,
    assayIdForPreset,
    seawaterFromAssay,
    bindAssayToSite,
    bindPresetAssay,
    assayIds: Object.keys(assays),
  };
});
