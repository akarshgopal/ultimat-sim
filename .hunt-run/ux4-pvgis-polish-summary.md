# UX 4 — PVGIS fallback stays on the active site

Worktree only, tip `4c16929`. Not pushed.

`npm test` (`node --test`) — 202 pass, 0 fail. No browser tools in this session, so the checks below are the manual pass; automated coverage is the UI tests named at the end.

## What changed

Frozen and screening solar now follow the coordinates (or preset) you just applied. Switching Zabuye → Almería no longer keeps “frozen PVGIS for Lake Zabuye” under the new point.

- `data/pvgis-sites.js` `matchSeries` only accepts a site id when that series has a real distance to the requested lat/lon (within 1°). A missing distance is not a match.
- `js/flowsheet-app.js` `bindLocation` drops the previous site’s notes, monthly PVGIS, cite, and PVGIS evidence when the place actually moves. Preset apply still keeps the new preset’s identity.
- Fallback text names the active freeze (Almería hourly SARAH3, or the matched catalog series) at the requested coordinates. If nothing is frozen for this point, status and notes say the frozen fallback is unavailable and show the screening band. They do not name another site.
- On `*.github.io`, live `seriescalc` is skipped when a freeze exists for the active point. After the first CORS-style failure (`TypeError` / failed to fetch), later applies in the same session do not call PVGIS again. An HTTP error on a fresh load still tries once.

Same pass, display only (model values stay full precision):

1. **Floats.** PV kWp shows 2 decimals (`title` and `data-full-kwp` keep the full value; typing the rounded number does not write it back). Assay `g/kg` shows 2 decimals, full string in `title`. CAPEX and fixed-O&M inputs: 0 decimals at ≥100, 2 at ≥1, 4 below that, raw value in `title`.
2. **Labels.** Process blocks: `dac` → DAC, `swro` → SWRO, `sabatier-water` → Sabatier water. Rights: Grid import, Seawater intake, Seawater discharge, Brine concession, Salt purchase (and Freshwater). The `data-right` attribute stays the raw key. Solver warning strings are unchanged; the warning strip humanizes those keys for display.
3. **Capacity reduced.** The Overview card is a status when no electricity-limited block exists (`.issue-card.is-static`, `data-limit-mode="status"`). When a block is limited, the card and the Process warning **Show block** button select that block and open Process (`data-limit-mode="process"`, `data-issue-node`).
4. **Break-even.** If the plant sells products the screening price table cannot price, the material menu and the result say “No product supported by the screening price table” and name those products (Methane on the recycle demo). “No products sold” remains only when nothing is sold.

Files: `js/flowsheet-app.js`, `data/pvgis-sites.js`, `flowsheet.css` (static issue card), `tests/flowsheet-ui.test.js`. No Empire copy.

## Verify

### PVGIS attribution

1. Open the app (local `npm run dev`, or the GitHub Pages host). Start on the Zabuye brine hub. Location should cite Zabuye / frozen ERA5, not Almería.
2. Set latitude `36.834`, longitude `-2.463` (or apply the Almería preset) and apply. Notes and fetch status should name Almería (frozen PVGIS-SARAH3, retrieved 2026-09-05) at those coordinates. They must not say Zabuye or `84.05`.
3. Apply a point with no freeze (for example Oslo, `59.91`, `10.75`) after a CORS failure, or anywhere live PVGIS cannot be reached and no catalog series is within 1°. Status should say the frozen fallback is unavailable and quote a screening-band daily yield. It must not name Zabuye, Mundra, or Almería.
4. On `*.github.io`, applying Almería should not keep retrying `re.jrc.ec.europa.eu` `seriescalc` once a freeze is available. After any first CORS failure, a second apply in the same tab should not call `seriescalc` again.

### Display, labels, capacity, break-even

1. Location PV kWp and the assay line should read with a couple of decimals (about `12.35` kWp, `68.54 g/kg` on a long assay). Hover the field: the tooltip still has the full figure. Editing something else and re-solving must not snap the stored kWp to the rounded display.
2. Process inspector CAPEX for a large installed cost should be a whole number in the field, with the full value in the tooltip. The stored CAPEX stays exact.
3. Load **Methane recycle** (coastal methane). The canvas and inspector should say DAC, SWRO, and Sabatier water. Rights should say Grid import, Seawater intake, Brine concession, and Salt purchase.
4. On a plant whose power warning is “Capacity reduced: limited by available electricity”, click the Overview card. It should open Process with the limiting block selected. The warning strip **Show block** button should do the same. If that card ever has no block to open, it should read as a status (no hover shadow, default cursor), not a dead button.
5. Economics → power break-even on **Methane recycle**: the material menu should say “No product supported by the screening price table (Methane)”, not “No products sold”. Running the screen should repeat that sentence and “Screening only — not a PPA.” A plant that sells nothing should still say “No products sold.”

### Tests

```
npm test
```

UI coverage lives in `tests/flowsheet-ui.test.js`: coordinate fallback (Almería, Mundra, Oslo), GitHub Pages skip when a freeze exists, human labels, rounded kWp / assay / CAPEX, and the methane break-even empty state.
