# UX3b merge summary — Fuels+minerals open + Dead Sea ammonia

**Time:** 2026-09-30 ~00:14 CEST (UTC+2)  
**Base:** `c2dbabd` (main tip before merge)  
**Do not push / do not deploy.**

## Build outcome

| Session | Branch | Commit | stopReason | Turns | Cost (USD) | Notes |
|---------|--------|--------|------------|-------|------------|-------|
| ux3b-fuels-ammonia | `fix/ux3b-fuels-ammonia` | `b140cb6` | **end_turn** | 27 | 0.405 | Summary claims 200 pass. Left dirty on worktree `main`; merge agent branched + committed. |

Worktree (grok fork):  
`~/.grok/worktrees/workspace-ultimat-sim/ux3b-fuels-ammonia`  
Log: `.hunt-run/grok-logs/ux3b-fuels-ammonia.json` (no `.err`)

## Merge

`--no-ff` merge onto `/workspace/ultimat-sim` main — **no conflicts**.

1. `b140cb6` — `fix(ux3b): open mineral plant on Fuels+minerals; show Dead Sea ammonia`
2. `5084d40` — Merge branch `fix/ux3b-fuels-ammonia`

**Merge tip (main):** `5084d40`

```
5084d40 Merge branch 'fix/ux3b-fuels-ammonia'
b140cb6 fix(ux3b): open mineral plant on Fuels+minerals; show Dead Sea ammonia
c2dbabd docs(ux3): record merge summary for site-demo + optimize-breakeven
```

### Files changed (c2dbabd..5084d40)

```
.hunt-run/ux3b-fuels-ammonia-summary.md
cases/network.js
js/flowsheet-app.js
tests/flowsheet-ui.test.js
tests/network.test.js
5 files, +127 / −17
```

## Both gaps — claimed fixed

| Gap | Claim | How |
|-----|-------|-----|
| 1. Fuels + minerals opens mineral plant | **Yes** | `createFuelsAndMineralsNetwork` lists `dead-sea-minerals` first; `loadDemoNetwork` uses `mineralLeadPlantId()` (strongest mineral-sale revenue) then falls back to `dead-sea-minerals` |
| 2. Dead Sea ammonia in Top materials | **Yes** | `overviewSaleRows` lists every open-plant sale sink with `deliveredAmount > 0` (incl. `ammonia-product`), sorted by revenue; no top-4 mass cut |

## Tests

```
npm test   # node --test
# tests 200
# pass  200
# fail  0
# duration_ms ~2410
```

Log: `.hunt-run/ux3b-merge-npm-test.log`

## Manual verify steps

### Fuels + minerals

1. Open the app and click **Fuels + minerals**.
2. Scenario chip: **Scenario · Fuels + minerals**; demo button stays highlighted.
3. Overview title **Dead Sea industrial shore** (not Almería); lat/lon **31.16, 35.43**; preset **Dead Sea industrial shore**.
4. Overview **Top materials** includes **Lithium**, **Magnesium**, **Salt**, and **Ammonia**.
5. Overview land and Location footprint show a hectare (or m²) figure.
6. Network still lists both **Dead Sea brine and ammonia** and **Almería solar methane**, with CH₄ and NH₃ in the rollup.

### Brine + ammonia (Dead Sea)

1. Click **Brine + ammonia**.
2. Title / coords / preset stay **Dead Sea industrial shore / 31.16, 35.43 / levant-dead-sea**.
3. **Top materials** includes **Ammonia** plus Lithium, Magnesium, Salt, Potash, and Bromine.
4. Land / footprint refresh to a non-empty area after the load.
