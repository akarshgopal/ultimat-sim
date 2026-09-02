/* Electrolyzer, DAC, products */

Object.assign(Calc, {
  getDesalRecoveryFraction(state = {}) {
    const raw = Number(state.desalRecovery);
    return raw > 1
      ? this.clampNumber(raw, 20, 80, 45) / 100
      : this.clampNumber(raw, 0.2, 0.8, 0.45);
  },

  calculateWaterSystems(state, context = {}) {
    const {
      desalModule,
      miningModule,
      dailyKWh = 0,
      reservedDailyKWh = dailyKWh,
      targetDailyM3 = null,
      waterDemandDailyM3 = 0,
      electrolyzerHeatKWh = 0,
      aiHeatKWh = 0,
      sabatierHeatKWh = 0,
      miningDailyKWh = 0,
      cyclesPerYear = 365,
    } = context;
    const demand = Math.max(0, Number(waterDemandDailyM3) || 0);
    const makeupEnabled = state.makeupWaterEnabled !== false;
    const heatBands = {
      Heat_HT: Math.max(0, Number(sabatierHeatKWh) || 0),
      Heat_MT: 0,
      Heat_LT: Math.max(0, (Number(electrolyzerHeatKWh) || 0) + (Number(aiHeatKWh) || 0) + ((Number(sabatierHeatKWh) || 0) * 0.9)),
    };
    const heatAvailable = heatBands.Heat_LT;
    const zero = {
      enabled: false,
      route: null,
      dailyM3: 0,
      annualM3: 0,
      brineDailyM3: 0,
      brineAnnualM3: 0,
      freshWaterDailyM3: 0,
      waterDemandDailyM3: demand,
      makeupDailyM3: makeupEnabled ? demand : 0,
      waterCreditDailyM3: 0,
      waterSaleDailyM3: 0,
      h2CurtailedDailyKg: makeupEnabled ? 0 : demand * 1000 / CHEMISTRY.electrolysis.waterPerKgH2,
      feedDailyM3: 0,
      ionVector: {},
      feedIonVector: {},
      heat: {
        ...heatBands,
        suppliedKWhth: heatAvailable,
        usedKWhth: 0,
        dumpedKWhth: heatAvailable,
        unmetKWhth: 0,
        cascadeEfficiency: 0.9,
        limitingFactor: 'not applicable',
      },
      Heat_HT: heatBands.Heat_HT,
      Heat_MT: heatBands.Heat_MT,
      Heat_LT: heatBands.Heat_LT,
      saltProducts: {},
      mining: null,
    };
    if (!desalModule?.enabled || !desalModule.routeConfig) return zero;

    const route = desalModule.routeConfig;
    const recovery = this.getDesalRecoveryFraction(state);
    const cycleDamage = this.clampNumber(state.desalCyclingFactor, 1, 2, 1);
    const elevation = Math.max(0, Number(state.desalElevationM) || 0);
    // Elevation pumping is charged on the feed volume, because every m³ of
    // permeate requires feedDailyM3 = permeate / recovery to be lifted.
    const pumpKwh = 3.1 * elevation / 1000;
    const electricProductSEC = Math.max(0, Number(route.electricityKwhPerUnit) || 0) * cycleDamage;
    const electricCostPerM3 = electricProductSEC + pumpKwh / recovery;
    const heatSEC = Math.max(0, Number(route.thermalKwhPerUnit) || 0);
    const electricLimited = electricCostPerM3 > 0
      ? Math.max(0, Number(reservedDailyKWh) || 0) / electricCostPerM3
      : Infinity;
    const heatLimited = heatSEC > 0 ? heatAvailable / heatSEC : Infinity;
    const requested = Number.isFinite(targetDailyM3)
      ? Math.max(0, Number(targetDailyM3) || 0)
      : Infinity;
    const dailyM3 = Math.max(0, Math.min(requested, electricLimited, heatLimited));
    const feedDailyM3 = dailyM3 / recovery;
    const brineDailyM3 = Math.max(0, feedDailyM3 - dailyM3);
    const feed = WATER_FEED_PRESETS[state.waterFeedPreset] || WATER_FEED_PRESETS.seawater;
    const concentrationFactor = 1 / (1 - recovery);
    const ionVector = Object.fromEntries(
      Object.entries(feed).map(([key, value]) => [key, value * concentrationFactor])
    );
    const heatUsedKWhth = Math.min(heatAvailable, dailyM3 * heatSEC);
    const targetHeatKWhth = Number.isFinite(requested) ? requested * heatSEC : dailyM3 * heatSEC;
    const powerIsLimiting = electricLimited <= heatLimited && electricLimited <= requested;
    const heatIsLimiting = heatSEC > 0 && heatLimited < electricLimited && heatLimited < requested;
    const limitingFactor = heatIsLimiting ? 'heat-limited' : powerIsLimiting ? 'power-limited' : 'target-limited';
    const mining = miningModule?.enabled && miningModule.routeConfig
      ? this.calculateBrineMining(
          state,
          miningModule.route,
          brineDailyM3,
          ionVector,
          miningDailyKWh,
          cyclesPerYear,
          feed
        )
      : null;
    const saltProducts = mining?.products || {};
    const waterCreditDailyM3 = Math.min(dailyM3, demand);
    const waterSaleDailyM3 = Math.max(0, dailyM3 - waterCreditDailyM3);
    const makeupDailyM3 = makeupEnabled ? Math.max(0, demand - waterCreditDailyM3) : 0;
    return {
      enabled: true,
      route: desalModule.route,
      dailyM3,
      annualM3: dailyM3 * cyclesPerYear,
      freshWaterDailyM3: dailyM3,
      waterDemandDailyM3: demand,
      makeupDailyM3,
      waterCreditDailyM3,
      waterSaleDailyM3,
      h2CurtailedDailyKg: makeupEnabled
        ? 0
        : Math.max(0, demand - waterCreditDailyM3) * 1000 / CHEMISTRY.electrolysis.waterPerKgH2,
      feedDailyM3,
      brineDailyM3,
      brineAnnualM3: brineDailyM3 * cyclesPerYear,
      ionVector,
      feedIonVector: feed,
      electricDailyKWh: dailyM3 * electricProductSEC + feedDailyM3 * pumpKwh,
      heat: {
        ...heatBands,
        suppliedKWhth: heatAvailable,
        usedKWhth: heatUsedKWhth,
        dumpedKWhth: Math.max(0, heatAvailable - heatUsedKWhth),
        unmetKWhth: Math.max(0, targetHeatKWhth - heatAvailable),
        cascadeEfficiency: 0.9,
        limitingFactor,
      },
      Heat_HT: heatBands.Heat_HT,
      Heat_MT: heatBands.Heat_MT,
      Heat_LT: heatBands.Heat_LT,
      saltProducts,
      mining,
    };
  },

  calculateBrineMining(state, routeId, brineDailyM3, ionVector, dailyKWh = 0, cyclesPerYear = 365, feedIonVector = null) {
    const route = this.getModuleRouteConfig('brineMining', routeId);
    const empty = {
      enabled: true,
      route: routeId,
      brineConsumedDailyM3: 0,
      brineConsumedAnnualM3: 0,
      products: {},
      grossRevenue: 0,
      marketCappedRevenue: 0,
      netRevenue: 0,
      reinjectionRequired: Boolean(route?.reinjectionRequired),
      netRevenueBasis: 'market-capped; reagent and disposal OPEX not modeled',
    };
    if (!route || brineDailyM3 <= 0) return empty;
    const powerLimitedM3 = route.electricityKwhPerUnit > 0 ? dailyKWh / route.electricityKwhPerUnit : brineDailyM3;
    const consumed = Math.max(0, Math.min(brineDailyM3, powerLimitedM3));
    const brine = ionVector || {};
    const feed = feedIonVector
      || WATER_FEED_PRESETS[state.waterFeedPreset]
      || brine;
    const recovery = {
      NaCl: 0.70,
      gypsum: 0.85,
      'Mg(OH)2': 0.90,
      Br2: 0.80,
      Li2CO3: 0.85,
    };
    const kgPerM3 = {
      // g/L is kg/m³.  NaCl is limited by the smaller Na/Cl mole balance.
      NaCl: Math.min(
        (Number(brine.Na) || 0) / 22.989769,
        (Number(brine.Cl) || 0) / 35.453
      ) * 58.44277 * recovery.NaCl,
      gypsum: ((Number(brine.Ca) || 0) / 40.078) * 172.171 * recovery.gypsum,
      'Mg(OH)2': ((Number(brine.Mg) || 0) / 24.305) * 58.3197 * recovery['Mg(OH)2'],
      // The v1 check is expressed as recoverable elemental Br per m³ reject.
      Br2: (Number(brine.Br) || 0) * recovery.Br2,
    };
    const isLithiumAnalog = routeId === 'salton-geothermal-li' || route.lithiumAnalog;
    const kg = isLithiumAnalog
      ? {
          // Li₂CO₃ equivalent uses the Li-to-Li₂CO₃ molecular mass ratio and
          // the feed concentration gate, not the concentrated reject value.
          Li2CO3: (Number(feed.Li) || 0) >= 0.05
            ? (Number(feed.Li) || 0) * (73.891 / (2 * 6.941)) * recovery.Li2CO3 * consumed
            : 0,
        }
      : Object.fromEntries(Object.entries(kgPerM3).map(([product, value]) => [product, consumed * value]));
    const prices = { NaCl: 40, gypsum: 20, 'Mg(OH)2': 500, Br2: 4000, Li2CO3: 8750 };
    // Caps are annual market absorption, not a physical yield or LME value.
    // They are loose at 1 MW but begin to matter in the 10–50 MW range for
    // this exploratory block's deliberately conservative throughput.
    const caps = { NaCl: 50, gypsum: 5, 'Mg(OH)2': 8, Br2: 0.1, Li2CO3: 1 };
    const grossRevenue = Object.entries(kg).reduce((sum, [product, value]) => sum + (value / 1000) * (prices[product] || 0) * cyclesPerYear, 0);
    const marketCappedRevenue = Object.entries(kg).reduce((sum, [product, value]) => sum + Math.min(value * cyclesPerYear / 1000, caps[product] || Infinity) * (prices[product] || 0), 0);
    return { enabled: true, route: routeId, brineConsumedDailyM3: consumed, brineConsumedAnnualM3: consumed * cyclesPerYear,
      feedLiGPerL: Number(feed.Li) || 0,
      reinjectionRequired: Boolean(route.reinjectionRequired || state.brineReinjectionEnabled || state.reinject),
      netRevenueBasis: 'market-capped; reagent and disposal OPEX not modeled',
      products: Object.fromEntries(Object.entries(kg).map(([product, value]) => [product, { dailyTons: value / 1000, annualTons: value * cyclesPerYear / 1000, price: prices[product], grossRevenue: value * cyclesPerYear / 1000 * prices[product], marketCappedRevenue: Math.min(value * cyclesPerYear / 1000, caps[product]) * prices[product] }])),
      grossRevenue, marketCappedRevenue, netRevenue: marketCappedRevenue };
  },

  getProductMix(state) {
    const methaneEnabled = Boolean(state.sabatierEnabled);
    const methanolEnabled = Boolean(state.methanolEnabled);
    const bothEnabled = methaneEnabled && methanolEnabled;
    const methaneShare = bothEnabled
      ? Math.max(0, Math.min(1, state.methaneFeedstockSplit / 100))
      : methaneEnabled ? 1 : 0;
    const methanolShare = bothEnabled
      ? 1 - methaneShare
      : methanolEnabled ? 1 : 0;

    return {
      methaneEnabled,
      methanolEnabled,
      bothEnabled,
      methaneShare,
      methanolShare,
    };
  },

  getSupportedProductWeights(state) {
    const mix = this.getProductMix(state);
    if (mix.methaneShare === 0 && mix.methanolShare === 0) {
      return {
        mix,
        label: 'default methane case',
        sabatier: 100,
        methanol: 0,
      };
    }

    return {
      mix,
      label: mix.bothEnabled
        ? 'configured product mix'
        : mix.methaneShare > 0
          ? 'methane'
          : 'methanol',
      sabatier: mix.methaneShare * 100,
      methanol: mix.methanolShare * 100,
    };
  },

  getModuleRouteConfig(moduleId, route) {
    return ModuleCatalog.getRouteConfig(moduleId, route);
  },

  getExploratoryRouteConfig(moduleId, route) {
    return this.getModuleRouteConfig(moduleId, route);
  },

  getModuleCapexControlConfig(moduleId, route) {
    const routeConfig = this.getModuleRouteConfig(moduleId, route);
    const defaultValue = routeConfig?.capexPerAnnualUnit || 0;
    const unitLabel = routeConfig?.capexUnit === 'm3pd' ? '$/m3/day' : '$/ton/yr capacity';
    const step = defaultValue >= 5000 ? 100 : defaultValue >= 1000 ? 50 : defaultValue >= 250 ? 10 : 5;
    const min = Math.max(step, Math.floor((defaultValue * 0.25) / step) * step);
    const max = Math.max(min + step, Math.ceil((defaultValue * 4) / step) * step);
    return {
      min,
      max,
      step,
      defaultValue,
      unitLabel,
    };
  },

  getExploratoryCapexControlConfig(moduleId, route) {
    return this.getModuleCapexControlConfig(moduleId, route);
  },

  getExploratoryPriorityWeight(state, moduleId) {
    return this.clampNumber(
      state?.[`${moduleId}PriorityWeight`],
      0,
      100,
      DEFAULT_STATE?.[`${moduleId}PriorityWeight`] ?? 100
    );
  },

  buildWeightedShareMap(entries = []) {
    const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight || 0), 0);
    if (totalWeight <= 0) return {};

    return entries.reduce((shares, entry) => {
      shares[entry.id] = Math.max(0, entry.weight || 0) / totalWeight;
      return shares;
    }, {});
  },

  buildProcessAllocationPlan(state) {
    const supported = this.getSupportedProductWeights(state);
    const mtgMethanolSplit = state.mtgEnabled
      ? this.clampNumber(state.mtgMethanolSplit, 0, 100, DEFAULT_STATE.mtgMethanolSplit) / 100
      : 0;

    const exploratoryModules = ModuleCatalog.getExploratoryModules()
      .map(module => {
        const enabled = Boolean(state[`${module.id}Enabled`]);
        const route = state[`${module.id}Route`] || ModuleCatalog.getDefaultRoute(module) || 'unspecified';
        const routeConfig = this.getModuleRouteConfig(module.id, route);
        const priorityWeight = this.getExploratoryPriorityWeight(state, module.id);
        const effectivePriorityWeight = enabled
          ? module.id === 'mtg'
            ? priorityWeight * mtgMethanolSplit
            : priorityWeight
          : 0;

        return {
          ...module,
          enabled,
          route,
          routeConfig,
          priorityWeight,
          effectivePriorityWeight,
        };
      });

    const h2Consumers = [];
    const co2Consumers = [];
    const exploratoryPowerDemandProxies = {};
    const exploratoryPowerWeightEntries = [];

    if (supported.sabatier > 0 && state.sabatierEnabled) {
      h2Consumers.push({
        id: 'sabatier',
        weight: supported.sabatier,
        inputKgPerUnit: CHEMISTRY.sabatier.h2MassPerKgCH4 * 1000,
      });
      co2Consumers.push({
        id: 'sabatier',
        weight: supported.sabatier,
        inputKgPerUnit: CHEMISTRY.sabatier.co2MassPerKgCH4 * 1000,
      });
    }
    if (supported.methanol > 0 && state.methanolEnabled) {
      h2Consumers.push({
        id: 'methanol',
        weight: supported.methanol,
        inputKgPerUnit: CHEMISTRY.methanol.h2MassPerKgMeOH * 1000,
      });
      co2Consumers.push({
        id: 'methanol',
        weight: supported.methanol,
        inputKgPerUnit: CHEMISTRY.methanol.co2MassPerKgMeOH * 1000,
      });
    }

    exploratoryModules.forEach(module => {
      const routeConfig = module.routeConfig;
      if (!module.enabled || !routeConfig) {
        exploratoryPowerDemandProxies[module.id] = 0;
        return;
      }

      const h2KgPerUnit = routeConfig.feedstocks?.h2Kg || 0;
      const co2KgPerUnit = routeConfig.feedstocks?.co2Kg || 0;
      if (h2KgPerUnit > 0) {
        h2Consumers.push({
          id: module.id,
          weight: module.effectivePriorityWeight,
          inputKgPerUnit: h2KgPerUnit,
        });
      }
      if (co2KgPerUnit > 0) {
        co2Consumers.push({
          id: module.id,
          weight: module.effectivePriorityWeight,
          inputKgPerUnit: co2KgPerUnit,
        });
      }

      exploratoryPowerDemandProxies[module.id] = module.effectivePriorityWeight * (routeConfig.electricityKwhPerUnit || 0);
      exploratoryPowerWeightEntries.push({
        id: module.id,
        weight: module.effectivePriorityWeight,
      });
    });

    const h2PowerDemand = h2Consumers.reduce(
      (sum, consumer) => sum + consumer.weight * consumer.inputKgPerUnit * state.electrolyzerEfficiency,
      0
    );
    const co2PowerDemand = co2Consumers.reduce(
      (sum, consumer) => sum + consumer.weight * consumer.inputKgPerUnit * (state.dacEnergy / 1000),
      0
    );
    const exploratoryPowerDemand = Object.values(exploratoryPowerDemandProxies).reduce((sum, value) => sum + value, 0);
    const totalPowerDemand = h2PowerDemand + co2PowerDemand + exploratoryPowerDemand;
    const exploratoryPoolShare = totalPowerDemand > 0 ? exploratoryPowerDemand / totalPowerDemand : 0;
    const exploratoryWithinPoolShares = this.buildWeightedShareMap(exploratoryPowerWeightEntries);
    const exploratoryPowerShares = exploratoryModules.reduce((shares, module) => {
      shares[module.id] = exploratoryPoolShare * (exploratoryWithinPoolShares[module.id] || 0);
      return shares;
    }, {});

    return {
      label: exploratoryPowerDemand > 0 ? `${supported.label} + exploratory demand` : supported.label,
      supported,
      exploratoryModules,
      feedShares: {
        h2: this.buildWeightedShareMap(h2Consumers),
        co2: this.buildWeightedShareMap(co2Consumers),
        methanol: this.buildWeightedShareMap([
          ...(state.methanolEnabled ? [{ id: 'methanolExport', weight: Math.max(0, 1 - mtgMethanolSplit) }] : []),
          ...(state.mtgEnabled ? [{ id: 'mtg', weight: Math.max(0, mtgMethanolSplit) }] : []),
        ]),
      },
      powerProxy: {
        electrolyzer: h2PowerDemand,
        dac: co2PowerDemand,
        exploratoryTotal: exploratoryPowerDemand,
        total: totalPowerDemand,
      },
      powerShares: {
        electrolyzer: totalPowerDemand > 0 ? h2PowerDemand / totalPowerDemand : 0.5,
        dac: totalPowerDemand > 0 ? co2PowerDemand / totalPowerDemand : 0.5,
        exploratory: exploratoryPowerShares,
      },
    };
  },

  buildWaterReservedAllocationPlan(state, dailyKWh, fullPlan = null) {
    const selectedPlan = fullPlan || this.buildProcessAllocationPlan(state);
    const desalModule = selectedPlan.exploratoryModules?.find(module => module.id === 'desalination');
    if (!desalModule?.enabled || !desalModule.routeConfig || !state.electrolyzerEnabled) return selectedPlan;

    // Remove desal from the old shared proxy first.  Water is then reserved
    // from the whole process pool, while the remaining modules retain their
    // existing relative shares and methane/methanol feed balancing.
    const basePlan = this.buildProcessAllocationPlan({ ...state, desalinationEnabled: false });
    const energy = Math.max(0, Number(dailyKWh) || 0);
    const efficiency = Math.max(1, Number(state.electrolyzerEfficiency) || 1);
    const baseH2Share = Math.max(0, Number(basePlan.powerShares?.electrolyzer) || 0);
    const wouldBeH2DailyKg = energy * baseH2Share / efficiency;
    if (wouldBeH2DailyKg <= 0 || energy <= 0) return selectedPlan;

    const recovery = this.getDesalRecoveryFraction(state);
    const cycleDamage = this.clampNumber(state.desalCyclingFactor, 1, 2, 1);
    const elevation = Math.max(0, Number(state.desalElevationM) || 0);
    const pumpKwh = 3.1 * elevation / 1000;
    const productSEC = Math.max(0, Number(desalModule.routeConfig.electricityKwhPerUnit) || 0) * cycleDamage;
    const electricCostPerM3 = productSEC + pumpKwh / recovery;
    const oversizeFactor = this.clampNumber(state.desalOversizeFactor, 1, 5, 1);
    const waterM3PerKgH2 = CHEMISTRY.electrolysis.waterPerKgH2 / 1000;
    // Solve the tiny circularity introduced by reserving desal power: less
    // power for electrolysis means proportionally less H2 water demand.
    const reserveCoefficient = energy > 0
      ? (waterM3PerKgH2 * oversizeFactor * electricCostPerM3 / energy)
      : 0;
    const reservedH2DailyKg = wouldBeH2DailyKg / (1 + wouldBeH2DailyKg * reserveCoefficient);
    const targetDailyM3 = reservedH2DailyKg * waterM3PerKgH2 * oversizeFactor;
    const reservedWaterKWh = targetDailyM3 * electricCostPerM3;
    const waterShare = Math.max(0, Math.min(1, energy > 0 ? reservedWaterKWh / energy : 0));
    const baseScale = Math.max(0, 1 - waterShare);
    const baseExploratory = basePlan.powerShares?.exploratory || {};
    const exploratory = selectedPlan.exploratoryModules.reduce((shares, module) => {
      shares[module.id] = (baseExploratory[module.id] || 0) * baseScale;
      return shares;
    }, {});
    exploratory.desalination = waterShare;

    return {
      ...selectedPlan,
      waterReservation: {
        targetDailyM3,
        reservedDailyKWh: reservedWaterKWh,
        reservedPowerShare: waterShare,
        wouldBeH2DailyKg,
      },
      powerShares: {
        ...basePlan.powerShares,
        electrolyzer: basePlan.powerShares.electrolyzer * baseScale,
        dac: basePlan.powerShares.dac * baseScale,
        exploratory,
      },
    };
  },

  constrainElectrolyzerToWater(electrolyzer, availableWaterDailyM3, cyclesPerYear) {
    if (!electrolyzer?.enabled) return electrolyzer;
    const originalH2DailyKg = Math.max(0, Number(electrolyzer.h2DailyKg) || 0);
    const maxH2DailyKg = Math.max(0, Number(availableWaterDailyM3) || 0) * 1000 / CHEMISTRY.electrolysis.waterPerKgH2;
    const h2DailyKg = Math.min(originalH2DailyKg, maxH2DailyKg);
    const curtailed = Math.max(0, originalH2DailyKg - h2DailyKg);
    const factor = originalH2DailyKg > 0 ? h2DailyKg / originalH2DailyKg : 0;
    electrolyzer.h2DailyKg = h2DailyKg;
    electrolyzer.h2AnnualKg = h2DailyKg * cyclesPerYear;
    electrolyzer.h2AnnualTons = electrolyzer.h2AnnualKg / 1000;
    electrolyzer.waterDailyKg = h2DailyKg * CHEMISTRY.electrolysis.waterPerKgH2;
    electrolyzer.oxygenDailyKg = h2DailyKg * 8;
    electrolyzer.oxygenAnnualKg = electrolyzer.h2AnnualKg * 8;
    electrolyzer.dailyKWh *= factor;
    electrolyzer.h2CurtailedDailyKg = curtailed;
    electrolyzer.waterLimited = curtailed > 1e-9;
    return electrolyzer;
  },

  getBalancedAllocation(state) {
    const allocationPlan = this.buildProcessAllocationPlan(state);
    return {
      source: 'auto',
      label: allocationPlan.label,
      electrolyzer: allocationPlan.powerShares.electrolyzer,
      dac: allocationPlan.powerShares.dac,
      exploratory: allocationPlan.powerShares.exploratory,
      feedShares: allocationPlan.feedShares,
      supported: allocationPlan.supported,
    };
  },

  calculateElectrolyzer(state, availablePowerKW, dailyKWh, allocation) {
    const cyclesPerYear = this.getBodyConfig(state.body || 'earth').cyclesPerEarthYear;
    if (!state.electrolyzerEnabled) {
      return {
        enabled: false,
        allocKW: 0,
        allocPct: 0,
        dailyKWh: 0,
        h2DailyKg: 0,
        h2AnnualKg: 0,
        h2AnnualTons: 0,
        waterDailyKg: 0,
        h2CurtailedDailyKg: 0,
        waterLimited: false,
        oxygenDailyKg: 0,
        oxygenAnnualKg: 0,
        lhvEfficiency: 0,
        capex: 0,
      };
    }

    const allocKW = availablePowerKW * allocation.electrolyzer;
    const dailyElecKWh = dailyKWh * allocation.electrolyzer;
    const h2DailyKg = dailyElecKWh / state.electrolyzerEfficiency;
    const h2AnnualKg = h2DailyKg * cyclesPerYear;

    return {
      enabled: true,
      allocKW,
      allocPct: allocation.electrolyzer * 100,
      dailyKWh: dailyElecKWh,
      h2DailyKg,
      h2AnnualKg,
      h2AnnualTons: h2AnnualKg / 1000,
      waterDailyKg: h2DailyKg * CHEMISTRY.electrolysis.waterPerKgH2,
      h2CurtailedDailyKg: 0,
      waterLimited: false,
      oxygenDailyKg: h2DailyKg * 8,
      oxygenAnnualKg: h2AnnualKg * 8,
      lhvEfficiency: (CHEMISTRY.electrolysis.h2EnergyContent / state.electrolyzerEfficiency) * 100,
      capex: allocKW * state.electrolyzerCapex,
    };
  },

  calculateDAC(state, availablePowerKW, dailyKWh, allocation) {
    const cyclesPerYear = this.getBodyConfig(state.body || 'earth').cyclesPerEarthYear;
    if (!state.dacEnabled) {
      return {
        enabled: false,
        allocKW: 0,
        allocPct: 0,
        dailyKWh: 0,
        co2DailyKg: 0,
        co2AnnualKg: 0,
        co2AnnualTons: 0,
        capex: 0,
      };
    }

    const allocKW = availablePowerKW * allocation.dac;
    const dailyDACKWh = dailyKWh * allocation.dac;
    const co2DailyKg = (dailyDACKWh / state.dacEnergy) * 1000;
    const co2AnnualKg = co2DailyKg * cyclesPerYear;
    const co2AnnualTons = co2AnnualKg / 1000;

    return {
      enabled: true,
      allocKW,
      allocPct: allocation.dac * 100,
      dailyKWh: dailyDACKWh,
      co2DailyKg,
      co2AnnualKg,
      co2AnnualTons,
      capex: co2AnnualTons * state.dacCapex,
    };
  },

  calculateSabatier(
    state,
    h2AvailableKg,
    co2AvailableKg,
    opHours,
    peakH2SizingKgPerHour = 0,
    peakCO2SizingKgPerHour = 0,
    peakH2DailyKg = h2AvailableKg,
    peakCO2DailyKg = co2AvailableKg
  ) {
    const body = this.getBodyConfig(state.body || 'earth');
    if (!state.sabatierEnabled || h2AvailableKg <= 0 || co2AvailableKg <= 0) {
      return {
        id: 'sabatier',
        enabled: false,
        bufferEnabled: false,
        modeled: false,
        title: 'Methane (Sabatier)',
        family: 'air-water-chemistry',
        maturity: 'Supported',
        ch4DailyKg: 0,
        ch4DailyMCF: 0,
        ch4AnnualKg: 0,
        ch4AnnualMCF: 0,
        h2Consumed: 0,
        co2Consumed: 0,
        waterProducedDaily: 0,
        designH2FeedKgPerHour: 0,
        designCO2FeedKgPerHour: 0,
        designFeedKgPerHour: 0,
        designHourlyOutputKg: 0,
        designOutputKW: 0,
        designHourlyRate: 0,
        averageUtilization: 0,
        operatingUtilization: 0,
        capex: 0,
      };
    }

    const c = CHEMISTRY.sabatier;
    const conv = state.sabatierConversion / 100;
    const bufferEnabled = this.isModuleFeedBufferEnabled(state, 'sabatier');
    const ch4FromH2 = h2AvailableKg / c.h2MassPerKgCH4;
    const ch4FromCO2 = co2AvailableKg / c.co2MassPerKgCH4;
    const grossCh4DailyKg = Math.min(ch4FromH2, ch4FromCO2);
    const ch4DailyKg = grossCh4DailyKg * conv;
    const peakCh4FromH2 = peakH2SizingKgPerHour / c.h2MassPerKgCH4;
    const peakCh4FromCO2 = peakCO2SizingKgPerHour / c.co2MassPerKgCH4;
    const sizingPeakH2DailyKg = Math.max(h2AvailableKg, Number.isFinite(peakH2DailyKg) ? peakH2DailyKg : 0);
    const sizingPeakCO2DailyKg = Math.max(co2AvailableKg, Number.isFinite(peakCO2DailyKg) ? peakCO2DailyKg : 0);
    const bufferedPeakCh4FromH2 = body.cycleHours > 0
      ? (sizingPeakH2DailyKg / body.cycleHours) / c.h2MassPerKgCH4
      : 0;
    const bufferedPeakCh4FromCO2 = body.cycleHours > 0
      ? (sizingPeakCO2DailyKg / body.cycleHours) / c.co2MassPerKgCH4
      : 0;
    const designGrossCh4KgPerHour = bufferEnabled
      ? Math.min(bufferedPeakCh4FromH2, bufferedPeakCh4FromCO2)
      : Math.min(peakCh4FromH2, peakCh4FromCO2);
    const designH2FeedKgPerHour = designGrossCh4KgPerHour * c.h2MassPerKgCH4;
    const designCO2FeedKgPerHour = designGrossCh4KgPerHour * c.co2MassPerKgCH4;
    const designFeedKgPerHour = designH2FeedKgPerHour + designCO2FeedKgPerHour;
    const designHourlyOutputKg = designGrossCh4KgPerHour * conv;
    const designOutputKW = designHourlyOutputKg * c.ch4LhvKwhPerKg;
    const designHourlyRate = designHourlyOutputKg / c.ch4PerMCF;
    const ch4DailyMCF = ch4DailyKg / c.ch4PerMCF;
    const designRunHours = bufferEnabled ? body.cycleHours : opHours;
    const hourlyRate = designRunHours > 0 ? ch4DailyMCF / designRunHours : 0;
    const grossFeedMassPerKgCh4 = c.h2MassPerKgCH4 + c.co2MassPerKgCH4;
    const grossDailyFeedKg = grossCh4DailyKg * grossFeedMassPerKgCh4;
    const averageGrossFeedKgPerHour = designRunHours > 0
      ? grossDailyFeedKg / designRunHours
      : 0;
    const averageUtilization = designFeedKgPerHour > 0
      ? Math.min(1, (grossDailyFeedKg / body.cycleHours) / designFeedKgPerHour)
      : 0;
    const operatingUtilization = designFeedKgPerHour > 0
      ? Math.min(1, averageGrossFeedKgPerHour / designFeedKgPerHour)
      : 0;
    return {
      id: 'sabatier',
      enabled: true,
      bufferEnabled,
      modeled: true,
      title: 'Methane (Sabatier)',
      family: 'air-water-chemistry',
      maturity: 'Supported',
      ch4DailyKg,
      ch4DailyMCF,
      ch4AnnualKg: ch4DailyKg * body.cyclesPerEarthYear,
      ch4AnnualMCF: ch4DailyMCF * body.cyclesPerEarthYear,
      h2Consumed: ch4DailyKg * c.h2MassPerKgCH4,
      co2Consumed: ch4DailyKg * c.co2MassPerKgCH4,
      waterProducedDaily: ch4DailyKg * c.waterPerKgCH4,
      designH2FeedKgPerHour,
      designCO2FeedKgPerHour,
      designFeedKgPerHour,
      designHourlyOutputKg,
      designOutputKW,
      limitingReagent: ch4FromH2 < ch4FromCO2 ? 'H2' : 'CO2',
      hourlyRate,
      designHourlyRate,
      averageUtilization,
      operatingUtilization,
      capex: state.sabatierCapex * designOutputKW,
    };
  },

  calculateMethanol(
    state,
    h2AvailableKg,
    co2AvailableKg,
    opHours,
    peakH2SizingKgPerHour = 0,
    peakCO2SizingKgPerHour = 0,
    peakH2DailyKg = h2AvailableKg,
    peakCO2DailyKg = co2AvailableKg
  ) {
    const body = this.getBodyConfig(state.body || 'earth');
    if (!state.methanolEnabled || h2AvailableKg <= 0 || co2AvailableKg <= 0) {
      return {
        id: 'methanol',
        enabled: false,
        bufferEnabled: false,
        modeled: false,
        title: 'Methanol',
        family: 'air-water-chemistry',
        maturity: 'Supported',
        dailyKg: 0,
        grossDailyKg: 0,
        annualKg: 0,
        grossAnnualKg: 0,
        annualTons: 0,
        grossAnnualTons: 0,
        dailyLiters: 0,
        grossDailyLiters: 0,
        exportDailyKg: 0,
        exportAnnualKg: 0,
        exportAnnualTons: 0,
        h2Consumed: 0,
        co2Consumed: 0,
        waterProducedDaily: 0,
        designH2FeedKgPerHour: 0,
        designCO2FeedKgPerHour: 0,
        designFeedKgPerHour: 0,
        designHourlyOutputKg: 0,
        averageUtilization: 0,
        operatingUtilization: 0,
        capex: 0,
      };
    }

    const c = CHEMISTRY.methanol;
    const eff = state.methanolEfficiency / 100;
    const bufferEnabled = this.isModuleFeedBufferEnabled(state, 'methanol');
    const grossDailyKg = Math.min(
      h2AvailableKg / c.h2MassPerKgMeOH,
      co2AvailableKg / c.co2MassPerKgMeOH
    );
    const dailyKg = grossDailyKg * eff;
    const peakMeohFromH2 = peakH2SizingKgPerHour / c.h2MassPerKgMeOH;
    const peakMeohFromCO2 = peakCO2SizingKgPerHour / c.co2MassPerKgMeOH;
    const sizingPeakH2DailyKg = Math.max(h2AvailableKg, Number.isFinite(peakH2DailyKg) ? peakH2DailyKg : 0);
    const sizingPeakCO2DailyKg = Math.max(co2AvailableKg, Number.isFinite(peakCO2DailyKg) ? peakCO2DailyKg : 0);
    const bufferedPeakMeohFromH2 = body.cycleHours > 0
      ? (sizingPeakH2DailyKg / body.cycleHours) / c.h2MassPerKgMeOH
      : 0;
    const bufferedPeakMeohFromCO2 = body.cycleHours > 0
      ? (sizingPeakCO2DailyKg / body.cycleHours) / c.co2MassPerKgMeOH
      : 0;
    const designGrossKgPerHour = bufferEnabled
      ? Math.min(bufferedPeakMeohFromH2, bufferedPeakMeohFromCO2)
      : Math.min(peakMeohFromH2, peakMeohFromCO2);
    const designH2FeedKgPerHour = designGrossKgPerHour * c.h2MassPerKgMeOH;
    const designCO2FeedKgPerHour = designGrossKgPerHour * c.co2MassPerKgMeOH;
    const designFeedKgPerHour = designH2FeedKgPerHour + designCO2FeedKgPerHour;
    const designHourlyOutputKg = designGrossKgPerHour * eff;
    const designRunHours = bufferEnabled ? body.cycleHours : opHours;
    const grossFeedMassPerKgMeoh = c.h2MassPerKgMeOH + c.co2MassPerKgMeOH;
    const grossDailyFeedKg = grossDailyKg * grossFeedMassPerKgMeoh;
    const averageGrossFeedKgPerHour = designRunHours > 0
      ? grossDailyFeedKg / designRunHours
      : 0;
    const averageUtilization = designFeedKgPerHour > 0
      ? Math.min(1, (grossDailyFeedKg / body.cycleHours) / designFeedKgPerHour)
      : 0;
    const operatingUtilization = designFeedKgPerHour > 0
      ? Math.min(1, averageGrossFeedKgPerHour / designFeedKgPerHour)
      : 0;
    const annualKg = dailyKg * body.cyclesPerEarthYear;
    return {
      id: 'methanol',
      enabled: true,
      bufferEnabled,
      modeled: true,
      title: 'Methanol',
      family: 'air-water-chemistry',
      maturity: 'Supported',
      dailyKg,
      grossDailyKg: dailyKg,
      annualKg,
      grossAnnualKg: annualKg,
      annualTons: annualKg / 1000,
      grossAnnualTons: annualKg / 1000,
      dailyLiters: dailyKg / c.density,
      grossDailyLiters: dailyKg / c.density,
      exportDailyKg: dailyKg,
      exportAnnualKg: annualKg,
      exportAnnualTons: annualKg / 1000,
      h2Consumed: dailyKg * c.h2MassPerKgMeOH,
      co2Consumed: dailyKg * c.co2MassPerKgMeOH,
      waterProducedDaily: dailyKg * c.waterPerKgMeOH,
      designH2FeedKgPerHour,
      designCO2FeedKgPerHour,
      designFeedKgPerHour,
      designHourlyOutputKg,
      averageUtilization,
      operatingUtilization,
      capex: state.methanolCapex * designFeedKgPerHour,
    };
  },

  calculateSupportedProducts(state, materialFlows, opHours, allocationPlan, options = {}) {
    const includeSupportedModules = options.includeSupportedModules !== false;
    const h2Shares = allocationPlan?.feedShares?.h2 || {};
    const co2Shares = allocationPlan?.feedShares?.co2 || {};

    const sabatier = this.calculateSabatier(
      state,
      (materialFlows.h2DailyKg || 0) * (h2Shares.sabatier || 0),
      (materialFlows.co2DailyKg || 0) * (co2Shares.sabatier || 0),
      opHours,
      (materialFlows.h2SizingPeakKgPerHour || 0) * (h2Shares.sabatier || 0),
      (materialFlows.co2SizingPeakKgPerHour || 0) * (co2Shares.sabatier || 0),
      ((materialFlows.peakH2DailyKg ?? materialFlows.h2DailyKg) || 0) * (h2Shares.sabatier || 0),
      ((materialFlows.peakCO2DailyKg ?? materialFlows.co2DailyKg) || 0) * (co2Shares.sabatier || 0)
    );

    const methanol = this.calculateMethanol(
      state,
      (materialFlows.h2DailyKg || 0) * (h2Shares.methanol || 0),
      (materialFlows.co2DailyKg || 0) * (co2Shares.methanol || 0),
      opHours,
      (materialFlows.h2SizingPeakKgPerHour || 0) * (h2Shares.methanol || 0),
      (materialFlows.co2SizingPeakKgPerHour || 0) * (co2Shares.methanol || 0),
      ((materialFlows.peakH2DailyKg ?? materialFlows.h2DailyKg) || 0) * (h2Shares.methanol || 0),
      ((materialFlows.peakCO2DailyKg ?? materialFlows.co2DailyKg) || 0) * (co2Shares.methanol || 0)
    );

    return {
      supportedModules: includeSupportedModules ? [sabatier, methanol] : [],
      outputs: { sabatier, methanol },
      h2Remaining: Math.max(0, (materialFlows.h2DailyKg || 0) - (sabatier.h2Consumed || 0) - (methanol.h2Consumed || 0)),
      co2Remaining: Math.max(0, (materialFlows.co2DailyKg || 0) - (sabatier.co2Consumed || 0) - (methanol.co2Consumed || 0)),
    };
  },

  calculateExploratoryOutputUnits(routeConfig, dailyKWh, allocations = {}) {
    if (!routeConfig || !Number.isFinite(dailyKWh) || dailyKWh <= 0) return 0;

    const limits = [];
    if (routeConfig.electricityKwhPerUnit > 0) {
      limits.push(dailyKWh / routeConfig.electricityKwhPerUnit);
    }

    const feedstocks = routeConfig.feedstocks || {};
    if (feedstocks.h2Kg > 0) limits.push((allocations.h2Kg || 0) / feedstocks.h2Kg);
    if (feedstocks.co2Kg > 0) limits.push((allocations.co2Kg || 0) / feedstocks.co2Kg);
    if (feedstocks.methanolKg > 0) limits.push((allocations.methanolKg || 0) / feedstocks.methanolKg);

    if (!limits.length) return 0;
    return Math.max(0, Math.min(...limits.filter(Number.isFinite)));
  },

  calculateExploratoryPeakOutputRate(routeConfig, peakAllocKW, peakAllocations = {}) {
    if (!routeConfig || !Number.isFinite(peakAllocKW) || peakAllocKW <= 0) return 0;

    const limits = [];
    if (routeConfig.electricityKwhPerUnit > 0) {
      limits.push(peakAllocKW / routeConfig.electricityKwhPerUnit);
    }

    const feedstocks = routeConfig.feedstocks || {};
    if (feedstocks.h2Kg > 0) limits.push((peakAllocations.h2KgPerHour || 0) / feedstocks.h2Kg);
    if (feedstocks.co2Kg > 0) limits.push((peakAllocations.co2KgPerHour || 0) / feedstocks.co2Kg);
    if (feedstocks.methanolKg > 0) limits.push((peakAllocations.methanolKgPerHour || 0) / feedstocks.methanolKg);

    if (!limits.length) return 0;
    return Math.max(0, Math.min(...limits.filter(Number.isFinite)));
  },

  calculateExploratoryBufferedOutputRate(routeConfig, peakAllocKW, dailyAllocations = {}, cycleHours = 0) {
    if (!routeConfig || !Number.isFinite(cycleHours) || cycleHours <= 0) return 0;
    return this.calculateExploratoryPeakOutputRate(routeConfig, peakAllocKW, {
      h2KgPerHour: (dailyAllocations.h2Kg || 0) / cycleHours,
      co2KgPerHour: (dailyAllocations.co2Kg || 0) / cycleHours,
      methanolKgPerHour: (dailyAllocations.methanolKg || 0) / cycleHours,
    });
  },

  calculateExploratoryCapex(routeConfig, capexBasis, peakOutputUnitsPerHour, cycleHours, cyclesPerYear) {
    if (!routeConfig || peakOutputUnitsPerHour <= 0 || cycleHours <= 0 || cyclesPerYear <= 0) return 0;
    const cyclingPenalty = routeConfig.cyclingPenalty || 1;
    const baseCapex = Number.isFinite(capexBasis) ? capexBasis : (routeConfig.capexPerAnnualUnit || 0);
    const nameplateUnitsPerDay = peakOutputUnitsPerHour * cycleHours;

    if (routeConfig.capexUnit === 'm3pd') {
      return nameplateUnitsPerDay * baseCapex * cyclingPenalty;
    }

    const nameplateAnnualUnits = nameplateUnitsPerDay * cyclesPerYear;
    return nameplateAnnualUnits * baseCapex * cyclingPenalty;
  },

  calculateExploratoryModules(state, context = {}) {
    const {
      allocationPlan,
      materialFlows = {},
      peakMaterialFlows = {},
      supportedOutputs = {},
      effectivePeakKW = 0,
      peakSizingKW = 0,
      effectiveDailyKWh = 0,
      peakDailyKWh = 0,
      opHours = 0,
      waterSystems = null,
    } = context;
    const body = this.getBodyConfig(state.body || 'earth');
    const cyclesPerYear = body.cyclesPerEarthYear;
    const cycleHours = body.cycleHours;
    const h2Shares = allocationPlan?.feedShares?.h2 || {};
    const co2Shares = allocationPlan?.feedShares?.co2 || {};
    const methanolShares = allocationPlan?.feedShares?.methanol || {};
    const grossMethanolDailyKg = supportedOutputs?.methanol?.grossDailyKg || supportedOutputs?.methanol?.dailyKg || 0;
    const peakDayScale = effectiveDailyKWh > 0 && peakDailyKWh > 0
      ? Math.max(1, peakDailyKWh / effectiveDailyKWh)
      : 1;

    return ModuleCatalog.getExploratoryModules()
      .map(module => {
        const enabled = Boolean(state[`${module.id}Enabled`]);
        const route = state[`${module.id}Route`] || ModuleCatalog.getDefaultRoute(module) || 'unspecified';
        const routeConfig = this.getModuleRouteConfig(module.id, route);
        const capexBasis = Number(state[`${module.id}CapexBasis`]);
        const omPercent = Number(state.exploratoryOmPercent);
        const powerShare = allocationPlan?.powerShares?.exploratory?.[module.id] || 0;
        const allocKW = effectivePeakKW * powerShare;
        const peakAllocKW = Math.max(effectivePeakKW, peakSizingKW) * powerShare;
        const dailyKWh = effectiveDailyKWh * powerShare;
        const peakDayKWh = dailyKWh * peakDayScale;
        const bufferEnabled = this.isModuleFeedBufferEnabled(state, module.id, route);
        if (module.id === 'desalination' && waterSystems?.enabled) {
          const outputDailyUnits = waterSystems.dailyM3 || 0;
          const peakOutputDailyUnits = outputDailyUnits;
          const peakOutputUnitsPerHour = opHours > 0 ? outputDailyUnits / opHours : 0;
          return {
            ...module, enabled, route, routeLabel: ModuleCatalog.getRouteOptions(module).find(option => option.value === route)?.label || route,
            routeConfig, modeled: enabled, bufferEnabled, excludedFromEconomics: false, allocKW,
            dailyKWh, realizedCapacityFactor: 1, outputDailyUnits, peakOutputUnitsPerHour,
            capexSizingOutputUnitsPerHour: peakOutputUnitsPerHour, peakOutputDailyUnits,
            annualOutputUnits: outputDailyUnits * cyclesPerYear, outputLabel: 'Fresh water', outputUnit: 'm3',
            capex: outputDailyUnits > 0 ? (outputDailyUnits * (routeConfig.capexPerAnnualUnit || 0) * (routeConfig.cyclingPenalty || 1)) : 0,
            capexBasisUnit: 'm3pd', capexBasis: Number.isFinite(capexBasis) ? capexBasis : (routeConfig?.capexPerAnnualUnit || 0),
            omPercent: Number.isFinite(omPercent) ? omPercent : 4, feedstockSummary: `${waterSystems.brineDailyM3.toFixed(1)} m3/day brine; ${state.waterFeedPreset || 'seawater'} feed`,
            h2Consumed: 0, co2Consumed: 0, methanolConsumed: 0,
            waterCreditDailyM3: waterSystems.waterCreditDailyM3 || 0, brineDailyM3: waterSystems.brineDailyM3 || 0,
            diagramInputs: { electricity: true, water: true, ...(routeConfig?.diagramInputs || {}) },
          };
        }
        if (module.id === 'brineMining' && waterSystems?.mining) {
          const mining = waterSystems.mining;
          const annualOutputUnits = Object.values(mining.products || {}).reduce((sum, product) => sum + (product.annualTons || 0), 0);
          const outputDailyUnits = annualOutputUnits / cyclesPerYear;
          const peakOutputUnitsPerHour = opHours > 0 ? outputDailyUnits / opHours : 0;
          return {
            ...module, enabled, route, routeLabel: ModuleCatalog.getRouteOptions(module).find(option => option.value === route)?.label || route,
            routeConfig, modeled: enabled, bufferEnabled, excludedFromEconomics: false, allocKW, dailyKWh,
            realizedCapacityFactor: 1, outputDailyUnits, peakOutputUnitsPerHour, capexSizingOutputUnitsPerHour: peakOutputUnitsPerHour,
            peakOutputDailyUnits: outputDailyUnits, annualOutputUnits, outputLabel: routeConfig?.outputLabel || module.label, outputUnit: 't',
            capex: annualOutputUnits * (capexBasis || routeConfig.capexPerAnnualUnit || 0) * (routeConfig.cyclingPenalty || 1),
            capexBasisUnit: 'tpa', capexBasis: Number.isFinite(capexBasis) ? capexBasis : routeConfig.capexPerAnnualUnit,
            omPercent: Number.isFinite(omPercent) ? omPercent : 4, feedstockSummary: routeConfig.feedstockSummary,
            brineConsumedDailyM3: mining.brineConsumedDailyM3, products: mining.products, grossRevenue: mining.grossRevenue,
            marketCappedRevenue: mining.marketCappedRevenue, h2Consumed: 0, co2Consumed: 0, methanolConsumed: 0,
            diagramInputs: { electricity: true, brine: true, ...(routeConfig?.diagramInputs || {}) },
          };
        }
        const allocations = {
          h2Kg: (materialFlows.h2DailyKg || 0) * (h2Shares[module.id] || 0),
          co2Kg: (materialFlows.co2DailyKg || 0) * (co2Shares[module.id] || 0),
          methanolKg: module.id === 'mtg' ? grossMethanolDailyKg * (methanolShares.mtg || 0) : 0,
        };
        const peakDayAllocations = {
          h2Kg: allocations.h2Kg * peakDayScale,
          co2Kg: allocations.co2Kg * peakDayScale,
          methanolKg: allocations.methanolKg * peakDayScale,
        };
        const peakAllocations = {
          h2KgPerHour: (peakMaterialFlows.h2KgPerHour || 0) * (h2Shares[module.id] || 0),
          co2KgPerHour: (peakMaterialFlows.co2KgPerHour || 0) * (co2Shares[module.id] || 0),
          methanolKgPerHour: module.id === 'mtg' ? (peakMaterialFlows.methanolKgPerHour || 0) * (methanolShares.mtg || 0) : 0,
        };
        const outputDailyUnits = enabled
          ? this.calculateExploratoryOutputUnits(routeConfig, dailyKWh, allocations)
          : 0;
        const peakOutputUnitsPerHour = enabled
          ? this.calculateExploratoryPeakOutputRate(routeConfig, peakAllocKW, peakAllocations)
          : 0;
        const peakOutputDailyUnits = enabled
          ? this.calculateExploratoryOutputUnits(routeConfig, peakDayKWh, peakDayAllocations)
          : 0;
        const capexSizingOutputUnitsPerHour = enabled
          ? (
              bufferEnabled
                ? this.calculateExploratoryBufferedOutputRate(routeConfig, peakAllocKW, peakDayAllocations, cycleHours)
                : peakOutputUnitsPerHour
            )
          : 0;
        const annualOutputUnits = outputDailyUnits * cyclesPerYear;
        const realizedCapacityFactor = capexSizingOutputUnitsPerHour > 0 && cycleHours > 0
          ? Math.max(0, Math.min(1, outputDailyUnits / (capexSizingOutputUnitsPerHour * cycleHours)))
          : 0;
        const h2Consumed = outputDailyUnits * (routeConfig?.feedstocks?.h2Kg || 0);
        const co2Consumed = outputDailyUnits * (routeConfig?.feedstocks?.co2Kg || 0);
        const methanolConsumed = outputDailyUnits * (routeConfig?.feedstocks?.methanolKg || 0);

        return {
          ...module,
          enabled,
          route,
          routeLabel: ModuleCatalog.getRouteOptions(module).find(option => option.value === route)?.label || route,
          routeConfig,
          modeled: enabled,
          bufferEnabled,
          excludedFromEconomics: false,
          allocKW,
          dailyKWh,
          realizedCapacityFactor,
          outputDailyUnits,
          peakOutputUnitsPerHour,
          capexSizingOutputUnitsPerHour,
          peakOutputDailyUnits,
          annualOutputUnits,
          outputLabel: routeConfig?.outputLabel || module.label,
          outputUnit: routeConfig?.outputUnit || 't',
          capex: this.calculateExploratoryCapex(
            routeConfig,
            capexBasis,
            capexSizingOutputUnitsPerHour,
            cycleHours,
            cyclesPerYear
          ),
          capexBasisUnit: routeConfig?.capexUnit || 'tpa',
          capexBasis: Number.isFinite(capexBasis) ? capexBasis : (routeConfig?.capexPerAnnualUnit || 0),
          omPercent: Number.isFinite(omPercent) ? omPercent : 4,
          feedstockSummary: routeConfig?.feedstockSummary || 'Needs power',
          h2Consumed,
          co2Consumed,
          methanolConsumed,
          diagramInputs: {
            electricity: true,
            ...(routeConfig?.diagramInputs || module.diagramInputs || {}),
          },
        };
      });
  },
});
