// Building palette, node creation, source streams, demo case loaders.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.defineProperties(app, {
    OVERVIEW_CASES: { get: () => OVERVIEW_CASES, enumerable: true },
  });
  Object.assign(app, {
    addFromPalette, addNode, applyPaletteFilter, assignSiteResource, clearFactory,
    loadBioforgeMarshall, loadCoastalMethane, loadFloatGlass, loadFtLiquids, loadGreenAmmonia,
    loadGreenFt, loadGreenH2Dri, loadGreenMto, loadGreenUrea, loadH2Dri, loadMaglutLongBeach,
    loadMethaneRecycle, loadMethanolPlant, loadMto, loadReeIonic, loadReeSx, loadSiliconAlumina,
    loadTiKroll, loadUrea, positionFor, renderPalettes, setActiveDemo, setPaletteDrawer,
    sourceAmount, updateSourceStream,
  });

  function paletteCard(unit, definition, extras = {}) {
    const { glyph, tone, title, description } = definition.palette;
    const name = extras.label || title || definition.label;
    const desc = extras.description != null ? extras.description : (description || '');
    const presetAttr = extras.preset ? ` data-preset="${app.escapeHtml(extras.preset)}"` : '';
    const labelAttr = extras.label ? ` data-label="${app.escapeHtml(extras.label)}"` : '';
    return `<button type="button" class="building-card" data-unit="${unit}"${presetAttr}${labelAttr} data-title="${app.escapeHtml(name)}" data-description="${app.escapeHtml(desc)}"><span class="building-glyph${tone ? ` ${tone}` : ''}">${extras.glyph || glyph}</span><span><strong>${app.escapeHtml(name)}</strong><small>${app.escapeHtml(desc)}</small></span><b>Add</b></button>`;
  }

  function intakePaletteCard(item) {
    return paletteCard('material-source', {
      label: item.label,
      palette: { glyph: item.glyph, tone: item.tone, description: item.description },
    }, { preset: item.preset, label: item.label, glyph: item.glyph, description: item.description });
  }


  function setActiveDemo(id, label) {
    app.activeDemoId = id || null;
    const cases = document.getElementById('overviewCases');
    if (cases) cases.value = id || '';
    const chip = document.getElementById('overviewDemoChip');
    if (chip) {
      chip.hidden = !label;
      chip.textContent = label ? `Scenario · ${label}` : '';
    }
  }

  function paletteCategory(name, units, { open = false } = {}) {
    const cards = units
      .filter(unit => app.catalog[unit]?.palette?.section === 'building')
      .map(unit => paletteCard(unit, app.catalog[unit]))
      .join('');
    if (!cards) return '';
    return `<details class="palette-category"${open ? ' open' : ''}><summary>${app.escapeHtml(name)}</summary>${cards}</details>`;
  }

  function renderPalettes() {
    const grouped = Object.entries(app.PALETTE_CATEGORIES)
      .map(([name, units]) => paletteCategory(name, units, { open: app.PALETTE_DEFAULT_OPEN.has(name) }))
      .join('');
    document.getElementById('buildingPalette').innerHTML = grouped;
    const intakes = app.PRACTICAL_INTAKE_PALETTE.map(intakePaletteCard).join('');
    const utilities = Object.entries(app.catalog)
      .filter(([, definition]) => definition.palette?.section === 'utility')
      .sort(([, left], [, right]) => left.palette.order - right.palette.order)
      .map(([unit, definition]) => paletteCard(unit, definition))
      .join('');
    const purchased = app.PURCHASED_FEED_PRESETS
      .filter(id => app.materialPresets[id])
      .map(id => {
        const preset = app.materialPresets[id];
        const intake = app.INTAKE_BY_KEY[id];
        return intakePaletteCard({
          preset: id,
          label: intake?.label || preset.label,
          glyph: (intake?.glyph || id.slice(0, 2)).toString().slice(0, 3),
          tone: preset.phase === 'gas' ? 'carbon' : 'methane',
          description: `Purchased ${preset.label.toLowerCase()} feed`,
        });
      })
      .join('');
    document.getElementById('utilityPalette').innerHTML =
      `<div class="palette-intakes">${intakes}</div>${utilities}`
      + `<details class="palette-category palette-purchased"><summary>Purchased feeds</summary>${purchased}</details>`;
  }

  function paletteHaystack(card) {
    const title = card.getAttribute?.('data-title') || card.dataset?.title || '';
    const description = card.getAttribute?.('data-description') || card.dataset?.description || '';
    const unit = card.getAttribute?.('data-unit') || card.dataset?.unit || '';
    return `${title} ${description} ${unit}`.toLowerCase();
  }

  function applyPaletteFilter(query) {
    const q = String(query || '').trim().toLowerCase();
    const cards = document.querySelectorAll('#buildingPalette .building-card, #utilityPalette .building-card');
    let visible = 0;
    cards.forEach(card => {
      const match = !q || paletteHaystack(card).includes(q);
      card.hidden = !match;
      if (match) visible += 1;
    });
    document.querySelectorAll('#buildingPalette .palette-category').forEach(details => {
      const matched = [...details.querySelectorAll('.building-card')].filter(card => !card.hidden);
      details.hidden = !!q && matched.length === 0;
      if (q && matched.length) details.open = true;
    });
    const utilityHeading = document.getElementById('utilityPaletteHeading');
    const utilityVisible = [...document.querySelectorAll('#utilityPalette .building-card')].some(card => !card.hidden);
    if (utilityHeading) utilityHeading.hidden = !!q && !utilityVisible;
    const empty = document.getElementById('paletteEmpty');
    if (empty) empty.hidden = !q || visible > 0;
  }

  function setPaletteDrawer(open) {
    const sidebar = document.getElementById('controlsSidebar');
    const toggle = document.getElementById('paletteDrawerToggle');
    const backdrop = document.getElementById('paletteDrawerBackdrop');
    if (sidebar) sidebar.classList.toggle('is-open', !!open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (backdrop) backdrop.hidden = !open;
  }
  const OVERVIEW_CASES = {
    'methane-recycle': () => loadMethaneRecycle(),
    'coastal-methane': () => loadCoastalMethane(0),
    'coastal-methanol': () => loadMethanolPlant(0),
    'silicon-alumina': () => loadSiliconAlumina(),
    'float-glass': () => loadFloatGlass(),
    cement: () => loadCement(),
    'cu-ew': () => loadCuEw(),
    'h2-dri': () => loadH2Dri(),
    'green-h2-dri': () => loadGreenH2Dri(),
    'ti-kroll': () => loadTiKroll(),
    'ree-ionic': () => loadReeIonic(),
    'maglut-long-beach': () => loadMaglutLongBeach(),
    'ree-sx': () => loadReeSx(),
    'bioforge-marshall': () => loadBioforgeMarshall(),
    'green-ammonia': () => loadGreenAmmonia(),
    'urea': () => loadUrea(),
    'green-urea': () => loadGreenUrea(),
    'mto': () => loadMto(),
    'ft-liquids': () => loadFtLiquids(),
    'green-mto': () => loadGreenMto(),
    'green-ft': () => loadGreenFt(),
    'abundance-hub': () => app.loadAbundanceHub(),
    'zabuye-hub': () => app.loadZabuyeHub(),
    'demo-network': () => app.loadDemoNetwork(),
  };

  function addFromPalette(event) {
    const card = event.target.closest('[data-unit]');
    const unit = card?.dataset.unit;
    if (!unit) return;
    const options = {};
    if (card.dataset.preset) options.preset = card.dataset.preset;
    if (card.dataset.label) options.label = card.dataset.label;
    addNode(unit, options);
    if (window.matchMedia?.('(max-width: 720px)')?.matches) setPaletteDrawer(false);
  }

  function addNode(unit, options = {}) {
    const number = (app.counts[unit] || 0) + 1;
    app.counts[unit] = number;
    const id = `${unit}-${number}`;
    const definition = app.catalog[unit];
    const kind = app.units[unit].kind;
    const sameKindCount = app.graph.nodes.filter(candidate => app.units[candidate.unit].kind === kind).length;
    const current = {
      id, unit, label: options.label || `${definition.label} ${number}`,
      capacity: definition.capacity, params: { ...(definition.params || {}) },
      position: positionFor(kind, sameKindCount),
    };
    if (definition.presets) {
      current.processPreset = Object.keys(definition.presets)[0];
      Object.assign(current.params, definition.presets[current.processPreset].params);
    }
    if (kind === 'source') configureNewSource(current, options);
    if (kind === 'converter' || kind === 'buffer') app.setpoints[id] = definition.rate;
    current.economics = app.defaultEconomics(current);
    app.graph.nodes.push(current);
    if (!options.silent) {
      app.pushUndo({ type: 'add-node', nodeId: id });
      app.undoGesture = null;
      app.selectedNodeId = id;
      app.pendingPort = null;
      app.solveAndRender();
    }
    return current;
  }

  function configureNewSource(current, options = {}) {
    if (current.unit === 'material-source') {
      current.sourcePreset = options.preset || 'air';
      current.rate = (current.sourcePreset === 'air' || current.sourcePreset === 'flueGas') ? 25000 : 100;
      if (options.label) current.label = options.label;
      else app.applyPracticalIntakeLabel(current, { force: true });
    } else if (current.unit === 'electricity-source' || current.unit === 'grid-electricity') current.rate = 1000;
    else if (current.unit === 'heat-source') { current.rate = 100; current.temperature = 100; }
    else if (current.unit === 'solar-pv' || current.unit === 'nuclear-electricity' || current.unit === 'solar-thermal') current.rate = 0;
    else current.rate = 10;
    if (options.chemicalId) current.chemicalId = options.chemicalId;
    if (options.temperature != null) current.temperature = options.temperature;
    assignSiteResource(current);
    if (app.site && !current.siteResource) assumeSiteResource(current);
    updateSourceStream(current);
  }

  function assignSiteResource(current) {
    if (!app.site || app.units[current.unit].kind !== 'source') return;
    const kind = app.units[current.unit].ports.out.kind;
    if (current.unit === 'grid-electricity' && app.site.resources.grid) current.siteResource = 'grid';
    else if (current.sourcePreset && app.site.resources[current.sourcePreset]?.stream?.kind === kind) current.siteResource = current.sourcePreset;
    else if (kind === 'electricity' && app.site.resources.electricity) current.siteResource = 'electricity';
    else if (kind === 'heat' && app.site.resources.heat) current.siteResource = 'heat';
    else if (kind === 'consumable') {
      const match = Object.entries(app.site.resources).find(([, resource]) => (
        resource.stream?.kind === 'consumable' && resource.stream.chemicalId === current.chemicalId
      ));
      if (match) current.siteResource = match[0];
    }
  }

  function assumeSiteResource(current) {
    updateSourceStream(current);
    const stream = current.params.stream;
    if (!stream) return;
    const key = stream.chemicalId || `${current.unit}-assumed`;
    let id = key;
    let n = 1;
    while (app.site.resources[id] && app.site.resources[id].stream?.chemicalId !== stream.chemicalId) {
      id = `${key}-${++n}`;
    }
    if (!app.site.resources[id]) {
      app.site.resources[id] = {
        stream: app.clone(stream),
        quality: 'user-assumption',
        evidence: 'Explicit project assumption added to complete a process route; not a verified local supply',
      };
    }
    current.siteResource = id;
  }

  function positionFor(kind, index) {
    if (kind === 'source') return { x: 40, y: 40 + index * 150 };
    if (kind === 'sink') return { x: 1120, y: 40 + index * 150 };
    return { x: 370 + (index % 2) * 360, y: 40 + Math.floor(index / 2) * 200 };
  }

  function updateSourceStream(current) {
    const resource = app.site?.resources?.[current.siteResource];
    if (resource?.stream) {
      const budget = sourceAmount(resource.stream);
      current.rate = Math.min(Number(current.rate) || 0, budget);
      if (resource.stream.kind === 'material') {
        current.params.stream = FlowsheetModel.scaleStream(resource.stream, budget === 0 ? 0 : current.rate / budget);
      } else if (resource.stream.kind === 'consumable') {
        current.params.stream = { ...resource.stream, amount: current.rate };
        current.chemicalId = resource.stream.chemicalId;
      } else if (resource.stream.kind === 'heat') {
        current.temperature = resource.stream.T_C;
        current.params.stream = { ...resource.stream, kWh: current.rate };
      } else {
        current.params.stream = { ...resource.stream, kWh: current.rate };
      }
      return;
    }
    if (current.unit === 'material-source') current.params.stream = materialStream(current.sourcePreset, current.rate);
    if (current.unit === 'electricity-source') current.params.stream = { kind: 'electricity', kWh: current.rate };
    if (current.unit === 'grid-electricity') current.params.stream = { kind: 'electricity', kWh: current.rate };
    if (current.unit === 'solar-pv' || current.unit === 'nuclear-electricity') {
      current.rate = current.params.capacityKW * 24 * current.params.capacityFactor;
      current.params.stream = { kind: 'electricity', kWh: current.rate };
    }
    if (current.unit === 'heat-source') current.params.stream = { kind: 'heat', kWh: current.rate, T_C: current.temperature };
    if (current.unit === 'solar-thermal') {
      current.rate = current.params.capacityKW * current.params.sunHours;
      current.params.stream = { kind: 'heat', kWh: current.rate, T_C: current.params.temperatureC };
    }
    if (current.unit === 'consumable-source') {
      current.params.stream = {
        kind: 'consumable', amount: current.rate, unit: 'kg/day',
        label: app.CONSUMABLE_CHEMICALS[current.chemicalId] || 'Sorbent makeup',
        ...(current.chemicalId ? { chemicalId: current.chemicalId } : {}),
      };
    }
  }

  function sourceAmount(stream) {
    if (stream.kind === 'material') return FlowsheetModel.streamMassKg(stream);
    if (stream.kind === 'consumable') return stream.amount;
    return stream.kWh;
  }

  function materialStream(presetId, targetKg) {
    const preset = app.materialPresets[presetId];
    const base = { kind: 'material', mol: { ...preset.mol }, phase: preset.phase, T_C: 25, P_bar: 1 };
    const factor = targetKg / FlowsheetModel.streamMassKg(base);
    return { ...base, mol: Object.fromEntries(Object.entries(base.mol).map(([id, mol]) => [id, mol * factor])) };
  }

  function clearFactory() {
    app.graph.nodes.length = 0;
    app.graph.edges.length = 0;
    Object.keys(app.setpoints).forEach(key => delete app.setpoints[key]);
    Object.keys(app.counts).forEach(key => delete app.counts[key]);
    app.undoStack = [];
    app.redoStack = [];
    app.undoGesture = null;
    app.syncRedoButton();
    app.selectedNodeId = null;
    app.selectedEdgeIndex = null;
    app.pendingPort = null;
    app.site = null;
    app.lastSizing = null;
    app.preSizingSeed = null;
    app.operationMeta = {};
    app.routeNote = '';
    setActiveDemo(null);
    app.clearCashflowBanner();
    app.solveAndRender();
  }

  function loadMethaneRecycle() {
    setActiveDemo('methane-recycle', 'Methane recycle');
    app.lastSizing = null;
    app.loadCase(SabatierCase.createSabatierCase({ recycleWater: true }), 'sabatier');
  }

  function loadCoastalMethane(month = 0) {
    setActiveDemo('coastal-methane', 'Coastal methane');
    app.lastSizing = null;
    app.loadCase(CoastalCase.createCoastalCase(month), 'sabatier');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'Coastal plant loaded. Co-product cashflow ranks CH₄/H₂ setpoints for positive plant net cash; size-to-target remains available.';
    }
  }

  function loadMethanolPlant(month = 0) {
    setActiveDemo('coastal-methanol', 'Coastal methanol');
    app.lastSizing = null;
    if (typeof MethanolCase === 'undefined' || !MethanolCase.createMethanolCase) {
      throw new Error('Methanol case is not loaded');
    }
    app.loadCase(MethanolCase.createMethanolCase(month), 'methanol');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'Coastal methanol loaded. Size-to-target methanol sizes DAC, SWRO, electrolyzer, and PV; cashflow stays screening.';
    }
  }

  function loadSiliconAlumina() {
    setActiveDemo('silicon-alumina', 'Mejillones PV BOM (Bayer Al + poly-Si + Ag/glass/EVA)');
    app.lastSizing = null;
    if (typeof SiliconCase === 'undefined' || !SiliconCase.createSiliconCase) {
      throw new Error('Silicon case is not loaded');
    }
    app.loadCase(SiliconCase.createSiliconCase(), 'pv-module');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening module assembly on frozen Mejillones PV; Size-to-target → PV module; may be cash±; not bankable; not a cell fab.';
    }
  }

  function loadFloatGlass() {
    setActiveDemo('float-glass', 'Mejillones float glass (sand+soda+limestone)');
    app.lastSizing = null;
    if (typeof FloatGlassCase === 'undefined' || !FloatGlassCase.createFloatGlassCase) {
      throw new Error('Float glass case is not loaded');
    }
    app.loadCase(FloatGlassCase.createFloatGlassCase(), 'float-glass');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening float glass from purchased sand+soda+limestone on frozen Mejillones PV; Size-to-target → float glass; may be cash±; not bankable; not a tin-bath line.';
    }
  }

  function loadCement() {
    setActiveDemo('cement', 'Mejillones cement (limestone+clay)');
    app.lastSizing = null;
    if (typeof CementCase === 'undefined' || !CementCase.createCementCase) {
      throw new Error('Cement case is not loaded');
    }
    app.loadCase(CementCase.createCementCase(), 'cement');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening grey cement from purchased limestone+clay on frozen Mejillones PV; Size-to-target → cement; may be cash±; not bankable; not a wet kiln.';
    }
  }

  function loadCuEw() {
    setActiveDemo('cu-ew', 'Mejillones copper SX-EW (purchased PLS)');
    app.lastSizing = null;
    if (typeof CuEwCase === 'undefined' || !CuEwCase.createCuEwCase) {
      throw new Error('Copper SX-EW case is not loaded');
    }
    app.loadCase(CuEwCase.createCuEwCase(), 'cu-ew');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening SX-EW cathode from purchased PLS copper on frozen Mejillones PV; Size-to-target → copper; may be cash±; not bankable; not a mine or heap pad.';
    }
  }

  function loadH2Dri() {
    setActiveDemo('h2-dri', 'Mejillones H₂-DRI (purchased ore+H₂)');
    app.lastSizing = null;
    if (typeof H2DriCase === 'undefined' || !H2DriCase.createH2DriCase) {
      throw new Error('H₂-DRI case is not loaded');
    }
    app.loadCase(H2DriCase.createH2DriCase(), 'dri');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening H₂-DRI from purchased ore+H₂ on frozen Mejillones PV; may be cash±; not bankable; not green-H₂ path.';
    }
  }

  function loadGreenH2Dri() {
    setActiveDemo('green-h2-dri', 'Mejillones green H₂-DRI (SWRO+PEM)');
    app.lastSizing = null;
    if (typeof GreenH2DriCase === 'undefined' || !GreenH2DriCase.createGreenH2DriCase) {
      throw new Error('Green H₂-DRI case is not loaded');
    }
    app.loadCase(GreenH2DriCase.createGreenH2DriCase(), 'dri');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening seawater+sun → PEM H₂ → DRI Fe; not purchased H₂; not Midrex; not bankable.';
    }
  }

  function loadTiKroll() {
    setActiveDemo('ti-kroll', 'Mejillones Ti Kroll (purchased TiCl₄+Mg)');
    app.lastSizing = null;
    if (typeof TiKrollCase === 'undefined' || !TiKrollCase.createTiKrollCase) {
      throw new Error('Ti Kroll case is not loaded');
    }
    app.loadCase(TiKrollCase.createTiKrollCase(), 'kroll');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening Kroll from purchased TiCl₄+Mg metal on frozen Mejillones PV; Size-to-target → titanium; may be cash±; not bankable; not TIMET; not chloride rutile.';
    }
  }

  function loadReeIonic() {
    setActiveDemo('ree-ionic', 'Minaçu ionic clay → NdPr + mixed REO');
    app.lastSizing = null;
    if (typeof ReeCase === 'undefined' || !ReeCase.createReeCase) {
      throw new Error('REE case is not loaded');
    }
    app.loadCase(ReeCase.createReeCase(), 'iac-leach');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'Longnan literature basket on a Minaçu map point; ionic clay leach+precip+calcine; 70% payability; no SX; screening; not a concession; not bankable.';
    }
  }

  function loadMaglutLongBeach() {
    setActiveDemo('maglut-long-beach', 'Long Beach ARC-1 chromatography → NdPr + DyTb');
    app.lastSizing = null;
    if (typeof MaglutCase === 'undefined' || !MaglutCase.createMaglutCase) {
      throw new Error('Maglut case is not loaded');
    }
    app.loadCase(MaglutCase.createMaglutCase(), 'chrom');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'Long Beach map point only; ARC-1-style chromatography; Size-to-target → ndpr; proxy SEC/CAPEX; company-reported recovery not a Maglut quote; screening; not bankable.';
    }
  }

  function loadReeSx() {
    setActiveDemo('ree-sx', 'Long Beach peer SX (not Maglut)');
    app.lastSizing = null;
    if (typeof ReeSxCase === 'undefined' || !ReeSxCase.createReeSxCase) {
      throw new Error('REE SX case is not loaded');
    }
    app.loadCase(ReeSxCase.createReeSxCase(), 'sx');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'peer SX screening on frozen Long Beach PV; may be cash±; not Maglut; not bankable.';
    }
  }

  function loadBioforgeMarshall() {
    setActiveDemo('bioforge-marshall', 'Marshall Bioforge gluconic + H₂O₂');
    app.lastSizing = null;
    if (typeof BioforgeCase === 'undefined' || !BioforgeCase.createBioforgeCase) {
      throw new Error('Bioforge case is not loaded');
    }
    app.loadCase(BioforgeCase.createBioforgeCase(), 'bioforge');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'Screening GOx dextrose → gluconic + H₂O₂ at a Marshall map point; may be cash−; not the Solugen plant; not an ADM contract; not bankable.';
    }
  }

  function loadGreenAmmonia() {
    setActiveDemo('green-ammonia', 'Walvis Bay green NH₃');
    app.lastSizing = null;
    if (typeof GreenAmmoniaCase === 'undefined' || !GreenAmmoniaCase.createGreenAmmoniaCase) {
      throw new Error('Green ammonia case is not loaded');
    }
    app.loadCase(GreenAmmoniaCase.createGreenAmmoniaCase(), 'ammonia');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening air + seawater + sun → NH₃, not chlor-alkali H₂, not bankable.';
    }
  }

  function loadUrea() {
    setActiveDemo('urea', 'Walvis Bay urea (purchased NH₃+CO₂)');
    app.lastSizing = null;
    if (typeof UreaCase === 'undefined' || !UreaCase.createUreaCase) {
      throw new Error('Urea case is not loaded');
    }
    app.loadCase(UreaCase.createUreaCase(), 'urea');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening urea from purchased feeds on frozen Walvis PV; Size-to-target → urea; may be cash±; not bankable; not green-NH₃ path.';
    }
  }

  function loadGreenUrea() {
    setActiveDemo('green-urea', 'Walvis Bay green urea (SWRO+PEM Haber→urea)');
    app.lastSizing = null;
    if (typeof GreenUreaCase === 'undefined' || !GreenUreaCase.createGreenUreaCase) {
      throw new Error('Green urea case is not loaded');
    }
    app.loadCase(GreenUreaCase.createGreenUreaCase(), 'urea');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening seawater+sun → PEM H₂ + ASU N₂ → Haber NH₃ + purchased CO₂ → urea; Size-to-target → urea resizes this stack; not purchased NH₃; not DAC; not bankable.';
    }
  }

  function loadMto() {
    setActiveDemo('mto', 'Mejillones MTO (purchased MeOH→ethylene)');
    app.lastSizing = null;
    if (typeof MtoCase === 'undefined' || !MtoCase.createMtoCase) {
      throw new Error('MTO case is not loaded');
    }
    app.loadCase(MtoCase.createMtoCase(), 'mto');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening MTO ethylene from purchased MeOH on frozen Mejillones PV; may be cash±; not bankable; not green-MeOH; not full olefin slate.';
    }
  }

  function loadFtLiquids() {
    setActiveDemo('ft-liquids', 'Mejillones FT liquids (purchased H₂+CO₂→diesel)');
    app.lastSizing = null;
    if (typeof FtLiquidsCase === 'undefined' || !FtLiquidsCase.createFtLiquidsCase) {
      throw new Error('FT liquids case is not loaded');
    }
    app.loadCase(FtLiquidsCase.createFtLiquidsCase(), 'ft-liquids');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening FT diesel from purchased H₂+CO₂ on frozen Mejillones PV; Size-to-target → diesel; may be cash±; not bankable; not green e-diesel; RWGS folded; not full FT slate.';
    }
  }

  function loadGreenMto() {
    setActiveDemo('green-mto', 'Mejillones green MTO (SWRO+PEM MeOH→ethylene)');
    app.lastSizing = null;
    if (typeof GreenMtoCase === 'undefined' || !GreenMtoCase.createGreenMtoCase) {
      throw new Error('Green MTO case is not loaded');
    }
    app.loadCase(GreenMtoCase.createGreenMtoCase(), 'mto');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening seawater+sun → PEM H₂ + purchased CO₂ → MeOH → ethylene; Size-to-target → ethylene resizes this stack; not purchased MeOH; not DAC; not bankable.';
    }
  }

  function loadGreenFt() {
    setActiveDemo('green-ft', 'Mejillones green FT (SWRO+PEM H₂+CO₂→diesel)');
    app.lastSizing = null;
    if (typeof GreenFtCase === 'undefined' || !GreenFtCase.createGreenFtCase) {
      throw new Error('Green FT case is not loaded');
    }
    app.loadCase(GreenFtCase.createGreenFtCase(), 'ft-liquids');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) {
      status.textContent = 'screening seawater+sun → PEM H₂ + purchased CO₂ → diesel; Size-to-target → diesel resizes this stack; not purchased H₂; not DAC; not bankable.';
    }
  }
})();
