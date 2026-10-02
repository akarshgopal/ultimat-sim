# MECH10 — air / flue gas blower (audit + tranche)

**Tip at start:** `56b70dd` (docs after MECH9 `b7a9e1a`) on `main`
**Date:** 2026-10-02 (Europe/Berlin)
**Mode:** audit → implement one YAGNI tranche (gas-side twin of MECH8)

---

## 1. How gas feeds take power today

| Piece | Location | Power today |
|-------|----------|-------------|
| `material-source` ambient air / flue | MECH2 presets + site assays | **None.** Emits gas clamped by site budget / edge capacity only. |
| `intake-pump` (MECH8) | `engine/units.js` | Liquid only — throws `"use a blower for gas"`. |
| DAC `electricityKWhPerKgCO2` | `dac` / solid / liquid / electro-swing | Capture / regen SEC — **not** duct fan. Electro-swing note already says fans/compression BOP not included. |
| ASU `electricityKWhPerKgN2` | `asu` | Separation SEC — not intake fan. |
| Methanol / abundance air → DAC | `cases/methanol.js`, `cases/abundance.js` | Direct air edge; free to move. |

**Conclusion:** ambient air and flue are magic to move. Bolting fan kWh onto every gas `material-source` would fake ports on solids/liquids and force wiring every legacy air node. Mirror MECH8: dedicated converter.

---

## 2. Design — dedicated `gas-blower` converter

- Ports: `in` material + `electricity` → `out` material (pass-through composition).
- Phase must be **gas** (rejects liquid → use intake-pump).
- Screening `blowerKWhPerNm3` default **0.001** (1 kWh / 1000 Nm³) — mid process fan / duct+filter band, not Keith CE contactor fan (~0.00004 kWh/Nm³). Dial down for CE-like contactors.
- Optional `blowerKWhPerKg` wins when set (mass basis).
- Nm³ from total mol × `22.414 / 1000` (ideal gas, 0 °C / 1 atm screening).
- Activity / capacity in **Nm³/day** (or **kg/day** on kg basis).
- Starve when power short (`limitedBy: electricity`); cause chains already say `short on electricity`.
- **No CAPEX** this tranche.
- Stock demos **bit-identical** until the user inserts a blower (no auto-wire).

**DAC / ASU overlap (documented, not rewritten):** plant electricity SECs stay as-is. An explicit blower upstream is additive screening. Deferred: auto-split DAC/ASU SEC when a blower is present.

**Rejected this tranche**

- Required electricity on all gas `material-source` nodes
- Mutating methanol / abundance / Zabuye case JSON
- Blower CAPEX / fan curves / VFD part-load / ΔP head
- Compressors (high pressure ratio)

---

## 3. Ship checklist

1. `gasBlower` evaluate + `UNITS['gas-blower']`
2. Catalog + Utilities palette + pipe building profile
3. Tests: powered pass-through; power starve; kg basis; methanol unconstrained bit-identical; DAC air path starves when blower loses bus
4. Push `main` + Pages

---

## 4. Deferred

- Auto-reduce DAC/ASU electricity when an upstream gas-blower is detected
- Wire blowers into stock methanol / abundance demos
- Intake / blower CAPEX
- Flue-specific denser / hotter defaults

---

## 5. Shipped

- **Tip:** (see summary after push)
- **Pages:** https://akarshgopal.github.io/ultimat-sim/
- **Tests:** 272 pass (+7 MECH10)
