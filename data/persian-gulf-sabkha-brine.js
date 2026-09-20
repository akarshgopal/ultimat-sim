(function exposePersianGulfSabkhaBrine(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.PersianGulfSabkhaBrine = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-20",
    "id": "persian-gulf-sabkha-brine",
    "kind": "brine",
    "site": {
      "latitude": 24.2,
      "longitude": 54.5,
      "context": "Abu Dhabi Gulf coastal sabkha aquifer process brine (Wood et al. 2002 mean, n=119); not a concession sample, not Persian Gulf desal feed"
    },
    "quality": "Majors cited from Wood, Sanford & Al Habshi 2002 GSA Bulletin sabkha-aquifer means as tabulated in MDPI Hydrology 2020 (Sabkha row). No Li+ or Br- in that table — omitted. Not a concession sample.",
    "notes": "Ion masses converted from tabulated mg/L to g/kg with density 1.20 kg/L (screening hypersaline density note — not a CTD). mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Literature numbers are preferred over forcing charge balance. salinity_g_per_kg is the summed ion masses, not a separate TDS headline. Not Persian Gulf seawater desal feed; literature assay is not a mineral concession."
  },
  "density_kg_per_L": 1.2,
  "salinity_g_per_kg": 222.4875,
  "ions_g_per_kg": {
    "Cl-": 142.21166666666667,
    "SO4-2": 1.4491666666666667,
    "Ca+2": 9.078333333333333,
    "Na+": 60.33833333333334,
    "K+": 2.865,
    "Mg+2": 6.545
  },
  "mol_per_kg": {
    "Cl-": 4.011612599905971,
    "SO4-2": 0.01508605732528281,
    "Ca+2": 0.22651662591280333,
    "Na+": 2.6245732757616373,
    "K+": 0.07327684323870859,
    "Mg+2": 0.26928615511211684
  },
  "evidence": [
    {
      "label": "Wood, Sanford & Al Habshi 2002, GSA Bulletin: source of solutes to the coastal sabkha, Abu Dhabi (DOI)",
      "url": "https://doi.org/10.1130/0016-7606(2002)114<0259:SOSTTC>2.0.CO;2"
    },
    {
      "label": "MDPI Hydrology 2020: table reproducing Abu Dhabi sabkha aquifer mean majors (n=119)",
      "url": "https://doi.org/10.3390/hydrology7040094"
    },
    {
      "label": "USGS: Source of solutes to the coastal sabkha, Abu Dhabi (publication record)",
      "url": "https://www.usgs.gov/publications/source-solutes-coastal-sabkha-abu-dhabi"
    }
  ]
});
