# UX3b — Fuels + minerals open, Dead Sea ammonia in Top materials

`npm test` — 200 pass, 0 fail. Not pushed.

## What changed

Fuels + minerals now opens the Dead Sea brine plant (strongest mineral sales), and Overview Top materials lists every non-zero sale on the open plant. Sold ammonia is no longer dropped by the old top-four-by-mass cut.

## Files changed

- `cases/network.js` — `createFuelsAndMineralsNetwork` lists `dead-sea-minerals` before `almeria-fuels`
- `js/flowsheet-app.js` — `loadDemoNetwork` opens the plant with the strongest mineral-sale revenue (`mineralLeadPlantId`), still calls `setActiveDemo('demo-network', 'Fuels + minerals')`. `overviewSaleRows` uses every open-plant sale sink with `deliveredAmount > 0` (including `ammonia-product`), sorted by revenue, and falls back to the full network slate with Li/Mg/salt/NH₃ labels
- `tests/flowsheet-ui.test.js` — Fuels + minerals expects the Dead Sea site, mineral/ammonia Top materials, land, and the demo chip; new Dead Sea hub test covers ammonia, coords, preset `levant-dead-sea`, and footprint
- `tests/network.test.js` — fuels network plant order is minerals then Almería

## How to verify

### Fuels + minerals

1. Open the app and click **Fuels + minerals**.
2. The scenario chip should read **Scenario · Fuels + minerals** and that demo button stays highlighted.
3. Overview title should be **Dead Sea industrial shore**, not Almería. Location latitude/longitude should be **31.16, 35.43**, and the site preset **Dead Sea industrial shore**.
4. Overview **Top materials** should include **Lithium**, **Magnesium**, **Salt**, and **Ammonia**.
5. Overview land and the Location footprint panel should show a hectare (or m²) figure, not a blank.
6. Network still lists both **Dead Sea brine and ammonia** and **Almería solar methane**, with CH₄ and NH₃ in the rollup.

### Brine + ammonia (Dead Sea)

1. Click **Brine + ammonia**.
2. Overview title, coordinates, and preset stay **Dead Sea industrial shore / 31.16, 35.43 / levant-dead-sea**.
3. **Top materials** includes **Ammonia** plus Lithium, Magnesium, Salt, Potash, and Bromine.
4. Land / footprint refresh to a non-empty area after the load.
