(() => {
  // Entry point: shared state, DOM wiring, test hook and boot. Panel code lives in
  // js/app/*.js (loaded before this file); names owned by another file are reached
  // through the shared `FlowsheetApp` namespace object (`app.name`).
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.defineProperties(app, {
    AUTOSAVE_KEY: { get: () => AUTOSAVE_KEY, enumerable: true },
    COLUMN_GAP: { get: () => COLUMN_GAP, enumerable: true },
    EMPTY_CANVAS_HTML: { get: () => EMPTY_CANVAS_HTML, enumerable: true },
    FLOOR_GRID: { get: () => FLOOR_GRID, enumerable: true },
    FOUNDATION_TABS: { get: () => FOUNDATION_TABS, enumerable: true },
    FREIGHT_CITES: { get: () => FREIGHT_CITES, enumerable: true },
    ISO_DX: { get: () => ISO_DX, enumerable: true },
    ISO_DY: { get: () => ISO_DY, enumerable: true },
    MAX_ZOOM: { get: () => MAX_ZOOM, enumerable: true },
    MIN_ZOOM: { get: () => MIN_ZOOM, enumerable: true },
    NETWORK_KEY: { get: () => NETWORK_KEY, enumerable: true },
    NODE_RX: { get: () => NODE_RX, enumerable: true },
    NODE_WIDTH: { get: () => NODE_WIDTH, enumerable: true },
    PORT_STEP: { get: () => PORT_STEP, enumerable: true },
    PORT_TOP: { get: () => PORT_TOP, enumerable: true },
    READABLE_ZOOM: { get: () => READABLE_ZOOM, enumerable: true },
    RIGHT_KEYS: { get: () => RIGHT_KEYS, enumerable: true },
    RIGHT_KINDS: { get: () => RIGHT_KINDS, enumerable: true },
    SAVES_KEY: { get: () => SAVES_KEY, enumerable: true },
    TAB_IDS: { get: () => TAB_IDS, enumerable: true },
    TAB_KEY: { get: () => TAB_KEY, enumerable: true },
    UNDO_STACK_MAX: { get: () => UNDO_STACK_MAX, enumerable: true },
    activeDemoId: { get: () => activeDemoId, set: value => { activeDemoId = value; }, enumerable: true },
    activeTab: { get: () => activeTab, set: value => { activeTab = value; }, enumerable: true },
    baseline: { get: () => baseline, set: value => { baseline = value; }, enumerable: true },
    canvas: { get: () => canvas, enumerable: true },
    canvasFocused: { get: () => canvasFocused, set: value => { canvasFocused = value; }, enumerable: true },
    canvasZoom: { get: () => canvasZoom, set: value => { canvasZoom = value; }, enumerable: true },
    citeFrom: { get: () => citeFrom, enumerable: true },
    citeMarkup: { get: () => citeMarkup, enumerable: true },
    classifyQuality: { get: () => classifyQuality, enumerable: true },
    counts: { get: () => counts, enumerable: true },
    currentEconomics: { get: () => currentEconomics, set: value => { currentEconomics = value; }, enumerable: true },
    dragging: { get: () => dragging, set: value => { dragging = value; }, enumerable: true },
    formatUncertainMoney: { get: () => formatUncertainMoney, enumerable: true },
    formatUncertainNumber: { get: () => formatUncertainNumber, enumerable: true },
    graph: { get: () => graph, enumerable: true },
    highlightPort: { get: () => highlightPort, set: value => { highlightPort = value; }, enumerable: true },
    highlightRightKey: { get: () => highlightRightKey, set: value => { highlightRightKey = value; }, enumerable: true },
    inspector: { get: () => inspector, enumerable: true },
    lastCashflowCompare: { get: () => lastCashflowCompare, set: value => { lastCashflowCompare = value; }, enumerable: true },
    lastSizing: { get: () => lastSizing, set: value => { lastSizing = value; }, enumerable: true },
    livePvgisBlocked: { get: () => livePvgisBlocked, set: value => { livePvgisBlocked = value; }, enumerable: true },
    network: { get: () => network, set: value => { network = value; }, enumerable: true },
    networkEditor: { get: () => networkEditor, set: value => { networkEditor = value; }, enumerable: true },
    networkNotice: { get: () => networkNotice, set: value => { networkNotice = value; }, enumerable: true },
    networkResult: { get: () => networkResult, set: value => { networkResult = value; }, enumerable: true },
    operationMeta: { get: () => operationMeta, set: value => { operationMeta = value; }, enumerable: true },
    parseBand: { get: () => parseBand, enumerable: true },
    pendingPort: { get: () => pendingPort, set: value => { pendingPort = value; }, enumerable: true },
    powerBreakevenSignature: { get: () => powerBreakevenSignature, set: value => { powerBreakevenSignature = value; }, enumerable: true },
    preSizingSeed: { get: () => preSizingSeed, set: value => { preSizingSeed = value; }, enumerable: true },
    projectEconomics: { get: () => projectEconomics, enumerable: true },
    qualityChip: { get: () => qualityChip, enumerable: true },
    redoStack: { get: () => redoStack, set: value => { redoStack = value; }, enumerable: true },
    result: { get: () => result, set: value => { result = value; }, enumerable: true },
    rightsChip: { get: () => rightsChip, enumerable: true },
    routeNote: { get: () => routeNote, set: value => { routeNote = value; }, enumerable: true },
    selectedEdgeIndex: { get: () => selectedEdgeIndex, set: value => { selectedEdgeIndex = value; }, enumerable: true },
    selectedNodeId: { get: () => selectedNodeId, set: value => { selectedNodeId = value; }, enumerable: true },
    setpoints: { get: () => setpoints, enumerable: true },
    site: { get: () => site, set: value => { site = value; }, enumerable: true },
    siteMap: { get: () => siteMap, set: value => { siteMap = value; }, enumerable: true },
    siteMapEnabled: { get: () => siteMapEnabled, set: value => { siteMapEnabled = value; }, enumerable: true },
    siteMapFailed: { get: () => siteMapFailed, set: value => { siteMapFailed = value; }, enumerable: true },
    siteMapFootprintById: { get: () => siteMapFootprintById, set: value => { siteMapFootprintById = value; }, enumerable: true },
    siteMapLayersReady: { get: () => siteMapLayersReady, set: value => { siteMapLayersReady = value; }, enumerable: true },
    siteMapMarker: { get: () => siteMapMarker, set: value => { siteMapMarker = value; }, enumerable: true },
    siteMapOverlays: { get: () => siteMapOverlays, set: value => { siteMapOverlays = value; }, enumerable: true },
    siteMapTilesFailed: { get: () => siteMapTilesFailed, set: value => { siteMapTilesFailed = value; }, enumerable: true },
    solveError: { get: () => solveError, set: value => { solveError = value; }, enumerable: true },
    storage: { get: () => storage, enumerable: true },
    suppressClick: { get: () => suppressClick, set: value => { suppressClick = value; }, enumerable: true },
    syncingEconomicsDisclosure: { get: () => syncingEconomicsDisclosure, set: value => { syncingEconomicsDisclosure = value; }, enumerable: true },
    undoGesture: { get: () => undoGesture, set: value => { undoGesture = value; }, enumerable: true },
    undoStack: { get: () => undoStack, set: value => { undoStack = value; }, enumerable: true },
    units: { get: () => units, enumerable: true },
    unverifiedRightsWarnings: { get: () => unverifiedRightsWarnings, enumerable: true },
    zoomPinned: { get: () => zoomPinned, set: value => { zoomPinned = value; }, enumerable: true },
  });
  const canvas = document.getElementById('flowsheetCanvas');
  const inspector = document.querySelector('.inspector-sidebar');
  const units = FlowsheetUnits.UNITS;
  const {
    classifyQuality,
    formatUncertainMoney,
    formatUncertainNumber,
    qualityChip,
    rightsChip,
    citeFrom,
    unverifiedRightsWarnings,
    RIGHT_KEYS,
    RIGHT_KINDS,
    parseBand,
    citeMarkup,
  } = FlowsheetUncertainty;
  const FREIGHT_CITES = [
    { label: 'UNCTAD transport costs', url: 'https://unctad.org/publication/trade-and-transport-dataset' },
    { label: 'World Bank freight logistics', url: 'https://documents1.worldbank.org/curated/en/620801468168857019/pdf/558370PUB0cost1C0disclosed071221101.pdf' },
  ];
  const graph = { nodes: [], edges: [] };
  const setpoints = {};
  const projectEconomics = { periodDays: 365, projectLifeYears: 20, discountRate: 0.08 };
  const counts = {};
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const AUTOSAVE_KEY = 'molecular-foundry.autosave.v1';
  const SAVES_KEY = 'molecular-foundry.saves.v1';
  const NETWORK_KEY = 'molecular-foundry.network.v1';
  const TAB_KEY = 'molecular-foundry.tab.v1';
  const FOUNDATION_TABS = ['overview', 'location', 'process', 'economics'];
  const TAB_IDS = {
    overview: { tab: 'tabOverview', panel: 'panelOverview' },
    location: { tab: 'tabLocation', panel: 'panelLocation' },
    process: { tab: 'tabProcess', panel: 'panelProcess' },
    economics: { tab: 'tabEconomics', panel: 'panelEconomics' },
  };
  let activeTab = 'overview';
  const NODE_WIDTH = 220;
  const NODE_RX = 3;
  const ISO_DX = 16;
  const ISO_DY = 9;
  const FLOOR_GRID = 24;
  const EMPTY_CANVAS_HTML = '<div class="empty-canvas"><span class="eyebrow">Plant floor</span><strong>No blocks</strong><p>Add a block or open a case on Overview. Drag empty canvas to pan · Fit frames the plant.</p></div>';
  const PORT_STEP = 20;
  const PORT_TOP = 58;
  const COLUMN_GAP = 120;
  let selectedNodeId = null;
  let selectedEdgeIndex = null;
  let undoStack = [];
  let redoStack = [];
  let undoGesture = null;
  const UNDO_STACK_MAX = 20;
  let pendingPort = null;
  let result = null;
  let currentEconomics = null;
  let baseline = null;
  let powerBreakevenSignature = '';
  let syncingEconomicsDisclosure = false;
  const MIN_ZOOM = 0.08;
  const MAX_ZOOM = 2;
  const READABLE_ZOOM = 0.5;
  let canvasZoom = 1;
  let zoomPinned = false;
  let highlightPort = null;
  let highlightRightKey = '';
  let site = null;
  let network = { plants: [], corridors: [] };
  let networkResult = null;
  let networkEditor = null;
  let networkNotice = '';
  let solveError = '';
  let routeNote = '';
  let dragging = null;
  let suppressClick = false;
  let canvasFocused = false;
  let lastSizing = null;
  let livePvgisBlocked = false;
  let operationMeta = {};
  let siteMap = null;
  let siteMapMarker = null;
  let siteMapOverlays = { osm: null, pvgis: null, water: null, land: null, footprint: null, network: null };
  let siteMapEnabled = { osm: true, pvgis: true, water: false, land: false, footprint: true, network: false };
  let siteMapFootprintById = {};
  let activeDemoId = null;
  let lastCashflowCompare = null;
  let preSizingSeed = null;
  let siteMapFailed = false;
  let siteMapTilesFailed = false;
  let siteMapLayersReady = false;

  app.renderPalettes();
  document.getElementById('paletteSearch')?.addEventListener('input', event => {
    app.applyPaletteFilter(event.target.value);
  });
  document.getElementById('paletteDrawerToggle')?.addEventListener('click', () => {
    const sidebar = document.getElementById('controlsSidebar');
    const open = !sidebar?.classList.contains('is-open');
    app.setPaletteDrawer(open);
  });
  document.getElementById('paletteDrawerBackdrop')?.addEventListener('click', () => app.setPaletteDrawer(false));
  document.getElementById('buildingPalette').addEventListener('click', app.addFromPalette);
  document.getElementById('utilityPalette').addEventListener('click', app.addFromPalette);
  document.getElementById('clearFactory').addEventListener('click', app.clearFactory);
  document.getElementById('autoArrange').addEventListener('click', app.autoArrange);
  document.getElementById('focusCanvas').addEventListener('click', app.toggleCanvasFocus);
  document.getElementById('exitFocus')?.addEventListener('click', () => app.setCanvasFocus(false));
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', () => {
      if (zoomPinned || activeTab !== 'process' || !graph.nodes.length) return;
      app.fitCanvas();
    });
  }
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', app.handleProcessKeydown);
  }
  document.getElementById('zoomOut').addEventListener('click', () => app.setCanvasZoom(canvasZoom - 0.1));
  document.getElementById('zoomIn').addEventListener('click', () => app.setCanvasZoom(canvasZoom + 0.1));
  document.getElementById('zoomReset').addEventListener('click', () => app.setCanvasZoom(1));
  document.getElementById('zoomFit')?.addEventListener('click', () => app.fitCanvas({ compact: true }));
  document.getElementById('canvasZoom').addEventListener('input', event => app.setCanvasZoom(Number(event.target.value) / 100));
  document.getElementById('economicsDcf')?.addEventListener('toggle', () => {
    if (syncingEconomicsDisclosure) return;
    const dcf = document.getElementById('economicsDcf');
    const open = Boolean(dcf?.open);
    if (open === app.economicsAcknowledgment()) return;
    app.setEconomicsAcknowledgment(open);
    app.renderEconomics();
    app.renderNetwork();
  });
  document.getElementById('screenPowerBreakeven')?.addEventListener('click', app.screenPowerBreakEven);
  document.getElementById('powerBreakevenMode')?.addEventListener('change', () => {
    app.populatePowerBreakevenMaterials();
    powerBreakevenSignature = '';
    if (currentEconomics) app.screenPowerBreakEven();
  });
  document.getElementById('powerBreakevenMaterial')?.addEventListener('change', () => {
    powerBreakevenSignature = '';
    if (currentEconomics) app.screenPowerBreakEven();
  });
  document.getElementById('captureBaseline').addEventListener('click', app.captureBaseline);
  document.getElementById('clearBaseline').addEventListener('click', app.clearBaseline);
  document.getElementById('projectLifeYears').addEventListener('input', app.handleProjectEconomics);
  document.getElementById('discountRate').addEventListener('input', app.handleProjectEconomics);
  document.getElementById('completeBoundaries').addEventListener('click', app.completeBoundaries);
  document.getElementById('redoCanvas')?.addEventListener('click', () => app.redoLast());
  app.syncRedoButton();
  document.getElementById('overviewCases')?.addEventListener('change', event => {
    const run = app.OVERVIEW_CASES[event.target.value];
    if (!run) return;
    try { run(); } catch { /* loaders and sizing write the status line */ }
  });
  for (const name of FOUNDATION_TABS) {
    document.getElementById(TAB_IDS[name].tab)?.addEventListener('click', () => app.activateTab(name));
  }
  document.getElementById('foundryTabs')?.addEventListener('keydown', app.handleTabListKeydown);
  document.getElementById('warnings')?.addEventListener('click', event => {
    const jump = event.target.closest?.('[data-issue-node]');
    const nodeId = jump?.dataset.issueNode;
    if (nodeId && graph.nodes.some(item => item.id === nodeId)) {
      selectedNodeId = nodeId;
      const current = app.node(nodeId);
      const diagnosis = current ? app.blockDiagnosis(current) : null;
      if (diagnosis) app.followDiagnosis(diagnosis);
      else {
        app.activateTab('process');
        app.render();
      }
      return;
    }
    const tab = event.target.closest?.('[data-issue-tab]')?.dataset.issueTab;
    if (tab) app.activateTab(tab);
  });
  document.getElementById('sizeToTarget').addEventListener('click', () => {
    const product = document.getElementById('sizeProduct')?.value || 'CH4';
    const rate = Number(document.getElementById('sizeTargetRate').value);
    try {
      app.sizeToProduct(product, rate);
    } catch {
      /* sizeToProduct writes the status line */
    }
  });
  document.getElementById('sizeForCashflow')?.addEventListener('click', () => {
    try {
      app.sizeForPositiveCashflow();
    } catch {
      /* sizeForPositiveCashflow writes the status line */
    }
  });
  document.getElementById('overviewDrivers')?.addEventListener('click', event => {
    const target = event.target.closest?.('[data-driver-node], [data-driver-tab], [data-driver-rights]');
    if (!target) return;
    if (target.dataset.driverRights) {
      highlightRightKey = target.dataset.driverRights;
      highlightPort = null;
      const details = document.getElementById('siteRightsDetails');
      if (details) details.open = true;
      app.activateTab('location');
      app.renderSiteTruth();
      return;
    }
    highlightRightKey = '';
    highlightPort = null;
    if (target.dataset.driverNode) {
      selectedNodeId = target.dataset.driverNode;
      app.activateTab('process');
      app.render();
      return;
    }
    if (target.dataset.driverTab) app.activateTab(target.dataset.driverTab);
  });
  document.getElementById('addPlantToNetwork').addEventListener('click', app.beginAddPlant);
  document.getElementById('cancelAddPlant').addEventListener('click', app.cancelAddPlant);
  document.getElementById('addPlantForm').addEventListener('submit', event => {
    event.preventDefault();
    app.submitAddPlant(document.getElementById('addPlantName')?.value);
  });
  document.getElementById('addPlantForm').addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    app.cancelAddPlant();
  });
  document.getElementById('clearNetwork').addEventListener('click', app.clearNetwork);
  document.getElementById('networkPlants').addEventListener('click', app.handleNetworkPlantClick);
  document.getElementById('networkPlants').addEventListener('submit', event => {
    const form = event.target?.closest?.('[data-rename-form]') || event.target;
    if (!form?.dataset?.renameForm) return;
    event.preventDefault();
    app.renameNetworkPlant(form.dataset.renameForm, form.querySelector('input')?.value);
  });
  document.getElementById('networkPlants').addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (networkEditor?.type !== 'rename' && networkEditor?.type !== 'remove') return;
    event.preventDefault();
    app.cancelPlantEdit();
  });
  document.getElementById('siteMonth').addEventListener('change', event => {
    if (!site) return;
    site.month = Number(event.target.value);
    app.refreshSiteElectricity();
    app.solveAndRender();
  });
  document.getElementById('applyCoordinates').addEventListener('click', app.applyCoordinates);
  document.getElementById('overviewSiteName')?.addEventListener('click', event => {
    if (event.target.closest?.('[data-apply-location]')) app.activateTab('location');
  });
  document.getElementById('sitePreset')?.addEventListener('change', () => { app.applySitePreset(); });
  document.getElementById('siteLatitude').addEventListener('input', app.syncSiteMapFromInputs);
  document.getElementById('siteLongitude').addEventListener('input', app.syncSiteMapFromInputs);
  document.getElementById('siteMapLayers').addEventListener('change', event => {
    const target = event.target;
    const id = target?.getAttribute?.('data-layer') || target?.['data-layer'];
    if (!id || !Object.prototype.hasOwnProperty.call(siteMapEnabled, id)) return;
    siteMapEnabled[id] = !!target.checked;
    if (siteMapEnabled[id] && app.MapSite?.COLORMAP_LAYER_IDS?.includes(id)) {
      for (const other of app.MapSite.COLORMAP_LAYER_IDS) {
        if (other === id || !siteMapEnabled[other]) continue;
        siteMapEnabled[other] = false;
        const root = document.getElementById('siteMapLayers');
        const input = root?.querySelector?.(`[data-layer="${other}"]`);
        if (input) input.checked = false;
      }
    }
    app.syncMapLayerChipState();
    app.updateSiteMapOverlays();
  });
  document.getElementById('siteFootprint')?.addEventListener('click', event => {
    const pad = event.target.closest?.('[data-footprint-pad]');
    const id = pad?.dataset?.footprintPad || pad?.getAttribute?.('data-footprint-pad');
    if (id) app.focusFootprintPad(id);
  });
  document.getElementById('siteFootprint')?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const pad = event.target.closest?.('[data-footprint-pad]');
    if (!pad || pad.tagName === 'BUTTON') return;
    event.preventDefault();
    const id = pad.dataset?.footprintPad || pad.getAttribute?.('data-footprint-pad');
    if (id) app.focusFootprintPad(id);
  });
  document.getElementById('overviewFootprint')?.addEventListener('click', () => app.activateTab('location'));
  document.getElementById('siteBatteryKWh').addEventListener('change', event => {
    if (!site) return;
    const batteryKWh = Math.max(0, Number(event.target.value) || 0);
    site.storage = { ...(site.storage || {}), batteryKWh, powerKW: batteryKWh, efficiency: site.storage?.efficiency ?? 0.9 };
    app.solveAndRender();
  });
  document.getElementById('saveFactory').addEventListener('click', () => {
    const name = window.prompt('Name this factory save:')?.trim();
    if (name) app.saveNamed(name);
  });
  document.getElementById('deleteFactorySave').addEventListener('click', () => {
    const value = document.getElementById('factorySaves').value;
    if (value) app.deleteNamed(decodeURIComponent(value));
  });
  document.getElementById('factorySaves').addEventListener('change', event => {
    if (event.target.value) app.loadNamed(decodeURIComponent(event.target.value));
    else app.restoreSnapshot(app.readJson(AUTOSAVE_KEY)) && app.solveAndRender();
  });
  canvas.addEventListener('click', app.handleCanvasClick);
  canvas.addEventListener('pointerdown', app.startDrag);
  canvas.addEventListener('pointermove', app.dragNode);
  canvas.addEventListener('pointerup', app.endDrag);
  canvas.addEventListener('pointercancel', app.endDrag);
  canvas.addEventListener('wheel', app.handleCanvasWheel, { passive: false });

  let canvasPan = null;
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 1) return;
    const onNode = event.target.closest?.('[data-node]');
    const onPort = event.target.closest?.('[data-port]');
    const middle = event.button === 1;
    const shiftDrag = event.button === 0 && event.shiftKey;
    const background = event.button === 0 && !shiftDrag && !onNode && !onPort;
    if (!middle && !shiftDrag && !background) return;
    event.preventDefault();
    canvasPan = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft || 0, top: canvas.scrollTop || 0, moved: false };
    canvas.classList.add('is-panning');
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!canvasPan) return;
    const dx = event.clientX - canvasPan.x;
    const dy = event.clientY - canvasPan.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) canvasPan.moved = true;
    canvas.scrollLeft = canvasPan.left - dx;
    canvas.scrollTop = canvasPan.top - dy;
  });
  canvas.addEventListener('pointerup', () => {
    if (canvasPan?.moved) suppressClick = true;
    canvasPan = null;
    canvas.classList.remove('is-panning');
  });
  canvas.addEventListener('pointercancel', () => {
    canvasPan = null;
    canvas.classList.remove('is-panning');
  });
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      app.handleCanvasClick(event);
      return;
    }
    app.handleProcessKeydown(event);
  });
  inspector.addEventListener('input', app.handleInspectorInput);
  inspector.addEventListener('change', app.handleInspectorInput);
  inspector.addEventListener('click', app.handleInspectorClick);

  window.__FLOWSHEET_APP__ = {
    graph, setpoints, addNode: app.addNode, choosePort: app.choosePort, clearFactory: app.clearFactory, autoArrange: app.autoArrange, toggleCanvasFocus: app.toggleCanvasFocus,
    completeBoundaries: app.completeBoundaries, loadMethaneRecycle: app.loadMethaneRecycle, loadCoastalMethane: app.loadCoastalMethane, loadMethanolPlant: app.loadMethanolPlant, loadSiliconAlumina: app.loadSiliconAlumina, loadFloatGlass: app.loadFloatGlass, loadH2Dri: app.loadH2Dri, loadGreenH2Dri: app.loadGreenH2Dri, loadTiKroll: app.loadTiKroll, loadReeIonic: app.loadReeIonic, loadMaglutLongBeach: app.loadMaglutLongBeach, loadReeSx: app.loadReeSx, loadBioforgeMarshall: app.loadBioforgeMarshall, loadGreenAmmonia: app.loadGreenAmmonia, loadUrea: app.loadUrea, loadGreenUrea: app.loadGreenUrea, loadMto: app.loadMto, loadFtLiquids: app.loadFtLiquids, loadGreenMto: app.loadGreenMto, loadGreenFt: app.loadGreenFt, sizeCoastalToMethane: app.sizeCoastalToMethane, sizeToProduct: app.sizeToProduct, sizeForPositiveCashflow: app.sizeForPositiveCashflow, loadAbundanceHub: app.loadAbundanceHub, loadZabuyeHub: app.loadZabuyeHub, loadDemoNetwork: app.loadDemoNetwork,
    addCurrentPlant: app.addCurrentPlant, openNetworkPlant: app.openNetworkPlant, clearNetwork: app.clearNetwork, replaceUnit: app.replaceUnit, bindLocation: app.bindLocation, applySitePreset: app.applySitePreset, applyCoordinates: app.applyCoordinates,
    beginAddPlant: app.beginAddPlant, cancelAddPlant: app.cancelAddPlant, submitAddPlant: app.submitAddPlant, beginRenamePlant: app.beginRenamePlant, beginRemovePlant: app.beginRemovePlant, cancelPlantEdit: app.cancelPlantEdit,
    renameNetworkPlant: app.renameNetworkPlant, removeNetworkPlant: app.removeNetworkPlant,
    saveNamed: app.saveNamed, loadNamed: app.loadNamed, captureBaseline: app.captureBaseline, clearBaseline: app.clearBaseline, activateTab: app.activateTab,
    deleteSelection: app.deleteSelection, undoLast: app.undoLast, redoLast: app.redoLast, undoLastDelete: app.undoLast, clearCanvasSelection: app.clearCanvasSelection, handleProcessKeydown: app.handleProcessKeydown, nudgeSelectedNode: app.nudgeSelectedNode,
    handleInspectorInput: app.handleInspectorInput,
    get selectedNodeId() { return selectedNodeId; },
    set selectedNodeId(value) { selectedNodeId = value; },
    get selectedEdgeIndex() { return selectedEdgeIndex; },
    set selectedEdgeIndex(value) { selectedEdgeIndex = value; },
    get undoStackLength() { return undoStack.length; },
    get redoStackLength() { return redoStack.length; },
    clearUndoStack() { undoStack = []; redoStack = []; undoGesture = null; app.syncRedoButton(); },
    inferBufferFluidClass: app.inferBufferFluidClass, refreshBufferEconomics: app.refreshBufferEconomics,
    get pendingPort() { return pendingPort; },
    set pendingPort(value) { pendingPort = value; },
    solve: app.solveAndRender, fitCanvas: app.fitCanvas, showCause(nodeId) {
      const current = app.node(nodeId || selectedNodeId);
      if (!current) return null;
      selectedNodeId = current.id;
      const diagnosis = app.blockDiagnosis(current);
      if (diagnosis) app.followDiagnosis(diagnosis);
      else app.render();
      return diagnosis;
    }, get result() { return result; }, get baseline() { return baseline; },
    get economics() { return currentEconomics; }, get site() { return site; }, get network() { return networkResult; },
    get sizing() { return lastSizing; }, get activeTab() { return activeTab; },
    projectEconomics, setCanvasZoom: app.setCanvasZoom, get canvasZoom() { return canvasZoom; },
    screenPowerBreakEven: app.screenPowerBreakEven,
    intakeKind: app.intakeKind, buildingProfile: app.buildingProfile, materialPresets: app.materialPresets,
  };
  app.populatePowerBreakevenMaterials();
  app.populateSitePresets();
  app.refreshSaveOptions();
  const savedNetwork = app.readJson(NETWORK_KEY);
  if (savedNetwork?.plants) network = { plants: savedNetwork.plants, corridors: savedNetwork.corridors || [] };
  if (network.plants.length) app.refreshNetwork();
  if (app.restoreSnapshot(app.readJson(AUTOSAVE_KEY))) app.solveAndRender();
  else if (globalThis.NetworkCase?.siteZabuyeAbundance) {
    app.setActiveDemo('zabuye-hub', 'Zabuye brine hub');
    app.loadCase(NetworkCase.siteZabuyeAbundance(), 'minerals');
  } else app.render();
  app.activateTab(app.readSavedTab());
})();
