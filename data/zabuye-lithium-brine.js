(function exposeZabuyeLithiumBrine(root, data) {
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.ZabuyeLithiumBrine = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-23",
    "id": "zabuye-lithium-brine",
    "kind": "brine",
    "site": {
      "latitude": 31.35,
      "longitude": 84.05,
      "context": "Lake Zabuye (Zhabuye) carbonate-type brine (Tibetan Plateau); not Qaidam/Kunteyi chemistry; not a concession sample"
    },
    "quality": "Compiled majors from Murphy & Haji 2022 Frontiers in Chemical Engineering Table 1 (Lake Zabuye Carbonate). Mg2+ and Ca2+ tabulated 0 — omitted. HCO3 tabulated 0 — omitted. No Br in table — omitted. Not a concession sample.",
    "notes": "Ion masses converted from tabulated g/L (Li+ from 970 mg/L) to g/kg with density 1.20 kg/L (screening hypersaline density — not a CTD). mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Literature numbers preferred over forcing charge balance. salinity_g_per_kg is the summed ion masses. Not Qaidam intercrystalline brine; literature assay is not a mineral concession."
  },
  "density_kg_per_L": 1.2,
  "salinity_g_per_kg": 305.8083333333334,
  "ions_g_per_kg": {
    "Cl-": 130,
    "Na+": 108.33333333333334,
    "SO4-2": 32.5,
    "K+": 34.16666666666667,
    "Li+": 0.8083333333333333
  },
  "lithium": {
    "g_per_L": 0.97,
    "mg_per_L": 970,
    "g_per_kg": 0.8083333333333333,
    "note": "Converted with density 1.2 kg/L (screening)."
  },
  "mol_per_kg": {
    "Cl-": 3.6671368124118473,
    "Na+": 4.712241055285651,
    "SO4-2": 0.3383302102852384,
    "K+": 0.8738657861509751,
    "Li+": 0.1164745437079731
  },
  "evidence": [
    {
      "label": "Murphy & Haji 2022, Frontiers in Chemical Engineering Table 1: Lake Zabuye brine majors (DOI)",
      "url": "https://doi.org/10.3389/fceng.2022.1008680"
    },
    {
      "label": "Murphy & Haji 2022 full text (same Table 1)",
      "url": "https://www.frontiersin.org/journals/chemical-engineering/articles/10.3389/fceng.2022.1008680/full"
    }
  ]
});
