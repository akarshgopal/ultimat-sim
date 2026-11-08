// Runs the company simulation off the main thread. Message: { id, config } → { id, result }.
/* global importScripts, FoundryCompany, FoundryPathways, FoundryMarkets, FoundrySites */
importScripts('../engine/company.js', '../data/pathways.js', '../data/markets.js', '../data/sites.js');

self.addEventListener('message', ev => {
  const { id, config } = ev.data || {};
  try {
    const result = FoundryCompany.simulateCompany({
      pathways: FoundryPathways.PATHWAYS,
      markets: FoundryMarkets.MARKETS,
      sites: FoundrySites.SITES,
      config,
    });
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error && error.message || error) });
  }
});
