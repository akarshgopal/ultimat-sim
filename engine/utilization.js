// Utilization & storage design for solar-only plants (TEA fidelity step 1).
//
// Plant models (cases/*.js) cost equipment per kg/day of *daily-average* throughput, as if every
// unit ran 24 h. On solar alone that is wrong in two ways:
//   • units that can follow the sun (electrolyzers, SWRO, DAC, pumps…) only run when the sun
//     shines, so they need nameplate capacity well above the daily average;
//   • units that must run steadily (kilns, furnaces, Haber-Bosch, synthesis loops…) need their
//     power firmed through the night by storage.
// This module designs each plant per site from 12 monthly typical solar days:
//   flexible block — choose the unit-to-PV ratio r (kW load per kWp) that minimizes PV + oversized
//                    equipment capex; clipped solar above r is curtailed;
//   baseload block — choose PV per kW of steady load (k) and storage (battery, or a thermal store
//                    for units whose energy is really heat) minimizing (PV + storage + units)/output;
//                    months the store cannot cover run at reduced output (output factor < 1);
//   buffers        — an intermediate made by a flexible unit and consumed by a baseload unit
//                    (e.g. H₂ → Haber-Bosch) is stored to cover the hours the flexible block is off.
// Two strategies are compared per plant — "sun-following" (flexible units follow the sun, baseload
// firmed, intermediates buffered) and "firmed" (everything runs 24 h on PV + storage) — and the
// cheaper per kg of output wins. Pure functions; no engine dependencies.
(function exposeUtilization(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoundryUtilization = api;
})(globalThis, () => {
  const STEPS = 48; // half-hour resolution
  const DT = 24 / STEPS;
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MID_MONTH_DAY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
  const R_GRID = Array.from({ length: 40 }, (_, i) => 0.025 * (i + 1)); // kW load per kWp: 0.025..1.0
  const K_GRID = Array.from({ length: 57 }, (_, i) => 1 + 0.25 * i); // kWp per kW steady load: 1..15

  // Screening defaults; every number is overridable through company config `utilization`.
  const DEFAULTS = Object.freeze({
    enabled: true,
    // Units that can ramp with the sun. Everything else is treated as baseload.
    flexibleUnits: Object.freeze([
      'electrolyzer', 'chlor-alkali', 'swro', 'intake-pump', 'gas-blower', 'dac', 'dac-solid',
      'brine-minerals', 'bromine-recovery', 'copper-ew',
    ]),
    // Baseload units whose "electricity" is a total-energy proxy for process heat: their night
    // energy can come from a thermal store instead of a battery.
    thermalUnits: Object.freeze(['cement', 'float-glass', 'bayer-alumina', 'urea']),
    // Effective PV generating day as a fraction of the astronomical day length.
    solarDayFraction: 0.9,
    // Baseload units cannot stop nightly; they can only turn down. In every month, direct PV plus
    // storage must hold them at ≥ this fraction of full load around the clock. Kilns, glass
    // furnaces and synthesis loops typically turn down to ~60–70%.
    baseloadMinTurndown: 0.7,
    // Per-unit energy multipliers vs the recipes (e.g. a designed electrolyzer at 49 kWh/kg instead of
    // the recipes' 52: { electrolyzer: 49 / 52 }).
    unitEnergyScale: Object.freeze({}),
    battery: Object.freeze({
      usdPerKWh: 350, roundTrip: 0.88, depthOfDischarge: 0.9, lifeYears: 15, fixedOmFrac: 0.025,
      source: 'NREL ATB 2024 utility-scale battery (4-h, moderate) cost order; screening',
    }),
    thermal: Object.freeze({
      usdPerKWh: 40, roundTrip: 0.9, depthOfDischarge: 1, lifeYears: 30, fixedOmFrac: 0.01,
      source: 'assumption: resistively charged solid-media (firebrick) heat storage; screening',
    }),
    // Intermediate storage capex per kg of capacity, by dominant substance.
    bufferUsdPerKg: Object.freeze({
      H2: 600, // compressed-gas H₂ storage ~$500–1000/kg (DOE HFTO bulk storage family); screening
      CO2: 5,
      N2: 5,
      O2: 5,
      default: 0.5, // atmospheric liquid/solid tank ~$500/m³ (TeaScreening tank pack order)
    }),
  });

  const MERGED = Symbol('merged');
  const mergedCache = new WeakMap();
  function mergeCfg(cfg) {
    if (!cfg) return mergeCfg(DEFAULTS);
    if (cfg[MERGED]) return cfg;
    if (mergedCache.has(cfg)) return mergedCache.get(cfg);
    const merged = {
      [MERGED]: true,
      profileKey: [...(cfg.flexibleUnits || DEFAULTS.flexibleUnits)].join(',') + '|' + [...(cfg.thermalUnits || DEFAULTS.thermalUnits)].join(',')
        + '|' + JSON.stringify(cfg.unitEnergyScale || {}),
      ...DEFAULTS,
      ...cfg,
      battery: { ...DEFAULTS.battery, ...(cfg.battery || {}) },
      thermal: { ...DEFAULTS.thermal, ...(cfg.thermal || {}) },
      bufferUsdPerKg: { ...DEFAULTS.bufferUsdPerKg, ...(cfg.bufferUsdPerKg || {}) },
      unitEnergyScale: { ...(cfg.unitEnergyScale || {}) },
    };
    mergedCache.set(cfg, merged);
    return merged;
  }

  // ------------------------------------------------------------------ pathway operating profile
  const UNIT_TECH = Object.freeze({
    electrolyzer: 'electrolyzer', 'chlor-alkali': 'electrolyzer',
    dac: 'dac', 'dac-solid': 'dac', 'gas-blower': 'dac',
    swro: 'desal', 'intake-pump': 'desal',
  });
  const profileCache = new WeakMap();

  // Per kg of primary product, from the pathway's solved flowsheet. null → no flowsheet (legacy
  // recipes and test fixtures): the caller keeps the 24 h-average costing.
  // designUnits: { <unit>: { capexFactor, flexible, thermal } } — designed units re-weight the
  // flexible/baseload capex split; flexible: true/false overrides whether the unit follows the sun (e.g.
  // a wide-turndown synthesis loop designed to ramp with PV) or must be firmed; thermal: true lets a
  // firmed unit whose energy is really heat (a DRI shaft's gas preheat) be firmed by a heat store.
  function operatingProfile(pathway, cfgIn, designUnits = null) {
    if (!pathway?.flowsheet?.nodes?.length) return null;
    const cfg = mergeCfg(cfgIn);
    const key = cfg.profileKey + '|' + (designUnits ? JSON.stringify(designUnits) : '');
    const cached = profileCache.get(pathway);
    if (cached && cached.key === key) return cached.profile;
    const flexible = new Set(cfg.flexibleUnits);
    const thermal = new Set(cfg.thermalUnits);
    const modeById = new Map();
    let flexKWh = 0;
    let baseKWh = 0;
    let baseThermalKWh = 0;
    let energyDelta = 0;
    const capex = { flex: {}, base: {} };
    for (const node of pathway.flowsheet.nodes) {
      if (node.kind !== 'converter') continue;
      const forced = designUnits?.[node.unit]?.flexible;
      const mode = forced === true ? 'flex' : forced === false ? 'base' : flexible.has(node.unit) ? 'flex' : 'base';
      modeById.set(node.id, mode);
      const kWh = (Number(node.kWhPerKg) || 0) * (cfg.unitEnergyScale[node.unit] ?? 1);
      energyDelta += (Number(node.kWhPerKg) || 0) * ((cfg.unitEnergyScale[node.unit] ?? 1) - 1);
      if (mode === 'flex') flexKWh += kWh;
      else if (thermal.has(node.unit) || designUnits?.[node.unit]?.thermal === true) baseThermalKWh += kWh;
      else baseKWh += kWh;
      const cls = UNIT_TECH[node.unit] || 'process';
      const capexFactor = Number(designUnits?.[node.unit]?.capexFactor) > 0 ? designUnits[node.unit].capexFactor : 1;
      capex[mode][cls] = (capex[mode][cls] || 0) + (Number(node.capexUsdPerKgDay) || 0) * capexFactor;
    }
    // Purchased heat (DAC regeneration) follows the flexible DAC units when there are any.
    const heat = Number(pathway.heatKWhPerKg) || 0;
    if (heat > 0) {
      if ([...modeById.values()].includes('flex')) flexKWh += heat;
      else baseThermalKWh += heat;
    }
    // Reconcile node energy with the recipe total (rounding in the flowsheet).
    const nodeTotal = flexKWh + baseKWh + baseThermalKWh;
    const recipeTotal = (Number(pathway.electricityKWhPerKg) || 0) + heat + energyDelta;
    if (nodeTotal > 0 && recipeTotal > 0) {
      const scale = recipeTotal / nodeTotal;
      flexKWh *= scale;
      baseKWh *= scale;
      baseThermalKWh *= scale;
    }
    const flexShareByClass = {};
    for (const cls of new Set([...Object.keys(capex.flex), ...Object.keys(capex.base)])) {
      const f = capex.flex[cls] || 0;
      const b = capex.base[cls] || 0;
      flexShareByClass[cls] = f + b > 0 ? f / (f + b) : 0;
    }
    const buffers = [];
    for (const edge of pathway.flowsheet.edges || []) {
      if (edge.kind !== 'material') continue;
      if (modeById.get(edge.from) !== 'flex' || modeById.get(edge.to) !== 'base') continue;
      const substance = edge.substances?.[0]?.[0] || 'default';
      buffers.push({ from: edge.from, to: edge.to, substance, kgPerKg: Number(edge.kgPerKg) || 0 });
    }
    const profile = {
      flexKWh, baseKWh, baseThermalKWh, flexShareByClass, buffers, energyDeltaKWhPerKg: energyDelta,
      hasFlex: [...modeById.values()].includes('flex'),
      hasBase: [...modeById.values()].includes('base'),
    };
    profileCache.set(pathway, { key, profile });
    return profile;
  }

  // ------------------------------------------------------------------ site solar
  function dayLengthHours(latitudeDeg, dayOfYear) {
    const decl = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
    const lat = (Math.max(-66, Math.min(66, Number(latitudeDeg) || 0)) * Math.PI) / 180;
    const x = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl)));
    return (2 * Math.acos(x) * 180) / Math.PI / 15;
  }

  // Typical-day PV output (kW per kWp) per month: a half-sine over the effective day whose
  // integral equals that month's E_d.
  function monthlyProfiles(site, cfg) {
    const annual = Number(site.pvKWhPerKWpDay) || 0;
    const monthly = Array.isArray(site.pvMonthlyKWhPerKWpDay) && site.pvMonthlyKWhPerKWpDay.length === 12
      ? site.pvMonthlyKWhPerKWpDay.map(Number)
      : new Array(12).fill(annual);
    return monthly.map((energy, m) => {
      const day = dayLengthHours(site.latitude, MID_MONTH_DAY[m]) * cfg.solarDayFraction;
      const start = 12 - day / 2;
      const p = new Float64Array(STEPS);
      let sum = 0;
      for (let i = 0; i < STEPS; i += 1) {
        const t = (i + 0.5) * DT;
        const x = (t - start) / day;
        p[i] = x > 0 && x < 1 ? Math.sin(Math.PI * x) : 0;
        sum += p[i] * DT;
      }
      const scale = sum > 0 ? energy / sum : 0;
      for (let i = 0; i < STEPS; i += 1) p[i] *= scale;
      return { days: MONTH_DAYS[m], energy, profile: p };
    });
  }

  const solarCache = new Map();
  const solarBySite = new WeakMap(); // site object → { fraction, solar } fast path
  function siteSolar(site, cfg) {
    const hit = solarBySite.get(site);
    if (hit && hit.fraction === cfg.solarDayFraction) return hit.solar;
    const key = `${site.id}|${site.latitude}|${site.pvKWhPerKWpDay}|${cfg.solarDayFraction}`;
    if (solarCache.has(key)) {
      solarBySite.set(site, { fraction: cfg.solarDayFraction, solar: solarCache.get(key) });
      return solarCache.get(key);
    }
    const months = monthlyProfiles(site, cfg);
    // Flexible curve: kWh/kWp·yr usable by a load capped at r kW per kWp.
    const flexUsed = R_GRID.map(r => months.reduce((sum, m) => {
      let used = 0;
      for (let i = 0; i < STEPS; i += 1) used += Math.min(m.profile[i], r) * DT;
      return sum + m.days * used;
    }, 0));
    // Baseload: per month and k (kWp per kW of steady load), direct supply, surplus and deficit (kWh per kW·day).
    const base = K_GRID.map(k => months.map(m => {
      let direct = 0;
      let surplus = 0;
      for (let i = 0; i < STEPS; i += 1) {
        const pv = k * m.profile[i];
        direct += Math.min(pv, 1) * DT;
        surplus += Math.max(pv - 1, 0) * DT;
      }
      return { days: m.days, direct, surplus, deficit: 24 - direct };
    }));
    const annualKWhPerKWp = months.reduce((sum, m) => sum + m.days * m.energy, 0);
    // Per store round-trip efficiency: annual output factor and worst-month store draw (kWh per
    // kW·day) for each k. Memoized so a plant design is O(grid), not O(grid × months).
    const storeCurves = new Map();
    const curvesFor = eta => {
      if (storeCurves.has(eta)) return storeCurves.get(eta);
      const outputFactor = new Float64Array(K_GRID.length);
      const storeNeed = new Float64Array(K_GRID.length);
      const worstMonth = new Float64Array(K_GRID.length);
      base.forEach((months, i) => {
        let served = 0;
        let days = 0;
        let need = 0;
        let worst = 1;
        for (const m of months) {
          const fromStore = Math.min(eta * m.surplus, m.deficit);
          served += m.days * (m.direct + fromStore);
          days += m.days;
          need = Math.max(need, fromStore);
          worst = Math.min(worst, (m.direct + fromStore) / 24);
        }
        outputFactor[i] = Math.min(1, served / (24 * days));
        storeNeed[i] = need;
        worstMonth[i] = worst;
      });
      const curves = { outputFactor, storeNeed, worstMonth };
      storeCurves.set(eta, curves);
      return curves;
    };
    const solar = { months, flexUsed, base, annualKWhPerKWp, curvesFor };
    solarCache.set(key, solar);
    solarBySite.set(site, { fraction: cfg.solarDayFraction, solar });
    return solar;
  }

  // ------------------------------------------------------------------ block designs
  // Flexible block: annual energy E (kWh), equipment capex at 24 h nameplate K24 ($), PV $/kWp.
  function flexDesign(solar, energyKWhYr, k24Usd, pvUsdPerKWp) {
    if (!(energyKWhYr > 0)) return { pvKWp: 0, nameplateFactor: 1, fullLoadHoursPerDay: 24, ratio: null, capexScale: 1 };
    const avgKW = energyKWhYr / 8760;
    let best = null;
    R_GRID.forEach((r, i) => {
      const used = solar.flexUsed[i];
      if (!(used > 0)) return;
      const pvKWp = energyKWhYr / used;
      const nameplateFactor = (r * pvKWp) / avgKW;
      const cost = pvKWp * pvUsdPerKWp + k24Usd * nameplateFactor;
      if (!best || cost < best.cost) {
        best = { cost, ratio: r, pvKWp, nameplateFactor, fullLoadHoursPerDay: used / 365 / r };
      }
    });
    return { ...best, capexScale: best.nameplateFactor };
  }

  // Baseload block on one store type: steady load L (kW), units capex K24 ($).
  // minTurndown: every month must hold the load at ≥ this fraction of full rate (night included).
  function baseDesign(solar, loadKW, k24Usd, pvUsdPerKWp, store, minTurndown = DEFAULTS.baseloadMinTurndown) {
    if (!(loadKW > 0)) return { pvKWp: 0, storeKWh: 0, outputFactor: 1, pvPerKW: 0 };
    let best = null;
    const curves = solar.curvesFor(store.roundTrip);
    K_GRID.forEach((k, i) => {
      if (curves.worstMonth[i] < minTurndown - 1e-9) return;
      const outputFactor = curves.outputFactor[i];
      const storeKWh = (curves.storeNeed[i] / store.depthOfDischarge) * loadKW;
      const pvKWp = k * loadKW;
      const cost = (pvKWp * pvUsdPerKWp + storeKWh * store.usdPerKWh + k24Usd) / Math.max(outputFactor, 1e-6);
      if (!best || cost < best.cost) best = { cost, pvKWp, storeKWh, outputFactor, pvPerKW: k };
    });
    // No k on the grid meets the turndown floor (very poor winter sun): take the most PV.
    if (!best) {
      const i = K_GRID.length - 1;
      best = {
        pvKWp: K_GRID[i] * loadKW,
        storeKWh: (curves.storeNeed[i] / store.depthOfDischarge) * loadKW,
        outputFactor: curves.outputFactor[i],
        pvPerKW: K_GRID[i],
        belowTurndown: true,
      };
    }
    return best;
  }

  // ------------------------------------------------------------------ plant design
  // costs: { pvUsdPerKWp, batteryUsdPerKWh, thermalUsdPerKWh, capex24ByClass: {cls: $} } — all already
  // at this year's prices and this plant's size. Returns the cheaper of the two strategies.
  function designPlant(profile, site, sizeKgPerDay, costs, cfgIn) {
    const cfg = mergeCfg(cfgIn);
    const solar = siteSolar(site, cfg);
    const battery = { ...cfg.battery, usdPerKWh: costs.batteryUsdPerKWh ?? cfg.battery.usdPerKWh };
    const thermal = { ...cfg.thermal, usdPerKWh: costs.thermalUsdPerKWh ?? cfg.thermal.usdPerKWh };
    const k24 = costs.capex24ByClass;
    const split = share => {
      const flex = {};
      const base = {};
      for (const [cls, usd] of Object.entries(k24)) {
        const s = share(cls);
        flex[cls] = usd * s;
        base[cls] = usd * (1 - s);
      }
      return { flex, base };
    };
    const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);

    const candidates = [];
    // Strategy A: sun-following flexible units, firmed baseload, buffered intermediates.
    {
      const { flex, base } = split(cls => profile.flexShareByClass[cls] || 0);
      const baseElec = baseDesign(solar, (profile.baseKWh * sizeKgPerDay) / 24, sum(base) * (profile.baseKWh / Math.max(profile.baseKWh + profile.baseThermalKWh, 1e-12)), costs.pvUsdPerKWp, battery, cfg.baseloadMinTurndown);
      const baseHeat = baseDesign(solar, (profile.baseThermalKWh * sizeKgPerDay) / 24, sum(base) * (profile.baseThermalKWh / Math.max(profile.baseKWh + profile.baseThermalKWh, 1e-12)), costs.pvUsdPerKWp, thermal, cfg.baseloadMinTurndown);
      const outputFactor = Math.min(baseElec.outputFactor, baseHeat.outputFactor);
      const flexD = flexDesign(solar, profile.flexKWh * sizeKgPerDay * 365 * outputFactor, sum(flex), costs.pvUsdPerKWp);
      const offHours = Math.max(0, 24 - flexD.fullLoadHoursPerDay);
      let bufferUsd = 0;
      const buffers = [];
      if (profile.hasBase) {
        for (const b of profile.buffers) {
          const kg = b.kgPerKg * sizeKgPerDay * outputFactor * (offHours / 24);
          const prices = costs.bufferUsdPerKg || cfg.bufferUsdPerKg;
          const usd = kg * (prices[b.substance] ?? prices.default);
          bufferUsd += usd;
          buffers.push({ substance: b.substance, kg, usd });
        }
      }
      const capexByClass = {};
      for (const cls of Object.keys(k24)) capexByClass[cls] = flex[cls] * flexD.capexScale + base[cls];
      candidates.push({
        strategy: profile.hasFlex ? 'sun-following' : 'firmed',
        outputFactor,
        pvKWp: flexD.pvKWp + baseElec.pvKWp + baseHeat.pvKWp,
        batteryKWh: baseElec.storeKWh,
        thermalKWh: baseHeat.storeKWh,
        bufferUsd,
        buffers,
        capexByClass,
        flexNameplateFactor: flexD.capexScale,
        flexFullLoadHoursPerDay: profile.hasFlex ? flexD.fullLoadHoursPerDay : null,
      });
    }
    // Strategy B: everything runs 24 h, flexible units included, on PV + storage (no buffers).
    if (profile.hasFlex) {
      const elecKWh = profile.flexKWh + profile.baseKWh;
      const elecShare = elecKWh / Math.max(elecKWh + profile.baseThermalKWh, 1e-12);
      const all = sum(k24);
      const baseElec = baseDesign(solar, (elecKWh * sizeKgPerDay) / 24, all * elecShare, costs.pvUsdPerKWp, battery, cfg.baseloadMinTurndown);
      const baseHeat = baseDesign(solar, (profile.baseThermalKWh * sizeKgPerDay) / 24, all * (1 - elecShare), costs.pvUsdPerKWp, thermal, cfg.baseloadMinTurndown);
      candidates.push({
        strategy: 'firmed',
        outputFactor: Math.min(baseElec.outputFactor, baseHeat.outputFactor),
        pvKWp: baseElec.pvKWp + baseHeat.pvKWp,
        batteryKWh: baseElec.storeKWh,
        thermalKWh: baseHeat.storeKWh,
        bufferUsd: 0,
        buffers: [],
        capexByClass: { ...k24 },
        flexNameplateFactor: 1,
        flexFullLoadHoursPerDay: 24,
      });
    }
    for (const c of candidates) {
      c.storageUsd = c.batteryKWh * battery.usdPerKWh + c.thermalKWh * thermal.usdPerKWh + c.bufferUsd;
      c.capexUsd = sum(c.capexByClass) + c.pvKWp * costs.pvUsdPerKWp + c.storageUsd;
      c.capexPerOutput = c.capexUsd / Math.max(c.outputFactor, 1e-6);
      c.batteryUsd = c.batteryKWh * battery.usdPerKWh;
      c.thermalUsd = c.thermalKWh * thermal.usdPerKWh;
      c.batteryLifeYears = battery.lifeYears;
      c.thermalLifeYears = thermal.lifeYears;
      c.storageFixedOmUsdPerYear = c.batteryUsd * battery.fixedOmFrac + c.thermalUsd * thermal.fixedOmFrac;
    }
    candidates.sort((a, b) => a.capexPerOutput - b.capexPerOutput);
    return { ...candidates[0], alternatives: candidates.map(c => ({ strategy: c.strategy, capexPerOutput: c.capexPerOutput, outputFactor: c.outputFactor })) };
  }

  return { DEFAULTS, UNIT_TECH, mergeCfg, operatingProfile, siteSolar, dayLengthHours, flexDesign, baseDesign, designPlant, R_GRID, K_GRID };
});
