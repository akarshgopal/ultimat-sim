(function exposeSolver(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./model') : root.FlowsheetModel,
    typeof require === 'function' ? require('./units') : root.FlowsheetUnits,
    typeof require === 'function' ? require('./heat') : root.FlowsheetHeat
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetSolver = api;
})(globalThis, (model, units, heat) => {
const {
  SUBSTANCES,
  chargeAmount,
  cloneStream,
  elementAmounts,
  nonnegative,
  scaleStream,
  streamMassKg,
  validateStream,
} = model;
const { UNITS, pumpPartLoad, flowWithinShapedSec } = units;
const { cascadeHeat } = heat;

function solveOperation(caseDefinition) {
  const { nodes, edges } = caseDefinition.graph;
  validateGraph(nodes, edges);
  validateSite(caseDefinition);
  const buses = nodes.filter(node => node.unit === 'electrical-bus');
  const recycleEdges = edges.filter(edge => edge.recycle);
  let recycleStreams = new Map(recycleEdges.map(edge => [edge, cloneStream(edge.initialStream)]));
  let solved;
  let recycleResidual = 0;
  let converged = false;
  let iterations = 0;
  let edgeLimits = [];
  for (; iterations < 100; iterations += 1) {
    edgeLimits = [];
    const plan = buses.length ? evaluateGraph(caseDefinition, null, recycleStreams, null) : null;
    const allocations = plan ? allocateElectricity(caseDefinition, plan, edgeLimits) : null;
    solved = evaluateGraph(caseDefinition, allocations, recycleStreams, edgeLimits);
    recycleResidual = Math.max(0, ...recycleEdges.map(edge => streamResidual(
      recycleStreams.get(edge), solved.edgeStreams.get(edge)
    )));
    if (recycleResidual < 1e-12) { converged = true; break; }
    recycleStreams = new Map(recycleEdges.map(edge => [edge, cloneStream(solved.edgeStreams.get(edge))]));
  }
  iterations = Math.min(iterations + 1, 100);

  for (const bus of buses) {
    const incoming = edges.find(edge => edge.to.node === bus.id);
    const outgoing = edges.filter(edge => edge.from.node === bus.id);
    const supplied = outgoing.reduce((sum, edge) => sum + solved.edgeStreams.get(edge).kWh, 0);
    solved.edgeStreams.set(incoming, { kind: 'electricity', kWh: supplied });
    solved.nodeResults[bus.id].allocations = Object.fromEntries(
      outgoing.map(edge => [edge.to.node, solved.edgeStreams.get(edge).kWh])
    );
  }
  for (const node of nodes.filter(node => UNITS[node.unit].kind === 'source')) {
    const edge = edges.find(candidate => candidate.from.node === node.id);
    if (!edge) continue; // orphan sources (e.g. after route change) have no outlet
    const stream = solved.edgeStreams.get(edge);
    if (!stream) continue;
    solved.nodeResults[node.id].supplied = cloneStream(stream);
  }

  const streams = edges.map(edge => ({ ...edge, stream: cloneStream(solved.edgeStreams.get(edge)) }));
  const balances = calculateBalances(nodes, edges, solved.edgeStreams, solved.nodeResults);
  const heatIntegration = collectHeatIntegration(caseDefinition, solved.nodeResults);
  tagLogisticsLimits(nodes, edges, solved.nodeResults, edgeLimits);
  attachCauseChains(caseDefinition, solved.nodeResults, edgeLimits);
  const warnings = nodes
    .filter(node => solved.nodeResults[node.id]?.limitedBy?.length)
    .map(node => `${node.id} limited by ${solved.nodeResults[node.id].limitedBy.join(', ')}`);
  for (const limit of edgeLimits) {
    const label = `${limit.from.node}→${limit.to.node} limited by logistics capacity`;
    if (!warnings.includes(label)) warnings.push(label);
  }
  if (powerBudgetThrottled(nodes, solved.nodeResults)) {
    warnings.push('Capacity reduced: limited by available electricity');
  }
  for (const limit of caseDefinition.operation?.boundaryLimitedBy || []) {
    warnings.push(`plant limited by ${limit}`);
  }
  if (!converged) warnings.push('recycle did not converge');
  for (const warning of unverifiedRightsWarnings(caseDefinition.site)) warnings.push(warning);
  return {
    streams,
    nodes: solved.nodeResults,
    balances,
    heatIntegration,
    warnings,
    edgeLimits: edgeLimits.map(limit => ({ ...limit })),
    convergence: {
      converged,
      iterations: recycleEdges.length ? iterations : (buses.length ? 2 : 1),
      largestResidual: Math.max(balances.maxAbsResidual, recycleResidual),
    },
  };
}

function streamAmount(stream) {
  if (stream.kind === 'material') return streamMassKg(stream);
  if (stream.kind === 'consumable') return stream.amount;
  return stream.kWh;
}


function finiteEdgeCapacity(edge) {
  if (!edge || edge.capacity == null || edge.capacity === '') return Infinity;
  const capacity = Number(edge.capacity);
  if (!Number.isFinite(capacity)) return Infinity;
  if (capacity < 0) throw new Error(`Edge capacity must be ≥ 0 (${edge.from?.node} → ${edge.to?.node})`);
  return capacity;
}

function applyEdgeCapacity(edge, stream, edgeLimits) {
  if (!edge || !stream) return stream;
  const capacity = finiteEdgeCapacity(edge);
  if (!Number.isFinite(capacity)) return stream;
  const requested = streamAmount(stream);
  if (requested <= capacity + Math.max(1, capacity) * 1e-9) return stream;
  const delivered = scaleStream(stream, requested === 0 ? 0 : capacity / requested);
  if (edgeLimits) {
    edgeLimits.push({
      from: { node: edge.from.node, port: edge.from.port },
      to: { node: edge.to.node, port: edge.to.port },
      port: edge.to.port,
      capacity,
      requested,
      delivered: streamAmount(delivered),
    });
  }
  return delivered;
}

function tagLogisticsLimits(nodes, edges, nodeResults, edgeLimits) {
  if (!edgeLimits?.length) return;
  const clampedInlets = new Map();
  for (const limit of edgeLimits) {
    const key = `${limit.to.node}:${limit.to.port}`;
    clampedInlets.set(key, limit);
  }
  for (const node of nodes) {
    const result = nodeResults[node.id];
    if (!result) continue;
    const incoming = edges.filter(edge => edge.to.node === node.id);
    let logisticsBinding = false;
    for (const edge of incoming) {
      const limit = clampedInlets.get(`${edge.to.node}:${edge.to.port}`);
      if (!limit) continue;
      const port = edge.to.port;
      const limits = result.limitedBy || [];
      if (limits.includes(port)) {
        logisticsBinding = true;
        break;
      }
      const requested = result.requestedInputs?.[port];
      const consumed = result.consumed?.[port];
      if (requested && consumed) {
        const want = streamAmount(requested);
        const got = streamAmount(consumed);
        if (want > got + Math.max(1, got) * 1e-9 && got <= limit.delivered + Math.max(1, limit.delivered) * 1e-9) {
          logisticsBinding = true;
          break;
        }
      }
      // Sources/junctions feeding a limited consumer: if activity is below planned
      // solely because this inlet was clamped, unit.limitedBy already names the port.
      if (limits.length && limits.some(name => name === port || (port === 'electricity' && name === 'electricity'))) {
        logisticsBinding = true;
        break;
      }
    }
    if (logisticsBinding) {
      result.limitedBy = [...new Set([...(result.limitedBy || []), 'logistics'])];
    }
  }
}



// Walk limitedBy upstream into a readable cause chain (symptom ← … ← root).
// Diagnosis only — does not change activities, streams, or balances.
function attachCauseChains(caseDefinition, nodeResults, edgeLimits = []) {
  const nodes = caseDefinition?.graph?.nodes || [];
  const edges = caseDefinition?.graph?.edges || [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const limitsByInlet = new Map();
  for (const limit of edgeLimits || []) {
    limitsByInlet.set(`${limit.to.node}:${limit.to.port}`, limit);
  }

  function nodeLabel(nodeId) {
    const node = nodeById.get(nodeId);
    return node?.label || nodeId;
  }

  function streamQty(stream) {
    if (!stream) return 0;
    return streamAmount(stream);
  }

  function passthroughIn(nodeId) {
    return edges.find(edge => edge.to.node === nodeId && !edge.recycle) || null;
  }

  function explainUpstream(nodeId, seen) {
    if (!nodeId || seen.has(nodeId)) return [];
    const node = nodeById.get(nodeId);
    if (!node) return [];
    const kind = UNITS[node.unit]?.kind;
    if (['junction', 'splitter', 'mixer'].includes(kind)) {
      seen.add(nodeId);
      const incoming = passthroughIn(nodeId);
      return incoming ? explainUpstream(incoming.from.node, seen) : [];
    }
    return explainNode(nodeId, seen);
  }

  function explainNode(nodeId, seen = new Set()) {
    if (!nodeId || seen.has(nodeId)) return [];
    seen.add(nodeId);
    const node = nodeById.get(nodeId);
    const result = nodeResults[nodeId];
    if (!node || !result) return [];
    const kind = UNITS[node.unit]?.kind;
    const limits = result.limitedBy || [];
    const steps = [];

    if (limits.includes('site budget')) {
      steps.push({
        code: 'site-budget',
        nodeId,
        text: `${nodeLabel(nodeId)} site budget`,
      });
      return steps;
    }

    if (kind === 'buffer' && limits.includes('inventory')) {
      steps.push({
        code: 'empty-buffer',
        nodeId,
        text: `${nodeLabel(nodeId)} buffer empty`,
      });
      return steps;
    }

    if (kind === 'buffer' && limits.includes('capacity')) {
      steps.push({
        code: 'full-buffer',
        nodeId,
        text: `${nodeLabel(nodeId)} buffer full`,
      });
      // Full tank is a local root for backpressure; still useful alone.
      return steps;
    }

    if (kind === 'sink' && limits.includes('export')) {
      const curtail = nodeById.get(nodeId)?.unit === 'electricity-sink';
      steps.push({
        code: 'export-capped',
        nodeId,
        text: curtail
          ? `${nodeLabel(nodeId)} curtailment capped`
          : `${nodeLabel(nodeId)} export capped`,
      });
      return steps;
    }

    if (kind === 'splitter' && (limits.includes('export') || limits.includes('logistics'))) {
      steps.push({
        code: 'branch-blocked',
        nodeId,
        text: `${nodeLabel(nodeId)} branch blocked`,
      });
      const downEdges = edges.filter(edge => edge.from.node === nodeId && !edge.recycle);
      for (const edge of downEdges) {
        const edgeLimit = (edgeLimits || []).find(item => (
          item.from?.node === edge.from.node && item.from?.port === edge.from.port
          && item.to?.node === edge.to.node
        ));
        if (edgeLimit) {
          steps.push({
            code: 'logistics',
            nodeId,
            text: `${edgeLimit.from.node}→${edgeLimit.to.node} logistics`,
            edge: {
              from: { ...edgeLimit.from },
              to: { ...edgeLimit.to },
              capacity: edgeLimit.capacity,
            },
            port: edge.to.port,
          });
          return steps;
        }
        const down = nodeById.get(edge.to.node);
        if (!down) continue;
        const downKind = UNITS[down.unit]?.kind;
        if (downKind === 'sink' || downKind === 'buffer' || downKind === 'splitter') {
          const more = explainNode(edge.to.node, new Set(seen));
          if (more.length) return steps.concat(more);
        }
        if (['junction', 'mixer'].includes(downKind)) {
          const through = edges.find(item => item.from.node === edge.to.node && !item.recycle);
          if (through) {
            const more = explainNode(through.to.node, new Set(seen));
            if (more.length) return steps.concat(more);
          }
        }
      }
      return steps;
    }

    if (limits.includes('export')) {
      steps.push({
        code: 'export',
        nodeId,
        text: `${nodeLabel(nodeId)} blocked by export`,
      });
      const downEdges = edges.filter(edge => edge.from.node === nodeId && !edge.recycle);
      for (const edge of downEdges) {
        const down = nodeById.get(edge.to.node);
        if (!down) continue;
        const downKind = UNITS[down.unit]?.kind;
        if (downKind === 'sink' || downKind === 'buffer' || downKind === 'splitter') {
          const more = explainNode(edge.to.node, new Set(seen));
          if (more.length) return steps.concat(more);
        }
        if (['junction', 'mixer'].includes(downKind)) {
          const through = edges.find(item => item.from.node === edge.to.node && !item.recycle);
          if (through) {
            const more = explainNode(through.to.node, new Set(seen));
            if (more.length) return steps.concat(more);
          }
        }
      }
      return steps;
    }

    if (limits.includes('logistics')) {
      // Inlet clamp (consumer) or outlet clamp (buffer/source transfer line — MECH15).
      const edgeLimit = (edgeLimits || []).find(item => item.to.node === nodeId)
        || (edgeLimits || []).find(item => item.from.node === nodeId)
        || null;
      if (edgeLimit) {
        steps.push({
          code: 'logistics',
          nodeId,
          text: `${edgeLimit.from.node}→${edgeLimit.to.node} logistics`,
          edge: {
            from: { ...edgeLimit.from },
            to: { ...edgeLimit.to },
            capacity: edgeLimit.capacity,
          },
          port: edgeLimit.to.port,
        });
        // Logistics clamp is usually the root; only keep walking if the
        // supplier itself is independently limited (site budget / inventory).
        const supplier = explainUpstream(edgeLimit.from.node, new Set(seen));
        const deep = supplier.filter(step => (
          step.code === 'site-budget'
          || step.code === 'empty-buffer'
          || step.code === 'full-buffer'
          || step.code === 'empty-source'
          || step.code === 'missing-inlet'
        ));
        return steps.concat(deep);
      }
    }

    // Prefer material/heat inlets over co-listed electricity so craft min() ties
    // do not bury a real upstream root (site budget / empty buffer).
    const inletLimits = limits.filter(limit => (
      limit !== 'logistics' && limit !== 'site budget' && limit !== 'inventory' && limit !== 'export'
    ));
    inletLimits.sort((a, b) => Number(a === 'electricity') - Number(b === 'electricity'));

    let foundRoot = false;
    for (const limit of inletLimits) {
      if (foundRoot) break;
      const port = limit;
      const edge = edges.find(item => (
        item.to.node === nodeId
        && (item.to.port === port || (port === 'electricity' && item.to.port === 'electricity'))
        && !item.recycle
      ));
      if (!edge) {
        const declared = UNITS[node.unit]?.ports?.[port];
        if (declared?.direction === 'in') {
          steps.push({
            code: 'missing-inlet',
            nodeId,
            port,
            text: `${nodeLabel(nodeId)} missing ${port}`,
          });
          foundRoot = true;
        } else if (limit === 'capacity') {
          steps.push({
            code: 'local',
            nodeId,
            limit,
            text: `${nodeLabel(nodeId)} nameplate capacity`,
          });
          foundRoot = true;
        } else if (!steps.length) {
          steps.push({
            code: 'local',
            nodeId,
            limit,
            text: `${nodeLabel(nodeId)} limited by ${limit}`,
          });
        }
        continue;
      }

      const edgeLimit = limitsByInlet.get(`${edge.to.node}:${edge.to.port}`);
      const branch = [];
      if (edgeLimit && !limits.includes('logistics')) {
        branch.push({
          code: 'logistics',
          nodeId,
          text: `${edgeLimit.from.node}→${edgeLimit.to.node} logistics`,
          edge: {
            from: { ...edgeLimit.from },
            to: { ...edgeLimit.to },
            capacity: edgeLimit.capacity,
          },
          port: edge.to.port,
        });
        foundRoot = true;
      } else {
        branch.push({
          code: 'inlet',
          nodeId,
          port,
          text: `${nodeLabel(nodeId)} short on ${port}`,
        });
      }

      const upstream = explainUpstream(edge.from.node, new Set(seen));
      if (upstream.length) {
        branch.push(...upstream);
        foundRoot = true;
        steps.push(...branch);
        break;
      }

      const upNode = nodeById.get(edge.from.node);
      const upResult = nodeResults[edge.from.node];
      if (upNode && upResult) {
        const upKind = UNITS[upNode.unit]?.kind;
        if (upKind === 'source' && streamQty(upResult.supplied || upResult.available) <= 1e-9) {
          branch.push({
            code: 'empty-source',
            nodeId: upNode.id,
            text: `${nodeLabel(upNode.id)} supplying nothing`,
          });
          foundRoot = true;
        } else if (
          upKind === 'buffer'
          && (upResult.activity || 0) <= 1e-9
          && (upResult.inventoryKg || 0) <= 1e-9
        ) {
          branch.push({
            code: 'empty-buffer',
            nodeId: upNode.id,
            text: `${nodeLabel(upNode.id)} buffer empty`,
          });
          foundRoot = true;
        }
      }

      // Keep the first unexplained inlet as a local symptom; skip later co-limits.
      if (foundRoot || !steps.length) steps.push(...branch);
      if (foundRoot) break;
    }

    if (!steps.length && limits.length) {
      steps.push({
        code: 'local',
        nodeId,
        text: `${nodeLabel(nodeId)} limited by ${limits.join(', ')}`,
      });
    }
    return steps;
  }

  for (const node of nodes) {
    const result = nodeResults[node.id];
    if (!result) continue;
    if (!result.limitedBy?.length) {
      delete result.causeChain;
      delete result.causeText;
      continue;
    }
    const chain = explainNode(node.id, new Set());
    // Drop redundant consecutive duplicates.
    const deduped = [];
    for (const step of chain) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.code === step.code && prev.nodeId === step.nodeId && prev.text === step.text) continue;
      deduped.push(step);
    }
    result.causeChain = deduped;
    result.causeText = deduped.map(step => step.text).join(' ← ');
  }
}

function unverifiedRightsWarnings(site) {
  const rights = site?.rights;
  if (!rights || typeof rights !== 'object') return [];
  return Object.entries(rights)
    .filter(([, right]) => right?.status === 'unverified')
    .map(([key]) => `unverified site right: ${key}`);
}

function siteBudgets(site) {
  return new Map(Object.entries(site?.resources || {})
    .filter(([, resource]) => resource?.stream)
    .map(([id, resource]) => [id, streamAmount(resource.stream)]));
}

function powerBudgetThrottled(nodes, nodeResults) {
  return nodes.some(node => {
    const limits = nodeResults[node.id]?.limitedBy || [];
    if (limits.includes('electricity')) return true;
    const electricSource = node.siteResource === 'electricity'
      || node.unit === 'electricity-source'
      || node.unit === 'solar-pv';
    return electricSource && limits.includes('site budget');
  });
}

// Presence and access stay distinct: every source on a sited factory must name a
// resource. Quantity is clamped later so two blocks cannot duplicate one budget.
function validateSite({ site, graph }) {
  if (!site) return;
  if (!site.resources || typeof site.resources !== 'object') throw new Error('Site needs resource budgets');
  for (const node of graph.nodes.filter(node => UNITS[node.unit].kind === 'source')) {
    const resource = site.resources[node.siteResource];
    if (!resource?.stream) throw new Error(`${node.id}: choose a verified or explicitly assumed site resource`);
    const available = validateStream(resource.stream, UNITS[node.unit].ports.out.kind);
    const requested = validateStream(node.params?.stream, available.kind);
    const quantity = streamAmount(requested);
    const limit = streamAmount(available);
    if (available.kind === 'material' && quantity > 0 && limit > 0) {
      if (available.phase !== requested.phase || available.T_C !== requested.T_C || available.P_bar !== requested.P_bar) {
        throw new Error(`${node.id}: site feed phase, temperature and pressure must be preserved`);
      }
      for (const species of new Set([...Object.keys(available.mol), ...Object.keys(requested.mol)])) {
        const expected = (available.mol[species] || 0) * quantity / limit;
        if (Math.abs((requested.mol[species] || 0) - expected) > Math.max(1, expected) * 1e-9) {
          throw new Error(`${node.id}: site feed composition must be preserved`);
        }
      }
    }
    if (available.kind === 'heat' && requested.T_C > available.T_C) throw new Error(`${node.id}: site heat is too cold`);
    if (available.kind === 'consumable' && (requested.chemicalId !== available.chemicalId || requested.unit !== available.unit)) {
      throw new Error(`${node.id}: incompatible site consumable`);
    }
  }
}

function finiteBufferCapacityKg(params = {}) {
  if (params.capacityKg == null || params.capacityKg === '') return Infinity;
  const capacity = Number(params.capacityKg);
  if (!Number.isFinite(capacity)) return Infinity;
  return nonnegative(capacity, 'capacityKg');
}

function bufferStartInventoryKg(params = {}) {
  const raw = params.inventoryKg ?? params.initialKg ?? 0;
  return nonnegative(Number(raw) || 0, 'inventoryKg');
}

function scaleMaterialToMass(stream, massKg) {
  const current = streamMassKg(stream);
  if (massKg <= 0) return scaleStream(stream, 0);
  if (current <= 0) throw new Error('Cannot scale an empty material stream to a positive mass');
  return scaleStream(stream, massKg / current);
}

// Charge inlet into inventory up to capacity, then discharge up to the setpoint.
// End inventory carries across solveHorizon hours via params.inventoryKg.
function evaluateBuffer(node, inlets, requestedActivity) {
  const params = node.params || {};
  const inlet = validateStream(inlets.in, 'material');
  const capacityKg = finiteBufferCapacityKg(params);
  let inventoryKg = bufferStartInventoryKg(params);
  if (Number.isFinite(capacityKg)) inventoryKg = Math.min(inventoryKg, capacityKg);
  const startInventoryKg = inventoryKg;

  let stored = null;
  if (params.storedStream) {
    stored = cloneStream(validateStream(params.storedStream, 'material'));
    const storedMass = streamMassKg(stored);
    if (inventoryKg > 0 && storedMass > 0) stored = scaleMaterialToMass(stored, inventoryKg);
    else if (inventoryKg <= 0) stored = scaleStream(stored, 0);
  }

  const inMass = streamMassKg(inlet);
  const free = Number.isFinite(capacityKg) ? Math.max(0, capacityKg - inventoryKg) : Infinity;
  const acceptedMass = Math.min(inMass, free);
  const limitedBy = [];
  if (acceptedMass + Math.max(1, acceptedMass) * 1e-9 < inMass) limitedBy.push('capacity');
  const accepted = scaleStream(inlet, inMass === 0 ? 0 : acceptedMass / inMass);

  if (acceptedMass > 0) {
    if (!stored || inventoryKg <= 1e-12) {
      stored = cloneStream(accepted);
      inventoryKg = acceptedMass;
    } else {
      stored = mixMaterial([scaleMaterialToMass(stored, inventoryKg), accepted]);
      inventoryKg = streamMassKg(stored);
    }
  }

  const requested = requestedActivity == null || requestedActivity === ''
    ? inventoryKg
    : nonnegative(Number(requestedActivity), 'requestedActivity');
  let dischargeMass = Math.min(requested, inventoryKg);
  if (requested > 0 && dischargeMass + Math.max(1, dischargeMass) * 1e-9 < requested) {
    limitedBy.push('inventory');
  }

  // Prefer stored composition; else learn from this hour's accepted inlet.
  // Empty inlet + initialKg without storedStream must not throw (MECH15).
  const template = stored && streamMassKg(stored) > 0
    ? stored
    : (acceptedMass > 0 ? accepted : inlet);
  const templateMass = streamMassKg(template);
  if (dischargeMass > 0 && templateMass <= 1e-15) {
    dischargeMass = 0;
    limitedBy.push('inventory');
  }
  const outlet = dischargeMass <= 0
    ? scaleStream(templateMass > 0 ? template : inlet, 0)
    : scaleMaterialToMass(template, dischargeMass);

  inventoryKg = Math.max(0, inventoryKg - dischargeMass);
  if (inventoryKg <= 1e-12) {
    inventoryKg = 0;
    stored = scaleStream(templateMass > 0 ? template : inlet, 0);
  } else if (templateMass > 1e-15) {
    stored = scaleMaterialToMass(template, inventoryKg);
  } else if (stored && streamMassKg(stored) > 1e-15) {
    stored = scaleMaterialToMass(stored, inventoryKg);
  } else {
    // Numeric SOC held; composition arrives with the next non-empty inlet.
    stored = scaleStream(inlet, 0);
  }

  return {
    activity: dischargeMass,
    inventoryKg,
    capacityKg: Number.isFinite(capacityKg) ? capacityKg : null,
    fill: Number.isFinite(capacityKg) && capacityKg > 0 ? inventoryKg / capacityKg : null,
    startInventoryKg,
    storedStream: cloneStream(stored),
    requestedInputs: { in: cloneStream(inlet) },
    consumed: { in: accepted },
    outlets: { out: outlet },
    limitedBy: [...new Set(limitedBy)],
  };
}

function sinkPeriodDays(caseDefinition) {
  const days = Number(caseDefinition?.operation?.periodDays);
  return Number.isFinite(days) && days > 0 ? days : 365;
}

function hasManualSinkAccept(node, setpoint) {
  const params = node.params || {};
  for (const key of ['acceptKg', 'acceptAmount', 'acceptKWh']) {
    if (params[key] != null && params[key] !== '') return true;
  }
  return setpoint != null && setpoint !== '';
}

function demandBackedAcceptKg(node, periodDays) {
  // Offtake honesty is for sale products. Vent/disposal/reinjection keep
  // EDITOR_DEMAND_DEFAULT on economics for the inspector seed only — not physics.
  if (node?.economics?.disposition !== 'sale') return null;
  const annual = Number(node?.economics?.annualDemandLimit);
  if (!Number.isFinite(annual) || annual < 0) return null;
  const days = Number(periodDays);
  const period = Number.isFinite(days) && days > 0 ? days : 365;
  return annual / period;
}

// Manual acceptKg / acceptAmount / acceptKWh / sink setpoint win. Else TEA
// economics.annualDemandLimit / periodDays on material-sink only (MECH7).
// Blank+no demand = unlimited. Energy sinks never demand-back (different units).
function finiteSinkAccept(node, setpoint, periodDays = 365) {
  const params = node.params || {};
  const candidates = [];
  for (const key of ['acceptKg', 'acceptAmount', 'acceptKWh']) {
    if (params[key] == null || params[key] === '') continue;
    candidates.push(nonnegative(Number(params[key]), key));
  }
  if (setpoint != null && setpoint !== '') {
    candidates.push(nonnegative(Number(setpoint), 'sinkAccept'));
  }
  if (candidates.length) return Math.min(...candidates);
  if (node?.unit === 'material-sink') {
    const demandDaily = demandBackedAcceptKg(node, periodDays);
    if (demandDaily != null) return demandDaily;
  }
  return Infinity;
}

// Optional offtake / disposal rate. Blank accept = unlimited (legacy infinite sink).
function scrubTinyNegativeMols(stream) {
  if (!stream || stream.kind !== 'material' || !stream.mol) return stream;
  let changed = false;
  const mol = { ...stream.mol };
  for (const [id, amount] of Object.entries(mol)) {
    if (amount < 0) {
      if (amount < -1e-9) {
        throw new Error(`mol.${id} must be a finite nonnegative number`);
      }
      mol[id] = 0;
      changed = true;
    }
  }
  return changed ? { ...stream, mol } : stream;
}

function safeStreamAmount(stream) {
  return streamAmount(scrubTinyNegativeMols(stream));
}

function evaluateSink(node, inlet, setpoint, periodDays = 365) {
  const clean = scrubTinyNegativeMols(inlet);
  const requested = streamAmount(clean);
  const acceptCap = finiteSinkAccept(node, setpoint, periodDays);
  const acceptedAmt = Math.min(requested, acceptCap);
  const limitedBy = [];
  const isEnergy = clean.kind === 'electricity' || clean.kind === 'heat';
  if (acceptedAmt + Math.max(1, acceptedAmt) * 1e-9 < requested) limitedBy.push('export');
  else if (
    isEnergy
    && Number.isFinite(acceptCap)
    && acceptCap > 0
    && requested + Math.max(1, acceptCap) * 1e-9 >= acceptCap
  ) {
    // Bus allocation already delivered exactly the accept cap — still a binding
    // curtailment/export limit even though the allocated inlet equals the cap.
    limitedBy.push('export');
  }
  const accepted = scaleStream(clean, requested === 0 ? 0 : acceptedAmt / requested);
  let acceptSource = null;
  if (Number.isFinite(acceptCap)) {
    acceptSource = hasManualSinkAccept(node, setpoint) ? 'manual' : 'demand';
  }
  return {
    received: accepted,
    acceptKg: !isEnergy && Number.isFinite(acceptCap) ? acceptCap : null,
    acceptKWh: isEnergy && Number.isFinite(acceptCap) ? acceptCap : null,
    acceptSource,
    requestedInputs: { in: cloneStream(inlet) },
    consumed: { in: accepted },
    limitedBy,
  };
}

function scaleNodeStreams(result, scale) {
  if (!(scale < 1 - 1e-15)) return result;
  if (result.activity != null) result.activity *= scale;
  for (const group of ['requestedInputs', 'consumed', 'outlets']) {
    const bag = result[group];
    if (!bag) continue;
    for (const [port, stream] of Object.entries(bag)) {
      bag[port] = scaleStream(stream, scale);
    }
  }
  return result;
}


// MECH12 + MECH13: Factorio splitter overflow with optional priority fill.
// Capacities are per-branch maxima (sink accept / edge cap, or frozen delivered
// for non-sink targets). Among eligible outlets, water-fill only the current
// highest-priority tier by weight; when that tier saturates, spill to the next
// (MECH12). Equal / unset priorities (default 0) → bit-identical to MECH12.
// Inlet rejects only after every useful tier saturates.
function allocateSplitterOverflow(available, weights, capacities, priorities = null) {
  const n = weights.length;
  const alloc = Array(n).fill(0);
  let remaining = Math.max(0, available);
  const prios = priorities && priorities.length === n
    ? priorities.map(value => {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    })
    : Array(n).fill(0);
  const eligible = new Set();
  for (let i = 0; i < n; i += 1) {
    if (weights[i] > 0 && capacities[i] > 1e-15) eligible.add(i);
  }
  let guard = 0;
  while (remaining > 1e-12 && eligible.size && guard < n + 3) {
    guard += 1;
    let maxPrio = -Infinity;
    for (const i of eligible) maxPrio = Math.max(maxPrio, prios[i]);
    const active = new Set();
    for (const i of eligible) {
      if (prios[i] === maxPrio) active.add(i);
    }
    let weightSum = 0;
    for (const i of active) weightSum += weights[i];
    if (weightSum <= 0) {
      for (const i of active) eligible.delete(i);
      continue;
    }
    const saturated = [];
    for (const i of active) {
      const offer = remaining * (weights[i] / weightSum);
      const room = capacities[i] - alloc[i];
      if (offer > room + Math.max(1, room) * 1e-9) {
        alloc[i] = capacities[i];
        saturated.push(i);
      }
    }
    if (saturated.length) {
      for (const i of saturated) eligible.delete(i);
      remaining = available - alloc.reduce((sum, value) => sum + value, 0);
      if (remaining < 0) remaining = 0;
      continue;
    }
    for (const i of active) {
      alloc[i] += remaining * (weights[i] / weightSum);
    }
    remaining = 0;
  }
  return alloc;
}

function bufferOutletEdge(bufferNode, edges) {
  if (!bufferNode) return null;
  return edges.find(edge => edge.from.node === bufferNode.id && !edge.recycle) || null;
}

// MECH14 sink absorb + MECH16 converter absorb. Mixer / nested splitter /
// buffer→buffer stay frozen (need a fuller cascade pass).
function bufferOutletCanAbsorbOverflow(bufferNode, edges, nodeById) {
  const outEdge = bufferOutletEdge(bufferNode, edges);
  if (!outEdge) return false;
  const target = nodeById.get(outEdge.to.node);
  if (!target) return false;
  const kind = UNITS[target.unit]?.kind;
  return kind === 'sink' || kind === 'converter';
}

function bankBufferOutletReject(result, delivered, reason = 'export') {
  if (!result?.outlets?.out || !delivered) return;
  const produced = scrubTinyNegativeMols(result.outlets.out);
  const gotStream = scrubTinyNegativeMols(delivered);
  const want = safeStreamAmount(produced);
  const got = safeStreamAmount(gotStream);
  if (!(want > 1e-15) || !(got + Math.max(1, got) * 1e-9 < want)) return;
  const rejected = want - got;
  result.outlets.out = cloneStream(gotStream);
  result.activity = got;
  result.inventoryKg = (result.inventoryKg || 0) + rejected;
  if (result.capacityKg != null && Number.isFinite(result.capacityKg)) {
    result.inventoryKg = Math.min(result.inventoryKg, result.capacityKg);
    result.fill = result.capacityKg > 0 ? result.inventoryKg / result.capacityKg : null;
  }
  if (result.storedStream && result.inventoryKg > 1e-12) {
    try {
      result.storedStream = scaleMaterialToMass(
        streamMassKg(result.storedStream) > 1e-15 ? result.storedStream : produced,
        result.inventoryKg
      );
    } catch {
      result.storedStream = cloneStream(produced.kind === 'material' ? produced : result.storedStream);
    }
  }
  result.limitedBy = [...new Set([...(result.limitedBy || []), reason || 'export'])];
}

function bufferOverflowRoomKg(down, downResult) {
  if (!downResult) return 0;
  const start = Number(downResult.startInventoryKg);
  const startInv = Number.isFinite(start) ? Math.max(0, start) : 0;
  const capacityKg = downResult.capacityKg;
  if (capacityKg == null || !Number.isFinite(capacityKg)) return Infinity;
  return Math.max(0, capacityKg - startInv);
}

function splitterBranchCapacity(edge, deliveredAmt, down, downResult, edges, nodeById) {
  const downKind = down ? UNITS[down.unit]?.kind : null;
  const edgeCap = finiteEdgeCapacity(edge);
  if (downKind === 'sink') {
    let cap = Infinity;
    if (downResult?.acceptKg != null && Number.isFinite(downResult.acceptKg)) {
      cap = downResult.acceptKg;
    } else if (downResult?.acceptKWh != null && Number.isFinite(downResult.acceptKWh)) {
      cap = downResult.acceptKWh;
    }
    if (Number.isFinite(edgeCap)) cap = Math.min(cap, edgeCap);
    return Math.max(0, cap);
  }
  // MECH14/16: free material-buffer legs absorb leftover up to remaining tank
  // room when outlet feeds a sink or converter. Mixer / nested splitter /
  // buffer→buffer stay frozen.
  if (downKind === 'buffer' && bufferOutletCanAbsorbOverflow(down, edges, nodeById)) {
    let cap = bufferOverflowRoomKg(down, downResult);
    if (Number.isFinite(edgeCap)) cap = Math.min(cap, edgeCap);
    return Math.max(0, cap);
  }
  // Non-absorbing targets: freeze at current delivered — no invented inventory.
  let cap = Math.max(0, deliveredAmt);
  if (Number.isFinite(edgeCap)) cap = Math.min(cap, edgeCap);
  return cap;
}

function refreshSinkFromOffer(sink, sinkResult, next) {
  if (!sink || !sinkResult || !next) return;
  sinkResult.received = cloneStream(next);
  if (sinkResult.consumed) sinkResult.consumed.in = cloneStream(next);
  if (sinkResult.requestedInputs) {
    const prevReq = sinkResult.requestedInputs.in;
    const prevAmt = prevReq ? safeStreamAmount(prevReq) : 0;
    const got = safeStreamAmount(next);
    if (got + Math.max(1, got) * 1e-9 >= prevAmt) {
      sinkResult.requestedInputs.in = cloneStream(next);
    }
  }
  const accept = sinkResult.acceptKg != null && Number.isFinite(sinkResult.acceptKg)
    ? sinkResult.acceptKg
    : (sinkResult.acceptKWh != null && Number.isFinite(sinkResult.acceptKWh)
      ? sinkResult.acceptKWh
      : Infinity);
  const got = safeStreamAmount(next);
  if (Number.isFinite(accept) && got + Math.max(1, got) * 1e-9 >= accept && accept >= 0) {
    sinkResult.limitedBy = [...new Set([...(sinkResult.limitedBy || []), 'export'])];
  } else if (Number.isFinite(accept) && got + Math.max(1, accept) * 1e-9 < accept) {
    sinkResult.limitedBy = (sinkResult.limitedBy || []).filter(item => item !== 'export');
  }
}

// MECH16: after buffer outlet grows, re-craft the downstream converter from
// current edgeStreams inlets and bank any unconsumed feed back into the tank.
function inletOfferForConverterReeval(edge, feedEdge, nodeResults, nodeById, edgeStreams) {
  const current = edgeStreams.get(edge);
  if (!current) return scaleStream({ kind: 'electricity', kWh: 0 }, 0);
  if (edge === feedEdge) return cloneStream(current);
  const up = nodeById.get(edge.from.node);
  const upResult = up ? nodeResults[up.id] : null;
  const kind = up ? UNITS[up.unit]?.kind : null;
  // Direct sources still hold full available; edgeStreams may already be the
  // first-pass consumed stub. Bus/junction keep the allocated edge (plan-pass
  // foresight for buffer→converter overflow stays deferred).
  if (kind === 'source' && upResult?.available) return cloneStream(upResult.available);
  if ((kind === 'converter' || kind === 'buffer') && upResult?.outlets?.[edge.from.port]) {
    return cloneStream(upResult.outlets[edge.from.port]);
  }
  return cloneStream(current);
}

function reevaluateConverterAfterBufferFeed(
  converter, feedEdge, bufferResult, edges, edgeStreams, nodeResults, nodeById, edgeLimits, setpoints
) {
  const unit = UNITS[converter.unit];
  if (!unit?.evaluate) return;
  const incoming = edges.filter(edge => edge.to.node === converter.id && !edge.recycle);
  const outgoing = edges.filter(edge => edge.from.node === converter.id && !edge.recycle);
  const inlets = Object.fromEntries(
    incoming.map(edge => [
      edge.to.port,
      inletOfferForConverterReeval(edge, feedEdge, nodeResults, nodeById, edgeStreams),
    ])
  );
  const result = unit.evaluate({
    inlets,
    requestedActivity: setpoints ? setpoints[converter.id] : undefined,
    capacity: converter.capacity,
    params: converter.params,
  });
  nodeResults[converter.id] = result;
  for (const edge of incoming) {
    const consumed = result.consumed?.[edge.to.port];
    if (consumed) edgeStreams.set(edge, cloneStream(consumed));
  }
  for (const edge of outgoing) {
    let outlet = result.outlets?.[edge.from.port];
    if (!outlet) continue;
    // Quiet re-clamp — do not duplicate edgeLimits rows from the topo pass.
    const capacity = finiteEdgeCapacity(edge);
    const requested = safeStreamAmount(outlet);
    if (Number.isFinite(capacity) && requested > capacity + Math.max(1, capacity) * 1e-9) {
      outlet = scaleStream(outlet, requested === 0 ? 0 : capacity / requested);
    }
    edgeStreams.set(edge, cloneStream(outlet));
    const down = nodeById.get(edge.to.node);
    const downResult = nodeResults[edge.to.node];
    if (down && UNITS[down.unit]?.kind === 'sink' && downResult) {
      refreshSinkFromOffer(down, downResult, outlet);
    }
  }
  const taken = edgeStreams.get(feedEdge);
  if (taken) {
    bankBufferOutletReject(bufferResult, taken);
    edgeStreams.set(feedEdge, cloneStream(bufferResult.outlets.out));
  }
}

function applyBufferOverflowIntake(
  down, downResult, offer, setpoint, edges, edgeStreams, nodeResults, nodeById, edgeLimits = null, setpoints = null
) {
  const result = evaluateBuffer(down, { in: offer }, setpoint);
  nodeResults[down.id] = result;
  const inEdge = edges.find(edge => edge.to.node === down.id && !edge.recycle);
  if (inEdge) edgeStreams.set(inEdge, cloneStream(result.consumed.in));
  const outEdge = edges.find(edge => edge.from.node === down.id && !edge.recycle);
  if (outEdge && result.outlets?.out) {
    let outStream = cloneStream(result.outlets.out);
    const capacity = finiteEdgeCapacity(outEdge);
    const requested = safeStreamAmount(outStream);
    if (Number.isFinite(capacity) && requested > capacity + Math.max(1, capacity) * 1e-9) {
      outStream = scaleStream(outStream, requested === 0 ? 0 : capacity / requested);
      if (edgeLimits) {
        edgeLimits.push({
          from: { node: outEdge.from.node, port: outEdge.from.port },
          to: { node: outEdge.to.node, port: outEdge.to.port },
          port: outEdge.to.port,
          capacity,
          requested,
          delivered: safeStreamAmount(outStream),
        });
      }
      bankBufferOutletReject(result, outStream, 'logistics');
      outStream = cloneStream(result.outlets.out);
    }
    edgeStreams.set(outEdge, outStream);
    const target = nodeById.get(outEdge.to.node);
    const targetKind = target ? UNITS[target.unit]?.kind : null;
    if (targetKind === 'sink') {
      refreshSinkFromOffer(target, nodeResults[outEdge.to.node], result.outlets.out);
    } else if (targetKind === 'converter') {
      reevaluateConverterAfterBufferFeed(
        target, outEdge, result, edges, edgeStreams, nodeResults, nodeById, edgeLimits, setpoints
      );
    }
  }
  return safeStreamAmount(result.consumed?.in);
}

// Part-load k on a lift block. Captured before scaleNodeStreams so the electricity
// edge is still this pass's pre-scale allocation (consumed, not yet scaled).
function liftPartLoadSnapshot(node, result, incoming, edgeStreams) {
  const pump = node.unit === 'intake-pump';
  const blower = node.unit === 'gas-blower';
  if (!pump && !blower) return null;
  const k = pump ? result.pumpPartLoadK : result.blowerPartLoadK;
  if (!Number.isFinite(k)) return null;
  const multiplier = pump ? result.pumpPartLoadMultiplier : result.blowerPartLoadMultiplier;
  const secEff = pump ? result.pumpKWhPerUnit : result.blowerKWhPerUnit;
  if (!Number.isFinite(multiplier) || !(multiplier > 0) || !Number.isFinite(secEff)) return null;
  const elecEdge = incoming.find(edge => edge.to.port === 'electricity');
  const stream = elecEdge ? edgeStreams.get(elecEdge) : null;
  const availableKWh = stream && Number.isFinite(Number(stream.kWh)) ? Number(stream.kWh) : Infinity;
  const ratedRaw = node.capacity == null || node.capacity === '' ? 0 : Number(node.capacity);
  return {
    pump,
    baseSec: secEff / multiplier,
    rated: Number.isFinite(ratedRaw) ? ratedRaw : 0,
    params: { ...(node.params || {}) },
    availableKWh,
  };
}

function scaleLiftMaterial(result, factor) {
  if (!(factor >= 0) || !(factor < 1 - 1e-15)) return;
  if (result.activity != null) result.activity *= factor;
  for (const group of ['consumed', 'outlets']) {
    const bag = result[group];
    if (!bag) continue;
    for (const [port, stream] of Object.entries(bag)) {
      if (!stream || stream.kind === 'electricity' || stream.kind === 'heat') continue;
      bag[port] = scaleStream(stream, factor);
    }
  }
}

// Mass already scaled linearly. Re-fit shaped SEC at the delivered Q. If that
// kWh no longer fits the pre-scale bus, bisect Q down — no second graph pass.
function applyLiftPartLoadAfterScale(result, snap) {
  let Q = Number(result.activity);
  if (!Number.isFinite(Q) || Q < 0) Q = 0;
  let shaped = pumpPartLoad(snap.params, Q, snap.rated);
  let kWh = Q * snap.baseSec * shaped.multiplier;
  const available = snap.availableKWh;
  if (Number.isFinite(available) && kWh > available) {
    const fitted = flowWithinShapedSec(snap.baseSec, snap.params, Q, snap.rated, available);
    if (Q > 0 && fitted < Q) {
      scaleLiftMaterial(result, fitted / Q);
      Q = Number(result.activity);
      if (!Number.isFinite(Q) || Q < 0) Q = 0;
      shaped = pumpPartLoad(snap.params, Q, snap.rated);
      kWh = Q * snap.baseSec * shaped.multiplier;
    }
  }
  if (!result.consumed) result.consumed = {};
  result.consumed.electricity = { ...(result.consumed.electricity || {}), kind: 'electricity', kWh };
  const prefix = snap.pump ? 'pump' : 'blower';
  result[`${prefix}KWhPerUnit`] = snap.baseSec * shaped.multiplier;
  if (shaped.k == null) return;
  result[`${prefix}PartLoadK`] = shaped.k;
  result[`${prefix}PartLoadQ`] = shaped.q;
  result[`${prefix}PartLoadMultiplier`] = shaped.multiplier;
  if (shaped.clamped) result[`${prefix}PartLoadClamped`] = true;
}

function syncLiftElectricityTag(result, availableKWh) {
  const kWh = Number(result.consumed?.electricity?.kWh);
  if (!Number.isFinite(kWh)) return;
  const tol = Math.max(1, kWh) * 1e-9;
  const under = !Number.isFinite(availableKWh) || kWh + tol < availableKWh;
  if (under) {
    if (result.limitedBy) result.limitedBy = result.limitedBy.filter(item => item !== 'electricity');
  } else {
    result.limitedBy = [...new Set([...(result.limitedBy || []), 'electricity'])];
  }
}

// After sinks/buffers rewrite inlets, scale upstream producers so mass/energy close
// and converters actually throttle (Factorio full-belt / closed offtake).
function reconcileBackpressure(nodes, edges, edgeStreams, nodeResults, edgeLimits = null, setpoints = null) {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const order = topologicalOrder(nodes, edges).slice().reverse();
  for (const node of order) {
    const unit = UNITS[node.unit];
    const result = nodeResults[node.id];
    if (!result || !unit) continue;
    const incoming = edges.filter(edge => edge.to.node === node.id && !edge.recycle);
    const outgoing = edges.filter(edge => edge.from.node === node.id && !edge.recycle);

    if (unit.kind === 'converter') {
      let scale = 1;
      let reason = null;
      for (const edge of outgoing) {
        let produced = result.outlets?.[edge.from.port];
        let delivered = edgeStreams.get(edge);
        if (!produced || !delivered) continue;
        produced = scrubTinyNegativeMols(produced);
        delivered = scrubTinyNegativeMols(delivered);
        result.outlets[edge.from.port] = produced;
        edgeStreams.set(edge, delivered);
        const down = nodeById.get(edge.to.node);
        const downResult = nodeResults[edge.to.node];
        const downKind = down ? UNITS[down.unit]?.kind : null;
        const downLimits = downResult?.limitedBy || [];
        let binding = null;
        if (downKind === 'sink' && downLimits.includes('export')) binding = 'export';
        else if (downKind === 'buffer' && (downLimits.includes('capacity') || downLimits.includes('export'))) {
          binding = 'export';
        } else if ((downKind === 'mixer' || downKind === 'junction') && downLimits.includes('export')) {
          binding = 'export';
        } else if (downKind === 'splitter' && (
          downLimits.includes('export') || downLimits.includes('logistics')
        )) {
          binding = downLimits.includes('export') ? 'export' : 'logistics';
        } else if (edgeLimits?.some(item => (
          item.from?.node === edge.from.node && item.from?.port === edge.from.port
          && item.to?.node === edge.to.node
        ))) binding = 'logistics';
        // Downstream converter under-drawing: backpressure when the consumer is
        // blocked by something other than THIS feed port (H2-short Sabatier must
        // push back on DAC CO2; intake pumps / blowers always match pull).
        if (!binding && downKind === 'converter') {
          const wantDown = safeStreamAmount(produced);
          const gotDown = safeStreamAmount(delivered);
          if (wantDown > 1e-15 && gotDown + Math.max(1, gotDown) * 1e-9 < wantDown) {
            const feedPorts = new Set([
              'in', 'feed', 'air', 'brine', 'co2', 'hydrogen', 'water', 'salt',
              'nitrogen', 'chlorine', 'bromide', 'consumables', 'electricity', 'heat',
            ]);
            const limitedByThisFeed = downLimits.includes(edge.to.port);
            const isLift = node.unit === 'intake-pump' || node.unit === 'gas-blower';
            const blockedOtherwise = downLimits.some(limit => (
              limit === 'export' || limit === 'logistics' || limit === 'capacity'
              || (!feedPorts.has(limit) && limit !== edge.to.port)
            ));
            if (isLift || (!limitedByThisFeed && (blockedOtherwise || downLimits.includes('hydrogen') || downLimits.includes('electricity') || downLimits.includes('export')))) {
              binding = downLimits.includes('logistics') ? 'logistics' : 'export';
            }
          }
        }
        if (!binding) continue;
        const want = safeStreamAmount(produced);
        const got = safeStreamAmount(delivered);
        if (want > 1e-15 && got + Math.max(1, got) * 1e-9 < want) {
          scale = Math.min(scale, got / want);
          reason = binding;
        }
      }
      if (scale < 1 - 1e-12) {
        const lift = liftPartLoadSnapshot(node, result, incoming, edgeStreams);
        scaleNodeStreams(result, scale);
        if (lift) applyLiftPartLoadAfterScale(result, lift);
        if (reason) result.limitedBy = [...new Set([...(result.limitedBy || []), reason])];
        if (lift) syncLiftElectricityTag(result, lift.availableKWh);
        for (const edge of incoming) {
          const consumed = result.consumed?.[edge.to.port];
          if (consumed) edgeStreams.set(edge, cloneStream(consumed));
        }
        for (const edge of outgoing) {
          const outlet = result.outlets?.[edge.from.port];
          if (outlet) edgeStreams.set(edge, applyEdgeCapacity(edge, outlet, null));
        }
      }
      continue;
    }

    if (unit.kind === 'buffer') {
      const outEdge = outgoing[0];
      if (!outEdge || !result.outlets?.out) continue;
      let produced = scrubTinyNegativeMols(result.outlets.out);
      let delivered = scrubTinyNegativeMols(edgeStreams.get(outEdge));
      if (!delivered) continue;
      result.outlets.out = produced;
      edgeStreams.set(outEdge, delivered);
      const want = safeStreamAmount(produced);
      const got = safeStreamAmount(delivered);
      if (want > 1e-15 && got + Math.max(1, got) * 1e-9 < want) {
        const rejected = want - got;
        result.outlets.out = cloneStream(delivered);
        result.activity = got;
        result.inventoryKg = (result.inventoryKg || 0) + rejected;
        if (result.capacityKg != null && Number.isFinite(result.capacityKg)) {
          result.inventoryKg = Math.min(result.inventoryKg, result.capacityKg);
          result.fill = result.capacityKg > 0 ? result.inventoryKg / result.capacityKg : null;
        }
        if (result.storedStream && result.inventoryKg > 1e-12) {
          try {
            result.storedStream = scaleMaterialToMass(
              streamMassKg(result.storedStream) > 1e-15 ? result.storedStream : produced,
              result.inventoryKg
            );
          } catch {
            result.storedStream = cloneStream(delivered.kind === 'material' ? produced : result.storedStream);
          }
        }
        // MECH15: outlet edge.capacity → logistics; dest-full / export BP → export.
        const outletLogistics = edgeLimits?.some(item => (
          item.from?.node === node.id
          && item.from?.port === outEdge.from.port
          && item.to?.node === outEdge.to.node
        ));
        result.limitedBy = [...new Set([
          ...(result.limitedBy || []),
          outletLogistics ? 'logistics' : 'export',
        ])];
        edgeStreams.set(outEdge, cloneStream(delivered));
      }
      continue;
    }

    // Single-outlet junctions/mixers only. Electrical-bus (and any fan-out
    // junction) carries one available and many allocated legs — do not scale.
    if (unit.kind === 'mixer' || (unit.kind === 'junction' && outgoing.length === 1)) {
      const outEdge = outgoing[0];
      if (!outEdge || !result.available) continue;
      result.available = scrubTinyNegativeMols(result.available);
      const outStream = scrubTinyNegativeMols(edgeStreams.get(outEdge) || result.available);
      edgeStreams.set(outEdge, outStream);
      const want = safeStreamAmount(result.available);
      const got = safeStreamAmount(outStream);
      if (want > 1e-15 && got + Math.max(1, got) * 1e-9 < want) {
        const scale = got / want;
        result.available = scaleStream(result.available, scale);
        result.limitedBy = [...new Set([...(result.limitedBy || []), 'export'])];
        if (unit.kind === 'mixer') {
          for (const edge of incoming) {
            const prior = edgeStreams.get(edge);
            if (prior) edgeStreams.set(edge, scaleStream(prior, scale));
          }
        } else if (incoming[0]) {
          edgeStreams.set(incoming[0], cloneStream(result.available));
        }
        edgeStreams.set(outEdge, cloneStream(result.available));
      }
      continue;
    }

    // Material splitter (MECH12–16): priority tiers fill first, then Factorio
    // overflow rebalances onto free sink / buffer(→sink|converter) legs by weight;
    // inlet backpressures only when leftover remains after useful legs saturate.
    if (unit.kind === 'splitter') {
      if (!result.available || !outgoing.length) continue;
      result.available = scrubTinyNegativeMols(result.available);
      const want = safeStreamAmount(result.available);
      const weights = outgoing.map(edge => nonnegative(Number(edge.weight ?? 1), 'split weight'));
      const priorities = outgoing.map(edge => {
        const value = Number(edge.priority);
        return Number.isFinite(value) ? value : 0;
      });
      const deliveredAmts = [];
      const capacities = [];
      let reason = null;
      for (let i = 0; i < outgoing.length; i += 1) {
        const edge = outgoing[i];
        let delivered = edgeStreams.get(edge);
        if (!delivered) delivered = scaleStream(result.available, 0);
        delivered = scrubTinyNegativeMols(delivered);
        edgeStreams.set(edge, delivered);
        const deliveredAmt = safeStreamAmount(delivered);
        deliveredAmts.push(deliveredAmt);
        const down = nodeById.get(edge.to.node);
        const downResult = nodeResults[edge.to.node];
        const downKind = down ? UNITS[down.unit]?.kind : null;
        const downLimits = downResult?.limitedBy || [];
        capacities.push(splitterBranchCapacity(edge, deliveredAmt, down, downResult, edges, nodeById));
        if (downKind === 'sink' && downLimits.includes('export')) reason = reason || 'export';
        else if (downKind === 'buffer' && (downLimits.includes('capacity') || downLimits.includes('export'))) {
          reason = reason || 'export';
        } else if ((downKind === 'mixer' || downKind === 'junction' || downKind === 'splitter')
          && (downLimits.includes('export') || downLimits.includes('logistics'))) {
          reason = reason || (downLimits.includes('export') ? 'export' : 'logistics');
        } else if (edgeLimits?.some(item => (
          item.from?.node === edge.from.node && item.from?.port === edge.from.port
          && item.to?.node === edge.to.node
        ))) reason = reason || 'logistics';
      }
      if (!(want > 1e-15)) continue;
      const alloc = allocateSplitterOverflow(want, weights, capacities, priorities);
      let got = 0;
      for (let i = 0; i < outgoing.length; i += 1) {
        const edge = outgoing[i];
        const target = Math.max(0, alloc[i]);
        const next = scrubTinyNegativeMols(scaleStream(result.available, want === 0 ? 0 : target / want));
        edgeStreams.set(edge, next);
        const down = nodeById.get(edge.to.node);
        const downResult = nodeResults[edge.to.node];
        const downKind = down ? UNITS[down.unit]?.kind : null;
        if (downKind === 'buffer' && downResult && bufferOutletCanAbsorbOverflow(down, edges, nodeById)) {
          // MECH14/16: re-charge tank; if outlet → converter, re-craft (two-pass).
          const setpoint = setpoints ? setpoints[down.id] : undefined;
          got += applyBufferOverflowIntake(
            down, downResult, next, setpoint, edges, edgeStreams, nodeResults, nodeById,
            edgeLimits, setpoints
          );
          continue;
        }
        got += target;
        if (downKind === 'sink' && downResult) {
          downResult.received = cloneStream(next);
          if (downResult.consumed) downResult.consumed.in = cloneStream(next);
          if (downResult.requestedInputs) {
            // Keep requested at the pre-overflow offer when larger; else match.
            const prevReq = downResult.requestedInputs.in;
            const prevAmt = prevReq ? safeStreamAmount(prevReq) : 0;
            if (target + Math.max(1, target) * 1e-9 >= prevAmt) {
              downResult.requestedInputs.in = cloneStream(next);
            }
          }
          const accept = downResult.acceptKg != null && Number.isFinite(downResult.acceptKg)
            ? downResult.acceptKg
            : (downResult.acceptKWh != null && Number.isFinite(downResult.acceptKWh)
              ? downResult.acceptKWh
              : Infinity);
          if (Number.isFinite(accept) && target + Math.max(1, target) * 1e-9 >= accept && accept >= 0) {
            downResult.limitedBy = [...new Set([...(downResult.limitedBy || []), 'export'])];
          } else if (Number.isFinite(accept) && target + Math.max(1, accept) * 1e-9 < accept) {
            downResult.limitedBy = (downResult.limitedBy || []).filter(item => item !== 'export');
          }
        }
      }
      if (got + Math.max(1, got) * 1e-9 < want) {
        const scale = got / want;
        result.available = scaleStream(result.available, scale);
        result.limitedBy = [...new Set([...(result.limitedBy || []), reason || 'export'])];
        if (incoming[0]) edgeStreams.set(incoming[0], cloneStream(result.available));
      } else {
        // Fully absorbed (possibly via overflow) — clear stale export/logistics
        // tags from an earlier pass so upstream converters stay unthrottled.
        result.limitedBy = (result.limitedBy || []).filter(item => item !== 'export' && item !== 'logistics');
      }
      continue;
    }
  }

  // After upstream converters shrink waste-heat/product edges, refresh sink
  // receipts so heat/electricity balances stay closed (MECH11 lift backpressure).
  for (const node of nodes) {
    const unit = UNITS[node.unit];
    if (unit?.kind !== 'sink') continue;
    const result = nodeResults[node.id];
    if (!result) continue;
    const incoming = edges.filter(edge => edge.to.node === node.id && !edge.recycle);
    const streams = incoming.map(edge => edgeStreams.get(edge)).filter(Boolean);
    if (!streams.length) continue;
    if (streams[0].kind === 'heat') {
      result.received = streams.length > 1 ? mixHeat(streams) : cloneStream(streams[0]);
    } else if (streams[0].kind === 'electricity') {
      const kWh = streams.reduce((sum, stream) => sum + (Number(stream.kWh) || 0), 0);
      result.received = { kind: 'electricity', kWh };
    }
  }
}

function evaluateGraph(caseDefinition, allocations, recycleStreams = new Map(), edgeLimits = null) {
  const { nodes, edges } = caseDefinition.graph;
  const remaining = siteBudgets(caseDefinition.site);
  const edgeStreams = new Map([...recycleStreams].map(([edge, stream]) => [edge, cloneStream(stream)]));
  const nodeResults = {};
  const setOutlet = (edge, stream) => {
    edgeStreams.set(edge, applyEdgeCapacity(edge, stream, edgeLimits));
  };
  for (const node of topologicalOrder(nodes, edges)) {
    const unit = UNITS[node.unit];
    const incoming = edges.filter(edge => edge.to.node === node.id);
    const outgoing = edges.filter(edge => edge.from.node === node.id);
    if (unit.kind === 'source') {
      let stream = cloneStream(validateStream(node.params?.stream, unit.ports.out.kind));
      const limitedBy = [];
      let siteAvailable = null;
      if (caseDefinition.site && remaining.has(node.siteResource)) {
        const requested = streamAmount(stream);
        siteAvailable = remaining.get(node.siteResource);
        if (requested > siteAvailable + Math.max(1, siteAvailable) * 1e-9) {
          stream = scaleStream(stream, requested === 0 ? 0 : siteAvailable / requested);
          limitedBy.push('site budget');
        }
      }
      if (outgoing[0]) stream = applyEdgeCapacity(outgoing[0], stream, edgeLimits);
      if (siteAvailable != null) {
        remaining.set(node.siteResource, Math.max(0, siteAvailable - streamAmount(stream)));
      }
      nodeResults[node.id] = { available: stream, limitedBy };
      if (outgoing[0]) edgeStreams.set(outgoing[0], stream);
      continue;
    }
    if (unit.kind === 'junction') {
      const available = cloneStream(edgeStreams.get(incoming[0]));
      nodeResults[node.id] = { available };
      for (const edge of outgoing) {
        // Plan pass (allocations == null): leave full bus power on each fan-out so
        // converters report unconstrained wanted/usable. Cable caps bind inside
        // allocateElectricity (and are re-applied below on the allocated pass).
        if (!allocations) edgeStreams.set(edge, cloneStream(available));
        else setOutlet(edge, allocations.get(edge) || cloneStream(available));
      }
      continue;
    }
    if (unit.kind === 'splitter') {
      const available = cloneStream(edgeStreams.get(incoming[0]));
      const weights = outgoing.map(edge => nonnegative(Number(edge.weight ?? 1), 'split weight'));
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      if (totalWeight === 0) throw new Error(`${node.id} split weights cannot all be zero`);
      nodeResults[node.id] = { available };
      outgoing.forEach((edge, index) => setOutlet(edge, scaleStream(available, weights[index] / totalWeight)));
      continue;
    }
    if (unit.kind === 'mixer') {
      const available = mixMaterial(incoming.map(edge => edgeStreams.get(edge)));
      nodeResults[node.id] = { available };
      setOutlet(outgoing[0], available);
      continue;
    }
    const inlets = Object.fromEntries(
      incoming.map(edge => [edge.to.port, cloneStream(edgeStreams.get(edge))])
    );
    if (unit.kind === 'buffer') {
      const result = evaluateBuffer(node, inlets, caseDefinition.operation?.setpoints?.[node.id]);
      nodeResults[node.id] = result;
      for (const edge of incoming) edgeStreams.set(edge, result.consumed[edge.to.port]);
      for (const edge of outgoing) setOutlet(edge, result.outlets[edge.from.port]);
      continue;
    }
    if (unit.kind === 'sink') {
      const incomingStreams = incoming.map(edge => cloneStream(edgeStreams.get(edge)));
      const setpoint = caseDefinition.operation?.setpoints?.[node.id];
      const periodDays = sinkPeriodDays(caseDefinition);
      if (!incomingStreams.length) {
        nodeResults[node.id] = { received: null, limitedBy: [] };
        continue;
      }
      const inletKind = incomingStreams[0].kind;
      if (inletKind === 'material' || inletKind === 'consumable') {
        const result = evaluateSink(node, incomingStreams[0], setpoint, periodDays);
        nodeResults[node.id] = result;
        for (const edge of incoming) edgeStreams.set(edge, result.consumed[edge.to.port] || result.consumed.in);
      } else if (inletKind === 'electricity' || inletKind === 'heat') {
        // Heat sinks allow fan-in; mix first, then clamp, then scale each leg.
        const inlet = incomingStreams.length > 1 ? mixHeat(incomingStreams) : incomingStreams[0];
        const result = evaluateSink(node, inlet, setpoint, periodDays);
        nodeResults[node.id] = result;
        const want = streamAmount(inlet);
        const got = streamAmount(result.received);
        const scale = want === 0 ? 0 : got / want;
        for (const edge of incoming) {
          const prior = edgeStreams.get(edge);
          edgeStreams.set(edge, scaleStream(prior, scale));
        }
      } else {
        nodeResults[node.id] = {
          received: incomingStreams.length > 1 ? mixHeat(incomingStreams) : incomingStreams[0],
        };
      }
      continue;
    }
    const result = unit.evaluate({
      inlets,
      requestedActivity: caseDefinition.operation?.setpoints?.[node.id],
      capacity: node.capacity,
      params: node.params,
    });
    nodeResults[node.id] = result;
    for (const edge of incoming) edgeStreams.set(edge, result.consumed[edge.to.port]);
    for (const edge of outgoing) setOutlet(edge, result.outlets[edge.from.port]);
  }
  // Plan pass (allocations == null) with a power bus must leave producers at full
  // wanted so allocateElectricity sees true demand. Export/buffer backpressure
  // runs on the allocated pass (and on graphs with no bus).
  const hasBus = nodes.some(node => node.unit === 'electrical-bus');
  if (!(allocations == null && hasBus)) {
    reconcileBackpressure(nodes, edges, edgeStreams, nodeResults, edgeLimits, caseDefinition.operation?.setpoints);
  }
  return { edgeStreams, nodeResults };
}

function allocateElectricity(caseDefinition, plan, edgeLimits = null) {
  const { nodes, edges } = caseDefinition.graph;
  const allocations = new Map();
  const priorities = caseDefinition.operation?.priorities || {};
  for (const bus of nodes.filter(node => node.unit === 'electrical-bus')) {
    const outgoing = edges.filter(edge => edge.from.node === bus.id);
    const orderIds = priorities[bus.id] || [];
    if (!Array.isArray(orderIds)) throw new Error(`operation.priorities.${bus.id} must be an array`);
    const consumers = new Set(outgoing.map(edge => edge.to.node));
    if (new Set(orderIds).size !== orderIds.length || orderIds.some(id => !consumers.has(id))) {
      throw new Error(`operation.priorities.${bus.id} contains a duplicate or unconnected consumer`);
    }
    const rank = new Map(orderIds.map((id, index) => [id, index]));
    const ordered = outgoing
      .map((edge, index) => ({ edge, index }))
      .sort((a, b) => (rank.get(a.edge.to.node) ?? orderIds.length + a.index)
        - (rank.get(b.edge.to.node) ?? orderIds.length + b.index));
    let remaining = plan.nodeResults[bus.id].available.kWh;
    for (const { edge } of ordered) {
      const result = plan.nodeResults[edge.to.node];
      // MECH9: electricity-sink reports requestedInputs/consumed via evaluateSink.
      // Missing fields → allocate nothing (legacy crash guard).
      const wanted = result?.requestedInputs?.[edge.to.port]?.kWh ?? 0;
      const usable = result?.consumed?.[edge.to.port]?.kWh ?? 0;
      const capacity = finiteEdgeCapacity(edge);
      const withoutCap = Math.min(wanted, usable, remaining);
      const kWh = Math.min(withoutCap, capacity);
      if (edgeLimits && Number.isFinite(capacity) && kWh + Math.max(1, capacity) * 1e-9 < withoutCap) {
        edgeLimits.push({
          from: { node: edge.from.node, port: edge.from.port },
          to: { node: edge.to.node, port: edge.to.port },
          port: edge.to.port,
          capacity,
          requested: withoutCap,
          delivered: kWh,
        });
      }
      allocations.set(edge, { kind: 'electricity', kWh });
      remaining -= kWh;
    }
  }
  return allocations;
}

function validateGraph(nodes, edges) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new Error('graph needs nodes and edges');
  const byId = new Map();

  for (const node of nodes) {
    if (!node.id || byId.has(node.id)) throw new Error(`Duplicate or missing node id: ${node.id}`);
    if (!UNITS[node.unit]) throw new Error(`Unknown unit: ${node.unit}`);
    byId.set(node.id, node);
  }

  const connections = new Map();
  for (const edge of edges) {
    const fromNode = byId.get(edge.from?.node);
    const toNode = byId.get(edge.to?.node);
    if (!fromNode || !toNode) throw new Error('Edge references an unknown node');
    const from = UNITS[fromNode.unit].ports[edge.from.port];
    const to = UNITS[toNode.unit].ports[edge.to.port];
    if (!from || from.direction !== 'out') throw new Error(`Invalid output port: ${edge.from.node}.${edge.from.port}`);
    if (!to || to.direction !== 'in') throw new Error(`Invalid input port: ${edge.to.node}.${edge.to.port}`);
    if (from.kind !== to.kind) throw new Error(`Incompatible stream kinds on ${edge.from.node} -> ${edge.to.node}`);
    if (edge.recycle) {
      if (from.kind !== 'material') throw new Error('Only material recycle edges are supported');
      validateStream(edge.initialStream, 'material');
    }
    if (edge.capacity != null && edge.capacity !== '') {
      const capacity = Number(edge.capacity);
      if (Number.isNaN(capacity) || capacity < 0) {
        throw new Error(`Edge capacity must be ≥ 0 (${edge.from.node} → ${edge.to.node})`);
      }
      // Infinity / non-finite positive values mean unlimited (same as blank).
    }

    const outputEndpoint = `out:${edge.from.node}:${edge.from.port}`;
    const inputEndpoint = `in:${edge.to.node}:${edge.to.port}`;
    if (connections.has(inputEndpoint) && !allowsFanIn(toNode)) {
      throw new Error(`Port has multiple connections: ${inputEndpoint.split(':').slice(1).join('.')}`);
    }
    if (connections.has(outputEndpoint) && !['junction', 'splitter'].includes(UNITS[fromNode.unit].kind)) {
      throw new Error(`Port has multiple connections: ${outputEndpoint.split(':').slice(1).join('.')}`);
    }
    connections.set(outputEndpoint, true);
    connections.set(inputEndpoint, true);
  }

  for (const node of nodes) {
    if (['source', 'sink'].includes(UNITS[node.unit].kind)) continue;
    for (const [port, declaration] of Object.entries(UNITS[node.unit].ports)) {
      if (!declaration.required) continue;
      const key = `${declaration.direction}:${node.id}:${port}`;
      if (!connections.has(key)) throw new Error(`Missing required connection: ${node.id}.${port}`);
    }
  }

  topologicalOrder(nodes, edges);
}

