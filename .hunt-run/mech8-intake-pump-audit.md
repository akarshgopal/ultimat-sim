# MECH8 — intake pump energy (audit + tranche)

**Tip at start:** `d0a42e5` (docs after MECH7 `598a637`) on `main`
**Date:** 2026-10-02 (Europe/Berlin)
**Mode:** audit → implement one YAGNI tranche

---

## 1. How intakes take power today

| Piece | Location | Power today |
|-------|----------|-------------|
| `material-source` | `engine/units.js` + `evaluateGraph` source branch | **None.** Emits `params.stream` clamped by site budget / edge capacity only. Ports: `out` material. |
| Practical intakes (MECH2) | same unit + UI presets | Seawater / brine lake / freshwater / air / flue are **identities** on `material-source`, not pumps. |
| SWRO `secKWhPerM3` default 3.5 | `engine/units.js` `swro` | **Plant-level SEC** (Elimelech & Phillip 2011 ~3–4 kWh/m³ band) — comment explicitly includes intake, pretreatment, posttreatment, brine discharge. Voutchkov 2018 RO-train best-in-class 2.5–2.8. |
| `brine-minerals` `electricityKWhPerKgBrine` 0.05 | same | Extraction / process SEC on the minerals block — **not** lake lift. |
| Electrical bus allocation | `allocateElectricity` | Fan-out from `electrical-bus` to converter `requestedInputs.electricity` / `consumed.electricity`. Sources do not participate. |

**Conclusion:** free matter from lake / ocean / freshwater is magic. SWRO’s plant SEC already folds a literature intake share into the RO block, so bolting `pumpKWh` onto every `material-source` would (a) put a fake electricity port on air/salt/flue, (b) double-count on coastal SWRO unless we rewrite case SEC, (c) force wiring every legacy source.

---

## 2. Design choice — dedicated `intake-pump` converter

**Prefer** a thin Factorio-style pump on the pipe over mutating `material-source`:

- Ports: `in` material + `electricity` → `out` material (pass-through composition).
- Screening `pumpKWhPerM3` default **0.4** (open-intake / transfer order; sits in the ~0.2–0.5 kWh/m³ band often cited as intake share of plant SEC — see Voutchkov desalination energy splits; not a site head curve).
- Optional `pumpKWhPerKg` wins when set (brine mass basis).
- `densityKgM3` default 1025 (seawater); freshwater users dial toward 1000; brine denser.
- Activity / capacity in **m³/day** of liquid through the pump.
- Starve when power short (`limitedBy: electricity`); cause chains already say `short on electricity`.
- **No CAPEX** this tranche.
- Existing cases unchanged (bit-identical) until the user inserts a pump.

**SWRO overlap (documented, not rewritten):** coastal plant SEC 3.5 remains the plant-level band. An explicit intake-pump upstream is **additive screening** unless the user lowers SWRO SEC toward RO-train (~2.5–2.8). Deferred: auto-split plant SEC when a pump is present.

**Rejected this tranche**

- Required electricity on all `material-source` nodes
- Mutating Almería / Zabuye case JSON defaults
- Pump CAPEX / head–flow curves / VFD part-load
- Gas blowers for air / flue

---

## 3. Ship checklist

1. `intakePump` evaluate + `UNITS['intake-pump']`
2. Catalog + Utilities palette + liquid-pump building profile
3. Tests: powered pass-through; power starve; bus priority; Zabuye unconstrained bit-identical
4. Push `main` + Pages

---

## 4. Deferred

- Auto-reduce SWRO SEC when an upstream intake-pump is detected
- Wire pumps into stock Almería / Zabuye demos
- Intake / discharge CAPEX
- Blower energy for ambient air / flue

---

## 5. Shipped

- **Tip:** (pending merge)
- **Pages:** https://akarshgopal.github.io/ultimat-sim/
- **Tests:** 258 pass (+6 MECH8)
