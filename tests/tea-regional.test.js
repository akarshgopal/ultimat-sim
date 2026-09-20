const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_PRESETS = require('../data/site-presets.js');
const tea = require('../data/tea-screening.js');
const { createAbundanceCase } = require('../cases/abundance');

test('demandByRegion maps preset.region strings and chile lithium ceiling ≠ me-levant', () => {
  assert.equal(tea.DEFAULT_DEMAND_REGION_ID, 'me-levant');
  assert.equal(tea.resolveDemandRegion(), 'me-levant');
  assert.equal(tea.resolveDemandRegion(undefined), 'me-levant');
  assert.equal(tea.resolveDemandRegion('Levant'), 'me-levant');
  assert.equal(tea.resolveDemandRegion('Gulf'), 'gulf');
  assert.equal(tea.resolveDemandRegion('Atacama/Chile'), 'chile-atacama');
  assert.equal(tea.resolveDemandRegion('chile-atacama'), 'chile-atacama');
  assert.equal(tea.resolveDemandRegion('Australia'), 'australia');
  assert.equal(tea.resolveDemandRegion('Europe'), 'europe');
  assert.equal(tea.resolveDemandRegion('India'), 'india');
  assert.equal(tea.resolveDemandRegion('Texas/US Gulf'), 'texas');
  assert.equal(tea.resolveDemandRegion('Southern Africa'), 'southern-africa');
  assert.equal(tea.resolveDemandRegion('unknown-basin'), 'default');

  for (const preset of SITE_PRESETS) {
    assert.ok(tea.REGION_STRING_TO_ID[preset.region], `${preset.id} region ${preset.region} needs a demand-region mapping`);
    assert.ok(tea.demandByRegion[tea.resolveDemandRegion(preset.region)]);
  }
  assert.equal(tea.resolveDemandRegion('Levant'), 'me-levant');

  const meLi = tea.getDemandForRegion('me-levant').lithium.value;
  const chileLi = tea.getDemandForRegion('chile-atacama').lithium.value;
  const chileFromPreset = tea.getDemandForRegion('Atacama/Chile').lithium.value;
  assert.equal(meLi, tea.demand.lithium.value);
  assert.equal(meLi, 1e6);
  assert.equal(chileLi, 2e7);
  assert.equal(chileFromPreset, chileLi);
  assert.notEqual(chileLi, meLi);
  assert.ok(chileLi > meLi);
  assert.match(tea.getDemandForRegion('chile-atacama').lithium.note, /chile mine production/i);
  assert.match(tea.getDemandForRegion('chile-atacama').lithium.note, /not an offtake contract/i);
  assert.ok(tea.getDemandForRegion('chile-atacama').lithium.evidence.some(item => /usgs\.gov.*lithium/i.test(item.url || '')));

  const auLi = tea.getDemandForRegion('australia').lithium.value;
  assert.equal(auLi, meLi);
  assert.match(tea.getDemandForRegion('australia').lithium.note, /hard-rock/i);
});

