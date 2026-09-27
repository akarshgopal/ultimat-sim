(function exposeBajaPacificSeawater(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.BajaPacificSeawater = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-27",
    "id": "baja-pacific-seawater",
    "site": {
      "latitude": 27.97,
      "longitude": -114.05,
      "context": "Open Pacific west of Baja California Sur / Guerrero Negro coast surface salinity ~35 g/kg; Millero S=35 majors unscaled. Not Ojo de Liebre lagoon hypersaline intake and not an ESSA permit sample."
    },
    "quality": "Majors cited from Millero/Pilson S=35 for open Pacific Baja California Sur shelf (WOA climatology family ~34.5–35.5). Not the modestly hypersaline Ojo de Liebre lagoon feed and not an ESSA intake/discharge permit.",
    "notes": "Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors. HCO3 omitted. Density screening only. Not a NaCl proxy. Not an ESSA / Guerrero Negro lagoon intake sample."
  },
  "density_kg_per_L": 1.025,
  "salinity_g_per_kg": 35,
  "ions_g_per_kg": {
    "Cl-": 19.353,
    "Na+": 10.781,
    "SO4-2": 2.712,
    "Mg+2": 1.284,
    "Ca+2": 0.4119,
    "K+": 0.399,
    "Br-": 0.0673
  },
  "mol_per_kg": {
    "Cl-": 0.5459238363892807,
    "Na+": 0.4689477306187809,
    "SO4-2": 0.028232354778263587,
    "Mg+2": 0.052828636083110475,
    "Ca+2": 0.010277458955037675,
    "K+": 0.01020504727827041,
    "Br-": 0.0008422607128554265
  },
  "evidence": [
    {
      "label": "Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)",
      "url": "https://doi.org/10.1016/j.dsr.2007.10.001"
    },
    {
      "label": "NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)",
      "url": "https://doi.org/10.25923/70qt-9574"
    },
    {
      "label": "Dillon et al. 2013 Front. Microbiol.: ESSA Guerrero Negro pumps from Ojo de Liebre (lagoon context; open-Pacific assay is not the lagoon feed) (DOI)",
      "url": "https://doi.org/10.3389/fmicb.2013.00399"
    }
  ]
});
