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

// Converter inlet ports that carry feed. A downstream converter limited only by
// one of these (other than the edge's own port) is starved, not blocked.
const FEED_PORTS = new Set([
  'in', 'feed', 'air', 'brine', 'co2', 'hydrogen', 'water', 'salt',
  'nitrogen', 'chlorine', 'bromide', 'consumables', 'electricity', 'heat',
]);

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
    if (!edge) continue; // orphan source with no outlet
    const stream = solved.edgeStreams.get(edge);
    if (!stream) continue;
    solved.nodeResults[node.id].supplied = cloneStream(stream);
  }

  const streams = edges.map(edge => ({ ...edge, stream: cloneStream(solved.edgeStreams.get(edge)) }));
  const balances = calculateBalances(nodes, edges, solved.edgeStreams, solved.nodeResults);
  const heatIntegration = collectHeatIntegration(caseDefinition, solved.nodeResults);
  tagLogisticsLimits(nodes, edges, solved.nodeResults, edgeLimits);
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
  if (edge.capacity == null || edge.capacity === '') return Infinity;
  const capacity = Number(edge.capacity);
  if (!Number.isFinite(capacity)) return Infinity;
  if (capacity < 0) throw new Error(`Edge capacity must be ≥ 0 (${edge.from?.node} → ${edge.to?.node})`);
  return capacity;
}

function applyEdgeCapacity(edge, stream, edgeLimits) {
  if (!stream) return stream;
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
  if (!edgeLimits.length) return;
  const clampedInlets = new Map();
  for (const limit of edgeLimits) clampedInlets.set(`${limit.to.node}:${limit.to.port}`, limit);
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
    }
    if (logisticsBinding) {
      result.limitedBy = [...new Set([...(result.limitedBy || []), 'logistics'])];
    }
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
// Start inventory comes from params.inventoryKg (or initialKg).
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
  // Empty inlet + initialKg without storedStream must not throw.
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
  const days = Number(caseDefinition.operation?.periodDays);
  return Number.isFinite(days) && days > 0 ? days : 365;
}

function demandBackedAcceptKg(node, periodDays) {
  // Offtake honesty is for sale products. Vent/disposal/reinjection keep
  // EDITOR_DEMAND_DEFAULT on economics for the inspector seed only — not physics.
  if (node.economics?.disposition !== 'sale') return null;
  const annual = Number(node.economics.annualDemandLimit);
  if (!Number.isFinite(annual) || annual < 0) return null;
  return annual / periodDays;
}

// Daily sink accept limit and where it came from. Manual acceptKg / acceptAmount /
// acceptKWh / sink setpoint win ('manual'). Else a material-sink sale caps at TEA
// economics.annualDemandLimit / periodDays ('demand'). Otherwise unlimited.
// Energy sinks never demand-back (different units).
function sinkAccept(node, setpoint, periodDays) {
  const params = node.params || {};
  const candidates = [];
  for (const key of ['acceptKg', 'acceptAmount', 'acceptKWh']) {
    if (params[key] == null || params[key] === '') continue;
    candidates.push(nonnegative(Number(params[key]), key));
  }
  if (setpoint != null && setpoint !== '') {
    candidates.push(nonnegative(Number(setpoint), 'sinkAccept'));
  }
  if (candidates.length) return { cap: Math.min(...candidates), source: 'manual' };
  if (node.unit === 'material-sink') {
    const demandDaily = demandBackedAcceptKg(node, periodDays);
    if (demandDaily != null) return { cap: demandDaily, source: 'demand' };
  }
  return { cap: Infinity, source: null };
}

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

function evaluateSink(node, inlet, setpoint, periodDays) {
  const clean = scrubTinyNegativeMols(inlet);
  const requested = streamAmount(clean);
  const { cap: acceptCap, source: acceptSource } = sinkAccept(node, setpoint, periodDays);
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
  if (!(scale < 1 - 1e-15)) return;
  if (result.activity != null) result.activity *= scale;
  for (const group of ['requestedInputs', 'consumed', 'outlets']) {
    const bag = result[group];
    if (!bag) continue;
    for (const [port, stream] of Object.entries(bag)) {
      bag[port] = scaleStream(stream, scale);
    }
  }
}

