(function exposeSeawaterAssay(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.AtacamaPacificSeawater = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-13",
    "id": "atacama-pacific-seawater",
    "site": {
      "context": "SE Pacific / Atacama coast surface salinity ~34.9 g/kg; Millero S=35 majors scaled 34.9/35. Not an intake/discharge permit sample.",
      "latitude": -23.1,
      "longitude": -70.4
    },
    "quality": "Majors cited from Millero/Pilson S=35 scaled 34.9/35 for SE Pacific surface salinity near the Atacama coast (WOA climatology family). Not an intake/discharge permit.",
    "notes": "Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 34.9/35. HCO3 omitted. Density screening only. Not a NaCl proxy."
  },
  "density_kg_per_L": 1.025,
  "salinity_g_per_kg": 34.9,
  "ions_g_per_kg": {
    "Cl-": 19.297705714285716,
    "Na+": 10.750197142857143,
    "SO4-2": 2.7042514285714288,
    "Mg+2": 1.2803314285714285,
    "Ca+2": 0.41072314285714284,
    "K+": 0.39786,
    "Br-": 0.06710771428571428
  },
  "mol_per_kg": {
    "Cl-": 0.544364053999597,
    "Na+": 0.46760787995987013,
    "SO4-2": 0.02815169090746855,
    "Mg+2": 0.052677697122873006,
    "Ca+2": 0.01024809478659471,
    "K+": 0.010175890000332494,
    "Br-": 0.0008398542536758396
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
      "label": "NOAA NCEI World Ocean Atlas portal",
      "url": "https://www.ncei.noaa.gov/products/world-ocean-atlas"
    }
  ]
});