function topologicalOrder(nodes, edges) {
  const indegree = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges.filter(candidate => !candidate.recycle)) {
    indegree.set(edge.to.node, indegree.get(edge.to.node) + 1);
    outgoing.get(edge.from.node).push(edge.to.node);
  }

  const queue = nodes.filter(node => indegree.get(node.id) === 0);
  const sorted = [];
  while (queue.length) {
    const node = queue.shift();
    sorted.push(node);
    for (const target of outgoing.get(node.id)) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(nodes.find(candidate => candidate.id === target));
    }
  }
  if (sorted.length !== nodes.length) throw new Error('Cycles require a marked recycle edge');
  return sorted;
}

function streamResidual(previous, current) {
  if (current.kind === 'material') {
    return Math.max(0, ...[...new Set([...Object.keys(previous.mol), ...Object.keys(current.mol)])]
      .map(substance => {
        const before = previous.mol[substance] || 0;
        const after = current.mol[substance] || 0;
        return Math.abs(after - before) / Math.max(1, Math.abs(after));
      }));
  }
  const before = current.kind === 'consumable' ? previous.amount : previous.kWh;
  const after = current.kind === 'consumable' ? current.amount : current.kWh;
  return Math.abs(after - before) / Math.max(1, Math.abs(after));
}

function calculateBalances(nodes, edges, edgeStreams, nodeResults) {
  const sourceElements = {};
  const sinkElements = {};
  let sourceCharge = 0;
  let sinkCharge = 0;
  let electricitySupplied = 0;
  let electricityConsumed = 0;
  let heatSupplied = 0;
  let heatConsumed = 0;

  for (const edge of edges) {
    const stream = edgeStreams.get(edge);
    const fromKind = UNITS[nodes.find(node => node.id === edge.from.node).unit].kind;
    const toKind = UNITS[nodes.find(node => node.id === edge.to.node).unit].kind;
    if (stream.kind === 'material' && fromKind === 'source') {
      add(sourceElements, elementAmounts(stream));
      sourceCharge += chargeAmount(stream);
    }
    if (stream.kind === 'material' && toKind === 'sink') {
      add(sinkElements, elementAmounts(stream));
      sinkCharge += chargeAmount(stream);
    }
    if (stream.kind === 'electricity' && fromKind === 'source') electricitySupplied += stream.kWh;
    if (stream.kind === 'heat' && fromKind === 'source') heatSupplied += stream.kWh;
  }

  for (const result of Object.values(nodeResults)) {
    // MECH9 evaluateSink stashes consumed+requestedInputs for bus allocation, but
    // received is the sink tally — do not double-count energy on sinks.
    const sinkEnergy = result.received
      && (result.received.kind === 'electricity' || result.received.kind === 'heat');
    for (const stream of Object.values(result.consumed || {})) {
      if (sinkEnergy && (stream.kind === 'electricity' || stream.kind === 'heat')) continue;
      if (stream.kind === 'electricity') electricityConsumed += stream.kWh;
      if (stream.kind === 'heat') heatConsumed += stream.kWh;
    }
    for (const stream of Object.values(result.outlets || {})) {
      if (stream.kind === 'electricity') electricityConsumed -= stream.kWh;
      if (stream.kind === 'heat') heatConsumed -= stream.kWh;
    }
    if (result.received?.kind === 'electricity') electricityConsumed += result.received.kWh;
    if (result.received?.kind === 'heat') heatConsumed += result.received.kWh;
    // Buffer SOC change is inventory, not a loss: +Δ sinks elements, −Δ sources them.
    if (result.inventoryKg != null && result.startInventoryKg != null) {
      const deltaKg = result.inventoryKg - result.startInventoryKg;
      if (Math.abs(deltaKg) > 1e-12) {
        const candidates = [result.storedStream, result.consumed?.in, result.outlets?.out].filter(Boolean);
        let basis = candidates.find(stream => stream.kind === 'material' && streamMassKg(stream) > 1e-15);
        if (!basis) basis = candidates.find(stream => stream.kind === 'material');
        if (basis) {
          const basisMass = streamMassKg(basis);
          const accounted = basisMass > 0
            ? scaleStream(basis, Math.abs(deltaKg) / basisMass)
            : scaleStream(basis, 0);
          if (streamMassKg(accounted) > 1e-15) {
            if (deltaKg > 0) {
              add(sinkElements, elementAmounts(accounted));
              sinkCharge += chargeAmount(accounted);
            } else {
              add(sourceElements, elementAmounts(accounted));
              sourceCharge += chargeAmount(accounted);
            }
          }
        }
      }
    }
  }

  const elements = {};
  for (const element of new Set([...Object.keys(sourceElements), ...Object.keys(sinkElements)])) {
    elements[element] = (sourceElements[element] || 0) - (sinkElements[element] || 0);
  }
  const chargeMol = sourceCharge - sinkCharge;
  const electricityKWh = electricitySupplied - electricityConsumed;
  const heatKWh = heatSupplied - heatConsumed;
  const maxAbsResidual = Math.max(
    0,
    ...Object.values(elements).map(Math.abs),
    Math.abs(chargeMol),
    Math.abs(electricityKWh),
    Math.abs(heatKWh)
  );
  return { elements, chargeMol, electricityKWh, heatKWh, maxAbsResidual };
}

