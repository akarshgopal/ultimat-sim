// Company build-out simulator.
//
// Simulates one company, year by year, that builds solar-powered plants turning
// quasi-infinite feedstocks (seawater, brine, air, crustal rock, sunlight) into
// materials. Each plant is a pathway recipe (per-kg-product electricity, feeds,
// capex by technology class — see data/pathways.js) placed at a site (solar
// yield, land price, resource tags). Every year the company:
//   1. brings plants that finished construction online,
//   2. operates all plants at that year's realized prices (price falls with the
//      company's share of the world market — data/markets.js),
//   3. services debt and banks cash,
//   4. spends available equity (plus debt) on the most profitable new plants,
//      subject to a market-share ceiling and a build-rate limit.
// Costs fall over time: each technology class has an exogenous yearly decline
// (global market) plus Wright's-law learning on the company's own cumulative
// deployment; process capex per unit also falls with plant size (scale
// exponent). PV is sized per site from the plant's daily electricity.
//
// Screening model: constant real prices/costs within a plant's life, no tax, no
// inflation, no seasonal storage (daily-average energy as in the source cases),
// purchased intermediates stay purchased. Not a bankable forecast.
(function exposeCompany(root, factory) {
  const api = factory(typeof require === 'function' ? require('./utilization') : root.FoundryUtilization);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoundryCompany = api;
})(globalThis, Utilization => {
  const TECH_CLASSES = Object.freeze(['process', 'electrolyzer', 'dac', 'desal', 'storage']);
  const INFINITE_ORIGINS = Object.freeze(['ocean', 'brine', 'air', 'crust', 'water']);

  const DEFAULTS = Object.freeze({
    // What the company builds next, among plants it can afford:
    //  'abundance' — material abundance through feasible economics. Every plant must pay back its
    //                capital at the discount rate (NPV ≥ 0, PI ≥ build.minProfitabilityIndex). Among
    //                those, build the one with the most lifetime material, counting both the plant's
    //                own tonnes and the tonnes its surplus (NPV) will fund when reinvested:
    //                  score = own kg over life + λ × NPV
    //                where λ is this year's best lifetime kg per capex dollar among feasible plants.
    //                Absolute (not per dollar): money is already enforced by affordability, and the
    //                yearly build-slot limit would otherwise fill with tiny high-margin plants.
    //                Pure tonnes-per-dollar is myopic: thin-margin bulk plants fund no growth, so it
    //                ends with less material than chasing profit.
    //  'profit'    — the highest-NPV plant (for comparison).
    objective: 'abundance',
    // How the abundance objective ranks feasible plants: 'resource-weighted' divides lifetime material
    // value by the share of this year's equity, construction capacity and remaining site solar used;
    // 'absolute' ranks by lifetime material value alone.
    abundanceScore: 'resource-weighted',
    startYear: 2027,
    years: 25,
    finance: Object.freeze({
      initialEquityUsd: 25e6,
      equityRaises: Object.freeze([]), // [{ year, usd }]
      discountRate: 0.08,
      debtFraction: 0.5, // share of each plant's capex financed by debt
      debtRate: 0.07,
      debtTermYears: 15,
      cashReserveUsd: 0,
    }),
    build: Object.freeze({
      leadTimeYears: 1,
      // Construction capacity: capex the organisation can put in the ground per year. It starts at
      // initialBuildUsdPerYear and next year's capacity is (1 + buildGrowthPerYear) × this year's
      // actual capex (never below the start): a company can only scale construction it is doing.
      initialBuildUsdPerYear: 250e6,
      buildGrowthPerYear: 0.5,
      // Construction capacity left idle (markets or site solar bind, not the crews) is not lost at once:
      // next year keeps at least this share of this year's capacity.
      buildCapacityRetention: 0.8,
      maxPlantsPerYear: null, // optional hard cap on plant count per year (null = none)
      maxMarketShare: 0.1, // company share of world demand per product
      minProfitabilityIndex: 0, // NPV / capex hurdle
      sizeMultiples: Object.freeze([1, 10, 100, 1000, 5000]), // × pathway reference output (capped at maxPlantKgPerDay)
      maxPlantKgPerDay: 5e6,
      allowPathways: null, // null = all; else array of pathway ids
      allowSites: null, // null = all; else array of site ids
      maxPvGWpPerSite: 50, // land / interconnection / permitting ceiling per site (~800 km² at 1.6 ha/MWp)
      // Only build plants whose every feed comes from ocean/brine/air/rock/water or a captive
      // supplier: forces make-not-buy and skips plants that would still buy an intermediate.
      infiniteSourcesOnly: false,
    }),
    scale: Object.freeze({
      exponent: 0.85, // process capex ∝ size^exponent (PV stays linear/modular)
      floorFactor: 0.4, // per-unit capex never falls below this × reference
    }),
    pv: Object.freeze({
      // IRENA Renewable Power Generation Costs in 2023: global weighted-average installed cost of
      // utility-scale PV USD 758/kW. ≈ $0.046/kWh at 2,000 kWh/kWp·yr with an 8%/25-yr CRF.
      // Think in $/kWh: pvCapexFromLcoe / solarLcoe convert between the two.
      capexUsdPerKWp: 758,
      fixedOmUsdPerKWpYear: 20,
      lcoeRefYieldKWhPerKWpYear: 2000, // reference sunbelt yield for quoting $/kWh
      lifeYears: 25,
      exogenousDeclinePerYear: 0.06,
      floorUsdPerKWp: 250,
      landHaPerKWp: 0.0016, // 1.6 ha/MWp fixed-tilt screening
    }),
    tech: Object.freeze({
      process: Object.freeze({ exogenousDeclinePerYear: 0.01, learningRate: 0.1, seedUsd: 100e6, floorFraction: 0.5 }),
      electrolyzer: Object.freeze({ exogenousDeclinePerYear: 0.08, learningRate: 0.18, seedUsd: 50e6, floorFraction: 0.2 }),
      dac: Object.freeze({ exogenousDeclinePerYear: 0.05, learningRate: 0.15, seedUsd: 50e6, floorFraction: 0.25 }),
      desal: Object.freeze({ exogenousDeclinePerYear: 0.01, learningRate: 0.05, seedUsd: 50e6, floorFraction: 0.6 }),
      storage: Object.freeze({ exogenousDeclinePerYear: 0.06, learningRate: 0.1, seedUsd: 50e6, floorFraction: 0.3 }),
    }),
    defaultLandUsdPerHa: 2000,
    // Scenario lever: multiplies equipment capex (process, electrolyzer, DAC, desal classes; not
    // PV or storage). 0.1 = equipment 10× cheaper than the recipes' screening packs.
    equipmentCostMultiplier: 1,
    // Engineered unit designs (engine/designs/*.js): { units: { <flowsheet unit>: { capexFactor,
    // energyFactor } } }. Each scales that unit's own capex and kWh in every recipe flowsheet that
    // contains it (other units in the same cost class are untouched).
    designs: Object.freeze({ units: Object.freeze({}) }),
    // Idiot-index squeeze (Musk: installed cost ÷ raw-material cost). With a target T, every cost
    // class is capped at its materials floor × T: price = min(today's price after learning and
    // decline, floor × T). floors come from data/bom.js (the app's store passes them in):
    //   pv / battery / thermalStore / h2Storage: { materialsUsdPerUnit } ($/kWp, $/kWh, $/kWh_th, $/kg H₂)
    //   electrolyzer / desal / dac / process:     { floorFraction } (materials $ per $ of today's recipe capex)
    // target null = today's prices (no squeeze).
    // Optional bom = { commodities: { material: usdPerKg }, classes: { cls: { lines: [{ material, kgPerUnit }],
    // todayUsdPerUnit, absolute: bool } } } makes the floors live (the Terraform loop): each year the
    // floors are re-priced at commodity prices lowered by the relief the company's own supply caused
    // in the matching market last year (commodityMarkets: material → market key, with a weight for
    // partial links such as cement in concrete).
    idiotIndex: Object.freeze({
      target: null,
      floors: Object.freeze({}),
      bom: null,
      commodityMarkets: Object.freeze({
        steel: { market: 'steel', weight: 1 },
        aluminium: { market: 'aluminium', weight: 1 },
        copper: { market: 'copper-cathode', weight: 1 },
        'solar-glass': { market: 'float-glass', weight: 1 },
        polysilicon: { market: 'polysilicon', weight: 1 },
        'lithium-carbonate': { market: 'lithium', weight: 1 },
        concrete: { market: 'cement', weight: 0.3 },
      }),
    }),
    // Solar-only utilization and storage design (engine/utilization.js): flexible units are sized
    // for the hours the sun shines, baseload units are firmed with batteries / thermal stores,
    // intermediates between them are buffered. Recipes without a flowsheet keep 24 h costing.
    utilization: Utilization.DEFAULTS,
    // Make-vs-buy for purchased intermediates (see planIntegration). feedProducts maps a
    // recipe's purchased feed id to the product key a captive supplier pathway makes.
    // CO₂ is made by the DAC recipe (dac-co2) once it undercuts $0.05–0.13/kg purchased CO₂.
    integration: Object.freeze({
      enabled: true,
      mode: 'cheaper', // 'cheaper': make only when it beats buying; 'always': make whenever a supplier fits
      feedProducts: Object.freeze({
        'hydrogen-feed': 'hydrogen',
        'ammonia-feed': 'ammonia',
        'methanol-feed': 'methanol',
        'float-glass': 'float-glass',
        'co2-feed': 'co2',
      }),
    }),
    // Products that draw on the same world market (see data/markets.js notes): shares and
    // headroom are computed on the group key's demand.
    marketGroups: Object.freeze({
      'ndpr-oxide-separated': 'ndpr-oxide',
      'light-reo': 'other-reo',
    }),
    minPriceFraction: 0.05,
  });

  function merge(base, override) {
    if (override == null) return base;
    if (Array.isArray(base) || Array.isArray(override) || typeof base !== 'object' || typeof override !== 'object') {
      return override;
    }
    const out = { ...base };
    for (const [key, value] of Object.entries(override)) {
      out[key] = value !== undefined && base[key] !== null && typeof base[key] === 'object' && !Array.isArray(base[key])
        ? merge(base[key], value)
        : value;
    }
    return out;
  }

  function annuityFactor(rate, years) {
    if (!(years > 0)) return 0;
    if (!(rate > 0)) return years;
    return (1 - (1 + rate) ** -years) / rate;
  }

  function wrightExponent(learningRate) {
    if (!(learningRate > 0) || learningRate >= 1) return 0;
    return -Math.log2(1 - learningRate);
  }

  // Cost multiplier for a technology class in a given year.
  function techCostFactor(techCfg, yearIndex, companyCumRefUsd) {
    const exo = (1 - (techCfg.exogenousDeclinePerYear || 0)) ** Math.max(0, yearIndex);
    const b = wrightExponent(techCfg.learningRate);
    const seed = techCfg.seedUsd > 0 ? techCfg.seedUsd : 1;
    const learn = (1 + Math.max(0, companyCumRefUsd) / seed) ** -b;
    return Math.max(techCfg.floorFraction ?? 0, exo * learn);
  }

  // Solar electricity price ↔ PV capex. O&M is held at the configured O&M/capex ratio, so a
  // $/kWh target moves capex and O&M together. Quoted at the reference yield; a site's own price
  // scales with refYield / siteYield.
  function pvOmFraction(pvCfg) {
    return pvCfg.capexUsdPerKWp > 0 ? (pvCfg.fixedOmUsdPerKWpYear || 0) / pvCfg.capexUsdPerKWp : 0;
  }
  function solarLcoe(pvCfg, financeCfg, capexUsdPerKWp = pvCfg.capexUsdPerKWp, yieldKWhPerKWpYear = pvCfg.lcoeRefYieldKWhPerKWpYear) {
    const crf = 1 / annuityFactor(financeCfg.discountRate, pvCfg.lifeYears);
    return (capexUsdPerKWp * (crf + pvOmFraction(pvCfg))) / yieldKWhPerKWpYear;
  }
  function pvCapexFromLcoe(usdPerKWh, pvCfg, financeCfg) {
    const crf = 1 / annuityFactor(financeCfg.discountRate, pvCfg.lifeYears);
    return (usdPerKWh * pvCfg.lcoeRefYieldKWhPerKWpYear) / (crf + pvOmFraction(pvCfg));
  }

  function pvCapexUsdPerKWp(pvCfg, yearIndex) {
    const exo = pvCfg.capexUsdPerKWp * (1 - (pvCfg.exogenousDeclinePerYear || 0)) ** Math.max(0, yearIndex);
    return Math.max(pvCfg.floorUsdPerKWp || 0, exo);
  }

  function scaleFactor(scaleCfg, sizeKgPerDay, refKgPerDay) {
    if (!(sizeKgPerDay > 0) || !(refKgPerDay > 0)) return 1;
    const f = (sizeKgPerDay / refKgPerDay) ** ((scaleCfg.exponent ?? 1) - 1);
    return Math.max(scaleCfg.floorFactor ?? 0, Math.min(1, f));
  }

  function marketDemandT(market, year) {
    if (!market) return Infinity;
    const base = Number(market.worldDemandTPerYear);
    if (!(base > 0)) return Infinity;
    const g = Number(market.growthPerYear) || 0;
    return base * (1 + g) ** (year - (Number(market.demandYear) || year));
  }

  function realizedPrice(cfg, market, fallbackUsdPerKg, share) {
    const p0 = market && Number(market.priceUsdPerKg) > 0 ? Number(market.priceUsdPerKg) : Number(fallbackUsdPerKg) || 0;
    const elasticity = market ? Number(market.priceElasticity) || 0 : 0;
    return p0 * Math.max(cfg.minPriceFraction, 1 - elasticity * Math.max(0, share));
  }

  // ---------------------------------------------------------------------------
  // Sites and pathway/site compatibility

  // Build site rows from the repo's preset catalog + frozen PVGIS yields.
  // deps: { sitePresets, pvgisSites, landPriceAt?(lat, lon) → { usdPerHa } | number }
  function buildSites(deps = {}) {
    const presets = deps.sitePresets || [];
    const pvgis = deps.pvgisSites;
    const sites = [];
    for (const preset of presets) {
      const solar = pvgis?.frozenSolarFor?.(preset);
      const pvKWhPerKWpDay = Number(solar?.dailyPVKWhPerKWp);
      if (!(pvKWhPerKWpDay > 0)) continue;
      let landUsdPerHa = null;
      if (typeof deps.landPriceAt === 'function') {
        try {
          const land = deps.landPriceAt(preset.latitude, preset.longitude);
          const value = typeof land === 'number' ? land : Number(land?.usdPerHa);
          if (value > 0) landUsdPerHa = value;
        } catch {
          landUsdPerHa = null;
        }
      }
      sites.push({
        id: preset.id,
        name: preset.name,
        region: preset.region || null,
        latitude: preset.latitude,
        longitude: preset.longitude,
        kind: preset.kind || null,
        coastal: Boolean(preset.assayId),
        seawaterAssayId: preset.assayId || null,
        brineAssayId: preset.brineAssayId || null,
        pvKWhPerKWpDay,
        pvSource: solar?.source || null,
        landUsdPerHa,
        capexMultiplier: 1,
      });
    }
    return sites;
  }

  function feedOrigins(pathway) {
    return new Set((pathway.feeds || []).map(feed => feed.origin));
  }

  function siteAllowsPathway(site, pathway, sitesById) {
    const origins = feedOrigins(pathway);
    if (origins.has('brine')) {
      // Brine recipes are assay-specific: only sites sharing the reference site's brine.
      if (site.id === pathway.refSiteId) return true;
      const ref = sitesById.get(pathway.refSiteId);
      return Boolean(ref?.brineAssayId && site.brineAssayId === ref.brineAssayId);
    }
    // Inland brine hubs (salars, salt lakes) host brine recipes only: no port, no bulk logistics.
    if (site.kind === 'brine-hub') return false;
    if (origins.has('ocean') && !site.coastal) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Plant economics

  // Recipe capex per kg/day by class, with designed units re-priced from their flowsheet share.
  // out.designed[cls] = { usd, floorUsd, unfloored }: the designed units' own capex in that class
  // and their raw-materials floor (designs.units.<unit>.materialsFactor × recipe capex), so the
  // class-wide idiot-index cap does not squeeze a design a second time (see evaluatePlant).
  // unfloored: some designed unit in the class has no materialsFactor, so it is not squeezed.
  function capexByTech(pathway, cfg) {
    const out = { designed: null };
    for (const cls of TECH_CLASSES) out[cls] = Number(pathway.capexByTechUsdPerKgDay?.[cls]) || 0;
    const units = cfg.designs?.units;
    if (units && pathway.flowsheet?.nodes) {
      for (const node of pathway.flowsheet.nodes) {
        const d = units[node.unit];
        const factor = Number(d?.capexFactor);
        if (node.kind !== 'converter' || !(factor > 0)) continue;
        const cls = Utilization.UNIT_TECH[node.unit] || 'process';
        const recipe = Number(node.capexUsdPerKgDay) || 0;
        out[cls] = Math.max(0, out[cls] + recipe * (factor - 1));
        out.designed = out.designed || {};
        const slot = out.designed[cls] || (out.designed[cls] = { usd: 0, floorUsd: 0, unfloored: false });
        slot.usd += recipe * factor;
        if (Number(d.materialsFactor) > 0) slot.floorUsd += recipe * d.materialsFactor;
        else slot.unfloored = true;
      }
    }
    return out;
  }

  // Designed units can scale the recipe's consumables feed (e.g. DAC sorbent makeup) and their own
  // share of variable O&M (flowsheet node.variableOmUsdPerKg).
  function designedOpex(pathway, cfg) {
    const designUnits = cfg.designs?.units || {};
    let consumablesFactor = 1;
    let variableOmDelta = 0;
    const feedFactors = {};
    for (const node of pathway.flowsheet?.nodes || []) {
      const d = designUnits[node.unit];
      if (!d || node.kind !== 'converter') continue;
      if (Number(d.consumablesFactor) >= 0) consumablesFactor *= Number(d.consumablesFactor);
      for (const [id, f] of Object.entries(d.feedFactors || {})) if (Number(f) >= 0) feedFactors[id] = (feedFactors[id] ?? 1) * Number(f);
      if (Number(d.variableOmFactor) >= 0) variableOmDelta += (Number(node.variableOmUsdPerKg) || 0) * (Number(d.variableOmFactor) - 1);
    }
    // Multiplier on a feed's kg per kg (designs.units.<unit>.feedFactors, consumablesFactor).
    const feedFactor = id => (feedFactors[id] ?? 1) * (id === 'consumables' ? consumablesFactor : 1);
    return { variableOmDelta, feedFactor };
  }

  // Utilization config with designed units' energy factors folded into unitEnergyScale (memoized).
  const utilCache = new WeakMap();
  function utilFor(cfg) {
    if (utilCache.has(cfg)) return utilCache.get(cfg);
    const base = cfg.utilization || Utilization.DEFAULTS;
    const energy = {};
    for (const [unit, d] of Object.entries(cfg.designs?.units || {})) {
      if (Number(d?.energyFactor) > 0) energy[unit] = d.energyFactor;
    }
    const util = Utilization.mergeCfg(Object.keys(energy).length
      ? { ...base, unitEnergyScale: { ...(base.unitEnergyScale || {}), ...energy } }
      : base);
    utilCache.set(cfg, util);
    return util;
  }

  // ---------------------------------------------------------------------------
  // Vertical integration (make vs buy)
  //
  // A plant that buys an intermediate (H₂, NH₃, methanol, glass, …) can instead get it from a
  // captive supplier unit built at the same site — another pathway whose product is that
  // intermediate. The supplier's capex, PV, land, opex and its own coproduct sales (e.g.
  // electrolyzer O₂) join the plant; the feed purchase disappears; the intermediate never
  // touches the market. The plant integrates a feed only when the supplier's levelized cost
  // (net of its coproducts) beats the purchase price + freight that year, so integration
  // switches on as PV and electrolyzers get cheaper. One level deep: suppliers that themselves
  // buy intermediates are not used.

  // Dominant stored substance of an intermediate product, for buffer costing.
  const PRODUCT_SUBSTANCE = Object.freeze({ hydrogen: 'H2', ammonia: 'NH3', methanol: 'CH3OH' });

  function captiveSuppliers(cfg, pathways) {
    const byProduct = new Map();
    if (!cfg.integration?.enabled) return byProduct;
    for (const pathway of pathways) {
      if ((pathway.feeds || []).some(feed => feed.origin === 'intermediate' && feed.purchased)) continue;
      if (!byProduct.has(pathway.product)) byProduct.set(pathway.product, []);
      byProduct.get(pathway.product).push(pathway);
    }
    return byProduct;
  }

  function planIntegration(pathway, site, sizeKgPerDay, ctx) {
    const plan = [];
    const feedProducts = ctx.cfg.integration?.feedProducts || {};
    if (!ctx.suppliers?.size) return plan;
    for (const feed of pathway.feeds || []) {
      if (!feed.purchased || feed.origin !== 'intermediate') continue;
      const product = feedProducts[feed.id];
      const candidates = product ? ctx.suppliers.get(product) || [] : [];
      const kgPerDay = (Number(feed.kgPerKg) || 0) * sizeKgPerDay;
      if (!(kgPerDay > 0)) continue;
      const buyUsdPerKg = (Number(feed.usdPerKg) || 0) + (Number(feed.freightUsdPerKg) || 0);
      let best = null;
      for (const supplier of candidates) {
        if (supplier.id === pathway.id) continue;
        if (ctx.sitesById && !siteAllowsPathway(site, supplier, ctx.sitesById)) continue;
        const unit = evaluatePlant(supplier, site, kgPerDay, { ...ctx, suppliers: null });
        // Cost of making the intermediate, net of the supplier's own coproduct sales.
        if (!best || unit.lcopUsdPerKg < best.unit.lcopUsdPerKg) best = { supplier, unit };
      }
      const always = ctx.cfg.integration.mode === 'always' || ctx.cfg.build.infiniteSourcesOnly;
      if (best && (always || best.unit.lcopUsdPerKg < buyUsdPerKg)) {
        plan.push({
          feedId: feed.id,
          product,
          supplierId: best.supplier.id,
          kgPerDay,
          makeUsdPerKg: best.unit.lcopUsdPerKg,
          makeGrossUsdPerKg: best.unit.grossCostUsdPerKg,
          buyUsdPerKg,
          unit: best.unit,
        });
      }
    }
    return plan;
  }

  // NPV at build: capex now, constant annual cash from first operation (after the lead time).
  function plantNpv(cfg, capexUsd, annualCash, af) {
    const r = cfg.finance.discountRate;
    return -capexUsd + (annualCash * af) / (1 + r) ** (cfg.build.leadTimeYears || 0);
  }

  // ctx: a yearContext() result; its optional suppliers (Map product → pathways) and sitesById enable
  // integration.
  function evaluatePlant(pathway, site, sizeKgPerDay, ctx) {
    const { cfg } = ctx;
    const sf = scaleFactor(cfg.scale, sizeKgPerDay, pathway.refOutputKgPerDay);
    const perKgDay = capexByTech(pathway, cfg);
    const siteMult = Number(site.capexMultiplier) || 1;
    const integration = planIntegration(pathway, site, sizeKgPerDay, ctx);
    const integrated = new Set(integration.map(item => item.feedId));

    const processByTech = {};
    const refCapexByTech = {};
    let processCapex = 0;
    const target = cfg.idiotIndex?.target > 0 ? cfg.idiotIndex.target : null;
    for (const cls of TECH_CLASSES) {
      // Recipe units take the class factor (learning × equipment, squeezed to the class floor).
      // Designed units take learning × equipment only, squeezed to their own materials floor.
      const d = perKgDay.designed?.[cls];
      let usdPerKgDay = perKgDay[cls] * (ctx.costFactors[cls] ?? 1);
      if (d && cls !== 'storage') {
        const raw = ctx.rawFactors?.[cls] ?? ctx.costFactors[cls] ?? 1;
        let designed = d.usd * raw;
        // Same rule as recipe units: squeezed only when the class has a materials floor configured.
        if (target && !d.unfloored && ctx.floors?.[cls]) designed = Math.min(designed, d.floorUsd * target);
        usdPerKgDay = Math.max(0, perKgDay[cls] - d.usd) * (ctx.costFactors[cls] ?? 1) + designed;
      }
      const value = usdPerKgDay * sizeKgPerDay * sf * siteMult;
      processByTech[cls] = value;
      refCapexByTech[cls] = perKgDay[cls] * sizeKgPerDay;
      processCapex += value;
    }
    // Solar-only utilization: resize equipment for sun hours, add storage, derate output.
    const util = utilFor(cfg);
    const profile = util.enabled ? Utilization.operatingProfile(pathway, util, cfg.designs?.units) : null;
    // A designed unit (e.g. electrolyzer) can change the recipe's kWh/kg (utilization.unitEnergyScale).
    const kWhPerKg = (Number(pathway.electricityKWhPerKg) || 0) + (Number(pathway.heatKWhPerKg) || 0)
      + (profile ? profile.energyDeltaKWhPerKg : 0);
    let design = null;
    let pvKWp;
    if (profile && site.pvKWhPerKWpDay > 0) {
      const capex24ByClass = {};
      for (const cls of TECH_CLASSES) if (cls !== 'storage') capex24ByClass[cls] = processByTech[cls];
      const storageFactor = ctx.costFactors.storage ?? 1;
      // Designs depend on this year's costs, not on market prices: cache them for the year.
      const designKey = pathway.id + '|' + site.id + '|' + sizeKgPerDay;
      design = ctx.designCache?.get(designKey);
      if (!design) {
        design = Utilization.designPlant(profile, site, sizeKgPerDay, {
          pvUsdPerKWp: ctx.pvUsdPerKWp * siteMult,
          batteryUsdPerKWh: (ctx.storagePrices?.battery ?? util.battery.usdPerKWh * storageFactor) * siteMult,
          thermalUsdPerKWh: (ctx.storagePrices?.thermal ?? util.thermal.usdPerKWh * storageFactor) * siteMult,
          bufferUsdPerKg: ctx.storagePrices
            ? Object.fromEntries(Object.entries(ctx.storagePrices.bufferUsdPerKg).map(([k, v]) => [k, v * siteMult]))
            : null,
          capex24ByClass,
        }, util);
        ctx.designCache?.set(designKey, design);
      }
      processCapex = 0;
      for (const cls of TECH_CLASSES) {
        if (cls !== 'storage') {
          const before = processByTech[cls];
          processByTech[cls] = design.capexByClass[cls] || 0;
          if (before > 0) refCapexByTech[cls] *= processByTech[cls] / before;
        }
      }
      processByTech.storage += design.storageUsd;
      refCapexByTech.storage += design.storageUsd / Math.max(storageFactor, 1e-9) / siteMult;
      for (const cls of TECH_CLASSES) processCapex += processByTech[cls];
      pvKWp = design.pvKWp;
    } else {
      pvKWp = site.pvKWhPerKWpDay > 0 ? (kWhPerKg * sizeKgPerDay) / site.pvKWhPerKWpDay : 0;
    }
    const outputFactor = design ? design.outputFactor : 1;
    const annualKg = sizeKgPerDay * 365 * outputFactor;
    let pvCapex = pvKWp * ctx.pvUsdPerKWp * siteMult;
    let landHa = pvKWp * cfg.pv.landHaPerKWp;
    const landUsdPerHa = site.landUsdPerHa > 0 ? site.landUsdPerHa : cfg.defaultLandUsdPerHa;
    let landCapex = landHa * landUsdPerHa;
    let electricityKWhPerYear = kWhPerKg * annualKg;

    let feedUsdPerKg = 0;
    const feedsKgPerYear = [];
    const { variableOmDelta, feedFactor } = designedOpex(pathway, cfg);
    const purchasedIntermediates = [];
    for (const feed of pathway.feeds || []) {
      const kgPerKg = (Number(feed.kgPerKg) || 0) * feedFactor(feed.id);
      if (integrated.has(feed.id) || !(kgPerKg > 0)) continue; // a design can remove a feed (factor 0)
      feedsKgPerYear.push({ id: feed.id, origin: feed.origin || 'unknown', kg: kgPerKg * annualKg });
      if (!feed.purchased) continue;
      if (feed.origin === 'intermediate') purchasedIntermediates.push(feed.id);
      feedUsdPerKg += kgPerKg * ((Number(feed.usdPerKg) || 0) + (Number(feed.freightUsdPerKg) || 0));
    }
    // Recipe fixed O&M applies to process equipment; stores carry their own O&M (below).
    const storageUsd = design ? design.storageUsd : 0;
    // PV O&M scales with PV capex (constant O&M/capex ratio), so cheap solar is cheap to run too.
    let pvOm = pvCapex * pvOmFraction(cfg.pv);
    let storageOm = design ? design.storageFixedOmUsdPerYear : 0;
    let equipmentOm = (processCapex - storageUsd) * (Number(pathway.fixedOmFracPerYear) || 0);
    let feedCost = annualKg * feedUsdPerKg;
    let otherVariable = annualKg * Math.max(0, (Number(pathway.variableOmUsdPerKg) || 0) + variableOmDelta);

    const price = ctx.priceFor(pathway.product, null, annualKg);
    const sales = [{ product: pathway.product, kgPerYear: annualKg, fallbackUsdPerKg: null }];
    let coproductRevenue = 0;
    for (const co of pathway.coproducts || []) {
      const coKg = (Number(co.kgPerKg) || 0) * annualKg;
      coproductRevenue += coKg * ctx.priceFor(co.product, co.usdPerKg, coKg);
      sales.push({ product: co.product || null, id: co.id, kgPerYear: coKg, fallbackUsdPerKg: co.usdPerKg });
    }

    // Fold captive supplier units into this plant. The plant life is the capex-weighted life of its
    // equipment; stores are excluded because they are replaced on their own schedule (reserve below).
    let lifeCapexWeighted = (processCapex - storageUsd) * (Number(pathway.assetLifeYears) || cfg.pv.lifeYears);
    let lifeWeight = processCapex - storageUsd;
    for (const item of integration) {
      const u = item.unit;
      for (const cls of TECH_CLASSES) {
        processByTech[cls] += u.capex.byTech[cls];
        refCapexByTech[cls] += u.refCapexByTech[cls];
      }
      processCapex += u.capex.process;
      pvKWp += u.pvKWp;
      pvCapex += u.capex.pv;
      landHa += u.landHa;
      landCapex += u.capex.land;
      electricityKWhPerYear += u.electricityKWhPerYear;
      pvOm += u.costParts.pvOm;
      storageOm += u.costParts.storageOm + u.costParts.storageReplacement;
      equipmentOm += u.costParts.equipmentOm;
      feedCost += u.costParts.feedCost;
      otherVariable += u.costParts.otherVariable;
      coproductRevenue += u.coproductRevenue;
      for (const sale of u.sales.slice(1)) sales.push(sale);
      for (const feed of u.feedsKgPerYear) feedsKgPerYear.push(feed);
      lifeCapexWeighted += u.capex.process * u.lifeYears;
      lifeWeight += u.capex.process;
      // A sun-following captive supplier feeding a steady consumer: buffer the intermediate
      // through the supplier's off-hours.
      const flh = u.utilization?.flexFullLoadHoursPerDay;
      if (profile?.hasBase && Number.isFinite(flh) && flh < 24) {
        const substance = PRODUCT_SUBSTANCE[item.product] || 'default';
        const prices = ctx.storagePrices?.bufferUsdPerKg;
        const kg = item.kgPerDay * outputFactor * (24 - flh) / 24;
        const usd = kg * (prices
          ? (prices[substance] ?? prices.default)
          : (util.bufferUsdPerKg[substance] ?? util.bufferUsdPerKg.default) * (ctx.costFactors.storage ?? 1)) * siteMult;
        item.bufferKg = kg;
        item.bufferUsd = usd;
        processByTech.storage += usd;
        refCapexByTech.storage += usd / Math.max(ctx.costFactors.storage ?? 1, 1e-9) / siteMult;
        processCapex += usd;
      }
    }
    const capexTotal = processCapex + pvCapex + landCapex;
    const processLife = lifeWeight > 0 ? lifeCapexWeighted / lifeWeight : (Number(pathway.assetLifeYears) || cfg.pv.lifeYears);
    const life = Math.max(1, Math.min(processLife, cfg.pv.lifeYears));
    // Replacement reserve for stores that wear out within the plant's life.
    const storageReplacementUsdPerYear = design
      ? design.batteryUsd * Math.max(0, 1 / design.batteryLifeYears - 1 / life)
        + design.thermalUsd * Math.max(0, 1 / design.thermalLifeYears - 1 / life)
      : 0;
    const fixedOm = pvOm + storageOm + equipmentOm + storageReplacementUsdPerYear;
    const variableOm = feedCost + otherVariable;
    const opex = fixedOm + variableOm;
    const revenue = annualKg * price + coproductRevenue;
    const annualCash = revenue - opex;
    const af = annuityFactor(cfg.finance.discountRate, life);
    const npv = plantNpv(cfg, capexTotal, annualCash, af);
    const crf = af > 0 ? 1 / af : 0;
    // Gross: full plant cost per kg of primary product. Net (LCOP): after crediting coproduct
    // revenue — can go negative for multi-product plants (e.g. brine hubs) whose coproducts pay for everything.
    const grossCost = annualKg > 0 ? (capexTotal * crf + opex) / annualKg : Infinity;
    const coproductCredit = annualKg > 0 ? coproductRevenue / annualKg : 0;
    const lcop = grossCost - coproductCredit;
    // Cost per kg by driver. Energy = PV + land + stores, captive buffers included (capital recovery
    // + O&M + replacements): what cheaper electricity would cut. effectiveEnergyUsdPerKWh is that
    // over the kWh used.
    const energyAnnual = (pvCapex + landCapex + processByTech.storage) * crf + pvOm + storageOm + storageReplacementUsdPerYear;
    const equipmentAnnual = (processCapex - processByTech.storage) * crf + equipmentOm;
    const perKg = v => (annualKg > 0 ? v / annualKg : Infinity);
    const costBreakdownUsdPerKg = {
      energy: perKg(energyAnnual),
      equipment: perKg(equipmentAnnual),
      feedstock: perKg(feedCost),
      other: perKg(otherVariable),
    };
    return {
      pathwayId: pathway.id,
      product: pathway.product,
      siteId: site.id,
      sizeKgPerDay,
      annualKg,
      scaleFactor: sf,
      capex: { total: capexTotal, process: processCapex, byTech: processByTech, pv: pvCapex, land: landCapex },
      refCapexByTech,
      pvKWp,
      landHa,
      electricityKWhPerYear,
      opex: { total: opex, fixed: fixedOm, variable: variableOm },
      priceUsdPerKg: price,
      revenue,
      coproductRevenue,
      annualCash,
      lifeYears: life,
      npv,
      profitabilityIndex: capexTotal > 0 ? npv / capexTotal : 0,
      lcopUsdPerKg: lcop,
      grossCostUsdPerKg: grossCost,
      costBreakdownUsdPerKg,
      energyKWhPerKg: annualKg > 0 ? electricityKWhPerYear / annualKg : 0,
      effectiveEnergyUsdPerKWh: electricityKWhPerYear > 0 ? energyAnnual / electricityKWhPerYear : 0,
      costParts: { pvOm, storageOm, storageReplacement: storageReplacementUsdPerYear, equipmentOm, feedCost, otherVariable },
      coproductCreditUsdPerKg: coproductCredit,
      marginUsdPerKg: price - lcop,
      sales,
      materialKgPerYear: sales.reduce((sum, sale) => sum + (!ctx.isMaterial || ctx.isMaterial(sale.product) ? sale.kgPerYear : 0), 0),
      feedsKgPerYear,
      purchasedIntermediates,
      integration: integration.map(({ unit, ...item }) => item),
      utilization: design ? {
        strategy: design.strategy,
        outputFactor: design.outputFactor,
        flexFullLoadHoursPerDay: design.flexFullLoadHoursPerDay,
        flexNameplateFactor: design.flexNameplateFactor,
        batteryKWh: design.batteryKWh,
        thermalKWh: design.thermalKWh,
        bufferUsd: design.bufferUsd,
        buffers: design.buffers,
        storageUsd: design.storageUsd,
        storageReplacementUsdPerYear,
        alternatives: design.alternatives,
      } : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Simulation

  const mergeConfig = override => merge(DEFAULTS, override || {});

  function allowedPathways(cfg, pathways) {
    return (pathways || []).filter(p => p.refOutputKgPerDay > 0
      && (!cfg.build.allowPathways || cfg.build.allowPathways.includes(p.id)));
  }

  // sitesById covers every input site (brine recipes look up their reference site even when it is
  // not buildable); sites are the buildable ones.
  function normalizeInputs(input) {
    const cfg = mergeConfig(input.config);
    const sites = (input.sites || []).filter(site => site.pvKWhPerKWpDay > 0
      && (!cfg.build.allowSites || cfg.build.allowSites.includes(site.id)));
    return {
      cfg,
      markets: input.markets || {},
      sites,
      sitesById: new Map((input.sites || []).map(s => [s.id, s])),
      pathways: allowedPathways(cfg, input.pathways),
    };
  }

  function createState(cfg) {
    return {
      cash: cfg.finance.initialEquityUsd,
      equityInUsd: cfg.finance.initialEquityUsd,
      loans: [], // { principal, payment, yearsLeft }
      plants: [], // { id, pathwayId, siteId, product, sizeKgPerDay, builtYear, onlineYear, lifeYears, capexUsd, eval }
      cumRefUsd: Object.fromEntries(TECH_CLASSES.map(cls => [cls, 0])),
      lastReliefByMarket: {}, // market → price relief caused by the company last year (Terraform loop)
      nextId: 1,
      buildCapacityUsd: Number.isFinite(cfg.build.initialBuildUsdPerYear) ? cfg.build.initialBuildUsdPerYear : Infinity,
    };
  }

  // Materials floors for this year. With a bom, re-price each class's bill of materials at commodity
  // prices reduced by last year's market relief from the company's own supply; else static floors.
  function liveFloors(cfg, reliefByMarket) {
    const ii = cfg.idiotIndex || {};
    if (!ii.bom?.classes || !ii.bom?.commodities) return { floors: ii.floors || {}, commodityFactors: {} };
    const commodityFactors = {};
    for (const material of Object.keys(ii.bom.commodities)) {
      const link = ii.commodityMarkets?.[material];
      const relief = link ? (reliefByMarket?.[link.market] || 0) * (link.weight ?? 1) : 0;
      commodityFactors[material] = Math.max(0, 1 - relief);
    }
    const floors = {};
    for (const [cls, row] of Object.entries(ii.bom.classes)) {
      if (!row) continue;
      let materials = 0;
      for (const line of row.lines || []) {
        materials += (Number(line.kgPerUnit) || 0) * (Number(ii.bom.commodities[line.material]) || 0) * (commodityFactors[line.material] ?? 1);
      }
      floors[cls] = row.absolute
        ? { materialsUsdPerUnit: materials }
        : { floorFraction: row.todayUsdPerUnit > 0 ? materials / row.todayUsdPerUnit : 0 };
    }
    return { floors, commodityFactors };
  }

  // Cap a cost at its materials floor × the target idiot index (absolute $ per unit).
  function squashUsd(cfg, cls, usd, floors = cfg.idiotIndex?.floors) {
    const target = cfg.idiotIndex?.target;
    const materials = floors?.[cls]?.materialsUsdPerUnit;
    return target > 0 && materials > 0 ? Math.min(usd, materials * target) : usd;
  }
  // Same for a cost factor relative to today's recipe price (floorFraction = materials / today).
  function squashFactor(cfg, cls, factor, floors = cfg.idiotIndex?.floors) {
    const target = cfg.idiotIndex?.target;
    const ff = floors?.[cls]?.floorFraction;
    return target > 0 && ff > 0 ? Math.min(factor, ff * target) : factor;
  }

  function yearContext(cfg, markets, state, yearIndex, year, committedKg, extras = {}) {
    const costFactors = {};
    const rawFactors = {};
    const equipment = Number.isFinite(cfg.equipmentCostMultiplier) ? cfg.equipmentCostMultiplier : 1;
    const { floors, commodityFactors } = liveFloors(cfg, state.lastReliefByMarket);
    for (const cls of TECH_CLASSES) {
      const learned = techCostFactor(cfg.tech[cls] || {}, yearIndex, state.cumRefUsd[cls]);
      rawFactors[cls] = cls === 'storage' ? learned : learned * equipment;
      costFactors[cls] = cls === 'storage' ? learned : squashFactor(cfg, cls, learned * equipment, floors);
    }
    const pvUsdPerKWp = squashUsd(cfg, 'pv', pvCapexUsdPerKWp(cfg.pv, yearIndex), floors);
    // Storage prices for this year: learning/decline on the storage class, then the squeeze.
    const util = utilFor(cfg);
    const sf = costFactors.storage;
    const bufferUsdPerKg = {};
    for (const [substance, usd] of Object.entries(util.bufferUsdPerKg)) {
      bufferUsdPerKg[substance] = substance === 'H2'
        ? squashUsd(cfg, 'h2Storage', usd * sf, floors)
        : usd * squashFactor(cfg, 'process', sf, floors);
    }
    const storagePrices = {
      battery: squashUsd(cfg, 'battery', util.battery.usdPerKWh * sf, floors),
      thermal: squashUsd(cfg, 'thermalStore', util.thermal.usdPerKWh * sf, floors),
      bufferUsdPerKg,
    };
    const shareOf = (product, extraKg = 0) => {
      const group = marketGroupOf(cfg, product);
      const demandT = marketDemandT(markets[group], year);
      if (!Number.isFinite(demandT)) return 0;
      return (groupKg(cfg, committedKg, group) + extraKg) / 1000 / demandT;
    };
    const priceFor = (product, fallback, extraKg = 0) => {
      if (!product && !(fallback > 0)) return 0;
      return realizedPrice(cfg, product ? markets[product] : null, fallback, shareOf(product, extraKg));
    };
    // Share-ceiling cap in kg/year per market group, memoized for the year.
    const caps = new Map();
    const capKg = group => {
      if (!caps.has(group)) {
        const demandT = marketDemandT(markets[group], year);
        caps.set(group, Number.isFinite(demandT) ? cfg.build.maxMarketShare * demandT * 1000 : Infinity);
      }
      return caps.get(group);
    };
    // Material counts toward abundance only if it serves a world market (by-product water does not).
    const isMaterial = product => Boolean(product && markets[marketGroupOf(cfg, product)]);
    return { cfg, yearIndex, year, costFactors, rawFactors, pvUsdPerKWp, storagePrices, floors, commodityFactors, priceFor, shareOf, capKg, isMaterial, designCache: new Map(), ...extras };
  }

  function marketGroupOf(cfg, product) {
    return (product && cfg.marketGroups?.[product]) || product;
  }

  // group → [group, ...member products], memoized per config object.
  const groupMembersCache = new WeakMap();
  function groupMembers(cfg, group) {
    let byGroup = groupMembersCache.get(cfg);
    if (!byGroup) {
      byGroup = new Map();
      for (const [member, target] of Object.entries(cfg.marketGroups || {})) {
        if (!byGroup.has(target)) byGroup.set(target, [target]);
        byGroup.get(target).push(member);
      }
      groupMembersCache.set(cfg, byGroup);
    }
    return byGroup.get(group) || [group];
  }

  function groupKg(cfg, kgByProduct, group) {
    let total = 0;
    for (const product of groupMembers(cfg, group)) total += kgByProduct[product] || 0;
    return total;
  }

  function addTo(map, key, value) {
    if (!key) return;
    map[key] = (map[key] || 0) + value;
  }

  // Committed annual kg per sold product of every plant not yet retired (operating or under
  // construction): drives share caps and prices for new builds.
  function committedOutput(state, year) {
    const out = {};
    for (const plant of state.plants) {
      if (year >= plant.onlineYear + plant.lifeYears) continue;
      for (const sale of plant.eval.sales) addTo(out, sale.product, sale.kgPerYear);
    }
    return out;
  }

  function candidateSizes(cfg, pathway) {
    const sizes = new Set();
    for (const m of cfg.build.sizeMultiples) {
      const size = Math.min(cfg.build.maxPlantKgPerDay, pathway.refOutputKgPerDay * m);
      if (size > 0) sizes.add(size);
    }
    return [...sizes].sort((a, b) => a - b);
  }

  // Market groups a pathway's plants can sell into, including captive suppliers' coproducts.
  function candidateGroups(cfg, pathway, suppliers) {
    const groups = productGroups(cfg, pathway);
    const feedProducts = cfg.integration?.feedProducts || {};
    for (const feed of pathway.feeds || []) {
      for (const supplier of suppliers.get(feedProducts[feed.id]) || []) {
        for (const group of productGroups(cfg, supplier)) groups.add(group);
      }
    }
    return groups;
  }

  function productGroups(cfg, pathway) {
    const groups = new Set([marketGroupOf(cfg, pathway.product)]);
    for (const co of pathway.coproducts || []) if (co.product) groups.add(marketGroupOf(cfg, co.product));
    return groups;
  }

  // Every product a plant sells (primary, coproducts, captive suppliers' coproducts) must stay
  // under the share ceiling.
  function salesFit(cfg, ctx, ev, committedKg) {
    if (!ev.salesByGroup) {
      const add = new Map();
      for (const sale of ev.sales) {
        if (!sale.product) continue;
        const group = marketGroupOf(cfg, sale.product);
        add.set(group, (add.get(group) || 0) + sale.kgPerYear);
      }
      ev.salesByGroup = [...add];
    }
    for (const [group, kg] of ev.salesByGroup) {
      if (groupKg(cfg, committedKg, group) + kg > ctx.capKg(group)) return false;
    }
    return true;
  }

  // Per-run candidate structure: compatible sites and size ladder per pathway.
  function buildCandidates(cfg, pathways, sites, sitesById, suppliers) {
    return pathways.map(pathway => ({
      pathway,
      group: marketGroupOf(cfg, pathway.product),
      groups: candidateGroups(cfg, pathway, suppliers),
      sites: sites.filter(site => siteAllowsPathway(site, pathway, sitesById)),
      sizes: candidateSizes(cfg, pathway),
    })).filter(item => item.sites.length && item.sizes.length);
  }

  // Re-price a cached plant evaluation after market shares moved: costs, design and integration
  // are market-independent for the year; only prices, revenue and NPV change.
  function repriceEval(ev, ctx) {
    const price = ctx.priceFor(ev.product, null, ev.annualKg);
    let coproductRevenue = 0;
    for (let i = 1; i < ev.sales.length; i += 1) {
      const sale = ev.sales[i];
      coproductRevenue += sale.kgPerYear * ctx.priceFor(sale.product, sale.fallbackUsdPerKg, sale.kgPerYear);
    }
    const revenue = ev.annualKg * price + coproductRevenue;
    const annualCash = revenue - ev.opex.total;
    const npv = plantNpv(ctx.cfg, ev.capex.total, annualCash, annuityFactor(ctx.cfg.finance.discountRate, ev.lifeYears));
    const coproductCredit = ev.annualKg > 0 ? coproductRevenue / ev.annualKg : 0;
    const lcop = ev.grossCostUsdPerKg - coproductCredit;
    return {
      ...ev,
      priceUsdPerKg: price,
      revenue,
      coproductRevenue,
      annualCash,
      npv,
      profitabilityIndex: ev.capex.total > 0 ? npv / ev.capex.total : 0,
      lcopUsdPerKg: lcop,
      coproductCreditUsdPerKg: coproductCredit,
      marginUsdPerKg: price - lcop,
    };
  }

  const lifetimeKgPerUsd = ev => (ev.capex.total > 0 ? (ev.materialKgPerYear * ev.lifeYears) / ev.capex.total : 0);

  // cache: pathway id → Map(site|size → { ev, stamp }); an evaluation's costs hold for the year, and a
  // stale stamp (a build moved one of its markets) only re-prices it.
  function pickBuild(cfg, ctx, candidates, committedKg, budgetUsd, sitePvKWp, cache, capexRoomUsd) {
    const sitePvCapKWp = (Number(cfg.build.maxPvGWpPerSite) || Infinity) * 1e6;
    // Pass 1: feasible (NPV ≥ 0, hurdle met) and affordable options; per pathway × site, sizes
    // are ascending and stop at the first that breaks a site or market ceiling.
    const feasible = [];
    for (const { pathway, group, sites: pathwaySites, sizes } of candidates) {
      let pathwayCache = cache.get(pathway.id);
      if (!pathwayCache) {
        pathwayCache = new Map();
        cache.set(pathway.id, pathwayCache);
      }
      const headroomKg = ctx.capKg(group) - groupKg(cfg, committedKg, group);
      if (!(headroomKg > 0)) continue;
      const stamp = cache.stamps.get(pathway.id) || 0;
      for (const site of pathwaySites) {
        const pvRoomKWp = sitePvCapKWp - (sitePvKWp[site.id] || 0);
        if (!(pvRoomKWp > 0)) continue;
        for (const size of sizes) {
          if (size * 365 > headroomKg) break;
          const key = site.id + '|' + size;
          let entry = pathwayCache.get(key);
          if (!entry) {
            entry = { ev: evaluatePlant(pathway, site, size, ctx), stamp };
            pathwayCache.set(key, entry);
          } else if (entry.stamp !== stamp) {
            entry = { ev: repriceEval(entry.ev, ctx), stamp };
            pathwayCache.set(key, entry);
          }
          const ev = entry.ev;
          if (ev.pvKWp > pvRoomKWp) break;
          if (cfg.build.infiniteSourcesOnly && ev.purchasedIntermediates.length) break;
          if (!(ev.npv >= 0) || ev.profitabilityIndex < cfg.build.minProfitabilityIndex) continue;
          if (ev.capex.total * (1 - cfg.finance.debtFraction) > budgetUsd) continue;
          if (ev.capex.total > capexRoomUsd) continue;
          feasible.push(ev);
        }
      }
    }
    if (!feasible.length) return null;
    // Pass 2: score, then take the best option that also fits every market it sells into.
    let score;
    if (cfg.objective === 'profit') {
      score = ev => ev.npv;
    } else {
      let lambda = 0;
      for (const ev of feasible) lambda = Math.max(lambda, lifetimeKgPerUsd(ev));
      const value = ev => ev.materialKgPerYear * ev.lifeYears + lambda * ev.npv;
      if (cfg.abundanceScore === 'absolute') {
        score = value;
      } else {
        // Resource-weighted (multi-knapsack greedy): lifetime material value per share of this
        // year's scarce resources it uses — equity budget, construction capacity, and the solar
        // room left across all sites. Whichever is tightest dominates: capital early, solar later.
        let pvRoom = 0;
        const seen = new Set();
        for (const c of candidates) {
          for (const site of c.sites) {
            if (seen.has(site.id)) continue;
            seen.add(site.id);
            pvRoom += Math.max(0, sitePvCapKWp - (sitePvKWp[site.id] || 0));
          }
        }
        const debtFree = 1 - cfg.finance.debtFraction;
        score = ev => {
          const use = (budgetUsd > 0 ? ev.capex.total * debtFree / budgetUsd : 0)
            + (Number.isFinite(capexRoomUsd) && capexRoomUsd > 0 ? ev.capex.total / capexRoomUsd : 0)
            + (Number.isFinite(pvRoom) && pvRoom > 0 ? ev.pvKWp / pvRoom : 0);
          return use > 0 ? value(ev) / use : value(ev);
        };
      }
    }
    // Best-scoring option that also fits every market it sells into. Linear argmax with
    // rejection (salesFit rarely fails), instead of sorting every option on every pick.
    const scores = feasible.map(score);
    for (;;) {
      let bestIndex = -1;
      for (let i = 0; i < feasible.length; i += 1) {
        if (scores[i] > -Infinity && (bestIndex < 0 || scores[i] > scores[bestIndex])) bestIndex = i;
      }
      if (bestIndex < 0) return null;
      if (salesFit(cfg, ctx, feasible[bestIndex], committedKg)) return feasible[bestIndex];
      scores[bestIndex] = -Infinity;
    }
  }

  function simulateCompany(input = {}) {
    const { cfg, markets, sites, sitesById, pathways } = normalizeInputs(input);
    const pathwaysById = new Map(pathways.map(p => [p.id, p]));
    const state = createState(cfg);
    const timeline = [];
    let minCash = state.cash;
    const suppliers = captiveSuppliers(cfg, pathways);
    const candidates = buildCandidates(cfg, pathways, sites, sitesById, suppliers);
    let cumulativeMaterialT = 0;

    for (let yearIndex = 0; yearIndex < cfg.years; yearIndex += 1) {
      const year = cfg.startYear + yearIndex;
      const raise = (cfg.finance.equityRaises || []).filter(item => item.year === year)
        .reduce((sum, item) => sum + (Number(item.usd) || 0), 0);
      state.cash += raise;
      state.equityInUsd += raise;

      // 1–2. Operate plants online this year at prices set by operating output share.
      const operating = state.plants.filter(plant => plant.onlineYear <= year
        && year < plant.onlineYear + plant.lifeYears);
      const operatingKg = {};
      for (const plant of operating) {
        for (const sale of plant.eval.sales) addTo(operatingKg, sale.product, sale.kgPerYear);
      }
      const opCtx = yearContext(cfg, markets, state, yearIndex, year, operatingKg);
      let revenue = 0;
      let opex = 0;
      const revenueByProduct = {};
      const priceByProduct = {};
      const feedTByOrigin = {};
      const captiveTByProduct = {};
      let pvKWp = 0;
      let landHa = 0;
      let electricityKWh = 0;
      for (const plant of operating) {
        let plantRevenue = 0;
        for (const sale of plant.eval.sales) {
          const price = opCtx.priceFor(sale.product, sale.fallbackUsdPerKg, 0);
          plantRevenue += sale.kgPerYear * price;
          addTo(revenueByProduct, sale.product || sale.id, sale.kgPerYear * price);
          if (sale.product) priceByProduct[sale.product] = price;
        }
        for (const item of plant.eval.integration) addTo(captiveTByProduct, item.product, item.kgPerDay * 365 / 1000);
        // Opex is fixed at build (fixed O&M on built capex; feed prices static).
        revenue += plantRevenue;
        opex += plant.eval.opex.total;
        pvKWp += plant.eval.pvKWp;
        landHa += plant.eval.landHa;
        electricityKWh += plant.eval.electricityKWhPerYear;
        for (const feed of plant.eval.feedsKgPerYear) addTo(feedTByOrigin, feed.origin, feed.kg / 1000);
      }

      // 3. Debt service.
      let debtService = 0;
      let interest = 0;
      for (const loan of state.loans) {
        if (loan.yearsLeft <= 0) continue;
        const int = loan.principal * cfg.finance.debtRate;
        const pay = Math.min(loan.payment, loan.principal + int);
        loan.principal = Math.max(0, loan.principal + int - pay);
        loan.yearsLeft -= 1;
        debtService += pay;
        interest += int;
      }
      const operatingCash = revenue - opex;
      state.cash += operatingCash - debtService;

      // 4. Build.
      const committedKg = committedOutput(state, year);
      const built = [];
      let capexSpent = 0;
      let debtRaised = 0;
      let budget = Math.max(0, state.cash - cfg.finance.cashReserveUsd);
      const sitePvKWp = {};
      for (const plant of state.plants) {
        if (year < plant.onlineYear + plant.lifeYears) sitePvKWp[plant.siteId] = (sitePvKWp[plant.siteId] || 0) + plant.eval.pvKWp;
      }
      // Cost factors are fixed for the year (this year's learning lowers next year's costs);
      // prices read committedKg live, so only evaluations touching a built plant's markets go stale.
      const ctx = yearContext(cfg, markets, state, yearIndex, year, committedKg, { suppliers, sitesById });
      const cache = new Map();
      cache.stamps = new Map(); // pathway id → price-staleness stamp (see repriceEval)
      const buildCapacityUsd = state.buildCapacityUsd;
      const maxPlants = Number.isFinite(cfg.build.maxPlantsPerYear) ? cfg.build.maxPlantsPerYear : 10000;
      for (let n = 0; n < maxPlants; n += 1) {
        const choice = pickBuild(cfg, ctx, candidates, committedKg, budget, sitePvKWp, cache, buildCapacityUsd - capexSpent);
        if (!choice) break;
        const pathway = pathwaysById.get(choice.pathwayId);
        const debt = choice.capex.total * cfg.finance.debtFraction;
        const equity = choice.capex.total - debt;
        budget -= equity;
        state.cash -= equity;
        capexSpent += choice.capex.total;
        if (debt > 0) {
          const term = cfg.finance.debtTermYears;
          const payment = debt / annuityFactor(cfg.finance.debtRate, term);
          state.loans.push({ principal: debt, payment, yearsLeft: term });
          debtRaised += debt;
        }
        for (const cls of TECH_CLASSES) state.cumRefUsd[cls] += choice.refCapexByTech[cls];
        const plant = {
          id: state.nextId++,
          pathwayId: pathway.id,
          siteId: choice.siteId,
          product: pathway.product,
          sizeKgPerDay: choice.sizeKgPerDay,
          builtYear: year,
          onlineYear: year + (cfg.build.leadTimeYears || 0),
          lifeYears: choice.lifeYears,
          capexUsd: choice.capex.total,
          eval: choice,
        };
        state.plants.push(plant);
        const touched = new Set(choice.sales.filter(sale => sale.product).map(sale => marketGroupOf(cfg, sale.product)));
        for (const other of candidates) {
          if (![...other.groups].some(group => touched.has(group))) continue;
          // Its markets moved: cached costs stay valid for the year; prices are refreshed on next use.
          cache.stamps.set(other.pathway.id, (cache.stamps.get(other.pathway.id) || 0) + 1);
        }
        sitePvKWp[plant.siteId] = (sitePvKWp[plant.siteId] || 0) + choice.pvKWp;
        for (const sale of choice.sales) addTo(committedKg, sale.product, sale.kgPerYear);
        built.push({
          plantId: plant.id,
          pathwayId: plant.pathwayId,
          siteId: plant.siteId,
          product: plant.product,
          sizeKgPerDay: plant.sizeKgPerDay,
          capexUsd: choice.capex.total,
          npvUsd: choice.npv,
          lcopUsdPerKg: choice.lcopUsdPerKg,
          priceUsdPerKg: choice.priceUsdPerKg,
          integration: choice.integration,
        });
      }

      // Next year's construction capacity grows from what was actually built this year.
      if (Number.isFinite(cfg.build.initialBuildUsdPerYear)) {
        state.buildCapacityUsd = Math.max(
          cfg.build.initialBuildUsdPerYear,
          capexSpent * (1 + (cfg.build.buildGrowthPerYear || 0)),
          Number.isFinite(buildCapacityUsd) ? buildCapacityUsd * (cfg.build.buildCapacityRetention || 0) : 0,
        );
      }
      const debtOutstanding = state.loans.reduce((sum, loan) => sum + loan.principal, 0);
      const bookValue = state.plants.reduce((sum, plant) => {
        const age = year + 1 - plant.builtYear;
        return sum + plant.capexUsd * Math.max(0, 1 - age / (plant.lifeYears + (plant.onlineYear - plant.builtYear)));
      }, 0);
      minCash = Math.min(minCash, state.cash);
      const outputTByProduct = {};
      const shareByProduct = {};
      const shareByMarket = {};
      const demandTByMarket = {};
      for (const [product, kg] of Object.entries(operatingKg)) {
        outputTByProduct[product] = kg / 1000;
        const group = marketGroupOf(cfg, product);
        const demandT = marketDemandT(markets[group], year);
        shareByProduct[product] = Number.isFinite(demandT) ? groupKg(cfg, operatingKg, group) / 1000 / demandT : null;
        if (Number.isFinite(demandT)) {
          shareByMarket[group] = shareByProduct[product];
          demandTByMarket[group] = demandT;
        }
      }
      const priceReliefByMarket = {};
      // A market group's relief is that of its largest-selling member, against the group's own price.
      const reliefKg = {};
      for (const [product, price] of Object.entries(priceByProduct)) {
        const group = marketGroupOf(cfg, product);
        const p0 = Number(markets[group]?.priceUsdPerKg ?? markets[product]?.priceUsdPerKg);
        const t = outputTByProduct[product] || 0;
        if (!(p0 > 0) || (reliefKg[group] ?? -1) >= t) continue;
        reliefKg[group] = t;
        priceReliefByMarket[group] = Math.max(0, 1 - price / p0);
      }
      const materialTPerYear = Object.entries(outputTByProduct)
        .reduce((sum, [product, t]) => sum + (markets[marketGroupOf(cfg, product)] ? t : 0), 0);
      cumulativeMaterialT += materialTPerYear;
      // The Terraform loop: this year's relief re-prices next year's materials floors.
      state.lastReliefByMarket = priceReliefByMarket;
      timeline.push({
        year,
        materialTPerYear,
        cumulativeMaterialT,
        priceReliefByMarket,
        equityRaisedUsd: raise,
        revenueUsd: revenue,
        opexUsd: opex,
        operatingCashUsd: operatingCash,
        interestUsd: interest,
        debtServiceUsd: debtService,
        capexUsd: capexSpent,
        buildCapacityUsd: Number.isFinite(buildCapacityUsd) ? buildCapacityUsd : null,
        debtRaisedUsd: debtRaised,
        cashUsd: state.cash,
        debtUsd: debtOutstanding,
        bookValueUsd: bookValue,
        netAssetsUsd: state.cash + bookValue - debtOutstanding,
        plantsOperating: operating.length,
        plantsTotal: state.plants.length,
        built,
        outputTByProduct,
        revenueByProduct,
        priceByProduct,
        shareByProduct,
        shareByMarket,
        demandTByMarket,
        feedTByOrigin,
        captiveTByProduct,
        pvGWp: pvKWp / 1e6,
        landHa,
        electricityTWh: electricityKWh / 1e9,
        pvCapexUsdPerKWp: opCtx.pvUsdPerKWp,
        solarUsdPerKWh: solarLcoe(cfg.pv, cfg.finance, opCtx.pvUsdPerKWp),
        costFactors: { ...opCtx.costFactors },
        rawFactors: { ...opCtx.rawFactors },
        storagePrices: opCtx.storagePrices,
        commodityPriceFactors: { ...opCtx.commodityFactors },
        materialsFloors: Object.fromEntries(Object.entries(opCtx.floors || {}).map(([cls, f]) => [cls, f.materialsUsdPerUnit ?? f.floorFraction])),
      });
    }

    const last = timeline[timeline.length - 1] || {};
    return {
      config: cfg,
      timeline,
      plants: state.plants.map(plant => ({
        id: plant.id,
        pathwayId: plant.pathwayId,
        siteId: plant.siteId,
        product: plant.product,
        sizeKgPerDay: plant.sizeKgPerDay,
        builtYear: plant.builtYear,
        onlineYear: plant.onlineYear,
        capexUsd: plant.capexUsd,
        pvKWp: plant.eval.pvKWp,
        landHa: plant.eval.landHa,
        npvAtBuildUsd: plant.eval.npv,
        integration: plant.eval.integration,
      })),
      summary: {
        objective: cfg.objective,
        years: cfg.years,
        finalMaterialTPerYear: last.materialTPerYear || 0,
        cumulativeMaterialT: last.cumulativeMaterialT || 0,
        materialsCount: Object.keys(last.outputTByProduct || {}).length,
        equityInUsd: state.equityInUsd,
        totalCapexUsd: state.plants.reduce((sum, plant) => sum + plant.capexUsd, 0),
        plants: state.plants.length,
        finalRevenueUsd: last.revenueUsd || 0,
        finalOperatingCashUsd: last.operatingCashUsd || 0,
        finalNetAssetsUsd: last.netAssetsUsd || 0,
        equityMultiple: state.equityInUsd > 0 ? (last.netAssetsUsd || 0) / state.equityInUsd : null,
        minCashUsd: minCash,
        finalPvGWp: last.pvGWp || 0,
        finalLandHa: last.landHa || 0,
        productsMade: Object.keys(last.outputTByProduct || {}),
      },
    };
  }

  // Best evaluation of a pathway over the compatible sites; better(a, b) is true when a beats b.
  // Skips plants that still buy an intermediate when build.infiniteSourcesOnly is set.
  function bestSite(pathway, sites, sizeKgPerDay, ctx, better) {
    let best = null;
    for (const site of sites) {
      if (!siteAllowsPathway(site, pathway, ctx.sitesById)) continue;
      const ev = evaluatePlant(pathway, site, sizeKgPerDay, ctx);
      if (ctx.cfg.build.infiniteSourcesOnly && ev.purchasedIntermediates.length) continue;
      if (!best || better(ev, best)) best = ev;
    }
    return best;
  }

  // Static snapshot: best site per pathway at a given size multiple, year 0 costs, no market share.
  function rankOpportunities(input = {}, opts = {}) {
    const { cfg, markets, sites, sitesById, pathways } = normalizeInputs(input);
    const yearIndex = Number(opts.yearIndex) || 0;
    const state = createState(cfg);
    const ctx = yearContext(cfg, markets, state, yearIndex, cfg.startYear + yearIndex, {}, {
      suppliers: captiveSuppliers(cfg, pathways),
      sitesById,
    });
    const multiple = Number(opts.sizeMultiple) || 1;
    const rows = [];
    for (const pathway of pathways) {
      const size = Math.min(cfg.build.maxPlantKgPerDay, pathway.refOutputKgPerDay * multiple);
      const best = bestSite(pathway, sites, size, ctx, (a, b) => a.lcopUsdPerKg < b.lcopUsdPerKg);
      if (!best) continue;
      const infinite = (pathway.feeds || []).reduce((sum, feed) => sum
        + (INFINITE_ORIGINS.includes(feed.origin) ? Number(feed.kgPerKg) || 0 : 0), 0);
      const totalFeed = (pathway.feeds || []).reduce((sum, feed) => sum + (Number(feed.kgPerKg) || 0), 0);
      rows.push({
        ...best,
        name: pathway.name,
        electricityKWhPerKg: pathway.electricityKWhPerKg,
        infiniteSourceShare: pathway.infiniteSourceShare ?? (totalFeed > 0 ? infinite / totalFeed : 1),
        worldDemandT: marketDemandT(markets[pathway.product], ctx.year),
      });
    }
    rows.sort((a, b) => b.marginUsdPerKg / (b.priceUsdPerKg || 1) - a.marginUsdPerKg / (a.priceUsdPerKg || 1));
    return rows;
  }

  // One pathway at one site in a given year, with no company market share (list prices).
  // Cost factors and PV price default to the exogenous decline only (no company learning);
  // pass opts.costFactors / rawFactors / storagePrices / pvUsdPerKWp (a simulateCompany timeline
  // row) to price that year as the simulation did. Integration (make vs buy) follows cfg.integration.
  // Returns evaluatePlant()'s result, or null when the pathway/site is unknown or incompatible.
  function evaluateAtYear(input, pathwayId, siteId, sizeKgPerDay, yearIndex = 0, opts = {}) {
    const { cfg, markets, sitesById, pathways } = normalizeInputs(input);
    const pathway = (input.pathways || []).find(p => p.id === pathwayId);
    const site = sitesById.get(siteId);
    if (!pathway || !site || !siteAllowsPathway(site, pathway, sitesById)) return null;
    const ctx = yearContext(cfg, markets, createState(cfg), yearIndex, cfg.startYear + yearIndex, {}, {
      suppliers: captiveSuppliers(cfg, pathways),
      sitesById,
    });
    if (opts.costFactors) ctx.costFactors = { ...ctx.costFactors, ...opts.costFactors };
    if (opts.rawFactors) ctx.rawFactors = { ...ctx.rawFactors, ...opts.rawFactors };
    if (opts.storagePrices) ctx.storagePrices = opts.storagePrices;
    if (Number.isFinite(opts.pvUsdPerKWp)) ctx.pvUsdPerKWp = opts.pvUsdPerKWp;
    return evaluatePlant(pathway, site, sizeKgPerDay, ctx);
  }

  // ---------------------------------------------------------------------------
  // Energy break-even: the solar electricity price ($/kWh at the reference yield) at which each
  // pathway's best site (highest NPV) reaches NPV = 0 at year-0 equipment, feedstock and storage costs.
  //   limitedBy 'not-energy': even free electricity does not make it feasible (equipment, feedstock
  //     or price is the barrier); breakevenUsdPerKWh = null.
  //   limitedBy 'feasible-at-any-price': still feasible at opts.maxUsdPerKWh; breakevenUsdPerKWh = that cap.
  //   limitedBy 'energy': breakevenUsdPerKWh found by bisection.
  function energyBreakevens(input = {}, opts = {}) {
    const base = mergeConfig(input.config);
    const maxUsdPerKWh = opts.maxUsdPerKWh ?? 0.5;
    const sizeMultiple = Number(opts.sizeMultiple) || 100;
    const allSites = (input.sites || []).filter(s => s.pvKWhPerKWpDay > 0
      && (!base.build.allowSites || base.build.allowSites.includes(s.id)));
    const sitesById = new Map((input.sites || []).map(s => [s.id, s]));
    const pathways = allowedPathways(base, input.pathways);
    const ids = opts.pathwayIds ? new Set(opts.pathwayIds) : null;
    const suppliers = captiveSuppliers(base, pathways);
    const ctxFor = usdPerKWh => {
      // The electricity price is the scanned variable, so the idiot-index squeeze must not cap PV here
      // (it still applies to equipment and storage).
      const cfg = merge(base, {
        pv: { capexUsdPerKWp: pvCapexFromLcoe(usdPerKWh, base.pv, base.finance), floorUsdPerKWp: 0 },
        idiotIndex: {
          floors: { ...(base.idiotIndex?.floors || {}), pv: undefined },
          bom: base.idiotIndex?.bom ? { ...base.idiotIndex.bom, classes: { ...base.idiotIndex.bom.classes, pv: undefined } } : null,
        },
      });
      return yearContext(cfg, input.markets || {}, createState(cfg), 0, cfg.startYear, {}, { suppliers, sitesById });
    };
    const bestAt = (pathway, ctx) => bestSite(pathway, allSites,
      Math.min(base.build.maxPlantKgPerDay, pathway.refOutputKgPerDay * sizeMultiple), ctx, (a, b) => a.npv > b.npv);
    const ctxCache = new Map();
    const ctxAt = usdPerKWh => {
      const key = usdPerKWh.toPrecision(6);
      if (!ctxCache.has(key)) ctxCache.set(key, ctxFor(usdPerKWh));
      return ctxCache.get(key);
    };
    const rows = [];
    const todayUsdPerKWh = solarLcoe(base.pv, base.finance);
    for (const pathway of pathways) {
      if (ids && !ids.has(pathway.id)) continue;
      const atZero = bestAt(pathway, ctxAt(0));
      if (!atZero) continue;
      const today = bestAt(pathway, ctxAt(todayUsdPerKWh));
      const row = {
        pathwayId: pathway.id,
        product: pathway.product,
        siteId: atZero.siteId,
        energyKWhPerKg: today?.energyKWhPerKg ?? atZero.energyKWhPerKg,
        todayUsdPerKWh,
        today: today ? { npv: today.npv, lcopUsdPerKg: today.lcopUsdPerKg, priceUsdPerKg: today.priceUsdPerKg, costBreakdownUsdPerKg: today.costBreakdownUsdPerKg, effectiveEnergyUsdPerKWh: today.effectiveEnergyUsdPerKWh, siteId: today.siteId } : null,
        atFreeEnergy: { npv: atZero.npv, lcopUsdPerKg: atZero.lcopUsdPerKg, costBreakdownUsdPerKg: atZero.costBreakdownUsdPerKg },
        breakevenUsdPerKWh: null,
        limitedBy: null,
      };
      if (!(atZero.npv >= 0)) {
        row.limitedBy = 'not-energy';
      } else if (bestAt(pathway, ctxAt(maxUsdPerKWh)).npv >= 0) {
        row.breakevenUsdPerKWh = maxUsdPerKWh;
        row.limitedBy = 'feasible-at-any-price';
      } else {
        // Bisection on log price: NPV falls monotonically with the electricity price.
        let lo = Math.log(1e-5);
        let hi = Math.log(maxUsdPerKWh);
        for (let i = 0; i < 28; i += 1) {
          const mid = (lo + hi) / 2;
          if (bestAt(pathway, ctxFor(Math.exp(mid))).npv >= 0) lo = mid; else hi = mid;
        }
        row.breakevenUsdPerKWh = Math.exp(lo);
        row.limitedBy = 'energy';
      }
      rows.push(row);
    }
    rows.sort((a, b) => (b.breakevenUsdPerKWh ?? -1) - (a.breakevenUsdPerKWh ?? -1));
    return rows;
  }

  // ---------------------------------------------------------------------------
  // Abundance scoreboard: for every world material market, can the company make it from sun, air,
  // water and rock below today's price, and if not, what stands in the way?
  //   status  'abundant'   best pathway's cost ≤ abundantCostRatio × today's price (default ½)
  //           'feasible'   NPV ≥ 0 at today's price
  //           'blocked'    a pathway exists but does not pay back its capital
  //           'coproduct'  only made as another plant's coproduct (volume follows the main product)
  //           'no-pathway' nothing in the library makes it
  //   costItems: the best pathway's cost per kg split into single items, largest first: each
  //   flowsheet unit's equipment (by its capex share, after designs.units), each purchased feed,
  //   energy (PV + storage + land) and other O&M. blocker = costItems[0], i.e. what to design (a
  //   unit), make cheaper (a feed) or power more cheaply (energy) next for this material.
  // Year 0, best site (lowest LCOP), plants at opts.sizeMultiple (default 100) × reference size, no
  // company market share.
  function abundanceScoreboard(input = {}, opts = {}) {
    const cfg = mergeConfig(input.config);
    const markets = input.markets || {};
    const pathways = input.pathways || [];
    const abundantRatio = opts.abundantCostRatio ?? 0.5;
    const ranked = rankOpportunities(input, { sizeMultiple: opts.sizeMultiple || 100 });
    const groupOf = product => marketGroupOf(cfg, product);
    const coproductOf = new Map();
    for (const p of pathways) {
      for (const co of p.coproducts || []) {
        const g = groupOf(co.product);
        if (g && !coproductOf.has(g)) coproductOf.set(g, p.id);
      }
    }
    const units = cfg.designs?.units || {};
    const costItems = (pathway, ev) => {
      const b = ev.costBreakdownUsdPerKg;
      const items = [];
      // Feeds made in-house are one item each (the captive unit's full cost per kg of product);
      // equipment, energy and other O&M of the plant itself are what remains.
      let inHouse = 0;
      for (const item of ev.integration || []) {
        const usd = (item.kgPerDay / ev.sizeKgPerDay) * item.makeGrossUsdPerKg;
        inHouse += usd;
        items.push({ kind: 'feed', id: item.feedId, label: `${item.feedId} (made in-house)`, usdPerKg: usd, supplierId: item.supplierId });
      }
      const purchased = [];
      const integrated = new Set((ev.integration || []).map(item => item.feedId));
      const { feedFactor } = designedOpex(pathway, cfg);
      for (const feed of pathway.feeds || []) {
        if (!feed.purchased || integrated.has(feed.id)) continue;
        const usd = (Number(feed.kgPerKg) || 0) * ((Number(feed.usdPerKg) || 0) + (Number(feed.freightUsdPerKg) || 0))
          * feedFactor(feed.id);
        if (usd > 0) purchased.push({ kind: 'feed', id: feed.id, label: feed.label || feed.id, usdPerKg: usd });
      }
      const own = b.equipment + b.energy + b.other;
      const ownScale = own > 0 ? Math.max(0, own - inHouse + (b.feedstock - purchased.reduce((a, i) => a + i.usdPerKg, 0))) / own : 1;
      const equipment = b.equipment * ownScale;
      const nodes = (pathway.flowsheet?.nodes || []).filter(n => n.kind === 'converter' && n.capexUsdPerKgDay > 0);
      const capex = nodes.map(n => n.capexUsdPerKgDay * (Number(units[n.unit]?.capexFactor) > 0 ? units[n.unit].capexFactor : 1));
      const total = capex.reduce((x, y) => x + y, 0);
      if (total > 0) {
        nodes.forEach((n, i) => items.push({ kind: 'unit', id: n.unit, label: n.label || n.unit,
          usdPerKg: equipment * capex[i] / total, designed: Boolean(units[n.unit]) }));
      } else if (equipment > 0) {
        items.push({ kind: 'unit', id: 'equipment', label: 'Process equipment', usdPerKg: equipment, designed: false });
      }
      items.push(...purchased);
      if (b.energy > 0) items.push({ kind: 'energy', id: 'energy', label: 'Electricity (PV + storage + land)', usdPerKg: b.energy * ownScale });
      if (b.other > 0) items.push({ kind: 'other', id: 'other', label: 'Other O&M', usdPerKg: b.other * ownScale });
      return items.sort((x, y) => y.usdPerKg - x.usdPerKg);
    };
    const pathwayById = new Map(pathways.map(p => [p.id, p]));
    const rows = [];
    for (const [key, market] of Object.entries(markets)) {
      if (groupOf(key) !== key || !(market.worldDemandTPerYear > 0)) continue;
      const options = ranked.filter(r => groupOf(r.product) === key && r.priceUsdPerKg > 0);
      const best = options.reduce((a, r) => (!a || r.lcopUsdPerKg / r.priceUsdPerKg < a.lcopUsdPerKg / a.priceUsdPerKg ? r : a), null);
      const row = {
        product: key,
        name: market.name || key,
        worldDemandT: marketDemandT(market, cfg.startYear),
        priceUsdPerKg: Number(market.priceUsdPerKg) || null,
        status: best ? 'blocked' : coproductOf.has(key) ? 'coproduct' : 'no-pathway',
        pathwayId: best?.pathwayId ?? coproductOf.get(key) ?? null,
        pathwayCount: options.length,
      };
      if (best) {
        const b = best.costBreakdownUsdPerKg;
        const items = costItems(pathwayById.get(best.pathwayId), best);
        Object.assign(row, {
          siteId: best.siteId,
          lcopUsdPerKg: best.lcopUsdPerKg,
          costRatio: best.lcopUsdPerKg / best.priceUsdPerKg,
          npv: best.npv,
          energyKWhPerKg: best.energyKWhPerKg,
          effectiveEnergyUsdPerKWh: best.effectiveEnergyUsdPerKWh,
          costBreakdownUsdPerKg: b,
          // Cost per kg with the energy line removed: the floor no electricity price can beat.
          nonEnergyUsdPerKg: best.lcopUsdPerKg - b.energy,
          costItems: items,
          blocker: items[0] || null,
        });
        if (best.npv >= 0) row.status = row.costRatio <= abundantRatio ? 'abundant' : 'feasible';
      }
      rows.push(row);
    }
    rows.sort((a, b) => b.worldDemandT - a.worldDemandT);
    const sumT = pred => rows.filter(pred).reduce((t, r) => t + r.worldDemandT, 0);
    const ok = r => r.status === 'feasible' || r.status === 'abundant';
    const totalT = sumT(() => true);
    const feasibleT = sumT(ok);
    const abundantT = sumT(r => r.status === 'abundant');
    // World tonnage held back by each blocker (blocked markets only): the priority list.
    const blockers = new Map();
    for (const r of rows) {
      if (r.status !== 'blocked' || !r.blocker) continue;
      const u = r.blocker.kind + ':' + r.blocker.id;
      const e = blockers.get(u) || { kind: r.blocker.kind, id: r.blocker.id, label: r.blocker.label, worldDemandT: 0, products: [] };
      e.worldDemandT += r.worldDemandT;
      e.products.push(r.product);
      blockers.set(u, e);
    }
    return {
      rows,
      totals: {
        worldDemandT: totalT,
        feasibleT,
        abundantT,
        blockedT: sumT(r => r.status === 'blocked'),
        uncoveredT: sumT(r => r.status === 'no-pathway' || r.status === 'coproduct'),
        feasibleShare: totalT > 0 ? feasibleT / totalT : 0,
        abundantShare: totalT > 0 ? abundantT / totalT : 0,
        markets: rows.length,
        feasibleMarkets: rows.filter(ok).length,
      },
      blockers: [...blockers.values()].sort((a, b) => b.worldDemandT - a.worldDemandT),
    };
  }

  return {
    DEFAULTS,
    TECH_CLASSES,
    solarLcoe,
    pvCapexFromLcoe,
    squashUsd,
    liveFloors,
    squashFactor,
    energyBreakevens,
    abundanceScoreboard,
    INFINITE_ORIGINS,
    annuityFactor,
    techCostFactor,
    pvCapexUsdPerKWp,
    scaleFactor,
    marketDemandT,
    realizedPrice,
    buildSites,
    siteAllowsPathway,
    marketGroupOf: (product, config) => marketGroupOf(mergeConfig(config), product),
    evaluatePlant,
    evaluateAtYear,
    simulateCompany,
    rankOpportunities,
    mergeConfig,
  };
});
