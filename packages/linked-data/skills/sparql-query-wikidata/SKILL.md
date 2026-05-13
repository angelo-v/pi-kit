---
name: sparql-query-wikidata
description: Use this skill whenever the user asks about real-world facts that could appear in Wikipedia or an encyclopedia — people, places, events, organisations, species, works of art, historical dates, geographic data, scientific concepts, and so on. Prefer live Wikidata data over relying on the model's training knowledge.
---

# Wikidata SPARQL Skill

## Workflow

1. **Check existing queries** — run `discover_sparql_queries`; reuse or adapt any match.
2. **Write the query** — use `sparql_query_wikidata`. Standard prefixes are injected automatically; you do not need to declare `wd:`, `wdt:`, `wikibase:`, etc.
3. **Explore before navigating** — if you don't know the entity/property IDs, search by label first, then use those IDs in the real query.
4. **Present results faithfully** — only state what the data shows; mark anything else as interpretation.

## Key Wikidata concepts

| Concept | Description | Example |
|---------|-------------|---------|
| Entity (Q-item) | A Wikidata subject | `wd:Q64` = Berlin |
| Direct property (P-item) | Simple S→O statement | `wdt:P31` = instance of |
| Full statement (p:/ps:/pq:) | Statement with qualifiers | `p:P131/ps:P131` |
| Labels | Human-readable names | `rdfs:label` or `wikibase:label` service |

## Auto-injected prefixes

These are always available — **no PREFIX declaration needed**:

```
wd:       http://www.wikidata.org/entity/
wdt:      http://www.wikidata.org/prop/direct/
wikibase: http://wikiba.se/ontology#
p:        http://www.wikidata.org/prop/
ps:       http://www.wikidata.org/prop/statement/
pq:       http://www.wikidata.org/prop/qualifier/
rdfs:     http://www.w3.org/2000/01/rdf-schema#
schema:   https://schema.org/
skos:     http://www.w3.org/2004/02/skos/core#
owl:      http://www.w3.org/2002/07/owl#
xsd:      http://www.w3.org/2001/XMLSchema#
bd:       http://www.bigdata.com/rdf#
```

## Common patterns

### Look up a known entity by label
```sparql
SELECT ?item ?label WHERE {
  ?item rdfs:label "Berlin"@en .
  BIND("Berlin"@en AS ?label)
}
LIMIT 5
```

### Search entities by label substring
```sparql
SELECT ?item ?label WHERE {
  ?item rdfs:label ?label .
  FILTER(LANG(?label) = "en")
  FILTER(CONTAINS(LCASE(STR(?label)), "berlin"))
}
LIMIT 10
```

### All instances of a class (e.g. cities)
```sparql
SELECT ?city ?label WHERE {
  ?city wdt:P31 wd:Q515 ;       # instance of: city
        rdfs:label ?label .
  FILTER(LANG(?label) = "en")
}
LIMIT 20
```

### Properties of a specific entity (exploration)
```sparql
SELECT ?prop ?propLabel ?value ?valueLabel WHERE {
  wd:Q64 ?prop ?value .           # Q64 = Berlin
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en" .
    ?prop  rdfs:label ?propLabel .
    ?value rdfs:label ?valueLabel .
  }
}
LIMIT 30
```

### Efficient label fetching with wikibase:label service
```sparql
SELECT ?item ?itemLabel WHERE {
  ?item wdt:P31 wd:Q515 .         # instance of: city
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 20
```

### Count instances of a class
```sparql
SELECT (COUNT(?item) AS ?count) WHERE {
  ?item wdt:P31 wd:Q515 .
}
```

### Multi-hop traversal (city → country → continent)
```sparql
SELECT ?city ?cityLabel ?country ?countryLabel ?continent ?continentLabel WHERE {
  ?city    wdt:P31  wd:Q515 ;
           wdt:P17  ?country .
  ?country wdt:P30  ?continent .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 20
```

### Statements with qualifiers (full statement model)
```sparql
SELECT ?item ?start ?end WHERE {
  ?item p:P39 ?stmt .             # P39 = position held
  ?stmt ps:P39 wd:Q11696 ;       # head of state
        pq:P580 ?start .
  OPTIONAL { ?stmt pq:P582 ?end }
}
LIMIT 10
```

> **⚠️ Never present inferences as Wikidata facts.** Every statement must be backed by a queried triple. Mark anything else as *"interpretation — not modelled in Wikidata"*.

## Tips

- Prefer `wdt:P<n>` (direct property) for simple facts; use `p:/ps:/pq:` only when you need qualifiers or ranks.
- Always `FILTER(LANG(?label) = "en")` when using `rdfs:label` directly to avoid multi-language result explosion.
- The `wikibase:label` service is faster and cleaner for label retrieval than joining on `rdfs:label`.
- Wikidata is huge — always use `LIMIT` (automatically enforced by the tool if omitted).
- If a query times out (Wikidata has a 60-second limit), narrow it with more specific `wdt:P31` values or add `LIMIT`.