function allowsFanIn(node) {
  return UNITS[node.unit].kind === 'mixer' || node.unit === 'heat-sink';
}

function collectHeatIntegration(caseDefinition, nodeResults) {
  const sources = [];
  const sinks = [];
  for (const node of caseDefinition.graph?.nodes || []) {
    const result = nodeResults?.[node.id];
    if (!result) continue;
    const waste = result.outlets?.wasteHeat;
    if (waste?.kind === 'heat' && waste.kWh > 0) {
      sources.push({ id: node.id, kWh: waste.kWh, T_C: waste.T_C });
    }
    const consumedHeat = result.consumed?.heat;
    if (consumedHeat?.kind === 'heat' && consumedHeat.kWh > 0) {
      sinks.push({
        id: node.id,
        demandKWh: consumedHeat.kWh,
        minT_C: Number(node.params?.minHeatT_C ?? 0),
      });
    }
  }
  return cascadeHeat({ sources, sinks });
}

function mixHeat(streams) {
  if (streams.some(stream => stream.kind !== 'heat')) {
    throw new Error('Heat sink fan-in requires heat streams');
  }
  const kWh = streams.reduce((sum, stream) => sum + stream.kWh, 0);
  const T_C = kWh
    ? streams.reduce((sum, stream) => sum + stream.T_C * stream.kWh, 0) / kWh
    : streams[0].T_C;
  return { kind: 'heat', kWh, T_C };
}

