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
      maxPlantsPerYear: 12,
      maxMarketShare: 0.1, // company share of world demand per product
      minProfitabilityIndex: 0, // NPV / capex hurdle
      sizeMultiples: Object.freeze([1, 10, 100, 1000]), // × pathway reference output
      maxPlantKgPerDay: 5e6,
      allowPathways: null, // null = all; else array of pathway ids
      allowSites: null, // null = all; else array of site ids
      maxPvGWpPerSite: 10, // land / interconnection / permitting ceiling per site
      // Only build plants whose every feed comes from ocean/brine/air/rock/water or a captive
      // supplier: forces make-not-buy and skips plants that would still buy an intermediate.
      infiniteSourcesOnly: false,
    }),
    scale: Object.freeze({
      exponent: 0.85, // process capex ∝ size^exponent (PV stays linear/modular)
      floorFactor: 0.4, // per-unit capex never falls below this × reference
    }),
    pv: Object.freeze({
      capexUsdPerKWp: 1000, // NREL ATB-order screening, matches TeaScreening 'solar-pv'
      fixedOmUsdPerKWpYear: 20,
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
    // Solar-only utilization and storage design (engine/utilization.js): flexible units are sized
    // for the hours the sun shines, baseload units are firmed with batteries / thermal stores,
    // intermediates between them are buffered. Recipes without a flowsheet keep 24 h costing.
    utilization: Utilization.DEFAULTS,
    // Products that draw on the same world market (see data/markets.js notes):
    // shares and headroom are computed on the group key's demand.
    // Make-vs-buy for purchased intermediates (see planIntegration). feedProducts maps a
    // recipe's purchased feed id to the product key a captive supplier pathway makes.
    // CO₂ is not mapped: no CO₂ supplier recipe (DAC) undercuts $0.05–0.13/kg purchased CO₂.
    integration: Object.freeze({
      enabled: true,
      mode: 'cheaper', // 'cheaper': make only when it beats buying; 'always': make whenever a supplier fits
      feedProducts: Object.freeze({
        'hydrogen-feed': 'hydrogen',
        'ammonia-feed': 'ammonia',
        'methanol-feed': 'methanol',
        'float-glass': 'float-glass',
      }),
    }),
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

  function capexByTech(pathway) {
    const out = {};
    for (const cls of TECH_CLASSES) out[cls] = Number(pathway.capexByTechUsdPerKgDay?.[cls]) || 0;
    return out;
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
          buyUsdPerKg,
          unit: best.unit,
        });
      }
    }
    return plan;
  }

  // ctx: { cfg, yearIndex, year, costFactors, pvUsdPerKWp, priceFor(productKey, fallback, extraKg),
  //        suppliers?: Map(product → pathways), sitesById?: Map }  (suppliers enable integration)
  function evaluatePlant(pathway, site, sizeKgPerDay, ctx) {
    const { cfg } = ctx;
    const sf = scaleFactor(cfg.scale, sizeKgPerDay, pathway.refOutputKgPerDay);
    const perKgDay = capexByTech(pathway);
    const siteMult = Number(site.capexMultiplier) || 1;
    const integration = planIntegration(pathway, site, sizeKgPerDay, ctx);
    const integrated = new Set(integration.map(item => item.feedId));

    const processByTech = {};
    const refCapexByTech = {};
    let processCapex = 0;
    for (const cls of TECH_CLASSES) {
      const value = perKgDay[cls] * sizeKgPerDay * sf * (ctx.costFactors[cls] ?? 1) * siteMult;
      processByTech[cls] = value;
      refCapexByTech[cls] = perKgDay[cls] * sizeKgPerDay;
      processCapex += value;
    }
    const kWhPerKg = (Number(pathway.electricityKWhPerKg) || 0) + (Number(pathway.heatKWhPerKg) || 0);
    // Solar-only utilization: resize equipment for sun hours, add storage, derate output.
    const util = Utilization.mergeCfg(cfg.utilization || Utilization.DEFAULTS);
    const profile = util.enabled ? Utilization.operatingProfile(pathway, util) : null;
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
          batteryUsdPerKWh: util.battery.usdPerKWh * storageFactor * siteMult,
          thermalUsdPerKWh: util.thermal.usdPerKWh * storageFactor * siteMult,
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
    const purchasedIntermediates = [];
    for (const feed of pathway.feeds || []) {
      const kg = (Number(feed.kgPerKg) || 0) * annualKg;
      if (integrated.has(feed.id)) continue;
      feedsKgPerYear.push({ id: feed.id, origin: feed.origin || 'unknown', kg });
      if (!feed.purchased) continue;
      if (feed.origin === 'intermediate') purchasedIntermediates.push(feed.id);
      feedUsdPerKg += (Number(feed.kgPerKg) || 0) * ((Number(feed.usdPerKg) || 0) + (Number(feed.freightUsdPerKg) || 0));
    }
    // Recipe fixed O&M applies to process equipment; stores carry their own O&M (below).
    const storageUsd = design ? design.storageUsd : 0;
    let fixedOm = (processCapex - storageUsd) * (Number(pathway.fixedOmFracPerYear) || 0)
      + pvKWp * cfg.pv.fixedOmUsdPerKWpYear
      + (design ? design.storageFixedOmUsdPerYear : 0);
    let variableOm = annualKg * ((Number(pathway.variableOmUsdPerKg) || 0) + feedUsdPerKg);

    const price = ctx.priceFor(pathway.product, null, annualKg);
    const sales = [{ product: pathway.product, kgPerYear: annualKg, fallbackUsdPerKg: null }];
    let coproductRevenue = 0;
    for (const co of pathway.coproducts || []) {
      const coKg = (Number(co.kgPerKg) || 0) * annualKg;
      coproductRevenue += coKg * ctx.priceFor(co.product, co.usdPerKg, coKg);
      sales.push({ product: co.product || null, id: co.id, kgPerYear: coKg, fallbackUsdPerKg: co.usdPerKg });
    }

    // Fold captive supplier units into this plant.
    // Stores are excluded from the life weighting: they are replaced on their own schedule (reserve below).
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
      fixedOm += u.opex.fixed;
      variableOm += u.opex.variable;
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
        const prices = util.bufferUsdPerKg;
        const kg = item.kgPerDay * outputFactor * (24 - flh) / 24;
        const usd = kg * (prices[substance] ?? prices.default) * (ctx.costFactors.storage ?? 1) * siteMult;
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
    fixedOm += storageReplacementUsdPerYear;
    const opex = fixedOm + variableOm;
    const revenue = annualKg * price + coproductRevenue;
    const annualCash = revenue - opex;
    const r = cfg.finance.discountRate;
    const af = annuityFactor(r, life);
    const lead = cfg.build.leadTimeYears || 0;
    const npv = -capexTotal + (annualCash * af) / (1 + r) ** lead;
    const crf = af > 0 ? 1 / af : 0;
    // Gross: full plant cost per kg of primary product. Net (LCOP): after crediting coproduct
    // revenue — can go negative for multi-product plants (e.g. brine hubs) whose coproducts pay for everything.
    const grossCost = annualKg > 0 ? (capexTotal * crf + opex) / annualKg : Infinity;
    const coproductCredit = annualKg > 0 ? coproductRevenue / annualKg : 0;
    const lcop = grossCost - coproductCredit;
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
      coproductCreditUsdPerKg: coproductCredit,
      marginUsdPerKg: price - lcop,
      sales,
      materialKgPerYear: sales.reduce((sum, sale) => sum + sale.kgPerYear, 0),
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

  function normalizeInputs(input) {
    const cfg = merge(DEFAULTS, input.config || {});
    const markets = input.markets || {};
    const sites = (input.sites || []).filter(site => site.pvKWhPerKWpDay > 0
      && (!cfg.build.allowSites || cfg.build.allowSites.includes(site.id)));
    const pathways = (input.pathways || []).filter(p => p.refOutputKgPerDay > 0
      && (!cfg.build.allowPathways || cfg.build.allowPathways.includes(p.id)));
    return { cfg, markets, sites, pathways };
  }

  function createState(cfg) {
    return {
      cash: cfg.finance.initialEquityUsd,
      equityInUsd: cfg.finance.initialEquityUsd,
      loans: [], // { principal, payment, yearsLeft }
      plants: [], // { id, pathwayId, siteId, product, sizeKgPerDay, onlineYear, builtYear, eval, bookUsd, lifeYears }
      cumRefUsd: Object.fromEntries(TECH_CLASSES.map(cls => [cls, 0])),
      nextId: 1,
    };
  }

  function yearContext(cfg, markets, state, yearIndex, year, committedKg, extras = {}) {
    const costFactors = {};
    for (const cls of TECH_CLASSES) costFactors[cls] = techCostFactor(cfg.tech[cls] || {}, yearIndex, state.cumRefUsd[cls]);
    const pvUsdPerKWp = pvCapexUsdPerKWp(cfg.pv, yearIndex);
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
    return { cfg, yearIndex, year, costFactors, pvUsdPerKWp, priceFor, shareOf, capKg, designCache: new Map(), ...extras };
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

  function addKg(map, key, kg) {
    if (!key) return;
    map[key] = (map[key] || 0) + kg;
  }

  // Committed annual kg per sold product of every plant not yet retired (operating or under
  // construction): drives share caps and prices for new builds.
  function committedOutput(state, year) {
    const out = {};
    for (const plant of state.plants) {
      if (year >= plant.onlineYear + plant.lifeYears) continue;
      for (const sale of plant.eval.sales) addKg(out, sale.product, sale.kgPerYear);
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

  // cache: evaluations valid for this year until a build changes a market they sell into.
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

  const lifetimeKgPerUsd = ev => (ev.capex.total > 0 ? (ev.materialKgPerYear * ev.lifeYears) / ev.capex.total : 0);

  function pickBuild(cfg, ctx, candidates, committedKg, budgetUsd, markets, sitePvKWp, cache) {
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
      for (const site of pathwaySites) {
        const pvRoomKWp = sitePvCapKWp - (sitePvKWp[site.id] || 0);
        if (!(pvRoomKWp > 0)) continue;
        for (const size of sizes) {
          if (size * 365 > headroomKg) break;
          const key = site.id + '|' + size;
          let ev = pathwayCache.get(key);
          if (!ev) {
            ev = evaluatePlant(pathway, site, size, ctx);
            pathwayCache.set(key, ev);
          }
          if (ev.pvKWp > pvRoomKWp) break;
          if (cfg.build.infiniteSourcesOnly && ev.purchasedIntermediates.length) break;
          if (!(ev.npv >= 0) || ev.profitabilityIndex < cfg.build.minProfitabilityIndex) continue;
          if (ev.capex.total * (1 - cfg.finance.debtFraction) > budgetUsd) continue;
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
      score = ev => ev.materialKgPerYear * ev.lifeYears + lambda * ev.npv;
    }
    const ranked = feasible.map(ev => ({ ev, s: score(ev) })).sort((a, b) => b.s - a.s);
    for (const { ev } of ranked) if (salesFit(cfg, ctx, ev, committedKg)) return ev;
    return null;
  }

  function simulateCompany(input = {}) {
    const { cfg, markets, sites, pathways } = normalizeInputs(input);
    const pathwaysById = new Map(pathways.map(p => [p.id, p]));
    const sitesById = new Map((input.sites || []).map(s => [s.id, s]));
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
        for (const sale of plant.eval.sales) addKg(operatingKg, sale.product, sale.kgPerYear);
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
          addKg(revenueByProduct, sale.product || sale.id, sale.kgPerYear * price);
          if (sale.product) priceByProduct[sale.product] = price;
        }
        for (const item of plant.eval.integration) addKg(captiveTByProduct, item.product, item.kgPerDay * 365 / 1000);
        // Opex is fixed at build (fixed O&M on built capex; feed prices static).
        revenue += plantRevenue;
        opex += plant.eval.opex.total;
        pvKWp += plant.eval.pvKWp;
        landHa += plant.eval.landHa;
        electricityKWh += plant.eval.electricityKWhPerYear;
        for (const feed of plant.eval.feedsKgPerYear) addKg(feedTByOrigin, feed.origin, feed.kg / 1000);
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
      for (let n = 0; n < cfg.build.maxPlantsPerYear; n += 1) {
        const choice = pickBuild(cfg, ctx, candidates, committedKg, budget, markets, sitePvKWp, cache);
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
          cache.delete(other.pathway.id);
        }
        sitePvKWp[plant.siteId] = (sitePvKWp[plant.siteId] || 0) + choice.pvKWp;
        for (const sale of choice.sales) addKg(committedKg, sale.product, sale.kgPerYear);
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
      for (const [product, price] of Object.entries(priceByProduct)) {
        const p0 = Number(markets[product]?.priceUsdPerKg);
        if (p0 > 0) priceReliefByMarket[marketGroupOf(cfg, product)] = Math.max(0, 1 - price / p0);
      }
      const materialTPerYear = Object.values(outputTByProduct).reduce((sum, t) => sum + t, 0);
      cumulativeMaterialT += materialTPerYear;
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
        costFactors: { ...opCtx.costFactors },
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

  // Static snapshot: best site per pathway at a given size multiple, year 0 costs, no market share.
  function rankOpportunities(input = {}, opts = {}) {
    const { cfg, markets, sites, pathways } = normalizeInputs(input);
    const sitesById = new Map((input.sites || []).map(s => [s.id, s]));
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
      let best = null;
      for (const site of sites) {
        if (!siteAllowsPathway(site, pathway, sitesById)) continue;
        const ev = evaluatePlant(pathway, site, size, ctx);
        if (cfg.build.infiniteSourcesOnly && ev.purchasedIntermediates.length) continue;
        if (!best || ev.lcopUsdPerKg < best.lcopUsdPerKg) best = ev;
      }
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
  // pass opts.costFactors / opts.pvUsdPerKWp (e.g. from a simulateCompany timeline row) to
  // price that year as the simulation did. Integration (make vs buy) follows cfg.integration.
  // Returns evaluatePlant()'s result, or null when the pathway/site is unknown or incompatible.
  function evaluateAtYear(input, pathwayId, siteId, sizeKgPerDay, yearIndex = 0, opts = {}) {
    const cfg = merge(DEFAULTS, input.config || {});
    const allSites = input.sites || [];
    const allPathways = input.pathways || [];
    const pathway = allPathways.find(p => p.id === pathwayId);
    const site = allSites.find(s => s.id === siteId);
    const sitesById = new Map(allSites.map(s => [s.id, s]));
    if (!pathway || !site || !siteAllowsPathway(site, pathway, sitesById)) return null;
    const state = createState(cfg);
    const ctx = yearContext(cfg, input.markets || {}, state, yearIndex, cfg.startYear + yearIndex, {}, {
      suppliers: captiveSuppliers(cfg, allPathways.filter(p => p.refOutputKgPerDay > 0
        && (!cfg.build.allowPathways || cfg.build.allowPathways.includes(p.id)))),
      sitesById,
    });
    if (opts.costFactors) ctx.costFactors = { ...ctx.costFactors, ...opts.costFactors };
    if (Number.isFinite(opts.pvUsdPerKWp)) ctx.pvUsdPerKWp = opts.pvUsdPerKWp;
    return evaluatePlant(pathway, site, sizeKgPerDay, ctx);
  }

  return {
    DEFAULTS,
    TECH_CLASSES,
    INFINITE_ORIGINS,
    annuityFactor,
    techCostFactor,
    pvCapexUsdPerKWp,
    scaleFactor,
    marketDemandT,
    realizedPrice,
    buildSites,
    siteAllowsPathway,
    marketGroupOf: (product, config) => marketGroupOf(merge(DEFAULTS, config || {}), product),
    evaluatePlant,
    evaluateAtYear,
    simulateCompany,
    rankOpportunities,
    mergeConfig: override => merge(DEFAULTS, override || {}),
  };
});
