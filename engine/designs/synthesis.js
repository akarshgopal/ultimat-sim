// Sun-following catalytic synthesis reactors: methanol (CO₂ + 3H₂ ⇌ CH₃OH + H₂O), Sabatier
// methanation (CO₂ + 4H₂ → CH₄ + 2H₂O) and methanol-to-olefins (2CH₃OH → C₂H₄ + 2H₂O).
//
// Question: the recipes treat these loops as baseload. On solar alone that means firming their
// power with batteries through the night and buffering H₂ (the electrolyzer follows the sun) at
// ~$600/kg of compressed-gas storage. A reactor designed for wide turndown and a daily hot-standby
// cycle can follow the sun instead (`flexible: true`): no batteries, no H₂ buffer, but ~3× nameplate,
// so its installed $ per kg/day must be low. This module builds each reactor up from screening
// physics and a bill of materials:
//   equilibrium (Graaf constants for methanol, van't Hoff for Sabatier) × approach-to-equilibrium
//   (space velocity) → single-pass conversion → recycle ratio → recycle compressor kWh, heat
//   exchangers, catalyst volume → tubes (Barlow wall thickness at pressure, tube count also set by
//   heat-removal area) → shells, tubesheets → compressors (multistage, intercooled) → distillation
//   (methanol) / cold section (MTO) → hot-standby insulation and heat accumulator → catalyst charge and
//   replacements → installed $ per kg/day (24 h nameplate), kWh per kg, idiot index.
// Every assumption is in DEFAULTS with a short source or note. Commodity prices come from
// data/bom.js; the few catalyst raw materials it does not list are in DEFAULTS.extraCommodities.
// Screening grade, not bankable.
(function exposeSynthesisDesign(root, factory) {
  const api = factory(typeof require === 'function' ? require('../../data/bom.js') : root.FoundryBom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.FoundryDesigns = root.FoundryDesigns || {};
    root.FoundryDesigns[api.id] = api;
  }
})(globalThis, Bom => {
  const R = 8.314462618; // J/(mol·K)
  const NM3_PER_MOL = 0.022414;
  const M = Object.freeze({ CO2: 44.01, H2: 2.016, CH3OH: 32.042, H2O: 18.015, CH4: 16.043, C2H4: 28.054, CO: 28.01 }); // g/mol
  const STEEL_DENSITY = 7850;
  const SCALE_EXPONENT = 0.85; // engine/company.js DEFAULTS.scale (to compare like for like)
  const SCALE_FLOOR = 0.4;

  // Recipe basis per kg/day of each unit's own product, from data/pathways.js flowsheets.
  //   methanol: green-mto node 480 $/(kg C₂H₄/day) ÷ 2.284 kg CH₃OH per kg C₂H₄; 1.14 kWh/kg C₂H₄ ÷ 2.284.
  //     (The 'methanol' pathway's node is $4,000 per kg/day at its 5 kg/day demo reference — the same
  //     unit at a scale 450× smaller; the factor computed here is applied to both.)
  //   sabatier: 'sabatier' / 'coastal' pathways, $6,000 per kg CH₄/day at 5 kg/day, 1 kWh/kg.
  //   mto: 'mto' / 'green-mto' pathways, $192 per kg C₂H₄/day at 1,000 kg/day, 4 kWh/kg (total-energy proxy).
  const RECIPE = Object.freeze({
    methanol: Object.freeze({ usdPerKgDay: 480 / 2.284364, kWhPerKg: 1.14 / 2.284364, refKgPerDay: 1000 * 2.284364, pathwayId: 'green-mto', alsoIn: ['methanol'] }),
    sabatier: Object.freeze({ usdPerKgDay: 300, kWhPerKg: 1, refKgPerDay: 1000, pathwayId: 'sabatier', alsoIn: ['coastal'] }), // pack $300/(kg CH₄/day) once the demo case is sized to 1 t/day
    mto: Object.freeze({ usdPerKgDay: 192.15, kWhPerKg: 4, refKgPerDay: 1000, pathwayId: 'mto', alsoIn: ['green-mto'] }),
  });
  const PRODUCT = Object.freeze({ methanol: 'methanol', sabatier: 'methane', mto: 'ethylene' });
  const PRODUCT_M = Object.freeze({ methanol: M.CH3OH, sabatier: M.CH4, mto: M.C2H4 });

  const DEFAULTS = Object.freeze({
    reactor: 'methanol', // which unit design() describes: 'methanol' | 'sabatier' | 'mto'
    operation: 'sun-following', // 'sun-following' (flexible: true) | 'baseload' (flexible: false, firmed by the simulator)
    // Plant scale (kg product/day nameplate). null → 100 × the recipe reference, i.e. the plant size the
    // abundance scoreboard evaluates (sizeMultiple 100), so capexFactor compares like with like.
    scaleKgPerDay: null,
    // Top-level knobs for the selected reactor (null → that reactor's block below).
    pressureBar: null,
    temperatureC: null,
    ghsvPerH: null,
    h2SupplyBar: 1.05, // lean electrolyzer is atmospheric (engine/designs/electrolyzer.js); a pressurized stack gives ~30 bar
    co2SupplyBar: 1.05, // DAC desorbs at ~1 bar; purchased CO₂ arrives as ~20 bar liquid
    offHoursPerDay: 16, // sun-following: hours/day the loop is not producing (≈ 24 − full-load hours; ~7–8 FLH in the sunbelt)
    discountRate: 0.08, // engine/company.js finance.discountRate — for capitalizing catalyst replacements
    lifeYears: 25,
    steelAllowableMPa: 118, // carbon steel (SA-516-70 / SA-106B) ≤ 300 °C, ASME VIII-1 order of magnitude
    stainlessAllowableMPa: 100, // 304/316 at 400–600 °C, ASME II-D order
    // Catalyst raw materials not in data/bom.js ($/kg). Screening 2024 prices.
    extraCommodities: Object.freeze({
      zinc: 2.8, // LME zinc 2024 average ≈ $2,780/t (World Bank Pink Sheet order)
      alumina: 0.45, // smelter-grade alumina 2024 ≈ $400–500/t FOB Australia
      ruthenium: 15000, // ≈ $465/oz 2024 (Johnson Matthey base price order)
      'sapo-raw': 2.5, // SAPO-34 raw mix: alumina, phosphoric acid, silica sol, organic template; screening
    }),
    compressor: Object.freeze({
      isentropicEfficiency: 0.75, // reciprocating / integrally geared, incl. ~5% motor losses
      maxStageRatio: 3, // per-stage pressure ratio limit (discharge temperature)
      suctionC: 40, // intercooled to 40 °C
      steelKgPerKWAt1MW: 35, // recip package (frame, cylinders, coolers, skid) ≈ 30–40 t/MW
      sizeExponent: -0.25, // smaller machines are heavier per kW
      motorCopperKgPerKW: 0.6,
      motorSteelKgPerKW: 3, // electrical steel + frame
      // Package mass per kW by service: H₂ needs slow reciprocating machines; CO₂, hydrocarbons and
      // vapour can use screw/centrifugal machines at roughly half the mass and cost per kW (screening).
      gasFactor: Object.freeze({ H2: 1, CO2: 0.6, hydrocarbon: 0.5, vapour: 0.5 }),
    }),
    vfdUsdPerKW: 45, // variable-speed drive (bought-in); needed for 20–100% compressor turndown
    hx: Object.freeze({ gasGasU: 250, condenserU: 400, approachK: 20, condenserLmtdK: 15 }), // W/m²K, K
    insulation: Object.freeze({ conductivityWPerMK: 0.05, kgPerM3: 100, pipingAreaFactor: 2.5 }), // mineral wool; piping/valves add ~2.5× the shell area
    ambientC: 20,
    labourUsdPerHour: 40,
    // Plant fabrication & integration knobs (overridden per preset).
    manufacturing: Object.freeze({
      reactor: 3, // tube bundles, shells, tubesheets — finished $/kg ÷ steel $/kg
      vessels: 3,
      hx: 3,
      column: 3,
      compressor: 15, // machined, low-volume; today's packages are ~80× their steel (DOE H2A compressor curve)
      motor: 3,
      catalyst: 3, // finished catalyst $/kg ÷ raw metals/oxides $/kg (commercial Cu/ZnO ≈ $15–30/kg)
      insulation: 2,
      civil: 1.5,
    }),
    installFactor: 1.3, // site install, piping, E&I, commissioning on top of equipment (Lang ≈ 3–5 for stick-built)
    pipingSteelFraction: 0.5, // loop piping/valves/structural steel ÷ equipment steel
    concreteKgPerKgSteel: 3,
    fixedUsdPerTrain: 150000, // controls, analyzers, safety system, engineering per train of fixedRefKgPerDay (standardized skid)
    trainHoursPerTrain: 400, // assembly & commissioning hours per train of fixedRefKgPerDay
    fixedRefKgPerDay: 100000,
    fixedScaleExponent: 0.3, // per-train fixed costs ∝ train size^0.3 (instruments and safety barely scale)
    cyclingCatalystLifeFactor: 0.75, // daily start/stop shortens catalyst life (sintering, redox): Phase-1 measurement
    standbyHoldC: 200, // hot-standby temperature at night (above water/methanol dew point; Ni-carbonyl safe)
    nightDropAllowedK: 40, // how far the loop may cool overnight before it needs stored heat
    turndownModules: 4, // parallel modules switched in/out with the sun
    h2BufferUsdPerKg: 600, // engine/utilization.js bufferUsdPerKg.H2 — for the small morning/evening turndown buffer

    // ---------------------------------------------------------------- per-reactor blocks
    methanol: Object.freeze({
      pressureBar: 60,
      temperatureC: 250,
      ghsvPerH: 8000, // Cu/ZnO/Al₂O₃ industrial 6,000–10,000 h⁻¹ (inlet, STP)
      approachAtRef: 0.85, // fraction of equilibrium methanol yield reached at ghsvRef, temperatureRef
      ghsvRef: 8000,
      temperatureRefC: 250,
      activationKJ: 60, // apparent activation energy (Cu/ZnO CO₂ hydrogenation 50–70 kJ/mol)
      h2ToCo2: 3,
      purgeCarbonLoss: 0.02, // carbon lost with the inert purge
      loopPressureDropBar: 4, // recycle compressor ΔP
      tubeIdMm: 25,
      tubeLengthM: 6,
      corrosionMm: 0.5,
      minWallMm: 1.5,
      shellMaxDiameterM: 1.5,
      coolant: 'boiling-water', // shell side at saturation pressure of (T − 10 K)
      heatTransferU: 200, // W/m²K bed-to-wall
      coolantDeltaK: 10,
      catalystBulkKgPerM3: 1200,
      catalyst: 'cu-zno', // CuO/ZnO/Al₂O₃ 60/30/10
      catalystLifeYears: 4,
      gasCpJPerMolK: 30,
      // Distillation: crude MeOH/H₂O (~1:1 molar) → AA-grade
      refluxRatio: 1.0,
      columnHeightM: 15,
      columnFFactor: 2.0, // Pa^0.5 vapour load
      columnMinWallMm: 6,
      packingKgPerM3: 200, // stainless structured packing
      reactorHeatRecovery: 0.85, // share of the 250 °C exotherm reused in the reboiler (steam)
      reboilerCop: 4, // 1 = electric boiler; >1 = MVR heat pump on the overhead vapour (≈ 4–6 for a ~45 K lift)
      moduleKgPerDay: 50000, // max train size (shop-built modules)
      minTurndown: 0.3,
    }),
    sabatier: Object.freeze({
      pressureBar: 10,
      temperatureC: 320, // isothermal outlet of stage 1 (cooled tubular)
      ghsvPerH: 5000, // Ni/Al₂O₃ 3,000–10,000 h⁻¹
      // Approach-to-equilibrium fits per catalyst (screening): Ru is several times more active per
      // volume and works from ~250 °C; Ni needs ≥ 300 °C and must be purged of CO before cooling below
      // ~230 °C (nickel carbonyl).
      kinetics: Object.freeze({
        ni: Object.freeze({ approachAtRef: 0.95, ghsvRef: 5000, temperatureRefC: 320, activationKJ: 80 }),
        ru: Object.freeze({ approachAtRef: 0.97, ghsvRef: 6000, temperatureRefC: 260, activationKJ: 70 }),
      }),
      design: 'cooled', // 'cooled' (isothermal tubular, no recycle) | 'adiabatic' (TREMP-style beds + hot recycle)
      stageOutletC: Object.freeze([320, 260]), // cooled: two isothermal stages with water knock-out between
      adiabaticStageOutletC: Object.freeze([600, 450, 300]),
      adiabaticInletC: 280,
      recycleMaxDeltaK: 320, // adiabatic: first-bed temperature rise limit set by recycle dilution
      loopPressureDropBar: 1.5,
      tubeIdMm: 20,
      tubeLengthM: 3,
      corrosionMm: 0.5,
      minWallMm: 1.2,
      shellMaxDiameterM: 1.2,
      coolant: 'thermal-oil', // ~5 bar shell; boiling water at 300 °C would need an 86 bar shell
      coolantShellBar: 6,
      heatTransferU: 150,
      coolantDeltaK: 30,
      catalystBulkKgPerM3: 1000,
      catalyst: 'ni', // 'ni' (20 wt% Ni/Al₂O₃) | 'ru' (0.5 wt% Ru/Al₂O₃: active from ~250 °C, no carbonyl risk)
      catalystLifeYears: 4,
      ruReclaim: 0.9, // Ru recovered at end of life
      gasCpJPerMolK: 32,
      upgradeKWhPerKg: 0.05, // drying + membrane polish to grid spec
      moduleKgPerDay: 5000,
      minTurndown: 0.2,
    }),
    mto: Object.freeze({
      design: 'fixed-bed', // 'fixed-bed' (MTP-like swing beds, cyclic regeneration) | 'fluidized' (DMTO: continuous regenerator)
      pressureBar: 2,
      temperatureC: 470,
      whsvPerH: 1.0, // kg MeOH/h per kg catalyst (fixed bed ~1; fluidized 2–6)
      inventoryFactor: 2, // beds online + regenerating (fixed) / reactor+regenerator+stripper (fluidized ~2.5)
      vesselSteelKgPerKgCatalyst: 1.5, // low-pressure vessels + internals; fluidized adds cyclones/refractory (~3)
      vesselMaterial: 'steel',
      catalystBulkKgPerM3: 700,
      catalystLifeYears: 2, // fixed-bed SAPO-34/ZSM-5 total life; fluidized: attrition makeup instead
      makeupKgPerTMeoh: 0, // fluidized DMTO ≈ 0.2–0.4 kg/t MeOH
      methanolPerKgEthylene: 2.284364, // recipe stoichiometry (all carbon to ethylene; idealized like the recipe)
      feedHeatKWhPerKg: 1.22, // preheat + vaporize + superheat 2.28 kg MeOH to ~450 °C
      exothermKWhPerKg: 0.29, // 2CH₃OH → C₂H₄ + 2H₂O, ≈ −14.6 kJ/mol MeOH
      heatRecovery: 0.7, // feed/effluent integration
      productGasMolFactor: 1.5, // light ends + C₃+ carried through compression per mol C₂H₄ (screening)
      productCompressionBar: 30,
      refrigerationMJPerKg: 1.2, // demethanizer + C₂ splitter cold duty
      refrigerationCop: 1.6,
      otherUtilitiesKWhPerKg: 0.3, // pumps, cooling fans, regeneration air, flare purge
      separationSteelKgPerKgDay: 0.6, // quench/water strip, columns, cold box, drums (lumped)
      separationStainlessKgPerKgDay: 0.15,
      separationAluminiumKgPerKgDay: 0.05, // brazed aluminium cold box
      moduleKgPerDay: 200000,
      minTurndown: 0.3,
    }),
  });

  // Named starting points. 'today' is what gets built now: a large stick-built baseload train, pressurized
  // H₂ from a pressurized electrolyzer, high Lang factor, catalyst and compressors at today's markups —
  // calibrated to land near the recipe. 'lean' is the sun-following target: small shop-built modules,
  // thin-walled small-bore tubes, hot standby on stored reaction heat, VFD compressors, Ru for Sabatier.
  const PRESETS = Object.freeze({
    today: Object.freeze({
      label: 'Today: stick-built baseload loop (firmed by the simulator)',
      params: Object.freeze({
        operation: 'baseload',
        h2SupplyBar: 30,
        manufacturing: { reactor: 6, vessels: 6, hx: 6, column: 6, compressor: 70, motor: 5, catalyst: 5, insulation: 3, civil: 2.5 },
        installFactor: 2.4,
        pipingSteelFraction: 1.0,
        concreteKgPerKgSteel: 6,
        fixedUsdPerTrain: 2.0e6,
        trainHoursPerTrain: 6000,
        turndownModules: 1,
        methanol: { reboilerCop: 1, tubeIdMm: 38, tubeLengthM: 7, corrosionMm: 1.5, minWallMm: 2.5, shellMaxDiameterM: 5, pressureBar: 75, temperatureC: 250, refluxRatio: 1.5, columnHeightM: 25, reactorHeatRecovery: 0.6, moduleKgPerDay: 3.0e6, minTurndown: 0.5 },
        sabatier: { design: 'adiabatic', pressureBar: 20, catalyst: 'ni', tubeIdMm: 38, corrosionMm: 1.5, minWallMm: 2.5, moduleKgPerDay: 1.0e6, minTurndown: 0.4 },
        mto: { design: 'fluidized', whsvPerH: 3, inventoryFactor: 2.5, vesselSteelKgPerKgCatalyst: 3, catalystLifeYears: 25, makeupKgPerTMeoh: 0.3, heatRecovery: 0.45, refrigerationCop: 1.2, otherUtilitiesKWhPerKg: 3.0, separationSteelKgPerKgDay: 1.0, separationStainlessKgPerKgDay: 0.25, separationAluminiumKgPerKgDay: 0.08, moduleKgPerDay: 2.0e6, minTurndown: 0.6 },
      }),
    }),
    lean: Object.freeze({
      label: 'Lean sun-following: small isothermal modules, hot standby, wide turndown',
      params: Object.freeze({
        operation: 'sun-following',
        // Ru from ~240 °C; 5 bar: conversion stays > 99.5% and only the CH₄ product (1 mol, not 5) is compressed downstream.
        sabatier: { catalyst: 'ru', pressureBar: 5, temperatureC: 280, stageOutletC: [280, 240], ghsvPerH: 6000 },
      }),
    }),
  });

  const CONTROLS = Object.freeze([
    { key: 'reactor', label: 'Reactor', options: [['methanol', 'Methanol (Cu/ZnO, boiling-water tubular)'], ['sabatier', 'Sabatier methanation (Ni / Ru)'], ['mto', 'Methanol-to-olefins']] },
    { key: 'operation', label: 'Operation', options: [['sun-following', 'Sun-following (flexible, hot standby at night)'], ['baseload', 'Baseload (firmed by batteries + H₂ buffer)']] },
    { key: 'pressureBar', label: 'Synthesis pressure', unit: 'bar', min: 2, max: 100, step: 1, hint: 'higher → more conversion per pass, less recycle, more feed compression and wall steel' },
    { key: 'temperatureC', label: 'Reactor temperature', unit: '°C', min: 200, max: 500, step: 5, hint: 'kinetics vs equilibrium (exothermic: cooler favours products)' },
    { key: 'ghsvPerH', label: 'Space velocity (GHSV)', unit: 'h⁻¹', min: 1000, max: 30000, step: 500, hint: 'higher → less catalyst, further from equilibrium' },
    { key: 'h2SupplyBar', label: 'H₂ supply pressure', unit: 'bar', min: 1, max: 40, step: 1, hint: 'atmospheric lean electrolyzer vs ~30 bar pressurized stack' },
    { key: 'offHoursPerDay', label: 'Off hours per day', unit: 'h', min: 0, max: 20, step: 0.5, hint: 'hot standby duration (sun-following)' },
    { key: 'scaleKgPerDay', label: 'Plant scale', unit: 'kg/day', min: 100, max: 5e6, step: 100, hint: 'nameplate product per day' },
  ]);

  // ---------------------------------------------------------------- helpers
  function merge(params = {}) {
    const p = { ...DEFAULTS, ...params };
    for (const key of ['extraCommodities', 'compressor', 'hx', 'insulation', 'manufacturing']) {
      p[key] = { ...DEFAULTS[key], ...(params[key] || {}) };
    }
    for (const unit of ['methanol', 'sabatier', 'mto']) p[unit] = { ...DEFAULTS[unit], ...(params[unit] || {}) };
    return p;
  }

  // Reactor-specific block with the top-level knobs applied (only to the selected reactor).
  function block(p, unit) {
    const b = { ...p[unit] };
    if (p.reactor === unit) {
      for (const k of ['pressureBar', 'temperatureC', 'ghsvPerH']) if (p[k] != null) b[k] = Number(p[k]);
    }
    return b;
  }

  function price(material, p) {
    if (Bom.COMMODITIES[material]) return Bom.COMMODITIES[material].usdPerKg;
    if (p.extraCommodities[material] != null) return p.extraCommodities[material];
    throw new Error(`unknown material: ${material}`);
  }

  function annuityPv(rate, years) { return rate > 0 ? (1 - (1 + rate) ** -years) / rate : years; }

  // Present value of replacing an item every `life` years over the plant life (first charge excluded).
  function replacementPvFactor(life, p) {
    let pv = 0;
    for (let t = life; t < p.lifeYears - 1e-9; t += life) pv += (1 + p.discountRate) ** -t;
    return pv;
  }

  // Saturation pressure of water (bar), Antoine 99–374 °C.
  function waterPsatBar(tC) {
    return (10 ** (8.14019 - 1810.94 / (244.485 + tC))) * 133.322 / 1e5;
  }

  // Barlow thin-wall thickness (m) for internal pressure (bar) and inner diameter (m).
  function wallM(pBar, dM, allowableMPa, corrosionMm, minMm) {
    const P = pBar / 10; // MPa
    const t = (P * dM) / (2 * allowableMPa * 1.0 - 1.2 * P);
    return Math.max(minMm / 1000, t + corrosionMm / 1000);
  }

  // Multistage intercooled compression: J/mol and stages.
  function compressionJPerMol(pIn, pOut, gamma, p) {
    if (!(pOut > pIn * 1.0001)) return { jPerMol: 0, stages: 0 };
    const ratio = pOut / pIn;
    const stages = Math.max(1, Math.ceil(Math.log(ratio) / Math.log(p.compressor.maxStageRatio) - 1e-9));
    const T = 273.15 + p.compressor.suctionC;
    const jPerMol = (stages * gamma / (gamma - 1) * R * T * (ratio ** ((gamma - 1) / (gamma * stages)) - 1)) / p.compressor.isentropicEfficiency;
    return { jPerMol, stages };
  }

  // Compressor package materials per kW shaft at a machine size (kW).
  function compressorKgPerKW(kW, p) {
    const c = p.compressor;
    return c.steelKgPerKWAt1MW * Math.max(kW / 1000, 0.01) ** c.sizeExponent;
  }

  // ---------------------------------------------------------------- equilibrium
  // Methanol synthesis from CO₂ (Graaf et al. 1986 equilibrium constants, ideal gas):
  //   K1: CO + 2H₂ ⇌ CH₃OH          log10 K1 = 5139/T − 12.621   [bar⁻²]
  //   K2: CO₂ + H₂ ⇌ CO + H₂O        log10 K2 = −2073/T + 2.029
  //   K3 = K1·K2: CO₂ + 3H₂ ⇌ CH₃OH + H₂O
  // Feed per mol CO₂: h mol H₂. Extents ξ1 (methanol), ξ2 (RWGS). Nested bisection.
  function methanolEquilibrium(tC, pBar, h2ToCo2 = 3) {
    const T = tC + 273.15;
    const K1 = 10 ** (5139 / T - 12.621);
    const K2 = 10 ** (-2073 / T + 2.029);
    const K3 = K1 * K2;
    const h = h2ToCo2;
    const state = (x1, x2) => {
      const co2 = 1 - x1 - x2;
      const h2 = h - 3 * x1 - x2;
      const meoh = x1;
      const h2o = x1 + x2;
      const co = x2;
      const N = 1 + h - 2 * x1;
      return { co2, h2, meoh, h2o, co, N };
    };
    const solveX2 = x1 => {
      let lo = 0;
      let hi = Math.min(1 - x1, h - 3 * x1) * (1 - 1e-12);
      if (!(hi > 0)) return 0;
      for (let i = 0; i < 100; i += 1) {
        const mid = (lo + hi) / 2;
        const s = state(x1, mid);
        const f = Math.log(Math.max(s.co, 1e-300) * s.h2o) - Math.log(s.co2 * s.h2) - Math.log(K2);
        if (f > 0) hi = mid; else lo = mid;
      }
      return (lo + hi) / 2;
    };
    let lo = 0;
    let hi = Math.min(1, h / 3) * (1 - 1e-9);
    for (let i = 0; i < 100; i += 1) {
      const mid = (lo + hi) / 2;
      const x2 = solveX2(mid);
      const s = state(mid, x2);
      const f = Math.log(Math.max(s.meoh, 1e-300) * s.h2o * s.N ** 2) - Math.log(Math.max(s.co2, 1e-300) * Math.max(s.h2, 1e-300) ** 3 * pBar ** 2) - Math.log(K3);
      if (f > 0) hi = mid; else lo = mid;
    }
    const x1 = (lo + hi) / 2;
    const x2 = solveX2(x1);
    return { methanolYield: x1, coYield: x2, co2Conversion: x1 + x2, selectivity: x1 / Math.max(x1 + x2, 1e-12), K3, K2 };
  }

  // Sabatier CO₂ + 4H₂ ⇌ CH₄ + 2H₂O, van't Hoff with constant ΔH° = −165 kJ/mol, ΔG°298 = −113.5 kJ/mol.
  const SAB_DH = -165000;
  const SAB_DS = (-165000 + 113500) / 298.15;
  function sabatierK(tC) {
    const T = tC + 273.15;
    return Math.exp(-(SAB_DH - T * SAB_DS) / (R * T)); // bar⁻²
  }
  // Equilibrium extent from an inlet {co2, h2, ch4, h2o, inert} (mol) at T, P.
  function sabatierEquilibrium(inlet, tC, pBar) {
    const K = sabatierK(tC);
    const { co2, h2, ch4 = 0, h2o = 0, inert = 0 } = inlet;
    const N0 = co2 + h2 + ch4 + h2o + inert;
    let lo = 0;
    let hi = Math.min(co2, h2 / 4) * (1 - 1e-12);
    for (let i = 0; i < 120; i += 1) {
      const x = (lo + hi) / 2;
      const N = N0 - 2 * x;
      const f = Math.log(Math.max(ch4 + x, 1e-300) * (h2o + 2 * x) ** 2 * N ** 2)
        - Math.log((co2 - x) * (h2 - 4 * x) ** 4 * pBar ** 2) - Math.log(K);
      if (f > 0) hi = x; else lo = x;
    }
    const x = (lo + hi) / 2;
    return { extent: x, conversion: x / co2, K };
  }

  // Approach to equilibrium at a space velocity and temperature: 1 − exp(−k/GHSV), k fitted to the
  // reference point and scaled by Arrhenius.
  function approach(b, ghsv, tC) {
    const kRef = -b.ghsvRef * Math.log(1 - Math.min(b.approachAtRef, 0.999999));
    const k = kRef * Math.exp((-b.activationKJ * 1000 / R) * (1 / (tC + 273.15) - 1 / (b.temperatureRefC + 273.15)));
    return 1 - Math.exp(-k / ghsv);
  }

  // ---------------------------------------------------------------- shared reactor hardware
  // Cooled multi-tubular reactor: catalyst in tubes, coolant in shell. Tube length/count set by the
  // larger of catalyst volume and heat-removal area. Returns kg per plant and geometry.
  function tubularReactor({ vCatM3, heatW, pBar, b, p, shellBar }) {
    const d = b.tubeIdMm / 1000;
    const t = wallM(pBar, d, p.steelAllowableMPa, b.corrosionMm, b.minWallMm);
    const areaReq = heatW / (b.heatTransferU * b.coolantDeltaK);
    const vFromArea = areaReq * d / 4; // tube volume whose inner wall gives that area
    const vTubes = Math.max(vCatM3, vFromArea);
    const nTubes = Math.max(1, Math.ceil(vTubes / (Math.PI / 4 * d * d * b.tubeLengthM)));
    const tubeKg = nTubes * b.tubeLengthM * Math.PI * (d + t) * t * STEEL_DENSITY;
    const pitch = 1.3 * (d + 2 * t);
    const tubesPerShellMax = Math.max(1, Math.floor((Math.PI / 4 * b.shellMaxDiameterM ** 2) / (0.866 * pitch ** 2 * 1.1)));
    const shells = Math.ceil(nTubes / tubesPerShellMax);
    const tubesPerShell = nTubes / shells;
    const D = Math.sqrt((tubesPerShell * 0.866 * pitch ** 2 * 1.1) / (Math.PI / 4));
    const shellT = wallM(shellBar, D, p.steelAllowableMPa, 1.5, 6);
    const shellKg = shells * (Math.PI * D * (b.tubeLengthM + 0.5 * D) * shellT + 2 * Math.PI / 4 * D * D * shellT * 1.2) * STEEL_DENSITY;
    // Tubesheets (TEMA order, F ≈ 0.5): T = 0.25·D·√(ΔP/S), 40% drilled out.
    const dP = Math.max(pBar, shellBar) / 10;
    const tsT = Math.max(0.025, 0.25 * D * Math.sqrt(dP / p.steelAllowableMPa));
    const tubesheetKg = shells * 2 * (Math.PI / 4) * D * D * tsT * 0.6 * STEEL_DENSITY;
    const externalM2 = shells * Math.PI * D * (b.tubeLengthM + D);
    return {
      kind: 'cooled-tubular', nTubes, shells, shellDiameterM: D, wallMm: t * 1000, tubesheetMm: tsT * 1000,
      vCatM3, vTubesM3: vTubes, heatLimited: vFromArea > vCatM3, areaM2: nTubes * Math.PI * d * b.tubeLengthM, areaReqM2: areaReq,
      tubeKg, shellKg, tubesheetKg, steelKg: tubeKg + shellKg + tubesheetKg, externalM2,
      coolantKg: shells * (Math.PI / 4 * D * D * b.tubeLengthM - nTubes / shells * Math.PI / 4 * (d + 2 * t) ** 2 * b.tubeLengthM) * 800,
    };
  }

  // Simple pressure vessel holding a volume (L/D = 3).
  function vessel(volM3, pBar, allowableMPa, minMm = 6) {
    const D = Math.cbrt((4 * volM3) / (3 * Math.PI));
    const L = 3 * D;
    const t = wallM(Math.max(pBar, 1), D, allowableMPa, 1.5, minMm);
    const kg = (Math.PI * D * L * t + 2 * Math.PI / 4 * D * D * t * 1.2) * STEEL_DENSITY;
    return { D, L, t, kg, externalM2: Math.PI * D * L + Math.PI / 2 * D * D };
  }

  // Fraction of a sun-following day's energy lost below the minimum load, with N modules each able to
  // turn down to minTurndown. Load = min(1, PV/clip) on a half-sine day clipped at 75% of peak.
  function turndownLoss(minTurndown, modules) {
    const floor = minTurndown / Math.max(1, modules);
    let total = 0;
    let lost = 0;
    for (let i = 0; i < 1000; i += 1) {
      const load = Math.min(1, Math.sin(Math.PI * (i + 0.5) / 1000) / 0.75);
      total += load;
      if (load < floor) lost += load;
    }
    return lost / total;
  }

  // ---------------------------------------------------------------- reactor models
  // Each returns per-plant quantities at scale S (kg product/day): flows, energy (kWh/kg), and
  // equipment lists the BOM turns into $.
  function methanolModel(p, S) {
    const b = block(p, 'methanol');
    const P = b.pressureBar;
    const T = b.temperatureC;
    const eq = methanolEquilibrium(T, P, b.h2ToCo2);
    const app = approach(b, b.ghsvPerH, T);
    const passYield = eq.methanolYield * app; // mol MeOH per mol CO₂ entering the reactor
    const molPerS = (S * 1000) / M.CH3OH / 86400 / (1 - b.purgeCarbonLoss); // carbon in = product / (1 − purge)
    const freshMol = molPerS * (1 + b.h2ToCo2);
    const inletMol = freshMol / passYield; // all fresh carbon passes 1/Y times
    const recycleRatio = inletMol / freshMol - 1;
    const inletNm3h = inletMol * 3600 * NM3_PER_MOL;
    const vCat = inletNm3h / b.ghsvPerH;
    const heatW = molPerS * (1 - b.purgeCarbonLoss) * 49500; // −ΔH, kJ/mol → W
    const coolantT = T - b.coolantDeltaK;
    const shellBar = waterPsatBar(coolantT);
    const reactor = tubularReactor({ vCatM3: vCat, heatW, pBar: P, b, p, shellBar });
    // Compression: fresh H₂ and CO₂ to loop pressure; recycle across the loop ΔP.
    const h2 = compressionJPerMol(p.h2SupplyBar, P, 1.41, p);
    const co2 = compressionJPerMol(p.co2SupplyBar, P, 1.29, p);
    const rec = compressionJPerMol(P - b.loopPressureDropBar, P, 1.38, p);
    const h2KW = molPerS * b.h2ToCo2 * h2.jPerMol / 1000;
    const co2KW = molPerS * co2.jPerMol / 1000;
    const recKW = inletMol * (recycleRatio / (1 + recycleRatio)) * rec.jPerMol / 1000;
    // Heat exchangers: feed/effluent interchanger and condenser.
    const cp = b.gasCpJPerMolK;
    const interchangerW = inletMol * cp * (T - 40 - p.hx.approachK);
    const condenserW = inletMol * cp * (p.hx.approachK + 20) + molPerS * (35300 + 40700);
    const hxM2 = interchangerW / (p.hx.gasGasU * p.hx.approachK) + condenserW / (p.hx.condenserU * p.hx.condenserLmtdK);
    // Distillation: vapour = (R+1)·D; reboiler at λ_MeOH.
    const prodMol = molPerS * (1 - b.purgeCarbonLoss);
    const reboilerW = (b.refluxRatio + 1) * prodMol * 35300 * 1.1; // +10% sensible/losses
    const vaporMol = (b.refluxRatio + 1) * prodMol;
    const rhoV = 101325 * 0.032 / (R * 338);
    const vel = b.columnFFactor / Math.sqrt(rhoV);
    const colArea = (vaporMol * R * 338 / 101325) / vel;
    const colD = Math.sqrt(4 * colArea / Math.PI);
    const colT = Math.max(b.columnMinWallMm / 1000, 0.002 + colD * 0.002);
    const columnKg = Math.PI * colD * b.columnHeightM * colT * STEEL_DENSITY * 1.2;
    const packingKg = colArea * b.columnHeightM * 0.7 * b.packingKgPerM3;
    const distHxM2 = 2 * reboilerW / (800 * 15);
    const netHeatW = Math.max(0, reboilerW - b.reactorHeatRecovery * heatW);
    // Separator drums (HP flash, crude tank ~2 h): small vessels.
    const flash = vessel(Math.max(0.05, inletMol * R * 313 / (P * 1e5) * 60), P, p.steelAllowableMPa);
    const kgPerS = S / 86400;
    const kWh = (W => W / 1000 / (kgPerS * 3600));
    const energy = {
      h2Compression: kWh(h2KW * 1000),
      co2Compression: kWh(co2KW * 1000),
      recycle: kWh(recKW * 1000),
      distillationHeat: kWh(netHeatW / b.reboilerCop),
      pumpsAndFans: 0.02,
    };
    return {
      unit: 'methanol', b, S, pressureBar: P, temperatureC: T, eq, approach: app, passYield, recycleRatio, vCatM3: vCat,
      catalystKg: vCat * b.catalystBulkKgPerM3, reactor, heatW, shellBar,
      compressors: [
        { name: 'H₂ feed compressor', kW: h2KW, stages: h2.stages, gas: 'H2' },
        { name: 'CO₂ feed compressor', kW: co2KW, stages: co2.stages, gas: 'CO2' },
        { name: 'Recycle compressor', kW: recKW, stages: rec.stages, gas: 'H2' },
        ...(b.reboilerCop > 1 && netHeatW > 0 ? [{ name: 'MVR vapour compressor', kW: netHeatW / b.reboilerCop / 1000, stages: 1, gas: 'vapour' }] : []),
      ],
      hxM2: hxM2 + distHxM2,
      vessels: [{ name: 'Flash drums', kg: flash.kg, externalM2: flash.externalM2, material: 'steel' }],
      column: { kg: columnKg, packingKg, diameterM: colD },
      energy,
      exothermKWhPerKg: kWh(heatW),
      minTurndown: b.minTurndown,
      moduleKgPerDay: b.moduleKgPerDay,
    };
  }

  function sabatierModel(p, S) {
    const b = block(p, 'sabatier');
    const P = b.pressureBar;
    const molPerS = (S * 1000) / M.CH4 / 86400; // CH₄ out ≈ CO₂ in (≥ 99% after polish/recycle)
    const heatW = molPerS * -SAB_DH;
    const cp = b.gasCpJPerMolK;
    // Stage-by-stage equilibrium with water knock-out between stages.
    let gas = { co2: molPerS, h2: 4 * molPerS, ch4: 0, h2o: 0, inert: 0 };
    const stageTemps = b.design === 'adiabatic' ? b.adiabaticStageOutletC : (p.reactor === 'sabatier' && p.temperatureC != null ? [b.temperatureC, ...b.stageOutletC.slice(1)] : b.stageOutletC);
    let recycleRatio = 0;
    if (b.design === 'adiabatic') {
      // Full conversion would heat the stoichiometric feed by ΔH/(5·cp); recycle dilutes it to recycleMaxDeltaK.
      const fullRise = -SAB_DH / (5 * cp);
      recycleRatio = Math.max(0, fullRise / b.recycleMaxDeltaK - 1);
    }
    let vCat = 0;
    const stages = [];
    for (const [i, tC] of stageTemps.entries()) {
      const inletTotal = gas.co2 + gas.h2 + gas.ch4 + gas.h2o + gas.inert;
      const flowMol = inletTotal * (i === 0 ? 1 + recycleRatio : 1);
      const ghsv = b.ghsvPerH;
      const vStage = (flowMol * 3600 * NM3_PER_MOL) / ghsv;
      vCat += vStage;
      const eq = sabatierEquilibrium(gas, tC, P);
      const a = approach({ ...b, ...(b.kinetics[b.catalyst] || b.kinetics.ni) }, ghsv, tC);
      const x = eq.extent * a;
      gas = { co2: gas.co2 - x, h2: gas.h2 - 4 * x, ch4: gas.ch4 + x, h2o: 0, inert: gas.inert }; // knock out water
      stages.push({ tC, conversion: (molPerS - gas.co2) / molPerS, vCatM3: vStage, eqConversion: eq.conversion });
    }
    const conversion = (molPerS - gas.co2) / molPerS;
    const dry = gas.co2 + gas.h2 + gas.ch4;
    const ch4Purity = gas.ch4 / dry;
    let reactor;
    const shellBar = b.coolant === 'thermal-oil' ? b.coolantShellBar : waterPsatBar(b.temperatureC - b.coolantDeltaK);
    if (b.design === 'adiabatic') {
      // Beds in vessels (hot stage in stainless), waste-heat boilers between beds.
      const v1 = vessel(stages[0].vCatM3 * 1.3, P, p.stainlessAllowableMPa, 8);
      const rest = vessel(stages.slice(1).reduce((s, x) => s + x.vCatM3, 0) * 1.3, P, p.steelAllowableMPa, 8);
      reactor = {
        kind: 'adiabatic', stainlessKg: v1.kg, steelKg: rest.kg * Math.max(1, stages.length - 1) ** (1 / 3), externalM2: v1.externalM2 + rest.externalM2,
        heatLimited: false, nTubes: 0, shells: stages.length, coolantKg: 0,
      };
    } else {
      reactor = tubularReactor({ vCatM3: vCat, heatW, pBar: P, b, p, shellBar });
    }
    const h2 = compressionJPerMol(p.h2SupplyBar, P, 1.41, p);
    const co2 = compressionJPerMol(p.co2SupplyBar, P, 1.29, p);
    const rec = compressionJPerMol(P - b.loopPressureDropBar, P, 1.35, p);
    const h2KW = 4 * molPerS * h2.jPerMol / 1000;
    const co2KW = molPerS * co2.jPerMol / 1000;
    const recKW = recycleRatio * 5 * molPerS * rec.jPerMol / 1000;
    // Interstage coolers/condensers (water knock-out) and waste-heat recovery.
    const condW = molPerS * 2 * 40700 + 5 * molPerS * cp * 200;
    const hxW = (b.design === 'adiabatic' ? heatW : 0) + 5 * molPerS * (1 + recycleRatio) * cp * 150;
    const hxM2 = condW / (p.hx.condenserU * p.hx.condenserLmtdK) + hxW / (p.hx.gasGasU * 40);
    const flash = vessel(Math.max(0.05, 5 * molPerS * R * 313 / (P * 1e5) * 60), P, p.steelAllowableMPa);
    const kgPerS = S / 86400;
    const kWh = W => W / 1000 / (kgPerS * 3600);
    return {
      unit: 'sabatier', b, S, pressureBar: P, temperatureC: stageTemps[0], stages, conversion, ch4Purity, recycleRatio, vCatM3: vCat,
      catalystKg: vCat * b.catalystBulkKgPerM3, reactor, heatW, shellBar,
      compressors: [
        { name: 'H₂ feed compressor', kW: h2KW, stages: h2.stages, gas: 'H2' },
        { name: 'CO₂ feed compressor', kW: co2KW, stages: co2.stages, gas: 'CO2' },
        ...(recKW > 0 ? [{ name: 'Hot recycle compressor', kW: recKW, stages: rec.stages, gas: 'H2' }] : []),
      ],
      hxM2,
      vessels: [{ name: 'Knock-out drums', kg: flash.kg * stageTemps.length, externalM2: flash.externalM2 * stageTemps.length, material: 'steel' }],
      column: null,
      energy: {
        h2Compression: kWh(h2KW * 1000),
        co2Compression: kWh(co2KW * 1000),
        recycle: kWh(recKW * 1000),
        upgrade: b.upgradeKWhPerKg,
        pumpsAndFans: 0.03,
      },
      exothermKWhPerKg: kWh(heatW),
      minTurndown: b.minTurndown,
      moduleKgPerDay: b.moduleKgPerDay,
    };
  }

  function mtoModel(p, S) {
    const b = block(p, 'mto');
    const meohKgPerH = S * b.methanolPerKgEthylene / 24;
    const catalystKg = (meohKgPerH / b.whsvPerH) * b.inventoryFactor;
    const vesselKg = catalystKg * b.vesselSteelKgPerKgCatalyst;
    const productMolPerS = (S * 1000 / M.C2H4 / 86400) * b.productGasMolFactor;
    const comp = compressionJPerMol(b.pressureBar - 0.5, b.productCompressionBar, 1.25, p);
    const compKW = productMolPerS * comp.jPerMol / 1000;
    const kgPerS = S / 86400;
    const refrigKWhPerKg = b.refrigerationMJPerKg / 3.6 / b.refrigerationCop;
    const refrigKW = refrigKWhPerKg * kgPerS * 3600;
    const netHeat = Math.max(0, b.feedHeatKWhPerKg - b.heatRecovery * (b.feedHeatKWhPerKg + b.exothermKWhPerKg));
    const heatW = netHeat * kgPerS * 3600 * 1000;
    const hxM2 = (b.feedHeatKWhPerKg * kgPerS * 3600 * 1000) / (p.hx.gasGasU * 40) + (b.exothermKWhPerKg + b.feedHeatKWhPerKg) * kgPerS * 3600 * 1000 / (p.hx.condenserU * 20);
    return {
      unit: 'mto', b, S, pressureBar: b.pressureBar, temperatureC: b.temperatureC, catalystKg, vCatM3: catalystKg / b.catalystBulkKgPerM3,
      reactor: { kind: b.design, steelKg: vesselKg, externalM2: vesselKg / STEEL_DENSITY / 0.012, heatLimited: false, coolantKg: 0 },
      heatW: b.exothermKWhPerKg * kgPerS * 3600 * 1000,
      compressors: [
        { name: 'Product gas compressor', kW: compKW, stages: comp.stages, gas: 'hydrocarbon' },
        { name: 'Refrigeration compressor', kW: refrigKW, stages: 2, gas: 'hydrocarbon' },
      ],
      hxM2,
      vessels: [
        { name: 'Separation train: quench, columns, drums', kg: b.separationSteelKgPerKgDay * S, externalM2: b.separationSteelKgPerKgDay * S / STEEL_DENSITY / 0.012 * 0.5, material: 'steel' },
        { name: 'Separation train: alloy service', kg: b.separationStainlessKgPerKgDay * S, externalM2: 0, material: 'stainless-steel' },
        { name: 'Cold box (brazed aluminium)', kg: b.separationAluminiumKgPerKgDay * S, externalM2: 0, material: 'aluminium' },
      ],
      column: null,
      energy: {
        productCompression: compKW / (kgPerS * 3600),
        refrigeration: refrigKWhPerKg,
        feedHeat: netHeat,
        otherUtilities: b.otherUtilitiesKWhPerKg,
      },
      exothermKWhPerKg: b.exothermKWhPerKg,
      minTurndown: b.minTurndown,
      moduleKgPerDay: b.moduleKgPerDay,
      netHeatW: heatW,
    };
  }

  const MODELS = { methanol: methanolModel, sabatier: sabatierModel, mto: mtoModel };

  function catalystMaterialsUsdPerKg(unit, b, p) {
    if (unit === 'methanol') {
      // CuO 60 / ZnO 30 / Al₂O₃ 10 wt% → Cu 0.479, Zn 0.241 kg per kg catalyst.
      return 0.479 * price('copper', p) + 0.241 * price('zinc', p) + 0.10 * price('alumina', p);
    }
    if (unit === 'sabatier') {
      return b.catalyst === 'ru'
        ? 0.005 * price('ruthenium', p) + 0.995 * price('alumina', p)
        : 0.20 * price('nickel', p) + 0.80 * price('alumina', p);
    }
    return price('sapo-raw', p);
  }

  function recipeAt(unit, S) {
    const r = RECIPE[unit];
    const sf = Math.max(SCALE_FLOOR, Math.min(1, (S / r.refKgPerDay) ** (SCALE_EXPONENT - 1)));
    return { usdPerKgDay: r.usdPerKgDay * sf, kWhPerKg: r.kWhPerKg, scaleFactor: sf };
  }

  // ---------------------------------------------------------------- design
  function design(params = {}) {
    const p = merge(params);
    const unit = MODELS[p.reactor] ? p.reactor : 'methanol';
    p.reactor = unit;
    const S = Number(p.scaleKgPerDay) > 0 ? Number(p.scaleKgPerDay) : 100 * RECIPE[unit].refKgPerDay;
    const m = MODELS[unit](p, S);
    const b = m.b;
    const flexible = p.operation !== 'baseload';
    const mf = p.manufacturing;
    // Trains: as many modules as the module size needs, and at least turndownModules when sun-following.
    const trainsEffective = Math.max(Math.ceil(S / m.moduleKgPerDay), flexible ? Math.max(1, p.turndownModules) : 1);
    const trainKgPerDay = S / trainsEffective;
    // Per-train controls/engineering and assembly scale weakly with train size (∝ size^0.3).
    const trainScale = (trainKgPerDay / p.fixedRefKgPerDay) ** p.fixedScaleExponent;

    const parts = [];
    const add = (part, material, kgPlant, manufacturing, note) => {
      const kg = kgPlant / S;
      const usdMaterials = kg * price(material, p);
      parts.push({ part, material, kg, usdMaterials, manufacturing, usd: usdMaterials * manufacturing, note });
    };
    const bought = (part, usdPlant, note) => parts.push({ part, material: null, kg: null, usdMaterials: 0, manufacturing: null, usd: usdPlant / S, note });

    // Reactor
    const r = m.reactor;
    if (r.kind === 'cooled-tubular') {
      add('Reactor tubes', 'steel', r.tubeKg, mf.reactor, `${r.nTubes.toLocaleString('en-US')} × ${b.tubeIdMm} mm × ${b.tubeLengthM} m, ${r.wallMm.toFixed(1)} mm wall @ ${m.pressureBar} bar${r.heatLimited ? ' (sized by heat removal)' : ''}`);
      add('Reactor shells + heads', 'steel', r.shellKg, mf.reactor, `${r.shells} × Ø${r.shellDiameterM.toFixed(2)} m, ${b.coolant} at ${m.shellBar.toFixed(0)} bar`);
      add('Tubesheets', 'steel', r.tubesheetKg, mf.reactor, `${r.tubesheetMm.toFixed(0)} mm`);
    } else if (r.kind === 'adiabatic') {
      add('Hot bed vessel (stainless)', 'stainless-steel', r.stainlessKg, mf.vessels, '≈600 °C first bed');
      add('Downstream bed vessels', 'steel', r.steelKg, mf.vessels, 'beds 2–3');
    } else {
      add(`${b.design === 'fluidized' ? 'Reactor + regenerator' : 'Swing fixed-bed reactors'}`, b.vesselMaterial || 'steel', r.steelKg, mf.vessels, `${b.vesselSteelKgPerKgCatalyst} kg steel per kg catalyst inventory`);
    }
    // Catalyst (first charge)
    const catUsdPerKg = catalystMaterialsUsdPerKg(unit, b, p);
    const catLabel = unit === 'methanol' ? 'Cu/ZnO/Al₂O₃' : unit === 'sabatier' ? (b.catalyst === 'ru' ? '0.5% Ru/Al₂O₃' : '20% Ni/Al₂O₃') : 'SAPO-34';
    const catKgPerKgDay = m.catalystKg / S;
    parts.push({ part: `Catalyst charge (${catLabel})`, material: 'catalyst', kg: catKgPerKgDay, usdMaterials: catKgPerKgDay * catUsdPerKg, manufacturing: mf.catalyst, usd: catKgPerKgDay * catUsdPerKg * mf.catalyst, note: `${m.vCatM3.toFixed(2)} m³ at ${b.ghsvPerH || b.whsvPerH} ${b.ghsvPerH ? 'h⁻¹ GHSV' : 'h⁻¹ WHSV'}` });
    // Compressors
    for (const c of m.compressors) {
      if (!(c.kW > 0)) continue;
      const perTrainKW = c.kW / trainsEffective;
      const kgPerKW = compressorKgPerKW(perTrainKW, p) * (p.compressor.gasFactor[c.gas] ?? 1);
      add(c.name, 'steel', c.kW * kgPerKW, mf.compressor, `${c.kW.toFixed(0)} kW in ${trainsEffective} × ${perTrainKW.toFixed(0)} kW, ${c.stages} stage(s)`);
      add(`${c.name} motor`, 'copper', c.kW * p.compressor.motorCopperKgPerKW, mf.motor, 'windings');
      add(`${c.name} motor iron`, 'steel', c.kW * p.compressor.motorSteelKgPerKW, mf.motor, 'electrical steel + frame');
    }
    const compKW = m.compressors.reduce((s, c) => s + c.kW, 0);
    if (flexible) bought('Variable-speed drives', compKW * p.vfdUsdPerKW, `$${p.vfdUsdPerKW}/kW: 20–100% turndown`);
    // Heat exchangers
    add('Heat exchangers', unit === 'methanol' || unit === 'sabatier' ? 'steel' : 'steel', m.hxM2 * 30, mf.hx, `${(m.hxM2 / S * 1000).toFixed(1)} m² per t/day, ~30 kg/m² shell-and-tube`);
    // Vessels & columns
    for (const v of m.vessels) add(v.name, v.material, v.kg, mf.vessels, '');
    if (m.column) {
      add('Distillation column', 'steel', m.column.kg, mf.column, `Ø${m.column.diameterM.toFixed(2)} m × ${b.columnHeightM} m`);
      add('Structured packing', 'stainless-steel', m.column.packingKg, mf.column, `${b.packingKgPerM3} kg/m³`);
    }
    // Piping, structural steel
    const equipSteel = parts.filter(x => x.material === 'steel' || x.material === 'stainless-steel').reduce((s, x) => s + x.kg * S, 0);
    add('Loop piping, valves, structure', 'steel', equipSteel * p.pipingSteelFraction, mf.vessels, `${p.pipingSteelFraction}× equipment steel`);

    // Hot standby (sun-following): insulation; overnight loss vs thermal mass; heat accumulator
    // charged with the day's exotherm when the drop would exceed the allowance; small H₂ buffer for
    // the minutes below minimum load.
    const holdK = p.standbyHoldC - p.ambientC;
    const extM2 = (r.externalM2 || 0) * p.insulation.pipingAreaFactor + m.vessels.reduce((s, v) => s + (v.externalM2 || 0), 0);
    const insThk = flexible ? 0.15 : 0.08;
    const lossW = extM2 * p.insulation.conductivityWPerMK * holdK / insThk;
    const offH = flexible ? p.offHoursPerDay : 0;
    const standbyKWhPerDay = lossW * offH / 1000;
    const thermalMassKJPerK = ((r.steelKg || 0) + (r.tubeKg ? 0 : 0) + (r.stainlessKg || 0)) * 0.5 + m.catalystKg * 0.9 + (r.coolantKg || 0) * 4.5;
    const coastDropK = thermalMassKJPerK > 0 ? standbyKWhPerDay * 3600 / thermalMassKJPerK : Infinity;
    const storedKWh = Math.max(0, standbyKWhPerDay - p.nightDropAllowedK * thermalMassKJPerK / 3600);
    const dailyExothermKWh = m.exothermKWhPerKg * S;
    add('Insulation', 'refractory', extM2 * insThk * p.insulation.kgPerM3, mf.insulation, `${(insThk * 1000).toFixed(0)} mm mineral wool (refractory price proxy)`);
    let accumulator = null;
    if (flexible && storedKWh > 0) {
      // Pressurized-water accumulator (Ruths): 30 K swing below the hold temperature.
      const m3 = storedKWh * 3600 / (4.5 * 30 * 850);
      accumulator = vessel(m3, waterPsatBar(p.standbyHoldC + 30), p.steelAllowableMPa);
      add('Heat accumulator (stores reaction heat for the night)', 'steel', accumulator.kg, mf.vessels, `${m3.toFixed(1)} m³ hot water`);
    }
    const lostFrac = flexible ? turndownLoss(m.minTurndown, trainsEffective) : 0;
    let h2BufferKg = 0;
    if (flexible && unit !== 'mto') {
      const h2KgPerDay = unit === 'methanol' ? S * 3 * M.H2 / M.CH3OH : S * 4 * M.H2 / M.CH4;
      h2BufferKg = h2KgPerDay * lostFrac;
      bought('Turndown H₂ buffer', h2BufferKg * p.h2BufferUsdPerKg, `${lostFrac > 0 ? (lostFrac * 100).toFixed(2) : '0'}% of daily H₂ arrives below min load (${m.minTurndown} per module)`);
    }
    // Fixed per-train costs and assembly labour.
    bought('Controls, analyzers, safety, engineering', trainsEffective * p.fixedUsdPerTrain * trainScale, `${trainsEffective} train(s) × $${(p.fixedUsdPerTrain * trainScale / 1e3).toFixed(0)}k`);
    bought('Assembly & commissioning labour', trainsEffective * p.trainHoursPerTrain * trainScale * p.labourUsdPerHour, `${(p.trainHoursPerTrain * trainScale).toFixed(0)} h per train`);
    const steelTotal = parts.filter(x => x.material === 'steel' || x.material === 'stainless-steel').reduce((s, x) => s + x.kg, 0);
    add('Foundations', 'concrete', steelTotal * p.concreteKgPerKgSteel * S, mf.civil, `${p.concreteKgPerKgSteel} kg per kg steel`);

    const equipmentUsd = parts.reduce((s, x) => s + x.usd, 0);
    const installUsd = equipmentUsd * (p.installFactor - 1);
    parts.push({ part: `Install (×${p.installFactor})`, material: null, kg: null, usdMaterials: 0, manufacturing: null, usd: installUsd, note: 'piping erection, E&I, civil works, commissioning' });
    const installedUsdPerKgDay = equipmentUsd + installUsd;
    // Catalyst replacements, capitalized (PV over the plant life): the simulator has no catalyst opex line.
    const life = (b.catalystLifeYears || 1) * (flexible ? p.cyclingCatalystLifeFactor : 1);
    const charge = catKgPerKgDay * catUsdPerKg * mf.catalyst;
    const reclaim = unit === 'sabatier' && b.catalyst === 'ru' ? b.ruReclaim * 0.005 * price('ruthenium', p) * catKgPerKgDay : 0;
    let replacementPv = (charge - reclaim) * replacementPvFactor(life, p);
    if (b.makeupKgPerTMeoh > 0) {
      const makeupUsdPerYear = b.makeupKgPerTMeoh * b.methanolPerKgEthylene / 1000 * 365 * catUsdPerKg * mf.catalyst;
      replacementPv += makeupUsdPerYear * annuityPv(p.discountRate, p.lifeYears);
    }
    const materialsUsdPerKgDay = parts.reduce((s, x) => s + x.usdMaterials, 0);
    const kWhParts = m.energy;
    const standbyElecKWhPerKg = flexible && storedKWh > dailyExothermKWh * 0.5 ? (storedKWh - 0.5 * dailyExothermKWh) / S : 0; // exotherm covers it unless tiny
    const kWhPerKg = Object.values(kWhParts).reduce((s, x) => s + x, 0) + standbyElecKWhPerKg;
    const capexUsdPerKgDay = installedUsdPerKgDay + replacementPv; // what the simulator should carry
    const rec = recipeAt(unit, S);
    const capexFactor = capexUsdPerKgDay / rec.usdPerKgDay;
    const energyFactor = kWhPerKg / RECIPE[unit].kWhPerKg;
    const fmt = (x, d = 0) => Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
    const kpis = [
      { label: 'Installed', value: `$${fmt(installedUsdPerKgDay, installedUsdPerKgDay < 100 ? 1 : 0)} per kg/day`, sub: `recipe at this scale $${fmt(rec.usdPerKgDay)}; ×${capexFactor.toFixed(2)} incl. catalyst replacements` },
      { label: 'Energy', value: `${kWhPerKg.toFixed(2)} kWh/kg`, sub: `recipe ${RECIPE[unit].kWhPerKg.toFixed(2)}; compression ${((kWhParts.h2Compression || 0) + (kWhParts.co2Compression || 0) + (kWhParts.productCompression || 0)).toFixed(2)}` },
      { label: 'Idiot index', value: `${(installedUsdPerKgDay / materialsUsdPerKgDay).toFixed(1)}×`, sub: `materials $${fmt(materialsUsdPerKgDay, 1)} per kg/day` },
      unit === 'methanol'
        ? { label: 'Single pass', value: `${(m.passYield * 100).toFixed(1)}% CO₂ → MeOH`, sub: `equilibrium ${(m.eq.methanolYield * 100).toFixed(1)}% at ${m.pressureBar} bar, ${m.temperatureC} °C; recycle ${m.recycleRatio.toFixed(1)}×` }
        : unit === 'sabatier'
          ? { label: 'Conversion', value: `${(m.conversion * 100).toFixed(2)}% CO₂`, sub: `${m.stages.length} stages, CH₄ ${(m.ch4Purity * 100).toFixed(1)}% dry; recycle ${m.recycleRatio.toFixed(1)}×` }
          : { label: 'Catalyst', value: `${fmt(catKgPerKgDay * 1000)} g per kg/day`, sub: `${b.design}, WHSV ${b.whsvPerH} h⁻¹` },
      { label: 'Hot standby', value: flexible ? `${fmt(standbyKWhPerDay / S * 1000, 1)} Wh per kg/day·night` : 'n/a (baseload)', sub: flexible ? `${(standbyKWhPerDay / Math.max(dailyExothermKWh, 1e-9) * 100).toFixed(1)}% of daily exotherm; coasts ${Number.isFinite(coastDropK) ? coastDropK.toFixed(0) : '∞'} K overnight` : 'firmed 24 h by the simulator' },
    ];
    return {
      params: p,
      unit,
      product: PRODUCT[unit],
      basis: `per kg ${unit === 'methanol' ? 'CH₃OH' : unit === 'sabatier' ? 'CH₄' : 'C₂H₄'}/day (24 h nameplate)`,
      scaleKgPerDay: S,
      flexible,
      model: m,
      parts,
      equipmentUsdPerKgDay: equipmentUsd,
      installedUsdPerKgDay,
      catalystReplacementPvUsdPerKgDay: replacementPv,
      capexUsdPerKgDay,
      materialsUsdPerKgDay,
      idiotIndex: installedUsdPerKgDay / materialsUsdPerKgDay,
      kWhPerKg,
      kWhParts: { ...kWhParts, standby: standbyElecKWhPerKg },
      standby: { lossW, kWhPerDay: standbyKWhPerDay, coastDropK, storedKWh, shareOfExotherm: standbyKWhPerDay / Math.max(dailyExothermKWh, 1e-9), accumulatorKg: accumulator?.kg || 0 },
      turndown: { modules: trainsEffective, minTurndown: m.minTurndown, lostShare: lostFrac, h2BufferKg },
      recipe: { ...RECIPE[unit], atScale: rec },
      vsRecipe: { capexFactor, energyFactor, materialsFactor: materialsUsdPerKgDay / rec.usdPerKgDay },
      kpis,
    };
  }

  // Factors for every unit this design covers (the same params; per-reactor blocks pick each one's
  // geometry, the top-level knobs apply to params.reactor only). scaleKgPerDay applies only to the
  // selected reactor; the others are compared at their scoreboard scale.
  function simulatorOverride(params = {}) {
    const out = {};
    for (const unit of ['methanol', 'sabatier', 'mto']) {
      const own = (params.reactor || DEFAULTS.reactor) === unit;
      const d = design({ ...params, reactor: unit, scaleKgPerDay: own ? params.scaleKgPerDay : null,
        ...(own ? {} : { pressureBar: null, temperatureC: null, ghsvPerH: null }) });
      out[unit] = {
        capexFactor: d.vsRecipe.capexFactor,
        energyFactor: d.vsRecipe.energyFactor,
        materialsFactor: d.vsRecipe.materialsFactor, // the idiot-index squeeze caps the unit at its own materials × target
        flexible: d.flexible,
      };
    }
    return out;
  }

  // Sweep a numeric knob of the selected reactor (e.g. pressureBar) for trade curves.
  function sweep(params, key, values) {
    return values.map(v => {
      const d = design({ ...params, [key]: v });
      return {
        [key]: v, installedUsdPerKgDay: d.installedUsdPerKgDay, kWhPerKg: d.kWhPerKg, capexFactor: d.vsRecipe.capexFactor,
        passYield: d.model.passYield, recycleRatio: d.model.recycleRatio, conversion: d.model.conversion,
      };
    });
  }

  return {
    id: 'synthesis',
    name: 'Sun-following catalytic synthesis reactors',
    summary: 'Methanol, Sabatier and MTO reactors built as small isothermal modules with wide turndown and hot standby, so they follow the sun with the electrolyzer instead of being firmed by batteries and an H₂ buffer.',
    units: ['methanol', 'sabatier', 'mto'],
    product: 'methanol',
    products: PRODUCT,
    RECIPE,
    DEFAULTS,
    PRESETS,
    CONTROLS,
    design,
    simulatorOverride,
    sweep,
    recipeAt,
    methanolEquilibrium,
    sabatierEquilibrium,
    sabatierK,
    turndownLoss,
    waterPsatBar,
  };
});
