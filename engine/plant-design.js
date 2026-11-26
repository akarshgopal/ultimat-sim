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
  const api = factory(typeof require === 'function' ? require('./utilization') : root.FoundryUtilization);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoundryPlantDesign = api;
})(globalThis, Utilization => {
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
    swro: { symbol: 'membrane', prefix: 'M', type: 'Reverse-osmosis train', T: 'ambient', P: '55–70 bar feed', Pout: 1, loops: [['FIC', 'feed flow'], ['PIC', 'HP feed pressure'], ['AIT', 'permeate conductivity']] },
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

    // ---- implied machines: where a line steps up from one unit's typical pressure to the next unit's,
    // the drawing needs a compressor (gas) or pump (liquid). Their cost and power are inside the
    // receiving unit's package in the recipe, so they are tagged to that unit (K-104A: the H₂
    // compressor of the R-104 Haber-Bosch loop) and listed, not costed again.
    const machines = [];
    const outletBar = new Map(); // node / buffer id → outlet pressure
    const pressureOfNode = id => {
      if (outletBar.has(id)) return outletBar.get(id);
      const n = byId.get(id);
      if (!n || n.kind !== 'converter') return 1;
      const t = typeOf(n.unit);
      return t.Pout ?? pressureRange(t.P)?.lo ?? 1; // RO permeate and brine leave near ambient
    };
    for (const b of buffers) if (!b.captive) outletBar.set(b.tag, pressureOfNode(b.from));
    const machineCount = new Map();
    for (const st of streams) {
      const toN = byId.get(st.to);
      if (st.kind !== 'material' || !toN || toN.kind !== 'converter') continue;
      const t = typeOf(toN.unit);
      if (t.symbol === 'pump' || t.symbol === 'compressor') continue;
      const need = pressureRange(t.P)?.lo ?? 1;
      const have = pressureOfNode(st.from);
      if (!(need > 2 && need >= 2 * have)) continue;
      const kind = st.phase === 'gas' ? 'compressor' : st.phase === 'liquid' ? 'pump' : null;
      if (!kind) continue;
      const host = tagOf.get(toN.id);
      const i = machineCount.get(host) || 0;
      machineCount.set(host, i + 1);
      const [prefix, num] = host.split('-');
      const tag = `${kind === 'compressor' ? 'K' : 'P'}-${num}${String.fromCharCode(65 + i)}`;
      const fluid = { AR: 'Air', SW: 'Seawater', BR: 'Brine', PW: 'Water' }[st.line.split('-')[0]] || st.composition[0]?.[0] || '';
      machines.push({
        tag, kind, host, hostPrefix: prefix, stream: st.no,
        service: `${fluid ? fluid + ' ' : ''}${kind === 'compressor' ? 'compressor' : 'high-pressure pump'} to ${toN.label}`,
        fromBar: have, toBar: need, designKgPerH: st.design,
      });
      st.machine = tag;
    }

    // ---- line sizing (indicative): density from composition at the line's pressure, typical design
    // velocities, rounded up to a standard pipe size; low-pressure gas too big for a 48" pipe is a duct.
    for (const st of streams) {
      st.lineNumber = st.line;
      if (st.kind !== 'material') continue;
      const toN = byId.get(st.to);
      st.pressureBar = st.machine ? (pressureRange(typeOf(toN?.unit).P)?.lo ?? 1) : pressureOfNode(st.from);
      Object.assign(st, sizeLine(st, byId.get(st.from)?.kind === 'source'));
      st.lineNumber = `${st.size ? st.size + '-' : ''}${st.line}`;
    }

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
      equipment, machines, streams, instruments, buffers, captive: captive.map(({ ev: _ev, ...c }) => ({ ...c, capexUsd: _ev?.capex.total ?? null, lcopUsdPerKg: _ev?.lcopUsdPerKg ?? c.makeUsdPerKg })),
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
      // Ideal gas at 25 °C (the cases carry no temperatures): ρ = P·M / (R·T).
      const inv = st.composition.reduce((t, [sub, w]) => t + w / (MOLAR[sub] || 29), 0) || 1 / 29;
      rho = (st.pressureBar * 1e5 * (1 / inv) / 1000) / (8.314 * 298.15);
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
      { group: 'variable', label: 'Variable O&M (consumables, haulage)', usd: cp.otherVariable },
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
      { key: 'pv', label: 'Solar PV capital', usdPerKg: perKg(capBy('energy') * crf) },
      { key: 'storage', label: 'Storage capital', usdPerKg: perKg(capBy('storage') * crf) },
      { key: 'land', label: 'Land', usdPerKg: perKg(capBy('land') * crf) },
      { key: 'fixedOm', label: 'Fixed O&M', usdPerKg: perKg(ev.opex.fixed) },
      { key: 'feedstock', label: 'Feedstock', usdPerKg: perKg(cp.feedCost) },
      { key: 'other', label: 'Variable O&M', usdPerKg: perKg(cp.otherVariable) },
      { key: 'credit', label: 'Co-product credit', usdPerKg: -ev.coproductCreditUsdPerKg },
    ];

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
      capex: { equipment: capBy('equipment') + capBy('captive'), pv: capBy('energy'), storage: capBy('storage'), land: capBy('land') },
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
    const pkg = designPackage({ pathway, ev, site, cfg, evaluate, priceOf, feedFactor });
    pkg.basis.year = year;
    pkg.basis.yearIndex = yearIndex;
    return { ev, pkg };
  }

  return { forPlant, sourceNodeFor, pressureRange, sizeLine, UNIT_TYPES, typeOf, fluidCode, annuityFactor, irr, npvAt, designPackage, evaluateParts, sensitivity, LEVERS };
});
