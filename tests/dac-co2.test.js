// DAC CO₂ supply pathway (cases/dac-co2.js) and its make-vs-buy wiring for co2-feed.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../engine/designs/dac.js');
const tea = require('../data/tea-screening.js');
const { within, rank: rankAll, cheapPv, companyData } = require('./helpers.js');

const PATHWAYS = companyData().pathways;
const dacCo2 = PATHWAYS.find(p => p.id === 'dac-co2');
const BUYERS = ['green-mto', 'green-ft'];
const subset = ids => PATHWAYS.filter(p => ids.includes(p.id));
const frontier = { pv: cheapPv(), designs: { units: D.simulatorOverride(D.PRESETS.lean.params) } };
const rank = (pathways, config) => new Map(rankAll(config, { pathways }).map(r => [r.pathwayId, r]));
const co2Item = row => (row.integration || []).find(item => item.feedId === 'co2-feed');

test('dac-co2 makes CO₂ from air alone on the solid-sorbent recipe basis', () => {
  const fed = dacCo2.feeds.filter(f => f.kgPerKg > 0);
  assert.deepEqual(fed.map(f => f.origin), ['air']);
  assert.ok(dacCo2.feeds.every(f => !(f.origin === 'intermediate' && f.purchased)), 'no purchased intermediates');
  assert.equal(dacCo2.infiniteSourceShare, 1);
  // Built at 1 t/day: node capex is the pack, energy is the recipe (engine/designs/dac.js RECIPE).
  const dac = dacCo2.flowsheet.nodes.find(n => n.unit === 'dac-solid');
  const blower = dacCo2.flowsheet.nodes.find(n => n.unit === 'gas-blower');
  within(dac.capexUsdPerKgDay, D.RECIPE['dac-solid'].usdPerKgDay, 0.01);
  within(dac.kWhPerKg, D.RECIPE['dac-solid'].kWhPerKg, 0.01);
  within(dacCo2.heatKWhPerKg, D.RECIPE['dac-solid'].heatKWhPerKg, 0.01);
  within(blower.capexUsdPerKgDay, D.RECIPE['gas-blower'].usdPerKgDay, 0.01);
  within(blower.kWhPerKg, D.RECIPE['gas-blower'].kWhPerKg, 0.01);
  // Sorbent makeup (0.02 kg × $2) rides on the DAC pack's $0.05/kg variable O&M.
  within(dac.variableOmUsdPerKg, 0.05 + D.RECIPE['dac-solid'].consumablesKgPerKg * D.RECIPE['dac-solid'].consumablesUsdPerKg, 1e-6);
});

test('today the DAC costs more than bought CO₂; lean DAC on 10× cheaper PV integrates it', () => {
  const ids = [...BUYERS, 'dac-co2'];
  const today = rank(subset(ids), {});
  for (const id of BUYERS) assert.equal(co2Item(today.get(id)), undefined, `${id} buys CO₂ today`);
  const lean = rank(subset(ids), frontier);
  assert.ok(lean.get('dac-co2').lcopUsdPerKg < tea.costs['co2-feed'].value, `lean DAC ${lean.get('dac-co2').lcopUsdPerKg} $/kg`);
  for (const id of BUYERS) {
    const item = co2Item(lean.get(id));
    assert.ok(item, `${id} makes its CO₂`);
    assert.equal(item.supplierId, 'dac-co2');
    assert.ok(item.makeUsdPerKg < item.buyUsdPerKg);
    assert.equal(lean.get(id).purchasedIntermediates.length, 0);
    assert.ok(lean.get(id).lcopUsdPerKg < today.get(id).lcopUsdPerKg);
  }
});

test('infinite sources only: CO₂ buyers stay buildable with the DAC supplier, not without it', () => {
  const config = { ...frontier, build: { infiniteSourcesOnly: true } };
  const withDac = rank(subset([...BUYERS, 'dac-co2']), config);
  const without = rank(subset(BUYERS), config);
  for (const id of BUYERS) {
    assert.ok(withDac.has(id), `${id} buildable`);
    assert.equal(co2Item(withDac.get(id)).supplierId, 'dac-co2');
    assert.equal(without.has(id), false, `${id} excluded without a CO₂ supplier`);
  }
});
