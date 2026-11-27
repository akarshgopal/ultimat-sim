// Off-main-thread computation for js/store.js.
//   { id, config }                    → progress messages { id, progress }, then { id, result }:
//                                       the company simulation (the main run).
//   { id, task, payload }             → { id, result }: a one-off calculation (Store.compute):
//     task 'simulate'   payload { config }
//     task 'abundance'  payload { config, sizeMultiple }   abundance scoreboard
//     task 'breakevens' payload { config, sizeMultiple }   energy break-evens
// Errors come back as { id, error }.
/* global importScripts, FoundryCompany, FoundryPathways, FoundryMarkets, FoundrySites */
importScripts('../engine/utilization.js', '../engine/feed-conditions.js', '../data/site-climate.js', '../engine/plant-design.js', '../engine/company.js', '../data/pathways.js', '../data/markets.js', '../data/sites.js');

const data = () => ({ pathways: FoundryPathways.PATHWAYS, markets: FoundryMarkets.MARKETS, sites: FoundrySites.SITES });
const TASKS = {
  simulate: ({ config }) => FoundryCompany.simulateCompany({ ...data(), config }),
  abundance: ({ config, sizeMultiple }) => FoundryCompany.abundanceScoreboard({ ...data(), config }, { sizeMultiple }),
  breakevens: ({ config, sizeMultiple }) => FoundryCompany.energyBreakevens({ ...data(), config }, { sizeMultiple }),
};

self.addEventListener('message', ev => {
  const { id, config, task, payload } = ev.data || {};
  try {
    if (task) {
      if (!TASKS[task]) throw new Error(`unknown task ${task}`);
      self.postMessage({ id, result: TASKS[task](payload) });
      return;
    }
    const result = FoundryCompany.simulateCompany({
      ...data(),
      config,
      onProgress: (done, total) => self.postMessage({ id, progress: { done, total } }),
    });
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error && error.message || error) });
  }
});
