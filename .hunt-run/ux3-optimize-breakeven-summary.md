# UX 3 — bounded Optimize, break-even button, plain break-even copy

`npm test` — 199 pass, 0 fail. Not pushed.

## Files changed

- `engine/size.js` — absolute scale cap (10×) against an immutable `operation.preSizingSeed`; repeated Optimize rescales that seed instead of the plant already on screen
- `engine/economics.js` — `scorePositiveCashflow` sets `met` only when cash is positive and, if `maxAbsResidual` is present, the balance is closed (`< 1e-8`)
- `engine/uncertainty.js` — `formatUncertainMoney` abbreviates millions and above (`$340M`, `$1.2B`)
- `js/flowsheet-app.js` — keeps the pre-sizing seed across Optimize, autosave, and case loads; cashflow banner refuses “Objective met” when balances need attention; material picker lists only products this plant sells and disables it in shared mode
- `index.html` — break-even button uses `primary-action`; copy and mode labels are plain language; material list starts empty
- `engine/material-power-breakeven.js` — result text drops TEA / hero-scale / `annualNetCash` wording; shared results do not name a single material
- Tests: `tests/size-cashflow.test.js`, `tests/uncertainty.test.js`, `tests/flowsheet-ui.test.js`, `tests/material-power-breakeven.test.js`

## How to verify

### 4. Optimize, balances, money

1. Load **Brine + ammonia**. Note land and net cash.
2. Click **Optimize co-product cashflow** twice. The second click should stay on the same order of scale (not jump toward hundreds of hectares or hundreds of millions).
3. Overview money cards should read like `$340M`, not a full digit string.
4. If the issue card says **Balances need attention**, the cashflow line must say **Objective not met**, not **Objective met**.

### 6. Break-even button

1. Open **Economics**.
2. **Screen power break-even** should be the same amber primary button as **Optimize co-product cashflow**, with dark text, not a pale grey label.

### 7. Break-even materials and wording

1. On **Brine + ammonia**, the Material menu should list only products that plant sells (lithium and the other real sales), not a fixed catalog that includes unsold names.
2. Set Mode to **All products together**. The Material menu is disabled. Run the screen. The sentence should say `(shared)` and should not say `(shared, lithium)` or mention TEA, hero scale, or `annualNetCash`.
3. Load **Methane recycle**. The Material menu should say **No products sold**, and the screen should say this plant is not selling a product it can price.
