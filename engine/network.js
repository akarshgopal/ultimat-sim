(function exposeNetwork(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./model') : root.FlowsheetModel,
    typeof require === 'function' ? require('./solve') : root.FlowsheetSolver,
    typeof require === 'function' ? require('./economics') : root.FlowsheetEconomics,
    typeof require === 'function' ? require('./footprint') : root.FlowsheetFootprint
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetNetwork = api;
})(globalThis, (model, solver, economics, footprint) => {
const { scaleStream, streamMassKg } = model;
const { evaluateEconomics } = economics;
const { estimateFootprint, pvLandHa } = footprint;

const SEA_USD_PER_T_KM = 0.012;
const ROAD_USD_PER_T_KM = 0.08;

function cloneDefinition(definition) {
  return JSON.parse(JSON.stringify(definition));
}

function distanceKm(from, to) {
  if (![from?.latitude, from?.longitude, to?.latitude, to?.longitude].every(Number.isFinite)) return null;
  const toRad = value => value * Math.PI / 180;
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRad(to.longitude - from.longitude);
  const chord = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

function dominantSubstance(stream) {
  if (stream?.kind !== 'material' || !stream.mol) return null;
  return Object.entries(stream.mol).sort((left, right) => right[1] - left[1])[0]?.[0] || null;
}

function solvePlant(definition) {
  const solve = definition.site?.solar?.typicalMonths && solver.solveHorizon
    ? solver.solveHorizon
    : solver.solveOperation;
  const solved = solve(definition);
  const plantEconomics = evaluateEconomics(definition, solved);
  const plantFootprint = estimateFootprint({
    site: definition.site,
    graph: definition.graph,
    solved,
    params: definition.site?.footprint,
  });
  return { definition, solved, economics: plantEconomics, footprint: plantFootprint };
}

function plantProducts(plant) {
  const periodDays = plant.economics?.periodDays || 365;
  const products = [];
  for (const node of plant.definition.graph.nodes) {
    if (node.economics?.disposition !== 'sale') continue;
    const received = plant.solved.nodes[node.id]?.received;
    if (!received) continue;
    const kgPerDay = received.kind === 'material' ? streamMassKg(received)
      : received.kind === 'consumable' ? received.amount : received.kWh;
    if (!(kgPerDay > 0)) continue;
    products.push({
      plantId: plant.id,
      nodeId: node.id,
      substance: dominantSubstance(received) || node.id,
      kind: received.kind,
      kgPerDay,
      tonnesPerYear: received.kind === 'material' ? kgPerDay * periodDays / 1000 : null,
      annualAmount: kgPerDay * periodDays,
      unitPrice: Number(node.economics.unitPrice) || 0,
    });
  }
  return products;
}

function applyCorridor(corridor, plants) {
  const from = plants.find(plant => plant.id === corridor.from.plant);
  const to = plants.find(plant => plant.id === corridor.to.plant);
  if (!from || !to) throw new Error(`Corridor ${corridor.id || ''} references an unknown plant`);
  const received = from.solved.nodes[corridor.from.node]?.received;
  if (!received || received.kind !== 'material') {
    throw new Error(`${corridor.from.node} is not a delivered material product`);
  }
  const km = distanceKm(from.definition.site, to.definition.site);
  if (km == null) throw new Error('Corridors need sited plants with coordinates');
  const loss = Number(corridor.loss ?? 0.002);
  const rate = Number(corridor.usdPerTonneKm ?? (corridor.mode === 'road' ? ROAD_USD_PER_T_KM : SEA_USD_PER_T_KM));
  const kgPerDay = streamMassKg(received);
  const deliveredKgPerDay = kgPerDay * (1 - loss);
  const periodDays = from.economics.periodDays || 365;
  // Freight is USD/year: (t/day) × periodDays × km × ($/t-km).
  const annualFreight = deliveredKgPerDay / 1000 * periodDays * km * rate;
  const destination = to.definition.graph.nodes.find(node => node.id === corridor.to.node);
  if (!destination || destination.economics?.unitCost == null) {
    throw new Error(`${corridor.to.node} must be a purchased source to receive a corridor`);
  }
  const available = destination.params?.stream;
  if (!available || available.kind !== 'material') throw new Error(`${corridor.to.node} needs a material stream`);
  const requested = streamMassKg(available);
  const factor = requested === 0 ? 0 : Math.min(1, deliveredKgPerDay / requested);
  destination.params.stream = scaleStream(available, factor);
  if (destination.siteResource && to.definition.site?.resources?.[destination.siteResource]) {
    to.definition.site.resources[destination.siteResource].stream = scaleStream(
      to.definition.site.resources[destination.siteResource].stream,
      factor
    );
  }
  const resolved = solvePlant(to.definition);
  Object.assign(to, {
    definition: resolved.definition,
    solved: resolved.solved,
    economics: resolved.economics,
    footprint: resolved.footprint,
  });
  return {
    id: corridor.id || `${corridor.from.plant}:${corridor.from.node}->${corridor.to.plant}:${corridor.to.node}`,
    from: { plant: corridor.from.plant, node: corridor.from.node },
    to: { plant: corridor.to.plant, node: corridor.to.node },
    km,
    mode: corridor.mode || 'sea',
    loss,
    usdPerTonneKm: rate,
    kgPerDay,
    deliveredKgPerDay,
    annualFreight,
    substance: dominantSubstance(received),
  };
}

function evaluateNetwork(network = {}) {
  // Deep-clone definitions up front so corridor scaling never mutates caller input
  // and evaluateNetwork stays idempotent across repeated calls on the same object.
  const plants = (network.plants || []).map(plant => {
    const definition = cloneDefinition(plant.definition);
    const resolved = solvePlant(definition);
    return {
      id: plant.id,
      name: plant.name,
      definition: resolved.definition,
      solved: resolved.solved,
      economics: resolved.economics,
      footprint: resolved.footprint,
    };
  });

  // Key transferred origin sales by plantId:nodeId (corridor transfers are not market sales).
  const transferred = new Set(
    (network.corridors || []).map(corridor => `${corridor.from.plant}:${corridor.from.node}`)
  );

  const corridors = [];
  for (const corridor of network.corridors || []) corridors.push(applyCorridor(corridor, plants));

  const products = plants.flatMap(plantProducts);
  const slate = {};
  let transferredOriginRevenue = 0;
  for (const product of products) {
    const key = `${product.plantId}:${product.nodeId}`;
    if (transferred.has(key)) {
      // Rule: a corridor haul is an internal transfer, not an external market sale.
      // Exclude the origin sale from the network product slate and from network annualRevenue.
      // Destination economics after re-solve count normally; corridor freight stays in OPEX.
      transferredOriginRevenue += product.annualAmount * product.unitPrice;
      continue;
    }
    if (!product.tonnesPerYear) continue;
    slate[product.substance] = (slate[product.substance] || 0) + product.tonnesPerYear;
  }

  const landHa = plants.reduce((sum, plant) => sum + (plant.footprint?.totalHa || 0), 0);
  const freight = corridors.reduce((sum, corridor) => sum + corridor.annualFreight, 0);
  const installedCapex = plants.reduce((sum, plant) => sum + plant.economics.installedCapex, 0);
  const plantRevenue = plants.reduce((sum, plant) => sum + plant.economics.annualRevenue, 0);
  const annualRevenue = plantRevenue - transferredOriginRevenue;
  const annualOperatingCost = plants.reduce((sum, plant) => sum + plant.economics.annualOperatingCost, 0) + freight;
  const annualNetCash = annualRevenue - annualOperatingCost;
  const projectLifeYears = Math.max(1, ...plants.map(plant => plant.economics.projectLifeYears || 20));
  const discountRate = plants[0]?.economics.discountRate ?? 0.08;
  const cashFlows = [-installedCapex];
  for (let year = 1; year <= projectLifeYears; year += 1) cashFlows.push(annualNetCash);
  const npv = cashFlows.reduce((sum, cashFlow, year) => sum + cashFlow / (1 + discountRate) ** year, 0);

  return {
    plants,
    corridors,
    products,
    slate,
    landHa,
    freight,
    transferred,
    transferredOriginRevenue,
    installedCapex,
    annualRevenue,
    annualOperatingCost,
    annualNetCash,
    npv,
    projectLifeYears,
    discountRate,
  };
}

return {
  SEA_USD_PER_T_KM,
  ROAD_USD_PER_T_KM,
  distanceKm,
  pvLandHa,
  estimateFootprint,
  solvePlant,
  plantProducts,
  evaluateNetwork,
};
});
