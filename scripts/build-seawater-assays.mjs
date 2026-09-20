#!/usr/bin/env node
/**
 * Build Millero/Pilson S=35-scaled regional seawater assays (majors only).
 * Does not invent ions — scales published reference composition by cited salinity.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SUBSTANCES } = require('../engine/model.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const RETRIEVED = '2026-09-13';

// Millero et al. 2008 reference majors at S=35 (g/kg) — same base as Almería.
const MILLERO_S35 = Object.freeze({
  'Cl-': 19.353,
  'Na+': 10.781,
  'SO4-2': 2.712,
  'Mg+2': 1.284,
  'Ca+2': 0.4119,
  'K+': 0.399,
  'Br-': 0.0673,
});

const MILLERO = {
  label: 'Millero et al. 2008, Deep-Sea Research I: reference composition of seawater at S=35 (DOI)',
  url: 'https://doi.org/10.1016/j.dsr.2007.10.001',
};

/** Screening density (kg/L) at ~25 °C — not a CTD cast. Linearized around Almería 1.026 @ 36.5. */
function densityAt(salinity) {
  return Math.round((1.026 + 0.00075 * (salinity - 36.5)) * 1000) / 1000;
}

function buildAssay({ id, site, salinity, quality, notes, evidence, retrieved = RETRIEVED }) {
  const scale = salinity / 35;
  const ions_g_per_kg = {};
  const mol_per_kg = {};
  for (const [ion, g] of Object.entries(MILLERO_S35)) {
    const gg = g * scale;
    ions_g_per_kg[ion] = gg;
    mol_per_kg[ion] = gg / SUBSTANCES[ion].molarMassG;
  }
  const density_kg_per_L = densityAt(salinity);
  return {
    meta: {
      retrieved,
      id,
      site,
      quality,
      notes,
    },
    density_kg_per_L,
    salinity_g_per_kg: salinity,
    ions_g_per_kg,
    mol_per_kg,
    evidence: [MILLERO, ...evidence],
  };
}

