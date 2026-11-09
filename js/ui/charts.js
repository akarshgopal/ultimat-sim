// Charts shared by every view: line / stacked area / area over a year axis, legends,
// data-table fallbacks, sticky categorical color slots. Inline SVG, no dependencies.
// Exposes globalThis.Charts. Uses globalThis.UI (js/ui/kit.js).
(() => {
  'use strict';
  const { el, svg, clamp, num, legend } = globalThis.UI;

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

  // spec: { x: [], series: [{ key, label, color, values[], dash?, fmt? }], kind: 'line'|'stack'|'area',
  //         log?, yMin?, yFormat?, refLines?: [{ y, label }], xMarks?: [{ index, label }], endLabels?, ariaLabel }
  function drawChart(container, spec) {
    chartRegistry.set(container, spec);
    container.replaceChildren();
    const width = Math.max(260, Math.floor(container.clientWidth || 600));
    const height = width < 480 ? 200 : 240;
    const fmt = spec.yFormat || num;
    const n = spec.x.length;
    if (!n || !spec.series.length) {
      container.append(el('p', { class: 'chart-empty', text: 'Nothing built in this scenario.' }));
      return;
    }

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
    let yMax = -Infinity;
    let yMin = spec.yMin ?? (spec.log ? Infinity : 0);
    for (const l of layers) {
      for (let i = 0; i < n; i += 1) {
        const v = l.hi[i];
        if (!Number.isFinite(v)) continue;
        if (spec.log && !(v > 0)) continue;
        yMax = Math.max(yMax, v);
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
      const step = niceStep(yMax - yMin, 4);
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
    // Vertical event markers at x indices: xMarks: [{ index, label }].
    (spec.xMarks || []).forEach((m, k) => {
      if (!(m.index >= 0 && m.index < n)) return;
      const x = xs(m.index);
      marks.append(svg('line', { class: 'chart-ref chart-xmark', x1: x, x2: x, y1: pad.top, y2: pad.top + ih }));
      const t = svg('text', { class: 'chart-ref-label', x: x + 4, y: pad.top + 10 + k * 13, 'text-anchor': x > pad.left + iw * 0.7 ? 'end' : 'start' });
      if (x > pad.left + iw * 0.7) t.setAttribute('x', x - 4);
      t.textContent = m.label;
      marks.append(t);
    });
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

  // Year-by-series data table, built the first time it is opened.
  function dataTable(spec) {
    const fmt = spec.yFormat || num;
    const body = el('div', { class: 'chart-table' });
    const details = el('details', { class: 'chart-data' }, [el('summary', { text: 'Data table' }), body]);
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      const table = el('table', { class: 'data-table compact' }, [
        el('thead', {}, el('tr', {}, [el('th', { text: 'Year', scope: 'col' }), ...spec.series.map(s => el('th', { text: s.label, scope: 'col' }))])),
        el('tbody', {}, spec.x.map((year, i) => el('tr', {}, [el('th', { text: String(year), scope: 'row' }), ...spec.series.map(s => el('td', { text: (s.fmt || fmt)(s.values[i]) }))]))),
      ]);
      body.replaceChildren(el('div', { class: 'table-scroll' }, table));
    });
    return details;
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

  // A full chart: legend (two or more series), the chart sized to its container, and a data table.
  function chartBlock(spec) {
    const key = spec.series.length > 1
      ? legend(spec.series.map(s => ({ label: s.label, color: s.color, line: spec.kind !== 'stack' })))
      : el('div', { class: 'chart-legend' });
    const body = el('div', { class: 'chart-body' });
    requestAnimationFrame(() => drawChart(body, spec)); // after insertion, so the width is known
    return el('div', { class: 'chart-block' }, [key, body, dataTable(spec)]);
  }

  globalThis.Charts = Object.freeze({ chartBlock, niceStep, assignSlots, slotColor, productSlot });
})();
