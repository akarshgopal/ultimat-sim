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
    { id: 'abundance', label: 'Abundance' },
    { id: 'company', label: 'Company' },
    { id: 'energy', label: 'Energy' },
    { id: 'designs', label: 'Designs' },
    { id: 'pathways', label: 'Pathways' },
    { id: 'sites', label: 'Sites' },
    { id: 'markets', label: 'Markets' },
  ];

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart, query = ''] = raw.split('?');
    const path = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    return { view: path[0] || 'abundance', id: path[1] || null, path, query };
  }

  // Build an in-app link that keeps the current scenario query.
  function href(view, id) {
    const q = Store.toQuery(Store.scenario);
    return '#/' + [view, id].filter(Boolean).map(encodeURIComponent).join('/') + (q ? '?' + q : '');
  }

  let cleanup = null;
  let mounted = null;
  let lastQuery = null;

  function render() {
    const { view, id, query } = parseHash();
    if (query !== lastQuery && query !== Store.toQuery(Store.scenario)) Store.load(query);
    lastQuery = query;
    for (const a of document.querySelectorAll('.app-nav a')) {
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

  // Keep the URL's scenario query in sync with the store (without adding history entries).
  Store.subscribe(({ scenario, result, busy }) => {
    const { path } = parseHash();
    const q = Store.toQuery(scenario);
    const next = '#/' + (path.length ? path.map(encodeURIComponent).join('/') : 'abundance') + (q ? '?' + q : '');
    if (next !== location.hash) {
      history.replaceState(null, '', next);
      lastQuery = q;
      for (const a of document.querySelectorAll('.app-nav a')) a.setAttribute('href', href(a.dataset.view));
    }
    const status = document.getElementById('simStatus');
    status.classList.toggle('is-busy', busy);
    status.textContent = busy ? 'Simulating…'
      : result ? `${result.summary.years}-year run · ${result.ms} ms` : '';
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

  function init() {
    const nav = document.querySelector('.app-nav');
    for (const item of NAV) nav.append(el('a', { href: '#/' + item.id, 'data-view': item.id, text: item.label }));
    initTheme();
    const { query } = parseHash();
    Store.load(query);
    lastQuery = query;
    window.addEventListener('hashchange', render);
    render();
  }

  init();
})();
