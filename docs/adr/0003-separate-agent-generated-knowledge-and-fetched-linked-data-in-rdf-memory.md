# Separate agent-generated knowledge and fetched Linked Data in RDF memory

## Status

accepted

## Context and Problem Statement

The RDF memory system stores knowledge as named-graph chunks (graph IRI = generated `chunk-{id}`). When an agent fetches a Linked Data document, the quads naturally carry a fourth component — the document URL — as their graph. Storing fetched quads inside a generated chunk IRI loses that provenance: the original `?s ?p ?o ?doc` relationship is not preserved as a proper RDF quad, and `prov:wasDerivedFrom` would have to be added manually by the agent. The question arose whether `rdf_memory_record` should be extended to support document-as-graph storage, or whether a separate mechanism is more appropriate.

## Decision Drivers

* Preserve quad-level provenance (?s ?p ?o ?doc) for fetched Linked Data
* Keep the chunk system clean and focused on agent-synthesised knowledge
* Avoid polluting rdf_memory_record with fetch concerns
* Enable re-fetch / cache invalidation without disturbing agent memory chunks

## Considered Options

* Extend rdf_memory_record with an optional document IRI parameter to override the generated graph IRI
* Store fetched quads via rdf_memory_update INSERT DATA with the document URL as the named graph — no new tool
* Introduce a dedicated ld_fetch tool that fetches a Linked Data document and automatically stores quads in a document-graph store using the document URL as the named graph

## Decision Outcome

Chosen option: "Introduce a dedicated ld_fetch tool that fetches a Linked Data document and automatically stores quads in a document-graph store using the document URL as the named graph", because the fetch boundary is the right place to handle provenance — the tool can guarantee `?s ?p ?o ?doc` structurally without relying on agent convention. It keeps `rdf_memory_record` focused on agent-synthesised knowledge, enables HTTP metadata (ETag, Last-Modified) to be recorded for cache invalidation, and allows a separate memory store dedicated to fetched Linked Data so the two corpora can be queried and managed independently.

### Consequences

* Good, because Quad provenance (?s ?p ?o ?doc) is guaranteed by construction, not convention. The chunk system remains focused and unmodified. Re-fetching a document can replace or merge its graph atomically. HTTP cache metadata can be stored alongside the graph. Agent memory and fetched Linked Data can be queried and managed independently.
* Bad, because Requires implementing a new ld_fetch tool before document-graph storage is available. Until then, agents have no clean way to store fetched Linked Data with proper provenance. Two separate stores / patterns increases conceptual surface area for users.

