// Solve + render entry point, missing connections, cause diagnostics.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    blockDiagnosis, blockIsIdle, diagnosisButton, edgeAt, edgeIndexesAt, followDiagnosis,
    missingConnectionRecords, missingConnections, node, portName, solveAndRender, unconnectedPorts,
  });

  function solveAndRender() {
    app.result = null;
    app.currentEconomics = null;
    if (app.graph.nodes.length && missingConnections().length === 0) {
      try {
        const solver = FlowsheetSolver.solveHorizon || FlowsheetSolver.solveOperation;
        const operation = {
          setpoints: app.setpoints,
          ...(app.cleanedPriorities() ? { priorities: app.cleanedPriorities() } : {}),
          ...(app.operationMeta.boundaryLimitedBy ? { boundaryLimitedBy: app.operationMeta.boundaryLimitedBy } : {}),
        };
        app.result = solver({ graph: app.graph, operation, site: app.site });
        app.currentEconomics = FlowsheetEconomics.evaluateEconomics({ graph: app.graph, operation, economics: app.projectEconomics }, app.result);
        app.solveError = '';
      } catch (error) {
        app.solveError = /site feed composition must be preserved/.test(error.message)
          ? 'This plant is sized for a different feed. Switching assays would break the feed. Load a matching demo or keep the current site.'
          : error.message;
      }
    }
    app.persistAutosave();
    app.render();
  }

  function missingConnectionRecords() {
    const missing = [];
    for (const current of app.graph.nodes) {
      if (['source', 'sink'].includes(app.units[current.unit].kind)) continue;
      for (const [port, declaration] of Object.entries(app.units[current.unit].ports)) {
        if (!declaration.required) continue;
        if (edgeAt({ node: current.id, port, direction: declaration.direction }) < 0) {
          missing.push({
            nodeId: current.id,
            label: current.label,
            port,
            text: `${current.label}: ${portName(port, current.unit)}`,
          });
        }
      }
    }
    return missing;
  }

  function missingConnections() {
    return missingConnectionRecords().map(item => item.text);
  }

  function unconnectedPorts(current) {
    const missing = [];
    for (const [port, declaration] of Object.entries(app.units[current.unit].ports)) {
      if (!declaration.required) continue;
      if (edgeAt({ node: current.id, port, direction: declaration.direction }) < 0) {
        missing.push({
          nodeId: current.id,
          label: current.label,
          port,
          text: `${current.label}: ${portName(port, current.unit)}`,
        });
      }
    }
    return missing;
  }

  function rightKeyForResource(resourceId) {
    return {
      grid: 'gridImport',
      freshwater: 'freshwater',
      seawater: 'seawaterIntake',
      brine: 'brineConcession',
      salt: 'saltPurchase',
    }[resourceId] || '';
  }

  function rightShortName(rightKey) {
    return {
      gridImport: 'grid',
      freshwater: 'freshwater',
      seawaterIntake: 'intake',
      seawaterDischarge: 'discharge',
      brineConcession: 'brine',
      saltPurchase: 'salt',
    }[rightKey] || rightKey || 'site';
  }

  function streamQuantity(stream) {
    if (!stream) return 0;
    try { return Math.abs(app.sourceAmount(stream)); } catch { return 0; }
  }

  function blockIsIdle(current) {
    const nodeResult = app.result?.nodes?.[current.id];
    if (!nodeResult) return true;
    if (nodeResult.activity !== undefined) return Math.abs(Number(nodeResult.activity) || 0) <= 1e-9;
    return streamQuantity(nodeResult.supplied || nodeResult.received || nodeResult.available) <= 1e-9;
  }

  function sourceSupplyDiagnosis(current) {
    if (!current || app.units[current.unit].kind !== 'source') return null;
    const resourceId = current.siteResource;
    const resource = resourceId ? app.site?.resources?.[resourceId] : null;
    const rightKey = rightKeyForResource(resourceId);
    const right = rightKey ? app.site?.rights?.[rightKey] : null;
    if (app.site && !resourceId) {
      return { code: 'missing-resource', text: 'No site resource', action: 'resource', nodeId: current.id };
    }
    const budget = resource?.stream ? streamQuantity(resource.stream) : null;
    const unverified = right?.status === 'unverified' || resource?.quality === 'unverified';
    if (unverified && (budget == null || budget <= 1e-9)) {
      return {
        code: 'unverified-right',
        text: `Unverified ${rightShortName(rightKey)} right`,
        action: 'rights',
        rightKey,
        nodeId: current.id,
      };
    }
    if (budget != null && budget <= 1e-9) {
      return { code: 'zero-resource', text: 'Zero resource budget', action: 'resource', nodeId: current.id };
    }
    if (Number(current.rate) <= 1e-9) {
      return { code: 'zero-setpoint', text: 'Zero setpoint', action: 'setpoint', nodeId: current.id };
    }
    return null;
  }

  function feedingNode(current, port) {
    let edge = app.graph.edges.find(item => item.to.node === current.id && item.to.port === port && !item.recycle);
    const seen = new Set();
    let from = edge ? node(edge.from.node) : null;
    while (from && ['junction', 'splitter', 'mixer'].includes(app.units[from.unit].kind) && !seen.has(from.id)) {
      seen.add(from.id);
      edge = app.graph.edges.find(item => item.to.node === from.id && !item.recycle);
      from = edge ? node(edge.from.node) : null;
    }
    return from;
  }

  function blockDiagnosis(current) {
    if (!current) return null;
    if (app.result?.nodes?.[current.id] && !blockIsIdle(current)) return null;
    const supply = sourceSupplyDiagnosis(current);
    if (supply && supply.code !== 'zero-setpoint') return supply;
    const missing = unconnectedPorts(current);
    if (missing.length) {
      const extra = missing.length > 1 ? ` +${missing.length - 1}` : '';
      return {
        code: 'missing-connection',
        text: `Missing ${portName(missing[0].port)}${extra}`,
        action: 'port',
        port: missing[0].port,
        nodeId: current.id,
      };
    }
    if (supply) return supply;
    if (app.units[current.unit].kind === 'converter' && Number(app.setpoints[current.id]) <= 1e-9) {
      return { code: 'zero-setpoint', text: 'Zero setpoint', action: 'setpoint', nodeId: current.id };
    }
    if (!app.result) {
      if (app.solveError) return { code: 'solve-error', text: 'Solve blocked', detail: app.solveError, action: 'warnings', nodeId: current.id };
      if (missingConnections().length) return { code: 'waiting', text: 'Waiting on another block', action: 'process', nodeId: current.id };
      return { code: 'not-running', text: 'Not running', nodeId: current.id };
    }
    const nodeResult = app.result.nodes[current.id];
    const limits = nodeResult?.limitedBy || [];
    if (limits.length) {
      const causeText = nodeResult.causeText || '';
      const root = nodeResult.causeChain?.length
        ? nodeResult.causeChain[nodeResult.causeChain.length - 1]
        : null;
      const limit = limits[0];
      if (/site budget/i.test(String(limit)) || root?.code === 'site-budget') {
        return supply || {
          code: 'limited',
          text: root?.text || 'Limited by site budget',
          detail: causeText || root?.text || 'Limited by site budget',
          action: 'resource',
          nodeId: root?.nodeId || current.id,
        };
      }
      const port = app.limitingPort(current, limit);
      const upstream = feedingNode(current, port);
      const upstreamSupply = upstream ? sourceSupplyDiagnosis(upstream) : null;
      if (upstreamSupply) {
        if (causeText) upstreamSupply.detail = causeText;
        return upstreamSupply;
      }
      const declared = app.units[current.unit].ports[port];
      const short = root?.text || `Limited by ${portName(limit)}`;
      return {
        code: 'limited',
        text: short,
        detail: causeText || short,
        action: declared ? 'port' : 'process',
        port: declared ? port : undefined,
        nodeId: current.id,
      };
    }
    const inlets = Object.entries(app.units[current.unit].ports).filter(([, declaration]) => declaration.direction === 'in');
    for (const [port] of inlets) {
      const upstreamSupply = sourceSupplyDiagnosis(feedingNode(current, port));
      if (upstreamSupply) return upstreamSupply;
    }
    return { code: 'idle', text: 'Idle', nodeId: current.id };
  }

  function followDiagnosis(diagnosis) {
    if (!diagnosis) return;
    if (diagnosis.action === 'rights') {
      app.highlightRightKey = diagnosis.rightKey || '';
      app.highlightPort = null;
      app.activateTab('location');
      const details = document.getElementById('siteRightsDetails');
      if (details) details.open = true;
      app.renderSiteTruth();
      document.getElementById('siteRights')?.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    app.highlightRightKey = '';
    if (diagnosis.nodeId) app.selectedNodeId = diagnosis.nodeId;
    app.highlightPort = diagnosis.action === 'port' && diagnosis.port
      ? { nodeId: app.selectedNodeId, port: diagnosis.port }
      : null;
    app.activateTab('process');
    app.render();
    if (diagnosis.action === 'setpoint') {
      document.querySelector('#nodeControls [name="requestedRate"], #nodeControls [name="sourceRate"]')?.focus?.();
    } else if (diagnosis.action === 'resource') {
      document.querySelector('#nodeControls [name="siteResource"]')?.focus?.();
    } else if (diagnosis.action === 'warnings') {
      document.getElementById('warnings')?.scrollIntoView?.({ block: 'nearest' });
    } else if (diagnosis.action === 'port') {
      document.querySelector(`#streamList [data-port-row="${diagnosis.port}"]`)?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function diagnosisButton(diagnosis) {
    if (!diagnosis?.action) return '';
    if (diagnosis.action === 'port') return `<button type="button" data-diagnosis="port">Show ${app.escapeHtml(portName(diagnosis.port))}</button>`;
    if (diagnosis.action === 'rights') return '<button type="button" data-diagnosis="rights">Open Rights</button>';
    if (diagnosis.action === 'setpoint') return '<button type="button" data-diagnosis="setpoint">Edit setpoint</button>';
    if (diagnosis.action === 'resource') return '<button type="button" data-diagnosis="resource">Edit resource</button>';
    if (diagnosis.action === 'warnings') return '<button type="button" data-diagnosis="warnings">Show issue</button>';
    return '<button type="button" data-diagnosis="process">Show block</button>';
  }

  function edgeAt(endpoint) {
    return edgeIndexesAt(endpoint)[0] ?? -1;
  }

  function edgeIndexesAt(endpoint) {
    return app.graph.edges.map((edge, index) => ({ edge, index })).filter(({ edge }) => endpoint.direction === 'out'
      ? edge.from.node === endpoint.node && edge.from.port === endpoint.port
      : edge.to.node === endpoint.node && edge.to.port === endpoint.port).map(({ index }) => index);
  }

  function node(id) { return app.graph.nodes.find(candidate => candidate.id === id); }
  function portName(port, unit) {
    if (unit === 'titanium-kroll' && port === 'magnesium') return 'Mg';
    return app.portNames[port] || port.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
})();
