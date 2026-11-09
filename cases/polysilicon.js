// Solar-grade polysilicon on sunlight: quartz → MG-Si → Siemens-style poly-Si (see cases/silicon-metal.js).
const { siliconChain } = require('./silicon-metal.js');

function createPolysiliconCase() {
  return siliconChain({ poly: true, kgPerDay: 1000 });
}

module.exports = { createPolysiliconCase };
