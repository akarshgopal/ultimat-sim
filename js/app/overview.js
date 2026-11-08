// Overview tab / HUD: offtake honesty, resource strip, sale slate, drivers.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.defineProperties(app, {
    NETWORK_SALE_LABELS: { get: () => NETWORK_SALE_LABELS, enumerable: true },
  });
  Object.assign(app, {
    powerLimitNodeId, powerThrottleCallout, render,
  });

  const ASIA_OFFTAKE_NOTE = 'Screening China/Asia offtake table — not a plant contract and not a silent ME-Levant inherit.';

  function offtakeHonestyText() {
    const tea = globalThis.TeaScreening;
    const siteRegionId = app.site?.region && tea?.resolveDemandRegion ? tea.resolveDemandRegion(app.site.region) : null;
    const bound = app.graph.nodes.find(node => node.economics?.demandRegionId)?.economics.demandRegionId || null;
    const asiaSite = siteRegionId === 'asia-china';
    const asiaBound = bound === 'asia-china';
    const parts = [];
    if (asiaSite || asiaBound) {
      if (asiaSite && bound && bound !== 'asia-china') {
        parts.push('This site screens prices on the China/Asia offtake table, not a silent ME-Levant inherit. The open plant still uses another region\'s prices. Not a plant contract.');
      } else {
        parts.push(ASIA_OFFTAKE_NOTE);
      }
    }
    const freightStreams = app.graph.nodes.filter(node => Number(node.economics?.freightUsdPerKg) > 0).length;
    if (freightStreams > 0) {
      parts.push(`Screening freight applied on ${freightStreams} streams (not a carrier contract; plant-gate elsewhere).`);
    }
    return parts.join(' ');
  }

  function renderOfftakeHonesty() {
    const text = offtakeHonestyText();
    for (const id of ['overviewOfftake', 'economicsOfftake']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.hidden = !text;
      el.textContent = text;
    }
  }

  function hudValue(text) {
    const value = String(text ?? '').trim();
    if (!value || value.includes('—')) return '';
    return value;
  }

  function formatDispatchPair(used, offered) {
    const scale = Math.max(Math.abs(used), Math.abs(offered));
    if (scale >= 1000) return `${app.formatNumber(used / 1000)} / ${app.formatNumber(offered / 1000)} MWh/d`;
    return `${app.formatNumber(used)} / ${app.formatNumber(offered)} kWh/d`;
  }

  function powerStripSlot() {
    const buses = app.graph.nodes.filter(node => node.unit === 'electrical-bus');
    if (app.result?.nodes && app.result?.streams) {
      let offered = 0;
      let used = 0;
      let live = false;
      for (const bus of buses) {
        const available = Number(app.result.nodes[bus.id]?.available?.kWh);
        if (!(available > 0)) continue;
        const drawn = app.result.streams
          .filter(edge => edge.from?.node === bus.id && edge.stream?.kind === 'electricity')
          .reduce((sum, edge) => sum + (Number(edge.stream.kWh) || 0), 0);
        if (!Number.isFinite(drawn)) continue;
        live = true;
        offered += available;
        used += drawn;
      }
      if (live) {
        const value = hudValue(formatDispatchPair(used, offered));
        if (!value) return null;
        return {
          id: 'power',
          label: 'Power',
          value,
          title: `Bus dispatch ${app.formatNumber(used)} / ${app.formatNumber(offered)} kWh/d`,
          fill: offered > 0 ? Math.max(0, Math.min(1, used / offered)) : null,
        };
      }
    }
    if (buses.length || !app.result) return null;
    const budget = Number(app.site?.resources?.electricity?.stream?.kWh);
    if (!(budget > 0)) return null;
    const value = hudValue(app.formatCompactEnergy(budget, false));
    if (!value) return null;
    return {
      id: 'power',
      label: 'Power',
      value,
      title: `Site electricity budget ${app.formatNumber(budget)} kWh/d`,
    };
  }

  function waterStripSlot() {
    const stream = app.site?.resources?.freshwater?.stream;
    if (!stream) return null;
    let kg;
    try { kg = app.sourceAmount(stream); } catch { return null; }
    if (!(Number(kg) > 0)) return null;
    const value = hudValue(app.formatCompactMass(kg));
    if (!value) return null;
    const status = app.site?.rights?.freshwater?.status;
    const title = status
      ? `Freshwater ${app.formatNumber(kg)} kg/d · ${status}`
      : `Freshwater ${app.formatNumber(kg)} kg/d`;
    return { id: 'water', label: 'Water', value, title };
  }

  function cashStripSlot() {
    const net = Number(app.currentEconomics?.annualNetCash);
    if (!Number.isFinite(net)) return null;
    const value = hudValue(`${app.formatUncertainMoney(net, app.classifyQuality({ kind: 'money' }))}/y`);
    if (!value) return null;
    const tone = net > 0 ? 'is-positive' : net < 0 ? 'is-negative' : '';
    return {
      id: 'cash',
      label: 'Cash',
      value,
      title: 'Annual net cash · R − OPEX − ann. CAPEX · screening',
      tone,
    };
  }

  function landStripSlot() {
    if (!app.site || typeof FlowsheetFootprint?.estimateFootprint !== 'function') return null;
    let footprint;
    try {
      footprint = FlowsheetFootprint.estimateFootprint({ site: app.site, graph: app.graph, solved: app.result });
    } catch {
      return null;
    }
    if (!(Number(footprint?.totalAreaM2) > 0)) return null;
    const landQuality = app.classifyQuality({ kind: 'land' });
    const value = hudValue(app.formatUncertainHa(footprint.totalHa, landQuality));
    if (!value) return null;
    const solarHa = Number(footprint.solar?.ha);
    const title = solarHa > 0
      ? `Site footprint · solar ${app.formatUncertainHa(solarHa, landQuality)}`
      : 'Site footprint';
    return { id: 'land', label: 'Land', value, title };
  }

  function renderResourceStrip() {
    const el = document.getElementById('hudStrip');
    if (!el) return;
    const slots = [powerStripSlot(), waterStripSlot(), cashStripSlot(), landStripSlot()].filter(Boolean);
    if (!slots.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = slots.map(slot => {
      const tone = slot.tone ? ` ${slot.tone}` : '';
      const bar = Number.isFinite(slot.fill)
        ? `<span class="hud-bar" aria-hidden="true"><span style="--hud-fill:${Math.max(0, Math.min(1, slot.fill)).toFixed(4)}"></span></span>`
        : '';
      return `<li class="hud-slot hud-${slot.id}${tone}" data-hud="${slot.id}" title="${app.escapeHtml(slot.title)}"><span class="hud-key">${app.escapeHtml(slot.label)}</span><span class="hud-value">${app.escapeHtml(slot.value)}</span>${bar}</li>`;
    }).join('');
  }

  function render() { renderOfftakeHonesty(); app.renderGraph(); app.renderStatus(); app.renderSite(); app.renderInspector(); app.renderEconomics(); app.renderComparison(); app.renderNetwork(); renderOverview(); renderResourceStrip(); }

  const NETWORK_SALE_LABELS = {
    NH3: 'Ammonia',
    CH4: 'Methane',
    Br2: 'Bromine',
    CH3OH: 'Methanol',
    NaCl: 'Salt',
    'ammonia-product': 'Ammonia',
    methane: 'Methane',
    bromine: 'Bromine',
    Urea: 'Urea',
    'urea-product': 'Urea',
    C2H4: 'Ethylene',
    'ethylene-product': 'Ethylene',
    C12H26: 'Diesel',
    'diesel-product': 'Diesel',
    steel: 'Fe / Iron',
    Fe: 'Fe / Iron',
    lithium: 'Lithium',
    LiCl: 'Lithium',
    salt: 'Salt',
    'recovered-salt': 'Salt',
    'sabatier-water': 'Sabatier water',
    potash: 'Potash',
    KCl: 'Potash',
    magnesium: 'Magnesium',
    MgCl2: 'Magnesium',
    caustic: 'Caustic',
    NaOH: 'Caustic',
    gypsum: 'Gypsum',
    CaSO4: 'Gypsum',
    PortlandCement: 'Portland cement',
    'cement-product': 'Portland cement',
    Cu: 'Copper cathode',
    'cathode-product': 'Copper cathode',
    oxygen: 'Oxygen',
    O2: 'Oxygen',
    module: 'PV module',
    PVmodule: 'PV module',
    ndpr: 'NdPr oxide',
    'other-reo': 'Other REO',
    dytb: 'DyTb oxide',
    'light-reo': 'Light REO',
  };

  function overviewSaleRecords() {
    const productQuality = app.classifyQuality({ kind: 'product-cost' });
    const sinks = (app.currentEconomics?.sinks || [])
      .filter(sink => sink.disposition === 'sale' && Number(sink.deliveredAmount) > 0)
      .sort((left, right) => (Number(right.annualRevenue) - Number(left.annualRevenue))
        || (Number(right.deliveredAmount) - Number(left.deliveredAmount)));
    if (sinks.length) {
      const revenue = Number(app.currentEconomics.annualRevenue) || 0;
      const days = Number(app.currentEconomics.periodDays) > 0 ? Number(app.currentEconomics.periodDays) : 365;
      return sinks.map(sink => ({
        label: NETWORK_SALE_LABELS[sink.id] || sink.id,
        kgPerDay: Number(sink.deliveredAmount) / days,
        tonnesPerYear: Number(sink.deliveredAmount) / 1000,
        revenue: Number(sink.annualRevenue) || 0,
        share: revenue > 0 ? (Number(sink.annualRevenue) || 0) / revenue : null,
        quality: productQuality,
      }));
    }
    const slate = app.networkResult?.slate;
    if (!slate) return [];
    return Object.entries(slate)
      .filter(([, tonnes]) => Number(tonnes) > 0)
      .sort((left, right) => right[1] - left[1])
      .map(([substance, tonnes]) => ({
        label: NETWORK_SALE_LABELS[substance] || substance,
        kgPerDay: Number(tonnes) * 1000 / 365,
        tonnesPerYear: Number(tonnes),
        revenue: null,
        share: null,
        quality: productQuality,
      }));
  }

  function renderSlateTable(records) {
    if (!records.length) return '<p class="slate-empty">No products</p>';
    const lead = records.find(row => Number(row.revenue) > 0) || null;
    const body = records.map(row => {
      const isLead = lead === row;
      const share = row.share == null ? '—' : `${app.formatNumber(row.share * 100)}%`;
      const money = row.revenue == null ? '—' : app.formatUncertainMoney(row.revenue, row.quality);
      return `<tr class="${isLead ? 'is-lead' : ''}"><td>${app.escapeHtml(row.label)}${isLead ? ' <span class="slate-lead">lead</span>' : ''}</td><td>${app.formatNumber(row.kgPerDay)}</td><td>${app.formatNumber(row.tonnesPerYear)}</td><td>${money}</td><td>${share}</td></tr>`;
    }).join('');
    return `<table class="slate-table"><thead><tr><th>Product</th><th>kg/d</th><th>t/y</th><th>$/y</th><th>Share</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  function powerThrottleCallout() {
    const warnings = app.result?.warnings || [];
    const fromWarning = warnings.some(message => /Capacity reduced: limited by available electricity|site solar electricity/i.test(message));
    const fromBoundary = (app.operationMeta.boundaryLimitedBy || []).some(item => /solar electricity|available electricity/i.test(String(item)));
    const fromNodes = app.graph.nodes.some(node => {
      const limits = app.result?.nodes?.[node.id]?.limitedBy || [];
      if (limits.includes('electricity')) return true;
      const electricSource = node.siteResource === 'electricity' || node.unit === 'electricity-source' || node.unit === 'solar-pv';
      return electricSource && limits.includes('site budget');
    });
    return (fromWarning || fromBoundary || fromNodes) ? 'Capacity reduced: limited by available electricity' : '';
  }

  function powerLimitNodeId() {
    const limited = app.graph.nodes.filter(node => {
      const limits = app.result?.nodes?.[node.id]?.limitedBy || [];
      if (limits.includes('electricity')) return true;
      const electricSource = node.siteResource === 'electricity' || node.unit === 'electricity-source' || node.unit === 'solar-pv';
      return electricSource && limits.includes('site budget');
    });
    const converter = limited.find(node => app.units[node.unit]?.kind === 'converter');
    if (converter) return converter.id;
    if (limited[0]) return limited[0].id;
    const source = app.graph.nodes.find(node => node.siteResource === 'electricity' || node.unit === 'solar-pv' || node.unit === 'electricity-source');
    return source?.id || '';
  }

  function overviewYieldMeta() {
    const meteo = app.site?.meteo;
    if (!meteo && !Number.isFinite(Number(app.site?.dailyPVKWhPerKWp))) return null;
    const quality = app.classifyQuality({
      kind: 'meteo',
      quality: meteo?.quality,
      sourceNote: meteo?.cite?.label || meteo?.source || meteo?.notes,
    });
    const monthly = Array.isArray(meteo?.monthlyPVKWhPerKWp) ? meteo.monthlyPVKWhPerKWp : [];
    const monthVals = monthly.slice(1).map(Number).filter(Number.isFinite);
    const band = monthVals.length >= 2
      ? { low: Math.min(...monthVals), high: Math.max(...monthVals), unit: 'kWh/kWp·day' }
      : null;
    const daily = Number(meteo?.dailyPVKWhPerKWp ?? app.site.dailyPVKWhPerKWp);
    const references = quality === 'cited' ? app.citeFrom(meteo?.cite) : [];
    return { daily, quality, band, references };
  }

  function metricStats(pairs) {
    return pairs.map(([label, html]) => (
      `<div class="metric-stat"><span>${app.escapeHtml(label)}</span><strong>${html}</strong></div>`
    )).join('');
  }

  function driverRow(key, body, tone, attrs) {
    const value = attrs
      ? `<button type="button" class="tone-${tone}" ${attrs}>${body}</button>`
      : `<span class="tone-${tone}">${body}</span>`;
    return `<li class="driver-row"><span class="driver-key">${app.escapeHtml(key)}</span>${value}</li>`;
  }

  function renderOverviewDrivers() {
    const list = document.getElementById('overviewDrivers');
    if (!list) return;
    if (!app.graph.nodes.length) {
      list.innerHTML = driverRow('Plant', 'No plant loaded — pick a case or open Process.', 'idle', '');
      return;
    }
    const rows = [];
    const powerNote = powerThrottleCallout();
    if (powerNote) {
      const nodeId = powerLimitNodeId();
      rows.push(driverRow('Power', app.escapeHtml(powerNote), 'warn', nodeId ? `data-driver-node="${app.escapeHtml(nodeId)}"` : ''));
    } else {
      rows.push(driverRow('Power', 'Not limited', 'ok', ''));
    }
    const missing = app.missingConnectionRecords();
    if (missing.length) {
      const shown = missing.slice(0, 3).map(item => item.text).join(' · ');
      const extra = missing.length > 3 ? ` · +${missing.length - 3}` : '';
      rows.push(driverRow('Wiring', app.escapeHtml(`${shown}${extra}`), 'warn', `data-driver-node="${app.escapeHtml(missing[0].nodeId)}"`));
    } else {
      rows.push(driverRow('Wiring', 'Complete', 'ok', ''));
    }
    const bottleneckPairs = app.graph.nodes.flatMap(current => app.bottlenecksFor(current.id).map(limit => ({
      nodeId: current.id,
      limit,
      label: `${current.label}: ${app.portName(limit, current.unit)}`,
    })));
    const otherBottlenecks = bottleneckPairs.filter(item => item.limit !== 'electricity' && item.limit !== 'site budget');
    if (otherBottlenecks.length) {
      const shown = otherBottlenecks.slice(0, 3).map(item => item.label).join(' · ');
      rows.push(driverRow('Bottleneck', app.escapeHtml(shown), 'warn', `data-driver-node="${app.escapeHtml(otherBottlenecks[0].nodeId)}"`));
    } else if (powerNote && bottleneckPairs.length) {
      rows.push(driverRow('Bottleneck', 'See power', 'warn', ''));
    } else {
      rows.push(driverRow('Bottleneck', 'None', 'ok', ''));
    }
    if (app.solveError) {
      rows.push(driverRow('Solve', app.escapeHtml(app.solveError), 'bad', ''));
    } else if (!app.result?.balances) {
      rows.push(driverRow('Balance', 'Not solved', 'warn', 'data-driver-tab="process"'));
    } else if (app.result.balances.maxAbsResidual >= 1e-8) {
      rows.push(driverRow('Balance', app.escapeHtml(`Residual ${app.formatNumber(app.result.balances.maxAbsResidual)}`), 'warn', 'data-driver-tab="process"'));
    } else {
      rows.push(driverRow('Balance', 'Closed', 'ok', ''));
    }
    if (app.site?.rights) {
      const concession = app.site.rights.brineConcession;
      const unverified = app.unverifiedRightsWarnings?.(app.site) || [];
      const chip = concession ? app.rightsChip(concession.status) : '';
      const extra = unverified.length ? ` · ${unverified.length} unverified` : '';
      rows.push(driverRow('Rights', `${chip} Brine concession${app.escapeHtml(extra)}`, unverified.length ? 'warn' : 'ok', 'data-driver-rights="brineConcession"'));
    } else {
      rows.push(driverRow('Rights', 'No site rights', 'warn', ''));
    }
    list.innerHTML = rows.join('');
  }

  function renderOverviewResources(landQuality) {
    const land = document.getElementById('overviewLand');
    const yieldEl = document.getElementById('overviewYield');
    const waterEl = document.getElementById('overviewWater');
    if (land) {
      if (app.site && typeof FlowsheetFootprint !== 'undefined') {
        const footprint = FlowsheetFootprint.estimateFootprint({ site: app.site, graph: app.graph, solved: app.result });
        const meta = app.metricMetaMarkup({ quality: landQuality });
        land.innerHTML = footprint.totalAreaM2 > 0
          ? `<div class="metric-stat"><span>Land</span><strong>${app.formatUncertainHa(footprint.totalHa, landQuality)}</strong>${meta}</div><div class="metric-stat"><span>Solar land</span><strong>${app.formatUncertainHa(footprint.solar.ha, landQuality)}</strong></div>`
          : metricStats([['Land', '—'], ['Solar land', '—']]);
      } else if (app.networkResult?.landHa) {
        const meta = app.metricMetaMarkup({ quality: landQuality });
        land.innerHTML = `<div class="metric-stat"><span>Land</span><strong>${app.formatUncertainHa(app.networkResult.landHa, landQuality)} network</strong>${meta}</div><div class="metric-stat"><span>Solar land</span><strong>—</strong></div>`;
      } else {
        land.innerHTML = metricStats([['Land', '—'], ['Solar land', '—']]);
      }
    }
    if (yieldEl) {
      const yieldMeta = overviewYieldMeta();
      const kwp = Number(app.site?.solarKWp);
      const kwpText = Number.isFinite(kwp) ? `${app.formatNumber(kwp)} kWp` : '—';
      if (!yieldMeta || !Number.isFinite(yieldMeta.daily)) {
        yieldEl.innerHTML = metricStats([['Yield', '—'], ['Array', kwpText]]);
      } else {
        const value = app.formatUncertainNumber(yieldMeta.daily, yieldMeta.quality, { unit: 'kWh/kWp·day' });
        const meta = app.metricMetaMarkup({
          quality: yieldMeta.quality,
          band: yieldMeta.band,
          references: yieldMeta.references,
        });
        yieldEl.innerHTML = `<div class="metric-stat"><span>Yield</span><strong>${value}</strong>${meta}</div><div class="metric-stat"><span>Array</span><strong>${kwpText}</strong></div>`;
      }
    }
    if (waterEl) {
      const resource = app.site?.resources?.freshwater;
      const right = app.site?.rights?.freshwater;
      if (!resource?.stream) {
        waterEl.innerHTML = metricStats([['Water', '—'], ['Right', '—']]);
      } else {
        let kg = null;
        try { kg = app.sourceAmount(resource.stream); } catch { kg = null; }
        const amount = Number.isFinite(kg) ? `${app.formatNumber(kg)} kg/d` : '—';
        const chip = right ? app.rightsChip(right.status) : '';
        waterEl.innerHTML = metricStats([['Water', amount], ['Right', chip || '—']]);
      }
    }
  }

  function renderOverview() {
    const siteEl = document.getElementById('overviewSiteName');
    const honesty = document.getElementById('overviewHonesty');
    const cash = document.getElementById('overviewCashflow');
    const slate = document.getElementById('overviewSlate');
    if (!siteEl || !cash) return;

    if (app.site?.name) {
      siteEl.textContent = app.site.name;
    } else if (!app.graph.nodes.length) {
      siteEl.textContent = 'No plant loaded';
    } else {
      const label = app.draftSiteLabel();
      const lat = document.getElementById('siteLatitude')?.value;
      const lon = document.getElementById('siteLongitude')?.value;
      if (lat !== undefined && lat !== '' && lon !== undefined && lon !== '') {
        siteEl.innerHTML = `${app.escapeHtml(label)} <button type="button" class="text-button" data-apply-location>(apply location)</button>`;
      } else {
        siteEl.textContent = label;
      }
    }

    const gate = app.economicsGateReasons();
    const moneyQuality = app.classifyQuality({ kind: 'money' });
    const landQuality = app.classifyQuality({ kind: 'land' });
    if (honesty) {
      if (!app.graph.nodes.length) honesty.textContent = 'No plant loaded — pick a case or open Process.';
      else if (gate.length) honesty.textContent = `Screening — not bankable (${gate.join('; ')}). Gate is R − OPEX − ann. CAPEX.`;
      else if (app.currentEconomics && (moneyQuality === 'screening' || moneyQuality === 'assumption')) {
        honesty.textContent = 'Screening — not bankable. Capital-inclusive gate is R − OPEX − ann. CAPEX.';
      } else if (app.currentEconomics) honesty.textContent = 'Capital-inclusive gate is R − OPEX − ann. CAPEX. NPV and IRR stay on Economics.';
      else honesty.textContent = 'Graph incomplete — cash gate needs a solved plant.';
    }

    if (!app.currentEconomics) {
      cash.className = 'cash-gate';
      cash.innerHTML = '<span class="cash-gate-label">Net cash / year</span><strong>—</strong><span class="cash-gate-verdict">No gate</span><small>R − OPEX − ann. CAPEX</small>';
    } else {
      const net = app.currentEconomics.annualNetCash;
      const pass = net > 0;
      const fail = net < 0;
      const verdict = pass ? 'Above gate' : fail ? 'Below gate' : 'At gate';
      const netClass = pass ? 'positive' : fail ? 'negative' : '';
      cash.className = `cash-gate${pass ? ' is-pass' : fail ? ' is-fail' : ''}`;
      cash.innerHTML = `<span class="cash-gate-label">Net cash / year</span><strong class="${netClass}">${app.formatUncertainMoney(net, moneyQuality)}</strong><span class="cash-gate-verdict">${verdict}</span><small>R − OPEX − ann. CAPEX</small>`;
    }

    if (slate) slate.innerHTML = renderSlateTable(overviewSaleRecords());
    renderOverviewResources(landQuality);
    app.renderOverviewFootprint();
    renderOverviewDrivers();
    const offtake = document.getElementById('overviewOfftake');
    const offtakeWrap = document.getElementById('overviewOfftakeWrap');
    if (offtakeWrap && offtake) offtakeWrap.hidden = !!offtake.hidden || !offtake.textContent;
    app.renderCashflowResult();
  }
})();
