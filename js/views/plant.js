// Plant design view (#/plant/<pathway>/<site>/<size multiple>): one recipe at one site and size as
// a P&ID-style drawing with equipment list, stream table and control loops, and its techno-economic
// analysis (capex by item, operating account, cost per kg by driver, cash flow, sensitivity, scale).
// Everything comes from engine/plant-design.js, which itemizes the simulator's own plant evaluation.
(() => {
  'use strict';
  const Company = globalThis.FoundryCompany;
  const PlantDesign = globalThis.FoundryPlantDesign;

  const DEFAULT_PATHWAY = 'green-ammonia';

  function simInput(Store) {
    return { pathways: Store.PATHWAYS, markets: Store.MARKETS, sites: Store.SITES, config: Store.toConfig(Store.scenario) };
  }
  function planHref(Store, pathwayId, siteId, multiple, year) {
    const q = Store.urlQuery();
    // Positional segments; a skipped one before a given one is '_' (the view's default).
    const segs = [pathwayId, siteId, multiple, year];
    while (segs.length && (segs[segs.length - 1] == null || segs[segs.length - 1] === '')) segs.pop();
    return '#/plant/' + segs.map(v => (v == null || v === '' ? '_' : v)).map(v => encodeURIComponent(String(v))).join('/') + (q ? '?' + q : '');
  }
  const MODE_LABEL = {
    'sun-following': 'sun-following',
    steady: 'steady, firmed',
    firmed: 'firmed 24 h',
  };
  function modeText(e) {
    if (e.mode === 'sun-following') return 'sun-following';
    return `${MODE_LABEL[e.mode]} by ${e.storeKind}, ≥${Math.round(e.minTurndown * 100)}% load`;
  }
  const sub = s => String(s).replace(/(\d+)/g, d => d.split('').map(c => '₀₁₂₃₄₅₆₇₈₉'[c]).join(''));

  // ------------------------------------------------------------------ P&ID layout
  const G = {
    colW: 172, gapMin: 78, laneGap: 9, padX: 18, topBand: 112, padBottom: 30,
    equipH: 162, connH: 44, tankH: 120, packH: 96, dummyH: 16, rowGap: 22,
    symW: 64, symH: 52, bubbleR: 12, fitStep: 44, fitHalf: 30, titleH: 66, tbW: 320,
  };

  function buildGraph(pathway, pkg) {
    const fs = pathway.flowsheet;
    const byId = new Map(fs.nodes.map(n => [n.id, n]));
    const equipByNode = new Map(pkg.equipment.map(e => [e.nodeId, e]));
    const captiveByFeed = new Map(pkg.captive.filter(c => c.nodeId).map(c => [c.nodeId, c]));
    const nodes = new Map();
    const add = n => { nodes.set(n.id, n); return n; };
    for (const n of fs.nodes) {
      if (n.kind === 'electricity' || n.kind === 'bus' || n.kind === 'heat') continue;
      if (n.kind === 'converter') add({ id: n.id, kind: 'equip', equip: equipByNode.get(n.id), label: n.label });
      else if (n.kind === 'source') {
        const c = captiveByFeed.get(n.id);
        add(c ? { id: n.id, kind: 'package', captive: c, label: n.label } : { id: n.id, kind: 'source', label: n.label });
      } else if (n.kind === 'sink') add({ id: n.id, kind: 'sink', label: n.label, disposition: n.disposition });
    }
    for (const b of pkg.buffers) if (!b.captive) add({ id: b.tag, kind: 'tank', buffer: b, label: `${b.substance} buffer` });
    // Heat sources appear as connectors when they feed a unit.
    for (const s of pkg.streams) {
      for (const id of [s.from, s.to]) {
        if (!nodes.has(id) && byId.has(id)) add({ id, kind: s.from === id ? 'source' : 'sink', label: byId.get(id).label, heat: true });
      }
    }
    const edges = pkg.streams.filter(s => nodes.has(s.from) && nodes.has(s.to)).map(s => ({ from: s.from, to: s.to, stream: s }));
    return { nodes, edges };
  }

  function layoutGraph(graph) {
    const { nodes, edges } = graph;
    const ids = [...nodes.keys()];
    const out = new Map(ids.map(id => [id, []]));
    for (const e of edges) out.get(e.from).push(e);
    const state = new Map();
    const back = new Set();
    const visit = id => {
      state.set(id, 1);
      for (const e of out.get(id)) {
        const s = state.get(e.to);
        if (s === 1) back.add(e);
        else if (!s) visit(e.to);
      }
      state.set(id, 2);
    };
    for (const id of ids) if (nodes.get(id).kind === 'source' && !state.get(id)) visit(id);
    for (const id of ids) if (nodes.get(id).kind === 'package' && !state.get(id)) visit(id);
    for (const id of ids) if (!state.get(id)) visit(id);
    const dag = edges.filter(e => !back.has(e) && e.from !== e.to);

    const layer = new Map(ids.map(id => [id, 0]));
    for (let pass = 0; pass <= ids.length; pass += 1) {
      let changed = false;
      for (const e of dag) {
        if (layer.get(e.from) + 1 > layer.get(e.to)) { layer.set(e.to, layer.get(e.from) + 1); changed = true; }
      }
      if (!changed) break;
    }
    // Feeds hug their first consumer. The product leaves at the right edge; co-products and wastes
    // leave by an off-page connector right after the unit that makes them, as on a real sheet,
    // instead of running across the drawing.
    let maxLayer = 0;
    for (const id of ids) if (nodes.get(id).kind !== 'sink') maxLayer = Math.max(maxLayer, layer.get(id));
    for (const id of ids) {
      const n = nodes.get(id);
      if (n.kind === 'source' || n.kind === 'package') {
        const firsts = dag.filter(e => e.from === id).map(e => layer.get(e.to));
        layer.set(id, firsts.length ? Math.max(0, Math.min(...firsts) - 1) : 0);
      }
      if (n.kind === 'sink') {
        const froms = dag.filter(e => e.to === id).map(e => layer.get(e.from));
        layer.set(id, n.disposition === 'product' || !froms.length ? maxLayer + 1 : Math.max(...froms) + 1);
      }
    }
    const used = [...new Set(layer.values())].sort((a, b) => a - b);
    const remap = new Map(used.map((l, i) => [l, i]));
    for (const [id, l] of layer) layer.set(id, remap.get(l));
    const cols = used.length;

    // Dummy nodes carry edges across intermediate columns.
    const segs = []; // { from, to, edge, first, last }
    const dummies = new Map();
    for (const e of dag) {
      const a = layer.get(e.from);
      const b = layer.get(e.to);
      if (b <= a) { back.add(e); continue; }
      let prev = e.from;
      for (let l = a + 1; l < b; l += 1) {
        const id = `~${e.stream.no}~${l}`;
        dummies.set(id, { id, kind: 'dummy', edge: e });
        layer.set(id, l);
        segs.push({ from: prev, to: id, edge: e });
        prev = id;
      }
      segs.push({ from: prev, to: e.to, edge: e });
    }
    const all = new Map([...nodes, ...dummies]);
    const columns = Array.from({ length: cols }, () => []);
    for (const [id, n] of all) columns[layer.get(id)].push(n);
    const sinkRank = { product: 0, coproduct: 1, waste: 2 };
    columns[cols - 1].sort((a, b) => (sinkRank[a.disposition] ?? 3) - (sinkRank[b.disposition] ?? 3));
    const pos = new Map();
    const index = () => columns.forEach(col => col.forEach((n, i) => pos.set(n.id, i)));
    index();
    const nbrs = (id, dir) => segs.filter(s => (dir > 0 ? s.to === id : s.from === id)).map(s => (dir > 0 ? s.from : s.to));
    for (let sweep = 0; sweep < 6; sweep += 1) {
      const dir = sweep % 2 === 0 ? 1 : -1;
      const order = dir > 0 ? columns.slice(1) : columns.slice(0, -1).reverse();
      for (const col of order) {
        const bary = new Map(col.map(n => {
          const nb = nbrs(n.id, dir);
          return [n.id, nb.length ? nb.reduce((s, id) => s + pos.get(id), 0) / nb.length : pos.get(n.id)];
        }));
        col.sort((a, b) => bary.get(a.id) - bary.get(b.id));
        index();
      }
    }

    // Busy units get a taller symbol so their lines keep ≥ 12 px apart.
    const ports = new Map();
    const bump = (id, side) => { const p = ports.get(id) || { in: 0, out: 0 }; p[side] += 1; ports.set(id, p); };
    for (const sg of segs) { bump(sg.from, 'out'); bump(sg.to, 'in'); }
    for (const e of back) { bump(e.from, 'out'); bump(e.to, 'in'); }
    // A side whose lines carry in-line items (compressors, exchangers) spaces them 36 px apart so items on
    // neighbouring lines can share a position; otherwise 15 px.
    const carriesIn = new Set();
    const carriesOut = new Set();
    for (const sg of segs) {
      const st = sg.edge.stream;
      if (st.machine || st.feedExchanger) carriesIn.add(sg.to);
      if (st.productExchanger) carriesOut.add(sg.from);
    }
    const sideH = (n, side) => ((carriesIn.has(n.id) && side === 'in') || (carriesOut.has(n.id) && side === 'out') ? 36 : 15) * ((ports.get(n.id)?.[side] || 0) + 1) / 0.7;
    const symH = n => Math.max(G.symH, sideH(n, 'in'), sideH(n, 'out'));
    const heightOf = n => (n.kind === 'equip' ? G.equipH + symH(n) - G.symH : n.kind === 'tank' ? G.tankH : n.kind === 'package' ? G.packH : n.kind === 'dummy' ? G.dummyH : G.connH);
    const colHeight = col => col.reduce((s, n) => s + heightOf(n), 0) + Math.max(0, col.length - 1) * G.rowGap;
    const bodyH = Math.max(...columns.map(colHeight));

    // Gap widths from the number of vertical lanes each needs.
    const gapSegs = Array.from({ length: Math.max(0, cols - 1) }, () => []);
    for (const s of segs) gapSegs[layer.get(s.from)].push(s);
    // …and from the in-line items its lines carry (compressor/pump and feed exchanger before the next
    // unit, product exchanger after this one), so each sits on a straight run with its stream number.
    // A unit's fittings are staggered along its lines one after another, so a gap holds all the inlet
    // fittings of each unit it feeds plus all the outlet fittings of each unit it leaves.
    const gaps = gapSegs.map(list => {
      // Room per line: its own items one step apart, a half step for alternating neighbours, the inlet
      // valves and the stream number.
      let most = 0;
      for (const sg of list) {
        const st = sg.edge.stream;
        const n = (!dummies.has(sg.to) ? (st.machine ? 1 : 0) + (st.feedExchanger ? 1 : 0) : 0)
          + (!dummies.has(sg.from) && st.productExchanger ? 1 : 0);
        most = Math.max(most, n);
      }
      return Math.max(G.gapMin, 36 + list.length * G.laneGap, most ? 80 + G.fitStep * most : 0);
    });
    const colX = [];
    let x = G.padX;
    for (let c = 0; c < cols; c += 1) {
      colX.push(x);
      x += G.colW + (gaps[c] || 0);
    }
    const width = x - (gaps[cols - 1] || 0) + G.padX;
    const top = G.topBand;
    for (const [ci, col] of columns.entries()) {
      let y = top + (bodyH - colHeight(col)) / 2;
      for (const n of col) {
        n.x = colX[ci];
        n.y = y;
        n.h = heightOf(n);
        n.col = ci;
        // Symbol box: where lines attach.
        if (n.kind === 'equip') { n.sx = n.x + (G.colW - G.symW) / 2; n.sy = n.y + 40; n.sw = G.symW; n.sh = symH(n); }
        else if (n.kind === 'tank') { n.sx = n.x + (G.colW - 56) / 2; n.sy = n.y + 34; n.sw = 56; n.sh = 44; }
        else if (n.kind === 'package') { n.sx = n.x + 12; n.sy = n.y + 6; n.sw = G.colW - 24; n.sh = 54; }
        else if (n.kind === 'dummy') { n.sx = n.x; n.sy = n.y + n.h / 2; n.sw = G.colW; n.sh = 0; }
        else { n.sx = n.x + 6; n.sy = n.y + 6; n.sw = G.colW - 12; n.sh = 32; }
        y += n.h + G.rowGap;
      }
    }
    const backCount = back.size;
    const height = top + bodyH + G.padBottom + backCount * 12 + 10 + G.titleH;
    return { all, nodes, segs, back: [...back], gaps, gapSegs, colX, width, height, cols, bodyBottom: top + bodyH, layer };
  }

  // Port y for each segment end: spread over the symbol's side, ordered by the far end's y.
  function assignPorts(L) {
    const outs = new Map();
    const ins = new Map();
    const push = (map, id, s) => { if (!map.has(id)) map.set(id, []); map.get(id).push(s); };
    for (const s of L.segs) { push(outs, s.from, s); push(ins, s.to, s); }
    const backRef = new Map(L.back.map(e => [e, { back: e }]));
    for (const e of L.back) { push(outs, e.from, backRef.get(e)); push(ins, e.to, backRef.get(e)); }
    const yOut = new Map();
    const yIn = new Map();
    const far = (s, key) => (s.back ? L.bodyBottom + 1e4 : L.all.get(s[key]).sy + L.all.get(s[key]).sh / 2);
    for (const [map, target, key] of [[outs, yOut, 'to'], [ins, yIn, 'from']]) {
      for (const [id, list] of map) {
        const n = L.all.get(id);
        if (n.kind === 'dummy') { for (const s of list) target.set(s, n.sy); continue; }
        list.sort((a, b) => far(a, key) - far(b, key));
        list.forEach((s, i) => target.set(s, n.sy + n.sh * (0.15 + 0.7 * ((i + 1) / (list.length + 1)))));
      }
    }
    return { yOut, yIn, backRef };
  }

  // ------------------------------------------------------------------ symbols
  function symbol(UI, kind, x, y, w, h, extra = {}) {
    const { svg } = UI;
    const g = svg('g', { class: 'pid-sym is-' + kind });
    const cx = x + w / 2;
    const cy = y + h / 2;
    const P = d => g.append(svg('path', { d, class: 'pid-shape' }));
    const thin = d => g.append(svg('path', { d, class: 'pid-detail' }));
    switch (kind) {
      case 'pump': {
        const r = Math.min(w, h) / 2 - 4;
        g.append(svg('circle', { cx, cy, r, class: 'pid-shape' }));
        thin(`M${cx - r * 0.55},${cy + r * 0.55} L${cx + r},${cy - r * 0.15}`);
        P(`M${cx - r * 0.7},${cy + r} L${cx + r * 0.7},${cy + r} L${cx + r * 0.45},${cy + r * 0.62} L${cx - r * 0.45},${cy + r * 0.62} Z`);
        break;
      }
      case 'compressor': {
        const r = Math.min(w, h) / 2 - 4;
        g.append(svg('circle', { cx, cy, r, class: 'pid-shape' }));
        thin(`M${cx - r * 0.8},${cy - r * 0.6} L${cx + r * 0.8},${cy - r * 0.25} M${cx - r * 0.8},${cy + r * 0.6} L${cx + r * 0.8},${cy + r * 0.25}`);
        break;
      }
      case 'electrolyzer': {
        g.append(svg('rect', { x: x + 2, y: y + 6, width: w - 4, height: h - 12, rx: 2, class: 'pid-shape' }));
        const n = 7;
        let d = '';
        for (let i = 1; i < n; i += 1) { const xx = x + 2 + ((w - 4) * i) / n; d += `M${xx},${y + 10} L${xx},${y + h - 10} `; }
        thin(d);
        const plus = svg('text', { x: x + 8, y: y + 4, class: 'pid-pol' });
        plus.textContent = '+';
        const minus = svg('text', { x: x + w - 12, y: y + 4, class: 'pid-pol' });
        minus.textContent = '−';
        g.append(plus, minus);
        break;
      }
      case 'column': {
        const cw = 26;
        const xl = cx - cw / 2;
        P(`M${xl},${y + 8} A${cw / 2},8 0 0 1 ${xl + cw},${y + 8} L${xl + cw},${y + h - 8} A${cw / 2},8 0 0 1 ${xl},${y + h - 8} Z`);
        let d = '';
        for (let i = 1; i <= 4; i += 1) { const yy = y + 8 + ((h - 16) * i) / 5; d += `M${xl},${yy} L${xl + cw},${yy} `; }
        thin(d);
        break;
      }
      case 'contactor': {
        g.append(svg('rect', { x: x + 4, y: y + 4, width: w - 8, height: h - 8, rx: 3, class: 'pid-shape' }));
        let d = '';
        for (let i = 0; i < 4; i += 1) { const xx = x + 10 + i * ((w - 20) / 3); d += `M${xx},${y + 10} L${xx},${y + h - 10} `; }
        thin(d);
        g.append(svg('circle', { cx, cy: y + h / 2, r: 7, class: 'pid-detail' }));
        break;
      }
      case 'membrane': {
        g.append(svg('rect', { x: x + 2, y: y + 12, width: w - 4, height: h - 24, rx: 4, class: 'pid-shape' }));
        thin(`M${x + 2},${y + h - 12} L${x + w - 2},${y + 12}`);
        break;
      }
      case 'reactor': {
        const rw = 34;
        const xl = cx - rw / 2;
        P(`M${xl},${y + 10} A${rw / 2},10 0 0 1 ${xl + rw},${y + 10} L${xl + rw},${y + h - 10} A${rw / 2},10 0 0 1 ${xl},${y + h - 10} Z`);
        const yb = y + h * 0.36;
        const yb2 = y + h * 0.68;
        thin(`M${xl},${yb} L${xl + rw},${yb} M${xl},${yb2} L${xl + rw},${yb2} M${xl + 4},${yb2} L${xl + 14},${yb} M${xl + 14},${yb2} L${xl + 24},${yb} M${xl + 24},${yb2} L${xl + rw - 2},${yb + 4}`);
        break;
      }
      case 'kiln': {
        P(`M${x + 2},${y + 14} L${x + w - 2},${y + 22} L${x + w - 2},${y + h - 10} L${x + 2},${y + h - 18} Z`);
        thin(`M${x + 16},${y + h - 2} L${x + 20},${y + h - 15} M${x + w - 16},${y + h + 2} L${x + w - 20},${y + h - 11}`);
        break;
      }
      case 'furnace': {
        P(`M${x + 4},${y + h - 4} L${x + 4},${y + 16} Q${cx},${y - 2} ${x + w - 4},${y + 16} L${x + w - 4},${y + h - 4} Z`);
        thin(`M${cx - 12},${y + h - 10} q4,-10 8,0 q4,-10 8,0 q4,-10 8,0`);
        break;
      }
      case 'tank-gas': {
        P(`M${x + 12},${y + 6} L${x + w - 12},${y + 6} A12,${(h - 12) / 2} 0 0 1 ${x + w - 12},${y + h - 6} L${x + 12},${y + h - 6} A12,${(h - 12) / 2} 0 0 1 ${x + 12},${y + 6} Z`);
        thin(`M${x + 18},${y + h - 6} L${x + 14},${y + h + 2} M${x + w - 18},${y + h - 6} L${x + w - 14},${y + h + 2}`);
        break;
      }
      case 'tank': {
        P(`M${x + 8},${y + 10} L${cx},${y + 2} L${x + w - 8},${y + 10} L${x + w - 8},${y + h - 2} L${x + 8},${y + h - 2} Z`);
        thin(`M${x + 8},${y + h * 0.45} L${x + w - 8},${y + h * 0.45}`);
        break;
      }
      case 'pv': {
        g.append(svg('rect', { x, y, width: w, height: h, class: 'pid-shape' }));
        let d = '';
        for (let i = 1; i < 4; i += 1) d += `M${x + (w * i) / 4},${y} L${x + (w * i) / 4},${y + h} `;
        d += `M${x},${y + h / 2} L${x + w},${y + h / 2}`;
        thin(d);
        break;
      }
      case 'battery': {
        g.append(svg('rect', { x, y: y + 3, width: w, height: h - 3, rx: 2, class: 'pid-shape' }));
        g.append(svg('rect', { x: x + w * 0.3, y, width: w * 0.12, height: 3, class: 'pid-shape' }));
        g.append(svg('rect', { x: x + w * 0.58, y, width: w * 0.12, height: 3, class: 'pid-shape' }));
        thin(`M${x + 6},${y + h / 2 + 1} L${x + 14},${y + h / 2 + 1} M${x + 10},${y + h / 2 - 3} L${x + 10},${y + h / 2 + 5} M${x + w - 14},${y + h / 2 + 1} L${x + w - 6},${y + h / 2 + 1}`);
        break;
      }
      case 'thermal': {
        g.append(svg('rect', { x, y, width: w, height: h, rx: 2, class: 'pid-shape' }));
        thin(`M${x + 8},${y + h - 6} q4,-6 0,-12 q-4,-6 0,-12 M${x + w / 2},${y + h - 6} q4,-6 0,-12 q-4,-6 0,-12 M${x + w - 8},${y + h - 6} q4,-6 0,-12 q-4,-6 0,-12`);
        break;
      }
      default: {
        g.append(svg('rect', { x: x + 2, y: y + 6, width: w - 4, height: h - 12, rx: 3, class: 'pid-shape is-package' }));
        const t = svg('text', { x: cx, y: cy + 4, class: 'pid-pkg-label', 'text-anchor': 'middle' });
        t.textContent = extra.text || 'PKG';
        g.append(t);
      }
    }
    return g;
  }

  // ISA instrument bubble (shared display: circle with a line), interlock diamond, relief valve.
  function bubble(UI, inst, cx, cy) {
    const { svg } = UI;
    const r = G.bubbleR;
    const g = svg('g', { class: 'pid-inst' + (inst.interlock ? ' is-interlock' : '') + (inst.safety ? ' is-safety' : '') + (inst.alarm ? ' is-alarm' : '') });
    if (inst.interlock) g.append(svg('path', { d: `M${cx},${cy - r - 1} L${cx + r + 1},${cy} L${cx},${cy + r + 1} L${cx - r - 1},${cy} Z`, class: 'pid-inst-shape' }));
    else {
      g.append(svg('circle', { cx, cy, r, class: 'pid-inst-shape' }));
      g.append(svg('line', { x1: cx - r, x2: cx + r, y1: cy, y2: cy, class: 'pid-inst-line' }));
    }
    const a = svg('text', { x: cx, y: cy - 2.5, class: 'pid-inst-letters', 'text-anchor': 'middle' });
    a.textContent = inst.letters;
    const b = svg('text', { x: cx, y: cy + 8.5, class: 'pid-inst-num', 'text-anchor': 'middle' });
    b.textContent = String(inst.loop);
    const t = svg('title');
    t.textContent = `${inst.tag}: ${inst.service}${inst.equipment ? ' (' + inst.equipment + ')' : ''}`;
    g.append(a, b, t);
    return g;
  }

  // Compressor or pump drawn in line, tagged to the unit whose package it belongs to.
  function machineSymbol(UI, m, x, y) {
    const { svg } = UI;
    const r = 10;
    const g = svg('g', { class: 'pid-machine', 'data-tag': m.tag });
    g.append(svg('circle', { cx: x, cy: y, r, class: 'pid-valve-body' }));
    if (m.kind === 'compressor') g.append(svg('path', { d: `M${x - r * 0.8},${y - r * 0.6} L${x + r * 0.8},${y - r * 0.25} M${x - r * 0.8},${y + r * 0.6} L${x + r * 0.8},${y + r * 0.25}`, class: 'pid-detail' }));
    else g.append(svg('path', { d: `M${x - r * 0.5},${y + r * 0.6} L${x + r},${y - r * 0.1}`, class: 'pid-detail' }));
    const t = svg('text', { x, y: y - r - 4, class: 'pid-machine-tag', 'text-anchor': 'middle' });
    t.textContent = m.tag;
    const title = svg('title');
    title.textContent = `${m.tag}: ${m.service}, ${UI.num(m.fromBar)} → ${UI.num(m.toBar)} bar, ${UI.num(m.designKgPerH)} kg/h design · cost and power are in ${m.host}'s package`;
    g.append(t, title);
    return g;
  }

  // Heat exchanger (shell-and-tube, simplified: circle with the tube pass drawn through it).
  function exchangerSymbol(UI, x0, x, y) {
    const { svg } = UI;
    const xc = x0;
    const r = 10;
    const g = svg('g', { class: 'pid-machine pid-exchanger is-' + xc.duty, 'data-tag': xc.tag });
    g.append(svg('circle', { cx: x, cy: y, r, class: 'pid-valve-body' }));
    g.append(svg('path', { d: `M${x - r - 3},${y + 4} L${x - 5},${y + 4} L${x - 2},${y - 5} L${x + 2},${y + 5} L${x + 5},${y - 4} L${x + r + 3},${y - 4}`, class: 'pid-detail' }));
    const t = svg('text', { x, y: y - r - 4, class: 'pid-machine-tag', 'text-anchor': 'middle' });
    t.textContent = xc.tag;
    const title = svg('title');
    title.textContent = `${xc.tag}: ${xc.service} · cost and energy are in ${xc.host}'s package`;
    g.append(t, title);
    return g;
  }

  function controlValve(UI, x, y) {
    const { svg } = UI;
    const g = svg('g', { class: 'pid-valve' });
    g.append(svg('path', { d: `M${x - 7},${y - 5} L${x + 7},${y + 5} L${x + 7},${y - 5} L${x - 7},${y + 5} Z`, class: 'pid-valve-body' }));
    g.append(svg('path', { d: `M${x},${y} L${x},${y - 11} M${x - 6},${y - 11} A6,5 0 0 1 ${x + 6},${y - 11} Z`, class: 'pid-valve-act' }));
    return g;
  }

  function fit(text, max) {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  // ------------------------------------------------------------------ the drawing
  function drawPid(UI, Store, pathway, pkg) {
    const { el, svg } = UI;
    if (!pathway.flowsheet?.nodes?.length) return el('p', { class: 'empty', text: 'This recipe has no flowsheet to draw.' });
    const graph = buildGraph(pathway, pkg);
    const L = layoutGraph(graph);
    const { yOut, yIn, backRef } = assignPorts(L);
    const u = pkg.utilities;
    const utilList = [
      ['pv', u.pv.tag, `Solar PV ${UI.num(u.pv.kWp / 1000)} MWp`, `${UI.num(u.pv.landHa)} ha · ${UI.num(u.pv.yieldKWhPerKWpDay)} kWh/kWp·d`],
      u.battery ? ['battery', u.battery.tag, `Battery ${UI.num(u.battery.kWh / 1000)} MWh · ${UI.num(u.battery.kW / 1000)} MW`, `${UI.num(u.battery.hours, 2)} h · firms steady units overnight`] : null,
      u.thermal ? ['thermal', u.thermal.tag, `Heat store ${UI.num(u.thermal.kWh / 1000)} MWh(th) · ${UI.num(u.thermal.kW / 1000)} MW(th)`, `${UI.num(u.thermal.hours, 2)} h · firms heat-dominated units`] : null,
    ].filter(Boolean);
    const utilW = ([, , a, b]) => 54 + 8 + Math.max(110, 6.2 * Math.max(a.length, b.length)) + 18;
    const utilEnd = G.padX + utilList.reduce((t, x) => t + utilW(x), 0);
    const busLabelText = `Plant bus · peak ${UI.num(u.peakLoadKW / 1000)} MW · ${UI.num(u.electricityKWhPerYear / 1e6)} GWh/yr`;
    L.width = Math.max(L.width, utilEnd + 250, G.tbW + 2 * G.padX + 300);
    const root = svg('svg', {
      class: 'pid', width: L.width, height: L.height, viewBox: `0 0 ${L.width} ${L.height}`, role: 'img',
      'aria-label': `P&ID of ${pathway.name}: ${pkg.equipment.length} equipment items, ${pkg.streams.length} streams, ${pkg.instruments.length} instruments`,
    });
    const defs = svg('defs');
    const marker = svg('marker', { id: 'pidArrow', viewBox: '0 0 8 8', refX: 7.5, refY: 4, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto' });
    marker.append(svg('path', { d: 'M0,0.5 L8,4 L0,7.5 z', class: 'pid-arrow' }));
    defs.append(marker);
    root.append(svg('rect', { x: 0, y: 0, width: L.width, height: L.height, class: 'pid-bg' }), defs);

    // ---- power: PV field, stores, bus.
    const elec = svg('g', { class: 'pid-elec' });
    const busY = 92;
    let ux = G.padX;
    const util = (kind, tag, line1, line2) => {
      const w = 54;
      const h = 30;
      elec.append(symbol(UI, kind, ux, 22, w, h));
      const t = svg('text', { x: ux + w + 8, y: 32, class: 'pid-tag' });
      t.textContent = tag;
      const l1 = svg('text', { x: ux + w + 8, y: 45, class: 'pid-note' });
      l1.textContent = line1;
      const l2 = svg('text', { x: ux + w + 8, y: 57, class: 'pid-note' });
      l2.textContent = line2 || '';
      elec.append(t, l1, l2, svg('line', { x1: ux + w / 2, x2: ux + w / 2, y1: 52, y2: busY, class: 'pid-power' }));
      ux += utilW([kind, tag, line1, line2 || '']);
    };
    for (const x of utilList) util(...x);
    const powered = [...L.nodes.values()].filter(n => n.kind === 'equip' && n.equip.powerKW.design > 0);
    const busX1 = Math.min(L.width - G.padX, Math.max(ux + 230, ...powered.map(n => n.x + G.colW - 8)));
    elec.append(svg('line', { x1: G.padX, x2: busX1, y1: busY, y2: busY, class: 'pid-bus' }));
    const busLabel = svg('text', { x: busX1, y: busY - 6, class: 'pid-note', 'text-anchor': 'end' });
    busLabel.textContent = busLabelText;
    elec.append(busLabel);
    // Each powered unit gets a feeder stub from the bus (one-line diagrams carry the detail).
    for (const n of powered) {
      const xd = n.sx + n.sw - 6;
      const g = svg('g', { class: 'pid-feeder' });
      g.append(svg('path', { d: `M${xd},${n.sy - 13} L${xd},${n.sy}`, class: 'pid-power' }));
      g.append(svg('path', { d: `M${xd - 4},${n.sy - 13} L${xd + 4},${n.sy - 13}`, class: 'pid-bus-stub' }));
      const k = svg('text', { x: xd + 6, y: n.sy - 4, class: 'pid-kw' });
      const kw = n.equip.powerKW.design;
      k.textContent = kw >= 1000 ? `${UI.num(kw / 1000, 2)} MW` : `${UI.num(kw, 2)} kW`;
      const t = svg('title');
      t.textContent = `${n.equip.tag}: ${UI.num(kw)} kW at nameplate, ${UI.num(n.equip.powerKW.average)} kW average, fed from the plant bus`;
      g.append(k, t);
      elec.append(g);
    }
    root.append(elec);

    // ---- process lines.
    const lines = svg('g', { class: 'pid-lines' });
    const labels = svg('g', { class: 'pid-line-labels' });
    const valves = svg('g', { class: 'pid-valves' });
    const laneX = new Map();
    for (const [gi, list] of L.gapSegs.entries()) {
      const x0 = L.colX[gi] + G.colW;
      const gw = L.gaps[gi];
      // Lines with items before their next unit turn early (left lanes) so the run into the unit is long;
      // lines with a product exchanger turn late (right lanes) so the run out of the unit is long.
      const group = sg => {
        const st = sg.edge.stream;
        const inItems = !L.all.get(sg.to) || L.all.get(sg.to).kind === 'dummy' ? 0 : (st.machine ? 1 : 0) + (st.feedExchanger ? 1 : 0);
        const outItems = L.all.get(sg.from)?.kind === 'dummy' ? 0 : (st.productExchanger ? 1 : 0);
        return inItems ? 0 : outItems ? 2 : 1;
      };
      const sorted = list.slice().sort((a, b) => group(a) - group(b) || yOut.get(a) - yOut.get(b));
      // Turns packed from the left (from the right for product-exchanger lines), 14 px apart, so the
      // straight runs that carry items stay long; with nothing to carry, spread evenly as before.
      const step = Math.min(14, (gw - 44) / Math.max(1, sorted.length));
      const carries = sorted.some(sg => group(sg) !== 1);
      const right = sorted.filter(sg => group(sg) === 2);
      sorted.forEach((sg, i) => {
        if (!carries) { laneX.set(sg, x0 + 22 + ((gw - 44) * (i + 0.5)) / sorted.length); return; }
        const r = right.indexOf(sg);
        laneX.set(sg, r >= 0 ? x0 + gw - 22 - (right.length - 1 - r) * step : x0 + 22 + i * step);
      });
    }
    const productTo = new Set([...L.nodes.values()].filter(n => n.disposition === 'product').map(n => n.id));
    const edgeSegs = new Map();
    for (const s of L.segs) {
      if (!edgeSegs.has(s.edge)) edgeSegs.set(s.edge, []);
      edgeSegs.get(s.edge).push(s);
    }
    // Stream number diamonds: on a line's longest horizontal runs, away from other diamonds.
    const placedTags = [];
    // A point on a horizontal run of the polyline, away from placed tags; the final run loses `endClear`
    // px at its end (inlet valves), every run `margin` px at both ends.
    const freeSpot = (pts, endClear, margin, vertical = false) => {
      const runs = [];
      for (let i = 0; i + 1 < pts.length; i += 1) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        if (Math.abs(ay - by) > 0.5) continue;
        const x0 = Math.min(ax, bx) + margin;
        const x1 = Math.max(ax, bx) - margin - (i + 2 === pts.length ? endClear : 0);
        if (x1 > x0) runs.push({ x0, x1, y: ay });
      }
      runs.sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
      const free = (x, y) => !placedTags.some(p => Math.abs(p.x - x) < 26 && Math.abs(p.y - y) < 20);
      for (const r of runs) {
        const mid = (r.x0 + r.x1) / 2;
        for (const off of [0, -24, 24, -48, 48, -72, 72]) if (mid + off >= r.x0 && mid + off <= r.x1 && free(mid + off, r.y)) return { x: mid + off, y: r.y };
      }
      if (vertical) {
        // Then on a vertical run (a tag reads as well there).
        for (let i = 0; i + 1 < pts.length; i += 1) {
          const [ax, ay] = pts[i];
          const [bx, by] = pts[i + 1];
          if (Math.abs(ax - bx) > 0.5 || Math.abs(by - ay) < 2 * margin + 16) continue;
          const y0 = Math.min(ay, by) + margin;
          const y1 = Math.max(ay, by) - margin;
          for (let y = (y0 + y1) / 2, k = 0; k < 6; k += 1, y = (y0 + y1) / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 20) {
            if (y >= y0 && y <= y1 && free(ax, y)) return { x: ax, y };
          }
        }
      }
      // Crowded: the point on the line farthest from anything already placed.
      let best = null;
      for (let i = 0; i + 1 < pts.length; i += 1) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        for (let d = 8; d < len - 8; d += 4) {
          const x = ax + ((bx - ax) * d) / len;
          const y = ay + ((by - ay) * d) / len;
          const near = Math.min(Infinity, ...placedTags.map(p => Math.max(Math.abs(p.x - x) / 26, Math.abs(p.y - y) / 20)));
          if (!best || near > best.near) best = { x, y, near };
        }
      }
      return best;
    };
    const placeTag = (st, pts) => {
      const spot = freeSpot(pts, 46, 12, true);
      if (!spot) return;
      placedTags.push({ x: spot.x, y: spot.y });
      labels.append(streamTag(UI, st, spot.x, spot.y));
    };
    const machineByTag = new Map((pkg.machines || []).map(m => [m.tag, m]));
    const exchangerByTag = new Map((pkg.exchangers || []).map(x => [x.tag, x]));
    const machineSpots = [];
    const pendingTags = [];
    const lastSegIn = new Map(); // node id → [{ x, y }] of the line's last horizontal entering it (for valves)
    // Reserve the inlet control-valve positions (drawn later with the units) before placing anything.
    for (const list of edgeSegs.values()) {
      const last = list[list.length - 1];
      const b = L.all.get(last.to);
      if (b.kind !== 'equip') continue;
      const y = yIn.get(last);
      placedTags.push({ x: b.sx - 16, y }, { x: b.sx - 38, y });
    }
    // Each line's rank among the lines into its unit (by inlet height) and out of its unit (by outlet height).
    const inRank = new Map();
    const outRank = new Map();
    const rankBy = (key, ys, target) => {
      const groups = new Map();
      for (const [e, list] of edgeSegs) {
        const sg = key === 'to' ? list[list.length - 1] : list[0];
        const id = sg[key];
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push([e, ys.get(sg)]);
      }
      for (const g of groups.values()) g.sort((a, b) => a[1] - b[1]).forEach(([e], i) => target.set(e, i));
    };
    rankBy('to', yIn, inRank);
    rankBy('from', yOut, outRank);
    for (const [e, list] of edgeSegs) {
      const pts = [];
      list.forEach(s => {
        const a = L.all.get(s.from);
        const b = L.all.get(s.to);
        const x1 = a.kind === 'dummy' ? a.x + G.colW : a.sx + a.sw;
        const y1 = yOut.get(s);
        const x2 = b.kind === 'dummy' ? b.x : b.sx;
        const y2 = yIn.get(s);
        const lx = laneX.get(s);
        pts.push([x1, y1], [lx, y1], [lx, y2], [x2, y2]);
        if (b.kind !== 'dummy') {
          if (!lastSegIn.has(b.id)) lastSegIn.set(b.id, []);
          lastSegIn.get(b.id).push({ x1: lx, x2, y: y2, stream: e.stream });
        }
      });
      const d = 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' L');
      const st = e.stream;
      const cls = 'pid-line is-' + st.kind + (productTo.has(e.to) ? ' is-product' : '') + (st.phase === 'gas' ? ' is-gas' : '');
      const path = svg('path', { d, class: cls, 'marker-end': 'url(#pidArrow)', 'data-stream': st.no });
      const t = svg('title');
      t.textContent = streamTitle(UI, st);
      path.append(t);
      lines.append(path);
      // In-line items inside a unit's package. Inlet side, upstream of the inlet valves (last ~50 px):
      // compressor or pump, then feed exchanger. Outlet side, just after the sending unit: product exchanger.
      const fit = (item, draw, end) => {
        // Step along this line for each item already on it; alternate lines into (or out of) the same
        // unit sit half a step apart so items on neighbouring lines do not touch.
        const k = machineSpots.filter(q => q.stream === st.no && q.end === end).length;
        const half = 0;
        let near = null;
        if (end === 'in') {
          const [lx2, ly2] = pts[pts.length - 2];
          const [ex] = pts[pts.length - 1];
          const off = 72 + k * G.fitStep + half; // clear of the valves reserved at ex−16 / ex−38
          if (ex - lx2 >= off + 14) near = { x: ex - off, y: ly2 };
        } else {
          const [sx0, sy0] = pts[0];
          const [sx1] = pts[1];
          const off = 24 + k * G.fitStep + half;
          if (sx1 - sx0 >= off + 20) near = { x: sx0 + off, y: sy0 };
        }
        const clear = near && !placedTags.some(p => Math.abs(p.x - near.x) < 26 && Math.abs(p.y - near.y) < 20);
        const spot = clear ? near : freeSpot(pts, 50, 18);
        if (!spot) return;
        machineSpots.push({ host: item.host, stream: st.no, end, x: spot.x, y: spot.y });
        valves.append(draw(UI, item, spot.x, spot.y));
        placedTags.push({ x: spot.x, y: spot.y }, { x: spot.x, y: spot.y - 14 }); // the symbol and its tag
      };
      if (st.productExchanger) fit(exchangerByTag.get(st.productExchanger), exchangerSymbol, 'out');
      if (st.feedExchanger) fit(exchangerByTag.get(st.feedExchanger), exchangerSymbol, 'in');
      if (st.machine) fit(machineByTag.get(st.machine), machineSymbol, 'in');
      pendingTags.push([st, pts]);
    }
    // Stream numbers after every fitting is down: fittings have fixed places, numbers can move.
    for (const [st, pts] of pendingTags) placeTag(st, pts);
    // Recycles: loop under the drawing.
    L.back.forEach((e, i) => {
      const a = L.all.get(e.from);
      const b = L.all.get(e.to);
      const x1 = a.sx + a.sw;
      const y1 = yOut.get(backRef.get(e)) ?? (a.sy + a.sh / 2);
      const x2 = b.sx;
      const y2 = yIn.get(backRef.get(e)) ?? (b.sy + b.sh / 2);
      const yb = L.bodyBottom + 14 + i * 12;
      const d = `M${x1},${y1} L${x1 + 14},${y1} L${x1 + 14},${yb} L${x2 - 14},${yb} L${x2 - 14},${y2} L${x2},${y2}`;
      const path = svg('path', { d, class: 'pid-line is-recycle is-' + e.stream.kind, 'marker-end': 'url(#pidArrow)', 'data-stream': e.stream.no });
      const t = svg('title');
      t.textContent = streamTitle(UI, e.stream) + ' (recycle)';
      path.append(t);
      lines.append(path);
      placeTag(e.stream, [[x1 + 14, yb], [x2 - 14, yb]]);
    });

    // ---- equipment, connectors, tanks, packages.
    const items = svg('g', { class: 'pid-items' });
    const instByEquip = new Map();
    for (const inst of pkg.instruments) {
      if (!inst.equipment) continue;
      if (!instByEquip.has(inst.equipment)) instByEquip.set(inst.equipment, []);
      instByEquip.get(inst.equipment).push(inst);
    }
    const signal = svg('g', { class: 'pid-signals' });
    for (const n of L.nodes.values()) {
      const g = svg('g', { class: 'pid-item is-' + n.kind + (n.disposition ? ' is-' + n.disposition : ''), 'data-node': n.id });
      if (n.kind === 'equip') {
        const e = n.equip;
        g.setAttribute('data-tag', e.tag);
        g.append(symbol(UI, e.symbol, n.sx, n.sy, n.sw, n.sh));
        const cx = n.x + G.colW / 2;
        const tag = svg('text', { x: cx, y: n.sy + n.sh + 16, class: 'pid-tag', 'text-anchor': 'middle' });
        tag.textContent = e.tag;
        const name = svg('text', { x: cx, y: n.sy + n.sh + 29, class: 'pid-name', 'text-anchor': 'middle' });
        name.textContent = fit(e.service, 26);
        const mode = svg('text', { x: cx, y: n.sy + n.sh + 41, class: 'pid-note' + (e.mode === 'sun-following' ? ' is-sun' : ''), 'text-anchor': 'middle' });
        mode.textContent = e.mode === 'sun-following' ? `☀ follows sun · ${UI.num(pkg.basis.flexNameplateFactor, 2)}× nameplate` : `${e.mode === 'firmed' ? 'firmed 24 h' : 'steady'} · ≥${Math.round(e.minTurndown * 100)}% turndown`;
        const cond = svg('text', { x: cx, y: n.sy + n.sh + 53, class: 'pid-note pid-cond', 'text-anchor': 'middle' });
        cond.textContent = e.conditions ? fit(`${e.conditions.T} · ${e.conditions.P}`, 32) : '';
        const t = svg('title');
        t.textContent = `${e.tag} ${e.service} · ${e.type} · ${modeText(e)}${e.conditions ? ` · typically ${e.conditions.T}, ${e.conditions.P}` : ''} · design ${UI.num(e.throughputKgPerH.design)} kg/h · ${UI.usd(e.capexUsd)} installed`;
        g.append(t, tag, name, mode, cond);
        // Instruments in a row above the symbol, signal lines down to it.
        const insts = instByEquip.get(e.tag) || [];
        const span = Math.min(G.colW - 30, insts.length * 27 - 3);
        insts.forEach((inst, i) => {
          const bx = n.x + 8 + (G.colW - 30 - span) / 2 + (insts.length === 1 ? span / 2 : (span - 24) * i / (insts.length - 1) + 12);
          const by = n.y + 14;
          signal.append(svg('line', { x1: bx, x2: Math.min(Math.max(bx, n.sx + 4), n.sx + n.sw - 4), y1: by + G.bubbleR, y2: n.sy, class: 'pid-signal' }));
          g.append(bubble(UI, inst, bx, by));
        });
        // Control valve on the inlet line(s) of flow / ratio loops.
        // Control valves on the inlets the flow loop sets: the largest feed, or both feeds of a ratio loop.
        const flowLoop = insts.find(i => /^F+IC$/.test(i.letters));
        const inlets = (lastSegIn.get(n.id) || []).filter(sg => sg.stream.kind === 'material').sort((a, b) => b.stream.perKgProduct - a.stream.perKgProduct);
        const valved = flowLoop ? inlets.slice(0, flowLoop.letters === 'FFIC' ? 2 : 1) : [];
        const bx = n.x + 8 + (G.colW - 30 - span) / 2 + (insts.length === 1 ? span / 2 : 12);
        valved.forEach((inlet, vi) => {
          if (!(inlet.x2 - inlet.x1 > 30 + vi * 22)) return;
          const vx = inlet.x2 - 16 - vi * 22; // a ratio loop's second valve sits one step upstream
          valves.append(controlValve(UI, vx, inlet.y));
          signal.append(svg('path', { d: `M${bx - G.bubbleR},${n.y + 14} L${vx},${n.y + 14} L${vx},${inlet.y - 16}`, class: 'pid-signal' }));
        });
      } else if (n.kind === 'tank') {
        const b = n.buffer;
        g.setAttribute('data-tag', b.tag);
        const gas = ['H2', 'O2', 'N2', 'CO2', 'CH4'].includes(b.substance);
        g.append(symbol(UI, gas ? 'tank-gas' : 'tank', n.sx, n.sy, n.sw, n.sh));
        const cx = n.x + G.colW / 2;
        const tag = svg('text', { x: cx, y: n.sy + n.sh + 16, class: 'pid-tag', 'text-anchor': 'middle' });
        tag.textContent = b.tag;
        const name = svg('text', { x: cx, y: n.sy + n.sh + 29, class: 'pid-name', 'text-anchor': 'middle' });
        name.textContent = `${sub(b.substance)} buffer ${UI.num(b.capacityKg / 1000)} t`;
        const note = svg('text', { x: cx, y: n.sy + n.sh + 41, class: 'pid-note', 'text-anchor': 'middle' });
        note.textContent = `covers ${UI.num(b.holdHours, 2)} h without sun`;
        g.append(tag, name, note);
        const insts = instByEquip.get(b.tag) || [];
        insts.forEach((inst, i) => {
          const bx = cx - ((insts.length - 1) * 27) / 2 + i * 27;
          signal.append(svg('line', { x1: bx, x2: cx, y1: n.y + 14 + G.bubbleR, y2: n.sy + 4, class: 'pid-signal' }));
          g.append(bubble(UI, inst, bx, n.y + 14));
        });
      } else if (n.kind === 'package') {
        const c = n.captive;
        g.setAttribute('data-tag', c.tag);
        g.append(svg('rect', { x: n.sx, y: n.sy, width: n.sw, height: n.sh, rx: 4, class: 'pid-shape is-package' }));
        const tag = svg('text', { x: n.sx + 8, y: n.sy + 16, class: 'pid-tag' });
        tag.textContent = c.tag;
        const name = svg('text', { x: n.sx + 8, y: n.sy + 30, class: 'pid-name' });
        name.textContent = fit(`Captive ${UI.shortName(c.product)} supplier`, 26);
        const note = svg('text', { x: n.sx + 8, y: n.sy + 44, class: 'pid-note' });
        note.textContent = fit(`${c.supplierId} · ${UI.usdKg(c.lcopUsdPerKg)}/kg`, 30);
        const link = svg('a', { href: planHref(Store, c.supplierId, pkg.basis.siteId, null, pkg.basis.yearIndex > 0 ? pkg.basis.year : null) });
        const lt = svg('text', { x: n.sx + 8, y: n.sy + n.sh + 14, class: 'pid-link' });
        lt.textContent = 'open its plant design →';
        link.append(lt);
        g.append(tag, name, note, link);
      } else {
        // Off-page connector: feeds point in from the left, products and wastes out to the right.
        const w = n.sw;
        const h = n.sh;
        const x = n.sx;
        const y = n.sy;
        g.append(svg('path', { d: `M${x},${y} L${x + w - 12},${y} L${x + w},${y + h / 2} L${x + w - 12},${y + h} L${x},${y + h} Z`, class: 'pid-conn' }));
        const lab = svg('text', { x: x + 8, y: y + 13, class: 'pid-conn-label' });
        lab.textContent = fit(n.label, 24);
        const subT = svg('text', { x: x + 8, y: y + 26, class: 'pid-note' });
        subT.textContent = n.kind === 'source'
          ? (n.heat ? 'heat supply' : 'from battery limit')
          : n.disposition === 'product' ? 'product to storage / export' : n.disposition === 'coproduct' ? 'co-product to sale' : 'to treatment / discharge';
        g.append(lab, subT);
      }
      items.append(g);
    }
    // Package boundaries: a unit and the machines inside its package (dash-dot, as on a vendor package).
    const bounds = svg('g', { class: 'pid-bounds' });
    for (const n of L.nodes.values()) {
      if (n.kind !== 'equip') continue;
      // Only machines drawn next to the unit; one placed further up its line keeps its tag but stays outside.
      const spots = machineSpots.filter(m => m.host === n.equip.tag && m.x > n.sx - 150 && m.x < n.sx + n.sw + 150);
      if (!spots.length) continue;
      // The unit's whole cell (instrument bubbles to the last label line) plus its machines.
      const x0 = Math.min(n.x + 2, ...spots.map(m => m.x - 22));
      const x1 = Math.max(n.x + G.colW - 2, ...spots.map(m => m.x + 22));
      const y0 = Math.min(n.y - 2, ...spots.map(m => m.y - 30));
      const y1 = Math.max(n.sy + n.sh + 64, ...spots.map(m => m.y + 16));
      bounds.append(svg('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 4, class: 'pid-bound' }));
      // Label set into the bottom border line (a gap in the dash-dot), clear of the cells around it.
      const label = `${n.equip.tag} package`;
      const lw = label.length * 4.9 + 6;
      bounds.append(svg('rect', { x: x1 - lw - 8, y: y1 - 6, width: lw, height: 10, class: 'pid-bound-gap' }));
      const t = svg('text', { x: x1 - lw - 5, y: y1 + 2.5, class: 'pid-bound-label' });
      t.textContent = label;
      bounds.append(t);
    }
    root.append(bounds, lines, signal, valves, items, labels);

    // Title block.
    const tb = svg('g', { class: 'pid-titleblock' });
    // Title block: bottom right, as on a drawing sheet.
    const tbW = G.tbW;
    const tx = L.width - tbW - G.padX;
    const ty = L.height - G.titleH + 6;
    tb.append(svg('rect', { x: tx, y: ty, width: tbW, height: G.titleH - 14, class: 'pid-tb' }));
    tb.append(svg('line', { x1: tx, x2: tx + tbW, y1: ty + 24, y2: ty + 24, class: 'pid-tb-rule' }));
    const t1 = svg('text', { x: tx + 10, y: ty + 17, class: 'pid-tb-title' });
    t1.textContent = fit(UI.pathwayLabel(pathway) + ' · P&ID', 44);
    const t2 = svg('text', { x: tx + 10, y: ty + 36, class: 'pid-note' });
    t2.textContent = fit(`${Store.siteById.get(pkg.basis.siteId)?.name || pkg.basis.siteId} · ${UI.tonnes(pkg.basis.sizeKgPerDay * 365 / 1000)}/yr nameplate · ${pkg.basis.year} costs`, 58);
    const t3 = svg('text', { x: tx + 10, y: ty + 49, class: 'pid-note' });
    t3.textContent = 'Screening design · indicative instrumentation · not for construction';
    tb.append(t1, t2, t3);
    root.append(tb);
    return root;
  }

  function streamTitle(UI, st) {
    const unit = st.kind === 'heat' ? 'kW' : 'kg/h';
    const comp = st.composition.map(([s, f]) => `${s} ${UI.pct(f, 0)}`).join(', ');
    return `Stream ${st.no} (${st.lineNumber || st.line}${st.T_C != null ? ', ' + UI.num(st.T_C) + ' °C' : ''}${st.pressureBar != null ? ', ' + UI.num(st.pressureBar) + ' bar' : ''}) ${st.fromTag} → ${st.toTag}: ${UI.num(st.design)} ${unit} design, ${UI.num(st.average)} ${unit} average${comp ? ' · ' + comp : ''}${st.phase ? ' · ' + st.phase : ''}`;
  }
  function streamTag(UI, st, x, y) {
    const { svg } = UI;
    const g = svg('g', { class: 'pid-stream-tag', 'data-stream': st.no });
    g.append(svg('path', { d: `M${x},${y - 8} L${x + 8},${y} L${x},${y + 8} L${x - 8},${y} Z`, class: 'pid-diamond' }));
    const t = svg('text', { x, y: y + 3, class: 'pid-diamond-num', 'text-anchor': 'middle' });
    t.textContent = String(st.no);
    g.append(t);
    return g;
  }

  // SVG with computed styles inlined, so the download looks like the page (current theme).
  function exportSvg(node) {
    const clone = node.cloneNode(true);
    const src = node.querySelectorAll('*');
    const dst = clone.querySelectorAll('*');
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'fill-opacity', 'font-size', 'font-weight', 'font-family', 'font-style', 'opacity'];
    src.forEach((n, i) => {
      const cs = getComputedStyle(n);
      dst[i].setAttribute('style', props.map(p => `${p}:${cs.getPropertyValue(p)}`).join(';'));
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  }

  // ------------------------------------------------------------------ tables
  // Tag number for upstream-to-downstream order: R-104 → '104', K-104A → '104A'.
  const tagOrder = tag => String(tag).replace(/^[A-Z]+-/, '').padStart(5, '0');

  function equipmentTable(UI, pkg, pathwayId) {
    const total = pkg.tea.capexTotal;
    const hosts = new Map(pkg.equipment.map(e => [e.tag, e]));
    // Machines the pressure steps imply, listed under the unit whose package carries their cost.
    const machineRows = (pkg.machines || []).map(m => {
      const st = pkg.streams.find(x => x.no === m.stream);
      const host = hosts.get(m.host);
      return {
        tag: m.tag, service: m.service, machine: m, host,
        type: `${m.kind === 'compressor' ? 'Compressor' : 'Pump'}, inside ${m.host}’s package`,
        mode: host?.mode, storeKind: host?.storeKind, minTurndown: host?.minTurndown,
        conditions: { T: `stream ${m.stream}`, P: `${UI.num(m.fromBar)} → ${UI.num(m.toBar)} bar` },
        throughputKgPerH: { design: st?.design ?? m.designKgPerH, average: st?.average ?? NaN },
        powerKW: { design: 0 }, capexUsd: null,
      };
    });
    const exchangerRows = (pkg.exchangers || []).map(x => {
      const st = pkg.streams.find(y => y.no === x.stream);
      const host = hosts.get(x.host);
      return {
        tag: x.tag, service: x.service, machine: x, host,
        type: `Heat exchanger (${x.duty}), inside ${x.host}’s package`,
        mode: host?.mode, storeKind: host?.storeKind, minTurndown: host?.minTurndown,
        conditions: { T: `${Math.round(x.fromC)} → ${Math.round(x.toC)} °C`.replace(/-/g, '−'), P: `stream ${x.stream}` },
        throughputKgPerH: { design: st?.design ?? NaN, average: st?.average ?? NaN },
        powerKW: { design: 0 }, capexUsd: null,
      };
    });
    const rows = [...pkg.equipment, ...machineRows, ...exchangerRows];
    return UI.sortableTable([
      { key: 'tag', label: 'Tag', get: e => tagOrder(e.tag), csv: e => e.tag, render: e => UI.el('strong', { 'data-tag': e.tag, text: e.tag }) },
      { key: 'service', label: 'Service', get: e => e.service, render: e => [UI.el('span', { text: e.service }), UI.el('span', { class: 'cell-sub', text: e.type + (e.designed ? ' · engineered design' : '') })] },
      { key: 'mode', label: 'Operation', get: e => modeText(e), render: e => UI.el('span', { class: e.mode === 'sun-following' ? 'pl-sun' : '', text: modeText(e) }) },
      { key: 'cond', label: 'Typical conditions', title: 'Typical operating temperature and pressure of this equipment type (literature ranges; the plant models do not carry operating conditions)', get: e => (e.conditions ? `${e.conditions.T}, ${e.conditions.P}` : ''), render: e => (e.conditions ? [UI.el('span', { text: e.conditions.T }), UI.el('span', { class: 'cell-sub', text: e.conditions.P })] : '—') },
      { key: 'flow', label: 'Design kg/h', num: true, title: 'Nameplate throughput (largest of total inlet and outlet mass)', get: e => e.throughputKgPerH.design, render: e => [UI.num(e.throughputKgPerH.design), UI.el('span', { class: 'cell-sub', text: 'avg ' + UI.num(e.throughputKgPerH.average) })] },
      { key: 'kw', label: 'Design kW', num: true, title: 'Electrical load at nameplate', get: e => e.powerKW.design, render: e => (e.machine ? UI.el('span', { class: 'muted', text: 'in ' + e.machine.host }) : e.powerKW.design > 0 ? [UI.num(e.powerKW.design), UI.el('span', { class: 'cell-sub', text: UI.num(e.kWhPerKg) + ' kWh/kg product' })] : '—') },
      { key: 'capex', label: 'Installed $', num: true, get: e => e.capexUsd ?? -1, csv: e => e.capexUsd ?? '', render: e => (e.machine ? UI.el('span', { class: 'muted', text: 'in ' + e.machine.host }) : [UI.usd(e.capexUsd), UI.el('span', { class: 'cell-sub', text: UI.pct(e.capexUsd / total, 0) + ' of plant' })]) },
    ], rows, { sortKey: 'tag', sortDir: 'asc', compact: true, csv: `${pathwayId}-equipment-list` });
  }

  function utilitiesTable(UI, pkg, pathwayId) {
    const u = pkg.utilities;
    const rows = [
      { tag: u.pv.tag, item: 'Solar PV field', size: `${UI.num(u.pv.kWp / 1000)} MWp · ${UI.num(u.pv.landHa)} ha`, note: `${UI.num(u.electricityKWhPerYear / 1e6)} GWh/yr to the plant` },
      u.battery ? { tag: u.battery.tag, item: 'Battery energy storage', size: `${UI.num(u.battery.kWh / 1000)} MWh / ${UI.num(u.battery.kW / 1000)} MW (${UI.num(u.battery.hours, 2)} h)`, note: 'carries the steady units through the night' } : null,
      u.thermal ? { tag: u.thermal.tag, item: 'Thermal energy store', size: `${UI.num(u.thermal.kWh / 1000)} MWh(th) / ${UI.num(u.thermal.kW / 1000)} MW(th) (${UI.num(u.thermal.hours, 2)} h)`, note: 'resistively charged; firms heat-dominated units' } : null,
      ...pkg.buffers.map(b => ({ tag: b.tag, item: `${b.substance} buffer`, size: `${UI.num(b.capacityKg / 1000)} t`, note: b.captive ? 'captive supply buffer' : `${b.inStream ? 'stream ' + b.inStream + ' in at the sun-following rate, ' + b.outStream + ' out steady' : ''}` })),
      ...pkg.captive.map(c => ({ tag: c.tag, item: `Captive ${c.product} supplier`, size: `${UI.num(c.kgPerDay / 1000)} t/day`, note: `${c.supplierId}: ${UI.usdKg(c.makeUsdPerKg)}/kg made vs ${UI.usdKg(c.buyUsdPerKg)} bought` })),
    ].filter(Boolean);
    return UI.sortableTable([
      { key: 'tag', label: 'Tag', get: r => r.tag, render: r => UI.el('strong', { 'data-tag': r.tag, text: r.tag }) },
      { key: 'item', label: 'Item', get: r => r.item },
      { key: 'size', label: 'Size', get: r => r.size },
      { key: 'note', label: 'Duty', get: r => r.note, render: r => UI.el('span', { class: 'muted', text: r.note }) },
    ], rows, { compact: true, csv: `${pathwayId}-utilities` });
  }

  function streamTable(UI, pkg, pathwayId) {
    return UI.sortableTable([
      { key: 'no', label: 'No.', num: true, get: s => s.no, render: s => UI.el('span', { 'data-stream': s.no, text: String(s.no) }) },
      { key: 'line', label: 'Line', title: 'Indicative line number: nominal size (standard pipe size from the design flow, density at the line pressure and typical velocity), fluid code, sequence', get: s => s.lineNumber, render: s => [UI.el('code', { text: s.lineNumber }), s.openIntake ? UI.el('span', { class: 'cell-sub', text: 'open air path, no pipe' }) : s.kind === 'material' && s.phase === 'solid' ? UI.el('span', { class: 'cell-sub', text: 'conveyed' }) : null] },
      { key: 't', label: '°C', num: true, title: 'Temperature as the stream leaves its unit (after that unit’s own cooler or condenser)', get: s => s.T_C ?? NaN, render: s => (s.T_C != null ? UI.num(s.T_C) : '—') },
      { key: 'p', label: 'bar', num: true, title: 'Line pressure: the upstream unit’s typical outlet pressure, or the receiving unit’s after a compressor or pump', get: s => s.pressureBar ?? NaN, render: s => (s.pressureBar != null ? UI.num(s.pressureBar) : '—') },
      { key: 'from', label: 'From → to', get: s => s.fromTag + ' → ' + s.toTag },
      { key: 'phase', label: 'Phase', get: s => s.phase },
      { key: 'avg', label: 'Average', csvLabel: 'Average (kg/h; heat kW)', num: true, get: s => s.average, render: s => UI.num(s.average) + (s.kind === 'heat' ? ' kW' : ' kg/h') },
      { key: 'design', label: 'Design', csvLabel: 'Design (kg/h; heat kW)', num: true, title: 'At nameplate: sun-following units run above the average to make the day’s output in the sun hours', get: s => s.design, render: s => UI.num(s.design) + (s.kind === 'heat' ? ' kW' : ' kg/h') },
      { key: 'year', label: 'Per year', csvLabel: 'Per year (t; heat MWh)', num: true, get: s => s.perYear / 1000, render: s => UI.num(s.perYear / 1000) + (s.kind === 'heat' ? ' MWh' : ' t') },
      { key: 'comp', label: 'Composition (mass)', get: s => s.composition.map(([k, f]) => `${k} ${(f * 100).toFixed(1)}%`).join(', '), render: s => UI.el('span', { class: 'muted', text: s.composition.map(([k, f]) => `${sub(k)} ${UI.pct(f, 0)}`).join(', ') || '—' }) },
    ], pkg.streams, { sortKey: 'no', sortDir: 'asc', compact: true, limit: 14, csv: `${pathwayId}-stream-table` });
  }

  function instrumentTable(UI, pkg, pathwayId) {
    const kind = i => (i.interlock ? 'interlock' : i.safety ? 'safety' : i.alarm ? 'alarm' : /C$/.test(i.letters) ? 'control loop' : 'indication');
    return UI.sortableTable([
      { key: 'tag', label: 'Tag', get: i => i.tag, render: i => UI.el('code', { text: i.tag }) },
      { key: 'kind', label: 'Function', get: kind },
      { key: 'service', label: 'Service', get: i => i.service },
      { key: 'eq', label: 'On', get: i => i.equipment || (i.stream ? 'stream ' + i.stream : '') },
    ], pkg.instruments, { compact: true, limit: 12, csv: `${pathwayId}-instrument-index` });
  }

  // ------------------------------------------------------------------ TEA blocks
  const GROUP_LABEL = { equipment: 'Process equipment', storage: 'Storage', energy: 'Solar PV', land: 'Land', captive: 'Captive suppliers' };
  const GROUP_COLOR = { equipment: 'var(--series-1)', storage: 'var(--series-7)', energy: 'var(--series-4)', land: 'var(--series-3)', captive: 'var(--series-5)' };

  function capexBlock(UI, pkg, pathwayId) {
    const { el } = UI;
    const items = pkg.tea.capexItems.filter(i => Math.abs(i.usd) > 0);
    const total = pkg.tea.capexTotal;
    const groups = {};
    for (const i of items) groups[i.group] = (groups[i.group] || 0) + i.usd;
    const stack = el('div', { class: 'pl-stack', role: 'img', 'aria-label': 'Capital cost by group: ' + Object.entries(groups).map(([g, v]) => `${GROUP_LABEL[g]} ${UI.pct(v / total, 0)}`).join(', ') });
    for (const [g, v] of Object.entries(groups).sort((a, b) => b[1] - a[1])) {
      const seg = el('span', { title: `${GROUP_LABEL[g]}: ${UI.usd(v)} (${UI.pct(v / total, 0)})` });
      seg.style.width = Math.max(0.5, (v / total) * 100) + '%';
      seg.style.background = GROUP_COLOR[g];
      stack.append(seg);
    }
    return [
      stack,
      UI.legend(Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([g, v]) => ({ label: `${GROUP_LABEL[g]} ${UI.pct(v / total, 0)}`, color: GROUP_COLOR[g] }))),
      UI.sortableTable([
        { key: 'item', label: 'Item', get: i => i.label, render: i => [el('span', { text: i.label }), i.tag ? el('span', { class: 'cell-sub', text: i.tag }) : null] },
        { key: 'group', label: 'Group', get: i => GROUP_LABEL[i.group] },
        { key: 'usd', label: 'Installed $', num: true, get: i => i.usd, render: i => UI.usd(i.usd) },
        { key: 'share', label: 'Share', num: true, get: i => i.usd / total, render: i => UI.pct(i.usd / total, 0) },
      ], items, { sortKey: 'usd', sortDir: 'desc', compact: true, limit: 8, csv: `${pathwayId}-capex` }),
      el('p', { class: 'muted pl-foot', text: `Total installed capital ${UI.usd(total)} · ${UI.usd(pkg.tea.capexPerAnnualT)} per t/yr of output. Installed costs from the recipe’s capex packs at this size, site and year, after learning; each class is shared among its units by recipe capex × solar oversizing.` }),
    ];
  }

  function accountBlock(UI, pkg) {
    const { el } = UI;
    const t = pkg.tea;
    const row = (label, usd, cls, subText) => el('tr', { class: cls || null }, [
      el('th', { scope: 'row' }, [label, subText ? el('span', { class: 'cell-sub', text: subText }) : null]),
      el('td', { class: 'num', text: UI.usd(usd) }),
      el('td', { class: 'num', text: pkg.basis.annualKg > 0 ? UI.usdKg(usd / pkg.basis.annualKg) : '—' }),
    ]);
    return el('div', { class: 'table-scroll' }, el('table', { class: 'data-table compact pl-account' }, [
      el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Per year' }), el('th', { scope: 'col', class: 'num', text: '$/yr' }), el('th', { scope: 'col', class: 'num', text: '$/kg product' })])),
      el('tbody', {}, [
        ...t.revenueLines.map(l => row(l.label, l.usd, 'is-rev', l.kgPerYear ? `${UI.tonnes(l.kgPerYear / 1000)} at ${UI.usdKg(l.usdPerKg)}/kg` : null)),
        row('Revenue', t.revenueTotal, 'is-total'),
        ...t.opexLines.map(l => row(l.label, -l.usd, 'is-cost', l.kgPerYear ? `${UI.tonnes(l.kgPerYear / 1000)} at ${UI.usdKg(l.usdPerKg)}/kg` : null)),
        row('Operating cost', -t.opexTotal, 'is-total'),
        row('Operating cash', t.annualCash, 'is-total is-cash'),
        row('Capital recovery', -t.capexTotal * t.crf, 'is-cost', `${UI.pct(pkg.basis.discountRate, 0)} over ${UI.num(pkg.basis.lifeYears, 2)} yr (CRF ${UI.num(t.crf, 3)})`),
        row('Margin after capital', t.annualCash - t.capexTotal * t.crf, 'is-total ' + (t.annualCash - t.capexTotal * t.crf >= 0 ? 'is-pos' : 'is-neg')),
      ]),
    ]));
  }

  // Waterfall of cost per kg by driver, ending at the net cost, with the price for reference.
  function waterfall(UI, pkg) {
    const { el } = UI;
    const t = pkg.tea;
    const rows = t.lcop.filter(r => Math.abs(r.usdPerKg) > 1e-9);
    let cum = 0;
    const bars = rows.map(r => {
      const from = cum;
      cum += r.usdPerKg;
      return { label: r.label, from, to: cum, v: r.usdPerKg };
    });
    bars.push({ label: 'Net cost', from: 0, to: t.lcopUsdPerKg, v: t.lcopUsdPerKg, total: true });
    bars.push({ label: 'Price', from: 0, to: t.priceUsdPerKg, v: t.priceUsdPerKg, price: true });
    const lo = Math.min(0, ...bars.map(b => Math.min(b.from, b.to)));
    const hi = Math.max(...bars.map(b => Math.max(b.from, b.to)), 1e-9);
    const span = hi - lo;
    return el('div', { class: 'pl-waterfall', role: 'list' }, bars.map(b => {
      const left = ((Math.min(b.from, b.to) - lo) / span) * 100;
      const w = Math.max(0.6, (Math.abs(b.to - b.from) / span) * 100);
      const fill = el('span', { class: 'pl-wf-fill' + (b.total ? ' is-total' : b.price ? ' is-price' : b.v < 0 ? ' is-credit' : '') });
      fill.style.left = left + '%';
      fill.style.width = w + '%';
      return el('div', { class: 'pl-wf-row', role: 'listitem' }, [
        el('span', { class: 'pl-wf-label', text: b.label }),
        el('span', { class: 'pl-wf-track' }, fill),
        el('span', { class: 'pl-wf-value', text: (b.v < 0 ? '−' : b.total || b.price ? '' : '+') + UI.usdKg(Math.abs(b.v)).replace('−', '') }),
      ]);
    }));
  }

  function tornado(UI, pkg) {
    const { el } = UI;
    const s = pkg.tea.sensitivity;
    if (!s.rows.length) return el('p', { class: 'muted', text: 'No lever moves this plant’s value.' });
    const base = s.base.npv;
    const ext = Math.max(...s.rows.flatMap(r => [Math.abs(r.low.npv - base), Math.abs(r.high.npv - base)]), 1e-9);
    const bar = (v, side) => {
      const d = v - base;
      const span = el('span', { class: 'pl-tn-fill ' + (d >= 0 ? 'is-up' : 'is-down') + ' is-' + side });
      const w = (Math.abs(d) / ext) * 50;
      span.style.width = w + '%';
      span.style.left = (d >= 0 ? 50 : 50 - w) + '%';
      return span;
    };
    const pctS = Math.round(s.swing * 100);
    return el('div', {}, [
      el('div', { class: 'pl-tornado', role: 'list' }, [
        el('div', { class: 'pl-tn-row is-head' }, [el('span', { text: 'Lever' }), el('span', { class: 'pl-tn-axis', text: `NPV ${UI.usd(base)} at base` }), el('span', { class: 'num', text: `Net cost −${pctS}% / +${pctS}%` })]),
        ...s.rows.map(r => el('div', { class: 'pl-tn-row', role: 'listitem', title: `${r.label} −${pctS}%: NPV ${UI.usd(r.low.npv)}, net cost ${UI.usdKg(r.low.lcop)}/kg · +${pctS}%: NPV ${UI.usd(r.high.npv)}, net cost ${UI.usdKg(r.high.lcop)}/kg` }, [
          el('span', { class: 'pl-tn-label', text: r.label }),
          el('span', { class: 'pl-tn-track' }, [bar(r.low.npv, 'low'), bar(r.high.npv, 'high'), el('i', { class: 'pl-tn-mid' })]),
          el('span', { class: 'pl-tn-value', text: `${UI.usdKg(r.low.lcop)} / ${UI.usdKg(r.high.lcop)}` }),
        ])),
      ]),
      el('div', { class: 'pl-tn-key' }, [el('span', {}, [el('i', { class: 'is-low' }), `lever −${pctS}%`]), el('span', {}, [el('i', { class: 'is-high' }), `lever +${pctS}%`]), el('span', { class: 'muted', text: 'design held fixed; bars show the change in NPV' })]),
    ]);
  }

  // ------------------------------------------------------------------ mount
  function mount(root, ctx) {
    const { Store, UI, href, params } = ctx;
    const { el } = UI;
    const path = params.path || [];
    const pathwayId = path[1] && path[1] !== '_' ? path[1] : DEFAULT_PATHWAY;
    const pathway = Store.pathwayById.get(pathwayId);
    const crumbs = el('div', { class: 'crumbs' }, [el('a', { href: href('pathways'), text: 'Pathways' }), ' / ',
      pathway ? el('a', { href: href('pathways', pathway.id), text: pathway.id }) : pathwayId, ' / plant design']);
    if (!pathway) {
      root.append(crumbs, el('div', { class: 'empty' }, [`No pathway “${pathwayId}”. `, el('a', { href: planHref(Store, DEFAULT_PATHWAY), text: 'Open the green ammonia plant' })]));
      return null;
    }
    const multiple = Number(path[3]) > 0 ? Number(path[3]) : Store.RANK_SIZE_MULTIPLE;
    const askedYear = Number(path[4]) > 0 ? Math.round(Number(path[4])) : null;

    const head = el('div', { class: 'view-title' }, [el('h1', { text: 'Plant design: ' + UI.pathwayLabel(pathway) })]);
    const intro = el('p', { class: 'pl-intro' });
    const controls = el('div', { class: 'pl-controls' });
    const kpis = el('div', { class: 'kpis pl-kpis' });
    const pidHost = el('div', { class: 'pl-pid-scroll' });
    const dlBtn = el('button', { type: 'button', class: 'link-button', text: 'Download SVG' });
    const pidLegend = el('div', { class: 'pl-legend' }, [
      el('span', {}, [el('i', { class: 'pl-key is-line' }), 'process line']),
      el('span', {}, [el('i', { class: 'pl-key is-product' }), 'product']),
      el('span', {}, [el('i', { class: 'pl-key is-power' }), 'power']),
      el('span', {}, [el('i', { class: 'pl-key is-signal' }), 'instrument signal']),
      el('span', {}, [el('i', { class: 'pl-key is-diamond' }), 'stream no.']),
      el('span', { class: 'muted', text: 'hover lines, bubbles and units for detail' }),
    ]);
    const equipHost = el('div');
    const utilHost = el('div');
    const streamHost = el('div');
    const instHost = el('div');
    const capexHost = el('div');
    const accountHost = el('div');
    const wfHost = el('div');
    const cashHost = el('div');
    const cashNote = el('p', { class: 'muted pl-foot' });
    const tornadoHost = el('div');
    const scaleHost = el('div');
    root.append(
      crumbs, head, intro, controls, kpis,
      UI.card('P&ID', 'piping and instrumentation diagram at nameplate; tags, stream numbers and control loops match the tables below', [pidLegend, pidHost], dlBtn),
      el('div', { class: 'grid grid-2 pl-grid' }, [
        UI.card('Equipment list', 'every unit in the solved flowsheet, upstream to downstream', equipHost),
        UI.card('Utilities and storage', 'what the site-specific solar design adds', utilHost),
      ]),
      el('div', { class: 'grid grid-2 pl-grid' }, [
        UI.card('Stream table', 'average over the year and design (nameplate) rates', streamHost),
        UI.card('Instrument index', 'typical control scheme by unit type: indicative, not a HAZOP’d design', instHost),
      ]),
      el('h2', { class: 'pl-section', text: 'Techno-economic analysis' }),
      el('div', { class: 'grid grid-2 pl-grid' }, [
        UI.card('Capital cost', 'installed, by item', capexHost),
        UI.card('Operating account', 'a typical year at the average output', accountHost),
      ]),
      el('div', { class: 'grid grid-2 pl-grid' }, [
        UI.card('Cost per kg by driver', 'levelized; capital at the discount rate over the plant life', wfHost),
        UI.card('Cash flow', 'project basis: unlevered, real, no tax', [cashHost, cashNote]),
      ]),
      el('div', { class: 'grid grid-2 pl-grid' }, [
        UI.card('Sensitivity', 'one lever at a time, ±25%', tornadoHost),
        UI.card('Scale', 'the same plant at the sizes the company can build; click a row to redesign at that size', scaleHost),
      ]),
      el('p', { class: 'muted pl-foot pl-caveat', text: 'Screening-level package. Equipment, PV, storage and land are the simulator’s installed costs at this site, size and year-0 cost factors, itemized; every line sums to the plant evaluation used by the company run. Streams are the solved flowsheet at the screening cases’ ambient conditions (temperature and pressure are not modelled). Instrumentation and interlocks are a typical scheme generated from unit types, for reading the design, not for engineering it.' }),
    );

    // Tables ↔ drawing: hovering a table row lights its item or stream on the P&ID; clicking an item or
    // line on the P&ID brings its table row into view.
    const keyOf = node => {
      const t = node?.closest?.('[data-tag], [data-stream]');
      if (!t) return null;
      return t.dataset.tag ? `[data-tag="${CSS.escape(t.dataset.tag)}"]` : `[data-stream="${CSS.escape(t.dataset.stream)}"]`;
    };
    const lit = new Set();
    const unlight = () => { for (const n of lit) n.classList.remove('is-lit'); lit.clear(); };
    root.addEventListener('mouseover', ev => {
      const row = ev.target.closest?.('.pl-grid tr');
      if (!row) return;
      unlight();
      const sel = keyOf(row.querySelector('[data-tag], [data-stream]'));
      if (!sel) return;
      for (const n of pidHost.querySelectorAll(sel)) { n.classList.add('is-lit'); lit.add(n); }
    });
    root.addEventListener('mouseout', ev => { if (ev.target.closest?.('.pl-grid tr') && !ev.relatedTarget?.closest?.('.pl-grid tr')) unlight(); });
    pidHost.addEventListener('click', ev => {
      if (ev.target.closest('a')) return;
      const sel = keyOf(ev.target);
      if (!sel) return;
      const cell = root.querySelector('.pl-grid tbody ' + sel);
      const row = cell?.closest('tr');
      if (!row) return;
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.classList.remove('is-flash');
      void row.offsetWidth;
      row.classList.add('is-flash');
    });

    let lastKey = null;
    let current = null;
    dlBtn.addEventListener('click', () => {
      const node = pidHost.querySelector('svg.pid');
      if (node && current) UI.downloadFile(`${current.pathway.id}-${current.siteId}-pid.svg`, exportSvg(node), 'image/svg+xml');
    });

    const draw = () => {
      const input = simInput(Store);
      const cfg = Company.mergeConfig(input.config);
      // Year: the first year needs no company run; a later year takes the run's cost factors that
      // year (learning on its own deployment, exogenous decline, the idiot-index squeeze).
      const lastYear = cfg.startYear + cfg.years - 1;
      const year = askedYear ? Math.min(lastYear, Math.max(cfg.startYear, askedYear)) : cfg.startYear;
      const yearIndex = year - cfg.startYear;
      const result = Store.result && !Store.busy && !Store.stale ? Store.result : null;
      const key = Store.toQuery(Store.scenario) + '|' + year + '|' + (result ? result.ms + ':' + result.plants.length : '');
      if (key === lastKey) return;
      lastKey = key;
      if (yearIndex > 0 && !result?.timeline?.[yearIndex]) {
        // Keep what is drawn but mark it out of date until the run for this scenario is in.
        root.classList.add('pl-waiting');
        kpis.replaceChildren(el('p', { class: 'empty', text: `Simulating the company run for ${year} costs…` }));
        return;
      }
      root.classList.remove('pl-waiting');
      const row = yearIndex > 0 ? result.timeline[yearIndex] : null;
      const yearOpts = row ? { costFactors: row.costFactors, rawFactors: row.rawFactors, storagePrices: row.storagePrices, pvUsdPerKWp: row.pvCapexUsdPerKWp } : {};
      const sizes = cfg.build.sizeMultiples.map(m => ({ m, kg: Math.min(m * pathway.refOutputKgPerDay, cfg.build.maxPlantKgPerDay) }));
      const size = Math.min(multiple * pathway.refOutputKgPerDay, cfg.build.maxPlantKgPerDay);
      const sites = [];
      for (const site of Store.SITES) {
        const ev = Company.evaluateAtYear(input, pathway.id, site.id, size, yearIndex, yearOpts);
        if (ev) sites.push({ site, ev });
      }
      sites.sort((a, b) => a.ev.lcopUsdPerKg - b.ev.lcopUsdPerKg);
      if (!sites.length) {
        controls.replaceChildren();
        kpis.replaceChildren();
        pidHost.replaceChildren(el('p', { class: 'empty', text: 'No site in the catalog can host this pathway.' }));
        return;
      }
      const siteId = sites.some(s => s.site.id === path[2]) ? path[2] : sites[0].site.id;
      const built = PlantDesign.forPlant(Company, input, pathway.id, siteId, size, yearIndex, yearOpts);
      const { pkg, ev } = built;
      current = { pathway, siteId, pkg };
      const site = Store.siteById.get(siteId);

      // Controls: pathway, site, size.
      const pwSel = el('select', { 'aria-label': 'Pathway' }, Store.PATHWAYS.map(p => el('option', { value: p.id, selected: p.id === pathway.id ? true : null, text: UI.pathwayLabel(p) + ' · ' + UI.productName(p.product) })));
      pwSel.addEventListener('change', () => { location.hash = planHref(Store, pwSel.value, null, multiple, askedYear); });
      const siteSel = el('select', { 'aria-label': 'Site' }, sites.map((s, i) => el('option', { value: s.site.id, selected: s.site.id === siteId ? true : null, text: `${s.site.name} · ${UI.usdKg(s.ev.lcopUsdPerKg)}/kg${i === 0 ? ' (cheapest)' : ''}` })));
      siteSel.addEventListener('change', () => { location.hash = planHref(Store, pathway.id, siteSel.value, multiple, askedYear); });
      const sizeSel = el('select', { 'aria-label': 'Plant size' }, sizes.map(s => el('option', { value: s.m, selected: s.m === multiple ? true : null, text: `${UI.tonnes(s.kg * 365 / 1000)}/yr (${s.m}× reference)` })));
      if (!sizes.some(s => s.m === multiple)) sizeSel.prepend(el('option', { value: multiple, selected: true, text: `${UI.tonnes(size * 365 / 1000)}/yr (${multiple}× reference)` }));
      sizeSel.addEventListener('change', () => { location.hash = planHref(Store, pathway.id, siteId, sizeSel.value, askedYear); });
      // Cost year: net cost at this site and size each year of the run (when the run is in hand),
      // so the list shows when the plant turns feasible.
      const yearCosts = new Map();
      if (result) {
        result.timeline.forEach((r, i) => {
          const e = i === yearIndex ? ev : Company.evaluateAtYear(input, pathway.id, siteId, size, i,
            i === 0 ? {} : { costFactors: r.costFactors, rawFactors: r.rawFactors, storagePrices: r.storagePrices, pvUsdPerKWp: r.pvCapexUsdPerKWp });
          if (e) yearCosts.set(cfg.startYear + i, e);
        });
      }
      const yearSel = el('select', { 'aria-label': 'Cost year' }, Array.from({ length: cfg.years }, (_, i) => {
        const y = cfg.startYear + i;
        const e = yearCosts.get(y);
        const cost = e ? ` · ${UI.usdKg(e.lcopUsdPerKg)}/kg${e.lcopUsdPerKg <= e.priceUsdPerKg ? ' ✓' : ''}` : '';
        return el('option', { value: y, selected: y === year ? true : null, text: (i === 0 ? `${y} (today’s costs)` : String(y)) + cost });
      }));
      yearSel.addEventListener('change', () => { location.hash = planHref(Store, pathway.id, siteId, multiple, Number(yearSel.value) === cfg.startYear ? null : yearSel.value); });
      controls.replaceChildren(
        el('label', {}, [el('span', { text: 'Recipe' }), pwSel]),
        el('label', {}, [el('span', { text: 'Site' }), siteSel]),
        el('label', {}, [el('span', { text: 'Nameplate' }), sizeSel]),
        el('label', { title: 'Later years use the company run’s cost factors for that year: learning on its own deployment, exogenous decline and the idiot-index squeeze. ✓ = net cost at or below price.' }, [el('span', { text: 'Cost year' }), yearSel]),
        el('a', { class: 'pl-back', href: href('pathways', pathway.id), text: 'Recipe and best sites →' }),
      );
      const b = pkg.basis;
      intro.replaceChildren(
        `${pathway.name}, designed for `, el('a', { href: href('sites', siteId), text: site?.name || siteId }),
        ` (${UI.num(site?.pvKWhPerKWpDay)} kWh/kWp·day of sun) at ${UI.tonnes(b.sizeKgPerDay / 1000)}/day nameplate, ${year} costs${yearIndex > 0 ? ' from the company run' : ''}. `,
        b.strategy === 'sun-following'
          ? `Sun-following units run ${UI.num(b.flexFullLoadHoursPerDay, 2)} full-load hours a day at ${UI.num(b.flexNameplateFactor, 2)}× a 24-hour plant’s nameplate; steady units are firmed by storage. `
          : b.strategy === 'firmed' ? 'Every unit runs around the clock on PV plus storage. ' : '',
        `Output averages ${UI.pct(b.outputFactor, 0)} of nameplate.`,
      );

      const t = pkg.tea;
      kpis.replaceChildren(
        UI.kpi('Output', UI.tonnes(b.annualKg / 1000) + '/yr', `${pkg.equipment.length} units · ${pkg.streams.length} streams · ${pkg.instruments.length} instruments`),
        UI.kpi('Capital', UI.usd(t.capexTotal), `${UI.usd(t.capexPerAnnualT)} per t/yr`),
        UI.kpi('Net cost', UI.usdKg(t.lcopUsdPerKg) + '/kg', `price ${UI.usdKg(t.priceUsdPerKg)}/kg · gross ${UI.usdKg(t.grossCostUsdPerKg)}`),
        UI.kpi('NPV', UI.usd(t.npv), `at ${UI.pct(b.discountRate, 0)}, ${UI.num(b.lifeYears, 2)}-yr life`),
        UI.kpi('IRR', t.irr == null ? 'none' : UI.pct(t.irr, 1), t.irr == null ? 'cash never repays capital' : (t.irr >= b.discountRate ? 'clears the hurdle' : 'below the hurdle')),
        UI.kpi('Payback', t.paybackYears == null ? 'never' : UI.num(t.paybackYears, 2) + ' yr', t.discountedPaybackYears == null ? 'not within life, discounted' : `${UI.num(t.discountedPaybackYears, 2)} yr discounted`),
      );
      for (const k of kpis.querySelectorAll('.kpi')) k.classList.add('sim-result');

      pidHost.replaceChildren(drawPid(UI, Store, pathway, pkg));
      equipHost.replaceChildren(equipmentTable(UI, pkg, pathway.id));
      utilHost.replaceChildren(utilitiesTable(UI, pkg, pathway.id));
      streamHost.replaceChildren(streamTable(UI, pkg, pathway.id));
      instHost.replaceChildren(instrumentTable(UI, pkg, pathway.id));
      capexHost.replaceChildren(...capexBlock(UI, pkg, pathway.id));
      accountHost.replaceChildren(accountBlock(UI, pkg));
      wfHost.replaceChildren(waterfall(UI, pkg));
      tornadoHost.replaceChildren(tornado(UI, pkg));

      const years = t.cashflow.map(c => year + c.year);
      cashHost.replaceChildren(ctx.Charts.chartBlock({
        x: years, kind: 'line', yFormat: UI.usd, endLabels: true,
        series: [
          { key: 'cum', label: 'Cumulative cash', color: 'var(--series-1)', values: t.cashflow.map(c => c.cumulative) },
          { key: 'disc', label: 'Discounted', color: 'var(--series-2)', values: t.cashflow.map(c => c.cumulativeDiscounted) },
        ],
        xMarks: t.paybackYears != null ? [{ index: Math.min(t.cashflow.length - 1, Math.ceil(t.paybackYears)), label: 'payback' }] : [],
        ariaLabel: `Cumulative cash flow of the plant over ${UI.num(b.lifeYears, 2)} years`,
      }));
      cashNote.textContent = `Capital ${UI.usd(t.capexTotal)} spent in ${years[0]}; ${b.leadTimeYears ? b.leadTimeYears + ' year' + (b.leadTimeYears > 1 ? 's' : '') + ' to build, then ' : ''}${UI.usd(t.annualCash)} a year of operating cash. The discounted curve ends at the NPV.`;

      // Scale table.
      const scaleRows = sizes.map(s => {
        const e = s.kg === size ? ev : Company.evaluateAtYear(input, pathway.id, siteId, s.kg, yearIndex, yearOpts);
        return e ? { ...s, ev: e } : null;
      }).filter(Boolean);
      scaleHost.replaceChildren(UI.sortableTable([
        { key: 'cap', label: 'Nameplate', num: true, get: r => r.kg, render: r => [r.m === multiple ? el('strong', { text: UI.tonnes(r.kg * 365 / 1000) + '/yr' }) : UI.tonnes(r.kg * 365 / 1000) + '/yr', el('span', { class: 'cell-sub', text: r.m + '× reference' })] },
        { key: 'capex', label: 'Capital', num: true, get: r => r.ev.capex.total, render: r => UI.usd(r.ev.capex.total) },
        { key: 'spec', label: '$ per t/yr', num: true, get: r => r.ev.capex.total / (r.ev.annualKg / 1000), render: r => UI.usd(r.ev.capex.total / (r.ev.annualKg / 1000)) },
        { key: 'cost', label: 'Net cost', num: true, get: r => r.ev.lcopUsdPerKg, render: r => UI.usdKg(r.ev.lcopUsdPerKg) },
        { key: 'npv', label: 'NPV', num: true, get: r => r.ev.npv, render: r => el('span', { class: r.ev.npv >= 0 ? 'is-pos' : 'is-neg', text: UI.usd(r.ev.npv) }) },
      ], scaleRows, { sortKey: 'cap', sortDir: 'asc', compact: true, rowHref: r => planHref(Store, pathway.id, siteId, r.m, askedYear), rowClass: r => (r.m === multiple ? 'is-current' : null), csv: `${pathway.id}-scale` }));
    };
    draw();
    return Store.subscribe(draw);
  }

  globalThis.Views.plant = {
    title: 'Plant design',
    // The first year needs no run; the run (in a worker) fills in later years' costs.
    needsSimulation: true,
    mount,
  };
})();
