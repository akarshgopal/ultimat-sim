// Every engine/designs module follows the contract in engine/designs/README.md, which the Designs
// view and the company simulator rely on. Per-design behaviour is in tests/design-<id>.test.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ROOT, close } = require('./helpers.js');

const DIR = path.join(ROOT, 'engine', 'designs');
const FILES = fs.readdirSync(DIR).filter(file => file.endsWith('.js'));

for (const file of FILES) {
  test(`design ${file} follows the module contract`, () => {
    const D = require(path.join(DIR, file));
    assert.equal(D.id, path.basename(file, '.js'), 'id is the file name');
    assert.ok(D.units.length >= 1);
    for (const unit of D.units) assert.ok(D.RECIPE[unit].usdPerKgDay > 0 && D.RECIPE[unit].kWhPerKg > 0, `RECIPE.${unit}`);
    assert.ok(D.PRESETS.today && D.PRESETS.lean, 'today and lean presets');
    for (const c of D.CONTROLS) assert.ok(c.key in D.DEFAULTS, `control ${c.key}`);

    for (const [name, preset] of Object.entries(D.PRESETS)) {
      const d = D.design(preset.params);
      const at = `${name}:`;
      for (const k of ['installedUsdPerKgDay', 'materialsUsdPerKgDay', 'idiotIndex', 'kWhPerKg']) assert.ok(Number.isFinite(d[k]) && d[k] > 0, `${at} ${k} ${d[k]}`);
      assert.equal(typeof d.flexible, 'boolean', `${at} flexible`);
      assert.ok(d.kpis.length >= 3 && d.kpis.length <= 6, `${at} ${d.kpis.length} KPIs`);
      // The bill of materials (`bom`, or `parts` in the same shape) sums to the installed cost and the
      // materials floor on its stated basis (per kg/day of product, or per kW for the electrolyzer).
      const rows = d.bom || d.parts;
      const usd = rows.reduce((s, x) => s + x.usd, 0);
      const materials = rows.reduce((s, x) => s + x.usdMaterials, 0);
      if (d.basis === 'per kW') {
        close(usd, d.installedUsdPerKW);
        close(materials, d.materialsUsdPerKW);
      } else {
        close(usd, d.installedUsdPerKgDay);
        close(materials, d.materialsUsdPerKgDay);
      }
    }

    const o = D.simulatorOverride(D.PRESETS.lean.params);
    assert.deepEqual(Object.keys(o).sort(), [...D.units].sort(), 'one override per unit');
    for (const [unit, f] of Object.entries(o)) {
      assert.ok(f.capexFactor > 0 && f.energyFactor > 0, unit);
      assert.ok(f.materialsFactor > 0 && f.materialsFactor < f.capexFactor, `${unit}: raw materials are a floor below the installed cost`);
    }
  });
}
