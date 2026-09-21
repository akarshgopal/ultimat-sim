const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES } = require('../engine/model');
const SiteAssays = require('../data/site-assays');
const presets = require('../data/site-presets');

const ASSAY_FILES = [
  'almeria-seawater',
  'persian-gulf-seawater',
  'red-sea-seawater',
  'texas-gulf-seawater',
  'pilbara-indian-ocean-seawater',
  'atacama-pacific-seawater',
  'morocco-atlantic-seawater',
  'arabian-sea-seawater',
  'gulf-of-kutch-seawater',
  'benguela-atlantic-seawater',
];

for (const id of ASSAY_FILES) {
  test(`assay ${id} parses with finite Millero-scale ions`, () => {
    const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', `${id}.json`), 'utf8'));
    const js = require(`../data/${id}.js`);
    assert.equal(js.salinity_g_per_kg, json.salinity_g_per_kg);
    assert.ok(Number.isFinite(js.density_kg_per_L) && js.density_kg_per_L > 1 && js.density_kg_per_L < 1.05);
    assert.ok(Number.isFinite(js.salinity_g_per_kg) && js.salinity_g_per_kg > 30 && js.salinity_g_per_kg < 45);
    for (const ion of ['Cl-', 'Na+', 'SO4-2', 'Mg+2', 'Ca+2', 'K+', 'Br-']) {
      assert.ok(Number.isFinite(js.ions_g_per_kg[ion]) && js.ions_g_per_kg[ion] > 0, ion);
      const expectedMol = js.ions_g_per_kg[ion] / SUBSTANCES[ion].molarMassG;
      assert.ok(Math.abs(js.mol_per_kg[ion] - expectedMol) < 1e-9, `${ion} mol`);
    }
    assert.equal(js.ions_g_per_kg.HCO3, undefined);
    assert.ok(js.evidence.some((item) => /doi\.org\/10\.1016\/j\.dsr\.2007\.10\.001/.test(item.url)));
    assert.match(js.meta.retrieved, /^2026-09-/);
  });
}

test('Duqm Mundra Walvis assays are cited basin typicals, not intake permits', () => {
  const cases = [
    ['arabian-sea-seawater', 36.3, /10\.1029\/1998JC900022/],
    ['gulf-of-kutch-seawater', 37.2, /10\.1016\/j\.marpolbul\.2007\.01\.022/],
    ['benguela-atlantic-seawater', 35.2, /10\.1016\/j\.csr\.2007\.10\.001/],
  ];
  for (const [id, salinity, cite] of cases) {
    const assay = SiteAssays.getAssay(id);
    assert.ok(assay, id);
    assert.equal(assay.salinity_g_per_kg, salinity);
    assert.equal(assay.meta.retrieved, '2026-09-21');
    assert.ok(assay.evidence.some((item) => cite.test(item.url)), id);
    assert.match(assay.meta.quality, /not a .*intake/i);
  }
  assert.equal(SiteAssays.assayIdForPreset('oman-duqm'), 'arabian-sea-seawater');
  assert.equal(SiteAssays.assayIdForPreset('india-mundra'), 'gulf-of-kutch-seawater');
  assert.equal(SiteAssays.assayIdForPreset('namibia-walvis-bay'), 'benguela-atlantic-seawater');
});

test('presets that claim an assay resolve via registry', () => {
  const claimed = presets.filter((p) => p.assayId);
  assert.ok(claimed.length >= 15, `expected ≥15 assay presets, got ${claimed.length}`);
  for (const preset of claimed) {
    assert.equal(SiteAssays.assayIdForPreset(preset.id), preset.assayId);
    const assay = SiteAssays.getAssay(preset.assayId);
    assert.ok(assay, preset.assayId);
    assert.equal(assay.meta?.id || preset.assayId, preset.assayId);
  }
  for (const [presetId, assayId] of Object.entries(SiteAssays.PRESET_ASSAY_IDS)) {
    const preset = presets.find((p) => p.id === presetId);
    assert.ok(preset, presetId);
    assert.equal(preset.assayId, assayId);
  }
});

