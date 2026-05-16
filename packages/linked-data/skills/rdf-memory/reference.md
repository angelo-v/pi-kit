# RDF Memory — Reference

## Data model

Every memory chunk is a named graph. Two fixed graphs exist in every store:

| Graph IRI | Purpose |
|---|---|
| `<urn:pi-kit:linked-data:rdf-memory:meta>` | Index of all chunks — one entry per recorded batch |
| `<urn:pi-kit:linked-data:rdf-memory:chunk-{id}>` | One named graph per chunk, containing the actual facts |

### Chunk metadata (written automatically)

```turtle
<urn:pi-kit:linked-data:rdf-memory:chunk-{id}> a mem:MemoryChunk ;
  mem:recordedAt  "2026-05-16T10:30:00Z"^^xsd:dateTime ;
  mem:source      "..." ;
  dct:subject     "..." .
```

### RDF-star per-fact annotations

```turtle
ex:alice schema:age 30 .
<< ex:alice schema:age 30 >>
  mem:confidence "high" ;        # high | medium | low | inferred
  mem:source     "User stated" .
```

## Tools

| Tool | Purpose |
|---|---|
| `rdf_memory_record` | Write a memory chunk; datetime stamped automatically |
| `rdf_memory_stores` | List stores and quad counts |
| `rdf_memory_query` | SPARQL SELECT / ASK / CONSTRUCT / DESCRIBE |
| `rdf_memory_update` | SPARQL Update — deletions and modifications |
| `rdf_memory_drop` | Clear a store or a named graph |

## Query patterns

### Chunk index
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

### Facts scoped by topic (preferred)
```sparql
PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?s ?p ?o ?when WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
    ?chunk a mem:MemoryChunk ; mem:recordedAt ?when ; dct:subject "people" .
  }
  GRAPH ?chunk { ?s ?p ?o . FILTER(!isBLANK(?s)) }
} ORDER BY DESC(?when)
```

### Facts scoped by type
```sparql
PREFIX mem:    <urn:pi-kit:linked-data:rdf-memory:>
PREFIX schema: <https://schema.org/>
SELECT ?s ?p ?o WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> { ?chunk a mem:MemoryChunk . }
  GRAPH ?chunk { ?s a schema:Person ; ?p ?o . FILTER(!isBLANK(?s)) }
}
```

### Facts with RDF-star provenance
```sparql
PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?s ?p ?o ?conf ?factSrc ?chunkSrc ?when WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
    ?chunk a mem:MemoryChunk ; mem:recordedAt ?when ; mem:source ?chunkSrc ;
           dct:subject "people" .
  }
  GRAPH ?chunk {
    ?s ?p ?o .
    OPTIONAL { << ?s ?p ?o >> mem:confidence ?conf ; mem:source ?factSrc . }
    FILTER(!isBLANK(?s))
  }
} ORDER BY DESC(?when)
```

### Discover properties in use
```sparql
PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
SELECT DISTINCT ?p (COUNT(?s) AS ?uses) WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> { ?chunk a mem:MemoryChunk . }
  GRAPH ?chunk { ?s ?p ?o . FILTER(!isBLANK(?s)) }
} GROUP BY ?p ORDER BY DESC(?uses)
```

## Modification recipes

### Delete a specific fact
```sparql
PREFIX schema: <https://schema.org/>
PREFIX ex:     <http://example.org/>
DELETE { GRAPH ?g { ex:alice schema:age ?v . } }
WHERE  { GRAPH ?g { ex:alice schema:age ?v . } }
```

### Clear a chunk and its meta entry
```
rdf_memory_drop(store="project-memory", graph="urn:pi-kit:linked-data:rdf-memory:chunk-{id}")
```
```sparql
PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
DELETE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
    <urn:pi-kit:linked-data:rdf-memory:chunk-{id}> ?p ?o .
  }
}
WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
    <urn:pi-kit:linked-data:rdf-memory:chunk-{id}> ?p ?o .
  }
}
```

## Persistence model

- Flushed to `~/.pi/agent/rdf-memory/<store>/data.nq` after every write (atomic: `.tmp` → rename).
- Store stays warm in memory within a session — no reload cost between queries.
- RDF-star annotations survive the N-Quads round-trip.
- On session shutdown all stores are flushed and closed cleanly.

## Anti-patterns

```sparql
-- ❌ No GRAPH clause — always returns empty
SELECT ?s ?p ?o WHERE { ?s ?p ?o }

-- ❌ Unscoped full dump — floods context
SELECT ?s ?p ?o WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> { ?chunk a mem:MemoryChunk . }
  GRAPH ?chunk { ?s ?p ?o . }
}

-- ❌ String matching without scope — last resort only; always add LIMIT
SELECT ?g ?s ?p ?o WHERE {
  GRAPH ?g { ?s ?p ?o . FILTER(CONTAINS(LCASE(STR(?o)), "alice")) }
} LIMIT 20
```