const ASSAYS = [
  buildAssay({
    id: 'persian-gulf-seawater',
    site: {
      context: 'Persian/Arabian Gulf basin-average surface salinity ~40.5 g/kg; Millero S=35 majors scaled 40.5/35. Not an intake/discharge permit sample.',
      latitude: 26.0,
      longitude: 52.0,
    },
    salinity: 40.5,
    quality: 'Majors cited from Millero/Pilson S=35 scaled 40.5/35 for Gulf basin-average salinity (Ibrahim et al. 2020 ~40.5 g/kg). Not an intake/discharge permit.',
    notes: 'Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 40.5/35. HCO3 omitted (not in SUBSTANCES). Density is a screening seawater density at this salinity, not a CTD cast. Not a NaCl proxy.',
    evidence: [
      {
        label: 'Ibrahim et al. 2020 Frontiers Mar. Sci.: Gulf basin-average salinity ~40.5 g/kg (DOI)',
        url: 'https://doi.org/10.3389/fmars.2020.00573',
      },
      {
        label: 'Johns et al. 2000 JGR: Persian Gulf / Red Sea outflow salinities 40–41 (DOI)',
        url: 'https://doi.org/10.1029/1999JC900297',
      },
    ],
  }),
  buildAssay({
    id: 'red-sea-seawater',
    site: {
      context: 'Red Sea surface salinity typically 40–41 g/kg; Millero S=35 majors scaled 40.5/35. Not an intake/discharge permit sample.',
      latitude: 28.0,
      longitude: 34.5,
    },
    salinity: 40.5,
    quality: 'Majors cited from Millero/Pilson S=35 scaled 40.5/35 for Red Sea salinity band 40–41 (Johns et al. 2000). Not an intake/discharge permit.',
    notes: 'Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 40.5/35. HCO3 omitted (not in SUBSTANCES). Density is a screening seawater density at this salinity, not a CTD cast. Not a NaCl proxy.',
    evidence: [
      {
        label: 'Johns et al. 2000 JGR: Red Sea Water salinity 40–41 over most of the Red Sea (DOI)',
        url: 'https://doi.org/10.1029/1999JC900297',
      },
      {
        label: 'Wikipedia: Red Sea (salinity context)',
        url: 'https://en.wikipedia.org/wiki/Red_Sea',
      },
    ],
  }),
  buildAssay({
    id: 'texas-gulf-seawater',
    site: {
      context: 'NW Gulf of Mexico / Texas shelf open-water salinity ~36.2 g/kg (Aquarius L3 mid-range); Millero S=35 majors scaled 36.2/35. Not an intake/discharge permit sample.',
      latitude: 27.8,
      longitude: -97.0,
    },
    salinity: 36.2,
    quality: 'Majors cited from Millero/Pilson S=35 scaled 36.2/35 for NW Gulf of Mexico open-shelf salinity mid-band (Aquarius 2012–2014 ~35.9–36.7 psu). Not an intake/discharge permit.',
    notes: 'Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 36.2/35. Coastal river plumes are fresher — this is open-shelf screening, not Corpus Christi Bay. HCO3 omitted. Density screening only. Not a NaCl proxy.',
    evidence: [
      {
        label: 'Rajabi et al. 2017 ISPRS Archives: Aquarius SSS Gulf of Mexico 2012–2014 (~35.9–36.7 psu)',
        url: 'https://isprs-archives.copernicus.org/articles/XLII-4-W4/219/2017/',
      },
      {
        label: 'NOAA NCEI World Ocean Atlas (salinity climatology portal)',
        url: 'https://www.ncei.noaa.gov/products/world-ocean-atlas',
      },
    ],
  }),
  buildAssay({
    id: 'pilbara-indian-ocean-seawater',
    site: {
      context: 'NW Australian / Pilbara Indian Ocean surface salinity ~35.5 g/kg; Millero S=35 majors scaled 35.5/35. Not an intake/discharge permit sample.',
      latitude: -20.3,
      longitude: 118.6,
    },
    salinity: 35.5,
    quality: 'Majors cited from Millero/Pilson S=35 scaled 35.5/35 for tropical Indian Ocean surface salinity near the Pilbara coast (WOA climatology family). Not an intake/discharge permit.',
    notes: 'Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 35.5/35. HCO3 omitted. Density screening only. Not a NaCl proxy.',
    evidence: [
      {
        label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)',
        url: 'https://doi.org/10.25923/70qt-9574',
      },
      {
        label: 'NOAA NCEI World Ocean Atlas portal',
        url: 'https://www.ncei.noaa.gov/products/world-ocean-atlas',
      },
    ],
  }),
  buildAssay({
    id: 'atacama-pacific-seawater',
    site: {
      context: 'SE Pacific / Atacama coast surface salinity ~34.9 g/kg; Millero S=35 majors scaled 34.9/35. Not an intake/discharge permit sample.',
      latitude: -23.1,
      longitude: -70.4,
    },
    salinity: 34.9,
    quality: 'Majors cited from Millero/Pilson S=35 scaled 34.9/35 for SE Pacific surface salinity near the Atacama coast (WOA climatology family). Not an intake/discharge permit.',
    notes: 'Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 34.9/35. HCO3 omitted. Density screening only. Not a NaCl proxy.',
    evidence: [
      {
        label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)',
        url: 'https://doi.org/10.25923/70qt-9574',
      },
      {
        label: 'NOAA NCEI World Ocean Atlas portal',
        url: 'https://www.ncei.noaa.gov/products/world-ocean-atlas',
      },
    ],
  }),
  buildAssay({
    id: 'morocco-atlantic-seawater',
    site: {
      context: 'NE Atlantic / Canary Current surface salinity ~36.5 g/kg; Millero S=35 majors scaled 36.5/35. Not an intake/discharge permit sample.',
      latitude: 30.4,
      longitude: -9.6,
    },
    salinity: 36.5,
    quality: 'Majors cited from Millero/Pilson S=35 scaled 36.5/35 for NE Atlantic / Canary Current surface salinity (surface max near ~37; 36.5 used as open-coast screening). Not an intake/discharge permit.',
    notes: 'Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 36.5/35. HCO3 omitted. Density screening only. Not a NaCl proxy.',
    evidence: [
      {
        label: 'UNESCO IOC Canary Current LME: surface salinity maximum close to 37 (context)',
        url: 'http://hdl.handle.net/1834/9178',
      },
      {
        label: 'NOAA NCEI World Ocean Atlas portal',
        url: 'https://www.ncei.noaa.gov/products/world-ocean-atlas',
      },
    ],
  }),
  buildAssay({
    id: 'arabian-sea-seawater',
    retrieved: '2026-09-21',
    site: {
      context: 'Arabian Sea / NW Indian Ocean surface salinity ~36.3 g/kg (ASHSW 36–36.5 band); Millero S=35 majors scaled 36.3/35. Basin typical, not an intake/discharge permit sample.',
      latitude: 19.7,
      longitude: 57.7,
    },
    salinity: 36.3,
    quality: 'Majors cited from Millero/Pilson S=35 scaled 36.3/35 for Arabian Sea / NW Indian Ocean surface salinity (Kumar & Prasad 1999 ASHSW 36.7–35.3 psu, 36.5 core contour; 36.3 mid-band of the 36–36.5 surface literature). Basin typical, not a Duqm intake/discharge permit.',
    notes: 'Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 36.3/35. HCO3 omitted. Density screening only. Not a NaCl proxy. Not a Port of Duqm / SEZAD intake sample.',
    evidence: [
      {
        label: 'Kumar & Prasad 1999 JGR Oceans: Arabian Sea High-Salinity Water 36.7–35.3 psu; 36.5 core contour (DOI)',
        url: 'https://doi.org/10.1029/1998JC900022',
      },
      {
        label: 'Rao & Sivakumar 2003 JGR Oceans: Arabian Sea SSS in excess of 35‰ year-round; 36‰ contour (DOI)',
        url: 'https://doi.org/10.1029/2001JC000907',
      },
    ],
  }),
  buildAssay({
    id: 'gulf-of-kutch-seawater',
    retrieved: '2026-09-21',
    site: {
      context: 'Gulf of Kutch inverse-estuary mouth/open-gulf salinity ~37.2 g/kg; Millero S=35 majors scaled 37.2/35. Inner gulf is saltier. Not an intake/discharge permit sample.',
      latitude: 22.7,
      longitude: 69.7,
    },
    salinity: 37.2,
    quality: 'Majors cited from Millero/Pilson S=35 scaled 37.2/35 for Gulf of Kutch mouth/open-gulf salinity (Vethamony et al. 2007 37.20 psu near the mouth; inner gulf >40 psu). Inverse-estuary screening, not a Mundra Port intake/discharge permit.',
    notes: 'Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 37.2/35. HCO3 omitted. Density screening only. Not a NaCl proxy. Inner-gulf and saltpan creeks are saltier than this mouth/open-gulf value.',
    evidence: [
      {
        label: 'Vethamony et al. 2007 Mar. Pollut. Bull.: Gulf of Kachchh inverse estuary 37.20 psu near mouth, >40 psu at head (DOI)',
        url: 'https://doi.org/10.1016/j.marpolbul.2007.01.022',
      },
      {
        label: 'Kumar & Prasad 1999 JGR Oceans: Arabian Sea high-salinity surface context for the gulf mouth (DOI)',
        url: 'https://doi.org/10.1029/1998JC900022',
      },
    ],
  }),
  buildAssay({
    id: 'benguela-atlantic-seawater',
    retrieved: '2026-09-21',
    site: {
      context: 'Northern Benguela / SE Atlantic surface salinity ~35.2 g/kg; Millero S=35 majors scaled 35.2/35. Basin typical, not an intake/discharge permit sample.',
      latitude: -23.0,
      longitude: 14.5,
    },
    salinity: 35.2,
    quality: 'Majors cited from Millero/Pilson S=35 scaled 35.2/35 for northern Benguela / SE Atlantic surface salinity (WOA climatology family ~35.0–35.5; Mohrholz et al. 2008 Walvis 23°S hydrography). Basin typical, not a Walvis Bay intake/discharge permit.',
    notes: 'Ion mass concentrations are g/kg seawater. Base S=35 g/kg Millero majors scaled by 35.2/35. HCO3 omitted. Density screening only. Not a NaCl proxy. Not a Namport intake sample.',
    evidence: [
      {
        label: 'Mohrholz et al. 2008 Cont. Shelf Res.: northern Benguela / Walvis Bay 23°S water-mass hydrography (DOI)',
        url: 'https://doi.org/10.1016/j.csr.2007.10.001',
      },
      {
        label: 'NOAA NCEI World Ocean Atlas 2023 Volume 2: Salinity (DOI)',
        url: 'https://doi.org/10.25923/70qt-9574',
      },
    ],
  }),
];

