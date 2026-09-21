(function exposeSaltonSeaBrine(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.SaltonSeaBrine = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-21",
    "id": "salton-sea-brine",
    "kind": "brine",
    "site": {
      "latitude": 33.16,
      "longitude": -115.62,
      "context": "Salton Sea Known Geothermal Resource Area process brine (Imperial Valley, CA); inland geothermal, not Texas Gulf seawater; not a concession sample"
    },
    "quality": "Literature-mean majors from Stringfellow & Dobson 2021 Energies Table 2 (post-flash Salton Sea geothermal brines; NREL/USGS well family, n=13 for Li/Na/Ca/K/Cl/Mg). 2021 header is mg/L; the same means are listed as mg/kg in Stringfellow 2025 Energies Table 1 and match NREL TEA OSTI 1782801 Table 1 ppm wells / 24.3% TDS — treated as mg/kg (ppm). Fe/Mn/Zn/SiO2/NH4/metals omitted (not in SUBSTANCES). Not a concession sample.",
    "notes": "Ion masses are the Table 2 means as g/kg (ppm family). mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Literature numbers are preferred over forcing charge balance. salinity_g_per_kg is the summed cited SUBSTANCES ions, not the 24.3% TDS headline (omitted metals). Density 1.20 kg/L is screening hypersaline geothermal — not a CTD; used for intake mass only. Not Texas Gulf / Corpus Christi seawater; literature assay is not a mineral concession."
  },
  "density_kg_per_L": 1.2,
  "salinity_g_per_kg": 231.8756,
  "ions_g_per_kg": {
    "Cl-": 142.015,
    "SO4-2": 0.0586,
    "Ca+2": 25.684,
    "Na+": 49.249,
    "K+": 14.467,
    "Mg+2": 0.109,
    "Li+": 0.202,
    "Br-": 0.091
  },
  "lithium": {
    "mg_per_kg": 202,
    "g_per_kg": 0.202,
    "note": "Stringfellow & Dobson 2021 Table 2 mean Li 202 mg/L (n=13, SD 39); same mean listed as mg/kg in 2025 Energies Table 1. Treated as 0.202 g/kg (NREL/USGS ppm family). NREL TEA OSTI 1782801 uses ~200 mg/L conservative SSGF average (McKibben & Hardie 1997)."
  },
  "mol_per_kg": {
    "Cl-": 4.0060648801128345,
    "SO4-2": 0.000610035394545076,
    "Ca+2": 0.6408503418334248,
    "Na+": 2.142213782139351,
    "K+": 0.37001608765598504,
    "Mg+2": 0.004484673935404238,
    "Li+": 0.02910662824207493,
    "Br-": 0.0011388666399679615
  },
  "evidence": [
    {
      "label": "Stringfellow & Dobson 2021, Energies Table 2: Salton Sea post-flash geothermal brine literature-mean majors (DOI)",
      "url": "https://doi.org/10.3390/en14206805"
    },
    {
      "label": "NREL TEA lithium-from-geothermal-brines (OSTI 1782801 / NREL/TP-5700-79178) Table 1: SSGF production-fluid majors, ppm well family",
      "url": "https://doi.org/10.2172/1782801"
    },
    {
      "label": "Stringfellow 2025, Energies Table 1: same SSGF post-flash means as mg/kg brine (DOI)",
      "url": "https://doi.org/10.3390/en18061359"
    }
  ]
});
