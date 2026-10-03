# UX7 Process — RAISED BAR (live Zabuye diagnosis 2026-10-01)

Screenshot of current Process: soft flowchart. Thin SOURCE/CONVERTER/SINK cards, thin edges, Arrange/Fit toolbar, inspector dominating viewport.

## Must visually land on Zabuye (~23 blocks)
1. **Chunky iso/2.5D building silhouettes** by kind — ponds, tanks, separators, electrolyzers, solar sheds — paint layer ONLY. Ortho hit-testing (drag, ports, Fit) unchanged.
2. **Wide routed pipes/belts** with CSS `stroke-dashoffset` animation when solve rate > 0; thickness/style by material vs electricity vs heat. Incomplete edges muted/static.
3. **Building-face status bars** + Running/Starved lights from real solve data only (util/power/activity/diagnosis). No fake 0%.
4. **Sources/sinks** look like tanks/silos/docks — not text cards with SOURCE badge.
5. **Floor grid dominant**; plant floor must win the viewport over inspector if possible without breaking IA (CSS: canvas-focus already exists — lean into taller canvas / calmer inspector default if cheap).
6. **Do NOT ship another chip-on-rect polish.** If paint still reads as Lucidchart with thicker strokes, failed.

Empty state stays "Plant floor / No blocks". Never "Empty factory". Never Empire. YAGNI. Vanilla JS SVG/CSS only.
