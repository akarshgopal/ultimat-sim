const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_PRESETS = require('../data/site-presets.js');
const tea = require('../data/tea-screening.js');
const { createAbundanceCase } = require('../cases/abundance');

const NON_ME = ['chile-atacama', 'australia', 'texas', 'southern-africa', 'india', 'europe', 'gulf', 'asia-china'];

test('region strings resolve to demand tables; every preset region is mapped', () => {
  const cases = [
    [undefined, tea.DEFAULT_DEMAND_REGION_ID],
    ['Levant', 'me-levant'],
    ['Gulf', 'gulf'],
    ['Atacama/Chile', 'chile-atacama'],
    ['Bolivia / Uyuni', 'chile-atacama'],
    ['chile-atacama', 'chile-atacama'],
    ['China / Qaidam', 'asia-china'],
    ['China / Tibet', 'asia-china'],
    ['US West / California', 'texas'],
    ['unknown-basin', 'default'],
  ];
  for (const [input, id] of cases) assert.equal(tea.resolveDemandRegion(input), id, String(input));
  assert.equal(tea.getDemandForRegion('China / Tibet'), tea.getDemandForRegion('asia-china'));
  for (const preset of SITE_PRESETS) {
    assert.ok(tea.REGION_STRING_TO_ID[preset.region], `${preset.id} region ${preset.region} needs a demand-region mapping`);
    assert.ok(tea.demandByRegion[tea.resolveDemandRegion(preset.region)]);
  }
});

test('non-ME regions regionalize minerals and only reuse ME fuel caps through an explicit inherit', () => {
  const me = tea.getDemandForRegion('me-levant');
  for (const key of Object.keys(me)) assert.equal(me[key].inherit, undefined, `me-levant ${key} is the source table`);

  for (const id of NON_ME) {
    const regional = tea.getDemandForRegion(id);
    assert.equal(regional.lithium.inherit, undefined, `${id} lithium`);
    assert.notEqual(regional.lithium.value, me.lithium.value, `${id} lithium should be regionalized`);
    if (id !== 'chile-atacama') {
      assert.ok(tea.MINERAL_DEMAND_KEYS.some(key => regional[key].value !== me[key].value), `${id} minerals`);
    }
    for (const key of [...tea.MINERAL_DEMAND_KEYS, ...tea.FUEL_CHEM_DEMAND_KEYS]) {
      const row = regional[key];
      if (row.inherit === 'me-levant') assert.equal(row.value, me[key].value, `${id} ${key} inherit keeps the ME cap`);
      else if (tea.FUEL_CHEM_DEMAND_KEYS.includes(key)) assert.notEqual(row.value, me[key].value, `${id} ${key} silent ME cap`);
    }
  }
  const unmapped = tea.getDemandForRegion('unknown-basin');
  for (const key of tea.FUEL_CHEM_DEMAND_KEYS) assert.equal(unmapped[key].inherit, 'me-levant', key);
  assert.equal(tea.bindSale('methane', { region: 'China / Qaidam' }).inherit, 'me-levant');
  assert.equal(tea.bindSale('lithium', { region: 'Atacama/Chile' }).inherit, undefined);
});

test('bindSale, bindCost, and bindCapex apply the regional overlay', () => {
  const meSale = tea.bindSale('lithium');
  const chileSale = tea.bindSale('lithium', { region: 'Atacama/Chile' });
  assert.equal(meSale.demandRegionId, 'me-levant');
  assert.equal(chileSale.demandRegionId, 'chile-atacama');
  assert.equal(chileSale.annualDemandLimit, tea.getDemandForRegion('chile-atacama').lithium.value);
  assert.notEqual(chileSale.annualDemandLimit, meSale.annualDemandLimit);
  assert.equal(tea.bindSaleForRegion('chile-atacama')('lithium').annualDemandLimit, chileSale.annualDemandLimit);
  assert.equal(chileSale.unitPrice, tea.getPriceForRegion('lithium', 'chile-atacama').value);

  const mePower = tea.bindCost('power').unitCost;
  for (const region of ['chile-atacama', 'Europe', 'Texas/US Gulf', 'China / Tibet']) {
    const power = tea.bindCost('power', { region });
    assert.notEqual(power.unitCost, mePower, region);
    assert.equal(power.quality, 'screening', region);
  }
  assert.equal(tea.bindCost('power', { region: 'China / Qaidam' }).unitCost, tea.bindCost('power', { region: 'China / Tibet' }).unitCost);
  assert.equal(tea.bindCost('brine', { region: 'chile-atacama' }).unitCost, tea.costs.brine.value);

  for (const id of ['chile-atacama', 'india', 'gulf', 'australia', 'me-levant', 'asia-china']) {
    const mul = tea.getCapexMultiplierForRegion(id);
    assert.ok(mul !== 1 && mul >= 0.7 && mul <= 1.3, `${id} CAPEX multiplier ${mul}`);
  }
  assert.equal(tea.getCapexMultiplierForRegion('Atacama/Chile'), tea.getCapexMultiplierForRegion('chile-atacama'));
  assert.equal(tea.getCapexMultiplierForRegion('unknown-basin'), 1);
  const chileMul = tea.getCapexMultiplierForRegion('chile-atacama');
  const chileBound = tea.bindCapex('minerals', { region: 'Atacama/Chile', capacity: 1000 });
  assert.equal(chileBound.capexRate, tea.packs.minerals.capexIntensity * chileMul);
  assert.equal(tea.bindCapex('minerals', { capacity: 1000 }).capexRate, tea.packs.minerals.capexIntensity);

  const indiaPv = tea.bindCapex('solar-pv', { region: 'India', capacity: 10 });
  assert.equal(indiaPv.capexIntensity, tea.solarCapexByRegion.india.value, 'a regional solar CAPEX row overrides the multiplier');
  assert.equal(indiaPv.installedCapex, tea.solarCapexByRegion.india.value * 10);
  const chilePv = tea.bindCapex('solar-pv', { region: 'chile-atacama', capacity: 10 });
  assert.equal(chilePv.capexIntensity, tea.packs['solar-pv'].capexIntensity * chileMul);
});

test('createAbundanceCase({ region }) binds the regional demand and power', () => {
  const lithium = def => def.graph.nodes.find(node => node.id === 'lithium');
  const power = def => def.graph.nodes.find(node => node.id === 'power');
  const defMe = createAbundanceCase();
  assert.equal(defMe.meta.demandRegionId, 'me-levant');
  assert.equal(lithium(defMe).economics.annualDemandLimit, tea.demand.lithium.value);

  for (const [region, id] of [['Atacama/Chile', 'chile-atacama'], ['Europe', 'europe'], ['China / Tibet', 'asia-china']]) {
    const def = createAbundanceCase({ assayId: 'atacama-lithium-brine', region });
    assert.equal(def.meta.demandRegionId, id, region);
    assert.equal(def.teaEvidence.demandRegionId, id, region);
    assert.equal(lithium(def).economics.annualDemandLimit, tea.getDemandForRegion(id).lithium.value, region);
    assert.equal(power(def).economics.unitCost, tea.bindCost('power', { region }).unitCost, region);
  }
});
