const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_PRESETS = require('../data/site-presets.js');
const { RIGHT_KEYS, RIGHT_KINDS, authorizeForStatus } = require('../engine/uncertainty');

const KINDS = new Set(['coastal-solar', 'brine-hub', 'desert-solar', 'industrial-coast']);
const REQUIRED_IDS = [
  'uae-taweelah',
  'saudi-oxagon',
  'saudi-ras-al-khair',
  'saudi-yanbu',
  'au-port-hedland',
  'india-mundra',
  'texas-corpus-christi',
  'us-great-salt-lake',
  'us-salton-sea',
  'us-searles-lake',
  'egypt-ain-sokhna',
  'chile-mejillones',
  'chile-salar-de-atacama',
  'bolivia-uyuni',
  'china-qaidam',
  'ethiopia-danakil',
  'namibia-walvis-bay',
  'oman-duqm',
  'spain-almeria',
];

test('SITE_PRESETS export unique ids and finite lat/lon on globalThis and module.exports', () => {
  assert.equal(globalThis.SITE_PRESETS, SITE_PRESETS);
  assert.ok(Array.isArray(SITE_PRESETS));
  assert.ok(SITE_PRESETS.length >= REQUIRED_IDS.length);

  const ids = SITE_PRESETS.map(site => site.id);
  assert.equal(new Set(ids).size, ids.length, 'site preset ids must be unique');

  const byId = new Map(SITE_PRESETS.map(site => [site.id, site]));
  for (const id of REQUIRED_IDS) {
    assert.ok(byId.has(id), `missing required site ${id}`);
  }
  assert.ok(byId.has('morocco-agadir') || byId.has('morocco-dakhla'), 'North Africa needs Agadir or Dakhla');

  const almeria = byId.get('spain-almeria');
  assert.equal(almeria.latitude, 36.834);
  assert.equal(almeria.longitude, -2.463);
  assert.equal(almeria.kind, 'coastal-solar');

  for (const site of SITE_PRESETS) {
    assert.equal(typeof site.id, 'string');
    assert.ok(site.id.length > 0);
    assert.equal(typeof site.name, 'string');
    assert.ok(site.name.length > 0);
    assert.equal(typeof site.region, 'string');
    assert.ok(site.region.length > 0);
    assert.ok(Number.isFinite(site.latitude), `${site.id} latitude must be finite`);
    assert.ok(Number.isFinite(site.longitude), `${site.id} longitude must be finite`);
    assert.ok(site.latitude >= -90 && site.latitude <= 90, `${site.id} latitude in range`);
    assert.ok(site.longitude >= -180 && site.longitude <= 180, `${site.id} longitude in range`);
    assert.ok(KINDS.has(site.kind), `${site.id} kind ${site.kind}`);
    assert.ok(Array.isArray(site.evidence) && site.evidence.length > 0, `${site.id} needs evidence`);
    for (const item of site.evidence) {
      assert.equal(typeof item.label, 'string');
      assert.match(item.url, /^https?:\/\//);
    }
    assert.equal(typeof site.notes, 'string');
    assert.ok(site.rightsHints && typeof site.rightsHints === 'object');
    if (site.kind === 'brine-hub') {
      assert.equal(site.rightsHints.seawaterIntake.status, 'unverified', `${site.id} inland intake`);
      assert.equal(site.rightsHints.brineConcession.status, 'unverified', `${site.id} concession`);
      assert.match(site.rightsHints.brineConcession.note, /not a mineral concession/i);
    } else {
      assert.equal(site.rightsHints.seawaterIntake.status, 'assumed', `${site.id} coastal intake`);
      assert.equal(site.rightsHints.seawaterIntake.authorize, true);
    }
    for (const [key, hint] of Object.entries(site.rightsHints)) {
      assert.ok(RIGHT_KEYS.includes(key), `${site.id} unknown right ${key}`);
      assert.equal(hint.kind, RIGHT_KINDS[key]);
      assert.ok(hint.status === 'unverified' || hint.status === 'assumed', `${site.id} ${key} status`);
      assert.notEqual(hint.status, 'authorized');
      assert.equal(hint.authorize, authorizeForStatus(hint.status));
      assert.equal(hint.authorize, hint.status === 'assumed');
      assert.equal(typeof hint.note, 'string');
      assert.ok(hint.note.length > 0);
    }
  }
});

test('catalog expansion wires GSL inland, Atacama salar screening, and Gulf/Red Sea desal coasts', () => {
  const byId = new Map(SITE_PRESETS.map(site => [site.id, site]));

  const gsl = byId.get('us-great-salt-lake');
  assert.equal(gsl.kind, 'brine-hub');
  assert.equal(gsl.region, 'US West / Utah');
  assert.equal(gsl.latitude, 41.15);
  assert.equal(gsl.longitude, -112.55);
  assert.equal(gsl.brineAssayId, 'great-salt-lake-brine');
  assert.equal(gsl.assayId, undefined);
  assert.ok(gsl.evidence.some(item => /doi\.org\/10\.3389\/fceng\.2022\.1008680/.test(item.url)));
  assert.ok(gsl.evidence.some(item => /usgs\.gov/.test(item.url)));
  assert.match(gsl.notes, /not a mineral concession/i);

  const salar = byId.get('chile-salar-de-atacama');
  assert.equal(salar.kind, 'brine-hub');
  assert.equal(salar.region, 'Atacama/Chile');
  assert.equal(salar.latitude, -23.5);
  assert.equal(salar.longitude, -68.25);
  assert.equal(salar.brineAssayId, 'atacama-lithium-brine');
  assert.equal(salar.assayId, undefined);
  assert.match(salar.notes, /not an SQM or Albemarle concession/i);
  assert.match(salar.notes, /Not Mejillones seawater/i);

  const ras = byId.get('saudi-ras-al-khair');
  assert.equal(ras.kind, 'industrial-coast');
  assert.equal(ras.region, 'Gulf');
  assert.equal(ras.assayId, 'persian-gulf-seawater');
  assert.equal(ras.brineAssayId, 'persian-gulf-sabkha-brine');
  assert.equal(ras.rightsHints.seawaterIntake.status, 'assumed');
  assert.match(ras.rightsHints.brineConcession.note, /not a mineral concession/i);
  assert.match(ras.notes, /not a Ras Al-Khair reject sample/i);

  const salton = byId.get('us-salton-sea');
  assert.equal(salton.kind, 'brine-hub');
  assert.equal(salton.region, 'US West / California');
  assert.equal(salton.latitude, 33.16);
  assert.equal(salton.longitude, -115.62);
  assert.equal(salton.brineAssayId, 'salton-sea-brine');
  assert.equal(salton.assayId, undefined);
  assert.ok(salton.evidence.some(item => /doi\.org\/10\.3390\/en14206805/.test(item.url)));
  assert.ok(salton.evidence.some(item => /doi\.org\/10\.2172\/1782801/.test(item.url)));
  assert.match(salton.notes, /not a mineral concession/i);
  assert.match(salton.notes, /Not Texas Gulf seawater/i);

  const yanbu = byId.get('saudi-yanbu');
  assert.equal(yanbu.kind, 'industrial-coast');
  assert.equal(yanbu.region, 'Red Sea');
  assert.equal(yanbu.assayId, 'red-sea-seawater');
  assert.equal(yanbu.brineAssayId, 'red-sea-sabkha-brine');
  assert.equal(yanbu.rightsHints.seawaterIntake.status, 'assumed');
  assert.match(yanbu.rightsHints.brineConcession.note, /not a mineral concession/i);

  const kwinana = byId.get('au-kwinana');
  assert.equal(kwinana.brineAssayId, 'lake-mackay-wa-brine');
  assert.match(kwinana.notes, /Lake Mackay/i);

  const duqm = byId.get('oman-duqm');
  assert.equal(duqm.brineAssayId, undefined);
  assert.equal(duqm.permanentSkip.abundance.reason, 'no-brine-assay');
  assert.match(duqm.permanentSkip.abundance.notes, /Permanent skip/i);
  assert.match(duqm.notes, /permanently skipped/i);
});

test('catalog basins wire Uyuni, Qaidam, Danakil, and Searles as inland brine hubs', () => {
  const byId = new Map(SITE_PRESETS.map(site => [site.id, site]));

  const uyuni = byId.get('bolivia-uyuni');
  assert.equal(uyuni.kind, 'brine-hub');
  assert.equal(uyuni.region, 'Bolivia / Uyuni');
  assert.equal(uyuni.latitude, -20.29);
  assert.equal(uyuni.longitude, -67.61);
  assert.equal(uyuni.brineAssayId, 'uyuni-lithium-brine');
  assert.equal(uyuni.assayId, undefined);
  assert.ok(uyuni.evidence.some(item => /doi\.org\/10\.3389\/fceng\.2022\.1008680/.test(item.url)));
  assert.match(uyuni.notes, /not a .*concession/i);
  assert.match(uyuni.notes, /inherits Atacama\/Chile TEA/i);

  const qaidam = byId.get('china-qaidam');
  assert.equal(qaidam.kind, 'brine-hub');
  assert.equal(qaidam.region, 'China / Qaidam');
  assert.equal(qaidam.latitude, 38.15);
  assert.equal(qaidam.longitude, 90.87);
  assert.equal(qaidam.brineAssayId, 'qaidam-brine');
  assert.equal(qaidam.assayId, undefined);
  assert.ok(qaidam.evidence.some(item => /doi\.org\/10\.3389\/fenvs\.2023\.1106181/.test(item.url)));
  assert.match(qaidam.notes, /not a .*concession/i);
  assert.match(qaidam.notes, /default TEA/i);

  const danakil = byId.get('ethiopia-danakil');
  assert.equal(danakil.kind, 'brine-hub');
  assert.equal(danakil.region, 'Red Sea');
  assert.equal(danakil.latitude, 14.24);
  assert.equal(danakil.longitude, 40.3);
  assert.equal(danakil.brineAssayId, 'danakil-brine');
  assert.equal(danakil.assayId, undefined);
  assert.ok(danakil.evidence.some(item => /doi\.org\/10\.1016\/B978-012276152-2/.test(item.url)));
  assert.match(danakil.notes, /not an Allana\/ICL potash concession/i);
  assert.match(danakil.notes, /Not Red Sea seawater/i);

  const searles = byId.get('us-searles-lake');
  assert.equal(searles.kind, 'brine-hub');
  assert.equal(searles.region, 'US West / California');
  assert.equal(searles.latitude, 35.73);
  assert.equal(searles.longitude, -117.37);
  assert.equal(searles.brineAssayId, 'searles-lake-brine');
  assert.equal(searles.assayId, undefined);
  assert.ok(searles.evidence.some(item => /archive\.org\/details\/industrialdevelo00teep/.test(item.url)));
  assert.ok(searles.evidence.some(item => /doi\.org\/10\.3133\/pp1043/.test(item.url)));
  assert.match(searles.notes, /not a .*concession/i);
  assert.match(searles.notes, /Not Texas Gulf seawater/i);
});
