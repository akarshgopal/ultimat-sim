(function exposeSeawaterAssay(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.GulfOfKutchSeawater = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-21",
    "id": "gulf-of-kutch-seawater",
    "site": {
      "context": "Gulf of Kutch inverse-estuary mouth/open-gulf salinity ~37.2 g/kg; Millero S=35 majors scaled 37.2/35. Inner gulf is saltier. Not an intake/discharge permit sample.",
      "latitude": 22.7,
      "longitude": 69.7
    },
    "quality": "Majors cited from Millero/Pilson S=35 scaled 37.2/35 for Gulf of Kutch mouth/open-gulf salinity (Vethamony et al. 2007 37.20 psu near the mouth; inner gulf >40 psu). Inverse-estuary screening, not a Mundra Port intake/discharge permit.",
    "notes": "Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 37.2/35. HCO3 omitted. Density screening only. Not a NaCl proxy. Inner-gulf and saltpan creeks are saltier than this mouth/open-gulf value."
  },
  "density_kg_per_L": 1.027,
  "salinity_g_per_kg": 37.2,
  "ions_g_per_kg": {
    "Cl-": 20.56947428571429,
    "Na+": 11.458662857142858,
    "SO4-2": 2.882468571428572,
    "Mg+2": 1.3647085714285716,
    "Ca+2": 0.43779085714285715,
    "K+": 0.42408000000000007,
    "Br-": 0.07153028571428571
  },
  "mol_per_kg": {
    "Cl-": 0.5802390489623213,
    "Na+": 0.49842444511481865,
    "SO4-2": 0.030006959935754442,
    "Mg+2": 0.05614929320833457,
    "Ca+2": 0.010923470660782902,
    "K+": 0.010846507392904553,
    "Br-": 0.000895202814806339
  },
  "evidence": [
    {
      "label": "Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)",
      "url": "https://doi.org/10.1016/j.dsr.2007.10.001"
    },
    {
      "label": "Vethamony et al. 2007 Mar. Pollut. Bull.: Gulf of Kachchh inverse estuary 37.20 psu near mouth, >40 psu at head (DOI)",
      "url": "https://doi.org/10.1016/j.marpolbul.2007.01.022"
    },
    {
      "label": "Kumar & Prasad 1999 JGR Oceans: Arabian Sea high-salinity surface context for the gulf mouth (DOI)",
      "url": "https://doi.org/10.1029/1998JC900022"
    }
  ]
});
