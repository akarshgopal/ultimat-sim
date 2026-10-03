(function exposeSeawaterAssay(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.RedSeaSeawater = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-13",
    "id": "red-sea-seawater",
    "site": {
      "context": "Red Sea surface salinity typically 40–41 g/kg; Millero S=35 majors scaled 40.5/35. Not an intake/discharge permit sample.",
      "latitude": 28,
      "longitude": 34.5
    },
    "quality": "Majors cited from Millero/Pilson S=35 scaled 40.5/35 for Red Sea salinity band 40–41 (Johns et al. 2000). Not an intake/discharge permit.",
    "notes": "Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 40.5/35. HCO3 omitted (not in SUBSTANCES). Density is a screening seawater density at this salinity, not a CTD cast. Not a NaCl proxy."
  },
  "density_kg_per_L": 1.029,
  "salinity_g_per_kg": 40.5,
  "ions_g_per_kg": {
    "Cl-": 22.39418571428572,
    "Na+": 12.475157142857144,
    "SO4-2": 3.1381714285714293,
    "Mg+2": 1.4857714285714287,
    "Ca+2": 0.4766271428571429,
    "K+": 0.46170000000000005,
    "Br-": 0.0778757142857143
  },
  "mol_per_kg": {
    "Cl-": 0.631711867821882,
    "Na+": 0.5426395168588751,
    "SO4-2": 0.032668867671990724,
    "Mg+2": 0.061130278896170696,
    "Ca+2": 0.01189248821940074,
    "K+": 0.011808697564855761,
    "Br-": 0.0009746159677327081
  },
  "evidence": [
    {
      "label": "Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)",
      "url": "https://doi.org/10.1016/j.dsr.2007.10.001"
    },
    {
      "label": "Johns et al. 2000 JGR: Red Sea Water salinity 40–41 over most of the Red Sea (DOI)",
      "url": "https://doi.org/10.1029/1999JC900297"
    },
    {
      "label": "Wikipedia: Red Sea (salinity context)",
      "url": "https://en.wikipedia.org/wiki/Red_Sea"
    }
  ]
});
