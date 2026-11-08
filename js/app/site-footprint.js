// Site footprint diagram/map chrome and site panel rendering.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    bindFootprintTooltip, currentSiteFootprint, draftSiteLabel, focusFootprintPad, footprintColor,
    footprintPopupHtml, formatHa, refreshFootprintLabels, renderOverviewFootprint, renderSite,
    renderSiteTruth, syncFootprintMapChrome,
  });

  function footprintColor(unit, { cssVar = true } = {}) {
    const hex = {
      electrolyzer: '#5b8def',
      dac: '#6ba177',
      'dac-solid': '#6ba177',
      'dac-liquid': '#4f8f6a',
      'dac-electroswing': '#7bb38a',
      sabatier: '#c4a35a',
      methanol: '#b8924a',
      swro: '#5aa6c7',
      med: '#4f97b8',
      msf: '#4588a8',
      desal: '#5aa6c7',
      'brine-minerals': '#d4a017',
      asu: '#7a8fa3',
      ammonia: '#6b7f9a',
      urea: '#7a8aa0',
      mto: '#b8924a',
      'ft-liquids': '#a67c3a',
      battery: '#8a8f98',
      'solar-pv': '#c9a227',
      total: '#7a8fa3',
    };
    if (!cssVar) return hex[unit] || '#9aa3ad';
    return {
      electrolyzer: 'var(--h2)',
      dac: 'var(--co2)',
      'dac-solid': 'var(--co2)',
      'dac-liquid': 'var(--co2)',
      'dac-electroswing': 'var(--co2)',
      sabatier: 'var(--methane)',
      methanol: 'var(--methane)',
      swro: 'var(--electric)',
      med: 'var(--electric)',
      msf: 'var(--electric)',
      desal: 'var(--electric)',
      'brine-minerals': 'var(--warning)',
      asu: 'var(--h2)',
      ammonia: 'var(--h2)',
      urea: 'var(--h2)',
      mto: 'var(--methane)',
      'ft-liquids': 'var(--methane)',
      battery: 'var(--text-muted)',
      'solar-pv': 'var(--warning)',
    }[unit] || 'var(--border-light)';
  }

  function footprintPopupHtml(block) {
    const area = Number(block.areaM2) || 0;
    const areaText = area >= 10000 ? `${(area / 10000).toLocaleString('en-US', { maximumFractionDigits: 2 })} ha` : `${Math.round(area).toLocaleString('en-US')} m²`;
    const quality = block.quality ? ` · ${block.quality}` : '';
    const cites = (block.evidence || [])
      .filter(item => item?.url)
      .map(item => `<div><a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.label || item.url}</a></div>`)
      .join('');
    return `<strong>${block.label || block.id}</strong><br>${areaText}${quality}${cites ? `<div class="map-popup-cites">${cites}</div>` : ''}`;
  }

  function formatHa(ha) {
    const value = Number(ha) || 0;
    if (value >= 1) return `${app.formatNumber(value)} ha`;
    if (value >= 0.001) return `${value.toLocaleString('en-US', { maximumFractionDigits: 3 })} ha`;
    if (value > 0) return `${app.formatNumber(value * 10000)} m²`;
    return '0 ha';
  }

  function currentSiteFootprint() {
    if (!app.site || typeof FlowsheetFootprint === 'undefined') return null;
    return FlowsheetFootprint.estimateFootprint({ site: app.site, graph: app.graph, solved: app.result });
  }

  function campusWaterCue(footprint) {
    const units = new Set((footprint?.processes || []).map(item => item?.unit).filter(Boolean));
    if (units.has('brine-minerals')) return { kind: 'brine' };
    if (units.has('swro') || units.has('desal') || units.has('med') || units.has('msf')) {
      return { kind: app.site?.rights?.seawaterDischarge?.authorize ? 'discharge' : 'intake' };
    }
    if (app.site?.rights?.freshwater?.authorize || app.site?.resources?.freshwater?.authorize) return { kind: 'freshwater' };
    return null;
  }

  function footprintDiagramFor(footprint, size) {
    const project = app.MapSite?.projectCampusDiagramIso || app.MapSite?.projectCampusDiagram;
    if (!footprint || !(footprint.totalAreaM2 > 0) || !app.MapSite?.layoutFootprintCampus || !project) return null;
    const latitude = Number(app.site?.latitude);
    const longitude = Number(app.site?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const blocks = app.MapSite.layoutFootprintCampus({
      latitude,
      longitude,
      solar: footprint.solar,
      processes: footprint.processes,
      totalHa: footprint.totalHa,
    });
    if (!blocks.length) return null;
    const waterCue = campusWaterCue(footprint);
    return project(blocks, { latitude, longitude }, { ...size, waterCue });
  }

  function campusDiagramMarkup(diagram, { labels = true, interactive = false } = {}) {
    if (!diagram?.shapes?.length) return '';
    const isIso = diagram.mode === 'iso';
    const ptsAttr = points => points.map(point => point.join(',')).join(' ');
    const layers = [];
    const texts = [];

    if (isIso && Array.isArray(diagram.links)) {
      for (const link of diagram.links) {
        if (!link?.points?.length) continue;
        const d = link.points.map((point, index) => `${index ? 'L' : 'M'}${point[0]} ${point[1]}`).join(' ');
        const cls = link.kind === 'power' ? 'campus-utility' : 'campus-road';
        layers.push(`<path class="${cls}" d="${d}" fill="none"></path>`);
      }
    }

    if (isIso && Array.isArray(diagram.cues)) {
      for (const cue of diagram.cues) {
        if (cue?.pipe?.length >= 2) {
          const d = cue.pipe.map((point, index) => `${index ? 'L' : 'M'}${point[0]} ${point[1]}`).join(' ');
          layers.push(`<path class="campus-water-pipe" d="${d}" fill="none"></path>`);
        }
        if (cue?.points?.length) {
          layers.push(`<polygon class="campus-water campus-water-${app.escapeHtml(cue.kind || 'intake')}" points="${ptsAttr(cue.points)}"></polygon>`);
          if (labels && cue.label) {
            const xs = cue.points.map(p => p[0]);
            const ys = cue.points.map(p => p[1]);
            const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
            const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
            texts.push(`<text class="footprint-cue-label" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${app.escapeHtml(cue.label)}</text>`);
          }
        }
      }
    }

    const shapes = diagram.shapes.slice().sort((left, right) => {
      if (isIso) {
        // Outline under pads; then far→near by depth.
        if (left.kind === 'outline' && right.kind !== 'outline') return -1;
        if (right.kind === 'outline' && left.kind !== 'outline') return 1;
        return (right.depth ?? 0) - (left.depth ?? 0);
      }
      const rank = { outline: 0, solar: 1, process: 2 };
      return (rank[left.kind] ?? 1) - (rank[right.kind] ?? 1);
    });

    for (const shape of shapes) {
      const isOutline = shape.kind === 'outline';
      const fill = footprintColor(shape.unit, { cssVar: false });
      const haText = formatHa((Number(shape.areaM2) || 0) / 10000);
      const title = `${shape.label || shape.id || 'Pad'} · ${haText}`;
      const padAttr = interactive && !isOutline && shape.id
        ? ` data-footprint-pad="${app.escapeHtml(shape.id)}" tabindex="0"`
        : '';

      if (isIso && shape.faces) {
        const parts = [];
        parts.push(`<title>${app.escapeHtml(title)}</title>`);
        if (isOutline) {
          parts.push(`<polygon class="pad-outline" points="${ptsAttr(shape.faces.top || shape.points)}" fill="${fill}" fill-opacity="0.1" stroke="#d7e2ee" stroke-width="1.2" stroke-dasharray="5 3"></polygon>`);
        } else {
          if (shape.faces.east) {
            parts.push(`<polygon class="pad-east" points="${ptsAttr(shape.faces.east)}" fill="${fill}" fill-opacity="0.55" stroke="#0c1117" stroke-width="0.9"></polygon>`);
          }
          if (shape.faces.south) {
            parts.push(`<polygon class="pad-south" points="${ptsAttr(shape.faces.south)}" fill="${fill}" fill-opacity="0.72" stroke="#0c1117" stroke-width="0.9"></polygon>`);
          }
          const topOpacity = shape.kind === 'solar' ? 0.78 : 0.92;
          parts.push(`<polygon class="pad-top pad-${app.escapeHtml(shape.kind || 'process')}" points="${ptsAttr(shape.faces.top || shape.points)}" fill="${fill}" fill-opacity="${topOpacity}" stroke="#0c1117" stroke-width="1.05"></polygon>`);
          for (const segment of shape.hatch || []) {
            if (!segment?.[0] || !segment?.[1]) continue;
            const cls = shape.kind === 'solar' ? 'pad-solar-hatch' : 'pad-shed-ridge';
            parts.push(`<line class="${cls}" x1="${segment[0][0]}" y1="${segment[0][1]}" x2="${segment[1][0]}" y2="${segment[1][1]}"></line>`);
          }
        }
        layers.push(`<g class="campus-pad"${padAttr}>${parts.join('')}</g>`);
      } else {
        const pts = ptsAttr(shape.points);
        const opacity = isOutline ? 0.14 : shape.kind === 'solar' ? 0.62 : 0.84;
        const stroke = isOutline ? '#d7e2ee' : '#0c1117';
        const weight = isOutline ? 1.4 : 1.1;
        const dash = isOutline ? ' stroke-dasharray="5 3"' : '';
        layers.push(
          `<g${padAttr}><title>${app.escapeHtml(title)}</title><polygon points="${pts}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${weight}"${dash}></polygon></g>`
        );
      }

      if (!labels) continue;
      if (isOutline && shape.box.h >= 28) {
        texts.push(`<text class="footprint-ha" x="${shape.box.cx}" y="${(shape.box.minY + 13).toFixed(1)}" text-anchor="middle">${app.escapeHtml(haText)}</text>`);
      } else if (!isOutline && shape.box.w >= 34 && shape.box.h >= 14) {
        const raw = String(shape.label || '');
        const name = raw.length > 18 ? `${raw.slice(0, 16)}…` : raw;
        if (name) {
          const y = isIso ? (shape.box.cy - (shape.kind === 'solar' ? 2 : 0)) : shape.box.cy;
          texts.push(`<text class="footprint-pad-name" x="${shape.box.cx}" y="${y}" text-anchor="middle" dominant-baseline="middle">${app.escapeHtml(name)}</text>`);
        }
        if (isIso && shape.kind === 'solar' && shape.box.h >= 22) {
          texts.push(`<text class="footprint-ha" x="${shape.box.cx}" y="${(shape.box.cy + 11).toFixed(1)}" text-anchor="middle">${app.escapeHtml(haText)}</text>`);
        }
      }
    }
    return `${layers.join('')}${texts.join('')}`;
  }

  function footprintLegendMarkup(footprint) {
    const items = [];
    if (footprint.solar?.landAreaM2 > 0) {
      items.push({ id: 'solar', unit: 'solar-pv', label: 'Solar field', detail: formatHa(footprint.solar.ha) });
    }
    for (const item of footprint.processes || []) {
      const quality = item.quality && item.quality !== 'cited' ? ` · ${item.quality}` : '';
      items.push({
        id: item.id,
        unit: item.unit,
        label: item.label,
        detail: `${app.formatNumber(item.areaM2)} m²${quality}`,
      });
    }
    if (!items.length) return '<li class="pad-legend-empty">Add blocks to size pads</li>';
    const rows = items.map(item => (
      `<li><button type="button" class="pad-legend" data-footprint-pad="${app.escapeHtml(item.id)}"><span class="pad-swatch" style="background:${footprintColor(item.unit)}"></span>${app.escapeHtml(item.label)} · ${app.escapeHtml(item.detail)}</button></li>`
    )).join('');
    if (!footprint.processes?.length) {
      return `${rows}<li class="pad-legend-empty">Add blocks to size pads</li>`;
    }
    return rows;
  }

  function syncFootprintMapChrome(footprint) {
    const haEl = document.getElementById('siteMapHa');
    const emptyEl = document.getElementById('siteMapFootprintEmpty');
    const enabled = !!app.siteMapEnabled.footprint;
    const hasArea = !!(footprint && footprint.totalAreaM2 > 0);
    if (haEl) {
      haEl.hidden = !(enabled && hasArea);
      haEl.textContent = enabled && hasArea ? formatHa(footprint.totalHa) : '';
    }
    if (emptyEl) {
      emptyEl.hidden = !(enabled && !hasArea);
      emptyEl.textContent = 'Add blocks to size pads';
    }
  }

  function bindFootprintTooltip(poly, block) {
    if (typeof poly?.bindTooltip !== 'function' || !block) return;
    const isOutline = block.kind === 'outline';
    const text = isOutline
      ? formatHa((Number(block.areaM2) || 0) / 10000)
      : (block.label || block.id || '');
    if (!text) return;
    const coords = app.readMapCoordinates();
    const zoom = app.siteMap?.getZoom?.();
    const visible = app.MapSite?.footprintLabelVisible
      ? app.MapSite.footprintLabelVisible({ areaM2: block.areaM2, latitude: coords?.latitude, zoom })
      : false;
    let offset = [0, 0];
    if (isOutline && visible && Number.isFinite(zoom)) {
      const latitude = Number(coords?.latitude) || 0;
      const metersPerPixel = 156543.03392 * Math.cos(latitude * Math.PI / 180) / (2 ** zoom);
      const radiusPx = Math.sqrt((Number(block.areaM2) || 0) / Math.PI) / metersPerPixel;
      offset = [0, -Math.max(14, Math.min(radiusPx * 0.72, 96))];
    }
    try { poly.unbindTooltip?.(); } catch { /* no tooltip yet */ }
    poly.bindTooltip(text, {
      permanent: visible,
      direction: 'center',
      offset,
      className: isOutline ? 'footprint-map-ha' : 'footprint-map-label',
      opacity: 1,
    });
  }

  function refreshFootprintLabels() {
    for (const poly of Object.values(app.siteMapFootprintById)) {
      if (poly?.__footprintBlock) bindFootprintTooltip(poly, poly.__footprintBlock);
    }
  }

  function focusFootprintPad(id) {
    if (!id || !app.siteMap) return false;
    const layer = app.siteMapFootprintById[id];
    if (!layer || typeof layer.openPopup !== 'function') return false;
    try {
      if (app.activeTab !== 'location') app.activateTab('location');
      const bounds = typeof layer.getBounds === 'function' ? layer.getBounds() : null;
      if (bounds && typeof app.siteMap.fitBounds === 'function') {
        app.siteMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: false });
      }
      layer.openPopup();
      app.siteMapMarker?.bringToFront?.();
      return true;
    } catch {
      return false;
    }
  }

  function renderOverviewFootprint() {
    const wrap = document.getElementById('overviewFootprint');
    const svg = document.getElementById('overviewFootprintSvg');
    const ha = document.getElementById('overviewFootprintHa');
    if (!wrap) return;
    const footprint = currentSiteFootprint();
    const hasArea = !!(app.site && app.graph.nodes.length && footprint && footprint.totalAreaM2 > 0);
    wrap.hidden = !hasArea;
    if (!hasArea) {
      if (svg) svg.innerHTML = '';
      if (ha) ha.textContent = '';
      return;
    }
    if (ha) ha.textContent = formatHa(footprint.totalHa);
    const diagram = footprintDiagramFor(footprint, { width: 160, height: 96, pad: 4 });
    if (svg) {
      if (diagram?.viewBox) svg.setAttribute('viewBox', diagram.viewBox);
      svg.classList.toggle('is-iso', diagram?.mode === 'iso');
      svg.innerHTML = diagram ? campusDiagramMarkup(diagram, { labels: false, interactive: false }) : '';
    }
  }

  function renderSiteFootprint() {
    const panel = document.getElementById('siteFootprint');
    const metrics = document.getElementById('siteFootprintMetrics');
    const pads = document.getElementById('siteFootprintPads');
    const note = document.getElementById('siteFootprintNote');
    const svg = document.getElementById('siteFootprintSvg');
    const empty = document.getElementById('siteFootprintEmpty');
    const total = document.getElementById('siteFootprintTotal');
    if (!panel) return;
    panel.hidden = false;
    const footprint = currentSiteFootprint();
    const hasArea = !!(footprint && footprint.totalAreaM2 > 0);
    if (empty) {
      empty.hidden = hasArea;
      empty.textContent = 'Add blocks to size pads';
    }
    if (total) total.textContent = hasArea ? formatHa(footprint.totalHa) : '';
    if (!hasArea) {
      if (svg) {
        svg.hidden = true;
        svg.innerHTML = '';
      }
      if (metrics) metrics.innerHTML = '';
      if (pads) pads.innerHTML = '';
      if (note) note.textContent = '';
      syncFootprintMapChrome(footprint);
      return;
    }
    const diagram = footprintDiagramFor(footprint, { width: 320, height: 200, pad: 16 });
    if (svg) {
      svg.hidden = false;
      if (diagram?.viewBox) svg.setAttribute('viewBox', diagram.viewBox);
      svg.classList.toggle('is-iso', diagram?.mode === 'iso');
      svg.innerHTML = diagram ? campusDiagramMarkup(diagram, { labels: true, interactive: true }) : '';
    }
    if (metrics) {
      const landQuality = app.classifyQuality({ kind: 'land' });
      const padQuality = app.classifyQuality({ kind: 'intensity', sourceNote: footprint.processes.some(item => item.quality === 'cited') ? 'cited pad intensities' : 'order-of-magnitude screening' });
      metrics.innerHTML = app.metricRows([
        ['Solar land', `${app.formatUncertainHa(footprint.solar.ha)} · ${app.formatUncertainNumber(footprint.solar.acres, landQuality)} acres`, { quality: landQuality }],
        ['GCR', `${app.formatUncertainNumber(footprint.solar.gcr * 100, landQuality)}% (base ${app.formatUncertainNumber(footprint.solar.baseGcr * 100, landQuality)}%)`, { quality: landQuality }],
        ['Panel area', `${app.formatUncertainNumber(footprint.solar.panelAreaM2, landQuality)} m²`, { quality: landQuality }],
        ['Process pads', `${app.formatUncertainNumber(footprint.processAreaM2, padQuality)} m²`, { quality: padQuality }],
        ['Total', `${app.formatUncertainHa(footprint.totalHa)} · ${app.formatUncertainNumber(footprint.totalAcres, landQuality)} acres`, { quality: landQuality }],
      ]);
    }
    if (pads) pads.innerHTML = footprintLegendMarkup(footprint);
    if (note) {
      note.textContent = 'Process pads use cited or screening intensities × activity (not surveyed layouts). Solar = panel area ÷ GCR.';
    }
    syncFootprintMapChrome(footprint);
  }

  function draftSiteLabel() {
    const lat = document.getElementById('siteLatitude')?.value;
    const lon = document.getElementById('siteLongitude')?.value;
    if (lat !== undefined && lat !== '' && lon !== undefined && lon !== '') {
      return `Draft site · ${lat}, ${lon}`;
    }
    return 'Choose a site';
  }

  function renderSite() {
    const panel = document.getElementById('sitePanel');
    panel.hidden = false;
    document.getElementById('siteName').textContent = app.site?.name || draftSiteLabel();
    document.getElementById('siteNotes').textContent = app.site?.notes || '';
    const presetSelect = document.getElementById('sitePreset');
    if (presetSelect && app.sitePresets().length) {
      const match = app.matchingPresetId();
      if (presetSelect.value !== match) presetSelect.value = match;
    }
    document.getElementById('siteLatitude').value = app.site?.latitude ?? 31.35;
    document.getElementById('siteLongitude').value = app.site?.longitude ?? 84.05;
    const kWpInput = document.getElementById('siteSolarKWp');
    const kWpFull = app.site?.solarKWp ?? 37.5;
    kWpInput.value = app.formatDisplayNumber(kWpFull, 2);
    kWpInput.title = `${kWpFull} kWp`;
    kWpInput.dataset.fullKwp = String(kWpFull);
    document.getElementById('siteBatteryKWh').value = app.site?.storage?.batteryKWh ?? 0;
    const monthLabel = document.getElementById('siteMonthLabel');
    const monthSelect = document.getElementById('siteMonth');
    if (app.site?.solar?.typicalMonths || Array.isArray(app.site?.meteo?.monthlyPVKWhPerKWp)) {
      monthLabel.hidden = false;
      monthSelect.innerHTML = app.SITE_MONTHS.map((label, index) => `<option value="${index}"${index === (app.site.month || 0) ? ' selected' : ''}>${label}</option>`).join('');
    } else {
      monthLabel.hidden = true;
    }
    const hours = app.result?.horizon?.hours;
    document.getElementById('siteHorizon').textContent = hours
      ? `${hours.filter(entry => entry.pv > 0).length} daylight hours · ${hours.filter(entry => entry.pv === 0).length} night hours · peak ${app.formatNumber(Math.max(...hours.map(entry => entry.pv)))} kWh PV · battery ${app.formatNumber(app.site?.storage?.batteryKWh || 0)} kWh`
      : '';
    renderSiteFootprint();
    renderSiteTruth();
    app.renderSiteMap();
    document.getElementById('siteResources').innerHTML = Object.entries(app.site?.resources || {}).map(([id, resource]) => {
      const quality = resource.quality || 'user-assumption';
      const chip = quality === 'unverified'
        ? app.rightsChip('unverified')
        : app.qualityChip({ quality, sourceNote: resource.evidence });
      return `<div class="${quality === 'unverified' ? 'unverified' : ''}"><dt>${id}${chip}</dt><dd>${app.formatStream(resource.stream)}</dd></div>`;
    }).join('');
    document.getElementById('siteEvidence').innerHTML = (app.site?.evidence || []).map(item => (
      item.url ? `<a href="${item.url}" target="_blank" rel="noreferrer">${item.label}</a>` : item.label
    )).join(' · ');
    const sizeText = (() => {
      if (!app.lastSizing) return null;
      const heatNote = app.lastSizing.heatCoveredKWh != null || app.lastSizing.heatResidualKWh != null
        ? ` · heat covered ${app.formatNumber(app.lastSizing.heatCoveredKWh || 0)} / residual ${app.formatNumber(app.lastSizing.heatResidualKWh || 0)} kWh`
        : '';
      if (app.lastSizing.mode === 'positive-cashflow') {
        const obj = app.lastSizing.objective || {};
        const selected = app.lastSizing.selected || {};
        const slate = selected.slateMode || selected.product || 'slate';
        const scale = selected.scale != null ? ` · scale ${selected.scale}×` : (selected.rate != null ? ` · ${selected.rate} kg/day` : '');
        const metNote = obj.met && !app.balancesNeedAttention() ? '' : ' · objective not met';
        return `${obj.activeSaleCount ?? obj.positiveSaleCount ?? 0} positive-sale products · net cash ${app.formatCashflowMoney(obj.annualNetCash)} · ${slate}${scale}${heatNote}${metNote}`;
      }
      const iters = app.lastSizing.iterations;
      const capNote = app.lastSizing.history?.some(step => step.capped) ? ' · cap-limited' : '';
      const convergeNote = app.lastSizing.converged ? '' : ' · not converged';
      const unverified = (app.lastSizing.warnings || app.lastSizing.solved?.warnings || [])
        .filter(message => String(message).includes('unverified site right'));
      const rightsNote = unverified.length
        ? ` · ${unverified.length} unverified site right${unverified.length === 1 ? '' : 's'}`
        : '';
      const product = app.SIZE_PRODUCT_LABELS[app.lastSizing.product] || app.lastSizing.product || 'CH₄';
      return `${product} · ${iters} iteration${iters === 1 ? '' : 's'} · residual ${app.formatSizingResidual(app.lastSizing.residual)}${heatNote}${capNote}${convergeNote}${rightsNote}`;
    })();
    const sizeStatus = document.getElementById('sizeToTargetStatus');
    if (sizeStatus) sizeStatus.textContent = sizeText || 'Single-product physics tool.';
  }

  function renderSiteTruth() {
    const meteoEl = document.getElementById('siteMeteo');
    const assayEl = document.getElementById('siteAssay');
    const rightsEl = document.getElementById('siteRights');
    if (meteoEl) {
      const meteo = app.site?.meteo;
      if (!meteo) meteoEl.innerHTML = '';
      else {
        const quality = app.classifyQuality({
          kind: 'meteo',
          quality: meteo.quality,
          sourceNote: meteo.cite?.label || meteo.source,
        });
        const daily = Number(meteo.dailyPVKWhPerKWp ?? app.site.dailyPVKWhPerKWp);
        meteoEl.innerHTML = `<strong>Meteo</strong> ${app.formatUncertainNumber(daily, quality)} kWh/kWp·day ${app.qualityChip(quality)}${app.citeMarkup(app.citeFrom(meteo.cite))}`;
      }
      const meteoDetails = meteoEl.closest?.('details');
      if (meteoDetails) meteoDetails.hidden = !meteoEl.innerHTML;
    }
    if (assayEl) {
      const assay = app.site?.assay;
      if (!assay) assayEl.innerHTML = '';
      else {
        const quality = app.classifyQuality({
          kind: 'assay',
          quality: assay.quality,
          sourceNote: assay.summary,
        });
        const summary = assay.summary || assay.kind || '';
        const shown = app.roundTaggedQuantities(summary);
        const tip = shown === summary ? '' : ` title="${app.escapeHtml(summary)}"`;
        assayEl.innerHTML = `<strong>Assay</strong> <span${tip}>${app.escapeHtml(shown)}</span> ${app.qualityChip(quality)}${app.citeMarkup(app.citeFrom(assay.evidence))}`;
      }
      const assayDetails = assayEl.closest?.('details');
      if (assayDetails) assayDetails.hidden = !assayEl.innerHTML;
    }
    if (rightsEl) {
      const rights = app.site?.rights;
      if (!rights) rightsEl.innerHTML = '';
      else {
        const keys = app.RIGHT_KEYS || Object.keys(rights);
        rightsEl.innerHTML = keys.map(key => {
          const right = rights[key];
          if (!right) return '';
          const cites = app.citeFrom(right.evidence);
          const title = right.note ? ` title="${right.note.replace(/"/g, '&quot;')}"` : '';
          const kind = right.kind || app.RIGHT_KINDS?.[key] || '';
          const kindMark = kind ? `<span class="rights-kind">${kind}</span>` : '';
          const label = app.RIGHT_DISPLAY_LABELS[key] || key;
          const cause = app.highlightRightKey === key ? ' is-cause' : '';
          return `<span class="rights-item${cause}" data-right="${app.escapeHtml(key)}"${title}>${app.escapeHtml(label)}${kindMark}${app.rightsChip(right.status)}${app.citeMarkup(cites)}</span>`;
        }).join('');
      }
      const rightsDetails = rightsEl.closest?.('details');
      if (rightsDetails) rightsDetails.hidden = !rightsEl.innerHTML;
    }
  }
})();
