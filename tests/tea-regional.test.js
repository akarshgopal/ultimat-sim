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
  assert.equal(tea.resolveDemandRegion('Bolivia / Uyuni'), 'chile-atacama');
  assert.equal(tea.resolveDemandRegion('China / Qaidam'), 'default');
  assert.equal(tea.resolveDemandRegion('chile-atacama'), 'chile-atacama');
  assert.equal(tea.resolveDemandRegion('Australia'), 'australia');
  assert.equal(tea.resolveDemandRegion('Europe'), 'europe');
  assert.equal(tea.resolveDemandRegion('India'), 'india');
  assert.equal(tea.resolveDemandRegion('Texas/US Gulf'), 'texas');
  assert.equal(tea.resolveDemandRegion('US West / California'), 'texas');
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
  assert.equal(auLi, 5e6);
  assert.notEqual(auLi, meLi);
  assert.match(tea.getDemandForRegion('australia').lithium.note, /hard-rock/i);
  assert.match(tea.getDemandForRegion('australia').lithium.note, /not a .*brine offtake|not a Lake Mackay brine/i);
  assert.ok(tea.getDemandForRegion('australia').lithium.evidence.some(item => /usgs\.gov.*lithium/i.test(item.url || '')));

  const mineralKeys = tea.MINERAL_DEMAND_KEYS;
  const regionalIds = ['australia', 'texas', 'southern-africa', 'india', 'europe', 'gulf'];
  const me = tea.getDemandForRegion('me-levant');
  for (const id of regionalIds) {
    const regional = tea.getDemandForRegion(id);
    const differs = mineralKeys.some(key => regional[key].value !== me[key].value);
    assert.ok(differs, `${id} mineral ceilings should not purely inherit me-levant`);
    for (const key of mineralKeys) {
      assert.match(regional[key].note, /not a .*contract|not an offtake/i, `${id} ${key}`);
      assert.equal(regional[key].quality, 'screening');
      assert.ok(
        regional[key].evidence.some(item => /usgs\.gov/i.test(item.url || '')),
        `${id} ${key} should cite USGS`
      );
    }
  }
  assert.equal(tea.getDemandForRegion('gulf').bromine.value, 5e6);
  assert.notEqual(tea.getDemandForRegion('gulf').bromine.value, me.bromine.value);
  assert.equal(tea.getDemandForRegion('india').bromine.value, 3e6);
  assert.equal(tea.getDemandForRegion('texas').salt.value, 8e9);
  assert.equal(tea.getDemandForRegion('europe').potash.value, 1e9);
  assert.equal(tea.getDemandForRegion('southern-africa').lithium.value, 2e5);
  assert.equal(tea.getDemandForRegion('chile-atacama').bromine.value, me.bromine.value);
  assert.equal(tea.getDemandForRegion('chile-atacama').bromine.inherit, 'me-levant');
});

test('non-ME sites do not silently inherit ME lithium or fuel/chem caps without inherit:me-levant', () => {
  const me = tea.getDemandForRegion('me-levant');
  for (const key of Object.keys(me)) {
    assert.equal(me[key].inherit, undefined, `me-levant ${key} is the source table, not an inherit`);
  }

  const chile = tea.getDemandForRegion('chile-atacama');
  assert.equal(chile.lithium.inherit, undefined, 'Chile Li must not carry inherit:me-levant');
  assert.notEqual(chile.lithium.value, me.lithium.value);
  assert.equal(chile.lithium.value, 2e7);
  assert.match(chile.lithium.note, /chile mine production/i);

  const nonMe = ['chile-atacama', 'australia', 'texas', 'southern-africa', 'india', 'europe', 'gulf'];
  for (const id of nonMe) {
    const regional = tea.getDemandForRegion(id);
    assert.equal(regional.lithium.inherit, undefined, `${id} lithium silent ME inherit`);
    assert.notEqual(regional.lithium.value, me.lithium.value, `${id} lithium should be regionalized`);

    for (const key of tea.FUEL_CHEM_DEMAND_KEYS) {
      const row = regional[key];
      const flagged = row.inherit === 'me-levant';
      const regionalized = row.value !== me[key].value;
      assert.ok(flagged || regionalized, `${id} ${key} silent ME fuel/chem cap`);
      if (flagged) {
        assert.equal(row.value, me[key].value, `${id} ${key} inherit must keep the me-levant cap`);
        assert.match(row.note, /inherit/i, `${id} ${key} inherit note`);
      }
    }
  }

  for (const id of ['chile-atacama', 'australia', 'texas']) {
    const regional = tea.getDemandForRegion(id);
    assert.equal(regional.methane.inherit, 'me-levant', `${id} methane should flag inherit:me-levant`);
    assert.equal(regional.hydrogen.inherit, 'me-levant', `${id} hydrogen should flag inherit:me-levant`);
    assert.equal(tea.bindSale('methane', { region: id }).inherit, 'me-levant');
    assert.equal(tea.bindSale('methanol', { region: id }).inherit, 'me-levant');
    assert.equal(tea.bindSale('ammonia', { region: id }).inherit, 'me-levant');
  }

  const chileSale = tea.bindSale('lithium', { region: 'Atacama/Chile' });
  assert.equal(chileSale.inherit, undefined);
  assert.equal(chileSale.annualDemandLimit, 2e7);

  const unmapped = tea.getDemandForRegion('unknown-basin');
  assert.equal(unmapped.lithium.inherit, 'me-levant');
  for (const key of tea.FUEL_CHEM_DEMAND_KEYS) {
    assert.equal(unmapped[key].inherit, 'me-levant', `default ${key} must flag inherit:me-levant`);
  }
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
  assert.equal(chileSale.unitPrice, tea.prices.lithium.value);
});

