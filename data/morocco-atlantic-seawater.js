(function exposeSeawaterAssay(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.MoroccoAtlanticSeawater = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-13",
    "id": "morocco-atlantic-seawater",
    "site": {
      "context": "NE Atlantic / Canary Current surface salinity ~36.5 g/kg; Millero S=35 majors scaled 36.5/35. Not an intake/discharge permit sample.",
      "latitude": 30.4,
      "longitude": -9.6
    },
    "quality": "Majors cited from Millero/Pilson S=35 scaled 36.5/35 for NE Atlantic / Canary Current surface salinity (surface max near ~37; 36.5 used as open-coast screening). Not an intake/discharge permit.",
    "notes": "Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 36.5/35. HCO3 omitted. Density screening only. Not a NaCl proxy."
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
      "label": "Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)",
      "url": "https://doi.org/10.1016/j.dsr.2007.10.001"
    },
    {
      "label": "UNESCO IOC Canary Current LME: surface salinity maximum close to 37 (context)",
      "url": "http://hdl.handle.net/1834/9178"
    },
    {
      "label": "NOAA NCEI World Ocean Atlas portal",
      "url": "https://www.ncei.noaa.gov/products/world-ocean-atlas"
    }
  ]
});
