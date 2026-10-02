const assert = require('node:assert/strict');
const test = require('node:test');

const tea = require('../data/tea-screening.js');
const { evaluateEconomics } = require('../engine/economics');
const { estimateFootprint, PROCESS_INTENSITIES } = require('../engine/footprint');
const { solveOperation } = require('../engine/solve');
const { siteZabuyeAbundance } = require('../cases/network');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('tank fluid classes expose $/m³ intensities with evidence', () => {
  assert.equal(tea.DEFAULT_TANK_FLUID, 'generic');
  assert.equal(tea.resolveTankFluidClass('water'), 'freshwater');
  assert.equal(tea.resolveTankFluidClass('BRINE'), 'brine');
  for (const id of ['freshwater', 'seawater', 'brine', 'generic']) {
    const spec = tea.getTankFluidSpec(id);
    assert.ok(spec.capexPerM3 > 0, id);
    assert.ok(spec.densityKgM3 > 0, id);
    assert.equal(spec.quality, 'screening');
    assert.ok(spec.evidence.length >= 1);
  }
  assert.equal(tea.getTankFluidSpec('generic').capexPerM3, 500);
});

test('generic $500/m³ matches MECH17 $0.50/kg at ρ=1000', () => {
  const bound = tea.bindTankCapex({ capacityKg: 10000 });
  assert.equal(bound.installedCapex, 5000);
  assert.equal(bound.fluidClass, 'generic');
  assert.equal(bound.capexPerKg, 0.5);
  assert.equal(bound.intensityUnit, '$/m³ capacity');
});

test('brine tank CAPEX uses $/m³ and regional CAPEX×', () => {
  const base = tea.bindTankCapex({ fluidClass: 'brine', capacityKg: 12000 });
  // 12000/1200 = 10 m³ × $750 = $7500
  assert.equal(base.installedCapex, 7500);
  const china = tea.bindTankCapex({ fluidClass: 'brine', capacityKg: 12000, region: 'China / Tibet' });
  assert.equal(china.regionMultiplier, 0.8);
  assert.equal(china.installedCapex, 6000);
  assert.equal(china.fluidLabel, 'Brine');
});

test('intake-pump and gas-blower packs regionalize like other tea packs', () => {
  const us = tea.bindCapexPack('intake-pump', { capacity: 100 });
  assert.equal(us.capexRate, 350);
  const china = tea.bindCapexPack('intake-pump', { capacity: 100, region: 'asia-china' });
  assert.equal(china.capexRate, 280);
  const europe = tea.bindCapexPack('gas-blower', { capacity: 1000, region: 'Europe' });
  assert.equal(europe.capexRate, 1.5 * 1.2);
});
