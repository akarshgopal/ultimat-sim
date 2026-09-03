const { streamMassKg } = require('../engine/model');
const { solveOperation } = require('../engine/solve');
const { createSabatierCase } = require('../cases/sabatier');

function formatStream(stream) {
  if (stream.kind === 'material') return `${streamMassKg(stream).toFixed(6)} kg`;
  const temperature = stream.kind === 'heat' ? ` @ ${stream.T_C} °C` : '';
  return `${stream.kWh.toFixed(6)} kWh${temperature}`;
}

function runDemo() {
  const definition = createSabatierCase();
  const solved = solveOperation(definition);
  console.log('Air + water to methane flowsheet');
  console.log('\nNodes');
  for (const [id, result] of Object.entries(solved.nodes)) {
    if (result.activity !== undefined) {
      const node = definition.graph.nodes.find(candidate => candidate.id === id);
      console.log(`- ${id}: activity ${result.activity}; request ${definition.operation.setpoints[id]}; capacity ${node.capacity}; limited by ${result.limitedBy?.join(', ') || 'none'}`);
      console.log(`  requested inputs: ${Object.entries(result.requestedInputs).map(([port, stream]) => `${port} ${formatStream(stream)}`).join('; ')}`);
    } else {
      console.log(`- ${id}`);
    }
  }
  console.log('\nEdges');
  for (const edge of solved.streams) {
    console.log(`- ${edge.from.node}.${edge.from.port} -> ${edge.to.node}.${edge.to.port}: ${formatStream(edge.stream)}`);
  }
  console.log('\nBalances');
  console.log(`- elements: ${JSON.stringify(solved.balances.elements)}`);
  console.log(`- charge: ${solved.balances.chargeMol} mol`);
  console.log(`- electricity: ${solved.balances.electricityKWh} kWh`);
  console.log(`- heat: ${solved.balances.heatKWh} kWh`);
  console.log(`- max residual: ${solved.balances.maxAbsResidual}`);
  return solved;
}

if (require.main === module) runDemo();

module.exports = { runDemo };
