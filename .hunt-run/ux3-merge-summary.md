# UX3 merge summary — site-demo + optimize-breakeven

**Time:** 2026-09-29 ~23:48 CEST (UTC+2)  
**Base:** `ef7a3d2` (main tip before merge)  
**Do not push / do not deploy** (this agent stopped short of both).

## Build outcomes

| Session | Branch | Commit | stopReason | Turns | Cost (USD) | Notes |
|---------|--------|--------|------------|-------|------------|-------|
| ux3-site-demo | `fix/ux3-site-demo` | `3ff4356` | **cancelled** (max-turns 80) | 80 | 1.891 | Left dirty worktree; merge agent committed. No agent-written summary (synthesized at commit). Last in-session full `npm test`: 197/198. |
| ux3-optimize-breakeven | `fix/ux3-optimize-breakeven` | `5226ecb` | **end_turn** | 41 | 0.936 | Summary claims 199 pass. Left dirty on worktree `main`; merge agent branched + committed. |

Worktrees (grok forks):  
`~/.grok/worktrees/workspace-ultimat-sim/ux3-site-demo`  
`~/.grok/worktrees/workspace-ultimat-sim/ux3-optimize-breakeven`  
Logs: `.hunt-run/grok-logs/ux3-site-demo.json` / `ux3-optimize-breakeven.json`

## Merge

Sequential `--no-ff` merges onto `/workspace/ultimat-sim` main:

1. `8a3b1d9` — Merge `fix/ux3-site-demo`
2. `06798dd` — Merge `fix/ux3-optimize-breakeven`  
   - Sole conflict: `js/flowsheet-app.js` `loadCase` — kept **both** `routeNote = ''` (site) and `adoptPreSizingSeed(definition)` (optimize).  
   - `engine/size.js`, `index.html`, tests auto-merged (both `syncAbundanceSolar` and `ABSOLUTE_SCALE_CAP` / seed stamp present).
3. `88c5302` — trivial test fix: break-even UI test expected “No products sold” on cold start; site-demo changed first load to **Zabuye** (sells products). Updated assertion accordingly.

**Merge tip (main):** `fa3f84c` (docs commit; functional merge+test tip `88c5302`)

```
fa3f84c docs(ux3): record merge summary for site-demo + optimize-breakeven
88c5302 test(ux3): expect Zabuye sold products on first-load break-even
06798dd Merge branch 'fix/ux3-optimize-breakeven'
8a3b1d9 Merge branch 'fix/ux3-site-demo'
5226ecb fix(ux3): bound Optimize, balance honesty, break-even UX
3ff4356 fix(ux3): site/demo apply, brine guard, Dead Sea hub truth
```

### Files changed (ef7a3d2..88c5302)

```
.hunt-run/ux3-optimize-breakeven-summary.md
.hunt-run/ux3-site-demo-summary.md
data/pvgis-sites.js
data/site-assays.js
data/site-presets.js
engine/economics.js
engine/material-power-breakeven.js
engine/size.js
engine/solve.js
engine/uncertainty.js
index.html
js/flowsheet-app.js
tests/flowsheet-ui.test.js
tests/material-power-breakeven.test.js
tests/size-cashflow.test.js
tests/uncertainty.test.js
16 files, +567 / −92
```

## Tests

```
npm test   # node --test
# tests 199
# pass  199
# fail  0
```

Log: `.hunt-run/ux3-merge-npm-test-final.log`

## Goals 1–7 status / remaining gaps

| # | Goal | Status | Notes / gaps |
|---|------|--------|--------------|
| 1 | Apply location stale state + power throttle callout | **Landed** | `clearLocationStaleState`, `keepIdentity`/`draftSiteLabel`, solve warning + Overview `powerThrottleCallout` |
| 2 | Cross-brine preset swap | **Landed** | `brinePresetClash` blocks with plain CTA; validateSite error softened |
| 3 | First-load / demo highlight / Fuels+minerals minerals | **Mostly** | Cold start Zabuye + `setActiveDemo`. `overviewSaleRows` rolls network slate when `plants.length > 1`. **Gap:** `loadDemoNetwork` still `openNetworkPlant`s **first** plant (Almería fuels); Overview minerals rely on network slate path, not opening the mineral plant |
| 4 | Bound Optimize + balance honesty + money abbreviate | **Landed** | `ABSOLUTE_SCALE_CAP` + immutable `preSizingSeed`; `scorePositiveCashflow` + UI gate on residual; `formatUncertainMoney` compact $M/$B |
| 5 | Dead Sea hub site truth | **Mostly** | `loadAbundanceHub` → `siteDeadSeaAbundance`; Dead Sea Location preset; `syncAbundanceSolar` for footprint after rescale. **Gap:** in-session probe still saw Dead Sea Top materials **without Ammonia** (Mg/Salt/Potash/Br only) — confirm whether NH₃ sale is in `networkResult.slate` / single-plant sinks after load; may need overview/sale-row wiring for `ammonia-product` when rate is non-zero |
| 6 | Power break-even primary button | **Landed** | `class="primary-action" id="screenPowerBreakeven"` |
| 7 | Break-even plain language + sold materials + shared mode | **Landed** | Filtered material list; shared disables picker; jargon stripped |

Site-demo hit max-turns without finishing its own summary/tests-green cycle; treat goals 3/5 ammonia + Fuels+minerals plant-open as the main follow-ups.

## Next commands (push / deploy) — not run

```bash
cd /workspace/ultimat-sim
git status -sb
git log --oneline origin/main..HEAD   # should show 88c5302..3ff4356 chain

# Push main (and optionally feature branches)
git push origin main
git push origin fix/ux3-site-demo fix/ux3-optimize-breakeven

# Pages deploy (project script; only after push if desired)
npm run deploy
# → node scripts/deploy-pages.mjs
```

No Empire copy was introduced in this merge.
