# UX 4 — Process at 375px, idle diagnosis, search, map sources

Worktree only. Not pushed.

## What changed

### Process on a narrow screen
- Below 720px the build palette leaves the page flow. A **Blocks** button opens it as a bottom sheet; the backdrop or adding a block closes it. The canvas is no longer stuck under a ~2000px palette.
- The flowsheet SVG no longer has a 980px minimum width. **Fit** sizes the drawing to the canvas width (zoom floor 8%, was 25%). A tall graph stays at a readable zoom and scrolls vertically instead of shrinking to 25% just to fit height. If the graph is still wider than a readable fit, **Fit** and leaving Focus pack the columns (36px gap) and fit again. Opening Process refits when the canvas has a real width; a manual zoom is kept across resize until the next Fit.
- Empty canvas and a corner hint say to drag empty space to pan. Background drag, shift-drag, and middle-drag pan the canvas.
- After a block is selected, the inspector sticks to the bottom of the narrow Process view (max about 42vh) and shows the idle reason with a jump button.

### “Not running”
Idle or unwired blocks name the cause on the node and in the inspector:
- **Missing (port name)** — highlights that port; **Show** jumps to it (warning strip does the same).
- **Unverified grid / freshwater / intake / brine / salt right** — **Open Rights** switches to Location, opens Rights, and outlines that right.
- **No site resource**, **Zero resource budget**, **Zero setpoint** — focus the resource or rate control.
- **Limited by …** when a solved block is at zero, including the upstream source when that source is the empty or unverified supply.
- **Waiting on another block** / **Solve blocked** when this block is wired but the graph is not.

A block that is actually producing still shows its rate.

### Search and map legend
- Block search matches title, description, and unit id. Non-matching cards stay hidden (`hidden` beats the card grid). A category with no matches collapses. **No blocks match.** when nothing hits. The sources heading hides when every utility card is filtered out.
- Map legend titles are short (**GHI**, **Water stress**, **Land value**) with short swatch names. Full layer names and citations sit in the legend’s **Sources** disclosure.

## Files
- `index.html` — Blocks drawer, pan hint, zoom slider min 8, legend Sources, diagnosis slot
- `flowsheet.css` — sheet, sticky inspector, legend, no 980px SVG floor, idle/cause highlight
- `js/flowsheet-app.js` — fit/pan, diagnosis, palette filter, legend copy
- `tests/flowsheet-ui.test.js` — idle reasons, Fit at 1100px and 375px, chrome assertions

## Tests
`npm test` — 203 pass, 0 fail.

## Verify in the browser
No browser tool was available in this session. Check these by hand:

1. Viewport 375px. Open **Process**. The canvas is on screen without scrolling past the whole block list. **Blocks** opens and closes the palette sheet.
2. Load coastal methane (or Zabuye). Tap **Fit**. The whole plant width is inside the canvas, not a ~980px strip of left-hand nodes. Drag empty canvas to pan. The pan hint is visible.
3. Desktop: **Focus canvas**, then **Exit focus** (or **Fit**). Zoom should not sit at an unreadable 25% when the width can be larger; vertical scroll is OK.
4. Clear the factory, add one process block. The node says **Missing …**, not only “Not running”. Select it. **Show** outlines that port.
5. Set the requested rate to 0 on a completed block. The node says **Zero setpoint**.
6. On a coastal site, add **Grid electricity**. The node says **Unverified grid right**. **Open Rights** lands on Location with that right outlined.
7. Search `distillation` or a single block name: only matching cards, not the whole category. Search `zzzz`: **No blocks match.**
8. Location map: legend shows a short name. **Sources** expands to the full citation. At 375px the legend does not cover the map with a paragraph.
