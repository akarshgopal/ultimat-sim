(function exposeHeat(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlowsheetHeat = api;
})(globalThis, () => {
// Post-solve temperature-feasible matching. Not heat-exchanger-network synthesis:
// no ΔT_min, no composite curves, no capital targeting, no graph mutation.

function cascadeHeat({ sources = [], sinks = [] } = {}) {
  const sourceList = (sources || []).map(item => ({
    id: item.id,
    kWh: Number(item.kWh) || 0,
    T_C: Number(item.T_C),
  }));
  const sinkList = (sinks || []).map(item => ({
    id: item.id,
    demandKWh: Number(item.demandKWh) || 0,
    minT_C: Number(item.minT_C) || 0,
  }));
  const remaining = sourceList.map(item => item.kWh);
  const unmet = sinkList.map(item => item.demandKWh);
  const matches = [];
  const sourceOrder = sourceList
    .map((_, index) => index)
    .sort((a, b) => sourceList[b].T_C - sourceList[a].T_C || a - b);

  for (const sourceIndex of sourceOrder) {
    if (remaining[sourceIndex] <= 0) continue;
    const sinkOrder = sinkList
      .map((_, index) => index)
      .filter(index => unmet[index] > 0 && sinkList[index].minT_C <= sourceList[sourceIndex].T_C)
      .sort((a, b) => sinkList[b].minT_C - sinkList[a].minT_C || a - b);
    for (const sinkIndex of sinkOrder) {
      if (remaining[sourceIndex] <= 0) break;
      const kWh = Math.min(remaining[sourceIndex], unmet[sinkIndex]);
      if (kWh <= 0) continue;
      matches.push({
        from: sourceList[sourceIndex].id,
        to: sinkList[sinkIndex].id,
        kWh,
        T_C: sourceList[sourceIndex].T_C,
      });
      remaining[sourceIndex] -= kWh;
      unmet[sinkIndex] -= kWh;
    }
  }

  return {
    matches,
    coveredKWh: matches.reduce((sum, match) => sum + match.kWh, 0),
    residualDemandKWh: unmet.reduce((sum, value) => sum + value, 0),
    unrecoveredWasteKWh: remaining.reduce((sum, value) => sum + value, 0),
    sources: sourceList,
    sinks: sinkList,
  };
}

return { cascadeHeat };
});
