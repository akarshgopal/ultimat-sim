// Shared stream / number / money formatting helpers.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    formatLimitedBy, formatMoney, formatNumber, formatStream, formatUncertainHa, metricMetaMarkup,
    metricRows, recipeGroup,
  });

  function recipeGroup(title, streams, unit) {
    return `<div class="recipe-group"><h4>${title}</h4>${Object.entries(streams).map(([port, stream]) => `<div class="recipe-flow"><strong>${app.portName(port, unit)}</strong><span class="species">${formatStream(stream)}</span></div>`).join('')}</div>`;
  }

  function formatStream(stream) {
    if (!stream) return '—';
    if (stream.kind === 'material') {
      const kg = FlowsheetModel.streamMassKg(stream);
      return `${formatNumber(kg)} kg/day · ${formatNumber(kg * 365 / 1000)} t/year`;
    }
    if (stream.kind === 'consumable') return `${formatNumber(stream.amount)} ${stream.unit}`;
    return `${formatNumber(stream.kWh)} kWh/day${stream.kind === 'heat' ? ` @ ${stream.T_C}°C` : ''}`;
  }

  function formatLimitedBy(current, nodeResult) {
    const limits = [...(nodeResult?.limitedBy || [])];
    if (app.operationMeta.boundaryLimitedBy?.length) {
      for (const item of app.operationMeta.boundaryLimitedBy) {
        if (!limits.includes(item)) limits.push(item);
      }
    }
    const requested = Number(app.setpoints[current.id]);
    const achieved = Number(nodeResult?.activity);
    if (limits.length) return limits.join(', ');
    if (Number.isFinite(requested) && requested > 0 && Number.isFinite(achieved) && achieved <= requested * 1e-9) {
      return 'unresolved constraint';
    }
    if (Number.isFinite(requested) && requested > 0 && Number.isFinite(achieved) && achieved + 1e-9 < requested) {
      return 'below setpoint';
    }
    return 'none';
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) < 1e-9) return '0';
    if (Math.abs(n) > 0 && Math.abs(n) < 1e-4) return n.toExponential(2);
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function formatUncertainHa(ha, quality = app.classifyQuality({ kind: 'land' })) {
    const value = Number(ha) || 0;
    if (value >= 1) return app.formatUncertainNumber(value, quality, { unit: 'ha' });
    if (value >= 0.001) return app.formatUncertainNumber(value, quality, { unit: 'ha' });
    if (value > 0) return app.formatUncertainNumber(value * 10000, quality, { unit: 'm²' });
    return app.formatUncertainNumber(0, quality, { unit: 'ha' });
  }
  function formatMoney(value) { return `$${formatNumber(value)}`; }
  function metricMetaMarkup(meta) {
    if (!meta) return '';
    if (typeof meta === 'string') return app.qualityChip(meta, { omitNoisy: true });
    const quality = meta.quality || (meta.kind ? app.classifyQuality(meta) : '');
    const chip = quality ? app.qualityChip(quality, { omitNoisy: true }) : '';
    const band = app.parseBand(meta.band);
    const bandText = band
      ? `<span class="quality-band">${app.formatUncertainNumber(band.low, 'cited')}–${app.formatUncertainNumber(band.high, 'cited')}${band.unit ? ` ${band.unit}` : ''}</span>`
      : '';
    const cite = meta.cite || app.citeMarkup(meta.references);
    return `${chip}${bandText}${cite}`;
  }
  function metricRows(rows) {
    return rows.map(([term, value, meta]) => {
      const tone = meta && typeof meta === 'object' && (meta.tone === 'positive' || meta.tone === 'negative') ? ` class="${meta.tone}"` : '';
      return `<div><dt>${term}</dt><dd${tone}>${value}${metricMetaMarkup(meta)}</dd></div>`;
    }).join('');
  }
})();
