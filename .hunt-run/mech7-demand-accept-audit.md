# MECH7 — annualDemandLimit → daily sink accept (audit + tranche)

**Tip at start:** `bf529c8` (docs after MECH6 `9bce275`) on `main`
**Date:** 2026-10-02 (Europe/Berlin)
**Mode:** audit → implement one YAGNI tranche

---

## 1. Where demand already lives

| Piece | Location | Role today |
|-------|----------|------------|
| `TeaScreening.bindSale` | `data/tea-screening.js` | Sets `economics.annualDemandLimit` from regional demand tables (kg/y) |
| `economics.annualDemandLimit` | sink node economics | Caps **cash** only: `sold = min(annualAmount, demand)` in `engine/economics.js` |
| Offtake-limited scenario | `engine/site-search.js` `applyOfftakeDemandHaircut` | Scales annual caps ×0.01 for screening cash — still not physics |
| MECH5 `params.acceptKg` | `engine/solve.js` `finiteSinkAccept` / `evaluateSink` | Daily kg/day offtake; blank = **unlimited** void |
| Inspector | `js/flowsheet-app.js` Offtake field + Destination economics `annualDemandLimit` | Two separate knobs; no link |

**Catalog check (pre-wire):** Zabuye / Dead Sea free rates sit well under `annualDemandLimit/365` (and under offtake ×0.01 haircuts for Li). Wiring demand→accept is bit-identical for default abundance plants; it binds when demand is tight or plants are sized past regional ceilings.

**Conclusion:** nearest real demand signal is already `economics.annualDemandLimit`. Do not invent a parallel model. MECH5 deferred this wire explicitly.

---

## 2. Tranche design

**Ship**

1. `finiteSinkAccept`: if no manual `acceptKg` / `acceptAmount` / sink setpoint **and** `economics.disposition === 'sale'`, use `annualDemandLimit / periodDays` when finite (≥0). `periodDays` from `operation.periodDays` else 365. Vent/disposal ignore EDITOR_DEMAND_DEFAULT for physics.
2. Tag sink result `acceptSource: 'manual' | 'demand' | null` alongside `acceptKg`.
3. Cause chains unchanged — still `export-capped` when clamped.
4. Inspector: blank offtake on sale sinks shows demand-backed daily; placeholder/title explain override. Manual value still wins.
5. Tests: demand-backed throttle + cause; manual override; unconstrained Zabuye bit-identical.
6. Cash+ size fixture keeps a manual unlimited `acceptKg` so its revenue ceiling stays cash-only (optimizer unit test).

**Reject this tranche**

- Mutating case JSON to write `params.acceptKg` at load time
- New demand tables / offtake contracts
- Heat / power export caps (next deferred)
- Intake pump energy

---

## 3. Deferred

- Heat rejection / power export caps
- Intake / pump energy on practical feeds
- CAPEX for offtake terminals
- Horizon per-hour offtake nomination UI
