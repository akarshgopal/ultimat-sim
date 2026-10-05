(function exposeMaricungaLithiumBrine(root, data) {
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.MaricungaLithiumBrine = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-23",
    "id": "maricunga-lithium-brine",
    "kind": "brine",
    "site": {
      "latitude": -26.92,
      "longitude": -69.05,
      "context": "Salar de Maricunga basin-average brine (Atacama Region, Chile); not Salar de Atacama nucleus; not Mejillones seawater; not a concession sample"
    },
    "quality": "Compiled majors from Minera Salar Blanco Stage One DFS 2022 Table 1-1 averages (718 exploration samples). Density 1.20 g/cm³ cited in same table. Peer PEA/DFS screening chemistry — not a concession sample.",
    "notes": "Ion masses converted from tabulated mg/L averages to g/kg with density 1.20 kg/L (DFS-cited). mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Literature numbers preferred over forcing charge balance. salinity_g_per_kg is the summed ion masses. Not Salar de Atacama / Mejillones chemistry; literature assay is not a mineral concession."
  },
  "density_kg_per_L": 1.2,
  "salinity_g_per_kg": 258.315,
  "ions_g_per_kg": {
    "Cl-": 160.60250000000002,
    "Na+": 72.58833333333334,
    "SO4-2": 0.5925,
    "Mg+2": 6.105833333333334,
    "K+": 6.785,
    "Ca+2": 10.705833333333333,
    "Li+": 0.9350000000000002
  },
  "lithium": {
    "g_per_L": 1.122,
    "mg_per_L": 1122,
    "g_per_kg": 0.9350000000000002,
    "note": "Converted with density 1.2 kg/L (screening)."
  },
  "mol_per_kg": {
    "Cl-": 4.530394922425952,
    "Na+": 3.1574189950900915,
    "SO4-2": 0.006168019987507808,
    "Mg+2": 0.25121717067818694,
    "K+": 0.17353695684978632,
    "Ca+2": 0.2671249397009165,
    "Li+": 0.13472622478386168
  },
  "evidence": [
    {
      "label": "Minera Salar Blanco Stage One DFS 2022 Table 1-1: Maricunga brine averages (718 samples)",
      "url": "https://minedocs.com/23/Maricunga_DFS_01072022.pdf"
    },
    {
      "label": "Gajardo & Carrasco 2021 Earth-Science Reviews: Andean salar brine grades context (DOI)",
      "url": "https://doi.org/10.1016/j.earscirev.2021.103615"
    }
  ]
});
