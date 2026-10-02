# MECH4 — Root-cause starvation chains

**Shipped on tip:** `07d84eb` · Pages https://akarshgopal.github.io/ultimat-sim/
**Tests:** 237 pass

## What
Post-solve `attachCauseChains` walks `limitedBy` upstream and attaches:
- `causeChain[]` — steps with `code` (`logistics`, `site-budget`, `empty-buffer`, `missing-inlet`, …)
- `causeText` — `symptom ← … ← root`

Wired after `tagLogisticsLimits` in `solveOperation` and on horizon totals.

Process UI: inspector **Cause** row, bottleneck `<title>`, idle diagnosis `detail`.

## Verify
1. Zabuye → brine→minerals logistics capacity `40000` → minerals inspector **Cause**: `brine→minerals logistics`
2. Starve brine site budget → minerals **Cause** includes `site budget`
3. Empty buffer with discharge setpoint → **Cause**: `… buffer empty`

## Deferred
Click-to-hop along chain, per-hour cause timelines, auto-select binding edge.
