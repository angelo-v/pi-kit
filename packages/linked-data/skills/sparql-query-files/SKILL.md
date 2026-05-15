---
name: sparql-query-files
description: Executes SPARQL 1.1 queries (SELECT, ASK, CONSTRUCT, DESCRIBE) against local RDF/Turtle files in the workspace using Comunica. Use this skill whenever the user wants to query, explore, search, or analyse a knowledge graph, ontology, or vocabulary with SPARQL — for example to list all concepts, traverse class hierarchies, find related terms, inspect properties, or run custom graph queries against .ttl, .rdf, or .n3 files.
---

# SPARQL Query Skill

## ⚠️ Mandatory workflow — never skip or reorder steps

**Follow every step below for every query — even when the file paths or graph structure seem obvious.**

### Step 1 — Check existing queries
Run `discover_sparql_queries`. Reuse or adapt any matching SPARQL file instead of writing from scratch.

### Step 2 — Discover RDF files (unless the user specified them)
Run `discover_rdf_files` to find all available `.ttl`, `.rdf`, `.n3`, `.jsonld`, `.nt`, `.nq`, `.trig` files.
Do **not** guess file paths — always discover first.

### Step 3 — Explore graph structure
Before writing a domain-specific query, run a discovery query to understand what classes and properties exist:

```sparql
-- Discover all classes in the graph
SELECT DISTINCT ?class WHERE { ?s a ?class } ORDER BY ?class

-- Count instances by class
SELECT ?class (COUNT(?s) AS ?count) WHERE {
  ?s a ?class
} GROUP BY ?class ORDER BY DESC(?count)

-- Discover all properties
SELECT DISTINCT ?prop WHERE { ?s ?prop ?o } ORDER BY ?prop
```

### Step 4 — Query semantically
Traverse named individuals; use text `FILTER` only as a last resort.

```sparql
-- ✅ Semantic traversal (preferred)
?item a ex:SomeClass ; ex:relatedTo ex:SomeOtherEntity .

-- ❌ Avoid string matching in URIs (last resort only)
FILTER(CONTAINS(LCASE(STR(?s)), "keyword"))
```

> **⚠️ Never present inferences as graph facts.** Every statement must be backed by a queried triple. Mark anything else as *"interpretation — not modelled in the graph"*.

## Common patterns & prefixes

For ready-to-use query patterns and standard prefix declarations, read the reference file:
`skills/sparql-query-files/reference.md`
