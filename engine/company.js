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
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoundryCompany = api;
})(globalThis, () => {
  const TECH_CLASSES = Object.freeze(['process', 'electrolyzer', 'dac', 'desal', 'storage']);
  const INFINITE_ORIGINS = Object.freeze(['ocean', 'brine', 'air', 'crust', 'water']);

  const DEFAULTS = Object.freeze({
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
    // Products that draw on the same world market (see data/markets.js notes):
    // shares and headroom are computed on the group key's demand.
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

  function referenceCapexByTechUsd(pathway, sizeKgPerDay) {
    const perKgDay = capexByTech(pathway);
    const out = {};
    for (const cls of TECH_CLASSES) out[cls] = perKgDay[cls] * sizeKgPerDay;
    return out;
  }

  // ctx: { cfg, yearIndex, year, costFactors, pvUsdPerKWp, priceFor(productKey, fallback, extraKg) }
  function evaluatePlant(pathway, site, sizeKgPerDay, ctx) {
    const { cfg } = ctx;
    const annualKg = sizeKgPerDay * 365;
    const sf = scaleFactor(cfg.scale, sizeKgPerDay, pathway.refOutputKgPerDay);
    const perKgDay = capexByTech(pathway);
    const siteMult = Number(site.capexMultiplier) || 1;
    const processByTech = {};
    let processCapex = 0;
    for (const cls of TECH_CLASSES) {
      const value = perKgDay[cls] * sizeKgPerDay * sf * ctx.costFactors[cls] * siteMult;
      processByTech[cls] = value;
      processCapex += value;
    }
    const kWhPerKg = (Number(pathway.electricityKWhPerKg) || 0) + (Number(pathway.heatKWhPerKg) || 0);
    const pvKWp = site.pvKWhPerKWpDay > 0 ? (kWhPerKg * sizeKgPerDay) / site.pvKWhPerKWpDay : 0;
    const pvCapex = pvKWp * ctx.pvUsdPerKWp * siteMult;
    const landHa = pvKWp * cfg.pv.landHaPerKWp;
    const landUsdPerHa = site.landUsdPerHa > 0 ? site.landUsdPerHa : cfg.defaultLandUsdPerHa;
    const landCapex = landHa * landUsdPerHa;
    const capexTotal = processCapex + pvCapex + landCapex;

    let feedUsdPerKg = 0;
    for (const feed of pathway.feeds || []) {
      if (!feed.purchased) continue;
      feedUsdPerKg += (Number(feed.kgPerKg) || 0) * ((Number(feed.usdPerKg) || 0) + (Number(feed.freightUsdPerKg) || 0));
    }
    const fixedOm = processCapex * (Number(pathway.fixedOmFracPerYear) || 0) + pvKWp * cfg.pv.fixedOmUsdPerKWpYear;
    const variableOm = annualKg * ((Number(pathway.variableOmUsdPerKg) || 0) + feedUsdPerKg);
    const opex = fixedOm + variableOm;

    const price = ctx.priceFor(pathway.product, null, annualKg);
    let coproductRevenue = 0;
    for (const co of pathway.coproducts || []) {
      const coKg = (Number(co.kgPerKg) || 0) * annualKg;
      coproductRevenue += coKg * ctx.priceFor(co.product, co.usdPerKg, coKg);
    }
    const revenue = annualKg * price + coproductRevenue;
    const annualCash = revenue - opex;
    const life = Math.max(1, Math.min(Number(pathway.assetLifeYears) || cfg.pv.lifeYears, cfg.pv.lifeYears));
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
      pvKWp,
      landHa,
      electricityKWhPerYear: kWhPerKg * annualKg,
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

  function yearContext(cfg, markets, state, yearIndex, year, committedKg) {
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
    return { cfg, yearIndex, year, costFactors, pvUsdPerKWp, priceFor, shareOf };
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

  // Committed annual kg per product (operating + under construction), for share caps and prices.
  function committedOutput(state, pathwaysById) {
    const out = {};
    for (const plant of state.plants) {
      const annualKg = plant.sizeKgPerDay * 365;
      addKg(out, plant.product, annualKg);
      for (const co of pathwaysById.get(plant.pathwayId)?.coproducts || []) {
        addKg(out, co.product, (Number(co.kgPerKg) || 0) * annualKg);
      }
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

  function productGroups(cfg, pathway) {
    const groups = new Set([marketGroupOf(cfg, pathway.product)]);
    for (const co of pathway.coproducts || []) if (co.product) groups.add(marketGroupOf(cfg, co.product));
    return groups;
  }

  // Every product a plant sells (not just its primary) must stay under the share ceiling.
  function coproductsFit(cfg, ctx, markets, pathway, annualKg, committedKg) {
    for (const co of pathway.coproducts || []) {
      if (!co.product) continue;
      const group = marketGroupOf(cfg, co.product);
      const demandT = marketDemandT(markets[group], ctx.year);
      if (!Number.isFinite(demandT)) continue;
      const kg = groupKg(cfg, committedKg, group) + (Number(co.kgPerKg) || 0) * annualKg;
      if (kg > cfg.build.maxMarketShare * demandT * 1000) return false;
    }
    return true;
  }

  // cache: evaluations valid for this year until a build changes a market they sell into.
  // Per-run candidate structure: compatible sites and size ladder per pathway.
  function buildCandidates(cfg, pathways, sites, sitesById) {
    return pathways.map(pathway => ({
      pathway,
      group: marketGroupOf(cfg, pathway.product),
      sites: sites.filter(site => siteAllowsPathway(site, pathway, sitesById)),
      sizes: candidateSizes(cfg, pathway),
    })).filter(item => item.sites.length && item.sizes.length);
  }

  function pickBuild(cfg, ctx, candidates, committedKg, budgetUsd, markets, sitePvKWp, cache) {
    let best = null;
    const sitePvCapKWp = (Number(cfg.build.maxPvGWpPerSite) || Infinity) * 1e6;
    for (const { pathway, group, sites: pathwaySites, sizes } of candidates) {
      let pathwayCache = cache.get(pathway.id);
      if (!pathwayCache) {
        pathwayCache = new Map();
        cache.set(pathway.id, pathwayCache);
      }
      const demandT = marketDemandT(markets[group], ctx.year);
      const headroomKg = Number.isFinite(demandT)
        ? cfg.build.maxMarketShare * demandT * 1000 - groupKg(cfg, committedKg, group)
        : Infinity;
      if (!(headroomKg > 0)) continue;
      for (const site of pathwaySites) {
        const pvRoomKWp = sitePvCapKWp - (sitePvKWp[site.id] || 0);
        if (!(pvRoomKWp > 0)) continue;
        for (const size of sizes) {
          if (size * 365 > headroomKg) break;
          if (!coproductsFit(cfg, ctx, markets, pathway, size * 365, committedKg)) break;
          const key = site.id + '|' + size;
          let ev = pathwayCache.get(key);
          if (!ev) {
            ev = evaluatePlant(pathway, site, size, ctx);
            pathwayCache.set(key, ev);
          }
          if (ev.pvKWp > pvRoomKWp) break;
          if (!(ev.npv > 0) || ev.profitabilityIndex < cfg.build.minProfitabilityIndex) continue;
          const equity = ev.capex.total * (1 - cfg.finance.debtFraction);
          if (equity > budgetUsd) continue;
          // Rank by absolute NPV among affordable options: bigger good plants first.
          if (!best || ev.npv > best.npv) best = ev;
        }
      }
    }
    return best;
  }

  function simulateCompany(input = {}) {
    const { cfg, markets, sites, pathways } = normalizeInputs(input);
    const pathwaysById = new Map(pathways.map(p => [p.id, p]));
    const sitesById = new Map((input.sites || []).map(s => [s.id, s]));
    const state = createState(cfg);
    const timeline = [];
    let minCash = state.cash;
    const candidates = buildCandidates(cfg, pathways, sites, sitesById);

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
        addKg(operatingKg, plant.product, plant.sizeKgPerDay * 365);
        for (const co of pathwaysById.get(plant.pathwayId)?.coproducts || []) {
          addKg(operatingKg, co.product, (Number(co.kgPerKg) || 0) * plant.sizeKgPerDay * 365);
        }
      }
      const opCtx = yearContext(cfg, markets, state, yearIndex, year, operatingKg);
      let revenue = 0;
      let opex = 0;
      const revenueByProduct = {};
      const priceByProduct = {};
      const feedTByOrigin = {};
      let pvKWp = 0;
      let landHa = 0;
      let electricityKWh = 0;
      for (const plant of operating) {
        const pathway = pathwaysById.get(plant.pathwayId);
        const annualKg = plant.sizeKgPerDay * 365;
        const price = opCtx.priceFor(plant.product, null, 0);
        priceByProduct[plant.product] = price;
        let plantRevenue = annualKg * price;
        addKg(revenueByProduct, plant.product, annualKg * price);
        for (const co of pathway.coproducts || []) {
          const coKg = (Number(co.kgPerKg) || 0) * annualKg;
          const coPrice = opCtx.priceFor(co.product, co.usdPerKg, 0);
          plantRevenue += coKg * coPrice;
          addKg(revenueByProduct, co.product || co.id, coKg * coPrice);
          if (co.product) priceByProduct[co.product] = coPrice;
        }
        // Opex is fixed at build (fixed O&M on built capex; feed prices static).
        revenue += plantRevenue;
        opex += plant.eval.opex.total;
        pvKWp += plant.eval.pvKWp;
        landHa += plant.eval.landHa;
        electricityKWh += plant.eval.electricityKWhPerYear;
        for (const feed of pathway.feeds || []) {
          addKg(feedTByOrigin, feed.origin || 'unknown', (Number(feed.kgPerKg) || 0) * annualKg / 1000);
        }
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
      const committedKg = committedOutput(state, pathwaysById);
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
      const ctx = yearContext(cfg, markets, state, yearIndex, year, committedKg);
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
        const refByTech = referenceCapexByTechUsd(pathway, choice.sizeKgPerDay);
        for (const cls of TECH_CLASSES) state.cumRefUsd[cls] += refByTech[cls];
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
        const touched = productGroups(cfg, pathway);
        for (const other of pathways) {
          if (![...productGroups(cfg, other)].some(group => touched.has(group))) continue;
          cache.delete(other.id);
        }
        sitePvKWp[plant.siteId] = (sitePvKWp[plant.siteId] || 0) + choice.pvKWp;
        addKg(committedKg, pathway.product, choice.annualKg);
        for (const co of pathway.coproducts || []) addKg(committedKg, co.product, (Number(co.kgPerKg) || 0) * choice.annualKg);
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
      timeline.push({
        year,
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
      })),
      summary: {
        years: cfg.years,
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
    const ctx = yearContext(cfg, markets, state, yearIndex, cfg.startYear + yearIndex, {});
    const multiple = Number(opts.sizeMultiple) || 1;
    const rows = [];
    for (const pathway of pathways) {
      const size = Math.min(cfg.build.maxPlantKgPerDay, pathway.refOutputKgPerDay * multiple);
      let best = null;
      for (const site of sites) {
        if (!siteAllowsPathway(site, pathway, sitesById)) continue;
        const ev = evaluatePlant(pathway, site, size, ctx);
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
    simulateCompany,
    rankOpportunities,
    mergeConfig: override => merge(DEFAULTS, override || {}),
  };
});
