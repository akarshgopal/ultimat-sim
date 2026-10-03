(function exposeHombreMuertoLithiumBrine(root, data) {
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.HombreMuertoLithiumBrine = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-23",
    "id": "hombre-muerto-lithium-brine",
    "kind": "brine",
    "site": {
      "latitude": -25.42,
      "longitude": -66.92,
      "context": "Salar del Hombre Muerto well brine (Argentine Puna); not Mejillones/Atacama seawater; not Uyuni chemistry; not a concession sample"
    },
    "quality": "Compiled majors from Murphy & Haji 2022 Frontiers in Chemical Engineering Table 1 (Salar del Hombre Muerto Well). Ca2+ from tabulated Ca2+/Li+ mass ratio 1 × Li+ 504 mg/L. HCO3 NP — omitted. No Br in table — omitted. Not a concession sample.",
    "notes": "Ion masses converted from tabulated g/L (Li+ from 504 mg/L) to g/kg with density 1.22 kg/L (screening hypersaline density — not a CTD). mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Literature numbers preferred over forcing charge balance. salinity_g_per_kg is the summed ion masses. Not Mejillones / Atacama / Uyuni chemistry; literature assay is not a mineral concession."
  },
  "density_kg_per_L": 1.22,
  "salinity_g_per_kg": 212.1295081967213,
  "ions_g_per_kg": {
    "Cl-": 123.77049180327869,
    "Na+": 75.40983606557377,
    "SO4-2": 6.557377049180328,
    "Mg+2": 0.6475409836065574,
    "K+": 4.918032786885246,
    "Ca+2": 0.4131147540983607,
    "Li+": 0.4131147540983607
  },
  "lithium": {
    "g_per_L": 0.504,
    "mg_per_L": 504,
    "g_per_kg": 0.4131147540983607,
    "note": "Converted with density 1.22 kg/L (screening)."
  },
  "mol_per_kg": {
    "Cl-": 3.4914102060163237,
    "Na+": 3.2801476198205286,
    "SO4-2": 0.06826334633750081,
    "Mg+2": 0.026642295149416063,
    "K+": 0.1257863586622755,
    "Ca+2": 0.010307768703487217,
    "Li+": 0.05952662162800586
  },
  "evidence": [
    {
      "label": "Murphy & Haji 2022, Frontiers in Chemical Engineering Table 1: Salar del Hombre Muerto well brine majors (DOI)",
      "url": "https://doi.org/10.3389/fceng.2022.1008680"
    },
    {
      "label": "Murphy & Haji 2022 full text (same Table 1)",
      "url": "https://www.frontiersin.org/journals/chemical-engineering/articles/10.3389/fceng.2022.1008680/full"
    }
  ]
});
