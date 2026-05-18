# Auto-cache SPARQL endpoint query results as named mem: chunks with provenance quads

## Status

accepted

## Context and Problem Statement

SPARQL endpoint query results are ephemeral — auto-caching them closes the same gap that ADR-0003 identified for Linked Data. The pattern applies to any remote SPARQL endpoint (Wikidata, DBpedia, a corporate triple-store, …): the source graph IRI is the endpoint URL, which makes provenance self-evident. The original SPARQL query is memorised alongside the results so it can be re-executed later to refresh stale facts. Each endpoint gets its own dedicated RDF memory store so corpora from different sources stay independently queryable and manageable.

Both the **query execution** and the **result** are first-class named nodes in the graph — not blank nodes. They are modelled as standard `mem:` chunks (indexed in `mem:meta` with `recordedAt`, `source`, and `topic`) so they appear automatically in the RDF Memory Explorer's Chunks tab and graph canvas without any special-case explorer code.

## Decision Drivers

* Preserve quad-level provenance (source graph = endpoint URL) for fetched facts, for any SPARQL endpoint
* Enable query reproducibility — the original SPARQL query is stored alongside the results
* Allow weaker LLM models to benefit from facts retrieved by stronger models in earlier sessions
* Align with the quad-provenance principle established in ADR-0003
* Keep results from different endpoints independently queryable in separate stores
* Avoid Wikidata-only scope creep — the same mechanism benefits all remote SPARQL sources
* Make query executions and results visible as **named graph nodes** when visualised — they are "things", not opaque literals on blank nodes
* Reuse the existing `mem:` chunk system rather than maintaining a parallel indexing mechanism

## Considered Options

* Do nothing — query results stay ephemeral and are lost at session end
* Let the agent manually call `rdf_memory_record` after each query
* Cache as flat blank nodes with literal `ec:query` / `ec:result` properties — simple but invisible as graph nodes
* **Auto-cache as named `mem:` chunks** — each execution becomes a standard `mem:chunk-{id}` named graph; `ec:exec-{id}` and `ec:result-{id}` are named nodes linked via `ec:hasResult`

## Decision Outcome

Chosen option: "Auto-cache as named `mem:` chunks", because it combines guaranteed provenance (named graph = endpoint URL) with full compatibility with the existing chunk infrastructure. Per-endpoint stores keep corpora cleanly separated; the store name is derived deterministically from the endpoint hostname so it is human-readable and stable. Named IRIs give each execution a stable identity that can be referenced, linked, or queried with SPARQL. No explorer-side special-casing is needed because the `mem:` chunk system already handles rendering, chunk cards, and provenance display.

### Data model

Each query execution is recorded as a standard `mem:` chunk:

```turtle
PREFIX ec:  <urn:pi-kit:linked-data:endpoint-cache:>
PREFIX mem: <urn:pi-kit:memory:>

# Chunk named graph — indexed in mem:meta
GRAPH <urn:…/chunk/{id}> {

  # The query execution — a named node, a "thing"
  ec:exec-{id}
    rdf:type      ec:QueryExecution ;
    ec:endpoint   <https://query.wikidata.org/sparql> ;
    ec:executedAt "2026-05-18T…"^^xsd:dateTime ;
    ec:queryText  "SELECT … WHERE { … }" ;
    ec:hasResult  ec:result-{id} .

  # The result — also a named node, a "thing"
  ec:result-{id}
    rdf:type    ec:QueryResult ;
    ec:content  "| col | …\n…" .
}

# Meta graph entry
GRAPH mem:meta {
  <urn:…/chunk/{id}>
    mem:recordedAt "2026-05-18T…"^^xsd:dateTime ;
    mem:source     "https://query.wikidata.org/sparql" ;
    mem:topic      "sparql-cache" .
}
```

Both `ec:QueryExecution` and `ec:QueryResult` nodes appear as distinct, clickable entities in `rdf-memory-explorer.html` (connected by an `ec:hasResult` edge) and as standard cards in the Chunks tab.

## Consequences

* Good, because provenance is guaranteed structurally (named graph = endpoint URL) for every SPARQL source — not by agent convention. Facts survive session restarts and are available to future agents or weaker LLM models. Per-endpoint stores are independently queryable and manageable. Reduces redundant live queries. Aligns with and extends the quad-provenance principle from ADR-0003.
* Good, because query executions and results appear as real, named, clickable nodes in the explorer graph. The Chunks tab shows them automatically — no parallel indexing code, no special-case rendering, no extra UI components needed.
* Bad, because cached facts can become stale without a TTL or invalidation strategy. Stores grow unboundedly without an eviction policy. The result text (which can be large) is stored as a literal on a named node with no compression or truncation strategy yet. Auto-caching every query may store irrelevant intermediate data.
