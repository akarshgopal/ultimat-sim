(function exposeUyuniLithiumBrine(root, data) {
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.UyuniLithiumBrine = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-21",
    "id": "uyuni-lithium-brine",
    "kind": "brine",
    "site": {
      "latitude": -20.29,
      "longitude": -67.61,
      "context": "Salar de Uyuni nucleus brine (Bolivian Altiplano); not Chilean Atacama seawater or nucleus brine; not a concession sample"
    },
    "quality": "Compiled majors from Murphy & Haji 2022 Frontiers in Chemical Engineering Table 1 (Salar de Uyuni). Ca2+ from tabulated Ca2+/Li+ mass ratio 3 × Li+ 960 mg/L. HCO3 NP — omitted. No Br in table — omitted. Not a concession sample.",
    "notes": "Ion masses converted from tabulated g/L (Li+ from 960 mg/L) to g/kg with density 1.22 kg/L (screening hypersaline density — not a CTD). mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Literature numbers are preferred over forcing charge balance. salinity_g_per_kg is the summed ion masses. Not Salar de Atacama / Mejillones chemistry; literature assay is not a mineral concession."
  },
  "density_kg_per_L": 1.22,
  "salinity_g_per_kg": 281.016393442623,
  "ions_g_per_kg": {
    "Cl-": 155.7377049180328,
    "SO4-2": 17.21311475409836,
    "Ca+2": 2.360655737704918,
    "Na+": 74.59016393442623,
    "K+": 13.934426229508198,
    "Mg+2": 16.39344262295082,
    "Li+": 0.7868852459016393
  },
  "lithium": {
    "g_per_L": 0.96,
    "mg_per_L": 960,
    "g_per_kg": 0.7868852459016393,
    "note": "Murphy & Haji 2022 Table 1 Li+ 960 mg/L Salar de Uyuni. Converted with density 1.22 kg/L (screening)."
  },
  "mol_per_kg": {
    "Cl-": 4.393165159888089,
    "SO4-2": 0.17919128413593963,
    "Ca+2": 0.058901535448498375,
    "Na+": 3.2444938413442186,
    "K+": 0.3563946828764472,
    "Mg+2": 0.6744884847953433,
    "Li+": 0.11338404119620163
  },
  "evidence": [
    {
      "label": "Murphy & Haji 2022, Frontiers in Chemical Engineering Table 1: Salar de Uyuni brine majors (DOI)",
      "url": "https://doi.org/10.3389/fceng.2022.1008680"
    },
    {
      "label": "Murphy & Haji 2022 full text (same Table 1)",
      "url": "https://www.frontiersin.org/journals/chemical-engineering/articles/10.3389/fceng.2022.1008680/full"
    }
  ]
});
