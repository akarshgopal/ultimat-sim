# MECH13 — Priority fill on material-splitter outlets

**Tip:** `160a189` on `main`
**Tests:** 292 pass
**Live:** https://akarshgopal.github.io/ultimat-sim/

## Behavior

| Case | Result |
|------|--------|
| A prio 1, B prio 0, both free | A takes all |
| A prio 1 capped, B free | A fills → leftover to B (MECH12 spill) |
| Same-tier priorities | weight water-fill within tier, then lower |
| Unset / all 0 | bit-identical MECH12 |

## What shipped

- `edge.priority` (number, default 0); higher fills first
- `allocateSplitterOverflow` water-fills current max-priority tier first
- Inspector Priority field next to Share weight
- `tests/mech13-priority.test.js`

## Verify

1. Hard-refresh Pages.
2. Custom: splitter → two sinks; set one outlet Priority `1`, leave Share equal → priority leg takes the feed; cap that sink’s offtake → sibling absorbs leftover.
3. Clear priorities (both `0`) → equal MECH12 split / overflow.

## Deferred

- Priority *input* (take-from-left-first)
- Heat / electricity splitters
- Buffer↔buffer transfer
- Overflow into buffers
- Opt-in MECH6 no-overflow mode
