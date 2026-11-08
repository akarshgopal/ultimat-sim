// Case loading, unit replacement, snapshots, autosave, named saves, baseline compare.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    captureBaseline, clearBaseline, clone, deleteNamed, formatRate, loadCase, loadNamed,
    persistAutosave, readJson, refreshSaveOptions, renderComparison, replaceUnit, restoreSnapshot,
    saveNamed,
  });

  function adoptPreSizingSeed(definition) {
    const seed = definition?.operation?.preSizingSeed;
    app.preSizingSeed = seed && Number(seed.brineKg) > 0 && seed.streams ? clone(seed) : null;
  }

  function loadCase(definition, selection) {
    app.clearCashflowBanner();
    app.routeNote = '';
    adoptPreSizingSeed(definition);
    app.site = definition.site || null;
    app.operationMeta = {
      priorities: definition.operation?.priorities ? clone(definition.operation.priorities) : undefined,
      boundaryLimitedBy: definition.operation?.boundaryLimitedBy
        ? clone(definition.operation.boundaryLimitedBy)
        : undefined,
    };
    Object.assign(app.projectEconomics, definition.economics || {});
    app.graph.nodes.length = 0;
    app.graph.edges.length = 0;
    Object.keys(app.setpoints).forEach(key => delete app.setpoints[key]);
    Object.keys(app.counts).forEach(key => delete app.counts[key]);
    for (const saved of definition.graph.nodes) {
      app.counts[saved.unit] = (app.counts[saved.unit] || 0) + 1;
      const kind = app.units[saved.unit].kind;
      const stream = saved.params?.stream;
      app.graph.nodes.push({
        ...saved,
        label: app.nodeDisplayLabel(saved),
        position: app.positionFor(kind, app.graph.nodes.filter(current => app.units[current.unit].kind === kind).length),
        ...(kind === 'converter' && app.catalog[saved.unit].presets ? { processPreset: 'custom' } : {}),
        ...(kind === 'source' ? {
          rate: stream?.kind === 'material' ? FlowsheetModel.streamMassKg(stream)
            : stream?.kind === 'consumable' ? stream.amount : stream?.kWh,
          ...(saved.sourcePreset ? { sourcePreset: saved.sourcePreset } : saved.id === 'air' ? { sourcePreset: 'air' } : saved.id === 'seawater' ? { sourcePreset: 'seawater' } : {}),
          ...(stream?.kind === 'heat' ? { temperature: stream.T_C } : {}),
        } : {}),
      });
    }
    for (const current of app.graph.nodes) current.economics ||= app.defaultEconomics(current);
    app.graph.edges.push(...definition.graph.edges.map(edge => ({ ...edge })));
    Object.assign(app.setpoints, definition.operation.setpoints);
    app.selectedNodeId = selection;
    app.pendingPort = null;
    app.undoStack = [];
    app.redoStack = [];
    app.undoGesture = null;
    app.syncRedoButton();
    app.autoArrange();
    app.solveAndRender();
    const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => fn();
    schedule(() => app.fitCanvas());
  }

  function replaceUnit(nodeId, nextUnit) {
    const current = app.node(nodeId);
    const definition = app.catalog[nextUnit];
    if (!current || !definition || !app.units[nextUnit] || app.units[nextUnit].kind !== app.units[current.unit].kind) return false;
    const previousPorts = app.units[current.unit].ports;
    const nextPorts = app.units[nextUnit].ports;
    const dropped = [];
    app.graph.edges = app.graph.edges.filter(edge => {
      const onNode = edge.from.node === nodeId || edge.to.node === nodeId;
      if (!onNode) return true;
      const outgoing = edge.from.node === nodeId;
      const port = outgoing ? edge.from.port : edge.to.port;
      const next = nextPorts[port];
      const previous = previousPorts[port];
      if (!next || next.direction !== (outgoing ? 'out' : 'in') || next.kind !== previous?.kind) {
        dropped.push(app.portName(port));
        return false;
      }
      if (next.kind === 'consumable' && !outgoing) {
        const required = app.catalog[nextUnit].chemicalId;
        const supply = app.node(edge.from.node)?.params?.stream;
        if (required && supply?.chemicalId !== required) {
          dropped.push(`${app.portName(port)} (${supply?.chemicalId || 'unspecified'} ≠ ${required})`);
          return false;
        }
      }
      return true;
    });
    current.unit = nextUnit;
    current.label = definition.label;
    current.params = { ...(definition.params || {}) };
    if (Number.isFinite(definition.capacity)) current.capacity = definition.capacity;
    if (Number.isFinite(definition.rate) && app.setpoints[nodeId] != null) {
      app.setpoints[nodeId] = Math.min(app.setpoints[nodeId], current.capacity);
    }
    delete current.processPreset;
    app.selectedNodeId = nodeId;
    completeNodePorts(nodeId);
    app.routeNote = dropped.length
      ? `Route changed. Disconnected: ${dropped.join(', ')}. Existing reagent supplies were not converted.`
      : '';
    app.solveAndRender();
    return true;
  }

  function completeNodePorts(nodeId) {
    const current = app.node(nodeId);
    for (const [port, declaration] of Object.entries(app.units[current.unit].ports)) {
      if (!declaration.required) continue;
      if (app.edgeAt({ node: nodeId, port, direction: declaration.direction }) >= 0) continue;
      if (!app.catalog[`${declaration.kind}-${declaration.direction === 'in' ? 'source' : 'sink'}`]) continue;
      app.addBoundaryNode({ node: nodeId, port, direction: declaration.direction }, true);
    }
  }

  function snapshot() {
    return { version: 1, graph: app.graph, setpoints: app.setpoints, selectedNodeId: app.selectedNodeId, projectEconomics: app.projectEconomics, canvasZoom: app.canvasZoom, site: app.site, preSizingSeed: app.preSizingSeed };
  }

  function persistAutosave() {
    if (!app.storage) return;
    try { app.storage.setItem(app.AUTOSAVE_KEY, JSON.stringify(snapshot())); } catch { /* Storage may be unavailable or full. */ }
  }

  function readJson(key) {
    if (!app.storage) return null;
    try { return JSON.parse(app.storage.getItem(key)); } catch { return null; }
  }

  function restoreSnapshot(saved) {
    if (saved?.version !== 1 || !Array.isArray(saved.graph?.nodes) || !Array.isArray(saved.graph?.edges)) return false;
    const savedNodes = saved.graph.nodes.filter(current => current && typeof current.id === 'string'
      && app.catalog[current.unit] && Number.isFinite(current.position?.x) && Number.isFinite(current.position?.y));
    const ids = new Set(savedNodes.map(current => current.id));
    if (ids.size !== savedNodes.length) return false;
    const savedEdges = saved.graph.edges.filter(edge => {
      const from = savedNodes.find(current => current.id === edge?.from?.node);
      const to = savedNodes.find(current => current.id === edge?.to?.node);
      const output = from && app.units[from.unit].ports[edge.from.port];
      const input = to && app.units[to.unit].ports[edge.to.port];
      return ids.has(edge?.from?.node) && ids.has(edge?.to?.node)
        && output?.direction === 'out' && input?.direction === 'in' && output.kind === input.kind;
    });
    app.graph.nodes.splice(0, app.graph.nodes.length, ...savedNodes);
    app.graph.edges.splice(0, app.graph.edges.length, ...savedEdges);
    Object.keys(app.setpoints).forEach(key => delete app.setpoints[key]);
    for (const [id, value] of Object.entries(saved.setpoints || {})) {
      if (ids.has(id) && Number.isFinite(value) && value >= 0) app.setpoints[id] = value;
    }
    Object.keys(app.counts).forEach(key => delete app.counts[key]);
    for (const current of app.graph.nodes) {
      const suffix = Number(current.id.match(/-(\d+)$/)?.[1]) || 0;
      app.counts[current.unit] = Math.max(app.counts[current.unit] || 0, suffix);
    }
    app.selectedNodeId = ids.has(saved.selectedNodeId) ? saved.selectedNodeId : null;
    for (const current of app.graph.nodes) {
      current.economics ||= app.defaultEconomics(current);
      app.applyPracticalIntakeLabel(current);
    }
    Object.assign(app.projectEconomics, saved.projectEconomics || {});
    app.canvasZoom = app.clampZoom(saved.canvasZoom ?? 1);
    app.site = saved.site || null;
    app.preSizingSeed = saved.preSizingSeed && Number(saved.preSizingSeed.brineKg) > 0 ? clone(saved.preSizingSeed) : null;
    app.pendingPort = null;
    return true;
  }

  function saveNamed(name) {
    if (!app.storage) return false;
    const saves = readJson(app.SAVES_KEY) || {};
    saves[name] = snapshot();
    try { app.storage.setItem(app.SAVES_KEY, JSON.stringify(saves)); } catch { return false; }
    refreshSaveOptions(name);
    return true;
  }

  function loadNamed(name) {
    const saved = (readJson(app.SAVES_KEY) || {})[name];
    if (!restoreSnapshot(saved)) return false;
    app.clearCashflowBanner();
    refreshSaveOptions(name);
    app.solveAndRender();
    return true;
  }

  function deleteNamed(name) {
    if (!app.storage) return;
    const saves = readJson(app.SAVES_KEY) || {};
    delete saves[name];
    app.storage.setItem(app.SAVES_KEY, JSON.stringify(saves));
    refreshSaveOptions();
  }

  function clone(value) {
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  }

  function captureBaseline() {
    app.baseline = { economics: app.currentEconomics ? clone(app.currentEconomics) : null };
    renderComparison();
    return true;
  }

  function clearBaseline() {
    app.baseline = null;
    renderComparison();
  }

  function deltaValue(current, previous) {
    return Number.isFinite(current) && Number.isFinite(previous) ? current - previous : null;
  }

  function formatDelta(value, format = app.formatMoney) {
    if (!Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${format(value)}`;
  }

  function formatRate(value) {
    if (!Number.isFinite(value)) return '—';
    return `${app.formatNumber(value * 100)}%`;
  }

  function renderComparison() {
    const panel = document.getElementById('comparisonPanel');
    const status = document.getElementById('comparisonStatus');
    const metrics = document.getElementById('comparisonMetrics');
    const ledger = document.getElementById('synergyLedger');
    const clear = document.getElementById('clearBaseline');
    if (!panel || !status || !metrics || !ledger) return;
    clear.disabled = !app.baseline;
    panel.hidden = !app.baseline;
    if (!app.baseline) { status.textContent = ''; metrics.innerHTML = ''; ledger.innerHTML = ''; return; }

    const current = app.currentEconomics;
    const previous = app.baseline.economics;
    if (!current || !previous) {
      status.textContent = !app.result ? 'Current graph is incomplete.' : !current ? 'Current economics unavailable.' : 'Baseline economics unavailable — capture a complete graph.';
      metrics.innerHTML = '';
      ledger.innerHTML = '';
      return;
    }
    status.textContent = 'Current graph compared with captured baseline';
    const rows = [
      ['CAPEX', current.installedCapex, previous.installedCapex, app.formatMoney],
      ['Annual revenue', current.annualRevenue, previous.annualRevenue, app.formatMoney],
      ['Annual cost', current.annualOperatingCost, previous.annualOperatingCost, app.formatMoney],
      ['Annualized CAPEX', current.annualizedCapex, previous.annualizedCapex, app.formatMoney],
      ['Annual net cash', current.annualNetCash, previous.annualNetCash, app.formatMoney],
      ['NPV', current.npv, previous.npv, app.formatMoney],
      ['IRR', current.irr, previous.irr, formatRate],
    ];
    metrics.innerHTML = rows.map(([label, value, oldValue, format]) => {
      const delta = label === 'IRR' && Number.isFinite(value) && Number.isFinite(oldValue)
        ? (value - oldValue) * 100
        : deltaValue(value, oldValue);
      const direction = ['Annual revenue', 'Annual net cash', 'NPV', 'IRR'].includes(label) ? delta : -delta;
      const cls = direction > 0 ? 'positive' : direction < 0 ? 'negative' : '';
      const deltaLabel = label === 'IRR' ? formatDelta(delta, value => `${app.formatNumber(value)} pp`) : formatDelta(delta, format);
      return `<div><dt>${label}</dt><dd class="${cls}">${Number.isFinite(value) ? format(value) : '—'} <small>${deltaLabel}</small></dd></div>`;
    }).join('');
    // ponytail: annual aggregate ledger; add per-stream provenance when economics exposes it.
    const synergies = [
      ['Avoided source purchases', deltaValue(previous.breakdown.sourcePurchases, current.breakdown.sourcePurchases)],
      ['Avoided disposal', deltaValue(previous.breakdown.disposalCost, current.breakdown.disposalCost)],
      ['Additional product revenue', deltaValue(current.breakdown.productRevenue, previous.breakdown.productRevenue)],
    ].filter(([, value]) => Number.isFinite(value));
    const netSynergy = synergies.reduce((sum, [, value]) => sum + value, 0);
    if (synergies.length) synergies.push(['Net synergy value', netSynergy]);
    ledger.innerHTML = synergies.length
      ? synergies.map(([label, value]) => `<div class="synergy-row"><span>${label}</span><strong class="${value >= 0 ? 'positive' : 'negative'}">${formatDelta(value)}</strong></div>`).join('')
      : '<p class="status-meta">No comparable purchase, disposal, or product-revenue breakdowns.</p>';
  }

  function refreshSaveOptions(selected = '') {
    const saves = readJson(app.SAVES_KEY) || {};
    const select = document.getElementById('factorySaves');
    select.innerHTML = `<option value="">Autosave</option>${Object.keys(saves).sort().map(name => `<option value="${encodeURIComponent(name)}"${name === selected ? ' selected' : ''}>${app.escapeHtml(name)}</option>`).join('')}`;
  }
})();
