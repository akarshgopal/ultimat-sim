// Network rollup: plant list editing, rollup refresh and rendering.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    addCurrentPlant, beginAddPlant, beginRemovePlant, beginRenamePlant, cancelAddPlant,
    cancelPlantEdit, clearNetwork, handleNetworkPlantClick, loadAbundanceHub, loadDemoNetwork,
    loadZabuyeHub, openNetworkPlant, refreshNetwork, removeNetworkPlant, renameNetworkPlant,
    renderNetwork, submitAddPlant,
  });

  function loadAbundanceHub() {
    app.setActiveDemo('abundance-hub', 'Brine + ammonia');
    app.lastSizing = null;
    const definition = globalThis.NetworkCase?.siteDeadSeaAbundance
      ? NetworkCase.siteDeadSeaAbundance()
      : AbundanceCase.createAbundanceCase();
    app.loadCase(definition, 'minerals');
    const status = document.getElementById('sizeToTargetStatus');
    if (status) status.textContent = 'Dead Sea hub loaded. Size for co-product cashflow expands the mineral/chemical slate while keeping plant net cash positive.';
  }

  function loadZabuyeHub() {
    app.setActiveDemo('zabuye-hub', 'Zabuye brine hub');
    app.lastSizing = null;
    if (!globalThis.NetworkCase?.siteZabuyeAbundance) {
      throw new Error('Zabuye abundance case is not loaded');
    }
    app.loadCase(NetworkCase.siteZabuyeAbundance(), 'minerals');
    return app.sizeForPositiveCashflow();
  }

  function plantSnapshot(name, definition) {
    return {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
      name,
      definition: app.clone(definition),
    };
  }

  function addCurrentPlant(name) {
    app.network.plants.push(plantSnapshot(name, {
      graph: { nodes: app.graph.nodes, edges: app.graph.edges },
      operation: { setpoints: app.setpoints },
      site: app.site,
      economics: app.projectEconomics,
    }));
    refreshNetwork();
    return true;
  }

  function defaultPlantName() {
    const base = String(app.site?.name || '').trim() || 'Current plant';
    const names = new Set(app.network.plants.map(plant => plant.name));
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} ${n}`)) n += 1;
    return `${base} ${n}`;
  }

  function setNetworkNotice(message) {
    app.networkNotice = message || '';
  }

  function focusPlantField(input) {
    if (!input) return;
    input.focus?.();
    input.select?.();
  }

  function beginAddPlant() {
    app.networkEditor = { type: 'add' };
    setNetworkNotice('');
    renderNetwork();
    const input = document.getElementById('addPlantName');
    if (!input) return;
    input.value = defaultPlantName();
    focusPlantField(input);
  }

  function cancelAddPlant() {
    app.networkEditor = null;
    const input = document.getElementById('addPlantName');
    if (input) input.value = '';
    setNetworkNotice('Add canceled.');
    renderNetwork();
    return false;
  }

  function submitAddPlant(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      setNetworkNotice('Enter a name to add this plant.');
      renderNetwork();
      focusPlantField(document.getElementById('addPlantName'));
      return false;
    }
    app.networkEditor = null;
    setNetworkNotice(`Added ${trimmed}.`);
    addCurrentPlant(trimmed);
    return true;
  }

  function beginRenamePlant(id) {
    if (!app.network.plants.some(plant => plant.id === id)) return false;
    app.networkEditor = { type: 'rename', id };
    setNetworkNotice('');
    renderNetwork();
    focusPlantField(document.querySelector(`[data-rename-form="${id}"] input`));
    return true;
  }

  function beginRemovePlant(id) {
    if (!app.network.plants.some(plant => plant.id === id)) return false;
    app.networkEditor = { type: 'remove', id };
    setNetworkNotice('');
    renderNetwork();
    return true;
  }

  function cancelPlantEdit(message) {
    const pending = app.networkEditor?.type;
    if (pending === 'add') return cancelAddPlant();
    if (pending !== 'rename' && pending !== 'remove') return false;
    app.networkEditor = null;
    setNetworkNotice(message || (pending === 'rename' ? 'Rename canceled.' : 'Remove canceled.'));
    renderNetwork();
    return false;
  }

  function renameNetworkPlant(id, name) {
    const plant = app.network.plants.find(item => item.id === id);
    if (!plant) return false;
    const trimmed = String(name ?? '').trim();
    if (!trimmed || trimmed === plant.name) {
      app.networkEditor = null;
      setNetworkNotice('Rename canceled.');
      renderNetwork();
      return false;
    }
    plant.name = trimmed;
    app.networkEditor = null;
    setNetworkNotice(`Renamed to ${trimmed}.`);
    refreshNetwork();
    return true;
  }

  function removeNetworkPlant(id) {
    if (!app.network.plants.some(plant => plant.id === id)) return false;
    app.network.plants = app.network.plants.filter(plant => plant.id !== id);
    app.network.corridors = (app.network.corridors || []).filter(corridor => corridor.from?.plant !== id && corridor.to?.plant !== id);
    app.networkEditor = null;
    setNetworkNotice('Plant removed.');
    if (!app.network.plants.length) {
      app.networkResult = null;
      persistNetwork();
      renderNetwork();
      app.renderSiteMap();
      return true;
    }
    refreshNetwork();
    return true;
  }

  function handleNetworkPlantClick(event) {
    const openId = event.target.closest?.('[data-open-plant]')?.dataset.openPlant;
    if (openId) {
      openNetworkPlant(openId);
      return;
    }
    const renameId = event.target.closest?.('[data-rename-plant]')?.dataset.renamePlant;
    if (renameId) {
      beginRenamePlant(renameId);
      return;
    }
    const removeId = event.target.closest?.('[data-remove-plant]')?.dataset.removePlant;
    if (removeId) {
      beginRemovePlant(removeId);
      return;
    }
    if (event.target.closest?.('[data-cancel-rename]') || event.target.closest?.('[data-cancel-remove]')) {
      cancelPlantEdit();
      return;
    }
    const confirmId = event.target.closest?.('[data-confirm-remove]')?.dataset.confirmRemove;
    if (confirmId) removeNetworkPlant(confirmId);
  }

  function clearNetwork() {
    app.network = { plants: [], corridors: [] };
    app.networkResult = null;
    app.networkEditor = null;
    setNetworkNotice('Network cleared.');
    persistNetwork();
    renderNetwork();
    app.renderSiteMap();
  }

  const MINERAL_SALE_IDS = new Set([
    'lithium', 'magnesium', 'potash', 'gypsum', 'salt', 'recovered-salt',
    'caustic', 'bromine', 'bromide', 'ammonia', 'ammonia-product', 'oxygen',
  ]);

  function mineralSaleRevenue(plant) {
    const sinks = plant?.economics?.sinks;
    if (!Array.isArray(sinks)) return 0;
    return sinks.reduce((sum, sink) => {
      if (sink.disposition !== 'sale' || !(Number(sink.deliveredAmount) > 0)) return sum;
      if (!MINERAL_SALE_IDS.has(sink.id)) return sum;
      return sum + (Number(sink.annualRevenue) || 0);
    }, 0);
  }

  function mineralLeadPlantId() {
    const ranked = (app.networkResult?.plants || [])
      .map(plant => ({ id: plant.id, revenue: mineralSaleRevenue(plant) }))
      .filter(item => item.id && item.revenue > 0)
      .sort((left, right) => right.revenue - left.revenue);
    if (ranked.length) return ranked[0].id;
    const named = app.network.plants.find(plant => /mineral|brine|dead-sea/i.test(`${plant.id} ${plant.name}`));
    return named?.id || null;
  }

  function loadDemoNetwork() {
    app.setActiveDemo('demo-network', 'Fuels + minerals · cement / Cu / glass / green-FT / green-MTO / green-H2-DRI / purchased H2-DRI');
    app.network = app.clone(NetworkCase.createFuelsAndMineralsNetwork(6));
    refreshNetwork();
    const id = mineralLeadPlantId()
      || app.network.plants.find(plant => plant.id === 'dead-sea-minerals')?.id
      || app.network.plants[0]?.id;
    if (id) openNetworkPlant(id);
  }

  function openNetworkPlant(id) {
    const plant = app.network.plants.find(item => item.id === id);
    if (!plant) return false;
    app.loadCase(plant.definition, plant.definition.graph.nodes.find(node => node.unit === 'sabatier' || node.unit === 'ammonia')?.id);
    return true;
  }

  function refreshNetwork() {
    try {
      app.networkResult = FlowsheetNetwork.evaluateNetwork(app.network);
      app.network.plants = app.networkResult.plants.map(plant => ({
        id: plant.id,
        name: plant.name,
        definition: plant.definition,
      }));
    } catch (error) {
      app.networkResult = null;
      app.routeNote = error.message;
    }
    persistNetwork();
    renderNetwork();
    app.renderSiteMap();
  }

  function persistNetwork() {
    if (!app.storage) return;
    try { app.storage.setItem(app.NETWORK_KEY, JSON.stringify({ plants: app.network.plants, corridors: app.network.corridors })); } catch { /* ignore */ }
  }

  function syncNetworkChrome() {
    const form = document.getElementById('addPlantForm');
    const addButton = document.getElementById('addPlantToNetwork');
    const note = document.getElementById('networkActionNote');
    if (note) note.textContent = app.networkNotice;
    if (form) form.hidden = app.networkEditor?.type !== 'add';
    if (addButton) addButton.hidden = app.networkEditor?.type === 'add';
  }

  function plantLead(plant, transferred) {
    const sales = (plant.economics?.sinks || [])
      .filter(sink => sink.disposition === 'sale' && Number(sink.deliveredAmount) > 0 && !transferred.has(`${plant.id}:${sink.id}`))
      .sort((left, right) => (Number(right.annualRevenue) || 0) - (Number(left.annualRevenue) || 0)
        || (Number(right.deliveredAmount) || 0) - (Number(left.deliveredAmount) || 0));
    return sales[0] || null;
  }

  function plantLeadText(lead) {
    if (!lead) return 'No sale products';
    const label = app.NETWORK_SALE_LABELS[lead.id] || lead.id;
    if (Number(lead.annualRevenue) > 0) return `${label} · ${app.formatMoney(lead.annualRevenue)}/year`;
    return `${label} · ${app.formatNumber(lead.deliveredAmount / 1000)} t/year`;
  }

  function plantEditControls(plant) {
    const id = app.escapeHtml(plant.id);
    if (app.networkEditor?.type === 'rename' && app.networkEditor.id === plant.id) {
      return `<form class="network-plant-edit" data-rename-form="${id}"><label>Name <input type="text" name="plantName" value="${app.escapeHtml(plant.name)}" maxlength="80" autocomplete="off"></label><button type="submit">Save</button><button type="button" data-cancel-rename>Cancel</button></form>`;
    }
    if (app.networkEditor?.type === 'remove' && app.networkEditor.id === plant.id) {
      return `<div class="network-plant-edit" role="group" aria-label="Confirm remove"><span>Remove ${app.escapeHtml(plant.name)}?</span><button type="button" data-confirm-remove="${id}">Remove</button><button type="button" data-cancel-remove>Cancel</button></div>`;
    }
    return `<div class="network-plant-actions"><button type="button" data-open-plant="${id}">Open</button><button type="button" data-rename-plant="${id}">Rename</button><button type="button" data-remove-plant="${id}">Remove</button></div>`;
  }

  function plantCard(plant, transferred) {
    const siteName = plant.definition?.site?.name || 'Unspecified site';
    const lead = plantLead(plant, transferred);
    const landText = plant.footprint ? `${app.formatHa(plant.footprint.totalHa)} footprint` : '';
    const leadAttr = lead ? ` data-lead="${app.escapeHtml(lead.id)}"` : '';
    return `<div class="network-plant" data-plant-id="${app.escapeHtml(plant.id)}"${leadAttr}><div class="network-plant-copy"><strong>${app.escapeHtml(plant.name)}</strong><small>${app.escapeHtml(siteName)}${landText ? ` · ${app.escapeHtml(landText)}` : ''}</small><small>${app.escapeHtml(plantLeadText(lead))}</small></div>${plantEditControls(plant)}</div>`;
  }

  function renderNetwork() {
    syncNetworkChrome();
    const panel = document.getElementById('networkPanel');
    const body = document.getElementById('networkBody');
    const title = document.getElementById('networkTitle');
    const plants = document.getElementById('networkPlants');
    const status = document.getElementById('networkStatus');
    const metrics = document.getElementById('networkMetrics');
    const products = document.getElementById('networkProducts');
    const corridors = document.getElementById('networkCorridors');
    const empty = !app.network.plants.length;
    title.textContent = empty ? 'No plants' : `${app.network.plants.length} plant${app.network.plants.length === 1 ? '' : 's'}`;
    if (empty) panel.classList.add('is-empty');
    else panel.classList.remove('is-empty');
    body.hidden = empty;
    const details = body.closest?.('details');
    if (details) {
      details.hidden = empty;
      details.open = !empty;
    }
    if (empty) {
      if (app.networkEditor && app.networkEditor.type !== 'add') app.networkEditor = null;
      status.textContent = 'No plants in this rollup.';
      plants.innerHTML = '';
      metrics.innerHTML = '';
      products.innerHTML = '';
      corridors.innerHTML = '';
      syncNetworkChrome();
      return;
    }
    if (!app.networkResult) {
      status.textContent = 'Network solve failed.';
      plants.innerHTML = app.network.plants.map(plant => plantCard(plant, new Set())).join('');
      return;
    }
    const freightQuality = app.classifyQuality({ kind: 'freight' });
    const landQuality = app.classifyQuality({ kind: 'land' });
    const moneyQuality = app.classifyQuality({ kind: 'money' });
    const corridorCount = app.networkResult.corridors?.length || 0;
    const freightLabel = corridorCount
      ? `freight ${app.formatUncertainMoney(app.networkResult.freight, freightQuality)}/year`
      : 'freight not modeled (no corridors)';
    status.textContent = `${app.networkResult.plants.length} plants · ${app.formatHa(app.networkResult.landHa)} site footprint · ${freightLabel}`;
    const transferred = app.networkResult.transferred || new Set();
    plants.innerHTML = app.networkResult.plants.map(plant => plantCard(plant, transferred)).join('');
    const showBankable = corridorCount > 0 || app.economicsAcknowledgment();
    metrics.innerHTML = app.metricRows([
      ['CAPEX', app.formatUncertainMoney(app.networkResult.installedCapex, moneyQuality), { quality: moneyQuality }],
      ['Annualized CAPEX', app.formatUncertainMoney(app.networkResult.annualizedCapex, moneyQuality), { quality: moneyQuality }],
      ['NPV', showBankable ? app.formatUncertainMoney(app.networkResult.npv, moneyQuality) : 'hidden until NPV/IRR disclosure is open', { quality: moneyQuality }],
      ['Net cash (R − OPEX − ann. CAPEX)', app.formatUncertainMoney(app.networkResult.annualNetCash, moneyQuality), { quality: moneyQuality }],
      ['Revenue', app.formatUncertainMoney(app.networkResult.annualRevenue, moneyQuality), { quality: moneyQuality }],
      ['Cost', app.formatUncertainMoney(app.networkResult.annualOperatingCost, moneyQuality), { quality: moneyQuality }],
      ['Freight', corridorCount ? `${app.formatUncertainMoney(app.networkResult.freight, freightQuality)}/year` : 'Not modeled (no corridors)', { quality: corridorCount ? freightQuality : 'assumed', references: app.FREIGHT_CITES }],
      ['Land', app.formatUncertainHa(app.networkResult.landHa), { quality: landQuality }],
    ]);
    const ranked = Object.entries(app.networkResult.slate).sort((left, right) => right[1] - left[1]);
    const peak = ranked[0]?.[1] || 1;
    products.innerHTML = ranked.map(([substance, tonnes], index) => {
      const share = Math.max(6, (tonnes / peak) * 100);
      return `<div class="${index === 0 ? 'lead' : ''}"><dt>${substance}</dt><dd><span class="product-bar" aria-hidden="true"><i style="width:${share}%"></i></span><strong>${app.formatNumber(tonnes)}</strong> <small>t/year</small></dd></div>`;
    }).join('');
    corridors.innerHTML = app.networkResult.corridors.length
      ? app.networkResult.corridors.map(corridor => `<div class="corridor-row">${corridor.substance} · ${app.formatNumber(corridor.km)} km ${corridor.mode} · ${app.formatUncertainMoney(corridor.annualFreight, freightQuality)}/year ${app.qualityChip(freightQuality)}${app.citeMarkup(app.FREIGHT_CITES)}</div>`).join('')
      : '<p class="status-meta">No haul corridors — freight is not modeled (not a free logistics win). Add corridors or treat market offtake as an explicit assumption.</p>';
  }
})();
