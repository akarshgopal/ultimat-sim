# UX4 merge summary — pvgis-polish + network + process

**Time:** 2026-09-30 ~09:04 CEST (UTC+2)  
**Base:** `4c16929` (main tip before merge)  
**Merge tip:** `21c11ec`  
**Do not push / do not deploy** (this agent stopped short of both).

## Build outcomes

| Session | Branch | Commit | stopReason | Turns | Cost (USD) | npm test (agent) | Notes |
|---------|--------|--------|------------|-------|------------|------------------|-------|
| ux4-pvgis-polish | `fix/ux4-pvgis-polish` | `0f63e7e` | **end_turn** | 69 | 1.741 | 202 pass | Summary written; left dirty worktree; merge agent committed. No browser tools. |
| ux4-network | `fix/ux4-network` | `978a20c` | **end_turn** | 55 | 1.067 | 201 pass | Summary + headless Chrome verify table. Left dirty; merge agent committed. |
| ux4-process | `fix/ux4-process` | `53dd4dd` | **end_turn** | 65 | 1.832 | 203 pass | Summary written; left dirty worktree; merge agent committed. No browser tools. |

Worktrees (grok forks):  
`~/.grok/worktrees/workspace-ultimat-sim/ux4-pvgis-polish`  
`~/.grok/worktrees/workspace-ultimat-sim/ux4-network`  
`~/.grok/worktrees/workspace-ultimat-sim/ux4-process`  

Logs: `.hunt-run/grok-logs/ux4-pvgis-polish.json` / `ux4-network.json` / `ux4-process.json`  
Per-build summaries: `.hunt-run/ux4-*-summary.md`

## Goal status

| Goal | Session | Status | Notes |
|------|---------|--------|-------|
| PVGIS fallback keyed to active site; never another site’s name | pvgis-polish | **done** | `matchSeries` requires distance; `bindLocation` clears stale notes/cite/evidence |
| Skip live PVGIS on github.io when freeze exists / after first CORS | pvgis-polish | **done** | Agent summary + UI tests |
| Float rounding (kWp, assay, CAPEX) with full precision in title | pvgis-polish | **done** | Display-only |
| Human ID labels (sabatier-water, gridImport, Dac/Swro, …) | pvgis-polish | **done** | `RIGHT_DISPLAY_LABELS` + block labels; kept through process merge |
| Capacity reduced → status or navigate to limiting block | pvgis-polish | **done** | Overview card `is-static` / click → Process |
| Break-even empty state names unsupported products | pvgis-polish | **done** | “No product supported by the screening price table (…)” |
| Network: replace `prompt()` with inline add form | network | **done** | Cancel/Escape quiet; empty name refused |
| Per-plant Open / Rename / Remove (confirm) | network | **done** | Clear network retained |
| Desktop layout: Open not obscured by rollup | network | **done** | ≥1201px two-col with clipped rollup |
| Tag plant by top revenue earner | network | **done** | `plantLead` sorts by `annualRevenue` |
| Years / Discount two-column form | network | **done** | Labels above; `yr` / `%` |
| Mobile header subtitle ≤400px | network | **done** | `.brand .status-meta { display: none }` |
| Process @375px: palette drawer / sheet | process | **done** | ≤720px Blocks button + bottom sheet |
| Canvas Fit to viewport width (no 980px trap) | process | **done** | SVG min-width removed; zoom floor 8% |
| Pan affordance; sticky inspector on narrow | process | **done** | Hint + sticky inspector ~42vh |
| Idle “Not running” → explicit diagnosis + jump | process | **done** | `blockDiagnosis` / `followDiagnosis`; rights `is-cause` |
| Block search: title/desc; hide non-matches; empty state | process | **done** | |
| Map legend short names + expandable Sources | process | **done** | |
| Desktop Fit not stuck at unreadable 25% | process | **done** | 8% floor; compact re-pack |

## Merge

Sequential `--no-ff` onto `/workspace/ultimat-sim` main:

1. `ae0e6d7` — Merge `fix/ux4-pvgis-polish` (clean)
2. `ddbb51b` — Merge `fix/ux4-network` (clean auto-merge of css/js/tests)
3. `21c11ec` — Merge `fix/ux4-process`  
   - Conflict only in `js/flowsheet-app.js` (4 hunks). Kept **all** feature sets:
     - Warning click: diagnosis `followDiagnosis` when idle cause exists, else Process + render (capacity navigation).
     - Warning strip: `humanizeUiText` + `escapeHtml` + `data-issue-port` + “Show block”.
     - Rights: `RIGHT_DISPLAY_LABELS` + `escapeHtml` + `is-cause` highlight for unverified-right jumps.

```
21c11ec Merge branch 'fix/ux4-process'
ddbb51b Merge branch 'fix/ux4-network'
ae0e6d7 Merge branch 'fix/ux4-pvgis-polish'
53dd4dd fix(ux4): Process 375px drawer/fit, idle diagnosis, search, map sources
978a20c fix(ux4): network rollup inline add/rename/remove, layout polish
0f63e7e fix(ux4): PVGIS site-keyed fallback, labels, floats, capacity/BE UX
4c16929 docs(ux3b): record merge summary for fuels-ammonia
```

### Files changed (`4c16929`..`21c11ec`)

```
.hunt-run/ux4-network-summary.md
.hunt-run/ux4-process-summary.md
.hunt-run/ux4-pvgis-polish-summary.md
data/pvgis-sites.js
flowsheet.css
index.html
js/flowsheet-app.js
tests/flowsheet-ui.test.js
8 files, +1560 / −171
```

## Tests

```
npm test   # node --test
# tests 206
# pass  206
# fail  0
# duration_ms ~2509
```

Log: `.hunt-run/ux4-merge-npm-test.log`

No trivial post-merge test fixes required.

## Remaining gaps

- **Manual browser verify** still recommended for pvgis + process (agents lacked browser tools): Zabuye→Almería attribution, 375px Process drawer/Fit/pan, idle diagnosis jumps, map Sources disclosure. Network agent did headless Chrome checks (see its summary).
- Factory save still uses `window.prompt` (explicitly out of scope for network session).
- No push / no Pages deploy from this merge.

## Next commands (push / deploy) — not run

```bash
cd /workspace/ultimat-sim
git status
git log --oneline origin/main..HEAD

git push origin main
git push origin fix/ux4-pvgis-polish fix/ux4-network fix/ux4-process

# Pages deploy (only after push if desired)
npm run deploy
# → node scripts/deploy-pages.mjs
```
