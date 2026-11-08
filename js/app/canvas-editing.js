// Process canvas editing: drag, undo/redo, keyboard, zoom, tabs, port wiring.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    activateTab, addBoundaryNode, autoArrange, choosePort, clampZoom, clearCanvasSelection,
    completeBoundaries, contentSize, deleteSelection, dragNode, endDrag, fitCanvas,
    handleCanvasClick, handleCanvasWheel, handleProcessKeydown, handleTabListKeydown,
    noteInspectorUndo, nudgeSelectedNode, pushUndo, readSavedTab, redoLast, renderCanvasZoom,
    scheduleMapInvalidate, setCanvasFocus, setCanvasZoom, startDrag, syncRedoButton,
    toggleCanvasFocus, undoLast,
  });

  function startDrag(event) {
    if (event.button === 1 || event.shiftKey) return;
    if (event.target.closest('[data-port]')) return;
    const nodeId = event.target.closest('[data-node]')?.dataset.node;
    if (!nodeId) return;
    const point = graphPoint(event);
    const position = app.node(nodeId).position;
    app.dragging = {
      nodeId,
      pointerId: event.pointerId,
      dx: point.x - position.x,
      dy: point.y - position.y,
      moved: false,
      origin: { x: position.x, y: position.y },
    };
    app.selectedNodeId = nodeId;
    app.canvas.setPointerCapture?.(event.pointerId);
  }

  function dragNode(event) {
    if (!app.dragging || event.pointerId !== app.dragging.pointerId) return;
    const point = graphPoint(event);
    const current = app.node(app.dragging.nodeId);
    const x = Math.max(10, point.x - app.dragging.dx);
    const y = Math.max(10, point.y - app.dragging.dy);
    app.dragging.moved ||= Math.abs(x - current.position.x) > 2 || Math.abs(y - current.position.y) > 2;
    current.position = { x, y };
    app.renderGraph();
  }

  function endDrag(event) {
    if (!app.dragging || event.pointerId !== app.dragging.pointerId) return;
    const drag = app.dragging;
    app.suppressClick = drag.moved;
    app.canvas.releasePointerCapture?.(event.pointerId);
    app.dragging = null;
    if (drag.moved && drag.origin) {
      const current = app.node(drag.nodeId);
      const same = current && current.position.x === drag.origin.x && current.position.y === drag.origin.y;
      if (!same) {
        pushUndo({ type: 'move', nodeId: drag.nodeId, position: { x: drag.origin.x, y: drag.origin.y } });
        app.undoGesture = null;
      }
    }
    app.persistAutosave();
    app.render();
  }

  function graphPoint(event) {
    const svg = app.canvas.querySelector('svg');
    const bounds = svg.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * svg.viewBox.baseVal.width / bounds.width,
      y: (event.clientY - bounds.top) * svg.viewBox.baseVal.height / bounds.height,
    };
  }

  function isTypingTarget(el) {
    if (!el || typeof el !== 'object') return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function rememberUndo(entry) {
    app.undoStack.push(entry);
    if (app.undoStack.length > app.UNDO_STACK_MAX) app.undoStack.shift();
  }

  function syncRedoButton() {
    const button = document.getElementById('redoCanvas');
    if (!button) return;
    const empty = app.redoStack.length === 0;
    button.disabled = empty;
    if (typeof button.setAttribute === 'function') button.setAttribute('aria-disabled', empty ? 'true' : 'false');
  }

  function pushUndo(entry) {
    rememberUndo(entry);
    app.redoStack = [];
    syncRedoButton();
  }

  function pushRedo(entry) {
    app.redoStack.push(entry);
    if (app.redoStack.length > app.UNDO_STACK_MAX) app.redoStack.shift();
    syncRedoButton();
  }

  function cloneUndo(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function snapshotEntry() {
    return {
      type: 'snapshot',
      graph: { nodes: cloneUndo(app.graph.nodes), edges: cloneUndo(app.graph.edges) },
      setpoints: cloneUndo(app.setpoints),
      selectedNodeId: app.selectedNodeId,
      selectedEdgeIndex: app.selectedEdgeIndex,
    };
  }

  function inspectorUndoKey(target) {
    if (!target || !target.name) return null;
    const names = new Set([
      'requestedRate', 'dacRoute', 'processPreset', 'siteResource', 'chemicalId',
      'processParameter', 'bufferParameter', 'sinkParameter', 'sourceParameter',
      'sourceRate', 'sourcePreset', 'heatTemperature', 'branchWeight', 'branchPriority',
      'edgeCapacity', 'economics',
    ]);
    if (!names.has(target.name)) return null;
    const detail = target.dataset?.param || target.dataset?.economics || target.dataset?.edge || '';
    return `${target.name}:${detail}:${app.selectedNodeId || ''}:${app.selectedEdgeIndex ?? ''}`;
  }

  function noteInspectorUndo(event) {
    const key = inspectorUndoKey(event.target);
    if (!key) return;
    const same = app.undoGesture && app.undoGesture.key === key;
    if (!same) {
      pushUndo(snapshotEntry());
      app.undoGesture = { key };
    }
    if (event.type === 'change') app.undoGesture = null;
  }

  function deleteSelection() {
    if (app.selectedEdgeIndex != null && Number.isFinite(Number(app.selectedEdgeIndex))
      && app.selectedEdgeIndex >= 0 && app.selectedEdgeIndex < app.graph.edges.length) {
      const edgeIndex = app.selectedEdgeIndex;
      const edge = app.graph.edges[edgeIndex];
      pushUndo({ type: 'edge', edgeIndex, edge: JSON.parse(JSON.stringify(edge)) });
      app.graph.edges.splice(edgeIndex, 1);
      app.selectedEdgeIndex = null;
      app.pendingPort = null;
      app.solveAndRender();
      return true;
    }
    if (app.selectedNodeId && app.node(app.selectedNodeId)) {
      const id = app.selectedNodeId;
      const index = app.graph.nodes.findIndex(candidate => candidate.id === id);
      if (index < 0) return false;
      const removedNode = JSON.parse(JSON.stringify(app.graph.nodes[index]));
      const removedEdges = app.graph.edges
        .map((edge, edgeIndex) => ({ edgeIndex, edge }))
        .filter(item => item.edge.from.node === id || item.edge.to.node === id)
        .map(item => ({ edgeIndex: item.edgeIndex, edge: JSON.parse(JSON.stringify(item.edge)) }));
      const setpoint = app.setpoints[id];
      pushUndo({
        type: 'node',
        nodeIndex: index,
        node: removedNode,
        edges: removedEdges,
        setpoint: setpoint === undefined ? undefined : JSON.parse(JSON.stringify(setpoint)),
      });
      app.graph.edges = app.graph.edges.filter(edge => edge.from.node !== id && edge.to.node !== id);
      app.graph.nodes.splice(index, 1);
      delete app.setpoints[id];
      app.selectedNodeId = null;
      app.selectedEdgeIndex = null;
      app.pendingPort = null;
      app.solveAndRender();
      return true;
    }
    return false;
  }

  function applyHistorySnapshot(entry) {
    const restored = entry.graph || { nodes: [], edges: [] };
    app.graph.nodes.splice(0, app.graph.nodes.length, ...cloneUndo(restored.nodes || []));
    app.graph.edges.splice(0, app.graph.edges.length, ...cloneUndo(restored.edges || []));
    for (const key of Object.keys(app.setpoints)) delete app.setpoints[key];
    Object.assign(app.setpoints, cloneUndo(entry.setpoints || {}));
    app.selectedNodeId = entry.selectedNodeId ?? null;
    app.selectedEdgeIndex = entry.selectedEdgeIndex ?? null;
    app.pendingPort = null;
    app.solveAndRender();
  }

  function applyMove(entry) {
    const current = app.node(entry.nodeId);
    if (!current) return null;
    const forward = { type: 'move', nodeId: entry.nodeId, position: { x: current.position.x, y: current.position.y } };
    current.position = { x: entry.position.x, y: entry.position.y };
    app.selectedNodeId = entry.nodeId;
    app.selectedEdgeIndex = null;
    app.pendingPort = null;
    app.render();
    app.persistAutosave();
    return forward;
  }

  function removeNodeById(id) {
    const index = app.graph.nodes.findIndex(candidate => candidate.id === id);
    if (index < 0) return null;
    const removedNode = cloneUndo(app.graph.nodes[index]);
    const removedEdges = app.graph.edges
      .map((edge, edgeIndex) => ({ edgeIndex, edge }))
      .filter(item => item.edge.from.node === id || item.edge.to.node === id)
      .map(item => ({ edgeIndex: item.edgeIndex, edge: cloneUndo(item.edge) }));
    const setpoint = app.setpoints[id];
    app.graph.edges = app.graph.edges.filter(edge => edge.from.node !== id && edge.to.node !== id);
    app.graph.nodes.splice(index, 1);
    delete app.setpoints[id];
    app.selectedNodeId = null;
    app.selectedEdgeIndex = null;
    app.pendingPort = null;
    app.solveAndRender();
    return {
      type: 'restore-node',
      nodeIndex: index,
      node: removedNode,
      edges: removedEdges,
      setpoint: setpoint === undefined ? undefined : cloneUndo(setpoint),
    };
  }

  function restoreNode(entry) {
    const idx = Math.min(Math.max(0, entry.nodeIndex), app.graph.nodes.length);
    app.graph.nodes.splice(idx, 0, cloneUndo(entry.node));
    const sorted = [...(entry.edges || [])].sort((a, b) => a.edgeIndex - b.edgeIndex);
    for (const item of sorted) {
      const at = Math.min(Math.max(0, item.edgeIndex), app.graph.edges.length);
      app.graph.edges.splice(at, 0, cloneUndo(item.edge));
    }
    if (entry.setpoint !== undefined) app.setpoints[entry.node.id] = cloneUndo(entry.setpoint);
    app.selectedNodeId = entry.node.id;
    app.selectedEdgeIndex = null;
    app.pendingPort = null;
    app.solveAndRender();
    return { type: 'add-node', nodeId: entry.node.id };
  }

  function removeEdgeObject(edge) {
    const idx = app.graph.edges.indexOf(edge);
    if (idx < 0) return null;
    app.graph.edges.splice(idx, 1);
    app.selectedEdgeIndex = null;
    app.selectedNodeId = edge?.from?.node || app.selectedNodeId;
    app.pendingPort = null;
    app.solveAndRender();
    return { type: 'restore-edge', edgeIndex: idx, edge: cloneUndo(edge) };
  }

  function restoreEdge(entry) {
    const idx = Math.min(Math.max(0, entry.edgeIndex), app.graph.edges.length);
    const edge = cloneUndo(entry.edge);
    app.graph.edges.splice(idx, 0, edge);
    app.selectedEdgeIndex = idx;
    app.selectedNodeId = null;
    app.pendingPort = null;
    app.solveAndRender();
    return { type: 'add-edge', edge };
  }

  function applyUndo(entry) {
    if (entry.type === 'snapshot') {
      const forward = snapshotEntry();
      applyHistorySnapshot(entry);
      return forward;
    }
    if (entry.type === 'move') return applyMove(entry);
    if (entry.type === 'add-node') return removeNodeById(entry.nodeId);
    if (entry.type === 'add-edge') return removeEdgeObject(entry.edge);
    if (entry.type === 'edge') {
      const idx = Math.min(Math.max(0, entry.edgeIndex), app.graph.edges.length);
      app.graph.edges.splice(idx, 0, entry.edge);
      app.selectedEdgeIndex = idx;
      app.selectedNodeId = null;
      app.pendingPort = null;
      app.solveAndRender();
      return { type: 'drop-edge', edge: entry.edge };
    }
    if (entry.type === 'node') {
      restoreNode(entry);
      return { type: 'drop-node', nodeId: entry.node.id };
    }
    return null;
  }

  function applyRedo(entry) {
    if (entry.type === 'snapshot') {
      const back = snapshotEntry();
      applyHistorySnapshot(entry);
      return back;
    }
    if (entry.type === 'move') return applyMove(entry);
    if (entry.type === 'restore-node') return restoreNode(entry);
    if (entry.type === 'restore-edge') return restoreEdge(entry);
    if (entry.type === 'drop-edge') {
      const idx = app.graph.edges.indexOf(entry.edge);
      if (idx < 0) return null;
      const edge = entry.edge;
      app.graph.edges.splice(idx, 1);
      app.selectedEdgeIndex = null;
      app.pendingPort = null;
      app.solveAndRender();
      return { type: 'edge', edgeIndex: idx, edge };
    }
    if (entry.type === 'drop-node') {
      const removed = removeNodeById(entry.nodeId);
      if (!removed) return null;
      return {
        type: 'node',
        nodeIndex: removed.nodeIndex,
        node: removed.node,
        edges: removed.edges,
        setpoint: removed.setpoint,
      };
    }
    return null;
  }

  function undoLast() {
    const entry = app.undoStack.pop();
    app.undoGesture = null;
    if (!entry) {
      syncRedoButton();
      return false;
    }
    const forward = applyUndo(entry);
    if (!forward) {
      syncRedoButton();
      return false;
    }
    pushRedo(forward);
    return true;
  }

  function redoLast() {
    const entry = app.redoStack.pop();
    app.undoGesture = null;
    if (!entry) {
      syncRedoButton();
      return false;
    }
    const back = applyRedo(entry);
    if (!back) {
      syncRedoButton();
      return false;
    }
    rememberUndo(back);
    syncRedoButton();
    return true;
  }

  function clearCanvasSelection() {
    const had = app.selectedNodeId != null || app.selectedEdgeIndex != null || app.pendingPort != null;
    app.selectedNodeId = null;
    app.selectedEdgeIndex = null;
    app.pendingPort = null;
    app.highlightPort = null;
    if (had) app.render();
    return had;
  }

  function nudgeSelectedNode(dx, dy) {
    const current = app.node(app.selectedNodeId);
    if (!current) return false;
    if (!current.position) current.position = { x: 40, y: 40 };
    const key = `nudge:${current.id}`;
    if (!app.undoGesture || app.undoGesture.key !== key) {
      pushUndo({ type: 'move', nodeId: current.id, position: { x: current.position.x, y: current.position.y } });
      app.undoGesture = { key };
    }
    current.position.x = Math.max(10, current.position.x + dx);
    current.position.y = Math.max(10, current.position.y + dy);
    app.renderGraph();
    app.persistAutosave();
    return true;
  }

  function toggleShortcutsHint(force) {
    const hint = document.getElementById('processShortcuts');
    if (!hint) return;
    if (force === true) hint.open = true;
    else if (force === false) hint.open = false;
    else hint.open = !hint.open;
  }

  function handleProcessKeydown(event) {
    if (app.activeTab !== 'process') {
      if (event.key === 'Escape' && app.canvasFocused) setCanvasFocus(false);
      return;
    }
    if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) {
      if (event.key === 'Escape' && app.canvasFocused) setCanvasFocus(false);
      return;
    }
    const key = event.key;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === 'z' || key === 'Z')) {
      event.preventDefault();
      if (event.shiftKey) redoLast();
      else undoLast();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === 'y' || key === 'Y')) {
      event.preventDefault();
      redoLast();
      return;
    }
    if (key === 'Escape') {
      event.preventDefault();
      if (app.canvasFocused) setCanvasFocus(false);
      clearCanvasSelection();
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (key === '?' || (key === '/' && event.shiftKey)) {
      event.preventDefault();
      toggleShortcutsHint();
      return;
    }
    if (key === '+' || key === '=' ) {
      event.preventDefault();
      setCanvasZoom(app.canvasZoom + 0.1);
      return;
    }
    if (key === '-' || key === '_') {
      event.preventDefault();
      setCanvasZoom(app.canvasZoom - 0.1);
      return;
    }
    const step = event.shiftKey ? 40 : 10;
    if (key === 'ArrowLeft') { event.preventDefault(); nudgeSelectedNode(-step, 0); return; }
    if (key === 'ArrowRight') { event.preventDefault(); nudgeSelectedNode(step, 0); return; }
    if (key === 'ArrowUp') { event.preventDefault(); nudgeSelectedNode(0, -step); return; }
    if (key === 'ArrowDown') { event.preventDefault(); nudgeSelectedNode(0, step); return; }
  }

  function clampZoom(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.min(app.MAX_ZOOM, Math.max(app.MIN_ZOOM, n));
  }

  function setCanvasZoom(value) {
    app.zoomPinned = true;
    app.canvasZoom = clampZoom(value);
    app.renderGraph();
    app.persistAutosave();
  }

  function contentSize() {
    const hasRecycle = app.graph.edges.some(edge => edge.recycle);
    const maxX = Math.max(0, ...app.graph.nodes.map(current => current.position.x + app.NODE_WIDTH));
    const maxY = Math.max(0, ...app.graph.nodes.map(current => current.position.y + app.nodeHeight(current)));
    return {
      width: Math.max(320, maxX + 48 + app.ISO_DX),
      height: Math.max(220, maxY + (hasRecycle ? 120 : 48) + app.ISO_DY),
    };
  }

  function fitCanvas(options) {
    const compact = !!(options && options.compact === true);
    if (!app.graph.nodes.length) {
      app.zoomPinned = false;
      app.canvasZoom = 1;
      app.renderGraph();
      app.canvas.scrollTop = 0;
      app.canvas.scrollLeft = 0;
      app.persistAutosave();
      return;
    }
    const rawW = Number(app.canvas.clientWidth) || 0;
    const rawH = Number(app.canvas.clientHeight) || 0;
    if (rawW < 40) return;
    const availW = Math.max(120, rawW - 8);
    const availH = Math.max(120, (rawH || rawW) - 8);
    let size = contentSize();
    let widthZoom = availW / Math.max(size.width, 1);
    if (compact && widthZoom < app.READABLE_ZOOM) {
      autoArrange({ columnGap: 36, rowGap: 28 });
      size = contentSize();
      widthZoom = availW / Math.max(size.width, 1);
    }
    const heightZoom = availH / Math.max(size.height, 1);
    let zoom = Math.min(widthZoom, 1);
    if (heightZoom >= app.READABLE_ZOOM) zoom = Math.min(zoom, heightZoom);
    app.zoomPinned = false;
    app.canvasZoom = clampZoom(zoom);
    app.renderGraph();
    app.canvas.scrollTop = 0;
    app.canvas.scrollLeft = 0;
    app.persistAutosave();
  }

  function handleCanvasWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setCanvasZoom(app.canvasZoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }

  function renderCanvasZoom() {
    document.getElementById('canvasZoom').value = Math.round(app.canvasZoom * 100);
    document.getElementById('canvasZoomValue').textContent = `${Math.round(app.canvasZoom * 100)}%`;
  }

  function autoArrange(options) {
    const columnGap = options && Number.isFinite(options.columnGap) ? options.columnGap : app.COLUMN_GAP;
    const rowGap = options && Number.isFinite(options.rowGap) ? options.rowGap : 40;
    const depths = new Map(app.graph.nodes.map(current => [current.id, app.units[current.unit].kind === 'source' ? 0 : app.units[current.unit].kind === 'sink' ? 2 : 1]));
    const outgoing = new Map(app.graph.nodes.map(current => [current.id, []]));
    const indegree = new Map(app.graph.nodes.map(current => [current.id, 0]));
    for (const edge of app.graph.edges.filter(candidate => !candidate.recycle)) {
      outgoing.get(edge.from.node).push(edge.to.node);
      indegree.set(edge.to.node, indegree.get(edge.to.node) + 1);
    }
    const queue = app.graph.nodes.filter(current => indegree.get(current.id) === 0).map(current => current.id);
    while (queue.length) {
      const id = queue.shift();
      for (const target of outgoing.get(id)) {
        depths.set(target, Math.max(depths.get(target), depths.get(id) + 1));
        indegree.set(target, indegree.get(target) - 1);
        if (indegree.get(target) === 0) queue.push(target);
      }
    }
    const layers = new Map();
    for (const current of app.graph.nodes) {
      const depth = depths.get(current.id);
      if (!layers.has(depth)) layers.set(depth, []);
      layers.get(depth).push(current);
    }
    const xStep = app.NODE_WIDTH + columnGap;
    const layerHeights = [...layers.values()].map(layer => layer.reduce(
      (sum, current) => sum + app.nodeHeight(current), Math.max(0, layer.length - 1) * rowGap
    ));
    const tallestLayer = Math.max(0, ...layerHeights);
    for (const [depth, layer] of layers) {
      const layerHeight = layer.reduce(
        (sum, current) => sum + app.nodeHeight(current), Math.max(0, layer.length - 1) * rowGap
      );
      let y = 40 + (tallestLayer - layerHeight) / 2;
      for (const current of layer) {
        current.position = { x: 40 + depth * xStep, y };
        y += app.nodeHeight(current) + rowGap;
      }
    }
    app.persistAutosave();
    app.renderGraph();
  }

  function tabNameFromButton(button) {
    if (!button) return '';
    const controls = button.getAttribute?.('aria-controls') || button['aria-controls'] || '';
    const fromControls = String(controls).replace(/^panel/i, '').toLowerCase();
    if (app.FOUNDATION_TABS.includes(fromControls)) return fromControls;
    const id = button.id || '';
    const fromId = String(id).replace(/^tab/i, '').toLowerCase();
    return app.FOUNDATION_TABS.includes(fromId) ? fromId : '';
  }

  function readSavedTab() {
    if (!app.storage) return 'overview';
    try {
      const value = app.storage.getItem(app.TAB_KEY);
      return app.FOUNDATION_TABS.includes(value) ? value : 'overview';
    } catch {
      return 'overview';
    }
  }

  function persistTab(name) {
    if (!app.storage) return;
    try { app.storage.setItem(app.TAB_KEY, name); } catch { /* ignore */ }
  }

  function scheduleMapInvalidate() {
    if (!app.siteMap || typeof app.siteMap.invalidateSize !== 'function') return;
    const invalidate = () => { try { app.siteMap.invalidateSize({ animate: false }); } catch { /* ignore */ } };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(invalidate);
    else invalidate();
  }

  function activateTab(name) {
    const next = app.FOUNDATION_TABS.includes(name) ? name : 'overview';
    app.activeTab = next;
    for (const tab of app.FOUNDATION_TABS) {
      const selected = tab === next;
      const ids = app.TAB_IDS[tab];
      const button = document.getElementById(ids.tab);
      const panel = document.getElementById(ids.panel);
      if (button) {
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        button.classList[selected ? 'add' : 'remove']('is-active');
      }
      if (panel) {
        panel.hidden = !selected;
        panel.classList[selected ? 'add' : 'remove']('is-active');
      }
    }
    document.body.setAttribute('data-tab', next);
    persistTab(next);
    if (next === 'location') scheduleMapInvalidate();
    if (next === 'process' && app.graph.nodes.length) {
      const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => fn();
      schedule(() => { try { fitCanvas(); } catch { /* ignore */ } });
    }
    return next;
  }

  function handleTabListKeydown(event) {
    const current = tabNameFromButton(event.target.closest?.('[role="tab"]') || event.target);
    if (!current) return;
    const index = app.FOUNDATION_TABS.indexOf(current);
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = app.FOUNDATION_TABS[(index + 1) % app.FOUNDATION_TABS.length];
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = app.FOUNDATION_TABS[(index - 1 + app.FOUNDATION_TABS.length) % app.FOUNDATION_TABS.length];
    else if (event.key === 'Home') next = app.FOUNDATION_TABS[0];
    else if (event.key === 'End') next = app.FOUNDATION_TABS[app.FOUNDATION_TABS.length - 1];
    else return;
    event.preventDefault?.();
    activateTab(next);
    document.getElementById(app.TAB_IDS[next].tab)?.focus?.();
  }

  function setCanvasFocus(on) {
    const wasFocused = app.canvasFocused;
    app.canvasFocused = !!on;
    if (app.canvasFocused) activateTab('process');
    document.body.classList[app.canvasFocused ? 'add' : 'remove']('canvas-focus');
    const button = document.getElementById('focusCanvas');
    if (button) {
      button.textContent = app.canvasFocused ? 'Show panels' : 'Focus canvas';
      button.setAttribute('aria-pressed', String(app.canvasFocused));
    }
    const exit = document.getElementById('exitFocus');
    if (exit) exit.hidden = !app.canvasFocused;
    if (wasFocused && !app.canvasFocused && app.graph.nodes.length) {
      const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => fn();
      schedule(() => { try { fitCanvas({ compact: true }); } catch { /* ignore */ } });
    }
  }

  function toggleCanvasFocus() {
    setCanvasFocus(!app.canvasFocused);
  }

  function handleCanvasClick(event) {
    if (app.suppressClick) { app.suppressClick = false; return; }
    const port = event.target.closest('[data-port]');
    if (port) {
      choosePort({ node: port.dataset.node, port: port.dataset.port, direction: port.dataset.direction });
      return;
    }
    const edgeEl = event.target.closest('[data-edge-index]');
    if (edgeEl) {
      const index = Number(edgeEl.dataset.edgeIndex);
      app.selectedEdgeIndex = index;
      const edge = app.graph.edges[index];
      app.selectedNodeId = edge?.from?.node || app.selectedNodeId;
      app.highlightPort = edge ? { nodeId: edge.from.node, port: edge.from.port } : null;
      app.render();
      return;
    }
    const nodeId = event.target.closest('[data-node]')?.dataset.node;
    if (nodeId) {
      if (app.selectedNodeId !== nodeId) app.highlightPort = null;
      app.selectedNodeId = nodeId;
      app.selectedEdgeIndex = null;
      app.render();
    }
  }

  function choosePort(endpoint) {
    app.selectedNodeId = endpoint.node;
    if (!app.pendingPort) { app.pendingPort = endpoint; app.render(); return; }
    if (app.pendingPort.node === endpoint.node && app.pendingPort.port === endpoint.port) { app.pendingPort = null; app.render(); return; }
    const from = app.pendingPort.direction === 'out' ? app.pendingPort : endpoint;
    const to = app.pendingPort.direction === 'in' ? app.pendingPort : endpoint;
    const fromDeclaration = app.units[app.node(from.node).unit].ports[from.port];
    const toDeclaration = app.units[app.node(to.node).unit].ports[to.port];
    app.solveError = '';
    if (from.direction !== 'out' || to.direction !== 'in') app.solveError = 'Connect an output port to an input port.';
    else if (fromDeclaration.kind !== toDeclaration.kind) app.solveError = `Cannot connect ${fromDeclaration.kind} to ${toDeclaration.kind}.`;
    else if ((app.edgeAt(from) >= 0 && !['junction', 'splitter'].includes(app.units[app.node(from.node).unit].kind))
      || (app.edgeAt(to) >= 0 && app.units[app.node(to.node).unit].kind !== 'mixer' && app.node(to.node).unit !== 'heat-sink')) app.solveError = 'That port is already connected. Disconnect it first.';
    else {
      const edge = { from: { node: from.node, port: from.port }, to: { node: to.node, port: to.port }, ...(app.units[app.node(from.node).unit].kind === 'splitter' ? { weight: 1 } : {}) };
      app.graph.edges.push(edge);
      pushUndo({ type: 'add-edge', edge });
      app.undoGesture = null;
    }
    app.pendingPort = null;
    app.solveAndRender();
  }

  function addBoundaryNode(target, silent = false) {
    const current = app.node(target.node);
    const kind = app.units[current.unit].ports[target.port].kind;
    if (target.direction === 'in') {
      const source = app.addNode(`${kind}-source`, {
        preset: app.suggestedPreset(current.unit, target.port),
        chemicalId: app.catalog[current.unit]?.chemicalId,
        temperature: kind === 'heat' ? current.params?.minHeatT_C : undefined,
        silent,
      });
      app.graph.edges.push({ from: { node: source.id, port: 'out' }, to: { node: target.node, port: target.port } });
      return source;
    }
    const sink = app.addNode(`${kind}-sink`, { label: `${app.portName(target.port, current.unit)} sink`, silent });
    app.graph.edges.push({ from: { node: target.node, port: target.port }, to: { node: sink.id, port: 'in' } });
    return sink;
  }

  function completeBoundaries() {
    const selection = app.selectedNodeId;
    const targets = app.graph.nodes
      .filter(current => !['source', 'sink'].includes(app.units[current.unit].kind))
      .flatMap(current => Object.entries(app.units[current.unit].ports)
        .filter(([port, declaration]) => declaration.required
          && app.edgeAt({ node: current.id, port, direction: declaration.direction }) < 0
          && app.catalog[`${declaration.kind}-${declaration.direction === 'in' ? 'source' : 'sink'}`])
        .map(([port, declaration]) => ({ node: current.id, port, direction: declaration.direction })));
    if (targets.length) {
      pushUndo(snapshotEntry());
      app.undoGesture = null;
      targets.forEach(target => addBoundaryNode(target, true));
    }
    app.selectedNodeId = selection;
    app.pendingPort = null;
    app.solveAndRender();
  }
})();
