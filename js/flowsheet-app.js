(() => {
  const canvas = document.getElementById('flowsheetCanvas');
  const inspector = document.querySelector('.inspector-sidebar');
  const units = FlowsheetUnits.UNITS;
  const graph = { nodes: [], edges: [] };
  const setpoints = {};
  const counts = {};
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const AUTOSAVE_KEY = 'molecular-foundry.autosave.v1';
  const SAVES_KEY = 'molecular-foundry.saves.v1';
  let selectedNodeId = null;
  let pendingPort = null;
  let result = null;
  let solveError = '';
  let dragging = null;
  let suppressClick = false;

  const catalog = {
    swro: { label: 'SWRO', capacity: 100, rate: 40, activityUnit: 'm³ water/day', params: { recovery: 0.45, secKWhPerM3: 3.5, feedDensityKgM3: 1025, productDensityKgM3: 1000, ionRejection: 0.99 } },
    electrolyzer: { label: 'Electrolyzer', capacity: 100, rate: 10, activityUnit: 'kg H₂/day', params: { secKWhPerKgH2: 50 } },
    dac: { label: 'DAC', capacity: 100, rate: 10, activityUnit: 'kg CO₂/day', params: { captureFraction: 0.9, electricityKWhPerKgCO2: 0.5, heatKWhPerKgCO2: 1.5, minHeatT_C: 80, consumablesPerKgCO2: 0.02 } },
    sabatier: { label: 'Sabatier', capacity: 100, rate: 5, activityUnit: 'kg CH₄/day', params: { electricityKWhPerKgCH4: 1 } },
    'material-source': { label: 'Material source' },
    'electricity-source': { label: 'Electricity source' },
    'heat-source': { label: 'Heat source' },
    'consumable-source': { label: 'Consumables' },
    'material-sink': { label: 'Material sink' },
    'heat-sink': { label: 'Heat sink' },
  };
  const portNames = {
    air: 'Feed gas', electricity: 'Electricity', heat: 'Process heat', consumables: 'Consumables',
    capturedCo2: 'Captured CO₂', depletedAir: 'Depleted gas', feed: 'Feed water', product: 'Fresh water',
    brine: 'Brine', water: 'Water', hydrogen: 'Hydrogen', oxygen: 'Oxygen', waterReject: 'Reject water',
    co2: 'CO₂', methane: 'Methane', out: 'Output', in: 'Input',
    wasteHeat: 'Waste heat',
  };
  const materialPresets = {
    air: { label: 'Ambient air', phase: 'gas', mol: { CO2: 428, O2: 211409, N2: 788163 } },
    seawater: { label: 'Seawater', phase: 'liquid', mol: { H2O: 53500, 'Na+': 550, 'Cl-': 550 } },
    water: { label: 'Pure water', phase: 'liquid', mol: { H2O: 1000 } },
    co2: { label: 'Carbon dioxide', phase: 'gas', mol: { CO2: 1000 } },
    hydrogen: { label: 'Hydrogen', phase: 'gas', mol: { H2: 1000 } },
    oxygen: { label: 'Oxygen', phase: 'gas', mol: { O2: 1000 } },
  };

  document.getElementById('buildingPalette').addEventListener('click', addFromPalette);
  document.getElementById('utilityPalette').addEventListener('click', addFromPalette);
  document.getElementById('clearFactory').addEventListener('click', clearFactory);
  document.getElementById('autoArrange').addEventListener('click', autoArrange);
  document.getElementById('completeBoundaries').addEventListener('click', completeBoundaries);
  document.getElementById('saveFactory').addEventListener('click', () => {
    const name = window.prompt('Name this factory save:')?.trim();
    if (name) saveNamed(name);
  });
  document.getElementById('deleteFactorySave').addEventListener('click', () => {
    const value = document.getElementById('factorySaves').value;
    if (value) deleteNamed(decodeURIComponent(value));
  });
  document.getElementById('factorySaves').addEventListener('change', event => {
    if (event.target.value) loadNamed(decodeURIComponent(event.target.value));
    else restoreSnapshot(readJson(AUTOSAVE_KEY)) && solveAndRender();
  });
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('pointerdown', startDrag);
  canvas.addEventListener('pointermove', dragNode);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleCanvasClick(event);
  });
  inspector.addEventListener('input', handleInspectorInput);
  inspector.addEventListener('change', handleInspectorInput);
  inspector.addEventListener('click', handleInspectorClick);

  function addFromPalette(event) {
    const unit = event.target.closest('[data-unit]')?.dataset.unit;
    if (unit) addNode(unit);
  }

  function addNode(unit, options = {}) {
    const number = (counts[unit] || 0) + 1;
    counts[unit] = number;
    const id = `${unit}-${number}`;
    const definition = catalog[unit];
    const kind = units[unit].kind;
    const sameKindCount = graph.nodes.filter(candidate => units[candidate.unit].kind === kind).length;
    const current = {
      id, unit, label: options.label || `${definition.label} ${number}`,
      capacity: definition.capacity, params: { ...(definition.params || {}) },
      position: positionFor(kind, sameKindCount),
    };
    if (kind === 'source') configureNewSource(current, options.preset);
    if (kind === 'converter') setpoints[id] = definition.rate;
    graph.nodes.push(current);
    if (!options.silent) {
      selectedNodeId = id;
      pendingPort = null;
      solveAndRender();
    }
    return current;
  }

  function configureNewSource(current, preset) {
    if (current.unit === 'material-source') {
      current.sourcePreset = preset || 'air';
      current.rate = current.sourcePreset === 'air' ? 25000 : 100;
    } else if (current.unit === 'electricity-source') current.rate = 1000;
    else if (current.unit === 'heat-source') { current.rate = 100; current.temperature = 100; }
    else current.rate = 10;
    updateSourceStream(current);
  }

  function positionFor(kind, index) {
    if (kind === 'source') return { x: 40, y: 40 + index * 150 };
    if (kind === 'sink') return { x: 1120, y: 40 + index * 150 };
    return { x: 370 + (index % 2) * 360, y: 40 + Math.floor(index / 2) * 200 };
  }

  function updateSourceStream(current) {
    if (current.unit === 'material-source') current.params.stream = materialStream(current.sourcePreset, current.rate);
    if (current.unit === 'electricity-source') current.params.stream = { kind: 'electricity', kWh: current.rate };
    if (current.unit === 'heat-source') current.params.stream = { kind: 'heat', kWh: current.rate, T_C: current.temperature };
    if (current.unit === 'consumable-source') current.params.stream = { kind: 'consumable', amount: current.rate, unit: 'kg/day', label: 'Sorbent makeup' };
  }

  function materialStream(presetId, targetKg) {
    const preset = materialPresets[presetId];
    const base = { kind: 'material', mol: { ...preset.mol }, phase: preset.phase, T_C: 25, P_bar: 1 };
    const factor = targetKg / FlowsheetModel.streamMassKg(base);
    return { ...base, mol: Object.fromEntries(Object.entries(base.mol).map(([id, mol]) => [id, mol * factor])) };
  }

  function clearFactory() {
    graph.nodes.length = 0;
    graph.edges.length = 0;
    Object.keys(setpoints).forEach(key => delete setpoints[key]);
    Object.keys(counts).forEach(key => delete counts[key]);
    selectedNodeId = null;
    pendingPort = null;
    solveAndRender();
  }

  function snapshot() {
    return { version: 1, graph, setpoints, selectedNodeId };
  }

  function persistAutosave() {
    if (!storage) return;
    try { storage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot())); } catch { /* Storage may be unavailable or full. */ }
  }

  function readJson(key) {
    if (!storage) return null;
    try { return JSON.parse(storage.getItem(key)); } catch { return null; }
  }

  function restoreSnapshot(saved) {
    if (saved?.version !== 1 || !Array.isArray(saved.graph?.nodes) || !Array.isArray(saved.graph?.edges)) return false;
    const savedNodes = saved.graph.nodes.filter(current => current && typeof current.id === 'string'
      && catalog[current.unit] && Number.isFinite(current.position?.x) && Number.isFinite(current.position?.y));
    const ids = new Set(savedNodes.map(current => current.id));
    if (ids.size !== savedNodes.length) return false;
    const savedEdges = saved.graph.edges.filter(edge => {
      const from = savedNodes.find(current => current.id === edge?.from?.node);
      const to = savedNodes.find(current => current.id === edge?.to?.node);
      const output = from && units[from.unit].ports[edge.from.port];
      const input = to && units[to.unit].ports[edge.to.port];
      return ids.has(edge?.from?.node) && ids.has(edge?.to?.node)
        && output?.direction === 'out' && input?.direction === 'in' && output.kind === input.kind;
    });
    graph.nodes.splice(0, graph.nodes.length, ...savedNodes);
    graph.edges.splice(0, graph.edges.length, ...savedEdges);
    Object.keys(setpoints).forEach(key => delete setpoints[key]);
    for (const [id, value] of Object.entries(saved.setpoints || {})) {
      if (ids.has(id) && Number.isFinite(value) && value >= 0) setpoints[id] = value;
    }
    Object.keys(counts).forEach(key => delete counts[key]);
    for (const current of graph.nodes) {
      const suffix = Number(current.id.match(/-(\d+)$/)?.[1]) || 0;
      counts[current.unit] = Math.max(counts[current.unit] || 0, suffix);
    }
    selectedNodeId = ids.has(saved.selectedNodeId) ? saved.selectedNodeId : null;
    pendingPort = null;
    return true;
  }

  function saveNamed(name) {
    if (!storage) return false;
    const saves = readJson(SAVES_KEY) || {};
    saves[name] = snapshot();
    try { storage.setItem(SAVES_KEY, JSON.stringify(saves)); } catch { return false; }
    refreshSaveOptions(name);
    return true;
  }

  function loadNamed(name) {
    const saved = (readJson(SAVES_KEY) || {})[name];
    if (!restoreSnapshot(saved)) return false;
    refreshSaveOptions(name);
    solveAndRender();
    return true;
  }

  function deleteNamed(name) {
    if (!storage) return;
    const saves = readJson(SAVES_KEY) || {};
    delete saves[name];
    storage.setItem(SAVES_KEY, JSON.stringify(saves));
    refreshSaveOptions();
  }

  function refreshSaveOptions(selected = '') {
    const saves = readJson(SAVES_KEY) || {};
    const select = document.getElementById('factorySaves');
    select.innerHTML = `<option value="">Autosave</option>${Object.keys(saves).sort().map(name => `<option value="${encodeURIComponent(name)}"${name === selected ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}`;
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function startDrag(event) {
    if (event.target.closest('[data-port]')) return;
    const nodeId = event.target.closest('[data-node]')?.dataset.node;
    if (!nodeId) return;
    const point = graphPoint(event);
    const position = node(nodeId).position;
    dragging = { nodeId, pointerId: event.pointerId, dx: point.x - position.x, dy: point.y - position.y, moved: false };
    selectedNodeId = nodeId;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function dragNode(event) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const point = graphPoint(event);
    const current = node(dragging.nodeId);
    const x = Math.max(10, Math.min(1170, point.x - dragging.dx));
    const y = Math.max(10, point.y - dragging.dy);
    dragging.moved ||= Math.abs(x - current.position.x) > 2 || Math.abs(y - current.position.y) > 2;
    current.position = { x, y };
    renderGraph();
  }

  function endDrag(event) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    suppressClick = dragging.moved;
    canvas.releasePointerCapture?.(event.pointerId);
    dragging = null;
    persistAutosave();
    render();
  }

  function graphPoint(event) {
    const svg = canvas.querySelector('svg');
    const bounds = svg.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * 1400 / bounds.width,
      y: (event.clientY - bounds.top) * svg.viewBox.baseVal.height / bounds.height,
    };
  }

  function autoArrange() {
    const depths = new Map(graph.nodes.map(current => [current.id, units[current.unit].kind === 'source' ? 0 : units[current.unit].kind === 'sink' ? 2 : 1]));
    const outgoing = new Map(graph.nodes.map(current => [current.id, []]));
    const indegree = new Map(graph.nodes.map(current => [current.id, 0]));
    for (const edge of graph.edges) {
      outgoing.get(edge.from.node).push(edge.to.node);
      indegree.set(edge.to.node, indegree.get(edge.to.node) + 1);
    }
    const queue = graph.nodes.filter(current => indegree.get(current.id) === 0).map(current => current.id);
    while (queue.length) {
      const id = queue.shift();
      for (const target of outgoing.get(id)) {
        depths.set(target, Math.max(depths.get(target), depths.get(id) + 1));
        indegree.set(target, indegree.get(target) - 1);
        if (indegree.get(target) === 0) queue.push(target);
      }
    }
    const layers = new Map();
    for (const current of graph.nodes) {
      const depth = depths.get(current.id);
      if (!layers.has(depth)) layers.set(depth, []);
      layers.get(depth).push(current);
    }
    const maxDepth = Math.max(0, ...layers.keys());
    const xStep = maxDepth ? Math.min(300, 1080 / maxDepth) : 0;
    for (const [depth, layer] of layers) {
      let y = 40;
      for (const current of layer) {
        current.position = { x: 40 + depth * xStep, y };
        y += nodeHeight(current) + 40;
      }
    }
    persistAutosave();
    renderGraph();
  }

  function handleCanvasClick(event) {
    if (suppressClick) { suppressClick = false; return; }
    const port = event.target.closest('[data-port]');
    if (port) {
      choosePort({ node: port.dataset.node, port: port.dataset.port, direction: port.dataset.direction });
      return;
    }
    const nodeId = event.target.closest('[data-node]')?.dataset.node;
    if (nodeId) { selectedNodeId = nodeId; render(); }
  }

  function choosePort(endpoint) {
    selectedNodeId = endpoint.node;
    if (!pendingPort) { pendingPort = endpoint; render(); return; }
    if (pendingPort.node === endpoint.node && pendingPort.port === endpoint.port) { pendingPort = null; render(); return; }
    const from = pendingPort.direction === 'out' ? pendingPort : endpoint;
    const to = pendingPort.direction === 'in' ? pendingPort : endpoint;
    const fromDeclaration = units[node(from.node).unit].ports[from.port];
    const toDeclaration = units[node(to.node).unit].ports[to.port];
    solveError = '';
    if (from.direction !== 'out' || to.direction !== 'in') solveError = 'Connect an output port to an input port.';
    else if (fromDeclaration.kind !== toDeclaration.kind) solveError = `Cannot connect ${fromDeclaration.kind} to ${toDeclaration.kind}.`;
    else if (edgeAt(from) >= 0 || edgeAt(to) >= 0) solveError = 'That port is already connected. Disconnect it first.';
    else graph.edges.push({ from: { node: from.node, port: from.port }, to: { node: to.node, port: to.port } });
    pendingPort = null;
    solveAndRender();
  }

  function addBoundaryNode(target, silent = false) {
    const current = node(target.node);
    const kind = units[current.unit].ports[target.port].kind;
    if (target.direction === 'in') {
      const source = addNode(`${kind}-source`, { preset: suggestedPreset(current.unit, target.port), silent });
      graph.edges.push({ from: { node: source.id, port: 'out' }, to: { node: target.node, port: target.port } });
      return source;
    }
    const sink = addNode(`${kind}-sink`, { label: `${portName(target.port)} sink`, silent });
    graph.edges.push({ from: { node: target.node, port: target.port }, to: { node: sink.id, port: 'in' } });
    return sink;
  }

  function completeBoundaries() {
    const selection = selectedNodeId;
    const targets = graph.nodes
      .filter(current => units[current.unit].kind === 'converter')
      .flatMap(current => Object.entries(units[current.unit].ports)
        .filter(([port, declaration]) => declaration.required
          && edgeAt({ node: current.id, port, direction: declaration.direction }) < 0
          && catalog[`${declaration.kind}-${declaration.direction === 'in' ? 'source' : 'sink'}`])
        .map(([port, declaration]) => ({ node: current.id, port, direction: declaration.direction })));
    targets.forEach(target => addBoundaryNode(target, true));
    selectedNodeId = selection;
    pendingPort = null;
    solveAndRender();
  }

  function handleInspectorInput(event) {
    const current = node(selectedNodeId);
    if (!current) return;
    if (event.target.name === 'requestedRate') setpoints[current.id] = Number(event.target.value);
    if (event.target.name === 'sourceRate') { current.rate = Number(event.target.value); updateSourceStream(current); }
    if (event.target.name === 'sourcePreset') { current.sourcePreset = event.target.value; updateSourceStream(current); }
    if (event.target.name === 'heatTemperature') { current.temperature = Number(event.target.value); updateSourceStream(current); }
    solveAndRender();
  }

  function handleInspectorClick(event) {
    const disconnect = event.target.closest('[data-disconnect]');
    if (disconnect) {
      graph.edges.splice(Number(disconnect.dataset.disconnect), 1);
      pendingPort = null;
      solveAndRender();
      return;
    }
    const addBoundary = event.target.closest('[data-boundary-port]');
    if (addBoundary) {
      const target = { node: selectedNodeId, port: addBoundary.dataset.boundaryPort, direction: addBoundary.dataset.direction };
      addBoundaryNode(target, true);
      selectedNodeId = target.node;
      solveAndRender();
      return;
    }
    if (event.target.closest('#deleteNode')) {
      const id = selectedNodeId;
      graph.edges = graph.edges.filter(edge => edge.from.node !== id && edge.to.node !== id);
      graph.nodes.splice(graph.nodes.findIndex(candidate => candidate.id === id), 1);
      delete setpoints[id];
      selectedNodeId = null;
      pendingPort = null;
      solveAndRender();
    }
  }

  function suggestedPreset(unit, port) {
    return { 'dac.air': 'air', 'swro.feed': 'seawater', 'electrolyzer.water': 'water', 'sabatier.co2': 'co2', 'sabatier.hydrogen': 'hydrogen' }[`${unit}.${port}`] || 'water';
  }

  function solveAndRender() {
    result = null;
    if (graph.nodes.length && missingConnections().length === 0) {
      try {
        result = FlowsheetSolver.solveOperation({ graph, operation: { setpoints } });
        solveError = '';
      } catch (error) { solveError = error.message; }
    }
    persistAutosave();
    render();
  }

  function missingConnections() {
    const missing = [];
    for (const current of graph.nodes) {
      for (const [port, declaration] of Object.entries(units[current.unit].ports)) {
        if (declaration.required && edgeAt({ node: current.id, port, direction: declaration.direction }) < 0) missing.push(`${current.label}: ${portName(port)}`);
      }
    }
    return missing;
  }

  function edgeAt(endpoint) {
    return graph.edges.findIndex(edge => endpoint.direction === 'out'
      ? edge.from.node === endpoint.node && edge.from.port === endpoint.port
      : edge.to.node === endpoint.node && edge.to.port === endpoint.port);
  }

  function node(id) { return graph.nodes.find(candidate => candidate.id === id); }
  function portName(port) { return portNames[port] || port.replace(/([a-z])([A-Z])/g, '$1 $2'); }

  function render() { renderGraph(); renderStatus(); renderInspector(); }

  function renderGraph() {
    if (!graph.nodes.length) {
      canvas.classList.add('empty');
      canvas.innerHTML = '<p class="empty-canvas">Add a process block or source to begin.</p>';
      return;
    }
    canvas.classList.remove('empty');
    const height = Math.max(620, ...graph.nodes.map(current => current.position.y + nodeHeight(current) + 40));
    const edges = graph.edges.map(edge => {
      const start = portPoint(edge.from.node, edge.from.port, 'out');
      const end = portPoint(edge.to.node, edge.to.port, 'in');
      const mid = (start.x + end.x) / 2;
      const stream = result?.streams.find(candidate => candidate.from.node === edge.from.node && candidate.from.port === edge.from.port)?.stream;
      const kind = units[node(edge.from.node).unit].ports[edge.from.port].kind;
      const constrained = bottlenecksFor(edge.to.node).some(limit => limitingPort(node(edge.to.node), limit) === edge.to.port);
      return `<path class="flow-edge ${kind}${constrained ? ' bottleneck' : ''}" d="M${start.x} ${start.y} C${mid} ${start.y},${mid} ${end.y},${end.x} ${end.y}"/><text class="edge-label${constrained ? ' bottleneck' : ''}" x="${mid}" y="${(start.y + end.y) / 2 - 7}" text-anchor="middle">${stream ? formatStream(stream) : ''}</text>`;
    }).join('');
    canvas.innerHTML = `<svg viewBox="0 0 1400 ${height}" aria-label="Editable factory flowsheet">${edges}${graph.nodes.map(renderNode).join('')}</svg>`;
  }

  function renderNode(current) {
    const ports = Object.entries(units[current.unit].ports);
    const inputs = ports.filter(([, declaration]) => declaration.direction === 'in');
    const outputs = ports.filter(([, declaration]) => declaration.direction === 'out');
    const { x, y } = current.position;
    const height = nodeHeight(current);
    const nodeResult = result?.nodes[current.id];
    const bottlenecks = bottlenecksFor(current.id);
    const value = nodeResult?.activity !== undefined ? `${formatNumber(nodeResult.activity)} ${catalog[current.unit].activityUnit}` : nodeResult ? formatStream(nodeResult.supplied || nodeResult.received || nodeResult.available) : 'Not running';
    const portMarkup = (list, direction) => list.map(([port, declaration], index) => {
      const cy = y + 66 + index * 24;
      const cx = direction === 'in' ? x : x + 220;
      const selected = pendingPort?.node === current.id && pendingPort.port === port;
      return `<g class="flow-port ${declaration.kind}${selected ? ' pending' : ''}" data-node="${current.id}" data-port="${port}" data-direction="${direction}" role="button" tabindex="0"><circle cx="${cx}" cy="${cy}" r="7"/><text x="${direction === 'in' ? cx + 13 : cx - 13}" y="${cy + 4}" text-anchor="${direction === 'in' ? 'start' : 'end'}">${portName(port)}</text></g>`;
    }).join('');
    return `<g class="flow-node${bottlenecks.length ? ' bottleneck' : ''}${current.id === selectedNodeId ? ' selected' : ''}" data-node="${current.id}" tabindex="0">${bottlenecks.length ? `<title>Bottleneck: ${bottlenecks.map(portName).join(', ')}</title>` : ''}<rect x="${x}" y="${y}" width="220" height="${height}" rx="10"/><text class="node-kind" x="${x + 16}" y="${y + 20}">${units[current.unit].kind}</text><text class="node-label" x="${x + 16}" y="${y + 42}">${current.label}</text><text class="node-value" x="${x + 16}" y="${y + height - 12}">${value}</text>${portMarkup(inputs, 'in')}${portMarkup(outputs, 'out')}</g>`;
  }

  function bottlenecksFor(nodeId) { return result?.nodes[nodeId]?.limitedBy || []; }
  function limitingPort(current, limit) { return current.unit === 'dac' && limit === 'feed' ? 'air' : limit; }

  function nodeHeight(current) {
    const ports = Object.values(units[current.unit].ports);
    return Math.max(104, 82 + Math.max(ports.filter(port => port.direction === 'in').length, ports.filter(port => port.direction === 'out').length) * 24);
  }

  function portPoint(nodeId, port, direction) {
    const current = node(nodeId);
    const ports = Object.entries(units[current.unit].ports).filter(([, declaration]) => declaration.direction === direction);
    return { x: current.position.x + (direction === 'out' ? 220 : 0), y: current.position.y + 66 + ports.findIndex(([name]) => name === port) * 24 };
  }

  function renderStatus() {
    const missing = missingConnections();
    const bottlenecks = graph.nodes.flatMap(current => bottlenecksFor(current.id).map(limit => `${current.label}: ${portName(limit)}`));
    const solveStatus = document.getElementById('solveStatus');
    const balanceStatus = document.getElementById('balanceStatus');
    document.getElementById('flowSummary').textContent = `${graph.nodes.length} blocks · ${graph.edges.length} connections`;
    document.getElementById('diagramTitle').textContent = graph.nodes.length ? 'Factory canvas' : 'Blank factory';
    solveStatus.textContent = !graph.nodes.length ? 'Empty factory' : result ? 'Factory running' : 'Factory incomplete';
    solveStatus.className = `status-chip${result ? ' good' : missing.length || solveError ? ' warn' : ''}`;
    balanceStatus.textContent = result ? (result.balances.maxAbsResidual < 1e-8 ? 'Balances closed' : 'Check balances') : pendingPort ? 'Choose compatible port' : 'Manual setpoints';
    balanceStatus.className = `status-chip${result?.balances.maxAbsResidual < 1e-8 ? ' good' : ''}`;
    const warning = document.getElementById('warnings');
    warning.hidden = !solveError && !pendingPort && missing.length === 0 && bottlenecks.length === 0;
    warning.textContent = solveError || (pendingPort ? `Connecting ${node(pendingPort.node).label} · ${portName(pendingPort.port)} — choose a compatible ${pendingPort.direction === 'out' ? 'input' : 'output'}.` : missing.length ? `Connect ${missing.slice(0, 4).join(' · ')}${missing.length > 4 ? ` · +${missing.length - 4} more` : ''}` : bottlenecks.length ? `Bottleneck: ${bottlenecks.join(' · ')}` : '');
  }

  function renderInspector() {
    const current = node(selectedNodeId);
    if (!current) {
      document.getElementById('inspectorTitle').textContent = 'Nothing selected';
      document.getElementById('inspectorKind').textContent = 'Select a block to configure it.';
      document.getElementById('nodeControls').innerHTML = '';
      document.getElementById('inspectorMetrics').innerHTML = '';
      document.getElementById('streamList').innerHTML = '<p class="status-meta">No ports yet.</p>';
      document.getElementById('recipeList').innerHTML = '';
      document.getElementById('balanceList').innerHTML = '';
      return;
    }
    document.getElementById('inspectorTitle').textContent = current.label;
    document.getElementById('inspectorKind').textContent = `${units[current.unit].kind} · ${current.unit}`;
    document.getElementById('nodeControls').innerHTML = controlsFor(current);
    const nodeResult = result?.nodes[current.id];
    document.getElementById('inspectorMetrics').innerHTML = nodeResult?.activity !== undefined ? metricRows([
      ['Achieved', `${formatNumber(nodeResult.activity)} ${catalog[current.unit].activityUnit}`],
      ['Requested', `${formatNumber(setpoints[current.id])} ${catalog[current.unit].activityUnit}`],
      ['Limited by', nodeResult.limitedBy.join(', ') || 'Nothing'],
    ]) : '';
    document.getElementById('streamList').innerHTML = Object.entries(units[current.unit].ports).map(([port, declaration]) => renderInspectorPort(current, port, declaration)).join('');
    document.getElementById('recipeList').innerHTML = nodeResult?.requestedInputs ? `${recipeGroup('INFLOW', nodeResult.requestedInputs)}${recipeGroup('OUTFLOW', nodeResult.outlets)}` : '<p class="status-meta">Complete the graph to calculate flows.</p>';
    document.getElementById('balanceList').innerHTML = result ? metricRows([
      ...Object.entries(result.balances.elements).map(([element, value]) => [element, `${formatNumber(value)} mol`]),
      ['Electricity', `${formatNumber(result.balances.electricityKWh)} kWh`], ['Heat', `${formatNumber(result.balances.heatKWh)} kWh`],
    ]) : '';
  }

  function controlsFor(current) {
    const kind = units[current.unit].kind;
    if (kind === 'converter') return `<fieldset><legend>Independent setpoint</legend><label>Requested rate <output>${formatNumber(setpoints[current.id])} ${catalog[current.unit].activityUnit}</output></label><input name="requestedRate" type="range" min="0" max="${current.capacity}" step="1" value="${setpoints[current.id]}"></fieldset><button class="delete-node" id="deleteNode" type="button">Delete block</button>`;
    if (kind === 'source') {
      const max = current.unit === 'material-source' ? 100000 : current.unit === 'electricity-source' ? 10000 : current.unit === 'heat-source' ? 1000 : 100;
      const unit = current.unit === 'material-source' || current.unit === 'consumable-source' ? 'kg/day' : 'kWh/day';
      const preset = current.unit === 'material-source' ? `<label>Material</label><select name="sourcePreset">${Object.entries(materialPresets).map(([id, item]) => `<option value="${id}"${id === current.sourcePreset ? ' selected' : ''}>${item.label}</option>`).join('')}</select>` : '';
      const temperature = current.unit === 'heat-source' ? `<label>Temperature <output>${current.temperature} °C</output></label><input name="heatTemperature" type="range" min="20" max="200" step="5" value="${current.temperature}">` : '';
      return `<fieldset><legend>Source settings</legend>${preset}<label>Available rate <output>${formatNumber(current.rate)} ${unit}</output></label><input name="sourceRate" type="range" min="0" max="${max}" step="${max / 100}" value="${current.rate}">${temperature}</fieldset><button class="delete-node" id="deleteNode" type="button">Delete source</button>`;
    }
    return '<button class="delete-node" id="deleteNode" type="button">Delete sink</button>';
  }

  function renderInspectorPort(current, port, declaration) {
    const edgeIndex = edgeAt({ node: current.id, port, direction: declaration.direction });
    const edge = graph.edges[edgeIndex];
    const peerId = edge && (declaration.direction === 'in' ? edge.from.node : edge.to.node);
    const boundaryAllowed = edgeIndex < 0 && (declaration.direction === 'in' || catalog[`${declaration.kind}-sink`]);
    return `<div class="port-row"><div><span>${declaration.direction === 'in' ? 'IN' : 'OUT'} · ${declaration.kind}</span><strong>${portName(port)}</strong><small>${peerId ? `Connected to ${node(peerId).label}` : 'Not connected'}</small></div>${edgeIndex >= 0 ? `<button type="button" data-disconnect="${edgeIndex}">Disconnect</button>` : boundaryAllowed ? `<button type="button" data-boundary-port="${port}" data-direction="${declaration.direction}">${declaration.direction === 'in' ? 'Add source' : 'Send to sink'}</button>` : ''}</div>`;
  }

  function recipeGroup(title, streams) {
    return `<div class="recipe-group"><h4>${title}</h4>${Object.entries(streams).map(([port, stream]) => `<div class="recipe-flow"><strong>${portName(port)}</strong><span class="species">${formatStream(stream)}</span></div>`).join('')}</div>`;
  }

  function formatStream(stream) {
    if (!stream) return '—';
    if (stream.kind === 'material') return `${formatNumber(FlowsheetModel.streamMassKg(stream))} kg/day`;
    if (stream.kind === 'consumable') return `${formatNumber(stream.amount)} ${stream.unit}`;
    return `${formatNumber(stream.kWh)} kWh/day${stream.kind === 'heat' ? ` @ ${stream.T_C}°C` : ''}`;
  }

  function formatNumber(value) { return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function metricRows(rows) { return rows.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join(''); }

  window.__FLOWSHEET_APP__ = { graph, setpoints, addNode, choosePort, clearFactory, autoArrange, completeBoundaries, saveNamed, loadNamed, solve: solveAndRender, get result() { return result; } };
  refreshSaveOptions();
  if (restoreSnapshot(readJson(AUTOSAVE_KEY))) solveAndRender();
  else render();
})();
