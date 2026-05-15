# Domain Reference: Organisation

## P31 identifiers for this domain

| Q-number | Label |
|----------|-------|
| Q4830453 | business |
| Q783794 | company |
| Q891723 | public company |
| Q163740 | nonprofit organization |
| Q327333 | government agency |
| Q2659904 | government organization |
| Q31855 | intergovernmental organization |
| Q3551775 | international organization |
| Q7210356 | political organization |
| Q7366 | record label |
| Q2085381 | publisher |
| Q3918 | university |
| Q9842 | primary school |

## Recommended property set (use in Step 1c VALUES clause)

```sparql
VALUES ?prop {
  wdt:P31     # instance of
  wdt:P17     # country
  wdt:P159    # headquarters location
  wdt:P571    # inception (founded)
  wdt:P576    # dissolved / abolished
  wdt:P112    # founded by
  wdt:P169    # chief executive officer
  wdt:P749    # parent organisation
  wdt:P355    # subsidiary
  wdt:P452    # industry
  wdt:P1128   # employees
  wdt:P856    # official website
  wdt:P18     # image
  wdt:P154    # logo image
  wdt:P1566   # GeoNames ID
}
```

## Domain-specific tips

### Headquarters (P159) vs country (P17)
`wdt:P159` returns the city/settlement of the headquarters, not a country.
Use `wdt:P17` for country. To get the country of the HQ city, do a two-hop:

```sparql
SELECT ?hqLabel ?countryLabel WHERE {
  wd:Q312 wdt:P159 ?hq .          # Q312 = Apple Inc.
  ?hq    wdt:P17   ?country .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
```

### CEO / leadership (P169) — use full statement model for tenure
`wdt:P169` gives only the current preferred CEO. Historical CEOs need
qualifiers:

```sparql
SELECT ?ceoLabel ?start ?end WHERE {
  wd:Q312 p:P169 ?stmt .
  ?stmt ps:P169 ?ceo .
  OPTIONAL { ?stmt pq:P580 ?start }
  OPTIONAL { ?stmt pq:P582 ?end }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
ORDER BY DESC(?start)
```

### Employee count (P1128) — use PreferredRank
Historical figures are stored as separate statements. Use `PreferredRank` for
the latest value, or join `pq:P585` (point in time) to get a time series.

### Subsidiaries (P355) vs parent (P749)
`P355` (subsidiary) is often incomplete — many subsidiaries do not declare
their parent. Prefer querying from the subsidiary side with `wdt:P749`.

## Common pitfalls

| Pitfall | Correct approach |
|---------|-----------------|
| Using `wdt:P169` expecting all CEOs | Only preferred (current) value is returned; use `p:/ps:` for history |
| `wdt:P355` for a complete subsidiary tree | Data is sparse; cross-check with `wdt:P749` from the subsidiary |
| Mixing Q4830453 (business) and Q783794 (company) in type filters | Use `VALUES ?type { wd:Q4830453 wd:Q783794 }` to cover both |
| Dissolution date absent for active organisations | Always `OPTIONAL { ?org wdt:P576 ?dissolved }` |
