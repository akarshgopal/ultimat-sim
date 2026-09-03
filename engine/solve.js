(function exposeSolver(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./model') : root.FlowsheetModel,
    typeof require === 'function' ? require('./units') : root.FlowsheetUnits
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetSolver = api;
})(globalThis, (model, units) => {
const {
  chargeAmount,
  cloneStream,
  elementAmounts,
  nonnegative,
  scaleStream,
  validateStream,
} = model;
const { UNITS } = units;

function solveOperation(caseDefinition) {
  const { nodes, edges } = caseDefinition.graph;
  validateGraph(nodes, edges);
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
  const warnings = nodes
    .filter(node => solved.nodeResults[node.id]?.limitedBy?.length)
    .map(node => `${node.id} limited by ${solved.nodeResults[node.id].limitedBy.join(', ')}`);
  for (const limit of caseDefinition.operation?.boundaryLimitedBy || []) {
    warnings.push(`plant limited by ${limit}`);
  }
  if (!converged) warnings.push('recycle did not converge');
  return {
    streams,
    nodes: solved.nodeResults,
    balances,
    constraints: caseDefinition.constraints || [],
    warnings,
    convergence: {
      converged,
      iterations: recycleEdges.length ? iterations : (buses.length ? 2 : 1),
      largestResidual: Math.max(balances.maxAbsResidual, recycleResidual),
    },
  };
}

function evaluateGraph(caseDefinition, allocations, recycleStreams = new Map()) {
  const { nodes, edges } = caseDefinition.graph;
  const edgeStreams = new Map([...recycleStreams].map(([edge, stream]) => [edge, cloneStream(stream)]));
  const nodeResults = {};
  for (const node of topologicalOrder(nodes, edges)) {
    const unit = UNITS[node.unit];
    const incoming = edges.filter(edge => edge.to.node === node.id);
    const outgoing = edges.filter(edge => edge.from.node === node.id);
    if (unit.kind === 'source') {
      const stream = cloneStream(validateStream(node.params?.stream, unit.ports.out.kind));
      nodeResults[node.id] = { available: stream };
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
      nodeResults[node.id] = { received: inlets.in };
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
    if (connections.has(inputEndpoint) && UNITS[toNode.unit].kind !== 'mixer') {
      throw new Error(`Port has multiple connections: ${inputEndpoint.split(':').slice(1).join('.')}`);
    }
    if (connections.has(outputEndpoint) && !['junction', 'splitter'].includes(UNITS[fromNode.unit].kind)) {
      throw new Error(`Port has multiple connections: ${outputEndpoint.split(':').slice(1).join('.')}`);
    }
    connections.set(outputEndpoint, true);
    connections.set(inputEndpoint, true);
  }

  for (const node of nodes) {
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

return { solveOperation, validateGraph };
});
