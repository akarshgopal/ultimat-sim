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
  const KIND = { unit: 'unit', feed: 'feed', energy: 'energy', other: 'O&M' };

  globalThis.Views.abundance = {
    title: 'Abundance',
    mount(root, { Store, UI, href }) {
      const { el } = UI;
      root.append(el('div', { class: 'view-title' }, [
        el('h1', { text: 'Abundance' }),
        el('p', { text: 'How much of the world’s material tonnage can be made from sunlight, air, water and rock below today’s price — and what blocks the rest.' }),
      ]));

      const kpis = el('div', { class: 'kpis' });
      const scenarioNote = el('p', { class: 'muted' });
      const frontierBtn = el('button', { type: 'button', class: 'button', text: 'Set the scenario to the frontier',
        onclick: () => Store.update(Store.FRONTIER, { immediate: true }) });
      root.append(UI.card('World material tonnage', 'year 0, best site, plants at 100× reference size, no company market share', [
        kpis,
        el('div', { class: 'ab-bars' }),
        el('div', { class: 'ab-actions' }, [scenarioNote, frontierBtn,
          el('a', { href: href('energy'), text: 'Energy levers →' }), el('a', { href: href('designs'), text: 'Designs →' })]),
      ]));
      const barsHost = root.querySelector('.ab-bars');

      const blockersHost = el('div', { class: 'ab-blockers' });
      root.append(UI.card('What to solve next', 'blocked world tonnage by its single largest cost item per kg: a unit to design, a feed to make cheaper, or energy', blockersHost));

      const tableHost = el('div');
      root.append(UI.card('Materials', 'each world market’s best pathway; cost ÷ today’s price below 1 is feasible', tableHost));

      const legend = el('div', { class: 'chart-legend' }, ORDER.map(k => {
        const swatch = el('span', { class: 'legend-swatch' });
        swatch.style.setProperty('--swatch', STATUS[k].color);
        return el('span', { class: 'legend-item', title: STATUS[k].hint }, [swatch, STATUS[k].label]);
      }));

      const mt = t => UI.num(t / 1e6) + ' Mt';
      const statusTag = st => el('span', { class: 'ab-status ab-' + st, title: STATUS[st].hint, text: STATUS[st].label });
      const ratio = r => {
        if (!Number.isFinite(r?.costRatio)) return el('span', { class: 'muted', text: '—' });
        if (r.costRatio < 0) return el('span', { class: 'is-pos', text: 'coproducts pay', title: 'coproduct revenue exceeds the plant’s full cost' });
        return el('span', { class: r.costRatio <= 1 ? 'is-pos' : 'is-neg', text: UI.num(r.costRatio, 2) + '× price' });
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
            el('span', { class: 'muted', text: `${mt(b.worldDemandT)}/yr held back · ${b.products.map(p => UI.productName(p)).join(', ')}` }),
          ]))) : el('p', { class: 'muted', text: 'Nothing blocked.' }),
        ]);
      }

      let lastKey = null;
      let timer = 0;
      const draw = () => {
        const s = Store.scenario;
        const key = Store.toQuery(s);
        if (key === lastKey) return;
        lastKey = key;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const today = Store.abundance(Store.defaults());
          const now = Store.abundance(s);
          const frontier = Store.abundance({ ...s, ...Store.FRONTIER });
          const atFrontier = Object.entries(Store.FRONTIER).every(([k, v]) => JSON.stringify(s[k]) === JSON.stringify(v));
          frontierBtn.disabled = atFrontier;
          scenarioNote.textContent = `Scenario: solar ${UI.num(s.kwh * 100, 2)}¢/kWh · equipment ×${s.equip}`
            + (s.ii > 0 ? ` · costs ≤ ${s.ii}× materials` : '') + Object.entries(s.ds || {}).map(([id, d]) => ` · ${d.preset} ${Store.DESIGNS[id]?.name || id}`).join('');

          kpis.replaceChildren(
            UI.kpi('Feasible below today’s price', UI.pct(now.totals.feasibleShare, 0), `${mt(now.totals.feasibleT)}/yr of ${mt(now.totals.worldDemandT)}/yr tracked`),
            UI.kpi('Abundant (≤ ½ today’s price)', UI.pct(now.totals.abundantShare, 1), `${mt(now.totals.abundantT)}/yr`),
            UI.kpi('Today → frontier', `${UI.pct(today.totals.feasibleShare, 0)} → ${UI.pct(frontier.totals.feasibleShare, 0)}`, 'share of tonnage feasible'),
            UI.kpi('Not yet covered', mt(now.totals.uncoveredT) + '/yr', 'no pathway, or coproduct only'),
          );
          barsHost.replaceChildren(legend, bar('Today', today), bar('Scenario', now), bar('Frontier', frontier));

          blockersHost.replaceChildren(blockerList(now, 'In this scenario'), blockerList(frontier, 'At the frontier'));

          const byProduct = b => new Map(b.rows.map(r => [r.product, r]));
          const t0 = byProduct(today);
          const f0 = byProduct(frontier);
          const pathwayName = id => Store.pathwayById.get(id)?.name || id;
          tableHost.replaceChildren(UI.sortableTable([
            { key: 'name', label: 'Material', get: r => UI.productName(r.product),
              render: r => [el('a', { href: href('markets', r.product), text: UI.productName(r.product) }),
                r.pathwayId ? el('a', { class: 'cell-sub', href: href('pathways', r.pathwayId), text: pathwayName(r.pathwayId) + (r.siteId ? ' · ' + (Store.siteById.get(r.siteId)?.name || r.siteId) : '') }) : null] },
            { key: 'demand', label: 'World demand', num: true, get: r => r.worldDemandT, render: r => UI.tonnes(r.worldDemandT) + '/yr' },
            { key: 'price', label: 'Price', num: true, get: r => r.priceUsdPerKg, render: r => UI.usdKg(r.priceUsdPerKg) },
            { key: 'today', label: 'Today', get: r => ORDER.indexOf(t0.get(r.product)?.status), render: r => [statusTag(t0.get(r.product).status), el('span', { class: 'cell-sub' }, ratio(t0.get(r.product)))] },
            { key: 'now', label: 'Scenario', get: r => ORDER.indexOf(r.status), render: r => [statusTag(r.status), el('span', { class: 'cell-sub' }, ratio(r))] },
            { key: 'frontier', label: 'Frontier', get: r => ORDER.indexOf(f0.get(r.product)?.status), render: r => [statusTag(f0.get(r.product).status), el('span', { class: 'cell-sub' }, ratio(f0.get(r.product)))] },
            { key: 'cost', label: 'Cost (scenario)', num: true, get: r => r.lcopUsdPerKg ?? Infinity, render: r => (Number.isFinite(r.lcopUsdPerKg) ? UI.usdKg(r.lcopUsdPerKg) : '—') },
            { key: 'kwh', label: 'kWh/kg', num: true, get: r => r.energyKWhPerKg ?? -1, render: r => (Number.isFinite(r.energyKWhPerKg) ? UI.num(r.energyKWhPerKg) : '—') },
            { key: 'blocker', label: 'Largest cost item (scenario → frontier)', get: r => r.blocker?.usdPerKg ?? -1,
              render: r => (r.blocker ? [el('span', { text: itemText(r.blocker) }), el('span', { class: 'cell-sub', text: '→ ' + itemText(f0.get(r.product)?.blocker) })] : el('span', { class: 'muted', text: '—' })) },
          ], now.rows, { sortKey: 'demand', sortDir: 'desc', compact: true,
            rowClass: r => (r.status === 'no-pathway' || r.status === 'coproduct' ? 'is-dim' : '') }));
        }, 30);
      };
      draw();
      return Store.subscribe(draw);
    },
  };
})();
