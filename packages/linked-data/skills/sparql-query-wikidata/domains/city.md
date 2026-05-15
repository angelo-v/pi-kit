# Domain Reference: City / Human Settlement

## P31 identifiers for this domain

| Q-number | Label |
|----------|-------|
| Q515 | city |
| Q1549591 | big city |
| Q486972 | human settlement |
| Q1637706 | million city |
| Q3957 | town |
| Q532 | village |

## Recommended property set (use in Step 1c VALUES clause)

```sparql
VALUES ?prop {
  wdt:P31     # instance of
  wdt:P17     # country
  wdt:P131    # located in administrative territorial entity (direct parent only)
  wdt:P30     # continent
  wdt:P36     # capital of
  wdt:P1082   # population
  wdt:P571    # inception / founded
  wdt:P576    # dissolved / abolished
  wdt:P18     # image
  wdt:P625    # coordinate location
  wdt:P856    # official website
  wdt:P41     # flag image
  wdt:P94     # coat of arms image
  wdt:P421    # located in time zone
  wdt:P281    # postal code
  wdt:P395    # licence plate code
  wdt:P214    # VIAF identifier
}
```

## Domain-specific tips

### Population (P1082) — always use PreferredRank
Wikidata stores historical population figures as separate statements.
`wdt:P1082` returns the preferred (most current) value automatically.
To also fetch the census year:

```sparql
SELECT ?pop ?year WHERE {
  wd:Q64 p:P1082 ?stmt .
  ?stmt ps:P1082 ?pop ;
        wikibase:rank wikibase:PreferredRank .
  OPTIONAL { ?stmt pq:P585 ?year }   # pq:P585 = point in time
}
```

### Administrative location (P131) — direct parent only
`wdt:P131` stores the **immediate** administrative parent (often a district or
borough), not necessarily the federal state or country. Do **not** use `P131*`
path traversal — it causes timeouts. Use `wdt:P17` for country.

### Coordinates (P625)
Returns a `geo:wktLiteral`. To extract latitude/longitude:

```sparql
SELECT ?lat ?long WHERE {
  wd:Q64 wdt:P625 ?coord .
  BIND(geof:latitude(?coord)  AS ?lat)
  BIND(geof:longitude(?coord) AS ?long)
}
```

### Multiple time zones
`wdt:P421` may return several values (e.g. summer/winter time). Filter by
`wikibase:PreferredRank` if you need only the standard time zone.

## Common pitfalls

| Pitfall | Correct approach |
|---------|-----------------|
| `wdt:P131*` traversal to reach a country | Use `wdt:P17` for country directly |
| Fetching all population rows gives 10+ historical records | Use `wikibase:PreferredRank` (see above) |
| `rdfs:label` returns one row per language | Use `wikibase:label` service with `"en"` |
| `wdt:P1549` (demonym) returns untagged literals | Omit or `STR()`-cast and post-filter in the application layer |
