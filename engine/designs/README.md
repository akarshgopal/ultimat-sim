# Unit designs

A design is a parametric, first-principles model of one piece of equipment that gates material
abundance: knobs → geometry → bill of materials at commodity prices × manufacturing factors →
installed $ per kg/day, kWh per kg, idiot index. The company simulator takes a design through
`config.designs.units`, which re-prices that unit's capex and energy in **every recipe flowsheet
that contains it** (other units are untouched):

```js
config.designs.units = {
  electrolyzer: { capexFactor: 0.03, energyFactor: 1.01 },
  ammonia: { capexFactor: 0.4, energyFactor: 0.9, flexible: true },
};
```

- `capexFactor` — designed installed capex ÷ the recipe's, per kg/day of the same product.
- `energyFactor` — designed kWh/kg ÷ the recipe's.
- `materialsFactor` — the design's raw-materials cost ÷ the recipe's capex, per kg/day. The
  idiot-index target squeezes a designed unit to its *own* materials × target (recipe units are
  squeezed to their cost class's floor); without it, a designed unit is not squeezed at all.
- `flexible` (optional) — `true`: the unit follows the sun (wide turndown, daily start/stop), so it is
  oversized for sun hours and needs no night-time firming; `false`: it must be firmed. Omitted: the
  default in `engine/utilization.js` (`flexibleUnits`).
- `thermal` (optional) — `true`: a firmed unit whose energy is really heat, so a heat store (cheaper
  than batteries) can carry it through the night.

## Module contract (`engine/designs/<id>.js`)

UMD, zero dependencies beyond `data/bom.js` (commodity prices: `Bom.COMMODITIES[name].usdPerKg`)
and optionally `engine/utilization.js`. In the browser it registers itself on
`globalThis.FoundryDesigns[<id>]`; in Node it is `module.exports`.

```js
api = {
  id: 'haber-bosch',                    // also the file name
  name: 'Sun-tolerant ammonia loop',
  summary: 'one sentence',
  units: ['ammonia'],                   // flowsheet units (data/pathways.js node.unit) it replaces
  product: 'ammonia',                   // the units' product; "per kg/day" means of this product
  // Recipe basis the factors are relative to, per kg/day (and kWh per kg) of `product`, derived from
  // data/pathways.js flowsheets. Node capexUsdPerKgDay / kWhPerKg are per kg of the *pathway's*
  // primary product: convert with the flowsheet's material edges where the two differ.
  RECIPE: { ammonia: { usdPerKgDay, kWhPerKg, pathwayId: 'green-ammonia' } },
  DEFAULTS,                             // every assumption, overridable, with sources/notes
  PRESETS: {                            // at least these two
    today: { label, params },           // what is built today (should land near RECIPE)
    lean: { label, params },            // the solar-matched, idiot-index-minimized target
  },
  CONTROLS: [                           // knobs the Designs view renders, keys into params
    { key, label, unit, min, max, step, hint },
    { key, label, options: [[value, text], ...] },
  ],
  design(params) => ({
    params,                             // merged with DEFAULTS
    installedUsdPerKgDay, materialsUsdPerKgDay, idiotIndex, kWhPerKg, flexible,
    basis: 'per kg NH₃/day',            // what the parts' kg and $ are per
    bom: [{ part, material, kg, usdMaterials, manufacturing, usd, note }], // sums to installed; material null for bought-in items (`parts` in this shape also accepted)
    kpis: [{ label, value, sub }],      // 3–6 headline numbers specific to this design (strings)
  }),
  simulatorOverride(params) => ({ <unit>: { capexFactor, energyFactor, materialsFactor, flexible?, thermal? } }),
};
```

The app loads each module with a `<script>` tag in `index.html` (and ships it via `scripts/build.mjs`'s
`engine/designs` entry). The Designs view renders any registered design from these fields; a scenario's
active designs live in the URL as `ds={"<id>":{"preset":"lean","overrides":{}}}`, and the Abundance
view's frontier puts every registered design at its lean preset.

Every design ships with a doc (`docs/designs/<id>.md`: requirements, model results, architecture,
BOM, build plan, risks) whose numbers regenerate from the module, and a behavioral test
(`tests/design-<id>.test.js`): the today preset lands near the recipe, the lean preset beats it, the
override moves the right pathways in `rankOpportunities` / `abundanceScoreboard` and leaves the rest
alone. `electrolyzer.js` is the worked example.
