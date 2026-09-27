# Catalog polish summary (`feat/catalog-polish`)

**Date:** 2026-09-27 (Europe/Berlin)

## PVGIS-ERA5 freezes added (real JRC fetches; no Dead Sea / Atacama clones)

| Site id | File | E_y (kWh/kWp·y) | Lat, Lon | Retrieved |
|---|---|---:|---|---|
| argentina-hombre-muerto | data/pvgis-hombre-muerto.json | 1668.03 | -25.42, -66.92 | 2026-09-27 |
| chile-salar-de-maricunga | data/pvgis-maricunga.json | 1744.40 | -26.92, -69.05 | 2026-09-27 |
| us-clayton-valley | data/pvgis-clayton-valley.json | 1917.59 | 37.75, -117.57 | 2026-09-27 |
| china-zabuye | data/pvgis-zabuye.json | 2070.67 | 31.35, 84.05 | 2026-09-27 |
| argentina-puerto-madryn | data/pvgis-puerto-madryn.json | 977.78 | -42.77, -65.04 | 2026-09-27 |
| israel-ashkelon | data/pvgis-ashkelon.json | 1695.12 | 31.63, 34.56 | 2026-09-27 |
| djibouti-doraleh | data/pvgis-doraleh.json | 1623.66 | 11.59, 43.09 | 2026-09-27 |
| us-huntington-beach | data/pvgis-huntington-beach.json | 1762.00 | 33.655, -118.005 | 2026-09-27 |
| mexico-guerrero-negro | data/pvgis-guerrero-negro.json | 1881.94 | 27.97, -114.05 | 2026-09-27 |

- JRC API succeeded for **all** requested freezes (0 TLS/API failures).
- `SCREENING_BAND_SITE_IDS` cleared to `[]` (previously the seven 58ca0d7 sites).
- Site preset notes updated from “latitude screening band until frozen” → “Frozen PVGIS-ERA5 on select (per-site series)”.

## Deferred sites — added

| Site | Kind | Seawater assay | Brine assay | Citation basis |
|---|---|---|---|---|
| us-huntington-beach (Long Beach / Huntington, CA) | dual-assay industrial-coast | southern-california-bight-seawater (Millero @ S=33.5) | salton-sea-brine (existing; geography-matched CA inland) | CA Water Board Huntington mean salinity ~33.53 ppt; Millero 2008; Stringfellow & Dobson 2021 Salton Sea |
| mexico-guerrero-negro (ESSA, Baja) | dual-assay industrial-coast | baja-pacific-seawater (Millero @ S=35) | guerrero-negro-brine (new) | Dillon et al. 2013 Front. Microbiol. Table 1 Pond 9 majors; Millero 2008; WOA salinity |

## Deferred sites — skipped

| Site | Why skipped |
|---|---|
| Kara-Bogaz-Gol (Turkmenistan) | No solid public major-ion table found (only qualitative Na-Mg-Cl / salinity-range descriptions in Kosarev–Kostianoy / Saltwork Consultants). Did **not** invent ion chemistry. |

## Tests / commit

- `node --test`: **188 pass / 0 fail**
- Commit SHA: PLACEHOLDER
- Branch: `feat/catalog-polish` (base `origin/main` @ 58ca0d7)
- Do **not** push `origin/main`
