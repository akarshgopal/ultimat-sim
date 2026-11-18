# Weather stress test

Plants are designed on 12 typical solar days per site (`engine/utilization.js`). Real sunshine comes in runs: a few cloudy days in a row empty a store sized for one typical night. This test replays every best-site plant of the abundance scoreboard hour by hour through ten real years of PV output and asks two questions: how much output does it really reach, and how often do its steady units (kilns, smelters, synthesis loops) fall below their minimum turndown?

```bash
npm run weather          # report
npm run weather:fetch    # re-fetch the hourly data (PVGIS, ~2 MB)
```

## Method

- **Weather:** PVGIS-ERA5 hourly output, 2014–2023, for the twelve sites the scoreboard and the company use most (`data/weather-hourly.js`, from `scripts/build-weather.mjs`). Each site uses its frozen PVcalc tilt, azimuth and losses, and the series is rescaled so its mean matches the site's annual yield: only the pattern changes, not the level.
- **Design:** unchanged from the simulator — the plant's PV, battery, heat store, intermediate buffers and sun-following units as `designPlant()` sizes them for that site and year-0 costs.
- **Operation** (`replayWeather()`): steady units run at the design's planned rate for the month; stored energy is spread over the hours until the sun returns (tonight's length is known, tomorrow's weather is not); intermediate buffers feed steady units from sun-following ones. If PV, store and buffer cannot hold a steady unit at its minimum turndown, it trips for that hour.
- **Cost:** capital and fixed costs are spread over the output actually reached. "Firmed" adds the storage (battery, heat store and buffers scaled together) that cuts trips to about one day a year, annualized at the design's own storage prices.

## Results

| | Feasible share of world tonnage | | |
|---|---|---|---|
| | Typical days | Real weather, accepting trips | Real weather, firmed to ≤ 1 trip day a year |
| Today | 39.5% | 39.5% | **0%** |
| Frontier | 93.6% | 93.6% | **93.6%** |

- **Output barely moves.** Real weather costs firmed plants 1–4% of annual output at Walvis Bay and Dakhla, 4% at the Dead Sea. Sun-following plants (electrolysis, DAC, methane, methanol) lose nothing: they never promised a night.
- **Trips do.** Steady units trip on 2–5% of days at the sunbelt coasts and on 12.5% at the Dead Sea, where winter brings cloudy runs.
- **At the frontier, firming is cheap.** Storage at 1.5× its raw materials makes the 4–13× larger stores that ride through cloudy runs affordable: cement 0.27 → 0.33× its price, float glass 0.34 → 0.39×, aluminium 0.35 → 0.82×, polysilicon 0.39 → 0.74×. The 94% feasible headline holds, and 91% of world tonnage stays abundant (≤ ½ today's price; aluminium and polysilicon drop out).
- **Today, it is not.** At $350/kWh batteries, firming every steady plant against cloudy runs pushes it past its price (cement 0.68 → 2.2× at Taltal, PV modules 0.67 → 1.01×, silicon 0.76 → 1.44× at Walvis Bay). Today's feasibility relies on steady units tolerating a few trips a month: plausible for cement and glass kilns, which can bank hot for a day; not for an aluminium smelter, whose pots freeze.

## What changed in the model

Building the replay exposed two inconsistencies in the typical-day design, now fixed in `engine/utilization.js`:

1. **Steady units held their turndown only on daily average.** The old design let a "steady" unit run flat out by day and drain its store at night, checking the 70% floor only on the day's total. A unit that must never drop below 70% has to run at one steady rate around the clock. Each month's rate is now the highest one whose daily energy balance closes, and the store is sized for that rate's night. Firmed plants now plan ~96% output instead of ~80%, and hold their turndown on typical days.
2. **Seasonal supply.** A steady unit fed by sun-following ones (Haber-Bosch fed by electrolysis) was assumed to get its feed on the annual average. A buffer covers a night, not a dark season; each month's rate is now capped by that month's supply (green ammonia at Walvis Bay: 98.8% → 95.7% planned output).

## Limits

- Ten years of reanalysis at twelve sites; no inter-site smoothing (a company with plants on several coasts could share firm power).
- Firming adds storage only; adding PV, curtailing, or hot standby for brief trips can be cheaper. The firmed numbers are an upper bound on the cost of riding through weather.
- A trip is an hour below turndown; restart costs and damage (frozen pots) are not costed.