test('bindPresetAssay attaches cited seawater resource for Gulf / screening note otherwise', () => {
  const gulf = { resources: {} };
  SiteAssays.bindPresetAssay(gulf, 'uae-taweelah');
  assert.equal(gulf.assay.quality, 'cited');
  assert.equal(gulf.assay.kind, 'seawater');
  assert.equal(gulf.assay.salinity_g_per_kg, 40.5);
  assert.ok(gulf.resources.seawater.stream.mol['Na+'] > 0);
  assert.ok(gulf.resources.seawater.stream.mol.H2O > 0);
  assert.match(gulf.resources.seawater.evidence, /not an intake/i);
  assert.equal(gulf.brineAssay.kind, 'brine');
  assert.equal(gulf.brineAssay.quality, 'cited');
  assert.equal(gulf.brineAssay.assayId, 'persian-gulf-sabkha-brine');
  assert.doesNotMatch(gulf.brineAssay.summary, /Millero|Pilson/);
  assert.ok(gulf.resources.brine.stream.mol['Na+'] > 0);
  assert.ok(gulf.resources.brine.stream.mol.H2O > 0);
  assert.equal(gulf.resources.brine.stream.mol['Li+'], undefined);
  assert.equal(gulf.resources.brine.stream.mol['Br-'], undefined);
  assert.match(gulf.resources.brine.evidence, /not a mineral concession/i);

  const duqm = { resources: {} };
  SiteAssays.bindPresetAssay(duqm, 'oman-duqm');
  assert.equal(duqm.assay.quality, 'cited');
  assert.equal(duqm.assay.kind, 'seawater');
  assert.equal(duqm.assay.assayId, 'arabian-sea-seawater');
  assert.equal(duqm.assay.salinity_g_per_kg, 36.3);
  assert.ok(duqm.resources.seawater.stream.mol['Na+'] > 0);
  assert.match(duqm.resources.seawater.evidence, /not an intake/i);
  assert.equal(duqm.resources.brine, undefined);

  const mundra = { resources: {} };
  SiteAssays.bindPresetAssay(mundra, 'india-mundra');
  assert.equal(mundra.assay.quality, 'cited');
  assert.equal(mundra.assay.assayId, 'gulf-of-kutch-seawater');
  assert.equal(mundra.assay.salinity_g_per_kg, 37.2);
  assert.match(mundra.assay.summary, /37\.2/);

  const walvis = { resources: {} };
  SiteAssays.bindPresetAssay(walvis, 'namibia-walvis-bay');
  assert.equal(walvis.assay.assayId, 'benguela-atlantic-seawater');
  assert.equal(walvis.assay.salinity_g_per_kg, 35.2);
  assert.equal(walvis.assay.quality, 'cited');

  const bare = { resources: {} };
  SiteAssays.bindPresetAssay(bare, 'not-a-preset');
  assert.equal(bare.assay.quality, 'screening');
  assert.equal(bare.resources.seawater, undefined);
  assert.equal(bare.resources.brine, undefined);
});

const BRINE_ASSAY_FILES = [
  'persian-gulf-sabkha-brine',
  'atacama-lithium-brine',
  'lake-mackay-wa-brine',
  'great-salt-lake-brine',
  'salton-sea-brine',
  'uyuni-lithium-brine',
  'qaidam-brine',
  'danakil-brine',
  'searles-lake-brine',
];

