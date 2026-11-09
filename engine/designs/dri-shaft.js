// Solar-matched hydrogen direct-reduction (DRI/HBI) shaft furnace — first-principles parametric design.
//
// Goal: the cheapest kg of metallic iron (HBI) from iron-oxide pellets and electrolytic H₂, with the
// shaft's own energy coming from PV. Fe₂O₃ + 3 H₂ → 2 Fe + 3 H₂O(g) is mildly endothermic
// (+0.25 kWh per kg Fe); hydrogen carries that heat in as sensible heat, so a H₂ shaft is
// heat-limited, not equilibrium-limited: it needs ~3× the stoichiometric H₂ flow, recycled through a
// water knock-out and re-heated every pass. Three things decide cost:
//   • the gas loop — H₂ flow (from the heat balance and the Fe/FeO equilibrium), re-heat duty, the
//     recuperator that cuts it, the recycle compressor, the knock-out cooler;
//   • the shaft and plant hardware — sized from throughput (t/h per m² of shaft, solids residence
//     time) and priced as a bill of materials at commodity prices (data/bom.js) × manufacturing
//     factors × installation, so the idiot index is explicit part by part;
//   • how it runs on sunlight — baseload (firmed: battery or, better, a heat store) or sun-following
//     (oversized for sun hours, hot standby at night).
//
// Basis: everything is per kg of Fe in DRI (the recipe's product unit: pathways h2-dri and
// green-h2-dri sell "steel" = DRI/HBI, 1 kg per kg Fe). Screening-grade, every assumption in DEFAULTS.
(function exposeDriShaftDesign(root, factory) {
  const api = factory(typeof require === 'function' ? require('../../data/bom.js') : root.FoundryBom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.FoundryDesigns = root.FoundryDesigns || {})[api.id] = api;
})(globalThis, Bom => {
  // ------------------------------------------------------------------ constants
  const R = 8.314462618; // J/(mol·K)
  const M_FE = 55.845e-3; // kg/mol
  const M_FE2O3 = 159.688e-3;
  const M_H2 = 2.01588e-3;
  const M_H2O = 18.01528e-3;
  // ΔH°298 of Fe₂O₃ + 3 H₂ → 2 Fe + 3 H₂O(g): ΔHf(Fe₂O₃) = −824.2, ΔHf(H₂O,g) = −241.826 kJ/mol (NIST).
  const DH_RXN_J_PER_MOL_FE2O3 = 3 * -241826 + 824200; // +98.7 kJ
  const DH_RXN_KJ_PER_KG_FE = DH_RXN_J_PER_MOL_FE2O3 / 2 / M_FE / 1000; // ≈ 884 kJ/kg Fe
  // Thermodynamic minimum energy per kg Fe from 25 °C oxide and H₂ to 25 °C iron and steam: ΔH.
  const THERMO_MIN_KWH_PER_KG = DH_RXN_KJ_PER_KG_FE / 3600; // ≈ 0.246 kWh/kg
  const H2_STOICH_MOL_PER_KG_FE = 1.5 / M_FE; // 26.86 mol (0.0541 kg) per kg Fe
  const H2_LHV_KJ_PER_MOL = 241.826; // LHV = −ΔHf(H₂O,g)
  const LATENT_KJ_PER_MOL_40C = 43.35; // water condensation at ~40 °C

  // Recipe basis (data/pathways.js, h2-dri and green-h2-dri, node 'dri' unit 'hydrogen-dri'):
  // capexUsdPerKgDay 840 (TeaScreening 'hydrogen-dri' 800 $/(kg Fe/day) × Chile 1.05), kWhPerKg 0.7,
  // at the reference size of 1,000 kg Fe/day. The company engine scales process capex by
  // (size / ref)^(0.85 − 1), floored at 0.4 × (engine/company.js DEFAULTS.scale), so the recipe price
  // at the plant size a design is drawn for is RECIPE × that factor; capexFactor compares like with like.
  const RECIPE = Object.freeze({
    'hydrogen-dri': Object.freeze({ usdPerKgDay: 840, kWhPerKg: 0.7, pathwayId: 'green-h2-dri', alsoPathways: Object.freeze(['h2-dri']), refKgPerDay: 1000 }),
  });
  const ENGINE_SCALE = Object.freeze({ exponent: 0.85, floorFactor: 0.4 });

  const DEFAULTS = Object.freeze({
    // ---- plant and shaft
    plantKgFePerDay: 100000, // the plant the abundance scoreboard prices (1,000 kg/day reference × sizeMultiple 100)
    shaftMaxKgFePerDay: 250000, // largest standard shaft: ~2.3 m bore, shop-built and truckable (≤ 4.5 m shell OD)
    productivityTPerHPerM2: 7, // t Fe per h per m² of shaft bore; Midrex world-scale ~7 t DRI/h/m² (7.15 m shaft, ~2.5 Mt/yr)
    residenceHours: 4.5, // solids residence in the reduction zone; H₂ kinetics are faster than CO (pellets ≥ 95% reduced in ~1 h at 900 °C in TGA)
    pelletBulkDensityTPerM3: 2.0, // oxide pellet burden; DRI ~1.7
    pelletDiameterM: 0.012, // 9–16 mm DR pellets
    bedVoidage: 0.4,
    pelletDensityKgPerM3: 3800, // apparent pellet density (porosity ~25%)
    extraHeightM: 4, // top hopper/seal leg and distributor above the reduction zone
    // ---- ore
    pelletFeFraction: 0.675, // DR-grade pellets: 67–68% Fe, SiO₂+Al₂O₃ ≲ 3%; blast-furnace pellets ~65%
    metallization: 0.94, // HBI spec ≥ 92%; remaining Fe as FeO
    // ---- gas loop
    gasInletC: 900, // bustle-gas temperature; above ~1,000 °C pellets cluster/stick. Optimum where the heat balance just binds (see doc)
    gasUtilization: 0.36, // per-pass H₂ utilization target (kinetic margin over the ~0.6 three-stage equilibrium limit); the model raises gas flow if heat or equilibrium needs it
    topGasMinC: 250, // top gas must stay this hot or the upper shaft stops pre-heating/pre-reducing the burden
    dischargeC: 700, // hot discharge to the briquetting press (HBI)
    shaftPressureBarAbs: 2.5, // operating pressure at the top; higher = smaller ducts, more compression of make-up H₂
    loopPressureDropBar: 0.25, // heater, recuperator, scrubber, ducts (bed ΔP added from Ergun)
    knockoutC: 40, // top gas cooled to here; saturated water stays in the recycle
    h2SupplyBarAbs: 1.1, // make-up H₂ arrives from an atmospheric electrolyzer
    compressorEfficiency: 0.72, // isentropic, per stage
    recuperatorEffectiveness: 0.7, // top gas → recycle gas heat exchanger (0 = none)
    recuperatorUWPerM2K: 60, // gas–gas, both sides at a few bar
    preheat: 'electric', // 'electric' | 'h2-combustion'
    preheats: Object.freeze({
      electric: Object.freeze({ label: 'Electric resistive gas heater', efficiency: 0.97 }),
      'h2-combustion': Object.freeze({ label: 'Partial H₂ combustion with electrolyzer O₂ in the bustle gas', efficiency: 0.95 }),
    }),
    h2KWhPerKg: 52, // electricity behind 1 kg of H₂ burned for heat (recipe electrolyzer)
    heaterCoupling: 'dc-direct', // 'dc-direct' | 'scr-transformer'
    couplings: Object.freeze({
      'dc-direct': Object.freeze({ label: 'Heater banks switched straight onto PV strings (staged contactors)', usdPerKW: 12, copperKgPerKW: 0.4 }),
      'scr-transformer': Object.freeze({ label: 'AC transformer + thyristor (SCR) power controller', usdPerKW: 70, copperKgPerKW: 1.0 }),
    }),
    // ---- refractory and shell
    liningM: 0.3, // dense hot face + insulating backup; Midrex shafts ~0.4–0.5 m brick
    liningDensityKgPerM3: 1700, // average of dense (2,300) and insulating (~900) layers
    liningConductivityWPerMK: 0.45, // effective, at mean temperature
    shellOutsideHWPerM2K: 15, // radiation + natural convection from the shell
    shellMinThicknessMm: 10, // structural minimum (burden loads, nozzles)
    shellAllowableStressMPa: 138, // SA-516-70 at shell temperature
    shellAppendagesFrac: 0.35, // cones, nozzles, bustle, stiffeners, skirt on top of the cylinder
    // ---- other hardware (per plant or per shaft, see notes in design())
    chargeDischargeKgPerShaft: 6000, // seal legs, hoppers, distributor, burden feeders (base)
    chargeDischargeKgPerTph: 1500, // … plus per t/h of pellets
    structureFracOfLoad: 0.12, // tower steel ÷ supported mass (shell + lining + burden)
    platformKgPerM: 400, // stairs, platforms, per metre of shaft height
    foundationFracOfLoad: 1.5, // concrete ÷ supported mass
    heaterElementKgPerKW: 0.35, // FeCrAl/NiCr wire at 2–4 W/cm² surface load
    heaterSteelKgPerKW: 2.5, // internally insulated pressure shell
    heaterRefractoryKgPerKW: 1.5,
    recuperatorKgPerM2: 18, // stainless shell-and-tube incl. shell
    coolerSteelKgPerKW: 2.5, // air-cooled condenser (no cooling water in a desert), per kW rejected
    coolerAluminiumKgPerKW: 0.8, // fins
    coolerFanFrac: 0.012, // fan electricity ÷ heat rejected
    compressorKgPerKW: 25, // H₂ recycle compressor + motor frame
    compressorCopperKgPerKW: 1.2,
    ductLengthM: 60, // hot + cold loop ducting per shaft
    hotDuctVelocityMPerS: 30,
    handlingKgBase: 25000, // pellet stockyard reclaim, conveyors, screens, bins (per plant)
    handlingKgPerTph: 2500,
    pressMaxTph: 60, // one hot-briquetting roller press per this many t/h of HBI
    pressKgBase: 15000,
    pressKgPerTph: 900,
    pressAlloyFrac: 0.15, // rolls and pockets in hot-work alloy (priced as stainless)
    electricalCopperKgPerKW: 0.5, // motors, MCC, cabling per kW of motors
    auxKWhPerKg: 0.012, // lighting, N₂, pumps, hydraulics
    handlingKWhPerKgPellet: 0.004, // conveying and screening ~4 kWh/t
    briquettingKWhPerKg: 0.02, // hot briquetting ~20 kWh/t HBI
    auxSteelKgBase: 40000, // N₂ inerting, flare, dust collection, HBI cooling conveyor and stockpile, control room (per plant)
    auxSteelKgPerTph: 2000, // … plus per t/h of HBI
    auxStainlessFrac: 0.1,
    instrumentsUsdPerShaft: 400000, // gas analysers, burden probes, shaft DCS/SIS share (screening)
    instrumentsUsdPerPlant: 700000, // plant DCS/SIS, H₂ detection, substation protection
    engineeringUsdPerPlant: 1500000, // engineering, permits, commissioning of a repeat standard design
    // ---- operation on sunlight
    operation: 'baseload', // 'baseload' (firmed by the engine) | 'sun-following'
    // Baseload night energy: 'heat-store' — PV-charged firebrick regenerator that is also the gas heater
    // (elements sized to take the whole day's heat in sun hours; the store itself is priced by the engine's
    // thermal store, utilization.thermal); 'battery' — the engine's default firming for a baseload unit.
    firming: 'heat-store',
    minTurndown: 0.5, // fraction of nameplate the shaft can hold steadily (burden and gas distribution)
    standbyC: 600, // night-time hot-standby bed temperature (sun-following): below sticking, above restart pinch
    standbyGasFrac: 0.08, // gas circulated during standby ÷ full flow
    sunNameplateFactor: 3.2, // nameplate ÷ 24 h-average for a sun-following unit (engine flexDesign gives ~3–3.5)
    storeDeltaK: 600, // heat store temperature swing (firebrick regenerator)
    // ---- money
    manufacturing: Object.freeze({ // finished part cost ÷ raw-material cost
      vessel: 2.5, refractory: 2.0, mechanical: 3.5, structural: 2.0, civil: 1.5, heater: 3.0,
      recuperator: 3.0, cooler: 2.5, compressor: 5.0, ducts: 2.5, handling: 2.5, press: 4.0, electrical: 1.5, store: 2.0,
    }),
    installFactor: 1.35, // skid/module erection, piping tie-ins, commissioning on top of delivered equipment
  });

  // 'today' is a first-of-a-kind ~100 t/day H₂ shaft built the way DRI plants are built now
  // (field-erected brick-lined shaft, AC heaters, no recuperation, Lang-type installation); it lands
  // near the recipe's 840 $/(kg/day) at the scoreboard plant size. 'lean' is DEFAULTS.
  const PRESETS = Object.freeze({
    today: Object.freeze({
      label: 'Today: first-of-a-kind field-built H₂ shaft, AC heaters, no recuperation',
      params: Object.freeze({
        productivityTPerHPerM2: 5,
        residenceHours: 6,
        extraHeightM: 8,
        liningM: 0.45,
        shellMinThicknessMm: 16,
        shaftPressureBarAbs: 3,
        gasInletC: 950,
        gasUtilization: 0.3,
        topGasMinC: 300,
        recuperatorEffectiveness: 0,
        heaterCoupling: 'scr-transformer',
        chargeDischargeKgPerShaft: 20000,
        chargeDischargeKgPerTph: 3000,
        structureFracOfLoad: 0.25,
        platformKgPerM: 1200,
        foundationFracOfLoad: 3,
        ductLengthM: 150,
        handlingKgBase: 80000,
        handlingKgPerTph: 5000,
        pressKgBase: 40000,
        pressKgPerTph: 2000,
        minTurndown: 0.7,
        firming: 'battery',
        auxSteelKgBase: 120000,
        auxSteelKgPerTph: 5000,
        instrumentsUsdPerShaft: 3500000,
        instrumentsUsdPerPlant: 3500000,
        engineeringUsdPerPlant: 12000000,
        manufacturing: {
          vessel: 8, refractory: 4, mechanical: 10, structural: 4, civil: 2.5, heater: 10,
          recuperator: 6, cooler: 5, compressor: 14, ducts: 7, handling: 5, press: 10, electrical: 3, store: 3,
        },
        installFactor: 2.6,
      }),
    }),
    lean: Object.freeze({
      label: 'Lean solar-matched target: modular shop-built shaft, recuperated loop, baseload on a PV-charged heat store',
      params: Object.freeze({}),
    }),
    sunFollowing: Object.freeze({
      label: 'Lean shaft run sun-following: wide turndown, hot standby at night',
      params: Object.freeze({ operation: 'sun-following', minTurndown: 0.25 }),
    }),
  });

  const CONTROLS = Object.freeze([
    { key: 'plantKgFePerDay', label: 'Plant size', unit: 'kg Fe/day', min: 10000, max: 5000000, step: 10000, hint: 'Scoreboard plants are 100 t/day; world-scale Midrex modules ~6,000 t/day' },
    { key: 'shaftMaxKgFePerDay', label: 'Largest shaft', unit: 'kg Fe/day', min: 25000, max: 7000000, step: 25000, hint: 'Small standard shafts (modular) vs one world-scale shaft' },
    { key: 'productivityTPerHPerM2', label: 'Shaft productivity', unit: 't Fe/h/m²', min: 2, max: 12, step: 0.5, hint: 'Throughput per m² of bore' },
    { key: 'residenceHours', label: 'Solids residence', unit: 'h', min: 1, max: 10, step: 0.5, hint: 'Sets shaft height' },
    { key: 'gasInletC', label: 'Gas inlet temperature', unit: '°C', min: 700, max: 1050, step: 10, hint: 'Hotter gas: less gas flow, more heat per mol' },
    { key: 'gasUtilization', label: 'H₂ utilization per pass', min: 0.15, max: 0.45, step: 0.01, hint: 'Raised automatically to what heat and equilibrium allow' },
    { key: 'recuperatorEffectiveness', label: 'Recuperator effectiveness', min: 0, max: 0.9, step: 0.05, hint: 'Top-gas heat returned to the recycle gas' },
    { key: 'liningM', label: 'Refractory lining', unit: 'm', min: 0.15, max: 0.6, step: 0.05 },
    { key: 'shaftPressureBarAbs', label: 'Shaft pressure', unit: 'bar abs', min: 1.2, max: 8, step: 0.1 },
    { key: 'preheat', label: 'Gas preheat', options: [['electric', 'Electric resistive heater'], ['h2-combustion', 'Partial H₂ combustion (O₂)']] },
    { key: 'heaterCoupling', label: 'Heater power', options: [['dc-direct', 'DC-direct from PV strings'], ['scr-transformer', 'AC transformer + SCR']] },
    { key: 'operation', label: 'Operation', options: [['baseload', 'Baseload (firmed)'], ['sun-following', 'Sun-following + hot standby']] },
    { key: 'firming', label: 'Night energy (baseload)', options: [['heat-store', 'PV-charged heat store'], ['battery', 'Battery']] },
    { key: 'installFactor', label: 'Install factor', min: 1, max: 4, step: 0.05, hint: 'Installed ÷ delivered equipment' },
  ]);

  function merge(params = {}) {
    const p = { ...DEFAULTS, ...params };
    p.manufacturing = { ...DEFAULTS.manufacturing, ...(params.manufacturing || {}) };
    p.preheats = { ...DEFAULTS.preheats, ...(params.preheats || {}) };
    p.couplings = { ...DEFAULTS.couplings, ...(params.couplings || {}) };
    return p;
  }

  function commodity(name) {
    return Bom.COMMODITIES[name].usdPerKg;
  }

  // Mean molar heat capacities from 25 °C to T (°C), J/(mol·K): linear fits to NIST-JANAF.
  const cpH2 = T => 28.84 + 0.00098 * (T - 25); // 28.8 at 25 °C → ~30.6 at 1,000 °C (mean value over 25..T)
  const cpH2O = T => 33.58 + 0.00535 * (T - 25); // 33.6 → ~38.8 mean to 1,000 °C
  // Mean specific heats of solids, kJ/(kg·K), 25 °C → ~700–950 °C.
  const CP_FE = 0.68;
  const CP_FEO = 0.82;
  const CP_GANGUE = 0.95;

  // Fe/FeO–H₂/H₂O equilibrium: steam fraction in H₂ + H₂O at T (°C). Van 't Hoff fit to
  // x_eq ≈ 0.31 at 700 °C, 0.40 at 900 °C, 0.44 at 1,000 °C (Baur–Glaessner diagram).
  function equilibriumSteamFraction(T) {
    const K = Math.exp(1.517 - 2254 / (T + 273.15));
    return K / (1 + K);
  }

  // Water vapour pressure (bar) at T °C (Antoine, 1–100 °C).
  function waterVapourBar(T) {
    return (10 ** (8.07131 - 1730.63 / (233.426 + T))) * 133.322 / 1e5;
  }

  // Shaft gas heat and mass balance per kg Fe at a given H₂ flow ratio λ (inlet H₂ ÷ stoichiometric).
  //   in:  gas (H₂ + saturated steam, + combustion steam) at gasInletC, pellets at 25 °C
  //   out: reaction ΔH, hot DRI at dischargeC, top gas at T_top, shell loss
  // Returns the top-gas temperature that closes the balance.
  function shaftBalance(p, lambda, shellLossKJPerKg, extraSteamMol = 0) {
    const nSt = H2_STOICH_MOL_PER_KG_FE;
    const nReact = nSt * p.metallization + nSt * (1 - p.metallization) / 3; // Fe₂O₃→FeO removes ⅓ of the O
    const xw = waterVapourBar(p.knockoutC) / p.shaftPressureBarAbs;
    const nH2 = lambda * nSt;
    const nW = nH2 * xw / (1 - xw) + extraSteamMol;
    const T = p.gasInletC;
    const qIn = (nH2 * cpH2(T) + nW * cpH2O(T)) * (T - 25) / 1000;
    const rxn = DH_RXN_KJ_PER_KG_FE * (p.metallization + (1 - p.metallization) * 0.2); // FeO residue: ~20% of the full ΔH (wüstite stage is the endothermic one)
    const gangueKg = (1 / p.pelletFeFraction) - 1 / (2 * M_FE / M_FE2O3); // pellet mass − Fe₂O₃ mass per kg Fe
    const feoKg = (1 - p.metallization) * (0.071844 / M_FE);
    const solids = (p.metallization * CP_FE + feoKg * CP_FEO + gangueKg * CP_GANGUE) * (p.dischargeC - 25);
    const nH2Out = nH2 - nReact;
    const nWOut = nW + nReact;
    // Top-gas sensible heat depends on T_top only weakly, through cp(T): a few fixed-point passes converge.
    let Ttop = 300;
    for (let i = 0; i < 6; i += 1) {
      const c = (nH2Out * cpH2(Ttop) + nWOut * cpH2O(Ttop)) / 1000;
      Ttop = 25 + (qIn - rxn - solids - shellLossKJPerKg) / c;
    }
    return { lambda, nH2, nW, nReact, nH2Out, nWOut, xwIn: nW / (nH2 + nW), qInKJ: qIn, rxnKJ: rxn, solidsKJ: solids, topGasC: Ttop, gangueKg };
  }

  // λ needed: the larger of the utilization target, the Fe/FeO equilibrium at the bustle (the
  // wüstite → Fe stage removes ⅔ of the oxygen and must leave its gas below x_eq), and the heat
  // balance (top gas ≥ topGasMinC).
  function gasRequirement(p, shellLossKJPerKg, extraSteamMol = 0) {
    const xw = waterVapourBar(p.knockoutC) / p.shaftPressureBarAbs;
    const xeq = equilibriumSteamFraction(p.gasInletC);
    const nSt = H2_STOICH_MOL_PER_KG_FE;
    // total inlet moles n with (water_in + ⅔·nSt)/n ≤ x_eq; H₂ in = n − water_in.
    const nTotMin = (extraSteamMol + (2 / 3) * nSt) / Math.max(xeq - xw, 1e-6);
    const lambdaEq = (nTotMin * (1 - xw) - extraSteamMol * (1 - xw)) / nSt;
    const lambdaTarget = 1 / p.gasUtilization;
    let lo = 1.01;
    let hi = 40;
    if (shaftBalance(p, hi, shellLossKJPerKg, extraSteamMol).topGasC < p.topGasMinC) {
      return { lambda: hi, limitedBy: 'heat (infeasible inlet temperature)', lambdaEq, lambdaHeat: hi, lambdaTarget };
    }
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      if (shaftBalance(p, mid, shellLossKJPerKg, extraSteamMol).topGasC >= p.topGasMinC) hi = mid; else lo = mid;
    }
    const lambdaHeat = hi;
    const lambda = Math.max(lambdaTarget, lambdaEq, lambdaHeat);
    const limitedBy = lambda === lambdaHeat ? 'heat' : lambda === lambdaEq ? 'equilibrium' : 'utilization target';
    return { lambda, limitedBy, lambdaEq, lambdaHeat, lambdaTarget };
  }

  // Compression work (kJ) for n mol of gas at 40 °C from p1 to p2, intercooled stages of PR ≤ 2.5.
  function compressionKJ(nMol, p1, p2, eta, cpMol = 29.0, gamma = 1.405) {
    if (!(p2 > p1) || !(nMol > 0)) return 0;
    const pr = p2 / p1;
    const stages = Math.max(1, Math.ceil(Math.log(pr) / Math.log(2.5)));
    const k = (gamma - 1) / gamma;
    return stages * nMol * cpMol * 313.15 * (pr ** (k / stages) - 1) / eta / 1000;
  }

  // Ergun pressure gradient (Pa/m) for gas at superficial velocity u (m/s).
  function ergunPaPerM(u, rho, mu, d, eps) {
    return 150 * mu * (1 - eps) ** 2 * u / (eps ** 3 * d * d) + 1.75 * rho * (1 - eps) * u * u / (eps ** 3 * d);
  }

  function recipeAtSize(kgPerDay, recipe = RECIPE['hydrogen-dri']) {
    const f = (kgPerDay / recipe.refKgPerDay) ** (ENGINE_SCALE.exponent - 1);
    return recipe.usdPerKgDay * Math.max(ENGINE_SCALE.floorFactor, Math.min(1, f));
  }

  function design(params = {}) {
    const p = merge(params);
    const preheat = p.preheats[p.preheat] || p.preheats.electric;
    const coupling = p.couplings[p.heaterCoupling] || p.couplings['dc-direct'];
    const sunFollowing = p.operation === 'sun-following';
    const heatStore = !sunFollowing && p.firming === 'heat-store' && p.preheat !== 'h2-combustion';
    // A heat-store heater takes the whole day's heat during sun hours: elements and power path oversized.
    const chargeFactor = heatStore ? p.sunNameplateFactor : 1;

    // ---- geometry (per shaft)
    const nShafts = Math.max(1, Math.ceil(p.plantKgFePerDay / p.shaftMaxKgFePerDay - 1e-9));
    const feKgPerH = p.plantKgFePerDay / 24 / nShafts;
    const pelletKgPerKgFe = 1 / p.pelletFeFraction;
    const pelletTph = feKgPerH * pelletKgPerKgFe / 1000;
    let boreM2 = (feKgPerH / 1000) / p.productivityTPerHPerM2;

    // Gas flow and the Ergun check need λ; λ needs the shell loss, which needs geometry. Iterate.
    let gas;
    let bal;
    let geo;
    let extraSteamMol = 0;
    let heaterKJ = 0;
    let h2BurnMol = 0;
    let recup = null;
    for (let iter = 0; iter < 8; iter += 1) {
      const boreD = Math.sqrt(4 * boreM2 / Math.PI);
      const descentMPerH = pelletTph / boreM2 / p.pelletBulkDensityTPerM3;
      const reductionZoneM = descentMPerH * p.residenceHours;
      const heightM = reductionZoneM + p.extraHeightM + 1.5 * boreD; // + lower cone
      const shellD = boreD + 2 * p.liningM;
      const shellAreaM2 = Math.PI * shellD * heightM * 1.1; // + cones
      const meanInsideC = (p.gasInletC + Math.max(p.topGasMinC, 300)) / 2;
      const fluxWPerM2 = (meanInsideC - 25) / (p.liningM / p.liningConductivityWPerMK + 1 / p.shellOutsideHWPerM2K);
      const shellLossKW = fluxWPerM2 * shellAreaM2 / 1000;
      const shellLossKJPerKg = shellLossKW * 3600 / feKgPerH;
      geo = { boreM2, boreD, descentMPerH, reductionZoneM, heightM, shellD, shellAreaM2, fluxWPerM2, shellLossKW, shellLossKJPerKg };
      gas = gasRequirement(p, shellLossKJPerKg, extraSteamMol);
      bal = shaftBalance(p, gas.lambda, shellLossKJPerKg, extraSteamMol);
      // Recuperator on the recycle gas, then the heater (or burner) to the bustle temperature.
      const cCold = (bal.nH2 * cpH2(p.gasInletC) + (bal.nW - extraSteamMol) * cpH2O(p.gasInletC)) / 1000; // kJ/K per kg Fe
      const recupOutC = p.knockoutC + p.recuperatorEffectiveness * Math.max(0, bal.topGasC - p.knockoutC);
      const recupKJ = cCold * (recupOutC - p.knockoutC);
      const cHot = (bal.nH2Out * cpH2(bal.topGasC) + bal.nWOut * cpH2O(bal.topGasC)) / 1000;
      const hotOutC = bal.topGasC - recupKJ / Math.max(cHot, 1e-9);
      recup = { outC: recupOutC, kJ: recupKJ, hotOutC };
      heaterKJ = cCold * (p.gasInletC - recupOutC);
      if (p.preheat === 'h2-combustion') {
        // H₂ + ½O₂ → H₂O releases LHV; its steam then has to be heated too and it dilutes the gas.
        h2BurnMol = heaterKJ / (H2_LHV_KJ_PER_MOL * preheat.efficiency - cpH2O(p.gasInletC) * (p.gasInletC - 25) / 1000);
        extraSteamMol = h2BurnMol;
      }
      // Ergun: superficial velocity at mean bed conditions.
      const meanC = (p.gasInletC + bal.topGasC) / 2;
      const nTot = bal.nH2 + bal.nW;
      const molPerS = nTot * feKgPerH / 3600;
      const pPa = (p.shaftPressureBarAbs + 0.5 * p.loopPressureDropBar) * 1e5;
      const uMPerS = molPerS * R * (meanC + 273.15) / pPa / boreM2;
      const xwMean = (bal.xwIn + bal.nWOut / (bal.nH2Out + bal.nWOut)) / 2;
      const rho = pPa * ((1 - xwMean) * M_H2 + xwMean * M_H2O) / (R * (meanC + 273.15));
      const mu = 8.76e-6 * ((meanC + 273.15) / 273.15) ** 0.68;
      const gradPaPerM = ergunPaPerM(uMPerS, rho, mu, p.pelletDiameterM, p.bedVoidage);
      const burdenPaPerM = (1 - p.bedVoidage) * p.pelletDensityKgPerM3 * 9.81;
      geo = { ...geo, gasUMPerS: uMPerS, bedDropBar: gradPaPerM * geo.reductionZoneM / 1e5, liftRatio: gradPaPerM / burdenPaPerM, gasMolPerKg: nTot };
      // Keep the gas from lifting the burden (≤ 40% of its weight): widen the bore if needed.
      if (geo.liftRatio > 0.4) boreM2 *= Math.sqrt(geo.liftRatio / 0.4);
      else if (iter >= 2) break;
    }

    // ---- energy per kg Fe
    const heaterKWhPerKg = p.preheat === 'h2-combustion' ? 0 : heaterKJ / preheat.efficiency / 3600;
    const h2BurnKgPerKg = h2BurnMol * M_H2;
    const combustionKWhPerKg = h2BurnKgPerKg * p.h2KWhPerKg;
    const pTop = p.shaftPressureBarAbs;
    const pDischarge = pTop + p.loopPressureDropBar + geo.bedDropBar;
    const makeupMol = bal.nReact + h2BurnMol;
    const recycleMol = bal.nH2Out; // unreacted H₂ leaving the top, recycled with its saturated steam
    const recycleKJ = compressionKJ(recycleMol / (1 - bal.xwIn), pTop - 0.5 * p.loopPressureDropBar, pDischarge, p.compressorEfficiency);
    const makeupKJ = compressionKJ(makeupMol, p.h2SupplyBarAbs, pDischarge, p.compressorEfficiency);
    const compressorKWhPerKg = (recycleKJ + makeupKJ) / 3600;
    const coolKJ = (bal.nH2Out * cpH2(recup.hotOutC) + bal.nWOut * cpH2O(recup.hotOutC)) / 1000 * Math.max(0, recup.hotOutC - p.knockoutC)
      + (bal.nWOut - bal.nW) * LATENT_KJ_PER_MOL_40C;
    const coolerKWhPerKg = coolKJ * p.coolerFanFrac / 3600;
    const handlingKWhPerKg = p.handlingKWhPerKgPellet * pelletKgPerKgFe;
    // Sun-following: hot standby through the night (shell loss at standby + a trickle of hot gas).
    const offHours = sunFollowing ? Math.max(0, 24 - 24 / p.sunNameplateFactor) : 0;
    const standbyFluxWPerM2 = (p.standbyC - 25) / (p.liningM / p.liningConductivityWPerMK + 1 / p.shellOutsideHWPerM2K);
    const heaterKWFull = heaterKJ * feKgPerH / 3600; // per shaft
    const standbyKW = sunFollowing ? (standbyFluxWPerM2 * geo.shellAreaM2 / 1000 + p.standbyGasFrac * heaterKWFull * (p.standbyC - 25) / Math.max(p.gasInletC - 25, 1)) : 0;
    // Per kg of 24 h-average output, the shaft is sunNameplateFactor× bigger than this 24 h-basis design.
    const standbyKWhPerKg = sunFollowing ? standbyKW * offHours * p.sunNameplateFactor / (feKgPerH * 24) : 0;
    const energy = {
      heater: heaterKWhPerKg,
      h2Combustion: combustionKWhPerKg,
      compressor: compressorKWhPerKg,
      cooler: coolerKWhPerKg,
      handling: handlingKWhPerKg,
      briquetting: p.briquettingKWhPerKg,
      aux: p.auxKWhPerKg,
      standby: standbyKWhPerKg,
    };
    const kWhPerKg = Object.values(energy).reduce((a, b) => a + b, 0);

    // ---- bill of materials, per plant
    const parts = [];
    const add = (part, material, kg, mfgKey, note) => {
      const usdMaterials = kg * commodity(material);
      const manufacturing = p.manufacturing[mfgKey];
      parts.push({ part, material, kgPlant: kg, usdMaterialsPlant: usdMaterials, manufacturing, usdPlant: usdMaterials * manufacturing, note });
    };
    const buy = (part, usd, note, materialsUsd = 0) => parts.push({ part, material: null, kgPlant: 0, usdMaterialsPlant: materialsUsd, manufacturing: null, usdPlant: usd, note });

    const steelDensity = 7850;
    const pGaugeMPa = Math.max(0, pDischarge - 1) / 10;
    const tShellM = Math.max(p.shellMinThicknessMm / 1000, pGaugeMPa * geo.shellD / (2 * p.shellAllowableStressMPa * 0.85) + 0.003);
    const shellKg = Math.PI * geo.shellD * geo.heightM * tShellM * steelDensity * (1 + p.shellAppendagesFrac);
    const liningKg = Math.PI * (geo.boreD + p.liningM) * geo.heightM * p.liningM * p.liningDensityKgPerM3;
    const burdenKg = geo.boreM2 * geo.heightM * p.pelletBulkDensityTPerM3 * 1000;
    const supportedKg = shellKg + liningKg + burdenKg;
    add('Shaft shell', 'steel', nShafts * shellKg, 'vessel', `${nShafts} × ${geo.shellD.toFixed(2)} m OD × ${geo.heightM.toFixed(1)} m, ${(tShellM * 1000).toFixed(0)} mm`);
    add('Shaft refractory lining', 'refractory', nShafts * liningKg, 'refractory', `${p.liningM} m dense + insulating`);
    add('Charging, seal legs, burden feeders', 'steel', nShafts * (p.chargeDischargeKgPerShaft + p.chargeDischargeKgPerTph * pelletTph), 'mechanical', 'top hopper, gas seal, distributor, discharge feeders');
    add('Tower structure, platforms', 'steel', nShafts * (p.structureFracOfLoad * supportedKg + p.platformKgPerM * geo.heightM), 'structural', `carries ${(supportedKg / 1000).toFixed(0)} t per shaft`);
    add('Foundations', 'concrete', nShafts * p.foundationFracOfLoad * supportedKg, 'civil', 'shaft and tower footing');
    const heaterKWPlant = heaterKWFull * nShafts;
    if (p.preheat === 'h2-combustion') {
      add('Bustle-gas burner + O₂ lance', 'stainless-steel', 0.15 * heaterKWPlant, 'heater', 'partial combustion with electrolyzer O₂');
    } else {
      add('Gas heater elements', 'stainless-steel', p.heaterElementKgPerKW * heaterKWPlant * chargeFactor, 'heater', `FeCrAl/NiCr wire (priced as stainless), ${(heaterKWPlant * chargeFactor / 1000).toFixed(1)} MW${heatStore ? ' charging the heat store in sun hours' : ''}`);
      add('Gas heater shell', 'steel', p.heaterSteelKgPerKW * heaterKWPlant, 'heater', 'internally insulated pressure shell');
      add('Gas heater lining', 'refractory', p.heaterRefractoryKgPerKW * heaterKWPlant, 'heater', '');
      add('Heater power copper', 'copper', coupling.copperKgPerKW * heaterKWPlant * chargeFactor, 'electrical', coupling.label);
      buy('Heater power control', coupling.usdPerKW * heaterKWPlant * chargeFactor, coupling.label);
    }
    // Recuperator: counter-flow, LMTD from both ends.
    let recupM2 = 0;
    if (recup.kJ > 0) {
      const dT1 = Math.max(bal.topGasC - recup.outC, 5);
      const dT2 = Math.max(recup.hotOutC - p.knockoutC, 5);
      const lmtd = Math.abs(dT1 - dT2) < 1e-6 ? dT1 : (dT1 - dT2) / Math.log(dT1 / dT2);
      const kW = recup.kJ * p.plantKgFePerDay / 86400;
      recupM2 = kW * 1000 / (p.recuperatorUWPerM2K * lmtd);
      add('Recuperator (top gas → recycle)', 'stainless-steel', recupM2 * p.recuperatorKgPerM2, 'recuperator', `${Math.round(recupM2)} m², ε ${p.recuperatorEffectiveness}`);
    }
    const coolKW = coolKJ * p.plantKgFePerDay / 86400;
    add('Knock-out condenser (air-cooled)', 'steel', p.coolerSteelKgPerKW * coolKW, 'cooler', `${(coolKW / 1000).toFixed(1)} MW rejected; condensate (0.48 kg/kg Fe) back to the electrolyzer`);
    add('Condenser fins', 'aluminium', p.coolerAluminiumKgPerKW * coolKW, 'cooler', '');
    const compKW = compressorKWhPerKg * p.plantKgFePerDay / 24;
    add('Recycle + make-up compressors', 'steel', p.compressorKgPerKW * compKW, 'compressor', `${Math.round(compKW)} kW shaft`);
    add('Compressor motors', 'copper', p.compressorCopperKgPerKW * compKW, 'compressor', '');
    // Hot loop ducting: refractory-lined steel at the bustle velocity, cold loop half the mass.
    const actM3s = geo.gasMolPerKg * feKgPerH / 3600 * R * (p.gasInletC + 273.15) / (pDischarge * 1e5);
    const ductD = Math.sqrt(4 * actM3s / Math.PI / p.hotDuctVelocityMPerS) + 2 * 0.12;
    add('Gas ducts and bustle main', 'steel', nShafts * Math.PI * ductD * p.ductLengthM * 0.008 * steelDensity * 1.5, 'ducts', `${ductD.toFixed(2)} m OD × ${p.ductLengthM} m per shaft`);
    add('Duct lining', 'refractory', nShafts * Math.PI * (ductD - 0.12) * p.ductLengthM * 0.5 * 0.12 * 1200, 'ducts', 'hot leg only');
    const plantPelletTph = pelletTph * nShafts;
    add('Pellet handling (reclaim, screens, conveyors, bins)', 'steel', p.handlingKgBase + p.handlingKgPerTph * plantPelletTph, 'handling', `${plantPelletTph.toFixed(1)} t/h pellets`);
    add('Pellet yard pads', 'concrete', 4 * (p.handlingKgBase + p.handlingKgPerTph * plantPelletTph), 'civil', '');
    const hbiTph = p.plantKgFePerDay / 24 / p.metallization / 0.92 / 1000; // HBI ~92% Fe total
    const nPresses = Math.max(1, Math.ceil(hbiTph / p.pressMaxTph - 1e-9));
    const pressKg = nPresses * p.pressKgBase + p.pressKgPerTph * hbiTph;
    add('Hot briquetting press frame', 'steel', pressKg * (1 - p.pressAlloyFrac), 'press', `${nPresses} press${nPresses > 1 ? 'es' : ''}, ${hbiTph.toFixed(1)} t/h HBI`);
    add('Press rolls/pockets (hot-work alloy)', 'stainless-steel', pressKg * p.pressAlloyFrac, 'press', 'priced as stainless');
    const motorKW = compKW + plantPelletTph * 20 + hbiTph * 25;
    add('Motor power and cabling', 'copper', p.electricalCopperKgPerKW * motorKW, 'electrical', `${Math.round(motorKW)} kW motors`);
    let storeKg = 0;
    if (sunFollowing) {
      const storeKWh = standbyKW * nShafts * p.sunNameplateFactor * offHours; // sized for the sun-following nameplate
      storeKg = storeKWh * 3600 / (1.0 * p.storeDeltaK); // firebrick ~1.0 kJ/(kg·K) mean
      // The design is on a 24 h basis; the engine multiplies the whole unit by the nameplate factor,
      // so carry the store at 1/nameplate here.
      add('Night hot-standby heat store (firebrick)', 'refractory', storeKg / p.sunNameplateFactor, 'store', `${Math.round(storeKWh)} kWh_th at sun-following nameplate`);
      add('Heat store vessel', 'steel', 0.15 * storeKg / p.sunNameplateFactor, 'store', '');
    }
    const auxKg = p.auxSteelKgBase + p.auxSteelKgPerTph * hbiTph;
    add('Auxiliaries: N₂, flare, dust collection, HBI cooling, control room', 'steel', auxKg * (1 - p.auxStainlessFrac), 'mechanical', 'per plant');
    add('Auxiliaries, alloy service', 'stainless-steel', auxKg * p.auxStainlessFrac, 'mechanical', '');
    buy('Instruments, gas analysers, DCS/SIS, H₂ safety', nShafts * p.instrumentsUsdPerShaft + p.instrumentsUsdPerPlant, `${nShafts} shaft${nShafts > 1 ? 's' : ''}`);

    const equipmentUsd = parts.reduce((s, x) => s + x.usdPlant, 0);
    const installedEquipmentUsd = equipmentUsd * p.installFactor;
    const engineeringUsd = p.engineeringUsdPerPlant;
    const installedUsd = installedEquipmentUsd + engineeringUsd;
    const materialsUsd = parts.reduce((s, x) => s + x.usdMaterialsPlant, 0);
    const perKgDay = usd => usd / p.plantKgFePerDay;
    const bom = parts.map(x => ({
      part: x.part,
      material: x.material,
      kg: perKgDay(x.kgPlant),
      usdMaterials: perKgDay(x.usdMaterialsPlant),
      manufacturing: x.manufacturing,
      usd: perKgDay(x.usdPlant),
      note: x.note,
    }));
    bom.push({ part: `Installation (× ${p.installFactor})`, material: null, kg: null, usdMaterials: null, manufacturing: null, usd: perKgDay(installedEquipmentUsd - equipmentUsd), note: 'erection, piping tie-ins, commissioning' });
    bom.push({ part: 'Engineering, permits, owner', material: null, kg: null, usdMaterials: null, manufacturing: null, usd: perKgDay(engineeringUsd), note: 'per plant' });
    bom.sort((a, b) => b.usd - a.usd);

    const installedUsdPerKgDay = perKgDay(installedUsd);
    const materialsUsdPerKgDay = perKgDay(materialsUsd);
    const recipeUsdPerKgDay = recipeAtSize(p.plantKgFePerDay);
    const flexible = sunFollowing && p.minTurndown <= 0.35;
    const tPerYear = p.plantKgFePerDay * 365 / 1000;
    return {
      params: p,
      basis: 'per kg Fe (DRI/HBI)/day',
      // geometry
      nShafts,
      shaft: { boreDiameterM: geo.boreD, boreM2: geo.boreM2, heightM: geo.heightM, shellOdM: geo.shellD, shellMm: tShellM * 1000, reductionZoneM: geo.reductionZoneM, descentMPerH: geo.descentMPerH, shellKg, liningKg, burdenKg, shellLossKW: geo.shellLossKW, gasUMPerS: geo.gasUMPerS, bedDropBar: geo.bedDropBar, liftRatio: geo.liftRatio },
      // heat and mass balance per kg Fe
      balance: {
        lambda: gas.lambda,
        h2Utilization: 1 / gas.lambda,
        limitedBy: gas.limitedBy,
        lambdaEquilibrium: gas.lambdaEq,
        lambdaHeat: gas.lambdaHeat,
        h2CirculatedKgPerKg: bal.nH2 * M_H2,
        h2ConsumedKgPerKg: bal.nReact * M_H2,
        h2BurnedKgPerKg: h2BurnKgPerKg,
        waterKgPerKg: (bal.nWOut - bal.nW) * M_H2O,
        gasNm3PerT: (bal.nH2 + bal.nW) * 0.0224141 * 1000,
        topGasC: bal.topGasC,
        reactionKWhPerKg: bal.rxnKJ / 3600,
        dischargeHeatKWhPerKg: bal.solidsKJ / 3600,
        shellLossKWhPerKg: geo.shellLossKJPerKg / 3600,
        recuperatorOutC: recup.outC,
        recuperatorKWhPerKg: recup.kJ / 3600,
        heatDutyKWhPerKg: heaterKJ / 3600,
        knockoutKWhPerKg: coolKJ / 3600,
        pelletKgPerKg: pelletKgPerKgFe,
        gangueKgPerKg: bal.gangueKg,
        recuperatorM2: recupM2,
      },
      energy,
      kWhPerKg,
      thermoMinKWhPerKg: THERMO_MIN_KWH_PER_KG,
      heaterKW: heaterKWPlant,
      bom,
      equipmentUsd,
      installedUsd,
      installedUsdPerKgDay,
      installedUsdPerTonneYear: installedUsd / tPerYear,
      materialsUsdPerKgDay,
      idiotIndex: installedUsdPerKgDay / materialsUsdPerKgDay,
      flexible,
      firming: sunFollowing ? 'sun-following' : heatStore ? 'heat-store' : 'battery',
      recipeUsdPerKgDay,
      vsRecipe: {
        capexFactor: installedUsdPerKgDay / recipeUsdPerKgDay,
        energyFactor: kWhPerKg / RECIPE['hydrogen-dri'].kWhPerKg,
      },
      kpis: [
        { label: 'Installed', value: `$${installedUsdPerKgDay.toFixed(0)} per kg/day`, sub: `$${(installedUsd / tPerYear).toFixed(0)} per t/yr · recipe at this size $${recipeUsdPerKgDay.toFixed(0)}` },
        { label: 'Shaft', value: `${nShafts} × ${geo.boreD.toFixed(2)} m bore × ${geo.heightM.toFixed(0)} m`, sub: `${p.productivityTPerHPerM2} t Fe/h/m², ${p.residenceHours} h residence` },
        { label: 'Gas loop', value: `λ ${gas.lambda.toFixed(2)} (${(100 / gas.lambda).toFixed(0)}% H₂/pass)`, sub: `${gas.limitedBy}-limited · top gas ${bal.topGasC.toFixed(0)} °C` },
        { label: 'Energy', value: `${kWhPerKg.toFixed(3)} kWh/kg Fe`, sub: `heater ${heaterKWhPerKg.toFixed(3)}, compressors ${compressorKWhPerKg.toFixed(3)} · ΔH min ${THERMO_MIN_KWH_PER_KG.toFixed(3)}` },
        { label: 'Idiot index', value: `${(installedUsdPerKgDay / materialsUsdPerKgDay).toFixed(1)}×`, sub: `materials $${materialsUsdPerKgDay.toFixed(1)} per kg/day` },
        { label: 'Operation', value: flexible ? 'Sun-following' : heatStore ? 'Baseload on a heat store' : 'Baseload (battery)', sub: `turndown to ${(p.minTurndown * 100).toFixed(0)}%` },
      ],
    };
  }

  // Installed $/kg-day vs plant size (and shaft size): modular small shafts vs world scale.
  function scaleCurve(params = {}, sizesKgPerDay = [25e3, 1e5, 3e5, 1e6, 3e6]) {
    return sizesKgPerDay.map(size => {
      const d = design({ ...params, plantKgFePerDay: size });
      return { kgPerDay: size, nShafts: d.nShafts, usdPerKgDay: d.installedUsdPerKgDay, usdPerTonneYear: d.installedUsdPerTonneYear, recipeUsdPerKgDay: d.recipeUsdPerKgDay, idiotIndex: d.idiotIndex, kWhPerKg: d.kWhPerKg };
    });
  }

  function simulatorOverride(params) {
    const d = design(params);
    return { 'hydrogen-dri': {
      capexFactor: d.vsRecipe.capexFactor,
      energyFactor: d.vsRecipe.energyFactor,
      materialsFactor: d.vsRecipe.capexFactor / d.idiotIndex,
      flexible: d.flexible,
      thermal: d.firming === 'heat-store',
    } };
  }

  return {
    id: 'dri-shaft',
    name: 'Solar-matched H₂ DRI/HBI shaft furnace',
    summary: 'Modular hydrogen shaft furnace with a recuperated recycle loop and PV-charged electric gas heating, priced from its heat and mass balance and bill of materials.',
    units: ['hydrogen-dri'],
    product: 'steel',
    RECIPE,
    DEFAULTS,
    PRESETS,
    CONTROLS,
    THERMO_MIN_KWH_PER_KG,
    H2_STOICH_KG_PER_KG_FE: H2_STOICH_MOL_PER_KG_FE * M_H2,
    shaftBalance,
    recipeAtSize,
    design,
    scaleCurve,
    simulatorOverride,
  };
});
