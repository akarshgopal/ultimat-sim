# MECH22 — Part-load after a blocked outlet · k clamp · toolbar redo · blower twin · TDS fixed point

**Feat tip:** `01e6ac5`
**Pages:** live (`gh-pages` asset `a815815`; CDN can lag a hard-refresh)
**Tests:** 356 pass
**Date:** 2026-10-04 CEST
**Base:** `8b7f98a` (`docs(mech21): mark Pages live`)

## Grok Build

Headless `grok -p … --cwd /workspace/ultimat-sim --always-approve -m grok-4.7 --effort high --max-turns 40 --output-format json`.
Resolved model: `grok-4.7-build`. 40 turns. Session cost **$1.037** (prompt usage, not plan credits).
Prompt: five leftovers only; no commit/push/deploy inside the agent. Executor re-ran `npm test`, reviewed the diff, then committed.

## Shipped

### 1 Part-load SEC after a blocked outlet
- `reconcileBackpressure` still scales mass linearly
- On intake-pump / gas-blower with finite part-load k, consumed kWh is rewritten as delivered Q × base SEC × (1 + k(1−Q/Qrated)²)
- If that kWh would exceed the pre-scale bus, flow is bisected down inside the block (no second graph pass)
- Stale `electricity` is dropped when the bus is no longer binding; export/logistics stays
- k unset is untouched (stock cash bit-identical). Explicit k = 0 matches linear kWh

### 2 Clamp k>3
- `partLoadK > 3` uses 3 and sets `pumpPartLoadClamped` / `blowerPartLoadClamped`
- Inspector says the shape was clamped because the screening fit is monotone only for k≤3
- Negative k still throws. Slider max stays 2

### 3 Toolbar redo
- `#redoCanvas` next to the shortcuts hint, title Ctrl+Shift+Z / Ctrl+Y
- Disabled when the redo stack is empty. Click calls `redoLast()`
- Keyboard redo unchanged; ignored in inputs

### 4 Blower part-load twin
- Same k·(1−Q/Qr)² and bus rule as the intake pump
- Optional Part-load shape control, 0–2
- Fields: `blowerPartLoadK/Q/Multiplier`, shaped `blowerKWhPerUnit`
- Source note: matches the pump, not a fan curve

### 5 Multi-pass TDS density
- `tds_mg_per_L` iterates S ← mg/L ÷ UNESCO ρ(S) until |ΔS|≤1e-6 or 12 passes
- 35000 mg/L → fixed point ~1022.755 kg/m³ (not the one-pass ~1022.740)
- Label unchanged: `salinity estimate (UNESCO 25 °C, TDS mg/L proxy)`
- Outside 0–42 g/kg: labeled fluid-class default. Comment: fixed-point proxy, not a lab density

## Cash deltas

Stock demos do not set `partLoadK`, and stock assays already carry `density_kg_per_L`. Existing bit-identical cash tests stayed green. No stock CAPEX or net-cash delta.

## Verify
1. Hard-refresh https://akarshgopal.github.io/ultimat-sim/
2. Place a block, Ctrl/Cmd+Z, click **Redo** (also Ctrl/Cmd+Shift+Z). Button disables when the stack is empty. Typing in a field does not redo
3. Intake pump, part-load k, sink accept about half the flow, ample power — limited by export, not electricity; kWh matches the shaped SEC at the delivered Q
4. Gas blower, same k, starve the bus — electricity binds below kWh/base SEC
5. Set part-load k above 3 (raw param) — solve clamps to 3 and the economics line says so
6. Seawater buffer with only `tds_mg_per_L` ≈ 35000 — density ~1022.8, label still names the TDS mg/L proxy

## Deferred (do not keep mining lift curves)
- Requested electricity is still scaled with the block on backpressure; consumed kWh is the honest one
- Part-load is a screening quadratic, not a vendor pump or fan curve
- Toolbar has redo but no undo button (keyboard undo remains)
- TDS fixed point is still not a measured density

## Next cuts (abundance TEA, not more pump mechanics)
1. **Silicon / solar materials.** PV is only a kWh block. Add a screening quartz → MG-Si → polysilicon chain (cited SEC, capital-inclusive cash, quality labeled screening) so panel raw materials are a pathway from crust + power.
2. **Rare earths.** Catalog stops at brine salts, Al, and Ti. One crust or ion-adsorption concentrate route (Nd/Pr) with co-product rollup unblocks the metals the north star named. Do not invent a concession.
3. **Delete the lift-curve tail.** Hydrocarbons and ammonia already have Sabatier, methanol, and Haber blocks. Next fidelity is opening those on sunlight + air + water without new micro-mechanics, not another pump or blower curve.