function add(target, values) {
  for (const [key, value] of Object.entries(values)) target[key] = (target[key] || 0) + value;
}

function mixMaterial(streams) {
  const validated = streams.map(stream => validateStream(stream, 'material'));
  const phase = validated[0].phase;
  if (validated.some(stream => stream.phase !== phase)) throw new Error('Mixer inputs must have the same phase');
  const amount = stream => Object.values(stream.mol).reduce((sum, mol) => sum + mol, 0);
  const totalMol = validated.reduce((sum, stream) => sum + amount(stream), 0);
  const mol = {};
  for (const stream of validated) add(mol, stream.mol);
  return {
    kind: 'material', mol, phase,
    T_C: totalMol ? validated.reduce((sum, stream) => sum + stream.T_C * amount(stream), 0) / totalMol : validated[0].T_C,
    P_bar: Math.min(...validated.map(stream => stream.P_bar)),
  };
}

function hourlyProfile(site) {
  const solar = site?.solar;
  if (!solar) return null;
  const month = Number(site.month) || 0;
  if (month >= 1 && month <= 12 && solar.typicalMonths?.[month]?.length === 24) return solar.typicalMonths[month];
  if (solar.annualTypical?.length === 24) return solar.annualTypical;
  if (solar.typicalDayKWhPerKWp?.length === 24) return solar.typicalDayKWhPerKWp;
  return null;
}

