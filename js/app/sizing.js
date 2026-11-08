// Size-to-target and size-for-positive-cashflow controls.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    balancesNeedAttention, cleanedPriorities, clearCashflowBanner, clearLocationStaleState,
    currentCaseDefinition, formatCashflowMoney, formatSizingResidual, renderCashflowResult,
    sizeCoastalToMethane, sizeForPositiveCashflow, sizeToProduct,
  });

  function formatSizingResidual(value) {
    const residual = Number(value);
    if (!Number.isFinite(residual)) return '—';
    if (Math.abs(residual) < 1e-9) return '0';
    if (Math.abs(residual) < 1e-4) return residual.toExponential(2);
    return residual.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  function currentCaseDefinition() {
    const priorities = cleanedPriorities();
    return {
      graph: { nodes: app.graph.nodes, edges: app.graph.edges },
      operation: {
        setpoints: app.setpoints,
        ...(app.preSizingSeed ? { preSizingSeed: app.clone(app.preSizingSeed) } : {}),
        ...(priorities ? { priorities } : {}),
        ...(app.operationMeta.boundaryLimitedBy ? { boundaryLimitedBy: app.operationMeta.boundaryLimitedBy } : {}),
      },
      ...(app.site ? { site: app.site } : {}),
      economics: app.projectEconomics,
    };
  }

  function cleanedPriorities() {
    const priorities = app.operationMeta.priorities;
    if (!priorities) return null;
    const connected = id => new Set(app.graph.edges.filter(edge => edge.from.node === id).map(edge => edge.to.node));
    const ids = new Set(app.graph.nodes.map(node => node.id));
    const cleaned = {};
    for (const [bus, order] of Object.entries(priorities)) {
      if (!ids.has(bus) || !Array.isArray(order)) continue;
      const consumers = connected(bus);
      const next = order.filter(id => consumers.has(id));
      if (next.length) cleaned[bus] = next;
    }
    return Object.keys(cleaned).length ? cleaned : null;
  }

  function selectionForProduct(product, definition) {
    const nodes = definition?.graph?.nodes || [];
    if (product === 'CH4') return nodes.find(node => node.unit === 'sabatier')?.id;
    if (product === 'H2') return nodes.find(node => node.unit === 'electrolyzer')?.id;
    if (product === 'methanol') return nodes.find(node => node.unit === 'methanol')?.id;
    if (product === 'ammonia') return nodes.find(node => node.unit === 'ammonia')?.id;
    if (product === 'lithium' || product === 'salt') return nodes.find(node => node.unit === 'brine-minerals')?.id;
    if (product === 'module') return nodes.find(node => node.unit === 'pv-module')?.id;
    if (product === 'steel') return nodes.find(node => node.unit === 'hydrogen-dri')?.id;
    if (product === 'ethylene') return nodes.find(node => node.unit === 'mto')?.id;
    if (product === 'diesel') return nodes.find(node => node.unit === 'ft-liquids')?.id;
    if (product === 'urea') return nodes.find(node => node.unit === 'urea')?.id;
    if (product === 'titanium') return nodes.find(node => node.unit === 'titanium-kroll')?.id;
    if (product === 'float-glass') return nodes.find(node => node.unit === 'float-glass')?.id;
    if (product === 'cement') return nodes.find(node => node.unit === 'cement')?.id;
    if (product === 'copper') return nodes.find(node => node.unit === 'copper-ew')?.id;
    if (product === 'ndpr') {
      return nodes.find(node => node.unit === 'ree-chromatography' || node.unit === 'ree-sx')?.id;
    }
    return nodes[0]?.id;
  }

  function writeSizeStatus(error) {
    const text = error?.message || String(error || '');
    const status = document.getElementById('sizeToTargetStatus');
    if (status && error) status.textContent = text;
  }

  function sizeToProduct(product, rate, opts = {}) {
    const status = document.getElementById('sizeToTargetStatus');
    if (!globalThis.FlowsheetSize?.sizeToProduct) {
      if (status) status.textContent = 'Sizing engine is not loaded.';
      throw new Error('Sizing engine is not loaded');
    }
    if (!app.graph.nodes.length) {
      const error = new Error('Size to target needs a loaded flowsheet');
      writeSizeStatus(error);
      throw error;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      const error = new Error('Product rate must be a non-negative kg/day');
      writeSizeStatus(error);
      throw error;
    }
    try {
      app.lastSizing = FlowsheetSize.sizeToProduct({
        product,
        rate,
        definition: currentCaseDefinition(),
        ...opts,
      });
      app.loadCase(app.lastSizing.definition, selectionForProduct(app.lastSizing.product, app.lastSizing.definition));
      return app.lastSizing;
    } catch (error) {
      app.lastSizing = null;
      writeSizeStatus(error);
      throw error;
    }
  }

  function sizeCoastalToMethane(target, month = 0, opts = {}) {
    const status = document.getElementById('sizeToTargetStatus');
    if (!globalThis.FlowsheetSize?.sizeCoastalToMethane) {
      if (status) status.textContent = 'Sizing engine is not loaded.';
      throw new Error('Sizing engine is not loaded');
    }
    if (!Number.isFinite(target) || target < 0) {
      if (status) status.textContent = 'Methane target must be a non-negative kg/day.';
      throw new Error('Methane target must be a non-negative kg/day');
    }
    try {
      app.lastSizing = FlowsheetSize.sizeCoastalToMethane(target, month, opts);
      app.loadCase(app.lastSizing.definition, 'sabatier');
      return app.lastSizing;
    } catch (error) {
      app.lastSizing = null;
      if (status) status.textContent = error.message;
      throw error;
    }
  }


  function formatCashflowMoney(value) {
    if (!Number.isFinite(value)) return '—';
    if (Math.abs(value) >= 1e6) return app.formatUncertainMoney(value, 'screening');
    const abs = Math.abs(value);
    const digits = abs >= 1000 ? 0 : abs >= 10 ? 1 : 2;
    return `${value < 0 ? '-' : ''}$${abs.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
  }

  function balancesNeedAttention(solved = app.result) {
    const residual = Number(solved?.balances?.maxAbsResidual);
    return Number.isFinite(residual) && residual >= 1e-8;
  }

  function clearCashflowBanner() {
    app.lastCashflowCompare = null;
    renderCashflowResult();
  }

  function clearLocationStaleState() {
    app.lastSizing = null;
    app.lastCashflowCompare = null;
    app.routeNote = '';
    clearCashflowBanner();
    const status = document.getElementById('sizeToTargetStatus');
    if (status) status.textContent = '';
  }

  function renderCashflowResult() {
    const el = document.getElementById('cashflowResult');
    if (!el) return;
    if (!app.lastCashflowCompare) { el.hidden = true; el.innerHTML = ''; return; }
    const { before, after, objective } = app.lastCashflowCompare;
    const delta = (after ?? 0) - (before ?? 0);
    const openBalances = balancesNeedAttention();
    const met = Boolean(objective?.met) && !openBalances;
    const products = objective?.activeSaleCount ?? objective?.positiveSaleCount ?? 0;
    const deltaLabel = `${delta >= 0 ? '+' : ''}${formatCashflowMoney(delta)}`;
    const deltaClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : '';
    const afterClass = (after ?? 0) > 0 ? 'positive' : (after ?? 0) < 0 ? 'negative' : '';
    const note = [
      `${products} positive-sale product${products === 1 ? '' : 's'}`,
      met ? 'Objective met' : 'Objective not met',
      met ? '' : 'Kept the best available net cash among searched slates.',
      openBalances ? 'Balances need attention, so this is not treated as a success.' : '',
    ].filter(Boolean).join(' · ');
    el.hidden = false;
    el.innerHTML = `<div class="delta-board" role="group" aria-label="Net cash before and after optimize">
      <div class="delta-cell"><span>Before</span><strong>${formatCashflowMoney(before)}</strong><small>Net cash / year</small></div>
      <div class="delta-cell delta-delta"><span>Delta</span><strong class="${deltaClass}">${deltaLabel}</strong><small>${met ? 'Objective met' : 'Objective not met'}</small></div>
      <div class="delta-cell"><span>After</span><strong class="${afterClass}">${formatCashflowMoney(after)}</strong><small>Net cash / year</small></div>
    </div>
    <p class="delta-note">${note}</p>`;
  }

  function sizeForPositiveCashflow(opts = {}) {
    const status = document.getElementById('sizeToTargetStatus');
    if (!globalThis.FlowsheetSize?.sizeForPositiveCashflow) {
      if (status) status.textContent = 'Cashflow sizing engine is not loaded.';
      throw new Error('Cashflow sizing engine is not loaded');
    }
    if (!app.graph.nodes.length) {
      const error = new Error('Co-product cashflow sizing needs a loaded flowsheet');
      writeSizeStatus(error);
      throw error;
    }
    const beforeNet = app.currentEconomics?.annualNetCash;
    try {
      app.lastSizing = FlowsheetSize.sizeForPositiveCashflow({
        definition: currentCaseDefinition(),
        ...opts,
      });
      const focus = selectionForProduct(app.lastSizing.selected?.product || 'lithium', app.lastSizing.definition)
        || selectionForProduct('CH4', app.lastSizing.definition)
        || app.lastSizing.definition.graph.nodes.find(node => node.unit === 'brine-minerals')?.id
        || app.lastSizing.definition.graph.nodes.find(node => node.unit === 'sabatier')?.id;
      app.loadCase(app.lastSizing.definition, focus);
      app.lastCashflowCompare = {
        before: beforeNet,
        after: app.currentEconomics?.annualNetCash ?? app.lastSizing.objective?.annualNetCash,
        objective: app.lastSizing.objective || {},
      };
      renderCashflowResult();
      return app.lastSizing;
    } catch (error) {
      app.lastSizing = null;
      app.lastCashflowCompare = null;
      renderCashflowResult();
      writeSizeStatus(error);
      throw error;
    }
  }
})();
