# UX6 map footprints

Branch `feat/ux6-map`. Workstream A only (Location campus footprints). Started from `16337b9`.

## Files

- `index.html` — footprint instrument moved onto Location; Overview mini diagram; map ha chip and empty state
- `flowsheet.css` — campus diagram, legend, layer active state, map labels
- `js/flowsheet-app.js` — diagram render, pad click → map popup, hectare chip, Overview link
- `engine/map-site.js` — `projectCampusDiagram`, `footprintLabelVisible`
- `tests/map-site.test.js`, `tests/flowsheet-ui.test.js`

`npm test`: 212 passed.

## What to look at

Footprint stays default-on. No new map tiles. Apply location and site-keyed PVGIS are unchanged. GSA LERC, Aqueduct, and the land choropleth stay as they were.

### Zabuye (default plant)

About **1.22 ha** total: solar field **1.07 ha** north of the pin, brine-minerals pad **1,500 m²** south.

- Location: campus diagram under the map (solar block plus minerals pad, hectares on the outline). Legend click frames that pad and opens its popup when the map is up.
- Map: darker pad fills, hectare chip, outline hectare label once the ring is large enough to read. Pad names appear at plant zoom; hover shows them sooner.
- Overview → Site resources: small copy of the same diagram and a Location link.

### Dead Sea (brine + ammonia)

About **1.62 ha**: solar **1.47 ha**, brine minerals **1,500 m²**, Haber–Bosch **18 m²**, air separation **14 m²**.

The diagram is mostly the solar field. The two ammonia pads are specks at true scale; they stay in the legend and focus the map on click.

With no site or no area, Location and the footprint layer say **Add blocks to size pads**. The Overview mini stays hidden until a site and a graph both have area.
