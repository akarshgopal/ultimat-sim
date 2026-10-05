(function exposeSeawaterAssay(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.ArabianSeaSeawater = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-21",
    "id": "arabian-sea-seawater",
    "site": {
      "context": "Arabian Sea / NW Indian Ocean surface salinity ~36.3 g/kg (ASHSW 36–36.5 band); Millero S=35 majors scaled 36.3/35. Basin typical, not an intake/discharge permit sample.",
      "latitude": 19.7,
      "longitude": 57.7
    },
    "quality": "Majors cited from Millero/Pilson S=35 scaled 36.3/35 for Arabian Sea / NW Indian Ocean surface salinity (Kumar & Prasad 1999 ASHSW 36.7–35.3 psu, 36.5 core contour; 36.3 mid-band of the 36–36.5 surface literature). Basin typical, not a Duqm intake/discharge permit.",
    "notes": "Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 36.3/35. HCO3 omitted. Density screening only. Not a NaCl proxy. Not a Port of Duqm / SEZAD intake sample."
  },
  "density_kg_per_L": 1.026,
  "salinity_g_per_kg": 36.3,
  "ions_g_per_kg": {
    "Cl-": 20.071825714285715,
    "Na+": 11.181437142857144,
    "SO4-2": 2.812731428571429,
    "Mg+2": 1.3316914285714285,
    "Ca+2": 0.42719914285714283,
    "K+": 0.41382,
    "Br-": 0.06979971428571428
  },
  "mol_per_kg": {
    "Cl-": 0.5662010074551682,
    "Na+": 0.4863657891846214,
    "SO4-2": 0.029280985098599093,
    "Mg+2": 0.05479084256619743,
    "Ca+2": 0.010659193144796218,
    "K+": 0.010584091891463311,
    "Br-": 0.0008735446821900567
  },
  "evidence": [
    {
      "label": "Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)",
      "url": "https://doi.org/10.1016/j.dsr.2007.10.001"
    },
    {
      "label": "Kumar & Prasad 1999 JGR Oceans: Arabian Sea High-Salinity Water 36.7–35.3 psu; 36.5 core contour (DOI)",
      "url": "https://doi.org/10.1029/1998JC900022"
    },
    {
      "label": "Rao & Sivakumar 2003 JGR Oceans: Arabian Sea SSS in excess of 35‰ year-round; 36‰ contour (DOI)",
      "url": "https://doi.org/10.1029/2001JC000907"
    }
  ]
});
