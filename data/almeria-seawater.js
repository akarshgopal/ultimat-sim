(function exposeAlmeriaSeawater(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.AlmeriaSeawater = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-06",
    "site": {
      "latitude": 36.834,
      "longitude": -2.463,
      "context": "Almería coast, Alboran Sea Modified Atlantic Water near 36.834, -2.463; literature seawater, not an intake or discharge permit sample"
    },
    "quality": "Majors cited from Millero/Pilson reference-composition seawater at S=35, scaled 36.5/35 for Alboran MAW salinity. Not an intake/discharge permit.",
    "notes": "Ion mass concentrations are g/kg seawater. Base S=35 g/kg values (Cl- 19.353, Na+ 10.781, SO4-2 2.712, Mg+2 1.284, Ca+2 0.4119, K+ 0.399, Br- 0.0673) are scaled by 36.5/35. HCO3 is omitted (not in SUBSTANCES). mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Headline salinity 36.5 g/kg is cited Alboran MAW context; water mass uses the summed ion masses, not that headline. Density 1.026 kg/L is a screening seawater density at this salinity, not a CTD cast. Not a NaCl proxy."
  },
  "density_kg_per_L": 1.026,
  "salinity_g_per_kg": 36.5,
  "ions_g_per_kg": {
    "Cl-": 20.182414285714287,
    "Na+": 11.243042857142859,
    "SO4-2": 2.8282285714285718,
    "Mg+2": 1.3390285714285715,
    "Ca+2": 0.4295528571428572,
    "K+": 0.4161,
    "Br-": 0.07018428571428571
  },
  "mol_per_kg": {
    "Cl-": 0.5693205722345356,
    "Na+": 0.48904549050244306,
    "SO4-2": 0.02944231284018917,
    "Mg+2": 0.05509272048667235,
    "Ca+2": 0.010717921481682149,
    "K+": 0.010642406447339143,
    "Br-": 0.0008783576005492305
  },
  "evidence": [
    {
      "label": "Millero et al. 2008, Deep-Sea Research I: the reference composition of seawater at S=35 (DOI)",
      "url": "https://doi.org/10.1016/j.dsr.2007.10.001"
    },
    {
      "label": "Wikipedia: Alboran Sea (Modified Atlantic Water ~36.5 g/kg context)",
      "url": "https://en.wikipedia.org/wiki/Alboran_Sea"
    }
  ]
});
