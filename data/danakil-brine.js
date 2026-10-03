(function exposeDanakilBrine(root, data) {
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.DanakilBrine = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-21",
    "id": "danakil-brine",
    "kind": "brine",
    "site": {
      "latitude": 14.24,
      "longitude": 40.3,
      "context": "Dallol salt-pan process brine (northern Danakil Depression, Ethiopia); inland hydrothermal evaporite, not Red Sea seawater; not a concession sample"
    },
    "quality": "Majors from Garrett 2004 Handbook of Lithium and Natural Calcium Chloride Table 2.10 Dallol Salt Pan (Martini 1969, 10 samples), tabulated as ppm. SO4 listed 0 — omitted. Li listed nd in related Gaet'ale analyses — omitted (Bekele & Schmerold 2020 Dallol hot-spring Li up to 20 ppm is a different sample family, not this salt-pan assay). Not a concession sample.",
    "notes": "Ion masses are the Table 2.10 ppm values as g/kg (ppm family; TDS 263300 ppm matches the summed majors). mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Literature numbers are preferred over forcing charge balance. salinity_g_per_kg is the summed cited SUBSTANCES ions. Density 1.20 kg/L is screening hypersaline — not a CTD. Not Red Sea / Ain Sokhna seawater; literature assay is not a mineral concession."
  },
  "density_kg_per_L": 1.2,
  "salinity_g_per_kg": 263.34,
  "ions_g_per_kg": {
    "Cl-": 168.6,
    "Ca+2": 23.29,
    "Na+": 46.02,
    "K+": 8.86,
    "Mg+2": 16.57
  },
  "mol_per_kg": {
    "Cl-": 4.7559943582510575,
    "Ca+2": 0.5811168221967163,
    "Na+": 2.0017600002853446,
    "K+": 0.22660831800871134,
    "Mg+2": 0.6817527257765892
  },
  "evidence": [
    {
      "label": "Garrett 2004, Handbook of Lithium and Natural Calcium Chloride Table 2.10: Dallol Salt Pan majors (Martini 1969, 10 samples) (DOI)",
      "url": "https://doi.org/10.1016/B978-012276152-2/X5000-3"
    },
    {
      "label": "Bonatti et al. 2017, Heliyon: Lake Afrera / northern Afar rift setting (Danakil context, not this salt-pan assay) (DOI)",
      "url": "https://doi.org/10.1016/j.heliyon.2017.e00301"
    }
  ]
});
