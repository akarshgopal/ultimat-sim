(function exposeUncertainty(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetUncertainty = api;
})(globalThis, () => {
const QUALITIES = Object.freeze(['cited', 'recoverable', 'assumption', 'derived', 'screening']);
const QUALITY_SET = new Set(QUALITIES);
const RIGHT_KEYS = Object.freeze([
  'gridImport', 'freshwater', 'seawaterIntake', 'seawaterDischarge', 'brineConcession', 'saltPurchase',
]);
const RIGHT_KINDS = Object.freeze({
  gridImport: 'grid',
  freshwater: 'freshwater',
  seawaterIntake: 'intake',
  seawaterDischarge: 'discharge',
  brineConcession: 'concession',
  saltPurchase: 'purchase',
});
const RIGHT_STATUSES = Object.freeze(['authorized', 'assumed', 'unverified']);

const QUALITY_TITLES = Object.freeze({
  cited: 'Traced to a named source',
  recoverable: 'Literature value not yet pinned to a table row',
  assumption: 'Screening guess until replaced',
  derived: 'From stoichiometry or physical constants',
  screening: 'Order-of-magnitude screening, not a quote',
});

const RIGHT_TITLES = Object.freeze({
  authorized: 'A named right or contract is on file',
  assumed: 'Screening access until a right is verified',
  unverified: 'No right verified; do not treat as available supply',
});

// Catalog intensities when a unit has no sourceNote of its own.
// Family citations without a page-pinned number stay recoverable;
// commodity-only links and undocumented SECs stay assumption.
const UNIT_INTENSITY_QUALITY = Object.freeze({
  swro: 'cited',
  med: 'cited',
  msf: 'cited',
  electrolyzer: 'cited',
  dac: 'screening',
  'dac-solid': 'screening',
  'dac-liquid': 'cited',
  'dac-electroswing': 'cited',
  sabatier: 'screening',
  asu: 'recoverable',
  ammonia: 'recoverable',
  'brine-minerals': 'assumption',
  'chlor-alkali': 'recoverable',
  'bromine-recovery': 'assumption',
  'aluminium-smelter': 'recoverable',
  'hydrogen-dri': 'assumption',
  'titanium-kroll': 'assumption',
  'solar-pv': 'cited',
  battery: 'recoverable',
  'solar-thermal': 'assumption',
  'thermal-storage': 'assumption',
  'nuclear-electricity': 'assumption',
  'grid-electricity': 'assumption',
});

const BAND_UNIT = String.raw`kWh\/(?:kg|Nm³|Nm3|m³|m3)|kJ\/mol|GJ\/t`;
const BAND_IN_TEXT = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*(${BAND_UNIT})`, 'gi');

function normalizeQuality(quality) {
  const raw = String(quality || '').toLowerCase().trim();
  if (raw === 'user-assumption') return 'assumption';
  if (raw === 'literature-estimate') return 'recoverable';
  return QUALITY_SET.has(raw) ? raw : '';
}

function kindKey(context = {}) {
  return String(context.kind || context.metric || '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function noteText(context = {}) {
  return [context.sourceNote, context.note, context.economicsNote].filter(Boolean).join(' ');
}

function classifyFromNotes(context = {}) {
  const note = noteText(context);
  const unit = context.unit || '';
  if (/derived|stoichiometr|molar mass|iupac/i.test(note)) return 'derived';
  if (/\bscreening\b/i.test(note) && /assumption|not a plant quote|order-of-magnitude|illustrative/i.test(note)) {
    return 'screening';
  }
  if (/\bscreening\b/i.test(note) && !/nrel\s*atb|buttler|keith et al|voskian|pvgis|unctad|elimelech|ghaffour|scenario [ac]\b/i.test(note)) {
    return 'screening';
  }
  if (/nrel\s*atb|buttler|keith et al|voskian|pvgis|unctad|elimelech|ghaffour|scenario [ac]\b|class 8/i.test(note)) {
    return 'cited';
  }
  if (/not vendor quotes|editable assumption|user-assumption|not a voyage quote/i.test(note)) {
    return 'assumption';
  }
  if (/\bassumption\b/i.test(note)) return 'assumption';
  if (UNIT_INTENSITY_QUALITY[unit]) return UNIT_INTENSITY_QUALITY[unit];
  if (Array.isArray(context.references) && context.references.length) return 'recoverable';
  return 'assumption';
}

function classifyQuality(context = {}) {
  if (typeof context === 'string') return normalizeQuality(context) || 'assumption';
  const explicit = normalizeQuality(context.quality || context.class);
  if (explicit) return explicit;

  const kind = kindKey(context);
  const unit = context.unit || '';
  const note = noteText(context);

  if (kind === 'lcoe' || kind === 'simple-lcoe') {
    if (unit === 'solar-pv' || /nrel\s*atb/i.test(note)) return 'cited';
    return 'assumption';
  }
  if (kind === 'lcoh' || kind === 'simple-lcoh') return 'assumption';
  if (
    kind === 'product-cost'
    || kind === 'productcost'
    || kind === 'levelized'
    || kind === 'levelized-delivered-cost'
    || kind === 'levelizeddeliveredcost'
  ) {
    return 'screening';
  }
  if (kind === 'land' || kind === 'footprint' || kind === 'gcr') return 'assumption';
  if (kind === 'meteo' || kind === 'site-meteo' || kind === 'pv-yield') {
    if (/pvgis/i.test(note)) return 'cited';
    return classifyFromNotes(context) || 'assumption';
  }
  if (kind === 'assay' || kind === 'site-assay') {
    return classifyFromNotes(context) || 'assumption';
  }
  if (kind === 'freight' || kind === 'corridor-freight') return 'cited';
  if (kind === 'money' || kind === 'capex' || kind === 'npv' || kind === 'revenue' || kind === 'opex' || kind === 'cash') {
    return 'screening';
  }
  if (kind === 'derived' || kind === 'stoichiometry') return 'derived';
  if (kind === 'intensity' || kind === 'sec' || kind === 'energy-intensity') {
    return classifyFromNotes(context);
  }
  if (kind) return classifyFromNotes(context);
  return classifyFromNotes(context);
}

function digitsFor(quality) {
  if (quality === 'cited') return 3;
  if (quality === 'derived') return 4;
  return 2;
}

function significantFigures(value, digits) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return number;
  const sign = number < 0 ? -1 : 1;
  const abs = Math.abs(number);
  const mag = Math.floor(Math.log10(abs));
  const scale = 10 ** (digits - 1 - mag);
  return sign * Math.round(abs * scale) / scale;
}

function formatPlain(value, digits) {
  const rounded = significantFigures(value, digits);
  if (!Number.isFinite(rounded)) return '—';
  if (rounded === 0) return '0';
  const mag = Math.floor(Math.log10(Math.abs(rounded)));
  const fractionDigits = Math.max(0, digits - 1 - mag);
  return rounded.toLocaleString('en-US', {
    maximumFractionDigits: Math.min(6, fractionDigits),
    minimumFractionDigits: 0,
  });
}

function coerceBand(band) {
  if (!band || typeof band !== 'object' || Array.isArray(band)) return null;
  const low = Number(band.low ?? band.min);
  const high = Number(band.high ?? band.max);
  if (!Number.isFinite(low) || !Number.isFinite(high) || !(high > low)) return null;
  return { low, high, unit: band.unit ? String(band.unit) : '' };
}

function parseBandFromText(text) {
  const matches = [...String(text || '').matchAll(BAND_IN_TEXT)]
    .map(match => ({ low: Number(match[1]), high: Number(match[2]), unit: match[3] }))
    .filter(item => Number.isFinite(item.low) && Number.isFinite(item.high) && item.high > item.low);
  if (!matches.length) return null;
  return matches.find(item => /kWh\/kg/i.test(item.unit)) || matches[0];
}

function parseBand(band) {
  if (!band) return null;
  if (typeof band === 'string') return parseBandFromText(band);
  return coerceBand(band);
}

function bandSuffix(band) {
  const parsed = parseBand(band);
  if (!parsed) return '';
  const unit = parsed.unit ? ` ${parsed.unit}` : '';
  return ` (${formatPlain(parsed.low, 3)}–${formatPlain(parsed.high, 3)}${unit})`;
}

function resolveQuality(quality) {
  if (typeof quality === 'string') return normalizeQuality(quality) || 'assumption';
  if (quality && typeof quality === 'object') return classifyQuality(quality);
  return 'assumption';
}

function formatUncertainNumber(value, quality = 'assumption', options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const q = resolveQuality(quality);
  const digits = options.digits ?? digitsFor(q);
  const formatted = formatPlain(number, digits);
  const unit = options.unit ? ` ${options.unit}` : (options.suffix ? `${options.suffix}` : '');
  return `${formatted}${unit}${bandSuffix(options.band)}`;
}

function formatUncertainMoney(value, quality = 'assumption', options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const q = resolveQuality(quality);
  const digits = options.digits ?? digitsFor(q);
  const rounded = significantFigures(number, digits);
  if (!Number.isFinite(rounded)) return '—';
  const mag = rounded === 0 ? 0 : Math.floor(Math.log10(Math.abs(rounded)));
  const fractionDigits = Math.max(0, digits - 1 - mag);
  const absText = Math.abs(rounded).toLocaleString('en-US', {
    maximumFractionDigits: Math.min(4, fractionDigits),
    minimumFractionDigits: 0,
  });
  const signed = rounded < 0 ? `-$${absText}` : `$${absText}`;
  const unit = options.unit ? ` ${options.unit}` : (options.suffix || '');
  return `${signed}${unit}${bandSuffix(options.band)}`;
}

function qualityChip(quality, options = {}) {
  const q = typeof quality === 'object' && quality ? classifyQuality(quality) : resolveQuality(quality);
  if (!q) return '';
  if (options.omitNoisy && (q === 'screening' || q === 'assumption')) return '';
  const title = QUALITY_TITLES[q] || q;
  return `<span class="quality-chip quality-${q}" title="${title}">${q}</span>`;
}

function rightsChip(status) {
  const s = RIGHT_STATUSES.includes(status) ? status : 'unverified';
  const title = RIGHT_TITLES[s] || s;
  return `<span class="quality-chip rights-chip rights-${s}" title="${title}">${s}</span>`;
}

function citeFrom(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(item => item && item.label);
  if (typeof value === 'string') return [{ label: value }];
  if (value.label) return [value];
  return [];
}

function authorizeForStatus(status) {
  return status === 'authorized' || status === 'assumed';
}

function rightIsAuthorized(right) {
  if (!right) return false;
  if (right.authorize === true) return true;
  if (right.authorize === false) return false;
  return authorizeForStatus(right.status);
}

function unverifiedRightsWarnings(site) {
  const rights = site?.rights;
  if (!rights || typeof rights !== 'object') return [];
  return RIGHT_KEYS
    .filter(key => rights[key]?.status === 'unverified')
    .map(key => `unverified site right: ${key}`);
}

function citeMarkup(references) {
  const list = (references || []).filter(item => item && item.label);
  if (!list.length) return '';
  return `<span class="number-cite">${list.map(item => (
    item.url
      ? `<a href="${item.url}" target="_blank" rel="noreferrer">${item.label}</a>`
      : item.label
  )).join(' · ')}</span>`;
}

return {
  QUALITIES,
  QUALITY_TITLES,
  RIGHT_KEYS,
  RIGHT_KINDS,
  RIGHT_STATUSES,
  RIGHT_TITLES,
  authorizeForStatus,
  rightIsAuthorized,
  classifyQuality,
  formatUncertainMoney,
  formatUncertainNumber,
  qualityChip,
  rightsChip,
  citeFrom,
  unverifiedRightsWarnings,
  parseBand,
  citeMarkup,
};
});
