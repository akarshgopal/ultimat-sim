// Sun-tolerant Haber-Bosch ammonia loop (+ PSA nitrogen) — first-principles parametric design.
//
// Goal: the cheapest kg of NH₃ from H₂ made by a solar electrolyzer. The loop and its N₂ supply are
// ~80% of green ammonia's equipment in the recipes, and the recipe basis is a 1 t/day plant at
// $1,900 + $313 per kg NH₃/day — a small-plant price dominated by things that are not steel:
// compressors, instruments, engineering, assembly. This model builds the loop up from physics:
//   • loop pressure → equilibrium NH₃ at the converter outlet (Gillespie–Beattie K, ideal gas),
//     NH₃ left in the recycle after the cold separator (vapour pressure at the separator), hence
//     recycle ratio, makeup/recycle compressor work, refrigeration duty and COP;
//   • converter catalyst volume from space velocity (Fe or Ru), vessel wall thickness from pressure
//     (ASME VIII thin-wall), steel mass from geometry;
//   • heat exchangers by duty (Q = U·A·LMTD), air coolers and chiller per kW;
//   • a PSA nitrogen generator (air compressor work, carbon-molecular-sieve mass, vessels);
//   • bought-in items (instruments, valves, engineering, assembly hours) that scale weakly with size;
//   • bill of materials at data/bom.js commodity prices × explicit manufacturing factors → installed
//     $ per kg NH₃/day, kWh per kg NH₃ and the idiot index (installed ÷ raw materials).
// A flexible (sun-following) variant adds what daily start/stop needs: drives, an electric start-up
// heater, hot-standby heat and a short makeup-gas buffer sized from ramp rate and turndown.
//
// Everything is a screening estimate with explicit, overridable assumptions (DEFAULTS). Sizes are at
// `plantKgPerDay` (default 1,000 kg NH₃/day — the green-ammonia recipe's reference output).
(function exposeHaberBoschDesign(root, factory) {
  const api = factory(typeof require === 'function' ? require('../../data/bom.js') : root.FoundryBom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.FoundryDesigns = root.FoundryDesigns || {};
    root.FoundryDesigns[api.id] = api;
  }
})(globalThis, Bom => {
  const R = 8.314462618; // J/(mol·K)
  const M_NH3 = 17.031; // g/mol
  const M_H2 = 2.01588;
  const M_N2 = 28.0134;
  const NM3_PER_MOL = 0.022414; // m³ at 0 °C, 1 atm
  const MOL_NH3_PER_KG = 1000 / M_NH3;
  const STEEL_DENSITY = 7850;
  const BAR = 1e5;

  // Recipe basis (data/pathways.js 'green-ammonia' flowsheet, reference output 1,000 kg NH₃/day at
  // namibia-walvis-bay). Both units are per kg NH₃/day and kWh per kg NH₃. In 'green-urea' the same
  // nodes are per kg urea ($1,080 and $177 per kg urea/day ÷ 0.567 kg NH₃/kg urea = the same basis).
  const RECIPE = Object.freeze({
    ammonia: Object.freeze({ usdPerKgDay: 1900, kWhPerKg: 0.6, pathwayId: 'green-ammonia', refKgPerDay: 1000 }),
    asu: Object.freeze({ usdPerKgDay: 313, kWhPerKg: 0.206, pathwayId: 'green-ammonia', refKgPerDay: 1000 }),
  });
  // The company simulator's own scale law (engine/company.js DEFAULTS.scale): capex per kg/day ∝
  // (size/ref)^(0.85−1), never below 0.4 × reference. Used only when an override is asked for at a
  // size other than the reference, so the factor compares like with like.
  const ENGINE_SCALE = Object.freeze({ exponent: 0.85, floorFactor: 0.4 });

  const DEFAULTS = Object.freeze({
    plantKgPerDay: 1000, // NH₃ nameplate the design is costed at (recipe reference size)
    flexible: false, // true: loop + PSA follow the sun (daily start/stop); false: firmed baseload
    // ---- loop
    loopPressureBar: 150,
    // Fe, not Ru: a tie on capex at ≥ 120 bar, and Ru at ~0.3 kg per t NH₃/day would need ~160 t of Ru
    // for today's ~200 Mt/yr of ammonia (~5 years of world mine output) — not an abundance material.
    catalyst: 'fe',
    catalysts: Object.freeze({
      fe: Object.freeze({
        label: 'Fused-iron (magnetite, K/Al/Ca promoted)',
        outletC: 450, inletC: 370, // final-bed outlet / converter inlet after internal exchange
        approach: 0.85, // fraction of the inlet→equilibrium gap closed (multi-bed, interbed cooling)
        ghsvAt150Bar: 15000, // h⁻¹, inlet Nm³/h per m³ catalyst; industrial 10–30k
        pressureExponent: 0.8, // volumetric rate ∝ P^n at fixed approach (screening)
        bulkKgPerM3: 2800,
        metal: null,
        priceUsdPerKg: 12, // bought catalyst; raw floor = magnetite at extraMaterials price
        floorMaterial: 'magnetite',
        note: 'mature; slow at < 100 bar; poisoned by O₂/H₂O (needs < 10 ppm oxygenates)',
      }),
      ru: Object.freeze({
        label: 'Ru on oxide support (Ba/Cs promoted)',
        outletC: 400, inletC: 330,
        approach: 0.85,
        ghsvAt150Bar: 45000, // ~3× Fe activity per volume at loop conditions (screening)
        pressureExponent: 0.5, // less pressure benefit (H₂ inhibition) — favours low pressure
        bulkKgPerM3: 1000,
        metal: 'ruthenium', metalWtFrac: 0.04,
        supportUsdPerKg: 3,
        manufacturing: 3, // impregnation, promotion, pelletizing: × support value (metal passes through)
        floorMaterial: 'alumina-support',
        note: 'active at lower T and P; Ru recovered at end of life; support must not methanate (no carbon)',
      }),
    }),
    loopInertFrac: 0.08, // Ar (+CH₄-free) in the loop; sets the purge
    separation: 'condensation', // 'condensation' (air cooler + chiller) | 'sorbent' (screening)
    separatorC: -20, // cold-separator temperature (condensation)
    coolingC: 40, // air-cooler outlet at a hot desert site (no cooling water)
    coldExchangerEffectiveness: 0.8, // gas–gas exchanger recovering separator cold
    sorbent: Object.freeze({
      // Supported metal-halide (MgCl₂/CaCl₂) absorbers: NH₃ left in recycle ~0.5% at any pressure;
      // regenerated by heat at ~200–250 °C. Screening (TRL ~4, Cussler/Malmali group results).
      yOut: 0.005, regenKJPerMolNH3: 60, kgSorbentPerKgNH3PerH: 6, sorbentUsdPerKg: 2, deltaPBar: 1,
    }),
    reactionHeatRecovery: 0.5, // share of reaction heat usable at > 200 °C (sorbent regeneration)
    loopDeltaPBar: 5, // circulation pressure drop (converter + exchangers + separator)
    feedH2Bar: 1.05, // electrolyzer outlet (the lean electrolyzer design is atmospheric)
    feedN2Bar: 7, // PSA product pressure
    compressorIsothermalEff: 0.7, // multistage intercooled, isothermal basis
    recycleCompressorEff: 0.7,
    motorEff: 0.95,
    refrigerationCarnotFrac: 0.5,
    condenserApproachK: 10, // refrigerant condensing above coolingC
    evaporatorApproachK: 5,
    fanKWhPerKWhRejected: 0.015, // air-cooler fans
    auxKWhPerKg: 0.01, // controls, instrument air, lighting
    purgeH2Recovery: 0.9, // membrane on the purge returns H₂ to the loop
    electrolyzerKWhPerKgH2: 52, // values the H₂ lost in the purge (and deoxo) as electricity
    reactionHeatKJPerMol: 50, // ΔH at loop temperature (−46 at 25 °C, ~−54 at 450 °C)
    gasCpJPerMolK: 30,
    latentKJPerMol: 22.5, // NH₃ ΔH_vap at −20…0 °C
    // ---- vessels and exchangers
    allowableStressMPa: 130, // 2¼Cr-1Mo at ~400 °C (ASME II-D order); also used for cold vessels
    crMoPremium: 1.5, // alloy plate ÷ carbon-steel plate price
    minWallMm: 6,
    corrosionAllowanceMm: 1.5,
    converterLD: 4,
    converterCatalystFill: 0.5, // rest: internal exchanger, distributors, interbed cooling
    converterInternalsFrac: 0.3, // stainless internals ÷ shell mass
    separatorGasResidenceS: 10,
    separatorLiquidResidenceS: 600,
    exchangers: Object.freeze({
      uFeheWPerM2K: 450, lmtdFeheK: 50, // high-pressure gas–gas
      uColdWPerM2K: 400,
      kgPerM2At150Bar: 15, // compact (plate-fin / printed-circuit style) HX mass per m² at 150 bar
    }),
    airCoolerSteelKgPerKW: 6, airCoolerAluminiumKgPerKW: 1.5,
    chillerSteelKgPerKW: 8, chillerCopperKgPerKW: 0.8, // per kW cooling, incl. compressor and HX
    // Compressor mass: kg/kW = kgPerKWAt100kW × (kW/100)^(sizeExponent−1) — small machines are heavy.
    compressorKgPerKWAt100kW: 20, compressorSizeExponent: 0.85,
    motorCopperKgPerKW: 0.8,
    drivesUsdPerKW: 40, // VFD / soft starter (needed for turndown either way)
    designMargin: 1.1, // nameplate ÷ normal flow for rotating equipment
    // ---- PSA nitrogen (the `asu` unit at these scales; a cryogenic cold box cannot start/stop daily)
    psa: Object.freeze({
      purityLabel: '99.5% N₂ + H₂ deoxo',
      airPerN2: 2.3, // Nm³ air per Nm³ N₂ product
      productivityNm3PerHPerKg: 0.25, // N₂ Nm³/h per kg carbon molecular sieve
      pressureBar: 8,
      isothermalEff: 0.7,
      dryerFrac: 0.03, // refrigerated dryer power ÷ air-compressor power
      cmsUsdPerKg: 6, cmsBulkKgPerM3: 650,
      inertsPerMolN2: 0.008, // Ar (+residual) carried into the loop
      o2PerMolN2: 0.005, // removed with H₂ over Pd (deoxo) → water
    }),
    // ---- flexible operation
    minTurndown: 0.2, // fraction of nameplate the converter stays autothermal at
    rampPerMin: 0.05, // fraction of nameplate per minute the loop can follow
    cloudStep: 0.6, // largest fast PV step the buffer must ride through (fraction of nameplate)
    cloudMinutes: 20, // cloud passage the loop rides at minimum turndown from buffer
    standbyHeatLossWPerM2: 150, // converter + exchangers held hot overnight
    flexibleOffHoursPerDay: 16,
    startupHeaterFrac: 0.15, // electric heater kW ÷ reaction heat release at nameplate
    heaterUsdPerKW: 25,
    bufferSwingFrac: 0.5, // makeup-gas buffer usable between loop P and 50% of it
    // ---- bought-in, labour, install (at 1 t/day; scale with (size/1 t/day)^exponent)
    instrumentsUsdAt1tpd: 60000, // PLC/SIS, NH₃/O₂/H₂ analysers, gas detection, transmitters
    valvesUsdAt1tpd: 15000, // HP control/isolation/relief valves at 150 bar
    pressureClassExponent: 0.6, // valves/fittings cost ∝ (P/150 bar)^n (ASME class 900 → 2500 order)
    engineeringUsdAt1tpd: 20000, // standard design reused: site adaptation, HAZOP, permits
    psaControlsUsdAt1tpd: 8000,
    boughtInSizeExponent: 0.4,
    assemblyHoursAt1tpd: 300,
    labourUsdPerHour: 40,
    labourSizeExponent: 0.6,
    pipingFracOfEquipmentSteel: 0.25, // pipe + fittings mass ÷ equipment steel mass (stainless)
    skidSteelKgAt1tpd: 1500, skidSizeExponent: 0.8,
    concreteKgAt1tpd: 8000,
    manufacturing: Object.freeze({
      vessels: 4, // rolled/forged HP shells, heads, nozzles, code stamp
      exchangers: 5,
      airCoolers: 3,
      chiller: 8,
      compressors: 10, // precision machining; mass-produced class
      motors: 3,
      piping: 4,
      skid: 2.5,
      civil: 1.5,
      sieve: 2,
    }),
    installFactor: 1.15, // site install, commissioning, contingency on top of equipment
    // Non-bom.js raw materials (bom.js has no entry). Screening prices.
    extraMaterials: Object.freeze({
      ruthenium: Object.freeze({ usdPerKg: 460 / 0.0311035, note: 'USGS MCS 2025 platinum-group: Ru ~$460/troy oz 2024 order' }),
      magnetite: Object.freeze({ usdPerKg: 0.15, note: 'iron-ore concentrate order (62% Fe fines ~$110/t) + promoters' }),
      'alumina-support': Object.freeze({ usdPerKg: 0.6, note: 'calcined alumina / MgO order' }),
      'activated-carbon': Object.freeze({ usdPerKg: 1.5, note: 'coconut-shell char precursor of CMS' }),
    }),
    lifeYears: 25,
    discountRate: 0.08,
  });

  const PRESETS = Object.freeze({
    today: Object.freeze({
      label: 'Today: small e-ammonia loop (150 bar, Fe, recip compressors, custom-engineered)',
      params: Object.freeze({
        loopPressureBar: 150,
        catalyst: 'fe',
        feedH2Bar: 30, // today's pressurized PEM / alkaline stacks deliver H₂ at ~30 bar
        separatorC: -5,
        loopInertFrac: 0.05,
        purgeH2Recovery: 0,
        compressorIsothermalEff: 0.62,
        recycleCompressorEff: 0.6,
        motorEff: 0.92,
        exchangers: { uFeheWPerM2K: 300, lmtdFeheK: 40, uColdWPerM2K: 300, kgPerM2At150Bar: 45 },
        airCoolerSteelKgPerKW: 12, airCoolerAluminiumKgPerKW: 2,
        chillerSteelKgPerKW: 15, chillerCopperKgPerKW: 1.5,
        compressorKgPerKWAt100kW: 60, compressorSizeExponent: 0.65,
        drivesUsdPerKW: 150,
        psa: { purityLabel: '99.999% N₂ PSA', airPerN2: 4.0, productivityNm3PerHPerKg: 0.06, isothermalEff: 0.6, inertsPerMolN2: 0.003, o2PerMolN2: 0.00001 },
        instrumentsUsdAt1tpd: 350000,
        valvesUsdAt1tpd: 90000,
        engineeringUsdAt1tpd: 300000,
        psaControlsUsdAt1tpd: 40000,
        boughtInSizeExponent: 0.3,
        assemblyHoursAt1tpd: 3000,
        labourUsdPerHour: 60,
        pipingFracOfEquipmentSteel: 0.6,
        skidSteelKgAt1tpd: 4000,
        concreteKgAt1tpd: 30000,
        manufacturing: { vessels: 25, exchangers: 20, airCoolers: 6, chiller: 30, compressors: 40, motors: 5, piping: 12, skid: 4, civil: 2.5, sieve: 4 },
        installFactor: 1.6,
        minTurndown: 0.5,
        rampPerMin: 0.01,
      }),
    }),
    lean: Object.freeze({
      label: 'Lean solar-matched target: 150 bar Fe loop, factory-built skid, PSA N₂, follows the sun',
      params: Object.freeze({ flexible: true }),
    }),
  });

  const CONTROLS = Object.freeze([
    { key: 'loopPressureBar', label: 'Loop pressure', unit: 'bar', min: 30, max: 250, step: 5, hint: 'lower = thinner walls, more recycle and refrigeration' },
    { key: 'catalyst', label: 'Catalyst', options: [['fe', 'Fused iron'], ['ru', 'Ruthenium']] },
    { key: 'separation', label: 'NH₃ separation', options: [['condensation', 'Condensation (chiller)'], ['sorbent', 'Metal-halide sorbent (screening)']] },
    { key: 'separatorC', label: 'Separator temperature', unit: '°C', min: -33, max: 30, step: 1, hint: 'colder = less NH₃ recycled, more refrigeration' },
    { key: 'flexible', label: 'Operation', options: [[false, 'Baseload (firmed, H₂ buffer)'], [true, 'Sun-following (daily start/stop)']] },
    { key: 'plantKgPerDay', label: 'Plant size', unit: 'kg NH₃/day', min: 100, max: 3000000, step: 100, hint: 'recipe reference 1,000' },
    { key: 'installFactor', label: 'Install factor', unit: '×', min: 1, max: 2.5, step: 0.05 },
  ]);

  function merge(params = {}) {
    const p = { ...DEFAULTS, ...params };
    for (const k of ['catalysts', 'sorbent', 'exchangers', 'psa', 'manufacturing', 'extraMaterials']) {
      p[k] = { ...DEFAULTS[k], ...(params[k] || {}) };
    }
    p.flexible = params.flexible === true || params.flexible === 'true' ? true : params.flexible === false || params.flexible === 'false' ? false : DEFAULTS.flexible;
    return p;
  }

  function price(material, p) {
    return Bom.COMMODITIES[material]?.usdPerKg ?? p.extraMaterials[material]?.usdPerKg ?? 0;
  }

  // ---------------------------------------------------------------- thermodynamics
  // Equilibrium constant of ½N₂ + 3⁄2H₂ ⇌ NH₃ (atm⁻¹), Gillespie & Beattie (1930) fit.
  function equilibriumK(T) {
    const log10K = -2.691122 * Math.log10(T) - 5.519265e-5 * T + 1.848863e-7 * T * T + 2001.6 / T + 2.6899;
    return 10 ** log10K;
  }

  // NH₃ vapour pressure (bar), NIST Antoine fit (239.6–371.5 K; extrapolated a little either side).
  function nh3VapourBar(T) {
    return 10 ** (4.86886 - 1113.928 / (T - 10.409));
  }

  // Equilibrium NH₃ mole fraction from an inlet of 3:1 H₂:N₂ with yIn NH₃ and yInert inerts (ideal gas;
  // fugacity corrections raise it ~10–20% at 150–200 bar, so this is slightly conservative).
  function equilibriumNH3(pBar, T, yIn = 0, yInert = 0) {
    const K = equilibriumK(T);
    const pAtm = pBar / 1.01325;
    const a = Math.max(1e-9, 1 - yIn - yInert);
    const ratio = xi => {
      const tot = 1 - xi;
      const yN = (a / 4 - xi / 2) / tot;
      const yH = (3 * a / 4 - 1.5 * xi) / tot;
      const yA = (yIn + xi) / tot;
      return yA / (Math.sqrt(Math.max(yN, 1e-15)) * Math.max(yH, 1e-15) ** 1.5 * pAtm);
    };
    if (ratio(0) >= K) return yIn;
    let lo = 0;
    let hi = a / 2 - 1e-12;
    for (let i = 0; i < 80; i += 1) {
      const mid = (lo + hi) / 2;
      if (ratio(mid) < K) lo = mid; else hi = mid;
    }
    return (yIn + lo) / (1 - lo);
  }

  // Isothermal-basis compression work, J per mol of gas.
  function compressionJPerMol(pIn, pOut, T, eff) {
    return pOut > pIn ? (R * T * Math.log(pOut / pIn)) / eff : 0;
  }

  // Cylindrical vessel with hemispherical heads: volume (m³), pressure (bar) → steel kg (ASME VIII-1
  // thin wall t = P·D / (2·S·E − 1.2·P) + corrosion allowance, never below the minimum wall).
  function vessel(volumeM3, pBar, p, lOverD = 3) {
    const V = Math.max(volumeM3, 1e-6);
    // V = π D²/4 · (L − D) + π D³/6 with L = lOverD·D
    const D = Math.cbrt(V / (Math.PI / 4 * (lOverD - 1) + Math.PI / 6));
    const P = pBar * BAR;
    const S = p.allowableStressMPa * 1e6;
    const t = Math.max(p.minWallMm / 1000, (P * D) / (2 * S - 1.2 * P)) + p.corrosionAllowanceMm / 1000;
    const shell = Math.PI * D * (lOverD - 1) * D * t;
    const heads = Math.PI * D * D * (t / 2 + p.corrosionAllowanceMm / 2000); // two hemispheres, half wall
    return { D, L: lOverD * D, wallMm: t * 1000, kg: (shell + heads) * STEEL_DENSITY, areaM2: Math.PI * D * lOverD * D };
  }

  // ---------------------------------------------------------------- the loop
  function loopProcess(p) {
    const cat = p.catalysts[p.catalyst] || p.catalysts.fe;
    const P = p.loopPressureBar;
    const Tout = cat.outletC + 273.15;
    const Tcool = p.coolingC + 273.15;
    const sorbent = p.separation === 'sorbent';
    const Tsep = sorbent ? Tcool : p.separatorC + 273.15;
    const yIn = sorbent ? p.sorbent.yOut : Math.min(0.5, nh3VapourBar(Tsep) / P);
    const yEq = equilibriumNH3(P, Tout, yIn, p.loopInertFrac);
    const yOut = yIn + cat.approach * (yEq - yIn);
    const feasible = yOut - yIn > 1e-3;
    // Inlet moles circulated per mol NH₃ made (Δn = −1 per mol NH₃).
    const circ = feasible ? (1 + yOut) / (yOut - yIn) : Infinity;
    const outFlow = circ - 1;

    // Energy, J per mol NH₃.
    const makeup = (1.5 * compressionJPerMol(p.feedH2Bar, P, Tcool, p.compressorIsothermalEff)
      + 0.5 * compressionJPerMol(p.feedN2Bar, P, Tcool, p.compressorIsothermalEff)) / p.motorEff;
    const dP = p.loopDeltaPBar + (sorbent ? p.sorbent.deltaPBar : 0);
    const recycle = circ * compressionJPerMol(P - dP, P, Tcool, p.recycleCompressorEff) / p.motorEff;
    let refrigQ = 0;
    let refrigW = 0;
    let cop = null;
    let condensedInChiller = 0;
    let coldExchangerQ = 0;
    if (!sorbent && Tsep < Tcool) {
      const ySatCool = Math.min(1, nh3VapourBar(Tcool) / P);
      condensedInChiller = Math.max(0, Math.min(yOut, ySatCool) - yIn) * outFlow;
      const sensible = outFlow * p.gasCpJPerMolK * (Tcool - Tsep);
      coldExchangerQ = sensible * p.coldExchangerEffectiveness;
      refrigQ = condensedInChiller * p.latentKJPerMol * 1000 + sensible * (1 - p.coldExchangerEffectiveness);
      const Tevap = Tsep - p.evaporatorApproachK;
      const Tcond = Tcool + p.condenserApproachK;
      cop = p.refrigerationCarnotFrac * Tevap / (Tcond - Tevap);
      refrigW = refrigQ / cop;
    }
    const rxnHeat = p.reactionHeatKJPerMol * 1000;
    let regenHeater = 0;
    let recovered = 0;
    if (sorbent) {
      const need = p.sorbent.regenKJPerMolNH3 * 1000;
      recovered = Math.min(need, rxnHeat * p.reactionHeatRecovery);
      regenHeater = need - recovered;
    }
    const rejected = rxnHeat - recovered + makeup + recycle + refrigW + regenHeater;
    const fans = rejected * p.fanKWhPerKWhRejected;
    // Purge: inerts from the N₂ feed leave in the purge at the loop's inert fraction, carrying H₂.
    const inertsIn = 0.5 * p.psa.inertsPerMolN2;
    const purgeMol = inertsIn / Math.max(p.loopInertFrac, 1e-6);
    const purgeH2Mol = purgeMol * (1 - p.loopInertFrac - yIn) * 0.75 * (1 - p.purgeH2Recovery);
    const deoxoH2Mol = 0.5 * p.psa.o2PerMolN2 * 2;
    const h2LossKgPerKg = (purgeH2Mol + deoxoH2Mol) * MOL_NH3_PER_KG * M_H2 / 1000;
    const toKWhPerKg = j => (j * MOL_NH3_PER_KG) / 3.6e6;
    const energy = {
      makeupCompression: toKWhPerKg(makeup),
      recycleCompression: toKWhPerKg(recycle),
      refrigeration: toKWhPerKg(refrigW),
      sorbentHeater: toKWhPerKg(regenHeater),
      fans: toKWhPerKg(fans),
      aux: p.auxKWhPerKg,
      purgeAndDeoxoH2: h2LossKgPerKg * p.electrolyzerKWhPerKgH2,
    };
    return {
      cat, P, Tout, Tcool, Tsep, yIn, yEq, yOut, circ, outFlow, feasible, cop, sorbent,
      perMol: { makeup, recycle, refrigQ, refrigW, rxnHeat, rejected, coldExchangerQ, condensedInChiller, regenHeater },
      energy, h2LossKgPerKg,
    };
  }

  // Ramp/turndown buffer for a sun-following loop, minutes of nameplate makeup gas.
  function bufferMinutes(p) {
    return (p.cloudStep * p.cloudStep) / (2 * Math.max(p.rampPerMin, 1e-6)) + p.cloudMinutes * p.minTurndown;
  }

  // ---------------------------------------------------------------- full design
  function design(params = {}) {
    const p = merge(params);
    const S = Math.max(1, p.plantKgPerDay);
    const sizeRatio = S / 1000;
    const L = loopProcess(p);
    if (!L.feasible) {
      // Equilibrium at this pressure/temperature leaves no room above the NH₃ the separator recycles.
      const none = { materialsUsdPerKgDay: Infinity, manufacturedUsdPerKgDay: Infinity, installedUsdPerKgDay: Infinity, kWhPerKg: Infinity, idiotIndex: Infinity };
      return {
        params: p, feasible: false, basis: 'per kg NH₃/day', plantKgPerDay: S, flexible: p.flexible,
        loop: { pressureBar: L.P, catalyst: p.catalyst, yEquilibrium: L.yEq, yIn: L.yIn, yOut: L.yOut, recycleMolPerMolNH3: Infinity },
        energyKWhPerKg: {}, byUnit: { ammonia: { ...none }, asu: { ...none } }, parts: [],
        installedUsdPerKgDay: Infinity, materialsUsdPerKgDay: Infinity, idiotIndex: Infinity, kWhPerKg: Infinity,
        kpis: [{ label: 'Infeasible', value: 'no conversion', sub: `equilibrium NH₃ ${(L.yEq * 100).toFixed(1)}% ≤ separator outlet ${(L.yIn * 100).toFixed(1)}% at ${L.P} bar — raise pressure, chill the separator or use a more active catalyst` }],
        vsRecipe: { ammonia: { capexFactor: Infinity, energyFactor: Infinity }, asu: { capexFactor: Infinity, energyFactor: Infinity } },
      };
    }
    const nNH3 = (S * MOL_NH3_PER_KG) / 86400; // mol/s at nameplate
    const m = p.manufacturing;
    const parts = [];
    const add = (unit, part, material, kgPlant, manufacturing, note) => {
      const usdMaterials = kgPlant * price(material, p);
      parts.push({ unit, part, material, kgPlant, usdMaterialsPlant: usdMaterials, manufacturing, usdPlant: usdMaterials * manufacturing, note });
    };
    const buy = (unit, part, usdPlant, note, floorUsdPlant = 0) => {
      parts.push({ unit, part, material: null, kgPlant: 0, usdMaterialsPlant: floorUsdPlant, manufacturing: null, usdPlant, note });
    };
    const compressorKg = kW => kW * p.compressorKgPerKWAt100kW * (Math.max(kW, 0.5) / 100) ** (p.compressorSizeExponent - 1);
    const scaleBought = usd => usd * sizeRatio ** p.boughtInSizeExponent;
    let steelEquipmentKg = 0;
    const steel = kg => { steelEquipmentKg += kg; return kg; };

    // -- converter
    const inletNm3h = L.circ * nNH3 * NM3_PER_MOL * 3600;
    const ghsv = L.cat.ghsvAt150Bar * (L.P / 150) ** L.cat.pressureExponent;
    const catalystM3 = inletNm3h / ghsv;
    const conv = vessel(catalystM3 / p.converterCatalystFill, L.P, p, p.converterLD);
    add('ammonia', 'Converter shell (Cr-Mo)', 'steel', steel(conv.kg), m.vessels * p.crMoPremium, `${conv.wallMm.toFixed(1)} mm wall, Ø${(conv.D * 1000).toFixed(0)} mm × ${conv.L.toFixed(2)} m at ${L.P} bar`);
    add('ammonia', 'Converter internals', 'stainless-steel', conv.kg * p.converterInternalsFrac, m.vessels, 'beds, interbed exchanger, distributors');
    const catKg = catalystM3 * L.cat.bulkKgPerM3;
    if (L.cat.metal) {
      const metalKg = catKg * L.cat.metalWtFrac;
      const supportKg = catKg - metalKg;
      // Metal passes through at its price (and is recovered at end of life); fabrication is on the support.
      const usd = metalKg * price(L.cat.metal, p) + supportKg * L.cat.supportUsdPerKg * L.cat.manufacturing;
      buy('ammonia', `Catalyst charge (${L.cat.label})`, usd, `${catKg.toFixed(1)} kg at GHSV ${Math.round(ghsv)} h⁻¹; ${metalKg.toFixed(2)} kg Ru`,
        metalKg * price(L.cat.metal, p) + supportKg * price(L.cat.floorMaterial, p));
    } else {
      buy('ammonia', `Catalyst charge (${L.cat.label})`, catKg * L.cat.priceUsdPerKg, `${catKg.toFixed(1)} kg at GHSV ${Math.round(ghsv)} h⁻¹`, catKg * price(L.cat.floorMaterial, p));
    }

    // -- separator (+ sorbent beds)
    const gasM3s = (L.outFlow * nNH3 * R * L.Tsep) / (L.P * BAR);
    const liqM3s = (S / 86400) / 650;
    const sepVol = gasM3s * p.separatorGasResidenceS + liqM3s * p.separatorLiquidResidenceS;
    const sep = vessel(sepVol, L.P, p, 3);
    add('ammonia', L.sorbent ? 'Product receiver' : 'Cold separator + let-down', 'steel', steel(sep.kg), m.vessels, `${(sepVol * 1000).toFixed(0)} L at ${L.P} bar`);
    if (L.sorbent) {
      const sorbentKg = p.sorbent.kgSorbentPerKgNH3PerH * (S / 24) * 2; // two beds swing
      const beds = vessel(sorbentKg / 800 * 1.3, L.P, p, 3);
      add('ammonia', 'Sorbent absorber beds (×2)', 'steel', steel(beds.kg * 2), m.vessels, 'temperature-swing, heated by converter effluent');
      buy('ammonia', 'Metal-halide sorbent', sorbentKg * p.sorbent.sorbentUsdPerKg, `${sorbentKg.toFixed(0)} kg supported MgCl₂/CaCl₂`);
    }

    // -- heat exchangers by duty (W at nameplate)
    const pressureScale = 0.5 + 0.5 * (L.P / 150);
    const hxKgPerM2 = p.exchangers.kgPerM2At150Bar * pressureScale;
    const feheW = L.circ * nNH3 * p.gasCpJPerMolK * ((L.cat.inletC + 273.15) - L.Tcool);
    const feheM2 = feheW / (p.exchangers.uFeheWPerM2K * p.exchangers.lmtdFeheK);
    add('ammonia', 'Feed–effluent exchanger', 'stainless-steel', feheM2 * hxKgPerM2, m.exchangers, `${(feheW / 1000).toFixed(0)} kW, ${feheM2.toFixed(1)} m²`);
    if (L.perMol.coldExchangerQ > 0) {
      const coldW = L.perMol.coldExchangerQ * nNH3;
      const lmtd = Math.max(2, (L.Tcool - L.Tsep) * (1 - p.coldExchangerEffectiveness));
      const coldM2 = coldW / (p.exchangers.uColdWPerM2K * lmtd);
      add('ammonia', 'Cold gas–gas exchanger', 'steel', steel(coldM2 * hxKgPerM2), m.exchangers, `${(coldW / 1000).toFixed(1)} kW, ${coldM2.toFixed(1)} m², ε ${p.coldExchangerEffectiveness}`);
    }
    const rejectKW = (L.perMol.rejected * nNH3) / 1000;
    add('ammonia', 'Air coolers (steel)', 'steel', steel(rejectKW * p.airCoolerSteelKgPerKW), m.airCoolers, `${rejectKW.toFixed(0)} kW rejected: reaction heat + compression`);
    add('ammonia', 'Air coolers (fins)', 'aluminium', rejectKW * p.airCoolerAluminiumKgPerKW, m.airCoolers, 'finned tube bundles');
    const refrigKW = (L.perMol.refrigQ * nNH3) / 1000;
    if (refrigKW > 0) {
      add('ammonia', 'Chiller package (steel)', 'steel', steel(refrigKW * p.chillerSteelKgPerKW), m.chiller, `${refrigKW.toFixed(1)} kW cooling at ${p.separatorC} °C, COP ${L.cop.toFixed(2)}`);
      add('ammonia', 'Chiller package (copper)', 'copper', refrigKW * p.chillerCopperKgPerKW, m.chiller, 'motor, coils');
    }

    // -- compressors (shaft kW at nameplate × design margin)
    const makeupKW = (L.perMol.makeup * p.motorEff * nNH3 / 1000) * p.designMargin;
    const recycleKW = (L.perMol.recycle * p.motorEff * nNH3 / 1000) * p.designMargin;
    add('ammonia', 'Makeup compressor', 'steel', steel(compressorKg(makeupKW)), m.compressors, `${makeupKW.toFixed(1)} kW, ${p.feedH2Bar}→${L.P} bar`);
    add('ammonia', 'Recycle compressor', 'steel', steel(compressorKg(recycleKW)), m.compressors, `${recycleKW.toFixed(1)} kW, circulation ${L.circ.toFixed(1)} mol/mol NH₃`);
    add('ammonia', 'Motors (copper)', 'copper', (makeupKW + recycleKW) * p.motorCopperKgPerKW, m.motors, '');
    buy('ammonia', 'Drives (VFD / starters)', (makeupKW + recycleKW) * p.drivesUsdPerKW, 'turndown and soft start');

    // -- sun-following extras
    let standbyKWhPerKg = 0;
    let bufferMin = 0;
    if (p.flexible) {
      const heaterKW = p.startupHeaterFrac * (L.perMol.rxnHeat * nNH3) / 1000;
      buy('ammonia', 'Electric start-up / hold-hot heater', heaterKW * p.heaterUsdPerKW, `${heaterKW.toFixed(1)} kW`, heaterKW * 0.05 * price('nickel', p));
      const hotArea = conv.areaM2 * 1.5; // converter + hot exchanger
      standbyKWhPerKg = (hotArea * p.standbyHeatLossWPerM2 * p.flexibleOffHoursPerDay) / 1000 / S;
      bufferMin = bufferMinutes(p);
      const bufferMol = 2 * nNH3 * 60 * bufferMin; // makeup gas (H₂ + N₂)
      const bufV = (bufferMol * R * L.Tcool) / (p.bufferSwingFrac * L.P * BAR);
      const buf = vessel(bufV, L.P, p, 4);
      add('ammonia', 'Makeup-gas ramp buffer', 'steel', steel(buf.kg), m.vessels, `${bufferMin.toFixed(0)} min of makeup gas, ${bufV.toFixed(2)} m³`);
    }

    // -- PSA nitrogen (`asu`)
    const ps = p.psa;
    const n2Nm3h = 0.5 * nNH3 * NM3_PER_MOL * 3600;
    const airMolPerMolN2 = ps.airPerN2;
    const airJPerMolN2 = airMolPerMolN2 * compressionJPerMol(1.013, ps.pressureBar, L.Tcool, ps.isothermalEff) / p.motorEff * (1 + ps.dryerFrac);
    const asuKWhPerKg = (0.5 * airJPerMolN2 * MOL_NH3_PER_KG) / 3.6e6;
    const airKW = (airMolPerMolN2 * 0.5 * nNH3 * compressionJPerMol(1.013, ps.pressureBar, L.Tcool, ps.isothermalEff)) / 1000 * p.designMargin;
    const cmsKg = n2Nm3h / ps.productivityNm3PerHPerKg;
    const beds = vessel((cmsKg / ps.cmsBulkKgPerM3) * 1.3, ps.pressureBar, p, 3);
    const receivers = vessel((cmsKg / ps.cmsBulkKgPerM3) * 1.0, ps.pressureBar, p, 3);
    add('asu', 'PSA air compressor', 'steel', compressorKg(airKW), m.compressors, `${airKW.toFixed(1)} kW to ${ps.pressureBar} bar, ${ps.airPerN2} Nm³ air/Nm³ N₂ (${ps.purityLabel})`);
    add('asu', 'PSA motor + dryer (copper)', 'copper', airKW * (p.motorCopperKgPerKW + 0.3), m.motors, 'refrigerated air dryer');
    add('asu', 'Adsorber vessels (×2) + receivers (×2)', 'steel', 2 * beds.kg + 2 * receivers.kg, m.vessels, `${(beds.D * 1000).toFixed(0)} mm beds at ${ps.pressureBar} bar`);
    add('asu', 'Carbon molecular sieve', 'activated-carbon', cmsKg, ps.cmsUsdPerKg / price('activated-carbon', p), `${cmsKg.toFixed(0)} kg at ${ps.productivityNm3PerHPerKg} Nm³/h·kg`);
    buy('asu', 'PSA valves, O₂ analyser, deoxo, controls', scaleBought(p.psaControlsUsdAt1tpd), 'fast-cycling valves; Pd deoxo burns residual O₂ with loop H₂');

    // -- shared bought-in, piping, skid, civil, labour (split ammonia : asu by equipment value)
    const pressureClass = (L.P / 150) ** p.pressureClassExponent;
    add('ammonia', 'Piping, fittings (stainless)', 'stainless-steel', steelEquipmentKg * p.pipingFracOfEquipmentSteel * pressureScale, m.piping, `${Math.round(p.pipingFracOfEquipmentSteel * 100)}% of loop equipment steel, wall ∝ pressure`);
    buy('ammonia', 'Instruments, PLC/SIS, gas detection', scaleBought(p.instrumentsUsdAt1tpd), 'analysers (NH₃, H₂, O₂ ppm), transmitters, safety system');
    buy('ammonia', 'HP valves', scaleBought(p.valvesUsdAt1tpd) * pressureClass, `control, isolation, relief; pressure class ×${pressureClass.toFixed(2)}`);
    buy('ammonia', 'Engineering, HAZOP, permits', scaleBought(p.engineeringUsdAt1tpd), 'per plant');
    const skidKg = p.skidSteelKgAt1tpd * sizeRatio ** p.skidSizeExponent;
    add('ammonia', 'Skid / structure', 'steel', skidKg * 0.8, m.skid, 'loop skid');
    add('asu', 'Skid / structure', 'steel', skidKg * 0.2, m.skid, 'PSA skid');
    const concreteKg = p.concreteKgAt1tpd * sizeRatio ** p.skidSizeExponent;
    add('ammonia', 'Foundations', 'concrete', concreteKg * 0.8, m.civil, '');
    add('asu', 'Foundations', 'concrete', concreteKg * 0.2, m.civil, '');
    const labourUsd = p.assemblyHoursAt1tpd * p.labourUsdPerHour * sizeRatio ** p.labourSizeExponent;
    buy('ammonia', 'Assembly labour', labourUsd * 0.85, `${Math.round(p.assemblyHoursAt1tpd * sizeRatio ** p.labourSizeExponent * 0.85)} h`);
    buy('asu', 'Assembly labour', labourUsd * 0.15, '');

    // -- roll up per unit, per kg NH₃/day
    const byUnit = {};
    for (const unit of ['ammonia', 'asu']) {
      const ps2 = parts.filter(x => x.unit === unit);
      const materials = ps2.reduce((s, x) => s + x.usdMaterialsPlant, 0);
      const manufactured = ps2.reduce((s, x) => s + x.usdPlant, 0);
      byUnit[unit] = {
        materialsUsdPerKgDay: materials / S,
        manufacturedUsdPerKgDay: manufactured / S,
        installedUsdPerKgDay: (manufactured * p.installFactor) / S,
      };
    }
    const loopKWhPerKg = Object.values(L.energy).reduce((s, x) => s + x, 0) + standbyKWhPerKg;
    byUnit.ammonia.kWhPerKg = loopKWhPerKg;
    byUnit.asu.kWhPerKg = asuKWhPerKg;
    byUnit.ammonia.idiotIndex = byUnit.ammonia.installedUsdPerKgDay / byUnit.ammonia.materialsUsdPerKgDay;
    byUnit.asu.idiotIndex = byUnit.asu.installedUsdPerKgDay / byUnit.asu.materialsUsdPerKgDay;
    const installedUsdPerKgDay = byUnit.ammonia.installedUsdPerKgDay + byUnit.asu.installedUsdPerKgDay;
    const materialsUsdPerKgDay = byUnit.ammonia.materialsUsdPerKgDay + byUnit.asu.materialsUsdPerKgDay;
    const kWhPerKg = loopKWhPerKg + asuKWhPerKg;
    const outParts = parts
      .map(x => ({
        part: x.part, unit: x.unit, material: x.material,
        kg: x.kgPlant / S, usdMaterials: x.usdMaterialsPlant / S, manufacturing: x.manufacturing,
        usd: x.usdPlant / S, note: x.note,
      }))
      .sort((a, b) => b.usd - a.usd);
    const fmt = (v, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
    return {
      params: p,
      feasible: true,
      basis: 'per kg NH₃/day',
      plantKgPerDay: S,
      flexible: p.flexible,
      loop: {
        pressureBar: L.P, catalyst: p.catalyst, outletC: L.cat.outletC, separatorC: L.sorbent ? null : p.separatorC,
        yEquilibrium: L.yEq, yOut: L.yOut, yIn: L.yIn, recycleMolPerMolNH3: L.circ, singlePassConversion: (L.yOut - L.yIn) / (1 + L.yOut),
        refrigerationCop: L.cop, catalystM3PerTpd: catalystM3 / sizeRatio, converterWallMm: conv.wallMm, h2LossKgPerKgNH3: L.h2LossKgPerKg,
        bufferMinutes: bufferMin, standbyKWhPerKg,
      },
      energyKWhPerKg: { ...L.energy, standby: standbyKWhPerKg, psa: asuKWhPerKg },
      byUnit,
      parts: outParts,
      installedUsdPerKgDay,
      materialsUsdPerKgDay,
      idiotIndex: installedUsdPerKgDay / materialsUsdPerKgDay,
      kWhPerKg,
      kpis: [
        { label: 'Installed', value: `$${fmt(installedUsdPerKgDay)}`, sub: `per kg NH₃/day at ${fmt(S)} kg/day (loop $${fmt(byUnit.ammonia.installedUsdPerKgDay)}, N₂ $${fmt(byUnit.asu.installedUsdPerKgDay)})` },
        { label: 'Energy', value: `${fmt(kWhPerKg, 2)} kWh/kg`, sub: `loop ${fmt(loopKWhPerKg, 2)} + N₂ ${fmt(asuKWhPerKg, 2)}` },
        { label: 'Idiot index', value: `${fmt(installedUsdPerKgDay / materialsUsdPerKgDay, 0)}×`, sub: `raw materials $${fmt(materialsUsdPerKgDay, 1)} per kg/day` },
        { label: 'Loop', value: `${L.P} bar, ${p.catalyst === 'ru' ? 'Ru' : 'Fe'}`, sub: `NH₃ ${fmt(L.yIn * 100, 1)}→${fmt(L.yOut * 100, 1)}%, recycle ${fmt(L.circ, 1)}×` },
        { label: 'Operation', value: p.flexible ? 'sun-following' : 'baseload', sub: p.flexible ? `turndown ${p.minTurndown * 100}%, ${fmt(bufferMin)} min buffer` : 'firmed by battery + H₂ buffer' },
      ],
      vsRecipe: {
        ammonia: { capexFactor: byUnit.ammonia.installedUsdPerKgDay / RECIPE.ammonia.usdPerKgDay, energyFactor: loopKWhPerKg / RECIPE.ammonia.kWhPerKg },
        asu: { capexFactor: byUnit.asu.installedUsdPerKgDay / RECIPE.asu.usdPerKgDay, energyFactor: asuKWhPerKg / RECIPE.asu.kWhPerKg },
      },
    };
  }

  function engineScaleFactor(sizeKgPerDay) {
    const f = (sizeKgPerDay / RECIPE.ammonia.refKgPerDay) ** (ENGINE_SCALE.exponent - 1);
    return Math.max(ENGINE_SCALE.floorFactor, Math.min(1, f));
  }

  // What the company simulator needs: { ammonia, asu } factors vs the recipe, per kg NH₃/day.
  // opts.sizeKgPerDay: cost the design at that size and compare with the recipe scaled the way the
  // engine scales it (default: the recipe's reference size, where the engine's scale factor is 1).
  function simulatorOverride(params = {}, opts = {}) {
    const size = Number(opts.sizeKgPerDay) > 0 ? Number(opts.sizeKgPerDay) : RECIPE.ammonia.refKgPerDay;
    const d = design({ ...params, plantKgPerDay: size });
    const sf = engineScaleFactor(size);
    const out = {};
    for (const unit of ['ammonia', 'asu']) {
      out[unit] = {
        capexFactor: d.byUnit[unit].installedUsdPerKgDay / (RECIPE[unit].usdPerKgDay * sf),
        energyFactor: d.byUnit[unit].kWhPerKg / RECIPE[unit].kWhPerKg,
        flexible: d.flexible,
      };
    }
    return out;
  }

  // Loop-only levelized $/kg NH₃ (24 h basis: annualized loop + N₂ capex + their electricity) over a
  // pressure grid — the screening optimum. Storage and oversizing are the company simulator's job.
  function optimizePressure(params = {}, { usdPerKWh = 0.04, pressures = null } = {}) {
    const grid = pressures || Array.from({ length: 23 }, (_, i) => 30 + 10 * i);
    const curve = [];
    let best = null;
    for (const P of grid) {
      const d = design({ ...params, loopPressureBar: P });
      const p = d.params;
      const crf = p.discountRate / (1 - (1 + p.discountRate) ** -p.lifeYears);
      const usdPerKg = (d.installedUsdPerKgDay * crf) / 365 + d.kWhPerKg * usdPerKWh;
      const row = { pressureBar: P, usdPerKg, installedUsdPerKgDay: d.installedUsdPerKgDay, kWhPerKg: d.kWhPerKg, recycle: d.loop.recycleMolPerMolNH3 };
      curve.push(row);
      if (Number.isFinite(usdPerKg) && (!best || usdPerKg < best.usdPerKg)) best = row;
    }
    return { best, curve };
  }

  return {
    id: 'haber-bosch',
    name: 'Sun-tolerant ammonia loop',
    summary: 'Haber-Bosch loop + PSA nitrogen built up from equilibrium, compression, refrigeration and vessel physics; baseload or sun-following.',
    units: ['ammonia', 'asu'],
    product: 'ammonia',
    RECIPE,
    ENGINE_SCALE,
    DEFAULTS,
    PRESETS,
    CONTROLS,
    equilibriumK,
    equilibriumNH3,
    nh3VapourBar,
    vessel: (V, P, params = {}, lOverD) => vessel(V, P, merge(params), lOverD),
    bufferMinutes: params => bufferMinutes(merge(params)),
    design,
    engineScaleFactor,
    simulatorOverride,
    optimizePressure,
  };
});
