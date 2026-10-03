(function exposeSeawaterAssay(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.TexasGulfSeawater = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-13",
    "id": "texas-gulf-seawater",
    "site": {
      "context": "NW Gulf of Mexico / Texas shelf open-water salinity ~36.2 g/kg (Aquarius L3 mid-range); Millero S=35 majors scaled 36.2/35. Not an intake/discharge permit sample.",
      "latitude": 27.8,
      "longitude": -97
    },
    "quality": "Majors cited from Millero/Pilson S=35 scaled 36.2/35 for NW Gulf of Mexico open-shelf salinity mid-band (Aquarius 2012–2014 ~35.9–36.7 psu). Not an intake/discharge permit.",
    "notes": "Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 36.2/35. Coastal river plumes are fresher — this is open-shelf screening, not Corpus Christi Bay. HCO3 omitted. Density screening only. Not a NaCl proxy."
  },
  "density_kg_per_L": 1.026,
  "salinity_g_per_kg": 36.2,
  "ions_g_per_kg": {
    "Cl-": 20.016531428571433,
    "Na+": 11.150634285714288,
    "SO4-2": 2.804982857142858,
    "Mg+2": 1.3280228571428574,
    "Ca+2": 0.4260222857142858,
    "K+": 0.4126800000000001,
    "Br-": 0.06960742857142858
  },
  "mol_per_kg": {
    "Cl-": 0.5646412250654846,
    "Na+": 0.48502593852571063,
    "SO4-2": 0.029200321227804058,
    "Mg+2": 0.05463990360595999,
    "Ca+2": 0.010629828976353256,
    "K+": 0.010554934613525399,
    "Br-": 0.0008711382230104699
  },
  "evidence": [
    {
      "label": "Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)",
      "url": "https://doi.org/10.1016/j.dsr.2007.10.001"
    },
    {
      "label": "Rajabi et al. 2017 ISPRS Archives: Aquarius SSS Gulf of Mexico 2012–2014 (~35.9–36.7 psu)",
      "url": "https://isprs-archives.copernicus.org/articles/XLII-4-W4/219/2017/"
    },
    {
      "label": "NOAA NCEI World Ocean Atlas (salinity climatology portal)",
      "url": "https://www.ncei.noaa.gov/products/world-ocean-atlas"
    }
  ]
});
