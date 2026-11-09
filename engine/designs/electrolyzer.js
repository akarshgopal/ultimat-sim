// Solar-matched alkaline electrolyzer — first-principles parametric design.
//
// Goal: the cheapest kg of H₂ from a stack that runs only while the sun shines (~6–8 full-load
// hours a day), fed by PV. Two things decide that:
//   • $ per kW of stack + balance of plant — built up from geometry and a bill of materials at
//     commodity prices, times per-part manufacturing factors and assembly labour (so the idiot
//     index is explicit and attackable part by part);
//   • kWh per kg — from the cell polarization curve at the chosen current density.
// Higher current density shrinks the stack per kW (cheaper) but raises cell voltage (more PV per
// kg). With cheap PV and low utilization the optimum moves to high current density;
// optimizeCurrentDensity() finds it per site with the solar-utilization model the company simulator
// uses.
//
// Screening estimate; every assumption is in DEFAULTS. Commodity prices come from data/bom.js.
(function exposeElectrolyzerDesign(root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../../data/bom.js') : root.FoundryBom,
    typeof require === 'function' ? require('../utilization.js') : root.FoundryUtilization,
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.FoundryDesigns = root.FoundryDesigns || {})[api.id] = api;
})(globalThis, (Bom, Utilization) => {
  const F = 96485.33212; // C/mol
  const M_H2 = 2.01588; // g/mol
  const HHV_KWH_PER_KG = 39.41;
  // Recipe basis per kg H₂/day and kWh per kg H₂: the TEA electrolyzer pack ($1,500/kW installed,
  // PEM-family) and the plant models' 52 kWh/kg.
  const RECIPE = Object.freeze({
    electrolyzer: Object.freeze({ usdPerKgDay: 3250, kWhPerKg: 52, pathwayId: 'green-hydrogen' }),
  });

  const DEFAULTS = Object.freeze({
    currentDensityAPerCm2: 0.4,
    // Cell polarization at ~80 °C, 30 wt% KOH, Ni electrodes, Zirfon separator:
    //   V(j) = a + b·log10(j) + r·j        (j in A/cm²)
    // fitted to typical modern alkaline cells: 1.75 V @ 0.2, 1.85 V @ 0.4, 2.10 V @ 1.0 A/cm².
    polarization: Object.freeze({ a: 1.749, b: 0.099, r: 0.351 }),
    faradaicEfficiency: 0.98,
    separator: 'zirfon',
    separators: Object.freeze({
      zirfon: Object.freeze({ label: 'Zirfon-type (PPS mesh + ZrO₂)', usdPerM2: 60, extraOhmCm2: 0 }),
      pps: Object.freeze({ label: 'Plain PPS felt (cheap, more resistive)', usdPerM2: 8, extraOhmCm2: 0.15 }),
    }),
    cellAreaM2: 2.5, // active area per cell
    cellsPerStack: 250,
    frameFactor: 1.35, // plate/gasket area ÷ active area
    plateThicknessMm: 1.0, // Ni-plated carbon-steel bipolar plates
    nickelPlatingUm: 15, // per plate face
    electrodeNiKgPerM2: 0.35, // Ni mesh/foam per electrode (two per cell)
    gasketPolymerKgPerM2: 0.4,
    endPlateThicknessMm: 50,
    pressure: 'atmospheric', // 'atmospheric' | 'pressurized' (30 bar)
    // Balance of plant per kW: lye circulation, gas–lye separators, scrubbers, piping, skid.
    bop: Object.freeze({
      atmospheric: Object.freeze({ steelKgPerKW: 4, stainlessKgPerKW: 0.8, copperKgPerKW: 0.05, polymerKgPerKW: 0.3 }),
      pressurized: Object.freeze({ steelKgPerKW: 9, stainlessKgPerKW: 1.5, copperKgPerKW: 0.05, polymerKgPerKW: 0.3 }),
    }),
    coupling: 'direct-dc', // 'direct-dc' | 'dc-dc' | 'rectifier'
    couplings: Object.freeze({
      'direct-dc': Object.freeze({ label: 'PV strings wired straight to stacks', usdPerKW: 0, loss: 0.05, copperKgPerKW: 0.3 }),
      'dc-dc': Object.freeze({ label: 'MPPT DC-DC converter', usdPerKW: 40, loss: 0.02, copperKgPerKW: 0.4 }),
      rectifier: Object.freeze({ label: 'Grid-style AC rectifier (transformer + thyristors)', usdPerKW: 120, loss: 0.04, copperKgPerKW: 1.0 }),
    }),
    concreteKgPerKW: 15, // light skid foundations (atmospheric, no building)
    // Manufacturing factors: finished part cost ÷ its raw-material cost.
    manufacturing: Object.freeze({
      plates: 2.0, // stamping + Ni plating at volume
      electrodes: 2.5, // expanded mesh / foam + activation
      gaskets: 3.0,
      endHardware: 2.0,
      bop: 3.0, // vessels, pumps, valves, piping fabrication
      civil: 1.5,
    }),
    labourUsdPerHour: 40,
    assemblyHoursPerStack: 30,
    assemblyHoursPerCell: 0.2,
    installFactor: 1.15, // site install, commissioning, controls on top of equipment
    fixedOmFracPerYear: 0.02,
    stackLifeHours: 80000, // at ~2,600 sun-hours a year this outlives the plant
    lifeYears: 25,
  });

  // Named starting points. 'today' is calibrated to Chinese pressurized alkaline systems
  // (~$300–500/kW installed with rectifier); 'lean' is the solar-matched design target (DEFAULTS).
  const PRESETS = Object.freeze({
    today: Object.freeze({
      label: 'Today: pressurized alkaline (China-made)',
      params: Object.freeze({
        currentDensityAPerCm2: 0.3,
        pressure: 'pressurized',
        coupling: 'rectifier',
        cellAreaM2: 2.0,
        cellsPerStack: 300,
        plateThicknessMm: 2.0,
        electrodeNiKgPerM2: 0.8,
        bop: { pressurized: { steelKgPerKW: 15, stainlessKgPerKW: 3, copperKgPerKW: 0.3, polymerKgPerKW: 0.5 } },
        concreteKgPerKW: 40,
        manufacturing: { plates: 5, electrodes: 8, gaskets: 6, endHardware: 4, bop: 6, civil: 2.5 },
        assemblyHoursPerStack: 600,
        assemblyHoursPerCell: 2,
        installFactor: 1.3,
      }),
    }),
    lean: Object.freeze({
      label: 'Lean solar-matched target: atmospheric, direct-DC, thin plates',
      params: Object.freeze({}),
    }),
  });

  function merge(params = {}) {
    const p = { ...DEFAULTS, ...params };
    p.polarization = { ...DEFAULTS.polarization, ...(params.polarization || {}) };
    p.manufacturing = { ...DEFAULTS.manufacturing, ...(params.manufacturing || {}) };
    p.bop = {
      atmospheric: { ...DEFAULTS.bop.atmospheric, ...(params.bop?.atmospheric || {}) },
      pressurized: { ...DEFAULTS.bop.pressurized, ...(params.bop?.pressurized || {}) },
    };
    return p;
  }

  function commodity(name) {
    return Bom.COMMODITIES[name].usdPerKg;
  }

  // Cell voltage (V) at current density j (A/cm²).
  function cellVoltage(j, p) {
    const sep = p.separators[p.separator] || p.separators.zirfon;
    const { a, b, r } = p.polarization;
    return a + b * Math.log10(Math.max(j, 1e-4)) + (r + sep.extraOhmCm2) * j;
  }

  // Full design at the given parameters. Per-kW figures are per kW of DC stack input at nameplate.
  function design(params = {}) {
    const p = merge(params);
    const j = p.currentDensityAPerCm2;
    const sep = p.separators[p.separator] || p.separators.zirfon;
    const coupling = p.couplings[p.coupling] || p.couplings['direct-dc'];
    const V = cellVoltage(j, p);
    const eta = p.faradaicEfficiency;
    // Energy per kg at the stack, then at the PV terminals after coupling losses.
    const stackKWhPerKg = (V * 2 * F) / (M_H2 / 1000) / eta / 3.6e6;
    const kWhPerKg = stackKWhPerKg / (1 - coupling.loss);
    const activeM2PerKW = 0.1 / (V * j); // 1 kW = V·j·1e4 W/m² × area
    const plateM2PerKW = activeM2PerKW * p.frameFactor;
    const kgH2PerDayPerKW = 24 / stackKWhPerKg;
    const stackKW = p.cellsPerStack * p.cellAreaM2 * V * j * 10; // kW per stack
    const steelDensity = 7850;
    const niDensity = 8900;

    // Bill of materials per kW; bought-in lines are appended below so the rows sum to installed $/kW.
    const bom = [];
    const add = (part, material, kg, manufacturing, note) => {
      const usdMaterials = kg * commodity(material);
      bom.push({ part, material, kg, usdMaterials, manufacturing, usd: usdMaterials * manufacturing, note });
    };
    const bought = (part, usd, note) => bom.push({ part, material: null, kg: null, usdMaterials: null, manufacturing: null, usd, note });
    add('Bipolar plates', 'steel', plateM2PerKW * (p.plateThicknessMm / 1000) * steelDensity, p.manufacturing.plates, `${p.plateThicknessMm} mm carbon steel, ${p.frameFactor}× active area`);
    add('Plate Ni plating', 'nickel', plateM2PerKW * 2 * (p.nickelPlatingUm / 1e6) * niDensity, p.manufacturing.plates, `${p.nickelPlatingUm} µm both faces`);
    add('Electrodes (Ni mesh)', 'nickel', activeM2PerKW * 2 * p.electrodeNiKgPerM2, p.manufacturing.electrodes, `${p.electrodeNiKgPerM2} kg/m² × anode + cathode`);
    add('Gaskets / frames', 'polymer', plateM2PerKW * p.gasketPolymerKgPerM2, p.manufacturing.gaskets, 'EPDM/PP frames');
    const endPlateKg = 2 * p.cellAreaM2 * p.frameFactor * (p.endPlateThicknessMm / 1000) * steelDensity * 1.15; // +15% tie rods
    add('End plates + tie rods', 'steel', endPlateKg / stackKW, p.manufacturing.endHardware, `${p.endPlateThicknessMm} mm plates, ${Math.round(stackKW)} kW stack`);
    const bop = p.bop[p.pressure] || p.bop.atmospheric;
    add('BoP vessels, piping, skid', 'steel', bop.steelKgPerKW, p.manufacturing.bop, `${p.pressure} lye loop, gas–lye separators`);
    add('BoP stainless (lye/gas)', 'stainless-steel', bop.stainlessKgPerKW, p.manufacturing.bop, 'wetted KOH/H₂ service');
    add('BoP pumps, instruments (Cu)', 'copper', bop.copperKgPerKW, p.manufacturing.bop, 'motors, sensors');
    add('BoP polymer', 'polymer', bop.polymerKgPerKW, p.manufacturing.bop, 'tank liners, hoses');
    add('DC bus / coupling copper', 'copper', coupling.copperKgPerKW, 1.5, coupling.label);
    add('Foundations', 'concrete', p.concreteKgPerKW, p.manufacturing.civil, 'skid pads');

    const separatorUsdPerKW = plateM2PerKW * sep.usdPerM2;
    const electronicsUsdPerKW = coupling.usdPerKW;
    const cellsPerKW = 1 / (p.cellAreaM2 * V * j * 10);
    const labourUsdPerKW = p.labourUsdPerHour * (p.assemblyHoursPerStack / stackKW + p.assemblyHoursPerCell * cellsPerKW);
    const materialsUsdPerKW = bom.reduce((s, x) => s + x.usdMaterials, 0);
    const manufacturedUsdPerKW = bom.reduce((s, x) => s + x.usd, 0) + separatorUsdPerKW + electronicsUsdPerKW + labourUsdPerKW;
    const installedUsdPerKW = manufacturedUsdPerKW * p.installFactor;
    // Idiot-index floor: raw materials + the separator's own materials (~2 kg/m² polymer).
    const separatorMaterialsUsdPerKW = plateM2PerKW * 2 * commodity('polymer');
    const floorUsdPerKW = materialsUsdPerKW + separatorMaterialsUsdPerKW;
    const kWPerKgDay = 1 / kgH2PerDayPerKW;
    bom.push({ part: 'Separator (purchased)', material: 'polymer', kg: plateM2PerKW * 2, usdMaterials: separatorMaterialsUsdPerKW,
      manufacturing: separatorUsdPerKW / separatorMaterialsUsdPerKW, usd: separatorUsdPerKW, note: sep.label });
    bought('Power electronics', electronicsUsdPerKW, coupling.label);
    bought('Assembly labour', labourUsdPerKW, `${Math.round(stackKW)} kW stacks`);
    bought('Install (× factor)', installedUsdPerKW - manufacturedUsdPerKW, `× ${p.installFactor}`);
    return {
      params: p,
      basis: 'per kW',
      bom,
      flexible: true,
      materialsUsdPerKgDay: floorUsdPerKW * kWPerKgDay,
      kpis: [
        { label: 'Installed per kW', value: `$${installedUsdPerKW.toFixed(0)}/kW`, sub: `materials $${floorUsdPerKW.toFixed(1)}/kW` },
        { label: 'Cell voltage', value: `${V.toFixed(3)} V`, sub: `${j} A/cm² · ${Math.round((HHV_KWH_PER_KG / kWhPerKg) * 100)}% HHV` },
        { label: 'Stack', value: `${Math.round(stackKW)} kW`, sub: `${p.cellsPerStack} cells × ${p.cellAreaM2} m²` },
      ],
      cellVoltage: V,
      efficiencyHHV: HHV_KWH_PER_KG / kWhPerKg,
      stackKWhPerKg,
      kWhPerKg,
      activeM2PerKW,
      stackKW,
      cellsPerKW,
      kgH2PerDayPerKW,
      materialsUsdPerKW: floorUsdPerKW,
      installedUsdPerKW,
      idiotIndex: installedUsdPerKW / floorUsdPerKW,
      // Per kg H₂/day of 24 h nameplate, the basis the plant models use.
      installedUsdPerKgDay: installedUsdPerKW * kWPerKgDay,
      vsRecipe: {
        capexFactor: (installedUsdPerKW * kWPerKgDay) / RECIPE.electrolyzer.usdPerKgDay,
        energyFactor: kWhPerKg / RECIPE.electrolyzer.kWhPerKg,
      },
    };
  }

  // Levelized cost of H₂ ($/kg) on solar alone at a site: PV + stack sized together by the
  // utilization model (flexible block), capital recovered over the plant life.
  function lcoh(params, site, { pvUsdPerKWp = 758, discountRate = 0.08, pvOmFrac = 20 / 758, waterUsdPerKg = 0.03, landUsdPerKWp = 0 } = {}) {
    const d = design(params);
    const kgPerYear = 1e6; // scale-free: compute per million kg/yr then divide
    const energyKWhYr = d.kWhPerKg * kgPerYear;
    const solar = Utilization.siteSolar(site, Utilization.mergeCfg());
    // Equipment at 24 h nameplate for this throughput, then the flexible design oversizes it.
    const avgKW = energyKWhYr / 8760;
    const k24 = avgKW * d.installedUsdPerKW;
    const flex = Utilization.flexDesign(solar, energyKWhYr, k24, pvUsdPerKWp + landUsdPerKWp);
    const stackCapex = k24 * flex.nameplateFactor;
    const pvCapex = flex.pvKWp * (pvUsdPerKWp + landUsdPerKWp);
    const af = (1 - (1 + discountRate) ** -d.params.lifeYears) / discountRate;
    const annual = (stackCapex + pvCapex) / af
      + stackCapex * d.params.fixedOmFracPerYear
      + flex.pvKWp * pvUsdPerKWp * pvOmFrac
      + kgPerYear * waterUsdPerKg;
    const fullLoadHoursPerYear = flex.fullLoadHoursPerDay * 365;
    return {
      design: d,
      usdPerKg: annual / kgPerYear,
      parts: {
        stack: (stackCapex / af + stackCapex * d.params.fixedOmFracPerYear) / kgPerYear,
        pv: (pvCapex / af + flex.pvKWp * pvUsdPerKWp * pvOmFrac) / kgPerYear,
        water: waterUsdPerKg,
      },
      fullLoadHoursPerDay: flex.fullLoadHoursPerDay,
      nameplateFactor: flex.nameplateFactor,
      stackLifeYears: d.params.stackLifeHours / fullLoadHoursPerYear,
      pvKWpPerKgDay: flex.pvKWp / (kgPerYear / 365),
    };
  }

  // Scan current density for the lowest LCOH at a site and PV price.
  function optimizeCurrentDensity(params, site, opts = {}) {
    let best = null;
    const curve = [];
    for (let step = 0.1; step <= 3.0001; step += 0.05) {
      const j = Number(step.toFixed(2));
      const r = lcoh({ ...params, currentDensityAPerCm2: j }, site, opts);
      curve.push({ j, usdPerKg: r.usdPerKg, kWhPerKg: r.design.kWhPerKg, usdPerKW: r.design.installedUsdPerKW });
      if (!best || r.usdPerKg < best.usdPerKg) best = { j, ...r };
    }
    return { best, curve };
  }

  function simulatorOverride(params) {
    const d = design(params);
    return { electrolyzer: { capexFactor: d.vsRecipe.capexFactor, energyFactor: d.vsRecipe.energyFactor, materialsFactor: d.materialsUsdPerKgDay / RECIPE.electrolyzer.usdPerKgDay, flexible: true } };
  }

  const CONTROLS = Object.freeze([
    { key: 'currentDensityAPerCm2', label: 'Current density', unit: 'A/cm²', min: 0.1, max: 3, step: 0.05, hint: 'higher = smaller stack, higher voltage' },
    { key: 'plateThicknessMm', label: 'Bipolar plate thickness', unit: 'mm', min: 0.2, max: 3, step: 0.1 },
    { key: 'electrodeNiKgPerM2', label: 'Ni per electrode', unit: 'kg/m²', min: 0.05, max: 1.5, step: 0.05 },
    { key: 'cellAreaM2', label: 'Cell active area', unit: 'm²', min: 0.1, max: 4, step: 0.1 },
    { key: 'installFactor', label: 'Install factor', unit: '×', min: 1, max: 2, step: 0.05, hint: 'site works, controls, commissioning' },
    { key: 'separator', label: 'Separator', options: Object.entries(DEFAULTS.separators).map(([k, v]) => [k, `${v.label} — $${v.usdPerM2}/m²`]) },
    { key: 'coupling', label: 'Power coupling', options: Object.entries(DEFAULTS.couplings).map(([k, v]) => [k, `${v.label} — $${v.usdPerKW}/kW, ${Math.round(v.loss * 100)}% loss`]) },
    { key: 'pressure', label: 'Pressure', options: [['atmospheric', 'Atmospheric (lean BoP; compress later if needed)'], ['pressurized', '~30 bar (heavier BoP)']] },
  ]);

  return {
    id: 'electrolyzer',
    name: 'Solar-matched electrolyzer',
    summary: 'Alkaline stack and balance of plant built for 0 → 100% → 0 every sunny day, wired straight to PV.',
    units: ['electrolyzer'],
    product: 'hydrogen',
    RECIPE,
    DEFAULTS,
    PRESETS,
    CONTROLS,
    cellVoltage,
    design,
    lcoh,
    optimizeCurrentDensity,
    simulatorOverride,
  };
});
