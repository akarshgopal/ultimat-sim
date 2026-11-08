// Process canvas rendering: gauges, building bodies, nodes, status.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    bottlenecksFor, buildingProfile, formatCompactEnergy, formatCompactMass, limitingPort,
    nodeHeight, renderGraph, renderStatus,
  });

  function finiteSeries(values) {
    if (!Array.isArray(values) || !values.length) return null;
    const nums = values.map(Number);
    if (nums.some(value => !Number.isFinite(value))) return null;
    return nums;
  }

  function formatCompactMass(kg) {
    const n = Number(kg);
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n) >= 1000) return `${app.formatNumber(n / 1000)} t/d`;
    return `${app.formatNumber(n)} kg/d`;
  }

  function formatCompactEnergy(kWh, heat) {
    const n = Number(kWh);
    if (!Number.isFinite(n)) return null;
    const mark = heat ? 'ₜₕ' : '';
    if (Math.abs(n) >= 1000) return `${app.formatNumber(n / 1000)} MWh${mark}/d`;
    return `${app.formatNumber(n)} kWh${mark}/d`;
  }

  function formatEdgeRate(stream) {
    if (!stream) return null;
    if (stream.kind === 'material') return formatCompactMass(FlowsheetModel.streamMassKg(stream));
    if (stream.kind === 'consumable') {
      const unit = stream.unit === 'kg/day' ? 'kg/d' : (stream.unit || '');
      return `${app.formatNumber(stream.amount)} ${unit}`.trim();
    }
    if (stream.kind === 'heat') return formatCompactEnergy(stream.kWh, true);
    if (stream.kind === 'electricity') return formatCompactEnergy(stream.kWh, false);
    return null;
  }

  function streamIsFlowing(stream) {
    if (!stream) return false;
    if (stream.kind === 'material') return FlowsheetModel.streamMassKg(stream) > 1e-9;
    if (stream.kind === 'consumable') return Number(stream.amount) > 1e-9;
    if (stream.kind === 'heat' || stream.kind === 'electricity') return Number(stream.kWh) > 1e-9;
    return false;
  }

  function utilizationRatio(current, nodeResult) {
    const capacity = Number(current.capacity);
    const activity = Number(nodeResult?.activity);
    if (!(capacity > 0) || !Number.isFinite(activity)) return null;
    return activity / capacity;
  }

  function ratioGauge(fraction, title, tone) {
    if (!Number.isFinite(fraction)) return null;
    const clamped = Math.max(0, Math.min(1, fraction));
    return { type: 'bar', fraction: clamped, read: `${app.formatNumber(clamped * 100)}%`, title, tone };
  }

  function monthlyYieldGauge(current) {
    const solarBacked = current.unit === 'solar-pv'
      || (current.unit === 'electricity-source' && current.siteResource === 'electricity');
    if (!solarBacked) return null;
    const raw = finiteSeries(app.site?.meteo?.monthlyPVKWhPerKWp || app.site?.solar?.monthlyPVKWhPerKWp);
    if (!raw) return null;
    const months = raw.length >= 13 ? raw.slice(1, 13) : raw.slice(0, 12);
    if (months.length < 2 || months.some(value => !Number.isFinite(value)) || months.every(value => value <= 0)) return null;
    const low = Math.min(...months);
    const high = Math.max(...months);
    return {
      type: 'spark',
      series: months,
      title: `Monthly yield ${app.formatNumber(low)}–${app.formatNumber(high)} kWh/kWp·day`,
    };
  }

  function configuredFactorGauge(current) {
    if (['solar-pv', 'nuclear-electricity'].includes(current.unit)) {
      const factor = Number(current.params?.capacityFactor);
      if (!Number.isFinite(factor) || factor < 0 || factor > 1) return null;
      return {
        type: 'bar',
        fraction: factor,
        read: `${app.formatNumber(factor * 100)}%`,
        title: `Capacity factor ${app.formatNumber(factor * 100)}%`,
        tone: 'cf',
      };
    }
    if (current.unit === 'solar-thermal') {
      const sunHours = Number(current.params?.sunHours);
      if (!Number.isFinite(sunHours) || sunHours < 0 || sunHours > 24) return null;
      return {
        type: 'bar',
        fraction: sunHours / 24,
        read: `${app.formatNumber(sunHours)}h`,
        title: `${app.formatNumber(sunHours)} sun hours`,
        tone: 'cf',
      };
    }
    return null;
  }

  function busDispatchGauge(current) {
    if (current.unit !== 'electrical-bus' || !app.result?.streams) return null;
    const offered = Number(app.result.nodes?.[current.id]?.available?.kWh);
    const used = app.result.streams
      .filter(edge => edge.from.node === current.id && edge.stream?.kind === 'electricity')
      .reduce((sum, edge) => sum + (Number(edge.stream.kWh) || 0), 0);
    if (!(offered > 0) || !Number.isFinite(used)) return null;
    return ratioGauge(used / offered, `Bus dispatch ${app.formatNumber(used)} / ${app.formatNumber(offered)} kWh/d`, 'util');
  }

  function activityGauge(current, nodeResult, allowed, title) {
    if (!allowed.has(current.unit)) return null;
    return ratioGauge(utilizationRatio(current, nodeResult), title, 'util');
  }

  function hubGauge(current, nodeResult) {
    return monthlyYieldGauge(current)
      || configuredFactorGauge(current)
      || busDispatchGauge(current)
      || activityGauge(current, nodeResult, new Set(['swro', 'med', 'msf']), 'Water train utilization')
      || activityGauge(current, nodeResult, new Set(['battery', 'thermal-storage']), 'Storage throughput');
  }

  function electricityDrawKWh(nodeResult) {
    const consumed = nodeResult?.consumed;
    if (!consumed || typeof consumed !== 'object') return null;
    let sum = 0;
    let found = false;
    for (const stream of Object.values(consumed)) {
      if (stream?.kind === 'electricity' && Number.isFinite(stream.kWh)) {
        sum += stream.kWh;
        found = true;
      }
    }
    return found ? sum : null;
  }

  function buildingProfile(unit, kind, current) {
    if (kind === 'source') {
      if (unit === 'solar-pv' || unit === 'electricity-source') return 'solar';
      if (unit === 'solar-thermal' || unit === 'heat-source') return 'furnace';
      if (unit === 'material-source') {
        const intake = app.intakeKind(current);
        return intake?.profile || 'intake';
      }
      if (unit === 'consumable-source') return 'silo';
      // Prefer honest intake slab over unlabeled storage tank for stray sources.
      return 'intake';
    }
    if (kind === 'sink') return 'silo';
    if (kind === 'buffer' || unit === 'material-buffer') return 'tank';
    if (unit === 'intake-pump' || unit === 'gas-blower') return 'pipe';
    if (unit === 'electrical-bus' || kind === 'junction') return 'bus';
    if (unit === 'brine-minerals' || unit === 'swro' || unit === 'med' || unit === 'msf' || unit === 'iac-leach') return 'pond';
    if (unit === 'mg-si' || unit === 'polysilicon' || unit === 'float-glass' || unit === 'cement') return 'furnace';
    if (unit === 'electrolyzer' || unit === 'chlor-alkali' || unit === 'bromine-recovery' || unit === 'bayer-alumina' || unit === 'aluminium-smelter' || unit === 'bioforge' || unit === 'pv-module' || unit === 'copper-ew') return 'cell';
    if (unit === 'asu' || unit === 'ammonia' || unit === 'urea' || unit === 'mto' || unit === 'ft-liquids' || unit === 'sabatier' || unit === 'methanol' || unit === 'dac') return 'tower';
    if (kind === 'splitter' || kind === 'mixer') return 'pipe';
    return 'shed';
  }

  function renderBuildingBody(x, y, width, height, profile) {
    const dx = app.ISO_DX;
    const dy = app.ISO_DY;
    const x2 = x + width;
    const y2 = y + height;
    const top = `M${x} ${y} L${x2} ${y} L${x2 + dx} ${y - dy} L${x + dx} ${y - dy} Z`;
    const side = `M${x2} ${y} L${x2 + dx} ${y - dy} L${x2 + dx} ${y2 - dy} L${x2} ${y2} Z`;
    const front = `M${x} ${y} L${x2} ${y} L${x2} ${y2} L${x} ${y2} Z`;
    const hit = `<rect class="node-hit" x="${x}" y="${y}" width="${width}" height="${height}" rx="${app.NODE_RX}"/>`;
    if (profile === 'tank' || profile === 'silo') {
      const cx = x + width / 2;
      const rx = Math.min(width * 0.42, 78);
      const ry = Math.max(10, dy + 4);
      const bodyTop = y + 10;
      const lid = `<ellipse class="node-roof node-tank-lid" cx="${cx}" cy="${bodyTop}" rx="${rx}" ry="${ry}"/>`;
      const shell = `<path class="node-front node-tank-shell" d="M${cx - rx} ${bodyTop} L${cx - rx} ${y2 - 6} Q${cx} ${y2 + 4} ${cx + rx} ${y2 - 6} L${cx + rx} ${bodyTop} Q${cx} ${bodyTop + ry} ${cx - rx} ${bodyTop} Z"/>`;
      const rim = `<ellipse class="node-top node-tank-rim" cx="${cx}" cy="${bodyTop}" rx="${rx}" ry="${ry}"/>`;
      const band = `<rect class="node-band" x="${cx - rx + 4}" y="${(bodyTop + y2) / 2 - 4}" width="${rx * 2 - 8}" height="8" rx="1"/>`;
      return `${hit}${shell}${band}${lid}${rim}`;
    }
    if (profile === 'solar') {
      const panel = `<path class="node-top node-solar-top" d="${top}"/>`;
      const face = `<path class="node-front node-solar-front" d="${front}"/>`;
      const right = `<path class="node-side node-solar-side" d="${side}"/>`;
      const lines = [0.22, 0.4, 0.58, 0.76].map((t) => {
        const px = x + dx * t;
        const py = y - dy * t;
        return `<line class="node-solar-rib" x1="${px}" y1="${py}" x2="${x2 + dx * t}" y2="${py}"/>`;
      }).join('');
      return `${hit}${right}${face}${panel}${lines}`;
    }
    if (profile === 'pond') {
      const slab = `<path class="node-front node-pond-front" d="${front}"/>`;
      const lip = `<path class="node-top node-pond-top" d="${top}"/>`;
      const right = `<path class="node-side node-pond-side" d="${side}"/>`;
      const pool = `<rect class="node-pond-pool" x="${x + 10}" y="${y + 18}" width="${width - 20}" height="${Math.max(24, height - 44)}" rx="2"/>`;
      return `${hit}${right}${slab}${lip}${pool}`;
    }
    if (profile === 'intake') {
      // Low intake slab + pipe mouth — seawater / freshwater, not a storage tank.
      const slab = `<path class="node-front node-intake-front" d="${front}"/>`;
      const lip = `<path class="node-top node-intake-top" d="${top}"/>`;
      const right = `<path class="node-side node-intake-side" d="${side}"/>`;
      const mouthCx = x + width * 0.32;
      const mouthCy = y + Math.max(42, height * 0.55);
      const mouth = `<ellipse class="node-intake-mouth" cx="${mouthCx}" cy="${mouthCy}" rx="16" ry="12"/>`;
      const pipe = `<rect class="node-intake-pipe" x="${mouthCx + 12}" y="${mouthCy - 6}" width="${Math.max(36, width * 0.38)}" height="12" rx="2"/>`;
      return `${hit}${right}${slab}${lip}${mouth}${pipe}`;
    }
    if (profile === 'stack') {
      // Duct / stack intake for ambient air or flue — tower-like, not a tank.
      const face = `<path class="node-front node-stack-building" d="${front}"/>`;
      const roof = `<path class="node-top node-stack-building-top" d="${top}"/>`;
      const right = `<path class="node-side" d="${side}"/>`;
      const sx = x + width * 0.58;
      const stackH = 34;
      const duct = `<rect class="node-intake-stack" x="${sx}" y="${y - stackH}" width="20" height="${stackH}"/>`
        + `<ellipse class="node-intake-stack-rim" cx="${sx + 10}" cy="${y - stackH}" rx="11" ry="3.5"/>`;
      return `${hit}${right}${face}${roof}${duct}`;
    }
    if (profile === 'tower' || profile === 'cell' || profile === 'furnace') {
      const face = `<path class="node-front" d="${front}"/>`;
      const roof = `<path class="node-top" d="${top}"/>`;
      const right = `<path class="node-side" d="${side}"/>`;
      const stackX = x2 - 28;
      const stack = profile === 'cell'
        ? `<rect class="node-stack" x="${stackX}" y="${y - 22}" width="10" height="22"/><rect class="node-stack" x="${stackX + 14}" y="${y - 18}" width="8" height="18"/>`
        : `<rect class="node-stack" x="${stackX}" y="${y - 26}" width="12" height="26"/>`;
      return `${hit}${right}${face}${roof}${stack}`;
    }
    if (profile === 'bus' || profile === 'pipe') {
      const face = `<path class="node-front node-bus-front" d="${front}"/>`;
      const roof = `<path class="node-top node-bus-top" d="${top}"/>`;
      const right = `<path class="node-side" d="${side}"/>`;
      return `${hit}${right}${face}${roof}`;
    }
    const face = `<path class="node-front" d="${front}"/>`;
    const roof = `<path class="node-top" d="${top}"/>`;
    const right = `<path class="node-side" d="${side}"/>`;
    return `${hit}${right}${face}${roof}`;
  }

  function faceStatusModel(current, nodeResult, diagnosis) {
    const gauge = hubGauge(current, nodeResult);
    if (gauge?.type === 'bar' && Number.isFinite(gauge.fraction)) {
      return {
        fraction: Math.max(0, Math.min(1, gauge.fraction)),
        read: gauge.read,
        title: gauge.title,
        tone: gauge.tone === 'cf' ? 'cf' : 'util',
        kind: 'gauge',
      };
    }
    const util = utilizationRatio(current, nodeResult);
    if (util != null) {
      const shown = Math.max(0, Math.min(1, util));
      return {
        fraction: shown,
        read: `${app.formatNumber(shown * 100)}%`,
        title: `Utilization ${app.formatNumber(shown * 100)}%`,
        tone: 'util',
        kind: 'util',
      };
    }
    if (!['source', 'sink', 'junction'].includes(app.units[current.unit].kind)) {
      const kWh = electricityDrawKWh(nodeResult);
      if (kWh > 0) {
        return {
          fraction: null,
          read: formatCompactEnergy(kWh, false),
          title: `Power draw ${formatCompactEnergy(kWh, false)}`,
          tone: 'power',
          kind: 'power',
        };
      }
    }
    if (gauge?.type === 'spark') return { spark: gauge, kind: 'spark' };
    return null;
  }

  function renderFaceStatus(x, y, height, status, diagnosis, running) {
    if (!status && !diagnosis && !running) return '';
    const barY = y + 42;
    const trackX = x + 10;
    const trackW = app.NODE_WIDTH - 48;
    const lightCx = x + app.NODE_WIDTH - 14;
    const lightCy = y + 12;
    const light = diagnosis
      ? `<circle class="node-run-light is-starved" cx="${lightCx}" cy="${lightCy}" r="4.5"><title>Starved</title></circle>`
      : running
        ? `<circle class="node-run-light is-running" cx="${lightCx}" cy="${lightCy}" r="4.5"><title>Running</title></circle>`
        : '';
    if (!status) return light;
    if (status.spark) {
      const gauge = status.spark;
      const width = 72;
      const gx = x + app.NODE_WIDTH - 22 - width;
      const gy = y + 8;
      const peak = Math.max(...gauge.series, 0);
      if (!(peak > 0)) return light;
      const slot = width / gauge.series.length;
      const bars = gauge.series.map((value, index) => {
        const barHeight = Math.max(0, (value / peak) * 12);
        if (!(barHeight > 0)) return '';
        const barWidth = Math.max(0.8, slot - 0.7);
        return `<rect class="node-spark-bar" x="${(gx + index * slot).toFixed(2)}" y="${(gy + 12 - barHeight).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}"/>`;
      }).join('');
      return `<g class="node-gauge node-gauge-spark node-face-spark"><title>${app.escapeHtml(gauge.title)}</title>${bars}</g>${light}`;
    }
    const label = app.escapeHtml(status.read || '');
    const title = app.escapeHtml(status.title || status.read || '');
    const tone = status.tone || 'util';
    const chipClass = status.kind === 'util' ? ' node-chip node-chip-util' : status.kind === 'power' ? ' node-chip node-chip-power' : '';
    if (status.fraction == null) {
      return `<g class="node-face-status node-face-read node-gauge node-gauge-bar${chipClass}" data-face="${status.kind || 'read'}"><title>${title}</title><text class="node-gauge-read" x="${trackX}" y="${barY + 8}">${label}</text>${light}</g>`;
    }
    const fill = Math.max(0, (trackW - 2) * status.fraction);
    return `<g class="node-face-status node-face-bar node-gauge node-gauge-bar node-gauge-${tone}${chipClass}" data-face="${status.kind || 'bar'}"><title>${title}</title><rect class="node-gauge-track node-face-track" x="${trackX}" y="${barY}" width="${trackW}" height="9" rx="1"/><rect class="node-gauge-fill node-face-fill" x="${trackX + 1}" y="${barY + 1}" width="${fill.toFixed(2)}" height="7"/><text class="node-gauge-read node-face-readout" x="${trackX + trackW}" y="${barY - 3}" text-anchor="end">${label}</text>${light}</g>`;
  }

  function floorGridMarkup(width, height) {
    const step = app.FLOOR_GRID;
    return `<defs><pattern id="plantFloorGrid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path class="floor-grid-line" d="M${step} 0 H0 V${step}" fill="none"/></pattern></defs><rect class="floor-grid" x="0" y="0" width="${width}" height="${height}" fill="url(#plantFloorGrid)"/>`;
  }

  function renderGraph() {
    app.renderCanvasZoom();
    if (!app.graph.nodes.length) {
      app.canvas.classList.add('empty');
      const hint = document.getElementById('canvasPanHint');
      if (hint) hint.hidden = true;
      app.canvas.innerHTML = app.EMPTY_CANVAS_HTML;
      return;
    }
    app.canvas.classList.remove('empty');
    const hint = document.getElementById('canvasPanHint');
    if (hint) hint.hidden = false;
    const sized = app.contentSize();
    const width = sized.width;
    const height = sized.height;
    const recycleY = height - 45;
    const edges = app.graph.edges.map((edge, edgeIndex) => {
      const start = portPoint(edge.from.node, edge.from.port, 'out');
      const end = portPoint(edge.to.node, edge.to.port, 'in');
      const sibling = app.graph.edges.slice(0, edgeIndex).filter(candidate => candidate.from.node === edge.from.node && candidate.from.port === edge.from.port).length;
      const mid = (start.x + end.x) / 2 + sibling * 12;
      const stream = app.result?.streams.find(candidate => candidate.from.node === edge.from.node && candidate.from.port === edge.from.port && candidate.to.node === edge.to.node && candidate.to.port === edge.to.port)?.stream
        || app.result?.streams.find(candidate => candidate.from.node === edge.from.node && candidate.from.port === edge.from.port)?.stream;
      const kind = app.units[app.node(edge.from.node).unit].ports[edge.from.port].kind;
      const logisticsClamped = (app.result?.edgeLimits || []).some(item => (
        item.from.node === edge.from.node && item.from.port === edge.from.port
        && item.to.node === edge.to.node && item.to.port === edge.to.port
      ));
      const constrained = logisticsClamped
        || bottlenecksFor(edge.to.node).some(limit => limit === 'logistics' || limitingPort(app.node(edge.to.node), limit) === edge.to.port);
      const path = edge.recycle
        ? `M${start.x} ${start.y} C${start.x + 70} ${start.y},${start.x + 70} ${recycleY},${start.x} ${recycleY} L${end.x} ${recycleY} C${end.x - 70} ${recycleY},${end.x - 70} ${end.y},${end.x} ${end.y}`
        : `M${start.x} ${start.y} C${mid} ${start.y},${mid} ${end.y},${end.x} ${end.y}`;
      const labelX = edge.recycle ? (start.x + end.x) / 2 : mid;
      const labelY = edge.recycle ? recycleY - 8 : (start.y + end.y) / 2 - 7;
      const rate = formatEdgeRate(stream);
      const flowing = streamIsFlowing(stream);
      const label = rate ? `${edge.recycle ? '↻ ' : ''}${rate}` : '—';
      const belt = kind === 'material' || kind === 'consumable' ? ' belt' : kind === 'electricity' ? ' cable' : kind === 'heat' ? ' pipe' : '';
      const selected = app.selectedEdgeIndex === edgeIndex ? ' is-selected' : '';
      return `<path class="flow-edge ${kind}${edge.recycle ? ' recycle' : ''}${belt}${constrained ? ' bottleneck' : ''}${flowing ? ' is-flowing' : ' is-static'}${selected}" data-edge-index="${edgeIndex}" d="${path}"/><text class="edge-label${constrained ? ' bottleneck' : ''}${rate ? '' : ' is-muted'}" data-edge-index="${edgeIndex}" x="${labelX}" y="${labelY}" text-anchor="middle">${app.escapeHtml(label)}</text>`;
    }).join('');
    app.canvas.innerHTML = `<svg viewBox="0 0 ${width} ${height}" style="width:${width * app.canvasZoom}px;height:${height * app.canvasZoom}px;max-width:none" aria-label="Plant floor">${floorGridMarkup(width, height)}${edges}${app.graph.nodes.map(renderNode).join('')}</svg>`;
  }

  function renderNode(current) {
    const ports = Object.entries(app.units[current.unit].ports);
    const inputs = ports.filter(([, declaration]) => declaration.direction === 'in');
    const outputs = ports.filter(([, declaration]) => declaration.direction === 'out');
    const { x, y } = current.position;
    const height = nodeHeight(current);
    const nodeResult = app.result?.nodes[current.id];
    const bottlenecks = bottlenecksFor(current.id);
    const diagnosis = app.blockDiagnosis(current);
    const running = !!(nodeResult && !diagnosis && !app.blockIsIdle(current));
    const value = diagnosis
      ? diagnosis.text
      : nodeResult?.activity !== undefined
        ? `${app.formatNumber(nodeResult.activity)} ${app.catalog[current.unit].activityUnit}`
        : nodeResult
          ? app.formatStream(nodeResult.supplied || nodeResult.received || nodeResult.available)
          : 'Not running';
    const portMarkup = (list, direction) => list.map(([port, declaration], index) => {
      const cy = y + app.PORT_TOP + index * app.PORT_STEP;
      const cx = direction === 'in' ? x : x + app.NODE_WIDTH;
      const selected = app.pendingPort?.node === current.id && app.pendingPort.port === port;
      const cause = diagnosis?.action === 'port' && diagnosis.port === port && diagnosis.nodeId === current.id;
      const portLabel = `Connect ${app.portName(port, current.unit)} ${direction === 'in' ? 'in' : 'out'}`;
      return `<g class="flow-port ${declaration.kind}${selected ? ' pending' : ''}${cause ? ' cause' : ''}" data-node="${current.id}" data-port="${port}" data-direction="${direction}" role="button" tabindex="0" aria-label="${portLabel}" title="${portLabel}"><circle cx="${cx}" cy="${cy}" r="7"/><text x="${direction === 'in' ? cx + 12 : cx - 12}" y="${cy + 3}" text-anchor="${direction === 'in' ? 'start' : 'end'}">${app.portName(port, current.unit)}</text></g>`;
    }).join('');
    const reasonTitle = diagnosis ? app.escapeHtml(diagnosis.detail || diagnosis.text) : '';
    const kind = app.units[current.unit].kind;
    const intake = current.unit === 'material-source' ? app.intakeKind(current) : null;
    const profile = buildingProfile(current.unit, kind, current);
    const status = faceStatusModel(current, nodeResult, diagnosis);
    const flags = `${bottlenecks.length ? ' bottleneck' : ''}${current.id === app.selectedNodeId ? ' selected' : ''}${diagnosis ? ' is-idle' : ''}${running ? ' is-running' : ''} building-${profile}`;
    const bottleneckTitle = nodeResult?.causeText
      ? `Bottleneck: ${nodeResult.causeText}`
      : bottlenecks.length ? `Bottleneck: ${bottlenecks.map(port => app.portName(port, current.unit)).join(', ')}` : '';
    const title = reasonTitle
      ? `<title>${reasonTitle}</title>`
      : bottleneckTitle ? `<title>${app.escapeHtml(bottleneckTitle)}</title>` : '';
    const reasonAttr = diagnosis ? ` data-reason="${app.escapeHtml(diagnosis.text)}"` : '';
    const glyph = intake?.glyph
      || (profile === 'tank' ? 'tank'
        : profile === 'silo' ? 'silo'
        : profile === 'solar' ? 'solar'
        : profile === 'furnace' ? 'heat'
        : profile === 'bus' ? 'bus'
        : profile === 'intake' ? 'intake'
        : profile === 'stack' ? 'stack'
        : profile === 'pond' ? 'pond'
        : kind);
    const body = renderBuildingBody(x, y, app.NODE_WIDTH, height, profile);
    const face = renderFaceStatus(x, y, height, status, diagnosis, running);
    const badgeWidth = Math.min(92, Math.max(40, String(glyph).length * 7.0 + 12));
    return `<g class="flow-node${flags}" data-node="${current.id}" data-profile="${profile}"${reasonAttr} tabindex="0">${title}${body}<rect class="node-kind-badge" x="${x + 8}" y="${y + 6}" width="${badgeWidth}" height="13" rx="1"/><text class="node-kind" x="${x + 8 + badgeWidth / 2}" y="${y + 15.5}" text-anchor="middle">${glyph}</text><text class="node-label" x="${x + 8}" y="${y + 34}">${app.escapeHtml(current.label)}</text>${face}<line class="node-status-rule" x1="${x + 8}" y1="${y + height - 16}" x2="${x + app.NODE_WIDTH - 8}" y2="${y + height - 16}"/><text class="node-value${diagnosis ? ' node-reason' : ''}" x="${x + 8}" y="${y + height - 5}">${app.escapeHtml(value)}</text>${portMarkup(inputs, 'in')}${portMarkup(outputs, 'out')}</g>`;
  }

  function bottlenecksFor(nodeId) { return app.result?.nodes[nodeId]?.limitedBy || []; }
  function limitingPort(current, limit) {
    if (app.DAC_ROUTES[current.unit] && limit === 'feed') return 'air';
    if (['battery', 'thermal-storage'].includes(current.unit) && ['electricity', 'heat'].includes(limit)) return 'in';
    return limit;
  }

  function nodeHeight(current) {
    const ports = Object.values(app.units[current.unit].ports);
    const rows = Math.max(ports.filter(port => port.direction === 'in').length, ports.filter(port => port.direction === 'out').length);
    return Math.max(96, app.PORT_TOP + rows * app.PORT_STEP + 16);
  }

  function portPoint(nodeId, port, direction) {
    const current = app.node(nodeId);
    const ports = Object.entries(app.units[current.unit].ports).filter(([, declaration]) => declaration.direction === direction);
    return { x: current.position.x + (direction === 'out' ? app.NODE_WIDTH : 0), y: current.position.y + app.PORT_TOP + ports.findIndex(([name]) => name === port) * app.PORT_STEP };
  }

  function renderStatus() {
    const missing = app.missingConnections();
    const bottlenecks = app.graph.nodes.flatMap(current => bottlenecksFor(current.id).map(limit => `${current.label}: ${app.portName(limit, current.unit)}`));
    const solveStatus = document.getElementById('solveStatus');
    const balanceStatus = document.getElementById('balanceStatus');
    document.getElementById('flowSummary').textContent = `${app.graph.nodes.length} blocks · ${app.graph.edges.length} connections`;
    document.getElementById('diagramTitle').textContent = app.site?.name || (app.graph.nodes.length ? 'Plant floor' : 'No blocks');
    if (!app.graph.nodes.length) {
      solveStatus.textContent = 'No plant loaded';
      solveStatus.className = 'status-chip idle';
      balanceStatus.textContent = 'Add a block';
      balanceStatus.className = 'status-chip idle';
    } else {
      solveStatus.textContent = app.result ? 'Plant running' : 'Plant incomplete';
      solveStatus.className = `status-chip${app.result ? ' good' : missing.length || app.solveError ? ' warn' : ''}`;
      balanceStatus.textContent = app.result ? (app.result.balances.maxAbsResidual < 1e-8 ? 'Balances closed' : 'Check balances') : app.pendingPort ? 'Choose compatible port' : 'Manual setpoints';
      balanceStatus.className = `status-chip${app.result?.balances.maxAbsResidual < 1e-8 ? ' good' : app.result || app.pendingPort ? ' warn' : ''}`;
    }
    const warning = document.getElementById('warnings');
    const siteRightWarnings = app.unverifiedRightsWarnings?.(app.site) || [];
    const issues = [];
    if (app.solveError) issues.push({ severity: 'error', text: app.solveError });
    if (app.routeNote) issues.push({ severity: 'warn', text: app.routeNote });
    const powerNote = app.powerThrottleCallout();
    if (powerNote) {
      const nodeId = app.powerLimitNodeId();
      issues.push(nodeId
        ? { severity: 'warn', text: powerNote, nodeId }
        : { severity: 'warn', text: powerNote });
    }
    if (app.pendingPort) {
      issues.push({
        severity: 'info',
        text: `Connecting ${app.node(app.pendingPort.node).label} · ${app.portName(app.pendingPort.port, app.node(app.pendingPort.node).unit)}`,
      });
    }
    const openPorts = [
      ...app.missingConnectionRecords(),
      ...app.graph.nodes.filter(current => ['source', 'sink'].includes(app.units[current.unit].kind)).flatMap(app.unconnectedPorts),
    ];
    openPorts.slice(0, 4).forEach(item => issues.push({
      severity: 'warn',
      text: `Connect ${item.text}`,
      action: 'process',
      nodeId: item.nodeId,
      port: item.port,
    }));
    bottlenecks.slice(0, 4).forEach(item => issues.push({ severity: 'warn', text: `Bottleneck · ${item}`, action: 'process' }));
    siteRightWarnings.forEach(item => issues.push({ severity: 'warn', text: item, action: 'location' }));
    warning.hidden = issues.length === 0;
    warning.innerHTML = issues.map(issue => {
      const text = app.humanizeUiText(issue.text);
      const go = issue.nodeId
        ? `<button type="button" data-issue-node="${app.escapeHtml(issue.nodeId)}" data-issue-port="${app.escapeHtml(issue.port || '')}">Show block</button>`
        : issue.action === 'process'
          ? '<button type="button" data-issue-tab="process">Process</button>'
          : issue.action === 'location'
            ? '<button type="button" data-issue-tab="location">Location</button>'
            : '';
      return `<div class="warning-issue" data-severity="${issue.severity}"><span>${app.escapeHtml(text)}</span>${go}</div>`;
    }).join('');
  }
})();
