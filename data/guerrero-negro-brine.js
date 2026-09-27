(function exposeGuerreroNegroBrine(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.GuerreroNegroBrine = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-27",
    "id": "guerrero-negro-brine",
    "kind": "brine",
    "site": {
      "latitude": 27.97,
      "longitude": -114.05,
      "context": "ESSA Guerrero Negro solar-saltern Pond 9 evaporative brine (Baja California Sur); not open Pacific seawater; not a concession sample"
    },
    "quality": "Compiled majors from Dillon et al. 2013 Frontiers in Microbiology Table 1 Pond 9 (Cl, SO4, Na, Mg, K, Ca as mg/L). Converted to g/kg with screening density 1.12 kg/L for ~180 g/L total salts. B/Sr omitted (not in SUBSTANCES). Li not reported — omitted. Not a crystallizer Pond 11/12 assay and not a mineral concession sample.",
    "notes": "Ion masses converted from Table 1 mg/L to g/kg with density 1.12 kg/L (screening hypersaline — not a CTD). mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Literature numbers preferred over forcing charge balance. salinity_g_per_kg is the summed cited SUBSTANCES ions (Table 1 total salts 180 g/L includes omitted species). Not open Pacific / Baja seawater; literature assay is not a mineral concession."
  },
  "density_kg_per_L": 1.12,
  "salinity_g_per_kg": 136.15357142857138,
  "ions_g_per_kg": {
    "Cl-": 76.30357142857142,
    "SO4-2": 10.049999999999999,
    "Na+": 41.482142857142854,
    "Mg+2": 5.473214285714285,
    "K+": 1.7696428571428569,
    "Ca+2": 1.075
  },
  "mol_per_kg": {
    "Cl-": 2.15242796695547,
    "SO4-2": 0.10462211118051216,
    "Na+": 1.804374061224489,
    "Mg+2": 0.22518882064243098,
    "K+": 0.04526137599698342,
    "Ca+2": 0.02682269574330056
  },
  "evidence": [
    {
      "label": "Dillon et al. 2013, Frontiers in Microbiology Table 1: ESSA Guerrero Negro Pond 9 physicochemical majors (DOI)",
      "url": "https://doi.org/10.3389/fmicb.2013.00399"
    },
    {
      "label": "Dillon et al. 2013 full text (same Table 1 Pond 9)",
      "url": "https://www.frontiersin.org/journals/microbiology/articles/10.3389/fmicb.2013.00399/full"
    }
  ]
});
