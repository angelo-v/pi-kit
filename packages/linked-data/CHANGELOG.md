# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.6.1

### Fixed

- install shacl-engine explicitly

## 0.6.0

### Added

- `discover_shapes_for_class` tool — queries local SHACL files with SPARQL to find all NodeShapes that target a given class IRI via `sh:targetClass`. Auto-discovers `*.shacl.ttl` files in the workspace when no shapes files are specified explicitly.
- `rdf_validate` tool — validates one or more RDF/Turtle files against SHACL shapes files. Returns a conforms flag and a table of violations (focus node, path, message, severity). Auto-discovers `*.shacl.ttl` files in the workspace when no shapes are specified explicitly.
- `rdf-validate` skill — guides the agent to run `rdf_validate` after writing RDF data, fix all violations, and never claim conformance without having actually validated.
- `shacl_create_shape` tool — the LLM designs a SHACL NodeShape from context and writes it directly to a validated Turtle file.
- `wikidata_search` tool — resolves free-text entity or property names to Wikidata Q/P IDs via the MediaWiki `wbsearchentities` API. Eliminates the 1–3 SPARQL label-lookup round-trips previously needed before every query.

### Changed

- `sparql-query-files` skill now follows a mandatory workflow (discover files → explore structure → query semantically), mirroring the Wikidata skill's approach
- `rdf-write` skill now discovers mathing SHACL shapes and performs validation after writing 
- `sparql-query-wikidata` skill: Replace the property-exploration pattern with a three-step workflow and domain specific references. Enforce reading the skill before using the query tool.
- `sparql-query-wikidata` skill: Add Step 0 — "Search before querying" — establishing `wikidata_search` → `sparql_query_wikidata` as the standard opening move for every Wikidata session.

## 0.5.0

### Added
- `ontology-design` skill — guides the agent through designing OWL ontologies and SKOS controlled vocabularies, covering classes, properties, individuals, concept schemes, and the practical interplay between OWL and SKOS.

## 0.4.0

### Added
- Query logging for all three SPARQL tools (`sparql_query_files`, `sparql_query_endpoint`, `sparql_query_wikidata`). Each execution writes one log file to `.agents/logs/<tool-name>/<timestamp>.log` containing the input sources or endpoint URL, the full query, and the result. Logging failures are silently discarded and never affect query results.

## 0.3.0

### Added
- `rdf_write` tool — validates and writes RDF data to a file, with support for Turtle, JSON-LD, N-Triples, and N-Quads output.
- `rdf-write` skill — guides the agent to use `rdf_write` whenever writing RDF files.

## 0.2.1

### Security

- `sparql_query_files` no longer accepts file paths that point outside the workspace root.
- `sparql_query_endpoint` and `sparql_query_wikidata` now reject non-HTTP/HTTPS endpoint URLs.
- The result-count safety cap is no longer bypassed when a SPARQL query contains `LIMIT` inside a string literal or comment.

## 0.2.0

### Added
- `sparql_query_endpoint` tool — query any remote SPARQL endpoint by URL.
- `sparql_query_wikidata` tool — query the Wikidata Query Service for any real-world factual question (people,
  places, events, dates, geography, science, …)
- `sparql-query-endpoint` skill — guides the agent when querying arbitrary remote
  SPARQL endpoints.
- `sparql-query-wikidata` skill — guides the agent when querying Wikidata,
  including entity/property model, label service patterns, and multi-hop traversal.

## 0.1.0

### Added
- `sparql_query_files` tool — run SPARQL 1.1 queries against local RDF/Turtle files.
- `discover_rdf_files` tool — find all RDF/Turtle files in the workspace.
- `discover_sparql_queries` tool — find all SPARQL query files in the workspace.
- `sparql-query-files` skill — guides the agent when querying local RDF files.

