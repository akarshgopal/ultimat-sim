# Material purchased-power break-even ($/kWh)

Screening TEA, not a PPA or quote. Fast grid (`--fast`: scales `[1]`, rates `[0]`) on the abundance hunt cache `.hunt-run/site-search-top20.json` (`abundance-site-search.mjs --fast --top 50`, 10 cash+ sites). Metric is `annualNetCash = R − OPEX − annualized CAPEX`. Purchased power sets electricity `unitCost = p` and strips PV CAPEX/fixed O&M. Hero is the cash+ site with the most tonnes of that material.

`--mode solo` (default) zeros every other sale price. `--mode shared` keeps the full co-product slate, so the same plant bill is paid from all TEA revenue.

| Material | Hero | Solo $/kWh | Shared $/kWh | Delta |
|---|---|---:|---:|---:|
| lithium | Mejillones, Antofagasta, Chile | 2.320 | 2.594 | +0.274 |
| potash | Lake Zabuye, Tibet, China | 0.016 | 1.364 | +1.348 |
| gypsum | Salar de Uyuni, Potosí, Bolivia | no-flip | 1.201 | solo cash− at $0 |
| salt | Salar del Hombre Muerto, Argentina | no-flip | 0.491 | solo cash− at $0 |
| bromine | Dead Sea industrial shore | no-flip | 0.140 | solo cash− at $0 |
| magnesium | Dead Sea industrial shore | no-flip | 0.140 | solo cash− at $0 |
| caustic | Dead Sea industrial shore | no-flip | 0.140 | solo cash− at $0 |
| ammonia | Dead Sea industrial shore | no-flip | 0.140 | solo cash− at $0 |
| oxygen | Dead Sea industrial shore | no-flip | 0.140 | solo cash− at $0 |

Solo no-flip means `status: no-flip-always-negative`: annual net cash is still ≤ 0 at $0/kWh once other sale prices are zeroed. Shared flips those rows because co-product revenue covers process CAPEX/OPEX.

Cash at free purchased power (p = 0), solo revenue → shared revenue:

- Lithium stays cash+ either way ($4.80M → $5.30M revenue). Co-products add a little headroom, so the break-even only moves from $2.32/kWh to $2.59/kWh.
- Potash solo barely clears ($0.58M revenue, cash +$29k, break-even $0.016/kWh). Shared Zabuye revenue is $3.04M and the break-even rises to $1.36/kWh.
- Gypsum solo revenue is about $4.1k (cash −$558k). Shared Uyuni revenue is $2.75M (cash +$2.19M), break-even $1.20/kWh.
- Salt solo revenue $0.21M (cash −$352k) vs shared $1.46M (cash +$897k), break-even $0.49/kWh.
- Bromine, magnesium, caustic, ammonia, and oxygen share the Dead Sea hero. Solo cash at p = 0 is negative for each (−$193k bromine through −$620k oxygen). Shared scores that one slate once (revenue $0.90M, cash +$284k), so all five report the same $0.140/kWh. That is the slate break-even, not five independent product prices.

Reports: `.hunt-run/material-power-breakeven.json` (`mode: solo`) and `.hunt-run/material-power-breakeven-shared.json` (`mode: shared`). Each file's `tipNote` and `method.mode` name the sale attribution.