test('capexMultiplierByRegion is a screening labor/construction proxy and bindCapex applies it', () => {
  const shifted = ['chile-atacama', 'india', 'gulf', 'australia', 'me-levant'];
  for (const id of shifted) {
    const mul = tea.getCapexMultiplierForRegion(id);
    assert.notEqual(mul, 1, `${id} CAPEX multiplier should not be the omitted-table default of 1`);
    assert.ok(mul >= 0.7 && mul <= 1.3, `${id} CAPEX multiplier ${mul} should stay in the ~0.7–1.3 screening band`);
    const row = tea.capexMultiplierByRegion[id];
    assert.equal(row.quality, 'screening');
    assert.equal(row.unit, '×');
    assert.ok(row.evidence.some(item => /turnerandtownsend|worldbank\.org\/en\/programs\/icp|irena\.org/i.test(item.url || '')));
  }

  assert.equal(tea.getCapexMultiplierForRegion('Atacama/Chile'), tea.getCapexMultiplierForRegion('chile-atacama'));
  assert.equal(tea.getCapexMultiplierForRegion('India'), tea.getCapexMultiplierForRegion('india'));
  assert.equal(tea.getCapexMultiplierForRegion('Gulf'), tea.getCapexMultiplierForRegion('gulf'));
  assert.equal(tea.getCapexMultiplierForRegion('Australia'), tea.getCapexMultiplierForRegion('australia'));
  assert.equal(tea.getCapexMultiplierForRegion('Levant'), tea.getCapexMultiplierForRegion('me-levant'));
  assert.equal(tea.getCapexMultiplierForRegion('Texas/US Gulf'), 1);
  assert.equal(tea.getCapexMultiplierForRegion('unknown-basin'), 1);

  const chileMul = tea.getCapexMultiplierForRegion('chile-atacama');
  const chileBound = tea.bindCapex('minerals', { region: 'Atacama/Chile', capacity: 1000 });
  assert.equal(chileBound.capexIntensity, tea.packs.minerals.capexIntensity * chileMul);
  assert.equal(chileBound.capexRate, tea.packs.minerals.capexIntensity * chileMul);
  assert.notEqual(chileBound.capexRate, tea.packs.minerals.capexIntensity);

  const unbound = tea.bindCapex('minerals', { capacity: 1000 });
  assert.equal(unbound.capexRate, tea.packs.minerals.capexIntensity);

  const chileLiPrice = tea.getPriceForRegion('lithium', 'chile-atacama');
  assert.equal(chileLiPrice.value, 14);
  assert.equal(chileLiPrice, tea.priceByRegion['chile-atacama'].lithium);
  assert.match(chileLiPrice.note, /supply-side/i);
  assert.match(chileLiPrice.note, /not a Chilean offtake contract/i);
  assert.ok(chileLiPrice.evidence.some(item => /usgs\.gov.*lithium/i.test(item.url || '')));

  const indiaSolar = tea.solarCapexByRegion.india;
  assert.equal(indiaSolar.value, 525);
  assert.equal(indiaSolar.unit, '$/kWp');
  assert.ok(indiaSolar.evidence.some(item => /irena\.org/i.test(item.url || '')));
  const indiaPv = tea.bindCapex('solar-pv', { region: 'India', capacity: 10 });
  assert.equal(indiaPv.capexIntensity, 525);
  assert.equal(indiaPv.installedCapex, 5250);
  assert.notEqual(indiaPv.capexIntensity, tea.packs['solar-pv'].capexIntensity * tea.getCapexMultiplierForRegion('india'));
  assert.match(indiaPv.note, /525/i);
  const chilePv = tea.bindCapex('solar-pv', { region: 'chile-atacama', capacity: 10 });
  assert.equal(chilePv.capexIntensity, tea.packs['solar-pv'].capexIntensity * tea.getCapexMultiplierForRegion('chile-atacama'));
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
