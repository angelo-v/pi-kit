---
name: rdf-memory
description: Persist and query RDF knowledge graphs across pi sessions using an Oxigraph-backed store. Use when the user wants to store facts that survive session restarts, build up a knowledge base incrementally, or run SPARQL queries against persistent RDF data. Always use rdf_memory_record as the primary tool for writing facts — it stamps the datetime automatically and enforces the quad/RDF-star data model.
---

# RDF Memory

Persistent RDF storage backed by Oxigraph. Data survives across sessions in `~/.pi/agent/rdf-memory/<store-name>/`.

## Key rules

- **Never supply a datetime** — `rdf_memory_record` stamps it automatically.
- **Always supply `source`** — verbatim quote, document title, URL, or description of origin.
- **All data lives in named graphs** — never write bare triples; the default graph is always empty.
- **Every query must include `GRAPH`** — a query without it always returns no results.
- **Always scope queries** — by `dct:subject` topic, `rdf:type`, or a known subject IRI. Never dump all facts.
- **Add `LIMIT`** when result size is unpredictable (`LIMIT 20` for exploration, `LIMIT 100` for results).
- Store names become directory names — use lowercase alphanumeric with hyphens (e.g. `project-memory`).

## Recording facts

```
rdf_memory_record(
  store  = "project-memory",
  source = "User said: Alice is 30 and knows Bob",
  topic  = "people",
  facts  = """
    ex:alice schema:name "Alice" ; schema:age 30 ; schema:knows ex:bob .
    << ex:alice schema:age 30 >> mem:confidence "high" ; mem:source "User stated directly" .
  """
)
```

Standard prefixes (`mem:`, `schema:`, `prov:`, `xsd:`, `dct:`, `rdf:`, `rdfs:`, `owl:`, `foaf:`, `skos:`, `vcard:`) need no declaration. Add `PREFIX` lines for any other namespace.

## Recalling memory — workflow

### 1 — List stores
```
rdf_memory_stores()
```
Never assume store names — always discover first.

### 2 — Get schema overview (mandatory before querying)
Before writing any SPARQL query, call `rdf_schema_overview` to see which types and predicates are actually present:
```
rdf_schema_overview(store="<store-name>")
```
This prevents guessing wrong class or property IRIs.

### 3 — Query the chunk index
```sparql
PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?chunk ?when ?topic ?source WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
    ?chunk a mem:MemoryChunk ; mem:recordedAt ?when ; mem:source ?source .
    OPTIONAL { ?chunk dct:subject ?topic }
  }
} ORDER BY DESC(?when)
```

### 4 — Query facts (scoped)
```sparql
-- Preferred: scoped by topic
PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?s ?p ?o WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
    ?chunk a mem:MemoryChunk ; dct:subject "people" .
  }
  GRAPH ?chunk { ?s ?p ?o . FILTER(!isBLANK(?s)) }
}
```

### 5 — Present results faithfully
Only state what the data shows. Mark anything else as *"interpretation — not stored in memory"*.

**If results are empty:** check that your query uses `GRAPH`, verify the store name with `rdf_memory_stores`, and run Step 3 to confirm actual types stored.

## Reference

For full query patterns, deletion recipes, data model details, and troubleshooting, read:
`skills/rdf-memory/reference.md`
