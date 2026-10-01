# MECH1 merge — constrained logistics → main

**Date:** 2026-10-01 21:53 CEST (Europe/Berlin)  
**Branch merged:** `feat/mech1-logistics` @ `b4d7776a8f85ebc5d3e048c991ae6f67cee0c2dc`  
**Main tip (feature FF):** `b4d7776`

## Merge

- Fast-forward: `65836ad` → `b4d7776` (`git merge --ff-only feat/mech1-logistics`)
- Docs commit on main after FF records this summary (see `git log -1 --oneline`).

## Tests

```
npm test → 222 pass / 0 fail (duration ~5.1s)
```

Includes 6 MECH1 cases in `tests/mech1-logistics.test.js`:
- unconstrained Zabuye bit-identical
- brine→minerals capacity clamp
- electrical bus cable + logistics tag
- horizon hourly clamps
- splitter per-edge capacity
- blank / null / Infinity = unlimited

## Shipped (from feature)

- Optional `edge.capacity` (≥0 native units / solve step)
- `evaluateGraph` clamps outlets; `edgeLimits[]`; `limitedBy: logistics`
- Horizon hourly honor; UI logistics capacity on inspector ports; bottleneck class

## Verify live (Zabuye)

1. Open live Pages URL after deploy.
2. Load Zabuye brine hub.
3. Select brine → minerals edge; set **Logistics capacity** ≈ `40000`.
4. Re-solve: minerals activity / product mass fall; logistics bottleneck warning; edge `.bottleneck`.
5. Clear capacity → unconstrained recovery.

## Deploy

- `git push origin main`
- `npm run deploy` (GitHub Pages)
