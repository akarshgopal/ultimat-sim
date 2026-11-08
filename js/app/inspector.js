// Inspector panel: input handling, controls, buffer/lift economics, port view.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    handleInspectorClick, handleInspectorInput, handleProjectEconomics, inferBufferFluidClass,
    refreshBufferEconomics, renderInspector, siteRegionForTea, suggestedPreset, teaApi,
  });

  function handleInspectorInput(event) {
    const current = app.node(app.selectedNodeId);
    if (!current) return;
    app.noteInspectorUndo(event);
    if (event.target.name === 'requestedRate') app.setpoints[current.id] = Number(event.target.value);
    if (event.target.name === 'dacRoute' && event.target.value !== current.unit) {
      app.replaceUnit(current.id, event.target.value);
      return;
    }
    if (event.target.name === 'processPreset') {
      current.processPreset = event.target.value;
      if (current.processPreset !== 'custom') Object.assign(current.params, app.catalog[current.unit].presets[current.processPreset].params);
      if (app.units[current.unit].kind === 'source') app.updateSourceStream(current);
    }
    if (event.target.name === 'siteResource') {
      current.siteResource = event.target.value || undefined;
      if (current.unit === 'material-source') app.applyPracticalIntakeLabel(current, { force: app.isAutoIntakeLabel(current.label) });
      app.updateSourceStream(current);
    }
    if (event.target.name === 'chemicalId') {
      current.chemicalId = event.target.value || undefined;
      app.updateSourceStream(current);
    }
    if (event.target.name === 'processParameter') {
      current.processPreset = 'custom';
      const key = event.target.dataset.param;
      const raw = String(event.target.value ?? '').trim();
      if (raw === '') {
        delete current.params[key];
        if (key === 'headM' || key === 'pumpEta') delete current.params.pumpSecOverride;
        if (key === 'deltaP_kPa' || key === 'blowerEta') delete current.params.blowerSecOverride;
      } else {
        const value = Number(raw);
        if (!Number.isFinite(value)) app.solveError = `${key} must be a number`;
        else {
          current.params[key] = value;
          if (key === 'pumpKWhPerM3' || key === 'pumpKWhPerKg') current.params.pumpSecOverride = true;
          if (key === 'headM' || key === 'pumpEta') delete current.params.pumpSecOverride;
          if (key === 'blowerKWhPerNm3' || key === 'blowerKWhPerKg') current.params.blowerSecOverride = true;
          if (key === 'deltaP_kPa' || key === 'blowerEta') delete current.params.blowerSecOverride;
        }
      }
      if (['battery', 'thermal-storage'].includes(current.unit) && key === 'capexPerKWh') current.economics.installedCapex = current.capacity * current.params.capexPerKWh;
    }
    if (event.target.name === 'bufferParameter') {
      const key = event.target.dataset.param;
      if (key === 'fluidClass') {
        current.params.fluidClass = event.target.value;
        // Reset density/intensity so fluid-class defaults apply.
        delete current.params.densityKgM3;
        delete current.params.capexPerM3;
        delete current.params.densityOverride;
        delete current.params.intensityOverride;
        refreshBufferEconomics(current);
      } else {
        current.params[key] = Number(event.target.value);
        if (key === 'capacityKg') {
          current.capacity = Math.max(current.capacity || 0, Number(event.target.value) || 0);
        }
        if (key === 'densityKgM3') current.params.densityOverride = true;
        if (key === 'capexPerM3') current.params.intensityOverride = true;
        if (['capacityKg', 'capexPerM3', 'densityKgM3', 'capexPerKg'].includes(key)) {
          refreshBufferEconomics(current);
        }
      }
    }
    if (event.target.name === 'sinkParameter') {
      const key = event.target.dataset.param;
      const raw = String(event.target.value ?? '').trim();
      if (!current.params) current.params = {};
      if (raw === '' || event.target.dataset.cleared === '1') delete current.params[key];
      else {
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) app.solveError = 'Export / offtake limit must be ≥ 0 (blank = demand-backed or unlimited).';
        else current.params[key] = value;
      }
    }
    if (event.target.name === 'sourceParameter') {
      current.processPreset = 'custom';
      current.params[event.target.dataset.param] = Number(event.target.value);
      app.updateSourceStream(current);
      if (['capacityKW', 'capexPerKW', 'fixedOMPerKWYear', 'variableCostPerMWh', 'lifeYears', 'pricePerMWh'].includes(event.target.dataset.param)) current.economics = app.defaultEconomics(current);
    }
    if (event.target.name === 'sourceRate') { current.rate = Number(event.target.value); app.updateSourceStream(current); }
    if (event.target.name === 'sourcePreset') {
      current.sourcePreset = event.target.value;
      app.applyPracticalIntakeLabel(current, { force: app.isAutoIntakeLabel(current.label) });
      app.updateSourceStream(current);
    }
    if (event.target.name === 'heatTemperature') { current.temperature = Number(event.target.value); app.updateSourceStream(current); }
    if (event.target.name === 'branchWeight') app.graph.edges[Number(event.target.dataset.edge)].weight = Number(event.target.value);
    if (event.target.name === 'branchPriority') {
      const value = Number(event.target.value);
      app.graph.edges[Number(event.target.dataset.edge)].priority = Number.isFinite(value) ? value : 0;
    }
    if (event.target.name === 'edgeCapacity') {
      const edge = app.graph.edges[Number(event.target.dataset.edge)];
      const raw = String(event.target.value ?? '').trim();
      if (raw === '') delete edge.capacity;
      else {
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) app.solveError = 'Edge capacity must be ≥ 0 (blank = unlimited).';
        else edge.capacity = value;
      }
      app.selectedEdgeIndex = Number(event.target.dataset.edge);
    }
    if (event.target.name === 'economics') {
      const key = event.target.dataset.economics;
      current.economics[key] = key === 'disposition' ? event.target.value : Number(event.target.value);
    }
    app.solveAndRender();
  }

  function handleProjectEconomics(event) {
    if (event.target.id === 'projectLifeYears') app.projectEconomics.projectLifeYears = Math.max(1, Number(event.target.value) || 1);
    if (event.target.id === 'discountRate') app.projectEconomics.discountRate = Math.max(0, Number(event.target.value) || 0) / 100;
    app.solveAndRender();
  }

  function handleInspectorClick(event) {
    const cause = event.target.closest?.('[data-diagnosis]');
    if (cause) {
      const current = app.node(app.selectedNodeId);
      const diagnosis = current ? app.blockDiagnosis(current) : null;
      if (diagnosis) app.followDiagnosis(diagnosis);
      return;
    }
    const selectEdge = event.target.closest('[data-select-edge]');
    if (selectEdge && !event.target.closest('input,button,select')) {
      app.selectedEdgeIndex = Number(selectEdge.dataset.selectEdge);
      app.render();
      return;
    }
    const disconnect = event.target.closest('[data-disconnect]');
    if (disconnect) {
      app.graph.edges.splice(Number(disconnect.dataset.disconnect), 1);
      app.pendingPort = null;
      app.solveAndRender();
      return;
    }
    const addBoundary = event.target.closest('[data-boundary-port]');
    if (addBoundary) {
      const target = { node: app.selectedNodeId, port: addBoundary.dataset.boundaryPort, direction: addBoundary.dataset.direction };
      app.addBoundaryNode(target, true);
      app.selectedNodeId = target.node;
      app.solveAndRender();
      return;
    }
    if (event.target.closest('#deleteNode')) app.deleteSelection();
  }

  function suggestedPreset(unit, port) {
    return {
      'dac.air': 'air', 'dac-solid.air': 'air', 'dac-liquid.air': 'air', 'dac-electroswing.air': 'air',
      'asu.air': 'air', 'swro.feed': 'seawater', 'med.feed': 'seawater', 'msf.feed': 'seawater', 'brine-minerals.brine': 'brine',
      'electrolyzer.water': 'water', 'chlor-alkali.water': 'water', 'sabatier.co2': 'co2', 'sabatier.hydrogen': 'hydrogen',
      'ammonia.nitrogen': 'nitrogen', 'ammonia.hydrogen': 'hydrogen',
      'urea.ammonia': 'ammonia', 'urea.carbonDioxide': 'co2',
      'methanol.co2': 'co2', 'methanol.hydrogen': 'hydrogen',
      'mto.methanol': 'methanol',
      'chlor-alkali.salt': 'salt',
      'bromine-recovery.bromide': 'bromide', 'bromine-recovery.chlorine': 'chlorine',
      'aluminium-smelter.alumina': 'alumina', 'aluminium-smelter.carbon': 'carbon', 'mg-si.quartz': 'quartz', 'mg-si.carbon': 'carbon', 'polysilicon.silicon': 'silicon',
      'bayer-alumina.bauxite': 'bauxite', 'bayer-alumina.caustic': 'caustic',
      'float-glass.sand': 'silica-sand', 'float-glass.sodaAsh': 'soda-ash', 'float-glass.limestone': 'limestone',
      'cement.limestone': 'limestone', 'cement.clay': 'kiln-clay',
      'copper-ew.pls': 'pls-copper',
      'pv-module.polysilicon': 'silicon', 'pv-module.silver': 'silver', 'pv-module.glass': 'float-glass', 'pv-module.eva': 'eva', 'pv-module.aluminium': 'aluminium',
      'hydrogen-dri.ironOre': 'ironOre', 'hydrogen-dri.hydrogen': 'hydrogen',
      'iac-leach.clay': 'ionic-clay', 'iac-leach.lixiviant': 'ammonium-sulfate',
      'ree-chromatography.concentrate': 'mixed-reo',
      'ree-sx.concentrate': 'mixed-reo',
      'bioforge.dextrose': 'dextrose', 'bioforge.oxygen': 'oxygen', 'bioforge.water': 'water',
      'titanium-kroll.titaniumTetrachloride': 'titaniumTetrachloride', 'titanium-kroll.magnesium': 'magnesium',
    }[`${unit}.${port}`] || 'water';
  }

  function renderInspector() {
    const current = app.node(app.selectedNodeId);
    app.inspector.classList.toggle('has-selection', !!current);
    const diagnosisEl = document.getElementById('nodeDiagnosis');
    if (!current) {
      document.getElementById('inspectorTitle').textContent = 'Nothing selected';
      document.getElementById('inspectorKind').textContent = 'Select a block.';
      if (diagnosisEl) { diagnosisEl.hidden = true; diagnosisEl.innerHTML = ''; }
      document.getElementById('nodeControls').innerHTML = '';
      document.getElementById('inspectorMetrics').innerHTML = '';
      document.getElementById('streamList').innerHTML = '<p class="status-meta">No ports yet.</p>';
      document.getElementById('recipeList').innerHTML = '';
      document.getElementById('exchangeList').innerHTML = '';
      document.getElementById('balanceList').innerHTML = '';
      return;
    }
    document.getElementById('inspectorTitle').textContent = current.label;
    document.getElementById('inspectorKind').textContent = `${app.units[current.unit].kind} · ${current.unit}`;
    const diagnosis = app.blockDiagnosis(current);
    if (diagnosisEl) {
      diagnosisEl.hidden = !diagnosis;
      diagnosisEl.innerHTML = diagnosis
        ? `<strong>${app.escapeHtml(diagnosis.detail || diagnosis.text)}</strong>${app.diagnosisButton(diagnosis)}`
        : '';
    }
    document.getElementById('nodeControls').innerHTML = controlsFor(current);
    const nodeResult = app.result?.nodes[current.id];
    const causeRow = nodeResult?.causeText ? [['Cause', nodeResult.causeText]] : [];
    const metrics = nodeResult?.activity !== undefined ? [
      ['Achieved', `${app.formatNumber(nodeResult.activity)} ${app.catalog[current.unit]?.activityUnit || ''}`],
      ['Requested', `${app.formatNumber(app.setpoints[current.id])} ${app.catalog[current.unit]?.activityUnit || ''}`],
      ['Limited by', app.formatLimitedBy(current, nodeResult)],
      ...causeRow,
      ...(nodeResult.inventoryKg != null ? [[
        'Inventory',
        `${app.formatNumber(nodeResult.inventoryKg)} kg${nodeResult.capacityKg != null ? ` / ${app.formatNumber(nodeResult.capacityKg)} kg` : ''}${nodeResult.fill != null ? ` (${app.formatNumber(nodeResult.fill * 100)}%)` : ''}`,
      ]] : []),
    ] : nodeResult?.inventoryKg != null ? [[
      'Inventory',
      `${app.formatNumber(nodeResult.inventoryKg)} kg${nodeResult.capacityKg != null ? ` / ${app.formatNumber(nodeResult.capacityKg)} kg` : ''}`,
    ], ...(nodeResult.limitedBy?.length ? [['Limited by', nodeResult.limitedBy.join(', ')]] : []), ...causeRow]
      : nodeResult?.limitedBy?.length ? [['Limited by', nodeResult.limitedBy.join(', ')], ...causeRow] : [...causeRow];
    document.getElementById('inspectorMetrics').innerHTML = app.metricRows([...metrics, ...app.economicsRows(current)]);
    document.getElementById('streamList').innerHTML = Object.entries(app.units[current.unit].ports).map(([port, declaration]) => renderInspectorPort(current, port, declaration)).join('');
    document.getElementById('recipeList').innerHTML = nodeResult?.requestedInputs ? `${app.recipeGroup('INFLOW', nodeResult.requestedInputs, current.unit)}${app.recipeGroup('OUTFLOW', nodeResult.outlets, current.unit)}` : '<p class="status-meta">Complete the graph to calculate flows.</p>';
    const exchanges = app.result?.streams.filter(stream => stream.recycle) || [];
    document.getElementById('exchangeList').innerHTML = exchanges.length
      ? exchanges.map(stream => `<div class="recipe-flow"><strong>${stream.label || 'Recovered stream'}</strong><span class="species">${app.node(stream.from.node).label} → ${app.node(stream.to.node).label} · ${app.formatStream(stream.stream)}</span></div>`).join('')
      : '<p class="status-meta">No circular exchanges.</p>';
    const heat = app.result?.heatIntegration;
    document.getElementById('balanceList').innerHTML = app.result ? app.metricRows([
      ...Object.entries(app.result.balances.elements).map(([element, value]) => [element, `${app.formatNumber(value)} mol`]),
      ['Electricity', `${app.formatNumber(app.result.balances.electricityKWh)} kWh`], ['Heat', `${app.formatNumber(app.result.balances.heatKWh)} kWh`],
      ...(heat ? [
        ['Heat covered', `${app.formatNumber(heat.coveredKWh)} kWh`],
        ['Heat residual demand', `${app.formatNumber(heat.residualDemandKWh)} kWh`],
        ['Unrecovered waste heat', `${app.formatNumber(heat.unrecoveredWasteKWh)} kWh`],
        ...(heat.matches || []).map(match => [
          `${match.from} → ${match.to}`,
          `${app.formatNumber(match.kWh)} kWh @ ${app.formatNumber(match.T_C)} °C`,
        ]),
      ] : []),
      ['Recycle solve', app.result.convergence.converged ? `${app.result.convergence.iterations} iterations` : 'Did not converge'],
    ]) : '';
  }

  function literatureMarkup(definition, unitId) {
    const quality = app.classifyQuality({
      kind: 'intensity',
      unit: unitId,
      sourceNote: definition.sourceNote,
      references: definition.references,
      economicsNote: definition.economicsNote,
    });
    const chip = app.qualityChip(quality);
    const references = (definition.references || []).map(reference => `<a href="${reference.url}" target="_blank" rel="noreferrer">${reference.label}</a>`).join(' · ');
    const band = app.parseBand(definition.sourceNote);
    const bandLine = band
      ? `<p class="status-meta quality-band">Literature range ${app.formatUncertainNumber(band.low, 'cited')}–${app.formatUncertainNumber(band.high, 'cited')} ${band.unit}</p>`
      : '';
    const sourceNote = definition.sourceNote
      ? `<p class="status-meta">${chip} ${definition.sourceNote}</p>`
      : (chip ? `<p class="status-meta">${chip}</p>` : '');
    const body = `${sourceNote}${bandLine}${references ? `<p class="literature-links">Basis: ${references}</p>` : ''}`;
    return body ? `<details class="more-section"><summary>Literature</summary>${body}</details>` : '';
  }

  function controlsFor(current) {
    const kind = app.units[current.unit].kind;
    if (kind === 'converter') {
      const definition = app.catalog[current.unit];
      const preset = definition.presets ? `<label>Process type</label><select name="processPreset">${Object.entries(definition.presets).map(([id, item]) => `<option value="${id}"${id === current.processPreset ? ' selected' : ''}>${item.label}</option>`).join('')}<option value="custom"${current.processPreset === 'custom' ? ' selected' : ''}>Custom</option></select>` : '';
      const route = app.DAC_ROUTES[current.unit] ? `<label>Process route<select name="dacRoute">${Object.entries(app.DAC_ROUTES).filter(([id]) => current.unit === 'dac' || id !== 'dac').map(([id, label]) => `<option value="${id}"${id === current.unit ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : '';
      const intensityQuality = app.classifyQuality({
        kind: 'intensity',
        unit: current.unit,
        sourceNote: definition.sourceNote,
        references: definition.references,
      });
      const parameters = (definition.controls || []).map(control => parameterControl(control, current, 'processParameter', intensityQuality)).join('');
      const headNote = current.unit === 'intake-pump' ? pumpHeadNote(current) : current.unit === 'gas-blower' ? blowerPressureNote(current) : '';
      const hasAssumptions = route || preset || parameters || definition.sourceNote || (definition.references && definition.references.length);
      return `<fieldset><legend>Independent setpoint</legend><label>Requested rate <output>${app.formatNumber(app.setpoints[current.id])} ${definition.activityUnit}</output></label><input name="requestedRate" type="range" min="0" max="${current.capacity}" step="1" value="${app.setpoints[current.id]}"></fieldset>${hasAssumptions ? `<fieldset><legend>Process assumptions</legend>${route}${preset}${parameters}${headNote}${definition.chemicalId ? `<p class="status-meta">Makeup chemical: ${app.CONSUMABLE_CHEMICALS[definition.chemicalId] || definition.chemicalId}. Switching routes does not rewrite an existing supply.</p>` : ''}${literatureMarkup(definition, current.unit)}</fieldset>` : ''}${app.economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete block</button>`;
    }
    if (kind === 'source') {
      const definition = app.catalog[current.unit];
      const budget = current.siteResource && app.site?.resources?.[current.siteResource]?.stream
        ? app.sourceAmount(app.site.resources[current.siteResource].stream) : null;
      const max = budget ?? definition.manualRateMax ?? (current.unit === 'material-source' ? 100000 : current.unit === 'electricity-source' ? 10000 : current.unit === 'heat-source' ? 1000 : 100);
      const unit = definition.sourceUnit || (current.unit === 'material-source' || current.unit === 'consumable-source' ? 'kg/day' : 'kWh/day');
      const siteResource = app.site ? `<label>Site resource<select name="siteResource"><option value="">Unassigned — unverified</option>${Object.entries(app.site.resources).filter(([, resource]) => resource.stream?.kind === app.units[current.unit].ports.out.kind).map(([id, resource]) => `<option value="${id}"${id === current.siteResource ? ' selected' : ''}>${id} · ${resource.quality || 'assumed'}</option>`).join('')}</select></label>` : '';
      const preset = current.unit === 'material-source' && !current.siteResource ? `<label>Material</label><select name="sourcePreset">${Object.entries(app.materialPresets).map(([id, item]) => `<option value="${id}"${id === current.sourcePreset ? ' selected' : ''}>${item.label}</option>`).join('')}</select>` : '';
      const chemical = current.unit === 'consumable-source' && !current.siteResource ? `<label>Makeup chemical<select name="chemicalId"><option value="">Unspecified</option>${Object.entries(app.CONSUMABLE_CHEMICALS).map(([id, label]) => `<option value="${id}"${id === current.chemicalId ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : '';
      const temperature = current.unit === 'heat-source' && !current.siteResource ? `<label>Temperature <output>${current.temperature} °C</output></label><input name="heatTemperature" type="range" min="20" max="1000" step="5" value="${current.temperature}">` : '';
      const processPreset = definition.presets ? `<label>Technology</label><select name="processPreset">${Object.entries(definition.presets).map(([id, item]) => `<option value="${id}"${id === current.processPreset ? ' selected' : ''}>${item.label}</option>`).join('')}<option value="custom"${current.processPreset === 'custom' ? ' selected' : ''}>Custom</option></select>` : '';
      const intensityQuality = app.classifyQuality({
        kind: 'intensity',
        unit: current.unit,
        sourceNote: definition.sourceNote,
        references: definition.references,
        economicsNote: definition.economicsNote,
      });
      const parameters = (definition.controls || []).map(control => {
        const energy = /kWh|secKWh|capacityFactor/i.test(`${control.key} ${control.unit || ''}`);
        const chip = energy ? app.qualityChip(intensityQuality) : '';
        return `<label>${control.label} <output>${app.formatNumber(current.params[control.key])}${control.unit ? ` ${control.unit}` : ''}</output>${chip}</label><input name="sourceParameter" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current.params[control.key]}">`;
      }).join('');
      const rate = definition.controls && !definition.manualRateMax
        ? `<p class="status-meta">Available: ${app.formatNumber(current.rate)} ${unit}</p>`
        : `<label>Available rate <output>${app.formatNumber(current.rate)} ${unit}</output></label><input name="sourceRate" type="range" min="0" max="${max}" step="${max / 100 || 0.01}" value="${current.rate}">`;
      const resourceEvidence = app.site?.resources?.[current.siteResource]?.evidence;
      const capNote = budget != null ? `<p class="status-meta"${resourceEvidence ? ` title="${app.escapeHtml(resourceEvidence)}"` : ''}>${app.escapeHtml(app.roundTaggedQuantities(resourceEvidence || 'Capped by the named site resource. A second block sharing this resource cannot duplicate it.'))}</p>` : (app.site && !current.siteResource ? '<p class="status-meta">Unassigned sources are unverified. They do not become unlimited supply.</p>' : '');
      const sourceLegend = current.unit === 'material-source' ? 'Intake settings' : 'Source settings';
      return `<fieldset><legend>${sourceLegend}</legend>${siteResource}${preset}${chemical}${processPreset}${rate}${temperature}${parameters}${capNote}${definition.economicsNote ? `<p class="status-meta">${definition.economicsNote}</p>` : ''}${literatureMarkup(definition, current.unit)}</fieldset>${app.economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete source</button>`;
    }
    if (kind === 'buffer') {
      if (!current.params?.densityOverride && !current.params?.intensityOverride) {
        const nextFluid = inferBufferFluidClass(current);
        const live = liveFluidDensity(nextFluid);
        const econ = current.economics || {};
        const densityDrift = live && Math.abs(Number(econ.densityKgM3) - live.densityKgM3) > 0.5;
        if (econ.fluidClass !== nextFluid || densityDrift || (live && econ.densitySource !== live.source && econ.densitySource !== 'override')) {
          refreshBufferEconomics(current);
        }
      }
      const definition = app.catalog[current.unit];
      const parameters = (definition.controls || []).map(control => (
        `<label>${control.label} <output>${app.formatNumber(current.params[control.key] ?? 0)}${control.unit ? ` ${control.unit}` : ''}</output></label><input name="bufferParameter" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current.params[control.key] ?? 0}">`
      )).join('');
      const nodeResult = app.result?.nodes[current.id];
      const socLine = nodeResult?.inventoryKg != null
        ? `<p class="status-meta">Inventory ${app.formatNumber(nodeResult.inventoryKg)} kg${nodeResult.capacityKg != null ? ` / ${app.formatNumber(nodeResult.capacityKg)} kg` : ''}${nodeResult.fill != null ? ` (${app.formatNumber(nodeResult.fill * 100)}% full)` : ''}</p>`
        : '<p class="status-meta">Inventory updates after solve. Horizon carries SOC hour to hour.</p>';
      return `<fieldset><legend>Buffer tank</legend><label>Discharge setpoint <output>${app.formatNumber(app.setpoints[current.id] ?? 0)} ${definition.activityUnit}</output></label><input name="requestedRate" type="range" min="0" max="${Math.max(current.capacity || 0, definition.capacity || 0, app.setpoints[current.id] || 0, 1)}" step="1" value="${app.setpoints[current.id] ?? 0}">${(() => { const tea = teaApi(); const fluids = tea?.tankByFluid ? Object.values(tea.tankByFluid) : [{ id: 'generic', label: 'Generic liquid', capexPerM3: 500 }]; const currentFluid = inferBufferFluidClass(current); return `<label>Fluid class<select name="bufferParameter" data-param="fluidClass">${fluids.map(f => `<option value="${f.id}"${f.id === currentFluid ? ' selected' : ''}>${app.escapeHtml(f.label)} ($${app.formatNumber(f.capexPerM3)}/m³)</option>`).join('')}</select></label>`; })()}${parameters}${socLine}${literatureMarkup(definition, current.unit)}</fieldset>${app.economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete buffer</button>`;
    }
    if (kind === 'sink' && current.unit === 'material-sink') {
      const definition = app.catalog[current.unit] || {};
      const acceptRaw = current.params?.acceptKg;
      const acceptValue = acceptRaw == null || acceptRaw === '' ? '' : acceptRaw;
      const periodDays = Number(app.currentEconomics?.periodDays) > 0
        ? Number(app.currentEconomics.periodDays)
        : (Number(app.projectEconomics.periodDays) > 0 ? Number(app.projectEconomics.periodDays) : 365);
      const demandAnnual = Number(current.economics?.annualDemandLimit);
      const demandEligible = current.economics?.disposition === 'sale'
        && Number.isFinite(demandAnnual) && demandAnnual >= 0;
      const demandDaily = demandEligible ? demandAnnual / periodDays : null;
      const demandBacked = acceptValue === '' && demandDaily != null;
      const acceptOut = acceptValue !== ''
        ? `${app.formatNumber(acceptValue)} kg/day`
        : demandBacked
          ? `${app.formatNumber(demandDaily)} kg/day (demand)`
          : 'Unlimited';
      const nodeResult = app.result?.nodes[current.id];
      const capNote = nodeResult?.acceptKg != null
        ? ` / ${app.formatNumber(nodeResult.acceptKg)} kg cap${nodeResult.acceptSource === 'demand' ? ' · demand-backed' : nodeResult.acceptSource === 'manual' ? ' · manual' : ''}`
        : '';
      const receivedLine = nodeResult?.received
        ? `<p class="status-meta">Received ${app.formatStream(nodeResult.received)}${capNote}</p>`
        : '';
      const demandLine = demandBacked
        ? `<p class="status-meta">Demand-backed offtake ${app.formatNumber(demandDaily)} kg/day from annualDemandLimit ${app.formatNumber(demandAnnual)} kg/y ÷ ${app.formatNumber(periodDays)} days. Clear Destination demand or type a manual override.</p>`
        : '';
      const placeholder = demandDaily != null ? 'Demand-backed' : 'Unlimited';
      const title = demandDaily != null
        ? 'Max kg accepted this solve day. Blank = TEA annualDemandLimit ÷ operating days. Type a value to override.'
        : 'Max kg accepted this solve day. Blank = unlimited (no annualDemandLimit on this sink).';
      const acceptControl = `<label>Export / offtake limit <output>${acceptOut}</output></label><input name="sinkParameter" data-param="acceptKg" type="number" min="0" step="any" placeholder="${placeholder}" value="${app.escapeHtml(acceptValue)}" title="${app.escapeHtml(title)}">`;
      return `<fieldset><legend>Offtake</legend>${acceptControl}${receivedLine}${demandLine}<p class="status-meta">${definition.sourceNote || ''}</p></fieldset>${app.economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete sink</button>`;
    }
    if (kind === 'sink' && (current.unit === 'heat-sink' || current.unit === 'electricity-sink')) {
      const definition = app.catalog[current.unit] || {};
      const acceptRaw = current.params?.acceptKWh;
      const acceptValue = acceptRaw == null || acceptRaw === '' ? '' : acceptRaw;
      const isPower = current.unit === 'electricity-sink';
      const acceptOut = acceptValue !== '' ? `${app.formatNumber(acceptValue)} kWh/day` : 'Unlimited';
      const nodeResult = app.result?.nodes[current.id];
      const capNote = nodeResult?.acceptKWh != null
        ? ` / ${app.formatNumber(nodeResult.acceptKWh)} kWh cap${nodeResult.acceptSource === 'manual' ? ' · manual' : ''}`
        : '';
      const receivedLine = nodeResult?.received
        ? `<p class="status-meta">Received ${app.formatStream(nodeResult.received)}${capNote}</p>`
        : '';
      const label = isPower ? 'Export / curtailment limit' : 'Export / reject limit';
      const title = isPower
        ? 'Max kWh accepted this solve day (grid export or curtailment). Blank = unlimited.'
        : 'Max heat kWh rejected this solve day. Blank = unlimited.';
      const acceptControl = `<label>${label} <output>${acceptOut}</output></label><input name="sinkParameter" data-param="acceptKWh" type="number" min="0" step="any" placeholder="Unlimited" value="${app.escapeHtml(acceptValue)}" title="${app.escapeHtml(title)}">`;
      const legend = isPower ? 'Export / curtailment' : 'Heat reject';
      return `<fieldset><legend>${legend}</legend>${acceptControl}${receivedLine}<p class="status-meta">${definition.sourceNote || ''}</p></fieldset>${app.economicsControlsFor(current)}<button class="delete-node" id="deleteNode" type="button">Delete sink</button>`;
    }
    return `${kind === 'sink' ? app.economicsControlsFor(current) : ''}<button class="delete-node" id="deleteNode" type="button">Delete ${kind === 'sink' ? 'sink' : 'junction'}</button>`;
  }


  function parameterControl(control, current, name, intensityQuality) {
    const raw = current.params?.[control.key];
    const missing = raw == null || raw === '';
    const unit = control.unit ? ` ${control.unit}` : '';
    const energy = /kWh|secKWh/i.test(`${control.key} ${control.unit || ''}`);
    const chip = energy && intensityQuality ? app.qualityChip(intensityQuality) : '';
    if (control.optional) {
      const shown = missing ? '—' : app.formatNumber(raw);
      const value = missing ? '' : raw;
      return `<label>${control.label} <output>${shown}${missing ? '' : unit}</output>${chip}</label><input name="${name}" data-param="${control.key}" type="number" min="${control.min}" max="${control.max}" step="${control.step}" placeholder="unset" value="${value}">`;
    }
    return `<label>${control.label} <output>${app.formatNumber(raw)}${unit}</output>${chip}</label><input name="${name}" data-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${raw}">`;
  }

  function partLoadClampNote(params) {
    const k = Number(params?.partLoadK);
    if (!Number.isFinite(k) || k <= 3) return '';
    return ' Shape was clamped to 3 because the screening fit is monotone only for k≤3.';
  }

  function partLoadPhrase(params, withHead) {
    const raw = params?.partLoadK;
    const clamp = partLoadClampNote(params);
    if (raw == null || raw === '') {
      return withHead ? '' : ' Part-load shape unset — no Q/Qrated multiplier.';
    }
    if (withHead) {
      return ` Part-load k ${app.formatNumber(raw)} multiplies SEC by (1 + k(1−Q/Qrated)²) at the delivered flow, including a short bus.${clamp}`;
    }
    return ` Part-load k ${app.formatNumber(raw)} is on: SEC × (1 + k(1−Q/Qrated)²) at the delivered flow, including when the bus is short.${clamp}`;
  }

  function pumpHeadNote(current) {
    const params = current.params || {};
    if (params.pumpSecOverride === true && params.headM != null && params.headM !== '') {
      return '<p class="status-meta">Pump energy slider overrides head. Set head or efficiency again to use ρ·g·H / (η·3.6e6).</p>';
    }
    if (params.headM == null || params.headM === '') {
      return `<p class="status-meta">Head unset — SEC stays on the kWh/m³ slider. Set head for screening hydraulics (η defaults to 0.7).${partLoadPhrase(params, false)}</p>`;
    }
    try {
      const resolved = globalThis.FlowsheetUnits?.resolveLiquidPumpSec?.(params, Number(params.densityKgM3) || 1025);
      if (!resolved) return '';
      return `<p class="status-meta">Head ${app.formatNumber(resolved.headM)} m → ${app.formatNumber(resolved.sec)} kWh/m³ at η ${app.formatNumber(resolved.pumpEta)} (screening, not a vendor curve).${partLoadPhrase(params, true)}</p>`;
    } catch (error) {
      return `<p class="status-meta">${app.escapeHtml(error.message || 'Invalid pump head')}</p>`;
    }
  }

  function blowerPressureNote(current) {
    const params = current.params || {};
    if (params.blowerSecOverride === true && params.deltaP_kPa != null && params.deltaP_kPa !== '') {
      return '<p class="status-meta">Blower energy slider overrides ΔP. Set pressure or efficiency again to use ΔP_kPa / (η·3600).</p>';
    }
    if (params.deltaP_kPa == null || params.deltaP_kPa === '') {
      return `<p class="status-meta">ΔP unset — SEC stays on the kWh/Nm³ slider (default 0.001). Set pressure rise for screening fan work (η defaults to 0.7).${partLoadPhrase(params, false)}</p>`;
    }
    try {
      const resolved = globalThis.FlowsheetUnits?.resolveGasBlowerSec?.(params);
      if (!resolved) return '';
      return `<p class="status-meta">ΔP ${app.formatNumber(resolved.deltaP_kPa)} kPa → ${app.formatNumber(resolved.sec)} kWh/Nm³ at η ${app.formatNumber(resolved.blowerEta)} (screening, not a fan curve).${partLoadPhrase(params, true)}</p>`;
    } catch (error) {
      return `<p class="status-meta">${app.escapeHtml(error.message || 'Invalid blower ΔP')}</p>`;
    }
  }

  function teaApi() {
    return globalThis.TeaScreening || null;
  }

  function siteRegionForTea() {
    return app.site?.region || app.site?.demandRegion || app.site?.demandRegionId || null;
  }

  function positiveDensityPerL(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function densityFromAssayBag(bag) {
    if (!bag || typeof bag !== 'object') return null;
    const direct = positiveDensityPerL(bag.density_kg_per_L);
    if (direct) return { densityKgM3: direct * 1000, source: 'site assay' };
    const id = bag.assayId;
    const full = id && globalThis.SiteAssays?.getAssay?.(id);
    const fromLib = positiveDensityPerL(full?.density_kg_per_L);
    if (fromLib) return { densityKgM3: fromLib * 1000, source: 'site assay' };
    const hint = teaApi()?.densityHintFromAssay?.(bag);
    if (hint?.densityKgM3) return { densityKgM3: hint.densityKgM3, source: hint.source };
    if (hint?.outOfRange) return { densityKgM3: null, source: hint.source, rejectEstimate: true };
    const fromFull = full && full !== bag ? teaApi()?.densityHintFromAssay?.(full) : null;
    if (fromFull?.densityKgM3) return { densityKgM3: fromFull.densityKgM3, source: fromFull.source };
    if (fromFull?.outOfRange) return { densityKgM3: null, source: fromFull.source, rejectEstimate: true };
    return null;
  }

  function liveFluidDensity(fluidClass) {
    if (fluidClass !== 'brine' && fluidClass !== 'seawater') return null;
    const bags = [];
    if (fluidClass === 'brine') {
      if (app.site?.brineAssay) bags.push(app.site.brineAssay);
      if (app.site?.assay?.kind === 'brine') bags.push(app.site.assay);
    } else if (app.site?.assay && (app.site.assay.kind === 'seawater' || app.site.assay.kind == null)) {
      bags.push(app.site.assay);
    }
    let rejected = null;
    for (const bag of bags) {
      const found = densityFromAssayBag(bag);
      if (found?.densityKgM3) return found;
      if (found?.rejectEstimate) rejected = found;
    }
    return rejected;
  }

  function inferBufferFluidClass(current) {
    const explicitRaw = current?.params?.fluidClass;
    const tea = teaApi();
    const explicit = tea?.resolveTankFluidClass
      ? tea.resolveTankFluidClass(explicitRaw)
      : (explicitRaw ? String(explicitRaw) : null);
    // 'generic' means unset — still allow upstream intake inference.
    if (explicit && explicit !== 'generic') return explicit;
    // Walk one or two hops upstream for a practical intake identity.
    const seen = new Set();
    const queue = [current?.id];
    while (queue.length) {
      const id = queue.shift();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      for (const edge of app.graph.edges) {
        if (edge.to?.node !== id) continue;
        const upstream = app.node(edge.from.node);
        if (!upstream) continue;
        if (upstream.unit === 'material-source') {
          const intake = app.intakeKind(upstream);
          const key = intake?.key;
          if (key === 'brine') return 'brine';
          if (key === 'seawater') return 'seawater';
          if (key === 'water' || key === 'freshwater') return 'freshwater';
        }
        if (upstream.unit === 'intake-pump' || upstream.unit === 'material-buffer' || upstream.unit === 'material-splitter' || upstream.unit === 'material-mixer') {
          queue.push(upstream.id);
        }
      }
    }
    return 'generic';
  }

  function refreshBufferEconomics(current) {
    if (!current || current.unit !== 'material-buffer') return;
    current.params ||= {};
    const tea = teaApi();
    const fluidClass = inferBufferFluidClass(current);
    current.params.fluidClass = fluidClass;
    const kg = Number(current.params.capacityKg ?? current.capacity) || 0;
    if (tea?.bindTankCapex) {
      const density = Number(current.params.densityKgM3);
      const capexPerM3 = Number(current.params.capexPerM3);
      const densityOverride = current.params.densityOverride === true && Number.isFinite(density) && density > 0;
      const intensityOverride = current.params.intensityOverride === true && Number.isFinite(capexPerM3) && capexPerM3 >= 0;
      const live = densityOverride ? null : liveFluidDensity(fluidClass);
      const bound = tea.bindTankCapex({
        fluidClass,
        capacityKg: kg,
        densityKgM3: densityOverride ? density : (live?.densityKgM3 || undefined),
        capexPerM3: intensityOverride ? capexPerM3 : undefined,
        region: siteRegionForTea(),
      });
      // Mirror pre-region intensity into params for the inspector slider.
      current.params.densityKgM3 = bound.densityKgM3;
      current.params.capexPerM3 = bound.capexPerM3 / (bound.regionMultiplier || 1);
      current.params.capexPerKg = bound.capexPerKg;
      current.economics = {
        ...(current.economics || {}),
        installedCapex: bound.installedCapex,
        fixedOMPercent: bound.fixedOMPercent,
        variableOM: bound.variableOM,
        assetLifeYears: bound.assetLifeYears,
        capexPerM3: bound.capexPerM3,
        fluidClass: bound.fluidClass,
        fluidLabel: bound.fluidLabel,
        intensityUnit: bound.intensityUnit,
        quality: bound.quality,
        source: bound.source,
        note: bound.note,
        evidence: bound.evidence,
        regionMultiplier: bound.regionMultiplier,
        densityKgM3: bound.densityKgM3,
        densitySource: densityOverride ? 'override' : (live?.densityKgM3 ? live.source : (live?.source || 'fluid default')),
      };
      return;
    }
    // Fallback without TeaScreening: MECH17 $0.50/kg.
    const rate = Number(current.params.capexPerKg) || 0.5;
    current.economics = {
      installedCapex: kg * rate,
      fixedOMPercent: 2,
      variableOM: 0,
      assetLifeYears: 25,
    };
  }

  function renderInspectorPort(current, port, declaration) {
    const edgeIndexes = app.edgeIndexesAt({ node: current.id, port, direction: declaration.direction });
    const multi = declaration.direction === 'in'
      ? (app.units[current.unit].kind === 'mixer' || current.unit === 'heat-sink')
      : ['junction', 'splitter'].includes(app.units[current.unit].kind);
    const boundaryAllowed = declaration.direction === 'in'
      ? (edgeIndexes.length === 0 || multi)
      : Boolean(app.catalog[`${declaration.kind}-sink`]) && (edgeIndexes.length === 0 || multi);
    const connections = edgeIndexes.map(index => {
      const edge = app.graph.edges[index];
      const peerId = declaration.direction === 'in' ? edge.from.node : edge.to.node;
      const weight = app.units[current.unit].kind === 'splitter' && declaration.direction === 'out'
        ? `<label class="branch-weight">Share <input name="branchWeight" data-edge="${index}" type="range" min="0.1" max="10" step="0.1" value="${edge.weight ?? 1}" title="Relative share within the same priority tier"></label><label class="branch-priority">Priority <input name="branchPriority" data-edge="${index}" type="number" min="0" max="9" step="1" value="${Number.isFinite(Number(edge.priority)) ? Number(edge.priority) : 0}" title="Higher fills first (Factorio priority output). Equal priorities share by weight, then MECH12 overflow."></label>`
        : '';
      const capValue = edge.capacity == null || edge.capacity === '' || !Number.isFinite(Number(edge.capacity))
        ? ''
        : String(edge.capacity);
      const edgeLimit = app.result?.edgeLimits?.find(item => (
        item.from.node === edge.from.node && item.from.port === edge.from.port
        && item.to.node === edge.to.node && item.to.port === edge.to.port
      ));
      const kind = declaration.kind;
      const capUnit = kind === 'material' || kind === 'consumable' ? 'kg (or amount) / step' : 'kWh / step';
      const deliveredNote = edgeLimit
        ? `<small class="status-meta">Logistics clamp: ${app.formatNumber(edgeLimit.delivered)} / ${app.formatNumber(edgeLimit.capacity)} delivered (requested ${app.formatNumber(edgeLimit.requested)})</small>`
        : '';
      const capacity = `<label class="edge-capacity">Logistics capacity <input name="edgeCapacity" data-edge="${index}" type="number" min="0" step="any" placeholder="Unlimited" value="${app.escapeHtml(capValue)}" title="Max flow in this solve step (${capUnit}). Blank = unlimited."></label>${deliveredNote}`;
      const selected = app.selectedEdgeIndex === index ? ' is-selected-edge' : '';
      return `<div class="port-connection${selected}" data-select-edge="${index}"><small>Connected to ${app.node(peerId).label}</small>${weight}${capacity}<button type="button" data-disconnect="${index}">Disconnect</button></div>`;
    }).join('') || '<small>Not connected</small>';
    const cause = app.highlightPort && app.highlightPort.nodeId === current.id && app.highlightPort.port === port;
    return `<div class="port-row${cause ? ' is-cause' : ''}" data-port-row="${port}"><div><span>${declaration.direction === 'in' ? 'IN' : 'OUT'} · ${declaration.kind}</span><strong>${app.portName(port, current.unit)}</strong>${connections}</div>${boundaryAllowed ? `<button type="button" data-boundary-port="${port}" data-direction="${declaration.direction}">${declaration.direction === 'in' ? 'Add source' : 'Add sink branch'}</button>` : ''}</div>`;
  }
})();
