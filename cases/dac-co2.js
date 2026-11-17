// Merchant CO₂ from air: blower → solid-sorbent DAC on PV at Mejillones, 1 t CO₂/day.
// The captive CO₂ supplier for the recipes that otherwise buy co2-feed (green-mto, green-ft,
// ft-liquids, green-urea, urea): engine/company.js maps co2-feed → co2 for make-vs-buy.
const { SUBSTANCES, streamMassKg } = require('../engine/model');
const tea = require('../data/tea-screening.js');
const { MEJILLONES_PVGIS_URL: PVGIS_URL, MEJILLONES_URL, projectEconomics, right, nodeFinder, clone, solarPowerNode, powerToBusEdge } = require('./_shared.js');
// Frozen PVGIS-ERA5 annual average at Mejillones: E_y 1923.52 kWh/kWp ÷ 365 (data/pvgis-mejillones.json).
const DAILY_PV = 1923.52 / 365;
const CO2_KG_PER_DAY = 1000;
const CO2_PPM = 422.45;
// Same solid-sorbent screening parameters as cases/methanol.js (engine/designs/dac.js RECIPE).
const CAPTURE = 0.9;
const DAC_KWH_PER_KG = 0.5;
const HEAT_KWH_PER_KG = 1.5;
const HEAT_T_C = 100;
const HEAT_USD_PER_KWH = 0.01;
const BLOWER_KWH_PER_NM3 = 0.001;
// Amine-sorbent makeup 0.02 kg/kg CO₂ at $2/kg, carried as DAC variable O&M (like a catalyst
// charge) rather than as a bought material feed, so the recipe's feeds are air only. The DAC
// unit's consumables port is wired to an empty consumable source (makeup 0 kg/kg in the flowsheet).
const SORBENT_KG_PER_KG = 0.02;
const SORBENT_USD_PER_KG = 2;
const IEA_DAC = 'https://www.iea.org/reports/direct-air-capture-2022/executive-summary';
const NASEM_DAC = 'https://doi.org/10.17226/25259';
const IEA_CO2_USE = 'https://www.iea.org/reports/putting-co2-to-use';
const AIR_URL = 'https://essd.copernicus.org/articles/17/965/2025/';

function airStream(co2Kg) {
  // Dry air at 422.45 ppm CO₂, O₂/N₂ balance simplified (as cases/methanol.js).
  const co2Mol = co2Kg * 1000 / SUBSTANCES.CO2.molarMassG;
  const totalMol = co2Mol / (CO2_PPM * 1e-6);
  const balance = totalMol - co2Mol;
  return { kind: 'material', mol: { CO2: co2Mol, O2: balance * 0.2115, N2: balance * (1 - 0.2115) }, phase: 'gas', T_C: 25, P_bar: 1 };
}

