---
name: sparql-query-files
description: Executes SPARQL 1.1 queries (SELECT, ASK, CONSTRUCT, DESCRIBE) against local RDF/Turtle files in the workspace using Comunica. Use this skill whenever the user wants to query, explore, search, or analyse a knowledge graph, ontology, or vocabulary with SPARQL — for example to list all concepts, traverse class hierarchies, find related terms, inspect properties, or run custom graph queries against .ttl, .rdf, or .n3 files.
---

# SPARQL Query Skill

Use the `discover_rdf_files` tool to find RDF files, then `sparql_query_files` to query them.

## Query Strategy: Semantic First, Text as Fallback

### 🥇 Step 0: Check for Existing Query Files

Before writing a new query, call `discover_sparql_queries` to check for existing `.rq` / `.sparql` files.

- Matches directly → run it via `sparql_query_files`
- Partial match → adapt it, save as a new `.rq` file (do not overwrite the original)
- No match → continue with Step 1

### 🥈 Step 1: Discover the Graph Structure

Query for classes and properties before navigating by type:

```sparql
SELECT DISTINCT ?class ?label WHERE {
  { ?class a owl:Class } UNION { ?x a ?class . FILTER(isIRI(?class)) }
  OPTIONAL { ?class rdfs:label ?label }
} ORDER BY ?class
```

Then navigate directly via type and object reference — not string matching:

```sparql
# ✅ Good: direct object reference
?item a ex:SomeClass ;
      ex:relatedTo ex:SomeOtherEntity .

# ❌ Avoid: string search in URIs
FILTER(CONTAINS(LCASE(STR(?s)), "keyword"))
```

### 🥉 Fallback: Text-Based Search

Only when the entity has no named individual in the graph or the structure is unknown:

```sparql
SELECT ?s ?p ?o WHERE {
  ?s ?p ?o .
  FILTER(CONTAINS(LCASE(STR(?o)), "keyword"))
} LIMIT 20
```

---

## Common SPARQL Patterns

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

### Label search (substring)

```sparql
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?s ?label WHERE {
  ?s ?labelProp ?label .
  FILTER(?labelProp IN (rdfs:label, skos:prefLabel, skos:altLabel))
  FILTER(CONTAINS(LCASE(STR(?label)), "keyword"))
}
```

---

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

---

> **⚠️ Never present inferences as graph facts.**
> Every statement must be backed by a concrete queried triple.
> Connections that only follow from text definitions or LLM world knowledge must be
> explicitly marked as *"interpretation — not modelled in the graph"*.
> Never mix SPARQL results and LLM conclusions without making this transparent.
