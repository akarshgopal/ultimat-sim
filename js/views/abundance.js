// Abundance view — the scoreboard. Of the world's bulk materials, how many tonnes a year can the
// company make from sunlight, air, water and rock below today's price — today, in the current
// scenario, and at the frontier (10× cheaper solar, costs at 1.5× raw materials, lean
// electrolyzer)? For everything still blocked: the single cost item that holds it back.
(() => {
  'use strict';
  const STATUS = {
    abundant: { label: 'Abundant', hint: 'feasible at half today’s price or less', color: 'var(--pos)' },
    feasible: { label: 'Feasible', hint: 'pays back its capital at today’s price (NPV ≥ 0)', color: 'var(--series-1)' },
    blocked: { label: 'Blocked', hint: 'a pathway exists but does not pay back at today’s price', color: 'var(--series-other)' },
    coproduct: { label: 'Coproduct only', hint: 'made only as a coproduct of another plant', color: 'var(--border-strong)' },
    'no-pathway': { label: 'No pathway', hint: 'nothing in the library makes it yet', color: 'var(--surface-2)' },
  };
  const ORDER = ['abundant', 'feasible', 'blocked', 'coproduct', 'no-pathway'];
  const KIND = { unit: 'equipment', feed: 'feed', energy: 'energy', other: 'O&M' };

  globalThis.Views.abundance = {
    title: 'Abundance',
    mount(root, { Store, UI, href }) {
      const { el } = UI;
      root.append(el('div', { class: 'view-title' }, [
        el('h1', { text: 'Abundance' }),
        el('p', { text: 'How much of the world’s material tonnage can be made from sunlight, air, water and rock below today’s price — and what blocks the rest.' }),
      ]));

      const kpis = el('div', { class: 'kpis' });
      const scenarioNote = el('p', { class: 'muted ab-scenario-note' });
      const frontierBtn = el('button', { type: 'button', class: 'button', text: 'Set the scenario to the frontier',
        onclick: () => Store.update(Store.FRONTIER, { immediate: true }) });
      const resetBtn = el('button', { type: 'button', class: 'button', text: 'Reset to today', onclick: () => Store.reset() });

      // The three levers that move this page most, as presets. Every other input is on Company.
      const cents = v => UI.num(v * 100, 2) + '¢';
      const seg = (label, presets, pick) => {
        const group = el('div', { class: 'segmented', role: 'group', 'aria-label': label });
        for (const p of presets) {
          group.append(el('button', { type: 'button', title: p.hint || null, text: p.text,
            onclick: () => Store.update(p.set, { immediate: true }) }));
        }
        group.sync = s => { for (const [i, b] of [...group.children].entries()) b.setAttribute('aria-pressed', String(pick(s, presets[i]))); };
        return group;
      };
      const levers = [
        seg('Solar electricity', Store.ENERGY_PRESETS.map(p => ({ text: `${p.label} · ${cents(p.kwh)}/kWh`, hint: p.hint, set: { kwh: p.kwh, kwhFloor: p.floor }, kwh: p.kwh })),
          (s, p) => Math.abs(s.kwh - p.kwh) < 1e-6),
        seg('Equipment cost', Store.EQUIPMENT_PRESETS.map(p => ({ text: p.label, hint: p.hint, set: { equip: p.equip }, equip: p.equip })),
          (s, p) => Math.abs(s.equip - p.equip) < 1e-6),
        seg('Cost cap', Store.MARGIN_PRESETS.map(p => ({ text: p.label, hint: p.hint || `every cost capped at ${p.ii}× its raw materials`, set: { ii: p.ii }, ii: p.ii })),
          (s, p) => s.ii === p.ii),
      ];
      const leverRow = (label, sub, group) => el('div', { class: 'field' }, [
        el('span', { class: 'field-label' }, [el('span', { text: label }), el('small', { text: sub })]), group]);
      root.append(UI.card('World material tonnage', 'each material’s best recipe at its best site, built today (year 0) at 100× reference size and selling at today’s price', [
        kpis,
        el('div', { class: 'ab-bars' }),
        el('p', { class: 'muted ab-defs' }, [
          el('strong', { text: 'Feasible' }), ': the plant pays back its capital at today’s price. ',
          el('strong', { text: 'Abundant' }), ': feasible at half today’s price or less. ',
          el('strong', { text: 'Frontier' }), ': solar 10× cheaper, every cost capped at 1.5× its raw materials, every equipment design at its lean preset.',
        ]),
        el('div', { class: 'ab-levers' }, [
          leverRow('Solar electricity', 'start-year price', levers[0]),
          leverRow('Equipment cost', '× electrolyzers, DAC, desal, process plant', levers[1]),
          leverRow('Cost cap', 'every cost ≤ raw materials × this (idiot index)', levers[2]),
        ]),
        el('div', { class: 'ab-actions' }, [scenarioNote, resetBtn, frontierBtn,
          el('a', { href: href('company'), text: 'All inputs →' }), el('a', { href: href('designs'), text: 'Equipment designs →' })]),
      ]));
      const barsHost = root.querySelector('.ab-bars');

      const blockersHost = el('div', { class: 'ab-blockers' });
      root.append(UI.card('What to solve next', 'tonnage that does not pay back yet, grouped by its largest cost per kg: equipment to design, a bought feed to make cheaper, or energy', blockersHost));

      const tableHost = el('div');
      root.append(UI.card('Materials', 'each world market’s best recipe (pathway) and site; cost ÷ today’s price below 1× is feasible. Click a material or recipe for detail, a column to sort.', tableHost));

      const legend = UI.legend(ORDER.map(k => ({ label: STATUS[k].label, color: STATUS[k].color, title: STATUS[k].hint })));

      const mt = t => UI.num(t / 1e6) + ' Mt';
      const statusTag = st => el('span', { class: 'ab-status ab-' + st, title: STATUS[st].hint, text: STATUS[st].label });
      const ratio = r => {
        if (!Number.isFinite(r?.costRatio)) return el('span', { class: 'muted', text: '—' });
        if (r.costRatio < 0) return el('span', { class: 'is-pos', text: 'coproducts pay', title: 'coproduct revenue exceeds the plant’s full cost' });
        return el('span', { class: r.costRatio <= 1 ? 'is-pos' : 'is-neg', title: 'cost ÷ today’s price', text: 'cost ' + UI.num(r.costRatio, 2) + '× price' });
      };
      const itemText = it => (it ? `${it.label} ${UI.usdKg(it.usdPerKg)}/kg` : '—');

      function bar(label, board) {
        const t = board.totals;
        const track = el('div', { class: 'ab-track' });
        for (const k of ORDER) {
          const tonnes = board.rows.filter(r => r.status === k).reduce((a, r) => a + r.worldDemandT, 0);
          if (!(tonnes > 0)) continue;
          const seg = el('span', { title: `${STATUS[k].label}: ${mt(tonnes)}/yr (${UI.pct(tonnes / t.worldDemandT, 0)})` });
          seg.style.width = (tonnes / t.worldDemandT * 100) + '%';
          seg.style.background = STATUS[k].color;
          track.append(seg);
        }
        return el('div', { class: 'ab-bar-row' }, [
          el('span', { class: 'ab-bar-label', text: label }),
          track,
          el('span', { class: 'ab-bar-value', text: `${UI.pct(t.feasibleShare, 0)} feasible · ${t.feasibleMarkets}/${t.markets} markets` }),
        ]);
      }

      function blockerList(board, title) {
        const top = board.blockers.slice(0, 6);
        return el('div', {}, [
          el('h3', { text: title }),
          top.length ? el('ol', { class: 'ab-blocker-list' }, top.map(b => el('li', {}, [
            el('strong', { text: b.label }), ' ',
            el('span', { class: 'tag', text: KIND[b.kind] || b.kind }), ' ',
            el('span', { class: 'muted' }, [`${mt(b.worldDemandT)}/yr held back · `,
              ...b.products.flatMap((p, i) => [i ? ', ' : '', el('a', { href: href('markets', p), text: UI.productName(p) })])]),
          ]))) : el('p', { class: 'muted', text: 'Nothing blocked.' }),
        ]);
      }

      let lastKey = null;
      const draw = () => {
        const s = Store.scenario;
        const pin = Store.pinned;
        const key = Store.toQuery(s) + (pin ? '|vs:' + pin.query : '');
        if (key === lastKey) return;
        lastKey = key;
        // Lever states and the scenario note follow the click at once; the scoreboards (~0.1 s, ~0.5 s
        // on a slow phone) come from the background worker, "today" from its cache after the first.
        const atFrontier = Object.entries(Store.FRONTIER).every(([k, v]) => JSON.stringify(s[k]) === JSON.stringify(v));
        frontierBtn.disabled = atFrontier;
        for (const g of levers) g.sync(s);
        resetBtn.disabled = Store.toQuery(s) === '';
        scenarioNote.textContent = Store.toQuery(s) === '' ? 'Your scenario matches today. Change a lever to compare.' : `Your scenario: solar ${UI.num(s.kwh * 100, 2)}¢/kWh · equipment ×${s.equip}`
          + (s.ii > 0 ? ` · costs ≤ ${s.ii}× materials` : '') + Object.entries(s.ds || {}).map(([id, d]) => ` · ${d.preset} ${Store.DESIGNS[id]?.name || id}`).join('');
        root.classList.add('is-solving');
        Promise.all([
          Store.abundanceAsync(Store.defaults()),
          Store.abundanceAsync(s),
          Store.abundanceAsync({ ...s, ...Store.FRONTIER }),
          pin ? Store.abundanceAsync(pin.scenario) : null,
        ]).then(([today, now, frontier, pinnedBoard]) => {
          if (key !== lastKey || !root.isConnected) return; // a newer scenario superseded this one
          root.classList.remove('is-solving');
          // "vs pinned 37% (+2 pts)" under a share KPI while a scenario is pinned.
          const vsPinned = (now, then, digits) => (pinnedBoard
            ? ` · pinned ${UI.pct(then, digits)} (${now - then >= 0 ? '+' : '−'}${Math.abs((now - then) * 100).toFixed(digits)} pts)` : '');

          kpis.replaceChildren(
            UI.kpi('Feasible below today’s price', UI.pct(now.totals.feasibleShare, 0), `${mt(now.totals.feasibleT)}/yr of ${mt(now.totals.worldDemandT)}/yr tracked`
              + vsPinned(now.totals.feasibleShare, pinnedBoard?.totals.feasibleShare, 0)),
            UI.kpi('Abundant (≤ ½ today’s price)', UI.pct(now.totals.abundantShare, 1), `${mt(now.totals.abundantT)}/yr`
              + vsPinned(now.totals.abundantShare, pinnedBoard?.totals.abundantShare, 1)),
            UI.kpi('Today → frontier', `${UI.pct(today.totals.feasibleShare, 0)} → ${UI.pct(frontier.totals.feasibleShare, 0)}`, 'share of tonnage feasible'),
            UI.kpi('Not yet covered', mt(now.totals.uncoveredT) + '/yr', 'no pathway, or coproduct only'),
          );
          barsHost.replaceChildren(...[legend, bar('Today', today), pinnedBoard ? bar('Pinned', pinnedBoard) : null, bar('Your scenario', now), bar('Frontier', frontier)].filter(Boolean));

          blockersHost.replaceChildren(blockerList(now, 'In this scenario'), blockerList(frontier, 'At the frontier'));

          const byProduct = b => new Map(b.rows.map(r => [r.product, r]));
          const t0 = byProduct(today);
          const f0 = byProduct(frontier);
          const p0 = pinnedBoard ? byProduct(pinnedBoard) : null;
          const pathwayName = id => Store.pathwayById.get(id)?.name || id;
          tableHost.replaceChildren(UI.sortableTable([
            { key: 'name', label: 'Material', get: r => UI.productName(r.product),
              render: r => [el('a', { href: href('markets', r.product), text: UI.productName(r.product) }),
                r.pathwayId ? el('a', { class: 'cell-sub', href: href('pathways', r.pathwayId), text: pathwayName(r.pathwayId) + (r.siteId ? ' · ' + (Store.siteById.get(r.siteId)?.name || r.siteId) : '') }) : null] },
            { key: 'demand', label: 'World demand', csvLabel: 'World demand (t/yr)', num: true, get: r => r.worldDemandT, render: r => UI.tonnes(r.worldDemandT) + '/yr' },
            { key: 'price', label: 'Price', csvLabel: 'Price ($/kg)', num: true, get: r => r.priceUsdPerKg, render: r => UI.usdKg(r.priceUsdPerKg) + '/kg' },
            { key: 'today', label: 'Today', get: r => ORDER.indexOf(t0.get(r.product)?.status), render: r => [statusTag(t0.get(r.product).status), el('span', { class: 'cell-sub' }, ratio(t0.get(r.product)))] },
            pinnedBoard ? { key: 'pinned', label: 'Pinned', get: r => ORDER.indexOf(p0.get(r.product)?.status), render: r => [statusTag(p0.get(r.product).status), el('span', { class: 'cell-sub' }, ratio(p0.get(r.product)))] } : null,
            { key: 'now', label: 'Scenario', get: r => ORDER.indexOf(r.status), render: r => [statusTag(r.status), el('span', { class: 'cell-sub' }, ratio(r))] },
            { key: 'frontier', label: 'Frontier', get: r => ORDER.indexOf(f0.get(r.product)?.status), render: r => [statusTag(f0.get(r.product).status), el('span', { class: 'cell-sub' }, ratio(f0.get(r.product)))] },
            { key: 'cost', label: 'Cost/kg (scenario)', num: true, get: r => r.lcopUsdPerKg ?? Infinity, render: r => (Number.isFinite(r.lcopUsdPerKg) ? [UI.usdKg(r.lcopUsdPerKg), r.unsellableCoproductUsdPerKg > 0.0005
              ? el('span', { class: 'cell-sub', title: 'A single plant could sell its coproducts, but making the whole world’s demand this way would flood their markets; that credit is not counted here (so this is higher than the per-plant cost on Pathways).', text: `incl. +${UI.usdKg(r.unsellableCoproductUsdPerKg)} unsold coproducts` })
              : null] : '—') },
            { key: 'kwh', label: 'kWh/kg', num: true, get: r => r.energyKWhPerKg ?? -1, render: r => (Number.isFinite(r.energyKWhPerKg) ? UI.num(r.energyKWhPerKg) : '—') },
            { key: 'blocker', label: 'Largest cost item (scenario → frontier)', get: r => r.blocker?.usdPerKg ?? -1,
              render: r => (r.blocker ? [el('span', { text: itemText(r.blocker) }), el('span', { class: 'cell-sub', text: '→ ' + itemText(f0.get(r.product)?.blocker) })] : el('span', { class: 'muted', text: '—' })) },
          ], now.rows, { sortKey: 'demand', sortDir: 'desc', compact: true, csv: 'abundance-materials',
            rowClass: r => (r.status === 'no-pathway' || r.status === 'coproduct' ? 'is-dim' : '') }));
        }).catch(() => { root.classList.remove('is-solving'); kpis.replaceChildren(el('p', { class: 'muted', text: 'Could not compute the scoreboard.' })); });
      };
      draw();
      return Store.subscribe(draw);
    },
  };
})();
