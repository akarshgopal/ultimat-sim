// Sites view: the catalog of plant sites (#/sites) and one site in detail (#/sites/<id>).
// Map: Leaflet 1.9.4 from unpkg, loaded lazily; until (or unless) it loads, an equirectangular
// SVG with a lat/lon grid and the site dots. Circle area ∝ PV built in the current run.
(() => {
  'use strict';
  const Company = globalThis.FoundryCompany;
  const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const KIND = {
    'industrial-coast': 'Industrial coast',
    'coastal-solar': 'Coastal solar',
    'desert-solar': 'Desert solar',
    'brine-hub': 'Brine hub',
  };
  const kindLabel = kind => KIND[kind] || kind || '—';

  // ---------------------------------------------------------------- Leaflet (lazy, once)
  let leafletPromise = null;
  function loadLeaflet() {
    if (globalThis.L?.map) return Promise.resolve(globalThis.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
        document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: LEAFLET_CSS, crossOrigin: '' }));
      }
      const script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.crossOrigin = '';
      script.onload = () => (globalThis.L?.map ? resolve(globalThis.L) : reject(new Error('leaflet missing')));
      script.onerror = () => reject(new Error('leaflet unavailable'));
      document.head.append(script);
    }).catch(err => { leafletPromise = null; throw err; });
    return leafletPromise;
  }

  // ---------------------------------------------------------------- data helpers
  function pvBySite(result) {
    const out = {};
    for (const plant of result?.plants || []) out[plant.siteId] = (out[plant.siteId] || 0) + (plant.pvKWp || 0);
    return out;
  }
  function plantsBySite(result) {
    const out = {};
    for (const plant of result?.plants || []) (out[plant.siteId] ||= []).push(plant);
    return out;
  }
  function hostable(Store, site) {
    return Store.PATHWAYS.filter(p => Company.siteAllowsPathway(site, p, Store.siteById));
  }

  // ---------------------------------------------------------------- map
  // opts: { sites, href(site) → '#/…', highlightId?, compact? }. Returns { el, update(pvKWpBySite, ceilingKWp), destroy }.
  function siteMap({ UI, sites, href, highlightId, compact }) {
    const { el, svg } = UI;
    const box = el('div', { class: 'site-map' + (compact ? ' is-compact' : '') });
    const W = 1000;
    const LAT_TOP = 66;
    const LAT_BOT = -54;
    const H = Math.round((W / 360) * (LAT_TOP - LAT_BOT));
    const px = lon => ((lon + 180) / 360) * W;
    const py = lat => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOT)) * H;
    const radius = (kWp, max) => (kWp > 0 ? 5 + 14 * Math.sqrt(kWp / Math.max(max, 1)) : 3.5);
    let state = { pv: {}, ceiling: 1 };

    // SVG fallback
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'map-fallback', role: 'img', 'aria-label': 'Map of catalog sites on a latitude/longitude grid' });
    const grid = svg('g', { class: 'map-grid' });
    for (let lon = -180; lon <= 180; lon += 30) grid.append(svg('line', { x1: px(lon), x2: px(lon), y1: 0, y2: H }));
    for (let lat = -30; lat <= 60; lat += 30) {
      grid.append(svg('line', { x1: 0, x2: W, y1: py(lat), y2: py(lat), class: lat === 0 ? 'is-equator' : null }));
      const t = svg('text', { x: 4, y: py(lat) - 3, class: 'map-tick' });
      t.textContent = lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`;
      grid.append(t);
    }
    for (const lon of [-120, -60, 0, 60, 120]) {
      const t = svg('text', { x: px(lon) + 3, y: H - 4, class: 'map-tick' });
      t.textContent = lon === 0 ? '0°' : `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`;
      grid.append(t);
    }
    root.append(grid);
    const dots = svg('g', { class: 'map-dots' });
    root.append(dots);
    const fallback = el('div', { class: 'map-fallback-wrap' }, [root, el('p', { class: 'map-note muted', text: 'Offline map: sites on a lat/lon grid. Circle area ∝ PV built in this run.' })]);
    box.append(fallback);

    const drawSvg = () => {
      const max = Math.max(state.ceiling, ...Object.values(state.pv));
      const ordered = sites.slice().sort((a, b) => (state.pv[b.id] || 0) - (state.pv[a.id] || 0));
      dots.replaceChildren(...ordered.map(site => {
        const kWp = state.pv[site.id] || 0;
        const a = svg('a', { href: href(site), class: 'map-site' + (kWp > 0 ? ' is-built' : '') + (site.id === highlightId ? ' is-current' : '') });
        a.append(svg('circle', { cx: px(site.longitude).toFixed(1), cy: py(site.latitude).toFixed(1), r: radius(kWp, max).toFixed(1) }));
        const title = svg('title');
        title.textContent = `${site.name} — ${kWp > 0 ? UI.num(kWp / 1e6, 3) + ' GWp PV built' : 'nothing built'}`;
        a.append(title);
        return a;
      }));
    };

    // Leaflet upgrade
    let map = null;
    let layer = null;
    let destroyed = false;
    const drawLeaflet = () => {
      const L = globalThis.L;
      if (!map || !L) return;
      layer.clearLayers();
      const max = Math.max(state.ceiling, ...Object.values(state.pv));
      for (const site of sites) {
        const kWp = state.pv[site.id] || 0;
        const marker = L.circleMarker([site.latitude, site.longitude], {
          radius: radius(kWp, max) * (compact ? 1 : 1.2),
          className: 'lf-site' + (kWp > 0 ? ' is-built' : '') + (site.id === highlightId ? ' is-current' : ''),
        });
        const link = document.createElement('a');
        link.href = href(site);
        link.textContent = site.name;
        const pop = document.createElement('div');
        pop.append(link, document.createElement('br'), kWp > 0 ? `${UI.num(kWp / 1e6, 3)} GWp PV built` : 'Nothing built in this run');
        marker.bindPopup(pop);
        marker.bindTooltip(site.name, { direction: 'top' });
        layer.addLayer(marker);
      }
    };
    loadLeaflet().then(L => {
      if (destroyed || !box.isConnected) return;
      const host = el('div', { class: 'map-leaflet' });
      box.replaceChildren(host);
      box.classList.add('is-leaflet');
      map = L.map(host, { scrollWheelZoom: false, worldCopyJump: true, attributionControl: true });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
      }).addTo(map);
      layer = L.layerGroup().addTo(map);
      const focus = sites.find(s => s.id === highlightId);
      if (focus) map.setView([focus.latitude, focus.longitude], 4);
      else map.fitBounds(sites.map(s => [s.latitude, s.longitude]), { padding: [20, 20] });
      drawLeaflet();
    }).catch(() => { /* offline or blocked: keep the SVG fallback */ });

    return {
      el: box,
      update(pv, ceilingKWp) {
        state = { pv: pv || {}, ceiling: ceilingKWp || 1 };
        drawSvg();
        drawLeaflet();
      },
      destroy() {
        destroyed = true;
        if (map) { map.remove(); map = null; }
      },
    };
  }

  // ---------------------------------------------------------------- shared bits
  function pvMeter(UI, kWp, ceilingKWp) {
    const frac = ceilingKWp > 0 ? Math.min(1, kWp / ceilingKWp) : 0;
    const bar = UI.el('span', { class: 'pv-meter', title: `${UI.pct(frac)} of the per-site ceiling` }, UI.el('span', { style: { width: (frac * 100).toFixed(1) + '%' } }));
    return UI.el('span', { class: 'pv-cell' }, [
      UI.el('span', { text: `${kWp > 0 ? UI.num(kWp / 1e6, 3) : '0'} / ${UI.num(ceilingKWp / 1e6, 3)}` }),
      bar,
    ]);
  }
  function landText(UI, site) {
    return site.landUsdPerHa > 0 ? UI.usd(site.landUsdPerHa) + '/ha' : UI.el('span', { class: 'muted', text: UI.usd(Company.DEFAULTS.defaultLandUsdPerHa) + '/ha' });
  }
  // Margin as a share of price; deep losses read as "< −100%" rather than "−7314%".
  const marginText = (UI, m) => (m < -1 ? '< −100%' : UI.pct(m, 0));
  function resourceTags(UI, site) {
    return UI.el('span', { class: 'tag-row' }, [
      site.coastal ? UI.el('span', { class: 'tag', title: site.seawaterAssayId || '' }, [UI.originDot('ocean'), 'Seawater']) : null,
      site.brineAssayId ? UI.el('span', { class: 'tag', title: site.brineAssayId }, [UI.originDot('brine'), 'Brine']) : null,
      !site.coastal && !site.brineAssayId ? UI.el('span', { class: 'muted', text: 'Inland' }) : null,
    ]);
  }

  // ---------------------------------------------------------------- list
  function mountList(root, { Store, UI, href }) {
    const { el } = UI;
    const sites = Store.SITES;
    const hostBySite = new Map(sites.map(site => [site.id, hostable(Store, site)]));
    const kpis = el('div', { class: 'kpis' });
    const map = siteMap({ UI, sites, href: site => href('sites', site.id) });
    const tableBox = el('div');
    root.append(
      el('div', { class: 'view-title' }, [
        el('h1', { text: 'Sites' }),
        el('p', { text: `${sites.length} catalog sites where the company can put solar-powered plants.` }),
      ]),
      el('div', { class: 'stack' }, [
        kpis,
        UI.card('Where the company builds', 'Circle area ∝ PV capacity built in the current run. Click a site for detail.', map.el),
        UI.card('All sites', 'PV built vs the scenario’s per-site ceiling. Click a row for detail.', tableBox),
      ]),
    );

    let lastResult;
    const draw = ({ result, scenario }) => {
      if (result === lastResult && tableBox.childElementCount) return;
      lastResult = result;
      const pv = pvBySite(result);
      const plants = plantsBySite(result);
      const ceilingKWp = scenario.pvSite * 1e6;
      map.update(pv, ceilingKWp);
      const used = sites.filter(s => pv[s.id] > 0);
      const totalKWp = Object.values(pv).reduce((a, b) => a + b, 0);
      const atCeiling = used.filter(s => pv[s.id] >= ceilingKWp * 0.95).length;
      kpis.replaceChildren(
        UI.kpi('Sites used', result ? `${used.length} of ${sites.length}` : '—', 'with at least one plant'),
        UI.kpi('PV built', result ? UI.num(totalKWp / 1e6, 3) + ' GWp' : '—', 'all plants in the run'),
        UI.kpi('Sites at ceiling', result ? String(atCeiling) : '—', `≥ 95% of ${UI.num(scenario.pvSite)} GWp`),
        UI.kpi('Best solar', UI.num(Math.max(...sites.map(s => s.pvKWhPerKWpDay)), 3), 'kWh/kWp·day'),
      );
      const columns = [
        { key: 'name', label: 'Site', get: s => s.name, render: s => el('span', {}, [el('a', { href: href('sites', s.id), text: s.name }), el('span', { class: 'cell-sub', text: s.id })]) },
        { key: 'region', label: 'Region', get: s => s.region || '' },
        { key: 'kind', label: 'Kind', get: s => kindLabel(s.kind) },
        { key: 'solar', label: 'Solar', num: true, title: 'kWh per kWp per day (PVGIS)', get: s => s.pvKWhPerKWpDay, render: s => el('span', {}, [UI.num(s.pvKWhPerKWpDay, 3), el('span', { class: 'cell-sub', text: 'kWh/kWp·d' })]) },
        { key: 'land', label: 'Land', num: true, get: s => s.landUsdPerHa, render: s => el('span', {}, [landText(UI, s), el('span', { class: 'cell-sub' }, UI.qualityTag(s.landSource?.quality) || 'default')]) },
        { key: 'res', label: 'Resources', get: s => (s.coastal ? 2 : 0) + (s.brineAssayId ? 1 : 0), render: s => resourceTags(UI, s) },
        { key: 'plants', label: 'Plants', num: true, get: s => plants[s.id]?.length || 0 },
        { key: 'pv', label: 'PV GWp / ceiling', num: true, get: s => pv[s.id] || 0, render: s => pvMeter(UI, pv[s.id] || 0, ceilingKWp) },
        { key: 'paths', label: 'Pathways', num: true, title: 'Pathways whose feeds this site can supply', get: s => hostBySite.get(s.id).length,
          render: s => el('span', { title: hostBySite.get(s.id).map(p => p.name).join('\n') }, String(hostBySite.get(s.id).length)) },
      ];
      tableBox.replaceChildren(UI.sortableTable(columns, sites, {
        sortKey: 'pv', sortDir: 'desc',
        rowHref: s => href('sites', s.id),
        rowClass: s => (pv[s.id] > 0 ? null : 'is-unbuilt'),
      }));
      tableBox.querySelector('table').id = 'sitesTable';
    };
    draw(Store);
    const unsub = Store.subscribe(draw);
    return () => { unsub(); map.destroy(); };
  }

  // ---------------------------------------------------------------- detail
  function rankAtSite(Store, site) {
    const config = Store.toConfig(Store.scenario);
    config.build.allowPathways = null;
    config.build.allowSites = [site.id];
    return Company.rankOpportunities({ pathways: Store.PATHWAYS, markets: Store.MARKETS, sites: Store.SITES, config }, { sizeMultiple: 10 });
  }

  function mountDetail(root, { Store, UI, href, params }) {
    const { el } = UI;
    const site = Store.siteById.get(params.id);
    if (!site) {
      root.append(el('div', { class: 'empty' }, [`No site “${params.id}”. `, el('a', { href: href('sites'), text: 'All sites' })]));
      return null;
    }
    const kpis = el('div', { class: 'kpis' });
    const map = siteMap({ UI, sites: Store.SITES, href: s => href('sites', s.id), highlightId: site.id, compact: true });
    const pathBox = el('div');
    const plantBox = el('div');
    const land = site.landSource;
    const facts = el('dl', { class: 'facts' }, [
      el('dt', { text: 'Location' }), el('dd', { text: `${site.latitude.toFixed(2)}°, ${site.longitude.toFixed(2)}° · ${site.region || '—'}` }),
      el('dt', { text: 'Kind' }), el('dd', { text: kindLabel(site.kind) }),
      el('dt', { text: 'Solar yield' }), el('dd', {}, [`${UI.num(site.pvKWhPerKWpDay, 3)} kWh/kWp·day`, el('span', { class: 'cell-sub', text: site.pvSource ? `Source: ${site.pvSource} (frozen PVGIS run)` : '' })]),
      el('dt', { text: 'Land price' }), el('dd', {}, [
        site.landUsdPerHa > 0 ? `${UI.usd(site.landUsdPerHa)}/ha ` : `default ${UI.usd(Company.DEFAULTS.defaultLandUsdPerHa)}/ha `,
        UI.qualityTag(land?.quality),
        el('span', { class: 'cell-sub' }, land ? [land.name + (land.url ? ' · ' : ''), land.url ? el('a', { href: land.url, target: '_blank', rel: 'noopener', text: 'source' }) : null] : 'No site-specific land price: the engine default applies.'),
      ]),
      el('dt', { text: 'Seawater' }), el('dd', {}, site.coastal ? el('code', { text: site.seawaterAssayId || 'coastal' }) : 'none (inland)'),
      el('dt', { text: 'Brine' }), el('dd', {}, site.brineAssayId ? el('code', { text: site.brineAssayId }) : 'none'),
    ]);
    root.append(
      el('div', { class: 'crumbs' }, [el('a', { href: href('sites'), text: 'Sites' }), ' / ', site.id]),
      el('div', { class: 'view-title' }, [
        el('h1', { text: site.name }),
        el('span', { class: 'tag', text: kindLabel(site.kind) }),
        resourceTags(UI, site),
      ]),
      el('div', { class: 'stack' }, [
        kpis,
        el('div', { class: 'grid site-top' }, [
          UI.card('Site', null, [facts, site.notes ? el('p', { class: 'site-notes', text: site.notes }) : null]),
          UI.card('Location', null, map.el),
        ]),
        UI.card('Pathways this site can host', 'Year-0 economics of a 10× reference-size plant at this site, in the current scenario. Sorted by margin.', pathBox),
        UI.card('Plants built here', 'In the current run.', plantBox),
      ]),
    );

    let lastResult;
    let lastScenario;
    const draw = ({ result, scenario }) => {
      if (scenario !== lastScenario) {
        lastScenario = scenario;
        drawPathways(scenario);
      }
      if (result === lastResult && plantBox.childElementCount) return;
      lastResult = result;
      const pv = pvBySite(result);
      const plants = plantsBySite(result)[site.id] || [];
      const ceilingKWp = scenario.pvSite * 1e6;
      map.update(pv, ceilingKWp);
      const capex = plants.reduce((sum, p) => sum + p.capexUsd, 0);
      const landHa = plants.reduce((sum, p) => sum + (p.landHa || 0), 0);
      kpis.replaceChildren(
        UI.kpi('Solar yield', UI.num(site.pvKWhPerKWpDay, 3), 'kWh/kWp·day'),
        UI.kpi('Land', site.landUsdPerHa > 0 ? UI.usd(site.landUsdPerHa) : '—', 'per hectare'),
        UI.kpi('Plants here', result ? String(plants.length) : '—', result ? `${UI.usd(capex)} capex` : ''),
        UI.kpi('PV built', result ? UI.num((pv[site.id] || 0) / 1e6, 3) + ' GWp' : '—', `ceiling ${UI.num(scenario.pvSite)} GWp · ${UI.pct((pv[site.id] || 0) / ceilingKWp)}`),
        UI.kpi('Land used', result ? UI.num(landHa) + ' ha' : '—', 'PV field'),
      );
      if (!plants.length) {
        plantBox.replaceChildren(el('p', { class: 'muted', text: result ? 'No plants built here in this run.' : 'Simulating…' }));
        return;
      }
      // One row per pathway: identical plants built in successive years read as one line.
      const groups = new Map();
      for (const p of plants) {
        let g = groups.get(p.pathwayId);
        if (!g) groups.set(p.pathwayId, (g = { pathwayId: p.pathwayId, product: p.product, n: 0, first: Infinity, last: -Infinity, kgPerDay: 0, capex: 0, pvKWp: 0, npv: 0, integration: p.integration }));
        g.n += 1;
        g.first = Math.min(g.first, p.builtYear);
        g.last = Math.max(g.last, p.builtYear);
        g.kgPerDay += p.sizeKgPerDay;
        g.capex += p.capexUsd;
        g.pvKWp += p.pvKWp || 0;
        g.npv += p.npvAtBuildUsd || 0;
      }
      const nameOf = id => Store.pathwayById.get(id)?.name || id;
      const columns = [
        { key: 'pathway', label: 'Pathway', get: g => nameOf(g.pathwayId),
          render: g => el('span', {}, [el('a', { href: href('pathways', g.pathwayId), text: nameOf(g.pathwayId) }), UI.inHouseText(g.integration) ? el('span', { class: 'cell-sub', text: UI.inHouseText(g.integration) }) : null]) },
        { key: 'product', label: 'Product', get: g => UI.productName(g.product), render: g => el('a', { href: href('markets', g.product), text: UI.productName(g.product) }) },
        { key: 'n', label: 'Plants', num: true, get: g => g.n },
        { key: 'year', label: 'Built', num: true, get: g => g.first, render: g => (g.first === g.last ? String(g.first) : `${g.first}–${g.last}`) },
        { key: 'size', label: 'Output', num: true, get: g => g.kgPerDay, render: g => UI.tonnes(g.kgPerDay * 0.365) + '/yr' },
        { key: 'capex', label: 'Capex', num: true, get: g => g.capex, render: g => UI.usd(g.capex) },
        { key: 'pv', label: 'PV', num: true, get: g => g.pvKWp, render: g => UI.num(g.pvKWp / 1e6, 3) + ' GWp' },
        { key: 'npv', label: 'NPV at build', num: true, get: g => g.npv, render: g => UI.usd(g.npv) },
      ];
      plantBox.replaceChildren(UI.sortableTable(columns, [...groups.values()], { sortKey: 'year', sortDir: 'asc', compact: true }));
      plantBox.querySelector('table').id = 'sitePlants';
    };

    function drawPathways(scenario) {
      const rows = rankAtSite(Store, site);
      const ids = new Set(rows.map(r => r.pathwayId));
      const blocked = hostable(Store, site).filter(p => !ids.has(p.id));
      const columns = [
        { key: 'name', label: 'Pathway', get: r => r.name,
          render: r => el('span', {}, [
            el('a', { href: href('pathways', r.pathwayId), text: r.name }),
            Store.pathwayAllowed(Store.pathwayById.get(r.pathwayId), scenario) ? null : el('span', { class: 'tag is-off', text: 'off in scenario' }),
            UI.inHouseText(r.integration) ? el('span', { class: 'cell-sub', text: UI.inHouseText(r.integration) }) : null,
          ]) },
        { key: 'product', label: 'Product', get: r => UI.productName(r.product), render: r => el('a', { href: href('markets', r.product), text: UI.productName(r.product) }) },
        { key: 'size', label: 'Output', num: true, get: r => r.annualKg, render: r => UI.tonnes(r.annualKg / 1000) + '/yr' },
        { key: 'capex', label: 'Capex', num: true, get: r => r.capex.total, render: r => UI.usd(r.capex.total) },
        { key: 'pv', label: 'PV', num: true, get: r => r.pvKWp, render: r => UI.num(r.pvKWp / 1e3) + ' MWp' },
        { key: 'lcop', label: 'Cost', num: true, title: 'Levelized cost net of coproduct credit, $/kg', get: r => r.lcopUsdPerKg, render: r => UI.usdKg(r.lcopUsdPerKg) },
        { key: 'price', label: 'Price', num: true, get: r => r.priceUsdPerKg, render: r => UI.usdKg(r.priceUsdPerKg) },
        { key: 'margin', label: 'Margin', num: true, get: r => r.marginUsdPerKg / (r.priceUsdPerKg || 1),
          render: r => el('span', { class: r.marginUsdPerKg >= 0 ? 'is-pos' : 'is-neg', text: marginText(UI, r.marginUsdPerKg / (r.priceUsdPerKg || 1)) }) },
        { key: 'npv', label: 'NPV', num: true, get: r => r.npv, render: r => el('span', { class: r.npv >= 0 ? 'is-pos' : 'is-neg', text: UI.usd(r.npv) }) },
      ];
      pathBox.replaceChildren(...[
        rows.length
          ? UI.sortableTable(columns, rows, { sortKey: 'margin', sortDir: 'desc', compact: true, rowHref: r => href('pathways', r.pathwayId), rowClass: r => (r.npv >= 0 ? null : 'is-dim') })
          : el('p', { class: 'muted', text: 'No pathway can be built here: this site lacks the feeds every pathway needs.' }),
        blocked.length ? el('p', { class: 'muted host-note', text: `Also hostable here but skipped because they still buy an intermediate (infinite sources only): ${blocked.map(p => p.name).join(', ')}.` }) : null,
      ].filter(Boolean));
      const table = pathBox.querySelector('table');
      if (table) table.id = 'sitePathways';
    }

    draw(Store);
    const unsub = Store.subscribe(draw);
    return () => { unsub(); map.destroy(); };
  }

  globalThis.Views.sites = {
    title: 'Sites',
    mount(root, ctx) {
      return ctx.params.id ? mountDetail(root, ctx) : mountList(root, ctx);
    },
  };
})();
