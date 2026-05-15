# Domain Reference: Creative Work

## P31 identifiers for this domain

| Q-number | Label |
|----------|-------|
| Q11424 | film |
| Q24856 | film series |
| Q5398426 | television series |
| Q21191270 | television series episode |
| Q571 | book |
| Q7725310 | literary work |
| Q482994 | album |
| Q134556 | single (music) |
| Q105543609 | musical work |
| Q1004 | comics |
| Q7889 | video game |
| Q732577 | publication |
| Q3305213 | painting |
| Q179700 | statue |
| Q93208 | podcast |

## Recommended property set (use in Step 1c VALUES clause)

```sparql
VALUES ?prop {
  wdt:P31     # instance of
  wdt:P577    # publication date
  wdt:P57     # director (film)
  wdt:P58     # screenwriter
  wdt:P161    # cast member
  wdt:P175    # performer (music)
  wdt:P86     # composer
  wdt:P50     # author (book)
  wdt:P123    # publisher
  wdt:P136    # genre
  wdt:P364    # original language of work
  wdt:P495    # country of origin
  wdt:P2047   # duration
  wdt:P856    # official website
  wdt:P18     # image
  wdt:P1476   # title
  wdt:P407    # language of work
}
```

## Domain-specific tips

### Publication / release date (P577)
Returns an `xsd:dateTime`. Multiple statements may exist for different regions
(e.g. US release vs. worldwide). Use `wikibase:PreferredRank` or filter by a
qualifier location (`pq:P291`) if you need a specific regional release date.
Use `YEAR(?date)` to get just the year:

```sparql
SELECT ?titleLabel (YEAR(?released) AS ?year) WHERE {
  wd:Q471043 wdt:P577 ?released .   # Q471043 = some film
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 5
```

### Cast members (P161) — can be very large
Blockbuster films may have 50+ cast members. Add `LIMIT` or filter by role
qualifier (`pq:P453`) to avoid large result sets.

### Genre (P136)
Multi-valued. Use `GROUP_CONCAT` to collapse into one row per work:

```sparql
SELECT ?workLabel (GROUP_CONCAT(?genreLabel; SEPARATOR=", ") AS ?genres) WHERE {
  wd:Q471043 wdt:P136 ?genre .
  ?genre rdfs:label ?genreLabel .
  FILTER(LANG(?genreLabel) = "en")
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
GROUP BY ?workLabel
```

### Duration (P2047)
Returned as an `xsd:decimal` in minutes. Cast to integer with `xsd:integer()`
if needed for display.

### Book vs literary work
Books (Q571) are physical editions; literary works (Q7725310) are the abstract
text. Use `wdt:P629` (edition of) to link an edition to its parent work.

## Common pitfalls

| Pitfall | Correct approach |
|---------|-----------------|
| `wdt:P577` returns multiple regional dates | Use `wikibase:PreferredRank` or filter with `pq:P291` (place of publication) |
| Expecting P57 (director) on books | Books use P50 (author); check P31 type before choosing properties |
| Large cast via P161 without LIMIT | Always add `LIMIT` when fetching cast members |
| P136 (genre) returning Q-numbers only | Join `rdfs:label` or use `wikibase:label` service |
| Mixing film (Q11424) and film series (Q24856) in type filters | Use `VALUES ?type { wd:Q11424 wd:Q24856 }` to cover both |
