# MECH17 — Tank CAPEX + footprint into TEA / campus (+ Process shortcuts)

**Base:** `27724cc` (`docs(mech16): record tip SHA 61d2b1f`) on `main`  
**Date:** 2026-10-02 (Europe/Berlin)  
**Mode:** implement — Buffer tank economics + land; Process canvas Delete/Escape/zoom/nudge/?  

---

## 1. How SWRO / PV / minerals bind CAPEX + footprint today

### CAPEX (`engine/economics.js` + case `tea.bindCapex*`)

| Path | Pattern | Anchors |
|------|---------|---------|
| Case packs | `tea.bindCapexPack(unit, { capacity })` → `installedCapex` or `capexRate` × intensity | `data/tea-screening.js` `bindCapexPack`; abundance minerals `tea.bindCapex('minerals', …)` |
| Editor defaults | `defaultEconomics(node)` sets `installedCapex` / `unitCost` | `js/flowsheet-app.js` ~L5781 |
| Battery twin | `installedCapex = capacity × params.capexPerKWh`; slider refreshes CAPEX | catalog battery; inspector `capexPerKWh` handler |
| Evaluate | Sums every node with `installedCapex` / `capexRate` / O&M → annualized CAPEX + cash gate | `evaluateEconomics` L44–66, L99–103 |

### Footprint (`engine/footprint.js`)

| Path | Pattern |
|------|---------|
| `PROCESS_INTENSITIES[unit]` | intensity × driver (+ `floorM2`), quality + evidence |
| `PROCESS_PADS[unit]` | `padDesal` / `padBrine` / … from **solved activity** |
| Battery | From **installed** `site.storage.batteryKWh` or graph battery activity (MWh) |
| Campus map | `estimateFootprint` → `processes[]` → map pads (`map-site.js` / UI) |

### Gap — `material-buffer`

- Engine inventory/SOC works (MECH3–16); **no** `defaultEconomics` for `kind === 'buffer'` (returns `{}`).
- Inspector buffer controls omit `economicsControlsFor`.
- No `PROCESS_INTENSITIES['material-buffer']` / pad → **invisible on campus**, **$0 CAPEX**.

---

## 2. MECH17 design (YAGNI)

| Piece | Choice |
|-------|--------|
| CAPEX | Screening **$0.50 / kg capacity** (`capexPerKg`), `installedCapex = capacityKg × capexPerKg` (battery twin). Fixed O&M 2% CAPEX, life 25 y. |
| Footprint | Screening **1.0 m² / t capacity** (≈ 1 m²/m³ water-eq pad+dike band 0.5–2). Driver = **installed** `capacityKg`, not throughput. |
| Honesty | Catalog `sourceNote` + Literature; quality=`screening`. |
| Stock demos | No buffer nodes → **bit-identical** cash/footprint. |
| Shortcuts (same ship) | Process tab, not typing in inputs: Delete/Backspace selection; Escape clear selection/pending connect; Arrow nudge (nodes already draggable); +/- zoom; `?` hint. No undo (none exists). |

---

## 3. Files

- `engine/footprint.js` — intensity + `padBuffer` + PROCESS_PADS  
- `js/flowsheet-app.js` — catalog CAPEX, defaultEconomics, inspector, keyboard  
- `index.html` — shortcuts hint chrome; canvas `tabindex`  
- `tests/mech17-tank-capex.test.js`, `tests/mech17-shortcuts.test.js`  
- Deploy Pages after green tests  

