# UX5 — Process chrome (flowsheet instrument)

Worktree only. Not pushed.

## What changed

Process is a flowsheet workbench. The empty canvas and stage title no longer say “Factory floor / Blank factory / Start here.”

### Tone
- Stage eyebrow is **Flowsheet**. With no site and no blocks the title is **Empty flowsheet**; with blocks and no site it is **Flowsheet**. A loaded site still uses the site name.
- Empty canvas: **Empty flowsheet** — “Add a block or open a case on Overview.” Pan and Fit hints stay.
- Sidebar note eyebrow is **Wiring**. The setpoint rule is unchanged.

### Toolbar
One control row under the title: **Arrange**, zoom (− / slider / + / **Fit** / Reset), **Add sources & sinks**, then **Canvas**.
- **Canvas** holds Focus and the saved-flowsheet select, Save as…, and Delete save. Same ids (`focusCanvas`, `factorySaves`, `saveFactory`, `deleteFactorySave`).
- **Blocks** stays the narrow-screen drawer toggle.
- **Advanced** is still a closed `<details>` (baseline + comparison).
- Focus mode keeps Arrange and zoom/Fit on the stage and hides the title, Canvas menu, and Add sources. Exit focus still refits.

### Nodes (SVG/CSS only)
- Corner radius 3. Kind is an amber badge (warning when idle, danger when bottlenecked).
- Status sits on a rule at the bottom of the block, 10px tabular type.
- Port pitch is 20px (`PORT_TOP` / `PORT_STEP` shared by the circles, block height, and edge anchors). Solve, wiring, and diagnosis text are unchanged.

### Palette
Default order, Minerals and Fuels open: brine mineral train, chlor-alkali, bromine recovery, then the fuels path. Water (SWRO), Power, and Carbon stay in the list, collapsed.
**More units** (collapsed) holds titanium Kroll, aluminium smelter, hydrogen DRI, nuclear, solar thermal, thermal storage, MED, and MSF. Search still opens a category when a card matches.

### Inspector
Section headings are short rules: Ports, Flows, Exchanges, Residuals. No new panels. Diagnosis is unchanged.

## Files
- `index.html` — Process stage, empty canvas, Canvas menu, inspector headings
- `flowsheet.css` — toolbar row, node badge/status, empty plate, palette-more, inspector headings
- `js/flowsheet-app.js` — empty-canvas string, title, `renderPalettes`, `renderNode`
- `tests/flowsheet-ui.test.js` — flowsheet copy, toolbar order, More units, node chrome

## Tests
`npm test` — 207 pass, 0 fail.

## Verify in the browser
Headless Chrome at 1440×900 and 390×844, Process tab, Zabuye loaded and after Clear canvas.

- Desktop controls sit on one 28px row. Advanced stays closed. Palette opens on Minerals then Fuels; More units is the last collapsed group.
- Cleared canvas title and plate say Empty flowsheet / Add a block or open a case on Overview. No Blank factory or Start here.
- Loaded Zabuye still draws the graph, kind badges, and stream labels. Header chips still say Factory running / Empty factory — those are the global solve chips, not the process empty state.

## Out of scope
No solve, size, or physics edits. No new units. No Empire copy. Not pushed.
