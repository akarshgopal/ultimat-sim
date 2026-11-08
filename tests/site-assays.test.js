const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { SUBSTANCES, streamMassKg } = require('../engine/model');
const SiteAssays = require('../data/site-assays');
const presets = require('../data/site-presets');

test('every registered assay parses with finite, consistent ions and cited sources', () => {
  assert.ok(SiteAssays.assayIds.length > SiteAssays.brineAssayIds.length);
  for (const id of SiteAssays.assayIds) {
    const assay = SiteAssays.getAssay(id);
    assert.ok(assay, id);
    const jsonPath = path.join(__dirname, '..', 'data', `${id}.json`);
    if (fs.existsSync(jsonPath)) {
      assert.equal(assay.salinity_g_per_kg, JSON.parse(fs.readFileSync(jsonPath, 'utf8')).salinity_g_per_kg, id);
    }
    const brine = SiteAssays.brineAssayIds.includes(id);
    const [minDensity, maxDensity] = brine ? [1.05, 1.4] : [1, 1.05];
    const [minSalinity, maxSalinity] = brine ? [50, 400] : [30, 45];
    assert.ok(assay.density_kg_per_L > minDensity && assay.density_kg_per_L < maxDensity, id);
    assert.ok(assay.salinity_g_per_kg > minSalinity && assay.salinity_g_per_kg < maxSalinity, id);
    for (const [ion, grams] of Object.entries(assay.ions_g_per_kg)) {
      assert.ok(SUBSTANCES[ion], `${id} unexpected ion ${ion}`);
      assert.ok(Number.isFinite(grams) && grams > 0, `${id} ${ion}`);
      assert.ok(Math.abs(assay.mol_per_kg[ion] - grams / SUBSTANCES[ion].molarMassG) < 1e-9, `${id} ${ion} mol`);
    }
    if (!brine) {
      for (const ion of ['Cl-', 'Na+', 'SO4-2', 'Mg+2', 'Ca+2', 'K+', 'Br-']) assert.ok(assay.ions_g_per_kg[ion] > 0, `${id} ${ion}`);
    }
    assert.equal(assay.ions_g_per_kg.HCO3, undefined, id);
    assert.ok(assay.evidence.length > 0 && assay.evidence.every(item => /^https?:\/\//.test(item.url)), id);
  }
});

test('every preset assay resolves and binds seawater and/or brine resources from the cited ions', () => {
  for (const [presetId, assayId] of Object.entries(SiteAssays.PRESET_ASSAY_IDS)) {
    assert.equal(presets.find(p => p.id === presetId)?.assayId, assayId, presetId);
  }
  for (const [presetId, assayId] of Object.entries(SiteAssays.PRESET_BRINE_ASSAY_IDS)) {
    assert.equal(presets.find(p => p.id === presetId)?.brineAssayId, assayId, presetId);
  }
  for (const preset of presets) {
    assert.equal(SiteAssays.assayIdForPreset(preset.id) || undefined, preset.assayId || undefined, preset.id);
    assert.equal(SiteAssays.brineAssayIdForPreset(preset.id) || undefined, preset.brineAssayId || undefined, preset.id);
    const site = { resources: {} };
    SiteAssays.bindPresetAssay(site, preset.id);
    if (preset.assayId) {
      assert.equal(site.assay.kind, 'seawater', preset.id);
      assert.equal(site.assay.assayId, preset.assayId, preset.id);
      assert.ok(site.resources.seawater.stream.mol['Na+'] > 0, preset.id);
      assert.ok(streamMassKg(site.resources.seawater.stream) > 0, preset.id);
    } else {
      assert.equal(site.resources.seawater, undefined, preset.id);
    }
    if (preset.brineAssayId) {
      const assay = SiteAssays.getAssay(preset.brineAssayId);
      const brine = site.resources.brine.stream.mol;
      assert.equal((preset.assayId ? site.brineAssay : site.assay).assayId, preset.brineAssayId, preset.id);
      for (const ion of ['Li+', 'Br-', 'Ca+2']) {
        assert.equal(brine[ion] > 0, assay.ions_g_per_kg[ion] > 0, `${preset.id} ${ion} follows the assay`);
      }
    } else {
      assert.equal(site.resources.brine, undefined, preset.id);
    }
  }

  const bare = { resources: {} };
  SiteAssays.bindPresetAssay(bare, 'not-a-preset');
  assert.equal(bare.assay.quality, 'screening');
  assert.equal(bare.resources.seawater, undefined);
  assert.equal(bare.resources.brine, undefined);
});
