# MECH15 — Buffer↔buffer transfer (shipped)

**Feat tip:** `8b60b28` on `main`
**Pages:** `gh-pages` `9b8b743` → https://akarshgopal.github.io/ultimat-sim/
**Tests:** 307 pass (+8)

## Verify
1. Hard-refresh Pages.
2. Process floor → place two **Buffer tanks**, wire feed → A → B → sink.
3. Set B capacity low + discharge `0` → A banks and Cause shows `… ← B buffer full`.
4. On A→B edge set **Logistics capacity** (e.g. 25) → Cause shows `A→B logistics`.

## Deferred
Splitter overflow into buffer→buffer; two-pass buffer→converter; heat/elec splitters; tank CAPEX.