function addStreams(left, right) {
  if (!left) return cloneStream(right);
  if (left.kind === 'material') {
    const mol = { ...left.mol };
    add(mol, right.mol);
    return { ...left, mol };
  }
  if (left.kind === 'consumable') return { ...left, amount: left.amount + right.amount };
  return { ...left, kWh: left.kWh + right.kWh };
}

function accumulateSolved(totals, solved) {
  totals.balances.maxAbsResidual = Math.max(totals.balances.maxAbsResidual, solved.balances.maxAbsResidual);
  for (const warning of solved.warnings || []) {
    if (!totals.warnings.includes(warning)) totals.warnings.push(warning);
  }
  if (solved.edgeLimits?.length) {
    totals.edgeLimits = totals.edgeLimits || [];
    for (const limit of solved.edgeLimits) {
      const key = `${limit.from.node}:${limit.from.port}->${limit.to.node}:${limit.to.port}:${limit.capacity}`;
      const existing = totals.edgeLimits.find(item => (
        item.from.node === limit.from.node && item.from.port === limit.from.port
        && item.to.node === limit.to.node && item.to.port === limit.to.port
        && item.capacity === limit.capacity
      ));
      if (existing) {
        existing.requested += limit.requested;
        existing.delivered += limit.delivered;
      } else {
        totals.edgeLimits.push({ ...limit, from: { ...limit.from }, to: { ...limit.to } });
      }
    }
  }
  for (const [id, result] of Object.entries(solved.nodes)) {
    const current = totals.nodes[id];
    if (!current) {
      totals.nodes[id] = JSON.parse(JSON.stringify(result));
      continue;
    }
    if (result.activity != null) current.activity = (current.activity || 0) + result.activity;
    if (result.supplied) current.supplied = addStreams(current.supplied, result.supplied);
    if (result.received) current.received = addStreams(current.received, result.received);
    if (result.available && result.available.kWh != null) {
      current.available = addStreams(current.available, result.available);
    }
    if (result.inventoryKg != null) {
      current.inventoryKg = result.inventoryKg;
      current.capacityKg = result.capacityKg;
      current.fill = result.fill;
      current.startInventoryKg = result.startInventoryKg;
    }
    if (result.storedStream) current.storedStream = cloneStream(result.storedStream);
    current.limitedBy = [...new Set([...(current.limitedBy || []), ...(result.limitedBy || [])])];
    for (const group of ['requestedInputs', 'consumed', 'outlets']) {
      if (!result[group]) continue;
      current[group] = current[group] || {};
      for (const [port, stream] of Object.entries(result[group])) {
        current[group][port] = addStreams(current[group][port], stream);
      }
    }
  }
  solved.streams.forEach((edge, index) => {
    if (!totals.streams[index]) totals.streams[index] = { ...edge, stream: cloneStream(edge.stream) };
    else totals.streams[index].stream = addStreams(totals.streams[index].stream, edge.stream);
  });
}

