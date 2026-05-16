---
name: rdf-memory
description: Persist and query RDF knowledge graphs across pi sessions using an Oxigraph-backed store. Use when the user wants to store facts that survive session restarts, build up a knowledge base incrementally, or run SPARQL queries against persistent RDF data. Always use rdf_memory_record as the primary tool for writing facts — it stamps the datetime automatically and enforces the quad/RDF-star data model.
---

# RDF Memory

Provides persistent RDF storage backed by [Oxigraph](https://github.com/oxigraph/oxigraph). Data is stored under `~/.pi/agent/rdf-memory/<store-name>/` and survives across pi sessions.

## Data model

Every piece of remembered knowledge is stored as **quads** (named graphs). The recording datetime is **always stamped by the tool** — never supply it as a parameter. Per-fact provenance is recorded using **RDF-star annotations**.

### Two fixed graphs

| Graph IRI | Purpose |
|---|---|
| `<urn:pi-kit:linked-data:rdf-memory:meta>` | Index of all memory chunks — one entry per recorded batch |
| `<urn:pi-kit:linked-data:rdf-memory:chunk-{id}>` | One named graph per chunk, containing the actual facts |

### Chunk metadata (written automatically by `rdf_memory_record`)

```turtle
<urn:pi-kit:linked-data:rdf-memory:chunk-{id}> a mem:MemoryChunk ;
  mem:recordedAt  "2026-05-16T10:30:00Z"^^xsd:dateTime ;  # ← tool sets this
  mem:source      "{what you supply as source}" ;
  dct:subject     "{what you supply as topic}" .
```

### Facts + RDF-star annotations

```turtle
ex:alice schema:name "Alice" ;
         schema:age  30 .

# Annotate facts that carry uncertainty or a distinct source
<< ex:alice schema:age 30 >>
  mem:confidence "high" ;
  mem:source     "User stated directly" .
```

`mem:confidence` values: `"high"` | `"medium"` | `"low"` | `"inferred"`

## Available tools

| Tool | Purpose |
|---|---|
| `rdf_memory_record` | **Primary**: write a memory chunk; datetime is stamped by the tool |
| `rdf_memory_stores` | List stores and quad counts |
| `rdf_memory_query` | SPARQL SELECT / ASK / CONSTRUCT / DESCRIBE |
| `rdf_memory_update` | SPARQL Update — for deletions and modifications |
| `rdf_memory_drop` | Clear a store or a named graph |

## Recalling memory — mandatory workflow

⚠️ **Follow every step below when recalling memory — never skip or reorder steps.**

### Step 1 — List available stores
Run `rdf_memory_stores` to discover which stores exist and their quad counts.
Do **not** assume store names — always discover first.

```
rdf_memory_stores()
→ [{ store: "project-memory", quads: 42 }, ...]
```

### Step 2 — Query the chunk index
Before fetching facts, query the meta-graph to understand what topics and sources are available. This lets you scope subsequent queries and filter by topic instead of scanning everything.

```sparql
PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?chunk ?when ?topic ?source WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
    ?chunk a mem:MemoryChunk ;
      mem:recordedAt ?when ;
      mem:source ?source .
    OPTIONAL { ?chunk dct:subject ?topic }
  }
}
ORDER BY DESC(?when)
```

### Step 3 — Explore the graph structure (before writing a domain query)
Run a discovery query to understand what subjects, classes, and properties exist across all chunks. Do **not** guess property names or IRIs.

```sparql
PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
SELECT DISTINCT ?p WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> { ?chunk a mem:MemoryChunk . }
  GRAPH ?chunk { ?s ?p ?o . FILTER(!isBLANK(?s)) }
}
ORDER BY ?p
```

### Step 4 — Query facts semantically
Traverse named individuals by type or known relationships — use string `FILTER` only as a last resort.

```sparql
-- ✅ Semantic traversal (preferred)
PREFIX schema: <https://schema.org/>
SELECT ?s ?name WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> { ?chunk a mem:MemoryChunk . }
  GRAPH ?chunk { ?s a schema:Person ; schema:name ?name . }
}

-- ❌ String matching (last resort only)
FILTER(CONTAINS(LCASE(STR(?s)), "alice"))
```

To filter by topic, join via the meta-graph:

```sparql
PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?s ?p ?o WHERE {
  GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
    ?chunk a mem:MemoryChunk ; dct:subject "people" .
  }
  GRAPH ?chunk { ?s ?p ?o . FILTER(!isBLANK(?s)) }
}
```

### Step 5 — Present results faithfully
Only state what the queried data shows. Mark anything else as *"interpretation — not stored in memory"*.

---

## Recording memory workflow

### Recording a new memory chunk

Use `rdf_memory_record`. Supply only the facts, the source, and an optional topic — **never a datetime**:

```
rdf_memory_record(
  store   = "project-memory",
  source  = "User said: Alice is 30 years old and knows Bob",
  topic   = "people",
  facts   = """
    ex:alice schema:name "Alice" ;
             schema:age  30 ;
             schema:knows ex:bob .

    << ex:alice schema:age 30 >>
      mem:confidence "high" ;
      mem:source     "User stated directly" .
  """
)
```

The tool:
1. Generates a unique chunk IRI (`mem:chunk/{id}`)
2. Stamps `mem:recordedAt` with the current UTC time
3. Wraps your facts in the chunk's named graph
4. Writes the meta-graph entry

Standard prefixes (`mem:`, `schema:`, `prov:`, `xsd:`, `dct:`, `rdf:`, `rdfs:`, `owl:`, `foaf:`, `skos:`, `vcard:`) are available in `facts` without declaration. For any other namespace, add `PREFIX` or `@prefix` lines at the top of the `facts` string — the tool hoists them outside the graph block automatically before parsing.

### Reference: query patterns

**All chunks (index) — Step 2 of recall workflow:**

```
rdf_memory_query(store="project-memory", query="
  PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
  PREFIX dct: <http://purl.org/dc/terms/>
  SELECT ?chunk ?when ?topic ?source WHERE {
    GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
      ?chunk a mem:MemoryChunk ;
        mem:recordedAt ?when ;
        mem:source ?source .
      OPTIONAL { ?chunk dct:subject ?topic }
    }
  }
  ORDER BY DESC(?when)
")
```

**Facts across all chunks:**

```
rdf_memory_query(store="project-memory", query="
  PREFIX mem:    <urn:pi-kit:linked-data:rdf-memory:>
  PREFIX schema: <https://schema.org/>
  SELECT ?s ?p ?o ?when WHERE {
    GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
      ?chunk mem:recordedAt ?when .
    }
    GRAPH ?chunk {
      ?s ?p ?o .
      FILTER(!isBLANK(?s))
    }
  }
  ORDER BY DESC(?when)
")
```

**Facts with per-fact RDF-star provenance:**

```
rdf_memory_query(store="project-memory", query="
  PREFIX mem: <urn:pi-kit:linked-data:rdf-memory:>
  SELECT ?s ?p ?o ?conf ?factSrc ?chunkSrc ?when WHERE {
    GRAPH <urn:pi-kit:linked-data:rdf-memory:meta> {
      ?chunk mem:recordedAt ?when ; mem:source ?chunkSrc .
    }
    GRAPH ?chunk {
      ?s ?p ?o .
      OPTIONAL { << ?s ?p ?o >> mem:confidence ?conf ; mem:source ?factSrc . }
      FILTER(!isBLANK(?s))
    }
  }
  ORDER BY DESC(?when)
")
```

### Deleting a specific fact

```
rdf_memory_update(store="project-memory", update="
  PREFIX schema: <https://schema.org/>
  PREFIX ex:     <http://example.org/>
  DELETE { GRAPH ?g { ex:alice schema:age ?v . } }
  WHERE  { GRAPH ?g { ex:alice schema:age ?v . } }
")
```

### Clearing a specific chunk

```
rdf_memory_drop(store="project-memory", graph="urn:pi-kit:linked-data:rdf-memory:chunk-{id}")
```

Then remove its meta entry:

```
rdf_memory_update(store="project-memory", update="
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
")
```

## Persistence model

- Data is flushed to `~/.pi/agent/rdf-memory/<store>/data.nq` after every write (atomic: `.tmp` → rename).
- The store stays warm in memory within a session — no reload cost between queries.
- RDF-star annotations survive the N-Quads round-trip.
- On `session_shutdown` all stores are flushed and closed cleanly.

## Rules

- **Never supply a datetime** — `rdf_memory_record` stamps it automatically.
- **Always supply `source`** — verbatim quote, document title, URL, or concise description of the origin.
- **Always use named graphs** via `rdf_memory_record` — never write bare triples to the default graph.
- **Use RDF-star** (`<< s p o >> mem:confidence "..." ; mem:source "..." .`) for facts with specific confidence or a source distinct from the chunk-level source.
- **Use `topic`** to tag chunks for easy filtering.
- Store names become directory names — use lowercase alphanumeric with hyphens (e.g. `project-memory`).
