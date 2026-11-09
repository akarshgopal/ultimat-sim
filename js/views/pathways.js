// Pathways view: every per-kg recipe (data/pathways.js) — a sortable list (#/pathways) and a
// detail page per pathway (#/pathways/<id>) with its recipe, cost vs year at its best site,
// best sites, plants built in the current run and a read-only flowsheet diagram.
(() => {
  'use strict';
  const Company = globalThis.FoundryCompany;
  const RANK_SIZE_MULTIPLE = 10; // Store.rank default: plants at 10× the case's reference output

  // ------------------------------------------------------------------ shared data
  // The utilization design behind a plant's cost: sun-following vs firmed, equipment oversizing,
  // storage and buffers, and how much of nameplate output it delivers over the year.
  function operationOnSolar(UI, rank) {
    const { el } = UI;
    const u = rank?.utilization;
    if (!u) {
      return el('p', { class: 'muted', text: rank ? 'This recipe has no flowsheet, so it is costed on 24 h-average energy.' : 'No compatible site.' });
    }
    const perTpd = kWh => UI.num(kWh / (rank.sizeKgPerDay / 1000)) + ' kWh per t/day';
    const rows = [
      ['Strategy', u.strategy === 'sun-following'
        ? 'Sun-following: flexible units run when the sun shines; steady units are firmed by storage'
        : 'Firmed: every unit runs around the clock on PV + storage'],
      ['Output vs nameplate', UI.pct(u.outputFactor, 0) + (u.outputFactor < 0.995 ? ' (steady units turn down in low-sun months)' : '')],
      u.flexFullLoadHoursPerDay != null && u.flexFullLoadHoursPerDay < 24
        ? ['Flexible units', `${UI.num(u.flexFullLoadHoursPerDay, 2)} full-load h/day → ${UI.num(u.flexNameplateFactor, 2)}× the nameplate of a 24 h plant`]
        : null,
      u.batteryKWh > 0 ? ['Battery', perTpd(u.batteryKWh)] : null,
      u.thermalKWh > 0 ? ['Thermal store', perTpd(u.thermalKWh) + ' (heat-dominated units)'] : null,
      ...(u.buffers || []).filter(b => b.kg > 0).map(b => ['Buffer', `${b.substance}: ${UI.num(b.kg / (rank.sizeKgPerDay / 1000))} kg per t/day of capacity (${UI.usd(b.usd)})`]),
      ...(rank.integration || []).filter(i => i.bufferKg > 0).map(i => ['Buffer', `captive ${UI.shortName(i.product)}: ${UI.num(i.bufferKg / (rank.sizeKgPerDay / 1000))} kg per t/day (${UI.usd(i.bufferUsd)})`]),
      ['Storage capex', `${UI.usd(u.storageUsd)} of ${UI.usd(rank.capex.total)} total`],
    ].filter(Boolean);
    const alt = (u.alternatives || []).filter(a => a.strategy !== u.strategy);
    return el('div', {}, [
      el('table', { class: 'data-table compact' }, el('tbody', {}, rows.map(([k, v]) => el('tr', {}, [el('th', { scope: 'row', text: k }), el('td', { text: v })])))),
      alt.length ? el('p', { class: 'muted pw-foot', text: `Cheaper than ${alt.map(a => a.strategy).join(', ')} by ${UI.pct(alt[0].capexPerOutput / Math.max(1, (u.alternatives.find(a => a.strategy === u.strategy) || {}).capexPerOutput || 1) - 1, 0)} capex per unit of output.` }) : null,
    ]);
  }

  // Year-0 ranking rows keyed by pathway id, memoized per scenario.
  let rankCache = { key: null, rows: null };
  function rankById(Store) {
    const key = Store.toQuery(Store.scenario);
    if (rankCache.key !== key) {
      rankCache = { key, rows: new Map(Store.rank(RANK_SIZE_MULTIPLE).map(r => [r.pathwayId, r])) };
    }
    return rankCache.rows;
  }

  function plantsByPathway(result) {
    const map = new Map();
    for (const plant of result?.plants || []) {
      if (!map.has(plant.pathwayId)) map.set(plant.pathwayId, []);
      map.get(plant.pathwayId).push(plant);
    }
    return map;
  }

  const STATUS = {
    built: { label: 'Built', title: 'The current simulation builds plants of this pathway.' },
    feasible: { label: 'Feasible', title: 'Positive margin at its best site today, but the simulation built none (budget, market share or better options).' },
    infeasible: { label: 'Not feasible', title: 'Levelized cost above price at its best site in year 0.' },
    excluded: { label: 'Excluded', title: 'Excluded by the scenario (switched off, or a feed origin is disallowed).' },
  };
  const STATUS_ORDER = { built: 0, feasible: 1, infeasible: 2, excluded: 3 };

  function statusOf(Store, pathway, rank, plants) {
    if (!Store.pathwayAllowed(pathway, Store.scenario)) return 'excluded';
    if (plants?.length) return 'built';
    if (rank && rank.marginUsdPerKg > 0) return 'feasible';
    return 'infeasible';
  }

  function statusTag(UI, status) {
    const s = STATUS[status];
    return UI.el('span', { class: 'tag pw-status', 'data-status': status, title: s.title, text: s.label });
  }

  // "Green ammonia (SWRO + PEM …)" → ["Green ammonia", "SWRO + PEM …"]
  function splitName(name) {
    const m = /^(.*?)\s*\((.*)\)\s*$/.exec(name || '');
    return m ? [m[1], m[2]] : [name, null];
  }

  function feedOrigins(pathway) {
    const seen = [];
    for (const feed of pathway.feeds || []) if (!seen.includes(feed.origin)) seen.push(feed.origin);
    return seen;
  }

  const pct0 = v => (Number.isFinite(v) ? Math.round(v * 100) + '%' : '—');
  const humanId = id => String(id || '').replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());

  // ------------------------------------------------------------------ list
  function mountList(root, ctx) {
    const { Store, UI, href } = ctx;
    const { el } = UI;
    const state = { q: '', origin: '', builtOnly: false, sortKey: 'margin', sortDir: 'desc' };
    try {
      const saved = JSON.parse(sessionStorage.getItem('foundry.pathways.filters') || 'null');
      if (saved) Object.assign(state, saved);
    } catch { /* storage unavailable */ }
    const save = () => {
      try { sessionStorage.setItem('foundry.pathways.filters', JSON.stringify(state)); } catch { /* ignore */ }
    };

    const kpis = el('div', { class: 'kpis pw-kpis' });
    const search = el('input', { class: 'control', type: 'search', placeholder: 'Search product or pathway', 'aria-label': 'Search pathways', value: state.q });
    const origin = el('select', { class: 'control', 'aria-label': 'Feed origin' }, [
      el('option', { value: '', text: 'All feed origins' }),
      ...UI.ORIGINS.map(o => el('option', { value: o.id, text: o.label })),
    ]);
    origin.value = state.origin;
    const builtOnly = el('input', { type: 'checkbox', checked: state.builtOnly });
    const count = el('span', { class: 'muted pw-count' });
    const filters = el('div', { class: 'pw-filters' }, [
      search, origin,
      el('label', { class: 'check' }, [builtOnly, el('span', { text: 'Built only' })]),
      count,
    ]);
    const tableHost = el('div', { class: 'pw-table' });
    const titleNote = el('p');
    root.append(
      el('div', { class: 'view-title' }, [el('h1', { text: 'Pathways' }), titleNote]),
      kpis,
      el('section', { class: 'card pw-list-card' }, [filters, tableHost]),
    );

    let rows = [];
    const columns = [
      {
        key: 'name', label: 'Pathway', get: r => r.name,
        render: r => {
          const [main, sub] = splitName(r.name);
          return el('div', { class: 'pw-name' }, [
            el('a', { href: href('pathways', r.id), text: main }),
            el('span', { class: 'cell-sub', text: sub ? sub : r.id }),
          ]);
        },
      },
      {
        key: 'product', label: 'Product', get: r => UI.productName(r.product),
        render: r => el('div', { class: 'pw-product' }, [
          el('span', { text: UI.productName(r.product) }),
          UI.qualityTag(Store.MARKETS[r.product]?.quality),
        ]),
      },
      {
        key: 'feeds', label: 'Feeds', title: 'Feed origins and the share of feed mass from quasi-infinite sources', get: r => r.infinite,
        render: r => el('div', { class: 'pw-origins' }, [
          ...r.origins.map(o => el('span', { class: 'pw-chip', title: UI.originLabel(o) }, [UI.originDot(o), el('span', { text: UI.originLabel(o) })])),
          el('span', { class: 'cell-sub', text: pct0(r.infinite) + ' infinite' }),
        ]),
      },
      { key: 'kwh', label: 'kWh/kg', num: true, get: r => r.kWh, render: r => UI.num(r.kWh) },
      {
        key: 'cost', label: 'Cost $/kg', num: true, title: 'Levelized cost net of co-product credit (gross below) at the best site, year 0', get: r => r.cost,
        render: r => r.rank ? [UI.usdKg(r.cost), el('span', { class: 'cell-sub', text: r.rank.coproductCreditUsdPerKg > 0 ? 'gross ' + UI.usdKg(r.rank.grossCostUsdPerKg) : '' })] : '—',
      },
      { key: 'price', label: 'Price', num: true, get: r => r.price, render: r => UI.usdKg(r.price) },
      {
        key: 'margin', label: 'Margin', num: true, title: 'Price minus net cost, as share of price', get: r => r.marginShare,
        render: r => r.rank ? [
          el('span', { class: r.margin >= 0 ? 'is-pos' : 'is-neg', text: UI.usdKg(r.margin) }),
          el('span', { class: 'cell-sub', text: UI.pct(r.marginShare, 0) }),
        ] : '—',
      },
      {
        key: 'site', label: 'Best site', get: r => r.siteName,
        render: r => r.rank ? el('a', { href: href('sites', r.rank.siteId), text: r.siteName, title: r.siteName }) : el('span', { class: 'muted', text: 'no compatible site' }),
      },
      { key: 'plants', label: 'Plants', num: true, title: 'Plants built in the current simulation', get: r => r.plants, render: r => (r.plants ? String(r.plants) : el('span', { class: 'muted', text: '0' })) },
      { key: 'status', label: 'Status', get: r => STATUS_ORDER[r.status], render: r => statusTag(UI, r.status) },
    ];

    function compute() {
      const ranks = rankById(Store);
      const plants = plantsByPathway(Store.result);
      rows = Store.PATHWAYS.map(p => {
        const rank = ranks.get(p.id) || null;
        const built = plants.get(p.id) || [];
        const price = rank ? rank.priceUsdPerKg : Store.MARKETS[p.product]?.priceUsdPerKg;
        return {
          id: p.id,
          name: p.name,
          product: p.product,
          origins: feedOrigins(p),
          infinite: p.infiniteSourceShare,
          kWh: p.electricityKWhPerKg + (p.heatKWhPerKg || 0),
          rank,
          cost: rank ? rank.lcopUsdPerKg : NaN,
          price,
          margin: rank ? rank.marginUsdPerKg : NaN,
          marginShare: rank && price > 0 ? rank.marginUsdPerKg / price : NaN,
          siteName: rank ? Store.siteById.get(rank.siteId)?.name || rank.siteId : '',
          plants: built.length,
          status: statusOf(Store, p, rank, built),
        };
      });
      const counts = { built: 0, feasible: 0, infeasible: 0, excluded: 0 };
      for (const r of rows) counts[r.status] += 1;
      kpis.replaceChildren(
        UI.kpi('Pathways', String(rows.length), `${new Set(rows.map(r => r.product)).size} products`),
        UI.kpi('Built', String(counts.built), Store.result ? `${Store.result.plants.length} plants in the run` : 'simulating…'),
        UI.kpi('Feasible, not built', String(counts.feasible), 'positive margin today'),
        UI.kpi('Not feasible today', String(counts.infeasible), 'cost above price, year 0'),
        UI.kpi('Excluded', String(counts.excluded), 'by the scenario'),
      );
      titleNote.textContent = `Per-kg recipes reduced from plant models. Cost and price at each pathway’s cheapest site in ${Company.DEFAULTS.startYear}, ${RANK_SIZE_MULTIPLE}× reference size.`;
    }

    // Remember the table's current sort across filter changes and visits.
    function readSort() {
      const th = tableHost.querySelector('th[aria-sort]');
      if (!th) return false;
      state.sortKey = th.dataset.sort;
      state.sortDir = th.getAttribute('aria-sort') === 'ascending' ? 'asc' : 'desc';
      return true;
    }

    function drawTable() {
      readSort();
      const q = state.q.trim().toLowerCase();
      const shown = rows.filter(r => {
        if (state.builtOnly && !r.plants) return false;
        if (state.origin && !r.origins.includes(state.origin)) return false;
        if (q && !`${r.name} ${r.id} ${r.product} ${UI.productName(r.product)}`.toLowerCase().includes(q)) return false;
        return true;
      });
      count.textContent = `${shown.length} of ${rows.length}`;
      if (!shown.length) {
        tableHost.replaceChildren(el('p', { class: 'empty', text: 'No pathway matches these filters.' }));
        return;
      }
      tableHost.replaceChildren(UI.sortableTable(columns, shown, {
        sortKey: state.sortKey, sortDir: state.sortDir,
        rowHref: r => href('pathways', r.id),
        rowClass: r => (r.status === 'excluded' ? 'is-dim' : null),
      }));
      tableHost.querySelector('thead').addEventListener('click', () => requestAnimationFrame(() => { if (readSort()) save(); }));
    }

    search.addEventListener('input', () => { state.q = search.value; save(); drawTable(); });
    origin.addEventListener('change', () => { state.origin = origin.value; save(); drawTable(); });
    builtOnly.addEventListener('change', () => { state.builtOnly = builtOnly.checked; save(); drawTable(); });

    let lastKey = null;
    const draw = () => {
      const key = Store.toQuery(Store.scenario) + '|' + (Store.result ? Store.result.ms + ':' + Store.result.plants.length : 'none');
      if (key === lastKey) return;
      lastKey = key;
      compute();
      drawTable();
    };
    draw();
    return Store.subscribe(draw);
  }

  // ------------------------------------------------------------------ detail helpers
  function simInput(Store) {
    return { pathways: Store.PATHWAYS, markets: Store.MARKETS, sites: Store.SITES, config: Store.toConfig(Store.scenario) };
  }

  function bestSites(Store, pathway, size) {
    const input = simInput(Store);
    const out = [];
    for (const site of Store.SITES) {
      const ev = Company.evaluateAtYear(input, pathway.id, site.id, size, 0);
      if (ev) out.push({ site, ev });
    }
    out.sort((a, b) => a.ev.lcopUsdPerKg - b.ev.lcopUsdPerKg);
    return out;
  }

  function costCurve(Store, pathway, siteId, size, result) {
    const input = simInput(Store);
    return result.timeline.map((row, i) => Company.evaluateAtYear(input, pathway.id, siteId, size, i, {
      costFactors: row.costFactors, rawFactors: row.rawFactors, storagePrices: row.storagePrices, pvUsdPerKWp: row.pvCapexUsdPerKWp,
    }));
  }

  function niceFloor(v) {
    if (!(v < 0)) return 0;
    const mag = 10 ** Math.floor(Math.log10(-v));
    return -Math.ceil(-v / mag) * mag;
  }

  // ------------------------------------------------------------------ flowsheet diagram
  // Layered left-to-right SVG: sources → converters → sinks. Layers by longest path over
  // material/heat edges (back edges of recycle loops ignored); electricity drawn as a rail
  // across the top with a drop to each consumer. Edge width ∝ √(kg per kg product).
  const FS = { nodeW: 150, nodeH: 42, colGap: 92, rowGap: 22, railH: 46, padX: 14, padTop: 12, padBottom: 18 };

  function sourceOrigin(pathway, node) {
    const feeds = pathway.feeds || [];
    const id = node.id.toLowerCase();
    const hit = feeds.find(f => f.id === node.id)
      || feeds.find(f => id.includes(String(f.id).toLowerCase()) || String(f.id).toLowerCase().includes(id));
    if (hit) return hit.origin;
    if (/seawater|ocean/.test(id)) return 'ocean';
    if (/brine/.test(id)) return 'brine';
    if (/air/.test(id)) return 'air';
    if (/water/.test(id)) return 'water';
    return 'intermediate';
  }

  function flowLabel(UI, edge) {
    if (edge.kind === 'material') return UI.num(edge.kgPerKg) + ' kg';
    return UI.num(edge.kWhPerKg) + ' kWh';
  }

  function layout(flowsheet) {
    const nodes = flowsheet.nodes.map(n => ({ ...n }));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const elecKinds = new Set(['electricity', 'bus']);
    // Material/heat edges between drawable nodes.
    const flowEdges = flowsheet.edges.filter(e => e.kind !== 'electricity' && byId.has(e.from) && byId.has(e.to)
      && !elecKinds.has(byId.get(e.from).kind) && !elecKinds.has(byId.get(e.to).kind));
    const railNodes = nodes.filter(n => elecKinds.has(n.kind)
      || (n.kind === 'converter' && !flowEdges.some(e => e.from === n.id || e.to === n.id)));
    const railIds = new Set(railNodes.map(n => n.id));
    const mainNodes = nodes.filter(n => !railIds.has(n.id));

    // Break cycles with a DFS from sources (and then any unvisited node).
    const out = new Map(mainNodes.map(n => [n.id, []]));
    for (const e of flowEdges) out.get(e.from)?.push(e);
    const back = new Set();
    const color = new Map();
    const visit = id => {
      color.set(id, 1);
      for (const e of out.get(id) || []) {
        const c = color.get(e.to);
        if (c === 1) back.add(e);
        else if (!c) visit(e.to);
      }
      color.set(id, 2);
    };
    for (const n of mainNodes) if (n.kind === 'source' && !color.get(n.id)) visit(n.id);
    for (const n of mainNodes) if (!color.get(n.id)) visit(n.id);
    const dag = flowEdges.filter(e => !back.has(e));

    // Longest path layering.
    const layer = new Map(mainNodes.map(n => [n.id, 0]));
    for (let pass = 0; pass < mainNodes.length; pass += 1) {
      let changed = false;
      for (const e of dag) {
        const next = layer.get(e.from) + 1;
        if (next > layer.get(e.to)) { layer.set(e.to, next); changed = true; }
      }
      if (!changed) break;
    }
    // Reading order: sources in column 0, sinks in the last column.
    let maxLayer = 0;
    for (const n of mainNodes) if (n.kind !== 'sink') maxLayer = Math.max(maxLayer, layer.get(n.id));
    for (const n of mainNodes) {
      if (n.kind === 'source') layer.set(n.id, 0);
      if (n.kind === 'sink') layer.set(n.id, maxLayer + 1);
    }
    // Compact empty columns.
    const used = [...new Set([...layer.values()])].sort((a, b) => a - b);
    const remap = new Map(used.map((l, i) => [l, i]));
    for (const [id, l] of layer) layer.set(id, remap.get(l));
    const cols = used.length;

    // Order within columns: barycenter sweeps.
    const columns = Array.from({ length: cols }, () => []);
    for (const n of mainNodes) columns[layer.get(n.id)].push(n);
    const sinkRank = { product: 0, coproduct: 1, waste: 2 };
    columns[cols - 1].sort((a, b) => (sinkRank[a.disposition] ?? 3) - (sinkRank[b.disposition] ?? 3));
    const pos = new Map();
    const index = () => columns.forEach(col => col.forEach((n, i) => pos.set(n.id, i)));
    index();
    const neighbours = (id, dir) => flowEdges.filter(e => (dir > 0 ? e.to === id : e.from === id)).map(e => (dir > 0 ? e.from : e.to));
    for (let sweep = 0; sweep < 4; sweep += 1) {
      const dir = sweep % 2 === 0 ? 1 : -1;
      const order = dir > 0 ? columns.slice(1) : columns.slice(0, -1).reverse();
      for (const col of order) {
        const bary = new Map(col.map(n => {
          const nb = neighbours(n.id, dir).filter(id => pos.has(id));
          return [n.id, nb.length ? nb.reduce((s, id) => s + pos.get(id), 0) / nb.length : pos.get(n.id)];
        }));
        col.sort((a, b) => bary.get(a.id) - bary.get(b.id) || (sinkRank[a.disposition] ?? 3) - (sinkRank[b.disposition] ?? 3));
        index();
      }
    }

    const rows = Math.max(...columns.map(c => c.length));
    const colH = c => c.length * FS.nodeH + (c.length - 1) * FS.rowGap;
    const bodyH = rows * FS.nodeH + (rows - 1) * FS.rowGap;
    const top = FS.padTop + FS.railH;
    for (const [ci, col] of columns.entries()) {
      const offset = (bodyH - colH(col)) / 2;
      col.forEach((n, i) => {
        n.x = FS.padX + ci * (FS.nodeW + FS.colGap);
        n.y = top + offset + i * (FS.nodeH + FS.rowGap);
      });
    }
    const width = FS.padX * 2 + cols * FS.nodeW + (cols - 1) * FS.colGap;
    const height = top + bodyH + FS.padBottom + 16;
    return { nodes: mainNodes, railNodes, flowEdges, back, width, height, byId };
  }

  function drawFlowsheet(UI, pathway) {
    const { el, svg } = UI;
    const fs = pathway.flowsheet;
    if (!fs?.nodes?.length) return el('p', { class: 'empty', text: 'No flowsheet for this pathway.' });
    const L = layout(fs);
    const root = svg('svg', {
      class: 'pw-flowsheet', width: L.width, height: L.height, viewBox: `0 0 ${L.width} ${L.height}`,
      role: 'img', 'aria-label': `Flowsheet of ${pathway.name}: ${L.nodes.length} units, flows per kg of ${UI.productName(pathway.product)}`,
    });
    const defs = svg('defs');
    const marker = svg('marker', { id: 'pwArrow', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' });
    marker.append(svg('path', { d: 'M0,0 L8,4 L0,8 z', class: 'pw-arrow' }));
    defs.append(marker);
    root.append(defs);

    // Edge widths: √ scale on kg per kg product.
    const maxKg = Math.max(...L.flowEdges.filter(e => e.kind === 'material').map(e => e.kgPerKg), 1e-9);
    const width = e => (e.kind === 'material' ? 1.25 + 11 * Math.sqrt(e.kgPerKg / maxKg) : 2);
    const edgeLayer = svg('g', { class: 'pw-edges' });
    const labelLayer = svg('g', { class: 'pw-edge-labels' });
    const productIds = new Set(L.nodes.filter(n => n.disposition === 'product').map(n => n.id));

    // Fan out multiple edges at a node side so they do not stack on one point.
    const slots = (list, key) => {
      const groups = new Map();
      for (const e of list) {
        const id = e[key];
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(e);
      }
      const at = new Map();
      for (const [id, group] of groups) {
        const n = L.byId.get(id);
        group.sort((a, b) => (L.byId.get(a[key === 'from' ? 'to' : 'from']).y - L.byId.get(b[key === 'from' ? 'to' : 'from']).y));
        group.forEach((e, i) => at.set(e, n.y + FS.nodeH * ((i + 1) / (group.length + 1))));
      }
      return at;
    };
    const outY = slots(L.flowEdges, 'from');
    const inY = slots(L.flowEdges, 'to');
    const placed = [];
    for (const e of L.flowEdges) {
      const a = L.byId.get(e.from);
      const b = L.byId.get(e.to);
      const x1 = a.x + FS.nodeW;
      const y1 = outY.get(e);
      const x2 = b.x;
      const y2 = inY.get(e);
      let d;
      let lx;
      let ly;
      if (x2 > x1) {
        const c = Math.max(30, (x2 - x1) * 0.5);
        d = `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`;
        lx = (x1 + x2) / 2; ly = (y1 + y2) / 2;
        // Long edges: label near the start so labels do not pile up mid-diagram.
        if (x2 - x1 > FS.nodeW + FS.colGap * 1.5) { lx = x1 + FS.colGap / 2; ly = y1; }
      } else {
        // Recycle / back edge: loop under the nodes.
        const yb = Math.max(a.y, b.y) + FS.nodeH + 14;
        d = `M${x1},${y1} C${x1 + 40},${y1} ${x1 + 40},${yb} ${x1},${yb} L${x2},${yb} C${x2 - 40},${yb} ${x2 - 40},${y2} ${x2},${y2}`;
        lx = (x1 + x2) / 2; ly = yb;
      }
      const cls = 'pw-edge is-' + e.kind + (productIds.has(e.to) ? ' is-product' : '') + (L.back.has(e) ? ' is-back' : '');
      const path = svg('path', { d, class: cls, 'stroke-width': width(e).toFixed(2), 'marker-end': 'url(#pwArrow)' });
      const t = svg('title');
      const subs = (e.substances || []).map(([s, kg]) => `${s} ${UI.num(kg)} kg`).join(', ');
      t.textContent = `${L.byId.get(e.from).label} → ${L.byId.get(e.to).label}: ${flowLabel(UI, e)} per kg product${subs ? ' (' + subs + ')' : ''}`;
      path.append(t);
      edgeLayer.append(path);
      // Label (skip if it would collide with one already placed).
      if (placed.some(p => Math.abs(p.x - lx) < 46 && Math.abs(p.y - ly) < 12)) ly += 12;
      if (placed.some(p => Math.abs(p.x - lx) < 46 && Math.abs(p.y - ly) < 12)) continue;
      placed.push({ x: lx, y: ly });
      const label = svg('text', { x: lx, y: ly - 4, class: 'pw-edge-label', 'text-anchor': 'middle' });
      label.textContent = flowLabel(UI, e) + (e.substances?.length ? ' ' + e.substances[0][0] : '');
      labelLayer.append(label);
    }

    // Electricity rail: from the power source across to every consumer.
    const elecIn = new Map();
    for (const e of fs.edges) {
      if (e.kind !== 'electricity') continue;
      const to = L.byId.get(e.to);
      if (!to || to.kind === 'bus') continue;
      elecIn.set(e.to, (elecIn.get(e.to) || 0) + e.kWhPerKg);
    }
    const consumers = L.nodes.filter(n => elecIn.has(n.id) || n.kWhPerKg > 0);
    const railY = FS.padTop + 14;
    const railG = svg('g', { class: 'pw-rail' });
    const powerNode = L.railNodes.find(n => n.kind === 'electricity');
    const totalKWh = pathway.electricityKWhPerKg;
    if (consumers.length || powerNode) {
      const xs = consumers.map(n => n.x + FS.nodeW - 12);
      const x0 = FS.padX;
      const x1 = Math.max(x0 + 160, ...xs);
      railG.append(svg('line', { x1: x0 + 6, x2: x1, y1: railY, y2: railY, class: 'pw-rail-line' }));
      railG.append(svg('circle', { cx: x0 + 6, cy: railY, r: 5, class: 'pw-rail-dot' }));
      const head = svg('text', { x: x0 + 16, y: railY - 6, class: 'pw-rail-label' });
      head.textContent = `${powerNode && /grid/i.test(pathway.notes) ? 'Grid' : 'Solar PV'} electricity · ${UI.num(totalKWh)} kWh/kg`;
      railG.append(head);
      for (const n of consumers) {
        const kWh = elecIn.get(n.id) ?? n.kWhPerKg;
        // Drop to the node's top-right corner; it runs behind any node above it in the column.
        const x = n.x + FS.nodeW - 12;
        const drop = svg('line', { x1: x, x2: x, y1: railY, y2: n.y, class: 'pw-rail-drop' });
        const t = svg('title');
        t.textContent = `${n.label}: ${UI.num(kWh)} kWh per kg product`;
        drop.append(t);
        railG.append(drop);
        n.railKWh = kWh;
        n.railX = x;
      }
    }
    for (const n of L.railNodes.filter(r => r.kind === 'converter')) {
      // Storage-only units (batteries): note them on the rail.
      const lab = svg('text', { x: FS.padX + 16, y: railY + 14, class: 'pw-rail-kwh' });
      lab.textContent = `+ ${n.label}`;
      railG.append(lab);
    }

    // Nodes.
    const nodeLayer = svg('g', { class: 'pw-nodes' });
    for (const n of L.nodes) {
      const sub = n.kind === 'converter'
        ? (n.capexUsdPerKgDay ? UI.usd(n.capexUsdPerKgDay) + '/kg·d' : n.unit)
        : n.kind === 'sink' ? n.disposition : n.kind === 'source' ? UI.originLabel(sourceOrigin(pathway, n)) : n.kind;
      const g = svg('g', { class: `pw-node is-${n.kind}` + (n.disposition ? ' is-' + n.disposition : ''), transform: `translate(${n.x},${n.y})`, 'data-node': n.id });
      g.append(svg('rect', { width: FS.nodeW, height: FS.nodeH, rx: 6 }));
      let textX = 10;
      if (n.kind === 'source') {
        g.append(svg('circle', { cx: 13, cy: 14, r: 4, class: 'pw-origin', 'data-origin': sourceOrigin(pathway, n) }));
        textX = 22;
      }
      const label = svg('text', { x: textX, y: 18, class: 'pw-node-label' });
      const maxChars = Math.floor((FS.nodeW - textX - 6) / 6.6);
      label.textContent = n.label.length > maxChars ? n.label.slice(0, maxChars - 1) + '…' : n.label;
      const subT = svg('text', { x: 10, y: 33, class: 'pw-node-sub' });
      subT.textContent = sub;
      if (n.railKWh > 0) {
        const k = svg('tspan', { class: 'pw-node-kwh' });
        k.textContent = ' · ' + UI.num(n.railKWh) + ' kWh';
        subT.append(k);
        g.append(svg('circle', { cx: n.railX - n.x, cy: 0, r: 3, class: 'pw-rail-dot' }));
      }
      const title = svg('title');
      title.textContent = [n.label, `unit ${n.unit}`, n.kWhPerKg ? `${UI.num(n.kWhPerKg)} kWh/kg product` : null,
        n.capexUsdPerKgDay ? `capex ${UI.usd(n.capexUsdPerKgDay)} per kg/day of product` : null].filter(Boolean).join(' · ');
      g.append(title, label, subT);
      nodeLayer.append(g);
    }
    root.append(railG, edgeLayer, nodeLayer, labelLayer);
    return root;
  }

  function flowsheetTable(UI, pathway) {
    const { el } = UI;
    const byId = new Map(pathway.flowsheet.nodes.map(n => [n.id, n]));
    const rows = pathway.flowsheet.edges.filter(e => byId.get(e.to)?.kind !== 'bus');
    const table = el('table', { class: 'data-table compact' }, [
      el('thead', {}, el('tr', {}, ['From', 'To', 'Flow per kg', 'Top substances'].map(t => el('th', { scope: 'col', text: t })))),
      el('tbody', {}, rows.map(e => el('tr', {}, [
        el('td', { text: byId.get(e.from)?.kind === 'bus' ? 'Electricity' : byId.get(e.from)?.label || e.from }),
        el('td', { text: byId.get(e.to)?.label || e.to }),
        el('td', { class: 'num', text: flowLabel(UI, e) }),
        el('td', { text: (e.substances || []).map(([s, kg]) => `${s} ${UI.num(kg)}`).join(', ') }),
      ]))),
    ]);
    return el('details', { class: 'chart-data' }, [el('summary', { text: `Flow table (${rows.length} streams)` }), el('div', { class: 'table-scroll' }, table)]);
  }

  // ------------------------------------------------------------------ detail
  function mountDetail(root, ctx) {
    const { Store, UI, href, params } = ctx;
    const { el } = UI;
    const pathway = Store.pathwayById.get(params.id);
    if (!pathway) {
      root.append(
        el('div', { class: 'crumbs' }, [el('a', { href: href('pathways'), text: 'Pathways' })]),
        el('div', { class: 'empty' }, [`No pathway “${params.id}”. `, el('a', { href: href('pathways'), text: 'All pathways' })]),
      );
      return null;
    }
    const [mainName, subName] = splitName(pathway.name);
    const market = Store.MARKETS[pathway.product];
    const statusHost = el('span');
    root.append(
      el('div', { class: 'crumbs' }, [el('a', { href: href('pathways'), text: 'Pathways' }), ' / ', pathway.id]),
      el('div', { class: 'pw-head' }, [
        el('div', { class: 'view-title' }, [el('h1', { text: mainName }), statusHost]),
        subName ? el('p', { class: 'pw-sub', text: subName }) : null,
        el('div', { class: 'pw-meta' }, [
          el('span', {}, ['Makes ', el('a', { href: href('markets', pathway.product), text: UI.productName(pathway.product) })]),
          market?.quality ? el('span', {}, ['market ', UI.qualityTag(market.quality)]) : null,
          el('span', {}, ['case ', el('code', { text: pathway.case.file })]),
          el('span', {}, ['recipe ', UI.qualityTag(pathway.quality)]),
          pathway.refSiteId ? el('span', {}, ['modelled at ', Store.siteById.has(pathway.refSiteId)
            ? el('a', { href: href('sites', pathway.refSiteId), text: Store.siteById.get(pathway.refSiteId).name })
            : el('code', { text: pathway.refSiteId })]) : null,
        ]),
        el('p', { class: 'pw-notes', text: pathway.notes }),
      ]),
    );
    const kpis = el('div', { class: 'kpis pw-kpis' });
    const chartHost = el('div', { class: 'pw-chart' });
    const chartNote = el('div', { class: 'pw-chart-note' });
    const sitesHost = el('div');
    const plantsHost = el('div');
    const opsHost = el('div');
    root.append(
      kpis,
      el('div', { class: 'grid grid-2 pw-grid' }, [
        UI.card('Recipe', 'per kg of ' + UI.productName(pathway.product), recipe(UI, Store, pathway, href)),
        UI.card('Cost vs year', 'at the best site, with this run’s PV price and cost factors', [chartHost, chartNote]),
      ]),
      UI.card('Operation on solar', 'how the plant runs on sunlight alone at its best site, year-0 costs', opsHost),
      el('div', { class: 'grid grid-2 pw-grid' }, [
        UI.card('Best sites', `top 5 by net cost, ${Company.DEFAULTS.startYear}`, sitesHost),
        UI.card('Plants built', 'in the current simulation', plantsHost),
      ]),
      UI.card('Flowsheet', `solved plant model, flows per kg of ${UI.productName(pathway.product)}; edge width ∝ √kg`, [
        el('div', { class: 'pw-fs-legend' }, [
          el('span', {}, [el('i', { class: 'pw-key is-material' }), 'material']),
          el('span', {}, [el('i', { class: 'pw-key is-product' }), 'product']),
          el('span', {}, [el('i', { class: 'pw-key is-electricity' }), 'electricity']),
          pathway.flowsheet.edges.some(e => e.kind === 'heat') ? el('span', {}, [el('i', { class: 'pw-key is-heat' }), 'heat']) : null,
          el('span', { class: 'muted', text: 'hover a stream for its composition' }),
        ]),
        el('div', { class: 'pw-fs-scroll' }, drawFlowsheet(UI, pathway)),
        flowsheetTable(UI, pathway),
      ]),
    );

    let lastKey = null;
    const draw = () => {
      const result = Store.result;
      const key = Store.toQuery(Store.scenario) + '|' + (result ? result.ms + ':' + result.plants.length : 'none');
      if (key === lastKey) return;
      lastKey = key;
      const rank = rankById(Store).get(pathway.id) || null;
      const plants = result ? plantsByPathway(result).get(pathway.id) || [] : [];
      statusHost.replaceChildren(result ? statusTag(UI, statusOf(Store, pathway, rank, plants)) : el('span', { class: 'muted', text: 'simulating…' }));
      const size = rank ? rank.sizeKgPerDay : pathway.refOutputKgPerDay * RANK_SIZE_MULTIPLE;
      const capexPerKgDay = Object.values(pathway.capexByTechUsdPerKgDay).reduce((a, b) => a + b, 0);
      kpis.replaceChildren(
        UI.kpi('Net cost', rank ? UI.usdKg(rank.lcopUsdPerKg) + '/kg' : '—', rank ? (rank.coproductCreditUsdPerKg > 0 ? `gross ${UI.usdKg(rank.grossCostUsdPerKg)}, co-products −${UI.usdKg(rank.coproductCreditUsdPerKg)}` : 'no co-product credit') : 'no compatible site'),
        UI.kpi('Price', UI.usdKg(rank?.priceUsdPerKg ?? market?.priceUsdPerKg) + '/kg', market ? `world market ${UI.tonnes(market.worldDemandTPerYear)}/yr` : ''),
        UI.kpi('Margin', rank ? UI.usdKg(rank.marginUsdPerKg) : '—', rank && rank.priceUsdPerKg > 0 ? UI.pct(rank.marginUsdPerKg / rank.priceUsdPerKg, 0) + ' of price' : ''),
        UI.kpi('Electricity', UI.num(pathway.electricityKWhPerKg) + ' kWh/kg', rank?.utilization
          ? `${rank.utilization.strategy} · output ${UI.pct(rank.utilization.outputFactor, 0)} of nameplate`
          : (pathway.heatKWhPerKg > 0 ? `+ ${UI.num(pathway.heatKWhPerKg)} kWh/kg heat` : 'PV-powered')),
        UI.kpi('Capex ex-PV', UI.usd(capexPerKgDay), `per kg/day · plant ${UI.tonnes(size * 365 / 1000)}/yr`),
        UI.kpi('Plants built', result ? String(plants.length) : '…', plants.length ? `${UI.tonnes(plants.reduce((s, p) => s + p.sizeKgPerDay * 365 / 1000, 0))}/yr capacity` : ''),
      );

      // Operation on solar (utilization & storage design).
      opsHost.replaceChildren(operationOnSolar(UI, rank));

      // Best sites.
      const sites = bestSites(Store, pathway, size);
      if (!sites.length) {
        sitesHost.replaceChildren(el('p', { class: 'empty', text: 'No site in the catalog can host this pathway.' }));
      } else {
        sitesHost.replaceChildren(UI.sortableTable([
          { key: 'site', label: 'Site', get: r => r.site.name, render: r => [el('a', { href: href('sites', r.site.id), text: r.site.name }), el('span', { class: 'cell-sub', text: r.site.region || '' })] },
          { key: 'pv', label: 'PV kWh/kWp·d', num: true, get: r => r.site.pvKWhPerKWpDay, render: r => UI.num(r.site.pvKWhPerKWpDay) },
          { key: 'cost', label: 'Net cost', num: true, get: r => r.ev.lcopUsdPerKg, render: r => UI.usdKg(r.ev.lcopUsdPerKg) },
          { key: 'margin', label: 'Margin', num: true, get: r => r.ev.marginUsdPerKg, render: r => el('span', { class: r.ev.marginUsdPerKg >= 0 ? 'is-pos' : 'is-neg', text: UI.usdKg(r.ev.marginUsdPerKg) }) },
          { key: 'buy', label: 'Make vs buy', render: r => el('span', { class: 'muted', text: UI.inHouseText(r.ev.integration) || (r.ev.purchasedIntermediates.length ? 'buys ' + r.ev.purchasedIntermediates.join(', ') : '—') }) },
        ], sites.slice(0, 5), { sortKey: 'cost', sortDir: 'asc', compact: true }));
        sitesHost.append(el('p', { class: 'muted pw-foot', text: `${sites.length} compatible sites · plant ${UI.tonnes(size * 365 / 1000)}/yr` }));
      }

      // Plants built.
      if (!result) plantsHost.replaceChildren(el('p', { class: 'empty', text: 'Simulating…' }));
      else if (!plants.length) {
        plantsHost.replaceChildren(el('p', { class: 'empty', text: Store.pathwayAllowed(pathway, Store.scenario)
          ? 'The current run builds no plant of this pathway.' : 'Excluded by the current scenario.' }));
      } else {
        plantsHost.replaceChildren(UI.sortableTable([
          { key: 'id', label: '#', num: true, get: p => p.id },
          { key: 'site', label: 'Site', get: p => Store.siteById.get(p.siteId)?.name || p.siteId, render: p => el('a', { href: href('sites', p.siteId), text: Store.siteById.get(p.siteId)?.name || p.siteId }) },
          { key: 'built', label: 'Built', num: true, get: p => p.builtYear, render: p => `${p.builtYear}${p.onlineYear !== p.builtYear ? ' → ' + p.onlineYear : ''}` },
          { key: 'size', label: 't/yr', num: true, get: p => p.sizeKgPerDay, render: p => UI.num(p.sizeKgPerDay * 365 / 1000) },
          { key: 'capex', label: 'Capex', num: true, get: p => p.capexUsd, render: p => UI.usd(p.capexUsd) },
          { key: 'npv', label: 'NPV at build', num: true, get: p => p.npvAtBuildUsd, render: p => UI.usd(p.npvAtBuildUsd) },
          { key: 'int', label: 'Make vs buy', render: p => el('span', { class: 'muted', text: UI.inHouseText(p.integration) || '—' }) },
        ], plants, { sortKey: 'id', sortDir: 'asc', compact: true }));
      }

      // Cost vs year.
      if (!result) { chartHost.replaceChildren(el('p', { class: 'chart-empty', text: 'Simulating…' })); chartNote.replaceChildren(); return; }
      if (!rank) { chartHost.replaceChildren(el('p', { class: 'chart-empty', text: 'No compatible site for this pathway.' })); chartNote.replaceChildren(); return; }
      const evs = costCurve(Store, pathway, rank.siteId, size, result);
      const years = result.timeline.map(r => r.year);
      const net = evs.map(ev => ev?.lcopUsdPerKg ?? NaN);
      const gross = evs.map(ev => ev?.grossCostUsdPerKg ?? NaN);
      const price = evs.map(ev => ev?.priceUsdPerKg ?? NaN);
      const hasCredit = evs.some(ev => ev?.coproductCreditUsdPerKg > 0);
      const feasibleAt = net.findIndex((v, i) => v <= price[i]);
      const integrationAt = evs.findIndex(ev => ev?.integration?.length);
      const series = [
        { key: 'net', label: hasCredit ? 'Cost (net)' : 'Cost', color: 'var(--series-1)', values: net },
        hasCredit ? { key: 'gross', label: 'Cost (gross)', color: 'var(--series-1)', dash: true, values: gross } : null,
        { key: 'price', label: 'Price', color: 'var(--series-2)', values: price },
      ].filter(Boolean);
      const lo = Math.min(...net.filter(Number.isFinite), 0);
      const xMarks = [];
      if (feasibleAt > 0) xMarks.push({ index: feasibleAt, label: `feasible ${years[feasibleAt]}` });
      if (integrationAt > 0) xMarks.push({ index: integrationAt, label: `makes in-house ${years[integrationAt]}` });
      chartHost.replaceChildren(ctx.Charts.chartBlock({
        x: years, series, kind: 'line', yFormat: UI.usdKg, yMin: niceFloor(lo), endLabels: true, xMarks,
        ariaLabel: `Levelized cost and price of ${UI.productName(pathway.product)} at ${Store.siteById.get(rank.siteId)?.name}, ${years[0]}–${years.at(-1)}`,
      }));
      const siteName = Store.siteById.get(rank.siteId)?.name || rank.siteId;
      const notes = [el('span', {}, ['At ', el('a', { href: href('sites', rank.siteId), text: siteName }), `, ${UI.tonnes(size * 365 / 1000)}/yr plant. `])];
      if (feasibleAt === 0) notes.push(el('span', { class: 'is-pos', text: `Feasible from the first year (${UI.usdKg(net[0])} vs ${UI.usdKg(price[0])}). ` }));
      else if (feasibleAt > 0) notes.push(el('span', {}, ['Becomes feasible in ', el('strong', { text: String(years[feasibleAt]) }), ` (${UI.usdKg(net[feasibleAt])} vs ${UI.usdKg(price[feasibleAt])}). `]));
      else notes.push(el('span', { class: 'is-neg', text: `Not feasible within the horizon: ${UI.usdKg(net.at(-1))} vs ${UI.usdKg(price.at(-1))} in ${years.at(-1)}. ` }));
      if (integrationAt >= 0) notes.push(el('span', {}, [`From ${years[integrationAt]}: ${UI.inHouseText(evs[integrationAt].integration)}.`]));
      else if (pathway.feeds.some(f => f.purchased && f.origin === 'intermediate')) notes.push(el('span', { class: 'muted', text: 'Keeps buying its intermediates over the horizon.' }));
      chartNote.replaceChildren(...notes);
    };
    draw();
    return Store.subscribe(draw);
  }

  function recipe(UI, Store, pathway, href) {
    const { el } = UI;
    const out = [];
    const capex = pathway.capexByTechUsdPerKgDay;
    const capexTotal = Object.values(capex).reduce((a, b) => a + b, 0);
    out.push(el('dl', { class: 'pw-facts' }, [
      el('dt', { text: 'Electricity' }), el('dd', { text: `${UI.num(pathway.electricityKWhPerKg)} kWh/kg` }),
      pathway.heatKWhPerKg > 0 ? el('dt', { text: 'Heat' }) : null,
      pathway.heatKWhPerKg > 0 ? el('dd', { text: `${UI.num(pathway.heatKWhPerKg)} kWh/kg` }) : null,
      el('dt', { text: 'Fixed O&M' }), el('dd', { text: `${UI.pct(pathway.fixedOmFracPerYear)} of capex / yr` }),
      el('dt', { text: 'Variable O&M' }), el('dd', { text: `${UI.usdKg(pathway.variableOmUsdPerKg)}/kg` }),
      el('dt', { text: 'Asset life' }), el('dd', { text: `${UI.num(pathway.assetLifeYears)} yr` }),
      el('dt', { text: 'Reference output' }), el('dd', { text: `${UI.num(pathway.refOutputKgPerDay)} kg/day` }),
      el('dt', { text: 'Infinite-source share' }), el('dd', { text: pct0(pathway.infiniteSourceShare) + ' of feed mass' }),
    ]));

    out.push(el('h3', { class: 'pw-h3', text: 'Feeds' }));
    out.push(el('div', { class: 'table-scroll' }, el('table', { class: 'data-table compact pw-feeds' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { scope: 'col', text: 'Feed' }), el('th', { scope: 'col', class: 'num', text: 'kg/kg' }),
        el('th', { scope: 'col', class: 'num', text: '$/kg' }), el('th', { scope: 'col', text: 'Supply' }),
      ])),
      el('tbody', {}, pathway.feeds.map(f => el('tr', {}, [
        el('td', {}, el('span', { class: 'pw-chip' }, [UI.originDot(f.origin), el('span', { text: humanId(f.id) })])),
        el('td', { class: 'num', text: UI.num(f.kgPerKg) }),
        el('td', { class: 'num' }, [UI.usdKg(f.usdPerKg), f.freightUsdPerKg > 0 ? el('span', { class: 'cell-sub', text: '+' + UI.usdKg(f.freightUsdPerKg) + ' freight' }) : null]),
        el('td', {}, [f.purchased ? 'purchased' : 'on-site', el('span', { class: 'cell-sub', text: UI.originLabel(f.origin) })]),
      ]))),
    ])));

    if (pathway.coproducts.length) {
      out.push(el('h3', { class: 'pw-h3', text: 'Co-products' }));
      out.push(el('div', { class: 'table-scroll' }, el('table', { class: 'data-table compact' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { scope: 'col', text: 'Product' }), el('th', { scope: 'col', class: 'num', text: 'kg/kg' }),
          el('th', { scope: 'col', class: 'num', text: '$/kg' }), el('th', { scope: 'col', class: 'num', text: 'Credit $/kg' }),
        ])),
        el('tbody', {}, pathway.coproducts.map(c => el('tr', {}, [
          el('td', {}, c.product && Store.MARKETS[c.product] ? el('a', { href: href('markets', c.product), text: UI.productName(c.product) }) : humanId(c.id)),
          el('td', { class: 'num', text: UI.num(c.kgPerKg) }),
          el('td', { class: 'num', text: UI.usdKg(c.usdPerKg) }),
          el('td', { class: 'num', text: UI.usdKg(c.kgPerKg * c.usdPerKg) }),
        ]))),
      ])));
    }

    out.push(el('h3', { class: 'pw-h3', text: `Capex by technology · ${UI.usd(capexTotal)} per kg/day (ex-PV)` }));
    const max = Math.max(...Object.values(capex), 1e-9);
    out.push(el('div', { class: 'pw-bars' }, Object.entries(capex).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([cls, v]) => {
      const bar = el('span', { class: 'pw-bar-fill' });
      bar.style.width = Math.max(1.5, (v / max) * 100) + '%';
      return el('div', { class: 'pw-bar', title: `${cls}: ${UI.usd(v)} per kg/day (${UI.pct(v / capexTotal, 0)})` }, [
        el('span', { class: 'pw-bar-label', text: cls }),
        el('span', { class: 'pw-bar-track' }, bar),
        el('span', { class: 'pw-bar-value', text: `${UI.usd(v)} · ${UI.pct(v / capexTotal, 0)}` }),
      ]);
    })));
    return out;
  }

  // ------------------------------------------------------------------ register
  globalThis.Views.pathways = {
    title: 'Pathways',
    mount(root, ctx) {
      return ctx.params.id ? mountDetail(root, ctx) : mountList(root, ctx);
    },
  };
})();
