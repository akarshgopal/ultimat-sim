# UX7 merge summary — Factorio-style process floor + axon campus + HUD

**Date:** 2026-10-01 (Europe/Berlin)
**Base:** `cf6a2da` (docs(ux6): point merge tip at feat commit 79f70bd)

## Branches merged (in order)

| Order | Branch | Tip | Feature |
|-------|--------|-----|---------|
| 1 | `feat/ux7-process` | `d896332` | Process factory-floor iso paint (belts, face bars) — HERO |
| 2 | `feat/ux7-campus` | `9d69e2d` | Axonometric campus plant layout from footprint pads |
| 3 | `feat/ux7-hud-strip` | `ae0b77f` | Glanceable resource strip from solved power, cash, and land |

## HUD decision

Worktree `/home/box/.grok/worktrees/workspace-ultimat-sim/ux7-hud` was on
`feat/ux7-hud-strip` @ `ae0b77f` (feature commit present at start; parent steering
confirmed include). `feat/ux7-hud` itself was still at `cf6a2da` (renamed).
Included. Merge order: process → campus → hud.

## Conflicts

None. Process fast-forwarded; campus and HUD auto-merged
`flowsheet.css` / `js/flowsheet-app.js` / `tests/flowsheet-ui.test.js`
with all three feature sets kept.

## Tests

`npm test` → **216 pass / 0 fail** (`.hunt-run/ux7-merge-npm-test.log`).

## Deploy

`git push origin main` then `npm run deploy` (GitHub Pages). No Contents API; no PATs pasted.
