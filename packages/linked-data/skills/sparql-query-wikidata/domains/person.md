# Domain Reference: Person / Human

## P31 identifiers for this domain

| Q-number | Label |
|----------|-------|
| Q5 | human |

## Recommended property set (use in Step 1c VALUES clause)

```sparql
VALUES ?prop {
  wdt:P31     # instance of
  wdt:P21     # sex or gender
  wdt:P27     # country of citizenship
  wdt:P569    # date of birth
  wdt:P570    # date of death
  wdt:P19     # place of birth
  wdt:P20     # place of death
  wdt:P106    # occupation
  wdt:P39     # position held
  wdt:P108    # employer
  wdt:P69     # educated at
  wdt:P40     # child
  wdt:P22     # father
  wdt:P25     # mother
  wdt:P26     # spouse
  wdt:P18     # image
  wdt:P856    # official website
  wdt:P735    # given name
  wdt:P734    # family name
  wdt:P496    # ORCID iD
}
```

## Domain-specific tips

### Dates (P569 / P570) — xsd:dateTime literals
Birth and death dates are `xsd:dateTime` or `xsd:date` literals, not strings.
Use `YEAR(?dob)` to extract just the year:

```sparql
SELECT ?personLabel (YEAR(?dob) AS ?birthYear) WHERE {
  wd:Q937 wdt:P569 ?dob .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
```

### Position held (P39) — use full statement model for tenure dates
`wdt:P39` gives only the position. To get start/end dates use `p:/ps:/pq:`:

```sparql
SELECT ?positionLabel ?start ?end WHERE {
  wd:Q9682 p:P39 ?stmt .
  ?stmt ps:P39 ?position .
  OPTIONAL { ?stmt pq:P580 ?start }   # start time
  OPTIONAL { ?stmt pq:P582 ?end }     # end time
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
ORDER BY ?start
```

### Multiple occupations (P106)
Many people have several occupations. Use `GROUP_CONCAT` to collapse them if
you are displaying one row per person:

```sparql
SELECT ?personLabel (GROUP_CONCAT(?occLabel; SEPARATOR=", ") AS ?occupations) WHERE {
  VALUES ?person { wd:Q937 }
  ?person wdt:P106 ?occ .
  ?occ rdfs:label ?occLabel .
  FILTER(LANG(?occLabel) = "en")
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
GROUP BY ?personLabel
```

### Living persons — P570 is absent
Do not assume P570 (date of death) exists. Always wrap it in `OPTIONAL`.

## Common pitfalls

| Pitfall | Correct approach |
|---------|-----------------|
| Comparing date literals as strings | Use `YEAR()`, `MONTH()`, `DAY()` functions |
| `wdt:P39` returns current + historical roles | Filter by `wikibase:PreferredRank` or use qualifiers for dates |
| Omitting `OPTIONAL` for P570 | Living persons have no death date — query breaks without `OPTIONAL` |
| Expecting a single spouse (P26) | People can have multiple sequential spouses — always treat as multi-valued |
