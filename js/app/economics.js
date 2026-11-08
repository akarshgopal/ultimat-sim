// Economics tab: defaults, gates, assumption readouts, charts, power break-even.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    defaultEconomics, economicsAcknowledgment, economicsControlsFor, economicsGateReasons,
    economicsRows, populatePowerBreakevenMaterials, renderEconomics, screenPowerBreakEven,
    setEconomicsAcknowledgment,
  });

  function defaultEconomics(current) {
    const kind = app.units[current.unit].kind;
    if (kind === 'source') {
      if (['solar-pv', 'nuclear-electricity', 'solar-thermal'].includes(current.unit)) return {
        installedCapex: current.params.capacityKW * current.params.capexPerKW,
        fixedOM: current.params.capacityKW * Number(current.params.fixedOMPerKWYear || 0),
        variableOM: Number(current.params.variableCostPerMWh || 0) / 1000,
        assetLifeYears: current.params.lifeYears,
      };
      const unitCost = current.unit === 'grid-electricity' ? current.params.pricePerMWh / 1000
        : current.unit === 'electricity-source' ? 0.05
          : current.unit === 'heat-source' ? 0.02
            : current.unit === 'consumable-source' ? 1 : 0;
      return { unitCost };
    }
    if (current.unit === 'intake-pump' || current.unit === 'gas-blower') {
      const tea = app.teaApi();
      if (tea?.bindCapexPack) {
        return tea.bindCapexPack(current.unit, { capacity: current.capacity || 0, region: app.siteRegionForTea() });
      }
      return { installedCapex: 0, fixedOMPercent: 3, assetLifeYears: 20 };
    }
    if (current.unit === 'mg-si' || current.unit === 'polysilicon' || current.unit === 'bayer-alumina' || current.unit === 'aluminium-smelter' || current.unit === 'float-glass' || current.unit === 'cement' || current.unit === 'copper-ew' || current.unit === 'pv-module' || current.unit === 'hydrogen-dri' || current.unit === 'titanium-kroll' || current.unit === 'iac-leach' || current.unit === 'ree-chromatography' || current.unit === 'ree-sx' || current.unit === 'bioforge' || current.unit === 'urea' || current.unit === 'mto' || current.unit === 'ft-liquids') {
      const tea = app.teaApi();
      if (tea?.bindCapexPack) {
        return tea.bindCapexPack(current.unit, { capacity: current.capacity || 0, region: app.siteRegionForTea() });
      }
    }
    if (kind === 'converter') return {
      installedCapex: ['battery', 'thermal-storage'].includes(current.unit) ? current.capacity * current.params.capexPerKWh : 0,
      fixedOMPercent: 3,
      variableOM: 0,
      assetLifeYears: 20,
    };
    if (kind === 'buffer') {
      app.refreshBufferEconomics(current);
      return current.economics || { installedCapex: 0, fixedOMPercent: 2, assetLifeYears: 25 };
    }
    if (kind === 'sink') return { disposition: 'vent', unitPrice: 0, disposalCost: 0, annualDemandLimit: (globalThis.TeaScreening && globalThis.TeaScreening.EDITOR_DEMAND_DEFAULT) || 1e6 };
    return {};
  }

  function economicsControlsFor(current) {
    const kind = app.units[current.unit].kind;
    const economics = current.economics || (current.economics = defaultEconomics(current));
    const field = (key, label, step = '0.01') => {
      const raw = economics[key] ?? 0;
      const capexLike = /capex|fixedOM/i.test(key);
      const shown = capexLike ? app.displayInputNumber(raw) : raw;
      const title = capexLike ? ` title="${app.escapeHtml(raw)}"` : '';
      return `<label>${label}<input name="economics" data-economics="${key}" type="number" min="0" step="${step}" value="${shown}"${title}></label>`;
    };
    if (kind === 'source') return `<fieldset><legend>Economics</legend>${economics.unitCost != null ? field('unitCost', 'Delivered input cost') : `${field('installedCapex', 'Installed CAPEX', '100')}${field('fixedOM', 'Fixed O&M / year', '100')}${field('variableOM', 'Variable cost / output unit')}`}<p class="status-meta">Native unit is kg, kWh, or consumable unit. Zero values explore the physical limit.</p></fieldset>`;
    if (kind === 'converter' || kind === 'buffer') {
      const capexField = economics.capexRate != null && economics.installedCapex == null
        ? field('capexRate', 'CAPEX rate / capacity unit', '1')
        : field('installedCapex', 'Installed CAPEX', '100');
      const variable = kind === 'buffer'
        ? ''
        : field('variableOM', 'Variable O&M / activity unit');
      const densityNote = kind === 'buffer' && economics.densityKgM3
        ? ` · density ${app.formatNumber(economics.densityKgM3)} kg/m³${economics.densitySource ? ` (${app.escapeHtml(economics.densitySource)})` : ''}`
        : '';
      const liftNote = current.unit === 'intake-pump'
        ? 'Screening lift CAPEX = duty capacity × tea pack intensity × regional CAPEX×. Capacity changes refresh CAPEX. Head and part-load, when set, set electricity — not CAPEX. Part-load uses the delivered flow, so a short bus starves on the shaped SEC. k unset leaves SEC unchanged.'
        : current.unit === 'gas-blower'
          ? 'Screening lift CAPEX = duty capacity × tea pack intensity × regional CAPEX×. Capacity changes refresh CAPEX. ΔP, when set, sets electricity — not CAPEX. ΔP unset keeps the kWh/Nm³ slider.'
          : '';
      return `<fieldset><legend>Economics</legend>${capexField}${field('fixedOMPercent', 'Fixed O&M (% CAPEX)')}${variable}${field('assetLifeYears', 'Asset life (years)', '1')}${kind === 'buffer' ? `<p class="status-meta">Tank CAPEX = (kg ÷ density) × $/m³${economics.fluidLabel ? ` · fluid: <strong>${app.escapeHtml(economics.fluidLabel)}</strong>` : ''}${economics.capexPerM3 != null ? ` · intensity $${app.formatNumber(economics.capexPerM3)}/m³` : ''}${densityNote}${economics.regionMultiplier != null && economics.regionMultiplier !== 1 ? ` · region ×${app.formatNumber(economics.regionMultiplier)}` : ''}. Fluid class follows the upstream intake when unset. No assay density → UNESCO salinity (0–42 g/kg), a TDS mg/L proxy (1 L ≈ 1 kg, then S = mg/L ÷ ρ), or the labeled fluid-class density.</p>` : liftNote ? `<p class="status-meta">${liftNote}</p>` : ''}</fieldset>`;
    }
    return `<fieldset><legend>Destination economics</legend><label>Disposition<select name="economics" data-economics="disposition">${['sale', 'disposal', 'vent', 'reinjection'].map(value => `<option value="${value}"${economics.disposition === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label>${field('unitPrice', 'Sale price / unit')}${field('annualDemandLimit', 'Annual demand limit', '1')}${field('disposalCost', 'Disposal cost / unit')}</fieldset>`;
  }

  function economicsAcknowledgment() {
    if (!app.storage) return false;
    try { return app.storage.getItem('flowsheet-economics-ack') === '1'; } catch { return false; }
  }

  function setEconomicsAcknowledgment(value) {
    if (!app.storage) return;
    try { app.storage.setItem('flowsheet-economics-ack', value ? '1' : '0'); } catch { /* ignore */ }
  }

  function economicsGateReasons() {
    const reasons = [];
    const rights = app.unverifiedRightsWarnings?.(app.site) || [];
    if (rights.length) reasons.push('site rights unverified');
    if (app.network.plants.length && !(app.network.corridors || []).length) {
      reasons.push('no haul corridors / market freight');
    }
    return reasons;
  }

  function soldPowerBreakevenMaterials() {
    const materials = globalThis.MaterialPowerBreakeven?.MATERIALS || [];
    const sold = new Set(
      (app.currentEconomics?.sinks || [])
        .filter(sink => sink && sink.disposition === 'sale' && Number(sink.deliveredAmount) > 0)
        .map(sink => sink.id)
    );
    return materials.filter(item => (item.sinks || []).some(id => sold.has(id)));
  }

  function unsupportedSoldLabels() {
    const supported = new Set(
      (globalThis.MaterialPowerBreakeven?.MATERIALS || []).flatMap(item => item.sinks || [])
    );
    return (app.currentEconomics?.sinks || [])
      .filter(sink => sink && sink.disposition === 'sale' && Number(sink.deliveredAmount) > 0 && !supported.has(sink.id))
      .map(sink => app.NETWORK_SALE_LABELS[sink.id] || app.NODE_DISPLAY_LABELS[sink.id] || sink.id);
  }

  function populatePowerBreakevenMaterials() {
    const select = document.getElementById('powerBreakevenMaterial');
    if (!select) return;
    const shared = (document.getElementById('powerBreakevenMode')?.value || 'solo') === 'shared';
    const materials = soldPowerBreakevenMaterials();
    const current = select.value;
    if (!materials.length) {
      const unsupported = unsupportedSoldLabels();
      select.innerHTML = unsupported.length
        ? `<option value="">No product supported by the screening price table (${app.escapeHtml(unsupported.join(', '))})</option>`
        : '<option value="">No products sold</option>';
      select.value = '';
      select.disabled = true;
      return;
    }
    select.innerHTML = materials.map(item => `<option value="${item.id}">${item.id}</option>`).join('');
    select.value = materials.some(item => item.id === current) ? current : materials[0].id;
    select.disabled = shared;
  }

  const SCREENING_PACK_BY_UNIT = {
    'brine-minerals': 'minerals',
    'chlor-alkali': 'chlor-alkali',
    'bromine-recovery': 'bromine-recovery',
    asu: 'asu',
    ammonia: 'ammonia',
    urea: 'urea',
    mto: 'mto',
    'ft-liquids': 'ft-liquids',
    swro: 'swro',
    electrolyzer: 'electrolyzer',
    dac: 'dac',
    'dac-solid': 'dac',
    'dac-liquid': 'dac',
    'dac-electroswing': 'dac',
    sabatier: 'sabatier',
    methanol: 'methanol',
    'solar-pv': 'solar-pv',
    'mg-si': 'mg-si',
    polysilicon: 'polysilicon',
    'bayer-alumina': 'bayer-alumina',
    'aluminium-smelter': 'aluminium-smelter',
    'float-glass': 'float-glass',
    cement: 'cement',
    'copper-ew': 'copper-ew',
    'pv-module': 'pv-module',
    'hydrogen-dri': 'hydrogen-dri',
    'titanium-kroll': 'titanium-kroll',
    'iac-leach': 'iac-leach',
    'ree-chromatography': 'ree-chromatography',
    'ree-sx': 'ree-sx',
    bioforge: 'bioforge',
  };

  function screeningPackFor(node) {
    const packs = globalThis.TeaScreening?.packs;
    if (!packs || !node) return null;
    const byUnit = SCREENING_PACK_BY_UNIT[node.unit];
    if (byUnit && packs[byUnit]) return packs[byUnit];
    const source = String(node.economics?.source || '');
    if (/solar|PV|ATB/i.test(source) && packs['solar-pv']) return packs['solar-pv'];
    return null;
  }

  function formatIntensity(value, unit) {
    const n = app.formatNumber(value);
    const raw = String(unit || '');
    if (!raw) return `$${n}`;
    if (raw.startsWith('$')) return `$${n}${raw.slice(1)}`;
    return `$${n} ${raw}`;
  }

  function isSolarCapexNode(node) {
    if (!node) return false;
    if (node.unit === 'solar-pv' && Number.isFinite(Number(node.params?.capexPerKW))) return true;
    return Number.isFinite(Number(node.economics?.capexIntensity)) && /solar|PV|ATB/i.test(String(node.economics?.source || ''));
  }

  function powerPriceReadout() {
    const grid = app.graph.nodes.find(node => node.unit === 'grid-electricity' && Number.isFinite(Number(node.params?.pricePerMWh)));
    if (grid) {
      return { label: 'Grid tariff', value: `$${app.formatNumber(grid.params.pricePerMWh)}/MWh`, note: 'Block param · not a PPA', nodeId: grid.id };
    }
    const priced = app.graph.nodes.find(node => (
      node.unit === 'electricity-source' || node.unit === 'grid-electricity' || node.id === 'power' || node.siteResource === 'electricity'
    ) && Number.isFinite(Number(node.economics?.unitCost)));
    if (priced) {
      return { label: 'Power cost', value: `$${app.formatNumber(priced.economics.unitCost)}/kWh`, note: 'On the power block · screening · not a PPA', nodeId: priced.id };
    }
    const solar = app.graph.nodes.find(isSolarCapexNode);
    if (solar) {
      const intensity = Number(solar.economics?.capexIntensity);
      if (Number.isFinite(intensity)) {
        const pack = screeningPackFor(solar) || globalThis.TeaScreening?.packs?.['solar-pv'];
        return { label: 'PV CAPEX', value: formatIntensity(intensity, pack?.intensityUnit || '$/kWp'), note: 'On the power block · screening', nodeId: solar.id };
      }
      return { label: 'PV CAPEX', value: `$${app.formatNumber(solar.params.capexPerKW)}/kW`, note: 'Block param · screening', nodeId: solar.id };
    }
    const table = globalThis.TeaScreening?.costs?.power;
    if (table && Number.isFinite(Number(table.value))) {
      return {
        label: 'Power band',
        value: formatIntensity(table.value, table.unit || '$/kWh'),
        note: 'Screening table · not on this plant · not a PPA',
        nodeId: null,
      };
    }
    return { label: 'Power price', value: 'Not set', note: 'No purchased-power price on this plant', nodeId: null };
  }

  function capexIntensityReadout(skipId) {
    const usable = node => node && node.id !== skipId;
    const nodes = app.graph.nodes.filter(node => usable(node) && Number.isFinite(Number(node.economics?.capexIntensity)));
    const node = nodes.find(item => item.economics?.capexIntensityBand)
      || nodes.find(item => item.unit === 'brine-minerals')
      || nodes.find(item => !isSolarCapexNode(item))
      || nodes[0]
      || app.graph.nodes.find(item => usable(item) && item.unit === 'solar-pv' && Number.isFinite(Number(item.params?.capexPerKW)))
      || app.graph.nodes.find(item => usable(item) && Number(item.economics?.capexRate) > 0)
      || null;
    if (!node) return { label: 'CAPEX intensity', value: 'Not set', note: 'No intensity on this plant' };
    if (node.unit === 'solar-pv' && !Number.isFinite(Number(node.economics?.capexIntensity)) && Number.isFinite(Number(node.params?.capexPerKW))) {
      return { label: 'PV CAPEX', value: `$${app.formatNumber(node.params.capexPerKW)}/kW`, note: 'Block param · screening' };
    }
    const intensity = Number(node.economics?.capexIntensity ?? node.economics?.capexRate);
    const pack = screeningPackFor(node);
    const band = node.economics?.capexIntensityBand;
    const solar = isSolarCapexNode(node);
    const label = band || node.unit === 'brine-minerals' ? 'Minerals CAPEX' : solar ? 'PV CAPEX' : 'CAPEX intensity';
    const note = band
      ? `Screening band $${app.formatNumber(band.low)}–$${app.formatNumber(band.high)} · not bankable`
      : `On ${node.id} · screening`;
    return { label, value: formatIntensity(intensity, pack?.intensityUnit), note };
  }

  function paintAssumptionReadouts() {
    const host = document.getElementById('economicsAssumptions');
    if (!host) return;
    const power = powerPriceReadout();
    const capex = capexIntensityReadout(power.nodeId);
    host.innerHTML = [power, capex].map(row => (
      `<div class="tea-read"><span>${app.escapeHtml(row.label)}</span><strong>${app.escapeHtml(row.value)}</strong><small>${app.escapeHtml(row.note)}</small></div>`
    )).join('');
  }

  function paintCashGate(econ, moneyQuality) {
    const gateEl = document.getElementById('economicsGate');
    const valueEl = document.getElementById('economicsGateValue');
    const noteEl = document.getElementById('economicsGateNote');
    gateEl?.classList.remove('is-positive', 'is-negative');
    if (!econ) {
      if (valueEl) valueEl.textContent = '—';
      if (noteEl) noteEl.textContent = '';
      return;
    }
    const net = Number(econ.annualNetCash);
    if (valueEl) valueEl.textContent = app.formatUncertainMoney(net, moneyQuality);
    if (noteEl) {
      noteEl.textContent = net > 0
        ? 'Above the cash gate · screening'
        : net < 0
          ? 'Below the cash gate · screening'
          : 'At the cash gate · screening';
    }
    if (net > 0) gateEl?.classList.add('is-positive');
    else if (net < 0) gateEl?.classList.add('is-negative');
  }

  function teaChartEmpty(message) {
    return `<p class="tea-chart-empty">${app.escapeHtml(message)}</p>`;
  }

  function attrNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : '0';
  }

  function px(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '0';
  }

  function niceStep(span, target) {
    const rough = span / Math.max(1, target);
    if (!(rough > 0) || !Number.isFinite(rough)) return 1;
    const mag = 10 ** Math.floor(Math.log10(rough));
    if (!Number.isFinite(mag) || mag === 0) return 1;
    const residual = rough / mag;
    const nice = residual <= 1.5 ? 1 : residual <= 3.5 ? 2 : residual <= 7.5 ? 5 : 10;
    return nice * mag;
  }

  function roundTo(value, step) {
    if (!(step > 0) || !Number.isFinite(value)) return value;
    const digits = Math.max(0, Math.min(8, Math.ceil(-Math.log10(step)) + 1));
    return Number((Math.round(value / step) * step).toFixed(digits));
  }

  function axisFromValues(values, target = 4) {
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return { min: 0, max: 0, ticks: [0], flat: true };
    let lo = Math.min(0, ...finite);
    let hi = Math.max(0, ...finite);
    if (hi - lo < 1e-9) return { min: 0, max: 0, ticks: [0], flat: true };
    const pad = (hi - lo) * 0.08;
    if (lo < 0) lo -= pad;
    if (hi > 0) hi += pad;
    let step = niceStep(hi - lo, target);
    let min = Math.floor(lo / step + 1e-12) * step;
    let max = Math.ceil(hi / step - 1e-12) * step;
    let count = Math.round((max - min) / step);
    if (count > 8) {
      step *= 2;
      min = Math.floor(lo / step + 1e-12) * step;
      max = Math.ceil(hi / step - 1e-12) * step;
      count = Math.round((max - min) / step);
    }
    const ticks = [];
    for (let i = 0; i <= count && i < 10; i += 1) ticks.push(roundTo(min + i * step, step));
    return { min: ticks[0], max: ticks[ticks.length - 1], ticks, step, flat: false };
  }

  function trimFixed(value, digits) {
    return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function axisMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '$0';
    const sign = n < 0 ? '−' : '';
    const abs = Math.abs(n);
    const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
    for (const [scale, suffix] of units) {
      if (abs >= scale) {
        const scaled = abs / scale;
        const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
        return `${sign}$${trimFixed(scaled, digits)}${suffix}`;
      }
    }
    const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return `${sign}$${trimFixed(abs, digits)}`;
  }

  function formatKwh(price) {
    if (!Number.isFinite(price) || Math.abs(price) < 5e-5) return '$0';
    const digits = Math.abs(price) >= 1 ? 2 : 3;
    return `${price < 0 ? '−' : ''}$${Math.abs(price).toFixed(digits)}`;
  }

  function formatKwhTick(price, step) {
    if (!Number.isFinite(price) || Math.abs(price) < 5e-5) return '$0';
    const digits = step < 0.1 && Math.abs(price) < 1 ? 3 : 2;
    const body = Math.abs(price).toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return `${price < 0 ? '−' : ''}$${body}`;
  }

  function yMapper(scale, plotTop, plotH) {
    if (scale.flat || !(scale.max > scale.min)) {
      const y = plotTop + plotH / 2;
      return () => y;
    }
    const span = scale.max - scale.min;
    return value => plotTop + (scale.max - value) / span * plotH;
  }

  function waterfallSteps(econ) {
    const revenue = Number(econ.annualRevenue) || 0;
    const opex = Math.abs(Number(econ.annualOperatingCost) || 0);
    const capex = Math.abs(Number(econ.annualizedCapex) || 0);
    const net = Number.isFinite(Number(econ.annualNetCash)) ? Number(econ.annualNetCash) : revenue - opex - capex;
    return [
      { key: 'revenue', label: 'Revenue', kind: 'source', from: 0, to: revenue, value: revenue },
      { key: 'opex', label: '− OPEX', kind: 'deduct', from: revenue, to: revenue - opex, value: -opex },
      { key: 'capex', label: '− ann. CAPEX', kind: 'deduct', from: revenue - opex, to: revenue - opex - capex, value: -capex },
      { key: 'net', label: 'Net', kind: 'net', from: 0, to: net, value: net },
    ];
  }

  function economicsWaterfallMarkup(econ, moneyQuality) {
    if (!econ) return teaChartEmpty('Complete the graph to plot the cash gate.');
    const steps = waterfallSteps(econ);
    const scale = axisFromValues(steps.flatMap(step => [step.from, step.to, 0]));
    const width = 480;
    const height = 212;
    const padL = 58;
    const padR = 10;
    const padT = 22;
    const padB = 28;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const plotRight = padL + plotW;
    const y = yMapper(scale, padT, plotH);
    const slot = plotW / steps.length;
    const barW = Math.min(46, slot * 0.5);
    const cx = index => padL + slot * (index + 0.5);
    const ticks = scale.ticks.map(tick => {
      const yy = y(tick);
      const zero = tick === 0;
      return `<g class="tea-axis-tick"><line x1="${padL}" y1="${px(yy)}" x2="${plotRight}" y2="${px(yy)}" stroke="${zero ? 'var(--text-muted)' : 'var(--border)'}" stroke-width="${zero ? 1.25 : 1}"${zero ? ' class="tea-zero"' : ''}></line><text x="${padL - 6}" y="${px(yy + 3)}" text-anchor="end">${app.escapeHtml(axisMoney(tick))}</text></g>`;
    }).join('');
    const bandX = cx(3) - barW / 2 - 8;
    const band = `<rect class="tea-gate-band" x="${px(bandX)}" y="${px(padT)}" width="${px(barW + 16)}" height="${px(plotH)}" rx="4" fill="var(--accent)" opacity="0.14"></rect><text class="tea-gate-tag" x="${px(cx(3))}" y="12" text-anchor="middle">gate</text>`;
    const connectors = steps.slice(0, 3).map((step, index) => {
      const next = steps[index + 1];
      const y2 = y(index === 2 ? next.to : next.from);
      return `<line x1="${px(cx(index) + barW / 2)}" y1="${px(y(step.to))}" x2="${px(cx(index + 1) - barW / 2)}" y2="${px(y2)}" stroke="var(--text-muted)" stroke-dasharray="3 2"></line>`;
    }).join('');
    const columns = steps.map((step, index) => {
      const tone = step.kind === 'net'
        ? (step.value > 0 ? 'positive' : step.value < 0 ? 'negative' : 'flat')
        : step.kind;
      const gateClass = step.kind === 'net' ? ' is-gate' : '';
      const y0 = y(step.from);
      const y1 = y(step.to);
      const top = Math.min(y0, y1);
      const barH = Math.abs(y1 - y0);
      const fill = step.kind === 'source'
        ? 'var(--teal)'
        : step.kind === 'deduct'
          ? 'var(--warning)'
          : step.value > 0 ? 'var(--success)' : step.value < 0 ? 'var(--danger)' : 'var(--text-muted)';
      const rect = barH > 0.4
        ? `<rect x="${px(cx(index) - barW / 2)}" y="${px(top)}" width="${px(barW)}" height="${px(barH)}" rx="2" fill="${fill}"${step.kind === 'net' ? ' stroke="var(--text-primary)" stroke-width="1.25"' : ''}></rect>`
        : '';
      const plotBottom = padT + plotH - 2;
      let labelY = top - 6;
      if (labelY < padT + 3) labelY = top + barH + 12;
      if (labelY > plotBottom) labelY = Math.max(padT + 12, top + Math.min(14, Math.max(barH - 2, 0)));
      const shown = app.formatUncertainMoney(step.value, moneyQuality);
      return `<g class="tea-fall-step is-${tone}${gateClass}" data-key="${step.key}" data-from="${attrNum(step.from)}" data-to="${attrNum(step.to)}"><title>${app.escapeHtml(step.label)} ${app.escapeHtml(shown)}</title>${rect}<text class="tea-fall-value" x="${px(cx(index))}" y="${px(labelY)}" text-anchor="middle">${app.escapeHtml(shown)}</text><text class="tea-fall-label" x="${px(cx(index))}" y="${height - 8}" text-anchor="middle">${app.escapeHtml(step.label)}</text></g>`;
    }).join('');
    return `<svg class="tea-plot" viewBox="0 0 ${width} ${height}" role="img"><title>Revenue, minus operating cost, minus annualized CAPEX, net cash gate</title>${ticks}${band}${connectors}${columns}</svg>`;
  }

  function cashflowYearLabels(count) {
    if (count <= 1) return [0];
    if (count <= 8) return [...Array(count).keys()];
    const last = count - 1;
    const labels = new Set([0, last]);
    const step = Math.max(1, Math.ceil(last / 5));
    for (let year = 0; year <= last; year += step) labels.add(year);
    return [...labels].sort((a, b) => a - b);
  }

  function economicsCashflowMarkup(econ, moneyQuality) {
    const flows = Array.isArray(econ?.cashFlows) ? econ.cashFlows.map(Number) : [];
    if (!flows.length || flows.some(value => !Number.isFinite(value))) {
      return teaChartEmpty('Cash-flow series is incomplete.');
    }
    const scale = axisFromValues(flows);
    const width = 480;
    const height = 188;
    const padL = 58;
    const padR = 8;
    const padT = 16;
    const padB = 24;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const plotRight = padL + plotW;
    const y = yMapper(scale, padT, plotH);
    const slot = plotW / flows.length;
    const barW = Math.max(2, Math.min(28, slot * 0.62));
    const zeroY = y(0);
    const ticks = scale.ticks.map(tick => {
      const yy = y(tick);
      const zero = tick === 0;
      return `<g class="tea-axis-tick"><line x1="${padL}" y1="${px(yy)}" x2="${plotRight}" y2="${px(yy)}" stroke="${zero ? 'var(--text-muted)' : 'var(--border)'}" stroke-width="${zero ? 1.25 : 1}"${zero ? ' class="tea-zero"' : ''}></line><text x="${padL - 6}" y="${px(yy + 3)}" text-anchor="end">${app.escapeHtml(axisMoney(tick))}</text></g>`;
    }).join('');
    const labeled = new Set(cashflowYearLabels(flows.length));
    const bars = flows.map((value, year) => {
      const cx = padL + slot * (year + 0.5);
      const y1 = y(value);
      const top = Math.min(zeroY, y1);
      const barH = Math.abs(y1 - zeroY);
      const capex = year === 0;
      const fill = capex ? 'var(--warning)' : value > 0 ? 'var(--success)' : value < 0 ? 'var(--danger)' : 'var(--text-muted)';
      const cls = capex ? 'is-capex' : value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : 'is-flat';
      const rect = barH > 0.4
        ? `<rect x="${px(cx - barW / 2)}" y="${px(top)}" width="${px(barW)}" height="${px(barH)}" rx="1" fill="${fill}"${capex ? ' stroke="var(--text-primary)" stroke-width="1.15"' : ''}></rect>`
        : '';
      const yearLabel = labeled.has(year)
        ? `<text class="tea-year-label${capex ? ' is-capex-label' : ''}" x="${px(cx)}" y="${height - 6}" text-anchor="middle">${year}</text>`
        : '';
      const name = capex ? 'Year 0 · CAPEX' : `Year ${year}`;
      return `<g class="tea-cash-bar ${cls}" data-year="${year}" data-value="${attrNum(value)}"><title>${app.escapeHtml(name)} ${app.escapeHtml(app.formatUncertainMoney(value, moneyQuality))}</title>${rect}${yearLabel}</g>`;
    }).join('');
    const later = flows.slice(1);
    const steady = flows[1];
    const replacement = later.length > 1 && later.slice(1).some(value => Math.abs(value - steady) > 1);
    const legendBits = ['<span><i class="is-capex"></i>Year 0 · CAPEX</span>'];
    if (later.some(value => value > 0)) legendBits.push('<span><i class="is-positive"></i>Operating cash</span>');
    if (later.some(value => value < 0)) legendBits.push('<span><i class="is-negative"></i>Negative year</span>');
    const svg = `<svg class="tea-plot" viewBox="0 0 ${width} ${height}" role="img"><title>Cash flow by project year. Year 0 is installed CAPEX.</title>${ticks}${bars}</svg>`;
    const legend = `<p class="tea-chart-legend">${legendBits.join('')}</p>`;
    const note = replacement ? '<p class="tea-chart-note">Dips after year 0 are asset replacements in that year.</p>' : '';
    return `${svg}${legend}${note}`;
  }

  function breakevenMark(mode, result) {
    if (!result || !result.status || result.status === 'unknown-material') return null;
    if (result.status === 'flip' && Number.isFinite(Number(result.breakEven))) {
      return { mode, kind: 'price', price: Number(result.breakEven) };
    }
    if (result.status === 'no-flip-always-positive' && Number.isFinite(Number(result.pMax))) {
      return { mode, kind: 'above', price: Number(result.pMax) };
    }
    if (result.status === 'no-flip-always-negative' || result.status === 'non-monotonic') {
      return { mode, kind: 'none', price: null };
    }
    return { mode, kind: 'none', price: null };
  }

  function priceAxis(maxPrice) {
    const top = Math.max(Number(maxPrice) * 1.18, Number(maxPrice) + 0.01, 0.05);
    let step = niceStep(top, 4);
    if (step >= top) step = niceStep(top, 2);
    let max = Math.ceil((top - 1e-12) / step) * step;
    if (!(max > 0)) max = step || 1;
    let count = Math.round(max / step);
    if (count > 6) {
      step *= 2;
      max = Math.ceil((top - 1e-12) / step) * step;
      count = Math.round(max / step);
    }
    const ticks = [];
    for (let i = 0; i <= count && i < 8; i += 1) ticks.push(roundTo(i * step, step));
    if (ticks[ticks.length - 1] < maxPrice) ticks.push(roundTo(max, step));
    return { min: 0, max: ticks[ticks.length - 1] || max, ticks };
  }

  function breakevenDataAttrs(solo, shared) {
    const part = (name, mark) => {
      if (!mark) return '';
      const price = mark.kind === 'price' && Number.isFinite(mark.price) ? ` data-${name}-price="${attrNum(mark.price)}"` : '';
      const bound = mark.kind === 'above' && Number.isFinite(mark.price) ? ` data-${name}-bound="${attrNum(mark.price)}"` : '';
      return ` data-${name}-kind="${mark.kind}"${price}${bound}`;
    };
    return `${part('solo', solo)}${part('shared', shared)}`;
  }

  function powerBreakevenChartMarkup(soloResult, sharedResult, active) {
    const solo = breakevenMark('solo', soloResult);
    const shared = breakevenMark('shared', sharedResult);
    if (!solo && !shared) return '';
    const marks = [solo, shared].filter(Boolean);
    const prices = marks.filter(mark => mark.kind === 'price');
    const aboves = marks.filter(mark => mark.kind === 'above');
    const attrs = breakevenDataAttrs(solo, shared);
    if (!prices.length && !aboves.length) {
      return `<div class="tea-be-chart"${attrs}><p class="tea-chart-empty">No break-even $/kWh. Net cash stays at or below zero when purchased power is free.</p></div>`;
    }
    const domain = prices.length
      ? priceAxis(Math.max(...prices.map(mark => mark.price), 0))
      : priceAxis(Math.max(...aboves.map(mark => mark.price), 0));
    const plotted = prices.length ? prices : aboves;
    const width = 640;
    const height = 84;
    const padL = 8;
    const padR = 8;
    const axisY = 44;
    const plotW = width - padL - padR;
    const xOf = price => padL + ((price - domain.min) / (domain.max - domain.min || 1)) * plotW;
    const firstTick = domain.ticks[0];
    const lastTick = domain.ticks[domain.ticks.length - 1];
    const tickStep = domain.ticks.length > 1 ? domain.ticks[1] - domain.ticks[0] : domain.max;
    const ticks = domain.ticks.map(tick => {
      const x = xOf(tick);
      const anchor = tick === firstTick ? 'start' : tick === lastTick ? 'end' : 'middle';
      return `<g class="tea-axis-tick"><line x1="${px(x)}" y1="${axisY}" x2="${px(x)}" y2="${axisY + 5}" stroke="var(--text-muted)"></line><text x="${px(x)}" y="${axisY + 18}" text-anchor="${anchor}">${app.escapeHtml(formatKwhTick(tick, tickStep))}</text></g>`;
    }).join('');
    const used = [];
    const markers = plotted.map(mark => {
      const x = xOf(Math.min(Math.max(mark.price, domain.min), domain.max));
      let labelY = 16;
      if (used.some(prev => Math.abs(prev - x) < 88)) labelY = 30;
      used.push(x);
      const color = mark.mode === 'shared' ? 'var(--teal)' : 'var(--electric)';
      const on = mark.mode === active || plotted.length === 1;
      const open = mark.kind === 'above';
      const label = open ? `above ${formatKwh(mark.price)} · ${mark.mode}` : `${formatKwh(mark.price)} · ${mark.mode}`;
      const dot = open
        ? `<circle cx="${px(x)}" cy="${axisY}" r="${on ? 5 : 3.5}" fill="none" stroke="${color}" stroke-width="1.6"></circle>`
        : `<circle cx="${px(x)}" cy="${axisY}" r="${on ? 5 : 3.5}" fill="${color}"${on ? ' stroke="var(--text-primary)" stroke-width="1.4"' : ''}></circle>`;
      return `<g class="tea-be-mark is-${mark.mode}${mark.mode === active ? ' is-active' : ''}" data-mode="${mark.mode}" data-kind="${mark.kind}"><line x1="${px(x)}" y1="${labelY + 3}" x2="${px(x)}" y2="${axisY - 6}" stroke="${color}"></line>${dot}<text x="${px(x)}" y="${labelY}" text-anchor="middle" fill="${color}" font-weight="${on ? 700 : 600}">${app.escapeHtml(label)}</text></g>`;
    }).join('');
    const notes = [];
    if (prices.length) {
      for (const mark of marks) {
        if (mark.kind === 'none') notes.push(`${mark.mode}: no $/kWh cross — cash stays ≤ 0 at free power`);
        if (mark.kind === 'above') notes.push(`${mark.mode}: still above the gate at ${formatKwh(mark.price)}/kWh`);
      }
    }
    const note = notes.length ? `<p class="tea-chart-note">${app.escapeHtml(notes.join(' · '))}</p>` : '';
    const svg = `<svg class="tea-plot" viewBox="0 0 ${width} ${height}" role="img"><title>Screened purchased-power break-even in dollars per kilowatt-hour</title><line x1="${padL}" y1="${axisY}" x2="${padL + plotW}" y2="${axisY}" stroke="var(--border-light)" stroke-width="1.5"></line><text x="${width - padR}" y="${axisY - 10}" text-anchor="end" fill="var(--text-muted)">$/kWh</text>${ticks}${markers}</svg>`;
    return `<div class="tea-be-chart"${attrs}>${svg}${note}</div>`;
  }

  function paintPowerBreakevenChart(solo, shared, active) {
    const host = document.getElementById('powerBreakevenChart');
    if (!host) return;
    const markup = powerBreakevenChartMarkup(solo, shared, active);
    if (!markup) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.innerHTML = markup;
  }

  function clearPowerBreakevenChart() {
    const host = document.getElementById('powerBreakevenChart');
    if (!host) return;
    host.hidden = true;
    host.innerHTML = '';
  }

  function clearEconomicsFigures() {
    paintCashGate(null);
    const waterfall = document.getElementById('economicsWaterfall');
    if (waterfall) waterfall.innerHTML = teaChartEmpty('Complete the graph to plot the cash gate.');
    const cashflow = document.getElementById('economicsCashflow');
    if (cashflow) cashflow.innerHTML = teaChartEmpty('Complete the graph to plot cash flow.');
    for (const id of ['economicsCapital', 'economicsOps', 'economicsMetrics', 'economicsDcfMetrics']) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    }
  }

  function syncEconomicsDisclosure() {
    const dcf = document.getElementById('economicsDcf');
    if (!dcf) return;
    const open = economicsAcknowledgment();
    if (Boolean(dcf.open) === open) return;
    app.syncingEconomicsDisclosure = true;
    try { dcf.open = open; }
    finally { app.syncingEconomicsDisclosure = false; }
  }

  function powerBreakevenSignatureNow() {
    if (!app.currentEconomics) return '';
    const mode = document.getElementById('powerBreakevenMode')?.value || 'solo';
    const material = document.getElementById('powerBreakevenMaterial')?.value || '';
    return [
      mode,
      material,
      app.currentEconomics.annualNetCash,
      app.currentEconomics.installedCapex,
      app.currentEconomics.annualRevenue,
      app.currentEconomics.annualOperatingCost,
      app.projectEconomics.projectLifeYears,
      app.projectEconomics.discountRate,
      app.graph.nodes.length,
    ].join('|');
  }

  function screenPowerBreakEven() {
    const out = document.getElementById('powerBreakevenResult');
    const show = text => {
      if (!out) return null;
      out.hidden = false;
      out.textContent = text;
      return text;
    };
    try {
      const engine = globalThis.MaterialPowerBreakeven;
      if (!engine?.breakEvenForMaterial || !engine.formatBreakEven) {
        show('Power break-even engine is not loaded.');
        clearPowerBreakevenChart();
        return null;
      }
      if (!app.result || !app.graph.nodes.length) {
        show('Complete the graph before screening purchased-power break-even. Screening only — not a PPA.');
        clearPowerBreakevenChart();
        return null;
      }
      populatePowerBreakevenMaterials();
      const mode = document.getElementById('powerBreakevenMode')?.value || 'solo';
      const materialId = document.getElementById('powerBreakevenMaterial')?.value || '';
      if (!materialId) {
        const unsupported = unsupportedSoldLabels();
        show(unsupported.length
          ? `No product supported by the screening price table (${unsupported.join(', ')}). Screening only — not a PPA.`
          : 'This plant is not selling a product this screen can price. Screening only — not a PPA.');
        clearPowerBreakevenChart();
        return null;
      }
      const screened = engine.breakEvenForMaterial(app.currentCaseDefinition(), app.result, materialId, mode);
      const otherMode = mode === 'shared' ? 'solo' : 'shared';
      let other = null;
      try {
        other = engine.breakEvenForMaterial(app.currentCaseDefinition(), app.result, materialId, otherMode);
      } catch { other = null; }
      const solo = mode === 'solo' ? screened : other;
      const shared = mode === 'shared' ? screened : other;
      show(engine.formatBreakEven(screened));
      paintPowerBreakevenChart(solo, shared, mode);
      return screened;
    } catch (error) {
      show(error?.message || String(error));
      clearPowerBreakevenChart();
      return null;
    } finally {
      app.powerBreakevenSignature = powerBreakevenSignatureNow();
    }
  }

  function refreshPowerBreakevenReadout() {
    if (!app.currentEconomics) return;
    if (powerBreakevenSignatureNow() === app.powerBreakevenSignature) return;
    screenPowerBreakEven();
  }

  function renderEconomics() {
    const status = document.getElementById('economicsStatus');
    const banner = document.getElementById('economicsBanner');
    document.getElementById('projectLifeYears').value = app.projectEconomics.projectLifeYears;
    document.getElementById('discountRate').value = app.projectEconomics.discountRate * 100;
    populatePowerBreakevenMaterials();
    paintAssumptionReadouts();
    syncEconomicsDisclosure();
    if (!app.currentEconomics) {
      status.textContent = app.result ? `Economics unavailable: ${app.solveError}` : 'Complete the graph to calculate viability.';
      if (banner) banner.hidden = true;
      clearEconomicsFigures();
      app.powerBreakevenSignature = '';
      const breakeven = document.getElementById('powerBreakevenResult');
      if (breakeven) {
        breakeven.hidden = true;
        breakeven.textContent = '';
      }
      clearPowerBreakevenChart();
      return;
    }
    const moneyQuality = app.classifyQuality({ kind: 'money' });
    const productQuality = app.classifyQuality({ kind: 'product-cost' });
    const gate = economicsGateReasons();
    const showBankable = !gate.length || economicsAcknowledgment();
    if (banner) {
      banner.hidden = !gate.length;
      banner.textContent = gate.length
        ? `Screening — not bankable (${gate.join('; ')}). Open “Show NPV/IRR (screening)” for DCF.`
        : '';
    }
    status.textContent = `${app.currentEconomics.periodDays} operating days/year · screening. Annual net cash is R − OPEX − ann. CAPEX. NPV/IRR are DCF and stay in the disclosure.`;
    paintCashGate(app.currentEconomics, moneyQuality);
    const waterfall = document.getElementById('economicsWaterfall');
    if (waterfall) waterfall.innerHTML = economicsWaterfallMarkup(app.currentEconomics, moneyQuality);
    const cashflow = document.getElementById('economicsCashflow');
    if (cashflow) cashflow.innerHTML = economicsCashflowMarkup(app.currentEconomics, moneyQuality);
    const capital = document.getElementById('economicsCapital');
    if (capital) {
      capital.innerHTML = app.metricRows([
        ['Installed CAPEX', app.formatUncertainMoney(app.currentEconomics.installedCapex, moneyQuality), { quality: moneyQuality }],
        ['Annualized CAPEX', app.formatUncertainMoney(app.currentEconomics.annualizedCapex, moneyQuality), { quality: moneyQuality }],
      ]);
    }
    const ops = document.getElementById('economicsOps');
    if (ops) {
      const operating = Number(app.currentEconomics.annualOperatingCash);
      const freight = Number(app.currentEconomics.breakdown?.freight) || 0;
      const opsRows = [
        ['Revenue<small>per year</small>', app.formatUncertainMoney(app.currentEconomics.annualRevenue, moneyQuality), { quality: moneyQuality }],
        ['OPEX<small>per year</small>', app.formatUncertainMoney(app.currentEconomics.annualOperatingCost, moneyQuality), { quality: moneyQuality }],
      ];
      if (freight > 0) {
        opsRows.push(['Freight<small>per year</small>', app.formatUncertainMoney(freight, moneyQuality), { quality: moneyQuality }]);
      }
      opsRows.push(['Operating cash<small>R − OPEX</small>', app.formatUncertainMoney(operating, moneyQuality), { quality: moneyQuality, tone: operating < 0 ? 'negative' : operating > 0 ? 'positive' : '' }]);
      ops.innerHTML = app.metricRows(opsRows);
    }
    const metrics = document.getElementById('economicsMetrics');
    if (metrics) {
      const productRows = [
        ['Levelized delivered cost', app.currentEconomics.levelizedDeliveredCost == null ? '—' : `${app.formatUncertainMoney(app.currentEconomics.levelizedDeliveredCost, productQuality)}/unit`, { quality: productQuality }],
        ...(app.currentEconomics.sinks || []).filter(sink => sink.disposition === 'sale' && sink.deliveredAmount > 0).map(sink => (
          [`Sold ${sink.id}`, `${app.formatUncertainNumber(sink.deliveredAmount / 1000, productQuality)} t/year`, { quality: productQuality }]
        )),
      ];
      metrics.innerHTML = app.metricRows(productRows);
    }
    const dcf = document.getElementById('economicsDcfMetrics');
    if (dcf) {
      dcf.innerHTML = app.metricRows(showBankable ? [
        ['NPV', app.formatUncertainMoney(app.currentEconomics.npv, moneyQuality), { quality: moneyQuality }],
        ['IRR', app.formatRate(app.currentEconomics.irr), { quality: moneyQuality }],
      ] : [
        ['NPV', 'Hidden until this disclosure is open', { quality: moneyQuality }],
        ['IRR', 'Hidden until this disclosure is open', { quality: moneyQuality }],
      ]);
    }
    refreshPowerBreakevenReadout();
  }
  function economicsRows(current) {
    const params = current.params || {};
    const definition = app.catalog[current.unit] || {};
    const moneyQuality = app.classifyQuality({ kind: 'money' });
    if (current.unit === 'grid-electricity') return [
      ['Electricity price', `${app.formatUncertainMoney(params.pricePerMWh, moneyQuality)}/MWh`, { quality: moneyQuality }],
      ['Annual energy bill', app.formatUncertainMoney(current.rate * 365 / 1000 * params.pricePerMWh, moneyQuality), { quality: moneyQuality }],
      ['Annual operational CO₂', `${app.formatUncertainNumber(current.rate * 365 / 1000 * params.kgCO2PerMWh, moneyQuality)} kg`, { quality: moneyQuality }],
    ];
    if (['battery', 'thermal-storage'].includes(current.unit)) return [
      ['Installed storage CAPEX', app.formatUncertainMoney(current.capacity * params.capexPerKWh, moneyQuality), { quality: moneyQuality }],
      ['Conversion loss', `${app.formatNumber((1 - params.efficiency) * 100)}%`],
    ];
    if (current.unit === 'material-buffer') {
      const econ = current.economics || {};
      const kg = Number(params.capacityKg ?? current.capacity) || 0;
      const perM3 = Number(econ.capexPerM3 ?? params.capexPerM3) || 500;
      const installed = Number(econ.installedCapex);
      const capex = Number.isFinite(installed) ? installed : kg * (Number(params.capexPerKg) || 0.5);
      const fluid = econ.fluidLabel || params.fluidClass || 'generic';
      return [
        ['Installed tank CAPEX', app.formatUncertainMoney(capex, moneyQuality), { quality: moneyQuality }],
        ['Fluid / intensity', `${app.escapeHtml(String(fluid))} · $${app.formatNumber(perM3)}/m³`, { quality: moneyQuality }],
      ];
    }
    if (current.unit === 'intake-pump' || current.unit === 'gas-blower') {
      const econ = current.economics || {};
      const rate = Number(econ.capexRate ?? econ.capexIntensity) || 0;
      const installed = econ.installedCapex != null ? Number(econ.installedCapex) : rate * (Number(current.capacity) || 0);
      const unitLabel = current.unit === 'intake-pump' ? '$/(m³/day)' : '$/(Nm³/day)';
      return [
        ['Installed lift CAPEX', app.formatUncertainMoney(installed, moneyQuality), { quality: moneyQuality }],
        ['CAPEX intensity', `$${app.formatNumber(rate)}${unitLabel}`, { quality: moneyQuality }],
      ];
    }
    if (!Number.isFinite(params.capacityKW) || !Number.isFinite(params.capexPerKW)) return [];
    const annualEnergy = current.rate * 365;
    const rate = Number(params.discountRate ?? 0.07);
    const years = Number(params.lifeYears ?? 30);
    const crf = rate === 0 ? 1 / years : rate * (1 + rate) ** years / ((1 + rate) ** years - 1);
    const capex = params.capacityKW * params.capexPerKW;
    const annualCost = capex * crf + params.capacityKW * Number(params.fixedOMPerKWYear || 0);
    const levelized = annualEnergy ? annualCost / (annualEnergy / 1000) + Number(params.variableCostPerMWh || 0) : 0;
    const lcoeKind = current.unit === 'solar-thermal' ? 'lcoh' : 'lcoe';
    const lcoeQuality = app.classifyQuality({
      kind: lcoeKind,
      unit: current.unit,
      sourceNote: definition.sourceNote,
      references: definition.references,
      economicsNote: definition.economicsNote,
    });
    const intensityQuality = app.classifyQuality({
      kind: 'intensity',
      unit: current.unit,
      sourceNote: definition.sourceNote,
      references: definition.references,
    });
    const lcoeCites = lcoeQuality === 'cited' ? definition.references : [];
    return [
      ['Installed CAPEX', app.formatUncertainMoney(capex, moneyQuality), { quality: moneyQuality }],
      [
        current.unit === 'solar-thermal' ? 'Simple LCOH' : 'Simple LCOE',
        `${app.formatUncertainMoney(levelized, lcoeQuality)}/MWh`,
        { quality: lcoeQuality, references: lcoeCites },
      ],
      current.unit === 'solar-pv'
        ? ['Capacity factor', app.formatUncertainNumber(params.capacityFactor, intensityQuality), { quality: intensityQuality, references: intensityQuality === 'cited' ? definition.references : [] }]
        : null,
    ].filter(Boolean);
  }
})();
