const assert = require('node:assert/strict');
const test = require('node:test');
const {
  QUALITIES,
  RIGHT_KEYS,
  RIGHT_KINDS,
  RIGHT_STATUSES,
  classifyQuality,
  formatUncertainMoney,
  formatUncertainNumber,
  qualityChip,
  rightsChip,
  unverifiedRightsWarnings,
  parseBand,
  citeMarkup,
  authorizeForStatus,
  rightIsAuthorized,
} = require('../engine/uncertainty');

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

test('screening money uses fewer significant figures without a tilde', () => {
  assert.equal(formatUncertainMoney(52425, 'screening'), '$52,000');
  assert.equal(formatUncertainMoney(-12345, 'assumption'), '-$12,000');
  assert.equal(formatUncertainMoney(1560, 'cited'), '$1,560');
  assert.equal(formatUncertainMoney(52425, { kind: 'product-cost' }), '$52,000');
  assert.doesNotMatch(formatUncertainMoney(52425, 'screening'), /~|±|\+\/-/);
});

test('rights chips and unverified warnings stay separate from quality classes', () => {
  assert.deepEqual([...RIGHT_KEYS], [
    'gridImport', 'freshwater', 'seawaterIntake', 'seawaterDischarge', 'brineConcession', 'saltPurchase',
  ]);
  assert.equal(RIGHT_KINDS.seawaterDischarge, 'discharge');
  assert.equal(RIGHT_KINDS.brineConcession, 'concession');
  assert.equal(authorizeForStatus('authorized'), true);
  assert.equal(authorizeForStatus('assumed'), true);
  assert.equal(authorizeForStatus('unverified'), false);
  assert.equal(rightIsAuthorized({ status: 'assumed', authorize: true }), true);
  assert.equal(rightIsAuthorized({ status: 'unverified', authorize: false }), false);
  assert.deepEqual([...RIGHT_STATUSES], ['authorized', 'assumed', 'unverified']);
  assert.match(rightsChip('authorized'), /rights-authorized/);
  assert.match(rightsChip('assumed'), /rights-assumed/);
  assert.match(rightsChip('unverified'), /rights-unverified/);
  assert.equal(unverifiedRightsWarnings(null).length, 0);
  assert.deepEqual(unverifiedRightsWarnings({
    rights: {
      gridImport: { status: 'unverified' },
      freshwater: { status: 'assumed' },
      seawaterIntake: { status: 'assumed' },
      seawaterDischarge: { status: 'unverified' },
      brineConcession: { status: 'unverified' },
      saltPurchase: { status: 'authorized' },
    },
  }), ['unverified site right: gridImport', 'unverified site right: seawaterDischarge', 'unverified site right: brineConcession']);
});
