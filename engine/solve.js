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
const { UNITS } = units;
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
  for (; iterations < 100; iterations += 1) {
    const plan = buses.length ? evaluateGraph(caseDefinition, null, recycleStreams) : null;
    const allocations = plan ? allocateElectricity(caseDefinition, plan) : null;
    solved = evaluateGraph(caseDefinition, allocations, recycleStreams);
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
    solved.nodeResults[node.id].supplied = cloneStream(solved.edgeStreams.get(edge));
  }

  const streams = edges.map(edge => ({ ...edge, stream: cloneStream(solved.edgeStreams.get(edge)) }));
  const balances = calculateBalances(nodes, edges, solved.edgeStreams, solved.nodeResults);
  const heatIntegration = collectHeatIntegration(caseDefinition, solved.nodeResults);
  const warnings = nodes
    .filter(node => solved.nodeResults[node.id]?.limitedBy?.length)
    .map(node => `${node.id} limited by ${solved.nodeResults[node.id].limitedBy.join(', ')}`);
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

function evaluateGraph(caseDefinition, allocations, recycleStreams = new Map()) {
  const { nodes, edges } = caseDefinition.graph;
  const remaining = siteBudgets(caseDefinition.site);
  const edgeStreams = new Map([...recycleStreams].map(([edge, stream]) => [edge, cloneStream(stream)]));
  const nodeResults = {};
  for (const node of topologicalOrder(nodes, edges)) {
    const unit = UNITS[node.unit];
    const incoming = edges.filter(edge => edge.to.node === node.id);
    const outgoing = edges.filter(edge => edge.from.node === node.id);
    if (unit.kind === 'source') {
      let stream = cloneStream(validateStream(node.params?.stream, unit.ports.out.kind));
      const limitedBy = [];
      if (caseDefinition.site && remaining.has(node.siteResource)) {
        const requested = streamAmount(stream);
        const available = remaining.get(node.siteResource);
        if (requested > available + Math.max(1, available) * 1e-9) {
          stream = scaleStream(stream, requested === 0 ? 0 : available / requested);
          limitedBy.push('site budget');
        }
        remaining.set(node.siteResource, Math.max(0, available - streamAmount(stream)));
      }
      nodeResults[node.id] = { available: stream, limitedBy };
      edgeStreams.set(outgoing[0], stream);
      continue;
    }
    if (unit.kind === 'junction') {
      const available = cloneStream(edgeStreams.get(incoming[0]));
      nodeResults[node.id] = { available };
      for (const edge of outgoing) {
        edgeStreams.set(edge, allocations?.get(edge) || cloneStream(available));
      }
      continue;
    }
    if (unit.kind === 'splitter') {
      const available = cloneStream(edgeStreams.get(incoming[0]));
      const weights = outgoing.map(edge => nonnegative(Number(edge.weight ?? 1), 'split weight'));
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      if (totalWeight === 0) throw new Error(`${node.id} split weights cannot all be zero`);
      nodeResults[node.id] = { available };
      outgoing.forEach((edge, index) => edgeStreams.set(edge, scaleStream(available, weights[index] / totalWeight)));
      continue;
    }
    if (unit.kind === 'mixer') {
      const available = mixMaterial(incoming.map(edge => edgeStreams.get(edge)));
      nodeResults[node.id] = { available };
      edgeStreams.set(outgoing[0], available);
      continue;
    }
    const inlets = Object.fromEntries(
      incoming.map(edge => [edge.to.port, cloneStream(edgeStreams.get(edge))])
    );
    if (unit.kind === 'sink') {
      const incomingStreams = incoming.map(edge => cloneStream(edgeStreams.get(edge)));
      nodeResults[node.id] = {
        received: incomingStreams.length > 1 ? mixHeat(incomingStreams) : incomingStreams[0],
      };
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
    for (const edge of outgoing) edgeStreams.set(edge, result.outlets[edge.from.port]);
  }
  return { edgeStreams, nodeResults };
}

function allocateElectricity(caseDefinition, plan) {
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
      const wanted = result.requestedInputs[edge.to.port].kWh;
      const usable = result.consumed[edge.to.port].kWh;
      const kWh = Math.min(wanted, usable, remaining);
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
    for (const stream of Object.values(result.consumed || {})) {
      if (stream.kind === 'electricity') electricityConsumed += stream.kWh;
      if (stream.kind === 'heat') heatConsumed += stream.kWh;
    }
    for (const stream of Object.values(result.outlets || {})) {
      if (stream.kind === 'electricity') electricityConsumed -= stream.kWh;
      if (stream.kind === 'heat') heatConsumed -= stream.kWh;
    }
    if (result.received?.kind === 'electricity') electricityConsumed += result.received.kWh;
    if (result.received?.kind === 'heat') heatConsumed += result.received.kWh;
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
function solveHorizon(caseDefinition) {
  const hours = hourlyProfile(caseDefinition.site);
  if (!hours) return solveOperation(caseDefinition);

  const solarKWp = Number(caseDefinition.site.solarKWp) || 0;
  const storage = caseDefinition.site.storage || {};
  const batteryKWh = Math.max(0, Number(storage.batteryKWh) || 0);
  const powerKW = Math.max(0, Number(storage.powerKW) || batteryKWh);
  const eta = Number(storage.efficiency ?? 0.9);
  let soc = Math.max(0, Number(storage.initialKWh) || 0);
  const remainingResource = {};
  for (const [id, resource] of Object.entries(caseDefinition.site.resources || {})) {
    remainingResource[id] = streamAmount(resource.stream);
  }
  const remainingDemand = {};
  for (const node of caseDefinition.graph.nodes.filter(item => UNITS[item.unit].kind === 'converter')) {
    remainingDemand[node.id] = caseDefinition.operation?.setpoints?.[node.id] ?? 0;
  }

  const totals = {
    nodes: {},
    streams: [],
    warnings: [],
    balances: { elements: {}, chargeMol: 0, electricityKWh: 0, heatKWh: 0, maxAbsResidual: 0 },
    convergence: { converged: true, iterations: 24, largestResidual: 0 },
    horizon: { hours: [], solarKWp, profile: hours, batteryKWh },
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
    for (const node of hourCase.graph.nodes) {
      if (UNITS[node.unit].kind === 'source' && node.siteResource && hourCase.site.resources[node.siteResource]) {
        node.params.stream = cloneStream(hourCase.site.resources[node.siteResource].stream);
      }
      if (UNITS[node.unit].kind === 'converter') {
        node.capacity = (caseDefinition.graph.nodes.find(item => item.id === node.id).capacity || 0) / 24;
        const leftover = remainingDemand[node.id] || 0;
        hourCase.operation.setpoints[node.id] = power === 0 ? 0 : Math.min(leftover, node.capacity, leftover / sunLeft);
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
      const methaneHour = Math.min(
        hourCase.operation.setpoints[sabatier.id] || 0,
        kWhPerKg > 0 ? power / kWhPerKg : 0
      );
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
    const solved = solveOperation(hourCase);
    accumulateSolved(totals, solved);
    for (const node of caseDefinition.graph.nodes.filter(item => UNITS[item.unit].kind === 'converter')) {
      remainingDemand[node.id] = Math.max(0, (remainingDemand[node.id] || 0) - (solved.nodes[node.id]?.activity || 0));
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
    totals.horizon.hours.push({
      hour, pv, discharge, soc, supplied,
      methane,
      h2,
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

  totals.warnings = totals.warnings.concat(
    totals.horizon.hours.filter(entry => entry.pv === 0 && entry.methane === 0 && (entry.h2 || 0) === 0).length === 24
      ? []
      : [`${totals.horizon.hours.filter(entry => entry.pv > 0).length} daylight hours on the selected typical day`]
  );
  totals.heatIntegration = collectHeatIntegration(caseDefinition, totals.nodes);
  return totals;
}

return { solveOperation, solveHorizon, hourlyProfile, validateGraph, unverifiedRightsWarnings };
});
