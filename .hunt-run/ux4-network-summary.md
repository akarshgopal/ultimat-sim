# UX4 network rollup edit

Worktree only, on tip `4c16929`. Not pushed.

## What changed

Economics → Network rollup no longer asks for a plant name with `window.prompt`.

- **Add current plant** opens an in-page name field. The default is the open site name (or “Current plant”, with a numeric suffix if that name is already in the network). **Add** saves it. **Cancel**, or Escape, leaves the network unchanged and writes “Add canceled.” An empty name does not add a plant; the note says to enter a name.
- Each plant row has **Open**, **Rename**, and **Remove**. Rename is an inline name field (Save / Cancel / Escape). Remove asks “Remove {name}?” before deleting that plant and any corridors that point at it. **Clear network** is still there.
- Plant rows stack the name above the actions, and the actions wrap inside the card. From 1201px up, plants and rollup stay side by side, with the plants column at least 17.5rem and the rollup column clipped to itself (`min-width: 0; overflow: auto`) so metric cards cannot paint over Open / Rename / Remove. At 1200px and below, plants sit above the rollup.
- The line under each plant is the sale with the highest `annualRevenue` (the sink figure already used for cash, including demand caps), shown as `$…/year`. A zero-revenue sale still falls back to tonnes. On Fuels + minerals, at least one plant’s top earner is not its heaviest product.
- **Years** and **Discount** are a two-column form: label above the field, matching number-plus-unit rows (`yr` and `%`).
- At 400px and below, the header subtitle “Chemical industry planner…” is hidden instead of ellipsized.

Factory save still uses its own prompt. That path was out of scope.

## Verify

```
npm test
# tests 201
# pass  201
# fail  0
```

Headless Chrome against `http://127.0.0.1:4173` (static `scripts/dev.mjs`), Economics tab, Fuels + minerals, Network detail open:

| Check | Result |
| --- | --- |
| 1440×900 | Open / Rename / Remove boxes do not intersect the rollup rect. Add cancel keeps 2 plants and shows “Add canceled.” Remove cancel keeps the plant. Rename save updates the name. Default add name is “Dead Sea industrial shore”. |
| 1280×800 | Network body is two columns (~263px / ~321px). Action buttons stay visible and do not intersect the rollup. |
| 380px wide | `.brand .status-meta` computed `display: none`. |
| Years / Discount | Both labels at the same top, both inputs 17px below that, `yr` and `%` immediately to the right of equal-width fields. |

Manual pass: Economics → Add current plant → Cancel (no new plant) → Add with a name → Rename → Remove and cancel → Remove and confirm → Clear network. Repeat the header check with the window at 380px wide.
