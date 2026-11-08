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
  const lcoeOf = capex => Company.solarLcoe({ ...D.pv, capexUsdPerKWp: D.pv.capexUsdPerKWp }, D.finance, capex);
  const KWH_TODAY = round4(lcoeOf(D.pv.capexUsdPerKWp));
  const KWH_FLOOR = round4(lcoeOf(D.pv.floorUsdPerKWp));
  // Presets for the energy and equipment levers.
  const ENERGY_PRESETS = Object.freeze([
    { id: 'today', label: 'Today', kwh: KWH_TODAY, floor: KWH_FLOOR, hint: 'IRENA 2023 utility PV ($758/kW)' },
    { id: '3x', label: '3× cheaper', kwh: round4(KWH_TODAY / 3), floor: round4(KWH_FLOOR / 3), hint: 'record sunbelt PPA territory' },
    { id: '10x', label: '10× cheaper', kwh: round4(KWH_TODAY / 10), floor: round4(KWH_FLOOR / 10), hint: 'the Terraform thesis' },
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
    { group: 'build', key: 'perYear', label: 'Plants per year', unit: 'max', min: 0, max: 200, step: 1, def: D.build.maxPlantsPerYear },
    { group: 'energy', key: 'kwh', label: 'Solar electricity, start year', unit: '$/kWh', min: 0.0001, max: 0.3, step: 0.0005, def: KWH_TODAY,
      hint: 'At 2,000 kWh/kWp·yr; sunnier sites pay less. Moves PV capex and O&M together.' },
    { group: 'energy', key: 'kwhDecline', label: 'Solar price decline', unit: '%/yr', min: 0, max: 30, step: 0.5, def: pct(D.pv.exogenousDeclinePerYear) },
    { group: 'energy', key: 'kwhFloor', label: 'Solar price floor', unit: '$/kWh', min: 0, max: 0.3, step: 0.0005, def: KWH_FLOOR },
    { group: 'energy', key: 'battery', label: 'Battery', unit: '$/kWh', min: 1, max: 2000, step: 5, def: Company.DEFAULTS.utilization.battery.usdPerKWh },
    { group: 'energy', key: 'equip', label: 'Equipment cost', unit: '×', min: 0.01, max: 3, step: 0.05, def: D.equipmentCostMultiplier,
      hint: 'Multiplies electrolyzer, DAC, desal and process capex (not PV or storage).' },
    { group: 'cost', key: 'lrElec', label: 'Electrolyzer learning', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.electrolyzer.learningRate) },
    { group: 'cost', key: 'lrProc', label: 'Process learning', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.process.learningRate) },
    { group: 'cost', key: 'lrDac', label: 'DAC learning', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.dac.learningRate) },
    { group: 'cost', key: 'scaleExp', label: 'Scale exponent', unit: '', min: 0.3, max: 1, step: 0.01, def: D.scale.exponent },
    { group: 'cost', key: 'scaleFloor', label: 'Scale floor', unit: '×', min: 0, max: 1, step: 0.05, def: D.scale.floorFactor },
  ]);
  const FIELD_BY_KEY = Object.fromEntries(FIELDS.map(f => [f.key, f]));
  const ORIGIN_IDS = globalThis.UI.ORIGINS.map(o => o.id);

  function defaults() {
    const s = { objective: D.objective, make: true, infinite: false, origins: ORIGIN_IDS.slice(), off: [] };
    for (const f of FIELDS) s[f.key] = f.def;
    return s;
  }

  function toQuery(s) {
    const d = defaults();
    const q = new URLSearchParams();
    for (const f of FIELDS) if (s[f.key] !== d[f.key]) q.set(f.key, String(s[f.key]));
    if (s.objective !== d.objective) q.set('objective', s.objective);
    if (!s.make) q.set('buy', '1');
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
        maxPlantsPerYear: Math.round(s.perYear),
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
  } catch {
    worker = null;
  }
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

  // Year-0 opportunity ranking for the current scenario (fast, main thread).
  // Energy break-even ($/kWh) per pathway for the current scenario at several equipment multipliers.
  function breakevens(equipMultipliers = [1, 0.5, 0.25, 0.1]) {
    return equipMultipliers.map(equip => {
      const config = toConfig(scenario);
      config.build.allowPathways = null;
      config.equipmentCostMultiplier = equip;
      return { equip, rows: Company.energyBreakevens({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config }) };
    });
  }

  function rank(sizeMultiple = 10) {
    const config = toConfig(scenario);
    config.build.allowPathways = null; // rank every pathway; views mark excluded ones
    return Company.rankOpportunities({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config }, { sizeMultiple });
  }

  globalThis.Store = Object.freeze({
    FIELDS, FIELD_BY_KEY, PATHWAYS, MARKETS, SITES, ENERGY_PRESETS, EQUIPMENT_PRESETS,
    pathwayById: new Map(PATHWAYS.map(p => [p.id, p])),
    siteById: new Map(SITES.map(s => [s.id, s])),
    defaults, toQuery, fromQuery, toConfig, pathwayAllowed,
    get scenario() { return scenario; },
    get result() { return result; },
    get busy() { return busy; },
    load(query) { scenario = fromQuery(query); runNow(); },
    update,
    reset() { scenario = defaults(); runNow(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    rank,
    breakevens,
  });
})();
