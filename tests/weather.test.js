// The abundance headline must survive real weather: ten years of hourly PVGIS output at the
// scoreboard's best sites, with steady units firmed to at most about one trip day a year.
const test = require('node:test');
const assert = require('node:assert/strict');

test('frontier feasibility survives ten real weather years; today relies on tolerating trips', async () => {
  const { stress, frontierConfig } = await import('../scripts/weather-stress.mjs');
  const frontier = stress(frontierConfig());
  assert.ok(frontier.weatherFeasibleFirmedShare >= frontier.typicalFeasibleShare - 0.05,
    `frontier ${frontier.typicalFeasibleShare} on typical days, ${frontier.weatherFeasibleFirmedShare} firmed on real weather`);
  for (const r of frontier.rows.filter(x => x.weather)) {
    // Real weather never lifts a firmed plant above its design output by more than noise.
    assert.ok(r.weather.realOutputFactor <= r.weather.designOutputFactor + 0.02, `${r.product}`);
  }
  const today = stress({});
  assert.ok(today.weatherFeasibleFirmedShare < today.weatherFeasibleShare, 'firming against cloudy runs is costly at today\'s storage prices');
});
