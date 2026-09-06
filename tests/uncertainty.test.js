const assert = require('node:assert/strict');
const test = require('node:test');
const {
  QUALITIES,
  classifyQuality,
  formatUncertainMoney,
  formatUncertainNumber,
  qualityChip,
  parseBand,
  citeMarkup,
} = require('../engine/uncertainty');

test('quality classes match the constants audit', () => {
  assert.deepEqual([...QUALITIES], ['cited', 'recoverable', 'assumption', 'derived', 'screening']);
});

test('LCOE is cited for NREL ATB solar PV and assumption otherwise', () => {
  assert.equal(classifyQuality({ kind: 'lcoe', unit: 'solar-pv' }), 'cited');
  assert.equal(classifyQuality({
    kind: 'lcoe',
    unit: 'solar-pv',
    sourceNote: 'NREL ATB 2024 utility-scale PV Resource Class 8',
  }), 'cited');
  assert.equal(classifyQuality({ kind: 'lcoe', unit: 'nuclear-electricity' }), 'assumption');
  assert.equal(classifyQuality({ kind: 'lcoh', unit: 'solar-thermal' }), 'assumption');
});

test('product cost is screening and land is assumption', () => {
  assert.equal(classifyQuality({ kind: 'product-cost' }), 'screening');
  assert.equal(classifyQuality({ kind: 'levelized-delivered-cost' }), 'screening');
  assert.equal(classifyQuality({ kind: 'land' }), 'assumption');
  assert.equal(classifyQuality({ kind: 'footprint' }), 'assumption');
  assert.equal(classifyQuality({ kind: 'money' }), 'screening');
  assert.equal(classifyQuality({ kind: 'freight' }), 'cited');
});

test('intensities follow catalog source notes', () => {
  assert.equal(classifyQuality({
    kind: 'intensity',
    unit: 'electrolyzer',
    sourceNote: 'Alkaline default 52 kWh/kg H₂ is a system-level SEC in the Buttler & Spliethoff 2018 commercial alkaline band',
    references: [{ label: 'Buttler & Spliethoff 2018' }],
  }), 'cited');
  assert.equal(classifyQuality({
    kind: 'intensity',
    unit: 'dac-solid',
    sourceNote: 'Screening assumption in the IEA DAC 2022 solid-sorbent family, not a plant quote.',
  }), 'screening');
  assert.equal(classifyQuality({
    kind: 'intensity',
    unit: 'dac-liquid',
    sourceNote: 'Keith et al. 2018 Carbon Engineering process. Heat 2.45 kWh/kg CO₂ from Scenario A.',
  }), 'cited');
  assert.equal(classifyQuality({
    kind: 'intensity',
    unit: 'dac-electroswing',
    sourceNote: 'Voskian & Hatton 2019 cell work 40–90 kJ/mol CO₂ (0.25–0.57 kWh/kg).',
  }), 'cited');
  assert.equal(classifyQuality({
    kind: 'intensity',
    unit: 'dac-liquid',
    sourceNote: 'Keith et al. 2018 Carbon Engineering process. Capture fraction 0.75 is Keith et al. 2018 Table 1 74.5% rounded. KOH makeup 0.01 kg/kg CO₂ is screening, not a Keith table value.',
  }), 'cited');
  assert.equal(classifyQuality({
    kind: 'intensity',
    unit: 'swro',
    sourceNote: 'Default 3.5 kWh/m³ is a plant-level SEC in the Elimelech & Phillip 2011 3–4 kWh/m³ band. Ghaffour et al. 2013 reports the same 3–4 kWh/m³ SWRO plant band.',
    references: [{ label: 'Elimelech & Phillip 2011' }, { label: 'Ghaffour et al. 2013' }],
  }), 'cited');
  assert.equal(classifyQuality({ kind: 'intensity', unit: 'swro', references: [{ label: 'Elimelech' }] }), 'cited');
  assert.equal(classifyQuality({ kind: 'intensity', unit: 'med', sourceNote: 'Ghaffour et al. 2013 MED band (1.5–2.5 kWh/m³ e).' }), 'cited');
  assert.equal(classifyQuality({ kind: 'intensity', unit: 'msf', sourceNote: 'Ghaffour et al. 2013 MSF band (3–5 kWh/m³ e).' }), 'cited');
  assert.equal(classifyQuality({ kind: 'intensity', unit: 'sabatier' }), 'screening');
  assert.equal(classifyQuality({
    kind: 'intensity',
    unit: 'sabatier',
    sourceNote: 'Default 1 kWh/kg CH₄ is a screening ancillary load in a 0.4–1.5 kWh/kg band, not electrolysis. Zapf (via Baier et al. 2018) gives 0.4 kWh/m³ SNG.',
  }), 'screening');
  assert.equal(classifyQuality({ kind: 'intensity', sourceNote: 'stoichiometry from molar masses' }), 'derived');
});

