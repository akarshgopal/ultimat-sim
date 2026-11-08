// Location tab: site presets, coordinates, PVGIS / screening solar binding.
// Part of the flowsheet app split out of js/flowsheet-app.js; shares state through
// globalThis.FlowsheetApp (see the entry file).
(() => {
  const app = globalThis.FlowsheetApp = globalThis.FlowsheetApp || {};
  Object.assign(app, {
    applyCoordinates, applySitePreset, bindLocation, displayInputNumber, escapeHtml,
    formatDisplayNumber, humanizeUiText, matchingPresetId, nodeDisplayLabel, populateSitePresets,
    refreshSiteElectricity, roundTaggedQuantities, sitePresets,
  });

  function refreshSiteElectricity() {
    if (!app.site?.resources?.electricity) return;
    const hours = FlowsheetSolver.hourlyProfile?.(app.site);
    const monthly = app.site.meteo?.monthlyPVKWhPerKWp;
    const fromMonth = Array.isArray(monthly) ? monthly[app.site.month || 0] : null;
    const daily = hours
      ? hours.reduce((sum, value) => sum + value, 0)
      : Number(fromMonth || app.site.dailyPVKWhPerKWp) || 0;
    const kWh = daily * Number(app.site.solarKWp || 0);
    app.site.resources.electricity.stream = { kind: 'electricity', kWh };
    app.site.dailyPVKWhPerKWp = daily;
    if (app.site.meteo) {
      app.site.meteo.dailyPVKWhPerKWp = hours ? daily : (fromMonth || daily);
    }
    for (const current of app.graph.nodes.filter(item => item.siteResource === 'electricity')) {
      current.rate = kWh;
      app.updateSourceStream(current);
    }
  }

  function sitePresets() {
    const data = globalThis.SITE_PRESETS;
    return Array.isArray(data) ? data : [];
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function defaultSiteRights() {
    return {
      gridImport: { kind: 'grid', status: 'unverified', authorize: false, note: 'Unverified grid access; zero authorized imports' },
      freshwater: { kind: 'freshwater', status: 'unverified', authorize: false, note: 'Unverified freshwater access; zero authorized supply' },
      seawaterIntake: { kind: 'intake', status: 'unverified', authorize: false, note: 'No seawater intake permit verified' },
      seawaterDischarge: { kind: 'discharge', status: 'unverified', authorize: false, note: 'No seawater discharge permit verified' },
      brineConcession: { kind: 'concession', status: 'unverified', authorize: false, note: 'No brine or mineral concession verified' },
      saltPurchase: { kind: 'purchase', status: 'unverified', authorize: false, note: 'No salt purchase agreement verified' },
    };
  }

  function rightsFromHints(hints = {}) {
    const rights = defaultSiteRights();
    const keys = app.RIGHT_KEYS || Object.keys(rights);
    for (const key of keys) {
      const hint = hints[key];
      if (!hint) continue;
      const status = hint.status === 'assumed' ? 'assumed' : 'unverified';
      rights[key] = {
        kind: hint.kind || app.RIGHT_KINDS?.[key] || rights[key].kind,
        status,
        authorize: status === 'assumed',
        note: hint.note || rights[key].note,
      };
    }
    return rights;
  }

  function populateSitePresets() {
    const select = document.getElementById('sitePreset');
    const presets = sitePresets();
    if (!select || !presets.length) return;
    const groups = [];
    const byRegion = new Map();
    for (const preset of presets) {
      const region = preset.region || 'Other';
      if (!byRegion.has(region)) {
        byRegion.set(region, []);
        groups.push(region);
      }
      byRegion.get(region).push(preset);
    }
    const options = ['<option value="">Choose a site…</option>'];
    for (const region of groups) {
      const items = byRegion.get(region).map(preset => (
        `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`
      )).join('');
      options.push(`<optgroup label="${escapeHtml(region)}">${items}</optgroup>`);
    }
    select.innerHTML = options.join('');
  }

  function presetNear(preset, latitude, longitude) {
    return Math.abs(preset.latitude - latitude) < 0.01 && Math.abs(preset.longitude - longitude) < 0.01;
  }

  function matchingPresetId() {
    const lat = Number(app.site?.latitude);
    const lon = Number(app.site?.longitude);
    const presets = sitePresets();
    const named = app.site?.id ? presets.find(preset => preset.id === app.site.id) : null;
    if (named && Number.isFinite(lat) && Number.isFinite(lon) && presetNear(named, lat, lon)) return named.id;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
    const match = presets.find(preset => presetNear(preset, lat, lon));
    return match?.id || '';
  }

  function brinePlaceLabel(text, assayId) {
    const blob = `${assayId || ''} ${text || ''}`;
    if (/zabuye|zhabuye/i.test(blob)) return 'Zabuye';
    if (/dead[- ]sea/i.test(blob)) return 'Dead Sea';
    if (/atacama/i.test(blob)) return 'Atacama';
    if (/uyuni/i.test(blob)) return 'Uyuni';
    if (/qaidam/i.test(blob)) return 'Qaidam';
    if (/salton/i.test(blob)) return 'Salton Sea';
    if (/great salt/i.test(blob)) return 'Great Salt Lake';
    if (/danakil|dallol/i.test(blob)) return 'Danakil';
    if (/searles/i.test(blob)) return 'Searles Lake';
    return '';
  }

  function compositionsCompatible(requested, available) {
    if (!requested?.mol || !available?.mol) return true;
    const quantity = app.sourceAmount(requested);
    const limit = app.sourceAmount(available);
    if (!(quantity > 0) || !(limit > 0)) return true;
    for (const species of new Set([...Object.keys(available.mol), ...Object.keys(requested.mol)])) {
      const expected = (available.mol[species] || 0) * quantity / limit;
      if (Math.abs((requested.mol[species] || 0) - expected) > Math.max(1, expected) * 1e-9) return false;
    }
    return true;
  }

  function brinePresetClash(preset) {
    const brineNodes = app.graph.nodes.filter(node => node.siteResource === 'brine' || node.sourcePreset === 'brine');
    if (!brineNodes.length) return '';
    const currentAssay = app.site?.brineAssay?.assayId || (app.site?.assay?.kind === 'brine' ? app.site?.assay?.assayId : null);
    const nextAssay = preset?.brineAssayId || '';
    if (currentAssay && nextAssay && currentAssay === nextAssay) return '';
    const nextStream = nextAssay && globalThis.SiteAssays?.getAssay && globalThis.SiteAssays?.brineFromAssay
      ? SiteAssays.brineFromAssay(SiteAssays.getAssay(nextAssay), 1000)
      : null;
    const breaks = !nextStream || brineNodes.some(node => node.params?.stream && !compositionsCompatible(node.params.stream, nextStream));
    if (!breaks) return '';
    const currentPlace = brinePlaceLabel(app.site?.name || app.site?.assay?.summary, currentAssay);
    const nextPlace = brinePlaceLabel(preset?.name, nextAssay) || String(preset?.name || 'that site').split(',')[0];
    const currentPhrase = currentPlace ? `${currentPlace} brine` : 'the current brine';
    return `This plant is sized for ${currentPhrase}. Switching to ${nextPlace} would break the feed. Load a ${nextPlace} demo or keep the current site.`;
  }

  function applySitePreset() {
    const select = document.getElementById('sitePreset');
    const id = select?.value;
    const preset = sitePresets().find(item => item.id === id);
    if (!preset) return;
    const clash = brinePresetClash(preset);
    if (clash) {
      app.clearLocationStaleState();
      app.routeNote = clash;
      const status = document.getElementById('siteFetchStatus');
      if (status) status.textContent = clash;
      if (select) select.value = matchingPresetId();
      app.render();
      return;
    }
    app.clearLocationStaleState();
    const latEl = document.getElementById('siteLatitude');
    const lonEl = document.getElementById('siteLongitude');
    if (latEl) latEl.value = preset.latitude;
    if (lonEl) lonEl.value = preset.longitude;
    const previous = app.site || {};
    app.site = {
      id: preset.id,
      name: preset.name,
      region: preset.region,
      kind: preset.kind,
      latitude: preset.latitude,
      longitude: preset.longitude,
      notes: preset.notes,
      evidence: Array.isArray(preset.evidence) ? preset.evidence.map(item => ({ ...item })) : [],
      rights: rightsFromHints(preset.rightsHints),
      resources: {},
      solarKWp: previous.solarKWp,
      storage: previous.storage,
      month: previous.month || 0,
    };
    if (globalThis.SiteAssays?.bindPresetAssay) {
      globalThis.SiteAssays.bindPresetAssay(app.site, preset.id);
    } else if (preset.assayId) {
      app.site.assay = {
        kind: 'seawater',
        assayId: preset.assayId,
        quality: 'cited',
        summary: `Frozen assay ${preset.assayId} (bind when SiteAssays is loaded)`,
        evidence: [],
      };
    } else if (preset.brineAssayId) {
      app.site.assay = {
        kind: 'brine',
        assayId: preset.brineAssayId,
        quality: 'cited',
        summary: `Frozen process-brine assay ${preset.brineAssayId} (bind when SiteAssays is loaded)`,
        evidence: [],
      };
    } else {
      app.site.assay = {
        kind: 'seawater',
        quality: 'screening',
        summary: 'No frozen multi-ion assay for this preset — composition not bound.',
        evidence: [],
      };
    }
    app.render();
    return applyCoordinates({ fromPreset: true });
  }

  function isHourlySolar(solar) {
    return !!(solar && (
      solar.typicalMonths
      || (Array.isArray(solar.annualTypical) && solar.annualTypical.length === 24)
      || (Array.isArray(solar.typicalDayKWhPerKWp) && solar.typicalDayKWhPerKWp.length === 24)
    ));
  }

  function placesMatch(latA, lonA, latB, lonB, tolerance = 0.02) {
    return Number.isFinite(Number(latA)) && Number.isFinite(Number(lonA))
      && Number.isFinite(Number(latB)) && Number.isFinite(Number(lonB))
      && Math.abs(Number(latA) - Number(latB)) <= tolerance
      && Math.abs(Number(lonA) - Number(lonB)) <= tolerance;
  }

  function formatKWp(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? '');
    return String(Number(n.toFixed(2)));
  }

  function formatDisplayNumber(value, digits) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return String(Number(n.toFixed(digits)));
  }

  function displayInputNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    const abs = Math.abs(n);
    const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
    return String(Number(n.toFixed(digits)));
  }

  function nodeDisplayLabel(saved) {
    if (app.NODE_DISPLAY_LABELS[saved?.id]) return app.NODE_DISPLAY_LABELS[saved.id];
    if (saved?.unit === 'material-source') {
      const intake = app.intakeKind(saved);
      if (intake?.label && intake.key !== 'unknown') return intake.label;
      if (saved?.label && !app.isGenericMaterialSourceLabel(saved.label)) return saved.label;
      return intake?.label || 'Unassigned feed';
    }
    if (saved?.id && saved.id === saved.unit && app.catalog[saved.unit]?.label) return app.catalog[saved.unit].label;
    return String(saved?.id || '').split('-').map(word => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
  }

  function humanizeUiText(text) {
    let out = String(text ?? '');
    for (const [id, label] of Object.entries(app.RIGHT_DISPLAY_LABELS)) {
      out = out.replaceAll(`unverified site right: ${id}`, `unverified site right: ${label}`);
    }
    return out;
  }

  function roundTaggedQuantities(text) {
    return String(text ?? '')
      .replace(/(\d+\.\d{4,})(?=\s*g\/kg\b)/gi, num => formatDisplayNumber(num, 2))
      .replace(/(\d+\.\d{3,})(?=\s*kWp\b)/g, num => formatKWp(num));
  }

  function nearbyPresetId(latitude, longitude) {
    const presets = sitePresets();
    const named = app.site?.id ? presets.find(item => item.id === app.site.id) : null;
    if (named && placesMatch(named.latitude, named.longitude, latitude, longitude, 0.25)) return named.id;
    const near = presets.find(item => placesMatch(item.latitude, item.longitude, latitude, longitude, 0.25));
    return near?.id || '';
  }

  function livePvgisHostBlocked() {
    const host = String(globalThis.location?.hostname || '');
    return host === 'github.io' || host.endsWith('.github.io');
  }

  function isPvgisCorsError(error) {
    if (!error) return false;
    if (error.name === 'TypeError') return true;
    return /failed to fetch|networkerror|cors/i.test(String(error.message || error));
  }

  function bindLocation({ latitude, longitude, solarKWp, batteryKWh = 0, solar, name, notes, rights, evidence, keepIdentity = false }) {
    const previous = app.site;
    const placeChanged = !placesMatch(previous?.latitude, previous?.longitude, latitude, longitude);
    const inheritStory = keepIdentity || !placeChanged;
    const previousMeteo = inheritStory ? previous?.meteo : null;
    const hourlySolar = isHourlySolar(solar) ? solar : null;
    const explicitMonthly = Array.isArray(solar?.monthlyPVKWhPerKWp) ? solar.monthlyPVKWhPerKWp.slice() : null;
    const nextName = keepIdentity
      ? (name || previous?.name || app.draftSiteLabel())
      : app.draftSiteLabel();
    const nextId = keepIdentity
      ? (previous?.id || `site-${latitude}-${longitude}`)
      : `site-${latitude}-${longitude}`;
    const kWpLabel = formatKWp(solarKWp);
    const solarStory = solar?.notes
      || (solar?.quality === 'screening'
        ? `Screening-band solar at ${latitude}, ${longitude}. Frozen PVGIS fallback unavailable for this site.`
        : `Solar for ${latitude}, ${longitude}.`);
    app.site = {
      ...(previous || {}),
      id: nextId,
      name: nextName,
      latitude, longitude, solarKWp, month: previous?.month || 0,
      solar: hourlySolar,
      storage: { batteryKWh, powerKW: batteryKWh, efficiency: 0.9, initialKWh: 0 },
      resources: { ...(previous?.resources || {}) },
      notes: notes || (inheritStory ? previous?.notes : '') || solarStory,
      ...(evidence ? { evidence: evidence.map(item => ({ ...item })) } : {}),
      ...(rights ? { rights } : {}),
    };
    if (!inheritStory && Array.isArray(app.site.evidence)) {
      app.site.evidence = app.site.evidence.filter(item => !/PVGIS|kWh\/kWp/i.test(`${item?.label || ''} ${item?.url || ''}`));
    }
    if (!keepIdentity) {
      delete app.site.region;
      delete app.site.kind;
    }
    if (!app.site.resources.grid) {
      app.site.resources.grid = { stream: { kind: 'electricity', kWh: 0 }, quality: 'unverified', evidence: 'Unverified grid access; zero authorized imports' };
    }
    if (!app.site.resources.freshwater) {
      app.site.resources.freshwater = {
        stream: { kind: 'material', mol: { H2O: 0 }, phase: 'liquid', T_C: 25, P_bar: 1 },
        quality: 'unverified',
        evidence: 'Unverified freshwater access; zero authorized supply',
      };
    }
    const profile = FlowsheetSolver.hourlyProfile?.(app.site);
    const fallbackHours = hourlySolar?.typicalMonths?.[1]
      ? (hourlySolar.annualTypical || Object.values(hourlySolar.typicalMonths)[0])
      : hourlySolar?.annualTypical;
    const hours = profile?.length ? profile : (Array.isArray(fallbackHours) ? fallbackHours : []);
    const fromMonth = explicitMonthly ? Number(explicitMonthly[app.site.month || 0]) : NaN;
    const daily = hours.length
      ? hours.reduce((sum, value) => sum + value, 0)
      : (fromMonth > 0 ? fromMonth : (Number(solar?.dailyPVKWhPerKWp) || 0));
    const screening = solar?.quality === 'screening';
    const frozenMonthly = !hourlySolar && !!explicitMonthly;
    app.site.resources.electricity = {
      stream: { kind: 'electricity', kWh: daily * solarKWp },
      quality: screening ? 'screening' : 'literature-estimate',
      evidence: screening
        ? `Screening-band ~${Number(daily).toFixed(1)} kWh/kWp·day × ${kWpLabel} kWp — not a cited hourly series. Frozen PVGIS fallback unavailable for this site.`
        : frozenMonthly
          ? `Frozen ${solar.source || 'PVGIS'} monthly × ${kWpLabel} kWp`
          : `PVGIS typical-day × ${kWpLabel} kWp`,
    };
    app.site.dailyPVKWhPerKWp = daily;
    const monthlyPVKWhPerKWp = explicitMonthly
      || (Array.isArray(previousMeteo?.monthlyPVKWhPerKWp) ? previousMeteo.monthlyPVKWhPerKWp : undefined);
    let cite;
    if (solar?.url) {
      cite = {
        label: solar.citeLabel || `${solar.database || solar.source || 'PVGIS'} typical-day solar`,
        url: solar.url,
      };
    } else if (solar?.cite) cite = solar.cite;
    else if (!explicitMonthly) cite = previousMeteo?.cite;
    app.site.meteo = {
      dailyPVKWhPerKWp: daily,
      ...(monthlyPVKWhPerKWp ? { monthlyPVKWhPerKWp } : {}),
      quality: solar?.quality || 'cited',
      source: solar?.source || solar?.database || previousMeteo?.source || 'PVGIS',
      ...(solar?.retrieved || (!explicitMonthly && previousMeteo?.retrieved)
        ? { retrieved: solar?.retrieved || previousMeteo?.retrieved }
        : {}),
      ...(solar?.notes || (!explicitMonthly && previousMeteo?.notes)
        ? { notes: solar?.notes || previousMeteo?.notes }
        : {}),
      ...(cite ? { cite } : {}),
    };
    if (!app.site.rights) app.site.rights = defaultSiteRights();
    if (app.site.rights.gridImport?.authorize === false) {
      app.site.resources.grid.stream = { kind: 'electricity', kWh: 0 };
    }
    if (app.site.rights.freshwater?.authorize === false) {
      app.site.resources.freshwater.stream = { kind: 'material', mol: { H2O: 0 }, phase: 'liquid', T_C: 25, P_bar: 1 };
    }
    for (const current of app.graph.nodes.filter(item => app.units[item.unit].kind === 'source')) {
      if (!current.siteResource) app.assignSiteResource(current);
      if (current.siteResource === 'electricity') {
        current.rate = daily * solarKWp;
        app.updateSourceStream(current);
      }
    }
    app.solveAndRender();
    return app.site;
  }

  function pvgisFamily(source) {
    const head = String(source || 'PVGIS').split('/')[0].trim();
    return head || 'PVGIS';
  }

  function frozenSiteLabel(id) {
    const preset = sitePresets().find(item => item.id === id);
    if (preset?.name) return preset.name;
    return String(id || 'this site').replace(/-pvgis-\d{4}-\d{2}-\d{2}$/, '').replace(/-/g, ' ');
  }

  function diurnalProfile(daily) {
    const shape = Array.from({ length: 24 }, (_, hour) => (
      hour >= 6 && hour <= 17 ? Math.sin(Math.PI * (hour - 6) / 12) : 0
    ));
    const sum = shape.reduce((total, value) => total + value, 0) || 1;
    return shape.map(value => value * daily / sum);
  }

  function screeningSolar(latitude, longitude) {
    const band = app.MapSite?.pvScreeningBand?.(latitude, longitude);
    const daily = Number(band?.typicalKWhPerKWpDay);
    if (!(daily > 0)) return null;
    const annualTypical = diurnalProfile(daily);
    return {
      solar: {
        annualTypical,
        typicalDayKWhPerKWp: annualTypical,
        dailyPVKWhPerKWp: daily,
        monthlyPVKWhPerKWp: [daily, ...Array.from({ length: 12 }, () => daily)],
        quality: 'screening',
        source: 'pvScreeningBand',
        database: 'pvScreeningBand',
        notes: `Screening-band specific yield ~${daily.toFixed(1)} kWh/kWp·day at ${latitude}, ${longitude}. Frozen PVGIS fallback unavailable for this site. Not a cited PVGIS hourly series.`,
        cite: band.cite,
      },
      status: `Live PVGIS blocked (CORS/network). Frozen PVGIS fallback unavailable for this site. Using screening-band ~${daily.toFixed(1)} kWh/kWp·day — not a cited hourly series. Live seriescalc needs a same-origin proxy.`,
    };
  }

  function nearAlmeria(latitude, longitude) {
    return Math.abs(latitude - 36.834) < 0.2 && Math.abs(longitude + 2.463) < 0.2;
  }

  async function resolveSolarOnFetchFailure(latitude, longitude, siteId) {
    const hourly = globalThis.PvgisAlmeriaHourly;
    if (hourly && nearAlmeria(latitude, longitude)) {
      const retrieved = hourly.retrieved || '2026-09-05';
      return {
        solar: hourly,
        name: 'Almería coast · Spain',
        notes: `Frozen ${pvgisFamily(hourly.database)} typical-day for Almería (retrieved ${retrieved}) at ${latitude}, ${longitude}.`,
        latitude: 36.834,
        longitude: -2.463,
        status: `Live PVGIS blocked (CORS/network). Using frozen ${pvgisFamily(hourly.database)} for Almería (retrieved ${retrieved}).`,
      };
    }
    const sitesApi = globalThis.PvgisSites;
    if (sitesApi?.hydrate) {
      try { await sitesApi.hydrate(); } catch { /* screening band still applies */ }
    }
    const activeId = siteId || nearbyPresetId(latitude, longitude) || '';
    const match = sitesApi?.matchSeries?.(latitude, longitude, { siteId: activeId || undefined, maxDeg: 1 });
    const frozen = match?.id && match.dist != null && match.dist <= 1
      ? sitesApi.frozenSolarFor?.({ id: match.id })
      : null;
    if (frozen && match.series) {
      const retrieved = frozen.retrieved || match.series.retrieved || '';
      const family = pvgisFamily(frozen.source || match.series.source);
      const label = frozenSiteLabel(match.id);
      return {
        solar: {
          monthlyPVKWhPerKWp: frozen.monthlyPVKWhPerKWp,
          dailyPVKWhPerKWp: frozen.dailyPVKWhPerKWp,
          source: frozen.source || match.series.source,
          database: frozen.source || match.series.source,
          retrieved,
          quality: 'cited',
          url: match.series.url || '',
          citeLabel: `${family} monthly, frozen ${retrieved}`.trim(),
          notes: `Frozen ${family} monthly for ${label} (retrieved ${retrieved}) at ${latitude}, ${longitude}. Not a plant-measured irradiance series.`,
        },
        notes: `Frozen ${family} for ${label} (retrieved ${retrieved}) at ${latitude}, ${longitude}.`,
        status: `Live PVGIS blocked (CORS/network). Using frozen ${family} for ${label} (retrieved ${retrieved}).`,
      };
    }
    return screeningSolar(latitude, longitude);
  }

  async function frozenSolarAvailable(latitude, longitude, siteId) {
    if (globalThis.PvgisAlmeriaHourly && nearAlmeria(latitude, longitude)) return true;
    const sitesApi = globalThis.PvgisSites;
    if (sitesApi?.hydrate) {
      try { await sitesApi.hydrate(); } catch { /* screening band still applies */ }
    }
    const match = sitesApi?.matchSeries?.(latitude, longitude, { siteId: siteId || undefined, maxDeg: 1 });
    return !!(match?.id && match.dist != null && match.dist <= 1 && sitesApi.frozenSolarFor?.({ id: match.id }));
  }

  function readSolarKWp() {
    const input = document.getElementById('siteSolarKWp');
    const typed = Number(input?.value);
    const full = Number(input?.dataset?.fullKwp);
    if (Number.isFinite(full) && Number.isFinite(typed) && Math.abs(typed - Number(formatDisplayNumber(full, 2))) < 1e-9) {
      return full;
    }
    return typed;
  }

  async function bindResolvedSolar(latitude, longitude, solarKWp, batteryKWh, identity, activeId, status) {
    const resolved = await resolveSolarOnFetchFailure(latitude, longitude, activeId);
    if (!resolved?.solar) {
      status.textContent = 'Live PVGIS blocked (CORS/network). Frozen PVGIS fallback unavailable for this site. No screening yield for this point.';
      app.render();
      return;
    }
    const boundLatitude = resolved.latitude ?? latitude;
    const boundLongitude = resolved.longitude ?? longitude;
    const latEl = document.getElementById('siteLatitude');
    const lonEl = document.getElementById('siteLongitude');
    if (latEl) latEl.value = boundLatitude;
    if (lonEl) lonEl.value = boundLongitude;
    const moved = !placesMatch(app.site?.latitude, app.site?.longitude, boundLatitude, boundLongitude);
    bindLocation({
      latitude: boundLatitude,
      longitude: boundLongitude,
      solarKWp,
      batteryKWh,
      solar: resolved.solar,
      notes: identity.keepIdentity || !moved ? undefined : (resolved.notes || resolved.solar.notes),
      ...identity,
    });
    status.textContent = resolved.status;
  }

  async function applyCoordinates(options = {}) {
    const fromPreset = options.fromPreset === true;
    const latitude = Number(document.getElementById('siteLatitude').value);
    const longitude = Number(document.getElementById('siteLongitude').value);
    const solarKWp = readSolarKWp();
    const batteryKWh = Math.max(0, Number(document.getElementById('siteBatteryKWh').value) || 0);
    const status = document.getElementById('siteFetchStatus');
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90) {
      status.textContent = 'Latitude and longitude must be a real location.';
      return;
    }
    if (!fromPreset) {
      app.clearLocationStaleState();
      const select = document.getElementById('sitePreset');
      const chosen = sitePresets().find(preset => preset.id === select?.value);
      if (select && (!chosen || !presetNear(chosen, latitude, longitude))) select.value = '';
    }
    const identity = fromPreset
      ? { keepIdentity: true, name: app.site?.name }
      : { keepIdentity: false };
    const activeId = fromPreset ? (app.site?.id || nearbyPresetId(latitude, longitude)) : nearbyPresetId(latitude, longitude);
    // seriescalc is cross-origin and fails CORS on GitHub Pages. Use the
    // same-origin freeze when one exists for this point, and after the first
    // CORS failure do not keep calling seriescalc.
    const skipLive = app.livePvgisBlocked || (livePvgisHostBlocked() && await frozenSolarAvailable(latitude, longitude, activeId));
    if (skipLive) {
      status.textContent = 'Updating solar for these coordinates…';
      await bindResolvedSolar(latitude, longitude, solarKWp, batteryKWh, identity, activeId, status);
      return;
    }
    status.textContent = 'Fetching PVGIS hourly series…';
    try {
      const solar = await fetchPvgisHourly(latitude, longitude);
      const moved = !placesMatch(app.site?.latitude, app.site?.longitude, latitude, longitude);
      bindLocation({
        latitude, longitude, solarKWp, batteryKWh, solar,
        notes: identity.keepIdentity || !moved ? undefined : `Typical-day solar from ${solar.database || 'PVGIS'} at ${latitude}, ${longitude}.`,
        ...identity,
      });
      status.textContent = `Typical-day solar from ${solar.database || 'PVGIS'} ${solar.year || ''}`.trim();
    } catch (error) {
      if (isPvgisCorsError(error)) app.livePvgisBlocked = true;
      await bindResolvedSolar(latitude, longitude, solarKWp, batteryKWh, identity, activeId, status);
    }
  }

  async function fetchPvgisHourly(latitude, longitude) {
    // Live seriescalc is cross-origin and fails CORS on GitHub Pages.
    // applyCoordinates then uses a frozen series or the screening band.
    // Live hourly needs a same-origin proxy; this repo does not ship one.
    const url = `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?lat=${latitude}&lon=${longitude}&startyear=2023&endyear=2023&pvcalculation=1&peakpower=1&loss=14&angle=30&aspect=0&outputformat=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PVGIS ${response.status}`);
    const payload = await response.json();
    const rows = payload.outputs?.hourly;
    if (!rows?.length) throw new Error('PVGIS returned no hourly series for this location');
    const byMonth = Array.from({ length: 13 }, () => Array.from({ length: 24 }, () => []));
    for (const row of rows) {
      const stamp = String(row.time);
      byMonth[Number(stamp.slice(4, 6))][Number(stamp.slice(9, 11))].push(row.P / 1000);
    }
    const typicalMonths = {};
    const annualTypical = Array.from({ length: 24 }, () => 0);
    for (let month = 1; month <= 12; month += 1) {
      typicalMonths[month] = byMonth[month].map(values => (
        values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
      ));
      typicalMonths[month].forEach((value, hour) => { annualTypical[hour] += value / 12; });
    }
    return {
      typicalMonths, annualTypical, year: 2023,
      database: payload.inputs?.meteo_data?.radiation_db,
      url,
    };
  }
})();