function toUmd(globalName, json) {
  const body = JSON.stringify(json, null, 2);
  return `(function exposeSeawaterAssay(root, data) {\n  if (typeof module === 'object' && module.exports) module.exports = data;\n  else root.${globalName} = data;\n})(globalThis, ${body});\n`;
}

const GLOBALS = {
  'persian-gulf-seawater': 'PersianGulfSeawater',
  'red-sea-seawater': 'RedSeaSeawater',
  'texas-gulf-seawater': 'TexasGulfSeawater',
  'pilbara-indian-ocean-seawater': 'PilbaraIndianOceanSeawater',
  'atacama-pacific-seawater': 'AtacamaPacificSeawater',
  'morocco-atlantic-seawater': 'MoroccoAtlanticSeawater',
  'arabian-sea-seawater': 'ArabianSeaSeawater',
  'gulf-of-kutch-seawater': 'GulfOfKutchSeawater',
  'benguela-atlantic-seawater': 'BenguelaAtlanticSeawater',
};

for (const assay of ASSAYS) {
  const id = assay.meta.id;
  writeFileSync(join(DATA, `${id}.json`), JSON.stringify(assay, null, 2) + '\n');
  writeFileSync(join(DATA, `${id}.js`), toUmd(GLOBALS[id], assay));
  console.log('wrote', id, 'S=', assay.salinity_g_per_kg, 'ρ=', assay.density_kg_per_L);
}

console.log(JSON.stringify({ count: ASSAYS.length, ids: ASSAYS.map((a) => a.meta.id) }, null, 2));
