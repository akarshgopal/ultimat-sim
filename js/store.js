// Scenario store shared by every view. Holds the company scenario (flat, URL-friendly keys),
// maps it to engine config, and runs the simulation in a Web Worker (main-thread fallback,
// e.g. when opened from file://). Views subscribe; the latest result is cached.
// Exposes globalThis.Store.
(() => {
  'use strict';
  const Company = globalThis.FoundryCompany;
  const D = Company.DEFAULTS;
  const PATHWAYS = globalThis.FoundryPathways.PATHWAYS;
  const MARKETS = globalThis.FoundryMarkets.MARKETS;
  const SITES = globalThis.FoundrySites.SITES;
  const pct = v => Math.round(v * 1000) / 10;
  const round4 = v => Math.round(v * 1e4) / 1e4;
  // Solar electricity is quoted in $/kWh at the reference yield (2,000 kWh/kWp·yr); a site's own
  // price scales with its sun. Converted to PV capex with the scenario's discount rate.
  const lcoeOf = capex => Company.solarLcoe(D.pv, D.finance, capex);
  const KWH_TODAY = round4(lcoeOf(D.pv.capexUsdPerKWp));
  const KWH_FLOOR = round4(lcoeOf(D.pv.floorUsdPerKWp));
  // Presets for the energy and equipment levers.
  const ENERGY_PRESETS = Object.freeze([
    { id: 'today', label: 'Today', kwh: KWH_TODAY, floor: KWH_FLOOR, hint: 'IRENA 2023 utility PV ($758/kW)' },
    { id: '3x', label: '3× cheaper', kwh: round4(KWH_TODAY / 3), floor: round4(KWH_FLOOR / 3), hint: 'record sunbelt PPA territory' },
    { id: '10x', label: '10× cheaper', kwh: round4(KWH_TODAY / 10), floor: round4(KWH_FLOOR / 10), hint: 'the Terraform thesis' },
  ]);
  // Unit designs registered by engine/designs/*.js (engine/designs/README.md). A scenario's `ds` holds
  // the active ones: { <design id>: { preset, overrides } }.
  const DESIGNS = globalThis.FoundryDesigns || {};
  function designParams(id, entry) {
    const api = DESIGNS[id];
    if (!entry || !api) return null;
    return { ...(api.PRESETS[entry.preset]?.params || {}), ...(entry.overrides || {}) };
  }
  // config.designs.units for a scenario's active designs.
  function designUnits(ds) {
    const units = {};
    for (const [id, entry] of Object.entries(ds || {})) {
      const params = designParams(id, entry);
      if (params) Object.assign(units, DESIGNS[id].simulatorOverride(params));
    }
    return units;
  }
  function cleanDesigns(raw) {
    const ds = {};
    for (const [id, entry] of Object.entries(raw || {})) {
      if (entry && typeof entry === 'object' && DESIGNS[id]?.PRESETS?.[entry.preset]) ds[id] = { preset: entry.preset, overrides: entry.overrides || {} };
    }
    return ds;
  }

  // Idiot-index floors from the bill-of-materials dataset (data/bom.js).
  const BOM = globalThis.FoundryBom;
  const BOM_FLOORS = Object.freeze(BOM ? BOM.floors() : {});
  // Live bill of materials for the Terraform loop (floors re-priced as the company's supply lowers
  // commodity prices).
  const BOM_LIVE = BOM ? Object.freeze({
    commodities: Object.fromEntries(Object.entries(BOM.COMMODITIES).map(([m, c]) => [m, c.usdPerKg])),
    classes: Object.fromEntries(Object.entries(BOM.CLASSES).map(([cls, c]) => [cls, {
      lines: c.lines, todayUsdPerUnit: c.todayUsdPerUnit, absolute: 'materialsUsdPerUnit' in BOM_FLOORS[cls],
    }])),
  }) : null;
  const MARGIN_PRESETS = Object.freeze([
    { id: 'today', label: 'Today', ii: 0, hint: 'today’s prices (no squeeze)' },
    { id: '5', label: '5× materials', ii: 5 },
    { id: '3', label: '3×', ii: 3 },
    { id: '2', label: '2×', ii: 2 },
    { id: '1.5', label: '1.5×', ii: 1.5, hint: 'margins squashed: materials plus a thin conversion cost' },
  ]);
  const EQUIPMENT_PRESETS = Object.freeze([
    { id: '1', label: '×1', equip: 1, hint: 'recipe screening packs' },
    { id: '0.5', label: '×0.5', equip: 0.5 },
    { id: '0.25', label: '×0.25', equip: 0.25 },
    { id: '0.1', label: '×0.1', equip: 0.1, hint: 'mass-produced, low-utilization hardware' },
  ]);

  // Scenario fields. group: where the Company view shows them. key: URL parameter.
  const FIELDS = Object.freeze([
    { group: 'goal', key: 'share', label: 'Max share of a world market', unit: '%', min: 0.1, max: 100, step: 0.5, def: pct(D.build.maxMarketShare),
      hint: 'The main abundance lever. Above it, prices fall with the company’s share and NPV ≥ 0 decides.' },
    { group: 'finance', key: 'years', label: 'Years', unit: 'yr', min: 1, max: 60, step: 1, def: D.years },
    { group: 'finance', key: 'equity', label: 'Start equity', unit: '$M', min: 1, max: 100000, step: 1, def: D.finance.initialEquityUsd / 1e6 },
    { group: 'finance', key: 'debt', label: 'Debt share of capex', unit: '%', min: 0, max: 90, step: 5, def: pct(D.finance.debtFraction) },
    { group: 'finance', key: 'rate', label: 'Discount rate', unit: '%', min: 0, max: 30, step: 0.5, def: pct(D.finance.discountRate) },
    { group: 'build', key: 'pvSite', label: 'Max PV per site', unit: 'GWp', min: 0.1, max: 1000, step: 1, def: D.build.maxPvGWpPerSite },
    { group: 'build', key: 'lead', label: 'Build lead time', unit: 'yr', min: 0, max: 10, step: 1, def: D.build.leadTimeYears },
    { group: 'build', key: 'buildStart', label: 'Construction capacity, year 1', unit: '$M/yr', min: 1, max: 1e6, step: 50, def: D.build.initialBuildUsdPerYear / 1e6,
      hint: 'Capex the company can put in the ground in its first year.' },
    { group: 'build', key: 'buildGrowth', label: 'Construction ramp', unit: '%/yr', min: 0, max: 300, step: 5, def: pct(D.build.buildGrowthPerYear),
      hint: 'How fast construction capacity can grow over last year’s actual build.' },
    { group: 'energy', key: 'kwh', label: 'Solar electricity, start year', unit: '$/kWh', min: 0.0001, max: 0.3, step: 0.0005, def: KWH_TODAY,
      hint: 'At 2,000 kWh/kWp·yr; sunnier sites pay less. Moves PV capex and O&M together.' },
    { group: 'energy', key: 'kwhDecline', label: 'Solar price decline', unit: '%/yr', min: 0, max: 30, step: 0.5, def: pct(D.pv.exogenousDeclinePerYear) },
    { group: 'energy', key: 'kwhFloor', label: 'Solar price floor', unit: '$/kWh', min: 0, max: 0.3, step: 0.0005, def: KWH_FLOOR },
    { group: 'energy', key: 'battery', label: 'Battery', unit: '$/kWh', min: 1, max: 2000, step: 5, def: D.utilization.battery.usdPerKWh },
    { group: 'energy', key: 'ii', label: 'Target idiot index', unit: '×', min: 0, max: 50, step: 0.5, def: 0,
      hint: 'Cap every cost (PV, batteries, electrolyzers, desal, DAC, process plant, stores) at its raw-materials cost × this. 0 = today’s prices.' },
    { group: 'energy', key: 'equip', label: 'Equipment cost', unit: '×', min: 0.01, max: 3, step: 0.05, def: D.equipmentCostMultiplier,
      hint: 'Multiplies electrolyzer, DAC, desal and process capex (not PV or storage).' },
    { group: 'cost', key: 'lrElec', label: 'Electrolyzer learning', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.electrolyzer.learningRate) },
    { group: 'cost', key: 'lrProc', label: 'Process learning', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.process.learningRate) },
    { group: 'cost', key: 'lrDac', label: 'DAC learning', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.dac.learningRate) },
    { group: 'cost', key: 'scaleExp', label: 'Scale exponent', unit: '', min: 0.3, max: 1, step: 0.01, def: D.scale.exponent },
    { group: 'cost', key: 'scaleFloor', label: 'Scale floor', unit: '×', min: 0, max: 1, step: 0.05, def: D.scale.floorFactor },
  ]);
  const ORIGIN_IDS = globalThis.UI.ORIGINS.map(o => o.id);

  function defaults() {
    const s = { objective: D.objective, make: true, infinite: false, loop: true, origins: ORIGIN_IDS.slice(), off: [], ds: {} };
    for (const f of FIELDS) s[f.key] = f.def;
    return s;
  }

  function toQuery(s) {
    const d = defaults();
    const q = new URLSearchParams();
    for (const f of FIELDS) if (s[f.key] !== d[f.key]) q.set(f.key, String(s[f.key]));
    if (s.objective !== d.objective) q.set('objective', s.objective);
    if (!s.make) q.set('buy', '1');
    if (!s.loop) q.set('noloop', '1');
    if (Object.keys(s.ds || {}).length) q.set('ds', JSON.stringify(s.ds));
    if (s.infinite) q.set('infinite', '1');
    if (s.origins.length !== d.origins.length) q.set('origins', s.origins.join(','));
    if (s.off.length) q.set('off', s.off.join(','));
    return q.toString();
  }

  function fromQuery(query) {
    const s = defaults();
    const q = new URLSearchParams(query || '');
    for (const f of FIELDS) {
      if (!q.has(f.key)) continue;
      const v = Number(q.get(f.key));
      if (Number.isFinite(v)) s[f.key] = Math.min(f.max, Math.max(f.min, v));
    }
    if (['abundance', 'profit'].includes(q.get('objective'))) s.objective = q.get('objective');
    s.make = q.get('buy') !== '1';
    s.loop = q.get('noloop') !== '1';
    try {
      if (q.has('ds')) s.ds = cleanDesigns(JSON.parse(q.get('ds')));
    } catch { /* ignore malformed designs */ }
    s.infinite = q.get('infinite') === '1';
    if (q.has('origins')) {
      const ids = new Set(q.get('origins').split(','));
      s.origins = ORIGIN_IDS.filter(id => ids.has(id));
    }
    if (q.has('off')) {
      const known = new Set(PATHWAYS.map(p => p.id));
      s.off = q.get('off').split(',').filter(id => known.has(id));
    }
    return s;
  }

  function pathwayAllowed(pathway, s) {
    if (s.off.includes(pathway.id)) return false;
    const origins = new Set(s.origins);
    return (pathway.feeds || []).every(feed => origins.has(feed.origin));
  }

  function toConfig(s) {
    return {
      objective: s.objective,
      years: Math.round(s.years),
      finance: { initialEquityUsd: s.equity * 1e6, debtFraction: s.debt / 100, discountRate: s.rate / 100 },
      build: {
        maxMarketShare: s.share / 100,
        maxPvGWpPerSite: s.pvSite,
        leadTimeYears: Math.round(s.lead),
        initialBuildUsdPerYear: s.buildStart * 1e6,
        buildGrowthPerYear: s.buildGrowth / 100,
        allowPathways: PATHWAYS.filter(p => pathwayAllowed(p, s)).map(p => p.id),
        infiniteSourcesOnly: s.infinite,
      },
      integration: { enabled: s.make || s.infinite },
      pv: {
        capexUsdPerKWp: Company.pvCapexFromLcoe(s.kwh, D.pv, { discountRate: s.rate / 100 }),
        floorUsdPerKWp: Company.pvCapexFromLcoe(s.kwhFloor, D.pv, { discountRate: s.rate / 100 }),
        exogenousDeclinePerYear: s.kwhDecline / 100,
      },
      equipmentCostMultiplier: s.equip,
      idiotIndex: { target: s.ii > 0 ? s.ii : null, floors: BOM_FLOORS, bom: s.loop ? BOM_LIVE : null },
      designs: { units: designUnits(s.ds) },
      utilization: { battery: { usdPerKWh: s.battery } },
      tech: {
        electrolyzer: { learningRate: s.lrElec / 100 },
        process: { learningRate: s.lrProc / 100 },
        dac: { learningRate: s.lrDac / 100 },
      },
      scale: { exponent: s.scaleExp, floorFactor: s.scaleFloor },
    };
  }

  // ---------------------------------------------------------------- simulation
  let worker = null;
  try {
    worker = new Worker('js/sim-worker.js');
    // If the worker cannot start or crashes, fall back to the main thread and re-run.
    worker.onerror = () => { worker = null; runNow(); };
  } catch { /* no workers (e.g. file://): run on the main thread */ }
  let scenario = defaults();
  let result = null;
  let busy = false;
  let seq = 0;
  let timer = 0;
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) fn({ scenario, result, busy }); };

  function runNow() {
    const id = ++seq;
    const config = toConfig(scenario);
    busy = true;
    notify();
    const started = performance.now();
    const done = r => {
      if (id !== seq) return; // a newer run superseded this one
      result = { ...r, ms: Math.round(performance.now() - started) };
      busy = false;
      notify();
    };
    if (worker) {
      const onMessage = ev => {
        if (ev.data.id !== id) return;
        worker.removeEventListener('message', onMessage);
        if (ev.data.error) { worker = null; runNow(); return; }
        done(ev.data.result);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ id, config });
    } else {
      setTimeout(() => done(Company.simulateCompany({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config })), 0);
    }
  }

  function update(patch, { immediate = false } = {}) {
    scenario = { ...scenario, ...patch };
    clearTimeout(timer);
    if (immediate) runNow(); else timer = setTimeout(runNow, 200);
    notify();
  }

  // Energy break-even ($/kWh) per pathway for the current scenario at several equipment multipliers.
  function breakevens(equipMultipliers = [1, 0.5, 0.25, 0.1]) {
    return equipMultipliers.map(equip => {
      const config = toConfig(scenario);
      config.build.allowPathways = null;
      config.equipmentCostMultiplier = equip;
      return { equip, rows: Company.energyBreakevens({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config }) };
    });
  }

  // The frontier: what the program aims at. 10× cheaper solar, every cost squeezed to 1.5× its raw
  // materials, every registered design at its lean preset. Applied on top of the current scenario.
  const FRONTIER = Object.freeze({
    kwh: ENERGY_PRESETS[2].kwh, kwhFloor: ENERGY_PRESETS[2].floor, ii: 1.5,
    ds: Object.fromEntries(Object.keys(DESIGNS).filter(id => DESIGNS[id].PRESETS.lean).map(id => [id, { preset: 'lean', overrides: {} }])),
  });

  // Abundance scoreboard (year 0) for a scenario; by default the current one.
  function abundance(s = scenario) {
    const config = toConfig(s);
    config.build.allowPathways = null;
    return Company.abundanceScoreboard({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config });
  }

  // Year-0 opportunity ranking for the current scenario (fast, main thread).
  function rank(sizeMultiple = 10) {
    const config = toConfig(scenario);
    config.build.allowPathways = null; // rank every pathway; views mark excluded ones
    return Company.rankOpportunities({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config }, { sizeMultiple });
  }

  globalThis.Store = Object.freeze({
    FIELDS, PATHWAYS, MARKETS, SITES, ENERGY_PRESETS, EQUIPMENT_PRESETS, MARGIN_PRESETS, BOM,
    DESIGNS, designParams,
    pathwayById: new Map(PATHWAYS.map(p => [p.id, p])),
    siteById: new Map(SITES.map(s => [s.id, s])),
    defaults, toQuery, toConfig, pathwayAllowed,
    get scenario() { return scenario; },
    get result() { return result; },
    get busy() { return busy; },
    load(query) { scenario = fromQuery(query); runNow(); },
    update,
    reset() { scenario = defaults(); runNow(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    rank,
    breakevens,
    abundance,
    FRONTIER,
  });
})();
