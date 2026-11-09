// Energy view — think in kWh and $/kWh. What does cheaper solar electricity unlock?
// For every pathway: the electricity price ($/kWh) below which its best site becomes feasible
// (NPV ≥ 0), at several equipment-cost multipliers; how much world material demand that unlocks
// as electricity gets cheaper; and where each kg's cost goes today (energy, equipment, feedstock).
(() => {
  'use strict';
  const EQUIP = [1, 0.5, 0.25, 0.1];
  const PRICE_GRID = (() => {
    // 30¢ → 0.05¢ per kWh, log-spaced, expensive on the left so "cheaper" reads left → right.
    const out = [];
    for (let i = 0; i <= 48; i += 1) out.push(0.3 * (0.0005 / 0.3) ** (i / 48));
    return out;
  })();
  const cents = usd => {
    if (!Number.isFinite(usd)) return '—';
    const c = usd * 100;
    return (c >= 10 ? c.toFixed(0) : c >= 1 ? c.toFixed(1) : c.toFixed(2)) + '¢';
  };

  function cell(UI, row, kwhNow) {
    const { el } = UI;
    if (!row) return el('span', { class: 'muted', text: '—' });
    if (row.limitedBy === 'not-energy') return el('span', { class: 'en-never', text: 'never', title: 'Infeasible even with free electricity: equipment, feedstock or price is the barrier' });
    if (row.limitedBy === 'feasible-at-any-price') return el('span', { class: 'en-yes', text: 'any', title: 'Feasible at any electricity price in range' });
    const ok = row.breakevenUsdPerKWh >= kwhNow;
    if (row.breakevenUsdPerKWh < 1e-4) {
      return el('span', { class: ok ? 'en-yes' : 'en-no', text: '≈ free', title: 'Feasible only with essentially free electricity (< 0.01¢/kWh)' });
    }
    return el('span', { class: ok ? 'en-yes' : 'en-no', text: '≤ ' + cents(row.breakevenUsdPerKWh), title: `Feasible below ${cents(row.breakevenUsdPerKWh)}/kWh` });
  }

  // World demand (Mt/yr) of distinct markets whose pathway is feasible at price p.
  function unlockedSeries(Store, rows, groupOf) {
    return PRICE_GRID.map(p => {
      const groups = new Set();
      for (const r of rows) {
        const feasible = r.limitedBy === 'feasible-at-any-price' || (r.limitedBy === 'energy' && r.breakevenUsdPerKWh >= p);
        if (feasible) groups.add(groupOf(r.product));
      }
      let t = 0;
      for (const g of groups) t += Store.MARKETS[g]?.worldDemandTPerYear || 0;
      return t / 1e6;
    });
  }

  // Sortable break-even: 1 if feasible at any price, the break-even $/kWh, or −1 if energy is not the barrier.
  const breakevenKey = row => (row?.limitedBy === 'feasible-at-any-price' ? 1 : row?.limitedBy === 'energy' ? row.breakevenUsdPerKWh : -1);

  function nearestIndex(p) {
    let best = 0;
    PRICE_GRID.forEach((q, i) => { if (Math.abs(Math.log(q / p)) < Math.abs(Math.log(PRICE_GRID[best] / p))) best = i; });
    return best;
  }

  globalThis.Views.energy = {
    title: 'Energy',
    mount(root, { Store, UI, Charts, href }) {
      const { el } = UI;
      const Company = globalThis.FoundryCompany;
      const groupOf = p => Company.marketGroupOf(p, { marketGroups: Company.DEFAULTS.marketGroups });
      // Start-year solar $/kWh after the idiot-index squeeze on PV capex.
      const effectiveKWh = s => {
        const cfg = Company.mergeConfig(Store.toConfig(s));
        return Company.solarLcoe(cfg.pv, cfg.finance, Company.squashUsd(cfg, 'pv', cfg.pv.capexUsdPerKWp));
      };

      root.append(el('div', { class: 'view-title' }, [
        el('h1', { text: 'Energy' }),
        el('p', { text: 'Think in kWh and $/kWh: what each electricity price unlocks, and what else stands in the way.' }),
      ]));

      // ---------------------------------------------------------------- levers
      const energySeg = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Solar electricity price' });
      const equipSeg = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Equipment cost' });
      const marginSeg = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Target idiot index' });
      const loopBox = el('input', { type: 'checkbox', onchange: e => Store.update({ loop: e.target.checked }, { immediate: true }) });
      for (const p of Store.MARGIN_PRESETS) {
        marginSeg.append(el('button', { type: 'button', 'data-ii': p.ii, title: p.hint || `every cost capped at ${p.ii}× its raw materials`, text: p.label, onclick: () => Store.update({ ii: p.ii }, { immediate: true }) }));
      }
      for (const p of Store.ENERGY_PRESETS) {
        energySeg.append(el('button', { type: 'button', 'data-kwh': p.kwh, title: p.hint, text: `${p.label} · ${cents(p.kwh)}`, onclick: () => Store.update({ kwh: p.kwh, kwhFloor: p.floor }, { immediate: true }) }));
      }
      for (const p of Store.EQUIPMENT_PRESETS) {
        equipSeg.append(el('button', { type: 'button', 'data-equip': p.equip, title: p.hint || '', text: p.label, onclick: () => Store.update({ equip: p.equip }, { immediate: true }) }));
      }
      const leverNote = el('p', { class: 'muted' });
      const kpis = el('div', { class: 'kpis' });
      root.append(UI.card('Levers', 'solar electricity is quoted at 2,000 kWh/kWp·yr; sunnier sites pay less', [
        el('div', { class: 'en-levers' }, [
          el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Solar electricity' }), energySeg]),
          el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Equipment cost (electrolyzers, DAC, desal, process)' }), equipSeg]),
          el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Margins: cap every cost at raw materials × (idiot index)' }), marginSeg]),
        ]),
        el('label', { class: 'check' }, [loopBox, el('span', {}, ['Terraform loop',
          el('small', { text: 'The company’s own steel, glass, aluminium, copper, polysilicon, lithium and cement lower commodity prices, and so the materials floors, year by year.' })])]),
        leverNote,
        kpis,
      ]));

      // ---------------------------------------------------------------- idiot index by class
      const iiHost = el('div');
      root.append(UI.card('Idiot index by cost class',
        'installed cost today ÷ raw materials at commodity prices (data/bom.js); the target caps each class at materials × target',
        iiHost));

      // ---------------------------------------------------------------- unlock curve
      const curveHost = el('div');
      root.append(UI.card('World material demand unlocked by cheaper electricity',
        'Mt/yr of world demand in markets where at least one pathway is feasible at that price (best site, year-0 equipment and feedstock). One line per equipment-cost multiplier.',
        curveHost));

      // ---------------------------------------------------------------- unlock table + cost structure
      const tableHost = el('div');
      root.append(UI.card('Break-even electricity price by pathway',
        'the $/kWh below which the pathway’s best site pays back its capital (NPV ≥ 0); “never” = infeasible even with free electricity',
        tableHost));
      const costHost = el('div');
      root.append(UI.card('Where each kg’s cost goes at the current scenario',
        'gross cost per kg as a share of the market price, by driver; bars past the price line are not feasible',
        costHost));

      const CLASS_LABELS = {
        pv: 'PV system', battery: 'Battery (LFP)', electrolyzer: 'Electrolyzer', desal: 'Desalination (SWRO)',
        dac: 'Direct air capture', thermalStore: 'Thermal store', h2Storage: 'H₂ storage', process: 'Process plant',
      };
      let lastIi = null;
      function drawIdiot(s) {
        if (lastIi === s.ii || !Store.BOM) return;
        lastIi = s.ii;
        const B = Store.BOM;
        const money = (v, unit) => (unit === 'USD installed' ? '$' + v.toFixed(3) : UI.usd(v));
        const rows = Object.keys(B.CLASSES).map(cls => {
          const c = B.CLASSES[cls];
          const materials = B.materialsUsdPerUnit(cls);
          const capped = s.ii > 0 ? Math.min(c.todayUsdPerUnit, materials * s.ii) : c.todayUsdPerUnit;
          const top = B.materialBreakdown(cls).slice(0, 3).map(x => [x.material, x.usd]);
          return { cls, c, materials, ii: B.idiotIndex(cls), capped, top };
        });
        iiHost.replaceChildren(UI.sortableTable([
          { key: 'cls', label: 'Cost class', get: r => CLASS_LABELS[r.cls] || r.cls, render: r => [CLASS_LABELS[r.cls] || r.cls, el('span', { class: 'cell-sub', text: 'per ' + r.c.unit })] },
          { key: 'today', label: 'Today', num: true, get: r => r.c.todayUsdPerUnit, render: r => money(r.c.todayUsdPerUnit, r.c.unit) },
          { key: 'materials', label: 'Raw materials', num: true, get: r => r.materials, render: r => money(r.materials, r.c.unit) },
          { key: 'ii', label: 'Idiot index', num: true, get: r => r.ii, render: r => el('strong', { text: UI.num(r.ii, 2) + '×' }) },
          { key: 'capped', label: s.ii > 0 ? `At ${s.ii}× materials` : 'Scenario price', num: true, get: r => r.capped,
            render: r => el('span', { class: r.capped < r.c.todayUsdPerUnit ? 'is-pos' : '', text: money(r.capped, r.c.unit) + (r.capped < r.c.todayUsdPerUnit ? ` (−${UI.pct(1 - r.capped / r.c.todayUsdPerUnit, 0)})` : '') }) },
          { key: 'top', label: 'Main materials', render: r => el('span', { class: 'muted', text: r.top.map(([m, v]) => `${m} ${money(v, r.c.unit)}`).join(' · ') }) },
        ], rows, { sortKey: 'ii', sortDir: 'desc', compact: true }));
        iiHost.append(el('p', { class: 'muted', text: 'Screening estimates: engineering material inventories at 2024–25 commodity prices; sources in data/bom.js.' }));
      }

      let lastKey = null;
      let timer = 0;
      const syncLevers = () => {
        const s = Store.scenario;
        for (const b of energySeg.children) b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.kwh) - s.kwh) < 1e-9));
        for (const b of equipSeg.children) b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.equip) - s.equip) < 1e-9));
        for (const b of marginSeg.children) b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.ii) - s.ii) < 1e-9));
        loopBox.checked = s.loop;
        loopBox.disabled = !(s.ii > 0);
        drawIdiot(s);
        const result = Store.result;
        const tl = result?.timeline || [];
        const kwhNow = effectiveKWh(s);
        leverNote.textContent = `Solar ${cents(kwhNow)}/kWh at start${s.ii > 0 && kwhNow < s.kwh - 1e-9 ? ` (squeezed from ${cents(s.kwh)})` : ''}, falling ${s.kwhDecline}%/yr to a ${cents(s.kwhFloor)} floor · equipment ×${s.equip} · batteries $${s.battery}/kWh${s.ii > 0 ? ` · every cost capped at ${s.ii}× raw materials` : ''}`
          + (tl.length ? ` · ${tl.at(-1).year}: ${cents(tl.at(-1).solarUsdPerKWh)}/kWh` : '');
      };

      const draw = () => {
        syncLevers();
        const s = Store.scenario;
        const key = Store.toQuery(s);
        if (key === lastKey) return;
        lastKey = key;
        clearTimeout(timer);
        curveHost.replaceChildren(el('p', { class: 'chart-empty', text: 'Solving break-evens…' }));
        timer = setTimeout(() => {
          const multipliers = EQUIP.includes(s.equip) ? EQUIP : [...EQUIP, s.equip].sort((a, b) => b - a);
          const sets = Store.breakevens(multipliers);
          const current = sets.find(x => x.equip === s.equip) || sets[0];
          const byId = sets.map(x => new Map(x.rows.map(r => [r.pathwayId, r])));
          const eff = effectiveKWh(s);

          const feasibleNow = current.rows.filter(r => r.limitedBy === 'feasible-at-any-price' || (r.limitedBy === 'energy' && r.breakevenUsdPerKWh >= eff));
          const neverAtAll = current.rows.filter(r => r.limitedBy === 'not-energy');
          const unlockedNow = new Set(feasibleNow.map(r => groupOf(r.product)));
          const demandNow = [...unlockedNow].reduce((t, g) => t + (Store.MARKETS[g]?.worldDemandTPerYear || 0), 0);
          const usedKWh = feasibleNow.length ? feasibleNow.reduce((a, r) => a + (r.today?.effectiveEnergyUsdPerKWh || 0), 0) / feasibleNow.length : NaN;
          kpis.replaceChildren(
            UI.kpi('Pathways feasible', `${feasibleNow.length} of ${current.rows.length}`, `at ${cents(eff)}/kWh, equipment ×${s.equip}${s.ii > 0 ? `, costs ≤ ${s.ii}× materials` : ''}`),
            UI.kpi('World demand unlocked', UI.num(demandNow / 1e6) + ' Mt/yr', `${unlockedNow.size} markets`),
            UI.kpi('Blocked by more than energy', String(neverAtAll.length), 'infeasible even at 0¢/kWh'),
            UI.kpi('Energy actually paid', Number.isFinite(usedKWh) ? cents(usedKWh) + '/kWh' : '—', 'avg over feasible pathways: PV + storage + land per kWh used'),
          );

          const colors = ['var(--series-2)', 'var(--series-4)', 'var(--series-3)', 'var(--series-1)', 'var(--series-7)'];
          const series = sets.map((x, i) => ({
            key: 'e' + x.equip, label: `equipment ×${x.equip}`, color: colors[i % colors.length],
            values: unlockedSeries(Store, x.rows, groupOf),
          }));
          const marks = Store.ENERGY_PRESETS.map(p => ({ index: nearestIndex(p.kwh), label: p.label }));
          curveHost.replaceChildren(Charts.chartBlock({
            x: PRICE_GRID.map(cents),
            series,
            kind: 'line',
            yFormat: v => UI.num(v) + ' Mt',
            xMarks: marks,
            endLabels: true,
            ariaLabel: 'World material demand unlocked as electricity gets cheaper, per equipment-cost multiplier',
          }));

          const rows = current.rows.map(r => ({ r, cells: byId.map(m => m.get(r.pathwayId)) }));
          const best = row => Math.max(...row.cells.map(breakevenKey));
          const pathway = id => Store.pathwayById.get(id);
          tableHost.replaceChildren(UI.sortableTable([
            { key: 'name', label: 'Pathway', get: x => pathway(x.r.pathwayId)?.name || x.r.pathwayId,
              render: x => [el('a', { href: href('pathways', x.r.pathwayId), text: pathway(x.r.pathwayId)?.name || x.r.pathwayId }), el('span', { class: 'cell-sub', text: UI.productName(x.r.product) })] },
            { key: 'kwh', label: 'kWh/kg', num: true, get: x => x.r.energyKWhPerKg, render: x => UI.num(x.r.energyKWhPerKg) },
            { key: 'demand', label: 'World demand', num: true, get: x => Store.MARKETS[groupOf(x.r.product)]?.worldDemandTPerYear, render: x => UI.tonnes(Store.MARKETS[groupOf(x.r.product)]?.worldDemandTPerYear) + '/yr' },
            ...sets.map((set, i) => ({
              key: 'e' + set.equip, label: `equip ×${set.equip}`, num: true,
              title: `Break-even electricity price with equipment at ×${set.equip}`,
              get: x => breakevenKey(x.cells[i]),
              render: x => cell(UI, x.cells[i], eff),
            })),
            { key: 'free', label: 'Cost at 0¢/kWh', num: true, title: 'Net cost per kg with free electricity, at the current equipment multiplier', get: x => x.r.atFreeEnergy.lcopUsdPerKg,
              render: x => `${UI.usdKg(x.r.atFreeEnergy.lcopUsdPerKg)} vs ${UI.usdKg(x.r.today?.priceUsdPerKg)}` },
          ], rows, { sortKey: 'e' + s.equip, sortDir: 'desc', rowClass: x => (best(x) < 0 ? 'is-dim' : '') }));

          // Cost structure at the current scenario.
          const parts = [
            ['energy', 'Energy (PV + storage + land)', 'var(--series-4)'],
            ['equipment', 'Equipment', 'var(--series-1)'],
            ['feedstock', 'Feedstock', 'var(--series-2)'],
            ['other', 'Other O&M', 'var(--series-other)'],
          ];
          const withCost = current.rows.filter(r => r.today && r.today.priceUsdPerKg > 0)
            .sort((a, b) => a.today.costBreakdownUsdPerKg.energy / a.today.priceUsdPerKg - b.today.costBreakdownUsdPerKg.energy / b.today.priceUsdPerKg).reverse();
          const maxRatio = Math.min(4, Math.max(1.2, ...withCost.map(r => Object.values(r.today.costBreakdownUsdPerKg).reduce((a, b) => a + b, 0) / r.today.priceUsdPerKg)));
          costHost.replaceChildren(
            UI.legend(parts.map(([, label, color]) => ({ label, color }))),
            el('div', { class: 'en-bars' }, withCost.map(r => {
              const b = r.today.costBreakdownUsdPerKg;
              const price = r.today.priceUsdPerKg;
              const total = Object.values(b).reduce((x, y) => x + y, 0);
              const bar = el('div', { class: 'en-bar' });
              for (const [k, label, color] of parts) {
                const w = Math.max(0, b[k]) / price / maxRatio * 100;
                if (w > 0) bar.append(el('span', { style: { width: w + '%', background: color }, title: `${label}: ${UI.usdKg(b[k])}/kg (${UI.pct(b[k] / total, 0)} of cost)` }));
              }
              bar.append(el('i', { class: 'en-price', style: { left: (100 / maxRatio) + '%' }, title: `price ${UI.usdKg(price)}/kg` }));
              return el('div', { class: 'en-bar-row' }, [
                el('a', { href: href('pathways', r.pathwayId), class: 'en-bar-label', text: Store.pathwayById.get(r.pathwayId)?.name || r.pathwayId }),
                bar,
                el('span', { class: 'en-bar-value ' + (total <= price ? 'is-pos' : 'is-neg'), text: `${UI.usdKg(total)} / ${UI.usdKg(price)} · energy ${UI.pct(b.energy / total, 0)}` }),
              ]);
            })),
          );
        }, 30);
      };
      draw();
      return Store.subscribe(draw);
    },
  };
})();
