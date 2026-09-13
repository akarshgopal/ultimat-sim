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

test('presets that claim an assay resolve via registry', () => {
  const claimed = presets.filter((p) => p.assayId);
  assert.ok(claimed.length >= 10, `expected ≥10 assay presets, got ${claimed.length}`);
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
  assert.equal(gulf.assay.salinity_g_per_kg, 40.5);
  assert.ok(gulf.resources.seawater.stream.mol['Na+'] > 0);
  assert.ok(gulf.resources.seawater.stream.mol.H2O > 0);
  assert.match(gulf.resources.seawater.evidence, /not an intake/i);

  const bare = { resources: {} };
  SiteAssays.bindPresetAssay(bare, 'oman-duqm');
  assert.equal(bare.assay.quality, 'screening');
  assert.equal(bare.resources.seawater, undefined);
});
