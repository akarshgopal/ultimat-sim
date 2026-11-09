// Solar-matched urea synthesis unit (Bosch–Meiser: 2 NH₃ + CO₂ ⇌ NH₂COONH₄ ⇌ CO(NH₂)₂ + H₂O) —
// first-principles parametric design.
//
// Goal: the cheapest kg of solid urea from liquid NH₃ (a solar Haber-Bosch loop, or bought) and
// low-pressure CO₂ (DAC or bought), with every joule coming from PV. Urea is not an electrochemical
// product: the unit is a high-pressure liquid reactor plus a heat-driven recycle of the carbamate that
// did not convert, then evaporation and finishing. What sets the cost:
//   • the synthesis equilibrium — CO₂ conversion per pass from a carbamate-dehydration equilibrium in
//     the liquid (K(T) calibrated to industrial conversions; excess NH₃ dilutes and helps, water hurts),
//     the reactor's approach to it (residence time, Arrhenius), and the bubble pressure the loop must
//     stay above so the carbamate stays liquid at that temperature → the P–T–N/C trade;
//   • the carbamate recycle — stripping efficiency (CO₂ stripping, NH₃ self-stripping or a
//     conventional total-recycle plant) sets the high-pressure stripper duty, how much heat the
//     high-pressure carbamate condenser returns as low-pressure steam, and the size of the MP/LP
//     recirculation sections;
//   • corrosion — ammonium carbamate at 180–210 °C eats carbon steel; the high-pressure section is
//     316L urea-grade lined carbon steel, 25-22-2 or a urea-grade super-duplex, which is the single
//     biggest material-cost lever;
//   • evaporation and finishing — prilling tower, fluid-bed granulation (today's world-scale choice and
//     often the biggest capex block) or steel-belt pastillation (modular, dust-free);
//   • heat supply — electric steam off a PV-charged heat store, or recompressing the surplus LP steam
//     from the carbamate condenser into the stripper (a heat pump: COP ~3.5);
//   • how it runs on sunlight — firmed baseload (urea capex is ~5× its energy cost), or sun-following
//     with the high-pressure loop blocked in hot every night.
// Everything is priced as a bill of materials at data/bom.js commodity prices × explicit manufacturing
// factors × installation → installed $ per kg urea/day, kWh per kg urea and the idiot index.
//
// Basis: per kg urea/day at `plantKgPerDay` (default 100,000 kg/day = the abundance scoreboard's plant:
// 100 × the urea / green-urea pathways' 1,000 kg/day reference). Screening grade; every assumption is
// in DEFAULTS and overridable.
(function exposeUreaDesign(root, factory) {
  const api = factory(typeof require === 'function' ? require('../../data/bom.js') : root.FoundryBom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.FoundryDesigns = root.FoundryDesigns || {})[api.id] = api;
})(globalThis, Bom => {
  // ------------------------------------------------------------------ constants
  const R = 8.314462618; // J/(mol·K)
  const M_UREA = 60.056; // g/mol
  const M_NH3 = 17.031;
  const M_CO2 = 44.01;
  const M_H2O = 18.015;
  const M_CARB = 78.071; // ammonium carbamate
  const MOL_PER_KG = 1000 / M_UREA; // 16.65 mol urea per kg
  const BAR = 1e5;
  const T185 = 458.15;
  // 2 NH₃(l) + CO₂(g) → urea(aq) + H₂O(l): ΔHf NH₃(l) ≈ −67, CO₂(g) −393.5, urea(s) −333.1, H₂O(l)
  // −285.8 kJ/mol, urea dissolution +15 ⇒ ≈ −76 kJ per mol urea released (net exothermic). The
  // thermodynamic minimum work is ~0: urea needs no energy in principle, only heat moved uphill.
  const OVERALL_EXOTHERM_KJ_PER_MOL = 76;
  const STOICH = Object.freeze({
    nh3KgPerKg: (2 * M_NH3) / M_UREA, // 0.567
    co2KgPerKg: M_CO2 / M_UREA, // 0.733
    waterKgPerKg: M_H2O / M_UREA, // 0.300
  });

  // Recipe basis (data/pathways.js 'urea' and 'green-urea', node 'urea' unit 'urea'): 1,140 $/(kg urea/day)
  // (TeaScreening urea pack 1,200 × Southern Africa 0.95), 0.8 kWh/kg (an electricity-as-total-energy
  // proxy for a steam-driven plant), variable O&M 0.03 $/kg, reference 1,000 kg/day. The engine scales
  // process capex by (size/ref)^(0.85−1), floored at 0.4 (engine/company.js DEFAULTS.scale), so the
  // recipe at the scoreboard's 100,000 kg/day is 1,140 × 100^−0.15 = $572 per kg/day; capexFactor
  // compares the design with that, like with like.
  const RECIPE = Object.freeze({
    urea: Object.freeze({ usdPerKgDay: 1140, kWhPerKg: 0.8, variableOmUsdPerKg: 0.03, pathwayId: 'urea', alsoPathways: Object.freeze(['green-urea']), refKgPerDay: 1000 }),
  });
  const ENGINE_SCALE = Object.freeze({ exponent: 0.85, floorFactor: 0.4 });
  const SCOREBOARD_SIZE_MULTIPLE = 100;

  const DEFAULTS = Object.freeze({
    plantKgPerDay: 100000, // the plant the abundance scoreboard prices (1,000 kg/day reference × 100)
    trainMaxKgPerDay: 4000000, // largest single high-pressure train (world-scale single trains ~4,000 t/day)
    // ---- synthesis
    pressureBar: 140, // loop pressure (CO₂-stripping plants 140–145, NH₃-stripping 150–160 bar); ≥ bubble pressure + margin
    reactorC: 185, // reactor outlet: the conversion peak at this pressure (hotter needs more pressure)
    nhRatio: 3.0, // NH₃:CO₂ molar at the reactor inlet (N/C)
    hcRatio: 0.4, // H₂O:CO₂ molar at the reactor inlet (H/C; recycled carbamate water)
    residenceMin: 45, // liquid residence in the reactor (pool reactor: condenser + reactor volume)
    kinetics: Object.freeze({ tauMinAt185: 11, activationKJPerMol: 90 }), // carbamate dehydration, first-order approach
    // Equilibrium: K = x_U·x_W / x_C in the liquid with free NH₃ diluting. K(185 °C) calibrated so N/C 3,
    // H/C 0.5 gives 62% (Stamicarbon CO₂-stripping reactors ~58–62%), N/C 3.5, H/C 0.6 → 64% (Snamprogetti
    // ~62–64%) and N/C 4, H/C 0 → 75% (Frejacques-type data); dehydration ΔH +15.5 kJ/mol.
    equilibrium: Object.freeze({ kAt185: 0.586, dehydrationKJPerMol: 15.5 }),
    // Bubble pressure of the synthesis liquid: the loop must stay above it or carbamate dissociates
    // into the gas and CO₂ bypasses the liquid. ~135 bar at 185 °C, N/C 3; rises with T and N/C.
    bubble: Object.freeze({ barAt185: 135, nhExponent: 0.6, effectiveKJPerMol: 40, penaltyExponent: 4 }),
    // ---- carbamate recycle
    stripping: 'co2', // 'co2' (CO₂ stripping) | 'nh3' (NH₃ self-stripping + MP section) | 'none' (total recycle)
    strippings: Object.freeze({
      co2: Object.freeze({ label: 'CO₂ stripping (fresh CO₂ strips the reactor effluent at loop pressure)', alpha: 0.8, alphaNH3: 0.85, lpRecovery: 0.85, mpFrac: 0, stripperC: 205 }),
      nh3: Object.freeze({ label: 'NH₃ self-stripping + MP decomposition (18 bar)', alpha: 0.72, alphaNH3: 0.6, lpRecovery: 0.75, mpFrac: 0.7, stripperC: 207 }),
      none: Object.freeze({ label: 'Total recycle: MP (18 bar) + LP decomposition, carbamate solution pumped back', alpha: 0, alphaNH3: 0, lpRecovery: 0.25, mpFrac: 0.85, stripperC: 160 }),
    }),
    condenser: 'pool', // 'pool' (horizontal pool reactor: condenser + reactor in one vessel) | 'vertical' (falling-film condenser + separate reactor)
    decompositionKJPerMol: 130, // effective heat to decompose 1 mol carbamate in a stripper (157 to gas, less in-tube recondensation)
    nh3VapKJPerMol: 23, // free NH₃ evaporated with it
    liquidCpKJPerKgK: 2.5,
    ureaSolutionWtFrac: 0.72, // urea in the solution leaving LP recirculation
    hydrolyserKJPerKgUrea: 250, // process-condensate desorber/hydrolyser steam (cleans 0.3 kg H₂O/kg urea to boiler-feed quality)
    evaporatorEconomy: 1.0, // kg water evaporated per kg steam (1 = single effect; 1.8 = double effect)
    // ---- materials of construction
    vesselConstruction: 'lined-316L', // 'lined-316L' (carbon-steel heavy wall + 316L-UG liner) | 'lined-25-22-2' | 'duplex' (solid urea-grade super duplex)
    constructions: Object.freeze({
      'lined-316L': Object.freeze({ label: 'Carbon-steel heavy wall + 8 mm 316L urea-grade liner, leak detection', liner: 'ss316L-ug', linerMm: 8, maxC: 190, passivationO2MolPerMolCO2: 0.006 }),
      'lined-25-22-2': Object.freeze({ label: 'Carbon-steel heavy wall + 8 mm 25Cr-22Ni-2Mo liner', liner: 'ss25-22-2', linerMm: 8, maxC: 205, passivationO2MolPerMolCO2: 0.004 }),
      duplex: Object.freeze({ label: 'Solid urea-grade super duplex (29Cr-6Ni-2Mo-N), no liner', liner: null, linerMm: 0, maxC: 210, passivationO2MolPerMolCO2: 0.001 }),
    }),
    tubeAlloy: 'duplex', // stripper/condenser tubes: 'ss316L-ug' | 'ss25-22-2' | 'duplex'
    alloys: Object.freeze({ // raw-material price = stainless (bom.js, 304 basis) × alloy premium (Mo, Ni, Cr, N content)
      'ss316L-ug': Object.freeze({ label: '316L urea grade', premium: 1.8, allowableMPa: 115, tubeWallMm: 2.9, maxC: 190 }),
      'ss25-22-2': Object.freeze({ label: '25Cr-22Ni-2Mo-N', premium: 2.8, allowableMPa: 130, tubeWallMm: 2.9, maxC: 205 }),
      duplex: Object.freeze({ label: 'urea-grade super duplex', premium: 2.5, allowableMPa: 230, tubeWallMm: 2.2, maxC: 210 }),
    }),
    carbonSteelAllowableMPa: 138, // SA-516-70 / SA-266 forgings at ~200 °C
    corrosionAllowanceMm: 1, // on solid duplex walls
    minWallMm: 8,
    hpAppendagesFrac: 0.3, // nozzles, forged flanges, manways, skirts ÷ HP vessel wall mass
    stripperFluxKWPerM2: 18, // falling-film stripper, 20–25 bar steam (or heat-store loop) on the shell
    condenserFluxKWPerM2: 9, // HP carbamate condenser raising 4–5 bar steam (pool condenser: submerged U-bundle)
    lpFluxKWPerM2: 8, // LP/MP decomposers and condensers, evaporators
    tubeOdMm: 25,
    tubeLengthM: 6,
    tubePitchRatio: 1.3,
    poolVolumeFactor: 1.3, // pool reactor shell ÷ reactor liquid volume (bundle + vapour space)
    // Structure height: a vertical condenser/reactor loop circulates by gravity (reactor ~25 m up);
    // a pool reactor sits at grade, so the HP structure is roughly halved.
    structureFactorByCondenser: Object.freeze({ pool: 0.55, vertical: 1 }),
    reactorFill: 0.85,
    // ---- compression and pumping
    co2InletBar: 1.05, // DAC / recovered CO₂ arrives near atmospheric
    co2IsothermalEff: 0.7,
    pumpEff: 0.6,
    motorEff: 0.95,
    nh3FeedBar: 20, // liquid NH₃ from storage / the loop's let-down
    compressorKgPerKWAt100kW: 25, compressorSizeExponent: 0.8, // kg/kW = base × (kW/100)^(exp−1)
    pumpKgPerKWAt100kW: 30, pumpSizeExponent: 0.75,
    motorCopperKgPerKW: 0.8,
    drivesUsdPerKW: 40,
    // ---- heat supply
    heatSupply: 'mvr', // 'electric' (resistive steam generator off a PV-charged heat store) | 'mvr' (steam recompression of surplus LP steam into the stripper)
    steamSystemEff: 0.95, // electric/heat-store steam raising incl. distribution losses
    steamGenUsdPerKW: 15, steamGenSteelKgPerKW: 3,
    mvr: Object.freeze({ carnotFrac: 0.5, approachK: 12, lpSteamC: 147, kgPerKW: 15 }),
    airCoolerSteelKgPerKW: 4, airCoolerAluminiumKgPerKW: 1.2,
    fanKWhPerKWhRejected: 0.012,
    auxKWhPerKg: 0.008,
    vacuumKWhPerKg: 0.004, // liquid-ring pumps (or ejector steam) on the evaporators
    // ---- finishing
    finishing: 'pastillation', // 'prilling' | 'granulation' | 'pastillation' | 'solution'
    finishings: Object.freeze({
      // meltWtFrac: urea concentration the finishing needs; kWhPerKg: fans/scrubber/belts; steelKgPerTph
      // at 1 t/h with sizeExponent; concreteKgPerTph; stainlessFrac; fixedUsd: bought-in per line.
      prilling: Object.freeze({ label: 'Prilling tower + dust scrubber', meltWtFrac: 0.997, kWhPerKg: 0.025, steelKgAt1Tph: 60000, sizeExponent: 0.55, concreteKgAt1Tph: 500000, stainlessFrac: 0.15, ufKgPerKg: 0.003, fixedUsd: 300000, note: '~45 m free fall whatever the capacity: a fixed block that punishes small plants' }),
      granulation: Object.freeze({ label: 'Fluid-bed granulation (granulator, cooler, screens, crusher, scrubber)', meltWtFrac: 0.96, kWhPerKg: 0.045, steelKgAt1Tph: 70000, sizeExponent: 0.75, concreteKgAt1Tph: 150000, stainlessFrac: 0.3, ufKgPerKg: 0.0045, fixedUsd: 600000, note: 'world-scale standard; big fans and scrubbers, formaldehyde conditioning' }),
      pastillation: Object.freeze({ label: 'Steel-belt pastillation (drop former on a water-cooled stainless belt)', meltWtFrac: 0.995, kWhPerKg: 0.012, beltKgPerHM2: 100, beltFrameKgPerM2: 110, beltStainlessKgPerM2: 9, steelKgAt1Tph: 3000, sizeExponent: 0.8, concreteKgAt1Tph: 8000, stainlessFrac: 0.3, ufKgPerKg: 0.0015, dropFormerUsdPerTph: 25000, fixedUsd: 100000, note: 'modular lines, no dust scrubber, turns down line by line' }),
      solution: Object.freeze({ label: 'No finishing: 70–80% urea solution for captive UAN / DEF', meltWtFrac: 0.72, kWhPerKg: 0, steelKgAt1Tph: 0, sizeExponent: 1, concreteKgAt1Tph: 0, stainlessFrac: 0, ufKgPerKg: 0, fixedUsd: 0, note: 'the scoreboard prices solid urea: this is a different product' }),
    }),
    storageDays: 20, // covered bulk store for a hygroscopic product
    pileKgPerM2: 4000,
    storeSteelKgPerM2: 45, storeConcreteKgPerM2: 600,
    handlingSteelKgAt1Tph: 6000, handlingSizeExponent: 0.7,
    // ---- per-train hardware not sized above
    hpPipingFrac: 0.35, // HP piping + fittings mass ÷ HP equipment mass (alloy)
    lpPipingFrac: 0.3, // LP piping ÷ LP equipment mass (stainless)
    structureSteelKgAt1tpd: 1200, structureSizeExponent: 0.7, // per train (×(t/day)^exp)
    concreteKgAt1tpd: 15000, concreteSizeExponent: 0.75,
    interconnectPipingKgAt1tpd: 500, offsitesSteelKgAt1tpd: 600, offsitesSizeExponent: 0.75, // CS racks/utility piping; flare, fire water, instrument air, tanks
    buildingsSteelKgAt1tpd: 80, // control room, MCC, workshop, per plant (exponent 0.6)
    electricalCopperKgPerKW: 0.6, // cabling + MCC per kW of connected motors
    // ---- bought-in, engineering, labour (per plant at 100 t/day; scale (S/100 t/day)^exponent)
    instrumentsUsdAt100tpd: 1200000, // DCS/SIS, analysers, HP level/radar, transmitters
    hpValvesUsdAt100tpd: 700000, // HP control/isolation/relief and let-down valves in urea-grade alloy
    engineeringUsdAt100tpd: 2000000, // repeat standard design: site adaptation, HAZOP, permits, start-up
    licenceUsdPerTpd: 0, // process licence: ~$1,000 per t/day at world scale; a ~$2M minimum fee ≈ $20,000 per t/day at 100 t/day
    boughtInSizeExponent: 0.5,
    assemblyHoursAt100tpd: 25000, labourUsdPerHour: 45, labourSizeExponent: 0.7,
    manufacturing: Object.freeze({ // finished part cost ÷ raw-material cost
      hpVessels: 8, // heavy-wall shells, forgings, nozzles, code stamp
      linedExtra: 1.5, // × hpVessels on a lined vessel: liner welding, weep holes, leak detection
      hpExchangers: 7, // tube-to-tubesheet welding in alloy, ferrite control
      lpEquipment: 4,
      compressors: 8,
      pumps: 10,
      motors: 3,
      airCoolers: 3,
      piping: 4,
      finishing: 3,
      storage: 2,
      structure: 2,
      civil: 1.5,
      electrical: 2,
    }),
    installFactor: 1.25,
    // ---- operation on sunlight
    operation: 'baseload', // 'baseload' (firmed: heat store for the heat, battery for the rest) | 'sun-following' (HP loop blocked in hot every night)
    trainMinTurndown: 0.5, // fraction of nameplate one train holds steadily (falling-film stripper wetting)
    sunNameplateFactor: 3, // nameplate ÷ 24 h average for a sun-following unit (engine flex design)
    blockInHours: 14,
    standbyWPerM2: 60, // HP loop held hot (≥ 150 °C) while blocked in, per m² of HP vessel surface
    restartKWhPerKgDay: 0.01, // heat to bring the loop back to 185 °C each morning, per kg/day nameplate
    // ---- variable O&M
    ufUsdPerKg: 0.45, // UF85 anti-caking conditioning agent
    nh3VentKgPerKgPerMolO2: 0.3, // NH₃ lost with passivation-air inerts (kg NH₃/kg urea per mol O₂/mol CO₂)
    nh3UsdPerKg: 0.45,
    otherVariableUsdPerKg: 0.004, // water treatment chemicals, lubricants, spares consumed
    lifeYears: 25,
  });

  // 'today' = a ~100 t/day CO₂-stripping plant built the way urea plants are built now (vertical
  // condenser + reactor, 316L-UG-lined CS vessels, 25-22-2 stripper tubes, fluid-bed granulation,
  // field-erected, licensed): lands near the recipe at the scoreboard size. 'lean' = DEFAULTS.
  const PRESETS = Object.freeze({
    today: Object.freeze({
      label: 'Today: small CO₂-stripping plant, lined vessels, fluid-bed granulation, field-built',
      params: Object.freeze({
        pressureBar: 145,
        reactorC: 185,
        hcRatio: 0.5,
        residenceMin: 50,
        condenser: 'vertical',
        vesselConstruction: 'lined-316L',
        tubeAlloy: 'ss25-22-2',
        finishing: 'granulation',
        heatSupply: 'electric',
        evaporatorEconomy: 1.0,
        steamSystemEff: 0.85,
        co2IsothermalEff: 0.62,
        compressorKgPerKWAt100kW: 60, compressorSizeExponent: 0.7,
        pumpKgPerKWAt100kW: 80,
        drivesUsdPerKW: 120,
        stripperFluxKWPerM2: 14, condenserFluxKWPerM2: 6, lpFluxKWPerM2: 5,
        minWallMm: 12,
        airCoolerSteelKgPerKW: 8, airCoolerAluminiumKgPerKW: 2,
        storageDays: 30,
        hpPipingFrac: 0.5, lpPipingFrac: 0.5,
        structureSteelKgAt1tpd: 3000, concreteKgAt1tpd: 40000, buildingsSteelKgAt1tpd: 250,
        interconnectPipingKgAt1tpd: 1200, offsitesSteelKgAt1tpd: 1500,
        instrumentsUsdAt100tpd: 4000000,
        hpValvesUsdAt100tpd: 2500000,
        engineeringUsdAt100tpd: 12000000,
        licenceUsdPerTpd: 20000,
        boughtInSizeExponent: 0.4,
        assemblyHoursAt100tpd: 90000, labourUsdPerHour: 60,
        manufacturing: { hpVessels: 14, linedExtra: 1.6, hpExchangers: 16, lpEquipment: 8, compressors: 25, pumps: 25, motors: 4, airCoolers: 5, piping: 10, finishing: 6, storage: 3, structure: 3.5, civil: 2.5, electrical: 3 },
        installFactor: 2.0,
        trainMinTurndown: 0.6,
        otherVariableUsdPerKg: 0.022,
      }),
    }),
    lean: Object.freeze({
      label: 'Lean solar-matched target: CO₂-stripping pool reactor at grade, 316L-UG-lined vessels + duplex tubes, steam recompression, pastillation, shop-built, firmed baseload',
      params: Object.freeze({}),
    }),
    heatStore: Object.freeze({
      label: 'Lean unit with electric steam off a PV-charged heat store (no steam recompressor)',
      params: Object.freeze({ heatSupply: 'electric' }),
    }),
    duplex: Object.freeze({
      label: 'Lean unit with solid super-duplex HP vessels (no liner, little passivation air)',
      params: Object.freeze({ vesselConstruction: 'duplex' }),
    }),
    sunFollowing: Object.freeze({
      label: 'Lean unit run sun-following: HP loop blocked in hot every night',
      params: Object.freeze({ operation: 'sun-following', trainMinTurndown: 0.4 }),
    }),
  });

  const CONTROLS = Object.freeze([
    { key: 'plantKgPerDay', label: 'Plant size', unit: 'kg urea/day', min: 10000, max: 4000000, step: 10000, hint: 'Scoreboard plants are 100 t/day; world scale ~3,500 t/day' },
    { key: 'pressureBar', label: 'Synthesis pressure', unit: 'bar', min: 100, max: 220, step: 5, hint: 'must stay above the bubble pressure at reactor temperature' },
    { key: 'reactorC', label: 'Reactor temperature', unit: '°C', min: 165, max: 215, step: 1, hint: 'hotter: higher equilibrium, higher pressure, faster corrosion' },
    { key: 'nhRatio', label: 'NH₃:CO₂ (N/C)', min: 2.5, max: 4.5, step: 0.1, hint: 'excess NH₃ raises conversion but must be recycled' },
    { key: 'hcRatio', label: 'H₂O:CO₂ (H/C)', min: 0.2, max: 1.0, step: 0.05, hint: 'water in the recycle lowers conversion' },
    { key: 'residenceMin', label: 'Reactor residence', unit: 'min', min: 10, max: 90, step: 5 },
    { key: 'stripping', label: 'Carbamate recycle', options: [['co2', 'CO₂ stripping'], ['nh3', 'NH₃ self-stripping + MP'], ['none', 'Total recycle (no stripper)']] },
    { key: 'condenser', label: 'HP condenser', options: [['pool', 'Pool reactor (condenser + reactor)'], ['vertical', 'Falling-film condenser + reactor']] },
    { key: 'vesselConstruction', label: 'HP vessels', options: [['duplex', 'Solid super duplex'], ['lined-316L', 'CS + 316L-UG liner'], ['lined-25-22-2', 'CS + 25-22-2 liner']] },
    { key: 'tubeAlloy', label: 'Stripper/condenser tubes', options: [['duplex', 'Super duplex'], ['ss25-22-2', '25-22-2'], ['ss316L-ug', '316L-UG']] },
    { key: 'finishing', label: 'Finishing', options: [['pastillation', 'Steel-belt pastillation'], ['granulation', 'Fluid-bed granulation'], ['prilling', 'Prilling tower'], ['solution', 'None (urea solution)']] },
    { key: 'heatSupply', label: 'Heat supply', options: [['electric', 'Electric steam off a heat store'], ['mvr', 'Steam recompression (MVR)']] },
    { key: 'operation', label: 'Operation', options: [['baseload', 'Baseload (heat store)'], ['sun-following', 'Sun-following (nightly block-in)']] },
    { key: 'installFactor', label: 'Install factor', unit: '×', min: 1, max: 2.5, step: 0.05 },
  ]);

  function merge(params = {}) {
    const p = { ...DEFAULTS, ...params };
    for (const k of ['kinetics', 'equilibrium', 'bubble', 'strippings', 'constructions', 'alloys', 'mvr', 'finishings', 'manufacturing', 'structureFactorByCondenser']) {
      p[k] = { ...DEFAULTS[k], ...(params[k] || {}) };
    }
    return p;
  }

  function price(material, p) {
    if (Bom.COMMODITIES[material]) return Bom.COMMODITIES[material].usdPerKg;
    const alloy = p.alloys[material];
    if (alloy) return Bom.COMMODITIES['stainless-steel'].usdPerKg * alloy.premium;
    return 0;
  }

  function engineScaleFactor(sizeKgPerDay) {
    const f = (sizeKgPerDay / RECIPE.urea.refKgPerDay) ** (ENGINE_SCALE.exponent - 1);
    return Math.max(ENGINE_SCALE.floorFactor, Math.min(1, f));
  }
  function recipeAtSize(sizeKgPerDay) {
    return RECIPE.urea.usdPerKgDay * engineScaleFactor(sizeKgPerDay);
  }

  // ------------------------------------------------------------------ synthesis thermodynamics
  // Dehydration equilibrium constant K = x_U·x_W/x_C (liquid mole fractions incl. free NH₃).
  function equilibriumK(Tc, p = DEFAULTS) {
    const eq = p.equilibrium || DEFAULTS.equilibrium;
    return eq.kAt185 * Math.exp((-eq.dehydrationKJPerMol * 1000 / R) * (1 / (Tc + 273.15) - 1 / T185));
  }

  // Equilibrium CO₂ conversion for a feed of 1 CO₂ : a NH₃ : b H₂O (all CO₂ as carbamate in the liquid).
  // Carbamate 1−X, urea X, water b+X, free NH₃ a−2 ⇒ K = X(b+X) / ((1−X)(a−1+b+X)).
  function equilibriumConversion(Tc, a, b, p = DEFAULTS) {
    const K = equilibriumK(Tc, p);
    const f = X => (X * (b + X)) / ((1 - X) * Math.max(a - 1 + b + X, 1e-9)) - K;
    let lo = 0;
    let hi = 1 - 1e-9;
    for (let i = 0; i < 80; i += 1) {
      const mid = (lo + hi) / 2;
      if (f(mid) < 0) lo = mid; else hi = mid;
    }
    return lo;
  }

  // Bubble pressure (bar) of the synthesis liquid at T and N/C.
  function bubblePressureBar(Tc, a, p = DEFAULTS) {
    const bb = p.bubble || DEFAULTS.bubble;
    return bb.barAt185 * (a / 3) ** bb.nhExponent * Math.exp((-bb.effectiveKJPerMol * 1000 / R) * (1 / (Tc + 273.15) - 1 / T185));
  }

  function synthesis(p) {
    const a = p.nhRatio;
    const b = p.hcRatio;
    const T = p.reactorC;
    const xEq = equilibriumConversion(T, a, b, p);
    const tau = p.kinetics.tauMinAt185 * Math.exp((p.kinetics.activationKJPerMol * 1000 / R) * (1 / (T + 273.15) - 1 / T185));
    const approach = 1 - Math.exp(-p.residenceMin / tau);
    const pBubble = bubblePressureBar(T, a, p);
    const liquidFrac = Math.min(1, p.pressureBar / pBubble) ** p.bubble.penaltyExponent;
    const X = xEq * approach * liquidFrac;
    return { a, b, T, xEq, tauMin: tau, approach, pBubble, liquidFrac, X };
  }

  // ------------------------------------------------------------------ heat and energy balance
  function balance(p) {
    const s = synthesis(p);
    const st = p.strippings[p.stripping] || p.strippings.co2;
    const X = Math.max(s.X, 0.05);
    const recycleCarb = (1 - X) / X; // mol unconverted carbamate per mol urea
    const freeNH3 = (s.a - 2) / X; // mol free NH₃ through the reactor per mol urea
    const liquidKgPerMol = (s.a * M_NH3 + M_CO2 + s.b * M_H2O) / X / 1000; // reactor liquid per mol urea
    const kJ = {}; // per mol urea
    const hDec = p.decompositionKJPerMol;
    // HP stripper (or MP decomposer for total recycle): decomposes alpha of the carbamate.
    const strip = st.alpha * recycleCarb * hDec + st.alphaNH3 * freeNH3 * p.nh3VapKJPerMol
      + (st.alpha > 0 ? liquidKgPerMol * p.liquidCpKJPerKgK * Math.max(0, st.stripperC - s.T) : 0);
    // What the stripper leaves goes to MP (mpFrac) and LP recirculation.
    const rest = (1 - st.alpha) * recycleCarb * hDec + (1 - st.alphaNH3) * freeNH3 * p.nh3VapKJPerMol;
    kJ.hpStripper = strip;
    kJ.mpDecomposer = rest * st.mpFrac;
    kJ.lpDecomposer = rest * (1 - st.mpFrac);
    // Evaporation from the LP solution to what finishing needs.
    const fin = p.finishings[p.finishing] || p.finishings.pastillation;
    const waterKgPerKg = Math.max(0, (1 / p.ureaSolutionWtFrac - 1) - (1 / fin.meltWtFrac - 1));
    kJ.evaporation = (waterKgPerKg * 2300 / p.evaporatorEconomy) * M_UREA / 1000;
    kJ.hydrolyser = p.hydrolyserKJPerKgUrea * M_UREA / 1000;
    // Low-pressure steam raised by the HP carbamate condenser: carbamate re-formed from the strip gas and
    // the fresh feed (net exotherm), at ~150 °C.
    const recovered = st.lpRecovery * (strip + (st.alpha > 0 ? OVERALL_EXOTHERM_KJ_PER_MOL : 0.5 * OVERALL_EXOTHERM_KJ_PER_MOL));
    const lpNeed = kJ.lpDecomposer + kJ.evaporation + kJ.hydrolyser;
    // The MP decomposer needs ~160 °C heat: in total-recycle / NH₃-stripping plants it is imported.
    const hpImport = kJ.hpStripper + kJ.mpDecomposer;
    const lpImport = Math.max(0, lpNeed - recovered);
    const surplus = Math.max(0, recovered - lpNeed);
    const toKWh = x => (x * MOL_PER_KG) / 3600; // kJ/mol urea → kWh/kg urea
    let heatKWhPerKg = toKWh(hpImport + lpImport) / p.steamSystemEff;
    let mvrKWhPerKg = 0;
    let upgradedKWhPerKg = 0;
    let cop = null;
    if (p.heatSupply === 'mvr') {
      const Thot = (st.alpha > 0 ? st.stripperC : 165) + p.mvr.approachK + 273.15;
      const Tcold = p.mvr.lpSteamC + 273.15;
      cop = p.mvr.carnotFrac * Thot / (Thot - Tcold);
      const up = Math.min(surplus, hpImport);
      upgradedKWhPerKg = toKWh(up);
      mvrKWhPerKg = upgradedKWhPerKg / cop / p.motorEff;
      heatKWhPerKg = toKWh(hpImport - up + lpImport) / p.steamSystemEff;
    }
    // Electricity.
    const co2InBar = p.co2InletBar;
    const Tc = 313.15;
    const co2J = (R * Tc * Math.log(Math.max(p.pressureBar, co2InBar) / co2InBar)) / p.co2IsothermalEff / p.motorEff;
    const co2KWhPerKg = toKWh(co2J / 1000);
    const nh3M3PerKg = STOICH.nh3KgPerKg / 600;
    const nh3PumpKWhPerKg = (nh3M3PerKg * Math.max(0, p.pressureBar + 10 - p.nh3FeedBar) * BAR) / p.pumpEff / p.motorEff / 3.6e6;
    // Carbamate solution pumped from LP (or MP) back to the loop: carbamate + its water, ~1,250 kg/m³.
    const carbKgPerKg = ((1 - st.alpha) * recycleCarb * (M_CARB + 0.6 * M_H2O) / M_UREA) * (1 + (st.mpFrac > 0 ? 0.3 : 0));
    const carbPumpKWhPerKg = (carbKgPerKg / 1250 * p.pressureBar * BAR) / p.pumpEff / p.motorEff / 3.6e6;
    // Heat rejected to air: unused LP steam, evaporator and LP/MP condensers, compression heat.
    const rejectedKWhPerKg = toKWh(surplus) - upgradedKWhPerKg + toKWh(kJ.evaporation + kJ.lpDecomposer + kJ.mpDecomposer) + co2KWhPerKg + mvrKWhPerKg;
    const fansKWhPerKg = rejectedKWhPerKg * p.fanKWhPerKWhRejected;
    const energy = {
      heat: heatKWhPerKg,
      mvr: mvrKWhPerKg,
      co2Compression: co2KWhPerKg,
      pumps: nh3PumpKWhPerKg + carbPumpKWhPerKg,
      fans: fansKWhPerKg,
      vacuum: fin.meltWtFrac > p.ureaSolutionWtFrac ? p.vacuumKWhPerKg : 0,
      finishing: fin.kWhPerKg,
      aux: p.auxKWhPerKg,
    };
    return {
      s, st, fin, X, recycleCarb, freeNH3, liquidKgPerMol,
      kJPerMol: { ...kJ, recovered, lpNeed, hpImport, lpImport, surplus },
      kWhPerKgHeat: { hp: toKWh(hpImport), lpImport: toKWh(lpImport), recovered: toKWh(recovered), surplus: toKWh(surplus), upgraded: upgradedKWhPerKg },
      waterEvapKgPerKg: waterKgPerKg, carbPumpKgPerKg: carbKgPerKg, rejectedKWhPerKg, cop,
      energy,
    };
  }

  // ------------------------------------------------------------------ hardware helpers
  const DENS = 7900;
  // Pressure vessel (cylinder + hemispherical heads) of volume V at P: wall by ASME VIII-1 thin wall.
  function hpVessel(V, P, p, lOverD = 4) {
    const D = Math.cbrt(Math.max(V, 1e-4) / (Math.PI / 4 * (lOverD - 1) + Math.PI / 6));
    const c = p.constructions[p.vesselConstruction] || p.constructions.duplex;
    const Pa = P * BAR;
    const S = (c.liner ? p.carbonSteelAllowableMPa : p.alloys.duplex.allowableMPa) * 1e6;
    const t = Math.max(p.minWallMm / 1000, (Pa * D) / (2 * S - 1.2 * Pa)) + (c.liner ? 0 : p.corrosionAllowanceMm / 1000);
    const area = Math.PI * D * (lOverD - 1) * D + Math.PI * D * D;
    const wallKg = area * t * DENS * (1 + p.hpAppendagesFrac);
    const linerKg = c.liner ? area * (c.linerMm / 1000) * DENS : 0;
    return { D, L: lOverD * D, wallMm: t * 1000, areaM2: area, wallKg, linerKg, wallMaterial: c.liner ? 'steel' : 'duplex', liner: c.liner };
  }

  // HP shell-and-tube exchanger: tubes in tubeAlloy, HP channels + tubesheets as HP pressure parts,
  // shell on the utility side (CS at ~25 bar).
  function hpExchanger(areaM2, P, p, shellBar = 25) {
    const alloy = p.alloys[p.tubeAlloy] || p.alloys.duplex;
    const d = p.tubeOdMm / 1000;
    const nTubes = areaM2 / (Math.PI * d * p.tubeLengthM);
    const tubeKg = nTubes * Math.PI * d * (alloy.tubeWallMm / 1000) * p.tubeLengthM * DENS;
    const D = Math.sqrt(nTubes * (p.tubePitchRatio * d) ** 2 * 1.15 * 4 / Math.PI) + 0.1;
    const c = p.constructions[p.vesselConstruction] || p.constructions.duplex;
    const S = (c.liner ? p.carbonSteelAllowableMPa : p.alloys.duplex.allowableMPa) * 1e6;
    const Pa = P * BAR;
    const tHead = Math.max(p.minWallMm / 1000, (Pa * D) / (4 * S - 0.4 * Pa));
    const headsKg = 2 * (Math.PI * D * D / 2) * tHead * DENS; // two hemispherical channels
    const tSheet = Math.max(0.05, 0.5 * D * Math.sqrt(Pa / S));
    const sheetsKg = 2 * (Math.PI * D * D / 4) * tSheet * DENS;
    const linerKg = c.liner ? (2 * Math.PI * D * D / 2 + 2 * Math.PI * D * D / 4) * (c.linerMm / 1000) * DENS : 0;
    const tShell = Math.max(0.008, (shellBar * BAR * D) / (2 * p.carbonSteelAllowableMPa * 1e6));
    const shellKg = Math.PI * D * p.tubeLengthM * tShell * DENS * 1.15;
    return { nTubes, D, tubeKg, hpKg: headsKg + sheetsKg, linerKg, shellKg, tubeAlloy: p.tubeAlloy, hpMaterial: c.liner ? 'steel' : 'duplex', liner: c.liner };
  }

  // ------------------------------------------------------------------ full design
  function design(params = {}) {
    const p = merge(params);
    const S = Math.max(1000, p.plantKgPerDay);
    const nTrains = Math.max(1, Math.ceil(S / p.trainMaxKgPerDay - 1e-9));
    const sTrain = S / nTrains;
    const B = balance(p);
    const sunFollowing = p.operation === 'sun-following';
    const warnings = [];
    const c = p.constructions[p.vesselConstruction] || p.constructions.duplex;
    const alloy = p.alloys[p.tubeAlloy] || p.alloys.duplex;
    if (p.reactorC > c.maxC) warnings.push(`reactor ${p.reactorC} °C above the ${c.maxC} °C limit of ${c.label}`);
    if (B.st.alpha > 0 && B.st.stripperC > alloy.maxC) warnings.push(`stripper ${B.st.stripperC} °C above the ${alloy.maxC} °C limit of ${alloy.label} tubes`);
    if (B.s.liquidFrac < 1) warnings.push(`loop ${p.pressureBar} bar below the ${B.s.pBubble.toFixed(0)} bar bubble pressure: CO₂ bypasses the liquid`);
    // Sun-following trains are oversized for sun hours; costs below are for the 24 h-average plant, and
    // the engine multiplies the unit by its own nameplate factor, so nothing is oversized here.
    const kgPerSTrain = sTrain / 86400; // kg urea/s per train
    const molPerSTrain = kgPerSTrain * MOL_PER_KG;
    const kW = kJPerMol => kJPerMol * molPerSTrain; // per train, at nameplate
    const m = p.manufacturing;
    const parts = [];
    const add = (part, material, kgPlant, mfg, note, group) => {
      const manufacturing = Math.round(mfg * 100) / 100;
      const usdMaterials = kgPlant * price(material, p);
      parts.push({ part, material, kgPlant, usdMaterialsPlant: usdMaterials, manufacturing, usdPlant: usdMaterials * manufacturing, note, group });
    };
    const buy = (part, usdPlant, note, group, floorUsd = 0) => parts.push({ part, material: null, kgPlant: 0, usdMaterialsPlant: floorUsd, manufacturing: null, usdPlant, note, group });
    const sizedKg = (base, kWx, exp) => kWx * base * (Math.max(kWx, 0.5) / 100) ** (exp - 1);
    let hpKgPlant = 0;
    let lpKgPlant = 0;
    let motorKW = 0;
    let hpSurfaceM2 = 0;
    const hpAdd = (part, material, kgTrain, mfg, note) => { hpKgPlant += kgTrain * nTrains; add(part, material, kgTrain * nTrains, mfg, note, 'hp'); };
    const lpAdd = (part, material, kgTrain, mfg, note) => { lpKgPlant += kgTrain * nTrains; add(part, material, kgTrain * nTrains, mfg, note, 'lp'); };
    const vesselMfg = c.liner ? m.hpVessels * m.linedExtra : m.hpVessels;

    // -- reactor (pool: reactor + condenser in one horizontal vessel)
    const liquidM3s = (B.liquidKgPerMol * molPerSTrain) / 1100;
    const reactorM3 = (liquidM3s * p.residenceMin * 60) / p.reactorFill;
    const pool = p.condenser === 'pool';
    const rv = hpVessel(reactorM3 * (pool ? p.poolVolumeFactor : 1), p.pressureBar, p, pool ? 4 : 6);
    hpSurfaceM2 += rv.areaM2;
    const rvLabel = pool ? 'Pool reactor shell (condenser + reactor)' : 'Urea reactor shell';
    hpAdd(rvLabel, rv.wallMaterial, rv.wallKg, vesselMfg, `${(reactorM3).toFixed(1)} m³ liquid, Ø${(rv.D * 1000).toFixed(0)} mm × ${rv.L.toFixed(1)} m, ${rv.wallMm.toFixed(0)} mm ${rv.liner ? 'CS' : 'duplex'} at ${p.pressureBar} bar`);
    if (rv.liner) hpAdd(`${rvLabel} liner`, rv.liner, rv.linerKg, vesselMfg, `${c.linerMm} mm ${p.alloys[rv.liner].label}`);
    hpAdd('Reactor trays / internals', 'duplex', rv.areaM2 * 0.15 * 0.006 * DENS * 3, m.hpExchangers, 'sieve trays (vertical) or baffles (pool)');

    // -- HP stripper (CO₂ / NH₃ stripping) or MP decomposer (total recycle)
    const stripKW = kW(B.kJPerMol.hpStripper);
    let stripM2 = 0;
    if (B.st.alpha > 0) {
      stripM2 = stripKW / p.stripperFluxKWPerM2;
      const ex = hpExchanger(stripM2, p.pressureBar, p);
      hpSurfaceM2 += Math.PI * ex.D * p.tubeLengthM;
      hpAdd('HP stripper tubes', p.tubeAlloy, ex.tubeKg, m.hpExchangers, `${stripM2.toFixed(0)} m², ${Math.round(ex.nTubes)} tubes, ${stripKW.toFixed(0)} kW at ${B.st.stripperC} °C`);
      hpAdd('HP stripper channels + tubesheets', ex.hpMaterial, ex.hpKg, vesselMfg, `Ø${(ex.D * 1000).toFixed(0)} mm bundle`);
      if (ex.liner) hpAdd('HP stripper channel liner/overlay', ex.liner, ex.linerKg, vesselMfg, '');
      hpAdd('HP stripper shell (heating side)', 'steel', ex.shellKg, m.lpEquipment, 'steam / heat-store loop at ~25 bar');
    }
    // -- HP carbamate condenser (tube bundle; in the pool reactor or its own HP shell)
    const condKW = kW(Math.min(B.kJPerMol.recovered, B.kJPerMol.hpStripper + OVERALL_EXOTHERM_KJ_PER_MOL));
    if (B.st.alpha > 0) {
      const condM2 = condKW / p.condenserFluxKWPerM2;
      const ex = hpExchanger(condM2, p.pressureBar, p, 6);
      hpAdd('HP carbamate condenser tubes', p.tubeAlloy, ex.tubeKg, m.hpExchangers, `${condM2.toFixed(0)} m², ${condKW.toFixed(0)} kW → 4.5 bar steam`);
      if (!pool) {
        hpSurfaceM2 += Math.PI * ex.D * p.tubeLengthM;
        hpAdd('HP carbamate condenser channels + tubesheets', ex.hpMaterial, ex.hpKg, vesselMfg, '');
        if (ex.liner) hpAdd('HP condenser channel liner', ex.liner, ex.linerKg, vesselMfg, '');
        hpAdd('HP condenser shell (steam side)', 'steel', ex.shellKg, m.lpEquipment, '');
      } else {
        hpAdd('Pool condenser U-bundle tubesheet', ex.hpMaterial, ex.hpKg / 2, vesselMfg, 'one tubesheet; bundle sits in the pool reactor');
      }
      // HP scrubber: inerts leave via a small vessel.
      const sc = hpVessel(reactorM3 * 0.08, p.pressureBar, p, 4);
      hpSurfaceM2 += sc.areaM2;
      hpAdd('HP scrubber', sc.wallMaterial, sc.wallKg + sc.linerKg, vesselMfg, `${(reactorM3 * 0.08).toFixed(2)} m³`);
    }
    // -- MP section (NH₃ stripping, total recycle): decomposer + absorber at 18 bar
    if (B.st.mpFrac > 0) {
      const mpKW = kW(B.kJPerMol.mpDecomposer);
      const mpM2 = mpKW / p.lpFluxKWPerM2;
      lpAdd('MP decomposer + absorber (316L)', 'ss316L-ug', mpM2 * 30 * 0.6, m.lpEquipment, `${mpKW.toFixed(0)} kW at 18 bar, ${mpM2.toFixed(0)} m²`);
      lpAdd('MP section shells (CS)', 'steel', mpM2 * 30 * 0.8, m.lpEquipment, 'MP absorber, condenser, ammonia condenser');
    }
    // -- LP recirculation (rectifier, LP decomposer, LP carbamate condenser)
    const lpKW = kW(B.kJPerMol.lpDecomposer);
    const lpM2 = Math.max(lpKW, 0.02 * stripKW) / p.lpFluxKWPerM2 * 2; // decomposer + condenser
    lpAdd('LP recirculation (rectifier, decomposer, condenser)', 'stainless-steel', lpM2 * 25 * 0.5, m.lpEquipment, `${lpKW.toFixed(0)} kW at 3–4 bar`);
    lpAdd('LP recirculation shells (CS)', 'steel', lpM2 * 25 * 0.5, m.lpEquipment, '');
    // -- evaporation (vacuum) + condensers
    const evKW = kW(B.kJPerMol.evaporation);
    if (evKW > 0) {
      const evM2 = evKW / p.lpFluxKWPerM2;
      lpAdd('Vacuum evaporators (304L)', 'stainless-steel', evM2 * 22, m.lpEquipment, `${(B.waterEvapKgPerKg).toFixed(3)} kg water/kg urea to ${(B.fin.meltWtFrac * 100).toFixed(1)}%, ${evM2.toFixed(0)} m²`);
      lpAdd('Evaporator condensers + vacuum package', 'steel', evM2 * 20, m.lpEquipment, 'surface condensers, liquid-ring pumps');
    }
    // -- process condensate treatment
    const waterKgS = (STOICH.waterKgPerKg + 0.15) * kgPerSTrain;
    lpAdd('Desorbers + hydrolyser (316L)', 'ss316L-ug', waterKgS * 3600 * 1.5, m.lpEquipment, `${(waterKgS * 3.6).toFixed(1)} t/h condensate → boiler-feed quality (electrolyzer make-up)`);

    // -- rotating equipment
    const co2KW = (B.energy.co2Compression * p.motorEff * sTrain / 24) * 1.1;
    hpAdd('CO₂ compressor (+ intercoolers)', 'steel', sizedKg(p.compressorKgPerKWAt100kW, co2KW, p.compressorSizeExponent), m.compressors, `${co2KW.toFixed(0)} kW, ${p.co2InletBar}→${p.pressureBar} bar`);
    const pumpKW = (B.energy.pumps * p.motorEff * sTrain / 24) * 1.2;
    hpAdd('HP NH₃ + carbamate pumps (duplex wetted)', 'duplex', sizedKg(p.pumpKgPerKWAt100kW, pumpKW, p.pumpSizeExponent) * 0.3, m.pumps, `${pumpKW.toFixed(1)} kW plunger/centrifugal`);
    hpAdd('HP pump frames', 'steel', sizedKg(p.pumpKgPerKWAt100kW, pumpKW, p.pumpSizeExponent) * 0.7, m.pumps, '');
    motorKW += (co2KW + pumpKW) * nTrains;
    // -- heat supply
    const heatKW = (B.energy.heat * S / 24);
    add('Electric steam generator / heat-store discharge exchanger', 'steel', p.steamGenSteelKgPerKW * heatKW, m.lpEquipment, `${heatKW.toFixed(0)} kW_th at nameplate (store priced by the engine)`, 'utilities');
    buy('Steam generator controls / elements', p.steamGenUsdPerKW * heatKW, 'PV-direct resistive elements', 'utilities', heatKW * 0.05 * price('nickel', p));
    if (p.heatSupply === 'mvr' && B.energy.mvr > 0) {
      const mvrKW = B.energy.mvr * p.motorEff * S / 24 * 1.1;
      add('Steam recompressor (MVR)', 'stainless-steel', sizedKg(p.mvr.kgPerKW, mvrKW, p.compressorSizeExponent), m.compressors, `${mvrKW.toFixed(0)} kW, COP ${B.cop.toFixed(2)}: 4.5 bar → stripper`, 'utilities');
      motorKW += mvrKW;
    }
    // -- air coolers
    const rejKW = B.rejectedKWhPerKg * S / 24;
    add('Air coolers (steel)', 'steel', p.airCoolerSteelKgPerKW * rejKW, m.airCoolers, `${rejKW.toFixed(0)} kW rejected (no cooling water on a desert coast)`, 'utilities');
    add('Air coolers (fins)', 'aluminium', p.airCoolerAluminiumKgPerKW * rejKW, m.airCoolers, '', 'utilities');
    motorKW += rejKW * p.fanKWhPerKWhRejected;

    // -- finishing
    const fin = B.fin;
    const tph = S / 24 / 1000;
    if (p.finishing !== 'solution') {
      const steelKg = fin.steelKgAt1Tph * tph ** fin.sizeExponent;
      add(`${fin.label}: equipment`, 'steel', steelKg * (1 - fin.stainlessFrac), m.finishing, fin.note, 'finishing');
      add(`${fin.label}: alloy parts`, 'stainless-steel', steelKg * fin.stainlessFrac, m.finishing, '', 'finishing');
      add(`${fin.label}: civil`, 'concrete', fin.concreteKgAt1Tph * tph ** fin.sizeExponent, m.civil, '', 'finishing');
      if (p.finishing === 'pastillation') {
        const beltM2 = tph * 1000 / fin.beltKgPerHM2;
        add('Pastillation belts (stainless)', 'stainless-steel', beltM2 * fin.beltStainlessKgPerM2, m.finishing, `${beltM2.toFixed(0)} m² belt at ${fin.beltKgPerHM2} kg/h·m²`, 'finishing');
        add('Belt cooler frames, sprays', 'steel', beltM2 * fin.beltFrameKgPerM2, m.finishing, '', 'finishing');
        buy('Drop formers (rotary, heated)', fin.dropFormerUsdPerTph * tph, 'one per belt', 'finishing');
      }
      buy(`${fin.label}: bought-in`, fin.fixedUsd * (tph / 4.17) ** 0.5, 'fans, screens, analysers', 'finishing');
      motorKW += fin.kWhPerKg * S / 24;
    }
    // -- storage and handling
    const storeM2 = (p.storageDays * S) / p.pileKgPerM2;
    add('Bulk store (steel frame + cladding)', 'steel', storeM2 * p.storeSteelKgPerM2, m.storage, `${p.storageDays} days, ${Math.round(storeM2)} m²`, 'storage');
    add('Bulk store floor + walls', 'concrete', storeM2 * p.storeConcreteKgPerM2, m.civil, '', 'storage');
    add('Reclaim + loading conveyors', 'steel', p.handlingSteelKgAt1Tph * tph ** p.handlingSizeExponent * 3, m.storage, 'sized for 3× production rate ship/truck loading', 'storage');

    // -- piping, structure, civil, electrical
    const hpAlloyPipe = c.liner ? 'ss316L-ug' : 'duplex';
    add('HP piping + fittings', hpAlloyPipe, hpKgPlant * p.hpPipingFrac * 0.4, m.piping, `${Math.round(p.hpPipingFrac * 100)}% of HP equipment mass, thinner than vessels`, 'hp');
    add('LP piping + fittings (stainless)', 'stainless-steel', lpKgPlant * p.lpPipingFrac, m.piping, '', 'lp');
    const t1 = sTrain / 1000;
    const structF = p.structureFactorByCondenser[p.condenser] ?? 1;
    add('Structure (HP + LP towers, racks)', 'steel', nTrains * p.structureSteelKgAt1tpd * structF * t1 ** p.structureSizeExponent, m.structure, `${nTrains} train${nTrains > 1 ? 's' : ''}, ${pool ? 'pool reactor at grade' : 'reactor elevated for gravity flow'}`, 'bop');
    add('Foundations', 'concrete', nTrains * p.concreteKgAt1tpd * t1 ** p.concreteSizeExponent, m.civil, '', 'bop');
    add('Interconnecting + utility piping (CS)', 'steel', p.interconnectPipingKgAt1tpd * (S / 1000) ** p.offsitesSizeExponent, m.piping, 'pipe racks, steam/condensate, cooling loop', 'bop');
    add('Offsites (flare, fire water, instrument air, day tanks)', 'steel', p.offsitesSteelKgAt1tpd * (S / 1000) ** p.offsitesSizeExponent, m.lpEquipment, 'per plant', 'bop');
    add('Buildings (control room, MCC, workshop)', 'steel', p.buildingsSteelKgAt1tpd * (S / 1000) ** 0.6, m.structure, '', 'bop');
    motorKW += B.energy.aux * S / 24 + B.energy.vacuum * S / 24;
    add('Motors + cabling (copper)', 'copper', motorKW * (p.motorCopperKgPerKW + p.electricalCopperKgPerKW), m.electrical, `${Math.round(motorKW)} kW connected`, 'bop');
    buy('Drives (VFD / soft starters)', motorKW * p.drivesUsdPerKW, 'turndown', 'bop');
    if (c.passivationO2MolPerMolCO2 > 0.002) buy('Passivation-air dosing + H₂ removal', 60000 * (S / 1e5) ** 0.6, `${(c.passivationO2MolPerMolCO2 * 100).toFixed(1)}% O₂ in the CO₂ keeps the 316L film`, 'hp');
    const sb = S / 1e5;
    buy('Instruments, DCS/SIS, analysers', p.instrumentsUsdAt100tpd * sb ** p.boughtInSizeExponent * (1 + 0.15 * (nTrains - 1)), 'HP level, NH₃ detection, carbamate-proof transmitters', 'bop');
    buy('HP valves (urea-grade alloy)', p.hpValvesUsdAt100tpd * sb ** p.boughtInSizeExponent * (p.pressureBar / 145) ** 0.6 * nTrains ** 0.3, 'control, let-down, isolation, relief', 'hp');
    const labourH = p.assemblyHoursAt100tpd * sb ** p.labourSizeExponent;
    buy('Assembly + erection labour', labourH * p.labourUsdPerHour, `${Math.round(labourH)} h`, 'bop');

    // -- sun-following extras: hot-standby of the blocked-in HP loop
    let standbyKWhPerKg = 0;
    if (sunFollowing) {
      // Per kg of daily output: the engine oversizes the unit by its nameplate factor, so the loop
      // surface (and its standby loss) is that factor larger than this 24 h-basis design.
      const lossKWh = hpSurfaceM2 * nTrains * p.sunNameplateFactor * p.standbyWPerM2 * p.blockInHours / 1000;
      standbyKWhPerKg = lossKWh / S + p.restartKWhPerKgDay * p.sunNameplateFactor;
      buy('Hot-standby tracing + block-in valves', 0.05 * p.hpValvesUsdAt100tpd * sb ** p.boughtInSizeExponent + 20 * hpSurfaceM2 * nTrains, 'electric tracing on HP vessels; tight-shut block valves', 'hp');
    }

    // -- roll up
    const equipmentUsd = parts.reduce((s2, x) => s2 + x.usdPlant, 0);
    const installedEquipmentUsd = equipmentUsd * p.installFactor;
    const engineeringUsd = p.engineeringUsdAt100tpd * sb ** p.boughtInSizeExponent + p.licenceUsdPerTpd * S / 1000;
    const installedUsd = installedEquipmentUsd + engineeringUsd;
    const materialsUsd = parts.reduce((s2, x) => s2 + x.usdMaterialsPlant, 0);
    const per = usd => usd / S;
    const outParts = parts.map(x => ({
      part: x.part, group: x.group, material: x.material, kg: per(x.kgPlant), usdMaterials: per(x.usdMaterialsPlant),
      manufacturing: x.manufacturing, usd: per(x.usdPlant), note: x.note,
    }));
    outParts.push({ part: `Installation (× ${p.installFactor})`, group: 'bop', material: null, kg: 0, usdMaterials: 0, manufacturing: null, usd: per(installedEquipmentUsd - equipmentUsd), note: 'erection, tie-ins, insulation, commissioning' });
    outParts.push({ part: 'Engineering, permits, licence', group: 'bop', material: null, kg: 0, usdMaterials: 0, manufacturing: null, usd: per(engineeringUsd), note: p.licenceUsdPerTpd > 0 ? `incl. licence $${p.licenceUsdPerTpd}/t·day` : 'repeat standard design' });
    outParts.sort((x, y) => y.usd - x.usd);
    const groups = {};
    for (const x of outParts) groups[x.group] = (groups[x.group] || 0) + x.usd;

    const energy = { ...B.energy, standby: standbyKWhPerKg };
    const kWhPerKg = Object.values(energy).reduce((s2, x) => s2 + x, 0);
    const heatShare = (energy.heat + energy.standby) / kWhPerKg;
    const installedUsdPerKgDay = per(installedUsd);
    const materialsUsdPerKgDay = per(materialsUsd);
    const recipeUsdPerKgDay = recipeAtSize(S);
    const minTurndown = sunFollowing ? p.trainMinTurndown : nTrains > 1 ? p.trainMinTurndown / nTrains : p.trainMinTurndown;
    const flexible = sunFollowing;
    const thermal = !sunFollowing && heatShare >= 0.5;
    // Variable O&M: conditioning agent, NH₃ vented with passivation inerts, other consumables.
    const variableOm = {
      conditioning: fin.ufKgPerKg * p.ufUsdPerKg,
      passivationNH3: c.passivationO2MolPerMolCO2 * p.nh3VentKgPerKgPerMolO2 * p.nh3UsdPerKg,
      other: p.otherVariableUsdPerKg,
    };
    const variableOmUsdPerKg = Object.values(variableOm).reduce((s2, x) => s2 + x, 0);
    const tPerYear = S * 365 / 1000;
    const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
    return {
      params: p,
      basis: 'per kg urea/day',
      plantKgPerDay: S,
      nTrains,
      synthesis: {
        pressureBar: p.pressureBar, reactorC: p.reactorC, nhRatio: B.s.a, hcRatio: B.s.b,
        equilibriumConversion: B.s.xEq, approach: B.s.approach, conversion: B.X, bubblePressureBar: B.s.pBubble,
        recycleCarbamateMolPerMol: B.recycleCarb, reactorM3PerTpd: reactorM3 * nTrains / (S / 1000), stripperM2PerTpd: stripM2 * nTrains / (S / 1000),
        stripping: p.stripping, condenser: p.condenser, vesselWallMm: rv.wallMm,
      },
      heat: B.kWhPerKgHeat,
      kJPerMol: B.kJPerMol,
      energy,
      kWhPerKg,
      heatShare,
      parts: outParts,
      groups,
      equipmentUsd,
      installedUsd,
      installedUsdPerKgDay,
      installedUsdPerTonneYear: installedUsd / tPerYear,
      materialsUsdPerKgDay,
      idiotIndex: installedUsdPerKgDay / materialsUsdPerKgDay,
      flexible,
      thermal,
      minTurndown,
      variableOm,
      variableOmUsdPerKg,
      warnings,
      recipeUsdPerKgDay,
      vsRecipe: {
        capexFactor: installedUsdPerKgDay / recipeUsdPerKgDay,
        energyFactor: kWhPerKg / RECIPE.urea.kWhPerKg,
        materialsFactor: materialsUsdPerKgDay / recipeUsdPerKgDay,
        variableOmFactor: variableOmUsdPerKg / RECIPE.urea.variableOmUsdPerKg,
      },
      kpis: [
        { label: 'Installed', value: `$${fmt(installedUsdPerKgDay)} per kg/day`, sub: `$${fmt(installedUsd / tPerYear)} per t/yr at ${fmt(S / 1000)} t/day · recipe at this size $${fmt(recipeUsdPerKgDay)}` },
        { label: 'Energy', value: `${fmt(kWhPerKg, 2)} kWh/kg`, sub: `heat ${fmt(energy.heat + energy.standby, 2)}, CO₂ compression ${fmt(energy.co2Compression, 3)}, finishing ${fmt(energy.finishing, 3)}` },
        { label: 'Idiot index', value: `${fmt(installedUsdPerKgDay / materialsUsdPerKgDay, 1)}×`, sub: `raw materials $${fmt(materialsUsdPerKgDay, 1)} per kg/day` },
        { label: 'Synthesis', value: `${p.pressureBar} bar, ${p.reactorC} °C, N/C ${B.s.a}`, sub: `CO₂ conversion ${fmt(B.X * 100, 1)}% (eq. ${fmt(B.s.xEq * 100, 1)}%), ${B.st.label.split(' (')[0]}` },
        { label: 'Build', value: `${c.label.split(',')[0]}`, sub: `${fin.label.split(' (')[0]} · ${nTrains} train${nTrains > 1 ? 's' : ''}` },
        { label: 'Operation', value: sunFollowing ? 'Sun-following' : thermal ? 'Baseload on a heat store' : 'Baseload, firmed', sub: `turndown to ${fmt(minTurndown * 100)}%${sunFollowing ? `, HP loop blocked in ${p.blockInHours} h/night` : thermal ? '' : ' · heat via steam recompression, so firmed as electricity'}` },
      ],
    };
  }

  // Installed $/kg-day vs plant size: small modular vs world scale.
  function scaleCurve(params = {}, sizesKgPerDay = [10000, 100000, 1000000, 3500000]) {
    return sizesKgPerDay.map(size => {
      const d = design({ ...params, plantKgPerDay: size });
      return { kgPerDay: size, nTrains: d.nTrains, usdPerKgDay: d.installedUsdPerKgDay, usdPerTonneYear: d.installedUsdPerTonneYear, recipeUsdPerKgDay: d.recipeUsdPerKgDay, idiotIndex: d.idiotIndex, kWhPerKg: d.kWhPerKg };
    });
  }

  // One knob swept: conversion, kWh/kg and installed $/kg-day (and a 24 h levelized $/kg).
  function sweep(params = {}, key, values, { usdPerKWh = 0.045, crf = 0.0937 } = {}) {
    return values.map(v => {
      const d = design({ ...params, [key]: v });
      return {
        [key]: v, conversion: d.synthesis.conversion, bubblePressureBar: d.synthesis.bubblePressureBar,
        kWhPerKg: d.kWhPerKg, installedUsdPerKgDay: d.installedUsdPerKgDay,
        usdPerKg: d.installedUsdPerKgDay * crf / 365 + d.kWhPerKg * usdPerKWh, warnings: d.warnings.length,
      };
    });
  }

  // Contract: what the company simulator needs. Costed at the scoreboard plant (100 × the pathways'
  // 1,000 kg/day reference) unless params.plantKgPerDay says otherwise, against the recipe scaled the
  // way the engine scales it to the same size.
  function simulatorOverride(params = {}) {
    const d = design(params);
    return {
      urea: {
        capexFactor: d.vsRecipe.capexFactor,
        energyFactor: d.vsRecipe.energyFactor,
        materialsFactor: d.vsRecipe.materialsFactor,
        variableOmFactor: d.vsRecipe.variableOmFactor,
        flexible: d.flexible,
        thermal: d.thermal,
        minTurndown: d.minTurndown,
      },
    };
  }

  return {
    id: 'urea',
    name: 'Solar-matched urea synthesis',
    summary: 'CO₂-stripping urea unit (pool reactor, lined vessels with duplex tubes, steam recompression, pastillation) priced from its equilibrium, carbamate-recycle heat balance and bill of materials; firmed baseload.',
    units: ['urea'],
    product: 'urea',
    RECIPE,
    ENGINE_SCALE,
    SCOREBOARD_SIZE_MULTIPLE,
    STOICH,
    OVERALL_EXOTHERM_KJ_PER_MOL,
    DEFAULTS,
    PRESETS,
    CONTROLS,
    equilibriumK,
    equilibriumConversion,
    bubblePressureBar,
    balance: params => balance(merge(params)),
    recipeAtSize,
    engineScaleFactor,
    design,
    scaleCurve,
    sweep,
    simulatorOverride,
  };
});
