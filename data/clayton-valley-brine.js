(function exposeClaytonValleyBrine(root, data) {
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.ClaytonValleyBrine = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-23",
    "id": "clayton-valley-brine",
    "kind": "brine",
    "site": {
      "latitude": 37.75,
      "longitude": -117.57,
      "context": "Clayton Valley / Silver Peak production-aquifer brine (Esmeralda County, Nevada); not Salton Sea / Searles / Texas Gulf chemistry; not a concession sample"
    },
    "quality": "Compiled majors from Pure Energy Minerals CV-3 average public well table (Li, Mg, Ca, K, Na, Cl). SO4 not reported in that table — omitted (do not invent). USGS OFR 2013-1006 provides Clayton Valley lithium-brine deposit context. Not a concession sample.",
    "notes": "Ion masses converted from tabulated mg/L averages to g/kg with density 1.08 kg/L (screening hypersaline density — not a CTD). SO4 omitted because source table did not report it. mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Literature numbers preferred over forcing charge balance. salinity_g_per_kg is the summed reported ion masses. Not Salton Sea / Searles / Texas Gulf chemistry; literature assay is not a mineral concession."
  },
  "density_kg_per_L": 1.08,
  "salinity_g_per_kg": 98.61018518518516,
  "ions_g_per_kg": {
    "Cl-": 54.629629629629626,
    "Na+": 39.529629629629625,
    "Mg+2": 0.44259259259259254,
    "Ca+2": 1.3537037037037036,
    "K+": 2.4925925925925925,
    "Li+": 0.162037037037037
  },
  "lithium": {
    "g_per_L": 0.175,
    "mg_per_L": 175,
    "g_per_kg": 0.162037037037037,
    "note": "Converted with density 1.08 kg/L (screening)."
  },
  "mol_per_kg": {
    "Cl-": 1.5410332758710754,
    "Na+": 1.7194444028397862,
    "Mg+2": 0.01820994003672465,
    "Ca+2": 0.03377672797304515,
    "K+": 0.06375194298965921,
    "Li+": 0.023348276230120604
  },
  "evidence": [
    {
      "label": "Pure Energy Minerals: CV-3 Clayton Valley South brine chemistry average (public well table)",
      "url": "https://www.einpresswire.com/article/344697924/pure-energy-minerals-reports-positive-initial-lithium-brine-analyses-from-cv-3-well-at-clayton-valley-south"
    },
    {
      "label": "USGS OFR 2013-1006: A preliminary deposit model for lithium brines (Clayton Valley context)",
      "url": "https://pubs.usgs.gov/of/2013/1006/OF13-1006.pdf"
    }
  ]
});
