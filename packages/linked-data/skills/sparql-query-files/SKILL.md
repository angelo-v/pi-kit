---
name: sparql-query-files
description: Executes SPARQL 1.1 queries (SELECT, ASK, CONSTRUCT, DESCRIBE) against local RDF/Turtle files in the workspace using Comunica. Use this skill whenever the user wants to query, explore, search, or analyse a knowledge graph, ontology, or vocabulary with SPARQL — for example to list all concepts, traverse class hierarchies, find related terms, inspect properties, or run custom graph queries against .ttl, .rdf, or .n3 files.
---

# SPARQL Query Skill

## Workflow

1. **Check existing queries** — run `discover_sparql_queries`; reuse or adapt any match.
2. **Find files** — run `discover_rdf_files` if the user hasn't specified files.
3. **Explore structure** — query classes/properties before navigating by type (see step 3 pattern below).
4. **Query semantically** — traverse named individuals; use text `FILTER` only as a last resort.

```sparql
-- Step 3: discover classes
SELECT DISTINCT ?class WHERE { ?s a ?class } ORDER BY ?class
```

```sparql
-- ✅ Semantic traversal
?item a ex:SomeClass ; ex:relatedTo ex:SomeOtherEntity .

-- ❌ Avoid string matching in URIs
FILTER(CONTAINS(LCASE(STR(?s)), "keyword"))
```

> **⚠️ Never present inferences as graph facts.** Every statement must be backed by a queried triple. Mark anything else as *"interpretation — not modelled in the graph"*.

## Common patterns & prefixes

For ready-to-use query patterns and standard prefix declarations, read the reference file:
`skills/sparql-query-files/reference.md`
