// Feed conditions at the battery limit, shared by the plant models (cases/_shared.js, when
// scripts/build-pathways.mjs solves them) and the plant design view (a recipe redesigned at another
// site). Site feeds take the site's climate (data/site-climate.js: ERA5 air temperature and elevation,
// NOAA OISST sea temperature); bought fluids arrive at standard delivery conditions. No dependencies.
(function exposeFeedConditions(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoundryFeedConditions = api;
})(globalThis, () => {
  'use strict';
  const ISA_SEA_LEVEL_BAR = 1.01325;
  const SCALE_HEIGHT_M = 8434; // isothermal barometric scale height, ~15 °C
  const DESIGN_AMBIENT = Object.freeze({
    airC: 25, seaC: 25, pBar: ISA_SEA_LEVEL_BAR, source: 'no site: design ambient 25 °C, 1 atm',
    airSummerC: 25, airWinterC: 25, seaSummerC: 25, seaWinterC: 25, airMonthlyC: null, seaMonthlyC: null, seasonal: false,
  });
  // Bought fluids as delivered (resource or source id, normalized: lower case, '-feed' dropped).
  //   T_C 'ambient' = the site's mean air temperature; P_bar 'atm' = the site's barometric pressure.
  const DELIVERED = Object.freeze({
    ammonia: { T_C: -33, P_bar: 1.01325, phase: 'liquid', basis: 'refrigerated atmospheric bulk storage at the terminal' },
    co2: { T_C: 20, P_bar: 15, phase: 'gas', basis: 'bulk liquid CO₂ (−20 °C, 20 bar) vaporized at the battery limit, supplier scope' },
    hydrogen: { T_C: 'ambient', P_bar: 30, phase: 'gas', basis: 'pipeline / merchant H₂ at ~30 bar' },
    water: { T_C: 'ambient', P_bar: 3, basis: 'utility water main, ~3 bar' },
    freshwater: { T_C: 'ambient', P_bar: 3, basis: 'utility water main, ~3 bar' },
  });

  function siteClimate(location, PLACES) {
    if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) return DESIGN_AMBIENT;
    const key = `${Number(location.latitude).toFixed(3)},${Number(location.longitude).toFixed(3)}`;
    const place = PLACES[key];
    if (!place) throw new Error(`data/site-climate.js has no ${key}: run node scripts/build-site-climate.mjs`);
    // Seasonal design: the hottest and coldest monthly means (not 0.4 % design extremes, which would be
    // a few degrees beyond these).
    const air = place.airMonthlyC;
    const sea = place.sea?.monthlyC || null;
    return {
      seasonal: true,
      airMonthlyC: air,
      seaMonthlyC: sea,
      airSummerC: Math.max(...air),
      airWinterC: Math.min(...air),
      seaSummerC: sea ? Math.max(...sea) : null,
      seaWinterC: sea ? Math.min(...sea) : null,
      airC: place.airC,
      seaC: place.sea ? place.sea.meanC : null,
      pBar: Number((ISA_SEA_LEVEL_BAR * Math.exp(-place.elevationM / SCALE_HEIGHT_M)).toFixed(4)),
      source: `${place.name}: ERA5 air ${place.airC} °C, elevation ${place.elevationM} m${place.sea ? `, OISST sea ${place.sea.meanC} °C` : ''}`,
    };
  }

  // Conditions for one source, from its resource (or node) id and the site's climate.
  function feedConditions(id, climate) {
    const key = String(id).toLowerCase().replace(/-feed$/, '').replace(/^ocean-/, '');
    const d = DELIVERED[key];
    // T_C is the annual mean; T_summer_C / T_winter_C the hottest and coldest monthly means.
    const range = (mean, summer, winter) => ({ T_C: mean, T_summer_C: summer ?? mean, T_winter_C: winter ?? mean });
    if (d) {
      const ambient = d.T_C === 'ambient';
      return {
        ...(ambient ? range(climate.airC, climate.airSummerC, climate.airWinterC) : range(d.T_C)),
        P_bar: d.P_bar === 'atm' ? climate.pBar : d.P_bar,
        ...(d.phase ? { phase: d.phase } : {}),
      };
    }
    // Open seawater intake at the site's sea temperature (air temperature where no ocean cell is near).
    if (/seawater|ocean/.test(key)) {
      return climate.seaC != null
        ? { ...range(climate.seaC, climate.seaSummerC, climate.seaWinterC), P_bar: climate.pBar }
        : { ...range(climate.airC, climate.airSummerC, climate.airWinterC), P_bar: climate.pBar };
    }
    // Air, brine pools and wells, rock, ore and everything bought in bulk: site ambient, site pressure.
    return { ...range(climate.airC, climate.airSummerC, climate.airWinterC), P_bar: climate.pBar };
  }

  return { ISA_SEA_LEVEL_BAR, DESIGN_AMBIENT, DELIVERED, siteClimate, feedConditions };
});