// One representative day as 24 hourly operating solves. Daily setpoints are leftover
// demand; nameplate is capacity/24. Site electricity is the hourly PV yield plus
// optional battery discharge. Other site budgets are remaining daily quantities.

function syncHourlyLiftSetpoints(hourCase) {
  const setpoints = hourCase.operation.setpoints || (hourCase.operation.setpoints = {});
  for (const node of hourCase.graph.nodes) {
    if (node.unit === 'intake-pump') {
      const out = hourCase.graph.edges.find(edge => edge.from.node === node.id && edge.from.port === 'out');
      if (!out) continue;
      const down = hourCase.graph.nodes.find(item => item.id === out.to.node);
      if (!down) continue;
      if (down.unit === 'swro' || down.unit === 'med' || down.unit === 'msf') {
        const recovery = Number(down.params?.recovery ?? 0.45) || 0.45;
        const productM3 = Number(setpoints[down.id]) || 0;
        const m3 = recovery > 0 ? productM3 / recovery : 0;
        node.capacity = m3;
        setpoints[node.id] = m3;
      } else if (down.unit === 'brine-minerals') {
        const brineKg = Number(setpoints[down.id]) || 0;
        const density = Number(node.params?.densityKgM3 ?? 1200) || 1200;
        const m3 = density > 0 ? brineKg / density : 0;
        node.capacity = m3;
        setpoints[node.id] = m3;
      }
      continue;
    }
    if (node.unit !== 'gas-blower') continue;
    const out = hourCase.graph.edges.find(edge => edge.from.node === node.id && edge.from.port === 'out');
    if (!out) continue;
    const down = hourCase.graph.nodes.find(item => item.id === out.to.node);
    if (!down || !String(down.unit || '').startsWith('dac')) continue;
    const dacKg = Number(setpoints[down.id]) || 0;
    const capture = Number(down.params?.captureFraction ?? 0.9) || 0.9;
    const inEdge = hourCase.graph.edges.find(edge => edge.to.node === node.id && edge.to.port === 'in');
    const airNode = inEdge && hourCase.graph.nodes.find(item => item.id === inEdge.from.node);
    const air = airNode?.params?.stream;
    let nm3PerKg = 22.414 / 29;
    let co2MassFraction = 0;
    if (air?.mol) {
      const mass = streamMassKg(air);
      const totalMol = Object.values(air.mol).reduce((sum, amount) => sum + amount, 0);
      if (mass > 0 && totalMol > 0) nm3PerKg = (totalMol * 22.414 / 1000) / mass;
      const co2Mol = air.mol.CO2 || 0;
      const co2Kg = co2Mol * (SUBSTANCES.CO2?.molarMassG || 44.0095) / 1000;
      co2MassFraction = mass > 0 ? co2Kg / mass : 0;
    }
    const airKg = capture > 0 && co2MassFraction > 0 ? dacKg / capture / co2MassFraction : 0;
    const nm3 = airKg * nm3PerKg;
    node.capacity = nm3;
    setpoints[node.id] = nm3;
  }
}

