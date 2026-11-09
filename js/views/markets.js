// Markets view: every world market the company can sell into (#/markets) and one market in
// detail (#/markets/<key>): company output, share of world supply, realized price, pathways.
(() => {
  'use strict';
  const Company = globalThis.FoundryCompany;

  function marketRows(Store) {
    return Object.entries(Store.MARKETS).map(([key, m]) => ({ key, ...m }));
  }
  // Pathways that make a product: as primary product or as a coproduct (kg per kg of primary).
  function producers(Store, key) {
    const out = [];
    for (const p of Store.PATHWAYS) {
      if (p.product === key) out.push({ pathway: p, role: 'primary', kgPerKg: 1 });
      for (const co of p.coproducts || []) {
        if (co.product === key) out.push({ pathway: p, role: 'coproduct', kgPerKg: Number(co.kgPerKg) || 0 });
      }
    }
    return out;
  }
  const groupOf = (Store, key) => Company.marketGroupOf(key, Store.toConfig(Store.scenario));

  // Primary producers as links; coproduct sources collapse to "+N as coproduct" when many.
  function pathwayLinks(UI, href, list) {
    if (!list.length) return UI.el('span', { class: 'muted', text: '—' });
    const link = ({ pathway, role }) => UI.el('a', {
      href: href('pathways', pathway.id),
      class: role === 'primary' ? 'is-primary' : 'is-co',
      title: `${pathway.name} (${role})`,
      text: pathway.id,
    });
    const primary = list.filter(r => r.role === 'primary');
    const co = list.filter(r => r.role !== 'primary');
    const parts = primary.map(link);
    if (co.length > 2) parts.push(UI.el('span', { class: 'co-more', title: co.map(r => r.pathway.name).join('\n'), text: `+${co.length} as coproduct` }));
    else parts.push(...co.map(link));
    return UI.el('span', { class: 'path-links' }, parts);
  }

  // ---------------------------------------------------------------- list
  function mountList(root, { Store, UI, href }) {
    const { el } = UI;
    const rows = marketRows(Store);
    const prodBy = new Map(rows.map(r => [r.key, producers(Store, r.key)]));
    const kpis = el('div', { class: 'kpis' });
    const tableBox = el('div');
    root.append(
      el('div', { class: 'view-title' }, [
        el('h1', { text: 'Markets' }),
        el('p', { text: `${rows.length} world markets. The company’s abundance lever is its share of each, capped by the scenario.` }),
      ]),
      el('div', { class: 'stack' }, [
        kpis,
        UI.card('World markets', 'Final-year output, share of world supply and price relief in the current run. Supplied markets first; click a row for detail.', tableBox),
      ]),
    );
    let lastResult;
    const draw = ({ result, scenario }) => {
      if (result === lastResult && tableBox.childElementCount) return;
      lastResult = result;
      const last = result?.timeline.at(-1) || null;
      const year = last?.year ?? Company.DEFAULTS.startYear;
      const out = key => last?.outputTByProduct[key] || 0;
      const share = key => last?.shareByMarket[groupOf(Store, key)];
      const relief = key => last?.priceReliefByMarket[groupOf(Store, key)];
      const supplied = rows.filter(r => out(r.key) > 0);
      const atCap = supplied.filter(r => (share(r.key) || 0) >= scenario.share / 100 * 0.95);
      const revenue = supplied.reduce((sum, r) => sum + (last.revenueByProduct[r.key] || 0), 0);
      kpis.replaceChildren(
        UI.kpi('Markets supplied', result ? `${supplied.length} of ${rows.length}` : '—', last ? `in ${last.year}` : ''),
        UI.kpi('Material sold', result ? UI.tonnes(last.materialTPerYear) + '/yr' : '—', last ? `${UI.usd(revenue)} revenue` : ''),
        UI.kpi('At share ceiling', result ? String(atCap.length) : '—', `≥ 95% of ${UI.num(scenario.share)}% max share`),
        UI.kpi('Biggest relief', result && supplied.length ? UI.pct(Math.max(0, ...supplied.map(r => relief(r.key) || 0))) : '—',
          supplied.length ? UI.productName(supplied.slice().sort((a, b) => (relief(b.key) || 0) - (relief(a.key) || 0))[0].key) : ''),
      );
      const columns = [
        { key: 'name', label: 'Material', get: r => r.name, render: r => el('span', {}, [el('a', { href: href('markets', r.key), text: r.name }), el('span', { class: 'cell-sub', text: r.basis })]) },
        { key: 'out', label: `Output ${year}`, num: true, get: r => out(r.key) + (last?.captiveTByProduct[r.key] || 0),
          render: r => el('span', {}, [out(r.key) > 0 ? UI.tonnes(out(r.key)) : el('span', { class: 'muted', text: '—' }),
            last?.captiveTByProduct[r.key] > 0 ? el('span', { class: 'cell-sub', text: `+${UI.tonnes(last.captiveTByProduct[r.key])} in-house` }) : null]) },
        { key: 'share', label: 'Share', num: true, title: 'Company share of world supply (market group)', get: r => share(r.key) ?? (out(r.key) > 0 ? 0 : -1),
          render: r => (share(r.key) > 0 ? shareCell(UI, share(r.key), scenario.share / 100) : el('span', { class: 'muted', text: '—' })) },
        { key: 'relief', label: 'Price relief', num: true, title: 'Fall of the realized price below the reference price', get: r => relief(r.key) ?? -1,
          render: r => (relief(r.key) > 0 ? UI.pct(relief(r.key)) : el('span', { class: 'muted', text: '—' })) },
        { key: 'demand', label: 'World demand', num: true, get: r => r.worldDemandTPerYear,
          render: r => el('span', {}, [UI.tonnes(r.worldDemandTPerYear) + '/yr', el('span', { class: 'cell-sub', text: String(r.demandYear || '') })]) },
        { key: 'growth', label: 'Growth', num: true, get: r => r.growthPerYear, render: r => UI.pct(r.growthPerYear || 0) + '/yr' },
        { key: 'price', label: 'Ref. price', num: true, get: r => r.priceUsdPerKg,
          render: r => el('span', {}, [UI.usdKg(r.priceUsdPerKg) + '/kg', r.priceBandUsdPerKg ? el('span', { class: 'cell-sub', text: r.priceBandUsdPerKg.map(UI.usdKg).join('–') }) : null]) },
        { key: 'elast', label: 'Elasticity', num: true, title: 'Price falls by elasticity × share', get: r => r.priceElasticity, render: r => (r.priceElasticity ?? 0).toFixed(2) },
        { key: 'quality', label: 'Data', get: r => r.quality, render: r => UI.qualityTag(r.quality) },
        { key: 'paths', label: 'Made by', get: r => prodBy.get(r.key).length, render: r => pathwayLinks(UI, href, prodBy.get(r.key)) },
      ];
      tableBox.replaceChildren(UI.sortableTable(columns, rows, {
        sortKey: 'out', sortDir: 'desc',
        rowHref: r => href('markets', r.key),
        rowClass: r => (out(r.key) > 0 ? 'is-supplied' : 'is-unsupplied'),
      }));
      tableBox.querySelector('table').id = 'marketsTable';
    };
    draw(Store);
    return Store.subscribe(draw);
  }

  function shareCell(UI, share, cap) {
    const frac = cap > 0 ? Math.min(1, share / cap) : 0;
    return UI.meter(UI.pct(share), frac, `${UI.pct(frac, 0)} of the ${UI.pct(cap, 1)} ceiling`);
  }

  // Lower bound of the price axis: the band's low end (or the lowest realized price), floored to
  // the tick step the chart will pick, so ticks land on round values.
  function priceFloor(band, price, ref) {
    const lo = Math.max(0, Math.min(band ? band[0] : 0, ...price) * 0.95);
    const hi = Math.max(ref * 1.12, ...price);
    if (!(lo > 0) || !(hi > lo)) return 0;
    const step = globalThis.Charts.niceStep(hi - lo, 4);
    return Math.floor(lo / step) * step;
  }

  // ---------------------------------------------------------------- detail
  function mountDetail(root, { Store, UI, Charts, href, params }) {
    const { el } = UI;
    const key = params.id;
    const m = Store.MARKETS[key];
    if (!m) {
      root.append(el('div', { class: 'empty' }, [`No market “${key}”. `, el('a', { href: href('markets'), text: 'All markets' })]));
      return null;
    }
    const group = groupOf(Store, key);
    const kpis = el('div', { class: 'kpis' });
    const outBox = el('div');
    const shareBox = el('div');
    const priceBox = el('div');
    const pathBox = el('div');
    const captiveBox = el('div');
    const band = m.priceBandUsdPerKg;
    const sources = el('ul', { class: 'list-plain sources' }, (m.sources || []).map(s => el('li', {}, s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.label }) : s.label)));
    const facts = el('dl', { class: 'facts' }, [
      el('dt', { text: 'Basis' }), el('dd', { text: m.basis || '—' }),
      el('dt', { text: 'World demand' }), el('dd', { text: `${UI.tonnes(m.worldDemandTPerYear)}/yr (${m.demandYear || '—'}), growing ${UI.pct(m.growthPerYear || 0)}/yr` }),
      el('dt', { text: 'Reference price' }), el('dd', { text: `${UI.usdKg(m.priceUsdPerKg)}/kg` + (band ? ` (band ${band.map(UI.usdKg).join('–')})` : '') }),
      el('dt', { text: 'Elasticity' }), el('dd', { text: `${UI.num(m.priceElasticity, 2)} — realized price = reference × (1 − ${UI.num(m.priceElasticity, 2)} × share)` }),
      el('dt', { text: 'Data quality' }), el('dd', {}, UI.qualityTag(m.quality)),
      group !== key ? el('dt', { text: 'Market group' }) : null,
      group !== key ? el('dd', {}, ['Shares and prices are counted on ', el('a', { href: href('markets', group), text: UI.productName(group) }), '.']) : null,
    ]);
    root.append(
      el('div', { class: 'crumbs' }, [el('a', { href: href('markets'), text: 'Markets' }), ' / ', key]),
      el('div', { class: 'view-title' }, [el('h1', { text: m.name }), UI.qualityTag(m.quality)]),
      el('div', { class: 'stack' }, [
        kpis,
        el('div', { class: 'grid grid-2' }, [
          UI.card('Company output', 'Tonnes per year sold to the market (and made in-house for the company’s own plants).', outBox),
          UI.card('Share of world supply', 'Company output ÷ world demand of the market group; dashed line is the scenario ceiling.', shareBox),
        ]),
        el('div', { class: 'grid grid-2' }, [
          UI.card('Realized price', 'Price the company sells at vs the reference price (dashed).', priceBox),
          UI.card('Who makes it', 'Pathways producing this material as primary product or coproduct; plants built in the current run.', [pathBox, captiveBox]),
        ]),
        UI.card('Market data', null, [facts, m.note ? el('p', { class: 'market-note', text: m.note }) : null, el('h3', { class: 'sources-head', text: 'Sources' }), sources]),
      ]),
    );

    const prods = producers(Store, key);
    let lastResult;
    const draw = ({ result, scenario }) => {
      if (result === lastResult && kpis.childElementCount) return;
      lastResult = result;
      if (!result) {
        kpis.replaceChildren(UI.kpi('World demand', UI.tonnes(m.worldDemandTPerYear), `${m.demandYear}`), UI.kpi('Reference price', UI.usdKg(m.priceUsdPerKg) + '/kg'));
        for (const box of [outBox, shareBox, priceBox]) box.replaceChildren(el('p', { class: 'chart-empty', text: 'Simulating…' }));
        return;
      }
      const tl = result.timeline;
      const last = tl.at(-1);
      const x = tl.map(t => t.year);
      const output = tl.map(t => t.outputTByProduct[key] || 0);
      const captive = tl.map(t => t.captiveTByProduct[key] || 0);
      const share = tl.map(t => t.shareByMarket[group] || 0);
      const price = tl.map(t => t.priceByProduct[key] ?? m.priceUsdPerKg);
      const cap = scenario.share / 100;
      kpis.replaceChildren(...[
        UI.kpi(`Output ${last.year}`, UI.tonnes(output.at(-1)), 'per year sold'),
        UI.kpi('Share', UI.pct(share.at(-1)), `ceiling ${UI.pct(cap)}`),
        UI.kpi('Price relief', UI.pct(last.priceReliefByMarket[group] || 0), `${UI.usdKg(price.at(-1))} vs ${UI.usdKg(m.priceUsdPerKg)}/kg`),
        UI.kpi(`World demand ${last.year}`, UI.tonnes(Company.marketDemandT(Store.MARKETS[group] || m, last.year)), `${m.demandYear}: ${UI.tonnes(m.worldDemandTPerYear)}`),
        captive.at(-1) > 0 ? UI.kpi('Made in-house', UI.tonnes(captive.at(-1)), 'captive supply, not sold') : null,
      ].filter(Boolean));

      const anyOut = output.some(v => v > 0) || captive.some(v => v > 0);
      const outSeries = [{ key: 'sold', label: 'Sold', color: 'var(--series-1)', values: output }];
      if (captive.some(v => v > 0)) outSeries.push({ key: 'captive', label: 'In-house (captive)', color: 'var(--series-2)', values: captive });
      outBox.replaceChildren(anyOut
        ? Charts.chartBlock({ x, series: outSeries, kind: outSeries.length > 1 ? 'stack' : 'area', yFormat: v => UI.num(v) + ' t', ariaLabel: `${m.name}: company output per year` })
        : el('p', { class: 'chart-empty', text: 'The company does not make this material in this scenario.' }));
      shareBox.replaceChildren(Charts.chartBlock({
        x, kind: 'area', series: [{ key: 'share', label: 'Company share', color: 'var(--series-1)', values: share }],
        refLines: [{ y: cap, label: `ceiling ${UI.pct(cap)}` }], yFormat: v => UI.pct(v), ariaLabel: `${m.name}: company share of world supply`,
      }));
      priceBox.replaceChildren(Charts.chartBlock({
        x, kind: 'line', series: [{ key: 'price', label: 'Realized price', color: 'var(--series-1)', values: price, fmt: UI.usdKg }],
        refLines: [{ y: m.priceUsdPerKg, label: `reference ${UI.usdKg(m.priceUsdPerKg)}` }], yFormat: UI.usdKg,
        // Zoom to the price band (or below it, if the company pushed the price lower).
        yMin: priceFloor(band, price, m.priceUsdPerKg), ariaLabel: `${m.name}: realized vs reference price`,
      }));

      // Producers table with plants built in the run.
      const plantsBy = {};
      for (const plant of result.plants) (plantsBy[plant.pathwayId] ||= []).push(plant);
      const suppliers = {};
      for (const plant of result.plants) {
        for (const item of plant.integration || []) {
          if (item.product !== key) continue;
          const s = (suppliers[item.supplierId] ||= { units: 0, kgPerDay: 0, consumers: new Set() });
          s.units += 1;
          s.kgPerDay += item.kgPerDay;
          s.consumers.add(plant.pathwayId);
        }
      }
      if (!prods.length) {
        pathBox.replaceChildren(el('p', { class: 'muted', text: 'No pathway in the catalog makes this material yet.' }));
      } else {
        const columns = [
          { key: 'name', label: 'Pathway', get: r => r.pathway.name, render: r => el('a', { href: href('pathways', r.pathway.id), text: r.pathway.name }) },
          { key: 'role', label: 'Role', get: r => r.role, render: r => el('span', { class: 'tag' + (r.role === 'primary' ? ' is-accent' : ''), text: r.role === 'primary' ? 'primary' : `coproduct ${UI.num(r.kgPerKg, 3)} kg/kg` }) },
          { key: 'plants', label: 'Plants', num: true, get: r => plantsBy[r.pathway.id]?.length || 0 },
          { key: 'inhouse', label: 'In-house units', num: true, title: 'Captive units of this pathway built inside other plants', get: r => (r.role === 'primary' ? suppliers[r.pathway.id]?.units || 0 : 0),
            render: r => (r.role === 'primary' && suppliers[r.pathway.id] ? el('span', { title: 'inside ' + [...suppliers[r.pathway.id].consumers].join(', ') }, String(suppliers[r.pathway.id].units)) : '—') },
        ];
        pathBox.replaceChildren(UI.sortableTable(columns, prods, { sortKey: 'plants', sortDir: 'desc', compact: true, rowClass: r => (Store.pathwayAllowed(r.pathway, scenario) ? null : 'is-dim') }));
        pathBox.querySelector('table').id = 'marketPathways';
      }
      const sup = Object.entries(suppliers);
      captiveBox.replaceChildren(...(sup.length
        ? [el('p', { class: 'captive-note' }, [
          `Made in-house in ${last.year}: ${UI.tonnes(captive.at(-1))} — `,
          ...sup.flatMap(([id, s], i) => [i ? '; ' : '', el('a', { href: href('pathways', id), text: id }), ` (${s.units} units) inside ${[...s.consumers].join(', ')}`]),
          '. Captive supply never touches the market, so it does not count toward share or price.',
        ])]
        : []));
    };
    draw(Store);
    return Store.subscribe(draw);
  }

  globalThis.Views.markets = {
    title: 'Markets',
    mount(root, ctx) {
      return ctx.params.id ? mountDetail(root, ctx) : mountList(root, ctx);
    },
  };
})();
