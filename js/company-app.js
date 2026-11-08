// Company view: runs FoundryCompany.simulateCompany on the repo's pathways, markets
// and sites, and draws what the company builds, where, when, and what it becomes.
// Zero dependencies; charts are hand-rolled inline SVG. Leaflet is optional (map).
(() => {
  'use strict';

  const Company = globalThis.FoundryCompany;
  const PATHWAYS = globalThis.FoundryPathways?.PATHWAYS || [];
  const MARKETS = globalThis.FoundryMarkets?.MARKETS || {};
  const D = Company.DEFAULTS;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Scenario: flat, URL-hash friendly keys ↔ engine config

  const pct = v => Math.round(v * 1000) / 10; // fraction → % with one decimal
  const FIELDS = [
    { group: 'fieldsFinance', key: 'years', label: 'Years', unit: 'yr', min: 1, max: 60, step: 1, def: D.years },
    { group: 'fieldsFinance', key: 'equity', label: 'Start equity', unit: '$M', min: 1, max: 100000, step: 1, def: D.finance.initialEquityUsd / 1e6 },
    { group: 'fieldsFinance', key: 'debt', label: 'Debt fraction', unit: '%', min: 0, max: 90, step: 5, def: pct(D.finance.debtFraction) },
    { group: 'fieldsFinance', key: 'rate', label: 'Discount rate', unit: '%', min: 0, max: 30, step: 0.5, def: pct(D.finance.discountRate) },
    { group: 'fieldsBuild', key: 'share', label: 'Max market share', unit: '%', min: 0.1, max: 100, step: 0.5, def: pct(D.build.maxMarketShare) },
    { group: 'fieldsBuild', key: 'pvSite', label: 'Max PV per site', unit: 'GWp', min: 0.1, max: 1000, step: 1, def: D.build.maxPvGWpPerSite },
    { group: 'fieldsBuild', key: 'lead', label: 'Lead time', unit: 'yr', min: 0, max: 10, step: 1, def: D.build.leadTimeYears },
    { group: 'fieldsBuild', key: 'perYear', label: 'Plants per year', unit: 'max', min: 0, max: 200, step: 1, def: D.build.maxPlantsPerYear },
    { group: 'fieldsLearning', key: 'pvCapex', label: 'PV capex', unit: '$/kWp', min: 50, max: 5000, step: 10, def: D.pv.capexUsdPerKWp },
    { group: 'fieldsLearning', key: 'pvDecline', label: 'PV decline', unit: '%/yr', min: 0, max: 30, step: 0.5, def: pct(D.pv.exogenousDeclinePerYear) },
    { group: 'fieldsLearning', key: 'lrElec', label: 'Electrolyzer LR', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.electrolyzer.learningRate) },
    { group: 'fieldsLearning', key: 'lrProc', label: 'Process LR', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.process.learningRate) },
    { group: 'fieldsLearning', key: 'lrDac', label: 'DAC LR', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.dac.learningRate) },
    { group: 'fieldsLearning', key: 'scaleExp', label: 'Scale exponent', unit: '', min: 0.3, max: 1, step: 0.01, def: D.scale.exponent },
    { group: 'fieldsLearning', key: 'scaleFloor', label: 'Scale floor', unit: '×', min: 0, max: 1, step: 0.05, def: D.scale.floorFactor },
  ];
  const FIELD_BY_KEY = Object.fromEntries(FIELDS.map(f => [f.key, f]));
  const ORIGINS = [
    { id: 'ocean', label: 'Ocean' },
    { id: 'brine', label: 'Brine' },
    { id: 'air', label: 'Air' },
    { id: 'crust', label: 'Crustal rock' },
    { id: 'water', label: 'Fresh water' },
    { id: 'intermediate', label: 'Intermediates' },
  ];
  const RANK_SIZES = ['1', '10', '100', '1000'];

  function defaultScenario() {
    const s = {};
    for (const f of FIELDS) s[f.key] = f.def;
    s.origins = ORIGINS.map(o => o.id);
    s.infinite = false;
    s.off = [];
    s.size = '10';
    return s;
  }

  function scenarioToHash(s) {
    const d = defaultScenario();
    const params = new URLSearchParams();
    for (const f of FIELDS) if (s[f.key] !== d[f.key]) params.set(f.key, String(s[f.key]));
    if (s.origins.length !== d.origins.length) params.set('origins', s.origins.join(','));
    if (s.infinite) params.set('infinite', '1');
    if (s.off.length) params.set('off', s.off.join(','));
    if (s.size !== d.size) params.set('size', s.size);
    return params.toString();
  }

  function scenarioFromHash(hash) {
    const s = defaultScenario();
    const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    for (const f of FIELDS) {
      if (!params.has(f.key)) continue;
      const v = Number(params.get(f.key));
      if (Number.isFinite(v)) s[f.key] = clamp(v, f.min, f.max);
    }
    if (params.has('origins')) {
      const ids = new Set(params.get('origins').split(',').filter(Boolean));
      s.origins = ORIGINS.map(o => o.id).filter(id => ids.has(id));
    }
    s.infinite = params.get('infinite') === '1';
    if (params.has('off')) {
      const known = new Set(PATHWAYS.map(p => p.id));
      s.off = params.get('off').split(',').filter(id => known.has(id));
    }
    if (RANK_SIZES.includes(params.get('size'))) s.size = params.get('size');
    return s;
  }

  function pathwayAllowedByFeeds(pathway, s) {
    const origins = new Set(s.origins);
    for (const feed of pathway.feeds || []) {
      if (!origins.has(feed.origin)) return false;
      if (s.infinite && feed.origin === 'intermediate' && feed.purchased) return false;
    }
    return true;
  }

  function allowedPathwayIds(s) {
    const off = new Set(s.off);
    return PATHWAYS.filter(p => !off.has(p.id) && pathwayAllowedByFeeds(p, s)).map(p => p.id);
  }

  function scenarioToConfig(s, { forRanking = false } = {}) {
    const tech = {
      electrolyzer: { learningRate: s.lrElec / 100 },
      process: { learningRate: s.lrProc / 100 },
      dac: { learningRate: s.lrDac / 100 },
    };
    return {
      years: Math.round(s.years),
      finance: { initialEquityUsd: s.equity * 1e6, debtFraction: s.debt / 100, discountRate: s.rate / 100 },
      build: {
        maxMarketShare: s.share / 100,
        maxPvGWpPerSite: s.pvSite,
        leadTimeYears: Math.round(s.lead),
        maxPlantsPerYear: Math.round(s.perYear),
        allowPathways: forRanking ? null : allowedPathwayIds(s),
      },
      pv: { capexUsdPerKWp: s.pvCapex, exogenousDeclinePerYear: s.pvDecline / 100 },
      tech,
      scale: { exponent: s.scaleExp, floorFactor: s.scaleFloor },
    };
  }

  // ---------------------------------------------------------------------------
  // Formatting

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function fmtNum(v, digits = 3) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1e12) return trim(v / 1e12, digits) + 'T';
    if (a >= 1e9) return trim(v / 1e9, digits) + 'B';
    if (a >= 1e6) return trim(v / 1e6, digits) + 'M';
    if (a >= 1e4) return trim(v / 1e3, digits) + 'k';
    return trim(v, digits);
  }
  function trim(v, digits) {
    const a = Math.abs(v);
    const d = a >= 100 ? 0 : a >= 10 ? Math.max(0, digits - 2) : a >= 1 ? Math.max(0, digits - 1) : digits;
    return Number(v.toFixed(Math.min(6, d))).toLocaleString('en-US', { maximumFractionDigits: Math.min(6, d) });
  }
  function fmtUsd(v, digits = 3) {
    if (!Number.isFinite(v)) return '—';
    return (v < 0 ? '−$' : '$') + fmtNum(Math.abs(v), digits);
  }
  function fmtUsdKg(v) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    const s = a >= 100 ? a.toFixed(0) : a >= 1 ? a.toFixed(2) : a.toFixed(3);
    return (v < 0 ? '−$' : '$') + s;
  }
  function fmtPct(v, digits = 1) {
    if (!Number.isFinite(v)) return '—';
    const p = v * 100;
    const a = Math.abs(p);
    return (a > 0 && a < 0.1 ? p.toFixed(3) : a < 1 ? p.toFixed(2) : p.toFixed(digits)) + '%';
  }
  function fmtTonnes(t) { return Number.isFinite(t) ? fmtNum(t) + ' t' : '—'; }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const child of [].concat(children)) if (child != null) node.append(child);
    return node;
  }
  function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, String(v));
    return node;
  }

  const productName = key => MARKETS[key]?.name || key;
  const pathwayById = new Map(PATHWAYS.map(p => [p.id, p]));

  // ---------------------------------------------------------------------------
  // Sites (presets + frozen PVGIS + land prices)

  let SITES = [];
  let siteById = new Map();

  async function loadSites() {
    const pvgis = globalThis.PvgisSites;
    if (pvgis?.hydrate) {
      try { await pvgis.hydrate(); } catch { /* sites without a freeze drop out */ }
    }
    const MapSite = globalThis.MapSite;
    const landPriceAt = MapSite?.landPriceAt && globalThis.LAND_ADMIN_GEOJSON && globalThis.LAND_PRICES
      ? (lat, lon) => MapSite.landPriceAt(lat, lon)
      : null; // engine default land price applies
    SITES = Company.buildSites({ sitePresets: globalThis.SITE_PRESETS || [], pvgisSites: pvgis, landPriceAt });
    siteById = new Map(SITES.map(s => [s.id, s]));
    return SITES;
  }

  // ---------------------------------------------------------------------------
  // Colors: categorical slots read from CSS tokens; product → slot is sticky
  // across re-runs so a scenario change never repaints a surviving series.

  const SLOT_COUNT = 7; // slot 8 stays free; "Other" uses the muted token
  const productSlot = new Map();
  function assignSlots(keys) {
    const keep = new Set(keys);
    for (const key of [...productSlot.keys()]) if (!keep.has(key)) productSlot.delete(key);
    const used = new Set(productSlot.values());
    for (const key of keys) {
      if (productSlot.has(key)) continue;
      for (let i = 1; i <= SLOT_COUNT; i += 1) {
        if (!used.has(i)) { productSlot.set(key, i); used.add(i); break; }
      }
    }
  }
  const slotColor = i => `var(--series-${i})`;

  // ---------------------------------------------------------------------------
  // Charts

  const tooltip = () => $('chartTooltip');
  const chartRegistry = new Map(); // container → last spec, for resize re-render

  function niceStep(span, target) {
    const raw = span / Math.max(1, target);
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  }

  // spec: { x: number[], series: [{ key, label, color, values[] }], kind: 'line'|'stack'|'area',
  //         log, yMin, yMax, yFormat, refLines: [{ y, label }], ariaLabel, height }
  function drawChart(container, spec) {
    chartRegistry.set(container, spec);
    container.replaceChildren();
    const width = Math.max(260, Math.floor(container.clientWidth || 600));
    const height = spec.height || (width < 480 ? 200 : 240);
    const fmt = spec.yFormat || fmtNum;
    const n = spec.x.length;
    if (!n || !spec.series.length) {
      container.append(el('p', { class: 'chart-empty', text: spec.emptyText || 'Nothing built in this scenario.' }));
      return;
    }

    // Stack if needed.
    let layers = spec.series.map(s => ({ ...s, lo: s.values.map(() => 0), hi: s.values.slice() }));
    if (spec.kind === 'stack') {
      const acc = new Array(n).fill(0);
      layers = spec.series.map(s => {
        const lo = acc.slice();
        for (let i = 0; i < n; i += 1) acc[i] += Math.max(0, s.values[i] || 0);
        return { ...s, lo, hi: acc.slice() };
      });
    }

    // Y domain.
    let yMax = spec.yMax ?? -Infinity;
    let yMin = spec.yMin ?? (spec.log ? Infinity : 0);
    for (const l of layers) {
      for (let i = 0; i < n; i += 1) {
        const v = l.hi[i];
        if (!Number.isFinite(v)) continue;
        if (spec.log && !(v > 0)) continue;
        if (spec.yMax == null) yMax = Math.max(yMax, v);
        if (spec.log && spec.yMin == null) yMin = Math.min(yMin, v);
      }
    }
    for (const r of spec.refLines || []) yMax = Math.max(yMax, r.y * 1.12);
    if (!Number.isFinite(yMax) || yMax <= 0) yMax = 1;

    const pad = { top: 10, right: spec.endLabels ? 64 : 14, bottom: 24, left: 58 };
    const iw = width - pad.left - pad.right;
    const ih = height - pad.top - pad.bottom;
    const xs = i => pad.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);

    let ys;
    let ticks = [];
    if (spec.log) {
      if (!Number.isFinite(yMin) || yMin <= 0) yMin = yMax / 1e3;
      let lo = Math.floor(Math.log10(Math.max(yMin, yMax / 1e9)));
      const hi = Math.ceil(Math.log10(yMax));
      if (hi - lo < 1) lo = hi - 1;
      ys = v => pad.top + ih - ((Math.log10(Math.max(v, 10 ** lo)) - lo) / (hi - lo)) * ih;
      const every = Math.ceil((hi - lo) / 6);
      for (let e = lo; e <= hi; e += every) ticks.push(10 ** e);
    } else {
      const step = niceStep(yMax - yMin, height < 200 ? 3 : 4);
      const top = Math.ceil(yMax / step) * step;
      ys = v => pad.top + ih - ((v - yMin) / (top - yMin)) * ih;
      for (let t = yMin; t <= top + step * 1e-6; t += step) ticks.push(t);
    }

    const root = svg('svg', {
      viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart-svg', role: 'img', tabindex: 0,
      'aria-label': spec.ariaLabel || '',
    });
    const grid = svg('g', { class: 'chart-grid-lines' });
    for (const t of ticks) {
      const y = ys(t);
      grid.append(svg('line', { x1: pad.left, x2: width - pad.right, y1: y, y2: y }));
      const label = svg('text', { x: pad.left - 6, y: y + 3.5, 'text-anchor': 'end', class: 'chart-tick' });
      label.textContent = fmt(t);
      grid.append(label);
    }
    // X ticks: years, ~6 labels.
    const xEvery = Math.max(1, Math.ceil(n / (width < 480 ? 4 : 7)));
    for (let i = 0; i < n; i += xEvery) {
      const label = svg('text', { x: xs(i), y: height - 6, 'text-anchor': 'middle', class: 'chart-tick' });
      label.textContent = String(spec.x[i]);
      grid.append(label);
    }
    grid.append(svg('line', { class: 'chart-baseline', x1: pad.left, x2: width - pad.right, y1: pad.top + ih, y2: pad.top + ih }));
    root.append(grid);

    const marks = svg('g', { class: 'chart-marks' });
    if (spec.kind === 'stack') {
      for (const l of layers) {
        let d = '';
        for (let i = 0; i < n; i += 1) d += (i ? 'L' : 'M') + xs(i).toFixed(1) + ',' + ys(l.hi[i]).toFixed(1);
        for (let i = n - 1; i >= 0; i -= 1) d += 'L' + xs(i).toFixed(1) + ',' + ys(l.lo[i]).toFixed(1);
        marks.append(svg('path', { d: d + 'Z', fill: l.color, class: 'chart-band' }));
      }
    } else {
      for (const l of layers) {
        if (spec.kind === 'area') {
          let d = '';
          for (let i = 0; i < n; i += 1) d += (i ? 'L' : 'M') + xs(i).toFixed(1) + ',' + ys(l.hi[i] || 0).toFixed(1);
          d += `L${xs(n - 1).toFixed(1)},${ys(0).toFixed(1)}L${xs(0).toFixed(1)},${ys(0).toFixed(1)}Z`;
          marks.append(svg('path', { d, fill: l.color, class: 'chart-wash' }));
        }
        // Line with gaps where the value is missing (or ≤ 0 on a log axis).
        let d = '';
        let pen = false;
        for (let i = 0; i < n; i += 1) {
          const v = l.hi[i];
          const ok = Number.isFinite(v) && (!spec.log || v > 0);
          if (!ok) { pen = false; continue; }
          d += (pen ? 'L' : 'M') + xs(i).toFixed(1) + ',' + ys(v).toFixed(1);
          pen = true;
        }
        if (d) marks.append(svg('path', { d, stroke: l.color, class: 'chart-line' + (l.dash ? ' is-dashed' : '') }));
      }
    }
    for (const r of spec.refLines || []) {
      const y = ys(r.y);
      marks.append(svg('line', { class: 'chart-ref', x1: pad.left, x2: width - pad.right, y1: y, y2: y }));
      const t = svg('text', { class: 'chart-ref-label', x: width - pad.right, y: y - 5, 'text-anchor': 'end' });
      t.textContent = r.label;
      marks.append(t);
    }
    root.append(marks);

    // Direct end labels (≤ 4 series), nudged apart.
    if (spec.endLabels && spec.kind !== 'stack' && layers.length <= 4) {
      const items = layers.map(l => {
        let i = n - 1;
        while (i > 0 && !(Number.isFinite(l.hi[i]) && (!spec.log || l.hi[i] > 0))) i -= 1;
        return { l, y: ys(l.hi[i] > 0 || !spec.log ? l.hi[i] : 1), x: xs(i) };
      }).filter(it => Number.isFinite(it.y)).sort((a, b) => a.y - b.y);
      for (let k = 1; k < items.length; k += 1) items[k].y = Math.max(items[k].y, items[k - 1].y + 12);
      for (const it of items) {
        const t = svg('text', { class: 'chart-end-label', x: width - pad.right + 6, y: Math.min(pad.top + ih, it.y) + 3.5 });
        t.textContent = it.l.label;
        root.append(t);
      }
    }

    // Hover layer: crosshair + one tooltip listing every series.
    const cross = svg('line', { class: 'chart-cross', y1: pad.top, y2: pad.top + ih, visibility: 'hidden' });
    const dots = svg('g', { visibility: 'hidden' });
    const dotFor = layers.map(l => {
      const c = svg('circle', { r: 4, fill: l.color, class: 'chart-dot' });
      dots.append(c);
      return c;
    });
    root.append(cross, dots);
    const hit = svg('rect', { x: pad.left - 8, y: pad.top, width: iw + 16, height: ih, fill: 'transparent', class: 'chart-hit' });
    root.append(hit);

    let current = -1;
    const show = (i, clientX, clientY) => {
      current = i;
      const x = xs(i);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x);
      cross.setAttribute('visibility', 'visible');
      dots.setAttribute('visibility', 'visible');
      layers.forEach((l, k) => {
        const v = l.hi[i];
        const ok = Number.isFinite(v) && (!spec.log || v > 0);
        dotFor[k].setAttribute('visibility', ok ? 'visible' : 'hidden');
        if (ok) { dotFor[k].setAttribute('cx', x); dotFor[k].setAttribute('cy', ys(v)); }
      });
      const tip = tooltip();
      tip.replaceChildren(el('div', { class: 'tip-head', text: String(spec.x[i]) }));
      const rows = layers.map(l => ({ l, v: l.values[i] }));
      if (spec.kind === 'stack') rows.reverse();
      for (const { l, v } of rows) {
        const key = el('span', { class: 'tip-key' });
        key.style.background = l.color;
        tip.append(el('div', { class: 'tip-row' }, [key, el('strong', { text: Number.isFinite(v) ? fmt(v) : '—' }), el('span', { text: l.label })]));
      }
      if (spec.kind === 'stack') {
        const total = layers.reduce((sum, l) => sum + (Number(l.values[i]) || 0), 0);
        tip.append(el('div', { class: 'tip-row tip-total' }, [el('span', { class: 'tip-key is-empty' }), el('strong', { text: fmt(total) }), el('span', { text: 'Total' })]));
      }
      tip.hidden = false;
      const rect = root.getBoundingClientRect();
      const px = clientX ?? rect.left + (x / width) * rect.width;
      const py = clientY ?? rect.top + rect.height * 0.3;
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      let left = px + 14;
      if (left + tw > window.innerWidth - 8) left = px - tw - 14;
      left = clamp(left, 8, Math.max(8, window.innerWidth - tw - 8));
      const top = clamp(py - th / 2, 8, Math.max(8, window.innerHeight - th - 8));
      tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    const hide = () => {
      current = -1;
      cross.setAttribute('visibility', 'hidden');
      dots.setAttribute('visibility', 'hidden');
      tooltip().hidden = true;
    };
    const indexAt = clientX => {
      const rect = root.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * width;
      return clamp(Math.round(((x - pad.left) / iw) * (n - 1)), 0, n - 1);
    };
    root.addEventListener('pointermove', ev => show(indexAt(ev.clientX), ev.clientX, ev.clientY));
    root.addEventListener('pointerleave', hide);
    root.addEventListener('blur', hide);
    root.addEventListener('focus', () => show(n - 1));
    root.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        show(clamp((current < 0 ? n - 1 : current) + (ev.key === 'ArrowRight' ? 1 : -1), 0, n - 1));
      } else if (ev.key === 'Escape') hide();
    });
    container.append(root);
  }

  function renderLegend(container, series, kind) {
    if (!container) return;
    container.replaceChildren();
    if (series.length < 2) return;
    for (const s of series) {
      const sw = el('span', { class: 'legend-swatch' + (kind === 'line' ? ' is-line' : '') + (s.dash ? ' is-dashed' : '') });
      sw.style.setProperty('--swatch', s.color);
      container.append(el('span', { class: 'legend-item' }, [sw, el('span', { text: s.label })]));
    }
  }

  function renderTable(details, x, series, fmt) {
    const body = details.querySelector('.chart-table');
    const build = () => {
      const table = el('table', { class: 'data-table compact' });
      const head = el('tr', {}, [el('th', { text: 'Year', scope: 'col' }), ...series.map(s => el('th', { text: s.label, scope: 'col' }))]);
      table.append(el('thead', {}, head));
      const tb = el('tbody');
      x.forEach((year, i) => tb.append(el('tr', {}, [el('th', { text: String(year), scope: 'row' }), ...series.map(s => el('td', { text: (s.fmt || fmt)(s.values[i]) }))])));
      table.append(tb);
      body.replaceChildren(el('div', { class: 'table-scroll' }, table));
    };
    details.ontoggle = () => { if (details.open) build(); };
    if (details.open) build(); else body.replaceChildren();
  }

  // ---------------------------------------------------------------------------
  // Sections

  function kpiTile(label, value, sub, extraClass) {
    return el('div', { class: 'kpi' + (extraClass ? ' ' + extraClass : '') }, [
      el('span', { class: 'kpi-label', text: label }),
      el('strong', { class: 'kpi-value', text: value }),
      el('span', { class: 'kpi-sub', text: sub || '' }),
    ]);
  }

  function renderKpis(result) {
    const s = result.summary;
    const tl = result.timeline;
    const last = tl[tl.length - 1] || {};
    const first = tl[0]?.year;
    const products = Object.keys(last.outputTByProduct || {}).length;
    const sitesUsed = new Set(result.plants.map(p => p.siteId)).size;
    $('kpiSub').textContent = tl.length
      ? `${first}–${last.year} · ${fmtUsd(s.equityInUsd)} equity in · ${products} product${products === 1 ? '' : 's'} at ${sitesUsed} site${sitesUsed === 1 ? '' : 's'} by the final year`
      : 'No years simulated';
    const em = s.equityMultiple;
    $('kpiGrid').replaceChildren(
      kpiTile(`Revenue ${last.year ?? ''}`, fmtUsd(s.finalRevenueUsd), 'final year, per year'),
      kpiTile('Operating cash', fmtUsd(s.finalOperatingCashUsd), 'revenue − opex, final year'),
      kpiTile('Plants built', fmtNum(s.plants), `${fmtNum(last.plantsOperating || 0)} operating`),
      kpiTile('Solar fleet', fmtNum(s.finalPvGWp) + ' GWp', `${fmtNum(last.electricityTWh || 0)} TWh/yr`),
      kpiTile('Land', fmtNum(s.finalLandHa / 100) + ' km²', `${fmtNum(s.finalLandHa)} ha`),
      kpiTile('Total capex', fmtUsd(s.totalCapexUsd), 'all plants, all years'),
      kpiTile('Net assets', fmtUsd(s.finalNetAssetsUsd), 'cash + book − debt'),
      kpiTile('Equity multiple', Number.isFinite(em) ? fmtNum(em) + '×' : '—', 'net assets ÷ equity in'),
      kpiTile('Min cash', fmtUsd(s.minCashUsd), 'lowest year-end cash', s.minCashUsd < 0 ? 'is-negative' : ''),
    );
  }

  function renderCharts(result, scenario) {
    const tl = result.timeline;
    const x = tl.map(r => r.year);

    // (a) Money
    const money = [
      { key: 'revenue', label: 'Revenue', color: slotColor(1), values: tl.map(r => r.revenueUsd) },
      { key: 'opex', label: 'Opex', color: slotColor(2), values: tl.map(r => r.opexUsd) },
      { key: 'capex', label: 'Capex spent', color: slotColor(3), values: tl.map(r => r.capexUsd) },
      { key: 'cash', label: 'Cash', color: slotColor(4), values: tl.map(r => r.cashUsd) },
      { key: 'debt', label: 'Debt', color: slotColor(5), values: tl.map(r => r.debtUsd) },
    ];
    const moneyCard = $('chartMoney');
    const log = $('moneyLog').checked;
    renderLegend(moneyCard.querySelector('.chart-legend'), money, 'line');
    drawChart(moneyCard.querySelector('.chart-body'), {
      x, series: money, kind: 'line', log, yFormat: v => fmtUsd(v, 2),
      ariaLabel: `Money over time, ${log ? 'log' : 'linear'} scale: final-year revenue ${fmtUsd(result.summary.finalRevenueUsd)}, cash ${fmtUsd(tl.at(-1)?.cashUsd)}, debt ${fmtUsd(tl.at(-1)?.debtUsd)}.`,
    });
    renderTable(moneyCard.querySelector('.chart-data'), x, money, v => fmtUsd(v));

    // (b) Revenue by product, stacked: top products by cumulative revenue + Other.
    const cum = {};
    for (const r of tl) for (const [k, v] of Object.entries(r.revenueByProduct || {})) cum[k] = (cum[k] || 0) + v;
    const ranked = Object.keys(cum).filter(k => cum[k] > 0).sort((a, b) => cum[b] - cum[a]);
    const top = ranked.length > SLOT_COUNT ? ranked.slice(0, SLOT_COUNT - 1) : ranked;
    const rest = ranked.slice(top.length);
    // Share chart products (by peak share) also need slots; union keeps colors shared.
    const groupOf = p => Company.marketGroupOf(p, result.config);
    const peakShare = {};
    for (const r of tl) {
      for (const [p, v] of Object.entries(r.shareByProduct || {})) {
        if (v == null) continue;
        const g = groupOf(p);
        peakShare[g] = Math.max(peakShare[g] || 0, v);
      }
    }
    const shareKeys = Object.keys(peakShare).filter(k => peakShare[k] > 0).sort((a, b) => peakShare[b] - peakShare[a]);
    // Slots are shared between both product charts: revenue leaders first, then share leaders.
    const slotted = [...new Set([...top, ...shareKeys])].slice(0, SLOT_COUNT);
    assignSlots(slotted);
    const colorOf = k => (productSlot.has(k) ? slotColor(productSlot.get(k)) : 'var(--series-other)');
    const revSeries = top.map(k => ({ key: k, label: productName(k), color: colorOf(k), values: tl.map(r => r.revenueByProduct?.[k] || 0) }));
    if (rest.length) {
      revSeries.push({ key: 'other', label: `Other (${rest.length})`, color: 'var(--series-other)', values: tl.map(r => rest.reduce((sum, k) => sum + (r.revenueByProduct?.[k] || 0), 0)) });
    }
    const revCard = $('chartRevenue');
    renderLegend(revCard.querySelector('.chart-legend'), revSeries, 'area');
    drawChart(revCard.querySelector('.chart-body'), {
      x, series: revSeries, kind: 'stack', yFormat: v => fmtUsd(v, 2),
      ariaLabel: `Revenue by product, stacked. Largest over the run: ${top.slice(0, 3).map(productName).join(', ') || 'none'}.`,
    });
    renderTable(revCard.querySelector('.chart-data'), x, revSeries, v => fmtUsd(v));

    // (c) Market share by market group, lines + ceiling.
    const shareTop = shareKeys.filter(k => productSlot.has(k)).slice(0, 6);
    const shareSeries = shareTop.map(g => ({
      key: g, label: productName(g), color: colorOf(g),
      values: tl.map(r => {
        let v = null;
        for (const [p, sv] of Object.entries(r.shareByProduct || {})) if (groupOf(p) === g && sv != null) v = sv;
        return v ?? 0;
      }),
    }));
    const ceiling = scenario.share / 100;
    const shareCard = $('chartShare');
    renderLegend(shareCard.querySelector('.chart-legend'), shareSeries, 'line');
    drawChart(shareCard.querySelector('.chart-body'), {
      x, series: shareSeries, kind: 'line', yFormat: v => fmtPct(v),
      refLines: [{ y: ceiling, label: `ceiling ${fmtPct(ceiling)}` }],
      emptyText: 'No market share yet — nothing operating.',
      ariaLabel: `Share of world market for the ${shareSeries.length} largest markets, against a ${fmtPct(ceiling)} ceiling.`,
    });
    renderTable(shareCard.querySelector('.chart-data'), x, shareSeries, v => fmtPct(v));

    // (d) PV & land small multiples (two measures → two charts, never two axes).
    const pv = [{ key: 'pv', label: 'PV GWp', color: 'var(--series-4)', values: tl.map(r => r.pvGWp) }];
    const land = [{ key: 'land', label: 'Land km²', color: 'var(--series-6)', values: tl.map(r => r.landHa / 100) }];
    drawChart($('chartPv').querySelector('.chart-body'), { x, series: pv, kind: 'area', height: 180, yFormat: v => fmtNum(v), ariaLabel: `Operating PV, reaching ${fmtNum(result.summary.finalPvGWp)} GWp.` });
    drawChart($('chartLand').querySelector('.chart-body'), { x, series: land, kind: 'area', height: 180, yFormat: v => fmtNum(v), ariaLabel: `Land under PV, reaching ${fmtNum(result.summary.finalLandHa / 100)} km².` });
    renderTable($('chartFootprint').querySelector('.chart-data'), x, [
      { ...pv[0], fmt: v => fmtNum(v) + ' GWp' },
      { ...land[0], fmt: v => fmtNum(v) + ' km²' },
      { label: 'Electricity', values: tl.map(r => r.electricityTWh), fmt: v => fmtNum(v) + ' TWh' },
    ], fmtNum);

    // (e) Cost factors, indexed (1 = reference).
    const pv0 = tl[0]?.pvCapexUsdPerKWp || 1;
    const classes = [
      ['electrolyzer', 'Electrolyzer'], ['process', 'Process'], ['dac', 'DAC'], ['desal', 'Desal'], ['storage', 'Storage'],
    ];
    const learn = classes.map(([k, label], i) => ({ key: k, label, color: slotColor(i + 1), values: tl.map(r => r.costFactors?.[k]) }));
    learn.push({ key: 'pv', label: 'PV $/kWp', color: slotColor(7), values: tl.map(r => r.pvCapexUsdPerKWp / pv0) });
    const learnCard = $('chartLearning');
    renderLegend(learnCard.querySelector('.chart-legend'), learn, 'line');
    drawChart(learnCard.querySelector('.chart-body'), {
      x, series: learn, kind: 'line', yMin: 0, yFormat: v => v.toFixed(2) + '×',
      ariaLabel: `Capex multipliers by technology class; final PV ${fmtUsd(tl.at(-1)?.pvCapexUsdPerKWp)}/kWp.`,
    });
    renderTable(learnCard.querySelector('.chart-data'), x, [
      ...learn.slice(0, -1),
      { label: 'PV $/kWp', values: tl.map(r => r.pvCapexUsdPerKWp), fmt: v => fmtUsd(v) },
    ], v => (Number.isFinite(v) ? v.toFixed(3) + '×' : '—'));
  }

  // ---------------------------------------------------------------------------
  // Plants: sites table, map, build log

  function siteRollup(result) {
    const bySite = new Map();
    for (const p of result.plants) {
      const row = bySite.get(p.siteId) || { siteId: p.siteId, plants: 0, pvKWp: 0, landHa: 0, capex: 0, pathways: new Set() };
      row.plants += 1;
      row.pvKWp += p.pvKWp;
      row.landHa += p.landHa;
      row.capex += p.capexUsd;
      row.pathways.add(p.pathwayId);
      bySite.set(p.siteId, row);
    }
    return [...bySite.values()].sort((a, b) => b.pvKWp - a.pvKWp);
  }

  function renderSiteTable(rollup) {
    const table = $('siteTable');
    table.replaceChildren();
    table.append(el('thead', {}, el('tr', {}, ['Site', 'Plants', 'PV', 'Capex', 'Pathways'].map((t, i) => el('th', { scope: 'col', class: i && i < 4 ? 'num' : '', text: t })))));
    const tb = el('tbody');
    if (!rollup.length) tb.append(el('tr', {}, el('td', { colspan: 5, class: 'empty', text: 'No plants built.' })));
    for (const r of rollup) {
      const site = siteById.get(r.siteId);
      tb.append(el('tr', {}, [
        el('th', { scope: 'row' }, [el('span', { class: 'cell-main', text: site?.name || r.siteId }), el('span', { class: 'cell-sub', text: site?.region || '' })]),
        el('td', { class: 'num', text: String(r.plants) }),
        el('td', { class: 'num', text: fmtNum(r.pvKWp / 1e6) + ' GWp' }),
        el('td', { class: 'num', text: fmtUsd(r.capex) }),
        el('td', { class: 'cell-wrap', text: [...r.pathways].map(id => pathwayById.get(id)?.product ? productName(pathwayById.get(id).product) : id).filter((v, i, a) => a.indexOf(v) === i).join(', ') }),
      ]));
    }
    table.append(tb);
  }

  // Map: Leaflet when it loads (lazily, never blocking), else an offline SVG world.
  let leafletState = 'idle'; // idle | loading | ready | failed
  let leafletMap = null;
  let leafletLayer = null;
  let lastRollup = [];

  function ensureLeaflet() {
    if (globalThis.L?.map) { leafletState = 'ready'; return Promise.resolve(true); }
    if (leafletState === 'failed') return Promise.resolve(false);
    if (leafletState === 'loading') return ensureLeaflet.promise;
    leafletState = 'loading';
    ensureLeaflet.promise = new Promise(resolve => {
      const done = ok => { leafletState = ok ? 'ready' : 'failed'; resolve(ok); };
      const timer = setTimeout(() => done(false), 6000);
      const css = el('link', { rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', integrity: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H', crossorigin: 'anonymous' });
      const js = el('script', { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', integrity: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH', crossorigin: 'anonymous' });
      js.onload = () => { clearTimeout(timer); done(Boolean(globalThis.L?.map)); };
      js.onerror = () => { clearTimeout(timer); done(false); };
      document.head.append(css, js);
    });
    return ensureLeaflet.promise;
  }

  function markerRadius(pvKWp, maxKWp) {
    return 5 + 17 * Math.sqrt(Math.max(0, pvKWp) / Math.max(1, maxKWp));
  }

  function siteTip(r) {
    const site = siteById.get(r.siteId);
    return `${site?.name || r.siteId}: ${r.plants} plant${r.plants === 1 ? '' : 's'}, ${fmtNum(r.pvKWp / 1e6)} GWp PV, ${fmtUsd(r.capex)} capex`;
  }

  function renderMap(rollup) {
    lastRollup = rollup;
    const box = $('plantsMap');
    const note = $('mapNote');
    const builtIds = new Set(rollup.map(r => r.siteId));
    box.setAttribute('aria-label', rollup.length
      ? `Map of ${rollup.length} sites with plants. ` + rollup.map(siteTip).join('; ')
      : 'Map of candidate sites; no plants built.');
    if (leafletState === 'ready' && globalThis.L?.map) {
      drawLeaflet(box, rollup, builtIds);
      note.textContent = 'Circle area ∝ PV capacity. Hollow dots are candidate sites with no plants. Tiles © OpenStreetMap.';
      return;
    }
    drawSvgMap(box, rollup, builtIds);
    note.textContent = leafletState === 'loading'
      ? 'Loading the interactive map… Circle area ∝ PV capacity.'
      : 'Offline map (country outlines from the land-price layer). Circle area ∝ PV capacity; hollow dots are unused candidate sites.';
    if (leafletState === 'idle') ensureLeaflet().then(ok => { if (ok) { box.replaceChildren(); renderMap(lastRollup); } else renderMap(lastRollup); });
  }

  function drawLeaflet(box, rollup, builtIds) {
    const L = globalThis.L;
    if (!leafletMap) {
      box.replaceChildren();
      box.classList.add('is-leaflet');
      leafletMap = L.map(box, { worldCopyJump: true, scrollWheelZoom: false, attributionControl: true }).setView([20, 20], 2);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 10, attribution: '&copy; OpenStreetMap' }).addTo(leafletMap);
    }
    if (leafletLayer) leafletLayer.remove();
    leafletLayer = L.layerGroup().addTo(leafletMap);
    const maxKWp = Math.max(1, ...rollup.map(r => r.pvKWp));
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e8a317';
    for (const site of SITES) {
      if (builtIds.has(site.id)) continue;
      L.circleMarker([site.latitude, site.longitude], { radius: 3, color: '#5b6b7e', weight: 1.5, fillOpacity: 0 })
        .bindTooltip(`${site.name}: candidate, no plants`).addTo(leafletLayer);
    }
    for (const r of rollup) {
      const site = siteById.get(r.siteId);
      if (!site) continue;
      L.circleMarker([site.latitude, site.longitude], { radius: markerRadius(r.pvKWp, maxKWp), color: '#10161e', weight: 2, fillColor: accent, fillOpacity: 0.85 })
        .bindTooltip(siteTip(r)).addTo(leafletLayer);
    }
    setTimeout(() => leafletMap.invalidateSize(), 0);
  }

  let worldPathCache = null;
  function worldPath(project) {
    if (worldPathCache) return worldPathCache;
    const gj = globalThis.LAND_ADMIN_GEOJSON;
    let d = '';
    const ring = coords => {
      coords.forEach(([lon, lat], i) => {
        const [x, y] = project(lat, lon);
        d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
      });
      d += 'Z';
    };
    for (const f of gj?.features || []) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'Polygon') g.coordinates.forEach(ring);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(poly => poly.forEach(ring));
    }
    worldPathCache = d;
    return d;
  }

  function drawSvgMap(box, rollup, builtIds) {
    box.classList.remove('is-leaflet');
    const W = 720;
    const H = 330;
    const latTop = 72;
    const latBottom = -58;
    const project = (lat, lon) => [((lon + 180) / 360) * W, ((latTop - lat) / (latTop - latBottom)) * H];
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'map-svg', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    root.append(svg('rect', { x: 0, y: 0, width: W, height: H, class: 'map-sea' }));
    const d = worldPath(project);
    if (d) root.append(svg('path', { d, class: 'map-land' }));
    for (let lat = -40; lat <= 60; lat += 20) {
      const y = project(lat, 0)[1];
      root.append(svg('line', { x1: 0, x2: W, y1: y, y2: y, class: 'map-graticule' }));
    }
    for (const site of SITES) {
      if (builtIds.has(site.id)) continue;
      const [x, y] = project(site.latitude, site.longitude);
      const c = svg('circle', { cx: x, cy: y, r: 2.5, class: 'map-candidate' });
      const t = svg('title'); t.textContent = `${site.name}: candidate, no plants`;
      c.append(t);
      root.append(c);
    }
    const maxKWp = Math.max(1, ...rollup.map(r => r.pvKWp));
    for (const r of [...rollup].sort((a, b) => b.pvKWp - a.pvKWp)) {
      const site = siteById.get(r.siteId);
      if (!site) continue;
      const [x, y] = project(site.latitude, site.longitude);
      const c = svg('circle', { cx: x, cy: y, r: markerRadius(r.pvKWp, maxKWp) * 0.8, class: 'map-site' });
      const t = svg('title'); t.textContent = siteTip(r);
      c.append(t);
      root.append(c);
    }
    box.replaceChildren(root);
  }

  function renderBuildLog(result) {
    const select = $('buildYear');
    const prev = select.value;
    const years = result.timeline.filter(r => r.built.length).map(r => r.year);
    select.replaceChildren(el('option', { value: '', text: 'All years' }), ...years.map(y => el('option', { value: String(y), text: String(y) })));
    select.value = years.map(String).includes(prev) ? prev : '';
    const draw = () => {
      const year = select.value ? Number(select.value) : null;
      const rows = [];
      for (const r of result.timeline) {
        if (year != null && r.year !== year) continue;
        for (const b of r.built) rows.push({ year: r.year, ...b });
      }
      const table = $('buildLog');
      table.replaceChildren();
      table.append(el('thead', {}, el('tr', {}, [
        ['Year', ''], ['Pathway', ''], ['Site', ''], ['Size', 'num'], ['Capex', 'num'], ['NPV at build', 'num'], ['LCOP / price', 'num'],
      ].map(([t, c]) => el('th', { scope: 'col', class: c, text: t })))));
      const tb = el('tbody');
      if (!rows.length) tb.append(el('tr', {}, el('td', { colspan: 7, class: 'empty', text: 'Nothing built — check the feedstock filter and the hurdle settings.' })));
      for (const b of rows) {
        const p = pathwayById.get(b.pathwayId);
        tb.append(el('tr', {}, [
          el('td', { text: String(b.year) }),
          el('td', {}, [el('span', { class: 'cell-main', text: productName(b.product) }), el('span', { class: 'cell-sub', text: p?.id || b.pathwayId })]),
          el('td', { text: siteById.get(b.siteId)?.name || b.siteId }),
          el('td', { class: 'num', text: fmtNum(b.sizeKgPerDay / 1000) + ' t/d' }),
          el('td', { class: 'num', text: fmtUsd(b.capexUsd) }),
          el('td', { class: 'num', text: fmtUsd(b.npvUsd) }),
          el('td', { class: 'num', text: `${fmtUsdKg(b.lcopUsdPerKg)} / ${fmtUsdKg(b.priceUsdPerKg)}` }),
        ]));
      }
      table.append(tb);
    };
    select.onchange = draw;
    draw();
  }

  // ---------------------------------------------------------------------------
  // Opportunity ranking

  const RANK_COLUMNS = [
    { key: 'name', label: 'Pathway', type: 'text', get: r => r.name },
    { key: 'product', label: 'Product', type: 'text', get: r => productName(r.product) },
    { key: 'site', label: 'Best site', type: 'text', get: r => siteById.get(r.siteId)?.name || r.siteId },
    { key: 'lcop', label: 'LCOP $/kg', type: 'num', get: r => r.lcopUsdPerKg },
    { key: 'price', label: 'Price $/kg', type: 'num', get: r => r.priceUsdPerKg },
    { key: 'margin', label: 'Margin', type: 'num', get: r => (r.priceUsdPerKg > 0 ? r.marginUsdPerKg / r.priceUsdPerKg : -Infinity) },
    { key: 'pi', label: 'PI', type: 'num', get: r => r.profitabilityIndex },
    { key: 'inf', label: 'Infinite share', type: 'num', get: r => r.infiniteSourceShare },
    { key: 'demand', label: 'World demand', type: 'num', get: r => r.worldDemandT },
    { key: 'quality', label: 'Data', type: 'text', get: r => MARKETS[r.product]?.quality || 'none' },
  ];
  let rankSort = { key: 'margin', dir: -1 };
  let rankRows = [];

  function renderRanking(rows, scenario) {
    rankRows = rows;
    const allowed = new Set(allowedPathwayIds(scenario));
    const col = RANK_COLUMNS.find(c => c.key === rankSort.key) || RANK_COLUMNS[5];
    const sorted = [...rows].sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      if (col.type === 'text') return rankSort.dir * String(va).localeCompare(String(vb));
      const na = Number.isFinite(va) ? va : -Infinity;
      const nb = Number.isFinite(vb) ? vb : -Infinity;
      return rankSort.dir * (na - nb);
    });
    const table = $('rankingTable');
    table.replaceChildren();
    const head = el('tr');
    for (const c of RANK_COLUMNS) {
      const active = c.key === rankSort.key;
      const btn = el('button', { type: 'button', class: 'sort-btn', text: c.label + (active ? (rankSort.dir > 0 ? ' ▲' : ' ▼') : '') });
      btn.addEventListener('click', () => {
        rankSort = { key: c.key, dir: active ? -rankSort.dir : (c.type === 'text' ? 1 : -1) };
        renderRanking(rankRows, currentScenario);
      });
      head.append(el('th', { scope: 'col', class: c.type === 'num' ? 'num' : '', 'aria-sort': active ? (rankSort.dir > 0 ? 'ascending' : 'descending') : 'none' }, btn));
    }
    table.append(el('thead', {}, head));
    const tb = el('tbody');
    for (const r of sorted) {
      const p = pathwayById.get(r.pathwayId);
      const m = MARKETS[r.product];
      const marginFrac = r.priceUsdPerKg > 0 ? r.marginUsdPerKg / r.priceUsdPerKg : NaN;
      const nameCell = el('th', { scope: 'row' }, [
        el('span', { class: 'cell-main', text: r.name }),
        el('span', { class: 'cell-sub' }, [el('code', { text: p?.case?.file || '' }), allowed.has(r.pathwayId) ? null : el('span', { class: 'tag', text: 'excluded' })]),
      ]);
      const quality = m?.quality || 'no market row';
      tb.append(el('tr', { class: allowed.has(r.pathwayId) ? '' : 'is-excluded' }, [
        nameCell,
        el('td', { text: productName(r.product) }),
        el('td', { text: siteById.get(r.siteId)?.name || r.siteId }),
        el('td', { class: 'num', text: fmtUsdKg(r.lcopUsdPerKg) }),
        el('td', { class: 'num', text: fmtUsdKg(r.priceUsdPerKg) }),
        el('td', { class: 'num ' + (marginFrac >= 0 ? 'is-pos' : 'is-neg'), text: Number.isFinite(marginFrac) ? (marginFrac >= 0 ? '+' : '−') + fmtPct(Math.abs(marginFrac), 0) : '—' }),
        el('td', { class: 'num', text: Number.isFinite(r.profitabilityIndex) ? r.profitabilityIndex.toFixed(2) : '—' }),
        el('td', { class: 'num', text: fmtPct(r.infiniteSourceShare, 0) }),
        el('td', { class: 'num', text: Number.isFinite(r.worldDemandT) ? fmtTonnes(r.worldDemandT) + '/yr' : '—' }),
        el('td', {}, el('span', { class: 'quality quality-' + (m?.quality || 'none'), text: quality + (p?.quality && p.quality !== quality ? ` · recipe ${p.quality}` : '') })),
      ]));
    }
    table.append(tb);
  }

  // ---------------------------------------------------------------------------
  // Caveats

  function renderCaveats(result) {
    const productsMade = new Set(result.summary.productsMade.map(p => Company.marketGroupOf(p, result.config)));
    const all = Object.entries(MARKETS);
    const cited = all.filter(([, m]) => m.quality === 'cited').length;
    const screeningMade = [...productsMade].filter(p => MARKETS[p] && MARKETS[p].quality !== 'cited');
    const cfg = result.config;
    const items = [
      'Screening model, not a bankable forecast: constant real prices and costs over each plant’s life, no tax, no inflation, no financing fees beyond a flat debt rate.',
      'Energy is daily-average solar (frozen PVGIS yields per site) with no seasonal storage, as in the source flowsheet cases. Curtailment, intermittency and grid backup are not modelled.',
      'Each pathway is a per-kg recipe reduced from one flowsheet case at one reference site; brine recipes only move to sites with the same brine assay.',
      'Purchased intermediates stay purchased — the company never vertically integrates its own feeds. Use “Infinite sources only” to drop those pathways.',
      `Prices fall linearly with the company’s share of the world market (elasticity per market) and growth is capped at ${fmtPct(cfg.build.maxMarketShare)} of each market.`,
      `Costs fall by an exogenous yearly decline plus Wright’s-law learning on the company’s own deployment; process capex scales with size^${cfg.scale.exponent} (floor ${cfg.scale.floorFactor}×). PV ${fmtUsd(cfg.pv.capexUsdPerKWp)}/kWp falling ${fmtPct(cfg.pv.exogenousDeclinePerYear)}/yr to ${fmtUsd(cfg.pv.floorUsdPerKWp)}.`,
      `Land price from the repo’s agricultural land layer where a site falls inside a priced region, else ${fmtUsd(cfg.defaultLandUsdPerHa)}/ha. Water, permits, logistics and offtake contracts are not costed.`,
      `Market data: ${cited} of ${all.length} world-market rows cite a named source and year; the rest are screening estimates.${screeningMade.length ? ` This run sells into screening-quality markets: ${screeningMade.map(productName).join(', ')}.` : ''} Price elasticities are always screening.`,
      'Equity multiples are large because every profitable plant is reinvested into the next with 50% debt and no dilution or dividends — read them as “the recipe compounds”, not as a valuation.',
    ];
    $('caveatsBody').replaceChildren(el('ul', {}, items.map(text => el('li', { text }))));
  }

  // ---------------------------------------------------------------------------
  // Controls

  let currentScenario = defaultScenario();

  function buildControls() {
    for (const f of FIELDS) {
      const input = el('input', { type: 'number', id: 'f-' + f.key, name: f.key, min: f.min, max: f.max, step: f.step, inputmode: 'decimal' });
      const label = el('label', { for: 'f-' + f.key, class: 'field' }, [
        el('span', { class: 'field-label' }, [el('span', { text: f.label }), f.unit ? el('small', { text: f.unit }) : null]),
        input,
        el('span', { class: 'field-default', text: `default ${f.def}` }),
      ]);
      $(f.group).append(label);
    }
    const originList = $('originList');
    for (const o of ORIGINS) {
      originList.append(el('label', { class: 'chip-check' }, [el('input', { type: 'checkbox', 'data-origin': o.id }), el('span', { text: o.label })]));
    }
    const list = $('pathwayList');
    for (const p of [...PATHWAYS].sort((a, b) => productName(a.product).localeCompare(productName(b.product)))) {
      const origins = [...new Set((p.feeds || []).map(f => f.origin))].join(' · ');
      list.append(el('label', { class: 'pathway-item' }, [
        el('input', { type: 'checkbox', 'data-pathway': p.id }),
        el('span', {}, [el('span', { class: 'cell-main', text: productName(p.product) }), el('span', { class: 'cell-sub', text: `${p.id} · ${origins}` })]),
      ]));
    }

    const form = $('assumptionsForm');
    form.addEventListener('input', onFormChange);
    form.addEventListener('change', onFormChange);
    form.addEventListener('submit', ev => ev.preventDefault());
    $('pathwaysAll').addEventListener('click', () => { currentScenario.off = []; syncControls(); schedule(); });
    $('pathwaysNone').addEventListener('click', () => { currentScenario.off = PATHWAYS.map(p => p.id); syncControls(); schedule(); });
    $('resetScenario').addEventListener('click', () => { currentScenario = defaultScenario(); syncControls(); schedule(0); });
    $('copyLink').addEventListener('click', async () => {
      const btn = $('copyLink');
      try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; } catch { btn.textContent = 'Copy from address bar'; }
      setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
    });
    $('rankSize').addEventListener('change', ev => { currentScenario.size = ev.target.value; writeHash(); runRanking(); });
    $('moneyLog').addEventListener('change', () => { if (lastResult) renderCharts(lastResult, currentScenario); });
  }

  function syncControls() {
    const s = currentScenario;
    for (const f of FIELDS) $('f-' + f.key).value = String(s[f.key]);
    for (const box of document.querySelectorAll('[data-origin]')) box.checked = s.origins.includes(box.dataset.origin);
    $('infiniteOnly').checked = s.infinite;
    const off = new Set(s.off);
    for (const box of document.querySelectorAll('[data-pathway]')) {
      const p = pathwayById.get(box.dataset.pathway);
      box.checked = !off.has(p.id);
      const blocked = !pathwayAllowedByFeeds(p, s);
      box.closest('.pathway-item').classList.toggle('is-blocked', blocked);
      box.closest('.pathway-item').title = blocked ? 'Excluded by the feedstock filter' : '';
    }
    $('pathwayCount').textContent = `(${allowedPathwayIds(s).length} of ${PATHWAYS.length} in play)`;
    $('rankSize').value = s.size;
  }

  function onFormChange(ev) {
    const t = ev.target;
    const s = currentScenario;
    if (t.matches('[data-origin]')) {
      const set = new Set(s.origins);
      if (t.checked) set.add(t.dataset.origin); else set.delete(t.dataset.origin);
      s.origins = ORIGINS.map(o => o.id).filter(id => set.has(id));
    } else if (t.id === 'infiniteOnly') {
      s.infinite = t.checked;
    } else if (t.matches('[data-pathway]')) {
      const off = new Set(s.off);
      if (t.checked) off.delete(t.dataset.pathway); else off.add(t.dataset.pathway);
      s.off = PATHWAYS.map(p => p.id).filter(id => off.has(id));
    } else if (FIELD_BY_KEY[t.name]) {
      const f = FIELD_BY_KEY[t.name];
      const v = Number(t.value);
      if (t.value === '' || !Number.isFinite(v)) return; // mid-typing
      const clamped = clamp(v, f.min, f.max);
      t.classList.toggle('is-clamped', clamped !== v);
      if (s[f.key] === clamped) return;
      s[f.key] = clamped;
    } else {
      return;
    }
    if (!t.matches('[type="number"]')) syncControls();
    else $('pathwayCount').textContent = `(${allowedPathwayIds(s).length} of ${PATHWAYS.length} in play)`;
    schedule();
  }

  function writeHash() {
    const hash = scenarioToHash(currentScenario);
    const url = location.pathname + location.search + (hash ? '#' + hash : '');
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  }

  // ---------------------------------------------------------------------------
  // Run loop

  let lastResult = null;
  let timer = null;
  let runSeq = 0;

  function setStatus(text, cls) {
    const chip = $('runStatus');
    chip.textContent = text;
    chip.className = 'status-chip ' + (cls || 'idle');
  }

  function schedule(delay = 250) {
    writeHash();
    clearTimeout(timer);
    document.body.classList.add('is-simulating');
    setStatus('Simulating…', 'warn');
    timer = setTimeout(() => {
      // Let the "simulating" state paint before the synchronous run.
      requestAnimationFrame(() => setTimeout(run, 0));
    }, delay);
  }

  function run() {
    const seq = ++runSeq;
    const s = currentScenario;
    const t0 = performance.now();
    let result;
    try {
      result = Company.simulateCompany({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config: scenarioToConfig(s) });
    } catch (err) {
      setStatus('Simulation failed', 'warn');
      document.body.classList.remove('is-simulating');
      $('dataWarning').hidden = false;
      $('dataWarning').textContent = 'The simulation threw an error: ' + (err?.message || err);
      return;
    }
    const ms = performance.now() - t0;
    if (seq !== runSeq) return;
    lastResult = result;
    renderKpis(result);
    renderCharts(result, s);
    const rollup = siteRollup(result);
    $('plantsSub').textContent = result.plants.length
      ? `${result.plants.length} plants at ${rollup.length} of ${SITES.length} candidate sites · ${fmtNum(result.summary.finalPvGWp)} GWp of solar`
      : `No plants built from ${SITES.length} candidate sites.`;
    renderSiteTable(rollup);
    renderMap(rollup);
    renderBuildLog(result);
    runRanking();
    renderCaveats(result);
    document.body.classList.remove('is-simulating');
    setStatus(`Simulated ${result.timeline.length} years in ${Math.round(ms)} ms`, 'good');
    const count = Number(document.body.dataset.runCount || 0) + 1;
    document.body.dataset.runCount = String(count);
    globalThis.__companyLast = { count, summary: result.summary, ms };
  }

  function runRanking() {
    const s = currentScenario;
    const rows = Company.rankOpportunities(
      { pathways: PATHWAYS, markets: MARKETS, sites: SITES, config: scenarioToConfig(s, { forRanking: true }) },
      { sizeMultiple: Number(s.size), yearIndex: 0 },
    );
    renderRanking(rows, s);
  }

  // ---------------------------------------------------------------------------
  // Theme + resize + boot

  function initTheme() {
    const btn = $('themeToggle');
    let theme = 'dark';
    try { theme = localStorage.getItem('foundry-company-theme') || 'dark'; } catch { /* storage blocked */ }
    const apply = () => {
      document.documentElement.dataset.theme = theme;
      btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
      btn.setAttribute('aria-pressed', String(theme === 'light'));
      btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
    };
    btn.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('foundry-company-theme', theme); } catch { /* ignore */ }
      apply();
      if (lastResult) renderMap(lastRollup);
    });
    apply();
  }

  function initResize() {
    let raf = 0;
    let lastWidth = window.innerWidth;
    const redraw = () => {
      for (const [container, spec] of chartRegistry) if (container.isConnected) drawChart(container, spec);
      if (leafletMap) leafletMap.invalidateSize();
    };
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(redraw);
    });
  }

  async function boot() {
    initTheme();
    buildControls();
    currentScenario = scenarioFromHash(location.hash);
    if (window.matchMedia('(max-width: 900px)').matches) $('assumptionsDetails').open = false;
    syncControls();
    initResize();
    window.addEventListener('hashchange', () => {
      if (location.hash.replace(/^#/, '') === scenarioToHash(currentScenario)) return;
      currentScenario = scenarioFromHash(location.hash);
      syncControls();
      schedule(0);
    });
    setStatus('Loading solar data…', 'warn');
    await loadSites();
    if (!SITES.length) {
      $('dataWarning').hidden = false;
      $('dataWarning').textContent = location.protocol === 'file:'
        ? 'Solar yields could not be loaded from file://. Serve the folder (npm run dev) and open http://localhost:4173/company.html.'
        : 'Solar yields for the candidate sites could not be loaded, so no plant can be placed.';
    }
    schedule(0);
  }

  // Exposed for tests / console.
  globalThis.FoundryCompanyApp = { scenarioToHash, scenarioFromHash, scenarioToConfig, defaultScenario, allowedPathwayIds };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
