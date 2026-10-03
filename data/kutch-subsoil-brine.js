(function exposeKutchSubsoilBrine(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.KutchSubsoilBrine = data;
})(globalThis, {
  "meta": {
    "retrieved": "2026-09-21",
    "id": "kutch-subsoil-brine",
    "kind": "brine",
    "site": {
      "latitude": 21.76,
      "longitude": 72.15,
      "context": "Gujarat coastal sub-soil brine (Bhavnagar / Little Rann of Kutch; Rebary & Patidar 2021 Table 6 medians); not Mundra seawater, not a salt-works concession sample"
    },
    "quality": "Median majors across Rebary & Patidar 2021 Table 6 tabulated sub-soil brine rows (Cl, SO4, Br, Na, K, Mg, Ca). Li+/F-/NO3 not detected or not pinned as medians in that table — omitted. Not a Mundra intake sample.",
    "notes": "Ion masses converted from tabulated mg/L to g/kg with density 1.10 kg/L (screening from ~133 g/L ion-sum band — not a CTD). mol_per_kg = g_per_kg / molarMassG from engine/model SUBSTANCES. Literature numbers are preferred over forcing charge balance. salinity_g_per_kg is the summed cited median ions, not the paper ppt headline (density 1). Not Gulf of Kutch seawater; literature assay is not a mineral concession."
  },
  "density_kg_per_L": 1.1,
  "salinity_g_per_kg": 120.82272727272726,
  "ions_g_per_kg": {
    "Cl-": 74.66363636363636,
    "SO4-2": 4.4781818181818185,
    "Br-": 0.2081818181818182,
    "Na+": 32.74545454545454,
    "K+": 1.8727272727272728,
    "Mg+2": 4.209090909090909,
    "Ca+2": 2.6454545454545455
  },
  "mol_per_kg": {
    "Cl-": 2.1061674573663285,
    "SO4-2": 0.0466185906535688,
    "Br-": 0.002605399206320312,
    "Na+": 1.4243490026130556,
    "K+": 0.04789792069545921,
    "Mg+2": 0.17317798432795348,
    "Ca+2": 0.06600764872135699
  },
  "evidence": [
    {
      "label": "Rebary & Patidar 2021, International Journal of Water Research Table 6: Gujarat (Bhavnagar / Little Rann of Kutch) sub-soil brine ion chromatography",
      "url": "https://www.pubtexto.com/journals/international-journal-of-water-research/fulltext/salinity-measurement-of-sub-soil-brine-in-the-coastal-region-of-gujarat-through-ion-chromatography-as-a-single-tool"
    },
    {
      "label": "Gogda, Patidar & Rebary 2017, J. Geol. Soc. India: Little Rann of Kutch / Bhavnagar sub-soil brine context (not the ion table)",
      "url": "https://doi.org/10.1007/s12594-017-0557-6"
    }
  ]
});
