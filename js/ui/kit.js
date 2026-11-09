// UI kit shared by every view: DOM helpers, number formatting, names, sortable tables.
// Exposes globalThis.UI. No dependencies.
(() => {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MARKETS = () => globalThis.FoundryMarkets?.MARKETS || {};

  // ---------------------------------------------------------------- DOM
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const child of [].concat(children)) {
      if (child == null || child === false) continue;
      node.append(child instanceof Node ? child : String(child));
    }
    return node;
  }
  function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, String(v));
    return node;
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------------------------------------------------------------- numbers
  function trim(v, digits) {
    const a = Math.abs(v);
    const d = a >= 100 ? 0 : a >= 10 ? Math.max(0, digits - 2) : a >= 1 ? Math.max(0, digits - 1) : digits;
    return Number(v.toFixed(Math.min(6, d))).toLocaleString('en-US', { maximumFractionDigits: Math.min(6, d) });
  }
  function num(v, digits = 3) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1e12) return trim(v / 1e12, digits) + 'T';
    if (a >= 1e9) return trim(v / 1e9, digits) + 'B';
    if (a >= 1e6) return trim(v / 1e6, digits) + 'M';
    if (a >= 1e4) return trim(v / 1e3, digits) + 'k';
    return trim(v, digits);
  }
  const usd = (v, digits = 3) => (Number.isFinite(v) ? (v < 0 ? '−$' : '$') + num(Math.abs(v), digits) : '—');
  function usdKg(v) {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    const s = a >= 100 ? a.toFixed(0) : a >= 1 ? a.toFixed(2) : a.toFixed(3);
    return (v < 0 ? '−$' : '$') + s;
  }
  function pct(v, digits = 1) {
    if (!Number.isFinite(v)) return '—';
    const p = v * 100;
    const a = Math.abs(p);
    return (a > 0 && a < 0.1 ? p.toFixed(3) : a < 1 ? p.toFixed(2) : p.toFixed(digits)) + '%';
  }
  const tonnes = t => (Number.isFinite(t) ? num(t) + ' t' : '—');

  // ---------------------------------------------------------------- names
  const SHORT = { hydrogen: 'H₂', ammonia: 'NH₃', methanol: 'Methanol', 'float-glass': 'Glass', oxygen: 'O₂' };
  const ORIGINS = Object.freeze([
    { id: 'ocean', label: 'Ocean' },
    { id: 'brine', label: 'Brine' },
    { id: 'air', label: 'Air' },
    { id: 'crust', label: 'Crustal rock' },
    { id: 'water', label: 'Fresh water' },
    { id: 'consumable', label: 'Consumables (sorbent, catalyst)' },
    { id: 'intermediate', label: 'Bought intermediates' },
  ]);
  const productName = key => MARKETS()[key]?.name || key || '—';
  const shortName = key => SHORT[key] || productName(key);
  const originLabel = id => ORIGINS.find(o => o.id === id)?.label || id;
  const originDot = id => el('span', { class: 'origin-dot', 'data-origin': id, title: originLabel(id) });
  function qualityTag(quality) {
    if (!quality) return null;
    return el('span', { class: 'tag ' + (quality === 'cited' ? 'is-cited' : 'is-screening'), text: quality });
  }
  // "makes H₂ in-house ($1.62 vs $2.08 bought)"
  function inHouseText(integration) {
    if (!integration?.length) return '';
    return 'makes ' + integration.map(i => `${shortName(i.product)} in-house (${usdKg(i.makeUsdPerKg)} vs ${usdKg(i.buyUsdPerKg)} bought)`).join(', ');
  }

  // ---------------------------------------------------------------- tables
  // columns: [{ key, label, num?: bool, get: row → sortable value, render?: row → Node|string, title? }]
  // opts: { sortKey, sortDir: 'asc'|'desc', rowHref?: row → '#/…', rowClass?: row → string, compact? }
  function sortableTable(columns, rows, opts = {}) {
    let sortKey = opts.sortKey || null;
    let sortDir = opts.sortDir || 'desc';
    const table = el('table', { class: 'data-table' + (opts.compact ? ' compact' : '') });
    const thead = el('thead');
    const tbody = el('tbody');
    table.append(thead, tbody);
    const draw = () => {
      const head = el('tr');
      for (const c of columns) {
        const th = el('th', { scope: 'col', class: c.num ? 'num' : '', 'data-sort': c.get ? c.key : null, title: c.title || null, text: c.label });
        if (c.key === sortKey) th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
        if (c.get) {
          th.addEventListener('click', () => {
            if (sortKey === c.key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            else { sortKey = c.key; sortDir = c.num ? 'desc' : 'asc'; }
            draw();
          });
        }
        head.append(th);
      }
      thead.replaceChildren(head);
      const col = columns.find(c => c.key === sortKey);
      const sorted = rows.slice();
      if (col?.get) {
        const dir = sortDir === 'asc' ? 1 : -1;
        sorted.sort((a, b) => {
          const va = col.get(a);
          const vb = col.get(b);
          if (typeof va === 'number' || typeof vb === 'number') {
            const na = Number.isFinite(va) ? va : -Infinity;
            const nb = Number.isFinite(vb) ? vb : -Infinity;
            return (na - nb) * dir;
          }
          return String(va ?? '').localeCompare(String(vb ?? '')) * dir;
        });
      }
      tbody.replaceChildren(...sorted.map(row => {
        const href = opts.rowHref?.(row);
        const tr = el('tr', { class: opts.rowClass?.(row) || null, 'data-href': href || null });
        if (href) tr.addEventListener('click', ev => { if (!ev.target.closest('a,button,input')) location.hash = href; });
        for (const c of columns) {
          const content = c.render ? c.render(row) : (c.get ? c.get(row) : '');
          tr.append(el('td', { class: c.num ? 'num' : '' }, content));
        }
        return tr;
      }));
    };
    draw();
    return el('div', { class: 'table-scroll' }, table);
  }

  function kpi(label, value, sub) {
    return el('div', { class: 'kpi' }, [
      el('div', { class: 'kpi-label', text: label }),
      el('div', { class: 'kpi-value', text: value }),
      sub ? el('div', { class: 'kpi-sub', text: sub }) : null,
    ]);
  }

  // items: [{ label, color, title?, line? }]; line draws a thin swatch for line series.
  function legend(items) {
    return el('div', { class: 'chart-legend' }, items.map(it => {
      const swatch = el('span', { class: 'legend-swatch' + (it.line ? ' is-line' : '') });
      swatch.style.setProperty('--swatch', it.color);
      return el('span', { class: 'legend-item', title: it.title || null }, [swatch, el('span', { text: it.label })]);
    }));
  }

  // A value with a small bar under it; frac in [0, 1].
  function meter(text, frac, title) {
    return el('span', { class: 'meter-cell' }, [
      el('span', { text }),
      el('span', { class: 'meter', title }, el('span', { style: { width: (frac * 100).toFixed(1) + '%' } })),
    ]);
  }

  function card(title, subtitle, body, extraHead) {
    return el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [el('h2', { text: title }), subtitle ? el('p', { text: subtitle }) : null]),
        extraHead || null,
      ]),
      ...[].concat(body),
    ]);
  }

  globalThis.UI = Object.freeze({
    el, svg, clamp,
    num, usd, usdKg, pct, tonnes,
    ORIGINS, productName, shortName, originLabel, originDot, qualityTag, inHouseText,
    sortableTable, kpi, legend, meter, card,
  });
})();