function createDacCo2Case() {
  const air = airStream(CO2_KG_PER_DAY / CAPTURE);
  const airMol = Object.values(air.mol).reduce((sum, mol) => sum + mol, 0);
  const airNm3 = airMol * 22.414 / 1000;
  const kWhPerDay = CO2_KG_PER_DAY * DAC_KWH_PER_KG + airNm3 * BLOWER_KWH_PER_NM3;
  const solarKWp = kWhPerDay / DAILY_PV * 1.02;
  const power = { kind: 'electricity', kWh: solarKWp * DAILY_PV };
  const heatKWh = CO2_KG_PER_DAY * HEAT_KWH_PER_KG;
  const dacPack = tea.bindCapexPack('dac', { capacity: CO2_KG_PER_DAY });
  const definition = {
    economics: projectEconomics(),
    graph: {
      nodes: [
        { id: 'air', unit: 'material-source', params: { stream: air }, economics: { unitCost: 0 } },
        { id: 'air-blower', unit: 'gas-blower', capacity: airNm3, params: { blowerKWhPerNm3: BLOWER_KWH_PER_NM3 }, economics: tea.bindCapexPack('gas-blower', { capacity: airNm3 }) },
        solarPowerNode(power, solarKWp),
        { id: 'power-bus', unit: 'electrical-bus' },
        { id: 'heat', unit: 'heat-source', params: { stream: { kind: 'heat', kWh: heatKWh, T_C: HEAT_T_C } }, economics: { unitCost: HEAT_USD_PER_KWH } },
        { id: 'sorbent', unit: 'consumable-source', params: { stream: { kind: 'consumable', amount: 0, unit: 'kg/day', label: 'Amine sorbent makeup (costed as DAC variable O&M)', chemicalId: 'amine-sorbent' } } },
        {
          id: 'dac',
          unit: 'dac-solid',
          capacity: CO2_KG_PER_DAY,
          params: {
            captureFraction: CAPTURE,
            electricityKWhPerKgCO2: DAC_KWH_PER_KG,
            heatKWhPerKgCO2: HEAT_KWH_PER_KG,
            minHeatT_C: 80,
            consumablesPerKgCO2: 0,
            wasteHeatT_C: 40,
          },
          economics: { ...dacPack, variableOM: dacPack.variableOM + SORBENT_KG_PER_KG * SORBENT_USD_PER_KG },
        },
        { id: 'co2-product', unit: 'material-sink', economics: tea.bindSale('co2') },
        { id: 'depleted-air', unit: 'material-sink', economics: { disposition: 'vent' } },
        { id: 'waste-heat', unit: 'heat-sink', economics: { disposition: 'vent' } },
        { id: 'spent-media', unit: 'consumable-sink', economics: { disposition: 'vent' } },
      ],
      edges: [
        { from: { node: 'air', port: 'out' }, to: { node: 'air-blower', port: 'in' } },
        { from: { node: 'air-blower', port: 'out' }, to: { node: 'dac', port: 'air' } },
        { from: { node: 'heat', port: 'out' }, to: { node: 'dac', port: 'heat' } },
        { from: { node: 'sorbent', port: 'out' }, to: { node: 'dac', port: 'consumables' } },
        powerToBusEdge(),
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'air-blower', port: 'electricity' } },
        { from: { node: 'power-bus', port: 'out' }, to: { node: 'dac', port: 'electricity' } },
        { from: { node: 'dac', port: 'capturedCo2' }, to: { node: 'co2-product', port: 'in' } },
        { from: { node: 'dac', port: 'depletedAir' }, to: { node: 'depleted-air', port: 'in' } },
        { from: { node: 'dac', port: 'wasteHeat' }, to: { node: 'waste-heat', port: 'in' } },
        { from: { node: 'dac', port: 'spentMedia' }, to: { node: 'spent-media', port: 'in' } },
      ],
    },
    operation: {
      setpoints: { 'air-blower': airNm3, dac: CO2_KG_PER_DAY },
      priorities: { 'power-bus': ['air-blower', 'dac'] },
    },
  };
  const node = nodeFinder(definition);
  node('air').siteResource = 'air';
  node('power').siteResource = 'electricity';
  node('heat').siteResource = 'heat';
  node('sorbent').siteResource = 'consumables';
  definition.site = {
    id: 'chile-mejillones-dac-co2',
    name: 'Mejillones, Antofagasta, Chile',
    latitude: -23.1,
    longitude: -70.448,
    solarKWp,
    dailyPVKWhPerKWp: DAILY_PV,
    resources: {
      air: { stream: clone(node('air').params.stream), quality: 'literature-estimate', evidence: `Ambient air at ${CO2_PPM} ppm CO₂ (2024 global estimate); ${Math.round(streamMassKg(air))} kg/day through the contactors at 90% capture` },
      electricity: { stream: clone(node('power').params.stream), quality: 'literature-estimate', evidence: 'PVGIS-ERA5 annual average 5.27 kWh/kWp·day × array sized to DAC 0.5 kWh/kg + blower 0.001 kWh/Nm³ with 2% margin. No grid purchase.' },
      consumables: { stream: clone(node('sorbent').params.stream), quality: 'user-assumption', evidence: 'Sorbent makeup 0.02 kg/kg CO₂ × $2/kg is costed as DAC variable O&M, not a material feed; no vendor contract' },
      heat: { stream: clone(node('heat').params.stream), quality: 'user-assumption', evidence: 'Regeneration heat 1.5 kWh/kg CO₂ at 100°C bought at screening $0.01/kWh (as cases/methanol.js); the simulator prices it as PV kWh' },
    },
    meteo: {
      dailyPVKWhPerKWp: DAILY_PV,
      quality: 'cited',
      source: 'PVGIS-ERA5',
      retrieved: '2026-09-14',
      cite: { label: 'PVGIS-ERA5, 2005–2023 at Mejillones (−23.100, −70.448); frozen data/pvgis-mejillones.json E_y 1923.52', url: PVGIS_URL },
      notes: 'Annual average of the frozen PVGIS-ERA5 series (E_y ÷ 365). Not a plant-measured irradiance series.',
    },
    rights: {
      gridImport: right('grid', 'unverified', 'Unverified grid access; zero authorized imports. Plant runs on its own PV.', [
        { label: 'Wikipedia: Mejillones (context, not an interconnection)', url: MEJILLONES_URL },
      ]),
      freshwater: right('freshwater', 'unverified', 'No water used: solid-sorbent DAC with heat-pump/steam regeneration modelled as bought heat'),
    },
    evidence: [
      { label: 'Solar: PVGIS-ERA5, 2005–2023; annual E_y 1923.52 kWh/kWp', url: PVGIS_URL },
      { label: 'Air: 422.45 ppm, 2024 global estimate; dry O₂/N₂ balance is simplified', url: AIR_URL },
      { label: 'DAC: solid-sorbent route; 0.5 kWh_e + 1.5 kWh_th per kg CO₂ and 0.02 kg/kg sorbent makeup are screening (IEA 2022)', url: IEA_DAC },
      { label: 'NASEM 2019 Negative Emissions Technologies — DAC heat-dominated (DOI)', url: NASEM_DAC },
      { label: 'IEA 2019 Putting CO₂ to Use — ~230 Mt/y CO₂ used (urea ~130 Mt, EOR ~70–80 Mt); merchant price screening $0.05/kg', url: IEA_CO2_USE },
    ],
    notes: 'Representative-day DAC plant at Mejillones selling 1 t/day food/industrial-grade CO₂ at the screening $0.05/kg the CO₂-buying recipes pay (co2-feed). Same solid-sorbent parameters as cases/methanol.js: 90% capture, 0.5 kWh/kg electricity, 1.5 kWh/kg regeneration heat at ≥80°C bought at $0.01/kWh, blower 0.001 kWh/Nm³, DAC pack $800/(kg CO₂/day). Sorbent makeup (0.02 kg/kg × $2/kg) is carried as DAC variable O&M ($0.04/kg on top of the pack $0.05/kg), not a material feed. CO₂ leaves at ambient pressure; compression/liquefaction for transport is not modelled (captive use on site). Annual economics repeat the selected typical day for 365 days.',
  };
  return definition;
}

module.exports = { createDacCo2Case };
