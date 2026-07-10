# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ld_fetch` tool now accepts an optional `authorization` parameter. When set, its value is forwarded as the `Authorization` HTTP header, enabling fetches from endpoints that require authentication (e.g. `Bearer <token>` or `Basic <base64>`).

### Fixed

- `rdf_write` / `parseTurtle`: relative URIs (e.g. `</contacts/jane-doe.ttl#this>`) were expanded against an `"undefined"` base because the n3 `Parser` was constructed without a `baseIRI`, leaking the literal string `"undefined"` into IRIs. `parseTurtle` now parses with `baseIRI = "#"`, which sets an empty base root so relative references survive intact. This also fixes `rdf_patch`, which reads source files through the same `parseTurtle`. An explicit `@base` in the source still overrides this.

## 0.9.1

### Fixed

- `rdf_validate` / `applyN3Rules`: N3 rules files were parsed without a `baseIRI`, causing relative URIs (e.g. `</vocab.ttl#Foo>`) to remain as bare path strings instead of resolving to `file://` IRIs. Rule antecedents never matched any data triple, making inference a no-op. Each rules file is now parsed with `baseIRI = pathToFileURL(filePath).href`, consistent with how Turtle data files have always been parsed.

## 0.9.0

### Changed

- `rdf_validate` / `validateShacl`: optional `rulesFiles` parameter — N3/Notation3 rule files can now be passed to apply forward-chaining inference before SHACL validation runs. Inferred triples are merged into the data graph so shapes that target inferred classes (e.g. via `{ ?x a ex:Widget } => { ?x a ex:Product }`) are evaluated correctly.

## 0.8.0

### Added
- `rdf_patch` tool: apply SPARQL Update operations (INSERT DATA / DELETE DATA / DELETE…INSERT…WHERE) to patch individual triples in existing Turtle files without rewriting the whole file.

## 0.7.2

### Fixed

- Find shapes starting from the git root

## 0.7.1

### Fixed

- `tsx` installation and lookup to run the standalone scripts

## 0.7.0

- `skos-concept-mentions` extension — adds `#SomeConcept` autocomplete to the pi editor. Typing `#` triggers fuzzy suggestions drawn from SKOS concepts discovered in local RDF files, mirroring the built-in `@file` mention UX. Selecting a concept from the list injects its URI and base info into the agent context for the next prompt.

- `rdf_schema_overview` tool — returns type and predicate usage counts for an rdf-memory store or a set of local RDF files in one call, so the agent discovers the actual schema before writing any SPARQL query.
- `ld_fetch` tool — dereferences a Linked Data URI, content-negotiates an RDF representation, parses it with rdflib's Fetcher (Turtle, JSON-LD, RDF/XML, N-Triples, HTML+RDFa), and stores the resulting quads in the Oxigraph `"fetched-data"` store under `GRAPH <uri>`. Re-fetching the same URI replaces the graph atomically.
- `linked-data-fetch` skill — guides the agent through the fetch → query cycle, re-fetching, metadata inspection, and link-following with `owl:sameAs` / `rdfs:seeAlso`.
- `rdf-memory` skill & tools: persist and query RDF-Star knowledge graphs across sessions
- `/rdf-memory-explorer` command: browse and inspect persisted RDF memory via a local web UI
- Auto-cache SPARQL endpoint results: every successful `sparql_query_endpoint` and `sparql_query_wikidata` call is automatically persisted to a per-endpoint RDF memory store
- `pi-kit-query` CLI — run SPARQL queries against local RDF files from the command line via `npm run query` (or `npx pi-kit-query`). Auto-discovers `.rq` and `.sparql` files for interactive selection and RDF files under the repository root; supports explicit query and data file arguments, `--format` (table, json, csv, turtle), and `--no-limit`.
- `pi-kit-validate` CLI — run SHACL validation from the command line via `npm run validate` (or `npx pi-kit-validate`). Auto-discovers `*.shacl.ttl` and `*.shapes.ttl` shapes files and RDF data files under the current directory; supports explicit `--shapes` / `--cwd` flags. Exits with code 0 on conformance and 1 on violations.

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

