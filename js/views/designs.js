// Designs view — engineer the equipment the model says matters. First: a solar-matched alkaline
// electrolyzer (engine/designs/electrolyzer.js): knobs → geometry, bill of materials, $/kW, kWh/kg,
// idiot index, and solar-only $/kg H₂ at a site; push the design into the company simulation.
// Also ranks what to design next: the biggest capex blocks in recipes that are still infeasible.
(() => {
  'use strict';
  const PV_LEVELS = [
    { label: 'today', mult: 1, color: 'var(--series-2)' },
    { label: '3× cheaper', mult: 1 / 3, color: 'var(--series-4)' },
    { label: '10× cheaper', mult: 1 / 10, color: 'var(--series-3)' },
  ];
  const J_GRID = Array.from({ length: 30 }, (_, i) => Number((0.1 * (i + 1)).toFixed(1)));

  globalThis.Views.designs = {
    title: 'Designs',
    mount(root, { Store, UI, Charts, href }) {
      const { el } = UI;
      const E = globalThis.ElectrolyzerDesign;
      const Company = globalThis.FoundryCompany;
      if (!E) {
        root.append(el('p', { class: 'empty', text: 'Design module not loaded.' }));
        return null;
      }
      root.append(el('div', { class: 'view-title' }, [
        el('h1', { text: 'Designs' }),
        el('p', { text: 'Engineer the equipment that gates abundance. Knobs → bill of materials → $/kW, kWh/kg, idiot index → $/kg on sunlight alone.' }),
      ]));

      // ---------------------------------------------------------------- state
      const fromScenario = Store.scenario.el;
      let preset = fromScenario?.preset || 'lean';
      let overrides = { ...(fromScenario?.overrides || {}) };
      const params = () => ({ ...E.PRESETS[preset].params, ...overrides });
      const sites = Store.SITES.filter(s => s.coastal).sort((a, b) => b.pvKWhPerKWpDay - a.pvKWhPerKWpDay);
      let siteId = sites.find(s => s.id === 'chile-mejillones')?.id || sites[0]?.id;

      // ---------------------------------------------------------------- controls
      const presetSeg = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Starting design' });
      for (const [id, p] of Object.entries(E.PRESETS)) {
        presetSeg.append(el('button', { type: 'button', 'data-preset': id, text: id === 'today' ? 'Today (China alkaline)' : 'Lean solar-matched', title: p.label,
          onclick: () => { preset = id; overrides = {}; syncControls(); draw(); } }));
      }
      const num = (key, label, unit, min, max, step, hint) => {
        const input = el('input', { type: 'range', min, max, step, 'data-key': key });
        const out = el('span', { class: 'ds-val' });
        input.addEventListener('input', () => { overrides[key] = Number(input.value); out.textContent = `${input.value} ${unit}`; draw(); });
        return { key, unit, input, out, node: el('label', { class: 'field' }, [el('span', { class: 'field-label' }, [label, el('small', { text: hint || '' })]), input, out]) };
      };
      const choice = (key, label, options) => {
        const select = el('select', { class: 'control', 'data-key': key }, options.map(([v, t]) => el('option', { value: v, text: t })));
        select.addEventListener('change', () => { overrides[key] = select.value; draw(); });
        return { key, input: select, node: el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), select]) };
      };
      const controls = [
        num('currentDensityAPerCm2', 'Current density', 'A/cm²', 0.1, 3, 0.05, 'higher = smaller stack, higher voltage'),
        num('plateThicknessMm', 'Bipolar plate thickness', 'mm', 0.2, 3, 0.1),
        num('electrodeNiKgPerM2', 'Ni per electrode', 'kg/m²', 0.05, 1.5, 0.05),
        num('cellAreaM2', 'Cell active area', 'm²', 0.1, 4, 0.1),
        num('installFactor', 'Install factor', '×', 1, 2, 0.05, 'site works, controls, commissioning'),
        choice('separator', 'Separator', Object.entries(E.DEFAULTS.separators).map(([k, v]) => [k, `${v.label} — $${v.usdPerM2}/m²`])),
        choice('coupling', 'Power coupling', Object.entries(E.DEFAULTS.couplings).map(([k, v]) => [k, `${v.label} — $${v.usdPerKW}/kW, ${Math.round(v.loss * 100)}% loss`])),
        choice('pressure', 'Pressure', [['atmospheric', 'Atmospheric (lean BoP; compress later if needed)'], ['pressurized', '~30 bar (heavier BoP)']]),
      ];
      const siteSelect = el('select', { class: 'control' }, sites.map(s => el('option', { value: s.id, text: `${s.name} — ${UI.num(s.pvKWhPerKWpDay)} kWh/kWp·d` })));
      siteSelect.value = siteId;
      siteSelect.addEventListener('change', () => { siteId = siteSelect.value; draw(); });
      const useBtn = el('button', { type: 'button', class: 'button primary', text: 'Use this design in the company simulation',
        onclick: () => Store.update({ el: { preset, overrides: { ...overrides } } }, { immediate: true }) });
      const clearBtn = el('button', { type: 'button', class: 'button', text: 'Back to recipe electrolyzer',
        onclick: () => Store.update({ el: null }, { immediate: true }) });
      const useNote = el('p', { class: 'muted' });

      function syncControls() {
        const p = E.design(params()).params; // merged with defaults
        for (const b of presetSeg.children) b.setAttribute('aria-pressed', String(b.dataset.preset === preset));
        for (const c of controls) {
          c.input.value = String(p[c.key]);
          if (c.out) c.out.textContent = `${p[c.key]} ${c.unit || ''}`.trim();
        }
      }

      const panel = el('aside', { class: 'card sticky ds-panel' }, [
        el('h2', { text: 'Solar-matched electrolyzer' }),
        el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Start from' }), presetSeg]),
        el('div', { class: 'form-section' }, [el('h3', { text: 'Stack & plant' }), ...controls.map(c => c.node)]),
        el('div', { class: 'form-section' }, [el('h3', { text: 'Site' }), siteSelect]),
        el('div', { class: 'form-section stack-tight' }, [useBtn, clearBtn, useNote]),
      ]);

      // ---------------------------------------------------------------- outputs
      const kpis = el('div', { class: 'kpis' });
      const chartHost = el('div');
      const bomHost = el('div');
      const nextHost = el('div');
      const main = el('div', { class: 'stack' }, [
        kpis,
        UI.card('Cost of hydrogen vs current density', 'solar-only $/kg at the selected site; stack + PV sized together by the utilization model; dot = this design', chartHost),
        UI.card('Bill of materials per kW', 'raw materials at commodity prices (data/bom.js) × manufacturing factor; idiot index = installed ÷ raw materials', bomHost),
        UI.card('What to design next', 'recipes still infeasible with this electrolyzer at the scenario’s energy price: their biggest capex blocks per kg/day of product', nextHost),
      ]);
      root.append(el('div', { class: 'grid grid-sidebar' }, [panel, main]));

      function pvPrice() {
        const cfg = Company.mergeConfig(Store.toConfig(Store.scenario));
        return Company.squashUsd(cfg, 'pv', cfg.pv.capexUsdPerKWp);
      }

      function draw() {
        const site = Store.siteById.get(siteId);
        const pv = pvPrice();
        const d = E.design(params());
        const p = d.params; // merged with defaults
        const l = E.lcoh(p, site, { pvUsdPerKWp: pv });
        const opt = E.optimizeCurrentDensity({ ...p }, site, { pvUsdPerKWp: pv }).best;
        kpis.replaceChildren(
          UI.kpi('Installed', UI.usd(d.installedUsdPerKW) + '/kW', `${UI.usd(d.installedUsdPerKgDay)} per kg H₂/day (recipe ${UI.usd(E.RECIPE_USD_PER_KG_DAY)})`),
          UI.kpi('Raw materials', UI.usd(d.materialsUsdPerKW) + '/kW', `idiot index ${UI.num(d.idiotIndex, 2)}×`),
          UI.kpi('Energy', UI.num(d.kWhPerKg, 3) + ' kWh/kg', `${UI.num(d.cellVoltage, 3)} V/cell · ${UI.pct(d.efficiencyHHV, 0)} HHV`),
          UI.kpi('H₂ on sunlight', UI.usdKg(l.usdPerKg) + '/kg', `stack ${UI.usdKg(l.parts.stack)} · PV ${UI.usdKg(l.parts.pv)} at $${Math.round(pv)}/kWp`),
          UI.kpi('Utilization', UI.num(l.fullLoadHoursPerDay, 2) + ' h/day', `nameplate ${UI.num(l.nameplateFactor, 2)}× · stack life ${UI.num(l.stackLifeYears, 2)} yr`),
          UI.kpi('Best current density', `${opt.j} A/cm²`, `${UI.usdKg(opt.usdPerKg)}/kg at this PV price`),
        );
        // Chart: LCOH vs j at three PV prices.
        const series = PV_LEVELS.map(level => ({
          key: level.label, label: `PV ${level.label} ($${Math.round(pv * level.mult)}/kWp)`, color: level.color,
          values: J_GRID.map(j => E.lcoh({ ...p, currentDensityAPerCm2: j }, site, { pvUsdPerKWp: pv * level.mult }).usdPerKg),
        }));
        const jIndex = J_GRID.reduce((best, j, i) => (Math.abs(j - p.currentDensityAPerCm2) < Math.abs(J_GRID[best] - p.currentDensityAPerCm2) ? i : best), 0);
        chartHost.replaceChildren(Charts.chartBlock({
          x: J_GRID.map(j => j + ' A/cm²'), series, kind: 'line', yFormat: v => UI.usdKg(v),
          xMarks: [{ index: jIndex, label: 'this design' }], endLabels: true,
          refLines: [{ y: 2, label: 'market H₂ $2/kg' }],
          ariaLabel: 'Solar-only hydrogen cost versus current density at three PV prices',
        }));
        // BOM table.
        const rows = [
          ...d.parts.map(x => ({ part: x.part, material: x.material, kg: x.kgPerKW, mat: x.usdMaterialsPerKW, factor: x.manufacturing, usd: x.usdPerKW, note: x.note })),
          { part: 'Separator (purchased)', material: '—', kg: null, mat: null, factor: null, usd: d.separatorUsdPerKW, note: p.separators[p.separator].label },
          { part: 'Power electronics', material: '—', kg: null, mat: null, factor: null, usd: d.electronicsUsdPerKW, note: p.couplings[p.coupling].label },
          { part: 'Assembly labour', material: '—', kg: null, mat: null, factor: null, usd: d.labourUsdPerKW, note: `${Math.round(d.stackKW)} kW stacks` },
          { part: 'Install (× factor)', material: '—', kg: null, mat: null, factor: null, usd: d.installedUsdPerKW - d.manufacturedUsdPerKW, note: `× ${p.installFactor}` },
        ];
        bomHost.replaceChildren(UI.sortableTable([
          { key: 'part', label: 'Part', get: r => r.part, render: r => [r.part, el('span', { class: 'cell-sub', text: r.note || '' })] },
          { key: 'material', label: 'Material', get: r => r.material },
          { key: 'kg', label: 'kg/kW', num: true, get: r => r.kg ?? -1, render: r => (r.kg == null ? '—' : UI.num(r.kg, 3)) },
          { key: 'mat', label: 'Materials $/kW', num: true, get: r => r.mat ?? -1, render: r => (r.mat == null ? '—' : UI.usd(r.mat, 3)) },
          { key: 'factor', label: 'Mfg ×', num: true, get: r => r.factor ?? -1, render: r => (r.factor == null ? '—' : r.factor + '×') },
          { key: 'usd', label: '$/kW', num: true, get: r => r.usd, render: r => el('strong', { text: UI.usd(r.usd, 3) }) },
          { key: 'share', label: 'Share', num: true, get: r => r.usd / d.installedUsdPerKW, render: r => UI.pct(r.usd / d.installedUsdPerKW, 0) },
        ], rows, { sortKey: 'usd', sortDir: 'desc', compact: true }));
        // Use-in-sim note.
        const active = Store.scenario.el;
        useNote.textContent = active
          ? `Company simulation is using: ${active.preset}${Object.keys(active.overrides || {}).length ? ' + edits' : ''} (${UI.usd(E.design(Store.electrolyzerParams(active)).installedUsdPerKW)}/kW).`
          : 'Company simulation uses the recipe electrolyzer ($1,500/kW, 52 kWh/kg).';
        drawNext();
      }

      // What to design next: for pathways still infeasible at the scenario price, their largest
      // converter capex blocks (from the solved flowsheets).
      let lastNextKey = null;
      function drawNext() {
        const key = Store.toQuery(Store.scenario);
        if (key === lastNextKey) return;
        lastNextKey = key;
        const rank = new Map(Store.rank(100).map(r => [r.pathwayId, r]));
        // Price designed units at the active design, not the recipe basis.
        const activeParams = Store.electrolyzerParams(Store.scenario.el);
        const unitFactor = { electrolyzer: activeParams ? E.simulatorOverride(activeParams).capexFactor : 1 };
        const blocks = [];
        for (const pathway of Store.PATHWAYS) {
          const r = rank.get(pathway.id);
          if (!r || r.marginUsdPerKg >= 0) continue; // already feasible
          const converters = (pathway.flowsheet?.nodes || []).filter(n => n.kind === 'converter' && n.capexUsdPerKgDay > 0)
            .map(n => ({ ...n, usd: n.capexUsdPerKgDay * (unitFactor[n.unit] ?? 1) }));
          const total = converters.reduce((sum, n) => sum + n.usd, 0);
          for (const n of converters) {
            if (n.usd / total < 0.25) continue;
            blocks.push({ pathway, unit: n.unit, label: n.label, usd: n.usd, share: n.usd / total, gap: r.priceUsdPerKg - r.lcopUsdPerKg, demand: Store.MARKETS[pathway.product]?.worldDemandTPerYear || 0, designed: n.unit in unitFactor && activeParams });
          }
        }
        blocks.sort((a, b) => b.demand * b.share - a.demand * a.share);
        nextHost.replaceChildren(UI.sortableTable([
          { key: 'unit', label: 'Unit to design', get: r => r.label || r.unit, render: r => [r.label || r.unit, el('span', { class: 'cell-sub', text: r.designed ? `${r.unit} · already designed (lean)` : r.unit })] },
          { key: 'usd', label: '$ per kg/day', num: true, get: r => r.usd, render: r => UI.usd(r.usd) },
          { key: 'pathway', label: 'In pathway', get: r => r.pathway.name, render: r => el('a', { href: href('pathways', r.pathway.id), text: r.pathway.name }) },
          { key: 'share', label: 'Share of capex', num: true, get: r => r.share, render: r => UI.pct(r.share, 0) },
          { key: 'gap', label: 'Cost gap', num: true, get: r => r.gap, render: r => el('span', { class: 'is-neg', text: UI.usdKg(r.gap) + '/kg' }) },
          { key: 'demand', label: 'Market', num: true, get: r => r.demand, render: r => UI.tonnes(r.demand) + '/yr' },
        ], blocks.slice(0, 12), { sortKey: 'demand', sortDir: 'desc', compact: true }));
      }

      syncControls();
      draw();
      return Store.subscribe(() => draw());
    },
  };
})();