for (const id of BRINE_ASSAY_FILES) {
  test(`process brine ${id} parses with cited ions only`, () => {
    const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', `${id}.json`), 'utf8'));
    const js = require(`../data/${id}.js`);
    assert.equal(js.salinity_g_per_kg, json.salinity_g_per_kg);
    assert.equal(js.meta.id, id);
    assert.match(js.meta.retrieved, /^2026-09-/);
    assert.ok(Number.isFinite(js.density_kg_per_L) && js.density_kg_per_L > 1.05 && js.density_kg_per_L < 1.4);
    assert.ok(Number.isFinite(js.salinity_g_per_kg) && js.salinity_g_per_kg > 50 && js.salinity_g_per_kg < 400);
    const ionSum = Object.values(js.ions_g_per_kg).reduce((sum, grams) => sum + grams, 0);
    assert.ok(Math.abs(js.salinity_g_per_kg - ionSum) < 1e-9);
    for (const [ion, grams] of Object.entries(js.ions_g_per_kg)) {
      assert.ok(Number.isFinite(grams) && grams > 0, ion);
      assert.ok(SUBSTANCES[ion], `unexpected ion ${ion}`);
      const expectedMol = grams / SUBSTANCES[ion].molarMassG;
      assert.ok(Math.abs(js.mol_per_kg[ion] - expectedMol) < 1e-9, `${ion} mol`);
    }
    assert.equal(Object.keys(js.mol_per_kg).sort().join(), Object.keys(js.ions_g_per_kg).sort().join());
    assert.equal(js.ions_g_per_kg.HCO3, undefined);
    assert.equal(js.ions_g_per_kg['HCO3-'], undefined);
    if (id === 'persian-gulf-sabkha-brine' || id === 'lake-mackay-wa-brine') {
      assert.equal(js.ions_g_per_kg['Li+'], undefined);
      assert.equal(js.ions_g_per_kg['Br-'], undefined);
    }
    if (id === 'atacama-lithium-brine' || id === 'lake-mackay-wa-brine' || id === 'great-salt-lake-brine') {
      assert.equal(js.ions_g_per_kg['Ca+2'], undefined);
      assert.equal(js.ions_g_per_kg['Br-'], undefined);
    }
    if (id === 'salton-sea-brine') {
      assert.ok(js.ions_g_per_kg['Li+'] > 0);
      assert.ok(js.ions_g_per_kg['Br-'] > 0);
      assert.ok(js.ions_g_per_kg['Ca+2'] > 0);
      assert.ok(js.evidence.some((item) => /doi\.org\/10\.3390\/en14206805/.test(item.url)));
      assert.ok(js.evidence.some((item) => /doi\.org\/10\.2172\/1782801/.test(item.url)));
    }
    if (id === 'uyuni-lithium-brine') {
      assert.ok(js.ions_g_per_kg['Li+'] > 0);
      assert.ok(js.ions_g_per_kg['Ca+2'] > 0);
      assert.equal(js.ions_g_per_kg['Br-'], undefined);
      assert.ok(js.evidence.some((item) => /doi\.org\/10\.3389\/fceng\.2022\.1008680/.test(item.url)));
    }
    if (id === 'qaidam-brine') {
      assert.equal(js.ions_g_per_kg['Li+'], undefined);
      assert.ok(js.ions_g_per_kg['Br-'] > 0);
      assert.ok(js.evidence.some((item) => /doi\.org\/10\.3389\/fenvs\.2023\.1106181/.test(item.url)));
    }
    if (id === 'danakil-brine') {
      assert.equal(js.ions_g_per_kg['Li+'], undefined);
      assert.equal(js.ions_g_per_kg['SO4-2'], undefined);
      assert.ok(js.ions_g_per_kg['Ca+2'] > 0);
      assert.ok(js.evidence.some((item) => /doi\.org\/10\.1016\/B978-012276152-2/.test(item.url)));
    }
    if (id === 'searles-lake-brine') {
      assert.ok(js.ions_g_per_kg['Li+'] > 0);
      assert.ok(js.ions_g_per_kg['Br-'] > 0);
      assert.equal(js.ions_g_per_kg['Ca+2'], undefined);
      assert.ok(js.evidence.some((item) => /archive\.org\/details\/industrialdevelo00teep/.test(item.url)));
      assert.ok(js.evidence.some((item) => /doi\.org\/10\.3133\/pp1043/.test(item.url)));
    }
    assert.ok(js.evidence.length > 0);
    assert.ok(js.evidence.every((item) => /^https:\/\//.test(item.url)));
    assert.ok(!js.evidence.some((item) => /doi\.org\/10\.1016\/j\.dsr\.2007\.10\.001/.test(item.url)));
    assert.equal(SiteAssays.getAssay(id), js);
    assert.ok(SiteAssays.assayIds.includes(id));
    assert.ok(SiteAssays.brineAssayIds.includes(id));
  });
}

test('brineAssayId on presets resolves via PRESET_BRINE_ASSAY_IDS / getAssay', () => {
  const claimed = presets.filter((p) => p.brineAssayId);
  assert.ok(claimed.length >= 8, `expected ≥8 brine-assay presets, got ${claimed.length}`);
  for (const preset of claimed) {
    assert.equal(SiteAssays.brineAssayIdForPreset(preset.id), preset.brineAssayId);
    const assay = SiteAssays.getAssay(preset.brineAssayId);
    assert.ok(assay, preset.brineAssayId);
    assert.equal(assay.meta.id, preset.brineAssayId);
    assert.equal(assay.meta.kind, 'brine');
  }
  for (const [presetId, assayId] of Object.entries(SiteAssays.PRESET_BRINE_ASSAY_IDS)) {
    const preset = presets.find((p) => p.id === presetId);
    assert.ok(preset, presetId);
    assert.equal(preset.brineAssayId, assayId);
  }
  assert.equal(SiteAssays.brineAssayIdForPreset('spain-almeria'), null);
  assert.equal(SiteAssays.brineAssayIdForPreset('us-great-salt-lake'), 'great-salt-lake-brine');
  assert.equal(SiteAssays.brineAssayIdForPreset('us-salton-sea'), 'salton-sea-brine');
  assert.equal(SiteAssays.brineAssayIdForPreset('chile-salar-de-atacama'), 'atacama-lithium-brine');
  assert.equal(SiteAssays.brineAssayIdForPreset('bolivia-uyuni'), 'uyuni-lithium-brine');
  assert.equal(SiteAssays.brineAssayIdForPreset('china-qaidam'), 'qaidam-brine');
  assert.equal(SiteAssays.brineAssayIdForPreset('ethiopia-danakil'), 'danakil-brine');
  assert.equal(SiteAssays.brineAssayIdForPreset('us-searles-lake'), 'searles-lake-brine');
  assert.equal(SiteAssays.assayIdForPreset('saudi-ras-al-khair'), 'persian-gulf-seawater');
  assert.equal(SiteAssays.brineAssayIdForPreset('saudi-ras-al-khair'), 'persian-gulf-sabkha-brine');
  assert.equal(SiteAssays.assayIdForPreset('saudi-yanbu'), 'red-sea-seawater');
  assert.ok(SiteAssays.getAssay('great-salt-lake-brine'));
  assert.ok(SiteAssays.getAssay('salton-sea-brine'));
});

test('inland Lake Mackay preset binds only process brine', () => {
  const inland = { resources: {} };
  SiteAssays.bindPresetAssay(inland, 'au-lake-mackay');
  assert.equal(inland.assay.kind, 'brine');
  assert.equal(inland.assay.quality, 'cited');
  assert.equal(inland.assay.assayId, 'lake-mackay-wa-brine');
  assert.doesNotMatch(inland.assay.summary, /Millero|Pilson/);
  assert.equal(inland.resources.seawater, undefined);
  assert.ok(inland.resources.brine.stream.mol['Na+'] > 0);
  assert.equal(inland.resources.brine.stream.mol['Li+'], undefined);
});

test('inland Great Salt Lake and Salar de Atacama presets bind only cited process brine', () => {
  const gsl = { resources: {} };
  SiteAssays.bindPresetAssay(gsl, 'us-great-salt-lake');
  assert.equal(gsl.assay.kind, 'brine');
  assert.equal(gsl.assay.quality, 'cited');
  assert.equal(gsl.assay.assayId, 'great-salt-lake-brine');
  assert.equal(gsl.brineAssay.assayId, 'great-salt-lake-brine');
  assert.doesNotMatch(gsl.assay.summary, /Millero|Pilson/);
  assert.equal(gsl.resources.seawater, undefined);
  assert.ok(gsl.resources.brine.stream.mol['Na+'] > 0);
  assert.ok(gsl.resources.brine.stream.mol['Li+'] > 0);
  assert.match(gsl.resources.brine.evidence, /not a mineral concession/i);

  const salar = { resources: {} };
  SiteAssays.bindPresetAssay(salar, 'chile-salar-de-atacama');
  assert.equal(salar.assay.kind, 'brine');
  assert.equal(salar.assay.assayId, 'atacama-lithium-brine');
  assert.equal(salar.resources.seawater, undefined);
  assert.ok(salar.resources.brine.stream.mol['Li+'] > gsl.resources.brine.stream.mol['Li+'] * 10);
  assert.match(salar.resources.brine.evidence, /not a mineral concession/i);
});

test('inland Salton Sea binds only cited geothermal process brine with lithium', () => {
  const salton = { resources: {} };
  SiteAssays.bindPresetAssay(salton, 'us-salton-sea');
  assert.equal(salton.assay.kind, 'brine');
  assert.equal(salton.assay.quality, 'cited');
  assert.equal(salton.assay.assayId, 'salton-sea-brine');
  assert.equal(salton.brineAssay.assayId, 'salton-sea-brine');
  assert.doesNotMatch(salton.assay.summary, /Millero|Pilson/);
  assert.equal(salton.resources.seawater, undefined);
  assert.ok(salton.resources.brine.stream.mol['Na+'] > 0);
  assert.ok(salton.resources.brine.stream.mol['Li+'] > 0);
  assert.ok(salton.resources.brine.stream.mol['Br-'] > 0);
  assert.ok(salton.resources.brine.stream.mol['Ca+2'] > 0);
  assert.match(salton.resources.brine.evidence, /not a mineral concession/i);
});

test('Ras Al-Khair dual-assay binds Gulf seawater and sabkha brine', () => {
  const ras = { resources: {} };
  SiteAssays.bindPresetAssay(ras, 'saudi-ras-al-khair');
  assert.equal(ras.assay.kind, 'seawater');
  assert.equal(ras.assay.assayId, 'persian-gulf-seawater');
  assert.equal(ras.brineAssay.kind, 'brine');
  assert.equal(ras.brineAssay.assayId, 'persian-gulf-sabkha-brine');
  assert.ok(ras.resources.seawater.stream.mol['Na+'] > 0);
  assert.ok(ras.resources.brine.stream.mol['Na+'] > 0);
  assert.equal(ras.resources.brine.stream.mol['Li+'], undefined);
  assert.match(ras.resources.brine.evidence, /not a mineral concession/i);
});

test('new catalog basins bind only cited process brine', () => {
  const uyuni = { resources: {} };
  SiteAssays.bindPresetAssay(uyuni, 'bolivia-uyuni');
  assert.equal(uyuni.assay.kind, 'brine');
  assert.equal(uyuni.assay.quality, 'cited');
  assert.equal(uyuni.assay.assayId, 'uyuni-lithium-brine');
  assert.equal(uyuni.brineAssay.assayId, 'uyuni-lithium-brine');
  assert.doesNotMatch(uyuni.assay.summary, /Millero|Pilson/);
  assert.equal(uyuni.resources.seawater, undefined);
  assert.ok(uyuni.resources.brine.stream.mol['Li+'] > 0);
  assert.ok(uyuni.resources.brine.stream.mol['Ca+2'] > 0);
  assert.match(uyuni.resources.brine.evidence, /not a mineral concession/i);

  const qaidam = { resources: {} };
  SiteAssays.bindPresetAssay(qaidam, 'china-qaidam');
  assert.equal(qaidam.assay.assayId, 'qaidam-brine');
  assert.equal(qaidam.resources.seawater, undefined);
  assert.equal(qaidam.resources.brine.stream.mol['Li+'], undefined);
  assert.ok(qaidam.resources.brine.stream.mol['Br-'] > 0);
  assert.match(qaidam.resources.brine.evidence, /not a mineral concession/i);

  const danakil = { resources: {} };
  SiteAssays.bindPresetAssay(danakil, 'ethiopia-danakil');
  assert.equal(danakil.assay.assayId, 'danakil-brine');
  assert.equal(danakil.resources.seawater, undefined);
  assert.equal(danakil.resources.brine.stream.mol['Li+'], undefined);
  assert.ok(danakil.resources.brine.stream.mol['Ca+2'] > 0);
  assert.match(danakil.resources.brine.evidence, /not a mineral concession/i);

  const searles = { resources: {} };
  SiteAssays.bindPresetAssay(searles, 'us-searles-lake');
  assert.equal(searles.assay.assayId, 'searles-lake-brine');
  assert.equal(searles.resources.seawater, undefined);
  assert.ok(searles.resources.brine.stream.mol['Li+'] > 0);
  assert.ok(searles.resources.brine.stream.mol['Br-'] > 0);
  assert.match(searles.resources.brine.evidence, /not a mineral concession/i);
});
