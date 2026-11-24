// App shell: hash router, header, theme. Views register themselves on globalThis.Views:
//
//   Views.company = {
//     title: 'Company',
//     mount(root, ctx) { ...; return () => cleanup(); },   // ctx: { params, Store, UI, Charts, href }
//   };
//
// URL: #/<view>[/<id>][?<scenario query>]. The query is the Store scenario and is kept across
// views, so a shared link reproduces both the screen and the scenario.
(() => {
  'use strict';
  const { el } = globalThis.UI;
  const Store = globalThis.Store;
  const Views = globalThis.Views;
  const NAV = [
    { id: 'abundance', label: 'Abundance', hint: 'How much world material can be made below today’s price, and what blocks the rest' },
    { id: 'company', label: 'Company', hint: 'The 25-year build-out, with every scenario input' },
    { id: 'energy', label: 'Energy', hint: 'What each electricity price unlocks' },
    { id: 'designs', label: 'Designs', hint: 'Parametric equipment designs and what they change' },
    { id: 'pathways', label: 'Pathways', hint: 'Each recipe: cost vs price, best sites, flowsheet' },
    { id: 'sites', label: 'Sites', hint: 'The 51 candidate sites and what gets built there' },
    { id: 'markets', label: 'Markets', hint: 'World demand, prices, and the company’s share' },
  ];

  const METHOD_URL = 'https://github.com/akarshgopal/ultimat-sim#how-the-company-simulator-works';

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart, query = ''] = raw.split('?');
    const path = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    return { view: path[0] || 'abundance', id: path[1] || null, path, query };
  }

  // Build an in-app link that keeps the current scenario query.
  function href(view, id) {
    const q = Store.urlQuery();
    return '#/' + [view, id].filter(Boolean).map(encodeURIComponent).join('/') + (q ? '?' + q : '');
  }

  let cleanup = null;
  let mounted = null;
  let lastQuery = null;
  // Scenario history: each change the user makes adds a browser history entry, so Back undoes it;
  // changes less than HISTORY_GAP_MS apart (typing a number, dragging a slider) share one entry.
  // URL updates caused by loading a URL (a link, Back/Forward) replace instead of adding.
  const HISTORY_GAP_MS = 1000;
  let loadingFromUrl = false;
  let lastChangeAt = 0;

  function render() {
    const { view, id, query } = parseHash();
    // Ask for the company simulation only on views that show it, before loading a changed
    // scenario, so a scenario change elsewhere does not start a run nobody looks at.
    Store.want(Boolean(Views[view]?.needsSimulation));
    if (query !== lastQuery && query !== Store.urlQuery()) {
      loadingFromUrl = true;
      try { Store.load(query); } finally { loadingFromUrl = false; }
    }
    lastQuery = query;
    document.querySelector('.brand').setAttribute('href', href('abundance'));
    for (const a of document.querySelectorAll('.app-nav a[data-view]')) {
      a.setAttribute('href', href(a.dataset.view));
      if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const key = view + '/' + (id || '');
    if (key === mounted) return; // scenario-only change: views react through Store.subscribe
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    mounted = key;
    const root = document.getElementById('view');
    root.replaceChildren();
    root.className = 'app-main v-' + view;
    const def = Views[view];
    if (!def) {
      root.append(el('div', { class: 'empty', text: `No view “${view}”.` }));
      return;
    }
    document.title = `${def.title}${id ? ' · ' + id : ''} — Molecular Foundry`;
    cleanup = def.mount(root, { params: { id }, Store, UI: globalThis.UI, Charts: globalThis.Charts, href }) || null;
    window.scrollTo(0, 0);
  }

  // Keep the URL's scenario query in sync with the store.
  Store.subscribe(({ scenario, result, busy }) => {
    const { path } = parseHash();
    const q = Store.urlQuery();
    const next = '#/' + (path.length ? path.map(encodeURIComponent).join('/') : 'abundance') + (q ? '?' + q : '');
    if (next !== location.hash) {
      const now = Date.now();
      if (!loadingFromUrl && now - lastChangeAt > HISTORY_GAP_MS) history.pushState(null, '', next);
      else history.replaceState(null, '', next);
      lastChangeAt = now;
      lastQuery = q;
      for (const a of document.querySelectorAll('.app-nav a[data-view], .brand')) a.setAttribute('href', href(a.dataset.view));
    }
    const status = document.getElementById('simStatus');
    status.classList.toggle('is-busy', busy);
    status.textContent = busy ? progressText(Store.progress)
      : result && !Store.stale ? `${result.summary.years}-year run · ${result.source === 'precomputed' ? 'precomputed' : result.ms + ' ms'}` : '';
    // Views mark what comes from the simulation with .sim-result; it fades while a newer run is in
    // flight so stale numbers never pass for current ones.
    document.documentElement.classList.toggle('is-simulating', busy);
    refit(); // the status and pin labels change width
    for (const n of document.querySelectorAll('.sim-result')) {
      if (busy) n.setAttribute('aria-busy', 'true'); else n.removeAttribute('aria-busy');
    }
  });

  // Comparison bar: shown on every page while a scenario is pinned.
  function renderCompareBar({ scenario, pinned }) {
    const bar = document.getElementById('compareBar');
    const btn = document.getElementById('pinBtn');
    // Full label on wide screens, short on phones (CSS shows one of the two).
    btn.replaceChildren(el('span', { class: 'label-long', text: pinned ? 'Unpin' : 'Pin to compare' }), el('span', { class: 'label-short', text: pinned ? 'Unpin' : 'Pin' }));
    btn.setAttribute('aria-pressed', String(Boolean(pinned)));
    bar.hidden = !pinned;
    if (!pinned) { bar.replaceChildren(); return; }
    const diff = Store.describeDiff(pinned.scenario, scenario);
    bar.replaceChildren(...[
      el('strong', { text: 'Comparing with your pinned scenario' }),
      el('span', { class: 'compare-diff', text: diff.length ? 'Changed since: ' + diff.join(' · ') : 'Nothing changed yet: adjust an input to compare.' }),
      pinned.result ? null : el('span', { class: 'muted', text: '(pinned run simulating…)' }),
      el('span', { class: 'header-spacer' }),
      el('button', { type: 'button', class: 'link-button', text: 'Swap', title: 'Make the pinned scenario current and pin this one', onclick: () => Store.swap() }),
      el('button', { type: 'button', class: 'link-button', text: 'Unpin', onclick: () => Store.unpin() }),
    ].filter(Boolean));
  }
  Store.subscribe(renderCompareBar);

  // Two-row header whenever one row does not fit (fonts vary, so measure; see app.css).
  function fitHeader() {
    const root = document.documentElement;
    const header = document.querySelector('.app-header');
    root.classList.remove('header-wrap');
    if (header.scrollWidth > header.clientWidth + 1) root.classList.add('header-wrap');
  }
  let fitFrame = 0;
  const refit = () => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(fitHeader); };

  function progressText(p) {
    return p && p.total ? `Simulating… year ${Math.min(p.done + 1, p.total)} of ${p.total}` : 'Simulating…';
  }
  Store.onProgress(p => {
    if (Store.busy) document.getElementById('simStatus').textContent = progressText(p);
  });

  function initTheme() {
    const btn = document.getElementById('themeToggle');
    const stored = (() => { try { return localStorage.getItem('foundry.theme'); } catch { return null; } })();
    if (stored) document.documentElement.dataset.theme = stored;
    const current = () => document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const label = () => { btn.textContent = current() === 'dark' ? 'Light' : 'Dark'; };
    label();
    btn.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('foundry.theme', next); } catch { /* private mode */ }
      label();
    });
  }

  // Copy link: the URL already carries the view and the scenario, so a copy reproduces both.
  function initCopyLink() {
    const btn = document.getElementById('copyLink');
    let timer = 0;
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Copied'; }
      catch { btn.textContent = 'Copy from the address bar'; }
      clearTimeout(timer);
      timer = setTimeout(() => { btn.textContent = 'Copy link'; }, 1500);
    });
  }

  // Skip link: move focus to the page content without changing the URL (the hash is the route).
  function initSkipLink() {
    document.getElementById('skipLink').addEventListener('click', ev => {
      ev.preventDefault();
      const main = document.getElementById('view');
      main.focus({ preventScroll: true });
      main.scrollIntoView();
    });
  }

  // Offline: the deployed build marks the page with <meta name="foundry-offline" content="sw.js">
  // (tests can set globalThis.FOUNDRY_OFFLINE instead). Registers the service worker (sw.js: network
  // first, cached copy when offline) and hands it the URLs this page has already loaded.
  function initOffline() {
    const url = document.querySelector('meta[name="foundry-offline"]')?.content || globalThis.FOUNDRY_OFFLINE;
    if (!url || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(url).then(() => navigator.serviceWorker.ready).then(reg => {
      const loaded = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map(e => e.name)];
      reg.active?.postMessage({ cacheUrls: [...new Set(loaded)] });
    }).catch(() => { /* offline support is best effort */ });
  }

  function initPin() {
    document.getElementById('pinBtn').addEventListener('click', () => (Store.pinned ? Store.unpin() : Store.pin()));
  }

  function init() {
    const nav = document.querySelector('.app-nav');
    for (const item of NAV) nav.append(el('a', { href: '#/' + item.id, 'data-view': item.id, title: item.hint, text: item.label }));
    // How it works: the README's method, results, data sources and known limits.
    nav.append(el('a', { class: 'nav-external', href: METHOD_URL, target: '_blank', rel: 'noopener',
      title: 'How the model works, its data sources and known limits (README on GitHub, opens in a new tab)', text: 'Method ↗' }));
    initTheme();
    initCopyLink();
    initPin();
    initSkipLink();
    initOffline();
    renderCompareBar(Store);
    fitHeader();
    window.addEventListener('resize', refit);
    document.fonts?.ready.then(refit);
    const { view, query } = parseHash();
    Store.want(Boolean(Views[view]?.needsSimulation));
    loadingFromUrl = true;
    try { Store.load(query); } finally { loadingFromUrl = false; }
    lastQuery = query;
    window.addEventListener('hashchange', render);
    render();
  }

  init();
})();
