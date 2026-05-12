# SPARQL Reference

## Standard Prefixes

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

## Common Patterns

### All triples (exploration)
```sparql
SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 20
```

### All classes used in the graph
```sparql
SELECT DISTINCT ?class WHERE { ?s a ?class } ORDER BY ?class
```

### All SKOS concepts with labels
```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?label WHERE {
  ?concept a skos:Concept ; skos:prefLabel ?label .
} ORDER BY ?label
```

### Broader / narrower hierarchy
```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?label ?broader ?broaderLabel WHERE {
  ?concept a skos:Concept ; skos:prefLabel ?label .
  OPTIONAL { ?concept skos:broader ?broader . ?broader skos:prefLabel ?broaderLabel }
} ORDER BY ?broader ?label
```

### Top concepts (no broader term)
```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?label WHERE {
  ?concept a skos:Concept ; skos:prefLabel ?label .
  FILTER NOT EXISTS { ?concept skos:broader ?any }
} ORDER BY ?label
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
