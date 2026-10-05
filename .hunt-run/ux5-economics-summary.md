# UX5 Economics — screening TEA dashboard

Worktree only, on tip `3c0e6b8`. Not pushed. Economics only (no Overview / Process structural work).

The Economics tab is a screening cash-gate board: Capital, Operations, an emphasized annual net cash gate, a four-step waterfall of the same numbers, and NPV/IRR behind a disclosure. Years and Discount stay the only editable project levers. Network and footprint sit in the column as peers, not closed appendices.

## What changed

Files: `index.html` (Economics panel), `flowsheet.css` (TEA / network / break-even / footprint), `js/flowsheet-app.js` (`renderEconomics`, `renderNetwork`, `renderSiteFootprint`), `tests/flowsheet-ui.test.js`. No engine files. No new cash math.

1. **Grouped metrics.** The flat `strip-metrics` dump is a dashboard.
   - **Capital** — Installed CAPEX, Annualized CAPEX.
   - **Operations** — Revenue, OPEX, Operating cash (R − OPEX).
   - **Gate** — Annual net cash (R − OPEX − ann. CAPEX) is the headline (`1.7rem`, pass/fail left border). Note is “Above / Below / At the cash gate · screening”.
   - **DCF** — `<details id="economicsDcf">` summary “Show NPV/IRR (screening)”. The quiz checkbox `#economicsAck` and “I understand these are screening figures” are gone. Storage key `flowsheet-economics-ack` is unchanged: opening the disclosure writes `'1'`, closing writes `'0'`. NPV/IRR stay hidden while gate reasons exist and the disclosure is closed (“Hidden until this disclosure is open”). Corridors still reveal network NPV without the disclosure. Products (levelized delivered cost and sold sinks) stay on the board, outside DCF.

2. **Waterfall.** Four existing annual figures only: Revenue → − OPEX → − ann. CAPEX → Net. Bar widths are `abs(step) / max(abs)`. Net uses the same money formatter as the gate.

3. **Assumptions rail.** Years and Discount stay a two-column label-above-field form (`yr`, `%`) and still drive the existing project economics. Two read-only rows sit under them. They are not new financing inputs.
   - Power slot, in order: grid `pricePerMWh` (“Grid tariff · not a PPA”) → a node that actually has `economics.unitCost` (“Power cost · not a PPA”) → solar / PV / ATB intensity on the plant (“PV CAPEX”) → the screening power table only when none of those exist, labeled “not on this plant · not a PPA” → “Not set”.
   - CAPEX slot skips the node already used above, then prefers a `capexIntensityBand` or brine-minerals pack (“Minerals CAPEX”, band note “not bankable”), else another intensity.
   - Zabuye’s power block is the solar-pv CAPEX pack (no purchased-power `unitCost`), so the rail shows PV `$/kWp` and minerals intensity, not the unused `$0.04/kWh` table.

4. **Break-even.** Copy is two lines: where yearly net cash crosses zero if solar capital is replaced by bought power, and “Not a PPA. Does not re-size the plant.” Mode, Material, and **Screen power break-even** are one row from 960px up (`align-items: end`). The result is a bordered readout and auto-runs when the plant or the mode/material signature changes. The engine sentence (`formatBreakEven`) is unchanged.

5. **Network.** `#networkBody` is a direct child of the panel, not inside `<details>`. It is visible whenever `plants.length > 0`. Empty status is “No plants in this rollup.” with the existing **Add current plant** button; the old “Each keeps its own” essay is gone. Desktop plants | rollup stays `minmax(17.5rem, 0.9fr) minmax(0, 1.1fr)` and stacks at ≤1200px. Copy stays “Network rollup”. No Empire.

6. **Footprint.** `#siteFootprint` is a compact strip under the column, shown whenever the estimate has area. It is not behind a “Site footprint” summary.

`.economics-layout` is one full-width column (the old 50/50 plant | network split is gone) so the TEA board and the network two-column use the panel. At ≤960px the dashboard, groups, and assumptions stack; the gate value stays large and left-aligned.

Honesty copy that stays: “Screening TEA”, “screening”, “not bankable”, “not a PPA”, “Not a financing case”. The banner when rights or missing corridors gate DCF still says to open “Show NPV/IRR (screening)”.

## Acceptance (§3.2)

| Check | Result |
| --- | --- |
| Metrics grouped Capital / Ops / Gate / DCF; gate is the largest figure | Yes. Gate `1.7rem`; capital and ops stay in compact metric rows. |
| Ack/honesty remains; NPV/IRR still gated; not a quiz | Yes. Same `flowsheet-economics-ack` flag. Disclosure replaces the checkbox. |
| Break-even ≤2 short lines; controls one row at desktop | Yes. `flex-wrap: nowrap` from 960px. |
| Network visible without a closed `<details>` when plants exist | Yes. Body unhidden when plants exist. |
| Still screening-labeled; no FEED/bankable claims | Yes. No engine invention. No Empire. |

## Verify

```
npm test
# tests 207
# pass  207
# fail  0
# duration_ms 2661.573633
```

New UI test: `economics dashboard groups capital, operations, the cash gate, and screening DCF`. It checks the grouped DOM, four waterfall steps, read-only assumptions, disclosure toggle ↔ ack `'1'`/`'0'`, terse empty network, auto break-even result, footprint shown on the default plant, and Fuels + minerals unhiding the rollup.

Headless Chrome (CDP, DOM geometry and clicks — no saved screenshot) against the static server, Economics tab:

| Check | Result |
| --- | --- |
| 1440×900, default Zabuye | Board uses ~99.5% of the panel width. Gate `$2.4M`, “Above the cash gate · screening”. Waterfall Revenue `$3M`, − OPEX `-$440,000`, − ann. CAPEX `-$190,000`, Net `$2.4M`. Assumptions: PV CAPEX `$1,000/kWp`, Minerals CAPEX `$9.6/(kg brine/day)` with screening band `$3–$40`. Break-even result visible (crossing near `$0.960/kWh`). Footprint strip visible, not inside `<details>`. Network body hidden; status “No plants in this rollup.” |
| DCF disclosure | Closed by default. Summary click sets ack `'1'` and shows NPV `$24M`, IRR `141.21%`. Second click sets ack `'0'` and restores “Hidden until this disclosure is open”. |
| Fuels + minerals | Title “2 plants”. Plants and rollup side by side (~621px \| ~760px). Status includes “freight not modeled (no corridors)”. |
| 390×800 | Assumptions stack under the board. Network plants stack above the rollup. No horizontal overflow of the panel. |
| Discount rail | Editing Discount recomputes the gate (after the network load, `$97,000` → `-$1,300` at 12%). Waterfall stays. |

No quiz checkbox, no Empire string, levelized delivered cost still present.