// Factorio-style splitter overflow with priority tiers. Capacities are per-branch
// maxima (sink accept / edge cap, or frozen delivered for non-sink targets).
// Among eligible outlets, water-fill only the highest-priority tier by weight;
// when that tier saturates, spill to the next. Equal priorities give a plain
// weighted overflow. Inlet rejects only after every useful tier saturates.
function allocateSplitterOverflow(available, weights, capacities, prios) {
  const n = weights.length;
  const alloc = Array(n).fill(0);
  let remaining = Math.max(0, available);
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

// A buffer can take splitter overflow when its outlet feeds a sink or converter.
// Mixer / nested splitter / buffer→buffer stay frozen (need a fuller cascade pass).
function bufferOutletCanAbsorbOverflow(bufferNode, edges, nodeById) {
  const outEdge = edges.find(edge => edge.from.node === bufferNode.id && !edge.recycle);
  if (!outEdge) return false;
  const target = nodeById.get(outEdge.to.node);
  if (!target) return false;
  const kind = UNITS[target.unit]?.kind;
  return kind === 'sink' || kind === 'converter';
}

// Put the part of a buffer's outlet that downstream did not take back into the
// tank (clamped to capacity). Returns true when anything was rejected.
function bankBufferOutletReject(result, delivered, reason) {
  const produced = scrubTinyNegativeMols(result.outlets.out);
  const gotStream = scrubTinyNegativeMols(delivered);
  const want = safeStreamAmount(produced);
  const got = safeStreamAmount(gotStream);
  if (!(want > 1e-15) || !(got + Math.max(1, got) * 1e-9 < want)) return false;
  const rejected = want - got;
  result.outlets.out = cloneStream(gotStream);
  result.activity = got;
  result.inventoryKg = (result.inventoryKg || 0) + rejected;
  if (Number.isFinite(result.capacityKg)) {
    result.inventoryKg = Math.min(result.inventoryKg, result.capacityKg);
    result.fill = result.capacityKg > 0 ? result.inventoryKg / result.capacityKg : null;
  }
  if (result.storedStream && result.inventoryKg > 1e-12) {
    result.storedStream = scaleMaterialToMass(
      streamMassKg(result.storedStream) > 1e-15 ? result.storedStream : produced,
      result.inventoryKg
    );
  }
  result.limitedBy = [...new Set([...(result.limitedBy || []), reason])];
  return true;
}

function bufferOverflowRoomKg(downResult) {
  if (!downResult) return 0;
  const start = Number(downResult.startInventoryKg);
  const startInv = Number.isFinite(start) ? Math.max(0, start) : 0;
  if (!Number.isFinite(downResult.capacityKg)) return Infinity;
  return Math.max(0, downResult.capacityKg - startInv);
}

function sinkAcceptCap(sinkResult) {
  if (Number.isFinite(sinkResult?.acceptKg)) return sinkResult.acceptKg;
  if (Number.isFinite(sinkResult?.acceptKWh)) return sinkResult.acceptKWh;
  return Infinity;
}

function splitterBranchCapacity(edge, deliveredAmt, down, downResult, edges, nodeById) {
  const downKind = down ? UNITS[down.unit]?.kind : null;
  const edgeCap = finiteEdgeCapacity(edge);
  if (downKind === 'sink') {
    let cap = sinkAcceptCap(downResult);
    if (Number.isFinite(edgeCap)) cap = Math.min(cap, edgeCap);
    return Math.max(0, cap);
  }
  // Absorbing buffer legs take leftover up to the remaining tank room.
  if (downKind === 'buffer' && bufferOutletCanAbsorbOverflow(down, edges, nodeById)) {
    let cap = bufferOverflowRoomKg(downResult);
    if (Number.isFinite(edgeCap)) cap = Math.min(cap, edgeCap);
    return Math.max(0, cap);
  }
  // Non-absorbing targets: freeze at current delivered — no invented inventory.
  let cap = Math.max(0, deliveredAmt);
  if (Number.isFinite(edgeCap)) cap = Math.min(cap, edgeCap);
  return cap;
}

// Rewrite a sink's receipt to a new offer and re-tag 'export' against its accept
// limit. `got` defaults to the offer's amount.
function refreshSinkFromOffer(sinkResult, next, got = safeStreamAmount(next)) {
  if (!sinkResult) return;
  sinkResult.received = cloneStream(next);
  if (sinkResult.consumed) sinkResult.consumed.in = cloneStream(next);
  if (sinkResult.requestedInputs) {
    // Keep requested at the pre-overflow offer when larger; else match.
    const prevReq = sinkResult.requestedInputs.in;
    const prevAmt = prevReq ? safeStreamAmount(prevReq) : 0;
    if (got + Math.max(1, got) * 1e-9 >= prevAmt) {
      sinkResult.requestedInputs.in = cloneStream(next);
    }
  }
  const accept = sinkAcceptCap(sinkResult);
  if (Number.isFinite(accept) && got + Math.max(1, got) * 1e-9 >= accept && accept >= 0) {
    sinkResult.limitedBy = [...new Set([...(sinkResult.limitedBy || []), 'export'])];
  } else if (Number.isFinite(accept) && got + Math.max(1, accept) * 1e-9 < accept) {
    sinkResult.limitedBy = (sinkResult.limitedBy || []).filter(item => item !== 'export');
  }
}

function inletOfferForConverterReeval(edge, feedEdge, nodeResults, nodeById, edgeStreams) {
  const current = edgeStreams.get(edge);
  if (!current) return { kind: 'electricity', kWh: 0 };
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

// After a buffer outlet grows, re-craft the downstream converter from current
// edgeStreams inlets and bank any unconsumed feed back into the tank.
function reevaluateConverterAfterBufferFeed(
  converter, feedEdge, bufferResult, edges, edgeStreams, nodeResults, nodeById, setpoints
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
    requestedActivity: setpoints?.[converter.id],
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
    if (down && UNITS[down.unit]?.kind === 'sink') refreshSinkFromOffer(downResult, outlet);
  }
  const taken = edgeStreams.get(feedEdge);
  if (taken) {
    bankBufferOutletReject(bufferResult, taken, 'export');
    edgeStreams.set(feedEdge, cloneStream(bufferResult.outlets.out));
  }
}

// Re-charge an absorbing buffer with a splitter offer, push its new outlet
// through the outlet edge's capacity, and refresh the sink or converter it feeds.
// Returns the amount the buffer accepted.
function applyBufferOverflowIntake(
  down, offer, setpoint, edges, edgeStreams, nodeResults, nodeById, edgeLimits, setpoints
) {
  const result = evaluateBuffer(down, { in: offer }, setpoint);
  nodeResults[down.id] = result;
  const inEdge = edges.find(edge => edge.to.node === down.id && !edge.recycle);
  if (inEdge) edgeStreams.set(inEdge, cloneStream(result.consumed.in));
  const outEdge = edges.find(edge => edge.from.node === down.id && !edge.recycle);
  if (outEdge) {
    let outStream = cloneStream(result.outlets.out);
    const clamped = applyEdgeCapacity(outEdge, outStream, edgeLimits);
    if (clamped !== outStream) {
      bankBufferOutletReject(result, clamped, 'logistics');
      outStream = cloneStream(result.outlets.out);
    }
    edgeStreams.set(outEdge, outStream);
    const target = nodeById.get(outEdge.to.node);
    const targetKind = target ? UNITS[target.unit]?.kind : null;
    if (targetKind === 'sink') {
      refreshSinkFromOffer(nodeResults[outEdge.to.node], result.outlets.out);
    } else if (targetKind === 'converter') {
      reevaluateConverterAfterBufferFeed(
        target, outEdge, result, edges, edgeStreams, nodeResults, nodeById, setpoints
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
function reconcileBackpressure(nodes, edges, edgeStreams, nodeResults, edgeLimits, setpoints) {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const outletLimited = edge => edgeLimits?.some(item => (
    item.from.node === edge.from.node && item.from.port === edge.from.port
    && item.to.node === edge.to.node
  ));
  for (const node of topologicalOrder(nodes, edges).reverse()) {
    const unit = UNITS[node.unit];
    const result = nodeResults[node.id];
    if (!result) continue;
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
        } else if (outletLimited(edge)) binding = 'logistics';
        // Downstream converter under-drawing: backpressure when the consumer is
        // blocked by something other than THIS feed port (H2-short Sabatier must
        // push back on DAC CO2; intake pumps / blowers always match pull).
        if (!binding && downKind === 'converter') {
          const wantDown = safeStreamAmount(produced);
          const gotDown = safeStreamAmount(delivered);
          if (wantDown > 1e-15 && gotDown + Math.max(1, gotDown) * 1e-9 < wantDown) {
            const limitedByThisFeed = downLimits.includes(edge.to.port);
            const isLift = node.unit === 'intake-pump' || node.unit === 'gas-blower';
            const blockedOtherwise = downLimits.some(limit => (
              limit === 'export' || limit === 'logistics' || limit === 'capacity'
              || (!FEED_PORTS.has(limit) && limit !== edge.to.port)
            ));
            if (isLift || (!limitedByThisFeed && (blockedOtherwise || downLimits.includes('hydrogen') || downLimits.includes('electricity')))) {
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
      const delivered = scrubTinyNegativeMols(edgeStreams.get(outEdge));
      if (!delivered) continue;
      result.outlets.out = scrubTinyNegativeMols(result.outlets.out);
      edgeStreams.set(outEdge, delivered);
      // Outlet edge capacity → logistics; full destination / export backpressure → export.
      const reason = outletLimited(outEdge) ? 'logistics' : 'export';
      if (bankBufferOutletReject(result, delivered, reason)) {
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

    // Material splitter: priority tiers fill first, then overflow rebalances onto
    // free sink / buffer(→sink|converter) legs by weight; the inlet backpressures
    // only when leftover remains after useful legs saturate.
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
        } else if (outletLimited(edge)) reason = reason || 'logistics';
      }
      if (!(want > 1e-15)) continue;
      const alloc = allocateSplitterOverflow(want, weights, capacities, priorities);
      let got = 0;
      for (let i = 0; i < outgoing.length; i += 1) {
        const edge = outgoing[i];
        const target = Math.max(0, alloc[i]);
        const next = scrubTinyNegativeMols(scaleStream(result.available, target / want));
        edgeStreams.set(edge, next);
        const down = nodeById.get(edge.to.node);
        const downResult = nodeResults[edge.to.node];
        const downKind = down ? UNITS[down.unit]?.kind : null;
        if (downKind === 'buffer' && downResult && bufferOutletCanAbsorbOverflow(down, edges, nodeById)) {
          got += applyBufferOverflowIntake(
            down, next, setpoints?.[down.id], edges, edgeStreams, nodeResults, nodeById,
            edgeLimits, setpoints
          );
          continue;
        }
        got += target;
        if (downKind === 'sink') refreshSinkFromOffer(downResult, next, target);
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
  // receipts so heat/electricity balances stay closed.
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
      } else {
        // Electricity or heat. Heat sinks allow fan-in: mix, clamp, then scale each leg.
        const inlet = incomingStreams.length > 1 ? mixHeat(incomingStreams) : incomingStreams[0];
        const result = evaluateSink(node, inlet, setpoint, periodDays);
        nodeResults[node.id] = result;
        const want = streamAmount(inlet);
        const got = streamAmount(result.received);
        const scale = want === 0 ? 0 : got / want;
        for (const edge of incoming) edgeStreams.set(edge, scaleStream(edgeStreams.get(edge), scale));
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
      // Consumers without requestedInputs/consumed for this port get nothing.
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
    // evaluateSink also sets consumed (for bus allocation), but received is the
    // sink tally — do not double-count energy on sinks.
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
  for (const node of caseDefinition.graph.nodes) {
    const result = nodeResults[node.id];
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

return { solveOperation, unverifiedRightsWarnings };
});
