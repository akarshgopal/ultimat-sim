// Solar-modulating Hall–Héroult aluminium smelter.
//
// A potline is a ~1,500 V string of electrolysis cells in series at 300–600 kA, the textbook baseload
// load: the pots keep their ~960 °C bath molten with their own ohmic heat, and a frozen cryolite ledge
// on the side walls protects the lining. Cut the current and the ledge grows into the cavity, then the
// bath freezes. On PV, batteries keep the line near full load all night, and they are the largest cost
// item of solar aluminium. Three things decide cost here:
//   • the cell — voltage from its electrochemistry (reversible voltage, overvoltages, bath ohmic
//     drop across the anode–cathode distance ACD, conductors), current efficiency, so kWh/kg;
//   • the heat balance — pot heat generation I·(V − CE·V_tn) against its losses (top/off-gas,
//     bottom, side walls through the ledge). The adjustable part sets how far the line can turn
//     down at night and boost by day: superheat and ledge-thickness windows, a shell heat
//     exchanger (insulate at night, blow air by day: the "EnPot"-type approach), duct draft, and
//     ACD (raise the anodes to make heat at low current, at a kWh cost);
//   • the hardware — pots, busbars, power conversion, fume treatment, potrooms, cranes, casthouse —
//     sized from amperage and pot count and priced as a bill of materials at commodity prices
//     (data/bom.js) × manufacturing factors × installation, so the idiot index is explicit.
//
// Basis: per kg of aluminium/day at the line's peak (rated) current, which is what the engine's "full
// load" means. A line that boosts to 1.3× nominal by day makes 1.3× more metal per pot at peak, so its
// $ per kg/day is lower; the engine derates output on nights that run below peak. Screening grade.
(function exposeSmelterDesign(root, factory) {
  const api = factory(typeof require === 'function' ? require('../../data/bom.js') : root.FoundryBom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.FoundryDesigns = root.FoundryDesigns || {})[api.id] = api;
})(globalThis, Bom => {
  const F = 96485.33212; // C/mol
  const M_AL = 26.9815e-3; // kg/mol
  // kWh per kg Al per volt of cell voltage at 100% current efficiency: 3F / M_Al / 3.6e6.
  const KWH_PER_KG_PER_V = (3 * F) / M_AL / 3.6e6; // 2.980
  // kg Al per A·day at 100% current efficiency.
  const KG_PER_A_DAY = (M_AL / (3 * F)) * 86400; // 8.05e-3

  // Thermoneutral energy: reactants enter at 25 °C, products leave at 960 °C (NIST-JANAF):
  //   ΔHf(Al₂O₃) = −1675.7, ΔHf(CO₂) = −393.5 kJ/mol; H(960 °C) − H(25 °C) of liquid Al incl. fusion
  //   ≈ 43 kJ/mol, of CO₂ ≈ 45 kJ/mol, of O₂ ≈ 31.3 kJ/mol.
  // Carbon anode:  Al₂O₃ + 1.5 C → 2 Al + 1.5 CO₂   ΔH = 1675.7 − 1.5·393.5 + 2·43 + 1.5·45 kJ
  // Inert anode:   Al₂O₃ → 2 Al + 1.5 O₂            ΔH = 1675.7 + 2·43 + 1.5·31.3 kJ
  const H_AL_960 = 43;
  const DH_CARBON_KJ_PER_MOL_AL = (1675.7 - 1.5 * 393.5 + 2 * H_AL_960 + 1.5 * 45) / 2; // ≈ 619 kJ
  const DH_INERT_KJ_PER_MOL_AL = (1675.7 + 2 * H_AL_960 + 1.5 * 31.3) / 2; // ≈ 904 kJ
  const THERMO_MIN_KWH_PER_KG = { carbon: DH_CARBON_KJ_PER_MOL_AL / M_AL / 3.6e6 * 1000, inert: DH_INERT_KJ_PER_MOL_AL / M_AL / 3.6e6 * 1000 };
  // Thermoneutral voltage: the voltage at which the cell makes exactly the reaction enthalpy.
  const V_TN = { carbon: THERMO_MIN_KWH_PER_KG.carbon / KWH_PER_KG_PER_V, inert: THERMO_MIN_KWH_PER_KG.inert / KWH_PER_KG_PER_V };

  // Recipe basis (data/pathways.js, pathway 'aluminium', node 'aluminium-smelter'): $1,890 per kg
  // Al/day (TeaScreening 'aluminium-smelter' 1,800 × Chile 1.05), 14 kWh/kg, reference 10,000 kg Al/day.
  // The 'silicon' pathway carries the same unit per kg of PV module (0.127 kg Al/kg): 241 / 0.127 ≈
  // $1,898 per kg Al/day and 1.78 / 0.127 ≈ 14.0 kWh/kg. The engine scales process capex by
  // (size/ref)^(0.85 − 1), floored at 0.4× (engine/company.js DEFAULTS.scale). The abundance scoreboard
  // prices 100 × ref = 1,000 t Al/day (≈ 365 kt/yr, below build.maxPlantKgPerDay 5,000 t/day), where
  // the recipe is 1890 × 100^−0.15 = $947 per kg/day (≈ $2,600 per t/yr).
  const RECIPE = Object.freeze({
    aluminium: Object.freeze({ usdPerKgDay: 1890, kWhPerKg: 14, pathwayId: 'aluminium', alsoPathways: Object.freeze(['silicon']), refKgPerDay: 10000 }),
  });
  const ENGINE_SCALE = Object.freeze({ exponent: 0.85, floorFactor: 0.4 });
  const ENGINE_BASELOAD_TURNDOWN = 0.7; // engine/utilization.js DEFAULTS.baseloadMinTurndown

  const DEFAULTS = Object.freeze({
    // ---- plant and cell
    plantKgAlPerDay: 1000000, // the plant the abundance scoreboard prices (10,000 kg/day reference × 100)
    amperageKA: 500, // nominal line current; modern pots 400–600 kA (AP60, DX+ Ultra, SY600)
    anodeCurrentDensity: 0.7, // A/cm² of anode area at nominal current; 0.75–0.95 in industry, lower = less kWh, more pot
    jMax: 1.25, // A/cm² above which anode bubbles/anode effects limit (boost ceiling)
    anode: 'carbon', // 'carbon' (prebaked, consumable) | 'inert' (O₂-evolving metal/cermet)
    anodes: Object.freeze({
      carbon: Object.freeze({ label: 'Prebaked carbon anodes (CO₂)', eRev: 1.20, eta0: 0.50, tafel: 0.12, bubbleV: 0.25, rOhmCm2: 0.33 }),
      inert: Object.freeze({ label: 'Inert (O₂-evolving) metal anodes', eRev: 2.20, eta0: 0.15, tafel: 0.06, bubbleV: 0.25, rOhmCm2: 0.15, kgPerM2: 250, lifeYears: 3 }),
    }),
    cathode: 'flat', // 'flat' (carbon block, metal pad) | 'drained' (TiB₂-coated, sloped, thin metal film)
    cathodes: Object.freeze({
      flat: Object.freeze({ label: 'Graphitized carbon cathode, 20 cm metal pad', rOhmCm2: 0.33, acdMinCm: 3.8, iLoss0: 0.040 }),
      drained: Object.freeze({ label: 'Drained TiB₂-coated cathode (no metal pad waves)', rOhmCm2: 0.36, acdMinCm: 2.2, iLoss0: 0.032, tib2KgPerM2: 30 }),
    }),
    etaCathodeV: 0.05,
    bathResistivityOhmCm: 0.45, // cryolite bath ~2.2 S/cm at 960 °C, 2–5% Al₂O₃
    bathFringeFactor: 1.15, // current spreads beyond the anode shadow
    acdNominalCm: 4.3, // anode–cathode distance at the design point (flat cathodes 4–5 cm)
    acdMaxCm: 7.0, // anodes can be raised this far to make heat at low current
    ceMin: 0.86, // below this the back reaction makes running pointless (also CE falls ~ 1/j)
    // ---- heat balance (per pot)
    superheatNomK: 8, // bath above liquidus at the design point
    superheatMinK: 5, // below: alumina dissolves poorly, sludge, anode effects
    superheatMaxK: 14, // above: current efficiency falls, ledge melts back
    bathSideHWPerM2K: 950, // bath/metal → ledge heat-transfer coefficient (600–2,000 in literature)
    liquidusC: 950,
    ambientC: 40, // potroom air in a desert
    ledgeConductivityWPerMK: 1.2, // frozen cryolite
    ledgeNomM: 0.08,
    ledgeMinM: 0.03, // ledge must protect the SiC side wall
    ledgeMaxM: 0.15, // thicker: ledge toe grows under the anodes, metal pad shrinks, MHD/sludge
    ledgeDensityKgPerM3: 2100,
    cryoliteLatentKJPerKg: 510,
    ledgeSwingNatural: 0.3, // share of the ledge window usable as a daily heat store, fixed shell cooling
    ledgeSwingHx: 0.7, // … with a shell heat exchanger steering the ledge
    sideWallROhm: 0.02, // m²K/W: SiC block + ramming paste + steel shell (thermal resistance)
    sideHeightM: 1.0, // shell side height exchanging heat with bath/metal through the ledge
    minFixedLossKWPerM2: 3.5, // best achievable top + bottom loss per m² of shell plan (today's pots ~6)
    topShareOfFixed: 0.72, // of the non-side heat loss: top (crust, anode cover, off-gas) vs bottom
    draftNm3sPerKA: 0.003, // duct draft per kA at nominal (≈ 1.2 Nm³/s for a 400 kA pot)
    draftMin: 1.0, // duct draft ÷ nominal, night (lower: fugitive HF)
    draftMax: 1.0, // duct draft ÷ nominal, day (higher: more top heat loss, bigger fume treatment)
    draftExponent: 0.3, // top heat loss ∝ draft^0.3 (hood air cools the crust)
    // Side-wall shell heat exchanger: external heat-transfer coefficient range hMin–hMax, W/m²K.
    // 'natural': fixed at what the design ledge needs. 'enpot': insulated jacket with fans (≈ ±30%
    // power, demonstrated on industrial pots). 'deep': thicker jacket insulation + bigger fans.
    shellHx: 'enpot',
    shellHxs: Object.freeze({
      natural: Object.freeze({ label: 'No shell heat exchanger (fixed shell cooling)', hMin: null, hMax: null, jacketKgPerM2: 0, fanFrac: 0, usdPerPot: 0 }),
      enpot: Object.freeze({ label: 'Shell heat exchangers: insulate at night, forced air by day', hMin: 6, hMax: 110, jacketKgPerM2: 35, fanFrac: 0.02, usdPerPot: 15000 }),
      deep: Object.freeze({ label: 'Deep-modulation shell: heavy insulated jacket, high-flow fans, draft control', hMin: 2.5, hMax: 200, jacketKgPerM2: 55, fanFrac: 0.025, usdPerPot: 30000 }),
    }),
    boostTarget: 1.3, // rated peak current ÷ nominal (busbars and power conversion sized for it)
    sunFullLoadHours: 8, // hours/day the line runs at peak on direct PV (engine baseload k ≈ 2–4)
    // ---- conductors and power
    busbarCurrentDensityAPerMm2: 0.4, // at rated peak current; economic optimum ~0.3–0.5 for Al bus
    busbarLengthPerPotM: 14, // busbar circuit per pot (risers + MHD compensation) at 400 kA
    busbarLengthExponent: 0.3, // larger pots need more compensation per pot
    aluminiumResistivityOhmM: 3.1e-8, // at ~60 °C
    coupling: 'dc-dc', // 'rectiformer' | 'dc-dc'
    couplings: Object.freeze({
      rectiformer: Object.freeze({ label: 'AC switchyard + rectiformers (diode/thyristor)', usdPerKW: 85, efficiency: 0.975, copperKgPerKW: 0.6, steelKgPerKW: 1.5 }),
      'dc-dc': Object.freeze({ label: 'PV-side DC/DC converters straight onto the potline (≈1,500 V)', usdPerKW: 35, efficiency: 0.99, copperKgPerKW: 0.25, steelKgPerKW: 0.6 }),
    }),
    auxKWhPerKg: 0.35, // fume treatment fans, compressed air, cranes, casthouse, lighting
    // ---- pot hardware
    cavityWidthM: 3.9, // two anode rows + channels
    liningThicknessM: 0.55, // side lining + shell clearance each side
    endAllowanceM: 0.6, // end channels and end walls, total
    maxCavityLengthM: 24, // longest practical cavity (largest pots today ~20–22 m)
    shellHeightM: 1.5,
    shellPlateMm: 20,
    cradleFrac: 1.0, // cradles/stiffeners ÷ shell plate mass
    cathodeBlockM: 0.45,
    cathodeDensityKgPerM3: 1650,
    rammingFrac: 0.12, // ramming paste ÷ cathode block mass
    sicThicknessM: 0.10,
    bottomLiningM: 0.40, // refractory + insulation under the cathode
    bottomLiningDensityKgPerM3: 1500,
    collectorKgPerKA: 30, // steel collector bars
    superstructureKgBase: 15000, // anode beam, jacks, feeders, hood, gas collection
    superstructureKgPerKA: 55,
    rodAlKgPerKA: 20, // anode rods (aluminium) incl. rodding-cycle spares
    rodSteelKgPerKA: 18, // yokes/stubs
    potControllerUsd: 10000,
    // ---- line and plant
    potPitchExtraM: 1.6, // pot pitch = shell width + this
    aisleM: 13, // potroom width = shell length + aisles
    potroomSteelKgPerM2: 45, // open-sided desert potroom (no cladding), crane runways
    potroomConcreteM: 0.35, // slab, pot foundations, basement equivalent thickness
    potsPerPTM: 40, // pots served per pot-tending machine
    ptmUsd: 3000000,
    gtcSteelKgPerNm3s: 18000, // dry scrubber + filters + ducts + fans per Nm³/s of draft
    aluminaStorageDays: 20,
    aluminaKgPerKgAl: 1.93,
    siloSteelPerKgStored: 0.025,
    handlingSteelKgPerKgDay: 0.5, // dense-phase conveying, ship unloader share
    roddingSteelKgPerKgDay: 1.2, // bath crushing, rod repair, anode assembly (carbon anodes only)
    roddingUsdPerKgDay: 6,
    casthouseSteelKgPerKgDay: 1.5,
    casthouseRefractoryKgPerKgDay: 1.5, // holding furnaces
    casthouseUsdPerKgDay: 12, // casting machines, stackers (ingot/sow)
    auxSteelKgPerKgDay: 2.0, // water, compressed air, workshops, stores, labs
    auxUsdPerPlant: 15e6, // offices, IT, lab equipment, mobile fleet
    instrumentsUsdPerPlant: 8e6, // potline DCS, substation protection, emissions monitoring
    engineeringUsdPerPlant: 30e6, // repeat standard potline design
    // ---- cost factors
    manufacturing: Object.freeze({ // finished part cost ÷ raw-material cost
      vessel: 2.5, cathode: 1.3, refractory: 2.0, sic: 5.0, mechanical: 3.0, busbar: 1.2, structural: 2.0,
      civil: 1.5, ducts: 2.5, fans: 5.0, electrical: 1.5, handling: 2.5, casthouse: 3.0, anode: 3.0, coating: 3.0,
    }),
    installFactor: 1.35,
    discountRate: 0.08, // for the present value of inert-anode replacements
    lifeYears: 20,
  });

  // 'today': a conventional greenfield 400 kA prebake potline, no heat-balance hardware, field-built in
  // enclosed potrooms with AC rectiformers; lands near the recipe at 1,000 t/day. 'lean' (DEFAULTS):
  // 500 kA pots at 0.7 A/cm² (low voltage, insulation-limited), shell heat exchangers for ±30%
  // modulation with a 1.3× day boost, DC/DC from PV, open desert potrooms, repeat engineering.
  const PRESETS = Object.freeze({
    today: Object.freeze({
      label: 'Today: conventional 400 kA prebake potline, constant amperage, AC rectiformers',
      params: Object.freeze({
        amperageKA: 400,
        anodeCurrentDensity: 0.85,
        acdNominalCm: 4.5,
        shellHx: 'natural',
        boostTarget: 1.0,
        coupling: 'rectiformer',
        busbarCurrentDensityAPerMm2: 0.4,
        busbarLengthPerPotM: 14,
        superstructureKgBase: 25000,
        superstructureKgPerKA: 70,
        collectorKgPerKA: 35,
        potControllerUsd: 25000,
        potroomSteelKgPerM2: 110,
        potroomConcreteM: 0.6,
        potsPerPTM: 30,
        ptmUsd: 5000000,
        gtcSteelKgPerNm3s: 30000,
        aluminaStorageDays: 30,
        handlingSteelKgPerKgDay: 1.2,
        roddingSteelKgPerKgDay: 3,
        roddingUsdPerKgDay: 20,
        casthouseSteelKgPerKgDay: 4,
        casthouseRefractoryKgPerKgDay: 3,
        casthouseUsdPerKgDay: 35,
        auxSteelKgPerKgDay: 6,
        auxUsdPerPlant: 40e6,
        instrumentsUsdPerPlant: 15e6,
        engineeringUsdPerPlant: 60e6,
        manufacturing: {
          vessel: 3.5, cathode: 1.5, refractory: 2.5, sic: 6, mechanical: 4.5, busbar: 1.5, structural: 3,
          civil: 2, ducts: 4, fans: 6, electrical: 2.5, handling: 4, casthouse: 4, anode: 4, coating: 4,
        },
        installFactor: 1.45,
      }),
    }),
    lean: Object.freeze({
      label: 'Lean solar-modulating: 500 kA low-current-density pots with shell heat exchangers, 1.3× day boost, DC/DC from PV',
      params: Object.freeze({}),
    }),
    deep: Object.freeze({
      label: 'Lean with deep-modulation shells (heavy insulated jackets, draft 0.6–1.8×)',
      params: Object.freeze({ shellHx: 'deep', draftMin: 0.6, draftMax: 1.8, boostTarget: 1.4 }),
    }),
    drained: Object.freeze({
      label: 'Lean with drained TiB₂ cathodes and carbon anodes (3 cm ACD)',
      params: Object.freeze({ cathode: 'drained', acdNominalCm: 3.0 }),
    }),
    inertDrained: Object.freeze({
      label: 'Lean with inert anodes and drained TiB₂ cathodes (development)',
      params: Object.freeze({ anode: 'inert', cathode: 'drained', acdNominalCm: 3.0 }),
    }),
  });

  const CONTROLS = Object.freeze([
    { key: 'plantKgAlPerDay', label: 'Plant size', unit: 'kg Al/day', min: 50000, max: 5000000, step: 50000, hint: 'Scoreboard plants are 1,000 t/day (~365 kt/yr)' },
    { key: 'amperageKA', label: 'Line current (nominal)', unit: 'kA', min: 150, max: 800, step: 25, hint: 'Bigger pots: fewer pots, more busbar per pot' },
    { key: 'anodeCurrentDensity', label: 'Anode current density', unit: 'A/cm²', min: 0.6, max: 1.1, step: 0.01, hint: 'Higher: smaller pots, higher voltage' },
    { key: 'acdNominalCm', label: 'Anode–cathode distance', unit: 'cm', min: 2, max: 6, step: 0.1, hint: 'Bath ohmic drop; the pot lining is designed to close the heat balance here' },
    { key: 'shellHx', label: 'Heat-balance hardware', options: [['natural', 'None (constant amperage)'], ['enpot', 'Shell heat exchangers (±30%)'], ['deep', 'Deep-modulation shells']] },
    { key: 'boostTarget', label: 'Day boost (peak ÷ nominal current)', min: 1, max: 1.6, step: 0.05, hint: 'Busbars and power sized for the peak; capped by heat balance' },
    { key: 'draftMin', label: 'Night duct draft', min: 0.4, max: 1, step: 0.05, hint: '÷ nominal; less top heat loss' },
    { key: 'draftMax', label: 'Day duct draft', min: 1, max: 2.5, step: 0.05, hint: '÷ nominal; more top heat loss, bigger fume treatment' },
    { key: 'anode', label: 'Anode', options: [['carbon', 'Prebaked carbon'], ['inert', 'Inert (O₂-evolving)']] },
    { key: 'cathode', label: 'Cathode', options: [['flat', 'Flat carbon, metal pad'], ['drained', 'Drained TiB₂']] },
    { key: 'busbarCurrentDensityAPerMm2', label: 'Busbar current density', unit: 'A/mm²', min: 0.15, max: 0.8, step: 0.01, hint: 'Aluminium in busbars vs I²R loss' },
    { key: 'coupling', label: 'Power conversion', options: [['dc-dc', 'DC/DC from PV'], ['rectiformer', 'AC rectiformers']] },
    { key: 'sunFullLoadHours', label: 'Peak hours on direct PV', unit: 'h/day', min: 4, max: 14, step: 0.5, hint: 'Converts the night floor into the engine\'s daily turndown' },
    { key: 'installFactor', label: 'Install factor', min: 1, max: 3, step: 0.05, hint: 'Installed ÷ delivered equipment' },
  ]);

  function merge(params = {}) {
    const p = { ...DEFAULTS, ...params };
    for (const k of ['manufacturing', 'anodes', 'cathodes', 'shellHxs', 'couplings']) p[k] = { ...DEFAULTS[k], ...(params[k] || {}) };
    // Pot length is capped (MHD stability, crane span, shell stiffness): at low current density the
    // pot carries less current, not a longer cavity.
    const maxKA = p.anodeCurrentDensity * 1e4 * (p.maxCavityLengthM - p.endAllowanceM) * (p.cavityWidthM - 0.7) / 1000;
    p.amperageKA = Math.min(p.amperageKA, maxKA);
    return p;
  }

  function commodity(name) {
    return Bom.COMMODITIES[name].usdPerKg;
  }

  function recipeAtSize(kgPerDay) {
    const recipe = RECIPE.aluminium;
    const f = (kgPerDay / recipe.refKgPerDay) ** (ENGINE_SCALE.exponent - 1);
    return recipe.usdPerKgDay * Math.max(ENGINE_SCALE.floorFactor, Math.min(1, f));
  }

  // ------------------------------------------------------------------ cell model
  // One pot at nominal current I₀ (A). x = I / I₀. Returns closures for voltage, current efficiency,
  // heat generation and the heat-loss window; all heat in W.
  function cellModel(p) {
    const an = p.anodes[p.anode] || p.anodes.carbon;
    const ca = p.cathodes[p.cathode] || p.cathodes.flat;
    const hx = p.shellHxs[p.shellHx] || p.shellHxs.natural;
    const vtn = V_TN[p.anode === 'inert' ? 'inert' : 'carbon'];
    const I0 = p.amperageKA * 1000;
    const j0 = p.anodeCurrentDensity;
    const acdMin = ca.acdMinCm;
    const acdMax = p.acdMaxCm;
    // Geometry: two rows of anodes in a cavity of fixed width; length from the anode area.
    const anodeM2 = I0 / (j0 * 1e4);
    const anodeRowsWidthM = p.cavityWidthM - 0.7; // centre + side channels
    const cavityL = anodeM2 / anodeRowsWidthM + p.endAllowanceM;
    const shellL = cavityL + 2 * p.liningThicknessM;
    const shellW = p.cavityWidthM + 2 * p.liningThicknessM;
    const sideM2 = 2 * (cavityL + p.cavityWidthM) * p.sideHeightM;
    const geo = { anodeM2, cavityL, cavityW: p.cavityWidthM, shellL, shellW, sideM2, planM2: shellL * shellW };
    // Busbar sized for the rated peak current.
    const iPeakRated = I0 * p.boostTarget;
    const busM2 = iPeakRated / (p.busbarCurrentDensityAPerMm2 * 1e6);
    const busL = p.busbarLengthPerPotM * (p.amperageKA / 400) ** p.busbarLengthExponent;
    const busOhm = p.aluminiumResistivityOhmM * busL / busM2;
    Object.assign(geo, { busM2, busL, busKg: busM2 * busL * 2700, busOhm }); // Al 2,700 kg/m³

    const j = x => x * j0;
    // Cell voltage: reversible + Tafel anode overvoltage (referenced to 0.85 A/cm²) + cathode
    // overvoltage + bath ohmic drop + bubble layer + anode/cathode conductor drops.
    const vPot = (x, acd) => {
      const jj = Math.max(j(x), 1e-3);
      const etaA = Math.max(0.05, an.eta0 + an.tafel * Math.log10(jj / 0.85));
      return an.eRev + etaA + p.etaCathodeV
        + jj * p.bathResistivityOhmCm * acd / p.bathFringeFactor
        + an.bubbleV * (jj / 0.85) ** 0.6
        + jj * (an.rOhmCm2 + ca.rOhmCm2);
    };
    const vBus = x => x * I0 * busOhm;
    // Current efficiency: a back-reaction loss current (re-oxidation of dissolved metal) that rises
    // with superheat and, for flat cathodes, as metal-pad waves bring metal closer to the anode.
    const ce = (x, acd, superheat) => {
      const iLoss = ca.iLoss0 * (1 + 0.03 * (superheat - 8)) * (p.cathode === 'drained' ? 1 : Math.sqrt(4.5 / Math.max(acd, 1)));
      return Math.max(0, 1 - iLoss / Math.max(j(x), 1e-6));
    };
    const gen = (x, acd, superheat) => x * I0 * (vPot(x, acd) - ce(x, acd, superheat) * vtn);

    // Side wall: steady ledge thickness for side heat flux q (W/m²) and external coefficient h:
    //   q = (T_liq − T_air) / (x_L/k_L + R_wall + 1/h)
    const dT = p.liquidusC - p.ambientC;
    const qNom = p.bathSideHWPerM2K * p.superheatNomK;
    const hNom = 1 / Math.max(1e-6, dT / qNom - p.ledgeNomM / p.ledgeConductivityWPerMK - p.sideWallROhm);
    const hMin = hx.hMin == null ? hNom : Math.min(hx.hMin, hNom);
    const hMax = hx.hMax == null ? hNom : Math.max(hx.hMax, hNom);
    const qLo = dT / (p.ledgeMaxM / p.ledgeConductivityWPerMK + p.sideWallROhm + 1 / hMin);
    const qHi = dT / (p.ledgeMinM / p.ledgeConductivityWPerMK + p.sideWallROhm + 1 / hMax);
    const qMin = Math.max(qLo, p.bathSideHWPerM2K * p.superheatMinK);
    const qMax = Math.min(qHi, p.bathSideHWPerM2K * p.superheatMaxK);
    // Design point: the lining (top + bottom) is designed to close the balance at x = 1, nominal ACD,
    // nominal superheat and draft. Top + bottom losses cannot be insulated below a floor flux (anode
    // cover, crust, collector bars, cathode bottom): a low-voltage cell that makes less heat than that
    // must run a longer ACD than asked for, so low current density and short ACD meet a thermal wall.
    function sideM2Q(q) { return q * sideM2; }
    const sideNom = sideM2Q(qNom);
    const fixedFloor = p.minFixedLossKWPerM2 * 1000 * geo.planM2;
    let acdNom = p.acdNominalCm;
    if (gen(1, acdNom, p.superheatNomK) < sideNom + fixedFloor) {
      let lo = acdNom;
      let hi = 30;
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (gen(1, mid, p.superheatNomK) >= sideNom + fixedFloor) hi = mid; else lo = mid;
      }
      acdNom = hi;
    }
    const thermallyLimited = acdNom > p.acdNominalCm + 1e-9;
    const genNom = gen(1, acdNom, p.superheatNomK);
    const fixedNom = genNom - sideNom;
    const topNom = p.topShareOfFixed * fixedNom;
    const bottom = fixedNom - topNom;
    const top = d => topNom * d ** p.draftExponent;
    const lossNom = genNom;
    const window = {
      lossMin: bottom + top(Math.min(1, p.draftMin)) + sideM2Q(qMin),
      lossNom,
      lossMax: bottom + top(Math.max(1, p.draftMax)) + sideM2Q(qMax),
      sideMin: sideM2Q(qMin), sideMax: sideM2Q(qMax), qMin, qMax, qLo, qHi, hNom, hMin, hMax,
    };
    // The ledge is also a latent-heat store over a day: it may freeze thicker through the night
    // (releasing heat) and melt back by day (absorbing it) within its thickness window.
    const ledgeSwingM = Math.max(0, (p.ledgeMaxM - p.ledgeMinM) * (hx.hMin == null ? p.ledgeSwingNatural : p.ledgeSwingHx));
    const ledgeBufferJ = sideM2 * ledgeSwingM * p.ledgeDensityKgPerM3 * p.cryoliteLatentKJPerKg * 1000;
    Object.assign(window, { ledgeSwingM, ledgeBufferKWh: ledgeBufferJ / 3.6e6 });
    const heat = { genNom, sideNom, topNom, bottom, qNom, sideShare: sideNom / genNom, topShare: topNom / genNom, bottomShare: bottom / genNom };

    // Superheat that goes with a total heat loss L between the min/nominal/max settings (side and
    // draft move together, linearly between the three set points).
    const superheatFor = L => {
      const q = L <= lossNom
        ? qMin + (qNom - qMin) * Math.max(0, Math.min(1, (L - window.lossMin) / Math.max(lossNom - window.lossMin, 1e-9)))
        : qNom + (qMax - qNom) * Math.max(0, Math.min(1, (L - lossNom) / Math.max(window.lossMax - lossNom, 1e-9)));
      return q / p.bathSideHWPerM2K;
    };
    const solveAcd = (x, L, lo, hi) => {
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (gen(x, mid, superheatFor(L)) >= L) hi = mid; else lo = mid;
      }
      return hi;
    };
    // Steady operating point at x. bufferW: average heat the ledge may supply (night, > 0) or absorb
    // (day, < 0) over the cycle. Operating policy:
    //   x ≤ 1 — keep ACD at its nominal (stability margin) and cut losses (low superheat, insulated
    //           shell, low draft); only when even the minimum loss is too much, raise the anodes;
    //   x > 1 — at nominal losses first lower ACD toward its MHD minimum (saves energy), then open
    //           the losses (superheat, forced air, draft) up to their maximum.
    function operate(x, bufferW = 0) {
      if (j(x) > p.jMax + 1e-9) return { feasible: false, reason: 'anode current density' };
      let acd = acdNom;
      let L;
      const lossMin = window.lossMin - Math.max(0, bufferW);
      const lossMax = window.lossMax + Math.max(0, -bufferW);
      const atNom = gen(x, acd, p.superheatNomK);
      if (x <= 1) {
        if (atNom >= lossMin) {
          L = Math.min(atNom, lossNom);
        } else {
          if (gen(x, acdMax, superheatFor(lossMin)) < lossMin) return { feasible: false, reason: 'freezes: ledge grows', acd: acdMax };
          L = lossMin;
          acd = solveAcd(x, L, acdNom, acdMax);
        }
      } else if (gen(x, acdMin, p.superheatNomK) <= lossNom) {
        L = lossNom;
        acd = solveAcd(x, L, acdMin, acdNom);
      } else {
        acd = acdMin;
        L = gen(x, acd, p.superheatNomK);
        // Superheat rises with the loss it has to carry; iterate the small CE coupling.
        for (let i = 0; i < 4; i += 1) L = gen(x, acd, superheatFor(Math.min(L, lossMax)));
        if (L > lossMax * (1 + 1e-9)) return { feasible: false, reason: 'overheats: ledge melts', acd };
      }
      const superheat = superheatFor(Math.max(window.lossMin, Math.min(window.lossMax, L + Math.max(0, bufferW))));
      const eff = ce(x, acd, superheat);
      if (eff < p.ceMin) return { feasible: false, reason: 'current efficiency', acd, superheat, ce: eff };
      return { feasible: true, x, j: j(x), acd, superheat, ce: eff, vPot: vPot(x, acd), vBus: vBus(x), heatW: L, kgPerDay: KG_PER_A_DAY * x * I0 * eff };
    }

    // Lowest and highest current the heat balance allows, by bisection between a feasible lo and an
    // infeasible hi (the feasible set is an interval).
    function edge(lo, hi, bufferW) {
      for (let i = 0; i < 50; i += 1) {
        const mid = (lo + hi) / 2;
        if (operate(mid, bufferW).feasible) lo = mid; else hi = mid;
      }
      return lo;
    }
    const xHi = p.jMax / j0;
    const lowest = bufferW => (operate(0.02, bufferW).feasible ? 0.02 : edge(1, 0.02, bufferW));
    const highest = bufferW => (operate(xHi, bufferW).feasible ? xHi : edge(1, xHi, bufferW));
    const ok1 = operate(1).feasible;
    const H = Math.min(23, Math.max(1, p.sunFullLoadHours));
    const nightBufferW = ledgeBufferJ / ((24 - H) * 3600);
    const dayBufferW = -ledgeBufferJ / (H * 3600);
    return {
      an, ca, vtn, I0, j0, geo, heat, window, acdNom, thermallyLimited, gen, vPot, vBus, ce, operate, acdMin, acdMax, nightBufferW, dayBufferW,
      // Steady state (days on end), and the daily cycle with the ledge as a heat store.
      xMinSteady: ok1 ? lowest(0) : 1,
      xMaxSteady: ok1 ? highest(0) : 1,
      xMin: ok1 ? lowest(nightBufferW) : 1,
      xMaxPhys: ok1 ? highest(dayBufferW) : 1,
    };
  }

  // ------------------------------------------------------------------ design
  function design(params = {}) {
    const p = merge(params);
    const cell = cellModel(p);
    const { geo, I0 } = cell;
    const coupling = p.couplings[p.coupling] || p.couplings.rectiformer;
    const hx = p.shellHxs[p.shellHx] || p.shellHxs.natural;

    // ---- operating envelope
    const xPeak = Math.max(1, Math.min(p.boostTarget, cell.xMaxPhys));
    const xNight = Math.min(cell.xMin, xPeak);
    const peak = cell.operate(xPeak, cell.dayBufferW);
    const night = cell.operate(xNight, cell.nightBufferW);
    const nominal = cell.operate(1);
    const nightFloor = xNight / xPeak; // lowest steady load ÷ rated peak
    // The engine's minTurndown is a daily-energy floor (worst month: direct PV + store ≥ t × 24 h of
    // full load). A line at peak for H hours on direct PV and at the night floor the rest of the day:
    const H = Math.min(24, Math.max(0, p.sunFullLoadHours));
    const minTurndown = Math.min(1, nightFloor + (1 - nightFloor) * H / 24);

    // ---- energy per kg (AC at the PV bus), production-weighted over the day/night cycle
    const fanW = op => (p.shellHx === 'natural' ? 0 : Math.max(0, op.heatW - cell.window.lossNom) * hx.fanFrac);
    const kWhAt = op => (KWH_PER_KG_PER_V * (op.vPot + op.vBus) / op.ce) / coupling.efficiency
      + p.auxKWhPerKg + fanW(op) * 24 / 1000 / op.kgPerDay;
    const prodDay = peak.kgPerDay * H;
    const prodNight = night.kgPerDay * (24 - H);
    const kWhPeak = kWhAt(peak);
    const kWhNight = kWhAt(night);
    const kWhNominal = kWhAt(nominal);
    const kWhPerKg = (kWhPeak * prodDay + kWhNight * prodNight) / (prodDay + prodNight);
    const dcKWhPerKg = (KWH_PER_KG_PER_V * (peak.vPot + peak.vBus) / peak.ce * prodDay + KWH_PER_KG_PER_V * (night.vPot + night.vBus) / night.ce * prodNight) / (prodDay + prodNight);
    const thermoMin = THERMO_MIN_KWH_PER_KG[p.anode === 'inert' ? 'inert' : 'carbon'];

    // ---- pot count and line
    const potKgPerDayPeak = peak.kgPerDay;
    const nPots = Math.max(1, Math.ceil(p.plantKgAlPerDay / potKgPerDayPeak - 1e-9));
    const lineV = nPots * (peak.vPot + peak.vBus);
    const peakKW = nPots * xPeak * I0 * (peak.vPot + peak.vBus) / 1000; // DC at the line
    const nLines = Math.max(1, Math.ceil(lineV / 1800 - 1e-9)); // ≤ ~1,800 V per line (insulation, safety)

    // ---- bill of materials, per plant
    const parts = [];
    const add = (part, material, kg, mfgKey, note) => {
      const usdMaterials = kg * commodity(material);
      const manufacturing = p.manufacturing[mfgKey];
      parts.push({ part, material, kgPlant: kg, usdMaterialsPlant: usdMaterials, manufacturing, usdPlant: usdMaterials * manufacturing, note });
    };
    const buy = (part, usd, note) => parts.push({ part, material: null, kgPlant: 0, usdMaterialsPlant: 0, manufacturing: null, usdPlant: usd, note });
    const steelDensity = 7850;
    const shellPlateM2 = 2 * (geo.shellL + geo.shellW) * p.shellHeightM + geo.planM2;
    const shellKg = shellPlateM2 * p.shellPlateMm / 1000 * steelDensity * (1 + p.cradleFrac);
    const cathodeKg = geo.cavityL * geo.cavityW * p.cathodeBlockM * p.cathodeDensityKgPerM3;
    const sicKg = 2 * (geo.cavityL + geo.cavityW) * p.sideHeightM * p.sicThicknessM * 2700;
    const bottomKg = geo.shellL * geo.shellW * p.bottomLiningM * p.bottomLiningDensityKgPerM3;
    const potLabel = `${nPots} pots × ${p.amperageKA} kA, ${geo.shellL.toFixed(1)} × ${geo.shellW.toFixed(1)} m`;
    add('Pot shells and cradles', 'steel', nPots * shellKg, 'vessel', `${potLabel}, ${p.shellPlateMm} mm plate`);
    add('Cathode blocks + ramming paste', 'graphite', nPots * cathodeKg * (1 + p.rammingFrac), 'cathode', 'graphitized blocks (priced at the graphite commodity)');
    add('SiC side-wall blocks', 'refractory', nPots * sicKg, 'sic', 'Si₃N₄-bonded SiC (priced as refractory × SiC factor)');
    add('Bottom lining (refractory + insulation)', 'refractory', nPots * bottomKg, 'refractory', `${p.bottomLiningM} m`);
    add('Collector bars', 'steel', nPots * p.collectorKgPerKA * p.amperageKA, 'mechanical', '');
    add('Superstructure, anode beam, feeders, hoods', 'steel', nPots * (p.superstructureKgBase + p.superstructureKgPerKA * p.amperageKA), 'mechanical', '');
    if (p.anode === 'inert') {
      const kg = nPots * geo.anodeM2 * cell.an.kgPerM2;
      // Initial set plus the present value of replacements over the plant life.
      let pv = 1;
      for (let t = cell.an.lifeYears; t < p.lifeYears; t += cell.an.lifeYears) pv += (1 + p.discountRate) ** -t;
      add('Inert anodes (Cu–Ni–Fe alloy, initial + PV of replacements)', 'nickel', kg * 0.4 * pv, 'anode', `${(kg / nPots / 1000).toFixed(1)} t per pot, ${cell.an.lifeYears}-yr life`);
      add('Inert anodes, copper share', 'copper', kg * 0.4 * pv, 'anode', '');
      add('Inert anodes, iron share', 'steel', kg * 0.2 * pv, 'anode', '');
      add('Anode rods (aluminium)', 'aluminium', nPots * p.rodAlKgPerKA * p.amperageKA * 0.6, 'mechanical', 'no rodding cycle: fewer spares');
    } else {
      add('Anode rods (aluminium)', 'aluminium', nPots * p.rodAlKgPerKA * p.amperageKA, 'mechanical', 'incl. rodding-cycle spares');
      add('Anode yokes and stubs', 'steel', nPots * p.rodSteelKgPerKA * p.amperageKA, 'mechanical', '');
    }
    if (p.cathode === 'drained') {
      add('TiB₂ cathode coating', 'titanium', nPots * geo.cavityL * geo.cavityW * cell.ca.tib2KgPerM2, 'coating', 'priced at titanium sponge (proxy)');
    }
    if (p.shellHx !== 'natural') {
      const jacketKg = nPots * 2 * (geo.shellL + geo.shellW) * p.shellHeightM * hx.jacketKgPerM2;
      add('Shell heat-exchanger jackets + dampers', 'steel', jacketKg, 'ducts', `h ${cell.window.hMin.toFixed(0)}–${cell.window.hMax.toFixed(0)} W/m²K`);
      const fanKW = nPots * Math.max(0, cell.window.sideMax - cell.window.sideMin) * hx.fanFrac / 1000;
      add('Shell cooling fans', 'steel', fanKW * 25, 'fans', `${Math.round(fanKW)} kW`);
      add('Shell cooling fan motors', 'copper', fanKW * 1.5, 'fans', '');
      buy('Shell heat-balance controls', nPots * hx.usdPerPot, 'thermocouples, ledge sensing, damper actuators');
    }
    add('Busbars (aluminium)', 'aluminium', nPots * geo.busKg, 'busbar', `${(geo.busM2 * 1e4).toFixed(0)} cm² at ${p.busbarCurrentDensityAPerMm2} A/mm² peak, ${geo.busL.toFixed(0)} m/pot`);
    buy('Power conversion', coupling.usdPerKW * peakKW, `${coupling.label}, ${(peakKW / 1000).toFixed(0)} MW DC peak, ${nLines} line${nLines > 1 ? 's' : ''} × ${(lineV / nLines).toFixed(0)} V`);
    add('Power conversion copper', 'copper', coupling.copperKgPerKW * peakKW, 'electrical', '');
    add('Power conversion steel', 'steel', coupling.steelKgPerKW * peakKW, 'electrical', 'transformer cores/tanks, cabinets');
    const draftPeak = p.draftNm3sPerKA * p.amperageKA * Math.max(1, p.draftMax) * Math.max(1, xPeak);
    add('Fume treatment (dry alumina scrubbers, filters, ducts, fans)', 'steel', nPots * draftPeak * p.gtcSteelKgPerNm3s, 'mechanical', `${(nPots * draftPeak).toFixed(0)} Nm³/s`);
    const roomM2 = nPots * (geo.shellW + p.potPitchExtraM) * (geo.shellL + p.aisleM);
    add('Potroom steel (frame, roof, crane runways)', 'steel', roomM2 * p.potroomSteelKgPerM2, 'structural', `${Math.round(roomM2 / 1000)}k m²`);
    add('Potroom concrete (slab, pot foundations)', 'concrete', roomM2 * p.potroomConcreteM * 2400, 'civil', '');
    buy('Pot-tending machines', Math.ceil(nPots / p.potsPerPTM) * p.ptmUsd, `${Math.ceil(nPots / p.potsPerPTM)} machines`);
    const plantKg = p.plantKgAlPerDay;
    add('Alumina silos', 'steel', plantKg * p.aluminaKgPerKgAl * p.aluminaStorageDays * p.siloSteelPerKgStored, 'handling', `${p.aluminaStorageDays} days`);
    add('Alumina handling (dense phase, unloader share)', 'steel', plantKg * p.handlingSteelKgPerKgDay, 'handling', '');
    if (p.anode !== 'inert') {
      add('Rodding shop and bath treatment', 'steel', plantKg * p.roddingSteelKgPerKgDay, 'mechanical', 'anodes bought baked');
      buy('Rodding shop equipment', plantKg * p.roddingUsdPerKgDay, '');
    }
    add('Casthouse structure and furnace shells', 'steel', plantKg * p.casthouseSteelKgPerKgDay, 'casthouse', '');
    add('Holding furnace refractory', 'refractory', plantKg * p.casthouseRefractoryKgPerKgDay, 'refractory', '');
    buy('Casting machines', plantKg * p.casthouseUsdPerKgDay, 'ingot/sow lines');
    add('Auxiliaries: water, compressed air, workshops, stores', 'steel', plantKg * p.auxSteelKgPerKgDay, 'mechanical', '');
    buy('Offices, laboratory, mobile fleet', p.auxUsdPerPlant, 'per plant');
    buy('Pot controllers + potline DCS', nPots * p.potControllerUsd + p.instrumentsUsdPerPlant, `${nPots} pots`);

    const equipmentUsd = parts.reduce((s, x) => s + x.usdPlant, 0);
    const installedEquipmentUsd = equipmentUsd * p.installFactor;
    const installedUsd = installedEquipmentUsd + p.engineeringUsdPerPlant;
    const materialsUsd = parts.reduce((s, x) => s + x.usdMaterialsPlant, 0);
    const perKgDay = usd => usd / plantKg;
    const outParts = parts.map(x => ({
      part: x.part, material: x.material, kg: perKgDay(x.kgPlant), usdMaterials: perKgDay(x.usdMaterialsPlant),
      manufacturing: x.manufacturing, usd: perKgDay(x.usdPlant), note: x.note,
    }));
    outParts.push({ part: `Installation (× ${p.installFactor})`, material: null, kg: 0, usdMaterials: 0, manufacturing: null, usd: perKgDay(installedEquipmentUsd - equipmentUsd), note: 'erection, commissioning, pot preheat and start-up' });
    outParts.push({ part: 'Engineering, permits, owner', material: null, kg: 0, usdMaterials: 0, manufacturing: null, usd: perKgDay(p.engineeringUsdPerPlant), note: 'per plant' });
    outParts.sort((a, b) => b.usd - a.usd);

    const installedUsdPerKgDay = perKgDay(installedUsd);
    const materialsUsdPerKgDay = perKgDay(materialsUsd);
    const recipeUsdPerKgDay = recipeAtSize(plantKg);
    const tPerYear = plantKg * 365 / 1000;
    const pct = v => `${(100 * v).toFixed(0)}%`;
    const h = cell.heat;
    return {
      params: p,
      basis: 'per kg Al/day at rated peak current',
      nPots,
      nLines,
      lineVoltage: lineV / nLines,
      peakMW: peakKW / 1000,
      pot: { ...geo, kgPerDayPeak: potKgPerDayPeak, kgPerDayNominal: nominal.kgPerDay, shellKg, cathodeKg, sicKg, bottomKg },
      heat: {
        genNomKW: h.genNom / 1000,
        sideShare: h.sideShare, topShare: h.topShare, bottomShare: h.bottomShare,
        lossMinKW: cell.window.lossMin / 1000, lossMaxKW: cell.window.lossMax / 1000,
        sideFluxKWPerM2: [cell.window.qMin / 1000, cell.window.qMax / 1000],
        hExt: [cell.window.hMin, cell.window.hNom, cell.window.hMax],
        vThermoneutral: cell.vtn,
      },
      envelope: {
        xMin: cell.xMin, xMaxPhysical: cell.xMaxPhys, xMinSteady: cell.xMinSteady, xMaxSteady: cell.xMaxSteady, xPeak,
        ledgeBufferKWh: cell.window.ledgeBufferKWh, ledgeSwingM: cell.window.ledgeSwingM,
        acdNomCm: cell.acdNom, thermallyLimited: cell.thermallyLimited, xNight, nightFloor, minTurndown,
        peak, night, nominal,
      },
      kWhPerKg,
      kWhPeak,
      kWhNight,
      kWhNominal,
      dcKWhPerKg,
      thermoMinKWhPerKg: thermoMin,
      parts: outParts,
      equipmentUsd,
      installedUsd,
      installedUsdPerKgDay,
      installedUsdPerTonneYear: installedUsd / tPerYear,
      materialsUsdPerKgDay,
      idiotIndex: installedUsdPerKgDay / materialsUsdPerKgDay,
      flexible: false, // a potline never stops: it is firmed, with the turndown above
      minTurndown,
      recipeUsdPerKgDay,
      vsRecipe: {
        capexFactor: installedUsdPerKgDay / recipeUsdPerKgDay,
        energyFactor: kWhPerKg / RECIPE.aluminium.kWhPerKg,
        materialsFactor: materialsUsdPerKgDay / recipeUsdPerKgDay,
      },
      kpis: [
        { label: 'Installed', value: `$${installedUsdPerKgDay.toFixed(0)} per kg/day`, sub: `$${(installedUsd / tPerYear).toFixed(0)} per t/yr · recipe at this size $${recipeUsdPerKgDay.toFixed(0)}` },
        { label: 'Potline', value: `${nPots} × ${p.amperageKA} kA pots`, sub: `peak ${(xPeak * p.amperageKA).toFixed(0)} kA, ${(peakKW / 1000).toFixed(0)} MW DC, ${nLines} line${nLines > 1 ? 's' : ''}` },
        { label: 'Energy', value: `${kWhPerKg.toFixed(2)} kWh/kg Al`, sub: `peak ${kWhPeak.toFixed(2)} · night ${kWhNight.toFixed(2)} · ΔH min ${thermoMin.toFixed(2)}` },
        { label: 'Modulation', value: `${pct(xNight)}–${pct(xPeak)} of nominal`, sub: `night floor ${pct(nightFloor)} of peak → engine turndown ${minTurndown.toFixed(2)}` },
        { label: 'Cell', value: `${peak.vPot.toFixed(2)} V at peak, CE ${pct(peak.ce)}`, sub: `ACD ${peak.acd.toFixed(1)} cm peak, ${night.acd.toFixed(1)} cm night` },
        { label: 'Idiot index', value: `${(installedUsdPerKgDay / materialsUsdPerKgDay).toFixed(1)}×`, sub: `materials $${materialsUsdPerKgDay.toFixed(0)} per kg/day` },
      ],
    };
  }

  // How long a pot can hold fraction x of nominal current (anodes fully raised, losses at their
  // minimum) before the ledge freezes past its usable swing: Infinity when x is steady-state feasible.
  function holdHours(params, x) {
    const p = merge(params);
    const cell = cellModel(p);
    if (cell.operate(x).feasible) return Infinity;
    const shMin = cell.window.qMin / p.bathSideHWPerM2K;
    const deficitW = cell.window.lossMin - cell.gen(x, cell.acdMax, shMin);
    return deficitW > 0 ? cell.window.ledgeBufferKWh * 1000 / deficitW : Infinity;
  }

  function simulatorOverride(params) {
    const d = design(params);
    return { 'aluminium-smelter': {
      capexFactor: d.vsRecipe.capexFactor,
      energyFactor: d.vsRecipe.energyFactor,
      materialsFactor: d.vsRecipe.materialsFactor,
      minTurndown: d.minTurndown,
      flexible: false,
      // Inert anodes evolve O₂: no carbon anodes to buy.
      ...(d.params.anode === 'inert' ? { feedFactors: { 'carbon-anode': 0 } } : {}),
    } };
  }

  return {
    id: 'smelter',
    name: 'Solar-modulating Hall–Héroult smelter',
    summary: 'Hall–Héroult potline whose pots ride PV with shell heat exchangers and a day boost, priced from its cell voltage, heat balance and bill of materials.',
    units: ['aluminium-smelter'],
    product: 'aluminium',
    RECIPE,
    DEFAULTS,
    PRESETS,
    CONTROLS,
    ENGINE_BASELOAD_TURNDOWN,
    THERMO_MIN_KWH_PER_KG,
    KWH_PER_KG_PER_V,
    recipeAtSize,
    cellModel: params => cellModel(merge(params)),
    design,
    holdHours,
    simulatorOverride,
  };
});
