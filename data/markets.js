(function exposeFoundryMarkets(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoundryMarkets = api;
})(globalThis, () => {
// World-market sizes and reference prices for the multi-year company simulator.
//
// One row per SALE product key of TeaScreening.prices (feed/input-only keys such as
// water are excluded) plus `hydrogen` (merchant + captive H₂). Unlike
// TeaScreening.demand (regional offtake caps), these rows are WORLD markets, used to
// cap growth by market share and to lower realized price as the company's share rises:
//
//   share         = companyTonnes / worldDemandTPerYear
//   realizedPrice = priceUsdPerKg × (1 − priceElasticity × share)
//
// priceUsdPerKg copies TeaScreening.prices[key].value (hydrogen copies
// TeaScreening.costs['hydrogen-feed'].value) so the simulator and the screening TEA agree.
// `basis` states what the tonnage counts; it is chosen to match what the price is per kg
// of (e.g. lithium is LCE because the screening price is an LCE proxy).
// priceElasticity is always screening (deep commodity ~0.3, thin specialty ~0.8–1.0).
// quality 'cited' means the tonnage is a specific named-source/year figure (possibly with
// a stated stoichiometric/unit conversion); 'screening' means order-of-magnitude or
// market-research estimates. growthPerYear is screening unless the note says otherwise.
// Screening, not bankable market studies.

const SCHEMA_VERSION = 1;

const USGS_LI_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-lithium.pdf';
const USGS_BR_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-bromine.pdf';
const USGS_K_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-potash.pdf';
const USGS_SALT_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-salt.pdf';
const USGS_GYP_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-gypsum.pdf';
const USGS_MG_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-magnesium-compounds.pdf';
const USGS_N_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-nitrogen.pdf';
const USGS_SI_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-silicon.pdf';
const USGS_AL_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-aluminum.pdf';
const USGS_CEMENT_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-cement.pdf';
const USGS_CU_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-copper.pdf';
const USGS_STEEL_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-iron-steel.pdf';
const USGS_TI_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-titanium.pdf';
const USGS_REE_2026 = 'https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-rare-earths.pdf';
const IEA_H2_2025 = 'https://www.iea.org/reports/global-hydrogen-review-2025/demand';
const IEA_GAS_2025 = 'https://www.iea.org/reports/global-energy-review-2025/natural-gas';
const IEA_GAS_2025_ES = 'https://www.iea.org/reports/gas-2025/executive-summary';
const METHANEX_2024 = 'https://www.methanex.com/wp-content/uploads/2024-Annual-Report-MDA-Only.pdf';
const METHANOL_INST = 'https://www.methanol.org/methanol-price-supply-demand';
const INDEXBOX_ETHYLENE = 'https://www.indexbox.io/blog/ethylene-world-market-overview-2024-4/';
const ICIS_ETHYLENE = 'https://icis.com/explore/resources/news/2024/09/17/11032070/blog-global-ethylene-12-months-later-nothing-seems-to-have-changed';
const DTN_UREA_IFA = 'https://www.dtnpf.com/agriculture/web/ag/crops/article/2025/12/12/2026-nitrogen-prices-will-determined';
const CHEMANALYST_CAUSTIC = 'https://www.chemanalyst.com/industry-report/caustic-soda-market-681';
const INDEXBOX_CAUSTIC = 'https://www.indexbox.io/blog/caustic-soda-world-market-overview-2024-5/';
const RSC_OXYGEN = 'https://edu.rsc.org/download?ac=11070';
const TSE_ASU = 'https://thundersaidenergy.com/2023/05/31/industrial-gases-air-separation-units/';
const BNN_DIESEL = 'https://bnnbloomberg.ca/investing/2024/11/05/diesel-set-for-growing-glut-as-demand-falters';
const IEA_GER_2026_OIL = 'https://www.iea.org/reports/global-energy-review-2026/oil';
const BERNREUTER_POLYSI_2025 = 'https://www.bernreuter.com/newsroom/press-releases/polysilicon-industry-is-risking-new-shortage/';
const TAIYANG_POLYSI_2024 = 'https://taiyangnews.info/business/china-dominates-2024-global-polysilicon-production';
const SMM_NDPR_2024 = 'https://news.metal.com/newscontent/103121180/2024-Rare-Earth-Market-Dynamics-Review-and-Future-Outlook-[SMM-Analysis]';
const SPGLOBAL_NDPR_2026 = 'https://www.spglobal.com/content/dam/spglobal/global-assets/en/special-reports/critical-mineral-market-reports/Market%20Report%20-%20NdPr%20-%2008052026.pdf';
const ARGUS_REE_2025 = 'https://www.argusmedia.com/metals-platform/newsandanalysis/article/2641705-Viewpoint--China-s-rare-earth-sector-faces-tough-2025';
const CHEMANALYST_GLUCONATE = 'https://chemanalyst.com/industry-report/sodium-gluconate-market-2894';
const MP_H2O2 = 'https://pdf.marketpublishers.com/globalinfo/global-hydrogen-peroxide-gir.pdf';
const CTA_H2O2 = 'https://www.chemtradeasia.com/market-insights/solvay-hydrogen-peroxide-supply-chain';
const PVMAG_PVPS_TRENDS_2025 = 'https://www.pv-magazine.com/2025/10/17/thirty-five-countries-now-operate-gw-scale-annual-pv-markets/';
const PVPS_TRENDS_2025 = 'https://iea-pvps.org/wp-content/uploads/2025/12/Trends-2025-FS.pdf';
const MIDREX_DRI_2024 = 'https://www.midrex.com/company-news/140-8-mt-of-dri-produced-globally-in-2024';
const FREEDONIA_FLAT_GLASS = 'https://www.freedoniagroup.com/World-Flat-Glass.html';
const WORLDSTEEL_SRO_2026 = 'https://worldsteel.org/media/press-releases/2026/worldsteel-short-range-outlook-april-2026/';

// Unit conversions used below (stated so rows are reproducible).
const LI_TO_LCE = 5.323; // t Li2CO3 per t Li
const K2O_IN_MOP = 0.60; // standard muriate of potash grade, t K2O per t product
const N_TO_NH3 = 17.031 / 14.007; // t NH3 per t N
const PV_KG_PER_KWP = 52.7; // 11.6 kg/m² ÷ 0.220 kW/m² — same as TeaScreening pv-module price note

const MARKETS = {
  lithium: {
    name: 'Lithium chemicals (LCE)',
    basis: 'LCE (Li₂CO₃ equivalent)',
    worldDemandTPerYear: 290000 * LI_TO_LCE, // ≈ 1.54 Mt LCE
    demandYear: 2025,
    growthPerYear: 0.12,
    priceUsdPerKg: 14,
    priceBandUsdPerKg: [8, 30],
    priceElasticity: 0.9,
    quality: 'cited',
    sources: [
      { label: 'USGS MCS 2026 Lithium — world mine production 2025e 290,000 t Li content (222,000 t in 2024)', url: USGS_LI_2026 },
      { label: 'IEA Global Critical Minerals Outlook 2025 — outlook for key minerals (lithium demand growth family)', url: 'https://www.iea.org/reports/global-critical-minerals-outlook-2025/outlook-for-key-minerals' },
    ],
    note: 'USGS 290 kt Li × 5.323 = ~1.54 Mt LCE, matching the TeaScreening LCE-proxy price ($14/kg). Growth 12%/y is screening (USGS +31% 2024→25; IEA scenarios several-fold by 2030); thin, volatile market.',
  },
  bromine: {
    name: 'Bromine',
    basis: 'Br₂ (bromine content)',
    worldDemandTPerYear: 430000,
    demandYear: 2025,
    growthPerYear: 0.02,
    priceUsdPerKg: 3.1,
    priceBandUsdPerKg: [2, 5],
    priceElasticity: 0.9,
    quality: 'cited',
    sources: [{ label: 'USGS MCS 2026 Bromine — world production 2025e ~430,000 t (US withheld)', url: USGS_BR_2026 }],
    note: 'USGS world total excludes withheld US output (Albemarle/LANXESS, a large share of capacity), so the true market is somewhat larger. Concentrated oligopoly market (Israel, Jordan, China, US); growth screening.',
  },
  potash: {
    name: 'Potash (muriate of potash, KCl)',
    basis: 'MOP product (60% K₂O)',
    worldDemandTPerYear: 49e6 / K2O_IN_MOP, // ≈ 82 Mt product
    demandYear: 2025,
    growthPerYear: 0.025,
    priceUsdPerKg: 0.35,
    priceBandUsdPerKg: [0.25, 0.6],
    priceElasticity: 0.4,
    quality: 'cited',
    sources: [{ label: 'USGS MCS 2026 Potash — world mine production 2025e 49 Mt K₂O equivalent (46.7 Mt in 2024)', url: USGS_K_2026 }],
    note: 'USGS 49 Mt K₂O ÷ 0.60 = ~82 Mt MOP-equivalent product, matching the per-kg-muriate screening price. Includes some SOP/other forms; growth from USGS 2024→25 (+5%) tempered to a trend value.',
  },
  salt: {
    name: 'Salt (NaCl, all grades)',
    basis: 'NaCl (all grades, gross)',
    worldDemandTPerYear: 270e6,
    demandYear: 2025,
    growthPerYear: 0.01,
    priceUsdPerKg: 0.06,
    priceBandUsdPerKg: [0.03, 0.1],
    priceElasticity: 0.3,
    quality: 'cited',
    sources: [{ label: 'USGS MCS 2026 Salt — world production 2025e 270 Mt (275 Mt in 2024)', url: USGS_SALT_2026 }],
    note: 'All grades incl. rock salt for de-icing; the industrial/chemical-grade slice the screening price represents is a subset. Deep, regionally fragmented market; growth screening.',
  },
  gypsum: {
    name: 'Gypsum (crude)',
    basis: 'crude gypsum (mined, gross)',
    worldDemandTPerYear: 160e6,
    demandYear: 2025,
    growthPerYear: 0.01,
    priceUsdPerKg: 0.02,
    priceBandUsdPerKg: [0.01, 0.04],
    priceElasticity: 0.3,
    quality: 'cited',
    sources: [{ label: 'USGS MCS 2026 Gypsum — world mine production 2025e 160 Mt (162 Mt in 2024)', url: USGS_GYP_2026 }],
    note: 'Mined gypsum only; synthetic (FGD) gypsum adds supply not counted here. Low value-to-weight, so the reachable market is freight-limited and regional; growth screening.',
  },
  magnesium: {
    name: 'Magnesium compounds (brine Mg / MgCl₂ proxy)',
    basis: 'magnesite gross weight (Mg-compound market proxy)',
    worldDemandTPerYear: 21e6,
    demandYear: 2025,
    growthPerYear: 0.01,
    priceUsdPerKg: 0.08,
    priceBandUsdPerKg: [0.04, 0.3],
    priceElasticity: 0.5,
    quality: 'screening',
    sources: [{ label: 'USGS MCS 2026 Magnesium Compounds — world magnesite mine production 2025e 21 Mt gross weight', url: USGS_MG_2026 }],
    note: 'Proxy: USGS magnesite tonnage stands in for the Mg-compound market (MgO/MgCl₂/Mg(OH)₂ from magnesite, brine and seawater); not the same basis as the MgCl₂·6H₂O screening price, hence screening. Not Mg metal (~1.1 Mt/y).',
  },
  caustic: {
    name: 'Caustic soda (NaOH)',
    basis: 'NaOH (100% basis)',
    worldDemandTPerYear: 80e6,
    demandYear: 2024,
    growthPerYear: 0.025,
    priceUsdPerKg: 0.45,
    priceBandUsdPerKg: [0.3, 0.6],
    priceElasticity: 0.4,
    quality: 'screening',
    sources: [
      { label: 'ChemAnalyst caustic soda market — ~80 Mt market volume 2024', url: CHEMANALYST_CAUSTIC },
      { label: 'IndexBox world caustic soda market overview 2024 — ~75 Mt production 2024', url: INDEXBOX_CAUSTIC },
    ],
    note: 'Market-research estimates (75–83 Mt) disagree on basis; ~80 Mt used. Chlor-alkali coproduct: supply follows chlorine demand. Screening.',
  },
  ammonia: {
    name: 'Ammonia (NH₃)',
    basis: 'NH₃',
    worldDemandTPerYear: 160e6 * N_TO_NH3, // ≈ 194 Mt NH3
    demandYear: 2025,
    growthPerYear: 0.015,
    priceUsdPerKg: 0.45,
    priceBandUsdPerKg: [0.3, 0.7],
    priceElasticity: 0.4,
    quality: 'cited',
    sources: [{ label: 'USGS MCS 2026 Nitrogen (fixed)—Ammonia — world plant production 2025e 160 Mt N content', url: USGS_N_2026 }],
    note: 'USGS 160 Mt N × 17.03/14.01 = ~194 Mt NH₃. Most ammonia is captive (urea/nitrates); traded merchant NH₃ is ~10% of that, so effective share for a merchant seller is higher. Growth screening.',
  },
  oxygen: {
    name: 'Oxygen (industrial, all purities)',
    basis: 'O₂',
    worldDemandTPerYear: 300e6,
    demandYear: 2023,
    growthPerYear: 0.03,
    priceUsdPerKg: 0.05,
    priceBandUsdPerKg: [0.02, 0.15],
    priceElasticity: 0.5,
    quality: 'screening',
    sources: [
      { label: 'RSC Chemistry fact file — world oxygen production ~240 Mt/y (undated)', url: RSC_OXYGEN },
      { label: 'Thunder Said Energy — industrial gases / air separation units (~400 Mt/y O₂, 2023)', url: TSE_ASU },
    ],
    note: 'Midpoint of an undated RSC 240 Mt/y and Thunder Said Energy ~400 Mt/y estimate; mostly captive on-site ASU supply to steel/chemicals, so the pipeline/merchant market reachable from one site is far smaller. Screening.',
  },
  methane: {
    name: 'Methane (synthetic natural gas)',
    basis: 'CH₄ / natural gas mass (~0.72 kg/m³)',
    worldDemandTPerYear: 4300e9 * 0.72 / 1000, // ≈ 3.1 Gt
    demandYear: 2024,
    growthPerYear: 0.015,
    priceUsdPerKg: 1,
    priceBandUsdPerKg: [0.15, 1.5],
    priceElasticity: 0.3,
    quality: 'screening',
    sources: [
      { label: 'IEA Global Energy Review 2025 — natural gas demand +2.7% (+115 bcm) in 2024', url: IEA_GAS_2025 },
      { label: 'IEA Gas 2025 — demand growth slowed to <1% in 2025', url: IEA_GAS_2025_ES },
    ],
    note: 'World gas ~4,300 bcm (implied by IEA +115 bcm = +2.7%) × 0.72 kg/m³ ≈ 3.1 Gt. The $1/kg screening price is a green-premium offtake; fossil gas trades ~$0.15–0.40/kg, so the market at $1/kg is a small premium niche of this tonnage.',
  },
  methanol: {
    name: 'Methanol',
    basis: 'CH₃OH',
    worldDemandTPerYear: 97e6,
    demandYear: 2024,
    growthPerYear: 0.03,
    priceUsdPerKg: 0.4,
    priceBandUsdPerKg: [0.25, 0.55],
    priceElasticity: 0.4,
    quality: 'cited',
    sources: [
      { label: 'Methanex 2024 Annual Report (MD&A) — global methanol demand ~97 Mt in 2024', url: METHANEX_2024 },
      { label: 'Methanol Institute — methanol price, supply and demand (2024 demand +2–3%)', url: METHANOL_INST },
    ],
    note: 'Methanex 97 Mt includes China captive coal-to-olefins; Argus merchant-only is ~90.5 Mt. Growth ~2–3%/y per Methanol Institute/Argus.',
  },
  ethylene: {
    name: 'Ethylene',
    basis: 'C₂H₄',
    worldDemandTPerYear: 144e6,
    demandYear: 2024,
    growthPerYear: 0.03,
    priceUsdPerKg: 0.8,
    priceBandUsdPerKg: [0.5, 1.1],
    priceElasticity: 0.4,
    quality: 'screening',
    sources: [
      { label: 'IndexBox world ethylene market overview 2024 — ~144 Mt production 2024', url: INDEXBOX_ETHYLENE },
      { label: 'ICIS blog — global ethylene capacity/demand balance (Sept 2024)', url: ICIS_ETHYLENE },
    ],
    note: 'IndexBox 142–144 Mt; other trade estimates run to ~170–190 Mt against >220 Mt capacity, so this is a conservative low-end market. Mostly captive to polymer plants. Screening.',
  },
  diesel: {
    name: 'Diesel / gasoil',
    basis: 'diesel (~0.835 t/m³)',
    worldDemandTPerYear: 28e6 * 365 * 0.158987 * 0.835, // ≈ 1.36 Gt
    demandYear: 2024,
    growthPerYear: 0,
    priceUsdPerKg: 0.9,
    priceBandUsdPerKg: [0.7, 1.1],
    priceElasticity: 0.3,
    quality: 'screening',
    sources: [
      { label: 'BNN Bloomberg (Nov 2024) — global diesel consumption >28 million b/d; IEA expected gasoil to fall in 2024', url: BNN_DIESEL },
      { label: 'IEA Global Energy Review 2026 — oil: gasoline and diesel demand virtually unchanged in 2025', url: IEA_GER_2026_OIL },
    ],
    note: '28 Mb/d × 0.159 m³/bbl × 0.835 t/m³ × 365 ≈ 1.36 Gt; secondary-press figure, hence screening. Flat-to-declining demand (road peak).',
  },
  urea: {
    name: 'Urea',
    basis: 'urea (granular/prilled product)',
    worldDemandTPerYear: 201e6,
    demandYear: 2024,
    growthPerYear: 0.02,
    priceUsdPerKg: 0.4,
    priceBandUsdPerKg: [0.3, 0.55],
    priceElasticity: 0.4,
    quality: 'cited',
    sources: [{ label: 'DTN Global Fertilizer Outlook (Dec 2025) citing IFA — urea production 201 Mt in 2024, +3% y/y', url: DTN_UREA_IFA }],
    note: 'IFA figure via DTN; IndexBox reports ~142 Mt on a different basis. Includes technical/DEF urea. Growth ~2%/y screening (IFA +3% 2024).',
  },
  silicon: {
    name: 'Silicon metal (metallurgical grade)',
    basis: 'Si content (silicon metal, excl. ferrosilicon)',
    worldDemandTPerYear: 4.6e6,
    demandYear: 2025,
    growthPerYear: 0.03,
    priceUsdPerKg: 3.97,
    priceBandUsdPerKg: [2, 4.5],
    priceElasticity: 0.6,
    quality: 'cited',
    sources: [{ label: 'USGS MCS 2026 Silicon — world silicon metal production 2025e 4.6 Mt Si content (5.5 Mt in 2024)', url: USGS_SI_2026 }],
    note: 'Silicon metal only (ferrosilicon is a further ~5.0 Mt Si). China ~87% of output; 2025 dip reflects Chinese curtailments. Growth screening.',
  },
  aluminium: {
    name: 'Aluminium (primary)',
    basis: 'primary aluminium metal',
    worldDemandTPerYear: 74e6,
    demandYear: 2025,
    growthPerYear: 0.025,
    priceUsdPerKg: 2.87,
    priceBandUsdPerKg: [2, 3.5],
    priceElasticity: 0.3,
    quality: 'cited',
    sources: [{ label: 'USGS MCS 2026 Aluminum — world smelter production 2025e 74 Mt (72.8 Mt in 2024)', url: USGS_AL_2026 }],
    note: 'Primary smelter output only; secondary (recycled) aluminium adds roughly another third to total supply. Deep LME market.',
  },
  polysilicon: {
    name: 'Polysilicon (solar grade)',
    basis: 'polysilicon (Si)',
    worldDemandTPerYear: 1.9e6,
    demandYear: 2024,
    growthPerYear: 0.05,
    priceUsdPerKg: 6,
    priceBandUsdPerKg: [4, 10],
    priceElasticity: 0.7,
    quality: 'screening',
    sources: [
      { label: 'Bernreuter Research (Jun 2025) — polysilicon industry is risking new shortage (China capacity 3.25 Mt end-2024; 400 kt inventory)', url: BERNREUTER_POLYSI_2025 },
      { label: 'TaiyangNews — China dominates 2024 global polysilicon production (93.5% share)', url: TAIYANG_POLYSI_2024 },
    ],
    note: 'Order-of-magnitude production estimate (~1.9 Mt) consistent with ~728 GW of 2024 modules at ~2 g/W plus inventory build; nameplate capacity (~3.5 Mt) is far above demand. Screening.',
  },
  'ndpr-oxide': {
    name: 'NdPr oxide (in mixed RE concentrate, payable)',
    basis: 'NdPr oxide contained',
    worldDemandTPerYear: 97000,
    demandYear: 2024,
    growthPerYear: 0.06,
    priceUsdPerKg: 48.3,
    priceBandUsdPerKg: [30, 100],
    priceElasticity: 0.9,
    quality: 'screening',
    sources: [
      { label: 'SMM 2024 rare earth market dynamics review and outlook — global Pr-Nd oxide demand ~97,100 t (2024)', url: SMM_NDPR_2024 },
      { label: 'S&P Global NdPr market report (Aug 2026) — NdPr demand +32% 2025→2030', url: SPGLOBAL_NDPR_2026 },
    ],
    note: 'Same world NdPr market as ndpr-oxide-separated; price here is the 0.70-payability MREC value from TeaScreening. SMM forecast-year figure, hence screening; growth ~6%/y from S&P +32% over 5 years.',
  },
  'other-reo': {
    name: 'Other rare-earth oxides (Longnan basket, payable)',
    basis: 'REO (non-NdPr oxides, value-weighted basket)',
    worldDemandTPerYear: 290000,
    demandYear: 2025,
    growthPerYear: 0.03,
    priceUsdPerKg: 33.61,
    priceBandUsdPerKg: [15, 60],
    priceElasticity: 1.0,
    quality: 'screening',
    sources: [{ label: 'USGS MCS 2026 Rare Earths — world mine production 2025e 390,000 t REO', url: USGS_REE_2026 }],
    note: 'USGS 390 kt REO minus ~100 kt NdPr ≈ 290 kt. Tonnage is mostly oversupplied La/Ce while the basket price is driven by heavies, so value-weighted headroom is much thinner than tonnage implies — hence elasticity 1.0. Screening.',
  },
  'ndpr-oxide-separated': {
    name: 'NdPr oxide (separated, 99%)',
    basis: 'NdPr oxide',
    worldDemandTPerYear: 97000,
    demandYear: 2024,
    growthPerYear: 0.06,
    priceUsdPerKg: 69,
    priceBandUsdPerKg: [50, 130],
    priceElasticity: 0.9,
    quality: 'screening',
    sources: [
      { label: 'SMM 2024 rare earth market dynamics review and outlook — global Pr-Nd oxide demand ~97,100 t (2024)', url: SMM_NDPR_2024 },
      { label: 'S&P Global NdPr market report (Aug 2026) — NdPr demand +32% 2025→2030', url: SPGLOBAL_NDPR_2026 },
    ],
    note: 'Same market as ndpr-oxide (do not add both as separate headroom). Thin, China-dominated, policy-driven price. Screening.',
  },
  'dytb-oxide': {
    name: 'Dy + Tb oxides (Longnan-weighted)',
    basis: 'Dy₂O₃ + Tb₄O₇',
    worldDemandTPerYear: 4200,
    demandYear: 2024,
    growthPerYear: 0.06,
    priceUsdPerKg: 340.19,
    priceBandUsdPerKg: [200, 1000],
    priceElasticity: 1.0,
    quality: 'screening',
    sources: [{ label: 'Argus Viewpoint: China’s rare earth sector faces tough 2025 — China Dy oxide ~3,500 t and Tb oxide ~650 t output 2024', url: ARGUS_REE_2025 }],
    note: 'Chinese supply (~3,500 t Dy₂O₃ + ~650 t Tb₄O₇, with >1,200 t combined surplus) used as a world-market proxy. Very thin: a single producer moves price. Screening.',
  },
  'light-reo': {
    name: 'Light/other REO excl. NdPr and Dy/Tb (payable)',
    basis: 'REO (non-NdPr, non-DyTb oxides)',
    worldDemandTPerYear: 286000,
    demandYear: 2025,
    growthPerYear: 0.02,
    priceUsdPerKg: 17.5,
    priceBandUsdPerKg: [5, 35],
    priceElasticity: 1.0,
    quality: 'screening',
    sources: [{ label: 'USGS MCS 2026 Rare Earths — world mine production 2025e 390,000 t REO', url: USGS_REE_2026 }],
    note: 'other-reo tonnage (~290 kt) minus ~4 kt Dy/Tb. Dominated by oversupplied La/Ce; the basket value sits in Sm/Gd/Ho etc., so effective headroom is small. Do not stack with other-reo. Screening.',
  },
  gluconic: {
    name: 'Gluconic acid / gluconates',
    basis: 'gluconic acid equivalent',
    worldDemandTPerYear: 680000 * (196.16 / 218.14), // ≈ 610 kt
    demandYear: 2022,
    growthPerYear: 0.0365,
    priceUsdPerKg: 0.515,
    priceBandUsdPerKg: [0.4, 1.2],
    priceElasticity: 0.8,
    quality: 'screening',
    sources: [{ label: 'ChemAnalyst sodium gluconate market — ~680 kt 2022, 3.65% CAGR to ~975 kt by 2032', url: CHEMANALYST_GLUCONATE }],
    note: 'Sodium gluconate 680 kt × 196/218 ≈ 610 kt gluconic-acid equivalent (gluconate dominates the market; free acid is smaller). Single market-research source. Screening.',
  },
  'hydrogen-peroxide': {
    name: 'Hydrogen peroxide',
    basis: 'H₂O₂ (100% basis)',
    worldDemandTPerYear: 6.2e6,
    demandYear: 2024,
    growthPerYear: 0.03,
    priceUsdPerKg: 0.674,
    priceBandUsdPerKg: [0.4, 1.0],
    priceElasticity: 0.5,
    quality: 'screening',
    sources: [
      { label: 'GlobalInfoResearch via MarketPublishers — global H₂O₂ production ~6.19 Mt (100% basis) 2024', url: MP_H2O2 },
      { label: 'ChemtradeAsia — Solvay hydrogen peroxide supply chain (~7.7 Mt 2024, basis unstated)', url: CTA_H2O2 },
    ],
    note: 'Market-research estimates 6.2–7.7 Mt. TeaScreening price is IndexBox US export value with unstated concentration; if that is ~50–70% solution the 100%-basis price is higher. Screening.',
  },
  'pv-module': {
    name: 'PV modules',
    basis: 'module mass (52.7 kg/kWp)',
    worldDemandTPerYear: 728e6 * PV_KG_PER_KWP / 1000, // 728 GW → ≈ 38 Mt
    demandYear: 2024,
    growthPerYear: 0.03,
    priceUsdPerKg: 2.85,
    priceBandUsdPerKg: [1.9, 3.8],
    priceElasticity: 0.5,
    quality: 'cited',
    sources: [
      { label: 'pv magazine on IEA PVPS Trends 2025 — global module production 728 GW in 2024 (+18.5%)', url: PVMAG_PVPS_TRENDS_2025 },
      { label: 'IEA PVPS Trends in PV Applications 2025 (fact sheet)', url: PVPS_TRENDS_2025 },
    ],
    note: '728 GW × 52.7 kg/kWp (11.6 kg/m² ÷ 0.220 kW/m², the TeaScreening price conversion; at 21% efficiency ~55 kg/kWp) ≈ 38 Mt. 2025 production ~722 GW (flat) with ~1.4–1.5 TW capacity, so growth is screening.',
  },
  steel: {
    name: 'DRI / HBI (direct-reduced iron)',
    basis: 'DRI/HBI (metallic iron product)',
    worldDemandTPerYear: 140.8e6,
    demandYear: 2024,
    growthPerYear: 0.04,
    priceUsdPerKg: 0.4,
    priceBandUsdPerKg: [0.3, 0.5],
    priceElasticity: 0.4,
    quality: 'cited',
    sources: [
      { label: 'Midrex World DRI Statistics — 140.8 Mt DRI produced globally in 2024 (+3.8%)', url: MIDREX_DRI_2024 },
      { label: 'USGS MCS 2026 Iron and Steel — world raw steel 1,900 Mt and pig iron 1,300 Mt 2025e (downstream ceiling)', url: USGS_STEEL_2026 },
      { label: 'worldsteel Short Range Outlook April 2026 — steel demand growth 2026–27', url: WORLDSTEEL_SRO_2026 },
    ],
    note: 'Key `steel` is priced as DRI/HBI, so the market is DRI (mostly captive; merchant HBI is ~10–15%). Pig iron (~1.3 Gt) is the substitutable ceiling as H₂-DRI displaces blast furnaces. DRI grew ~30% 2019→24; steel demand ~flat.',
  },
  titanium: {
    name: 'Titanium sponge',
    basis: 'Ti sponge',
    worldDemandTPerYear: 370000,
    demandYear: 2025,
    growthPerYear: 0.03,
    priceUsdPerKg: 8,
    priceBandUsdPerKg: [6, 13],
    priceElasticity: 0.8,
    quality: 'cited',
    sources: [{ label: 'USGS MCS 2026 Titanium and Titanium Dioxide — world sponge production 2025e 370,000 t (US withheld)', url: USGS_TI_2026 }],
    note: 'China ~70% of sponge output; aerospace-grade and Chinese industrial sponge are partly separate markets. Thin market; growth screening.',
  },
  'float-glass': {
    name: 'Flat (float) glass incl. solar glass',
    basis: 'flat glass mass',
    worldDemandTPerYear: 135e6,
    demandYear: 2024,
    growthPerYear: 0.028,
    priceUsdPerKg: 0.45,
    priceBandUsdPerKg: [0.3, 0.6],
    priceElasticity: 0.5,
    quality: 'screening',
    sources: [{ label: 'Freedonia Global Flat Glass — demand +2.8%/y to 16.0 billion m² in 2030', url: FREEDONIA_FLAT_GLASS }],
    note: 'Back-cast 16.0e9 m² (2030) at 2.8%/y ≈ 13.5e9 m² in 2024 × ~10 kg/m² (4 mm) ≈ 135 Mt. Solar glass (the priced product) is ~26 Mt of that (728 GW × 52.7 kg/kWp × 0.6745 glass share). Screening.',
  },
  cement: {
    name: 'Cement (Portland, grey)',
    basis: 'cement',
    worldDemandTPerYear: 3.8e9,
    demandYear: 2025,
    growthPerYear: 0.005,
    priceUsdPerKg: 0.16,
    priceBandUsdPerKg: [0.1, 0.2],
    priceElasticity: 0.3,
    quality: 'cited',
    sources: [{ label: 'USGS MCS 2026 Cement — world production 2025e 3.8 Gt (3.9 Gt in 2024)', url: USGS_CEMENT_2026 }],
    note: 'China (~1.7 Gt) declining, India/Vietnam/Egypt growing; world roughly flat. Very freight-limited: reachable market is regional (~300 km by land).',
  },
  'copper-cathode': {
    name: 'Refined copper cathode',
    basis: 'refined Cu',
    worldDemandTPerYear: 29e6,
    demandYear: 2025,
    growthPerYear: 0.03,
    priceUsdPerKg: 9.7,
    priceBandUsdPerKg: [8, 11],
    priceElasticity: 0.3,
    quality: 'cited',
    sources: [{ label: 'USGS MCS 2026 Copper — world refinery production 2025e 29 Mt (27.6 Mt in 2024); mine 23 Mt', url: USGS_CU_2026 }],
    note: 'Refined output incl. secondary; SX-EW cathode is ~15–20% of refined supply. Deep LME market; growth screening (electrification).',
  },
  hydrogen: {
    name: 'Hydrogen (merchant + captive)',
    basis: 'H₂',
    worldDemandTPerYear: 100e6,
    demandYear: 2024,
    growthPerYear: 0.02,
    priceUsdPerKg: 2,
    priceBandUsdPerKg: [1, 6],
    priceElasticity: 0.5,
    quality: 'cited',
    sources: [{ label: 'IEA Global Hydrogen Review 2025 — demand: almost 100 Mt in 2024 (+2%)', url: IEA_H2_2025 }],
    note: 'Not in TeaScreening.prices; reference price is TeaScreening.costs hydrogen-feed ($2.00/kg grey–blue blend). ~85% is captive on-site (refining, ammonia, methanol); merchant H₂ is a few Mt. Low-emissions H₂ <1 Mt.',
  },
};

return { MARKETS, SCHEMA_VERSION };
});
