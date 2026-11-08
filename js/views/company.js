// Company view: what the company makes (abundance), whether it pays for itself (feasibility),
// what it builds where and when, and the scenario that drives it.
// Registers globalThis.Views.company. Uses Store / UI / Charts from the shell.
(() => {
  'use strict';

  const TOP_MARKETS = 7; // featured markets (sticky colour slots); the rest fold into "Other"

  globalThis.Views.company = {
    title: 'Company',
    mount(root, ctx) {
      const { Store, UI, Charts, href } = ctx;
      const { el } = UI;
      const Company = globalThis.FoundryCompany;
      const FIELDS = Store.FIELDS;

      // ------------------------------------------------------------ helpers
      const groupOf = (product, config) => (config?.marketGroups?.[product]) || product;
      const tonnesPerYear = t => (Number.isFinite(t) ? UI.num(t) + ' t/yr' : '—');
      const mt = t => (Number.isFinite(t) ? UI.num(t / 1e6) + ' Mt' : '—');
      const km2 = ha => (Number.isFinite(ha) ? UI.num(ha / 100) + ' km²' : '—');
      const sum = values => values.reduce((a, b) => a + (Number(b) || 0), 0);
      // Compact material label: kit short names, else the market name without its parenthetical.
      const label = key => (UI.shortName(key) !== UI.productName(key) ? UI.shortName(key) : UI.productName(key).replace(/\s*\(.*\)\s*$/, '')) || key;
      const pctTick = v => +(v * 100).toFixed(1) + '%';
      const pathwayName = id => Store.pathwayById.get(id)?.name || id;
      const siteName = id => Store.siteById.get(id)?.name || id;

      // Output by market group, per year.
      function outputByMarket(row, config) {
        const out = {};
        for (const [product, t] of Object.entries(row.outputTByProduct || {})) {
          const g = groupOf(product, config);
          out[g] = (out[g] || 0) + t;
        }
        return out;
      }

      // Headline abundance numbers for a result (also used by Compare).
      function headline(result) {
        const s = result.summary;
        const last = result.timeline.at(-1) || {};
        let relief = { key: null, v: 0 };
        for (const [key, v] of Object.entries(last.priceReliefByMarket || {})) if (v > relief.v) relief = { key, v };
        return {
          finalT: s.finalMaterialTPerYear,
          cumT: s.cumulativeMaterialT,
          materials: s.materialsCount,
          relief,
          pvGWp: s.finalPvGWp,
          landHa: s.finalLandHa,
          plants: s.plants,
          netAssets: s.finalNetAssetsUsd,
          minCash: s.minCashUsd,
          year: last.year,
        };
      }

      // ------------------------------------------------------------ skeleton
      const subtitle = el('p');
      const panel = el('aside', { class: 'card sticky scenario', 'aria-label': 'Scenario' });
      const mainCol = el('div', { class: 'stack company-main' });
      root.append(
        el('div', { class: 'view-title' }, [el('h1', { text: 'Company' }), subtitle]),
        el('div', { class: 'grid grid-sidebar' }, [panel, mainCol]),
      );

      const kpiSlot = el('div', { class: 'kpis' });
      const compareSlot = el('div', { class: 'compare-body' });
      const compare = el('details', { class: 'compare' }, [el('summary'), compareSlot]);
      const abundanceSlot = el('div', { class: 'stack' });
      const feasibleSlot = el('div', { class: 'stack' });
      const buildSlot = el('div', { class: 'stack' });
      const caveats = el('details', { class: 'card caveats' }, [el('summary', { text: 'Caveats' }), el('ul', { class: 'list-plain' })]);
      mainCol.append(
        el('section', { class: 'section', 'aria-labelledby': 'co-abundance' }, [
          el('div', { class: 'section-head' }, [el('h2', { id: 'co-abundance', text: 'Abundance' }), el('p', { class: 'muted', text: 'What the company makes, and what it does to world supply and prices.' })]),
          kpiSlot, compare, abundanceSlot,
        ]),
        el('section', { class: 'section', 'aria-labelledby': 'co-feasible' }, [
          el('div', { class: 'section-head' }, [el('h2', { id: 'co-feasible', text: 'Feasibility' }), el('p', { class: 'muted', text: 'The constraint: every plant pays back its capital and the company funds its own growth.' })]),
          feasibleSlot,
        ]),
        el('section', { class: 'section', 'aria-labelledby': 'co-build' }, [
          el('div', { class: 'section-head' }, [el('h2', { id: 'co-build', text: 'What it builds, where, when' })]),
          buildSlot,
        ]),
        caveats,
      );

      // ------------------------------------------------------------ scenario panel
      const inputs = new Map(); // key → { input, range?, field }
      const objectiveSeg = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Objective' });
      for (const [id, label] of [['abundance', 'Abundance'], ['profit', 'Profit']]) {
        objectiveSeg.append(el('button', {
          type: 'button', 'data-objective': id, text: label,
          onclick: () => { if (Store.scenario.objective !== id) Store.update({ objective: id }, { immediate: true }); },
        }));
      }
      const objectiveHint = el('p', { class: 'field-hint' });

      function numberField(f, prominent) {
        const id = 'co-f-' + f.key;
        const input = el('input', { type: 'number', id, min: f.min, max: f.max, step: f.step, inputmode: 'decimal' });
        const range = prominent ? el('input', { type: 'range', min: f.min, max: f.max, step: f.step, 'aria-label': f.label }) : null;
        const reset = el('button', { type: 'button', class: 'field-reset', title: `Changed from default ${f.def}${f.unit ? ' ' + f.unit : ''}. Click to restore.`, 'aria-label': `Restore ${f.label} default`, text: '•' });
        reset.addEventListener('click', () => Store.update({ [f.key]: f.def }));
        const field = el('div', { class: 'field' + (prominent ? ' is-prominent' : '') }, [
          el('label', { class: 'field-label', for: id }, [el('span', { text: f.label }), f.unit ? el('small', { text: f.unit }) : null]),
          el('div', { class: 'field-input' }, [range, input, reset]),
          prominent && f.hint ? el('span', { class: 'field-hint', text: f.hint }) : null,
        ]);
        if (f.hint && !prominent) field.title = f.hint;
        const commit = raw => {
          const v = Number(raw);
          if (raw === '' || !Number.isFinite(v) || v < f.min || v > f.max) { field.classList.add('is-invalid'); return; }
          field.classList.remove('is-invalid');
          if (v !== Store.scenario[f.key]) Store.update({ [f.key]: v });
        };
        input.addEventListener('input', () => commit(input.value));
        input.addEventListener('change', () => { if (field.classList.contains('is-invalid')) { field.classList.remove('is-invalid'); input.value = String(Store.scenario[f.key]); } });
        range?.addEventListener('input', () => { input.value = range.value; commit(range.value); });
        inputs.set(f.key, { input, range, field });
        return field;
      }

      const originBoxes = UI.ORIGINS.map(o => {
        const box = el('input', { type: 'checkbox', 'data-origin': o.id });
        box.addEventListener('change', () => {
          const set = new Set(Store.scenario.origins);
          if (box.checked) set.add(o.id); else set.delete(o.id);
          Store.update({ origins: UI.ORIGINS.map(x => x.id).filter(id => set.has(id)) });
        });
        return { id: o.id, box, label: el('label', { class: 'check' }, [box, UI.originDot(o.id), el('span', { text: o.label })]) };
      });
      const makeBox = el('input', { type: 'checkbox', id: 'co-make' });
      makeBox.addEventListener('change', () => Store.update({ make: makeBox.checked }));
      const infiniteBox = el('input', { type: 'checkbox', id: 'co-infinite' });
      infiniteBox.addEventListener('change', () => Store.update({ infinite: infiniteBox.checked }));

      const pathwaysSorted = Store.PATHWAYS.slice().sort((a, b) => UI.productName(a.product).localeCompare(UI.productName(b.product)) || a.id.localeCompare(b.id));
      const pathwayBoxes = pathwaysSorted.map(p => {
        const box = el('input', { type: 'checkbox', 'data-pathway': p.id });
        box.addEventListener('change', () => {
          const off = new Set(Store.scenario.off);
          if (box.checked) off.delete(p.id); else off.add(p.id);
          Store.update({ off: Store.PATHWAYS.map(x => x.id).filter(id => off.has(id)) });
        });
        const origins = [...new Set((p.feeds || []).map(f => f.origin))];
        const label = el('label', { class: 'check pathway-check', title: p.name }, [box, el('span', {}, [
          el('span', { text: UI.productName(p.product) }),
          el('small', {}, [p.id, ' ', ...origins.map(o => UI.originDot(o))]),
        ])]);
        return { p, box, label };
      });
      const pathwayCount = el('span', { class: 'muted' });
      const pathwayDetails = el('details', { class: 'pathway-list' }, [
        el('summary', {}, [el('span', { text: 'Pathways ' }), pathwayCount]),
        el('div', { class: 'row pathway-actions' }, [
          el('button', { type: 'button', class: 'link-button', text: 'All', onclick: () => Store.update({ off: [] }) }),
          el('button', { type: 'button', class: 'link-button', text: 'None', onclick: () => Store.update({ off: Store.PATHWAYS.map(p => p.id) }) }),
        ]),
        el('div', { class: 'pathway-items' }, pathwayBoxes.map(x => x.label)),
      ]);

      const copyBtn = el('button', { type: 'button', class: 'button', text: 'Copy link' });
      copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(location.href); copyBtn.textContent = 'Copied'; } catch { copyBtn.textContent = 'Copy from address bar'; }
        setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1500);
      });
      const resetBtn = el('button', { type: 'button', class: 'button', text: 'Reset' });
      resetBtn.addEventListener('click', () => Store.reset());
      const changedCount = el('span', { class: 'muted changed-count' });

      const group = (title, key) => el('div', { class: 'form-section' }, [
        el('h3', { text: title }),
        el('div', { class: 'field-grid' }, FIELDS.filter(f => f.group === key).map(f => numberField(f))),
      ]);
      // Narrow screens: only objective + goal show until expanded (CSS decides when this applies).
      panel.classList.add('is-collapsed');
      const expandBtn = el('button', { type: 'button', class: 'link-button scenario-expand', 'aria-expanded': 'false', text: 'All inputs' });
      expandBtn.addEventListener('click', () => {
        const open = panel.classList.toggle('is-collapsed') === false;
        expandBtn.setAttribute('aria-expanded', String(open));
        expandBtn.textContent = open ? 'Fewer inputs' : 'All inputs';
      });
      panel.append(
        el('div', { class: 'scenario-head' }, [el('h2', { text: 'Scenario' }), el('span', { class: 'row' }, [changedCount, expandBtn])]),
        el('div', { class: 'field' }, [el('span', { class: 'field-label', text: 'Build objective' }), objectiveSeg, objectiveHint]),
        ...FIELDS.filter(f => f.group === 'goal').map(f => numberField(f, true)),
        group('Finance', 'finance'),
        group('Build', 'build'),
        group('Cost', 'cost'),
        el('div', { class: 'form-section' }, [
          el('h3', { text: 'Feedstock origins' }),
          el('div', { class: 'origin-grid' }, originBoxes.map(o => o.label)),
        ]),
        el('div', { class: 'form-section stack-tight' }, [
          el('label', { class: 'check', for: 'co-make' }, [makeBox, el('span', {}, ['Make intermediates in-house', el('small', { text: 'Build a captive H₂/NH₃/methanol/glass unit when cheaper than buying.' })])]),
          el('label', { class: 'check', for: 'co-infinite' }, [infiniteBox, el('span', {}, ['Infinite sources only', el('small', { text: 'Only plants fed by ocean, brine, air, rock, water or captive units.' })])]),
        ]),
        el('div', { class: 'form-section' }, [pathwayDetails]),
        el('div', { class: 'form-section row' }, [resetBtn, copyBtn]),
      );

      function syncPanel(s) {
        const d = Store.defaults();
        let changed = 0;
        for (const f of FIELDS) {
          const { input, range, field } = inputs.get(f.key);
          if (document.activeElement !== input && !field.classList.contains('is-invalid')) input.value = String(s[f.key]);
          if (range && document.activeElement !== range) range.value = String(s[f.key]);
          const isChanged = s[f.key] !== f.def;
          field.classList.toggle('is-changed', isChanged);
          if (isChanged) changed += 1;
        }
        for (const b of objectiveSeg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.objective === s.objective));
        objectiveHint.textContent = s.objective === 'abundance'
          ? 'Build the feasible plant (NPV ≥ 0) with the most lifetime tonnes, counting what its surplus funds.'
          : 'Build the highest-NPV plant each time (for comparison).';
        if (s.objective !== d.objective) changed += 1;
        const origins = new Set(s.origins);
        for (const o of originBoxes) o.box.checked = origins.has(o.id);
        if (s.origins.length !== d.origins.length) changed += 1;
        infiniteBox.checked = s.infinite;
        makeBox.checked = s.make || s.infinite;
        makeBox.disabled = s.infinite;
        if (s.infinite) changed += 1;
        if (!s.make) changed += 1;
        const off = new Set(s.off);
        let inPlay = 0;
        for (const { p, box, label } of pathwayBoxes) {
          box.checked = !off.has(p.id);
          const allowed = Store.pathwayAllowed(p, s);
          if (allowed) inPlay += 1;
          label.classList.toggle('is-dim', !off.has(p.id) && !allowed);
        }
        if (off.size) changed += 1;
        pathwayCount.textContent = `${inPlay} of ${Store.PATHWAYS.length} in play`;
        changedCount.textContent = changed ? `${changed} changed` : 'defaults';
      }

      // ------------------------------------------------------------ compare
      let compareCache = null; // { query, other, head }
      const compareSummary = compare.querySelector('summary');
      function otherObjective() { return Store.scenario.objective === 'abundance' ? 'profit' : 'abundance'; }
      function renderCompareSummary() {
        compareSummary.textContent = `Compare with the ${otherObjective()} objective`;
      }
      function renderCompare() {
        renderCompareSummary();
        if (!compare.open) return;
        const result = Store.result;
        if (!result) { compareSlot.replaceChildren(el('p', { class: 'muted', text: 'Waiting for the first run…' })); return; }
        const query = Store.toQuery(Store.scenario);
        const other = otherObjective();
        if (!compareCache || compareCache.query !== query) {
          compareSlot.replaceChildren(el('p', { class: 'muted', text: `Simulating the ${other} objective…` }));
          const scenario = { ...Store.scenario, objective: other };
          setTimeout(() => {
            if (!compare.isConnected || !compare.open || Store.toQuery(Store.scenario) !== query) return;
            const r = Company.simulateCompany({ pathways: Store.PATHWAYS, markets: Store.MARKETS, sites: Store.SITES, config: Store.toConfig(scenario) });
            compareCache = { query, other, head: headline(r) };
            renderCompare();
          }, 30);
          return;
        }
        const a = headline(result);
        const b = compareCache.head;
        const delta = (x, y) => (x > 0 && Number.isFinite(y) ? (y - x) / x : null);
        const rows = [
          ['Material, final year', a.finalT, b.finalT, tonnesPerYear],
          ['Cumulative material', a.cumT, b.cumT, mt],
          ['Materials made', a.materials, b.materials, v => String(v)],
          ['Biggest price relief', a.relief.v, b.relief.v, UI.pct],
          ['Plants', a.plants, b.plants, v => String(v)],
          ['PV', a.pvGWp, b.pvGWp, v => UI.num(v) + ' GWp'],
          ['Net assets, final year', a.netAssets, b.netAssets, UI.usd],
        ];
        const cur = Store.scenario.objective;
        const table = el('table', { class: 'data-table compact' }, [
          el('thead', {}, el('tr', {}, [
            el('th', { scope: 'col', text: 'Headline' }),
            el('th', { scope: 'col', class: 'num', text: cur + ' (this run)' }),
            el('th', { scope: 'col', class: 'num', text: compareCache.other }),
            el('th', { scope: 'col', class: 'num', text: 'Δ vs this run' }),
          ])),
          el('tbody', {}, rows.map(([label, x, y, fmt]) => {
            const d = delta(x, y);
            return el('tr', {}, [
              el('th', { scope: 'row', text: label }),
              el('td', { class: 'num', text: fmt(x) }),
              el('td', { class: 'num', text: fmt(y) }),
              el('td', { class: 'num muted', text: d == null ? '—' : (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d * 100).toFixed(1) + '%' }),
            ]);
          })),
        ]);
        compareSlot.replaceChildren(el('div', { class: 'table-scroll' }, table),
          el('p', { class: 'muted', text: `Same scenario, objective switched to ${compareCache.other}; run once on this page when opened.` }));
      }
      compare.addEventListener('toggle', renderCompare);

      // ------------------------------------------------------------ result rendering
      const chartCard = (title, sub, spec, extra) => el('div', { class: 'card chart-card' }, [
        el('div', { class: 'card-head' }, [el('div', {}, [el('h3', { text: title }), sub ? el('p', { text: sub }) : null]), extra || null]),
        Charts.chartBlock(spec),
      ]);

      function featuredMarkets(result) {
        const last = result.timeline.at(-1);
        const out = outputByMarket(last, result.config);
        const byTonnes = Object.keys(out).sort((a, b) => out[b] - out[a]);
        const relief = last.priceReliefByMarket || {};
        const byRelief = Object.keys(relief).filter(k => relief[k] > 0).sort((a, b) => relief[b] - relief[a]);
        const picked = [];
        for (const k of byTonnes.slice(0, 4)) picked.push(k);
        for (const k of byRelief) { if (picked.length >= TOP_MARKETS) break; if (!picked.includes(k)) picked.push(k); }
        for (const k of byTonnes) { if (picked.length >= TOP_MARKETS) break; if (!picked.includes(k)) picked.push(k); }
        return picked;
      }

      function renderAbundance(result) {
        const { timeline: tl, config } = result;
        const h = headline(result);
        kpiSlot.replaceChildren(
          UI.kpi(`Material, ${h.year}`, tonnesPerYear(h.finalT), `${UI.num(sum(tl.map(r => r.materialTPerYear)) / tl.length)} t/yr average`),
          UI.kpi('Cumulative', mt(h.cumT), `over ${tl.length} years`),
          UI.kpi('Materials', String(h.materials), 'products sold'),
          UI.kpi('Biggest price relief', h.relief.key ? UI.pct(h.relief.v) : '0%', h.relief.key ? label(h.relief.key) : 'no market moved'),
          UI.kpi('Solar PV', UI.num(h.pvGWp) + ' GWp', `${UI.num(tl.at(-1).electricityTWh)} TWh/yr`),
          UI.kpi('Land', km2(h.landHa), `${h.plants} plants`),
        );

        const featured = featuredMarkets(result);
        Charts.assignSlots(featured);
        const color = key => Charts.slotColor(Charts.productSlot.get(key));
        const years = tl.map(r => r.year);
        const outs = tl.map(r => outputByMarket(r, config));
        const matSeries = featured.map(key => ({ key, label: label(key), color: color(key), values: outs.map(o => o[key] || 0) }));
        const otherVals = outs.map(o => sum(Object.entries(o).filter(([k]) => !featured.includes(k)).map(([, v]) => v)));
        if (otherVals.some(v => v > 0)) matSeries.push({ key: 'other', label: 'Other', color: 'var(--series-other)', values: otherVals });
        const ceiling = config.build.maxMarketShare;
        const shareSeries = featured.filter(k => tl.some(r => r.shareByMarket?.[k] != null)).map(key => ({
          key, label: label(key), color: color(key), values: tl.map(r => r.shareByMarket?.[key] ?? 0),
        }));
        const reliefSeries = featured.map(key => ({ key, label: label(key), color: color(key), values: tl.map(r => r.priceReliefByMarket?.[key] ?? 0) }));

        abundanceSlot.replaceChildren(
          chartCard('Material produced', 't/yr by material; the largest four, the biggest price movers, the rest as Other', {
            x: years, series: matSeries, kind: 'stack', yFormat: UI.num, ariaLabel: 'Material produced per year by material, stacked',
          }),
          el('div', { class: 'grid grid-2' }, [
            chartCard('Share of world supply', `Company share of each world market; dashed line = ${UI.pct(ceiling)} ceiling`, {
              x: years, series: shareSeries, kind: 'line', yFormat: pctTick, refLines: [{ y: ceiling, label: 'ceiling' }],
              ariaLabel: 'Market share by market over time',
            }),
            chartCard('Price relief', 'Fall in world price caused by the company’s supply', {
              x: years, series: reliefSeries, kind: 'line', yFormat: pctTick, ariaLabel: 'Price relief by market over time',
            }),
          ]),
          marketsTable(result),
        );
      }

      function marketsTable(result) {
        const last = result.timeline.at(-1);
        const out = outputByMarket(last, result.config);
        const ceiling = result.config.build.maxMarketShare;
        const rows = Object.keys(out).map(key => ({
          key, t: out[key], share: last.shareByMarket?.[key], relief: last.priceReliefByMarket?.[key], demand: last.demandTByMarket?.[key],
        }));
        const shareCell = r => {
          if (r.share == null) return '—';
          const w = Math.min(100, (r.share / Math.max(ceiling, r.share)) * 100);
          return el('span', { class: 'share-cell' }, [
            el('span', { class: 'share-bar', title: `${UI.pct(r.share)} of world; ceiling ${UI.pct(ceiling)}` }, el('span', { style: { width: w.toFixed(1) + '%' } })),
            UI.pct(r.share),
          ]);
        };
        const table = UI.sortableTable([
          { key: 'name', label: 'Material', get: r => UI.productName(r.key), render: r => el('a', { href: href('markets', r.key), title: UI.productName(r.key), text: label(r.key) }) },
          { key: 't', label: `Output ${last.year}`, num: true, get: r => r.t, render: r => tonnesPerYear(r.t) },
          { key: 'share', label: 'Share of world', num: true, get: r => r.share, render: shareCell },
          { key: 'relief', label: 'Price relief', num: true, get: r => r.relief, render: r => (r.relief == null ? '—' : UI.pct(r.relief)) },
          { key: 'demand', label: 'World demand', num: true, get: r => r.demand, render: r => tonnesPerYear(r.demand) },
        ], rows, { sortKey: 't', sortDir: 'desc', compact: true });
        table.classList.add('materials-table');
        return UI.card('Materials', `${rows.length} materials in ${last.year}; share bar fills at the ${UI.pct(ceiling)} ceiling`, table);
      }

      function renderFeasibility(result) {
        const { timeline: tl, summary: s, config } = result;
        let minRow = tl[0];
        for (const r of tl) if (r.cashUsd < minRow.cashUsd) minRow = r;
        const built = tl.flatMap(r => r.built || []);
        const below = built.filter(b => !(b.npvUsd >= 0)).length;
        const raised = sum(tl.map(r => r.equityRaisedUsd));
        const peakDebt = Math.max(0, ...tl.map(r => r.debtUsd));
        const checks = [
          [s.minCashUsd >= 0, 'Cash never negative', `lowest ${UI.usd(s.minCashUsd)} at end of ${minRow.year}`],
          [below === 0 && built.length > 0, 'Every plant pays back its capital', built.length ? `${built.length} plants, all NPV ≥ 0 at ${UI.pct(config.finance.discountRate)}${below ? `; ${below} below` : ''}` : 'nothing built'],
          [raised === 0 && s.finalNetAssetsUsd > s.equityInUsd, 'Self-funding', `${UI.usd(s.equityInUsd)} equity in → ${UI.usd(s.finalNetAssetsUsd)} net assets${raised ? `; ${UI.usd(raised)} raised later` : ', no further raises'}`],
        ];
        const verdict = el('ul', { class: 'checks' }, checks.map(([ok, label, sub]) => el('li', { class: ok ? 'is-ok' : 'is-fail' }, [
          el('span', { class: 'check-icon', 'aria-hidden': 'true', text: ok ? '✓' : '✕' }),
          el('span', {}, [el('strong', { text: label }), el('span', { class: 'sr-only', text: ok ? ' (met)' : ' (not met)' }), el('span', { class: 'cell-sub', text: sub })]),
        ])));
        const years = tl.map(r => r.year);
        const kp = el('div', { class: 'kpis' }, [
          UI.kpi('Min cash', UI.usd(s.minCashUsd), String(minRow.year)),
          UI.kpi('Equity in', UI.usd(s.equityInUsd + raised)),
          UI.kpi(`Net assets ${tl.at(-1).year}`, UI.usd(s.finalNetAssetsUsd), s.equityMultiple ? `${UI.num(s.equityMultiple)}× equity` : null),
          UI.kpi('Total capex', UI.usd(s.totalCapexUsd), `${s.plants} plants`),
          UI.kpi('Peak debt', UI.usd(peakDebt), `${UI.pct(config.finance.debtFraction, 0)} of capex`),
        ]);
        feasibleSlot.replaceChildren(
          el('div', { class: 'card feasibility' }, [verdict, kp]),
          el('div', { class: 'grid grid-2' }, [
            chartCard('Cash flows', 'Per year', {
              x: years, kind: 'line', yFormat: UI.usd, endLabels: true, ariaLabel: 'Revenue, opex and capex per year',
              series: [
                { key: 'rev', label: 'Revenue', color: 'var(--text)', values: tl.map(r => r.revenueUsd) },
                { key: 'opex', label: 'Opex', color: 'var(--text-3)', values: tl.map(r => r.opexUsd) },
                { key: 'capex', label: 'Capex', color: 'var(--accent)', values: tl.map(r => r.capexUsd) },
              ],
            }),
            chartCard('Balance sheet', 'End of year, log scale', {
              x: years, kind: 'line', log: true, yFormat: UI.usd, endLabels: true, ariaLabel: 'Cash, debt and net assets, log scale',
              series: [
                { key: 'cash', label: 'Cash', color: 'var(--text)', values: tl.map(r => r.cashUsd) },
                { key: 'debt', label: 'Debt', color: 'var(--text-3)', dash: true, values: tl.map(r => r.debtUsd) },
                { key: 'net', label: 'Net assets', color: 'var(--accent)', values: tl.map(r => r.netAssetsUsd) },
              ],
            }),
          ]),
        );
      }

      function renderBuild(result) {
        const { timeline: tl } = result;
        const years = tl.map(r => r.year);
        const featured = [...Charts.productSlot.keys()];
        const color = key => Charts.slotColor(Charts.productSlot.get(key));
        const counts = tl.map(r => {
          const c = {};
          for (const b of r.built || []) { const g = groupOf(b.product, result.config); c[g] = (c[g] || 0) + 1; }
          return c;
        });
        const plantSeries = featured.filter(k => counts.some(c => c[k])).map(key => ({ key, label: label(key), color: color(key), values: counts.map(c => c[key] || 0) }));
        const other = counts.map(c => sum(Object.entries(c).filter(([k]) => !featured.includes(k)).map(([, v]) => v)));
        if (other.some(v => v > 0)) plantSeries.push({ key: 'other', label: 'Other', color: 'var(--series-other)', values: other });
        const pv0 = tl[0]?.pvCapexUsdPerKWp || 1;

        const log = tl.flatMap(r => (r.built || []).map(b => ({ ...b, year: r.year })));
        const logTable = UI.sortableTable([
          { key: 'year', label: 'Year', num: true, get: r => r.year },
          { key: 'pathway', label: 'Pathway', get: r => r.pathwayId, render: r => el('span', {}, [
            el('a', { href: href('pathways', r.pathwayId), title: pathwayName(r.pathwayId), text: r.pathwayId }),
            el('span', { class: 'cell-sub', text: label(groupOf(r.product, result.config)) }),
          ]) },
          { key: 'site', label: 'Site', get: r => siteName(r.siteId), render: r => el('a', { href: href('sites', r.siteId), text: siteName(r.siteId) }) },
          { key: 'size', label: 't/d', num: true, get: r => r.sizeKgPerDay, render: r => UI.num(r.sizeKgPerDay / 1000) },
          { key: 'capex', label: 'Capex', num: true, get: r => r.capexUsd, render: r => UI.usd(r.capexUsd) },
          { key: 'npv', label: 'NPV', num: true, get: r => r.npvUsd, render: r => el('span', { class: r.npvUsd >= 0 ? '' : 'is-neg', text: UI.usd(r.npvUsd) }) },
          { key: 'inhouse', label: 'In-house', get: r => (r.integration?.length ? 1 : 0), render: r => el('span', { class: 'inhouse', text: UI.inHouseText(r.integration) || '—' }) },
        ], log, { sortKey: 'year', sortDir: 'asc', compact: true });
        logTable.classList.add('build-log');

        buildSlot.replaceChildren(
          el('div', { class: 'grid grid-2' }, [
            chartCard('Plants started per year', 'By material; same colours as above', {
              x: years, series: plantSeries, kind: 'stack', yFormat: v => UI.num(v), ariaLabel: 'Plants started per year by material',
            }),
            chartCard('Cost factors', 'Capex per unit vs today (1 = today); learning + global decline', {
              x: years, kind: 'line', endLabels: true, yFormat: v => UI.num(v, 2) + '×', yMin: 0, ariaLabel: 'Cost factors over time',
              series: [
                { key: 'pv', label: 'PV', color: 'var(--accent)', values: tl.map(r => r.pvCapexUsdPerKWp / pv0) },
                { key: 'el', label: 'Electrolyzer', color: 'var(--text)', values: tl.map(r => r.costFactors?.electrolyzer) },
                { key: 'proc', label: 'Process', color: 'var(--text-3)', values: tl.map(r => r.costFactors?.process) },
                { key: 'dac', label: 'DAC', color: 'var(--text-2)', dash: true, values: tl.map(r => r.costFactors?.dac) },
              ],
            }),
            chartCard('Solar PV', 'Installed, GWp', {
              x: years, kind: 'area', series: [{ key: 'pv', label: 'PV', color: 'var(--accent)', values: tl.map(r => r.pvGWp) }],
              yFormat: v => UI.num(v), ariaLabel: 'Installed PV in GWp',
            }),
            chartCard('Land', 'Plant + PV footprint, km²', {
              x: years, kind: 'area', series: [{ key: 'land', label: 'Land', color: 'var(--text-2)', values: tl.map(r => r.landHa / 100) }],
              yFormat: v => UI.num(v), ariaLabel: 'Land in square kilometres',
            }),
          ]),
          UI.card('Build log', `${log.length} plants; click a column to sort`, log.length ? logTable : el('p', { class: 'empty', text: 'Nothing built in this scenario.' })),
        );
      }

      function renderCaveats(result) {
        const cfg = result.config;
        const items = [
          'Screening model, not a bankable forecast: constant real prices and costs over each plant’s life, no tax, no inflation.',
          'Energy is daily-average solar per site (frozen PVGIS yields) with no seasonal storage; intermittency and curtailment are not modelled.',
          `The ${UI.pct(cfg.build.maxMarketShare)} market-share ceiling and each market’s price elasticity are assumptions; price relief scales with both.`,
          'Plant TEA is screening-grade: per-kg recipes reduced from one flowsheet case at one reference site.',
          cfg.integration.enabled
            ? 'Make-in-house is one level deep and only for H₂, NH₃, methanol and glass; other intermediates are bought.'
            : 'Purchased intermediates stay purchased (make-in-house is off).',
          'Net assets compound because surplus is reinvested with debt and no dividends; read multiples as “the recipe compounds”, not as a valuation.',
        ];
        caveats.querySelector('ul').replaceChildren(...items.map(text => el('li', { text })));
      }

      // ------------------------------------------------------------ subscribe
      let lastResult = null;
      let runs = 0;
      const draw = ({ scenario, result, busy }) => {
        syncPanel(scenario);
        root.classList.toggle('is-busy', Boolean(busy));
        renderCompareSummary();
        if (!result) {
          if (!kpiSlot.childElementCount) kpiSlot.replaceChildren(el('div', { class: 'kpi' }, el('div', { class: 'kpi-label', text: 'Simulating…' })));
          return;
        }
        if (result === lastResult) return;
        lastResult = result;
        runs += 1;
        const c = result.config;
        subtitle.textContent = `Material abundance through feasible economics · ${c.years} years from ${c.startYear} · ${result.summary.objective} objective`;
        renderAbundance(result);
        renderFeasibility(result);
        renderBuild(result);
        renderCaveats(result);
        renderCompare();
        root.dataset.runs = String(runs);
        root.dataset.objective = result.summary.objective;
      };
      draw(Store);
      const unsubscribe = Store.subscribe(draw);
      return () => {
        unsubscribe();
        delete root.dataset.runs;
        delete root.dataset.objective;
        root.classList.remove('is-busy');
      };
    },
  };
})();