function solveHorizon(caseDefinition) {
  const hours = hourlyProfile(caseDefinition.site);
  if (!hours) return solveOperation(caseDefinition);

  const solarKWp = Number(caseDefinition.site.solarKWp) || 0;
  const storage = caseDefinition.site.storage || {};
  const batteryKWh = Math.max(0, Number(storage.batteryKWh) || 0);
  const powerKW = Math.max(0, Number(storage.powerKW) || batteryKWh);
  const eta = Number(storage.efficiency ?? 0.9);
  let soc = Math.max(0, Number(storage.initialKWh) || 0);
  let powerCut = false;
  const remainingResource = {};
  for (const [id, resource] of Object.entries(caseDefinition.site.resources || {})) {
    remainingResource[id] = streamAmount(resource.stream);
  }
  const remainingDemand = {};
  for (const node of caseDefinition.graph.nodes.filter(item => UNITS[item.unit].kind === 'converter')) {
    // MECH11 lifts track downstream hourly duty — do not bank independent remaining.
    if (node.unit === 'intake-pump' || node.unit === 'gas-blower') continue;
    remainingDemand[node.id] = caseDefinition.operation?.setpoints?.[node.id] ?? 0;
  }
  // Buffers with an explicit daily discharge setpoint spread it across hours.
  // No setpoint → drain-available each hour (pass-through / empty the tank).
  for (const node of caseDefinition.graph.nodes.filter(item => UNITS[item.unit].kind === 'buffer')) {
    const raw = caseDefinition.operation?.setpoints?.[node.id];
    if (raw == null || raw === '') continue;
    remainingDemand[node.id] = Number(raw) || 0;
  }

  const bufferState = new Map();
  for (const node of caseDefinition.graph.nodes.filter(item => UNITS[item.unit].kind === 'buffer')) {
    const params = node.params || {};
    let stored = params.storedStream ? cloneStream(params.storedStream) : null;
    let inventoryKg = nonnegative(Number(params.inventoryKg ?? params.initialKg ?? 0) || 0, 'inventoryKg');
    const capacityKg = finiteBufferCapacityKg(params);
    if (Number.isFinite(capacityKg)) inventoryKg = Math.min(inventoryKg, capacityKg);
    if (stored && inventoryKg > 0 && streamMassKg(stored) > 0) {
      stored = scaleMaterialToMass(stored, inventoryKg);
    } else if (inventoryKg <= 0 && stored) {
      stored = scaleStream(stored, 0);
    }
    bufferState.set(node.id, { inventoryKg, storedStream: stored });
  }

  const totals = {
    nodes: {},
    streams: [],
    warnings: [],
    edgeLimits: [],
    balances: { elements: {}, chargeMol: 0, electricityKWh: 0, heatKWh: 0, maxAbsResidual: 0 },
    convergence: { converged: true, iterations: 24, largestResidual: 0 },
    horizon: { hours: [], solarKWp, profile: hours, batteryKWh, buffers: {} },
  };

  for (let hour = 0; hour < 24; hour += 1) {
    const hourCase = JSON.parse(JSON.stringify(caseDefinition));
    const pv = hours[hour] * solarKWp;
    const discharge = Math.min(soc, powerKW);
    if (hourCase.site.resources.electricity) {
      hourCase.site.resources.electricity.stream = { kind: 'electricity', kWh: pv + discharge };
    }
    for (const [id, resource] of Object.entries(hourCase.site.resources || {})) {
      if (id === 'electricity' || id === 'grid') continue;
      const original = caseDefinition.site.resources[id].stream;
      const remaining = remainingResource[id];
      const daily = streamAmount(original);
      if (original.kind === 'material') {
        resource.stream = scaleStream(original, daily === 0 ? 0 : Math.max(0, remaining) / daily);
      } else if (original.kind === 'consumable') {
        resource.stream = { ...original, amount: Math.max(0, remaining) };
      } else {
        resource.stream = { ...original, kWh: Math.max(0, remaining) };
      }
    }
    hourCase.operation = hourCase.operation || { setpoints: {} };
    hourCase.operation.setpoints = { ...(caseDefinition.operation?.setpoints || {}) };
    if (hourCase.operation.priorities?.['electrical-bus']?.includes('sabatier')) {
      hourCase.operation.priorities = {
        ...hourCase.operation.priorities,
        'electrical-bus': hourCase.operation.priorities['electrical-bus'].filter(id => id !== 'sabatier').flatMap(id => (
          id === 'electrolyzer' ? ['sabatier', 'electrolyzer'] : [id]
        )),
      };
    }
    const sunLeft = hours.slice(hour).filter(value => value > 0).length || 1;
    const power = pv + discharge;
    const hoursLeft = 24 - hour;
    for (const node of hourCase.graph.nodes) {
      if (UNITS[node.unit].kind === 'source' && node.siteResource && hourCase.site.resources[node.siteResource]) {
        node.params.stream = cloneStream(hourCase.site.resources[node.siteResource].stream);
      }
      if (UNITS[node.unit].kind === 'converter') {
        if (node.unit === 'intake-pump' || node.unit === 'gas-blower') continue;
        node.capacity = (caseDefinition.graph.nodes.find(item => item.id === node.id).capacity || 0) / 24;
        const leftover = remainingDemand[node.id] || 0;
        hourCase.operation.setpoints[node.id] = power === 0 ? 0 : Math.min(leftover, node.capacity, leftover / sunLeft);
      }
      if (UNITS[node.unit].kind === 'buffer') {
        const state = bufferState.get(node.id);
        node.params = { ...(node.params || {}) };
        node.params.inventoryKg = state.inventoryKg;
        if (state.storedStream) node.params.storedStream = cloneStream(state.storedStream);
        if (Object.prototype.hasOwnProperty.call(remainingDemand, node.id)) {
          const leftover = remainingDemand[node.id] || 0;
          // Buffers are not sun-gated: spread remaining discharge across hours left.
          hourCase.operation.setpoints[node.id] = Math.min(leftover, leftover / hoursLeft);
        } else {
          // No daily setpoint → drain whatever is in the tank this hour.
          delete hourCase.operation.setpoints[node.id];
        }
      }
    }
    const sabatier = hourCase.graph.nodes.find(node => node.unit === 'sabatier');
    const electrolyzer = hourCase.graph.nodes.find(node => node.unit === 'electrolyzer');
    const swro = hourCase.graph.nodes.find(node => node.unit === 'swro');
    const dac = hourCase.graph.nodes.find(node => String(node.unit).startsWith('dac'));
    const dailySabatier = Number(caseDefinition.operation?.setpoints?.[sabatier?.id] ?? 0);
    const sabatierCap = Number(caseDefinition.graph.nodes.find(item => item.id === sabatier?.id)?.capacity ?? 0);
    const sabatierActive = Boolean(sabatier && dailySabatier > 0 && sabatierCap > 0);
    const dailyH2 = Number(caseDefinition.operation?.setpoints?.[electrolyzer?.id] ?? 0);
    const h2Led = Boolean(electrolyzer && dailyH2 > 0 && !sabatierActive);
    if (sabatierActive && power > 0) {
      const h2 = 4 * 2.01588 / 16.04246;
      const co2 = 44.0095 / 16.04246;
      const recovery = Number(swro?.params?.recovery ?? 0.45) || 0.45;
      // Alkaline system SEC fallback; Buttler & Spliethoff 2018. Coastal PEM cases pass 55 explicitly.
      const secH2 = Number(electrolyzer?.params?.secKWhPerKgH2 ?? 52);
      const secDac = Number(dac?.params?.electricityKWhPerKgCO2 ?? 0.5);
      const secRo = Number(swro?.params?.secKWhPerM3 ?? 3.5);
      const secCh4 = Number(sabatier.params?.electricityKWhPerKgCH4 ?? 1);
      const kWhPerKg = h2 * secH2 + co2 * secDac + h2 * 18.01528 / 2.01588 / 1000 / recovery * secRo + secCh4;
      const unconstrained = hourCase.operation.setpoints[sabatier.id] || 0;
      const methaneHour = Math.min(unconstrained, kWhPerKg > 0 ? power / kWhPerKg : 0);
      if (methaneHour + 1e-6 < unconstrained) powerCut = true;
      hourCase.operation.setpoints[sabatier.id] = methaneHour;
      if (dac) hourCase.operation.setpoints[dac.id] = methaneHour * co2;
      if (electrolyzer) hourCase.operation.setpoints[electrolyzer.id] = methaneHour * h2;
      if (swro) hourCase.operation.setpoints[swro.id] = methaneHour * h2 * 18.01528 / 2.01588 / 1000 / recovery;
    } else if (h2Led && power > 0) {
      const recovery = Number(swro?.params?.recovery ?? 0.45) || 0.45;
      const secH2 = Number(electrolyzer?.params?.secKWhPerKgH2 ?? 52);
      const secRo = Number(swro?.params?.secKWhPerM3 ?? 3.5);
      const waterKgPerKgH2 = 18.01528 / 2.01588;
      const swroM3PerKgH2 = swro ? waterKgPerKgH2 / 1000 / recovery : 0;
      const kWhPerKgH2 = secH2 + swroM3PerKgH2 * secRo;
      // Daily lump capacity (/24) cannot deliver a solar-sized daily H2 target in
      // daylight-only hours. Allow catch-up up to remaining demand / sunLeft.
      const catchUp = (remainingDemand[electrolyzer.id] || 0) / sunLeft;
      const dailyCap = Number(caseDefinition.graph.nodes.find(item => item.id === electrolyzer.id)?.capacity ?? 0);
      electrolyzer.capacity = Math.max(electrolyzer.capacity || 0, catchUp, dailyCap);
      const h2Hour = Math.min(
        catchUp,
        electrolyzer.capacity,
        kWhPerKgH2 > 0 ? power / kWhPerKgH2 : 0
      );
      if (h2Hour + 1e-6 < Math.min(catchUp, electrolyzer.capacity)) powerCut = true;
      hourCase.operation.setpoints[electrolyzer.id] = h2Hour;
      if (swro) {
        const swroCatch = h2Hour * swroM3PerKgH2;
        const swroDaily = Number(caseDefinition.graph.nodes.find(item => item.id === swro.id)?.capacity ?? 0);
        swro.capacity = Math.max(swro.capacity || 0, swroCatch, swroDaily);
        hourCase.operation.setpoints[swro.id] = swroCatch;
      }
      if (sabatier) hourCase.operation.setpoints[sabatier.id] = 0;
      if (dac) hourCase.operation.setpoints[dac.id] = 0;
    }
    syncHourlyLiftSetpoints(hourCase);
    if (power === 0) {
      for (const node of hourCase.graph.nodes) {
        if (node.unit === 'intake-pump' || node.unit === 'gas-blower') {
          node.capacity = 0;
          hourCase.operation.setpoints[node.id] = 0;
        }
      }
    }
    const solved = solveOperation(hourCase);
    if (powerBudgetThrottled(hourCase.graph.nodes, solved.nodes)) powerCut = true;
    accumulateSolved(totals, solved);
    for (const node of caseDefinition.graph.nodes.filter(item => UNITS[item.unit].kind === 'converter')) {
      remainingDemand[node.id] = Math.max(0, (remainingDemand[node.id] || 0) - (solved.nodes[node.id]?.activity || 0));
    }
    for (const id of Object.keys(remainingDemand)) {
      const node = caseDefinition.graph.nodes.find(item => item.id === id);
      if (!node || UNITS[node.unit].kind !== 'buffer') continue;
      remainingDemand[id] = Math.max(0, (remainingDemand[id] || 0) - (solved.nodes[id]?.activity || 0));
    }
    for (const node of caseDefinition.graph.nodes.filter(item => UNITS[item.unit].kind === 'buffer')) {
      const result = solved.nodes[node.id];
      if (!result) continue;
      bufferState.set(node.id, {
        inventoryKg: result.inventoryKg ?? 0,
        storedStream: result.storedStream ? cloneStream(result.storedStream) : null,
      });
    }
    for (const [id] of Object.entries(caseDefinition.site.resources || {})) {
      if (id === 'electricity' || id === 'grid') continue;
      const used = hourCase.graph.nodes
        .filter(node => node.siteResource === id)
        .reduce((sum, node) => sum + streamAmount(solved.nodes[node.id]?.supplied || { kind: 'electricity', kWh: 0 }), 0);
      remainingResource[id] = Math.max(0, remainingResource[id] - used);
    }
    const electricityId = hourCase.graph.nodes.find(node => node.siteResource === 'electricity')?.id;
    const supplied = electricityId ? streamAmount(solved.nodes[electricityId]?.supplied || { kind: 'electricity', kWh: 0 }) : 0;
    soc = Math.max(0, soc - Math.max(0, supplied - pv));
    soc = Math.min(batteryKWh, soc + Math.min(Math.max(0, pv - supplied) * eta, powerKW));
    const methane = solved.nodes.sabatier?.activity || 0;
    const h2 = solved.nodes.electrolyzer?.activity || 0;
    const hourBuffers = {};
    for (const [id, state] of bufferState) {
      const capacityKg = finiteBufferCapacityKg(
        caseDefinition.graph.nodes.find(item => item.id === id)?.params || {}
      );
      hourBuffers[id] = {
        soc: state.inventoryKg,
        capacityKg: Number.isFinite(capacityKg) ? capacityKg : null,
        fill: Number.isFinite(capacityKg) && capacityKg > 0 ? state.inventoryKg / capacityKg : null,
      };
      totals.horizon.buffers[id] = hourBuffers[id];
    }
    totals.horizon.hours.push({
      hour, pv, discharge, soc, supplied,
      methane,
      h2,
      buffers: hourBuffers,
      limited: Object.entries(solved.nodes)
        .filter(([, result]) => result.limitedBy?.length)
        .map(([id]) => id),
    });
    totals.convergence.largestResidual = Math.max(totals.convergence.largestResidual, solved.convergence.largestResidual);
    totals.convergence.converged = totals.convergence.converged && solved.convergence.converged;
    totals.balances.elements = solved.balances.elements;
    totals.balances.chargeMol = solved.balances.chargeMol;
    totals.balances.electricityKWh = solved.balances.electricityKWh;
    totals.balances.heatKWh = solved.balances.heatKWh;
  }

  const unmetDemand = Object.values(remainingDemand).some(value => value > 1e-3);
  const noSun = !hours.some(value => value * solarKWp > 0);
  if ((powerCut || noSun) && unmetDemand && !totals.warnings.includes('Capacity reduced: limited by available electricity')) {
    totals.warnings.push('Capacity reduced: limited by available electricity');
  }
  totals.warnings = totals.warnings.concat(
    totals.horizon.hours.filter(entry => entry.pv === 0 && entry.methane === 0 && (entry.h2 || 0) === 0).length === 24
      ? []
      : [`${totals.horizon.hours.filter(entry => entry.pv > 0).length} daylight hours on the selected typical day`]
  );
  totals.heatIntegration = collectHeatIntegration(caseDefinition, totals.nodes);
  attachCauseChains(caseDefinition, totals.nodes, totals.edgeLimits || []);
  return totals;
}

return { solveOperation, solveHorizon, hourlyProfile, validateGraph, unverifiedRightsWarnings, attachCauseChains };
});
