// Charts shared by every view: line / stacked area / area over a year axis, legends,
// data-table fallbacks, sticky categorical color slots. Inline SVG, no dependencies.
// Exposes globalThis.Charts. Uses globalThis.UI (js/ui/kit.js).
(() => {
  'use strict';
  const { el, svg, clamp, num } = globalThis.UI;

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

  function tooltip() {
    let tip = document.getElementById('chartTooltip');
    if (!tip) {
      tip = el('div', { class: 'chart-tooltip', id: 'chartTooltip', role: 'status', hidden: true });
      document.body.append(tip);
    }
    return tip;
  }
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
    const fmt = spec.yFormat || num;
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

  // Re-render every live chart on resize (debounced).
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const [container, spec] of chartRegistry) {
        if (container.isConnected) drawChart(container, spec);
        else chartRegistry.delete(container);
      }
    }, 150);
  });

  // Convenience: a full chart block (legend + body + data table) as one element.
  function chartBlock(spec, opts = {}) {
    const legend = el('div', { class: 'chart-legend' });
    const body = el('div', { class: 'chart-body' });
    const details = el('details', { class: 'chart-data' }, [el('summary', { text: 'Data table' }), el('div', { class: 'chart-table' })]);
    const block = el('div', { class: 'chart-block' }, [legend, body, opts.table === false ? null : details]);
    requestAnimationFrame(() => {
      renderLegend(legend, spec.series, spec.kind === 'stack' ? 'area' : 'line');
      drawChart(body, spec);
      if (opts.table !== false) renderTable(details, spec.x, spec.series, spec.yFormat || num);
    });
    return block;
  }

  globalThis.Charts = Object.freeze({ drawChart, renderLegend, renderTable, chartBlock, assignSlots, slotColor, productSlot });
})();
