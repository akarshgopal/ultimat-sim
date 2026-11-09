// Solar-fired iron-ore pellet plant (balling + straight-grate induration) — first-principles parametric design.
//
// Goal: the cheapest DR-grade pellet (67.5% Fe, low gangue) from purchased pellet-feed concentrate, with
// the induration heat coming from PV. A pellet plant mixes concentrate with ~0.6% bentonite, rolls it into
// 9–16 mm green balls on discs, and fires them on a travelling grate: updraft/downdraft drying,
// preheating, firing at ~1,250–1,320 °C, then cooling with air that is recuperated into the firing and
// drying hoods. Magnetite oxidizes to hematite during firing (2 Fe₃O₄ + ½ O₂ → 3 Fe₂O₃, −0.49 MJ/kg),
// which is why magnetite plants need ~half the fuel of hematite plants. Three things decide cost:
//   • the heat balance — drying the ~9% balling moisture, the pellet sensible heat the cooler does not
//     return, the stack, the hood/shell loss, less the useful oxidation heat;
//   • the hardware — balling discs, the travelling grate (pallet cars in heat-resistant cast alloy, hoods,
//     windboxes), process fans, the heat supply, dust collection — priced as a bill of materials at
//     commodity prices (data/bom.js) × manufacturing factors × installation, plus fixed per-plant costs;
//   • how it runs on sunlight — induration is a baseload furnace (grate and hood refractory do not cycle
//     daily); its heat can come from a PV-charged heat store instead of gas or a battery.
//
// Basis: everything is per kg of Fe in DRI/HBI (the recipe's product: pathways h2-dri and green-h2-dri sell
// "steel" = DRI/HBI, 1 kg per kg Fe); a kg Fe needs 1/0.675 = 1.48 kg of fired pellets. Screening-grade,
// every assumption in DEFAULTS.
(function exposePelletPlantDesign(root, factory) {
  const api = factory(typeof require === 'function' ? require('../../data/bom.js') : root.FoundryBom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.FoundryDesigns = root.FoundryDesigns || {})[api.id] = api;
})(globalThis, Bom => {
  // ------------------------------------------------------------------ constants
  const M_FE = 55.845e-3; // kg/mol
  const M_FE2O3 = 159.688e-3;
  const FE_IN_FE2O3 = 2 * M_FE / M_FE2O3; // 0.699
  // 2 Fe₃O₄ + ½ O₂ → 3 Fe₂O₃: ΔHf Fe₃O₄ −1,118.4, Fe₂O₃ −824.2 kJ/mol (NIST) → −235.8 kJ per 3 mol Fe₂O₃.
  const OXIDATION_MJ_PER_KG_FE2O3 = (3 * 824.2 - 2 * 1118.4) / (3 * M_FE2O3) / 1000; // ≈ 0.492
  const WATER_LATENT_MJ_PER_KG = 2.257; // at 100 °C
  const WATER_CP_MJ_PER_KG_K = 4.18e-3;

  // Recipe basis (data/pathways.js, h2-dri and green-h2-dri, unit 'pellet-plant'): capexUsdPerKgDay 66.9
  // per kg Fe/day (TeaScreening 'pellet-plant' 43 $/(kg pellets/day) × Chile 1.05 × 1.48 kg pellets/kg Fe),
  // kWhPerKg 0.207 per kg Fe (0.14 kWh/kg pellets: ~0.35 GJ/t induration as a total-energy proxy + ~35 kWh/t),
  // at the reference size of 1,000 kg Fe/day. The company engine scales process capex by
  // (size / ref)^(0.85 − 1), floored at 0.4 (engine/company.js DEFAULTS.scale), so the recipe price at the
  // plant size a design is drawn for is RECIPE × that factor; capexFactor compares like with like.
  const RECIPE = Object.freeze({
    'pellet-plant': Object.freeze({
      usdPerKgDay: 66.9, kWhPerKg: 0.207, variableOmUsdPerKgPellet: 0.006,
      pathwayId: 'green-h2-dri', alsoPathways: Object.freeze(['h2-dri']), refKgPerDay: 1000,
    }),
  });
  const ENGINE_SCALE = Object.freeze({ exponent: 0.85, floorFactor: 0.4 });

  const DEFAULTS = Object.freeze({
    // ---- plant
    plantKgFePerDay: 100000, // the DRI plant the abundance scoreboard prices (1,000 kg/day reference × 100); pellets = Fe / pelletFeFraction
    pelletFeFraction: 0.675, // DR grade: 67–68% Fe, SiO₂ + Al₂O₃ ≲ 3%
    magnetiteFraction: 0.9, // share of the Fe₂O₃ in pellets that came in as magnetite (Chilean concentrates are magnetite)
    // ---- induration heat balance (per kg fired pellet)
    moistureFrac: 0.085, // green-ball moisture, wet basis (8–10%); a filter press + fine grind sets it
    firingC: 1300, // peak bed temperature; DR pellets need ~1,280–1,320 °C for strength
    pelletCpKJPerKgK: 0.95, // mean, 25 → 1,300 °C (hematite + gangue)
    coolerRecuperation: 0.85, // share of fired-pellet sensible heat the cooling air returns to firing/drying hoods
    oxidationUseful: 0.7, // share of the magnetite oxidation heat released where it displaces firing heat
    stackKgPerKg: 1.6, // process gas leaving the stack per kg pellet (air + water vapour)
    stackC: 100, // stack temperature after the down-draft drying zone (kept above acid dew point)
    shellLossMJPerKg: 0.04, // hoods, windboxes, grate seals
    dryingFromShaftWaste: 0.5, // share of drying heat taken from the DRI shaft's top-gas condenser (~100 °C dew point at 2.5 bar)
    heatSource: 'electric-store', // 'electric-store' | 'gas-burner'
    heatSources: Object.freeze({
      'electric-store': Object.freeze({ label: 'Electric air heaters in a PV-charged firebrick store', efficiency: 0.97 }),
      'gas-burner': Object.freeze({ label: 'Natural-gas burners in the firing hood', efficiency: 0.92 }),
    }),
    heaterCoupling: 'dc-direct', // 'dc-direct' | 'scr-transformer'
    couplings: Object.freeze({
      'dc-direct': Object.freeze({ label: 'Heater banks switched straight onto PV strings (staged contactors)', usdPerKW: 12, copperKgPerKW: 0.4 }),
      'scr-transformer': Object.freeze({ label: 'AC transformer + thyristor (SCR) power controller', usdPerKW: 70, copperKgPerKW: 1.0 }),
    }),
    burnerUsdPerKW: 60, // gas burners, gas train, combustion-air fans per kW of firing (bought)
    sunNameplateFactor: 3.2, // heaters of a PV-charged store take the day's heat in sun hours
    minTurndown: 0.6, // straight grates turn down by grate speed and bed depth to ~60%
    // ---- electricity (kWh per t pellets)
    fansKWhPerT: 15, // process fans (updraft drying, cooling, windbox, hood exhaust); straight grates 15–25 kWh/t
    ballingKWhPerT: 8, // mixer, discs, roller screens, conveyors
    // ---- binder
    binder: 'bentonite', // 'bentonite' | 'organic'
    binders: Object.freeze({
      bentonite: Object.freeze({ label: 'Bentonite 0.6%', kgPerT: 6, usdPerKg: 0.1, gangueKgPerT: 5 }),
      organic: Object.freeze({ label: 'Organic binder 0.08% (CMC-type)', kgPerT: 0.8, usdPerKg: 2.5, gangueKgPerT: 0 }),
    }),
    consumablesUsdPerT: 3.5, // grate bars, hood refractory, filter bags, disc liners, maintenance spares
    // ---- hardware sizing
    grateTPerM2Day: 36, // fired pellets per m² of grate per day; large straight grates ~30–35
    discMaxTph: 25, // largest standard disc pelletizer per line at this size (green balls)
    discKgBase: 3000,
    discKgPerTph: 2500,
    recycleFrac: 0.25, // undersize green balls recycled to the discs (sets disc duty)
    screenKgPerTph: 800,
    handlingKgBase: 15000, // concentrate receiving, bins, mixer, binder dosing, pellet stockpile reclaim
    handlingKgPerTph: 6000, // day bins instead of a stockyard with stacker-reclaimers
    palletKgPerM2: 2000, // pallet cars + grate bars per m² of active grate
    palletReturnFactor: 2, // cars on the return strand double the inventory
    palletAlloyFrac: 0.35, // grate bars and side walls in heat-resistant Cr–Ni cast alloy (priced as stainless)
    grateFrameKgPerM2: 4000, // grate machine frame, drives, seals
    hoodSteelKgPerM2: 4000, // hoods, windboxes, burner/heater ports
    hoodRefractoryKgPerM2: 4000, // thinner dense lining on ceramic-fibre backing
    ductKgPerM2: 2500,
    fanKgPerKW: 10,
    heaterElementKgPerKW: 0.35,
    heaterSteelKgPerKW: 2.5,
    heaterRefractoryKgPerKW: 1.5,
    dustKgBase: 5000, // bag filter / ESP
    dustKgPerTph: 2500,
    structureFracOfEquipment: 0.3, // open structure, no building (desert site)
    foundationFracOfEquipment: 1.5,
    electricalCopperKgPerKW: 1.2,
    instrumentsUsdPerPlant: 400000,
    engineeringUsdPerPlant: 800000, // engineering, permits, commissioning of a repeat standard design
    epcmFrac: 0, // EPCM / owner's costs ÷ installed equipment (in engineeringUsdPerPlant for a standard design)
    contingencyFrac: 0.05,
    // ---- money
    manufacturing: Object.freeze({ // finished part cost ÷ raw-material cost
      mechanical: 3.5, casting: 3.0, vessel: 2.5, refractory: 2.0, structural: 2.0, civil: 1.5,
      heater: 3.0, ducts: 2.5, handling: 2.5, electrical: 1.5,
    }),
    installFactor: 1.35,
  });

  // 'today' is a ~150 t/day (55 kt/yr) pellet plant built the way pellet plants are built now: gas-fired
  // straight grate, field-erected, today's recuperation, no use of the shaft's waste heat, battery-firmed
  // in this engine. 'lean' is DEFAULTS.
  const PRESETS = Object.freeze({
    today: Object.freeze({
      label: 'Today: small gas-fired straight grate, field-erected, standard recuperation',
      params: Object.freeze({
        moistureFrac: 0.095,
        coolerRecuperation: 0.78,
        stackKgPerKg: 1.8,
        stackC: 120,
        shellLossMJPerKg: 0.04,
        dryingFromShaftWaste: 0,
        heatSource: 'gas-burner',
        minTurndown: 0.7,
        fansKWhPerT: 22,
        ballingKWhPerT: 10,
        consumablesUsdPerT: 5.4,
        grateTPerM2Day: 30,
        discKgBase: 8000,
        discKgPerTph: 3000,
        screenKgPerTph: 1000,
        handlingKgBase: 80000,
        handlingKgPerTph: 12000,
        palletKgPerM2: 2500,
        grateFrameKgPerM2: 6000,
        hoodSteelKgPerM2: 6000,
        hoodRefractoryKgPerM2: 6000,
        ductKgPerM2: 4000,
        fanKgPerKW: 15,
        dustKgBase: 15000,
        dustKgPerTph: 4000,
        structureFracOfEquipment: 0.5,
        foundationFracOfEquipment: 2,
        instrumentsUsdPerPlant: 800000,
        engineeringUsdPerPlant: 2000000,
        epcmFrac: 0.15,
        contingencyFrac: 0.1,
        manufacturing: {
          mechanical: 10, casting: 8, vessel: 8, refractory: 4, structural: 5, civil: 2.5,
          heater: 10, ducts: 8, handling: 8, electrical: 3,
        },
        installFactor: 2.0,
      }),
    }),
    lean: Object.freeze({
      label: 'Lean solar-fired target: shop-built mini straight grate, electric air heaters on a PV-charged heat store, shaft waste heat for drying',
      params: Object.freeze({}),
    }),
  });

  const CONTROLS = Object.freeze([
    { key: 'plantKgFePerDay', label: 'Plant size', unit: 'kg Fe/day', min: 10000, max: 10000000, step: 10000, hint: 'Pellets = Fe ÷ 0.675. Scoreboard plants are 100 t Fe/day; a world-scale straight grate makes ~4–9 Mt pellets/yr' },
    { key: 'heatSource', label: 'Induration heat', options: [['electric-store', 'Electric air heaters on a PV heat store'], ['gas-burner', 'Natural-gas burners']] },
    { key: 'binder', label: 'Binder', options: [['bentonite', 'Bentonite 0.6%'], ['organic', 'Organic 0.08%']] },
    { key: 'magnetiteFraction', label: 'Magnetite share of feed', min: 0, max: 1, step: 0.05, hint: 'Magnetite oxidation supplies firing heat; hematite feed needs ~2× the fuel' },
    { key: 'moistureFrac', label: 'Green-ball moisture', min: 0.06, max: 0.12, step: 0.005, hint: 'Wet basis; drying is the largest heat load' },
    { key: 'coolerRecuperation', label: 'Cooler heat recuperation', min: 0.5, max: 0.92, step: 0.01, hint: 'Pellet heat returned to the hoods by the cooling air' },
    { key: 'dryingFromShaftWaste', label: 'Drying heat from the DRI shaft', min: 0, max: 0.8, step: 0.05, hint: 'Top-gas condenser heat at ~100 °C used for low-temperature updraft drying' },
    { key: 'grateTPerM2Day', label: 'Grate productivity', unit: 't/m²/day', min: 20, max: 45, step: 1 },
    { key: 'installFactor', label: 'Install factor', min: 1, max: 4, step: 0.05, hint: 'Installed ÷ delivered equipment' },
  ]);

  function merge(params = {}) {
    const p = { ...DEFAULTS, ...params };
    p.manufacturing = { ...DEFAULTS.manufacturing, ...(params.manufacturing || {}) };
    p.heatSources = { ...DEFAULTS.heatSources, ...(params.heatSources || {}) };
    p.couplings = { ...DEFAULTS.couplings, ...(params.couplings || {}) };
    p.binders = { ...DEFAULTS.binders, ...(params.binders || {}) };
    return p;
  }

  function commodity(name) {
    return Bom.COMMODITIES[name].usdPerKg;
  }

  function recipeAtSize(kgPerDay, recipe = RECIPE['pellet-plant']) {
    const f = (kgPerDay / recipe.refKgPerDay) ** (ENGINE_SCALE.exponent - 1);
    return recipe.usdPerKgDay * Math.max(ENGINE_SCALE.floorFactor, Math.min(1, f));
  }

  // Induration heat balance per kg fired pellet (MJ). Net firing heat never below zero.
  function heatBalance(p) {
    const waterKg = p.moistureFrac / (1 - p.moistureFrac);
    const dryingMJ = waterKg * (WATER_CP_MJ_PER_KG_K * 75 + WATER_LATENT_MJ_PER_KG);
    const dryingPurchasedMJ = dryingMJ * (1 - p.dryingFromShaftWaste);
    const sensibleMJ = p.pelletCpKJPerKgK * (p.firingC - 25) / 1000;
    const coolerLossMJ = sensibleMJ * (1 - p.coolerRecuperation);
    const stackMJ = p.stackKgPerKg * 1.05 * (p.stackC - 25) / 1000;
    const fe2o3Frac = p.pelletFeFraction / FE_IN_FE2O3;
    const oxidationMJ = OXIDATION_MJ_PER_KG_FE2O3 * fe2o3Frac * p.magnetiteFraction * p.oxidationUseful;
    const netMJ = Math.max(0, dryingPurchasedMJ + coolerLossMJ + stackMJ + p.shellLossMJPerKg - oxidationMJ);
    return { waterKg, dryingMJ, dryingPurchasedMJ, sensibleMJ, coolerLossMJ, stackMJ, shellMJ: p.shellLossMJPerKg, oxidationMJ, netMJ, fe2o3Frac };
  }

  function design(params = {}) {
    const p = merge(params);
    const source = p.heatSources[p.heatSource] || p.heatSources['electric-store'];
    const coupling = p.couplings[p.heaterCoupling] || p.couplings['dc-direct'];
    const binder = p.binders[p.binder] || p.binders.bentonite;
    const electric = p.heatSource !== 'gas-burner';
    const pelletKgPerKgFe = 1 / p.pelletFeFraction;
    const pelletKgPerDay = p.plantKgFePerDay * pelletKgPerKgFe;
    const pelletTph = pelletKgPerDay / 24 / 1000;

    // ---- energy
    const hb = heatBalance(p);
    const heatKWhPerKgPellet = hb.netMJ / 3.6 / source.efficiency;
    const energyPerPellet = {
      induration: heatKWhPerKgPellet,
      fans: p.fansKWhPerT / 1000,
      balling: p.ballingKWhPerT / 1000,
    };
    const kWhPerKgPellet = Object.values(energyPerPellet).reduce((a, b) => a + b, 0);
    const energy = Object.fromEntries(Object.entries(energyPerPellet).map(([k, v]) => [k, v * pelletKgPerKgFe]));
    const kWhPerKg = kWhPerKgPellet * pelletKgPerKgFe;

    // ---- bill of materials, per plant
    const parts = [];
    const add = (part, material, kg, mfgKey, note) => {
      const usdMaterials = kg * commodity(material);
      const manufacturing = p.manufacturing[mfgKey];
      parts.push({ part, material, kgPlant: kg, usdMaterialsPlant: usdMaterials, manufacturing, usdPlant: usdMaterials * manufacturing, note });
    };
    const buy = (part, usd, note) => parts.push({ part, material: null, kgPlant: 0, usdMaterialsPlant: 0, manufacturing: null, usdPlant: usd, note });

    const grateM2 = pelletKgPerDay / 1000 / p.grateTPerM2Day;
    const greenTph = pelletTph * (1 + p.moistureFrac) * (1 + p.recycleFrac);
    const nDiscs = Math.max(1, Math.ceil(greenTph / p.discMaxTph - 1e-9));
    add('Concentrate receiving, bins, mixer, binder dosing, pellet reclaim', 'steel', p.handlingKgBase + p.handlingKgPerTph * pelletTph, 'handling', `${pelletTph.toFixed(1)} t/h pellets`);
    add('Balling discs and drives', 'steel', nDiscs * p.discKgBase + p.discKgPerTph * greenTph, 'mechanical', `${nDiscs} disc${nDiscs > 1 ? 's' : ''}, ${greenTph.toFixed(1)} t/h green balls incl. recycle`);
    add('Roller screens', 'steel', p.screenKgPerTph * greenTph, 'mechanical', '');
    const palletKg = grateM2 * p.palletKgPerM2 * p.palletReturnFactor;
    add('Pallet cars and grate bars (Cr–Ni cast alloy)', 'stainless-steel', palletKg * p.palletAlloyFrac, 'casting', `${grateM2.toFixed(1)} m² active grate; priced as stainless`);
    add('Pallet car bodies', 'steel', palletKg * (1 - p.palletAlloyFrac), 'casting', '');
    add('Grate machine frame, drives, seals', 'steel', grateM2 * p.grateFrameKgPerM2, 'mechanical', '');
    add('Hoods and windboxes', 'steel', grateM2 * p.hoodSteelKgPerM2, 'vessel', '');
    add('Hood refractory', 'refractory', grateM2 * p.hoodRefractoryKgPerM2, 'refractory', `firing at ${p.firingC} °C`);
    add('Process gas ducts', 'steel', grateM2 * p.ductKgPerM2, 'ducts', 'recuperation, windbox and stack ducts');
    const fanKW = p.fansKWhPerT * pelletTph;
    add('Process fans', 'steel', p.fanKgPerKW * fanKW, 'mechanical', `${Math.round(fanKW)} kW`);
    const heatKWAvg = heatKWhPerKgPellet * pelletKgPerDay / 24;
    const chargeFactor = electric ? p.sunNameplateFactor : 1;
    const heaterKW = heatKWAvg * chargeFactor;
    if (electric) {
      add('Air heater elements (sized to charge the store in sun hours)', 'stainless-steel', p.heaterElementKgPerKW * heaterKW, 'heater', `${Math.round(heaterKW)} kW, FeCrAl priced as stainless`);
      add('Air heater shell', 'steel', p.heaterSteelKgPerKW * heaterKW, 'heater', '');
      add('Air heater lining', 'refractory', p.heaterRefractoryKgPerKW * heaterKW, 'refractory', '');
      add('Heater power copper', 'copper', coupling.copperKgPerKW * heaterKW, 'electrical', '');
      buy(`Heater power control (${p.heaterCoupling === 'dc-direct' ? 'DC staging' : 'AC + SCR'})`, coupling.usdPerKW * heaterKW, coupling.label);
    } else {
      buy('Gas burners, gas train, combustion-air fans', p.burnerUsdPerKW * heatKWAvg, `${Math.round(heatKWAvg)} kW firing`);
    }
    add('Dust collection', 'steel', p.dustKgBase + p.dustKgPerTph * pelletTph, 'mechanical', 'bag filter / ESP');
    const motorKW = fanKW + p.ballingKWhPerT * pelletTph;
    add('Motors and cabling', 'copper', p.electricalCopperKgPerKW * motorKW, 'electrical', `${Math.round(motorKW)} kW motors`);
    const equipmentKg = parts.reduce((s, x) => s + x.kgPlant, 0);
    add('Structure, building, platforms', 'steel', p.structureFracOfEquipment * equipmentKg, 'structural', '');
    add('Foundations', 'concrete', p.foundationFracOfEquipment * equipmentKg, 'civil', '');
    buy('Instruments, DCS, analysers', p.instrumentsUsdPerPlant, 'per plant');

    const equipmentUsd = parts.reduce((s, x) => s + x.usdPlant, 0);
    const installedEquipmentUsd = equipmentUsd * p.installFactor;
    const epcmUsd = installedEquipmentUsd * p.epcmFrac;
    const contingencyUsd = (installedEquipmentUsd + epcmUsd) * p.contingencyFrac;
    const installedUsd = installedEquipmentUsd + epcmUsd + contingencyUsd + p.engineeringUsdPerPlant;
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
    const overhead = (part, usd, note) => bom.push({ part, material: null, kg: null, usdMaterials: null, manufacturing: null, usd: perKgDay(usd), note });
    overhead(`Installation (× ${p.installFactor})`, installedEquipmentUsd - equipmentUsd, 'erection, tie-ins, commissioning');
    overhead('Engineering, permits, owner', p.engineeringUsdPerPlant, 'per plant');
    if (epcmUsd > 0) overhead(`EPCM / owner's costs (${(p.epcmFrac * 100).toFixed(0)}%)`, epcmUsd, 'scales with installed equipment');
    if (contingencyUsd > 0) overhead(`Contingency (${(p.contingencyFrac * 100).toFixed(0)}%)`, contingencyUsd, '');
    bom.sort((a, b) => b.usd - a.usd);

    const installedUsdPerKgDay = perKgDay(installedUsd);
    const materialsUsdPerKgDay = perKgDay(materialsUsd);
    const recipeUsdPerKgDay = recipeAtSize(p.plantKgFePerDay);
    const variableOmUsdPerKgPellet = (binder.kgPerT * binder.usdPerKg + p.consumablesUsdPerT) / 1000;
    const pelletTPerYear = pelletKgPerDay * 365 / 1000;
    // An electric heat source is a PV-charged heat store; gas burners leave the engine's battery firming.
    const heatStore = electric;
    return {
      params: p,
      basis: 'per kg Fe (DRI/HBI)/day',
      pelletKgPerKgFe,
      pelletKgPerDay,
      grateM2,
      nDiscs,
      balance: {
        ...hb,
        heatKWhPerKgPellet,
        pelletGangueFrac: 1 - hb.fe2o3Frac + binder.gangueKgPerT / 1000,
        pelletFeWithBinder: p.pelletFeFraction * (1 - binder.gangueKgPerT / 1000),
      },
      heaterKW,
      energy,
      kWhPerKg,
      kWhPerKgPellet,
      bom,
      equipmentUsd,
      installedUsd,
      installedUsdPerKgDay,
      installedUsdPerTonneYear: installedUsd / pelletTPerYear, // per annual tonne of pellets
      materialsUsdPerKgDay,
      idiotIndex: installedUsdPerKgDay / materialsUsdPerKgDay,
      flexible: false,
      firming: heatStore ? 'heat-store' : 'battery',
      variableOmUsdPerKgPellet,
      recipeUsdPerKgDay,
      vsRecipe: {
        capexFactor: installedUsdPerKgDay / recipeUsdPerKgDay,
        energyFactor: kWhPerKg / RECIPE['pellet-plant'].kWhPerKg,
        variableOmFactor: variableOmUsdPerKgPellet / RECIPE['pellet-plant'].variableOmUsdPerKgPellet,
      },
      kpis: [
        { label: 'Installed', value: `$${installedUsdPerKgDay.toFixed(1)} per kg Fe/day`, sub: `$${(installedUsd / pelletTPerYear).toFixed(0)} per t pellets/yr · recipe at this size $${recipeUsdPerKgDay.toFixed(1)}` },
        { label: 'Grate', value: `${grateM2.toFixed(1)} m² straight grate`, sub: `${(pelletKgPerDay / 1000).toFixed(0)} t pellets/day · ${nDiscs} balling disc${nDiscs > 1 ? 's' : ''}` },
        { label: 'Induration heat', value: `${hb.netMJ.toFixed(2)} GJ/t pellets`, sub: `drying ${hb.dryingPurchasedMJ.toFixed(2)}, cooler ${hb.coolerLossMJ.toFixed(2)}, stack ${hb.stackMJ.toFixed(2)}, oxidation −${hb.oxidationMJ.toFixed(2)}` },
        { label: 'Energy', value: `${kWhPerKg.toFixed(3)} kWh/kg Fe`, sub: `${(kWhPerKgPellet * 1000).toFixed(0)} kWh/t pellets · ${source.label}` },
        { label: 'Idiot index', value: `${(installedUsdPerKgDay / materialsUsdPerKgDay).toFixed(1)}×`, sub: `materials $${materialsUsdPerKgDay.toFixed(2)} per kg Fe/day` },
        { label: 'Operation', value: heatStore ? 'Baseload on a heat store' : 'Baseload (battery)', sub: `turndown to ${(p.minTurndown * 100).toFixed(0)}% · ${binder.label}` },
      ],
    };
  }

  // Installed $/kg-day vs plant size: fixed per-plant costs dominate small pellet plants.
  function scaleCurve(params = {}, sizesKgPerDay = [25e3, 1e5, 3e5, 1e6, 6e6]) {
    return sizesKgPerDay.map(size => {
      const d = design({ ...params, plantKgFePerDay: size });
      return { kgPerDay: size, usdPerKgDay: d.installedUsdPerKgDay, usdPerTonneYear: d.installedUsdPerTonneYear, recipeUsdPerKgDay: d.recipeUsdPerKgDay, idiotIndex: d.idiotIndex, kWhPerKg: d.kWhPerKg };
    });
  }

  function simulatorOverride(params) {
    const d = design(params);
    return { 'pellet-plant': {
      capexFactor: d.vsRecipe.capexFactor,
      energyFactor: d.vsRecipe.energyFactor,
      materialsFactor: d.vsRecipe.capexFactor / d.idiotIndex,
      variableOmFactor: d.vsRecipe.variableOmFactor,
      flexible: false,
      thermal: d.firming === 'heat-store',
      minTurndown: d.params.minTurndown,
    } };
  }

  return {
    id: 'pellet-plant',
    name: 'Solar-fired iron-ore pellet plant',
    summary: 'Mini straight-grate pellet plant fired by electric air heaters on a PV-charged heat store, drying on the DRI shaft\'s waste heat, priced from its heat balance and bill of materials.',
    units: ['pellet-plant'],
    product: 'steel',
    RECIPE,
    DEFAULTS,
    PRESETS,
    CONTROLS,
    OXIDATION_MJ_PER_KG_FE2O3,
    recipeAtSize,
    design,
    scaleCurve,
    simulatorOverride,
  };
});
