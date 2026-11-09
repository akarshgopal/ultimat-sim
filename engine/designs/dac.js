// Solar-matched direct air capture (DAC) unit — first-principles parametric design.
//
// Goal: the cheapest kg of CO₂ for e-fuels (methanol, Sabatier methane) from a unit that runs only
// while the sun shines and is powered entirely by PV. The design is a temperature–vacuum swing
// (TVSA) solid-sorbent contactor; the liquid KOH + calciner route is screened in ALTERNATIVES and
// rejected for this duty (900 °C heat, no heat pump, calciner cannot start/stop daily).
//
// What decides $/kg CO₂:
//   • air side — capture fraction and face velocity set the air volume per kg CO₂, the channel
//     length needed (laminar-channel mass transfer + sorbent uptake resistance) and the pressure
//     drop → fan kWh. Faster air → smaller contactor, more fan energy;
//   • sorbent — working capacity × contactor volume sets the adsorption time; adsorption time ÷
//     cycle time sets how much contactor (and sorbent, chamber steel, doors) sits idle desorbing;
//   • regeneration — reaction enthalpy + sensible heat of sorbent and hardware + co-adsorbed water,
//     supplied by a heat pump or resistive heaters from PV; a vacuum pump lifts CO₂ to 1 atm;
//   • sorbent life — cycles before amine oxidation → replacement $/kg CO₂.
// Capex is a bill of materials at data/bom.js commodity prices × explicit manufacturing factors,
// per kg CO₂/day of 24 h nameplate (the basis the company simulator uses; its utilization model
// then oversizes flexible units for sun hours).
//
// Recipe basis (data/pathways.js `methanol`, `sabatier`, `coastal` flowsheets, all built from
// data/tea-screening.js packs):
//   dac / dac-solid node  $800 per kg CO₂/day (packs.dac), 0.50 kWh_e/kg CO₂ (node kWh ÷ CO₂ edge),
//                         1.50 kWh_th/kg CO₂ regeneration heat (pathway heatKWhPerKg ÷ CO₂ edge),
//                         0.02 kg/kg CO₂ sorbent makeup at $2/kg (consumables feed);
//   gas-blower node       $1.5 per Nm³/day × 1,339 Nm³ air per kg CO₂ = $2,008 per kg CO₂/day and
//                         0.001 kWh/Nm³ = 1.34 kWh/kg CO₂ (a generic 3.6 kPa process blower).
// The flowsheet nodes themselves read $16,000 per kg product/day because the demo cases fix the
// DAC at 100 kg CO₂/day for a 5 kg/day plant (6.9 or 13.7 kg CO₂/day needed): ×14.6 (methanol) and
// ×7.3 (methane) over the pack. The factors here are relative to the pack (as electrolyzer.js is
// relative to its pack), so one factor per unit is right in every pathway that contains it.
//
// Screening estimates with explicit, overridable assumptions (DEFAULTS). Not a vendor quote.
(function exposeDacDesign(root, factory) {
  const node = typeof require === 'function';
  const api = factory(
    node ? require('../../data/bom.js') : root.FoundryBom,
    node ? require('../utilization.js') : root.FoundryUtilization,
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.FoundryDesigns = root.FoundryDesigns || {};
    root.FoundryDesigns[api.id] = api;
  }
})(globalThis, (Bom, Utilization) => {
  const R = 8.314462618; // J/mol·K
  const M_CO2 = 0.04401; // kg/mol
  const M_AIR = 0.028965; // kg/mol
  const M_H2O = 0.018015; // kg/mol
  const P0 = 101325; // Pa
  const SECONDS_PER_DAY = 86400;
  const STEEL_CP = 0.49; // kJ/kg·K
  const STEEL_DENSITY = 7850; // kg/m³

  // Recipe basis per kg CO₂/day and per kg CO₂ (see header). One entry per flowsheet unit.
  const RECIPE_DAC = Object.freeze({
    usdPerKgDay: 800, // data/tea-screening.js packs.dac.capexIntensity
    kWhPerKg: 0.5, // node electricity (methanol 0.687/1.37, methane 1.37/2.74)
    heatKWhPerKg: 1.5, // pathway heatKWhPerKg ÷ CO₂ edge (methanol 2.06/1.37, methane 4.11/2.74)
    consumablesKgPerKg: 0.02, // consumables feed ÷ CO₂ edge (0.0275/1.37, 0.0549/2.74)
    consumablesUsdPerKg: 2,
  });
  const RECIPE_BLOWER_NM3_PER_KG = 1 / (0.9 * 422.45e-6 * (44.01 / 28.965)) / 1.2929; // 90 % capture at 422 ppm
  const RECIPE = Object.freeze({
    'dac-solid': Object.freeze({ ...RECIPE_DAC, pathwayId: 'methanol', product: 'CO₂', demoOversize: 14.6 }),
    dac: Object.freeze({ ...RECIPE_DAC, pathwayId: 'sabatier', product: 'CO₂', demoOversize: 7.3 }),
    'gas-blower': Object.freeze({
      usdPerKgDay: 1.5 * RECIPE_BLOWER_NM3_PER_KG, // packs['gas-blower'] $1.5/(Nm³/day)
      kWhPerKg: 0.001 * RECIPE_BLOWER_NM3_PER_KG, // case blowerKWhPerNm3 0.001
      pathwayId: 'methanol',
      product: 'CO₂',
      airNm3PerKg: RECIPE_BLOWER_NM3_PER_KG,
    }),
  });

  const DEFAULTS = Object.freeze({
    // ── Air ────────────────────────────────────────────────────────────────────────────────
    co2Ppm: 420, // NOAA global mean 2024 ≈ 423 ppm; recipes use 422.45
    ambientC: 25, // sunbelt daytime mean
    // ── Contactor (parallel-plate sorbent laminate, laminar channels) ───────────────────────
    // Deeper beds share one set of doors over more sorbent, so high capture pays while ΔP stays low.
    captureFraction: 0.85, // cycle-average CO₂ removed from the air passing through (recipe 0.9)
    faceVelocityMPerS: 2.5, // superficial air speed at the contactor face (solid-sorbent DAC 1–3 m/s)
    channelGapMm: 2.0, // gap between sorbent sheets (hydraulic diameter = 2 × gap)
    wallThicknessMm: 0.5, // sorbent sheet (fibre/laminate) thickness
    // Sherwood number, fully developed laminar flow between parallel plates, constant wall
    // concentration (Shah & London): Sh = 7.54 on d_h = 2·gap. D(CO₂–air) 1.6e-5 m²/s at 25 °C.
    sherwood: 7.54,
    diffusivityM2PerS: 1.6e-5,
    airViscosityPaS: 1.85e-5,
    entryExitK: 1.5, // velocity heads lost at channel entry + exit
    fixedPressureDropPa: 40, // rain hood, coarse filter, open dampers, outlet plenum
    fanEfficiency: 0.6, // large low-pressure axial fan × motor × VFD
    minDepthM: 0.1, // thinnest practical laminate block
    moduleFaceM2: 6, // one contactor module (doors, chamber, fan) face area
    // ── Sorbent ────────────────────────────────────────────────────────────────────────────
    sorbent: 'amine-fiber',
    sorbents: Object.freeze({
      'amine-silica': Object.freeze({
        label: 'Amine (PEI/TEPA) on porous silica — first-generation',
        eqCapacityMolPerKg: 1.5, // humid air, 25 °C, 400 ppm (PEI/silica literature 1–2 mmol/g)
        wallDensityKgPerM3: 600,
        heatOfAdsorptionKJPerMol: 75,
        cpKJPerKgK: 1.2,
        regenC: 100,
        waterMolPerMolCO2: 2.5, // co-adsorbed water desorbed each cycle (humid coastal air)
        uptakeCoeffMPerS: 0.006, // sorbent-side surface uptake, cycle average (pore diffusion)
        usdPerKg: 50, // delivered specialty sorbent price order (Sabatino 2021 / IEA range $20–100/kg)
        amineFrac: 0.4,
        support: 'silica',
        lifeCycles: 5000, // oxidative amine loss at 100 °C in air
        note: 'mature, cheap ingredients, but slow pellets/thick layers and high water uptake',
      }),
      'amine-fiber': Object.freeze({
        label: 'Amine on polymer/cellulose fibre laminate — lean target',
        eqCapacityMolPerKg: 2.0, // amine-grafted fibre/cellulose 1.5–2.5 mmol/g at 400 ppm
        wallDensityKgPerM3: 350,
        heatOfAdsorptionKJPerMol: 70,
        cpKJPerKgK: 1.5,
        regenC: 95,
        waterMolPerMolCO2: 1.0, // hydrophobic support; lower in desert air
        uptakeCoeffMPerS: 0.02, // thin (0.5 mm) open fibre sheet, short diffusion path
        usdPerKg: 8, // target at 10 kt/yr sorbent production (≈3× materials)
        amineFrac: 0.4,
        support: 'polymer',
        lifeCycles: 20000, // with O₂-free (vacuum/steam) regeneration and antioxidant additives
        note: 'needs proof of ≥ 20,000 cycles under daily thermal cycling',
      }),
      'amine-mof': Object.freeze({
        label: 'Diamine-appended MOF (step-shaped isotherm)',
        eqCapacityMolPerKg: 2.8,
        wallDensityKgPerM3: 450,
        heatOfAdsorptionKJPerMol: 70,
        cpKJPerKgK: 1.0,
        regenC: 100,
        waterMolPerMolCO2: 1.5,
        uptakeCoeffMPerS: 0.012,
        usdPerKg: 40, // linker synthesis dominates; $10/kg is a hoped-for scale price
        amineFrac: 0.3,
        support: 'mof-linker',
        lifeCycles: 10000,
        note: 'capacity is high but price and humid-air stability are not yet proven',
      }),
    }),
    // Raw-material prices for sorbent ingredients not in data/bom.js (floor of a purchased item).
    sorbentIngredients: Object.freeze({
      amine: Object.freeze({ usdPerKg: 2.5, note: 'ethyleneamines / PEI bulk ~$2–3/kg (chemical spot quotes)' }),
      silica: Object.freeze({ usdPerKg: 1.0, note: 'precipitated silica ~$0.8–1.5/kg' }),
      'mof-linker': Object.freeze({ usdPerKg: 10, note: 'dobpdc-type linker + Mg salt at bulk chemical scale' }),
    }),
    adsorbUtilization: 0.6, // stop adsorption at this share of equilibrium loading (keeps capture high)
    // ── Regeneration (temperature–vacuum swing) ─────────────────────────────────────────────
    desorbMin: 10, // heat-up + CO₂ release (0.5 mm fibre sheets heat in seconds; steam supply and evacuation limit)
    coolMin: 10, // cool-down / re-pressurize before air is readmitted (protects amines from O₂)
    // Total chamber pressure while desorbing. Below desorbCO2KPa no purge is needed; above it, steam
    // must dilute the CO₂ to that partial pressure (steam/CO₂ = (p − p_CO₂)/p_CO₂ mol/mol). Deeper
    // vacuum: less steam, more pump work and much heavier doors (Δp on flat panels).
    vacuumKPa: 50, // mild vacuum + steam purge; at 10× cheaper PV the optimum moves toward 1 atm steam stripping
    desorbCO2KPa: 10, // CO₂ partial pressure at which amines give up their working capacity at ~95 °C
    steamHeatRecoveryFrac: 0.5, // purge-steam latent heat returned by condensing it against feed water (MVR)
    vacuumEfficiency: 0.4, // isothermal efficiency of claw/liquid-ring pump
    plenumDepthM: 0.15, // void per m² face outside the laminate, evacuated each cycle
    heatLossFrac: 0.1,
    heatRecoveryFrac: 0.3, // sensible heat passed bed-to-bed (hot bed preheats the next)
    // In-chamber steel/aluminium heated each cycle (frames, HX tubes). The vacuum shell itself is
    // lined on the inside so it stays near ambient: heating ~200 kg/m² of doors every cycle would
    // add ~1 kWh_th/kg CO₂.
    hardwareHeatedKgPerM2: 8,
    insulationKgPerM2Panel: 2, // internal liner (closed-cell foam / mineral wool), priced as polymer
    heatSupply: 'heat-pump',
    heatSupplies: Object.freeze({
      resistive: Object.freeze({ label: 'Resistive heaters / electrode steam boiler', carnotFraction: null, steelKgPerKWth: 1.5, copperKgPerKWth: 0.3, nickelKgPerKWth: 0.01, note: 'COP 1; nearly free equipment' }),
      'heat-pump': Object.freeze({ label: 'Air-source high-temperature heat pump (water/steam out)', carnotFraction: 0.5, steelKgPerKWth: 6, copperKgPerKWth: 1.2, aluminiumKgPerKWth: 1.5, note: 'COP ≈ ½ Carnot; industrial 100–120 °C units 2024' }),
    }),
    heatPumpLiftC: 10, // condensing above regen T and evaporating below ambient
    heatPeakFactor: 1.3, // staggered beds: peak heat rate ÷ cycle-average
    hxAluminiumKgPerKWth: 1.0, // in-bed heat exchanger fins/tubes per kW_th peak
    auxKWhPerKg: 0.02, // dampers, condensate pumps, controls, CO₂ dryer fans
    // ── Vacuum chamber: stiffened flat steel panels under Δp = 1 atm − vacuum ───────────────
    // Plate between stiffeners: σ = ½·Δp·(b/t)²  →  t = b·√(Δp / 2σ)   (long plate, fixed edges)
    // Stiffeners (I-section, depth h = span/15, A ≈ 3Z/h) spanning the module: kg/m² = ρ·5.6·Δp·span/σ
    allowableStressMPa: 100, // welded S355 at ~10⁵ pressure cycles (fatigue, not yield, governs)
    stiffenerSpacingM: 0.15,
    minPlateMm: 1.5, // handling / corrosion allowance
    chamberOverhead: 1.25, // flanges, seals, hinges, frames
    // ── Other hardware per m² of contactor face ─────────────────────────────────────────────
    structureSteelKgPerM2: 25, // racking, walkways
    concreteKgPerM2: 150, // pads
    pipingStainlessKgPerM2: 3, // CO₂ header, condensate, steam/water
    fanSteelKgPerM3s: 12, // axial fan + housing per m³/s (cooling-tower fans ~8–15)
    motorKgPerKW: Object.freeze({ steel: 5, copper: 1.5 }),
    vacuumPumpKgPerKW: Object.freeze({ steel: 15, copper: 1.5 }),
    electricalCopperKgPerKW: 1.0, // cabling, switchgear per connected kW
    electronicsUsdPerKW: 30, // VFDs, PLC, analyzers per connected kW
    // ── Manufacturing factors: finished part cost ÷ raw-material cost ───────────────────────
    manufacturing: Object.freeze({
      chamber: 2.5, // roll-formed sheet, welded seams
      doors: 3.0,
      structure: 2.0,
      civil: 1.5,
      piping: 3.0,
      fans: 3.0,
      vacuum: 4.0,
      heatSupply: 4.0,
      hx: 3.0,
      electrical: 1.5,
    }),
    labourUsdPerHour: 40,
    assemblyHoursPerModule: 16,
    installFactor: 1.2, // site erection, commissioning, controls integration
    fixedOmFracPerYear: 0.03,
    operatingHoursPerDay: 8, // sun-following: cycles only while PV runs
    lifeYears: 20,
  });

  // The liquid route, screened from literature (not modelled part by part): why it is not chosen.
  const ALTERNATIVES = Object.freeze({
    'koh-calciner': Object.freeze({
      label: 'KOH solution + Ca-loop calciner (liquid solvent)',
      usdPerKgDay: 260, // Keith et al. 2018: ~$700M for 0.98 Mt/yr nth-plant → ~$260/(kg/day)
      heatKWhThPerKg: 1.46, // 5.25 GJ/t at ~900 °C: resistive only, no heat pump
      electricKWhPerKg: 0.37,
      flexible: false, // calciner/slaker run steady; would need a 900 °C thermal store
      note: 'cheap concrete/PVC contactors, but the 900 °C calciner cannot follow the sun and its heat cannot be pumped',
    }),
    'moisture-swing': Object.freeze({
      label: 'Quaternary-ammonium resin, moisture swing',
      usdPerKgDay: null,
      heatKWhThPerKg: 0, // regenerated by wetting; evaporation draws ambient heat
      electricKWhPerKg: 0.3,
      flexible: true,
      note: 'little heat, but dilute (few %) CO₂ product, ~5–20 kg water evaporated per kg CO₂ and slow kinetics',
    }),
  });

  const PRESETS = Object.freeze({
    today: Object.freeze({
      label: 'Today: amine-on-silica TVSA modules, resistive/steam heat (first commercial plants)',
      params: Object.freeze({
        sorbent: 'amine-silica',
        captureFraction: 0.8,
        faceVelocityMPerS: 1.0,
        channelGapMm: 1.5,
        wallThicknessMm: 1.5,
        fixedPressureDropPa: 80,
        fanEfficiency: 0.5,
        moduleFaceM2: 4,
        adsorbUtilization: 0.6,
        desorbMin: 60,
        coolMin: 30,
        vacuumKPa: 15,
        steamHeatRecoveryFrac: 0,
        heatRecoveryFrac: 0,
        hardwareHeatedKgPerM2: 25,
        heatSupply: 'resistive',
        auxKWhPerKg: 0.05,
        stiffenerSpacingM: 0.3,
        chamberOverhead: 1.4,
        structureSteelKgPerM2: 80,
        concreteKgPerM2: 500,
        pipingStainlessKgPerM2: 10,
        electronicsUsdPerKW: 300,
        manufacturing: { chamber: 7, doors: 8, structure: 3, civil: 2.5, piping: 6, fans: 6, vacuum: 8, heatSupply: 6, hx: 6, electrical: 3 },
        assemblyHoursPerModule: 300,
        installFactor: 1.6,
        fixedOmFracPerYear: 0.04,
      }),
    }),
    lean: Object.freeze({
      label: 'Lean solar-matched target: amine-fibre laminate, light chambers, heat pump',
      params: Object.freeze({}),
    }),
  });

  const CONTROLS = Object.freeze([
    { key: 'sorbent', label: 'Sorbent', options: [['amine-fiber', 'Amine fibre laminate'], ['amine-silica', 'Amine on silica'], ['amine-mof', 'Amine MOF']] },
    { key: 'heatSupply', label: 'Regeneration heat', options: [['heat-pump', 'Heat pump'], ['resistive', 'Resistive']] },
    { key: 'faceVelocityMPerS', label: 'Face velocity', unit: 'm/s', min: 0.5, max: 4, step: 0.1, hint: 'faster air: smaller contactor, more fan kWh' },
    { key: 'captureFraction', label: 'Capture fraction', unit: '', min: 0.3, max: 0.95, step: 0.05, hint: 'lower: shallower beds, more air per kg' },
    { key: 'channelGapMm', label: 'Channel gap', unit: 'mm', min: 0.5, max: 5, step: 0.1, hint: 'narrow: shallow beds, more sorbent per m³' },
    { key: 'desorbMin', label: 'Desorption time', unit: 'min', min: 5, max: 120, step: 5, hint: 'faster heating: less idle contactor' },
    { key: 'heatRecoveryFrac', label: 'Bed-to-bed heat recovery', unit: '', min: 0, max: 0.7, step: 0.05, hint: 'sensible heat reused' },
    { key: 'vacuumKPa', label: 'Desorption pressure', unit: 'kPa', min: 5, max: 101, step: 1, hint: 'deep vacuum: heavy doors, less steam' },
    { key: 'moduleFaceM2', label: 'Module face', unit: 'm²', min: 0.5, max: 12, step: 0.5, hint: 'smaller: shorter stiffener spans, more labour' },
    { key: 'installFactor', label: 'Install factor', unit: '×', min: 1, max: 2, step: 0.05, hint: 'site works on top of equipment' },
  ]);

  function merge(params = {}) {
    const p = { ...DEFAULTS, ...params };
    p.manufacturing = { ...DEFAULTS.manufacturing, ...(params.manufacturing || {}) };
    p.sorbents = { ...DEFAULTS.sorbents, ...(params.sorbents || {}) };
    p.heatSupplies = { ...DEFAULTS.heatSupplies, ...(params.heatSupplies || {}) };
    p.sorbentIngredients = { ...DEFAULTS.sorbentIngredients, ...(params.sorbentIngredients || {}) };
    p.motorKgPerKW = { ...DEFAULTS.motorKgPerKW, ...(params.motorKgPerKW || {}) };
    p.vacuumPumpKgPerKW = { ...DEFAULTS.vacuumPumpKgPerKW, ...(params.vacuumPumpKgPerKW || {}) };
    return p;
  }

  const commodity = name => Bom.COMMODITIES[name].usdPerKg;

  // Sorbent materials floor ($/kg): amine + support at raw-material prices.
  function sorbentFloorUsdPerKg(s, p) {
    const support = s.support in Bom.COMMODITIES ? commodity(s.support) : p.sorbentIngredients[s.support].usdPerKg;
    return s.amineFrac * p.sorbentIngredients.amine.usdPerKg + (1 - s.amineFrac) * support;
  }

  // Air-side physics of one contactor channel. Returns depth, pressure drop, fan kWh per kg CO₂.
  function airSide(p) {
    const Tamb = p.ambientC + 273.15;
    const rho = (P0 * M_AIR) / (R * Tamb);
    const wCO2 = p.co2Ppm * 1e-6 * (M_CO2 / M_AIR); // kg CO₂ per kg air
    const gap = p.channelGapMm / 1000;
    const wall = p.wallThicknessMm / 1000;
    const dh = 2 * gap;
    const porosity = gap / (gap + wall);
    const u = p.faceVelocityMPerS / porosity; // channel velocity
    // Overall transfer coefficient: gas film (Sh·D/d_h) in series with sorbent uptake.
    const kFilm = (p.sherwood * p.diffusivityM2PerS) / dh;
    const kOverall = 1 / (1 / kFilm + 1 / p.sorbent.uptakeCoeffMPerS);
    // Capture φ = 1 − exp(−NTU), NTU = k · (2/gap) · L / u  (wall area per channel volume = 2/gap).
    const ntu = -Math.log(1 - p.captureFraction);
    const depth = Math.max(p.minDepthM, (ntu * u * gap) / (2 * kOverall));
    const re = (rho * u * dh) / p.airViscosityPaS;
    const dpFriction = (12 * p.airViscosityPaS * u * depth) / gap ** 2; // plane Poiseuille
    const dpEntry = p.entryExitK * 0.5 * rho * u * u;
    const dp = dpFriction + dpEntry + p.fixedPressureDropPa;
    const airM3PerKg = 1 / (p.captureFraction * rho * wCO2);
    const fanKWhPerKg = (airM3PerKg * dp) / p.fanEfficiency / 3.6e6;
    return { rho, wCO2, porosity, u, kFilm, kOverall, depth, re, dpFriction, dpEntry, dp, airM3PerKg, fanKWhPerKg };
  }

  function design(params = {}) {
    const p = merge(params);
    const s = p.sorbents[p.sorbent] || DEFAULTS.sorbents['amine-fiber'];
    p.sorbent = p.sorbents[p.sorbent] ? p.sorbent : 'amine-fiber';
    const hs = p.heatSupplies[p.heatSupply] || DEFAULTS.heatSupplies['heat-pump'];
    const air = airSide({ ...p, sorbent: s });

    // ── Cycle and inventory, per m² of contactor face ─────────────────────────────────────
    const sorbentKgPerM2 = air.depth * (1 - air.porosity) * s.wallDensityKgPerM3;
    const workingKgPerKg = s.eqCapacityMolPerKg * M_CO2 * p.adsorbUtilization; // kg CO₂ / kg sorbent / cycle
    const co2KgPerM2Cycle = sorbentKgPerM2 * workingKgPerKg;
    const captureKgPerM2s = p.captureFraction * air.rho * air.wCO2 * p.faceVelocityMPerS;
    const adsorbMin = co2KgPerM2Cycle / captureKgPerM2s / 60;
    const cycleMin = adsorbMin + p.desorbMin + p.coolMin;
    const onAirFraction = adsorbMin / cycleMin;
    // Per kg CO₂/day of 24 h nameplate.
    const activeFaceM2 = 1 / SECONDS_PER_DAY / captureKgPerM2s;
    const faceM2 = activeFaceM2 / onAirFraction;
    const modules = faceM2 / p.moduleFaceM2;
    const sorbentKg = faceM2 * sorbentKgPerM2;
    const airM3s = activeFaceM2 * p.faceVelocityMPerS;

    // ── Regeneration energy per kg CO₂ ────────────────────────────────────────────────────
    const regenK = s.regenC - p.ambientC;
    const kJPerMolToKWhPerKg = 1 / M_CO2 / 3600; // kJ per mol CO₂ → kWh per kg CO₂
    const reactionKWh = s.heatOfAdsorptionKJPerMol * kJPerMolToKWhPerKg;
    const sensibleSorbentKWh = (s.cpKJPerKgK * regenK) / workingKgPerKg / 3600;
    const sensibleHardwareKWh = (p.hardwareHeatedKgPerM2 * STEEL_CP * regenK) / co2KgPerM2Cycle / 3600;
    // Co-adsorbed water: desorption enthalpy ≈ condensation enthalpy (≈ 44 kJ/mol).
    const waterKWh = s.waterMolPerMolCO2 * 44 * kJPerMolToKWhPerKg;
    // Purge steam needed to hold CO₂ at desorbCO2KPa when the chamber is above that pressure.
    const pTot = Math.max(p.vacuumKPa, p.desorbCO2KPa);
    const steamMolPerMol = (pTot - p.desorbCO2KPa) / p.desorbCO2KPa;
    const steamKWh = steamMolPerMol * 40.7 * kJPerMolToKWhPerKg * (1 - p.steamHeatRecoveryFrac);
    const sensible = (sensibleSorbentKWh + sensibleHardwareKWh) * (1 - p.heatRecoveryFrac);
    const heatThKWhPerKg = (reactionKWh + sensible + waterKWh + steamKWh) * (1 + p.heatLossFrac);
    let cop = 1;
    if (hs.carnotFraction) {
      const Th = s.regenC + p.heatPumpLiftC + 273.15;
      const Tc = p.ambientC - p.heatPumpLiftC + 273.15;
      cop = Math.max(1, hs.carnotFraction * Th / (Th - Tc));
    }
    const regenKWhPerKg = heatThKWhPerKg / cop; // PV kWh spent on heat
    // Vacuum: evacuate the void each cycle, then lift desorbed CO₂ (+ residual water) to 1 atm.
    const lnRatio = Math.log(P0 / Math.min(P0, pTot * 1000));
    const voidM3PerM2 = air.depth * air.porosity + p.plenumDepthM;
    const evacKWh = (P0 * voidM3PerM2 * lnRatio) / co2KgPerM2Cycle / p.vacuumEfficiency / 3.6e6;
    const liftKWh = ((R * (s.regenC + 273.15) / M_CO2) * lnRatio) / p.vacuumEfficiency / 3.6e6;
    const vacuumKWhPerKg = evacKWh + liftKWh;
    const electricKWhPerKg = vacuumKWhPerKg + p.auxKWhPerKg; // dac node electricity (excl. fans, heat)
    const kWhPerKg = air.fanKWhPerKg + electricKWhPerKg + regenKWhPerKg;

    // ── Power ratings per kg CO₂/day (24 h nameplate) ─────────────────────────────────────
    const fanKW = air.fanKWhPerKg / 24;
    const vacuumKW = (vacuumKWhPerKg / 24) * p.heatPeakFactor;
    const heatKWth = (heatThKWhPerKg / 24) * p.heatPeakFactor;
    const heatElecKW = heatKWth / cop;
    const connectedKW = fanKW + vacuumKW + heatElecKW + p.auxKWhPerKg / 24;

    // ── Vacuum chamber steel per m² of face (square module, doors on both faces) ──────────
    const dpShell = Math.max(0, P0 - pTot * 1000); // Pa
    const sigma = p.allowableStressMPa * 1e6;
    const side = Math.sqrt(p.moduleFaceM2);
    const chamberDepth = air.depth + 2 * p.plenumDepthM;
    const panelKgPerM2 = span => {
      const plateM = Math.max(p.minPlateMm / 1000, p.stiffenerSpacingM * Math.sqrt(dpShell / (2 * sigma)));
      return STEEL_DENSITY * (plateM + (5.6 * dpShell * span) / sigma);
    };
    const doorsKgPerM2Face = 2 * panelKgPerM2(side) * p.chamberOverhead;
    const shellKgPerM2Face = (4 * side * chamberDepth * panelKgPerM2(chamberDepth) * p.chamberOverhead) / p.moduleFaceM2;
    const panelM2PerM2Face = 2 + (4 * side * chamberDepth) / p.moduleFaceM2;

    // ── Bill of materials per kg CO₂/day ──────────────────────────────────────────────────
    const parts = [];
    const add = (part, material, kg, manufacturing, note, group = 'dac') => {
      const usdMaterials = kg * commodity(material);
      parts.push({ part, material, kg, usdMaterials, manufacturing, usd: usdMaterials * manufacturing, note, group });
    };
    const buy = (part, usd, usdMaterials, note, group = 'dac') => {
      parts.push({ part, material: null, kg: null, usdMaterials, manufacturing: usdMaterials > 0 ? usd / usdMaterials : null, usd, note, group });
    };
    const sorbentFloor = sorbentFloorUsdPerKg(s, p);
    buy('Sorbent fill (purchased)', sorbentKg * s.usdPerKg, sorbentKg * sorbentFloor,
      `${s.label}; ${sorbentKg.toFixed(2)} kg at $${s.usdPerKg}/kg (floor $${sorbentFloor.toFixed(2)}/kg)`);
    const m = p.manufacturing;
    add('Chamber side walls', 'steel', faceM2 * shellKgPerM2Face, m.chamber, `${shellKgPerM2Face.toFixed(0)} kg/m² face at Δp ${(dpShell / 1000).toFixed(0)} kPa`);
    add('Vacuum doors (both faces)', 'steel', faceM2 * doorsKgPerM2Face, m.doors, `${doorsKgPerM2Face.toFixed(0)} kg/m² face, ${side.toFixed(2)} m span`);
    add('Internal insulation liner', 'polymer', faceM2 * panelM2PerM2Face * p.insulationKgPerM2Panel, m.chamber, 'keeps the shell cold through the thermal swing');
    add('Structure / racking', 'steel', faceM2 * p.structureSteelKgPerM2, m.structure, 'module racks, walkways');
    add('Foundations', 'concrete', faceM2 * p.concreteKgPerM2, m.civil, 'pads');
    add('Process piping', 'stainless-steel', faceM2 * p.pipingStainlessKgPerM2, m.piping, 'CO₂ header, condensate, heating loop');
    add('In-bed heat exchanger', 'aluminium', heatKWth * p.hxAluminiumKgPerKWth, m.hx, `${heatKWth.toFixed(3)} kW_th peak`);
    add('Heat supply: steel', 'steel', heatKWth * (hs.steelKgPerKWth || 0), m.heatSupply, hs.label);
    add('Heat supply: copper', 'copper', heatKWth * (hs.copperKgPerKWth || 0), m.heatSupply, hs.label);
    if (hs.aluminiumKgPerKWth) add('Heat supply: aluminium', 'aluminium', heatKWth * hs.aluminiumKgPerKWth, m.heatSupply, 'evaporator/condenser');
    if (hs.nickelKgPerKWth) add('Heat supply: heater elements', 'nickel', heatKWth * hs.nickelKgPerKWth, m.heatSupply, 'NiCr elements');
    add('Vacuum pumps + condenser: steel', 'steel', vacuumKW * p.vacuumPumpKgPerKW.steel, m.vacuum, `${p.vacuumKPa} kPa, ${(vacuumKW * 1000).toFixed(1)} W`);
    add('Vacuum pumps: motor copper', 'copper', vacuumKW * p.vacuumPumpKgPerKW.copper, m.vacuum, '');
    add('Electrical: cabling, switchgear', 'copper', connectedKW * p.electricalCopperKgPerKW, m.electrical, `${(connectedKW * 1000).toFixed(0)} W connected`);
    buy('Controls, VFDs, analyzers', connectedKW * p.electronicsUsdPerKW, 0, `$${p.electronicsUsdPerKW}/kW connected`);
    // Fans: the recipe's separate `gas-blower` unit.
    add('Fans + housings', 'steel', airM3s * p.fanSteelKgPerM3s, m.fans, `${(airM3s * 1000).toFixed(2)} L/s at ${air.dp.toFixed(0)} Pa`, 'fan');
    add('Fan motors: steel', 'steel', fanKW * p.motorKgPerKW.steel, m.fans, `${(fanKW * 1000).toFixed(1)} W`, 'fan');
    add('Fan motors: copper', 'copper', fanKW * p.motorKgPerKW.copper, m.fans, '', 'fan');
    const labour = modules * p.assemblyHoursPerModule * p.labourUsdPerHour;
    buy('Assembly labour', labour, 0, `${p.assemblyHoursPerModule} h per ${p.moduleFaceM2} m² module`);

    const manufactured = parts.reduce((t, x) => t + x.usd, 0);
    const installedUsdPerKgDay = manufactured * p.installFactor;
    buy(`Install (×${p.installFactor})`, installedUsdPerKgDay - manufactured, 0, 'site erection, commissioning');
    const materialsUsdPerKgDay = parts.reduce((t, x) => t + x.usdMaterials, 0);
    const fanShare = parts.filter(x => x.group === 'fan').reduce((t, x) => t + x.usd, 0) / manufactured;
    const fanUsdPerKgDay = installedUsdPerKgDay * fanShare;
    const dacUsdPerKgDay = installedUsdPerKgDay - fanUsdPerKgDay;
    const fanMaterialsUsdPerKgDay = parts.filter(x => x.group === 'fan').reduce((t, x) => t + x.usdMaterials, 0);

    // Sorbent replacement (consumable): $ per kg CO₂ and kg sorbent per kg CO₂.
    const sorbentKgPerKgCO2 = 1 / (s.lifeCycles * workingKgPerKg);
    const sorbentUsdPerKgCO2 = sorbentKgPerKgCO2 * s.usdPerKg;
    const cyclesPerDay = (p.operatingHoursPerDay * 60) / cycleMin;
    const sorbentLifeYears = s.lifeCycles / cyclesPerDay / 365;

    const kpis = [
      { label: 'Installed', value: `$${installedUsdPerKgDay.toFixed(0)}`, sub: 'per kg CO₂/day (24 h nameplate)' },
      { label: 'Energy', value: `${kWhPerKg.toFixed(2)} kWh/kg`, sub: `fan ${air.fanKWhPerKg.toFixed(2)} + vacuum/aux ${electricKWhPerKg.toFixed(2)} + heat ${heatThKWhPerKg.toFixed(2)} kWh_th ÷ COP ${cop.toFixed(1)}` },
      { label: 'Idiot index', value: `${(installedUsdPerKgDay / materialsUsdPerKgDay).toFixed(1)}×`, sub: `materials $${materialsUsdPerKgDay.toFixed(1)} per kg/day` },
      { label: 'Contactor', value: `${(faceM2 * 1e4).toFixed(0)} cm² face`, sub: `${(air.depth * 100).toFixed(0)} cm deep, ${p.faceVelocityMPerS} m/s, ${air.dp.toFixed(0)} Pa` },
      { label: 'Cycle', value: `${cycleMin.toFixed(0)} min`, sub: `${adsorbMin.toFixed(0)} adsorb / ${p.desorbMin} desorb / ${p.coolMin} cool` },
      { label: 'Sorbent', value: `$${sorbentUsdPerKgCO2.toFixed(3)}/kg CO₂`, sub: `${sorbentKg.toFixed(2)} kg per kg/day, ${sorbentLifeYears.toFixed(1)} yr life` },
    ];

    return {
      params: p,
      sorbent: s,
      basis: 'per kg CO₂/day',
      flexible: true,
      air,
      cycle: { adsorbMin, desorbMin: p.desorbMin, coolMin: p.coolMin, cycleMin, onAirFraction, cyclesPerDay },
      faceM2PerKgDay: faceM2,
      chamber: { dpKPa: dpShell / 1000, doorsKgPerM2Face, shellKgPerM2Face, steelKgPerKgDay: faceM2 * (doorsKgPerM2Face + shellKgPerM2Face) },
      modulesPerKgDay: modules,
      sorbentKgPerKgDay: sorbentKg,
      energy: {
        fanKWhPerKg: air.fanKWhPerKg,
        vacuumKWhPerKg,
        auxKWhPerKg: p.auxKWhPerKg,
        electricKWhPerKg,
        heatThKWhPerKg,
        heat: { reactionKWh, sensibleSorbentKWh, sensibleHardwareKWh, waterKWh, steamKWh },
        steamMolPerMol,
        cop,
        regenKWhPerKg,
      },
      kWhPerKg,
      parts: parts.sort((a, b) => b.usd - a.usd),
      bom: parts,
      materialsUsdPerKgDay,
      installedUsdPerKgDay,
      fanUsdPerKgDay,
      dacUsdPerKgDay,
      fanMaterialsUsdPerKgDay,
      dacMaterialsUsdPerKgDay: materialsUsdPerKgDay - fanMaterialsUsdPerKgDay,
      idiotIndex: installedUsdPerKgDay / materialsUsdPerKgDay,
      sorbentKgPerKgCO2,
      sorbentUsdPerKgCO2,
      sorbentLifeYears,
      kpis,
    };
  }

  // Levelized $/kg CO₂ on PV alone at a site (sun-following, oversized by the utilization model).
  function lcoc(params, site, { pvUsdPerKWp = 758, discountRate = 0.08, pvOmFrac = 20 / 758 } = {}) {
    const d = design(params);
    const kgPerYear = 1e6;
    const energyKWhYr = d.kWhPerKg * kgPerYear;
    const solar = Utilization.siteSolar(site, Utilization.mergeCfg());
    const k24 = d.installedUsdPerKgDay * (kgPerYear / 365);
    const flex = Utilization.flexDesign(solar, energyKWhYr, k24, pvUsdPerKWp);
    const unitCapex = k24 * flex.nameplateFactor;
    const pvCapex = flex.pvKWp * pvUsdPerKWp;
    const af = (1 - (1 + discountRate) ** -d.params.lifeYears) / discountRate;
    const unit = (unitCapex / af + unitCapex * d.params.fixedOmFracPerYear) / kgPerYear;
    const pv = (pvCapex / af + flex.pvKWp * pvUsdPerKWp * pvOmFrac) / kgPerYear;
    return {
      design: d,
      usdPerKg: unit + pv + d.sorbentUsdPerKgCO2,
      parts: { unit, pv, sorbent: d.sorbentUsdPerKgCO2 },
      nameplateFactor: flex.nameplateFactor,
      fullLoadHoursPerDay: flex.fullLoadHoursPerDay,
    };
  }

  // What the company simulator needs. capexFactor / energyFactor / materialsFactor / flexible follow
  // the contract and are what engine/company.js applies. The other keys are ignored by the engine as
  // it stands and are what it would need to price this design fully (docs/designs/dac.md, "Engine
  // changes"):
  //   heatFactor         regeneration PV kWh ÷ the recipe's 1.5 kWh/kg CO₂ pathway heat
  //   consumablesFactor  sorbent replacement $/kg CO₂ ÷ the recipe's 0.02 kg × $2
  //   variableOmFactor   0: the pack's $0.05/kg CO₂ variable O&M is covered by sorbent + fixed O&M
  function simulatorOverride(params) {
    const d = design(params);
    const dac = {
      capexFactor: d.dacUsdPerKgDay / RECIPE_DAC.usdPerKgDay,
      energyFactor: d.energy.electricKWhPerKg / RECIPE_DAC.kWhPerKg,
      flexible: true,
      heatFactor: d.energy.regenKWhPerKg / RECIPE_DAC.heatKWhPerKg,
      consumablesFactor: d.sorbentUsdPerKgCO2 / (RECIPE_DAC.consumablesKgPerKg * RECIPE_DAC.consumablesUsdPerKg),
      variableOmFactor: 0,
      materialsFactor: d.dacMaterialsUsdPerKgDay / RECIPE_DAC.usdPerKgDay,
    };
    return {
      dac: { ...dac },
      'dac-solid': { ...dac },
      'gas-blower': {
        capexFactor: d.fanUsdPerKgDay / RECIPE['gas-blower'].usdPerKgDay,
        energyFactor: d.energy.fanKWhPerKg / RECIPE['gas-blower'].kWhPerKg,
        flexible: true,
        materialsFactor: d.fanMaterialsUsdPerKgDay / RECIPE['gas-blower'].usdPerKgDay,
      },
    };
  }

  return {
    id: 'dac',
    name: 'Solar-matched direct air capture (TVSA sorbent contactor)',
    summary: 'Amine-fibre laminate contactors cycled by a heat pump and vacuum pump on PV, run only while the sun shines.',
    units: ['dac', 'dac-solid', 'gas-blower'],
    product: 'CO₂',
    RECIPE,
    DEFAULTS,
    PRESETS,
    CONTROLS,
    ALTERNATIVES,
    airSide: params => {
      const p = merge(params);
      return airSide({ ...p, sorbent: p.sorbents[p.sorbent] || DEFAULTS.sorbents['amine-fiber'] });
    },
    sorbentFloorUsdPerKg: (sorbentId, params) => {
      const p = merge(params);
      return sorbentFloorUsdPerKg(p.sorbents[sorbentId], p);
    },
    design,
    lcoc,
    simulatorOverride,
  };
});
