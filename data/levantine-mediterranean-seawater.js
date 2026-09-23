(function exposeLevantineMediterraneanSeawater(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.LevantineMediterraneanSeawater = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-23",
    "id": "levantine-mediterranean-seawater",
    "site": {
      "latitude": 31.63,
      "longitude": 34.56,
      "context": "Eastern Mediterranean / Levantine basin surface salinity ~39 g/kg; Millero S=35 majors scaled 39/35. Not an intake/discharge permit sample."
    },
    "quality": "Majors cited from Millero/Pilson S=35 scaled 39/35 for Levantine Mediterranean surface salinity (typically ~38.5–39.5). Not western Alboran / Almería S≈36.5. Not an intake/discharge permit.",
    "notes": "Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 39/35. HCO3 omitted. Density screening only. Not a NaCl proxy. Not Almería / Alboran chemistry."
  },
  "density_kg_per_L": 1.0312,
  "salinity_g_per_kg": 39,
  "ions_g_per_kg": {
    "Cl-": 21.56477142857143,
    "Na+": 12.013114285714288,
    "SO4-2": 3.0219428571428573,
    "Mg+2": 1.4307428571428573,
    "Ca+2": 0.45908571428571426,
    "K+": 0.44460000000000005,
    "Br-": 0.07499142857142857
  },
  "mol_per_kg": {
    "Cl-": 0.608315131976627,
    "Na+": 0.5225417569752131,
    "SO4-2": 0.03145890961006514,
    "Mg+2": 0.05886619449260882,
    "Ca+2": 0.011454805985471187,
    "K+": 0.01137133839578703,
    "Br-": 0.0009385190800389039
  },
  "evidence": [
    {
      "label": "Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)",
      "url": "https://doi.org/10.1016/j.dsr.2007.10.001"
    },
    {
      "label": "NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)",
      "url": "https://doi.org/10.25923/70qt-9574"
    }
  ]
});
