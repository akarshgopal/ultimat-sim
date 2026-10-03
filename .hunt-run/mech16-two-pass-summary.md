# MECH16 — Two-pass buffer→converter (summary)

**Feat tip:** `61d2b1f`
**Main merge:** `211ffaa`
**Tests:** 313 pass
**Date:** 2026-10-02 CEST

## Shipped
- `bufferOutletCanAbsorbOverflow`: sink **or** converter (direct outlet)
- Splitter overflow opens buffer→converter legs to tank room
- `applyBufferOverflowIntake` re-crafts downstream converter; banks unconsumed feed; restores direct-source power on re-eval
- Tests: `tests/mech16-two-pass.test.js` (+6); MECH14 frozen test → absorb

## Deferred
- Splitter overflow into buffer→mixer / buffer→buffer / nested splitter
- Plan-pass bus foresight (allocated power may lag overflow water)
- Heat/elec buffers; tank CAPEX
