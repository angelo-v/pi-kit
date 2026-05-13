---
name: sparql-query-endpoint
description: Executes SPARQL 1.1 queries (SELECT, ASK, CONSTRUCT, DESCRIBE) against a remote SPARQL endpoint using Comunica. Use this skill whenever the user wants to query a live knowledge graph or triple-store over HTTP — for example DBpedia, a corporate SPARQL service, or any endpoint that speaks the SPARQL protocol.
---

# Remote SPARQL Endpoint Skill

## Workflow

1. **Identify the endpoint URL** — confirm the SPARQL endpoint URL with the user if not obvious (e.g. `https://dbpedia.org/sparql`).
2. **Check existing queries** — run `discover_sparql_queries`; reuse or adapt any match.
3. **Explore structure** — if the endpoint supports it, probe available classes/properties before writing deeper queries.
4. **Write the query** — always include all required PREFIX declarations in the query string.
5. **Use `sparql_query_endpoint`** — pass the endpoint URL and query; let the tool handle the rest.

```sparql
-- Discover classes at an endpoint
SELECT DISTINCT ?class WHERE { ?s a ?class } ORDER BY ?class LIMIT 50
```

## Output formats

| Format  | When to use                          |
|---------|--------------------------------------|
| `table` | Default — human-readable result set  |
| `json`  | Machine-readable SPARQL JSON results |
| `csv`   | Spreadsheet export                   |
| `turtle`| CONSTRUCT / DESCRIBE graph output    |

## Common patterns & prefixes

```sparql
PREFIX rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:    <http://www.w3.org/2002/07/owl#>
PREFIX xsd:    <http://www.w3.org/2001/XMLSchema#>
PREFIX skos:   <http://www.w3.org/2004/02/skos/core#>
PREFIX dct:    <http://purl.org/dc/terms/>
PREFIX schema: <https://schema.org/>
PREFIX foaf:   <http://xmlns.com/foaf/0.1/>
```

### All triples (exploration)
```sparql
SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 20
```

### All classes used
```sparql
SELECT DISTINCT ?class WHERE { ?s a ?class } ORDER BY ?class
```

### All properties of a specific resource
```sparql
SELECT ?p ?o WHERE { <https://example.org/SomeResource> ?p ?o }
```

### Label search (substring fallback)
```sparql
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?s ?label WHERE {
  ?s ?labelProp ?label .
  FILTER(?labelProp IN (rdfs:label, skos:prefLabel, skos:altLabel))
  FILTER(CONTAINS(LCASE(STR(?label)), "keyword"))
}
```

> **⚠️ Never present inferences as endpoint facts.** Every statement must be backed by a queried triple. Mark anything else as *"interpretation — not in the graph"*.
