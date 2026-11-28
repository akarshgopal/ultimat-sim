// Plant design layer: one recipe at one site and size, as a P&ID-style package plus a TEA.
//
// Input is what the simulator already knows about a plant — the recipe's solved flowsheet
// (data/pathways.js), the site-specific solar design (engine/utilization.js) and the plant's
// economics (FoundryCompany.evaluatePlant) — and this module only re-presents it:
//   equipment   — every flowsheet unit, tagged (P-101, EL-102, R-104…), with its operating mode on
//                 solar, nameplate throughput and power, and its share of the plant's installed capex;
//                 plus the PV field, battery, heat store, intermediate buffers and captive suppliers;
//   streams     — every material/heat edge, numbered, with average and design (nameplate) flow,
//                 phase and composition; a buffer splits its line into an upstream (sun-following)
//                 and a downstream (steady) stream;
//   instruments — a typical control scheme per unit type (indicative, not a HAZOP'd design);
//   tea         — capex by item, opex and revenue lines, levelized cost per kg by driver, the
//                 discounted cash flow, NPV, IRR, payback, and a one-at-a-time sensitivity.
// Every capex, opex and revenue line sums exactly to the evaluatePlant totals, so the TEA is the
// simulator's own number, itemized. Pure functions; no DOM.
(function exposePlantDesign(root, factory) {
  const node = typeof require === 'function';
  const api = factory(
    node ? require('./utilization') : root.FoundryUtilization,
    node ? require('./feed-conditions') : root.FoundryFeedConditions,
    // Site climate for feed conditions: always in Node; in the browser when data/site-climate.js is loaded.
    () => (node ? require('../data/site-climate.js').PLACES : root.FoundrySiteClimate?.PLACES),
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoundryPlantDesign = api;
})(globalThis, (Utilization, FeedConditions, climatePlaces) => {
  'use strict';

  // ------------------------------------------------------------------ unit catalogue
  // Flowsheet unit → P&ID symbol, tag prefix, equipment type and the control loops it typically carries.
  //   symbol: pump | compressor | electrolyzer | column | membrane | reactor | kiln | furnace | contactor | package
  //   loops:  instrument letter codes (ISA 5.1) with their service.
  //   T, P:   typical operating temperature and pressure of that equipment type, from the standard
  //           process literature (screening ranges). The plant models themselves carry no operating
  //           conditions (every solved stream sits at 25 °C, 1 bar), so these are a design basis to
  //           read the drawing by, not model outputs.
  const UNIT_TYPES = Object.freeze({
    'intake-pump': { symbol: 'pump', prefix: 'P', type: 'Centrifugal pump (VFD)', T: 'ambient', P: '2–5 bar discharge', loops: [['FIC', 'intake flow, VFD speed'], ['PI', 'discharge pressure']] },
    'gas-blower': { symbol: 'compressor', prefix: 'K', type: 'Blower', T: 'ambient', P: '~1.05 bar', loops: [['FIC', 'air flow, VFD speed'], ['PI', 'discharge pressure']] },
    swro: { symbol: 'membrane', prefix: 'M', type: 'Reverse-osmosis train', T: 'ambient', P: '55–70 bar feed', loops: [['FIC', 'feed flow'], ['PIC', 'HP feed pressure'], ['AIT', 'permeate conductivity']] },
    electrolyzer: { symbol: 'electrolyzer', prefix: 'EL', type: 'Water electrolyzer stack', T: '50–80 °C', P: '1–30 bar', loops: [['JIC', 'stack power, tracks available PV'], ['TIC', 'stack temperature'], ['PIC', 'H₂ outlet pressure'], ['AIT', 'H₂ in O₂ (safety)']] },
    'chlor-alkali': { symbol: 'electrolyzer', prefix: 'EL', type: 'Membrane chlor-alkali cells', T: '85–90 °C', P: 'atmospheric', loops: [['JIC', 'cell current'], ['TIC', 'cell temperature'], ['AIT', 'caustic strength']] },
    'copper-ew': { symbol: 'electrolyzer', prefix: 'EL', type: 'Electrowinning tankhouse', T: '40–50 °C', P: 'atmospheric', loops: [['JIC', 'cell current'], ['TIC', 'electrolyte temperature'], ['LIC', 'cell level']] },
    'aluminium-smelter': { symbol: 'electrolyzer', prefix: 'EL', type: 'Hall–Héroult potline', T: '940–980 °C', P: 'atmospheric', loops: [['JIC', 'line current'], ['TIC', 'bath temperature'], ['AIC', 'alumina feed (resistance)']] },
    asu: { symbol: 'column', prefix: 'C', type: 'Air separation unit', T: '−196 to −175 °C', P: '5–6 bar', loops: [['FIC', 'air feed'], ['AIC', 'N₂ purity'], ['PIC', 'column pressure']] },
    dac: { symbol: 'contactor', prefix: 'AB', type: 'Direct air capture contactor', T: 'ambient; regen. 80–120 °C', P: 'atmospheric', loops: [['FIC', 'air flow'], ['TIC', 'regeneration temperature'], ['AIT', 'CO₂ purity']] },
    'dac-solid': { symbol: 'contactor', prefix: 'AB', type: 'Solid-sorbent DAC contactor', T: 'ambient; regen. 80–120 °C', P: 'atm.; vacuum desorption', loops: [['FIC', 'air flow'], ['TIC', 'desorption temperature'], ['AIT', 'CO₂ purity']] },
    'brine-minerals': { symbol: 'column', prefix: 'C', type: 'Brine mineral separation (DLE, crystallizers)', T: '20–60 °C', P: 'atmospheric', loops: [['FIC', 'brine feed'], ['LIC', 'crystallizer level'], ['AIT', 'Li⁺ in eluate']] },
    'bromine-recovery': { symbol: 'column', prefix: 'C', type: 'Bromine stripping tower', T: '90–100 °C', P: 'atmospheric', loops: [['FIC', 'brine feed'], ['FFIC', 'Cl₂ : brine ratio'], ['TIC', 'stripper temperature']] },
    'ree-chromatography': { symbol: 'column', prefix: 'C', type: 'Chromatographic separation train', T: 'ambient–60 °C', P: '2–10 bar', loops: [['FIC', 'eluent flow'], ['AIT', 'fraction cut (online assay)']] },
    'ree-sx': { symbol: 'column', prefix: 'C', type: 'Solvent-extraction mixer-settlers', T: 'ambient–40 °C', P: 'atmospheric', loops: [['FFIC', 'aqueous : organic ratio'], ['AIC', 'pH'], ['LIC', 'settler interface']] },
    'iac-leach': { symbol: 'reactor', prefix: 'R', type: 'Leach tanks', T: 'ambient', P: 'atmospheric', loops: [['AIC', 'pH'], ['TIC', 'leach temperature'], ['LIC', 'tank level']] },
    'bayer-alumina': { symbol: 'reactor', prefix: 'R', type: 'Bayer digester and calciner', T: '140–250 °C; calcining ~1000 °C', P: '5–35 bar', loops: [['TIC', 'digestion temperature'], ['PIC', 'digester pressure'], ['FFIC', 'caustic : bauxite ratio']] },
    ammonia: { symbol: 'reactor', prefix: 'R', type: 'Haber-Bosch synthesis loop', T: '400–500 °C', P: '150–250 bar', loops: [['FFIC', 'H₂ : N₂ ratio (3 : 1)'], ['TIC', 'converter bed temperature'], ['PIC', 'loop pressure'], ['LIC', 'NH₃ separator level']] },
    methanol: { symbol: 'reactor', prefix: 'R', type: 'Methanol synthesis loop', T: '220–280 °C', P: '50–100 bar', loops: [['FFIC', 'H₂ : CO₂ ratio'], ['TIC', 'reactor temperature'], ['PIC', 'loop pressure'], ['LIC', 'crude methanol level']] },
    sabatier: { symbol: 'reactor', prefix: 'R', type: 'Sabatier methanation reactor', T: '250–400 °C', P: '1–20 bar', loops: [['FFIC', 'H₂ : CO₂ ratio (4 : 1)'], ['TIC', 'bed temperature'], ['AIT', 'CH₄ purity']] },
    'ft-liquids': { symbol: 'reactor', prefix: 'R', type: 'Fischer-Tropsch reactor', T: '200–240 °C', P: '20–40 bar', loops: [['FFIC', 'H₂ : CO ratio'], ['TIC', 'reactor temperature'], ['PIC', 'reactor pressure']] },
    mto: { symbol: 'reactor', prefix: 'R', type: 'Methanol-to-olefins reactor', T: '400–500 °C', P: '1–3 bar', loops: [['FIC', 'methanol feed'], ['TIC', 'reactor temperature'], ['AIT', 'olefin selectivity']] },
    urea: { symbol: 'reactor', prefix: 'R', type: 'Urea synthesis and granulation', T: '180–200 °C', P: '140–160 bar', loops: [['FFIC', 'NH₃ : CO₂ ratio (2 : 1)'], ['TIC', 'reactor temperature'], ['PIC', 'synthesis pressure']] },
    'hydrogen-dri': { symbol: 'furnace', prefix: 'F', type: 'H₂ shaft furnace (DRI)', T: '800–1000 °C', P: '1–8 bar', loops: [['FIC', 'reducing gas flow'], ['TIC', 'gas preheat temperature'], ['AIT', 'top-gas H₂O'], ['WIC', 'pellet feed rate']] },
    'pellet-plant': { symbol: 'kiln', prefix: 'F', type: 'Pelletizing and induration', T: '1250–1350 °C', P: 'atmospheric', loops: [['WIC', 'concentrate feed rate'], ['TIC', 'induration temperature']] },
    cement: { symbol: 'kiln', prefix: 'F', type: 'Electric clinker kiln', T: '1400–1450 °C', P: 'atmospheric', loops: [['WIC', 'raw meal feed rate'], ['TIC', 'burning-zone temperature'], ['AIT', 'free lime']] },
    'float-glass': { symbol: 'furnace', prefix: 'F', type: 'Electric float-glass furnace', T: '1500–1600 °C', P: 'atmospheric', loops: [['WIC', 'batch feed rate'], ['TIC', 'melt temperature'], ['LIC', 'glass level']] },
    'mg-si': { symbol: 'furnace', prefix: 'F', type: 'Submerged-arc furnace', T: '~2000 °C', P: 'atmospheric', loops: [['JIC', 'electrode power'], ['WIC', 'charge feed rate'], ['TIC', 'tap temperature']] },
    polysilicon: { symbol: 'reactor', prefix: 'R', type: 'Siemens CVD reactors', T: '1100–1150 °C', P: '1–6 bar', loops: [['JIC', 'rod heating power'], ['FFIC', 'H₂ : TCS ratio'], ['TIC', 'rod temperature']] },
    'titanium-kroll': { symbol: 'reactor', prefix: 'R', type: 'Kroll reduction retorts', T: '800–900 °C', P: 'slight argon overpressure', loops: [['FFIC', 'TiCl₄ : Mg feed'], ['TIC', 'retort temperature'], ['PIC', 'argon blanket pressure']] },
    bioforge: { symbol: 'reactor', prefix: 'R', type: 'Bioreactor train', T: '30–37 °C', P: 'atmospheric', loops: [['TIC', 'broth temperature'], ['AIC', 'pH'], ['AIC', 'dissolved O₂']] },
    'pv-module': { symbol: 'package', prefix: 'PK', type: 'PV module line', T: '~150 °C lamination', P: 'atmospheric', loops: [['JIC', 'line power']] },
  });
  const DEFAULT_TYPE = Object.freeze({ T: null, P: null, symbol: 'package', prefix: 'PK', type: 'Process package', loops: [['FIC', 'feed flow'], ['TIC', 'process temperature']] });
  const typeOf = unit => UNIT_TYPES[unit] || DEFAULT_TYPE;

  // Fluid codes for line numbers, by dominant substance.
  const FLUID = { H2: 'HY', O2: 'OX', N2: 'NI', CO2: 'CD', NH3: 'AM', CH4: 'NG', CH3OH: 'ME', Cl2: 'CL', NaOH: 'CA', Br2: 'BR2' };
  const IONS = /^(Na\+|Cl-|Mg\+2|Ca\+2|K\+|SO4-2|Br-|Li\+|B)$/;
  function fluidCode(edge) {
    if (edge.kind === 'heat') return 'HT';
    const subs = edge.substances || [];
    const total = Number(edge.kgPerKg) || subs.reduce((s, [, m]) => s + m, 0) || 1;
    const top = subs[0]?.[0];
    const frac = sub => (subs.find(([s]) => s === sub)?.[1] || 0) / total;
    if (frac('N2') > 0.15 && frac('O2') > 0.15) return 'AR';
    if (top === 'H2O') {
      const ions = subs.filter(([s]) => IONS.test(s)).reduce((s, [, m]) => s + m, 0) / total;
      return ions > 0.05 ? 'BR' : ions > 0.005 ? 'SW' : 'PW';
    }
    if (FLUID[top]) return FLUID[top];
    return edge.phase === 'gas' ? 'PG' : edge.phase === 'solid' ? 'PS' : 'PL';
  }
  const PHASE_GUESS = { H2: 'gas', O2: 'gas', N2: 'gas', CO2: 'gas', CH4: 'gas', Ar: 'gas', H2O: 'liquid', NH3: 'liquid', CH3OH: 'liquid' };
  const phaseOf = edge => (edge.kind === 'heat' ? 'heat' : edge.phase || PHASE_GUESS[edge.substances?.[0]?.[0]] || 'mixed');

  // ------------------------------------------------------------------ finance helpers
  function annuityFactor(rate, years) {
    if (!(years > 0)) return 0;
    if (!(rate > 0)) return years;
    return (1 - (1 + rate) ** -years) / rate;
  }
  const npvAt = (rate, flows) => flows.reduce((s, cf, t) => s + cf / (1 + rate) ** t, 0);
  // Internal rate of return by bisection on [-0.99, 10]; null when the flows never change sign.
  function irr(flows) {
    if (!flows.some(f => f < 0) || !flows.some(f => f > 0)) return null;
    let lo = -0.99;
    let hi = 10;
    let fLo = npvAt(lo, flows);
    const fHi = npvAt(hi, flows);
    if (fLo * fHi > 0) return null;
    for (let i = 0; i < 200; i += 1) {
      const mid = (lo + hi) / 2;
      const f = npvAt(mid, flows);
      if (Math.abs(f) < 1e-9 * Math.max(1, Math.abs(flows[0]))) return mid;
      if (f * fLo > 0) { lo = mid; fLo = f; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // ------------------------------------------------------------------ the package
  // opts: { pathway, ev (evaluatePlant result), site, cfg (merged company config),
  //         evaluate?(pathwayId, sizeKgPerDay) → evaluatePlant result at the same site and year
  //                    (used for captive suppliers), priceOf?(product, fallbackUsdPerKg, kgPerYear) }
  function designPackage(opts) {
    const { pathway, ev, site, cfg } = opts;
    const fs = pathway.flowsheet || { nodes: [], edges: [] };
    const size = ev.sizeKgPerDay;
    const u = ev.utilization;
    const firmed = !u || u.strategy === 'firmed';
    const nameplate = u && !firmed ? u.flexNameplateFactor || 1 : 1;
    const outputFactor = u ? u.outputFactor : 1;
    const util = Utilization.mergeCfg(cfg.utilization || Utilization.DEFAULTS);
    const designUnits = cfg.designs?.units || {};
    const profile = u ? Utilization.operatingProfile(pathway, util, designUnits) : null;
    const flexible = new Set(util.flexibleUnits);
    const thermal = new Set(util.thermalUnits);
    const turndownDefault = util.baseloadMinTurndown;

    // ---- equipment from flowsheet converters
    const byId = new Map(fs.nodes.map(n => [n.id, n]));
    const converters = fs.nodes.filter(n => n.kind === 'converter');
    const modeOf = n => {
      const d = designUnits[n.unit];
      const flex = d?.flexible === true ? true : d?.flexible === false ? false : flexible.has(n.unit);
      if (!u) return 'steady';
      if (firmed) return 'firmed';
      return flex ? 'sun-following' : 'steady';
    };
    const rateFactor = new Map(); // node id → design rate ÷ (size / 24 h)
    for (const n of converters) rateFactor.set(n.id, modeOf(n) === 'sun-following' ? nameplate : 1);

    // Topological order (longest path from the sources over material/heat edges, recycles ignored)
    // numbers the equipment upstream to downstream.
    const flowEdges = fs.edges.filter(e => e.kind !== 'electricity' && byId.has(e.from) && byId.has(e.to));
    const order = topoOrder(fs.nodes.filter(n => n.kind !== 'electricity' && n.kind !== 'bus'), flowEdges);
    const rank = new Map(order.map((id, i) => [id, i]));
    converters.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));

    let seq = 100;
    const tagOf = new Map();
    const equipment = [];
    const loopNo = new Map();
    for (const n of converters) {
      seq += 1;
      const t = typeOf(n.unit);
      const tag = `${t.prefix}-${seq}`;
      tagOf.set(n.id, tag);
      loopNo.set(n.id, seq);
      const mode = modeOf(n);
      const inKg = flowEdges.filter(e => e.to === n.id && e.kind === 'material').reduce((s, e) => s + (Number(e.kgPerKg) || 0), 0);
      const outKg = flowEdges.filter(e => e.from === n.id && e.kind === 'material').reduce((s, e) => s + (Number(e.kgPerKg) || 0), 0);
      const kWhPerKg = (Number(n.kWhPerKg) || 0) * (util.unitEnergyScale?.[n.unit] ?? 1) * (Number(designUnits[n.unit]?.energyFactor) > 0 ? designUnits[n.unit].energyFactor : 1);
      const td = Number(designUnits[n.unit]?.minTurndown);
      equipment.push({
        tag, nodeId: n.id, unit: n.unit, service: n.label, type: t.type, symbol: t.symbol,
        conditions: t.T || t.P ? { T: t.T, P: t.P } : null,
        cls: Utilization.UNIT_TECH[n.unit] || 'process',
        mode,
        storeKind: mode === 'steady' || mode === 'firmed' ? (thermal.has(n.unit) || designUnits[n.unit]?.thermal === true ? 'heat store' : 'battery') : null,
        minTurndown: mode === 'sun-following' ? 0 : (td >= 0 && td <= 1 ? td : turndownDefault),
        designed: Boolean(designUnits[n.unit]),
        throughputKgPerH: { average: Math.max(inKg, outKg) * size * outputFactor / 24, design: Math.max(inKg, outKg) * size * rateFactor.get(n.id) / 24 },
        powerKW: { average: kWhPerKg * size * outputFactor / 24, design: kWhPerKg * size * rateFactor.get(n.id) / 24 },
        kWhPerKg,
        capexUsd: 0,
      });
    }

    // ---- captive suppliers (make instead of buy)
    const captive = [];
    for (const item of ev.integration || []) {
      const sup = opts.evaluate ? opts.evaluate(item.supplierId, item.kgPerDay) : null;
      seq += 1;
      const tag = `PK-${seq}`;
      const nodeId = sourceNodeFor(fs, item.feedId);
      captive.push({ ...item, nodeId, tag, loop: seq, ev: sup });
      if (nodeId) tagOf.set(nodeId, tag); // the feed's source node becomes the package
    }

    // ---- buffers between sun-following and steady units
    const buffers = [];
    if (u && !firmed && profile) {
      profile.buffers.forEach((b, i) => {
        const d = u.buffers?.[i];
        if (!d || !(d.kg > 0)) return;
        seq += 1;
        buffers.push({ tag: `TK-${seq}`, loop: seq, from: b.from, to: b.to, substance: b.substance, capacityKg: d.kg, capexUsd: d.usd, holdHours: Math.max(0, 24 - (u.flexFullLoadHoursPerDay || 24)) });
      });
    }
    for (const item of captive) {
      if (!(item.bufferKg > 0)) continue;
      seq += 1;
      buffers.push({ tag: `TK-${seq}`, loop: seq, from: item.nodeId || item.feedId, to: null, substance: item.product, capacityKg: item.bufferKg, capexUsd: item.bufferUsd, holdHours: null, captive: true });
    }

    // ---- capex: the simulator's class totals of this plant alone (captive suppliers taken out).
    const byTech = { ...ev.capex.byTech };
    let pvMain = ev.capex.pv;
    let landMain = ev.capex.land;
    for (const c of captive) {
      if (!c.ev) continue;
      for (const cls of Object.keys(byTech)) byTech[cls] -= c.ev.capex.byTech[cls] || 0;
      pvMain -= c.ev.capex.pv;
      landMain -= c.ev.capex.land;
    }
    for (const b of buffers) if (b.captive) byTech.storage -= b.capexUsd;
    const capexItems = [];
    // The simulator's own per-unit prices (evaluatePlant.unitCapexUsd: designed units on their
    // materials floor and scale law, sun-following units at the solar design's nameplate factor).
    for (const e of equipment) e.capexUsd = ev.unitCapexUsd[e.nodeId] || 0;
    for (const [id, usd] of Object.entries(ev.unitCapexUsd)) {
      if (id.startsWith('balance:') && Math.abs(usd) > 1e-6) capexItems.push({ group: 'equipment', tag: '', label: `Balance of plant (${id.slice(8)})`, usd });
      // Seasonal fixes the simulator priced at this site (config.seasonal).
      if (id.startsWith('seasonal:chiller:')) {
        const host = id.slice(17);
        const kw = ev.seasonal?.chillerKWthByHost?.[host];
        capexItems.push({ group: 'seasonal', tag: tagOf.get(host) || '', label: `Chilled water for ${byId.get(host)?.label || host}'s coolers${kw ? `, ${fmtNum(kw)} kW` : ''}`, usd });
      }
      if (id === 'seasonal:tracing') capexItems.push({ group: 'seasonal', tag: '', label: `Heat tracing, ${ev.seasonal?.tracedLines} line${ev.seasonal?.tracedLines === 1 ? '' : 's'} (winter)`, usd });
      if (id.startsWith('seasonal:ro:')) capexItems.push({ group: 'seasonal', tag: tagOf.get(id.slice(12)) || '', label: 'RO membrane margin for the coldest feed', usd });
      // H₂ compression the simulator priced (config.compression): tagged once its machine is known.
      if (id.startsWith('compression:')) {
        const consumer = id.slice(12);
        capexItems.push({ group: 'equipment', tag: '', compressionFor: consumer, label: `H₂ compressor to ${byId.get(consumer)?.label || consumer}, ${Number(ev.compression?.supplyBar?.toPrecision(3))} → ${Number(ev.compression?.basisBar?.toPrecision(3))} bar`, usd });
      }
    }
    for (const e of equipment) capexItems.push({ group: 'equipment', tag: e.tag, label: e.service, usd: e.capexUsd });
    const storage = {
      battery: u ? u.batteryUsd : 0,
      thermal: u ? u.thermalUsd : 0,
    };
    let storageLeft = byTech.storage;
    if (storage.battery > 0) { capexItems.push({ group: 'storage', tag: 'BESS-001', label: 'Battery energy storage', usd: storage.battery }); storageLeft -= storage.battery; }
    if (storage.thermal > 0) { capexItems.push({ group: 'storage', tag: 'TES-001', label: 'Thermal energy store', usd: storage.thermal }); storageLeft -= storage.thermal; }
    for (const b of buffers) {
      capexItems.push({ group: 'storage', tag: b.tag, label: `${b.substance} buffer`, usd: b.capexUsd });
      if (!b.captive) storageLeft -= b.capexUsd;
    }
    if (Math.abs(storageLeft) > 1e-6 * Math.max(1, ev.capex.total)) capexItems.push({ group: 'storage', tag: '', label: 'Storage (recipe)', usd: storageLeft });
    capexItems.push({ group: 'energy', tag: 'PV-001', label: 'Solar PV field', usd: pvMain });
    capexItems.push({ group: 'land', tag: '', label: `Land, ${fmtNum(ev.landHa - captive.reduce((s, c) => s + (c.ev?.landHa || 0), 0))} ha`, usd: landMain });
    for (const c of captive) {
      const usd = c.ev ? c.ev.capex.total : 0;
      capexItems.push({ group: 'captive', tag: c.tag, label: `Captive ${c.product} supplier (${c.supplierId})`, usd });
    }
    // Close any rounding residue onto the largest equipment item so the list sums to the plant's capex.
    const listed = capexItems.reduce((s, i) => s + i.usd, 0);
    const residue = ev.capex.total - listed;
    if (Math.abs(residue) > 1e-6 * Math.max(1, ev.capex.total)) {
      capexItems.push({ group: 'equipment', tag: '', label: 'Unallocated (captive supplier difference)', usd: residue });
    }

    // ---- streams
    const streams = [];
    let sno = 0;
    const factorOf = id => rateFactor.get(id) ?? null;
    const edgeFactor = (from, to) => {
      const a = factorOf(from);
      const b = factorOf(to);
      return Math.max(a ?? b ?? 1, b ?? a ?? 1);
    };
    const bufferOn = new Map(buffers.filter(b => !b.captive).map(b => [b.from + '>' + b.to, b]));
    const tagOrLabel = id => tagOf.get(id) || byId.get(id)?.label || id;
    const pushStream = (edge, fromTag, toTag, factor, extra = {}) => {
      sno += 1;
      const isHeat = edge.kind === 'heat';
      const per = isHeat ? Number(edge.kWhPerKg) || 0 : Number(edge.kgPerKg) || 0;
      const total = per || 1;
      streams.push({
        no: sno,
        line: `${fluidCode(edge)}-${String(sno).padStart(3, '0')}`,
        from: edge.from, to: edge.to, fromTag, toTag,
        kind: edge.kind,
        phase: phaseOf(edge),
        perKgProduct: per,
        average: per * size * outputFactor / 24, // kg/h (heat: kW)
        design: per * size * factor / 24,
        perYear: per * ev.annualKg, // kg/yr (heat: kWh/yr)
        composition: (edge.substances || []).map(([s, m]) => [s, m / total]),
        ...extra,
      });
      return streams[streams.length - 1];
    };
    for (const e of flowEdges) {
      const fromN = byId.get(e.from);
      const toN = byId.get(e.to);
      if (!fromN || !toN || fromN.kind === 'bus' || toN.kind === 'bus') continue;
      const buf = bufferOn.get(e.from + '>' + e.to);
      if (buf) {
        // Upstream at the sun-following rate into the buffer, downstream at the steady rate.
        const up = pushStream({ ...e, to: buf.tag }, tagOrLabel(e.from), buf.tag, factorOf(e.from) ?? nameplate, { buffer: buf.tag });
        up.to = buf.tag;
        const down = pushStream({ ...e, from: buf.tag }, buf.tag, tagOrLabel(e.to), factorOf(e.to) ?? 1, { buffer: buf.tag });
        down.from = buf.tag;
        buf.inStream = up.no;
        buf.outStream = down.no;
      } else {
        pushStream(e, tagOrLabel(e.from), tagOrLabel(e.to), edgeFactor(e.from, e.to));
      }
    }

    // ---- stream conditions: each line at the temperature, pressure and phase it leaves its unit
    // (engine/units.js OUTLET_CONDITIONS, solved into data/pathways.js); a buffer stores at line conditions.
    const edgeOf = new Map(flowEdges.map(e => [e.from + '>' + e.to, e]));
    for (const st of streams) {
      st.lineNumber = st.line;
      if (st.kind !== 'material') continue;
      const e = edgeOf.get(st.from + '>' + st.to) || (st.buffer ? flowEdges.find(x => bufferOn.get(x.from + '>' + x.to)?.tag === st.buffer) : null);
      st.T_C = Number.isFinite(e?.T_C) ? e.T_C : 25;
      st.P_bar = Number.isFinite(e?.P_bar) ? e.P_bar : 1;
      st.followsFeed = Boolean(e?.followsFeed);
      st.T_summer_C = st.T_C; // seasonal range: a unit's own outlet condition holds all year
      st.T_winter_C = st.T_C;
      // An engineered electrolyzer delivers its H₂ at its own pressure (atmospheric lean design: ~1 bar).
      const outletBar = Number(designUnits.electrolyzer?.outletP_bar);
      if (outletBar > 0 && byId.get(st.from)?.unit === 'electrolyzer' && st.composition[0]?.[0] === 'H2') st.P_bar = outletBar;
    }
    // Feeds take the site's climate (opts.feedConditions: resource id → { T_C, T_summer_C, T_winter_C,
    // P_bar }: annual mean and hottest / coldest monthly means), and outlets that pass their feed's
    // temperature through (pumps, blowers, RO) follow it, season by season.
    if (opts.feedConditions) {
      for (const st of streams) {
        const src = byId.get(st.from);
        if (st.kind !== 'material' || src?.kind !== 'source') continue;
        const c = opts.feedConditions(src.resource || src.id);
        st.T_C = c.T_C;
        st.T_summer_C = c.T_summer_C ?? c.T_C;
        st.T_winter_C = c.T_winter_C ?? c.T_C;
        st.P_bar = c.P_bar;
      }
      for (let pass = 0; pass < streams.length; pass += 1) {
        let changed = false;
        for (const st of streams) {
          if (st.kind !== 'material') continue;
          const up = st.followsFeed
            ? streams.find(x => x.kind === 'material' && x.to === st.from)
            : st.buffer && st.from === st.buffer ? streams.find(x => x.to === st.buffer) : null;
          if (up && (up.T_C !== st.T_C || up.T_summer_C !== st.T_summer_C || up.T_winter_C !== st.T_winter_C || (st.buffer && up.P_bar !== st.P_bar))) {
            st.T_C = up.T_C;
            st.T_summer_C = up.T_summer_C;
            st.T_winter_C = up.T_winter_C;
            if (st.buffer) st.P_bar = up.P_bar;
            changed = true;
          }
        }
        if (!changed) break;
      }
    }

    // ---- implied machines and exchangers. Where a line reaches a unit below the unit's typical
    // operating pressure it needs a compressor (gas) or pump (liquid); where its temperature is far from
    // the unit's operating temperature, a feed heater or cooler; where a unit's fluid product leaves
    // far below its operating temperature, a product cooler or condenser. Their cost and energy are
    // inside the unit's package in the recipe, so they are tagged to that unit (K-104A: the H₂
    // compressor of the R-104 Haber-Bosch loop; E-104B: its product chiller) and listed, not costed again.
    const machines = [];
    const exchangers = [];
    const letters = new Map(); // host tag + prefix → next letter
    const nextTag = (host, prefix) => {
      const k = host + prefix;
      const i = letters.get(k) || 0;
      letters.set(k, i + 1);
      return `${prefix}-${host.split('-')[1]}${String.fromCharCode(65 + i)}`;
    };
    const fluidName = st => ({ AR: 'Air', SW: 'Seawater', BR: 'Brine', PW: 'Water' }[st.line.split('-')[0]] || st.composition[0]?.[0] || '');
    const isFluid = st => st.phase === 'gas' || st.phase === 'liquid';
    for (const st of streams) {
      const toN = byId.get(st.to);
      if (st.kind !== 'material' || !toN || toN.kind !== 'converter') continue;
      const t = typeOf(toN.unit);
      if (t.symbol === 'pump' || t.symbol === 'compressor') continue;
      const host = tagOf.get(toN.id);
      const need = pressureRange(t.P)?.lo ?? 1;
      const kind = st.phase === 'gas' ? 'compressor' : st.phase === 'liquid' ? 'pump' : null;
      if (kind && need > 2 && need > 1.3 * st.P_bar && need - st.P_bar > 2) {
        const tag = nextTag(host, kind === 'compressor' ? 'K' : 'P');
        machines.push({
          tag, kind, host, stream: st.no,
          service: `${fluidName(st)} ${kind === 'compressor' ? 'compressor' : 'high-pressure pump'} to ${toN.label}`.trim(),
          fromBar: st.P_bar, toBar: need, designKgPerH: st.design,
        });
        st.machine = tag;
        // Priced by the simulator when a recipe consumer takes H₂ below the recipes' basis pressure.
        const priced = ev.unitCapexUsd?.['compression:' + toN.id];
        if (priced > 0 && st.composition[0]?.[0] === 'H2') {
          machines[machines.length - 1].priced = { usd: priced, fromBar: ev.compression.supplyBar, toBar: ev.compression.basisBar };
          for (const item of capexItems) if (item.compressionFor === toN.id) item.tag = tag;
        }
      }
      const unitT = temperatureOf(t.T);
      if (isFluid(st) && unitT != null && Math.abs(unitT - st.T_C) > 100) {
        const heat = unitT > st.T_C;
        const tag = nextTag(host, 'E');
        // Cooling a feed to cryogenic temperature is the cold box's main heat exchanger.
        const what = heat ? 'feed preheater' : unitT < -50 ? 'main heat exchanger (cold box)' : 'feed cooler';
        exchangers.push({
          tag, host, stream: st.no, side: 'feed', duty: heat ? 'heater' : 'cooler',
          service: `${fluidName(st)} ${what} (${fmtT(st.T_C)} → ${fmtT(unitT)})`,
          fromC: st.T_C, toC: unitT,
        });
        st.feedExchanger = tag;
      }
    }
    for (const st of streams) {
      const fromN = byId.get(st.from);
      if (st.kind !== 'material' || !fromN || fromN.kind !== 'converter' || !isFluid(st)) continue;
      const t = typeOf(fromN.unit);
      const unitT = temperatureOf(t.T);
      if (unitT == null || unitT - st.T_C <= 100) continue;
      const host = tagOf.get(fromN.id);
      const tag = nextTag(host, 'E');
      const condense = st.phase === 'liquid';
      // A kiln's or furnace's hot gas gives its heat back to the charge (preheater cyclones, regenerators).
      const offGas = st.phase === 'gas' && (t.symbol === 'kiln' || t.symbol === 'furnace');
      const what = offGas ? 'off-gas heat recovery' : `product ${condense ? 'condenser' : 'cooler'}`;
      exchangers.push({
        tag, host, stream: st.no, side: 'product', duty: offGas ? 'recovery' : condense ? 'condenser' : 'cooler',
        service: `${fluidName(st)} ${what} (${fmtT(unitT)} → ${fmtT(st.T_C)})`,
        fromC: unitT, toC: st.T_C,
      });
      st.productExchanger = tag;
    }

    // ---- line sizing (indicative): density from composition at the line's real temperature and
    // pressure (after its compressor or pump), typical design velocities, rounded up to a standard pipe size.
    for (const st of streams) {
      if (st.kind !== 'material') continue;
      const toN = byId.get(st.to);
      st.pressureBar = st.machine ? (pressureRange(typeOf(toN?.unit).P)?.lo ?? st.P_bar) : st.P_bar;
      // Gas lines are sized for the hottest month (least dense, largest volume); liquids barely change.
      st.sizingT_C = st.phase === 'gas' ? Math.max(st.T_C, st.T_summer_C ?? st.T_C) : st.T_C;
      Object.assign(st, sizeLine(st, byId.get(st.from)?.kind === 'source'));
      st.lineNumber = `${st.size ? st.size + '-' : ''}${st.line}`;
    }

    // ---- seasonal design (opts.climate: the site's monthly air and sea temperatures). Hottest and
    // coldest monthly means, not 0.4 % design extremes; screening checks, not a cost change.
    const climate = opts.climate || null;
    const seasonal = climate?.seasonal ? seasonalDesign({ climate, streams, exchangers, machines, equipment }) : null;

    // ---- instruments and loops
    const instruments = [];
    const addInst = (letters, loop, service, equipTag, extra = {}) => {
      const tag = `${letters}-${loop}`;
      // Same letters and loop already used: suffix A, B, … (exact tag, not a prefix: JIC-1 ≠ JIC-104).
      const n = instruments.filter(i => i.tag === tag || (i.tag.length === tag.length + 1 && i.tag.startsWith(tag) && /[A-Z]$/.test(i.tag))).length;
      instruments.push({ tag: n ? `${tag}${String.fromCharCode(64 + n)}` : tag, letters, loop, service, equipment: equipTag, ...extra });
    };
    for (const e of equipment) {
      const loop = loopNo.get(e.nodeId);
      const t = typeOf(e.unit);
      for (const [letters, service] of t.loops) addInst(letters, loop, service, e.tag);
      if (e.mode === 'steady' || e.mode === 'firmed') addInst('JSL', loop, `trip below ${Math.round(e.minTurndown * 100)}% load (min turndown)`, e.tag, { interlock: true });
    }
    for (const b of buffers) {
      const gas = PHASE_GUESS[b.substance] === 'gas' || ['H2', 'O2', 'N2', 'CO2', 'hydrogen'].includes(b.substance);
      addInst(gas ? 'PIC' : 'LIC', b.loop, gas ? 'buffer pressure (fills by day, draws by night)' : 'buffer level (fills by day, draws by night)', b.tag);
      if (gas) addInst('PSV', b.loop, 'relief to safe location', b.tag, { safety: true });
      addInst(gas ? 'PAL' : 'LAL', b.loop, 'low inventory: slow downstream unit to turndown', b.tag, { alarm: true });
    }
    for (const c of captive) addInst('FIC', c.loop, `${c.product} supply to plant`, c.tag);
    const productSinks = fs.nodes.filter(n => n.kind === 'sink' && (n.disposition === 'product' || n.disposition === 'coproduct'));
    for (const n of productSinks) {
      const s = streams.find(x => x.to === n.id);
      if (s) addInst('FQI', 900 + s.no, `${n.label} totalizer (custody transfer)`, '', { stream: s.no });
    }
    const pvKWp = ev.pvKWp - captive.reduce((s, c) => s + (c.ev?.pvKWp || 0), 0);
    addInst('JIC', 1, 'PV plant controller: dispatch to sun-following units', 'PV-001');
    if (u?.batteryKWh > 0) addInst('JIC', 2, 'battery EMS: state of charge, night discharge to steady units', 'BESS-001');
    if (u?.thermalKWh > 0) addInst('TIC', 3, 'heat store: charge by day, discharge to steady heat users', 'TES-001');

    // ---- utilities
    const utilities = {
      pv: { tag: 'PV-001', kWp: pvKWp, landHa: ev.landHa - captive.reduce((s, c) => s + (c.ev?.landHa || 0), 0), yieldKWhPerKWpDay: site?.pvKWhPerKWpDay ?? null },
      // Power rating: the steady load the store carries through the night at its highest planned rate.
      battery: u?.batteryKWh > 0 ? storeRating('BESS-001', u.batteryKWh, u.batteryUsd, u.blocks?.elec) : null,
      thermal: u?.thermalKWh > 0 ? storeRating('TES-001', u.thermalKWh, u.thermalUsd, u.blocks?.heat) : null,
      electricityKWhPerYear: ev.electricityKWhPerYear,
      peakLoadKW: equipment.reduce((s, e) => s + e.powerKW.design, 0),
      averageLoadKW: ev.electricityKWhPerYear / 8760,
    };

    return {
      basis: {
        pathwayId: pathway.id, product: pathway.product, siteId: site?.id ?? ev.siteId,
        sizeKgPerDay: size, annualKg: ev.annualKg, outputFactor, strategy: u?.strategy ?? null,
        flexNameplateFactor: nameplate, flexFullLoadHoursPerDay: u?.flexFullLoadHoursPerDay ?? null,
        lifeYears: ev.lifeYears, discountRate: cfg.finance.discountRate, leadTimeYears: cfg.build.leadTimeYears || 0,
      },
      equipment, machines, exchangers, streams, instruments, buffers, seasonal, captive: captive.map(({ ev: _ev, ...c }) => ({ ...c, capexUsd: _ev?.capex.total ?? null, lcopUsdPerKg: _ev?.lcopUsdPerKg ?? c.makeUsdPerKg })),
      utilities, tagOf: Object.fromEntries(tagOf),
      tea: tea({ pathway, ev, cfg, capexItems, priceOf: opts.priceOf, feedFactor: opts.feedFactor }),
    };
  }

  function storeRating(tag, kWh, usd, block) {
    const rate = block?.monthRate ? Math.max(...block.monthRate) : 1;
    const kW = (block?.loadKW || 0) * rate;
    return { tag, kWh, usd, kW, hours: kW > 0 ? kWh / kW : null };
  }

  // Line sizing. Molar masses (g/mol) for gas densities; liquid densities (kg/m³) by dominant substance.
  const MOLAR = { H2: 2.016, O2: 32.0, N2: 28.01, CO2: 44.01, CO: 28.01, CH4: 16.04, H2O: 18.02, NH3: 17.03, Ar: 39.95, Cl2: 70.9, C2H4: 28.05, C3H6: 42.08, SiHCl3: 135.45, SiCl4: 169.9, HCl: 36.46 };
  const LIQUID_RHO = { H2O: 1000, NH3: 610, CH3OH: 790, NaOH: 1500, Br2: 3100 };
  const NPS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 30, 36, 42, 48];
  const VELOCITY = { gas: 15, liquid: 2 }; // m/s: typical process design velocities
  function sizeLine(st, fromOutside = false) {
    const kgPerS = st.design / 3600;
    if (!(kgPerS > 0) || (st.phase !== 'gas' && st.phase !== 'liquid')) return { size: null, conveyed: st.phase === 'solid' };
    let rho;
    if (st.phase === 'gas') {
      // Ideal gas at the line's temperature and pressure: ρ = P·M / (R·T).
      const inv = st.composition.reduce((t, [sub, w]) => t + w / (MOLAR[sub] || 29), 0) || 1 / 29;
      const T = Number.isFinite(st.sizingT_C) ? st.sizingT_C : Number.isFinite(st.T_C) ? st.T_C : 25;
      rho = (st.pressureBar * 1e5 * (1 / inv) / 1000) / (8.314 * (T + 273.15));
    } else {
      const top = st.composition[0]?.[0];
      const salts = st.composition.filter(([sub]) => IONS.test(sub)).reduce((t, [, w]) => t + w, 0);
      rho = LIQUID_RHO[top] ? LIQUID_RHO[top] * (top === 'H2O' ? 1 + 0.75 * salts : 1) : 1000;
    }
    const v = VELOCITY[st.phase];
    const dM = Math.sqrt((4 * kgPerS / rho) / (Math.PI * v));
    const inch = dM / 0.0254;
    const nps = NPS.find(n => n >= inch);
    if (nps) return { size: `${nps}"`, densityKgM3: rho, velocityMS: v, innerDiameterM: dM };
    // Near-ambient air too big for a 3 m duct (DAC: drawn across contactor faces by fan banks) is an
    // open air path, not a pipe.
    if (st.phase === 'gas' && st.pressureBar <= 1.1 && (fromOutside || dM > 3)) return { size: null, openIntake: true, densityKgM3: rho, velocityMS: v, innerDiameterM: dM };
    return { size: st.phase === 'gas' ? `duct ⌀${dM.toFixed(1)} m` : `${Math.ceil(inch / 48)}×48"`, densityKgM3: rho, velocityMS: v, innerDiameterM: dM };
  }

  // Seasonal checks for one plant at one site.
  //   cooling — every cooler and condenser against the hottest month's cooling medium: once-through
  //             seawater where the site has sea (10 K minimum approach), else air coolers (15 K). 'ok' all
  //             year, 'summer' needs chilled-water trim in the hottest months, 'refrigeration' always;
  //   freeze  — at a site whose coldest month is ≤ 2 °C, water-bearing liquid lines are heat traced and
  //             insulated (water standing in them through overnight turndown, trips or shutdowns would freeze);
  //   gas     — compressors and blowers on gas lines: volume flow in the hottest month vs the annual mean;
  //   ro      — RO membrane area is set by the coldest feed (FilmTec temperature correction factor).
  const APPROACH_K = { seawater: 10, air: 15 };
  const FREEZE_C = 2;
  const tcf = T => Math.exp((T >= 25 ? 2640 : 3020) * (1 / 298.15 - 1 / (T + 273.15)));
  function mediumOf(climate) {
    const sea = climate.seaC != null;
    return {
      kind: sea ? 'seawater' : 'air',
      summerC: sea ? climate.seaSummerC : climate.airSummerC,
      winterC: sea ? climate.seaWinterC : climate.airWinterC,
      approachK: APPROACH_K[sea ? 'seawater' : 'air'],
    };
  }
  // 'ok' all year; 'summer' (chilled-water trim in the hottest months); 'chilled' (chilled water all
  // year: a target the medium never reaches, but at or above 0 °C); 'refrigeration' (below 0 °C: a
  // refrigeration loop that is part of the recipe's own process, e.g. NH₃ condensed to −33 °C).
  const CHILLED_WATER_MIN_C = 0;
  const PRICED_COOLING = new Set(['summer', 'chilled']);
  function coolingStatus(toC, medium) {
    if (toC >= medium.summerC + medium.approachK) return 'ok';
    if (toC >= medium.winterC + medium.approachK) return 'summer';
    return toC >= CHILLED_WATER_MIN_C ? 'chilled' : 'refrigeration';
  }
  function seasonalDesign({ climate, streams, exchangers, machines, equipment }) {
    const sea = climate.seaC != null;
    const medium = mediumOf(climate);
    const cooling = [];
    for (const x of exchangers) {
      const cools = (x.side === 'product' && (x.duty === 'cooler' || x.duty === 'condenser')) || (x.side === 'feed' && x.duty === 'cooler');
      if (!cools || x.toC < -50) continue; // a cold box is refrigerated by design
      const summerLimit = medium.summerC + medium.approachK;
      const winterLimit = medium.winterC + medium.approachK;
      const status = coolingStatus(x.toC, medium);
      x.cooling = { status, medium: medium.kind, summerLimitC: summerLimit, winterLimitC: winterLimit };
      cooling.push({ tag: x.tag, host: x.host, service: x.service, toC: x.toC, status, summerLimitC: summerLimit, winterLimitC: winterLimit });
    }
    const freeze = [];
    if (climate.airWinterC <= FREEZE_C) {
      for (const st of streams) {
        if (st.kind !== 'material' || st.phase !== 'liquid') continue;
        const water = st.composition.find(([sub]) => sub === 'H2O')?.[1] || 0;
        if (water < 0.3) continue;
        st.heatTrace = true;
        freeze.push({ stream: st.no, line: st.lineNumber, waterShare: water });
      }
    }
    const gas = [];
    for (const m of machines) {
      const st = streams.find(x => x.no === m.stream);
      if (!st || st.phase !== 'gas' || !(st.densityKgM3 > 0)) continue;
      // Inlet density of the machine (the line's density is at its discharge pressure), at the hottest
      // month and at the annual mean.
      const rhoSummer = st.densityKgM3 * (st.P_bar / st.pressureBar);
      const summerT = st.sizingT_C;
      const rhoMean = rhoSummer * (summerT + 273.15) / (st.T_C + 273.15);
      m.designM3PerH = st.design / rhoSummer;
      m.summerVolumeMargin = rhoMean / rhoSummer - 1;
      gas.push({ tag: m.tag, host: m.host, inletT_C: summerT, meanT_C: st.T_C, designM3PerH: m.designM3PerH, margin: m.summerVolumeMargin });
    }
    const ro = [];
    for (const e of equipment.filter(x => x.unit === 'swro')) {
      const feed = streams.find(x => x.kind === 'material' && x.to === e.nodeId);
      if (!feed) continue;
      const extra = Math.max(0, tcf(RO_RATING_C) / tcf(feed.T_winter_C) - 1); // vs the 25 °C rating the recipe is priced at
      e.seasonal = { feedWinterC: feed.T_winter_C, feedSummerC: feed.T_summer_C, extraArea: extra };
      ro.push({ tag: e.tag, feedC: feed.T_C, feedWinterC: feed.T_winter_C, feedSummerC: feed.T_summer_C, extraArea: extra });
    }
    return {
      airMonthlyC: climate.airMonthlyC, seaMonthlyC: climate.seaMonthlyC,
      air: { meanC: climate.airC, summerC: climate.airSummerC, winterC: climate.airWinterC },
      sea: sea ? { meanC: climate.seaC, summerC: climate.seaSummerC, winterC: climate.seaWinterC } : null,
      medium, cooling, freeze, gas, ro,
    };
  }

  // ------------------------------------------------------------------ seasonal fixes (priced)
  // What a recipe needs at a site because of its seasons, per unit of plant size, for the simulator
  // to price (engine/company.js evaluatePlant, config.seasonal):
  //   coolers  — product coolers and condensers whose outlet the cooling medium cannot reach in some or all
  //              months (status 'summer' or 'chilled'): chilled-water duty in each month, kJ per kg product,
  //              and its design (hottest-month) duty; sensible cooling only (condensation happens above the
  //              limit); each carries its host unit (`from`) so the chiller follows that unit's operation;
  //   ro       — RO trains: extra membrane area for the coldest feed vs the recipe's 25 °C rating basis;
  //   tracing  — water-bearing liquid lines heat traced where the coldest month is ≤ 2 °C, and the months
  //              (mean air ≤ 5 °C) the tracing runs.
  // The same rules draw and list these on the P&ID (seasonalDesign); a test keeps the two in step.
  const CP_KJ_PER_KG_K = { H2O: 4.18, CH3OH: 2.53, NH3: 4.7, C12H26: 2.2, CH4: 2.2, C2H4: 1.55, H2: 14.3, CO2: 0.85, N2: 1.04, O2: 0.92 };
  const cpOf = (sub, phase) => CP_KJ_PER_KG_K[sub] ?? (phase === 'liquid' ? 2.5 : 1.1);
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const RO_RATING_C = 25;
  const TRACING_ON_C = 5;
  const needsCache = new WeakMap();
  function seasonalNeeds(pathway, climate) {
    if (!climate?.seasonal || !pathway?.flowsheet?.nodes?.length) return null;
    const key = `${climate.airC}|${climate.seaC}|${climate.source}`;
    let byClimate = needsCache.get(pathway);
    if (!byClimate) needsCache.set(pathway, (byClimate = new Map()));
    if (byClimate.has(key)) return byClimate.get(key);
    const fs = pathway.flowsheet;
    const byId = new Map(fs.nodes.map(n => [n.id, n]));
    const medium = mediumOf(climate);
    const mediumMonthly = (medium.kind === 'seawater' ? climate.seaMonthlyC : climate.airMonthlyC);
    // Line temperatures: annual-mean data edges; sources and feed-following outlets in the coldest month.
    const edges = fs.edges.filter(e => e.kind === 'material' && byId.has(e.from) && byId.has(e.to));
    const winter = new Map(edges.map(e => [e, Number.isFinite(e.T_C) ? e.T_C : 25]));
    for (const e of edges) {
      const src = byId.get(e.from);
      if (src.kind === 'source' && FeedConditions) winter.set(e, FeedConditions.feedConditions(src.resource || src.id, climate).T_winter_C);
    }
    for (let pass = 0; pass < edges.length; pass += 1) {
      let changed = false;
      for (const e of edges.filter(x => x.followsFeed)) {
        const up = edges.find(x => x.to === e.from);
        if (up && winter.get(up) !== winter.get(e)) { winter.set(e, winter.get(up)); changed = true; }
      }
      if (!changed) break;
    }
    const coolers = [];
    for (const e of edges) {
      const n = byId.get(e.from);
      if (n.kind !== 'converter' || (e.phase !== 'gas' && e.phase !== 'liquid')) continue;
      const t = typeOf(n.unit);
      const unitT = temperatureOf(t.T);
      if (unitT == null || unitT - e.T_C <= 100) continue;
      if (e.phase === 'gas' && (t.symbol === 'kiln' || t.symbol === 'furnace')) continue; // off-gas heat recovery
      if (!PRICED_COOLING.has(coolingStatus(e.T_C, medium))) continue;
      const sub = e.substances?.[0]?.[0];
      const cp = cpOf(sub, e.phase);
      const kgPerKg = Number(e.kgPerKg) || 0;
      const monthlyKJPerKg = mediumMonthly.map(m => kgPerKg * cp * Math.max(0, m + medium.approachK - e.T_C));
      coolers.push({ from: e.from, to: e.to, toC: e.T_C, substance: sub, kgPerKg, cp, monthlyKJPerKg, designKJPerKg: Math.max(...monthlyKJPerKg) });
    }
    const ro = [];
    for (const n of fs.nodes.filter(x => x.kind === 'converter' && x.unit === 'swro')) {
      const feed = edges.find(e => e.to === n.id);
      if (!feed) continue;
      const tw = winter.get(feed);
      ro.push({ nodeId: n.id, feedWinterC: tw, extraArea: Math.max(0, tcf(RO_RATING_C) / tcf(tw) - 1) });
    }
    let traced = 0;
    if (climate.airWinterC <= FREEZE_C) {
      for (const e of edges) {
        if (e.phase !== 'liquid') continue;
        const total = (e.substances || []).reduce((t, [, m]) => t + m, 0) || 1;
        const water = (e.substances || []).find(([sub]) => sub === 'H2O')?.[1] || 0;
        if (water / total >= 0.3) traced += 1;
      }
    }
    const tracingHours = climate.airMonthlyC.reduce((t, c, i) => t + (c <= TRACING_ON_C ? MONTH_DAYS[i] * 24 : 0), 0);
    const out = {
      medium,
      coolers,
      // Chiller duty per kg/day of product (kW_th) at the hottest month, and annual trim energy per kg (kWh_th).
      // Chiller duty per kg/day of product (kW_th), per host unit: its coolers' combined duty in their
      // hottest month (a chiller serves all of one unit's coolers).
      chillerKWthPerKgDayByHost: Object.fromEntries([...new Set(coolers.map(c => c.from))].map(host => {
        const mine = coolers.filter(c => c.from === host);
        return [host, Math.max(...mediumMonthly.map((_, i) => mine.reduce((t, c) => t + c.monthlyKJPerKg[i], 0))) / 86400];
      })),
      chillerKWthPerKgDay: 0,
      chillerKWhThPerKg: coolers.reduce((t, c) => t + c.monthlyKJPerKg.reduce((u, q, i) => u + q * MONTH_DAYS[i], 0) / 365, 0) / 3600,
      ro,
      tracedLines: traced,
      tracingHoursPerYear: traced ? tracingHours : 0,
    };
    out.chillerKWthPerKgDay = Object.values(out.chillerKWthPerKgDayByHost).reduce((t, v) => t + v, 0);
    byClimate.set(key, out);
    return out;
  }

  // Lower end of a typical temperature: 'ambient…' → 25, '400–500 °C' → 400, '−196 to −175 °C' → −196.
  function temperatureOf(text) {
    if (!text) return null;
    if (/^\s*ambient/i.test(text)) return 25;
    const m = String(text).replace(/\u2212/g, '-').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  const fmtT = c => `${Math.round(c)} °C`.replace('-', '−');

  // '150–250 bar' → { lo: 150, hi: 250 }; 'atmospheric' (or no number) → 1 bar.
  function pressureRange(text) {
    if (!text) return null;
    const nums = String(text).replace(/,/g, '').match(/\d+(\.\d+)?/g);
    if (!/bar/.test(text) || !nums) return { lo: 1, hi: 1 };
    const v = nums.map(Number);
    return { lo: v[0], hi: v[v.length - 1] };
  }

  // The flowsheet source node a recipe feed enters by: the same id, or one id containing the other
  // ('float-glass' feed ↔ 'glass' source).
  function sourceNodeFor(fs, feedId) {
    const sources = (fs.nodes || []).filter(n => n.kind === 'source');
    const id = String(feedId).toLowerCase();
    const hit = sources.find(n => n.id === feedId)
      || sources.find(n => id.includes(n.id.toLowerCase()) || n.id.toLowerCase().includes(id));
    return hit ? hit.id : null;
  }

  function topoOrder(nodes, edges) {
    const ids = nodes.map(n => n.id);
    const out = new Map(ids.map(id => [id, []]));
    for (const e of edges) out.get(e.from)?.push(e.to);
    const state = new Map();
    const back = new Set();
    const visit = id => {
      state.set(id, 1);
      for (const to of out.get(id) || []) {
        if (state.get(to) === 1) back.add(id + '>' + to);
        else if (!state.get(to)) visit(to);
      }
      state.set(id, 2);
    };
    for (const n of nodes) if (n.kind === 'source' && !state.get(n.id)) visit(n.id);
    for (const id of ids) if (!state.get(id)) visit(id);
    const layer = new Map(ids.map(id => [id, 0]));
    for (let pass = 0; pass < ids.length; pass += 1) {
      let changed = false;
      for (const e of edges) {
        if (back.has(e.from + '>' + e.to) || !layer.has(e.from) || !layer.has(e.to)) continue;
        if (layer.get(e.from) + 1 > layer.get(e.to)) { layer.set(e.to, layer.get(e.from) + 1); changed = true; }
      }
      if (!changed) break;
    }
    return ids.slice().sort((a, b) => layer.get(a) - layer.get(b) || ids.indexOf(a) - ids.indexOf(b));
  }

  function fmtNum(v) {
    if (!Number.isFinite(v)) return '0';
    const a = Math.abs(v);
    return a >= 100 ? Math.round(v).toLocaleString('en-US') : a >= 1 ? v.toFixed(1) : v.toPrecision(2);
  }

  // ------------------------------------------------------------------ TEA
  // Itemizes evaluatePlant's totals and adds the cash-flow view.
  function tea({ pathway, ev, cfg, capexItems, priceOf, feedFactor = () => 1 }) {
    const r = cfg.finance.discountRate;
    const lead = cfg.build.leadTimeYears || 0;
    const life = ev.lifeYears;
    const af = annuityFactor(r, life);
    const crf = af > 0 ? 1 / af : 0;
    const kg = ev.annualKg;
    const cp = ev.costParts;

    // Opex lines.
    const feedLines = [];
    let feedListed = 0;
    const integrated = new Set((ev.integration || []).map(i => i.feedId));
    for (const f of pathway.feeds || []) {
      if (!f.purchased || integrated.has(f.id)) continue;
      const kgYr = (Number(f.kgPerKg) || 0) * feedFactor(f.id) * kg; // a design can cut or remove a feed
      const usd = kgYr * ((Number(f.usdPerKg) || 0) + (Number(f.freightUsdPerKg) || 0));
      if (!(usd > 0)) continue;
      feedLines.push({ group: 'feedstock', label: `${f.id} (${f.origin})`, kgPerYear: kgYr, usdPerKg: (Number(f.usdPerKg) || 0) + (Number(f.freightUsdPerKg) || 0), usd });
      feedListed += usd;
    }
    const feedRest = cp.feedCost - feedListed;
    if (Math.abs(feedRest) > 1e-6 * Math.max(1, cp.feedCost)) feedLines.push({ group: 'feedstock', label: 'Captive suppliers’ feeds', usd: feedRest });
    const opexLines = [
      { group: 'fixed', label: 'Equipment O&M', usd: cp.equipmentOm },
      { group: 'fixed', label: 'PV O&M', usd: cp.pvOm },
      cp.storageOm > 0 ? { group: 'fixed', label: 'Storage O&M', usd: cp.storageOm } : null,
      cp.storageReplacement > 0 ? { group: 'fixed', label: 'Battery / store replacement reserve', usd: cp.storageReplacement } : null,
      ...feedLines,
      { group: 'variable', label: 'Variable O&M (consumables, haulage)', usd: cp.otherVariable - (ev.seasonal?.energyUsdPerYear || 0) - (ev.compression?.energyUsdPerYear || 0) },
      ev.compression?.energyUsdPerYear > 0 ? { group: 'variable', label: 'H₂ compression electricity', usd: ev.compression.energyUsdPerYear } : null,
      ev.seasonal?.energyUsdPerYear > 0 ? { group: 'variable', label: 'Seasonal electricity (chiller trim, heat tracing)', usd: ev.seasonal.energyUsdPerYear } : null,
    ].filter(Boolean);

    // Revenue lines.
    const revenueLines = [{ label: `${pathway.product} (product)`, product: pathway.product, kgPerYear: kg, usdPerKg: ev.priceUsdPerKg, usd: kg * ev.priceUsdPerKg }];
    let coListed = 0;
    for (const co of pathway.coproducts || []) {
      const coKg = (Number(co.kgPerKg) || 0) * kg;
      const p = priceOf ? priceOf(co.product, co.usdPerKg, coKg) : Number(co.usdPerKg) || 0;
      revenueLines.push({ label: `${co.product || co.id} (co-product)`, product: co.product || null, kgPerYear: coKg, usdPerKg: p, usd: coKg * p });
      coListed += coKg * p;
    }
    const coRest = ev.coproductRevenue - coListed;
    if (Math.abs(coRest) > 1e-6 * Math.max(1, ev.coproductRevenue)) revenueLines.push({ label: 'Captive suppliers’ co-products', usd: coRest });

    // Cost per kg by driver (sums to the gross cost; net = gross − co-product credit = LCOP).
    const capBy = g => capexItems.filter(i => i.group === g).reduce((s, i) => s + i.usd, 0);
    const perKg = v => (kg > 0 ? v / kg : Infinity);
    const lcop = [
      { key: 'equipment', label: 'Equipment capital', usdPerKg: perKg((capBy('equipment') + capBy('captive')) * crf) },
      capBy('seasonal') > 0 ? { key: 'seasonal', label: 'Seasonal fixes capital', usdPerKg: perKg(capBy('seasonal') * crf) } : null,
      { key: 'pv', label: 'Solar PV capital', usdPerKg: perKg(capBy('energy') * crf) },
      { key: 'storage', label: 'Storage capital', usdPerKg: perKg(capBy('storage') * crf) },
      { key: 'land', label: 'Land', usdPerKg: perKg(capBy('land') * crf) },
      { key: 'fixedOm', label: 'Fixed O&M', usdPerKg: perKg(ev.opex.fixed) },
      { key: 'feedstock', label: 'Feedstock', usdPerKg: perKg(cp.feedCost) },
      { key: 'other', label: 'Variable O&M', usdPerKg: perKg(cp.otherVariable - (ev.seasonal?.energyUsdPerYear || 0) - (ev.compression?.energyUsdPerYear || 0)) },
      ev.compression?.energyUsdPerYear > 0 ? { key: 'compressionEnergy', label: 'H₂ compression electricity', usdPerKg: perKg(ev.compression.energyUsdPerYear) } : null,
      ev.seasonal?.energyUsdPerYear > 0 ? { key: 'seasonalEnergy', label: 'Seasonal electricity', usdPerKg: perKg(ev.seasonal.energyUsdPerYear) } : null,
      { key: 'credit', label: 'Co-product credit', usdPerKg: -ev.coproductCreditUsdPerKg },
    ].filter(Boolean);

    // Cash flow (project basis, unlevered, real): capex at year 0, first sales after the lead time.
    const flows = [-ev.capex.total];
    for (let t = 1; t <= lead; t += 1) flows.push(0);
    for (let t = 1; t <= life; t += 1) flows.push(ev.annualCash);
    // A fractional life L = n + f: the last year carries the cash whose value at year n+1 equals the
    // simulator's annuity for the fraction, cash × a(f) × (1 + r) with a(f) = (1 − (1+r)^−f) / r, so
    // the discounted flows sum exactly to its NPV.
    const wholeLife = Math.floor(life);
    if (life !== wholeLife) {
      flows.length = 1 + lead + wholeLife;
      const f = life - wholeLife;
      flows.push(ev.annualCash * annuityFactor(r, f) * (1 + r));
    }
    const npv = -ev.capex.total + ev.annualCash * af / (1 + r) ** lead;
    let cum = 0;
    let cumDisc = 0;
    let payback = null;
    let discPayback = null;
    const cashflow = flows.map((cf, t) => {
      const prevCum = cum;
      const prevDisc = cumDisc;
      cum += cf;
      cumDisc += cf / (1 + r) ** t;
      if (payback == null && t > 0 && cum >= 0 && cf > 0) payback = t - 1 + (-prevCum / cf);
      if (discPayback == null && t > 0 && cumDisc >= 0 && cf > 0) discPayback = t - 1 + (-prevDisc / (cf / (1 + r) ** t));
      return { year: t, cash: cf, cumulative: cum, cumulativeDiscounted: cumDisc };
    });

    const parts = {
      capex: { equipment: capBy('equipment') + capBy('captive') + capBy('seasonal'), pv: capBy('energy'), storage: capBy('storage'), land: capBy('land') },
      fixedOm: ev.opex.fixed, feed: cp.feedCost, other: cp.otherVariable,
      productRevenue: kg * ev.priceUsdPerKg, coproductRevenue: ev.coproductRevenue, kg,
      rate: r, life, lead,
    };
    return {
      capexItems, opexLines, revenueLines, lcop,
      capexTotal: ev.capex.total,
      capexPerAnnualT: kg > 0 ? ev.capex.total / (kg / 1000) : Infinity,
      opexTotal: ev.opex.total, revenueTotal: ev.revenue, annualCash: ev.annualCash,
      grossCostUsdPerKg: ev.grossCostUsdPerKg, lcopUsdPerKg: ev.lcopUsdPerKg, priceUsdPerKg: ev.priceUsdPerKg,
      crf, npv, irr: irr(flows), paybackYears: payback, discountedPaybackYears: discPayback,
      cashflow, parts,
      sensitivity: sensitivity(parts),
    };
  }

  // NPV and net cost per kg from the TEA parts (the design held fixed).
  function evaluateParts(p) {
    const af = annuityFactor(p.rate, p.life);
    const capex = p.capex.equipment + p.capex.pv + p.capex.storage + p.capex.land;
    const opex = p.fixedOm + p.feed + p.other;
    const cash = p.productRevenue + p.coproductRevenue - opex;
    const npv = -capex + cash * af / (1 + p.rate) ** p.lead;
    const lcop = p.kg > 0 ? ((af > 0 ? capex / af : 0) + opex - p.coproductRevenue) / p.kg : Infinity;
    return { npv, lcop };
  }

  // One-at-a-time sensitivity (default ±25%), sorted by NPV swing. The plant design (sizes of
  // units, PV and stores) is held fixed, so this is the classic TEA tornado, not a redesign.
  const LEVERS = Object.freeze([
    { key: 'price', label: 'Product price', apply: (p, f) => ({ ...p, productRevenue: p.productRevenue * f }) },
    { key: 'equipment', label: 'Equipment capex', apply: (p, f) => ({ ...p, capex: { ...p.capex, equipment: p.capex.equipment * f } }) },
    { key: 'pv', label: 'Solar PV capex', apply: (p, f) => ({ ...p, capex: { ...p.capex, pv: p.capex.pv * f } }) },
    { key: 'storage', label: 'Storage capex', apply: (p, f) => ({ ...p, capex: { ...p.capex, storage: p.capex.storage * f } }) },
    { key: 'feed', label: 'Feedstock prices', apply: (p, f) => ({ ...p, feed: p.feed * f }) },
    { key: 'coproducts', label: 'Co-product prices', apply: (p, f) => ({ ...p, coproductRevenue: p.coproductRevenue * f }) },
    { key: 'fixedOm', label: 'Fixed O&M', apply: (p, f) => ({ ...p, fixedOm: p.fixedOm * f }) },
    // Output: sales, feeds and variable O&M scale with output; capital and fixed O&M do not.
    { key: 'output', label: 'Output (capacity factor)', apply: (p, f) => ({ ...p, kg: p.kg * f, productRevenue: p.productRevenue * f, coproductRevenue: p.coproductRevenue * f, feed: p.feed * f, other: p.other * f }) },
    { key: 'rate', label: 'Discount rate', apply: (p, f) => ({ ...p, rate: p.rate * f }) },
  ]);
  function sensitivity(parts, swing = 0.25) {
    const base = evaluateParts(parts);
    return {
      swing,
      base,
      rows: LEVERS.map(l => {
        const lo = evaluateParts(l.apply(parts, 1 - swing));
        const hi = evaluateParts(l.apply(parts, 1 + swing));
        return { key: l.key, label: l.label, low: lo, high: hi, npvSwing: Math.abs(hi.npv - lo.npv) };
      }).filter(r => r.npvSwing > 1e-9 * Math.max(1, Math.abs(base.npv)))
        .sort((a, b) => b.npvSwing - a.npvSwing),
    };
  }

  // ------------------------------------------------------------------ convenience
  // The package for one plant from the simulator's inputs, at year `yearIndex` costs (year 0 by default).
  // Company: the FoundryCompany API (passed in to keep this module free of a hard dependency).
  // yearOpts: evaluateAtYear's options for that year (a company run's timeline row: costFactors,
  // rawFactors, storagePrices, pvUsdPerKWp), so a later year carries the run's learning.
  function forPlant(Company, input, pathwayId, siteId, sizeKgPerDay, yearIndex = 0, yearOpts = {}) {
    const ev = Company.evaluateAtYear(input, pathwayId, siteId, sizeKgPerDay, yearIndex, yearOpts);
    if (!ev) return null;
    const cfg = Company.mergeConfig(input.config);
    const pathway = input.pathways.find(p => p.id === pathwayId);
    const site = input.sites.find(s => s.id === siteId);
    const year = cfg.startYear + yearIndex;
    const markets = input.markets || {};
    // The simulator's co-product price: realized price at the share this plant alone would take.
    const priceOf = (product, fallback, kgPerYear) => {
      if (!product && !(fallback > 0)) return 0;
      const group = Company.marketGroupOf(product, input.config);
      const demandT = Company.marketDemandT(markets[group], year);
      const share = Number.isFinite(demandT) && demandT > 0 ? kgPerYear / 1000 / demandT : 0;
      return Company.realizedPrice(cfg, product ? markets[product] : null, fallback, share);
    };
    const evaluate = (id, size) => Company.evaluateAtYear(input, id, siteId, size, yearIndex, yearOpts);
    const feedFactor = Company.designedOpex ? Company.designedOpex(pathway, cfg).feedFactor : undefined;
    // Feed conditions at this site (the recipe was solved at its own reference site).
    const places = climatePlaces();
    let feedConditions = null;
    let climate = null;
    // At the recipe's own site this reproduces the solved annual means and adds their seasonal range.
    if (FeedConditions && places && site) {
      try {
        climate = FeedConditions.siteClimate(site, places);
        feedConditions = id => FeedConditions.feedConditions(id, climate);
      } catch { climate = null; } // a site without climate data keeps the recipe's conditions
    }
    const pkg = designPackage({ pathway, ev, site, cfg, evaluate, priceOf, feedFactor, feedConditions, climate });
    pkg.basis.climate = climate;
    // What the seasonal fixes add: the same plant evaluated without them.
    if (ev.seasonal) {
      const off = Company.evaluateAtYear({ ...input, config: { ...(input.config || {}), seasonal: { ...(input.config?.seasonal || {}), enabled: false } } }, pathwayId, siteId, sizeKgPerDay, yearIndex, yearOpts);
      pkg.seasonalCost = { ...ev.seasonal, lcopDeltaUsdPerKg: ev.lcopUsdPerKg - off.lcopUsdPerKg, npvDeltaUsd: ev.npv - off.npv, capexUsd: ev.seasonal.chillerUsd + ev.seasonal.roUsd + ev.seasonal.tracingUsd };
    }
    pkg.basis.year = year;
    pkg.basis.yearIndex = yearIndex;
    return { ev, pkg };
  }

  return { forPlant, seasonalNeeds, mediumOf, coolingStatus, PRICED_COOLING, sourceNodeFor, pressureRange, temperatureOf, sizeLine, UNIT_TYPES, typeOf, fluidCode, annuityFactor, irr, npvAt, designPackage, evaluateParts, sensitivity, LEVERS };
});
