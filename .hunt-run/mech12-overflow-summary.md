# MECH12 — Splitter overflow onto free legs

**Tip:** (pending push)
**Tests:** 284 pass
**Live:** https://akarshgopal.github.io/ultimat-sim/

## Behavior change vs MECH6

| Case | MECH6 | MECH12 (default) |
|------|-------|------------------|
| A capped, B free | B keeps weight share; inlet throttles | **B absorbs leftover**; inlet stays open |
| A logistics-capped, B free | same throttle | overflow onto B |
| A+B both capped | inlet = sum | unchanged |
| Upstream converter, one sale capped | craft throttles | craft **open** if sibling free |

## What shipped

- `allocateSplitterOverflow` water-fill in `reconcileBackpressure`
- Sink branch capacity = accept (∞ if blank) ∩ edge capacity
- Non-sink branches freeze at delivered (no buffer inventory invent)
- Free sink `received` / `consumed` refreshed after overflow
- Splitter `export`/`logistics` only when leftover remains
- MECH6 tests updated honestly; new `tests/mech12-overflow.test.js`

## Verify

1. Hard-refresh Pages.
2. Custom: splitter → two sinks; offtake-limit one ≈ 10% of feed → sibling should climb toward the rest; feed stays full.
3. Cap **both** sinks → feed drops; Cause on splitter: `branch blocked ← export capped`.

## Deferred

- Opt-in MECH6 no-overflow mode
- Overflow into buffers
- Priority / ranked fills
- Heat / electricity splitters
