// Designs view — engineer the equipment that gates abundance. Every design registered by
// engine/designs/*.js (contract: engine/designs/README.md) gets the same panel: presets and knobs →
// bill of materials → installed $ per kg/day, kWh/kg, idiot index, and its factors against the
// recipe; push it into the company simulation. The electrolyzer adds its solar $/kg H₂ curve.
// Below: what still blocks world tonnage in the scenario, and which of it a design covers.
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
    mount(root, { Store, UI, Charts, href, params: routeParams }) {
      const { el } = UI;
      const Company = globalThis.FoundryCompany;
      const ids = Object.keys(Store.DESIGNS);
      if (!ids.length) {
        root.append(el('p', { class: 'empty', text: 'No design modules loaded.' }));
        return null;
      }
      const id = ids.includes(routeParams.id) ? routeParams.id : ids[0];
      const D = Store.DESIGNS[id];
      const unitOwner = new Map(ids.flatMap(k => Store.DESIGNS[k].units.map(u => [u, k])));

      root.append(el('div', { class: 'view-title' }, [
        el('h1', { text: 'Designs' }),
        el('p', { text: 'Engineer the equipment that gates abundance. Knobs → bill of materials → $ per kg/day, kWh/kg, idiot index → the company simulation.' }),
      ]));
      root.append(el('nav', { class: 'ds-tabs segmented', 'aria-label': 'Designs' }, ids.map(k => el('a', {
        href: href('designs', k), text: Store.DESIGNS[k].name, 'aria-current': k === id ? 'page' : null,
        class: Store.scenario.ds?.[k] ? 'is-active' : '',
      }))));

      // ---------------------------------------------------------------- state
      const fromScenario = Store.scenario.ds?.[id];
      let preset = fromScenario?.preset || (D.PRESETS.lean ? 'lean' : Object.keys(D.PRESETS)[0]);
      let overrides = { ...(fromScenario?.overrides || {}) };
      const params = () => ({ ...D.PRESETS[preset].params, ...overrides });
      const sites = Store.SITES.filter(s => s.coastal).sort((a, b) => b.pvKWhPerKWpDay - a.pvKWhPerKWpDay);
      let siteId = sites.find(s => s.id === 'chile-mejillones')?.id || sites[0]?.id;
      const isElectrolyzer = id === 'electrolyzer' && typeof D.lcoh === 'function';

      // ---------------------------------------------------------------- controls
      const presetSeg = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Starting design' });
      for (const [key, p] of Object.entries(D.PRESETS)) {
        presetSeg.append(el('button', { type: 'button', 'data-preset': key, text: key === 'today' ? 'Today' : key === 'lean' ? 'Lean target' : key, title: p.label,
          onclick: () => { preset = key; overrides = {}; syncControls(); draw(); } }));
      }
      const controls = (D.CONTROLS || []).map(c => {
        if (c.options) {
          const select = el('select', { class: 'control', 'data-key': c.key }, c.options.map(([v, t]) => el('option', { value: String(v), text: t })));
          select.addEventListener('change', () => {
            const raw = c.options.find(([v]) => String(v) === select.value)?.[0];
            overrides[c.key] = raw ?? select.value;
            draw();
          });
          return { c, input: select, node: el('label', { class: 'field' }, [el('span', { class: 'field-label', text: c.label }), select]) };
        }
        const input = el('input', { type: 'range', min: c.min, max: c.max, step: c.step, 'data-key': c.key });
        const out = el('span', { class: 'ds-val' });
        input.addEventListener('input', () => { overrides[c.key] = Number(input.value); out.textContent = `${input.value} ${c.unit || ''}`; draw(); });
        return { c, input, out, node: el('label', { class: 'field' }, [el('span', { class: 'field-label' }, [c.label, el('small', { text: c.hint || '' })]), input, out]) };
      });
      const siteSelect = el('select', { class: 'control' }, sites.map(s => el('option', { value: s.id, text: `${s.name} — ${UI.num(s.pvKWhPerKWpDay)} kWh/kWp·d` })));
      siteSelect.value = siteId;
      siteSelect.addEventListener('change', () => { siteId = siteSelect.value; draw(); });
      const setActive = entry => {
        const ds = { ...(Store.scenario.ds || {}) };
        if (entry) ds[id] = entry; else delete ds[id];
        Store.update({ ds }, { immediate: true });
      };
      const useBtn = el('button', { type: 'button', class: 'button primary', text: 'Use this design in the company simulation',
        onclick: () => setActive({ preset, overrides: { ...overrides } }) });
      const clearBtn = el('button', { type: 'button', class: 'button', text: 'Back to the recipe unit', onclick: () => setActive(null) });
      const useNote = el('p', { class: 'muted' });

      function syncControls() {
        const p = D.design(params()).params; // merged with defaults
        for (const b of presetSeg.children) b.setAttribute('aria-pressed', String(b.dataset.preset === preset));
        for (const { c, input, out } of controls) {
          input.value = String(p[c.key]);
          if (out) out.textContent = `${p[c.key]} ${c.unit || ''}`.trim();
        }
      }

      const panel = el('aside', { class: 'card sticky ds-panel' }, [
        el('h2', { text: D.name }),
        D.summary ? el('p', { class: 'muted', text: D.summary }) : null,
        el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Start from' }), presetSeg]),
        controls.length ? el('div', { class: 'form-section' }, [el('h3', { text: 'Design' }), ...controls.map(c => c.node)]) : null,
        isElectrolyzer ? el('div', { class: 'form-section' }, [el('h3', { text: 'Site' }), siteSelect]) : null,
        el('div', { class: 'form-section stack-tight' }, [useBtn, clearBtn, useNote]),
      ]);

      // ---------------------------------------------------------------- outputs
      const kpis = el('div', { class: 'kpis' });
      const chartHost = el('div');
      const bomHost = el('div');
      const nextHost = el('div');
      const bomCard = UI.card('Bill of materials', '', bomHost);
      const main = el('div', { class: 'stack' }, [
        kpis,
        isElectrolyzer ? UI.card('Cost of hydrogen vs current density', 'solar-only $/kg at the selected site; stack + PV sized together by the utilization model; dot = this design', chartHost) : null,
        bomCard,
        UI.card('What still blocks world tonnage', 'blocked markets in the current scenario by their largest cost item per kg; units with a design are marked', nextHost),
      ]);
      root.append(el('div', { class: 'grid grid-sidebar' }, [panel, main]));

      function pvPrice() {
        const cfg = Company.mergeConfig(Store.toConfig(Store.scenario));
        return Company.squashUsd(cfg, 'pv', cfg.pv.capexUsdPerKWp);
      }

      function draw() {
        const d = D.design(params());
        const p = d.params;
        const o = D.simulatorOverride(p);
        const factors = Object.entries(o).map(([u, f]) => `${u} capex ×${UI.num(f.capexFactor, 2)}, energy ×${UI.num(f.energyFactor, 2)}${f.flexible === true ? ', sun-following' : f.flexible === false ? ', firmed' : ''}`).join(' · ');
        const recipe = Object.values(D.RECIPE || {})[0];
        const product = UI.productName(D.product);
        const base = [
          UI.kpi('Installed', UI.usd(d.installedUsdPerKgDay), `per kg/day of ${product}` + (recipe ? ` · recipe ${UI.usd(recipe.usdPerKgDay)}` : '')),
          UI.kpi('Raw materials', UI.usd(d.materialsUsdPerKgDay), `per kg/day · idiot index ${UI.num(d.idiotIndex, 2)}×`),
          UI.kpi('Energy', UI.num(d.kWhPerKg, 3) + ' kWh/kg', recipe ? `recipe ${UI.num(recipe.kWhPerKg, 3)} kWh/kg` : ''),
          UI.kpi('In the simulator', 'capex ×' + UI.num(Object.values(o)[0]?.capexFactor, 2), factors),
        ];
        const extra = (d.kpis || []).map(k => UI.kpi(k.label, k.value, k.sub));
        if (isElectrolyzer) {
          const site = Store.siteById.get(siteId);
          const pv = pvPrice();
          const l = D.lcoh(p, site, { pvUsdPerKWp: pv });
          const opt = D.optimizeCurrentDensity({ ...p }, site, { pvUsdPerKWp: pv }).best;
          extra.push(
            UI.kpi('H₂ on sunlight', UI.usdKg(l.usdPerKg) + '/kg', `stack ${UI.usdKg(l.parts.stack)} · PV ${UI.usdKg(l.parts.pv)} at $${Math.round(pv)}/kWp`),
            UI.kpi('Utilization', UI.num(l.fullLoadHoursPerDay, 2) + ' h/day', `nameplate ${UI.num(l.nameplateFactor, 2)}× · stack life ${UI.num(l.stackLifeYears, 2)} yr`),
            UI.kpi('Best current density', `${opt.j} A/cm²`, `${UI.usdKg(opt.usdPerKg)}/kg at this PV price`),
          );
          const series = PV_LEVELS.map(level => ({
            key: level.label, label: `PV ${level.label} ($${Math.round(pv * level.mult)}/kWp)`, color: level.color,
            values: J_GRID.map(j => D.lcoh({ ...p, currentDensityAPerCm2: j }, site, { pvUsdPerKWp: pv * level.mult }).usdPerKg),
          }));
          const jIndex = J_GRID.reduce((best, j, i) => (Math.abs(j - p.currentDensityAPerCm2) < Math.abs(J_GRID[best] - p.currentDensityAPerCm2) ? i : best), 0);
          chartHost.replaceChildren(Charts.chartBlock({
            x: J_GRID.map(j => j + ' A/cm²'), series, kind: 'line', yFormat: v => UI.usdKg(v),
            xMarks: [{ index: jIndex, label: 'this design' }], endLabels: true,
            refLines: [{ y: 2, label: 'market H₂ $2/kg' }],
            ariaLabel: 'Solar-only hydrogen cost versus current density at three PV prices',
          }));
        }
        kpis.replaceChildren(...base, ...extra);

        // BOM table (contract: d.bom, or d.parts in the contract shape).
        const rows = d.bom || d.parts || [];
        const total = rows.reduce((a, r) => a + (r.usd || 0), 0);
        const basis = d.basis || 'per kg/day';
        bomCard.querySelector('.card-head p')?.remove();
        bomCard.querySelector('.card-head h2').textContent = `Bill of materials ${basis}`;
        bomHost.replaceChildren(UI.sortableTable([
          { key: 'part', label: 'Part', get: r => r.part, render: r => [r.part, el('span', { class: 'cell-sub', text: r.note || '' })] },
          { key: 'material', label: 'Material', get: r => r.material || '—' },
          { key: 'kg', label: 'kg', num: true, get: r => r.kg ?? -1, render: r => (r.kg == null ? '—' : UI.num(r.kg, 3)) },
          { key: 'mat', label: 'Materials $', num: true, get: r => r.usdMaterials ?? -1, render: r => (r.usdMaterials == null ? '—' : UI.usd(r.usdMaterials, 3)) },
          { key: 'factor', label: 'Mfg ×', num: true, get: r => r.manufacturing ?? -1, render: r => (r.manufacturing == null ? '—' : r.manufacturing + '×') },
          { key: 'usd', label: '$', num: true, get: r => r.usd, render: r => el('strong', { text: UI.usd(r.usd, 3) }) },
          { key: 'share', label: 'Share', num: true, get: r => r.usd / total, render: r => UI.pct(r.usd / total, 0) },
        ], rows, { sortKey: 'usd', sortDir: 'desc', compact: true }));

        const active = Store.scenario.ds?.[id];
        useNote.textContent = active
          ? `The company simulation uses: ${active.preset}${Object.keys(active.overrides || {}).length ? ' + edits' : ''} (${UI.usd(D.design(Store.designParams(id, active)).installedUsdPerKgDay)} per kg/day).`
          : `The company simulation uses the recipe ${D.units.join(', ')}.`;
        drawNext();
      }

      let lastNextKey = null;
      function drawNext() {
        const key = Store.toQuery(Store.scenario);
        if (key === lastNextKey) return;
        lastNextKey = key;
        const board = Store.abundance();
        const rows = board.rows.filter(r => r.status === 'blocked');
        nextHost.replaceChildren(UI.sortableTable([
          { key: 'name', label: 'Material', get: r => UI.productName(r.product), render: r => [el('a', { href: href('pathways', r.pathwayId), text: UI.productName(r.product) }), el('span', { class: 'cell-sub', text: Store.pathwayById.get(r.pathwayId)?.name || '' })] },
          { key: 'demand', label: 'World demand', num: true, get: r => r.worldDemandT, render: r => UI.tonnes(r.worldDemandT) + '/yr' },
          { key: 'ratio', label: 'Cost ÷ price', num: true, get: r => r.costRatio, render: r => el('span', { class: 'is-neg', text: UI.num(r.costRatio, 2) + '×' }) },
          { key: 'blocker', label: 'Largest cost item', get: r => r.blocker?.label, render: r => {
            const b = r.blocker;
            if (!b) return '—';
            const owner = b.kind === 'unit' ? unitOwner.get(b.id) : null;
            return [`${b.label} ${UI.usdKg(b.usdPerKg)}/kg`, el('span', { class: 'cell-sub' }, owner
              ? el('a', { href: href('designs', owner), text: (Store.scenario.ds?.[owner] ? 'designed: ' : 'design available: ') + Store.DESIGNS[owner].name })
              : b.kind === 'unit' ? 'no design yet' : b.kind)];
          } },
        ], rows, { sortKey: 'demand', sortDir: 'desc', compact: true }));
      }

      syncControls();
      draw();
      return Store.subscribe(() => draw());
    },
  };
})();