test('bindSale / bindCost regional overlays: chile offtake and power ≠ me-levant defaults', () => {
  const meSale = tea.bindSale('lithium');
  const chileSale = tea.bindSale('lithium', { region: 'Atacama/Chile' });
  const chileCurried = tea.bindSaleForRegion('chile-atacama')('lithium');
  assert.equal(meSale.annualDemandLimit, 1e6);
  assert.equal(meSale.demandRegionId, 'me-levant');
  assert.equal(chileSale.annualDemandLimit, 2e7);
  assert.equal(chileSale.demandRegionId, 'chile-atacama');
  assert.equal(chileCurried.annualDemandLimit, chileSale.annualDemandLimit);
  assert.notEqual(chileSale.annualDemandLimit, meSale.annualDemandLimit);
  assert.equal(chileSale.unitPrice, meSale.unitPrice);
  assert.equal(chileSale.unitPrice, 14);
  assert.match(chileSale.note, /supply-side/i);

  const mePower = tea.bindCost('power');
  const chilePower = tea.bindCost('power', { region: 'chile-atacama' });
  const auPower = tea.bindCost('power', { region: 'Australia' });
  const europePower = tea.bindCost('power', { region: 'Europe' });
  const indiaPower = tea.bindCost('power', { region: 'India' });
  const texasPower = tea.bindCost('power', { region: 'Texas/US Gulf' });
  const gulfPower = tea.bindCost('power', { region: 'Gulf' });
  const saPower = tea.bindCost('power', { region: 'Southern Africa' });
  assert.equal(mePower.unitCost, 0.04);
  assert.equal(chilePower.unitCost, 0.07);
  assert.equal(auPower.unitCost, 0.08);
  assert.equal(europePower.unitCost, 0.10);
  assert.equal(indiaPower.unitCost, 0.07);
  assert.equal(texasPower.unitCost, 0.06);
  assert.equal(gulfPower.unitCost, 0.04);
  assert.equal(saPower.unitCost, 0.09);
  assert.notEqual(chilePower.unitCost, mePower.unitCost);
  assert.notEqual(europePower.unitCost, mePower.unitCost);
  assert.notEqual(texasPower.unitCost, mePower.unitCost);
  assert.equal(chilePower.quality, 'screening');
  assert.equal(europePower.quality, 'screening');
  assert.equal(texasPower.quality, 'screening');
  assert.match(chilePower.note, /not a SEN\/SING PPA/i);
  assert.match(europePower.note, /not a Eurostat contract/i);
  assert.match(texasPower.note, /not an ERCOT PPA/i);
  assert.ok(chilePower.evidence.some(item => /iea\.org.*electricity/i.test(item.url || '')));
  assert.ok(texasPower.evidence.some(item => /eia\.gov\/electricity/i.test(item.url || '')));
  assert.equal(tea.bindCost('brine', { region: 'chile-atacama' }).unitCost, tea.costs.brine.value);
  assert.equal(tea.getCapexMultiplierForRegion('Europe'), 1);
  assert.equal(tea.getCapexMultiplierForRegion('chile-atacama'), 1);
  assert.equal(chileSale.unitPrice, tea.prices.lithium.value);
});

test('createAbundanceCase({ region }) is backward compatible and binds chile Li cap', () => {
  const defMe = createAbundanceCase();
  const defChile = createAbundanceCase({ assayId: 'atacama-lithium-brine', region: 'Atacama/Chile' });
  const lithium = id => id.graph.nodes.find(node => node.id === 'lithium');
  const power = id => id.graph.nodes.find(node => node.id === 'power');

  assert.equal(defMe.meta.demandRegionId, 'me-levant');
  assert.equal(lithium(defMe).economics.annualDemandLimit, tea.demand.lithium.value);
  assert.equal(power(defMe).economics.unitCost, 0.04);
  assert.equal(defMe.teaEvidence.demandRegionId, 'me-levant');

  assert.equal(defChile.meta.assayId, 'atacama-lithium-brine');
  assert.equal(defChile.meta.demandRegionId, 'chile-atacama');
  assert.equal(lithium(defChile).economics.annualDemandLimit, 2e7);
  assert.notEqual(lithium(defChile).economics.annualDemandLimit, lithium(defMe).economics.annualDemandLimit);
  assert.equal(power(defChile).economics.unitCost, 0.07);
  assert.equal(defChile.teaEvidence.demandRegionId, 'chile-atacama');
  const chileDemand = defChile.teaEvidence.demand.find(row => row.key === 'lithium');
  assert.equal(chileDemand.value, 2e7);

  const defEurope = createAbundanceCase({ region: 'Europe' });
  assert.equal(defEurope.meta.demandRegionId, 'europe');
  assert.equal(power(defEurope).economics.unitCost, 0.10);
  assert.equal(lithium(defEurope).economics.unitPrice, tea.prices.lithium.value);
});