test('screening money uses a tilde and fewer significant figures', () => {
  assert.equal(formatUncertainMoney(52425, 'screening'), '~$52,000');
  assert.equal(formatUncertainMoney(-12345, 'assumption'), '~-$12,000');
  assert.equal(formatUncertainMoney(1560, 'cited'), '$1,560');
  assert.equal(formatUncertainMoney(52425, { kind: 'product-cost' }), '~$52,000');
  assert.doesNotMatch(formatUncertainMoney(52425, 'screening'), /±|\+\/-/);
});

test('formatters never invent a plus/minus band', () => {
  assert.equal(formatUncertainNumber(0.45, 'cited'), '0.45');
  assert.equal(formatUncertainNumber(0.45, 'screening'), '~0.45');
  assert.equal(formatUncertainNumber(0.24, 'cited'), '0.24');
  assert.doesNotMatch(formatUncertainNumber(52, 'cited'), /±|\+\/-/);
  assert.equal(parseBand({ plusMinus: 5 }), null);
  assert.equal(parseBand({ low: 10, high: 10 }), null);
  assert.equal(formatUncertainNumber(52, 'cited', { band: { plusMinus: 3 } }), '52');
});

test('a literature range is shown only when a real band is supplied', () => {
  assert.equal(
    formatUncertainNumber(0.45, 'cited', { band: { low: 0.25, high: 0.57, unit: 'kWh/kg' } }),
    '0.45 (0.25–0.57 kWh/kg)'
  );
  const voskian = parseBand('Voskian & Hatton 2019 cell work 40–90 kJ/mol CO₂ (0.25–0.57 kWh/kg at 44.01 g/mol).');
  assert.deepEqual(voskian, { low: 0.25, high: 0.57, unit: 'kWh/kg' });
  const alkaline = parseBand('commercial alkaline band (~4.5–5.0 kWh/Nm³ ≈ 50–56 kWh/kg)');
  assert.deepEqual(alkaline, { low: 50, high: 56, unit: 'kWh/kg' });
  const elimelech = parseBand('Elimelech & Phillip 2011 3–4 kWh/m³ band');
  assert.deepEqual(elimelech, { low: 3, high: 4, unit: 'kWh/m³' });
  const sabatierBand = parseBand('screening ancillary load in a 0.4–1.5 kWh/kg band, not electrolysis');
  assert.deepEqual(sabatierBand, { low: 0.4, high: 1.5, unit: 'kWh/kg' });
  assert.equal(parseBand('GHI bin 4–4.25 kWh/m²/day, ILR=1.34'), null);
});

test('qualityChip renders a known class and citeMarkup keeps source links', () => {
  assert.match(qualityChip('cited'), /quality-chip quality-cited/);
  assert.match(qualityChip({ kind: 'land' }), /quality-assumption/);
  assert.match(qualityChip({ kind: 'product-cost' }), /quality-screening/);
  assert.doesNotMatch(qualityChip('screening'), /±/);
  const cite = citeMarkup([{ label: 'NREL 2024 ATB', url: 'https://atb.nrel.gov/electricity/2024/utility-scale_pv' }]);
  assert.match(cite, /number-cite/);
  assert.match(cite, /NREL 2024 ATB/);
  assert.match(cite, /atb\.nrel\.gov/);
});
