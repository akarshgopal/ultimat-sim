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
    { group: 'finance', key: 'rate', label: 'Discount rate', unit: '%', min: 0, max: 30, step: 0.5, def: pct(D.finance.discountRate),
      hint: 'Return a plant must earn to count as paying back its capital (NPV ≥ 0).' },
    { group: 'build', key: 'land', label: 'Land use per site', unit: '%', min: 0.1, max: 100, step: 0.5, def: pct(D.build.landUseShare),
      hint: 'Share of the land suitable for utility PV around each site (World Bank/ESMAP) that the company may cover.' },
    { group: 'build', key: 'lead', label: 'Build lead time', unit: 'yr', min: 0, max: 10, step: 1, def: D.build.leadTimeYears },
    { group: 'build', key: 'buildStart', label: 'Construction capacity, year 1', unit: '$M/yr', min: 1, max: 1e6, step: 50, def: D.build.initialBuildUsdPerYear / 1e6,
      hint: 'Capex the company can put in the ground in its first year.' },
    { group: 'build', key: 'buildGrowth', label: 'Construction ramp', unit: '%/yr', min: 0, max: 300, step: 5, def: pct(D.build.buildGrowthPerYear),
      hint: 'How fast construction capacity can grow over last year’s actual build.' },
    { group: 'energy', key: 'kwh', label: 'Solar electricity, start year', unit: '$/kWh', min: 0.0001, max: 0.3, step: 0.0005, def: KWH_TODAY,
      hint: 'At 2,000 kWh/kWp·yr; sunnier sites pay less. Moves PV capex and O&M together.' },
    { group: 'energy', key: 'kwhDecline', label: 'Solar price decline', unit: '%/yr', min: 0, max: 30, step: 0.5, def: pct(D.pv.exogenousDeclinePerYear) },
    { group: 'energy', key: 'kwhFloor', label: 'Solar price floor', unit: '$/kWh', min: 0, max: 0.3, step: 0.0005, def: KWH_FLOOR },
    { group: 'energy', key: 'battery', label: 'Battery', unit: '$/kWh', min: 1, max: 2000, step: 5, def: D.utilization.battery.usdPerKWh,
      hint: 'Installed storage cost; batteries keep steady units (kilns, furnaces, synthesis loops) running overnight.' },
    { group: 'energy', key: 'ii', label: 'Cost cap (idiot index)', unit: '×', min: 0, max: 50, step: 0.5, def: 0,
      hint: 'Cap every cost (PV, batteries, electrolyzers, desal, DAC, process plant, stores) at its raw-materials cost × this. 0 = today’s prices.' },
    { group: 'energy', key: 'equip', label: 'Equipment cost', unit: '×', min: 0.01, max: 3, step: 0.05, def: D.equipmentCostMultiplier,
      hint: 'Multiplies electrolyzer, DAC, desal and process capex (not PV or storage).' },
    { group: 'cost', key: 'lrElec', label: 'Electrolyzer learning', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.electrolyzer.learningRate),
      hint: 'Cost drop each time the company’s own installed electrolyzers double (Wright’s law).' },
    { group: 'cost', key: 'lrProc', label: 'Process learning', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.process.learningRate),
      hint: 'Cost drop each time the company’s own installed process plant doubles.' },
    { group: 'cost', key: 'lrDac', label: 'DAC learning', unit: '%', min: 0, max: 50, step: 1, def: pct(D.tech.dac.learningRate),
      hint: 'Cost drop each time the company’s own direct air capture capacity doubles.' },
    { group: 'cost', key: 'scaleExp', label: 'Scale exponent', unit: '', min: 0.3, max: 1, step: 0.01, def: D.scale.exponent,
      hint: 'Plant capex grows as size^this; below 1, bigger plants are cheaper per kg.' },
    { group: 'cost', key: 'scaleFloor', label: 'Scale floor', unit: '×', min: 0, max: 1, step: 0.05, def: D.scale.floorFactor,
      hint: 'Lowest per-kg capex that scaling can reach, as a fraction of the reference plant.' },
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
        landUseShare: s.land / 100,
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
  // A run that a newer scenario supersedes is cancelled by replacing the worker, so quick
  // successive edits do not queue up behind each other.
  let worker = null;
  let workerOk = true;
  function startWorker() {
    if (!workerOk) return null;
    try {
      const w = new Worker('js/sim-worker.js');
      // If the worker cannot start or crashes, fall back to the main thread and re-run.
      w.onerror = () => { workerOk = false; worker = null; runNow(); };
      return w;
    } catch { workerOk = false; return null; } // no workers (e.g. file://): run on the main thread
  }
  worker = startWorker();
  let scenario = defaults();
  let result = null;
  let busy = false;
  let progress = null; // { done, total } years while a run is in flight
  let seq = 0;
  let timer = 0;
  const listeners = new Set();
  const progressListeners = new Set();
  const notify = () => { for (const fn of listeners) fn({ scenario, result, busy, progress, pinned }); };

  // ---------------------------------------------------------------- pinned scenario (comparison)
  // A scenario the user pins as a baseline: { scenario, query, result }. It rides in the URL as
  // vs=<its query> (see urlQuery), and runs in its own worker so it never cancels the current run.
  let pinned = null;
  let pinStale = false;
  let pinWorker = null;
  let pinSeq = 0;
  function runPinned() {
    const id = ++pinSeq;
    const config = toConfig(pinned.scenario);
    const finish = r => {
      if (id !== pinSeq || !pinned) return;
      pinned = { ...pinned, result: r };
      notify();
    };
    if (workerOk) {
      try {
        pinWorker ||= new Worker('js/sim-worker.js');
        const onMessage = ev => {
          if (ev.data.id !== id || ev.data.progress) return;
          pinWorker.removeEventListener('message', onMessage);
          if (ev.data.result) finish(ev.data.result);
        };
        pinWorker.addEventListener('message', onMessage);
        pinWorker.postMessage({ id, config });
        return;
      } catch { /* fall through to the main thread */ }
    }
    setTimeout(() => finish(Company.simulateCompany({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config })), 0);
  }
  function setPinned(s, r) {
    pinned = { scenario: s, query: toQuery(s), result: r || null };
    if (!pinned.result) { if (wanted) runPinned(); else pinStale = true; }
  }
  // The URL query: the current scenario, plus vs=<pinned scenario's query> when one is pinned.
  function urlQuery() {
    const q = toQuery(scenario);
    if (!pinned) return q;
    const vs = new URLSearchParams({ vs: pinned.query }).toString();
    return q ? q + '&' + vs : vs;
  }
  // Labelled differences between two scenarios, for "comparing with …" notes.
  function describeDiff(a, b) {
    const out = [];
    for (const f of FIELDS) if (a[f.key] !== b[f.key]) out.push(`${f.label} ${a[f.key]} → ${b[f.key]}${f.unit ? ' ' + f.unit : ''}`);
    if (a.objective !== b.objective) out.push(`objective ${a.objective} → ${b.objective}`);
    if (JSON.stringify(a.ds || {}) !== JSON.stringify(b.ds || {})) out.push('equipment designs');
    if (a.make !== b.make) out.push(b.make ? 'makes intermediates in-house' : 'buys intermediates');
    if (a.infinite !== b.infinite) out.push(b.infinite ? 'infinite sources only' : 'all sources');
    if (a.loop !== b.loop) out.push(b.loop ? 'Terraform loop on' : 'Terraform loop off');
    if (a.origins.join() !== b.origins.join()) out.push('feed origins');
    if (a.off.join() !== b.off.join()) out.push('pathways switched off');
    return out;
  }

  // Only views that show company-simulation results ask for them (Store.want); elsewhere a
  // scenario change marks the result stale and the run waits until such a view is opened.
  let wanted = false;
  let stale = false;
  function runNow() {
    if (!wanted) {
      stale = true;
      clearTimeout(timer);
      if (busy) { seq++; if (worker) { worker.terminate(); worker = startWorker(); } busy = false; progress = null; }
      notify();
      return;
    }
    stale = false;
    const id = ++seq;
    const config = toConfig(scenario);
    if (busy && worker) { worker.terminate(); worker = startWorker(); } // cancel the superseded run
    busy = true;
    progress = { done: 0, total: config.years };
    notify();
    const started = performance.now();
    const done = r => {
      if (id !== seq) return; // a newer run superseded this one
      result = { ...r, ms: Math.round(performance.now() - started) };
      busy = false;
      progress = null;
      notify();
    };
    if (worker) {
      const w = worker;
      const onMessage = ev => {
        if (ev.data.id !== id) return;
        if (ev.data.progress) {
          if (id === seq) { progress = ev.data.progress; for (const fn of progressListeners) fn(progress); }
          return;
        }
        w.removeEventListener('message', onMessage);
        if (ev.data.error) { workerOk = false; worker = null; runNow(); return; }
        done(ev.data.result);
      };
      w.addEventListener('message', onMessage);
      w.postMessage({ id, config });
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
      return { equip, rows: Company.energyBreakevens({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config }, { sizeMultiple: RANK_SIZE_MULTIPLE }) };
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
    return Company.abundanceScoreboard({ pathways: PATHWAYS, markets: MARKETS, sites: SITES, config }, { sizeMultiple: RANK_SIZE_MULTIPLE });
  }

  // Year-0 opportunity ranking for the current scenario (fast, main thread).
  // One plant size for every year-0 cost the app shows (Abundance, Energy, Pathways, Sites), so the
  // same recipe at the same site has the same cost on every page: 100× the case's reference output.
  const RANK_SIZE_MULTIPLE = 100;
  function rank(sizeMultiple = RANK_SIZE_MULTIPLE) {
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
    get progress() { return progress; },
    // Progress ticks (one per simulated year) go to these listeners only, not to subscribe(), so
    // views do not re-render on every tick.
    onProgress(fn) { progressListeners.add(fn); return () => progressListeners.delete(fn); },
    load(query) {
      scenario = fromQuery(query);
      const vs = new URLSearchParams(query || '').get('vs');
      if (vs == null) { pinned = null; pinSeq++; }
      else if (!pinned || pinned.query !== toQuery(fromQuery(vs))) setPinned(fromQuery(vs), null);
      runNow();
    },
    urlQuery,
    describeDiff,
    // Views that show simulation results call want(true) when mounted (app.js does this from the
    // view's needsSimulation flag); a stale result is then brought up to date.
    want(flag) {
      wanted = Boolean(flag);
      if (!wanted) return;
      if (stale || (!result && !busy)) runNow();
      if (pinned && !pinned.result && pinStale) { pinStale = false; runPinned(); }
    },
    // True when the scenario changed while no view needed the simulation: result is out of date.
    get stale() { return stale; },
    get pinned() { return pinned; },
    // Pin the current scenario (and its result, if current) as the comparison baseline.
    pin() { setPinned({ ...scenario }, busy ? null : result); notify(); },
    unpin() { pinned = null; pinSeq++; notify(); },
    // Make the pinned scenario current and pin the current one, reusing both results.
    swap() {
      if (!pinned) return;
      const prev = pinned;
      setPinned({ ...scenario }, busy ? null : result);
      scenario = prev.scenario;
      if (prev.result) { clearTimeout(timer); seq++; result = prev.result; busy = false; progress = null; notify(); } else runNow();
    },
    update,
    reset() { scenario = defaults(); runNow(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    rank,
    breakevens,
    abundance,
    FRONTIER,
    RANK_SIZE_MULTIPLE,
  });
})();
