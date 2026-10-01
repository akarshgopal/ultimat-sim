# UX6 merge summary — map footprints + TEA plots + process floor

**Time:** 2026-10-01 ~13:02 CEST (UTC+2)  
**Base:** `16337b9` (main tip before merge)  
**Merge tip:** 1e1155e (1e1155ea237c4ce1d1262077d4fefc07ed04dbf2)  
**Brief:** `.hunt-run/ux6-visuals-brief.md`  
**Live:** https://akarshgopal.github.io/ultimat-sim/

## Branches merged (all based on `16337b9`)

| Branch | Tip | What shipped |
|--------|-----|--------------|
| `feat/ux6-map` | `a22bd9f` | Campus footprints as Location instrument + Overview mini diagram |
| `feat/ux6-plots` | `c0369db` | Economics SVG waterfall, cash-flow vs year, $/kWh break-even axis |
| `feat/ux6-process` | `9bdda20` | Plant-floor process canvas: stream-rate edges, util/power chips, hub gauges |

Worktrees:  
`~/.grok/worktrees/workspace-ultimat-sim/ux6-map`  
`~/.grok/worktrees/workspace-ultimat-sim/ux6-plots`  
`~/.grok/worktrees/workspace-ultimat-sim/ux6-process`

Per-build summaries: `.hunt-run/ux6-map-summary.md` / `ux6-plots-summary.md` / `ux6-process-summary.md`

## Merge

Sequential `--no-ff` onto `/workspace/ultimat-sim` main:

1. `83f1135` — Merge `feat/ux6-map` (clean)
2. `6f0be56` — Merge `feat/ux6-plots` (auto-merged overlapping CSS/JS/HTML/tests)
3. `07c5d73` — Merge `feat/ux6-process` (auto-merged overlapping CSS/JS/HTML/tests)

Expected overlap files (`js/flowsheet-app.js`, `flowsheet.css`, `index.html`, `tests/flowsheet-ui.test.js`) auto-merged without conflict. All three feature sets kept:

- **Map:** `layoutFootprintCampus` / `projectCampusDiagram`, `#siteFootprintSvg` campus diagram, pad legend → map focus
- **Plots:** inline SVG gate waterfall + cash-flow bars + break-even $/kWh axis in `#economicsWaterfall` / `#economicsCashflow`
- **Process:** `formatEdgeRate` edge labels, `nodeMeterChip` / hub gauges, "Plant floor" / "No blocks" tone

No Empire copy. No new chart libs.

## Tests

`npm test`: **214 pass / 0 fail** (log: `.hunt-run/ux6-merge-npm-test.log`)

## Push + deploy

- `git push origin main`
- `npm run deploy` → force-push `gh-pages` from `dist/`
- Confirm https://akarshgopal.github.io/ultimat-sim/
